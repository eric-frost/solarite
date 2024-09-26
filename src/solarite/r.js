import Template from "./Template.js";
import Util from "./Util.js";
import Globals from "./Globals.js";

/**
 * Convert strings to HTMLNodes.
 * Using r as a tag will always create a Template.
 * Using r() as a function() will always create a DOM element.
 *
 * Features beyond what standard js tagged template strings do:
 * 1. r`` sub-expressions
 * 2. functions, nodes, and arrays of nodes as sub-expressions.
 * 3. html-escape all expressions by default, unless wrapped in r()
 * 4. event binding
 * 5. TODO:  list more
 *
 * Currently supported:
 * 1. r(el, options)`<b>${'Hi'}</b>`   // Create template and render its nodes to el.
 * 2. r(el, template, ?options)        // Render the Template created by #1 to element.
 *
 * 3. r`<b>Hello</b> ${'World'}!`      // Create Template that can later be used to create nodes.
 *
 * 4. r('Hello');                      // Create single text node.
 * 5. r('<b>Hello</b>');               // Create single HTMLElement
 * 6. r('<b>Hello</b><u>Goodbye</u>'); // Create document fragment because there's more than one node.
 * 7. r()`Hello<b>${'World'}!</b>`     // Same as 4-6, but evaluates the string as a Solarite template, which
 *                                     // includes properly handling nested components and r`` sub-expressions.
 * 8. r(template)                      // Render Template created by #1.
 *
 * 9. r({render(){...}})              // Pass an object with a render method, and optionally other props/methods.
 *
 * @param htmlStrings {?HTMLElement|string|string[]|function():Template|{render:function()}}
 * @param exprs {*[]|string|Template|Object}
 * @return {Node|HTMLElement|Template} */
export default function r(htmlStrings=undefined, ...exprs) {

	// TODO: Make this a more flat if/else and call other functions for the logic.
	if (htmlStrings instanceof Node) {
		let parent = htmlStrings, template = exprs[0];

		// 1
		if (!(exprs[0] instanceof Template)) {
			if (parent.shadowRoot)
				parent.innerHTML = ''; // Remove shadowroot.  TODO: This could mess up paths?

			let options = exprs[0];

			// Return a tagged template function that applies the tagged themplate to parent.
			return (htmlStrings, ...exprs) => {
				Globals.rendered.add(parent)
				let template = new Template(htmlStrings, exprs);
				return template.render(parent, options);
			}
		}

		// 2. Render template created by #4 to element.
		else if (exprs[0] instanceof Template) {
			let options = exprs[1];
			template.render(parent, options);

			// Append on the first go.
			if (!parent.childNodes.length && this) {
				// TODO: Is this ever executed?
				debugger;
				parent.append(this.rootNg.getParentNode());
			}
		}



		// null for expr[0], remove whole element.
		   // This path never happens?
		else {
			throw new Error('unsupported');
			//let ngm = NodeGroupManager.get(parent);
			//ngm.render(null, exprs[1])
		}
	}

	// 3. Path if used as a template tag.
	else if (Array.isArray(htmlStrings)) {
		return new Template(htmlStrings, exprs);
	}

	else if (typeof htmlStrings === 'string' || htmlStrings instanceof String) {
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
			let template = r(htmlStrings, ...exprs);
			return template.render();
		}
	}

	// 8.
	else if (htmlStrings instanceof Template) {
		return htmlStrings.render();
	}


	// 9. Create dynamic element with render() function.
	else if (typeof htmlStrings === 'object') {
		let obj = htmlStrings;

		// Special rebound render path, called by normal path.
		if (Globals.objToEl.has(obj)) {
			return function(...args) {
			   let template = r(...args);
			   let el = template.render();
				Globals.objToEl.set(obj, el);
			}.bind(obj);
		}

		// Normal path
		else {
			Globals.objToEl.set(obj, null);
			obj.render(); // Calls the Special rebound render path above, when the render function calls r(this)
			let el = Globals.objToEl.get(obj);
			Globals.objToEl.delete(obj);

			for (let name in obj)
				if (typeof obj[name] === 'function')
					el[name] = obj[name].bind(el);
				else
					el[name] = obj[name];

			return el;
		}
	}

	else
		throw new Error('Unsupported arguments.')
}