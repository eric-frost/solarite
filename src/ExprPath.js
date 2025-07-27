import {assert} from "./assert.js";
import delve from "./delve.js";
import NodeGroup from "./NodeGroup.js";
import Util, {setIndent} from "./Util.js";
import Template from "./Template.js";
import Globals from "./Globals.js";
import MultiValueMap from "./MultiValueMap.js";
import udomdiff from "./udomdiff.js";
//import {ArraySpliceOp} from "./watch.js";
//#IFDEV
var exprPathId = 0;
//#ENDIF

/**
 * Path to where an expression should be evaluated within a Shell or NodeGroup.
 * Path is only valid until the expressions before it are evaluated.
 * TODO: Make this based on parent and node instead of path? */
export default class ExprPath {

	//#IFDEV
	eid = exprPathId++;
	//#ENDIF

	/**
	 * @type {ExprPathType} */
	type;

	// Used for attributes:

	/** @type {?string} Used only if type=AttribType.Value. */
	attrName;

	/**
	 * @type {?string[]} Used only if type=AttribType.Value. If null, use one expr to set the whole attribute value. */
	attrValue;

	/**
	 * @type {Set<string>} Used for type=AttribType.Multiple to remember the attributes that were added. */
	attrNames;

	/**
	 * @type {Node} Node that occurs before this ExprPath's first Node.
	 * This is necessary because udomdiff() can steal nodes from another ExprPath.
	 * If we had a pointer to our own startNode then that node could be moved somewhere else w/o us knowing it.
	 * Used only for type='content'
	 * Will be null if ExprPath has no Nodes. */
	nodeBefore;

	/**
	 * If type is AttribType.Multiple or AttribType.Value, points to the node having the attribute.
	 * If type is 'content', points to a node that never changes that this NodeGroup should always insert its nodes before.
	 *	 An empty text node will be created to insertBefore if there's no other NodeMarker and this isn't at the last position.
	 * @type {Node|HTMLElement} */
	nodeMarker;


	// These are set after an expression is assigned:

	/** @type {NodeGroup} */
	parentNg;

	/** @type {NodeGroup[]} */
	nodeGroups = [];


	// Caches to make things faster

	/**
	 * @private
	 * @type {Node[]} Cached result of getNodes() */
	nodesCache;

	/**
	 * @type {int} Index of nodeBefore among its parentNode's children. */
	nodeBeforeIndex;

	/**
	 * @type {int[]} Path to the node marker, in reverse for performance reasons. */
	nodeMarkerPath;


	/** @type {?function} A function called by renderWatched() to update the value of this expression. */
	watchFunction

	/**
	 * @type {?function} The most recent callback passed to a .map() function in this ExprPath.
	 * TODO: What if one ExprPath has two .map() calls?  Maybe we just won't support that. */
	mapCallback

	isHtmlProperty = undefined;

	/**
	 * @param nodeBefore {Node}
	 * @param nodeMarker {?Node}
	 * @param type {ExprPathType}
	 * @param attrName {?string}
	 * @param attrValue {string[]} */
	constructor(nodeBefore, nodeMarker, type=ExprPathType.Content, attrName=null, attrValue=null) {

		// If path is a node.
		this.nodeBefore = nodeBefore;
		this.nodeMarker = nodeMarker;
		this.type = type;
		this.attrName = attrName;
		this.attrValue = attrValue;
		if (type === ExprPathType.AttribMultiple)
			this.attrNames = new Set();
	}

	/**
	 * Apply any type of expression.
	 * This calls other apply functions.
	 *
	 * One very messy part of this function is that it may apply multiple expressions if they're all part
	 * of the same attribute value.
	 *
	 * We should modify path.applyValueAttrib so it stores the procssed parts and then only calls
	 * setAttribute() once all the pieces are in place.
	 *
	 * @param exprs {Expr[]}
	 * @param freeNodeGroups {boolean} */
	apply(exprs, freeNodeGroups=true) {
		switch (this.type) {
			case 1: // PathType.Content:
				this.applyNodes(exprs[0], freeNodeGroups);
				break;
			case 2: // PathType.Multiple:
				this.applyMultipleAttribs(this.nodeMarker, exprs[0]);
				break;
			case 5: // PathType.Comment:
				// Expressions inside Html comments.  Deliberately empty because we won't waste time updating them.
				break;
			case 6: // PathType.Event:
				this.applyEventAttrib(this.nodeMarker, exprs[0], this.parentNg.rootNg.root);
				break;
			default: // TODO: Is this still used?  Lots of tests fail without it.
				// One attribute value may have multiple expressions.  Here we apply them all at once.
				this.applyValueAttrib(this.nodeMarker, exprs);
				break;
		}
	}

	/**
	 * Insert/replace the nodes created by a single expression.
	 * Called by applyExprs()
	 * This function is recursive, as the functions it calls also call it.
	 * @param expr {Expr}
	 * @param freeNodeGroups {boolean}
	 * @return {Node[]} New Nodes created. */
	applyNodes(expr, freeNodeGroups=true) {
		let path = this;

		// This can be done at the beginning or the end of this function.
		// If at the end, we may get rendering done faster.
		// But when at the beginning, it leaves all the nodes in-use so we can do a renderWatched().
		if (freeNodeGroups)
			path.freeNodeGroups();

		/*#IFDEV*/path.verify();/*#ENDIF*/

		/** @type {(Node|NodeGroup|Expr)[]} */
		let newNodes = [];
		let oldNodeGroups = path.nodeGroups;
		/*#IFDEV*/assert(!oldNodeGroups.includes(null))/*#ENDIF*/
		let secondPass = []; // indices

		path.nodeGroups = []; // Reset before applyExactNodes and the code below rebuilds it.
		path.applyExactNodes(expr, newNodes, secondPass);

		//this.existingTextNodes = null;

		// TODO: Create an array of old vs Nodes and NodeGroups together.
		// If they're all the same, skip the next steps.
		// Or calculate it in the loop above as we go?  Have a path.lastNodeGroups property?

		// Second pass to find close-match NodeGroups.
		let flatten = false;
		if (secondPass.length) {
			for (let [nodesIndex, ngIndex] of secondPass) {
				let ng = path.getNodeGroup(newNodes[nodesIndex], false);

				let ngNodes = ng.getNodes();

				/*#IFDEV*/assert(!(newNodes[nodesIndex] instanceof NodeGroup))/*#ENDIF*/

				if (ngNodes.length === 1) // flatten manually so we can skip flattening below.
					newNodes[nodesIndex] = ngNodes[0];

				else {
					newNodes[nodesIndex] = ngNodes;
					flatten = true;
				}
				path.nodeGroups[ngIndex] = ng;
			}

			if (flatten)
				newNodes = newNodes.flat(); // Only if second pass happens.
		}

		/*#IFDEV*/assert(!path.nodeGroups.includes(null))/*#ENDIF*/



		let oldNodes = path.getNodes();


		// This pre-check makes it a few percent faster?
		let same = Util.arraySame(oldNodes, newNodes);
		if (!same) {

			path.nodesCache = newNodes; // Replaces value set by path.getNodes()

			if (this.parentNg.parentPath)
				this.parentNg.parentPath.clearNodesCache();

			// Fast clear method
			let isNowEmpty = oldNodes.length && !newNodes.length;
			if (!isNowEmpty || !path.fastClear())

				// Rearrange nodes.
				udomdiff(path.nodeMarker.parentNode, oldNodes, newNodes, path.nodeMarker)

			// TODO: Put this in a remove() function of NodeGroup.
			// Then only run it on the old nodeGroups that were actually removed.
			//Util.saveOrphans(oldNodeGroups, oldNodes);

			for (let ng of oldNodeGroups)
				if (!ng.startNode.parentNode)
					ng.removeAndSaveOrphans();

			// Instantiate components created within ${...} expressions.
			// Embedded style tags are handled elsewhere, but where?
			for (let el of newNodes) {
				if (el instanceof HTMLElement) {
					if (el.hasAttribute('solarite-placeholder'))
						this.parentNg.instantiateComponent(el);
					for (let child of el.querySelectorAll('[solarite-placeholder]'))
						this.parentNg.instantiateComponent(child);
				}
			}
		}


		/*#IFDEV*/path.verify();/*#ENDIF*/
	}

	/**
	 * Used by watch() for inserting/removing/replacing individual loop items.
	 * @param op {ArraySpliceOp} */
	applyArrayOp(op) {

		// Replace NodeGroups
		let replaceCount = Math.min(op.deleteCount, op.items.length);
		let deleteCount = op.deleteCount - replaceCount;
		for (let i=0; i<replaceCount; i++) {
			let oldNg = this.nodeGroups[op.index + i]; // TODO: One expr can create multiple nodegroups.

			// Try to find an exact match
			let func = this.mapCallback || this.watchFunction;
			let expr = func(op.items[i]);

			// If the result of func isn't a template, conver it to one or more templates.
			this.exprToTemplates(expr, template => { // TODO: An expr can create multiple NodeGroups.  I need a way to group them.

				let ng = this.getNodeGroup(template, true);  // Removes from nodeGroupsAttached and adds to nodeGroupsRendered()
				if (ng && ng === oldNg) {
					// It's an exact match, so replace nothing.
					// TODO: What if the found NodeGroup as at a differnet place?
				} else {

					// Find a close match or create a new node group
					if (!ng)
						ng = this.getNodeGroup(template, false); // adds back to nodeGroupsRendered()
					this.nodeGroups[op.index + i] = ng; // TODO: Remove old one to nodeGroupsDetached?

					// Splice in the new nodes.
					let insertBefore = oldNg.startNode;
					for (let node of ng.getNodes())
						insertBefore.parentNode.insertBefore(node, insertBefore);

					// Remove the old nodes.
					if (ng !== oldNg)
						oldNg.removeAndSaveOrphans();
				}
			});
		}

		// Delete extra at the end.
		if (deleteCount > 0) {
			for (let i=0; i<deleteCount; i++) {
				let oldNg = this.nodeGroups[op.index + replaceCount +  i];
				oldNg.removeAndSaveOrphans();
			}
			this.nodeGroups.splice(op.index + replaceCount, deleteCount);
		}

		// Add extra at the end.
		else {
			let newItems = op.items.slice(replaceCount);

			let insertBefore = this.nodeGroups[op.index + replaceCount]?.startNode || this.nodeMarker;
			for (let i = 0; i < newItems.length; i++) { // We use nodeMarker if the subequent (or all) nodeGroups have been removed.


				// Try to find exact match
				let template = this.mapCallback(newItems[i]);
				let ng = this.getNodeGroup(template, true);  // Removes from nodeGroupsAttached and adds to nodeGroupsRendered()
				if (!ng) 	// Find a close match or create a new node group
					ng = this.getNodeGroup(template, false); // adds back to nodeGroupsRendered()

				this.nodeGroups.push(ng);

				// Splice in the new nodes.
				for (let node of ng.getNodes())
					insertBefore.parentNode.insertBefore(node, insertBefore);
			}
		}

		//#IFDEV
		assert(this.nodeGroups.length === op.array.length);
		//#ENDIF

		// TODO: update or invalidate the nodes cache?
		this.nodesCache = null;
	}

	/**
	 * Recursively traverse expr.
	 * If a value is a function, evaluate it.
	 * If a value is an array, recurse on each item.
	 * If it's a primitive, convert it to a Template.
	 * Otherwise pass the item (which is now either a Template or a Node) to callback.
	 * @param expr
	 * @param callback {function(Node|Template)}
	 *
	 * TODO: have applyExactNodes() use this function. */
	exprToTemplates(expr, callback) {
		if (Array.isArray(expr))
			for (let subExpr of expr)
				this.exprToTemplates(subExpr, callback);

		else if (typeof expr === 'function') {
			// TODO: One ExprPath can have multiple expr functions.
			// But if using it as a watch, it should only have one at the top level.
			// So maybe this is ok.
			Globals.currentExprPath = this; // Used by watch()

			this.watchFunction = expr; // TODO: Only do this if it's a top level function.
			expr = expr(); // As expr accesses watched variables, watch() uses Globals.currentExprPath to mark where those watched variables are being used.
			Globals.currentExprPath = null;

			this.exprToTemplates(expr, callback);
		}

		// String/Number/Date/Boolean
		else if (!(expr instanceof Template) && !(expr instanceof Node)){
			// Convert expression to a string.
			if (expr === undefined || expr === false || expr === null) // Util.isFalsy() inlined
				expr = '';
			else if (typeof expr !== 'string')
				expr += '';

			// Get the same Template for the same string each time.
			// let template = Globals.stringTemplates[expr];
			// if (!template) {
				let template = new Template([expr], []);
			//	Globals.stringTemplates[expr] = template;
			//}

			// Recurse.
			this.exprToTemplates(template, callback);
		}
		else
			callback(expr);
	}


	/**
	 * Try to apply Nodes that are an exact match, by finding existing nodes from the last render
	 * that have the same value as created by the expr.
	 * This is called from ExprPath.applyNodes().
	 *
	 * @param expr {Template|Node|Array|function|*}
	 * @param newNodes {(Node|Template)[]} An inout parameter; we add the nodes here as we go.
	 * @param secondPass {[int, int][]} Locations within newNodes for ExprPath.applyNodes() to evaluate later,
	 *   when it tries to find partial matches. */
	applyExactNodes(expr, newNodes, secondPass) {

		if (expr instanceof Template) {
			let ng = this.getNodeGroup(expr, true);
			if (ng) {

				// TODO: Track ranges of changed nodes and only pass those to udomdiff?
				// But will that break the swap benchmark?
				newNodes.push(...ng.getNodes());
				this.nodeGroups.push(ng);
			}

			// If expression, mark it to be evaluated later in ExprPath.apply() to find partial match.
			else {
				secondPass.push([newNodes.length, this.nodeGroups.length])
				newNodes.push(expr)
				this.nodeGroups.push(null); // placeholder
			}
		}

		// Node(s) created by an expression.
		else if (expr instanceof Node) {

			// DocumentFragment created by an expression.
			if (expr instanceof DocumentFragment)
				newNodes.push(...expr.childNodes);
			else
				newNodes.push(expr);
		}

		// Arrays and functions.
		// I tried iterating over the result of a generator function to avoid this recursion and simplify the code,
		// but that consistently made the js-framework-benchmarks a few percentage points slower.
		else
			this.exprToTemplates(expr, template => {
				this.applyExactNodes(template, newNodes, secondPass);
			})
	}

	applyMultipleAttribs(node, expr) {
		/*#IFDEV*/assert(this.type === ExprPathType.AttribMultiple);/*#ENDIF*/

		if (Array.isArray(expr))
			expr = expr.flat().join(' ');  // flat and join so we can accept arrays of arrays of strings.

		// Add new attributes
		let oldNames = this.attrNames;
		this.attrNames = new Set();
		if (expr) {
			if (typeof expr === 'function') {
				Globals.currentExprPath = this; // Used by watch()
				this.watchFunction = expr; // used by renderWatched()
				expr = expr();
				Globals.currentExprPath = null;
			}

			// Attribute as name: value object.
			if (typeof expr === 'object') {
				for (let name in expr) {
					let value = expr[name];
					if (value === undefined || value === false || value === null)
						continue;
					node.setAttribute(name, value);
					this.attrNames.add(name)
				}
			}

			// Attributes as string
			else {
				let attrs = (expr + '') // Split string into multiple attributes.
					.split(/([\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+))/g)
					.map(text => text.trim())
					.filter(text => text.length);

				for (let attr of attrs) {
					let [name, value] = attr.split(/\s*=\s*/); // split on first equals.
					value = (value || '').replace(/^(['"])(.*)\1$/, '$2'); // trim value quotes if they match.
					node.setAttribute(name, value);
					this.attrNames.add(name)
				}
			}
		}

		// Remove old attributes.
		for (let oldName of oldNames)
			if (!this.attrNames.has(oldName))
				node.removeAttribute(oldName);
	}

	/**
	 * Handle attributes for event binding, such as:
	 * onclick=${(e, el) => this.doSomething(el, 'meow')}
	 * oninput=${[this.doSomething, 'meow']}
	 * onclick=${[this, 'doSomething', 'meow']}
	 *
	 * @param node
	 * @param expr
	 * @param root */
	applyEventAttrib(node, expr, root) {
		/*#IFDEV*/
		assert(this.type === ExprPathType.Event/* || this.type === PathType.Component*/);
		assert(root instanceof HTMLElement);
		/*#ENDIF*/

		let eventName = this.attrName.slice(2); // remove "on-" prefix.
		let func;
		let args = [];

		// Convert array to function.
		// oninput=${[this.doSomething, 'meow']}
		if (Array.isArray(expr) && typeof expr[0] === 'function') {
			func = expr[0];
			args = expr.slice(1);
		}
		else if (typeof expr === 'function')
			func = expr;
		else
			throw new Error(`Invalid event binding: <${node.tagName.toLowerCase()} ${this.attrName}=\${${JSON.stringify(expr)}}>`);

		this.bindEvent(node, root, eventName, eventName, func, args);
	}


	/**
	 * Call function when eventName is triggerd on node.
	 * @param node {HTMLElement}
	 * @param root {HTMLElement}
	 * @param key {string}
	 * @param eventName {string}
	 * @param func {function}
	 * @param args {array}
	 * @param capture {boolean} */
	bindEvent(node, root, key, eventName, func, args, capture=false) {
		let nodeEvents = Globals.nodeEvents.get(node);
		if (!nodeEvents) {
			nodeEvents = {[key]: new Array(3)};
			Globals.nodeEvents.set(node, nodeEvents);
		}
		let nodeEvent = nodeEvents[key];
		if (!nodeEvent)
			nodeEvents[key] = nodeEvent = new Array(3);

		if (typeof func !== 'function')
			throw new Error(`Solarite cannot bind to <${node.tagName.toLowerCase()} ${this.attrName}=\${${func}}> because it's not a function.`);

		// If function has changed, remove and rebind the event.
		if (nodeEvent[0] !== func) {

			// TODO: We should be removing event listeners when calling getNodeGroup(),
			// when we get the node from the list of nodeGroupsAttached/nodeGroupsDetached,
			// instead of only when we rebind an event.
			let [existing, existingBound, _] = nodeEvent;
			if (existing)
				node.removeEventListener(eventName, existingBound, capture);

			let originalFunc = func;

			// BoundFunc sets the "this" variable to be the current Solarite component.
			let boundFunc = (event) => {
				let args = nodeEvent[2];
				return originalFunc.call(root, ...args, event, node);
			}

			// Save both the original and bound functions.
			// Original so we can compare it against a newly assigned function.
			// Bound so we can use it with removeEventListner().
			nodeEvent[0] = originalFunc;
			nodeEvent[1] = boundFunc;

			node.addEventListener(eventName, boundFunc, capture);

			// TODO: classic event attribs?
			//el[attr.name] = e => // e.g. el.onclick = ... // put "event", "el", and "this" in scope for the event code.
			//	(new Function('event', 'el', attr.value)).bind(this.manager.rootEl)(e, el)
		}

		//  Otherwise just update the args to the function.
		nodeEvents[key][2] = args;
	}

	/**
	 * Handle values, including two-way binding.
	 * @param node
	 * @param exprs */
	// TODO: node is always this.nodeMarker?
	applyValueAttrib(node, exprs) {
		let expr = exprs[0];

		// Two-way binding between attributes
		// Passing a path to the value attribute.
		// Copies the attribute to the property when the input event fires.
		// value=${[this, 'value]'}
		// checked=${[this, 'isAgree']}
		// This same logic is in NodeGroup.instantiateComponent() for components.
		if (Util.isPath(expr)) {
			let [obj, path] = [expr[0], expr.slice(1)];

			if (!obj)
				throw new Error(`Solarite cannot bind to <${node.tagName.toLowerCase()} ${this.attrName}=\${[${expr.map(item => item ? `'${item}'` : item+'').join(', ')}]}>.`);

			let value = delve(obj, path);

			// Special case to allow setting select-multiple value from an array
			if (this.attrName === 'value' && node.type === 'select-multiple' && Array.isArray(value)) {
				// Set the .selected property on the options having a value within value.
				let strValues = value.map(v => v + '');
				for (let option of node.options)
					option.selected = strValues.includes(option.value)
			}
			else {
				// TODO: should we remove isFalsy, since these are always props?
				let strValue = Util.isFalsy(value) ? '' : value;

				// If we don't have this condition, when we call render(), the browser will scroll to the currently
				// selected item in a <select> and mess up manually scrolling to a different value.
				if (strValue !== node[this.attrName])
					node[this.attrName] = strValue;
			}

			// TODO: We need to remove any old listeners, like in bindEventAttribute.
			// Does bindEvent() now handle that?
			let func = () => {
				let value = (this.attrName === 'value')
					? Util.getInputValue(node)
					: node[this.attrName];
				delve(obj, path, value);
			}

			// We use capture so we update the values before other events added by the user.
			// TODO: Bind to scroll events also?
			// What about resize events and width/height?
			this.bindEvent(node, path[0], this.attrName, 'input', func, [], true);
		}

		// Regular attribute
		else {
			// TODO: Cache this on ExprPath.isProp when Shell creates the props.  Have ExprPath.clone() copy .isProp
			// Or make it a new PathType.
			//if (this.attrName === 'disabled')
			//	debugger;

			// hasOwnProperty() checks only the object, not the parents
			// this.attrName in node checks the node and the parents.
			// This version checks the html element it extends from, to see if has a setter set:
			//     Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), this.attrName)?.set
			//let isProp = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), this.attrName)?.set;
			let isProp = this.isHtmlProperty;
			if (isProp === undefined)
				isProp = this.isHtmlProperty = Util.isHtmlProp(node, this.attrName);

			// Values to toggle an attribute
			let multiple = this.attrValue;
			if (!multiple) {
				Globals.currentExprPath = this; // Used by watch()
				if (typeof expr === 'function') {
					if (this.type === 4) { // Don't evaluate functions before passing them to components
						return
					}
					this.watchFunction = expr; // The function that gets the expression, used for renderWatched()
					expr = expr();
				}
				else
					expr = Util.makePrimitive(expr);
				Globals.currentExprPath = null;
			}
			if (!multiple && (expr === undefined || expr === false || expr === null)) { // Util.isFalsy() inlined.
				if (isProp)
					node[this.attrName] = false;
				node.removeAttribute(this.attrName);
			}
			else if (!multiple && expr === true) {
				if (isProp)
					node[this.attrName] = true;
				node.setAttribute(this.attrName, '');
			}

			// A non-toggled attribute
			else {

				// If it's a series of expressions among strings, join them together.
				let joinedValue;
				if (multiple) {
					let value = [];
					for (let i = 0; i < this.attrValue.length; i++) {
						value.push(this.attrValue[i]);
						if (i < this.attrValue.length - 1) {
							Globals.currentExprPath = this; // Used by watch()
							let val = Util.makePrimitive(exprs[i]);
							Globals.currentExprPath = null;
							if (!Util.isFalsy(val))
								value.push(val);
						}
					}
					joinedValue = value.join('')
				}

				// If the attribute is one expression with no strings:
				else
					joinedValue = expr;

				// Only update attributes if the value has changed.
				// This is needed for setting input.value, .checked, option.selected, etc.

				let oldVal = isProp
					? node[this.attrName]
					: node.getAttribute(this.attrName);
				if (oldVal !== joinedValue) {

					// <textarea value=${expr}></textarea>
					// Without this branch we have no way to set the value of a textarea,
					// since we also prohibit expressions that are a child of textarea.
					if (isProp)
						node[this.attrName] = joinedValue;
					// TODO: Putting an 'else' here would be more performant
					node.setAttribute(this.attrName, joinedValue);
				}
			}
		}
	}


	/**
	 *
	 * @param newRoot {HTMLElement}
	 * @param pathOffset {int}
	 * @return {ExprPath} */
	clone(newRoot, pathOffset=0) {
		/*#IFDEV*/this.verify();/*#ENDIF*/

		// Resolve node paths.
		let nodeMarker, nodeBefore;
		let root = newRoot;
		let path = pathOffset ? this.nodeMarkerPath.slice(0, -pathOffset) : this.nodeMarkerPath;
		let length = path.length-1;
		for (let i=length; i>0; i--) // Resolve the path.
			root = root.childNodes[path[i]];
		let childNodes = root.childNodes;

		nodeMarker = path.length ? childNodes[path[0]] : newRoot;
		if (this.nodeBefore)
			nodeBefore = childNodes[this.nodeBeforeIndex];

		let result = new ExprPath(nodeBefore, nodeMarker, this.type, this.attrName, this.attrValue);

		//#IFDEV
		result.nodeMarker.exprPath = result;
		if (result.nodeBefore)
			result.nodeBefore.prevExprPath = result;
		result.verify();
		//#ENDIF

		return result;
	}

	/**
	 * Clear the nodeCache of this ExprPath, as well as all parent and child ExprPaths that
	 * share the same DOM parent node.
	 *
	 * TODO: Is recursive clearing ever necessary? */
	clearNodesCache() {
		let path = this;

		// Clear cache parent ExprPaths that have the same parentNode
		let parentNode = this.nodeMarker.parentNode;
		while (path && path.nodeMarker.parentNode === parentNode) {
			path.nodesCache = null;
			path = path.parentNg?.parentPath

			// If stuck in an infinite loop here, the problem is likely due to Template hash colisions.
			// Which cause one path to be the descendant of itself, creating a cycle.
		}

		function clearChildNodeCache(path) {

			// Clear cache of child ExprPaths that have the same parentNode
			for (let ng of path.nodeGroups) {
				if (ng) // Can be null from apply()'s push(null) call.
					for (let path2 of ng.paths) {
						if (path2.type === ExprPathType.Content && path2.parentNode === parentNode) {
							path2.nodesCache = null;
							clearChildNodeCache(path2);
						}
					}
			}
		}

		// Commented out on Sep 30, 2024 b/c it was making the benchmark never finish when adding 10k rows.
		//clearChildNodeCache(this);
	}


	/**
	 * Attempt to remove all of this ExprPath's nodes from the DOM, if it can be done using a special fast method.
	 * @returns {boolean} Returns false if Nodes weren't removed, and they should instead be removed manually. */
	fastClear() {
		let parent = this.nodeBefore.parentNode;
		if (this.nodeBefore === parent.firstChild && this.nodeMarker === parent.lastChild) {

			// If parent is the only child of the grandparent, replace the whole parent.
			// And if it has no siblings, it's not created by a NodeGroup/path.
			// Commented out because this will break any references.
			// And because I don't see much performance difference.
			// let grandparent = parent.parentNode
			// if (grandparent && parent === grandparent.firstChild && parent === grandparent.lastChild && !parent.hasAttribute('id')) {
			// 	let replacement = document.createElement(parent.tagName)
			// 	replacement.append(this.nodeBefore, this.nodeMarker)
			// 	for (let attrib of parent.attributes)
			// 		replacement.setAttribute(attrib.name, attrib.value)
			// 	parent.replaceWith(replacement)
			// }
			// else {
				parent.innerHTML = ''; // Faster than calling .removeChild() a thousand times.
				parent.append(this.nodeBefore, this.nodeMarker)
			//}
			return true;
		}
		return false;
	}

	/**
	 * @return {(Node|HTMLElement)[]} */
	getNodes() {

		// Why doesn't this work?
		// let result2 = [];
		// for (let ng of this.nodeGroups)
		// 	result2.push(...ng.getNodes())
		// return result2;

		if (this.type === ExprPathType.AttribValue || this.type === ExprPathType.AttribMultiple || this.type === ExprPathType.ComponentAttribValue) {
			return [this.nodeMarker];
		}


		let result

		// This shaves about 5ms off the partialUpdate benchmark.
		result = this.nodesCache;
		if (result) {

			//#IFDEV
			this.checkNodesCache();
			//#ENDIF

			return result
		}

		result = [];
		let current = this.nodeBefore.nextSibling;
		let nodeMarker = this.nodeMarker;
		while (current && current !== nodeMarker) {
			result.push(current)
			current = current.nextSibling
		}

		this.nodesCache = result;
		return result;
	}

	/** @return {HTMLElement|ParentNode} */
	getParentNode() {
		return this.nodeMarker.parentNode
	}

	/**
	 * Get an unused NodeGroup that matches the template's html and expressions (exact=true)
	 * or at least the html (exact=false).
	 * Remove it from nodeGroupsFree if it exists, or create it if not.
	 * Then add it to nodeGroupsInUse.
	 *
	 * @param template {Template}
	 * @param exact {boolean}
	 *     If true, return an exact match, or null.
	 *     If false, either find a match for the template's html and then apply the template's expressions,
	 *         or createa  new NodeGroup from the template.
	 * @return {NodeGroup} */
	getNodeGroup(template, exact=true) {

		let result;
		let collection = this.nodeGroupsAttachedAvailable;

		// TODO: Would it be faster to maintain a separate list of detached nodegroups?
		if (exact) { // [below] parentElement will be null if the parent is a DocumentFragment
			result = collection.deleteAny(template.getExactKey());
			if (!result) { // try searching detached
				collection = this.nodeGroupsDetachedAvailable;
				result = collection.deleteAny(template.getExactKey());
			}

			if (result) // also delete the matching close key.
				collection.deleteSpecific(template.getCloseKey(), result);
			else {
				return null;
			}
		}

		// Find a close match.
		// This is a match that has matching html, but different expressions applied.
		// We can then apply the expressions to make it an exact match.
		// If the template has no expressions, the key is the html, and we've already searched for an exact match.  There won't be an inexact match.
		else if (template.exprs.length) {
			result = collection.deleteAny(template.getCloseKey());
			if (!result) { // try searching detached
				collection = this.nodeGroupsDetachedAvailable;
				result = collection.deleteAny(template.getCloseKey());
			}

			if (result) {
				/*#IFDEV*/assert(result.exactKey);/*#ENDIF*/
				collection.deleteSpecific(result.exactKey, result);

				// Update this close match with the new expression values.
				result.applyExprs(template.exprs);
				result.exactKey = template.getExactKey(); // TODO: Should this be set elsewhere?
			}
		}

		if (!result)
			result = new NodeGroup(template, this);

		// old:
		this.nodeGroupsRendered.push(result);

		/*#IFDEV*/assert(result.parentPath);/*#ENDIF*/
		return result;
	}

	isComponent() {
		// Events won't have type===Component.
		// TODO: Have a special flag for components instead of it being on the type?
		return this.type === ExprPathType.ComponentAttribValue || (this.attrName && this.nodeMarker.tagName && this.nodeMarker.tagName.includes('-'));
	}

	/**
	 * TODO: Rename this to nodeGroupsInUse, nodeGroupsAvialableAttached and nodeGroupsAvailableDetached?
	 * Nodes that have been used during the current render().
	 * Used with getNodeGroup() and freeNodeGroups().
	 * TODO: Use an array of WeakRef so the gc can collect them?
	 * TODO: Put items back in nodeGroupsInUse after applyExpr() is called, not before.
	 * @type {NodeGroup[]} */
	nodeGroupsRendered = [];

	/**
	 * Nodes that were added to the web component during the last render(), but are available to be used again.
	 * Used with getNodeGroup() and freeNodeGroups().
	 * Each NodeGroup is here twice, once under an exact key, and once under the close key.
	 * @type {MultiValueMap<key:string, value:NodeGroup>} */
	nodeGroupsAttachedAvailable = new MultiValueMap();

	/**
	 * Nodes that were not added to the web component during the last render(), and available to be used again.
	 * @type {MultiValueMap} */
	nodeGroupsDetachedAvailable = new MultiValueMap();


	/**
	 * Move everything from this.nodeGroupsRendered to this.nodeGroupsAttached and nodeGroupsDetached.
	 * Called at the beginning of applyNodes() so it can have NodeGroups to use.
	 * TODO: this could run as needed in getNodeGroup? */
	freeNodeGroups() {
		// Add nodes that weren't used during render() to nodeGroupsDetached
		let previouslyAttached = this.nodeGroupsAttachedAvailable.data;
		let detached = this.nodeGroupsDetachedAvailable.data;
		for (let key in previouslyAttached) {
			let set = detached[key];
			if (!set)
				detached[key] = previouslyAttached[key]
			else
				for (let ng of previouslyAttached[key])
					set.add(ng);
		}

		// Add nodes that were used during render() to nodeGroupsRendered.
		this.nodeGroupsAttachedAvailable = new MultiValueMap();
		let nga = this.nodeGroupsAttachedAvailable;
		for (let ng of this.nodeGroupsRendered) {
			nga.add(ng.exactKey, ng);
			nga.add(ng.closeKey, ng);
		}

		this.nodeGroupsRendered = [];
	}

	//#IFDEV

	get debug() {
		return [
			`parentNode: ${this.nodeBefore.parentNode?.tagName?.toLowerCase()}`,
			'nodes:',
			...setIndent(this.getNodes().map(item => {
				if (item instanceof Node)
					return item.outerHTML || item.textContent
				else if (item instanceof NodeGroup)
					return item.debug
			}), 1).flat()
		]
	}

	get debugNodes() {
		// Clear nodesCache so that getNodes() manually gets the nodes.
		let nc = this.nodesCache;
		this.nodesCache = null;
		let result = this.getNodes()
		this.nodesCache = nc;
		return result;
	}

	verify() {
		if (!window.verify)
			return;

		assert(this.type!==ExprPathType.Content || this.nodeBefore)
		assert(this.type!==ExprPathType.Content || this.nodeBefore.parentNode)

		// Need either nodeMarker or parentNode
		assert(this.nodeMarker)

		// nodeMarker must be attached.
		assert(!this.nodeMarker || this.nodeMarker.parentNode)

		// nodeBefore and nodeMarker must have same parent.
		assert(this.type!==ExprPathType.Content || this.nodeBefore.parentNode === this.nodeMarker.parentNode)

		assert(this.nodeBefore !== this.nodeMarker)
		assert(this.type!==ExprPathType.Content|| !this.nodeBefore.parentNode || this.nodeBefore.compareDocumentPosition(this.nodeMarker) === Node.DOCUMENT_POSITION_FOLLOWING)

		// Detect cyclic parent and grandparent references.
		assert(this.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath !== this)
		assert(this.parentNg?.parentPath?.parentNg?.parentPath?.parentNg?.parentPath !== this)

		for (let ng of this.nodeGroups)
			ng.verify();

		// Make sure the nodesCache matches the nodes.
		this.checkNodesCache();
	}

	checkNodesCache() {
		return;

		// Make sure cache is accurate.
		// If this is invalid, then perhaps another component append()'d one of our nodes to itself.
		// Or perhaps one of our nodes is used in an expression more than once.
		// TODO: Find a way to check for and warn when this happens.
		// MutationObserver is too slow since it's asynchronous.
		// My own MutationWatcher has to modify DOM prototypes, which is rather invasive.
		if (this.nodesCache) {
			let nodes = [];
			let current = this.nodeBefore.nextSibling;
			let nodeMarker = this.nodeMarker;
			while (current && current !== nodeMarker) {
				nodes.push(current)
				current = current.nextSibling
			}

			if (!Util.arraySame(this.nodesCache, nodes))
				console.log(this.nodesCache, nodes)
			assert(Util.arraySame(this.nodesCache, nodes) === true);
		}
	}
	//#ENDIF
}

/**
 *
 * @param root
 * @param path {string[]}
 * @param node {HTMLElement}
 */
function setValue(root, path, node) {
	let val = node.value;
	if (node.type === 'number')
		val = parseFloat(val);

	delve(root, path, val);
}

/** @enum {int} */
export const ExprPathType = {
	/** Child of a node */
	Content: 1,

	/** One or more whole attributes */
	AttribMultiple: 2,

	/** Value of an attribute. */
	AttribValue: 3,

	/** Value of an attribute being passed to a component. */
	ComponentAttribValue: 4,

	/** Expressions inside Html comments. */
	Comment: 5,

	/** Value of an attribute. */
	Event: 6,
}


/** @return {int[]} Returns indices in reverse order, because doing it that way is faster. */
export function getNodePath(node) {
	let result = [];
	while(true) {
		let parent = node.parentNode
		if (!parent)
			break;
		result.push(Array.prototype.indexOf.call(node.parentNode.childNodes, node))
		node = parent;
	}
	return result;
}

/**
 * Note that the path is backward, with the outermost element at the end.
 * @param root {HTMLElement|Document|DocumentFragment|ParentNode}
 * @param path {int[]}
 * @returns {Node|HTMLElement|HTMLStyleElement} */
export function resolveNodePath(root, path) {
	for (let i=path.length-1; i>=0; i--)
		root = root.childNodes[path[i]];
	return root;
}
