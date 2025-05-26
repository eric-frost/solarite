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
import {assert} from "../util/Errors.js";

let unusedArg = Symbol('unusedArg');

/**
 * Passed as an argument when creating a new Proxy().
 * Handles getting and setting properties on the proxied object. */
class ProxyHandler {
	path = [];

	constructor(root, value, path=[]) {

		/** @type {Object} The top level object being proxied. */
		this.root = root;

		/** @type {string[]} Path from the root? */
		this.path = path;

		/** @type {*} the value found when starting at root and following the path? */
		this.value = value;
	}

	get(obj, prop, receiver) {

		let result = (obj === receiver)
			? this.value // top-level value.
			: Reflect.get(obj, prop, receiver); // avoid infinite recursion.
		if (!Globals.watch)
			return result;

		// We override the map() function the first time render() is called.
		// But it's not re-overridden when we call renderWatched()
		if (Array.isArray(obj)) {

			if (prop === 'map') {

				let handler = this;

				// This outer function is so the ExprPath calls it as a function,
				// instead of it being evaluated immediately when the Template is created.
				// This allows ExprPath.apply() to set the Globals.currentExprPath before evaluating further.
				return (callback) =>

					// This is the new map function.
					function mapFunction() {

						// Save the ExprPaths that called the array used by .map()
						if (Globals.currentExprPath) {
							let path = handler.path.join('\f');
							let rootNg = Globals.nodeGroups.get(handler.root);
							if (!rootNg.watchedExprPaths[path])
								rootNg.watchedExprPaths[path] = new Set();
							rootNg.watchedExprPaths[path].add(Globals.currentExprPath);
						}

						// Apply the map function.
						let newObj = mapFunction.newValue || obj;
						Globals.currentExprPath.mapCallback = callback;
						// If new Proxy fails b/c newObj isn't an object, make sure the expression is a function.
						// TODO: Find a way to warn about this automatically.
						return Array.prototype.map.call(new Proxy(newObj, handler), callback);
					}
			}

			else if (prop === 'push' || prop==='pop' || prop === 'splice') {
				const rootNg = Globals.nodeGroups.get(this.root);
				const path = this.path.join('\f');
				return new WatchedArray(rootNg, obj, rootNg.watchedExprPaths[path])[prop];
			}
		}


		// Save the ExprPath that's currently accessing this variable.
		let path;
		if (Globals.currentExprPath) {
			const rootNg = Globals.nodeGroups.get(this.root);

			path = this.path.length === 0 ? prop : this.path.join('\f') + '\f' + prop;
			let watchedExprPaths = rootNg.watchedExprPaths;
			if (!watchedExprPaths[path])
				watchedExprPaths[path] = new Set([Globals.currentExprPath]);
			else
				watchedExprPaths[path].add(Globals.currentExprPath);
		}

		// Accessing a sub-property
		if (result && typeof result === 'object') {// Clone this handler and append prop to the path.


			return new Proxy(result, new ProxyHandler(this.root, this.value, [...this.path, prop]));
		}

		return result;
	}

	// TODO: Will fail for attribute w/ a value having multiple ExprPaths.
	// TODO: This won't update a component's expressions.
	set(obj, prop, val, receiver) {

		// 1. Set the value.
		if (obj === receiver)
			this.value = val; // top-level value.
		else // Set the value while avoiding infinite recursion.
			Reflect.set(obj, prop, val, receiver);
		if (!Globals.watch)
			return true;

		// 2. Add to the list of ExprPaths to re-render.
		let path = this.path.length === 0 ? prop : this.path.join('\f') + '\f' + prop;
		let rootNg = Globals.nodeGroups.get(this.root);

		for (let exprPath of rootNg.watchedExprPaths[path] || []) {

			// Update a single NodeGroup created by array.map()
			// TODO: This doesn't trigger when setting the property of an object in an array.
			if (Array.isArray(obj) && Number.isInteger(+prop)) {
				let exprsToRender = rootNg.exprsToRender.get(exprPath);

				// If we're not re-rendering the whole thing.
				if (!(exprsToRender instanceof WholeArrayOp)) // TODO: Check for WholeArrayOp instead of true.  TODO: use val.$unproxied
					Util.mapArrayAdd(rootNg.exprsToRender, exprPath, new ArraySpliceOp(obj, prop, 1, [val]));
			}

			// Reapply the whole expression.
			else if (Array.isArray(Reflect.get(obj, prop)))
				rootNg.exprsToRender.set(exprPath, new WholeArrayOp(val)); // True means to re-render the whole thing.
			else
				rootNg.exprsToRender.set(exprPath, new ValueOp(val)); // True means to re-render the whole thing.
		}
		return true;
	}
}

/**
 * This function markes a property of a web component to be watched for changes.
 *
 * Here is how watches work:
 * 1.  When we call watch() it creates properties on the root object that return Proxies to watch when values are set.
 * 2.  When they are set, we add their paths to the rootNodeGroup.exprsToRender that keeps track of what to re-render.
 * 3.  Then we call renderWatched() to re-render only those parts.
 *
 * In more detail:
 * TODO
 *
 *
 * @param root {HTMLElement} An instance of a Web Component that uses r() to render its content.
 * @param field {string} The name of a top-level property of root.
 * @param value {string|Symbol} The default value. */
export default function watch(root, field, value=unusedArg) {
	// Store internal value used by get/set.
	if (value !== unusedArg)
		root[field] = value;
	else
		value = root[field];

	let handler = new ProxyHandler(root, value);
	//handler.path.push(field);
	Object.defineProperty(root, field, {
		get: () => handler.get(root, field, root),
		set: (val) => handler.set(root, field, val, root)
	});
}

/**
 * Wrap an array so that functions that modify the array are intercepted.
 * We then add ArraySpliceOp's to the list of ops to run for each affected ExprPath.
 * When renderWatched() is called it then applies those ops to the NodeGroups created by the map() function. */
class WatchedArray {

	/**
	 * @param array {Array}
	 * @param rootNg {RootNodeGroup}
	 * @param exprPaths {ExprPath[]} Expression paths that use this array. */
	constructor(rootNg, array, exprPaths) {
		this.rootNg = rootNg;
		//#IFDEV
		assert(Array.isArray(array));
		//#ENDIF
		this.array = array;
		this.exprPaths = exprPaths;
		this.push = this.push.bind(this);
		this.pop = this.pop.bind(this);
		this.splice = this.splice.bind(this);
	}

	push(...args) {
		return this.internalSplice('push', args, [this.array, this.array.length, 0, args]);
	}

	pop() {
		if (this.array.length)
			return this.internalSplice('pop', [], [this.array, this.array.length-1, 1]);
	}

	splice(...args) {
		return this.internalSplice('splice', args, [this.array, ...args]);
	}

	internalSplice(func, args, spliceArgs) {
		// Mark all expressions affected by the push() to be re-rendered
		for (let exprPath of this.exprPaths) {
			let exprsToRender = this.rootNg.exprsToRender.get(exprPath);
			if (!(exprsToRender instanceof WholeArrayOp)) // If we're not already going to re-render the whole array.
				Util.mapArrayAdd(this.rootNg.exprsToRender, exprPath, new ArraySpliceOp(...spliceArgs));
		}

		// Call original push() function
		return Array.prototype[func].call(this.array, ...args);
	}
}

/**
 * Render the ExprPaths that were added to rootNg.exprsToRender.
 * @param root {HTMLElement}
 * @param trackModified {boolean}
 * @returns {Node[]} Modified elements.  */
export function renderWatched(root, trackModified=false) {
	let rootNg = Globals.nodeGroups.get(root);
	let modified;

	if (trackModified)
		modified = new Set();

	for (let [exprPath, ops] of rootNg.exprsToRender) {

		// Reapply the whole expression.
		if (ops instanceof WholeArrayOp) {

			// So it doesn't use the old value inside the map callback in the get handler above.
			// TODO: Find a more sensible way to pass newValue.
			exprPath.watchFunction.newValue = ops.array;
			exprPath.apply([exprPath.watchFunction], true);

			// TODO: freeNodeGroups() could be skipped if we updated ExprPath.apply() to never marked them as rendered.
			exprPath.freeNodeGroups();

			if (trackModified)
				modified.add(...exprPath.getNodes());
		}

		// Update a single value in a map callback
		else if (ops instanceof ValueOp) {
			//exprPath = exprPath.mapCallback || exprPath;

			exprPath.watchFunction.newValue = ops.value;
			exprPath.apply([exprPath.watchFunction]);

			// TODO: freeNodeGroups() could be skipped if we updated ExprPath.apply() to never marked them as rendered.
			exprPath.freeNodeGroups();

			if (trackModified)
				modified.add(...exprPath.getNodes());
		}

		// Selectively update NodeGroups created by array.map()
		else {
			for (let arrayOp of ops) {
				if (trackModified && arrayOp.deleteCount)
					modified.add(
						...exprPath.nodeGroups.slice(arrayOp.index, arrayOp.index + arrayOp.deleteCount).map(ng => ng.getNodes()).flat()
					);

				exprPath.applyArrayOp(arrayOp);

				if (trackModified && arrayOp.items.length) {
					let nodes = exprPath.nodeGroups.slice(arrayOp.index, arrayOp.index + arrayOp.items.length).map(ng => ng.getNodes()).flat();
					for (let node of nodes)
						modified.add(node);
				}
			}
		}
	}

	rootNg.exprsToRender = new Map(); // clear

	if (trackModified)
		return [...modified];
}

Globals.watch = true;

export function renderUnwatched(callback) {
	Globals.watch = false;
	callback();
	Globals.watch = true;
}

class WatchOp {}

export class ArraySpliceOp extends WatchOp {

	/**
	 * Represents a splice operation (insertion, deletion, or replacement of elements)
	 * to be applied to an array during rendering.
	 *
	 * @param array {Array} The array affected by the splice operation.
	 * @param index {int} The starting index of the splice operation.
	 * @param deleteCount {int} The number of elements to delete from the array.
	 * @param items {Array} The elements to insert into the array at the starting index. */
	constructor(array, index, deleteCount, items=[]) {
		super();
		//#IFDEV
		assert(Array.isArray(array));
		//#ENDIF
		this.array = array;
		this.index = index*1;
		this.deleteCount = deleteCount;
		this.items = items;
	}
}

class ValueOp extends WatchOp {
	constructor(value) {
		super();
		this.value = value;
	}
}

class WholeArrayOp extends WatchOp {
	constructor(array, value) {
		super();
		//#IFDEV
		assert(Array.isArray(array));
		//#ENDIF
		this.array = array;
		this.value = value;
	}
}