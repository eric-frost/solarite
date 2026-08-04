/** Adapter tests for vite-plugin-solarite.  Run: `node test.js` (or `npm test`).
 *
 * The plugin is a thin transform() adapter over babel-plugin-solarite's transform(), and that
 * transform already has its own tests, so what's checked here is only the wiring: which ids the
 * plugin claims, the shape it hands back to Vite, and how it forwards options.
 *
 * Vite itself is deliberately not a dependency.  The plugin's contract with Vite is an object whose
 * transform(code, id) is a plain function, so it can simply be called; nothing here needs a running
 * bundler.  A real end-to-end build against Vite is a release-time check, not a unit test. */
import assert from 'node:assert';
import solariteVite from './index.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok', name); };

const plugin = solariteVite();
const t = (code, id) => plugin.transform(code, id);

test('exposes the vite plugin shape and runs before Vite\'s own JSX handling', () => {
	assert.equal(plugin.name, 'vite-plugin-solarite');
	assert.equal(plugin.enforce, 'pre');
	assert.equal(typeof plugin.transform, 'function');
});

test('ignores ids that are not jsx or tsx', () => {
	for (const id of ['/a/b.js', '/a/b.ts', '/a/b.css', '/a/b.json', '/a/jsx.css'])
		assert.equal(t(`const a = 1;`, id), null, `should ignore ${id}`);
});

test('compiles jsx and returns code plus a sourcemap', () => {
	const out = t(`export const el = <a href={link}>Hi {name}</a>;`, '/a/b.jsx');
	assert(out, 'returned null for a .jsx id');
	assert.match(out.code, /\["<a ", ">Hi ", "<\/a>"\]/);
	assert.match(out.code, /jsxTemplate\(/);
	assert.match(out.code, /from "solarite\/jsx-runtime"/);
	assert.equal(out.map.version, 3);
	assert(out.map.mappings.length > 0, 'sourcemap has no mappings');
});

test('strips TypeScript types from .tsx', () => {
	const out = t(`const a: number = 1; export const b = <i>{a}</i>;`, '/a/b.tsx');
	assert.doesNotMatch(out.code, /: number/);
	assert.match(out.code, /jsxTemplate\(/);
});

// Vite appends query suffixes to ids (?v=, ?worker, ?raw and so on).  Without the split the
// extension test would fail on every such request and the file would silently skip compiling,
// reaching the browser as raw JSX.
test('claims ids that carry a Vite query suffix', () => {
	for (const id of ['/a/b.jsx?v=123', '/a/b.tsx?worker', '/a/b.jsx?used&direct']) {
		const out = t(`export const el = <b>{x}</b>;`, id);
		assert(out, `returned null for ${id}`);
		assert.match(out.code, /jsxTemplate\(/);
	}
});

test('a query suffix alone does not make a non-jsx id match', () => {
	assert.equal(t(`const a = 1;`, '/a/b.js?v=1.jsx'), null);
});

test('forwards importSource to the transform', () => {
	const out = solariteVite({importSource: 'my-runtime'})
		.transform(`export const el = <b>{x}</b>;`, '/a/b.jsx');
	assert.match(out.code, /from "my-runtime"/);
	assert.doesNotMatch(out.code, /solarite\/jsx-runtime/);
});

console.log(`\n${n} adapter tests passed.`);
