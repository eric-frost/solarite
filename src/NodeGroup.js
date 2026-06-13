import assert from "./assert.js";
import Util, {flattenAndIndent, nodeToArrayTree, setIndent} from "./Util.js";
import {exprSame} from "./Template.js";
import Shell from "./Shell.js";
import Path from "./Path.js";
import Globals from './Globals.js';
import PathToComponent from "./PathToComponent.js";
import PathToNodes from "./PathToNodes.js";

/** @typedef {boolean|string|number|function|Object|Array|Date|Node|Template} Expr */

/**
 * A group of Nodes instantiated from a Shell, with Expr's filled in.
 *
 * The range is determined by startNode and nodeMarker.
 * startNode - never null.  An empty text node is created before the first path if none exists.
 * nodeMarker - null if this Nodegroup is at the end of its parents' nodes.*/
export default class NodeGroup {

	/**
	 * @Type {RootNodeGroup} */
	rootNg;

	/** @type {Path} */
	parentPath;

	/** @type {Node|HTMLElement} First node of NodeGroup. Should never be null. */
	startNode;

	/** @type {Node|HTMLElement} A node that never changes that this NodeGroup should always insert its nodes before.
	 * An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * TODO: But sometimes startNode and endNode point to the same node.  Document this inconsistency. */
	endNode;

	/** @type {?Path[]} Null for text NodeGroups; created by setPathsFromFragment(). */
	paths = null;

	/** @type {string} Key that only matches the template. */
	closeKey;

	/** @type {*} List key from the template's key=${} expression; written by PathToKey,
	 * matched by PathToNodes.applyKeyed().  Undefined for unkeyed NodeGroups. */
	key;

	/** @type {boolean} True if any of this NodeGroup's own paths is a PathToComponent. */
	hasComponentPaths = false;

	/** @type {boolean} True if every path consumes exactly one expression and none are components. */
	pathsSingleExpr = false;

	/** @type {boolean} True until applyExprs() finishes the first time.
	 * While true, ancestor node caches can't reference this NodeGroup's nodes, so they don't need invalidation. */
	firstApply = true;

	/**
	 * @internal
	 * @type {Node[]} Cached result of getNodes() used only for improving performance.*/
	nodesCache;

	/**
	 * A map between <style> Elements and their text content.
	 * This lets NodeGroup.updateStyles() see when the style text has changed.
	 * @type {?Map<HTMLStyleElement, string>} */
	styles;

	/** @type {Template} */
	template;


	/**
	 * Create an "instantiated" NodeGroup from a Template and add it to an element.
	 * Don't call applyExprs() yet to apply expressions or instantiate components yet.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param parentPath {?Path}
	 * @param el {?HTMLElement} Optional, pre-existing htmlElement that will be the root.
	 * @param options {?object} Only used for RootNodeGroup */
	constructor(template, parentPath=null, el=null, options=null) {
		this.rootNg = parentPath?.parentNg?.rootNg || this;
		this.parentPath = parentPath;

		/*#IFDEV*/assert(this.rootNg);/*#ENDIF*/
		this.template = template;

		// If it's just a text node, skip a bunch of unnecessary steps.
		// el can be an existing Text node to adopt, from PathToNodes' bare-text fast path.
		if (template.isText) {
			this.closeKey = template.getCloseKey();
			this.startNode = this.endNode = el || Globals.doc.createTextNode(template.html[0]);
		}

		else {
			// Get a cached version of the parsed and instantiated html, and Paths:
			const shell = Shell.get(template.html, template.svgMode);

			// The shell caches the close key so each new template doesn't repeat the WeakMap lookup.
			this.closeKey = shell.closeKey ??= template.getCloseKey();

			this.hasComponentPaths = shell.hasComponentPaths;
			this.pathsSingleExpr = shell.pathsSingleExpr;

			// A lone root element is cloned directly, skipping a throwaway fragment wrapper.
			// Only for child NodeGroups; RootNodeGroup's grafting expects a fragment.
			if (shell.singleRoot && parentPath !== null) {
				const clone = shell.fragment.firstChild.cloneNode(true);
				this.startNode = this.endNode = clone;

				// Stampable shells skip path creation entirely; the first applyExprs() routes
				// to applyStamp(), and paths are materialized only if the group is rewritten.
				if (shell.stampable !== true)
					this.setPathsFromFragment(clone, shell, 0, true);
			}
			else {
				const shellFragment = shell.fragment.cloneNode(true);

				if (shellFragment.nodeType === 11) { // DocumentFragment
					this.startNode = shellFragment.firstChild;
					this.endNode = shellFragment.lastChild;
				} else
					this.startNode = this.endNode = shellFragment;

				this.instantiate(shell, shellFragment, el, options);
			}
		}

		//#IFDEV
		this.verify();
		//#ENDIF
	}

	/**
	 * Set up paths and embeds from the cloned fragment.
	 * RootNodeGroup overrides this with its more involved setup.
	 * @param shell {Shell}
	 * @param shellFragment {DocumentFragment|HTMLElement|Text}
	 * @param el {?HTMLElement} Unused here; used by RootNodeGroup.
	 * @param options {?object} Unused here; used by RootNodeGroup. */
	instantiate(shell, shellFragment, el, options) {
		if (shell.paths.length)
			this.setPathsFromFragment(shellFragment, shell);

		if (shell.hasEmbeds)
			this.activateEmbeds(shellFragment, shell);
	}


	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param includeNonComponents {boolean} False to only apply component paths,
	 * used when the non-component exprs are known to be unchanged. */
	applyExprs(exprs, includeNonComponents=true) {

		/*#IFDEV*/
		this.verify();
		/*#ENDIF*/

		let paths = this.paths;

		// Fast path: every path consumes exactly one expression and none are components,
		// so skip the bookkeeping that maps expressions to paths.
		if (this.pathsSingleExpr) {
			if (includeNonComponents) {
				if (paths === null) { // Created from a stampable shell; no paths yet.
					this.applyStamp(exprs);
					return;
				}
				for (let i = paths.length - 1; i >= 0; i--)
					paths[i].applySingle(exprs[i]);

				if (this.styles)
					this.updateStyles();

				// Invalidate the nodes cache because we just changed it.
				this.nodesCache = null;
			}
			this.firstApply = false;
			return;
		}

		if (!paths) { // Text NodeGroups have no paths.
			this.firstApply = false;
			return;
		}

		// Things to consider:
		// 1. Paths consume a varying number of expressions.
		//    An PathToAttribs may use multipe expressions.  E.g. <div class="${1} ${2}">
		//    While an PathToComponent uses zero.
		// 2. An PathToComponent references other Paths that set its attribute values.
		// 3. We apply them in reverse order so that a <select> box has its children created from an expression
		//    before its instantiated and its value attribute is set via an expression.
		let exprIndex = exprs.length; // Update exprs at paths.
		let pathExprs = new Array(paths.length); // Store all the expressions that map to a single path.  Only paths to attribute values can have more than one.
		for (let i = paths.length - 1, path; path = paths[i]; i--) {
			if (i===0 && path instanceof PathToComponent && path.nodeMarker === this.getRootNode())
				continue;

			// Get the expressions associated with this path.
			let exprCount = path.getExpressionCount();
			pathExprs[i] = exprs.slice(exprIndex-exprCount, exprIndex); // slice() probably doesn't allocate if the JS vm implements copy on write.
			exprIndex -= exprCount;

			// Component expressions don't have a corresponding user-provided expression.
			// They use expressions from the paths that provide their attributes.
			if (path instanceof PathToComponent) {
				let attribExprs = pathExprs.slice(i+1, i+1 + path.attribPaths.length); // +1 b/c we move forward from the component path.
				path.apply(attribExprs);
			}
			else if (includeNonComponents)
				path.apply(pathExprs[i]);
		}

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		/*#IFDEV*/
		assert(exprIndex === 0);
		/*#ENDIF*/


		if (includeNonComponents) {

			// TODO: Only do this if we have Paths within styles?
			this.updateStyles();

			// Invalidate the nodes cache because we just changed it.
			this.nodesCache = null;

		}
		this.firstApply = false;

		/*#IFDEV*/
		this.verify();
		/*#ENDIF*/
	}

	/**
	 * Write expressions into a freshly stamped (or pooled path-less) NodeGroup through the
	 * shell's shared stamper paths, allocating no per-instance Path objects.
	 * Child-node expressions must be primitives (one text write each); anything else
	 * falls back to materializing real paths and applying normally.
	 * @param exprs {Expr[]} */
	applyStamp(exprs) {
		let template = this.template;
		let shell = Shell.get(template.html, template.svgMode);

		// 1. Bail to real paths when any child-node expression isn't a primitive.
		let nodesIdx = shell.nodesPathIdx;
		for (let i=0; i<nodesIdx.length; i++) {
			let t = typeof exprs[nodesIdx[i]];
			if (t !== 'string' && t !== 'number') {
				let paths = this.materializePaths(shell);
				for (let i = paths.length - 1; i >= 0; i--)
					paths[i].applySingle(exprs[i]);
				this.nodesCache = null;
				this.firstApply = false;
				return;
			}
		}

		// 2. Resolve target nodes, then write each expression through the shared stampers.
		let slots = this.resolveStampSlots(shell);
		let paths = shell.paths, stampers = shell.stampPaths;
		for (let i = paths.length - 1; i >= 0; i--) {
			let stamper = stampers[i];
			stamper.nodeMarker = slots[paths[i].markerSlot];
			stamper.parentNg = this;
			stamper.applySingle(exprs[i]);
		}

		// 3. Clear per-row state the child-node stampers accumulated, so they're clean for the next row.
		for (let i=0; i<nodesIdx.length; i++) {
			let s = stampers[nodesIdx[i]];
			s.textNode = null;
			s.textValue = null;
			s.nodesCache = null;
		}

		this.nodesCache = null;
		this.firstApply = false;
	}

	/**
	 * In-place rewrite of a stamped (path-less) NodeGroup through the shared stampers,
	 * comparing expressions and writing only the changed ones.  The group stays path-less.
	 * @param template {Template} The new template; the caller assigns it to this.template.
	 * @return {boolean} False when a child-node expression isn't primitive; the caller
	 * must then materialize paths and apply normally. */
	rewriteStamp(template) {
		let shell = Shell.get(template.html, template.svgMode);
		let newExprs = template.exprs;
		let nodesIdx = shell.nodesPathIdx;
		for (let i=0; i<nodesIdx.length; i++) {
			let t = typeof newExprs[nodesIdx[i]];
			if (t !== 'string' && t !== 'number')
				return false;
		}

		let oldExprs = this.template.exprs;
		let paths = shell.paths, stampers = shell.stampPaths;
		let slots = null; // Nodes are resolved only if something actually changed.
		for (let i = paths.length - 1; i >= 0; i--) {
			if (!exprSame(oldExprs[i], newExprs[i])) {
				if (slots === null)
					slots = this.resolveStampSlots(shell);
				let stamper = stampers[i];
				stamper.nodeMarker = slots[paths[i].markerSlot];
				stamper.parentNg = this;
				stamper.applySingle(newExprs[i]);
			}
		}

		if (slots !== null)
			for (let i=0; i<nodesIdx.length; i++) {
				let s = stampers[nodesIdx[i]];
				s.textNode = null;
				s.textValue = null;
				s.nodesCache = null;
			}
		return true;
	}

	/**
	 * Run the shell's resolve program from this NodeGroup's root element.
	 * Only valid for singleRoot shells, whose ops always start with the root's own pair.
	 * @param shell {Shell}
	 * @return {Node[]} The shell's shared scratch slots array. */
	resolveStampSlots(shell) {
		let slots = shell.resolveSlots;
		slots[1] = this.startNode;
		let ops = shell.resolveOps;
		// firstChild/nextSibling pointer walk; see setPathsFromFragment for why not childNodes[i].
		for (let i=2, s=2; i<ops.length; i+=2, s++) {
			let node = slots[ops[i]].firstChild;
			for (let k=ops[i+1]; k>0; k--)
				node = node.nextSibling;
			slots[s] = node;
		}
		return slots;
	}

	/**
	 * Create the real Path objects for a NodeGroup that was created by applyStamp().
	 * Called lazily, the first time the group is rewritten in place.
	 * Recovers the bare-text state of child-node paths that stamped a primitive.
	 * @param shell {?Shell}
	 * @return {Path[]} */
	materializePaths(shell=null) {
		shell ??= Shell.get(this.template.html, this.template.svgMode);
		let slots = this.resolveStampSlots(shell);
		let paths = shell.paths;
		let pathLength = paths.length;
		let result = this.paths = new Array(pathLength);
		for (let i=0; i<pathLength; i++) {
			let p = paths[i];
			let path = p.cloneWithNodes(p.beforeSlot >= 0 ? slots[p.beforeSlot] : null, slots[p.markerSlot]);
			path.parentNg = this;
			result[i] = path;
		}

		// A wholeParent child-node path that stamped a primitive left exactly one Text child.
		for (let idx of shell.nodesPathIdx) {
			let path = result[idx];
			let tn = path.nodeMarker.firstChild;
			if (tn !== null && tn.nodeType === 3 && tn === path.nodeMarker.lastChild) {
				path.textNode = tn;
				path.textValue = tn.nodeValue;
			}
		}
		return result;
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
	 * Copy paths in fragment to this.paths.
	 * @param fragment {DocumentFragment|HTMLElement}
	 * @param shell {Shell}
	 * @param startingPathDepth {int}
	 * @param isRootClone {boolean} True when fragment is a direct clone of a singleRoot
	 * shell's root element: it fills slot 1 itself and the first op pair is skipped. */
	setPathsFromFragment(fragment, shell, startingPathDepth=0, isRootClone=false) {
		let paths = shell.paths;
		let pathLength = paths.length; // For faster iteration
		let result = this.paths = new Array(pathLength);

		// Fast path: run the shell's precomputed resolve program (see Shell.buildResolveProgram).
		// Each Path.clone() would walk childNodes from the fragment root to its target node,
		// re-traversing the same ancestors for every path.  The program instead resolves each
		// unique node exactly once into the slots array:  ops is flat [parentSlot, childIndex]
		// pairs in dependency order, pair i filling slot i+1, with slot 0 being the fragment.
		// Paths then copy themselves via cloneWithNodes() using their precomputed slot indexes.
		// Only built for component-free shells, since PathToComponent.clone() has special
		// attribPaths behavior; pathOffset!==0 (root grafting) also uses the fallback.
		let ops = shell.resolveOps;
		if (ops && startingPathDepth === 0) {
			let slots = shell.resolveSlots;
			let i = 0, s = 1;
			if (isRootClone) { // Slot 1 is the root element itself; skip its op pair.
				slots[1] = fragment;
				i = 2;
				s = 2;
			}
			else
				slots[0] = fragment;
			// Resolve each node via firstChild/nextSibling pointer walks instead of
			// childNodes[index]; the live NodeList indexing is markedly slower, and indices
			// are small (markers are elements, often the first child after whitespace stripping).
			for (; i<ops.length; i+=2, s++) {
				let node = slots[ops[i]].firstChild;
				for (let k=ops[i+1]; k>0; k--)
					node = node.nextSibling;
				slots[s] = node;
			}
			for (let i=0; i<pathLength; i++) {
				let p = paths[i];
				let path = p.cloneWithNodes(p.beforeSlot >= 0 ? slots[p.beforeSlot] : null, slots[p.markerSlot]);
				path.parentNg = this;
				result[i] = path;
			}
		}
		else
			for (let i=0; i<pathLength; i++) {
				let path = paths[i].clone(fragment, startingPathDepth)
				path.parentNg = this;
				result[i] = path;
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
					let el = Path.resolve(root, path);
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
					let style = Path.resolve(root, path);
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
					let script = Path.resolve(root, path);
					eval(script.textContent)
				}
			}
		}
	}

	//#IFDEV
	getParentNode() {
		return this.startNode?.parentNode
	}

	get debug() {
		return [
			`parentNode: ${this.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item?.nodeType) {

					let tree = nodeToArrayTree(item, nextNode => {

						let path = this.paths.find(path=>(path instanceof PathToNodes) && path.getNodes().includes(nextNode));
						if (path)
							return [`Path.nodes:`]

						return [];
					})

					// TODO: How to indend nodes belonging to a path vs those that just occur after the path?
					return flattenAndIndent(tree)
				}
				else if (item instanceof Path)
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

		for (let path of this.paths || []) {
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
}




