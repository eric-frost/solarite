#!/usr/bin/env node
/** Standalone CLI: `solarite-jsx <file.tsx>` prints Tier 1 precompile JS to stdout (TS types
 * stripped).  Lets non-Node-bundler hosts — e.g. a PHP/Apache wrapper mapping .tsx/.jsx requests —
 * shell out for Tier 1 output, which esbuild's binary CLI can't produce. */
import fs from 'node:fs';
import { transform } from './transform.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('-'));
if (!file) {
	process.stderr.write('usage: solarite-jsx <file.jsx|.tsx> [--import-source=solarite/jsx-runtime]\n');
	process.exit(1);
}
const importSourceArg = args.find(a => a.startsWith('--import-source='));
const source = fs.readFileSync(file, 'utf8');
const { code } = transform(source, {
	filename: file,
	importSource: importSourceArg ? importSourceArg.split('=')[1] : undefined,
});
process.stdout.write(code);
