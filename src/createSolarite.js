import Util from './Util.js';
import Globals from "./Globals.js";

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
 * 3.  Populates the attribs argument to the constructor, parsing JSON from DOM attribute values surrouned with '${...}'
 * 4.  Populates the attribs argument to the render() function
 * 5.  Shows an error if render() isn't defined.
 *
 * Advantages to inheriting from HTMLElement
 * 1.  We can inherit from things like HTMLTableRowElement directly.
 * 2.  There's less magic, since everyone is familiar with defining custom elements.
 * 3.  No confusion about how the class name becomes a tag name.
 */

/**
 * Intercept the construct call to auto-define the class before the constructor is called.
 * And populate the attribs and children arguments when the element is created from the regular DOM
 * and not as a child of another web component.
 * @param extendsTag {?string}
 * @return {Class} */
export default function createSolarite(extendsTag=null) {

	let BaseClass = HTMLElement;
	if (extendsTag && !extendsTag.includes('-')) {
		extendsTag = extendsTag.toLowerCase();

		BaseClass = Globals.elementClasses[extendsTag];
		if (!BaseClass) { // TODO: Use Cache
			BaseClass = Globals.doc.createElement(extendsTag).constructor;
			Globals.elementClasses[extendsTag] = BaseClass
		}
	}

	/**
	 * Intercept the construct call to auto-define the class before the constructor is called.
	 * @type {HTMLElement} */
	let HTMLElementAutoDefine = new Proxy(BaseClass, {
		construct(Parent, args, Class) {

			// 1. Call customElements.define() automatically.
			defineClass(Class, null, extendsTag);

			// 2. This line is equivalent the to super() call to HTMLElement:
			return Reflect.construct(Parent, args, Class);
		}
	});

	/**
	 * @extends {HTMLElement} */
	return class Solarite extends HTMLElementAutoDefine {

		constructor(attribs=null/*, children*/) {
			super();

			// 1. Populate attribs if it's an empty object.
			if (attribs) {
				if (typeof attribs !== 'object')
					throw new Error('First argument to custom element constructor must be an object.');

				if (attribs && !Object.keys(attribs).length) {
					let attribs2 = getAttribs(this);
					for (let name in attribs2) {
						attribs[name] = attribs2[name];
					}
				}
			}

			// 2. Wrap render function so it always provides the attribs.
			let originalRender = this.render;
			this.render = (attribs) => {
				if (!attribs)
					attribs = getAttribs(this);
				originalRender.call(this, attribs);
			}

			// 2. Populate children if it's an empty array.
			/*if (children) {
				if (!Array.isArray(children))
					throw new Error('Second argument to custom element constructor must be an array.');
				if (!children.length) {
					// TODO: <slot> won't exist until after render() is called, so what good is this?
					let slotChildren = (this.querySelector('slot') || this).childNodes; // TODO: What about named slots?
					for (let child of slotChildren)
						children.push(child);
				}
			}*/
		}

		render() {
			throw new Error('render() is not defined for ' + this.constructor.name);
		}

		/**
		 * Call render() only if it hasn't already been called.	 */
		renderFirstTime() {
			if (!Globals.rendered.has(this)) {
				let attribs = getAttribs(this, 'solarite-placeholder');
				this.render(attribs); // calls Globals.rendered.add(this); inside the call to h()'...'.
			}
		}

		/**
		 * Called automatically by the browser. */
		connectedCallback() {
			this.renderFirstTime();
		}

		static define(tagName=null) {
			defineClass(this, tagName)
		}
	}
}

function getAttribs(el) {
	let result = Util.attribsToObject(el, 'solarite-placeholder');
	for (let name in result) {
		let val = result[name];
		if (val.startsWith('${') && val.endsWith('}'))
			result[name] = JSON.parse(val.slice(2, -1));
	}
	return result;
}

