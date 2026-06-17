/*
┏┓  ┓    •
┗┓┏┓┃┏┓┏┓┓╋▗▖
┗┛┗┛┗┗┻╹ ╹╹┗
JavaScript UI library
@license MIT
@copyright Vorticode LLC
https://vorticode.github.io/solarite/ */

/**
 * Cast targets for assignFields().  Each value is also a valid string literal,
 * so `Cast.int` is interchangeable with `'int'`. */
export const Cast = Object.freeze({
	int: 'int',
	float: 'float',
	number: 'number',
	boolean: 'boolean',
	string: 'string',
});

const getConstructor = c =>
	typeof c === 'function' ? c : (window[c] || customElements.get(c));

/**
 * Assign fields from `src` to `dest`, but only for fields that already exist on `dest`.
 * Typically used in constructors that accept an object of arguments.
 *
 * `cast` is an optional record keyed by field name:
 * - Ignore a field: use `false`.
 * - Basic casting: use a `Cast` value (`Cast.int`, `Cast.float`, `Cast.number`, `Cast.boolean`, `Cast.string`).
 * - Class casting: pass a class constructor or its string name to instantiate the field.
 * - Array casting: use `[Class]` or `'Class[]'`; the source must be an array.
 *
 * Auto-casting only applies to string sources: when a field has no `cast` entry and its
 * source value is a string, the string is cast to the destination field's current type
 * (number, boolean, or Date).  This is meant for values parsed from HTML attributes, which
 * always arrive as strings.  Non-string sources are assigned as-is unless an explicit `cast`
 * is given, and `null`/`undefined` are never coerced (e.g. `String(null) === 'null'`).
 *
 * If `strict` is true, throw when a `src` field is neither in `dest` nor ignored via `cast`.
 * @param {object} dest
 * @param {?object} src
 * @param {Record<string, string|Function|boolean>} [cast={}]
 * @param {boolean} [strict=false] */
export function assignFields(dest, src, cast={}, strict=false) {
	for (let name in src || {}) {

		// Ignore fields disabled via cast, or not present on dest.
		if (cast[name] === false)
			continue;
		if (!(name in dest)) {
			if (strict)
				throw new Error(`assignFields: unknown field '${name}'.`);
			continue;
		}

		// Skip properties that aren't writable and have no setter.
		const desc = Object.getOwnPropertyDescriptor(dest, name)
			|| Object.getOwnPropertyDescriptor(Object.getPrototypeOf(dest), name);
		if (desc && !desc.writable && !desc.set)
			continue;

		let srcVal = src[name];

		// Explicit cast from `cast`, else auto-derive from the destination's type — but
		// auto-casting only applies to string sources (e.g. parsed HTML attributes).
		let castVal = name in cast
			? cast[name]
			: (typeof srcVal === 'string' ? typeof dest[name] : null);

		// Never coerce null/undefined.
		if (castVal != null && srcVal != null) {

			// Array Casting: [Class] or 'Class[]'
			let arrayCast = Array.isArray(castVal) && castVal.length === 1
				? castVal[0]
				: (typeof castVal === 'string' && castVal.endsWith('[]')
					? castVal.slice(0, -2)
					: null);

			if (arrayCast) {
				if (!Array.isArray(srcVal))
					throw new Error(`Field ${name} must be an array.`);
				let constructor = getConstructor(arrayCast);
				srcVal = srcVal.map(v => (constructor && !(v instanceof constructor)) ? new constructor(v) : v);
			}

			// Basic Type Casting
			else if (castVal === Cast.int)
				srcVal = parseInt(srcVal);
			else if (castVal === Cast.float || castVal === Cast.number)
				srcVal = Number(srcVal);
			else if (castVal === Cast.boolean)
				srcVal = ![false, 'false', 0, '0'].includes(srcVal);
			else if (castVal === Cast.string)
				srcVal = String(srcVal);

			// Class or Date Casting
			else {
				let constructor = getConstructor(castVal);
				if (constructor && !(srcVal instanceof constructor))
					srcVal = new constructor(srcVal);
				else if (dest[name] instanceof Date && !(srcVal instanceof Date))
					srcVal = new Date(srcVal);
			}
		}

		dest[name] = srcVal;
	}
}
