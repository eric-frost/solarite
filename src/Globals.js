var Globals;

/**
 * Created with a reset() function because it's useful for testing. */
function reset() {
	Globals = {

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
		 * @type {?{Constructor:Function, nodes:Node[]}} */
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
		 * Get the RootNodeGroup for an element.
		 * @type {WeakMap<HTMLElement, RootNodeGroup>} */
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
		 * Map from array of Html strings to the Shells created from them, one per parse mode.
		 * @type {WeakMap<string[], {html?:Shell, svg?:Shell}>} */
		shells: new WeakMap(),

		reset
	};
}
reset();

export default Globals;