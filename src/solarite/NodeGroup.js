import {assert} from "../util/Errors.js";
import ExprPath, {PathType, resolveNodePath} from "./ExprPath.js";
import {getObjectHash} from "./hash.js";
import Shell from "./Shell.js";
import udomdiff from "./udomdiff.js";
import Util, {findArrayDiff, flattenAndIndent, isEvent, nodeToArrayTree, setIndent} from "./Util.js";
//import NodeGroupManager from "./NodeGroupManager.js";
import delve from "../util/delve.js";
import Globals from "./Globals.js";


/** @typedef {boolean|string|number|function|Object|Array|Date|Node} Expr */

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

	get pseudoRoot() {
		throw new Error('deprecated');
	}

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
	 * @deprecated
	 * @type {boolean} Used by NodeGroupManager. */
	inUse;

	/**
	 * @internal
	 * @type {Node[]} Cached result of getNodes() used only for improving performance.*/
	nodesCache;

	/**
	 * @type {?Map<HTMLStyleElement, string>} */
	styles;


	currentComponentProps = {};
	

	/**
	 * Create an "instantiated" NodeGroup from a Template and add it to an element.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param el {HTMLElement}
	 * @param parentPath {?ExprPath}
	 * @param exactKey {string}
	 * @param closeKey {string}
	 * @param options
	 * @returns {NodeGroup} */
	constructor(template, parentPath, exactKey, closeKey, el=null, options=null) {
		if (!(this instanceof RootNodeGroup)) {
			let [fragment, shell] = this.init(template, parentPath, exactKey, closeKey, el, options);

			this.updatePaths(fragment, shell.paths);

			this.activateEmbeds(fragment, shell);

			// Apply exprs
			this.applyExprs(template.exprs);
		}
	}

	init(template, parentPath, exactKey, closeKey, el=null, options=null) {
		this.exactKey = exactKey || template.getExactKey();
		this.closeKey = closeKey || template.getCloseKey();

		if (options)
			this.options = options;
		this.parentPath = parentPath;
		this.rootNg = parentPath?.parentNg?.rootNg || this;

		assert(this.rootNg);

		/** @type {Template} */
		this.template = template;

		// new!  Is this needed?
		template.nodeGroup = this;

		// Get a cached version of the parsed and instantiated html, and ExprPaths.
		let shell = Shell.get(template.html);
		let fragment = shell.fragment.cloneNode(true);

		// Figure out value of replaceMode option if it isn't set,
		// Assume replaceMode if there's only one child element and its tagname matches the root el.
		/*
		let replaceMode = fragment.children.length===1 &&
				fragment.firstElementChild?.tagName.replace(/-SOLARITE-PLACEHOLDER$/, '') === el?.tagName
		if (replaceMode) {
			let pseudoRoot = fragment.firstElementChild;
			// if (!manager.rootEl)
			// 	manager.rootEl = this.pseudoRoot;
		}
		let childNodes = replaceMode
			? fragment.firstElementChild.childNodes
			: fragment.childNodes;

		this.startNode = childNodes[0];
		this.endNode = childNodes[childNodes.length - 1];
		*/



		let childNodes = fragment.childNodes;
		this.startNode = childNodes[0];
		this.endNode = childNodes[childNodes.length - 1];

		// Update web component placeholders.
		// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
		// Is this list needed at all?
		//for (let component of shell.components)
		//	this.components.push(resolveNodePath(this.startNode.parentNode, getNodePath(component)))


		/*#IFDEV*/
		// this.verify()
		// assert(this.paths.length <= template.exprs.length);
		// if (template.exprs.length)
		// 	assert(this.paths.length);
		/*#ENDIF*/
		return [fragment, shell];
	}

	updatePaths(fragment, paths, offset) {
		// Update paths to point to the fragment.
		for (let oldPath of paths) {

			let path = oldPath.clone(fragment, offset)
			path.parentNg = this;
			this.paths.push(path);
		}
	}

	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param paths {?ExprPath[]} Optional.  */
	applyExprs(exprs, paths=null) {
		paths = paths || this.paths;
		
		/*#IFDEV*/this.verify();/*#ENDIF*/
		// Update exprs at paths.
		let exprIndex = exprs.length-1, expr, lastNode;

		// We apply them in reverse order so that a <select> box has its options created from an expression
		// before its value attribute is set via an expression.
		for (let path of paths.toReversed()) {
			expr = exprs[exprIndex];

			// Nodes
			if (path.type === PathType.Content) {
				this.applyNodeExpr(path, expr);
				/*#IFDEV*/path.verify()/*#ENDIF*/
			}

			// Attributes
			else {
				let node = path.nodeMarker;
				let el = node; //(this.manager?.rootEl && node === this.pseudoRoot) ? this.manager.rootEl : node;
				/*#IFDEV*/assert(node);/*#ENDIF*/

				// This is necessary both here and below.
				if (lastNode && lastNode !== this.rootNg.root && lastNode !== node && Object.keys(this.currentComponentProps).length) {
					this.applyComponentExprs(lastNode, this.currentComponentProps);
					this.currentComponentProps = {};
				}

				if (path.type === PathType.Multiple)
					path.applyMultipleAttribs(el, expr)

				// Capture attribute expressions to later send to the constructor of a web component.
				// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
				else if (path.nodeMarker !== this.rootNg.root && path.type === PathType.Component)
					this.currentComponentProps[path.attrName] = expr;
				
				else if (path.type === PathType.Comment) {
					// Expressions inside Html comments.  Deliberately empty because we won't waste time updating them.
				}
				else {

					// Event attribute value
					if (path.attrValue===null && (typeof expr === 'function' || Array.isArray(expr)) && isEvent(path.attrName)) {

						let root = this.getRootNode();

						path.applyEventAttrib(el, expr, root);
					}

					// Regular attribute value.
					else // One node value may have multiple expressions.  Here we apply them all at once.
						exprIndex = path.applyValueAttrib(el, exprs, exprIndex);
				}

				lastNode = path.nodeMarker;
			}

			exprIndex--;
		} // end for(path of this.paths)


		// Check again after we iterate through all paths to apply to a component.
		if (lastNode && lastNode !== this.rootNg.root && Object.keys(this.currentComponentProps).length) {
			this.applyComponentExprs(lastNode, this.currentComponentProps);
			this.currentComponentProps = {};
		}

		this.updateStyles();

		// Invalidate the nodes cache because we just changed it.
		this.nodesCache = null;

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		/*#IFDEV*/assert(exprIndex === -1);/*#ENDIF*/


		/*#IFDEV*/this.verify();/*#ENDIF*/
	}

	applyExpr(path, expr) {
		// TODO: Use this if I can figure out how to adapt applyValueAttrib() to it.
	}

	/**
	 * Insert/replace the nodes created by a single expression.
	 * Called by applyExprs()
	 * This function is recursive, as the functions it calls also call it.
	 * TODO: Move this to ExprPath?
	 * @param path {ExprPath}
	 * @param expr {Expr}
	 * @return {Node[]} New Nodes created. */
	applyNodeExpr(path, expr) {
		/*#IFDEV*/path.verify();/*#ENDIF*/

		/** @type {(Node|NodeGroup|Expr)[]} */
		let newNodes = [];
		let oldNodeGroups = path.nodeGroups;
		/*#IFDEV*/assert(!oldNodeGroups.includes(null))/*#ENDIF*/
		let secondPass = []; // indices

		// First Pass
		//for (let ng of path.nodeGroups) // TODO: Is this necessary?
		//	ng.parentPath = null;
		path.nodeGroups = []; // TODO: Is this used?
		path.apply(expr, newNodes, secondPass);

		this.existingTextNodes = null;

		// TODO: Create an array of old vs Nodes and NodeGroups together.
		// If they're all the same, skip the next steps.
		// Or calculate it in the loop above as we go?  Have a path.lastNodeGroups property?

		// Second pass to find close-match NodeGroups.
		let flatten = false;
		if (secondPass.length) {
			for (let [nodesIndex, ngIndex] of secondPass) {
				let ng = this.manager.getNodeGroup(newNodes[nodesIndex], false, false);
				
				ng.parentPath = path;
				let ngNodes = ng.getNodes();

				/*#IFDEV*/assert(!(newNodes[nodesIndex] instanceof NodeGroup))/*#ENDIF*/
				
				if (ngNodes.length === 1)
					newNodes[nodesIndex] = ngNodes[0];
				
				else {
					newNodes[nodesIndex] = ngNodes;
					flatten = true;
				}
				path.nodeGroups[ngIndex] = ng;
			}

			if (flatten)
				newNodes = newNodes.flat(); // TODO: Only if second pass happens?
		}

		/*#IFDEV*/assert(!path.nodeGroups.includes(null))/*#ENDIF*/


	
		let oldNodes = path.getNodes();
		path.nodesCache = newNodes; // Replaces value set by path.getNodes()


		// This pre-check makes it a few percent faster?
		let diff = findArrayDiff(oldNodes, newNodes);
		if (diff !== false) {

			if (this.parentPath)
				this.parentPath.clearNodesCache();

			// Fast clear method
			let isNowEmpty = oldNodes.length && !newNodes.length;
			if (!isNowEmpty || !path.fastClear(oldNodes, newNodes))

				// Rearrange nodes.
				udomdiff(path.parentNode, oldNodes, newNodes, path.nodeMarker)

			this.saveOrphans(oldNodeGroups, oldNodes);
		}
		/*#IFDEV*/path.verify();/*#ENDIF*/
	}
	
	/**
	 * Find NodeGroups that had their nodes removed and add those nodes to a Fragment so
	 * they're not lost forever and the NodeGroup's internal structure is still consistent.
	 * Called from NodeGroup.applyNodeExpr().
	 * @param oldNodeGroups {NodeGroup[]}
	 * @param oldNodes {Node[]} */
	saveOrphans(oldNodeGroups, oldNodes) {
		let oldNgMap = new Map();
		for (let ng of oldNodeGroups) {
			oldNgMap.set(ng.startNode, ng)
			
			// TODO: Is this necessary?
			// if (ng.parentPath)
			// 	ng.parentPath.clearNodesCache();
		}

		for (let i=0, node; node = oldNodes[i]; i++) {
			let ng;
			if (!node.parentNode && (ng = oldNgMap.get(node))) {
				let fragment = document.createDocumentFragment();
				let endNode = ng.endNode;
				while (node !== endNode) {
					fragment.append(node)
					i++;
					node = oldNodes[i];
				}
				fragment.append(endNode);
			}
		}
	}

	/**
	 * Create a nested RedComponent or call render with the new props.
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

		// Update params of placeholder.
		else if (el.render) {
			let oldHash = Globals.componentHash.get(el);
			if (oldHash !== newHash)
				el.render(props); // Pass new values of props to render so it can decide how it wants to respond.
		}

		Globals.componentHash.set(el, newHash);
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
			? el.tagName.endsWith('-SOLARITE-PLACEHOLDER')
				? el.tagName.slice(0, -21)
				: el.tagName
			: el.getAttribute('is')).toLowerCase();

		let dynamicProps = {...(props || {})}
		
		// Pass other attribs to constructor, since otherwise they're not yet set on the element,
		// and the constructor would otherwise have no way to see them.
		if (el.attributes.length) {
			if (!props)
				props = {};
			for (let attrib of el.attributes)
				if (!props.hasOwnProperty(attrib.name))
					props[attrib.name] = attrib.value;
		}
		
		// Create CustomElement and
		let Constructor = customElements.get(tagName);
		if (!Constructor)
			throw new Error(`The custom tag name ${tagName} is not registered.`)

		// We pass the childNodes to the constructor so it can know about them,
		// instead of only afterward when they're appended to the slot below.
		// This is useful for a custom selectbox, for example.
		// Globals.pendingChildren stores the childen so the super construtor call to Solarite's constructor
		// can add them as children before the rest of the constructor code executes.
		let ch = [... el.childNodes];
		Globals.pendingChildren.push(ch);  // pop() is called in Solarite constructor.
		let newEl = new Constructor(props, ch);

		if (!isPreHtmlElement)
			newEl.setAttribute('is', el.getAttribute('is').toLowerCase())
		el.replaceWith(newEl);
		
		// Set children / slot children
		// TODO: Match named slots.
		// TODO: This only appends to slot if render() is called in the constructor.
		//let slot = newEl.querySelector('slot') || newEl;
		//slot.append(...el.childNodes);
		
		// Copy over event attributes.
		for (let propName in props) {
			let val = props[propName];
			if (propName.startsWith('on') && typeof val === 'function')
				newEl.addEventListener(propName.slice(2), e => val(e, newEl));

			// Bind array based event attributes on value.
			// This same logic is in ExprPath.applyValueAttrib() for non-components.
			if ((propName === 'value' || propName === 'data-value') && Util.isPath(val)) {
				let [obj, path] = [val[0], val.slice(1)];
				newEl.value = delve(obj, path);
				newEl.addEventListener('input', e => {
					delve(obj, path, Util.getInputValue(newEl));
				}, true); // We use capture so we update the values before other events added by the user.
			}
		}
		
		// If an id pointed at the placeholder, update it to point to the new element.
		let id = el.getAttribute('data-id') || el.getAttribute('id');
		if (id)
			delve(this.manager.rootEl, id.split(/\./g), newEl);
		
		
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
		for (let name in dynamicProps) {
			let val = dynamicProps[name];
			if (typeof val === 'boolean') {
				if (val !== false && val !== undefined && val !== null)
					newEl.setAttribute(name, '');
			}

			// If type isn't an object or array, set the attribute.
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
	 * Get the root element of the NodeGroup's RootNodeGroup
	 * This function is poorly tested and may be unreliable.
	 * @returns {Node|DocumentFragment}	 */
	getRootNode() {
		return this.rootNg.root;

		// old:
		// Find the most ancestral NdoeGroup
		let ng = this;
		while (ng.parentPath?.parentNg)
			ng = ng.parentPath?.parentNg;

		// Return single child of the nodes, or a DocumentFragment containing several.
		let result = this.startNode.parentNode;
		if (result instanceof DocumentFragment) {
			let children = Util.trimEmptyNodes(result.childNodes);
			if (children.length === 1)
				return children[0];
		}
		return result;
	}

	/**
	 * @returns {RootNodeGroup} */
	getRootNodeGroup() {
		return this.rootNg;
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
						
						let path = this.paths.find(path=>path.type === PathType.Content && path.getNodes().includes(nextNode));
						if (path)
							return [`Path[${path.parentIndex}].nodes:`]
						
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
	 * @param root {HTMLElement}
	 * @param shell {Shell} */
	activateEmbeds(root, shell, pathOffset=0) {

		// static components.  These are WebComponents not created by an expression.
		// Must happen before ids.
		for (let path of shell.staticComponents) {
			let el = resolveNodePath(root, path.slice(pathOffset))

			// Shell doesn't know if a web component is the pseudoRoot so we have to detect it here.
			if (root !== el && !isReplaceEl(root, el)) // TODO: is isReplaceEl necessary?
				this.createNewComponent(el)
		}

		let rootEl = this.rootNg.root;
		if (rootEl) {

			// ids
			if (this.options?.ids !== false)
				for (let path of shell.ids) {
					let el = resolveNodePath(root, path.slice(pathOffset));
					let id = el.getAttribute('data-id') || el.getAttribute('id');
					if (id) { // If something hasn't removed the id.

						// Don't allow overwriting existing class properties if they already have a non-Node value.
						if (rootEl[id] && !(rootEl[id] instanceof Node))
							throw new Error(`${rootEl.constructor.name}.${id} already has a value.  ` +
								`Can't set it as a reference to <${el.tagName.toLowerCase()} id="${id}">`);

						delve(rootEl, id.split(/\./g), el);
					}
				}

			// styles
			if (this.options?.styles !== false) {
				if (shell.styles.length)
					this.styles = new Map();
				for (let path of shell.styles) {
					let style = resolveNodePath(root, path.slice(pathOffset));
					Util.bindStyles(style, rootEl);
					this.styles.set(style, style.textContent);
				}

			}
			// scripts
			if (this.options?.scripts !== false) {
				for (let path of shell.scripts) {
					let script = resolveNodePath(root, path.slice(pathOffset));
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
	 *
	 * @param template
	 * @param el
	 * @param options {?object}
	 */
	constructor(template, el, options) {
		super(template, null, null, null, el, options);

		this.options = options;
		this.root = el;
		this.rootNg = this;
		let [fragment, shell] = this.init(template, null, null, null, el, options);

		// If adding NodeGroup to an element.
		let offset = 0;
		let root = fragment;
		if (el) {

			// If el should replace the root node of the fragment.
			// TODO: Check for text node children.
			if (isReplaceEl(fragment, el)) {
				el.append(...fragment.children[0].childNodes);

				// TODO: Copy attributes

				offset = 1;
			}
			else
				el.append(...fragment.childNodes);

			root = el;
			this.startNode = el;
			this.endNode = el;
		}

		this.updatePaths(root, shell.paths, offset);

		this.activateEmbeds(root, shell, offset);

		// Apply exprs
		this.applyExprs(template.exprs);
	}
}

function isReplaceEl(fragment, el) {
	return el.tagName.includes('-')
		&& fragment.children.length===1
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === el.tagName;
}