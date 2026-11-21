/*@__NO_SIDE_EFFECTS__*/
function assert(val) {
	
}

let Globals = {

	/**
	 * Store which instances of Solarite have already been added to the DOM.
	 * @type {WeakSet<HTMLElement>} */
	connected: new WeakSet(),

	/**
	 * A hand-off in flight from PathToComponent.applyAll(), which parks the child nodes
	 * declared inside a component's tag here just before constructing it, to that
	 * component's RootNodeGroup.instantiate(), which puts them in its <slot>.  Null when
	 * no hand-off is pending.
	 *
	 * It is addressed by Constructor rather than by tag name because a customized
	 * built-in has no usable tag at the moment it is consumed:  a <tr is="my-row">
	 * reports a tagName of TR, and its 'is' attribute is not written until after the
	 * constructor -- which may already have rendered -- has returned.
	 *
	 * It also carries the paths of the template the component is declared in, for an element
	 * inside the component that is given the component's <slot>; see PathToComponent step 2f.
	 * And the placeholder, whose attributes are the parent's; see RootNodeGroup.instantiate().
	 *
	 * @type {?{Constructor:Function, nodes:Node[], paths:Path[], el:HTMLElement}} */
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
	 * Get the RootNodeGroup for an element.  An element whose template was taken out so
	 * that another can be rendered into it keeps its entry, holding null, until the new
	 * root is in place; see RootNodeGroup.unrender().
	 * @type {WeakMap<HTMLElement, ?RootNodeGroup>} */
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
	 * Components with a pending queueRender(), mapped to their pending Promise.
	 * Kept as a Map so Template.render() can check `.size` before doing a lookup.
	 * @type {Map<HTMLElement, Promise<void>>} */
	queuedRenders: new Map(),

	/**
	 * Map from array of Html strings to the Shells created from them, one per parse mode:
	 * [parsed as html, parsed as svg].
	 * @type {WeakMap<string[], Shell[]>} */
	shells: new WeakMap()
};

// Warn when a second copy of Solarite loads into the same page.  Each copy has its own classes and its own Globals,
// so a template or component made by one is not recognised by the other, and the failure that follows (a template
// rendered as "[object Object]", a slot that stays empty) gives no hint of the cause.  The usual ways to get two are
// importing both Solarite.js and Solarite.min.js, or a JSX runtime file that doesn't match the build being imported.
// The marker is the same for every build, so the source, debug, and minified builds all detect one another.
let copy = Symbol.for('solarite');
if (globalThis[copy])
	console.warn(`Solarite loaded twice: ${globalThis[copy]} and ${import.meta.url}.  Templates and components from one won't work in the other.`);
else
	globalThis[copy] = import.meta.url;

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
 *
 * The rest is tested by a loop that stops at the first element that is not a string or a number,
 * so [obj, null] is not a path.  A parent passes every array it gives a child component through
 * here on every render, an array of 10,000 row objects included, and the loop looks at its second
 * element and stops, where a slice() would copy the whole array first.
 * @param arr {Array|*}
 * @returns {boolean} */
function isDelvePath(arr) {
	// An array of at least two elements, whose first is an object, null, or undefined.
	if (!Array.isArray(arr) || arr.length < 2 || (typeof arr[0] !== 'object' && arr[0] !== undefined))
		return false;

	// Then only numbers and strings.
	for (let i = 1; i < arr.length; i++)
		if (typeof arr[i] !== 'string' && typeof arr[i] !== 'number')
			return false;
	return true;
}

// d means "don't create"
let d = {};

/**
 * Prefix that asks for a handler to bypass event delegation: `<button native:onclick=\${...}>`
 * is bound with addEventListener at render time, taking its normal place in the browser's own
 * dispatch order.  Shared by Util.isEvent() and PathToEvent, which strips it. */
let nativeEventPrefix = 'native:';

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
	 * @param [ignore] {string} Optionally ignore this attribute.
	 * @return {Object} */
	attribsToObject(el, ignore) {
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
			// This can only fail on a mistake in the component's own template, so a developer meets it
			// the first time the component renders and never again at runtime.  It nonetheless SHIPS,
			// and deliberately: debug-strip blocks are removed from dist/Solarite.js, which is what
			// npm serves, so hiding it there would delete it for everyone, not only for production.
			if (!id.includes('.')) {
				let existing = root[id];
				let isInherited = (id in root) && !Object.hasOwn(root, id);
				if (!existing?.nodeType && (existing != null || isInherited))
					throw new Error(`Solarite: id="${id}" would overwrite an existing ${root.constructor.name} property.`);
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

		// A global style is scoped by tag name alone, so it needs no attribute in the selector.
		let attribSelector = '';

		if (style.hasAttribute('global') || style.hasAttribute('data-global')) {
			let head = Globals.doc.head;
			if (head.querySelector(`style[data-style="${tagName}"]`))
				// TODO: Make sure the style has no expressions.
				style.remove(); // already in the head.
			else {
				head.append(style);
				style.setAttribute('data-style', tagName);
			}
		}
		else {
			let styleId = root.getAttribute('data-style');
			if (!styleId) {
				// Keep track of one style id for each class.  Reading the static walks up to a parent
				// class's counter if this class has never been styled, but the assignment always lands
				// on this class, so each class then counts on from where its parent left off.
				// TODO: Put this outside the class in a map, so it doesn't conflict with static properties.
				let Class = root.constructor;
				root.setAttribute('data-style', styleId = Class.styleId = (Class.styleId || 0) + 1);
			}

			attribSelector = `[data-style="${styleId}"]`;
		}

		// Replace ":host" with "tagName[data-style=...]" in the css.
		for (let child of style.childNodes) {
			if (child.nodeType === 3) {
				let oldText = child.textContent;

				// One pass rewrites both forms of the selector:
				// 1.  The functional form ':host(X)' — the host element when it also matches X — unwraps
				//     so X sits right after the scoped name:  tag[data-style="1"]X.  X may hold one
				//     nested group like ':not(.open)'; deeper parentheses can't be paired by a regex,
				//     so such an X is left as written rather than half-rewritten into a selector the
				//     browser would discard silently.
				// 2.  Plain ':host'.  The lookahead turns down longer names (':host-context') and '(',
				//     which only follows ':host' when alternative 1 already gave up on it, and accepts
				//     the end of the text node, where an expression may have split a dynamic style.
				let newText = oldText.replace(
					/:host(?:\(((?:[^()]|\([^()]*\))*)\)|(?![-a-z0-9_(]))/gi,
					`${tagName}${attribSelector}$1`);
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
		// One pass finds all three dash positions.  Each alternative matches only the character
		// *before* the boundary and uses a lookahead for what follows, so the following character
		// is never consumed and can still start the next boundary.  That's what lets the three
		// rules interleave in a single scan the way three sequential replaces used to:
		// 1.  a lowercase letter or digit before a capital ('ProperName').
		// 2.  a capital before a capital+lowercase pair, i.e. the last capital of a run ('HTMLElement').
		// 3.  a letter before a digit ('A100').
		// '$&-' appends the dash after the matched character, then everything folds to lowercase.
		return str.replace(/[a-z0-9](?=[A-Z])|[A-Z](?=[A-Z][a-z])|[a-zA-Z](?=\d)/g, '$&-').toLowerCase();
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
	 * Register Class as a custom element, unless it's registered already.
	 * @param Class {typeof HTMLElement}
	 * @param tagName {?string} Name to register under.  Defaults to the dashed form of the class name.
	 * @return {string} The tag name Class is registered under, whether we just registered it or it
	 *     was already in the registry under some other name.  Callers that emit markup for the class
	 *     use this instead of re-deriving the name, which guesses wrong for any class registered
	 *     under a name that isn't camelToDashes(Class.name). */
	defineClass(Class, tagName) {
		// getName is written in quotes so that the minifier keeps the name.  It renames every
		// property it does not know to be the browser's, and its list of browser names is older
		// than getName().  define() is on that list.  Dist.customElementsNotMangled checks both.
		let defined = customElements['getName'](Class);
		if (defined) // Previously defined.
			return defined;

		tagName = tagName || Util.camelToDashes(Class.name);
		if (!tagName.includes('-')) // Browsers require that web components always have a dash in the name.
			tagName += '-element';
		customElements.define(tagName, Class);
		return tagName;
	},

	/**
	 * Get the value of an input as the most appropriate JavaScript type.
	 * @param node {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLElement}
	 * @return {string|string[]|number|[]|File[]|Date|boolean} */
	getInputValue(node) {
		let type = node.type; // A built-in DOM property.
		if (type === 'checkbox')
			return node.checked; // Boolean
		if (type === 'radio')
			return node.value; // String value of the selected radio in the group
		if (type === 'file')
			return [...node.files]; // FileList
		if (type === 'number' || type === 'range')
			return node.valueAsNumber; // Number
		if (type === 'date' || type === 'time' || type === 'datetime-local')
			return node.valueAsDate; // Date Object
		if (type === 'select-multiple') // <select multiple>
			return [...node.selectedOptions].map(option => option.value); // Array of Strings
		if (node.hasAttribute('contenteditable'))
			return node.innerHTML;

		return node.value; // String
	},

	/**
	 * True for an attribute name that binds an event: `onclick`, or `native:onclick` for a
	 * handler that is registered with addEventListener when the template renders instead of
	 * being delegated.  Only names an element really exposes as on* handlers count, so an
	 * attribute like `online` is never mistaken for one.
	 *
	 * A few events have no such property to ask about and are named here instead: no browser
	 * gives elements `onfocusin` or `onfocusout`, and the touch properties exist only on a
	 * machine with a touch screen, so a template would otherwise mean one thing on a phone
	 * and another on a desktop. */
	isEvent(attribName) {
		if (attribName.startsWith(nativeEventPrefix))
			attribName = attribName.slice(nativeEventPrefix.length);
		return attribName.startsWith('on') && (attribName in Globals.div
			|| /^on(focus(in|out)|touch(start|move|end|cancel))$/.test(attribName));
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
			while (proto && !/^HTML.*Element$/.test(proto.constructor.name))
				proto = Object.getPrototypeOf(proto);
			result = !!proto && !!Object.getOwnPropertyDescriptor(proto, prop)?.set;

			// The built-in classes between that one and HTMLElement are asked too, which is how a
			// <video> or an <audio> finds the muted and volume it inherits from HTMLMediaElement.
			// From those only a property holding a boolean or a number counts, state the element
			// keeps in itself.  One holding text reflects an attribute, which is where it is written:
			// src as a property reads back as the absolute address, so a relative one would differ on
			// every render and be written again, which reloads a video.  HTMLElement itself is left
			// out, unless it is the first one found, as for a web component: its title, hidden and
			// lang are attributes too, and taking them for properties would mark every list row that
			// binds one as needing a visit on every render.
			while (!result && proto && /^HTML.+Element$/.test((proto = Object.getPrototypeOf(proto)).constructor.name))
				result = !!Object.getOwnPropertyDescriptor(proto, prop)?.set && (typeof el[prop] === 'boolean' || typeof el[prop] === 'number');
			Globals.htmlProps[key] = result;
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

		// One scan collects every name and its value.  The value is optional so a boolean attribute
		// written on its own ('disabled') still lands in the result with an empty value, and the three
		// value alternatives capture *inside* the quotes so no separate quote-trimming pass is needed.
		// A name is everything up to a space, a quote, '>', '/' or '=', which is what the browser's
		// parser takes for one but for the quotes, so that names such as xlink:href, x-on:click and
		// @click arrive whole.
		// This must stay a loop that reads each match.  Written as a String.replace() whose callback
		// filled result, the minifier deleted the whole call: it takes replace() on a string to have
		// no side effects, and nothing used what it returned.
		let regex = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g, m;
		while (m = regex.exec(str))
			result[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';

		return result;
	},

	/*
	isPrimitive(val) {
		return typeof val === 'string' || typeof val === 'number'
	},*/

	/**
	 * If val is a function, evaluate it recursively until the result is not a function.
	 * If it's an array, an object or null, the result is an empty string.
	 * If it's a Date, format it as Y-m-d H:i:s
	 * @param val
	 * @returns {string|number|boolean} */
	makePrimitive(val) {
		if (typeof val === 'function')
			return Util.makePrimitive(val());
		else if (val instanceof Date)
			return val.toISOString().replace(/T/, ' ');
		else if (typeof val === 'object') // An array is an object too, and so is null.
			return '';
		return val;
	},

	saveOrphans(nodes) {
		let fragment = Globals.doc.createDocumentFragment();
		fragment.append(...nodes);
	},

	/**
	 * Remove nodes from the beginning and end that are not:
	 * 1.  Elements.
	 * 2.  Non-whitespace text nodes.
	 * @param nodes {Node[]|NodeList}
	 * @returns {Node[]} */
	trimEmptyNodes(nodes) {
		// nodeType 1 is an element and 3 is a text node; the literals are what Node.ELEMENT_NODE
		// and Node.TEXT_NODE are defined as, and they cost a fraction of the bytes.
		let isEmpty = node => node.nodeType !== 1 && (node.nodeType !== 3 || !node.textContent.trim());

		let result = [...nodes]; // A NodeList can't shift() or pop().
		while (result.length && isEmpty(result[0]))
			result.shift();
		while (result.length && isEmpty(result[result.length - 1]))
			result.pop();

		return result;
	}
};



// For debugging only


/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup. */
class Path {

	// Used for attributes:

	/**
	 * @type {Node} Node that occurs before this Path's first Node.
	 * This is necessary because placeNodes() can steal nodes from another Path.
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

	/** @type {boolean|undefined} True when this path provides an attribute of a web component
	 * (a -solarite-placeholder element).  Only attribute paths ever set it true, but it's
	 * declared here on every Path because clone() and cloneWithNodes() copy it to every clone;
	 * declaring it keeps those stores from transitioning the clone's hidden class. */
	isComponentAttrib;

	/** @type {boolean} True when re-applying an expression identical to the one already
	 * applied is provably a no-op, so a re-render can skip this path entirely.  Only event
	 * bindings qualify: binding the same handler to the same node again changes nothing,
	 * while an attribute or a child expression may have been altered outside the template. */
	skipIfSame = false;

	/** @type {boolean|undefined} True when the attribute is a live HTML property
	 * (checked/value/selected — Util.isHtmlProp), which users can flip underneath the
	 * template.  Declared here for the same hidden-class reason as isComponentAttrib. */
	isHtmlProperty;

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
	applyAll(exprs) {
		
		this.applySingle(exprs[0]);
	}

	/**
	 * Fast path used by NodeGroup.applyExprs() when every path consumes exactly one expression.
	 * Avoids allocating per-path expression arrays.
	 * @param expr {Expr} */
	applySingle(expr) {}

	getExpressionCount() { return 1 }

	/**
	 * The value a path hands to a component constructor, for the single-expression paths.
	 * PathToAttribValue overrides this to join its surrounding static strings.
	 * @param exprs {Expr[]}
	 * @return {Expr} */
	getValue(exprs) { return exprs[0] }


	/**
	 * Copy this path, pointing it at already-resolved nodes.
	 * Used by the Shell resolve-program fast path in NodeGroup.setPathsFromFragment().
	 * @param nodeBefore {?Node}
	 * @param nodeMarker {Node}
	 * @return {Path} */
	cloneWithNodes(nodeBefore, nodeMarker) {
		let result = new this.constructor(nodeBefore, nodeMarker, this.attribName, this.attrValue);
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
		

		// Resolve node paths.  nodeBefore is always a sibling of nodeMarker (Shell builds it from
		// nodeMarker.previousSibling, or inserts a comment immediately before it), so the list
		// nodeBeforeIndex counts within is the marker's own parent's childNodes.  An empty path
		// leaves the marker as newRoot itself, and then that list is newRoot's children.
		let nodeBefore;
		let nodeMarker = Path.resolve(newRoot, this.nodeMarkerPath, pathOffset);
		if (this.nodeBefore) {
			let childNodes = (nodeMarker === newRoot ? newRoot : nodeMarker.parentNode).childNodes;
			
			nodeBefore = childNodes[this.nodeBeforeIndex];
		}

		let result = this.cloneWithNodes(nodeBefore, nodeMarker);

		

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
	 * @param skip {int} How many of the outermost steps to leave off, for when root is
	 *   already that many levels down from where the path was recorded.  An empty walk
	 *   (skip === path.length) returns root itself.
	 * @returns {Node|HTMLElement|HTMLStyleElement} */
	static resolve(root, path, skip=0) {
		for (let i=path.length-1-skip; i>=0; i--) {
			
			root = root.childNodes[path[i]];
		}
		return root;
	}

	
}

/**
 * A key-scoped selection that updates only the rows it actually affects.
 *
 * Rendering a list normally means calling render() and letting the reconciler decide what
 * changed.  That is the right default, but it is a poor fit for a selection: moving a
 * highlight from one row of a thousand to another changes two attributes, and asking the
 * reconciler about it means walking the whole list to discover that fact.
 *
 * A Selector short-circuits that.  when() hands each row one of exactly two objects — the
 * selected one or the unselected one — and set() reaches the two rows that change through
 * the list they were rendered into, writing their attributes directly with no render() call.
 *
 * This is the same primitive as Solid's createSelector, adapted to a library that has no
 * signals: the list, not a subscription, is what carries the binding.
 *
 * Because set() locates a row by its key, **the rows must be keyed** — the row template needs
 * a key=${...} attribute.  set() throws on an unkeyed list rather than silently doing nothing.
 */

/**
 * The value an attribute is bound to.  There are only ever **two** of these per Selector,
 * both built in its constructor: one standing for "this row is the selected one" and one for
 * "this row is not".  when() returns whichever of the two the row's key calls for.
 *
 * Two singletons rather than one object per key is what makes a selector free to create.  A
 * row of a freshly-drawn list with nothing selected gets the unselected singleton, whose
 * value is the off value, so there is no allocation, no map entry and no DOM call — only the
 * two stores that record where the list lives.  It also sharpens the re-render skip: a row's
 * expression changes identity exactly when its selectedness changes, so
 * NodeGroup.rewriteStamp() rewrites the rows that gained or lost the selection and no others.
 */
class SelectorRef {

	/** @type {Selector} */
	selector;

	/** @type {boolean} True on the singleton that stands for the selected row. */
	selected;

	constructor(selector, selected) {
		this.selector = selector;
		this.selected = selected;
	}

	/** @return {*} The value this ref currently stands for. */
	value() {
		let s = this.selector;
		return this.selected ? s.onValue : s.offValue;
	}

	/**
	 * Write this ref's value to an element's attribute, and tell the selector where the list
	 * is so that a later set() can find any row in it.
	 *
	 * Called by PathToAttribValue when the ref appears as an attribute expression.  It runs
	 * once per row per render, so it is deliberately nothing but two stores and a write that
	 * the common case skips.
	 *
	 * @param node {Node} The element carrying the attribute.
	 * @param attribName {string}
	 * @param parentNg {NodeGroup} The row this attribute belongs to. */
	bind(node, attribName, parentNg) {
		// set() writes through the row's own root element, so an attribute anywhere deeper
		// would be found at bind time and then written somewhere else at set() time.  Catching
		// it here turns a silently misplaced attribute into a clear message.  It SHIPS: it is not
		// in a debug-strip block, and it must not be, because the failure it catches is silent.
		if (rowRoot(parentNg) !== node)
			throw new Error(`Solarite: a selector must be on the row's root element.`);

		let s = this.selector;
		s.attribName = attribName;
		s.path = parentNg.parentPath;

		let v = this.selected ? s.onValue : s.offValue;

		// Matches PathToAttribValue.applySingle: an empty or falsy value leaves no attribute
		// behind, so a selector never adds markup a hand-written implementation wouldn't have.
		if (v === '' || v === false || v === null || v === undefined) {
			// A just-cloned row provably carries no attribute of this name yet, so the
			// removeAttribute — a DOM call for every row of the list — can be skipped.
			if (parentNg.firstApply !== true)
				node.removeAttribute(attribName);
		}
		else
			node.setAttribute(attribName, v);
	}
}

/**
 * Created by h.selector().  Holds one selected key.
 *
 * Only attribute expressions can bind a selector; using one as element content throws,
 * because writing text through this path would need bookkeeping the two-node fast case
 * doesn't want.
 *
 * The selector keeps **no per-row state at all** — no map of keys, nothing to sweep, and
 * nothing that could pin a removed row's element in memory.  All it remembers is which
 * attribute it drives and which list it was rendered into.
 */
class Selector {

	/** @type {*} The selected key, or null. */
	#key = null;

	/** @type {SelectorRef} Returned by when() for the row whose key is selected. */
	#on = new SelectorRef(this, true);

	/** @type {SelectorRef} Returned by when() for every other row. */
	#off = new SelectorRef(this, false);

	/** @type {*} Value the bound attribute takes for the selected key.  Held here rather than
	 * on each ref, so the two refs stay interchangeable between call sites. */
	onValue;

	/** @type {*} Value it takes for every other key. */
	offValue = '';

	/** @type {?string} The attribute this selector drives, learned when a row binds. */
	attribName = null;

	/** @type {?PathToNodes} The list this selector's rows were rendered into, learned when a
	 * row binds.  set() asks it for the NodeGroup holding a given key. */
	path = null;

	/** @param key {*} The initially selected key. */
	constructor(key = null) {
		this.#key = key;
	}

	/** @return {*} The selected key. */
	get key() {
		return this.#key;
	}

	/**
	 * Bind an attribute to whether key is the selected one.
	 *
	 *	 h`<tr key=${row.id} class=${sel.when(row.id, 'danger')}>`
	 *
	 * @param key {*} This row's key.
	 * @param on {*} Value the attribute takes when key is selected.
	 * @param off {*} Value it takes otherwise.  '' removes the attribute.
	 * @return {SelectorRef} */
	when(key, on, off = '') {
		this.onValue = on;
		this.offValue = off;
		return key === this.#key ? this.#on : this.#off;
	}

	/**
	 * Move the selection.  Writes at most two attributes — the row losing the selection and
	 * the row gaining it — and touches nothing else.  There is no render() call.
	 * @param key {*} The newly selected key, or null for none. */
	set(key) {
		let old = this.#key;
		if (old === key)
			return;
		this.#key = key;

		// Nothing has rendered a row yet, so there is no list to write into.  Nor when the
		// element that holds the list has been given another template since: the list is then
		// let go, so that it and the template around it can be freed, instead of being written
		// into where nobody sees it.  Either way the new key still takes effect: rows drawn
		// later come up already carrying the attribute.
		let root = this.path?.parentNg.rootNg;
		if (!root || Globals.rootNodeGroups.get(root.rootEl) !== root) {
			this.path = null;
			return;
		}

		this.#write(old, this.offValue);
		this.#write(key, this.onValue);
	}

	/**
	 * Find the row holding key and give its root element the value v.
	 * @param key {*}
	 * @param v {*} */
	#write(key, v) {
		if (key === null || key === undefined)
			return;

		let ngs = this.path.nodeGroups;
		if (ngs === null || ngs.length === 0)
			return;

		if (ngs[0].key === undefined)
			throw new Error('Solarite: a selector must be on a keyed list, as key=${...}.');

		// A linear scan over the rows.  The list is walked only when the selection actually
		// moves — twice per user click, not once per row per render — so a thousand pointer
		// comparisons here cost far less than the per-row index that would avoid them.
		let ng = null;
		for (let i = 0; i < ngs.length; i++)
			if (ngs[i].key === key) {
				ng = ngs[i];
				break;
			}
		if (ng === null)
			return;

		// The selector owns an attribute on the row's own root element, which is ng.startNode
		// when the row template starts with its tag, or the first element after leading whitespace.
		let node = rowRoot(ng);
		if (node === null)
			return;

		if (v === '' || v === false || v === null || v === undefined)
			node.removeAttribute(this.attribName);
		else
			node.setAttribute(this.attribName, v);
	}
}

/**
 * Find a row's root element: ng.startNode in the common single-root case, or the first element
 * after any leading whitespace text or comment nodes (such as an indented multiline row template).
 * @param ng {NodeGroup}
 * @return {?Element} */
function rowRoot(ng) {
	let node = ng.startNode;
	while (node && node.nodeType !== 1 && node !== ng.endNode
		&& (node.nodeType === 8 || (node.nodeType === 3 && !node.nodeValue.trim())))
		node = node.nextSibling;
	return node?.nodeType === 1 ? node : null;
}

class PathToAttribValue extends Path {

	/** @type {?string} Used only if type=AttribType.Value. */
	attribName;

	/**
	 * @type {?string[]} Used only if type=AttribType.Value. If null, use one expr to set the whole attribute value. */
	attrValue;

	// isComponentAttrib and isHtmlProperty are declared on the Path base class.

	constructor(nodeBefore, nodeMarker, attribName, attrValue) {
		super(null, nodeMarker);
		this.attribName = attribName;
		this.attrValue = attrValue;
	}

	/**
	 * Set the value of an attribute.  This can be for any attribute, not just attributes named "value".
	 * @param exprs {Expr[]} */
	applyAll(exprs) {
		

		// Multiple expressions in one attribute value, e.g. class="a ${b} c ${d}"
		if (this.attrValue) {
			let node = this.nodeMarker;
			let joinedValue = this.getValue(exprs);
			let isProp = this.isHtmlProperty;

			// Only update attributes if the value has changed.
			// This is needed for setting input.value, .checked, option.selected, etc.
			let oldVal = isProp
				? node[this.attribName]
				: node.getAttribute(this.attribName);
			if (oldVal !== joinedValue) {
				if (isProp)
					node[this.attribName] = joinedValue;
				else if (this.attribName === 'value' && node.hasAttribute('contenteditable'))
					node.innerHTML = joinedValue;
				node.setAttribute(this.attribName, joinedValue);
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
			return this.applyAll([expr]);

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
				throw new Error(`Solarite cannot bind ${this.attribName} to ${obj}.`);

			let value = delve(obj, path);

			// Special case to allow setting select-multiple value from an array
			if (this.attribName === 'value' && node.type === 'select-multiple' && Array.isArray(value)) {
				// Set the .selected property on the options having a value within value.
				let strValues = value.map(v => v + '');
				for (let option of node.options)
					option.selected = strValues.includes(option.value);
			}

			// Radio group: this radio is checked when its value matches the bound model value.
			else if (node.type === 'radio')
				node.checked = node.value === (value + '');

			else {
				// TODO: should we remove isFalsy, since these are always props?
				let strValue = Util.isFalsy(value) ? '' : value;

				// Special case for contenteditable
				if (this.attribName === 'value' && node.hasAttribute('contenteditable')) {
					let existingValue = node.innerHTML;
					if (strValue !== existingValue)
						node.innerHTML = strValue;
				}
				else {

					// If we don't have this condition, when we call render(), the browser will scroll to the currently
					// selected item in a <select> and mess up manually scrolling to a different value.
					if (strValue !== node[this.attribName])
						node[this.attribName] = strValue;
				}
			}

			// TODO: We need to remove any old listeners, like in bindEventAttribute.
			// Does bindEvent() now handle that?
			let func = () => {
				let value = (this.attribName === 'value' || node.type === 'radio')
					? Util.getInputValue(node)
					: node[this.attribName];
				delve(obj, path, value);
			};

			// We use capture so we update the values before other events added by the user.
			// TODO: Bind to scroll events also?
			// What about resize events and width/height?
			this.bindEvent(node, this.parentNg.getRootEl(), this.attribName, 'input', func, true);
		}

		// Regular attribute
		else {
			// A selection binding (h.selector().when()) writes its own value and tells the
			// selector which list this row belongs to, so a later change of selection reaches
			// the attribute directly instead of going back through render().  The typeof test
			// keeps ordinary string attributes — nearly all of them — from paying for the
			// prototype check.
			if (typeof expr === 'object' && expr instanceof SelectorRef) {
				if (!this.isComponentAttrib)
					expr.bind(node, this.attribName, this.parentNg);
				return;
			}

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

			// Values that remove an attribute.  The empty string is included so that an attribute
			// disappears whenever its expression is empty, instead of only when it happened to be
			// absent already.  makePrimitive() above turns null into '', so plain null lands here
			// too; the explicit null test still matters for a function expression returning null,
			// which skips makePrimitive.
			// An html property that holds text is exempt: there '' is a real value meaning "empty",
			// as when clearing an <input>, so it belongs on the assignment path below.  A boolean
			// property such as disabled is not, because the assignment below also writes the
			// attribute, and an attribute that is present, even empty, turns it on.
			if (expr === undefined || expr === false || expr === null || (expr === '' && (!isProp || typeof node[this.attribName] === 'boolean'))) {
				if (isProp) {
					// Clear the property with a value of its own type.  Assigning false to a string
					// property such as input.value would put the text "false" in the field.
					let old = node[this.attribName];
					node[this.attribName] = typeof old === 'boolean' ? false : '';
				}
				// A contenteditable's value is its content (see the assignment below), so an empty
				// one empties it.  Without this a reused element kept its old text: a grid cell
				// moved to an empty column still showed the column it came from.
				else if (this.attribName === 'value' && node.hasAttribute('contenteditable') && node.innerHTML !== '')
					node.innerHTML = '';
				node.removeAttribute(this.attribName);
			}
			else if (expr === true) {
				if (isProp)
					node[this.attribName] = true;
				node.setAttribute(this.attribName, '');
			}

			// A non-toggled attribute
			else {
				// Only update attributes if the value has changed.
				// This is needed for setting input.value, .checked, option.selected, etc.
				// Non-property attributes never reach here with '', since that removes above.  So
				// an attribute that is absent, which reads as null, always differs from expr, and
				// the test is spelled exactly as the one in applyAll().
				let oldVal = isProp
					? node[this.attribName]
					: node.getAttribute(this.attribName);
				if (oldVal !== expr) {

					// <textarea value=${expr}></textarea>
					// Without this branch we have no way to set the value of a textarea,
					// since we also prohibit expressions that are a child of textarea.
					if (isProp)
						node[this.attribName] = expr;

						// Allow one-way binding to contenteditable value attribute.
						// Contenteditables normally don't have a value attribute and have their content set via innerHTML.
					// Solarite doesn't allow contenteditables to have expressions as their children.
					else if (this.attribName === 'value' && node.hasAttribute('contenteditable')) {
						node.innerHTML = expr;
					}

					// TODO: Putting an 'else' here would be more performant
					node.setAttribute(this.attribName, expr);
				}
			}
		}
	}


	getExpressionCount() { return this.attrValue ? this.attrValue.length-1 : 1 }

	/**
	 * @param exprs {Expr|Expr[]} // TODO: Why is this sometimes not an array?
	 * @return {string} The joined values of the expressions, or the first expression if there are no strings. */
	getValue(exprs) {

		
		//if (!Array.isArray(exprs))
		//	return exprs;

		if (!this.attrValue) {// If it's not multiple paths inside a single attribute, return first (and only) expression.
			
			return exprs[0];
		}

		let values = this.attrValue;
		let result = values[0];
		for (let i = 1; i < values.length; i++) {
			let expr = exprs[i-1];

			// A selection binding has to own the whole attribute, because its whole point is
			// writing that attribute without re-rendering, which it can't do if the rest of
			// the value comes from expressions it doesn't know about.  Whether a selector sits
			// inside a multi-part attribute is fixed by the shape of the template and never by
			// the data, so this can only be an authoring mistake, and it always surfaces on the
			// template's very first render -- exactly like the placement check in
			// SelectorRef.bind().  Like that check it ships in the built file: without it
			// makePrimitive() turns the ref into '' and the attribute is silently written
			// from its constant parts alone.
			if (typeof expr === 'object' && expr instanceof SelectorRef)
				throw new Error(`Solarite: a selector must own the whole ${this.attribName} attribute.`);
			let val = Util.makePrimitive(expr);
			if (!Util.isFalsy(val))
				result += val;
			result += values[i];
		}
		return result;
	}

	/**
	 * Call handler when eventName is triggered on node.
	 * @param node {HTMLElement}
	 * @param root {HTMLElement}
	 * @param key {string}
	 * @param eventName {string}
	 * @param handler {function|Array} A function, or the [func, ...args] array from the template.
	 * @param capture {boolean} */
	bindEvent(node, root, key, eventName, handler, capture=false) {
		

		// Delegated path: a bubbling event (when the root's options allow it, the default)
		// stores its handler directly on the node as a per-event-type Symbol expando, with no
		// EventBinding object and no addEventListener call.  When an event of that type
		// starts, the dispatcher (see createDispatcher) attaches a real listener to each node
		// on its path that carries the expando, so the browser runs the handler at the node's
		// own turn.
		// Re-renders just overwrite the property.  this.delegatedKey is set by the PathToEvent
		// constructor only for delegatable event names, so this test also excludes
		// non-bubbling events and native:on* bindings.
		if (capture === false && this.delegatedKey !== undefined) {
			let opt = this.parentNg.rootNg.renderOptions?.eventDelegation ?? true;
			// true delegates everything, an array only the events it names, and any other
			// value (such as the retired 'document' string) counts as true.
			if (opt !== false && (!Array.isArray(opt) || opt.includes(eventName))) {
				let dk = this.delegatedKey;

				// An anchored row keeps its handlers in its template (see isAnchored), so there is
				// nothing to store: the dispatcher reads the template when the handler's turn comes.
				if (isAnchored(this.parentNg))
					return;
				if (node[dk] === undefined) // First binding of this type on this node.
					ensureDelegatedDispatcher(root, eventName);
				// The template's own value is stored, a function or a [func, ...args] array
				// (onclick=${[fn, arg]}, the hot per-row case), so nothing is allocated.
				node[dk] = handler;
				node[delegatedRootKey] = root;
				return;
			}
		}

		// Direct path: capture bindings, non-bubbling events, and eventDelegation:false.
		// One stable EventBinding object per node+key is registered with addEventListener
		// and dispatches to the current handler.  This way, assigning a new function
		// (e.g. a fresh arrow function on each render) never needs add/removeEventListener.
		// The node holds it under a Symbol of the key's own, see bindingKeys.
		let sym = bindingKeys[key] ??= Symbol(key);
		let binding = node[sym];
		if (binding === undefined) {
			binding = node[sym] = new EventBinding(root, node, handler);
			node.addEventListener(eventName, binding, capture);
		}
		else {
			binding.rootEl = root;
			binding.handler = handler;
		}
	}
}

/**
 * One Symbol per binding key (an event name, or the attribute name of a two-way binding).  A
 * node stores its EventBinding for that key under it, so a node with several bindings needs
 * no table of its own.  The table has no prototype, so that a key named like a member of
 * Object.prototype ("constructor") is not found in it before it has been added.
 * @type {Object<string, symbol>} */
let bindingKeys = {__proto__: null};

/**
 * Get the EventBinding registered for a node+key, or undefined.
 * Lets a component invoke its own two-way binding (e.g. flush a bound value before
 * dispatching a change event) without exposing the private storage Symbols.
 * @param node {Node}
 * @param key {string}
 * @return {EventBinding|undefined} */
function getEventBinding(node, key) {
	let sym = bindingKeys[key];
	return sym && node[sym];
}

/**
 * The Symbol a node stores its delegated handler of each event type under, for the bubbling
 * events the just-in-time dispatcher handles (the same set Solid.js delegates).  Symbols (vs
 * string expandos like Solid's $$click) can't collide with user properties.  An event that
 * isn't listed is bound directly; PathToEvent looks its name up here once per path.
 * @type {Object<string, symbol>} */
let delegatedKeys = {__proto__: null};
for (let name of ['beforeinput', 'click', 'contextmenu', 'dblclick', 'focusin', 'focusout',
	'input', 'keydown', 'keyup', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup',
	'pointerdown', 'pointermove', 'pointerout', 'pointerover', 'pointerup', 'touchend', 'touchmove', 'touchstart'])
	delegatedKeys[name] = Symbol('sol$' + name);

// The component root a node's delegated handlers run with as `this`.
let delegatedRootKey = Symbol('solariteDelegatedRoot');

// A list row's root element points back at its NodeGroup under this key, which is how the
// dispatcher finds the row's handlers.  See isAnchored().
let rowNgKey = Symbol('solariteRow');

// The Shell whose delegated dispatchers a root last registered, kept on the RootNodeGroup so
// that a run of rows checks one field instead of asking at every bound node.  A Symbol rather
// than a declared field, since only root NodeGroups ever carry it and a declared field would
// cost a slot on every row.
let stampedShellKey = Symbol('solariteStampedShell');

/**
 * Is this NodeGroup a row whose delegated handlers the dispatcher reads from its template?
 *
 * The rows of a list are where event binding cost adds up: a row is cloned once and its
 * handlers are written once, and a thousand-row list does that a thousand times.  Storing a
 * handler on the node it belongs to means reaching that node in the fresh clone, which creates
 * a JS wrapper for it, and then adding a property to that wrapper.  Both are paid for again when
 * the row is torn down.  So a row made by the compiled stamp program stores nothing on its
 * nodes: its handlers stay in its Template, whose expressions the stamp program already keeps
 * for its re-render comparisons, and the row's root element carries one pointer back to the
 * NodeGroup (rowNgKey).  When an event starts, the dispatcher sees that pointer on the row's
 * root as it walks the event's path, looks up which of the row's nodes bind that event type
 * (Shell.stampEventsByType), and attaches the trampoline to those that are on the path; the
 * trampoline reads the handler from the template when its turn comes, so a row re-rendered in
 * the middle of a dispatch runs its current handler.  The pointer costs almost nothing: the
 * root element's wrapper exists already, since cloneNode() returned it.
 *
 * A row qualifies when it came from a stampable shell that binds at least one delegatable
 * event (so stampEventsByType is set), it belongs to a list (parentPath), and its root delegates
 * every event; an event-name array in the render options means the general binding path
 * decides event by event, and that path stores on nodes.
 * @param ng {NodeGroup}
 * @return {boolean} */
function isAnchored(ng) {
	return ng.parentPath !== null && ng.shell.stampEventsByType !== null && ng.rootNg.delegateAll === true;
}

/**
 * Make sure the dispatchers for a row shell's event types are registered on its root and
 * document.  The NodeGroup constructor makes a fresh row findable by the dispatcher itself, by
 * writing the row under rowNgKey on its root element, and calls this only when the root last
 * registered a different shell, so a run of rows from one template asks once.
 * @param rootNg {RootNodeGroup}
 * @param shell {Shell} */
function registerRowDispatchers(rootNg, shell) {
	for (let name in shell.stampEventsByType)
		ensureDelegatedDispatcher(rootNg.rootEl, name);
	rootNg[stampedShellKey] = shell;
}

// Set of event types that already have the dispatcher registered, kept on each root element
// and on each document.
let delegatedTypesKey = Symbol('solariteDelegatedTypes');

/**
 * Register the just-in-time dispatcher for eventName on root and on root's document, once
 * each.  Shared by bindEvent()'s delegated branch and registerRowDispatchers().
 *
 * Both registrations are needed.  The document's listener is what still reaches a bound node
 * after another component re-parents it outside its root (a toolbar a dock parks in its own
 * chrome).  The root's listener is what reaches what the document cannot see: a component
 * that isn't in the document at all, nodes inside a closed shadow root, and a synthetic
 * event dispatched inside any shadow root without composed:true, which never leaves it.
 *
 * A standalone template (toEl(), h()`...`) is the one root that isn't in the document its nodes
 * will be used in.  It is cloned from a <template>, whose content belongs to an inert document
 * of its own: one with no window, which no event ever passes through.  Its nodes are on their
 * way into the page, so the page's document registers in that document's place.  This matters
 * most when the template has several root nodes, or a component as its only node: its root is
 * then the DocumentFragment they are made in, which is left behind empty as soon as they are
 * appended somewhere, and the document's listener is the only one their events reach.
 * @param root {HTMLElement|DocumentFragment|Document}
 * @param eventName {string} */
function ensureDelegatedDispatcher(root, eventName) {
	let types = root[delegatedTypesKey] ??= new Set();
	if (!types.has(eventName)) {
		types.add(eventName);
		let dispatcher = dispatchers[eventName] ??= createDispatcher(eventName);
		root.addEventListener(eventName, dispatcher, true);

		// The document registers the same way.  It has no document of its own, which ends this.
		let doc = root.ownerDocument;
		if (doc !== null)
			ensureDelegatedDispatcher(doc.defaultView ? doc : Globals.doc, eventName);
	}
}

/**
 * The capture-phase listener of each delegated event type, made by createDispatcher().
 * @type {Object<string, function(Event)>} */
let dispatchers = {};

// For an event a dispatcher has walked, the path that walk saw.  A dispatcher on a nested root
// further down finds its own element in that path and skips the walk.  A root inside a closed
// shadow root does not find itself, because composedPath() hides a closed tree from listeners
// outside it, and that is what makes it walk again.  The path also names the root or document
// whose dispatcher did the walk (its walker property), which is how a second dispatch of the
// same Event object is told from a nested root's turn in the first; see step 1 of the
// dispatcher.  A WeakMap rather than a property on the event: every event is a new object, so
// a property has to be added to each one, and reading one that isn't there yet searches the
// event's whole prototype chain.  Measured on the first click after a page has been idle, the
// WeakMap is the cheaper of the two by 5 to 10 microseconds per click, about a tenth of what
// the dispatcher costs altogether.
let walked = new WeakMap();

let hasOwn = Object.hasOwn;

/**
 * Build the dispatcher for one event type: the capture-phase listener ensureDelegatedDispatcher()
 * registers on every root and on the document.  It runs before the event reaches anything,
 * walks the event's path, and attaches a real bubble-phase listener (the trampoline) to each
 * node holding a delegated handler.  The browser then finishes the dispatch natively, so those
 * handlers interleave correctly with listeners anyone else registered, stopPropagation() works
 * in both directions, currentTarget is right, and the event needn't bubble.
 *
 * Everything one event type needs lives in this closure, so a dispatch looks nothing up by
 * the type's name: no event.type call, and no keyed reads of per-type tables apart from one
 * lookup per row Shell, which attachRow() remembers.  The page has been idle before a click,
 * so each thing a click's code touches for the first time is a cache miss, and the dispatcher
 * runs on every delegated event in the page.
 *
 * @param type {string}
 * @return {function(Event)} */
function createDispatcher(type) {
	let dk = delegatedKeys[type];
	let doc = Globals.doc;

	// The nodes carrying the trampoline, and for each one where its handler is read from when
	// its turn comes: an anchored row's node has the row's NodeGroup and the index of the
	// handler among its template's expressions, any other node has null and holds its handler
	// itself (under dk).  The arrays are reused from one event to the next.
	let nodes = [], rows = [], exprIdx = [], count = 0;

	// The events of this type being dispatched right now, outermost first: a handler can
	// dispatch another event of the same type before its own has finished.  Only events the
	// walk attached something for are listed.  lasts holds, for each, the outermost node its
	// walk attached the trampoline to, which is the last one the event can reach.
	let evs = [], lasts = [], depth = 0;

	// One-entry memo of the anchored-row lookup, since the rows of a list share one Shell.
	let memoShell = null, memoOps;

	/**
	 * Remove the trampolines.  Housekeeping only: one left in place is harmless, because the
	 * next dispatch of this type removes it before attaching its own, and the trampoline reads
	 * its handler fresh. */
	let sweep = () => {
		for (let i=0; i<count; i++) {
			nodes[i].removeEventListener(type, trampoline);
			nodes[i] = rows[i] = null;
		}
		count = 0;
	};

	/**
	 * Take the trampoline off a node for a walk that started inside another dispatch, so that
	 * the walk can add it again behind every listener the node has now (step 3 of the
	 * dispatcher).  A node that an event in progress is at right now keeps it: the browser is
	 * part-way through that node's listeners, and removing the trampoline takes it out of that
	 * pass, so the outer event would skip the node's handler.  That is what a listener someone
	 * added to the node with addEventListener does when it dispatches another event of this
	 * type through the node, since it runs before the trampoline.  Adding the trampoline again
	 * then does nothing, and the new event finds it in the place the outer event gave it.
	 * The unused slots of evs hold null, and an event that is over has no currentTarget.
	 * @param node {Element} */
	let detach = node => {
		if (!evs.some(ev => ev?.currentTarget === node))
			node.removeEventListener(type, trampoline);
	};

	/**
	 * Take the dispatches that are over off the top of the stack.  A dispatch is still on
	 * record after it is over when it never reached its last node: propagation was stopped, or
	 * the event doesn't bubble.  An event's phase is 0 once it is over.
	 * @return {int} The depth that is left, which counts the dispatches still in progress. */
	let unwind = () => {
		while (depth !== 0 && evs[depth - 1].eventPhase === 0)
			evs[--depth] = lasts[depth] = null;
		return depth;
	};

	/**
	 * The shared bubble-phase listener, attached to a node only for the duration of one event.
	 * The browser invokes it at the node's own turn in propagation, and it reads the node's
	 * handler THEN rather than when it was attached, so a handler that an earlier listener in
	 * the same dispatch replaced or removed is honored.
	 *
	 * It also ends the dispatch.  The outermost node a walk attached to is the last one the
	 * event can reach, so when its turn comes nothing of ours is left to run, and the
	 * trampolines are removed once its handler returns or throws.  Ending here rather than
	 * from a listener on the document costs no extra listener call per event.  A timer would
	 * not do (it is a second task between the event and the frame it produces), and neither
	 * would a microtask (for a real click the browser runs a microtask checkpoint between
	 * listeners, so the trampolines would go before the event reached the first of them).
	 * An event that never reaches that node, because propagation was stopped or the event
	 * doesn't bubble, leaves its trampolines for the next dispatch of this type to remove, or
	 * for the event it was dispatched from, which removes them with its own when it ends. */
	function trampoline(ev) {
		let node = this;

		// 1. Find where this node's handler lives.  The innermost dispatch's nodes are last.
		let i = count - 1;
		while (i >= 0 && nodes[i] !== node)
			i--;
		if (i < 0) // Defensive: a node carries the trampoline only while it is listed here.
			return;
		let ng = rows[i], a, root;
		if (ng === null) {
			a = node[dk];
			root = node[delegatedRootKey];
		}
		else {
			a = ng.template.exprs[exprIdx[i]];
			root = ng.rootNg.rootEl;
		}

		// 2. End the dispatch if this is its last node.  The trampolines themselves are removed
		// after the handler has run (step 3), so that an event the handler dispatches on a row
		// it has just removed, which no dispatcher can see, still finds them, as it would find
		// listeners registered at render.
		//
		// This event is nearly always the innermost one on record.  When it isn't, dispatches
		// that its listeners started and that never reached their own last node may be lying on
		// top of it; unwind() takes those off and the test is made once more.  Left there they
		// would keep this event from ever being seen to end, and its trampolines and theirs
		// would stay until the next dispatch of this type.
		let ended = false;
		let d = depth - 1;
		if (d >= 0 && (evs[d] === ev || evs[d = unwind() - 1] === ev) && lasts[d] === node) {
			// The walk of a dispatch that is over is forgotten, so that the same Event object
			// dispatched again is walked again by the first dispatcher it reaches.  Left on record,
			// it would let a component's root that has since left the page take the second
			// dispatch for its own turn in the first and skip it.
			walked.delete(ev);
			evs[d] = lasts[d] = null;
			depth = d;
			ended = d === 0;
		}

		// 3. Call the handler.  Anything that isn't one cannot be reached through a template,
		// which rejects it at render; the test only keeps a damaged row from throwing here.
		try {
			// Written out here rather than through callHandler(): that one more call per handler
			// showed on the select-row benchmark (measured on the M1, 2026-10-02).  Each call is
			// spelled exactly as callHandler() spells it, returns included, so that the two
			// compress as one: change one and the other must follow.  Only the test for an
			// array is this copy's own.  The browser ignores what a listener returns.
			if (typeof a === 'function')
				return a.call(root, ev, node);
			if (Array.isArray(a) && typeof a[0] === 'function') {
				switch (a.length) {
					case 1: return a[0].call(root, ev, node);
					case 2: return a[0].call(root, a[1], ev, node);
					case 3: return a[0].call(root, a[1], a[2], ev, node);
				}
				return a[0].call(root, ...a.slice(1), ev, node);
			}
		}
		finally {
			if (ended)
				sweep();
		}
	}

	/**
	 * Attach the trampoline to the nodes of an anchored row that are on the event's path and
	 * bind this event type.  Nothing is written onto them: the trampoline reads each handler
	 * from the row's template.  See isAnchored() for why rows are handled this way.
	 * @param rowEl {HTMLElement} The row's root element, path[rowIndex].
	 * @param ng {NodeGroup} The row.
	 * @param path {EventTarget[]} ev.composedPath().
	 * @param rowIndex {int} Where the row's root sits in path; its other nodes sit before it.
	 * @param removeFirst {boolean} See the dispatcher.
	 * @return {int} The highest index in path a trampoline was attached at, or -1. */
	let attachRow = (rowEl, ng, path, rowIndex, removeFirst) => {
		let shell = ng.shell;
		if (shell !== memoShell) {
			memoShell = shell;
			memoOps = shell.stampEventsByType[type];
		}
		let ops = memoOps;
		if (ops === undefined)
			return -1;

		// Resolved nodes are kept on the row, so the next event on it skips the walk.  The
		// pairs are in ascending slot order, so one resolve up to the last covers them all.
		let last = ops[ops.length - 1];
		let slots = last > 1 ? ng.stampSlots(last) : null;
		let outer = -1;
		for (let k=0; k<ops.length; k+=2) {
			let s = ops[k+1];
			let target = s === 1 ? rowEl : slots[s];

			// Only a node the event passes through gets a listener: the row's other bound nodes
			// aren't involved in this event at all.
			let j = rowIndex;
			while (j >= 0 && path[j] !== target)
				j--;
			if (j < 0)
				continue;

			if (removeFirst)
				detach(target);
			target.addEventListener(type, trampoline);
			nodes[count] = target;
			rows[count] = ng;
			exprIdx[count++] = ops[k];
			if (j > outer)
				outer = j;
		}
		return outer;
	};

	return function dispatcher(ev) {

		// 1. Skip the walk when a dispatcher that could see this element has walked the event
		// already.  The dispatcher that did that walk never skips: it is the first of these
		// listeners the event reaches, so finding the event on record means the same Event
		// object is being dispatched again, which needs a new walk.  The others skip only while
		// the target is the one that walk saw.
		let seen = walked.get(ev);
		if (seen !== undefined && seen.walker !== this && seen.includes(this) && seen[0] === ev.target)
			return;
		let path = ev.composedPath();
		path.walker = this;
		walked.set(ev, path);

		// 2. Dispatches of this type that are over but never reached their last node
		// (propagation stopped, or an event that doesn't bubble) come off the stack now.  If
		// nothing of this type is still in progress their trampolines are removed before this
		// event's are attached.  A dispatch a handler started this one from is still in
		// progress and is left alone.
		let d = depth;
		if (d !== 0)
			d = unwind();
		// Trampolines can also be left with no dispatch on record, when a walk threw part-way,
		// so anything still attached while nothing is in progress is removed here too.
		if (d === 0 && count !== 0)
			sweep();

		// 3. Walk the path.  A node already carrying the trampoline, for a dispatch this one
		// was started from, has it removed first: left alone it would keep its old place in
		// the node's listener list, ahead of listeners added since, and removing and re-adding
		// puts it last.  So the rule holds: a delegated handler runs after every listener its
		// element had when the event started.  The one exception is the node an outer event is
		// at while this one starts, which detach() leaves alone; there the handler runs after
		// every listener the node had when the outer event started.  Nothing carries a
		// trampoline when no dispatch is in progress, which spares the usual event the remove.
		//
		// hasOwn() rather than a read: a read that finds nothing on the node goes on to search
		// every prototype behind it, and the path holds a different kind of element at nearly
		// every step, so each of those searches is a fresh one.  Handlers are only ever stored
		// on elements, so the walk stops at the document.
		let removeFirst = d !== 0;
		let outer = -1;
		for (let i=0; i<path.length; i++) {
			let node = path[i];
			if (node === doc)
				break;
			if (hasOwn(node, dk)) {
				if (removeFirst)
					detach(node);
				node.addEventListener(type, trampoline);
				nodes[count] = node;
				rows[count++] = null;
				outer = i;
			}
			// The root of an anchored list row: its handlers are read from the row's template.
			if (hasOwn(node, rowNgKey)) {
				let j = attachRow(node, node[rowNgKey], path, i, removeFirst);
				if (j > outer)
					outer = j;
			}
		}

		// 4. Remember the event as in progress, with the node that ends it.  A second walk of
		// the same event (a root inside a closed shadow root) updates its entry.
		if (outer >= 0) {
			let k = -1;
			if (seen !== undefined) {
				k = d - 1;
				while (k >= 0 && evs[k] !== ev)
					k--;
			}
			if (k < 0) {
				k = depth++;
				evs[k] = ev;
			}
			lasts[k] = path[outer];
		}
	};
}

class EventBinding {
	constructor(root, node, handler) {
		this.rootEl = root;
		this.node = node;

		/** @type {function|Array} A function or a [func, ...args] array; see callHandler(). */
		this.handler = handler;
	}

	// Called by the browser via the addEventListener(name, object) form.
	// Sets the "this" variable to be the current Solarite component.
	// Quoted so the minifier's property mangling doesn't rename it, since the browser looks it up by name.
	'handleEvent'(event) {
		return callHandler(this.handler, this.rootEl, event, this.node);
	}
}

/**
 * Is v something an event attribute accepts: a function, or a [function, ...args] array?
 * @param v {*}
 * @return {boolean} */
function isHandler(v) {
	return typeof v === 'function' || (Array.isArray(v) && typeof v[0] === 'function');
}

/**
 * Call an event handler the way a template promises: `this` is the component the template
 * belongs to, and the event and the element it was bound on follow the handler's own
 * arguments.  Used by directly bound handlers (EventBinding); the trampoline of delegated
 * ones carries the same calls written out, see there.  The common argument counts are
 * spelled out so that calling them allocates nothing.
 * @param a {function|Array} A function, or a [function, ...args] array; see isHandler().
 * @param root {HTMLElement}
 * @param ev {Event}
 * @param node {HTMLElement}
 * @return {*} What the handler returned. */
function callHandler(a, root, ev, node) {
	if (typeof a === 'function')
		return a.call(root, ev, node);
	switch (a.length) {
		case 1: return a[0].call(root, ev, node);
		case 2: return a[0].call(root, a[1], ev, node);
		case 3: return a[0].call(root, a[1], a[2], ev, node);
	}
	return a[0].call(root, ...a.slice(1), ev, node);
}

// TODO: Merge this into PathToAttribValue?
class PathToEvent extends PathToAttribValue {

	/** @type {string} The attribName without the "on" prefix. */
	eventName;

	/** @type {symbol|undefined} The property a node stores this event's delegated handler under
	 * (the rows of a list keep theirs in the row's template instead; see isAnchored() in
	 * PathToAttribValue.js).  Undefined for non-delegatable (non-bubbling) events and for
	 * native: bindings; bindEvent() then binds directly. */
	delegatedKey;

	/**
	 * `native:onclick` registers the handler with addEventListener when the template renders,
	 * so it keeps the place in its element's listener order that it was given at render,
	 * instead of being attached by the dispatcher when an event starts.  Such a binding leaves
	 * delegatedKey undefined.  That is the single switch both bindEvent() and the compiled
	 * stamp program test to choose the direct addEventListener path, so nothing else has to
	 * know about the prefix.
	 * @param nodeBefore {null} Unused; an attribute path has no nodes of its own.
	 * @param nodeMarker {HTMLElement}
	 * @param attribName {string} `onclick` or `native:onclick`.
	 * @param attrValue {?string[]} */
	constructor(nodeBefore, nodeMarker, attribName, attrValue) {
		super(null, nodeMarker, attribName, attrValue);
		this.skipIfSame = true;
		let name = attribName;
		let native = name.startsWith(nativeEventPrefix);
		if (native)
			name = name.slice(nativeEventPrefix.length);
		this.eventName = name.slice(2);
		this.delegatedKey = native ? undefined : delegatedKeys[this.eventName];
	}

	/**
	 * A value with text around its expressions, such as onclick="alert(${1})", is a classic
	 * inline handler: the joined text is the code the browser runs.  A handler given there would
	 * be called while rendering to make that text, and what it returned would be run as code
	 * when the event fires, which is never what was meant.  It is nearly always a stray
	 * character beside the expression, as in onclick="${f} ", so it throws instead.  Anything
	 * else goes on to the inherited applyAll(), which joins a multi-part value and otherwise
	 * comes to applySingle().
	 * @param exprs {Expr[]} */
	applyAll(exprs) {
		if (this.attrValue && exprs.some(isHandler))
			throw new Error(`Solarite: ${this.attribName}="...\${...}..." mixes a handler with text.`);
		return super.applyAll(exprs);
	}

	/**
	 * Handle attributes for event binding, such as:
	 * onclick=${(e, el) => this.doSomething(el, 'meow')}
	 * oninput=${[this.doSomething, 'meow']}
	 * @param expr {Expr} */
	applySingle(expr) {
		// Tested by Solarite.events.classicWithExpr
		// Expressions within a string attribute value that's not a Solarite event.  E.g.
		// <div onclick="alert(${1});"
		if (this.attrValue)
			return this.applyAll([expr]);

		// Don't bind events to component placeholders.
		// PathToComponent will do the binding later when it instantiates the component.
		if (this.isComponentAttrib && this.nodeMarker.tagName.endsWith('-SOLARITE-PLACEHOLDER'))
			return;

		let root = this.parentNg.rootNg.rootEl;

		// The root is an element, or a DocumentFragment (11): the fragment or shadow root that
		// h(fragment)`...` rendered into, or the fragment a standalone template with several root
		// nodes is returned in.
		

		if (!isHandler(expr))
			throw new Error(`Solarite: ${this.attribName}=\${...} is not a function.`);

		// The template's value is handed over as it is, a function or a [func, ...args] array
		// (oninput=${[this.doSomething, 'meow']}), so nothing is allocated here.
		let eventName = this.eventName;
		this.bindEvent(this.nodeMarker, root, eventName, eventName, expr);
	}
}

/**
 * JSX support for Solarite.  Two tiers share this one module:
 *
 * Tier 1 (precompile): a build step (Deno's `jsx:"precompile"` or a Solarite build plugin) hoists
 *   each element's static HTML into a module-level array and emits
 *   `jsxTemplate(statics, jsxAttr(name, value), jsxEscape(child), ...)`.  Stable array identity maps
 *   straight onto Template => Shell cache, closeKey, and NodeGroup reuse all work; perf equals tagged
 *   templates.  jsxTemplate/jsxAttr/jsxEscape live in jsx-runtime.js; the JsxAttr class below is the
 *   whole-attribute hole they produce.
 *
 * Tier 2 (classic/automatic factory): tsc/esbuild/Vite emit `h(tag, props, ...children)` or
 *   `jsx(tag, props, key)` with no hoisting.  jsxToTemplate() interns the static HTML per
 *   (tag, prop-names, child-count) shape so identity is stable per call site even though a new
 *   Template is built each render.  Every prop value and child is an expression hole, never diffed
 *   as static. */

// Fragment for <>...</> in the classic/automatic factories.  Tier 1 fragments need no import.
let Fragment = Symbol('Fragment');

/**
 * A whole-attribute hole from Tier 1, e.g. `<a ` + jsxAttr("href", v) + `>`.  It lands at a
 * PathToAttribs hole (a bare ${} between attributes); PathToAttribs detects this class and routes
 * the value through the normal attribute/event/property application. */
class JsxAttr {
	constructor(name, value) {
		this.name = name;
		this.value = value;
	}
}

let selfClosingTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

// Tier 2 shape cache: `tag\0name1\0name2\0#childCount` => htmlStrings array (stable identity).
let shapeCache = new Map();

// The html of a fragment, by child count: an empty string around each child hole and nothing
// else.  One array is kept per count, because a template is recognised by the identity of its
// html array.  Given a new array on every render, a fragment would each time be a template never
// seen before: its html parsed again, its children removed and built again (losing focus, typed
// text and the state of child components), and the removed copy kept for a reuse that never comes.
let fragmentShapes = [];

/**
 * Serialize a style object to css text.  {color:'red', fontSize:'1px'} => 'color:red;font-size:1px'.
 * A string passes through unchanged.
 * @param value {Object|string}
 * @return {string} */
function styleToCss(value) {
	if (value === null || typeof value !== 'object')
		return value;
	let css = '';
	for (let k in value) {
		let v = value[k];
		if (v === null || v === undefined || v === false)
			continue;
		css += (css ? ';' : '') + Util.camelToDashes(k) + ':' + v;
	}
	return css;
}

/**
 * Build a Template for a Tier 2 (classic/automatic) JSX element.
 * @param tag {string|Function|symbol} Intrinsic tag name, component class/function, or Fragment.
 * @param props {?Object} Attributes/props (children and key are pulled out by the caller for the
 *     automatic runtime; for the classic factory they may still be present and are stripped here).
 * @param children {any[]} One hole per child.
 * @param key {*} Optional list key (automatic runtime passes it separately).
 * @return {Template} */
function jsxToTemplate(tag, props, children=[], key=undefined) {
	props = props || {};

	// 1. Fragment: only child holes, no element wrapper.
	if (tag === Fragment)
		return new Template(fragmentShapes[children.length] ??= Array(children.length + 1).fill(''), children);

	// 2. Component (class or function).
	if (typeof tag === 'function') {

		// 2a. Custom element class => emit <tag-name ...props>children</tag-name>; PathToComponent
		// instantiates it exactly like a tagged-template component.
		// defineClass() hands back the name it registered, or the name the class was already
		// registered under, so we never have to guess it a second time.
		if (tag.prototype instanceof HTMLElement)
			return buildIntrinsic(Util.defineClass(tag), props, children, key);

		// 2b. Plain function component: call it with props (+ children) and expect a Template back.
		let p = {};
		for (let name in props)
			if (name !== 'key')
				p[name] = name === 'style' ? styleToCss(props[name]) : props[name];
		if (!('children' in p) && children.length)
			p.children = children.length === 1 ? children[0] : children;
		let t = tag(p);
		if (key === undefined)
			key = props.key;
		if (key !== undefined && t instanceof Template)
			t.key = key;
		return t;
	}

	// 3. Intrinsic element.
	return buildIntrinsic(tag, props, children, key);
}

/**
 * @param tag {string}
 * @param props {Object}
 * @param children {any[]}
 * @param key {*}
 * @return {Template} */
function buildIntrinsic(tag, props, children, key) {
	let isVoid = selfClosingTags.has(tag.toLowerCase());
	let names = [];
	let values = [];
	let openStatic = ''; // Static id/data-id inlined so their embeds (this.x references) resolve.

	for (let name in props) {
		if (name === 'children') // The automatic runtime stashes children here; they're passed separately.
			continue;
		if (name === 'key') {
			if (key === undefined)
				key = props[name];
			continue;
		}
		let value = props[name];

		// id/data-id reference embeds only work when the attribute is static in the html, so inline
		// string-valued ones (the usual case) instead of making them holes.  Tier 1 transforms
		// already inline static attributes; this keeps the Tier 2 classic factory on par.
		if ((name === 'id' || name === 'data-id') && typeof value === 'string') {
			// Escaped for its place between double quotes in the html.
			openStatic += ` ${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
			continue;
		}

		if (name === 'style')
			value = styleToCss(value);
		names.push(name);
		values.push(value);
	}

	let childCount = isVoid ? 0 : children.length;
	let shapeKey = tag + openStatic + '\0' + names.join('\0') + '\0#' + childCount;
	let html = shapeCache.get(shapeKey);
	if (!html) {
		// The html a tagged template would have had, split where its holes are:
		// `<tag openStatic name1=${} name2=${}>${child0}${child1}</tag>`.  Everything after the static
		// attributes is written as one string with a NUL at each hole and split there; a NUL cannot be
		// part of a tag or attribute name.  A void tag has no children and no end tag.
		html = (names.map(name => ' ' + name + '=\0').join('') + '>'
			+ (isVoid ? '' : '\0'.repeat(childCount) + '</' + tag + '>')).split('\0');
		html[0] = '<' + tag + openStatic + html[0];
		shapeCache.set(shapeKey, html);
	}

	let exprs = isVoid ? values : values.concat(children);
	let t = new Template(html, exprs);
	if (key !== undefined)
		t.key = key;
	return t;
}

class PathToAttribs extends Path {

	/**
	 * @type {Set<string>} Used for type=AttribType.Multiple to remember the attributes that were added. */
	attrNames;

	/** @type {PathToEvent|PathToAttribValue|undefined} Cached sub-path for the JSX
	 * whole-attribute fast path; see applyJsxAttr().  Declared so the first assignment
	 * doesn't transition the hidden class.  Its attribName is the name it was built for. */
	jsxSub;

	constructor(nodeBefore, nodeMarker) {
		// nodeBefore is discarded: an attribute path has no nodes of its own.  The marker goes
		// straight through the base constructor rather than being stored a second time after it.
		super(null, nodeMarker);
		this.attrNames = new Set();
	}

	/**
	 * @param expr {Expr} */
	applySingle(expr) {
		let node = this.nodeMarker;

		// JSX Tier 1 whole-attribute hole: `<a ` + jsxAttr("href", v) + `>`.
		if (expr instanceof JsxAttr)
			return this.applyJsxAttr(expr);

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			if (typeof expr === 'function')
				expr = expr();

			// Attributes as a string become the same name: value object as the other form.  The
			// values of one made from a string are all strings, so none is skipped below.
			if (typeof expr !== 'object')
				expr = Util.splitAttribs(expr);

			for (let name in expr) {
				let value = expr[name];
				if (value === undefined || value === false || value === null)
					continue;
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
	 * Apply a single JSX jsxAttr(name, value) pair.  We delegate to a cached PathToEvent or
	 * PathToAttribValue sub-path so events, html properties, two-way binding, booleans, and
	 * contenteditable all behave exactly as `name=${value}` in a tagged template.  The attr name
	 * at a given hole is a compile-time literal, so the sub-path is stable across renders.
	 * @param attr {JsxAttr} */
	applyJsxAttr(attr) {
		let name = attr.name;
		if (name === 'key') // Lifted onto template.key by jsxTemplate(); never rendered as an attribute.
			return;
		let value = attr.value;

		let sub = this.jsxSub;
		if (sub === undefined || sub.attribName !== name) {
			let node = this.nodeMarker;
			if (Util.isEvent(name))
				sub = new PathToEvent(null, node, name, null);
			else {
				sub = new PathToAttribValue(null, node, name, null);
				sub.isHtmlProperty = Util.isHtmlProp(node, name);
			}
			sub.isComponentAttrib = this.isComponentAttrib;
			this.jsxSub = sub;
		}
		sub.nodeMarker = this.nodeMarker;
		sub.parentNg = this.parentNg;
		if (name === 'style')
			value = styleToCss(value);
		sub.applySingle(value);
	}
}

/**
 * Maps a string key to multiple values.
 * Values are stored in arrays because pushing them is much faster than Set operations,
 * and deleteAny() needs no iterator allocation.
 * deleteAny() returns values first-in-first-out by advancing a head index (array.hd)
 * instead of calling shift(), which would be O(n). */
class MultiValueMap {

	/** @type {Record<string, Array>} */
	data = {};

	/**
	 * Add a new value for a key, unless the key already holds max values.
	 * The cap bounds pooled NodeGroup memory; without one every value is added.
	 * @param key {string}
	 * @param value
	 * @param [max] {int} */
	addCapped(key, value, max=Infinity) {
		let data = this.data;
		let array = data[key];
		if (!array)
			data[key] = [value];
		else if (array.length - (array.hd || 0) < max)
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

		let head = array.hd || 0;
		let result = array[head];
		head++;
		if (head >= array.length)
			delete data[key];
		else
			array.hd = head;

		return result;
	}
}

/**
 * A list of items plus the function that builds one item's Template, as returned by h.map().
 *
 * Handing the reconciler the source items instead of an array of Templates is what makes
 * h.map() cheap on a long list: a row whose item is the same object it was built from needs
 * neither a Template built for it nor a cache lookup to find one, just an identity check
 * against the item the row already remembers.  Rows that moved are recognized too — see
 * PathToNodes.applyMapped(), which follows a shifted list's offset and, failing that, matches
 * items against the Templates the previous render built.
 */
class MappedList {

	/** @type {Array} */
	items;

	/** @type {function(*):Template} */
	fn;

	constructor(items, fn) {
		this.items = items;
		this.fn = fn;
	}

	/**
	 * Yield the Templates, building each one as it goes, so that code written against the older
	 * array-returning h.map() — spreading it, iterating it, passing it to Array.from — still
	 * works.  Doing so builds every row, which is exactly the work the reconciler skips when the
	 * list is handed to it whole, so prefer putting an h.map() straight into a template. */
	*[Symbol.iterator]() {
		let items = this.items, fn = this.fn;
		for (let i=0; i<items.length; i++)
			yield fn(items[i]);
	}
}

// The constants of this file are declared ahead of the class that reads them, because that is
// what lets the minifier write each number where it is used; one declared after its first use
// is kept as a variable instead.  They are declared with `let`, as every variable in src/ is:
// the minifier joins neighbouring `let` declarations into one list, a `const` among them cuts
// the list in two, and the lone keyword costs more compressed bytes than it looks.

// Shared empty array for paths whose nodeGroups were never created.  Never mutated.
let emptyNodeGroups = [];

// How many changed h.map() positions applyMapped() collects before it stops to work out what
// kind of change it is looking at (see the probe in applyMapped).  Below this every ordinary
// edit — a selection, a partial update — is handled without asking.
let missProbeThreshold = 256;

// How many of those positions may need matching against each other before the general keyed
// diff, with its key map and longest-increasing-subsequence, becomes the cheaper tool.  The
// cross-match here is quadratic, which only pays while the number of moved rows is small.
let maxDisplacedMisses = 16;

// How far applyMapped() looks around a position to pick a shifted list's rows back up.  One
// insertion or removal moves everything by one, which the first step finds; a handful at once
// still lands inside this window, and past it the item map takes over.
let shiftSearchDistance = 4;

// How far ahead it looks to recognize a block of inserted rows, by finding the item that the
// old row standing here now belongs to.  Wider than the search above because inserting a page
// of rows at once is ordinary, and because this search only runs while the walk is still in
// step and stops it dead the first time it fails — so its worst case is one pass of this many
// comparisons per render, against building a map of every row in the list.
let insertSearchDistance = 64;

// What PathToNodes.kept holds while a path that no element was given is being drawn; see
// applyAll().
let drawing = {el: null, nodes: null};

// The error PathToNodes.blame() threw last, by which applyAll() knows it from an error thrown
// by the drawing.
let blamed;

// The path PathToNodes.drawAgain() is drawing again, which it does not do a second time.
let drawingAgain = null;

// Most detached NodeGroups kept per close key.  Bounds memory growth after very large
// lists are cleared while keeping pooled rows for every typical re-create pattern.
// Lowering this (e.g. to 1000) cuts retained memory ~7x after clearing a 10k-row list,
// but makes re-creating such a list ~2x slower since most rows are built fresh.
let maxPooledPerKey = 10000;

// A raw DOM Node given to an expression carries, under this key, a weak reference to the path
// that placed it last.  A Node can stand in one place only, so a path that is given a Node
// which another path placed takes it from that path, and has to tell it; see applyGeneric().
// The reference is weak so that a Node the page keeps does not keep alive the last component
// that showed it.
let rawOwnerKey = Symbol();

// A DocumentFragment given to an expression keeps, under this key, the nodes it brought; see
// collectItems().
let fragmentNodesKey = Symbol();

class PathToNodes extends Path {

	/** @type {boolean} True once any NodeGroup this path created needs a visit even when its
	 * values are unchanged (it holds a component or a live HTML property).  Those rows are the
	 * reason the list scans exist, so their presence rules out applyMisses()' skip-the-scan
	 * path.  Sticky: it's never cleared, which can only cost a scan that wasn't needed. */
	anyNeedsRefresh = false;

	/** @type {?Array} The h.map() items the previous render drew, one per NodeGroup and in the
	 * same order, so an unchanged row is recognized by comparing two arrays rather than by
	 * following a pointer into each NodeGroup.  A thousand rows' NodeGroups are scattered over
	 * a hundred kilobytes, so reading a field from each one costs a cache miss apiece; two flat
	 * arrays walk in step.  Null whenever the last render wasn't an h.map().
	 * @type {?Array} */
	lastItems = null;

	/** @type {boolean} True when the previous render's items contained raw DOM Nodes,
	 * which routes applySingle() to the generic reconciler.  Declared so the hot
	 * `!this.itemsHaveNodes` check reads a real field instead of a missing property,
	 * and so the first raw-Node render doesn't transition the hidden class. */
	itemsHaveNodes = false;

	/** @type {?{el:?HTMLElement, nodes:?Node[]}} For a path written inside the tag of an
	 * element that doesn't render through Solarite: that element, and the nodes this path left
	 * between its two markers, which the element may have moved or removed since.  The nodes
	 * are null while the path is being drawn.  Any other path has null here, and while it is
	 * being drawn an object without an element; see applyAll().  Declared so that applyAll()
	 * reads a real field. */
	kept = null;

	/** @type {?NodeGroup[]} The NodeGroups created by this path's expression, in order.
	 * Lazily created; null when the path has only ever rendered a primitive (see textNode). */
	nodeGroups = null;

	/** @type {?Text} When the expression is a single primitive, its text node lives here
	 * with no Template or NodeGroup wrapper.  Mutually exclusive with nodeGroups entries. */
	textNode = null;

	/** @type {?string} The current value of textNode. */
	textValue = null;



	/**
	 * NodeGroups that stood in the DOM before the last render by applyGeneric() and that it did
	 * not use.  It took them out, each in one piece, and its next render may take them again.
	 * Used with getNodeGroup() and freeNodeGroups(), keyed by close key.  Null while a render
	 * is under way and after a render by any other route.
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
	 * Apply the expression of a path in a template that holds a component or an attribute of
	 * several expressions, which are the templates NodeGroup.applyExprs() applies through
	 * applyAll().
	 *
	 * This is where a path written inside the tag of an element that doesn't render through
	 * Solarite looks for its nodes before it draws.  PathToComponent hands such an element
	 * its children once, as the browser does for a tag it parses, and the element may then
	 * move all of them together, into its shadow root or a wrapper of its own.  Every list
	 * operation below assumes the rows are still between the two markers, in the order they
	 * were left in, and throws from deep inside the DOM or draws in the wrong place when they
	 * are not.  So the DOM is asked once, here, before anything is drawn:
	 * - The markers still enclose a run of siblings, in the element or wherever it moved them
	 *   as a whole, and the run is the one this path left: draw as usual.
	 * - The run was one Text node, and a page translator's <font> stands in its place: that is
	 *   the translator's doing, not the element's, and it is handled as textReplaced() is.
	 * - Anything else is an error, thrown to the caller of render() before anything is drawn:
	 *   the markers no longer enclose a run, or a node was taken out of it, put in another
	 *   place in it, or added to it.  Nothing is removed, drawn again or put back, so the
	 *   error is thrown by every render until the element returns the nodes as they were.
	 *
	 * Only the nodes this path drew itself are compared.  What a row drew inside itself is
	 * known to the row's own paths alone, and comparing those would cost every row of every
	 * list a check.  So an element that reaches into a row is not named: the row's own list
	 * throws the DOM's error when it trips over the missing node.  An error thrown by the
	 * drawing reaches the caller as it is, whatever its cause, and the expression is then
	 * drawn from nothing by the next render.  The one exception is this same error thrown for
	 * another such element inside a row: the rows are left as they are, because that error
	 * is thrown before anything is drawn.
	 * @param exprs {Expr[]} */
	applyAll(exprs) {
		
		let kept = this.kept, was = kept && kept.nodes;

		// 1. A render that started inside a draw of this path: code run by a row, or by a node
		// as it is taken out, can render the host again.  It must not take a half-drawn path
		// for the element's doing, so it compares nothing, and asks only whether there is
		// still a place to draw into.  When there is none it draws nothing and throws
		// nothing: the place may be back in a moment (clearing a list takes the markers out
		// and puts them back), and when it is not, the draw this render is inside finds out
		// and throws, in step 5.
		if (kept && !was) {
			if (!kept.el || this.standing())
				this.applySingle(exprs[0]);
			return;
		}

		// 2. Look for the nodes this path left.
		if (was) {
			let nodes = this.standing();

			// Text in an element of its own, inside the foreign element, that a page translator
			// replaced is not the foreign element's doing; see textReplaced().
			if ((!nodes || !Util.arraySame(nodes, was)) && !(this.nodeMarker !== kept.el && this.textReplaced())) {

				// Nor is the one Text node this path drew straight inside the element's tag, as
				// in <sl-button>${label}</sl-button>, when the <font> of a page translator stands
				// in its place.  The translation stays while the text is unchanged, as it does
				// anywhere else; a new value takes it out and is drawn from nothing.  Testing for
				// <font> keeps the rule narrow: an element that puts the text in a wrapper of its
				// own is still named.
				if (nodes && nodes.length === 1 && was[0] === this.textNode && nodes[0].localName === 'font') {
					if (exprs[0] === this.textValue)
						return;
					this.dropRows(nodes);
				}
				else {
					this.blame(kept.el);

					// Not thrown, so it is Solarite's own doing; see blame().  The path starts over
					// where its end marker now stands: what it drew is taken out, wherever it is,
					// and drawn from nothing.  From then on it is a path like any other in a
					// component's slot, and it is that before its nodes are taken out, which can
					// run code that renders the host.
					kept = this.kept = drawing;
					this.dropRows(was);
				}
			}
		}

		// 3. Draw, and say so meanwhile.  A path that no element was given says so too: the
		// render that builds the element can start inside this draw, and it then leaves the
		// nodes to be read when the draw is done.
		if (kept)
			kept.nodes = null;
		else
			this.kept = drawing;
		try {
			this.applySingle(exprs[0]);
		}
		catch (e) {
			// 4. The error is the caller's to see, as it is.  It may be a mistake in the
			// template, or the element may have reached into a row and taken out a node that
			// only the row's own lists knew of, until one of them tripped over it; the two
			// cannot be told apart.  So nothing this path drew is left standing, nor any row
			// it kept for reuse, which the element may have reached into before it was taken
			// out: the next render draws the expression from nothing.
			//
			// The error of another such element, inside one of this path's rows, is not of
			// that kind.  It was thrown before anything was drawn there, and it is to be
			// thrown by every render until that element has put its nodes back, so the rows
			// stay as they are for the next render to find.
			if (e !== blamed && this.kept.el && this.standing()) {
				this.nodeGroupsDetachedAvailable = null;
				this.dropRows();
			}
			throw e;
		}
		finally {
			// 5. Remember what stands there now, for the next render to compare.  When the
			// place is gone, a render that started inside the draw reached the element and it
			// took the place away.  The nodes the path had are remembered then, which no place
			// will match, and the element's error takes the place of whatever the rest of the
			// drawing threw over the missing nodes.
			kept = this.kept;
			if (kept.el) {
				let nodes = this.standing();
				kept.nodes = nodes || was || emptyNodeGroups;
				if (!nodes)
					this.blame(kept.el);
			}
			else
				this.kept = null;
		}
	}

	/**
	 * Throw the error for an element that changed the nodes this path drew inside it, unless
	 * the change is Solarite's own doing.
	 *
	 * An element that has rendered through Solarite since it was given its children is a
	 * Solarite component, and the render that put them in its slots may have parted them: a
	 * child with a slot attribute goes to the slot of that name and the rest to the unnamed
	 * one.  That render never takes a marker out of the element.
	 * @param el {HTMLElement} The element this path is written inside. */
	blame(el) {
		if (!Globals.rootNodeGroups.has(el) || !el.contains(this.nodeMarker))
			throw blamed = new Error(`Solarite: <${el.localName}> changed the nodes \${...} drew inside it; wrap the \${...} in an element it leaves alone.`);
	}

	/**
	 * Whether this path is all that its element holds, as in `<span>${text}</span>`, drew one
	 * piece of text there, and the Text node is no longer in that element.
	 *
	 * A page translator such as Chrome's does that: it replaces each Text node that has words
	 * in it with `<font>` elements holding the translation.  Writing to the old node would
	 * then change nothing on screen, and drawing something else in its place would leave the
	 * translation standing beside it.  An element that holds one expression and nothing else
	 * has no neighbours to be mistaken for the text, so whatever stands in it can be taken
	 * out and the new value drawn; the callers do that with dropRows().  Text that shares its
	 * element with other nodes has no such guarantee, which is why the documentation says to
	 * give it an element of its own.
	 *
	 * The text is either the path's bare Text node or, after the path has held an array or a
	 * template, the one row it has.
	 * @return {boolean} */
	textReplaced() {
		if (!this.wholeParent)
			return false;
		let node = this.textNode, ngs = this.nodeGroups;
		if (node === null && ngs !== null && ngs.length === 1 && ngs[0].template.isText === true)
			node = ngs[0].startNode;
		return node !== null && node.parentNode !== this.nodeMarker;
	}

	/**
	 * The nodes that stand between this path's two markers, read from the DOM rather than
	 * remembered, or null when the markers no longer enclose a run of siblings.  A path whose
	 * place is the whole inside of an element has no markers to lose, and is never null.
	 *
	 * DOM nodes that the application made and gave as values are left out.  They are the
	 * application's to move, here as anywhere else, so they are not what a path is compared by.
	 * @return {?Node[]} */
	standing() {
		// The path's own list of its nodes is put back: it says what the path placed, which
		// is what the reconciler for raw DOM nodes compares the next values with.
		let cache = this.nodesCache;
		this.nodesCache = null;
		let nodes = this.getNodes();
		this.nodesCache = cache;
		if (!this.wholeParent && (nodes[nodes.length - 1] || this.nodeBefore).nextSibling !== this.nodeMarker)
			return null;
		return this.parentNg.shell.heldRawNodes ? nodes.filter(node => !node[rawOwnerKey]) : nodes;
	}

	/**
	 * Make the DOM between nodeBefore and nodeMarker match the value of expr.
	 * This is the main entry point for rendering an expression's nodes, chosen from three strategies:
	 * 1. A primitive expr updating (or creating) a single text node is handled inline with no allocations.
	 * 2. Otherwise expr is flattened to a list of Templates, strings, and Nodes via collectItems(),
	 *    then applyDiff() positionally diffs them against the previous render's NodeGroups.
	 * 3. If the items contain raw Nodes, now or on the previous render, applyGeneric() uses pooled
	 *    close-key matching and removeNodes()/placeNodes(), since this.nodeGroups can't track raw Nodes positionally.
	 * @param expr {Expr} */
	applySingle(expr) {

		

		// Fast path for a single primitive expression, the most common case in loops.  The
		// typeof tests are written out against literals, as everywhere else in src/, rather than
		// kept in a variable; see childrenArePrimitive() in NodeGroup.js.
		if ((typeof expr === 'string' || typeof expr === 'number') && !this.itemsHaveNodes) {
			if (typeof expr !== 'string')
				expr += '';

			// A primitive leaves no items for a later h.map() to recognize rows by.  Without
			// this, a list of one text row, replaced by plain text and then drawn again from the
			// same items, would look unchanged and keep showing the plain text.
			this.lastItems = null;

			// Update the existing text node.
			let tn = this.textNode;
			if (tn !== null) {
				if (this.textValue !== expr) {
					// A page translator replaces a Text node with elements of its own.  In an
					// element that holds nothing else, what the translator left is taken out and
					// the text is drawn from nothing; see textReplaced().
					if (this.textReplaced()) {
						this.dropRows();
						return this.applySingle(expr);
					}
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
					// Other code, or a row whose paths were just made from a stamped row, can already
					// have left a lone text child here; update it in place.  Node identity is
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
					node = Globals.doc.createTextNode(expr);
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
				let ng = ngs[0];
				if (ng.template.isText === true) {
					if (ng.template.html[0] !== expr) {
						if (this.textReplaced()) {
							this.dropRows();
							return this.applySingle(expr);
						}
						this.rewriteNodeGroup(ng, expr);
					}
					return;
				}
			}
		}

		// A previous primitive render stored a bare text node; wrap it in a NodeGroup so it can be diffed.
		// Text that a page translator replaced is drawn by applyTranslated(), which keeps the
		// translation while the text is unchanged; see textReplaced().  A selector is an error
		// here, which the check below reports.
		if (this.textReplaced() && !(expr instanceof SelectorRef))
			return this.applyTranslated(expr);
		else if (this.textNode !== null) {
			(this.nodeGroups ??= []).push(new NodeGroup(textTemplate(this.textValue), this, this.textNode));
			this.textNode = null;
		}

		// A selection binding only knows how to write an attribute, so catch it here rather than
		// letting it render as an empty string and leave the caller wondering where it went.
		if (expr instanceof SelectorRef)
			throw new Error('Solarite: a selector must own the whole attribute.');

		// 1. h.map() hands over its source items and callback rather than built Templates, so a
		// row whose item is unchanged is recognized without building or looking up a Template.
		if (expr instanceof MappedList) {
			// A row that throws while it is updated leaves the remembered items out of step with
			// the rows: that row, and the rows the render updated before it, show (some of) their
			// new items, while the items are recorded only once every row is drawn.  Trusting
			// them, the next render would keep such a row as its old item's, and could show an
			// item twice.  So they are forgotten, and the next render compares each row's
			// template instead, which says what the row shows (see NodeGroup.keepReached()).  A
			// try costs nothing until something throws.
			try {
				this.applyMapped(expr);
			}
			catch (e) {
				this.lastItems = null;
				throw e;
			}
			
			return;
		}

		// Anything that isn't an h.map() leaves no items to recognize rows by next time.
		this.lastItems = null;

		// 2. Flatten the expression to a list of Templates, strings and Nodes, evaluating functions along the way.
		// A flat array that is entirely Templates — the rows.map(...) shape that list renders
		// produce — is borrowed directly instead of copied.  The borrow lasts only for the
		// rest of this synchronous call:  applyDiff/applyKeyed/applyGeneric read the items and
		// retain only the NodeGroups (and each item's own Template) built from them, never the
		// items array itself, so no reference to the caller's array survives the render.  Keep
		// that invariant — storing newItems on any long-lived object would pin the caller's
		// per-render array until the next render, moving its collection into a later frame.
		/** @type {(Template|string|Node)[]} */
		let newItems = null;
		let hasNodesNow = false;
		if (Array.isArray(expr)) {
			let len = expr.length, i = 0;
			while (i < len && expr[i] instanceof Template)
				i++;
			if (i === len)
				newItems = expr; // Borrowed from the caller; read-only from here on.
		}
		if (newItems === null) {
			newItems = [];
			hasNodesNow = this.collectItems(expr, newItems, false);
		}

		// 3. Raw Nodes in the items (now or on the previous render) can't be diffed positionally
		// because this.nodeGroups only tracks NodeGroups.  Use the generic path for those.
		if (hasNodesNow || this.itemsHaveNodes)
			this.applyGeneric(newItems);
		else if (this.diffItems(newItems)) // See diffItems().
			this.drawAgain(newItems);

		
	}

	/**
	 * applySingle() for a path whose one piece of text a page translator replaced (see
	 * textReplaced()), given anything that takes the slow path: a function, an array, a
	 * boolean, a Date, a template, an h.map() list.
	 *
	 * Such a value takes the slow path on every render, changed or not, so the text it gives is
	 * compared here with the text the path drew.  While the two are the same the translation
	 * stays, as it does for a string given directly (see the fast path), and only a new value
	 * takes out what the translator left and is drawn from nothing.  Flattening the value calls
	 * the functions in it, so it is done once, and the items it gives are the ones drawn.
	 *
	 * Raw DOM nodes beside the text, on the last render, are left where they stand: taking out
	 * the translation would take them out with it and put them back, and an input among them
	 * would lose the focus on every render.  The text then keeps its stale translation, as text
	 * beside other nodes does anywhere.
	 * @param expr {Expr} */
	applyTranslated(expr) {
		this.lastItems = null;
		let items = [], hasNodes = this.collectItems(expr, items, false);
		if (this.itemsHaveNodes)
			this.applyGeneric(items);
		else if (hasNodes || items.length !== 1 || items[0] !== (this.textNode !== null ? this.textValue : this.nodeGroups[0].template.html[0])) {
			this.dropRows();
			this.applySingle(items); // Flat already, so nothing in them is called again.
		}
	}

	/**
	 * Reconcile a flat list of Templates and strings against this path's NodeGroups.
	 * Templates with a key=${} attribute diff by key so node identity follows the data.
	 * An empty list also routes to applyKeyed when the previous render was keyed, so removed
	 * keyed NodeGroups are discarded instead of pooled.  The first item decides; a list whose
	 * first row has no key goes to applyDiff, which hands it to applyKeyed at the first row
	 * with a key that it would otherwise rewrite.
	 *
	 * Taking a row out of the document or putting one in can run code that renders the host
	 * again: the disconnectedCallback or connectedCallback of an element in the row, such as a
	 * tab that tells its tab set.  That render draws the whole list, from this path's rows as
	 * they stand.  So the reconcilers compare this.nodeGroups before and after each such step,
	 * and stop when it changed, taking out the rows they had made and put in, which that render
	 * did not know of (see dropStrays()).  The caller then draws its own list again, from what
	 * that render left; see drawAgain().  A render that starts from a function in a row, while
	 * the row is built, is not one of these, and the render it interrupted carries on.
	 * @param newItems {(Template|string)[]}
	 * @return {boolean|undefined} True when such a render drew the list and this one stopped. */
	diffItems(newItems) {
		let first = newItems.length !== 0 ? newItems[0] : null;
		if (first !== null
			? (typeof first !== 'string' && (first.key !== undefined || Shell.get(first.html, first.svgMode).keyIndex >= 0))
			: (this.nodeGroups !== null && this.nodeGroups.length !== 0 && this.nodeGroups[0].key !== undefined))
			return this.applyKeyed(newItems);
		else
			return this.applyDiff(newItems);
	}

	/**
	 * Render an h.map() list.
	 *
	 * What makes this cheaper than reconciling an array of Templates is that a row still holding
	 * the item it was built from needs no Template at all: it is recognized by one identity
	 * check, with nothing built and nothing compared.  When the list is the same length and only
	 * a few rows changed, that is the whole render — see applyMisses().  Otherwise the walk
	 * follows the offset a shifted list settles on, and finally consults a map from item to the
	 * Template the previous render built, so rows that moved far are still reused.
	 * @param mapped {MappedList} */
	applyMapped(mapped) {
		let items = mapped.items, fn = mapped.fn;
		let len = items.length;
		let oldNgs = this.nodeGroups;
		// Only rows this path drew from an h.map() last time can be recognized by their item;
		// anything else starts over.
		let lastItems = this.lastItems;
		let oldLen = oldNgs === null || lastItems === null || lastItems.length !== oldNgs.length
			? 0 : oldNgs.length;

		// Patch path.  When the list is the same length as last time, every row that still holds
		// the item it was built from is already final: it needs no Template, no comparison and no
		// visit.  So find the positions that did change, build only those, and patch them.  That
		// makes a selection or a partial update cost work proportional to the change instead of
		// to the length of the list.  Rows that must be visited even when unchanged (components,
		// live HTML properties) rule it out, since revisiting them is what the full scan is for.
		let misses = null, missTemplates = null, missCount = 0;
		if (oldLen === len && len !== 0 && !this.anyNeedsRefresh && !this.itemsHaveNodes) {
			let tooMany = false;

			// First find WHICH positions changed, without building anything for them.  A change
			// this path can't handle is then abandoned having cost only comparisons — building
			// as we went would throw away a Template for every row of, say, a reversed list,
			// which the general diff is about to reuse from the previous render.
			misses = [];
			let at = this.collectMisses(lastItems, items, 0, len, misses, missProbeThreshold);
			if (at < len) {
				// Enough of the list has changed to ask what kind of change this is, because
				// the two kinds want opposite treatment.  If the item at this position is
				// somewhere else in the old list, the rows were reordered, and the general
				// diff's item map will reuse their Templates instead of rebuilding them — so
				// stop here and let it.  If the item is new, the rows' contents changed, and
				// there is nothing to reuse: keep going and patch them all, however many there
				// are.  The scan costs one pass over the old rows, once, and only for a list
				// that changed this much.
				if (lastItems.indexOf(items[at]) >= 0)
					tooMany = true; // Nothing was built, so the general path has nothing to reuse.
				else
					this.collectMisses(lastItems, items, at, len, misses, len); // There is no second probe.
			}

			// Now build them.
			if (!tooMany && (missCount = misses.length) !== 0) {
				missTemplates = new Array(missCount);
				let builtCount = this.buildMisses(items, fn, misses, missTemplates, missCount);
				if (this.lastItems !== lastItems) // A callback rendered this list; see below the walk.
					return this.applySingle(mapped);
				if (builtCount !== missCount) { // The callback returned a Node, an array, …
					tooMany = true;
					missCount = builtCount; // Keep the ones already built; the rest are the caller's problem.
				}
			}
			if (!tooMany && (missCount === 0
					|| this.applyMisses(oldNgs, misses, missTemplates, missCount, len, mapped))) {
				for (let k=0; k<missCount; k++) {
					let j = misses[k];
					lastItems[j] = items[j];
				}
				return;
			}
		}

		// Removal path.  A list that only lost one run of rows is settled on the two item arrays
		// alone.  See removeRun().
		if (len !== 0 && len < oldLen && !this.anyNeedsRefresh && !this.itemsHaveNodes
			&& this.removeRun(items, oldNgs, lastItems, oldLen, len))
			return;

		// General path: build the whole list of Templates and hand it to the reconciler.
		let newItems;
		// False once the callback has returned anything but a Template or a string; see where
		// it is read, below.
		let plain = true;
		let b = 0; // How many of the patch scan's Templates the walk below has used.
		// A map from each old item to its position, made when the walk first needs it, and
		// whether the old rows hold anything worth looking up; see where they are used.
		let itemMap = null, moved = true;
		// Walk the two lists together.  A row is recognized by the item it was built from, at the
		// offset the walk has settled on: after an insertion or a removal every later row sits a
		// fixed distance from where it was, and following that keeps recognizing them instead of
		// treating the whole tail as changed.  The short search that re-establishes the offset
		// only runs while the walk is still in step, so a list of genuinely new rows (an append,
		// a replace-all) gives up after one miss rather than searching for every row.  Failing
		// all that, a map from item to the Template the previous render built for it catches
		// rows that moved far — a sort, a shuffle.  It's built on demand, from the rows this
		// path already holds: a persistent per-item cache would instead pay a write for every
		// row of every list ever created, which is most of the work of building a list from
		// scratch, and would hold each Template alive for as long as the caller holds the item.
		// When every position changed and its Template is already built, those Templates are
		// the new list as they stand, and there is nothing to walk.
		if (missCount === len && len !== 0)
			newItems = missTemplates;

		else if (oldLen !== 0) {
			newItems = new Array(len);
			let delta = 0, inSync = true;
			for (let i=0; i<len; i++) {
				let item = items[i];
				let j = i + delta;
				let inRange = j >= 0 && j < oldLen;
				if (inRange && lastItems[j] === item) {
					newItems[i] = keptItem(oldNgs[j]);
					inSync = true;
					// The rows after one that is in step usually are too, so they are kept by a
					// loop of its own; see buildRange() for why.
					
					continue;
				}

				// This position was already found to have changed, and its Template built, by the
				// patch scan above.  That only happens for a same-length list, where the offset
				// stays zero, so there's no search to redo here.
				if (b < missCount && misses[b] === i) {
					newItems[i] = missTemplates[b++];
					continue;
				}

				if (inSync) {
					let found = -1;
					for (let d=1; d<=shiftSearchDistance; d++) {
						let after = j + d, before = j - d;
						if (after < oldLen && lastItems[after] === item) {
							found = after;
							break;
						}
						if (before >= 0 && lastItems[before] === item) {
							found = before;
							break;
						}
					}
					if (found >= 0) {
						delta = found - i;
						newItems[i] = keptItem(oldNgs[found]);
						continue;
					}

					// The item isn't in the old list at all, but the old row standing here
					// belongs to an item a little further along: rows were INSERTED here.  Build
					// this one and shift the offset, so the rest of the list is still recognized.
					// Without this, prepending one row to a long list would look like a change to
					// every row in it.  Only worth asking when the list actually grew.
					if (inRange && len > oldLen)
						for (let d=1; d<=insertSearchDistance && i+d<len; d++)
							if (items[i+d] === lastItems[j]) {
								plain = this.buildRange(items, fn, newItems, i, i + 1) && plain;
								delta--;
								found = -2; // Handled; skip the fallbacks below.
								break;
							}
					if (found === -2)
						continue;

					inSync = false;
				}

				// Past the end of the old list there is nothing left to match, and the offset
				// can't change again because only a match moves it.  So this row and every row
				// after it is new: they all go straight to the callback, with no lookups that
				// must miss.
				if (j >= oldLen) {
					plain = this.buildRange(items, fn, newItems, i, len) && plain;
					break;
				}

				// The row may have moved far, which the item map finds.  One scan comes before
				// paying for the map: if this item is nowhere in the old rows, the list's contents
				// changed rather than moved, so there is nothing to look up and every later miss
				// can go straight to the callback.  A scan is cheaper than a map of every row, and
				// this is the common shape: rows replaced in place.
				if (moved && itemMap === null) {
					if (lastItems.indexOf(item) >= 0) {
						itemMap = new Map();
						for (let k=0; k<oldLen; k++)
							itemMap.set(lastItems[k], k);
					}
					else
						moved = false;
				}
				let from = moved ? itemMap.get(item) : undefined;
				if (from !== undefined) {
					newItems[i] = keptItem(oldNgs[from]);
					delta = from - i; // Back in step; the rest of the list can walk positionally again.
					inSync = true;
					continue;
				}
				plain = this.buildRange(items, fn, newItems, i, i + 1) && plain;
			}
		}

		else
			plain = this.buildRange(items, fn, newItems = new Array(len), 0, len);

		// A callback may have rendered the host again, which drew this whole list from inside
		// the walk above.  Nothing had been written here by then, so that render is complete and
		// correct, but it leaves this one holding the rows and the remembered items it replaced.
		// Carrying on would pair the two wrongly: an unkeyed row that now shows another item
		// would be kept as the row of the item it used to show, and that item drawn twice.
		// A render that rebuilds the list always leaves a new lastItems (or none), so one
		// comparison finds it out, with nothing to set or clear around the callbacks, and this
		// render then starts over from what the other left.  It starts at applySingle() because
		// the other render may have put plain text here instead of a list, which only
		// applySingle() knows how to take over.
		if (this.lastItems !== lastItems)
			return this.applySingle(mapped);

		// The reconcilers draw one row per item, from a Template or a string.  A callback may
		// return anything else an expression can hold, for any item: an array, a raw Node, a
		// nested list, a number, nothing at all.  A list with such a result in it is no longer
		// one row per item, so it is drawn as the plain array of results that it is:
		// applySingle() forgets lastItems, flattens the array and picks the reconciler.  So is
		// one that follows a render which left raw Nodes, since only the generic reconciler
		// can tell those from rows.
		if (!plain || this.itemsHaveNodes)
			return this.applySingle(newItems);

		// A render that started while rows were taken out or put in drew the list; see diffItems().
		if (this.diffItems(newItems))
			return this.drawAgain(mapped);

		// Remember which item drew each row, so the next render can match them by identity.
		// The reconciler leaves nodeGroups aligned with newItems, and therefore with items.
		// The caller's array is copied rather than kept, since the caller mutates it in place.
		// It is read by index up to the length the rows were drawn from, exactly as they were
		// drawn: a list that grew while its callback ran, or an array-like whose iterator
		// disagrees with its indexes, would otherwise be remembered out of step with its rows.
		// It is always a new array, never the previous one rewritten: a render that a callback
		// started is told apart by it above, and the render it interrupted is still reading the
		// previous one.
		this.lastItems = Array.prototype.slice.call(items, 0, len);
	}

	/**
	 * Call fn for items[from] up to items[to-1], storing what it returns at the same index of out.
	 *
	 * This, keepRun() and createRows() are loops that could be written where they are
	 * called.  They are methods of their own because of how a JavaScript engine decides what to
	 * optimize: a function earns faster code by running, and what is counted is how much of
	 * ITSELF it has run.  A loop inside a long function that is called once per render stays in
	 * the engine's slowest tier through a list's whole creation, however many thousand rows it
	 * handles, while the same loop alone in a short function is promoted within its first few
	 * hundred rows.  They are methods rather than plain functions because the minifier never
	 * folds a method into its caller; for plain functions with one caller, such as hOther() or
	 * registerRowDispatchers(), build/build.js turns that folding off (reduce_funcs: false).
	 * @param items {Array}
	 * @param fn {function(*):Template}
	 * @param out {Array}
	 * @param from {int}
	 * @param to {int}
	 * @return {boolean} False when fn returned anything but a Template or a string, which no
	 * reconciler can draw as one row. */
	buildRange(items, fn, out, from, to) {
		let plain = true;
		for (let i=from; i<to; i++) {
			let t = out[i] = fn(items[i]);
			if (!(t instanceof Template) && typeof t !== 'string')
				plain = false;
		}
		return plain;
	}


	/**
	 * Get a NodeGroup for each of items[from] up to items[to-1], store it at the same index of
	 * ngs, and insert its nodes before anchor.
	 * @param items {(Template|string)[]}
	 * @param from {int}
	 * @param to {int}
	 * @param ngs {NodeGroup[]}
	 * @param parent {Node}
	 * @param anchor {?Node} Null appends at the end.
	 * @param pooled {boolean} True to take a detached NodeGroup of the same html from the pool
	 * when there is one.  False for the rows of a keyed list, which are always built new.
	 * @return {boolean|undefined} True when a render of this list started as a row was put in,
	 * and drew the list; see diffItems(). */
	createRows(items, from, to, ngs, parent, anchor, pooled) {
		for (let i=from; i<to; i++) {
			let ng = pooled ? this.createOrReuse(items[i]) : this.createNew(items[i]);
			ngs[i] = ng;
			let list = this.nodeGroups;
			insertNodesBefore(parent, ng, anchor);
			if (this.nodeGroups !== list)
				return this.dropStrays(ngs, from, i + 1);
		}
	}

	/**
	 * Take out those of ngs[from] up to ngs[to-1] that this path's list does not hold, once a
	 * render of the list that started inside the render that made them has drawn the list
	 * without them; see diffItems().  Rows of the old list that the interrupted render moved are
	 * in the other's list too, and stay.
	 * @param ngs {NodeGroup[]}
	 * @param from {int}
	 * @param to {int}
	 * @return {boolean} True, for the caller to return. */
	dropStrays(ngs, from, to) {
		let kept = new Set(this.nodeGroups);
		for (let i=from; i<to; i++)
			if (ngs[i] && !kept.has(ngs[i]))
				detachNodes(ngs[i]);
		return true;
	}

	/**
	 * Draw expr once more, after a render of this list that started while a row was taken out
	 * or put in drew the list itself; see diffItems().  The render that was interrupted draws
	 * its own list, from what the other left, as it does when a function in a row renders the
	 * host (see applyMapped() and applyGeneric()).  The items remembered for h.map() are
	 * forgotten first: the other render recognized rows by them while some rows already showed
	 * other items, so they may not say what each row shows, and the templates do.
	 *
	 * It draws again once.  A row that renders the host every time it leaves or enters the
	 * document could otherwise be answered by drawing again for ever; when this render is
	 * interrupted in its turn, the list the newest render drew is left as it is.
	 * @param expr {Expr}
	 * @return {boolean} True, for the caller to return. */
	drawAgain(expr) {
		this.lastItems = null;
		if (drawingAgain !== this) {
			let was = drawingAgain;
			drawingAgain = this;
			try {
				this.applySingle(expr);
			}
			finally {
				drawingAgain = was;
			}
		}
		return true;
	}

	/**
	 * Settle an h.map() list that differs from the last render only by one contiguous run of
	 * rows having been removed: a row deleted, a selection of adjacent rows deleted, a list cut
	 * short.  Every other row is still drawn from the same item.
	 *
	 * The general diff would build an array of every row's Template and hand it to the
	 * reconciler, whose scans then read each NodeGroup to learn that it is unchanged.  A thousand
	 * NodeGroups are scattered over the heap, so that is a thousand cache misses to remove one
	 * row.  Here the unchanged rows are recognized by comparing the two item arrays from both
	 * ends, which touches no NodeGroup, and only the rows of the run are visited.  The caller
	 * rules out rows that need a visit even when unchanged (anyNeedsRefresh).
	 *
	 * A removed row that has a key is discarded, as keyed semantics require, and so is one that
	 * has held a raw Node (see Shell.heldRawNodes); any other goes to the pool the positional
	 * diff keeps, exactly as that diff would have left it.
	 *
	 * A run of rows that arrived is deliberately not handled the same way.  It was measured:
	 * the rows still have to be built, which is nearly all of the work, and the general path
	 * builds them in the loop that every list created from empty has already made hot.
	 *
	 * @param items {Array} The new items.
	 * @param ngs {NodeGroup[]} This path's NodeGroups, cut in place.
	 * @param lastItems {Array} The items the last render drew, aligned with ngs; cut in place.
	 * @param oldLen {int}
	 * @param len {int} Shorter than oldLen, and not zero.
	 * @return {boolean} False when the change is not one removed run; nothing has been
	 * modified in that case. */
	removeRun(items, ngs, lastItems, oldLen, len) {

		// 1. The rows both lists share at the front and at the back.  Together they must account
		// for the whole of the new list.
		let start = firstDiff(lastItems, items, 0, len, 0);
		let count = oldLen - len;
		if (firstDiff(lastItems, items, start, len, count) !== len)
			return false;

		// 2. Take the run out.  When several rows go, the node list of each row of several nodes
		// is read first, while the rows still stand together: taking a row out can run code (the
		// disconnectedCallback of an element inside it) that renders this list again and removes
		// the rows still waiting here one node at a time, and a row is kept for reuse whole only
		// if its nodes were listed before that.
		let removed = ngs.splice(start, count);
		lastItems.splice(start, count);
		if (count > 1)
			for (let i=0; i<count; i++) {
				let ng = removed[i];
				if (ng.startNode !== ng.endNode)
					ng.getNodes();
			}
		for (let i=0; i<count; i++) {
			let ng = removed[i];
			detachNodes(ng);
			if (ng.key === undefined && !ng.template.isText && !ng.shell.heldRawNodes)
				(this.nodeGroupsDetachedAvailable ??= new MultiValueMap()).addCapped(ng.closeKey, ng, maxPooledPerKey);
		}

		// 3. Node membership changed, so invalidate caches.
		if (!this.parentNg.firstApply) {
			this.nodesCache = null;
			if (this.parentNg.parentPath)
				this.parentNg.parentPath.clearNodesCache();
		}

		// Keep state used by the generic path from going stale.  A render that starts inside
		// this one, from the disconnectedCallback of an element in a removed row, can put raw
		// Nodes where the list is, which leaves the rows it took out in this pool.
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
		return true;
	}

	/**
	 * Patch only the positions an h.map() render changed, leaving every other row alone.
	 *
	 * Every unchanged position already holds the NodeGroup built from that exact item, so it
	 * needs no visit at all; only the changed positions can require a rewrite, a move, or a new
	 * row.  Changed positions are handled in two steps, the same shape as the general keyed
	 * diff's small-reorder path: first the ones that kept their key (a row whose data changed
	 * in place), then the leftovers are cross-matched against each other by key so a swap or a
	 * short shuffle moves the fewest node ranges.
	 *
	 * @param ngs {NodeGroup[]} This path's NodeGroups, patched in place.
	 * @param misses {int[]} Positions whose item changed, ascending.
	 * @param templates {(Template|string)[]} The new Template for each of those positions.
	 * @param missCount {int}
	 * @param len {int} Length of the list, for anchoring the last position.
	 * @param mapped {MappedList} The list being drawn, to draw again; see diffItems().
	 * @return {boolean} False when the change doesn't fit this path and the caller must run
	 * the general diff instead; nothing has been modified in that case. */
	applyMisses(ngs, misses, templates, missCount, len, mapped) {

		// Only a keyed list can move rows around safely.  An unkeyed one can still be rewritten
		// in place, which is what the positional diff would do for it anyway.
		let keyed = ngs[0].key !== undefined;

		// 1. Classify the changed positions without touching anything, so that a change too big
		// for this path can still be handed to the general diff with nothing half-applied.
		// A row that kept its key is rewritten where it stands; the rest have to be matched
		// against each other, and past a handful of those the general diff's map-and-LIS
		// approach is the better tool.  A row that has a key, in a list whose first row has none
		// (a string, a heading without a key), is not rewritten for another item either: the
		// general diff gives such a list to the keyed diff (see applyDiff()).
		let displaced = null, dCount = 0;
		for (let k=0; k<missCount; k++) {
			let ng = ngs[misses[k]], t = templates[k];
			if (typeof t === 'string' || !itemClose(ng, t) || (keyed ? ng.key !== keyOf(t) : ng.key !== undefined)) {
				if (!keyed || dCount === maxDisplacedMisses)
					return false;
				(displaced ??= [])[dCount++] = k;
			}
		}

		// 2. Rewrite the rows that kept their key.  displaced holds indexes into misses in
		// ascending order, so one pointer walks past them.
		for (let k=0, d=0; k<missCount; k++) {
			if (d < dCount && displaced[d] === k) {
				d++;
				continue;
			}
			let ng = ngs[misses[k]], t = templates[k];

			// A stamped row, which has no paths of its own, is rewritten by its shell's compiled
			// program, so the program is run from here; this loop runs once for every row a
			// partial update changes, and a function call apiece is a large share of what is left
			// once the row's own writes are down to the ones that changed.  This is
			// rewriteNodeGroup() for such a row, less two steps that cannot apply to it: a
			// stampable shell has no embedded styles to update (it is single-root, which
			// excludes embeds), and a row that is one element has no node list to invalidate.
			// Keep the two in step.
			if (ng.paths === null && ng.shell.pathsSingleExpr && ng.rewriteStamp(t)) {
				ng.firstApply = false;
				ng.template = t;
				if (t.key !== undefined) // JSX keyed item; keep ng.key in sync with the new template.
					ng.key = t.key;
			}

			// A row whose paths each take one expression compares every expression as it
			// rewrites and writes only what changed, so asking first whether the whole template
			// is unchanged would compare everything twice; and its item did change, so it
			// rarely is.  Other rows still get the question, since a full re-apply costs more.
			else if (ng.shell.pathsSingleExpr || !itemSame(ng, t))
				this.rewriteNodeGroup(ng, t);
			else
				this.refreshSameItem(ng, t);
		}
		if (dCount === 0)
			return true;

		// 3. Hand the displaced rows to the shared placer.  displaced holds indexes into misses
		// and templates, so misses is what maps a row to its position in the list.  The items
		// are put aside while it takes rows out and puts them in (see diffItems()): a render
		// that starts meanwhile then draws the list by the general diff, which gives it a new
		// list of rows and so is noticed, rather than by this shortcut, which would change these
		// same rows in place with no sign of it.
		let lastItems = this.lastItems;
		this.lastItems = null;
		if (this.placeDisplaced(displaced, misses, ngs, templates, ngs, len,
				this.wholeParent ? null : this.nodeMarker,
				this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode))
			return this.drawAgain(mapped);
		this.lastItems = lastItems;

		// 4. Node membership or order changed, so invalidate caches.
		if (!this.parentNg.firstApply) {
			this.nodesCache = null;
			if (this.parentNg.parentPath)
				this.parentNg.parentPath.clearNodesCache();
		}

		// Keep state used by the generic path from going stale.  This is not dead code: a render
		// that starts inside this one, from a function in a row that is rewritten or created,
		// can put raw Nodes where the list is, which leaves the rows it took out in this pool.
		// placeDisplaced() has since put some of them back in the DOM, and a row must not be
		// in the DOM and in a pool at once: the next time it is removed nothing keeps its nodes
		// together, and a later render would draw it in pieces.  The test
		// Solarite.map.reentrantRawNodesMovedRows fails without it.
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
		return true;
	}

	/**
	 * Add to misses every position from i on whose item is not the one the previous render drew
	 * there, in ascending order, until misses holds cap positions.
	 *
	 * This and buildMisses() are loops that could be written where they are called.  They are
	 * methods of their own because of how a JavaScript engine decides what to optimize: a
	 * function earns faster code by running, and what is counted is how much of ITSELF it has
	 * run.  A loop over every row, inside a long function that is called once per render, stays
	 * in the engine's slowest tier for a long time, while the same loop alone in a short function
	 * is promoted within its first few hundred rows.
	 * @param lastItems {Array} The items the previous render drew.
	 * @param items {Array} The items of this render, the same length.
	 * @param i {int} Where to start.
	 * @param len {int}
	 * @param misses {int[]} Receives the positions.
	 * @param cap {int}
	 * @return {int} len when the whole list was scanned; otherwise the changed position that
	 * misses had no room for. */
	collectMisses(lastItems, items, i, len, misses, cap) {
		for (; i<len; i++)
			if (lastItems[i] !== items[i]) {
				if (misses.length === cap)
					return i;
				misses.push(i);
			}
		return len;
	}

	/**
	 * Call fn for the item at each of the first count positions in misses, storing the Templates
	 * (or strings) it returns in out.
	 * @param items {Array}
	 * @param fn {function(*):Template}
	 * @param misses {int[]}
	 * @param out {(Template|string)[]}
	 * @param count {int}
	 * @return {int} count, or how many were stored before fn returned something else, which the
	 * patch path can't place. */
	buildMisses(items, fn, misses, out, count) {
		for (let k=0; k<count; k++) {
			let t = fn(items[misses[k]]);
			if (!(t instanceof Template) && typeof t !== 'string')
				return k;
			out[k] = t;
		}
		return count;
	}



	/**
	 * Record in map, under its key, the position of each of items[from] up to items[to-1].
	 * A loop of its own for the reason given at collectMisses().
	 * @param items {(Template|string)[]}
	 * @param from {int}
	 * @param to {int}
	 * @param map {Map<*, int>} */
	indexKeys(items, from, to, map) {
		for (let i=from; i<to; i++) {
			let t = items[i];
			if (typeof t !== 'string')
				map.set(keyOf(t), i);
		}
	}

	/**
	 * Find the first of ngs[from] up to ngs[to-1] whose key is in map.
	 * @param ngs {NodeGroup[]}
	 * @param from {int}
	 * @param to {int}
	 * @param map {Map<*, int>}
	 * @return {int} Its position, or to when there is none. */
	firstKeyIn(ngs, from, to, map) {
		for (let i=from; i<to; i++) {
			let key = ngs[i].key;
			if (key !== undefined && map.has(key))
				return i;
		}
		return to;
	}

	/**
	 * Settle a handful of rows that moved, appeared or vanished within one window of a list.
	 *
	 * Both small-reorder paths — the h.map() patch in applyMisses and the equal-length window in
	 * applyKeyed — reach the same point: a few positions whose old NodeGroup no longer belongs
	 * where it stands, everything around them already correct.  Since every candidate came from
	 * this same window, a swap, a dragged row or a short shuffle finds its partners inside it, so
	 * the rows are cross-matched against each other by key rather than through the general
	 * diff's key map and longest-increasing-subsequence machinery.
	 *
	 * rows holds ascending indexes into items, which is the array each caller already has; when
	 * those indexes are not themselves list positions, positions maps them across.  Doing the
	 * indirection here rather than compacting it away in the caller keeps this off the allocation
	 * path: neither caller builds an array it wasn't building already.  rows.length is small by
	 * construction (at most maxDisplacedMisses), which is what makes the O(n²) cross-match
	 * cheaper than building a map.
	 *
	 * @param rows {int[]} Ascending indexes of the rows to settle.
	 * @param positions {int[]|null} Maps a row index to its list position, or null when the row
	 *   indexes are already positions.
	 * @param oldNgs {NodeGroup[]} Where each position's outgoing NodeGroup is read from.
	 * @param items {(Template|string)[]} The new items, indexed by row index.
	 * @param outNgs {NodeGroup[]} Receives the NodeGroup that ends up at each position.  May be
	 *   the same array as oldNgs; the outgoing groups are snapshotted before anything is written.
	 * @param boundary {int} First position past this window, where the anchor stops being
	 *   outNgs[p+1] and becomes tailAnchor.
	 * @param tailAnchor {Node|null} Anchor for a row placed at boundary-1.
	 * @param parent {Node} Where the rows' nodes live.
	 * @return {boolean|undefined} True when a render of this list started as a row was taken
	 * out or put in, and drew the list; see diffItems(). */
	placeDisplaced(rows, positions, oldNgs, items, outNgs, boundary, tailAnchor, parent) {
		let count = rows.length;

		// 1. Cross-match the rows against each other by key.  A claimed NodeGroup is nulled out
		// of the snapshot so it can't be claimed twice.
		let free = new Array(count);
		for (let b=0; b<count; b++) {
			let i = rows[b];
			free[b] = oldNgs[positions === null ? i : positions[i]];
		}
		let placed = new Array(count);
		for (let a=0; a<count; a++) {
			let t = items[rows[a]];
			let key = keyOf(t);
			if (key !== undefined)
				for (let b=0; b<count; b++) {
					let ng = free[b];
					if (ng !== null && ng.key === key && itemClose(ng, t)) {
						free[b] = null;
						if (itemSame(ng, t))
							this.refreshSameItem(ng, t);
						else
							this.rewriteNodeGroup(ng, t);
						placed[a] = ng;
						break;
					}
				}
		}

		// 2. Discard the old rows nothing claimed.  Keyed semantics require a new key to get new
		// nodes, so these are never pooled.
		let list = this.nodeGroups;
		for (let b=0; b<count; b++) {
			let ng = free[b];
			if (ng !== null) {
				detachNodes(ng);
				if (this.nodeGroups !== list)
					return true;
			}
		}

		// 3. Put the rows in place, right to left so each one's anchor is already final.  The
		// row after each is the one placed before it, when that is at the next position, and
		// otherwise one that stays.  outNgs is written only once every row stands in its place:
		// it can be this path's own list, which a render that starts while a row is put in must
		// find as it was.
		for (let a=count-1; a>=0; a--) {
			let i = rows[a];
			let p = positions === null ? i : positions[i];
			let ng = placed[a];
			if (ng === undefined)
				try {
					ng = placed[a] = this.createNew(items[i]);
				}
				catch (e) {
					// The rows to its right are already in place and the ones it replaces are
					// gone, and nothing records either yet.  See dropRows().
					this.dropRows();
					throw e;
				}
			let next = a+1 < count && (positions === null ? rows[a+1] : positions[rows[a+1]]) === p+1 ? placed[a+1] : p+1 < boundary ? outNgs[p+1] : null;
			let anchor = next !== null ? next.startNode : tailAnchor;
			if (ng.endNode.nextSibling !== anchor || ng.startNode.parentNode !== parent) {
				list = this.nodeGroups;
				insertNodesBefore(parent, ng, anchor);
				if (this.nodeGroups !== list)
					return this.dropStrays(placed, a, count);
			}
		}
		for (let a=0; a<count; a++) {
			let i = rows[a];
			outNgs[positions === null ? i : positions[i]] = placed[a];
		}
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
			if (ng.shell.needsRefresh)
				this.refreshSameItem(ng, t);
			newNgs[start] = ng;
			start++;
		}

		// 2. Keep the matching suffix.  This makes removing items from the middle cheap.
		while (oldEnd > start && newEnd > start) {
			let ng = oldNgs[oldEnd-1], t = newItems[newEnd-1];
			if (!itemSame(ng, t))
				break;
			if (ng.shell.needsRefresh)
				this.refreshSameItem(ng, t);
			newNgs[--newEnd] = ng;
			oldEnd--;
		}

		// 3. Aligned middle scan: keep unchanged NodeGroups, rewrite same-shape ones in place.
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			if (itemSame(ng, t)) { // Can happen between changed rows, e.g. partial updates.
				if (ng.shell.needsRefresh)
					this.refreshSameItem(ng, t);
			}

			// A row that has a key, in a list that came here because its first row has none: a
			// string, a row an h.map() callback hid by returning null, a heading written without
			// a key.  Rewriting the row in place would give its element to another key, so the
			// keyed diff takes the list over, from the rows as they stand.  Nothing has moved
			// yet, and the rows rewritten so far have no key and their new templates, which the
			// keyed diff finds already in place.  Rows above that hold a component are asked to
			// render once more there.  The check is made here, at the first row that changed,
			// so that a list without keys pays nothing for it until a row of it changes in place.
			else if (ng.key !== undefined)
				return this.applyKeyed(newItems);
			else if (itemClose(ng, t))
				this.rewriteNodeGroup(ng, t);
			else
				break; // Different html at this position.  Remove/insert the remaining window below.
			newNgs[start] = ng;
			start++;
		}

		let oldRemain = oldEnd - start, newRemain = newEnd - start;
		if (oldRemain || newRemain) {
			let list = this.nodeGroups;

			// 4. Remove leftover old NodeGroups.
			if (oldRemain) {
				// Materialize node caches of multi-node groups while still attached,
				// since detaching breaks sibling links.  Single-node groups don't need it.
				for (let i=start; i<oldEnd; i++) {
					let ng = oldNgs[i];
					if (ng.startNode !== ng.endNode)
						ng.getNodes();
				}

				// Fast clear when removing everything.  The rows are all taken out before any is
				// kept for reuse: a render that starts as one is taken out (see diffItems()) keeps
				// those it finds taken out itself, and a row must not be in the pool twice.
				let cleared = newLen === 0 && start === 0 && this.fastClear();
				if (!cleared)
					for (let i=start; i<oldEnd && this.nodeGroups === list; i++)
						detachNodes(oldNgs[i]);
				if (this.nodeGroups !== list)
					return true;
				let pool = this.nodeGroupsDetachedAvailable ??= new MultiValueMap();
				for (let i=start; i<oldEnd; i++) {
					let ng = oldNgs[i];
					if (cleared && ng.startNode !== ng.endNode)
						Util.saveOrphans(ng.getNodes()); // Moves the nodes out of the DOM, into their own fragment.
					// A row with a key is discarded, as in the keyed diff: a list whose first row
					// is a string or has no key is reconciled here even when later rows have
					// keys, and a key that comes back must still get new nodes.  So is a row that
					// has held a raw Node, which it may not have any more; see Shell.heldRawNodes.
					if (!ng.template.isText && ng.key === undefined && !ng.shell.heldRawNodes)
						pool.addCapped(ng.closeKey, ng, maxPooledPerKey);
				}
			}

			// 5. Insert leftover new items directly.  Each row is one native insert; a
			// batching DocumentFragment would double the insert count for no benefit,
			// since style/layout work is deferred until the next frame either way.
			if (newRemain) {
				let anchor = newEnd < newLen ? newNgs[newEnd].startNode : (this.wholeParent ? null : this.nodeMarker);
				let parent = this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
				try {
					if (this.createRows(newItems, start, newEnd, newNgs, parent, anchor, true))
						return true;
				}
				catch (e) {
					this.dropRows();
					throw e;
				}
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

		

		let start = 0, oldEnd = oldLen, newEnd = newLen;

		// 1. Keep the matching prefix in place, rewriting changed content.  The rows that are
		// already final, which after an append or a removal is nearly all of them, are passed
		// over by a loop of its own (see collectMisses() for why); the loop here takes over at
		// the first row that needs anything done.
		
		while (start < oldEnd && start < newEnd) {
			let ng = oldNgs[start], t = newItems[start];
			// An identical Template instance (h.map) implies an identical key, so skip key extraction.
			if (ng.template === t) {
				if (ng.shell.needsRefresh)
					this.refreshSameItem(ng, t);
			}
			// A string has no key to follow, so its row is kept only while it shows that text.
			else if (typeof t === 'string' ? !itemSame(ng, t) : ng.key !== keyOf(t) || !itemClose(ng, t))
				break;
			else if (itemSame(ng, t))
				this.refreshSameItem(ng, t);
			else
				this.rewriteNodeGroup(ng, t);
			newNgs[start] = ng;
			start++;
		}

		// 2. Keep the matching suffix, the same way.
		
		while (oldEnd > start && newEnd > start) {
			let ng = oldNgs[oldEnd-1], t = newItems[newEnd-1];
			if (ng.template === t) {
				if (ng.shell.needsRefresh)
					this.refreshSameItem(ng, t);
			}
			else if (typeof t === 'string' ? !itemSame(ng, t) : ng.key !== keyOf(t) || !itemClose(ng, t))
				break;
			else if (itemSame(ng, t))
				this.refreshSameItem(ng, t);
			else
				this.rewriteNodeGroup(ng, t);
			newNgs[--newEnd] = ng;
			oldEnd--;
		}

		let oldRemain = oldEnd - start, newRemain = newEnd - start;
		if (oldRemain || newRemain) {
			// this.wholeParent is read where it is needed, here and in the other list methods,
			// rather than kept in a local: spelled one way everywhere, the two expressions it
			// appears in (the parent and the tail anchor) compress as repeats.
			let parent = this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;

			// 3a. Equal-length windows: scan them aligned.  Rows whose keys match positionally
			// are updated in place with no bookkeeping, and when at most 8 positions are
			// displaced (a swap, a dragged row, a small shuffle) they're cross-matched and
			// moved directly — no key map, no sources array, no LIS.  A bigger shuffle falls
			// through to the general map phase; the in-place updates already done stay valid
			// there, since the map phase finds those rows already matching their new items.
			let fastHandled = false;
			if (oldRemain === newRemain) {
				let displaced = null;
				let ok = true;
				for (let i=start; i<newEnd; i++) {
					let ng = oldNgs[i], t = newItems[i];
					if (ng.template === t) {
						if (ng.shell.needsRefresh)
							this.refreshSameItem(ng, t);
					}
					else {
						let k = keyOf(t);
						if (k !== undefined && ng.key === k && itemClose(ng, t)) {
							if (itemSame(ng, t))
								this.refreshSameItem(ng, t);
							else
								this.rewriteNodeGroup(ng, t);
						}
						else {
							(displaced ??= []).push(i);
							if (displaced.length > 8) {
								ok = false;
								break;
							}
							continue; // newNgs[i] is filled during the placement pass below.
						}
					}
					newNgs[i] = ng;
				}
				if (ok) {
					// The windows are the same length, so a displaced row's index is already its
					// position and no position map is needed.  The tail anchor is the suffix row
					// just past this window, which placement never writes to — it only fills
					// positions below newEnd — so it is computed once here instead of on every
					// pass around the placement loop.
					if (displaced !== null && this.placeDisplaced(displaced, null, oldNgs, newItems, newNgs, newEnd,
							newEnd < newLen ? newNgs[newEnd].startNode : (this.wholeParent ? null : this.nodeMarker),
							parent))
						return true;
					fastHandled = true;
				}
			}

			if (!fastHandled) {

			// 3. Match the middle windows by key.
			let kept = 0, moved = false;
			let sources = null; // sources[i] = old index reused by new item start+i, or -1 to create fresh.
			let removals = null;
			let noneKept = false; // True when the old window shares no key with the new one.
			if (oldRemain) {
				if (newRemain) {
					let keyToNewIndex = new Map();
					this.indexKeys(newItems, start, newEnd, keyToNewIndex);

					// A list whose rows were all replaced, such as the next page of a table, has
					// no old key among the new ones.  Finding that out first, with nothing but
					// lookups, lets the whole old window be removed the way an emptied list is:
					// by the fast clear below, with no per-row bookkeeping to throw away.
					if (this.firstKeyIn(oldNgs, start, oldEnd, keyToNewIndex) === oldEnd)
						noneKept = true;
					else {
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
								if (itemSame(ng, t))
									this.refreshSameItem(ng, t);
								else
									this.rewriteNodeGroup(ng, t);
								newNgs[newIndex] = ng;
							}
							else
								(removals ??= []).push(ng);
						}
					}
				}
				// else: the whole old window goes away.  It isn't collected into an array here,
				// because the fast clear below usually takes every one of them at once and the
				// array would be built only to be thrown away.
			}

			// 3b. A large whole-parent list that is being fully replaced is emptied and refilled
			// with its parent detached, so the browser's connected-tree bookkeeping (child-change
			// notifications, tree-version bumps, MutationObserver interest walks, deferred
			// accessibility and style consumers) runs once at reattach instead of once per row
			// removed and once per row added.  Detaching before the clear, rather than after it,
			// puts the removals on the cheap side of that line as well.  The gates: the whole
			// region is being replaced, so nothing is kept and no focus can survive inside it;
			// the parent is a plain element, since detaching a custom element would fire its
			// disconnected/connectedCallback in the middle of a render and a subclass may run
			// arbitrary logic there; the parent is in the document, since the notification storm
			// only exists on a connected tree; and the list is long enough for the saving to beat
			// the fixed cost of the detour and the extra MutationObserver records it creates.
			let detachedFrom = null, reattachBefore = null, list = this.nodeGroups;
			if (this.wholeParent && start === 0 && newEnd === newLen && kept === 0 && newRemain > 500
				&& parent.isConnected && parent.parentNode !== null
				&& parent.localName.indexOf('-') === -1 && !parent.hasAttribute('is')) {
				detachedFrom = parent.parentNode;
				reattachBefore = parent.nextSibling;
				parent.remove();
			}

			// A row can throw while it is created (an event attribute given something that isn't
			// a function, a component whose constructor fails).  Two things must hold whatever
			// happens: a parent that was taken out of the document goes back, and no row is left
			// in the DOM that this path doesn't know about, or the next render would draw the
			// list again next to it.  See dropRows().
			try {

			// Taking the parent out of the document, and taking rows out, can run code that
			// renders this list; see diffItems().
			if (this.nodeGroups !== list)
				return true;

			// 4. Remove unmatched old NodeGroups.  They're discarded, never pooled,
			// so a later render with new keys always creates new nodes.
			let removeAll = oldRemain !== 0 && (newRemain === 0 || noneKept);
			if (removals !== null || removeAll) {
				// Fast clear when nothing is kept anywhere; the whole region is removals.  Trying
				// it first means a cleared list skips the pass below entirely: that exists to
				// lift each group's nodes out one at a time, and emptying the parent has
				// already taken all of them.  A group's nodes are read while they are still
				// attached, by detachNodes() itself: taking one group out leaves the next
				// group's nodes beside each other.
				if (!(start === 0 && newEnd === newLen && kept === 0 && this.fastClear())) {
					if (removeAll)
						removals = oldNgs.slice(start, oldEnd);
					for (let ng of removals) {
						detachNodes(ng);
						if (this.nodeGroups !== list)
							return true;
					}
				}
				if (this.nodeGroups !== list)
					return true;
			}

			// 5. Insert new NodeGroups and move kept ones.
			if (newRemain) {
				let anchor = newEnd < newLen ? newNgs[newEnd].startNode : (this.wholeParent ? null : this.nodeMarker);

				// 5a. Nothing kept in the middle: insert every new item directly.
				// Each row is one native insert; routing rows through a batching
				// DocumentFragment would double the insert count for no benefit, since
				// style/layout work is deferred until the next frame either way.
				if (kept === 0) {
					if (this.createRows(newItems, start, newEnd, newNgs, parent, anchor, false))
						return true;
				}

				// 5b. Mixed: iterate backwards so each item's anchor is already in place.
				// Kept NodeGroups on a longest increasing subsequence of old positions stay still;
				// everything else moves or is created.
				else {
					let lis = moved ? longestIncreasingSubsequence(sources) : null;
					let lisPos = lis !== null ? lis.length - 1 : -1;
					for (let i=newEnd-1; i>=start; i--) {
						let ng = newNgs[i], move = true;
						// Asked of sources rather than of newNgs, which can still hold a row that
						// step 3a kept before it gave up and that step 3 has since removed.
						if (sources[i-start] === -1) // Create and insert.
							newNgs[i] = ng = this.createNew(newItems[i]);
						else if (lis === null)
							move = false;
						else if (lisPos >= 0 && lis[lisPos] === i - start) {
							lisPos--; // Part of the stable subsequence; doesn't move.
							move = false;
						}
						if (move) {
							list = this.nodeGroups;
							insertNodesBefore(parent, ng, anchor);
							if (this.nodeGroups !== list)
								return this.dropStrays(newNgs, i, newEnd);
						}
						anchor = ng.startNode;
					}
				}
			}

			}
			catch (e) {
				this.dropRows();
				throw e;
			}
			finally {
				if (detachedFrom !== null) {
					list = this.nodeGroups;
					detachedFrom.insertBefore(parent, reattachBefore);
				}
			}
			if (detachedFrom !== null && this.nodeGroups !== list) // Putting the parent back runs code too.
				return this.dropStrays(newNgs, start, newEnd);

			} // end if (!fastHandled)

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
		if (this.nodeGroupsAttachedAvailable)
			this.nodeGroupsAttachedAvailable = null;
	}

	/**
	 * Take every row of this path out of the DOM and forget them all, after a row threw while
	 * the list was being reconciled.
	 *
	 * At that point some new rows are in place, some are not, and rows that were to be kept
	 * may stand in either their old or their new order, so no list of rows this path could
	 * keep would match the DOM.  Starting the list over is the one state that is certainly
	 * consistent: the error still reaches the caller, and the next render draws every row.
	 *
	 * The rows are found by reading the DOM between this path's two markers, not by walking
	 * the old and new rows: a row this render already removed and kept for reuse has its
	 * nodes in a fragment of their own, and must be left in one piece there.
	 *
	 * A row may have rendered its host while the list was being drawn, and that render may
	 * have put plain text or raw Nodes here.  Those are taken out with the rows, so the text
	 * node is forgotten too.  So is the pool of rows which that render offered for reuse: the
	 * render it interrupted may have put some of them back in the DOM, where they are about
	 * to be taken apart.
	 *
	 * Everything is forgotten before anything is taken out, because taking a node out can run
	 * code as well: the disconnectedCallback of an element in a row.  If that renders the
	 * host, it has to find an empty list here, and what it draws is the list from then on.
	 * Forgetting afterwards would leave its rows in the DOM with nothing recording them, and
	 * the next render would draw the list a second time beside them.
	 * @param nodes {Node[]=} The nodes to take out, when they are no longer all between the
	 * two markers; see applyAll(). */
	dropRows(nodes) {
		this.nodeGroups = null;
		this.lastItems = null;
		this.textNode = null;
		this.nodeGroupsAttachedAvailable = null;
		this.nodesCache = null; // So that getNodes() reads the DOM as it stands.
		if (nodes || !this.fastClear())
			for (let node of nodes || this.getNodes())
				node.remove();
		this.nodesCache = null;
		if (this.parentNg.parentPath)
			this.parentNg.parentPath.clearNodesCache();
	}

	/**
	 * Create a NodeGroup for an item, never taking one from a pool.  Every new row of a keyed
	 * list is made here, because keyed semantics require new keys to get new nodes, and so is
	 * a row of the generic reconciler once its pools have nothing of that html to offer.
	 * @param item {Template|string}
	 * @return {NodeGroup} */
	createNew(item) {
		if (typeof item === 'string')
			return new NodeGroup(textTemplate(item), this); // Text NodeGroups have no paths to apply.
		let ng = new NodeGroup(item, this);
		if (ng.shell.needsRefresh)
			this.anyNeedsRefresh = true;
		if (item.exprs.length || (ng.paths && ng.paths.length))
			ng.applyExprs(item.exprs);
		return ng;
	}

	/**
	 * Refresh a NodeGroup whose new template has the SAME values as its current one.
	 * Components still render so changes deeper in the tree can surface, and groups holding
	 * live-HTML-property bindings (checked/value/selected) rewrite in place — a user's click
	 * flips those DOM properties underneath the cached expression, so same values ≠ same DOM.
	 * rewriteNodeGroup's per-path skip exempts exactly those paths; everything else is
	 * compared and skipped as before, so this stays cheap.
	 * @param ng {NodeGroup}
	 * @param t {Template|string} */
	refreshSameItem(ng, t) {
		let shell = ng.shell;
		if (shell.hasComponentPaths)
			ng.applyExprs(t.exprs, false);
		else if (shell.hasLivePropPaths && shell.pathsSingleExpr && typeof t !== 'string')
			this.rewriteNodeGroup(ng, t);
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
			if (ng.shell.pathsSingleExpr) {
				// Stamped groups (paths === null) rewrite through the shared stampers and stay
				// path-less, unless a child-node expression stopped being primitive.
				// applyMisses() carries its own copy of this stamped-row case; keep them in step.
				if (ng.paths !== null || !ng.rewriteStamp(item)) {
					let oldExprs = ng.template.exprs, newExprs = item.exprs;
					let paths = ng.paths ?? ng.materializePaths();
					for (let i = paths.length - 1; i >= 0; i--) {
						// Boolean live-HTML-property bindings are exempt from the unchanged-value
						// skip — a click flips the property underneath the cached expression;
						// applySingle() compares against the live node before writing.
						let oldExpr = oldExprs[i], newExpr = newExprs[i];
						if ((oldExpr !== newExpr && !exprSame(oldExpr, newExpr))
							|| (paths[i].isHtmlProperty && typeof newExpr === 'boolean'))
							try {
								paths[i].applySingle(newExpr);
							}
							catch (e) {
								// The template is assigned below, once everything is applied; a row
								// that stops here gets one saying how far it got.
								ng.keepReached(item, i);
								throw e;
							}
					}
				}

				if (ng.styles)
					ng.updateStyles();
				ng.nodesCache = null;
				ng.firstApply = false;
			}
			else
				ng.applyExprs(item.exprs);
			ng.template = item;
			if (item.key !== undefined) // JSX keyed item; keep ng.key in sync with the new template.
				ng.key = item.key;
		}
	}

	/**
	 * Create a NodeGroup for an item, reusing a detached one with the same html if available.
	 * @param item {Template|string}
	 * @return {NodeGroup} */
	createOrReuse(item) {
		if (typeof item === 'string')
			return new NodeGroup(textTemplate(item), this); // Text NodeGroups have no paths to apply.
		let ng;

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
		if (ng.shell.needsRefresh)
			this.anyNeedsRefresh = true;
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

		// An array, or an h.map() list nested inside an array or returned from a function.
		// Such a list can't use the identity fast path, but it still renders: iterating it
		// calls its callback for each item, and whatever that returns is flattened the way an
		// array's elements are.
		else if (Array.isArray(expr) || expr instanceof MappedList) {
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
				// Placing a fragment's children takes them out of the fragment, so one that is
				// given again on the next render is empty by then.  It still stands for the
				// nodes it brought, until it is given with new children.
				let nodes = expr.firstChild ? expr[fragmentNodesKey] = [...expr.childNodes] : expr[fragmentNodesKey];
				if (nodes)
					for (let node of nodes)
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
	 * Pool-based reconciliation using close keys, removeNodes() and placeNodes().  Used when
	 * expressions contain raw Nodes, since those can't be tracked by the positional diff.
	 *
	 * Sets itemsHaveNodes, which sends the next render here again when this one placed a raw
	 * Node, or stopped at a row that threw.
	 * @param items {(Template|string|Node)[]}
	 * @param again {boolean=} True when startOver() calls this a second time for the same items. */
	applyGeneric(items, again) {
		let was = this.nodeGroups, oldNodeGroups = was || emptyNodeGroups;
		

		// The rows now standing in the DOM, offered to this render for reuse.  They are kept
		// here, not on the path, until the render is done; see where they are stored, at the end.
		// A row with a key is offered only to the template with that key, so it is looked up in
		// a map of its own; one that no template asks for is discarded, as in the keyed diff.
		let byKey = new Map(), available = this.freeNodeGroups(byKey);

		// While this render is under way, a render of this list that starts inside it (from a
		// function in a row, or from the disconnectedCallback of an element that is taken out)
		// is sent here as well, whatever it draws.  It then leaves a new nodeGroups array, which
		// is how it is noticed below, and it cannot take the shortcut for plain text, which
		// would leave nothing to notice it by.
		this.itemsHaveNodes = true;

		/** @type {Node[]} */
		let newNodes = [];

		// The new list is recorded only when every row of it is in hand.  A row can throw while
		// it is created or rewritten (an event attribute given something that isn't a function),
		// and nothing has been moved by then: the old rows all stand where they stood, so they
		// are still the list, and the next render is sent here again, since raw Nodes may stand
		// among the rows.
		let nodeGroups = [];
		let hasNodes = false;
		for (let item of items) {
			if (typeof item === 'string')
				item = textTemplate(item);
			if (item instanceof Template) {
				let ng = this.getNodeGroup(item, available, byKey);

				// A function in the row may have rendered the host, which drew this whole list
				// from inside the loop.  Nothing has been moved here by then, so that render is
				// complete and correct, and it has taken the rows it needed from the same rows
				// this one was taking from.  Carrying on would use a row twice, so this render
				// starts over from what the other left, as applyMapped() does.
				//
				// It starts over once.  Starting over calls the functions in the rows again, and
				// one that renders the host every time it is called (behind a guard against
				// calling itself, say) would be answered by starting over for ever.  When it
				// happens a second time, what that render drew is left as the list: it is
				// complete and it is the newest.  Only the row whose function started it is not
				// as that render drew it: the expressions applied to it since hold this
				// render's values, which are the older ones, and the rest hold that render's.
				// The row keeps this render's template, so the next render, which brings that
				// render's values again, writes the ones that differ.  (If it brings this
				// render's values instead, the rest stay as that render wrote them until they
				// change.)
				if (this.nodeGroups !== was) {
					if (again)
						ng.template = item;
					else
						this.startOver(items);
					return;
				}
				newNodes.push(...ng.getNodes());
				nodeGroups.push(ng);
			}
			else { // A raw Node from an expression; collectItems() has already flattened fragments and NodeLists.
				hasNodes = true;
				newNodes.push(item);
			}
		}
		this.nodeGroups = nodeGroups;

		// A raw Node that another path placed last is taken from that path, whose lists of its
		// own nodes still name it.  That path is told to read them again; otherwise it would
		// remove the Node from where it stands now when it stops showing it, or not put it back
		// when it is given it again.  So a Node that one render gives to several paths is held
		// by the one written last.  This comes after the rows are built, because a row may be
		// given the same Node, and this path is the one that places it last.
		if (hasNodes) {
			let ownerRef;
			for (let item of items)
				if (item.nodeType) {
					let owner = item[rawOwnerKey]?.deref();
					if (owner !== this) {
						owner?.forgetNodes();
						item[rawOwnerKey] = ownerRef ??= new WeakRef(this);
					}
				}
		}

		let oldNodes = this.getNodes();

		// This pre-check makes it a few percent faster?
		let same = Util.arraySame(oldNodes, newNodes);
		if (!same) {

			// Until the new nodes are in place no list of this path's nodes is true, so none is
			// kept: taking a node out can run code (the disconnectedCallback of an element) that
			// renders this list again, and that render has to read the DOM as it stands.
			this.nodesCache = null;

			if (this.parentNg.parentPath)
				this.parentNg.parentPath.clearNodesCache();

			// Read the nodes of each old NodeGroup of several nodes while they still stand
			// together.  What follows takes nodes out one at a time, and a group drawn by one
			// of the diffs has no list of its nodes yet: without one, the loop at the end
			// could save only its first node, and the group would be kept for reuse in pieces.
			for (let ng of oldNodeGroups)
				if (ng.startNode !== ng.endNode)
					ng.getNodes();

			// Take out the nodes that are no longer shown, by the fast clear when none is.
			let parentNode = this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
			let isNowEmpty = oldNodes.length && !newNodes.length;
			if (!isNowEmpty || !this.fastClear())
				removeNodes(parentNode, oldNodes, newNodes);

			// A render that started while they were taken out has drawn the list from what it
			// found, and nothing has been placed here yet.  This render starts over from what
			// that one left, as it does in the loop above.  Here it always does: the nodes it
			// has taken out since may include some that render placed, so what that render
			// drew cannot be left standing.
			if (this.nodeGroups !== nodeGroups)
				return this.startOver(items);

			placeNodes(parentNode, newNodes, this.wholeParent ? null : this.nodeMarker);
			this.nodesCache = newNodes;

			// TODO: Put this in a remove() function of NodeGroup.
			// Then only run it on the old nodeGroups that were actually removed.
			//Util.saveOrphans(oldNodeGroups, oldNodes);

			for (let ng of oldNodeGroups)
				if (!ng.startNode.parentNode)
					Util.saveOrphans(ng.getNodes());
		}

		// The rows this render did not use are out of the DOM now, each still in one piece, and
		// the next render may take them.  They are stored only here: while this render was under
		// way they still stood in the DOM, and a render that started inside it would have
		// taken them for rows already removed and kept them for reuse a second time.
		this.nodeGroupsAttachedAvailable = available;
		this.itemsHaveNodes = hasNodes;

		// The NodeGroup these raw Nodes are placed in, and every NodeGroup that one is inside,
		// must not be kept for reuse when it is removed; see Shell.heldRawNodes.
		if (hasNodes)
			for (let ng = this.parentNg; ng; ng = ng.parentPath?.parentNg)
				ng.shell.heldRawNodes = true;
	}


	/**
	 * Draw items again from what another render of this list left, when that render ran inside
	 * applyGeneric() and replaced the rows it was working with.
	 *
	 * That render was sent to applyGeneric() too, but one more render after it, from the same
	 * function or from the next element that was taken out, is not: it may have put plain text
	 * here, which leaves a bare text node, or drawn an h.map(), which leaves its items
	 * remembered.  applyGeneric() knows neither, so both are dealt with here the way
	 * applySingle() deals with them before it calls applyGeneric().
	 * @param items {(Template|string|Node)[]} */
	startOver(items) {
		this.lastItems = null;
		if (this.textNode !== null) {
			(this.nodeGroups ??= []).push(new NodeGroup(textTemplate(this.textValue), this, this.textNode));
			this.textNode = null;
		}
		this.applyGeneric(items, true);
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
	 * Forget which nodes stand in this path's range, because another path took a raw Node out of
	 * it; see applyGeneric().  The lists are read from the DOM again the next time they are
	 * asked for.  The same goes for the NodeGroup this path belongs to, and for every path and
	 * NodeGroup above them whose nodes have the same parent node: a template with no element of
	 * its own puts the nodes of its expressions among those of the list it is a row of, so
	 * their lists name the Node too. */
	forgetNodes() {
		let path = this;
		let parentNode = this.wholeParent ? this.nodeMarker : this.nodeMarker.parentNode;
		while (path && (path.wholeParent ? path.nodeMarker : path.nodeMarker.parentNode) === parentNode) {
			path.nodesCache = path.parentNg.nodesCache = null;
			path = path.parentNg.parentPath;
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
			// One call, faster than calling .removeChild() a thousand times.  The parent can be a
			// DocumentFragment, which has no innerHTML to clear it with: the one a template was
			// rendered into, or the one where an element keeps the children it was given.
			parent.replaceChildren(this.nodeBefore, this.nodeMarker);
			//}
			return true;
		}
		return false;
	}

	/**
	 * Get a NodeGroup with the same html as the template, reusing a pooled one if available.
	 * The first pooled NodeGroup with the same close key (html shape) is taken and its
	 * expressions are updated, skipping the update when its values are already identical.
	 * A template with a key takes only the row that has its key, as in the keyed diff, and
	 * never one from the pool.
	 *
	 * @param template {Template}
	 * @param available {MultiValueMap} The rows without a key standing in the DOM that the
	 * render under way has not used yet; see freeNodeGroups().
	 * @param byKey {Map<*, NodeGroup>} The rows with a key standing in the DOM, by key, that the
	 * render under way has not used yet.
	 * @return {NodeGroup} */
	getNodeGroup(template, available, byKey) {
		let closeKey = template.getCloseKey(), key = keyOf(template);
		let result = key === undefined
			? available.deleteAny(closeKey) || this.nodeGroupsDetachedAvailable?.deleteAny(closeKey)
			: byKey.get(key);

		// The row of a key is used only when it was made from the same html.
		if (result?.closeKey === closeKey) {
			byKey.delete(key);
			let old = result.template;
			if (templatesSame(old, template))
				this.refreshSameItem(result, template);
			else
				result.applyExprs(template.exprs);

			// A render that started while the expressions were applied (see applyGeneric()) may
			// have taken this same row and given it a template of its own.  The row then shows
			// some of each and keeps the template that render gave it, so that the caller,
			// when it starts over, finds a difference and applies every expression again.
			if (result.template === old)
				result.template = template;
		}
		else
			result = this.createNew(template);

		
		return result;
	}


	/**
	 * Move the rows the last render stopped showing to nodeGroupsDetachedAvailable, and offer
	 * the rows now in this.nodeGroups for reuse.
	 * Called at the beginning of applyGeneric() so it can have NodeGroups to use.
	 * TODO: this could run as needed in getNodeGroup?
	 * @param byKey {Map<*, NodeGroup>} Receives the rows now standing in the DOM that have a key,
	 * by key.  They are left out of the result, so that one no template asks for by its key is
	 * not reused for another, and never reaches the pool.
	 * @return {MultiValueMap} The rows now standing in the DOM, by close key.  They belong to
	 * the render that asked for them: nothing is stored on the path while it runs. */
	freeNodeGroups(byKey) {
		// Add nodes that weren't used during render() to nodeGroupsDetached
		let previouslyAttached = this.nodeGroupsAttachedAvailable?.data;
		if (previouslyAttached) {
			let detached = (this.nodeGroupsDetachedAvailable ??= new MultiValueMap()).data;
			for (let key in previouslyAttached) {
				let src = previouslyAttached[key];
				let from = src.hd || 0; // Skip entries already consumed by deleteAny().

				// NodeGroups that have held a raw Node are not kept; see Shell.heldRawNodes.
				// The first one answers for the rest: those under one close key were made from
				// one Shell, unless they have no expressions, and then none can hold a Node.
				if (src[from].shell.heldRawNodes)
					continue;
				let array = detached[key];
				if (!array) {
					array = detached[key] = from ? src.slice(from) : src;
					if (array.length > maxPooledPerKey)
						array.length = maxPooledPerKey;
				}
				else
					for (let i=from, max=maxPooledPerKey + (array.hd || 0); i<src.length && array.length < max; i++)
						array.push(src[i]);
			}
		}

		this.nodeGroupsAttachedAvailable = null;

		// Offer the NodeGroups the last render left in place for reuse.  Every path that renders
		// NodeGroups — the positional diff, the keyed diff and applyGeneric alike — leaves them in
		// this.nodeGroups, so that one array is always the set still standing in the DOM.
		let nga = new MultiValueMap();
		if (this.nodeGroups)
			for (let ng of this.nodeGroups)
				if (ng.key !== undefined)
					byKey.set(ng.key, ng);
				else
					nga.addCapped(ng.closeKey, ng); // No cap: these are the rows now in the DOM.
		return nga;
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

	
}


// Cache for keyOf(): list rows share one html array, so the Shell lookup that finds where the
// key=${} expression sits happens once per list rather than once per row.
let lastKeyHtml = null, lastKeyIndex = -1;

/**
 * The list key of an item, or undefined when it has none.
 * @param t {Template|string}
 * @return {*} */
function keyOf(t) {
	if (typeof t === 'string')
		return undefined;
	if (t.key !== undefined) // JSX templates carry the key directly.
		return t.key;
	if (t.html !== lastKeyHtml) {
		lastKeyHtml = t.html;
		lastKeyIndex = Shell.get(t.html, t.svgMode).keyIndex;
	}
	return lastKeyIndex >= 0 ? t.exprs[lastKeyIndex] : undefined;
}

/**
 * @param text {string}
 * @return {Template} */
function textTemplate(text) {
	let result = new Template([text], []);
	result.isText = true;
	return result;
}

/**
 * What a row that is being kept stands for in the list handed to the reconciler: its Template,
 * or for a text row the text itself.
 *
 * A text row's Template is private to its NodeGroup and is rewritten in place when the row's
 * text changes (see rewriteNodeGroup).  Handing that object on would let a second NodeGroup be
 * built from it when the row moves, and from then on a change to either row would silently
 * change what the other one believes it shows.  A string carries no such tie.
 * @param ng {NodeGroup}
 * @return {Template|string} */
function keptItem(ng) {
	let tpl = ng.template;
	return tpl.isText === true ? tpl.html[0] : tpl;
}

/**
 * Does the NodeGroup already have content identical to item?
 * @param ng {NodeGroup}
 * @param item {Template|string}
 * @return {boolean} */
function itemSame(ng, item) {
	let tpl = ng.template;
	if (tpl === item) // h.map() returns the same Template instance for an unchanged item.
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
 * The first position of b, from i up to but not including end, whose value differs from the
 * one a holds shift places further along; end when they agree all the way.
 *
 * Kept as a function of its own, and a tiny one, because a scan like this is the part of a
 * re-render whose cost grows with the length of the list rather than with the size of the
 * change, and a JavaScript engine compiles a small function that loops long before it compiles
 * a large one that happens to contain the same loop.
 * @param a {Array}
 * @param b {Array}
 * @param i {int}
 * @param end {int}
 * @param shift {int}
 * @return {int} */
function firstDiff(a, b, i, end, shift) {
	while (i < end && a[i+shift] === b[i])
		i++;
	return i;
}

/**
 * Take all of ng's nodes out of the DOM.  A NodeGroup of several nodes keeps them together in a
 * fragment of their own, so it can still be walked afterwards.
 * @param ng {NodeGroup} */
function detachNodes(ng) {
	if (ng.startNode !== ng.endNode)
		Util.saveOrphans(ng.getNodes());
	else
		ng.startNode.remove();
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
 * Take out of parentNode the nodes of oldNodes that are not in newNodes.  With placeNodes() this
 * reconciles a list that holds raw DOM Nodes; only the raw-Node fallback (applyGeneric) uses
 * them, the keyed and positional diffs never do.  They are two functions because taking a node
 * out can run code that renders the same list again, which applyGeneric() has to find out
 * before it places anything.
 * @param parentNode {Node}
 * @param oldNodes {Node[]}
 * @param newNodes {Node[]} */
function removeNodes(parentNode, oldNodes, newNodes) {
	if (oldNodes.length) {
		let keep = new Set(newNodes);
		for (let node of oldNodes)
			if (!keep.has(node) && node.parentNode === parentNode)
				parentNode.removeChild(node);
	}
}

/**
 * Make newNodes children of parentNode, in order, ending just before `before` (or at the end
 * when before is null).  Walks back to front so `next` is always the already-placed node that
 * should follow.  insertBefore moves a node already in the DOM, so nodes already in the right
 * spot are skipped to avoid needless mutation.
 * @param parentNode {Node}
 * @param newNodes {Node[]}
 * @param before {?Node} */
function placeNodes(parentNode, newNodes, before) {
	let next = before;
	for (let i=newNodes.length; i--; ) {
		let node = newNodes[i];
		if (node.nextSibling !== next || node.parentNode !== parentNode)
			parentNode.insertBefore(node, next);
		next = node;
	}
}

/**
 * Consumes the key=${expr} expression of a keyed template.
 * Writes the value to its NodeGroup's key field and never touches the DOM.
 * Created by Shell when it strips a key attribute; PathToNodes.applyKeyed()
 * matches NodeGroups to new templates by this key. */
class PathToKey extends Path {

	applySingle(expr) {
		this.parentNg.key = expr;
	}
}

class PathToComponent extends Path {

	/** @type {PathToAttribValue[]} Paths to dynamics attributes that will be set on the component.*/
	attribPaths;

	/** @type {string|undefined} Hash of the exprs the last time the component asked whether they changed.  Undefined
	 * when it has never asked, or rendered once without asking, so that the next answer is yes. */
	appliedExprsHash;

	/** @type {Expr[][]|undefined} The exprs of the render in progress, which hasChanged() compares.  Undefined between
	 * renders. */
	renderingExprs;

	/** @type {boolean|undefined} hasChanged()'s answer for the render in progress, once the component has asked. */
	changedAnswer;

	/** @type {boolean|undefined} Set for good the first time these exprs need getObjectHash()'s replacer, since a
	 * component's arguments keep the same kind of data from one render to the next, and trying getPlainHash() again would
	 * only walk the data for nothing.  Both give the same string, so the switch never makes the exprs look changed. */
	slowExprs;

	/**
	 * Passed to the component's render() as its second argument.  Whether the exprs differ from those of the last
	 * render that asked, compared deeply so that a field changed inside the same object counts.  Only a component that
	 * calls it pays for the comparison.  Called outside a render that this path started, it answers yes.
	 * @return {boolean} */
	hasChanged = () => {
		let exprs = this.renderingExprs;
		if (!exprs)
			return true;
		if (this.changedAnswer === undefined) {
			let hash = this.slowExprs ? undefined : getPlainHash(exprs);
			if (hash === undefined) {
				this.slowExprs = true;
				hash = getObjectHash(exprs);
			}
			this.changedAnswer = hash !== this.appliedExprsHash;
			this.appliedExprsHash = hash;
		}
		return this.changedAnswer;
	};

	constructor(nodeBefore, nodeMarker) {
		super(null, nodeMarker);
	}

	/**
	 * Call render() on the component pointed to by this Path.
	 * And instantiate it (from a -solarite-placeholder element) if it hasn't been done yet.
	 * @param exprs {Expr[][]} Expressions to evaluate for each attribute to pass to the constructor.
	 * This is different than other Path.applyAll() functions which only receive Expr[] and not Expr[][].
	 * Because here we're receiving an array of arrays of expressions, one for each dynamic attribute. */
	applyAll(exprs) {
		

		

		let el = this.nodeMarker;

		// 1. Attributes
		let attribs = Util.attribsToObject(el, '_is');
		for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
			if (attribPath instanceof PathToKey) // The list key is never a component arg.
				continue;

			// The whole expression, or the joined text of an attribute with several parts.
			let value = attribPath.getValue(exprs[i]);
			let name = attribPath.attribName;

			// A precompiled JSX attribute, as in `<my-list items={rows}>`, is a name and a value
			// in one hole.  It is passed on as the attribute of that name in a tagged template
			// is, with a style object as the css text PathToAttribs writes.  Taken for an object
			// of attributes, it used to reach the component as two arguments called `name` and
			// `value`.
			if (value instanceof JsxAttr) {
				name = value.name;
				value = name === 'style' ? styleToCss(value.value) : value.value;
			}

			if (name) {
				// Event attributes like onchange=${...} are bound with addEventListener when the
				// PathToEvent itself is applied.  They must not also become constructor fields:
				// a component that assigns its fields onto itself would set the native on*
				// property, making the handler fire a second time with only the (event) argument
				// instead of Solarite's documented (event, element) signature.
				if (Util.isEvent(name))
					continue;

				// Resolve a two-way binding path before we pass it to the component.  Joined
				// text is a string, which is never one.
				if (isDelvePath(value))
					value = delve(value[0], value.slice(1));
				attribs[Util.dashesToCamel(name)] = value;
			}
			else { // PathToAttribs: an object of attributes, or a string of them.
				if (typeof value === 'string')
					value = Util.splitAttribs(value);
				if (typeof value === 'object')
					for (name in value)
						attribs[Util.dashesToCamel(name)] = value[name];
			}
		}

		// Constructing a component runs arbitrary user code -- field initializers, the
		// constructor body, render() -- and that code can build more components, re-entering
		// this method and overwriting the hand-off parked below.  Saving the caller's value
		// here and restoring it in the finally makes the JS call stack the stack this hand-off
		// needs, and unlike an explicit stack it cannot leak if construction throws.
		let prevSlotChildren = Globals.currentSlotChildren;
		try {
			// 2. Instantiate component on first time.
			let isAttrib = el.getAttribute('_is');
			if (el.tagName.endsWith('-SOLARITE-PLACEHOLDER') || isAttrib) {


				// 2a. Instantiate component
				let tagName = (isAttrib || el.tagName.slice(0, -21)).toLowerCase(); // Remove -SOLARITE-PLACEHOLDER
				let Constructor = customElements.get(tagName);

				// Not defined yet (e.g. the module is being lazily imported): keep the placeholder
				// and instantiate when the definition lands, like a native custom-element upgrade.
				// deferredExprs always holds the LATEST exprs so re-renders while undefined win,
				// and while it is set a wait is already under way.
				if (!Constructor) {
					if (!this.deferredExprs) {
						console.warn(`Solarite: <${tagName}> is not defined yet; waiting for customElements.define().`);
						customElements.whenDefined(tagName).then(() => {
							let deferred = this.deferredExprs;
							this.deferredExprs = null;
							// Skip if a newer render has built the component already: building it is
							// what points nodeMarker at the new element.  The placeholder's tag name
							// can't answer that, because it never changes, and the placeholder of a
							// customized built-in (<p is="my-p">) doesn't carry the suffix at all.
							// Skip too if the element was given another template in the meantime
							// (RootNodeGroup.unrender()), which leaves this one's root without its
							// entry: nobody sees the component, and its data-id would take the name
							// from an element of the template shown.
							let root = this.parentNg.rootNg;
							if (this.nodeMarker === el && Globals.rootNodeGroups.get(root.rootEl) === root) {
								this.applyAll(deferred);

								// The component is built here outside any render, so no list is
								// being drawn that would read its nodes again when it is done.
								// When the placeholder was a row of a list, or one of a row's
								// nodes, every list it stands in still names the placeholder
								// among its nodes.  Those lists are read from the DOM again.
								// And one that is inside an element that doesn't render through
								// Solarite has the placeholder among the nodes it looks for
								// before it draws (see PathToNodes.applyAll()), and would take
								// the component that now stands there for the element's doing.
								let ng = this.parentNg;
								ng.nodesCache = null;
								for (let path = ng.parentPath; path; path = path.parentNg.parentPath) {
									path.nodesCache = path.parentNg.nodesCache = null;
									let nodes = path.kept?.nodes, i = nodes ? nodes.indexOf(el) : -1;
									if (i >= 0)
										nodes[i] = this.nodeMarker;
								}
							}
						});
					}
					this.deferredExprs = exprs;
					return;
				}

				// Hand the children declared inside the component's tag to the RootNodeGroup that
				// its render() is about to create.  There is no other channel: the children have
				// to be parked before new Constructor(), because a Solarite constructor may call
				// this.render() itself, and the element that would otherwise carry them does not
				// exist yet.  The placeholder goes with them, so that such a render can tell which
				// attributes step 2b is about to write.
				let ng = this.parentNg;
				Globals.currentSlotChildren = {Constructor, nodes: [...el.childNodes], paths: ng.paths, el};
				let newEl = new Constructor(attribs);

				// 2b. Copy attributes over.  The placeholder holds everything the element should
				// start with: the attributes written in the template, and the values of the
				// dynamic ones, because NodeGroup.applyExprs() applies a component's attribute
				// paths before the component itself.  Nothing is written from attribs.  Its names
				// are camelCase and setAttribute() lowercases them, so `font-size` used to get a
				// twin named `fontsize` that no later render updated and that came back, stale,
				// as one more argument to every later render().
				if (isAttrib) {
					newEl.setAttribute('is', isAttrib);
				//	el.removeAttribute('_is');
				}
				for (let attrib of el.attributes)
					if (attrib.name !== '_is')
						newEl.setAttribute(attrib.name, attrib.value);

				// 2c. If an id pointed at the placeholder, update it to point to the new element.
				let id = newEl.getAttribute('data-id') || newEl.getAttribute('id');
				if (id)
					delve(this.parentNg.getRootEl(), id.split(/\./g), newEl);

				// 2d. Update paths to use replaced element.
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

				// 2e. Call render() if it wasn't called by the constructor.
				// This must happen before we add it to the DOM which can trigger connectedCallback() -> renderFirstTime()
				// Because that path renders it without the attribute expressions.
				if (typeof newEl.render === 'function' && !Globals.rendered.has(newEl))
					this.callRender(newEl, attribs, exprs);

				// 2f. Keep the children declared inside the tag when no render took them.  A
				// component that renders through h() has moved them out of the placeholder and
				// into its <slot> by now, and nothing is left here to move.  Any other element
				// leaves them behind: one from another library, one that fills a shadow root, one
				// whose first h() render comes later.  They belong inside it all the same, where
				// the browser would have put them had it parsed the tag, and they go in before
				// step 2g because a <select is="..."> can only take a value one of its options has.
				//
				// Such an element may move the children it was given, all together, into its
				// shadow root or a wrapper of its own, and Solarite goes on updating them there.
				// It must not take them apart.  So every expression written inside the tag, at
				// any depth, is told which element it is in and which nodes it drew, and looks
				// for them before it draws again; see PathToNodes.applyAll().  It is told before
				// the children are moved: a child taken out of the document by the move can run
				// code that renders the host, and that render reaches the element.
				//
				// The expressions are those of this template, and those of the template that
				// is constructing a Solarite component around this one, when this element holds
				// that component's <slot>: what the outer template drew for the slot is inside
				// this element too.  An expression that is inside a deeper such element already
				// stays with that one, which is the one it is written in.  One that is being
				// drawn at this moment, by a render this one started inside, reads its nodes
				// itself when that draw is done.
				//
				// One whose two markers enclose nothing that can be read is left as it is.  A
				// Solarite component inside this element has then put the node before the
				// expression in one of its slots and the node after it in another, so there
				// is no run of nodes to compare, and the expression is drawn as it is in that
				// component anywhere else.
				if (el.firstChild) {
					for (let path of ng.paths.concat(prevSlotChildren?.paths || [])) {
						let kept = path.kept;
						if (path.standing && el.contains(path.nodeMarker) && !el.contains(kept?.el)) {
							let drawn = kept && !kept.nodes, nodes = drawn ? null : path.standing();
							if (drawn || nodes)
								path.kept = {el: newEl, nodes};
						}
					}
					newEl.append(...el.childNodes);
				}

				// 2g. Update attribute paths to use the new element and re-apply them.
				for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
					attribPath.parentNg = this.parentNg;
					attribPath.nodeMarker = newEl;
					attribPath.applyAll(exprs[i]);
				}

				// 2h. Swap it to the DOM.
				el.replaceWith(newEl);

				// The placeholder may be the node a root's template ends with in its element or
				// in a slot, after which the nodes that are not the template's begin (see
				// RootNodeGroup.slotMarks).  The component now ends it.  A node has one parent,
				// so it is named there once at most.
				let marks = ng.slotMarks, i = marks?.indexOf(el);
				if (i > 0)
					marks[i] = newEl;
			}

			// 3. Render a component that exists already.
			else if (typeof el.render === 'function')
				this.callRender(el, attribs, exprs);

		}
		finally {
			Globals.currentSlotChildren = prevSlotChildren;
		}
	}

	/**
	 * Call the component's render() with its arguments and hasChanged().
	 * @param el {HTMLElement}
	 * @param attribs {Object}
	 * @param exprs {Expr[][]} */
	callRender(el, attribs, exprs) {
		// A component that renders this path's parent again from inside its own render() comes back through here, so
		// the outer render's state is saved and put back around the call.
		let prevExprs = this.renderingExprs, prevAnswer = this.changedAnswer, done;
		this.renderingExprs = exprs;
		this.changedAnswer = undefined;
		try {
			el.render(attribs, this.hasChanged);
			done = true;
		}
		finally {
			// The component rendered without asking, so there is nothing for the next answer to be compared against.
			// Or it threw, maybe after asking, and what it drew of these exprs can't be trusted.
			if (!done || this.changedAnswer === undefined)
				this.appliedExprsHash = undefined;
			this.renderingExprs = prevExprs;
			this.changedAnswer = prevAnswer;
		}
	}

	/**
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {Path} */
	clone(newRoot, pathOffset=0) {
		// A component path's nodeBefore is always null (the constructor discards it), so the
		// base clone() resolves only the nodeMarker and hands back a new PathToComponent.
		let result = super.clone(newRoot, pathOffset);
		result.attribPaths = this.attribPaths.map(path => path.clone(newRoot, pathOffset));
		return result;
	}

	getExpressionCount() { return 0 }

	
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
	docFrag;

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

	/** @type {boolean} True if any path binds an attribute that's a live HTML property
	 * (checked, value, selected — Util.isHtmlProp).  Users flip those underneath the template,
	 * so "expression unchanged" doesn't mean "DOM unchanged" and the skip shortcuts exempt them. */
	hasLivePropPaths = false;

	/** @type {boolean} True if every path consumes exactly one expression and none are components.
	 * Lets NodeGroup.applyExprs() use a fast loop without allocating per-path expression arrays. */
	pathsSingleExpr = false;

	/** @type {boolean} True when a NodeGroup whose values are unchanged still has work to do:
	 * components re-render so changes deeper in the tree surface, and live HTML properties are
	 * rewritten because a click can flip them underneath the cached expression.  The list scans
	 * check this before calling PathToNodes.refreshSameItem(), so the overwhelmingly common
	 * unchanged row costs one field read instead of a call. */
	needsRefresh = false;

	/** @type {boolean} True once a NodeGroup made from this Shell has held a raw DOM node given
	 * as an expression, in a place of its own or in a NodeGroup inside it.  A node can be in only
	 * one place, so the next NodeGroup that is given the same node takes it away, and nothing
	 * tells the one it was taken from.  That is harmless while both are being rendered, because
	 * the one that lost the node is given something else in the same render.  A NodeGroup that
	 * was removed and kept for reuse is not being rendered, though: it would come back still
	 * recording the node as its own, be given that node again, find nothing changed and show an
	 * empty place.  So PathToNodes discards a removed NodeGroup of such a Shell, as it does a
	 * keyed row, and builds a new one when one is needed.  Sticky, and shared by every NodeGroup
	 * of the Shell, which can only cost a rebuild that wasn't needed. */
	heldRawNodes = false;

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

	/** @type {boolean} True when a stamped row finds all of its nodes as soon as it is made,
	 * rather than when something first needs one: when the row holds a form control and has
	 * nodes below its root to find.  See the NodeGroup constructor. */
	resolveAtCreate = false;

	// The remaining fields are only filled in for some shells (resolve program, stampable),
	// but they're all declared here so every Shell instance shares one hidden class.
	// NodeGroup's per-row code (its constructor, applyStamp, resolveStampSlots) reads these
	// off whichever shell it's given, and a single shape keeps those loads monomorphic.

	/** @type {?string} The Template close key, cached here by the NodeGroup constructor so
	 * each new template row skips a WeakMap lookup.  See Template.getCloseKey(). */
	closeKey;

	/** @type {?int[]} The resolve program: flat [parentSlot, childIndex] pairs in dependency
	 * order; pair i fills slot i+1, slot 0 being the fragment.  Built by buildResolveProgram();
	 * undefined for shells with components. */
	resolveOps;

	/** @type {?Node[]} Reusable scratch array for resolved nodes; safe because resolution
	 * never re-enters. */
	resolveSlots;

	// The stamp program, set only when stampable is true:

	/** @type {?int[]} Indexes of PathToNodes paths, checked for primitive exprs before stamping. */
	nodesPathIdx;

	/** @type {?Path[]} One shared stamper per path; nodeMarker/parentNg are set per use. */
	stampPaths;

	/** @type {?Uint8Array} Opcode per path; see the stamp-program comment in the constructor. */
	stampOp;

	/** @type {?Uint16Array} paths[i].markerSlot, in a flat array so the hot loop
	 * doesn't load the Path object to find its slot. */
	stampSlot;

	/** @type {?Array} Per-path extra the stamp program needs: the attribute name for op 4, and
	 * for a whole-parent text child (op 2) the index in a row's NodeGroup.stampSlots() array
	 * where the row keeps that child's Text node.  Null otherwise. */
	stampAux;

	/** @type {?HTMLElement} A copy of the root element with an empty text node inside every
	 * whole-parent child marker.  A new row writes its primitive child text into those text
	 * nodes and clones this instead of docFrag, so the clone carries the text natively and
	 * nothing has to reach into the clone afterwards.  Every read of a clone's child creates
	 * a JS wrapper for that node, and the wrappers cost as much to make, and later to
	 * collect, as the writes they were made for.  See NodeGroup's constructor. */
	stampMaster;

	/** @type {?Text[]} The master's text nodes, in nodesPathIdx order. */
	stampMasterTexts;

	/** @type {?(HTMLElement|null)[]} For each master text node, null while it sits in its cell,
	 * and the cell (the whole-parent marker it belongs in) while it is detached from it, which
	 * is how a row with an empty-string child is cloned without an empty text node. */
	stampMasterEmpty;

	/** @type {?Object<string, int[]>} For each delegatable event name this shell binds, a flat
	 * list of [path index, marker slot] pairs.  Its keys are also what a loop registers the
	 * dispatchers from, once for the whole run of rows.  A row's delegated handlers are never written
	 * onto its nodes; when an event starts, the dispatcher finds the row through its root
	 * element, looks the event's targets up here, and reads the handlers from the row's
	 * template.  Null when the shell binds no delegatable events, and for every shell that
	 * isn't stampable. */
	stampEventsByType = null;

	/**
	 * Create the nodes but without filling in the expressions.
	 * This is useful because the expression-less nodes created by a template can be cached.
	 * @param html {string[]} Html strings, split on places where an expression exists.
	 * @param svgMode {boolean} Parse the html in the SVG namespace.  */
	constructor(html=null, svgMode=false) {
		if (!html)
			return;

		// A chunk is undefined when its part of the template literal holds an escape sequence that JavaScript
		// rejects, such as the "\2014" of a css content value, which has to be written "\\2014" in a template.
		// Joined with the other chunks it would count as an empty string, and the template would render without
		// that part of its html and without a word about it.  The message quotes the chunks as they were written,
		// which a tagged template keeps beside them in html.raw, since the chunk that holds the bad escape is the
		// one that has no other form.
		if (html.includes(undefined))
			throw new Error(`Solarite: bad escape sequence in template: ${(html.raw || html).join('${...}')}`);

		

		// If no html tags or entities, just create a text node.
		if (html.length === 1 && !html[0].match(/[<&]/)) {
			this.docFrag = Globals.doc.createTextNode(html[0]);
			return;
		}


		// 1.  Add placeholders
		let htmlWithPlaceholders = Shell.addPlaceholders(html);

		// The html is never empty here: an html of one empty string took the text-node exit above,
		// and any other html holds text or at least one placeholder.
		let template = Globals.doc.createElement('template'); // Using a single global template won't keep the nodes as children of the DocumentFragment.
		this.docFrag = template.content;

		// Wrap in <svg> so the parser's foreign-content rules create the nodes in the SVG namespace,
		// then lift the children back out so the fragment has no wrapper.
		if (svgMode) {
			template.innerHTML = '<svg>' + htmlWithPlaceholders + '</svg>';
			this.docFrag = Globals.doc.createDocumentFragment();
			this.docFrag.append(...template.content.firstChild.childNodes);
		}
		else
			template.innerHTML = htmlWithPlaceholders;

		// 1b. Remove whitespace-only text nodes inside table-structure elements.
		// The parser foster-parents non-whitespace text out of tables, and whitespace-only
		// text between cells/rows is never rendered, so removing it is invisible.
		// Smaller fragments make cloning, path resolution, and insertion faster.
		stripTableWhitespace(this.docFrag);

		// 1c. Neutralize `is` so the browser can't upgrade a placeholder out from under us.
		renameIsAttribs(this.docFrag);

		// 2. Find placeholders
		let node;
		let toRemove = null; // A placeholder node the walker has not moved off yet.

		// The walker needs no filter: a parsed fragment holds only elements, text, comments, and in some browsers
		// processing instructions.
		let walker = Globals.doc.createTreeWalker(this.docFrag);
		while (node = walker.nextNode()) {

			// Remove the placeholder the previous step was done with, now that the walker has moved
			// off it, so paths will still be calculated correctly.  Each step leaves at most one,
			// and removing a node that is already out does nothing.
			toRemove?.remove();
			
			// Replace attributes
			if (node.nodeType === 1) {
				let hasIs = node.hasAttribute('_is'); // Renamed from `is` in step 1c.
				let isComponent = (hasIs || node.tagName.includes('-'));
				let componentAttribPaths = [];

				for (let attr of [...node.attributes]) { // Copy the attributes array b/c we remove attributes with placeholders as we go.
					let attrName = attr.name, path, isEvent;
					// Dynamic on* attributes are prefixed with \ufdd0 in addPlaceholders() so template.innerHTML
					// never parses them as inline event handlers (which violates a strict CSP in Chrome 157+).
					let name = attrName[0] === '\ufdd0' && attrName.startsWith('on', 1) ? attrName.slice(1) : attrName;
					if (attrName !== name && node.hasAttribute(name))
						continue;

					// The value split around its expressions, and null in place of that when the
					// whole value is one expression.
					let parts = attr.value.split(marks);
					let nonEmptyParts = (parts.length === 2 && !parts[0] && !parts[1]) ? null : parts;

					// The reserved key attribute identifies this template within a keyed list.
					// It's consumed here and never written to the DOM or passed to components.
					if (name === 'key') {

						// These three are template-authoring mistakes, and every one of them fails SILENTLY if
						// it isn't caught: the reconciler would key rows on a garbage value and reuse the wrong
						// DOM, with nothing reported.  So they ship, unlike the assertions elsewhere in this
						// file.  The cost is one regex split per unique template \u2014 never per render, never per
						// row \u2014 which is why they are affordable to keep.
						if (nonEmptyParts)
							throw new Error(`Solarite: key must be one whole expression.`);
						if (node.parentNode !== this.docFrag)
							throw new Error(`Solarite: key must be on a top-level element.`);
						if (this.keyIndex >= 0)
							throw new Error(`Solarite: duplicate key attribute.`);

						this.keyIndex = attr.value.charCodeAt(1) - attribPlaceholder;

						// On a component the key still joins componentAttribPaths below, which keeps
						// PathToComponent's contiguous expression slices aligned; it skips PathToKey
						// when building args.
						path = new PathToKey(null, node);
					}

					// One or more whole attributes
					else if (name.match(/^\ufdd0[\ue000-\uf8ff]$/)) {
						path = new PathToAttribs(null, node);
						nonEmptyParts = null; // So the placeholder attribute is removed below.
					}

					// Just the attribute value.
					else if (parts.length > 1) {
						isEvent = Util.isEvent(name);
						path = isEvent
							? new PathToEvent(null, node, name, nonEmptyParts)
							: new PathToAttribValue(null, node, name, nonEmptyParts);
						// An event attribute is never a live property, though elements do have an
						// onclick property: counting it as one would mark every row that binds an
						// event on a plain element (<i>, <section>, <em>...) as needing a visit on
						// every render, which turns the list shortcuts off for the whole list.
						path.isHtmlProperty = !isEvent && Util.isHtmlProp(node, name);
					}
					else
						continue;

					this.paths.push(path);
					if (isComponent) {
						path.isComponentAttrib = true;
						componentAttribPaths.push(path);
					}

					// An attribute whose whole value is one expression is removed from the shell:
					// its stamped value is always the empty string, so every clone would carry a
					// useless empty attribute that costs storage on creation and a slot in the
					// element's attribute list forever, and apply() writes the real value anyway
					// (a missing attribute reads back as '', so an empty expression still writes
					// nothing).  Event attributes are always removed for the same reason plus a
					// stricter one: an onclick attribute in the shell violates a strict CSP.
					// In svgMode, setting typed SVG attributes (viewBox, r, etc.) with the
					// placeholders stripped out makes the browser log parse errors, both here and
					// when the fragment is cloned, so those are removed whether or not they're whole.
					if (svgMode || !nonEmptyParts || isEvent)
						node.removeAttribute(attrName);

					// setAttribute throws only when the template author wrote a name the browser
					// refuses, such as one holding a space or a quote.  That name comes from a tagged
					// template literal's static text, so it is a typo that surfaces the first time the
					// template renders and can never appear later or for only some users.  Development
					// therefore wraps the call to rethrow with the attribute name and the tag included,
					// because the browser's own DOMException names neither and leaves the author
					// hunting.  Production ships the bare call and lets that DOMException through: the
					// friendlier wording is only worth its bytes to whoever can still fix the template.
					else {
						if (attrName !== name)
							node.removeAttribute(attrName);
						
							node.setAttribute(name, parts.join(''));
						
					}
				}

				// Web components
				if (isComponent) {
					let path = new PathToComponent(null, node);
					path.attribPaths = componentAttribPaths;
					this.paths.splice(this.paths.length - componentAttribPaths.length, 0, path); // Insert before its componentAttribPaths

				}
			}

			// Replace comment placeholders
			else if (node.nodeType === 8 && node.nodeValue === '!✨!') {

				// The parent is the fragment itself, which has no closest(), for a top-level expression.
				let parent = node.parentNode;
				if (parent.closest?.('[contenteditable]'))
					throw new Error(`Solarite: no \${...} inside contenteditable; use value="\${...}".`);

				// The expression is the only child of an element, so the element itself
				// can delimit the expression's nodes and no marker comments are needed.
				// Components and slots are excluded because they move their children
				// during instantiation, which would orphan the expression's region.
				if (parent.nodeType === 1 && !node.previousSibling && !node.nextSibling
					&& !parent.tagName.includes('-') && parent.tagName !== 'SLOT' && !parent.hasAttribute('_is')) {
					let path = new PathToNodes(null, parent);
					path.wholeParent = true;
					this.paths.push(path);
					toRemove = node; // Removing it here would mess up the treeWalker.
				}

				else {
					// Get or create nodeBefore.
					let nodeBefore = node.previousSibling; // Can be the same as another Path's nodeMarker.
					if (!nodeBefore) {
						nodeBefore = Globals.doc.createComment('Path:'+this.paths.length);
						node.before(nodeBefore);
					}
					

					// Get the next node.
					let nodeMarker;

					// A subsequent node is available to be a nodeMarker.
					if (node.nextSibling && (node.nextSibling.nodeType !== 8 || node.nextSibling.textContent !== '!✨!')) {
						nodeMarker = node.nextSibling;
						toRemove = node; // Removing it here would mess up the treeWalker.
					}
					// Re-use existing comment placeholder.
					else {
						nodeMarker = node;
						nodeMarker.textContent = 'PathEnd:'+ this.paths.length;
					}
					

					let path = new PathToNodes(nodeBefore, nodeMarker);
					this.paths.push(path);
				}
			}

			// Sometimes users will comment out a block of html code that has expressions.
			// Here we look for expressions in comments.
			// We don't actually update them dynamically, but we still add paths for them.
			// That way the expression count still matches.
			// A processing instruction (7), which is what Chrome makes of <?x ...>, holds its marks the same way.
			else if (node.nodeType === 8 || node.nodeType === 7) { // Node.COMMENT_NODE, Node.PROCESSING_INSTRUCTION_NODE
				let parts = node.textContent.split(marks);
				for (let i=0; i<parts.length-1; i++) {
					let path = new Path(node.previousSibling, node);
					this.paths.push(path);
				}
			}

			// A few elements have raw-text bodies, which the html parser reads as literal characters
			// rather than as markup.  A comment placeholder written inside one therefore never becomes
			// a comment node; it arrives here as ordinary text.  A textarea can't support expressions
			// in its body at all, while script and style can, by splitting their text around each
			// placeholder so that every expression gets a text node of its own to write into.
			else if (node.nodeType === 3) { // Node.TEXT_NODE
				let parentName = node.parentNode?.nodeName;

				if (parentName === 'TEXTAREA' && node.textContent.includes(commentPlaceholder))
					throw new Error(`Solarite: no \${...} inside textarea; use value="\${...}".`);

				else if (parentName === 'SCRIPT' || parentName === 'STYLE') {
					let parts = node.textContent.split(commentPlaceholder);
					if (parts.length > 1) {

						// Every part is inserted before the original node, in order, so from the second
						// part onward the text node made on the previous iteration is already sitting
						// immediately before this one and serves as the new path's nodeBefore.
						for (let i = 0; i<parts.length; i++) {
							let current = Globals.doc.createTextNode(parts[i]);
							node.before(current);
							if (i > 0) {
								let path = new PathToNodes(current.previousSibling, current);
								this.paths.push(path);

								
							}
						}

						// Removing it here will mess up the treeWalker.
						toRemove = node;
					}
				}
			}
		}
		toRemove?.remove();

		this.findEmbeds();

		// This scan must run before buildResolveProgram(), which skips shells with components
		// and reads hasComponentPaths rather than walking the paths a second time.
		this.pathsSingleExpr = true;
		let placeholdersUsed = 0;
		for (let path of this.paths) {
			// -1 when the path has no nodeBefore.  Assigned unconditionally so every shell path
			// of a given class takes the same property-addition order and shares one hidden class.
			path.nodeBeforeIndex = path.nodeBefore
				? Array.prototype.indexOf.call(path.nodeBefore.parentNode.childNodes, path.nodeBefore)
				: -1;

			// Must be calculated after the placeholders are removed:
			path.nodeMarkerPath = Path.get(path.nodeMarker);

			if (path instanceof PathToComponent)
				this.hasComponentPaths = true;

			// A component path takes no expression of its own, and one attribute value can take several.
			let count = path.getExpressionCount();
			placeholdersUsed += count;
			if (count !== 1)
				this.pathsSingleExpr = false;
			if (path.isHtmlProperty) // needs the full scan — no early break
				this.hasLivePropPaths = true;
		}

		// Every expression of the template must have found its path.  The browser's parser drops
		// what it can't place, such as the second of two attributes with the same name.
		if (placeholdersUsed !== html.length-1)
			throw new Error(`Solarite: bad html or duplicate attribute: ${html.join('${...}')}`);

		this.needsRefresh = this.hasComponentPaths || (this.hasLivePropPaths && this.pathsSingleExpr);

		this.buildResolveProgram();

		// Stampable shells create NodeGroups without allocating any Path objects:
		// NodeGroup.applyStamp() writes expressions through these shared stamper paths,
		// and real paths are materialized only if a NodeGroup is later rewritten in place.
		if (this.singleRoot && this.pathsSingleExpr) {

			// Compiled stamp program: one opcode per path lets applyStamp() write a fresh
			// row through a flat branch chain instead of dispatching applySingle() per path.
			// 0 = generic (shared stamper fallback), 1 = list key (no DOM), 2 = wholeParent
			// child text, 3 = delegatable single-expression event (left in the row's template
			// for the dispatcher when the root delegates every event, the default; otherwise
			// bound by the shared stamper), 4 = a plain attribute holding one whole expression
			// (see the branch that assigns it below), 5 = generic, for a live HTML property,
			// which the in-place rewrite must not skip when its expression is unchanged.  The
			// opcode is also all NodeGroup.rewriteStamp() reads to know a path's kind, so it
			// never loads the Path object.  The same pass decides whether the shell is stampable
			// at all, and fills the dispatcher's lookup table (stampEventsByType).
			let n = this.paths.length;
			let ops = new Uint8Array(n), slots = new Uint16Array(n);
			let aux = new Array(n).fill(null);
			let nodesIdx = [], byType = null, ok = true;
			for (let i=0; i<n; i++) {
				let path = this.paths[i];
				slots[i] = path.markerSlot;
				if (path instanceof PathToKey)
					ops[i] = 1;
				else if (path.wholeParent) {
					ops[i] = 2;
					aux[i] = this.resolveSlots.length + nodesIdx.length;
					nodesIdx.push(i);
				}

				// An event stays generic unless the dispatcher handles it: an event that is bound
				// when the row is drawn must go through PathToEvent.applySingle(), which rejects
				// a value that isn't a handler.  As a plain attribute, a string given to onfocus
				// would be written to the row and run by the browser as an inline handler.
				else if (path instanceof PathToEvent) {
					if (path.delegatedKey !== undefined && !path.attrValue) {
						ops[i] = 3;
						byType ??= {};
						(byType[path.eventName] ??= []).push(i, path.markerSlot);
					}
				}

				// A plain attribute holding one whole expression.  The shell no longer carries
				// the attribute at all (see the placeholder handling above), so on a freshly
				// cloned row the value is known to be absent and a string can be written
				// without first reading back what's there.  It is never a component's attribute:
				// a shell that holds a component isn't pathsSingleExpr.
				else if (path instanceof PathToAttribValue) {
					if (path.isHtmlProperty)
						ops[i] = 5;
					else if (!path.attrValue) {
						ops[i] = 4;
						aux[i] = path.attribName;
					}
				}

				// A child that isn't the only child of its parent, whose bare-text state couldn't
				// be recovered, or a path the stamp program has no way to write: whole attributes,
				// the base Path of a commented-out expression.
				else
					ok = false;
			}
			if (ok) {
				this.stampable = true;
				this.nodesPathIdx = nodesIdx;
				this.stampPaths = this.paths.map(p => p.cloneWithNodes(null, p.nodeMarker));
				this.stampOp = ops;
				this.stampSlot = slots;
				this.stampAux = aux;
				this.stampEventsByType = byType;

				// The master rows are cloned from, see stampMaster.  Its text nodes are made in the
				// template's inert document with the rest of the shell, since cloning there is
				// cheaper than in the page's document (the exp2 note in optimization-log.md).
				let master = this.stampMaster = this.docFrag.firstChild.cloneNode(true);
				let doc = master.ownerDocument;

				// Password managers, autofill tools and spell checkers put nodes of their own
				// beside form controls, such as an icon after an input.  A row found by index
				// from its root after that would find their nodes instead of its own, so a row
				// that holds a form control finds its nodes as soon as it is made.  Other rows
				// stay lazy, which is what makes creating them fast.
				let controls = 'input,select,textarea,[contenteditable]';
				this.resolveAtCreate = this.resolveSlots.length > 2
					&& (master.matches(controls) || master.querySelector(controls) !== null
						|| this.paths.some(p => p.attribName === 'contenteditable'));
				this.stampMasterTexts = nodesIdx.map(i => {
					let tn = doc.createTextNode('');
					Path.resolve(master, this.paths[i].nodeMarkerPath, 1).append(tn);
					return tn;
				});
				this.stampMasterEmpty = nodesIdx.map(() => null);
			}
		}

		
	}

	/**
	 * Mark where every expression goes in the template's html, in a way the browser's parser carries into the
	 * nodes it creates, where the constructor then finds the marks:
	 * 1. Two characters for an expression inside a tag, where it is an attribute's value, part of one, or one or
	 *    more whole attributes: the noncharacter U+FDD0, then a Unicode private-use character numbered by the
	 *    expression (see attribPlaceholder).  An expression inside a comment gets one too, so that a block of
	 *    html that was commented out still has a place for each of its expressions.
	 * 2. A comment placeholder for an expression that is a child of a node.
	 * 3. -solarite-placeholder appended to the tag names of custom components so that we can instantiate them later
	 *    when we can manually call their constructors with the proper attribute and children arguments from evaluated expressions.
	 * @param htmlChunks {string[]}
	 * @returns {string} Html with the placeholders in place. */
	static addPlaceholders(htmlChunks) {
		let index = 0; // Which expression the next mark is for.

		// A mark outside every tag and comment: the expression is a child node.  A comment stands in for it,
		// because text can't be put everywhere a node can, between two <tr> tags for example.
		let child = () => {
			index++;
			return commentPlaceholder;
		};

		// A tag or a comment.  Each mark inside it becomes a character of its own, numbered by its expression
		// because a tag can't have the same attribute more than once.
		// An unquoted value that is one expression straight before the tag's closing '/>', as in
		// <input oninput=${f}/> or <circle r=${5}/>, would take the slash in as html reads it, and the
		// expression would then have text beside it: a handler would be called to make an inline handler of
		// what it returns, and a value would gain a slash.  Whoever writes that means the tag to close itself,
		// so a space goes before the slash.  A slash meant for the value is written inside the quotes,
		// href="${base}/".
		let inTag = tag => {
			// Neutralize dynamic on* attribute names before template.innerHTML so Chrome 157+
			// does not fire a CSP script-src-attr violation while parsing the template.  Scan
			// attributes after the tag name so quoted values like title="onclick=${x}" are untouched.
			if (tag[1] !== '!' && tag[1] !== '?' && tag[1] !== '/' && tag.includes('\0')) {
				let i = tag.search(/[\s\/>]/);
				if (i > 0)
					tag = tag.slice(0, i) + tag.slice(i).replace(tagAttrib, (m, name, val) =>
						val && val.includes('\0') && /^on/i.test(name) ? '\ufdd0' + m : m);
			}
			return tag
				.replace(isWebComponentTagName, '$&-SOLARITE-PLACEHOLDER')
				.replace(/(=\s*\0)\/(?=>$)/, '$1 /')
				.replace(/\0/g, () => '\ufdd0' + String.fromCharCode(attribPlaceholder + index++));
		};

		// The chunks are joined with a NUL character in every gap an expression goes in, and htmlToken then reads
		// the whole template as the browser's parser will.  It matches each tag and each comment in one piece,
		// together with the marks inside it, which is why the template is read whole and not chunk by chunk: an
		// expression can sit in the middle of an attribute value or of a comment.  What remains outside its
		// matches is text, and a mark there is matched on its own.
		return htmlChunks.join('\0').replace(htmlToken, (token, rawTag, rawName, rawText) => {

			// A <script>, <style> or <textarea>.  Its start tag is a tag like any other, and the marks in its text
			// are children, like those in any other text.
			if (rawTag)
				return inTag(rawTag) + rawText.replace(/\0/g, child);

			return token === '\0' ? child() : inTag(token);
		});
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
		this.scripts = Array.prototype.map.call(this.docFrag.querySelectorAll('script'), el => Path.get(el));

		// TODO: only find styles that have Paths in them?
		this.styles = Array.prototype.map.call(this.docFrag.querySelectorAll('style'), el => Path.get(el));

		// An id that would clobber a built-in element property is reported by Util.bindId(), which
		// asks the real component object, with `in`, at the moment the binding happens.  The check
		// that used to stand here asked Globals.div.hasOwnProperty(id) instead, and a freshly
		// created element has no own properties at all — every DOM property an element exposes
		// lives on its interface prototype — so that test could never be true and the error it
		// guarded was never reachable.
		this.ids = Array.prototype.map.call(this.docFrag.querySelectorAll('[id],[data-id]'), el => Path.get(el));

		this.hasEmbeds = this.ids.length > 0 || this.styles.length > 0 || this.scripts.length > 0;
	}

	/**
	 * Precompute a flat program that resolves every path's nodeMarker/nodeBefore in a cloned
	 * fragment with one childNodes access per unique node, sharing ancestor lookups between paths.
	 * Replaces per-path root-to-node walks in the hot NodeGroup creation path.
	 * Skipped for shells with components, whose clone() has special attribPaths behavior. */
	buildResolveProgram() {
		if (this.hasComponentPaths || !this.paths.length)
			return;

		let ops = [];
		let slotOf = new Map();
		let frag = this.docFrag;
		let nextSlot = 1;
		let getSlot = node => {
			if (node === frag)
				return 0;
			let s = slotOf.get(node);
			if (s === undefined) {
				// Two ways to reach a node, costing one pointer step each: walk forward from an
				// already-resolved earlier sibling, or take the parent's firstChild and walk
				// forward.  Sibling steps win whenever they're no more numerous, and they can
				// also spare the parent a slot of its own — in a row of cells, resolving each
				// <td> from the previous one is one step instead of firstChild plus its index.
				let d = 0, from = -1;
				for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
					d++;
					let ss = slotOf.get(sib);
					if (ss !== undefined) {
						from = ss;
						break;
					}
				}
				let index = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
				if (from >= 0 && d <= index + 1)
					ops.push(from, -d); // A negative step count means "walk nextSibling from that slot".
				else
					ops.push(getSlot(node.parentNode), index);
				s = nextSlot++;
				slotOf.set(node, s);
			}
			return s;
		};
		for (let path of this.paths) {
			path.markerSlot = getSlot(path.nodeMarker);
			path.beforeSlot = path.nodeBefore ? getSlot(path.nodeBefore) : -1;
		}

		this.resolveOps = ops;
		this.resolveSlots = new Array(nextSlot);

		// A lone root element means slot 1 is always that element, so a NodeGroup can clone the
		// element directly and seed slot 1 with it.  The first op pair is then always [0, 0]:
		// every marker is that element or inside it, and getSlot() gives an ancestor its slot
		// before the node that asked.  Embeds are excluded because their paths are
		// fragment-relative.
		this.singleRoot = !this.hasEmbeds && frag.childNodes.length === 1 && frag.firstChild.nodeType === 1;
		
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

		// The cache holds a pair of shells for each html: [parsed as html, parsed as svg].
		let entry = Globals.shells.get(htmlStrings);
		if (!entry) {
			entry = [];
			Globals.shells.set(htmlStrings, entry); // cache
		}
		let result = entry[+svgMode] ??= new Shell(htmlStrings, svgMode);

		lastHtmlStrings = htmlStrings;
		lastSvgMode = svgMode;
		lastShell = result;

		
		return result;
	}

	
}


let commentPlaceholder = `<!--!✨!-->`;

// What addPlaceholders() reads a template with, as the browser's own parser will read it.  The template arrives with
// a NUL character wherever an expression goes, and each alternative matches one thing in one piece, whatever marks
// are inside it.  Every alternative that has begun can end, at the end of the html if nowhere else, so the pattern
// never backtracks and its time grows with the length of the html and no faster.  The alternatives, in the order
// they are written in the pattern:
// 1. A comment.  Only its end closes it, so the quotes, apostrophes and '>' in its text mean nothing.  As in the
//    browser, <!--> and <!---> are whole comments, --!> ends one as --> does, and one that is never closed runs to
//    the end of the html.
//        <!--(?:-?>|[^]*?(?:--!?>|$))
// 2. The start tag of a <script>, <style> or <textarea> (group 1) and the text that follows it (group 3), up to
//    its end tag.  That text is not html: a '<' in it opens nothing and a quote in it means nothing, so `i<n` in a
//    script or `/* <b */` in a style must not be taken for a tag.  A self-closed <script/> or <style/> is left to
//    the next alternative, because inside an <svg> such a tag has no text, and outside one nobody writes it.
//    Two things the browser does are not followed here, because no template was found that needs them.  Inside
//    an <svg> the content of these elements is markup, so an expression in a tag or in a comment written there is
//    not found, and the template throws.  And <title>, <xmp>, <iframe>, <noembed> and <noframes> have such text
//    too but are not in the list (an <svg> <title> may hold markup), so a '<!--' that is never closed, or a
//    '<letter' before an expression, in the text of one of them is still read as html.
//        (<(script|style|textarea)(?=[\s/>])(?![^>]*\/>)(?:[^>=]|=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]*))*>?)([^]*?)(?=<\/\2(?=[\s/>])|$)
// 3. A tag, from its '<' through the '>' that closes it.  A quote opens a value only where a value can begin,
//    after '=', and the '>' inside a quoted value doesn't close the tag.  Anywhere else in the tag a quote is an
//    ordinary character, as the apostrophe is in title=don't.  A '<' opens a tag only before a letter or '/'.
//    Before anything else it is text, as it is before an expression: `${a} <${b}` compares two values.
//        <\/?[a-z](?:[^>=]|=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]*))*>?
// 4. Whatever else starts with '<!', '<?' or '</': a doctype, a processing instruction, an end tag without a name.
//    The browser makes a comment of it, or of <?x ...> a processing instruction in Chrome, or drops it, and in every
//    case it ends at the first '>', whatever quotes come before that.
//        <[!?/][^>]*>?
// 5. A mark that none of the above took, which is an expression among the children of a node.
//        \0
let htmlToken = /<!--(?:-?>|[^]*?(?:--!?>|$))|(<(script|style|textarea)(?=[\s/>])(?![^>]*\/>)(?:[^>=]|=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]*))*>?)([^]*?)(?=<\/\2(?=[\s/>])|$)|<\/?[a-z](?:[^>=]|=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]*))*>?|<[!?/][^>]*>?|\0/gi;

// A tag name with a dash in it, which is what makes an element a web component.  addPlaceholders()
// tests this on every tag it finds, and a match gets -solarite-placeholder appended to its tag name.  The name runs
// to where the browser's parser ends it, so that one holding other characters custom element names may have, such
// as my_tag-x or my-tag.v2, gets the suffix at its end.
// That way we can gather a component's constructor arguments and its children before we call its constructor;
// later PathToComponent.applyAll() replaces the placeholder tag with the real component.  The suffix is written in
// caps wherever it appears, so that the several copies of it in this project compress well.
// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
let isWebComponentTagName = /^<\/?[a-z][^\s\/>\0]*-[^\s\/>\0]*/i;

// Attributes inside a start tag after its tag name, used by addPlaceholders() to neutralize dynamic
// on* attributes without touching text inside quoted attribute values.
let tagAttrib = /([^\s\/>=]+)(\s*=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]*))?/g;

/**
 * Remove whitespace-only text children of table-structure elements, whose whitespace is never
 * rendered.  Only html elements count: an svg element may have one of these names, since the
 * parser gives no meaning to them there, and a selector matches it whatever its case.
 * @param docFrag {DocumentFragment} */
function stripTableWhitespace(docFrag) {
	for (let el of docFrag.querySelectorAll('table,thead,tbody,tfoot,tr'))
		if (el instanceof HTMLElement)
			for (let child of [...el.childNodes])
				if (child.nodeType === 3 && !child.nodeValue.trim())
					child.remove();
}

/**
 * Rename every `is` attribute to `_is`, rebuilding the element to do it.
 *
 * A component written as a dashed tag is neutralized in the shell by renaming the TAG
 * (`<my-tag>` becomes `<my-tag-SOLARITE-PLACEHOLDER>`), so the browser never recognizes the
 * placeholder and never upgrades it.  A customized built-in cannot be neutralized that way,
 * because its tag has to stay real:  a `<tr is="my-row">` that is not a `<tr>` is thrown out
 * by the parser's table rules.  So its ATTRIBUTE is renamed instead.
 *
 * Renaming the attribute in place is not enough.  `is` is also recorded in an internal slot on
 * the element, which removeAttribute() cannot clear and cloneNode() copies, so a placeholder
 * that was parsed with `is` stays a customized built-in as far as the browser is concerned.
 * Every clone of it is upgraded the moment it enters a document with a browsing context —
 * running the component's constructor on the placeholder, before PathToComponent has
 * instantiated the real element or evaluated the attribute expressions meant for it.  A
 * constructor that renders then renders the placeholder, whose children are the ones the user
 * declared, and those get handed to the real instance as if they were slot content.
 *
 * Building a fresh element and moving everything across is the only way to drop that slot.
 * It happens once per unique template, because Shells are cached, and never per render.
 *
 * @param docFrag {DocumentFragment} */
function renameIsAttribs(docFrag) {
	for (let el of docFrag.querySelectorAll('[is]')) {
		let clean = el.ownerDocument.createElement(el.tagName);
		for (let attrib of el.attributes)
			clean.setAttribute(attrib.name === 'is' ? '_is' : attrib.name, attrib.value);
		clean.append(...el.childNodes);
		el.replaceWith(clean);
	}
}

// One-entry memo for Shell.get().
let lastHtmlStrings = null, lastSvgMode = false, lastShell = null;


// The marks addPlaceholders() puts inside tags and comments, one for each expression there.  The second character of
// a mark counts up from this one, because a mark can be a whole attribute's name and an element can't have the same
// attribute twice.  Private-use characters are ones Unicode gives no meaning
// (https://en.wikipedia.org/wiki/Private_Use_Areas), but icon fonts put their glyphs there, as in
// data-icon="&#xe600;", so a template can hold them in its own text.  The noncharacter U+FDD0 in front of each mark
// is what tells the two apart: Unicode keeps the noncharacters for a program's own use, and no font or text has them.
let attribPlaceholder = 0xe000;
let marks = /\ufdd0[\ue000-\uf8ff]/g;

/** @typedef {boolean|string|number|function|Object|Array|Date|Node|Template} Expr */

/** Stand-in Shell for text NodeGroups, which are never parsed from html.  Its default field
 * values (no components, no live properties, no single-expression paths) are exactly what the
 * per-row code must see for a bare Text node, so ng.shell is never null. */
let textShell = new Shell();

/**
 * Are the child-node expressions of a stampable shell all primitives, so a row can carry them
 * as plain text nodes?
 * @param exprs {Expr[]}
 * @param nodesIdx {int[]} Shell.nodesPathIdx.
 * @return {boolean} */
function childrenArePrimitive(exprs, nodesIdx) {
	for (let i=0; i<nodesIdx.length; i++) {
		// Two typeof tests against literals rather than one typeof kept in a variable: the
		// engine compiles the first form to a type check and the second to a call that builds
		// the type's name.
		let v = exprs[nodesIdx[i]];
		if (typeof v !== 'string' && typeof v !== 'number')
			return false;
	}
	return true;
}

/**
 * Run a Shell's precomputed resolve program (see Shell.buildResolveProgram) into the shell's
 * shared slots array, which the caller has already seeded with its starting node.
 * Each node is reached with firstChild/nextSibling pointer walks instead of childNodes[index];
 * the live NodeList indexing is markedly slower, and the indices are small (markers are
 * elements, often the first child after whitespace stripping).  A negative step count means the
 * program reaches this node by walking forward from an earlier sibling's slot instead of from
 * its parent.
 * @param slots {Node[]} The shell's shared scratch array; slot 0 is the fragment.
 * @param ops {int[]} Flat [parentSlot, childIndex] pairs in dependency order.
 * @param i {int} Index of the first op pair to run; earlier pairs are pre-seeded by the caller.
 * @param s {int} Slot that pair fills.
 * @param end {int} Index just past the last op pair to run; pairs are in dependency order, so
 * stopping early leaves a fully resolved prefix of the slots.
 * @return {Node[]} slots, so callers can resolve and use it in one expression. */
function runResolveOps(slots, ops, i, s, end=ops.length) {
	for (; i<end; i+=2, s++) {
		let k = ops[i+1], node;
		if (k < 0) {
			node = slots[ops[i]];
			do
				node = node.nextSibling;
			while (++k < 0);
		}
		else {
			node = slots[ops[i]].firstChild;
			for (; k>0; k--)
				node = node.nextSibling;
		}
		slots[s] = node;
	}
	return slots;
}

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

	/** @type {Shell} The Shell this NodeGroup was cloned from, so the per-row code can read
	 * hasComponentPaths/hasLivePropPaths/pathsSingleExpr and the stamp program off it instead
	 * of copying them onto every instance and re-looking the Shell up on every apply.
	 * Text NodeGroups get the shared empty textShell, which reports false for all of them. */
	shell;

	/** @type {boolean} True until applyExprs() finishes the first time.
	 * While true, ancestor node caches can't reference this NodeGroup's nodes, so they don't need invalidation. */
	firstApply = true;

	/**
	 * @internal
	 * @type {Node[]} Cached result of getNodes() used only for improving performance.*/
	nodesCache;

	/** @type {?Node[]} Slot nodes resolved so far, by rewriteStamp() or by the dispatcher
	 * (stampSlots); a stamped group's element structure never changes while it stays stampable,
	 * so they're reused by every later rewrite and event, followed by the Text nodes of its
	 * whole-parent children (see stampSlots).
	 * Declared here so every NodeGroup keeps one monomorphic hidden class. */
	stampSlotsCache = null;

	/**
	 * The embeds that have work to do once the expressions are applied, which is when
	 * updateStyles() runs: each <style> mapped to its text content, so that updateStyles() sees
	 * when an expression has changed it, and each <script> that has yet to run mapped to null.
	 * applyExprs() checks this one field, so a group with neither pays for nothing more.
	 * @type {?Map<HTMLStyleElement|HTMLScriptElement, ?string>} */
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

		
		this.template = template;

		// JSX templates carry their list key on the Template (tagged templates instead set it via
		// a PathToKey during applyExprs).  Adopt it so the keyed reconciler sees ng.key uniformly.
		if (template.key !== undefined)
			this.key = template.key;

		// If it's just a text node, skip a bunch of unnecessary steps.
		// el can be an existing Text node to adopt, from PathToNodes' bare-text fast path.
		if (template.isText) {
			this.shell = textShell;
			this.closeKey = template.getCloseKey();
			this.startNode = this.endNode = el || Globals.doc.createTextNode(template.html[0]);
		}

		else {
			// Get a cached version of the parsed and instantiated html, and Paths:
			let shell = this.shell = Shell.get(template.html, template.svgMode);

			// The shell caches the close key so each new template doesn't repeat the WeakMap lookup.
			this.closeKey = shell.closeKey ??= template.getCloseKey();

			// A lone root element is cloned directly, skipping a throwaway fragment wrapper.
			// Only for child NodeGroups; RootNodeGroup's grafting expects a fragment.
			if (shell.singleRoot && parentPath !== null) {

				// A stampable row whose child text is all primitives is cloned from the shell's
				// master after its text nodes are written, so the clone arrives with the text in
				// place and no node below the root is ever touched (see Shell.stampMaster).  It
				// skips path creation entirely: the first applyExprs() routes to applyStamp(),
				// and paths are materialized only if the group is later rewritten with a
				// non-primitive child.  Anything else is cloned bare and gets real paths.
				let primitive = false;
				if (shell.stampable === true) {
					// One pass checks each child expression and writes it.  A row that turns
					// out to have a non-primitive child has then written some of its text into
					// the master for nothing, which is harmless: every row that is cloned from
					// the master writes all of the text nodes first.
					let idx = shell.nodesPathIdx, texts = shell.stampMasterTexts;
					let empty = shell.stampMasterEmpty, exprs = template.exprs;
					let i = 0;
					for (; i<idx.length; i++) {
						let v = exprs[idx[i]], tn = texts[i];
						if (typeof v !== 'string' && typeof v !== 'number')
							break;
						// An empty string leaves no text node at all, as every other path renders it.
						// The master's text node is taken out for such a row, and its cell is
						// remembered so the next row that has text can put it back.
						if (v === '') {
							if (!empty[i]) {
								empty[i] = tn.parentNode;
								tn.remove();
							}
						}
						else {
							if (empty[i]) {
								empty[i].append(tn);
								empty[i] = null;
							}
							tn.nodeValue = v;
						}
					}
					primitive = i === idx.length;
				}
				if (primitive) {
					this.startNode = this.endNode = shell.stampMaster.cloneNode(true);

					// A row that holds a form control finds its nodes now, while it is as the
					// template made it, and keeps them for its updates, its events and its
					// paths: by the time something needs them, a password manager may have put
					// an icon beside the input, and the nodes found by index from the root
					// would then be the wrong ones (see Shell.resolveAtCreate).
					if (shell.resolveAtCreate === true)
						this.stampSlots(shell.resolveSlots.length - 1);
				}
				else {
					let clone = shell.docFrag.firstChild.cloneNode(true);
					this.startNode = this.endNode = clone;
					this.setPathsFromFragment(clone, shell, 0, true);
				}

				// A row's delegated handlers stay in its template, and the dispatcher reaches
				// them through the row's root element (see isAnchored).  The store is written out
				// here because it runs once per row; registering the dispatchers, which happens
				// once per run of rows, is behind a call.  The two tests are isAnchored()'s for a
				// row in a list; keep them in step with it, or a row would be treated as anchored
				// without carrying the pointer and its handlers would go silent.
				if (shell.stampEventsByType !== null) {
					let rootNg = this.rootNg;
					if (rootNg.delegateAll === true) {
						this.startNode[rowNgKey] = this;
						if (rootNg[stampedShellKey] !== shell)
							registerRowDispatchers(rootNg, shell);
					}
				}
			}
			else {
				let shellFragment = shell.docFrag.cloneNode(true);

				if (shellFragment.nodeType === 11) { // DocumentFragment
					this.startNode = shellFragment.firstChild;
					this.endNode = shellFragment.lastChild;
				} else
					this.startNode = this.endNode = shellFragment;

				this.instantiate(shell, shellFragment, el, options);
			}
		}

		
	}

	/**
	 * Set up paths and embeds from the cloned fragment.
	 * RootNodeGroup overrides this with its more involved setup.
	 * @param shell {Shell}
	 * @param shellFragment {DocumentFragment|HTMLElement|Text}
	 * @param el {?HTMLElement} Unused here; used by RootNodeGroup.
	 * @param options {?object} Unused here; used by RootNodeGroup. */
	instantiate(shell, shellFragment, el, options) {
		// A non-stampable group must keep a non-null paths array; null is the stamped/text
		// sentinel, and reuse would otherwise route a path-less group through rewriteStamp(),
		// which only exists for stampable shells.  A zero-expression shell gets an empty array.
		this.setPathsFromFragment(shellFragment, shell);

		if (shell.hasEmbeds)
			this.activateEmbeds(shellFragment, shell);
	}


	/**
	 * Use the paths to insert the given expressions.
	 * Dispatches expression handling to other functions depending on the path type.
	 * @param exprs {(*|*[]|function|Template)[]}
	 * @param includeNonComponents {boolean} False to only apply component paths,
	 * used when the non-component exprs are known to be unchanged.
	 * @param lastExprs {?Expr[]} The expressions applied last time, when the caller has them.
	 * Paths that would provably do nothing with an unchanged expression are then skipped —
	 * see Path.skipIfSame.  A root template's event bindings are the usual beneficiaries:
	 * they are the same handlers on every render, and re-binding them costs a call apiece. */
	applyExprs(exprs, includeNonComponents=true, lastExprs=null) {

		

		let paths = this.paths;

		// Fast path: every path consumes exactly one expression and none are components,
		// so skip the bookkeeping that maps expressions to paths.
		if (this.shell.pathsSingleExpr) {
			if (includeNonComponents) {
				if (paths === null) { // Created from a stampable shell; no paths yet.
					// The constructor already proved a fresh row's children primitive.  A pooled
					// row whose child is no longer one gets real paths and is applied as usual.
					if (this.firstApply || childrenArePrimitive(exprs, this.shell.nodesPathIdx)) {
						this.applyStamp(exprs);
						return;
					}
					paths = this.materializePaths();
				}
				for (let i = paths.length - 1; i >= 0; i--) {
					let path = paths[i];
					if (lastExprs !== null && path.skipIfSame && lastExprs[i] === exprs[i])
						continue;
					path.applySingle(exprs[i]);
				}

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
			if (i===0 && path instanceof PathToComponent && path.nodeMarker === this.getRootEl())
				continue;

			// Get the expressions associated with this path.
			let exprCount = path.getExpressionCount();
			pathExprs[i] = exprs.slice(exprIndex-exprCount, exprIndex); // slice() probably doesn't allocate if the JS vm implements copy on write.
			exprIndex -= exprCount;

			// Component expressions don't have a corresponding user-provided expression.
			// They use expressions from the paths that provide their attributes.
			if (path instanceof PathToComponent) {
				let attribExprs = pathExprs.slice(i+1, i+1 + path.attribPaths.length); // +1 b/c we move forward from the component path.
				path.applyAll(attribExprs);
			}
			else if (includeNonComponents)
				path.applyAll(pathExprs[i]);
		}

		// If there's leftover expressions, there's probably an issue with the Shell that created this NodeGroup,
		// and the number of paths not matching.
		


		if (includeNonComponents) {

			// TODO: Only do this if we have Paths within styles?
			this.updateStyles();

			// Invalidate the nodes cache because we just changed it.
			this.nodesCache = null;

		}
		this.firstApply = false;

		
	}

	/**
	 * Write expressions into a freshly stamped (or pooled path-less) NodeGroup through the
	 * shell's shared stamper paths, allocating no per-instance Path objects.
	 *
	 * On a fresh row nothing below the root element is touched: the constructor cloned the
	 * row's child text in from the master, and delegated handlers are left in the template for
	 * the dispatcher to find (see isAnchored).  Only an attribute, a non-delegated event, or an
	 * unusual value resolves the row's nodes.  A pooled row being re-applied writes its child
	 * text.
	 * @param exprs {Expr[]} Its child-node expressions are all primitives; applyExprs() checks. */
	applyStamp(exprs) {
		let shell = this.shell;
		let firstApply = this.firstApply;

		// Run the shell's compiled stamp program: a flat opcode per path replaces per-path
		// applySingle() dispatch (see Shell.stampOp).  Nodes are resolved only when an op needs
		// one below the root, since each resolved node costs a JS wrapper.
		let ops = shell.stampOp, slotIdx = shell.stampSlot, aux = shell.stampAux;
		let stampers = shell.stampPaths;
		let anchored = isAnchored(this);
		// Slots are resolved as a prefix, up to the highest one any op has needed so far.  Marker
		// slots are non-decreasing in path order (Shell.buildResolveProgram allocates them in
		// document order), and this loop runs backwards, so the first op to need a node needs
		// the highest one and later ops fall inside that prefix; the check keeps it honest.
		// A row that holds a form control has had all of its nodes since it was made (see the
		// constructor).
		let slots = shell.resolveSlots, resolved = 1;
		if (shell.resolveAtCreate === true) {
			slots = this.stampSlotsCache;
			resolved = slots.length;
		}
		else
			slots[1] = this.startNode;
		for (let i = ops.length - 1; i >= 0; i--) {
			let v = exprs[i];
			let o = ops[i];

			// The list key never touches the DOM.
			if (o === 1) {
				this.key = v;
				continue;
			}

			// These need no node either.  Whole-parent child text: a fresh row had it cloned in
			// from the master.  A delegatable event on an anchored row: the handler lives in the
			// template, where the dispatcher reads it when the handler's turn comes (an invalid
			// value goes on to the stamper, which names the mistake).  A plain attribute on a
			// freshly cloned row: the shell left the attribute off, so an empty value means there
			// is simply nothing to write.
			if ((o === 2 && firstApply)
				|| (o === 3 && anchored && isHandler(v))
				|| (o === 4 && firstApply && v === ''))
				continue;

			// Everything else writes to the path's node.
			let s = slotIdx[i];
			if (s > resolved) {
				resolved = s;
				this.resolveStampSlots(shell, s);
			}
			let node = slots[s];

			// Whole-parent child text of a pooled row.
			if (o === 2) {
				node.textContent = v;

				// textContent replaced the Text node rewriteStamp() may have kept for this child.
				let kept = this.stampSlotsCache;
				if (kept !== null)
					kept[aux[i]] = undefined;
			}

			// A plain attribute holding one whole expression.  On a freshly cloned row it is known
			// to be absent, so a string can go straight in without reading the attribute back first.
			else if (o === 4 && firstApply && typeof v === 'string')
				node.setAttribute(aux[i], v);

			// A selection binding (h.selector().when()) does its own two stores.
			else if (o === 4 && typeof v === 'object' && v instanceof SelectorRef)
				v.bind(node, aux[i], this);

			// Everything else (odd attribute values, non-delegated events) goes through the
			// shared stamper's full applySingle() semantics.
			else {
				let stamper = stampers[i];
				stamper.nodeMarker = node;
				stamper.parentNg = this;
				stamper.applySingle(v);
			}
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
		let shell = this.shell;
		let newExprs = template.exprs;
		if (!childrenArePrimitive(newExprs, shell.nodesPathIdx))
			return false;

		let oldExprs = this.template.exprs;
		let stampers = shell.stampPaths, slotIdx = shell.stampSlot;
		let ops = shell.stampOp, aux = shell.stampAux;
		let anchored = isAnchored(this);
		let slots = this.stampSlotsCache; // Nodes are resolved only if something actually changed, then kept.
		for (let i = stampers.length - 1; i >= 0; i--) {

			// A delegatable event on an anchored row needs no write: the dispatcher reads the
			// handler from the row's template when the handler's turn comes, and the caller
			// assigns the new template as soon as this returns.  If an expression before this
			// one throws instead, keepReached() records this one as applied.
			let o = ops[i];
			if (o === 3 && anchored && isHandler(newExprs[i]))
				continue;
			let oldExpr = oldExprs[i], newExpr = newExprs[i];

			// A whole-parent text child.  Old and new are both primitives here (a stamped row's
			// children always are, and the new ones were checked above), so identity is the
			// whole comparison.  The row keeps the Text node it wrote last time next to its
			// resolved slots, so that the node's JS wrapper stays alive: after a garbage
			// collection, reading it through the marker would otherwise make a fresh wrapper for
			// a node the row will write on every later update anyway.  Writing the Text node's
			// value is cheaper than textContent, which replaces the node.
			if (o === 2) {
				if (oldExpr !== newExpr) {
					let v = typeof newExpr === 'number' ? newExpr + '' : newExpr;
					let ti = aux[i], s = slotIdx[i];
					if (slots === null || slots[s] === undefined)
						slots = this.stampSlots(s);
					let marker = slots[s], tn = marker.firstChild;

					// The marker holds one text node or nothing (an empty string leaves none), unless
					// other code has changed the cell since (a highlighter splitting the text, a
					// translator wrapping it, normalize() dropping an empty node), and the write
					// must then replace whatever is there.  The node the row kept is known to be a
					// Text node, which spares asking the browser for its type.
					if (tn !== null && tn === marker.lastChild && (tn === slots[ti] || tn.nodeType === 3))
						tn.nodeValue = v;
					else {
						marker.textContent = v;
						tn = marker.firstChild;
					}
					slots[ti] = tn;
				}
				continue;
			}

			// Live HTML properties (checked etc., boolean-valued) are exempt from the
			// unchanged-value skip: a user's click flips the DOM property underneath the cached
			// expression, and applySingle() compares against the live node before writing.
			// The identity test is inline because most expressions are unchanged, and reaching
			// exprSame() only to be told so costs more than the comparison itself.
			if ((oldExpr !== newExpr && !exprSame(oldExpr, newExpr))
				|| (o === 5 && typeof newExpr === 'boolean')) {
				let s = slotIdx[i];
				let stamper = stampers[i];
				stamper.nodeMarker = s === 1 ? this.startNode : (slots === null || slots[s] === undefined ? (slots = this.stampSlots(s))[s] : slots[s]);
				stamper.parentNg = this;
				try {
					stamper.applySingle(newExpr);
				}
				catch (e) {
					this.keepReached(template, i);
					throw e;
				}
			}
		}

		return true;
	}

	/**
	 * Record how far an update of this row got, when applying one of its expressions threw.
	 *
	 * A row's template says which expressions the row holds: the next render compares against
	 * it to decide what to write, and the dispatcher reads an anchored row's handlers from it
	 * (see isAnchored).  The code updating a row assigns the new template once every expression
	 * is applied, and applies them from the last to the first.  So after a throw the row holds
	 * the new expressions after the one that threw and the old ones up to and including it,
	 * and this gives it a template that says exactly that.  Its handlers are then the ones that
	 * listeners bound while rendering (eventDelegation:false) would be at this point, replaced
	 * as far as the throw and no further, and the next render writes what is still missing.
	 * Left with the old template, the row would show its new text while every handler still
	 * received the old item.
	 *
	 * The row gets a template of its own because neither of the other two may be changed:
	 * h.map() hands a row's Template out again for as long as its item stays the same.
	 * @param template {Template} The template that was being applied.
	 * @param at {int} Index of the expression that threw. */
	keepReached(template, at) {
		let old = this.template;
		this.template = Object.assign(new Template(), old, {
			exprs: template.exprs.map((expr, i) => i > at ? expr : old.exprs[i])
		});
	}

	/**
	 * Run the shell's resolve program from this NodeGroup's root element.
	 * Only valid for singleRoot shells, whose ops always start with the root's own pair.
	 * @param shell {Shell}
	 * @param upTo {int} The highest slot needed.  Every node the program reaches gets a JS
	 * wrapper if it has none yet, which is the expensive part, so a caller that needs one node
	 * near the start of the row shouldn't pay for the ones after it.
	 * @return {Node[]} The shell's shared scratch slots array. */
	resolveStampSlots(shell, upTo=shell.resolveSlots.length - 1) {
		let slots = shell.resolveSlots;
		// A singleRoot shell's first op pair is always [0, 0], so slot 1 is the row's own root
		// element and the program can start at the second pair.  Pair k fills slot k+1.
		slots[1] = this.startNode;
		return runResolveOps(slots, shell.resolveOps, 2, 2, upTo * 2);
	}

	/**
	 * The resolved nodes of this stamped row, kept from one rewrite to the next since a stamped
	 * row's element structure never changes.  Only as many slots as have ever been needed are
	 * resolved; the rest are filled the first time a later one is asked for.  The array is
	 * longer than the shell's slots: past them it has one entry per whole-parent text child
	 * (Shell.stampAux gives the index), where rewriteStamp() keeps the Text node it writes.
	 * @param upTo {int} The highest slot needed.
	 * @return {Node[]} A private array, holding at least slots 1 to upTo. */
	stampSlots(upTo) {
		let slots = this.stampSlotsCache;
		if (slots === null) {
			// The copy is required: resolveStampSlots fills the Shell's SHARED scratch array,
			// which the next row's resolve would overwrite.
			let shell = this.shell, scratch = this.resolveStampSlots(shell, upTo);
			slots = this.stampSlotsCache = new Array(scratch.length + shell.nodesPathIdx.length);
			for (let s=1; s<=upTo; s++)
				slots[s] = scratch[s];
		}

		// A row that has some of its slots goes on from the last of them, in its own array, and
		// keeps the ones it has.  Other code may have put nodes into the row since (a password
		// manager's icon beside an input), and the program run again from the row's root would
		// then find other nodes for those: a handler that worked would move to a neighbour, and
		// an update would write into it.  The program reaches each slot from its parent's or an
		// earlier sibling's, so the slots after the kept ones are found from the kept nodes.
		// Slot 1, the row's root, is always kept, which ends the search for the last one.
		else if (slots[upTo] === undefined) {
			let k = upTo - 1;
			while (slots[k] === undefined)
				k--;
			runResolveOps(slots, this.shell.resolveOps, k * 2, k + 1, upTo * 2);
		}
		return slots;
	}

	/**
	 * Create the real Path objects for a NodeGroup that was created by applyStamp().
	 * Called lazily, the first time the group is rewritten in place.
	 * Recovers the bare-text state of child-node paths that stamped a primitive.
	 * @return {Path[]} */
	materializePaths() {
		let shell = this.shell;
		let result = this.setPathsFromFragment(this.startNode, shell, 0, true);

		// A wholeParent child-node path that stamped a primitive left exactly one Text child.
		// The real paths track their own text from here on, so the Text nodes rewriteStamp()
		// kept for this row are let go; one that a template is about to replace would otherwise
		// stay referenced, detached, for as long as the row lives.
		let kept = this.stampSlotsCache, aux = shell.stampAux;
		for (let idx of shell.nodesPathIdx) {
			if (kept !== null)
				kept[aux[idx]] = undefined;
			let path = result[idx];
			let tn = path.nodeMarker.firstChild;
			if (tn !== null && tn.nodeType === 3 && tn === path.nodeMarker.lastChild) {
				path.textNode = tn;
				path.textValue = tn.nodeValue;
			}

			// Something else stands in the cell, such as the <font> of a page translator.  The
			// path is given a Text node of its own, out of the document, holding the text the row
			// drew there.  The path then finds that text replaced (see
			// PathToNodes.textReplaced()), and empties the cell when, and only when, it draws a
			// new value: a cell that keeps its value keeps its translation.
			else if (tn !== null)
				path.textNode = Globals.doc.createTextNode(path.textValue = '' + this.template.exprs[idx]);
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
	getRootEl() {
		return this.rootNg.rootEl;
	}

	/**
	 * Copy paths in fragment to this.paths.
	 * @param fragment {DocumentFragment|HTMLElement}
	 * @param shell {Shell}
	 * @param startingPathDepth {int}
	 * @param isRootClone {boolean} True when fragment is a direct clone of a singleRoot
	 * shell's root element: it fills slot 1 itself and the first op pair is skipped.
	 * @return {Path[]} this.paths */
	setPathsFromFragment(fragment, shell, startingPathDepth=0, isRootClone=false) {

		// Fast path: run the shell's precomputed resolve program (see Shell.buildResolveProgram).
		// Each Path.clone() would walk childNodes from the fragment root to its target node,
		// re-traversing the same ancestors for every path.  The program instead resolves each
		// unique node exactly once into the slots array:  ops is flat [parentSlot, childIndex]
		// pairs in dependency order, pair i filling slot i+1, with slot 0 being the fragment.
		// Paths then copy themselves via cloneWithNodes() using their precomputed slot indexes.
		// Only built for component-free shells, since PathToComponent.clone() has special
		// attribPaths behavior; pathOffset!==0 (root grafting) also uses the fallback.
		let ops = shell.resolveOps, slots = null;
		if (ops && startingPathDepth === 0) {
			// The root element is also this.startNode, so it seeds slot 1 itself.  A stamped row
			// that has found some of its nodes already goes on from those, as stampSlots()
			// explains; a row that holds a form control found them all when it was made.
			if (isRootClone)
				slots = this.stampSlotsCache !== null
					? this.stampSlots(shell.resolveSlots.length - 1)
					: this.resolveStampSlots(shell);
			else {
				slots = shell.resolveSlots;
				slots[0] = fragment;
				runResolveOps(slots, ops, 0, 1);
			}
		}

		// Each path copies itself onto this NodeGroup's own nodes: from the slots the resolve
		// program just filled when there is one, by its own walk from the root otherwise.
		let paths = shell.paths;
		let pathLength = paths.length; // For faster iteration
		let result = this.paths = new Array(pathLength);
		for (let i=0; i<pathLength; i++) {
			let p = paths[i];
			let path = slots !== null
				? p.cloneWithNodes(p.beforeSlot >= 0 ? slots[p.beforeSlot] : null, slots[p.markerSlot])
				: p.clone(fragment, startingPathDepth);
			path.parentNg = this;
			result[i] = path;
		}
		return result;
	}

	/**
	 * Scope again each style whose text an expression has changed, and run the scripts that were
	 * waiting for the expressions to be written (see activateEmbeds).  A script is taken off the
	 * list before it runs, so it runs once even if it throws. */
	updateStyles() {
		if (this.styles)
			for (let [el, oldText] of this.styles) {
				if (oldText === null) {
					this.styles.delete(el);
					// Indirect eval runs in global scope (correct for a <script> tag) and, unlike a direct
					// eval, doesn't force terser to keep every top-level name in the bundle unmangled.
					(0, eval)(el.textContent);
				}
				else if (oldText !== el.textContent)
					Util.bindStyles(el, this.rootNg.rootEl);
			}
	}

	/**
	 * @param root {HTMLElement|DocumentFragment}
	 * @param shell {Shell}
	 * @param pathOffset {int} */
	activateEmbeds(root, shell, pathOffset=0) {

		let rootEl = this.rootNg.rootEl;
		if (rootEl) {
			let options = this.rootNg.renderOptions;

			// ids
			if (options?.ids !== false) {
				for (let path of shell.ids) {
					let el = Path.resolve(root, path, pathOffset);
					Util.bindId(rootEl, el);
				}
			}

			// styles
			if (options?.styles !== false) {
				if (shell.styles.length)
					this.styles = new Map();
				for (let path of shell.styles) {
					/** @type {HTMLStyleElement} */
					let style = Path.resolve(root, path, pathOffset);
					if (rootEl.nodeType === 1) {
						Util.bindStyles(style, rootEl);
						this.styles.set(style, style.textContent);
					}
				}

			}
			// scripts
			// A script runs once the template's expressions are written, its own text among them, so
			// here it is only put on the list that updateStyles() works through when applyExprs() is
			// done.  Only a script the browser would run as a classic one is listed: with no type, or
			// a JavaScript type.  Any other type marks data that isn't code, such as a JSON-LD block or
			// the source of a template, and a module can't be run this way.  The legacy names
			// text/jscript, text/livescript and text/javascript1.x are left out.
			if (options?.scripts !== false)
				for (let path of shell.scripts) {
					let script = Path.resolve(root, path, pathOffset);
					if (/^((application|text)\/(x-)?(java|ecma)script)?$/i.test(script.type.trim()))
						(this.styles ??= new Map()).set(script, null);
				}

			// A template with no expressions has nothing to wait for, and a list doesn't apply one, so
			// its scripts run now.
			if (!shell.paths.length)
				this.updateStyles();
		}
	}

	
}

/**
 * Has these properties not present on NodeGroup, assigned by instantiate():
 * They're not declared as fields because subclass field initializers run after the
 * super constructor and would overwrite the assigned values.
 * @property {HTMLElement|DocumentFragment} rootEl - Root node at the top of the hierarchy: the element,
 *     DocumentFragment or ShadowRoot that was rendered into, or what a standalone template made.
 * @property {?object} renderOptions - RenderOptions
 * @property {?Node[]} slotMarks - Where this template put the children the element was given
 *     for its slots, and where its own nodes end in the element: for each place, the node they
 *     were appended to, the node that was its last child before, and the first node appended.
 *     Null for a standalone template.  See unrender().
 * @property {?string[]} copiedAttribs - Names of the attributes that were copied from the template's
 *     own root element onto the element, leaving out those a parent's template wrote over them.
 *     Null unless the two were merged.
 * @property {boolean} threw - True when the last render threw part-way through applying its
 *     expressions, so the next one has none to compare with.  See Template.render(). */
class RootNodeGroup extends NodeGroup {

	/**
	 * Special setup for the root: graft the fragment into el (or use it standalone),
	 * resolve paths and embeds against the root, then place the slot children.
	 * Called by the NodeGroup constructor. */
	instantiate(shell, shellFragment, el, options) {
		let startingPathDepth = 0;
		let component = null; // The placeholder of a component that is a standalone template's only node.
		this.renderOptions = options;

		// Every root is given both, whether it will use them or not, so that all roots have the
		// same properties in the same order.  Code that runs for every row and every event
		// reads the root (delegateAll, rootEl), and the engine keeps that read fast only while
		// the roots it meets there have few different shapes.
		this.slotMarks = this.copiedAttribs = null;
		this.threw = false;

		// Whether every delegatable event in this tree is delegated: any value other than false
		// or an array of event names means yes.  The stamp program and the dispatcher read this
		// per row, so it is worked out once here rather than from the options each time.
		let opt = options?.eventDelegation;
		this.delegateAll = opt !== false && !Array.isArray(opt);

		// A template of plain text, or an empty one, is a single Text node with no paths.
		let isText = shellFragment.nodeType === 3;
		let isEmpty = isText && !shellFragment.nodeValue;
		let slotChildren, handOff;
		if (el) {
			this.rootEl = el;

			// Save the children that belong in this component's <slot>, from one of two places:
			// 1. A hand-off parked by PathToComponent.applyAll() just before it constructed
			//    us, when this component was declared inside another template.  It carries
			//    the Constructor it was meant for, so an unrelated component built in the
			//    meantime -- a field initializer creating a menu, say -- leaves it alone.
			// 2. el.childNodes, when render() is called manually for the first time, and when
			//    another template takes the place of the one el held: unrender() leaves el
			//    holding nothing but these children, and leaves its entry in rootNodeGroups,
			//    without a root, to say so.  A hand-off is never for such an element.  One
			//    may be parked all the same, for a component of the same class that a parent
			//    template is constructing further up the call stack.
			// An addressed hand-off wins even when its node list is empty:  a component
			// declared as <my-tag></my-tag> is asking for an empty slot, not for whatever
			// its own constructor happened to put in the element.
			//
			// The hand-off is deliberately NOT cleared on read.  A component that builds
			// another instance of its OWN class while constructing cannot be told apart
			// from itself by any address, so both match; the inner one takes the nodes and
			// this outer one takes them straight back, which is the only thing that makes
			// that case work.
			handOff = Globals.rootNodeGroups.has(el) ? null : Globals.currentSlotChildren;
			if (handOff?.Constructor !== el.constructor)
				handOff = null;
			let mySlotNodes = handOff
				? handOff.nodes
				: (el.childNodes.length ? [...el.childNodes] : null);

			if (mySlotNodes) {
				slotChildren = Globals.doc.createDocumentFragment();
				slotChildren.append(...mySlotNodes);
			}

			// An empty template leaves the element empty.  That takes out what a component's
			// constructor put there when its slot children came by hand-off; without one, el
			// is empty by now.  An element that was rendered in the meantime is emptied too: a
			// slot child that is a custom element left the document just above, and its
			// disconnectedCallback may have rendered el.  That render had no slot children to
			// place, so this one takes its place.
			if (isEmpty || Globals.rootNodeGroups.get(el))
				el.textContent = '';

			if (isText) {
				if (!isEmpty)
					el.append(shellFragment);
			}

			// If el should replace the root node of the fragment.
			else if (isReplaceEl(shellFragment, el.tagName)) {
				el.append(...shellFragment.children[0].childNodes);

				// Copy attributes.  The names are kept so that unrender() takes off the
				// ones this template put there, and none that the element had already.
				// Nor any that the parent's template is about to write: a component that
				// renders from its constructor gets here before PathToComponent has copied
				// the placeholder's attributes onto it, and those belong to the parent.
				this.copiedAttribs = [];
				for (let attrib of shellFragment.children[0].attributes)
					if (!el.hasAttribute(attrib.name)) {
						el.setAttribute(attrib.name, attrib.value);
						if (!handOff?.el.hasAttribute(attrib.name))
							this.copiedAttribs.push(attrib.name);
					}

				// Go one level deeper into all of shell's paths.
				startingPathDepth = 1;
			}

			else
				el.append(...shellFragment.childNodes);
		}

		// Instantiate as a standalone element.  A template of plain text is its one Text node, which is what toEl('Hi')
		// gives, and what a template of text with a < or an & in it gives through the html parser below.
		else if (isText)
			this.rootEl = shellFragment;

		else {
			// The template is given back as one node only when one node is all it can draw:
			// trimming the whitespace and comment nodes off both ends of the fragment leaves
			// exactly one node, and no expression stands at the top level beside it.  The
			// expression has to be asked about on its own, because the list shows nothing of it:
			// what marks its place is a comment, which is trimmed, or the node next to it.
			// Taking that node for the root would hand it back alone, without what the
			// expression drew.  Anything else is given back in the fragment, all of it.
			let relevantNodes = Util.trimEmptyNodes(shellFragment.childNodes);
			let onlyChild = relevantNodes.length === 1 && !hasTopLevelExpr(shell) ? relevantNodes[0] : null;

			// A component is the one node that can't be the root.  What stands in the fragment
			// is only its placeholder: PathToComponent constructs the component and puts it in
			// the placeholder's place when the expressions are applied, and NodeGroup.applyExprs()
			// never asks it to for an element that is the root, because a root that names a
			// component is a component rendering its own tag.  As the root, the placeholder
			// itself came back from toEl(), and nothing was ever constructed.  So the fragment
			// stays the root, as it does when the component has a sibling beside it, and the
			// component is remembered as this group's one node (see startNode below).
			if (isComponent(onlyChild)) {
				component = onlyChild;
				onlyChild = null;
			}
			this.rootEl = onlyChild || shellFragment; // We return the whole fragment when calling h() with a collection of nodes.
		}

		// The paths are found where the template's nodes are now: in el, from one level down when
		// el took the place of the template's root element, and otherwise in the fragment they
		// were cloned in.  A standalone template's nodes are all still there, its one root
		// element included, so its paths are found from the fragment whatever the root is.
		if (!isText) {
			let nodes = el || shellFragment;
			try {
				this.setPathsFromFragment(nodes, shell, startingPathDepth);
				this.activateEmbeds(nodes, shell, startingPathDepth);
			}

			// A data-id that would overwrite a property of the element throws, and so can a
			// <script>.  The element is then given back as unrender() leaves it, so that the
			// next render finds no half-built template to take for slot children: without the
			// attributes copied from this template, and holding nothing but the children it
			// was given.  Children that came by hand-off go back to the placeholder they came
			// from.  When the render that threw is the one a component's constructor made, that
			// component is never used, and the parent's template hands them over again to the
			// one it builds next time.
			catch (e) {
				if (el) {
					for (let name of this.copiedAttribs || [])
						el.removeAttribute(name);
					el.textContent = '';
					(handOff?.el || el).append(...(slotChildren?.childNodes || []));
					Globals.rootNodeGroups.set(el, null);
				}
				throw e;
			}
		}

		// A root group's first and last node are its root, which is also what Template.render()
		// hands back for a standalone template.  The exception is the component above: there
		// they are its placeholder, and PathToComponent points both at the component when it
		// takes the placeholder's place, so that the component is what comes back.
		this.startNode = this.endNode = component || this.rootEl;

		Globals.rootNodeGroups.set(this.rootEl, this);

		// Setup slot children (deprecated)
		// They go in last, when this root is complete and registered.  A slot child that is a
		// custom element enters the document here, and its connectedCallback may render el; that
		// render then finds this root and applies its expressions to it, instead of building a
		// second root in an element that is half set up.
		//
		// Remember where they go, so that another template can take them over later, and where
		// the template's own nodes end in el: nodes other code appends to el after them are
		// taken over the same way, whether or not el was given children.
		// The nodes themselves are not kept: rows that a parent template draws among
		// them come and go, and the page may add and remove its own.  What is kept is
		// where they start, as the last node the template itself has in that place (null
		// when it has none).  The first slot child is kept beside it, for when that last
		// node has left that place, as a text node does when the browser's page translator
		// replaces it.  A last node that is the placeholder of a child component is replaced
		// by the component when it is built, and PathToComponent puts the component in the
		// placeholder's place here too.
		if (el) {
			let marks = this.slotMarks = [];
			if (slotChildren) {

				// An empty template shows nothing, so they stay in their fragment.
				if (isEmpty)
					marks.push(slotChildren, null, null);
				else {
					// Named slots.  Each takes the children with its name in their slot attribute,
					// and only those: an element deeper down with that attribute belongs to the
					// child that holds it, which may be a component with a slot of the same name.
					for (let slot of el.querySelectorAll('slot[name]')) {
						let name = slot.getAttribute('name');
						if (name) {
							let slotChildren2 = [...slotChildren.children].filter(child => child.getAttribute('slot') === name);
							marks.push(slot, slot.lastChild, slotChildren2[0]);
							slot.append(...slotChildren2);
						}
					}

					// The unnamed slot, or the end of el when there is none.
					let home = el.querySelector('slot:not([name])') || el;
					marks.push(home, home.lastChild, slotChildren.firstChild);
					home.append(slotChildren);
				}
			}

			// The end of el, when the slot children didn't go there.  The element itself is
			// never one of the nodes in a place, so it is in the list only as such a place.
			if (!marks.includes(el))
				marks.push(el, el.lastChild, null);
		}
	}

	/**
	 * Take this template out of the element, so that another one can be rendered into it, as
	 * a render() does that shows a loading message first and a list later.  Called by
	 * Template.render() when it is given an element that holds another template.
	 *
	 * The expressions of the new template mean nothing to the paths of this one, so nothing
	 * of this template can be kept: its nodes leave the element, with whatever they held (text
	 * typed into an input, the state of a child component), and so does what it wrote on the
	 * element itself.  The element is then as it was before its first render, holding only the
	 * children it was given for its slots, and the new template is rendered into it as into an
	 * element never rendered before.  Rendering this template again later builds new elements
	 * for the same reason. */
	unrender() {
		let el = this.rootEl;

		// 1. Find the slot children while they are still where this template put them (see
		// slotMarks), and the nodes other code put after the template: what each place holds
		// after the template's own nodes, which is all of it for a slot with nothing of its own,
		// and for the fragment and the element of an empty template.
		let slotNodes = [];
		let marks = this.slotMarks || [];
		for (let i=0; i<marks.length; i+=3) {
			let home = marks[i], before = marks[i+1], node = marks[i+2];
			if (!before)
				node = home.firstChild;
			else if (before.parentNode === home)
				node = before.nextSibling;
			for (; node && node.parentNode === home; node = node.nextSibling)
				slotNodes.push(node);
		}

		// 2. Take back what this template wrote on the element itself, which it does when its
		// one root element stands for the element (see isReplaceEl): the attributes copied from
		// that root, and its expressions.  Their paths are then pointed at a stand-in.  A switch
		// can come from inside a render of this template, when a child component it is building
		// renders this element again; that render carries on once the child returns, and what
		// it still has to write must not land on an element that now holds another template.
		// The stand-in is also where the old nodes go, so that they keep a common parent for
		// such a render to work in.  The path of the element as a component keeps pointing at
		// it, which is what makes applyExprs() pass it over, and rootEl stays as it is: an
		// event that started in the old nodes may still be on its way through them, and their
		// handlers are called with the element as `this`.
		// The template that made an element with h() or toEl() has paths on the element too, and
		// copied nothing onto it.  Those are the element's own definition, so they stay when a
		// template is rendered into it.
		let standIn = Globals.doc.createElement('div');
		for (let name of this.copiedAttribs || [])
			el.removeAttribute(name);
		if (this.copiedAttribs)
			for (let path of this.paths || [])
				if (path.nodeMarker === el && !(path instanceof PathToComponent)) {
					clearPath(path, el);
					path.nodeMarker = standIn;
				}

		// 3. Take the root off the element's entry (the entry stays, see instantiate()), then
		// give the element the slot children in place of everything it holds, in one call.
		// A custom element that leaves the document here has its disconnectedCallback run as
		// that call returns, and that code may render this element.  It then finds an element
		// in the state this function promises, and renders into it.
		// The old nodes are moved one at a time: a list at the top of a template can have more
		// rows than a function call takes arguments.
		Globals.rootNodeGroups.set(el, null);
		let old = [...el.childNodes];
		el.replaceChildren(...slotNodes);
		for (let node of old)
			if (!node.parentNode)
				standIn.append(node);

		// 4. Forget the id references into the nodes that left.  The new template binds its
		// own, and a name only this one had would otherwise still give a removed element.
		// The names are read as attributes: the id property of a <form> with a control named
		// "id" is that control.  An empty data-id with no id gives no name.
		for (let node of standIn.querySelectorAll('[id],[data-id]')) {
			let id = (node.getAttribute('data-id') || node.getAttribute('id'))?.split('.');
			if (id && delve(el, id) === node)
				delve(el, id, null);
		}
	}
}

/**
 * Take back what one path of a template wrote on the element the template was rendered into.
 * An attribute is removed.  An event handler cannot be taken off the element without knowing
 * how it was bound, so it is replaced with one that does nothing.
 * @param path {Path}
 * @param el {HTMLElement} */
function clearPath(path, el) {
	if (path instanceof PathToAttribs) {
		path.applySingle();
		if (path.jsxSub)
			clearPath(path.jsxSub, el);
	}
	else if (path instanceof PathToEvent && !path.attrValue)
		path.applySingle(() => {});
	else if (path instanceof PathToAttribValue)
		el.removeAttribute(path.attribName);
}


/**
 * Does the fragment have one child that's an element matching the tagname of el?
 * The tags are compared before the dash is looked for because el may be a DocumentFragment or a
 * ShadowRoot, which has no tagName at all.  Nothing equals undefined, so the answer for those is
 * no, and a template rendered into one is appended to it whole.
 * @param fragment {DocumentFragment}
 * @param tagName {string|undefined}
 * @returns {boolean} */
function isReplaceEl(fragment, tagName) {
	return fragment.children.length===1
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === tagName
		&& tagName.includes('-');
}

/**
 * Does the template have an expression at its top level, beside its nodes and not inside one of
 * them, as in `Total: ${n}` or `<h1>Fruit</h1>${rows}`?  What such an expression draws becomes
 * top-level nodes of the template too.  The template's html decides this and its values never do,
 * so that one template gives the same kind of result every time: an expression that draws
 * nothing this time is counted like any other.
 *
 * Such an expression is a path to nodes whose two markers are children of the shell's fragment.
 * One that is the only child of an element has no node before it, one inside a <style> or a
 * <script> has that element's text for its markers, and an expression in a comment that someone
 * commented out has a path of the base class, which draws nothing.
 * @param shell {Shell}
 * @returns {boolean} */
function hasTopLevelExpr(shell) {
	return shell.paths.some(path => path instanceof PathToNodes && path.nodeBefore?.parentNode === shell.docFrag);
}

/**
 * Does this node stand for a component?  That is an element with a dash in its tag name, or a
 * customized built-in, whose `is` attribute Shell renamed to `_is`: the same two tests by which
 * Shell decides that an element gets a PathToComponent.
 * @param node {?Node}
 * @returns {boolean} */
function isComponent(node) {
	return node?.nodeType === 1 && (node.tagName.includes('-') || node.hasAttribute('_is'));
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

	/** @type {*} List key for keyed diffing, set by JSX jsxTemplate()/jsxToTemplate() from a
	 * `key` prop.  Tagged templates instead carry their key as an expr at Shell.keyIndex; the
	 * keyed reconciler (PathToNodes) reads whichever is present. */
	key;

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

		
	}

	/**
	 * Render the main (root) template.
	 * @param el {?HTMLElement} Null if we're rendering to a standalone element.
	 * @param options {RenderOptions}
	 * @return {?DocumentFragment|HTMLElement} el, or what a standalone template made. */
	'render'(el=null, options={}) {
		if (el && Globals.queuedRenders.size)
			Globals.queuedRenders.delete(el);

		let ng = el && Globals.rootNodeGroups.get(el);

		// The expressions the element holds now, when it holds this same template.
		let lastExprs = null;

		// Creating the root nodegroup also instantiates it into el.  It registers itself under
		// its own rootEl, which is the element we were given, or -- when we were given none --
		// the root it made.
		if (!ng)
			ng = new RootNodeGroup(this, null, el, options);
		else {
			let last = ng.template;

			// A component renders the same template every time, so this one comparison is all
			// that the usual render pays for the two cases below.  Hand over the expressions it
			// applied last time; paths that can prove an unchanged expression is a no-op skip.
			// Not while firstApply is set: the group has then never been applied in full, because
			// its first render threw part-way, or because this render comes from inside it (a slot
			// child whose connectedCallback renders the element), and an expression that render
			// has not reached must not be taken as already in place.  Nor after a later render that
			// threw part-way (threw), which left the paths it reached holding its expressions and
			// the rest holding older ones than last's; this render clears the mark.
			if (last.html === this.html) {
				if (ng.threw)
					ng.threw = false;
				else if (last !== this && !ng.firstApply)
					lastExprs = last.exprs;
			}

			// Another template than the one the element holds, such as a list where a loading
			// message was.  Its expressions mean nothing to the paths of the old one, so the old
			// template is taken out and the render starts over, on an element that is as it
			// was before its first render.  Only a difference in the html itself counts.  Another
			// array holding the same strings has the same paths, and its expressions are applied to
			// the content the element holds, which stays: that is a template made from a string
			// (h('<b>Hi</b>')) or by code that builds the array for each render, and the same
			// literal written at two places.  The strings are compared in a function of their own
			// so that this one, which every render of every component runs, stays short and
			// creates nothing.
			else if (!sameStrings(last.html, this.html)) {
				ng.unrender();
				return this.render(el, options);
			}
		}

		try {
			ng.applyExprs(this.exprs, true, lastExprs);
		}
		catch (e) {
			ng.threw = true;
			throw e;
		}
		ng.template = this;

		// A standalone template returns the node it made, which is read only now that the
		// expressions are applied.  It is the group's root, except for a template whose only
		// node is a component: the component is constructed while its attribute expressions
		// are applied, and takes the place of the placeholder that stood for it until then.
		return el || ng.startNode;
	}

	getCloseKey() {
		// Use the joined html when debugging?  But it breaks some tests.
		//return '@'+this.html.join('|')
		return this.closeKey ??= this.exprs.length ? getObjectId(this.html) : this.html[0];
	}

}


/**
 * Do two arrays of html hold the same strings?  Used when the arrays are not the same array, to
 * tell a template that only looks new from one that is.
 *
 * This is Util.arraySame() over again, written exactly as that one is so that the two compress
 * as one.  It is a function of its own all the same, because the engine keeps what it has
 * learned about a function's arguments with the function.  Util.arraySame() is only ever given
 * arrays of nodes, which it compares at the speed of a pointer test.  Given the frozen arrays
 * of strings of a root that changes template a few times, it compares every array more slowly
 * for the rest of the page's life: a list of raw nodes then renders about a tenth slower
 * (measured in Chrome 154, 2026-10-02).
 * @param a {string[]}
 * @param b {string[]}
 * @return {boolean} */
function sameStrings(a, b) {
	let aLength = a.length;
	if (aLength !== b.length)
		return false;
	for (let i=0; i<aLength; i++)
		if (a[i] !== b[i])
			return false;
	return true;
}

/**
 * Do two templates produce identical content?
 * Compares expression values by identity, so no hashing or stringification is needed.
 * @param a {Template}
 * @param b {Template}
 * @return {boolean} */
function templatesSame(a, b) {
	if (a.html === b.html && a.svgMode === b.svgMode) {
		let ae = a.exprs, be = b.exprs;
		// Most expressions are identical between renders, so test that here rather than paying
		// a call into exprSame() to learn it.
		for (let i=0; i<ae.length; i++) {
			let x = ae[i], y = be[i];
			if (x !== y && !exprSame(x, y))
				return false;
		}
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
 * Used by PathToComponent for the hasChanged() function it passes to a component's render().
 * Plain JSON drops functions, writes every Node as {}, and throws on a cycle.  So the replacer, which JSON.stringify()
 * calls for every value, writes an id in place of each function, Node, and repeated or circular object, and a Template
 * as the id of its html with its exprs.
 * @param obj {*}
 * @returns {string} */
function getObjectHash(obj) {
	let seen = new Set();
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
 * The string getObjectHash() gives for a component's exprs, made faster when the data allows it.
 *
 * Most of getObjectHash()'s time is the browser calling its replacer for every value, not the work the replacer does.
 * And since V8 13.8 (Chrome 138), JSON.stringify() without a replacer takes a much faster path for plain data.  So the
 * data is first walked here, and if it holds nothing the replacer would change, the browser serializes it alone.  For
 * 10,000 rows of plain objects that is 2.8ms instead of 5.2ms.
 *
 * A function or Node given straight to an attribute, as in onSave=${fn}, is common, so those are replaced here with the
 * same id the replacer would write.  Not one with a toJSON() of its own though:  JSON.stringify() calls that first and
 * hands the replacer its result, so it's left for isPlainData() to send to getObjectHash().  Anything else the replacer
 * would change sends the caller to getObjectHash() too.
 *
 * Two cases can still give a different string than getObjectHash(), both contrived enough to leave alone:
 * 1. A Date whose toISOString() was replaced to return an object, or a plain object that borrows Date.prototype.toJSON,
 *    since isPlainData() trusts that toJSON() to give a string.
 * 2. A getter, or a Proxy trap, whose value changes between the walk's read and JSON.stringify()'s read.
 * @param exprs {Expr[][]} One array of values for each attribute.
 * @return {string|undefined} Undefined when the data needs getObjectHash(). */
function getPlainHash(exprs) {
	let top = exprs.map(values => values.map(value =>
		(typeof value === 'function' || value instanceof Node) && !value.toJSON ? getObjectId(value) : value));
	try {
		if (isPlainData(top, new Set()))
			return JSON.stringify(top);
	}
	catch {
		// Data nested so deep that a recursion overflowed, and that can happen on either side.  In JavaScriptCore
		// (Safari) the walk overflows first, since its JSON.stringify() goes much deeper.  In SpiderMonkey (Firefox)
		// the JSON.stringify() above overflows first.  In V8 the walk usually goes deeper than getObjectHash()'s
		// replacer, but not always once the page has deoptimized it.  Either way getObjectHash() then decides what
		// happens to such data, so this answers whenever getObjectHash() would.  The same goes for a Proxy whose trap
		// throws when the walk looks at it, which getObjectHash() never does.
	}
}

/**
 * Whether JSON.stringify() writes value the same way with and without getObjectHash()'s replacer:  nothing in it is a
 * function, Node, Template, repeated or circular object, or an object with a toJSON() of its own.  A Date's toJSON()
 * gives a string, which the replacer leaves alone.
 * @param value {*}
 * @param seen {Set<Object>} Every object found so far, which finds the repeated and circular ones.
 * @return {boolean} */
function isPlainData(value, seen) {
	if (typeof value !== 'object')
		return typeof value !== 'function';
	if (value === null)
		return true;
	if (seen.has(value) || value instanceof Node || value instanceof Template)
		return false;
	seen.add(value);
	if (typeof value.toJSON === 'function')
		return value.toJSON === Date.prototype.toJSON;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++)
			if (!isPlainData(value[i], seen))
				return false;
		return true;
	}
	for (let v of Object.values(value)) // The values JSON.stringify() writes:  own, enumerable, string keys.
		if (!isPlainData(v, seen))
			return false;
	return true;
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
		let templateEl = Globals.doc.createElement('template');
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
			throw new Error(`Solarite web component class ${obj.constructor.name} must extend HTMLElement.`);

		// Normal path
		if (!Globals.objToEl.has(obj)) {
			Globals.objToEl.set(obj, null);

			// The object's render() calls h(this), which is form 6 of h(): it renders the template
			// to a new element and leaves that element in objToEl.  The call can be written
			// plainly, because the build never renames `render`: build.js lists it under
			// mangle.properties.reserved, and Dist.toEl.object checks the minified build.
			obj.render();
			let el = Globals.objToEl.get(obj);
			Globals.objToEl.delete(obj);

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

let renderTemplateKey = Symbol('solariteRender');

// Unique default that detects h() called with no arguments.
// Using `arguments` alongside rest params would force the engine to materialize both per call.
let noArg = Symbol();

// TypeScript reads the JSDoc below wherever it checks JavaScript that imports this file instead
// of Solarite.d.ts, as Deno does and as an editor with checkJs does.  So its @overload tags give
// the same signatures as Solarite.d.ts:  one @param union would reject the TemplateStringsArray
// of every h`` call and give every call a union return type.  The /** @type {*} */ cast on the
// default keeps TypeScript from inferring the parameter as `symbol` from noArg.
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
 * Create Templates
 * 1. h`<b>Hello</b> ${'World'}!`      // Create Template that can later be used to create nodes.
 * 2. h('<b>Hello</b><u>Goodbye</u>'); // Create Template from string, that can later be used to create nodes.
 *
 * Add children to an element.
 * 3. h(el, h`<b>${'Hi'}</b>`, ?options)
 * 4. h(el, ?options)`<b>${'Hi'}</b>`   // typical path used in render(). Create template and render its nodes to el.
 *    el may also be a DocumentFragment or a ShadowRoot, and the template's nodes become its children.
 *
 * Create top-level element
 * 5. h()`Hello<b>${'World'}!</b>`
 *
 * 6. h(string, object, ...)           // Used for JSX
 *
 * @overload
 * @param {TemplateStringsArray} htmlStrings
 * @param {...*} exprs
 * @return {Template}
 *
 * @overload
 * @param {string|string[]} htmlStrings
 * @param {...*} exprs
 * @return {Template}
 *
 * @overload
 * @param {HTMLElement|DocumentFragment} el
 * @param {RenderOptions} [options]
 * @return {function(TemplateStringsArray, ...*):(HTMLElement|DocumentFragment)}
 *
 * @overload
 * @param {HTMLElement|DocumentFragment} el
 * @param {Template} template
 * @param {RenderOptions} [options]
 * @return {void}
 *
 * @overload
 * @param {Function|symbol} tag A component class, or Fragment, for JSX.
 * @param {?Object} props
 * @param {...*} children
 * @return {Template}
 *
 * @overload
 * @param {{render:Function}} obj
 * @return {function(TemplateStringsArray, ...*):void}
 *
 * @overload
 * @return {function(TemplateStringsArray, ...*):(Node|DocumentFragment)}
 *
 * @param {*} htmlStrings
 * @param {...*} exprs
 * @return {*} */
function h(htmlStrings=/** @type {*} */(noArg), ...exprs) {

	// 1. Tagged template: h`<div>...</div>`
	// Every other form lives in hOther(), so that this function is nothing but this test.  A
	// JavaScript engine promotes a function to faster code according to how much of the function
	// each call runs, and this branch is a few bytes of what used to be a very long function, so
	// the row template of a list had to be called several thousand times before it was promoted.
	// As a function of its own it is promoted within a few hundred calls.
	if (Array.isArray(htmlStrings))
		return new Template(htmlStrings, exprs);

	return hOther(htmlStrings, exprs);
}

/**
 * Every form of h() other than the tagged template.  See the numbered list above h().
 * @param htmlStrings {?HTMLElement|DocumentFragment|string|function():Template|{render:function()}|symbol}
 * @param exprs {*[]} The rest of h()'s arguments.
 * @return {Node|HTMLElement|Template|Function} */
function hOther(htmlStrings, exprs) {

	// 2. String to template, or JSX factory form h(tag, props, ...children)
	if (typeof htmlStrings === 'string' || htmlStrings instanceof String) {
		let tagOrHtml = htmlStrings;

		// 2a. JSX classic factory: h("tag", {props}, ...children)
		// The transform always passes props, as an object or null, and typeof null is 'object' too.
		// With no second argument it is 'undefined'.  jsxToTemplate() takes null props as none.
		if (typeof exprs[0] === 'object')
			return jsxToTemplate(tagOrHtml + '', exprs[0], exprs.slice(1));

		// 2b. Plain html string => template: h('<div>...</div>')
		else {
			let html = tagOrHtml;
			// If it starts with whitespace and then a tag, trim it.
			if (/^\s+</.test(html))
				html = html.trim();
			return new Template([html], []);
		}
	}

	// 2c. JSX classic factory for a component or Fragment: h(Component, {props}, ...children)
	// The transform passes the class/function (or the Fragment symbol) as the first argument.
	else if (typeof htmlStrings === 'function' || htmlStrings === Fragment) {
		return jsxToTemplate(htmlStrings, exprs[0], exprs.slice(1));
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
			// Options are cached with it, so the options of the element's first h(el, options)
			// call are the ones it keeps: they take effect when a RootNodeGroup is created for
			// the element, on its first render and whenever it is given another template than
			// the one it holds, and options passed to h(el, options) by any later render are
			// ignored, at a switch too.  A component passes the same options every time, so
			// that costs it nothing, and caching regardless of them saves an allocation on
			// every render of a component that passes an options object, which is how render()
			// is usually written.  h(el, template, options) uses the options it is given.
			let cached = parent[renderTemplateKey];
			if (cached)
				return cached;

			// Return a tagged template function that applies the tagged template to parent.
			let renderTemplate = (htmlStrings, ...exprs) => {
				Globals.rendered.add(parent);
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			};
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
	else if (typeof htmlStrings === 'object' && Globals.objToEl.has(htmlStrings)) {
		// The only thing that ever puts an object into objToEl is toEl(), and it rejects anything
		// that isn't a plain object before it does so, so an object that reaches here has already
		// been checked and re-checking it can never report anything.
		let obj = htmlStrings;

		// Jsx with h(this, <jsx>)
		if (exprs[0] instanceof Template) {
			let template = exprs[0];
			let el = template.render();
			Globals.objToEl.set(obj, el);
		}

		// h(this)`<div>...</div>`
		else
			return (...args) => {
				let template = h(...args);
				let el = template.render();
				Globals.objToEl.set(obj, el);
			};
	}
	// TODO: Handle other primitive types?
	else if (Util.isFalsy(htmlStrings))
		return new Template();

	else
		throw new Error('h() does not support argument of type: ' + (htmlStrings ? typeof htmlStrings : htmlStrings))
}

/**
 * Render a list, reusing each item's DOM for as long as the item is the SAME object.
 *
 * Treat items as immutable: to change a row, replace it with a new object rather than
 * mutating it in place, so its identity changes and it re-renders.  This is the contract
 * Solid's <For> and React's keyed lists use.  It takes no deps — the object identity IS
 * the dependency — so the call site stays a plain list with no caching code.
 *
 * A row is recognized by comparing its item with === against the items the same list drew
 * last time.  Nothing is remembered about an item outside the list it is drawn in, so one
 * object can appear in several h.map() lists.  Within one list each item should be distinct:
 * two positions holding the same item cannot be told apart once the list is reordered.
 * Items that are strings or numbers are compared the same way, so one equal to an item of
 * the last render keeps its row.
 *
 * h.immutableMap is the same function under a longer, self-documenting name; use whichever
 * reads better: h.map for brevity, h.immutableMap to flag the immutability contract.
 *
 * ${h.map(this.rows, row => h`<tr key=${row.id}>${row.label}</tr>`)}
 *
 * What comes back is a MappedList, not an array: it carries the items and the callback so
 * the reconciler can match a row to its item by identity and call the callback only for the
 * rows it can't match.  Put it straight into a template expression, as above; nested inside
 * an array, or returned from a function, it expands to Templates just the same.
 *
 * @param items {Array} The list to render.
 * @param fn {function(item:*):Template} Builds an item's Template; called only for new items.
 * @return {MappedList} */
h.map = (items, fn) => new MappedList(items, fn);

h.immutableMap = h.map;

/**
 * Create a selection that updates only the rows it affects.
 *
 * A highlight that moves from one row of a thousand to another changes two attributes.
 * Expressing it as ordinary state means calling render() and letting the reconciler walk the
 * list to rediscover that.  A selector writes those two attributes directly instead:
 *
 *	 class Table extends Solarite {
 *		 selected = h.selector();
 *
 *		 pick(row) {
 *			 this.selected.set(row.id);   // no render() call
 *		 }
 *
 *		 render() {
 *			 h(this)`<tbody>${h.map(this.rows, row =>
 *				 h`<tr key=${row.id} class=${this.selected.when(row.id, 'danger')}
 *					 onclick=${[this.pick, row]}>${row.label}</tr>`)}</tbody>`;
 *		 }
 *	 }
 *
 * when() must be a whole attribute value, not part of one and not element content, since it
 * owns that attribute for as long as the row exists.  An off value of '' leaves no attribute
 * behind at all.  Selection state lives on the selector, so it survives re-renders, and
 * set() is safe to call whether or not the rows are currently rendered.
 *
 * Two rules follow from how set() finds a row, and both throw a clear error rather than
 * misbehaving quietly.  **The rows must be keyed** — set() locates a row by looking its key
 * up in the list, so the row template needs a key=${...}.  And **the attribute must sit on
 * the row's own root element**, the same one that carries the key, because that is the
 * element set() writes.  Drawing a row costs nothing either way: when() hands back one of
 * two shared objects rather than allocating anything per row, so a selector is free to
 * render over a list of any size and only a change of selection does any work.
 *
 * @param key {*} The initially selected key, or null for none.
 * @return {Selector} */
h.selector = key => new Selector(key);

/**
 * Convert an attribute string with the given converter: Number, Boolean, String, Date,
 * or any function taking the string and returning a value.  Boolean is true for any string
 * except 'false' and '0', so a bare attribute like `<my-timer auto-start>` reads as true.
 * Date uses new Date(value).  No converter returns the string unchanged. */
function convertType(value, type) {
	if (type === Date)
		return new Date(value);
	if (type === Boolean)
		return !['false', '0'].includes(value);
	// Number and String need no cases of their own: they're plain functions, so the custom
	// branch below calls them correctly.  Date and Boolean are the ones that can't fall through
	// (Date without `new` returns a string; Boolean('false') is true).
	if (type) // Number, String, or a custom string=>value function
		return type(value);
	return value;
}

/**
 * Read an element's html attributes onto fields that already exist on the element.
 * Typically called from a web component constructor to support plain-html instantiation
 * like `<my-timer duration="7" auto-start>`.  Tagged-template values are already typed and
 * arrive in the constructor's argument instead, so assign those directly.
 *
 * Attribute names convert from kebab-case to camelCase, so `auto-start` becomes `autoStart`.
 * An attribute written like `${...}` is JSON-parsed back to its original type and assigned
 * as-is.  Every other attribute value is a string: if its field is named in `types`, the
 * string is cast with that converter, otherwise it's assigned as a string.
 *
 * `types` maps a field name to a converter: Number, Boolean, String, Date, or any function
 * taking the string and returning a value.  Boolean is true for any string except 'false'
 * and '0', so a bare attribute like `<my-timer auto-start>` reads as true.  Date uses
 * new Date(value).  No type is inferred from the field's existing value.
 *
 * Field names listed in `ignore` are skipped.
 * @param dest {HTMLElement}
 * @param types {Object<string, Function>}
 * @param ignore {string[]} */
function assignAttributes(dest, types={}, ignore=[]) {
	for (let attrib of dest.attributes) {
		let name = Util.dashesToCamel(attrib.name);
		if (!(name in dest) || ignore.includes(name))
			continue;

		let value = attrib.value;
		let type = types[name];

		// 1. A `${...}` attribute holds an already-typed JSON value.
		if (value.startsWith('${') && value.endsWith('}'))
			dest[name] = JSON.parse(value.slice(2, -1));

		// 2. Cast the string with the converter named in `types`, if any.
		else if (type)
			dest[name] = convertType(value, type);

		// 3. No converter named: assign the raw string.  But an empty value over a function/object
		// field is just the serialization residue of a template expression (functions render as
		// attribute="") — skip it, or it clobbers the real value the expression already assigned.
		else if (value !== '' || !(typeof dest[name] === 'function' || (typeof dest[name] === 'object' && dest[name] !== null)))
			dest[name] = value;
	}
}

/*
┏┓  ┓    •
┗┓┏┓┃┏┓┏┓┓╋▗▖
┗┛┗┛┗┗┻╹ ╹╹┗
JavasCript UI library
@license MIT
@copyright Vorticode LLC
https://eric-frost.github.io/solarite/ */

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
	 * Fill in and fix up the attribs object a component's constructor receives, so the component
	 * can then copy those values onto its own fields, e.g. with Object.assign(this, attribs).
	 *
	 * 1.  If attribs is an empty object, fill it with the attributes on the DOM element.
	 *     This happens when the browser creates the element from plain html, because then nothing
	 *     calls the constructor with arguments.  Attribute names convert from dash-case to
	 *     camelCase, and `${...}` values are parsed from JSON.
	 * 2.  If types is given, convert attribs values from strings to those types.  Attribute values
	 *     written as literal text always arrive as strings, whether from plain html or from an h()
	 *     template.  types maps a field name to Number, Boolean, String, Date, or any function
	 *     taking the string and returning a value.  Boolean is true for every string except
	 *     'false' and '0', so a bare attribute like `<select-box-3 editable>` becomes true.
	 *     Values that are already not strings, like a `${true}` template expression, are left alone.
	 *
	 * This runs before the subclass initializes its fields and renders, so converted values are
	 * right the first time, even for fields that change what render() builds.  This constructor
	 * can't copy attribs onto fields itself, because subclass field initializers run after it
	 * finishes and would overwrite them; that's why the subclass does the final assign.
	 * @param attribs {?Record<string, any>=}
	 * @param types {?Record<string, Function>=} */
	constructor(attribs, types) {
		super();

		if (attribs) {
			if (typeof attribs !== 'object')
				throw new Error('First argument must be an object.');

			// 1. Populate attribs if it's an empty object.
			if (!Object.keys(attribs).length)
				Object.assign(attribs, Solarite.getAttribs(this));

			// 2. Convert string values to the types the component declares.
			for (let name in types || {})
				if (typeof attribs[name] === 'string')
					attribs[name] = convertType(attribs[name], types[name]);
		}
	}

	'render'() {
		throw new Error('render() is not defined for ' + this.constructor.name);
	}

	/**
	 * Call render() only if it hasn't already been called.	 */
	'renderFirstTime'() {
		if (!Globals.rendered.has(this)) {
			let attribs = Solarite.getAttribs(this);
			this.render(attribs); // calls Globals.rendered.add(this); inside the call to h()'...'.
		}
	}

	/**
	 * Schedule render() to run once on the next microtask, coalescing repeated calls in the
	 * same tick.  A synchronous render of the element cancels the queued microtask and
	 * resolves the returned Promise, and an element removed from the DOM skips rendering.
	 * @return {Promise<void>} */
	'queueRender'() {
		let promise = Globals.queuedRenders.get(this);
		if (promise)
			return promise;

		if (this.isConnected)
			Globals.connected.add(this);
		else if (Globals.connected.has(this))
			return Promise.resolve();

		promise = Promise.resolve().then(() => {
			if (Globals.queuedRenders.get(this) !== promise)
				return;
			Globals.queuedRenders.delete(this);
			if (!Globals.connected.has(this) || this.isConnected)
				this.render();
		});
		Globals.queuedRenders.set(this, promise);
		return promise;
	}

	/**
	 * Called automatically by the browser. */
	'connectedCallback'() { // quoted so terser doesn't remove it.
		Globals.connected.add(this);
		this.renderFirstTime();
	}

	static 'define'(tagName) {
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

export default h;
export { Fragment, Globals, JsxAttr as InternalJsxAttr, MappedList, Selector, SelectorRef, Solarite, Util as SolariteUtil, Template, assignAttributes, convertType, delve, getEventBinding, h, jsxToTemplate as internalJsxToTemplate, svg, toEl };
