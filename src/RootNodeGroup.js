import NodeGroup from './NodeGroup.js';
import Globals from './Globals.js';
import Util from './Util.js';

/**
 * Has these properties not present on NodeGroup, assigned by instantiate():
 * They're not declared as fields because subclass field initializers run after the
 * super constructor and would overwrite the assigned values.
 * @property {HTMLElement} rootEl - Root node at the top of the hierarchy.
 * @property {?object} renderOptions - RenderOptions */
export default class RootNodeGroup extends NodeGroup {

	/**
	 * Special setup for the root: graft the fragment into el (or use it standalone),
	 * handle slot children, then resolve paths and embeds against the root.
	 * Called by the NodeGroup constructor. */
	instantiate(shell, shellFragment, el, options) {
		let startingPathDepth = 0;
		this.renderOptions = options;
		if (shellFragment instanceof Text) {
			if (!el)
				throw new Error('Text node needs an element.');

			this.rootEl = el;
			if (shellFragment.nodeValue.length)
				this.rootEl.append(shellFragment);
		}

		else {
			if (el) {
				this.rootEl = el;

				// Save the children that belong in this component's <slot>, from one of two places:
				// 1. A hand-off parked by PathToComponent.applyAll() just before it constructed
				//    us, when this component was declared inside another template.  It carries
				//    the Constructor it was meant for, so an unrelated component built in the
				//    meantime -- a field initializer creating a menu, say -- leaves it alone.
				// 2. el.childNodes, when render() is called manually for the first time.
				// An addressed hand-off wins even when its node list is empty:  a component
				// declared as <my-tag></my-tag> is asking for an empty slot, not for whatever
				// its own constructor happened to put in the element.
				//
				// The hand-off is deliberately NOT cleared on read.  A component that builds
				// another instance of its OWN class while constructing cannot be told apart
				// from itself by any address, so both match; the inner one takes the nodes and
				// this outer one takes them straight back, which is the only thing that makes
				// that case work.
				let handOff = Globals.currentSlotChildren;
				let mySlotNodes = handOff?.Constructor === el.constructor
					? handOff.nodes
					: (el.childNodes.length ? [...el.childNodes] : null);

				let slotChildren;
				if (mySlotNodes) {
					slotChildren = Globals.doc.createDocumentFragment();
					slotChildren.append(...mySlotNodes);
				}

				// If el should replace the root node of the fragment.
				if (isReplaceEl(shellFragment, this.rootEl.tagName)) {
					this.rootEl.append(...shellFragment.children[0].childNodes);

					// Copy attributes
					for (let attrib of shellFragment.children[0].attributes)
						if (!this.rootEl.hasAttribute(attrib.name))
							this.rootEl.setAttribute(attrib.name, attrib.value);

					// Go one level deeper into all of shell's paths.
					startingPathDepth = 1;
				}

				else {
					let isEmpty = shellFragment.childNodes.length === 1 && shellFragment.childNodes[0].nodeType === 3 && shellFragment.childNodes[0].textContent === '';
					if (!isEmpty)
						this.rootEl.append(...shellFragment.childNodes);
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
				// Trimming the whitespace and comment nodes off both ends leaves a list of exactly
				// one node only when the fragment has exactly one node worth keeping, which is the
				// question being asked here.
				let relevantNodes = Util.trimEmptyNodes(shellFragment.childNodes);
				let onlyChild = relevantNodes.length === 1 ? relevantNodes[0] : null;
				this.rootEl = onlyChild || shellFragment; // We return the whole fragment when calling h() with a collection of nodes.
				if (onlyChild)
					startingPathDepth = 1;
			}

			this.setPathsFromFragment(this.rootEl, shell, startingPathDepth);
			this.activateEmbeds(this.rootEl, shell, startingPathDepth);
		}
		this.startNode = this.endNode = this.rootEl;

		Globals.rootNodeGroups.set(this.rootEl, this);
	}
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
