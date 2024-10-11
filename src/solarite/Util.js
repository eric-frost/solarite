let Util = {

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

		let tagName = root.tagName.toLowerCase();
		for (let child of style.childNodes) {
			if (child.nodeType === 3) {
				let oldText = child.textContent;
				let newText = oldText.replace(/:host(?=[^a-z0-9_])/gi, tagName + '[data-style="' + styleId + '"]')
				if (oldText !== newText)
					child.textContent = newText;
			}
		}
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
	 * Is it an array and a path that can be evaluated by delve() ?
	 * @param arr {Array|*}
	 * @returns {boolean} */
	isPath(arr) {
		return Array.isArray(arr) && typeof arr[0] === 'object' && !arr.slice(1).find(p => typeof p !== 'string' && typeof p !== 'number');
	},

	/**
	 * Find NodeGroups that had their nodes removed and add those nodes to a Fragment so
	 * they're not lost forever and the NodeGroup's internal structure is still consistent.
	 * This saves all of a NodeGroup's nodes in order, so that nextChildNode still works.
	 * This is necessary because a NodeGroup normally only stores the first and last node.
	 * Called from ExprPath.apply().
	 * @param oldNodeGroups {NodeGroup[]}
	 * @param oldNodes {Node[]} */
	saveOrphans(oldNodeGroups, oldNodes) {
		let oldNgMap = new Map();
		for (let ng of oldNodeGroups) {
			oldNgMap.set(ng.startNode, ng)

			// TODO: Is this necessary?
			// if (ng.parentPath)
			// 	ng.parentPath.clearNodesCache();
		}

		for (let i=0, node; node = oldNodes[i]; i++) {
			let ng;
			if (!node.parentNode && (ng = oldNgMap.get(node))) {
				//ng.nodesCache = [];
				let fragment = document.createDocumentFragment();
				let endNode = ng.endNode;
				while (node !== endNode) {
					fragment.append(node);
					//ng.nodesCache.push(node);
					i++;
					node = oldNodes[i];
				}
				fragment.append(endNode);
				//ng.nodesCache.push(endNode);
			}
		}
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



let div = document.createElement('div');
export {div}

let isEvent = attrName => attrName.startsWith('on') && attrName in div;
export {isEvent};


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
export function camelToDashes(str) {
	// Convert any capital letter that is preceded by a lowercase letter or number to lowercase and precede with a dash.
	str = str.replace(/([a-z0-9])([A-Z])/g, '$1-$2');

	// Convert any capital letter that is followed by a lowercase letter or number to lowercase and precede with a dash.
	str = str.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2');

	// Convert any number that is preceded by a lowercase or uppercase letter to be preceded by a dash.
	str = str.replace(/([a-zA-Z])([0-9])/g, '$1-$2');

	// Convert all the remaining capital letters to lowercase.
	return str.toLowerCase();
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


/**
 * TODO: Turn this into a class because it has internal state.
 * TODO: Don't break on 3<a inside a <script> or <style> tag.
 * @param html {?string} Pass null to reset context.
 * @returns {string} */
export function htmlContext(html) {
	if (html === null) {
		state = {...defaultState};
		return state.context;
	}
	for (let i = 0; i < html.length; i++) {
		const char = html[i];
		switch (state.context) {
			case htmlContext.Text:
				if (char === '<' && html[i+1].match(/[a-z!]/i)) { // Start of a tag or comment.
					// if (html.slice(i, i+4) === '<!--')
					// 	state.context = htmlContext.Comment;
					// else
						state.context = htmlContext.Tag;
					state.buffer = '';
				}
				break;
			case htmlContext.Tag:
				if (char === '>') {
					state.context = htmlContext.Text;
					state.quote = null;
					state.buffer = '';
				} else if (char === ' ' && !state.buffer) {
					// No attribute name is present. Skipping the space.
					continue;
				} else if (char === ' ' || char === '/' || char === '?') {
					state.buffer = '';  // Reset the buffer when a delimiter or potential self-closing sign is found.
				} else if (char === '"' || char === "'" || char === '=') {
					state.context = htmlContext.Attribute;
					state.quote = char === '=' ? null : char;
					state.buffer = '';
				} else {
					state.buffer += char;
				}
				break;
			case htmlContext.Attribute:
				if (!state.quote && !state.buffer.length && (char === '"' || char === "'"))
					state.quote = char;

				else if (char === state.quote || (!state.quote && state.buffer.length)) {
					state.context = htmlContext.Tag;
					state.quote = null;
					state.buffer = '';
				} else if (!state.quote && char === '>') {
					state.context = htmlContext.Text;
					state.quote = null;
					state.buffer = '';
				} else if (char !== ' ') {
					state.buffer += char;
				}
				break;
		}

	}
	return state.context;
}


htmlContext.Attribute = 'Attribute';
htmlContext.Text = 'Text';
htmlContext.Tag = 'Tag';
//htmlContext.Comment = 'Comment';
let defaultState = {
	context: htmlContext.Text, // possible values: 'TEXT', 'TAG', 'ATTRIBUTE'
	quote: null, // possible values: null, '"', "'"
	buffer: '',
	lastChar: null
};
let state = {...defaultState};






let cacheItems = {};

/**
 * @param item {string}
 * @param initial {*}
 * @returns {*} */
export function cache(item, initial) {
	let result = cacheItems[item];
	if (!result) {
		cacheItems[item] = initial
		result = initial;
	}
	return result;
}



export class WeakCache {

	items = new WeakMap();

	constructor(initial) {
		this.initial = initial;
	}

	get(item) {
		let result = this.items.get(item);
		if (!result) {
			let value = typeof this.initial === 'function' ? this.initial() : this.initial;
			this.items.set(item, value)
			result = this.initial;
		}
		return result;
	}
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