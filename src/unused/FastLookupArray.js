/**
 * partialUpdate test is 20% slower when using this, even before I override any methods!*/
export default class FastLookupArray extends Array {
	constructor() {
		super(...arguments)
		this.indexMap = new Map(); // You can replace with WeakMap() but ensure only objects are added.

	}

	push(item) { // doesn't support pushing multiple
		if (!this.indexMap.has(item)) {
			this[this.length] = item;
			this.indexMap.set(item, this.length - 1);
		}
	}

	indexOf(item) {
		return this.indexMap.get(item) || -1;
	}

	remove(item) {
		const index = this.indexOf(item);
		if (index !== -1) {
			this.splice(index, 1);
			this.indexMap.delete(item);

			// Adjust the map indices for the items after the removed one
			for (let i = index; i < this.length; i++)
				this.indexMap.set(this[i], i);
		}
	}

	insertBefore(referenceItem, newItem) {
		const refIndex = this.indexOf(referenceItem);
		if (refIndex !== -1) {
			this.splice(refIndex, 0, newItem);
			this.indexMap.set(newItem, refIndex);

			// Adjust the map indices for the items after the inserted one
			for (let i = refIndex + 1; i < this.length; i++)
				this.indexMap.set(this[i], i);
		}
	}

	set(index, item) {
		const currentItem = this[index];
		if (currentItem !== undefined)
			this.indexMap.delete(currentItem);
		this[index] = item;
		this.indexMap.set(item, index);
	}

	// TODO: Override splice?
}