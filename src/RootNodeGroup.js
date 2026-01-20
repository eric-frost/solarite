import Globals from './Globals.js';
import NodeGroup from './NodeGroup.js';


export default class RootNodeGroup extends NodeGroup {

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