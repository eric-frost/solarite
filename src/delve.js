/**
 * Follow a path into an object.
 * @param obj {object}
 * @param path {string[]}
 * @param createVal {*}  If set, non-existent paths will be created and value at path will be set to createVal.
 * @return {*} The value, or undefined if it can't be reached. */
export default function delve(obj, path, createVal = d) {
	let isCreate = createVal !== d;

	let len = path.length;
	if (!obj && !isCreate && len)
		return undefined;

	let i = 0;
	for (let srcProp of path) {

		// If the path is undefined and we're not to the end yet:
		if (obj[srcProp] === undefined) {

			// If the next index is an integer or integer string.
			if (isCreate) {
				if (i < len - 1) {
					// If next level path is a number, create as an array
					let isArray = (path[i + 1] + '').match(/^\d+$/);
					obj[srcProp] = isArray ? [] : {};
				}
			} else
				return undefined; // can't traverse
		}

		// If last item in path
		if (isCreate && i === len - 1)
			obj[srcProp] = createVal;

		// Traverse deeper along destination object.
		obj = obj[srcProp];
		i++;
	}

	return obj;
}


/**
 * Is it an array and a path that can be evaluated by delve() ?
 * We allow the first element to be null/undefined so binding can report errors.
 *
 * The rest is tested by a loop that stops at the first element that is not a string or a number,
 * so [obj, null] is not a path.  A parent passes every array it gives a child component through
 * here on every render, an array of 10,000 row objects included, and the loop looks at its second
 * element and stops, where a slice() would copy the whole array first.
 * @param arr {Array|*}
 * @returns {boolean} */
export function isDelvePath(arr) {
	// An array of at least two elements, whose first is an object, null, or undefined.
	if (!Array.isArray(arr) || arr.length < 2 || (typeof arr[0] !== 'object' && arr[0] !== undefined))
		return false;

	// Then only numbers and strings.
	for (let i = 1; i < arr.length; i++)
		if (typeof arr[i] !== 'string' && typeof arr[i] !== 'number')
			return false;
	return true;
}

// d means "don't create"
let d = {};