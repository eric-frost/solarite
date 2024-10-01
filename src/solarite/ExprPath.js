import {assert} from "../util/Errors.js";
import delve from "../util/delve.js";
import {getObjectId} from "./hash.js";
import NodeGroup from "./NodeGroup.js";
import Util, {findArrayDiff, setIndent} from "./Util.js";
import Template from "./Template.js";
import Globals from "./Globals.js";
import MultiValueMap from "../util/MultiValueMap.js";

/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup.
 * Path is only valid until the expressions before it are evaluated.
 * TODO: Make this based on parent and node instead of path? */
export default class ExprPath {

	/**
	 * @type {PathType} */
	type;

	// Used for attributes:

	/** @type {?string} Used only if type=AttribType.Value. */
	attrName;

	/**
	 * @type {?string[]} Used only if type=AttribType.Value. If null, use one expr to set the whole attribute value. */
	attrValue;

	/**
	 * @type {Set<string>} Used for type=AttribType.Multiple to remember the attributes that were added. */
	attrNames;



	/**
	 * @type {Node} Node that occurs before this ExprPath's first Node.
	 * This is necessary because udomdiff() can steal nodes from another ExprPath.
	 * If we had a pointer to our own startNode then that node could be moved somewhere else w/o us knowing it.
	 * Used only for type='content'
	 * Will be null if ExprPath has no Nodes. */
	nodeBefore;

	/**
	 * If type is AttribType.Multiple or AttribType.Value, points to the node having the attribute.
	 * If type is 'content', points to a node that never changes that this NodeGroup should always insert its nodes before.
	 *	 An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * @type {Node|HTMLElement} */
	nodeMarker;


	// These are set after an expression is assigned:

	/** @type {NodeGroup} */
	parentNg;

	/** @type {NodeGroup[]} */
	nodeGroups = [];


	// Caches to make things faster

	/**
	 * @private
	 * @type {Node[]} Cached result of getNodes() */
	nodesCache;

	/**
	 * @type {int} Index of nodeBefore among its parentNode's children. */
	nodeBeforeIndex;

	/**
	 * @type {int[]} Path to the node marker, in reverse for performance reasons. */
	nodeMarkerPath;

	/**
	 * Used with getNodeGroup() and freeNodeGroups().
	 * Each NodeGroup is here twice, once under an exact key, and once under the close key.
	 * @type {MultiValueMap<key:string, value:NodeGroup>} */
	nodeGroupsFree = new MultiValueMap();

	/**
	 * Used with getNodeGroup() and freeNodeGroups().
	 * TODO: Use an array of WeakRef so the gc can collect them?
	 * TODO: Put items back in nodeGroupsInUse after applyExpr() is called, not before.
	 * @type {NodeGroup[]} */
	nodeGroupsInUse = [];

	/**
	 * @param nodeBefore {Node}
	 * @param nodeMarker {?Node}
	 * @param type {string}
	 * @param attrName {?string}
	 * @param attrValue {string[]} */
	constructor(nodeBefore, nodeMarker, type=PathType.Content, attrName=null, attrValue=null) {

		//#IFDEV
		/*
		Object.defineProperty(this, 'debug', {
			get() {
				return [
					`parentNode: ${this.nodeBefore.parentNode?.tagName?.toLowerCase()}`,
					'nodes:',
					...setIndent(this.getNodes().map(item => {
						if (item instanceof Node)
							return item.outerHTML || item.textContent
						else if (item instanceof NodeGroup)
							return item.debug
					}), 1).flat()
				]
			}
		})

		Object.defineProperty(this, 'debugNodes', {
			get: () =>
				this.getNodes()
		})
		*/
		//#ENDIF

		// If path is a node.
		this.nodeBefore = nodeBefore;
		this.nodeMarker = nodeMarker;
		this.type = type;
		this.attrName = attrName;
		this.attrValue = attrValue;
		if (type === PathType.Multiple)
			this.attrNames = new Set();
	}

	/**
	 * TODO: Use another function to flatten the expr's so we don't have to use recusion.
	 * @param expr {Template|Node|Array|function|*}
	 * @param newNodes {(Node|Template)[]}
	 * @param secondPass {Array} Locations within newNodes to evaluate later. */
	apply(expr, newNodes, secondPass) {

		if (expr instanceof Template) {

			let ng = this.getNodeGroup(expr, true);
			if (ng) {
				//#IFDEV
				// Make sure the nodeCache of the ExprPath we took it from is sitll valid.
				if (ng.parentPath)
					ng.parentPath.verify();
				//#ENDIF


				// TODO: Track ranges of changed nodes and only pass those to udomdiff?
				// But will that break the swap benchmark?
				newNodes.push(...ng.getNodes());
				this.nodeGroups.push(ng);
			}

			// If expression, evaluate later to find partial match.
			else {
				secondPass.push([newNodes.length, this.nodeGroups.length])
				newNodes.push(expr)
				this.nodeGroups.push(null); // placeholder
			}
		}

		// Node created by an expression.
		else if (expr instanceof Node) {

			// DocumentFragment created by an expression.
			if (expr instanceof DocumentFragment)
				newNodes.push(...expr.childNodes);
			else
				newNodes.push(expr);
		}

		else if (Array.isArray(expr))
			for (let subExpr of expr)
				this.apply(subExpr, newNodes, secondPass);

		else if (typeof expr === 'function') {
			Globals.currentExprPath = [this, expr]; // Used by watch3()
			let result = expr();
			Globals.currentExprPath = null;

			this.apply(result, newNodes, secondPass);
		}

		// Text
		else {
			// Convert falsy values (but not 0) to empty string.
			// Convert numbers to string so they compare the same.
			let text = (expr === undefined || expr === false || expr === null) ? '' : expr + '';

			// Fast path for updating the text of a single text node.
			let first = this.nodeBefore.nextSibling;
			if (first.nodeType === 3 && first.nextSibling === this.nodeMarker && !newNodes.includes(first)) {
				if (first.textContent !== text)
					first.textContent = text;

				newNodes.push(first);
			}

			else {
				// TODO: Optimize this into a Set or Map or something?
				if (!this.existingTextNodes)
					this.existingTextNodes = this.getNodes().filter(n => n.nodeType === 3);

				let idx = this.existingTextNodes.findIndex(n => n.textContent === text);
				if (idx !== -1)
					newNodes.push(...this.existingTextNodes.splice(idx, 1))
				else
					newNodes.push(this.nodeMarker.ownerDocument.createTextNode(text));
			}
		}

		// If not in one of the recusive calls
		// Mark all nodes as free, for the next render() call.
		// TODO: This is commented out b/c this needs to happen after the second pass.
		//if (!recursing)
		//	this.freeNodeGroups();
	}

	applyMultipleAttribs(node, expr) {
		/*#IFDEV*/assert(this.type === PathType.Multiple);/*#ENDIF*/

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			let attrs = (expr +'') // Split string into multiple attributes.
				.split(/([\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+))/g)
				.map(text => text.trim())
				.filter(text => text.length);

			for (let attr of attrs) {
				let [name, value] = attr.split(/\s*=\s*/); // split on first equals.
				value = (value || '').replace(/^(['"])(.*)\1$/, '$2'); // trim value quotes if they match.
				node.setAttribute(name, value);
				this.attrNames.add(name)
			}
		}

		// Remove old attributes.
		for (let oldName of oldNames)
			if (!this.attrNames.has(oldName))
				node.removeAttribute(oldName);
	}

	/**
	 * Handle attributes for event binding, such as:
	 * onclick=${(e, el) => this.doSomething(el, 'meow')}
	 * oninput=${[this.doSomething, 'meow']}
	 * onclick=${[this, 'doSomething', 'meow']}
	 *
	 * @param node
	 * @param expr
	 * @param root */
	applyEventAttrib(node, expr, root) {
		/*#IFDEV*/
		assert(this.type === PathType.Value || this.type === PathType.Component);
		assert(root instanceof HTMLElement);
		/*#ENDIF*/

		let eventName = this.attrName.slice(2); // remove "on-" prefix.
		let func;

		// Convert array to function.
		let args = [];
		if (Array.isArray(expr)) {

			// oninput=${[this.doSomething, 'meow']}
			if (typeof expr[0] === 'function') {
				func = expr[0];
				expr.shift();
				args = expr;
			}

			// Undocumented.
			// oninput=${[this, 'value']}
			else {
				func = setValue
				args = [expr[0], expr.slice(1), node]
				node.value = delve(expr[0], expr.slice(1));
				// root.render(); // TODO: This causes infinite recursion.
			}
		}
		else
			func = expr;

		let eventKey = getObjectId(node) + eventName;
		let [existing, existingBound, _] = Globals.nodeEvents[eventKey] || [];


		// If function has changed, remove and rebind the event.
		if (existing !== func) {
			if (existing)
				node.removeEventListener(eventName, existingBound);

			let originalFunc = func;

			// BoundFunc sets the "this" variable to be the current Solarite component.
			let boundFunc = (event) => {
				let args = Globals.nodeEvents[eventKey][2];
				return originalFunc.call(root, ...args, event, node);
			}

			// Save both the original and bound functions.
			// Original so we can compare it against a newly assigned function.
			// Bound so we can use it with removeEventListner().
			Globals.nodeEvents[eventKey] = [originalFunc, boundFunc, args];

			node.addEventListener(eventName, boundFunc);

			// TODO: classic event attribs?
			//el[attr.name] = e => // e.g. el.onclick = ...
			//	(new Function('event', 'el', attr.value)).bind(this.manager.rootEl)(e, el) // put "event", "el", and "this" in scope for the event code.
		}

		//  Otherwise just update the args to the function.
		else
			Globals.nodeEvents[eventKey][2] = args;
	}

	applyValueAttrib(node, exprs, exprIndex) {
		let expr = exprs[exprIndex];
		
		// Array for form element data binding.
		// TODO: This never worked, and was moved to applyEventAttrib.
		// let isArrayValue = Array.isArray(expr);
		// if (isArrayValue && expr.length >= 2 && !expr.slice(1).find(v => !['string', 'number'].includes(typeof v))) {
		// 	node.value = delve(expr[0], expr.slice(1));
		// 	node.addEventListener('input', e => {
		// 		delve(expr[0], expr.slice(1), node.value) // TODO: support other properties like checked
		// 	});
		// }

		// Values to toggle an attribute
		if (!this.attrValue && (expr === false || expr === null || expr === undefined))
			node.removeAttribute(this.attrName);
		
		else if (!this.attrValue && expr === true)
			node.setAttribute(this.attrName, '');

		// Passing a path to the value attribute.
		// This same logic is in NodeGroup.createNewComponent() for components.
		else if ((this.attrName === 'value' || this.attrName === 'data-value') && Util.isPath(expr)) {
			let [obj, path] = [expr[0], expr.slice(1)];
			node.value = delve(obj, path);
			node.addEventListener('input', () => {
				delve(obj, path, Util.getInputValue(node));
			}, true); // We use capture so we update the values before other events added by the user.
		}

		// Regular attribute
		else {
			let value = [];

			// We go backward because NodeGroup.applyExprs() calls this function, and it goes backward through the exprs.
			if (this.attrValue) {
				for (let i=this.attrValue.length-1; i>=0; i--) {
					value.unshift(this.attrValue[i]);
					if (i > 0) {
						let val = exprs[exprIndex];
						if (val !== false && val !== null && val !== undefined)
							value.unshift(val);
						exprIndex--;
					}
				}

				exprIndex ++;
			}
			else
				value.unshift(expr);

			let joinedValue = value.join('')

			// Only update attributes if the value has changed.
			// The .value property is special.  If it changes we don't update the attribute.
			let oldVal = this.attrName === 'value' ? node.value : node.getAttribute(this.attrName);
			if (oldVal !== joinedValue) {
				node.setAttribute(this.attrName, joinedValue);
			}

			// This is needed for setting input.value, .checked, option.selected, etc.
			// But in some cases setting the attribute is enough.  such as div.setAttribute('title') updates div.title.
			// TODO: How to tell which is which?
			if (this.attrName in node)
				node[this.attrName] = joinedValue;

		}

		return exprIndex;
	}


	/**
	 *
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {ExprPath} */
	clone(newRoot, pathOffset=0) {
		/*#IFDEV*/this.verify();/*#ENDIF*/

		// Resolve node paths.
		let nodeMarker, nodeBefore;
		let root = newRoot;
		let path = pathOffset ? this.nodeMarkerPath.slice(0, -pathOffset) : this.nodeMarkerPath;
		for (let i=path.length-1; i>0; i--) // Resolve the path.
			root = root.childNodes[path[i]];
		let childNodes = root.childNodes;

		nodeMarker = path.length ? childNodes[path[0]] : newRoot;
		if (this.nodeBefore)
			nodeBefore = childNodes[this.nodeBeforeIndex];

		let result = new ExprPath(nodeBefore, nodeMarker, this.type, this.attrName, this.attrValue);

		//#IFDEV
		result.nodeMarker.exprPath = result;
		if (result.nodeBefore)
			result.nodeBefore.prevExprPath = result;
		result.verify();
		//#ENDIF

		return result;
	}
	
	/**
	 * Clear the nodeCache of this ExprPath, as well as all parent and child ExprPaths that
	 * share the same DOM parent node.
	 *
	 * TODO: Is recursive clearing ever necessary? */
	clearNodesCache() {
		let path = this;
		
		// Clear cache parent ExprPaths that have the same parentNode
		let parentNode = this.nodeMarker.parentNode;
		while (path && path.nodeMarker.parentNode === parentNode) {
			path.nodesCache = null;
			path = path.parentNg?.parentPath
			
			// If stuck in an infinite loop here, the problem is likely due to Template hash colisions.
			// Which cause one path to be the descendant of itself, creating a cycle.
		}
		
		function clearChildNodeCache(path) {
			
			// Clear cache of child ExprPaths that have the same parentNode
			for (let ng of path.nodeGroups) {
				if (ng) // Can be null from apply()'s push(null) call.
					for (let path2 of ng.paths) {
						if (path2.type === PathType.Content && path2.parentNode === parentNode) {
							path2.nodesCache = null;
							clearChildNodeCache(path2);
						}
					}
			}
		}

		// Commented out on Sep 30, 2024 b/c it was making the benchmark never finish when adding 10k rows.
		//clearChildNodeCache(this);
	}


	/**
	 * Attempt to remove all of this ExprPath's nodes from the DOM, if it can be done using a special fast method.
	 * @returns {boolean} Returns false if Nodes werne't removed, and they should instead be removed manually. */
	fastClear() {
		let parent = this.nodeBefore.parentNode;
		if (this.nodeBefore === parent.firstChild && this.nodeMarker === parent.lastChild) {

			// If parent is the only child of the grandparent, replace the whole parent.
			// And if it has no siblings, it's not created by a NodeGroup/path.
			let grandparent = parent.parentNode
			if (grandparent && parent === grandparent.firstChild && parent === grandparent.lastChild && !parent.hasAttribute('id')) {
				let replacement = document.createElement(parent.tagName)
				replacement.append(this.nodeBefore, this.nodeMarker)
				for (let attrib of parent.attributes)
					replacement.setAttribute(attrib.name, attrib.value)
				parent.replaceWith(replacement)
			}
			else {
				parent.innerHTML = ''; // Faster than calling .removeChild() a thousand times.
				parent.append(this.nodeBefore, this.nodeMarker)
			}
			return true;
		}
		return false;
	}
	
	/**
	 * @return {(Node|HTMLElement)[]} */
	getNodes() {
		
		// Why doesn't this work?
		// let result2 = [];
		// for (let ng of this.nodeGroups)
		// 	result2.push(...ng.getNodes())
		// return result2;
		
		
		let result

		// This shaves about 5ms off the partialUpdate benchmark.
		/*result = this.nodesCache;
		if (result) {
			
			//#IFDEV
			this.checkNodesCache();
			//#ENDIF
			
			return result
		}*/

		result = [];
		let current = this.nodeBefore.nextSibling;
		let nodeMarker = this.nodeMarker;
		while (current && current !== nodeMarker) {
			result.push(current)
			current = current.nextSibling
		}

		this.nodesCache = result;
		return result;
	}

	getParentNode() { // Same as this.parentNode
		return this.nodeMarker.parentNode
	}

	/**
	 * Get an unused NodeGroup that matches the template's html and expressions (exact=true)
	 * or at least the html (exact=false).
	 * Remove it from nodeGroupsFree if it exists, or create it if not.
	 * Then add it to nodeGroupsInUse.
	 *
	 * @param template {Template}
	 * @param exact {boolean}
	 * @return {NodeGroup} */
	getNodeGroup(template, exact=true) {
		let exactKey = template.getExactKey();
		let closeKey = template.getCloseKey();
		let result;

		if (exact) {
			result = this.nodeGroupsFree.delete(exactKey);
			if (result)
				this.nodeGroupsFree.delete(closeKey, result);
			else
				return null;
		}
		else {
			result = this.nodeGroupsFree.delete(closeKey)
			if (result) {
				/*#IFDEV*/assert(result.exactKey);/*#ENDIF*/
				this.nodeGroupsFree.delete(result.exactKey, result);

				// Update this close match with the new expression values.
				result.applyExprs(template.exprs);
				result.exactKey = exactKey; // TODO: Should this be set elsewhere?
			}
		}

		if (!result)
			result = new NodeGroup(template, this, exactKey, closeKey);

		this.nodeGroupsInUse.push(result);
		/*#IFDEV*/assert(result.parentPath);/*#ENDIF*/
		return result;
	}

	/**
	 * Move everything from this.nodeGroupsInUse to this.nodeGroupsFree. */
	freeNodeGroups() {
		let ngf = this.nodeGroupsFree;
		for (let ng of this.nodeGroupsInUse) {
			ngf.add(ng.exactKey, ng);
			ngf.add(ng.closeKey, ng);
		}
		this.nodeGroupsInUse = [];
	}

	//#IFDEV
	
	get debug() {
		return [
			`parentNode: ${this.nodeBefore.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item instanceof Node)
					return item.outerHTML || item.textContent
				else if (item instanceof NodeGroup)
					return item.debug
			}), 1).flat()
		]
	}
	
	get debugNodes() {
		// Clear nodesCache so that getNodes() manually gets the nodes.
		let nc = this.nodesCache;
		this.nodesCache = null;
		let result = this.getNodes()
		this.nodesCache = nc;
		return result;
	}
	
	verify() {
		if (!window.verify)
			return;

		assert(this.type!==PathType.Content || this.nodeBefore)
		assert(this.type!==PathType.Content || this.nodeBefore.parentNode)

		// Need either nodeMarker or parentNode
		assert(this.nodeMarker)

		// nodeMarker must be attached.
		assert(!this.nodeMarker || this.nodeMarker.parentNode)

		// nodeBefore and nodeMarker must have same parent.
		assert(this.type!==PathType.Content || this.nodeBefore.parentNode === this.nodeMarker.parentNode)

		assert(this.nodeBefore !== this.nodeMarker)
		assert(this.type!==PathType.Content|| !this.nodeBefore.parentNode || this.nodeBefore.compareDocumentPosition(this.nodeMarker) === Node.DOCUMENT_POSITION_FOLLOWING)

		// Detect cyclic parent and grandparent references.
		assert(this.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath?.parentNg?.parentPath !== this)

		for (let ng of this.nodeGroups)
			ng.verify();

		// Make sure the nodesCache matches the nodes.
		this.checkNodesCache();
	}
	
	checkNodesCache() {
		return;
		
		// Make sure cache is accurate.
		// If this is invalid, then perhaps another component append()'d one of our nodes to itself.
		// Or perhaps one of our nodes is used in an expression more than once.
		// TODO: Find a way to check for and warn when this happens.
		// MutationObserver is too slow since it's asynchronous.
		// My own MutationWatcher has to modify DOM prototypes, which is rather invasive.
		if (this.nodesCache) {
			let nodes = [];
			let current = this.nodeBefore.nextSibling;
			let nodeMarker = this.nodeMarker;
			while (current && current !== nodeMarker) {
				nodes.push(current)
				current = current.nextSibling
			}
			assert(findArrayDiff(this.nodesCache, nodes) === false);
		}
	}
	//#ENDIF
}



/**
 *
 * @param root
 * @param path {string[]}
 * @param node {HTMLElement}
 */
function setValue(root, path, node) {
	let val = node.value;
	if (node.type === 'number')
		val = parseFloat(val);

	delve(root, path, val);
}

/** @enum {string} */
export const PathType = {
	/** Child of a node */
	Content: 'content',
	
	/** One or more whole attributes */
	Multiple: 'attrName',
	
	/** Value of an attribute. */
	Value: 'attrValue',
	
	/** Value of an attribute being passed to a component. */
	Component: 'component',
	
	/** Expressions inside Html comments. */
	Comment: 'comment',
}


/** @return {int[]} Returns indices in reverse order, because doing it that way is faster. */
export function getNodePath(node) {
	let result = [];
	while(true) {
		let parent = node.parentNode
		if (!parent)
			break;
		result.push(Array.prototype.indexOf.call(node.parentNode.childNodes, node))
		node = parent;
	}
	return result;
}

/**
 * Note that the path is backward, with the outermost element at the end.
 * @param root {HTMLElement|Document|DocumentFragment|ParentNode}
 * @param path {int[]}
 * @returns {Node|HTMLElement} */
export function resolveNodePath(root, path) {
	for (let i=path.length-1; i>=0; i--)
		root = root.childNodes[path[i]];
	return root;
}

