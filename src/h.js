import Template from "./Template.js";
import Util from "./Util.js";
import Globals from "./Globals.js";
import {assert} from "./assert.js";
import toEl from "./toEl.js";

/**
 * Convert strings to HTMLNodes.
 * Using h`...` as a tag will always create a Template.
 * Using h() as a function() will always create a DOM element.
 *
 * Features beyond what standard js tagged template strings do:
 * 1. r`` sub-expressions
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
 * 4. h(el, ?options)`<b>${'Hi'}</b>`   // Create template and render its nodes to el.
 *
 * Create top-level element
 * 7. h()`Hello<b>${'World'}!</b>`
 *
 * 9. h({render(){...}})               // Pass an object with a render method, and optionally other props/methods.
 * 10. h(string, object, ...)          // JSX TODO
 * @param htmlStrings {?HTMLElement|string|string[]|function():Template|{render:function()}}
 * @param exprs {*[]|string|Template|Object}
 * @return {Node|HTMLElement|Template} */
export default function h(htmlStrings=undefined, ...exprs) {

	if (arguments[0] === undefined && !exprs.length && arguments.length)
		throw new Error('h() cannot be called with undefined.');

	// 1. Tagged template
	if (Array.isArray(htmlStrings)) {
		return new Template(htmlStrings, exprs);
	}

	// 2. String to template.
	else if (typeof arguments[0] === 'string' || arguments[0] instanceof String) {
		let html = arguments[0];

		// If it starts with whitespace, trim both ends.
		// TODO: Also trim if it ends with whitespace?
		if (html.match(/^\s^</))
			html = html.trim();

		return new Template([html], []);
	}

	else if (arguments[0] instanceof HTMLElement || arguments[0] instanceof DocumentFragment) {

		// 3. Render template to element.
		if (arguments[1] instanceof Template) {

			/** @type Template */
			let template = arguments[1];
			let parent = arguments[0];
			let options = arguments[2]; // deprecated?
			template.render(parent, options);
		}

		// 4. Render tagged template to element
		else {
			let parent = arguments[0], options = arguments[1];

			// Remove shadowroot.  TODO: This could mess up paths?
			if (parent.shadowRoot)
				parent.innerHTML = '';

			// Return a tagged template function that applies the tagged template to parent.
			let taggedTemplate = (htmlStrings, ...exprs) => {
				Globals.rendered.add(parent)
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			}
			return taggedTemplate;
		}
	}

	else if ((arguments[0] === null || arguments[0] === undefined)) {

		// 5 & 6.
		if (typeof arguments[1] === 'string' || arguments[1] instanceof Template)
			throw new Error('Unsupported');

		// 7. Create a static element
		else {
			return (htmlStrings, ...exprs) => {
				let template = h(htmlStrings, ...exprs);
				return toEl(template); // Go to path 6.
			}
		}
	}

	// 9. Create dynamic element with render() function.
	// TODO: This path doesn't handle embeds like data-id="..."
	else if (typeof htmlStrings === 'object') {
		let obj = htmlStrings;

		if (obj.constructor.name !== 'Object')
			throw new Error(`Solarate Web Component class ${obj.constructor?.name} must extend HTMLElement.`);


		// Special rebound render path, called by normal path.
		// Intercepts the main r`...` function call inside render().
		if (Globals.objToEl.has(obj)) {
			return function(...args) {
				let template = h(...args);
				let el = template.render();
				Globals.objToEl.set(obj, el);
			}.bind(obj);
		}

		// Normal path
		else {
			Globals.objToEl.set(obj, null);
			obj[renderF](); // Calls the Special rebound render path above, when the render function calls h(this)
			let el = Globals.objToEl.get(obj);
			Globals.objToEl.delete(obj);

			for (let name in obj)
				if (typeof obj[name] === 'function')
					el[name] = obj[name].bind(el);  // Make the "this" of functions be el.
					// TODO: But this doesn't work for passing an object with functions as a constructor arg via an attribute:
				// <my-element arg=${{myFunc() { return this }}}
				else
					el[name] = obj[name];

			// Bind id's
			// This doesn't work for id's referenced by attributes.
			// for (let idEl of el.querySelectorAll('[id],[data-id]')) {
			// 	Util.bindId(el, idEl);
			// 	Util.bindId(obj, idEl);
			// }
			// TODO: Bind styles

			return el;
		}
	}

	else if (typeof htmlStrings === 'string' || htmlStrings instanceof String) {
		// 10. JSX
		if (typeof exprs[0] === 'object') {
			let tag = htmlStrings;
			let props = exprs[0] || {};
			let children = exprs.slice(1);

			let templateHtmlStrings = [];
			let templateExprs = [];

			// TODO How to know which children are static html and which are expression placeholders?
			// Perhaps we have to treat every text child as a string?

			assert(templateHtmlStrings.length === templateExprs.length+1);
			return new Template(templateHtmlStrings, templateExprs);
		}
	}




	else
		throw new Error('Unsupported arguments.')
}

// Trick to prevent minifier from renaming this function.
let renderF = 'render';