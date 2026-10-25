import Path from "./Path.js";
import Util from "./Util.js";
import delve, {isDelvePath} from "./delve.js";
import assert from "./assert.js";
import PathToAttribValue from "./PathToAttribValue.js";
import PathToKey from "./PathToKey.js";
import PathToEvent from "./PathToEvent.js";
import Globals from "./Globals.js";
import {getObjectHash, getPlainHash} from "./Template.js";

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
			// Event attributes like onchange=${...} are bound with addEventListener when the
			// PathToEvent itself is applied.  They must not also become constructor fields:
			// a component that assigns its fields onto itself would set the native on*
			// property, making the handler fire a second time with only the (event) argument
			// instead of Solarite's documented (event, element) signature.
			if (attribPath instanceof PathToEvent)
				continue;

			// The whole expression, or the joined text of an attribute with several parts.
			let value = attribPath.getValue(exprs[i]);
			if (attribPath instanceof PathToAttribValue) {

				// Resolve a two-way binding path before we pass it to the component.  Joined
				// text is a string, which is never one.
				if (isDelvePath(value))
					value = delve(value[0], value.slice(1));
				attribs[Util.dashesToCamel(attribPath.attribName)] = value;
			}
			else { // PathToAttribs: an object of attributes, or a string of them.
				if (typeof value === 'string')
					value = Util.splitAttribs(value);
				if (typeof value === 'object')
					for (let name in value)
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
							// Skip if a newer render already instantiated or replaced the placeholder.
							if (this.nodeMarker === el && el.tagName.endsWith('-SOLARITE-PLACEHOLDER'))
								this.applyAll(deferred);
						});
					}
					this.deferredExprs = exprs;
					return;
				}

				// Hand the children declared inside the component's tag to the RootNodeGroup that
				// its render() is about to create.  There is no other channel: the children have
				// to be parked before new Constructor(), because a Solarite constructor may call
				// this.render() itself, and the element that would otherwise carry them does not
				// exist yet.
				Globals.currentSlotChildren = {Constructor, nodes: [...el.childNodes]};
				let newEl = new Constructor(attribs);

				// 2b. Copy attributes over.
				if (isAttrib) {
					newEl.setAttribute('is', isAttrib);
				//	el.removeAttribute('_is');
				}
				for (let attrib of el.attributes)
					if (attrib.name !== '_is')
						newEl.setAttribute(attrib.name, attrib.value);

				// Set dynamic attributes if they are primitive types.
				for (let name in attribs) {
					let val = attribs[name];
					let valType = typeof val;
					// Only true and false can reach here, so the undefined/null halves of the
					// falsy test this used to spell out could never have decided anything.
					if (valType === 'boolean') {
						if (val)
							newEl.setAttribute(name, '');
					}

					// If type is a non-boolean primitive, set the attribute value.
					else if (valType==='string' || valType === 'number' || valType==='bigint')
						newEl.setAttribute(name, val);
				}


				// 2c. If an id pointed at the placeholder, update it to point to the new element.
				let id = newEl.getAttribute('data-id') || newEl.getAttribute('id');
				if (id)
					delve(this.parentNg.getRootEl(), id.split(/\./g), newEl);

				// 2d. Update paths to use replaced element.
				let ng = this.parentNg;
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

				// 2f. Call render() if it wasn't called by the constructor.
				// This must happen before we add it to the DOM which can trigger connectedCallback() -> renderFirstTime()
				// Because that path renders it without the attribute expressions.
				if (typeof newEl.render === 'function' && !Globals.rendered.has(newEl))
					this.callRender(newEl, attribs, exprs);

				// 2g. Update attribute paths to use the new element and re-apply them.
				for (let i=0, attribPath; attribPath = this.attribPaths[i]; i++) {
					attribPath.parentNg = this.parentNg;
					attribPath.nodeMarker = newEl;
					attribPath.applyAll(exprs[i]);
				}

				// 2e. Swap it to the DOM.
				el.replaceWith(newEl);
			}

			// 2f. Render
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