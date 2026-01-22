import {assert} from "./assert.js";
import Util, {flattenAndIndent, nodeToArrayTree, setIndent} from "./Util.js";
import delve from "./delve.js";
import Shell from "./Shell.js";
import RootNodeGroup from './RootNodeGroup.js';
import ExprPath, {ExprPathType} from "./ExprPath.js";
import Globals from './Globals.js';
import NodePath from "./NodePath.js";
import ExprPathComponent from "./ExprPathComponent.js";

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

	/** @deprecated for components. */
	staticComponents = [];

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

						// Save slot children (deprecated)
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
								if (!this.root.hasAttribute(attrib.name) && attrib.name !== 'solarite-placeholder')
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
					//this.components = this.resolvePaths(this.root, shell.componentPaths, startingPathDepth).map(c => new ComponentInfo(c));
					//this.staticComponents = this.findStaticComponents(this.root, shell, startingPathDepth);
					//this.activateEmbeds(this.root, shell, startingPathDepth);
				}
				this.startNode = this.endNode = this.root;

				Globals.rootNodeGroups.set(this.root, this);
			} // end if RootNodeGroup

			else if (shell) {
				if (template.exprs.length) {
					this.setPathsFromFragment(shellFragment, shell.paths);
				//	this.staticComponents = this.findStaticComponents(shellFragment, shell);
				}

				//this.components = this.resolvePaths(shellFragment, shell.componentPaths, 0).map(c => new ComponentInfo(c));

				this.activateEmbeds(shellFragment, shell);
			}
		}
	}


	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param paths {?ExprPath[]} Optional.  Only used for testing.  Normally uses this.paths.  */
	applyExprs(exprs, paths=null) {
		paths = paths || this.paths;

		/*#IFDEV*/
		this.verify();/*#ENDIF*/

		// Things to consider:
		// 1. Paths consume a varying number of expressions.
		//    An ExprPathAttribs may use multipe expressions.  E.g. <div class="${1} ${2}">
		//    While an ExprPathComponent uses zero.
		// 2. An ExprPathComponent references other ExprPaths that set its attribute values.
		// 3. We apply them in reverse order so that a <select> box has its children created from an expression
		//    before its instantiated and its value attribute is set via an expression.

		let exprIndex = exprs.length - 1; // Update exprs at paths.
		let lastComponentPathIndex;
		let pathExprs = new Array(paths.length); // Store all the expressions that map to a single path.  Only paths to attribute values can have more than one.
		for (let i = paths.length - 1, path; path = paths[i]; i--) {
			let prevPath = paths[i - 1];
			let nextPath = paths[i + 1];


			// Component expressions don't have a correspdinging user-provided expression.
			if (path instanceof ExprPathComponent) {
				path.applyComponent();
			}
			else {

				// Get the expressions associated with this path.
				if (path.attrValue?.length > 2) {
					let startIndex = (exprIndex - (path.attrValue.length - 1)) + 1;
					pathExprs[i] = exprs.slice(startIndex, exprIndex + 1); // probably doesn't allocate if the JS vm implements copy on write.
					exprIndex -= pathExprs[i].length;
				} else {
					pathExprs[i] = [exprs[exprIndex]];
					exprIndex--;
				}


				// TODO: Need to end and restart this block when going from one component to the next?
				// Think of having two adjacent components.
				// But the dynamicAttribsAdjacet test already passes.

				// If expr is an attribute in a component:
				// 1. Instantiate it if it hasn't already been, sending all expr's to its constructor.
				// 2. Otherwise send them to its render function.
				// Components with no expressions as attributes are instead activated in activateEmbeds().
				// if (path.nodeMarker !== this.rootNg.root && path.isComponent) {
				//
				// 	if (!nextPath || !nextPath.isComponent || nextPath.nodeMarker !== path.nodeMarker)
				// 		lastComponentPathIndex = i;
				// 	let isFirstComponentPath = !prevPath || !prevPath.isComponent || prevPath.nodeMarker !== path.nodeMarker;
				//
				// 	if (isFirstComponentPath) {
				//
				// 		let componentProps = {}
				// 		for (let j=i; j<=lastComponentPathIndex; j++) {
				// 			let attrName = paths[j].attrName; // Util.dashesToCamel(paths[j].attrName);
				// 			componentProps[attrName] = pathExprs[j].length > 1 ? pathExprs[j].join('') : pathExprs[j][0];
				// 		}
				//
				// 		this.handleComponent(path.nodeMarker, componentProps, true);
				//
				// 		// Set attributes on component.
				// 		for (let j=i; j<=lastComponentPathIndex; j++)
				// 			paths[j].apply(pathExprs[j]);
				// 	}
				// }
				//
				// // Else apply it normally
				// else
				path.apply(pathExprs[i]);
			}


		} // end for(path of this.paths)


		// TODO: Only do this if we have ExprPaths within styles?
		this.updateStyles();

		// Call render() on static web components. This makes the component.staticAttribs() test work.
		for (let el of this.staticComponents)
			if (el.render)
				el.render(Util.attribsToObject(el)); // It has no expressions.

		// Invalidate the nodes cache because we just changed it.
		this.nodesCache = null;

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		/*#IFDEV*/
		assert(exprIndex === -1);/*#ENDIF*/


		/*#IFDEV*/
		this.verify();/*#ENDIF*/
	}

	/**
	 * @deprecated for applyComponent()
	 * Ensure:
	 * 1. a child component is instantiated (if it's a placeholder)
	 * 2. It's rendered if doRender=true
	 * @param el {HTMLElement}
	 * @param props {?Object}
	 * @param doRender {boolean}
	 * @return {HTMLElement} The (possibly replaced) element. */
	handleComponent(el, props=null, doRender=true) {
		debugger;
		let isPreHtmlElement = el.hasAttribute('solarite-placeholder');
		let isPreIsElement = el.hasAttribute('_is');
		let attribs, children;
		if (isPreHtmlElement || isPreIsElement)
			[el, attribs, children] = this.instantiateComponent(el, isPreHtmlElement, props); // calls render()
		if (doRender && el.render /*&& !el.renderFirstTime*/) { // If render not already called.  But enabling this breaks tests.
			if (!attribs) { // if not set by instantiateComponent
				attribs = Util.attribsToObject(el, 'solarite-placeholder');
				for (let name in props || {})
					attribs[Util.dashesToCamel(name)] = props[name];
				children = RootNodeGroup.getSlotChildren(el);
			}
			el.render(attribs, children);
		}
		return el;
	}
	
	/**
	 * @deprecated for constructComponent()
	 * We swap the placeholder element for the real element so we can pass its dynamic attributes
	 * to its constructor.
	 * This is only called by handleComponent()
	 * This does not call render()
	 *
	 * @param el {HTMLElement}
	 * @param isPreHtmlElement {?boolean} True if the element's tag name ends with -solarite-placeholder
	 * @param props {Object} Attributes with dynamic values.
	 * @return {[HTMLElement, attribs:Object, children:Node[]]}} */
	instantiateComponent(el, isPreHtmlElement=undefined, props=undefined) {
		debugger;
		if (isPreHtmlElement === undefined)
			isPreHtmlElement = !el.hasAttribute('_is');

		let tagName = (isPreHtmlElement
			? el.tagName.slice(0, -21) // Remove -SOLARITE-PLACEHOLDER
			: el.getAttribute('is')).toLowerCase();


		// Throw if custom element isn't defined.
		let Constructor = customElements.get(tagName);
		if (!Constructor)
			throw new Error(`The custom tag name ${tagName} is not registered.`)

		// Pass other attribs to constructor, since otherwise they're not yet set on the element,
		// and the constructor would otherwise have no way to see them.
		let attribs = Util.attribsToObject(el, 'solarite-placeholder');
		for (let name in props || {})
			attribs[Util.dashesToCamel(name)] = props[name];


		// Create the web component.
		// Get the children that aren't Solarite's comment placeholders.
		let children = RootNodeGroup.getSlotChildren(el);
		let newEl = new Constructor(attribs, children);

		if (!isPreHtmlElement)
			newEl.setAttribute('is', el.getAttribute('is').toLowerCase());

		// Replace the placeholder tag with the instantiated web component.
		//#IFDEV
		assert(!Globals.currentSlotChildren); // Make sure we're not recursing.  If so we need to make it a stack.
		//#ENDIF

		Globals.currentSlotChildren = children; // Used by RootNodeGroup slot code.
		el.replaceWith(newEl); // Calls render() when it's a Solarite component and it's added to the DOM
		Globals.currentSlotChildren = null;

		// If an id pointed at the placeholder, update it to point to the new element.
		let id = el.getAttribute('data-id') || el.getAttribute('id');
		if (id)
			delve(this.getRootNode(), id.split(/\./g), newEl);


		// Update paths to use replaced element.
		for (let path of this.paths) {
			if (path.nodeMarker === el)
				path.nodeMarker = newEl;
			if (path.nodeBefore === el)
				path.nodeBefore = newEl;
		}
		if (this.startNode === el)
			this.startNode = newEl;
		if (this.endNode === el)
			this.endNode = newEl;

		// This is used only if inheriting from the Solarite class.
		// applyComponentExprs() is called because we're rendering.
		// So we want to render the sub-component also.
		if (newEl.renderFirstTime)
			newEl.renderFirstTime();

		// Copy attributes over.
		for (let attrib of el.attributes)
			if (attrib.name !== '_is' && attrib.name !== 'solarite-placeholder')
				newEl.setAttribute(attrib.name, attrib.value);



		return [newEl, attribs, children];
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
	 * Requires the nodeCache to be present. */
	removeAndSaveOrphans() {
		/*#IFDEV*/assert(this.nodesCache);/*#ENDIF*/
		let fragment = Globals.doc.createDocumentFragment();
		fragment.append(...this.getNodes());
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

	//#IFDEV
	getParentNode() {
		return this.startNode?.parentNode
	}


	/**
	 * @deprecated
	 * An interleaved array of sets of nodes and top-level ExprPaths
	 * @type {(Node|HTMLElement|ExprPath)[]} */
	get nodes() { throw new Error('')};

	get debug() {
		return [
			`parentNode: ${this.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item?.nodeType) {

					let tree = nodeToArrayTree(item, nextNode => {

						let path = this.paths.find(path=>path.type === ExprPathType.Content && path.getNodes().includes(nextNode));
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


	/**
	 * This can be static.
	 * @param root {HTMLElement|DocumentFragment}
	 * @param paths {int[][]}
	 * @param startingPathDepth
	 * @returns {HTMLElement[]} */
	resolvePaths(root, paths, startingPathDepth=0) {
		let result = [];
		for (let path of paths) {
			if (startingPathDepth)
				path = path.slice(0, -startingPathDepth);
			if (!path.length) {// Don't find ourself
			//	debugger; // This shouldn't happen?
				continue;
			}
			let el = NodePath.resolve(root, path);
			result.push(el);
		}
		return result;
	}

	/** @deprecated */
	findStaticComponents(root, shell, startingPathDepth=0) {
		let result = [];

		// static components.  These are WebComponents that do not have any constructor arguments that are expressions.
		// Those are instead created by applyExpr() which calls applyComponentExprs() which calls instantiateComponent().
		// Maybe someday these two paths will be merged?
		// Must happen before ids because instantiateComponent will replace the element.
		for (let path of shell.staticComponentPaths) {

			if (startingPathDepth)
				path = path.slice(0, -startingPathDepth);
			if (!path.length) // Don't find ourself
				continue;
			let el = NodePath.resolve(root, path);
			result.push(el);
		}
		return result;
	}

	/** @deprecated */
	instantiateStaticComponents(staticComponents) {
		// TODO: Why do we not call render() on the static component here?  The tests pass either way.
		for (let i in staticComponents)
			staticComponents[i] = this.handleComponent(staticComponents[i], null, false);
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
		&& tagName.includes('-') // TODO: Check for solarite-placeholder attribute instead?
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === tagName;
}