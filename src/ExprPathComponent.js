import ExprPath, {ExprPathType} from "./ExprPath.js";
import Util, {verifyContiguous} from "./Util.js";
import delve from "./delve.js";
import {assert} from "./assert.js";
import Globals from "./Globals.js";
import ExprPathComment from "./ExprPathComment.js";

export default class ExprPathComponent extends ExprPath {

	/** @type {ExprPath[]} Paths to dynamics attributes that will be set on the component.*/
	attribPaths;


	childStart
	childEnd;

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
	applyComponent() {
		let el = this.nodeMarker;


		// 1. Attributes
		let dynamicAttribs = {}; // TODO

		// TODO: Stop using the solarite-placeholder attribute.
		let attribs = Util.attribsToObject(el, 'solarite-placeholder');
		for (let name in dynamicAttribs || {}) // dynamic overwrites static:
			attribs[Util.dashesToCamel(name)] = attribs[name];



		// 2. Instantiate component on first time.
		let children = null; // TODO: Is this how to get these?
		if (el.tagName.endsWith('-SOLARITE-PLACEHOLDER')) {


			// 2a. Instantiate component
			let isAttrib = el.getAttribute('_is');
			let tagName = (isAttrib || el.tagName.slice(0, -21)).toLowerCase(); // Remove -SOLARITE-PLACEHOLDER
			let Constructor = customElements.get(tagName);
			if (!Constructor)
				throw new Error(`Must call customElements.define('${tagName}', Class) before using it.`);

			this.childStart = el.firstChild;
			this.childEnd = el.lastChild;

			// children = Array.prototype.filter.call(el.childNodes, node => // Remove node markers.
			// 	node.nodeType !== Node.COMMENT_NODE || !node.nodeValue.startsWith('ExprPath')
			// );
			let newEl = new Constructor(attribs);


			children = el.childNodes;

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
					if (val !== false && val !== undefined && val !== null) // Util.isFalsy inlined
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

			//#IFDEV

			// Override render()
			// Is this a good idea?  This override will never be triggered for components not inside other components!
			// I could move this to the NodeGroup constructor for RootNodeGroups?
			this.originalRender = el.render;
			let firstRender = true;
			el.render = () => {
				let attribs = Util.attribsToObject(el, 'solarite-placeholder'); // TODO: get dynamic attribs
				let children = getNodes(this.childStart, this.childEnd);



				let result = this.originalRender.call(el, attribs, children);


				// Disable the ExprPath that renders the children, after the first render.
				// Because the parent node already renders them, and things will break if we try to render them again,
				// e.g. if they're removed and udomdiff tries to remove them twice.
				if (firstRender) {
					let rootNg = Globals.rootNodeGroups.get(el);

					let slotPathIndex = rootNg.paths.findIndex(path => path.nodeBefore === this.childStart.previousSibling);
					let path = rootNg.paths[slotPathIndex];
					rootNg.paths[slotPathIndex] = new ExprPathComment(null, path.nodeMarker); // Turn it into a comment expr path to disable it.
					//console.log(slotPath)
					firstRender = false;
				}

				return result;
			}
		}
		else {
			// A previous call to the user's render() may have taken the children and added them to some arbitrary place.
			// When it's called again, we grab whatever nodes have been rendered in that range.
			children = getNodes(this.childStart, this.childEnd);
		}

		if (typeof el.render === 'function') {
			el.render(attribs);

			// If render() didn't add the nodes, give them a DocumentFragment parent.
			// Because expr paths can't later update them if they have no parent.
			if (children[0] && !children[0].parentNode)
				Util.saveOrphans(children);

			//#IFDEV
			// TODO: We also ahve to make sure that the user doesn't add the children more than once!
			else
				verifyContiguous(children);
			//#ENDIF
		}

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