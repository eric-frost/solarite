import Util from "./Util.js";

/**
 * Convert an attribute string with the given converter: Number, Boolean, String, Date,
 * or any function taking the string and returning a value.  Boolean is true for any string
 * except 'false' and '0', so a bare attribute like `<my-timer auto-start>` reads as true.
 * Date uses new Date(value).  No converter returns the string unchanged. */
export function convertType(value, type) {
	if (type === Date)
		return new Date(value);
	if (type === Boolean)
		return !['false', '0'].includes(value);
	if (type === Number)
		return Number(value);
	if (type === String)
		return String(value);
	if (type) // custom string=>value function
		return type(value);
	return value;
}

/**
 * Read an element's html attributes onto fields that already exist on the element.
 * Typically called from a web component constructor to support plain-html instantiation
 * like `<my-timer duration="7" auto-start>`.  Tagged-template values are already typed and
 * arrive in the constructor's argument instead, so assign those directly.
 *
 * Attribute names convert from kebab-case to camelCase, so `auto-start` becomes `autoStart`.
 * An attribute written like `${...}` is JSON-parsed back to its original type and assigned
 * as-is.  Every other attribute value is a string: if its field is named in `types`, the
 * string is cast with that converter, otherwise it's assigned as a string.
 *
 * `types` maps a field name to a converter: Number, Boolean, String, Date, or any function
 * taking the string and returning a value.  Boolean is true for any string except 'false'
 * and '0', so a bare attribute like `<my-timer auto-start>` reads as true.  Date uses
 * new Date(value).  No type is inferred from the field's existing value.
 *
 * Field names listed in `ignore` are skipped.
 * @param dest {HTMLElement}
 * @param types {Object<string, Function>}
 * @param ignore {string[]} */
export function assignAttributes(dest, types={}, ignore=[]) {
	for (let attrib of dest.attributes) {
		let name = Util.dashesToCamel(attrib.name);
		if (!(name in dest) || ignore.includes(name))
			continue;

		let value = attrib.value;
		let type = types[name];

		// 1. A `${...}` attribute holds an already-typed JSON value.
		if (value.startsWith('${') && value.endsWith('}'))
			dest[name] = JSON.parse(value.slice(2, -1));

		// 2. Cast the string with the converter named in `types`, if any.
		else if (type)
			dest[name] = convertType(value, type);

		// 3. No converter named: assign the raw string.  But an empty value over a function/object
		// field is just the serialization residue of a template expression (functions render as
		// attribute="") — skip it, or it clobbers the real value the expression already assigned.
		else if (value !== '' || !(typeof dest[name] === 'function' || (typeof dest[name] === 'object' && dest[name] !== null)))
			dest[name] = value;
	}
}
