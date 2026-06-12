import Testimony from "./Testimony.js";

//import {h, Solarite} from "../src/Solarite.js";
import {h, Solarite} from "../dist/Solarite.js";
//import {h, Solarite} from "../dist/Solarite.min.js";


window.verify = false;

let rowCount = 10000


// Benchmarks are based on:
// https://github.com/krausest/js-framework-benchmark
// https://krausest.github.io/js-framework-benchmark/current.html


const rowTemplate = document.createElement("div");
rowTemplate.setAttribute('style', 'display: flex')
rowTemplate.innerHTML = `<div class="col-md-1"></div><div class="col-md-4"><a class="lbl"></a></div><div class="col-md-1"><a class="remove"><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></div><div class="col-md-6"></div>`;



function buildData(count = rowCount) {
	function _random(max) {
		return Math.round(Math.random()*1000)%max;
	}

	var adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
	var colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
	var nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];
	var data = [];
	for (let i=0; i<count; i++)
		data.push({id: i, label: adjectives[_random(adjectives.length)] + " " + colours[_random(colours.length)] + " " + nouns[_random(nouns.length)] });
	return data;
}




Testimony.test('Benchmark.vanilla._createRows',  `Create ${rowCount} rows`, () => {

	// Setup performance monitoring
	let startTime;
	let lcpObserver = new PerformanceObserver((entryList) => {
		const lastEntry = entryList.getEntries().pop();
		if (startTime) // [below] duration is always 0?
			console.log(`Largest Contentful Paint: ${lastEntry.startTime+lastEntry.duration - startTime}`);
	});
	lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });


	// Build table and data
	let table = document.createElement(`table`);
	let tbody = document.createElement('tbody');
	table.append(tbody)
	document.body.append(table);

	let data = buildData()

	function createRows() {
		for (let rowData of data) {
			let tr = rowTemplate.cloneNode(true);
			tr.firstChild.textContent = rowData.id
			tr.children[1].firstChild.textContent = rowData.label;
			tbody.append(tr);
		}
	}

	setTimeout(() => {
		startTime = performance.now();
		createRows();
	}, 100)
});

Testimony.test('Benchmark.vanilla._partialUpdate',  'Add text to every 10th row', async () => {

	// Build table and data
	let table = document.createElement(`div`);
	table.setAttribute('style', 'display: flex; flex-direction: row')
	let tbody = document.createElement('div');
	table.append(tbody)
	document.body.append(table);

	let data = buildData()

	function createRows() {
		for (let rowData of data) {
			let tr = rowTemplate.cloneNode(true);
			tr.firstChild.textContent = rowData.id
			tr.children[1].firstChild.textContent = rowData.label;
			tbody.append(tr);
		}
	}

	createRows();

	function updateRows() {
		let i = 0;
		let children = [...tbody.children]
		for (let tr of children) {
			if (i % 10 === 0) {
				let a = tr.children[1].firstChild;

				a.textContent = a.textContent.slice(0, -4) +  ' ' + Math.round(Math.random()*1000)

				// Alternate.  Seems to be about the same speed.
				// let b = document.createTextNode(a.textContent + '!!!');
				// a.parentNode.insertBefore(b, a);
				// a.remove();
			}
			i++;
		}
	}

	await new Promise(resolve => setTimeout(resolve, 1000));

	let start = performance.now();
	updateRows()
	const time = performance.now() - start;
	console.log(time)
	return time;

});

Testimony.test('Benchmark.solarite._createRows',  `Create ${rowCount.toLocaleString()} rows`, async () => {

	// Setup performance monitoring
	let startTime;
	let lcpObserver = new PerformanceObserver((entryList) => {
		const lastEntry = entryList.getEntries().pop();
		if (startTime) // [below] duration is always 0?
			console.log(`Largest Contentful Paint: ${lastEntry.startTime+lastEntry.duration - startTime}`);
	});
	lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });



	class A extends Solarite {
		data = []
		render() {
			h(this)`<div>
				<div style="display: flex: flex-direction: column">
					${this.data.map(row=>h`
						<div style="dispay: flex">
							<td class="col-md-1">${row.id}</td>
							<td class="col-md-4"><a class="lbl">${row.label}</a></td>
							<td class="col-md-1"><a class="remove"><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
							<td class="col-md-6"></td>
						</div>
					`)}
				</div>
				</div>`
		}
	}
	customElements.define('a-800', A);
	let a = new A();
	document.body.append(a);

	let data = buildData()


	function createRows() {
		a.data = data
		a.render();
	}

	await new Promise(resolve => setTimeout(resolve, 100));
	startTime = performance.now();
	createRows();
	const time = performance.now() - startTime;
	console.log(time);
	return time;

});

Testimony.test('Benchmark.solarite._partialUpdate',  `Update ${rowCount.toLocaleString()} rows`, async () => {

	class R810 extends Solarite {
		data = []

		// Removing spaces before and after the inner loop speeds up this benchmark by 25%.
		// But that makes performance measurements inconsistent across git revisions.
		render() {
			let options = {scripts: false, styles: false, ids: false}
			h(this, options)`
				<div>
					<div style='display: flex: flex-direction: column'>
						${this.data.map((row, i) => h`
							<div style='display: flex'>
								<div class='col-md-1'>${row.id}</div>
								<div class='col-md-4'><a class='lbl'>${row.label}</a></div>
								<div class='col-md-1'><a class='remove'><span class='remove glyphicon glyphicon-remove' aria-hidden='true'></span></a></div>
								<div class='col-md-6'></div>
							</div>
						`)}
					</div>
				</div>`
		}
	}
	let a = new R810();
	document.body.append(a);

	let data = buildData()


	function createRows() {
		a.data = data
		a.render();
	}

	createRows();

	function updateRows() {
		let i = 0;
		for (let row of a.data) {
			if (i % 10 === 0)
				row.label = row.label.slice(0, -4) +  ' ' + Math.round(Math.random()*1000)
			i++;
		}
	}

	// Sleep 1000 ms to allow the browser to catch up.
	// Otherwise the first measurement is skewed.
	await new Promise(resolve => setTimeout(resolve, 1000));

	let testCount = 10;
	let times = [];
	for (let i=0; i<testCount; i++) {
		let start = performance.now()
		updateRows();
		a.render();
		times.push(performance.now() - start)
	}

	let min = Math.min(...times);
	const avg = times.reduce((a, b) => a + b, 0) / times.length;
	console.log(`partialUpdate: ${min.toLocaleString()}ms best, ${avg.toLocaleString()}ms avg`)

	return min;

});


function runIframeBenchmark(runs) {
	return async (context) => {
		let avgResult = null;
		let bestResult = null;
		let coldResult = null;

		// Wait until iframe is created
		while (!context.iframe || !context.iframe.contentWindow) {
			await new Promise(resolve => setTimeout(resolve, 10));
		}

		// Expose callback on iframe's parent window (which is our window)
		window.onBenchmarkComplete = (avg, best=avg, cold=null) => {
			avgResult = avg;
			bestResult = best;
			coldResult = cold;
		};

		// Poll until the benchmark completes (with a timeout)
		let start = Date.now();
		while (avgResult === null && Date.now() - start < 20000) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		// Clean up
		delete window.onBenchmarkComplete;

		if (avgResult === null) {
			throw new Error("Benchmark timed out or did not report a result.");
		}

		console.log(`Final Warm Average Geometric Mean: ${avgResult.toFixed(2)}ms`);

		// Adjust this threshold as we optimize!
		if (avgResult > 150) {
			throw new Error(`Performance regression detected! Mean is ${avgResult.toFixed(2)}ms (expected < 150ms)`);
		}

		let cold = coldResult === null ? '' : `cold: ${coldResult.toFixed(2)}ms, `;
		return `${cold}warm avg: ${avgResult.toFixed(2)}ms, best: ${bestResult.toFixed(2)}ms`;
	};
}

Testimony.testIframe(
	'Benchmark.solarite._jsFramework-1x',
	'Run the internal benchmark 1 time',
	{ timeout: 15000 },
	'<iframe src="/benchmarks/solarite/index.html?benchmark=1" style="width: 100%; height: 500px; border: 1px solid #ccc;"></iframe>',
	runIframeBenchmark(1)
);

Testimony.testIframe(
	'Benchmark.solarite._jsFramework-10x',
	'Run the internal benchmark 10 times',
	{ timeout: 30000 },
	'<iframe src="/benchmarks/solarite/index.html?benchmark=10" style="width: 100%; height: 500px; border: 1px solid #ccc;"></iframe>',
	runIframeBenchmark(10)
);

Testimony.testIframe(
	'Benchmark.vanilla._jsFramework-1x',
	'Run the vanilla benchmark 1 time',
	{ timeout: 15000 },
	'<iframe src="/benchmarks/vanilla3/index.html?benchmark=1" style="width: 100%; height: 500px; border: 1px solid #ccc;"></iframe>',
	runIframeBenchmark(1)
);

Testimony.testIframe(
	'Benchmark.vanilla._jsFramework-10x',
	'Run the vanilla benchmark 10 times',
	{ timeout: 30000 },
	'<iframe src="/benchmarks/vanilla3/index.html?benchmark=10" style="width: 100%; height: 500px; border: 1px solid #ccc;"></iframe>',
	runIframeBenchmark(10)
);
