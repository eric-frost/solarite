import assert from "./assert.js";
import PathToAttribValue from "./PathToAttribValue.js";

// TODO: Merge this into PathToAttribValue?
export default class PathToEvent extends PathToAttribValue {

	constructor(nodeBefore, nodeMarker, attrName=null, attrValue=null) {
		super(null, nodeMarker, attrName, attrValue);
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

		// Don't bind events to component placeholders.
		// PathToComponent will do the binding later when it instantiates the component.
		if (this.isComponentAttrib && this.nodeMarker.tagName.endsWith('-SOLARITE-PLACEHOLDER'))
			return;

		let expr = exprs[0];
		let root = this.parentNg.rootNg.root

		/*#IFDEV*/
		assert(root?.nodeType === 1);
		/*#ENDIF*/

		let node = this.nodeMarker;

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