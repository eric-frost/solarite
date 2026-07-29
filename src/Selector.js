/**
 * A key-scoped selection that updates only the rows it actually affects.
 *
 * Rendering a list normally means calling render() and letting the reconciler decide what
 * changed.  That is the right default, but it is a poor fit for a selection: moving a
 * highlight from one row of a thousand to another changes two attributes, and asking the
 * reconciler about it means walking the whole list to discover that fact.
 *
 * A Selector short-circuits that.  when() hands each row one of exactly two objects — the
 * selected one or the unselected one — and set() reaches the two rows that change through
 * the list they were rendered into, writing their attributes directly with no render() call.
 *
 * This is the same primitive as Solid's createSelector, adapted to a library that has no
 * signals: the list, not a subscription, is what carries the binding.
 *
 * Because set() locates a row by its key, **the rows must be keyed** — the row template needs
 * a key=${...} attribute.  set() throws on an unkeyed list rather than silently doing nothing.
 */

/**
 * The value an attribute is bound to.  There are only ever **two** of these per Selector,
 * both built in its constructor: one standing for "this row is the selected one" and one for
 * "this row is not".  when() returns whichever of the two the row's key calls for.
 *
 * Two singletons rather than one object per key is what makes a selector free to create.  A
 * row of a freshly-drawn list with nothing selected gets the unselected singleton, whose
 * value is the off value, so there is no allocation, no map entry and no DOM call — only the
 * two stores that record where the list lives.  It also sharpens the re-render skip: a row's
 * expression changes identity exactly when its selectedness changes, so
 * NodeGroup.rewriteStamp() rewrites the rows that gained or lost the selection and no others.
 */
export class SelectorRef {

	/** @type {Selector} */
	selector;

	/** @type {boolean} True on the singleton that stands for the selected row. */
	selected;

	constructor(selector, selected) {
		this.selector = selector;
		this.selected = selected;
	}

	/** @return {*} The value this ref currently stands for. */
	value() {
		let s = this.selector;
		return this.selected ? s.onValue : s.offValue;
	}

	/**
	 * Write this ref's value to an element's attribute, and tell the selector where the list
	 * is so that a later set() can find any row in it.
	 *
	 * Called by PathToAttribValue when the ref appears as an attribute expression.  It runs
	 * once per row per render, so it is deliberately nothing but two stores and a write that
	 * the common case skips.
	 *
	 * @param node {Node} The element carrying the attribute.
	 * @param attrName {string}
	 * @param parentNg {NodeGroup} The row this attribute belongs to. */
	bind(node, attrName, parentNg) {
		// set() writes through the row's own root element, so an attribute anywhere deeper
		// would be found at bind time and then written somewhere else at set() time.  Catching
		// it here turns a silently misplaced attribute into a clear message; the check is
		// stripped from the built file, so it costs a production render nothing.
		if (parentNg.startNode !== node)
			throw new Error(`Solarite: a selector must be on the row's own root element.`);

		let s = this.selector;
		s.attrName = attrName;
		s.path = parentNg.parentPath;

		let v = this.selected ? s.onValue : s.offValue;

		// Matches PathToAttribValue.applySingle: an empty or falsy value leaves no attribute
		// behind, so a selector never adds markup a hand-written implementation wouldn't have.
		if (v === '' || v === false || v === null || v === undefined) {
			// A just-cloned row provably carries no attribute of this name yet, so the
			// removeAttribute — a DOM call for every row of the list — can be skipped.
			if (parentNg.firstApply !== true)
				node.removeAttribute(attrName);
		}
		else
			node.setAttribute(attrName, v);
	}
}

/**
 * Created by h.selector().  Holds one selected key.
 *
 * Only attribute expressions can bind a selector; using one as element content throws,
 * because writing text through this path would need bookkeeping the two-node fast case
 * doesn't want.
 *
 * The selector keeps **no per-row state at all** — no map of keys, nothing to sweep, and
 * nothing that could pin a removed row's element in memory.  All it remembers is which
 * attribute it drives and which list it was rendered into.
 */
export default class Selector {

	/** @type {*} The selected key, or null. */
	#key = null;

	/** @type {SelectorRef} Returned by when() for the row whose key is selected. */
	#on = new SelectorRef(this, true);

	/** @type {SelectorRef} Returned by when() for every other row. */
	#off = new SelectorRef(this, false);

	/** @type {*} Value the bound attribute takes for the selected key.  Held here rather than
	 * on each ref, so the two refs stay interchangeable between call sites. */
	onValue;

	/** @type {*} Value it takes for every other key. */
	offValue = '';

	/** @type {?string} The attribute this selector drives, learned when a row binds. */
	attrName = null;

	/** @type {?PathToNodes} The list this selector's rows were rendered into, learned when a
	 * row binds.  set() asks it for the NodeGroup holding a given key. */
	path = null;

	/** @param key {*} The initially selected key. */
	constructor(key = null) {
		this.#key = key;
	}

	/** @return {*} The selected key. */
	get key() {
		return this.#key;
	}

	/**
	 * Bind an attribute to whether key is the selected one.
	 *
	 *	 h`<tr key=${row.id} class=${sel.when(row.id, 'danger')}>`
	 *
	 * @param key {*} This row's key.
	 * @param on {*} Value the attribute takes when key is selected.
	 * @param off {*} Value it takes otherwise.  '' removes the attribute.
	 * @return {SelectorRef} */
	when(key, on, off = '') {
		this.onValue = on;
		this.offValue = off;
		return key === this.#key ? this.#on : this.#off;
	}

	/**
	 * Move the selection.  Writes at most two attributes — the row losing the selection and
	 * the row gaining it — and touches nothing else.  There is no render() call.
	 * @param key {*} The newly selected key, or null for none. */
	set(key) {
		let old = this.#key;
		if (old === key)
			return;
		this.#key = key;

		// Nothing has rendered a row yet, so there is no list to write into.  The new key
		// still takes effect: rows drawn later come up already carrying the attribute.
		if (this.path === null)
			return;

		this.#write(old, this.offValue);
		this.#write(key, this.onValue);
	}

	/**
	 * Find the row holding key and give its root element the value v.
	 * @param key {*}
	 * @param v {*} */
	#write(key, v) {
		if (key === null || key === undefined)
			return;

		let ngs = this.path.nodeGroups;
		if (ngs === null || ngs.length === 0)
			return;

		if (ngs[0].key === undefined)
			throw new Error('A selector can only be used on a keyed list, because set() finds ' +
				'a row by its key.  Add key=${...} to the row template.');

		// A linear scan over the rows.  The list is walked only when the selection actually
		// moves — twice per user click, not once per row per render — so a thousand pointer
		// comparisons here cost far less than the per-row index that would avoid them.
		let ng = null;
		for (let i = 0; i < ngs.length; i++)
			if (ngs[i].key === key) {
				ng = ngs[i];
				break;
			}
		if (ng === null)
			return;

		// The selector owns an attribute on the row's own root element, which for a
		// single-root row template is exactly the NodeGroup's startNode.
		let node = ng.startNode;
		if (node === null || node.nodeType !== 1)
			return;

		if (v === '' || v === false || v === null || v === undefined)
			node.removeAttribute(this.attrName);
		else
			node.setAttribute(this.attrName, v);
	}
}
