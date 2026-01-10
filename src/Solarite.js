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
export {default as delve} from './delve.js';
export {getArg, ArgType} from './getArg.js';
export {default as Template} from './Template.js';
export {default as toEl} from './toEl.js';


// Experimental:
//--------------
export {default as Solarite} from './createSolarite.js';
export {setArgs} from './getArg.js';
export {default as Globals} from './Globals.js';
export {default as SolariteUtil} from './Util.js';

//export {default as watch, renderWatched} from './watch.js'; // unfinished