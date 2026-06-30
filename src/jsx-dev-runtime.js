/** Dev entry point used by toolchains configured with the automatic runtime in development mode
 * (e.g. esbuild/tsc `jsxDEV`).  It re-exports the same runtime; the extra dev source args are
 * ignored. */
export { jsx, jsxs, jsxDEV, Fragment, jsxTemplate, jsxAttr, jsxEscape } from './jsx-runtime.js';
export { jsxDEV as jsxDEVRuntime } from './jsx-runtime.js';
