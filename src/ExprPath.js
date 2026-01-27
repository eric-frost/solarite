import {assert} from "./assert.js";

/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup. */
export default class ExprPath {

	// Used for attributes:


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


	/** @type {?function} A function called by renderWatched() to update the value of this expression. */
	watchFunction


	/**
	 * @param nodeBefore {Node}
	 * @param nodeMarker {?Node}*/
	constructor(nodeBefore, nodeMarker) {
		this.nodeBefore = nodeBefore;
		this.nodeMarker = nodeMarker;
		/*#IFDEV*/this.verify();/*#ENDIF*/
	}

	/**
	 * Apply any type of expression.
	 * This calls other apply functions.
	 *
	 * One very messy part of this function is that it may apply multiple expressions if they're all part
	 * of the same attribute value.
	 *
	 * We should modify path.applyValueAttrib so it stores the procssed parts and then only calls
	 * setAttribute() once all the pieces are in place.
	 *
	 * @param exprs {Expr[]}
	 * @param freeNodeGroups {boolean} Used only by watch. */
	apply(exprs, freeNodeGroups=true) {}


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
		let path = this.nodeMarkerPath;
		let pathLength = path.length - pathOffset;
		for (let i=pathLength-1; i>0; i--) { // Resolve the path.
			//#IFDEV
			assert(root.childNodes[path[i]]);
			//#ENDIF
			root = root.childNodes[path[i]];
		}
		let childNodes = root.childNodes;

		nodeMarker = pathLength
			? childNodes[path[0]]
			: newRoot;
		if (this.nodeBefore) {
			//#IFDEV
			assert(childNodes[this.nodeBeforeIndex]);
			//#ENDIF
			nodeBefore = childNodes[this.nodeBeforeIndex];

		}

		let result = new this.constructor(nodeBefore, nodeMarker, this.attrName, this.attrValue);
		result.isComponent = this.isComponent;

		//#IFDEV
		result.verify();
		//#ENDIF

		return result;
	}

	// Only used for watch.js
	getNodes() {
		return [this.nodeMarker];
	}

	//#IFDEV

	/** @return {HTMLElement|ParentNode} */
	getParentNode() {
		return this.nodeMarker.parentNode
	}

	verify() {
		if (!window.verify)
			return;

		//assert(this.type!==ExprPathType.Content || this.nodeBefore)
		//assert(this.type!==ExprPathType.Content || this.nodeBefore.parentNode)

		// Need either nodeMarker or parentNode
		assert(this.nodeMarker)

		// nodeMarker must be attached.
		assert(!this.nodeMarker || this.nodeMarker.parentNode)

		// nodeBefore and nodeMarker must have same parent.
		//assert(this.type!==ExprPathType.Content || this.nodeBefore.parentNode === this.nodeMarker.parentNode)

		assert(this.nodeBefore !== this.nodeMarker)
		//assert(this.type!==ExprPathType.Content|| !this.nodeBefore.parentNode || this.nodeBefore.compareDocumentPosition(this.nodeMarker) === Node.DOCUMENT_POSITION_FOLLOWING)

		// Detect cyclic parent and grandparent references.
		assert(this.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath?.parentNg?.parentPath !== this)

		for (let ng of this.nodeGroups)
			ng.verify();

		// Make sure the nodesCache matches the nodes.
		//this.checkNodesCache();
	}
	//#ENDIF
}