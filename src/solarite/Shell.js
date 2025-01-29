import {assert} from "../util/Errors.js";
import ExprPath, {ExprPathType, getNodePath} from "./ExprPath.js";
import {htmlContext, isEvent} from "./Util.js";
import Globals from "./Globals.js";

/**
 * A Shell is created from a tagged template expression instantiated as Nodes,
 * but without any expressions filled in.
 * Only one Shell is created for all the items in a loop.
 *
 * When a NodeGroup is created from a Template's html strings,
 * the NodeGroup then clones the Shell's fragmentn to be its nodes. */
export default class Shell {

	/**
	 * @type {DocumentFragment} DOM parent of the shell nodes. */
	fragment;

	/** @type {ExprPath[]} Paths to where expressions should go. */
	paths = [];

	// Elements with events.  Not yet used.
	// events = [];

	/** @type {int[][]} Array of paths */
	ids = [];
	scripts = [];
	styles = [];

	staticComponents = [];



	/**
	 * Create the nodes but without filling in the expressions.
	 * This is useful because the expression-less nodes created by a template can be cached.
	 * @param html {string[]} */
	constructor(html=null) {
		if (!html)
			return;

		//#IFDEV
		this.html = html.join('');
		//#ENDIF

		// 1.  Add placeholders
		// We increment the placeholder char as we go because nodes can't have the same attribute more than once.
		let placeholder = 0xe000; // https://en.wikipedia.org/wiki/Private_Use_Areas  6400.

		let buffer = [];
		let commentPlaceholder = `<!--!✨!-->`;
		let componentNames = {};

		htmlContext(null); // Reset the context.
		for (let i=0; i<html.length; i++) {
			let lastHtml = html[i];
			let context = htmlContext(lastHtml);

			// Swap out Embedded Solarite Components with ${} attributes.
			// Later, NodeGroup.render() will search for these and replace them with the real components.
			// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
			if (context === htmlContext.Attribute) {

				let lastIndex, lastMatch;
				lastHtml.replace(/<[a-z][a-z0-9]*-[a-z0-9-]+/ig, (match, index) => {
					lastIndex = index+1; // +1 for after opening <
					lastMatch = match.slice(1);
				})

				if (lastMatch) {
					let newTagName = lastMatch + '-solarite-placeholder';
					lastHtml = lastHtml.slice(0, lastIndex) + newTagName + lastHtml.slice(lastIndex + lastMatch.length);
					componentNames[lastMatch] = newTagName
				}
			}

			buffer.push(lastHtml);
			//console.log(lastHtml, context)
			if (i < html.length-1)
				if (context === htmlContext.Text)
					buffer.push(commentPlaceholder) // Comment Placeholder. because we can't put text in between <tr> tags for example.
				else
					buffer.push(String.fromCharCode(placeholder+i));
		}

		// 2. Create elements from html with placeholders.
		let template = document.createElement('template'); // Using a single global template won't keep the nodes as children of the DocumentFragment.
		let joinedHtml = buffer.join('');

		// Replace '-solarite-placeholder' close tags.
		// TODO: is there a better way?  What if the close tag is inside a comment?
		for (let name in componentNames)
			joinedHtml = joinedHtml.replaceAll(`</${name}>`, `</${componentNames[name]}>`);
		
        if (joinedHtml)
		    template.innerHTML = joinedHtml;
        else // Create one text node, so shell isn't empty and NodeGroups created from it have something to point the startNode and endNode at.
            template.content.append(document.createTextNode(''))
		this.fragment = template.content;

		// 3. Find placeholders
		let node;
		let toRemove = [];
		const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT);
		while (node = walker.nextNode()) {

			// Remove previous after each iteration, so paths will still be calculated correctly.
			toRemove.map(el => el.remove());
			toRemove = [];
			
			// Replace attributes
			if (node.nodeType === 1) {
				for (let attr of [...node.attributes]) { // Copy the attributes array b/c we remove attributes as we go.

					// Whole attribute
					let matches = attr.name.match(/^[\ue000-\uf8ff]$/)
					if (matches) {
						this.paths.push(new ExprPath(null, node, ExprPathType.Multiple));
						node.removeAttribute(matches[0]);
					}

					// Just the attribute value.
					else {
						let parts = attr.value.split(/[\ue000-\uf8ff]/g);
						if (parts.length > 1) {
							let nonEmptyParts = (parts.length === 2 && !parts[0].length && !parts[1].length) ? null : parts;
							let type = isEvent(attr.name) ? ExprPathType.Event : ExprPathType.Value;

							this.paths.push(new ExprPath(null, node, type, attr.name, nonEmptyParts));
							node.setAttribute(attr.name, parts.join(''));
						}
					}
				}
			}
			// Replace comment placeholders
			else if (node.nodeType === 8 && node.nodeValue === '!✨!') {

				// Get or create nodeBefore.
				let nodeBefore = node.previousSibling; // Can be the same as another Path's nodeMarker.
				if (!nodeBefore) {
					nodeBefore = document.createComment('ExprPath:'+this.paths.length);
					node.parentNode.insertBefore(nodeBefore, node)
				}
				/*#IFDEV*/assert(nodeBefore);/*#ENDIF*/

				// Get the next node.
				let nodeMarker;

				// A subsequent node is available to be a nodeMarker.
				if (node.nextSibling && (node.nextSibling.nodeType !== 8 || node.nextSibling.textContent !== '!✨!')) {
					nodeMarker = node.nextSibling;
					toRemove.push(node); // Removing them here will mess up the treeWalker.
				}
				// Re-use existing comment placeholder.
				else {
					nodeMarker = node;
					nodeMarker.textContent = 'ExprPathEnd:'+ this.paths.length;
				}
				/*#IFDEV*/assert(nodeMarker);/*#ENDIF*/



				let path = new ExprPath(nodeBefore, nodeMarker, ExprPathType.Content);

				this.paths.push(path);
			}

			else if (node.nodeType === 3 && node.parentNode?.tagName === 'TEXTAREA' && node.textContent.includes('<!--!✨!-->'))
				throw new Error(`Textarea can't have expressions inside them. Use <textarea value="\${...}"> instead.`);

			
			
			// Sometimes users will comment out a block of html code that has expressions.
			// Here we look for expressions in comments.
			// We don't actually update them dynamically, but we still add paths for them.
			// That way the expression count still matches.
			else if (node.nodeType === Node.COMMENT_NODE) {
				let parts = node.textContent.split(/[\ue000-\uf8ff]/g);
				for (let i=0; i<parts.length-1; i++) {
					let path = new ExprPath(node.previousSibling, node)
					path.type = ExprPathType.Comment;
					this.paths.push(path);
				}
			}

			// Replace comment placeholders inside script and style tags, which have become text nodes.
			else if (node.nodeType === Node.TEXT_NODE && ['SCRIPT', 'STYLE'].includes(node.parentNode?.nodeName)) {
				let parts = node.textContent.split(commentPlaceholder);
				if (parts.length > 1) {

					let placeholders = [];
					for (let i = 0; i<parts.length; i++) {
						let current = document.createTextNode(parts[i]);
						node.parentNode.insertBefore(current, node);
						if (i > 0)
							placeholders.push(current)
					}

					for (let i=0, node; node=placeholders[i]; i++) {
						let path = new ExprPath(node.previousSibling, node, ExprPathType.Content);
						this.paths.push(path);

						/*#IFDEV*/path.verify();/*#ENDIF*/
					}

					// Removing them here will mess up the treeWalker.
					toRemove.push(node);
				}
			}
		}
		toRemove.map(el => el.remove());

		// Handle solarite-placeholder's.
		// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
		//if (componentNames.size)
		//	this.components = [...this.fragment.querySelectorAll([...componentNames].join(','))]

		// Rename "is" attributes so the Web Components don't instantiate until we have the values of their PathExpr arguments.
		// that happens in NodeGroup.applyComponentExprs()
		for (let el of this.fragment.querySelectorAll('[is]')) {
			el.setAttribute('_is', el.getAttribute('is'))
		//	this.components.push(el);
		}

		for (let path of this.paths) {
			if (path.nodeBefore)
				path.nodeBeforeIndex = Array.prototype.indexOf.call(path.nodeBefore.parentNode.childNodes, path.nodeBefore)
			path.nodeMarkerPath = getNodePath(path.nodeMarker)

			// Cache so we don't have to calculate this later inside NodeGroup.applyExprs()
			if (path.type === ExprPathType.Value && path.nodeMarker.nodeType === 1 && /*path.nodeMarker !== template.content.children[0] &&*/
				(path.nodeMarker.tagName.includes('-') || path.nodeMarker.hasAttribute('is'))) {
				path.type = ExprPathType.Component;
			}
		}

		this.findEmbeds();

		/*#IFDEV*/this.verify();/*#ENDIF*/
	} // end constructor

	/**
	 * We find the path to every embed here once in the Shell, instead of every time a NodeGroup is instantiated.
	 * When a Nodegroup is created, it calls NodeGroup.activateEmbeds() that uses these paths.
	 * Populates:
	 * this.scripts
	 * this.styles
	 * this.ids
	 * this.staticComponents */
	findEmbeds() {
		this.scripts = Array.prototype.map.call(this.fragment.querySelectorAll('scripts'), el => getNodePath(el))
		this.styles = Array.prototype.map.call(this.fragment.querySelectorAll('style'), el => getNodePath(el))

		let idEls = this.fragment.querySelectorAll('[id],[data-id]');
		

		// Check for valid id names.
		for (let el of idEls) {
			let id = el.getAttribute('data-id') || el.getAttribute('id')
			if (Globals.div.hasOwnProperty(id))
				throw new Error(`<${el.tagName.toLowerCase()} id="${id}"> can't override existing HTMLElement id property.`)
		}


		this.ids = Array.prototype.map.call(idEls, el => getNodePath(el))


		for (let el of this.fragment.querySelectorAll('*')) {
			// Events (not yet used)
			// for (let attrib of el.attributes)
			// 	if (isEvent(attrib.name))
			// 		this.events.push([attrib.name, getNodePath(el)])

			if (el.tagName.includes('-') || el.hasAttribute('_is'))

				// Dynamic components have attributes with expression values.
				// They are created from applyExprs()
				// But static components are created in a separate path inside the NodeGroup constructor.
				if (!this.paths.find(path => path.nodeMarker === el))
					this.staticComponents.push(getNodePath(el));
		}

	}

	/**
	 * Get the shell for the html strings.
	 * @param htmlStrings {string[]} Typically comes from a Template.
	 * @returns {Shell} */
	static get(htmlStrings) {
		let result = Globals.shells.get(htmlStrings);
		if (!result) {
			result = new Shell(htmlStrings);
			Globals.shells.set(htmlStrings, result); // cache
		}

		/*#IFDEV*/result.verify();/*#ENDIF*/
		return result;
	}

	//#IFDEV
	// For debugging only:
	verify() {
		for (let path of this.paths) {
			assert(this.fragment.contains(path.getParentNode()))
			path.verify();
		}
	}
	//#ENDIF
}

