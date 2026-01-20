import {assert} from "./assert.js";
import {getObjectHash, getObjectId} from "./hash.js";
import Globals from "./Globals.js";
import RootNodeGroup from "./RootNodeGroup.js";

/**
 * The html strings and evaluated expressions from an html tagged template.
 * A unique Template is created for each item in a loop.
 * Although the reference to the html strings is shared among templates. */
export default class Template {

	/** @type {(Template|string|function)|(Template|string|function)[]} Evaulated expressions.  */
	exprs = []

	/** @type {string[]} */
	html = [];

	/** @type {Array} Used for toJSON() and getObjectHash().  Stores values used to quickly create a string hash of this template. */
	hashedFields;

	isText;

	/**
	 *
	 * @param htmlStrings {string[]}
	 * @param exprs {*[]} */
	constructor(htmlStrings, exprs) {
		this.html = htmlStrings;
		this.exprs = exprs;

		//this.trace = new Error().stack.split(/\n/g)

		// Multiple templates can share the same htmlStrings array.
		//this.hashedFields = [getObjectId(htmlStrings), exprs]

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
	 * Called by JSON.serialize when it encounters a Template.
	 * This prevents the hashed version from being too large. */
	toJSON() {
		if (this.hashedFields===undefined)
			this.hashedFields = [getObjectId(this.html), this.exprs];

		return this.hashedFields
	}

	/**
	 * Render the main (root) template.
	 * @param el {?HTMLElement} Null if we're rendering to a standalone element.
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} */
	render(el=null, options={}) {
		let firstTime = false;


		let ng = el && Globals.rootNodeGroups.get(el);
		if (!ng) {
			ng = new RootNodeGroup(this, null, el, options);
			if (!el) // null if it's a standalone elment.
				el = ng.getRootNode();
			Globals.rootNodeGroups.set(el, ng); // All tests still pass if this is commented out!
			firstTime = true;
		}

		// Make sure the expresion count matches match the exprPath "hole" count.
		// This can happen if we try manually rendering one template to a NodeGroup that was created expecting a different template.
		// These don't always have the same length, for example if one attribute has multiple expressions.
		if (ng.paths.length === 0 && this.exprs.length || ng.paths.length > this.exprs.length)
			throw new Error(
				`Solarite Error:  Parent HTMLElement ${ng.template.html.join('${...}')} and ${ng.paths.length} \${value} ` +
				`placeholders can't accomodate a Template with ${this.exprs.length} values.`);

		// Creating the root nodegroup also renders it.
		// If we didn't just create it, we need to render it.
		if (this.html?.length === 1 && !this.html[0]) // An empty string.
			el.innerHTML = ''; // Fast path for empty component.
		else {
			ng.applyExprs(this.exprs);
			ng.exactKey = this.getExactKey();

			if (firstTime)
				ng.instantiateStaticComponents(ng.staticComponents);
		}

		ng.exprsToRender = new Map();
		return el;
	}

	getExactKey() {
		if (this.exactKey===undefined) {
			if (this.exprs.length)
				this.exactKey = getObjectHash(this);// calls this.toJSON().
			else // Don't hash plain html.
				this.exactKey = this.html[0];
		}
		return this.exactKey;
	}

	getCloseKey() {
		//console.log(this.exprs.length)
		if (this.closeKey===undefined) {
			if (this.exprs.length)
				this.closeKey = /*'@' + */this.toJSON()[0];
			else
				this.closeKey = this.html[0];
		}
		// Use the joined html when debugging?  But it breaks some tests.
		//return '@'+this.html.join('|')

		return this.closeKey;
	}

	/**
	 * @param tag {string}
	 * @param props {?Record<string, any>}
	 * @param children
	 * @returns {Template} */
	static fromJsx(tag, props, children) {

		// HTML void elements that must not have closing tags
		const isVoid = selfClosingTags.has(tag.toLowerCase());

		// Build htmlStrings/exprs so Shell can place placeholders in attribute values and child content.
		let htmlStrings = [];
		let templateExprs = [];

		// Opening tag
		let open = `<${tag}`;

		// Attributes
		if (props && typeof props === 'object') {
			for (let name in props) {
				let value = props[name];

				// id and data-id are static in templates — never expressions
				if (name === 'id' || name === 'data-id') {
					// Write directly into the opening string with quotes
					open += ` ${name}="${value}"`;
					continue;
				}

				// Dynamic attribute value: functions are unquoted (e.g., onclick=${fn}), others quoted
				if (typeof value === 'function') {
					open += ` ${name}=`;
					htmlStrings.push(open);
					templateExprs.push(value);
					// reset so subsequent attributes start fresh (e.g., ' title=')
					open = ``;
				}
				else {
					open += ` ${name}=`;
					htmlStrings.push(open);
					templateExprs.push(value);
					// reset so subsequent attributes start fresh (e.g., ' title=')
					open = ``;
				}
			}
		}

		// Finalize opening tag precisely to match tagged template splitting
		if (!isVoid) {
			const pushedAny = htmlStrings.length > 0;
			// If nothing pushed yet (no dynamic attrs), push the entire open + '>'
			if (!pushedAny)
				htmlStrings.push(open + '>');
			else {
				// If we were in a quoted attr (open === '"'), then the string after expr is '">' ;
				// Otherwise (function-valued attr), the string after expr is just '>'
				htmlStrings.push(open === '"' ? '">' : '>');
			}

			for (let child of children)
				addChild(child, htmlStrings, templateExprs);
		}

		// Closing tag (not for void tags)
		if (!isVoid) {
			// If we never emitted the '>' for the open tag (no children were added),
			// then it was appended above before children. Now just add the closing tag to the last html segment.
			let lastIdx = htmlStrings.length - 1;
			htmlStrings[lastIdx] += `</${tag}>`;
		}
		else {
			// Void element: ensure we emitted a trailing '>' segment
			const pushedAny = htmlStrings.length > 0;
			if (!pushedAny)
				htmlStrings.push(open + '>');
			else
				htmlStrings.push('>');
		}

		// Ensure invariant
		//assert(htmlStrings.length === templateExprs.length + 1);
		//console.log([htmlStrings, templateExprs])
		return new Template(htmlStrings, templateExprs);
	}
}


const selfClosingTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);


/**
 * Add child Templates that were already created via h() and Template.fromJsx()
 * @param template {Template}
 * @param html {string[]}
 * @param exprs {any[]} */
const addChild = (template, html, exprs) => {

	if (Array.isArray(template)) {
		for (let c of template)
			addChild(c, html, exprs);
	}
	else {
		let flatten = false;
		if (template instanceof Template) {
			// Heuristic to match tagged-template splitting:
			// - Flatten if the child has expressions (so JSX can inline attribute/value placeholders like tagged literals would).
			// - Also flatten void elements (e.g., <img>) so they inline like literals.
			// - Otherwise, keep as a dynamic child placeholder to match cases where the tagged template used an expression child.
			const childHasExprs = template.exprs.length > 0;
			if (childHasExprs)
				flatten = true;
			else {
				const m = (template.html[0] || '').match(/^<([a-zA-Z][\w:-]*)/);
				const childTag = m ? m[1].toLowerCase() : '';
				flatten = selfClosingTags.has(childTag);
			}
		}

		if (flatten) {
			// Flatten/interleave into current segment to match tagged template splitting
			html[html.length - 1] += template.html[0];
			for (let i = 0; i < template.exprs.length; i++) {
				exprs.push(template.exprs[i]);
				html.push(template.html[i + 1] ?? '');
			}
		} else {
			// Keep as dynamic child
			exprs.push(template);
			html.push('');
		}
	}
}


/**
 * @typedef {Object} RenderOptions
 * @property {boolean=} styles - Replace :host in style tags to scope them locally.
 * @property {boolean=} scripts - Execute script tags.
 * @property {boolean=} ids - Create references to elements with id or data-id attributes.
 * @property {?boolean} render - Deprecated.
 * 	 Used only when options are given to a class super constructor inheriting from Solarite.
 *     True to call render() immediately in super constructor.
 *     False to automatically call render() at all.
 *     Undefined (default) to call render() when added to the DOM, unless already rendered.
 */
