/**
 * Run rollup and terser on a javascript file and all of its dependencies.
 *
 * @example
 * # Creates output.js and output.min.js
 * node build input.js output.js
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
 * After that, node.js is the only external dependency needed to build.
 */

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
		preamble: `// Version ${timestamp()}\r\n// License: MIT\r\n// https://github.com/vorticode/Solarite`,
	},
	compress: { // https://github.com/terser/terser#compress-options
		passes: 5,
		//hoist_funs: true, // Increases size
		//hoist_vars: true, // Increases size
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
			regex: /_$/,
			undeclared: true, // Does nothing?
		}
		//module: true, // Does nothing?
	}
}



// Code starts here:

const input = process.argv[2];
const output = process.argv[3];
const outputDebug = output.replace(/\.js$/, '-debug.js');
const outputMin = output.replace(/\.js$/, '.min.js');

const fs = require('fs');
const Rollup = require('./lib/rollup.min.js');
const Terser = require("./lib/terser.min.js");

/*
// Deno version (Unsupported)
const input = Deno.args[0];
const output = Deno.args[1];
const outputMin = output.replace(/\.js$/, '.min.js');

import './lib/rollup.min.js';
import "./lib/terser.min.js";
*/

async function rollup(input, output, options) {
	options.input = input;
	const bundle = await Rollup.rollup(options);
	await bundle.write({ // https://rollupjs.org/guide/en/
		file: output,
		format: 'es'
	});
}

function timestamp() {
	let d = new Date();
	return d.getUTCFullYear() +
		'.' + (d.getUTCMonth()+1) +
		'.' + d.getUTCDate() +
		'.' + (d.getUTCHours()+'').padStart(2, '0') + (d.getUTCMinutes()+'').padStart(2, '0')
}

async function terser(options) {
	var code = [fs.readFileSync(outputDebug)].join('');

	// Remove //#IFDEV blocks.
	code = code.replace(/\/\/#IFDEV[\s\S]*?\/\/#ENDIF/gm, '');
	code = code.replace(/\/\*#IFDEV\*\/[\s\S]*?\/\*#ENDIF\*\//gm, '');

	fs.writeFileSync(output, code);

	let idx = code.indexOf('#IFDEV')
	if (idx !== -1) {
		console.log(idx);
		console.log(code.slice(Math.max(idx-50, 0), idx+50));
		throw new Error('Unmatched #IFDEV block');
	}
	idx = code.indexOf('#ENDIF');
	if (idx !== -1) {
		console.log(code.slice(Math.max(idx-50, 0), idx+50));
		throw new Error('Unmatched #ENDIF block');
	}


	var result = await Terser.minify(code, options);
	fs.writeFileSync(outputMin, result.code);

	let stats = fs.statSync(output);
	let statsMin = fs.statSync(outputMin);
	console.log(`Successfully created ${output} (${stats.size.toLocaleString()} bytes) ` +
		`and ${outputMin} (${statsMin.size.toLocaleString()} bytes).` );
}


rollup(input, outputDebug, rollupOptions).then(() => {
	terser(terserOptions);
});