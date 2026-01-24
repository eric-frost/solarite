import Template from "./Template.js";
import Globals from "./Globals.js";
import toEl from "./toEl.js";

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
export default function h(htmlStrings=undefined, ...exprs) {

	// 1. Tagged template: h`<div>...</div>`
	if (Array.isArray(arguments[0])) {
		return new Template(arguments[0], exprs);
	}

	// 2. String to template, or JSX factory form h(tag, props, ...children)
	else if (typeof arguments[0] === 'string' || arguments[0] instanceof String) {
		let tagOrHtml = arguments[0];

		// 2a. JSX: h("tag", {props}, ...children)
		if (exprs.length && (typeof exprs[0] === 'object' || exprs[0] === null)) {
			let tag = tagOrHtml + '';
			let props = exprs[0] || {};
			let children = exprs.slice(1);

			return Template.fromJsx(tag, props, children);
		}

		// 2b. Plain html string => template: h('<div>...</div>')
		else {
			let html = tagOrHtml;
			// If it starts with whitespace and then a tag, trim it.
			if (html.match(/^\s^</))
				html = html.trim();
			return new Template([html], []);
		}
	}

	else if (arguments[0] instanceof HTMLElement || arguments[0] instanceof DocumentFragment) {

		// 3. Render template to element: h(el, template)
		if (arguments[1] instanceof Template) {

			/** @type Template */
			let template = arguments[1];
			let parent = arguments[0];
			let options = arguments[2];
			template.render(parent, options);
		}

		// 4. Render tagged template to element: h(el)`<div>...</div>`
		else {
			let parent = arguments[0], options = arguments[1];

			// Remove shadowroot if present.  TODO: This could mess up paths?
			if (parent.shadowRoot)
				parent.innerHTML = '';

			// Return a tagged template function that applies the tagged template to parent.
			let renderTemplate = (htmlStrings, ...exprs) => {
				Globals.rendered.add(parent)
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			}
			return renderTemplate;
		}
	}

	// 5. Create a static element: h()`<div></div>`
	else if (!arguments.length) {
		return (htmlStrings, ...exprs) => {
				let template = h(htmlStrings, ...exprs);
				return toEl(template);
			}
	}

	// 6. Help toEl() with objects: h(this)`<div>...</div>` inside an object's render()
	// Intercepts the main h(this)`...` function call inside render().
	// TODO: This path doesn't handle embeds like data-id="..."
	else if (typeof arguments[0] === 'object' && Globals.objToEl.has(arguments[0])) {
		let obj = arguments[0];

		if (obj.constructor.name !== 'Object')
			throw new Error(`Solarate Web Component class ${obj.constructor?.name} must extend HTMLElement.`);

		// Jsx with h(this, <jsx>)
		if (arguments[1] instanceof Template) {
			let template = arguments[1];
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
	else
		throw new Error('h() does not support argument of type: ' + (arguments[0] ? typeof arguments[0] : arguments[0]))
}

