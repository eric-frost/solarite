/**
 * A list of items plus the function that builds one item's Template, as returned by h.map().
 *
 * Handing the reconciler the source items instead of an array of Templates is what makes
 * h.map() cheap on a long list: a row whose item is the same object it was built from needs
 * neither a Template built for it nor a cache lookup to find one, just an identity check
 * against the item the row already remembers.  Rows that moved are recognized too — see
 * PathToNodes.applyMapped(), which follows a shifted list's offset and, failing that, matches
 * items against the Templates the previous render built.
 */
export default class MappedList {

	/** @type {Array} */
	items;

	/** @type {function(*):Template} */
	fn;

	constructor(items, fn) {
		this.items = items;
		this.fn = fn;
	}

	/**
	 * Yield the Templates, building each one as it goes, so that code written against the older
	 * array-returning h.map() — spreading it, iterating it, passing it to Array.from — still
	 * works.  Doing so builds every row, which is exactly the work the reconciler skips when the
	 * list is handed to it whole, so prefer putting an h.map() straight into a template. */
	*[Symbol.iterator]() {
		let items = this.items, fn = this.fn;
		for (let i=0; i<items.length; i++)
			yield fn(items[i]);
	}
}
