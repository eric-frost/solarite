


/**
 * An array that keeps track of how many elements are in-use.
 * In-use elements are always at the beginning of the array. */
export class InUseArray extends Array {

	/**
	 * @type {int} Everything before this number is in-use. */
	count = 0;


	/**
	 * Get a value and mark it as in-use.
	 * @param val {undefined|*} Optional.  If set, find this specific value.  Otherwise find any value.
	 * @return {undefined|*} The value that is now marked as in-use. */
	use(val=undefined) {
		if (val) {
			// If val doesn't exist or is already in-use, return undefined.
			let index = this.indexOf(val);
			if (index === -1 || index < this.count)
				return undefined;

			// Swap the first available with val.
			this[index] = this[this.count];
			this[this.count] = val;
			this.count++;
			return val;
		}

		// Try to get last available.
		else {
			if (this.count >= this.length)
				return undefined;
			let result = this[this.count];
			this.count++;
			return result;
		}
	}

	free() {
		this.count = 0;
	}

	reset() {
		this.length = 0;
	}
}

/**
 *
 */
export class InUseMap {

	/** @type {Object<string, InUseArray>} */
	data = {};

	// Set a new value for a key
	add(key, value) {
		let data = this.data;
		let array = data[key]
		if (!array) {
			array = new InUseArray();
			data[key] = array;
		}
		array.push(value);
	}

	// Get all values for a key
	getAll(key) {
		return this.data[key] || [];
	}

	// Find a value matching the given key, mark it as inUse, and return it.
	use(key, val=undefined) {
		return this.data[key]?.use(val) || undefined
	}

	// temporary
	delete(key, val=undefined) {
		return this.data[key]?.use(val) || undefined
	}

	freeAll() {
		for (let key in this.data)
			this.data[key].free();
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