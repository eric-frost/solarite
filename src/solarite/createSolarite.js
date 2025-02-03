import Util from "../util/Util.js";
//import {assert} from "../util/Errors.js";
import delve from "../util/delve.js";
import {getArg, ArgType} from "./getArg.js";
import {getObjectHash} from "./hash.js";
//import NodeGroupManager from "./NodeGroupManager.js";
import r from "./r.js";
import {camelToDashes} from "./Util.js";
import Globals from "./Globals.js";


//import {watchGet, watchSet} from "./watch.js";



function defineClass(Class, tagName, extendsTag) {
	if (!customElements.getName(Class)) { // If not previously defined.
		tagName = tagName || camelToDashes(Class.name)
		if (!tagName.includes('-'))
			tagName += '-element';

		let options = null;
		if (extendsTag)
			options = {extends: extendsTag}

		customElements.define(tagName, Class, options)
	}
}





/**
 * Create a version of the Solarite class that extends from the given tag name.
 * Reasons to inherit from this instead of HTMLElement.  None of these are all that useful.
 * 1.  customElements.define() is called automatically when you create the first instance.
 * 2.  Calls render() when added to the DOM, if it hasn't been called already.
 * 3.  Child elements are added before constructor is called.  But they're also passed to the constructor.
 * 4.  We can use this.html = r`...` to set html.
 * 5.  We have the onConnect, onFirstConnect, and onDisconnect methods.
 *     Can't figure out how to have these work standalone though, and still be synchronous.
 * 6.  Can we extend from other element types like TR?
 * 7.  Shows default text if render() function isn't defined.
 *
 * Advantages to inheriting from HTMLElement
 * 1.  Minimization won't break when it renames the Class and we call customElements.define() on the wrong name.
 * 2.  We can inherit from things like HTMLTableRowElement directly.
 * 3.  There's less magic, since everyone is familiar with defining custom elements.
 *
 * @param extendsTag {?string}
 * @return {Class} */
export default function createSolarite(extendsTag=null) {

	let BaseClass = HTMLElement;
	if (extendsTag && !extendsTag.includes('-')) {
		extendsTag = extendsTag.toLowerCase();

		BaseClass = Globals.elementClasses[extendsTag];
		if (!BaseClass) { // TODO: Use Cache
			BaseClass = document.createElement(extendsTag).constructor;
			Globals.elementClasses[extendsTag] = BaseClass
		}
	}

	/**
	 * Intercept the construct call to auto-define the class before the constructor is called.
	 * @type {HTMLElement} */
	let HTMLElementAutoDefine = new Proxy(BaseClass, {
		construct(Parent, args, Class) {
			defineClass(Class, null, extendsTag)

			// This is a good place to manipulate any args before they're sent to the constructor.
			// Such as loading them from attributes, if I could find a way to do so.

			// This line is equivalent the to super() call.
			return Reflect.construct(Parent, args, Class);
		}
	});

	return class Solarite extends HTMLElementAutoDefine {
		
		
		/**
		 * TODO: Make these standalone functions.
		 * Callbacks.
		 * Use onConnect.push(() => ...); to add new callbacks. */
		onConnect = Util.callback();
		
		onFirstConnect = Util.callback();
		onDisconnect = Util.callback();

		/**
		 * @param options {RenderOptions} */
		constructor(options={}) {
			super();

			// TODO: Is options.render ever used?
			if (options.render===true)
				this.render();

			else if (options.render===false)
				Globals.rendered.add(this); // Don't render on connectedCallback()

			// Add slot children before constructor code executes.
			// This breaks the styleStaticNested test.
			// PendingChildren is setup in NodeGroup.createNewComponent()
			// TODO: Match named slots.
			//let ch = Globals.pendingChildren.pop();
			//if (ch) // TODO: how could there be a slot before render is called?
			//	(this.querySelector('slot') || this).append(...ch);

			/** @deprecated */
			Object.defineProperty(this, 'html', {
				set(html) {
					Globals.rendered.add(this);
					if (typeof html === 'string') {
						console.warn("Assigning to this.html without the r template prefix.")
						this.innerHTML = html;
					}
					else
						this.modifications = r(this, html, options);
				}
			})

			/*
			let pthis = new Proxy(this, {
				get(obj, prop) {
					return Reflect.get(obj, prop)
				}
			});
			this.render = this.render.bind(pthis);
			*/
		}

		/**
		 * Call render() only if it hasn't already been called.	 */
		renderFirstTime() {
			if (!Globals.rendered.has(this) && this.render)
				this.render();
		}
		
		/**
		 * Called automatically by the browser. */
		connectedCallback() {
			this.renderFirstTime();
			if (!Globals.connected.has(this)) {
				Globals.connected.add(this);
				this.onFirstConnect();
			}
			this.onConnect();
		}
		
		disconnectedCallback() {
			this.onDisconnect();
		}


		static define(tagName=null) {
			defineClass(this, tagName, extendsTag)
		}

		//#IFDEV
		
		/**
		 * @deprecated Use the getArg() function instead. */
		getArg(name, val=null, type=ArgType.String) {
			throw new Error('deprecated');
			return getArg(this, name, val, type);
		}
		//#ENDIF
	}
}

