




import Testimony, {assert} from "./Testimony.js";
import Shell from "../src/solarite/Shell.js";

Testimony.test('Shell.empty', () => {
	let shell = new Shell(['', ''])
	assert.eq(getHtml(shell, true), '<!--PathStart:0-->|<!--PathEnd:0-->')
});

Testimony.test('Shell.paragraph', () => {
	let shell = new Shell(['<p>', '</p>'])
	assert.eq(getHtml(shell, true), '<p><!--PathStart:0--><!--PathEnd:0--></p>')
});

Testimony.test('Shell.nodeBefore', () => {
	let shell = new Shell(['a', ''])
	assert.eq(getHtml(shell, true), 'a|<!--PathEnd:0-->')
});

Testimony.test('Shell.nodeAfter', () => {
	let shell = new Shell(['', 'b'])
	assert.eq(getHtml(shell, true), '<!--PathStart:0-->|b')
});

Testimony.test('Shell.nodeBeforeAfter', () => {
	let shell = new Shell(['a', 'b'])
	assert.eq(getHtml(shell, true), 'a|b')
});

Testimony.test('Shell.emptyTwoPaths', () => {
	let shell = new Shell(['', '', ''])
	assert.eq(getHtml(shell, true), '<!--PathStart:0-->|<!--PathEnd:0-->|<!--PathEnd:1-->')
});

Testimony.test('Shell.nodeBetweenPaths', () => {
	let shell = new Shell(['', 'a', ''])
	assert.eq(getHtml(shell, true), '<!--PathStart:0-->|a|<!--PathEnd:1-->')
});

Testimony.test('Shell.nodesAroundPaths', () => {
	let shell = new Shell(['a', 'b', 'c'])
	assert.eq(getHtml(shell, true), 'a|b|c')
});

Testimony.test('Shell.emptyTwoPathsNested', () => {
	let shell = new Shell(['<p>', '', '</p>'])
	assert.eq(getHtml(shell, true), '<p><!--PathStart:0--><!--PathEnd:0--><!--PathEnd:1--></p>')
});

Testimony.test('Shell.nodesAroundPathsNested', () => {
	let shell = new Shell(['<p>a', 'b', 'c</p>'])
	assert.eq(getHtml(shell, true), '<p>abc</p>')
});


/*
`<button value=${button}
	${product[option.field] == button && 'class="primary"'}
	onclick=${e => this.select(product, option.field, e.target.value ? '' : e.target.value)}

>${button}</button>`
 */



// Testimony.test('Shell.emptySpacer', () => {
// 	let expr = 1;
// 	let shell = new Shell(['<input ', '', 'onclick=','>'])
// 	console.log(getHtml(shell, true))
// });

