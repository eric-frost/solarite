/** Transform tests for babel-plugin-solarite.  Run: `node test.js` (or `npm test`).
 * Asserts the emitted precompile contract; browser/runtime equivalence is covered by the Solarite
 * suite's jsxrt.* tests against the same contract. */
import assert from 'node:assert';
import { transform } from './transform.js';

const t = (src, opts) => transform(src, { filename: 'x.tsx', ...opts }).code;
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok', name); };

test('intrinsic element + dynamic attr + child', () => {
	const out = t(`const a = <a href={link}>Hi {name}</a>;`);
	assert.match(out, /\["<a ", ">Hi ", "<\/a>"\]/);
	assert.match(out, /jsxTemplate\(\w+, _?jsxAttr\("href", link\), _?jsxEscape\(name\)\)/);
});

test('nested intrinsic children are inlined into one statics array', () => {
	const out = t(`const a = <div><b>x</b>{y}</div>;`);
	assert.match(out, /\["<div><b>x<\/b>", "<\/div>"\]/);
});

test('boolean + static attrs', () => {
	const out = t(`const a = <input type="text" disabled/>;`);
	assert.match(out, /\["<input type=\\"text\\" disabled>"\]/);
});

test('key becomes a jsxAttr hole with a leading space', () => {
	const out = t(`const a = <li key={id}>{x}</li>;`);
	assert.match(out, /\["<li ", ">", "<\/li>"\]/);
	assert.match(out, /jsxAttr\("key", id\)/);
});

test('fragment compiles to empty-string statics', () => {
	const out = t(`const a = <>{x}{y}</>;`);
	assert.match(out, /\["", "", ""\]/);
});

test('component -> jsx() with children in props, key as 3rd arg', () => {
	const out = t(`const a = <Comp a={1} key={k}>txt</Comp>;`);
	assert.match(out, /jsx\(Comp, \{\s*a: 1,\s*children: "txt"\s*\}, k\)/);
});

test('spread element -> jsx() not jsxTemplate', () => {
	const out = t(`const a = <div {...props} id="x">y</div>;`);
	assert.match(out, /jsx\("div", \{[\s\S]*\.\.\.props[\s\S]*\}/);
	assert.doesNotMatch(out, /jsxTemplate/);
});

test('TypeScript types are stripped', () => {
	const out = t(`const a: number = 1; const b = <i>{a}</i>;`);
	assert.doesNotMatch(out, /: number/);
});

test('only used helpers are imported', () => {
	const out = t(`const a = <br/>;`);
	assert.match(out, /import \{ jsxTemplate as \w+ \} from "solarite\/jsx-runtime"/);
	assert.doesNotMatch(out, /jsxEscape/);
});

console.log(`\n${n} transform tests passed.`);
