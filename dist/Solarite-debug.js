/**
 * @typedef {Array|function(...*)} Callbacks
 * @property {function(function)} push
 * @property {function()} remove
 * @property {function()} pause
 * @property {function()} resume
 * */


/**
 * A place for functions that have no other home. */
var Util$1 = {

	/**
	 * Create an array-like object that stores a group of callbacks.
	 * Supports all array functions and properties like push() and .length.
	 * Can be called directly.
	 *
	 * @param functions {function[]}
	 * @return {Callbacks|function}
	 *
	 * @example
	 * var c = Util.callback();
	 * var f = () => console.log(3);
	 * c.push(f);
	 * c();
	 * c.remove(f);
	 * c();
	 */
	callback(...functions) {
		var paused = false;

		// Make it callable.  When we call it, call all callbacks() with the given args.
		let result = async function(...args) {
			let result2 = [];
			if (!paused)
				for (let i=0; i<result.length; i++)
					result2.push(result[i](...args));
			return await Promise.all(result2);
		};
		
		// Make it iterable.
		result[Symbol.iterator] = function() {
			let index = 0;
			return {
				next: () => index < result.length
					 ? {value: result[index++], done: false}
					 : {done: true}
			};
		};

		// Use properties from Array
		for (let prop of Object.getOwnPropertyNames(Array.prototype))
			if (prop !== 'length' && prop !== 'constructor')
				result[prop] = Array.prototype[prop];

		result.l = 0; // Internal length
		Object.defineProperty(result, 'length', {
			get() { return result.l },
			set(val) { result.l = val;}
		});

		// Add the remove() function.
		result.remove = func => {
			let idx = result.findIndex(item => item === func);
			if (idx !== -1)
				result.splice(idx, 1);
		};
		result.pause = () => paused = true;

		result.resume = () => paused = false;

		// Add initial functions
		for (let f of functions)
			result.push(f);

		return result;
	},
	


};

/**
 * Follow a path into an object.
 * @param obj {object}
 * @param path {string[]}
 * @param createVal {*}  If set, non-existant paths will be created and value at path will be set to createVal.
 * @return {*} The value, or undefined if it can't be reached. */
function delve(obj, path, createVal = delveDontCreate) {
	let isCreate = createVal !== delveDontCreate;

	let len = path.length;
	if (!obj && !isCreate && len)
		return undefined;

	let i = 0;
	for (let srcProp of path) {

		// If the path is undefined and we're not to the end yet:
		if (obj[srcProp] === undefined) {

			// If the next index is an integer or integer string.
			if (isCreate) {
				if (i < len - 1) {
					// If next level path is a number, create as an array
					let isArray = (path[i + 1] + '').match(/^\d+$/);
					obj[srcProp] = isArray ? [] : {};
				}
			} else
				return undefined; // can't traverse
		}

		// If last item in path
		if (isCreate && i === len - 1)
			obj[srcProp] = createVal;

		// Traverse deeper along destination object.
		obj = obj[srcProp];
		i++;
	}

	return obj;
}

let delveDontCreate = {};

/**
 * There are three ways to create an instance of a Solarite Component:
 * 1.  new ComponentName();                                         // direct class instantiation
 * 2.  this.html = r`<div><component-name></component-name></div>;  // as a child of another RedComponent.
 * 3.  <body><component-name></component-name></body>               // in the Document html.
 *
 * When created via #3, Solarite has no way to pass attributes as arguments to the constructor.  So to make
 * sure we get the correct value via all three paths, we write our constructors according to the following
 * example.  Note that constructor args are embedded in an object, and must be all lower-case because
 * Browsers make all html attribute names lowercase.
 *
 * @example
 * constructor({name, userid=1}={}) {
 *     super();
 *
 *     // Get value from "name" attriute if persent, otherwise from name constructor arg.
 *     this.name = getArg(this, 'name', name);
 *
 *     // Optionally convert the value to an integer.
 *     this.userId = getArg(this, 'userid', userid, ArgType.Int);
 * }
 *
 * @param el {HTMLElement}
 * @param name {string} Attribute name.  Not case-sensitive.
 * @param val {*} Default value to use if attribute doesn't exist.
 * @param type {ArgType|function|*[]}
 *     If an array, use the value if it's in the array, otherwise return undefined.
 *     If it's a function, pass the value to the function and return the result.
 * @return {*} */
function getArg(el, name, val=null, type=ArgType.String) {
	let attrVal = el.getAttribute(name);
	if (attrVal !== null) // If attribute doesn't exist.
		val = attrVal;
		
	if (Array.isArray(type))
		return type.includes(val) ? val : undefined;
	
	if (typeof type === 'function')
		return type(val);
	
	// If bool, it's true as long as it exists and its value isn't falsey.
	if (type===ArgType.Bool) {
		let lAttrVal = typeof val === 'string' ? val.toLowerCase() : val;
		return !['false', '0', false, 0, null, undefined].includes(lAttrVal);
	}
	
	// Attribute doesn't exist
	switch (type) {
		case ArgType.Int:
			return parseInt(val);
		case ArgType.Float:
			return parseFloat(val);
		case ArgType.String:
			return [undefined, null, false].includes(val) ? '' : val+'';
		case ArgType.JSON:
		case ArgType.Eval:
			if (typeof val === 'string' && val.length)
				try {
					if (type === ArgType.JSON)
						return JSON.parse(val);
					else
						return eval(`(${val})`);
				} catch (e) {
					return val;
				}
			else return val;
		default:
			return val;
	}
}

/**
 * @enum */
var ArgType = {
	
	/**
	 * false, 0, null, undefined, '0', and 'false' (case-insensitive) become false.
	 * Anything else, including empty string becomes true.
	 * Empty string is true because attributes with no value should be evaulated as true. */
	Bool: 'Bool',
	
	Int: 'Int',
	Float: 'Float',
	String: 'String',
	
	/**
	 * Parse the string value as JSON.
	 * If it's not parsable, return the value as a string. */
	JSON: 'JSON',
	
	/**
	 * Evaluate the string as JavaScript using the eval() function.
	 * If it can't be evaluated, return the original string. */
	Eval: 'Eval'
};

let lastObjectId = 1>>>0; // Is a 32-bit int faster to increment than JavaScript's Number, which is a 64-bit float?
let objectIds = new WeakMap();

/**
 * @param obj {Object|string|Node}
 * @param prefix
 * @returns {string} */
function getObjectId(obj, prefix=null) {
	
	
	
	//#IFDEV
	// Slower but useful for debugging:
	if (!prefix) {
		if (Array.isArray(obj))
			prefix = 'Array';
		else if (typeof obj === 'function')
			prefix = 'Func';
		else if (typeof obj === 'object')
			prefix = 'Obj';
	}
	//#ENDIF
	
	prefix = prefix || '~\f';
	
	// if (typeof obj === 'function')
	// 	return obj.toString();
	
	let result = objectIds.get(obj);
	if (!result) { // convert to string, store in result, then add 1 to lastObjectId.
		result = prefix+(lastObjectId++); // We use a unique prefix to ensure it doesn't collide w/ strings not from getObjectId()
		objectIds.set(obj, result);
	}
	return result;
}

/**
 * Control how JSON.stringify() handles Nodes and Functions.
 * Normally, we'd pass a replacer() function argument to JSON.stringify() to handle Nodes and Functions.
 * But that makes JSON.stringify() take twice as long to run.
 * Adding a toJSON method globally on these object prototypes doesn't incur that performance penalty. */
let isHashing = true;
function toJSON() {
	//return (isHashing && !Array.isArray(this)) ? getObjectId(this) : this
	return isHashing ? getObjectId(this) : this
}
// Node.prototype.toJSON = toJSON;
// Function.prototype.toJSON = toJSON;


/**
 * Get a string that uniquely maps to the values of the given object.
 * If a value in obj changes, calling getObjectHash(obj) will then return a different hash.
 * This is used by NodeGroupManager to create a hash that represents the current values of a NodeGroup.
 *
 * Relies on the Node and Function prototypes being overridden above.
 *
 * @param obj {*}
 * @returns {string} */
function getObjectHash(obj) {
	
	// Sometimes these get unassigned by Chrome and Brave 119, as well as Firefox, seemingly randomly!
	// The same tests sometimes pass, sometimes fail, even after browser and OS restarts.
	// So we check the assignments on every run of getObjectHash()
	if (Node.prototype.toJSON !== toJSON) {
		Node.prototype.toJSON = toJSON;
		if (Function.prototype.toJSON !== toJSON) // Will it only unmap one but not the other?
			Function.prototype.toJSON = toJSON;
	}
	
	let result;
	isHashing = true;
	try {
		result = JSON.stringify(obj);
	}
	catch(e){
		result = getObjectHashCircular(obj);
	}
	isHashing = false;
	return result;
}

/**
 * Having this separate might help the optimzer for getObjectHash() ?
 * @param obj
 * @returns {string} */
function getObjectHashCircular(obj) {

	//console.log('circular')
	// Slower version that handles circular references.
	// Just adding any callback at all, even one that just returns the value, makes JSON.stringify() twice as slow.
	const seen = new Set();
	return JSON.stringify(obj, (key, value) => {
		if (typeof value === 'object' && value !== null) {
			if (seen.has(value))
				return getObjectId(value);
			seen.add(value);
		}
		return value;
	});
}

//#IFDEV
/*@__NO_SIDE_EFFECTS__*/
function assert(val) {
	if (!val) {
		debugger;
		throw new Error('Assertion failed: ' + val);
	}
}
//#ENDIF

var Globals = {

	/**
	 * Used by NodeGroup.applyComponentExprs() */
	componentHash: new WeakMap(),

	/**
	 * Store which instances of Solarite have already been added to the DOM.
	 * @type {WeakSet<HTMLElement>} */
	connected: new WeakSet(),

	/**
	 * Elements that have been rendered to by r() at least once.
	 * This is used by the Solarite class to know when to call onFirstConnect()
	 * @type {WeakSet<HTMLElement>} */
	rendered: new WeakSet(),

	currentExprPath: [],

	/**
	 * @type {Object<string, Class<Node>>} A map from built-in tag names to the constructors that create them. */
	elementClasses: {},

	/**
	 * Used by ExprPath.applyEventAttrib.
	 * TODO: Memory from this is never freed.  Use a WeakMap<Node, Object<eventName:string, function[]>> */
	nodeEvents: {},

	/**
	 * Used by r() path 9. */
	objToEl: new WeakMap(),

	pendingChildren: [],

	/**
	 * Elements that are currently rendering via the r() function.
	 * @type {WeakSet<HTMLElement>} */
	rendering: new WeakSet(),



	/**
	 * Get the root NodeGroup for an element.
	 * @type {WeakMap<HTMLElement, NodeGroup>} */
	nodeGroups: new WeakMap(),


	/**
	 * Each Element that has Expr children has an associated NodeGroupManager here.
	 * @type {WeakMap<HTMLElement, NodeGroupManager>} */
	nodeGroupManagers: new WeakMap(),

	/**
	 * Map from array of Html strings to a Shell created from them.
	 * @type {WeakMap<string[], Shell>} */
	shells: new WeakMap()

};

let Util = {

	bindStyles(style, root) {
		let styleId = root.getAttribute('data-style');
		if (!styleId) {
			// Keep track of one style id for each class.
			// TODO: Put this outside the class in a map, so it doesn't conflict with static properties.
			if (!root.constructor.styleId)
				root.constructor.styleId = 1;
			styleId = root.constructor.styleId++;

			root.setAttribute('data-style', styleId);
		}

		let tagName = root.tagName.toLowerCase();
		for (let child of style.childNodes) {
			if (child.nodeType === 3) {
				let oldText = child.textContent;
				let newText = oldText.replace(/:host(?=[^a-z0-9_])/gi, tagName + '[data-style="' + styleId + '"]');
				if (oldText !== newText)
					child.textContent = newText;
			}
		}
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
		const result = [...nodes];

		// Trim from the start
		while (result.length > 0 && shouldTrimNode(result[0]))
			result.shift();

		// Trim from the end
		while (result.length > 0 && shouldTrimNode(result[result.length - 1]))
			result.pop();

		return result;
	}
};



let div = document.createElement('div');

let isEvent = attrName => attrName.startsWith('on') && attrName in div;


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
function camelToDashes(str) {
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
 * Returns false if they're the same.  Or the first index where they differ.
 * @param a
 * @param b
 * @returns {int|false} */
function findArrayDiff(a, b) {
	if (a.length !== b.length)
		return -1;
	let aLength = a.length;
	for (let i=0; i<aLength; i++)
		if (a[i] !== b[i])
			return i;
	return false; // the same.
}


/**
 * TODO: Turn this into a class because it has internal state.
 * TODO: Don't break on 3<a inside a <script> or <style> tag.
 * @param html {?string} Pass null to reset context.
 * @returns {string} */
function htmlContext(html) {
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


// For debugging only
//#IFDEV
function setIndent(items, level=1) {
	if (typeof items === 'string')
		items = items.split(/\r?\n/g);

	return items.map(str => {
		if (level > 0)
			return '  '.repeat(level) + str;
		else if (level < 0)
			return str.replace(new RegExp(`^  {0,${Math.abs(level)}}`), '');
		return str;
	})
}

function nodeToArrayTree(node, callback=null) {
	if (!node) return [];

	let result = [];

	if (callback)
		result.push(...callback(node));

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


function flattenAndIndent(inputArray, indent = "") {
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

class MultiValueMap {

	/** @type {Object<string, Set>} */
	data = {};

	// Set a new value for a key
	add(key, value) {
		let data = this.data;
		let set = data[key];
		if (!set) {
			set = new Set();
			data[key] = set;
		}
		set.add(value);
	}

	// Get all values for a key
	getAll(key) {
		return this.data[key] || [];
	}

	/**
	 * Remove one value from a key, and return it.
	 * @param key {string}
	 * @param val If specified, make sure we delete this specific value, if a key exists more than once.
	 * @returns {*} */
	delete(key, val=undefined) {
		// if (key === '["Html2",[[["Html3",["F1","A"]],["Html3",["F1","B"]]]]]')
		// 	debugger;
			
		let data = this.data;
		// The partialUpdate benchmark shows having this check first makes the function slightly faster.
		// if (!data.hasOwnProperty(key))
		// 	return undefined;

		// Delete a specific value.
		let result;
		let set = data[key];
		if (!set) // slower than pre-check.
		 	return undefined;

		if (val !== undefined) {
			set.delete(val);
			result = val;
		}

		// Delete any value.
		else {
			result = set.values().next().value;
			// [result] = set; // Does the same as above. is about the same speed?
			set.delete(result);
		}

		// TODO: Will this make it slower?
		if (set.size === 0)
			delete data[key];
		
		return result;
	}

	hasValue(val) {
		let data = this.data;
		let names = [];
		for (let name in data)
			if (data[name].has(val)) // TODO: iterate twice to pre-size array?
				names.push(name);
		return names;
	}
}

/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup.
 * Path is only valid until the expressions before it are evaluated.
 * TODO: Make this based on parent and node instead of path? */
class ExprPath {

	/**
	 * @type {PathType} */
	type;

	// Used for attributes:

	/** @type {?string} Used only if type=AttribType.Value. */
	attrName;

	/**
	 * @type {?string[]} Used only if type=AttribType.Value. If null, use one expr to set the whole attribute value. */
	attrValue;

	/**
	 * @type {Set<string>} Used for type=AttribType.Multiple to remember the attributes that were added. */
	attrNames;



	/**
	 * @type {Node} Node that occurs before this ExprPath's first Node.
	 * This is necessary because udomdiff() can steal nodes from another ExprPath.
	 * If we had a pointer to our own startNode then that node could be moved somewhere else w/o us knowing it.
	 * Used only for type='content'
	 * Will be null if ExprPath has no Nodes. */
	nodeBefore;

	/**
	 * If type is AttribType.Multiple or AttribType.Value, points to the node having the attribute.
	 * If type is 'content', points to a node that never changes that this NodeGroup should always insert its nodes before.
	 *	 An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * @type {Node|HTMLElement} */
	nodeMarker;

	/** @deprecated */
	get parentNode() {
		return this.nodeMarker.parentNode;
	}

	// These are set after an expression is assigned:


	/** @type {NodeGroup} */
	parentNg;

	/** @type {NodeGroup[]} */
	nodeGroups = [];


	// Caches to make things faster

	/**
	 * @private
	 * @type {Node[]} Cached result of getNodes() */
	nodesCache;

	/**
	 * @type {int} Index of nodeBefore among its parentNode's children. */
	nodeBeforeIndex;

	/**
	 * @type {int[]} Path to the node marker. */
	nodeMarkerPath;

	/**
	 * @param nodeBefore {Node}
	 * @param nodeMarker {?Node}
	 * @param type {string}
	 * @param attrName {?string}
	 * @param attrValue {string[]} */
	constructor(nodeBefore, nodeMarker, type=PathType.Content, attrName=null, attrValue=null) {

		//#IFDEV
		/*
		Object.defineProperty(this, 'debug', {
			get() {
				return [
					`parentNode: ${this.nodeBefore.parentNode?.tagName?.toLowerCase()}`,
					'nodes:',
					...setIndent(this.getNodes().map(item => {
						if (item instanceof Node)
							return item.outerHTML || item.textContent
						else if (item instanceof NodeGroup)
							return item.debug
					}), 1).flat()
				]
			}
		})

		Object.defineProperty(this, 'debugNodes', {
			get: () =>
				this.getNodes()
		})
		*/
		//#ENDIF

		// If path is a node.
		this.nodeBefore = nodeBefore;
		this.nodeMarker = nodeMarker;
		this.type = type;
		this.attrName = attrName;
		this.attrValue = attrValue;
		if (type === PathType.Multiple)
			this.attrNames = new Set();
	}



	// New!

	/**
	 * Each NodeGroup is here twice, once under an exact key, and once under the close key.
	 * @type {MultiValueMap<key:string, value:NodeGroup>} */
	nodeGroupsFree = new MultiValueMap();

	/**
	 * TODO: Use an array of WeakRef so the gc can collect them?
	 * TODO: Put items back in nodeGroupsInUse after applyExpr() is called, not before.
	 * @type {NodeGroup[]} */
	nodeGroupsInUse = [];

	/**
	 * Get an unused NodeGroup that matches the template's html and expressions (exact=true)
	 * or at least the html (exact=false).
	 * Remove it from nodeGroupsFree if it exists, or create it if not.
	 * Then add it to nodeGroupsInUse.
	 *
	 * @param template {Template}
	 * @param exact {boolean}
	 * @return {NodeGroup} */
	getNodeGroup(template, exact=true) {
		let exactKey = template.getExactKey();
		let closeKey = template.getCloseKey();
		let result;

		if (exact) {
			result = this.nodeGroupsFree.delete(exactKey);
			if (result)
				this.nodeGroupsFree.delete(closeKey, result);
			else
				return null;
		}
		else {
			result = this.nodeGroupsFree.delete(closeKey);
			if (result) {
				/*#IFDEV*/assert(result.exactKey);/*#ENDIF*/
				this.nodeGroupsFree.delete(result.exactKey, result);

				// Update this close match with the new expression values.
				result.applyExprs(template.exprs);
				result.exactKey = exactKey; // TODO: Should this be set elsewhere?
			}
		}

		if (!result)
			result = new NodeGroup(template, this, exactKey, closeKey);

		this.nodeGroupsInUse.push(result);
		/*#IFDEV*/assert(result.parentPath);/*#ENDIF*/
		return result;
	}

	/**
	 * Move everything from this.nodeGroupsInUse to this.nodeGroupsFree. */
	freeNodeGroups() {
		let ngf = this.nodeGroupsFree;
		for (let ng of this.nodeGroupsInUse) {
			ngf.add(ng.exactKey, ng);
			ngf.add(ng.closeKey, ng);
		}
		this.nodeGroupsInUse = [];
	}






	/**
	 * TODO: Use another function to flatten the expr's so we don't have to use recusion.
	 * @param expr {Template|Node|Array|function|*}
	 * @param newNodes {(Node|Template)[]}
	 * @param secondPass {Array} Locations within newNodes to evaluate later. */
	apply(expr, newNodes, secondPass) {

		if (expr instanceof Template) {

			let ng = this.getNodeGroup(expr, true);
			if (ng) {
				//#IFDEV
				// Make sure the nodeCache of the ExprPath we took it from is sitll valid.
				if (ng.parentPath)
					ng.parentPath.verify();
				//#ENDIF


				// TODO: Track ranges of changed nodes and only pass those to udomdiff?
				// But will that break the swap benchmark?
				newNodes.push(...ng.getNodes());
				this.nodeGroups.push(ng);
			}

			// If expression, evaluate later to find partial match.
			else {
				secondPass.push([newNodes.length, this.nodeGroups.length]);
				newNodes.push(expr);
				this.nodeGroups.push(null); // placeholder
			}
		}

		// Node created by an expression.
		else if (expr instanceof Node) {

			// DocumentFragment created by an expression.
			if (expr instanceof DocumentFragment)
				newNodes.push(...expr.childNodes);
			else
				newNodes.push(expr);
		}

		else if (Array.isArray(expr))
			for (let subExpr of expr)
				this.apply(subExpr, newNodes, secondPass);

		else if (typeof expr === 'function') {
			Globals.currentExprPath = [this, expr]; // Used by watch3()
			let result = expr();
			Globals.currentExprPath = null;

			this.apply(result, newNodes, secondPass);
		}

		// Text
		else {
			// Convert falsy values (but not 0) to empty string.
			// Convert numbers to string so they compare the same.
			let text = (expr === undefined || expr === false || expr === null) ? '' : expr + '';

			// Fast path for updating the text of a single text node.
			let first = this.nodeBefore.nextSibling;
			if (first.nodeType === 3 && first.nextSibling === this.nodeMarker && !newNodes.includes(first)) {
				if (first.textContent !== text)
					first.textContent = text;

				newNodes.push(first);
			}

			else {
				// TODO: Optimize this into a Set or Map or something?
				if (!this.existingTextNodes)
					this.existingTextNodes = this.getNodes().filter(n => n.nodeType === 3);

				let idx = this.existingTextNodes.findIndex(n => n.textContent === text);
				if (idx !== -1)
					newNodes.push(...this.existingTextNodes.splice(idx, 1));
				else
					newNodes.push(this.parentNode.ownerDocument.createTextNode(text));
			}
		}

		// If not in one of the recusive calls
		// Mark all nodes as free, for the next render() call.
		// TODO: This is commented out b/c this needs to happen after the second pass.
		//if (!recursing)
		//	this.freeNodeGroups();
	}

	applyMultipleAttribs(node, expr) {
		/*#IFDEV*/assert(this.type === PathType.Multiple);/*#ENDIF*/

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			let attrs = (expr +'') // Split string into multiple attributes.
				.split(/([\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+))/g)
				.map(text => text.trim())
				.filter(text => text.length);

			for (let attr of attrs) {
				let [name, value] = attr.split(/\s*=\s*/); // split on first equals.
				value = (value || '').replace(/^(['"])(.*)\1$/, '$2'); // trim value quotes if they match.
				node.setAttribute(name, value);
				this.attrNames.add(name);
			}
		}

		// Remove old attributes.
		for (let oldName of oldNames)
			if (!this.attrNames.has(oldName))
				node.removeAttribute(oldName);
	}

	/**
	 * Handle attributes for event binding, such as:
	 * onclick=${(e, el) => this.doSomething(el, 'meow')}
	 * oninput=${[this.doSomething, 'meow']}
	 * onclick=${[this, 'doSomething', 'meow']}
	 *
	 * @param node
	 * @param expr
	 * @param root */
	applyEventAttrib(node, expr, root) {
		/*#IFDEV*/
		assert(this.type === PathType.Value || this.type === PathType.Component);
		assert(root instanceof HTMLElement);
		/*#ENDIF*/

		let eventName = this.attrName.slice(2);
		let func;

		// Convert array to function.
		// TODO: This doesn't work for [this, 'doSomething', 'meow']
		let args = [];
		if (Array.isArray(expr)) {
			for (let i=0; i<expr.length; i++)
				if (typeof expr[i] === 'function') {
					func = expr[i];
					args = expr.slice(i+1);
					break;
				}

			// Undocumented.
			// oninput=${[this, 'value']}
			if (!func) {
				func = setValue;
				args = [expr[0], expr.slice(1), node];
				node.value = delve(expr[0], expr.slice(1));
				// root.render(); // TODO: This causes infinite recursion.
			}
		}
		else
			func = expr;

		let eventKey = getObjectId(node) + eventName;
		let [existing, existingBound] = Globals.nodeEvents[eventKey] || [];
		//Globals.nodeEventArgs[eventKey] = args; // TODO: Put this in Globals.nodeEvents[]  Where is this ever used?


		if (existing !== func) {
			if (existing)
				node.removeEventListener(eventName, existingBound);

			let originalFunc = func;

			// BoundFunc sets the "this" variable to be the current Solarite component.
			let boundFunc = event => originalFunc.call(root, ...args, event, node);

			// Save both the original and bound functions.
			// Original so we can compare it against a newly assigned function.
			// Bound so we can use it with removeEventListner().
			Globals.nodeEvents[eventKey] = [originalFunc, boundFunc];

			node.addEventListener(eventName, boundFunc);

			// TODO: classic event attribs:
			//el[attr.name] = e => // e.g. el.onclick = ...
			//	(new Function('event', 'el', attr.value)).bind(this.manager.rootEl)(e, el) // put "event", "el", and "this" in scope for the event code.
		}
	}

	applyValueAttrib(node, exprs, exprIndex) {
		let expr = exprs[exprIndex];
		
		// Array for form element data binding.
		// TODO: This never worked, and was moved to applyEventAttrib.
		// let isArrayValue = Array.isArray(expr);
		// if (isArrayValue && expr.length >= 2 && !expr.slice(1).find(v => !['string', 'number'].includes(typeof v))) {
		// 	node.value = delve(expr[0], expr.slice(1));
		// 	node.addEventListener('input', e => {
		// 		delve(expr[0], expr.slice(1), node.value) // TODO: support other properties like checked
		// 	});
		// }

		// Values to toggle an attribute
		if (!this.attrValue && (expr === false || expr === null || expr === undefined))
			node.removeAttribute(this.attrName);
		
		else if (!this.attrValue && expr === true)
			node.setAttribute(this.attrName, '');

		// Passing a path to the value attribute.
		// This same logic is in NodeGroup.createNewComponent() for components.
		else if ((this.attrName === 'value' || this.attrName === 'data-value') && Util.isPath(expr)) {
			let [obj, path] = [expr[0], expr.slice(1)];
			node.value = delve(obj, path);
			node.addEventListener('input', () => {
				delve(obj, path, Util.getInputValue(node));
			}, true); // We use capture so we update the values before other events added by the user.
		}

		// Regular attribute
		else {
			let value = [];

			// We go backward because NodeGroup.applyExprs() calls this function, and it goes backward through the exprs.
			if (this.attrValue) {
				for (let i=this.attrValue.length-1; i>=0; i--) {
					value.unshift(this.attrValue[i]);
					if (i > 0) {
						let val = exprs[exprIndex];
						if (val !== false && val !== null && val !== undefined)
							value.unshift(val);
						exprIndex--;
					}
				}

				exprIndex ++;
			}
			else
				value.unshift(expr);

			let joinedValue = value.join('');

			// Only update attributes if the value has changed.
			// The .value property is special.  If it changes we don't update the attribute.
			let oldVal = this.attrName === 'value' ? node.value : node.getAttribute(this.attrName);
			if (oldVal !== joinedValue) {
				node.setAttribute(this.attrName, joinedValue);
			}

			// This is needed for setting input.value, .checked, option.selected, etc.
			// But in some cases setting the attribute is enough.  such as div.setAttribute('title') updates div.title.
			// TODO: How to tell which is which?
			if (this.attrName in node)
				node[this.attrName] = joinedValue;

		}

		return exprIndex;
	}


	/**
	 *
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {ExprPath} */
	clone(newRoot, pathOffset=0) {
		/*#IFDEV*/this.verify();/*#ENDIF*/

		// Resolve node paths.
		let nodeMarker, nodeBefore;
		let root = newRoot;
		let path = pathOffset ? this.nodeMarkerPath.slice(0, -pathOffset) : this.nodeMarkerPath;
		for (let i=path.length-1; i>0; i--) // Resolve the path.
			root = root.childNodes[path[i]];
		let childNodes = root.childNodes;

		nodeMarker = path.length ? childNodes[path[0]] : newRoot;
		if (this.nodeBefore)
			nodeBefore = childNodes[this.nodeBeforeIndex];

		let result = new ExprPath(nodeBefore, nodeMarker, this.type, this.attrName, this.attrValue);

		//#IFDEV
		result.nodeMarker.exprPath = result;
		if (result.nodeBefore)
			result.nodeBefore.prevExprPath = result;
		result.verify();
		//#ENDIF

		return result;
	}
	
	/**
	 * Clear the nodeCache of this ExprPath, as well as all parent and child ExprPaths that
	 * share the same DOM parent node.
	 *
	 * TODO: Is recursive clearing ever necessary? */
	clearNodesCache() {
		let path = this;
		
		// Clear cache parent ExprPaths that have the same parentNode
		let parentNode = this.parentNode;
		while (path && path.parentNode === parentNode) {
			path.nodesCache = null;
			path = path.parentNg?.parentPath;
			
			// If stuck in an infinite loop here, the problem is likely due to Template hash colisions.
			// Which cause one path to be the descendant of itself, creating a cycle.
		}

		// Commented out on Sep 30, 2024 b/c it was making the benchmark never finish when adding 10k rows.
		//clearChildNodeCache(this);
	}


	/**
	 * Attempt to remove all of this ExprPath's nodes from the DOM, if it can be done using a special fast method.
	 * @returns {boolean} Returns false if Nodes werne't removed, and they should instead be removed manually. */
	fastClear() {
		let parent = this.nodeBefore.parentNode;
		if (this.nodeBefore === parent.firstChild && this.nodeMarker === parent.lastChild) {

			// If parent is the only child of the grandparent, replace the whole parent.
			// And if it has no siblings, it's not created by a NodeGroup/path.
			let grandparent = parent.parentNode;
			if (grandparent && parent === grandparent.firstChild && parent === grandparent.lastChild && !parent.hasAttribute('id')) {
				let replacement = document.createElement(parent.tagName);
				replacement.append(this.nodeBefore, this.nodeMarker);
				for (let attrib of parent.attributes)
					replacement.setAttribute(attrib.name, attrib.value);
				parent.replaceWith(replacement);
			}
			else {
				parent.innerHTML = ''; // Faster than calling .removeChild() a thousand times.
				parent.append(this.nodeBefore, this.nodeMarker);
			}
			return true;
		}
		return false;
	}
	
	/**
	 * @return {(Node|HTMLElement)[]} */
	getNodes() {
		
		// Why doesn't this work?
		// let result2 = [];
		// for (let ng of this.nodeGroups)
		// 	result2.push(...ng.getNodes())
		// return result2;
		
		
		let result;

		// This shaves about 5ms off the partialUpdate benchmark.
		/*result = this.nodesCache;
		if (result) {
			
			//#IFDEV
			this.checkNodesCache();
			//#ENDIF
			
			return result
		}*/

		result = [];
		let current = this.nodeBefore.nextSibling;
		let nodeMarker = this.nodeMarker;
		while (current && current !== nodeMarker) {
			result.push(current);
			current = current.nextSibling;
		}

		this.nodesCache = result;
		return result;
	}

	getParentNode() { // Same as this.parentNode
		return this.nodeMarker.parentNode
	}

	//#IFDEV
	
	get debug() {
		return [
			`parentNode: ${this.nodeBefore.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item instanceof Node)
					return item.outerHTML || item.textContent
				else if (item instanceof NodeGroup)
					return item.debug
			}), 1).flat()
		]
	}
	
	get debugNodes() {
		// Clear nodesCache so that getNodes() manually gets the nodes.
		let nc = this.nodesCache;
		this.nodesCache = null;
		let result = this.getNodes();
		this.nodesCache = nc;
		return result;
	}
	
	verify() {
		if (!window.verify)
			return;

		assert(this.type!==PathType.Content || this.nodeBefore);
		assert(this.type!==PathType.Content || this.nodeBefore.parentNode);

		// Need either nodeMarker or parentNode
		assert(this.nodeMarker);

		// nodeMarker must be attached.
		assert(!this.nodeMarker || this.nodeMarker.parentNode);

		// nodeBefore and nodeMarker must have same parent.
		assert(this.type!==PathType.Content || this.nodeBefore.parentNode === this.nodeMarker.parentNode);

		assert(this.nodeBefore !== this.nodeMarker);
		assert(this.type!==PathType.Content|| !this.nodeBefore.parentNode || this.nodeBefore.compareDocumentPosition(this.nodeMarker) === Node.DOCUMENT_POSITION_FOLLOWING);

		// Detect cyclic parent and grandparent references.
		assert(this.parentNg?.parentPath !== this);
		assert(this.parentNg?.parentPath?.parentNg?.parentPath !== this);
		assert(this.parentNg?.parentPath?.parentNg?.parentPath?.parentNg?.parentPath !== this);

		for (let ng of this.nodeGroups)
			ng.verify();

		// Make sure the nodesCache matches the nodes.
		this.checkNodesCache();
	}
	
	checkNodesCache() {
		return;
	}
	//#ENDIF
}



/**
 *
 * @param root
 * @param path {string[]}
 * @param node {HTMLElement}
 */
function setValue(root, path, node) {
	let val = node.value;
	if (node.type === 'number')
		val = parseFloat(val);

	delve(root, path, val);
}

/** @enum {string} */
const PathType = {
	/** Child of a node */
	Content: 'content',
	
	/** One or more whole attributes */
	Multiple: 'attrName',
	
	/** Value of an attribute. */
	Value: 'attrValue',
	
	/** Value of an attribute being passed to a component. */
	Component: 'component',
	
	/** Expressions inside Html comments. */
	Comment: 'comment',
};


/** @return {int[]} Returns indices in reverse order, because doing it that way is faster. */
function getNodePath(node) {
	let result = [];
	while(true) {
		let parent = node.parentNode;
		if (!parent)
			break;
		result.push(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
		node = parent;
	}
	return result;
}

/**
 * Note that the path is backward, with the outermost element at the end.
 * @param root {HTMLElement|Document|DocumentFragment|ParentNode}
 * @param path {int[]}
 * @returns {Node|HTMLElement} */
function resolveNodePath(root, path) {
	for (let i=path.length-1; i>=0; i--)
		root = root.childNodes[path[i]];
	return root;
}

/**
 * A Shell is created from a tagged template expression instantiated as Nodes,
 * but without any expressions filled in.
 * Only one Shell is created for all the items in a loop.
 *
 * When a NodeGroup is created from a Template's html strings,
 * the NodeGroup then clones the Shell's fragmentn to be its nodes. */
class Shell {

	/**
	 * @type {DocumentFragment} DOM parent of the shell nodes. */
	fragment;

	/** @type {ExprPath[]} Paths to where expressions should go. */
	paths = [];

	// Embeds and ids
	events = [];

	/** @type {int[][]} Array of paths */
	ids = [];
	scripts = [];
	styles = [];

	staticComponents = [];



	/**
	 * Create the nodes but without filling in the expressions.
	 * This is useful because the expression-less nodes created by a template can be cached.
	 * @param html {string[]} */
	constructor(html=null) {
		if (!html)
			return;

		//#IFDEV
		this.html = html.join('');
		//#ENDIF

		// 1.  Add placeholders
		// We increment the placeholder char as we go because nodes can't have the same attribute more than once.
		let placeholder = 0xe000; // https://en.wikipedia.org/wiki/Private_Use_Areas  6400.

		let buffer = [];
		let commentPlaceholder = `<!--!✨!-->`;
		let componentNames = {};

		htmlContext(null); // Reset the context.
		for (let i=0; i<html.length; i++) {
			let lastHtml = html[i];
			let context = htmlContext(lastHtml);

			// Swap out Embedded Solarite Components with ${} attributes.
			// Later, NodeGroup.render() will search for these and replace them with the real components.
			// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
			if (context === htmlContext.Attribute) {

				let lastIndex, lastMatch;
				lastHtml.replace(/<[a-z][a-z0-9]*-[a-z0-9-]+/ig, (match, index) => {
					lastIndex = index+1; // +1 for after opening <
					lastMatch = match.slice(1);
				});

				if (lastMatch) {
					let newTagName = lastMatch + '-solarite-placeholder';
					lastHtml = lastHtml.slice(0, lastIndex) + newTagName + lastHtml.slice(lastIndex + lastMatch.length);
					componentNames[lastMatch] = newTagName;
				}
			}

			buffer.push(lastHtml);
			//console.log(lastHtml, context)
			if (i < html.length-1)
				if (context === htmlContext.Text)
					buffer.push(commentPlaceholder); // Comment Placeholder. because we can't put text in between <tr> tags for example.
				else
					buffer.push(String.fromCharCode(placeholder+i));
		}

		// 2. Create elements from html with placeholders.
		let template = document.createElement('template'); // Using a single global template won't keep the nodes as children of the DocumentFragment.
		let joinedHtml = buffer.join('');

		// Replace '-solarite-placeholder' close tags.
		// TODO: is there a better way?  What if the close tag is inside a comment?
		for (let name in componentNames)
			joinedHtml = joinedHtml.replaceAll(`</${name}>`, `</${componentNames[name]}>`);
		
        if (joinedHtml)
		    template.innerHTML = joinedHtml;
        else // Create one text node, so shell isn't empty and NodeGroups created from it have something to point the startNode and endNode at.
            template.content.append(document.createTextNode(''));
		this.fragment = template.content;

		// 3. Find placeholders
		let node;
		let toRemove = [];
		const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT);
		while (node = walker.nextNode()) {

			// Remove previous after each iteration, so paths will still be calculated correctly.
			toRemove.map(el => el.remove());
			toRemove = [];

			// Replace attributes
			if (node.nodeType === 1) {
				for (let attr of [...node.attributes]) { // Copy the attributes array b/c we remove attributes as we go.

					// Whole attribute
					let matches = attr.name.match(/^[\ue000-\uf8ff]$/);
					if (matches) {
						this.paths.push(new ExprPath(null, node, PathType.Multiple));
						node.removeAttribute(matches[0]);
					}

					// Just the attribute value.
					else {
						let parts = attr.value.split(/[\ue000-\uf8ff]/g);
						if (parts.length > 1) {
							let nonEmptyParts = (parts.length === 2 && !parts[0].length && !parts[1].length) ? null : parts;
							this.paths.push(new ExprPath(null, node, PathType.Value, attr.name, nonEmptyParts));
							node.setAttribute(attr.name, parts.join(''));
						}
					}
				}
			}
			// Replace comment placeholders
			else if (node.nodeType === Node.COMMENT_NODE && node.nodeValue === '!✨!') {

				// Get or create nodeBefore.
				let nodeBefore = node.previousSibling; // Can be the same as another Path's nodeMarker.
				if (!nodeBefore) {
					nodeBefore = document.createComment('ExprPath:'+this.paths.length);
					node.parentNode.insertBefore(nodeBefore, node);
				}
				/*#IFDEV*/assert(nodeBefore);/*#ENDIF*/

				// Get the next node.
				let nodeMarker;

				// A subsequent node is available to be a nodeMarker.
				if (node.nextSibling && (node.nextSibling.nodeType !== 8 || node.nextSibling.textContent !== '!✨!')) {
					nodeMarker = node.nextSibling;
					toRemove.push(node); // Removing them here will mess up the treeWalker.
				}
				// Re-use existing comment placeholder.
				else {
					nodeMarker = node;
					nodeMarker.textContent = 'ExprPathEnd:'+ this.paths.length;
				}
				/*#IFDEV*/assert(nodeMarker);/*#ENDIF*/



				let path = new ExprPath(nodeBefore, nodeMarker, PathType.Content);

				this.paths.push(path);
			}
			
			
			// Sometimes users will comment out a block of html code that has expressions.
			// Here we look for expressions in comments.
			// We don't actually update them dynamically, but we still add paths for them.
			// That way the expression count still matches.
			else if (node.nodeType === Node.COMMENT_NODE) {
				let parts = node.textContent.split(/[\ue000-\uf8ff]/g);
				for (let i=0; i<parts.length-1; i++) {
					let path = new ExprPath(node.previousSibling, node);
					path.type = PathType.Comment;
					this.paths.push(path);
				}
			}

			// Replace comment placeholders inside script and style tags, which have become text nodes.
			else if (node.nodeType === Node.TEXT_NODE && ['SCRIPT', 'STYLE'].includes(node.parentNode?.nodeName)) {
				let parts = node.textContent.split(commentPlaceholder);
				if (parts.length > 1) {

					let placeholders = [];
					for (let i = 0; i<parts.length; i++) {
						let current = document.createTextNode(parts[i]);
						node.parentNode.insertBefore(current, node);
						if (i > 0)
							placeholders.push(current);
					}

					for (let i=0, node; node=placeholders[i]; i++) {
						let path = new ExprPath(node.previousSibling, node, PathType.Content);
						this.paths.push(path);

						/*#IFDEV*/path.verify();/*#ENDIF*/
					}

					// Removing them here will mess up the treeWalker.
					toRemove.push(node);
				}
			}
		}
		toRemove.map(el => el.remove());

		// Handle solarite-placeholder's.
		// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
		//if (componentNames.size)
		//	this.components = [...this.fragment.querySelectorAll([...componentNames].join(','))]

		// Rename "is" attributes so the Web Components don't instantiate until we have the values of their PathExpr arguments.
		// that happens in NodeGroup.applyComponentExprs()
		for (let el of this.fragment.querySelectorAll('[is]')) {
			el.setAttribute('_is', el.getAttribute('is'));
		//	this.components.push(el);
		}

		for (let path of this.paths) {
			if (path.nodeBefore)
				path.nodeBeforeIndex = Array.prototype.indexOf.call(path.nodeBefore.parentNode.childNodes, path.nodeBefore);
			path.nodeMarkerPath = getNodePath(path.nodeMarker);

			// Cache so we don't have to calculate this later inside NodeGroup.applyExprs()
			if (path.type === PathType.Value && path.nodeMarker.nodeType === 1 &&
				(path.nodeMarker.tagName.includes('-') || path.nodeMarker.hasAttribute('is'))) {
				path.type = PathType.Component;
			}
		}

		this.findEmbeds();

		/*#IFDEV*/this.verify();/*#ENDIF*/
	} // end constructor

	/**
	 * We find the path to every embed here once in the Shell, instead of every time a NodeGroup is instantiated.
	 * When a Nodegroup is created, it calls NodeGroup.activateEmbeds() that uses these paths.
	 * Populates:
	 * this.scripts
	 * this.styles
	 * this.ids
	 * this.staticComponents */
	findEmbeds() {
		this.scripts = Array.prototype.map.call(this.fragment.querySelectorAll('scripts'), el => getNodePath(el));
		this.styles = Array.prototype.map.call(this.fragment.querySelectorAll('style'), el => getNodePath(el));

		let idEls = this.fragment.querySelectorAll('[id],[data-id]');
		

		// Check for valid id names.
		for (let el of idEls) {
			let id = el.getAttribute('data-id') || el.getAttribute('id');
			if (div.hasOwnProperty(id))
				throw new Error(`<${el.tagName.toLowerCase()} id="${id}"> can't override existing HTMLElement id property.`)
		}


		this.ids = Array.prototype.map.call(idEls, el => getNodePath(el));

		// Events (not yet used)
		for (let el of this.fragment.querySelectorAll('*')) {
			for (let attrib of el.attributes)
				if (isEvent(attrib.name))
					this.events.push([attrib.name, getNodePath(el)]);

			if (el.tagName.includes('-') || el.hasAttribute('_is'))

				// Dynamic components have attributes with expression values.
				// They are created from applyExprs()
				// But static components are created in a separate path inside the NodeGroup constructor.
				if (!this.paths.find(path => path.nodeMarker === el))
					this.staticComponents.push(getNodePath(el));
		}

	}

	/**
	 * Get the shell for the html strings.
	 * @param htmlStrings {string[]} Typically comes from a Template.
	 * @returns {Shell} */
	static get(htmlStrings) {
		let result = Globals.shells.get(htmlStrings);
		if (!result) {
			result = new Shell(htmlStrings);
			Globals.shells.set(htmlStrings, result); // cache
		}

		/*#IFDEV*/result.verify();/*#ENDIF*/
		return result;
	}

	//#IFDEV
	// For debugging only:
	verify() {
		for (let path of this.paths) {
			assert(this.fragment.contains(path.getParentNode()));
			path.verify();
		}
	}
	//#ENDIF
}

/**
 * ISC License
 *
 * Copyright (c) 2020, Andrea Giammarchi, @WebReflection
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
 * OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

/**
 * @param {Node} parentNode The container where children live
 * @param {Node[]} a The list of current/live children
 * @param {Node[]} b The list of future children
 * @param {(entry: Node, action: number) => Node} get
 * The callback invoked per each entry related DOM operation.
 * @param {Node} [before] The optional node used as anchor to insert before.
 * @returns {Node[]} The same list of future children.
 */
const udomdiff = (parentNode, a, b, before) => {
	//#IFDEV
	// if (parentNode instanceof ExprPath)
	// 	parentNode.verify();
	//#ENDIF

	const bLength = b.length;
	let aEnd = a.length;
	let bEnd = bLength;
	let aStart = 0;
	let bStart = 0;
	let map = null;
	while (aStart < aEnd || bStart < bEnd) {
		// append head, tail, or nodes in between: fast path
		if (aEnd === aStart) {
			// we could be in a situation where the rest of nodes that
			// need to be added are not at the end, and in such case
			// the node to `insertBefore`, if the index is more than 0
			// must be retrieved, otherwise it's gonna be the first item.
			const node = bEnd < bLength
				? (bStart
					? (b[bStart - 1].nextSibling)
					: b[bEnd - bStart])
				: before;
			while (bStart < bEnd) {
				let bNode = b[bStart++];
				parentNode.insertBefore(bNode, node);

				//#IFDEV
				if (bNode instanceof NodeGroup)
					bNode.verify();
				// if (parentNode instanceof ExprPath)
				// 	parentNode.verify();
				//#ENDIF
			}
		}
		// remove head or tail: fast path
		else if (bEnd === bStart) {
			while (aStart < aEnd) {
				// remove the node only if it's unknown or not live
				let aNode = a[aStart];
				if (!map || !map.has(aNode)) {
					parentNode.removeChild(aNode);

					//#IFDEV
					if (aNode instanceof NodeGroup)
						aNode.verify();
					// if (parentNode instanceof ExprPath)
					// 	parentNode.verify();
					//#ENDIF
				}
				aStart++;
			}
		}
		// same node: fast path
		else if (a[aStart] === b[bStart]) {
			aStart++;
			bStart++;
		}
		// same tail: fast path
		else if (a[aEnd - 1] === b[bEnd - 1]) {
			aEnd--;
			bEnd--;
		}
			// The once here single last swap "fast path" has been removed in v1.1.0
			// https://github.com/WebReflection/udomdiff/blob/single-final-swap/esm/index.js#L69-L85
		// reverse swap: also fast path
		else if (
			a[aStart] === b[bEnd - 1] &&
			b[bStart] === a[aEnd - 1]
		) {
			// this is a "shrink" operation that could happen in these cases:
			// [1, 2, 3, 4, 5]
			// [1, 4, 3, 2, 5]
			// or asymmetric too
			// [1, 2, 3, 4, 5]
			// [1, 2, 3, 5, 6, 4]
			const node = a[--aEnd].nextSibling;


			let a2 = b[bStart++];
			let b2 = a[aStart++];
			parentNode.insertBefore(
				a2,
				b2.nextSibling
			);
			//#IFDEV
			if (a2 instanceof NodeGroup)
				a2.verify();
			// if (parentNode instanceof ExprPath)
			// 	parentNode.verify();
			//#ENDIF

			let bNode = b[--bEnd];
			parentNode.insertBefore(bNode, node);

			//#IFDEV
			if (bNode instanceof NodeGroup)
				bNode.verify();
			// if (parentNode instanceof ExprPath)
			// 	parentNode.verify();

			//#ENDIF

			// mark the future index as identical (yeah, it's dirty, but cheap 👍)
			// The main reason to do this, is that when a[aEnd] will be reached,
			// the loop will likely be on the fast path, as identical to b[bEnd].
			// In the best case scenario, the next loop will skip the tail,
			// but in the worst one, this node will be considered as already
			// processed, bailing out pretty quickly from the map index check
			a[aEnd] = b[bEnd];
		}
		// map based fallback, "slow" path
		else {
			// the map requires an O(bEnd - bStart) operation once
			// to store all future nodes indexes for later purposes.
			// In the worst case scenario, this is a full O(N) cost,
			// and such scenario happens at least when all nodes are different,
			// but also if both first and last items of the lists are different
			if (!map) {
				map = new Map;
				let i = bStart;
				while (i < bEnd)
					map.set(b[i], i++);
			}
			// if it's a future node, hence it needs some handling
			if (map.has(a[aStart])) {
				// grab the index of such node, 'cause it might have been processed
				const index = map.get(a[aStart]);
				// if it's not already processed, look on demand for the next LCS
				if (bStart < index && index < bEnd) {
					let i = aStart;
					// counts the amount of nodes that are the same in the future
					let sequence = 1;
					while (++i < aEnd && i < bEnd && map.get(a[i]) === (index + sequence))
						sequence++;
					// effort decision here: if the sequence is longer than replaces
					// needed to reach such sequence, which would brings again this loop
					// to the fast path, prepend the difference before a sequence,
					// and move only the future list index forward, so that aStart
					// and bStart will be aligned again, hence on the fast path.
					// An example considering aStart and bStart are both 0:
					// a: [1, 2, 3, 4]
					// b: [7, 1, 2, 3, 6]
					// this would place 7 before 1 and, from that time on, 1, 2, and 3
					// will be processed at zero cost
					if (sequence > (index - bStart)) {
						const node = a[aStart];
						while (bStart < index) {
							let bNode = b[bStart++];
							parentNode.insertBefore(bNode, node);

							//#IFDEV
							if (bNode instanceof NodeGroup)
								bNode.verify();
							// if (parentNode instanceof ExprPath)
							// 	parentNode.verify();

							//#ENDIF
						}
					}
						// if the effort wasn't good enough, fallback to a replace,
						// moving both source and target indexes forward, hoping that some
					// similar node will be found later on, to go back to the fast path
					else {
						let aNode = a[aStart++];
						let bNode = b[bStart++];
						parentNode.replaceChild(
							bNode,
							aNode
						);

						//#IFDEV
						if (aNode instanceof NodeGroup)
							aNode.verify();
						// if (parentNode instanceof ExprPath)
						// 	parentNode.verify();
						//#ENDIF
					}
				}
				// otherwise move the source forward, 'cause there's nothing to do
				else
					aStart++;
			}
				// this node has no meaning in the future list, so it's more than safe
				// to remove it, and check the next live node out instead, meaning
			// that only the live list index should be forwarded
			else {
				let aNode = a[aStart++];
				parentNode.removeChild(aNode);

				//#IFDEV
				if (aNode instanceof NodeGroup)
					aNode.verify();
				// if (parentNode instanceof ExprPath)
				// 	parentNode.verify();
				//#ENDIF
			}
		}
	}
	return b;
};

/** @typedef {boolean|string|number|function|Object|Array|Date|Node|Template} Expr */

/**
 * A group of Nodes instantiated from a Shell, with Expr's filled in.
 *
 * The range is determined by startNode and nodeMarker.
 * startNode - never null.  An empty text node is created before the first path if none exists.
 * nodeMarker - null if this Nodegroup is at the end of its parents' nodes.
 *
 *
 * */
class NodeGroup {

	/**
	 * @Type {RootNodeGroup} */
	rootNg;

	/** @type {ExprPath} */
	parentPath;

	/** @type {Node|HTMLElement} First node of NodeGroup. Should never be null. */
	startNode;

	/** @type {Node|HTMLElement} A node that never changes that this NodeGroup should always insert its nodes before.
	 * An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.*/
	endNode;

	/** @type {ExprPath[]} */
	paths = [];

	/** @type {string} Key that matches the template and the expressions. */
	exactKey;

	/** @type {string} Key that only matches the template. */
	closeKey;

	/**
	 * @internal
	 * @type {Node[]} Cached result of getNodes() used only for improving performance.*/
	nodesCache;

	/**
	 * @type {?Map<HTMLStyleElement, string>} */
	styles;

	currentComponentProps = {};
	

	/**
	 * Create an "instantiated" NodeGroup from a Template and add it to an element.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param parentPath {?ExprPath}
	 * @param exactKey {?string}
	 * @param closeKey {?string} */
	constructor(template, parentPath=null, exactKey=null, closeKey=null) {
		if (!(this instanceof RootNodeGroup)) {
			let [fragment, shell] = this.init(template, parentPath, exactKey, closeKey);

			this.updatePaths(fragment, shell.paths);

			this.activateEmbeds(fragment, shell);

			// Apply exprs
			this.applyExprs(template.exprs);
		}
	}

	init(template, parentPath=null, exactKey=null, closeKey=null) {
		this.exactKey = exactKey || template.getExactKey();
		this.closeKey = closeKey || template.getCloseKey();

		this.parentPath = parentPath;
		this.rootNg = parentPath?.parentNg?.rootNg || this;

		/*#IFDEV*/assert(this.rootNg);/*#ENDIF*/

		/** @type {Template} */
		this.template = template;

		// new!  Is this needed?
		template.nodeGroup = this;

		// Get a cached version of the parsed and instantiated html, and ExprPaths.
		let shell = Shell.get(template.html);
		let fragment = shell.fragment.cloneNode(true);

		let childNodes = fragment.childNodes;
		this.startNode = childNodes[0];
		this.endNode = childNodes[childNodes.length - 1];

		return [fragment, shell];
	}

	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param paths {?ExprPath[]} Optional.  */
	applyExprs(exprs, paths=null) {
		paths = paths || this.paths;
		
		/*#IFDEV*/this.verify();/*#ENDIF*/

		// Update exprs at paths.
		let exprIndex = exprs.length-1, expr, lastNode;

		// We apply them in reverse order so that a <select> box has its options created from an expression
		// before its value attribute is set via an expression.
		for (let path of paths.toReversed()) {
			expr = exprs[exprIndex];

			// Nodes
			if (path.type === PathType.Content) {
				this.applyNodeExpr(path, expr);
				/*#IFDEV*/path.verify();/*#ENDIF*/
			}

			// Attributes
			else {
				let node = path.nodeMarker;
				/*#IFDEV*/assert(node);/*#ENDIF*/

				// This is necessary both here and below.
				if (lastNode && lastNode !== this.rootNg.root && lastNode !== node && Object.keys(this.currentComponentProps).length) {
					this.applyComponentExprs(lastNode, this.currentComponentProps);
					this.currentComponentProps = {};
				}

				if (path.type === PathType.Multiple)
					path.applyMultipleAttribs(node, expr);

				// Capture attribute expressions to later send to the constructor of a web component.
				// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
				else if (path.nodeMarker !== this.rootNg.root && path.type === PathType.Component)
					this.currentComponentProps[path.attrName] = expr;
				
				else if (path.type === PathType.Comment) ;
				else {

					// Event attribute value
					if (path.attrValue===null && (typeof expr === 'function' || Array.isArray(expr)) && isEvent(path.attrName)) {

						let root = this.getRootNode();

						path.applyEventAttrib(node, expr, root);
					}

					// Regular attribute value.
					else // One node value may have multiple expressions.  Here we apply them all at once.
						exprIndex = path.applyValueAttrib(node, exprs, exprIndex);
				}

				lastNode = path.nodeMarker;
			}

			exprIndex--;
		} // end for(path of this.paths)


		// Check again after we iterate through all paths to apply to a component.
		if (lastNode && lastNode !== this.rootNg.root && Object.keys(this.currentComponentProps).length) {
			this.applyComponentExprs(lastNode, this.currentComponentProps);
			this.currentComponentProps = {};
		}

		this.updateStyles();

		// Invalidate the nodes cache because we just changed it.
		this.nodesCache = null;

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		/*#IFDEV*/assert(exprIndex === -1);/*#ENDIF*/


		/*#IFDEV*/this.verify();/*#ENDIF*/
	}

	applyExpr(path, expr) {
		// TODO: Use this if I can figure out how to adapt applyValueAttrib() to it.
	}

	/**
	 * Insert/replace the nodes created by a single expression.
	 * Called by applyExprs()
	 * This function is recursive, as the functions it calls also call it.
	 * TODO: Move this to ExprPath?
	 * @param path {ExprPath}
	 * @param expr {Expr}
	 * @return {Node[]} New Nodes created. */
	applyNodeExpr(path, expr) {
		/*#IFDEV*/path.verify();/*#ENDIF*/

		/** @type {(Node|NodeGroup|Expr)[]} */
		let newNodes = [];
		let oldNodeGroups = path.nodeGroups;
		/*#IFDEV*/assert(!oldNodeGroups.includes(null));/*#ENDIF*/
		let secondPass = []; // indices

		path.nodeGroups = []; // TODO: Is this used?
		path.apply(expr, newNodes, secondPass);

		this.existingTextNodes = null;

		// TODO: Create an array of old vs Nodes and NodeGroups together.
		// If they're all the same, skip the next steps.
		// Or calculate it in the loop above as we go?  Have a path.lastNodeGroups property?

		// Second pass to find close-match NodeGroups.
		let flatten = false;
		if (secondPass.length) {
			for (let [nodesIndex, ngIndex] of secondPass) {
				let ng = path.getNodeGroup(newNodes[nodesIndex], false);
				
				ng.parentPath = path;
				let ngNodes = ng.getNodes();

				/*#IFDEV*/assert(!(newNodes[nodesIndex] instanceof NodeGroup));/*#ENDIF*/
				
				if (ngNodes.length === 1)
					newNodes[nodesIndex] = ngNodes[0];
				
				else {
					newNodes[nodesIndex] = ngNodes;
					flatten = true;
				}
				path.nodeGroups[ngIndex] = ng;
			}

			if (flatten)
				newNodes = newNodes.flat(); // TODO: Only if second pass happens?
		}

		/*#IFDEV*/assert(!path.nodeGroups.includes(null));/*#ENDIF*/


	
		let oldNodes = path.getNodes();
		path.nodesCache = newNodes; // Replaces value set by path.getNodes()


		// This pre-check makes it a few percent faster?
		let diff = findArrayDiff(oldNodes, newNodes);
		if (diff !== false) {

			if (this.parentPath)
				this.parentPath.clearNodesCache();

			// Fast clear method
			let isNowEmpty = oldNodes.length && !newNodes.length;
			if (!isNowEmpty || !path.fastClear(oldNodes, newNodes))

				// Rearrange nodes.
				udomdiff(path.parentNode, oldNodes, newNodes, path.nodeMarker);

			this.saveOrphans(oldNodeGroups, oldNodes);
		}

		// Must happen after second pass.
		path.freeNodeGroups();

		/*#IFDEV*/path.verify();/*#ENDIF*/
	}
	
	/**
	 * Find NodeGroups that had their nodes removed and add those nodes to a Fragment so
	 * they're not lost forever and the NodeGroup's internal structure is still consistent.
	 * Called from NodeGroup.applyNodeExpr().
	 * @param oldNodeGroups {NodeGroup[]}
	 * @param oldNodes {Node[]} */
	saveOrphans(oldNodeGroups, oldNodes) {
		let oldNgMap = new Map();
		for (let ng of oldNodeGroups) {
			oldNgMap.set(ng.startNode, ng);
			
			// TODO: Is this necessary?
			// if (ng.parentPath)
			// 	ng.parentPath.clearNodesCache();
		}

		for (let i=0, node; node = oldNodes[i]; i++) {
			let ng;
			if (!node.parentNode && (ng = oldNgMap.get(node))) {
				let fragment = document.createDocumentFragment();
				let endNode = ng.endNode;
				while (node !== endNode) {
					fragment.append(node);
					i++;
					node = oldNodes[i];
				}
				fragment.append(endNode);
			}
		}
	}

	/**
	 * Create a nested RedComponent or call render with the new props.
	 * @param el {Solarite:HTMLElement}
	 * @param props {Object} */
	applyComponentExprs(el, props) {

		// TODO: Does a hash of this already exist somewhere?
		// Perhaps if Components were treated as child NodeGroups, which would need to be the child of an ExprPath,
		// then we could re-use the hash and logic from NodeManager?
		let newHash = getObjectHash(props);

		let isPreHtmlElement = el.tagName.endsWith('-SOLARITE-PLACEHOLDER');
		let isPreIsElement = el.hasAttribute('_is');


		// Instantiate a placeholder.
		if (isPreHtmlElement || isPreIsElement)
			el = this.createNewComponent(el, isPreHtmlElement, props);

		// Update params of placeholder.
		else if (el.render) {
			let oldHash = Globals.componentHash.get(el);
			if (oldHash !== newHash)
				el.render(props); // Pass new values of props to render so it can decide how it wants to respond.
		}

		Globals.componentHash.set(el, newHash);
	}
	
	/**
	 * We swap the placeholder element for the real element so we can pass its dynamic attributes
	 * to its constructor.
	 *
	 * The logic of this function is complex and could use cleaning up.
	 *
	 * @param el
	 * @param isPreHtmlElement
	 * @param props {Object} Attributes with dynamic values.
	 * @return {HTMLElement} */
	createNewComponent(el, isPreHtmlElement=undefined, props=undefined) {
		if (isPreHtmlElement === undefined)
			isPreHtmlElement = !el.hasAttribute('_is');
		
		let tagName = (isPreHtmlElement
			? el.tagName.endsWith('-SOLARITE-PLACEHOLDER')
				? el.tagName.slice(0, -21)
				: el.tagName
			: el.getAttribute('is')).toLowerCase();

		let dynamicProps = {...(props || {})};
		
		// Pass other attribs to constructor, since otherwise they're not yet set on the element,
		// and the constructor would otherwise have no way to see them.
		if (el.attributes.length) {
			if (!props)
				props = {};
			for (let attrib of el.attributes)
				if (!props.hasOwnProperty(attrib.name))
					props[attrib.name] = attrib.value;
		}
		
		// Create CustomElement and
		let Constructor = customElements.get(tagName);
		if (!Constructor)
			throw new Error(`The custom tag name ${tagName} is not registered.`)

		// We pass the childNodes to the constructor so it can know about them,
		// instead of only afterward when they're appended to the slot below.
		// This is useful for a custom selectbox, for example.
		// Globals.pendingChildren stores the childen so the super construtor call to Solarite's constructor
		// can add them as children before the rest of the constructor code executes.
		let ch = [... el.childNodes];
		Globals.pendingChildren.push(ch);  // pop() is called in Solarite constructor.
		let newEl = new Constructor(props, ch);

		if (!isPreHtmlElement)
			newEl.setAttribute('is', el.getAttribute('is').toLowerCase());
		el.replaceWith(newEl);

		// Set children / slot children
		// TODO: Match named slots.
		// TODO: This only appends to slot if render() is called in the constructor.
		//let slot = newEl.querySelector('slot') || newEl;
		//slot.append(...el.childNodes);

		// Copy over event attributes.
		for (let propName in props) {
			let val = props[propName];
			if (propName.startsWith('on') && typeof val === 'function')
				newEl.addEventListener(propName.slice(2), e => val(e, newEl));

			// Bind array based event attributes on value.
			// This same logic is in ExprPath.applyValueAttrib() for non-components.
			if ((propName === 'value' || propName === 'data-value') && Util.isPath(val)) {
				let [obj, path] = [val[0], val.slice(1)];
				newEl.value = delve(obj, path);
				newEl.addEventListener('input', e => {
					delve(obj, path, Util.getInputValue(newEl));
				}, true); // We use capture so we update the values before other events added by the user.
			}
		}
		
		// If an id pointed at the placeholder, update it to point to the new element.
		let id = el.getAttribute('data-id') || el.getAttribute('id');
		if (id)
			delve(this.getRootNode(), id.split(/\./g), newEl);
		
		
		// Update paths to use replaced element.
		for (let path of this.paths) {
			if (path.nodeMarker === el)
				path.nodeMarker = newEl;
			if (path.nodeBefore === el)
				path.nodeBefore = newEl;
		}
		if (this.startNode === el)
			this.startNode = newEl;
		if (this.endNode === el)
			this.endNode = newEl;
		
		
		// applyComponentExprs() is called because we're rendering.
		// So we want to render the sub-component also.
		if (newEl.renderFirstTime)
			newEl.renderFirstTime();
		
		// Copy attributes over.
		for (let attrib of el.attributes)
			if (attrib.name !== '_is')
				newEl.setAttribute(attrib.name, attrib.value);

		// Set dynamic attributes if they are primitive types.
		for (let name in dynamicProps) {
			let val = dynamicProps[name];
			if (typeof val === 'boolean') {
				if (val !== false && val !== undefined && val !== null)
					newEl.setAttribute(name, '');
			}

			// If type isn't an object or array, set the attribute.
			else if (['number', 'bigint', 'string'].includes(typeof val))
				newEl.setAttribute(name, val);
		}
		
		return newEl;
	}

	/**
	 * Get all the nodes inclusive between startNode and endNode.
	 * TODO: when not using nodesCache, could this use less memory with yield?
	 * But we'd need to save the reference to the next Node in case it's removed.
	 * @return {(Node|HTMLElement)[]} */
	getNodes() {
		// applyExprs() invalidates this cache.
		let result = this.nodesCache;
		if (result) // This does speed up the partialUpdate benchmark by 10-15%.
			return result;

		result = [];
		let current = this.startNode;
		let afterLast = this.endNode?.nextSibling;
		while (current && current !== afterLast) {
			result.push(current);
			current = current.nextSibling;
		}

		this.nodesCache = result;
		return result;
	}

	getParentNode() {
		return this.startNode?.parentNode
	}

	/**
	 * Get the root element of the NodeGroup's RootNodeGroup.
	 * @returns {HTMLElement|DocumentFragment} */
	getRootNode() {
		return this.rootNg.root;
	}

	/**
	 * @returns {RootNodeGroup} */
	getRootNodeGroup() {
		return this.rootNg;
	}


	updatePaths(fragment, paths, offset) {
		// Update paths to point to the fragment.
		for (let oldPath of paths) {

			let path = oldPath.clone(fragment, offset);
			path.parentNg = this;
			this.paths.push(path);
		}
	}

	updateStyles() {
		if (this.styles)
			for (let [style, oldText] of this.styles) {
				let newText = style.textContent;
				if (oldText !== newText)
					Util.bindStyles(style, this.getRootNodeGroup().root);
			}
	}

	//#IFDEV
	/**
	 * @deprecated
	 * An interleaved array of sets of nodes and top-level ExprPaths
	 * @type {(Node|HTMLElement|ExprPath)[]} */
	get nodes() { throw new Error('')};
	
	get debug() {
		return [
			`parentNode: ${this.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item instanceof Node) {
					
					let tree = nodeToArrayTree(item, nextNode => {
						
						let path = this.paths.find(path=>path.type === PathType.Content && path.getNodes().includes(nextNode));
						if (path)
							return [`Path.nodes:`]
						
						return [];
					});
					
					// TODO: How to indend nodes belonging to a path vs those that just occur after the path?
					return flattenAndIndent(tree)
				}
				else if (item instanceof ExprPath)
					return setIndent(item.debug, 1)
			}).flat(), 1)
		]
	}

	get debugNodes() { return this.getNodes() }
	
	
	get debugNodesHtml() { return this.getNodes().map(n => n.outerHTML || n.textContent) }
	
	verify() {
		if (!window.verify)
			return;

		assert(this.startNode);
		assert(this.endNode);
		//assert(this.startNode !== this.endNode) // This can be true.
		assert(this.startNode.parentNode === this.endNode.parentNode);

		// Only if connected:
		assert(!this.startNode.parentNode || this.startNode === this.endNode || this.startNode.compareDocumentPosition(this.endNode) === Node.DOCUMENT_POSITION_FOLLOWING);

		// if (this.parentPath)
		// 	assert(this.parentPath.nodeGroups.includes(this));
		
		for (let path of this.paths) {
			assert(path.parentNg === this);

			// Fails for detached NodeGroups.
			// NodeGroups get detached when their nodes are removed by udomdiff()
			let parentNode = this.getParentNode();
			if (parentNode)
				assert(this.getParentNode().contains(path.getParentNode()));
			path.verify();
			// TODO: Make sure path nodes are all within our own node range.
		}
		return true;
	}
	//#ENDIF


	/**
	 * @param root {HTMLElement}
	 * @param shell {Shell} */
	activateEmbeds(root, shell, pathOffset=0) {

		// static components.  These are WebComponents not created by an expression.
		// Must happen before ids.
		for (let path of shell.staticComponents) {
			if (pathOffset)
				path = path.slice(0, -pathOffset);
			let el = resolveNodePath(root, path);

			// Shell doesn't know if a web component is the pseudoRoot so we have to detect it here.
			if (root !== el/* && !isReplaceEl(root, el)*/) // TODO: is isReplaceEl necessary?
				this.createNewComponent(el);
		}

		let rootEl = this.rootNg.root;
		if (rootEl) {

			// ids
			if (this.options?.ids !== false)
				for (let path of shell.ids) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let el = resolveNodePath(root, path);
					let id = el.getAttribute('data-id') || el.getAttribute('id');
					if (id) { // If something hasn't removed the id.

						// Don't allow overwriting existing class properties if they already have a non-Node value.
						if (rootEl[id] && !(rootEl[id] instanceof Node))
							throw new Error(`${rootEl.constructor.name}.${id} already has a value.  ` +
								`Can't set it as a reference to <${el.tagName.toLowerCase()} id="${id}">`);

						delve(rootEl, id.split(/\./g), el);
					}
				}

			// styles
			if (this.options?.styles !== false) {
				if (shell.styles.length)
					this.styles = new Map();
				for (let path of shell.styles) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let style = resolveNodePath(root, path);
					Util.bindStyles(style, rootEl);
					this.styles.set(style, style.textContent);
				}

			}
			// scripts
			if (this.options?.scripts !== false) {
				for (let path of shell.scripts) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let script = resolveNodePath(root, path);
					eval(script.textContent);
				}
			}
		}
	}
}


class RootNodeGroup extends NodeGroup {

	/**
	 * Root node at the top of the hierarchy.
	 * @type {HTMLElement} */
	root;

	/**
	 *
	 * @param template
	 * @param el
	 * @param options {?object}
	 */
	constructor(template, el, options) {
		super(template);

		this.options = options;

		this.rootNg = this;
		let [fragment, shell] = this.init(template);

		// If adding NodeGroup to an element.
		let offset = 0;
		let root = fragment; // TODO: Rename so it's not confused with this.root.
		if (el) {

			// Save slot children
			let slotFragment;
			if (el.childNodes.length) {
				slotFragment = document.createDocumentFragment();
				slotFragment.append(...el.childNodes);
			}

			this.root = el;

			// If el should replace the root node of the fragment.
			if (isReplaceEl(fragment, el)) {
				el.append(...fragment.children[0].childNodes);

				// Copy attributes
				for (let attrib of fragment.children[0].attributes)
					if (!el.hasAttribute(attrib.name))
						el.setAttribute(attrib.name, attrib.value);

				// Go one level deeper into all of shell's paths.
				offset = 1;
			}
			else {
				let isEmpty = fragment.childNodes.length === 1 && fragment.childNodes[0].nodeType === 3 && fragment.childNodes[0].textContent === '';
				if (!isEmpty)
					el.append(...fragment.childNodes);
			}

			// Setup slots
			if (slotFragment) {
				for (let slot of el.querySelectorAll('slot[name]')) {
					let name = slot.getAttribute('name');
					if (name) {
						let slotChildren = slotFragment.querySelectorAll(`[slot='${name}']`);
						slot.append(...slotChildren);
					}
				}
				let unamedSlot = el.querySelector('slot:not([name])');
				if (unamedSlot)
					unamedSlot.append(slotFragment);
				else
					el.append(slotFragment);
			}

			root = el;
			this.startNode = el;
			this.endNode = el;
		}
		else {
			let singleEl = getSingleEl(fragment);
			this.root = singleEl || fragment; // We return the whole fragment when calling r() with a collection of nodes.
			if (singleEl) {
				root = singleEl;
				offset = 1;
			}
		}

		this.updatePaths(root, shell.paths, offset);

		this.activateEmbeds(root, shell, offset);

		// Apply exprs
		this.applyExprs(template.exprs);
	}
}

function getSingleEl(fragment) {
	let nonempty = [];
	for (let n of fragment.childNodes) {
		if (n.nodeType === 1 || n.nodeType === 3 && n.textContent.trim().length) {
			if (nonempty.length)
				return null;
			nonempty.push(n);
		}
	}
	return nonempty[0];
}

/**
 * Does the fragment have one child that's an element matching the tagname of el?
 * @param fragment {DocumentFragment}
 * @param el {HTMLElement}
 * @returns {boolean} */
function isReplaceEl(fragment, el) {
	return el.tagName.includes('-')
		&& fragment.children.length===1
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === el.tagName;
}

/**
 * The html strings and evaluated expressions from an html tagged template.
 * A unique Template is created for each item in a loop.
 * Although the reference to the html strings is shared among templates. */
class Template {

	/** @type {(Template|string|function)|(Template|string|function)[]} Evaulated expressions.  */
	exprs = []

	/** @type {string[]} */
	html = [];

	/** @type {Array} Used for toJSON() and getObjectHash().  Stores values used to quickly create a string hash of this template. */
	hashedFields;

	/**
    * @deprecated
    * @type {ExprPath} Used with forEach() from watch.js
	 * Set in ExprPath.apply() */
	parentPath;

	/** @type {NodeGroup} */
	nodeGroup;

	/**
	 * @type {string[][]} */
	paths = [];

	/**
	 *
	 * @param htmlStrings {string[]}
	 * @param exprs {*[]} */
	constructor(htmlStrings, exprs) {
		this.html = htmlStrings;
		this.exprs = exprs;

		//this.trace = new Error().stack.split(/\n/g)

		// Multiple templates can share the same htmlStrings array.
		//this.hashedFields = [getObjectId(htmlStrings), exprs]

		//#IFDEV
		assert(Array.isArray(htmlStrings));
		assert(Array.isArray(exprs));

		Object.defineProperty(this, 'debug', {
			get() {
				return JSON.stringify([this.html, this.exprs]);
			}
		});
		//#ENDIF
	}

	/**
	 * Called by JSON.serialize when it encounters a Template.
	 * This prevents the hashed version from being too large. */
	toJSON() {
		if (!this.hashedFields)
			this.hashedFields = [getObjectId(this.html, 'Html'), this.exprs];

		return this.hashedFields
	}

	/**
	 * Render the main template, which may indirectly call renderTemplate() to create children.
	 * @param el {HTMLElement}
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} */
	render(el=null, options={}) {
		let ng;
		let standalone = !el;
		let firstTime = false;

		// Rendering a standalone element.
		// TODO: figure out when to not use RootNodeGroup
		if (standalone) {
			ng = new RootNodeGroup(this, null, options);
			el = ng.getRootNode();
			Globals.nodeGroups.set(el, ng);
			firstTime = true;
		}
		else {
			ng = Globals.nodeGroups.get(el);
			if (!ng) {
				ng = new RootNodeGroup(this, el, options);
				Globals.nodeGroups.set(el, ng);
				firstTime = true;
			}
		}

		// Creating the root nodegroup also renders it.
		// If we didn't just create it, we need to render it.
		if (!firstTime) {
			if (this.html?.length === 1 && !this.html[0])
				el.innerHTML = ''; // Fast path for empty component.
			else
				ng.applyExprs(this.exprs);
		}

		return el;
	}

	getExactKey() {
		return getObjectHash(this); // calls this.toJSON().
	}

	getCloseKey() {
		// Use the joined html when debugging?  But it breaks some tests.
		//return '@'+this.html.join('|')

		return '@'+this.hashedFields[0];
	}
}


/**
 * @typedef {Object} RenderOptions
 * @property {boolean=} styles - Replace :host in style tags to scope them locally.
 * @property {boolean=} scripts - Execute script tags.
 * @property {boolean=} ids - Create references to elements with id or data-id attributes.
 * @property {?boolean} render - Deprecated.
 * 	 Used only when options are given to a class super constructor inheriting from Solarite.
 *     True to call render() immediately in super constructor.
 *     False to automatically call render() at all.
 *     Undefined (default) to call render() when added to the DOM, unless already rendered.
 */

/**
 * Convert strings to HTMLNodes.
 * Using r as a tag will always create a Template.
 * Using r() as a function() will always create a DOM element.
 *
 * Features beyond what standard js tagged template strings do:
 * 1. r`` sub-expressions
 * 2. functions, nodes, and arrays of nodes as sub-expressions.
 * 3. html-escape all expressions by default, unless wrapped in r()
 * 4. event binding
 * 5. TODO:  list more
 *
 * Currently supported:
 * 1. r(el, options)`<b>${'Hi'}</b>`   // Create template and render its nodes to el.
 * 2. r(el, template, ?options)        // Render the Template created by #1 to element.
 *
 * 3. r`<b>Hello</b> ${'World'}!`      // Create Template that can later be used to create nodes.
 *
 * 4. r('Hello');                      // Create single text node.
 * 5. r('<b>Hello</b>');               // Create single HTMLElement
 * 6. r('<b>Hello</b><u>Goodbye</u>'); // Create document fragment because there's more than one node.
 * 7. r()`Hello<b>${'World'}!</b>`     // Same as 4-6, but evaluates the string as a Solarite template, which
 *                                     // includes properly handling nested components and r`` sub-expressions.
 * 8. r(template)                      // Render Template created by #1.
 *
 * 9. r({render(){...}})              // Pass an object with a render method, and optionally other props/methods.
 *
 * @param htmlStrings {?HTMLElement|string|string[]|function():Template|{render:function()}}
 * @param exprs {*[]|string|Template|Object}
 * @return {Node|HTMLElement|Template} */
function r(htmlStrings=undefined, ...exprs) {

	// TODO: Make this a more flat if/else and call other functions for the logic.
	if (htmlStrings instanceof Node) {
		let parent = htmlStrings, template = exprs[0];

		// 1
		if (!(exprs[0] instanceof Template)) {
			if (parent.shadowRoot)
				parent.innerHTML = ''; // Remove shadowroot.  TODO: This could mess up paths?

			let options = exprs[0];

			// Return a tagged template function that applies the tagged themplate to parent.
			let taggedTemplate = (htmlStrings, ...exprs) => {
				Globals.rendered.add(parent);
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			};
			return taggedTemplate;
		}

		// 2. Render template created by #4 to element.
		else if (exprs[0] instanceof Template) {
			let options = exprs[1];
			template.render(parent, options);

			// Append on the first go.
			if (!parent.childNodes.length && this) {
				// TODO: Is this ever executed?
				debugger;
				parent.append(this.rootNg.getParentNode());
			}
		}



		// null for expr[0], remove whole element.
		   // This path never happens?
		else {
			throw new Error('unsupported');
			//let ngm = NodeGroupManager.get(parent);
			//ngm.render(null, exprs[1])
		}
	}

	// 3. Path if used as a template tag.
	else if (Array.isArray(htmlStrings)) {
		return new Template(htmlStrings, exprs);
	}

	else if (typeof htmlStrings === 'string' || htmlStrings instanceof String) {
		// If it starts with a string, trim both ends.
		// TODO: Also trim if it ends with whitespace?
		if (htmlStrings.match(/^\s^</))
			htmlStrings = htmlStrings.trim();

		// We create a new one each time because otherwise
		// the returned fragment will have its content replaced by a subsequent call.
		let templateEl = document.createElement('template');
		templateEl.innerHTML = htmlStrings;

		// 4+5. Return Node if there's one child.
		let relevantNodes = Util.trimEmptyNodes(templateEl.content.childNodes);
		if (relevantNodes.length === 1)
			return relevantNodes[0];

		// 6. Otherwise return DocumentFragment.
		return templateEl.content;
	}

	// 7. Create a static element
	else if (htmlStrings === undefined) {
		return (htmlStrings, ...exprs) => {
			//Globals.rendered.add(parent)
			let template = r(htmlStrings, ...exprs);
			return template.render();
		}
	}

	// 8.
	else if (htmlStrings instanceof Template) {
		return htmlStrings.render();
	}


	// 9. Create dynamic element with render() function.
	else if (typeof htmlStrings === 'object') {
		let obj = htmlStrings;

		// Special rebound render path, called by normal path.
		if (Globals.objToEl.has(obj)) {
			return function(...args) {
			   let template = r(...args);
			   let el = template.render();
				Globals.objToEl.set(obj, el);
			}.bind(obj);
		}

		// Normal path
		else {
			Globals.objToEl.set(obj, null);
			obj.render(); // Calls the Special rebound render path above, when the render function calls r(this)
			let el = Globals.objToEl.get(obj);
			Globals.objToEl.delete(obj);

			for (let name in obj)
				if (typeof obj[name] === 'function')
					el[name] = obj[name].bind(el);
				else
					el[name] = obj[name];

			return el;
		}
	}

	else
		throw new Error('Unsupported arguments.')
}

//import {watchGet, watchSet} from "./watch.js";



function defineClass(Class, tagName, extendsTag) {
	if (!customElements.getName(Class)) { // If not previously defined.
		tagName = tagName || camelToDashes(Class.name);
		if (!tagName.includes('-'))
			tagName += '-element';

		let options = null;
		if (extendsTag)
			options = {extends: extendsTag};

		customElements.define(tagName, Class, options);
	}
}





/**
 * Create a version of the Solarite class that extends from the given tag name.
 * Reasons to inherit from this instead of HTMLElement.  None of these are all that useful.
 * 1.  customElements.define() is called automatically when you create the first instance.
 * 2.  Calls render() when added to the DOM, if it hasn't been called already.
 * 3.  Child elements are added before constructor is called.  But they're also passed to the constructor.
 * 4.  We can use this.html = r`...` to set html.
 * 5.  We have the onConnect, onFirstConnect, and onDisconnect methods.
 *     Can't figure out how to have these work standalone though, and still be synchronous.
 * 6.  Can we extend from other element types like TR?
 * 7.  Shows default text if render() function isn't defined.
 *
 * Advantages to inheriting from HTMLElement
 * 1.  Minimization won't break when it renames the Class and we call customElements.define() on the wrong name.
 * 2.  We can inherit from things like HTMLTableRowElement directly.
 * 3.  There's less magic, since everyone is familiar with defining custom elements.
 *
 * @param extendsTag {?string}
 * @return {Class} */
function createSolarite(extendsTag=null) {

	let BaseClass = HTMLElement;
	if (extendsTag && !extendsTag.includes('-')) {
		extendsTag = extendsTag.toLowerCase();

		BaseClass = Globals.elementClasses[extendsTag];
		if (!BaseClass) { // TODO: Use Cache
			BaseClass = document.createElement(extendsTag).constructor;
			Globals.elementClasses[extendsTag] = BaseClass;
		}
	}

	/**
	 * Intercept the construct call to auto-define the class before the constructor is called.
	 * @type {HTMLElement} */
	let HTMLElementAutoDefine = new Proxy(BaseClass, {
		construct(Parent, args, Class) {
			defineClass(Class, null, extendsTag);

			// This is a good place to manipulate any args before they're sent to the constructor.
			// Such as loading them from attributes, if I could find a way to do so.

			// This line is equivalent the to super() call.
			return Reflect.construct(Parent, args, Class);
		}
	});

	return class Solarite extends HTMLElementAutoDefine {
		
		
		/**
		 * TODO: Make these standalone functions.
		 * Callbacks.
		 * Use onConnect.push(() => ...); to add new callbacks. */
		onConnect = Util$1.callback();
		
		onFirstConnect = Util$1.callback();
		onDisconnect = Util$1.callback();

		/**
		 * @param options {RenderOptions} */
		constructor(options={}) {
			super();

			// TODO: Is options.render ever used?
			if (options.render===true)
				this.render();

			else if (options.render===false)
				Globals.rendered.add(this); // Don't render on connectedCallback()

			// Add children before constructor code executes.
			// PendingChildren is setup in NodeGroup.createNewComponent()
			// TODO: Match named slots.
			let ch = Globals.pendingChildren.pop();
			if (ch)
				(this.querySelector('slot') || this).append(...ch);

			/** @deprecated */
			Object.defineProperty(this, 'html', {
				set(html) {
					Globals.rendered.add(this);
					if (typeof html === 'string') {
						console.warn("Assigning to this.html without the r template prefix.");
						this.innerHTML = html;
					}
					else
						this.modifications = r(this, html, options);
				}
			});

			/*
			let pthis = new Proxy(this, {
				get(obj, prop) {
					return Reflect.get(obj, prop)
				}
			});
			this.render = this.render.bind(pthis);
			*/
		}

		/**
		 * Call render() only if it hasn't already been called.	 */
		renderFirstTime() {
			if (!Globals.rendered.has(this) && this.render)
				this.render();
		}
		
		/**
		 * Called automatically by the browser. */
		connectedCallback() {
			this.renderFirstTime();
			if (!Globals.connected.has(this)) {
				Globals.connected.add(this);
				this.onFirstConnect();
			}
			this.onConnect();
		}
		
		disconnectedCallback() {
			this.onDisconnect();
		}


		static define(tagName=null) {
			defineClass(this, tagName, extendsTag);
		}

		//#IFDEV

		/** @deprecated */
		renderWatched() {
			let ngm = NodeGroupManager.get(this);

			let nodeGroupUpdates = [];

			for (let change of ngm.changes) {
				if (change.action === 'set') {
					for (let transformerInfo of change.transformerInfo) {

						let oldHash = transformerInfo.hash;

						let newObj = delve(watchSet(transformerInfo.path[0]), transformerInfo.path.slice(1));
						let newTemplate = transformerInfo.transformer(newObj);
						let newHash = getObjectHash(newTemplate);
						let ngs = [...ngm.nodeGroupsAvailable.data[oldHash]];
						for (let ng of ngs) {
							nodeGroupUpdates.push([ng, oldHash, newHash, newTemplate.exprs, transformerInfo]);
						}
					}
				}

				else if (change.action === 'delete') {
					for (let hash of change.value) {
						let ngs = [...ngm.nodeGroupsAvailable.getAll(hash)]; // deletes from nodeGroupsAvailable.

						for (let ng of ngs) {
							if (ng.parentPath)
								ng.parentPath.clearNodesCache();

							for (let node of ng.getNodes())
								node.remove();

							// TODO: Update ancestor NodeGroup exactKeys
						}
					}
				}
				else if (change.action === 'insert') {

					let beforeNg = change.beforeTemplate ? ngm.getNodeGroup(change.beforeTemplate, true) : null;
					let arrayPath = [change.root, ...change.path];

					// Get anchor so we can use it to get the parent
					// TODO: Should this be watchGet(change.root) ?
					for (let loopInfo of ngm.getLoopInfo([change.root, ...change.path.slice(0, -1)])) {

						// Change.extra is aTemplate telling us where to insert before.
						let beforeNode = beforeNg?.startNode || loopInfo.template.parentPath.nodeMarker;

						// Loop over every item added to the array.
						let i = 0; // TODO: How to get real insert index.
						for (let obj of change.value) {

							// Same logic as forEach() function.

							let callback = loopInfo.itemTransformer;
							let path = [...arrayPath.slice(0, -1), (arrayPath.at(-1) * 1 + i) + ''];

							// Shortened logic found in watchGet(), but not any faster?
							// the watchSet() is what makes this slower!
							// let obj = delve(watchSet(path[0]), path.slice(1));
							// let template = callback(obj);
							// let serializedPath = serializePath(path);
							// pathToTransformer.add(serializedPath, new TransformerInfo(path, callback, template)); // Uses a Set() to ensure no duplicates.

							let template = watchGet(path, callback);
							i++;


							//let template = loopInfo.itemTransformer(obj); // What if it takes more than one obj argument?

							// Create new NodeGroup
							let ng = ngm.getNodeGroup(template, false, true);
							ng.parentPath = beforeNg?.parentPath || loopInfo.template.parentPath;

							for (let node of ng.getNodes())
								beforeNode.parentNode.insertBefore(node, beforeNode);

							if (ng.parentPath) // This check is needed for the forEachSpliceInsert test, but why?
								ng.parentPath.clearNodesCache();
						}

						// TODO: Update ancestor NodeGroup exactKeys
					}
				}
			}

			// Update them all at once, that way we can reassign the same value twice.
			for (let [ng, oldHash, newHash, exprs, ti] of nodeGroupUpdates) {
				ng.applyExprs(exprs);
				ngm.nodeGroupsAvailable.data[oldHash].delete(ng);
				ng.exactKey = ti.hash = newHash;
				ngm.nodeGroupsAvailable.add(ng.exactKey, ng); // Add back to Map with new key.
			}


			ngm.changes = [];

			return []; // TODO
		}
		
		/**
		 * @deprecated Use the getArg() function instead. */
		getArg(name, val=null, type=ArgType.String) {
			throw new Error('deprecated');
		}
		//#ENDIF
	}
}

/**
 * Solarite JavasCript UI library.
 * MIT License
 * https://vorticode.github.io/solarite/
 */

/**
 * TODO: The Proxy and the multiple base classes mess up 'instanceof Solarite'
 * @type {Node|Class<HTMLElement>|function(tagName:string):Node|Class<HTMLElement>} */
let Solarite = new Proxy(createSolarite(), {
	apply(self, _, args) {
		return createSolarite(...args)
	}
});
let getInputValue = Util.getInputValue;

//Experimental:
//export {forEach, watchGet, watchSet} from './watch.js' // old, unfinished
//export {watch} from './watch2.js'; // unfinished

export { ArgType, Globals, Solarite, Template, delve, getArg, getInputValue, r };
