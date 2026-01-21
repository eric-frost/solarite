import ExprPath, {ExprPathType} from "./ExprPath.js";
import {assert} from "./assert.js";
import ExprPathAttribValue from "./ExprPathAttribValue.js";

// TODO: Merge this into ExprPathAttribValue?
export default class ExprPathEvent extends ExprPathAttribValue {

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

}