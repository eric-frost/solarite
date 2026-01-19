import Globals from './Globals.js';
import NodeGroup from './NodeGroup.js';


export default class RootNodeGroup extends NodeGroup {

	/**
	 * Root node at the top of the hierarchy.
	 * @type {HTMLElement} */
	root;

	/**
	 * When we call renerWatched() we re-render these expressions, then clear this to a new Map()
	 * @type {Map<ExprPath, ValueOp|WholeArrayOp|ArraySpliceOp[]>} */
	exprsToRender = new Map();

	/**
	 * Create all the elements from the template's fragment.
	 * But don't call applyExprs() yet.
	 * @param template {Template}
	 * @param el {?HTMLElement} Optional, pre-existing htmlElement that will be the root.
	 * @param options {?object} */
	constructor(template, el, options) {
		super(template);
		this.options = options;
		let startingPathDepth = 0;

		let [fragment, shell] = this.populateFromTemplate(template);

		// Fast path for text-only:
		if (fragment instanceof Text) {
			if (el) {
				this.startNode = el;
				this.endNode = el;
				if (fragment.nodeValue.length)
					el.append(fragment);
				this.root = el;
			}
			else
				throw new Error('Cannot create a standalone text node');
			Globals.nodeGroups.set(this.root, this);
		}
		else {

			// If adding NodeGroup to an element.
			if (el) {
				this.root = el;

				// Save slot children
				let slotChildren;
				if (Globals.currentSlotChildren || el.childNodes.length) {
					slotChildren = Globals.doc.createDocumentFragment();
					slotChildren.append(...(Globals.currentSlotChildren || el.childNodes));
				}

				// If el should replace the root node of the fragment.
				if (isReplaceEl(fragment, el)) {
					el.append(...fragment.children[0].childNodes);

					// Copy attributes
					for (let attrib of fragment.children[0].attributes)
						if (!el.hasAttribute(attrib.name) && attrib.name !== 'solarite-placeholder')
							el.setAttribute(attrib.name, attrib.value);

					// Go one level deeper into all of shell's paths.
					startingPathDepth = 1;
				}

				else {
					let isEmpty = fragment.childNodes.length === 1 && fragment.childNodes[0].nodeType === 3 && fragment.childNodes[0].textContent === '';
					if (!isEmpty)
						el.append(...fragment.childNodes);
				}

				// Setup children
				if (slotChildren) {

					// Named slots
					for (let slot of el.querySelectorAll('slot[name]')) {
						let name = slot.getAttribute('name')
						if (name) {
							let slotChildren2 = slotChildren.querySelectorAll(`[slot='${name}']`);
							slot.append(...slotChildren2);
						}
					}

					// Unnamed slots
					let unamedSlot = el.querySelector('slot:not([name])')
					if (unamedSlot)
						unamedSlot.append(slotChildren);

					// No slots
					else
						el.append(slotChildren);
				}

				this.startNode = el;
				this.endNode = el;
			}

			// Instantiate as a standalone element.
			else {
				let singleEl = getSingleEl(fragment);
				this.root = singleEl || fragment; // We return the whole fragment when calling h() with a collection of nodes.

				if (singleEl)
					startingPathDepth = 1;
			}
			Globals.nodeGroups.set(this.root, this);
			this.updatePaths(this.root, shell.paths, startingPathDepth);

			// Static web components can sometimes have children created via expressions.
			// But calling applyExprs() will mess up the shell's path to them.
			// So we find them first, then call activateStaticComponents() after their children have been created.
			this.staticComponents = this.findStaticComponents(this.root, shell, startingPathDepth);

			this.activateEmbeds(this.root, shell, startingPathDepth);
		}
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

function getSingleEl(fragment) {
	let nonempty = [];
	for (let n of fragment.childNodes) {
		if (n.nodeType === 1 || n.nodeType === 3 && n.textContent.trim().length) {
			if (nonempty.length)
				return null;
			nonempty.push(n);
		}
	}
	return nonempty[0];
}

/**
 * Does the fragment have one child that's an element matching the tagname of el?
 * @param fragment {DocumentFragment}
 * @param el {HTMLElement}
 * @returns {boolean} */
function isReplaceEl(fragment, el) {
	return fragment.children.length===1
		&& el.tagName.includes('-') // TODO: Check for solarite-placeholder attribute instead?
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === el.tagName;
}