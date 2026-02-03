import Path from "./Path.js";
import Globals from "./Globals.js";
import Util from "./Util.js";
import delve from "./delve.js";
import assert from "./assert.js";

export default class PathToAttribValue extends Path {

	/** @type {?string} Used only if type=AttribType.Value. */
	attrName;

	/**
	 * @type {?string[]} Used only if type=AttribType.Value. If null, use one expr to set the whole attribute value. */
	attrValue;

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
			this.bindEvent(node, this.parentNg.getRootNode(), this.attrName, 'input', func, [], true);
		}

		// Regular attribute
		else {
			// Cache this on Path.isHtmlProperty when Shell creates the props.
			// Have Path.clone() copy .isHtmlProperty?
			let isProp = this.isHtmlProperty;

			// Values to toggle an attribute
			if (!multiple) {
				Globals.currentPath = this; // Used by watch()
				if (typeof expr === 'function') {
					if (this.isComponentAttrib)
						return;

					this.watchFunction = expr; // The function that gets the expression, used for renderWatched()
					expr = expr();
				}
				else
					expr = Util.makePrimitive(expr);
				Globals.currentPath = null;
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
					: expr 	// If the attribute is one expression with no strings

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
				Globals.currentPath = this; // Used by watch()
				let val = Util.makePrimitive(exprs[i]);
				Globals.currentPath = null;
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
}