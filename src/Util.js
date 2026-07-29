import Globals from "./Globals.js";
import delve from "./delve.js";

let Util = {

	/**
	 * Returns true if they're the same.
	 * @param a
	 * @param b
	 * @returns {boolean} */
	arraySame(a, b) {
		let aLength = a.length;
		if (aLength !== b.length)
			return false;
		for (let i=0; i<aLength; i++)
			if (a[i] !== b[i])
				return false;
		return true; // the same.
	},

	/**
	 * Convert HTMLElement attributes to an object.
	 * Converts dash (kebob-case) attribute names to camelCase.
	 * See also Solarite.getAttribs()
	 * @param el {HTMLElement}
	 * @param ignore {?string} Optionally ignore this attribute.
	 * @return {Object} */
	attribsToObject(el, ignore=null) {
		let result = {};
		for (let attrib of el.attributes)
			if (attrib.name !== ignore)
				result[Util.dashesToCamel(attrib.name)] = attrib.value;
		return result;
	},

	bindId(root, el) {
		let id = el.getAttribute('data-id') || el.getAttribute('id');
		if (id) { // If something hasn't removed the id.

			// Don't clobber a non-element value.  For a simple (non-nested) id this covers two cases:
			// an inherited/built-in property like `title` or `style`, or an own property that already
			// holds a non-Node value.  A previously-bound element (a Node) is fine to re-assign.
			// This can only fail on a mistake in the component's own template, so a developer meets it
			// the first time the component renders and never again at runtime.  It's therefore dev-only,
			// and stripped from the minified build to keep the id binding small.
			if (!id.includes('.')) {
				let existing = root[id];
				let isInherited = (id in root) && !Object.hasOwn(root, id);
				if (!existing?.nodeType && (existing != null || isInherited))
					throw new Error(`Solarite: id="${id}" would overwrite an existing ${root.constructor.name} property.`);
			}

			delve(root, id.split(/\./g), el);
		}
	},

	/**
	 * If the style tab has a global attribute:
	 * 1.  Put it in the document head as <style data-style="tag-name">...</style>
	 * 2.  Replace the :host {...} CSS selector as tag-name {...}.
	 * Otherwise keep it where it is and:
	 * 1.  Add data-style="1" attribute to the root element.
	 * 2.  Replace the :host {...} selector in the style as tag-name[data-style='1'] {...}
	 * @param style {HTMLStyleElement}
	 * @param root {HTMLElement} */
	bindStyles(style, root) {

		let tagName = root.tagName.toLowerCase();
		let styleId, attribSelector;

		if (style.hasAttribute('global') || style.hasAttribute('data-global')) {
			styleId = tagName;
			attribSelector = '';
			let doc = Globals.doc || root.ownerDocument || document;
			if (!doc.head.querySelector(`style[data-style="${styleId}"]`)) {
				doc.head.append(style)
				style.setAttribute('data-style', styleId);
			}
			else // TODO: Make sure the style has no expressions.
				style.remove(); // already in the head.
		}
		else {
			let styleId = root.getAttribute('data-style');
			if (!styleId) {
				// Keep track of one style id for each class.
				// TODO: Put this outside the class in a map, so it doesn't conflict with static properties.
				if (!root.constructor.styleId)
					root.constructor.styleId = 1;
				styleId = root.constructor.styleId++;

				root.setAttribute('data-style', styleId);
			}

			attribSelector = `[data-style="${styleId}"]`;
		}

		// Replace ":host" with "tagName[data-style=...]" in the css.
		for (let child of style.childNodes) {
			if (child.nodeType === 3) {
				let oldText = child.textContent;

				// One pass rewrites both forms of the selector:
				// 1.  The functional form ':host(X)' — the host element when it also matches X — unwraps
				//     so X sits right after the scoped name:  tag[data-style="1"]X.  X may hold one
				//     nested group like ':not(.open)'; deeper parentheses can't be paired by a regex,
				//     so such an X is left as written rather than half-rewritten into a selector the
				//     browser would discard silently.
				// 2.  Plain ':host'.  The lookahead turns down longer names (':host-context') and '(',
				//     which only follows ':host' when alternative 1 already gave up on it, and accepts
				//     the end of the text node, where an expression may have split a dynamic style.
				let newText = oldText.replace(
					/:host(?:\(((?:[^()]|\([^()]*\))*)\)|(?![-a-z0-9_(]))/gi,
					`${tagName}${attribSelector}$1`);
				if (oldText !== newText)
					child.textContent = newText;
			}
		}
	},

	/**
	 * Convert a Proper Case name to a name with dashes.
	 * Dashes will be placed between letters and numbers.
	 * If there are multiple consecutive capital letters followed by another chracater, a dash will be placed before the last capital letter.
	 * @param str {string}
	 * @return {string}
	 *
	 * @example
	 * 'ProperName' => 'proper-name'
	 * 'HTMLElement' => 'html-element'
	 * 'BigUI' => 'big-ui'
	 * 'UIForm' => 'ui-form'
	 * 'A100' => 'a-100' */
	camelToDashes(str) {
		// One pass finds all three dash positions.  Each alternative matches only the character
		// *before* the boundary and uses a lookahead for what follows, so the following character
		// is never consumed and can still start the next boundary.  That's what lets the three
		// rules interleave in a single scan the way three sequential replaces used to:
		// 1.  a lowercase letter or digit before a capital ('ProperName').
		// 2.  a capital before a capital+lowercase pair, i.e. the last capital of a run ('HTMLElement').
		// 3.  a letter before a digit ('A100').
		// '$&-' appends the dash after the matched character, then everything folds to lowercase.
		return str.replace(/[a-z0-9](?=[A-Z])|[A-Z](?=[A-Z][a-z])|[a-zA-Z](?=\d)/g, '$&-').toLowerCase();
	},

	/**
	 * Converts a string written in kebab-case to camelCase.
	 *
	 * @param {string} str - The input string written in kebab-case.
	 * @return {string} - The resulting camelCase string.
	 *
	 * @example
	 * dashesToCamel('example-string') // Returns 'exampleString'
	 * dashesToCamel('another-example-test') // Returns 'anotherExampleTest' */
	dashesToCamel(str) {
		return str.replace(/-([a-z])/g, g => g[1].toUpperCase());
	},

	/**
	 * Register Class as a custom element, unless it's registered already.
	 * @param Class {typeof HTMLElement}
	 * @param tagName {?string} Name to register under.  Defaults to the dashed form of the class name.
	 * @return {string} The tag name Class is registered under, whether we just registered it or it
	 *     was already in the registry under some other name.  Callers that emit markup for the class
	 *     use this instead of re-deriving the name, which guesses wrong for any class registered
	 *     under a name that isn't camelToDashes(Class.name). */
	defineClass(Class, tagName) {
		let defined = customElements[getName](Class);
		if (defined) // Previously defined.
			return defined;

		tagName = tagName || Util.camelToDashes(Class.name)
		if (!tagName.includes('-')) // Browsers require that web components always have a dash in the name.
			tagName += '-element';
		customElements[define](tagName, Class)
		return tagName;
	},

	/**
	 * Get the value of an input as the most appropriate JavaScript type.
	 * @param node {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLElement}
	 * @return {string|string[]|number|[]|File[]|Date|boolean} */
	getInputValue(node) {
		// .type is a built-in DOM property
		if (node.type === 'checkbox')
			return node.checked; // Boolean
		if (node.type === 'radio')
			return node.value; // String value of the selected radio in the group
		if (node.type === 'file')
			return [...node.files]; // FileList
		if (node.type === 'number' || node.type === 'range')
			return node.valueAsNumber; // Number
		if (node.type === 'date' || node.type === 'time' || node.type === 'datetime-local')
			return node.valueAsDate; // Date Object
		if (node.type === 'select-multiple') // <select multiple>
			return [...node.selectedOptions].map(option => option.value); // Array of Strings
		if (node.hasAttribute('contenteditable'))
			return node.innerHTML;

		return node.value; // String
	},

	isEvent(attrName) {
		return attrName.startsWith('on') && attrName in Globals.div;
	},

	/**
	 * @param el {HTMLElement}
	 * @param prop {string}
	 * @returns {boolean} */
	isHtmlProp(el, prop) {
		let key = el.tagName + '.' + prop;
		let result = Globals.htmlProps[key];
		if (result === undefined) { // Caching just barely makes this slightly faster.
			let proto = Object.getPrototypeOf(el);

			// Find the first HTMLElement that we inherit from (not our own classes)
			while (proto) {
				const ctorName = proto.constructor.name;
				if (ctorName.startsWith('HTML') && ctorName.endsWith('Element'))
					break
				proto = Object.getPrototypeOf(proto);
			}
			Globals.htmlProps[key] = result = (proto
				? !!Object.getOwnPropertyDescriptor(proto, prop)?.set
				: false);
		}
		return result;
	},

	isFalsy(val) {
		return val === undefined || val === false || val === null;
	},

	/**
	 * Split a string like 'foo="bar" baz=123' into an object like {foo: 'bar', baz: '123'}.
	 * @param str {string}
	 * @returns {Object} */
	splitAttribs(str) {
		let result = {};

		// One scan collects every name and its value.  The value is optional so a boolean attribute
		// written on its own ('disabled') still lands in the result with an empty value, and the three
		// value alternatives capture *inside* the quotes so no separate quote-trimming pass is needed.
		// Whatever doesn't look like an attribute name is skipped rather than becoming a bogus key.
		(str + '').replace(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g,
			(_, name, dq, sq, bare) => result[name] = dq ?? sq ?? bare ?? '');

		return result;
	},

	/*
	isPrimitive(val) {
		return typeof val === 'string' || typeof val === 'number'
	},*/

	/**
	 * If val is a function, evaluate it recursively until the result is not a function.
	 * If it's an array or an object, convert it to Json.
	 * If it's a Date, format it as Y-m-d H:i:s
	 * @param val
	 * @returns {string|number|boolean} */
	makePrimitive(val) {
		if (typeof val === 'function')
			return Util.makePrimitive(val());
		else if (val instanceof Date)
			return val.toISOString().replace(/T/, ' ');
		else if (Array.isArray(val) || typeof val === 'object')
			return ''; // JSON.stringify(val);
		return val;
	},

	saveOrphans(nodes) {
		let fragment = Globals.doc.createDocumentFragment();
		fragment.append(...nodes);
	},

	/**
	 * Remove nodes from the beginning and end that are not:
	 * 1.  Elements.
	 * 2.  Non-whitespace text nodes.
	 * @param nodes {Node[]|NodeList}
	 * @returns {Node[]} */
	trimEmptyNodes(nodes) {
		// nodeType 1 is an element and 3 is a text node; the literals are what Node.ELEMENT_NODE
		// and Node.TEXT_NODE are defined as, and they cost a fraction of the bytes.
		let isEmpty = node => node.nodeType !== 1 && (node.nodeType !== 3 || !node.textContent.trim());

		let result = [...nodes]; // A NodeList can't shift() or pop().
		while (result.length && isEmpty(result[0]))
			result.shift();
		while (result.length && isEmpty(result[result.length - 1]))
			result.pop();

		return result;
	}
};



// Trick to prevent minifier from renaming these methods.
let define = 'define';
let getName = 'getName';

export default Util;



// For debugging only
//#IFDEBUG
export function setIndent(items, level=1) {
	if (typeof items === 'string')
		items = items.split(/\r?\n/g)

	return items.map(str => {
		if (level > 0)
			return '  '.repeat(level) + str;
		else if (level < 0)
			return str.replace(new RegExp(`^  {0,${Math.abs(level)}}`), '');
		return str;
	})
}

export function nodeToArrayTree(node, callback=null) {
	if (!node) return [];

	let result = [];

	if (callback)
		result.push(...callback(node))

	if (node.nodeType === 1) {
		let attrs = Array.from(node.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ');
		let openingTag = `<${node.nodeName.toLowerCase()}${attrs ? ' ' + attrs : ''}>`;

		let childrenArray = [];
		for (let child of node.childNodes) {
			let childResult = nodeToArrayTree(child, callback);
			if (childResult.length > 0) {
				childrenArray.push(childResult);
			}
		}

		//let closingTag = `</${node.nodeName.toLowerCase()}>`;

		result.push(openingTag, ...childrenArray);
	} else if (node.nodeType === 3) {
		result.push("'"+node.nodeValue+"'");
	}

	return result;
}


export function flattenAndIndent(inputArray, indent = "") {
	let result = [];

	for (let item of inputArray) {
		if (Array.isArray(item)) {
			// Recursively handle nested arrays with increased indentation
			result = result.concat(flattenAndIndent(item, indent + "  "));
		} else {
			result.push(indent + item);
		}
	}

	return result;
}
//#ENDIF