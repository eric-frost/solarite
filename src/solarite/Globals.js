var Globals = {

	/**
	 * Used by NodeGroup.applyComponentExprs() */
	componentHash: new WeakMap(),

	/**
	 * Store which instances of Solarite have already been added to the DOM.
	 * @type {WeakSet<HTMLElement>} */
	connected: new WeakSet(),

	/**
	 * Elements that have been rendered to by r() at least once.
	 * This is used by the Solarite class to know when to call onFirstConnect()
	 * @type {WeakSet<HTMLElement>} */
	rendered: new WeakSet(),

	currentExprPath: [],

	/**
	 * @type {Object<string, Class<Node>>} A map from built-in tag names to the constructors that create them. */
	elementClasses: {},

	/**
	 * Used by ExprPath.applyEventAttrib.
	 * TODO: Memory from this is never freed.  Use a WeakMap<Node, Object<eventName:string, function[]>> */
	nodeEvents: {},

	/**
	 * Used by r() path 9. */
	objToEl: new WeakMap(),

	pendingChildren: [],

	/**
	 * Elements that are currently rendering via the r() function.
	 * @type {WeakSet<HTMLElement>} */
	rendering: new WeakSet(),



	/**
	 * Get the root NodeGroup for an element.
	 * @type {WeakMap<HTMLElement, NodeGroup>} */
	nodeGroups: new WeakMap(),


	/**
	 * Each Element that has Expr children has an associated NodeGroupManager here.
	 * @type {WeakMap<HTMLElement, NodeGroupManager>} */
	nodeGroupManagers: new WeakMap(),

	/**
	 * Map from array of Html strings to a Shell created from them.
	 * @type {WeakMap<string[], Shell>} */
	shells: new WeakMap()

};

export default Globals;