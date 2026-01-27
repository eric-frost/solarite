import Util from "./Util.js";


/**
 * @deprecated Inherit from Solarite and pass arribs to super() instead.
 * There are three ways to create an instance of a Solarite Component:
 * 1.  new ComponentName(3);                                               // direct class instantiation
 * 2.  h(this)`<div><component-name user-id=${3}></component-name></div>;  // as a child of another Component.
 * 3.  <body><component-name user-id="3"></component-name></body>          // in the Document html.
 *
 * When created via #3, Solarite has no way to pass attributes as arguments to the constructor.  So to make
 * sure we get the correct value via all three paths, we write our constructors according to the following
 * example.  Note that constructor args are embedded in an object, and must be all lower-case because
 * Browsers make all html attribute names lowercase.
 *
 * @example
 * constructor({name, userId=1}={}) {
 *     super();
 *
 *     // Get value from "name" attriute if persent, otherwise from name constructor arg.
 *     this.name = getArg(this, 'name', name);
 *
 *     // Optionally convert the value to an integer.
 *     this.userId = getArg(this, 'user-id', userId, ArgType.Int);
 * }
 *
 * @param el {HTMLElement}
 * @param attributeName {string} Attribute name.  Not case-sensitive.
 * @param defaultValue {*} Default value to use if attribute doesn't exist.  Typically the argument from the constructor.
 * @param type {ArgType|function|Class|*[]}
 *     If an array, use the value if it's in the array, otherwise return undefined.
 *     If it's a function, pass the value to the function and return the result.
 * @return {*} Undefined if attribute isn't set and there's no defaultValue, or if the value couldn't be parsed as the type.  */
export function getArg(el, attributeName, defaultValue=undefined, type=ArgType.String) {
	let val = defaultValue;
	let attrVal = el.getAttribute(attributeName) || el.getAttribute(Util.camelToDashes(attributeName));
	if (attrVal !== null) // If attribute doesn't exist.
		val = attrVal;

	if (Array.isArray(type))
		return type.includes(val) ? val : undefined;

	if (typeof type === 'function') {
		return type.constructor
			? new type(val) // arg type is custom Class
			: type(val); // arg type is custom function
	}

	// If bool, it's true as long as it exists and its value isn't falsey.
	if (type===ArgType.Bool) {
		let lAttrVal = typeof val === 'string' ? val.toLowerCase() : val;
		if (['false', '0', false, 0, null, undefined, NaN].includes(lAttrVal))
			return false;
		if (['true', true].includes(lAttrVal) || parseFloat(lAttrVal) !== 0)
			return true;
		return undefined;
	}

	// Attribute doesn't exist
	switch (type) {
		case ArgType.Int:
			return parseInt(val);
		case ArgType.Float:
			return parseFloat(val);
		case ArgType.String:
			return [undefined, null, false].includes(val) ? '' : (val+'');
		case ArgType.Json:
		case ArgType.Eval:
			if (typeof val === 'string' && val.length)
				try {
					if (type === ArgType.Json)
						return JSON.parse(val);
					else
						return eval(`(${val})`);
				} catch (e) {
					return val;
				}
			else return val;

		// type not provided
		default:
			return val;
	}
}


/**
 * @deprecated
 * Experimental.  Set multiple arguments/attributes all at once.
 * @param el {HTMLElement}
 * @param args {Record<string, any>}
 * @param types {Record<string, ArgType|function|Class>}
 *
 * @example
 * constructor({user, path}={}) {
 *     setArgs(this, arguments[0], {user: User, path: ArgType.String});
 *
 *     // Equivalent to:
 *     this.user = getArg(this, user, 'user', User); // or new User(user);
 *     this.path = getArg(this, path, 'path', ArgType.String);
 * }
 */
export function setArgs(el, args, types) {
	for (let name in args)
		this[name] = getArg(el, name, args[name], types[name] || ArgType.String);
}


/**
 * @enum */
var ArgType = {

	/**
	 * false, 0, null, undefined, '0', and 'false' (case-insensitive) become false.
	 * Anything else, including empty string becomes true.
	 * Empty string is true because attributes with no value should be evaulated as true. */
	Bool: 'Bool',

	Int: 'Int',
	Float: 'Float',
	String: 'String',

	/** @deprecated for Json */
	JSON: 'Json',

	/**
	 * Parse the string value as JSON.
	 * If it's not parsable, return the value as a string. */
	Json: 'Json',

	/**
	 * Evaluate the string as JavaScript using the eval() function.
	 * If it can't be evaluated, return the original string. */
	Eval: 'Eval'
}
export {ArgType};