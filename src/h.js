import Template from "./Template.js";
import Util from "./Util.js";
import Globals from "./Globals.js";
import {assert} from "./assert.js";

/**
 * Convert strings to HTMLNodes.
 * Using h`...` as a tag will always create a Template.
 * Using h() as a function() will always create a DOM element.
 *
 * Features beyond what standard js tagged template strings do:
 * 1. r`` sub-expressions
 * 2. functions, nodes, and arrays of nodes as sub-expressions.
 * 3. html-escape all expressions by default, unless wrapped in r()
 * 4. event binding
 * 5. TODO:  list more
 *
 * Currently supported:
 * 1. h(el, options)`<b>${'Hi'}</b>`   // Create template and render its nodes to el.
 * 2. h(el, template, ?options)        // Render the Template created by #1 to element.
 *
 * 3. h`<b>Hello</b> ${'World'}!`      // Create Template that can later be used to create nodes.
 *
 * 4. h('Hello');                      // Create single text node.
 * 5. h('<b>Hello</b>');               // Create single HTMLElement
 * 6. h('<b>Hello</b><u>Goodbye</u>'); // Create document fragment because there's more than one node.
 * 7. h()`Hello<b>${'World'}!</b>`     // Same as 4-6, but evaluates the string as a Solarite template, which
 *                                     // includes properly handling nested components and r`` sub-expressions.
 * 8. h(template)                      // Render Template created by #1.
 *
 * 9. h({render(){...}})               // Pass an object with a render method, and optionally other props/methods.
 * 10. h(string, object, ...)          // JSX TODO
 * @param htmlStrings {?HTMLElement|string|string[]|function():Template|{render:function()}}
 * @param exprs {*[]|string|Template|Object}
 * @return {Node|HTMLElement|Template} */
export default function h(htmlStrings=undefined, ...exprs) {

	if (htmlStrings === undefined && !exprs.length && arguments.length)
		throw new Error('h() cannot be called with undefined.');

	// TODO: Make this a more flat if/else and call other functions for the logic.
	if (htmlStrings instanceof Node) {
		let parent = htmlStrings, template = exprs[0];

		// 1
		if (!(exprs[0] instanceof Template)) {
			if (parent.shadowRoot)
				parent.innerHTML = ''; // Remove shadowroot.  TODO: This could mess up paths?

			let options = exprs[0];

			// Return a tagged template function that applies the tagged themplate to parent.
			let taggedTemplate = (htmlStrings, ...exprs) => {
				Globals.rendered.add(parent)
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			}
			return taggedTemplate;
		}

		// 2. Render template created by #4 to element.
		else { // instanceof Template
			let options = exprs[1];
			template.render(parent, options);

			// Append on the first go.
			if (!parent.childNodes.length && this) {
				// TODO: Is this ever executed?
				debugger;
				parent.append(this.rootNg.getParentNode());
			}
		}
	}

	// 3. Path if used as a template tag.
	else if (Array.isArray(htmlStrings)) {
		return new Template(htmlStrings, exprs);
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


		// If it starts with a string, trim both ends.
		// TODO: Also trim if it ends with whitespace?
		if (htmlStrings.match(/^\s^</))
			htmlStrings = htmlStrings.trim();

		// We create a new one each time because otherwise
		// the returned fragment will have its content replaced by a subsequent call.
		let templateEl = document.createElement('template');
		templateEl.innerHTML = htmlStrings;

		// 4+5. Return Node if there's one child.
		let relevantNodes = Util.trimEmptyNodes(templateEl.content.childNodes);
		if (relevantNodes.length === 1)
			return relevantNodes[0];

		// 6. Otherwise return DocumentFragment.
		return templateEl.content;
	}

	// 7. Create a static element
	else if (htmlStrings === undefined) {
		return (htmlStrings, ...exprs) => {
			//Globals.rendered.add(parent)
			let template = h(htmlStrings, ...exprs);
			return template.render();
		}
	}

	// 8.
	else if (htmlStrings instanceof Template) {
		return htmlStrings.render();
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
			obj[renderF](); // Calls the Special rebound render path above, when the render function calls r(this)
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

	else
		throw new Error('Unsupported arguments.')
}

// Trick to prevent minifier from renaming this function.
let renderF = 'render';