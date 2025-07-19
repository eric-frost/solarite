import Globals from "./Globals.js";
import delve from "./delve.js";

let Util = {

	bindId(root, el) {
		let id = el.getAttribute('data-id') || el.getAttribute('id');
		if (id) { // If something hasn't removed the id.

			// Don't allow overwriting existing class properties if they already have a non-Node value.
			if (root[id] && !(root[id] instanceof Node))
				throw new Error(`${root.constructor.name}.${id} already has a value.  ` +
					`Can't set it as a reference to <${el.tagName.toLowerCase()} id="${id}">`);

			delve(root, id.split(/\./g), el);
		}
	},

	/**
	 * @param style {HTMLStyleElement}
	 * @param root {HTMLElement} */
	bindStyles(style, root) {
		let styleId = root.getAttribute('data-style');
		if (!styleId) {
			// Keep track of one style id for each class.
			// TODO: Put this outside the class in a map, so it doesn't conflict with static properties.
			if (!root.constructor.styleId)
				root.constructor.styleId = 1;
			styleId = root.constructor.styleId++;

			root.setAttribute('data-style', styleId)
		}

		// Replace ":host" with "tagName[data-style=...]" in the css.
		let tagName = root.tagName.toLowerCase();
		for (let child of style.childNodes) {
			if (child.nodeType === 3) {
				let oldText = child.textContent;
				let newText = oldText.replace(/:host(?=[^a-z0-9_])/gi, `${tagName}[data-style="${styleId}"]`)
				if (oldText !== newText)
					child.textContent = newText;
			}
		}
	},

	/**
	 * Use an array as the value of a map, appending to it when we add.
	 * Used by watch.js.
	 * @param map {Map|WeakMap|Object}
	 * @param key
	 * @param value */
	mapArrayAdd(map, key, value) {
		let result = map.get(key);
		if (!result) {
			result = [value];
			map.set(key, result);
		}
		else
			result.push(value);
	},

	/**
	 * Convert a Proper Case name to a name with dashes.
	 * Dashes will be placed between letters and numbers.
	 * If there are multiple consecutive capital letters followed by another chracater, a dash will be placed before the last capital letter.
	 * @param str {string}
	 * @return {string}
	 *
	 * @example
	 * 'ProperName' => 'proper-name'
	 * 'HTMLElement' => 'html-element'
	 * 'BigUI' => 'big-ui'
	 * 'UIForm' => 'ui-form'
	 * 'A100' => 'a-100' */
	camelToDashes(str) {
		// Convert any capital letter that is preceded by a lowercase letter or number to lowercase and precede with a dash.
		str = str.replace(/([a-z0-9])([A-Z])/g, '$1-$2');

		// Convert any capital letter that is followed by a lowercase letter or number to lowercase and precede with a dash.
		str = str.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2');

		// Convert any number that is preceded by a lowercase or uppercase letter to be preceded by a dash.
		str = str.replace(/([a-zA-Z])([0-9])/g, '$1-$2');

		// Convert all the remaining capital letters to lowercase.
		return str.toLowerCase();
	},

	/**
	 * Converts a string written in kebab-case to camelCase.
	 *
	 * @param {string} str - The input string written in kebab-case.
	 * @return {string} - The resulting camelCase string.
	 *
	 * @example
	 * dashesToCamel('example-string') // Returns 'exampleString'
	 * dashesToCamel('another-example-test') // Returns 'anotherExampleTest' */
	dashesToCamel(str) {
		return str.replace(/-([a-z])/g, g => g[1].toUpperCase());
	},


	/**
	 * A generator function that recursively traverses and flattens a value.
	 *
	 * - If the input is an array, it recursively traverses and flattens the array.
	 * - If the input is a function, it calls the function, replaces the function
	 *   with its result, and flattens the result if necessary. It will recursively
	 *   call functions that return other functions.
	 * - Otherwise it yields the value as is.
	 *
	 * This function does not create a new array for the flattened values. Instead,
	 * it lazily yields each item as it is encountered. This can be more memory-efficient
	 * for large or deeply nested structures.
	 *
	 * @param {any} value - The value to flatten. Can be an array, object, function, or primitive.
	 * @yields {any} - The next item in the flattened structure.
	 *
	 * @example
	 * const complexArray = [
	 *     1,
	 *     [2, () => 3, [4, () => [5, 6]], { a: 'object' }],
	 *     () => () => 7,
	 *     () => [() => 8, 9],
	 * ];	 *
	 * for (const item of flatten(complexArray))
	 *     console.log(item);  // Outputs: 1, 2, 3, 4, 5, 6, { a: 'object' }, 7, 8, 9
	 */
	*flatten(value) {
		if (Array.isArray(value)) {
			for (const item of value) {
				yield* Util.flatten(item);  // Recursively flatten arrays
			}
		} else if (typeof value === 'function') {
			const result = value();
			yield* Util.flatten(result);  // Recursively flatten the result of a function
		} else
			yield value;  // Yield primitive values as is
	},

	/**
	 * Get the value of an input as the most appropriate JavaScript type.
	 * @param node {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLDivElement}
	 * @return {string|string[]|number|[]|File[]|Date|boolean} */
	getInputValue(node) {
		// .type is a built-in DOM property
		if (node.type === 'checkbox' || node.type === 'radio')
			return node.checked; // Boolean
		if (node.type === 'file')
			return [...node.files]; // FileList
		if (node.type === 'number' || node.type === 'range')
			return node.valueAsNumber; // Number
		if (node.type === 'date' || node.type === 'time' || node.type === 'datetime-local')
			return node.valueAsDate; // Date Object
		if (node.type === 'select-multiple') // <select multiple>
			return [...node.selectedOptions].map(option => option.value); // Array of Strings

		return node.value; // String
	},

	/**
	 * @param el {HTMLElement}
	 * @param prop {string}
	 * @returns {boolean} */
	isHtmlProp(el, prop) {
		let key = el.tagName + '.' + prop;
		let result = Globals.htmlProps[key];
		if (result === undefined) { // Caching just barely makes this slightly faster.
			let proto = Object.getPrototypeOf(el);

			// Find the first HTMLElement that we inherit from (not our own classes)
			while (proto) {
				const ctorName = proto.constructor.name;
				if (ctorName.startsWith('HTML') && ctorName.endsWith('Element'))
					break
				proto = Object.getPrototypeOf(proto);
			}
			Globals.htmlProps[key] = result = (proto
				? !!Object.getOwnPropertyDescriptor(proto, prop)?.set
				: false);
		}
		return result;
	},

	/**
	 * Is it an array and a path that can be evaluated by delve() ?
	 * We allow the first element to be null/undefined so binding can report errors.
	 * @param arr {Array|*}
	 * @returns {boolean} */
	isPath(arr) {
		return Array.isArray(arr) && arr.length >=2  // An array of at least two elements.
			&& (typeof arr[0] === 'object' || arr[0] === undefined) // Where the first element is an object, null, or undefined.
			&& !arr.slice(1).find(p => typeof p !== 'string' && typeof p !== 'number'); // Path 1..x is only numbers and strings.
	},

	isFalsy(val) {
		return val === undefined || val === false || val === null;
	},

	isPrimitive(val) {
		return typeof val === 'string' || typeof val === 'number'
	},

	/**
	 * If val is a function, evaluate it recursively until the result is not a function.
	 * If it's an array or an object, convert it to Json.
	 * If it's a Date, format it as Y-m-d H:i:s
	 * @param val
	 * @returns {string|number|boolean} */
	makePrimitive(val) {
		if (typeof val === 'function')
			return Util.makePrimitive(val());
		else if (val instanceof Date)
			return val.toISOString().replace(/T/, ' ');
		else if (Array.isArray(val) || typeof val === 'object')
			return ''; // JSON.stringify(val);
		return val;
	},

	/**
	 * Remove nodes from the beginning and end that are not:
	 * 1.  Elements.
	 * 2.  Non-whitespace text nodes.
	 * @param nodes {Node[]|NodeList}
	 * @returns {Node[]} */
	trimEmptyNodes(nodes) {
		const shouldTrimNode = node =>
			node.nodeType !== Node.ELEMENT_NODE &&
			(node.nodeType !== Node.TEXT_NODE || node.textContent.trim() === '');

		// Convert nodeList to an array for easier manipulation
		const result = [...nodes]

		// Trim from the start
		while (result.length > 0 && shouldTrimNode(result[0]))
			result.shift();

		// Trim from the end
		while (result.length > 0 && shouldTrimNode(result[result.length - 1]))
			result.pop();

		return result;
	}
};

export default Util;



let isEvent = attrName => attrName.startsWith('on') && attrName in Globals.div;
export {isEvent};


export function dashesToCamel(str) {
	return str.replace(/-([a-z])/g, g => g[1].toUpperCase());
}





/**
 * Returns true if they're the same.
 * @param a
 * @param b
 * @returns {boolean} */
export function arraySame(a, b) {
	let aLength = a.length;
	if (aLength !== b.length)
		return false;
	for (let i=0; i<aLength; i++)
		if (a[i] !== b[i])
			return false;
	return true; // the same.
}





// For debugging only
//#IFDEV
export function setIndent(items, level=1) {
	if (typeof items === 'string')
		items = items.split(/\r?\n/g)

	return items.map(str => {
		if (level > 0)
			return '  '.repeat(level) + str;
		else if (level < 0)
			return str.replace(new RegExp(`^  {0,${Math.abs(level)}}`), '');
		return str;
	})
}

export function nodeToArrayTree(node, callback=null) {
	if (!node) return [];

	let result = [];

	if (callback)
		result.push(...callback(node))

	if (node.nodeType === 1) {
		let attrs = Array.from(node.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ');
		let openingTag = `<${node.nodeName.toLowerCase()}${attrs ? ' ' + attrs : ''}>`;

		let childrenArray = [];
		for (let child of node.childNodes) {
			let childResult = nodeToArrayTree(child, callback);
			if (childResult.length > 0) {
				childrenArray.push(childResult);
			}
		}

		//let closingTag = `</${node.nodeName.toLowerCase()}>`;

		result.push(openingTag, ...childrenArray);
	} else if (node.nodeType === 3) {
		result.push("'"+node.nodeValue+"'");
	}

	return result;
}


export function flattenAndIndent(inputArray, indent = "") {
	let result = [];

	for (let item of inputArray) {
		if (Array.isArray(item)) {
			// Recursively handle nested arrays with increased indentation
			result = result.concat(flattenAndIndent(item, indent + "  "));
		} else {
			result.push(indent + item);
		}
	}

	return result;
}
//#ENDIF