/**
 * Solarite JavasCript UI library.
 * MIT License
 * https://vorticode.github.io/solarite/
 */
/** @jsx r */
/** @jsxFrag null */


import createSolarite from "./createSolarite.js";

/**
 * TODO: The Proxy and the multiple base classes mess up 'instanceof Solarite'
 * @type {Node|Class<HTMLElement>|function(tagName:string):Node|Class<HTMLElement>} */
let Solarite = new Proxy(createSolarite(), {
	apply(self, _, args) {
		return createSolarite(...args)
	}
});

import h from './h.js';
export default h;

/** @type {HTMLElement|Class} */
export {Solarite}
export {default as h, default as r} from './h.js';
export {getArg, ArgType} from './getArg.js';
export {default as Template} from './Template.js';
export {default as Globals} from './Globals.js';

import Util from './Util.js';
let getInputValue = Util.getInputValue;
export {getInputValue};
export {default as delve} from '../util/delve.js';
export {default as SolariteUtil} from './Util.js';

//Experimental:
//export {default as watch, renderWatched} from './watch.js'; // unfinished