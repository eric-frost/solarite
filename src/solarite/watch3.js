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
import delve from "../util/delve.js";
//import NodeGroupManager from "./NodeGroupManager.js";

let unusedArg = Symbol('unusedArg');

/**
 *
 * @param root {Object}
 * @param path {string}
 * @param value {string|Symbol} */
export default function watch3(root, path, value=unusedArg) {

	/** @type {ExprPath} The ExprPath that's using this variable.*/
	let exprPath;

	/** @type {function} Function evaluated by the ExprPath. */
	let exprFunction;

	if (value !== unusedArg)
		root[path] = value;

	// Store internal value used by get/set.
	else
		value = root[path];

	Object.defineProperty(root, path, {
		get() {
			// Track which ExprPath is using this variable.
			if (Globals.currentExprPath)
				[exprPath, exprFunction] = Globals.currentExprPath;

			// TODO: Return Proxy for non-primitive value, to track path changed.
			return value;
		},
		set(val) {
			value = val;

			if (exprFunction) {

				// TODO: Will fail for attribute w/ a value having multiple ExprPaths.
				// TODO: This won't update a component's expressions.
				exprPath.apply(exprFunction);

				exprPath.freeNodeGroups(); // TODO: This could be skipped if applyExprs() never marked them as in-use.

			}
		}
	});
}
