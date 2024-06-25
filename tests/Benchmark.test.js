import {
	getObjectId2,
	hashObject,
	hashObject64,
	memoize,
	memoize2,
	memoize3,
	memoize4
} from "../src/unused/Hashes.js";
import {getObjectHash} from '../src/solarite/hash.js'
import Testimony from "./Testimony.js";

//import {r, Solarite} from "../src/Solarite.js";
import {r, Solarite} from "../dist/Solarite.min.js";


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


Testimony.test('Benchmark.solarite._createRows',  `Create ${rowCount.toLocaleString()} rows`, () => {

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
			r(this)`<div>
				<div style="display: flex: flex-direction: column">
					${this.data.map(row=>r`
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

	setTimeout(() => {
		startTime = performance.now();
		createRows();
	}, 100)

});




Testimony.test('Benchmark.vanilla._partialUpdate',  'Add text to every 10th row', () => {

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

	setTimeout(() => {
		let start = performance.now()
		updateRows()
		console.log(performance.now() - start)
	}, 1200)

});


Testimony.test('Benchmark.solarite._partialUpdate',  `Update ${rowCount.toLocaleString()} rows`, () => {
	
	class R810 extends Solarite {
		data = []

		// Removing spaces before and after the inner loop speeds up this benchmark by 25%.
		// But that makes performance measurements inconsistent across git revisions.
		render() {
			let options = {scripts: false, styles: false, ids: false}
			r(this, options)`
				<div>
					<div style="display: flex: flex-direction: column">
						${this.data.map((row, i) => r`
							<div style="display: flex">
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

	setTimeout(async () => {
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
	}, 1300)

});



Testimony.test('Benchmark._memoize',  () => {
	let data = buildData(100_000)
	let start = performance.now();
	JSON.stringify(memoize(data));

	console.log(performance.now() - start)

});



Testimony.test('Benchmark._hashObject',  () => {
	let data = buildData(100_000)
	let start = performance.now();
	let result = hashObject(data);
	console.log(performance.now() - start)

	console.log(result.toLocaleString())
});




Testimony.test('Benchmark._hashObject64',  () => {
	let data = buildData(100_000)
	let start = performance.now();
	let result = hashObject64(data);
	console.log('hashObject64:' + (performance.now() - start))

	console.log(result.toLocaleString())
});


Testimony.test('Benchmark._memoize2',  () => {
	let data = buildData(100_000)
	let start = performance.now();
	memoize2(data);
	console.log('memoize2: ' + (performance.now() - start))
	//console.log(data)
});


Testimony.test('Benchmark._memoize4',  () => {
	let data = buildData(100_000)
	let start = performance.now();
	memoize4(data);
	console.log('memoize4: ' + (performance.now() - start))
	//console.log(data)
});



Testimony.test('Benchmark._JSONstringify',  () => {
	let data = buildData(100_000)
	let start = performance.now();
	JSON.stringify(data)
	console.log('JSONstringify: ' + (performance.now() - start))
	//console.log(data)
});


Testimony.test('Benchmark._getObjectHash',  () => {
	let data = buildData(100_000)
	let start = performance.now();
	getObjectHash(data)
	console.log('getObjectHash: ' + (performance.now() - start))
	//console.log(data)
});