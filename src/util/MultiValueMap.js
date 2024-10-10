export default class MultiValueMap {

	/** @type {Object<string, Set>} */
	data = {};

	// Set a new value for a key
	add(key, value) {
		let data = this.data;
		let set = data[key]
		if (!set) {
			set = new Set();
			data[key] = set;
		}
		set.add(value);
	}

	isEmpty() {
		for (let key in this.data)
			return true;
		return false;
	}

	/**
	 * Get all values for a key.
	 * @param key {string}
	 * @returns {Set|*[]} */
	getAll(key) {
		return this.data[key] || [];
	}

	/**
	 * Remove one value from a key, and return it.
	 * @param key {string}
	 * @param val If specified, make sure we delete this specific value, if a key exists more than once.
	 * @returns {*|undefined} The deleted item. */
	delete(key, val=undefined) {
		let data = this.data;
		let result;
		let set = data[key];
		if (!set)
			return undefined;

		// Delete any value.
		if (val === undefined) {
			[result] = set; // Does the same as above and seems to be about the same speed.
			set.delete(result);
		}

		// Delete a specific value.
		else {
			set.delete(val);
			result = val;
		}

		if (set.size === 0)
			delete data[key];

		return result;
	}

	/**
	 * Remove one value from a key, and return it.
	 * @param key {string}
	 * @param val If specified, make sure we delete this specific value, if a key exists more than once.
	 * @returns {*|undefined} The deleted item. */
	deleteAny(key, val=undefined) {
		let data = this.data;
		let result;
		let set = data[key];
		if (!set) // slower than pre-check.
			return undefined;

		[result] = set; // Does the same as above and seems to be about the same speed.
		set.delete(result);

		if (set.size === 0)
			delete data[key];

		return result;
	}

	deleteSpecific(key, val) {
		let data = this.data;
		let result;
		let set = data[key];
		if (!set)
			return undefined;

		set.delete(val);
		result = val;

		if (set.size === 0)
			delete data[key];

		return result;
	}


	/**
	 * Try to delete an item that matches the key and the isPreferred function.
	 * if not the latter, just delete any item that matches the key.
	 * @param key {string}
	 * @returns {*|undefined} The deleted item. */
	deletePreferred(key, parent) {
		let result;
		let data = this.data;
		let set = data[key];
		if (!set)
			return undefined;

		for (let val of set) {
			if (val?.parentNode === parent) {
				set.delete(val);
				result = val;
				break;
			}
		}
		if (!result) {
			[result] = set;
			set.delete(result);
		}

		if (set.size === 0)
			delete data[key];

		return result;
	}

	hasValue(val) {
		let data = this.data;
		let names = [];
		for (let name in data)
			if (data[name].has(val)) // TODO: iterate twice to pre-size array?
				names.push(name)
		return names;
	}
}