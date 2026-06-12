import NodeGroup from './NodeGroup.js';
import Globals from './Globals.js';

/**
 * Has these properties not present on NodeGroup, assigned by instantiate():
 * They're not declared as fields because subclass field initializers run after the
 * super constructor and would overwrite the assigned values.
 * @property {HTMLElement} root - Root node at the top of the hierarchy.
 * @property {?object} options - RenderOptions */
export default class RootNodeGroup extends NodeGroup {

	/**
	 * Special setup for the root: graft the fragment into el (or use it standalone),
	 * handle slot children, then resolve paths and embeds against the root.
	 * Called by the NodeGroup constructor. */
	instantiate(shell, shellFragment, el, options) {
		let startingPathDepth = 0;
		this.options = options;
		if (shellFragment instanceof Text) {
			if (!el)
				throw new Error('Cannot create a standalone text node');

			this.root = el;
			if (shellFragment.nodeValue.length)
				this.root.append(shellFragment);
		}

		else {
			if (el) {
				this.root = el;

				// Save slot
				// 1. Globals.currentSlotChildren is set if this is called via PathToComponent.applyComponent() calls render()
				// 2. el.childNodes is set if render() is called manually for the first time.
				let slotChildren;
				if (Globals.currentSlotChildren || el.childNodes.length) {
					slotChildren = Globals.doc.createDocumentFragment();
					slotChildren.append(...(Globals.currentSlotChildren || el.childNodes));
				}

				// If el should replace the root node of the fragment.
				if (isReplaceEl(shellFragment, this.root.tagName)) {
					this.root.append(...shellFragment.children[0].childNodes);

					// Copy attributes
					for (let attrib of shellFragment.children[0].attributes)
						if (!this.root.hasAttribute(attrib.name))
							this.root.setAttribute(attrib.name, attrib.value);

					// Go one level deeper into all of shell's paths.
					startingPathDepth = 1;
				}

				else {
					let isEmpty = shellFragment.childNodes.length === 1 && shellFragment.childNodes[0].nodeType === 3 && shellFragment.childNodes[0].textContent === '';
					if (!isEmpty)
						this.root.append(...shellFragment.childNodes);
				}


				// Setup slot children (deprecated)
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
			}

			// Instantiate as a standalone element.
			else {
				let onlyChild = getSingleEl(shellFragment);
				this.root = onlyChild || shellFragment; // We return the whole fragment when calling h() with a collection of nodes.
				if (onlyChild)
					startingPathDepth = 1;
			}

			this.setPathsFromFragment(this.root, shell.paths, startingPathDepth);
			this.activateEmbeds(this.root, shell, startingPathDepth);
		}
		this.startNode = this.endNode = this.root;

		Globals.rootNodeGroups.set(this.root, this);
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
 * @param tagName {string}
 * @returns {boolean} */
function isReplaceEl(fragment, tagName) {
	return fragment.children.length===1
		&& tagName.includes('-')
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === tagName;
}
