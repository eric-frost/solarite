import getObjectId from "./getObjectId.js";

import {memoize, hashObject, hashObject64, hash64Cache, hashObjectJson, getObjectId3} from "./Util.js";

let htmlMap = new WeakMap();

/**
 * version of the template class that still has the old memoize function, If I ever want to compare hashing speed again.
 */
export default class Template {

	/** @type {string[]} Html strings.  Stored externally from object to speed up JSON serialization. */
	//get html() { return htmlMap.get(this) }


	/** @type {(Template|string|function)|(Template|string|function)[]} Evaulated expressions.  */
	exprs = []

	html = [];

	hashedFields;

	/**
	 *
	 * @param htmlStrings {string}
	 * @param exprs {*[]} */
	constructor(htmlStrings, exprs) {
		//htmlMap.set(this, htmlStrings)
		this.html = htmlStrings;
		this.exprs = exprs;

		this.hashedFields = [getObjectId(htmlStrings), exprs]

		//#IFDEV
		Object.defineProperty(this, 'debug', {
			get() {
				return this.memoize();
			}
		})
		//#ENDIF
	}

	/**
	 * Called by JSON.serialize when it encounters a Template.
	 * This prevents the hashed version from being too large.
	 * @returns {*}
	 */
	toJSON() {
		return this.hashedFields
	}

	memoize() {

		// Slower
		// let result2 = hashObject64(this)
		// return result2[0].toString(16) + result2[1].toString(16);

		// This version is slower but includes the full html in the template and can help with debugging:
		//#IFDEV
		// let exprLength = this.exprs.length;
		// let l = this.html.length + exprLength;
		// let result = new Array(l);
		// for (let i=0; i<exprLength; i++) {
		// 	result[i*2] = this.html[i];
		// 	result[i*2+1] = '${' + s(this.exprs[i]) + '}'
		// }
		// result[result.length-1] = this.html[this.html.length-1];
		//
		// return result.join('')
		//#ENDIF

		// Speed up most common case:
		if (this.exprs.length === 1)
			return memoizeValue(this.exprs[0]) + '\f' + this.htmlId // \f is the "Form feed" control character, unlikely to be usedin regular text.

		let exprLength = this.exprs.length;
		let result = new Array(exprLength+1);
		let exprs = this.exprs;
		for (let i=0; i<exprLength; i++) {
			result[i] = memoizeValue(exprs[i])
		}
		result[result.length] = this.htmlId;

		return result.join('\f')
	}

	getCloseKey() {
		// Use the joined html when debugging?
		//return '@'+this.html.join('|')

		return '@'+this.hashedFields[0];
	}
}




function memoizeValue(val) {
	if (typeof val === 'string')
		return val;
	else if (Array.isArray(val))
		return '[' + val.map(v => memoizeValue(v)) + `]`; // join(',') is implicitly called here.
	else if (val && val.memoize) // is another Template
		return 'T('+val.memoize()+')'
	else
		return memoize(val); // TODO: This might not differentiate between 1 and '1'

}