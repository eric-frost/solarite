import assert from "./assert.js";
import Globals from "./Globals.js";
import RootNodeGroup from "./RootNodeGroup.js";

let lastObjectId = 1;
let objectIds = new WeakMap();

/**
 * Get a short string id unique to the given object, for use as a map key.
 * @param obj {Object}
 * @returns {string} */
function getObjectId(obj) {
	let result = objectIds.get(obj);
	if (result === undefined) {
		result = '~@' + (lastObjectId++); // Unique 2-byte prefix so it can't collide with html-string keys.
		objectIds.set(obj, result);
	}
	return result;
}

/**
 * The html strings and evaluated expressions from an html tagged template.
 * A unique Template is created for each item in a loop.
 * Although the reference to the html strings is shared among templates. */
export default class Template {

	/** @type {Expr[]} Evaulated expressions.  Assigned by the constructor. */
	'exprs' = undefined;

	/** @type {string[]} Assigned by the constructor. */
	'html' = undefined;

	closeKey;

	isText;

	/** @type {*} List key for keyed diffing, set by JSX jsxTemplate()/jsxToTemplate() from a
	 * `key` prop.  Tagged templates instead carry their key as an expr at Shell.keyIndex; the
	 * keyed reconciler (PathToNodes) reads whichever is present. */
	key;

	/** @type {boolean} True if created by the svg`` tag; the Shell parses the html in the SVG namespace. */
	svgMode = false;

	/**
	 *
	 * @param htmlStrings {string[]}
	 * @param exprs {*[]} */
	constructor(htmlStrings=[''], exprs=[]) {
		this.html = htmlStrings;

		this.exprs = exprs;

		//this.trace = new Error().stack.split(/\n/g)

		//#IFDEV
		assert(Array.isArray(htmlStrings))
		assert(Array.isArray(exprs))

		Object.defineProperty(this, 'debug', {
			get() {
				return JSON.stringify([this.html, this.exprs]);
			}
		})
		//#ENDIF
	}

	/**
	 * Render the main (root) template.
	 * @param el {?HTMLElement} Null if we're rendering to a standalone element.
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} */
	'render'(el=null, options={}) {



		let ng = el && Globals.rootNodeGroups.get(el);
		if (!ng) {
			ng = new RootNodeGroup(this, null, el, options);
			if (!el) // null if it's a standalone elment.
				el = ng.getRootNode();
			Globals.rootNodeGroups.set(el, ng); // All tests still pass if this is commented out!
		}

		// Make sure the expresion count matches match the Path "hole" count.
		// This can happen if we try manually rendering one template to a NodeGroup that was created expecting a different template.
		// These don't always have the same length, for example if one attribute has multiple expressions.
		// if (ng.paths.length === 0 && this.exprs.length || ng.paths.length > this.exprs.length)
		// 	throw new Error(
		// 		`Solarite Error:  Parent HTMLElement ${ng.template.html.join('${...}')} and ${ng.paths.length} \${value} ` +
		// 		`placeholders can't accomodate a Template with ${this.exprs.length} values.`);

		// Creating the root nodegroup also renders it.
		// If we didn't just create it, we need to render it.
		if (this.html?.length === 1 && !this.html[0]) // An empty string.
			el.innerHTML = ''; // Fast path for empty component.
		else
			ng.applyExprs(this.exprs);

		return el;
	}

	getCloseKey() {
		if (this.closeKey===undefined) {
			if (this.exprs.length)
				this.closeKey = getObjectId(this.html);
			else
				this.closeKey = this.html[0];
		}
		// Use the joined html when debugging?  But it breaks some tests.
		//return '@'+this.html.join('|')

		return this.closeKey;
	}

}


/**
 * Do two templates produce identical content?
 * Compares expression values by identity, so no hashing or stringification is needed.
 * @param a {Template}
 * @param b {Template}
 * @return {boolean} */
export function templatesSame(a, b) {
	if (a.html === b.html && a.svgMode === b.svgMode) {
		let ae = a.exprs, be = b.exprs;
		for (let i=0; i<ae.length; i++)
			if (!exprSame(ae[i], be[i]))
				return false;
		return true;
	}

	// Text and other single-string templates get a new html array each time, so compare by content.
	if (a.isText === b.isText && !a.exprs.length && !b.exprs.length
		&& a.html.length === 1 && b.html.length === 1 && a.svgMode === b.svgMode)
		return a.html[0] === b.html[0];

	return false;
}

/**
 * Get a string that changes when any value inside obj changes, including deep mutations.
 * Used by PathToComponent to compute the `changed` argument to component render() calls.
 * Functions, Nodes, and repeated/circular objects are represented by identity ids.
 * @param obj {*}
 * @returns {string} */
export function getObjectHash(obj) {
	const seen = new Set();
	return JSON.stringify(obj, (key, value) => {
		if (typeof value === 'function')
			return getObjectId(value);
		if (typeof value === 'object' && value !== null) {
			if (value instanceof Node)
				return getObjectId(value);
			if (seen.has(value))
				return getObjectId(value);
			seen.add(value);
			if (value instanceof Template)
				return {html: getObjectId(value.html), exprs: value.exprs}; // Don't hash long html strings.
		}
		return value;
	});
}

/**
 * @return {boolean} */
export function exprSame(a, b) {
	if (a === b)
		return true;
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length)
			return false;
		for (let i=0; i<a.length; i++)
			if (!exprSame(a[i], b[i]))
				return false;
		return true;
	}
	if (a instanceof Template && b instanceof Template)
		return templatesSame(a, b);
	return false;
}


/**
 * @typedef {Object} RenderOptions
 * @property {boolean=} styles - Replace :host in style tags to scope them locally.
 * @property {boolean=} scripts - Execute script tags.  Requires a CSP that allows unsafe-eval.
 * @property {boolean=} ids - Create references to elements with id or data-id attributes.
 * @property {?boolean} render - Deprecated.
 * 	 Used only when options are given to a class super constructor inheriting from Solarite.
 *     True to call render() immediately in super constructor.
 *     False to automatically call render() at all.
 *     Undefined (default) to call render() when added to the DOM, unless already rendered.
 */
