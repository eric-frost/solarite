import Path from "./Path.js";
import assert from "./assert.js";
import NodeGroup from "./NodeGroup.js";
import Shell from "./Shell.js";
import Util from "./Util.js";
import Template, {templatesSame, exprSame} from "./Template.js";
import Globals from "./Globals.js";
import MultiValueMap from "./MultiValueMap.js";
import MappedList from "./MappedList.js";
import {SelectorRef} from "./Selector.js";

// The constants of this file are declared ahead of the class that reads them, because that is
// what lets the minifier write each number where it is used; one declared after its first use
// is kept as a variable instead.

// Shared empty array for paths whose nodeGroups were never created.  Never mutated.
const emptyNodeGroups = [];

// How many changed h.map() positions applyMapped() collects before it stops to work out what
// kind of change it is looking at (see the probe in applyMapped).  Below this every ordinary
// edit — a selection, a partial update — is handled without asking.
const missProbeThreshold = 256;

// How many of those positions may need matching against each other before the general keyed
// diff, with its key map and longest-increasing-subsequence, becomes the cheaper tool.  The
// cross-match here is quadratic, which only pays while the number of moved rows is small.
const maxDisplacedMisses = 16;

// How far applyMapped() looks around a position to pick a shifted list's rows back up.  One
// insertion or removal moves everything by one, which the first step finds; a handful at once
// still lands inside this window, and past it the item map takes over.
const shiftSearchDistance = 4;

// How far ahead it looks to recognize a block of inserted rows, by finding the item that the
// old row standing here now belongs to.  Wider than the search above because inserting a page
// of rows at once is ordinary, and because this search only runs while the walk is still in
// step and stops it dead the first time it fails — so its worst case is one pass of this many
// comparisons per render, against building a map of every row in the list.
const insertSearchDistance = 64;

// Most detached NodeGroups kept per close key.  Bounds memory growth after very large
// lists are cleared while keeping pooled rows for every typical re-create pattern.
// Lowering this (e.g. to 1000) cuts retained memory ~7x after clearing a 10k-row list,
// but makes re-creating such a list ~2x slower since most rows are built fresh.
const maxPooledPerKey = 10000;

export default class PathToNodes extends Path {

	/** @type {boolean} True once any NodeGroup this path created needs a visit even when its
	 * values are unchanged (it holds a component or a live HTML property).  Those rows are the
	 * reason the list scans exist, so their presence rules out applyMisses()' skip-the-scan
	 * path.  Sticky: it's never cleared, which can only cost a scan that wasn't needed. */
	anyNeedsRefresh = false;

	/** @type {?Array} The h.map() items the previous render drew, one per NodeGroup and in the
	 * same order, so an unchanged row is recognized by comparing two arrays rather than by
	 * following a pointer into each NodeGroup.  A thousand rows' NodeGroups are scattered over
	 * a hundred kilobytes, so reading a field from each one costs a cache miss apiece; two flat
	 * arrays walk in step.  Null whenever the last render wasn't an h.map().
	 * @type {?Array} */
	lastItems = null;

	/** @type {boolean} True when the previous render's items contained raw DOM Nodes,
	 * which routes applySingle() to the generic reconciler.  Declared so the hot
	 * `!this.itemsHaveNodes` check reads a real field instead of a missing property,
	 * and so the first raw-Node render doesn't transition the hidden class. */
	itemsHaveNodes = false;

	/** @type {?NodeGroup[]} The NodeGroups created by this path's expression, in order.
	 * Lazily created; null when the path has only ever rendered a primitive (see textNode). */
	nodeGroups = null;

	/** @type {?Text} When the expression is a single primitive, its text node lives here
	 * with no Template or NodeGroup wrapper.  Mutually exclusive with nodeGroups entries. */
	textNode = null;

	/** @type {?string} The current value of textNode. */
	textValue = null;



	/**
	 * Nodes that were added to the web component during the last render(), but are available to be used again.
	 * Used with getNodeGroup() and freeNodeGroups(), keyed by close key.
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
	 * Make the DOM between nodeBefore and nodeMarker match the value of expr.
	 * This is the main entry point for rendering an expression's nodes, chosen from three strategies:
	 * 1. A primitive expr updating (or creating) a single text node is handled inline with no allocations.
	 * 2. Otherwise expr is flattened to a list of Templates, strings, and Nodes via collectItems(),
	 *    then applyDiff() positionally diffs them against the previous render's NodeGroups.
	 * 3. If the items contain raw Nodes, now or on the previous render, applyGeneric() uses pooled
	 *    close-key matching and reconcileNodes(), since this.nodeGroups can't track raw Nodes positionally.
	 * @param expr {Expr} */
	applySingle(expr) {

		/*#IFDEBUG*/this.verify();/*#ENDIF*/

		// Fast path for a single primitive expression, the most common case in loops.
		let exprType = typeof expr;
		if ((exprType === 'string' || exprType === 'number') && !this.itemsHaveNodes) {
			if (exprType !== 'string')
				expr += '';

			// A primitive leaves no items for a later h.map() to recognize rows by.  Without
			// this, a list of one text row, replaced by plain text and then drawn again from the
			// same items, would look unchanged and keep showing the plain text.
			this.lastItems = null;

			// Update the existing text node.
			let tn = this.textNode;
			if (tn !== null) {
				if (this.textValue !== expr) {
					tn.nodeValue = expr;
					this.textValue = expr;
				}
				return;
			}

			let ngs = this.nodeGroups;
			if (ngs === null || ngs.length === 0) {

				// Create a bare text node in an empty path, with no Template or NodeGroup wrapper.
				let node;
				if (this.wholeParent) {
					// Other code, or a row whose paths were just made from a stamped row, can already
					// have left a lone text child here; update it in place.  Node identity is
					// unchanged then, so no caches need invalidation.
					let fc = this.nodeMarker.firstChild;
					if (fc !== null && fc.nodeType === 3 && fc === this.nodeMarker.lastChild) {
						if (fc.nodeValue !== expr)
							fc.nodeValue = expr;
						this.textNode = fc;
						this.textValue = expr;
						return;
					}
					// One native call; the browser creates the text node.
					this.nodeMarker.textContent = expr;
					node = this.nodeMarker.firstChild;
				}
				else {
					node = Globals.doc.createTextNode(expr);
					this.nodeMarker.parentNode.insertBefore(node, this.nodeMarker);
				}
				this.textNode = node;
				this.textValue = expr;

				// During a NodeGroup's first applyExprs(), no ancestor caches can reference its nodes yet.
				if (!this.parentNg.firstApply) {
					this.nodesCache = null;
					if (this.parentNg.parentPath)
						this.parentNg.parentPath.clearNodesCache();
				}
				return;
			}

			// A single text NodeGroup left over from an array render.
			if (ngs.length === 1) {
				let ng = ngs[0], tpl = ng.template;
				if (tpl.isText === true) {
					if (tpl.html[0] !== expr) {
						ng.startNode.nodeValue = expr;
						tpl.html[0] = expr; // Text templates have their own html array, so this can't affect others.
						ng.closeKey = expr;
					}
					return;
				}
			}
		}

		// A previous primitive render stored a bare text node; wrap it in a NodeGroup so it can be diffed.
		if (this.textNode !== null) {
			let ng = new NodeGroup(textTemplate(this.textValue), this, this.textNode);
			(this.nodeGroups ??= []).push(ng);
			this.textNode = null;
		}

		// A selection binding only knows how to write an attribute, so catch it here rather than
		// letting it render as an empty string and leave the caller wondering where it went.
		if (expr instanceof SelectorRef)
			throw new Error('Solarite: a selector must own the whole attribute.');

		// 1. h.map() hands over its source items and callback rather than built Templates, so a
		// row whose item is unchanged is recognized without building or looking up a Template.
		if (expr instanceof MappedList) {
			this.applyMapped(expr);
			/*#IFDEBUG*/this.verify();/*#ENDIF*/
			return;
		}

		// Anything that isn't an h.map() leaves no items to recognize rows by next time.
		this.lastItems = null;

		// 2. Flatten the expression to a list of Templates, strings and Nodes, evaluating functions along the way.
		// A flat array that is entirely Templates — the rows.map(...) shape that list renders
		// produce — is borrowed directly instead of copied.  The borrow lasts only for the
		// rest of this synchronous call:  applyDiff/applyKeyed/applyGeneric read the items and
		// retain only the NodeGroups (and each item's own Template) built from them, never the
		// items array itself, so no reference to the caller's array survives the render.  Keep
		// that invariant — storing newItems on any long-lived object would pin the caller's
		// per-render array until the next render, moving its collection into a later frame.
		/** @type {(Template|string|Node)[]} */
		let newItems = null;
		let hasNodesNow = false;
		if (Array.isArray(expr)) {
			let len = expr.length, i = 0;
			while (i < len && expr[i] instanceof Template)
				i++;
			if (i === len)
				newItems = expr; // Borrowed from the caller; read-only from here on.
		}
		if (newItems === null) {
			newItems = [];
			hasNodesNow = this.collectItems(expr, newItems, false);
		}

		// 3. Raw Nodes in the items (now or on the previous render) can't be diffed positionally
		// because this.nodeGroups only tracks NodeGroups.  Use the generic path for those.
		if (hasNodesNow || this.itemsHaveNodes) {
			this.itemsHaveNodes = hasNodesNow;
			this.applyGeneric(newItems);
		}
		else
			this.diffItems(newItems);

		/*#IFDEBUG*/this.verify();/*#ENDIF*/
	}

	/**
	 * Reconcile a flat list of Templates and strings against this path's NodeGroups.
	 * Templates with a key=${} attribute diff by key so node identity follows the data.
	 * An empty list also routes to applyKeyed when the previous render was keyed, so removed
	 * keyed NodeGroups are discarded instead of pooled.
	 * @param newItems {(Template|string)[]} */
	diffItems(newItems) {
		let first = newItems.length !== 0 ? newItems[0] : null;
		if (first !== null
			? (typeof first !== 'string' && (first.key !== undefined || Shell.get(first.html, first.svgMode).keyIndex >= 0))
			: (this.nodeGroups !== null && this.nodeGroups.length !== 0 && this.nodeGroups[0].key !== undefined))
			this.applyKeyed(newItems);
		else
			this.applyDiff(newItems);
	}

	/**
	 * Render an h.map() list.
	 *
	 * What makes this cheaper than reconciling an array of Templates is that a row still holding
	 * the item it was built from needs no Template at all: it is recognized by one identity
	 * check, with nothing built and nothing compared.  When the list is the same length and only
	 * a few rows changed, that is the whole render — see applyMisses().  Otherwise the walk
	 * follows the offset a shifted list settles on, and finally consults a map from item to the
	 * Template the previous render built, so rows that moved far are still reused.
	 * @param mapped {MappedList} */
	applyMapped(mapped) {
		let items = mapped.items, fn = mapped.fn;
		let len = items.length;
		let oldNgs = this.nodeGroups;
		// Only rows this path drew from an h.map() last time can be recognized by their item;
		// anything else starts over.
		let lastItems = this.lastItems;
		let oldLen = oldNgs === null || lastItems === null || lastItems.length !== oldNgs.length
			? 0 : oldNgs.length;

		// Patch path.  When the list is the same length as last time, every row that still holds
		// the item it was built from is already final: it needs no Template, no comparison and no
		// visit.  So find the positions that did change, build only those, and patch them.  That
		// makes a selection or a partial update cost work proportional to the change instead of
		// to the length of the list.  Rows that must be visited even when unchanged (components,
		// live HTML properties) rule it out, since revisiting them is what the full scan is for.
		let misses = null, missTemplates = null, missCount = 0;
		if (oldLen === len && len !== 0 && !this.anyNeedsRefresh && !this.itemsHaveNodes) {
			let tooMany = false;

			// First find WHICH positions changed, without building anything for them.  A change
			// this path can't handle is then abandoned having cost only comparisons — building
			// as we went would throw away a Template for every row of, say, a reversed list,
			// which the general diff is about to reuse from the previous render.
			misses = [];
			let at = this.collectMisses(lastItems, items, 0, len, misses, missProbeThreshold);
			if (at < len) {
				// Enough of the list has changed to ask what kind of change this is, because
				// the two kinds want opposite treatment.  If the item at this position is
				// somewhere else in the old list, the rows were reordered, and the general
				// diff's item map will reuse their Templates instead of rebuilding them — so
				// stop here and let it.  If the item is new, the rows' contents changed, and
				// there is nothing to reuse: keep going and patch them all, however many there
				// are.  The scan costs one pass over the old rows, once, and only for a list
				// that changed this much.
				if (itemIsElsewhere(lastItems, oldLen, items[at]))
					tooMany = true; // Nothing was built, so the general path has nothing to reuse.
				else
					this.collectMisses(lastItems, items, at, len, misses, len); // There is no second probe.
			}

			// Now build them.
			if (!tooMany && (missCount = misses.length) !== 0) {
				missTemplates = new Array(missCount);
				let builtCount = this.buildMisses(items, fn, misses, missTemplates, missCount);
				if (this.lastItems !== lastItems) // A callback rendered this list; see below the walk.
					return this.applySingle(mapped);
				if (builtCount !== missCount) { // The callback returned a Node, an array, …
					tooMany = true;
					missCount = builtCount; // Keep the ones already built; the rest are the caller's problem.
				}
			}
			if (!tooMany && (missCount === 0
					|| this.applyMisses(oldNgs, misses, missTemplates, missCount, len))) {
				for (let k=0; k<missCount; k++) {
					let j = misses[k];
					lastItems[j] = items[j];
				}
				return;
			}
		}

		// Removal path.  A list that only lost one run of rows is settled on the two item arrays
		// alone.  See removeRun().
		if (len !== 0 && len < oldLen && !this.anyNeedsRefresh && !this.itemsHaveNodes
			&& this.removeRun(items, oldNgs, lastItems, oldLen, len))
			return;

		// General path: build the whole list of Templates and hand it to the reconciler.
		let newItems;
		// False once the callback has returned anything but a Template or a string; see where
		// it is read, below.
		let plain = true;
		let built = missCount !== 0 ? misses : null, b = 0;
		let itemMap = null, noItemMap = false;
		const indexOfItem = item => {
			if (noItemMap)
				return -1;
			if (itemMap === null) {
				// One scan before paying for a map: if this item is nowhere in the old rows, the
				// list's contents changed rather than moved, so there is nothing to look up and
				// every later miss can go straight to the callback.  A scan is cheaper than a map
				// of every row, and this is the common shape — rows replaced in place.
				if (!itemIsElsewhere(lastItems, oldLen, item)) {
					noItemMap = true;
					return -1;
				}
				itemMap = new Map();
				for (let k=0; k<oldLen; k++)
					itemMap.set(lastItems[k], k);
			}
			let k = itemMap.get(item);
			return k === undefined ? -1 : k;
		};
		// Walk the two lists together.  A row is recognized by the item it was built from, at the
		// offset the walk has settled on: after an insertion or a removal every later row sits a
		// fixed distance from where it was, and following that keeps recognizing them instead of
		// treating the whole tail as changed.  The short search that re-establishes the offset
		// only runs while the walk is still in step, so a list of genuinely new rows (an append,
		// a replace-all) gives up after one miss rather than searching for every row.  Failing
		// all that, a map from item to the Template the previous render built for it catches
		// rows that moved far — a sort, a shuffle.  It's built on demand, from the rows this
		// path already holds: a persistent per-item cache would instead pay a write for every
		// row of every list ever created, which is most of the work of building a list from
		// scratch, and would hold each Template alive for as long as the caller holds the item.
		// When every position changed and its Template is already built, those Templates are
		// the new list as they stand, and there is nothing to walk.
		if (missCount === len && len !== 0)
			newItems = missTemplates;

		else if (oldLen !== 0) {
			newItems = new Array(len);
			let delta = 0, inSync = true;
			for (let i=0; i<len; i++) {
				let item = items[i];
				let j = i + delta;
				let inRange = j >= 0 && j < oldLen;
				if (inRange && lastItems[j] === item) {
					newItems[i] = keptItem(oldNgs[j]);
					inSync = true;
					// The rows after one that is in step usually are too, so they are kept by a
					// loop of its own; see buildRange() for why.
					i = this.keepRun(lastItems, items, oldNgs, newItems, i + 1, delta, len, oldLen) - 1;
					continue;
				}

				// This position was already found to have changed, and its Template built, by the
				// patch scan above.  That only happens for a same-length list, where the offset
				// stays zero, so there's no search to redo here.
				if (built !== null && b < missCount && built[b] === i) {
					newItems[i] = missTemplates[b++];
					continue;
				}

				if (inSync) {
					let found = -1;
					for (let d=1; d<=shiftSearchDistance; d++) {
						let after = j + d, before = j - d;
						if (after < oldLen && lastItems[after] === item) {
							found = after;
							break;
						}
						if (before >= 0 && lastItems[before] === item) {
							found = before;
							break;
						}
					}
					if (found >= 0) {
						delta = found - i;
						newItems[i] = keptItem(oldNgs[found]);
						continue;
					}

					// The item isn't in the old list at all, but the old row standing here
					// belongs to an item a little further along: rows were INSERTED here.  Build
					// this one and shift the offset, so the rest of the list is still recognized.
					// Without this, prepending one row to a long list would look like a change to
					// every row in it.  Only worth asking when the list actually grew.
					if (inRange && len > oldLen)
						for (let d=1; d<=insertSearchDistance && i+d<len; d++)
							if (items[i+d] === lastItems[j]) {
								plain = this.buildRange(items, fn, newItems, i, i + 1) && plain;
								delta--;
								found = -2; // Handled; skip the fallbacks below.
								break;
							}
					if (found === -2)
						continue;

					inSync = false;
				}

				// Past the end of the old list there is nothing left to match, and the offset
				// can't change again because only a match moves it.  So this row and every row
				// after it is new: they all go straight to the callback, with no lookups that
				// must miss.
				if (j >= oldLen) {
					plain = this.buildRange(items, fn, newItems, i, len) && plain;
					break;
				}

				let k = indexOfItem(item);
				if (k >= 0) {
					newItems[i] = keptItem(oldNgs[k]);
					delta = k - i; // Back in step; the rest of the list can walk positionally again.
					inSync = true;
					continue;
				}
				plain = this.buildRange(items, fn, newItems, i, i + 1) && plain;
			}
		}

		else
			plain = this.buildRange(items, fn, newItems = new Array(len), 0, len);

		// A callback may have rendered the host again, which drew this whole list from inside
		// the walk above.  Nothing had been written here by then, so that render is complete and
		// correct, but it leaves this one holding the rows and the remembered items it replaced.
		// Carrying on would pair the two wrongly: an unkeyed row that now shows another item
		// would be kept as the row of the item it used to show, and that item drawn twice.
		// A render that rebuilds the list always leaves a new lastItems (or none), so one
		// comparison finds it out, with nothing to set or clear around the callbacks, and this
		// render then starts over from what the other left.  It starts at applySingle() because
		// the other render may have put plain text here instead of a list, which only
		// applySingle() knows how to take over.
		if (this.lastItems !== lastItems)
			return this.applySingle(mapped);

		// The reconcilers draw one row per item, from a Template or a string.  A callback may
		// return anything else an expression can hold, for any item: an array, a raw Node, a
		// nested list, a number, nothing at all.  A list with such a result in it is no longer
		// one row per item, so it is drawn as the plain array of results that it is:
		// applySingle() forgets lastItems, flattens the array and picks the reconciler.  So is
		// one that follows a render which left raw Nodes, since only the generic reconciler
		// can tell those from rows.
		if (!plain || this.itemsHaveNodes)
			return this.applySingle(newItems);

		this.diffItems(newItems);

		// Remember which item drew each row, so the next render can match them by identity.
		// The reconciler leaves nodeGroups aligned with newItems, and therefore with items.
		// The caller's array is copied rather than kept, since the caller mutates it in place.
		// It is read by index up to the length the rows were drawn from, exactly as they were
		// drawn: a list that grew while its callback ran, or an array-like whose iterator
		// disagrees with its indexes, would otherwise be remembered out of step with its rows.
		// It is always a new array, never the previous one rewritten: a render that a callback
		// started is told apart by it above, and the render it interrupted is still reading the
		// previous one.
		this.lastItems = Array.prototype.slice.call(items, 0, len);
	}

	/**
	 * Call fn for items[from] up to items[to-1], storing what it returns at the same index of out.
	 *
	 * This, keepRun() and createRows() are loops that could be written where they are
	 * called.  They are methods of their own because of how a JavaScript engine decides what to
	 * optimize: a function earns faster code by running, and what is counted is how much of
	 * ITSELF it has run.  A loop inside a long function that is called once per render stays in
	 * the engine's slowest tier through a list's whole creation, however many thousand rows it
	 * handles, while the same loop alone in a short function is promoted within its first few
	 * hundred rows.  They are methods rather than plain functions because the minifier never
	 * folds a method into its caller; for plain functions with one caller, such as hOther() or
	 * registerRowDispatchers(), build/build.js turns that folding off (reduce_funcs: false).
	 * @param items {Array}
	 * @param fn {function(*):Template}
	 * @param out {Array}
	 * @param from {int}
	 * @param to {int}
	 * @return {boolean} False when fn returned anything but a Template or a string, which no
	 * reconciler can draw as one row. */
	buildRange(items, fn, out, from, to) {
		let plain = true;
		for (let i=from; i<to; i++) {
			let t = out[i] = fn(items[i]);
			if (!(t instanceof Template) && typeof t !== 'string')
				plain = false;
		}
		return plain;
	}

	/**
	 * Keep the rows of an h.map() list that still hold the item they were drawn from, starting
	 * at position i and at a fixed offset into the previous render's rows, by putting each one's
	 * existing Template in out.
	 * @param lastItems {Array} The items the previous render drew.
	 * @param items {Array} The items of this render.
	 * @param ngs {NodeGroup[]} The previous render's rows.
	 * @param out {Array} Receives the Templates.
	 * @param i {int} Where to start in items.
	 * @param delta {int} items[i] is compared with lastItems[i + delta].
	 * @param len {int} Length of items.
	 * @param oldLen {int} Length of lastItems and ngs.
	 * @return {int} The first position that doesn't match, or len. */
	keepRun(lastItems, items, ngs, out, i, delta, len, oldLen) {
		for (; i<len; i++) {
			let j = i + delta;
			if (j < 0 || j >= oldLen || lastItems[j] !== items[i])
				break;
			out[i] = keptItem(ngs[j]);
		}
		return i;
	}

	/**
	 * Get a NodeGroup for each of items[from] up to items[to-1], store it at the same index of
	 * ngs, and insert its nodes before anchor.
	 * @param items {(Template|string)[]}
	 * @param from {int}
	 * @param to {int}
	 * @param ngs {NodeGroup[]}
	 * @param parent {Node}
	 * @param anchor {?Node} Null appends at the end.
	 * @param pooled {boolean} True to take a detached NodeGroup of the same html from the pool
	 * when there is one.  False for the rows of a keyed list, which are always built new. */
	createRows(items, from, to, ngs, parent, anchor, pooled) {
		for (let i=from; i<to; i++) {
			let ng = pooled ? this.createOrReuse(items[i]) : this.createNew(items[i]);
			ngs[i] = ng;
			insertNodesBefore(parent, ng, anchor);
		}
	}

	/**
	 * Settle an h.map() list that differs from the last render only by one contiguous run of
	 * rows having been removed: a row deleted, a selection of adjacent rows deleted, a list cut
	 * short.  Every other row is still drawn from the same item.
	 *
	 * The general diff would build an array of every row's Template and hand it to the
	 * reconciler, whose scans then read each NodeGroup to learn that it is unchanged.  A thousand
	 * NodeGroups are scattered over the heap, so that is a thousand cache misses to remove one
	 * row.  Here the unchanged rows are recognized by comparing the two item arrays from both
	 * ends, which touches no NodeGroup, and only the rows of the run are visited.  The caller
	 * rules out rows that need a visit even when unchanged (anyNeedsRefresh).
	 *
	 * A removed row that has a key is discarded, as keyed semantics require, and so is one that
	 * has held a raw Node (see Shell.heldRawNodes); any other goes to the pool the positional
	 * diff keeps, exactly as that diff would have left it.
	 *
	 * A run of rows that arrived is deliberately not handled the same way.  It was measured:
	 * the rows still have to be built, which is nearly all of the work, and the general path
	 * builds them in the loop that every list created from empty has already made hot.
	 *
	 * @param items {Array} The new items.
	 * @param ngs {NodeGroup[]} This path's NodeGroups, cut in place.
	 * @param lastItems {Array} The items the last render drew, aligned with ngs; cut in place.
	 * @param oldLen {int}
	 * @param len {int} Shorter than oldLen, and not zero.
	 * @return {boolean} False when the change is not one removed run; nothing has been
	 * modified in that case. */
	removeRun(items, ngs, lastItems, oldLen, len) {

		// 1. The rows both lists share at the front and at the back.  Together they must account
		// for the whole of the new list.
		let start = firstDiff(lastItems, items, 0, len, 0);
		let count = oldLen - len;
		if (firstDiff(lastItems, items, start, len, count) !== len)
			return false;

		// 2. Take the run out.
		let removed = ngs.splice(start, count);
		lastItems.splice(start, count);
		for (let i=0; i<count; i++) {
			let ng = removed[i];
			detachNodes(ng);
			if (ng.key === undefined && !ng.template.isText && !ng.shell.heldRawNodes)
				(this.nodeGroupsDetachedAvailable ??= new MultiValueMap()).addCapped(ng.closeKey, ng, maxPooledPerKey);
		}

		// 3. Node membership changed, so invalidate caches.
		if (!this.parentNg.firstApply) {
			this.nodesCache = null;
			if (this.parentNg.parentPath)
				this.parentNg.parentPath.clearNodesCache();
		}

		// Keep state used by the generic path from going stale.  This is not dead code: a render
		// that starts inside this one, from the disconnectedCallback of an element in a removed
		// row, can put raw Nodes where the list is, and the rows which that render took out,
		// node by node, must not be drawn again from the pool it left them in.
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
		return true;
	}

	/**
	 * Patch only the positions an h.map() render changed, leaving every other row alone.
	 *
	 * Every unchanged position already holds the NodeGroup built from that exact item, so it
	 * needs no visit at all; only the changed positions can require a rewrite, a move, or a new
	 * row.  Changed positions are handled in two steps, the same shape as the general keyed
	 * diff's small-reorder path: first the ones that kept their key (a row whose data changed
	 * in place), then the leftovers are cross-matched against each other by key so a swap or a
	 * short shuffle moves the fewest node ranges.
	 *
	 * @param ngs {NodeGroup[]} This path's NodeGroups, patched in place.
	 * @param misses {int[]} Positions whose item changed, ascending.
	 * @param templates {(Template|string)[]} The new Template for each of those positions.
	 * @param missCount {int}
	 * @param len {int} Length of the list, for anchoring the last position.
	 * @return {boolean} False when the change doesn't fit this path and the caller must run
	 * the general diff instead; nothing has been modified in that case. */
	applyMisses(ngs, misses, templates, missCount, len) {

		// Only a keyed list can move rows around safely.  An unkeyed one can still be rewritten
		// in place, which is what the positional diff would do for it anyway.
		let keyed = ngs[0].key !== undefined;

		// 1. Classify the changed positions without touching anything, so that a change too big
		// for this path can still be handed to the general diff with nothing half-applied.
		// A row that kept its key is rewritten where it stands; the rest have to be matched
		// against each other, and past a handful of those the general diff's map-and-LIS
		// approach is the better tool.
		let displaced = null, dCount = 0;
		for (let k=0; k<missCount; k++) {
			let ng = ngs[misses[k]], t = templates[k];
			if (typeof t === 'string' || !itemClose(ng, t) || (keyed && ng.key !== keyOf(t))) {
				if (!keyed || dCount === maxDisplacedMisses)
					return false;
				(displaced ??= [])[dCount++] = k;
			}
		}

		// 2. Rewrite the rows that kept their key.  displaced holds indexes into misses in
		// ascending order, so one pointer walks past them.
		for (let k=0, d=0; k<missCount; k++) {
			if (d < dCount && displaced[d] === k) {
				d++;
				continue;
			}
			let ng = ngs[misses[k]], t = templates[k];

			// A stamped row, which has no paths of its own, is rewritten by its shell's compiled
			// program, so the program is run from here; this loop runs once for every row a
			// partial update changes, and a function call apiece is a large share of what is left
			// once the row's own writes are down to the ones that changed.  This is
			// rewriteNodeGroup() for such a row, less two steps that cannot apply to it: a
			// stampable shell has no embedded styles to update (it is single-root, which
			// excludes embeds), and a row that is one element has no node list to invalidate.
			// Keep the two in step.
			if (ng.paths === null && ng.shell.pathsSingleExpr && ng.rewriteStamp(t)) {
				ng.firstApply = false;
				ng.template = t;
				if (t.key !== undefined) // JSX keyed item; keep ng.key in sync with the new template.
					ng.key = t.key;
			}

			// A row whose paths each take one expression compares every expression as it
			// rewrites and writes only what changed, so asking first whether the whole template
			// is unchanged would compare everything twice; and its item did change, so it
			// rarely is.  Other rows still get the question, since a full re-apply costs more.
			else if (ng.shell.pathsSingleExpr || !itemSame(ng, t))
				this.rewriteNodeGroup(ng, t);
			else
				this.refreshSameItem(ng, t);
		}
		if (dCount === 0)
			return true;

		// 3. Hand the displaced rows to the shared placer.  displaced holds indexes into misses
		// and templates, so misses is what maps a row to its position in the list.
		let wholeParent = this.wholeParent;
		this.placeDisplaced(displaced, misses, ngs, templates, ngs, len,
			wholeParent ? null : this.nodeMarker,
			wholeParent ? this.nodeMarker : this.nodeMarker.parentNode);

		// 4. Node membership or order changed, so invalidate caches.
		if (!this.parentNg.firstApply) {
			this.nodesCache = null;
			if (this.parentNg.parentPath)
				this.parentNg.parentPath.clearNodesCache();
		}

		// Keep state used by the generic path from going stale.  This is not dead code: a render
		// that starts inside this one, from a function in a row that is being created, can put
		// raw Nodes where the list is, and the rows which that render took out, node by node,
		// must not be drawn again from the pool it left them in.  The test
		// Solarite.map.reentrantRawNodes fails without it.
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
		return true;
	}

	/**
	 * Add to misses every position from i on whose item is not the one the previous render drew
	 * there, in ascending order, until misses holds cap positions.
	 *
	 * This and buildMisses() are loops that could be written where they are called.  They are
	 * methods of their own because of how a JavaScript engine decides what to optimize: a
	 * function earns faster code by running, and what is counted is how much of ITSELF it has
	 * run.  A loop over every row, inside a long function that is called once per render, stays
	 * in the engine's slowest tier for a long time, while the same loop alone in a short function
	 * is promoted within its first few hundred rows.
	 * @param lastItems {Array} The items the previous render drew.
	 * @param items {Array} The items of this render, the same length.
	 * @param i {int} Where to start.
	 * @param len {int}
	 * @param misses {int[]} Receives the positions.
	 * @param cap {int}
	 * @return {int} len when the whole list was scanned; otherwise the changed position that
	 * misses had no room for. */
	collectMisses(lastItems, items, i, len, misses, cap) {
		for (; i<len; i++)
			if (lastItems[i] !== items[i]) {
				if (misses.length === cap)
					return i;
				misses.push(i);
			}
		return len;
	}

	/**
	 * Call fn for the item at each of the first count positions in misses, storing the Templates
	 * (or strings) it returns in out.
	 * @param items {Array}
	 * @param fn {function(*):Template}
	 * @param misses {int[]}
	 * @param out {(Template|string)[]}
	 * @param count {int}
	 * @return {int} count, or how many were stored before fn returned something else, which the
	 * patch path can't place. */
	buildMisses(items, fn, misses, out, count) {
		for (let k=0; k<count; k++) {
			let t = fn(items[misses[k]]);
			if (!(t instanceof Template) && typeof t !== 'string')
				return k;
			out[k] = t;
		}
		return count;
	}

	/**
	 * Keep the leading rows of a keyed list that are already final: the row's Template is the
	 * very one it was drawn from, and it holds nothing that must be visited regardless.
	 * @param ngs {NodeGroup[]} The previous render's rows.
	 * @param items {(Template|string)[]} This render's items.
	 * @param out {NodeGroup[]} Receives each kept row at its position.
	 * @param max {int} How many positions both lists have.
	 * @return {int} The first position that isn't such a row, or max. */
	keepSame(ngs, items, out, max) {
		let i = 0;
		for (; i<max; i++) {
			let ng = ngs[i];
			if (ng.template !== items[i] || ng.shell.needsRefresh)
				break;
			out[i] = ng;
		}
		return i;
	}

	/**
	 * Keep the trailing rows of a keyed list that are already final, as keepSame() does the
	 * leading ones.  The two lists are aligned at their ends, which may differ.
	 * @param ngs {NodeGroup[]}
	 * @param items {(Template|string)[]}
	 * @param out {NodeGroup[]}
	 * @param oldEnd {int} Just past the last row of ngs to consider.
	 * @param newEnd {int} Just past the last item of items to consider.
	 * @param start {int} Neither list is read below this position.
	 * @return {int} How many rows were kept. */
	keepSameBack(ngs, items, out, oldEnd, newEnd, start) {
		let count = 0;
		for (; oldEnd-count > start && newEnd-count > start; count++) {
			let ng = ngs[oldEnd-count-1];
			if (ng.template !== items[newEnd-count-1] || ng.shell.needsRefresh)
				break;
			out[newEnd-count-1] = ng;
		}
		return count;
	}

	/**
	 * Record in map, under its key, the position of each of items[from] up to items[to-1].
	 * A loop of its own for the reason given at collectMisses().
	 * @param items {(Template|string)[]}
	 * @param from {int}
	 * @param to {int}
	 * @param map {Map<*, int>} */
	indexKeys(items, from, to, map) {
		for (let i=from; i<to; i++) {
			let t = items[i];
			if (typeof t !== 'string')
				map.set(keyOf(t), i);
		}
	}

	/**
	 * Find the first of ngs[from] up to ngs[to-1] whose key is in map.
	 * @param ngs {NodeGroup[]}
	 * @param from {int}
	 * @param to {int}
	 * @param map {Map<*, int>}
	 * @return {int} Its position, or to when there is none. */
	firstKeyIn(ngs, from, to, map) {
		for (let i=from; i<to; i++) {
			let key = ngs[i].key;
			if (key !== undefined && map.has(key))
				return i;
		}
		return to;
	}

	/**
	 * Settle a handful of rows that moved, appeared or vanished within one window of a list.
	 *
	 * Both small-reorder paths — the h.map() patch in applyMisses and the equal-length window in
	 * applyKeyed — reach the same point: a few positions whose old NodeGroup no longer belongs
	 * where it stands, everything around them already correct.  Since every candidate came from
	 * this same window, a swap, a dragged row or a short shuffle finds its partners inside it, so
	 * the rows are cross-matched against each other by key rather than through the general
	 * diff's key map and longest-increasing-subsequence machinery.
	 *
	 * rows holds ascending indexes into items, which is the array each caller already has; when
	 * those indexes are not themselves list positions, positions maps them across.  Doing the
	 * indirection here rather than compacting it away in the caller keeps this off the allocation
	 * path: neither caller builds an array it wasn't building already.  rows.length is small by
	 * construction (at most maxDisplacedMisses), which is what makes the O(n²) cross-match
	 * cheaper than building a map.
	 *
	 * @param rows {int[]} Ascending indexes of the rows to settle.
	 * @param positions {int[]|null} Maps a row index to its list position, or null when the row
	 *   indexes are already positions.
	 * @param oldNgs {NodeGroup[]} Where each position's outgoing NodeGroup is read from.
	 * @param items {(Template|string)[]} The new items, indexed by row index.
	 * @param outNgs {NodeGroup[]} Receives the NodeGroup that ends up at each position.  May be
	 *   the same array as oldNgs; the outgoing groups are snapshotted before anything is written.
	 * @param boundary {int} First position past this window, where the anchor stops being
	 *   outNgs[p+1] and becomes tailAnchor.
	 * @param tailAnchor {Node|null} Anchor for a row placed at boundary-1.
	 * @param parent {Node} Where the rows' nodes live. */
	placeDisplaced(rows, positions, oldNgs, items, outNgs, boundary, tailAnchor, parent) {
		let count = rows.length;

		// 1. Cross-match the rows against each other by key.  A claimed NodeGroup is nulled out
		// of the snapshot so it can't be claimed twice.
		let free = new Array(count);
		for (let b=0; b<count; b++) {
			let i = rows[b];
			free[b] = oldNgs[positions === null ? i : positions[i]];
		}
		let placed = new Array(count);
		for (let a=0; a<count; a++) {
			let t = items[rows[a]];
			let key = keyOf(t);
			if (key !== undefined)
				for (let b=0; b<count; b++) {
					let ng = free[b];
					if (ng !== null && ng.key === key && itemClose(ng, t)) {
						free[b] = null;
						if (itemSame(ng, t))
							this.refreshSameItem(ng, t);
						else
							this.rewriteNodeGroup(ng, t);
						placed[a] = ng;
						break;
					}
				}
		}

		// 2. Discard the old rows nothing claimed.  Keyed semantics require a new key to get new
		// nodes, so these are never pooled.
		for (let b=0; b<count; b++) {
			let ng = free[b];
			if (ng !== null)
				detachNodes(ng);
		}

		// 3. Put the rows in place, right to left so each one's anchor is already final.
		for (let a=count-1; a>=0; a--) {
			let i = rows[a];
			let p = positions === null ? i : positions[i];
			let ng = placed[a];
			if (ng === undefined)
				try {
					ng = this.createNew(items[i]);
				}
				catch (e) {
					// The rows to its right are already in place and the ones it replaces are
					// gone, and nothing records either yet.  See dropRows().
					this.dropRows(oldNgs, outNgs);
					throw e;
				}
			outNgs[p] = ng;
			let anchor = p+1 < boundary ? outNgs[p+1].startNode : tailAnchor;
			if (ng.endNode.nextSibling !== anchor || ng.startNode.parentNode !== parent)
				insertNodesBefore(parent, ng, anchor);
		}
	}

	/**
	 * Positionally diff newItems (all Templates) against this.nodeGroups.
	 * Unchanged NodeGroups are kept without any hashing or map lookups.
	 * NodeGroups created from the same html are rewritten in place.
	 * Leftover items are removed/inserted with direct DOM operations.
	 * @param newItems {Template[]} */
	applyDiff(newItems) {
		let oldNgs = this.nodeGroups || emptyNodeGroups;
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
			if (ng.shell.needsRefresh)
				this.refreshSameItem(ng, t);
			newNgs[start] = ng;
			start++;
		}

		// 2. Keep the matching suffix.  This makes removing items from the middle cheap.
		while (oldEnd > start && newEnd > start) {
			let ng = oldNgs[oldEnd-1], t = newItems[newEnd-1];
			if (!itemSame(ng, t))
				break;
			if (ng.shell.needsRefresh)
				this.refreshSameItem(ng, t);
			newNgs[--newEnd] = ng;
			oldEnd--;
		}

		// 3. Aligned middle scan: keep unchanged NodeGroups, rewrite same-shape ones in place.
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			if (itemSame(ng, t)) { // Can happen between changed rows, e.g. partial updates.
				if (ng.shell.needsRefresh)
					this.refreshSameItem(ng, t);
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
					// A row with a key is discarded, as in the keyed diff: a list whose first row
					// is a string or has no key is reconciled here even when later rows have
					// keys, and a key that comes back must still get new nodes.  So is a row that
					// has held a raw Node, which it may not have any more; see Shell.heldRawNodes.
					if (!ng.template.isText && ng.key === undefined && !ng.shell.heldRawNodes)
						pool.addCapped(ng.closeKey, ng, maxPooledPerKey);
				}
			}

			// 5. Insert leftover new items directly.  Each row is one native insert; a
			// batching DocumentFragment would double the insert count for no benefit,
			// since style/layout work is deferred until the next frame either way.
			if (newRemain) {
				let wholeParent = this.wholeParent;
				let anchor = newEnd < newLen ? newNgs[newEnd].startNode : (wholeParent ? null : this.nodeMarker);
				let parent = wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
				try {
					this.createRows(newItems, start, newEnd, newNgs, parent, anchor, true);
				}
				catch (e) {
					this.dropRows(oldNgs, newNgs);
					throw e;
				}
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

		// Keep state used by the generic path from going stale.
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
	}

	/**
	 * Keyed reconciliation: match this.nodeGroups to newItems by their key=${} expressions,
	 * so NodeGroup (and DOM node) identity follows the data:
	 * 1. Prefix/suffix scans keep NodeGroups whose keys match in place, rewriting changed content.
	 * 2. The middle windows match through a key map, and kept NodeGroups outside a longest
	 *    increasing subsequence of old positions are moved, so the fewest node ranges move.
	 * 3. Unmatched new items create fresh NodeGroups and unmatched old ones are discarded —
	 *    never pooled — so replaced data always gets new nodes, as keyed semantics require.
	 * @param newItems {(Template|string)[]} */
	applyKeyed(newItems) {
		let oldNgs = this.nodeGroups || emptyNodeGroups;
		let oldLen = oldNgs.length, newLen = newItems.length;
		let newNgs = new Array(newLen);

		//#IFDEBUG
		{
			let seen = new Set();
			for (let t of newItems) {
				let k = keyOf(t);
				if (k === undefined)
					console.warn('Unkeyed item in a keyed list; it is rebuilt whenever it is among the rows that changed:', t);
				else if (seen.has(k))
					console.warn('Duplicate key in keyed list:', k);
				else
					seen.add(k);
			}
		}
		//#ENDIF

		let start = 0, oldEnd = oldLen, newEnd = newLen;

		// 1. Keep the matching prefix in place, rewriting changed content.  The rows that are
		// already final, which after an append or a removal is nearly all of them, are passed
		// over by a loop of its own (see collectMisses() for why); the loop here takes over at
		// the first row that needs anything done.
		start = this.keepSame(oldNgs, newItems, newNgs, oldLen < newLen ? oldLen : newLen);
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			// An identical Template instance (h.map) implies an identical key, so skip key extraction.
			if (ng.template === t) {
				if (ng.shell.needsRefresh)
					this.refreshSameItem(ng, t);
			}
			// A string has no key to follow, so its row is kept only while it shows that text.
			else if (typeof t === 'string' ? !itemSame(ng, t) : ng.key !== keyOf(t) || !itemClose(ng, t))
				break;
			else if (itemSame(ng, t))
				this.refreshSameItem(ng, t);
			else
				this.rewriteNodeGroup(ng, t);
			newNgs[start] = ng;
			start++;
		}

		// 2. Keep the matching suffix, the same way.
		let same = this.keepSameBack(oldNgs, newItems, newNgs, oldEnd, newEnd, start);
		oldEnd -= same;
		newEnd -= same;
		while (oldEnd > start && newEnd > start) {
			let ng = oldNgs[oldEnd-1], t = newItems[newEnd-1];
			if (ng.template === t) {
				if (ng.shell.needsRefresh)
					this.refreshSameItem(ng, t);
			}
			else if (typeof t === 'string' ? !itemSame(ng, t) : ng.key !== keyOf(t) || !itemClose(ng, t))
				break;
			else if (itemSame(ng, t))
				this.refreshSameItem(ng, t);
			else
				this.rewriteNodeGroup(ng, t);
			newNgs[--newEnd] = ng;
			oldEnd--;
		}

		let oldRemain = oldEnd - start, newRemain = newEnd - start;
		if (oldRemain || newRemain) {
			let wholeParent = this.wholeParent;
			let parent = wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;

			// 3a. Equal-length windows: scan them aligned.  Rows whose keys match positionally
			// are updated in place with no bookkeeping, and when at most 8 positions are
			// displaced (a swap, a dragged row, a small shuffle) they're cross-matched and
			// moved directly — no key map, no sources array, no LIS.  A bigger shuffle falls
			// through to the general map phase; the in-place updates already done stay valid
			// there, since the map phase finds those rows already matching their new items.
			let fastHandled = false;
			if (oldRemain === newRemain) {
				let displaced = null;
				let ok = true;
				for (let i=start; i<newEnd; i++) {
					let ng = oldNgs[i], t = newItems[i];
					if (ng.template === t) {
						if (ng.shell.needsRefresh)
							this.refreshSameItem(ng, t);
					}
					else {
						let k = keyOf(t);
						if (k !== undefined && ng.key === k && itemClose(ng, t)) {
							if (itemSame(ng, t))
								this.refreshSameItem(ng, t);
							else
								this.rewriteNodeGroup(ng, t);
						}
						else {
							(displaced ??= []).push(i);
							if (displaced.length > 8) {
								ok = false;
								break;
							}
							continue; // newNgs[i] is filled during the placement pass below.
						}
					}
					newNgs[i] = ng;
				}
				if (ok) {
					// The windows are the same length, so a displaced row's index is already its
					// position and no position map is needed.  The tail anchor is the suffix row
					// just past this window, which placement never writes to — it only fills
					// positions below newEnd — so it is computed once here instead of on every
					// pass around the placement loop.
					if (displaced !== null)
						this.placeDisplaced(displaced, null, oldNgs, newItems, newNgs, newEnd,
							newEnd < newLen ? newNgs[newEnd].startNode : (wholeParent ? null : this.nodeMarker),
							parent);
					fastHandled = true;
				}
			}

			if (!fastHandled) {

			// 3. Match the middle windows by key.
			let kept = 0, moved = false;
			let sources = null; // sources[i] = old index reused by new item start+i, or -1 to create fresh.
			let removals = null;
			let noneKept = false; // True when the old window shares no key with the new one.
			if (oldRemain) {
				if (newRemain) {
					let keyToNewIndex = new Map();
					this.indexKeys(newItems, start, newEnd, keyToNewIndex);

					// A list whose rows were all replaced, such as the next page of a table, has
					// no old key among the new ones.  Finding that out first, with nothing but
					// lookups, lets the whole old window be removed the way an emptied list is:
					// by the fast clear below, with no per-row bookkeeping to throw away.
					if (this.firstKeyIn(oldNgs, start, oldEnd, keyToNewIndex) === oldEnd)
						noneKept = true;
					else {
						sources = new Array(newRemain).fill(-1);
						let lastNewIndex = -1;
						for (let i=start; i<oldEnd; i++) {
							let ng = oldNgs[i];
							let newIndex = ng.key === undefined ? undefined : keyToNewIndex.get(ng.key);
							let t;
							if (newIndex !== undefined && sources[newIndex-start] === -1 && itemClose(ng, t = newItems[newIndex])) {
								sources[newIndex-start] = i;
								kept++;
								if (newIndex < lastNewIndex)
									moved = true;
								else
									lastNewIndex = newIndex;
								if (itemSame(ng, t))
									this.refreshSameItem(ng, t);
								else
									this.rewriteNodeGroup(ng, t);
								newNgs[newIndex] = ng;
							}
							else
								(removals ??= []).push(ng);
						}
					}
				}
				// else: the whole old window goes away.  It isn't collected into an array here,
				// because the fast clear below usually takes every one of them at once and the
				// array would be built only to be thrown away.
			}

			// 3b. A large whole-parent list that is being fully replaced is emptied and refilled
			// with its parent detached, so the browser's connected-tree bookkeeping (child-change
			// notifications, tree-version bumps, MutationObserver interest walks, deferred
			// accessibility and style consumers) runs once at reattach instead of once per row
			// removed and once per row added.  Detaching before the clear, rather than after it,
			// puts the removals on the cheap side of that line as well.  The gates: the whole
			// region is being replaced, so nothing is kept and no focus can survive inside it;
			// the parent is a plain element, since detaching a custom element would fire its
			// disconnected/connectedCallback in the middle of a render and a subclass may run
			// arbitrary logic there; the parent is in the document, since the notification storm
			// only exists on a connected tree; and the list is long enough for the saving to beat
			// the fixed cost of the detour and the extra MutationObserver records it creates.
			let detachedFrom = null, reattachBefore = null;
			if (wholeParent && start === 0 && newEnd === newLen && kept === 0 && newRemain > 500
				&& parent.isConnected && parent.parentNode !== null
				&& parent.localName.indexOf('-') === -1 && !parent.hasAttribute('is')) {
				detachedFrom = parent.parentNode;
				reattachBefore = parent.nextSibling;
				parent.remove();
			}

			// A row can throw while it is created (an event attribute given something that isn't
			// a function, a component whose constructor fails).  Two things must hold whatever
			// happens: a parent that was taken out of the document goes back, and no row is left
			// in the DOM that this path doesn't know about, or the next render would draw the
			// list again next to it.  See dropRows().
			try {

			// 4. Remove unmatched old NodeGroups.  They're discarded, never pooled,
			// so a later render with new keys always creates new nodes.
			let removeAll = oldRemain !== 0 && (newRemain === 0 || noneKept);
			if (removals !== null || removeAll) {
				// Fast clear when nothing is kept anywhere; the whole region is removals.  Trying
				// it first means a cleared list skips the two passes below entirely: those exist
				// to lift each group's nodes out one at a time, and emptying the parent has
				// already taken all of them.
				if (!(start === 0 && newEnd === newLen && kept === 0 && this.fastClear())) {
					if (removeAll)
						removals = oldNgs.slice(start, oldEnd);

					// Materialize node caches of multi-node groups while attached, since detaching breaks sibling links.
					for (let ng of removals)
						if (ng.startNode !== ng.endNode)
							ng.getNodes();

					for (let ng of removals)
						detachNodes(ng);
				}
			}

			// 5. Insert new NodeGroups and move kept ones.
			if (newRemain) {
				let anchor = newEnd < newLen ? newNgs[newEnd].startNode : (wholeParent ? null : this.nodeMarker);

				// 5a. Nothing kept in the middle: insert every new item directly.
				// Each row is one native insert; routing rows through a batching
				// DocumentFragment would double the insert count for no benefit, since
				// style/layout work is deferred until the next frame either way.
				if (kept === 0)
					this.createRows(newItems, start, newEnd, newNgs, parent, anchor, false);

				// 5b. Mixed: iterate backwards so each item's anchor is already in place.
				// Kept NodeGroups on a longest increasing subsequence of old positions stay still;
				// everything else moves or is created.
				else {
					let lis = moved ? longestIncreasingSubsequence(sources) : null;
					let lisPos = lis !== null ? lis.length - 1 : -1;
					for (let i=newEnd-1; i>=start; i--) {
						let ng = newNgs[i];
						// Asked of sources rather than of newNgs, which can still hold a row that
						// step 3a kept before it gave up and that step 3 has since removed.
						if (sources[i-start] === -1) { // Create and insert.
							ng = this.createNew(newItems[i]);
							newNgs[i] = ng;
							insertNodesBefore(parent, ng, anchor);
						}
						else if (lis !== null) {
							if (lisPos >= 0 && lis[lisPos] === i - start)
								lisPos--; // Part of the stable subsequence; doesn't move.
							else
								insertNodesBefore(parent, ng, anchor);
						}
						anchor = ng.startNode;
					}
				}
			}

			}
			catch (e) {
				this.dropRows(oldNgs, newNgs);
				throw e;
			}
			finally {
				if (detachedFrom !== null)
					detachedFrom.insertBefore(parent, reattachBefore);
			}

			} // end if (!fastHandled)

			// 6. Node membership or order changed, so invalidate caches.
			// During a NodeGroup's first applyExprs(), no ancestor caches can reference its nodes yet.
			if (!this.parentNg.firstApply) {
				this.nodesCache = null;
				if (this.parentNg.parentPath)
					this.parentNg.parentPath.clearNodesCache();
			}
		}

		this.nodeGroups = newNgs;

		// Keep state used by the generic path from going stale.
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
	}

	/**
	 * Take every row of this path out of the DOM and forget them all, after a row threw while
	 * the list was being reconciled.
	 *
	 * At that point some new rows are in place, some are not, and rows that were to be kept
	 * may stand in either their old or their new order, so no list of rows this path could
	 * keep would match the DOM.  Starting the list over is the one state that is certainly
	 * consistent: the error still reaches the caller, and the next render draws every row.
	 * @param oldNgs {NodeGroup[]} The rows before this render.
	 * @param newNgs {(NodeGroup|undefined)[]} The rows placed so far. */
	dropRows(oldNgs, newNgs) {
		if (!this.fastClear())
			for (let ngs of [oldNgs, newNgs])
				for (let ng of ngs)
					if (ng !== undefined)
						for (let node of ng.getNodes())
							node.remove();
		this.nodeGroups = null;
		this.lastItems = null;
		this.nodesCache = null;
		if (this.parentNg.parentPath)
			this.parentNg.parentPath.clearNodesCache();
	}

	/**
	 * Create a NodeGroup for an item, never taking one from a pool.  Every new row of a keyed
	 * list is made here, because keyed semantics require new keys to get new nodes, and so is
	 * a row of the generic reconciler once its pools have nothing of that html to offer.
	 * @param item {Template|string}
	 * @return {NodeGroup} */
	createNew(item) {
		if (typeof item === 'string')
			return new NodeGroup(textTemplate(item), this); // Text NodeGroups have no paths to apply.
		let ng = new NodeGroup(item, this);
		if (ng.shell.needsRefresh)
			this.anyNeedsRefresh = true;
		if (item.exprs.length || (ng.paths && ng.paths.length))
			ng.applyExprs(item.exprs);
		return ng;
	}

	/**
	 * Refresh a NodeGroup whose new template has the SAME values as its current one.
	 * Components still render so changes deeper in the tree can surface, and groups holding
	 * live-HTML-property bindings (checked/value/selected) rewrite in place — a user's click
	 * flips those DOM properties underneath the cached expression, so same values ≠ same DOM.
	 * rewriteNodeGroup's per-path skip exempts exactly those paths; everything else is
	 * compared and skipped as before, so this stays cheap.
	 * @param ng {NodeGroup}
	 * @param t {Template|string} */
	refreshSameItem(ng, t) {
		let shell = ng.shell;
		if (shell.hasComponentPaths)
			ng.applyExprs(t.exprs, false);
		else if (shell.hasLivePropPaths && shell.pathsSingleExpr && typeof t !== 'string')
			this.rewriteNodeGroup(ng, t);
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
		}
		else {
			// When every path consumes exactly one expression, paths align 1:1 with exprs,
			// so only the expressions that changed need to be applied.
			if (ng.shell.pathsSingleExpr) {
				// Stamped groups (paths === null) rewrite through the shared stampers and stay
				// path-less, unless a child-node expression stopped being primitive.
				// applyMisses() carries its own copy of this stamped-row case; keep them in step.
				if (ng.paths !== null || !ng.rewriteStamp(item)) {
					let oldExprs = ng.template.exprs, newExprs = item.exprs;
					let paths = ng.paths ?? ng.materializePaths();
					for (let i = paths.length - 1; i >= 0; i--) {
						// Boolean live-HTML-property bindings are exempt from the unchanged-value
						// skip — a click flips the property underneath the cached expression;
						// applySingle() compares against the live node before writing.
						let oldExpr = oldExprs[i], newExpr = newExprs[i];
						if ((oldExpr !== newExpr && !exprSame(oldExpr, newExpr))
							|| (paths[i].isHtmlProperty && typeof newExpr === 'boolean'))
							try {
								paths[i].applySingle(newExpr);
							}
							catch (e) {
								// The template is assigned below, once everything is applied; a row
								// that stops here gets one saying how far it got.
								ng.keepReached(item, i);
								throw e;
							}
					}
				}

				if (ng.styles)
					ng.updateStyles();
				ng.nodesCache = null;
				ng.firstApply = false;
			}
			else
				ng.applyExprs(item.exprs);
			ng.template = item;
			if (item.key !== undefined) // JSX keyed item; keep ng.key in sync with the new template.
				ng.key = item.key;
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
				// rewriteNodeGroup compares expressions and writes only what changed,
				// keeping stamped groups path-less.  It also assigns ng.template.
				this.rewriteNodeGroup(ng, item);
				return ng;
			}
		}

		ng = new NodeGroup(item, this);
		if (ng.shell.needsRefresh)
			this.anyNeedsRefresh = true;
		if (item.exprs.length || (ng.paths && ng.paths.length))
			ng.applyExprs(item.exprs);
		return ng;
	}

	/**
	 * Recursively flatten expr into items, evaluating functions and converting primitives to text Templates.
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

		else if (typeof expr === 'function')
			hasNodes = this.collectItems(expr(), items, hasNodes);

		// A MappedList nested inside an array or returned from a function can't use the
		// identity fast path, but it still renders; expand it through the per-item cache.
		else if (expr instanceof MappedList) {
			let subItems = expr.items, fn = expr.fn;
			for (let i=0; i<subItems.length; i++)
				items.push(fn(subItems[i]));
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
	 * Pool-based reconciliation using close keys and reconcileNodes().  Used when expressions
	 * contain raw Nodes, since those can't be tracked by the positional diff.
	 * @param items {(Template|string|Node)[]} */
	applyGeneric(items) {
		let path = this;
		path.freeNodeGroups();

		// The NodeGroup these raw Nodes are placed in, and every NodeGroup that one is inside,
		// must not be kept for reuse when it is removed; see Shell.heldRawNodes.
		if (path.itemsHaveNodes)
			for (let ng = path.parentNg; ng; ng = ng.parentPath?.parentNg)
				ng.shell.heldRawNodes = true;

		/** @type {Node[]} */
		let newNodes = [];
		let oldNodeGroups = path.nodeGroups || emptyNodeGroups;
		/*#IFDEBUG*/assert(!oldNodeGroups.includes(null))/*#ENDIF*/

		path.nodeGroups = [];
		for (let item of items) {
			if (typeof item === 'string')
				item = textTemplate(item);
			if (item instanceof Template) {
				let ng = path.getNodeGroup(item);
				newNodes.push(...ng.getNodes());
				path.nodeGroups.push(ng);
			}
			else // A raw Node from an expression; collectItems() has already flattened fragments and NodeLists.
				newNodes.push(item);
		}

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
					reconcileNodes(path.nodeMarker, oldNodes, newNodes, null)
				else
					reconcileNodes(path.nodeMarker.parentNode, oldNodes, newNodes, path.nodeMarker)
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
	 * Clear the nodeCache of this Path, as well as all parent and child Paths that
	 * share the same DOM parent node. */
	clearNodesCache() {
		let path = this;

		// Clear cache parent Paths that have the same parentNode
		let parentNode = this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
		while (path && (path.wholeParent ? path.nodeMarker : path.nodeMarker.parentNode) === parentNode) {
			path.nodesCache = null;
			path = path.parentNg?.parentPath
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
	 * Get a NodeGroup with the same html as the template, reusing a pooled one if available.
	 * The first pooled NodeGroup with the same close key (html shape) is taken and its
	 * expressions are updated, skipping the update when its values are already identical.
	 *
	 * @param template {Template}
	 * @return {NodeGroup} */
	getNodeGroup(template) {
		let closeKey = template.getCloseKey();
		let result = this.nodeGroupsAttachedAvailable?.deleteAny(closeKey)
			|| this.nodeGroupsDetachedAvailable?.deleteAny(closeKey);

		if (result) {
			if (templatesSame(result.template, template))
				this.refreshSameItem(result, template);
			else
				result.applyExprs(template.exprs);
			result.template = template;
		}
		else
			result = this.createNew(template);

		/*#IFDEBUG*/assert(result.parentPath);/*#ENDIF*/
		return result;
	}


	/**
	 * Move everything from this.nodeGroups to this.nodeGroupsAttached and nodeGroupsDetached.
	 * Called at the beginning of applyGeneric() so it can have NodeGroups to use.
	 * TODO: this could run as needed in getNodeGroup? */
	freeNodeGroups() {
		// Add nodes that weren't used during render() to nodeGroupsDetached
		let previouslyAttached = this.nodeGroupsAttachedAvailable?.data;
		if (previouslyAttached) {
			let detached = (this.nodeGroupsDetachedAvailable ??= new MultiValueMap()).data;
			for (let key in previouslyAttached) {
				let src = previouslyAttached[key];
				let from = src.hd || 0; // Skip entries already consumed by deleteAny().

				// NodeGroups that have held a raw Node are not kept; see Shell.heldRawNodes.
				// The first one answers for the rest: those under one close key were made from
				// one Shell, unless they have no expressions, and then none can hold a Node.
				if (src[from].shell.heldRawNodes)
					continue;
				let array = detached[key];
				if (!array) {
					array = detached[key] = from ? src.slice(from) : src;
					if (array.length > maxPooledPerKey)
						array.length = maxPooledPerKey;
				}
				else
					for (let i=from, max=maxPooledPerKey + (array.hd || 0); i<src.length && array.length < max; i++)
						array.push(src[i]);
			}
		}

		// Offer the NodeGroups the last render left in place for reuse.  Every path that renders
		// NodeGroups — the positional diff, the keyed diff and applyGeneric alike — leaves them in
		// this.nodeGroups, so that one array is always the set still standing in the DOM.
		let nga = this.nodeGroupsAttachedAvailable = new MultiValueMap();
		if (this.nodeGroups)
			for (let ng of this.nodeGroups)
				nga.add(ng.closeKey, ng);
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
		result = this.nodesCache;
		if (result) {
			//#IFDEBUG
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

	//#IFDEBUG

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


// Cache for keyOf(): list rows share one html array, so the Shell lookup that finds where the
// key=${} expression sits happens once per list rather than once per row.
let lastKeyHtml = null, lastKeyIndex = -1;

/**
 * The list key of an item, or undefined when it has none.
 * @param t {Template|string}
 * @return {*} */
function keyOf(t) {
	if (typeof t === 'string')
		return undefined;
	if (t.key !== undefined) // JSX templates carry the key directly.
		return t.key;
	if (t.html !== lastKeyHtml) {
		lastKeyHtml = t.html;
		lastKeyIndex = Shell.get(t.html, t.svgMode).keyIndex;
	}
	return lastKeyIndex >= 0 ? t.exprs[lastKeyIndex] : undefined;
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
 * What a row that is being kept stands for in the list handed to the reconciler: its Template,
 * or for a text row the text itself.
 *
 * A text row's Template is private to its NodeGroup and is rewritten in place when the row's
 * text changes (see rewriteNodeGroup).  Handing that object on would let a second NodeGroup be
 * built from it when the row moves, and from then on a change to either row would silently
 * change what the other one believes it shows.  A string carries no such tie.
 * @param ng {NodeGroup}
 * @return {Template|string} */
function keptItem(ng) {
	let tpl = ng.template;
	return tpl.isText === true ? tpl.html[0] : tpl;
}

/**
 * Does the NodeGroup already have content identical to item?
 * @param ng {NodeGroup}
 * @param item {Template|string}
 * @return {boolean} */
function itemSame(ng, item) {
	let tpl = ng.template;
	if (tpl === item) // h.map() returns the same Template instance for an unchanged item.
		return true;
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
 * Is this item somewhere in the list the previous render drew, i.e. did it move rather than
 * appear?  A plain scan rather than a map, because it runs once and usually answers on the way
 * past.
 * @param lastItems {Array}
 * @param oldLen {int}
 * @param item {*}
 * @return {boolean} */
function itemIsElsewhere(lastItems, oldLen, item) {
	for (let i=0; i<oldLen; i++)
		if (lastItems[i] === item)
			return true;
	return false;
}

/**
 * The first position of b, from i up to but not including end, whose value differs from the
 * one a holds shift places further along; end when they agree all the way.
 *
 * Kept as a function of its own, and a tiny one, because a scan like this is the part of a
 * re-render whose cost grows with the length of the list rather than with the size of the
 * change, and a JavaScript engine compiles a small function that loops long before it compiles
 * a large one that happens to contain the same loop.
 * @param a {Array}
 * @param b {Array}
 * @param i {int}
 * @param end {int}
 * @param shift {int}
 * @return {int} */
function firstDiff(a, b, i, end, shift) {
	while (i < end && a[i+shift] === b[i])
		i++;
	return i;
}

/**
 * Take all of ng's nodes out of the DOM.  A NodeGroup of several nodes keeps them together in a
 * fragment of their own, so it can still be walked afterwards.
 * @param ng {NodeGroup} */
function detachNodes(ng) {
	if (ng.startNode !== ng.endNode)
		Util.saveOrphans(ng.getNodes());
	else
		ng.startNode.remove();
}

/**
 * Insert all of ng's nodes before anchor within parent.
 * @param parent {Node}
 * @param ng {NodeGroup}
 * @param anchor {?Node} Null appends at the end. */
function insertNodesBefore(parent, ng, anchor) {
	let node = ng.startNode, end = ng.endNode;
	if (node === end) // Single-node NodeGroups are the common case in loops.
		parent.insertBefore(node, anchor);
	else while (true) {
		let next = node.nextSibling;
		parent.insertBefore(node, anchor);
		if (node === end)
			break;
		node = next;
	}
}

/**
 * Indices into arr whose values form a longest strictly increasing subsequence, skipping -1 entries.
 * O(n log n) patience algorithm with predecessor backtracking, as used by Vue 3's keyed diff.
 * @param arr {int[]}
 * @return {int[]} */
function longestIncreasingSubsequence(arr) {
	let result = []; // Indices of the smallest known tail for each subsequence length.
	let prev = new Array(arr.length); // prev[i] = index that comes before i in the subsequence ending at i.
	for (let i=0; i<arr.length; i++) {
		let v = arr[i];
		if (v === -1)
			continue;
		// Binary search for the first tail whose value >= v.
		let lo = 0, hi = result.length;
		while (lo < hi) {
			let mid = (lo + hi) >> 1;
			if (arr[result[mid]] < v)
				lo = mid + 1;
			else
				hi = mid;
		}
		if (lo > 0)
			prev[i] = result[lo-1];
		if (lo === result.length)
			result.push(i);
		else
			result[lo] = i;
	}
	// Backtrack from the last tail to recover the subsequence's indices.
	let pos = result.length;
	if (pos) {
		let i = result[pos-1];
		while (pos-- > 0) {
			result[pos] = i;
			i = prev[i];
		}
	}
	return result;
}


/**
 * Reconcile the children of parentNode so they become newNodes, in order, ending just before
 * `before` (or at the end when before is null).  Reuses existing nodes by identity and skips
 * nodes already in their target position.  Only the raw-Node fallback (applyGeneric) uses this;
 * the keyed/positional diffs never do.
 * @param parentNode {Node}
 * @param oldNodes {Node[]}
 * @param newNodes {Node[]}
 * @param before {?Node} */
function reconcileNodes(parentNode, oldNodes, newNodes, before) {
	// 1. Remove old nodes that aren't in the new list.
	if (oldNodes.length) {
		let keep = new Set(newNodes);
		for (let node of oldNodes)
			if (!keep.has(node) && node.parentNode === parentNode)
				parentNode.removeChild(node);
	}

	// 2. Place new nodes in order, walking back to front so `next` is always the already-placed
	// node that should follow.  insertBefore moves a node already in the DOM, so nodes already in
	// the right spot are skipped to avoid needless mutation.
	let next = before;
	for (let i=newNodes.length; i--; ) {
		let node = newNodes[i];
		if (node.nextSibling !== next || node.parentNode !== parentNode)
			parentNode.insertBefore(node, next);
		next = node;
	}
}
