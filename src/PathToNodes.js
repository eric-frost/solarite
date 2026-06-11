import Path from "./Path.js";
import assert from "./assert.js";
import NodeGroup from "./NodeGroup.js";
import Util from "./Util.js";
import udomdiff from "./udomdiff.js";
import Template from "./Template.js";
import Globals from "./Globals.js";
import MultiValueMap from "./MultiValueMap.js";

export default class PathToNodes extends Path {


	/**
	 * @type {?function} The most recent callback passed to a .map() function in this Path.  This is only used for watch.js
	 * TODO: What if one Path has two .map() calls?  Maybe we just won't support that. */
	mapCallback;

	/** @type {NodeGroup[]} The NodeGroups created by this path's expression, in order. */
	nodeGroups = [];



	/**
	 * Nodes that have been used during the current render().
	 * Used with getNodeGroup() and freeNodeGroups() on the generic path; the positional diff
	 * tracks in-use NodeGroups in this.nodeGroups instead.
	 * Lazily created since most paths never use it.
	 * @type {?NodeGroup[]} */
	nodeGroupsRendered = null;

	/**
	 * Nodes that were added to the web component during the last render(), but are available to be used again.
	 * Used with getNodeGroup() and freeNodeGroups().
	 * Each NodeGroup is here twice, once under an exact key, and once under the close key.
	 * Lazily created since most paths never use it.
	 * @type {?MultiValueMap} */
	nodeGroupsAttachedAvailable = null;

	/**
	 * Nodes that were not added to the web component during the last render(), and available to be used again.
	 * Lazily created since most paths never use it.
	 * @type {?MultiValueMap} */
	nodeGroupsDetachedAvailable = null;

	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker);
	}

	/**
	 * Insert/replace the nodes created by a single expression.
	 * Called by applyExprs()
	 * @param exprs {Expr[]} Only the first is used.
	 * @param freeNodeGroups {boolean}
	 * @return {Node[]} New Nodes created. */
	apply(exprs, freeNodeGroups=true) {
		//#IFDEV
		assert(Array.isArray(exprs));
		//#ENDIF
		this.applySingle(exprs[0], freeNodeGroups);
	}

	/**
	 * Make the DOM between nodeBefore and nodeMarker match the value of expr.
	 * This is the main entry point for rendering an expression's nodes, chosen from three strategies:
	 * 1. A primitive expr updating (or creating) a single text node is handled inline with no allocations.
	 * 2. Otherwise expr is flattened to a list of Templates, strings, and Nodes via collectItems(),
	 *    then applyDiff() positionally diffs them against the previous render's NodeGroups.
	 * 3. If the items contain raw Nodes, now or on the previous render, applyGeneric() uses the older
	 *    hash-key matching and udomdiff, since this.nodeGroups can't track raw Nodes positionally.
	 * @param expr {Expr}
	 * @param freeNodeGroups {boolean} Only false when called by watch.js, which pre-populates the pools. */
	applySingle(expr, freeNodeGroups=true) {

		/*#IFDEV*/this.verify();/*#ENDIF*/

		// Fast path for a single primitive expression, the most common case in loops.
		let exprType = typeof expr;
		if ((exprType === 'string' || exprType === 'number') && !this.itemsHaveNodes) {
			if (exprType !== 'string')
				expr += '';
			let ngs = this.nodeGroups;

			// Update an existing single text node.
			if (ngs.length === 1) {
				let ng = ngs[0], tpl = ng.template;
				if (tpl.isText === true) {
					if (tpl.html[0] !== expr) {
						ng.startNode.nodeValue = expr;
						tpl.html[0] = expr; // Text templates have their own html array, so this can't affect others.
						ng.closeKey = expr;
						ng.exactKey = undefined;
					}
					return;
				}
			}

			// Create a text node in an empty path.
			else if (ngs.length === 0) {
				let ng = new NodeGroup(textTemplate(expr), this);
				if (this.wholeParent)
					this.nodeMarker.appendChild(ng.startNode);
				else
					this.nodeMarker.parentNode.insertBefore(ng.startNode, this.nodeMarker);
				ngs.push(ng);

				// During a NodeGroup's first applyExprs(), no ancestor caches can reference its nodes yet.
				if (!this.parentNg.firstApply) {
					this.nodesCache = null;
					if (this.parentNg.parentPath)
						this.parentNg.parentPath.clearNodesCache();
				}
				return;
			}
		}

		// 1. Flatten the expression to a list of Templates, strings and Nodes, evaluating functions along the way.
		/** @type {(Template|string|Node)[]} */
		let newItems = [];
		let hasNodesNow = this.collectItems(expr, newItems, false);

		// 2. Raw Nodes in the items (now or on the previous render) can't be diffed positionally
		// because this.nodeGroups only tracks NodeGroups.  Use the generic path for those.
		if (hasNodesNow || this.itemsHaveNodes) {
			this.itemsHaveNodes = hasNodesNow;
			this.applyGeneric(newItems, freeNodeGroups);
		}
		else
			this.applyDiff(newItems);

		/*#IFDEV*/this.verify();/*#ENDIF*/
	}

	/**
	 * Positionally diff newItems (all Templates) against this.nodeGroups.
	 * Unchanged NodeGroups are kept without any hashing or map lookups.
	 * NodeGroups created from the same html are rewritten in place.
	 * Leftover items are removed/inserted with direct DOM operations.
	 * @param newItems {Template[]} */
	applyDiff(newItems) {
		let oldNgs = this.nodeGroups;
		let oldLen = oldNgs.length, newLen = newItems.length;
		let newNgs = new Array(newLen);

		let start = 0;
		let oldEnd = oldLen, newEnd = newLen;

		// 1. Keep the matching prefix.
		// This runs before the suffix scan so that removing one of several identical items keeps the first ones.
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			if (!itemSame(ng, t))
				break;
			if (ng.hasComponentPaths)
				ng.applyExprs(t.exprs, false, false);
			newNgs[start] = ng;
			start++;
		}

		// 2. Keep the matching suffix.  This makes removing items from the middle cheap.
		while (oldEnd > start && newEnd > start) {
			let ng = oldNgs[oldEnd-1], t = newItems[newEnd-1];
			if (!itemSame(ng, t))
				break;
			if (ng.hasComponentPaths)
				ng.applyExprs(t.exprs, false, false);
			newNgs[--newEnd] = ng;
			oldEnd--;
		}

		// 3. Aligned middle scan: keep unchanged NodeGroups, rewrite same-shape ones in place.
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			if (itemSame(ng, t)) { // Can happen between changed rows, e.g. partial updates.
				if (ng.hasComponentPaths)
					ng.applyExprs(t.exprs, false, false);
			}
			else if (itemClose(ng, t))
				this.rewriteNodeGroup(ng, t);
			else
				break; // Different html at this position.  Remove/insert the remaining window below.
			newNgs[start] = ng;
			start++;
		}

		let oldRemain = oldEnd - start, newRemain = newEnd - start;
		if (oldRemain || newRemain) {

			// 4. Remove leftover old NodeGroups.
			if (oldRemain) {
				// Materialize node caches of multi-node groups while still attached,
				// since detaching breaks sibling links.  Single-node groups don't need it.
				for (let i=start; i<oldEnd; i++) {
					let ng = oldNgs[i];
					if (ng.startNode !== ng.endNode)
						ng.getNodes();
				}

				// Fast clear when removing everything.
				let cleared = newLen === 0 && start === 0 && this.fastClear();
				let pool = this.nodeGroupsDetachedAvailable ??= new MultiValueMap();
				for (let i=start; i<oldEnd; i++) {
					let ng = oldNgs[i];
					if (ng.startNode !== ng.endNode)
						Util.saveOrphans(ng.getNodes()); // Moves the nodes out of the DOM, into their own fragment.
					else if (!cleared)
						ng.startNode.remove();
					if (!ng.template.isText)
						pool.add(ng.closeKey, ng);
				}
			}

			// 5. Insert leftover new items.
			if (newRemain) {
				let wholeParent = this.wholeParent;
				let anchor = newEnd < newLen ? newNgs[newEnd].startNode : (wholeParent ? null : this.nodeMarker);
				let parent = wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
				let target = parent, before = anchor;
				let fragment = null;
				if (newRemain > 1) { // Batch-insert through a fragment.
					fragment = Globals.doc.createDocumentFragment();
					target = fragment;
					before = null;
				}
				for (let i=start; i<newEnd; i++) {
					let ng = this.createOrReuse(newItems[i]);
					newNgs[i] = ng;
					let node = ng.startNode, end = ng.endNode;
					while (true) {
						let next = node.nextSibling;
						target.insertBefore(node, before);
						if (node === end)
							break;
						node = next;
					}
				}
				if (fragment)
					parent.insertBefore(fragment, anchor);
			}

			// 6. Node membership changed, so invalidate caches.
			// During a NodeGroup's first applyExprs(), no ancestor caches can reference its nodes yet.
			if (!this.parentNg.firstApply) {
				this.nodesCache = null;
				if (this.parentNg.parentPath)
					this.parentNg.parentPath.clearNodesCache();
			}
		}

		this.nodeGroups = newNgs;

		// Keep state used by the generic path and watch.js from going stale.
		if (this.nodeGroupsRendered)
			this.nodeGroupsRendered = null;
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
	}

	/**
	 * Update an existing NodeGroup, created from the same html strings, with new values.
	 * @param ng {NodeGroup}
	 * @param item {Template|string} */
	rewriteNodeGroup(ng, item) {
		if (typeof item === 'string') { // Text content.
			ng.startNode.nodeValue = item;
			ng.template.html[0] = item; // Text templates have their own html array, so this can't affect others.
			ng.closeKey = item;
			ng.exactKey = undefined;
		}
		else {
			// When every path consumes exactly one expression, paths align 1:1 with exprs,
			// so only the expressions that changed need to be applied.
			if (ng.pathsSingleExpr) {
				let oldExprs = ng.template.exprs, newExprs = item.exprs;
				let paths = ng.paths;
				for (let i = paths.length - 1; i >= 0; i--)
					if (!exprSame(oldExprs[i], newExprs[i]))
						paths[i].applySingle(newExprs[i]);

				if (ng.styles)
					ng.updateStyles();
				ng.nodesCache = null;
				ng.firstApply = false;
			}
			else
				ng.applyExprs(item.exprs);
			ng.exactKey = undefined;
			ng.template = item;
		}
	}

	/**
	 * Create a NodeGroup for an item, reusing a detached one with the same html if available.
	 * @param item {Template|string}
	 * @return {NodeGroup} */
	createOrReuse(item) {
		let ng;
		if (typeof item === 'string') {
			item = textTemplate(item);
			return new NodeGroup(item, this); // Text NodeGroups have no paths to apply.
		}

		let pool = this.nodeGroupsDetachedAvailable;
		if (pool) {
			ng = pool.deleteAny(item.getCloseKey());
			if (ng) {
				ng.applyExprs(item.exprs);
				ng.exactKey = undefined;
				ng.template = item;
				return ng;
			}
		}

		ng = new NodeGroup(item, this);
		if (item.exprs.length || (ng.paths && ng.paths.length))
			ng.applyExprs(item.exprs);
		return ng;
	}

	/**
	 * Recursively flatten expr into items, evaluating functions and converting primitives to text Templates.
	 * Mirrors the behavior of exprToTemplates() but produces a flat array.
	 * @param expr
	 * @param items {(Template|Node)[]}
	 * @param hasNodes {boolean}
	 * @return {boolean} True if any raw Nodes were added to items. */
	collectItems(expr, items, hasNodes) {
		if (expr instanceof Template)
			items.push(expr);

		else if (Array.isArray(expr)) {
			for (let subExpr of expr) {
				if (subExpr instanceof Template) // Inline the most common case.
					items.push(subExpr);
				else
					hasNodes = this.collectItems(subExpr, items, hasNodes);
			}
		}

		else if (typeof expr === 'function') {
			Globals.currentPath = this; // Used by watch()
			this.watchFunction = expr;
			expr = expr();
			Globals.currentPath = null;
			hasNodes = this.collectItems(expr, items, hasNodes);
		}

		else if (expr instanceof NodeList) {
			for (let node of expr)
				items.push(node);
			hasNodes = hasNodes || expr.length > 0;
		}

		else if (expr?.nodeType) {
			if (expr.nodeType === 11) { // DocumentFragment
				for (let node of [...expr.childNodes])
					items.push(node);
			}
			else
				items.push(expr);
			hasNodes = true;
		}

		// String/Number/Date/Boolean.  Pushed as a plain string to avoid allocating a Template.
		else {
			if (expr === undefined || expr === false || expr === null) // Util.isFalsy() inlined
				expr = '';
			else if (typeof expr !== 'string')
				expr += '';

			items.push(expr);
		}
		return hasNodes;
	}

	/**
	 * The original hash/map based reconciliation.  Used when expressions contain raw Nodes,
	 * since those can't be tracked by the positional diff.
	 * @param items {(Template|Node)[]}
	 * @param freeNodeGroups {boolean} */
	applyGeneric(items, freeNodeGroups=true) {
		let path = this;

		// This can be done at the beginning or the end of this function.
		// If at the end, we may get rendering done faster.
		// But when at the beginning, it leaves all the nodes in-use so we can do a renderWatched().
		if (freeNodeGroups)
			path.freeNodeGroups();

		/** @type {(Node|NodeGroup|Expr)[]} */
		let newNodes = [];
		let oldNodeGroups = path.nodeGroups;
		/*#IFDEV*/assert(!oldNodeGroups.includes(null))/*#ENDIF*/
		let secondPass = []; // indices

		path.nodeGroups = []; // Reset before applyExactNodes and the code below rebuilds it.
		for (let item of items) {
			if (typeof item === 'string')
				item = textTemplate(item);
			path.applyExactNodes(item, newNodes, secondPass);
		}

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
				if (path.wholeParent)
					udomdiff(path.nodeMarker, oldNodes, newNodes, null)
				else
					udomdiff(path.nodeMarker.parentNode, oldNodes, newNodes, path.nodeMarker)
			}

			// TODO: Put this in a remove() function of NodeGroup.
			// Then only run it on the old nodeGroups that were actually removed.
			//Util.saveOrphans(oldNodeGroups, oldNodes);

			for (let ng of oldNodeGroups)
				if (!ng.startNode.parentNode)
					Util.saveOrphans(ng.getNodes());
		}
	}

	/**
	 * Try to apply Nodes that are an exact match, by finding existing nodes from the last render
	 * that have the same value as created by the expr.
	 * This is called from Path.applyNodes().
	 *
	 * @param expr {Template|Node|Array|function|*}
	 * @param newNodes {(Node|Template)[]} An inout parameter; we add the nodes here as we go.
	 * @param secondPass {[int, int][]} Locations within newNodes for Path.applyNodes() to evaluate later,
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
				if (ng.hasComponentPaths)
					ng.applyExprs(expr.exprs, false, false);

				this.nodeGroups.push(ng);
				return ng;
			}

			// If expression, mark it to be evaluated later in Path.apply() to find partial match.
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

			// We use the path's end (nodeMarker, or the end of the parent) if the subsequent (or all) nodeGroups have been removed.
			let anchor = this.nodeGroups[op.index + replaceCount]?.startNode || (this.wholeParent ? null : this.nodeMarker);
			let parent = this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
			for (let i = 0; i < newItems.length; i++) {

				// Try to find exact match
				let template = this.mapCallback(newItems[i]);
				let ng = this.getNodeGroup(template, true);  // Removes from nodeGroupsAttached and adds to nodeGroupsRendered()
				if (!ng) 	// Find a close match or create a new node group
					ng = this.getNodeGroup(template, false); // adds back to nodeGroupsRendered()

				this.nodeGroups.push(ng);

				// Splice in the new nodes.
				for (let node of ng.getNodes())
					parent.insertBefore(node, anchor);
			}
		}

		//#IFDEV
		assert(this.nodeGroups.length === op.array.length);
		//#ENDIF

		// TODO: update or invalidate the nodes cache?
		this.nodesCache = null;
	}

	/**
	 * Clear the nodeCache of this Path, as well as all parent and child Paths that
	 * share the same DOM parent node. */
	clearNodesCache() {
		let path = this;

		// Clear cache parent Paths that have the same parentNode
		let parentNode = this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
		while (path && (path.wholeParent ? path.nodeMarker : path.nodeMarker.parentNode) === parentNode) {
			path.nodesCache = null;
			path = path.parentNg?.parentPath

			// If stuck in an infinite loop here, the problem is likely due to Template hash colisions.
			// Which cause one path to be the descendant of itself, creating a cycle.
		}
	}

	/**
	 * Attempt to remove all of this Path's nodes from the DOM, if it can be done using a special fast method.
	 * @returns {boolean} Returns false if Nodes weren't removed, and they should instead be removed manually. */
	fastClear() {
		if (this.wholeParent) {
			this.nodeMarker.textContent = '';
			return true;
		}

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
			// TODO: One Path can have multiple expr functions.
			// But if using it as a watch, it should only have one at the top level.
			// So maybe this is ok.
			Globals.currentPath = this; // Used by watch()

			this.watchFunction = expr; // TODO: Only do this if it's a top level function.
			expr = expr(); // As expr accesses watched variables, watch() uses Globals.currentPath to mark where those watched variables are being used.
			Globals.currentPath = null;

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
			result = collection?.deleteAny(template.getExactKey());
			if (!result) { // try searching detached
				collection = this.nodeGroupsDetachedAvailable;
				result = collection?.deleteAny(template.getExactKey());
			}

			if (result) {// also delete the matching close key.
				collection.deleteSpecific(template.getCloseKey(), result);

				result.template = template; // Keep current so the positional diff can compare exprs.
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
			result = collection?.deleteAny(template.getCloseKey());
			if (!result) { // try searching detached
				collection = this.nodeGroupsDetachedAvailable;
				result = collection?.deleteAny(template.getCloseKey());
			}

			if (result) {
				if (result.exactKey !== undefined)
					collection.deleteSpecific(result.exactKey, result);

				// Update this close match with the new expression values.
				result.applyExprs(template.exprs);
				result.exactKey = template.getExactKey();
				result.template = template; // Keep current so the positional diff can compare exprs.
			}
		}

		if (!result) {
			result = new NodeGroup(template, this);
			result.applyExprs(template.exprs);
			result.exactKey = template.getExactKey();
		}

		(this.nodeGroupsRendered ??= []).push(result);

		/*#IFDEV*/assert(result.parentPath);/*#ENDIF*/
		return result;
	}


	/**
	 * Move everything from this.nodeGroupsRendered to this.nodeGroupsAttached and nodeGroupsDetached.
	 * Called at the beginning of applyNodes() so it can have NodeGroups to use.
	 * TODO: this could run as needed in getNodeGroup? */
	freeNodeGroups() {
		// Add nodes that weren't used during render() to nodeGroupsDetached
		let previouslyAttached = this.nodeGroupsAttachedAvailable?.data;
		if (previouslyAttached) {
			let detached = (this.nodeGroupsDetachedAvailable ??= new MultiValueMap()).data;
			for (let key in previouslyAttached) {
				let src = previouslyAttached[key];
				let from = src.head || 0; // Skip entries already consumed by deleteAny().
				let array = detached[key];
				if (!array)
					detached[key] = from ? src.slice(from) : src;
				else
					for (let i=from; i<src.length; i++)
						array.push(src[i]);
			}
		}

		// Add nodes that were used during render() to nodeGroupsRendered.
		// If the last render used the positional diff, the in-use NodeGroups are in
		// this.nodeGroups instead of nodeGroupsRendered.
		this.nodeGroupsAttachedAvailable = new MultiValueMap();
		let nga = this.nodeGroupsAttachedAvailable;
		let source = this.nodeGroupsRendered?.length ? this.nodeGroupsRendered : this.nodeGroups;
		for (let ng of source) {
			if (ng.exactKey !== undefined) // The positional diff leaves exactKey undefined.
				nga.add(ng.exactKey, ng);
			nga.add(ng.closeKey, ng);
		}

		this.nodeGroupsRendered = null;
	}



	/**
	 * If not for watch.js, this could be moved to PathToNodes.js
	 * @return {(Node|HTMLElement)[]} */
	getNodes() {

		// Why doesn't this work?
		// let result2 = [];
		// for (let ng of this.nodeGroups)
		// 	result2.push(...ng.getNodes())
		// return result2;

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
		let current, stop = null;
		if (this.wholeParent)
			current = this.nodeMarker.firstChild;
		else {
			current = this.nodeBefore.nextSibling;
			stop = this.nodeMarker;
		}
		while (current && current !== stop) {
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

/**
 * @param text {string}
 * @return {Template} */
function textTemplate(text) {
	let result = new Template([text], []);
	result.isText = true;
	return result;
}

/**
 * Does the NodeGroup already have content identical to item?
 * @param ng {NodeGroup}
 * @param item {Template|string}
 * @return {boolean} */
function itemSame(ng, item) {
	let tpl = ng.template;
	if (typeof item === 'string')
		return tpl.isText === true && tpl.html[0] === item;
	return templatesSame(tpl, item);
}

/**
 * Could ng be rewritten in place with the values of item?
 * True when both come from the same html strings (and thus the same Shell), or both are text.
 * @param ng {NodeGroup}
 * @param item {Template|string}
 * @return {boolean} */
function itemClose(ng, item) {
	let tpl = ng.template;
	if (typeof item === 'string')
		return tpl.isText === true;
	return tpl.html === item.html && tpl.svgMode === item.svgMode;
}

/**
 * Do two templates produce identical content?
 * Compares expression values by identity, so no hashing or stringification is needed.
 * @param a {Template}
 * @param b {Template}
 * @return {boolean} */
function templatesSame(a, b) {
	if (a.html === b.html && a.svgMode === b.svgMode) {
		let ae = a.exprs, be = b.exprs;
		for (let i=0; i<ae.length; i++)
			if (!exprSame(ae[i], be[i]))
				return false;
		return true;
	}

	// Text and other single-string templates get a new html array each time, so compare by content.
	if (a.isText === b.isText && !a.exprs.length && !b.exprs.length
		&& a.html.length === 1 && b.html.length === 1 && a.svgMode === b.svgMode)
		return a.html[0] === b.html[0];

	return false;
}

/**
 * @return {boolean} */
function exprSame(a, b) {
	if (a === b)
		return true;
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length)
			return false;
		for (let i=0; i<a.length; i++)
			if (!exprSame(a[i], b[i]))
				return false;
		return true;
	}
	if (a instanceof Template && b instanceof Template)
		return templatesSame(a, b);
	return false;
}
