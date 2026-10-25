import NodeGroup from './NodeGroup.js';
import Globals from './Globals.js';
import Util from './Util.js';
import delve from './delve.js';
import PathToAttribs from './PathToAttribs.js';
import PathToAttribValue from './PathToAttribValue.js';
import PathToComponent from './PathToComponent.js';
import PathToEvent from './PathToEvent.js';
import PathToNodes from './PathToNodes.js';

/**
 * Has these properties not present on NodeGroup, assigned by instantiate():
 * They're not declared as fields because subclass field initializers run after the
 * super constructor and would overwrite the assigned values.
 * @property {HTMLElement|DocumentFragment} rootEl - Root node at the top of the hierarchy: the element,
 *     DocumentFragment or ShadowRoot that was rendered into, or what a standalone template made.
 * @property {?object} renderOptions - RenderOptions
 * @property {?Node[]} slotMarks - Where this template put the children the element was given
 *     for its slots, and where its own nodes end in the element: for each place, the node they
 *     were appended to, the node that was its last child before, and the first node appended.
 *     Null for a standalone template.  See unrender().
 * @property {?string[]} copiedAttribs - Names of the attributes that were copied from the template's
 *     own root element onto the element, leaving out those a parent's template wrote over them.
 *     Null unless the two were merged.
 * @property {boolean} threw - True when the last render threw part-way through applying its
 *     expressions, so the next one has none to compare with.  See Template.render(). */
export default class RootNodeGroup extends NodeGroup {

	/**
	 * Special setup for the root: graft the fragment into el (or use it standalone),
	 * resolve paths and embeds against the root, then place the slot children.
	 * Called by the NodeGroup constructor. */
	instantiate(shell, shellFragment, el, options) {
		let startingPathDepth = 0;
		let component = null; // The placeholder of a component that is a standalone template's only node.
		this.renderOptions = options;

		// Every root is given both, whether it will use them or not, so that all roots have the
		// same properties in the same order.  Code that runs for every row and every event
		// reads the root (delegateAll, rootEl), and the engine keeps that read fast only while
		// the roots it meets there have few different shapes.
		this.slotMarks = this.copiedAttribs = null;
		this.threw = false;

		// Whether every delegatable event in this tree is delegated: any value other than false
		// or an array of event names means yes.  The stamp program and the dispatcher read this
		// per row, so it is worked out once here rather than from the options each time.
		let opt = options?.eventDelegation;
		this.delegateAll = opt !== false && !Array.isArray(opt);

		// A template of plain text, or an empty one, is a single Text node with no paths.
		let isText = shellFragment.nodeType === 3;
		let isEmpty = isText && !shellFragment.nodeValue;
		let slotChildren, handOff;
		if (el) {
			this.rootEl = el;

			// Save the children that belong in this component's <slot>, from one of two places:
			// 1. A hand-off parked by PathToComponent.applyAll() just before it constructed
			//    us, when this component was declared inside another template.  It carries
			//    the Constructor it was meant for, so an unrelated component built in the
			//    meantime -- a field initializer creating a menu, say -- leaves it alone.
			// 2. el.childNodes, when render() is called manually for the first time, and when
			//    another template takes the place of the one el held: unrender() leaves el
			//    holding nothing but these children, and leaves its entry in rootNodeGroups,
			//    without a root, to say so.  A hand-off is never for such an element.  One
			//    may be parked all the same, for a component of the same class that a parent
			//    template is constructing further up the call stack.
			// An addressed hand-off wins even when its node list is empty:  a component
			// declared as <my-tag></my-tag> is asking for an empty slot, not for whatever
			// its own constructor happened to put in the element.
			//
			// The hand-off is deliberately NOT cleared on read.  A component that builds
			// another instance of its OWN class while constructing cannot be told apart
			// from itself by any address, so both match; the inner one takes the nodes and
			// this outer one takes them straight back, which is the only thing that makes
			// that case work.
			handOff = Globals.rootNodeGroups.has(el) ? null : Globals.currentSlotChildren;
			if (handOff?.Constructor !== el.constructor)
				handOff = null;
			let mySlotNodes = handOff
				? handOff.nodes
				: (el.childNodes.length ? [...el.childNodes] : null);

			if (mySlotNodes) {
				slotChildren = Globals.doc.createDocumentFragment();
				slotChildren.append(...mySlotNodes);
			}

			// An empty template leaves the element empty.  That takes out what a component's
			// constructor put there when its slot children came by hand-off; without one, el
			// is empty by now.  An element that was rendered in the meantime is emptied too: a
			// slot child that is a custom element left the document just above, and its
			// disconnectedCallback may have rendered el.  That render had no slot children to
			// place, so this one takes its place.
			if (isEmpty || Globals.rootNodeGroups.get(el))
				el.textContent = '';

			if (isText) {
				if (!isEmpty)
					el.append(shellFragment);
			}

			// If el should replace the root node of the fragment.
			else if (isReplaceEl(shellFragment, el.tagName)) {
				el.append(...shellFragment.children[0].childNodes);

				// Copy attributes.  The names are kept so that unrender() takes off the
				// ones this template put there, and none that the element had already.
				// Nor any that the parent's template is about to write: a component that
				// renders from its constructor gets here before PathToComponent has copied
				// the placeholder's attributes onto it, and those belong to the parent.
				this.copiedAttribs = [];
				for (let attrib of shellFragment.children[0].attributes)
					if (!el.hasAttribute(attrib.name)) {
						el.setAttribute(attrib.name, attrib.value);
						if (!handOff?.el.hasAttribute(attrib.name))
							this.copiedAttribs.push(attrib.name);
					}

				// Go one level deeper into all of shell's paths.
				startingPathDepth = 1;
			}

			else
				el.append(...shellFragment.childNodes);
		}

		// Instantiate as a standalone element.  A template of plain text is its one Text node, which is what toEl('Hi')
		// gives, and what a template of text with a < or an & in it gives through the html parser below.
		else if (isText)
			this.rootEl = shellFragment;

		else {
			// The template is given back as one node only when one node is all it can draw:
			// trimming the whitespace and comment nodes off both ends of the fragment leaves
			// exactly one node, and no expression stands at the top level beside it.  The
			// expression has to be asked about on its own, because the list shows nothing of it:
			// what marks its place is a comment, which is trimmed, or the node next to it.
			// Taking that node for the root would hand it back alone, without what the
			// expression drew.  Anything else is given back in the fragment, all of it.
			let relevantNodes = Util.trimEmptyNodes(shellFragment.childNodes);
			let onlyChild = relevantNodes.length === 1 && !hasTopLevelExpr(shell) ? relevantNodes[0] : null;

			// A component is the one node that can't be the root.  What stands in the fragment
			// is only its placeholder: PathToComponent constructs the component and puts it in
			// the placeholder's place when the expressions are applied, and NodeGroup.applyExprs()
			// never asks it to for an element that is the root, because a root that names a
			// component is a component rendering its own tag.  As the root, the placeholder
			// itself came back from toEl(), and nothing was ever constructed.  So the fragment
			// stays the root, as it does when the component has a sibling beside it, and the
			// component is remembered as this group's one node (see startNode below).
			if (isComponent(onlyChild)) {
				component = onlyChild;
				onlyChild = null;
			}
			this.rootEl = onlyChild || shellFragment; // We return the whole fragment when calling h() with a collection of nodes.
		}

		// The paths are found where the template's nodes are now: in el, from one level down when
		// el took the place of the template's root element, and otherwise in the fragment they
		// were cloned in.  A standalone template's nodes are all still there, its one root
		// element included, so its paths are found from the fragment whatever the root is.
		if (!isText) {
			let nodes = el || shellFragment;
			try {
				this.setPathsFromFragment(nodes, shell, startingPathDepth);
				this.activateEmbeds(nodes, shell, startingPathDepth);
			}

			// A data-id that would overwrite a property of the element throws, and so can a
			// <script>.  The element is then given back as unrender() leaves it, so that the
			// next render finds no half-built template to take for slot children: without the
			// attributes copied from this template, and holding nothing but the children it
			// was given.  Children that came by hand-off go back to the placeholder they came
			// from.  When the render that threw is the one a component's constructor made, that
			// component is never used, and the parent's template hands them over again to the
			// one it builds next time.
			catch (e) {
				if (el) {
					for (let name of this.copiedAttribs || [])
						el.removeAttribute(name);
					el.textContent = '';
					(handOff?.el || el).append(...(slotChildren?.childNodes || []));
					Globals.rootNodeGroups.set(el, null);
				}
				throw e;
			}
		}

		// A root group's first and last node are its root, which is also what Template.render()
		// hands back for a standalone template.  The exception is the component above: there
		// they are its placeholder, and PathToComponent points both at the component when it
		// takes the placeholder's place, so that the component is what comes back.
		this.startNode = this.endNode = component || this.rootEl;

		Globals.rootNodeGroups.set(this.rootEl, this);

		// Setup slot children (deprecated)
		// They go in last, when this root is complete and registered.  A slot child that is a
		// custom element enters the document here, and its connectedCallback may render el; that
		// render then finds this root and applies its expressions to it, instead of building a
		// second root in an element that is half set up.
		//
		// Remember where they go, so that another template can take them over later, and where
		// the template's own nodes end in el: nodes other code appends to el after them are
		// taken over the same way, whether or not el was given children.
		// The nodes themselves are not kept: rows that a parent template draws among
		// them come and go, and the page may add and remove its own.  What is kept is
		// where they start, as the last node the template itself has in that place (null
		// when it has none).  The first slot child is kept beside it, for when that last
		// node has left that place, as a text node does when the browser's page translator
		// replaces it.  A last node that is the placeholder of a child component is replaced
		// by the component when it is built, and PathToComponent puts the component in the
		// placeholder's place here too.
		if (el) {
			let marks = this.slotMarks = [];
			if (slotChildren) {

				// An empty template shows nothing, so they stay in their fragment.
				if (isEmpty)
					marks.push(slotChildren, null, null);
				else {
					// Named slots.  Each takes the children with its name in their slot attribute,
					// and only those: an element deeper down with that attribute belongs to the
					// child that holds it, which may be a component with a slot of the same name.
					for (let slot of el.querySelectorAll('slot[name]')) {
						let name = slot.getAttribute('name')
						if (name) {
							let slotChildren2 = [...slotChildren.children].filter(child => child.getAttribute('slot') === name);
							marks.push(slot, slot.lastChild, slotChildren2[0]);
							slot.append(...slotChildren2);
						}
					}

					// The unnamed slot, or the end of el when there is none.
					let home = el.querySelector('slot:not([name])') || el;
					marks.push(home, home.lastChild, slotChildren.firstChild);
					home.append(slotChildren);
				}
			}

			// The end of el, when the slot children didn't go there.  The element itself is
			// never one of the nodes in a place, so it is in the list only as such a place.
			if (!marks.includes(el))
				marks.push(el, el.lastChild, null);
		}
	}

	/**
	 * Take this template out of the element, so that another one can be rendered into it, as
	 * a render() does that shows a loading message first and a list later.  Called by
	 * Template.render() when it is given an element that holds another template.
	 *
	 * The expressions of the new template mean nothing to the paths of this one, so nothing
	 * of this template can be kept: its nodes leave the element, with whatever they held (text
	 * typed into an input, the state of a child component), and so does what it wrote on the
	 * element itself.  The element is then as it was before its first render, holding only the
	 * children it was given for its slots, and the new template is rendered into it as into an
	 * element never rendered before.  Rendering this template again later builds new elements
	 * for the same reason. */
	unrender() {
		let el = this.rootEl;

		// 1. Find the slot children while they are still where this template put them (see
		// slotMarks), and the nodes other code put after the template: what each place holds
		// after the template's own nodes, which is all of it for a slot with nothing of its own,
		// and for the fragment and the element of an empty template.
		let slotNodes = [];
		let marks = this.slotMarks || [];
		for (let i=0; i<marks.length; i+=3) {
			let home = marks[i], before = marks[i+1], node = marks[i+2];
			if (!before)
				node = home.firstChild;
			else if (before.parentNode === home)
				node = before.nextSibling;
			for (; node && node.parentNode === home; node = node.nextSibling)
				slotNodes.push(node);
		}

		// 2. Take back what this template wrote on the element itself, which it does when its
		// one root element stands for the element (see isReplaceEl): the attributes copied from
		// that root, and its expressions.  Their paths are then pointed at a stand-in.  A switch
		// can come from inside a render of this template, when a child component it is building
		// renders this element again; that render carries on once the child returns, and what
		// it still has to write must not land on an element that now holds another template.
		// The stand-in is also where the old nodes go, so that they keep a common parent for
		// such a render to work in.  The path of the element as a component keeps pointing at
		// it, which is what makes applyExprs() pass it over, and rootEl stays as it is: an
		// event that started in the old nodes may still be on its way through them, and their
		// handlers are called with the element as `this`.
		// The template that made an element with h() or toEl() has paths on the element too, and
		// copied nothing onto it.  Those are the element's own definition, so they stay when a
		// template is rendered into it.
		let standIn = Globals.doc.createElement('div');
		for (let name of this.copiedAttribs || [])
			el.removeAttribute(name);
		if (this.copiedAttribs)
			for (let path of this.paths || [])
				if (path.nodeMarker === el && !(path instanceof PathToComponent)) {
					clearPath(path, el);
					path.nodeMarker = standIn;
				}

		// 3. Take the root off the element's entry (the entry stays, see instantiate()), then
		// give the element the slot children in place of everything it holds, in one call.
		// A custom element that leaves the document here has its disconnectedCallback run as
		// that call returns, and that code may render this element.  It then finds an element
		// in the state this function promises, and renders into it.
		// The old nodes are moved one at a time: a list at the top of a template can have more
		// rows than a function call takes arguments.
		Globals.rootNodeGroups.set(el, null);
		let old = [...el.childNodes];
		el.replaceChildren(...slotNodes);
		for (let node of old)
			if (!node.parentNode)
				standIn.append(node);

		// 4. Forget the id references into the nodes that left.  The new template binds its
		// own, and a name only this one had would otherwise still give a removed element.
		// The names are read as attributes: the id property of a <form> with a control named
		// "id" is that control.  An empty data-id with no id gives no name.
		for (let node of standIn.querySelectorAll('[id],[data-id]')) {
			let id = (node.getAttribute('data-id') || node.getAttribute('id'))?.split('.');
			if (id && delve(el, id) === node)
				delve(el, id, null);
		}
	}
}

/**
 * Take back what one path of a template wrote on the element the template was rendered into.
 * An attribute is removed.  An event handler cannot be taken off the element without knowing
 * how it was bound, so it is replaced with one that does nothing.
 * @param path {Path}
 * @param el {HTMLElement} */
function clearPath(path, el) {
	if (path instanceof PathToAttribs) {
		path.applySingle();
		if (path.jsxSub)
			clearPath(path.jsxSub, el);
	}
	else if (path instanceof PathToEvent && !path.attrValue)
		path.applySingle(() => {});
	else if (path instanceof PathToAttribValue)
		el.removeAttribute(path.attribName);
}


/**
 * Does the fragment have one child that's an element matching the tagname of el?
 * The tags are compared before the dash is looked for because el may be a DocumentFragment or a
 * ShadowRoot, which has no tagName at all.  Nothing equals undefined, so the answer for those is
 * no, and a template rendered into one is appended to it whole.
 * @param fragment {DocumentFragment}
 * @param tagName {string|undefined}
 * @returns {boolean} */
function isReplaceEl(fragment, tagName) {
	return fragment.children.length===1
		&& fragment.children[0].tagName.replace('-SOLARITE-PLACEHOLDER', '') === tagName
		&& tagName.includes('-');
}

/**
 * Does the template have an expression at its top level, beside its nodes and not inside one of
 * them, as in `Total: ${n}` or `<h1>Fruit</h1>${rows}`?  What such an expression draws becomes
 * top-level nodes of the template too.  The template's html decides this and its values never do,
 * so that one template gives the same kind of result every time: an expression that draws
 * nothing this time is counted like any other.
 *
 * Such an expression is a path to nodes whose two markers are children of the shell's fragment.
 * One that is the only child of an element has no node before it, one inside a <style> or a
 * <script> has that element's text for its markers, and an expression in a comment that someone
 * commented out has a path of the base class, which draws nothing.
 * @param shell {Shell}
 * @returns {boolean} */
function hasTopLevelExpr(shell) {
	return shell.paths.some(path => path instanceof PathToNodes && path.nodeBefore?.parentNode === shell.docFrag);
}

/**
 * Does this node stand for a component?  That is an element with a dash in its tag name, or a
 * customized built-in, whose `is` attribute Shell renamed to `_is`: the same two tests by which
 * Shell decides that an element gets a PathToComponent.
 * @param node {?Node}
 * @returns {boolean} */
function isComponent(node) {
	return node?.nodeType === 1 && (node.tagName.includes('-') || node.hasAttribute('_is'));
}
