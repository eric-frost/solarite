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
export {default as delve} from './delve.js';
export {default as Template} from './Template.js';
export {default as toEl} from './toEl.js';
import Template from './Template.js';

// Experimental:
//--------------
export {default as Globals} from './Globals.js';
export {default as SolariteUtil} from './Util.js';

// Deprecated:
//--------------
export {default as h} from './h.js'; // Named exports for h() are deprecated.
export {getArg, ArgType} from './getArg.js';
export {setArgs} from './getArg.js';
export {default as r} from './h.js';
export function t(html) {
	return new Template([html], []);
}
//export {default as watch, renderWatched} from './watch.js'; // unfinished

// Only used for tests:
//--------------
export {default as HtmlParser} from './HtmlParser.js';
export {default as NodeGroup} from './NodeGroup.js';
export {default as Shell} from './Shell.js';





// Solarite Class:
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
 * 3.  Populates the attribs argument to the constructor when instantiated from regular html outside a template string.
 *         It parses JSON from DOM attribute values surrouned with '${...}'
 * 4.  Shows an error if render() isn't defined.
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

		if (attribs) {
			if (typeof attribs !== 'object')
				throw new Error('First argument to custom element constructor must be an object.');

			// 1. Populate attribs if it's an empty object.
			if (attribs && !Object.keys(attribs).length) {
				let attribs2 =  Solarite.getAttribs(this);
				for (let name in attribs2) {
					attribs[name] = attribs2[name];
				}
			}

			// 2. Populate fields from attribs.
			// This does nothing because the fields are overwritten by the child class after this super() constructor executes.
			//for (let name in attribs || {}) {
			//	if (name in this) {
			//		const descriptor = Object.getOwnPropertyDescriptor(this, name);
			//		if (!descriptor || descriptor.writable || descriptor.set)
			//			this[name] = attribs[name];
			//	}
			//}
		}

		// 3. Wrap render function so it always provides the attribs argument.
		// Disabled because this gives us strings for attribute values when we call render manually.
		// Instead of values given from ${...} expressions.
		// let originalRender = this.render;
		// this.render = (attribs, changed=true) => {
		// 	if (!attribs) // If we have to look up the attribs, we don't know if they changed or not.
		// 		attribs = Solarite.getAttribs(this);
		// 	originalRender.call(this, attribs, changed);
		// }
	}

	'render'() {
		throw new Error('render() is not defined for ' + this.constructor.name);
	}

	/**
	 * Call render() only if it hasn't already been called.	 */
	'renderFirstTime'() {
		if (!Globals.rendered.has(this)) {
			let attribs = Solarite.getAttribs(this);
			this.render(attribs); // calls Globals.rendered.add(this); inside the call to h()'...'.
		}
	}

	/**
	 * Called automatically by the browser. */
	'connectedCallback'() { // quoted so terser doesn't remove it.
		this.renderFirstTime();
	}

	static 'define'(tagName=null) {
		Util.defineClass(this, tagName);
	}

	static 'getAttribs'(el) {
		let result = Util.attribsToObject(el);
		for (let name in result) {
			let val = result[name];
			if (val.startsWith('${') && val.endsWith('}'))
				result[name] = JSON.parse(val.slice(2, -1));
		}
		return result;
	}


	// TODO: Do we want to use this to get the tag name from the render() function, instead of having the user define it?
	/**
	 * Get the tag name for a class, as defined by the tag used in render().
	 *
	 * This will parse the JavaScript code of the render() function to find the tag name.
	 * It will itarage every character, keeping track of quotes and comments so it can
	 * skip them until it finds the tag name passed to h(this)`<tagname>` inside the render() function.
	 *
	 * */
	/*
	static getTagName(Class) {
		let code = Class.prototype.render.toString();
		let i = 0;
		while (i < code.length) {
			let char = code[i];
			let next = code[i + 1];

			// Skip single line comments
			if (char === '/' && next === '/') {
				i = code.indexOf('\n', i);
				if (i === -1) break;
				continue;
			}
			// Skip multi-line comments
			if (char === '/' && next === '*') {
				i = code.indexOf('*'+'/', i + 2);
				if (i === -1) break;
				i += 2;
				continue;
			}
			// Skip strings and template literals
			if (char === "'" || char === '"' || char === '`') {
				let quote = char;
				i++;
				while (i < code.length) {
					if (code[i] === '\\') i += 2;
					else if (code[i] === quote) { i++; break; }
					else i++;
				}
				continue;
			}
			// Skip regex literals (simple heuristic)
			if (char === '/') {
				let prev = code.slice(Math.max(0, i - 10), i).trim();
				// If / is preceded by something that indicates an operator or start of expression
				if (/[=(,;:[!&|?]$|return$|yield$|case$/.test(prev)) {
					i++;
					while (i < code.length) {
						if (code[i] === '\\') i += 2;
						else if (code[i] === '[') { // Skip character classes
							i++;
							while (i < code.length && code[i] !== ']') {
								if (code[i] === '\\') i += 2;
								else i++;
							}
							i++;
						}
						else if (code[i] === '/') { i++; break; }
						else i++;
					}
					continue;
				}
			}
			// Check for h(this)`
			if (char === 'h' && code.slice(i, i + 8) === 'h(this)`') {
				i += 8;
				// We are now inside the template literal.
				// Skip whitespace and HTML comments
				while (i < code.length) {
					// Skip JS template literal end (shouldn't happen before tag, but for safety)
					if (code[i] === '`') return null;

					// Skip whitespace
					if (/\s/.test(code[i])) { i++; continue; }

					// Skip HTML comments <!-- ... -->
					if (code.slice(i, i + 4) === '<!--') {
						i = code.indexOf('-->', i + 4);
						if (i === -1) return null;
						i += 3;
						continue;
					}

					// Find the first tag
					if (code[i] === '<') {
						let start = ++i;
						while (i < code.length && /[a-zA-Z0-9-]/.test(code[i])) i++;
						return code.slice(start, i);
					}

					// If we encounter anything else (like text before a tag),
					// we can keep looking or return null depending on how strict we want to be.
					// For now, let's just skip non-tag characters.
					i++;
				}
			}
			i++;
		}
		return null;
	}
	*/
}


/**
 * Assign fields from `src` to `dest` if they exist in `dest` and their names are not in the `ignore` list.
 * When a value in `src` is a string and the existing value in `dest` is a boolean, number, or Date,
 * it will be converted to that type.
 * This is often used in class constructors that accept an object of arguments.
 * @param {object} dest
 * @param {?object} src
 * @param {string[]} [ignore=[]] */
export function assignFields(dest, src, ignore=[]) {
	for (let name in src || {}) {
		if (name in dest && !ignore.includes(name)) {
			const descriptor = Object.getOwnPropertyDescriptor(dest, name)
				|| Object.getOwnPropertyDescriptor(Object.getPrototypeOf(dest), name); // Also find (parent?) setters.  Is this necssary?
			if (!descriptor || descriptor.writable || descriptor.set) {
				let srcVal = src[name];
				let destVal = dest[name];
				if (typeof src[name] === 'string') {
					if (typeof destVal === 'boolean') // empty string (when an attribute is present with no value) is true
						dest[name] = ![false, 'false', 0, '0'].includes(srcVal);
					else if (typeof destVal === 'number')
						dest[name] = Number(srcVal);
					else if (destVal instanceof Date) {
						dest[name] = new Date(srcVal); // TODO: read it as UTC 0 by default.
					}
					else
						dest[name] = srcVal;
				}
				else
					dest[name] = srcVal;
			}
		}
	}
}
