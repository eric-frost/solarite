import Testimony, {assert} from './Testimony.js';
import h from '../src/Solarite.js';

// Targeted checks for the collectItems alias fast path: an all-Templates array
// is borrowed directly during apply, so re-rendering after the USER mutates
// their own array (same instance or new instance) must behave exactly like the
// old copying path, and Solarite must not hold a reference to the array.

Testimony.test('AliasSmoke.sameArrayMutated', () => {
	let el = document.createElement('div');
	document.body.append(el);

	let rows = [h`<p>a</p>`, h`<p>b</p>`];
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	assert.eq(el.querySelectorAll('p').length, 2);
	assert.eq(el.textContent, 'ab');

	// Mutate the SAME array instance in place, then re-render.
	rows.push(h`<p>c</p>`);
	rows[0] = h`<p>A</p>`;
	render();
	assert.eq(el.querySelectorAll('p').length, 3);
	assert.eq(el.textContent, 'Abc');

	// Shrink in place.
	rows.length = 1;
	render();
	assert.eq(el.querySelectorAll('p').length, 1);
	assert.eq(el.textContent, 'A');

	el.remove();
});

Testimony.test('AliasSmoke.keyedSameArrayMutated', () => {
	let el = document.createElement('div');
	document.body.append(el);

	let data = [{id: 1, t: 'one'}, {id: 2, t: 'two'}, {id: 3, t: 'three'}];
	let rows = data.map(d => h`<p key=${d.id}>${d.t}</p>`);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	assert.eq(el.textContent, 'onetwothree');
	let first = el.querySelector('p');

	// Swap two entries of the same array instance; keyed diff should move nodes.
	[rows[0], rows[2]] = [rows[2], rows[0]];
	render();
	assert.eq(el.textContent, 'threetwoone');
	assert.eq(el.querySelectorAll('p')[2], first); // Node identity followed the key.

	el.remove();
});

Testimony.test('AliasSmoke.mixedArrayFallsBack', () => {
	let el = document.createElement('div');
	document.body.append(el);

	// A non-Template element anywhere must take the copying path with identical results.
	let rows = [h`<p>a</p>`, 'text', 5, null, [h`<p>b</p>`]];
	h(el)`<div>${rows}</div>`;
	assert.eq(el.firstElementChild.childNodes.length, 5); // p, 'text', '5', '', p
	assert.eq(el.textContent, 'atext5b');

	el.remove();
});

Testimony.test('AliasSmoke.frozenArray', () => {
	let el = document.createElement('div');
	document.body.append(el);

	// The alias must never write to the user's array; a frozen one would throw in strict mode.
	let rows = Object.freeze([h`<p>x</p>`, h`<p>y</p>`]);
	h(el)`<div>${rows}</div>`;
	assert.eq(el.textContent, 'xy');
	h(el)`<div>${Object.freeze([h`<p>z</p>`])}</div>`;
	assert.eq(el.textContent, 'z');

	el.remove();
});
