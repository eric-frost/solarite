export default class LinkedList {

	constructor(input) {
		this.head = null;
		this.tail = null;
		this.map = new Map();

		if (Array.isArray(input)) {
			input.forEach(val => this.push(val));
		} else if (input instanceof LinkedList) {
			for (let val of input) {
				this.push(val);
			}
		}
	}

	push(value) {
		if (!this.head) {
			this.head = value;
			this.tail = value;
			return;
		}

		this.map.set(value, { prev: this.tail, next: null });
		this.map.set(this.tail, { ...this.map.get(this.tail), next: value });
		this.tail = value;
	}

	unshift(value) {
		if (!this.head) {
			this.push(value);
			return;
		}

		this.map.set(value, { prev: null, next: this.head });
		this.map.set(this.head, { ...this.map.get(this.head), prev: value });
		this.head = value;
	}

	shift() {
		if (!this.head) return;

		const secondNode = this.map.get(this.head).next;

		if (secondNode) {
			this.map.set(secondNode, { ...this.map.get(secondNode), prev: null });
		} else {
			this.tail = null;
		}

		this.head = secondNode;
	}

	pop() {
		if (!this.tail) return;

		const penultimate = this.map.get(this.tail).prev;

		if (penultimate) {
			this.map.set(penultimate, { ...this.map.get(penultimate), next: null });
		} else {
			this.head = null;
		}

		this.tail = penultimate;
	}

	*[Symbol.iterator]() {
		let currentNode = this.head;

		while (currentNode) {
			yield currentNode;
			const mapData = this.map.get(currentNode);
			currentNode = mapData ? mapData.next : null;
		}
	}

	slice(start, end) {
		const newList = new LinkedList();
		let currentNode = start;

		while (currentNode && currentNode !== end) {
			newList.push(currentNode);
			currentNode = this.map.get(currentNode).next;
		}
		if (end) {
			newList.push(end);
		}

		return newList;
	}


	splice(start, end, newList) {
		// TODO: assert items in newList aren't already in our list.

		const firstNewNode = newList instanceof LinkedList ? newList.head : newList[0];
		const lastNewNode = newList instanceof LinkedList ? newList.tail : newList[newList.length - 1];

		if (firstNewNode) {
			this.map.set(start, { ...this.map.get(start), next: firstNewNode });
			this.map.set(firstNewNode, { ...this.map.get(firstNewNode), prev: start });
		}

		const afterEnd = end ? this.map.get(end).next : null;
		if (lastNewNode) {
			this.map.set(lastNewNode, { ...this.map.get(lastNewNode), next: afterEnd });
			if (afterEnd) {
				this.map.set(afterEnd, { ...this.map.get(afterEnd), prev: lastNewNode });
			} else {
				this.tail = lastNewNode;
			}
		} else if (afterEnd) {
			this.map.set(afterEnd, { ...this.map.get(afterEnd), prev: start });
		}
	}
}
