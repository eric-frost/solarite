import Testimony, {assert} from "../../tests/Testimony.js";
import LinkedList from "./LinkedList.js";

Testimony.test('LinkedList.constructor with Array input', () => {
	const linkedList = new LinkedList(['A', 'B', 'C']);
	assert.eq([...linkedList], ['A', 'B', 'C']);
});

Testimony.test('LinkedList.constructor with LinkedList input', () => {
	const originalList = new LinkedList(['X', 'Y', 'Z']);
	const copiedList = new LinkedList(originalList);
	assert.eq([...copiedList], ['X', 'Y', 'Z']);
});

Testimony.test('LinkedList.constructor with mixed input', () => {
	const originalList = new LinkedList(['D', 'E']);
	const extendedList = new LinkedList([...originalList, 'F', 'G']);
	assert.eq([...extendedList], ['D', 'E', 'F', 'G']);
});

Testimony.test('LinkedList.constructor with no input', () => {
	const emptyList = new LinkedList();
	assert.eq([...emptyList], []);
});


Testimony.test('LinkedList.push', () => {
	const linkedList = new LinkedList();
	linkedList.push("A");
	linkedList.push("B");
	assert.eq([...linkedList], ['A', 'B']);
});

Testimony.test('LinkedList.unshift', () => {
	const linkedList = new LinkedList();
	linkedList.unshift("B");
	linkedList.unshift("A");
	assert.eq([...linkedList], ['A', 'B']);
});

Testimony.test('LinkedList.shift', () => {
	const linkedList = new LinkedList();
	linkedList.push("A");
	linkedList.push("B");
	linkedList.shift();
	assert.eq([...linkedList], ['B']);
	linkedList.shift();
	assert.eq([...linkedList], []);
});

Testimony.test('LinkedList.pop', () => {
	const linkedList = new LinkedList();
	linkedList.push("A");
	linkedList.push("B");
	linkedList.pop();
	assert.eq([...linkedList], ['A']);
	linkedList.pop();
	assert.eq([...linkedList], []);
});

Testimony.test('LinkedList.slice', () => {
	const linkedList = new LinkedList();
	linkedList.push("A");
	linkedList.push("B");
	linkedList.push("C");
	const subList = linkedList.slice("A", "B");
	assert.eq([...subList], ['A', 'B']);
});

Testimony.test('LinkedList._splice', () => {
	const linkedList = new LinkedList();
	linkedList.push("A");
	linkedList.push("B");
	linkedList.splice("A", null, ["X", "Y"]);
	assert.eq([...linkedList], ['A', 'X', 'Y', 'B']);
	linkedList.splice("X", "Y");
	assert.eq([...linkedList], ['B']);
});




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


Testimony.test('LinkedList.benchmark', () => {

	let data = buildData(10_000)
	let start = performance.now()
	let list = new LinkedList(data);
	console.log(performance.now() - start)

	start = performance.now()
	let i = 0;
	for (let item in list) {
		i++;
	}
	console.log(i)
	console.log(performance.now() - start)



});