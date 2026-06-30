import Path from "./Path.js";
import Util from "./Util.js";
import assert from "./assert.js";
import PathToAttribValue from "./PathToAttribValue.js";
import PathToEvent from "./PathToEvent.js";
import {JsxAttr, styleToCss} from "./jsx.js";

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
	 * @param exprs {Expr[][]} Only the first is used. */
	apply(exprs) {
		//#IFDEV
		assert(Array.isArray(exprs));
		//#ENDIF
		this.applySingle(exprs[0]);
	}

	/**
	 * @param expr {Expr} */
	applySingle(expr) {
		let node = this.nodeMarker;

		// JSX Tier 1 whole-attribute hole: `<a ` + jsxAttr("href", v) + `>`.
		if (expr instanceof JsxAttr)
			return this.applyJsxAttr(expr);

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			if (typeof expr === 'function')
				expr = expr();

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


	/**
	 * Apply a single JSX jsxAttr(name, value) pair.  We delegate to a cached PathToEvent or
	 * PathToAttribValue sub-path so events, html properties, two-way binding, booleans, and
	 * contenteditable all behave exactly as `name=${value}` in a tagged template.  The attr name
	 * at a given hole is a compile-time literal, so the sub-path is stable across renders.
	 * @param attr {JsxAttr} */
	applyJsxAttr(attr) {
		let name = attr.name;
		if (name === 'key') // Lifted onto template.key by jsxTemplate(); never rendered as an attribute.
			return;
		let value = attr.value;

		let sub = this.jsxSub;
		if (sub === undefined || this.jsxSubName !== name) {
			let node = this.nodeMarker;
			if (Util.isEvent(name))
				sub = new PathToEvent(null, node, name, null);
			else {
				sub = new PathToAttribValue(null, node, name, null);
				sub.isHtmlProperty = Util.isHtmlProp(node, name);
			}
			sub.isComponentAttrib = this.isComponentAttrib;
			this.jsxSub = sub;
			this.jsxSubName = name;
		}
		sub.nodeMarker = this.nodeMarker;
		sub.parentNg = this.parentNg;
		if (name === 'style')
			value = styleToCss(value);
		sub.applySingle(value);
	}


	getExpressionCount() { return 1 }
	getValue(exprs) { return exprs[0]; }
}