import {assert} from "../util/Errors.js";
import {getObjectId} from "./hash.js";
import NodeGroupManager from "./NodeGroupManager.js";

/**
 * The html strings and evaluated expressions from an html tagged template.
 * A unique Template is created for each item in a loop.
 * Although the reference to the html strings is shared among templates. */
export default class Template {

	/** @type {(Template|string|function)|(Template|string|function)[]} Evaulated expressions.  */
	exprs = []

	/** @type {string[]} */
	html = [];

	/** Used for toJSON() and getObjectHash().  Stores values used to quickly create a string hash of this template. */
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
			this.hashedFields = [getObjectId(this.html, 'Html'), this.exprs];

		return this.hashedFields
	}

	/**
	 * Render the main template, which may indirectly call renderTemplate() to create children.
	 * @param el {HTMLElement}
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} */
	render(el=null, options={}) {
		let ngm;
		let standalone = !el;

		// Rendering a standalone element.
		if (standalone) {
			ngm = NodeGroupManager.get(this);
			el = ngm.rootNg.getRootNode();
		}
		else
			ngm = NodeGroupManager.get(el);

		ngm.options = options;
		ngm.mutationWatcherEnabled = false;


		//#IFDEV
		ngm.resetModifications();
		//#ENDIF

		// Fast path for empty component.
		if (this.html?.length === 1 && !this.html[0]) {
			el.innerHTML = '';
		}
		else {

			// Find or create a NodeGroup for the template.
			// This updates all nodes from the template.
			let firstTime = !ngm.rootNg;
			if (!standalone) {
				ngm.rootNg = ngm.getNodeGroup(this, false);
			}

			// If this is the first time rendering this element.
			if (firstTime) {


				// Save slot children
				let fragment;
				if (el.childNodes.length) {
					fragment = document.createDocumentFragment();
					fragment.append(...el.childNodes);
				}

				// Reparent NodeGroup
				// TODO: Move this to NodeGroup?
				let parent = ngm.rootNg.getParentNode();

				// Add rendered elements.
				if (parent instanceof DocumentFragment)
					el.append(parent);
				else if (parent)
					el.append(...parent.childNodes)

				// Apply slot children
				if (fragment) {
					for (let slot of el.querySelectorAll('slot[name]')) {
						let name = slot.getAttribute('name')
						if (name)
							slot.append(...fragment.querySelectorAll(`[slot='${name}']`))
					}
					let unamedSlot = el.querySelector('slot:not([name])')
					if (unamedSlot)
						unamedSlot.append(fragment)
				}

				// Copy attributes from pseudoroot to root.
				// this.rootNg was rendered as childrenOnly=true
				// Apply attributes from a root element to the real root element.
				if (ngm.rootNg.pseudoRoot && ngm.rootNg.pseudoRoot !== el) {
					/*#IFDEV*/assert(el)/*#ENDIF*/

					// Add/set new attributes
					for (let attrib of ngm.rootNg.pseudoRoot.attributes)
						if (!el.hasAttribute(attrib.name))
							el.setAttribute(attrib.name, attrib.value);
				}
			}

			ngm.rootEl = el;
			ngm.reset(); // Mark all NodeGroups as available, for next render.
		}

		ngm.mutationWatcherEnabled = true;
		return el;
	}


	getCloseKey() {
		// Use the joined html when debugging?
		return '@'+this.html.join('|')

		return '@'+this.hashedFields[0];
	}
}
