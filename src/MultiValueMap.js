/**
 * Maps a string key to multiple values.
 * Values are stored in arrays because pushing them is much faster than Set operations,
 * and deleteAny() needs no iterator allocation.
 * deleteAny() returns values first-in-first-out by advancing a head index (array.hd)
 * instead of calling shift(), which would be O(n). */
export default class MultiValueMap {

	/** @type {Record<string, Array>} */
	data = {};

	/**
	 * Add a new value for a key, unless the key already holds max values.
	 * The cap bounds pooled NodeGroup memory; without one every value is added.
	 * @param key {string}
	 * @param value
	 * @param [max] {int} */
	addCapped(key, value, max=Infinity) {
		let data = this.data;
		let array = data[key]
		if (!array)
			data[key] = [value];
		else if (array.length - (array.hd || 0) < max)
			array.push(value);
	}

	/**
	 * Remove the oldest value from a key, and return it.
	 * @param key {string}
	 * @returns {*|undefined} The deleted item. */
	deleteAny(key) {
		let data = this.data;
		let array = data[key];
		if (!array) // slower than pre-check.
			return undefined;

		let head = array.hd || 0;
		let result = array[head];
		head++;
		if (head >= array.length)
			delete data[key];
		else
			array.hd = head;

		return result;
	}
}
