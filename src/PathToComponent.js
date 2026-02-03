import Path from "./Path.js";
import Util from "./Util.js";
import delve from "./delve.js";
import assert from "./assert.js";
import Globals from "./Globals.js";

export default class PathToComponent extends Path {

	/** @type {PathToAttribValue[]} Paths to dynamics attributes that will be set on the component.*/
	attribPaths;

	constructor(nodeBefore, nodeMarker) {
		super(null, nodeMarker);
	}

	/**
	 * Call render() on the component pointed to by this Path.
	 * And instantiate it (from a -solarite-placeholder element) if it hasn't been done yet.
	 * @param exprs {Expr[][]} Expressions to evaluate for each attribute to pass to the constructor.
	 * This is different than other Path.apply() functions which only receive Expr[] and not Expr[][].
	 * Because here we're receiving an array of arrays of expressions, one for each dynamic attribute.
	 * @param freeNodeGroups {boolean} Used only by watch.js.
	 * @param changed {boolean} True if the exprs have changed since the last time render() was called.*/
	apply(exprs, freeNodeGroups=true, changed=true) {
		//#IFDEV
		assert(Array.isArray(exprs));
		assert(!exprs.length || Array.isArray(exprs[0]));
		//#ENDIF

		//#IFDEV
		assert(exprs.length === this.attribPaths.length);
		//#ENDIF

		let el = this.nodeMarker;

		// 1. Attributes
		let attribs = Util.attribsToObject(el, '_is');
		for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
			let name = Util.dashesToCamel(attribPath.attrName);
			attribs[name] = attribPath.getValue(exprs[i]);
		}

		// 2. Instantiate component on first time.
		let isAttrib = el.getAttribute('_is');
		if (el.tagName.endsWith('-SOLARITE-PLACEHOLDER') || isAttrib) {


			// 2a. Instantiate component
			let tagName = (isAttrib || el.tagName.slice(0, -21)).toLowerCase(); // Remove -SOLARITE-PLACEHOLDER
			let Constructor = customElements.get(tagName);
			if (!Constructor)
				throw new Error(`Must call customElements.define('${tagName}', Class) before using it.`);

			Globals.currentSlotChildren = [...el.childNodes]; // TODO: Does this need to be a stack?
			let newEl = new Constructor(attribs);

			// 2b. Copy attributes over.
			if (isAttrib) {
				newEl.setAttribute('is', isAttrib);
			//	el.removeAttribute('_is');
			}
			for (let attrib of el.attributes)
				if (attrib.name !== '_is')
					newEl.setAttribute(attrib.name, attrib.value);

			// Set dynamic attributes if they are primitive types.
			for (let name in attribs) {
				let val = attribs[name];
				let valType = typeof val;
				if (valType === 'boolean') {
					if (val !== false && val !== undefined && val !== null) // Util.isFalsy() inlined
						newEl.setAttribute(name, '');
				}

				// If type is a non-boolean primitive, set the attribute value.
				else if (valType==='string' || valType === 'number' || valType==='bigint')
					newEl.setAttribute(name, val);
			}


			// 2c. If an id pointed at the placeholder, update it to point to the new element.
			let id = newEl.getAttribute('data-id') || newEl.getAttribute('id');
			if (id)
				delve(this.parentNg.getRootNode(), id.split(/\./g), newEl);

			// 2d. Update paths to use replaced element.
			let ng = this.parentNg;
			this.nodeMarker = newEl;
			for (let path of ng.paths) {
				if (path.nodeMarker === el)
					path.nodeMarker = newEl;
				if (path.nodeBefore === el)
					path.nodeBefore = newEl;
			}
			if (ng.startNode === el)
				ng.startNode = newEl;
			if (ng.endNode === el)
				ng.endNode = newEl;

			// 2f. Call render() if it wasn't called by the constructor.
			// This must happen before we add it to the DOM which can trigger connectedCallback() -> renderFirstTime()
			// Because that path renders it without the attribute expressions.
			if (typeof newEl.render === 'function' && !Globals.rendered.has(newEl))
				newEl.render(attribs, changed);

			// 2g. Update attribute paths to use the new element and re-apply them.
			for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
				attribPath.parentNg = this.parentNg;
				attribPath.nodeMarker = newEl;
				attribPath.apply(exprs[i]);
			}

			// 2e. Swap it to the DOM.
			el.replaceWith(newEl);
		}

		// 2f. Render
		else if (typeof el.render === 'function')
			el.render(attribs, changed);

		Globals.currentSlotChildren = null;
	}

	/**
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {Path} */
	clone(newRoot, pathOffset=0) {
		/*#IFDEV*/this.verify();/*#ENDIF*/
		let nodeMarker = this.getNewNodeMarker(newRoot, pathOffset);
		let result = new PathToComponent(null, nodeMarker);
		result.attribPaths = this.attribPaths.map(path => path.clone(newRoot, pathOffset));

		//#IFDEV
		result.verify();
		//#ENDIF

		return result;
	}

	getExpressionCount() { return 0 }

	//#IFDEV
	verify() {
		super.verify();
		assert(this.nodeMarker.nodeType === Node.ELEMENT_NODE);
		assert(this.nodeMarker.tagName.includes('-') || this.nodeMarker.hasAttribute('is') || this.nodeMarker.hasAttribute('_is'));
		if (this.attribPaths)
			for (let path of this.attribPaths)
				path.verify();
	}

	//#ENDIF
}


// TODO: Conver this to an iterator, to make it faster?
// Especially since it's only used on the first render?
function getNodes(startNode, endNode) {
	let result = [];
	let current = startNode
	let afterLast = endNode?.nextSibling
	while (current && current !== afterLast) {
		result.push(current)
		current = current.nextSibling
	}

	return result;
}