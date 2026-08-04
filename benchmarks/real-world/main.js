/**
 * A Solarite-only regression suite for various real-world performance shapes.
 *
 * The well known js-framework-benchmark measures exactly one page: a flat table of 1,000 to 10,000 rows that is
 * created, replaced, swapped, and cleared, with 56% of its weighted score coming from the
 * four "create" benchmarks alone.  It has no nested components, no scoped styles, no forms,
 * no SVG, and no two-way binding, so a change that made component mounting 20% slower could
 * ship without moving that score at all.  These seven scenarios cover the blind spots:
 *
 * 1. Mounting 200 nested component cards, and updating 20 of those 200.
 * 2. Mounting 150 components that each carry a :host <style> block, which exercises the
 *    scoped-style rewriting that the row table never touches.
 * 3. Dispatching 20 two-way-bound input events into a 200-row form.
 * 4. Updating 50 of 500 SVG circles.
 * 5. Reordering 500 raw Nodes passed straight into a template, rather than Templates.
 * 6. Rotating a plain keyed list of 1,000 rows.
 *
 * Each scenario reports cold, warm median, and warm p90 on its own.  There is deliberately
 * no composite score: a single blended number invites exactly the failure this suite exists
 * to catch, where one scenario regresses badly, another improves, and the total looks flat.
 * For the same reason these numbers are only comparable to other revisions of Solarite
 * measured back-to-back in the same browser session, and are not a cross-framework claim.
 *
 * Every scenario ends in a verify() step to make sure we're not just fast, but also
 * functional.  A sample covers the synchronous Solarite work plus a
 * forced layout, so work deferred into layout still counts.
 *
 * Note that this file is free to use requestAnimationFrame and h.map even though the
 * js-framwork Solarite benchmarks are not.
 */
import h, {Solarite, svg} from '../../dist/Solarite.js';

const sandbox = document.querySelector('#sandbox');
const resultsBody = document.querySelector('#results');
const runButton = document.querySelector('#run');
const runsInput = document.querySelector('#runs');
const status = document.querySelector('#status');

function nextFrame() {
	return new Promise(resolve => {
		let timeout = setTimeout(resolve, 50);
		requestAnimationFrame(() => {
			clearTimeout(timeout);
			resolve();
		});
	});
}

function percentile(values, fraction) {
	let sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function makeRecords(count, generation=0) {
	return Array.from({length: count}, (_, id) => ({
		id,
		name: `Customer ${id}`,
		status: (id + generation) % 3 === 0 ? 'Delayed' : 'Ready',
		value: (id * 17 + generation) % 101,
	}));
}

class RealBenchCard extends Solarite {
	record = {id: 0, name: '', status: '', value: 0};

	render(attribs={}) {
		if (attribs.record)
			this.record = attribs.record;
		let record = this.record;
		h(this)`<real-bench-card><h3>${record.name}</h3><progress max="100" value=${record.value}></progress><span>${record.status}</span><small>#${record.id}</small></real-bench-card>`;
	}
}
RealBenchCard.define('real-bench-card');

class RealBenchDashboard extends Solarite {
	records = [];

	render() {
		h(this)`<real-bench-dashboard>${h.map(this.records, record =>
			h`<real-bench-card record=${record}></real-bench-card>`
		)}</real-bench-dashboard>`;
	}
}
RealBenchDashboard.define('real-bench-dashboard');

class RealBenchStyledTile extends Solarite {
	value = 0;

	render(attribs={}) {
		if (attribs.value !== undefined)
			this.value = attribs.value;
		h(this)`<real-bench-styled-tile><style>:host { display:inline-block; padding:2px } :host(.hot) { font-weight:bold } span { color:rgb(20 90 160) }</style><span>${this.value}</span></real-bench-styled-tile>`;
	}
}
RealBenchStyledTile.define('real-bench-styled-tile');

class RealBenchStyleGrid extends Solarite {
	values = [];

	render() {
		h(this)`<real-bench-style-grid>${this.values.map(value =>
			h`<real-bench-styled-tile class=${value % 7 ? '' : 'hot'} value=${value}></real-bench-styled-tile>`
		)}</real-bench-style-grid>`;
	}
}
RealBenchStyleGrid.define('real-bench-style-grid');

class RealBenchForm extends Solarite {
	rows = [];

	render() {
		h(this)`<real-bench-form><form oninput=${this.render}>${this.rows.map(row => h`<label><input data-row=${row.id} value=${[row, 'name']}><input type="number" value=${[row, 'quantity']}><input type="checkbox" checked=${[row, 'active']}><output>${row.name}: ${row.quantity}</output></label>`)}</form></real-bench-form>`;
	}
}
RealBenchForm.define('real-bench-form');

class RealBenchChart extends Solarite {
	points = [];

	render() {
		h(this)`<real-bench-chart><svg viewBox="0 0 1000 200">${this.points.map(point =>
			svg`<circle cx=${point.x} cy=${point.y} r=${point.r} fill=${point.fill}></circle>`
		)}</svg></real-bench-chart>`;
	}
}
RealBenchChart.define('real-bench-chart');

class RealBenchNodes extends Solarite {
	nodes = [];

	render() {
		h(this)`<real-bench-nodes><ul>${this.nodes}</ul></real-bench-nodes>`;
	}
}
RealBenchNodes.define('real-bench-nodes');

class RealBenchKeyed extends Solarite {
	items = [];

	render() {
		h(this)`<real-bench-keyed><ol>${this.items.map(item =>
			h`<li key=${item.id} data-key=${item.id}><b>${item.name}</b><span>${item.value}</span></li>`
		)}</ol></real-bench-keyed>`;
	}
}
RealBenchKeyed.define('real-bench-keyed');

const scenarios = [
	{
		name: 'Nested components: mount 200 cards',
		setup: () => ({current: null, generation: 0}),
		run(state) {
			state.current?.remove();
			let app = new RealBenchDashboard();
			app.records = makeRecords(200, state.generation++);
			sandbox.append(app);
			app.render();
			state.current = app;
		},
		verify: state => {
			if (state.current.querySelectorAll('real-bench-card').length !== 200)
				throw new Error('Nested component mount rendered the wrong card count.');
		},
		cleanup: state => state.current?.remove(),
	},
	{
		name: 'Nested components: update 20 of 200 cards',
		setup() {
			let app = new RealBenchDashboard();
			app.records = makeRecords(200);
			sandbox.append(app);
			app.render();
			return {app, generation: 0};
		},
		run(state) {
			state.generation++;
			for (let i=0; i<state.app.records.length; i+=10) {
				let record = state.app.records[i];
				state.app.records[i] = {...record,
					status: `Updated ${state.generation}`,
					value: (record.value + 1) % 101};
			}
			state.app.render();
		},
		verify: state => {
			if (!state.app.querySelector('real-bench-card span')?.textContent.startsWith('Updated'))
				throw new Error('Nested component update did not reach the child.');
		},
		cleanup: state => state.app.remove(),
	},
	{
		name: 'Scoped styles: mount 150 component instances',
		setup: () => ({current: null, generation: 0}),
		run(state) {
			state.current?.remove();
			let app = new RealBenchStyleGrid();
			app.values = Array.from({length: 150}, (_, i) => i + state.generation++);
			sandbox.append(app);
			app.render();
			state.current = app;
		},
		verify: state => {
			if (state.current.querySelectorAll('real-bench-styled-tile').length !== 150)
				throw new Error('Scoped-style mount rendered the wrong tile count.');
		},
		cleanup: state => state.current?.remove(),
	},
	{
		name: 'Forms: 20 two-way-bound input events',
		setup() {
			let app = new RealBenchForm();
			app.rows = Array.from({length: 200}, (_, id) => ({
				id,
				name: `Item ${id}`,
				quantity: id % 10,
				active: id % 2 === 0,
			}));
			sandbox.append(app);
			app.render();
			return {app, generation: 0};
		},
		run(state) {
			state.generation++;
			let inputs = state.app.querySelectorAll('input:first-child');
			for (let i=0; i<20; i++) {
				let input = inputs[i * 5];
				input.value = `Changed ${state.generation}-${i}`;
				input.dispatchEvent(new Event('input', {bubbles: true}));
			}
		},
		verify: state => {
			if (state.app.rows[0].name !== `Changed ${state.generation}-0`)
				throw new Error('Two-way binding did not update the form model.');
		},
		cleanup: state => state.app.remove(),
	},
	{
		name: 'SVG: update 50 of 500 circles',
		setup() {
			let app = new RealBenchChart();
			app.points = Array.from({length: 500}, (_, id) => ({
				id,
				x: id * 2,
				y: 20 + id % 160,
				r: 2 + id % 4,
				fill: id % 2 ? '#276ef1' : '#e15c41',
			}));
			sandbox.append(app);
			app.render();
			return {app, generation: 0};
		},
		run(state) {
			state.generation++;
			for (let i=0; i<state.app.points.length; i+=10)
				state.app.points[i] = {...state.app.points[i], y: 20 + state.generation % 160};
			state.app.render();
		},
		verify: state => {
			let circles = state.app.querySelectorAll('circle');
			if (circles.length !== 500 || circles[0].getAttribute('cy') !== 20 + state.generation % 160 + '')
				throw new Error('SVG update rendered the wrong circles.');
		},
		cleanup: state => state.app.remove(),
	},
	{
		name: 'Raw Nodes: reorder 500 existing nodes',
		setup() {
			let app = new RealBenchNodes();
			app.nodes = Array.from({length: 500}, (_, id) => {
				let node = document.createElement('li');
				node.dataset.key = id;
				node.textContent = `Node ${id}`;
				return node;
			});
			sandbox.append(app);
			app.render();
			return {app};
		},
		run(state, iteration) {
			let amount = 37 + iteration % 23;
			state.app.nodes = state.app.nodes.slice(amount).concat(state.app.nodes.slice(0, amount));
			state.app.render();
		},
		verify: state => {
			if (state.app.querySelector('li') !== state.app.nodes[0])
				throw new Error('Raw-Node reorder lost node identity or order.');
		},
		cleanup: state => state.app.remove(),
	},
	{
		name: 'Plain keyed list: rotate 1,000 rows',
		setup() {
			let app = new RealBenchKeyed();
			app.items = makeRecords(1000);
			sandbox.append(app);
			app.render();
			let nodes = new Map([...app.querySelectorAll('li')].map(node =>
				[Number(node.dataset.key), node]));
			return {app, nodes};
		},
		run(state, iteration) {
			let amount = 83 + iteration % 41;
			state.app.items = state.app.items.slice(amount).concat(state.app.items.slice(0, amount));
			state.app.render();
		},
		verify: state => {
			let first = state.app.items[0];
			if (state.app.querySelector('li') !== state.nodes.get(first.id))
				throw new Error('Plain keyed reorder lost row identity or order.');
		},
		cleanup: state => state.app.remove(),
	},
];

async function measureScenario(scenario, runs) {
	let state = scenario.setup();
	let samples = [];
	await nextFrame();

	for (let i=0; i<runs; i++) {
		let start = performance.now();
		scenario.run(state, i);
		sandbox.getBoundingClientRect();
		samples.push(performance.now() - start);
		await nextFrame();
	}

	scenario.verify(state);
	scenario.cleanup(state);
	let warm = samples.slice(1);
	return {
		name: scenario.name,
		cold: samples[0],
		median: percentile(warm, .5),
		p90: percentile(warm, .9),
		samples,
	};
}

function showResult(result) {
	let row = document.createElement('tr');
	row.innerHTML = `<td></td><td></td><td></td><td></td>`;
	row.children[0].textContent = result.name;
	row.children[1].textContent = result.cold.toFixed(2) + ' ms';
	row.children[2].textContent = result.median.toFixed(2) + ' ms';
	row.children[3].textContent = result.p90.toFixed(2) + ' ms';
	resultsBody.append(row);
}

export async function runRealWorldBenchmarks(runs=12) {
	runs = Math.max(2, Number(runs) || 12);
	runButton.disabled = true;
	resultsBody.replaceChildren();
	status.textContent = 'Running…';
	let results = [];

	try {
		for (let scenario of scenarios) {
			status.textContent = `Running ${scenario.name}…`;
			let result = await measureScenario(scenario, runs);
			results.push(result);
			showResult(result);
		}
		status.textContent = 'Complete';
		window.__realWorldBenchmarkResults = results;
		window.parent?.onRealWorldBenchmarkComplete?.(results);
		return results;
	}
	catch (error) {
		status.textContent = error.message;
		window.__realWorldBenchmarkError = error.message;
		window.parent?.onRealWorldBenchmarkError?.(error.message);
		throw error;
	}
	finally {
		runButton.disabled = false;
		sandbox.replaceChildren();
	}
}

window.runRealWorldBenchmarks = runRealWorldBenchmarks;
runButton.addEventListener('click', () => runRealWorldBenchmarks(runsInput.value));

let params = new URLSearchParams(location.search);
if (params.has('run') || params.has('runs')) {
	let runs = Number(params.get('runs')) || 12;
	runsInput.value = runs;
	runRealWorldBenchmarks(runs);
}
