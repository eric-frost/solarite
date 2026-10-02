import assert from "./assert.js";
import Path from "./Path.js";
import Util from "./Util.js";
import Globals from "./Globals.js";
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
	docFrag;

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

	/** @type {boolean} True if any path binds an attribute that's a live HTML property
	 * (checked, value, selected — Util.isHtmlProp).  Users flip those underneath the template,
	 * so "expression unchanged" doesn't mean "DOM unchanged" and the skip shortcuts exempt them. */
	hasLivePropPaths = false;

	/** @type {boolean} True if every path consumes exactly one expression and none are components.
	 * Lets NodeGroup.applyExprs() use a fast loop without allocating per-path expression arrays. */
	pathsSingleExpr = false;

	/** @type {boolean} True when a NodeGroup whose values are unchanged still has work to do:
	 * components re-render so changes deeper in the tree surface, and live HTML properties are
	 * rewritten because a click can flip them underneath the cached expression.  The list scans
	 * check this before calling PathToNodes.refreshSameItem(), so the overwhelmingly common
	 * unchanged row costs one field read instead of a call. */
	needsRefresh = false;

	/** @type {boolean} True once a NodeGroup made from this Shell has held a raw DOM node given
	 * as an expression, in a place of its own or in a NodeGroup inside it.  A node can be in only
	 * one place, so the next NodeGroup that is given the same node takes it away, and nothing
	 * tells the one it was taken from.  That is harmless while both are being rendered, because
	 * the one that lost the node is given something else in the same render.  A NodeGroup that
	 * was removed and kept for reuse is not being rendered, though: it would come back still
	 * recording the node as its own, be given that node again, find nothing changed and show an
	 * empty place.  So PathToNodes discards a removed NodeGroup of such a Shell, as it does a
	 * keyed row, and builds a new one when one is needed.  Sticky, and shared by every NodeGroup
	 * of the Shell, which can only cost a rebuild that wasn't needed. */
	heldRawNodes = false;

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

	// The remaining fields are only filled in for some shells (resolve program, stampable),
	// but they're all declared here so every Shell instance shares one hidden class.
	// NodeGroup's per-row code (its constructor, applyStamp, resolveStampSlots) reads these
	// off whichever shell it's given, and a single shape keeps those loads monomorphic.

	/** @type {?string} The Template close key, cached here by the NodeGroup constructor so
	 * each new template row skips a WeakMap lookup.  See Template.getCloseKey(). */
	closeKey;

	/** @type {?int[]} The resolve program: flat [parentSlot, childIndex] pairs in dependency
	 * order; pair i fills slot i+1, slot 0 being the fragment.  Built by buildResolveProgram();
	 * undefined for shells with components. */
	resolveOps;

	/** @type {?Node[]} Reusable scratch array for resolved nodes; safe because resolution
	 * never re-enters. */
	resolveSlots;

	// The stamp program, set only when stampable is true:

	/** @type {?int[]} Indexes of PathToNodes paths, checked for primitive exprs before stamping. */
	nodesPathIdx;

	/** @type {?Path[]} One shared stamper per path; nodeMarker/parentNg are set per use. */
	stampPaths;

	/** @type {?Uint8Array} Opcode per path; see the stamp-program comment in the constructor. */
	stampOp;

	/** @type {?Uint16Array} paths[i].markerSlot, in a flat array so the hot loop
	 * doesn't load the Path object to find its slot. */
	stampSlot;

	/** @type {?Array} Per-path extra the stamp program needs: the attribute name for op 4, and
	 * for a whole-parent text child (op 2) the index in a row's NodeGroup.stampSlots() array
	 * where the row keeps that child's Text node.  Null otherwise. */
	stampAux;

	/** @type {?string[]} The delegatable event names this shell binds, each listed once, so a
	 * loop can register their dispatchers once for the whole run of rows instead of testing
	 * every bound node. */
	stampEventNames;

	/** @type {?Uint8Array} Per-path flags the in-place rewrite loop needs, so it reads one byte
	 * from a flat array instead of two properties from a Path object it otherwise wouldn't
	 * touch.  Bit 1 = the path binds a live HTML property, bit 2 = it's a whole-parent child. */
	stampFlags;

	/** @type {?HTMLElement} A copy of the root element with an empty text node inside every
	 * whole-parent child marker.  A new row writes its primitive child text into those text
	 * nodes and clones this instead of docFrag, so the clone carries the text natively and
	 * nothing has to reach into the clone afterwards.  Every read of a clone's child creates
	 * a JS wrapper for that node, and the wrappers cost as much to make, and later to
	 * collect, as the writes they were made for.  See NodeGroup's constructor. */
	stampMaster;

	/** @type {?Text[]} The master's text nodes, in nodesPathIdx order. */
	stampMasterTexts;

	/** @type {?HTMLElement[]} The master's whole-parent markers, the elements those text nodes
	 * sit in, in the same order. */
	stampMasterCells;

	/** @type {?boolean[]} Whether each master text node is currently detached from its cell,
	 * which is how a row with an empty-string child is cloned without an empty text node. */
	stampMasterEmpty;

	/** @type {?Object<string, int[]>} For each delegatable event name this shell binds, a flat
	 * list of [path index, marker slot] pairs.  A row's delegated handlers are never written
	 * onto its nodes; when an event starts, the dispatcher finds the row through its root
	 * element, looks the event's targets up here, and reads the handlers from the row's
	 * template.  Null when the shell binds no delegatable events, and for every shell that
	 * isn't stampable. */
	stampEventsByType = null;

	/**
	 * Create the nodes but without filling in the expressions.
	 * This is useful because the expression-less nodes created by a template can be cached.
	 * @param html {string[]} Html strings, split on places where an expression exists.
	 * @param svgMode {boolean} Parse the html in the SVG namespace.  */
	constructor(html=null, svgMode=false) {
		if (!html)
			return;

		//#IFDEBUG
		this._html = html.join('');
		//#ENDIF

		// If no html tags or entities, just create a text node.
		if (html.length === 1 && !html[0].match(/[<&]/)) {
			this.docFrag = Globals.doc.createTextNode(html[0]);
			return;
		}


		// 1.  Add placeholders
		let htmlWithPlaceholders = Shell.addPlaceholders(html);

		// The html is never empty here: an html of one empty string took the text-node exit above,
		// and any other html holds text or at least one placeholder.
		let template = Globals.doc.createElement('template'); // Using a single global template won't keep the nodes as children of the DocumentFragment.
		this.docFrag = template.content;

		// Wrap in <svg> so the parser's foreign-content rules create the nodes in the SVG namespace,
		// then lift the children back out so the fragment has no wrapper.
		if (svgMode) {
			template.innerHTML = '<svg>' + htmlWithPlaceholders + '</svg>';
			this.docFrag = Globals.doc.createDocumentFragment();
			this.docFrag.append(...template.content.firstChild.childNodes);
		}
		else
			template.innerHTML = htmlWithPlaceholders;

		// 1b. Remove whitespace-only text nodes inside table-structure elements.
		// The parser foster-parents non-whitespace text out of tables, and whitespace-only
		// text between cells/rows is never rendered, so removing it is invisible.
		// Smaller fragments make cloning, path resolution, and insertion faster.
		stripTableWhitespace(this.docFrag);

		// 1c. Neutralize `is` so the browser can't upgrade a placeholder out from under us.
		renameIsAttribs(this.docFrag);

		// 2. Find placeholders
		let node;
		let toRemove = null; // A placeholder node the walker has not moved off yet.

		// The walker needs no filter: a parsed fragment holds only elements, text and comments.
		const walker = Globals.doc.createTreeWalker(this.docFrag);
		while (node = walker.nextNode()) {

			// Remove the placeholder the previous step was done with, now that the walker has moved
			// off it, so paths will still be calculated correctly.  Each step leaves at most one,
			// and removing a node that is already out does nothing.
			toRemove?.remove();
			
			// Replace attributes
			if (node.nodeType === 1) {
				const hasIs = node.hasAttribute('_is'); // Renamed from `is` in step 1c.
				const isComponent = (hasIs || node.tagName.includes('-'));
				const componentAttribPaths = [];

				for (let attr of [...node.attributes]) { // Copy the attributes array b/c we remove attributes with placeholders as we go.
					let name = attr.name, path;

					// The value split around its expressions, and null in place of that when the
					// whole value is one expression.
					let parts = attr.value.split(/[\ue000-\uf8ff]/g);
					let nonEmptyParts = (parts.length === 2 && !parts[0] && !parts[1]) ? null : parts;

					// The reserved key attribute identifies this template within a keyed list.
					// It's consumed here and never written to the DOM or passed to components.
					if (name === 'key') {

						// These three are template-authoring mistakes, and every one of them fails SILENTLY if
						// it isn't caught: the reconciler would key rows on a garbage value and reuse the wrong
						// DOM, with nothing reported.  So they ship, unlike the assertions elsewhere in this
						// file.  The cost is one regex split per unique template \u2014 never per render, never per
						// row \u2014 which is why they are affordable to keep.
						if (nonEmptyParts)
							throw new Error(`Solarite: key must be one whole expression.`);
						if (node.parentNode !== this.docFrag)
							throw new Error(`Solarite: key must be on a top-level element.`);
						if (this.keyIndex >= 0)
							throw new Error(`Solarite: duplicate key attribute.`);

						this.keyIndex = attr.value.charCodeAt(0) - attribPlaceholder;

						// On a component the key still joins componentAttribPaths below, which keeps
						// PathToComponent's contiguous expression slices aligned; it skips PathToKey
						// when building args.
						path = new PathToKey(null, node);
					}

					// One or more whole attributes
					else if (name.match(/^[\ue000-\uf8ff]$/)) {
						path = new PathToAttribs(null, node);
						nonEmptyParts = null; // So the placeholder attribute is removed below.
					}

					// Just the attribute value.
					else if (parts.length > 1) {
						let isEvent = Util.isEvent(name);
						path = isEvent
							? new PathToEvent(null, node, name, nonEmptyParts)
							: new PathToAttribValue(null, node, name, nonEmptyParts);
						// An event attribute is never a live property, though elements do have an
						// onclick property: counting it as one would mark every row that binds an
						// event on a plain element (<i>, <section>, <em>...) as needing a visit on
						// every render, which turns the list shortcuts off for the whole list.
						path.isHtmlProperty = !isEvent && Util.isHtmlProp(node, name);
					}
					else
						continue;

					this.paths.push(path);
					if (isComponent) {
						path.isComponentAttrib = true;
						componentAttribPaths.push(path);
					}

					// An attribute whose whole value is one expression is removed from the shell:
					// its stamped value is always the empty string, so every clone would carry a
					// useless empty attribute that costs storage on creation and a slot in the
					// element's attribute list forever, and apply() writes the real value anyway
					// (a missing attribute reads back as '', so an empty expression still writes
					// nothing).  Event attributes must be removed for the same reason plus a
					// stricter one: an empty onclick="" violates a strict CSP when the event fires.
					// In svgMode, setting typed SVG attributes (viewBox, r, etc.) with the
					// placeholders stripped out makes the browser log parse errors, both here and
					// when the fragment is cloned, so those are removed whether or not they're whole.
					if (svgMode || !nonEmptyParts)
						node.removeAttribute(name);

					// setAttribute throws only when the template author wrote a name the browser
					// refuses, such as one holding a space or a quote.  That name comes from a tagged
					// template literal's static text, so it is a typo that surfaces the first time the
					// template renders and can never appear later or for only some users.  Development
					// therefore wraps the call to rethrow with the attribute name and the tag included,
					// because the browser's own DOMException names neither and leaves the author
					// hunting.  Production ships the bare call and lets that DOMException through: the
					// friendlier wording is only worth its bytes to whoever can still fix the template.
					else /*#IFDEBUG*/try {/*#ENDIF*/
						node.setAttribute(name, parts.join(''));
					/*#IFDEBUG*/}
					catch (e) {
						throw new Error(`Error setting attribute "${name}" on node <${node.tagName}>: ${e.message}`);
					}/*#ENDIF*/
				}

				// Web components
				if (isComponent) {
					let path = new PathToComponent(null, node);
					path.attribPaths = componentAttribPaths;
					this.paths.splice(this.paths.length - componentAttribPaths.length, 0, path); // Insert before its componentAttribPaths

				}
			}

			// Replace comment placeholders
			else if (node.nodeType === 8 && node.nodeValue === '!✨!') {

				// The parent is the fragment itself, which has no closest(), for a top-level expression.
				let parent = node.parentNode;
				if (parent.closest?.('[contenteditable]'))
					throw new Error(`Solarite: no \${...} inside contenteditable; use value="\${...}".`);

				// The expression is the only child of an element, so the element itself
				// can delimit the expression's nodes and no marker comments are needed.
				// Components and slots are excluded because they move their children
				// during instantiation, which would orphan the expression's region.
				if (parent.nodeType === 1 && !node.previousSibling && !node.nextSibling
					&& !parent.tagName.includes('-') && parent.tagName !== 'SLOT' && !parent.hasAttribute('_is')) {
					let path = new PathToNodes(null, parent);
					path.wholeParent = true;
					this.paths.push(path);
					toRemove = node; // Removing it here would mess up the treeWalker.
				}

				else {
					// Get or create nodeBefore.
					let nodeBefore = node.previousSibling; // Can be the same as another Path's nodeMarker.
					if (!nodeBefore) {
						nodeBefore = Globals.doc.createComment('Path:'+this.paths.length);
						node.before(nodeBefore);
					}
					/*#IFDEBUG*/assert(nodeBefore);/*#ENDIF*/

					// Get the next node.
					let nodeMarker;

					// A subsequent node is available to be a nodeMarker.
					if (node.nextSibling && (node.nextSibling.nodeType !== 8 || node.nextSibling.textContent !== '!✨!')) {
						nodeMarker = node.nextSibling;
						toRemove = node; // Removing it here would mess up the treeWalker.
					}
					// Re-use existing comment placeholder.
					else {
						nodeMarker = node;
						nodeMarker.textContent = 'PathEnd:'+ this.paths.length;
					}
					/*#IFDEBUG*/assert(nodeMarker);/*#ENDIF*/

					let path = new PathToNodes(nodeBefore, nodeMarker);
					this.paths.push(path);
				}
			}

			// Sometimes users will comment out a block of html code that has expressions.
			// Here we look for expressions in comments.
			// We don't actually update them dynamically, but we still add paths for them.
			// That way the expression count still matches.
			else if (node.nodeType === 8) { // Node.COMMENT_NODE
				let parts = node.textContent.split(/[\ue000-\uf8ff]/g);
				for (let i=0; i<parts.length-1; i++) {
					let path = new Path(node.previousSibling, node)
					this.paths.push(path);
				}
			}

			// A few elements have raw-text bodies, which the html parser reads as literal characters
			// rather than as markup.  A comment placeholder written inside one therefore never becomes
			// a comment node; it arrives here as ordinary text.  A textarea can't support expressions
			// in its body at all, while script and style can, by splitting their text around each
			// placeholder so that every expression gets a text node of its own to write into.
			else if (node.nodeType === 3) { // Node.TEXT_NODE
				let parentName = node.parentNode?.nodeName;

				if (parentName === 'TEXTAREA' && node.textContent.includes(commentPlaceholder))
					throw new Error(`Solarite: no \${...} inside textarea; use value="\${...}".`);

				else if (parentName === 'SCRIPT' || parentName === 'STYLE') {
					let parts = node.textContent.split(commentPlaceholder);
					if (parts.length > 1) {

						// Every part is inserted before the original node, in order, so from the second
						// part onward the text node made on the previous iteration is already sitting
						// immediately before this one and serves as the new path's nodeBefore.
						for (let i = 0; i<parts.length; i++) {
							let current = Globals.doc.createTextNode(parts[i]);
							node.before(current);
							if (i > 0) {
								let path = new PathToNodes(current.previousSibling, current);
								this.paths.push(path);

								/*#IFDEBUG*/path.verify();/*#ENDIF*/
							}
						}

						// Removing it here will mess up the treeWalker.
						toRemove = node;
					}
				}
			}
		}
		toRemove?.remove();

		this.findEmbeds();

		// This scan must run before buildResolveProgram(), which skips shells with components
		// and reads hasComponentPaths rather than walking the paths a second time.
		this.pathsSingleExpr = true;
		let placeholdersUsed = 0;
		for (let path of this.paths) {
			// -1 when the path has no nodeBefore.  Assigned unconditionally so every shell path
			// of a given class takes the same property-addition order and shares one hidden class.
			path.nodeBeforeIndex = path.nodeBefore
				? Array.prototype.indexOf.call(path.nodeBefore.parentNode.childNodes, path.nodeBefore)
				: -1;

			// Must be calculated after the placeholders are removed:
			path.nodeMarkerPath = Path.get(path.nodeMarker)

			if (path instanceof PathToComponent)
				this.hasComponentPaths = true;

			// A component path takes no expression of its own, and one attribute value can take several.
			let count = path.getExpressionCount();
			placeholdersUsed += count;
			if (count !== 1)
				this.pathsSingleExpr = false;
			if (path.isHtmlProperty) // needs the full scan — no early break
				this.hasLivePropPaths = true;
		}

		// Every expression of the template must have found its path.  The browser's parser drops
		// what it can't place, such as the second of two attributes with the same name.
		if (placeholdersUsed !== html.length-1)
			throw new Error(`Solarite: bad html or duplicate attribute: ${html.join('${...}')}`);

		this.needsRefresh = this.hasComponentPaths || (this.hasLivePropPaths && this.pathsSingleExpr);

		this.buildResolveProgram();

		// Stampable shells create NodeGroups without allocating any Path objects:
		// NodeGroup.applyStamp() writes expressions through these shared stamper paths,
		// and real paths are materialized only if a NodeGroup is later rewritten in place.
		if (this.singleRoot && this.pathsSingleExpr) {

			// Compiled stamp program: one opcode per path lets applyStamp() write a fresh
			// row through a flat branch chain instead of dispatching applySingle() per path.
			// 0 = generic (shared stamper fallback), 1 = list key (no DOM), 2 = wholeParent
			// child text, 3 = delegatable single-expression event (left in the row's template
			// for the dispatcher when the root delegates every event, the default; otherwise
			// bound by the shared stamper), 4 = a plain attribute holding one whole expression
			// (see the branch that assigns it below).  The same pass decides whether the shell
			// is stampable at all, and fills the dispatcher's lookup table (stampEventsByType).
			let n = this.paths.length;
			let ops = new Uint8Array(n), slots = new Uint16Array(n), flags = new Uint8Array(n);
			let aux = new Array(n).fill(null);
			let nodesIdx = [], byType = null, ok = true;
			for (let i=0; i<n; i++) {
				let path = this.paths[i];
				slots[i] = path.markerSlot;
				flags[i] = (path.isHtmlProperty ? 1 : 0) | (path.wholeParent ? 2 : 0);
				if (path instanceof PathToKey)
					ops[i] = 1;
				else if (path.wholeParent) {
					ops[i] = 2;
					aux[i] = this.resolveSlots.length + nodesIdx.length;
					nodesIdx.push(i);
				}

				// An event stays generic unless the dispatcher handles it: an event that is bound
				// when the row is drawn must go through PathToEvent.applySingle(), which rejects
				// a value that isn't a handler.  As a plain attribute, a string given to onfocus
				// would be written to the row and run by the browser as an inline handler.
				else if (path instanceof PathToEvent) {
					if (path.delegatedKey !== undefined && !path.attrValue) {
						ops[i] = 3;
						byType ??= {};
						(byType[path.eventName] ??= []).push(i, path.markerSlot);
					}
				}

				// A plain attribute holding one whole expression.  The shell no longer carries
				// the attribute at all (see the placeholder handling above), so on a freshly
				// cloned row the value is known to be absent and a string can be written
				// without first reading back what's there.  It is never a component's attribute:
				// a shell that holds a component isn't pathsSingleExpr.
				else if (path instanceof PathToAttribValue) {
					if (!path.attrValue && !path.isHtmlProperty) {
						ops[i] = 4;
						aux[i] = path.attribName;
					}
				}

				// A child that isn't the only child of its parent, whose bare-text state couldn't
				// be recovered, or a path the stamp program has no way to write: whole attributes,
				// the base Path of a commented-out expression.
				else
					ok = false;
			}
			if (ok) {
				this.stampable = true;
				this.nodesPathIdx = nodesIdx;
				this.stampPaths = this.paths.map(p => p.cloneWithNodes(null, p.nodeMarker));
				this.stampOp = ops;
				this.stampSlot = slots;
				this.stampAux = aux;
				this.stampFlags = flags;
				this.stampEventsByType = byType;
				this.stampEventNames = byType && Object.keys(byType);

				// The master rows are cloned from, see stampMaster.  Its text nodes are made in the
				// template's inert document with the rest of the shell, since cloning there is
				// cheaper than in the page's document (the exp2 note in optimization-log.md).
				let master = this.stampMaster = this.docFrag.firstChild.cloneNode(true);
				let doc = master.ownerDocument;
				this.stampMasterCells = nodesIdx.map(i => Path.resolve(master, this.paths[i].nodeMarkerPath, 1));
				this.stampMasterTexts = this.stampMasterCells.map(el => {
					let tn = doc.createTextNode('');
					el.append(tn);
					return tn;
				});
				this.stampMasterEmpty = nodesIdx.map(() => false);
			}
		}

		/*#IFDEBUG*/this.verify();/*#ENDIF*/
	}

	/**
	 * 1. Add a Unicode placeholder char for where expressions go within attributes.
	 * 2. Add a comment placeholder for where expressions are children of other nodes.
	 * 3. Append -solarite-placeholder to the tag names of custom components so that we can instantiate them later
	 *    when we can manually call their constructors with the proper attribute and children arguments from evaluated expressions.
	 * @param htmlChunks {string[]}
	 * @returns {string} Html with the placeholders in place. */
	static addPlaceholders(htmlChunks) {
		let result = '';

		// Where the tokenizer is as it walks the chunks.  An expression can sit in the middle of an attribute
		// value, so both of these have to survive from one chunk to the next.  Nothing else has to: an
		// expression anywhere inside a tag gets the same attribute placeholder, so the machine only has to
		// know whether it is inside a tag at all, and whether a quoted value is currently open.
		let inTag = false; // True from the '<' that opens a tag or comment through the '>' that closes it.
		let quote = null; // The quote character that opened the attribute value we're inside of: null, '"', or "'".

		for (let i = 0; i < htmlChunks.length; i++) {
			let html = htmlChunks[i];

			// Append -solarite-placholder to web component tags, so we can pass args to them when they're instantiated.
			let lastIndex = 0; // Start of the run of this chunk not yet copied into result.
			for (let j = 0; j < html.length; j++) {
				const char = html[j];

				if (!inTag) {
					if (char === '<' && html[j + 1].match(/[/a-z!]/i)) { // Start of a tag or comment.
						inTag = true;

						// A component suffix can only ever be added right here, at the '<' that opens the tag, so
						// the name is matched on the spot with a sticky regex rather than collected into a buffer
						// and matched later.  The greedy tag-name class can't run past the name, because every
						// character that can follow a tag name is outside it.
						isWebComponentTagName.lastIndex = j;
						let match = isWebComponentTagName.exec(html);
						if (match) {
							let end = j + match[0].length;
							result += html.slice(lastIndex, end) + '-SOLARITE-PLACEHOLDER';
							lastIndex = end;
						}
					}
				}

				// Inside a tag, only two characters end anything: the quote that closes the value we're in, or,
				// when we're not in one, the '>' that closes the tag.  Attribute names, '=', unquoted values and
				// whitespace all need no handling at all.
				else if (quote) {
					if (char === quote)
						quote = null;
				}
				else if (char === '"' || char === "'")
					quote = char;
				else if (char === '>')
					inTag = false;
			}

			result += html.slice(lastIndex);

			// Insert placeholders
			if (i < htmlChunks.length - 1)
				result += inTag
					? String.fromCharCode(attribPlaceholder + i)
					: commentPlaceholder; // Comment Placeholder. because we can't put text in between <tr> tags for example.
		}

		return result;
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
		this.scripts = Array.prototype.map.call(this.docFrag.querySelectorAll('script'), el => Path.get(el))

		// TODO: only find styles that have Paths in them?
		this.styles = Array.prototype.map.call(this.docFrag.querySelectorAll('style'), el => Path.get(el))

		// An id that would clobber a built-in element property is reported by Util.bindId(), which
		// asks the real component object, with `in`, at the moment the binding happens.  The check
		// that used to stand here asked Globals.div.hasOwnProperty(id) instead, and a freshly
		// created element has no own properties at all — every DOM property an element exposes
		// lives on its interface prototype — so that test could never be true and the error it
		// guarded was never reachable.
		this.ids = Array.prototype.map.call(this.docFrag.querySelectorAll('[id],[data-id]'), el => Path.get(el))

		this.hasEmbeds = this.ids.length > 0 || this.styles.length > 0 || this.scripts.length > 0;
	}

	/**
	 * Precompute a flat program that resolves every path's nodeMarker/nodeBefore in a cloned
	 * fragment with one childNodes access per unique node, sharing ancestor lookups between paths.
	 * Replaces per-path root-to-node walks in the hot NodeGroup creation path.
	 * Skipped for shells with components, whose clone() has special attribPaths behavior. */
	buildResolveProgram() {
		if (this.hasComponentPaths || !this.paths.length)
			return;

		let ops = [];
		let slotOf = new Map();
		let frag = this.docFrag;
		let nextSlot = 1;
		let getSlot = node => {
			if (node === frag)
				return 0;
			let s = slotOf.get(node);
			if (s === undefined) {
				// Two ways to reach a node, costing one pointer step each: walk forward from an
				// already-resolved earlier sibling, or take the parent's firstChild and walk
				// forward.  Sibling steps win whenever they're no more numerous, and they can
				// also spare the parent a slot of its own — in a row of cells, resolving each
				// <td> from the previous one is one step instead of firstChild plus its index.
				let d = 0, from = -1;
				for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
					d++;
					let ss = slotOf.get(sib);
					if (ss !== undefined) {
						from = ss;
						break;
					}
				}
				let index = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
				if (from >= 0 && d <= index + 1)
					ops.push(from, -d); // A negative step count means "walk nextSibling from that slot".
				else
					ops.push(getSlot(node.parentNode), index);
				s = nextSlot++;
				slotOf.set(node, s);
			}
			return s;
		};
		for (let path of this.paths) {
			path.markerSlot = getSlot(path.nodeMarker);
			path.beforeSlot = path.nodeBefore ? getSlot(path.nodeBefore) : -1;
		}

		this.resolveOps = ops;
		this.resolveSlots = new Array(nextSlot);

		// A lone root element means slot 1 is always that element, so a NodeGroup can clone the
		// element directly and seed slot 1 with it.  The first op pair is then always [0, 0]:
		// every marker is that element or inside it, and getSlot() gives an ancestor its slot
		// before the node that asked.  Embeds are excluded because their paths are
		// fragment-relative.
		this.singleRoot = !this.hasEmbeds && frag.childNodes.length === 1 && frag.firstChild.nodeType === 1;
		/*#IFDEBUG*/assert(!this.singleRoot || (ops[0] === 0 && ops[1] === 0));/*#ENDIF*/
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

		/*#IFDEBUG*/result.verify();/*#ENDIF*/
		return result;
	}

	//#IFDEBUG
	// For debugging only:
	verify() {
		for (let path of this.paths) {
			assert(this.docFrag.contains(path.getParentNode()))
			path.verify();
		}
	}
	//#ENDIF
}


const commentPlaceholder = `<!--!✨!-->`;

// A tag name with a dash in the middle, which is what makes an element a web component.  addPlaceholders()
// tests this at each '<' that opens a tag, and a match gets -solarite-placeholder appended to its tag name.
// That way we can gather a component's constructor arguments and its children before we call its constructor;
// later PathToComponent.applyAll() replaces the placeholder tag with the real component.  The suffix is written in
// caps wherever it appears, so that the several copies of it in this project compress well.  It's sticky rather
// than anchored so it can be tested at an offset within the chunk instead of against a sliced-out token.
// Ctrl+F "solarite-placeholder" in project to find all code that manages subcomponents.
const isWebComponentTagName = /<\/?[a-z][a-z0-9]*-[a-z0-9-]+/iy;

/**
 * Remove whitespace-only text children of table-structure elements, whose whitespace is never
 * rendered.  Only html elements count: an svg element may have one of these names, since the
 * parser gives no meaning to them there, and a selector matches it whatever its case.
 * @param docFrag {DocumentFragment} */
function stripTableWhitespace(docFrag) {
	for (let el of docFrag.querySelectorAll('table,thead,tbody,tfoot,tr'))
		if (el instanceof HTMLElement)
			for (let child of [...el.childNodes])
				if (child.nodeType === 3 && !child.nodeValue.trim())
					child.remove();
}

/**
 * Rename every `is` attribute to `_is`, rebuilding the element to do it.
 *
 * A component written as a dashed tag is neutralized in the shell by renaming the TAG
 * (`<my-tag>` becomes `<my-tag-SOLARITE-PLACEHOLDER>`), so the browser never recognizes the
 * placeholder and never upgrades it.  A customized built-in cannot be neutralized that way,
 * because its tag has to stay real:  a `<tr is="my-row">` that is not a `<tr>` is thrown out
 * by the parser's table rules.  So its ATTRIBUTE is renamed instead.
 *
 * Renaming the attribute in place is not enough.  `is` is also recorded in an internal slot on
 * the element, which removeAttribute() cannot clear and cloneNode() copies, so a placeholder
 * that was parsed with `is` stays a customized built-in as far as the browser is concerned.
 * Every clone of it is upgraded the moment it enters a document with a browsing context —
 * running the component's constructor on the placeholder, before PathToComponent has
 * instantiated the real element or evaluated the attribute expressions meant for it.  A
 * constructor that renders then renders the placeholder, whose children are the ones the user
 * declared, and those get handed to the real instance as if they were slot content.
 *
 * Building a fresh element and moving everything across is the only way to drop that slot.
 * It happens once per unique template, because Shells are cached, and never per render.
 *
 * @param docFrag {DocumentFragment} */
function renameIsAttribs(docFrag) {
	for (let el of docFrag.querySelectorAll('[is]')) {
		let clean = el.ownerDocument.createElement(el.tagName);
		for (let attrib of el.attributes)
			clean.setAttribute(attrib.name === 'is' ? '_is' : attrib.name, attrib.value);
		clean.append(...el.childNodes);
		el.replaceWith(clean);
	}
}

// One-entry memo for Shell.get().
let lastHtmlStrings = null, lastSvgMode = false, lastShell = null;


// We increment the placeholder char as we go because nodes can't have the same attribute more than once.
const attribPlaceholder = 0xe000; // https://en.wikipedia.org/wiki/Private_Use_Areas  6400.


