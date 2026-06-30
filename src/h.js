import Template from "./Template.js";
import Globals from "./Globals.js";
import toEl from "./toEl.js";
import Util from "./Util.js";
import {jsxToTemplate, Fragment} from "./jsx.js";

/**
 * Convert strings to HTMLNodes.
 * Using h`...` as a tag will always create a Template.
 * Using h() as a function() will always create a DOM element.
 *
 * Features beyond what standard js tagged template strings do:
 * 1. h`` sub-expressions
 * 2. functions, nodes, and arrays of nodes as sub-expressions.
 * 3. html-escape all expressions by default, unless wrapped in h()
 * 4. event binding
 * 5. TODO:  list more
 *
 * General rule:
 * If h() is a function with null or an HTMLElement as its first argument create a Node.
 * Otherwise create a template
 *
 * Currently supported:
 *
 * Create Tempataes
 * 1. h`<b>Hello</b> ${'World'}!`      // Create Template that can later be used to create nodes.
 * 2. h('<b>Hello</b><u>Goodbye</u>'); // Create Template from string, that can later be used to create nodes.
 *
 * Add children to an element.
 * 3. h(el, h`<b>${'Hi'}</b>`, ?options)
 * 4. h(el, ?options)`<b>${'Hi'}</b>`   // typical path used in render(). Create template and render its nodes to el.
 *
 * Create top-level element
 * 5. h()`Hello<b>${'World'}!</b>`
 *
 * 6. h(string, object, ...)           // Used for JSX
 * @param htmlStrings {?HTMLElement|string|string[]|function():Template|{render:function()}}
 * @param exprs {*[]|string|Template|Object}
 * @return {Node|HTMLElement|Template|Function} */
/**
 * Like h`...` but the fragment is parsed in the SVG namespace.
 * Required for nested SVG fragments, since they're parsed standalone without an <svg> ancestor:
 * h`<svg>${svg`<circle r="1"/>`}</svg>`
 * @param htmlStrings {string[]}
 * @param exprs {*[]}
 * @return {Template} */
export function svg(htmlStrings, ...exprs) {
	let template = new Template(htmlStrings, exprs);
	template.svgMode = true;
	return template;
}

const renderTemplateKey = Symbol('solariteRender');

// Unique default that detects h() called with no arguments.
// Using `arguments` alongside rest params would force the engine to materialize both per call.
const noArg = Symbol();

export default function h(htmlStrings=noArg, ...exprs) {

	// 1. Tagged template: h`<div>...</div>`
	if (Array.isArray(htmlStrings)) {
		return new Template(htmlStrings, exprs);
	}

	// 2. String to template, or JSX factory form h(tag, props, ...children)
	else if (typeof htmlStrings === 'string' || htmlStrings instanceof String) {
		let tagOrHtml = htmlStrings;

		// 2a. JSX classic factory: h("tag", {props}, ...children)
		if (exprs.length && (typeof exprs[0] === 'object' || exprs[0] === null)) {
			let tag = tagOrHtml + '';
			let props = exprs[0] || {};
			let children = exprs.slice(1);

			return jsxToTemplate(tag, props, children);
		}

		// 2b. Plain html string => template: h('<div>...</div>')
		else {
			let html = tagOrHtml;
			// If it starts with whitespace and then a tag, trim it.
			if (/^\s+</.test(html))
				html = html.trim();
			return new Template([html], []);
		}
	}

	// 2c. JSX classic factory for a component or Fragment: h(Component, {props}, ...children)
	// The transform passes the class/function (or the Fragment symbol) as the first argument.
	else if (typeof htmlStrings === 'function' || htmlStrings === Fragment) {
		return jsxToTemplate(htmlStrings, exprs[0] || {}, exprs.slice(1));
	}

	else if (htmlStrings instanceof HTMLElement || htmlStrings instanceof DocumentFragment) {

		// 3. Render template to element: h(el, template)
		if (exprs[0] instanceof Template) {

			/** @type Template */
			let template = exprs[0];
			let parent = htmlStrings;
			let options = exprs[1];
			template.render(parent, options);
		}

		// 4. Render tagged template to element: h(el)`<div>...</div>`
		else {
			let parent = htmlStrings, options = exprs[0];

			// The closure is cached on the element so repeated renders don't recreate it.
			if (options === undefined) {
				let cached = parent[renderTemplateKey];
				if (cached)
					return cached;
			}

			// Return a tagged template function that applies the tagged template to parent.
			let renderTemplate = (htmlStrings, ...exprs) => {
				// Remove shadowroot if present.  TODO: This could mess up paths?
				if (parent.shadowRoot)
					parent.innerHTML = '';

				Globals.rendered.add(parent)
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			}
			if (options === undefined)
				parent[renderTemplateKey] = renderTemplate;
			return renderTemplate;
		}
	}

	// 5. Create a static element: h()`<div></div>`
	else if (htmlStrings === noArg) {
		return (htmlStrings, ...exprs) => {
			let template = h(htmlStrings, ...exprs);
			return toEl(template);
		}
	}

	// 6. Help toEl() with objects: h(this)`<div>...</div>` inside an object's render()
	// Intercepts the main h(this)`...` function call inside render().
	// TODO: This path doesn't handle embeds like data-id="..."
	else if (typeof htmlStrings === 'object' && Globals.objToEl.has(htmlStrings)) {
		let obj = htmlStrings;

		if (obj.constructor.name !== 'Object')
			throw new Error(`Solarate Web Component class ${obj.constructor?.name} must extend HTMLElement.`);

		// Jsx with h(this, <jsx>)
		if (exprs[0] instanceof Template) {
			let template = exprs[0];
			let el = template.render();
			Globals.objToEl.set(obj, el);
		}

		// h(this)`<div>...</div>`
		else
			return function(...args) {
				let template = h(...args);
				let el = template.render();
				Globals.objToEl.set(obj, el);
			}.bind(obj);
	}
	// TODO: Handle other primitive types?
	else if (Util.isFalsy(htmlStrings))
		return new Template();

	else
		throw new Error('h() does not support argument of type: ' + (htmlStrings ? typeof htmlStrings : htmlStrings))
}

// h.map caches each item's Template keyed by the item's identity, so a re-render returns
// the SAME Template instance for any item whose reference is unchanged.  The reconciler's
// `ng.template === item` fast path (PathToNodes.applyKeyed/applyDiff) then skips rebuilding
// and comparing that row.  A WeakMap is used instead of a symbol property so the idiomatic
// immutable update `{...item, x}` yields a fresh object that ISN'T in the cache and re-renders;
// a symbol property would be copied by spread and silently reuse the stale Template.
const mapCache = new WeakMap();

/**
 * Render a list, reusing each item's DOM for as long as the item is the SAME object.
 *
 * Treat items as immutable: to change a row, replace it with a new object rather than
 * mutating it in place, so its identity changes and it re-renders.  This is the contract
 * Solid's <For> and React's keyed lists use.  It takes no deps — the object identity IS
 * the dependency — so the call site stays a plain list with no caching code.
 *
 * Each item must be a distinct object, and an object must appear in only one h.map.
 * Non-object items (strings, numbers) are never cached and rebuild every render.
 *
 * h.immutableMap is the same function under a longer, self-documenting name; use whichever
 * reads better: h.map for brevity, h.immutableMap to flag the immutability contract.
 *
 * ${h.map(this.rows, row => h`<tr key=${row.id}>${row.label}</tr>`)}
 *
 * @param items {Array} The list to render.
 * @param fn {function(item:*):Template} Builds an item's Template; called only for new items.
 * @return {Template[]} */
h.map = (items, fn) => {
	let result = new Array(items.length);
	for (let i=0; i<items.length; i++) {
		let item = items[i];
		if (item !== null && typeof item === 'object') {
			let template = mapCache.get(item);
			if (template === undefined) {
				template = fn(item);
				mapCache.set(item, template);
			}
			result[i] = template;
		}
		else
			result[i] = fn(item);
	}
	return result;
}

h.immutableMap = h.map;

