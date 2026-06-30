/**
 * Solarite JSX runtime.  Configure your toolchain with `jsxImportSource: "solarite"` (automatic
 * runtime) or have Deno's `jsx:"precompile"` / a Solarite build plugin target this module.
 *
 * Tier 1 (precompile): jsxTemplate/jsxAttr/jsxEscape map hoisted statics straight onto Template.
 * Tier 2 (automatic):  jsx/jsxs/jsxDEV build a Template per render via the shape-interning factory.
 *
 * See src/jsx.js for the shared core (jsxToTemplate, JsxAttr, Fragment). */
import Template from "./Template.js";
import {JsxAttr, jsxToTemplate, Fragment} from "./jsx.js";

export {Fragment};

/**
 * Tier 1: build a Template from hoisted static strings and expression holes, with the statics'
 * stable array identity feeding Shell cache / NodeGroup reuse just like a tagged template.
 * @param strings {string[]} Module-hoisted static html (same array every render).
 * @param exprs {...*} jsxAttr() pairs, jsxEscape() children, and bare boolean-attr strings.
 * @return {Template} */
export function jsxTemplate(strings, ...exprs) {
	let key;
	for (let i = 0; i < exprs.length; i++) {
		let e = exprs[i];
		// A `key` prop arrives as jsxAttr("key", value) at an attribute hole.  Lift it onto the
		// Template for keyed diffing and blank the hole so it never renders as an attribute.
		if (e instanceof JsxAttr && e.name === 'key') {
			key = e.value;
			exprs[i] = '';
		}
	}
	let t = new Template(strings, exprs);
	if (key !== undefined)
		t.key = key;
	return t;
}

/**
 * Tier 1: a whole-attribute hole, e.g. `<a ` + jsxAttr("href", v) + `>`.  PathToAttribs detects
 * this and routes the value through normal attribute/event/property application.
 * @param name {string}
 * @param value {*}
 * @return {JsxAttr} */
export function jsxAttr(name, value) {
	return new JsxAttr(name, value);
}

/**
 * Tier 1: a child hole.  Solarite already html-escapes child expressions (strings render as text,
 * Templates/arrays as nodes), so this is the identity function.
 * @param value {*}
 * @return {*} */
export function jsxEscape(value) {
	return value;
}

/**
 * Tier 2 automatic runtime: a single-child element.  props.children is one child hole.
 * @param tag {string|Function|symbol}
 * @param props {Object}
 * @param key {*}
 * @return {Template} */
export function jsx(tag, props, key) {
	props = props || {};
	let children = ('children' in props) ? [props.children] : [];
	return jsxToTemplate(tag, props, children, key);
}

/**
 * Tier 2 automatic runtime: multiple static children.  props.children is the children array.
 * @param tag {string|Function|symbol}
 * @param props {Object}
 * @param key {*}
 * @return {Template} */
export function jsxs(tag, props, key) {
	props = props || {};
	let children = props.children;
	children = Array.isArray(children) ? children : (children === undefined ? [] : [children]);
	return jsxToTemplate(tag, props, children, key);
}

/** Dev variant (extra source/self args are ignored). */
export function jsxDEV(tag, props, key) {
	return jsx(tag, props, key);
}
