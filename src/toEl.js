import Globals from "./Globals.js";
import {Template} from "./Solarite.js";
import Util from "./Util.js";

/**
 * 1. h('Hello');                      // Create single text node.
 * 2. h('<b>Hello</b>');               // Create single HTMLElement
 * 3. h('<b>Hello</b><u>Goodbye</u>'); // Create document fragment because there's more than one node.
 * 4. h(template)                      // Render Template created by h`<html>` or h();.
 *
 * @param htmlOrTemplate
 * @returns {Node|DocumentFragment|?DocumentFragment|HTMLElement}
 */
export default function toEl(htmlOrTemplate) {
	if (htmlOrTemplate instanceof Template) {
		return htmlOrTemplate.render();
	}

	// If it starts with a string, trim both ends.
	// TODO: Also trim if it ends with whitespace?
	if (htmlOrTemplate.match(/^\s^</))
		htmlOrTemplate = htmlOrTemplate.trim();

	// We create a new one each time because otherwise
	// the returned fragment will have its content replaced by a subsequent call.
	let templateEl = Globals.doc.createElement('template');
	templateEl.innerHTML = htmlOrTemplate;

	// 4+5. Return Node if there's one child.
	let relevantNodes = Util.trimEmptyNodes(templateEl.content.childNodes);
	if (relevantNodes.length === 1)
		return relevantNodes[0];

	// 6. Otherwise return DocumentFragment.
	return templateEl.content;
}