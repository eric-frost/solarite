import Path from "./Path.js";
import Util from "./Util.js";
import Globals from "./Globals.js";
import assert from "./assert.js";

export default class PathToAttribs extends Path {

	/**
	 * @type {Set<string>} Used for type=AttribType.Multiple to remember the attributes that were added. */
	attrNames;

	/** @type {boolean} Provides one or more attributes on a component. */
	isComponent;

	constructor(nodeBefore, nodeMarker) {
		super(null, null);
		this.nodeMarker = nodeMarker;
		this.attrNames = new Set();
	}

	/**
	 * @param exprs {Expr[][]} Only the first is used.
	 * @param freeNodeGroups {boolean} Used only for watch. */
	apply(exprs, freeNodeGroups) {
		//#IFDEV
		assert(Array.isArray(exprs));
		//#ENDIF
		this.applySingle(exprs[0]);
	}

	/**
	 * @param expr {Expr} */
	applySingle(expr) {
		let node = this.nodeMarker;

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			if (typeof expr === 'function') {
				Globals.currentPath = this; // Used by watch()
				this.watchFunction = expr; // used by renderWatched()
				expr = expr();
				Globals.currentPath = null;
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
				let attribs = Util.splitAttribs(expr);
				for (let name in attribs) {
					node.setAttribute(name, attribs[name]);
					this.attrNames.add(name);
				}
			}
		}

		// Remove old attributes.
		for (let oldName of oldNames)
			if (!this.attrNames.has(oldName))
				node.removeAttribute(oldName);
	}


	getExpressionCount() { return 1 }
	getValue(exprs) { return exprs[0]; }
}