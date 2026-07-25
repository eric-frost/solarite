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
