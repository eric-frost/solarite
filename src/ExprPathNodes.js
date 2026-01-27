import ExprPath, {ExprPathType} from "./ExprPath.js";
import {assert} from "./assert.js";
import NodeGroup from "./NodeGroup.js";
import Util from "./Util.js";
import udomdiff from "./udomdiff.js";
import Template from "./Template.js";
import Globals from "./Globals.js";
import MultiValueMap from "./MultiValueMap.js";
import ExprPathComponent from "./ExprPathComponent.js";

export default class ExprPathNodes extends ExprPath {


	/**
	 * @type {?function} The most recent callback passed to a .map() function in this ExprPath.  This is only used for watch.js
	 * TODO: What if one ExprPath has two .map() calls?  Maybe we just won't support that. */
	mapCallback

	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker, ExprPathType.Content);
	}

	/**
	 * Insert/replace the nodes created by a single expression.
	 * Called by applyExprs()
	 * This function is recursive.  It calls functions that call applyNodes().
	 * @param exprs {Expr[]} Only the first is used.
	 * @param freeNodeGroups {boolean}
	 * @return {Node[]} New Nodes created. */
	apply(exprs, freeNodeGroups=true) {
		let path = this;
		let expr = exprs[0];

		// This can be done at the beginning or the end of this function.
		// If at the end, we may get rendering done faster.
		// But when at the beginning, it leaves all the nodes in-use so we can do a renderWatched().
		if (freeNodeGroups)
			path.freeNodeGroups();

		/*#IFDEV*/path.verify();/*#ENDIF*/

		/** @type {(Node|NodeGroup|Expr)[]} */
		let newNodes = [];
		let oldNodeGroups = path.nodeGroups;
		/*#IFDEV*/assert(!oldNodeGroups.includes(null))/*#ENDIF*/
		let secondPass = []; // indices

		path.nodeGroups = []; // Reset before applyExactNodes and the code below rebuilds it.
		path.applyExactNodes(expr, newNodes, secondPass);

		//this.existingTextNodes = null;

		// TODO: Create an array of old vs Nodes and NodeGroups together.
		// If they're all the same, skip the next steps.
		// Or calculate it in the loop above as we go?  Have a path.lastNodeGroups property?

		// Second pass to find close-match NodeGroups.
		let flatten = false;
		if (secondPass.length) {
			for (let [nodesIndex, ngIndex] of secondPass) {
				let ng = path.getNodeGroup(newNodes[nodesIndex], false);
				let ngNodes = ng.getNodes();

				/*#IFDEV*/assert(!(newNodes[nodesIndex] instanceof NodeGroup))/*#ENDIF*/

				if (ngNodes.length === 1) // flatten manually so we can skip flattening below.
					newNodes[nodesIndex] = ngNodes[0];

				else {
					newNodes[nodesIndex] = ngNodes;
					flatten = true;
				}
				path.nodeGroups[ngIndex] = ng;
			}

			if (flatten)
				newNodes = newNodes.flat(); // Only if second pass happens.
		}

		/*#IFDEV*/assert(!path.nodeGroups.includes(null))/*#ENDIF*/

		let oldNodes = path.getNodes();

		// This pre-check makes it a few percent faster?
		let same = Util.arraySame(oldNodes, newNodes);
		if (!same) {

			path.nodesCache = newNodes; // Replaces value set by path.getNodes()

			if (this.parentNg.parentPath)
				this.parentNg.parentPath.clearNodesCache();

			// Fast clear method
			let isNowEmpty = oldNodes.length && !newNodes.length;
			if (!isNowEmpty || !path.fastClear()) {

				// Rearrange nodes.
				udomdiff(path.nodeMarker.parentNode, oldNodes, newNodes, path.nodeMarker)
			}

			// TODO: Put this in a remove() function of NodeGroup.
			// Then only run it on the old nodeGroups that were actually removed.
			//Util.saveOrphans(oldNodeGroups, oldNodes);

			for (let ng of oldNodeGroups)
				if (!ng.startNode.parentNode)
					Util.saveOrphans(ng.getNodes());
		}

		/*#IFDEV*/path.verify();/*#ENDIF*/
	}




	/**
	 * Try to apply Nodes that are an exact match, by finding existing nodes from the last render
	 * that have the same value as created by the expr.
	 * This is called from ExprPath.applyNodes().
	 *
	 * @param expr {Template|Node|Array|function|*}
	 * @param newNodes {(Node|Template)[]} An inout parameter; we add the nodes here as we go.
	 * @param secondPass {[int, int][]} Locations within newNodes for ExprPath.applyNodes() to evaluate later,
	 *   when it tries to find partial matches. */
	applyExactNodes(expr, newNodes, secondPass) {

		if (expr instanceof Template) {
			let ng = this.getNodeGroup(expr, true);

			if (ng) {
				let newestNodes = ng.getNodes();
				newNodes.push(...newestNodes);

				// New!
				// Call render() on web components even though none of their arguments have changed:
				// Do we want it to work this way?  Yes, because even if this component hasn't changed,
				// perhaps something in a sub-component has.
				for (let path of ng.paths)
					if (path instanceof ExprPathComponent)
						path.apply([expr.exprs]);

				this.nodeGroups.push(ng);
				return ng;
			}

			// If expression, mark it to be evaluated later in ExprPath.apply() to find partial match.
			else {
				secondPass.push([newNodes.length, this.nodeGroups.length])
				newNodes.push(expr)
				this.nodeGroups.push(null); // placeholder
			}
		}
		else if (expr instanceof NodeList) {
			newNodes.push(...expr);
		}

		// Node(s) created by an expression.
		else if (expr?.nodeType) {

			// DocumentFragment created by an expression.
			if (expr?.nodeType === 11) // DocumentFragment
				newNodes.push(...expr.childNodes);
			else
				newNodes.push(expr);
		}

		// Arrays and functions.
		// I tried iterating over the result of a generator function to avoid this recursion and simplify the code,
		// but that consistently made the js-framework-benchmarks a few percentage points slower.
		else
			this.exprToTemplates(expr, template => {
				this.applyExactNodes(template, newNodes, secondPass);
			})
	}




	/**
	 * Used by watch() for inserting/removing/replacing individual loop items.
	 * @param op {ArraySpliceOp} */
	applyWatchArrayOp(op) {

		// Replace NodeGroups
		let replaceCount = Math.min(op.deleteCount, op.items.length);
		let deleteCount = op.deleteCount - replaceCount;
		for (let i=0; i<replaceCount; i++) {
			let oldNg = this.nodeGroups[op.index + i]; // TODO: One expr can create multiple nodegroups.

			// Try to find an exact match
			let func = this.mapCallback || this.watchFunction;
			let expr = func(op.items[i]);

			// If the result of func isn't a template, conver it to one or more templates.
			this.exprToTemplates(expr, template => { // TODO: An expr can create multiple NodeGroups.  I need a way to group them.

				let ng = this.getNodeGroup(template, true);  // Removes from nodeGroupsAttached and adds to nodeGroupsRendered()
				if (ng && ng === oldNg) {
					// It's an exact match, so replace nothing.
					// TODO: What if the found NodeGroup as at a differnet place?
				} else {

					// Find a close match or create a new node group
					if (!ng)
						ng = this.getNodeGroup(template, false); // adds back to nodeGroupsRendered()
					this.nodeGroups[op.index + i] = ng; // TODO: Remove old one to nodeGroupsDetached?

					// Splice in the new nodes.
					let insertBefore = oldNg.startNode;
					for (let node of ng.getNodes())
						insertBefore.parentNode.insertBefore(node, insertBefore);

					// Remove the old nodes.
					if (ng !== oldNg)
						Util.saveOrphans(oldNg.getNodes());
				}
			});
		}

		// Delete extra at the end.
		if (deleteCount > 0) {
			for (let i=0; i<deleteCount; i++) {
				let oldNg = this.nodeGroups[op.index + replaceCount +  i];
				Util.saveOrphans(oldNg.getNodes());
			}
			this.nodeGroups.splice(op.index + replaceCount, deleteCount);
		}

		// Add extra at the end.
		else {
			let newItems = op.items.slice(replaceCount);

			let insertBefore = this.nodeGroups[op.index + replaceCount]?.startNode || this.nodeMarker;
			for (let i = 0; i < newItems.length; i++) { // We use nodeMarker if the subequent (or all) nodeGroups have been removed.


				// Try to find exact match
				let template = this.mapCallback(newItems[i]);
				let ng = this.getNodeGroup(template, true);  // Removes from nodeGroupsAttached and adds to nodeGroupsRendered()
				if (!ng) 	// Find a close match or create a new node group
					ng = this.getNodeGroup(template, false); // adds back to nodeGroupsRendered()

				this.nodeGroups.push(ng);

				// Splice in the new nodes.
				for (let node of ng.getNodes())
					insertBefore.parentNode.insertBefore(node, insertBefore);
			}
		}

		//#IFDEV
		assert(this.nodeGroups.length === op.array.length);
		//#ENDIF

		// TODO: update or invalidate the nodes cache?
		this.nodesCache = null;
	}


	/**
	 * Clear the nodeCache of this ExprPath, as well as all parent and child ExprPaths that
	 * share the same DOM parent node. */
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
	}


	/**
	 * Attempt to remove all of this ExprPath's nodes from the DOM, if it can be done using a special fast method.
	 * @returns {boolean} Returns false if Nodes weren't removed, and they should instead be removed manually. */
	fastClear() {
		let parent = this.nodeBefore.parentNode;
		if (this.nodeBefore === parent.firstChild && this.nodeMarker === parent.lastChild) {

			// If parent is the only child of the grandparent, replace the whole parent.
			// And if it has no siblings, it's not created by a NodeGroup/path.
			// Commented out because this will break any references.
			// And because I don't see much performance difference.
			// let grandparent = parent.parentNode
			// if (grandparent && parent === grandparent.firstChild && parent === grandparent.lastChild && !parent.hasAttribute('id')) {
			// 	let replacement = document.createElement(parent.tagName)
			// 	replacement.append(this.nodeBefore, this.nodeMarker)
			// 	for (let attrib of parent.attributes)
			// 		replacement.setAttribute(attrib.name, attrib.value)
			// 	parent.replaceWith(replacement)
			// }
			// else {
			parent.innerHTML = ''; // Faster than calling .removeChild() a thousand times.
			parent.append(this.nodeBefore, this.nodeMarker)
			//}
			return true;
		}
		return false;
	}

	/**
	 * Recursively traverse expr.
	 * If a value is a function, evaluate it.
	 * If a value is an array, recurse on each item.
	 * If it's a primitive, convert it to a Template.
	 * Otherwise pass the item (which is now either a Template or a Node) to callback.
	 * TODO: This could be static if not for the watch code, which doesn't work anyway.
	 * @param expr
	 * @param callback {function(Node|Template)}*/
	exprToTemplates(expr, callback) {
		if (Array.isArray(expr)) // TODO: use typeof obj[Symbol.iterator] === 'function'  so we can also iterate over objects and NodeList?
			for (let subExpr of expr)
				this.exprToTemplates(subExpr, callback);

		else if (typeof expr === 'function') {
			// TODO: One ExprPath can have multiple expr functions.
			// But if using it as a watch, it should only have one at the top level.
			// So maybe this is ok.
			Globals.currentExprPath = this; // Used by watch()

			this.watchFunction = expr; // TODO: Only do this if it's a top level function.
			expr = expr(); // As expr accesses watched variables, watch() uses Globals.currentExprPath to mark where those watched variables are being used.
			Globals.currentExprPath = null;

			this.exprToTemplates(expr, callback);
		}

		// String/Number/Date/Boolean
		else if (!(expr instanceof Template) && !(expr?.nodeType)){
			// Convert expression to a string.
			if (expr === undefined || expr === false || expr === null) // Util.isFalsy() inlined
				expr = '';
			else if (typeof expr !== 'string')
				expr += '';

			// Get the same Template for the same string each time.
			// let template = Globals.stringTemplates[expr];
			// if (!template) {

			let template = new Template([expr], []);
			template.isText = true;
			//	Globals.stringTemplates[expr] = template;
			//}

			// Recurse.
			this.exprToTemplates(template, callback);
		}
		else
			callback(expr);
	}

	/**
	 * Get an unused NodeGroup that matches the template's html and expressions (exact=true)
	 * or at least the html (exact=false).
	 * Remove it from nodeGroupsFree if it exists, or create it if not.
	 * Then add it to nodeGroupsInUse.
	 *
	 * @param template {Template}
	 * @param exact {boolean}
	 *     If true, return an exact match, or null.
	 *     If false, either find a match for the template's html and then apply the template's expressions,
	 *         or createa  new NodeGroup from the template.
	 * @return {NodeGroup} */
	getNodeGroup(template, exact=true) {
		let result;
		let collection = this.nodeGroupsAttachedAvailable;

		// TODO: Would it be faster to maintain a separate list of detached nodegroups?
		if (exact) { // [below] parentElement will be null if the parent is a DocumentFragment
			result = collection.deleteAny(template.getExactKey());
			if (!result) { // try searching detached
				collection = this.nodeGroupsDetachedAvailable;
				result = collection.deleteAny(template.getExactKey());
			}

			if (result) {// also delete the matching close key.
				collection.deleteSpecific(template.getCloseKey(), result);

				//result.applyExprs(template.exprs);
			}
			else
				return null;
		}

		// Find a close match.
		// This is a match that has matching html, but different expressions applied.
		// We can then apply the expressions to make it an exact match.
		// If the template has no expressions, the key is the html, and we've already searched for an exact match.  There won't be an inexact match.
		else if (template.exprs.length) {
			result = collection.deleteAny(template.getCloseKey());
			if (!result) { // try searching detached
				collection = this.nodeGroupsDetachedAvailable;
				result = collection.deleteAny(template.getCloseKey());
			}

			if (result) {
				/*#IFDEV*/assert(result.exactKey);/*#ENDIF*/
				collection.deleteSpecific(result.exactKey, result);

				// Update this close match with the new expression values.
				result.applyExprs(template.exprs);
				result.exactKey = template.getExactKey();
			}
		}

		if (!result) {
			result = new NodeGroup(template, this);
			result.applyExprs(template.exprs);
			result.exactKey = template.getExactKey();
		}


		this.nodeGroupsRendered.push(result);

		/*#IFDEV*/assert(result.parentPath);/*#ENDIF*/
		return result;
	}




	/**
	 * TODO: Rename this to nodeGroupsInUse, nodeGroupsAvialableAttached and nodeGroupsAvailableDetached?
	 * Nodes that have been used during the current render().
	 * Used with getNodeGroup() and freeNodeGroups().
	 * TODO: Use an array of WeakRef so the gc can collect them?
	 * TODO: Put items back in nodeGroupsInUse after applyExpr() is called, not before.
	 * @type {NodeGroup[]} */
	nodeGroupsRendered = [];

	/**
	 * Nodes that were added to the web component during the last render(), but are available to be used again.
	 * Used with getNodeGroup() and freeNodeGroups().
	 * Each NodeGroup is here twice, once under an exact key, and once under the close key.
	 * @type {MultiValueMap<key:string, value:NodeGroup>} */
	nodeGroupsAttachedAvailable = new MultiValueMap();

	/**
	 * Nodes that were not added to the web component during the last render(), and available to be used again.
	 * @type {MultiValueMap} */
	nodeGroupsDetachedAvailable = new MultiValueMap();


	/**
	 * Move everything from this.nodeGroupsRendered to this.nodeGroupsAttached and nodeGroupsDetached.
	 * Called at the beginning of applyNodes() so it can have NodeGroups to use.
	 * TODO: this could run as needed in getNodeGroup? */
	freeNodeGroups() {
		// Add nodes that weren't used during render() to nodeGroupsDetached
		let previouslyAttached = this.nodeGroupsAttachedAvailable.data;
		let detached = this.nodeGroupsDetachedAvailable.data;
		for (let key in previouslyAttached) {
			let set = detached[key];
			if (!set)
				detached[key] = previouslyAttached[key]
			else
				for (let ng of previouslyAttached[key])
					set.add(ng);
		}

		// Add nodes that were used during render() to nodeGroupsRendered.
		this.nodeGroupsAttachedAvailable = new MultiValueMap();
		let nga = this.nodeGroupsAttachedAvailable;
		for (let ng of this.nodeGroupsRendered) {
			nga.add(ng.exactKey, ng);
			nga.add(ng.closeKey, ng);
		}

		this.nodeGroupsRendered = [];
	}



	/**
	 * If not for watch.js, this could be moved to ExprPathNodes.js
	 * @return {(Node|HTMLElement)[]} */
	getNodes() {

		// Why doesn't this work?
		// let result2 = [];
		// for (let ng of this.nodeGroups)
		// 	result2.push(...ng.getNodes())
		// return result2;

		// if (this.type === ExprPathType.AttribValue || this.type === ExprPathType.AttribMultiple) {
		// 	return [this.nodeMarker];
		// }

		let result

		// This shaves about 5ms off the partialUpdate benchmark.
		result = this.nodesCache;
		if (result) {
			//#IFDEV
			//this.checkNodesCache();
			//#ENDIF
			return result
		}

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

	//#IFDEV

	get debug() {
		return [
			`parentNode: ${this.nodeBefore.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item?.nodeType)
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

			if (!Util.arraySame(this.nodesCache, nodes))
				console.log(this.nodesCache, nodes)
			assert(Util.arraySame(this.nodesCache, nodes) === true);
		}
	}
	//#ENDIF
}


function walkDOM(el, callback) {
	callback(el);
	let child = el.firstElementChild;
	while (child) {
		walkDOM(child, callback);
		child = child.nextElementSibling;
	}
}
