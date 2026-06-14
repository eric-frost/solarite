/*@__NO_SIDE_EFFECTS__*/
function assert(val) {
	//#IFDEV
	if (!val) {
		//debugger;
		throw new Error('Assertion failed: ' + val);
	}
	//#ENDIF
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
		 * Set by NodeGroup.instantiateComponent()
		 * Used by RootNodeGroup.getSlotChildren(). */
		currentSlotChildren: null,

		div: document.createElement("div"),

		/** @type {HTMLDocument} The global document. */
		doc: document,

		/**
		 * @type {Record<string, Class<Node>>} A map from built-in tag names to the constructors that create them. */
		elementClasses: {},

		/** @type {Record<string, boolean>} Key is tag-name.propName.  Value is whether it's an attribute.*/
		htmlProps: {},

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
		 * Map from array of Html strings to the Shells created from them, one per parse mode.
		 * @type {WeakMap<string[], {html?:Shell, svg?:Shell}>} */
		shells: new WeakMap(),

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


/**
 * Is it an array and a path that can be evaluated by delve() ?
 * We allow the first element to be null/undefined so binding can report errors.
 * @param arr {Array|*}
 * @returns {boolean} */
function isDelvePath(arr) {
	return Array.isArray(arr) && arr.length >=2  // An array of at least two elements.
		&& (typeof arr[0] === 'object' || arr[0] === undefined) // Where the first element is an object, null, or undefined.
		&& !arr.slice(1).find(p => typeof p !== 'string' && typeof p !== 'number'); // Path 1..x is only numbers and strings.
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
	 * See also Solarite.getAttribs()
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

			// Don't clobber a non-element value.  For a simple (non-nested) id this covers two cases:
			// an inherited/built-in property like `title` or `style`, or an own property that already
			// holds a non-Node value.  A previously-bound element (a Node) is fine to re-assign.
			if (!id.includes('.')) {
				let existing = root[id];
				let isInherited = (id in root) && !Object.hasOwn(root, id);
				if (!existing?.nodeType && (existing != null || isInherited))
					throw new Error(`${root.constructor.name}.${id} can't be a reference to ` +
						`<${el.tagName.toLowerCase()} id="${id}"> because it would clobber an existing ` +
						`${isInherited ? 'built-in ' : ''}property.  Rename the id or the property.`);
			}

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

	defineClass(Class, tagName) {
		if (!customElements[getName](Class)) { // If not previously defined.
			tagName = tagName || Util.camelToDashes(Class.name);
			if (!tagName.includes('-')) // Browsers require that web components always have a dash in the name.
				tagName += '-element';
			customElements[define](tagName, Class);
		}
	},

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

	isFalsy(val) {
		return val === undefined || val === false || val === null;
	},

	/**
	 * Split a string like 'foo="bar" baz=123' into an object like {foo: 'bar', baz: '123'}.
	 * @param str {string}
	 * @returns {Object} */
	splitAttribs(str) {
		let result = {};
		let attrs = (str + '') // Split string into multiple attributes.
			.split(/([\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|\S+))/g)
			.map(text => text.trim())
			.filter(text => text.length);

		for (let attr of attrs) {
			let [name, value] = attr.split(/\s*=\s*/); // split on first equals.
			value = (value || '').replace(/^(['"])(.*)\1$/, '$2'); // trim value quotes if they match.
			result[name] = value;
		}

		return result;
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



// Trick to prevent minifier from renaming these methods.
let define = 'define';
let getName = 'getName';



// For debugging only
//#IFDEV
function setIndent$1(items, level=1) {
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

/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup. */
class Path {

	// Used for attributes:

	/**
	 * @type {Node} Node that occurs before this Path's first Node.
	 * This is necessary because udomdiff() can steal nodes from another Path.
	 * If we had a pointer to our own startNode then that node could be moved somewhere else w/o us knowing it.
	 * Used only for type='content'
	 * Will be null if Path has no Nodes. */
	nodeBefore;

	/**
	 * If type is AttribType.Multiple or AttribType.Value, points to the node having the attribute.
	 * If type is 'content', points to a node that never changes that this NodeGroup should always insert its nodes before.
	 *	 An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * @type {Node|HTMLElement} */
	nodeMarker;

	/**
	 * @type {boolean} True if the expression is the only child of its parent element.
	 * Then nodeMarker is that parent element, nodeBefore is null, and no marker comments exist. */
	wholeParent = false;


	// These are set after an expression is assigned:

	/** @type {NodeGroup} */
	parentNg;

	// Caches to make things faster

	/**
	 * @private
	 * @type {Node[]} Cached result of getNodes() */
	nodesCache;

	// Set only on Shell paths, never on cloned instances, so they're not declared as
	// class fields; that would cost a store per field on every clone:
	// nodeBeforeIndex {int} Index of nodeBefore among its parentNode's children.
	// nodeMarkerPath {int[]} Path to the node marker, in reverse for performance reasons.
	// markerSlot/beforeSlot {int} Slot indexes into the Shell's resolve program.


	/**
	 * @param nodeBefore {Node}
	 * @param nodeMarker {?Node}*/
	constructor(nodeBefore, nodeMarker) {
		this.nodeBefore = nodeBefore;
		this.nodeMarker = nodeMarker;
		/*#IFDEV*/this.verify();/*#ENDIF*/
	}

	/**
	 * Apply expressions to a path.
	 * This is called by NodeGroup.applyExprs() when it's time to put the expression values into the DOM.
	 *
	 * @param exprs {Expr[]}
	 * Suppose we have the following tagged template:
	 * `<div title=${expr1} class="big ${expr2} muted ${expr3}">
	 *    ${expr4}
	 *    <my-component></my-component>
	 *    <my-component user=${expr5} roles="${expr6},${expr7}"></my-component>
	 * </div>`
	 * The exprs arrays will look like this, with each being passed to a path.
	 * [expr1]                   // title attribute value.
	 * [expr2, expr3]            // class attribute values.
	 * [expr4]                   // children of div.
	 * []                        // arguments to first my-component constructor.
	 * [[expr5], [expr6, expr7]] // arguments to second my-component constructor.
	 * [expr5]                   // user attribute value.
	 * [expr6, expr7]            // role attribute value. */
	apply(exprs) {}

	/**
	 * Fast path used by NodeGroup.applyExprs() when every path consumes exactly one expression.
	 * Avoids allocating per-path expression arrays.
	 * @param expr {Expr} */
	applySingle(expr) {}

	getExpressionCount() { return 1 }


	/**
	 * Resolve nodeMarkerPath to new root.
	 * TODO: Make clone() use this.*/
	getNewNodeMarker(newRoot, pathOffset) {
		let root = newRoot;
		let path = this.nodeMarkerPath;
		let pathLength = path.length - pathOffset;
		for (let i=pathLength-1; i>0; i--) { // Resolve the path.
			//#IFDEV
			assert(root.childNodes[path[i]]);
			//#ENDIF
			root = root.childNodes[path[i]];
		}
		let childNodes = root.childNodes;

		return pathLength
			? childNodes[path[0]]
			: newRoot;
	}


	/**
	 * Copy this path, pointing it at already-resolved nodes.
	 * Used by the Shell resolve-program fast path in NodeGroup.setPathsFromFragment().
	 * @param nodeBefore {?Node}
	 * @param nodeMarker {Node}
	 * @return {Path} */
	cloneWithNodes(nodeBefore, nodeMarker) {
		let result = new this.constructor(nodeBefore, nodeMarker, this.attrName, this.attrValue);
		result.isComponentAttrib = this.isComponentAttrib;
		result.wholeParent = this.wholeParent;
		result.isHtmlProperty = this.isHtmlProperty;
		return result;
	}

	/**
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {Path} */
	clone(newRoot, pathOffset=0) {
		/*#IFDEV*/this.verify();/*#ENDIF*/

		// Resolve node paths.
		let nodeMarker, nodeBefore;
		let root = newRoot;
		let path = this.nodeMarkerPath;
		let pathLength = path.length - pathOffset;
		for (let i=pathLength-1; i>0; i--) { // Resolve the path.
			//#IFDEV
			assert(root.childNodes[path[i]]);
			//#ENDIF
			root = root.childNodes[path[i]];
		}
		let childNodes = root.childNodes;

		nodeMarker = pathLength
			? childNodes[path[0]]
			: newRoot;
		if (this.nodeBefore) {
			//#IFDEV
			assert(childNodes[this.nodeBeforeIndex]);
			//#ENDIF
			nodeBefore = childNodes[this.nodeBeforeIndex];

		}

		let result = new this.constructor(nodeBefore, nodeMarker, this.attrName, this.attrValue);

		result.isComponentAttrib = this.isComponentAttrib;
		result.wholeParent = this.wholeParent;

		// TODO: Put this in PathToAttribValue.clone().
		result.isHtmlProperty = this.isHtmlProperty;

		//#IFDEV
		result.verify();
		//#ENDIF

		return result;
	}

	/** @return {int[]} Returns indices in reverse order, because doing it that way is faster. */
	static get(node) {
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
	 * @returns {Node|HTMLElement|HTMLStyleElement} */
	static resolve(root, path) {
		for (let i=path.length-1; i>=0; i--)
			root = root.childNodes[path[i]];
		return root;
	}

	//#IFDEV

	/** @return {HTMLElement|ParentNode} */
	getParentNode() {
		return this.nodeMarker.parentNode
	}

	verify() {
		if (!window.verify)
			return;

		// Need either nodeMarker or parentNode
		assert(this.nodeMarker);

		// nodeMarker must be attached, unless it's an element that is itself the top of a
		// singleRoot shell clone (no fragment wrapper exists above it).
		assert(!this.nodeMarker || this.nodeMarker.parentNode || this.wholeParent || this.nodeMarker.nodeType === 1);

		assert(this.nodeBefore !== this.nodeMarker);

		// Detect cyclic parent and grandparent references.
		assert(this.parentNg?.parentPath !== this);
		assert(this.parentNg?.parentPath?.parentNg?.parentPath !== this);
		assert(this.parentNg?.parentPath?.parentNg?.parentPath?.parentNg?.parentPath !== this);

		for (let ng of this.nodeGroups || [])
			ng.verify();

		// Make sure the nodesCache matches the nodes.
		//this.checkNodesCache();
	}
	//#ENDIF
}

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

class PathToAttribValue extends Path {

	/** @type {?string} Used only if type=AttribType.Value. */
	attrName;

	/**
	 * @type {?string[]} Used only if type=AttribType.Value. If null, use one expr to set the whole attribute value. */
	attrValue;

	/** @type {boolean} Provides value for attribute on a component. */
	isComponent;

	isHtmlProperty;

	constructor(nodeBefore, nodeMarker, attrName=null, attrValue=null) {
		super(null, nodeMarker);
		this.attrName = attrName;
		this.attrValue = attrValue;
	}

	/**
	 * Set the value of an attribute.  This can be for any attribute, not just attributes named "value".
	 * @param exprs {Expr[]} */
	apply(exprs) {
		//#IFDEV
		assert(Array.isArray(exprs));
		//#ENDIF

		// Multiple expressions in one attribute value, e.g. class="a ${b} c ${d}"
		if (this.attrValue) {
			let node = this.nodeMarker;
			let joinedValue = this.getValue(exprs);
			let isProp = this.isHtmlProperty;

			// Only update attributes if the value has changed.
			// This is needed for setting input.value, .checked, option.selected, etc.
			let oldVal = isProp
				? node[this.attrName]
				: node.getAttribute(this.attrName);
			if (oldVal !== joinedValue) {
				if (isProp)
					node[this.attrName] = joinedValue;
				else if (this.attrName === 'value' && node.hasAttribute('contenteditable'))
					node.innerHTML = joinedValue;
				node.setAttribute(this.attrName, joinedValue);
			}
		}
		else
			this.applySingle(exprs[0]);
	}

	/**
	 * Set the attribute from a single expression that makes up its whole value.
	 * @param expr {Expr} */
	applySingle(expr) {
		// One expression surrounded by strings, e.g. class="a ${b} c".  Join through apply().
		if (this.attrValue)
			return this.apply([expr]);

		let node = this.nodeMarker;

		// Two-way binding between attributes
		// Passing a path to the value attribute.
		// Copies the attribute to the property when the input event fires.
		// value=${[this, 'value]'}
		// checked=${[this, 'isAgree']}
		// This same logic is in NodeGroup.instantiateComponent() for components.
		if (isDelvePath(expr)) {

			// Don't bind events to component placeholders.
			// PathToComponent will do the binding later when it instantiates the component.
			if (this.isComponentAttrib && node.tagName.endsWith('-SOLARITE-PLACEHOLDER'))
				return;

			/** @type {[Object, string[]]} */
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
			this.bindEvent(node, this.parentNg.getRootNode(), this.attrName, 'input', func, null, true);
		}

		// Regular attribute
		else {
			// Cache this on Path.isHtmlProperty when Shell creates the props.
			// Have Path.clone() copy .isHtmlProperty?
			let isProp = this.isHtmlProperty;

			if (typeof expr === 'function') {
				if (this.isComponentAttrib)
					return;
				expr = expr();
			}
			else
				expr = Util.makePrimitive(expr);

			// Values to toggle an attribute
			if (expr === undefined || expr === false || expr === null) { // Util.isFalsy() inlined.
				if (isProp)
					node[this.attrName] = false;
				node.removeAttribute(this.attrName);
			}
			else if (expr === true) {
				if (isProp)
					node[this.attrName] = true;
				node.setAttribute(this.attrName, '');
			}

			// A non-toggled attribute
			else {
				// Only update attributes if the value has changed.
				// This is needed for setting input.value, .checked, option.selected, etc.
				// A missing attribute counts as '', so empty values don't write empty attributes.
				let oldVal = isProp
					? node[this.attrName]
					: node.getAttribute(this.attrName) ?? '';
				if (oldVal !== expr) {

					// <textarea value=${expr}></textarea>
					// Without this branch we have no way to set the value of a textarea,
					// since we also prohibit expressions that are a child of textarea.
					if (isProp)
						node[this.attrName] = expr;

						// Allow one-way binding to contenteditable value attribute.
						// Contenteditables normally don't have a value attribute and have their content set via innerHTML.
					// Solarite doesn't allow contenteditables to have expressions as their children.
					else if (this.attrName === 'value' && node.hasAttribute('contenteditable')) {
						node.innerHTML = expr;
					}

					// TODO: Putting an 'else' here would be more performant
					node.setAttribute(this.attrName, expr);
				}
			}
		}
	}


	getExpressionCount() { return this.attrValue ? this.attrValue.length-1 : 1 }

	/**
	 * @param exprs {Expr|Expr[]} // TODO: Why is this sometimes not an array?
	 * @return {string} The joined values of the expressions, or the first expression if there are no strings. */
	getValue(exprs) {

		//#IFDEV
		assert(Array.isArray(exprs));
		//#ENDIF
		//if (!Array.isArray(exprs))
		//	return exprs;

		if (!this.attrValue) {// If it's not multiple paths inside a single attribute, return first (and only) expression.
			//#IFDEV
			assert(exprs.length === 1);
			//#ENDIF
			return exprs[0];
		}

		let result = [];
		let values = this.attrValue;
		for (let i = 0; i < values.length; i++) {
			result.push(values[i]);
			if (i < values.length - 1) {
				let val = Util.makePrimitive(exprs[i]);
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
	/**
	 * @param funcAndArgs {?Array} The [func, ...args] array from the template, or null if func stands alone. */
	bindEvent(node, root, key, eventName, func, funcAndArgs, capture=false) {
		if (typeof func !== 'function')
			throw new Error(`Solarite cannot bind to <${node.tagName.toLowerCase()} ${this.attrName}=\${${func}}> because it's not a function.`);

		// With the eventDelegation render option, bubbling events skip addEventListener
		// entirely; one document-level dispatcher per event type finds bindings by walking
		// up from the event target.  Capture bindings and non-bubbling events stay direct.
		let delegate = false;
		if (capture === false) {
			let opt = this.parentNg.rootNg.options?.eventDelegation;
			if (opt !== undefined && opt !== false && delegatableEvents.has(eventName))
				delegate = opt === true || opt.includes(eventName);
		}

		// One stable EventBinding object per node+key is registered with addEventListener
		// and dispatches to the current func/args.  This way, assigning a new function
		// (e.g. a fresh arrow function on each render) never needs add/removeEventListener.
		// Most nodes have one binding, stored directly; a second key upgrades to a map.
		let nodeEvents = node[eventBindingsKey];
		if (nodeEvents === undefined) {
			let b = node[eventBindingsKey] = new EventBinding(root, node, key, func, funcAndArgs);
			registerBinding(b, node, eventName, capture, delegate);
			return;
		}

		let binding;

		// The node already has a single EventBinding stored directly at node[eventBindingsKey].
		// If it's for this same key (e.g. 'click' rebound on re-render), just update it below.
		// Otherwise this is the node's second event key, so upgrade the slot to a
		// {key: EventBinding} map holding both.  Nodes with one handler (the common case)
		// never pay for that map object.
		if (nodeEvents instanceof EventBinding) {
			if (nodeEvents.key === key)
				binding = nodeEvents;
			else {
				let map = node[eventBindingsKey] = {};
				map[nodeEvents.key] = nodeEvents;
				binding = map[key] = new EventBinding(root, node, key, func, funcAndArgs);
				registerBinding(binding, node, eventName, capture, delegate);
				return;
			}
		}
		else {
			binding = nodeEvents[key];
			if (!binding) {
				binding = nodeEvents[key] = new EventBinding(root, node, key, func, funcAndArgs);
				registerBinding(binding, node, eventName, capture, delegate);
				return;
			}
		}
		binding.root = root;
		binding.func = func;
		binding.args = funcAndArgs;
	}
}

const eventBindingsKey = Symbol('solariteEvents');

/**
 * Attach a new EventBinding either directly or through the shared delegated dispatcher. */
function registerBinding(binding, node, eventName, capture, delegate) {
	if (delegate) {
		binding.delegated = true;
		if (!delegatedListeners.has(eventName)) {
			delegatedListeners.add(eventName);
			node.ownerDocument.addEventListener(eventName, delegatedDispatcher);
		}
	}
	else
		node.addEventListener(eventName, binding, capture);
}

// Bubbling events that one document-level listener can dispatch.  Same set Solid.js delegates.
const delegatableEvents = new Set(['beforeinput', 'click', 'contextmenu', 'dblclick', 'focusin', 'focusout',
	'input', 'keydown', 'keyup', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup',
	'pointerdown', 'pointermove', 'pointerout', 'pointerover', 'pointerup', 'touchend', 'touchmove', 'touchstart']);

// Event names that already have a document-level dispatcher registered.
const delegatedListeners = new Set();

/**
 * The one document-level listener for each delegated event type.  Walks from the event
 * target upward, invoking delegated EventBindings stored on the nodes along the way.
 * event.currentTarget is patched to the node whose binding is running, and restored after.
 * stopPropagation() inside a handler ends the walk, mirroring native bubbling. */
function delegatedDispatcher(ev) {
	let type = ev.type;
	let current = ev.target;
	Object.defineProperty(ev, 'currentTarget', {configurable: true, get() { return current }});
	while (current) {
		let b = current[eventBindingsKey];
		if (b !== undefined) {
			let binding = b instanceof EventBinding ? b : b[type];
			if (binding !== undefined && binding.delegated === true && binding.key === type) {
				binding.handleEvent(ev);
				if (ev.cancelBubble)
					break;
			}
		}
		current = current.parentNode;
	}
	delete ev.currentTarget; // Restore the native getter from the prototype.
}

class EventBinding {
	constructor(root, node, key, func=null, args=null) {
		this.root = root;
		this.node = node;
		this.key = key;
		this.func = func;

		/** @type {?Array} [func, ...args] or null if func stands alone. */
		this.args = args;
	}

	// Called by the browser via the addEventListener(name, object) form.
	// Sets the "this" variable to be the current Solarite component.
	// Quoted so the minifier's property mangling doesn't rename it, since the browser looks it up by name.
	'handleEvent'(event) {
		let a = this.args;
		if (a) {
			switch (a.length) {
				case 1: return a[0].call(this.root, event, this.node);
				case 2: return a[0].call(this.root, a[1], event, this.node);
				case 3: return a[0].call(this.root, a[1], a[2], event, this.node);
			}
			return a[0].call(this.root, ...a.slice(1), event, this.node);
		}
		return this.func.call(this.root, event, this.node);
	}
}

// TODO: Merge this into PathToAttribValue?
class PathToEvent extends PathToAttribValue {

	/** @type {string} The attrName without the "on" prefix. */
	eventName;

	constructor(nodeBefore, nodeMarker, attrName=null, attrValue=null) {
		super(null, nodeMarker, attrName, attrValue);
		this.eventName = attrName ? attrName.slice(2) : null;
	}

	/**
	 * Handle attributes for event binding, such as:
	 * onclick=${(e, el) => this.doSomething(el, 'meow')}
	 * oninput=${[this.doSomething, 'meow']}
	 * onclick=${[this, 'doSomething', 'meow']}
	 *
	 * @param exprs {Expr[]} Only the first is used.*/
	apply(exprs) {
		//#IFDEV
		assert(Array.isArray(exprs));
		//#ENDIF

		// Tested by Solariate.events.classicWithExpr
		// We have expressions within a string attribute value that's not a Solarite event.  E.g.
		// <div onclick="alert(${1});"
		if (this.attrValue?.length > 1) {
			super.apply(exprs);
			return;
		}

		this.applySingle(exprs[0]);
	}

	/**
	 * @param expr {Expr} */
	applySingle(expr) {
		// Expressions within a string attribute value that's not a Solarite event.
		if (this.attrValue?.length > 1)
			return super.apply([expr]);

		// Don't bind events to component placeholders.
		// PathToComponent will do the binding later when it instantiates the component.
		if (this.isComponentAttrib && this.nodeMarker.tagName.endsWith('-SOLARITE-PLACEHOLDER'))
			return;

		let root = this.parentNg.rootNg.root;

		/*#IFDEV*/
		assert(root?.nodeType === 1);
		/*#ENDIF*/

		let node = this.nodeMarker;

		let eventName = this.eventName;
		let func;

		// Array form: oninput=${[this.doSomething, 'meow']}
		// The whole array is passed to bindEvent so no args array has to be allocated here.
		if (Array.isArray(expr) && typeof expr[0] === 'function')
			func = expr[0];
		else if (typeof expr === 'function') {
			func = expr;
			expr = null;
		}
		else
			throw new Error(`Invalid event binding: <${node.tagName.toLowerCase()} ${this.attrName}=\${${JSON.stringify(expr)}}>`);

		this.bindEvent(node, root, eventName, eventName, func, expr);
	}



}

class PathToAttribs extends Path {

	/**
	 * @type {Set<string>} Used for type=AttribType.Multiple to remember the attributes that were added. */
	attrNames;

	/** @type {boolean} Provides one or more attributes on a component. */
	isComponent;

	constructor(nodeBefore, nodeMarker) {
		super(null, null);
		this.nodeMarker = nodeMarker;
		this.attrNames = new Set();
	}

	/**
	 * @param exprs {Expr[][]} Only the first is used. */
	apply(exprs) {
		//#IFDEV
		assert(Array.isArray(exprs));
		//#ENDIF
		this.applySingle(exprs[0]);
	}

	/**
	 * @param expr {Expr} */
	applySingle(expr) {
		let node = this.nodeMarker;

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			if (typeof expr === 'function')
				expr = expr();

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
				let attribs = Util.splitAttribs(expr);
				for (let name in attribs) {
					node.setAttribute(name, attribs[name]);
					this.attrNames.add(name);
				}
			}
		}

		// Remove old attributes.
		for (let oldName of oldNames)
			if (!this.attrNames.has(oldName))
				node.removeAttribute(oldName);
	}


	getExpressionCount() { return 1 }
	getValue(exprs) { return exprs[0]; }
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

/**
 * Maps a string key to multiple values.
 * Values are stored in arrays because pushing them is much faster than Set operations,
 * and deleteAny() needs no iterator allocation.
 * deleteAny() returns values first-in-first-out by advancing a head index (array.head)
 * instead of calling shift(), which would be O(n). */
class MultiValueMap {

	/** @type {Record<string, Array>} */
	data = {};

	// Add a new value for a key
	add(key, value) {
		let data = this.data;
		let array = data[key];
		if (!array)
			data[key] = [value];
		else
			array.push(value);
	}

	/**
	 * Add a new value for a key, unless the key already holds max values.
	 * Used to bound pooled NodeGroup memory.
	 * @param key {string}
	 * @param value
	 * @param max {int} */
	addCapped(key, value, max) {
		let data = this.data;
		let array = data[key];
		if (!array)
			data[key] = [value];
		else if (array.length - (array.head || 0) < max)
			array.push(value);
	}

	/**
	 * Remove the oldest value from a key, and return it.
	 * @param key {string}
	 * @returns {*|undefined} The deleted item. */
	deleteAny(key) {
		let data = this.data;
		let array = data[key];
		if (!array) // slower than pre-check.
			return undefined;

		let head = array.head || 0;
		let result = array[head];
		head++;
		if (head >= array.length)
			delete data[key];
		else
			array.head = head;

		return result;
	}
}

class PathToNodes extends Path {

	/** @type {?NodeGroup[]} The NodeGroups created by this path's expression, in order.
	 * Lazily created; null when the path has only ever rendered a primitive (see textNode). */
	nodeGroups = null;

	/** @type {?Text} When the expression is a single primitive, its text node lives here
	 * with no Template or NodeGroup wrapper.  Mutually exclusive with nodeGroups entries. */
	textNode = null;

	/** @type {?string} The current value of textNode. */
	textValue = null;



	/**
	 * Nodes that have been used during the current render().
	 * Used with getNodeGroup() and freeNodeGroups() on the generic path; the positional diff
	 * tracks in-use NodeGroups in this.nodeGroups instead.
	 * Lazily created since most paths never use it.
	 * @type {?NodeGroup[]} */
	nodeGroupsRendered = null;

	/**
	 * Nodes that were added to the web component during the last render(), but are available to be used again.
	 * Used with getNodeGroup() and freeNodeGroups(), keyed by close key.
	 * Lazily created since most paths never use it.
	 * @type {?MultiValueMap} */
	nodeGroupsAttachedAvailable = null;

	/**
	 * Nodes that were not added to the web component during the last render(), and available to be used again.
	 * Lazily created since most paths never use it.
	 * @type {?MultiValueMap} */
	nodeGroupsDetachedAvailable = null;

	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker);
	}

	/**
	 * Insert/replace the nodes created by a single expression.
	 * Called by applyExprs()
	 * @param exprs {Expr[]} Only the first is used.
	 * @return {Node[]} New Nodes created. */
	apply(exprs) {
		//#IFDEV
		assert(Array.isArray(exprs));
		//#ENDIF
		this.applySingle(exprs[0]);
	}

	/**
	 * Make the DOM between nodeBefore and nodeMarker match the value of expr.
	 * This is the main entry point for rendering an expression's nodes, chosen from three strategies:
	 * 1. A primitive expr updating (or creating) a single text node is handled inline with no allocations.
	 * 2. Otherwise expr is flattened to a list of Templates, strings, and Nodes via collectItems(),
	 *    then applyDiff() positionally diffs them against the previous render's NodeGroups.
	 * 3. If the items contain raw Nodes, now or on the previous render, applyGeneric() uses pooled
	 *    close-key matching and udomdiff, since this.nodeGroups can't track raw Nodes positionally.
	 * @param expr {Expr} */
	applySingle(expr) {

		/*#IFDEV*/this.verify();/*#ENDIF*/

		// Fast path for a single primitive expression, the most common case in loops.
		let exprType = typeof expr;
		if ((exprType === 'string' || exprType === 'number') && !this.itemsHaveNodes) {
			if (exprType !== 'string')
				expr += '';

			// Update the existing text node.
			let tn = this.textNode;
			if (tn !== null) {
				if (this.textValue !== expr) {
					tn.nodeValue = expr;
					this.textValue = expr;
				}
				return;
			}

			let ngs = this.nodeGroups;
			if (ngs === null || ngs.length === 0) {

				// Create a bare text node in an empty path, with no Template or NodeGroup wrapper.
				let node;
				if (this.wholeParent) {
					// A NodeGroup re-applied through a shared stamper (NodeGroup.applyStamp/rewriteStamp)
					// can already hold a lone text child; update it in place.  Node identity is
					// unchanged then, so no caches need invalidation.
					let fc = this.nodeMarker.firstChild;
					if (fc !== null && fc.nodeType === 3 && fc === this.nodeMarker.lastChild) {
						if (fc.nodeValue !== expr)
							fc.nodeValue = expr;
						this.textNode = fc;
						this.textValue = expr;
						return;
					}
					// One native call; the browser creates the text node.
					this.nodeMarker.textContent = expr;
					node = this.nodeMarker.firstChild;
				}
				else {
					node = Globals$1.doc.createTextNode(expr);
					this.nodeMarker.parentNode.insertBefore(node, this.nodeMarker);
				}
				this.textNode = node;
				this.textValue = expr;

				// During a NodeGroup's first applyExprs(), no ancestor caches can reference its nodes yet.
				if (!this.parentNg.firstApply) {
					this.nodesCache = null;
					if (this.parentNg.parentPath)
						this.parentNg.parentPath.clearNodesCache();
				}
				return;
			}

			// A single text NodeGroup left over from an array render.
			if (ngs.length === 1) {
				let ng = ngs[0], tpl = ng.template;
				if (tpl.isText === true) {
					if (tpl.html[0] !== expr) {
						ng.startNode.nodeValue = expr;
						tpl.html[0] = expr; // Text templates have their own html array, so this can't affect others.
						ng.closeKey = expr;
					}
					return;
				}
			}
		}

		// A previous primitive render stored a bare text node; wrap it in a NodeGroup so it can be diffed.
		if (this.textNode !== null) {
			let ng = new NodeGroup(textTemplate(this.textValue), this, this.textNode);
			(this.nodeGroups ??= []).push(ng);
			this.textNode = null;
		}

		// 1. Flatten the expression to a list of Templates, strings and Nodes, evaluating functions along the way.
		/** @type {(Template|string|Node)[]} */
		let newItems = [];
		let hasNodesNow = this.collectItems(expr, newItems, false);

		// 2. Raw Nodes in the items (now or on the previous render) can't be diffed positionally
		// because this.nodeGroups only tracks NodeGroups.  Use the generic path for those.
		if (hasNodesNow || this.itemsHaveNodes) {
			this.itemsHaveNodes = hasNodesNow;
			this.applyGeneric(newItems);
		}
		else {
			// Templates with a key=${} attribute diff by key so node identity follows the data.
			// An empty list also routes to applyKeyed when the previous render was keyed,
			// so removed keyed NodeGroups are discarded instead of pooled.
			let first = newItems.length !== 0 ? newItems[0] : null;
			if (first !== null
				? (typeof first !== 'string' && Shell.get(first.html, first.svgMode).keyIndex >= 0)
				: (this.nodeGroups !== null && this.nodeGroups.length !== 0 && this.nodeGroups[0].key !== undefined))
				this.applyKeyed(newItems);
			else
				this.applyDiff(newItems);
		}

		/*#IFDEV*/this.verify();/*#ENDIF*/
	}

	/**
	 * Positionally diff newItems (all Templates) against this.nodeGroups.
	 * Unchanged NodeGroups are kept without any hashing or map lookups.
	 * NodeGroups created from the same html are rewritten in place.
	 * Leftover items are removed/inserted with direct DOM operations.
	 * @param newItems {Template[]} */
	applyDiff(newItems) {
		let oldNgs = this.nodeGroups || emptyNodeGroups;
		let oldLen = oldNgs.length, newLen = newItems.length;
		let newNgs = new Array(newLen);

		let start = 0;
		let oldEnd = oldLen, newEnd = newLen;

		// 1. Keep the matching prefix.
		// This runs before the suffix scan so that removing one of several identical items keeps the first ones.
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			if (!itemSame(ng, t))
				break;
			if (ng.hasComponentPaths)
				ng.applyExprs(t.exprs, false);
			newNgs[start] = ng;
			start++;
		}

		// 2. Keep the matching suffix.  This makes removing items from the middle cheap.
		while (oldEnd > start && newEnd > start) {
			let ng = oldNgs[oldEnd-1], t = newItems[newEnd-1];
			if (!itemSame(ng, t))
				break;
			if (ng.hasComponentPaths)
				ng.applyExprs(t.exprs, false);
			newNgs[--newEnd] = ng;
			oldEnd--;
		}

		// 3. Aligned middle scan: keep unchanged NodeGroups, rewrite same-shape ones in place.
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			if (itemSame(ng, t)) { // Can happen between changed rows, e.g. partial updates.
				if (ng.hasComponentPaths)
					ng.applyExprs(t.exprs, false);
			}
			else if (itemClose(ng, t))
				this.rewriteNodeGroup(ng, t);
			else
				break; // Different html at this position.  Remove/insert the remaining window below.
			newNgs[start] = ng;
			start++;
		}

		let oldRemain = oldEnd - start, newRemain = newEnd - start;
		if (oldRemain || newRemain) {

			// 4. Remove leftover old NodeGroups.
			if (oldRemain) {
				// Materialize node caches of multi-node groups while still attached,
				// since detaching breaks sibling links.  Single-node groups don't need it.
				for (let i=start; i<oldEnd; i++) {
					let ng = oldNgs[i];
					if (ng.startNode !== ng.endNode)
						ng.getNodes();
				}

				// Fast clear when removing everything.
				let cleared = newLen === 0 && start === 0 && this.fastClear();
				let pool = this.nodeGroupsDetachedAvailable ??= new MultiValueMap();
				for (let i=start; i<oldEnd; i++) {
					let ng = oldNgs[i];
					if (ng.startNode !== ng.endNode)
						Util.saveOrphans(ng.getNodes()); // Moves the nodes out of the DOM, into their own fragment.
					else if (!cleared)
						ng.startNode.remove();
					if (!ng.template.isText)
						pool.addCapped(ng.closeKey, ng, maxPooledPerKey);
				}
			}

			// 5. Insert leftover new items.
			if (newRemain) {
				let wholeParent = this.wholeParent;
				let anchor = newEnd < newLen ? newNgs[newEnd].startNode : (wholeParent ? null : this.nodeMarker);
				let parent = wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
				let target = parent, before = anchor;
				let fragment = null;
				if (newRemain > 1) { // Batch-insert through a fragment.
					fragment = Globals$1.doc.createDocumentFragment();
					target = fragment;
					before = null;
				}
				for (let i=start; i<newEnd; i++) {
					let ng = this.createOrReuse(newItems[i]);
					newNgs[i] = ng;
					let node = ng.startNode, end = ng.endNode;
					if (node === end) // Single-node NodeGroups are the common case in loops.
						target.insertBefore(node, before);
					else while (true) {
						let next = node.nextSibling;
						target.insertBefore(node, before);
						if (node === end)
							break;
						node = next;
					}
				}
				if (fragment)
					parent.insertBefore(fragment, anchor);
			}

			// 6. Node membership changed, so invalidate caches.
			// During a NodeGroup's first applyExprs(), no ancestor caches can reference its nodes yet.
			if (!this.parentNg.firstApply) {
				this.nodesCache = null;
				if (this.parentNg.parentPath)
					this.parentNg.parentPath.clearNodesCache();
			}
		}

		this.nodeGroups = newNgs;

		// Keep state used by the generic path from going stale.
		if (this.nodeGroupsRendered)
			this.nodeGroupsRendered = null;
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
	}

	/**
	 * Keyed reconciliation: match this.nodeGroups to newItems by their key=${} expressions,
	 * so NodeGroup (and DOM node) identity follows the data:
	 * 1. Prefix/suffix scans keep NodeGroups whose keys match in place, rewriting changed content.
	 * 2. The middle windows match through a key map, and kept NodeGroups outside a longest
	 *    increasing subsequence of old positions are moved, so the fewest node ranges move.
	 * 3. Unmatched new items create fresh NodeGroups and unmatched old ones are discarded —
	 *    never pooled — so replaced data always gets new nodes, as keyed semantics require.
	 * @param newItems {(Template|string)[]} */
	applyKeyed(newItems) {
		let oldNgs = this.nodeGroups || emptyNodeGroups;
		let oldLen = oldNgs.length, newLen = newItems.length;
		let newNgs = new Array(newLen);

		// Resolve an item's key, caching the html->keyIndex lookup for same-template lists.
		let keyHtml = null, keyIndex = -1;
		const keyOf = t => {
			if (t.html !== keyHtml) {
				keyHtml = t.html;
				keyIndex = Shell.get(t.html, t.svgMode).keyIndex;
			}
			return keyIndex >= 0 ? t.exprs[keyIndex] : undefined;
		};

		//#IFDEV
		{
			let seen = new Set();
			for (let t of newItems) {
				let k = typeof t === 'string' ? undefined : keyOf(t);
				if (k === undefined)
					console.warn('Unkeyed item in a keyed list; it will be rebuilt on every render:', t);
				else if (seen.has(k))
					console.warn('Duplicate key in keyed list:', k);
				else
					seen.add(k);
			}
		}
		//#ENDIF

		let start = 0, oldEnd = oldLen, newEnd = newLen;

		// 1. Keep the matching prefix in place, rewriting changed content.
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			// An identical Template instance (h.memo) implies an identical key, so skip key extraction.
			if (ng.template === t) {
				if (ng.hasComponentPaths)
					ng.applyExprs(t.exprs, false);
			}
			else if (typeof t === 'string' || ng.key !== keyOf(t) || !itemClose(ng, t))
				break;
			else if (itemSame(ng, t)) {
				if (ng.hasComponentPaths)
					ng.applyExprs(t.exprs, false);
			}
			else
				this.rewriteNodeGroup(ng, t);
			newNgs[start] = ng;
			start++;
		}

		// 2. Keep the matching suffix.
		while (oldEnd > start && newEnd > start) {
			let ng = oldNgs[oldEnd-1], t = newItems[newEnd-1];
			if (ng.template === t) {
				if (ng.hasComponentPaths)
					ng.applyExprs(t.exprs, false);
			}
			else if (typeof t === 'string' || ng.key !== keyOf(t) || !itemClose(ng, t))
				break;
			else if (itemSame(ng, t)) {
				if (ng.hasComponentPaths)
					ng.applyExprs(t.exprs, false);
			}
			else
				this.rewriteNodeGroup(ng, t);
			newNgs[--newEnd] = ng;
			oldEnd--;
		}

		let oldRemain = oldEnd - start, newRemain = newEnd - start;
		if (oldRemain || newRemain) {
			let wholeParent = this.wholeParent;
			let parent = wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;

			// 3. Match the middle windows by key.
			let kept = 0, moved = false;
			let sources = null; // sources[i] = old index reused by new item start+i, or -1 to create fresh.
			let removals = null;
			if (oldRemain) {
				if (newRemain) {
					let keyToNewIndex = new Map();
					for (let i=start; i<newEnd; i++) {
						let t = newItems[i];
						if (typeof t !== 'string')
							keyToNewIndex.set(keyOf(t), i);
					}
					sources = new Array(newRemain).fill(-1);
					let lastNewIndex = -1;
					for (let i=start; i<oldEnd; i++) {
						let ng = oldNgs[i];
						let newIndex = ng.key === undefined ? undefined : keyToNewIndex.get(ng.key);
						let t;
						if (newIndex !== undefined && sources[newIndex-start] === -1 && itemClose(ng, t = newItems[newIndex])) {
							sources[newIndex-start] = i;
							kept++;
							if (newIndex < lastNewIndex)
								moved = true;
							else
								lastNewIndex = newIndex;
							if (itemSame(ng, t)) {
								if (ng.hasComponentPaths)
									ng.applyExprs(t.exprs, false);
							}
							else
								this.rewriteNodeGroup(ng, t);
							newNgs[newIndex] = ng;
						}
						else
							(removals ??= []).push(ng);
					}
				}
				else {
					removals = oldNgs.slice(start, oldEnd);
				}
			}

			// 4. Remove unmatched old NodeGroups.  They're discarded, never pooled,
			// so a later render with new keys always creates new nodes.
			if (removals) {
				// Materialize node caches of multi-node groups while attached, since detaching breaks sibling links.
				for (let ng of removals)
					if (ng.startNode !== ng.endNode)
						ng.getNodes();

				// Fast clear when nothing is kept anywhere; the whole region is removals.
				let cleared = start === 0 && newEnd === newLen && kept === 0 && this.fastClear();
				if (!cleared)
					for (let ng of removals) {
						if (ng.startNode !== ng.endNode)
							Util.saveOrphans(ng.getNodes()); // Moves the nodes out of the DOM, into their own fragment.
						else
							ng.startNode.remove();
					}
			}

			// 5. Insert new NodeGroups and move kept ones.
			if (newRemain) {
				let anchor = newEnd < newLen ? newNgs[newEnd].startNode : (wholeParent ? null : this.nodeMarker);

				// 5a. Nothing kept in the middle: batch-insert every new item through a fragment.
				if (kept === 0) {
					let target = parent, before = anchor;
					let fragment = null;
					if (newRemain > 1) {
						fragment = Globals$1.doc.createDocumentFragment();
						target = fragment;
						before = null;
					}
					for (let i=start; i<newEnd; i++) {
						let ng = this.createNew(newItems[i]);
						newNgs[i] = ng;
						let node = ng.startNode, end = ng.endNode;
						if (node === end)
							target.insertBefore(node, before);
						else while (true) {
							let next = node.nextSibling;
							target.insertBefore(node, before);
							if (node === end)
								break;
							node = next;
						}
					}
					if (fragment)
						parent.insertBefore(fragment, anchor);
				}

				// 5b. Mixed: iterate backwards so each item's anchor is already in place.
				// Kept NodeGroups on a longest increasing subsequence of old positions stay still;
				// everything else moves or is created.
				else {
					let lis = moved ? longestIncreasingSubsequence(sources) : null;
					let lisPos = lis !== null ? lis.length - 1 : -1;
					for (let i=newEnd-1; i>=start; i--) {
						let ng = newNgs[i];
						if (ng === undefined) { // Create and insert.
							ng = this.createNew(newItems[i]);
							newNgs[i] = ng;
							insertNodesBefore(parent, ng, anchor);
						}
						else if (lis !== null) {
							if (lisPos >= 0 && lis[lisPos] === i - start)
								lisPos--; // Part of the stable subsequence; doesn't move.
							else
								insertNodesBefore(parent, ng, anchor);
						}
						anchor = ng.startNode;
					}
				}
			}

			// 6. Node membership or order changed, so invalidate caches.
			// During a NodeGroup's first applyExprs(), no ancestor caches can reference its nodes yet.
			if (!this.parentNg.firstApply) {
				this.nodesCache = null;
				if (this.parentNg.parentPath)
					this.parentNg.parentPath.clearNodesCache();
			}
		}

		this.nodeGroups = newNgs;

		// Keep state used by the generic path from going stale.
		if (this.nodeGroupsRendered)
			this.nodeGroupsRendered = null;
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
	}

	/**
	 * Create a NodeGroup for an item in a keyed list.  Never reuses pooled NodeGroups,
	 * because keyed semantics require new keys to get new nodes.
	 * @param item {Template|string}
	 * @return {NodeGroup} */
	createNew(item) {
		if (typeof item === 'string')
			return new NodeGroup(textTemplate(item), this); // Text NodeGroups have no paths to apply.
		let ng = new NodeGroup(item, this);
		if (item.exprs.length || (ng.paths && ng.paths.length))
			ng.applyExprs(item.exprs);
		return ng;
	}

	/**
	 * Update an existing NodeGroup, created from the same html strings, with new values.
	 * @param ng {NodeGroup}
	 * @param item {Template|string} */
	rewriteNodeGroup(ng, item) {
		if (typeof item === 'string') { // Text content.
			ng.startNode.nodeValue = item;
			ng.template.html[0] = item; // Text templates have their own html array, so this can't affect others.
			ng.closeKey = item;
		}
		else {
			// When every path consumes exactly one expression, paths align 1:1 with exprs,
			// so only the expressions that changed need to be applied.
			if (ng.pathsSingleExpr) {
				// Stamped groups (paths === null) rewrite through the shared stampers and stay
				// path-less, unless a child-node expression stopped being primitive.
				if (ng.paths !== null || !ng.rewriteStamp(item)) {
					let oldExprs = ng.template.exprs, newExprs = item.exprs;
					let paths = ng.paths ?? ng.materializePaths();
					for (let i = paths.length - 1; i >= 0; i--)
						if (!exprSame(oldExprs[i], newExprs[i]))
							paths[i].applySingle(newExprs[i]);
				}

				if (ng.styles)
					ng.updateStyles();
				ng.nodesCache = null;
				ng.firstApply = false;
			}
			else
				ng.applyExprs(item.exprs);
			ng.template = item;
		}
	}

	/**
	 * Create a NodeGroup for an item, reusing a detached one with the same html if available.
	 * @param item {Template|string}
	 * @return {NodeGroup} */
	createOrReuse(item) {
		let ng;
		if (typeof item === 'string') {
			item = textTemplate(item);
			return new NodeGroup(item, this); // Text NodeGroups have no paths to apply.
		}

		let pool = this.nodeGroupsDetachedAvailable;
		if (pool) {
			ng = pool.deleteAny(item.getCloseKey());
			if (ng) {
				// rewriteNodeGroup compares expressions and writes only what changed,
				// keeping stamped groups path-less.  It also assigns ng.template.
				this.rewriteNodeGroup(ng, item);
				return ng;
			}
		}

		ng = new NodeGroup(item, this);
		if (item.exprs.length || (ng.paths && ng.paths.length))
			ng.applyExprs(item.exprs);
		return ng;
	}

	/**
	 * Recursively flatten expr into items, evaluating functions and converting primitives to text Templates.
	 * @param expr
	 * @param items {(Template|Node)[]}
	 * @param hasNodes {boolean}
	 * @return {boolean} True if any raw Nodes were added to items. */
	collectItems(expr, items, hasNodes) {
		if (expr instanceof Template)
			items.push(expr);

		else if (Array.isArray(expr)) {
			for (let subExpr of expr) {
				if (subExpr instanceof Template) // Inline the most common case.
					items.push(subExpr);
				else
					hasNodes = this.collectItems(subExpr, items, hasNodes);
			}
		}

		else if (typeof expr === 'function')
			hasNodes = this.collectItems(expr(), items, hasNodes);

		else if (expr instanceof NodeList) {
			for (let node of expr)
				items.push(node);
			hasNodes = hasNodes || expr.length > 0;
		}

		else if (expr?.nodeType) {
			if (expr.nodeType === 11) { // DocumentFragment
				for (let node of [...expr.childNodes])
					items.push(node);
			}
			else
				items.push(expr);
			hasNodes = true;
		}

		// String/Number/Date/Boolean.  Pushed as a plain string to avoid allocating a Template.
		else {
			if (expr === undefined || expr === false || expr === null) // Util.isFalsy() inlined
				expr = '';
			else if (typeof expr !== 'string')
				expr += '';

			items.push(expr);
		}
		return hasNodes;
	}

	/**
	 * Pool-based reconciliation using close keys and udomdiff.  Used when expressions contain
	 * raw Nodes, since those can't be tracked by the positional diff.
	 * @param items {(Template|string|Node)[]} */
	applyGeneric(items) {
		let path = this;
		path.freeNodeGroups();

		/** @type {Node[]} */
		let newNodes = [];
		let oldNodeGroups = path.nodeGroups || emptyNodeGroups;
		/*#IFDEV*/assert(!oldNodeGroups.includes(null));/*#ENDIF*/

		path.nodeGroups = [];
		for (let item of items) {
			if (typeof item === 'string')
				item = textTemplate(item);
			if (item instanceof Template) {
				let ng = path.getNodeGroup(item);
				newNodes.push(...ng.getNodes());
				path.nodeGroups.push(ng);
			}
			else // A raw Node from an expression; collectItems() has already flattened fragments and NodeLists.
				newNodes.push(item);
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

				// Rearrange nodes.
				if (path.wholeParent)
					udomdiff(path.nodeMarker, oldNodes, newNodes, null);
				else
					udomdiff(path.nodeMarker.parentNode, oldNodes, newNodes, path.nodeMarker);
			}

			// TODO: Put this in a remove() function of NodeGroup.
			// Then only run it on the old nodeGroups that were actually removed.
			//Util.saveOrphans(oldNodeGroups, oldNodes);

			for (let ng of oldNodeGroups)
				if (!ng.startNode.parentNode)
					Util.saveOrphans(ng.getNodes());
		}
	}


	/**
	 * Clear the nodeCache of this Path, as well as all parent and child Paths that
	 * share the same DOM parent node. */
	clearNodesCache() {
		let path = this;

		// Clear cache parent Paths that have the same parentNode
		let parentNode = this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
		while (path && (path.wholeParent ? path.nodeMarker : path.nodeMarker.parentNode) === parentNode) {
			path.nodesCache = null;
			path = path.parentNg?.parentPath;
		}
	}

	/**
	 * Attempt to remove all of this Path's nodes from the DOM, if it can be done using a special fast method.
	 * @returns {boolean} Returns false if Nodes weren't removed, and they should instead be removed manually. */
	fastClear() {
		if (this.wholeParent) {
			this.nodeMarker.textContent = '';
			return true;
		}

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
	 * Get a NodeGroup with the same html as the template, reusing a pooled one if available.
	 * The first pooled NodeGroup with the same close key (html shape) is taken and its
	 * expressions are updated, skipping the update when its values are already identical.
	 *
	 * @param template {Template}
	 * @return {NodeGroup} */
	getNodeGroup(template) {
		let closeKey = template.getCloseKey();
		let result = this.nodeGroupsAttachedAvailable?.deleteAny(closeKey)
			|| this.nodeGroupsDetachedAvailable?.deleteAny(closeKey);

		if (result) {
			if (templatesSame(result.template, template)) {
				// Components still render so changes deeper in the tree can surface.
				if (result.hasComponentPaths)
					result.applyExprs(template.exprs, false);
			}
			else
				result.applyExprs(template.exprs);
			result.template = template;
		}
		else {
			result = new NodeGroup(template, this);
			result.applyExprs(template.exprs);
		}

		(this.nodeGroupsRendered ??= []).push(result);

		/*#IFDEV*/assert(result.parentPath);/*#ENDIF*/
		return result;
	}


	/**
	 * Move everything from this.nodeGroupsRendered to this.nodeGroupsAttached and nodeGroupsDetached.
	 * Called at the beginning of applyGeneric() so it can have NodeGroups to use.
	 * TODO: this could run as needed in getNodeGroup? */
	freeNodeGroups() {
		// Add nodes that weren't used during render() to nodeGroupsDetached
		let previouslyAttached = this.nodeGroupsAttachedAvailable?.data;
		if (previouslyAttached) {
			let detached = (this.nodeGroupsDetachedAvailable ??= new MultiValueMap()).data;
			for (let key in previouslyAttached) {
				let src = previouslyAttached[key];
				let from = src.head || 0; // Skip entries already consumed by deleteAny().
				let array = detached[key];
				if (!array) {
					array = detached[key] = from ? src.slice(from) : src;
					if (array.length > maxPooledPerKey)
						array.length = maxPooledPerKey;
				}
				else
					for (let i=from, max=maxPooledPerKey + (array.head || 0); i<src.length && array.length < max; i++)
						array.push(src[i]);
			}
		}

		// Add nodes that were used during render() to nodeGroupsRendered.
		// If the last render used the positional diff, the in-use NodeGroups are in
		// this.nodeGroups instead of nodeGroupsRendered.
		this.nodeGroupsAttachedAvailable = new MultiValueMap();
		let nga = this.nodeGroupsAttachedAvailable;
		let source = this.nodeGroupsRendered?.length ? this.nodeGroupsRendered : this.nodeGroups;
		if (source)
			for (let ng of source)
				nga.add(ng.closeKey, ng);

		this.nodeGroupsRendered = null;
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
		result = this.nodesCache;
		if (result) {
			//#IFDEV
			//this.checkNodesCache();
			//#ENDIF
			return result
		}

		result = [];
		let current, stop = null;
		if (this.wholeParent)
			current = this.nodeMarker.firstChild;
		else {
			current = this.nodeBefore.nextSibling;
			stop = this.nodeMarker;
		}
		while (current && current !== stop) {
			result.push(current);
			current = current.nextSibling;
		}

		this.nodesCache = result;
		return result;
	}

	//#IFDEV

	get debug() {
		return [
			`parentNode: ${this.nodeBefore.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item?.nodeType)
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

	checkNodesCache() {
		return;
	}
	//#ENDIF
}


// Shared empty array for paths whose nodeGroups were never created.  Never mutated.
const emptyNodeGroups = [];

// Most detached NodeGroups kept per close key.  Bounds memory growth after very large
// lists are cleared while keeping pooled rows for every typical re-create pattern.
// Lowering this (e.g. to 1000) cuts retained memory ~7x after clearing a 10k-row list,
// but makes re-creating such a list ~2x slower since most rows are built fresh.
const maxPooledPerKey = 10000;

/**
 * @param text {string}
 * @return {Template} */
function textTemplate(text) {
	let result = new Template([text], []);
	result.isText = true;
	return result;
}

/**
 * Does the NodeGroup already have content identical to item?
 * @param ng {NodeGroup}
 * @param item {Template|string}
 * @return {boolean} */
function itemSame(ng, item) {
	let tpl = ng.template;
	if (tpl === item) // h.memo() returns the same Template instance when deps are unchanged.
		return true;
	if (typeof item === 'string')
		return tpl.isText === true && tpl.html[0] === item;
	return templatesSame(tpl, item);
}

/**
 * Could ng be rewritten in place with the values of item?
 * True when both come from the same html strings (and thus the same Shell), or both are text.
 * @param ng {NodeGroup}
 * @param item {Template|string}
 * @return {boolean} */
function itemClose(ng, item) {
	let tpl = ng.template;
	if (typeof item === 'string')
		return tpl.isText === true;
	return tpl.html === item.html && tpl.svgMode === item.svgMode;
}

/**
 * Insert all of ng's nodes before anchor within parent.
 * @param parent {Node}
 * @param ng {NodeGroup}
 * @param anchor {?Node} Null appends at the end. */
function insertNodesBefore(parent, ng, anchor) {
	let node = ng.startNode, end = ng.endNode;
	if (node === end) // Single-node NodeGroups are the common case in loops.
		parent.insertBefore(node, anchor);
	else while (true) {
		let next = node.nextSibling;
		parent.insertBefore(node, anchor);
		if (node === end)
			break;
		node = next;
	}
}

/**
 * Indices into arr whose values form a longest strictly increasing subsequence, skipping -1 entries.
 * O(n log n) patience algorithm with predecessor backtracking, as used by Vue 3's keyed diff.
 * @param arr {int[]}
 * @return {int[]} */
function longestIncreasingSubsequence(arr) {
	let result = []; // Indices of the smallest known tail for each subsequence length.
	let prev = new Array(arr.length); // prev[i] = index that comes before i in the subsequence ending at i.
	for (let i=0; i<arr.length; i++) {
		let v = arr[i];
		if (v === -1)
			continue;
		// Binary search for the first tail whose value >= v.
		let lo = 0, hi = result.length;
		while (lo < hi) {
			let mid = (lo + hi) >> 1;
			if (arr[result[mid]] < v)
				lo = mid + 1;
			else
				hi = mid;
		}
		if (lo > 0)
			prev[i] = result[lo-1];
		if (lo === result.length)
			result.push(i);
		else
			result[lo] = i;
	}
	// Backtrack from the last tail to recover the subsequence's indices.
	let pos = result.length;
	if (pos) {
		let i = result[pos-1];
		while (pos-- > 0) {
			result[pos] = i;
			i = prev[i];
		}
	}
	return result;
}

/**
 * Consumes the key=${expr} expression of a keyed template.
 * Writes the value to its NodeGroup's key field and never touches the DOM.
 * Created by Shell when it strips a key attribute; PathToNodes.applyKeyed()
 * matches NodeGroups to new templates by this key. */
class PathToKey extends Path {

	/**
	 * @param exprs {Expr[]} Only the first is used. */
	apply(exprs) {
		this.parentNg.key = exprs[0];
	}

	applySingle(expr) {
		this.parentNg.key = expr;
	}
}

class PathToComponent extends Path {

	/** @type {PathToAttribValue[]} Paths to dynamics attributes that will be set on the component.*/
	attribPaths;

	/** @type {string} Hash of the exprs from the previous apply(), used to detect changes. */
	appliedExprsHash;

	constructor(nodeBefore, nodeMarker) {
		super(null, nodeMarker);
	}

	/**
	 * Call render() on the component pointed to by this Path.
	 * And instantiate it (from a -solarite-placeholder element) if it hasn't been done yet.
	 * @param exprs {Expr[][]} Expressions to evaluate for each attribute to pass to the constructor.
	 * This is different than other Path.apply() functions which only receive Expr[] and not Expr[][].
	 * Because here we're receiving an array of arrays of expressions, one for each dynamic attribute. */
	apply(exprs) {
		//#IFDEV
		assert(Array.isArray(exprs));
		assert(!exprs.length || Array.isArray(exprs[0]));
		//#ENDIF

		//#IFDEV
		assert(exprs.length === this.attribPaths.length);
		//#ENDIF

		// Deep comparison via hashing, so mutating a field on the same object counts as changed.
		let newHash = getObjectHash(exprs);
		let changed = newHash !== this.appliedExprsHash;
		this.appliedExprsHash = newHash;

		let el = this.nodeMarker;

		// 1. Attributes
		let attribs = Util.attribsToObject(el, '_is');
		for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
			if (attribPath instanceof PathToKey) // The list key is never a component arg.
				continue;
			if (attribPath instanceof PathToAttribValue) {
				let name = Util.dashesToCamel(attribPath.attrName);
				
				// Resolve two way bindimg path before we pass it to the component.
				let value = attribPath.getValue(exprs[i]);
				if (!attribPath.attrValue && isDelvePath(value))
					value = delve(value[0], value.slice(1));
				
				attribs[name] = value;
			}
			else { // PathToAttribs
				let val = attribPath.getValue(exprs[i]);
				if (typeof val === 'object')
					for (let name in val)
						attribs[Util.dashesToCamel(name)] = val[name];
				else if (typeof val === 'string') {
					let attrs = Util.splitAttribs(val);
					for (let name in attrs)
						attribs[Util.dashesToCamel(name)] = attrs[name];
				}
			}
		}

		// 2. Instantiate component on first time.
		let isAttrib = el.getAttribute('_is');
		if (el.tagName.endsWith('-SOLARITE-PLACEHOLDER') || isAttrib) {


			// 2a. Instantiate component
			let tagName = (isAttrib || el.tagName.slice(0, -21)).toLowerCase(); // Remove -SOLARITE-PLACEHOLDER
			let Constructor = customElements.get(tagName);
			if (!Constructor)
				throw new Error(`Must call customElements.define('${tagName}', Class) before using it.`);

			Globals$1.currentSlotChildren = [...el.childNodes]; // TODO: Does this need to be a stack?
			let newEl = new Constructor(attribs);

			// 2b. Copy attributes over.
			if (isAttrib) {
				newEl.setAttribute('is', isAttrib);
			//	el.removeAttribute('_is');
			}
			for (let attrib of el.attributes)
				if (attrib.name !== '_is')
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
				delve(this.parentNg.getRootNode(), id.split(/\./g), newEl);

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

			// 2f. Call render() if it wasn't called by the constructor.
			// This must happen before we add it to the DOM which can trigger connectedCallback() -> renderFirstTime()
			// Because that path renders it without the attribute expressions.
			if (typeof newEl.render === 'function' && !Globals$1.rendered.has(newEl))
				newEl.render(attribs, true);

			// 2g. Update attribute paths to use the new element and re-apply them.
			for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
				attribPath.parentNg = this.parentNg;
				attribPath.nodeMarker = newEl;
				attribPath.apply(exprs[i]);
			}

			// 2e. Swap it to the DOM.
			el.replaceWith(newEl);
		}

		// 2f. Render
		else if (typeof el.render === 'function')
			el.render(attribs, changed);

		Globals$1.currentSlotChildren = null;
	}

	/**
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {Path} */
	clone(newRoot, pathOffset=0) {
		/*#IFDEV*/this.verify();/*#ENDIF*/
		let nodeMarker = this.getNewNodeMarker(newRoot, pathOffset);
		let result = new PathToComponent(null, nodeMarker);
		result.attribPaths = this.attribPaths.map(path => path.clone(newRoot, pathOffset));

		//#IFDEV
		result.verify();
		//#ENDIF

		return result;
	}

	getExpressionCount() { return 0 }

	//#IFDEV
	verify() {
		super.verify();
		assert(this.nodeMarker.nodeType === Node.ELEMENT_NODE);
		assert(this.nodeMarker.tagName.includes('-') || this.nodeMarker.hasAttribute('is') || this.nodeMarker.hasAttribute('_is'));
		if (this.attribPaths)
			for (let path of this.attribPaths)
				path.verify();
	}

	//#ENDIF
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

	/** @type {Path[]} Paths to where expressions should go. */
	paths = [];

	// Elements with events.  Is there a reason to use this?  We already mark event Exprs in Shell.js.
	// events = [];

	/** @type {int[][]} Array of paths */
	ids = [];

	/** @type {int[][]} Array of paths */
	styles = [];

	/** @type {int[][]} Array of paths */
	scripts = [];

	/** @type {boolean} True if any of this Shell's own paths is a PathToComponent. */
	hasComponentPaths = false;

	/** @type {boolean} True if every path consumes exactly one expression and none are components.
	 * Lets NodeGroup.applyExprs() use a fast loop without allocating per-path expression arrays. */
	pathsSingleExpr = false;

	/** @type {boolean} True if this Shell has any ids, styles, or scripts. */
	hasEmbeds = false;

	/** @type {int} Index of the key=${} expression, or -1 when the template isn't keyed. */
	keyIndex = -1;

	/** @type {boolean} True when the fragment holds exactly one root element and the resolve
	 * program exists.  NodeGroups then clone that element directly, skipping a throwaway
	 * DocumentFragment wrapper per clone.  See setPathsFromFragment(). */
	singleRoot = false;

	/** @type {boolean} True when NodeGroups can be created via NodeGroup.applyStamp()
	 * with no per-instance Path objects.  See the stampPaths setup in the constructor. */
	stampable = false;

	/**
	 * Create the nodes but without filling in the expressions.
	 * This is useful because the expression-less nodes created by a template can be cached.
	 * @param html {string[]} Html strings, split on places where an expression exists.
	 * @param svgMode {boolean} Parse the html in the SVG namespace.  */
	constructor(html=null, svgMode=false) {
		if (!html)
			return;

		//#IFDEV
		this._html = html.join('');
		//#ENDIF

		// If no html tags or entities, just create a text node.
		if (html.length === 1 && !html[0].match(/[<&]/)) {
			this.fragment = Globals$1.doc.createTextNode(html[0]);
			return;
		}


		// 1.  Add placeholders
		let htmlWithPlaceholders = Shell.addPlaceholders(html);

		let template = Globals$1.doc.createElement('template'); // Using a single global template won't keep the nodes as children of the DocumentFragment.
		if (htmlWithPlaceholders) {
			// Wrap in <svg> so the parser's foreign-content rules create the nodes in the SVG namespace,
			// then lift the children back out so the fragment has no wrapper.
			if (svgMode) {
				template.innerHTML = '<svg>' + htmlWithPlaceholders + '</svg>';
				let svgEl = template.content.firstChild;
				let frag = Globals$1.doc.createDocumentFragment();
				while (svgEl.firstChild)
					frag.append(svgEl.firstChild);
				this.fragment = frag;
			}
			else {
				template.innerHTML = htmlWithPlaceholders;
				this.fragment = template.content;
			}
		}
		else { // Create one text node, so shell isn't empty and NodeGroups created from it have something to point the startNode and endNode at.
			template.content.append(Globals$1.doc.createTextNode(''));
			this.fragment = template.content;
		}

		// 1b. Remove whitespace-only text nodes inside table-structure elements.
		// The parser foster-parents non-whitespace text out of tables, and whitespace-only
		// text between cells/rows is never rendered, so removing it is invisible.
		// Smaller fragments make cloning, path resolution, and insertion faster.
		stripTableWhitespace(this.fragment);

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
				const isComponent = (hasIs || node.tagName.includes('-'));
				const componentAttribPaths = [];

				for (let attr of [...node.attributes]) { // Copy the attributes array b/c we remove attributes with placeholders as we go.

					// The reserved key attribute identifies this template within a keyed list.
					// It's consumed here and never written to the DOM or passed to components.
					if (attr.name === 'key') {
						let parts = attr.value.split(/[\ue000-\uf8ff]/g);
						if (parts.length !== 2 || parts[0] !== '' || parts[1] !== '')
							throw new Error(`The key attribute is reserved and must be a single expression: key=\${...}`);
						if (node.parentNode !== this.fragment)
							throw new Error(`The key attribute must be on a top-level element of its template.`);
						if (this.keyIndex >= 0)
							throw new Error(`A template can have only one key attribute.`);
						this.keyIndex = attr.value.charCodeAt(0) - attribPlaceholder;

						let path = new PathToKey(null, node);
						this.paths.push(path);
						if (isComponent)
							componentAttribPaths.push(path); // Keeps PathToComponent's contiguous expression slices aligned; it skips PathToKey when building args.

						placeholdersUsed++;
						node.removeAttribute('key');
						continue;
					}

					// One or more whole attributes
					let matches = attr.name.match(/^[\ue000-\uf8ff]$/);
					if (matches) {
						let path = new PathToAttribs(null, node);
						this.paths.push(path);
						if (isComponent) {
							path.isComponentAttrib = true;
							componentAttribPaths.push(path);
						}

						placeholdersUsed ++;
						node.removeAttribute(matches[0]); // TODO: Is this necessary?
					}

					// Just the attribute value.
					else {
						let parts = attr.value.split(/[\ue000-\uf8ff]/g);
						if (parts.length > 1) {
							let nonEmptyParts = (parts.length === 2 && !parts[0].length && !parts[1].length) ? null : parts;

							let isEvent = Util.isEvent(attr.name);
							let path = isEvent
								? new PathToEvent(null, node, attr.name, nonEmptyParts)
								: new PathToAttribValue(null, node, attr.name, nonEmptyParts);
							path.isHtmlProperty = Util.isHtmlProp(node, attr.name);
							this.paths.push(path);
							if (isComponent) {
								path.isComponentAttrib = true;
								componentAttribPaths.push(path);
							}

							placeholdersUsed += parts.length - 1;
							// In svgMode, setting typed SVG attributes (viewBox, r, etc.) with the placeholders
							// stripped out makes the browser log parse errors, both here and when the fragment is cloned.
							// Remove the attribute instead; apply() recreates it with the real values.
							// Event attributes bound to a single expression are removed because they bind via
							// addEventListener; leaving an empty onclick="" attribute violates a strict CSP when the event fires.
							if (svgMode || (isEvent && !nonEmptyParts))
								node.removeAttribute(attr.name);
							else try {
								node.setAttribute(attr.name, parts.join(''));
							}
							catch (e) {
								throw new Error(`Error setting attribute "${attr.name}" on node <${node.tagName}>: ${e.message}`);
							}
						}
					}
				}

				// Web components
				if (isComponent) {
					let path = new PathToComponent(null, node);
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

				let parent = node.parentNode;

				// The expression is the only child of an element, so the element itself
				// can delimit the expression's nodes and no marker comments are needed.
				// Components and slots are excluded because they move their children
				// during instantiation, which would orphan the expression's region.
				if (parent.nodeType === 1 && !node.previousSibling && !node.nextSibling
					&& !parent.tagName.includes('-') && parent.tagName !== 'SLOT' && !parent.hasAttribute('is')) {
					let path = new PathToNodes(null, parent);
					path.wholeParent = true;
					this.paths.push(path);
					placeholdersUsed ++;
					toRemove.push(node); // Removing it here would mess up the treeWalker.
				}

				else {
					// Get or create nodeBefore.
					let nodeBefore = node.previousSibling; // Can be the same as another Path's nodeMarker.
					if (!nodeBefore) {
						nodeBefore = Globals$1.doc.createComment('Path:'+this.paths.length);
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
						nodeMarker.textContent = 'PathEnd:'+ this.paths.length;
					}
					/*#IFDEV*/assert(nodeMarker);/*#ENDIF*/

					let path = new PathToNodes(nodeBefore, nodeMarker);
					this.paths.push(path);
					placeholdersUsed ++;
				}
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
					let path = new Path(node.previousSibling, node);
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
						let path = new PathToNodes(node.previousSibling, node);
						this.paths.push(path);
						placeholdersUsed ++;

						/*#IFDEV*/path.verify();/*#ENDIF*/
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

		for (let path of this.paths) {
			if (path.nodeBefore)
				path.nodeBeforeIndex = Array.prototype.indexOf.call(path.nodeBefore.parentNode.childNodes, path.nodeBefore);

			// Must be calculated after we remove the toRemove nodes:
			path.nodeMarkerPath = Path.get(path.nodeMarker);


		}

		this.findEmbeds();
		this.buildResolveProgram();

		this.pathsSingleExpr = true;
		for (let path of this.paths) {
			if (path instanceof PathToComponent) {
				this.hasComponentPaths = true;
				this.pathsSingleExpr = false;
				break; // Both facts are now decided.
			}
			if (path.getExpressionCount() !== 1)
				this.pathsSingleExpr = false; // Keep scanning for components.
		}

		// Stampable shells create NodeGroups without allocating any Path objects:
		// NodeGroup.applyStamp() writes expressions through these shared stamper paths,
		// and real paths are materialized only if a NodeGroup is later rewritten in place.
		// Child-node paths must be wholeParent so their bare-text state can be recovered.
		if (this.singleRoot && this.pathsSingleExpr) {
			let nodesIdx = [];
			let ok = true;
			for (let i=0; i<this.paths.length; i++) {
				let path = this.paths[i];
				if (path instanceof PathToNodes) {
					if (!path.wholeParent) {
						ok = false;
						break;
					}
					nodesIdx.push(i);
				}
				else if (!(path instanceof PathToAttribValue || path instanceof PathToKey)) {
					ok = false; // Base Paths from commented-out expressions, etc.
					break;
				}
			}
			if (ok) {
				this.stampable = true;

				/** @type {int[]} Indexes of PathToNodes paths, checked for primitive exprs before stamping. */
				this.nodesPathIdx = nodesIdx;

				/** @type {Path[]} One shared stamper per path; nodeMarker/parentNg are set per use. */
				this.stampPaths = this.paths.map(p => p.cloneWithNodes(null, p.nodeMarker));

			}
		}

		/*#IFDEV*/this.verify();/*#ENDIF*/
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
			let context = htmlParser.parse(lastHtml, (html, index, prevContext/*, nextContext*/) => { // This function is called every time the html context changes.
				if (lastIndex !== index) {
					let token = html.slice(lastIndex, index);

					if (prevContext === HtmlParser.Tag) {
						// Find Web Component tags and append -solarite-placeholder to their tag names
						// This way we can gather their constructor arguments and their children before we call their constructor.
						// Later, PathToComponent.apply() will replace them with the real components.
						// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
						const isWebComponentTagName = /^<\/?[a-z][a-z0-9]*-[a-z0-9-]+/i; // a dash in the middle
						token = token.replace(isWebComponentTagName, match => match + '-SOLARITE-PLACEHOLDER'); // caps to match other instances of this string, for better compression.
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
		this.scripts = Array.prototype.map.call(this.fragment.querySelectorAll('script'), el => Path.get(el));

		// TODO: only find styles that have Paths in them?
		this.styles = Array.prototype.map.call(this.fragment.querySelectorAll('style'), el => Path.get(el));

		let idEls = this.fragment.querySelectorAll('[id],[data-id]');

		// Check for valid id names.
		for (let el of idEls) {
			let id = el.getAttribute('data-id') || el.getAttribute('id');
			if (Globals$1.div.hasOwnProperty(id))
				throw new Error(`<${el.tagName.toLowerCase()} id="${id}"> can't override existing HTMLElement id property.`)
		}

		this.ids = Array.prototype.map.call(idEls, el => Path.get(el));

		this.hasEmbeds = this.ids.length > 0 || this.styles.length > 0 || this.scripts.length > 0;
	}

	/**
	 * Precompute a flat program that resolves every path's nodeMarker/nodeBefore in a cloned
	 * fragment with one childNodes access per unique node, sharing ancestor lookups between paths.
	 * Replaces per-path root-to-node walks in the hot NodeGroup creation path.
	 * Skipped for shells with components, whose clone() has special attribPaths behavior. */
	buildResolveProgram() {
		let hasComponents = false;
		for (let path of this.paths)
			if (path instanceof PathToComponent) {
				hasComponents = true;
				break;
			}
		if (hasComponents || !this.paths.length)
			return;

		let ops = [];
		let slotOf = new Map();
		let frag = this.fragment;
		let nextSlot = 1;
		let getSlot = node => {
			if (node === frag)
				return 0;
			let s = slotOf.get(node);
			if (s === undefined) {
				ops.push(getSlot(node.parentNode), Array.prototype.indexOf.call(node.parentNode.childNodes, node));
				s = nextSlot++;
				slotOf.set(node, s);
			}
			return s;
		};
		for (let path of this.paths) {
			path.markerSlot = path.nodeMarker === frag ? 0 : getSlot(path.nodeMarker);
			path.beforeSlot = path.nodeBefore ? getSlot(path.nodeBefore) : -1;
		}

		/** @type {?int[]} Flat [parentSlot, childIndex] pairs; pair i fills slot i+1. */
		this.resolveOps = ops;

		/** @type {Node[]} Reusable scratch array for resolved nodes; safe because resolution never re-enters. */
		this.resolveSlots = new Array(nextSlot);

		// A lone root element means slot 1 is always that element (the first op pair is [0, 0]),
		// so a NodeGroup can clone the element directly and seed slot 1 with it.
		// Embeds are excluded because their paths are fragment-relative.
		if (!this.hasEmbeds && frag.childNodes.length === 1 && frag.firstChild.nodeType === 1
			&& ops.length >= 2 && ops[0] === 0 && ops[1] === 0)
			this.singleRoot = true;
	}

	/**
	 * Get the shell for the html strings.
	 * @param htmlStrings {string[]} Typically comes from a Template.
	 * @param svgMode {boolean} Parse the html in the SVG namespace.
	 * @returns {Shell} */
	static get(htmlStrings, svgMode=false) {
		// One-entry memo, since loops request the same shell for every item.
		if (htmlStrings === lastHtmlStrings && svgMode === lastSvgMode)
			return lastShell;

		let entry = Globals$1.shells.get(htmlStrings);
		if (!entry) {
			entry = {};
			Globals$1.shells.set(htmlStrings, entry); // cache
		}
		let key = svgMode ? 'svg' : 'html';
		let result = entry[key];
		if (!result)
			result = entry[key] = new Shell(htmlStrings, svgMode);

		lastHtmlStrings = htmlStrings;
		lastSvgMode = svgMode;
		lastShell = result;

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


const commentPlaceholder = `<!--!✨!-->`;

// Elements whose whitespace-only text children are never rendered.
const tableTags = ['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR'];

/**
 * Recursively remove whitespace-only text children of table-structure elements.
 * @param el {DocumentFragment|HTMLElement} */
function stripTableWhitespace(el) {
	let isTable = el.nodeType === 1 && tableTags.includes(el.tagName);
	let child = el.firstChild;
	while (child) {
		let next = child.nextSibling;
		if (child.nodeType === 1)
			stripTableWhitespace(child);
		else if (isTable && child.nodeType === 3 && !child.nodeValue.trim())
			child.remove();
		child = next;
	}
}

// One-entry memo for Shell.get().
let lastHtmlStrings = null, lastSvgMode = false, lastShell = null;


// We increment the placeholder char as we go because nodes can't have the same attribute more than once.
const attribPlaceholder = 0xe000; // https://en.wikipedia.org/wiki/Private_Use_Areas  6400.

/** @typedef {boolean|string|number|function|Object|Array|Date|Node|Template} Expr */

/**
 * A group of Nodes instantiated from a Shell, with Expr's filled in.
 *
 * The range is determined by startNode and nodeMarker.
 * startNode - never null.  An empty text node is created before the first path if none exists.
 * nodeMarker - null if this Nodegroup is at the end of its parents' nodes.*/
class NodeGroup {

	/**
	 * @Type {RootNodeGroup} */
	rootNg;

	/** @type {Path} */
	parentPath;

	/** @type {Node|HTMLElement} First node of NodeGroup. Should never be null. */
	startNode;

	/** @type {Node|HTMLElement} A node that never changes that this NodeGroup should always insert its nodes before.
	 * An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * TODO: But sometimes startNode and endNode point to the same node.  Document this inconsistency. */
	endNode;

	/** @type {?Path[]} Null for text NodeGroups; created by setPathsFromFragment(). */
	paths = null;

	/** @type {string} Key that only matches the template. */
	closeKey;

	/** @type {*} List key from the template's key=${} expression; written by PathToKey,
	 * matched by PathToNodes.applyKeyed().  Undefined for unkeyed NodeGroups. */
	key;

	/** @type {boolean} True if any of this NodeGroup's own paths is a PathToComponent. */
	hasComponentPaths = false;

	/** @type {boolean} True if every path consumes exactly one expression and none are components. */
	pathsSingleExpr = false;

	/** @type {boolean} True until applyExprs() finishes the first time.
	 * While true, ancestor node caches can't reference this NodeGroup's nodes, so they don't need invalidation. */
	firstApply = true;

	/**
	 * @internal
	 * @type {Node[]} Cached result of getNodes() used only for improving performance.*/
	nodesCache;

	/**
	 * A map between <style> Elements and their text content.
	 * This lets NodeGroup.updateStyles() see when the style text has changed.
	 * @type {?Map<HTMLStyleElement, string>} */
	styles;

	/** @type {Template} */
	template;


	/**
	 * Create an "instantiated" NodeGroup from a Template and add it to an element.
	 * Don't call applyExprs() yet to apply expressions or instantiate components yet.
	 * @param template {Template}  Create it from the html strings and expressions in this template.
	 * @param parentPath {?Path}
	 * @param el {?HTMLElement} Optional, pre-existing htmlElement that will be the root.
	 * @param options {?object} Only used for RootNodeGroup */
	constructor(template, parentPath=null, el=null, options=null) {
		this.rootNg = parentPath?.parentNg?.rootNg || this;
		this.parentPath = parentPath;

		/*#IFDEV*/assert(this.rootNg);/*#ENDIF*/
		this.template = template;

		// If it's just a text node, skip a bunch of unnecessary steps.
		// el can be an existing Text node to adopt, from PathToNodes' bare-text fast path.
		if (template.isText) {
			this.closeKey = template.getCloseKey();
			this.startNode = this.endNode = el || Globals$1.doc.createTextNode(template.html[0]);
		}

		else {
			// Get a cached version of the parsed and instantiated html, and Paths:
			const shell = Shell.get(template.html, template.svgMode);

			// The shell caches the close key so each new template doesn't repeat the WeakMap lookup.
			this.closeKey = shell.closeKey ??= template.getCloseKey();

			this.hasComponentPaths = shell.hasComponentPaths;
			this.pathsSingleExpr = shell.pathsSingleExpr;

			// A lone root element is cloned directly, skipping a throwaway fragment wrapper.
			// Only for child NodeGroups; RootNodeGroup's grafting expects a fragment.
			if (shell.singleRoot && parentPath !== null) {
				const clone = shell.fragment.firstChild.cloneNode(true);
				this.startNode = this.endNode = clone;

				// Stampable shells skip path creation entirely; the first applyExprs() routes
				// to applyStamp(), and paths are materialized only if the group is rewritten.
				if (shell.stampable !== true)
					this.setPathsFromFragment(clone, shell, 0, true);
			}
			else {
				const shellFragment = shell.fragment.cloneNode(true);

				if (shellFragment.nodeType === 11) { // DocumentFragment
					this.startNode = shellFragment.firstChild;
					this.endNode = shellFragment.lastChild;
				} else
					this.startNode = this.endNode = shellFragment;

				this.instantiate(shell, shellFragment, el, options);
			}
		}

		//#IFDEV
		this.verify();
		//#ENDIF
	}

	/**
	 * Set up paths and embeds from the cloned fragment.
	 * RootNodeGroup overrides this with its more involved setup.
	 * @param shell {Shell}
	 * @param shellFragment {DocumentFragment|HTMLElement|Text}
	 * @param el {?HTMLElement} Unused here; used by RootNodeGroup.
	 * @param options {?object} Unused here; used by RootNodeGroup. */
	instantiate(shell, shellFragment, el, options) {
		if (shell.paths.length)
			this.setPathsFromFragment(shellFragment, shell);

		if (shell.hasEmbeds)
			this.activateEmbeds(shellFragment, shell);
	}


	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param includeNonComponents {boolean} False to only apply component paths,
	 * used when the non-component exprs are known to be unchanged. */
	applyExprs(exprs, includeNonComponents=true) {

		/*#IFDEV*/
		this.verify();
		/*#ENDIF*/

		let paths = this.paths;

		// Fast path: every path consumes exactly one expression and none are components,
		// so skip the bookkeeping that maps expressions to paths.
		if (this.pathsSingleExpr) {
			if (includeNonComponents) {
				if (paths === null) { // Created from a stampable shell; no paths yet.
					this.applyStamp(exprs);
					return;
				}
				for (let i = paths.length - 1; i >= 0; i--)
					paths[i].applySingle(exprs[i]);

				if (this.styles)
					this.updateStyles();

				// Invalidate the nodes cache because we just changed it.
				this.nodesCache = null;
			}
			this.firstApply = false;
			return;
		}

		if (!paths) { // Text NodeGroups have no paths.
			this.firstApply = false;
			return;
		}

		// Things to consider:
		// 1. Paths consume a varying number of expressions.
		//    An PathToAttribs may use multipe expressions.  E.g. <div class="${1} ${2}">
		//    While an PathToComponent uses zero.
		// 2. An PathToComponent references other Paths that set its attribute values.
		// 3. We apply them in reverse order so that a <select> box has its children created from an expression
		//    before its instantiated and its value attribute is set via an expression.
		let exprIndex = exprs.length; // Update exprs at paths.
		let pathExprs = new Array(paths.length); // Store all the expressions that map to a single path.  Only paths to attribute values can have more than one.
		for (let i = paths.length - 1, path; path = paths[i]; i--) {
			if (i===0 && path instanceof PathToComponent && path.nodeMarker === this.getRootNode())
				continue;

			// Get the expressions associated with this path.
			let exprCount = path.getExpressionCount();
			pathExprs[i] = exprs.slice(exprIndex-exprCount, exprIndex); // slice() probably doesn't allocate if the JS vm implements copy on write.
			exprIndex -= exprCount;

			// Component expressions don't have a corresponding user-provided expression.
			// They use expressions from the paths that provide their attributes.
			if (path instanceof PathToComponent) {
				let attribExprs = pathExprs.slice(i+1, i+1 + path.attribPaths.length); // +1 b/c we move forward from the component path.
				path.apply(attribExprs);
			}
			else if (includeNonComponents)
				path.apply(pathExprs[i]);
		}

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		/*#IFDEV*/
		assert(exprIndex === 0);
		/*#ENDIF*/


		if (includeNonComponents) {

			// TODO: Only do this if we have Paths within styles?
			this.updateStyles();

			// Invalidate the nodes cache because we just changed it.
			this.nodesCache = null;

		}
		this.firstApply = false;

		/*#IFDEV*/
		this.verify();
		/*#ENDIF*/
	}

	/**
	 * Write expressions into a freshly stamped (or pooled path-less) NodeGroup through the
	 * shell's shared stamper paths, allocating no per-instance Path objects.
	 * Child-node expressions must be primitives (one text write each); anything else
	 * falls back to materializing real paths and applying normally.
	 * @param exprs {Expr[]} */
	applyStamp(exprs) {
		let template = this.template;
		let shell = Shell.get(template.html, template.svgMode);

		// 1. Bail to real paths when any child-node expression isn't a primitive.
		let nodesIdx = shell.nodesPathIdx;
		for (let i=0; i<nodesIdx.length; i++) {
			let t = typeof exprs[nodesIdx[i]];
			if (t !== 'string' && t !== 'number') {
				let paths = this.materializePaths(shell);
				for (let i = paths.length - 1; i >= 0; i--)
					paths[i].applySingle(exprs[i]);
				this.nodesCache = null;
				this.firstApply = false;
				return;
			}
		}

		// 2. Resolve target nodes, then write each expression through the shared stampers.
		let slots = this.resolveStampSlots(shell);
		let paths = shell.paths, stampers = shell.stampPaths;
		for (let i = paths.length - 1; i >= 0; i--) {
			let stamper = stampers[i];
			stamper.nodeMarker = slots[paths[i].markerSlot];
			stamper.parentNg = this;
			stamper.applySingle(exprs[i]);
		}

		// 3. Clear per-row state the child-node stampers accumulated, so they're clean for the next row.
		for (let i=0; i<nodesIdx.length; i++) {
			let s = stampers[nodesIdx[i]];
			s.textNode = null;
			s.textValue = null;
			s.nodesCache = null;
		}

		this.nodesCache = null;
		this.firstApply = false;
	}

	/**
	 * In-place rewrite of a stamped (path-less) NodeGroup through the shared stampers,
	 * comparing expressions and writing only the changed ones.  The group stays path-less.
	 * @param template {Template} The new template; the caller assigns it to this.template.
	 * @return {boolean} False when a child-node expression isn't primitive; the caller
	 * must then materialize paths and apply normally. */
	rewriteStamp(template) {
		let shell = Shell.get(template.html, template.svgMode);
		let newExprs = template.exprs;
		let nodesIdx = shell.nodesPathIdx;
		for (let i=0; i<nodesIdx.length; i++) {
			let t = typeof newExprs[nodesIdx[i]];
			if (t !== 'string' && t !== 'number')
				return false;
		}

		let oldExprs = this.template.exprs;
		let paths = shell.paths, stampers = shell.stampPaths;
		let slots = null; // Nodes are resolved only if something actually changed.
		for (let i = paths.length - 1; i >= 0; i--) {
			if (!exprSame(oldExprs[i], newExprs[i])) {
				if (slots === null)
					slots = this.resolveStampSlots(shell);
				let stamper = stampers[i];
				stamper.nodeMarker = slots[paths[i].markerSlot];
				stamper.parentNg = this;
				stamper.applySingle(newExprs[i]);
			}
		}

		if (slots !== null)
			for (let i=0; i<nodesIdx.length; i++) {
				let s = stampers[nodesIdx[i]];
				s.textNode = null;
				s.textValue = null;
				s.nodesCache = null;
			}
		return true;
	}

	/**
	 * Run the shell's resolve program from this NodeGroup's root element.
	 * Only valid for singleRoot shells, whose ops always start with the root's own pair.
	 * @param shell {Shell}
	 * @return {Node[]} The shell's shared scratch slots array. */
	resolveStampSlots(shell) {
		let slots = shell.resolveSlots;
		slots[1] = this.startNode;
		let ops = shell.resolveOps;
		// firstChild/nextSibling pointer walk; see setPathsFromFragment for why not childNodes[i].
		for (let i=2, s=2; i<ops.length; i+=2, s++) {
			let node = slots[ops[i]].firstChild;
			for (let k=ops[i+1]; k>0; k--)
				node = node.nextSibling;
			slots[s] = node;
		}
		return slots;
	}

	/**
	 * Create the real Path objects for a NodeGroup that was created by applyStamp().
	 * Called lazily, the first time the group is rewritten in place.
	 * Recovers the bare-text state of child-node paths that stamped a primitive.
	 * @param shell {?Shell}
	 * @return {Path[]} */
	materializePaths(shell=null) {
		shell ??= Shell.get(this.template.html, this.template.svgMode);
		let slots = this.resolveStampSlots(shell);
		let paths = shell.paths;
		let pathLength = paths.length;
		let result = this.paths = new Array(pathLength);
		for (let i=0; i<pathLength; i++) {
			let p = paths[i];
			let path = p.cloneWithNodes(p.beforeSlot >= 0 ? slots[p.beforeSlot] : null, slots[p.markerSlot]);
			path.parentNg = this;
			result[i] = path;
		}

		// A wholeParent child-node path that stamped a primitive left exactly one Text child.
		for (let idx of shell.nodesPathIdx) {
			let path = result[idx];
			let tn = path.nodeMarker.firstChild;
			if (tn !== null && tn.nodeType === 3 && tn === path.nodeMarker.lastChild) {
				path.textNode = tn;
				path.textValue = tn.nodeValue;
			}
		}
		return result;
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
	 * @param shell {Shell}
	 * @param startingPathDepth {int}
	 * @param isRootClone {boolean} True when fragment is a direct clone of a singleRoot
	 * shell's root element: it fills slot 1 itself and the first op pair is skipped. */
	setPathsFromFragment(fragment, shell, startingPathDepth=0, isRootClone=false) {
		let paths = shell.paths;
		let pathLength = paths.length; // For faster iteration
		let result = this.paths = new Array(pathLength);

		// Fast path: run the shell's precomputed resolve program (see Shell.buildResolveProgram).
		// Each Path.clone() would walk childNodes from the fragment root to its target node,
		// re-traversing the same ancestors for every path.  The program instead resolves each
		// unique node exactly once into the slots array:  ops is flat [parentSlot, childIndex]
		// pairs in dependency order, pair i filling slot i+1, with slot 0 being the fragment.
		// Paths then copy themselves via cloneWithNodes() using their precomputed slot indexes.
		// Only built for component-free shells, since PathToComponent.clone() has special
		// attribPaths behavior; pathOffset!==0 (root grafting) also uses the fallback.
		let ops = shell.resolveOps;
		if (ops && startingPathDepth === 0) {
			let slots = shell.resolveSlots;
			let i = 0, s = 1;
			if (isRootClone) { // Slot 1 is the root element itself; skip its op pair.
				slots[1] = fragment;
				i = 2;
				s = 2;
			}
			else
				slots[0] = fragment;
			// Resolve each node via firstChild/nextSibling pointer walks instead of
			// childNodes[index]; the live NodeList indexing is markedly slower, and indices
			// are small (markers are elements, often the first child after whitespace stripping).
			for (; i<ops.length; i+=2, s++) {
				let node = slots[ops[i]].firstChild;
				for (let k=ops[i+1]; k>0; k--)
					node = node.nextSibling;
				slots[s] = node;
			}
			for (let i=0; i<pathLength; i++) {
				let p = paths[i];
				let path = p.cloneWithNodes(p.beforeSlot >= 0 ? slots[p.beforeSlot] : null, slots[p.markerSlot]);
				path.parentNg = this;
				result[i] = path;
			}
		}
		else
			for (let i=0; i<pathLength; i++) {
				let path = paths[i].clone(fragment, startingPathDepth);
				path.parentNg = this;
				result[i] = path;
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
					let el = Path.resolve(root, path);
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
					let style = Path.resolve(root, path);
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
					let script = Path.resolve(root, path);
					eval(script.textContent);
				}
			}
		}
	}

	//#IFDEV
	getParentNode() {
		return this.startNode?.parentNode
	}

	get debug() {
		return [
			`parentNode: ${this.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent$1(this.getNodes().map(item => {
				if (item?.nodeType) {

					let tree = nodeToArrayTree(item, nextNode => {

						let path = this.paths.find(path=>(path instanceof PathToNodes) && path.getNodes().includes(nextNode));
						if (path)
							return [`Path.nodes:`]

						return [];
					});

					// TODO: How to indend nodes belonging to a path vs those that just occur after the path?
					return flattenAndIndent(tree)
				}
				else if (item instanceof Path)
					return setIndent$1(item.debug, 1)
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

		for (let path of this.paths || []) {
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
}

/**
 * Has these properties not present on NodeGroup, assigned by instantiate():
 * They're not declared as fields because subclass field initializers run after the
 * super constructor and would overwrite the assigned values.
 * @property {HTMLElement} root - Root node at the top of the hierarchy.
 * @property {?object} options - RenderOptions */
class RootNodeGroup extends NodeGroup {

	/**
	 * Special setup for the root: graft the fragment into el (or use it standalone),
	 * handle slot children, then resolve paths and embeds against the root.
	 * Called by the NodeGroup constructor. */
	instantiate(shell, shellFragment, el, options) {
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
				// 1. Globals.currentSlotChildren is set if this is called via PathToComponent.applyComponent() calls render()
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
						if (!this.root.hasAttribute(attrib.name))
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

			this.setPathsFromFragment(this.root, shell, startingPathDepth);
			this.activateEmbeds(this.root, shell, startingPathDepth);
		}
		this.startNode = this.endNode = this.root;

		Globals$1.rootNodeGroups.set(this.root, this);
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
		&& tagName.includes('-')
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === tagName;
}

let lastObjectId = 1;
let objectIds = new WeakMap();

/**
 * Get a short string id unique to the given object, for use as a map key.
 * @param obj {Object}
 * @returns {string} */
function getObjectId(obj) {
	let result = objectIds.get(obj);
	if (result === undefined) {
		result = '~@' + (lastObjectId++); // Unique 2-byte prefix so it can't collide with html-string keys.
		objectIds.set(obj, result);
	}
	return result;
}

/**
 * The html strings and evaluated expressions from an html tagged template.
 * A unique Template is created for each item in a loop.
 * Although the reference to the html strings is shared among templates. */
class Template {

	/** @type {Expr[]} Evaulated expressions.  Assigned by the constructor. */
	'exprs' = undefined;

	/** @type {string[]} Assigned by the constructor. */
	'html' = undefined;

	closeKey;

	isText;

	/** @type {boolean} True if created by the svg`` tag; the Shell parses the html in the SVG namespace. */
	svgMode = false;

	/**
	 *
	 * @param htmlStrings {string[]}
	 * @param exprs {*[]} */
	constructor(htmlStrings=[''], exprs=[]) {
		this.html = htmlStrings;

		this.exprs = exprs;

		//this.trace = new Error().stack.split(/\n/g)

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
	 * Render the main (root) template.
	 * @param el {?HTMLElement} Null if we're rendering to a standalone element.
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} */
	'render'(el=null, options={}) {



		let ng = el && Globals$1.rootNodeGroups.get(el);
		if (!ng) {
			ng = new RootNodeGroup(this, null, el, options);
			if (!el) // null if it's a standalone elment.
				el = ng.getRootNode();
			Globals$1.rootNodeGroups.set(el, ng); // All tests still pass if this is commented out!
		}

		// Make sure the expresion count matches match the Path "hole" count.
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
		else
			ng.applyExprs(this.exprs);

		return el;
	}

	getCloseKey() {
		if (this.closeKey===undefined) {
			if (this.exprs.length)
				this.closeKey = getObjectId(this.html);
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
 * Do two templates produce identical content?
 * Compares expression values by identity, so no hashing or stringification is needed.
 * @param a {Template}
 * @param b {Template}
 * @return {boolean} */
function templatesSame(a, b) {
	if (a.html === b.html && a.svgMode === b.svgMode) {
		let ae = a.exprs, be = b.exprs;
		for (let i=0; i<ae.length; i++)
			if (!exprSame(ae[i], be[i]))
				return false;
		return true;
	}

	// Text and other single-string templates get a new html array each time, so compare by content.
	if (a.isText === b.isText && !a.exprs.length && !b.exprs.length
		&& a.html.length === 1 && b.html.length === 1 && a.svgMode === b.svgMode)
		return a.html[0] === b.html[0];

	return false;
}

/**
 * Get a string that changes when any value inside obj changes, including deep mutations.
 * Used by PathToComponent to compute the `changed` argument to component render() calls.
 * Functions, Nodes, and repeated/circular objects are represented by identity ids.
 * @param obj {*}
 * @returns {string} */
function getObjectHash(obj) {
	const seen = new Set();
	return JSON.stringify(obj, (key, value) => {
		if (typeof value === 'function')
			return getObjectId(value);
		if (typeof value === 'object' && value !== null) {
			if (value instanceof Node)
				return getObjectId(value);
			if (seen.has(value))
				return getObjectId(value);
			seen.add(value);
			if (value instanceof Template)
				return {html: getObjectId(value.html), exprs: value.exprs}; // Don't hash long html strings.
		}
		return value;
	});
}

/**
 * @return {boolean} */
function exprSame(a, b) {
	if (a === b)
		return true;
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length)
			return false;
		for (let i=0; i<a.length; i++)
			if (!exprSame(a[i], b[i]))
				return false;
		return true;
	}
	if (a instanceof Template && b instanceof Template)
		return templatesSame(a, b);
	return false;
}


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
 * @property {boolean=} scripts - Execute script tags.  Requires a CSP that allows unsafe-eval.
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
 * 1. toEl('Hello');                      // Create single text node.
 * 2. toEl('<b>Hello</b>');               // Create single HTMLElement
 * 3. toEl('<b>Hello</b><u>Goodbye</u>'); // Create document fragment because there's more than one node.
 * 4. toEl(template)                      // Render Template created by h`<html>` or h();
 * 5. toEl({render(){...}})               // Pass an object with a render method, and optionally other props/methods.
 * @param arg {string|Template|{render:()=>void}}
 * @returns {Node|DocumentFragment|HTMLElement} */
function toEl(arg) {

	if (typeof arg === 'string') {

		// We create a new one each time because otherwise
		// the returned fragment will have its content replaced by a subsequent call.
		let templateEl = Globals$1.doc.createElement('template');
		templateEl.innerHTML = arg;

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
/**
 * Like h`...` but the fragment is parsed in the SVG namespace.
 * Required for nested SVG fragments, since they're parsed standalone without an <svg> ancestor:
 * h`<svg>${svg`<circle r="1"/>`}</svg>`
 * @param htmlStrings {string[]}
 * @param exprs {*[]}
 * @return {Template} */
function svg(htmlStrings, ...exprs) {
	let template = new Template(htmlStrings, exprs);
	template.svgMode = true;
	return template;
}

const renderTemplateKey = Symbol('solariteRender');

// Unique default that detects h() called with no arguments.
// Using `arguments` alongside rest params would force the engine to materialize both per call.
const noArg = Symbol();

function h(htmlStrings=noArg, ...exprs) {

	// 1. Tagged template: h`<div>...</div>`
	if (Array.isArray(htmlStrings)) {
		return new Template(htmlStrings, exprs);
	}

	// 2. String to template, or JSX factory form h(tag, props, ...children)
	else if (typeof htmlStrings === 'string' || htmlStrings instanceof String) {
		let tagOrHtml = htmlStrings;

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
			if (/^\s+</.test(html))
				html = html.trim();
			return new Template([html], []);
		}
	}

	else if (htmlStrings instanceof HTMLElement || htmlStrings instanceof DocumentFragment) {

		// 3. Render template to element: h(el, template)
		if (exprs[0] instanceof Template) {

			/** @type Template */
			let template = exprs[0];
			let parent = htmlStrings;
			let options = exprs[1];
			template.render(parent, options);
		}

		// 4. Render tagged template to element: h(el)`<div>...</div>`
		else {
			let parent = htmlStrings, options = exprs[0];

			// The closure is cached on the element so repeated renders don't recreate it.
			if (options === undefined) {
				let cached = parent[renderTemplateKey];
				if (cached)
					return cached;
			}

			// Return a tagged template function that applies the tagged template to parent.
			let renderTemplate = (htmlStrings, ...exprs) => {
				// Remove shadowroot if present.  TODO: This could mess up paths?
				if (parent.shadowRoot)
					parent.innerHTML = '';

				Globals$1.rendered.add(parent);
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			};
			if (options === undefined)
				parent[renderTemplateKey] = renderTemplate;
			return renderTemplate;
		}
	}

	// 5. Create a static element: h()`<div></div>`
	else if (htmlStrings === noArg) {
		return (htmlStrings, ...exprs) => {
			let template = h(htmlStrings, ...exprs);
			return toEl(template);
		}
	}

	// 6. Help toEl() with objects: h(this)`<div>...</div>` inside an object's render()
	// Intercepts the main h(this)`...` function call inside render().
	// TODO: This path doesn't handle embeds like data-id="..."
	else if (typeof htmlStrings === 'object' && Globals$1.objToEl.has(htmlStrings)) {
		let obj = htmlStrings;

		if (obj.constructor.name !== 'Object')
			throw new Error(`Solarate Web Component class ${obj.constructor?.name} must extend HTMLElement.`);

		// Jsx with h(this, <jsx>)
		if (exprs[0] instanceof Template) {
			let template = exprs[0];
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
	// TODO: Handle other primitive types?
	else if (Util.isFalsy(htmlStrings))
		return new Template();

	else
		throw new Error('h() does not support argument of type: ' + (htmlStrings ? typeof htmlStrings : htmlStrings))
}

// Memo entries live directly on the keyed object as a symbol property, which is much
// faster than a WeakMap and invisible to JSON, for...in, and Object.keys.
const memoKey = Symbol('solariteMemo');

/**
 * Memoize a Template by object identity, like Vue's v-memo or Lit's guard().
 *
 * When deps (a primitive or shallow array) is unchanged from the previous render,
 * the SAME Template instance is returned.  The list diff recognizes the instance and
 * skips both rebuilding and comparing that item's expressions, so re-rendering a long
 * list where few items changed costs almost nothing per unchanged item.
 *
 * The same obj must not appear twice in one list.
 *
 * ${this.rows.map(row => h.memo(row, [row.label, row.id === this.selectedId], r =>
 *     h`<tr class=${r.id === this.selectedId ? 'danger' : ''}><td>${r.label}</td></tr>`))}
 *
 * @param obj {Object} Cache key, usually the loop item.
 * @param deps {*|Array} Values the template depends on; compared === (shallow for arrays).
 * @param fn {function(obj:Object):Template} Called only when deps changed.
 * @return {Template} */
h.memo = (obj, deps, fn) => {
	let entry = obj[memoKey];
	if (entry !== undefined && depsSame(entry.deps, deps))
		return entry.template;

	let template = fn(obj);
	if (entry !== undefined) {
		entry.deps = deps;
		entry.template = template;
	}
	else if (Object.isExtensible(obj))
		obj[memoKey] = {deps, template};
	// Frozen/sealed objects simply aren't cached.
	return template;
};

function depsSame(a, b) {
	if (a === b)
		return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length)
			return false;
		for (let i=0; i<a.length; i++)
			if (a[i] !== b[i])
				return false;
		return true;
	}
	return false;
}

/**
 * @deprecated Inherit from Solarite and pass arribs to super() instead.
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
			if (typeof val === 'string' && val.length)
				try {
					return JSON.parse(val);
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
 * @deprecated for Solarite.getAttribs()
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
 * @deprecated
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
	Json: 'Json'
};

/*
┏┓  ┓    •
┗┓┏┓┃┏┓┏┓┓╋▗▖
┗┛┗┛┗┗┻╹ ╹╹┗
JavasCript UI library
@license MIT
@copyright Vorticode LLC
https://vorticode.github.io/solarite/ */
function t(html) {
	return new Template([html], []);
}

/**
 * Intercept the construct call to auto-define the class before the constructor is called. */
let HTMLElementAutoDefine = new Proxy(HTMLElement, {
	construct(Parent, args, Class) {

		// 1. Call customElements.define() automatically.
		Util.defineClass(Class);

		// 2. This line is equivalent the to super() call to HTMLElement:
		return Reflect.construct(Parent, args, Class);
	}
});

/**
 * Solarite provides more features if your web component extends Solarite instead of HTMLElement.
 *
 * Reasons to inherit from Solarite instead of HTMLElement.
 * 1.  customElements.define() is called automatically when you create the first instance.
 * 2.  Calls render() when added to the DOM, if it hasn't been called already.
 * 3.  Populates the attribs argument to the constructor when instantiated from regular html outside a template string.
 *         It parses JSON from DOM attribute values surrouned with '${...}'
 * 4.  Shows an error if render() isn't defined.
 *
 * Advantages to inheriting from HTMLElement
 * 1.  We can inherit from things like HTMLTableRowElement directly.
 * 2.  There's less magic, since everyone is familiar with defining custom elements.
 * 3.  No confusion about how the class name becomes a tag name.
 * @extends {HTMLElement} */
class Solarite extends HTMLElementAutoDefine {

	/**
	 * @param attribs {?Record<string, any>} */
	constructor(attribs=null) {
		super();

		if (attribs) {
			if (typeof attribs !== 'object')
				throw new Error('First argument to custom element constructor must be an object.');

			// 1. Populate attribs if it's an empty object.
			if (attribs && !Object.keys(attribs).length) {
				let attribs2 =  Solarite.getAttribs(this);
				for (let name in attribs2) {
					attribs[name] = attribs2[name];
				}
			}

			// 2. Populate fields from attribs.
			// This does nothing because the fields are overwritten by the child class after this super() constructor executes.
			//for (let name in attribs || {}) {
			//	if (name in this) {
			//		const descriptor = Object.getOwnPropertyDescriptor(this, name);
			//		if (!descriptor || descriptor.writable || descriptor.set)
			//			this[name] = attribs[name];
			//	}
			//}
		}

		// 3. Wrap render function so it always provides the attribs argument.
		// Disabled because this gives us strings for attribute values when we call render manually.
		// Instead of values given from ${...} expressions.
		// let originalRender = this.render;
		// this.render = (attribs, changed=true) => {
		// 	if (!attribs) // If we have to look up the attribs, we don't know if they changed or not.
		// 		attribs = Solarite.getAttribs(this);
		// 	originalRender.call(this, attribs, changed);
		// }
	}

	'render'() {
		throw new Error('render() is not defined for ' + this.constructor.name);
	}

	/**
	 * Call render() only if it hasn't already been called.	 */
	'renderFirstTime'() {
		if (!Globals$1.rendered.has(this)) {
			let attribs = Solarite.getAttribs(this);
			this.render(attribs); // calls Globals.rendered.add(this); inside the call to h()'...'.
		}
	}

	/**
	 * Called automatically by the browser. */
	'connectedCallback'() { // quoted so terser doesn't remove it.
		this.renderFirstTime();
	}

	static 'define'(tagName=null) {
		Util.defineClass(this, tagName);
	}

	static 'getAttribs'(el) {
		let result = Util.attribsToObject(el);
		for (let name in result) {
			let val = result[name];

			// We don't do eval because that seems too dangerous.
			if (val.startsWith('${') && val.endsWith('}'))
				result[name] = JSON.parse(val.slice(2, -1));
		}
		return result;
	}


	// TODO: Do we want to use this to get the tag name from the render() function, instead of having the user define it?
	/**
	 * Get the tag name for a class, as defined by the tag used in render().
	 *
	 * This will parse the JavaScript code of the render() function to find the tag name.
	 * It will itarage every character, keeping track of quotes and comments so it can
	 * skip them until it finds the tag name passed to h(this)`<tagname>` inside the render() function.
	 *
	 * */
	/*
	static getTagName(Class) {
		let code = Class.prototype.render.toString();
		let i = 0;
		while (i < code.length) {
			let char = code[i];
			let next = code[i + 1];

			// Skip single line comments
			if (char === '/' && next === '/') {
				i = code.indexOf('\n', i);
				if (i === -1) break;
				continue;
			}
			// Skip multi-line comments
			if (char === '/' && next === '*') {
				i = code.indexOf('*'+'/', i + 2);
				if (i === -1) break;
				i += 2;
				continue;
			}
			// Skip strings and template literals
			if (char === "'" || char === '"' || char === '`') {
				let quote = char;
				i++;
				while (i < code.length) {
					if (code[i] === '\\') i += 2;
					else if (code[i] === quote) { i++; break; }
					else i++;
				}
				continue;
			}
			// Skip regex literals (simple heuristic)
			if (char === '/') {
				let prev = code.slice(Math.max(0, i - 10), i).trim();
				// If / is preceded by something that indicates an operator or start of expression
				if (/[=(,;:[!&|?]$|return$|yield$|case$/.test(prev)) {
					i++;
					while (i < code.length) {
						if (code[i] === '\\') i += 2;
						else if (code[i] === '[') { // Skip character classes
							i++;
							while (i < code.length && code[i] !== ']') {
								if (code[i] === '\\') i += 2;
								else i++;
							}
							i++;
						}
						else if (code[i] === '/') { i++; break; }
						else i++;
					}
					continue;
				}
			}
			// Check for h(this)`
			if (char === 'h' && code.slice(i, i + 8) === 'h(this)`') {
				i += 8;
				// We are now inside the template literal.
				// Skip whitespace and HTML comments
				while (i < code.length) {
					// Skip JS template literal end (shouldn't happen before tag, but for safety)
					if (code[i] === '`') return null;

					// Skip whitespace
					if (/\s/.test(code[i])) { i++; continue; }

					// Skip HTML comments <!-- ... -->
					if (code.slice(i, i + 4) === '<!--') {
						i = code.indexOf('-->', i + 4);
						if (i === -1) return null;
						i += 3;
						continue;
					}

					// Find the first tag
					if (code[i] === '<') {
						let start = ++i;
						while (i < code.length && /[a-zA-Z0-9-]/.test(code[i])) i++;
						return code.slice(start, i);
					}

					// If we encounter anything else (like text before a tag),
					// we can keep looking or return null depending on how strict we want to be.
					// For now, let's just skip non-tag characters.
					i++;
				}
			}
			i++;
		}
		return null;
	}
	*/
}


/**
 * Assign fields from `src` to `dest` if they exist in `dest`.
 *
 * `cast` is an optional record where the key is the field name.
 * - Ignore fields: Use `false` as the value.
 * - Basic Casting: Use `'int'`, `'float'`, `'number'`, `'boolean'`, `'string'`.
 * - Class Casting: Pass a class constructor or its string name to instantiate the field.
 * - Array Casting: Use `[Class]` or `'Class[]'`. The source must be an array.
 *
 * If `cast` is omitted and the source is a string, it is automatically cast to boolean,
 * number, or Date if the destination field already contains a value of that type.
 * @param {object} dest
 * @param {?object} src
 * @param {Record<string, string|Function|boolean>} [cast={}] */
function assignFields(dest, src, cast={}) {
	for (let name in src || {}) {
		let castVal = name in cast
			? cast[name]
			: typeof dest[name];

		// Ignore fields
		if (castVal === false || !(name in dest))
			continue;

		// Skip properties that are not writable and don't have a setter
		const desc = Object.getOwnPropertyDescriptor(dest, name)
			|| Object.getOwnPropertyDescriptor(Object.getPrototypeOf(dest), name);
		if (desc && !desc.writable && !desc.set)
			continue;

		// Array Casting: [Class] or 'Class[]'
		let arrayCast = castVal && (Array.isArray(castVal) && castVal.length === 1
			? castVal[0]
			: (typeof castVal === 'string' && castVal.endsWith('[]')
				? castVal.slice(0, -2)
				: null
			));

		const getConstructor = (c) =>
			typeof c === 'function' ? c : (window[c] || customElements.get(c));

		let srcVal = src[name];
		if (arrayCast) {
			if (!Array.isArray(srcVal))
				throw new Error(`Field ${name} must be an array.`);
			let constructor = getConstructor(arrayCast);
			dest[name] = srcVal.map(v => (constructor && !(v instanceof constructor)) ? new constructor(v) : v);
			continue;
		}

		// Basic Type Casting
		if (castVal === 'int')
			srcVal = parseInt(srcVal);
		else if (castVal === 'float' || castVal === 'number')
			srcVal = Number(srcVal);
		else if (castVal === 'boolean')
			srcVal = ![false, 'false', 0, '0'].includes(srcVal);
		else if (castVal === 'string')
			srcVal = String(srcVal);

		// Class or Date Casting
		else if (srcVal != null) {
			let constructor = getConstructor(castVal);
			if (constructor && !(srcVal instanceof constructor))
				srcVal = new constructor(srcVal);
			else if (dest[name] instanceof Date && !(srcVal instanceof Date))
				srcVal = new Date(srcVal);
		}

		dest[name] = srcVal;
	}
}

export default h;
export { ArgType, Globals$1 as Globals, HtmlParser, NodeGroup, Shell, Solarite, Util as SolariteUtil, Template, assignFields, delve, getArg, h, h as r, setArgs, svg, t, toEl };
