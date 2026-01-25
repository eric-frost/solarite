import ExprPath, {ExprPathType} from "./ExprPath.js";
import Util from "./Util.js";
import delve from "./delve.js";
import {assert} from "./assert.js";
import Globals from "./Globals.js";

export default class ExprPathComponent extends ExprPath {

	/** @type {ExprPathAttribValue[]} Paths to dynamics attributes that will be set on the component.*/
	attribPaths;

	rendered = false;

	constructor(nodeBefore, nodeMarker) {
		super(null, nodeMarker, ExprPathType.Component);
	}

	clone(newRoot, pathOffset=0) {
		let result = super.clone(newRoot, pathOffset);

		// Untested:
		result.attribPaths = this.attribPaths.map(path => path.clone(newRoot, pathOffset));
		return result;
	}


	/**
	 * Call render() on the component pointed to by this ExprPath.
	 * And instantiate it (from a -solarite-placeholder element) if it hasn't been done yet. */
	applyComponent(attribExprs) {
		let el = this.nodeMarker;

		console.log(attribExprs)

		// 1. Attributes
		//let dynamicAttribs = {}; // TODO


		// TODO: Stop using the solarite-placeholder attribute.
		let attribs = Util.attribsToObject(el, 'solarite-placeholder');

		for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
			let name = Util.dashesToCamel(attribPath.attrName);
			attribs[name] = attribPath.getValue(attribExprs[i]);
		}


		//for (let name in dynamicAttribs || {}) // dynamic overwrites static:
		//	attribs[Util.dashesToCamel(name)] = attribs[name];


		// 2. Instantiate component on first time.
		if (el.tagName.endsWith('-SOLARITE-PLACEHOLDER')) {


			// 2a. Instantiate component
			let isAttrib = el.getAttribute('_is');
			let tagName = (isAttrib || el.tagName.slice(0, -21)).toLowerCase(); // Remove -SOLARITE-PLACEHOLDER
			let Constructor = customElements.get(tagName);
			if (!Constructor)
				throw new Error(`Must call customElements.define('${tagName}', Class) before using it.`);

			Globals.currentSlotChildren = [...el.childNodes]; // TODO: Does this need to be a stack?
			let newEl = new Constructor(attribs);

			// 2b. Copy attributes over.
			if (isAttrib)
				newEl.setAttribute('is', isAttrib);
			for (let attrib of el.attributes)
				if (attrib.name !== '_is' && attrib.name !== 'solarite-placeholder')
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
				delve(this.getRootNode(), id.split(/\./g), newEl);

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


			// 2e. Swap it to the DOM.
			el.replaceWith(newEl);
			el = newEl;

		}

		// If render wasn't called by the constructor:
		if (typeof el.render === 'function' && !Globals.rendered.has(el)) {
			el.render(attribs);
			Globals.rendered.add(el);
		}



		Globals.currentSlotChildren = null;



	}

	//#IFDEV
	verify() {
		super.verify();
		assert(this.nodeMarker.nodeType === Node.ELEMENT_NODE);
		assert(this.nodeMarker.tagName.includes('-'));
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