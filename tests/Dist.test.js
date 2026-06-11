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

	a.children[0].dispatchEvent(new MouseEvent('click'));
	assert.eq(clicked, 1);
	assert.eq(clickedArg, 3);

	a.children[1].dispatchEvent(new MouseEvent('click'));
	assert.eq(clicked, 2);
	assert.eq(clickedArg, 4);

	// Rebind with a new arrow function on re-render, then click again.
	a.render();
	a.children[1].dispatchEvent(new MouseEvent('click'));
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
