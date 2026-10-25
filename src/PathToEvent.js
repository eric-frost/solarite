import assert from "./assert.js";
import PathToAttribValue, {delegatedKeys, isHandler} from "./PathToAttribValue.js";
import {nativeEventPrefix} from "./Util.js";

// TODO: Merge this into PathToAttribValue?
export default class PathToEvent extends PathToAttribValue {

	/** @type {string} The attribName without the "on" prefix. */
	eventName;

	/** @type {symbol|undefined} The property a node stores this event's delegated handler under
	 * (the rows of a list keep theirs in the row's template instead; see isAnchored() in
	 * PathToAttribValue.js).  Undefined for non-delegatable (non-bubbling) events and for
	 * native: bindings; bindEvent() then binds directly. */
	delegatedKey;

	/**
	 * `native:onclick` registers the handler with addEventListener when the template renders,
	 * so it keeps the place in its element's listener order that it was given at render,
	 * instead of being attached by the dispatcher when an event starts.  Such a binding leaves
	 * delegatedKey undefined.  That is the single switch both bindEvent() and the compiled
	 * stamp program test to choose the direct addEventListener path, so nothing else has to
	 * know about the prefix.
	 * @param nodeBefore {null} Unused; an attribute path has no nodes of its own.
	 * @param nodeMarker {HTMLElement}
	 * @param attribName {string} `onclick` or `native:onclick`.
	 * @param attrValue {?string[]} */
	constructor(nodeBefore, nodeMarker, attribName, attrValue) {
		super(null, nodeMarker, attribName, attrValue);
		this.skipIfSame = true;
		let name = attribName;
		let native = name.startsWith(nativeEventPrefix);
		if (native)
			name = name.slice(nativeEventPrefix.length);
		this.eventName = name.slice(2);
		this.delegatedKey = native ? undefined : delegatedKeys[this.eventName];
	}

	/**
	 * Handle attributes for event binding, such as:
	 * onclick=${(e, el) => this.doSomething(el, 'meow')}
	 * oninput=${[this.doSomething, 'meow']}
	 *
	 * applyAll() is inherited: it joins a multi-part value, and otherwise comes here.
	 * @param expr {Expr} */
	applySingle(expr) {
		// Tested by Solarite.events.classicWithExpr
		// Expressions within a string attribute value that's not a Solarite event.  E.g.
		// <div onclick="alert(${1});"
		if (this.attrValue)
			return super.applyAll([expr]);

		// Don't bind events to component placeholders.
		// PathToComponent will do the binding later when it instantiates the component.
		if (this.isComponentAttrib && this.nodeMarker.tagName.endsWith('-SOLARITE-PLACEHOLDER'))
			return;

		let root = this.parentNg.rootNg.rootEl

		// The root is an element, or a DocumentFragment (11): the fragment or shadow root that
		// h(fragment)`...` rendered into, or the fragment a standalone template with several root
		// nodes is returned in.
		/*#IFDEBUG*/
		assert(root?.nodeType === 1 || root?.nodeType === 11);
		/*#ENDIF*/

		if (!isHandler(expr))
			throw new Error(`Solarite: ${this.attribName}=\${...} is not a function.`);

		// The template's value is handed over as it is, a function or a [func, ...args] array
		// (oninput=${[this.doSomething, 'meow']}), so nothing is allocated here.
		let eventName = this.eventName;
		this.bindEvent(this.nodeMarker, root, eventName, eventName, expr);
	}
}