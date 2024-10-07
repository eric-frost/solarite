/**
 * Trying to be able to automatically watch primitive values.
 * TODO:
 * 1.  Have get() return Proxies for nested updates.
 * 2.  Override .map() for loops to capture changes.
 */


// Example:
/*
class WatchExample extends Solarite {

	constructor(items = []) {
		super();

		this.items = items;
		watch(this, 'items');

		this.name = 'George';
		watch(this, 'name');

		this.render();
	}

	render() {
		r(this)`
		<watch-example>
			${() => this.name + '!'}

			${this.items.map(item => r`
				<div>${item.name}</div>
			`)}
			${this.items.length}
		</watch-example>`;
	}
}
customElements.define('watch-example', WatchExample);

let a = new WatchExample();

// Items is a Proxy.
// Calling push() will trigger the map'd ExprPaths to add another at the end.
// And the .length expression to update.
// Because accessing .items returns a proxy.
a.items.push({name: 'Fred'});
*/


import Globals from "./Globals.js";

let unusedArg = Symbol('unusedArg');


class TrackedArray extends Array {
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

function map(array, callback, exprFunctions) {
	for (let i=0; i<array.length; i++) {
		if (Globals.currentExprPath) {
			let [exprPath, exprFunction] = Globals.currentExprPath;
			exprFunctions.set(exprPath, exprFunction);
		}
	}


	return array.map((item, i, array) => {
		return callback(item, i, array);
	});
}


/**
 *
 * @param root {Object}
 * @param path {string}
 * @param value {string|Symbol} */
export default function watch3(root, path, value=unusedArg) {
	// Store internal value used by get/set.
	if (value !== unusedArg)
		root[path] = value;
	else
		value = root[path];

	/**
	 * Store the expressions that use this watched variable,
	 * along with the functions used to get theri values.
	 * TODO: Should the function be stored on the ExprPath?
	 * TODO: We should clear this every time render() is called.
	 * @type {Map<ExprPath, function>} */
	let exprFunctions = new Map();



	// use a single object for both defineProperty and new Proxy's handler.
	const handler = {
		get(obj, prop, receiver) {

			let result = (obj === receiver && path === prop)
				? value // top-level value.
				: Reflect.get(obj, prop, receiver); // avoid infinite recursion.

			// Track which ExprPath is using this variable.
			if (Globals.currentExprPath) {
				let [exprPath, exprFunction] = Globals.currentExprPath;
				exprFunctions.set(exprPath, exprFunction);
			}


			if (isObj(result))
				return new Proxy(result, handler);

			return result;
		},
		set(obj, prop, val, receiver) {
			if (obj === receiver && path === prop)
				value = val; // top-level value.
			else // avoid infinite recursion.
				Reflect.set(obj, prop, val, receiver);

			for (let [exprPath, exprFunction] of exprFunctions)
				if (exprFunction) {

					// TODO: Will fail for attribute w/ a value having multiple ExprPaths.
					// TODO: This won't update a component's expressions.
					exprPath.apply(exprFunction);

					exprPath.freeNodeGroups(); // TODO: This could be skipped if applyExprs() never marked them as in-use.
				}
			return true;
		}
	}

	Object.defineProperty(root, path, {
		get: () => handler.get(root, path, root),
		set: (val) => handler.set(root, path, val, root)
	});
}

function isObj(o) {
	return o && (typeof o === 'object');
}