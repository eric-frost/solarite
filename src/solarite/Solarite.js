/**
 * Solarite JavasCript UI library.
 * MIT License
 * https://vorticode.github.io/solarite/
 */


import createSolarite from "./createSolarite.js";

/**
 * TODO: The Proxy and the multiple base classes mess up 'instanceof Solarite'
 * @type {Node|Class<HTMLElement>|function(tagName:string):Node|Class<HTMLElement>} */
let Solarite = new Proxy(createSolarite(), {
	apply(self, _, args) {
		return createSolarite(...args)
	}
});


/** @type {HTMLElement|Class} */
export {Solarite}
export {default as r} from './r.js';
export {getArg, ArgType} from './getArg.js';
export {default as Template} from './Template.js';
export {default as Globals} from './Globals.js';

import Util from './Util.js';
let getInputValue = Util.getInputValue;
export {getInputValue};
export {default as delve} from '../util/delve.js';

//Experimental:
//export {forEach, watchGet, watchSet} from './watch.js' // old, unfinished
//export {watch} from './watch2.js'; // unfinished