/**
 * Trying to be able to automatically watch primitive values.
 * TODO:
 * 1.  Update NodeGroups when reapplying the expression.
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
import {getObjectHash} from "./hash.js";

/**
 * TODO:
 * Have ExprPath set the exprPath property of WatchedItem when it encounters it.
 * WatchedItem needs to be a Proxy to handle objects and arrays.
 */


export default function watch3(root, path) {

	/** @type {ExprPath} The ExprPath that's using this variable.*/
	let exprPath;

	/** @type {function} Function evaluated by the ExprPath. */
	let exprFunction;

	// Store internal value used by get/set.
	let value = root[path];

	Object.defineProperty(root, path, {
		get() {
			// Trach which ExprPath is using this variable.
			if (Globals.currentExprPath)
				[exprPath, exprFunction] = Globals.currentExprPath;
			return value;
		},
		set(val) {
			value = val;

			if (exprFunction) {

				let ng = exprPath.parentNg;


				//ng.manager.findAndDeleteExact(ng.exactKey);

				ng.applyExprs([exprFunction], [exprPath]);  // TODO: Will fail for attribute w/ a value having multiple ExprPaths.


				// TODO: This doesn't cascade upward.
				//ng.exactKey = getObjectHash(ng.template);

			}

		}
	});
}
