/*
┏┓  ┓    •
┗┓┏┓┃┏┓┏┓┓╋▗▖
┗┛┗┛┗┗┻╹ ╹╹┗
JavasCript UI library
@license MIT
@copyright Vorticode LLC
https://vorticode.github.io/solarite/ */
import h from './h.js';
export default h;
export {default as h} from './h.js'; //Named exports for h() are deprecated.
export {default as delve} from './delve.js';
export {default as Template} from './Template.js';
export {default as toEl} from './toEl.js';

// Experimental:
//--------------
export {default as Globals} from './Globals.js';
export {default as SolariteUtil} from './Util.js';

// Deprecated:
//--------------
export {getArg, ArgType} from './getArg.js';
export {setArgs} from './getArg.js';
export {default as r} from './h.js';
import Template from './Template.js';
export function t(html) {
	return new Template([html], []);
}

//export {default as watch, renderWatched} from './watch.js'; // unfinished






// Internal:
//--------------
import Util from "./Util.js";
import Globals from "./Globals.js";

/**
 * Intercept the construct call to auto-define the class before the constructor is called. */
let HTMLElementAutoDefine = new Proxy(HTMLElement, {
	construct(Parent, args, Class) {

		// 1. Call customElements.define() automatically.
		Util.defineClass(Class);

		// 2. This line is equivalent the to super() call to HTMLElement:
		return Reflect.construct(Parent, args, Class);
	}
});

/**
 * Solarite provides more features if your web component extends Solarite instead of HTMLElement.
 *
 * Reasons to inherit from Solarite instead of HTMLElement.
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
 * @extends {HTMLElement} */
export class Solarite extends HTMLElementAutoDefine {

	/**
	 * @param attribs {?Record<string, any>} */
	constructor(attribs=null) {
		super();

		// 1. Populate attribs if it's an empty object.
		if (attribs) {
			if (typeof attribs !== 'object')
				throw new Error('First argument to custom element constructor must be an object.');

			if (attribs && !Object.keys(attribs).length) {
				let attribs2 =  Solarite.getAttribs(this);
				for (let name in attribs2) {
					attribs[name] = attribs2[name];
				}
			}
		}

		// 2. Wrap render function so it always provides the attribs argument.
		let originalRender = this.render;
		this.render = (attribs, changed=true) => {
			if (!attribs)
				attribs = Solarite.getAttribs(this);
			originalRender.call(this, attribs, changed);
		}
	}

	render() {
		throw new Error('render() is not defined for ' + this.constructor.name);
	}

	/**
	 * Call render() only if it hasn't already been called.	 */
	renderFirstTime() {
		if (!Globals.rendered.has(this)) {
			let attribs = Solarite.getAttribs(this);
			this.render(attribs); // calls Globals.rendered.add(this); inside the call to h()'...'.
		}
	}

	/**
	 * Called automatically by the browser. */
	connectedCallback() {
		this.renderFirstTime();
	}

	static define(tagName=null) {
		Util.defineClass(this, tagName);
	}

	static getAttribs(el) {
		let result = Util.attribsToObject(el);
		for (let name in result) {
			let val = result[name];
			if (val.startsWith('${') && val.endsWith('}'))
				result[name] = JSON.parse(val.slice(2, -1));
		}
		return result;
	}
}