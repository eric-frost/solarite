import assert from "./assert.js";
import Path from "./Path.js";
import Util from "./Util.js";
import Globals from "./Globals.js";
import HtmlParser from "./HtmlParser.js";
import PathToEvent from "./PathToEvent.js";
import PathToAttribValue from "./PathToAttribValue.js";
import PathToAttribs from "./PathToAttribs.js";
import PathToNodes from "./PathToNodes.js";
import PathToComponent from "./PathToComponent.js";
import PathToKey from "./PathToKey.js";

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

	/** @type {Path[]} Paths to where expressions should go. */
	paths = [];

	// Elements with events.  Is there a reason to use this?  We already mark event Exprs in Shell.js.
	// events = [];

	/** @type {int[][]} Array of paths */
	ids = [];

	/** @type {int[][]} Array of paths */
	styles = [];

	/** @type {int[][]} Array of paths */
	scripts = [];

	/** @type {boolean} True if any of this Shell's own paths is a PathToComponent. */
	hasComponentPaths = false;

	/** @type {boolean} True if every path consumes exactly one expression and none are components.
	 * Lets NodeGroup.applyExprs() use a fast loop without allocating per-path expression arrays. */
	pathsSingleExpr = false;

	/** @type {boolean} True if this Shell has any ids, styles, or scripts. */
	hasEmbeds = false;

	/** @type {int} Index of the key=${} expression, or -1 when the template isn't keyed. */
	keyIndex = -1;

	/** @type {boolean} True when the fragment holds exactly one root element and the resolve
	 * program exists.  NodeGroups then clone that element directly, skipping a throwaway
	 * DocumentFragment wrapper per clone.  See setPathsFromFragment(). */
	singleRoot = false;

	/** @type {boolean} True when NodeGroups can be created via NodeGroup.applyStamp()
	 * with no per-instance Path objects.  See the stampPaths setup in the constructor. */
	stampable = false;

	/**
	 * Create the nodes but without filling in the expressions.
	 * This is useful because the expression-less nodes created by a template can be cached.
	 * @param html {string[]} Html strings, split on places where an expression exists.
	 * @param svgMode {boolean} Parse the html in the SVG namespace.  */
	constructor(html=null, svgMode=false) {
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
		if (htmlWithPlaceholders) {
			// Wrap in <svg> so the parser's foreign-content rules create the nodes in the SVG namespace,
			// then lift the children back out so the fragment has no wrapper.
			if (svgMode) {
				template.innerHTML = '<svg>' + htmlWithPlaceholders + '</svg>';
				let svgEl = template.content.firstChild;
				let frag = Globals.doc.createDocumentFragment();
				while (svgEl.firstChild)
					frag.append(svgEl.firstChild);
				this.fragment = frag;
			}
			else {
				template.innerHTML = htmlWithPlaceholders;
				this.fragment = template.content;
			}
		}
		else { // Create one text node, so shell isn't empty and NodeGroups created from it have something to point the startNode and endNode at.
			template.content.append(Globals.doc.createTextNode(''))
			this.fragment = template.content;
		}

		// 1b. Remove whitespace-only text nodes inside table-structure elements.
		// The parser foster-parents non-whitespace text out of tables, and whitespace-only
		// text between cells/rows is never rendered, so removing it is invisible.
		// Smaller fragments make cloning, path resolution, and insertion faster.
		stripTableWhitespace(this.fragment);

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

					// The reserved key attribute identifies this template within a keyed list.
					// It's consumed here and never written to the DOM or passed to components.
					if (attr.name === 'key') {
						let parts = attr.value.split(/[\ue000-\uf8ff]/g);
						if (parts.length !== 2 || parts[0] !== '' || parts[1] !== '')
							throw new Error(`The key attribute is reserved and must be a single expression: key=\${...}`);
						if (node.parentNode !== this.fragment)
							throw new Error(`The key attribute must be on a top-level element of its template.`);
						if (this.keyIndex >= 0)
							throw new Error(`A template can have only one key attribute.`);
						this.keyIndex = attr.value.charCodeAt(0) - attribPlaceholder;

						let path = new PathToKey(null, node);
						this.paths.push(path);
						if (isComponent)
							componentAttribPaths.push(path); // Keeps PathToComponent's contiguous expression slices aligned; it skips PathToKey when building args.

						placeholdersUsed++;
						node.removeAttribute('key');
						continue;
					}

					// One or more whole attributes
					let matches = attr.name.match(/^[\ue000-\uf8ff]$/)
					if (matches) {
						let path = new PathToAttribs(null, node);
						this.paths.push(path);
						if (isComponent) {
							path.isComponentAttrib = true;
							componentAttribPaths.push(path);
						}

						placeholdersUsed ++;
						node.removeAttribute(matches[0]); // TODO: Is this necessary?
					}

					// Just the attribute value.
					else {
						let parts = attr.value.split(/[\ue000-\uf8ff]/g);
						if (parts.length > 1) {
							let nonEmptyParts = (parts.length === 2 && !parts[0].length && !parts[1].length) ? null : parts;

							let isEvent = Util.isEvent(attr.name);
							let path = isEvent
								? new PathToEvent(null, node, attr.name, nonEmptyParts)
								: new PathToAttribValue(null, node, attr.name, nonEmptyParts);
							path.isHtmlProperty = Util.isHtmlProp(node, attr.name);
							this.paths.push(path);
							if (isComponent) {
								path.isComponentAttrib = true;
								componentAttribPaths.push(path);
							}

							placeholdersUsed += parts.length - 1;
							// In svgMode, setting typed SVG attributes (viewBox, r, etc.) with the placeholders
							// stripped out makes the browser log parse errors, both here and when the fragment is cloned.
							// Remove the attribute instead; apply() recreates it with the real values.
							// Event attributes bound to a single expression are removed because they bind via
							// addEventListener; leaving an empty onclick="" attribute violates a strict CSP when the event fires.
							if (svgMode || (isEvent && !nonEmptyParts))
								node.removeAttribute(attr.name);
							else try {
								node.setAttribute(attr.name, parts.join(''));
							}
							catch (e) {
								throw new Error(`Error setting attribute "${attr.name}" on node <${node.tagName}>: ${e.message}`);
							}
						}
					}
				}

				// Web components
				if (isComponent) {
					let path = new PathToComponent(null, node);
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

				let parent = node.parentNode;

				// The expression is the only child of an element, so the element itself
				// can delimit the expression's nodes and no marker comments are needed.
				// Components and slots are excluded because they move their children
				// during instantiation, which would orphan the expression's region.
				if (parent.nodeType === 1 && !node.previousSibling && !node.nextSibling
					&& !parent.tagName.includes('-') && parent.tagName !== 'SLOT' && !parent.hasAttribute('is')) {
					let path = new PathToNodes(null, parent);
					path.wholeParent = true;
					this.paths.push(path);
					placeholdersUsed ++;
					toRemove.push(node); // Removing it here would mess up the treeWalker.
				}

				else {
					// Get or create nodeBefore.
					let nodeBefore = node.previousSibling; // Can be the same as another Path's nodeMarker.
					if (!nodeBefore) {
						nodeBefore = Globals.doc.createComment('Path:'+this.paths.length);
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
						nodeMarker.textContent = 'PathEnd:'+ this.paths.length;
					}
					/*#IFDEV*/assert(nodeMarker);/*#ENDIF*/

					let path = new PathToNodes(nodeBefore, nodeMarker);
					this.paths.push(path);
					placeholdersUsed ++;
				}
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
					let path = new Path(node.previousSibling, node)
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
						let path = new PathToNodes(node.previousSibling, node);
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
			path.nodeMarkerPath = Path.get(path.nodeMarker)


		}

		this.findEmbeds();
		this.buildResolveProgram();

		this.pathsSingleExpr = true;
		for (let path of this.paths) {
			if (path instanceof PathToComponent) {
				this.hasComponentPaths = true;
				this.pathsSingleExpr = false;
				break; // Both facts are now decided.
			}
			if (path.getExpressionCount() !== 1)
				this.pathsSingleExpr = false; // Keep scanning for components.
		}

		// Stampable shells create NodeGroups without allocating any Path objects:
		// NodeGroup.applyStamp() writes expressions through these shared stamper paths,
		// and real paths are materialized only if a NodeGroup is later rewritten in place.
		// Child-node paths must be wholeParent so their bare-text state can be recovered.
		if (this.singleRoot && this.pathsSingleExpr) {
			let nodesIdx = [];
			let ok = true;
			for (let i=0; i<this.paths.length; i++) {
				let path = this.paths[i];
				if (path instanceof PathToNodes) {
					if (!path.wholeParent) {
						ok = false;
						break;
					}
					nodesIdx.push(i);
				}
				else if (!(path instanceof PathToAttribValue || path instanceof PathToKey)) {
					ok = false; // Base Paths from commented-out expressions, etc.
					break;
				}
			}
			if (ok) {
				this.stampable = true;

				/** @type {int[]} Indexes of PathToNodes paths, checked for primitive exprs before stamping. */
				this.nodesPathIdx = nodesIdx;

				/** @type {Path[]} One shared stamper per path; nodeMarker/parentNg are set per use. */
				this.stampPaths = this.paths.map(p => p.cloneWithNodes(null, p.nodeMarker));

			}
		}

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
			let context = htmlParser.parse(lastHtml, (html, index, prevContext/*, nextContext*/) => { // This function is called every time the html context changes.
				if (lastIndex !== index) {
					let token = html.slice(lastIndex, index);

					if (prevContext === HtmlParser.Tag) {
						// Find Web Component tags and append -solarite-placeholder to their tag names
						// This way we can gather their constructor arguments and their children before we call their constructor.
						// Later, PathToComponent.apply() will replace them with the real components.
						// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
						const isWebComponentTagName = /^<\/?[a-z][a-z0-9]*-[a-z0-9-]+/i; // a dash in the middle
						token = token.replace(isWebComponentTagName, match => match + '-SOLARITE-PLACEHOLDER'); // caps to match other instances of this string, for better compression.
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
		this.scripts = Array.prototype.map.call(this.fragment.querySelectorAll('script'), el => Path.get(el))

		// TODO: only find styles that have Paths in them?
		this.styles = Array.prototype.map.call(this.fragment.querySelectorAll('style'), el => Path.get(el))

		let idEls = this.fragment.querySelectorAll('[id],[data-id]');

		// Check for valid id names.
		for (let el of idEls) {
			let id = el.getAttribute('data-id') || el.getAttribute('id')
			if (Globals.div.hasOwnProperty(id))
				throw new Error(`<${el.tagName.toLowerCase()} id="${id}"> can't override existing HTMLElement id property.`)
		}

		this.ids = Array.prototype.map.call(idEls, el => Path.get(el))

		this.hasEmbeds = this.ids.length > 0 || this.styles.length > 0 || this.scripts.length > 0;
	}

	/**
	 * Precompute a flat program that resolves every path's nodeMarker/nodeBefore in a cloned
	 * fragment with one childNodes access per unique node, sharing ancestor lookups between paths.
	 * Replaces per-path root-to-node walks in the hot NodeGroup creation path.
	 * Skipped for shells with components, whose clone() has special attribPaths behavior. */
	buildResolveProgram() {
		let hasComponents = false;
		for (let path of this.paths)
			if (path instanceof PathToComponent) {
				hasComponents = true;
				break;
			}
		if (hasComponents || !this.paths.length)
			return;

		let ops = [];
		let slotOf = new Map();
		let frag = this.fragment;
		let nextSlot = 1;
		let getSlot = node => {
			if (node === frag)
				return 0;
			let s = slotOf.get(node);
			if (s === undefined) {
				ops.push(getSlot(node.parentNode), Array.prototype.indexOf.call(node.parentNode.childNodes, node));
				s = nextSlot++;
				slotOf.set(node, s);
			}
			return s;
		};
		for (let path of this.paths) {
			path.markerSlot = path.nodeMarker === frag ? 0 : getSlot(path.nodeMarker);
			path.beforeSlot = path.nodeBefore ? getSlot(path.nodeBefore) : -1;
		}

		/** @type {?int[]} Flat [parentSlot, childIndex] pairs; pair i fills slot i+1. */
		this.resolveOps = ops;

		/** @type {Node[]} Reusable scratch array for resolved nodes; safe because resolution never re-enters. */
		this.resolveSlots = new Array(nextSlot);

		// A lone root element means slot 1 is always that element (the first op pair is [0, 0]),
		// so a NodeGroup can clone the element directly and seed slot 1 with it.
		// Embeds are excluded because their paths are fragment-relative.
		if (!this.hasEmbeds && frag.childNodes.length === 1 && frag.firstChild.nodeType === 1
			&& ops.length >= 2 && ops[0] === 0 && ops[1] === 0)
			this.singleRoot = true;
	}

	/**
	 * Get the shell for the html strings.
	 * @param htmlStrings {string[]} Typically comes from a Template.
	 * @param svgMode {boolean} Parse the html in the SVG namespace.
	 * @returns {Shell} */
	static get(htmlStrings, svgMode=false) {
		// One-entry memo, since loops request the same shell for every item.
		if (htmlStrings === lastHtmlStrings && svgMode === lastSvgMode)
			return lastShell;

		let entry = Globals.shells.get(htmlStrings);
		if (!entry) {
			entry = {};
			Globals.shells.set(htmlStrings, entry); // cache
		}
		let key = svgMode ? 'svg' : 'html';
		let result = entry[key];
		if (!result)
			result = entry[key] = new Shell(htmlStrings, svgMode);

		lastHtmlStrings = htmlStrings;
		lastSvgMode = svgMode;
		lastShell = result;

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

// Elements whose whitespace-only text children are never rendered.
const tableTags = ['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR'];

/**
 * Recursively remove whitespace-only text children of table-structure elements.
 * @param el {DocumentFragment|HTMLElement} */
function stripTableWhitespace(el) {
	let isTable = el.nodeType === 1 && tableTags.includes(el.tagName);
	let child = el.firstChild;
	while (child) {
		let next = child.nextSibling;
		if (child.nodeType === 1)
			stripTableWhitespace(child);
		else if (isTable && child.nodeType === 3 && !child.nodeValue.trim())
			child.remove();
		child = next;
	}
}

// One-entry memo for Shell.get().
let lastHtmlStrings = null, lastSvgMode = false, lastShell = null;


// We increment the placeholder char as we go because nodes can't have the same attribute more than once.
const attribPlaceholder = 0xe000; // https://en.wikipedia.org/wiki/Private_Use_Areas  6400.


