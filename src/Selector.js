/**
 * A key-scoped selection that updates only the rows it actually affects.
 *
 * Rendering a list normally means calling render() and letting the reconciler decide what
 * changed.  That is the right default, but it is a poor fit for a selection: moving a
 * highlight from one row of a thousand to another changes two attributes, and asking the
 * reconciler about it means walking the whole list to discover that fact.
 *
 * A Selector short-circuits that.  Each row binds its attribute to a SelectorRef obtained
 * from when(), and the ref remembers the node it was written to.  Changing the selection
 * then writes those two nodes directly, with no render() call and no walk of the list.
 *
 * This is the same primitive as Solid's createSelector, adapted to a library that has no
 * signals: the ref, not a subscription, is what carries the binding.
 */

// The ref currently bound to a node's attribute.  A node whose key changes gets a new ref,
// and this expando is how the old one learns to stop pointing at it.
const boundRefKey = Symbol('solariteSelectorRef');

/**
 * The value an attribute is bound to.  One per key per Selector, created on demand by
 * Selector.when() and returned unchanged on every later call for that key — the stable
 * identity is what lets an unchanged row skip the write during a re-render.
 *
 * One of these is built for every row of a list, so it stays deliberately small: the on/off
 * values live on the Selector rather than being copied into each ref, since a selector drives
 * one attribute at one call site.
 */
export class SelectorRef {

	/** @type {Selector} */
	selector;

	/** @type {*} The key this ref answers for. */
	key;

	/** @type {?Node} The element whose attribute this ref writes, once it has been applied. */
	node = null;

	/** @type {?string} The attribute name, once this ref has been applied. */
	attrName = null;

	constructor(selector, key) {
		this.selector = selector;
		this.key = key;
	}

	/** @return {*} The value this ref currently stands for. */
	value() {
		let s = this.selector;
		return s.key === this.key ? s.onValue : s.offValue;
	}

	/**
	 * Point this ref at an element's attribute and write the current value.
	 * Called by PathToAttribValue when the ref appears as an attribute expression.
	 * @param node {Node}
	 * @param attrName {string}
	 * @param fresh {boolean} True when the node is a just-cloned row being filled in for the
	 * first time.  Such a node provably carries no attribute of this name yet and no earlier
	 * ref, so the usual read-and-detach and the removeAttribute call — a DOM call per row of
	 * the list, which is the whole cost of binding an unselected row — can both be skipped. */
	bind(node, attrName, fresh) {
		if (fresh !== true) {
			// A row whose key changed gets a different ref for the same node.  Detach the old
			// one, or a later selection change would write through it to a node it lost.
			let prev = node[boundRefKey];
			if (prev !== undefined && prev !== this)
				prev.node = null;
		}
		node[boundRefKey] = this;
		this.node = node;
		this.attrName = attrName;

		let v = this.value();
		// Matches PathToAttribValue.applySingle: an empty or falsy value leaves no attribute
		// behind, so a selector never adds markup a hand-written implementation wouldn't have.
		if (v === '' || v === false || v === null || v === undefined) {
			if (fresh !== true)
				node.removeAttribute(attrName);
		}
		else
			node.setAttribute(attrName, v);
	}

	/** Write the current value to the bound node, if this ref still has one. */
	write() {
		let node = this.node;
		if (node === null)
			return;
		let v = this.value();
		if (v === '' || v === false || v === null || v === undefined)
			node.removeAttribute(this.attrName);
		else
			node.setAttribute(this.attrName, v);
	}
}

/**
 * Created by h.selector().  Holds one selected key and the refs bound to it.
 *
 * Only attribute expressions can bind a ref; a ref used as element content throws, because
 * writing text through this path would need bookkeeping the two-node fast case doesn't want.
 *
 * There is deliberately no way to drop the bindings by hand.  Doing so would leave the
 * selector unable to reach rows that are still on screen but won't be re-rendered, and the
 * sweep in set() already keeps the map bounded without anyone having to remember.
 */
export default class Selector {

	/** @type {*} The selected key, or null. */
	#key = null;

	/** @type {Map<*, SelectorRef>} */
	#refs = new Map();

	/** @type {*} Value the bound attribute takes for the selected key.  Held here rather than
	 * on each ref, so building a row's ref stays as small as possible. */
	onValue;

	/** @type {*} Value it takes for every other key. */
	offValue = '';

	/** @type {int} Size at which the next set() sweeps refs whose node is gone. */
	#sweepAt = 64;

	/** @param key {*} The initially selected key. */
	constructor(key = null) {
		this.#key = key;
	}

	/** @return {*} The selected key. */
	get key() {
		return this.#key;
	}

	/**
	 * @return {int} How many keys this selector is currently holding a binding for.  Bindings
	 * for rows that no longer exist are swept as the selection moves, so this settles near the
	 * number of live rows; a number that keeps climbing means set() is never being called. */
	get size() {
		return this.#refs.size;
	}

	/**
	 * Bind an attribute to whether key is the selected one.
	 *
	 *	 h`<tr class=${sel.when(row.id, 'danger')}>`
	 *
	 * @param key {*} This row's key.
	 * @param on {*} Value the attribute takes when key is selected.
	 * @param off {*} Value it takes otherwise.  '' removes the attribute.
	 * @return {SelectorRef} */
	when(key, on, off = '') {
		this.onValue = on;
		this.offValue = off;
		let refs = this.#refs, ref = refs.get(key);
		if (ref === undefined)
			refs.set(key, ref = new SelectorRef(this, key));
		return ref;
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
		let refs = this.#refs;
		let a = refs.get(old);
		if (a !== undefined)
			a.write();
		let b = refs.get(key);
		if (b !== undefined)
			b.write();

		// A ref is kept for every key that has ever been rendered, so a list that is refilled
		// with new ids would otherwise grow one entry per row forever.  Sweeping only when the
		// map has doubled keeps that bounded at amortized constant cost per selection change.
		if (refs.size >= this.#sweepAt) {
			for (let [k, r] of refs)
				if (r.node === null || !r.node.isConnected)
					refs.delete(k);
			this.#sweepAt = Math.max(64, refs.size * 2);
		}
	}
}
