import assert from "./assert.js";
import Util, {flattenAndIndent, nodeToArrayTree, setIndent} from "./Util.js";
import Shell from "./Shell.js";
import RootNodeGroup from './RootNodeGroup.js';
import ExprPath from "./ExprPath.js";
import Globals from './Globals.js';
import NodePath from "./NodePath.js";
import ExprPathComponent from "./ExprPathComponent.js";
import ExprPathNodes from "./ExprPathNodes.js";

/** @typedef {boolean|string|number|function|Object|Array|Date|Node|Template} Expr */

/**
 * A group of Nodes instantiated from a Shell, with Expr's filled in.
 *
 * The range is determined by startNode and nodeMarker.
 * startNode - never null.  An empty text node is created before the first path if none exists.
 * nodeMarker - null if this Nodegroup is at the end of its parents' nodes.
 *
 *
 * */
export default class NodeGroup {

	/**
	 * @Type {RootNodeGroup} */
	rootNg;

	/** @type {ExprPath} */
	parentPath;

	/** @type {Node|HTMLElement} First node of NodeGroup. Should never be null. */
	startNode;

	/** @type {Node|HTMLElement} A node that never changes that this NodeGroup should always insert its nodes before.
	 * An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * TODO: But sometimes startNode and endNode point to the same node.  Document htis inconsistency. */
	endNode;

	/** @type {ExprPath[]} */
	paths = [];

	/** @type {string} Key that matches the template and the expressions. */
	exactKey;

	/** @type {string} Key that only matches the template. */
	closeKey;

	/**
	 * @internal
	 * @type {Node[]} Cached result of getNodes() used only for improving performance.*/
	nodesCache;

	/**
	 * A map between <style> Elements and their text content.
	 * This lets NodeGroup.updateStyles() see when the style text has changed.
	 * @type {?Map<HTMLStyleElement, string>} */
	styles;

	/** @type {Template} */
	template;

	/**
	 * Root node at the top of the hierarchy.
	 * Should be moved to RootNodeGroup
	 * @type {HTMLElement} */
	root;


	/**
	 * Create an "instantiated" NodeGroup from a Template and add it to an element.
	 * Don't call applyExprs() yet to apply expressions or instantiate components yet.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param parentPath {?ExprPath}
	 * @param el {?HTMLElement} Optional, pre-existing htmlElement that will be the root.
	 * @param options {?object} Only used for RootNodeGroup */
	constructor(template, parentPath=null, el=null, options=null) {
		this.rootNg = parentPath?.parentNg?.rootNg || this;
		this.parentPath = parentPath;

		/*#IFDEV*/assert(this.rootNg);/*#ENDIF*/
		this.template = template;
		this.closeKey = template.getCloseKey();

		// If it's just a text node, skip a bunch of unnecessary steps.
		if (template.isText) {
			this.startNode = this.endNode = Globals.doc.createTextNode(template.html[0]);
		}

		else {
			// Get a cached version of the parsed and instantiated html, and ExprPaths:
			const shell = Shell.get(template.html);
			const shellFragment = shell.fragment.cloneNode(true);

			if (shellFragment.nodeType === 11) { // DocumentFragment
				this.startNode = shellFragment.firstChild;
				this.endNode = shellFragment.lastChild;
			} else
				this.startNode = this.endNode = shellFragment;


			// Special setup for RootNodeGroup
			if (this instanceof RootNodeGroup) {


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
						// 1. Globals.currentSlotChildren is set if this is called via ExprPathComponent.applyComponent() calls render()
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

					// Exclude the path to ourself.  Otherwise we get infinite recursion.
					// let paths = [...shell.paths];
					// if (paths[0] instanceof ExprPathComponent)
					// 	paths.shift();

					this.setPathsFromFragment(this.root, shell.paths, startingPathDepth);
					this.activateEmbeds(this.root, shell, startingPathDepth);
				}
				this.startNode = this.endNode = this.root;

				Globals.rootNodeGroups.set(this.root, this);
			} // end if RootNodeGroup

			else if (shell) {
				if (shell.paths.length) {
					this.setPathsFromFragment(shellFragment, shell.paths);
				}

				this.activateEmbeds(shellFragment, shell);
			}
		}

		//#IFDEV
		this.verify();
		//#ENDIF
	}


	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param changed {boolean} If true, the expr's have changed since the last time thsi function was called.
	 * We still need to call ExprPathComponent.apply() even if changed=false so the user can handle the rendering. */
	applyExprs(exprs, changed=true) {

		/*#IFDEV*/
		this.verify();
		/*#ENDIF*/

		let paths = this.paths;

		// Things to consider:
		// 1. Paths consume a varying number of expressions.
		//    An ExprPathAttribs may use multipe expressions.  E.g. <div class="${1} ${2}">
		//    While an ExprPathComponent uses zero.
		// 2. An ExprPathComponent references other ExprPaths that set its attribute values.
		// 3. We apply them in reverse order so that a <select> box has its children created from an expression
		//    before its instantiated and its value attribute is set via an expression.
		let exprIndex = exprs.length; // Update exprs at paths.
		let pathExprs = new Array(paths.length); // Store all the expressions that map to a single path.  Only paths to attribute values can have more than one.
		for (let i = paths.length - 1, path; path = paths[i]; i--) {
			if (i===0 && path instanceof ExprPathComponent && path.nodeMarker === this.getRootNode())
				continue;

			// Get the expressions associated with this path.
			let exprCount = path.getExpressionCount();
			pathExprs[i] = exprs.slice(exprIndex-exprCount, exprIndex); // slice() probably doesn't allocate if the JS vm implements copy on write.
			exprIndex -= exprCount;

			// Component expressions don't have a corresponding user-provided expression.
			// They use expressions from the paths that provide their attributes.
			if (path instanceof ExprPathComponent) {
				let attribExprs = pathExprs.slice(i+1, i+1 + path.attribPaths.length); // +1 b/c we move forward from the component path.
				path.apply(attribExprs, true, changed);
			}
			else if (changed)
				path.apply(pathExprs[i]);
		}

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		/*#IFDEV*/
		assert(exprIndex === 0);
		/*#ENDIF*/


		if (changed) {

			// TODO: Only do this if we have ExprPaths within styles?
			this.updateStyles();

			// Invalidate the nodes cache because we just changed it.
			this.nodesCache = null;

		}

		/*#IFDEV*/
		this.verify();
		/*#ENDIF*/
	}

	// TODO: Give it a better name.
	applyExprs2(exprs) {

	}

	/**
	 * Get all the nodes inclusive between startNode and endNode.
	 * TODO: when not using nodesCache, could this use less memory with yield?
	 * But we'd need to save the reference to the next Node in case it's removed.
	 * @return {(Node|HTMLElement)[]} */
	getNodes() {
		// applyExprs() invalidates this cache.
		let result = this.nodesCache;
		if (result) // This does speed up the partialUpdate benchmark by 10-15%.
			return result;

		result = [];
		let current = this.startNode
		let afterLast = this.endNode?.nextSibling
		while (current && current !== afterLast) {
			result.push(current)
			current = current.nextSibling
		}

		this.nodesCache = result;
		return result;
	}

	/**
	 * Get the root element of the NodeGroup's RootNodeGroup.
	 * @returns {HTMLElement|DocumentFragment} */
	getRootNode() {
		return this.rootNg.root;
	}

	/**
	 * @returns {RootNodeGroup} */
	getRootNodeGroup() {
		return this.rootNg;
	}

	/**
	 * Copy paths in fragment to this.paths.
	 * @param fragment {DocumentFragment|HTMLElement}
	 * @param paths
	 * @param startingPathDepth {int} */
	setPathsFromFragment(fragment, paths, startingPathDepth=0) {
		let pathLength = paths.length; // For faster iteration
		this.paths.length = pathLength;
		for (let i=0; i<pathLength; i++) {
			let path = paths[i].clone(fragment, startingPathDepth)
			path.parentNg = this;
			this.paths[i] = path;
		}
	}

	updateStyles() {
		if (this.styles)
			for (let [style, oldText] of this.styles) {
				let newText = style.textContent;
				if (oldText !== newText)
					Util.bindStyles(style, this.getRootNodeGroup().root);
			}
	}

	/**
	 * @param root {HTMLElement|DocumentFragment}
	 * @param shell {Shell}
	 * @param pathOffset {int} */
	activateEmbeds(root, shell, pathOffset=0) {

		let rootEl = this.rootNg.root;
		if (rootEl) {
			let options = this.rootNg.options;

			// ids
			if (options?.ids !== false) {
				for (let path of shell.ids) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let el = NodePath.resolve(root, path);
					Util.bindId(rootEl, el);
				}
			}

			// styles
			if (options?.styles !== false) {
				if (shell.styles.length)
					this.styles = new Map();
				for (let path of shell.styles) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);

					/** @type {HTMLStyleElement} */
					let style = NodePath.resolve(root, path);
					if (rootEl.nodeType === 1) {
						Util.bindStyles(style, rootEl);
						this.styles.set(style, style.textContent);
					}
				}

			}
			// scripts
			if (options?.scripts !== false) {
				for (let path of shell.scripts) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let script = NodePath.resolve(root, path);
					eval(script.textContent)
				}
			}
		}
	}

	//#IFDEV
	getParentNode() {
		return this.startNode?.parentNode
	}

	get debug() {
		return [
			`parentNode: ${this.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item?.nodeType) {

					let tree = nodeToArrayTree(item, nextNode => {

						let path = this.paths.find(path=>(path instanceof ExprPathNodes) && path.getNodes().includes(nextNode));
						if (path)
							return [`Path.nodes:`]

						return [];
					})

					// TODO: How to indend nodes belonging to a path vs those that just occur after the path?
					return flattenAndIndent(tree)
				}
				else if (item instanceof ExprPath)
					return setIndent(item.debug, 1)
			}).flat(), 1)
		]
	}

	get debugNodes() { return this.getNodes() }


	get debugNodesHtml() { return this.getNodes().map(n => n.outerHTML || n.textContent) }

	verify() {
		if (!window.verify)
			return;

		assert(this.startNode)
		assert(this.endNode)
		//assert(this.startNode !== this.endNode) // This can be true.
		assert(this.startNode.parentNode === this.endNode.parentNode)

		// Only if connected:
		assert(!this.startNode.parentNode || this.startNode === this.endNode || this.startNode.compareDocumentPosition(this.endNode) === Node.DOCUMENT_POSITION_FOLLOWING)

		// if (this.parentPath)
		// 	assert(this.parentPath.nodeGroups.includes(this));

		for (let path of this.paths) {
			assert(path.parentNg === this)

			// Fails for detached NodeGroups.
			// NodeGroups get detached when their nodes are removed by udomdiff()
			let parentNode = this.getParentNode();
			if (parentNode)
				assert(this.getParentNode().contains(path.getParentNode()))
			path.verify();
			// TODO: Make sure path nodes are all within our own node range.
		}
		return true;
	}
	//#ENDIF
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