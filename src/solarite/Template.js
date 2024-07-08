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

	/**
	 * If true, use this template to replace an existing element, instead of appending children to it.
	 * @type {?boolean} */
	replaceMode;

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

	/** @depreacted for render() */
	toNode(el=null) {
		throw new Error('unsupported');
		let ngm = NodeGroupManager.get(el);
		return ngm.render(this);
	}



	/**
	 * Render the main template, which may indirectly call renderTemplate() to create children.
	 * @param el {HTMLElement}
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} */
	render(el=null, options={}) {
		let template = this;
		let ngm = NodeGroupManager.get(el);

		ngm.options = options;
		ngm.clearSubscribers = false; // Used for deprecated watch() path?

		//#IFDEV
		ngm.modifications = {
			created: [],
			updated: [],
			moved: [],
			deleted: []
		};
		//#ENDIF

		ngm.mutationWatcherEnabled = false;

		// Fast path for empty component.
		if (template.html?.length === 1 && !template.html[0]) {
			el.innerHTML = '';
		}
		else {

			// Find or create a NodeGroup for the template.
			// This updates all nodes from the template.
			let close;
			let exact = ngm.getNodeGroup(template, true);
			if (!exact) {
				close = ngm.getNodeGroup(template, false);
			}


			let firstTime = !ngm.rootNg;
			ngm.rootNg = exact || close;

			// Reparent NodeGroup
			// TODO: Move this to NodeGroup?
			let parent = ngm.rootNg.getParentNode();
			if (!el)
				el = parent;



			// If this is the first time rendering this element.
			else if (firstTime) {

				// Save slot children
				let fragment;
				if (el.childNodes.length) {
					fragment = document.createDocumentFragment();
					fragment.append(...el.childNodes);
				}

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
			}

			ngm.rootEl = el;

			// this.rootNg was rendered as childrenOnly=true
			// Apply attributes from a root element to the real root element.
			let ng = ngm.rootNg;
			if (ng.pseudoRoot && ng.pseudoRoot !== el) {
				/*#IFDEV*/assert(el)/*#ENDIF*/

				// Remove old attributes
				// for (let attrib of this.rootEl.attributes)
				// 	if (attrib.name !== 'is' && attrib.name !== 'data-style' && !ng.pseudoRoot.hasAttribute(attrib.name))
				// 		this.rootEl.removeAttribute(attrib.name)

				// Add/set new attributes
				if (firstTime)
					for (let attrib of ng.pseudoRoot.attributes)
						if (!el.hasAttribute(attrib.name))
							el.setAttribute(attrib.name, attrib.value);

				// ng.startNode = ng.endNode = this.rootEl;
				// ng.nodesCache = [ng.startNode]
				// for (let path of ng.paths) {
				// 	if (path.nodeMarker === ng.rootEl)
				// 		path.nodeMarker = this.rootEl;
				// 	path.nodesCache = null;
				// 	/*#IFDEV*/assert(path.nodeBefore !== ng.rootEl)/*#ENDIF*/
				// }
				//
				// ng.rootEl = this.rootEl;
			}

			/*#IFDEV*/ngm.rootNg.verify();/*#ENDIF*/
			ngm.reset();
			/*#IFDEV*/ngm.rootNg.verify();/*#ENDIF*/
		}

		ngm.mutationWatcherEnabled = true;
		return el;
		//#IFDEV
		//return ngm.modifications;
		//#ENDIF
	}


	getCloseKey() {
		// Use the joined html when debugging?
		//return '@'+this.html.join('|')

		return '@'+this.hashedFields[0];
	}
}
