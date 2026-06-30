/**
 * Core transform: JSX/TSX source -> Tier 1 precompile JS, using the babel-plugin-solarite plugin.
 * Strips TypeScript types too, so .tsx works without a separate tsc pass. */
import { transformSync } from '@babel/core';
import solariteJsx from './babel-plugin.js';

/**
 * @param {string} code Source code.
 * @param {object} [opts]
 * @param {string} [opts.filename] Used to pick ts/tsx parsing and for sourcemaps.
 * @param {string} [opts.importSource] Runtime module specifier (default "solarite/jsx-runtime").
 * @param {boolean} [opts.sourceMaps] Emit a sourcemap.
 * @returns {{code: string, map: object|null}} */
export function transform(code, opts = {}) {
	const filename = opts.filename || 'input.tsx';
	const isTs = /\.(ts|tsx|mts|cts)$/.test(filename);

	// preset-typescript strips TS types (parsing alone keeps them); it also sets up JSX parsing.
	// For plain .jsx we add the jsx parser plugin ourselves.
	// preset-typescript strips TS types (parsing alone keeps them).  We always enable the jsx parser
	// plugin so both .jsx and .tsx parse JSX; the preset removes the TypeScript syntax for .ts/.tsx.
	const presets = isTs ? ['@babel/preset-typescript'] : [];

	const result = transformSync(code, {
		filename,
		babelrc: false,
		configFile: false,
		sourceMaps: opts.sourceMaps || false,
		parserOpts: { plugins: ['jsx'] },
		presets,
		plugins: [[solariteJsx, { importSource: opts.importSource }]],
	});
	return { code: result.code, map: result.map || null };
}

export default transform;
