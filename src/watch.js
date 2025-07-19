/**
 *
 *
 * TODO:
 * 1. Have option to automatically render?
 *
 * Limitations:
 * 1.  If we use one path to get a property during render, but a different path to set it, it will not be marked for rendering.
 *
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
import Util from "./Util.js";
import {assert} from "./Errors.js";

let unusedArg = Symbol('unusedArg');



function removeProxy(obj) {
	if (obj && obj.$removeProxy)
		return obj.$removeProxy;
	return obj;
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


	// Mark NodeGroups of expressionpaths as freed.
	// for (let [exprPath, ops] of rootNg.exprsToRender) {
	// 	if (ops instanceof WholeArrayOp) {}
	// 	else if (ops instanceof ValueOp) {}
	// 	else {} // Array Slice Op
	// }

	for (let [exprPath, ops] of rootNg.exprsToRender) {

		// Reapply the whole expression.
		if (ops instanceof WholeArrayOp) {

			// So it doesn't use the old value inside the map callback in the get handler above.
			// TODO: Find a more sensible way to pass newValue.
			ops.markNodeGroupsAvailable(exprPath);
			exprPath.watchFunction.newValue = ops.array;
			exprPath.apply([exprPath.watchFunction], false);

			//exprPath.freeNodeGroups();

			if (trackModified)
				modified.add(...exprPath.getNodes());
		}

			// Update a single value in a map callback
		// TODO: Why is this not an array of ops?
		else if (ops instanceof ValueOp) {

			// TODO: I need to only free node groups of watched expressions.
			exprPath.watchFunction.newValue = ops.value;
			exprPath.apply([exprPath.watchFunction], false); // False to not free nodeGroups.

			//exprPath.freeNodeGroups();

			if (trackModified)
				modified.add(...exprPath.getNodes());
		}

		// Selectively update NodeGroups created by array.map()
		else {

			for (let i = 0; i < ops.length; i++) {
				let op = ops[i];
				let nextOp = ops[i + 1];

				// If we have two Adjacent ArraySpliceOps that swap eachother's items,
				// then be fast by directly swap their DOM nodes.
				if (nextOp instanceof ArraySpliceOp && nextOp.deleteCount === 1 && nextOp.items.length === 1
					&& op instanceof ArraySpliceOp && op.deleteCount === 1 && op.items.length === 1
					&& nextOp.array[nextOp.index] === op.firstDeleted
					&& op.array[op.index] === nextOp.firstDeleted
				) {

					let nga = exprPath.nodeGroups[op.index];
					let ngb = exprPath.nodeGroups[nextOp.index];

					// Swap the nodegroup nga and ngb node positions
					let nextA = nga.endNode.nextSibling;
					let nextB = ngb.endNode.nextSibling;
					for (let node of nga.getNodes()) // TODO: Manually iterate instead of calling getNodes().
						node.parentNode.insertBefore(node, nextB);
					for (let node of ngb.getNodes())
						node.parentNode.insertBefore(node, nextA);

					/*
					// replaceWidth version:
					let nextB = ngb.endNode.nextSibling;

					let ngaNodes = nga.getNodes();
					let ngbNodes = ngb.getNodes();
					let len = Math.min(ngaNodes.length, ngbNodes.length);

					for (let i=0; i< len; i++)
						ngaNodes[i].replaceWith(ngbNodes[i]);
					// TODO: Insert additional nodes here.
					for (let node of nga.getNodes())
						nextB.parentNode.insertBefore(node, nextB);
					*/

					exprPath.nodeGroups[op.index] = ngb;
					exprPath.nodeGroups[nextOp.index] = nga;

					if (trackModified) {
						nga.getNodes().map(n => modified.add(n));
						ngb.getNodes().map(n => modified.add(n));
					}
					i++;// skip next op
				}

				// ArraySpliceOp
				else { // (op instanceof ArraySpliceOp) {

					if (trackModified && op.deleteCount)
						modified.add(
							...exprPath.nodeGroups.slice(op.index, op.index + op.deleteCount).map(ng => ng.getNodes()).flat()
						);

					op.markNodeGroupsAvailable(exprPath);
					exprPath.applyArrayOp(op);

					if (trackModified && op.items.length) {
						exprPath.nodeGroups.slice(op.index, op.index + op.items.length)
							.map(ng => ng.getNodes())
							.flat()
							.map(n => modified.add(n));
					}
				}
			}
		}
	}
	rootNg.exprsToRender = new Map(); // clear

	if (trackModified)
		return [...modified];
}













/**
 * Passed as an argument when creating a new Proxy().
 * Handles getting and setting properties on the proxied object. */
class ProxyHandler {

	/** @type {Object<string, [Proxy, ProxyHandler]>} Proxies for child properties. */
	proxies = {}

	/** @type Set<ExprPath> ExprPaths that will need to be re-rendered when this variable is modified. */
	exprPaths = new Set();

	/**
	 * ExprPaths that will need to be re-rendered when one of this variable's primitive properties is modified,
	 * since primitives can't have their own ProxyHandler.
	 * @type {Object<prop:string, affected:Set<ExprPath>>} */
	childExprPaths = {};


	constructor(root, value) {

		/** @type {Object} The top level object being proxied. */
		this.root = root;

		/** @type {*} the value found when starting at root and following the path? */
		this.value = value;

		/** @type {RootNodeGroup} Cached, to save time on lookups. */
		this.rootNodeGroup = null;
	}

	/**
	 * Get a cached proxy of a sub-property.
	 * @param prop {string}
	 * @param val {*}
	 * @returns {[Proxy, ProxyHandler]} */
	getProxyandHandler(prop, val) {
		let result = this.proxies[prop];
		if (!result) {
			let handler = new ProxyHandler(this.root, this.value);
			result = this.proxies[prop] = [new Proxy(val, handler), handler];
		}
		return result;
	}

	/**
	 * We override get() so we can mark which ExprPaths read from each variable in the hierarchy.
	 * Then later when we call set on a variable, we can see which ExprPaths use it, and can mark them to be re-rendered.
	 * @param obj
	 * @param prop {string}
	 * @param receiver
	 * @returns {*|Proxy|(function(*): function(): any)} */
	get(obj, prop, receiver) {

		if (prop === '$removeProxy')
			return obj;

		// if (prop === 'items')
		// 	debugger;

		const result = (obj === receiver)
			? this.value // top-level value.
			: Reflect.get(obj, prop, receiver); // avoid infinite recursion.

		// We override the map() function the first time render() is called.
		// But it's not re-overridden when we call renderWatched()
		if (Array.isArray(obj)) {

			if (prop === 'map') {

				const self = this;

				// This outer function is so the ExprPath calls it as a function,
				// instead of it being evaluated immediately when the Template is created.
				// This allows ExprPath.apply() to set the Globals.currentExprPath before evaluating further.
				return (callback) =>

					// This is the new map function.
					function mapFunction() {

						// Save the ExprPaths that called the array used by .map()
						const currExprPath = Globals.currentExprPath;
						if (currExprPath)
							self.exprPaths.add(currExprPath);

						// Apply the map function.
						const newObj = mapFunction.newValue || obj;
						Globals.currentExprPath.mapCallback = callback;
						// If new Proxy fails b/c newObj isn't an object, make sure the expression is a function.
						// TODO: Find a way to warn about this automatically.
						let p = new Proxy(newObj, self);
						return Array.prototype.map.call(p, callback);
					}
			}

			else if (prop === 'push' || prop==='pop' || prop === 'splice') {
				const rootNg = Globals.nodeGroups.get(this.root);
				return new WatchedArray(rootNg, obj, this.exprPaths)[prop];
			}
		}


		// Save the ExprPath that's currently accessing this variable.
		const currExprPath = Globals.currentExprPath;

		// Accessing a sub-property
		if (result && typeof result === 'object') {
			let [proxiedResult, handler] = this.getProxyandHandler(prop, result);  // Clone this handler and append prop to the path.

			if (currExprPath && prop !== 'constructor')
				handler.exprPaths.add(currExprPath);

			return proxiedResult;
		}
		else {
			if (currExprPath && prop !== 'constructor') {

				// We can't have Proxies on primitive types,
				// So we store the affected expressions in the parent Proxy.
				if (!this.childExprPaths[prop])
					this.childExprPaths[prop] = new Set([currExprPath]);
				else
					this.childExprPaths[prop].add(currExprPath);
			}

			return result;
		}
	}

	// TODO: Will fail for attribute w/ a value having multiple ExprPaths.
	// TODO: This won't update a component's expressions.
	set(obj, prop, val, receiver) {

		val = removeProxy(val);

		// 1. Add to the list of ExprPaths to re-render.
		if (!this.rootNodeGroup)
			this.rootNodeGroup = Globals.nodeGroups.get(this.root);
		const rootNg = this.rootNodeGroup

		// New: // TODO: Should I instead be checking if the old value of val is a primitive?
		let isPrimitive = !val || typeof val !== 'object';
		let exprPaths = isPrimitive
			? this.childExprPaths[prop] || []
			: this.getProxyandHandler(prop, val)[1].exprPaths;

		const isArray = Array.isArray(obj);
		for (let exprPath of exprPaths) {

			if (isArray) {
				if (Number.isInteger(+prop)) {
					const exprsToRender = rootNg.exprsToRender.get(exprPath);

					// If we're not re-rendering the whole thing.
					if (!(exprsToRender instanceof WholeArrayOp))
						// TODO: Inline this for performance
						Util.mapArrayAdd(rootNg.exprsToRender, exprPath, new ArraySpliceOp(obj, prop, 1, [val]));
				}

				// Reapply the whole expression.
				else
					rootNg.exprsToRender.set(exprPath, new WholeArrayOp(val));
			}
			else
				rootNg.exprsToRender.set(exprPath, new ValueOp(val));
		}

		// 2. Set the value.
		if (obj === receiver)
			this.value = val; // top-level value.
		else // Set the value while avoiding infinite recursion.
			Reflect.set(obj, prop, val, receiver);

		// Value changed, so reset cached proxy.
		if (val && typeof val === 'object')
			delete this.proxies[prop];

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
	Object.defineProperty(root, field, {
		get: () => handler.get(root, field, root),
		set: (val) => handler.set(root, field, val, root)
	});
}
export {watch};


/**
 * Wrap an array so that functions that modify the array are intercepted.
 * We then add ArraySpliceOp's to the list of ops to run for each affected ExprPath.
 * When renderWatched() is called it then applies those ops to the NodeGroups created by the map() function. */
class WatchedArray {

	/**
	 * @param array {Array}
	 * @param rootNg {RootNodeGroup}
	 * @param exprPaths {ExprPath[]|Set<ExprPath>} Expression paths that use this array. */
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
		// Mark all expressions affected by the array function to be re-rendered
		for (let exprPath of this.exprPaths) {
			let exprsToRender = this.rootNg.exprsToRender.get(exprPath);
			if (!(exprsToRender instanceof WholeArrayOp)) // If we're not already going to re-render the whole array.
				Util.mapArrayAdd(this.rootNg.exprsToRender, exprPath, new ArraySpliceOp(...spliceArgs));
		}

		// Call original array function
		return Array.prototype[func].call(this.array, ...args);
	}
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

		// Save the first item deleted so we can see if this should be turned into an ArraySwapOp later.
		this.firstDeleted = deleteCount===1 ? array[index] : undefined;
	}

	markNodeGroupsAvailable(exprPath) {
		if (this.deleteCount > 0) {
			let count = this.index+this.deleteCount;
			for (let i=this.index; i<count; i++) {
				let oldNg = exprPath.nodeGroups[i];
				exprPath.nodeGroupsAttachedAvailable.add(oldNg.exactKey, oldNg);
				exprPath.nodeGroupsAttachedAvailable.add(oldNg.closeKey, oldNg);
			}
		}
	}
}

class ValueOp extends WatchOp {
	constructor(value) {
		super();
		this.value = value;
	}

	markNodeGroupsAvailable(exprPath) {}
}

// We detect such ops but we never need to instantiate this class.
// class ArraySwapOp extends WatchOp {
// 	constructor(array, index1, index2) {
// 		super();
// 		//#IFDEV
// 		assert(Array.isArray(array));
// 		//#ENDIF
// 		this.array = array;
// 		this.index1 = index1;
// 		this.index2 = index2;
// 	}
// }

class WholeArrayOp extends WatchOp {
	constructor(array, value) {
		super();
		//#IFDEV
		assert(Array.isArray(array));
		//#ENDIF
		this.array = array;
		this.value = value;
	}

	markNodeGroupsAvailable(exprPath) {
		for (let i=0; i<exprPath.nodeGroups.length; i++) {
			let oldNg = exprPath.nodeGroups[i];
			exprPath.nodeGroupsAttachedAvailable.add(oldNg.exactKey, oldNg);
			exprPath.nodeGroupsAttachedAvailable.add(oldNg.closeKey, oldNg);
		}
	}
}