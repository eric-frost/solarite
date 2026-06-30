import Template from "./Template.js";
import Util from "./Util.js";

/**
 * JSX support for Solarite.  Two tiers share this one module:
 *
 * Tier 1 (precompile): a build step (Deno's `jsx:"precompile"` or a Solarite build plugin) hoists
 *   each element's static HTML into a module-level array and emits
 *   `jsxTemplate(statics, jsxAttr(name, value), jsxEscape(child), ...)`.  Stable array identity maps
 *   straight onto Template => Shell cache, closeKey, and NodeGroup reuse all work; perf equals tagged
 *   templates.  jsxTemplate/jsxAttr/jsxEscape live in jsx-runtime.js; the JsxAttr class below is the
 *   whole-attribute hole they produce.
 *
 * Tier 2 (classic/automatic factory): tsc/esbuild/Vite emit `h(tag, props, ...children)` or
 *   `jsx(tag, props, key)` with no hoisting.  jsxToTemplate() interns the static HTML per
 *   (tag, prop-names, child-count) shape so identity is stable per call site even though a new
 *   Template is built each render.  Every prop value and child is an expression hole, never diffed
 *   as static. */

// Fragment for <>...</> in the classic/automatic factories.  Tier 1 fragments need no import.
export const Fragment = Symbol('Fragment');

/**
 * A whole-attribute hole from Tier 1, e.g. `<a ` + jsxAttr("href", v) + `>`.  It lands at a
 * PathToAttribs hole (a bare ${} between attributes); PathToAttribs detects this class and routes
 * the value through the normal attribute/event/property application. */
export class JsxAttr {
	constructor(name, value) {
		this.name = name;
		this.value = value;
	}
}

const selfClosingTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

// Tier 2 shape cache: `tag\0name1\0name2\0#childCount` => htmlStrings array (stable identity).
const shapeCache = new Map();

/**
 * Serialize a style object to css text.  {color:'red', fontSize:'1px'} => 'color:red;font-size:1px'.
 * A string passes through unchanged.
 * @param value {Object|string}
 * @return {string} */
export function styleToCss(value) {
	if (value === null || typeof value !== 'object')
		return value;
	let css = '';
	for (let k in value) {
		let v = value[k];
		if (v === null || v === undefined || v === false)
			continue;
		css += (css ? ';' : '') + Util.camelToDashes(k) + ':' + v;
	}
	return css;
}

/** Escape a static attribute value for inlining into the html string. */
function escapeAttr(value) {
	return ('' + value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Build the interned htmlStrings for a Tier 2 element shape, matching how a tagged template would
 * split `<tag openStatic name1=${} name2=${}>${child0}${child1}</tag>`.
 * @param tag {string}
 * @param openStatic {string} Static attributes inlined into the opening tag (e.g. ` id="x"`).
 * @param names {string[]} Dynamic attribute names in order.
 * @param childCount {int}
 * @param isVoid {boolean}
 * @return {string[]} */
function buildShapeHtml(tag, openStatic, names, childCount, isVoid) {
	let strings = [];
	let cur = '<' + tag + openStatic;
	for (let name of names) {
		strings.push(cur + ' ' + name + '=');
		cur = '';
	}
	cur += '>';
	if (isVoid) {
		strings.push(cur);
		return strings;
	}
	if (childCount === 0)
		strings.push(cur + '</' + tag + '>');
	else {
		strings.push(cur);
		for (let i = 1; i < childCount; i++)
			strings.push('');
		strings.push('</' + tag + '>');
	}
	return strings;
}

/**
 * Build a Template for a Tier 2 (classic/automatic) JSX element.
 * @param tag {string|Function|symbol} Intrinsic tag name, component class/function, or Fragment.
 * @param props {?Object} Attributes/props (children and key are pulled out by the caller for the
 *     automatic runtime; for the classic factory they may still be present and are stripped here).
 * @param children {any[]} One hole per child.
 * @param key {*} Optional list key (automatic runtime passes it separately).
 * @return {Template} */
export function jsxToTemplate(tag, props, children=[], key=undefined) {
	props = props || {};

	// 1. Fragment: only child holes, no element wrapper.
	if (tag === Fragment) {
		let html = [''];
		for (let i = 0; i < children.length; i++)
			html.push('');
		return new Template(html, children);
	}

	// 2. Component (class or function).
	if (typeof tag === 'function') {

		// 2a. Custom element class => emit <tag-name ...props>children</tag-name>; PathToComponent
		// instantiates it exactly like a tagged-template component.
		if (tag.prototype instanceof HTMLElement) {
			Util.defineClass(tag);
			let tagName = customElements.getName ? customElements.getName(tag) : Util.camelToDashes(tag.name);
			if (tagName && !tagName.includes('-'))
				tagName += '-element';
			return buildIntrinsic(tagName, props, children, key);
		}

		// 2b. Plain function component: call it with props (+ children) and expect a Template back.
		let p = {};
		for (let name in props)
			if (name !== 'key')
				p[name] = name === 'style' ? styleToCss(props[name]) : props[name];
		if (!('children' in p) && children.length)
			p.children = children.length === 1 ? children[0] : children;
		let t = tag(p);
		if (key === undefined)
			key = props.key;
		if (key !== undefined && t instanceof Template)
			t.key = key;
		return t;
	}

	// 3. Intrinsic element.
	return buildIntrinsic(tag, props, children, key);
}

/**
 * @param tag {string}
 * @param props {Object}
 * @param children {any[]}
 * @param key {*}
 * @return {Template} */
function buildIntrinsic(tag, props, children, key) {
	let isVoid = selfClosingTags.has(tag.toLowerCase());
	let names = [];
	let values = [];
	let openStatic = ''; // Static id/data-id inlined so their embeds (this.x references) resolve.

	for (let name in props) {
		if (name === 'children') // The automatic runtime stashes children here; they're passed separately.
			continue;
		if (name === 'key') {
			if (key === undefined)
				key = props[name];
			continue;
		}
		let value = props[name];

		// id/data-id reference embeds only work when the attribute is static in the html, so inline
		// string-valued ones (the usual case) instead of making them holes.  Tier 1 transforms
		// already inline static attributes; this keeps the Tier 2 classic factory on par.
		if ((name === 'id' || name === 'data-id') && typeof value === 'string') {
			openStatic += ` ${name}="${escapeAttr(value)}"`;
			continue;
		}

		if (name === 'style')
			value = styleToCss(value);
		names.push(name);
		values.push(value);
	}

	let childCount = isVoid ? 0 : children.length;
	let shapeKey = tag + openStatic + '\0' + names.join('\0') + '\0#' + childCount;
	let html = shapeCache.get(shapeKey);
	if (!html) {
		html = buildShapeHtml(tag, openStatic, names, childCount, isVoid);
		shapeCache.set(shapeKey, html);
	}

	let exprs = isVoid ? values : values.concat(children);
	let t = new Template(html, exprs);
	if (key !== undefined)
		t.key = key;
	return t;
}
