/**
 * These tests make it easier to debug individual functions of NodeGroup.
 */
import NodeGroupManager from "../src/solarite/NodeGroupManager.js";
import {r} from "../src/solarite/Solarite.js";
import NodeGroup from "../src/solarite/NodeGroup.js";
import Shell from "../src/solarite/Shell.js";
import Template from "../src/solarite/Template.js";
import Testimony, {assert} from "./Testimony.js";




Testimony.test('NodeGroup.empty', () => {
    let ngm = new NodeGroupManager(document.body);

    let ng = new NodeGroup(new Template([``], []), ngm)
    assert.eq(getHtml(ng), '')

    ng.applyExprs([])
    assert.eq(getHtml(ng), '')
});


Testimony.test('NodeGroup.oneExpr', () => {
    let ngm = new NodeGroupManager(document.body);

	let ng = new NodeGroup(new Template([``, ``], ['1']), ngm)
	assert.eq(getHtml(ng), '1')

	ng.applyExprs([2])
	assert.eq(getHtml(ng), '2')

	ng.applyExprs([[3, 4, 5]])
	assert.eq(getHtml(ng), '3|4|5')
});

Testimony.test('NodeGroup.emptyAdjacent', () => {
    let ngm = new NodeGroupManager(document.body);
	let ng = new NodeGroup(new Template([``, ``, ``], ['1', '2']), ngm)
	ng.verify();

	assert.eq(getHtml(ng), '1|2')

	ng.applyExprs([3, 4])
	assert.eq(getHtml(ng), '3|4')

	ng.applyExprs([[1, 2, 3], [4, 5, 6]])
	assert.eq(getHtml(ng), '1|2|3|4|5|6')
});


Testimony.test('NodeGroup.paragraph', () => {
    let ngm = new NodeGroupManager(document.body);
	let ng = new NodeGroup(new Template(['<p>', '</p>'], ['1']), ngm)
	assert.eq(getHtml(ng), '<p>1</p>')

	ng.applyExprs([2])
	assert.eq(getHtml(ng), '<p>2</p>')

	ng.applyExprs([[3, 4, 5]])
	assert.eq(getHtml(ng), '<p>345</p>')
});

Testimony.test('NodeGroup.node', () => {
    let ngm = new NodeGroupManager(document.body);
	let a = r('<p>a</p>')
	let b = r('<p>b</p>')
	let ng = new NodeGroup(new Template(['<div>', '</div>'], [a]), ngm)

	assert.eq(getHtml(ng), '<div><p>a</p></div>')

	ng.applyExprs([b]);
	assert.eq(getHtml(ng), '<div><p>b</p></div>')

	ng.applyExprs([1]);
	assert.eq(getHtml(ng), '<div>1</div>')

	ng.applyExprs([a]);
	assert.eq(getHtml(ng), '<div><p>a</p></div>')
});


/**
 * This fails because
 */
Testimony.test('NodeGroup._nodeSwap', () => {
    let ngm = new NodeGroupManager(document.body);
	let a = r('<p>a</p>')
	let b = r('<p>b</p>')
	let ng = new NodeGroup(new Template(['<div>', '', '</div>'], [a, b]), ngm)
	document.body.append(ng.startNode)

	assert.eq(getHtml(ng), '<div><p>a</p><p>b</p></div>')


	ng.applyExprs([b, a]);
	assert.eq(getHtml(ng), '<div><p>b</p><p>a</p></div>')

});


Testimony.test('NodeGroup.arrayReverse', () => {
    let ngm = new NodeGroupManager(document.body);
	let list = [r('a'), r('b')];

	let ng = new NodeGroup(new Template(['<div>', '</div>'], [list]), ngm)
	ng.verify();
	assert(getHtml(ng), '<div>ab</div')

	list.reverse();
	ng.applyExprs([list])
	assert(getHtml(ng), '<div>ba</div')
});

