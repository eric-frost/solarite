import Util from './Util.js';
import Globals from "./Globals.js";
import RootNodeGroup from "./RootNodeGroup.js";

// Trick to prevent minifier from renaming these methods.
let define = 'define';
let getName = 'getName';

function defineClass(Class, tagName) {
	if (!customElements[getName](Class)) { // If not previously defined.
		tagName = tagName || Util.camelToDashes(Class.name)
		if (!tagName.includes('-')) // Browsers require that web components always have a dash in the name.
			tagName += '-element';
		customElements[define](tagName, Class)
	}
}


/**
 * Create a version of the Solarite class that extends from the given tag name.
 * Reasons to inherit from this instead of HTMLElement.
 * 1.  customElements.define() is called automatically when you create the first instance.
 * 2.  Calls render() when added to the DOM, if it hasn't been called already.
 * 3.  Populates the attribs and children arguments to the constructor.
 * 4.  We have the onConnect, onFirstConnect, and onDisconnect methods.
 *     Can't figure out how to have these work standalone though, and still be synchronous.
 * 5.  Shows an error if render() isn't defined.
 *
 * Advantages to inheriting from HTMLElement
 * 1.  Minimization won't break when it renames the Class and we call customElements.define() on the wrong name.
 *     Is this still an issue?
 * 2.  We can inherit from things like HTMLTableRowElement directly.
 * 3.  There's less magic, since everyone is familiar with defining custom elements.
 * 4.  No confusion about how the class name becomes a tag name.
 */

/**
 * Intercept the construct call to auto-define the class before the constructor is called.
 * And populate the attribs and children arguments when the element is created from the regular DOM
 * and not as a child of another web component.
 * @type {HTMLElement|Proxy} */
let HTMLElementAutoDefine = new Proxy(HTMLElement, {
	construct(Parent, args, Class) {

		// 1. Call customElements.define() automatically.
		defineClass(Class, null);

		// 2. This line is equivalent the to super() call to HTMLElement:
		let result = Reflect.construct(Parent, args, Class);

		// 3. Populate attribs if it's an empty object.
		if (!args[0] || typeof args[0] !== 'object')
			throw new Error('First argument to custom element constructor must be an object.');

		if (!Object.keys(args[0]).length) {
			let attribs = Util.attribsToObject(result);
			for (let name in attribs)
				args[0][name] = attribs[name];
		}

		// 4. Populate children if it's an empty array.
		if (!Array.isArray(args[1]))
			throw new Error('Second argument to custom element constructor must be an array.');
		if (!args[1].length) {
			let slotChildren = (result.querySelector('slot') || result).childNodes; // TODO: What about named slots?
			for (let child of slotChildren)
				args[1].push(child);
		}
		return result;
	}
});

/**
 * @extends HTMLElement */
export default class Solarite extends HTMLElementAutoDefine {

	// Deprecated?
	onConnect;
	onFirstConnect;
	onDisconnect;

	constructor(attribs={}, children=[]) {
		super(attribs, children);
	}

	render() {
		throw new Error('render() is not defined for ' + this.constructor.name);
	}

	/**
	 * Call render() only if it hasn't already been called.	 */
	renderFirstTime() {
		if (!Globals.rendered.has(this) && this.render) {
			let attribs = Util.attribsToObject(this, 'solarite-placeholder');
			let children = RootNodeGroup.getSlotChildren(this);
			this.render(attribs, children);
		}
	}

	/**
	 * Called automatically by the browser. */
	connectedCallback() {
		this.renderFirstTime();
		if (!Globals.connected.has(this)) {
			Globals.connected.add(this);
			if (this.onFirstConnect)
				this.onFirstConnect();
		}
		if (this.onConnect)
			this.onConnect();
	}

	disconnectedCallback() {
		if (this.onDisconnect)
			this.onDisconnect();
	}


	static define(tagName=null) {
		defineClass(this, tagName)
	}
}

