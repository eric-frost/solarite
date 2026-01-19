import Globals from './Globals.js';
import NodeGroup from './NodeGroup.js';


export default class RootNodeGroup extends NodeGroup {



	/**
	 * Only used by watch:
	 * When we call renderWatched() we re-render these expressions, then clear this to a new Map()
	 * @type {Map<ExprPath, ValueOp|WholeArrayOp|ArraySpliceOp[]>} */
	//exprsToRender = new Map();

	/**
	 * Create all the elements from the template's fragment.
	 * But don't call applyExprs() yet.
	 * @param template {Template}
	 * @param el {?HTMLElement} Optional, pre-existing htmlElement that will be the root.
	 * @param options {?object} */
	constructor(template, parentPath, el, options) {
		super(template, parentPath, el, options);
	}

	/**
	 * @param el {HTMLElement}
	 * @returns {NodeList[]} */
	static getSlotChildren(el) {
		if (Globals.currentSlotChildren)
			return Globals.currentSlotChildren;

		// TODO: Have Shell cache the path to slot for better performance:
		let childNodes = (el.querySelector('slot') || el).childNodes;
		return Array.prototype.filter.call(childNodes, node => // Remove node markers.
			node.nodeType !== Node.COMMENT_NODE || !node.nodeValue.startsWith('ExprPath')
		);
	}
}