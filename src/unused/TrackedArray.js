
export default class TrackedArray extends Array {
	constructor(...args) {
		super(...args);
		this.ops = [];
	}

	// Intercepting 'push' as 'insert'
	push(...items) {
		const startIdx = this.length;
		super.push(...items);
		this.ops.push({ op: 'insert', index: startIdx, values: items });
		return this.length;
	}

	// Intercepting 'pop' as 'remove'
	pop() {
		const removedIndex = this.length - 1;
		const removedItem = super.pop();
		this.ops.push({ op: 'remove', index: removedIndex, length: 1 });
		return removedItem;
	}

	// Intercepting 'shift' as 'remove'
	shift() {
		const removedItem = super.shift();
		this.ops.push({ op: 'remove', index: 0, length: 1 });
		return removedItem;
	}

	// Intercepting 'unshift' as 'insert'
	unshift(...items) {
		super.unshift(...items);
		this.ops.push({ op: 'insert', index: 0, values: items });
		return this.length;
	}

	// Intercepting 'splice' for insert, update, or remove
	splice(start, deleteCount, ...items) {
		const removedItems = super.splice(start, deleteCount, ...items);

		if (deleteCount > 0) {
			this.ops.push({ op: 'remove', index: start, length: deleteCount });
		}
		if (items.length > 0) {
			const operation = deleteCount > 0 ? 'update' : 'insert';
			this.ops.push({ op, index: start, values: items });
		}

		return removedItems;
	}

	// TODO: reverse, sorty, copyWithin, fill
}