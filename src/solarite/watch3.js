/**
 *
 *
 * Trying to be able to automatically watch primitive values.
 * TODO:
 * 1.  Have get() return Proxies for nested updates.
 * 2.  Override .map() for loops to capture changes.
 * 3.  Rename so we have watch.add() and watch.render() ?
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
 * This function markes a property of a web component to be watched for changes.
 *
 * Here is how watches work:
 * 1.  When we call watch3() it creates properties and proxies to watch when those values are set.
 * 2.  When they are set, we add their paths to a list of what to re-render.
 * 3.  Then we call renderWatched() to re-render only those parts.
 *
 * In more detail:
 * TODO
 *
 *
 * @param root {HTMLElement} Must be an instance of a Web Component.
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

			// We override the map() function the first time render() is called.
			// But it's not re-overridden when we call renderWatched()
			if (prop === 'map') {

				// This outer function is so the ExprPath calls it as a function,
	 			// instead of it being evaluated immediately when the Template is created.
				return (callback) =>

					// This is the new map function.
					// TODO: Find a way to pass it a new obj when called from renderWatched
					function mapFunction() {
						let newObj = mapFunction.newValue || obj;
						Globals.currentExprPath.mapCallback = callback;
						return map(new Proxy(newObj, handler), callback);
					}
			}

			// Track which ExprPath is using this variable.
			else if (Globals.currentExprPath) {
				let rootNg = Globals.nodeGroups.get(root);

				// Init for field.
				rootNg.watchedExprPaths[field] = rootNg.watchedExprPaths[field] || new Set();
				rootNg.watchedExprPaths[field].add(Globals.currentExprPath); // Globals.currentExprPath is set in ExprPath.applyExact()
			}

			if (result && typeof result === 'object')
				return new Proxy(result, handler);

			return result;
		},


		// TODO: Will fail for attribute w/ a value having multiple ExprPaths.
		// TODO: This won't update a component's expressions.
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
				else
					rootNg.exprsToRender.set(exprPath, new NewValue(val)); // True means to re-render the whole thing.
			}
			return true;
		}
	}

	Object.defineProperty(root, field, {
		get: () => handler.get(root, field, root),
		set: (val) => handler.set(root, field, val, root)
	});
}

/**
 * Render the ExprPaths that were added to rootNg.exprsToRender.
 * @param root {HTMLElement}
 * @returns {Node[]} Modified elements.  */
export function renderWatched(root) {
	let rootNg = Globals.nodeGroups.get(root);
	let modified = [];

	for (let [exprPath, params] of rootNg.exprsToRender) {

		// Reapply the whole expression.
		if (params instanceof NewValue) {

			// So it doesn't use the old value inside the map callback in the get handler above.
			// TODO: Find a more sensible way to pass newValue.
			exprPath.watchFunction.newValue = params.value;
			exprPath.apply([exprPath.watchFunction]);

			// TODO: freeNodeGroups() could be skipped if we updated ExprPath.apply() to never marked them as rendered.
			exprPath.freeNodeGroups();

			modified.push(...exprPath.getNodes());
		}

		// Update a single NodeGroup created by array.map()
		else {
			for (let row of params) {
				let [obj, prop, value] = row;
				let template = exprPath.mapCallback(value);
				exprPath.applyLoopItemUpdate(prop, template);

				modified.push(...exprPath.nodeGroups[prop].getNodes());
			}
		}
	}

	rootNg.exprsToRender = new Map(); // clear

	return modified;
}

/**
 * Wrap a value in a way that tells renderWatched() to take the first path and reapply the whole expression. */
class NewValue {
	constructor(value) {
		this.value = value;
	}
}