

let lastObjectId = 1>>>0; // Is a 32-bit int faster to increment than JavaScript's Number, which is a 64-bit float?
let objectIds = new WeakMap();

/**
 * @param obj {Object|string|Node}
 * @returns {string} */
function getObjectId(obj) {
	// if (typeof obj === 'function')
	// 	return obj.toString(); // This fails to detect when a function's bound variables changes.
	
	let result = objectIds.get(obj);
	if (result===undefined) { // convert to string, store in result, then add 1 to lastObjectId.
		result = '~@' + (lastObjectId++); // We use a unique, 2-byte prefix to ensure it doesn't collide w/ strings not from getObjectId()
		objectIds.set(obj, result);
	}
	return result;
}

/**
 * Control how JSON.stringify() handles Nodes and Functions.
 * Normally, we'd pass a replacer() function argument to JSON.stringify() to handle Nodes and Functions.
 * But that makes JSON.stringify() take twice as long to run.
 * Adding a toJSON method globally on these object prototypes doesn't incur that performance penalty.
 * TODO: This needs to be benchmarked again after the json rewrite in Chrome 138. */
let isHashing = true;
function toJSON() {
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
 * Note that passing an integer may collide with the number we get from hashing an object.
 * But we don't handle that case because we need max performance and Solarite never passes integers to this function.
 *
 * @param obj {*}
 * @returns {string} */
function getObjectHash(obj) {

	// Sometimes these get unassigned by Chrome and Brave 119, as well as Firefox, seemingly randomly!
	// The same tests sometimes pass, sometimes fail, even after browser and OS restarts.
	// So we check the assignments on every run of getObjectHash()
	// TODO: Cache references to Node.prototype and Function.prototype:
	if (Node.prototype.toJSON !== toJSON) {
		Node.prototype.toJSON = toJSON;
		if (Function.prototype.toJSON !== toJSON) // Will it only unmap one but not the other?
			Function.prototype.toJSON = toJSON;
	}

	isHashing = true;
	try {
		return JSON.stringify(obj);
	}
	catch(e) {
		return getObjectHashCircular(obj);
	}
	finally {
		isHashing = false;
	}
}

/**
 * Slower hashing method that supports circular references.
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

var Globals;

/**
 * Created with a reset() function because it's useful for testing. */
function reset() {
	Globals = {

		/**
		 * Store which instances of Solarite have already been added to the DOM.
		 * @type {WeakSet<HTMLElement>} */
		connected: new WeakSet(),

		/**
		 * ExprPath.applyExactNodes() sets this property when an expression is being accessed.
		 * watch() then adds the ExprPath to the list of ExprPaths that should be re-rendered when the value changes.
		 * @type {ExprPath}*/
		currentExprPath: null,

		/**
		 * Set by NodeGroup.instantiateComponent()
		 * Used by RootNodeGroup.getSlotChildren(). */
		currentSlotChildren: null,

		div: document.createElement("div"),

		/** @type {HTMLDocument} */
		doc: document,

		/**
		 * @type {Record<string, Class<Node>>} A map from built-in tag names to the constructors that create them. */
		elementClasses: {},

		/** @type {Record<string, boolean>} Key is tag-name.propName.  Value is whether it's an attribute.*/
		htmlProps: {},

		/**
		 * Used by ExprPath.applyEventAttrib()
		 * @type {WeakMap<Node, Record<eventName:string, [original:function, bound:function, args:*[]]>>} */
		nodeEvents: new WeakMap(),

		/**
		 * Get the RootNodeGroup for an element.
		 * @type {WeakMap<HTMLElement, RootNodeGroup>} */
		rootNodeGroups: new WeakMap(),

		/**
		 * Used by h() path 9. */
		objToEl: new WeakMap(),

		/**
		 * Elements that have been rendered to by h() at least once.
		 * This is used by the Solarite class to know when to call onFirstConnect()
		 * @type {WeakSet<HTMLElement>} */
		rendered: new WeakSet(),

		/**
		 * Map from array of Html strings to a Shell created from them.
		 * @type {WeakMap<string[], Shell>} */
		shells: new WeakMap(),

		/**
		 * A map of individual untagged strings to their Templates.
		 * This way we don't keep creating new Templates for the same string when re-rendering.
		 * This is used by ExprPath.applyExactNodes()
		 * @type {Record<string, Template>} */
		//stringTemplates: {},

		reset
	};
}
reset();

var Globals$1 = Globals;

/**
 * Follow a path into an object.
 * @param obj {object}
 * @param path {string[]}
 * @param createVal {*}  If set, non-existent paths will be created and value at path will be set to createVal.
 * @return {*} The value, or undefined if it can't be reached. */
function delve(obj, path, createVal = d) {
	let isCreate = createVal !== d;

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

// d means "don't create"
let d = {};

let Util = {

	/**
	 * Returns true if they're the same.
	 * @param a
	 * @param b
	 * @returns {boolean} */
	arraySame(a, b) {
		let aLength = a.length;
		if (aLength !== b.length)
			return false;
		for (let i=0; i<aLength; i++)
			if (a[i] !== b[i])
				return false;
		return true; // the same.
	},

	/**
	 * Convert HTMLElement attributes to an object.
	 * Converts dash (kebob-case) attribute names to camelCase.
	 * @param el {HTMLElement}
	 * @param ignore {?string} Optionally ignore this attribute.
	 * @return {Object} */
	attribsToObject(el, ignore=null) {
		let result = {};
		for (let attrib of el.attributes)
			if (attrib.name !== ignore)
				result[Util.dashesToCamel(attrib.name)] = attrib.value;
		return result;
	},

	bindId(root, el) {
		let id = el.getAttribute('data-id') || el.getAttribute('id');
		if (id) { // If something hasn't removed the id.

			// Don't allow overwriting existing class properties if they already have a non-Node value.
			if (root[id] && !(root[id]?.nodeType))
				throw new Error(`${root.constructor.name}.${id} already has a value.  ` +
					`Can't set it as a reference to <${el.tagName.toLowerCase()} id="${id}">`);

			delve(root, id.split(/\./g), el);
		}
	},

	/**
	 * If the style tab has a global attribute:
	 * 1.  Put it in the document head as <style data-style="tag-name">...</style>
	 * 2.  Replace the :host {...} CSS selector as tag-name {...}.
	 * Otherwise keep it where it is and:
	 * 1.  Add data-style="1" attribute to the root element.
	 * 2.  Replace the :host {...} selector in the style as tag-name[data-style='1'] {...}
	 * @param style {HTMLStyleElement}
	 * @param root {HTMLElement} */
	bindStyles(style, root) {

		let tagName = root.tagName.toLowerCase();
		let styleId, attribSelector;

		if (style.hasAttribute('global') || style.hasAttribute('data-global')) {
			styleId = tagName;
			attribSelector = '';
			let doc = Globals$1.doc || root.ownerDocument || document;
			if (!doc.head.querySelector(`style[data-style="${styleId}"]`)) {
				doc.head.append(style);
				style.setAttribute('data-style', styleId);
			}
			else // TODO: Make sure the style has no expressions.
				style.remove(); // already in the head.
		}
		else {
			let styleId = root.getAttribute('data-style');
			if (!styleId) {
				// Keep track of one style id for each class.
				// TODO: Put this outside the class in a map, so it doesn't conflict with static properties.
				if (!root.constructor.styleId)
					root.constructor.styleId = 1;
				styleId = root.constructor.styleId++;

				root.setAttribute('data-style', styleId);
			}

			attribSelector = `[data-style="${styleId}"]`;
		}

		// Replace ":host" with "tagName[data-style=...]" in the css.
		for (let child of style.childNodes) {
			if (child.nodeType === 3) {
				let oldText = child.textContent;
				let newText = oldText.replace(/:host(?=[^a-z0-9_])/gi, `${tagName}${attribSelector}`);
				if (oldText !== newText)
					child.textContent = newText;
			}
		}
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
	// *flatten(value) {
	// 	if (Array.isArray(value)) {
	// 		for (const item of value) {
	// 			yield* Util.flatten(item);  // Recursively flatten arrays
	// 		}
	// 	} else if (typeof value === 'function') {
	// 		const result = value();
	// 		yield* Util.flatten(result);  // Recursively flatten the result of a function
	// 	} else
	// 		yield value;  // Yield primitive values as is
	// },

	/**
	 * Get the value of an input as the most appropriate JavaScript type.
	 * @param node {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLElement}
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
		if (node.hasAttribute('contenteditable'))
			return node.innerHTML;

		return node.value; // String
	},

	isEvent(attrName) {
		return attrName.startsWith('on') && attrName in Globals$1.div;
	},

	/**
	 * @param el {HTMLElement}
	 * @param prop {string}
	 * @returns {boolean} */
	isHtmlProp(el, prop) {
		let key = el.tagName + '.' + prop;
		let result = Globals$1.htmlProps[key];
		if (result === undefined) { // Caching just barely makes this slightly faster.
			let proto = Object.getPrototypeOf(el);

			// Find the first HTMLElement that we inherit from (not our own classes)
			while (proto) {
				const ctorName = proto.constructor.name;
				if (ctorName.startsWith('HTML') && ctorName.endsWith('Element'))
					break
				proto = Object.getPrototypeOf(proto);
			}
			Globals$1.htmlProps[key] = result = (proto
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

	/*
	isPrimitive(val) {
		return typeof val === 'string' || typeof val === 'number'
	},*/

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

	saveOrphans(nodes) {
		let fragment = Globals$1.doc.createDocumentFragment();
		fragment.append(...nodes);
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



// For debugging only


var NodePath = {

	/** @return {int[]} Returns indices in reverse order, because doing it that way is faster. */
	get(node) {
		let result = [];
		while(true) {
			let parent = node.parentNode;
			if (!parent)
				break;
			result.push(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
			node = parent;
		}
		return result;
	},

	/**
	 * Note that the path is backward, with the outermost element at the end.
	 * @param root {HTMLElement|Document|DocumentFragment|ParentNode}
	 * @param path {int[]}
	 * @returns {Node|HTMLElement|HTMLStyleElement} */
	resolve(root, path) {
		for (let i=path.length-1; i>=0; i--)
			root = root.childNodes[path[i]];
		return root;
	}
};

/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup. */
class ExprPath {

	/**
	 * @type {ExprPathType} */
	type;

	// Used for attributes:


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
	 * @type {int[]} Path to the node marker, in reverse for performance reasons. */
	nodeMarkerPath;


	/** @type {?function} A function called by renderWatched() to update the value of this expression. */
	watchFunction


	/**
	 * @param nodeBefore {Node}
	 * @param nodeMarker {?Node}
	 * @param type {ExprPathType} */
	constructor(nodeBefore, nodeMarker, type=ExprPathType.Content) {
		this.nodeBefore = nodeBefore;
		this.nodeMarker = nodeMarker;
		this.type = type;

		
	}

	/**
	 * Apply any type of expression.
	 * This calls other apply functions.
	 *
	 * One very messy part of this function is that it may apply multiple expressions if they're all part
	 * of the same attribute value.
	 *
	 * We should modify path.applyValueAttrib so it stores the procssed parts and then only calls
	 * setAttribute() once all the pieces are in place.
	 *
	 * @param exprs {Expr[]}
	 * @param freeNodeGroups {boolean} */
	apply(exprs, freeNodeGroups=true) {
		switch (this.type) {
			case 1: // ExprPathType.Content:
				this.applyNodes(exprs[0], freeNodeGroups);
				break;
			case 2: // ExprPathType.Multiple:
				this.applyMultipleAttribs(this.nodeMarker, exprs[0]);
				break;
			case 4: // ExprPathType.Comment:
				// Expressions inside Html comments.  Deliberately empty because we won't waste time updating them.
				break;
			case 5: // ExprPathType.Event:
				this.applyEventAttrib(this.nodeMarker, exprs[0], this.parentNg.rootNg.root);
				break;
			case 6: // ExprPathType.Component:
				this.applyComponent(exprs);
				break;

			default: // 3 ExprPathType.Attribute
				// One attribute value may have multiple expressions.  Here we apply them all at once.
				this.applyValueAttrib(exprs);
				break;
		}
	}


	/**
	 *
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {ExprPath} */
	clone(newRoot, pathOffset=0) {
		

		// Resolve node paths.
		let nodeMarker, nodeBefore;
		let root = newRoot;
		let path = this.nodeMarkerPath;
		let pathLength = path.length - pathOffset;
		for (let i=pathLength-1; i>0; i--) { // Resolve the path.
			
			root = root.childNodes[path[i]];
		}
		let childNodes = root.childNodes;

		nodeMarker = pathLength
			? childNodes[path[0]]
			: newRoot;
		if (this.nodeBefore) {
			
			nodeBefore = childNodes[this.nodeBeforeIndex];

		}

		let result = new this.constructor(nodeBefore, nodeMarker, this.type, this.attrName, this.attrValue);
		result.isComponent = this.isComponent;

		

		return result;
	}

	// Only used for watch.js
	getNodes() {
		return [this.nodeMarker];
	}

	
}

/**
 * @enum {int}
 * @deprecated for different class types. */
const ExprPathType = {
	/** Child of a node */
	Content: 1, // TODO: Rename to Nodes

	/** One or more whole attributes */
	AttribMultiple: 2,

	/** Value of an attribute. */
	AttribValue: 3,

	/** Expressions inside Html comments. */
	Comment: 4,

	/** Value of an attribute. */
	Event: 5,

	Component: 6
};

class HtmlParser {
	constructor() {
		this.defaultState = {
			context: HtmlParser.Text, // possible values: 'TEXT', 'TAG', 'ATTRIBUTE'
			quote: null, // possible values: null, '"', "'"
			buffer: '',
			lastChar: null
		};
		this.state = {...this.defaultState};
	}

	reset() {
		this.state = {...this.defaultState};
		return this.state.context;
	}

	/**
	 * Parse the next chunk of html, starting with the same context we left off with from the previous chunk.
	 * @param html {string}
	 * @param onContextChange {?function(html:string, index:int, prevContext:string, nextContext:string)}
	 *     Called every time the context changes, and again at the last context.
	 * @return {('Attribute','Text','Tag')} The context at the end of html.  */
	parse(html, onContextChange=null) {
		if (html === null)
			return this.reset();

		for (let i = 0; i < html.length; i++) {
			const char = html[i];
			switch (this.state.context) {
				case HtmlParser.Text:
					if (char === '<' && html[i + 1].match(/[/a-z!]/i)) { // Start of a tag or comment.
						onContextChange?.(html, i, this.state.context, HtmlParser.Tag);
						this.state.context = HtmlParser.Tag;
						this.state.buffer = '';
					}
					break;
				case HtmlParser.Tag:
					if (char === '>') {
						onContextChange?.(html, i+1, this.state.context, HtmlParser.Text);
						this.state.context = HtmlParser.Text;
						this.state.quote = null;
						this.state.buffer = '';
					}
					else if (char === ' ' && !this.state.buffer) {
						// No attribute name is present. Skipping the space.
						continue;
					}
					else if (char === ' ' || char === '/' || char === '?') {
						this.state.buffer = ''; // Reset the buffer when a delimiter or potential self-closing sign is found.
					}
					else if (char === '"' || char === "'" || char === '=') {
						onContextChange?.(html, i, this.state.context, HtmlParser.Attribute);
						this.state.context = HtmlParser.Attribute;
						this.state.quote = char === '=' ? null : char;
						this.state.buffer = '';
					}
					else
						this.state.buffer += char;
					break;
				case HtmlParser.Attribute:
					// Start an attribute quote.
					if (!this.state.quote && !this.state.buffer.length && (char === '"' || char === "'")) {
						this.state.quote = char;
					}
					else if (char === this.state.quote || (!this.state.quote && this.state.buffer.length)) {
						onContextChange?.(html, i, this.state.context, HtmlParser.Tag);
						this.state.context = HtmlParser.Tag;
						this.state.quote = null;
						this.state.buffer = '';
					}
					else if (!this.state.quote && char === '>') {
						onContextChange?.(html, i+1, this.state.context, HtmlParser.Text);
						this.state.context = HtmlParser.Text;
						this.state.quote = null;
						this.state.buffer = '';
					}
					else if (char !== ' ')
						this.state.buffer += char;

					break;
			}
		}
		onContextChange?.(html, html.length, this.state.context, null);
		return this.state.context;
	}
}

HtmlParser.Attribute = 'Attribute';
HtmlParser.Text = 'Text';
HtmlParser.Tag = 'Tag';

class ExprPathAttribValue extends ExprPath {


	/** @type {?string} Used only if type=AttribType.Value. */
	attrName;

	/**
	 * @type {?string[]} Used only if type=AttribType.Value. If null, use one expr to set the whole attribute value. */
	attrValue;

	isHtmlProperty;

	constructor(nodeBefore, nodeMarker, type, attrName=null, attrValue=null) {
		super(nodeBefore, nodeMarker, ExprPathType.AttribValue);
		this.attrName = attrName;
		this.attrValue = attrValue;
	}

	/**
	 * Set the value of an attribute.  This can be for any attribute, not just attributes named "value".
	 * @param exprs */
	// TODO: node is always this.nodeMarker?
	applyValueAttrib(exprs) {
		let node = this.nodeMarker;
		let expr = exprs[0];

		let multiple = this.attrValue;

		// Two-way binding between attributes
		// Passing a path to the value attribute.
		// Copies the attribute to the property when the input event fires.
		// value=${[this, 'value]'}
		// checked=${[this, 'isAgree']}
		// This same logic is in NodeGroup.instantiateComponent() for components.
		if (!multiple && Util.isPath(expr)) {
			let [obj, path] = [expr[0], expr.slice(1)];

			if (!obj)
				throw new Error(`Solarite cannot bind to <${node.tagName.toLowerCase()} ${this.attrName}=\${[${expr.map(item => item ? `'${item}'` : item+'').join(', ')}]}>.`);

			let value = delve(obj, path);

			// Special case to allow setting select-multiple value from an array
			if (this.attrName === 'value' && node.type === 'select-multiple' && Array.isArray(value)) {
				// Set the .selected property on the options having a value within value.
				let strValues = value.map(v => v + '');
				for (let option of node.options)
					option.selected = strValues.includes(option.value);
			}
			else {
				// TODO: should we remove isFalsy, since these are always props?
				const strValue = Util.isFalsy(value) ? '' : value;

				// Special case for contenteditable
				if (this.attrName === 'value' && node.hasAttribute('contenteditable')) {
					const existingValue = node.innerHTML;
					if (strValue !== existingValue)
						node.innerHTML = strValue;
				}
				else {

					// If we don't have this condition, when we call render(), the browser will scroll to the currently
					// selected item in a <select> and mess up manually scrolling to a different value.
					if (strValue !== node[this.attrName])
						node[this.attrName] = strValue;
				}
			}

			// TODO: We need to remove any old listeners, like in bindEventAttribute.
			// Does bindEvent() now handle that?
			let func = () => {
				let value = (this.attrName === 'value')
					? Util.getInputValue(node)
					: node[this.attrName];
				delve(obj, path, value);
			};

			// We use capture so we update the values before other events added by the user.
			// TODO: Bind to scroll events also?
			// What about resize events and width/height?
			this.bindEvent(node, path[0], this.attrName, 'input', func, [], true);
		}

		// Regular attribute
		else {
			// Cache this on ExprPath.isHtmlProperty when Shell creates the props.
			// Have ExprPath.clone() copy .isHtmlProperty?
			let isProp = this.isHtmlProperty;
			if (isProp === undefined)
				isProp = this.isHtmlProperty = Util.isHtmlProp(node, this.attrName);

			// Values to toggle an attribute
			if (!multiple) {
				Globals$1.currentExprPath = this; // Used by watch()
				if (typeof expr === 'function') {
					if (this.isComponent) { // Don't evaluate functions before passing them to components
						return
					}
					this.watchFunction = expr; // The function that gets the expression, used for renderWatched()
					expr = expr();
				}
				else
					expr = Util.makePrimitive(expr);
				Globals$1.currentExprPath = null;
			}


			if (!multiple && (expr === undefined || expr === false || expr === null)) { // Util.isFalsy() inlined.
				if (isProp)
					node[this.attrName] = false;
				node.removeAttribute(this.attrName);
			}
			else if (!multiple && expr === true) {
				if (isProp)
					node[this.attrName] = true;
				node.setAttribute(this.attrName, '');
			}

			// A non-toggled attribute
			else {

				// If it's a series of expressions among strings, join them together.
				let joinedValue = multiple // avoid function call if there are no strings
					? this.getValue(exprs)
					: expr; 	// If the attribute is one expression with no strings

				// Only update attributes if the value has changed.
				// This is needed for setting input.value, .checked, option.selected, etc.

				let oldVal = isProp
					? node[this.attrName]
					: node.getAttribute(this.attrName);
				if (oldVal !== joinedValue) {

					// <textarea value=${expr}></textarea>
					// Without this branch we have no way to set the value of a textarea,
					// since we also prohibit expressions that are a child of textarea.
					if (isProp)
						node[this.attrName] = joinedValue;

						// Allow one-way binding to contenteditable value attribute.
						// Contenteditables normally don't have a value attribute and have their content set via innerHTML.
					// Solarite doesn't allow contenteditables to have expressions as their children.
					else if (this.attrName === 'value' && node.hasAttribute('contenteditable')) {
						node.innerHTML = joinedValue;
					}

					// TODO: Putting an 'else' here would be more performant
					node.setAttribute(this.attrName, joinedValue);
				}
			}
		}
	}

	/**
	 * @param exprs {any[]}
	 * @return {string} The joined values of the expressions, or the first expression if there are no strings. */
	getValue(exprs) {
		if (!this.attrValue)
			return exprs[0];

		let result = [];
		let values = this.attrValue;
		for (let i = 0; i < values.length; i++) {
			result.push(values[i]);
			if (i < values.length - 1) {
				Globals$1.currentExprPath = this; // Used by watch()
				let val = Util.makePrimitive(exprs[i]);
				Globals$1.currentExprPath = null;
				if (!Util.isFalsy(val))
					result.push(val);
			}
		}
		return result.join('')
	}

	/**
	 * Call function when eventName is triggerd on node.
	 * @param node {HTMLElement}
	 * @param root {HTMLElement}
	 * @param key {string}
	 * @param eventName {string}
	 * @param func {function}
	 * @param args {array}
	 * @param capture {boolean} */
	bindEvent(node, root, key, eventName, func, args, capture=false) {
		let nodeEvents = Globals$1.nodeEvents.get(node);
		if (!nodeEvents) {
			nodeEvents = {[key]: new Array(3)};
			Globals$1.nodeEvents.set(node, nodeEvents);
		}
		let nodeEvent = nodeEvents[key];
		if (!nodeEvent)
			nodeEvents[key] = nodeEvent = new Array(3);

		if (typeof func !== 'function')
			throw new Error(`Solarite cannot bind to <${node.tagName.toLowerCase()} ${this.attrName}=\${${func}}> because it's not a function.`);

		// If function has changed, remove and rebind the event.
		if (nodeEvent[0] !== func) {

			// TODO: We should be removing event listeners when calling getNodeGroup(),
			// when we get the node from the list of nodeGroupsAttached/nodeGroupsDetached,
			// instead of only when we rebind an event.
			let [existing, existingBound, _] = nodeEvent;
			if (existing)
				node.removeEventListener(eventName, existingBound, capture);

			let originalFunc = func;

			// BoundFunc sets the "this" variable to be the current Solarite component.
			let boundFunc = (event) => {
				let args = nodeEvent[2];
				return originalFunc.call(root, ...args, event, node);
			};

			// Save both the original and bound functions.
			// Original so we can compare it against a newly assigned function.
			// Bound so we can use it with removeEventListner().
			nodeEvent[0] = originalFunc;
			nodeEvent[1] = boundFunc;

			node.addEventListener(eventName, boundFunc, capture);

			// TODO: classic event attribs?
			//el[attr.name] = e => // e.g. el.onclick = ... // put "event", "el", and "this" in scope for the event code.
			//	(new Function('event', 'el', attr.value)).bind(this.manager.rootEl)(e, el)
		}

		//  Otherwise just update the args to the function.
		nodeEvents[key][2] = args;
	}
}

// TODO: Merge this into ExprPathAttribValue?
class ExprPathEvent extends ExprPathAttribValue {

	constructor(nodeBefore, nodeMarker, type, attrName=null, attrValue=null) {
		super(nodeBefore, nodeMarker, ExprPathType.Event, attrName, attrValue);
		this.type = ExprPathType.Event; // don't let super constructor override it.
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
		

		let eventName = this.attrName.slice(2); // remove "on-" prefix.
		let func;
		let args = [];

		// Convert array to function.
		// oninput=${[this.doSomething, 'meow']}
		if (Array.isArray(expr) && typeof expr[0] === 'function') {
			func = expr[0];
			args = expr.slice(1);
		}
		else if (typeof expr === 'function')
			func = expr;
		else
			throw new Error(`Invalid event binding: <${node.tagName.toLowerCase()} ${this.attrName}=\${${JSON.stringify(expr)}}>`);

		this.bindEvent(node, root, eventName, eventName, func, args);
	}

}

class ExprPathAttribs extends ExprPath {

	/**
	 * @type {Set<string>} Used for type=AttribType.Multiple to remember the attributes that were added. */
	attrNames;

	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker, ExprPathType.AttribMultiple);
		this.attrNames = new Set();
	}

	applyMultipleAttribs(node, expr) {
		

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			if (typeof expr === 'function') {
				Globals$1.currentExprPath = this; // Used by watch()
				this.watchFunction = expr; // used by renderWatched()
				expr = expr();
				Globals$1.currentExprPath = null;
			}

			// Attribute as name: value object.
			if (typeof expr === 'object') {
				for (let name in expr) {
					let value = expr[name];
					if (value === undefined || value === false || value === null)
						continue;
					node.setAttribute(name, value);
					this.attrNames.add(name);
				}
			}

			// Attributes as string
			else {
				let attrs = (expr + '') // Split string into multiple attributes.
					.split(/([\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|\S+))/g)
					.map(text => text.trim())
					.filter(text => text.length);

				for (let attr of attrs) {
					let [name, value] = attr.split(/\s*=\s*/); // split on first equals.
					value = (value || '').replace(/^(['"])(.*)\1$/, '$2'); // trim value quotes if they match.
					node.setAttribute(name, value);
					this.attrNames.add(name);
				}
			}
		}

		// Remove old attributes.
		for (let oldName of oldNames)
			if (!this.attrNames.has(oldName))
				node.removeAttribute(oldName);
	}
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
			}
		}
		// remove head or tail: fast path
		else if (bEnd === bStart) {
			while (aStart < aEnd) {
				// remove the node only if it's unknown or not live
				let aNode = a[aStart];
				if (!map || !map.has(aNode)) {
					parentNode.removeChild(aNode);
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

			let bNode = b[--bEnd];
			parentNode.insertBefore(bNode, node);

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
			}
		}
	}
	return b;
};

class MultiValueMap {

	/** @type {Record<string, Set>} */
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

	isEmpty() {
		for (let key in this.data)
			return true;
		return false;
	}

	/**
	 * Get all values for a key.
	 * @param key {string}
	 * @returns {Set|*[]} */
	getAll(key) {
		return this.data[key] || [];
	}

	/**
	 * Remove one value from a key, and return it.
	 * @param key {string}
	 * @param val If specified, make sure we delete this specific value, if a key exists more than once.
	 * @returns {*|undefined} The deleted item. */
	delete(key, val=undefined) {
		let data = this.data;
		let result;
		let set = data[key];
		if (!set)
			return undefined;

		// Delete any value.
		if (val === undefined) {
			[result] = set; //  Get the first value from the set.
			set.delete(result);
		}

		// Delete a specific value.
		else {
			set.delete(val);
			result = val;
		}

		if (set.size === 0)
			delete data[key];

		return result;
	}

	/**
	 * Remove any one value from a key, and return it.
	 * @param key {string}
	 * @returns {*|undefined} The deleted item. */
	deleteAny(key) {
		let data = this.data;
		let result;
		let set = data[key];
		if (!set) // slower than pre-check.
			return undefined;

		[result] = set; // Get the first value from the set.
		set.delete(result);

		if (set.size === 0)
			delete data[key];

		return result;
	}

	deleteSpecific(key, val) {
		let data = this.data;
		let result;
		let set = data[key];
		if (!set)
			return undefined;

		set.delete(val);
		result = val;

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

class ExprPathNodes extends ExprPath {


	/**
	 * @type {?function} The most recent callback passed to a .map() function in this ExprPath.  This is only used for watch.js
	 * TODO: What if one ExprPath has two .map() calls?  Maybe we just won't support that. */
	mapCallback

	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker, ExprPathType.Content);
	}

	/**
	 * Insert/replace the nodes created by a single expression.
	 * Called by applyExprs()
	 * This function is recursive.  It calls functions that call applyNodes().
	 * @param expr {Expr}
	 * @param freeNodeGroups {boolean}
	 * @return {Node[]} New Nodes created. */
	applyNodes(expr, freeNodeGroups=true) {
		let path = this;

		// This can be done at the beginning or the end of this function.
		// If at the end, we may get rendering done faster.
		// But when at the beginning, it leaves all the nodes in-use so we can do a renderWatched().
		if (freeNodeGroups)
			path.freeNodeGroups();

		

		/** @type {(Node|NodeGroup|Expr)[]} */
		let newNodes = [];
		let oldNodeGroups = path.nodeGroups;
		
		let secondPass = []; // indices

		path.nodeGroups = []; // Reset before applyExactNodes and the code below rebuilds it.
		path.applyExactNodes(expr, newNodes, secondPass);

		//this.existingTextNodes = null;

		// TODO: Create an array of old vs Nodes and NodeGroups together.
		// If they're all the same, skip the next steps.
		// Or calculate it in the loop above as we go?  Have a path.lastNodeGroups property?

		// Second pass to find close-match NodeGroups.
		let flatten = false;
		if (secondPass.length) {
			for (let [nodesIndex, ngIndex] of secondPass) {
				let ng = path.getNodeGroup(newNodes[nodesIndex], false);
				let ngNodes = ng.getNodes();

				

				if (ngNodes.length === 1) // flatten manually so we can skip flattening below.
					newNodes[nodesIndex] = ngNodes[0];

				else {
					newNodes[nodesIndex] = ngNodes;
					flatten = true;
				}
				path.nodeGroups[ngIndex] = ng;
			}

			if (flatten)
				newNodes = newNodes.flat(); // Only if second pass happens.
		}

		

		let oldNodes = path.getNodes();

		// This pre-check makes it a few percent faster?
		let same = Util.arraySame(oldNodes, newNodes);
		if (!same) {

			path.nodesCache = newNodes; // Replaces value set by path.getNodes()

			if (this.parentNg.parentPath)
				this.parentNg.parentPath.clearNodesCache();

			// Fast clear method
			let isNowEmpty = oldNodes.length && !newNodes.length;
			if (!isNowEmpty || !path.fastClear()) {

				if (window.debug)
					debugger;

				// Rearrange nodes.
				udomdiff(path.nodeMarker.parentNode, oldNodes, newNodes, path.nodeMarker);
			}

			// TODO: Put this in a remove() function of NodeGroup.
			// Then only run it on the old nodeGroups that were actually removed.
			//Util.saveOrphans(oldNodeGroups, oldNodes);

			for (let ng of oldNodeGroups)
				if (!ng.startNode.parentNode)
					Util.saveOrphans(ng.getNodes());

			// Instantiate components created within ${...} expressions.
			// Also see this.applyExactNodes() which handles calling render() on web components even if they are unchanged.
			// for (let el of newNodes) {
			// 	if (el?.nodeType === 1) { // HTMLElement
			// 		if (el.hasAttribute('solarite-placeholder'))
			// 			this.parentNg.handleComponent(el, null, true);
			// 		for (let child of el.querySelectorAll('[solarite-placeholder]'))
			// 			this.parentNg.handleComponent(child, null, true);
			// 	}
			// }
		}

		
	}




	/**
	 * Try to apply Nodes that are an exact match, by finding existing nodes from the last render
	 * that have the same value as created by the expr.
	 * This is called from ExprPath.applyNodes().
	 *
	 * @param expr {Template|Node|Array|function|*}
	 * @param newNodes {(Node|Template)[]} An inout parameter; we add the nodes here as we go.
	 * @param secondPass {[int, int][]} Locations within newNodes for ExprPath.applyNodes() to evaluate later,
	 *   when it tries to find partial matches. */
	applyExactNodes(expr, newNodes, secondPass) {

		if (expr instanceof Template) {
			let ng = this.getNodeGroup(expr, true);

			if (ng) {
				let newestNodes = ng.getNodes();
				newNodes.push(...newestNodes);

				// New!
				// Re-apply all expressions if there's a web component, so we can pass them to its constructor.
				// NodeGroup.applyExprs() is used to call applyComponentExprs() on web components that have expression attributes.
				// For those that don't, we call applyComponentExprs() directly here.
				// Also see similar code at the end of this.applyNodes() which handles web components being instantiated the first time.
				// TODO: This adds significant time to the Benchmark.solarite._partialUpdate test.
				let apply = false;
				for (let el of newestNodes) {
					if (el?.nodeType === 1) { // HTMLElement

						// Benchmarking shows that walkDOM is significantly faster than querySelectorAll('*') and document.createTreeWalker.
						walkDOM(el, (child) => {
							//console.log(child)
							if (child.tagName.includes('-')) {
								if (!expr.exprs.find(expr => expr?.nodeMarker === child))
									this.parentNg.handleComponent(child, null, true);
								else
									apply = true;
							}
						});
					}
				}

				// This calls render() on web components that have expressions as attributes.
				if (apply) {
					ng.applyExprs(expr.exprs);
					ng.exactKey = expr.getExactKey();
				}

				this.nodeGroups.push(ng);

				return ng;
			}

			// If expression, mark it to be evaluated later in ExprPath.apply() to find partial match.
			else {
				secondPass.push([newNodes.length, this.nodeGroups.length]);
				newNodes.push(expr);
				this.nodeGroups.push(null); // placeholder
			}
		}
		else if (expr instanceof NodeList) {
			newNodes.push(...expr);
		}

		// Node(s) created by an expression.
		else if (expr?.nodeType) {

			// DocumentFragment created by an expression.
			if (expr?.nodeType === 11) // DocumentFragment
				newNodes.push(...expr.childNodes);
			else
				newNodes.push(expr);
		}

		// Arrays and functions.
		// I tried iterating over the result of a generator function to avoid this recursion and simplify the code,
		// but that consistently made the js-framework-benchmarks a few percentage points slower.
		else
			this.exprToTemplates(expr, template => {
				this.applyExactNodes(template, newNodes, secondPass);
			});
	}




	/**
	 * Used by watch() for inserting/removing/replacing individual loop items.
	 * @param op {ArraySpliceOp} */
	applyWatchArrayOp(op) {

		// Replace NodeGroups
		let replaceCount = Math.min(op.deleteCount, op.items.length);
		let deleteCount = op.deleteCount - replaceCount;
		for (let i=0; i<replaceCount; i++) {
			let oldNg = this.nodeGroups[op.index + i]; // TODO: One expr can create multiple nodegroups.

			// Try to find an exact match
			let func = this.mapCallback || this.watchFunction;
			let expr = func(op.items[i]);

			// If the result of func isn't a template, conver it to one or more templates.
			this.exprToTemplates(expr, template => { // TODO: An expr can create multiple NodeGroups.  I need a way to group them.

				let ng = this.getNodeGroup(template, true);  // Removes from nodeGroupsAttached and adds to nodeGroupsRendered()
				if (ng && ng === oldNg) ; else {

					// Find a close match or create a new node group
					if (!ng)
						ng = this.getNodeGroup(template, false); // adds back to nodeGroupsRendered()
					this.nodeGroups[op.index + i] = ng; // TODO: Remove old one to nodeGroupsDetached?

					// Splice in the new nodes.
					let insertBefore = oldNg.startNode;
					for (let node of ng.getNodes())
						insertBefore.parentNode.insertBefore(node, insertBefore);

					// Remove the old nodes.
					if (ng !== oldNg)
						Util.saveOrphans(oldNg.getNodes());
				}
			});
		}

		// Delete extra at the end.
		if (deleteCount > 0) {
			for (let i=0; i<deleteCount; i++) {
				let oldNg = this.nodeGroups[op.index + replaceCount +  i];
				Util.saveOrphans(oldNg.getNodes());
			}
			this.nodeGroups.splice(op.index + replaceCount, deleteCount);
		}

		// Add extra at the end.
		else {
			let newItems = op.items.slice(replaceCount);

			let insertBefore = this.nodeGroups[op.index + replaceCount]?.startNode || this.nodeMarker;
			for (let i = 0; i < newItems.length; i++) { // We use nodeMarker if the subequent (or all) nodeGroups have been removed.


				// Try to find exact match
				let template = this.mapCallback(newItems[i]);
				let ng = this.getNodeGroup(template, true);  // Removes from nodeGroupsAttached and adds to nodeGroupsRendered()
				if (!ng) 	// Find a close match or create a new node group
					ng = this.getNodeGroup(template, false); // adds back to nodeGroupsRendered()

				this.nodeGroups.push(ng);

				// Splice in the new nodes.
				for (let node of ng.getNodes())
					insertBefore.parentNode.insertBefore(node, insertBefore);
			}
		}

		

		// TODO: update or invalidate the nodes cache?
		this.nodesCache = null;
	}


	/**
	 * Clear the nodeCache of this ExprPath, as well as all parent and child ExprPaths that
	 * share the same DOM parent node. */
	clearNodesCache() {
		let path = this;

		// Clear cache parent ExprPaths that have the same parentNode
		let parentNode = this.nodeMarker.parentNode;
		while (path && path.nodeMarker.parentNode === parentNode) {
			path.nodesCache = null;
			path = path.parentNg?.parentPath;

			// If stuck in an infinite loop here, the problem is likely due to Template hash colisions.
			// Which cause one path to be the descendant of itself, creating a cycle.
		}
	}


	/**
	 * Attempt to remove all of this ExprPath's nodes from the DOM, if it can be done using a special fast method.
	 * @returns {boolean} Returns false if Nodes weren't removed, and they should instead be removed manually. */
	fastClear() {
		let parent = this.nodeBefore.parentNode;
		if (this.nodeBefore === parent.firstChild && this.nodeMarker === parent.lastChild) {

			// If parent is the only child of the grandparent, replace the whole parent.
			// And if it has no siblings, it's not created by a NodeGroup/path.
			// Commented out because this will break any references.
			// And because I don't see much performance difference.
			// let grandparent = parent.parentNode
			// if (grandparent && parent === grandparent.firstChild && parent === grandparent.lastChild && !parent.hasAttribute('id')) {
			// 	let replacement = document.createElement(parent.tagName)
			// 	replacement.append(this.nodeBefore, this.nodeMarker)
			// 	for (let attrib of parent.attributes)
			// 		replacement.setAttribute(attrib.name, attrib.value)
			// 	parent.replaceWith(replacement)
			// }
			// else {
			parent.innerHTML = ''; // Faster than calling .removeChild() a thousand times.
			parent.append(this.nodeBefore, this.nodeMarker);
			//}
			return true;
		}
		return false;
	}

	/**
	 * Recursively traverse expr.
	 * If a value is a function, evaluate it.
	 * If a value is an array, recurse on each item.
	 * If it's a primitive, convert it to a Template.
	 * Otherwise pass the item (which is now either a Template or a Node) to callback.
	 * TODO: This could be static if not for the watch code, which doesn't work anyway.
	 * @param expr
	 * @param callback {function(Node|Template)}*/
	exprToTemplates(expr, callback) {
		if (Array.isArray(expr)) // TODO: use typeof obj[Symbol.iterator] === 'function'  so we can also iterate over objects and NodeList?
			for (let subExpr of expr)
				this.exprToTemplates(subExpr, callback);

		else if (typeof expr === 'function') {
			// TODO: One ExprPath can have multiple expr functions.
			// But if using it as a watch, it should only have one at the top level.
			// So maybe this is ok.
			Globals$1.currentExprPath = this; // Used by watch()

			this.watchFunction = expr; // TODO: Only do this if it's a top level function.
			expr = expr(); // As expr accesses watched variables, watch() uses Globals.currentExprPath to mark where those watched variables are being used.
			Globals$1.currentExprPath = null;

			this.exprToTemplates(expr, callback);
		}

		// String/Number/Date/Boolean
		else if (!(expr instanceof Template) && !(expr?.nodeType)){
			// Convert expression to a string.
			if (expr === undefined || expr === false || expr === null) // Util.isFalsy() inlined
				expr = '';
			else if (typeof expr !== 'string')
				expr += '';

			// Get the same Template for the same string each time.
			// let template = Globals.stringTemplates[expr];
			// if (!template) {

			let template = new Template([expr], []);
			template.isText = true;
			//	Globals.stringTemplates[expr] = template;
			//}

			// Recurse.
			this.exprToTemplates(template, callback);
		}
		else
			callback(expr);
	}

	/**
	 * Get an unused NodeGroup that matches the template's html and expressions (exact=true)
	 * or at least the html (exact=false).
	 * Remove it from nodeGroupsFree if it exists, or create it if not.
	 * Then add it to nodeGroupsInUse.
	 *
	 * @param template {Template}
	 * @param exact {boolean}
	 *     If true, return an exact match, or null.
	 *     If false, either find a match for the template's html and then apply the template's expressions,
	 *         or createa  new NodeGroup from the template.
	 * @return {NodeGroup} */
	getNodeGroup(template, exact=true) {
		let result;
		let collection = this.nodeGroupsAttachedAvailable;

		// TODO: Would it be faster to maintain a separate list of detached nodegroups?
		if (exact) { // [below] parentElement will be null if the parent is a DocumentFragment
			result = collection.deleteAny(template.getExactKey());
			if (!result) { // try searching detached
				collection = this.nodeGroupsDetachedAvailable;
				result = collection.deleteAny(template.getExactKey());
			}

			if (result) {// also delete the matching close key.
				collection.deleteSpecific(template.getCloseKey(), result);

				//result.applyExprs(template.exprs);
			}
			else
				return null;
		}

			// Find a close match.
			// This is a match that has matching html, but different expressions applied.
			// We can then apply the expressions to make it an exact match.
		// If the template has no expressions, the key is the html, and we've already searched for an exact match.  There won't be an inexact match.
		else if (template.exprs.length) {
			result = collection.deleteAny(template.getCloseKey());
			if (!result) { // try searching detached
				collection = this.nodeGroupsDetachedAvailable;
				result = collection.deleteAny(template.getCloseKey());
			}

			if (result) {
				
				collection.deleteSpecific(result.exactKey, result);

				// Update this close match with the new expression values.
				result.applyExprs(template.exprs);
				result.exactKey = template.getExactKey();
			}
		}

		if (!result) {
			result = new NodeGroup(template, this);
			result.applyExprs(template.exprs);
			result.exactKey = template.getExactKey();

			// TODO: All tests still pass if this is commetned out:
			// Perhaps I need a test with a child NodeGroup instantiating a static component?
			result.instantiateStaticComponents(result.staticComponents);
		}


		this.nodeGroupsRendered.push(result);

		
		return result;
	}




	/**
	 * TODO: Rename this to nodeGroupsInUse, nodeGroupsAvialableAttached and nodeGroupsAvailableDetached?
	 * Nodes that have been used during the current render().
	 * Used with getNodeGroup() and freeNodeGroups().
	 * TODO: Use an array of WeakRef so the gc can collect them?
	 * TODO: Put items back in nodeGroupsInUse after applyExpr() is called, not before.
	 * @type {NodeGroup[]} */
	nodeGroupsRendered = [];

	/**
	 * Nodes that were added to the web component during the last render(), but are available to be used again.
	 * Used with getNodeGroup() and freeNodeGroups().
	 * Each NodeGroup is here twice, once under an exact key, and once under the close key.
	 * @type {MultiValueMap<key:string, value:NodeGroup>} */
	nodeGroupsAttachedAvailable = new MultiValueMap();

	/**
	 * Nodes that were not added to the web component during the last render(), and available to be used again.
	 * @type {MultiValueMap} */
	nodeGroupsDetachedAvailable = new MultiValueMap();


	/**
	 * Move everything from this.nodeGroupsRendered to this.nodeGroupsAttached and nodeGroupsDetached.
	 * Called at the beginning of applyNodes() so it can have NodeGroups to use.
	 * TODO: this could run as needed in getNodeGroup? */
	freeNodeGroups() {
		// Add nodes that weren't used during render() to nodeGroupsDetached
		let previouslyAttached = this.nodeGroupsAttachedAvailable.data;
		let detached = this.nodeGroupsDetachedAvailable.data;
		for (let key in previouslyAttached) {
			let set = detached[key];
			if (!set)
				detached[key] = previouslyAttached[key];
			else
				for (let ng of previouslyAttached[key])
					set.add(ng);
		}

		// Add nodes that were used during render() to nodeGroupsRendered.
		this.nodeGroupsAttachedAvailable = new MultiValueMap();
		let nga = this.nodeGroupsAttachedAvailable;
		for (let ng of this.nodeGroupsRendered) {
			nga.add(ng.exactKey, ng);
			nga.add(ng.closeKey, ng);
		}

		this.nodeGroupsRendered = [];
	}



	/**
	 * If not for watch.js, this could be moved to ExprPathNodes.js
	 * @return {(Node|HTMLElement)[]} */
	getNodes() {

		// Why doesn't this work?
		// let result2 = [];
		// for (let ng of this.nodeGroups)
		// 	result2.push(...ng.getNodes())
		// return result2;

		// if (this.type === ExprPathType.AttribValue || this.type === ExprPathType.AttribMultiple) {
		// 	return [this.nodeMarker];
		// }

		let result;

		// This shaves about 5ms off the partialUpdate benchmark.
		result = this.nodesCache;
		if (result) {
			
			return result
		}

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

	
}


function walkDOM(el, callback) {
	callback(el);
	let child = el.firstElementChild;
	while (child) {
		walkDOM(child, callback);
		child = child.nextElementSibling;
	}
}

class ExprPathComponent extends ExprPath {

	/** @type {ExprPathAttribValue[]} Paths to dynamics attributes that will be set on the component.*/
	attribPaths;

	rendered = false;

	constructor(nodeBefore, nodeMarker) {
		super(null, nodeMarker, ExprPathType.Component);
	}

	clone(newRoot, pathOffset=0) {
		let result = super.clone(newRoot, pathOffset);

		// Untested:
		result.attribPaths = this.attribPaths.map(path => path.clone(newRoot, pathOffset));
		return result;
	}


	/**
	 * Call render() on the component pointed to by this ExprPath.
	 * And instantiate it (from a -solarite-placeholder element) if it hasn't been done yet. */
	applyComponent(attribExprs) {
		let el = this.nodeMarker;

		// 1. Attributes
		// TODO: Stop using the solarite-placeholder attribute.
		let attribs = Util.attribsToObject(el, 'solarite-placeholder');
		for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
			let name = Util.dashesToCamel(attribPath.attrName);
			attribs[name] = attribPath.getValue(attribExprs[i]);
		}

		// 2. Instantiate component on first time.
		if (el.tagName.endsWith('-SOLARITE-PLACEHOLDER')) {


			// 2a. Instantiate component
			let isAttrib = el.getAttribute('_is');
			let tagName = (isAttrib || el.tagName.slice(0, -21)).toLowerCase(); // Remove -SOLARITE-PLACEHOLDER
			let Constructor = customElements.get(tagName);
			if (!Constructor)
				throw new Error(`Must call customElements.define('${tagName}', Class) before using it.`);

			Globals$1.currentSlotChildren = [...el.childNodes]; // TODO: Does this need to be a stack?
			let newEl = new Constructor(attribs);

			// 2b. Copy attributes over.
			if (isAttrib)
				newEl.setAttribute('is', isAttrib);
			for (let attrib of el.attributes)
				if (attrib.name !== '_is' && attrib.name !== 'solarite-placeholder')
					newEl.setAttribute(attrib.name, attrib.value);

			// Set dynamic attributes if they are primitive types.
			for (let name in attribs) {
				let val = attribs[name];
				let valType = typeof val;
				if (valType === 'boolean') {
					if (val !== false && val !== undefined && val !== null) // Util.isFalsy() inlined
						newEl.setAttribute(name, '');
				}

				// If type is a non-boolean primitive, set the attribute value.
				else if (valType==='string' || valType === 'number' || valType==='bigint')
					newEl.setAttribute(name, val);
			}


			// 2c. If an id pointed at the placeholder, update it to point to the new element.
			let id = newEl.getAttribute('data-id') || newEl.getAttribute('id');
			if (id)
				delve(this.getRootNode(), id.split(/\./g), newEl);

			// 2d. Update paths to use replaced element.
			let ng = this.parentNg;
			this.nodeMarker = newEl;
			for (let path of ng.paths) {
				if (path.nodeMarker === el)
					path.nodeMarker = newEl;
				if (path.nodeBefore === el)
					path.nodeBefore = newEl;
			}
			if (ng.startNode === el)
				ng.startNode = newEl;
			if (ng.endNode === el)
				ng.endNode = newEl;


			// 2e. Swap it to the DOM.
			el.replaceWith(newEl);
			el = newEl;

			// 2f. Call render() if it wasn't called by the constructor.
			if (typeof el.render === 'function' && !Globals$1.rendered.has(el)) {
				el.render(attribs);
			}
		}

		// 2f.
		else if (typeof el.render === 'function')
			el.render(attribs);

		Globals$1.currentSlotChildren = null;
	}

	
}

/**
 * A Shell is created from a tagged template expression instantiated as Nodes,
 * but without any expressions filled in.
 * Only one Shell is created for all the items in a loop.
 *
 * When a NodeGroup is created from a Template's html strings,
 * the NodeGroup then clones the Shell's fragment to be its nodes. */
class Shell {

	/**
	 * @type {DocumentFragment|Text} DOM parent of the shell's nodes. */
	fragment;

	/** @type {ExprPath[]} Paths to where expressions should go. */
	paths = [];

	// Elements with events.  Is there a reason to use this?  We already mark event Exprs in Shell.js.
	// events = [];

	/** @type {int[][]} Array of paths */
	ids = [];

	/** @type {int[][]} Array of paths */
	scripts = [];

	/** @type {int[][]} Array of paths */
	styles = [];

	/**
	 * @deprecated for ExprPathComponent
	 * @type {int[][]} Array of paths.  Used by activateEmbeds() to quickly find components. */
	staticComponentPaths = [];

	/**
	 * @deprecated - a short experiment that was never used.
	 * @type {int[][]} Array of paths to all components.  Used by activateEmbeds() to quickly find components. */
	componentPaths = [];

	/** @type {{path:int[], attribs:Record<string, string>}[]} */
	//componentAttribs = [];



	/**
	 * Create the nodes but without filling in the expressions.
	 * This is useful because the expression-less nodes created by a template can be cached.
	 * @param html {string[]} Html strings, split on places where an expression exists.  */
	constructor(html=null) {
		if (!html)
			return;

		

		// If no html tags or entities, just create a text node.
		if (html.length === 1 && !html[0].match(/[<&]/)) {
			this.fragment = Globals$1.doc.createTextNode(html[0]);
			return;
		}


		// 1.  Add placeholders
		let htmlWithPlaceholders = Shell.addPlaceholders(html);

		let template = Globals$1.doc.createElement('template'); // Using a single global template won't keep the nodes as children of the DocumentFragment.
		if (htmlWithPlaceholders)
			template.innerHTML = htmlWithPlaceholders;
		else // Create one text node, so shell isn't empty and NodeGroups created from it have something to point the startNode and endNode at.
			template.content.append(Globals$1.doc.createTextNode(''));
		this.fragment = template.content;

		// 2. Find placeholders
		let node;
		let toRemove = [];
		let placeholdersUsed = 0;
		const walker = Globals$1.doc.createTreeWalker(this.fragment, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT);
		while (node = walker.nextNode()) {

			// Remove previous elements after each iteration, so paths will still be calculated correctly.
			toRemove.map(el => el.remove());
			toRemove = [];
			
			// Replace attributes
			if (node.nodeType === 1) {
				const hasIs = node.hasAttribute('is');
				const isComponent = (hasIs || node.tagName.includes('-')) && node !== this.fragment.firstElementChild;
				const componentAttribPaths = [];

				for (let attr of [...node.attributes]) { // Copy the attributes array b/c we remove attributes with placeholders as we go.

					// Whole attribute
					let matches = attr.name.match(/^[\ue000-\uf8ff]$/);
					if (matches) {
						let path = new ExprPathAttribs(null, node, ExprPathType.AttribMultiple);
						this.paths.push(path);
						if (isComponent)
							componentAttribPaths.push(path);

						placeholdersUsed ++;
						node.removeAttribute(matches[0]); // TODO: Is this necessary?
					}

					// Just the attribute value.
					else {
						let parts = attr.value.split(/[\ue000-\uf8ff]/g);
						if (parts.length > 1) {
							let nonEmptyParts = (parts.length === 2 && !parts[0].length && !parts[1].length) ? null : parts;

							let path = Util.isEvent(attr.name)
								? new ExprPathEvent(null, node, null, attr.name, nonEmptyParts)
								: new ExprPathAttribValue(null, node, null, attr.name, nonEmptyParts);
							this.paths.push(path);
							if (isComponent)
								componentAttribPaths.push(path);

							placeholdersUsed += parts.length - 1;
							node.setAttribute(attr.name, parts.join(''));
						}
					}
				}

				// Web components
				if (isComponent) {
					let path = new ExprPathComponent(null, node, ExprPathType.Component);
					path.attribPaths = componentAttribPaths;
					this.paths.splice(this.paths.length - componentAttribPaths.length, 0, path); // Insert before its componentAttribPaths

					if (hasIs) {
						node.setAttribute('_is', node.getAttribute('is'));
						node.removeAttribute('is');
					}
				}
			}

			// Replace comment placeholders
			else if (node.nodeType === 8 && node.nodeValue === '!✨!') {

				if (node?.parentNode?.closest && node?.parentNode?.closest('[contenteditable]'))
					throw new Error(`Contenteditable can't have expressions inside them. Use <div contenteditable value="\${...}"> instead.`);

				// Get or create nodeBefore.
				let nodeBefore = node.previousSibling; // Can be the same as another Path's nodeMarker.
				if (!nodeBefore) {
					nodeBefore = Globals$1.doc.createComment('ExprPath:'+this.paths.length);
					node.parentNode.insertBefore(nodeBefore, node);
				}
				

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
				

				let path = new ExprPathNodes(nodeBefore, nodeMarker, ExprPathType.Content);
				this.paths.push(path);
				placeholdersUsed ++;
			}

			// Comments become text nodes when inside textareas.
			else if (node.nodeType === 3 && node.parentNode?.tagName === 'TEXTAREA' && node.textContent.includes('<!--!✨!-->'))
				throw new Error(`Textarea can't have expressions inside them. Use <textarea value="\${...}"> instead.`);
			
			
			// Sometimes users will comment out a block of html code that has expressions.
			// Here we look for expressions in comments.
			// We don't actually update them dynamically, but we still add paths for them.
			// That way the expression count still matches.
			else if (node.nodeType === 8) { // Node.COMMENT_NODE
				let parts = node.textContent.split(/[\ue000-\uf8ff]/g);
				for (let i=0; i<parts.length-1; i++) {
					let path = new ExprPath(node.previousSibling, node, ExprPathType.Comment);
					this.paths.push(path);
					placeholdersUsed ++;
				}
			}

			// Replace comment placeholders inside script and style tags, which have become text nodes.
			else if (node.nodeType === 3 && ['SCRIPT', 'STYLE'].includes(node.parentNode?.nodeName)) { // Node.TEXT_NODE
				let parts = node.textContent.split(commentPlaceholder);
				if (parts.length > 1) {

					let placeholders = [];
					for (let i = 0; i<parts.length; i++) {
						let current = Globals$1.doc.createTextNode(parts[i]);
						node.parentNode.insertBefore(current, node);
						if (i > 0)
							placeholders.push(current);
					}

					for (let i=0, node; node=placeholders[i]; i++) {
						let path = new ExprPathNodes(node.previousSibling, node, ExprPathType.Content);
						this.paths.push(path);
						placeholdersUsed ++;

						
					}

					// Removing them here will mess up the treeWalker.
					toRemove.push(node);
				}
			}
		}
		toRemove.map(el => el.remove());

		// Less than or equal because there can be one path to multiple expressions
		// if those expressions are in the same attribute value.
		if (placeholdersUsed !== html.length-1)
			throw new Error(`Could not parse expressions in template.  Check for duplicate attributes or malformed html: ${html.join('${...}')}`);

		// Handle solarite-placeholder's.

		/*
		// Deprecated path:
		// 3. Rename "is" attributes so the Web Components don't instantiate until we have the values of their PathExpr arguments.
		// that happens in NodeGroup.applyComponentExprs()
		// TODO: Move this into step 2 where we handle components.
		for (let el of this.fragment.querySelectorAll('[is]'))
			el.setAttribute('_is', el.getAttribute('is'));

		*/
		for (let path of this.paths) {
			if (path.nodeBefore)
				path.nodeBeforeIndex = Array.prototype.indexOf.call(path.nodeBefore.parentNode.childNodes, path.nodeBefore);

			// Must be calculated after we remove the toRemove nodes:
			path.nodeMarkerPath = NodePath.get(path.nodeMarker);

			// Cache so we don't have to calculate this later inside NodeGroup.applyExprs()
			// if ((path.type === ExprPathType.AttribValue || path.type === ExprPathType.Event) && path.nodeMarker.nodeType === 1 &&
			// 	(path.nodeMarker.tagName.includes('-') || path.nodeMarker.hasAttribute('is'))) {
			// 	path.isComponent = true;
			// }
		}

		this.findEmbeds();


		
	}

	/**
	 * 1. Add a Unicode placeholder char for where expressions go within attributes.
	 * 2. Add a comment placeholder for where expressions are children of other nodes.
	 * 3. Append -solarite-placeholder to the tag names of custom components so that we can instantiate them later
	 *    when we can manually call their constructors with the proper attribute and children arguments from evaluated expressions.
	 * @param htmlChunks {string[]}
	 * @returns {string} Html with the placeholders in place. */
	static addPlaceholders(htmlChunks) {
		let result = [];

		let htmlParser = new HtmlParser(); // Reset the context.
		for (let i = 0; i < htmlChunks.length; i++) {
			let lastHtml = htmlChunks[i];

			// Append -solarite-placholder to web component tags, so we can pass args to them when they're instantiated.
			let lastIndex = 0;
			let context = htmlParser.parse(lastHtml, (html, index, prevContext, nextContext) => { // This function is called every time the html context changes.
				if (lastIndex !== index) {
					let token = html.slice(lastIndex, index);

					if (prevContext === HtmlParser.Tag) {
						// Find Web Component tags and append -solarite-placeholder to their tag names
						// and give them a solarite-placeholder attribute so we can easily find them later.
						// This way we can gather their constructor arguments and their children before we call their constructor.
						// Later, NodeGroup.instantiateComponent() will replace them with the real components.
						// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
						const isWebComponentTagName = /^<\/?[a-z][a-z0-9]*-[a-z0-9-]+/i;
						token = token.replace(isWebComponentTagName, match => match + '-solarite-placeholder solarite-placeholder');
					}

					result.push(token);
				}
				lastIndex = index;
			});

			// Insert placeholders
			if (i < htmlChunks.length - 1) {
				if (context === HtmlParser.Text)
					result.push(commentPlaceholder); // Comment Placeholder. because we can't put text in between <tr> tags for example.
				else
					result.push(String.fromCharCode(attribPlaceholder + i));
			}
		}

		return result.join('');
	}

	/**
	 * We find the path to every embed here once in the Shell, instead of every time a NodeGroup is instantiated.
	 * When a Nodegroup is created, it calls NodeGroup.activateEmbeds() that uses these paths.
	 * Populates:
	 * this.scripts
	 * this.styles
	 * this.ids
	 * this.staticComponents */
	findEmbeds() {
		this.scripts = Array.prototype.map.call(this.fragment.querySelectorAll('scripts'), el => NodePath.get(el));

		// TODO: only find styles that have ExprPaths in them?
		this.styles = Array.prototype.map.call(this.fragment.querySelectorAll('style'), el => NodePath.get(el));

		let idEls = this.fragment.querySelectorAll('[id],[data-id]');

		// Check for valid id names.
		for (let el of idEls) {
			let id = el.getAttribute('data-id') || el.getAttribute('id');
			if (Globals$1.div.hasOwnProperty(id))
				throw new Error(`<${el.tagName.toLowerCase()} id="${id}"> can't override existing HTMLElement id property.`)
		}

		this.ids = Array.prototype.map.call(idEls, el => NodePath.get(el));

		/*
		for (let el of this.fragment.querySelectorAll('*')) {
			if (el.tagName.includes('-') || el.hasAttribute('_is')) {

				let path = NodePath.get(el);
				this.componentPaths.push(path);


				// Dynamic components are components that have attributes with expression values.
				// They are created from applyExprs()
				// But static components are created in a separate path inside the NodeGroup constructor.
				if (!this.paths.find(path => path.nodeMarker === el))
					this.staticComponentPaths.push(path);
			}
		}
		*/
	}

	/**
	 * Get the shell for the html strings.
	 * @param htmlStrings {string[]} Typically comes from a Template.
	 * @returns {Shell} */
	static get(htmlStrings) {
		let result = Globals$1.shells.get(htmlStrings);
		if (!result) {
			result = new Shell(htmlStrings);
			Globals$1.shells.set(htmlStrings, result); // cache
		}

		
		return result;
	}

	
}


const commentPlaceholder = `<!--!✨!-->`;


// We increment the placeholder char as we go because nodes can't have the same attribute more than once.
const attribPlaceholder = 0xe000; // https://en.wikipedia.org/wiki/Private_Use_Areas  6400.

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
	 * An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * TODO: But sometimes startNode and endNode point to the same node.  Document htis inconsistency. */
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
	 * A map between <style> Elements and their text content.
	 * This lets NodeGroup.updateStyles() see when the style text has changed.
	 * @type {?Map<HTMLStyleElement, string>} */
	styles;

	/** @deprecated for components. */
	staticComponents = [];

	/** @type {Template} */
	template;

	/**
	 * Root node at the top of the hierarchy.
	 * Should be moved to RootNodeGroup
	 * @type {HTMLElement} */
	root;


	/**
	 * Create an "instantiated" NodeGroup from a Template and add it to an element.
	 * Don't call applyExprs() yet to apply expressions or instantiate components yet.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param parentPath {?ExprPath}
	 * @param el {?HTMLElement} Optional, pre-existing htmlElement that will be the root.
	 * @param options {?object} Only used for RootNodeGroup */
	constructor(template, parentPath=null, el=null, options=null) {
		this.rootNg = parentPath?.parentNg?.rootNg || this;
		this.parentPath = parentPath;

		
		this.template = template;
		this.closeKey = template.getCloseKey();

		// If it's just a text node, skip a bunch of unnecessary steps.
		if (template.isText) {
			this.startNode = this.endNode = Globals$1.doc.createTextNode(template.html[0]);
		}

		else {
			// Get a cached version of the parsed and instantiated html, and ExprPaths:
			const shell = Shell.get(template.html);
			const shellFragment = shell.fragment.cloneNode(true);

			if (shellFragment.nodeType === 11) { // DocumentFragment
				this.startNode = shellFragment.firstChild;
				this.endNode = shellFragment.lastChild;
			} else
				this.startNode = this.endNode = shellFragment;


			// Special setup for RootNodeGroup
			if (this instanceof RootNodeGroup) {
				let startingPathDepth = 0;
				this.options = options;
				if (shellFragment instanceof Text) {
					if (!el)
						throw new Error('Cannot create a standalone text node');

					this.root = el;
					if (shellFragment.nodeValue.length)
						this.root.append(shellFragment);
				}

				else {
					if (el) {
						this.root = el;

						// Save slot
						// 1. Globals.currentSlotChildren is set if this is called via ExprPathComponent.applyComponent() calls render()
						// 2. el.childNodes is set if render() is called manually for the first time.
						let slotChildren;
						if (Globals$1.currentSlotChildren || el.childNodes.length) {
							slotChildren = Globals$1.doc.createDocumentFragment();
							slotChildren.append(...(Globals$1.currentSlotChildren || el.childNodes));
						}

						// If el should replace the root node of the fragment.
						if (isReplaceEl(shellFragment, this.root.tagName)) {
							this.root.append(...shellFragment.children[0].childNodes);

							// Copy attributes
							for (let attrib of shellFragment.children[0].attributes)
								if (!this.root.hasAttribute(attrib.name) && attrib.name !== 'solarite-placeholder')
									this.root.setAttribute(attrib.name, attrib.value);

							// Go one level deeper into all of shell's paths.
							startingPathDepth = 1;
						}

						else {
							let isEmpty = shellFragment.childNodes.length === 1 && shellFragment.childNodes[0].nodeType === 3 && shellFragment.childNodes[0].textContent === '';
							if (!isEmpty)
								this.root.append(...shellFragment.childNodes);
						}


						// Setup slot children (deprecated)
						if (slotChildren) {
							// Named slots
							for (let slot of el.querySelectorAll('slot[name]')) {
								let name = slot.getAttribute('name');
								if (name) {
									let slotChildren2 = slotChildren.querySelectorAll(`[slot='${name}']`);
									slot.append(...slotChildren2);
								}
							}
							// Unnamed slots
							let unamedSlot = el.querySelector('slot:not([name])');
							if (unamedSlot)
								unamedSlot.append(slotChildren);
							// No slots
							else
								el.append(slotChildren);
						}
					}

					// Instantiate as a standalone element.
					else {
						let onlyChild = getSingleEl(shellFragment);
						this.root = onlyChild || shellFragment; // We return the whole fragment when calling h() with a collection of nodes.
						if (onlyChild)
							startingPathDepth = 1;
					}

					this.setPathsFromFragment(this.root, shell.paths, startingPathDepth);
					this.activateEmbeds(this.root, shell, startingPathDepth);
				}
				this.startNode = this.endNode = this.root;

				Globals$1.rootNodeGroups.set(this.root, this);
			} // end if RootNodeGroup

			else if (shell) {
				if (template.exprs.length) {
					this.setPathsFromFragment(shellFragment, shell.paths);
				}

				this.activateEmbeds(shellFragment, shell);
			}
		}

		
	}


	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param paths {?ExprPath[]} Optional.  Only used for testing.  Normally uses this.paths.  */
	applyExprs(exprs, paths=null) {
		paths = paths || this.paths;

		

		// Things to consider:
		// 1. Paths consume a varying number of expressions.
		//    An ExprPathAttribs may use multipe expressions.  E.g. <div class="${1} ${2}">
		//    While an ExprPathComponent uses zero.
		// 2. An ExprPathComponent references other ExprPaths that set its attribute values.
		// 3. We apply them in reverse order so that a <select> box has its children created from an expression
		//    before its instantiated and its value attribute is set via an expression.

		let exprIndex = exprs.length - 1; // Update exprs at paths.
		let pathExprs = new Array(paths.length); // Store all the expressions that map to a single path.  Only paths to attribute values can have more than one.

		for (let i = paths.length - 1, path; path = paths[i]; i--) {


			// Component expressions don't have a corresponding user-provided expression.
			// They use expressions from the paths that provide their attributes.
			if (path instanceof ExprPathComponent) {
				let attribExprs = pathExprs.slice(i+1, i+1 + path.attribPaths.length); // +1 b/c we move forward from the component path.
				path.applyComponent(attribExprs);
			}
			else {

				// Get the expressions associated with this path.
				if (path.attrValue?.length > 2) {
					let startIndex = (exprIndex - (path.attrValue.length - 1)) + 1;
					pathExprs[i] = exprs.slice(startIndex, exprIndex + 1); // probably doesn't allocate if the JS vm implements copy on write.
					exprIndex -= pathExprs[i].length;
				}

				else {
					pathExprs[i] = [exprs[exprIndex]];
					exprIndex--;
				}

				path.apply(pathExprs[i]);
			}

		} // end for(path of this.paths)


		// TODO: Only do this if we have ExprPaths within styles?
		this.updateStyles();

		// Call render() on static web components. This makes the component.staticAttribs() test work.
		for (let el of this.staticComponents)
			if (el.render)
				el.render(Util.attribsToObject(el)); // It has no expressions.

		// Invalidate the nodes cache because we just changed it.
		this.nodesCache = null;

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		


		
	}

	/**
	 * @deprecated for applyComponent()
	 * Ensure:
	 * 1. a child component is instantiated (if it's a placeholder)
	 * 2. It's rendered if doRender=true
	 * @param el {HTMLElement}
	 * @param props {?Object}
	 * @param doRender {boolean}
	 * @return {HTMLElement} The (possibly replaced) element. */
	handleComponent(el, props=null, doRender=true) {
		debugger;
		let isPreHtmlElement = el.hasAttribute('solarite-placeholder');
		let isPreIsElement = el.hasAttribute('_is');
		let attribs, children;
		if (isPreHtmlElement || isPreIsElement)
			[el, attribs, children] = this.instantiateComponent(el, isPreHtmlElement, props); // calls render()
		if (doRender && el.render /*&& !el.renderFirstTime*/) { // If render not already called.  But enabling this breaks tests.
			if (!attribs) { // if not set by instantiateComponent
				attribs = Util.attribsToObject(el, 'solarite-placeholder');
				for (let name in props || {})
					attribs[Util.dashesToCamel(name)] = props[name];
				children = RootNodeGroup.getSlotChildren(el);
			}
			el.render(attribs, children);
		}
		return el;
	}
	
	/**
	 * @deprecated for constructComponent()
	 * We swap the placeholder element for the real element so we can pass its dynamic attributes
	 * to its constructor.
	 * This is only called by handleComponent()
	 * This does not call render()
	 *
	 * @param el {HTMLElement}
	 * @param isPreHtmlElement {?boolean} True if the element's tag name ends with -solarite-placeholder
	 * @param props {Object} Attributes with dynamic values.
	 * @return {[HTMLElement, attribs:Object, children:Node[]]}} */
	instantiateComponent(el, isPreHtmlElement=undefined, props=undefined) {
		debugger;
		if (isPreHtmlElement === undefined)
			isPreHtmlElement = !el.hasAttribute('_is');

		let tagName = (isPreHtmlElement
			? el.tagName.slice(0, -21) // Remove -SOLARITE-PLACEHOLDER
			: el.getAttribute('is')).toLowerCase();


		// Throw if custom element isn't defined.
		let Constructor = customElements.get(tagName);
		if (!Constructor)
			throw new Error(`The custom tag name ${tagName} is not registered.`)

		// Pass other attribs to constructor, since otherwise they're not yet set on the element,
		// and the constructor would otherwise have no way to see them.
		let attribs = Util.attribsToObject(el, 'solarite-placeholder');
		for (let name in props || {})
			attribs[Util.dashesToCamel(name)] = props[name];


		// Create the web component.
		// Get the children that aren't Solarite's comment placeholders.
		let children = RootNodeGroup.getSlotChildren(el);
		let newEl = new Constructor(attribs, children);

		if (!isPreHtmlElement)
			newEl.setAttribute('is', el.getAttribute('is').toLowerCase());

		// Replace the placeholder tag with the instantiated web component.
		

		Globals$1.currentSlotChildren = children; // Used by RootNodeGroup slot code.
		el.replaceWith(newEl); // Calls render() when it's a Solarite component and it's added to the DOM
		Globals$1.currentSlotChildren = null;

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

		// This is used only if inheriting from the Solarite class.
		// applyComponentExprs() is called because we're rendering.
		// So we want to render the sub-component also.
		if (newEl.renderFirstTime)
			newEl.renderFirstTime();

		// Copy attributes over.
		for (let attrib of el.attributes)
			if (attrib.name !== '_is' && attrib.name !== 'solarite-placeholder')
				newEl.setAttribute(attrib.name, attrib.value);



		return [newEl, attribs, children];
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

	/**
	 * Copy paths in fragment to this.paths.
	 * @param fragment {DocumentFragment|HTMLElement}
	 * @param paths
	 * @param startingPathDepth {int} */
	setPathsFromFragment(fragment, paths, startingPathDepth=0) {
		let pathLength = paths.length; // For faster iteration
		this.paths.length = pathLength;
		for (let i=0; i<pathLength; i++) {
			let path = paths[i].clone(fragment, startingPathDepth);
			path.parentNg = this;
			this.paths[i] = path;
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

	


	/**
	 * This can be static.
	 * @param root {HTMLElement|DocumentFragment}
	 * @param paths {int[][]}
	 * @param startingPathDepth
	 * @returns {HTMLElement[]} */
	resolvePaths(root, paths, startingPathDepth=0) {
		let result = [];
		for (let path of paths) {
			if (startingPathDepth)
				path = path.slice(0, -startingPathDepth);
			if (!path.length) {// Don't find ourself
			//	debugger; // This shouldn't happen?
				continue;
			}
			let el = NodePath.resolve(root, path);
			result.push(el);
		}
		return result;
	}

	/** @deprecated */
	findStaticComponents(root, shell, startingPathDepth=0) {
		let result = [];

		// static components.  These are WebComponents that do not have any constructor arguments that are expressions.
		// Those are instead created by applyExpr() which calls applyComponentExprs() which calls instantiateComponent().
		// Maybe someday these two paths will be merged?
		// Must happen before ids because instantiateComponent will replace the element.
		for (let path of shell.staticComponentPaths) {

			if (startingPathDepth)
				path = path.slice(0, -startingPathDepth);
			if (!path.length) // Don't find ourself
				continue;
			let el = NodePath.resolve(root, path);
			result.push(el);
		}
		return result;
	}

	/** @deprecated */
	instantiateStaticComponents(staticComponents) {
		// TODO: Why do we not call render() on the static component here?  The tests pass either way.
		for (let i in staticComponents)
			staticComponents[i] = this.handleComponent(staticComponents[i], null, false);
	}

	/**
	 * @param root {HTMLElement|DocumentFragment}
	 * @param shell {Shell}
	 * @param pathOffset {int} */
	activateEmbeds(root, shell, pathOffset=0) {

		let rootEl = this.rootNg.root;
		if (rootEl) {
			let options = this.rootNg.options;

			// ids
			if (options?.ids !== false) {
				for (let path of shell.ids) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let el = NodePath.resolve(root, path);
					Util.bindId(rootEl, el);
				}
			}

			// styles
			if (options?.styles !== false) {
				if (shell.styles.length)
					this.styles = new Map();
				for (let path of shell.styles) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);

					/** @type {HTMLStyleElement} */
					let style = NodePath.resolve(root, path);
					if (rootEl.nodeType === 1) {
						Util.bindStyles(style, rootEl);
						this.styles.set(style, style.textContent);
					}
				}

			}
			// scripts
			if (options?.scripts !== false) {
				for (let path of shell.scripts) {
					if (pathOffset)
						path = path.slice(0, -pathOffset);
					let script = NodePath.resolve(root, path);
					eval(script.textContent);
				}
			}
		}
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
 * @param tagName {string}
 * @returns {boolean} */
function isReplaceEl(fragment, tagName) {
	return fragment.children.length===1
		&& tagName.includes('-') // TODO: Check for solarite-placeholder attribute instead?
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === tagName;
}

class RootNodeGroup extends NodeGroup {

	/**
	 * @param el {HTMLElement}
	 * @returns {NodeList[]} */
	static getSlotChildren(el) {
		if (Globals$1.currentSlotChildren)
			return Globals$1.currentSlotChildren;

		// TODO: Have Shell cache the path to slot for better performance:
		let childNodes = (el.querySelector('slot') || el).childNodes;
		return Array.prototype.filter.call(childNodes, node => // Remove node markers.
			node.nodeType !== Node.COMMENT_NODE || !node.nodeValue.startsWith('ExprPath')
		);
	}
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

	isText;

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

		
	}

	/**
	 * Called by JSON.serialize when it encounters a Template.
	 * This prevents the hashed version from being too large. */
	toJSON() {
		if (this.hashedFields===undefined)
			this.hashedFields = [getObjectId(this.html), this.exprs];

		return this.hashedFields
	}

	/**
	 * Render the main (root) template.
	 * @param el {?HTMLElement} Null if we're rendering to a standalone element.
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} */
	render(el=null, options={}) {


		let ng = el && Globals$1.rootNodeGroups.get(el);
		if (!ng) {
			ng = new RootNodeGroup(this, null, el, options);
			if (!el) // null if it's a standalone elment.
				el = ng.getRootNode();
			Globals$1.rootNodeGroups.set(el, ng); // All tests still pass if this is commented out!
		}

		// Make sure the expresion count matches match the exprPath "hole" count.
		// This can happen if we try manually rendering one template to a NodeGroup that was created expecting a different template.
		// These don't always have the same length, for example if one attribute has multiple expressions.
		// if (ng.paths.length === 0 && this.exprs.length || ng.paths.length > this.exprs.length)
		// 	throw new Error(
		// 		`Solarite Error:  Parent HTMLElement ${ng.template.html.join('${...}')} and ${ng.paths.length} \${value} ` +
		// 		`placeholders can't accomodate a Template with ${this.exprs.length} values.`);

		// Creating the root nodegroup also renders it.
		// If we didn't just create it, we need to render it.
		if (this.html?.length === 1 && !this.html[0]) // An empty string.
			el.innerHTML = ''; // Fast path for empty component.
		else {
			ng.applyExprs(this.exprs);
			ng.exactKey = this.getExactKey();

			//if (firstTime)
			//	ng.instantiateStaticComponents(ng.staticComponents);
		}

		ng.exprsToRender = new Map();
		return el;
	}

	getExactKey() {
		if (this.exactKey===undefined) {
			if (this.exprs.length)
				this.exactKey = getObjectHash(this);// calls this.toJSON().
			else // Don't hash plain html.
				this.exactKey = this.html[0];
		}
		return this.exactKey;
	}

	getCloseKey() {
		//console.log(this.exprs.length)
		if (this.closeKey===undefined) {
			if (this.exprs.length)
				this.closeKey = /*'@' + */this.toJSON()[0];
			else
				this.closeKey = this.html[0];
		}
		// Use the joined html when debugging?  But it breaks some tests.
		//return '@'+this.html.join('|')

		return this.closeKey;
	}

	/**
	 * @param tag {string}
	 * @param props {?Record<string, any>}
	 * @param children
	 * @returns {Template} */
	static fromJsx(tag, props, children) {

		// HTML void elements that must not have closing tags
		const isVoid = selfClosingTags.has(tag.toLowerCase());

		// Build htmlStrings/exprs so Shell can place placeholders in attribute values and child content.
		let htmlStrings = [];
		let templateExprs = [];

		// Opening tag
		let open = `<${tag}`;

		// Attributes
		if (props && typeof props === 'object') {
			for (let name in props) {
				let value = props[name];

				// id and data-id are static in templates — never expressions
				if (name === 'id' || name === 'data-id') {
					// Write directly into the opening string with quotes
					open += ` ${name}="${value}"`;
					continue;
				}

				// Dynamic attribute value: functions are unquoted (e.g., onclick=${fn}), others quoted
				if (typeof value === 'function') {
					open += ` ${name}=`;
					htmlStrings.push(open);
					templateExprs.push(value);
					// reset so subsequent attributes start fresh (e.g., ' title=')
					open = ``;
				}
				else {
					open += ` ${name}=`;
					htmlStrings.push(open);
					templateExprs.push(value);
					// reset so subsequent attributes start fresh (e.g., ' title=')
					open = ``;
				}
			}
		}

		// Finalize opening tag precisely to match tagged template splitting
		if (!isVoid) {
			const pushedAny = htmlStrings.length > 0;
			// If nothing pushed yet (no dynamic attrs), push the entire open + '>'
			if (!pushedAny)
				htmlStrings.push(open + '>');
			else {
				// If we were in a quoted attr (open === '"'), then the string after expr is '">' ;
				// Otherwise (function-valued attr), the string after expr is just '>'
				htmlStrings.push(open === '"' ? '">' : '>');
			}

			for (let child of children)
				addChild(child, htmlStrings, templateExprs);
		}

		// Closing tag (not for void tags)
		if (!isVoid) {
			// If we never emitted the '>' for the open tag (no children were added),
			// then it was appended above before children. Now just add the closing tag to the last html segment.
			let lastIdx = htmlStrings.length - 1;
			htmlStrings[lastIdx] += `</${tag}>`;
		}
		else {
			// Void element: ensure we emitted a trailing '>' segment
			const pushedAny = htmlStrings.length > 0;
			if (!pushedAny)
				htmlStrings.push(open + '>');
			else
				htmlStrings.push('>');
		}

		// Ensure invariant
		//assert(htmlStrings.length === templateExprs.length + 1);
		//console.log([htmlStrings, templateExprs])
		return new Template(htmlStrings, templateExprs);
	}
}


const selfClosingTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);


/**
 * Add child Templates that were already created via h() and Template.fromJsx()
 * @param template {Template}
 * @param html {string[]}
 * @param exprs {any[]} */
const addChild = (template, html, exprs) => {

	if (Array.isArray(template)) {
		for (let c of template)
			addChild(c, html, exprs);
	}
	else {
		let flatten = false;
		if (template instanceof Template) {
			// Heuristic to match tagged-template splitting:
			// - Flatten if the child has expressions (so JSX can inline attribute/value placeholders like tagged literals would).
			// - Also flatten void elements (e.g., <img>) so they inline like literals.
			// - Otherwise, keep as a dynamic child placeholder to match cases where the tagged template used an expression child.
			const childHasExprs = template.exprs.length > 0;
			if (childHasExprs)
				flatten = true;
			else {
				const m = (template.html[0] || '').match(/^<([a-zA-Z][\w:-]*)/);
				const childTag = m ? m[1].toLowerCase() : '';
				flatten = selfClosingTags.has(childTag);
			}
		}

		if (flatten) {
			// Flatten/interleave into current segment to match tagged template splitting
			html[html.length - 1] += template.html[0];
			for (let i = 0; i < template.exprs.length; i++) {
				exprs.push(template.exprs[i]);
				html.push(template.html[i + 1] ?? '');
			}
		} else {
			// Keep as dynamic child
			exprs.push(template);
			html.push('');
		}
	}
};


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
 * Convert a template, string, or object into a DOM Node or Element
 *
 * 1. h('Hello');                      // Create single text node.
 * 2. h('<b>Hello</b>');               // Create single HTMLElement
 * 3. h('<b>Hello</b><u>Goodbye</u>'); // Create document fragment because there's more than one node.
 * 4. h(template)                      // Render Template created by h`<html>` or h();
 * 5. h({render(){...}})               // Pass an object with a render method, and optionally other props/methods.
 * @param arg {string|Template|{render:()=>void}}
 * @returns {Node|DocumentFragment|HTMLElement} */
function toEl(arg) {

	if (typeof arg === 'string') {
		let html = arg;

		// If it's an element with whitespace before or after it, trim both ends.
		if (html.match(/^\s^</) || html.match(/>\s+$/))
			html = html.trim();

		// We create a new one each time because otherwise
		// the returned fragment will have its content replaced by a subsequent call.
		let templateEl = Globals$1.doc.createElement('template');
		templateEl.innerHTML = html;

		// 1+2. Return Node if there's one child.
		let relevantNodes = Util.trimEmptyNodes(templateEl.content.childNodes);
		if (relevantNodes.length === 1)
			return relevantNodes[0];

		// 3. Otherwise return DocumentFragment.
		return templateEl.content;
	}

	// 4.
	if (arg instanceof Template) {
		return arg.render();
	}

		// 5. Create dynamic element from an object with a render() function.
	// TODO: This path doesn't handle embeds like data-id="..."
	else if (arg && typeof arg === 'object') {
		let obj = arg;

		if (obj.constructor.name !== 'Object')
			throw new Error(`Solarate Web Component class ${obj.constructor?.name} must extend HTMLElement.`);

		// Normal path
		if (!Globals$1.objToEl.has(obj)) {
			Globals$1.objToEl.set(obj, null);
			obj[renderF](); // Calls the Special rebound render path above, when the render function calls h(this)
			let el = Globals$1.objToEl.get(obj);
			Globals$1.objToEl.delete(obj);

			for (let name in obj)
				if (typeof obj[name] === 'function')
					el[name] = obj[name].bind(el);  // Make the "this" of functions be el.
					// TODO: But this doesn't work for passing an object with functions as a constructor arg via an attribute:
				// <my-element arg=${{myFunc() { return this }}}
				else
					el[name] = obj[name];

			// Bind id's
			// This doesn't work for id's referenced by attributes.
			// for (let idEl of el.querySelectorAll('[id],[data-id]')) {
			// 	Util.bindId(el, idEl);
			// 	Util.bindId(obj, idEl);
			// }
			// TODO: Bind styles

			return el;
		}
	}

	throw new Error('toEl() does not support argument of type: ' + (arg ? typeof arg : arg));

}


// Trick to prevent minifier from renaming this function.
let renderF = 'render';

/**
 * Convert strings to HTMLNodes.
 * Using h`...` as a tag will always create a Template.
 * Using h() as a function() will always create a DOM element.
 *
 * Features beyond what standard js tagged template strings do:
 * 1. h`` sub-expressions
 * 2. functions, nodes, and arrays of nodes as sub-expressions.
 * 3. html-escape all expressions by default, unless wrapped in h()
 * 4. event binding
 * 5. TODO:  list more
 *
 * General rule:
 * If h() is a function with null or an HTMLElement as its first argument create a Node.
 * Otherwise create a template
 *
 * Currently supported:
 *
 * Create Tempataes
 * 1. h`<b>Hello</b> ${'World'}!`      // Create Template that can later be used to create nodes.
 * 2. h('<b>Hello</b><u>Goodbye</u>'); // Create Template from string, that can later be used to create nodes.
 *
 * Add children to an element.
 * 3. h(el, h`<b>${'Hi'}</b>`, ?options)
 * 4. h(el, ?options)`<b>${'Hi'}</b>`   // typical path used in render(). Create template and render its nodes to el.
 *
 * Create top-level element
 * 5. h()`Hello<b>${'World'}!</b>`
 *
 * 6. h(string, object, ...)           // Used for JSX
 * @param htmlStrings {?HTMLElement|string|string[]|function():Template|{render:function()}}
 * @param exprs {*[]|string|Template|Object}
 * @return {Node|HTMLElement|Template|Function} */
function h(htmlStrings=undefined, ...exprs) {

	// 1. Tagged template: h`<div>...</div>`
	if (Array.isArray(arguments[0])) {
		return new Template(arguments[0], exprs);
	}

	// 2. String to template, or JSX factory form h(tag, props, ...children)
	else if (typeof arguments[0] === 'string' || arguments[0] instanceof String) {
		let tagOrHtml = arguments[0];

		// 2a. JSX: h("tag", {props}, ...children)
		if (exprs.length && (typeof exprs[0] === 'object' || exprs[0] === null)) {
			let tag = tagOrHtml + '';
			let props = exprs[0] || {};
			let children = exprs.slice(1);

			return Template.fromJsx(tag, props, children);
		}

		// 2b. Plain html string => template: h('<div>...</div>')
		else {
			let html = tagOrHtml;
			// If it starts with whitespace and then a tag, trim it.
			if (html.match(/^\s^</))
				html = html.trim();
			return new Template([html], []);
		}
	}

	else if (arguments[0] instanceof HTMLElement || arguments[0] instanceof DocumentFragment) {

		// 3. Render template to element: h(el, template)
		if (arguments[1] instanceof Template) {

			/** @type Template */
			let template = arguments[1];
			let parent = arguments[0];
			let options = arguments[2];
			template.render(parent, options);
		}

		// 4. Render tagged template to element: h(el)`<div>...</div>`
		else {
			let parent = arguments[0], options = arguments[1];

			// Remove shadowroot if present.  TODO: This could mess up paths?
			if (parent.shadowRoot)
				parent.innerHTML = '';

			// Return a tagged template function that applies the tagged template to parent.
			let renderTemplate = (htmlStrings, ...exprs) => {
				Globals$1.rendered.add(parent);
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			};
			return renderTemplate;
		}
	}

	// 5. Create a static element: h()`<div></div>`
	else if (!arguments.length) {
		return (htmlStrings, ...exprs) => {
				let template = h(htmlStrings, ...exprs);
				return toEl(template);
			}
	}

	// 6. Help toEl() with objects: h(this)`<div>...</div>` inside an object's render()
	// Intercepts the main h(this)`...` function call inside render().
	// TODO: This path doesn't handle embeds like data-id="..."
	else if (typeof arguments[0] === 'object' && Globals$1.objToEl.has(arguments[0])) {
		let obj = arguments[0];

		if (obj.constructor.name !== 'Object')
			throw new Error(`Solarate Web Component class ${obj.constructor?.name} must extend HTMLElement.`);

		// Jsx with h(this, <jsx>)
		if (arguments[1] instanceof Template) {
			let template = arguments[1];
			let el = template.render();
			Globals$1.objToEl.set(obj, el);
		}

		// h(this)`<div>...</div>`
		else
			return function(...args) {
				let template = h(...args);
				let el = template.render();
				Globals$1.objToEl.set(obj, el);
			}.bind(obj);
	}
	else
		throw new Error('h() does not support argument of type: ' + (arguments[0] ? typeof arguments[0] : arguments[0]))
}

/**
 * There are three ways to create an instance of a Solarite Component:
 * 1.  new ComponentName(3);                                               // direct class instantiation
 * 2.  h(this)`<div><component-name user-id=${3}></component-name></div>;  // as a child of another Component.
 * 3.  <body><component-name user-id="3"></component-name></body>          // in the Document html.
 *
 * When created via #3, Solarite has no way to pass attributes as arguments to the constructor.  So to make
 * sure we get the correct value via all three paths, we write our constructors according to the following
 * example.  Note that constructor args are embedded in an object, and must be all lower-case because
 * Browsers make all html attribute names lowercase.
 *
 * @example
 * constructor({name, userId=1}={}) {
 *     super();
 *
 *     // Get value from "name" attriute if persent, otherwise from name constructor arg.
 *     this.name = getArg(this, 'name', name);
 *
 *     // Optionally convert the value to an integer.
 *     this.userId = getArg(this, 'user-id', userId, ArgType.Int);
 * }
 *
 * @param el {HTMLElement}
 * @param attributeName {string} Attribute name.  Not case-sensitive.
 * @param defaultValue {*} Default value to use if attribute doesn't exist.  Typically the argument from the constructor.
 * @param type {ArgType|function|Class|*[]}
 *     If an array, use the value if it's in the array, otherwise return undefined.
 *     If it's a function, pass the value to the function and return the result.
 * @return {*} Undefined if attribute isn't set and there's no defaultValue, or if the value couldn't be parsed as the type.  */
function getArg(el, attributeName, defaultValue=undefined, type=ArgType.String) {
	let val = defaultValue;
	let attrVal = el.getAttribute(attributeName) || el.getAttribute(Util.camelToDashes(attributeName));
	if (attrVal !== null) // If attribute doesn't exist.
		val = attrVal;
		
	if (Array.isArray(type))
		return type.includes(val) ? val : undefined;
	
	if (typeof type === 'function') {
		return type.constructor
			? new type(val) // arg type is custom Class
			: type(val); // arg type is custom function
	}
	
	// If bool, it's true as long as it exists and its value isn't falsey.
	if (type===ArgType.Bool) {
		let lAttrVal = typeof val === 'string' ? val.toLowerCase() : val;
		if (['false', '0', false, 0, null, undefined, NaN].includes(lAttrVal))
			return false;
		if (['true', true].includes(lAttrVal) || parseFloat(lAttrVal) !== 0)
			return true;
		return undefined;
	}
	
	// Attribute doesn't exist
	switch (type) {
		case ArgType.Int:
			return parseInt(val);
		case ArgType.Float:
			return parseFloat(val);
		case ArgType.String:
			return [undefined, null, false].includes(val) ? '' : (val+'');
		case ArgType.Json:
		case ArgType.Eval:
			if (typeof val === 'string' && val.length)
				try {
					if (type === ArgType.Json)
						return JSON.parse(val);
					else
						return eval(`(${val})`);
				} catch (e) {
					return val;
				}
			else return val;

		// type not provided
		default:
			return val;
	}
}


/**
 * Experimental.  Set multiple arguments/attributes all at once.
 * @param el {HTMLElement}
 * @param args {Record<string, any>}
 * @param types {Record<string, ArgType|function|Class>}
 *
 * @example
 * constructor({user, path}={}) {
 *     setArgs(this, arguments[0], {user: User, path: ArgType.String});
 *
 *     // Equivalent to:
 *     this.user = getArg(this, user, 'user', User); // or new User(user);
 *     this.path = getArg(this, path, 'path', ArgType.String);
 * }
 */
function setArgs(el, args, types) {
	for (let name in args)
		this[name] = getArg(el, name, args[name], types[name] || ArgType.String);
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

	/** @deprecated for Json */
	JSON: 'Json',

	/**
	 * Parse the string value as JSON.
	 * If it's not parsable, return the value as a string. */
	Json: 'Json',

	/**
	 * Evaluate the string as JavaScript using the eval() function.
	 * If it can't be evaluated, return the original string. */
	Eval: 'Eval'
};

// Trick to prevent minifier from renaming these methods.
let define = 'define';
let getName = 'getName';

function defineClass(Class, tagName) {
	if (!customElements[getName](Class)) { // If not previously defined.
		tagName = tagName || Util.camelToDashes(Class.name);
		if (!tagName.includes('-')) // Browsers require that web components always have a dash in the name.
			tagName += '-element';
		customElements[define](tagName, Class);
	}
}


/**
 * Create a version of the Solarite class that extends from the given tag name.
 * Reasons to inherit from this instead of HTMLElement.
 * 1.  customElements.define() is called automatically when you create the first instance.
 * 2.  Calls render() when added to the DOM, if it hasn't been called already.
 * 3.  Populates the attribs argument to the constructor, parsing JSON from DOM attribute values surrouned with '${...}'
 * 4.  We have the onConnect, onFirstConnect, and onDisconnect methods.
 *     Can't figure out how to have these work standalone though, and still be synchronous.
 * 5.  Shows an error if render() isn't defined.
 *
 * Advantages to inheriting from HTMLElement
 * 1.  We can inherit from things like HTMLTableRowElement directly.
 * 2.  There's less magic, since everyone is familiar with defining custom elements.
 * 3.  No confusion about how the class name becomes a tag name.
 */

/**
 * Intercept the construct call to auto-define the class before the constructor is called.
 * And populate the attribs and children arguments when the element is created from the regular DOM
 * and not as a child of another web component.
 * @type {HTMLElement|Proxy} */
let HTMLElementAutoDefine = new Proxy(HTMLElement, {
	construct(Parent, args, Class) {

		// 1. Call customElements.define() automatically.
		defineClass(Class, null);

		// 2. This line is equivalent the to super() call to HTMLElement:
		return Reflect.construct(Parent, args, Class);
	}
});

/**
 * @extends HTMLElement */
class Solarite extends HTMLElementAutoDefine {

	// Deprecated?
	// onConnect;
	// onFirstConnect;
	// onDisconnect;

	constructor(attribs/*, children*/) {

		super();

		// 1. Populate attribs if it's an empty object.
		if (attribs) {
			if (typeof attribs !== 'object')
				throw new Error('First argument to custom element constructor must be an object.');

			if (attribs && !Object.keys(attribs).length) {
				let attribs2 = getAttribs(this);
				for (let name in attribs2) {
					attribs[name] = attribs2[name];
				}
			}
		}

		// 2. Populate children if it's an empty array.
		/*if (children) {
			if (!Array.isArray(children))
				throw new Error('Second argument to custom element constructor must be an array.');
			if (!children.length) {
				// TODO: <slot> won't exist until after render() is called, so what good is this?
				let slotChildren = (this.querySelector('slot') || this).childNodes; // TODO: What about named slots?
				for (let child of slotChildren)
					children.push(child);
			}
		}*/

		//if (this.parentNode)
		//	setTimeout(() => this.connectedCallback(), 0);
	}

	render() {
		throw new Error('render() is not defined for ' + this.constructor.name);
	}

	/**
	 * Call render() only if it hasn't already been called.	 */
	renderFirstTime() {
		if (!Globals$1.rendered.has(this)) {
			let attribs = getAttribs(this);
			//let children = RootNodeGroup.getSlotChildren(this);
			this.render(attribs); // calls Globals.rendered.add(this); inside the call to h()'...'.

		}
	}

	/**
	 * Called automatically by the browser. */
	connectedCallback() {

		this.renderFirstTime();
		// if (!Globals.connected.has(this)) {
		// 	if (this.onFirstConnect)
		// 		this.onFirstConnect();
		// }
		// if (this.onConnect)
		// 	this.onConnect();
	}

	disconnectedCallback() {
		// if (this.onDisconnect)
		// 	this.onDisconnect();
	}


	static define(tagName=null) {
		defineClass(this, tagName);
	}
}

function getAttribs(el) {
	let result = Util.attribsToObject(el, 'solarite-placeholder');
	for (let name in result) {
		let val = result[name];
		if (val.startsWith('${') && val.endsWith('}'))
			result[name] = JSON.parse(val.slice(2, -1));
	}
	return result;
}

/*
┏┓  ┓    •
┗┓┏┓┃┏┓┏┓┓╋▗▖
┗┛┗┛┗┗┻╹ ╹╹┗
JavasCript UI library
@license MIT
@copyright Vorticode LLC
https://vorticode.github.io/solarite/ */

//export {default as watch, renderWatched} from './watch.js'; // unfinished

export default h;
export { ArgType, Globals$1 as Globals, Solarite, Util as SolariteUtil, Template, delve, getArg, h, h as r, setArgs, toEl };
