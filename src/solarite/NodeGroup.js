import {assert} from "../util/Errors.js";
import ExprPath, {ExprPathType, resolveNodePath} from "./ExprPath.js";
import {getObjectHash} from "./hash.js";
import Shell from "./Shell.js";
import Util, {flattenAndIndent, nodeToArrayTree, setIndent} from "./Util.js";
//import NodeGroupManager from "./NodeGroupManager.js";
import delve from "../util/delve.js";
import Globals from "./Globals.js";


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
	 * An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.*/
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


	/**
	 * Create an "instantiated" NodeGroup from a Template and add it to an element.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param parentPath {?ExprPath} */
	constructor(template, parentPath=null) {
		if (!(this instanceof RootNodeGroup)) {
			let [fragment, shell] = this.init(template, parentPath);

			this.updatePaths(fragment, shell.paths);

			// Static web components can sometimes have children created via expressions.
			// But calling applyExprs() will mess up the shell's path to them.
			// So we find them first, then call activateStaticComponents() after their children have been created.
			let staticComponents = this.findStaticComponents(fragment, shell);

			this.activateEmbeds(fragment, shell);

			// Apply exprs
			this.applyExprs(template.exprs);

			this.activateStaticComponents(staticComponents);

		}
	}

	/**
	 * Common init shared by RootNodeGroup and NodeGroup constructors.
	 * But in a separate function because they need to do this at a different step.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param parentPath {?ExprPath}
	 * @param exactKey {?string} Optional, if already calculated.
	 * @param closeKey {?string}
	 * @returns {[DocumentFragment, Shell]} */
	init(template, parentPath=null, exactKey=null, closeKey=null) {
		this.exactKey = exactKey || template.getExactKey();
		this.closeKey = closeKey || template.getCloseKey();

		this.parentPath = parentPath;
		this.rootNg = parentPath?.parentNg?.rootNg || this;

		/*#IFDEV*/assert(this.rootNg);/*#ENDIF*/

		/** @type {Template} */
		this.template = template;

		// new!  Is this needed?
		template.nodeGroup = this;

		// Get a cached version of the parsed and instantiated html, and ExprPaths.
		let shell = Shell.get(template.html);
		let fragment = shell.fragment.cloneNode(true);

		let childNodes = fragment.childNodes;
		this.startNode = childNodes[0];
		this.endNode = childNodes[childNodes.length - 1];

		return [fragment, shell];
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
		// 1. One path may use multipe expressions.  E.g. <div class="${1} ${2}">
		// 2. One component may need to use multiple attribute paths to be instantiated.
		// 3. We apply them in reverse order so that a <select> box has its children created from an expression
		//    before its instantiated and its value attribute is set via an expression.

		let exprIndex = exprs.length - 1; // Update exprs at paths.
		let lastComponentPathIndex;
		let pathExprs = new Array(paths.length); // Store all the expressions that map to a single path.  Only paths to attribute values can have more than one.
		for (let i = paths.length - 1, path; path = paths[i]; i--) {
			let prevPath = paths[i - 1];
			let nextPath = paths[i + 1];

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

			// If a component:
			// 1. Instantiate it if it hasn't already been, sending all expr's to its constructor.
			// 2. Otherwise send them to its render function.
			// Components with no expressions as attributes are instead activated in activateEmbeds().
			if (path.nodeMarker !== this.rootNg.root && path.isComponent()) {

				if (!nextPath || !nextPath.isComponent() || nextPath.nodeMarker !== path.nodeMarker)
					lastComponentPathIndex = i;
				let isFirstComponentPath = !prevPath || !prevPath.isComponent() || prevPath.nodeMarker !== path.nodeMarker;

				if (isFirstComponentPath) {

					let componentProps = {}
					for (let j=i; j<=lastComponentPathIndex; j++) {
						let attrName = paths[j].attrName; // Util.dashesToCamel(paths[j].attrName);
						componentProps[attrName] = pathExprs[j].length > 1 ? pathExprs[j].join('') : pathExprs[j][0];
					}

					this.applyComponentExprs(path.nodeMarker, componentProps);

					// Set attributes on component.
					for (let j=i; j<=lastComponentPathIndex; j++)
						paths[j].apply(pathExprs[j]);
				}
			}

			// Else apply it normally
			else
				path.apply(pathExprs[i]);


		} // end for(path of this.paths)


		// TODO: Only do this if we have ExprPaths within styles?
		this.updateStyles();

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
	 * Create a nested Component or call render with the new props.
	 * @param el {Solarite:HTMLElement}
	 * @param props {Object} */
	applyComponentExprs(el, props) {

		// TODO: Does a hash of this already exist somewhere?
		// Perhaps if Components were treated as child NodeGroups, which would need to be the child of an ExprPath,
		// then we could re-use the hash and logic from NodeManager?
		let newHash = getObjectHash(props);

		let isPreHtmlElement = el.tagName.endsWith('-SOLARITE-PLACEHOLDER');
		let isPreIsElement = el.hasAttribute('_is')


		// Instantiate a placeholder.
		if (isPreHtmlElement || isPreIsElement)
			el = this.createNewComponent(el, isPreHtmlElement, props);

		// Call render() with the same params that would've been passed to the constructor.
		else if (el.render) {
			let oldHash = Globals.componentArgsHash.get(el);
			if (oldHash !== newHash) {
				let args = {};
				for (let name in props || {})
					args[Util.dashesToCamel(name)] = props[name];
				el.render(args); // Pass new values of props to render so it can decide how it wants to respond.
			}
		}

		Globals.componentArgsHash.set(el, newHash);
	}
	
	/**
	 * We swap the placeholder element for the real element so we can pass its dynamic attributes
	 * to its constructor.
	 *
	 * The logic of this function is complex and could use cleaning up.
	 *
	 * @param el
	 * @param isPreHtmlElement
	 * @param props {Object} Attributes with dynamic values.
	 * @return {HTMLElement} */
	createNewComponent(el, isPreHtmlElement=undefined, props=undefined) {
		if (isPreHtmlElement === undefined)
			isPreHtmlElement = !el.hasAttribute('_is');
		
		let tagName = (isPreHtmlElement
			? el.tagName.slice(0, -21) // Remove -SOLARITE-PLACEHOLDER
			: el.getAttribute('is')).toLowerCase();


		// Throw if custom element isn't defined.
		let Constructor = customElements.get(tagName);
		if (!Constructor)
			throw new Error(`The custom tag name ${tagName} is not registered.`)

		let args = {};
		for (let name in props || {})
			args[Util.dashesToCamel(name)] = props[name];
		
		// Pass other attribs to constructor, since otherwise they're not yet set on the element,
		// and the constructor would otherwise have no way to see them.
		if (el.attributes.length) {
			for (let attrib of el.attributes) {
				let attribName = Util.dashesToCamel(attrib.name);
				if (!args.hasOwnProperty(attribName))
					args[attribName] = attrib.value;
			}
		}

		// Create the web component.
		// Get the children that aren't Solarite's comment placeholders.
		let ch = [...el.childNodes].filter(node => node.nodeType !== Node.COMMENT_NODE || !node.nodeValue.startsWith('ExprPath'));
		let newEl = new Constructor(args, ch);

		if (!isPreHtmlElement)
			newEl.setAttribute('is', el.getAttribute('is').toLowerCase());

		// Replace the placeholder tag with the instantiated web component.
		el.replaceWith(newEl);

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
		
		
		// applyComponentExprs() is called because we're rendering.
		// So we want to render the sub-component also.
		if (newEl.renderFirstTime)
			newEl.renderFirstTime();

		// Copy attributes over.
		for (let attrib of el.attributes)
			if (attrib.name !== '_is')
				newEl.setAttribute(attrib.name, attrib.value);

		// Set dynamic attributes if they are primitive types.
		for (let name in props) {
			let val = props[name];
			if (typeof val === 'boolean') {
				if (val !== false && val !== undefined && val !== null)
					newEl.setAttribute(name, '');
			}

			// If type is a non-boolean primitive, set the attribute value.
			else if (['number', 'bigint', 'string'].includes(typeof val))
				newEl.setAttribute(name, val);
		}
		
		return newEl;
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

	getParentNode() {
		return this.startNode?.parentNode
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
		let fragment = document.createDocumentFragment();
		for (let node of this.getNodes())
			fragment.append(node);
	}


	updatePaths(fragment, paths, offset) {
		// Update paths to point to the fragment.
		this.paths.length = paths.length;
		for (let i=0; i<paths.length; i++) {
			let path = paths[i].clone(fragment, offset)
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
				if (item instanceof Node) {
					
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

	findStaticComponents(root, shell, pathOffset=0) {
		let result = [];

		// static components.  These are WebComponents that do not have any constructor arguments that are expressions.
		// Those are instead created by applyExpr() which calls applyComponentExprs() which calls createNewcomponent().
		// Maybe someday these two paths will be merged?
		// Must happen before ids because createNewComponent will replace the element.
		for (let path of shell.staticComponents) {
			if (pathOffset)
				path = path.slice(0, -pathOffset);
			let el = resolveNodePath(root, path);

			// Shell doesn't know if a web component is the pseudoRoot so we have to detect it here.
			// Recreating it is necessary so we can pass the constructor args to it.
			if (root !== el/* && !isReplaceEl(root, el)*/) // TODO: is isReplaceEl necessary?
				result.push(el);
		}
		return result;
	}

	activateStaticComponents(staticComponents) {
		for (let el of staticComponents)
			this.createNewComponent(el)
	}

	/**
	 * @param root {HTMLElement}
	 * @param shell {Shell}
	 * @param pathOffset {int} */
	activateEmbeds(root, shell, pathOffset=0) {

		let rootEl = this.rootNg.root;
		if (rootEl) {

			// ids
			if (this.options?.ids !== false)
				for (let path of shell.ids) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let el = resolveNodePath(root, path);
					Util.bindId(rootEl, el);
				}

			// styles
			if (this.options?.styles !== false) {
				if (shell.styles.length)
					this.styles = new Map();
				for (let path of shell.styles) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);

					/** @type {HTMLStyleElement} */
					let style = resolveNodePath(root, path);
					if (rootEl.nodeType === 1) {
						Util.bindStyles(style, rootEl);
						this.styles.set(style, style.textContent);
					}
				}

			}
			// scripts
			if (this.options?.scripts !== false) {
				for (let path of shell.scripts) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let script = resolveNodePath(root, path);
					eval(script.textContent)
				}
			}
		}
	}
}


export class RootNodeGroup extends NodeGroup {

	/**
	 * Root node at the top of the hierarchy.
	 * @type {HTMLElement} */
	root;

	/**
	 * Store the ExprPaths that use each watched variable.
	 * @type {Object<field:string, Set<ExprPath>>} */
	watchedExprPaths = {};



	/**
	 * Store the ExprPaths that use each watched variable.
	 * @type {Object<path:string, Set<ExprPath>>} */
	watchedExprPaths2 = {};

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
					if (!el.hasAttribute(attrib.name))
						el.setAttribute(attrib.name, attrib.value);

				// Go one level deeper into all of shell's paths.
				offset = 1;
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

			root = el;

			this.startNode = el;
			this.endNode = el;
		}
		else {
			let singleEl = getSingleEl(fragment);
			this.root = singleEl || fragment; // We return the whole fragment when calling r() with a collection of nodes.

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
		let staticComponents = this.findStaticComponents(root, shell, offset);

		this.activateEmbeds(root, shell, offset, template);

		// Apply exprs
		this.applyExprs(template.exprs);

		this.activateStaticComponents(staticComponents);
	}

	clearRenderWatched() {
		this.watchedExprPaths = {};
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
	return el.tagName.includes('-')
		&& fragment.children.length===1
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === el.tagName;
}