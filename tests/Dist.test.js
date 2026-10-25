/**
 * Tests that run against the minified build.
 * The minifier mangles property names, which can silently break contracts where the
 * browser looks up a property by name, e.g. handleEvent for addEventListener(name, object).
 * Run `bash build/build.bat` first; these fail against a stale build. */
import Testimony, {assert} from './Testimony.js';
import {Solarite as SolariteMin, h as hMin, getEventBinding as getEventBindingMin, toEl as toElMin} from '../dist/Solarite.min.js';

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

Testimony.test('Dist.events.standaloneFragment', `Handlers of a standalone template with several root nodes run in the minified build, and a root in another document still registers on that document`, () => {
	// 1. Two buttons made by one h() call.  contextmenu is bound by no other test of this file,
	// so nothing else has registered its dispatcher on the page's document for this build.
	let log = [];
	let fragment = hMin()`<button oncontextmenu=${() => log.push('a')}>a</button><button oncontextmenu=${() => log.push('b')}>b</button>`;
	let host = document.createElement('div');
	document.body.append(host);
	host.append(fragment);
	for (let button of host.children)
		button.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true}));
	assert.eq(log.join(), 'a,b');
	host.remove();

	// 2. The page's document stands in only for a document that has no window, which the
	// dispatcher learns from document.defaultView, a name the minifier has to leave alone.  A
	// root inside an iframe has a document with a window, and that document has to register:
	// it is what reaches an element moved out of the root.  The root is made by this page,
	// because h() recognizes an element by this page's HTMLElement.
	let iframe = document.createElement('iframe');
	document.body.append(iframe);
	let doc = iframe.contentDocument;
	let el = document.createElement('div');
	doc.body.append(el);
	hMin(el)`<button onmouseover=${() => log.push('framed')}>x</button>`;
	let button = el.firstChild;
	doc.body.append(button);
	button.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
	assert.eq(log.join(), 'a,b,framed');
	iframe.remove();
});

Testimony.test('Dist.events.dispatchOrder', `Delegated and native: handlers keep native ordering in the minified build`, () => {
	// The dispatcher attaches listeners along the event's path the moment an event starts and
	// removes them when the event reaches the last of them, so it leans on bookkeeping the
	// minifier renames.  Guards the 0.9.0 rework the way Dist.events.click guards the basic path.
	let order = [];
	let el = document.createElement('div');
	document.body.append(el);
	hMin(el)`<div><button onclick=${e => {order.push('delegated'); e.stopPropagation()}}>a</button><button native:onclick=${() => order.push('native')}>b</button><input oninput=${() => order.push('input')}></div>`;
	let [div, delegated, native, input] = [el.firstChild, ...el.firstChild.children];
	div.addEventListener('click', () => order.push('div'));
	delegated.addEventListener('click', () => order.push('real'));
	native.addEventListener('click', () => order.push('real'));

	// A delegated handler runs after the element's own listeners and its stopPropagation()
	// still stops the ancestor.  A native: one was added at render, so it runs first.
	delegated.click();
	assert.eq(order.join(), 'real,delegated');
	order = [];
	native.click();
	assert.eq(order.join(), 'native,real,div');

	// A synthetic event that doesn't bubble still reaches a delegated handler.
	order = [];
	input.dispatchEvent(new Event('input'));
	assert.eq(order.join(), 'input');

	// A node moved outside its component keeps its handler.
	order = [];
	document.body.append(input);
	input.dispatchEvent(new Event('input'));
	assert.eq(order.join(), 'input');

	input.remove();
	el.remove();
});

Testimony.test('Dist.events.listRows', `Handlers on the rows of a keyed h.map() list work in the minified build`, () => {
	// A list row stores no handler on its elements.  The dispatcher finds the row through a
	// pointer on the row's root element, looks up which of the row's elements bind the event, and
	// reads each handler from the row's template.  Every step of that is bookkeeping the minifier
	// renames, and no other test in this file sends an event to a list row.
	let log = [];
	class DistListRowsTest extends SolariteMin {
		rows = [1, 2, 3].map(id => ({id, label: 'r' + id}));
		render() {
			hMin(this)`<dist-list-rows-test>${hMin.map(this.rows, row =>
				hMin`<p key=${row.id} onclick=${[function(item) { log.push(['row', item, this]); }, row]}><a onclick=${[function(item) { log.push(['inner', item, this]); }, row]}>${row.label}</a></p>`)}</dist-list-rows-test>`;
		}
	}
	customElements.define('dist-list-rows-test', DistListRowsTest);
	let a = new DistListRowsTest();
	document.body.append(a);
	let ps = [...a.querySelectorAll('p')];
	assert.eq(ps.length, 3);

	// Click the inner element of one row, and report which handlers ran, in order, with which
	// item, and whether `this` was the component.
	const click = index => {
		log = [];
		a.querySelectorAll('a')[index].click();
		return log.map(([which, item, self]) => which + ':' + item.label + ':' + (self === a)).join();
	};

	// 1. The inner handler runs first, then the row's, each with the row's own item.
	assert.eq(click(1), 'inner:r2:true,row:r2:true');
	assert.eq(log[0][1], a.rows[1]);

	// 2. A row replaced by a new object with the same key keeps its element, and its handlers
	// now report the new item.
	a.rows[1] = {id: 2, label: 'changed'};
	a.render();
	assert.eq(a.querySelectorAll('p')[1], ps[1]);
	assert.eq(click(1), 'inner:changed:true,row:changed:true');
	assert.eq(log[0][1], a.rows[1]);
	assert.eq(log[1][1], a.rows[1]);

	// 3. Removing a row leaves the others answering, each with its own item.
	a.rows.splice(0, 1);
	a.render();
	assert.eq(ps[0].isConnected, false);
	assert.eq(a.querySelectorAll('p').length, 2);
	assert.eq(click(0), 'inner:changed:true,row:changed:true');
	assert.eq(click(1), 'inner:r3:true,row:r3:true');

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

Testimony.test('Dist.events.handlerForms', `Every form of handler works in the minified build: a function or an array with any number of arguments, on an element of the root's template, on a list row, and bound with addEventListener, where one element can hold several handlers and getEventBinding() finds each.`, () => {
	// The browser looks up handleEvent by name on a binding made with addEventListener, and
	// getEventBinding() is part of the public API, so both have to survive property mangling.
	for (let eventDelegation of [true, false]) {
		let el = document.createElement('div');
		document.body.append(el);
		let log = [];
		let fn = function(...args) {
			let node = args.pop(), ev = args.pop();
			log.push([this === el, ev.type, node.tagName, ...args].join(' '));
		};
		let handlers = [fn, [fn], [fn, 'a'], [fn, 'a', 'b'], [fn, 'a', 'b', 'c'], [fn, 'a', 'b', 'c', 'd']];
		let model = {text: 'a'};
		hMin(el, {eventDelegation})`<div>
			<input value=${[model, 'text']} onclick=${[fn, 'click']} onkeyup=${[fn, 'keyup']} onfocus=${[fn, 'focus']}>
			${handlers.map(handler => hMin`<b onclick=${handler}><s onclick=${handler}></s></b>`)}</div>`;

		// 1. Each form, on a list row's root and on an element inside it.
		for (let s of el.querySelectorAll('s'))
			s.dispatchEvent(new MouseEvent('click', {bubbles: true}));
		let expected = ['', '', ' a', ' a b', ' a b c', ' a b c d'];
		assert.eq(log.join(), expected.map(args => `true click S${args},true click B${args}`).join());

		// 2. Several handlers and a two-way binding on one element.
		log = [];
		let input = el.querySelector('input');
		input.dispatchEvent(new MouseEvent('click', {bubbles: true}));
		input.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true}));
		input.dispatchEvent(new FocusEvent('focus'));
		input.value = 'b';
		input.dispatchEvent(new Event('input', {bubbles: true}));
		assert.eq(log.join(), 'true click INPUT click,true keyup INPUT keyup,true focus INPUT focus');
		assert.eq(model.text, 'b');

		// 3. Bindings made with addEventListener are found by key; delegated handlers have none.
		let found = ['value', 'click', 'keyup', 'focus'].map(key => typeof getEventBindingMin(input, key)?.handleEvent);
		assert.eq(found.join(), eventDelegation ? 'function,undefined,undefined,function' : 'function,function,function,function');
		el.remove();
	}
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

Testimony.test('Dist.map.sameWorkAsUnminified', `The minified build settles a long h.map() list by the same route as the unminified build: the size limits that choose between patching rows in place, following a shifted list and the general diff are numbers the minifier writes into the code, and both builds must call the callback equally often and end with the same rows.`, async () => {
	const plain = await import('../dist/Solarite.js');

	// Each step replaces the list, and between them they cross the limits the list code has:
	// more than 256 changed positions (rows that moved, then rows that are all new) and fewer,
	// more than 16 rows that changed places and fewer, a block of inserted rows longer than
	// 64 and a shorter one, and rows removed in two places.  How often the callback runs
	// depends on the route taken, so equal counts mean equal routes.
	const run = h => {
		let all = [];
		for (let i=0; i<1200; i++)
			all.push({id: i, label: 'r' + i});
		const swapPairs = (rows, pairs) => {
			rows = rows.slice();
			for (let k=0; k<pairs; k++) {
				let t = rows[k*10];
				rows[k*10] = rows[k*10+5];
				rows[k*10+5] = t;
			}
			return rows;
		};
		let steps = [
			() => all.slice(0, 300),
			rows => rows.slice().reverse(),
			rows => rows.slice(0, 200),
			rows => rows.slice().reverse(),
			() => all.slice(300, 600),
			() => all.slice(600, 900),
			rows => swapPairs(rows, 9),
			rows => swapPairs(rows, 8),
			rows => [...all.slice(900, 960), ...rows],
			rows => [...all.slice(960, 1030), ...rows],
			rows => [...rows.slice(0, 10), ...rows.slice(13, 100), ...rows.slice(106)],
			rows => rows.slice(0, 5)
		];

		let el = document.createElement('div'), rows = [], result = [];
		for (let step of steps) {
			rows = step(rows);
			let calls = 0;
			h(el)`<ul>${h.map(rows, r => {
				calls++;
				return h`<li key=${r.id}>${r.label}</li>`;
			})}</ul>`;
			assert.eq(el.textContent, rows.map(r => r.label).join(''));
			result.push(calls);
		}
		return result;
	};

	let counts = run(hMin);
	assert.eq(counts, run(plain.h));

	// The two limits that decide how often the callback runs, so that equal counts above can't
	// mean that neither build has them: 300 rows reversed are recognized as moved and none is
	// built again, 200 are each built again; 60 rows put in front are the only ones built,
	// 70 are too many to look past and the rows behind them are built again as well.
	assert.eq([counts[1], counts[3], counts[8]], [0, 200, 60]);
	assert.eq(counts[9] > 70, true);
});

Testimony.test('Dist.map.nestedOddResults', `An h.map() inside an array draws a number, nothing, or an array for an item in the minified build, which reads such a list through its iterator.`, () => {
	let el = document.createElement('div');
	for (let items of [[1, 2, 3], [3, 1], []]) {
		hMin(el)`<div>${[hMin.map(items, n => n === 1 ? n : n === 2 ? null : [hMin`<b>${n}</b>`, hMin`<i>${n}</i>`])]}</div>`;
		assert.eq(el.innerHTML.replace(/<!--.*?-->/g, ''), '<div>' + items.map(n => n === 1 ? '1' : n === 2 ? '' : '<b>3</b><i>3</i>').join('') + '</div>');
	}
});

Testimony.test('Dist.rawNodeMoves', `A raw DOM node that moves between two expressions of one parent is shown in its new place in the minified build, which finds the place that had the node through a WeakRef on the node.`, () => {
	let el = document.createElement('div');
	let node = document.createElement('hr');
	for (let [a, b] of [[node, 'x'], ['x', node], ['x', node], [node, 'x'], [node, node], ['x', node]]) {
		hMin(el)`<div>${a}|${b}</div>`;
		assert.eq(el.firstElementChild.innerHTML.replace(/<!--.*?-->/g, ''), a === node ? '<hr>|' + (b === node ? '' : b) : a + '|<hr>');
	}
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

Testimony.test('Dist.jsxRuntimeMinSharesOneCopy', `dist/jsx-runtime.min.js must share the minified bundle's module instance`, async () => {
	// Every example in the documentation imports Solarite.min.js by path.  Someone who does that and
	// maps "solarite/jsx-runtime" to jsx-runtime.js, which imports Solarite.js, loads two copies.  So
	// the minified bundle has a runtime of its own, and this checks it against the copy this file
	// already imported at the top, the way a page would.
	const min = await import('../dist/Solarite.min.js');
	const jsxRt = await import('../dist/jsx-runtime.min.js');
	const jsxDev = await import('../dist/jsx-dev-runtime.min.js');

	assert(jsxRt.jsxAttr('href', '/x') instanceof min.InternalJsxAttr);
	assert.eq(jsxRt.Fragment, min.Fragment);
	assert.eq(jsxDev.jsxDEVRuntime, jsxRt.jsxDEV);

	// The runtime is minified apart from the bundle, so it must reach a key through a name the bundle
	// does not mangle.  Rendering a keyed template through both tiers proves the names still agree.
	let el = document.createElement('div');
	document.body.append(el);
	hMin(el, jsxRt.jsxs('ul', {children: [jsxRt.jsx('li', {children: 'a'}, 1), jsxRt.jsx('li', {children: 'b'}, 2)]}));
	assert.eq(el.innerHTML.replace(/<!--.*?-->/g, ''), '<ul><li>a</li><li>b</li></ul>');
	assert.eq(jsxRt.jsxTemplate(['<i ', '></i>'], jsxRt.jsxAttr('key', 7)).key, 7);
	el.remove();

	const txt = await (await fetch('../dist/jsx-runtime.min.js')).text();
	assert(txt.includes(`from"./Solarite.min.js"`) || txt.includes(`from'./Solarite.min.js'`));
	assert.eq(txt.includes('Solarite.js"'), false);
});

// Two copies don't recognise each other's templates or share slot hand-offs, and nothing about the
// resulting failure points at the cause, so the second copy says so as it loads.  This runs in an
// iframe because the marker lives on globalThis: this page has already loaded several copies, and a
// fresh realm starts with none.  The callback is serialised into the iframe, so it can only use what
// it imports itself.
Testimony.testIframe('Dist.duplicateCopyWarning', `Loading a second copy of Solarite warns and names both`,
	`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body></body></html>`, async context => {
	const assert = context.assert;
	let warnings = [];
	console.warn = message => warnings.push(String(message));

	// 1. One copy, plus the runtime built for it, is silent.
	await import('/dist/Solarite.min.js');
	await import('/dist/jsx-runtime.min.js');
	assert.eq(warnings.length, 0);

	// 2. A different build is a second copy, whichever build it is; the debug build counts too.
	await import('/dist/Solarite-debug.js');
	assert.eq(warnings.length, 1);
	assert(warnings[0].includes('/dist/Solarite.min.js'));
	assert(warnings[0].includes('/dist/Solarite-debug.js'));

	// 3. So does the mismatched runtime, which is the mistake this is most likely to catch.
	await import('/dist/jsx-runtime.js');
	assert.eq(warnings.length, 2);
	assert(warnings[1].includes('/dist/Solarite.js'));
});

Testimony.test('Dist.customElementsNotMangled', `Terser must not rename customElements methods it doesn't know`, async () => {
	// build/build.js mangles properties with `builtins: false`, which spares names terser
	// recognizes from its bundled DOM list.  That list predates CustomElementRegistry.getName,
	// so a plain `customElements.getName(x)` gets renamed — it became `customElements.l(x)` in
	// the shipped build until 2026-07-28.  The call was guarded (`customElements.l ? ... : ...`),
	// so it never threw; it silently took the fallback forever, meaning a class registered under
	// a tag that isn't its kebab-cased name resolved to the WRONG tag in the minified build only.
	// Util.js dodges this by writing the name in quotes, customElements['getName'], which terser
	// leaves alone.  This test is the guard, because the unminified build behaves correctly.
	const src = await (await fetch('../dist/Solarite.min.js')).text();
	let used = [...src.matchAll(/customElements\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]);
	assert(used.length > 0, 'expected the build to reference customElements at all');

	// Every surviving name must be a real CustomElementRegistry method, not a mangled stub.
	for (let name of new Set(used))
		assert(typeof customElements[name] === 'function',
			`customElements.${name} is not a real method — terser mangled it`);
});

Testimony.test('Dist.helpersStayFunctions', `The minified build must not turn a helper into a closure created on every call`, async () => {
	// The minifier, left to itself, moves a function that is called from one place to its call
	// site as a function expression that is created and immediately called.  That saves a few
	// bytes and costs a closure allocation on every call, which for a helper the list code
	// calls once per row is an allocation per row, and it hides the helper from the engine's
	// own inlining.  build.js turns that off (reduce_funcs: false).  This fails if a change of
	// minifier settings, or a minifier upgrade that drops the option, brings it back.
	const src = await (await fetch('../dist/Solarite.min.js')).text();
	assert(src.length > 10000, 'dist/Solarite.min.js fetched');
	assert.eq((src.match(/\}\)\(/g) || []).length, 0);
});

Testimony.test('Dist.rootRenderCreatesNothing', `The function that every render of every component runs creates no function in the minified build`, async () => {
	// Template.render() tells a template that only arrives in a new array from one that is new
	// by comparing the strings, in sameStrings().  Written as one expression with a callback,
	// that helper is moved into render() by the minifier, callback and all, and a variable the
	// callback reads then has to live in an object that is allocated on every call of render(),
	// whether the comparison runs or not.  Written as a loop it stays a function of its own.
	const src = await (await fetch('../dist/Solarite.min.js')).text();
	let render = src.match(/render\(\w+=null,\w+=\{\}\)\{.*?\.exprs,!0,\w+\).*?return /);
	assert(render, 'Template.render() found in dist/Solarite.min.js');
	assert(!/=>|function/.test(render[0]), render[0]);
});

Testimony.test('Dist.slotHandOff', `Slot children survive property mangling`, () => {
	// RootNodeGroup.instantiate() decides whether a pending slot hand-off is addressed to the
	// component it is rendering by reading el.constructor -- a name the BROWSER owns, so it
	// only survives because build.js lists 'constructor' in mangle.reserved.  If that entry
	// is ever dropped, this is the test that notices: the source build keeps working while
	// every slot silently empties in the minified one.
	class DistSlotIcon extends SolariteMin {
		render() { hMin(this)`<dist-slot-icon>i</dist-slot-icon>`; }
	}
	customElements.define('dist-slot-icon', DistSlotIcon);

	class DistSlotMenu extends SolariteMin {
		constructor() { super(); this.render(); }
		render() { hMin(this)`<dist-slot-menu><dist-slot-icon></dist-slot-icon></dist-slot-menu>`; }
	}
	customElements.define('dist-slot-menu', DistSlotMenu);

	class DistSlotBar extends SolariteMin {
		menu = new DistSlotMenu();
		render() { hMin(this)`<dist-slot-bar><slot></slot></dist-slot-bar>`; }
	}
	customElements.define('dist-slot-bar', DistSlotBar);

	let div = document.createElement('div');
	document.body.append(div);
	hMin(div)`<div><dist-slot-bar><button>one</button></dist-slot-bar></div>`;

	assert.eq(div.querySelector('slot').innerHTML, `<button>one</button>`);

	div.remove();
});

Testimony.test('Dist.foreignElementChildren', `A custom element that doesn't render through Solarite keeps its children in the minified build, and when it takes them apart the next render throws the error that names it`, () => {
	class DistPlainElement extends HTMLElement {}
	customElements.define('dist-plain-element', DistPlainElement);
	let message = tag => `Solarite: <${tag}> changed the nodes \${...} drew inside it; wrap the \${...} in an element it leaves alone.`;
	let thrownBy = fn => {
		try {
			fn();
		}
		catch (e) {
			return e.message;
		}
		return null;
	};

	let div = document.createElement('div');
	let render = items => hMin(div)`<div><dist-plain-element><b>${items.length}</b>${items.map(item => hMin`<p>${item}</p>`)}</dist-plain-element></div>`;
	render([1, 2]);
	let plain = div.querySelector('dist-plain-element');
	assert.eq(plain.innerHTML.replace(/<!--.*?-->/g, ''), `<b>2</b><p>1</p><p>2</p>`);
	render([2]);
	assert.eq(plain.innerHTML.replace(/<!--.*?-->/g, ''), `<b>1</b><p>2</p>`);

	// A row the element removed: the minified build has to recognise the list as no longer
	// the one it left, name the element it kept beside the nodes, and draw nothing.
	let p = plain.querySelector('p'), next = p.nextSibling;
	p.remove();
	assert.eq(thrownBy(() => render([2, 3])), message('dist-plain-element'));
	assert.eq(plain.innerHTML.replace(/<!--.*?-->/g, ''), `<b>1</b>`);
	next.before(p);
	render([2, 3]);
	assert.eq(plain.innerHTML.replace(/<!--.*?-->/g, ''), `<b>2</b><p>2</p><p>3</p>`);
	assert.eq(plain.querySelector('p'), p);

	// Moved all together, the children are updated where the element put them.
	let section = document.createElement('section');
	section.append(...plain.childNodes);
	plain.append(section);
	render([3]);
	assert.eq(plain.innerHTML.replace(/<!--.*?-->/g, ''), `<section><b>1</b><p>3</p></section>`);

	class DistWipingElement extends HTMLElement {
		render() {
			this.innerHTML = '<s>mine</s>';
		}
	}
	customElements.define('dist-wiping-element', DistWipingElement);
	div = document.createElement('div');
	render = items => hMin(div)`<div><dist-wiping-element>${items.map(item => hMin`<p key=${item}>${item}</p>`)}</dist-wiping-element></div>`;
	render([1, 2]);
	render([1, 2, 3]);
	for (let items of [[3, 1], [5, 3, 1, 6], [], [9]])
		assert.eq(thrownBy(() => render(items)), message('dist-wiping-element'));
	assert.eq(div.querySelector('dist-wiping-element').innerHTML, `<s>mine</s>`);

	// A list that a Solarite component inside the element parted from the node before it,
	// by putting that node in a named slot, has no run of nodes to be looked for.  The
	// minified build has to leave it alone, and not take it for a list that is being drawn.
	customElements.define('dist-slots-element', class extends HTMLElement {
		constructor() {
			super();
			hMin(this)`<header><slot name="head"></slot></header><main><slot></slot></main>`;
		}
	});
	div = document.createElement('div');
	render = items => hMin(div)`<div><dist-plain-element><dist-slots-element><b slot="head">${items.length}</b>${items.map(item => hMin`<p key=${item}>${item}</p>`)}</dist-slots-element></dist-plain-element></div>`;
	for (let items of [[1, 2], [2, 1, 3], [], [4]]) {
		render(items);
		assert.eq([...div.querySelectorAll('main p')].map(p => p.textContent).join(), items.join());
	}
});

Testimony.test('Dist.jsxComponentArgs', `A precompiled JSX attribute on a custom element tag reaches the component under its own name in the minified build`, async () => {
	// PathToComponent tells a JSX attribute from an object of attributes by its class, which
	// the JSX runtime gets from this same bundle, and reads its name and value through
	// properties the runtime, minified apart from the bundle, must spell the same way.
	const {jsxTemplate, jsxAttr} = await import('../dist/jsx-runtime.min.js');
	let received, clicks = 0;
	customElements.define('dist-jsx-args', class extends HTMLElement {
		constructor(attribs) {
			super();
			received = attribs;
		}
	});
	let items = [1, 2];
	let el = document.createElement('div');
	hMin(el, jsxTemplate(['<div><dist-jsx-args ', ' ', ' ', ' ', '></dist-jsx-args></div>'], jsxAttr('items', items), jsxAttr('max-size', 3),
		jsxAttr('style', {fontSize: '2px'}), jsxAttr('onclick', () => clicks++)));
	assert.eq(Object.keys(received).sort().join(), 'items,maxSize,style');
	assert.eq(received.items, items);
	assert.eq(received.maxSize, 3);
	assert.eq(received.style, 'font-size:2px');
	el.querySelector('dist-jsx-args').click();
	assert.eq(clicks, 1);
});

Testimony.test('Dist.switch', `An element given another template shows it in the minified build: its content, the attributes and handlers on the element itself, its id references and its slot children`, () => {
	let log = [];
	class DistSwitch extends SolariteMin {
		mode = 'a';
		render() {
			if (this.mode === 'a')
				hMin(this)`<dist-switch class="tpl-a" title=${'A'} ${{lang: 'en'}} onclick=${() => log.push('click a')} onscroll=${() => log.push('scroll a')}>
					<p data-id="one">Loading</p><slot></slot></dist-switch>`;
			else if (this.mode === 'b')
				hMin(this)`<dist-switch class="tpl-b" onmouseup=${() => log.push('up b')}><ul data-id="two">${hMin.map(this.rows, row =>
					hMin`<li key=${row.id} onclick=${[this.pick, row]}>${row.id}</li>`)}</ul><footer><slot></slot></footer></dist-switch>`;
			else
				hMin(this)``;
		}
		rows = [{id: 1}, {id: 2}];
		pick(row) {
			log.push('pick ' + row.id);
			this.mode = 'a';
			this.render();
		}
	}
	customElements.define('dist-switch', DistSwitch);

	let div = document.createElement('div');
	div.innerHTML = '<dist-switch><b>kid</b></dist-switch>';
	document.body.append(div);
	let a = div.firstChild;
	let html = () => a.outerHTML.replace(/<!--.*?-->|\s+(?=<)/g, '');
	assert.eq(html(), '<dist-switch class="tpl-a" lang="en" title="A"><p data-id="one">Loading</p><slot><b>kid</b></slot></dist-switch>');
	let kid = a.querySelector('b');

	a.mode = 'b';
	a.render();
	assert.eq(html(), '<dist-switch class="tpl-b"><ul data-id="two"><li>1</li><li>2</li></ul><footer><slot><b>kid</b></slot></footer></dist-switch>');
	assert.eq(a.querySelector('b'), kid);
	assert.eq(a.one, null);
	assert.eq(a.two.tagName, 'UL');
	a.dispatchEvent(new Event('scroll'));
	a.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	assert.eq(log.join(), 'up b');

	// A handler of the template that is shown puts the other one back, from inside its own event.
	a.querySelectorAll('li')[1].click();
	assert.eq(log[1], 'pick 2');
	assert.eq(html(), '<dist-switch class="tpl-a" lang="en" title="A"><p data-id="one">Loading</p><slot><b>kid</b></slot></dist-switch>');
	assert.eq(a.two, null);
	log = [];
	a.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	a.click();
	assert.eq(log.join(), 'click a');

	// An empty template in between keeps the slot children for the next one.
	a.mode = 'c';
	a.render();
	assert.eq(html(), '<dist-switch></dist-switch>');
	a.mode = 'b';
	a.render();
	assert.eq(a.querySelector('slot').firstChild, kid);

	div.remove();
});

Testimony.test('Dist.component.definedLater', `A component rendered before its class is defined is built when the class is defined, in the minified build, whether it is written as a tag of its own or as a customized built-in`, async () => {
	let el = document.createElement('div');
	hMin(el)`<div><dist-late-tag name=${'a'}></dist-late-tag><p is="dist-late-is" name=${'b'}></p></div>`;
	let constructed = [];
	customElements.define('dist-late-tag', class extends HTMLElement {
		constructor(attribs) {
			super();
			constructed.push(attribs.name);
		}
	});
	customElements.define('dist-late-is', class extends HTMLParagraphElement {
		constructor(attribs) {
			super();
			constructed.push(attribs.name);
		}
	}, {extends: 'p'});
	await customElements.whenDefined('dist-late-is');
	await Promise.resolve();
	assert.eq(constructed.join(), 'a,b');
	assert.eq(el.innerHTML, `<div><dist-late-tag name="a"></dist-late-tag><p is="dist-late-is" name="b"></p></div>`);
});

Testimony.test('Dist.attribs.string', `A string of whole attributes is applied in the minified build`, () => {
	// The minifier takes String.replace() to have no side effects.  Util.splitAttribs() once
	// collected the attributes from inside a replace() callback and ignored what the call
	// returned, so the minified build deleted the call and every such string applied nothing,
	// while the source and unminified builds kept working.
	let el = document.createElement('div');
	hMin(el)`<div><b ${'title="I have a title" data-x=2 hidden'}>a</b></div>`;
	let b = el.querySelector('b');
	assert.eq(b.getAttribute('title'), 'I have a title');
	assert.eq(b.getAttribute('data-x'), '2');
	assert.eq(b.hasAttribute('hidden'), true);
});

Testimony.test('Dist.tokenizer.comments', `An html comment holding an apostrophe, a quote or > renders in the minified build, whose tokenizer is one pattern that has to come through the minifier unchanged`, () => {
	let el = document.createElement('div');
	let render = value => hMin(el)`<!-- don't "quote" > --><p title=${value}>${value}</p><!-- it's ${value} --!><i>${value}</i>`;
	render(1);
	assert.eq(el.querySelector('p').outerHTML + el.querySelector('i').outerHTML, '<p title="1">1</p><i>1</i>');
	render(2);
	assert.eq(el.querySelector('p').outerHTML + el.querySelector('i').outerHTML, '<p title="2">2</p><i>2</i>');
});

Testimony.test('Dist.tokenizer.quoteInUnquotedValue', `An apostrophe or a quote in an attribute value written without quotes opens nothing in the minified build`, () => {
	let el = document.createElement('div');
	let render = value => hMin(el)`<p title=don't data-x=a"b>${value}</p><!x isn't><a href=/s?q=it's&n=${value}>${value}</a>`;
	render(1);
	assert.eq(el.querySelector('p').outerHTML + el.querySelector('a').outerHTML, `<p title="don't" data-x="a&quot;b">1</p><a href="/s?q=it's&amp;n=1">1</a>`);
	render(2);
	assert.eq(el.querySelector('p').outerHTML + el.querySelector('a').outerHTML, `<p title="don't" data-x="a&quot;b">2</p><a href="/s?q=it's&amp;n=2">2</a>`);
});

Testimony.test('Dist.tokenizer.rawText', `A < in the text of a script or a style opens no tag in the minified build`, () => {
	let el = document.createElement('div');
	let render = value => hMin(el, {scripts: false, styles: false})`<script type="text/plain">if (a<b) c(${value}) // isn't html</script><style>/* <b */ p { margin: ${value}px }</style><p title="${value}">${value}</p>`;
	render(1);
	assert.eq(el.querySelector('script').textContent, `if (a<b) c(1) // isn't html`);
	assert.eq(el.querySelector('style').textContent, '/* <b */ p { margin: 1px }');
	render(2);
	assert.eq(el.querySelector('script').textContent, `if (a<b) c(2) // isn't html`);
	assert.eq(el.querySelector('style').textContent, '/* <b */ p { margin: 2px }');
	assert.eq(el.querySelector('p').outerHTML, '<p title="2">2</p>');
});

Testimony.test('Dist.defineClass.registeredName', `A component class keeps the tag name it was registered under in the minified build`, () => {
	// Util.defineClass() asks customElements.getName() whether a class has a name already.  The
	// minifier renames property names it does not know to be the browser's, and its list is older
	// than getName(), so the call has to be written in a way that keeps the name.  Renamed, it is
	// a call of something that does not exist, and nothing that creates a component works.
	class DistOddName extends HTMLElement {}
	customElements.define('dist-registered-name', DistOddName);
	assert.eqJson(hMin(DistOddName, null).html, ['<dist-registered-name></dist-registered-name>']);

	// A class nothing has registered is registered when its first instance is made.
	class DistAutoName extends SolariteMin {
		render() {
			hMin(this)`<dist-auto-name>x</dist-auto-name>`;
		}
	}
	let el = new DistAutoName();
	assert.eq(el.tagName, 'DIST-AUTO-NAME');
	assert.eq(customElements.getName(DistAutoName), 'dist-auto-name');

	// A name given without a dash gets one.
	class DistGivenName extends SolariteMin {}
	DistGivenName.define('distgiven');
	assert.eq(customElements.getName(DistGivenName), 'distgiven-element');
});

Testimony.test('Dist.toEl.object', `toEl() finds an object's render() by name in the minified build`, () => {
	// 1. render() that calls h(this)`...`
	let el = toElMin({
		label: 'a',
		render() {
			hMin(this)`<b>${this.label}</b>`;
		}
	});
	assert.eq(el.tagName, 'B');
	assert.eq(el.textContent, 'a');
	el.label = 'b';
	el.render();
	assert.eq(el.textContent, 'b');

	// 2. render() that calls h(this, template)
	el = toElMin({
		render() {
			hMin(this, hMin`<i>x</i>`);
		}
	});
	assert.eq(el.tagName, 'I');
	assert.eq(el.textContent, 'x');
});

Testimony.test('Dist.toEl.topLevelExpression', `A standalone template with an expression at its top level gives a DocumentFragment of everything it draws in the minified build, and one element is still given alone`, () => {
	let total = hMin()`Total: ${5}`;
	let list = toElMin(hMin`<h1>Fruit</h1>${[1, 2].map(i => hMin`<p>${i}</p>`)}`);
	assert(total instanceof DocumentFragment);
	assert(list instanceof DocumentFragment);
	let host = document.createElement('div');
	host.append(total, list);
	assert.eq(host.innerHTML.replace(/<!--.*?-->/g, ''), 'Total: 5<h1>Fruit</h1><p>1</p><p>2</p>');

	let one = hMin()`
		<b>${'x'}</b><!-- ${'commented out'} -->`;
	assert.eq(one.outerHTML, '<b>x</b>');
});

Testimony.test('Dist.translated', `Text that is all its element holds shows a new value after a page translator replaced its Text node, in the minified build`, () => {
	let el = document.createElement('div'), name = 'one';
	let render = () => hMin(el)`<p>Hello <span>${name}</span>!</p>`;
	render();

	// What Chrome's translator does to a Text node.
	let span = el.querySelector('span'), font = document.createElement('font');
	font.textContent = 'uno';
	span.firstChild.replaceWith(font);

	name = 'two';
	render();
	assert.eq(span.innerHTML, 'two');
});

Testimony.test('Dist.attrib.contenteditableValueEmpties', 'Empty values clear and refill a contenteditable in the minified build.', () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = value => hMin(el)`<div contenteditable value=${value}></div>`;
	try {
		render('abc');
		let div = el.firstElementChild;
		assert.eq(div.innerHTML, 'abc');
		for (let empty of ['', null, undefined, false]) {
			render('<b>abc</b>');
			assert.eq(div.innerHTML, '<b>abc</b>');

			render(empty);
			assert.eq(el.firstElementChild, div);
			assert.eq(div.innerHTML, '');
			assert.eq(div.getAttribute('value'), null);
		}

		render('de');
		assert.eq(el.firstElementChild, div);
		assert.eq(div.innerHTML, 'de');
	}
	finally {
		el.remove();
	}
});

Testimony.test('Dist.hasChanged', `hasChanged() works in the minified build.  The argument here has a toJSON() on its class that returns a function, which only the replacer can tell apart from another.  If the minifier renamed toJSON where Solarite looks for it, the fast comparison would take the argument for plain data and miss the change.`, () => {
	let lastChanged, cb = () => 1;

	class DistChangedChild extends HTMLElement {
		render(attribs=null, hasChanged=() => true) {
			lastChanged = hasChanged();
			hMin(this)`<div>x</div>`;
		}
	}
	customElements.define('dist-changed-child', DistChangedChild);

	class Hider {
		n = 1;
		toJSON() { return {cb}; }
	}
	let arg = new Hider();

	class DistChangedParent extends HTMLElement {
		render() {
			hMin(this)`<dist-changed-parent><dist-changed-child arg=${arg}></dist-changed-child></dist-changed-parent>`;
		}
	}
	customElements.define('dist-changed-parent', DistChangedParent);

	let a = new DistChangedParent();
	a.render();
	a.render();
	assert.eq(lastChanged, false);

	cb = () => 2;
	a.render();
	assert.eq(lastChanged, true);
});
