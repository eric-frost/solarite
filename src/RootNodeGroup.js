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
	 *
	 * @param template
	 * @param el
	 * @param options {?object}
	 */
	constructor(template, el, options) {
		super(template);

		this.options = options;

		this.rootNg = this;
		let [fragment, shell] = this.init(template);

		if (fragment instanceof Text) {

			if (el) {
				this.startNode = el;
				this.endNode = el;
				if (fragment.nodeValue.length)
					el.append(fragment);
				this.root = el;
			}
			Globals.nodeGroups.set(this.root, this);
		}
		else {

			// If adding NodeGroup to an element.
			let offset = 0;
			let root = fragment; // TODO: Rename so it's not confused with this.root.
			if (el) {
				Globals.nodeGroups.set(el, this);

				// Save slot children
				let slotChildren;
				if (el.childNodes.length) {
					slotChildren = document.createDocumentFragment();
					slotChildren.append(...el.childNodes);
				}

				this.root = el;

				// If el should replace the root node of the fragment.
				if (isReplaceEl(fragment, el)) {
					el.append(...fragment.children[0].childNodes);

					// Copy attributes
					for (let attrib of fragment.children[0].attributes)
						if (!el.hasAttribute(attrib.name) && attrib.name !== 'solarite-placeholder')
							el.setAttribute(attrib.name, attrib.value);

					// Go one level deeper into all of shell's paths.
					offset = 1;
				} else {
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

				root = el;

				this.startNode = el;
				this.endNode = el;
			} else {
				let singleEl = getSingleEl(fragment);
				this.root = singleEl || fragment; // We return the whole fragment when calling h() with a collection of nodes.

				Globals.nodeGroups.set(this.root, this);
				if (singleEl) {
					root = singleEl;
					offset = 1;
				}
			}

			this.updatePaths(root, shell.paths, offset);

			// Static web components can sometimes have children created via expressions.
			// But calling applyExprs() will mess up the shell's path to them.
			// So we find them first, then call activateStaticComponents() after their children have been created.
			this.staticComponents = this.findStaticComponents(root, shell, offset);

			this.activateEmbeds(root, shell, offset);

			// Apply exprs
			this.applyExprs(template.exprs);

			this.instantiateStaticComponents(this.staticComponents);
		}
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