var Globals;

/**
 * Created with a reset() function because it's useful for testing. */
function reset() {
	Globals = {

		/**
		 * Used by NodeGroup.applyComponentExprs() */
		componentArgsHash: new WeakMap(),

		/**
		 * Store which instances of Solarite have already been added to the DOM.
		 * @type {WeakSet<HTMLElement>} */
		connected: new WeakSet(),

		div: document.createElement("div"),

		/**
		 * Elements that have been rendered to by r() at least once.
		 * This is used by the Solarite class to know when to call onFirstConnect()
		 * @type {WeakSet<HTMLElement>} */
		rendered: new WeakSet(),

		/**
		 * ExprPath.applyExactNodes() sets this property when an expression is being accessed.
		 * watch3() then adds the ExprPath to rootNg.watchedExprPaths so we know which expressions use which fields.
		 * @type {ExprPath}*/
		currentExprPath: null,

		/**
		 * @type {Object<string, Class<Node>>} A map from built-in tag names to the constructors that create them. */
		elementClasses: {},

		/**
		 * Used by ExprPath.applyEventAttrib()
		 * @type {WeakMap<Node, Object<eventName:string, [original:function, bound:function, args:*[]]>>} */
		nodeEvents: new WeakMap(),

		/**
		 * Get the RootNodeGroup for an element.
		 * @type {WeakMap<HTMLElement, RootNodeGroup>} */
		nodeGroups: new WeakMap(),

		/**
		 * Used by r() path 9. */
		objToEl: new WeakMap(),

		//pendingChildren: [],

		/**
		 * Elements that are currently rendering via the r() function.
		 * @type {WeakSet<HTMLElement>} */
		rendering: new WeakSet(),

		/**
		 * Map from array of Html strings to a Shell created from them.
		 * @type {WeakMap<string[], Shell>} */
		shells: new WeakMap(),

		reset,
	};
}
reset();

export default Globals;