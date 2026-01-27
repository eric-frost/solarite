import ExprPath, {ExprPathType} from "./ExprPath.js";
import Globals from "./Globals.js";
import {assert} from "./assert.js";

export default class ExprPathAttribs extends ExprPath {

	/**
	 * @type {Set<string>} Used for type=AttribType.Multiple to remember the attributes that were added. */
	attrNames;

	constructor(nodeBefore, nodeMarker) {
		super(nodeBefore, nodeMarker);
		this.attrNames = new Set();
	}

	/**
	 * @param exprs {Expr[]} Only the first is used. */
	apply(exprs, freeNodeGroups) {
		let expr = exprs[0];
		let node = this.nodeMarker;

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			if (typeof expr === 'function') {
				Globals.currentExprPath = this; // Used by watch()
				this.watchFunction = expr; // used by renderWatched()
				expr = expr();
				Globals.currentExprPath = null;
			}

			// Attribute as name: value object.
			if (typeof expr === 'object') {
				for (let name in expr) {
					let value = expr[name];
					if (value === undefined || value === false || value === null)
						continue;
					node.setAttribute(name, value);
					this.attrNames.add(name)
				}
			}

			// Attributes as string
			else {
				let attrs = (expr + '') // Split string into multiple attributes.
					.split(/([\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|\S+))/g)
					.map(text => text.trim())
					.filter(text => text.length);

				for (let attr of attrs) {
					let [name, value] = attr.split(/\s*=\s*/); // split on first equals.
					value = (value || '').replace(/^(['"])(.*)\1$/, '$2'); // trim value quotes if they match.
					node.setAttribute(name, value);
					this.attrNames.add(name)
				}
			}
		}

		// Remove old attributes.
		for (let oldName of oldNames)
			if (!this.attrNames.has(oldName))
				node.removeAttribute(oldName);
	}
}