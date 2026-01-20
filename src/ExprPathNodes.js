import ExprPath, {ExprPathType} from "./ExprPath.js";
import {assert} from "./assert.js";
import NodeGroup from "./NodeGroup.js";
import Util from "./Util.js";
import udomdiff from "./udomdiff.js";
import Template from "./Template.js";

export default class ExprPathNodes extends ExprPath {

	constructor(nodeBefore, nodeMarker, type, attrName=null, attrValue=null) {
		super(nodeBefore, nodeMarker, ExprPathType.Content, attrName, attrValue);
	}

	/**
	 * Insert/replace the nodes created by a single expression.
	 * Called by applyExprs()
	 * This function is recursive.  It calls functions that call applyNodes().
	 * @param expr {Expr}
	 * @param freeNodeGroups {boolean}
	 * @return {Node[]} New Nodes created. */
	applyNodes(expr, freeNodeGroups=true) {
		let path = this;

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
			if (!isNowEmpty || !path.fastClear())
				// Rearrange nodes.
				udomdiff(path.nodeMarker.parentNode, oldNodes, newNodes, path.nodeMarker)

			// TODO: Put this in a remove() function of NodeGroup.
			// Then only run it on the old nodeGroups that were actually removed.
			//Util.saveOrphans(oldNodeGroups, oldNodes);

			for (let ng of oldNodeGroups)
				if (!ng.startNode.parentNode)
					ng.removeAndSaveOrphans();

			// Instantiate components created within ${...} expressions.
			// Also see this.applyExactNodes() which handles calling render() on web components even if they are unchanged.
			for (let el of newNodes) {
				if (el?.nodeType === 1) { // HTMLElement
					if (el.hasAttribute('solarite-placeholder'))
						this.parentNg.handleComponent(el, null, true);
					for (let child of el.querySelectorAll('[solarite-placeholder]'))
						this.parentNg.handleComponent(child, null, true);
				}
			}
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
				// Re-apply all expressions if there's a web component, so we can pass them to its constructor.
				// NodeGroup.applyExprs() is used to call applyComponentExprs() on web components that have expression attributes.
				// For those that don't, we call applyComponentExprs() directly here.
				// Also see similar code at the end of this.applyNodes() which handles web components being instantiated the first time.
				// TODO: This adds significant time to the Benchmark.solarite._partialUpdate test.
				let apply = false;
				for (let el of newestNodes) {
					if (el?.nodeType === 1) { // HTMLElement

						// Benchmarking shows that walkDOM is significantly faster than querySelectorAll('*') and document.createTreeWalker.
						walkDOM(el, (child) => {
							//console.log(child)
							if (child.tagName.includes('-')) {
								if (!expr.exprs.find(expr => expr?.nodeMarker === child))
									this.parentNg.handleComponent(child, null, true);
								else
									apply = true;
							}
						});
					}
				}

				// This calls render() on web components that have expressions as attributes.
				if (apply) {
					ng.applyExprs(expr.exprs);
					ng.exactKey = expr.getExactKey();
				}

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

}


function walkDOM(el, callback) {
	callback(el);
	let child = el.firstElementChild;
	while (child) {
		walkDOM(child, callback);
		child = child.nextElementSibling;
	}
}
