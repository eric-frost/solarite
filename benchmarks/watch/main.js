// TO make this work, first uncomment this line from Solarite.js and rebuild:
// export {default as watch, renderWatched} from './watch.js';

import {Solarite, r, watch, renderWatched} from './Solarite.min.js';
//import {Solarite, r, watch, renderWatched} from '../../src/Solarite.js';

let urlParams = new URLSearchParams(window.location.search);
let benchmark = urlParams.get('benchmark');
if (benchmark === '')
	benchmark = 1;
let run = urlParams.has('run');


let idCounter = 1;
const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"],
	colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"],
	nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

function _random (max) {
	return Math.round(Math.random() * 1000) % max
}

function buildData(count) {
	let data = new Array(count);
	for (let i = 0; i < count; i++) {
		let row = {
			id: idCounter++,
			label: `${adjectives[_random(adjectives.length)]} ${colours[_random(colours.length)]} ${nouns[_random(nouns.length)]}`,
			selected: false,
			// getLabel() { return row.label},
			// getId() { return row.id},
			// getClass() { return row.selected ? 'danger' : ''},
		}
		data[i] = row;
	}
	return data;
}




class JSFrameworkBenchmark extends Solarite {
	data = [];

	constructor() {
		super();

		watch(this, 'data');
	}

	// Mimic what the js-framework-benchmark does.
	// This is useful to see if performance changes after code modifications.
	async benchmark(runs=1) {
		let times = [];
		let results = [];

		// Helper function to calculate geometric mean
		const geometricMean = (arr) => {
			return Math.pow(arr.reduce((a, b) => (a || .1) * (b || .1), 1), 1 / arr.length);
		};

		const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

		const run = async (name, callback) => {
			const start = performance.now();
			callback();
			const time = performance.now() - start;
			times.push(time);
			console.log(`${name}: ${time.toFixed(2)}ms.`);
			await sleep(20); // wait for render before starting next test.
		}

		// Time the creation of rows
		for (let i=0; i<runs; i++) {
			times = [];

			// Helper function to calculate geometric mean
			const geometricMean = (arr) => {
				return Math.pow(arr.reduce((a, b) => (a || .1) * (b||.1), 1), 1 / arr.length);
			};

			await run('Create Rows', () => this.runBench());
			await run('Replace All Rows', () => this.runBench());
			await run('Partial Update', () => this.updateBench());
			await run('Select Row', () => this.setSelectedBench(this.data[1]));
			await run('Swap Rows', () => this.swapRowsBench());
			await run('Remove Row', () => this.removeBench(this.data[1].id));
			await run('Clear Rows', () => this.clearBench());
			await run('Create Many Rows', () => this.runLotsBench());
			await run('Append Rows', () => this.addBench());
			await run('Clear Rows', () => this.clearBench());

			// Log the geometric mean of all steps
			const geoMean = geometricMean(times);
			results.push(geoMean);
			console.log(`*** Geometric mean: ${geoMean.toFixed(2)}ms`);
		}

		if (runs > 1) {
			console.log('---');
			let avg = results.reduce((a, b) => a + b) / results.length;
			console.log(`Min: ${Math.min(...results)}ms`);
			console.log(`Max: ${Math.max(...results)}ms`);
			console.log(`Avg: ${avg}ms`);
		}
	}

	// Create 1000 rows
	runBench() {
		//renderUnwatched(() => {
		//debugger;
			this.data = buildData(1000); // setting this.data is fast.
			renderWatched(this); // Makes update every 10th row fail if we clear and run again.
		//	this.render()
		//});
	}

	// Create 10,000 rows
	runLotsBench() {
		//renderUnwatched(() => {
			this.data = buildData(10_000);
			renderWatched(this);
			//this.render();
		//});
	}

	// Append 1,000 rows
	addBench() {
		this.data.push(...buildData(1000));
		renderWatched(this); // fails!
		//this.render();
	}

	// Update every 10th row
	updateBench() {
		let len = this.data.length;
		for (let i=0; i<len; i+=10)
			this.data[i].label += ' !!!';
		renderWatched(this);
	}

	// Swap the 2nd and 998th rows
	swapRowsBench() {
		if (this.data.length > 998) {

			// Cheat:  swap in reverse
			// let temp = this.data[998];
			// this.data[998] = this.data[1];
			// this.data[1] = temp;

			//
			//for (let i=0; i<10_000; i++) {
				let temp = this.data[1];
				this.data[1] = this.data[998];
				this.data[998] = temp;
				renderWatched(this);
			//}
		}
	}

	clearBench() {
		this.data = [];
		renderWatched(this);
		//this.render()
	}

	removeBench(id) {
		let index = this.data.findIndex(row=>row.id===id);
		this.data.splice(index, 1);
		renderWatched(this);
	}

	setSelectedBench(row) {
		//for (let i=0; i<100_000; i++) {
			row.selected = !row.selected;
			//this.render();
			renderWatched(this);
		//}
	}

	// If we used this, we'd be penalized: https://github.com/krausest/js-framework-benchmark/issues/801
	/*
	onClick(event) {
		if (event.target.tagName === 'A') {
			let tbody = this.querySelector('tbody');
			let index = Array.prototype.indexOf.call(tbody.children, event.target.parentNode.parentNode);
			this.setSelected(this.data[index]);
		}
		else if (event.target.tagName ==='SPAN') {
			let tbody = this.querySelector('tbody');
			let index = Array.prototype.indexOf.call(tbody.children, event.target.parentNode.parentNode);
			this.remove(this.data[index].id);
		}
	}*/

	render() {
		// Disable features we don't need, for performance.
		// At least until these new features are more performant.
		// doesn't seem to make that much performance difference to disable these?
		let options = {ids: false, scripts: false, styles: false}
		r(this, options)`
		<div class="container">
			<div class="jumbotron">
				<div class="row">
					<div class="col-md-6">
						<h1>Solarite Keyed</h1>
					</div>
					<div class="col-md-6">
						<div class="row">
							<div class="col-sm-6 smallpad">
								<button id="run" class="btn btn-primary btn-block" type="button" 
									onclick=${this.runBench}>Create 1,000 rows</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button id="runlots" class="btn btn-primary btn-block" type="button" 
									onclick=${this.runLotsBench}>Create 10,000 rows</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button id="add" class="btn btn-primary btn-block" type="button" 
									onclick=${this.addBench}>Append 1,000 rows</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button id="update" class="btn btn-primary btn-block" type="button" 
									onclick=${this.updateBench}>Update every 10th row</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button id="clear" class="btn btn-primary btn-block" type="button" 
									onclick=${this.clearBench}>Clear</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button id="swaprows" class="btn btn-primary btn-block" type="button" 
									onclick=${this.swapRowsBench}>Swap Rows</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<table class="table table-hover table-striped test-data"><tbody>
				${this.data.map(row =>
					r`<tr class="${() => row.selected ? 'danger' : ''}">
						<td class="col-md-1">${() => row.id}</td>
						<td class="col-md-4"><a onclick=${[this.setSelectedBench, row]}>${() => row.label}</a></td>
						<td class="col-md-1"><a onclick=${[this.removeBench, row.id]}><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
						<td class="col-md-6"/>
					</tr>`
				)}
			</tbody></table>
		</div>`;

		return this.modifications;
	}
}

let app = new JSFrameworkBenchmark();
document.body.append(app);


if (benchmark)
	app.benchmark(benchmark);
else if (run)
	app.run();