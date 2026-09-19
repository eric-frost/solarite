import assert from "./assert.js";
import PathToAttribValue, {delegatedKeyFor} from "./PathToAttribValue.js";
import {nativeEventPrefix} from "./Util.js";

// TODO: Merge this into PathToAttribValue?
export default class PathToEvent extends PathToAttribValue {

	/** @type {string} The attribName without the "on" prefix. */
	eventName;

	/** @type {symbol|undefined} Expando key nodes store this event's delegated handler under.
	 * Undefined for non-delegatable (non-bubbling) events; bindEvent() then binds directly. */
	delegatedKey;

	/** @type {boolean} True for `native:onclick`: the handler is registered with addEventListener
	 * when the template renders, so it runs at its element's own turn in the browser's dispatch
	 * order instead of being delegated to the component root. */
	native;

	constructor(nodeBefore, nodeMarker, attribName=null, attrValue=null) {
		super(null, nodeMarker, attribName, attrValue);
		this.skipIfSame = true;
		let name = attribName;
		this.native = name !== null && name.startsWith(nativeEventPrefix);
		if (this.native)
			name = name.slice(nativeEventPrefix.length);
		this.eventName = name ? name.slice(2) : null;

		// A native binding leaves delegatedKey undefined.  That is the single switch both
		// bindEvent() and the compiled stamp program test to choose the direct
		// addEventListener path, so nothing else has to know about the prefix.
		this.delegatedKey = (this.eventName !== null && !this.native) ? delegatedKeyFor(this.eventName) : undefined;
	}

	/**
	 * Handle attributes for event binding, such as:
	 * onclick=${(e, el) => this.doSomething(el, 'meow')}
	 * oninput=${[this.doSomething, 'meow']}
	 * onclick=${[this, 'doSomething', 'meow']}
	 *
	 * @param exprs {Expr[]} Only the first is used.*/
	applyAll(exprs) {
		//#IFDEBUG
		assert(Array.isArray(exprs));
		//#ENDIF

		// Tested by Solariate.events.classicWithExpr
		// We have expressions within a string attribute value that's not a Solarite event.  E.g.
		// <div onclick="alert(${1});"
		if (this.attrValue?.length > 1) {
			super.applyAll(exprs);
			return;
		}

		this.applySingle(exprs[0]);
	}

	/**
	 * @param expr {Expr} */
	applySingle(expr) {
		// Expressions within a string attribute value that's not a Solarite event.
		if (this.attrValue?.length > 1)
			return super.applyAll([expr]);

		// Don't bind events to component placeholders.
		// PathToComponent will do the binding later when it instantiates the component.
		if (this.isComponentAttrib && this.nodeMarker.tagName.endsWith('-SOLARITE-PLACEHOLDER'))
			return;

		let root = this.parentNg.rootNg.rootEl

		/*#IFDEBUG*/
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
			throw new Error(`Solarite: ${this.attribName}=\${...} is not a function.`);

		this.bindEvent(node, root, eventName, eventName, func, expr);
	}



}