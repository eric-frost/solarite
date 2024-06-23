import {getObjectId} from "../redcomponent/hash.js";
import Template from "../redcomponent/Template.js";

/**
 * Convert obj to a non-cyclic form that can be given to JSON.serialize.
 * This is useful for creating a string that represents a hash of all the deep values of an object.
 *
 * One instance of a node always has the same hash, even if its attributes/children have changed.
 *
 * TODO: Could memoize be faster if given an old version of the same object, and it only finds the differences?
 * Or if we inline getObjectId()
 *
 * @param obj {Object|Array|function|Node}
 * @param seenMap Used internally.
 * @param idCounter Used internally.
 * @returns {{}|*|string} */
export function memoize(obj, seenMap = new Map(), idCounter = {value: 0}) {

	// If obj is a Node, Element, or Window, we treat it specially
	if (obj?.nodeType) { // Benchmarking shows this is faster than "instanceof Node"
		let nodeId = getObjectId(obj);
		return `&N:${nodeId}`;
	}

	// TODO: Should I instead use id's to keep track of functions?
	let type = typeof obj

	if (obj && type === 'object') {
		if (seenMap.has(obj))
			return `&O:${seenMap.get(obj)}`;

		else {
			seenMap.set(obj, idCounter.value++);
			if (typeof obj.memoize === 'function')
				return obj.memoize();

			// We iterate through the keys of an object because an object may have changed since the last time we saw it.
			const serializedObj = {};
			for (let key in obj)
				serializedObj[key] = memoize(obj[key], seenMap, idCounter);
			return serializedObj;
		}
	} else if (type === 'function')
		//return `&F:${obj}` // String version of function.  This version fails the loop.eventBindings test.
		return `&F:${getObjectId(obj)}`; // Memory reference to function.  this makes it twice as slow!

	else
		return obj;
}


function fnv1a(...data) {
	let hash = 0x811c9dc5; // FNV offset basis
	for (let i = 0; i < data.length; i++) {
		hash ^= data[i]; // XOR
		hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24); // FNV prime multiplication
	}
	return hash >>> 0; // Convert to 32-bit unsigned integer
}

const FNV_PRIME_64 = BigInt("1099511628211");
const OFFSET_BASIS_64 = BigInt("14695981039346656037");
function fnv1a_64bit(...data) {
	let hash = OFFSET_BASIS_64;
	for (let i = 0; i < data.length; i++) {
		hash ^= data[i]; // XOR
		//	hash = BigInt.asUintN(64, hash*FNV_PRIME_64);
	}
	return hash;
}


// Faster than memoize
export function hashObject(obj) {
	let combinedData = (0);
	if (obj === null)
		return combinedData;

	if (Array.isArray(obj)) {
		for (let i=(0); i<obj.length; i++) {
			let v = hashObject(obj[i])
			combinedData = fnv1a(combinedData, i, v);
		}
	}

	else if (typeof obj === 'object') {
		let i = (0);
		for (const key in obj) {
			let k = getObjectId3(key)
			let v = hashObject(obj[key])
			combinedData = fnv1a(combinedData, i, k, v);
			i++
		}
	}
	else if (typeof obj === 'number')
		return (obj)
	else if (typeof obj === 'string')
		return getObjectId3(obj)
	else
		return getObjectId2(obj);

	return combinedData;
}

// TODO: Use this number instead as the high bits for getObjectId2?
let lastObjectId2 = (1_010_101_101); // Big enough to not easily not collide with the space of unhashed numbers.
let objectIds2 = new Map();

export function getObjectId2(obj) {
	let result = objectIds2.get(obj);
	if (!result) {
		result = (lastObjectId2++); // convert to string, store in result, then add 1 to lastObjectId.
		objectIds2.set(obj, result)
	}
	return result;
}


let objectIds3 = {};

export function getObjectId3(obj) {
	// if (typeof obj === 'string') {
	// 	let l = obj.length;
	// 	if (l < 512) { // Faster than getObjectId3.  512 was picked randomly and has not been benchmarked.
	// 		let result = 1;
	// 		for (let i=0; i < l; i++)
	// 			result ^= obj.charCodeAt(i) << (i%16);
	// 		return result
	// 	}
	// }


	let result = objectIds3[obj];
	if (!result) {
		result = (lastObjectId2++); // convert to string, store in result, then add 1 to lastObjectId.
		objectIds3[obj] = result
	}
	return result;
}


let hash64Cache = new WeakMap();
export {hash64Cache};

// 25% slower than 32-bit version but still faster than memoize+JSON.stringify()
// TODO: hardcoded hash values for true and false?
export function hashObject64(obj) {
	let resultLow = 0;
	let resultHigh = 0;

	if (obj instanceof Template)
		obj = [obj.htmlId, ...obj.exprs]

	if (obj === null)
		return [0, 0];

	else if (Array.isArray(obj)) {
		let result
		//  = hash64Cache.get(obj);
		// if (!result) {
		for (let i = (0); i < obj.length; i++) {
			let [vLow, vHigh] = hashObject64(obj[i])
			resultLow = fnv1a(resultLow, i, vLow)
			resultHigh = fnv1a(resultHigh, vHigh)
		}
		result = [resultLow, resultHigh]
		//	hash64Cache.set(obj, result)
		//}
		return result;
	}

	else if (typeof obj === 'object') {
		let result
		//  	= hash64Cache.get(obj);
		// if (!result) {
		let i = (0);
		for (const key in obj) {
			let k = getObjectId3(key)
			let [vLow, vHigh] = hashObject64(obj[key])
			resultLow = fnv1a(resultLow, i, vLow)
			resultHigh = fnv1a(resultHigh, k, vHigh)
			i++
		}
		result = [resultLow, resultHigh]
		//	hash64Cache.set(obj, result)
		//}

		return result;
	}
	else if (typeof obj === 'number')
		return [0, obj]
	else if (typeof obj === 'string')
		return [0, getObjectId3(obj)]
	else
		return [0, getObjectId2(obj)];
}




// Perforamnce varies greatly.
export function memoize2(obj) {

	if (obj === null)
		return 'null';

	switch (obj?.constructor) {
		case Function:
		case Node:
			return getObjectId(obj);
		case Array:
			return '[' + obj.map(item => memoize2(item)) + ']'
		case Object:
			let result = '{';
			for (let key in obj) {
				//key = key.match(/[^A-Z0-9_]/i) ? JSON.stringify(key) : key;
				key = (key.includes(':')) ? JSON.stringify(key) : key;
				result += `${key}:${memoize2(obj[key])}`
			}
			return result +'}';
		default:
			return JSON.stringify(obj);
	}
}

// as fast as memoize2, or faster.
export function memoize3(obj) {

	if (obj === null)
		return 'null';

	let type = typeof obj;
	if (Array.isArray(obj))
		return '[' + obj.map(item => memoize2(item)) + ']'
	if (obj instanceof Node || type === 'function')
		return getObjectId(obj);
	if (type=== 'object') {
		let result = '{';
		for (let key in obj) {
			//key = key.match(/[^A-Z0-9_]/i) ? JSON.stringify(key) : key;
			key = (key.includes(':')) ? JSON.stringify(key) : key;
			result += `${key}:${memoize2(obj[key])}`
		}
		return result +'}';
	}
	return JSON.stringify(obj);
}




// as fast as memoize2, or faster.
export function memoize4(obj, seenMap=new Map(), idCounter={value: 0}) {
	let result;
	if (obj instanceof Template) {
		if (obj.exprs.length === 1)
			return obj.htmlId + '\f' + memoize4(obj.exprs[0]) // \f is the "Form feed" control character, unlikely to be usedin regular text.

		let exprLength = obj.exprs.length;
		result = new Array(exprLength + 1);
		result[0] = obj.htmlId;
		let exprs = obj.exprs;
		for (let i = 0; i < exprLength; i++)
			result[i + 1] = memoize4(exprs[i])
	}

	else if (obj === null)
		result = 'null';

	else if (Array.isArray(obj)) {
		if (seenMap.has(obj))
			result = `&A${seenMap.get(obj)}`;
		else {
			seenMap.set(obj, idCounter.value++);
			result = '[' + obj.map(item => memoize2(item)) + ']'
		}
	}
	else if (obj instanceof Node || typeof obj === 'function')
		result = getObjectId(obj);

	else if (typeof obj=== 'object') {
		if (seenMap.has(obj))
			result = `&O${seenMap.get(obj)}`;

		else {
			seenMap.set(obj, idCounter.value++);

			// // String contact approach.
			// result = '{';
			// for (let key in obj) {
			// 	//key = key.match(/[^A-Z0-9_]/i) ? JSON.stringify(key) : key;
			// 	key = (key.includes(':')) ? JSON.stringify(key) : key;
			// 	result += `${key}:${memoize2(obj[key])}`
			// }
			// result = result + '}';

			// Buffer approach.  Seems slightly faster.
			let keys = Object.keys(obj);
			let buffer = new Array(keys.length) + 2;
			buffer[0] = '{'
			buffer[buffer.length-1] = '}'
			let idx = 1;
			for (let key of keys) {
				//key = key.match(/[^A-Z0-9_]/i) ? JSON.stringify(key) : key;
				key = (key.includes(':')) ? JSON.stringify(key) : key;
				buffer[idx] = `${key}:${memoize2(obj[key])},`
				idx++;
			}
			result = buffer.join('');
		}
	}
	else
		result = JSON.stringify(obj);


	return result;
}





// Takes half as long as just calling JSON.serialize!
function containsFunction(obj) {
	// Base case: if the object itself is a function
	let type = typeof obj;
	if (type === 'function') {
		return true;
	}

	// If the object is an object or array, recursively search its properties
	if (type === 'object' && obj !== null)
		for (let key in obj)
			if (containsFunction(obj[key]))
				return true;

	// If none of the properties are functions, return false
	return false;
}
