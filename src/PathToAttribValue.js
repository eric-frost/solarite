import Path from "./Path.js";
import Util from "./Util.js";
import delve, {isDelvePath} from "./delve.js";
import assert from "./assert.js";

export default class PathToAttribValue extends Path {

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

		// One stable EventBinding object per node+key is registered with addEventListener
		// and dispatches to the current func/args.  This way, assigning a new function
		// (e.g. a fresh arrow function on each render) never needs add/removeEventListener.
		// Most nodes have one binding, stored directly; a second key upgrades to a map.
		let nodeEvents = node[eventBindingsKey];
		if (nodeEvents === undefined) {
			let b = node[eventBindingsKey] = new EventBinding(root, node, key, func, funcAndArgs);
			node.addEventListener(eventName, b, capture);
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
				node.addEventListener(eventName, binding, capture);
				return;
			}
		}
		else {
			binding = nodeEvents[key];
			if (!binding) {
				binding = nodeEvents[key] = new EventBinding(root, node, key, func, funcAndArgs);
				node.addEventListener(eventName, binding, capture);
				return;
			}
		}
		binding.root = root;
		binding.func = func;
		binding.args = funcAndArgs;
	}
}

const eventBindingsKey = Symbol('solariteEvents');

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