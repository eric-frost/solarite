import {assert} from "../util/Errors.js";
import ExprPath, {PathType, resolveNodePath} from "./ExprPath.js";
import {getObjectHash} from "./hash.js";
import Shell from "./Shell.js";
import udomdiff from "./udomdiff.js";
import Util, {arraySame, flattenAndIndent, isEvent, nodeToArrayTree, setIndent} from "./Util.js";
//import NodeGroupManager from "./NodeGroupManager.js";
import delve from "../util/delve.js";
import Globals from "./Globals.js";
import MultiValueMap from "../util/MultiValueMap.js";


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
	 * @type {?Map<HTMLStyleElement, string>} */
	styles;

	currentComponentProps = {};
	

	/**
	 * Create an "instantiated" NodeGroup from a Template and add it to an element.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param parentPath {?ExprPath} */
	constructor(template, parentPath=null) {
		if (!(this instanceof RootNodeGroup)) {
			let [fragment, shell] = this.init(template, parentPath);

			this.updatePaths(fragment, shell.paths);

			this.activateEmbeds(fragment, shell);

			// Apply exprs
			this.applyExprs(template.exprs);
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

			// This is necessary both here and below.
			if (lastNode && lastNode !== this.rootNg.root && lastNode !== path.nodeMarker && Object.keys(this.currentComponentProps).length) {
				this.applyComponentExprs(lastNode, this.currentComponentProps);
				this.currentComponentProps = {};
			}

			exprIndex = path.apply(expr, exprs, exprIndex, this.currentComponentProps);

			lastNode = path.nodeMarker;


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
					let value = (propName === 'value')
						? Util.getInputValue(newEl)
						: newEl[propName];
					delve(obj, path, value);
				}, true); // We use capture so we update the values before other events added by the user.
			}
		}
		
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
	saveOrphans() {
		/*#IFDEV*/assert(!this.startNode.parentNode);/*#ENDIF*/
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
						
						let path = this.paths.find(path=>path.type === PathType.Content && path.getNodes().includes(nextNode));
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
	 * @param root {HTMLElement}
	 * @param shell {Shell}
	 * @param pathOffset {int} */
	activateEmbeds(root, shell, pathOffset=0) {

		// static components.  These are WebComponents not created by an expression.
		// Must happen before ids.
		for (let path of shell.staticComponents) {
			if (pathOffset)
				path = path.slice(0, -pathOffset);
			let el = resolveNodePath(root, path);

			// Shell doesn't know if a web component is the pseudoRoot so we have to detect it here.
			if (root !== el/* && !isReplaceEl(root, el)*/) // TODO: is isReplaceEl necessary?
				this.createNewComponent(el)
		}

		let rootEl = this.rootNg.root;
		if (rootEl) {

			// ids
			if (this.options?.ids !== false)
				for (let path of shell.ids) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let el = resolveNodePath(root, path);
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
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let style = resolveNodePath(root, path);
					Util.bindStyles(style, rootEl);
					this.styles.set(style, style.textContent);
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
	 * Store the expressions that use this watched variable,
	 * along with the functions used to get their values.
	 * @type {Object<field:string, Set<ExprPath>>} */
	watchedExprPaths = {};

	/**
	 * Map from arrays where .map is called and their callback functions.
	 * TODO: One array might be called with two different map functions in different places!
	 * @type {Map<Array, function>} */
	mapCallbacks = new Map();

	/**
	 *
	 * @type {Map<ExprPath, boolean|Array>} */
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
			let slotFragment;
			if (el.childNodes.length) {
				slotFragment = document.createDocumentFragment();
				slotFragment.append(...el.childNodes);
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

			// Setup slots
			if (slotFragment) {
				for (let slot of el.querySelectorAll('slot[name]')) {
					let name = slot.getAttribute('name')
					if (name) {
						let slotChildren = slotFragment.querySelectorAll(`[slot='${name}']`);
						slot.append(...slotChildren);
					}
				}
				let unamedSlot = el.querySelector('slot:not([name])')
				if (unamedSlot)
					unamedSlot.append(slotFragment);
				else
					el.append(slotFragment);
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

		this.activateEmbeds(root, shell, offset);

		// Apply exprs
		this.applyExprs(template.exprs);
	}

	clearRenderWatched() {
		this.watchedExprPaths = {};
		this.mapCallbacks = new Map();
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