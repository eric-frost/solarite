/** Adapter tests for esbuild-plugin-solarite.  Run: `node test.js` (or `npm test`).
 *
 * The plugin is a thin onLoad adapter over babel-plugin-solarite's transform(), and that transform
 * already has its own tests, so what's checked here is only the wiring: which files the plugin
 * claims, what it hands back to the bundler, and how it forwards options.
 *
 * esbuild itself is deliberately not a dependency.  The plugin's whole contract with esbuild is the
 * {name, setup} object it returns and the {filter} / callback pair it registers, both of which a
 * stand-in can supply.  That keeps this test dependency-free; a real end-to-end build against
 * esbuild is a release-time check, not a unit test. */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import solariteEsbuild from './index.js';

let n = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/**
 * Run the plugin's setup() against a stand-in for esbuild's `build` argument and return the
 * filter and callback it registered.
 * @param options {object} Passed through to the plugin.
 * @return {{plugin: object, filter: RegExp, callback: function}} */
function register(options = {}) {
	const plugin = solariteEsbuild(options);
	let filter = null, callback = null;
	plugin.setup({
		onLoad(opts, cb) {
			filter = opts.filter;
			callback = cb;
		},
	});
	assert(filter, 'plugin registered no onLoad filter');
	return {plugin, filter, callback};
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'esbuild-plugin-solarite-'));

/**
 * Write source to a temp file and run the plugin's onLoad callback on it, the way esbuild would.
 * @param name {string} File name, whose extension decides jsx vs tsx parsing.
 * @param source {string}
 * @return {Promise<{contents: string, loader: string}>} */
async function load(name, source, options = {}) {
	const file = path.join(tmp, name);
	fs.writeFileSync(file, source);
	const {callback} = register(options);
	return await callback({path: file});
}

test('exposes the esbuild plugin shape', () => {
	const {plugin} = register();
	assert.equal(plugin.name, 'esbuild-plugin-solarite');
	assert.equal(typeof plugin.setup, 'function');
});

test('claims .jsx and .tsx and nothing else', () => {
	const {filter} = register();
	for (const yes of ['/a/b.jsx', '/a/b.tsx', 'c.jsx'])
		assert(filter.test(yes), `should match ${yes}`);
	for (const no of ['/a/b.js', '/a/b.ts', '/a/b.json', '/a/jsx.css', '/a/b.jsx.map'])
		assert(!filter.test(no), `should not match ${no}`);
});

test('compiles jsx to precompile output and reports the js loader', async () => {
	const out = await load('a.jsx', `export const el = <a href={link}>Hi {name}</a>;`);
	assert.equal(out.loader, 'js');
	assert.match(out.contents, /\["<a ", ">Hi ", "<\/a>"\]/);
	assert.match(out.contents, /jsxTemplate\(/);
	assert.match(out.contents, /from "solarite\/jsx-runtime"/);
});

test('strips TypeScript types from .tsx', async () => {
	const out = await load('b.tsx', `const a: number = 1; export const b = <i>{a}</i>;`);
	assert.doesNotMatch(out.contents, /: number/);
	assert.match(out.contents, /jsxTemplate\(/);
});

test('appends an inline base64 sourcemap', async () => {
	const out = await load('c.jsx', `export const el = <b>{x}</b>;`);
	const m = out.contents.match(
		/\n\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)$/);
	assert(m, 'no inline sourcemap appended');
	const map = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
	assert.equal(map.version, 3);
	assert(map.mappings.length > 0, 'sourcemap has no mappings');
});

test('forwards importSource to the transform', async () => {
	const out = await load('d.jsx', `export const el = <b>{x}</b>;`, {importSource: 'my-runtime'});
	assert.match(out.contents, /from "my-runtime"/);
	assert.doesNotMatch(out.contents, /solarite\/jsx-runtime/);
});

const failures = [];
for (const [name, fn] of tests) {
	try {
		await fn();
		n++;
		console.log('  ok', name);
	}
	catch (e) {
		failures.push(name);
		console.log('  FAIL', name);
		console.log('   ', e.message);
	}
}
fs.rmSync(tmp, {recursive: true, force: true});

if (failures.length) {
	console.log(`\n${failures.length} of ${tests.length} adapter tests FAILED.`);
	process.exit(1);
}
console.log(`\n${n} adapter tests passed.`);
