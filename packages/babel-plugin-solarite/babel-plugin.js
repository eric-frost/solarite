/**
 * babel-plugin-solarite (Tier 1b).
 *
 * Transforms JSX/TSX into the same "precompile" contract Deno emits, so esbuild/Vite/Babel/tsc
 * users get Tier 1 performance (hoisted module-level static arrays => stable identity => Solarite's
 * Shell cache and NodeGroup reuse): each element subtree becomes a hoisted `const _tpl = [...]` plus
 * `jsxTemplate(_tpl, jsxAttr(name, value), jsxEscape(child), ...)`.  Components and elements with a
 * spread attribute become `jsx(tag, props, key)` calls, routed to the same runtime's Tier 2 factory.
 *
 * The plugin needs no HTML parser: @babel/parser already parses JSX, so the job is the reverse —
 * serialize that AST back into static html strings with holes punched at the dynamic points.
 *
 * @param {{types: import('@babel/types')}} babel
 * @param {{importSource?: string}} options */
import syntaxJsx from '@babel/plugin-syntax-jsx';

export default function solariteJsx({ types: t }, options = {}) {
	const importSource = options.importSource || 'solarite/jsx-runtime';

	// HTML void elements never get a closing tag.
	const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

	const escapeText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
	const escapeAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

	// JSX whitespace cleaning (same rules React/Babel use for literal text children).
	function cleanJSXText(raw) {
		const lines = raw.split(/\r\n|\n|\r/);
		let lastNonEmpty = 0;
		for (let i = 0; i < lines.length; i++)
			if (/[^ \t]/.test(lines[i])) lastNonEmpty = i;
		let str = '';
		for (let i = 0; i < lines.length; i++) {
			let line = lines[i].replace(/\t/g, ' ');
			if (i !== 0) line = line.replace(/^ +/, '');
			if (i !== lines.length - 1) line = line.replace(/ +$/, '');
			if (line) {
				if (i !== lastNonEmpty) line += ' ';
				str += line;
			}
		}
		return str;
	}

	function tagName(node) {
		let n = node.name || node.openingElement?.name;
		if (t.isJSXIdentifier(n)) return n.name;
		if (t.isJSXNamespacedName(n)) return n.namespace.name + ':' + n.name.name;
		return null; // member expression => component
	}

	// A capitalized identifier or a member expression (Foo.Bar) is a component; lowercase/dashed
	// names (including custom-element tags like `my-button`) are intrinsic strings.
	function isComponent(node) {
		let n = node.openingElement.name;
		if (t.isJSXMemberExpression(n)) return true;
		if (t.isJSXIdentifier(n)) return /^[A-Z]/.test(n.name);
		return false;
	}

	function componentExpr(name) {
		if (t.isJSXMemberExpression(name))
			return t.memberExpression(componentExpr(name.object), t.identifier(name.property.name));
		if (t.isJSXNamespacedName(name))
			return t.stringLiteral(name.namespace.name + ':' + name.name.name);
		return t.identifier(name.name); // capitalized => references the imported component
	}

	function attrName(attr) {
		let n = attr.name;
		return t.isJSXNamespacedName(n) ? n.namespace.name + ':' + n.name.name : n.name;
	}

	function attrValueExpr(attr) {
		if (attr.value == null) return t.booleanLiteral(true);          // bare boolean attribute
		if (t.isStringLiteral(attr.value)) return attr.value;            // name="literal"
		if (t.isJSXExpressionContainer(attr.value)) return attr.value.expression;
		return attr.value;
	}

	// ---- Serializer state for one transformed root ----
	// strings: accumulated static html chunks; exprs: the hole expressions (jsxAttr/jsxEscape/jsx).
	function makeBuilder(state) {
		const strings = [];
		let current = '';
		const exprs = [];
		const used = state.used;

		const helper = name => { used.add(name); return t.cloneNode(state.ids[name]); };
		const pushHole = expr => { strings.push(current); current = ''; exprs.push(expr); };

		const api = {
			text: s => { current += s; },
			jsxAttr: (name, valueNode) => pushHole(t.callExpression(helper('jsxAttr'), [t.stringLiteral(name), valueNode])),
			jsxEscape: valueNode => pushHole(t.callExpression(helper('jsxEscape'), [valueNode])),
			finish() {
				strings.push(current);
				return { strings, exprs };
			},
			helper,
		};
		return api;
	}

	// Serialize one element's children (already inside the open tag) into the builder.
	function buildChildren(children, b, state) {
		for (const child of children) {
			if (t.isJSXText(child)) {
				const txt = cleanJSXText(child.value);
				if (txt) b.text(escapeText(txt));
			}
			else if (t.isJSXExpressionContainer(child)) {
				if (t.isJSXEmptyExpression(child.expression)) continue; // a {/* comment */}
				b.jsxEscape(child.expression); // dynamic child; inner JSX is transformed on Babel's re-visit
			}
			else if (t.isJSXSpreadChild(child)) {
				b.jsxEscape(child.expression);
			}
			else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
				if (t.isJSXElement(child) && (isComponent(child) || hasSpread(child)))
					b.jsxEscape(buildNode(child, state)); // component/spread child => its own jsx()/jsxTemplate hole
				else
					inlineElement(child, b, state); // intrinsic child => merged into the parent statics
			}
		}
	}

	function hasSpread(node) {
		return node.openingElement.attributes.some(a => t.isJSXSpreadAttribute(a));
	}

	// Inline an intrinsic element (and its subtree) directly into the parent's static strings.
	function inlineElement(node, b, state) {
		if (t.isJSXFragment(node)) {
			buildChildren(node.children, b, state);
			return;
		}
		const tag = tagName(node);
		b.text('<' + tag);
		for (const attr of node.openingElement.attributes) {
			const name = attrName(attr);
			const value = attr.value;
			if (name === 'key') { // key is always a hole; the runtime lifts it onto template.key.
				b.text(' ');
				b.jsxAttr('key', attrValueExpr(attr));
				continue;
			}
			if (value == null)                      // bare boolean attribute
				b.text(' ' + name);
			else if (t.isStringLiteral(value))      // static value
				b.text(' ' + name + '="' + escapeAttr(value.value) + '"');
			else {                                  // dynamic value => whole-attribute hole
				b.text(' ');
				b.jsxAttr(name, attrValueExpr(attr));
			}
		}
		b.text('>');
		if (!VOID.has(tag.toLowerCase())) {
			buildChildren(node.children, b, state);
			b.text('</' + tag + '>');
		}
	}

	// Build the expression a JSX node becomes (jsxTemplate(...) for intrinsic/fragment, jsx(...) for
	// components or spread elements).  Hoists the statics array to module scope.
	function buildNode(node, state) {
		if (t.isJSXElement(node) && (isComponent(node) || hasSpread(node)))
			return buildComponent(node, state);

		const b = makeBuilder(state);
		inlineElement(node, b, state);
		const { strings, exprs } = b.finish();

		// Hoist `const _tpl = [ ...static strings ]` to the top of the module.
		const id = t.identifier(state.scope.generateUid('tpl'));
		state.hoist.push(t.variableDeclaration('const', [
			t.variableDeclarator(id, t.arrayExpression(strings.map(s => t.stringLiteral(s)))),
		]));
		state.used.add('jsxTemplate');
		return t.callExpression(t.cloneNode(state.ids.jsxTemplate), [id, ...exprs]);
	}

	// Build a jsx(tag, props, key?) call for a component or spread element.
	function buildComponent(node, state) {
		const opening = node.openingElement;
		const props = [];
		let keyExpr = null;

		for (const attr of opening.attributes) {
			if (t.isJSXSpreadAttribute(attr)) {
				props.push(t.spreadElement(attr.argument));
				continue;
			}
			const name = attrName(attr);
			if (name === 'key') { keyExpr = attrValueExpr(attr); continue; }
			props.push(t.objectProperty(
				/^[a-z][\w$]*$/i.test(name) ? t.identifier(name) : t.stringLiteral(name),
				attrValueExpr(attr)));
		}

		// Children -> props.children (single child or array), each transformed.
		const kids = childExprs(node.children, state);
		if (kids.length === 1)
			props.push(t.objectProperty(t.identifier('children'), kids[0]));
		else if (kids.length > 1)
			props.push(t.objectProperty(t.identifier('children'), t.arrayExpression(kids)));

		const tagExpr = isComponent(node) ? componentExpr(opening.name) : t.stringLiteral(tagName(node));
		state.used.add('jsx');
		const args = [tagExpr, t.objectExpression(props)];
		if (keyExpr) args.push(keyExpr);
		return t.callExpression(t.cloneNode(state.ids.jsx), args);
	}

	function childExprs(children, state) {
		const out = [];
		for (const child of children) {
			if (t.isJSXText(child)) {
				const txt = cleanJSXText(child.value);
				if (txt) out.push(t.stringLiteral(txt));
			}
			else if (t.isJSXExpressionContainer(child)) {
				if (!t.isJSXEmptyExpression(child.expression)) out.push(child.expression);
			}
			else if (t.isJSXElement(child) || t.isJSXFragment(child))
				out.push(buildNode(child, state));
		}
		return out;
	}

	return {
		name: 'babel-plugin-solarite',
		// Enable JSX parsing so a bare `{ "plugins": ["babel-plugin-solarite"] }` config works on its own.
		inherits: syntaxJsx,
		visitor: {
			Program: {
				enter(path) {
					const helpers = ['jsxTemplate', 'jsxAttr', 'jsxEscape', 'jsx', 'jsxs', 'Fragment'];
					const ids = {};
					for (const h of helpers)
						ids[h] = t.identifier(path.scope.generateUid('_' + h));
					this.solarite = { ids, used: new Set(), hoist: [], scope: path.scope };
				},
				exit(path) {
					const s = this.solarite;
					if (!s.used.size) return;
					// Import only the helpers that were used.
					const specifiers = [...s.used].map(name =>
						t.importSpecifier(t.cloneNode(s.ids[name]), t.identifier(name)));
					path.unshiftContainer('body', t.importDeclaration(specifiers, t.stringLiteral(importSource)));
					// Hoist the static-template consts just after the import.
					path.node.body.splice(1, 0, ...s.hoist);
				},
			},
			JSXElement(path) {
				// Only roots: direct intrinsic JSX children are inlined by their ancestor's serializer.
				if (path.parentPath.isJSXElement() || path.parentPath.isJSXFragment()) return;
				path.replaceWith(buildNode(path.node, this.solarite));
			},
			JSXFragment(path) {
				if (path.parentPath.isJSXElement() || path.parentPath.isJSXFragment()) return;
				path.replaceWith(buildNode(path.node, this.solarite));
			},
		},
	};
}
