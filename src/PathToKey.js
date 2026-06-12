import Path from "./Path.js";

/**
 * Consumes the key=${expr} expression of a keyed template.
 * Writes the value to its NodeGroup's key field and never touches the DOM.
 * Created by Shell when it strips a key attribute; PathToNodes.applyKeyed()
 * matches NodeGroups to new templates by this key. */
export default class PathToKey extends Path {

	/**
	 * @param exprs {Expr[]} Only the first is used. */
	apply(exprs) {
		this.parentNg.key = exprs[0];
	}

	applySingle(expr) {
		this.parentNg.key = expr;
	}
}
