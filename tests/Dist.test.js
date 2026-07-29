/**
 * Tests that run against the minified build.
 * The minifier mangles property names, which can silently break contracts where the
 * browser looks up a property by name, e.g. handleEvent for addEventListener(name, object).
 * Run `bash build/build.bat` first; these fail against a stale build. */
import Testimony, {assert} from './Testimony.js';
import {Solarite as SolariteMin, h as hMin} from '../dist/Solarite.min.js';

Testimony.test('Dist.events.click', `Real clicks must work in the minified build`, () => {
	let clicked = 0;
	let clickedArg = null;

	class DistClickTest extends SolariteMin {
		count = 0;
		add(amount) {
			clickedArg = amount;
			clicked++;
		}
		render() {
			hMin(this)`<dist-click-test><button onclick=${[this.add, 3]}>B1</button><button onclick=${() => this.add(4)}>B2</button></dist-click-test>`;
		}
	}
	customElements.define('dist-click-test', DistClickTest);
	let a = new DistClickTest();
	document.body.append(a);

	a.children[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(clicked, 1);
	assert.eq(clickedArg, 3);

	a.children[1].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(clicked, 2);
	assert.eq(clickedArg, 4);

	// Rebind with a new arrow function on re-render, then click again.
	a.render();
	a.children[1].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(clicked, 3);

	a.remove();
});

Testimony.test('Dist.events.twoWayBinding', `Two-way input binding in the minified build`, () => {
	class DistBindTest extends SolariteMin {
		text = 'start';
		render() {
			hMin(this)`<dist-bind-test><input value=${[this, 'text']}></dist-bind-test>`;
		}
	}
	customElements.define('dist-bind-test', DistBindTest);
	let a = new DistBindTest();
	document.body.append(a);

	let input = a.children[0];
	assert.eq(input.value, 'start');

	input.value = 'changed';
	input.dispatchEvent(new Event('input'));
	assert.eq(a.text, 'changed');

	a.remove();
});

Testimony.test('Dist.map.keyed', `h.map and the keyed reconciler work in the minified build`, () => {
	class DistMapTest extends SolariteMin {
		rows = [];
		sel = null;
		render() {
			hMin(this)`<dist-map-test><table><tbody>${hMin.map(this.rows, row =>
				hMin`<tr key=${row.id} class=${row.id === this.sel ? 'danger' : ''}><td>${row.label}</td></tr>`)}
			</tbody></table></dist-map-test>`;
		}
	}
	customElements.define('dist-map-test', DistMapTest);
	let a = new DistMapTest();
	for (let i=1; i<=10; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();

	let trs = [...a.querySelectorAll('tr')];
	assert.eq(trs.length, 10);
	assert.eq(trs[3].textContent, 'r4');

	// An unchanged render must keep every element.
	a.render();
	assert.eq(a.querySelectorAll('tr')[3], trs[3]);

	// Patch one row: same element, new content.
	a.sel = 4;
	a.rows[3] = {...a.rows[3], label: 'changed'};
	a.render();
	assert.eq(a.querySelectorAll('tr')[3], trs[3]);
	assert.eq(a.querySelectorAll('tr')[3].textContent, 'changed');
	assert.eq(a.querySelectorAll('tr')[3].className, 'danger');

	// Swap two rows: their elements move with their keys.
	let t = a.rows[1];
	a.rows[1] = a.rows[8];
	a.rows[8] = t;
	a.render();
	assert.eq(a.querySelectorAll('tr')[1], trs[8]);
	assert.eq(a.querySelectorAll('tr')[8], trs[1]);

	// Remove one from the middle; everything after it shifts and keeps its element.
	a.rows.splice(4, 1);
	a.render();
	assert.eq(a.querySelectorAll('tr').length, 9);
	assert.eq(a.querySelectorAll('tr')[4], trs[5]);

	a.rows = [];
	a.render();
	assert.eq(a.querySelectorAll('tr').length, 0);
	a.remove();
});

Testimony.test('Dist.selector', `h.selector survives property mangling in the minified build`, () => {
	class DistSelectorTest extends SolariteMin {
		rows = [];
		sel = hMin.selector();
		renders = 0;

		render() {
			this.renders++;
			hMin(this)`<dist-selector-test><table><tbody>${hMin.map(this.rows, row =>
				hMin`<tr key=${row.id} class=${this.sel.when(row.id, 'danger')}><td>${row.label}</td></tr>`)}
			</tbody></table></dist-selector-test>`;
		}
	}
	customElements.define('dist-selector-test', DistSelectorTest);
	let a = new DistSelectorTest();
	for (let i=1; i<=10; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();

	// Nothing selected: no class attribute anywhere, matching a hand-written implementation.
	assert.eq(a.querySelectorAll('[class]').length, 0);
	let trs = [...a.querySelectorAll('tr')];
	let rendersBefore = a.renders;

	a.sel.set(4);
	assert.eq(a.sel.key, 4);
	assert.eq(trs[3].getAttribute('class'), 'danger');
	assert.eq(a.querySelectorAll('[class]').length, 1);
	assert.eq(a.renders, rendersBefore); // No render() was called.

	a.sel.set(8);
	assert.eq(trs[3].hasAttribute('class'), false);
	assert.eq(trs[7].getAttribute('class'), 'danger');
	assert.eq(a.querySelectorAll('[class]').length, 1);

	// The highlight follows its row through a reorder.
	a.rows.reverse();
	a.render();
	assert.eq(a.querySelectorAll('tr')[2], trs[7]);
	assert.eq(trs[7].getAttribute('class'), 'danger');

	a.sel.set(null);
	assert.eq(a.querySelectorAll('[class]').length, 0);
	a.remove();
});

Testimony.test('Dist.jsxRuntimeSharesOneCopy', `dist/jsx-runtime.js must share the main bundle's module instance`, async () => {
	// A toolchain with jsxImportSource:"solarite" injects `import {jsx} from "solarite/jsx-runtime"`
	// into every JSX file, alongside whatever the app imported from "solarite".  Both specifiers
	// have to reach ONE module instance, because Globals holds the Shell cache, the connected
	// WeakSet, elementClasses and htmlProps — two copies means two of each, silently.
	// package.json used to point "." at dist/ and "./jsx-runtime" at src/, which are separate
	// module trees, so every JSX project loaded Solarite twice and got the unstripped source
	// (asserts live, ~15% slower) as its second copy.  This test is what keeps that from
	// coming back: it compares identity, not behaviour, because two copies behave identically
	// right up until they don't.
	const main = await import('../dist/Solarite.js');
	const jsxRt = await import('../dist/jsx-runtime.js');
	const jsxDev = await import('../dist/jsx-dev-runtime.js');

	// The shared class identity PathToAttribs depends on: it tests `instanceof JsxAttr`, which
	// silently returns false across two copies of the class.
	assert(jsxRt.jsxAttr('href', '/x') instanceof main.InternalJsxAttr);

	// Fragment is a symbol in the main bundle; a second copy would mint a different one.
	assert.eq(jsxRt.Fragment, main.Fragment);
	assert.eq(jsxDev.Fragment, main.Fragment);
	assert.eq(jsxDev.jsxDEVRuntime, jsxRt.jsxDEV);

	// A Template built through the JSX runtime must be the same class the main bundle renders.
	let t = jsxRt.jsx('b', {children: 'hi'});
	assert(t instanceof main.Template);

	// And it must actually render through the main bundle's h().
	let el = document.createElement('div');
	document.body.append(el);
	main.default(el, jsxRt.jsx('b', {children: 'hi'}));
	assert.eq(el.innerHTML.replace(/<!--.*?-->/g, ''), '<b>hi</b>');
	el.remove();

	// The debug build must not leak into the published entry points.
	const txt = await (await fetch('../dist/jsx-runtime.js')).text();
	assert.eq(txt.includes('#IFDEBUG'), false);
	assert(txt.includes("from './Solarite.js'"));
});

Testimony.test('Dist.customElementsNotMangled', `Terser must not rename customElements methods it doesn't know`, async () => {
	// build/build.js mangles properties with `builtins: false`, which spares names terser
	// recognizes from its bundled DOM list.  That list predates CustomElementRegistry.getName,
	// so a plain `customElements.getName(x)` gets renamed — it became `customElements.l(x)` in
	// the shipped build until 2026-07-28.  The call was guarded (`customElements.l ? ... : ...`),
	// so it never threw; it silently took the fallback forever, meaning a class registered under
	// a tag that isn't its kebab-cased name resolved to the WRONG tag in the minified build only.
	// Util.js dodges this with `let getName = 'getName'` and computed access, which terser leaves
	// alone.  This test is the guard, because the failure is invisible at runtime and the
	// unminified build behaves correctly, so no behavioural test can see it.
	const src = await (await fetch('../dist/Solarite.min.js')).text();
	let used = [...src.matchAll(/customElements\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]);
	assert(used.length > 0, 'expected the build to reference customElements at all');

	// Every surviving name must be a real CustomElementRegistry method, not a mangled stub.
	for (let name of new Set(used))
		assert(typeof customElements[name] === 'function',
			`customElements.${name} is not a real method — terser mangled it`);
});
