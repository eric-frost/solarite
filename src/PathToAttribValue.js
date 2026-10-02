import Path from "./Path.js";
import Util from "./Util.js";
import delve, {isDelvePath} from "./delve.js";
import assert from "./assert.js";
import {SelectorRef} from "./Selector.js";
import Globals from "./Globals.js";

export default class PathToAttribValue extends Path {

	/** @type {?string} Used only if type=AttribType.Value. */
	attribName;

	/**
	 * @type {?string[]} Used only if type=AttribType.Value. If null, use one expr to set the whole attribute value. */
	attrValue;

	// isComponentAttrib and isHtmlProperty are declared on the Path base class.

	constructor(nodeBefore, nodeMarker, attribName=null, attrValue=null) {
		super(null, nodeMarker);
		this.attribName = attribName;
		this.attrValue = attrValue;
	}

	/**
	 * Set the value of an attribute.  This can be for any attribute, not just attributes named "value".
	 * @param exprs {Expr[]} */
	applyAll(exprs) {
		//#IFDEBUG
		assert(Array.isArray(exprs));
		//#ENDIF

		// Multiple expressions in one attribute value, e.g. class="a ${b} c ${d}"
		if (this.attrValue) {
			let node = this.nodeMarker;
			let joinedValue = this.getValue(exprs);
			let isProp = this.isHtmlProperty;

			// Only update attributes if the value has changed.
			// This is needed for setting input.value, .checked, option.selected, etc.
			let oldVal = isProp
				? node[this.attribName]
				: node.getAttribute(this.attribName);
			if (oldVal !== joinedValue) {
				if (isProp)
					node[this.attribName] = joinedValue;
				else if (this.attribName === 'value' && node.hasAttribute('contenteditable'))
					node.innerHTML = joinedValue;
				node.setAttribute(this.attribName, joinedValue);
			}
		}
		else
			this.applySingle(exprs[0]);
	}

	/**
	 * Set the attribute from a single expression that makes up its whole value.
	 * @param expr {Expr} */
	applySingle(expr) {
		// One expression surrounded by strings, e.g. class="a ${b} c".  Join through apply().
		if (this.attrValue)
			return this.applyAll([expr]);

		let node = this.nodeMarker;

		// Two-way binding between attributes
		// Passing a path to the value attribute.
		// Copies the attribute to the property when the input event fires.
		// value=${[this, 'value]'}
		// checked=${[this, 'isAgree']}
		// This same logic is in NodeGroup.instantiateComponent() for components.
		if (isDelvePath(expr)) {

			// Don't bind events to component placeholders.
			// PathToComponent will do the binding later when it instantiates the component.
			if (this.isComponentAttrib && node.tagName.endsWith('-SOLARITE-PLACEHOLDER'))
				return;

			/** @type {[Object, string[]]} */
			let [obj, path] = [expr[0], expr.slice(1)];

			if (!obj)
				throw new Error(`Solarite cannot bind ${this.attribName} to ${obj}.`);

			let value = delve(obj, path);

			// Special case to allow setting select-multiple value from an array
			if (this.attribName === 'value' && node.type === 'select-multiple' && Array.isArray(value)) {
				// Set the .selected property on the options having a value within value.
				let strValues = value.map(v => v + '');
				for (let option of node.options)
					option.selected = strValues.includes(option.value)
			}

			// Radio group: this radio is checked when its value matches the bound model value.
			else if (node.type === 'radio')
				node.checked = node.value === (value + '');

			else {
				// TODO: should we remove isFalsy, since these are always props?
				const strValue = Util.isFalsy(value) ? '' : value;

				// Special case for contenteditable
				if (this.attribName === 'value' && node.hasAttribute('contenteditable')) {
					const existingValue = node.innerHTML;
					if (strValue !== existingValue)
						node.innerHTML = strValue;
				}
				else {

					// If we don't have this condition, when we call render(), the browser will scroll to the currently
					// selected item in a <select> and mess up manually scrolling to a different value.
					if (strValue !== node[this.attribName])
						node[this.attribName] = strValue;
				}
			}

			// TODO: We need to remove any old listeners, like in bindEventAttribute.
			// Does bindEvent() now handle that?
			let func = () => {
				let value = (this.attribName === 'value' || node.type === 'radio')
					? Util.getInputValue(node)
					: node[this.attribName];
				delve(obj, path, value);
			}

			// We use capture so we update the values before other events added by the user.
			// TODO: Bind to scroll events also?
			// What about resize events and width/height?
			this.bindEvent(node, this.parentNg.getRootEl(), this.attribName, 'input', func, null, true);
		}

		// Regular attribute
		else {
			// A selection binding (h.selector().when()) writes its own value and tells the
			// selector which list this row belongs to, so a later change of selection reaches
			// the attribute directly instead of going back through render().  The typeof test
			// keeps ordinary string attributes — nearly all of them — from paying for the
			// prototype check.
			if (typeof expr === 'object' && expr instanceof SelectorRef) {
				if (!this.isComponentAttrib)
					expr.bind(node, this.attribName, this.parentNg);
				return;
			}

			// Cache this on Path.isHtmlProperty when Shell creates the props.
			// Have Path.clone() copy .isHtmlProperty?
			let isProp = this.isHtmlProperty;

			if (typeof expr === 'function') {
				if (this.isComponentAttrib)
					return;
				expr = expr();
			}
			else
				expr = Util.makePrimitive(expr);

			// Values that remove an attribute.  The empty string is included so that an attribute
			// disappears whenever its expression is empty, instead of only when it happened to be
			// absent already.  makePrimitive() above turns null into '', so plain null lands here
			// too; the explicit null test still matters for a function expression returning null,
			// which skips makePrimitive.
			// An html property is exempt: on those, '' is a real value meaning "empty", as when
			// clearing an <input>, so it belongs on the assignment path below.
			if (expr === undefined || expr === false || expr === null || (expr === '' && !isProp)) {
				if (isProp) {
					// Clear the property with a value of its own type.  Assigning false to a string
					// property such as input.value would put the text "false" in the field.
					let old = node[this.attribName];
					node[this.attribName] = typeof old === 'boolean' ? false : '';
				}
				node.removeAttribute(this.attribName);
			}
			else if (expr === true) {
				if (isProp)
					node[this.attribName] = true;
				node.setAttribute(this.attribName, '');
			}

			// A non-toggled attribute
			else {
				// Only update attributes if the value has changed.
				// This is needed for setting input.value, .checked, option.selected, etc.
				// Non-property attributes never reach here with '', since that removes above.
				let oldVal = isProp
					? node[this.attribName]
					: node.getAttribute(this.attribName) ?? '';
				if (oldVal !== expr) {

					// <textarea value=${expr}></textarea>
					// Without this branch we have no way to set the value of a textarea,
					// since we also prohibit expressions that are a child of textarea.
					if (isProp)
						node[this.attribName] = expr;

						// Allow one-way binding to contenteditable value attribute.
						// Contenteditables normally don't have a value attribute and have their content set via innerHTML.
					// Solarite doesn't allow contenteditables to have expressions as their children.
					else if (this.attribName === 'value' && node.hasAttribute('contenteditable')) {
						node.innerHTML = expr;
					}

					// TODO: Putting an 'else' here would be more performant
					node.setAttribute(this.attribName, expr);
				}
			}
		}
	}


	getExpressionCount() { return this.attrValue ? this.attrValue.length-1 : 1 }

	/**
	 * @param exprs {Expr|Expr[]} // TODO: Why is this sometimes not an array?
	 * @return {string} The joined values of the expressions, or the first expression if there are no strings. */
	getValue(exprs) {

		//#IFDEBUG
		assert(Array.isArray(exprs));
		//#ENDIF
		//if (!Array.isArray(exprs))
		//	return exprs;

		if (!this.attrValue) {// If it's not multiple paths inside a single attribute, return first (and only) expression.
			//#IFDEBUG
			assert(exprs.length === 1);
			//#ENDIF
			return exprs[0];
		}

		let result = [];
		let values = this.attrValue;
		for (let i = 0; i < values.length; i++) {
			result.push(values[i]);
			if (i < values.length - 1) {
				// A selection binding has to own the whole attribute, because its whole point is
				// writing that attribute without re-rendering, which it can't do if the rest of
				// the value comes from expressions it doesn't know about.  Whether a selector sits
				// inside a multi-part attribute is fixed by the shape of the template and never by
				// the data, so this can only be an authoring mistake, and it always surfaces on the
				// template's very first render -- exactly like the placement check in
				// SelectorRef.bind().  Like that check it ships in the built file: without it
				// makePrimitive() turns the ref into '' and the attribute is silently written
				// from its constant parts alone.
				if (typeof exprs[i] === 'object' && exprs[i] instanceof SelectorRef)
					throw new Error(`Solarite: a selector must own the whole ${this.attribName} attribute.`);
				let val = Util.makePrimitive(exprs[i]);
				if (!Util.isFalsy(val))
					result.push(val);
			}
		}
		return result.join('')
	}

	/**
	 * Call function when eventName is triggered on node.
	 * @param node {HTMLElement}
	 * @param root {HTMLElement}
	 * @param key {string}
	 * @param eventName {string}
	 * @param func {function}
	 * @param funcAndArgs {?Array} The [func, ...args] array from the template, or null if func stands alone.
	 * @param capture {boolean} */
	bindEvent(node, root, key, eventName, func, funcAndArgs, capture=false) {
		//#IFDEBUG
		// Both callers already guarantee a function, so this only catches a future third caller.
		// PathToEvent.applySingle() rejects every shape a template can produce and names the
		// offending value, and the two-way binding path above passes a closure it just made
		// here, so nothing a page author writes can reach this line.  That makes it dev-only:
		// stripping it from the built file costs no diagnostic that the surviving throw in
		// PathToEvent doesn't already give, with a better message.
		if (typeof func !== 'function')
			throw new Error(`Solarite cannot bind to <${node.tagName.toLowerCase()} ${this.attribName}=\${${func}}> because it's not a function.`);
		//#ENDIF

		// Delegated path: a bubbling event (when the root's options allow it, the default)
		// stores its handler directly on the node as a per-event-type Symbol expando, with no
		// EventBinding object and no addEventListener call.  When an event of that type
		// starts, the dispatcher (see createDispatcher) attaches a real listener to each node
		// on its path that carries the expando, so the browser runs the handler at the node's
		// own turn.
		// Re-renders just overwrite the property.  this.delegatedKey is set by the PathToEvent
		// constructor only for delegatable event names, so this test also excludes
		// non-bubbling events and native:on* bindings.
		if (capture === false && this.delegatedKey !== undefined) {
			let opt = this.parentNg.rootNg.renderOptions?.eventDelegation ?? true;
			// true delegates everything, an array only the events it names, and any other
			// value (such as the retired 'document' string) counts as true.
			if (opt !== false && (!Array.isArray(opt) || opt.includes(eventName))) {
				let dk = this.delegatedKey;

				// An anchored row keeps its handlers in its template (see isAnchored), so there is
				// nothing to store: the dispatcher reads the template when the handler's turn comes.
				if (isAnchored(this.parentNg))
					return;
				if (node[dk] === undefined) // First binding of this type on this node.
					ensureDelegatedDispatcher(root, eventName);
				// Array-form bindings (onclick=${[fn, arg]}, the hot per-row case) store the
				// template's own [func, ...args] array; a plain function is stored bare.
				// Either way, nothing is allocated.
				node[dk] = funcAndArgs || func;
				node[delegatedRootKey] = root;
				return;
			}
		}

		// Direct path: capture bindings, non-bubbling events, and eventDelegation:false.
		// Store the callable as a single [func, ...args] array.
		let args = funcAndArgs || [func];

		// One stable EventBinding object per node+key is registered with addEventListener
		// and dispatches to the current args.  This way, assigning a new function
		// (e.g. a fresh arrow function on each render) never needs add/removeEventListener.
		// Most nodes have one binding, stored directly; a second key upgrades to a map.
		let nodeEvents = node[eventBindingsKey];
		if (nodeEvents === undefined) {
			let b = node[eventBindingsKey] = new EventBinding(root, node, key, args);
			node.addEventListener(eventName, b, capture);
			return;
		}

		let binding;

		// The node already has a single EventBinding stored directly at node[eventBindingsKey].
		// If it's for this same key (e.g. 'click' rebound on re-render), just update it below.
		// Otherwise this is the node's second event key, so upgrade the slot to a
		// {key: EventBinding} map holding both.  Nodes with one handler (the common case)
		// never pay for that map object.
		if (nodeEvents instanceof EventBinding) {
			if (nodeEvents.key === key)
				binding = nodeEvents;
			else {
				let map = node[eventBindingsKey] = {};
				map[nodeEvents.key] = nodeEvents;
				binding = map[key] = new EventBinding(root, node, key, args);
				node.addEventListener(eventName, binding, capture);
				return;
			}
		}
		else {
			binding = nodeEvents[key];
			if (!binding) {
				binding = nodeEvents[key] = new EventBinding(root, node, key, args);
				node.addEventListener(eventName, binding, capture);
				return;
			}
		}
		binding.rootEl = root;
		binding.args = args;
	}
}

const eventBindingsKey = Symbol('solariteEvents');

/**
 * Get the EventBinding registered for a node+key, or undefined.
 * Lets a component invoke its own two-way binding (e.g. flush a bound value before
 * dispatching a change event) without exposing the private storage Symbol.
 * @param node {Node}
 * @param key {string}
 * @return {EventBinding|undefined} */
export function getEventBinding(node, key) {
	let b = node[eventBindingsKey];
	if (b === undefined)
		return undefined;
	return b instanceof EventBinding ? (b.key === key ? b : undefined) : b[key];
}

// Bubbling events the just-in-time dispatcher handles.  Same set Solid.js delegates.
const delegatableEvents = new Set(['beforeinput', 'click', 'contextmenu', 'dblclick', 'focusin', 'focusout',
	'input', 'keydown', 'keyup', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup',
	'pointerdown', 'pointermove', 'pointerout', 'pointerover', 'pointerup', 'touchend', 'touchmove', 'touchstart']);

// One Symbol per delegated event type; nodes store their delegated handler under it.
// Symbols (vs string expandos like Solid's $$click) can't collide with user properties.
const delegatedKeys = {};

/**
 * Get the per-event-type Symbol key, or undefined for non-delegatable events.
 * Called once per PathToEvent construction, never per bind.
 * @param eventName {string}
 * @return {symbol|undefined} */
export function delegatedKeyFor(eventName) {
	if (!delegatableEvents.has(eventName))
		return undefined;
	return delegatedKeys[eventName] ??= Symbol('sol$' + eventName);
}

// The component root a node's delegated handlers run with as `this`.
const delegatedRootKey = Symbol('solariteDelegatedRoot');

// A list row's root element points back at its NodeGroup under this key, which is how the
// dispatcher finds the row's handlers.  See isAnchored().
export const rowNgKey = Symbol('solariteRow');

// The Shell whose delegated dispatchers a root last registered, kept on the RootNodeGroup so
// that a run of rows checks one field instead of asking at every bound node.  A Symbol rather
// than a declared field, since only root NodeGroups ever carry it and a declared field would
// cost a slot on every row.
export const stampedShellKey = Symbol('solariteStampedShell');

/**
 * Is this NodeGroup a row whose delegated handlers the dispatcher reads from its template?
 *
 * The rows of a list are where event binding cost adds up: a row is cloned once and its
 * handlers are written once, and a thousand-row list does that a thousand times.  Storing a
 * handler on the node it belongs to means reaching that node in the fresh clone, which creates
 * a JS wrapper for it, and then adding a property to that wrapper.  Both are paid for again when
 * the row is torn down.  So a row made by the compiled stamp program stores nothing on its
 * nodes: its handlers stay in its Template, whose expressions the stamp program already keeps
 * for its re-render comparisons, and the row's root element carries one pointer back to the
 * NodeGroup (rowNgKey).  When an event starts, the dispatcher sees that pointer on the row's
 * root as it walks the event's path, looks up which of the row's nodes bind that event type
 * (Shell.stampEventsByType), and attaches the trampoline to those that are on the path; the
 * trampoline reads the handler from the template when its turn comes, so a row re-rendered in
 * the middle of a dispatch runs its current handler.  The pointer costs almost nothing: the
 * root element's wrapper exists already, since cloneNode() returned it.
 *
 * A row qualifies when it came from a stampable shell that binds at least one delegatable
 * event (so stampEventsByType is set), it belongs to a list (parentPath), and its root delegates
 * every event; an event-name array in the render options means the general binding path
 * decides event by event, and that path stores on nodes.
 * @param ng {NodeGroup}
 * @return {boolean} */
export function isAnchored(ng) {
	return ng.parentPath !== null && ng.shell.stampEventsByType !== null && ng.rootNg.delegateAll === true;
}

/**
 * Make sure the dispatchers for a row shell's event types are registered on its root and
 * document.  The NodeGroup constructor makes a fresh row findable by the dispatcher itself, by
 * writing the row under rowNgKey on its root element, and calls this only when the root last
 * registered a different shell, so a run of rows from one template asks once.
 * @param rootNg {RootNodeGroup}
 * @param shell {Shell} */
export function registerRowDispatchers(rootNg, shell) {
	let names = shell.stampEventNames, root = rootNg.rootEl;
	for (let k=0; k<names.length; k++)
		ensureDelegatedDispatcher(root, names[k]);
	rootNg[stampedShellKey] = shell;
}

// Set of event types that already have the dispatcher registered, kept on each root element
// and on each document.
const delegatedTypesKey = Symbol('solariteDelegatedTypes');

/**
 * Register the just-in-time dispatcher for eventName on root and on root's document, once
 * each.  Shared by bindEvent()'s delegated branch and registerRowDispatchers().
 *
 * Both registrations are needed.  The document's listener is what still reaches a bound node
 * after another component re-parents it outside its root (a toolbar a dock parks in its own
 * chrome).  The root's listener is what reaches what the document cannot see: a component
 * that isn't in the document at all, nodes inside a closed shadow root, and a synthetic
 * event dispatched inside any shadow root without composed:true, which never leaves it.
 * @param root {HTMLElement|Document}
 * @param eventName {string} */
function ensureDelegatedDispatcher(root, eventName) {
	let types = root[delegatedTypesKey] ??= new Set();
	if (!types.has(eventName)) {
		types.add(eventName);
		let dispatcher = dispatchers[eventName] ??= createDispatcher(eventName);
		root.addEventListener(eventName, dispatcher, true);

		// The document registers the same way.  It has no document of its own, which ends this.
		let doc = root.ownerDocument;
		if (doc !== null)
			ensureDelegatedDispatcher(doc, eventName);
	}
}

/**
 * The capture-phase listener of each delegated event type, made by createDispatcher().
 * @type {Object<string, function(Event)>} */
const dispatchers = {};

// For an event a dispatcher has walked, the path that walk saw.  A dispatcher on a nested root
// further down finds its own element in that path and skips the walk.  A root inside a closed
// shadow root does not find itself, because composedPath() hides a closed tree from listeners
// outside it, and that is what makes it walk again.  The path also names the root or document
// whose dispatcher did the walk (its walker property), which is how a second dispatch of the
// same Event object is told from a nested root's turn in the first; see step 1 of the
// dispatcher.  A WeakMap rather than a property on the event: every event is a new object, so
// a property has to be added to each one, and reading one that isn't there yet searches the
// event's whole prototype chain.  Measured on the first click after a page has been idle, the
// WeakMap is the cheaper of the two by 5 to 10 microseconds per click, about a tenth of what
// the dispatcher costs altogether.
const walked = new WeakMap();

const hasOwn = Object.hasOwn;

/**
 * Build the dispatcher for one event type: the capture-phase listener ensureDelegatedDispatcher()
 * registers on every root and on the document.  It runs before the event reaches anything,
 * walks the event's path, and attaches a real bubble-phase listener (the trampoline) to each
 * node holding a delegated handler.  The browser then finishes the dispatch natively, so those
 * handlers interleave correctly with listeners anyone else registered, stopPropagation() works
 * in both directions, currentTarget is right, and the event needn't bubble.
 *
 * Everything one event type needs lives in this closure, so a dispatch looks nothing up by
 * the type's name: no event.type call, and no keyed reads of per-type tables apart from one
 * lookup per row Shell, which attachRow() remembers.  The page has been idle before a click,
 * so each thing a click's code touches for the first time is a cache miss, and the dispatcher
 * runs on every delegated event in the page.
 *
 * @param type {string}
 * @return {function(Event)} */
function createDispatcher(type) {
	let dk = delegatedKeys[type];
	let doc = Globals.doc;

	// The nodes carrying the trampoline, and for each one where its handler is read from when
	// its turn comes: an anchored row's node has the row's NodeGroup and the index of the
	// handler among its template's expressions, any other node has null and holds its handler
	// itself (under dk).  The arrays are reused from one event to the next.
	let nodes = [], rows = [], exprIdx = [], count = 0;

	// The events of this type being dispatched right now, outermost first: a handler can
	// dispatch another event of the same type before its own has finished.  Only events the
	// walk attached something for are listed.  lasts holds, for each, the outermost node its
	// walk attached the trampoline to, which is the last one the event can reach.
	let evs = [], lasts = [], depth = 0;

	// One-entry memo of the anchored-row lookup, since the rows of a list share one Shell.
	let memoShell = null, memoOps;

	/**
	 * Remove the trampolines.  Housekeeping only: one left in place is harmless, because the
	 * next dispatch of this type removes it before attaching its own, and the trampoline reads
	 * its handler fresh. */
	const sweep = () => {
		for (let i=0; i<count; i++) {
			nodes[i].removeEventListener(type, trampoline);
			nodes[i] = rows[i] = null;
		}
		count = 0;
	};

	/**
	 * Take the trampoline off a node for a walk that started inside another dispatch, so that
	 * the walk can add it again behind every listener the node has now (step 3 of the
	 * dispatcher).  A node that an event in progress is at right now keeps it: the browser is
	 * part-way through that node's listeners, and removing the trampoline takes it out of that
	 * pass, so the outer event would skip the node's handler.  That is what a listener someone
	 * added to the node with addEventListener does when it dispatches another event of this
	 * type through the node, since it runs before the trampoline.  Adding the trampoline again
	 * then does nothing, and the new event finds it in the place the outer event gave it.
	 * The unused slots of evs hold null, and an event that is over has no currentTarget.
	 * @param node {Element} */
	const detach = node => {
		if (!evs.some(ev => ev?.currentTarget === node))
			node.removeEventListener(type, trampoline);
	};

	/**
	 * Take the dispatches that are over off the top of the stack.  A dispatch is still on
	 * record after it is over when it never reached its last node: propagation was stopped, or
	 * the event doesn't bubble.  An event's phase is 0 once it is over.
	 * @return {int} The depth that is left, which counts the dispatches still in progress. */
	const unwind = () => {
		while (depth !== 0 && evs[depth - 1].eventPhase === 0)
			evs[--depth] = lasts[depth] = null;
		return depth;
	};

	/**
	 * The shared bubble-phase listener, attached to a node only for the duration of one event.
	 * The browser invokes it at the node's own turn in propagation, and it reads the node's
	 * handler THEN rather than when it was attached, so a handler that an earlier listener in
	 * the same dispatch replaced or removed is honored.
	 *
	 * It also ends the dispatch.  The outermost node a walk attached to is the last one the
	 * event can reach, so when its turn comes nothing of ours is left to run, and the
	 * trampolines are removed once its handler returns or throws.  Ending here rather than
	 * from a listener on the document costs no extra listener call per event.  A timer would
	 * not do (it is a second task between the event and the frame it produces), and neither
	 * would a microtask (for a real click the browser runs a microtask checkpoint between
	 * listeners, so the trampolines would go before the event reached the first of them).
	 * An event that never reaches that node, because propagation was stopped or the event
	 * doesn't bubble, leaves its trampolines for the next dispatch of this type to remove, or
	 * for the event it was dispatched from, which removes them with its own when it ends. */
	function trampoline(ev) {
		let node = this;

		// 1. Find where this node's handler lives.  The innermost dispatch's nodes are last.
		let i = count - 1;
		while (i >= 0 && nodes[i] !== node)
			i--;
		if (i < 0) // Defensive: a node carries the trampoline only while it is listed here.
			return;
		let ng = rows[i], a, root;
		if (ng === null) {
			a = node[dk];
			root = node[delegatedRootKey];
		}
		else {
			a = ng.template.exprs[exprIdx[i]];
			root = ng.rootNg.rootEl;
		}

		// 2. End the dispatch if this is its last node.  The trampolines themselves are removed
		// after the handler has run (step 3), so that an event the handler dispatches on a row
		// it has just removed, which no dispatcher can see, still finds them, as it would find
		// listeners registered at render.
		//
		// This event is nearly always the innermost one on record.  When it isn't, dispatches
		// that its listeners started and that never reached their own last node may be lying on
		// top of it; unwind() takes those off and the test is made once more.  Left there they
		// would keep this event from ever being seen to end, and its trampolines and theirs
		// would stay until the next dispatch of this type.
		let ended = false;
		let d = depth - 1;
		if (d >= 0 && (evs[d] === ev || evs[d = unwind() - 1] === ev) && lasts[d] === node) {
			evs[d] = lasts[d] = null;
			depth = d;
			ended = d === 0;
		}

		// 3. Call the handler: a function, or a [function, ...args] array.  Anything else
		// cannot be reached through a template, which rejects a non-function at render; the
		// test only keeps a damaged row from throwing here.
		try {
			if (typeof a === 'function')
				a.call(root, ev, node);
			else if (Array.isArray(a) && typeof a[0] === 'function')
				switch (a.length) {
					case 1: a[0].call(root, ev, node); break;
					case 2: a[0].call(root, a[1], ev, node); break;
					case 3: a[0].call(root, a[1], a[2], ev, node); break;
					default: a[0].call(root, ...a.slice(1), ev, node);
				}
		}
		finally {
			if (ended)
				sweep();
		}
	}

	/**
	 * Attach the trampoline to the nodes of an anchored row that are on the event's path and
	 * bind this event type.  Nothing is written onto them: the trampoline reads each handler
	 * from the row's template.  See isAnchored() for why rows are handled this way.
	 * @param rowEl {HTMLElement} The row's root element, path[rowIndex].
	 * @param ng {NodeGroup} The row.
	 * @param path {EventTarget[]} ev.composedPath().
	 * @param rowIndex {int} Where the row's root sits in path; its other nodes sit before it.
	 * @param removeFirst {boolean} See the dispatcher.
	 * @return {int} The highest index in path a trampoline was attached at, or -1. */
	const attachRow = (rowEl, ng, path, rowIndex, removeFirst) => {
		let shell = ng.shell;
		if (shell !== memoShell) {
			memoShell = shell;
			memoOps = shell.stampEventsByType[type];
		}
		let ops = memoOps;
		if (ops === undefined)
			return -1;

		// Resolved nodes are kept on the row, so the next event on it skips the walk.  The
		// pairs are in ascending slot order, so one resolve up to the last covers them all.
		let last = ops[ops.length - 1];
		let slots = last > 1 ? ng.stampSlots(last) : null;
		let outer = -1;
		for (let k=0; k<ops.length; k+=2) {
			let s = ops[k+1];
			let target = s === 1 ? rowEl : slots[s];

			// Only a node the event passes through gets a listener: the row's other bound nodes
			// aren't involved in this event at all.
			let j = rowIndex;
			while (j >= 0 && path[j] !== target)
				j--;
			if (j < 0)
				continue;

			if (removeFirst)
				detach(target);
			target.addEventListener(type, trampoline);
			nodes[count] = target;
			rows[count] = ng;
			exprIdx[count++] = ops[k];
			if (j > outer)
				outer = j;
		}
		return outer;
	};

	return function dispatcher(ev) {

		// 1. Skip the walk when a dispatcher that could see this element has walked the event
		// already.  The dispatcher that did that walk never skips: it is the first of these
		// listeners the event reaches, so finding the event on record means the same Event
		// object is being dispatched again, which needs a new walk.  The others skip only while
		// the target is the one that walk saw.
		let seen = walked.get(ev);
		if (seen !== undefined && seen.walker !== this && seen.includes(this) && seen[0] === ev.target)
			return;
		let path = ev.composedPath();
		path.walker = this;
		walked.set(ev, path);

		// 2. Dispatches of this type that are over but never reached their last node
		// (propagation stopped, or an event that doesn't bubble) come off the stack now.  If
		// nothing of this type is still in progress their trampolines are removed before this
		// event's are attached.  A dispatch a handler started this one from is still in
		// progress and is left alone.
		let d = depth;
		if (d !== 0)
			d = unwind();
		// Trampolines can also be left with no dispatch on record, when a walk threw part-way,
		// so anything still attached while nothing is in progress is removed here too.
		if (d === 0 && count !== 0)
			sweep();

		// 3. Walk the path.  A node already carrying the trampoline, for a dispatch this one
		// was started from, has it removed first: left alone it would keep its old place in
		// the node's listener list, ahead of listeners added since, and removing and re-adding
		// puts it last.  So the rule holds: a delegated handler runs after every listener its
		// element had when the event started.  The one exception is the node an outer event is
		// at while this one starts, which detach() leaves alone; there the handler runs after
		// every listener the node had when the outer event started.  Nothing carries a
		// trampoline when no dispatch is in progress, which spares the usual event the remove.
		//
		// hasOwn() rather than a read: a read that finds nothing on the node goes on to search
		// every prototype behind it, and the path holds a different kind of element at nearly
		// every step, so each of those searches is a fresh one.  Handlers are only ever stored
		// on elements, so the walk stops at the document.
		let removeFirst = d !== 0;
		let outer = -1;
		for (let i=0; i<path.length; i++) {
			let node = path[i];
			if (node === doc)
				break;
			if (hasOwn(node, dk)) {
				if (removeFirst)
					detach(node);
				node.addEventListener(type, trampoline);
				nodes[count] = node;
				rows[count++] = null;
				outer = i;
			}
			// The root of an anchored list row: its handlers are read from the row's template.
			if (hasOwn(node, rowNgKey)) {
				let j = attachRow(node, node[rowNgKey], path, i, removeFirst);
				if (j > outer)
					outer = j;
			}
		}

		// 4. Remember the event as in progress, with the node that ends it.  A second walk of
		// the same event (a root inside a closed shadow root) updates its entry.
		if (outer >= 0) {
			let k = -1;
			if (seen !== undefined) {
				k = d - 1;
				while (k >= 0 && evs[k] !== ev)
					k--;
			}
			if (k < 0) {
				k = depth++;
				evs[k] = ev;
			}
			lasts[k] = path[outer];
		}
	};
}

class EventBinding {
	constructor(root, node, key, args) {
		this.rootEl = root;
		this.node = node;
		this.key = key;

		/** @type {Array} [func, ...args]; always at least [func]. */
		this.args = args;
	}

	// Called by the browser via the addEventListener(name, object) form.
	// Sets the "this" variable to be the current Solarite component.
	// Quoted so the minifier's property mangling doesn't rename it, since the browser looks it up by name.
	'handleEvent'(event) {
		let a = this.args;
		switch (a.length) {
			case 1: return a[0].call(this.rootEl, event, this.node);
			case 2: return a[0].call(this.rootEl, a[1], event, this.node);
			case 3: return a[0].call(this.rootEl, a[1], a[2], event, this.node);
		}
		return a[0].call(this.rootEl, ...a.slice(1), event, this.node);
	}
}