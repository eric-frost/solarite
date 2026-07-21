import Testimony, {assert} from './Testimony.js';
import h from '../src/Solarite.js';

// Targeted checks for the detached-parent bulk-insert detour in applyKeyed step 5a:
// when a whole-parent keyed list is fully replaced with more than 500 rows, the parent
// element is detached before the insert loop and reattached once afterward.  These tests
// prove the detour fires exactly when intended (observed via a MutationObserver on the
// grandparent), that every guarded case stays on the old direct-insert path, and that
// rendered output, node identity, events, and focus are unchanged either way.

/**
 * Build n keyed row templates with keys starting at keyBase. */
function makeRows(n, keyBase=0) {
	let rows = new Array(n);
	for (let i=0; i<n; i++)
		rows[i] = h`<p key=${keyBase + i}>${'r' + (keyBase + i)}</p>`;
	return rows;
}

/**
 * Watch parent's own childList (not subtree) and report whether the given child
 * was removed and re-added during fn() — i.e. whether the detour fired. */
function sawDetach(parent, child, fn) {
	let mo = new MutationObserver(() => {});
	mo.observe(parent, {childList: true});
	fn();
	let recs = mo.takeRecords();
	mo.disconnect();
	let removed = recs.some(r => [...r.removedNodes].includes(child));
	let added = recs.some(r => [...r.addedNodes].includes(child));
	return removed && added;
}

Testimony.test('DetachSmoke.createLargeFromEmpty', () => {
	let el = document.createElement('div');
	document.body.append(el);

	// Krausest shape: empty keyed tbody, then create-rows in one render.
	let rows = [];
	let render = () => h(el)`<table><tbody>${rows}</tbody></table>`;
	render();
	let tbody = el.querySelector('tbody');
	assert.eq(tbody.childElementCount, 0);

	rows = new Array(1200);
	for (let i=0; i<1200; i++)
		rows[i] = h`<tr key=${i}><td>${'r' + i}</td></tr>`;
	let detoured = sawDetach(el.querySelector('table'), tbody, render);

	assert(detoured); // The detour must fire for a >500-row create into an empty list.
	assert.eq(el.querySelector('tbody'), tbody); // Same node reattached.
	assert.eq(tbody.childElementCount, 1200);
	assert.eq(tbody.firstElementChild.textContent, 'r0');
	assert.eq(tbody.children[599].textContent, 'r599');
	assert.eq(tbody.lastElementChild.textContent, 'r1199');
	assert(tbody.isConnected);

	el.remove();
});

Testimony.test('DetachSmoke.replaceAllLarge', () => {
	let el = document.createElement('div');
	document.body.append(el);

	let rows = makeRows(800);
	let render = () => h(el)`<div class="wrap">${rows}</div>`;
	render();
	let list = el.firstElementChild;
	assert.eq(list.childElementCount, 800);
	let oldFirst = list.firstElementChild;

	// All-new keys: kept === 0, full region → fastClear + detour.
	rows = makeRows(800, 10000);
	let detoured = sawDetach(el, list, render);

	assert(detoured);
	assert.eq(list.childElementCount, 800);
	assert.eq(list.firstElementChild.textContent, 'r10000');
	assert.eq(list.lastElementChild.textContent, 'r10799');
	assert(list.firstElementChild !== oldFirst); // Keyed semantics: new keys get new nodes.

	el.remove();
});

Testimony.test('DetachSmoke.smallListStaysDirect', () => {
	let el = document.createElement('div');
	document.body.append(el);

	let rows = makeRows(100);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	let list = el.firstElementChild;

	rows = makeRows(100, 5000);
	let detoured = sawDetach(el, list, render);

	assert(!detoured); // At or below the threshold, inserts stay on the direct path.
	assert.eq(list.childElementCount, 100);
	assert.eq(list.firstElementChild.textContent, 'r5000');

	el.remove();
});

Testimony.test('DetachSmoke.notWholeParentSkips', () => {
	let el = document.createElement('div');
	document.body.append(el);

	// Leading text keeps the list from being the parent's entire content,
	// so wholeParent is false and the detour must not fire.
	let rows = makeRows(600);
	let render = () => h(el)`<div>head${rows}</div>`;
	render();
	let list = el.firstElementChild;

	rows = makeRows(600, 20000);
	let detoured = sawDetach(el, list, render);

	assert(!detoured);
	assert.eq(list.querySelectorAll('p').length, 600);
	assert(list.textContent.startsWith('headr20000'));
	assert(list.textContent.endsWith('r20599'));

	el.remove();
});

Testimony.test('DetachSmoke.keptRowsUse5b', () => {
	let el = document.createElement('div');
	document.body.append(el);

	let rows = makeRows(600);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	let list = el.firstElementChild;
	let keeper = list.children[300]; // key 300

	// Keep one key in the middle; kept > 0 routes to step 5b, never the detour.
	// The kept row must come from the same template call site (inside makeRows)
	// or itemClose treats it as a different shape and recreates it.
	rows = makeRows(600, 40000);
	rows[250] = makeRows(1, 300)[0];
	let detoured = sawDetach(el, list, render);

	assert(!detoured);
	assert.eq(list.childElementCount, 600);
	assert.eq(list.children[250], keeper); // Node identity followed the kept key.
	assert.eq(list.children[0].textContent, 'r40000');
	assert.eq(list.children[599].textContent, 'r40599');

	el.remove();
});

Testimony.test('DetachSmoke.disconnectedParentSkips', () => {
	// Never appended to the document: the gate's isConnected check skips the
	// detour, and rendering must still work on the fully detached tree.
	let el = document.createElement('div');

	let rows = makeRows(600);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	let list = el.firstElementChild;
	assert.eq(list.childElementCount, 600);

	rows = makeRows(600, 60000);
	render();
	assert.eq(list.childElementCount, 600);
	assert.eq(list.firstElementChild.textContent, 'r60000');
	assert.eq(list.lastElementChild.textContent, 'r60599');
});

Testimony.test('DetachSmoke.customElementParentSkips', () => {
	// The reachable custom-element-parent case: a self-rendering h(this) component
	// whose root element directly wraps the keyed list, so the wholeParent node IS
	// the component.  Detaching it mid-render would fire its disconnected/connected
	// callbacks, where subclasses may run teardown logic — the gate must skip it.
	class DetachSelfList extends HTMLElement {
		connectedCallback() { DetachSelfList.conn++; this.render(); }
		disconnectedCallback() { DetachSelfList.disc++; }
		render() { h(this)`<detach-self-list>${this.rows}</detach-self-list>`; }
	}
	DetachSelfList.conn = 0;
	DetachSelfList.disc = 0;
	customElements.define('detach-self-list', DetachSelfList);

	let list = document.createElement('detach-self-list');
	list.rows = makeRows(600);
	document.body.append(list); // connectedCallback renders the first 600 rows.
	assert.eq(DetachSelfList.conn, 1);
	assert.eq(list.childElementCount, 600);

	list.rows = makeRows(600, 80000);
	let detoured = sawDetach(document.body, list, () => list.render());

	assert(!detoured);
	assert.eq(DetachSelfList.disc, 0); // Lifecycle callbacks never fired mid-render.
	assert.eq(DetachSelfList.conn, 1);
	assert.eq(list.childElementCount, 600);
	assert.eq(list.firstElementChild.textContent, 'r80000');
	assert.eq(list.lastElementChild.textContent, 'r80599');

	list.remove();
});

Testimony.test('DetachSmoke.eventsSurviveReattach', () => {
	let el = document.createElement('div');
	document.body.append(el);

	// Delegated handlers ride on per-node expandos; detach/reattach must not lose them.
	let clicked = [];
	let rows = new Array(600);
	for (let i=0; i<600; i++)
		rows[i] = h`<p key=${i} onclick=${() => clicked.push(i)}>${'r' + i}</p>`;
	h(el)`<div>${rows}</div>`;

	let list = el.firstElementChild;
	list.children[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	list.children[599].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(clicked.join(','), '0,599');

	el.remove();
});

Testimony.test('DetachSmoke.clearThenRecreate', () => {
	let el = document.createElement('div');
	document.body.append(el);

	// Krausest 09 + 07 sequence: create, clear, create again.
	let rows = makeRows(700);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	let list = el.firstElementChild;
	assert.eq(list.childElementCount, 700);

	rows = [];
	render();
	assert.eq(list.childElementCount, 0);

	rows = makeRows(700, 90000);
	render();
	assert.eq(list.childElementCount, 700);
	assert.eq(list.firstElementChild.textContent, 'r90000');
	assert.eq(list.lastElementChild.textContent, 'r90699');

	el.remove();
});

Testimony.test('DetachSmoke.focusOutsideSurvives', () => {
	let el = document.createElement('div');
	document.body.append(el);
	let input = document.createElement('input');
	document.body.append(input);
	input.focus();

	let rows = makeRows(600);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	rows = makeRows(600, 70000);
	render(); // Detour fires; focus outside the detached parent must be untouched.

	assert.eq(document.activeElement, input);
	assert.eq(el.firstElementChild.childElementCount, 600);

	input.remove();
	el.remove();
});
