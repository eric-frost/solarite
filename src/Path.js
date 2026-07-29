import assert from "./assert.js";

/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup. */
export default class Path {

	// Used for attributes:

	/**
	 * @type {Node} Node that occurs before this Path's first Node.
	 * This is necessary because reconcileNodes() can steal nodes from another Path.
	 * If we had a pointer to our own startNode then that node could be moved somewhere else w/o us knowing it.
	 * Used only for type='content'
	 * Will be null if Path has no Nodes. */
	nodeBefore;

	/**
	 * If type is AttribType.Multiple or AttribType.Value, points to the node having the attribute.
	 * If type is 'content', points to a node that never changes that this NodeGroup should always insert its nodes before.
	 *	 An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * @type {Node|HTMLElement} */
	nodeMarker;

	/**
	 * @type {boolean} True if the expression is the only child of its parent element.
	 * Then nodeMarker is that parent element, nodeBefore is null, and no marker comments exist. */
	wholeParent = false;


	// These are set after an expression is assigned:

	/** @type {NodeGroup} */
	parentNg;

	// Caches to make things faster

	/**
	 * @private
	 * @type {Node[]} Cached result of getNodes() */
	nodesCache;

	/** @type {boolean|undefined} True when this path provides an attribute of a web component
	 * (a -solarite-placeholder element).  Only attribute paths ever set it true, but it's
	 * declared here on every Path because clone() and cloneWithNodes() copy it to every clone;
	 * declaring it keeps those stores from transitioning the clone's hidden class. */
	isComponentAttrib;

	/** @type {boolean} True when re-applying an expression identical to the one already
	 * applied is provably a no-op, so a re-render can skip this path entirely.  Only event
	 * bindings qualify: binding the same handler to the same node again changes nothing,
	 * while an attribute or a child expression may have been altered outside the template. */
	skipIfSame = false;

	/** @type {boolean|undefined} True when the attribute is a live HTML property
	 * (checked/value/selected — Util.isHtmlProp), which users can flip underneath the
	 * template.  Declared here for the same hidden-class reason as isComponentAttrib. */
	isHtmlProperty;

	// Set only on Shell paths, never on cloned instances, so they're not declared as
	// class fields; that would cost a store per field on every clone:
	// nodeBeforeIndex {int} Index of nodeBefore among its parentNode's children.
	// nodeMarkerPath {int[]} Path to the node marker, in reverse for performance reasons.
	// markerSlot/beforeSlot {int} Slot indexes into the Shell's resolve program.


	/**
	 * @param nodeBefore {Node}
	 * @param nodeMarker {?Node}*/
	constructor(nodeBefore, nodeMarker) {
		this.nodeBefore = nodeBefore;
		this.nodeMarker = nodeMarker;
		/*#IFDEBUG*/this.verify();/*#ENDIF*/
	}

	/**
	 * Apply expressions to a path.
	 * This is called by NodeGroup.applyExprs() when it's time to put the expression values into the DOM.
	 *
	 * @param exprs {Expr[]}
	 * Suppose we have the following tagged template:
	 * `<div title=${expr1} class="big ${expr2} muted ${expr3}">
	 *    ${expr4}
	 *    <my-component></my-component>
	 *    <my-component user=${expr5} roles="${expr6},${expr7}"></my-component>
	 * </div>`
	 * The exprs arrays will look like this, with each being passed to a path.
	 * [expr1]                   // title attribute value.
	 * [expr2, expr3]            // class attribute values.
	 * [expr4]                   // children of div.
	 * []                        // arguments to first my-component constructor.
	 * [[expr5], [expr6, expr7]] // arguments to second my-component constructor.
	 * [expr5]                   // user attribute value.
	 * [expr6, expr7]            // role attribute value. */
	apply(exprs) {}

	/**
	 * Fast path used by NodeGroup.applyExprs() when every path consumes exactly one expression.
	 * Avoids allocating per-path expression arrays.
	 * @param expr {Expr} */
	applySingle(expr) {}

	getExpressionCount() { return 1 }


	/**
	 * Resolve nodeMarkerPath to new root. */
	getNewNodeMarker(newRoot, pathOffset) {
		let root = newRoot;
		let path = this.nodeMarkerPath;
		let pathLength = path.length - pathOffset;
		for (let i=pathLength-1; i>0; i--) { // Resolve the path.
			//#IFDEBUG
			assert(root.childNodes[path[i]]);
			//#ENDIF
			root = root.childNodes[path[i]];
		}
		let childNodes = root.childNodes;

		return pathLength
			? childNodes[path[0]]
			: newRoot;
	}


	/**
	 * Copy this path, pointing it at already-resolved nodes.
	 * Used by the Shell resolve-program fast path in NodeGroup.setPathsFromFragment().
	 * @param nodeBefore {?Node}
	 * @param nodeMarker {Node}
	 * @return {Path} */
	cloneWithNodes(nodeBefore, nodeMarker) {
		let result = new this.constructor(nodeBefore, nodeMarker, this.attrName, this.attrValue);
		result.isComponentAttrib = this.isComponentAttrib;
		result.wholeParent = this.wholeParent;
		result.isHtmlProperty = this.isHtmlProperty;
		return result;
	}

	/**
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {Path} */
	clone(newRoot, pathOffset=0) {
		/*#IFDEBUG*/this.verify();/*#ENDIF*/

		// Resolve node paths.  nodeBefore is always a sibling of nodeMarker (Shell builds it from
		// nodeMarker.previousSibling, or inserts a comment immediately before it), so the list
		// nodeBeforeIndex counts within is the marker's own parent's childNodes.  An empty path
		// leaves the marker as newRoot itself, and then that list is newRoot's children.
		let nodeBefore;
		let nodeMarker = this.getNewNodeMarker(newRoot, pathOffset);
		if (this.nodeBefore) {
			let childNodes = (nodeMarker === newRoot ? newRoot : nodeMarker.parentNode).childNodes;
			//#IFDEBUG
			assert(childNodes[this.nodeBeforeIndex]);
			//#ENDIF
			nodeBefore = childNodes[this.nodeBeforeIndex];
		}

		let result = new this.constructor(nodeBefore, nodeMarker, this.attrName, this.attrValue);

		result.isComponentAttrib = this.isComponentAttrib;
		result.wholeParent = this.wholeParent;

		// TODO: Put this in PathToAttribValue.clone().
		result.isHtmlProperty = this.isHtmlProperty;

		//#IFDEBUG
		result.verify();
		//#ENDIF

		return result;
	}

	/** @return {int[]} Returns indices in reverse order, because doing it that way is faster. */
	static get(node) {
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
	 * @returns {Node|HTMLElement|HTMLStyleElement} */
	static resolve(root, path) {
		for (let i=path.length-1; i>=0; i--)
			root = root.childNodes[path[i]];
		return root;
	}

	//#IFDEBUG

	/** @return {HTMLElement|ParentNode} */
	getParentNode() {
		return this.nodeMarker.parentNode
	}

	verify() {
		if (!window.verify)
			return;

		// Need either nodeMarker or parentNode
		assert(this.nodeMarker)

		// nodeMarker must be attached, unless it's an element that is itself the top of a
		// singleRoot shell clone (no fragment wrapper exists above it).
		assert(!this.nodeMarker || this.nodeMarker.parentNode || this.wholeParent || this.nodeMarker.nodeType === 1)

		assert(this.nodeBefore !== this.nodeMarker)

		// Detect cyclic parent and grandparent references.
		assert(this.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath?.parentNg?.parentPath !== this)

		for (let ng of this.nodeGroups || [])
			ng.verify();

		// Make sure the nodesCache matches the nodes.
		//this.checkNodesCache();
	}
	//#ENDIF
}