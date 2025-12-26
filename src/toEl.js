import Globals from "./Globals.js";
import {Template} from "./Solarite.js";
import Util from "./Util.js";

/**
 * Convert a template, string, or object into a DOM Node or Element
 *
 * 1. h('Hello');                      // Create single text node.
 * 2. h('<b>Hello</b>');               // Create single HTMLElement
 * 3. h('<b>Hello</b><u>Goodbye</u>'); // Create document fragment because there's more than one node.
 * 4. h(template)                      // Render Template created by h`<html>` or h();
 * 5. h({render(){...}})               // Pass an object with a render method, and optionally other props/methods.
 * @param arg {string|Template|{render:()=>void}}
 * @returns {Node|DocumentFragment|HTMLElement} */
export default function toEl(arg) {

	if (typeof arg === 'string') {
		let html = arg;

		// If it's an element with whitespace before or after it, trim both ends.
		if (html.match(/^\s^</) || html.match(/>\s+$/))
			html = html.trim();

		// We create a new one each time because otherwise
		// the returned fragment will have its content replaced by a subsequent call.
		let templateEl = Globals.doc.createElement('template');
		templateEl.innerHTML = html;

		// 1+2. Return Node if there's one child.
		let relevantNodes = Util.trimEmptyNodes(templateEl.content.childNodes);
		if (relevantNodes.length === 1)
			return relevantNodes[0];

		// 3. Otherwise return DocumentFragment.
		return templateEl.content;
	}

	// 4.
	if (arg instanceof Template) {
		return arg.render();
	}

	// 5. Create dynamic element from an object with a render() function.
	// TODO: This path doesn't handle embeds like data-id="..."
	else if (arg && typeof arg === 'object') {
		let obj = arg;

		if (obj.constructor.name !== 'Object')
			throw new Error(`Solarate Web Component class ${obj.constructor?.name} must extend HTMLElement.`);

		// Normal path
		if (!Globals.objToEl.has(obj)) {
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

	throw new Error('toEl() does not support argument of type: ' + (arg ? typeof arg : arg));

}


// Trick to prevent minifier from renaming this function.
let renderF = 'render';