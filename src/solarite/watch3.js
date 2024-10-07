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
			${() => this.items.length}
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
import Util from "../util/Util.js";

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
 * @param root {HTMLElement}
 * @param field {string}
 * @param value {string|Symbol} */
export default function watch3(root, field, value=unusedArg) {
	// Store internal value used by get/set.
	if (value !== unusedArg)
		root[field] = value;
	else
		value = root[field];


	// use a single object for both defineProperty and new Proxy's handler.
	const handler = {
		get(obj, prop, receiver) {

			let result = (obj === receiver && field === prop)
				? value // top-level value.
				: Reflect.get(obj, prop, receiver); // avoid infinite recursion.

			if (prop === 'map')

				// Double function so the ExprPath calls it as a function,
				// instead of it being evaluated immediately when the Templat eis created.
				return (callback) => () => {
					let rootNg = Globals.nodeGroups.get(root);
					rootNg.mapCallbacks.set(obj, callback);
					return map(new Proxy(obj, handler), callback);
				}

			// Track which ExprPath is using this variable.
			if (Globals.currentExprPath) {
				let [exprPath, exprFunction] = Globals.currentExprPath; // Set in ExprPath.applyExact()

				let rootNg = Globals.nodeGroups.get(root);

				// Init for field.
				rootNg.watchedExprPaths[field] = rootNg.watchedExprPaths[field] || new Set();
				rootNg.watchedExprPaths[field].add(exprPath);


				//rootNg.watchedExprPaths.add(field, [exprPath, exprFunction]);
			}

			if (isObj(result))
				return new Proxy(result, handler);

			return result;
		},


		// TODO: Will fail for attribute w/ a value having multiple ExprPaths.
		// TODO: This won't update a component's expressions.
		// TODO: freeNodeGroups() could be skipped if applyExprs() never marked them as in-use.
		set(obj, prop, val, receiver) {

			// 1. Set the value.
			if (obj === receiver && field === prop)
				value = val; // top-level value.
			else // avoid infinite recursion.
				Reflect.set(obj, prop, val, receiver);



			// 2. Add to the list of ExprPaths to re-render.
			let rootNg = Globals.nodeGroups.get(root);
			for (let exprPath of rootNg.watchedExprPaths[field]) {

				// Update a single NodeGroup created by array.map()
				if (Array.isArray(obj) && parseInt(prop) == prop) {
					let exprsToRender = rootNg.exprsToRender.get(exprPath);

					// If we're not re-rendering the whole thing.
					if (exprsToRender !== true)
						Util.mapAdd(rootNg.exprsToRender, exprPath, [obj, prop, val]);
				}

				// Reapply the whole expression.
				else {
					rootNg.exprsToRender.set(exprPath, true);
				}
			}
			return true;
		}
	}

	Object.defineProperty(root, field, {
		get: () => handler.get(root, field, root),
		set: (val) => handler.set(root, field, val, root)
	});
}

function isObj(o) {
	return o && (typeof o === 'object');
}

/**
 * TODO: Rename so we have watch.add() and watch.render() ?
 * @param root
 * @returns {*[]}
 */
export function renderWatched(root) {
	let rootNg = Globals.nodeGroups.get(root);
	let modified = [];

	for (let [exprPath, val] of rootNg.exprsToRender) {

		// Reapply the whole expression.
		if (val === true) {
			exprPath.apply(exprPath.watchFunction);
			exprPath.freeNodeGroups(); // TODO: free only the used Nodegroup!

			modified.push(...exprPath.getNodes());
		}

		// Update a single NodeGroup created by array.map()
		else {
			for (let row of val) {
				let [obj, prop, value] = row;

				let callback = rootNg.mapCallbacks.get(obj);
				let template = callback(value);
				exprPath.applyLoopItemUpdate(prop, template);

				modified.push(...exprPath.nodeGroups[prop].getNodes());
			}
		}
	}

	rootNg.exprsToRender = new Map(); // clear
	//rootNg.clearRenderWatched();

	return modified;
}