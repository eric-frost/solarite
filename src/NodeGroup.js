import assert from "./assert.js";
import Util, {flattenAndIndent, nodeToArrayTree, setIndent} from "./Util.js";
import Template, {exprSame} from "./Template.js";
import Shell from "./Shell.js";
import Path from "./Path.js";
import Globals from './Globals.js';
import PathToComponent from "./PathToComponent.js";
import PathToNodes from "./PathToNodes.js";
import {isAnchored, registerRowDispatchers, rowNgKey, stampedShellKey} from "./PathToAttribValue.js";
import {SelectorRef} from "./Selector.js";

/** @typedef {boolean|string|number|function|Object|Array|Date|Node|Template} Expr */

/** Stand-in Shell for text NodeGroups, which are never parsed from html.  Its default field
 * values (no components, no live properties, no single-expression paths) are exactly what the
 * per-row code must see for a bare Text node, so ng.shell is never null. */
const textShell = new Shell();

/**
 * Is v something an event attribute accepts: a function, or a [function, ...args] array?
 * @param v {*}
 * @return {boolean} */
function isHandler(v) {
	return typeof v === 'function' || (Array.isArray(v) && typeof v[0] === 'function');
}

/**
 * Are the child-node expressions of a stampable shell all primitives, so a row can carry them
 * as plain text nodes?
 * @param exprs {Expr[]}
 * @param nodesIdx {int[]} Shell.nodesPathIdx.
 * @return {boolean} */
function childrenArePrimitive(exprs, nodesIdx) {
	for (let i=0; i<nodesIdx.length; i++) {
		// Two typeof tests against literals rather than one typeof kept in a variable: the
		// engine compiles the first form to a type check and the second to a call that builds
		// the type's name.
		let v = exprs[nodesIdx[i]];
		if (typeof v !== 'string' && typeof v !== 'number')
			return false;
	}
	return true;
}

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
 * @param end {int} Index just past the last op pair to run; pairs are in dependency order, so
 * stopping early leaves a fully resolved prefix of the slots.
 * @return {Node[]} slots, so callers can resolve and use it in one expression. */
function runResolveOps(slots, ops, i, s, end=ops.length) {
	for (; i<end; i+=2, s++) {
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

	/** @type {?Node[]} Slot nodes resolved so far, by rewriteStamp() or by the dispatcher
	 * (stampSlots); a stamped group's element structure never changes while it stays stampable,
	 * so they're reused by every later rewrite and event, followed by the Text nodes of its
	 * whole-parent children (see stampSlots).
	 * Declared here so every NodeGroup keeps one monomorphic hidden class. */
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

				// A stampable row whose child text is all primitives is cloned from the shell's
				// master after its text nodes are written, so the clone arrives with the text in
				// place and no node below the root is ever touched (see Shell.stampMaster).  It
				// skips path creation entirely: the first applyExprs() routes to applyStamp(),
				// and paths are materialized only if the group is later rewritten with a
				// non-primitive child.  Anything else is cloned bare and gets real paths.
				let primitive = false;
				if (shell.stampable === true) {
					// One pass checks each child expression and writes it.  A row that turns
					// out to have a non-primitive child has then written some of its text into
					// the master for nothing, which is harmless: every row that is cloned from
					// the master writes all of the text nodes first.
					let idx = shell.nodesPathIdx, texts = shell.stampMasterTexts;
					let empty = shell.stampMasterEmpty, exprs = template.exprs;
					let i = 0;
					for (; i<idx.length; i++) {
						let v = exprs[idx[i]], tn = texts[i];
						if (typeof v !== 'string' && typeof v !== 'number')
							break;
						// An empty string leaves no text node at all, as every other path renders it.
						if (v === '') {
							if (!empty[i]) {
								tn.remove();
								empty[i] = true;
							}
						}
						else {
							if (empty[i]) {
								shell.stampMasterCells[i].append(tn);
								empty[i] = false;
							}
							tn.nodeValue = v;
						}
					}
					primitive = i === idx.length;
				}
				if (primitive)
					this.startNode = this.endNode = shell.stampMaster.cloneNode(true);
				else {
					const clone = shell.docFrag.firstChild.cloneNode(true);
					this.startNode = this.endNode = clone;
					this.setPathsFromFragment(clone, shell, 0, true);
				}

				// A row's delegated handlers stay in its template, and the dispatcher reaches
				// them through the row's root element (see isAnchored).  The store is written out
				// here because it runs once per row; registering the dispatchers, which happens
				// once per run of rows, is behind a call.  The two tests are isAnchored()'s for a
				// row in a list; keep them in step with it, or a row would be treated as anchored
				// without carrying the pointer and its handlers would go silent.
				if (shell.stampEventsByType !== null) {
					let rootNg = this.rootNg;
					if (rootNg.delegateAll === true) {
						this.startNode[rowNgKey] = this;
						if (rootNg[stampedShellKey] !== shell)
							registerRowDispatchers(rootNg, shell);
					}
				}
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
	 *
	 * On a fresh row nothing below the root element is touched: the constructor cloned the
	 * row's child text in from the master, and delegated handlers are left in the template for
	 * the dispatcher to find (see isAnchored).  Only an attribute, a non-delegated event, or an
	 * unusual value resolves the row's nodes.  A pooled row being re-applied writes its child
	 * text, and if a child expression is no longer a primitive it falls back to materializing
	 * real paths and applying normally.
	 * @param exprs {Expr[]} */
	applyStamp(exprs) {
		let shell = this.shell;
		let firstApply = this.firstApply;

		// 1. The constructor already proved a fresh row's children primitive.
		if (!firstApply && !childrenArePrimitive(exprs, shell.nodesPathIdx)) {
			let paths = this.materializePaths(shell);
			for (let i = paths.length - 1; i >= 0; i--)
				paths[i].applySingle(exprs[i]);
			this.nodesCache = null;
			this.firstApply = false;
			return;
		}

		// 2. Run the shell's compiled stamp program: a flat opcode per path replaces per-path
		// applySingle() dispatch (see Shell.stampOp).  Nodes are resolved only when an op needs
		// one below the root, since each resolved node costs a JS wrapper.
		let ops = shell.stampOp, slotIdx = shell.stampSlot, aux = shell.stampAux;
		let stampers = shell.stampPaths;
		let anchored = isAnchored(this);
		// Slots are resolved as a prefix, up to the highest one any op has needed so far.  Marker
		// slots are non-decreasing in path order (Shell.buildResolveProgram allocates them in
		// document order), and this loop runs backwards, so the first op to need a node needs
		// the highest one and later ops fall inside that prefix; the check keeps it honest.
		let slots = shell.resolveSlots, resolved = 1;
		slots[1] = this.startNode;
		for (let i = ops.length - 1; i >= 0; i--) {
			let v = exprs[i];
			let o = ops[i];

			// A delegatable event on an anchored row: the handler lives in the template, where
			// the dispatcher reads it when the handler's turn comes.  An invalid value falls
			// through to the stamper, which names the mistake.
			if (o === 3) {
				if (anchored && isHandler(v))
					continue;
			}

			// Whole-parent child text.  A fresh row had it cloned in from the master.
			else if (o === 2) {
				if (firstApply)
					continue;
				if (typeof v === 'number')
					v += '';
				let s = slotIdx[i];
				if (s > resolved) {
					resolved = s;
					this.resolveStampSlots(shell, s);
				}
				slots[s].textContent = v;

				// textContent replaced the Text node rewriteStamp() may have kept for this child.
				let kept = this.stampSlotsCache;
				if (kept !== null)
					kept[aux[i]] = undefined;
				continue;
			}

			// The list key never touches the DOM.
			else if (o === 1) {
				this.key = v;
				continue;
			}

			// A plain attribute holding one whole expression.
			else if (o === 4) {
				let s = slotIdx[i];

				// On a freshly cloned row the shell left the attribute off, so an empty value
				// means there is simply nothing to write, and any other string can go straight in
				// without reading the attribute back first.
				if (firstApply && typeof v === 'string') {
					if (v !== '') {
						if (s > resolved) {
							resolved = s;
							this.resolveStampSlots(shell, s);
						}
						slots[s].setAttribute(aux[i], v);
					}
					continue;
				}

				// A selection binding (h.selector().when()) does its own two stores.
				if (typeof v === 'object' && v instanceof SelectorRef) {
					if (s > resolved) {
						resolved = s;
						this.resolveStampSlots(shell, s);
					}
					v.bind(slots[s], aux[i], this);
					continue;
				}
			}

			// Everything else (odd attribute values, non-delegated events) goes through the
			// shared stamper's full applySingle() semantics.
			let stamper = stampers[i];
			let s = slotIdx[i];
			if (s > resolved) {
				resolved = s;
				this.resolveStampSlots(shell, s);
			}
			stamper.nodeMarker = slots[s];
			stamper.parentNg = this;
			stamper.applySingle(v);
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
		if (!childrenArePrimitive(newExprs, shell.nodesPathIdx))
			return false;

		let oldExprs = this.template.exprs;
		let stampers = shell.stampPaths, slotIdx = shell.stampSlot, flags = shell.stampFlags;
		let ops = shell.stampOp, aux = shell.stampAux;
		let anchored = isAnchored(this);
		let slots = this.stampSlotsCache; // Nodes are resolved only if something actually changed, then kept.
		for (let i = stampers.length - 1; i >= 0; i--) {

			// A delegatable event on an anchored row needs no write: the dispatcher reads the
			// handler from the row's template when the handler's turn comes, and the caller
			// assigns the new template as soon as this returns.  If an expression before this
			// one throws instead, keepReached() records this one as applied.
			if (ops[i] === 3 && anchored && isHandler(newExprs[i]))
				continue;
			let oldExpr = oldExprs[i], newExpr = newExprs[i];
			let flag = flags[i];

			// A whole-parent text child.  Old and new are both primitives here (a stamped row's
			// children always are, and the new ones were checked above), so identity is the
			// whole comparison.  The row keeps the Text node it wrote last time next to its
			// resolved slots: reaching it again through the marker would cost three DOM calls
			// and, after a garbage collection, a fresh JS wrapper for a node the row will write
			// on every later update anyway.  Writing the Text node's value is cheaper than
			// textContent, which replaces the node.
			if (flag & 2) {
				if (oldExpr !== newExpr) {
					let v = typeof newExpr === 'number' ? newExpr + '' : newExpr;
					let ti = aux[i], s = slotIdx[i];
					let tn = slots !== null ? slots[ti] : undefined, marker;

					// The kept node is trusted only while it is still the marker's one child.  Other
					// code may have changed the cell since (a highlighter splitting the text, a
					// translator wrapping it, normalize() dropping an empty node), and the write
					// must then replace whatever is there, as it would for a row written for the
					// first time.  Both nodes' wrappers are held by the row, so the two reads make
					// none.
					if (tn !== undefined && (marker = slots[s]).firstChild === tn && marker.lastChild === tn)
						tn.nodeValue = v;
					else {
						if (slots === null || slots[s] === undefined)
							slots = this.stampSlots(s);
						marker = slots[s];

						// The marker holds one text node or nothing (an empty string leaves none).
						tn = marker.firstChild;
						if (tn !== null && tn.nodeType === 3 && tn === marker.lastChild)
							tn.nodeValue = v;
						else {
							marker.textContent = v;
							tn = marker.firstChild;
						}
						slots[ti] = tn !== null ? tn : undefined;
					}
				}
				continue;
			}

			// Live HTML properties (checked etc., boolean-valued) are exempt from the
			// unchanged-value skip: a user's click flips the DOM property underneath the cached
			// expression, and applySingle() compares against the live node before writing.
			// The identity test is inline because most expressions are unchanged, and reaching
			// exprSame() only to be told so costs more than the comparison itself.
			if ((oldExpr !== newExpr && !exprSame(oldExpr, newExpr))
				|| ((flag & 1) && typeof newExpr === 'boolean')) {
				let s = slotIdx[i];
				let stamper = stampers[i];
				stamper.nodeMarker = s === 1 ? this.startNode : (slots === null || slots[s] === undefined ? (slots = this.stampSlots(s))[s] : slots[s]);
				stamper.parentNg = this;
				try {
					stamper.applySingle(newExpr);
				}
				catch (e) {
					this.keepReached(template, i);
					throw e;
				}
			}
		}

		return true;
	}

	/**
	 * Record how far an update of this row got, when applying one of its expressions threw.
	 *
	 * A row's template says which expressions the row holds: the next render compares against
	 * it to decide what to write, and the dispatcher reads an anchored row's handlers from it
	 * (see isAnchored).  The code updating a row assigns the new template once every expression
	 * is applied, and applies them from the last to the first.  So after a throw the row holds
	 * the new expressions after the one that threw and the old ones up to and including it,
	 * and this gives it a template that says exactly that.  Its handlers are then the ones that
	 * listeners bound while rendering (eventDelegation:false) would be at this point, replaced
	 * as far as the throw and no further, and the next render writes what is still missing.
	 * Left with the old template, the row would show its new text while every handler still
	 * received the old item.
	 *
	 * The row gets a template of its own because neither of the other two may be changed:
	 * h.map() hands a row's Template out again for as long as its item stays the same.
	 * @param template {Template} The template that was being applied.
	 * @param at {int} Index of the expression that threw. */
	keepReached(template, at) {
		let old = this.template;
		this.template = Object.assign(new Template(), old, {
			exprs: template.exprs.map((expr, i) => i > at ? expr : old.exprs[i])
		});
	}

	/**
	 * Run the shell's resolve program from this NodeGroup's root element.
	 * Only valid for singleRoot shells, whose ops always start with the root's own pair.
	 * @param shell {Shell}
	 * @param upTo {int} The highest slot needed.  Every node the program reaches gets a JS
	 * wrapper if it has none yet, which is the expensive part, so a caller that needs one node
	 * near the start of the row shouldn't pay for the ones after it.
	 * @return {Node[]} The shell's shared scratch slots array. */
	resolveStampSlots(shell, upTo=shell.resolveSlots.length - 1) {
		let slots = shell.resolveSlots;
		// A singleRoot shell's first op pair is always [0, 0], so slot 1 is the row's own root
		// element and the program can start at the second pair.  Pair k fills slot k+1.
		slots[1] = this.startNode;
		return runResolveOps(slots, shell.resolveOps, 2, 2, upTo * 2);
	}

	/**
	 * The resolved nodes of this stamped row, kept from one rewrite to the next since a stamped
	 * row's element structure never changes.  Only as many slots as have ever been needed are
	 * resolved; the rest are filled the first time a later one is asked for.  The array is
	 * longer than the shell's slots: past them it has one entry per whole-parent text child
	 * (Shell.stampAux gives the index), where rewriteStamp() keeps the Text node it writes.
	 * @param upTo {int} The highest slot needed.
	 * @return {Node[]} A private array, holding at least slots 1 to upTo. */
	stampSlots(upTo) {
		let slots = this.stampSlotsCache;
		if (slots === null || slots[upTo] === undefined) {
			// The copy is required: resolveStampSlots fills the Shell's SHARED scratch array,
			// which the next row's resolve would overwrite.
			let shell = this.shell, scratch = this.resolveStampSlots(shell, upTo);
			if (slots === null)
				slots = this.stampSlotsCache = new Array(scratch.length + shell.nodesPathIdx.length);
			for (let s=1; s<=upTo; s++)
				slots[s] = scratch[s];
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
		shell ??= this.shell;
		let result = this.clonePathsFromSlots(shell, this.resolveStampSlots(shell));

		// A wholeParent child-node path that stamped a primitive left exactly one Text child.
		// The real paths track their own text from here on, so the Text nodes rewriteStamp()
		// kept for this row are let go; one that a template is about to replace would otherwise
		// stay referenced, detached, for as long as the row lives.
		let kept = this.stampSlotsCache, aux = shell.stampAux;
		for (let idx of shell.nodesPathIdx) {
			if (kept !== null)
				kept[aux[idx]] = undefined;
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
					let el = Path.resolve(root, path, pathOffset);
					Util.bindId(rootEl, el);
				}
			}

			// styles
			if (options?.styles !== false) {
				if (shell.styles.length)
					this.styles = new Map();
				for (let path of shell.styles) {
					/** @type {HTMLStyleElement} */
					let style = Path.resolve(root, path, pathOffset);
					if (rootEl.nodeType === 1) {
						Util.bindStyles(style, rootEl);
						this.styles.set(style, style.textContent);
					}
				}

			}
			// scripts
			if (options?.scripts !== false) {
				for (let path of shell.scripts) {
					let script = Path.resolve(root, path, pathOffset);
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




