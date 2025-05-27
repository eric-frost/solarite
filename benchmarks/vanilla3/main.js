"use strict";

let benchmark = window.location.search.includes('benchmark');

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

const tbody = document.querySelector('tbody'), l1 = adjectives.length, l2 = colours.length, l3 = nouns.length;
let index = 1, op = null, c1 = null, c2 = null, c998 = null, data = [], selected = null;

const app = {
	run(n=1000) { if (data.length) app.clear(); app.add(n); },
	runlots() { app.run(10000) },
	add(n = 1000) {
		const item = document.querySelector('template').content.firstElementChild;
		const id = item.firstElementChild.firstChild, lbl = item.querySelector('a').firstChild;
		for (let i = 0; i < n; i++) {
			id.nodeValue = index++;
			data.push(lbl.nodeValue = `${adjectives[Math.round(Math.random() * 1000) % l1]} ${colours[Math.round(Math.random() * 1000) % l2]} ${nouns[Math.round(Math.random() * 1000) % l3]}`);
			tbody.appendChild(item.cloneNode(true));
		}
	},
	update() {
		for (let i = 0, item; i < data.length; i += 10) {
			if (op === 'update' && item?.hasOwnProperty('next')) item = item.next;
			else if (item) { item.next = tbody.childNodes[i]; item = item.next }
			else item = tbody.childNodes[i];
			if (!item.hasOwnProperty('el')) item.el = item.querySelector('a').firstChild;
			item.el.nodeValue = data[i] += ' !!!';
		}
	},
	clear() { tbody.textContent = ''; data = [] },
	swaprows() {
		if (data.length < 999) return;
		const d1 = data[1]; data[1] = data[998]; data[998] = d1;
		if (op === 'swaprows') { const temp = c1; c1 = c998; c998 = temp }
		else { c1 = tbody.children[1]; c2 = c1.nextElementSibling; c998 = tbody.children[998] }
		tbody.insertBefore(c1, c998); tbody.insertBefore(c998, c2);
	}
}

tbody.onclick = (e) => {
	e.stopPropagation; e.preventDefault; op = 'null';
	if (e.target.tagName === 'A') {
		const element = e.target.parentNode.parentNode;
		if (selected) selected.className = '';
		selected = (element === selected)? null: element;
		if (selected) selected.className = 'danger';
	} else if (e.target.tagName === 'SPAN') {
		const element = e.target.parentNode.parentNode.parentNode;
		const index = Array.prototype.indexOf.call(tbody.children, element);
		element.remove(); data.splice(index, 1);
	}
}
document.querySelector('#app-actions').onclick = (e) => { e.stopPropagation(); e.preventDefault(); app[e.target.id](); op = e.target.id };


if (benchmark) {

	(async () => {

		const times = [];

		// Helper function to calculate geometric mean
		const geometricMean = (arr) => {
			return Math.pow(arr.reduce((a, b) => (a || .1) * (b||.1), 1), 1 / arr.length);
		};

		const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

		async function run(name, callback) {
			const start = performance.now();
			callback();
			const time = performance.now() - start;
			times.push(time);
			console.log(`${name}: ${time.toFixed(2)}ms.`);
			await sleep(20); // wait for render
		}

		await run('Create Rows', () => app.run());
		await run('Replace All Rows', () => app.run());
		await run('Partial Update', () => app.update());
		await run('Select Row', () => {
			let element = tbody.children[0];
			if (selected) selected.className = '';
			selected = (element === selected) ? null : element;
			if (selected) selected.className = 'danger';
		});
		await run('Swap Rows', () => app.swaprows());
		await run('Remove Row', () => {
			let element = tbody.children[0];
			let index = Array.prototype.indexOf.call(tbody.children, element);
			element.remove(); data.splice(index, 1);
		});
		await run('Clear Rows', () => app.clear());
		await run('Create Many Rows', () => app.runlots());
		await run('Append Rows', () => app.add());
		await run('Clear Rows', () => app.clear());

		// Log the geometric mean of all steps
		const geoMean = geometricMean(times);
		console.log(`Geometric mean: ${geoMean}ms`);
	})();
}