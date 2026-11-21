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

		//#IFDEBUG
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
	 * @return {?DocumentFragment|HTMLElement} el, or what a standalone template made. */
	'render'(el=null, options={}) {
		if (el && Globals.queuedRenders.size)
			Globals.queuedRenders.delete(el);

		let ng = el && Globals.rootNodeGroups.get(el);

		// The expressions the element holds now, when it holds this same template.
		let lastExprs = null;

		// Creating the root nodegroup also instantiates it into el.  It registers itself under
		// its own rootEl, which is the element we were given, or -- when we were given none --
		// the root it made.
		if (!ng)
			ng = new RootNodeGroup(this, null, el, options);
		else {
			let last = ng.template;

			// A component renders the same template every time, so this one comparison is all
			// that the usual render pays for the two cases below.  Hand over the expressions it
			// applied last time; paths that can prove an unchanged expression is a no-op skip.
			// Not while firstApply is set: the group has then never been applied in full, because
			// its first render threw part-way, or because this render comes from inside it (a slot
			// child whose connectedCallback renders the element), and an expression that render
			// has not reached must not be taken as already in place.  Nor after a later render that
			// threw part-way (threw), which left the paths it reached holding its expressions and
			// the rest holding older ones than last's; this render clears the mark.
			if (last.html === this.html) {
				if (ng.threw)
					ng.threw = false;
				else if (last !== this && !ng.firstApply)
					lastExprs = last.exprs;
			}

			// Another template than the one the element holds, such as a list where a loading
			// message was.  Its expressions mean nothing to the paths of the old one, so the old
			// template is taken out and the render starts over, on an element that is as it
			// was before its first render.  Only a difference in the html itself counts.  Another
			// array holding the same strings has the same paths, and its expressions are applied to
			// the content the element holds, which stays: that is a template made from a string
			// (h('<b>Hi</b>')) or by code that builds the array for each render, and the same
			// literal written at two places.  The strings are compared in a function of their own
			// so that this one, which every render of every component runs, stays short and
			// creates nothing.
			else if (!sameStrings(last.html, this.html)) {
				ng.unrender();
				return this.render(el, options);
			}
		}

		try {
			ng.applyExprs(this.exprs, true, lastExprs);
		}
		catch (e) {
			ng.threw = true;
			throw e;
		}
		ng.template = this;

		// A standalone template returns the node it made, which is read only now that the
		// expressions are applied.  It is the group's root, except for a template whose only
		// node is a component: the component is constructed while its attribute expressions
		// are applied, and takes the place of the placeholder that stood for it until then.
		return el || ng.startNode;
	}

	getCloseKey() {
		// Use the joined html when debugging?  But it breaks some tests.
		//return '@'+this.html.join('|')
		return this.closeKey ??= this.exprs.length ? getObjectId(this.html) : this.html[0];
	}

}


/**
 * Do two arrays of html hold the same strings?  Used when the arrays are not the same array, to
 * tell a template that only looks new from one that is.
 *
 * This is Util.arraySame() over again, written exactly as that one is so that the two compress
 * as one.  It is a function of its own all the same, because the engine keeps what it has
 * learned about a function's arguments with the function.  Util.arraySame() is only ever given
 * arrays of nodes, which it compares at the speed of a pointer test.  Given the frozen arrays
 * of strings of a root that changes template a few times, it compares every array more slowly
 * for the rest of the page's life: a list of raw nodes then renders about a tenth slower
 * (measured in Chrome 154, 2026-10-02).
 * @param a {string[]}
 * @param b {string[]}
 * @return {boolean} */
function sameStrings(a, b) {
	let aLength = a.length;
	if (aLength !== b.length)
		return false;
	for (let i=0; i<aLength; i++)
		if (a[i] !== b[i])
			return false;
	return true;
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
		// Most expressions are identical between renders, so test that here rather than paying
		// a call into exprSame() to learn it.
		for (let i=0; i<ae.length; i++) {
			let x = ae[i], y = be[i];
			if (x !== y && !exprSame(x, y))
				return false;
		}
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
 * Used by PathToComponent for the hasChanged() function it passes to a component's render().
 * Plain JSON drops functions, writes every Node as {}, and throws on a cycle.  So the replacer, which JSON.stringify()
 * calls for every value, writes an id in place of each function, Node, and repeated or circular object, and a Template
 * as the id of its html with its exprs.
 * @param obj {*}
 * @returns {string} */
export function getObjectHash(obj) {
	let seen = new Set();
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
 * The string getObjectHash() gives for a component's exprs, made faster when the data allows it.
 *
 * Most of getObjectHash()'s time is the browser calling its replacer for every value, not the work the replacer does.
 * And since V8 13.8 (Chrome 138), JSON.stringify() without a replacer takes a much faster path for plain data.  So the
 * data is first walked here, and if it holds nothing the replacer would change, the browser serializes it alone.  For
 * 10,000 rows of plain objects that is 2.8ms instead of 5.2ms.
 *
 * A function or Node given straight to an attribute, as in onSave=${fn}, is common, so those are replaced here with the
 * same id the replacer would write.  Not one with a toJSON() of its own though:  JSON.stringify() calls that first and
 * hands the replacer its result, so it's left for isPlainData() to send to getObjectHash().  Anything else the replacer
 * would change sends the caller to getObjectHash() too.
 *
 * Two cases can still give a different string than getObjectHash(), both contrived enough to leave alone:
 * 1. A Date whose toISOString() was replaced to return an object, or a plain object that borrows Date.prototype.toJSON,
 *    since isPlainData() trusts that toJSON() to give a string.
 * 2. A getter, or a Proxy trap, whose value changes between the walk's read and JSON.stringify()'s read.
 * @param exprs {Expr[][]} One array of values for each attribute.
 * @return {string|undefined} Undefined when the data needs getObjectHash(). */
export function getPlainHash(exprs) {
	let top = exprs.map(values => values.map(value =>
		(typeof value === 'function' || value instanceof Node) && !value.toJSON ? getObjectId(value) : value));
	try {
		if (isPlainData(top, new Set()))
			return JSON.stringify(top);
	}
	catch {
		// Data nested so deep that a recursion overflowed, and that can happen on either side.  In JavaScriptCore
		// (Safari) the walk overflows first, since its JSON.stringify() goes much deeper.  In SpiderMonkey (Firefox)
		// the JSON.stringify() above overflows first.  In V8 the walk usually goes deeper than getObjectHash()'s
		// replacer, but not always once the page has deoptimized it.  Either way getObjectHash() then decides what
		// happens to such data, so this answers whenever getObjectHash() would.  The same goes for a Proxy whose trap
		// throws when the walk looks at it, which getObjectHash() never does.
	}
}

/**
 * Whether JSON.stringify() writes value the same way with and without getObjectHash()'s replacer:  nothing in it is a
 * function, Node, Template, repeated or circular object, or an object with a toJSON() of its own.  A Date's toJSON()
 * gives a string, which the replacer leaves alone.
 * @param value {*}
 * @param seen {Set<Object>} Every object found so far, which finds the repeated and circular ones.
 * @return {boolean} */
function isPlainData(value, seen) {
	if (typeof value !== 'object')
		return typeof value !== 'function';
	if (value === null)
		return true;
	if (seen.has(value) || value instanceof Node || value instanceof Template)
		return false;
	seen.add(value);
	if (typeof value.toJSON === 'function')
		return value.toJSON === Date.prototype.toJSON;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++)
			if (!isPlainData(value[i], seen))
				return false;
		return true;
	}
	for (let v of Object.values(value)) // The values JSON.stringify() writes:  own, enumerable, string keys.
		if (!isPlainData(v, seen))
			return false;
	return true;
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
