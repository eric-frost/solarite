import Path from "./Path.js";
import Util from "./Util.js";
import delve, {isDelvePath} from "./delve.js";
import assert from "./assert.js";
import PathToKey from "./PathToKey.js";
import Globals from "./Globals.js";
import {getObjectHash, getPlainHash} from "./Template.js";
import {JsxAttr, styleToCss} from "./jsx.js";

export default class PathToComponent extends Path {

	/** @type {PathToAttribValue[]} Paths to dynamics attributes that will be set on the component.*/
	attribPaths;

	/** @type {string|undefined} Hash of the exprs the last time the component asked whether they changed.  Undefined
	 * when it has never asked, or rendered once without asking, so that the next answer is yes. */
	appliedExprsHash;

	/** @type {Expr[][]|null} The exprs of the render in progress, which hasChanged() compares.  Null between renders. */
	renderingExprs = null;

	/** @type {boolean|undefined} hasChanged()'s answer for the render in progress, once the component has asked. */
	changedAnswer;

	/** @type {boolean} Whether to try getPlainHash() first.  Turned off for good the first time these exprs need
	 * getObjectHash()'s replacer, since a component's arguments keep the same kind of data from one render to the next,
	 * and trying again would only walk the data for nothing.  Both give the same string, so the switch never makes the
	 * exprs look changed. */
	plainExprs = true;

	/**
	 * Passed to the component's render() as its second argument.  Whether the exprs differ from those of the last
	 * render that asked, compared deeply so that a field changed inside the same object counts.  Only a component that
	 * calls it pays for the comparison.  Called outside a render that this path started, it answers yes.
	 * @return {boolean} */
	hasChanged = () => {
		if (!this.renderingExprs)
			return true;
		if (this.changedAnswer === undefined) {
			let exprs = this.renderingExprs;
			let hash = this.plainExprs ? getPlainHash(exprs) : undefined;
			if (hash === undefined) {
				this.plainExprs = false;
				hash = getObjectHash(exprs);
			}
			this.changedAnswer = hash !== this.appliedExprsHash;
			this.appliedExprsHash = hash;
		}
		return this.changedAnswer;
	};

	constructor(nodeBefore, nodeMarker) {
		super(null, nodeMarker);
	}

	/**
	 * Call render() on the component pointed to by this Path.
	 * And instantiate it (from a -solarite-placeholder element) if it hasn't been done yet.
	 * @param exprs {Expr[][]} Expressions to evaluate for each attribute to pass to the constructor.
	 * This is different than other Path.applyAll() functions which only receive Expr[] and not Expr[][].
	 * Because here we're receiving an array of arrays of expressions, one for each dynamic attribute. */
	applyAll(exprs) {
		//#IFDEBUG
		assert(Array.isArray(exprs));
		assert(!exprs.length || Array.isArray(exprs[0]));
		//#ENDIF

		//#IFDEBUG
		assert(exprs.length === this.attribPaths.length);
		//#ENDIF

		let el = this.nodeMarker;

		// 1. Attributes
		let attribs = Util.attribsToObject(el, '_is');
		for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
			if (attribPath instanceof PathToKey) // The list key is never a component arg.
				continue;

			// The whole expression, or the joined text of an attribute with several parts.
			let value = attribPath.getValue(exprs[i]);
			let name = attribPath.attribName;

			// A precompiled JSX attribute, as in `<my-list items={rows}>`, is a name and a value
			// in one hole.  It is passed on as the attribute of that name in a tagged template
			// is, with a style object as the css text PathToAttribs writes.  Taken for an object
			// of attributes, it used to reach the component as two arguments called `name` and
			// `value`.
			if (value instanceof JsxAttr) {
				name = value.name;
				value = name === 'style' ? styleToCss(value.value) : value.value;
			}

			if (name) {
				// Event attributes like onchange=${...} are bound with addEventListener when the
				// PathToEvent itself is applied.  They must not also become constructor fields:
				// a component that assigns its fields onto itself would set the native on*
				// property, making the handler fire a second time with only the (event) argument
				// instead of Solarite's documented (event, element) signature.
				if (Util.isEvent(name))
					continue;

				// Resolve a two-way binding path before we pass it to the component.  Joined
				// text is a string, which is never one.
				if (isDelvePath(value))
					value = delve(value[0], value.slice(1));
				attribs[Util.dashesToCamel(name)] = value;
			}
			else { // PathToAttribs: an object of attributes, or a string of them.
				if (typeof value === 'string')
					value = Util.splitAttribs(value);
				if (typeof value === 'object')
					for (name in value)
						attribs[Util.dashesToCamel(name)] = value[name];
			}
		}

		// Constructing a component runs arbitrary user code -- field initializers, the
		// constructor body, render() -- and that code can build more components, re-entering
		// this method and overwriting the hand-off parked below.  Saving the caller's value
		// here and restoring it in the finally makes the JS call stack the stack this hand-off
		// needs, and unlike an explicit stack it cannot leak if construction throws.
		let prevSlotChildren = Globals.currentSlotChildren;
		try {
			// 2. Instantiate component on first time.
			let isAttrib = el.getAttribute('_is');
			if (el.tagName.endsWith('-SOLARITE-PLACEHOLDER') || isAttrib) {


				// 2a. Instantiate component
				let tagName = (isAttrib || el.tagName.slice(0, -21)).toLowerCase(); // Remove -SOLARITE-PLACEHOLDER
				let Constructor = customElements.get(tagName);

				// Not defined yet (e.g. the module is being lazily imported): keep the placeholder
				// and instantiate when the definition lands, like a native custom-element upgrade.
				// deferredExprs always holds the LATEST exprs so re-renders while undefined win,
				// and while it is set a wait is already under way.
				if (!Constructor) {
					if (!this.deferredExprs) {
						console.warn(`Solarite: <${tagName}> is not defined yet; waiting for customElements.define().`);
						customElements.whenDefined(tagName).then(() => {
							let deferred = this.deferredExprs;
							this.deferredExprs = null;
							// Skip if a newer render has built the component already: building it is
							// what points nodeMarker at the new element.  The placeholder's tag name
							// can't answer that, because it never changes, and the placeholder of a
							// customized built-in (<p is="my-p">) doesn't carry the suffix at all.
							// Skip too if the element was given another template in the meantime
							// (RootNodeGroup.unrender()), which leaves this one's root without its
							// entry: nobody sees the component, and its data-id would take the name
							// from an element of the template shown.
							let root = this.parentNg.rootNg;
							if (this.nodeMarker === el && Globals.rootNodeGroups.get(root.rootEl) === root) {
								this.applyAll(deferred);

								// The component is built here outside any render, so no list is
								// being drawn that would read its nodes again when it is done.
								// When the placeholder was a row of a list, or one of a row's
								// nodes, every list it stands in still names the placeholder
								// among its nodes.  Those lists are read from the DOM again.
								// And one that is inside an element that doesn't render through
								// Solarite has the placeholder among the nodes it looks for
								// before it draws (see PathToNodes.applyAll()), and would take
								// the component that now stands there for the element's doing.
								let ng = this.parentNg;
								ng.nodesCache = null;
								for (let path = ng.parentPath; path; path = path.parentNg.parentPath) {
									path.nodesCache = path.parentNg.nodesCache = null;
									let nodes = path.kept?.nodes, i = nodes ? nodes.indexOf(el) : -1;
									if (i >= 0)
										nodes[i] = this.nodeMarker;
								}
							}
						});
					}
					this.deferredExprs = exprs;
					return;
				}

				// Hand the children declared inside the component's tag to the RootNodeGroup that
				// its render() is about to create.  There is no other channel: the children have
				// to be parked before new Constructor(), because a Solarite constructor may call
				// this.render() itself, and the element that would otherwise carry them does not
				// exist yet.  The placeholder goes with them, so that such a render can tell which
				// attributes step 2b is about to write.
				let ng = this.parentNg;
				Globals.currentSlotChildren = {Constructor, nodes: [...el.childNodes], paths: ng.paths, el};
				let newEl = new Constructor(attribs);

				// 2b. Copy attributes over.  The placeholder holds everything the element should
				// start with: the attributes written in the template, and the values of the
				// dynamic ones, because NodeGroup.applyExprs() applies a component's attribute
				// paths before the component itself.  Nothing is written from attribs.  Its names
				// are camelCase and setAttribute() lowercases them, so `font-size` used to get a
				// twin named `fontsize` that no later render updated and that came back, stale,
				// as one more argument to every later render().
				if (isAttrib) {
					newEl.setAttribute('is', isAttrib);
				//	el.removeAttribute('_is');
				}
				for (let attrib of el.attributes)
					if (attrib.name !== '_is')
						newEl.setAttribute(attrib.name, attrib.value);

				// 2c. If an id pointed at the placeholder, update it to point to the new element.
				let id = newEl.getAttribute('data-id') || newEl.getAttribute('id');
				if (id)
					delve(this.parentNg.getRootEl(), id.split(/\./g), newEl);

				// 2d. Update paths to use replaced element.
				this.nodeMarker = newEl;
				for (let path of ng.paths) {
					if (path.nodeMarker === el)
						path.nodeMarker = newEl;
					if (path.nodeBefore === el)
						path.nodeBefore = newEl;
				}
				if (ng.startNode === el)
					ng.startNode = newEl;
				if (ng.endNode === el)
					ng.endNode = newEl;

				// 2e. Call render() if it wasn't called by the constructor.
				// This must happen before we add it to the DOM which can trigger connectedCallback() -> renderFirstTime()
				// Because that path renders it without the attribute expressions.
				if (typeof newEl.render === 'function' && !Globals.rendered.has(newEl))
					this.callRender(newEl, attribs, exprs);

				// 2f. Keep the children declared inside the tag when no render took them.  A
				// component that renders through h() has moved them out of the placeholder and
				// into its <slot> by now, and nothing is left here to move.  Any other element
				// leaves them behind: one from another library, one that fills a shadow root, one
				// whose first h() render comes later.  They belong inside it all the same, where
				// the browser would have put them had it parsed the tag, and they go in before
				// step 2g because a <select is="..."> can only take a value one of its options has.
				//
				// Such an element may move the children it was given, all together, into its
				// shadow root or a wrapper of its own, and Solarite goes on updating them there.
				// It must not take them apart.  So every expression written inside the tag, at
				// any depth, is told which element it is in and which nodes it drew, and looks
				// for them before it draws again; see PathToNodes.applyAll().  It is told before
				// the children are moved: a child taken out of the document by the move can run
				// code that renders the host, and that render reaches the element.
				//
				// The expressions are those of this template, and those of the template that
				// is constructing a Solarite component around this one, when this element holds
				// that component's <slot>: what the outer template drew for the slot is inside
				// this element too.  An expression that is inside a deeper such element already
				// stays with that one, which is the one it is written in.  One that is being
				// drawn at this moment, by a render this one started inside, reads its nodes
				// itself when that draw is done.
				//
				// One whose two markers enclose nothing that can be read is left as it is.  A
				// Solarite component inside this element has then put the node before the
				// expression in one of its slots and the node after it in another, so there
				// is no run of nodes to compare, and the expression is drawn as it is in that
				// component anywhere else.
				if (el.firstChild) {
					for (let path of ng.paths.concat(prevSlotChildren?.paths || [])) {
						let kept = path.kept;
						if (path.standing && el.contains(path.nodeMarker) && !el.contains(kept?.el)) {
							let drawn = kept && !kept.nodes, nodes = drawn ? null : path.standing();
							if (drawn || nodes)
								path.kept = {el: newEl, nodes};
						}
					}
					newEl.append(...el.childNodes);
				}

				// 2g. Update attribute paths to use the new element and re-apply them.
				for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
					attribPath.parentNg = this.parentNg;
					attribPath.nodeMarker = newEl;
					attribPath.applyAll(exprs[i]);
				}

				// 2h. Swap it to the DOM.
				el.replaceWith(newEl);

				// The placeholder may be the node a root's template ends with in its element or
				// in a slot, after which the nodes that are not the template's begin (see
				// RootNodeGroup.slotMarks).  The component now ends it.  A node has one parent,
				// so it is named there once at most.
				let marks = ng.slotMarks, i = marks?.indexOf(el);
				if (i > 0)
					marks[i] = newEl;
			}

			// 3. Render a component that exists already.
			else if (typeof el.render === 'function')
				this.callRender(el, attribs, exprs);

		}
		finally {
			Globals.currentSlotChildren = prevSlotChildren;
		}
	}

	/**
	 * Call the component's render() with its arguments and hasChanged().
	 * @param el {HTMLElement}
	 * @param attribs {Object}
	 * @param exprs {Expr[][]} */
	callRender(el, attribs, exprs) {
		// A component that renders this path's parent again from inside its own render() comes back through here, so
		// the outer render's state is saved and put back around the call.
		let prevExprs = this.renderingExprs, prevAnswer = this.changedAnswer;
		this.renderingExprs = exprs;
		this.changedAnswer = undefined;
		try {
			el.render(attribs, this.hasChanged);
		}
		finally {
			// The component rendered without asking, so there is nothing for the next answer to be compared against.
			if (this.changedAnswer === undefined)
				this.appliedExprsHash = undefined;
			this.renderingExprs = prevExprs;
			this.changedAnswer = prevAnswer;
		}
	}

	/**
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {Path} */
	clone(newRoot, pathOffset=0) {
		// A component path's nodeBefore is always null (the constructor discards it), so the
		// base clone() resolves only the nodeMarker and hands back a new PathToComponent.
		let result = super.clone(newRoot, pathOffset);
		result.attribPaths = this.attribPaths.map(path => path.clone(newRoot, pathOffset));
		return result;
	}

	getExpressionCount() { return 0 }

	//#IFDEBUG
	verify() {
		super.verify();
		assert(this.nodeMarker.nodeType === Node.ELEMENT_NODE);
		assert(this.nodeMarker.tagName.includes('-') || this.nodeMarker.hasAttribute('is') || this.nodeMarker.hasAttribute('_is'));
		if (this.attribPaths)
			for (let path of this.attribPaths)
				path.verify();
	}

	//#ENDIF
}