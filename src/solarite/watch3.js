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



/**
 * Custom map function triggers the get() Proxy.
 * @param array {Array}
 * @param callback {function}
 * @returns {*[]} */
function map(array, callback) {
	let result = [];
	for (let i=0; i<array.length; i++)
		result.push(callback(array[i], i, array));
	return result;
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
	 * TODO: Should these be stored on the RootNodeGroup?
	 * TODO: We should clear this every time render() is called.
	 * @type {Map<ExprPath, function>} */
	let exprFunctions = new Map();
	let arrayCallbacks = new Map();



	// use a single object for both defineProperty and new Proxy's handler.
	const handler = {
		get(obj, prop, receiver) {

			let result = (obj === receiver && path === prop)
				? value // top-level value.
				: Reflect.get(obj, prop, receiver); // avoid infinite recursion.

			if (prop === 'map')

				// Double function so the ExprPath calls it as a function,
				// instead of it being evaluated immediately when the Templat eis created.
				return (callback) => () => {
					arrayCallbacks.set(obj, callback);
					return map(new Proxy(obj, handler), callback);
				}

			// Track which ExprPath is using this variable.
			if (Globals.currentExprPath) {
				let [exprPath, exprFunction] = Globals.currentExprPath; // Set in ExprPath.applyExact()
				exprFunctions.set(exprPath, exprFunction);
			}

			if (isObj(result))
				return new Proxy(result, handler);

			return result;
		},


		// TODO: Will fail for attribute w/ a value having multiple ExprPaths.
		// TODO: This won't update a component's expressions.
		// TODO: freeNodeGroups() could be skipped if applyExprs() never marked them as in-use.
		set(obj, prop, val, receiver) {
			if (obj === receiver && path === prop)
				value = val; // top-level value.
			else // avoid infinite recursion.
				Reflect.set(obj, prop, val, receiver);

			for (let [exprPath, exprFunction] of exprFunctions)

				//debugger;

				// Update a single NodeGroup created by array.map()
				if (Array.isArray(obj) && parseInt(prop) == prop) {
					let callback = arrayCallbacks.get(obj);
					let template = callback(val);
					exprPath.applyLoopItemUpdate(prop, template);
				}

				// Reapply the whole expression.
				else {
					exprPath.apply(exprFunction);
					exprPath.freeNodeGroups();
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