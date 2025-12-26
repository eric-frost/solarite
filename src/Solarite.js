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
export {default as h, default as r} from './h.js'; //Named exports for h() are deprecated.
export {getArg, ArgType} from './getArg.js';
export {default as Template} from './Template.js';
export {default as toEl} from './toEl.js';


// Experimental:
//--------------
export {setArgs} from './getArg.js';

import createSolarite from "./createSolarite.js";

/**
 * TODO: The Proxy and the multiple base classes mess up 'instanceof Solarite'
 * @type {Node|Class<HTMLElement>|function(tagName:string):Node|Class<HTMLElement>} */
const Solarite = new Proxy(createSolarite(), {
	apply(self, _, args) {
		return createSolarite(...args)
	}
});


/** @type {HTMLElement|Class} */
export {Solarite}
export {default as Globals} from './Globals.js';
export {default as SolariteUtil} from './Util.js';

//export {default as watch, renderWatched} from './watch.js'; // unfinished