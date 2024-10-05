import {assert} from "../util/Errors.js";
import {getObjectHash, getObjectId} from "./hash.js";
import Globals from "./Globals.js";
import {RootNodeGroup} from "./NodeGroup.js";

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

	/**
    * @deprecated
    * @type {ExprPath} Used with forEach() from watch.js
	 * Set in ExprPath.apply() */
	parentPath;

	/** @type {NodeGroup} */
	nodeGroup;

	/**
	 * @type {string[][]} */
	paths = [];

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
		if (!this.hashedFields)
			this.hashedFields = [getObjectId(this.html), this.exprs];

		return this.hashedFields
	}

	/**
	 * Render the main template, which may indirectly call renderTemplate() to create children.
	 * @param el {HTMLElement}
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} */
	render(el=null, options={}) {
		let ng;
		let standalone = !el;
		let firstTime = false;

		// Rendering a standalone element.
		// TODO: figure out when to not use RootNodeGroup
		if (standalone) {
			ng = new RootNodeGroup(this, null, options);
			el = ng.getRootNode();
			Globals.nodeGroups.set(el, ng);
			firstTime = true;
		}
		else {
			ng = Globals.nodeGroups.get(el);
			if (!ng) {
				ng = new RootNodeGroup(this, el, options);
				Globals.nodeGroups.set(el, ng);
				firstTime = true;
			}
		}

		// Creating the root nodegroup also renders it.
		// If we didn't just create it, we need to render it.
		if (!firstTime) {
			if (this.html?.length === 1 && !this.html[0])
				el.innerHTML = ''; // Fast path for empty component.
			else
				ng.applyExprs(this.exprs);
		}

		return el;
	}

	getExactKey() {
		if (!this.exactKey)
			this.exactKey = getObjectHash(this); // calls this.toJSON().
		return this.exactKey;
	}

	getCloseKey() {
		if (!this.closeKey)
			this.closeKey = '@'+this.toJSON()[0];
		// Use the joined html when debugging?  But it breaks some tests.
		//return '@'+this.html.join('|')

		return this.closeKey;
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
