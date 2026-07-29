import assert from "./assert.js";
import Util, {flattenAndIndent, nodeToArrayTree, setIndent} from "./Util.js";
import {exprSame} from "./Template.js";
import Shell from "./Shell.js";
import Path from "./Path.js";
import Globals from './Globals.js';
import PathToComponent from "./PathToComponent.js";
import PathToNodes from "./PathToNodes.js";
import {ensureDelegatedDispatcher, delegatedRootKey} from "./PathToAttribValue.js";

/** @typedef {boolean|string|number|function|Object|Array|Date|Node|Template} Expr */

/** Stand-in Shell for text NodeGroups, which are never parsed from html.  Its default field
 * values (no components, no live properties, no single-expression paths) are exactly what the
 * per-row code must see for a bare Text node, so ng.shell is never null. */
const textShell = new Shell();

// The Shell whose delegated dispatchers a root last registered, kept on the RootNodeGroup so
// that a run of rows checks one field instead of asking at every bound node.  A Symbol rather
// than a declared field, since only root NodeGroups ever carry it and a declared field would
// cost a slot on every row.  The delegation mode isn't part of it: it comes from the root's
// render options, which are fixed when the root is created.
const lastStampedShellKey = Symbol('solariteStampedShell');

/**
 * Run a Shell's precomputed resolve program (see Shell.buildResolveProgram) into the shell's
 * shared slots array, which the caller has already seeded with its starting node.
 * Each node is reached with firstChild/nextSibling pointer walks instead of childNodes[index];
 * the live NodeList indexing is markedly slower, and the indices are small (markers are
 * elements, often the first child after whitespace stripping).  A negative step count means the
 * program reaches this node by walking forward from an earlier sibling's slot instead of from
 * its parent.
 * @param slots {Node[]} The shell's shared scratch array; slot 0 is the fragment.
 * @param ops {int[]} Flat [parentSlot, childIndex] pairs in dependency order.
 * @param i {int} Index of the first op pair to run; earlier pairs are pre-seeded by the caller.
 * @param s {int} Slot that pair fills.
 * @return {Node[]} slots, so callers can resolve and use it in one expression. */
function runResolveOps(slots, ops, i, s) {
	for (; i<ops.length; i+=2, s++) {
		let k = ops[i+1], node;
		if (k < 0) {
			node = slots[ops[i]];
			do
				node = node.nextSibling;
			while (++k < 0);
		}
		else {
			node = slots[ops[i]].firstChild;
			for (; k>0; k--)
				node = node.nextSibling;
		}
		slots[s] = node;
	}
	return slots;
}

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

	/** @type {Shell} The Shell this NodeGroup was cloned from, so the per-row code can read
	 * hasComponentPaths/hasLivePropPaths/pathsSingleExpr and the stamp program off it instead
	 * of copying them onto every instance and re-looking the Shell up on every apply.
	 * Text NodeGroups get the shared empty textShell, which reports false for all of them. */
	shell;

	/** @type {boolean} True until applyExprs() finishes the first time.
	 * While true, ancestor node caches can't reference this NodeGroup's nodes, so they don't need invalidation. */
	firstApply = true;

	/**
	 * @internal
	 * @type {Node[]} Cached result of getNodes() used only for improving performance.*/
	nodesCache;

	/** @type {?Node[]} Slot nodes resolved by the first rewriteStamp(); a stamped group's
	 * element structure never changes while it stays stampable, so they're reused on every
	 * later rewrite.  Declared here so every NodeGroup keeps one monomorphic hidden class. */
	stampSlotsCache = null;

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

		/*#IFDEBUG*/assert(this.rootNg);/*#ENDIF*/
		this.template = template;

		// JSX templates carry their list key on the Template (tagged templates instead set it via
		// a PathToKey during applyExprs).  Adopt it so the keyed reconciler sees ng.key uniformly.
		if (template.key !== undefined)
			this.key = template.key;

		// If it's just a text node, skip a bunch of unnecessary steps.
		// el can be an existing Text node to adopt, from PathToNodes' bare-text fast path.
		if (template.isText) {
			this.shell = textShell;
			this.closeKey = template.getCloseKey();
			this.startNode = this.endNode = el || Globals.doc.createTextNode(template.html[0]);
		}

		else {
			// Get a cached version of the parsed and instantiated html, and Paths:
			const shell = this.shell = Shell.get(template.html, template.svgMode);

			// The shell caches the close key so each new template doesn't repeat the WeakMap lookup.
			this.closeKey = shell.closeKey ??= template.getCloseKey();

			// A lone root element is cloned directly, skipping a throwaway fragment wrapper.
			// Only for child NodeGroups; RootNodeGroup's grafting expects a fragment.
			if (shell.singleRoot && parentPath !== null) {
				const clone = shell.docFrag.firstChild.cloneNode(true);
				this.startNode = this.endNode = clone;

				// Stampable shells skip path creation entirely; the first applyExprs() routes
				// to applyStamp(), and paths are materialized only if the group is rewritten.
				if (shell.stampable !== true)
					this.setPathsFromFragment(clone, shell, 0, true);
			}
			else {
				const shellFragment = shell.docFrag.cloneNode(true);

				if (shellFragment.nodeType === 11) { // DocumentFragment
					this.startNode = shellFragment.firstChild;
					this.endNode = shellFragment.lastChild;
				} else
					this.startNode = this.endNode = shellFragment;

				this.instantiate(shell, shellFragment, el, options);
			}
		}

		//#IFDEBUG
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
		// A non-stampable group must keep a non-null paths array; null is the stamped/text
		// sentinel, and reuse would otherwise route a path-less group through rewriteStamp(),
		// which only exists for stampable shells.  Zero-expression shells have no paths to build.
		if (shell.paths.length)
			this.setPathsFromFragment(shellFragment, shell);
		else
			this.paths = [];

		if (shell.hasEmbeds)
			this.activateEmbeds(shellFragment, shell);
	}


	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param includeNonComponents {boolean} False to only apply component paths,
	 * used when the non-component exprs are known to be unchanged.
	 * @param lastExprs {?Expr[]} The expressions applied last time, when the caller has them.
	 * Paths that would provably do nothing with an unchanged expression are then skipped —
	 * see Path.skipIfSame.  A root template's event bindings are the usual beneficiaries:
	 * they are the same handlers on every render, and re-binding them costs a call apiece. */
	applyExprs(exprs, includeNonComponents=true, lastExprs=null) {

		/*#IFDEBUG*/
		this.verify();
		/*#ENDIF*/

		let paths = this.paths;

		// Fast path: every path consumes exactly one expression and none are components,
		// so skip the bookkeeping that maps expressions to paths.
		if (this.shell.pathsSingleExpr) {
			if (includeNonComponents) {
				if (paths === null) { // Created from a stampable shell; no paths yet.
					this.applyStamp(exprs);
					return;
				}
				for (let i = paths.length - 1; i >= 0; i--) {
					let path = paths[i];
					if (lastExprs !== null && path.skipIfSame && lastExprs[i] === exprs[i])
						continue;
					path.applySingle(exprs[i]);
				}

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
			if (i===0 && path instanceof PathToComponent && path.nodeMarker === this.getRootEl())
				continue;

			// Get the expressions associated with this path.
			let exprCount = path.getExpressionCount();
			pathExprs[i] = exprs.slice(exprIndex-exprCount, exprIndex); // slice() probably doesn't allocate if the JS vm implements copy on write.
			exprIndex -= exprCount;

			// Component expressions don't have a corresponding user-provided expression.
			// They use expressions from the paths that provide their attributes.
			if (path instanceof PathToComponent) {
				let attribExprs = pathExprs.slice(i+1, i+1 + path.attribPaths.length); // +1 b/c we move forward from the component path.
				path.applyAll(attribExprs);
			}
			else if (includeNonComponents)
				path.applyAll(pathExprs[i]);
		}

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		/*#IFDEBUG*/
		assert(exprIndex === 0);
		/*#ENDIF*/


		if (includeNonComponents) {

			// TODO: Only do this if we have Paths within styles?
			this.updateStyles();

			// Invalidate the nodes cache because we just changed it.
			this.nodesCache = null;

		}
		this.firstApply = false;

		/*#IFDEBUG*/
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
		let shell = this.shell;

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

		// 2. Resolve target nodes, then run the shell's compiled stamp program: a flat
		// opcode per path replaces per-path applySingle() dispatch (see Shell.stampOp).
		let slots = this.resolveStampSlots(shell);
		let ops = shell.stampOp, slotIdx = shell.stampSlot, aux = shell.stampAux;
		let stampers = shell.stampPaths;
		let rootNg = this.rootNg;
		let root = rootNg.rootEl;
		let opt = rootNg.renderOptions?.eventDelegation;
		let delegateDoc = opt === 'document';
		let delegateAll = opt === undefined || opt === true || delegateDoc;

		// Register this shell's delegated dispatchers once for a whole run of rows.  They live on
		// the root, not on the bound nodes, so asking per node — as the general binding path has
		// to — would be a call and a set lookup for every handler in the list.
		let names = shell.stampEventNames;
		if (names !== null && delegateAll && rootNg[lastStampedShellKey] !== shell) {
			for (let k=0; k<names.length; k++)
				ensureDelegatedDispatcher(root, names[k], delegateDoc);
			rootNg[lastStampedShellKey] = shell;
		}

		let firstApply = this.firstApply;
		for (let i = ops.length - 1; i >= 0; i--) {
			let v = exprs[i];
			let o = ops[i];

			// Whole-parent child text: the marker is the (freshly cloned, empty) only-child
			// slot.  Child exprs are primitive here (step 1 bailed otherwise).
			if (o === 2) {
				if (typeof v === 'number')
					v += '';
				slots[slotIdx[i]].textContent = v;
			}

			// Delegatable event with a valid handler shape: write the node expandos
			// directly, mirroring bindEvent()'s delegated branch.  An event-name-array
			// delegation option or an invalid value falls through to the generic stamper.
			else if (o === 3 && delegateAll
				&& (typeof v === 'function' || (Array.isArray(v) && typeof v[0] === 'function'))) {
				let sp = aux[i];
				let node = slots[slotIdx[i]];
				node[sp.delegatedKey] = v;
				node[delegatedRootKey] = root;
			}

			// A plain attribute on a freshly cloned row: the shell left it off, so an empty
			// value means there is simply nothing to write, and any other string can go
			// straight in without reading the attribute back first.
			else if (o === 4 && firstApply && typeof v === 'string') {
				if (v !== '')
					slots[slotIdx[i]].setAttribute(aux[i], v);
			}

			// The list key never touches the DOM.
			else if (o === 1)
				this.key = v;

			// Everything else (attributes, disabled delegation, odd values) goes through
			// the shared stamper's full applySingle() semantics.
			else {
				let stamper = stampers[i];
				stamper.nodeMarker = slots[slotIdx[i]];
				stamper.parentNg = this;
				stamper.applySingle(v);
			}
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
		let shell = this.shell;
		let newExprs = template.exprs;
		let nodesIdx = shell.nodesPathIdx;
		for (let i=0; i<nodesIdx.length; i++) {
			let t = typeof newExprs[nodesIdx[i]];
			if (t !== 'string' && t !== 'number')
				return false;
		}

		let oldExprs = this.template.exprs;
		let stampers = shell.stampPaths, slotIdx = shell.stampSlot, flags = shell.stampFlags;
		let slots = this.stampSlotsCache; // Nodes are resolved only if something actually changed, then cached.
		for (let i = stampers.length - 1; i >= 0; i--) {
			// Live HTML properties (checked etc., boolean-valued) are exempt from the
			// unchanged-value skip: a user's click flips the DOM property underneath the cached
			// expression, and applySingle() compares against the live node before writing.
			// The identity test is inline because most expressions are unchanged, and reaching
			// exprSame() only to be told so costs more than the comparison itself.
			let oldExpr = oldExprs[i], newExpr = newExprs[i];
			let flag = flags[i];
			if ((oldExpr !== newExpr && !exprSame(oldExpr, newExpr))
				|| ((flag & 1) && typeof newExpr === 'boolean')) {
				// .slice() is required: resolveStampSlots returns the Shell's SHARED scratch
				// array, which the next row's resolve would overwrite.
				if (slots === null)
					slots = this.stampSlotsCache = this.resolveStampSlots(shell).slice();
				let stamper = stampers[i];
				let marker = slots[slotIdx[i]]; // The flat slot array, so the Path isn't loaded.

				// Fast path for a wholeParent text path whose child already exists (the common
				// rewrite case): set its value directly, skipping applySingle's branching and
				// textNode bookkeeping.  exprSame above already proved it changed.
				if (flag & 2) {
					let v = newExprs[i], tn = marker.firstChild;
					if (typeof v === 'number')
						v += '';
					if (tn !== null && tn.nodeType === 3 && tn === marker.lastChild)
						tn.nodeValue = v;
					else {
						// Empty/absent text child: fall back to the stamper, then clear its per-row
						// state immediately so the shared stamper doesn't carry into the next row.
						stamper.nodeMarker = marker;
						stamper.parentNg = this;
						stamper.applySingle(newExprs[i]);
						stamper.textNode = null;
						stamper.textValue = null;
						stamper.nodesCache = null;
					}
					continue;
				}

				stamper.nodeMarker = marker;
				stamper.parentNg = this;
				stamper.applySingle(newExprs[i]);
			}
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
		// A singleRoot shell's first op pair is always [0, 0], so slot 1 is the row's own root
		// element and the program can start at the second pair.
		slots[1] = this.startNode;
		return runResolveOps(slots, shell.resolveOps, 2, 2);
	}

	/**
	 * Create the real Path objects for a NodeGroup that was created by applyStamp().
	 * Called lazily, the first time the group is rewritten in place.
	 * Recovers the bare-text state of child-node paths that stamped a primitive.
	 * @param shell {?Shell}
	 * @return {Path[]} */
	materializePaths(shell=null) {
		shell ??= this.shell;
		let result = this.clonePathsFromSlots(shell, this.resolveStampSlots(shell));

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
	getRootEl() {
		return this.rootNg.rootEl;
	}

	/**
	 * Copy paths in fragment to this.paths.
	 * @param fragment {DocumentFragment|HTMLElement}
	 * @param shell {Shell}
	 * @param startingPathDepth {int}
	 * @param isRootClone {boolean} True when fragment is a direct clone of a singleRoot
	 * shell's root element: it fills slot 1 itself and the first op pair is skipped. */
	setPathsFromFragment(fragment, shell, startingPathDepth=0, isRootClone=false) {

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
			let slots;
			if (isRootClone) // The root element is also this.startNode, so it seeds slot 1 itself.
				slots = this.resolveStampSlots(shell);
			else {
				slots = shell.resolveSlots;
				slots[0] = fragment;
				runResolveOps(slots, ops, 0, 1);
			}
			this.clonePathsFromSlots(shell, slots);
		}
		else {
			let paths = shell.paths;
			let pathLength = paths.length; // For faster iteration
			let result = this.paths = new Array(pathLength);
			for (let i=0; i<pathLength; i++) {
				let path = paths[i].clone(fragment, startingPathDepth)
				path.parentNg = this;
				result[i] = path;
			}
		}
	}

	/**
	 * Copy the shell's Paths onto this NodeGroup's own nodes, taking each path's marker and
	 * before-node from the slots the resolve program just filled.
	 * @param shell {Shell}
	 * @param slots {Node[]} The shell's shared scratch slots, already resolved.
	 * @return {Path[]} */
	clonePathsFromSlots(shell, slots) {
		let paths = shell.paths;
		let pathLength = paths.length;
		let result = this.paths = new Array(pathLength);
		for (let i=0; i<pathLength; i++) {
			let p = paths[i];
			let path = p.cloneWithNodes(p.beforeSlot >= 0 ? slots[p.beforeSlot] : null, slots[p.markerSlot]);
			path.parentNg = this;
			result[i] = path;
		}
		return result;
	}

	updateStyles() {
		if (this.styles)
			for (let [style, oldText] of this.styles) {
				let newText = style.textContent;
				if (oldText !== newText)
					Util.bindStyles(style, this.rootNg.rootEl);
			}
	}

	/**
	 * @param root {HTMLElement|DocumentFragment}
	 * @param shell {Shell}
	 * @param pathOffset {int} */
	activateEmbeds(root, shell, pathOffset=0) {

		let rootEl = this.rootNg.rootEl;
		if (rootEl) {
			let options = this.rootNg.renderOptions;

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
					// Indirect eval runs in global scope (correct for a <script> tag) and, unlike a direct
					// eval, doesn't force terser to keep every top-level name in the bundle unmangled.
					(0, eval)(script.textContent)
				}
			}
		}
	}

	//#IFDEBUG
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
			// NodeGroups get detached when their nodes are removed by reconcileNodes()
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




