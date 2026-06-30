/** babel-plugin-solarite — compiles JSX/TSX to Solarite precompile output.
 *
 * The default export is the Babel plugin, so `{ "plugins": ["babel-plugin-solarite"] }` works in a
 * Babel config.  The named `transform` runs Babel for you (it adds JSX/TS parsing and returns the
 * compiled code); vite-plugin-solarite and esbuild-plugin-solarite both build on it. */
export { default } from './babel-plugin.js';
export { transform } from './transform.js';
