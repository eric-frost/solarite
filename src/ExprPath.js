import {assert} from "./assert.js";
import delve from "./delve.js";
import NodeGroup from "./NodeGroup.js";
import Util, {setIndent} from "./Util.js";
import Template from "./Template.js";
import Globals from "./Globals.js";
import MultiValueMap from "./MultiValueMap.js";
import udomdiff from "./udomdiff.js";

/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup. */
export default class ExprPath {

	/**
	 * @type {ExprPathType} */
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
	 * @type {?function} The most recent callback passed to a .map() function in this ExprPath.
	 * TODO: What if one ExprPath has two .map() calls?  Maybe we just won't support that. */
	mapCallback

	isHtmlProperty;

	/**
	 * @param nodeBefore {Node}
	 * @param nodeMarker {?Node}
	 * @param type {ExprPathType}
	 * @param attrName {?string}
	 * @param attrValue {string[]} */
	constructor(nodeBefore, nodeMarker, type=ExprPathType.Content, attrName=null, attrValue=null) {

		// If path is a node.
		this.nodeBefore = nodeBefore;
		this.nodeMarker = nodeMarker;
		this.type = type;
		this.attrName = attrName;
		this.attrValue = attrValue;
		if (type === ExprPathType.AttribMultiple)
			this.attrNames = new Set();
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
			case 1: // PathType.Content:
				this.applyNodes(exprs[0], freeNodeGroups);
				break;
			case 2: // PathType.Multiple:
				this.applyMultipleAttribs(this.nodeMarker, exprs[0]);
				break;
			case 4: // PathType.Comment:
				// Expressions inside Html comments.  Deliberately empty because we won't waste time updating them.
				break;
			case 5: // PathType.Event:
				this.applyEventAttrib(this.nodeMarker, exprs[0], this.parentNg.rootNg.root);
				break;
			default: // 3 PathType.Attribute
				// One attribute value may have multiple expressions.  Here we apply them all at once.
				this.applyValueAttrib(this.nodeMarker, exprs);
				break;
		}
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
		assert(this.type === ExprPathType.Event);
		assert(root?.nodeType === 1);
		/*#ENDIF*/

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

	/**
	 * Set the value of an attribute.  This can be for any attribute, not just attributes named "value".
	 * @param node
	 * @param exprs */
	// TODO: node is always this.nodeMarker?
	applyValueAttrib(node, exprs) {
		let expr = exprs[0];

		// Two-way binding between attributes
		// Passing a path to the value attribute.
		// Copies the attribute to the property when the input event fires.
		// value=${[this, 'value]'}
		// checked=${[this, 'isAgree']}
		// This same logic is in NodeGroup.instantiateComponent() for components.
		if (Util.isPath(expr)) {
			let [obj, path] = [expr[0], expr.slice(1)];

			if (!obj)
				throw new Error(`Solarite cannot bind to <${node.tagName.toLowerCase()} ${this.attrName}=\${[${expr.map(item => item ? `'${item}'` : item+'').join(', ')}]}>.`);

			let value = delve(obj, path);

			// Special case to allow setting select-multiple value from an array
			if (this.attrName === 'value' && node.type === 'select-multiple' && Array.isArray(value)) {
				// Set the .selected property on the options having a value within value.
				let strValues = value.map(v => v + '');
				for (let option of node.options)
					option.selected = strValues.includes(option.value)
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
			}

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
			let multiple = this.attrValue;
			if (!multiple) {
				Globals.currentExprPath = this; // Used by watch()
				if (typeof expr === 'function') {
					if (this.isComponent) { // Don't evaluate functions before passing them to components
						return
					}
					this.watchFunction = expr; // The function that gets the expression, used for renderWatched()
					expr = expr();
				}
				else
					expr = Util.makePrimitive(expr);
				Globals.currentExprPath = null;
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
				let joinedValue;
				if (multiple) {
					let value = [];
					for (let i = 0; i < this.attrValue.length; i++) {
						value.push(this.attrValue[i]);
						if (i < this.attrValue.length - 1) {
							Globals.currentExprPath = this; // Used by watch()
							let val = Util.makePrimitive(exprs[i]);
							Globals.currentExprPath = null;
							if (!Util.isFalsy(val))
								value.push(val);
						}
					}
					joinedValue = value.join('')
				}

				// If the attribute is one expression with no strings:
				else
					joinedValue = expr;

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
	 * Call function when eventName is triggerd on node.
	 * @param node {HTMLElement}
	 * @param root {HTMLElement}
	 * @param key {string}
	 * @param eventName {string}
	 * @param func {function}
	 * @param args {array}
	 * @param capture {boolean} */
	bindEvent(node, root, key, eventName, func, args, capture=false) {
		let nodeEvents = Globals.nodeEvents.get(node);
		if (!nodeEvents) {
			nodeEvents = {[key]: new Array(3)};
			Globals.nodeEvents.set(node, nodeEvents);
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
			}

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
		let path = this.nodeMarkerPath;
		let pathLength = path.length - pathOffset;
		for (let i=pathLength-1; i>0; i--) // Resolve the path.
			root = root.childNodes[path[i]];
		let childNodes = root.childNodes;

		nodeMarker = pathLength
			? childNodes[path[0]]
			: newRoot;
		if (this.nodeBefore)
			nodeBefore = childNodes[this.nodeBeforeIndex];

		let result = new this.constructor(nodeBefore, nodeMarker, this.type, this.attrName, this.attrValue);
		result.isComponent = this.isComponent;

		//#IFDEV
		result.verify();
		//#ENDIF

		return result;
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

		if (this.type === ExprPathType.AttribValue || this.type === ExprPathType.AttribMultiple) {
			return [this.nodeMarker];
		}

		let result

		// This shaves about 5ms off the partialUpdate benchmark.
		result = this.nodesCache;
		if (result) {
			//#IFDEV
			//this.checkNodesCache();
			//#ENDIF
			return result
		}

		result = [];
		let current = this.nodeBefore.nextSibling;
		let nodeMarker = this.nodeMarker;
		while (current && current !== nodeMarker) {
			result.push(current)
			current = current.nextSibling
		}

		this.nodesCache = result;
		return result;
	}

	//#IFDEV

	/** @return {HTMLElement|ParentNode} */
	getParentNode() {
		return this.nodeMarker.parentNode
	}

	verify() {
		if (!window.verify)
			return;

		assert(this.type!==ExprPathType.Content || this.nodeBefore)
		assert(this.type!==ExprPathType.Content || this.nodeBefore.parentNode)

		// Need either nodeMarker or parentNode
		assert(this.nodeMarker)

		// nodeMarker must be attached.
		assert(!this.nodeMarker || this.nodeMarker.parentNode)

		// nodeBefore and nodeMarker must have same parent.
		assert(this.type!==ExprPathType.Content || this.nodeBefore.parentNode === this.nodeMarker.parentNode)

		assert(this.nodeBefore !== this.nodeMarker)
		assert(this.type!==ExprPathType.Content|| !this.nodeBefore.parentNode || this.nodeBefore.compareDocumentPosition(this.nodeMarker) === Node.DOCUMENT_POSITION_FOLLOWING)

		// Detect cyclic parent and grandparent references.
		assert(this.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath?.parentNg?.parentPath !== this)

		for (let ng of this.nodeGroups)
			ng.verify();

		// Make sure the nodesCache matches the nodes.
		this.checkNodesCache();
	}
	//#ENDIF
}

/**
 * @enum {int}
 * @deprecated for different class types. */
export const ExprPathType = {
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
}