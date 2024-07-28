var Globals = {

	currentExprPath: [],

	/**
	 * Elements that are currently rendering via the r() function.
	 * @type {WeakSet<HTMLElement>} */
	rendering: new WeakSet(),


	/**
	 * Each Element that has Expr children has an associated NodeGroupManager here.
	 * @type {WeakMap<HTMLElement, NodeGroupManager>} */
	nodeGroupManagers: new WeakMap()

};

export default Globals;