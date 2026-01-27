import {assert} from "./assert.js";
import ExprPath from "./ExprPath.js";
import Util from "./Util.js";
import Globals from "./Globals.js";
import HtmlParser from "./HtmlParser.js";
import ExprPathEvent from "./ExprPathEvent.js";
import ExprPathAttribValue from "./ExprPathAttribValue.js";
import ExprPathAttribs from "./ExprPathAttribs.js";
import ExprPathNodes from "./ExprPathNodes.js";
import NodePath from "./NodePath.js";
import ExprPathComponent from "./ExprPathComponent.js";

/**
 * A Shell is created from a tagged template expression instantiated as Nodes,
 * but without any expressions filled in.
 * Only one Shell is created for all the items in a loop.
 *
 * When a NodeGroup is created from a Template's html strings,
 * the NodeGroup then clones the Shell's fragment to be its nodes. */
export default class Shell {

	/**
	 * @type {DocumentFragment|Text} DOM parent of the shell's nodes. */
	fragment;

	/** @type {ExprPath[]} Paths to where expressions should go. */
	paths = [];

	// Elements with events.  Is there a reason to use this?  We already mark event Exprs in Shell.js.
	// events = [];

	/** @type {int[][]} Array of paths */
	ids = [];

	/** @type {int[][]} Array of paths */
	scripts = [];

	/** @type {int[][]} Array of paths */
	styles = [];

	/**
	 * Create the nodes but without filling in the expressions.
	 * This is useful because the expression-less nodes created by a template can be cached.
	 * @param html {string[]} Html strings, split on places where an expression exists.  */
	constructor(html=null) {
		if (!html)
			return;

		//#IFDEV
		this._html = html.join('');
		//#ENDIF

		// If no html tags or entities, just create a text node.
		if (html.length === 1 && !html[0].match(/[<&]/)) {
			this.fragment = Globals.doc.createTextNode(html[0]);
			return;
		}


		// 1.  Add placeholders
		let htmlWithPlaceholders = Shell.addPlaceholders(html);

		let template = Globals.doc.createElement('template'); // Using a single global template won't keep the nodes as children of the DocumentFragment.
		if (htmlWithPlaceholders)
			template.innerHTML = htmlWithPlaceholders;
		else // Create one text node, so shell isn't empty and NodeGroups created from it have something to point the startNode and endNode at.
			template.content.append(Globals.doc.createTextNode(''))
		this.fragment = template.content;

		// 2. Find placeholders
		let node;
		let toRemove = [];
		let placeholdersUsed = 0;
		const walker = Globals.doc.createTreeWalker(this.fragment, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT);
		while (node = walker.nextNode()) {

			// Remove previous elements after each iteration, so paths will still be calculated correctly.
			toRemove.map(el => el.remove());
			toRemove = [];
			
			// Replace attributes
			if (node.nodeType === 1) {
				const hasIs = node.hasAttribute('is');
				const isComponent = (hasIs || node.tagName.includes('-'));
				const componentAttribPaths = [];

				for (let attr of [...node.attributes]) { // Copy the attributes array b/c we remove attributes with placeholders as we go.

					// Whole attribute
					let matches = attr.name.match(/^[\ue000-\uf8ff]$/)
					if (matches) {
						let path = new ExprPathAttribs(null, node);
						this.paths.push(path);
						if (isComponent)
							componentAttribPaths.push(path);

						placeholdersUsed ++;
						node.removeAttribute(matches[0]); // TODO: Is this necessary?
					}

					// Just the attribute value.
					else {
						let parts = attr.value.split(/[\ue000-\uf8ff]/g);
						if (parts.length > 1) {
							let nonEmptyParts = (parts.length === 2 && !parts[0].length && !parts[1].length) ? null : parts;

							let path = Util.isEvent(attr.name)
								? new ExprPathEvent(null, node, attr.name, nonEmptyParts)
								: new ExprPathAttribValue(null, node, attr.name, nonEmptyParts);
							this.paths.push(path);
							if (isComponent) {
								path.isComponentAttrib = true;
								componentAttribPaths.push(path);
							}

							placeholdersUsed += parts.length - 1;
							node.setAttribute(attr.name, parts.join(''));
						}
					}
				}

				// Web components
				if (isComponent) {
					let path = new ExprPathComponent(null, node);
					path.attribPaths = componentAttribPaths;
					this.paths.splice(this.paths.length - componentAttribPaths.length, 0, path); // Insert before its componentAttribPaths

					if (hasIs) {
						node.setAttribute('_is', node.getAttribute('is'));
						node.removeAttribute('is');
					}
				}
			}

			// Replace comment placeholders
			else if (node.nodeType === 8 && node.nodeValue === '!✨!') {

				if (node?.parentNode?.closest && node?.parentNode?.closest('[contenteditable]'))
					throw new Error(`Contenteditable can't have expressions inside them. Use <div contenteditable value="\${...}"> instead.`);

				// Get or create nodeBefore.
				let nodeBefore = node.previousSibling; // Can be the same as another Path's nodeMarker.
				if (!nodeBefore) {
					nodeBefore = Globals.doc.createComment('ExprPath:'+this.paths.length);
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

				let path = new ExprPathNodes(nodeBefore, nodeMarker);
				this.paths.push(path);
				placeholdersUsed ++;
			}

			// Comments become text nodes when inside textareas.
			else if (node.nodeType === 3 && node.parentNode?.tagName === 'TEXTAREA' && node.textContent.includes('<!--!✨!-->'))
				throw new Error(`Textarea can't have expressions inside them. Use <textarea value="\${...}"> instead.`);
			
			
			// Sometimes users will comment out a block of html code that has expressions.
			// Here we look for expressions in comments.
			// We don't actually update them dynamically, but we still add paths for them.
			// That way the expression count still matches.
			else if (node.nodeType === 8) { // Node.COMMENT_NODE
				let parts = node.textContent.split(/[\ue000-\uf8ff]/g);
				for (let i=0; i<parts.length-1; i++) {
					let path = new ExprPath(node.previousSibling, node)
					this.paths.push(path);
					placeholdersUsed ++;
				}
			}

			// Replace comment placeholders inside script and style tags, which have become text nodes.
			else if (node.nodeType === 3 && ['SCRIPT', 'STYLE'].includes(node.parentNode?.nodeName)) { // Node.TEXT_NODE
				let parts = node.textContent.split(commentPlaceholder);
				if (parts.length > 1) {

					let placeholders = [];
					for (let i = 0; i<parts.length; i++) {
						let current = Globals.doc.createTextNode(parts[i]);
						node.parentNode.insertBefore(current, node);
						if (i > 0)
							placeholders.push(current)
					}

					for (let i=0, node; node=placeholders[i]; i++) {
						let path = new ExprPathNodes(node.previousSibling, node);
						this.paths.push(path);
						placeholdersUsed ++;

						/*#IFDEV*/path.verify();/*#ENDIF*/
					}

					// Removing them here will mess up the treeWalker.
					toRemove.push(node);
				}
			}
		}
		toRemove.map(el => el.remove());

		// Less than or equal because there can be one path to multiple expressions
		// if those expressions are in the same attribute value.
		if (placeholdersUsed !== html.length-1)
			throw new Error(`Could not parse expressions in template.  Check for duplicate attributes or malformed html: ${html.join('${...}')}`);

		for (let path of this.paths) {
			if (path.nodeBefore)
				path.nodeBeforeIndex = Array.prototype.indexOf.call(path.nodeBefore.parentNode.childNodes, path.nodeBefore)

			// Must be calculated after we remove the toRemove nodes:
			path.nodeMarkerPath = NodePath.get(path.nodeMarker)


		}

		this.findEmbeds();


		/*#IFDEV*/this.verify();/*#ENDIF*/
	}

	/**
	 * 1. Add a Unicode placeholder char for where expressions go within attributes.
	 * 2. Add a comment placeholder for where expressions are children of other nodes.
	 * 3. Append -solarite-placeholder to the tag names of custom components so that we can instantiate them later
	 *    when we can manually call their constructors with the proper attribute and children arguments from evaluated expressions.
	 * @param htmlChunks {string[]}
	 * @returns {string} Html with the placeholders in place. */
	static addPlaceholders(htmlChunks) {
		let result = [];

		let htmlParser = new HtmlParser(); // Reset the context.
		for (let i = 0; i < htmlChunks.length; i++) {
			let lastHtml = htmlChunks[i];

			// Append -solarite-placholder to web component tags, so we can pass args to them when they're instantiated.
			let lastIndex = 0;
			let context = htmlParser.parse(lastHtml, (html, index, prevContext, nextContext) => { // This function is called every time the html context changes.
				if (lastIndex !== index) {
					let token = html.slice(lastIndex, index);

					if (prevContext === HtmlParser.Tag) {
						// Find Web Component tags and append -solarite-placeholder to their tag names
						// This way we can gather their constructor arguments and their children before we call their constructor.
						// Later, ExprPathComponent.apply() will replace them with the real components.
						// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
						const isWebComponentTagName = /^<\/?[a-z][a-z0-9]*-[a-z0-9-]+/i; // a dash in the middle
						token = token.replace(isWebComponentTagName, match => match + '-solarite-placeholder');
					}

					result.push(token);
				}
				lastIndex = index;
			});

			// Insert placeholders
			if (i < htmlChunks.length - 1) {
				if (context === HtmlParser.Text)
					result.push(commentPlaceholder) // Comment Placeholder. because we can't put text in between <tr> tags for example.
				else
					result.push(String.fromCharCode(attribPlaceholder + i));
			}
		}

		return result.join('');
	}

	/**
	 * We find the path to every embed here once in the Shell, instead of every time a NodeGroup is instantiated.
	 * When a Nodegroup is created, it calls NodeGroup.activateEmbeds() that uses these paths.
	 * Populates:
	 * this.scripts
	 * this.styles
	 * this.ids
	 * this.staticComponents */
	findEmbeds() {
		this.scripts = Array.prototype.map.call(this.fragment.querySelectorAll('scripts'), el => NodePath.get(el))

		// TODO: only find styles that have ExprPaths in them?
		this.styles = Array.prototype.map.call(this.fragment.querySelectorAll('style'), el => NodePath.get(el))

		let idEls = this.fragment.querySelectorAll('[id],[data-id]');

		// Check for valid id names.
		for (let el of idEls) {
			let id = el.getAttribute('data-id') || el.getAttribute('id')
			if (Globals.div.hasOwnProperty(id))
				throw new Error(`<${el.tagName.toLowerCase()} id="${id}"> can't override existing HTMLElement id property.`)
		}

		this.ids = Array.prototype.map.call(idEls, el => NodePath.get(el))

		/*
		for (let el of this.fragment.querySelectorAll('*')) {
			if (el.tagName.includes('-') || el.hasAttribute('_is')) {

				let path = NodePath.get(el);
				this.componentPaths.push(path);


				// Dynamic components are components that have attributes with expression values.
				// They are created from applyExprs()
				// But static components are created in a separate path inside the NodeGroup constructor.
				if (!this.paths.find(path => path.nodeMarker === el))
					this.staticComponentPaths.push(path);
			}
		}
		*/
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


const commentPlaceholder = `<!--!✨!-->`;


// We increment the placeholder char as we go because nodes can't have the same attribute more than once.
const attribPlaceholder = 0xe000; // https://en.wikipedia.org/wiki/Private_Use_Areas  6400.


