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

	// Get all values for a key
	getAll(key) {
		return this.data[key] || [];
	}

	/**
	 * Remove one value from a key, and return it.
	 * @param key {string}
	 * @param val If specified, make sure we delete this specific value, if a key exists more than once.
	 * @returns {*} */
	delete(key, val=undefined) {
		// if (key === '["Html2",[[["Html3",["F1","A"]],["Html3",["F1","B"]]]]]')
		// 	debugger;

		let data = this.data;

		// if (!data.hasOwnProperty(key))
		// 	return undefined;

		// Delete a specific value.
		let result;
		let set = data[key];
		if (!set) // slower than pre-check.
			return undefined;

		// Delete any value.
		if (val === undefined) {
			//result = set.values().next().value; // get first item from set.
			[result] = set; // Does the same as above and seems to be about the same speed.
			set.delete(result);
		}

		// Delete a specific value.
		else {
			set.delete(val);
			result = val;
		}

		// TODO: Will this make it slower?
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