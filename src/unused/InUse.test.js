import {InUseArray, InUseMap} from "./InUseMap.js";
import Testimony, {assert} from "../../tests/Testimony.js";

Testimony.test('InUseArray.constructor', () => {
	const arr = new InUseArray();
	assert.eq(arr.count, 0, 'Initial count should be 0');
	assert.eq(arr.length, 0, 'Initial length should be 0');
});

Testimony.test('InUseArray.use - with no value', () => {
	const arr = new InUseArray(1, 2, 3);
	const val = arr.use();
	assert.eq(val, 1, 'Should return the first value');
	assert.eq(arr.count, 1, 'Count should be incremented');
});

Testimony.test('InUseArray.use - with specific value', () => {
	const arr = new InUseArray(1, 2, 3);
	arr.count = 1; // Mark the first element as in-use
	const val = arr.use(3);
	assert.eq(val, 3, 'Should return the specified value');
	assert.eq(arr.count, 2, 'Count should be incremented');
	assert.eq(arr[1], 3, 'Value should be moved to the in-use section');
	assert.eq(arr[2], 2, 'Remaining value should be in the available section');
});

Testimony.test('InUseArray.use', () => {
	const arr = new InUseArray(1, 2, 3);
	let val = arr.use(4);
	assert.eq(val, undefined,'Should return undefined');
	assert.eq(arr.use(), 1);
	assert.eq(arr.use(3), 3);
	assert.eq(arr.use(), 2);
	assert.eq(arr.use(), undefined);
});

Testimony.test('InUseArray.use - all in use', () => {
	const arr = new InUseArray(1, 2, 3);
	arr.count = 3;
	const val = arr.use();
	assert.eq(val, undefined, 'Should return undefined');
});

Testimony.test('InUseArray.free', () => {
	const arr = new InUseArray(1, 2, 3);
	arr.count = 3;
	arr.free();
	assert.eq(arr.count, 0, 'Count should be reset to 0');
});

Testimony.test('InUseArray.reset', () => {
	const arr = new InUseArray(1, 2, 3);
	arr.reset();
	assert.eq(arr.length, 0, 'Array should be empty');
});




Testimony.test('InUseMap.add', () => {
	const map = new InUseMap();
	map.add('key', 'value');
	assert.eq(map.data['key'][0], 'value', 'Value should be added to the map');
});

Testimony.test('InUseMap.getAll', () => {
	const map = new InUseMap();
	map.add('key', 'value');
	const values = map.getAll('key');
	assert.eq(values.length, 1, 'Should return an array with one value');
	assert.eq(values[0], 'value', 'Should return the correct value');
});

Testimony.test('InUseMap.use', () => {
	const map = new InUseMap();
	map.add('key', 'value');
	let value = map.use('key');
	assert.eq(value, 'value', 'Should return and mark the value as in-use');
	value = map.use('key');
	assert.eq(value, undefined, 'Should return and mark the value as in-use');
});

Testimony.test('InUseMap.hasValue', () => {
	const map = new InUseMap();
	map.add('key1', 'value1');
	map.add('key2', 'value2');
	const keys = map.hasValue('value1');
	assert.eq(keys.length, 1, 'Should return an array with one key');
	assert.eq(keys[0], 'key1', 'Should return the correct key');
});


