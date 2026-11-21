let Globals = {

	/**
	 * Store which instances of Solarite have already been added to the DOM.
	 * @type {WeakSet<HTMLElement>} */
	connected: new WeakSet(),

	/**
	 * A hand-off in flight from PathToComponent.applyAll(), which parks the child nodes
	 * declared inside a component's tag here just before constructing it, to that
	 * component's RootNodeGroup.instantiate(), which puts them in its <slot>.  Null when
	 * no hand-off is pending.
	 *
	 * It is addressed by Constructor rather than by tag name because a customized
	 * built-in has no usable tag at the moment it is consumed:  a <tr is="my-row">
	 * reports a tagName of TR, and its 'is' attribute is not written until after the
	 * constructor -- which may already have rendered -- has returned.
	 *
	 * It also carries the paths of the template the component is declared in, for an element
	 * inside the component that is given the component's <slot>; see PathToComponent step 2f.
	 * And the placeholder, whose attributes are the parent's; see RootNodeGroup.instantiate().
	 *
	 * @type {?{Constructor:Function, nodes:Node[], paths:Path[], el:HTMLElement}} */
	currentSlotChildren: null,

	div: document.createElement("div"),

	/** @type {HTMLDocument} The global document. */
	doc: document,

	/**
	 * @type {Record<string, Class<Node>>} A map from built-in tag names to the constructors that create them. */
	elementClasses: {},

	/** @type {Record<string, boolean>} Key is tag-name.propName.  Value is whether it's an attribute.*/
	htmlProps: {},

	/**
	 * Get the RootNodeGroup for an element.  An element whose template was taken out so
	 * that another can be rendered into it keeps its entry, holding null, until the new
	 * root is in place; see RootNodeGroup.unrender().
	 * @type {WeakMap<HTMLElement, ?RootNodeGroup>} */
	rootNodeGroups: new WeakMap(),

	/**
	 * Used by h() path 9. */
	objToEl: new WeakMap(),

	/**
	 * Elements that have been rendered to by h() at least once.
	 * This is used by the Solarite class to know when to call onFirstConnect()
	 * @type {WeakSet<HTMLElement>} */
	rendered: new WeakSet(),

	/**
	 * Components with a pending queueRender(), mapped to their pending Promise.
	 * Kept as a Map so Template.render() can check `.size` before doing a lookup.
	 * @type {Map<HTMLElement, Promise<void>>} */
	queuedRenders: new Map(),

	/**
	 * Map from array of Html strings to the Shells created from them, one per parse mode:
	 * [parsed as html, parsed as svg].
	 * @type {WeakMap<string[], Shell[]>} */
	shells: new WeakMap()
};

// Warn when a second copy of Solarite loads into the same page.  Each copy has its own classes and its own Globals,
// so a template or component made by one is not recognised by the other, and the failure that follows (a template
// rendered as "[object Object]", a slot that stays empty) gives no hint of the cause.  The usual ways to get two are
// importing both Solarite.js and Solarite.min.js, or a JSX runtime file that doesn't match the build being imported.
// The marker is the same for every build, so the source, debug, and minified builds all detect one another.
let copy = Symbol.for('solarite');
if (globalThis[copy])
	console.warn(`Solarite loaded twice: ${globalThis[copy]} and ${import.meta.url}.  Templates and components from one won't work in the other.`);
else
	globalThis[copy] = import.meta.url;

export default Globals;