export default class WeakArray {
	constructor() {
		this.items = [];
	}

	push(...items) {
		for (let item of items) {
			if (typeof item === 'object' && item)
				this.items.push(new WeakRef(item));
			else
				throw new TypeError("Only objects can be added to a WeakArray");
		}
	}

	get(index) {
		const ref = this.items[index];
		if (ref)
			return ref.deref();
		return undefined;
	}

	cleanup() {
		this.items = this.items.filter(ref => ref.deref() !== undefined);
	}

	*[Symbol.iterator]() {
		for (const ref of this.items) {
			const value = ref.deref();
			if (value !== undefined)
				yield value;
		}
	}
}