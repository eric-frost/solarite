import assert from "./assert.js";
import PathToAttribValue from "./PathToAttribValue.js";

// TODO: Merge this into PathToAttribValue?
export default class PathToEvent extends PathToAttribValue {

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

		let root = this.parentNg.rootNg.root

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