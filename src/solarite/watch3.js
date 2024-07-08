

// Example:
/*
class WatchExample extends Solarite {

	constructor(items = []) {
		super();

		this.items = items;
		watch(this, 'items');

		this.name = 'George';
		watch(this, 'name');

		this.render();
	}

	render() {
		r(this)`
		<watch-example>
			${this.name}

			${this.items.map(item => r`
				<div>${item.name}</div>
			`)}
			${this.items.length}
		</watch-example>`;
	}
}
customElements.define('watch-example', WatchExample);

let a = new WatchExample();

// Items is a Proxy.
// Calling push() will trigger the map'd ExprPaths to add another at the end.
// And the .length expression to update.
// Because accessing .items returns a proxy.
a.items.push({name: 'Fred'});
*/


/**
 * TODO:
 * Have ExprPath set the exprPath property of WatchedItem when it encounters it.
 * WatchedItem needs to be a Proxy to handle objects and arrays.
 */

export class WatchedItem {

	exprPath = null;

	constructor(root, path, value) {
		this.root = root;
		this.path = path;
		this.value = value;
	}

	getValue() {
		return this.value;
	}
}


export default function watch3(root, path) {

	let value = root[path];


	Object.defineProperty(root, path, {
		get() { // WatchedItem needs to be a Proxy to handle objects and arrays.
			return new WatchedItem(root, path, value);
		},
		set(val) {
			value = val;
			root.render();
			// TODO: re-evaluate the ExprPath.
		}
	});
}
