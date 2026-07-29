/**
 * Run rollup and terser on a javascript file and all of its dependencies.
 *
 * @example
 * # Creates output.js and output.min.js
 * deno run build.js input.js output.js
 *
 * ------------------------
 * How to create the dependencies for build.js  Tested with Rollup v2.23.0 and Terser 5.3.2
 * 1.  Start in a blank folder.
 * 2.  npm install rollup terser
 * 3.  npm install -g rollup terser
 * 4.  rollup node_modules/rollup/dist/shared/rollup.js > ./rollup2.js
 * 5.  terser ./rollup2.js > rollup.min.js
 * 6.  del rollup2.js
 * 7.  terser node_modules/terser/dist/bundle.min.js > ./terser.min.js
 * 8.  Modify line 2 of terser.min.js to replace require('source-map') with require('./source-map.min.js')
 * 9.  npm uninstall -g rollup terser
 * 10. Copy terser.min.js, rollup.min.js, and source-map.min.js to the lib folder, and delete our temporary working folder.
 *
 * After that, Deno is the only external dependency needed to build.
 */

const packageJson = JSON.parse(Deno.readTextFileSync(new URL('../package.json', import.meta.url)));

const rollupOptions = {
	onwarn: function (message) { // Suppress messages about external dependencies.
		if (message.code !== 'CIRCULAR_DEPENDENCY' && message.code !== 'EVAL')
			console.error(message);
	},
	treeshake: { // does nothing!
		preset: 'smallest',
		manualPureFunctions: ['assert']
	}
};
const terserOptions = {
	ecma: 8, // Decreases size.
	format: {
		preamble: `// Solarite v${packageJson.version} | MIT | eric-frost.github.io/solarite`,
		comments: false,
		wrap_func_args: false,
	},
	compress: { // https://github.com/terser/terser#compress-options
		passes: 5, // 3 gives the same result as 5.
		hoist_funs: true,
		unsafe_symbols: true,
		//hoist_vars: true, // Increases size
		module: true, // Output is an ES module (always strict): enables extra optimizations.
		toplevel: true, // Drop unused top-level functions/vars.
		keep_fargs: false, // Drop unused trailing function arguments.
		pure_getters: true,
		unsafe: true,
		unsafe_arrows: true,
		unsafe_comps: true,
		unsafe_Function: true,
		unsafe_math: true,
		unsafe_methods: true,
		unsafe_proto: true,
		unsafe_regexp: true,
		unsafe_undefined: true,
	},
	mangle: { // https://github.com/terser/terser#mangle-options
		//eval: true, // We use reserved words to not mangle names used in eval.
		toplevel: true, // Does nothing?
		properties: {
			builtins: false,
			keep_quoted: true,
			regex: /./,  // match all properties
			reserved: [
				'arguments',
				'prototype',
				'caller',
				'callee',
				'constructor',
				'handleEvent', // Looked up by name by addEventListener(name, object).
				'map', // Public API: h.map(), accessed by name in user code.
				'immutableMap', // Public API: h.immutableMap(), alias of h.map().
				// Public API: h.selector() and everything user code calls on what it returns.
				'selector',
				'when',
				'set',
				'key',
				'size',
				'value',
				// RenderOptions properties come from user-code object literals:
				'eventDelegation',
				'ids',
				'scripts',
				'styles',
				'render'
			],
			undeclared: true
		}
		//module: true, // Does nothing?
	}
}



// Code starts here:

const input = Deno.args[0];
const output = Deno.args[1];
const outputDebug = output.replace(/\.js$/, '-debug.js');
const outputMin = output.replace(/\.js$/, '.min.js');

// Import modules
import * as Rollup from './lib/rollup.min.js';
import * as Terser from "./lib/terser.min.js";

async function rollup(input, output, options) {
	options.input = input;
	const bundle = await Rollup.rollup(options);
	await bundle.write({ // https://rollupjs.org/guide/en/
		file: output,
		format: 'es'
	});
}

async function terser(options) {
	var code = Deno.readTextFileSync(outputDebug);

	// Remove //#IFDEBUG blocks.
	code = code.replace(/\/\/#IFDEBUG[\s\S]*?\/\/#ENDIF/gm, '');
	code = code.replace(/\/\*#IFDEBUG\*\/[\s\S]*?\/\*#ENDIF\*\//gm, '');

	Deno.writeTextFileSync(output, code);

	let idx = code.indexOf('#IFDEBUG')
	if (idx !== -1) {
		console.log(idx);
		console.log(code.slice(Math.max(idx-50, 0), idx+50));
		throw new Error('Unmatched #IFDEBUG block');
	}
	idx = code.indexOf('#ENDIF');
	if (idx !== -1) {
		console.log(code.slice(Math.max(idx-50, 0), idx+50));
		throw new Error('Unmatched #ENDIF block');
	}


	var result = await Terser.minify(code, options);
	Deno.writeTextFileSync(outputMin, result.code);

	writeJsxRuntime();

	let stats = Deno.statSync(output);
	let statsMin = Deno.statSync(outputMin);
	console.log(`Successfully created ${output} (${stats.size.toLocaleString()} bytes) ` +
		`and ${outputMin} (${statsMin.size.toLocaleString()} bytes).` );
}

/**
 * Write dist/jsx-runtime.js and dist/jsx-dev-runtime.js as thin re-exports of the main bundle.
 *
 * A toolchain configured with jsxImportSource:"solarite" injects `import {jsx} from
 * "solarite/jsx-runtime"` into every JSX file, so that specifier resolves alongside whatever the
 * app itself imported from "solarite".  Both must therefore reach the SAME module instance: they
 * share Globals, which holds the Shell cache, the connected WeakSet, elementClasses and htmlProps.
 * Pointing one at dist/ and the other at src/ gave a JSX project two of everything, and made its
 * second copy the unstripped source with every assert() live.  Re-exporting keeps it to one.
 */
function writeJsxRuntime() {
	let dir = output.replace(/[^/\\]+$/, '');
	let name = output.replace(/^.*[/\\]/, '');
	let header = '// Generated by build/build.js from src/jsx-runtime.js — do not edit.\n';

	// Take the source verbatim and repoint only its imports at the bundle.  Copying the file
	// rather than re-exporting it from the bundle keeps these six small functions OUT of the
	// main bundle, so a project that never writes JSX does not download them; measured at 182
	// gzipped bytes, which is worth keeping off everyone else's wire.  Rewriting rather than
	// hand-copying means src/jsx-runtime.js stays the single source of truth.
	let src = Deno.readTextFileSync('../src/jsx-runtime.js')
		.replace(/^import Template from "\.\/Template\.js";$/m,
			`import {Template} from './${name}';`)
		.replace(/^import \{JsxAttr, jsxToTemplate, Fragment\} from "\.\/jsx\.js";$/m,
			`import {InternalJsxAttr as JsxAttr, internalJsxToTemplate as jsxToTemplate,\n\tFragment} from './${name}';`);
	if (src.includes('./Template.js') || src.includes('./jsx.js'))
		throw new Error('jsx-runtime imports changed; update writeJsxRuntime() in build.js');

	Deno.writeTextFileSync(dir + 'jsx-runtime.js', header + src);
	Deno.writeTextFileSync(dir + 'jsx-dev-runtime.js', header +
		`export {jsx, jsxs, jsxDEV, Fragment, jsxTemplate, jsxAttr, jsxEscape} from './jsx-runtime.js';\n` +
		`export {jsxDEV as jsxDEVRuntime} from './jsx-runtime.js';\n`);
}


rollup(input, outputDebug, rollupOptions).then(() => {
	terser(terserOptions);
});
