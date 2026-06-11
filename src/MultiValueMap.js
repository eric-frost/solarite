/**
 * Maps a string key to multiple values.
 * Values are stored in arrays because pushing them is much faster than Set operations,
 * and deleteAny() needs no iterator allocation.
 * deleteAny() returns values first-in-first-out by advancing a head index (array.head)
 * instead of calling shift(), which would be O(n). */
export default class MultiValueMap {

	/** @type {Record<string, Array>} */
	data = {};

	// Add a new value for a key
	add(key, value) {
		let data = this.data;
		let array = data[key]
		if (!array)
			data[key] = [value];
		else
			array.push(value);
	}

	isEmpty() {
		for (let key in this.data)
			return true;
		return false;
	}

	/**
	 * Get all values for a key.
	 * @param key {string}
	 * @returns {Array} */
	getAll(key) {
		let array = this.data[key];
		if (!array)
			return [];
		return array.head ? array.slice(array.head) : array;
	}

	/**
	 * Remove one value from a key, and return it.
	 * @param key {string}
	 * @param val If specified, make sure we delete this specific value, if a key exists more than once.
	 * @returns {*|undefined} The deleted item. */
	delete(key, val=undefined) {
		if (val === undefined)
			return this.deleteAny(key);
		return this.deleteSpecific(key, val);
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

		let head = array.head || 0;
		let result = array[head];
		head++;
		if (head >= array.length)
			delete data[key];
		else
			array.head = head;

		return result;
	}

	deleteSpecific(key, val) {
		let data = this.data;
		let array = data[key];
		if (!array)
			return undefined;

		let i = array.indexOf(val, array.head || 0);
		if (i === -1)
			return undefined;
		array.splice(i, 1);

		if ((array.head || 0) >= array.length)
			delete data[key];

		return val;
	}

	hasValue(val) {
		let data = this.data;
		let names = [];
		for (let name in data)
			if (data[name].includes(val))
				names.push(name)
		return names;
	}
}
