// noinspection DuplicatedCode,JSUnusedAssignment

import Testimony, {assert} from './Testimony.js';

import h, {toEl, Solarite, Template, Globals, SolariteUtil, svg, getEventBinding, Fragment} from '../src/Solarite.js';
import {jsxTemplate, jsxAttr, jsxEscape, jsx, jsxs} from '../src/jsx-runtime.js';
import NodeGroup from '../src/NodeGroup.js';
import Shell from '../src/Shell.js';
import PathToNodes from '../src/PathToNodes.js';

//import h, {toEl, Solarite, Template, Globals, SolariteUtil,
// NodeGroup, Shell} from '../dist/Solarite.min.js'; // This will help the Benchmark test warm up.



// This function is used by the various tests.
window.getHtml = (item, includeComments=false) => {
	if (!item)
		return item;

	if (item.docFrag)
		item = item.docFrag; // Shell
	if (item instanceof DocumentFragment)
		item = [...item.childNodes]

	else if (item.getNodes)
		item = item.getNodes()

	let result;
	if (Array.isArray(item)) {
		if (!includeComments)
			item = item.filter(n => n.nodeType !==8)

		result = item.map(n => n.nodeType === 8 ? `<!--${n.textContent}-->` : (n.outerHTML || n.textContent)).join('|');
	}
	else
		result = item.outerHTML || item.textContent

	if (!includeComments)
		result = result.replace(/(<)!--(.*?)-->/g, '')

	// Remove whitespace between tags, so we can write simpler tests.
	return result.replace(/^\s+</g, '<').replace(/>\s+</g, '><').replace(/>\s+$/g, '>');
}

/** The inner <font> elements translatePage() made, whose text it has translated already. */
let translatedFonts = new WeakSet();

/** The Text node each outer <font> made by translatePage() took the place of. */
let translatedFrom = new WeakMap();

/**
 * Do to everything under root what Chrome's page translator (Google Translate) does to a page.
 * Every Text node with words in it, outside script, style and textarea and outside an element
 * marked translate="no" or class="notranslate", is taken out of the page and replaced with
 * <font style="vertical-align: inherit;"><font style="vertical-align: inherit;">translation</font></font>.
 * The Text node taken out is left as it was, and nothing else is told.  The title, alt and
 * placeholder attributes, and the value of an input button, are translated where they are.
 * The translation is the text with "T:" in front, so that a test can tell it from text drawn
 * since, and textContent.replaceAll('T:', '') is what the page would show untranslated.
 *
 * The real translator watches the page and translates text that is added later.  Calling this
 * again after a render does the same: it translates what is new and leaves alone what it
 * translated before.
 * @param root {Node}
 * @return {int} How many Text nodes it translated this time. */
function translatePage(root) {
	let texts = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let node; node = walker.nextNode(); )
		if (/\S/.test(node.nodeValue) && !translatedFonts.has(node.parentNode)
			&& !node.parentElement?.closest('script, style, textarea, [translate="no"], .notranslate'))
			texts.push(node);
	for (let node of texts) {
		let outer = document.createElement('font'), inner = document.createElement('font');
		outer.style.verticalAlign = inner.style.verticalAlign = 'inherit';
		inner.textContent = 'T:' + node.nodeValue;
		outer.append(inner);
		translatedFonts.add(inner);
		translatedFrom.set(outer, node);
		node.replaceWith(outer);
	}
	for (let el of root.querySelectorAll?.('[title], [alt], [placeholder], input[type=button], input[type=submit]') || [])
		if (!el.closest('[translate="no"], .notranslate'))
			for (let name of el.matches('input[type=button], input[type=submit]') ? ['title', 'value'] : ['title', 'alt', 'placeholder'])
				if (el.getAttribute(name)?.startsWith('T:') === false)
					el.setAttribute(name, 'T:' + el.getAttribute(name));
	return texts.length;
}

/**
 * Show the text under root untranslated again, as a translator does when the reader asks for the
 * page in its own language: every <font> translatePage() put in the page is replaced with the
 * Text node it took the place of, as that node is now.  (That Chrome puts back its original nodes
 * rather than new ones is an assumption; either way the Text nodes Solarite holds are found.)
 * @param root {Node} */
function untranslatePage(root) {
	for (let font of root.querySelectorAll('font'))
		if (translatedFrom.has(font))
			font.replaceWith(translatedFrom.get(font));
}



//region shell
/*┌─────────────────╮
  | Shell           |
  └─────────────────╯*/
Testimony.test('Solarite.Shell.empty', () => {
	let shell = new Shell(['', ''])
	assert.eq(getHtml(shell, true), '<!--Path:0-->|<!--PathEnd:0-->')
});

Testimony.test('Solarite.Shell.paragraph', () => {
	// A solo expression inside an element uses the element itself as its region; no marker comments.
	let shell = new Shell(['<p>', '</p>'])
	assert.eq(getHtml(shell, true), '<p></p>')
});

Testimony.test('Solarite.Shell.nodeBefore', () => {
	let shell = new Shell(['a', ''])
	assert.eq(getHtml(shell, true), 'a|<!--PathEnd:0-->')
});

Testimony.test('Solarite.Shell.nodeAfter', () => {
	let shell = new Shell(['', 'b'])
	assert.eq(getHtml(shell, true), '<!--Path:0-->|b')
});

Testimony.test('Solarite.Shell.nodeBeforeAfter', () => {
	let shell = new Shell(['a', 'b'])
	assert.eq(getHtml(shell, true), 'a|b')
});

Testimony.test('Solarite.Shell.emptyTwoPaths', () => {
	let shell = new Shell(['', '', ''])
	assert.eq(getHtml(shell, true), '<!--Path:0-->|<!--PathEnd:0-->|<!--PathEnd:1-->')
});

Testimony.test('Solarite.Shell.nodeBetweenPaths', () => {
	let shell = new Shell(['', 'a', ''])
	assert.eq(getHtml(shell, true), '<!--Path:0-->|a|<!--PathEnd:1-->')
});

Testimony.test('Solarite.Shell.nodesAroundPaths', () => {
	let shell = new Shell(['a', 'b', 'c'])
	assert.eq(getHtml(shell, true), 'a|b|c')
});

Testimony.test('Solarite.Shell.emptyTwoPathsNested', () => {
	let shell = new Shell(['<p>', '', '</p>'])
	assert.eq(getHtml(shell, true), '<p><!--Path:0--><!--PathEnd:0--><!--PathEnd:1--></p>')
});

Testimony.test('Solarite.Shell.nodesAroundPathsNested', () => {
	let shell = new Shell(['<p>a', 'b', 'c</p>'])
	assert.eq(getHtml(shell, true), '<p>abc</p>')
});

Testimony.test('Solarite.Shell.eventIsNotLiveProperty', `An event attribute doesn't mark a row as holding a live property, on any element.`, () => {
	for (let tag of ['a', 'i', 'section', 'button', 'em']) {
		let t = new Template([`<${tag} onclick=`, '>', `</${tag}>`], [() => {}, 'x']);
		let shell = Shell.get(t.html);
		assert.eq(shell.hasLivePropPaths, false, tag);
		assert.eq(shell.needsRefresh, false, tag);
	}
	let t = h`<input checked=${true}>`;
	assert.eq(Shell.get(t.html).hasLivePropPaths, true);
});

Testimony.test('Solarite.Shell.tableWhitespace', `Whitespace-only text between a table's sections, rows and cells is dropped when a template is parsed, at any depth and nowhere else: a cell's own whitespace stays, and so does the whitespace of an svg element that happens to have a table element's name.`, () => {
	let html = shell => {
		let div = document.createElement('div');
		div.append(shell.docFrag.cloneNode(true));
		return div.innerHTML;
	};

	let shell = new Shell(['a <table> <thead> <tr> <th> b </th> </tr> </thead> <tbody> <tr> <td> </td>'
		+ ' <td><p> <b>c</b> </p><table> <tr> <td>d</td> </tr> </table></td> </tr> </tbody>'
		+ ' <tfoot> <tr> <td>e</td> </tr> </tfoot> </table> f']);
	assert.eq(html(shell), 'a <table><thead><tr><th> b </th></tr></thead><tbody><tr><td> </td>'
		+ '<td><p> <b>c</b> </p><table><tbody><tr><td>d</td></tr></tbody></table></td></tr></tbody>'
		+ '<tfoot><tr><td>e</td></tr></tfoot></table> f');

	// A row template, as a list draws it, with an expression in a cell.
	shell = new Shell(['<tr> <td>', '</td> <td> x </td> </tr>']);
	assert.eq(html(shell), '<tr><td></td><td> x </td></tr>');

	// In an svg these names are ordinary elements, whose text is theirs to keep.
	shell = new Shell(['<tr> <td> </td> </tr><text> </text>'], true);
	assert.eq(html(shell), '<tr> <td> </td> </tr><text> </text>');
});


// Testimony.test('Shell.emptySpacer', () => {
// 	let expr = 1;
// 	let shell = new Shell(['<input ', '', 'onclick=','>'])
// 	console.log(getHtml(shell, true))
// });



//endregion



//region nodegroup
/*┌─────────────────╮
  | NodeGroup       |
  └─────────────────╯*/
Testimony.test('Solarite.NodeGroup.empty', () => {

	let ng = new NodeGroup(new Template([``], []))
	assert.eq(getHtml(ng), '')

	ng.applyExprs([])
	assert.eq(getHtml(ng), '')
});

Testimony.test('Solarite.NodeGroup.oneExpr', () => {
	const template = new Template([``, ``], ['1']);
	let ng = new NodeGroup(template);
	ng.applyExprs(template.exprs);
	assert.eq(getHtml(ng), '1')

	ng.applyExprs([2])
	assert.eq(getHtml(ng), '2')

	ng.applyExprs([[3, 4, 5]])
	assert.eq(getHtml(ng), '3|4|5')
});

Testimony.test('Solarite.NodeGroup.emptyAdjacent', () => {
	const template =new Template([``, ``, ``], ['1', '2']);
	let ng = new NodeGroup(template)
	ng.applyExprs(template.exprs);
	ng.verify();

	assert.eq(getHtml(ng), '1|2')

	ng.applyExprs([3, 4])
	assert.eq(getHtml(ng), '3|4')

	ng.applyExprs([[1, 2, 3], [4, 5, 6]])
	assert.eq(getHtml(ng), '1|2|3|4|5|6')
});

Testimony.test('Solarite.NodeGroup.paragraph', () => {
	const template = new Template(['<p>', '</p>'], ['1']);
	let ng = new NodeGroup(template);
	ng.applyExprs(template.exprs);

	assert.eq(getHtml(ng), '<p>1</p>')

	ng.applyExprs([2])
	assert.eq(getHtml(ng), '<p>2</p>')

	ng.applyExprs([[3, 4, 5]])
	assert.eq(getHtml(ng), '<p>345</p>')
});

Testimony.test('Solarite.NodeGroup.node', () => {
	let a = toEl('<p>a</p>')
	let b = toEl('<p>b</p>')
	const template = new Template(['<div>', '</div>'], [a]);
	let ng = new NodeGroup(template)
	ng.applyExprs(template.exprs);

	assert.eq(getHtml(ng), '<div><p>a</p></div>')

	ng.applyExprs([b]);
	assert.eq(getHtml(ng), '<div><p>b</p></div>')

	ng.applyExprs([1]);
	assert.eq(getHtml(ng), '<div>1</div>')

	ng.applyExprs([a]);
	assert.eq(getHtml(ng), '<div><p>a</p></div>')
});

Testimony.test('Solarite.NodeGroup._nodeSwap', () => {
	let a = h('<p>a</p>')
	let b = h('<p>b</p>')
	let ng = new NodeGroup(new Template(['<div>', '', '</div>'], [a, b]))
	document.body.append(ng.startNode)

	assert.eq(getHtml(ng), '<div><p>a</p><p>b</p></div>')

	ng.applyExprs([b, a]);
	assert.eq(getHtml(ng), '<div><p>b</p><p>a</p></div>');
});

Testimony.test('Solarite.NodeGroup.arrayReverse', () => {
	let list = [h('a'), h('b')];

	let ng = new NodeGroup(new Template(['<div>', '</div>'], [list]))
	ng.verify();
	assert(getHtml(ng), '<div>ab</div')

	list.reverse();
	ng.applyExprs([list])
	assert(getHtml(ng), '<div>ba</div')
});

// Exercises the raw-Node fallback (PathToNodes.applyGeneric -> removeNodes, placeNodes).
// Raw DOM nodes in an expression array can't be tracked positionally, so they go through the
// identity-based reconciler.  These assert correct order AND that node identity is preserved
// (the same DOM objects are reused, never recreated) across insert/remove/swap/reverse/move.
Testimony.test('Solarite.NodeGroup.rawNodeReconcile', () => {
	let make = t => { let p = document.createElement('p'); p.textContent = t; return p; };
	let n1 = make('1'), n2 = make('2'), n3 = make('3'), n4 = make('4'), n5 = make('5');

	let template = new Template(['<div>', '</div>'], [[n1, n2, n3, n4]]);
	let ng = new NodeGroup(template);
	ng.applyExprs(template.exprs);
	assert.eq(getHtml(ng), '<div><p>1</p><p>2</p><p>3</p><p>4</p></div>');

	// Reverse - identity preserved.
	ng.applyExprs([[n4, n3, n2, n1]]);
	assert.eq(getHtml(ng), '<div><p>4</p><p>3</p><p>2</p><p>1</p></div>');
	assert.eq(n1.parentNode, n4.parentNode); // still the same live parent
	assert.eq(n1.textContent, '1'); // not recreated

	// Remove from the middle.
	ng.applyExprs([[n4, n1]]);
	assert.eq(getHtml(ng), '<div><p>4</p><p>1</p></div>');
	assert.eq(n2.parentNode, null); // removed from DOM
	assert.eq(n3.parentNode, null);

	// Insert new nodes among kept ones.
	ng.applyExprs([[n4, n2, n5, n1]]);
	assert.eq(getHtml(ng), '<div><p>4</p><p>2</p><p>5</p><p>1</p></div>');

	// Swap the two ends.
	ng.applyExprs([[n1, n2, n5, n4]]);
	assert.eq(getHtml(ng), '<div><p>1</p><p>2</p><p>5</p><p>4</p></div>');

	// Clear all, then repopulate.
	ng.applyExprs([[]]);
	assert.eq(getHtml(ng), '<div></div>');
	ng.applyExprs([[n3, n2, n1]]);
	assert.eq(getHtml(ng), '<div><p>3</p><p>2</p><p>1</p></div>');
});

// Same reconciler, but the nodes are the only child of their parent (wholeParent Path: no marker
// comment, parent element delimits the region).  Mix raw Nodes with text so both branches run.
Testimony.test('Solarite.NodeGroup.rawNodeWholeParent', () => {
	let make = t => { let p = document.createElement('p'); p.textContent = t; return p; };
	let a = make('a'), b = make('b'), c = make('c');

	let template = new Template(['<div>', '</div>'], [[a, b, c]]);
	let ng = new NodeGroup(template);
	ng.applyExprs(template.exprs);
	assert.eq(getHtml(ng), '<div><p>a</p><p>b</p><p>c</p></div>');

	ng.applyExprs([[c, a, b]]); // rotate
	assert.eq(getHtml(ng), '<div><p>c</p><p>a</p><p>b</p></div>');
	assert.eq(a.textContent, 'a'); // reused

	ng.applyExprs([[b]]); // shrink to one
	assert.eq(getHtml(ng), '<div><p>b</p></div>');
	assert.eq(a.parentNode, null);
	assert.eq(c.parentNode, null);
});
//endregion



//region util
/*┌─────────────────╮
  | SolariteUtil    |
  └─────────────────╯*/
// The html tokenizer lives inside Shell.addPlaceholders(), and the html context it is in at the end of each
// chunk is what decides which placeholder goes in the gap between that chunk and the next:  a comment when the
// expression is a child of some node, and a mark (the noncharacter U+FDD0 and a private-use character numbered by
// the expression) when it sits inside a tag or attribute value.
// So feeding it the chunks below and reading back the placeholders tells us the context after every chunk.
// One letter per gap between chunks:  t for text context, a for anything else (tag, attribute or comment).
let attribMark = i => '\ufdd0' + String.fromCharCode(0xe000 + i);
let checkHtmlContext = (chunks, contexts) =>
	assert.eq(Shell.addPlaceholders(chunks), chunks.map((chunk, i) =>
		i === contexts.length
			? chunk
			: chunk + (contexts[i] === 't' ? '<!--!✨!-->' : attribMark(i))
	).join(''));

Testimony.test('Solarite.Util.htmlContext', () => {
	let check = checkHtmlContext;

	check([
		'<div class="test',            // attribute:  the quote is still open
		'">hello ',                    // text:       the tag closed
		'<span data-attr="hi > there"', // tag:        the '>' was quoted, so it did not close the tag
		` attr='`,                     // attribute
		`'`,                           // tag:        the single quote closed the value
		' attr=',                      // attribute:  an unquoted value
		'a',                           // attribute
		' ',                           // tag:        a space ends an unquoted value
		' attr=',                      // attribute
		'>'                            // text
	], 'ataaaaaaa');

	// Tag context and attribute context are told apart by more than the placeholder:  only a tag name read in
	// tag context is a web component, so the one inside the quoted attribute value must be left alone.
	assert.eq(Shell.addPlaceholders(['<my-el a="<other-el">']), '<my-el-SOLARITE-PLACEHOLDER a="<other-el">');

	// The open quote has to survive the gap between two chunks, or the closing quote in the second chunk
	// would be read as the start of a new attribute value instead of the end of this one.
	assert.eq(Shell.addPlaceholders(['<my-el a="', '">']),
		'<my-el-SOLARITE-PLACEHOLDER a="' + attribMark(0) + '">');
});

Testimony.test('Solarite.Util.htmlContextTrailingLessThan', `A < that is the last character before an expression, or the last character of a template, is text, as it is to the browser: a template that writes one expression, a less-than sign and another expression compares two values and opens no tag.`, () => {
	assert.eq(Shell.addPlaceholders(['<p>', ' <', '</p>']), '<p><!--!✨!--> <<!--!✨!--></p>');

	// Rendered twice, so each expression is seen to have a place of its own on either side of the sign.
	let el = document.createElement('div');
	let render = (a, b) => h(el)`<p>${a} <${b}</p><b>${a}</b> <`;
	render(1, 2);
	assert.eq(getHtml(el), '<div><p>1 &lt;2</p><b>1</b> &lt;</div>');
	render(3, 4);
	assert.eq(getHtml(el), '<div><p>3 &lt;4</p><b>3</b> &lt;</div>');

	// A template with no expressions, given as a string.
	assert.eq(toEl('a <').textContent, 'a <');

	// The rows of a keyed list, which are built by a route of their own.
	let list = document.createElement('ul');
	let renderList = items => h(list)`${h.map(items, item => h`<li key=${item.id}>${item.min} <${item.max}</li>`)}`;
	renderList([{id: 1, min: 1, max: 2}, {id: 2, min: 3, max: 4}]);
	assert.eq(getHtml(list), '<ul><li>1 &lt;2</li><li>3 &lt;4</li></ul>');
	renderList([{id: 2, min: 3, max: 5}, {id: 1, min: 1, max: 2}]);
	assert.eq(getHtml(list), '<ul><li>3 &lt;5</li><li>1 &lt;2</li></ul>');

	// A style's text isn't markup, and each expression in it gets a text node of its own.
	let host = document.createElement('div');
	let renderStyle = name => h(host, {styles: false})`<style>/* <${name} */</style>`;
	renderStyle('a');
	assert.eq(host.firstChild.textContent, '/* <a */');
	renderStyle('b');
	assert.eq(host.firstChild.textContent, '/* <b */');

	// The same in svg, whose parser has rules of its own.
	let chart = toEl(h`<svg>${svg`<text>${1} <${2}</text>`}</svg>`);
	assert.eq(chart.firstElementChild.textContent, '1 <2');
	assert.eq(chart.firstElementChild.namespaceURI, 'http://www.w3.org/2000/svg');
});

Testimony.test('Solarite.Util.htmlContextComment', `Only its end closes an html comment, as in the browser, so the apostrophes, quotes and > in its text change nothing for the expressions after it, and an expression inside it is still inside it.`, () => {
	let check = checkHtmlContext;

	// A quote in a comment opens no attribute value, and a '>' in one closes nothing.
	check([`<p><!-- don't -->`, '</p>'], 't');
	check(['<p><!-- say "hi -->', '</p>'], 't');
	check(['<!-- a > b ', ` "c" isn't -->`, ''], 'at');
	check(['<!-- <b title="', `" class='c'>`, '</b> --><p>', '</p>'], 'aat');

	// The ways the browser ends a comment: at once for <!--> and <!--->, at --!> as at -->, and never if neither
	// is written, in which case the rest of the template is the comment.
	check(['<!-->', '<!--->', '<!---->', '<!-- x --!>', ''], 'tttt');
	check(['<p>', `</p><!-- isn't closed <i>`, '</i>'], 'ta');

	// What does not end one: dashes with an expression between them and the '>', and the '>' of <!--!>.
	check(['<!-- a --', '> b -->', ''], 'at');
	check(['<!--!>', ' -->', ''], 'at');

	// Conditional comments are comments.
	check(['<!--[if IE]><p>', '</p><![endif]-->', ''], 'at');
	check(['<!--[if !IE]><!--><p>', '</p><!--<![endif]-->', ''], 'tt');

	// A tag inside a comment is text of the comment, so a component named there gets no placeholder suffix.
	assert.eq(Shell.addPlaceholders([`<!-- don't use <my-el> --><my-el>`]), `<!-- don't use <my-el> --><my-el-SOLARITE-PLACEHOLDER>`);

	// Comment-like text inside a quoted attribute value is part of the value.
	check(['<p title="<!-- ', ` -->" data-x='-->'>`, '</p>'], 'at');

	// A private-use character written in the template's own text is not one of the marks, and is left alone.
	assert.eq(Shell.addPlaceholders(['<p>\ue001 ', '</p>']), '<p>\ue001 <!--!✨!--></p>');
});

Testimony.test('Solarite.Util.privateUseCharacters', `A private-use character written in a template's attributes or comments, as icon fonts have them (data-icon="&#xe600;"), is kept as it was written and is not taken for the mark of an expression, with or without expressions in the template, whatever its code point.  The expressions beside it, keys and whole attributes included, find their places.`, () => {
	let el = document.createElement('div');
	h(el)`<i data-icon="\uf00d">x</i><input placeholder="&#xf002; Search"><!-- uses \ue000 -->`;
	assert.eq(el.firstChild.dataset.icon + el.children[1].placeholder, '\uf00d\uf002 Search');

	let render = (title, attribs) => h(el)`<i data-icon="&#xe000;" title=${title} ${attribs}>x</i><!-- \ue001 ${title} --><span data-icon="a\ue002b" class="c ${title}"></span>`;
	render('one', 'lang=en');
	render('two', 'dir=rtl');
	assert.eq(getHtml(el), '<div><i data-icon="\ue000" title="two" dir="rtl">x</i><span data-icon="a\ue002b" class="c two"></span></div>');

	// The rows of a keyed list, reordered, which find their key by the number in its mark.
	let renderList = ids => h(el)`${ids.map(id => h`<b data-icon="\ue000" key=${id} title=${id}>\ue001</b>`)}`;
	renderList([1, 2]);
	let first = el.firstElementChild;
	renderList([2, 1]);
	assert.eq(getHtml(el), '<div><b data-icon="\ue000" title="2">\ue001</b><b data-icon="\ue000" title="1">\ue001</b></div>');
	assert.eq(el.lastElementChild, first);
});

Testimony.test('Solarite.Util.htmlContextQuoteOutsideValue', `A quote or an apostrophe opens an attribute value only where one can begin, straight after the =, as in the browser.  Anywhere else in a tag it is an ordinary character, so title=don't does not swallow the rest of the template.`, () => {
	let check = checkHtmlContext;

	// In a value written without quotes, which ends at the next space or '>'.
	check([`<p title=don't>`, '</p>'], 't');
	check(['<p data-x=a"b class=c>', '</p>'], 't');
	check([`<a href=/s?q=it's&n=`, ' class=x>', '</a>'], 'at');
	check(['<p title=a="b>', '</p>'], 't');

	// As part of an attribute's name.
	check([`<p title="a" 'b>`, '</p>'], 't');

	// A quoted value still begins after the =, with or without spaces around it, and still hides a '>'.
	check([`<p title = "a>b" class='c>d' data-x=e>`, '</p>'], 't');
	check(['<p title= "', `>" class='`, `>'>`, '</p>'], 'aat');

	// Whatever else starts with '<!', '<?' or '</' ends at the first '>', whatever quotes it holds: the browser
	// makes a comment of it, or drops it.
	check([`<!DOCTYPE html><!x don't>`, `</ isn't>`, `<?x "y ?>`, ''], 'ttt');
	check(['</', '>', ''], 'at');
});

Testimony.test('Solarite.Util.htmlContextRawText', `The text of a script, a style or a textarea is not html, as it isn't to the browser: a < in it opens no tag and a quote in it opens no value, so an expression after one is still a child of the element.`, () => {
	let check = checkHtmlContext;

	// A '<' before a letter, which anywhere else opens a tag.
	check(['<script>if (a<b) c(', ')</script>'], 't');
	check(['<style>/* <b> */ p { color: ', ' } @media (1px<width) { p { margin: ', 'px } }</style><p>', '</p>'], 'ttt');
	check([`<script>if (i<n) // don't\n</script><p title="`, '">', '</p>'], 'at');
	check([`<textarea>a<b c="d <!-- e's</textarea><p title="`, '">', '</p>'], 'at');

	// What looks like a comment in it is text too.
	check(['<style><!-- p { color: ', ' } --></style><p>', '</p>'], 'tt');

	// The element's own start tag is a tag, where a quoted '>' closes nothing.
	check(['<script type="', '" data-a="x>y">a<b; c = ', ';</script>'], 'at');
	check(['<style media="(width > 1px)" class="', '">p { color: ', ' }</style>'], 'at');

	// An expression in the text is counted, so the ones in the tags after it keep their own numbers, which is
	// what a key attribute is found by.
	check(['<style>a<b { color: ', ' }</style><p title="', '">', '</p>'], 'tat');

	// The text ends at the element's end tag, in capitals or with a space before its '>', and not at an end tag
	// whose name only starts the same.
	check(['<SCRIPT>a<b</SCRIPT><p ', '>', '</p><script>c<d</script ><i ', '>', '</i>'], 'atat');
	check(['<script>a = "</scripty>"; if (a<b) c = ', ';</script><p>', '</p>'], 'tt');

	// Never ended: the rest of the template is its text.
	check(['<style>a<b { color: ', ' }'], 't');

	// An element whose name only starts like one of these is an ordinary element,
	check(['<styles>a<b title="', '">', '</b></styles>'], 'at');
	assert.eq(Shell.addPlaceholders(['<script-x><b title="', '"></b></script-x>']),
		'<script-x-SOLARITE-PLACEHOLDER><b title="' + attribMark(0) + '"></b></script-x-SOLARITE-PLACEHOLDER>');

	// and so is a self-closed one, which inside an svg has no text.
	check(['<svg><style/><script href="a.js"/><circle r="', '"/></svg>'], 'a');

	// A component's name written in such text, in a CSS comment for instance, is text and gets no placeholder suffix.
	assert.eq(Shell.addPlaceholders(['<style>/* the <tool-bar> */</style><tool-bar></tool-bar>']),
		'<style>/* the <tool-bar> */</style><tool-bar-SOLARITE-PLACEHOLDER></tool-bar-SOLARITE-PLACEHOLDER>');
});

Testimony.test('Solarite.Util.componentNameCharacters', `A component whose tag name holds a character other than a letter, a digit or a dash, as a custom element's name may, such as _ or a dot, is constructed with its arguments and its children like any other.`, () => {
	let got = [];
	class NameUnder extends HTMLElement {
		constructor(args) { super(); got.push(args?.n); }
	}
	class NameDot extends HTMLElement {
		constructor(args) { super(); got.push(args?.n); }
	}
	customElements.define('name-x_under', NameUnder);
	customElements.define('name-x.dot', NameDot);
	let el = document.createElement('div');
	h(el)`<name-x_under n=${1}><b>${'u'}</b></name-x_under><name-x.dot n=${2}>${'d'}</name-x.dot>`;
	assert.eq(got.sort().join() + '|' + [...el.children].map(c => c.localName + ':' + c.textContent).join(), '1,2|name-x_under:u,name-x.dot:d');
	assert.eq(el.firstChild instanceof NameUnder && el.lastChild instanceof NameDot, true);
});

Testimony.test('Solarite.Util.camelToDashes', () => {
	assert.eq(SolariteUtil.camelToDashes('ProperName'), 'proper-name');
	assert.eq(SolariteUtil.camelToDashes('HTMLElement'), 'html-element');
	assert.eq(SolariteUtil.camelToDashes('BigUI'), 'big-ui');
	assert.eq(SolariteUtil.camelToDashes('UIForm'), 'ui-form');
	assert.eq(SolariteUtil.camelToDashes('A100'), 'a-100');
});

Testimony.test('Solarite.Util.attribsToObject', `An element's attributes as an object with camelCase names, less the one asked to be left out`, () => {
	let el = toEl(`<div data-id="a" tab-index="2" _is="x-y" hidden></div>`);
	assert.eqJson(SolariteUtil.attribsToObject(el), {dataId: 'a', tabIndex: '2', _is: 'x-y', hidden: ''});
	assert.eqJson(SolariteUtil.attribsToObject(el, '_is'), {dataId: 'a', tabIndex: '2', hidden: ''});
});

Testimony.test('Solarite.Util.getInputValue', `Each kind of input gives its value in the type that fits it`, () => {
	const value = html => SolariteUtil.getInputValue(toEl(html));

	// 1. A checkbox is a boolean, whatever its value attribute says.
	let checkbox = toEl(`<input type="checkbox" value="v" checked>`);
	assert.eq(SolariteUtil.getInputValue(checkbox), true);
	checkbox.checked = false;
	assert.eq(SolariteUtil.getInputValue(checkbox), false);

	// 2. A radio is its value, and stays so with a contenteditable attribute beside it.
	assert.eq(value(`<input type="radio" value="b">`), 'b');
	assert.eq(value(`<input type="radio" value="b" contenteditable>`), 'b');

	// 3. A file input is an array of its files.
	let files = value(`<input type="file">`);
	assert(Array.isArray(files));
	assert.eq(files.length, 0);

	// 4. Number and range are numbers.
	assert.eq(value(`<input type="number" value="3.5">`), 3.5);
	assert.eq(value(`<input type="range" min="0" max="10" value="7">`), 7);
	assert(Number.isNaN(value(`<input type="number">`)));

	// 5. Date and time are Dates.  datetime-local is whatever the browser gives as valueAsDate.
	let date = value(`<input type="date" value="2026-02-03">`);
	assert(date instanceof Date);
	assert.eq(date.toISOString(), '2026-02-03T00:00:00.000Z');
	let time = value(`<input type="time" value="01:02">`);
	assert(time instanceof Date);
	assert.eq(time.getTime(), 62 * 60 * 1000);
	let local = toEl(`<input type="datetime-local" value="2026-02-03T04:05">`);
	assert.eq(SolariteUtil.getInputValue(local), local.valueAsDate);

	// 6. A multiple select is the array of its selected values; a single one is a string.
	assert.eqJson(value(`<select multiple><option value="a" selected>A</option><option value="b">B</option><option value="c" selected>C</option></select>`), ['a', 'c']);
	assert.eq(value(`<select><option value="a">A</option><option value="b" selected>B</option></select>`), 'b');

	// 7. Text inputs and textareas are strings.
	assert.eq(value(`<input value="t">`), 't');
	assert.eq(value(`<textarea>ta</textarea>`), 'ta');

	// 8. A contenteditable is its html.
	assert.eq(value(`<div contenteditable><b>x</b></div>`), '<b>x</b>');
});

Testimony.test('Solarite.Util.isHtmlProp', `A name is a property when the element's built-in class has a setter for it`, () => {
	// Answers are remembered by tag name and property, so these use a tag no other test asks about.
	let meter = document.createElement('meter');
	assert.eq(SolariteUtil.isHtmlProp(meter, 'value'), true);
	assert.eq(SolariteUtil.isHtmlProp(meter, 'labels'), false); // Read-only.
	assert.eq(SolariteUtil.isHtmlProp(meter, 'nothing'), false);

	// Only the nearest built-in class is asked, so a property every element inherits does not count.
	assert.eq(SolariteUtil.isHtmlProp(meter, 'title'), false);

	// The built-in classes between it and HTMLElement are asked for a property holding a boolean or a number, so an
	// <audio> has the muted and volume of HTMLMediaElement.  Its src, which holds text, stays an attribute.
	let audio = document.createElement('audio');
	assert.eq(SolariteUtil.isHtmlProp(audio, 'muted'), true);
	assert.eq(SolariteUtil.isHtmlProp(audio, 'volume'), true);
	assert.eq(SolariteUtil.isHtmlProp(audio, 'src'), false);
	assert.eq(SolariteUtil.isHtmlProp(audio, 'title'), false);

	// The classes of a web component are passed over on the way to that built-in class.
	class IsHtmlPropBase extends HTMLElement {
		set mine(v) {}
	}
	class IsHtmlPropChild extends IsHtmlPropBase {}
	customElements.define('is-html-prop-child', IsHtmlPropChild);
	let el = new IsHtmlPropChild();
	assert.eq(SolariteUtil.isHtmlProp(el, 'title'), true);
	assert.eq(SolariteUtil.isHtmlProp(el, 'mine'), false);

	// An element with no HTML class behind it has none.
	let circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	assert.eq(SolariteUtil.isHtmlProp(circle, 'id'), false);
});

Testimony.test('Solarite.Util.makePrimitive', `What an attribute expression is turned into before it is written`, () => {
	assert.eq(SolariteUtil.makePrimitive('a'), 'a');
	assert.eq(SolariteUtil.makePrimitive(3), 3);
	assert.eq(SolariteUtil.makePrimitive(true), true);
	assert.eq(SolariteUtil.makePrimitive(undefined), undefined);

	// A function is called, and what it returns is too, until something else comes back.
	assert.eq(SolariteUtil.makePrimitive(() => () => 'b'), 'b');

	assert.eq(SolariteUtil.makePrimitive(new Date(Date.UTC(2026, 0, 2, 3, 4, 5))), '2026-01-02 03:04:05.000Z');

	// Arrays, objects and null are written as nothing.
	assert.eq(SolariteUtil.makePrimitive([1, 2]), '');
	assert.eq(SolariteUtil.makePrimitive({a: 1}), '');
	assert.eq(SolariteUtil.makePrimitive(null), '');
});
//endregion


//region assignAttributes
/*┌──────────────────╮
  | assignAttributes |
  └──────────────────╯*/
import {assignAttributes} from '../src/Solarite.js';

// Build a detached element with declared fields and html attributes.
function attribEl(fields, attribs) {
	let el = document.createElement('div');
	Object.assign(el, fields);
	for (let name in attribs)
		el.setAttribute(name, attribs[name]);
	return el;
}

Testimony.test('Solarite.assignAttributes.basic', () => {
	let el = attribEl({name: '', duration: 0}, {name: 'timer', duration: '7'});
	assignAttributes(el, {duration: Number});
	assert.eq(el.name, 'timer'); // no type named, so the raw string
	assert.eq(el.duration, 7);   // cast to Number
});

Testimony.test('Solarite.assignAttributes.types', () => {
	let el = attribEl(
		{age: 0, price: 0, label: '', active: false, created: null, slug: ''},
		{age: '30', price: '19.99', label: '123', active: 'true',
			created: '2024-01-01T00:00:00Z', slug: 'a b'});
	assignAttributes(el, {
		age: Number,
		price: Number,
		label: String,
		active: Boolean,
		created: Date,
		slug: s => s.replace(/ /g, '-') // custom string=>value converter
	});
	assert.eq(el.age, 30);
	assert.eq(el.price, 19.99);
	assert.eq(el.label, '123');
	assert.eq(el.active, true);
	assert.eq(el.created instanceof Date, true);
	assert.eq(el.created.getUTCFullYear(), 2024);
	assert.eq(el.slug, 'a-b');
});

Testimony.test('Solarite.assignAttributes.booleanPresence', () => {
	// Present (even bare) is true; 'false' and '0' are false; omitted keeps the default.
	let on = attribEl({autoStart: false}, {'auto-start': ''});
	assignAttributes(on, {autoStart: Boolean});
	assert.eq(on.autoStart, true);

	let off = attribEl({autoStart: true}, {'auto-start': 'false'});
	assignAttributes(off, {autoStart: Boolean});
	assert.eq(off.autoStart, false);

	let missing = attribEl({autoStart: false}, {});
	assignAttributes(missing, {autoStart: Boolean});
	assert.eq(missing.autoStart, false);
});

Testimony.test('Solarite.assignAttributes.ignore', () => {
	let el = attribEl({a: 0, b: 0}, {a: '1', b: '2'});
	assignAttributes(el, {a: Number, b: Number}, ['b']);
	assert.eq(el.a, 1);
	assert.eq(el.b, 0); // skipped
});

Testimony.test('Solarite.assignAttributes.unknownAttributeSkipped', () => {
	let el = attribEl({known: ''}, {known: 'yes', unknown: 'no'});
	assignAttributes(el);
	assert.eq(el.known, 'yes');
	assert.eq('unknown' in el, false); // an attribute with no matching field isn't added
});

Testimony.test('Solarite.assignAttributes.jsonExpr', () => {
	// A ${...} attribute is JSON-parsed back to its type, ignoring `types`.
	let el = attribEl({count: 0, items: null}, {count: '${5}', items: '${[1,2,3]}'});
	assignAttributes(el, {count: String});
	assert.eq(el.count, 5); // a number, not the string '5'
	assert.eq(el.items.length, 3);
});
//endregion



//region basic
/*┌─────────────────╮
  | Basic           |
  └─────────────────╯*/
Testimony.test('Solarite.basic.empty', () => {
	class A extends HTMLElement {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)``
		}
	}
	customElements.define('r-10', A);


	let a = new A();
	assert.eq(getHtml(a), '<r-10></r-10>');
	assert.eq(a.childNodes.length, 0);
});

Testimony.test('Solarite.basic.empty2', () => {

	class R11 extends Solarite {
		constructor(args) {
			super();
			//	console.log(args)
		}

		render() {
			h(this)`<r-11></r-11>`
		}
	}
	R11.define();

	let a = toEl(`<r-11 title="Hello"></r-11>`);
	assert.eq(a.outerHTML, `<r-11 title="Hello"></r-11>`);
});

Testimony.test('Solarite.basic.text', () => {
	class A extends Solarite {
		render() {
			h(this)`Here's Solarite &lt;Component&gt;` // apostophe, <>.
		}
	}
	customElements.define('r-15', A);

	let a = new A();
	document.body.append(a); // Calls render()

	assert.eq(getHtml(a), '<r-15>Here\'s Solarite &lt;Component&gt;</r-15>');
	assert.eq(a.childNodes.length, 1);

	a.remove();
});

Testimony.test('Solarite.basic.manualRender', () => {

	let children1, children2;

	class A extends Solarite {
		constructor() {
			super();
			children1 = [...this.childNodes]
			this.render();
			children2 = [...this.childNodes]
		}

		render() {
			h(this)`Solarite Component`
		}
	}
	customElements.define('r-20', A);

	let a = new A();

	assert.eq(children1.length, 0);
	assert.eq(children2.length, 1);
	assert.eq(children2[0].textContent, 'Solarite Component');
});

Testimony.test('Solarite.basic.pseudoRoot', () => {
	class R30 extends Solarite {
		render() {
			h(this)`<r-30 title="Hello">World</r-30>`
		}
	}

	let a = new R30();
	a.render();

	assert.eq(getHtml(a), `<r-30 title="Hello">World</r-30>`)
});

Testimony.test('Solarite.basic.createElement', () => {
	class R35 extends Solarite {
		constructor() {
			super();
			//this.render(); // If uncommented, we get browser error:
			// "Uncaught DOMException: Failed to construct 'CustomElement': The result must not have children"
		}

		render() {
			h(this)`<div>Hello!</div>`
		}
	}
	R35.define();

	let a = document.createElement('r-35');

	assert.eq(getHtml(a), `<r-35></r-35>`); // Not rendered yet.
	assert(a instanceof Solarite);

	a.render();
	assert.eq(getHtml(a), `<r-35><div>Hello!</div></r-35>`);
});

Testimony.test('Solarite.basic.instanceof', () => {
	class R37 extends Solarite {
		render() {
			h(this)`<r-37>Hello!</r-37>`
		}
	}

	const r = new R37();
	assert(r instanceof Solarite);
	assert(r instanceof HTMLElement);
	assert(r instanceof Node);
});
//endregion



//region switch
/*┌─────────────────╮
  | Template switch |
  └─────────────────╯*/
Testimony.test('Solarite.switch.component', `A render() that gives its element one template and later another shows the one it gave last.`, () => {
	class W10 extends Solarite {
		rows = null;
		keyed = false;
		render() {
			if (!this.rows)
				h(this)`<p>Loading</p>`;
			else if (this.keyed)
				h(this)`<ul>${h.map(this.rows, row => h`<li key=${row.id}>${row.text}</li>`)}</ul>`;
			else
				h(this)`<ol>${this.rows.map(row => h`<li>${row.text}</li>`)}</ol>`;
		}
	}
	W10.define();

	// 1. A message, then a list, then the message again.
	let a = new W10();
	a.render();
	assert.eq(getHtml(a), '<w-10><p>Loading</p></w-10>');
	let p = a.firstChild;
	a.rows = [{id: 1, text: 'a'}, {id: 2, text: 'b'}];
	a.render();
	assert.eq(getHtml(a), '<w-10><ol><li>a</li><li>b</li></ol></w-10>');

	// 2. Away from a list that has rows.  The rows went to the list's place in the first
	// template as long as nothing compared the two, so the list was emptied instead.
	let li = a.querySelector('li');
	a.rows = null;
	a.render();
	assert.eq(getHtml(a), '<w-10><p>Loading</p></w-10>');

	// 3. A template that comes back is built again.  Its old elements are not kept.
	assert.neq(a.firstChild, p);
	a.rows = [{id: 2, text: 'b'}, {id: 3, text: 'c'}];
	a.render();
	assert.eq(getHtml(a), '<w-10><ol><li>b</li><li>c</li></ol></w-10>');
	assert.neq(a.querySelector('li'), li);

	// 4. From one list to another kind of list, and the same template again updates in place.
	a.keyed = true;
	a.render();
	assert.eq(getHtml(a), '<w-10><ul><li>b</li><li>c</li></ul></w-10>');
	li = a.querySelector('li');
	a.rows = [a.rows[1], a.rows[0]];
	a.render();
	assert.eq(getHtml(a), '<w-10><ul><li>c</li><li>b</li></ul></w-10>');
	assert.eq(a.querySelectorAll('li')[1], li);
});

Testimony.test('Solarite.switch.element', `h(el) with another template than the one el holds replaces what the first one put there, in an element, a DocumentFragment and a shadow root.`, () => {
	let html = root => getHtml([...root.childNodes]);
	for (let makeRoot of [
		() => document.createElement('div'),
		() => document.createDocumentFragment(),
		() => document.createElement('div').attachShadow({mode: 'closed'})
	]) {
		// 1. More expressions, fewer, and of other kinds.  Each used to be given to whatever
		// the first template had at the same position: text became a title, a handler was
		// called as if it were a child.
		let root = makeRoot(), called = 0;
		h(root)`<p title=${'t'} class=${'c'}>${1}</p>`;
		h(root)`<i>${2}</i><b>${3}</b>`;
		assert.eq(html(root), '<i>2</i>|<b>3</b>');
		h(root)`<p>${4}</p>`;
		assert.eq(html(root), '<p>4</p>');
		h(root)`<button onclick=${() => called++}>${5}</button>`;
		assert.eq(html(root), '<button>5</button>');
		assert.eq(called, 0);

		// 2. Templates that differ only in their static text.
		root = makeRoot();
		h(root)`<p>Loading</p>`;
		h(root)`<p>Done</p>`;
		assert.eq(html(root), '<p>Done</p>');

		// 3. Text alone, and nothing at all, are templates like any other.
		root = makeRoot();
		let text = () => h(root)`Loading`, empty = () => h(root)``, full = v => h(root)`<p>${v}</p>`;
		text();
		full(1);
		assert.eq(html(root), '<p>1</p>');
		empty();
		assert.eq(root.childNodes.length, 0);
		empty();
		full(2);
		assert.eq(html(root), '<p>2</p>');
		text();
		assert.eq(html(root), 'Loading');
		empty();
		assert.eq(root.childNodes.length, 0);
	}

	// 4. The same html is the same template, also when it is made from a string each time,
	// which gives it a new array of html each time.  The elements stay.
	let el = document.createElement('div');
	h(el, h('<p>Same</p>'));
	let p = el.firstChild;
	h(el, h('<p>Same</p>'));
	assert.eq(el.firstChild, p);
	h(el, h('<p>Other</p>'));
	assert.eq(getHtml(el), '<div><p>Other</p></div>');

	// 4a. So do they when the template has expressions and its array is built for each render,
	// as a helper that prepares the strings does, and when the same literal is written at two
	// places.  Taking either for another template would rebuild the input on every render,
	// and the text typed into it would be lost.
	el = document.createElement('div');
	let built = v => h(el, h(['<input><b>', '</b>'], v));
	built('a');
	let input = el.firstChild;
	input.value = 'typed';
	built('b');
	assert.eq(el.firstChild, input);
	assert.eq(input.value, 'typed');
	assert.eq(getHtml(el), '<div><input><b>b</b></div>');

	el = document.createElement('div');
	let twice = (first, v) => first ? h(el)`<input><b>${v}</b>` : h(el)`<input><b>${v}</b>`;
	twice(true, 'a');
	input = el.firstChild;
	twice(false, 'b');
	twice(true, 'c');
	assert.eq(el.firstChild, input);
	assert.eq(getHtml(el), '<div><input><b>c</b></div>');

	// 4b. One string more or less, or one that differs, is another template.
	h(el, h(['<input><b>', '</b>!'], 'e'));
	assert.neq(el.firstChild, input);
	assert.eq(getHtml(el), '<div><input><b>e</b>!</div>');
	h(el, h(['<input><b>', '</b>', '!'], 'f', 'g'));
	assert.eq(getHtml(el), '<div><input><b>f</b>g!</div>');

	// 5. The render options given with a template are the ones it is built with.
	el = document.createElement('div');
	h(el, h`<p data-id="one">a</p>`, {ids: false});
	h(el, h`<i data-id="two">b</i>`);
	assert.eq(el.one, undefined);
	assert.eq(el.two, el.firstChild);
});

Testimony.test('Solarite.switch.manyNodes', `An element that holds more nodes than a function call takes arguments can be given another template.`, () => {
	// The old template's nodes used to be handed to one append() call as arguments, and a list
	// of 150,000 rows at the top of a template made that call throw a RangeError.  The nodes go
	// in before the template's last node, among its own: nodes after it are not the template's,
	// and stay for the next one (see switch.appended).
	let el = document.createElement('div');
	h(el)`<p>a</p>`;
	el.insertAdjacentHTML('afterbegin', '<!---->'.repeat(150_000));
	h(el)`<p>b</p>`;
	assert.eq(el.childNodes.length, 1);
	assert.eq(getHtml(el), '<div><p>b</p></div>');
});

Testimony.test('Solarite.switch.appended', `Nodes other code put after the template in the element stay through a switch, whether or not the element was given children for its slots.`, () => {
	// 1. They used to stay only with slot children, and only when the template had no unnamed
	// slot, because the children were then found as everything after the template's last node.
	let withKids = toEl('<div><b>kid</b></div>'), without = document.createElement('div');
	for (let el of [withKids, without]) {
		h(el)`<p>a</p>`;
		el.append(document.createElement('u'));
		h(el)`<p>b</p>`;
	}
	assert.eq(getHtml(withKids), '<div><p>b</p><b>kid</b><u></u></div>');
	assert.eq(getHtml(without), '<div><p>b</p><u></u></div>');

	// 2. A template with an unnamed slot.  What came after it follows the slot children.
	let el = toEl('<div><b>kid</b></div>');
	h(el)`<main><slot></slot></main>`;
	el.append(document.createElement('u'));
	h(el)`<p>c</p>`;
	assert.eq(getHtml(el), '<div><p>c</p><b>kid</b><u></u></div>');

	// 3. The empty template, which leaves everything in the element to other code.
	el = document.createElement('div');
	h(el)``;
	el.append(document.createElement('u'));
	h(el)`<p>d</p>`;
	assert.eq(getHtml(el), '<div><p>d</p><u></u></div>');

	// 4. A template whose last node is a child component, which was still a placeholder when
	// the end of the template was noted.
	customElements.define('w-45', class extends HTMLElement {
		render() { h(this)`foot`; }
	});
	el = document.createElement('div');
	h(el)`<p>e</p><w-45></w-45>`;
	el.append(document.createElement('u'));
	h(el)`<p>f</p>`;
	assert.eq(getHtml(el), '<div><p>f</p><u></u></div>');
});

Testimony.test('Solarite.switch.host', `When the template's own root stands for the element, the attributes and handlers it put on the element follow the template.`, () => {
	let log = [];
	class W20 extends Solarite {
		mode = 'a';
		render() {
			if (this.mode === 'a')
				h(this)`<w-20 class="tpl-a" role="list" title=${'A'} data-n="x ${1} y" ${{lang: 'en'}}
					onclick=${() => log.push('click a')} onscroll=${() => log.push('scroll a')}>a</w-20>`;
			else if (this.mode === 'b')
				h(this)`<w-20 class="tpl-b" hidden=${true} onmouseup=${() => log.push('up b')}>b</w-20>`;
			else
				h(this)`plain`;
		}
	}
	W20.define();

	// 1. An attribute the page gave the element wins over the template's, and stays through
	// every template.
	let div = toEl('<div><w-20 class="page" id="keep"></w-20></div>');
	document.body.append(div);
	let a = div.firstChild;
	assert.eq(a.outerHTML, '<w-20 class="page" id="keep" role="list" data-n="x 1 y" lang="en" title="A">a</w-20>');

	// 2. What the first template put there is gone, whichever way it was written.
	a.mode = 'b';
	a.render();
	assert.eq(a.outerHTML, '<w-20 class="page" id="keep" hidden="">b</w-20>');

	// 3. So are its handlers: a delegated one, and one bound with addEventListener.
	a.click();
	a.dispatchEvent(new Event('scroll'));
	a.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	assert.eq(log.join(), 'up b');

	// 4. A template with no root of its own leaves nothing of either on the element.
	a.mode = 'c';
	a.render();
	assert.eq(a.outerHTML, '<w-20 class="page" id="keep">plain</w-20>');
	a.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	assert.eq(log.join(), 'up b');

	// 5. And back.
	a.mode = 'a';
	a.render();
	assert.eq(a.outerHTML, '<w-20 class="page" id="keep" role="list" data-n="x 1 y" lang="en" title="A">a</w-20>');
	a.click();
	assert.eq(log.join(), 'up b,click a');

	// 6. Without an attribute of the page's in the way, each template's own class shows.
	let b = new W20();
	b.render();
	assert.eq(b.className, 'tpl-a');
	b.mode = 'b';
	b.render();
	assert.eq(b.className, 'tpl-b');

	div.remove();
});

Testimony.test('Solarite.switch.parentAttribs', `A child component's switch leaves the attributes its parent gave it, and takes back those its own template wrote.`, () => {
	// A component that renders from its constructor builds its first template before the
	// parent's template has copied its attributes onto it.  That template used to count the
	// names the parent then wrote among its own, and the switch removed them.
	class W25 extends Solarite {
		mode = 'a';
		constructor(attribs) {
			super(attribs);
			this.render();
		}
		render() {
			if (this.mode === 'a')
				h(this)`<w-25 class="card" role="tab" title="t">a</w-25>`;
			else
				h(this)`<w-25 class="saved">b</w-25>`;
		}
	}
	W25.define();

	// 1. A static class and a dynamic role from the parent, the role with the same value the
	// child's template writes.  The parent's values win from the start, and stay.
	let host = document.createElement('div');
	let draw = role => h(host)`<w-25 class="wide" role=${role}></w-25>`;
	draw('tab');
	let a = host.firstChild;
	assert.eq(a.outerHTML, '<w-25 class="wide" role="tab" title="t">a</w-25>');
	a.mode = 'b';
	a.render();
	assert.eq(a.outerHTML, '<w-25 class="wide" role="tab">b</w-25>');
	draw('tab');
	assert.eq(a.outerHTML, '<w-25 class="wide" role="tab">b</w-25>');

	// 2. A dynamic class from a keyed row.  The parent's next render skips the unchanged row, so
	// a class removed by the switch never came back.
	host = document.createElement('div');
	let rows = [{id: 1}, {id: 2}];
	let list = () => h(host)`<div>${h.map(rows, row => h`<w-25 key=${row.id} class=${row.id === 2 ? 'danger' : 'plain'}></w-25>`)}</div>`;
	list();
	let b = host.querySelectorAll('w-25')[1];
	b.mode = 'b';
	b.render();
	list();
	assert.eq(b.className, 'danger');

	// 3. A class the component set on itself is the template's to replace, as is one the
	// template wrote that the component's code added to.
	let c = new W25();
	c.className = 'open';
	c.mode = 'b';
	c.render();
	assert.eq(c.className, 'saved');
	c = new W25();
	c.classList.add('open');
	c.mode = 'b';
	c.render();
	assert.eq(c.className, 'saved');
});

Testimony.test('Solarite.switch.intoStandalone', `Rendering into an element made by h() keeps the attributes and handlers the template that made it gave it.`, () => {
	// The element is the root of the template that made it, so a template rendered into it
	// takes that one's place.  The switch took back what that template wrote on the element,
	// as it does for a component's template wrapped in the component's tag, though here it was
	// the element's own definition.
	let clicks = 0;
	let div = h()`<div class=${'card'} title="t" onclick=${() => clicks++}>${'x'}</div>`;
	document.body.append(div);
	h(div)`<p>${'inside'}</p>`;
	assert.eq(div.outerHTML, '<div title="t" class="card"><p>inside</p></div>');
	div.click();
	assert.eq(clicks, 1);
	div.remove();
});

Testimony.test('Solarite.switch.idsAndStyles', `Element references and scoped styles are those of the template the element holds.`, () => {
	class W30Child extends Solarite {
		render() { h(this)`<w-30-child><input data-id="value"></w-30-child>`; }
	}
	W30Child.define();

	class W30 extends Solarite {
		value = 5;
		mode = 'a';
		render() {
			if (this.mode === 'a')
				h(this)`<style>:host { color: red }</style><w-30-child data-id="kid"></w-30-child><i data-id="parts.icon">i</i><u data-id="both">a</u>`;
			else
				h(this)`<style>:host { color: blue }</style><b data-id="parts.bold">b</b><s data-id="both">b</s>`;
		}
	}
	W30.define();

	let a = new W30();
	a.render();
	let kid = a.kid;
	assert.eq(kid.tagName, 'W-30-CHILD');
	assert.eq(a.parts.icon.tagName, 'I');

	a.mode = 'b';
	a.render();

	// 1. A name only the first template had no longer gives an element that was removed.
	assert.eq(a.kid, null);
	assert.eq(a.parts.icon, null);

	// 2. The second template's names are bound, and a name both have gives the new element.
	assert.eq(a.parts.bold.tagName, 'B');
	assert.eq(a.both.tagName, 'S');

	// 3. A field that only shares its name with an id inside a child component is left alone.
	assert.eq(a.value, 5);
	assert.eq(kid.value.tagName, 'INPUT');

	// 4. One scoped style, the new one, under the same data-style number.
	assert.eq(a.querySelectorAll('style').length, 1);
	assert.eq(a.querySelector('style').textContent, 'w-30[data-style="1"] { color: blue }');
	assert.eq(a.getAttribute('data-style'), '1');
});

Testimony.test('Solarite.switch.formIds', `A switch away from a form with a control named id, and from an element whose data-id is empty.`, () => {
	// 1. A form's named controls hide its own properties, so the id of <form id="editForm"> with
	// an <input name="id"> in it reads as that input.  Forgetting the old template's ids used to
	// throw on it, which left the component empty and stopped the parent's render that started
	// the switch part-way.
	class W35 extends Solarite {
		constructor(attribs) {
			super(attribs);
			this.render(attribs);
		}
		render({n, saved}={}) {
			if (!saved)
				h(this)`<form id="editForm"><input type="hidden" name="id" value=${n}></form><button form="editForm">Save</button>`;
			else
				h(this)`<p>saved ${n}</p>`;
		}
	}
	W35.define();
	let host = document.createElement('div');
	let draw = saved => h(host)`<div>${[1, 2].map(n => h`<w-35 n=${n} saved=${saved}></w-35>`)}</div><b>${saved ? 'saved' : 'editing'}</b>`;
	draw(false);
	let first = host.querySelector('w-35');
	assert.eq(first.editForm.tagName, 'FORM');
	draw(true);
	assert.eq(getHtml(host), '<div><div><w-35 n="1" saved=""><p>saved 1</p></w-35><w-35 n="2" saved=""><p>saved 2</p></w-35></div><b>saved</b></div>');
	assert.eq(first.editForm, null);

	// 2. An element with an empty data-id, written or given by an expression, and no id.
	let el = document.createElement('div');
	h(el)`<b data-id="">x</b><i data-id=${''}>y</i>`;
	h(el)`<p>z</p>`;
	assert.eq(getHtml(el), '<div><p>z</p></div>');
});

Testimony.test('Solarite.switch.slots', `The children an element was given go to the slots of whichever template it holds.`, () => {
	class W40 extends Solarite {
		constructor({mode='a'}={}) {
			super();
			this.mode = mode;
		}
		render(attribs) {
			if (attribs?.mode)
				this.mode = attribs.mode;
			if (this.mode === 'a')
				h(this)`<p>Loading</p><slot></slot>`;
			else if (this.mode === 'b')
				h(this)`<header><slot name="head"></slot></header><main><slot>:</slot></main>`;
			else if (this.mode === 'c')
				h(this)`<h1>no slot</h1>`;
			else if (this.mode === 'd')
				h(this)`text`;
			else
				h(this)``;
		}
	}
	W40.define();

	// 1. Children from the page's html: into a slot, into named slots, to the end of a
	// template that has no slot, after a template that is only text, and back.
	let div = document.createElement('div');
	div.innerHTML = '<w-40><b slot="head">h</b><i>i</i></w-40>';
	let a = div.firstChild;
	a.render();
	assert.eq(getHtml(a), '<w-40><p>Loading</p><slot><b slot="head">h</b><i>i</i></slot></w-40>');
	let b = a.querySelector('b'), i = a.querySelector('i');
	let show = mode => {
		a.mode = mode;
		a.render();
		assert.eq(a.querySelector('b'), b); // The same nodes, never copies.
		assert.eq(a.querySelector('i'), i);
		return getHtml(a);
	};
	assert.eq(show('b'), '<w-40><header><slot name="head"><b slot="head">h</b></slot></header><main><slot>:<i>i</i></slot></main></w-40>');
	assert.eq(show('c'), '<w-40><h1>no slot</h1><b slot="head">h</b><i>i</i></w-40>');
	assert.eq(show('d'), '<w-40>text<b slot="head">h</b><i>i</i></w-40>');
	assert.eq(show('b'), '<w-40><header><slot name="head"><b slot="head">h</b></slot></header><main><slot>:<i>i</i></slot></main></w-40>');
	assert.eq(show('a'), '<w-40><p>Loading</p><slot><b slot="head">h</b><i>i</i></slot></w-40>');

	// 2. An empty template shows nothing, and the children are there again for the next one.
	a.mode = 'e';
	a.render();
	assert.eq(a.childNodes.length, 0);
	assert.eq(show('a'), '<w-40><p>Loading</p><slot><b slot="head">h</b><i>i</i></slot></w-40>');

	// 3. A child the page has since taken out stays out, and one it added to the slot stays
	// in, also when the child taken out was the first one.
	i.remove();
	a.querySelector('slot').append(document.createElement('u'));
	a.mode = 'c';
	a.render();
	assert.eq(getHtml(a), '<w-40><h1>no slot</h1><b slot="head">h</b><u></u></w-40>');
	b.remove();
	a.mode = 'a';
	a.render();
	assert.eq(getHtml(a), '<w-40><p>Loading</p><slot><u></u></slot></w-40>');

	// 4. A template without a slot whose last node is a child component.  The children follow
	// the component, which was still a placeholder when they were put there.
	class W40Foot extends HTMLElement {
		render() { h(this)`foot`; }
	}
	customElements.define('w-40-foot', W40Foot);
	let el = toEl('<div><b>kid</b></div>');
	h(el)`<h2>${'title'}</h2><w-40-foot></w-40-foot>`;
	assert.eq(getHtml(el), '<div><h2>title</h2><w-40-foot>foot</w-40-foot><b>kid</b></div>');
	h(el)`<main><slot></slot></main>`;
	assert.eq(getHtml(el), '<div><main><slot><b>kid</b></slot></main></div>');

	// 5. Children declared in a parent's template, with a list among them.  The parent goes
	// on drawing its list wherever the child's template has put it, also while the child
	// shows nothing.
	let host = document.createElement('div');
	let render = (mode, items) => h(host)`<w-40 mode=${mode}><b>kid</b>${items.map(item => h`<i>${item}</i>`)}</w-40>`;
	render('a', [1]);
	assert.eq(getHtml(host), '<div><w-40 mode="a"><p>Loading</p><slot><b>kid</b><i>1</i></slot></w-40></div>');
	render('b', [1, 2]);
	assert.eq(getHtml(host), '<div><w-40 mode="b"><header><slot name="head"></slot></header><main><slot>:<b>kid</b><i>1</i><i>2</i></slot></main></w-40></div>');
	render('b', [3]);
	assert.eq(getHtml(host), '<div><w-40 mode="b"><header><slot name="head"></slot></header><main><slot>:<b>kid</b><i>3</i></slot></main></w-40></div>');
	render('e', [3, 4]);
	assert.eq(getHtml(host), '<div><w-40 mode="e"></w-40></div>');
	render('e', [5]);
	render('c', [5, 6]);
	assert.eq(getHtml(host), '<div><w-40 mode="c"><h1>no slot</h1><b>kid</b><i>5</i><i>6</i></w-40></div>');
	render('c', []);
	assert.eq(getHtml(host), '<div><w-40 mode="c"><h1>no slot</h1><b>kid</b></w-40></div>');

	// 6. A component that changes its template while a parent's template is constructing
	// another component of the same class.  The children on their way to that one are not
	// for this one, which has its own.
	let first = document.createElement('div');
	class W40Poke extends HTMLElement {
		constructor({poke}={}) {
			super();
			this.mode = 'a';
			if (poke) {
				first.firstChild.mode = 'b';
				first.firstChild.render();
			}
		}
		render() {
			if (this.mode === 'a')
				h(this)`<p>a</p><slot></slot>`;
			else
				h(this)`<section><slot></slot></section>`;
		}
	}
	customElements.define('w-40-poke', W40Poke);
	first.innerHTML = '<w-40-poke><b>mine</b></w-40-poke>';
	first.firstChild.render();
	let second = document.createElement('div');
	h(second)`<w-40-poke poke=${true}><i>other</i></w-40-poke>`;
	assert.eq(getHtml(first), '<div><w-40-poke><section><slot><b>mine</b></slot></section></w-40-poke></div>');
	assert.eq(getHtml(second), '<div><w-40-poke poke=""><p>a</p><slot><i>other</i></slot></w-40-poke></div>');
});

Testimony.test('Solarite.switch.nested', `A child component that changes its template inside the rows of its parent, while the parent moves the rows.`, () => {
	class W50 extends HTMLElement {
		constructor({item}={}) {
			super();
			this.item = item;
		}
		render(attribs) {
			if (attribs?.item)
				this.item = attribs.item;
			if (this.item.loading)
				h(this)`<i>loading ${this.item.id}</i>`;
			else
				h(this)`<b>${this.item.id}</b><input value=${this.item.text}>`;
		}
	}
	customElements.define('w-50', W50);

	let el = document.createElement('div');
	let items = [{id: 1, loading: true, text: 'x'}, {id: 2, loading: true, text: 'y'}, {id: 3, loading: false, text: 'z'}];
	let render = () => h(el)`<ul>${items.map(item => h`<li key=${item.id}><w-50 item=${item}></w-50></li>`)}</ul>`;
	render();
	let first = el.querySelector('w-50');
	assert.eq(getHtml([...el.querySelectorAll('li')]), '<li><w-50><i>loading 1</i></w-50></li>|<li><w-50><i>loading 2</i></w-50></li>|<li><w-50><b>3</b><input value="z"></w-50></li>');

	items[0].loading = false;
	render();
	assert.eq(getHtml(first), '<w-50><b>1</b><input value="x"></w-50>');
	assert.eq(first.querySelector('input').value, 'x');

	items.reverse();
	items[2].loading = true;
	items[0].loading = true;
	render();
	assert.eq(getHtml([...el.querySelectorAll('li')]), '<li><w-50><i>loading 3</i></w-50></li>|<li><w-50><i>loading 2</i></w-50></li>|<li><w-50><i>loading 1</i></w-50></li>');
	assert.eq(el.querySelectorAll('w-50')[2], first);
});

Testimony.test('Solarite.switch.definedLater', `A component that isn't defined yet is built when it is defined only if the element still holds its template.`, async () => {
	let built = [];

	// 1. A template switched away before the definition arrives, as a tab the user leaves
	// while its module loads.  Its component used to be built all the same, and its data-id
	// took the name from the element of the template shown.
	let el = document.createElement('div');
	h(el)`<section><w-55 data-id="view" n=${1}></w-55></section>`;
	h(el)`<table data-id="view"></table>`;

	// 2. Away and back.  Only the component of the template shown is built.
	let el2 = document.createElement('div');
	let show = () => h(el2)`<div><w-55 data-id="view" n=${2}></w-55></div>`;
	show();
	h(el2)`<p>b</p>`;
	show();

	customElements.define('w-55', class extends HTMLElement {
		constructor(attribs) {
			super();
			built.push(attribs?.n);
		}
	});
	await customElements.whenDefined('w-55');
	await Promise.resolve();
	assert.eq(built.join(), '2');
	assert.eq(el.view.tagName, 'TABLE');
	assert.eq(el2.view, el2.querySelector('w-55'));
});

Testimony.test('Solarite.switch.reentrant', `A template that is changed from inside a render of the element, or from one of its own handlers.`, () => {
	// 1. A child component that renders its parent with another template while the parent is
	// still building it.  The parent's first render carries on when the child returns, with
	// two expressions for the parent's own element still to apply; they must not land there.
	class W60Child extends HTMLElement {
		constructor({owner}={}) {
			super();
			if (owner?.mode === 'a') {
				owner.mode = 'b';
				owner.render();
			}
		}
		render() { h(this)`child`; }
	}
	customElements.define('w-60-child', W60Child);

	let log = [];
	class W60 extends HTMLElement {
		mode = 'a';
		render() {
			if (this.mode === 'a')
				h(this)`<w-60 class=${'a'} onclick=${() => log.push('a')}><w-60-child owner=${this}></w-60-child><em>${'after'}</em></w-60>`;
			else
				h(this)`<w-60 title=${this.mode}><p>${this.mode}</p></w-60>`;
		}
	}
	customElements.define('w-60', W60);

	let a = new W60();
	a.render();
	document.body.append(a);
	assert.eq(a.outerHTML, '<w-60 title="b"><p>b</p></w-60>');
	a.click();
	assert.eq(log.length, 0);
	a.render();
	assert.eq(a.outerHTML, '<w-60 title="b"><p>b</p></w-60>');
	a.remove();

	// 2. An h.map() callback that changes the template of the element it is drawing in.
	let el = document.createElement('div');
	let mode = 'list', items = [{id: 1}, {id: 2}, {id: 3}];
	let render = () => mode === 'list'
		? h(el)`${h.map(items, item => {
			if (item.id === 2 && mode === 'list') {
				mode = 'other';
				render();
			}
			return h`<p>${item.id}</p>`;
		})}`
		: h(el)`<h1>${mode}</h1>`;
	render();
	assert.eq(getHtml(el), '<div><h1>other</h1></div>');
	mode = 'list';
	items = [{id: 4}];
	render();
	assert.eq(getHtml(el), '<div><p>4</p></div>');

	// 3. A click handler in one template that shows the other: on a plain element, on a row
	// of a keyed list, and bound with native:.  The event goes on through the elements it
	// started in, as it would with listeners added by hand, and a handler further up the
	// same row still has the element as its `this`.
	document.body.append(el);
	let rows = [{id: 1}, {id: 2}, {id: 3}], picked = null, outer = [];
	let pick = row => {
		picked = row;
		draw();
	};
	let draw = () => picked
		? h(el)`<h1 native:onclick=${() => pick(null)}>${picked.id}</h1><button onclick=${() => pick(null)}>back</button>`
		: h(el)`<ul>${h.map(rows, row => h`<li key=${row.id} onclick=${function() { outer.push(this) }}><a onclick=${[pick, row]}>${row.id}</a></li>`)}</ul>`;
	draw();
	el.querySelectorAll('a')[1].click();
	assert.eq(getHtml(el), '<div><h1>2</h1><button>back</button></div>');
	assert.eq(outer.length, 1);
	assert.eq(outer[0], el);
	el.querySelector('button').click();
	assert.eq(getHtml(el), '<div><ul><li><a>1</a></li><li><a>2</a></li><li><a>3</a></li></ul></div>');
	el.querySelectorAll('a')[2].click();
	assert.eq(getHtml(el), '<div><h1>3</h1><button>back</button></div>');
	el.querySelector('h1').click();
	assert.eq(el.querySelectorAll('li').length, 3);
	el.remove();

	// 4. A child of the old template that renders its parent when it leaves the document,
	// which it does in the middle of the change.  That render is the one that puts the new
	// template in place, with the parent's slot children, and the render it interrupted then
	// finds it there.
	let host = document.createElement('div'), renders = 0;
	class W60Leaving extends HTMLElement {
		disconnectedCallback() {
			renders++;
			show();
		}
	}
	customElements.define('w-60-leaving', W60Leaving);
	host.innerHTML = '<b>kid</b>';
	let leaving = document.createElement('w-60-leaving');
	let show = () => mode === 'first'
		? h(host)`<p>${mode}</p>${leaving}<slot></slot>`
		: h(host)`<section>${mode}<slot></slot></section>`;
	mode = 'first';
	document.body.append(host);
	show();
	assert.eq(getHtml(host), '<div><p>first</p><w-60-leaving></w-60-leaving><slot><b>kid</b></slot></div>');
	mode = 'second';
	show();
	assert.eq(renders, 1);
	assert.eq(getHtml(host), '<div><section>second<slot><b>kid</b></slot></section></div>');
	show();
	assert.eq(getHtml(host), '<div><section>second<slot><b>kid</b></slot></section></div>');
	host.remove();

	// 5. A child the element was given that renders the element whenever it enters the
	// document, which it does each time a template takes it into a slot.
	let tabs = document.createElement('div'), armed = false, draws = 0;
	class W60Tab extends HTMLElement {
		connectedCallback() {
			if (armed)
				draw2();
		}
	}
	customElements.define('w-60-tab', W60Tab);
	tabs.innerHTML = '<w-60-tab>tab</w-60-tab>';
	let draw2 = () => {
		draws++;
		if (mode === 'first')
			h(tabs)`<p>${mode}</p><slot></slot>`;
		else
			h(tabs)`<nav><slot></slot></nav><b>${mode}</b>`;
	};
	mode = 'first';
	document.body.append(tabs);
	draw2();
	armed = true;
	mode = 'second';
	draw2();
	armed = false;
	assert.eq(getHtml(tabs), '<div><nav><slot><w-60-tab>tab</w-60-tab></slot></nav><b>second</b></div>');
	assert(draws < 8); // A few renders from the callback, and an end to them.
	tabs.remove();
});

Testimony.test('Solarite.switch.embedError', `A template whose data-id or script throws while it is set up leaves the element as it found it, children included.`, () => {
	// 1. A data-id that would overwrite a property of the element, in a first render and in a
	// switch.  The children the element was given were left in a fragment nobody held, and the
	// next render took the half-built template for them.
	let el = toEl('<div><b>kid</b></div>');
	assert.throws(() => h(el)`<i data-id="title">bad</i><slot></slot>`);
	assert.eq(getHtml(el), '<div><b>kid</b></div>');
	h(el)`<p>${1}</p><slot></slot>`;
	assert.eq(getHtml(el), '<div><p>1</p><slot><b>kid</b></slot></div>');
	assert.throws(() => h(el)`<i data-id="title">bad</i><slot></slot>`);
	h(el)`<p>${2}</p><slot></slot>`;
	assert.eq(getHtml(el), '<div><p>2</p><slot><b>kid</b></slot></div>');

	// 2. A script that throws, in an element with no children.
	el = document.createElement('div');
	assert.throws(() => h(el)`<i>bad</i><script>throw new Error('bad')</script>`);
	h(el)`<p>${3}</p>`;
	assert.eq(getHtml(el), '<div><p>3</p></div>');

	// 3. A template wrapped in the component's tag takes back the attributes it copied.
	class W65 extends Solarite {
		bad = false;
		render() {
			if (this.bad)
				h(this)`<w-65 class="bad" title="x"><i data-id="hidden"></i></w-65>`;
			else
				h(this)`<w-65>ok</w-65>`;
		}
	}
	W65.define();
	let a = new W65();
	a.render();
	a.bad = true;
	assert.throws(() => a.render());
	a.bad = false;
	a.render();
	assert.eq(a.outerHTML, '<w-65>ok</w-65>');

	// 4. A child component whose first render, made by its constructor, throws.  The children
	// its parent gave it go back to the parent's template, which hands them over again when it
	// builds the component next time.
	let fail = true;
	class W66 extends Solarite {
		constructor(attribs) {
			super(attribs);
			this.render();
		}
		render() {
			if (fail)
				h(this)`<div data-id="hidden"></div><slot></slot>`;
			else
				h(this)`<i>ok</i><slot></slot>`;
		}
	}
	W66.define();
	let host = document.createElement('div');
	let draw = () => h(host)`<w-66><b>given</b></w-66>`;
	assert.throws(draw);
	fail = false;
	draw();
	assert.eq(getHtml(host), '<div><w-66><i>ok</i><slot><b>given</b></slot></w-66></div>');
});

Testimony.test('Solarite.switch.afterError', `A new template that throws leaves an element the next render can fill.`, () => {
	// 1. Html that cannot be parsed.  The old template is gone by then; the children the
	// element was given are not, and either template renders afterward.
	let el = toEl('<div><b>kid</b></div>');
	let first = v => h(el)`<p>${v}</p><slot></slot>`;
	let bad = v => h(el)`<p class="a" class=${v}>bad</p>`;
	let second = v => h(el)`<section><slot></slot>${v}</section>`;
	first(1);
	assert.throws(() => bad(2));
	assert.eq(getHtml(el), '<div><b>kid</b></div>');
	first(3);
	assert.eq(getHtml(el), '<div><p>3</p><slot><b>kid</b></slot></div>');
	assert.throws(() => bad(2));
	second(4);
	assert.eq(getHtml(el), '<div><section><slot><b>kid</b></slot>4</section></div>');

	// 2. An expression of the new template that throws when it is applied.  The same template
	// with a good value then renders, and so does the first one.
	el = document.createElement('div');
	document.body.append(el);
	let clicked = 0;
	let plain = v => h(el)`<p>${v}</p>`;
	let button = (v, handler) => h(el)`<button onclick=${() => clicked++}>${v}</button><input onfocus=${handler}>`;
	plain(1);
	assert.throws(() => button(2, 'not a function'));
	button(3, () => {});
	assert.eq(getHtml(el), '<div><button>3</button><input></div>');
	el.querySelector('button').click();
	assert.eq(clicked, 1);
	plain(4);
	assert.eq(getHtml(el), '<div><p>4</p></div>');

	// 3. The handlers of the new template are bound by the render that follows the one that
	// threw, also when they are the same functions as in that render.
	let onClick = () => clicked++;
	let stable = handler => h(el)`<button onclick=${onClick}>x</button><input onfocus=${handler}>`;
	assert.throws(() => stable('not a function'));
	stable(() => {});
	clicked = 0;
	el.querySelector('button').click();
	assert.eq(clicked, 1);
	el.remove();
});
//endregion



//region expr
/*┌─────────────────╮
  | Expr            |
  └─────────────────╯*/
Testimony.test('Solarite.expr.staticString', () => {
	class R40 extends HTMLElement {
		render() {
			h(this)`Solarite ${'Test'} Component`
		}
	}
	customElements.define('r-40', R40);

	let a = new R40();
	a.render();
	document.body.append(a);

	assert.eq(getHtml(a), '<r-40>Solarite Test Component</r-40>');

	a.remove();
});

Testimony.test('Solarite.expr.htmlString', () => {

	class A extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`This text is ${h(`<b>Bold</b>`)}!`
		}
	}
	A.define('r-41');

	let a = new A();
	assert.eq(getHtml(a), '<r-41>This text is <b>Bold</b>!</r-41>');
});

Testimony.test('Solarite.expr.htmlEncodedString', () => {

	class A extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`This text is not ${`<b>Bold</b>`}!`
		}
	}
	A.define('r-42');

	let a = new A();
	assert.eq(getHtml(a), '<r-42>This text is not &lt;b&gt;Bold&lt;/b&gt;!</r-42>');
});

Testimony.test('Solarite.expr.table', () => {
	class R43 extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`<table><tr>${h(`<td>Table Cell</td>`)}</tr></table>`
		}
	}
	let a = new R43();

	assert.eq(getHtml(a), `<r-43><table><tbody><tr><td>Table Cell</td></tr></tbody></table></r-43>`)
});

Testimony.test('Solarite.expr.documentFragment', () => {

	class R44 extends Solarite {
		render() {
			h(this)`This text is ${h(`<b>Bold</b><i>Italic</i>`)}!`
		}
	}

	let a = new R44(); // auto render on construct.

	a.render();
	assert.eq(getHtml(a), '<r-44>This text is <b>Bold</b><i>Italic</i>!</r-44>');


	a.render();
	assert.eq(getHtml(a), '<r-44>This text is <b>Bold</b><i>Italic</i>!</r-44>');
});

Testimony.test('Solarite.expr.documentFragmentGivenAgain', `A DocumentFragment keeps showing the nodes it brought when the same fragment is given again on a later render.`, () => {
	// Placing a fragment's children moves them out of the fragment, so the second render used
	// to be given an empty fragment and removed everything the first had shown.
	const clean = el => el.firstElementChild.innerHTML.replace(/<!--.*?-->/g, '');
	const element = (tag, text) => Object.assign(document.createElement(tag), {textContent: text});

	// 1. The same fragment on every render, as a component that keeps its content in a field
	// gives it: toEl() returns a fragment for html of several nodes.
	let el = document.createElement('div');
	let content = toEl('<b>Hi</b><u>Bye</u>');
	for (let n of [1, 2, 3]) {
		h(el)`<div>${n}: ${content}</div>`;
		assert.eq(clean(el), n + ': <b>Hi</b><u>Bye</u>');
	}

	// 2. Dropped and shown again, moved to an expression in another element, among other
	// items, from a function.
	el = document.createElement('div');
	let fragment = document.createDocumentFragment();
	fragment.append(element('i', 'a'), 'T', element('b', 'b'));
	let steps = [
		[fragment, 'x', '<p><i>a</i>T<b>b</b></p><s>x</s>'], [fragment, 'y', '<p><i>a</i>T<b>b</b></p><s>y</s>'], [null, fragment, '<p></p><s><i>a</i>T<b>b</b></s>'],
		[null, null, '<p></p><s></s>'], [['[', fragment, ']'], null, '<p>[<i>a</i>T<b>b</b>]</p><s></s>'], [() => fragment, 'z', '<p><i>a</i>T<b>b</b></p><s>z</s>']
	];
	for (let [a, b, expected] of steps) {
		h(el)`<div><p>${a}</p><s>${b}</s></div>`;
		assert.eq(clean(el), expected);
	}

	// 3. A fragment given with new children shows those, and no longer the ones before.
	el = document.createElement('div');
	fragment = document.createDocumentFragment();
	fragment.append(element('i', 'a'));
	let render = () => h(el)`<div><s>h</s>${fragment}<s>t</s></div>`;
	render();
	fragment.append(element('b', 'b'));
	for (let i=0; i<2; i++) {
		render();
		assert.eq(clean(el), '<s>h</s><b>b</b><s>t</s>');
	}

	// 4. As the rows of a list, in any order.
	el = document.createElement('div');
	let items = ['a', 'b', 'c'].map(text => {
		let rowNodes = document.createDocumentFragment();
		rowNodes.append(element('i', text), element('b', text));
		return {rowNodes};
	});
	for (let [order, expected] of [[[0, 1, 2], 'aabbcc'], [[0, 1, 2], 'aabbcc'], [[2, 0], 'ccaa'], [[0, 1, 2], 'aabbcc']]) {
		h(el)`<div>${h.map(order.map(i => items[i]), item => item.rowNodes)}</div>`;
		assert.eq(el.textContent, expected);
	}

	// 5. A fragment whose first render threw before anything was placed still has its
	// children, and shows them from the next render on.
	el = document.createElement('div');
	fragment = document.createDocumentFragment();
	fragment.append(element('i', 'a'));
	let threw = false;
	try {
		h(el)`<div>${[fragment, h`<p onclick=${'not a function'}>bad</p>`]}</div>`;
	}
	catch (e) {
		threw = true;
	}
	assert.eq(threw, true);
	for (let i=0; i<2; i++) {
		h(el)`<div>${[fragment]}</div>`;
		assert.eq(clean(el), '<i>a</i>');
	}

	// 6. A fragment that never had children shows nothing, and a new fragment per render
	// shows its own nodes each time.
	el = document.createElement('div');
	for (let text of ['a', 'b']) {
		fragment = document.createDocumentFragment();
		fragment.append(element('i', text));
		h(el)`<div>${[document.createDocumentFragment(), fragment]}</div>`;
		assert.eq(clean(el), '<i>' + text + '</i>');
	}
});

Testimony.test('Solarite.expr.documentFragmentMovesPlaces', `A DocumentFragment given to another expression of the same parent element, or to two at once, shows its nodes in the place written last.`, () => {
	let el = document.createElement('div');
	let fragment = document.createDocumentFragment();
	fragment.append(Object.assign(document.createElement('i'), {textContent: 'a'}), 'T');
	for (let [a, b, expected] of [[fragment, 'x', '<i>a</i>T|x'], ['x', fragment, 'x|<i>a</i>T'], [fragment, 'x', '<i>a</i>T|x'], [fragment, fragment, '<i>a</i>T|'], ['x', fragment, 'x|<i>a</i>T']]) {
		h(el)`<div>${a}|${b}</div>`;
		assert.eq(el.firstElementChild.innerHTML.replace(/<!--.*?-->/g, ''), expected);
	}
});

Testimony.test('Solarite.expr.undefined', () => {
	class A extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`${this.valueless}` // Make sure it renders undefined as ''
		}
	}
	customElements.define('r-80', A);

	let a = new A();
	assert.eq(getHtml(a), '<r-80></r-80>');
});

Testimony.test('Solarite.expr.staticNumber', () => {
	class A extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`Solarite ${123} Component`
		}
	}
	customElements.define('r-46', A);

	let a = new A();
	assert.eq(getHtml(a), '<r-46>Solarite 123 Component</r-46>');
});

Testimony.test('Solarite.expr.staticDate', () => {
	class A extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`${new Date('2010-02-01 00:00:00').getUTCFullYear()}`
		}
	}
	customElements.define('r-50', A);

	let a = new A();
	assert.eq(getHtml(a), '<r-50>2010</r-50>');
});

Testimony.test('Solarite.expr.staticArray', () => {
	class A extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`Items: ${[1, 2, 3]}`
		}
	}
	customElements.define('r-52', A);

	let a = new A();
	assert.eq(getHtml(a), '<r-52>Items: 123</r-52>');
});

Testimony.test('Solarite.expr.array', () => {
	class A extends Solarite {
		fruits = ['Apple', 'Banana'];

		render() {
			h(this)`${this.fruits}`
		}
	}
	customElements.define('r-60', A);
	let a = new A();

	document.body.append(a);
	assert.eq(getHtml(a), '<r-60>AppleBanana</r-60>');

	a.fruits.push('Cherry');
	a.render();
	assert.eq(getHtml(a), '<r-60>AppleBananaCherry</r-60>');

	a.fruits.pop();
	a.render();
	assert.eq(getHtml(a), '<r-60>AppleBanana</r-60>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-60>Banana</r-60>');

	a.remove();
});

Testimony.test('Solarite.expr.arrayReverse', () => {
	class A extends Solarite {
		fruits = ['Apple', 'Banana', 'Cherry', 'Dragonfruit'];

		render() {
			h(this)`${this.fruits}`
		}
	}
	customElements.define('r-62', A);
	let a = new A();

	a.render();
	assert.eq(getHtml(a), '<r-62>AppleBananaCherryDragonfruit</r-62>');

	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), '<r-62>DragonfruitCherryBananaApple</r-62>');

	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), '<r-62>AppleBananaCherryDragonfruit</r-62>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-62>BananaCherryDragonfruit</r-62>');

	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), '<r-62>DragonfruitCherryBanana</r-62>');
});

Testimony.test('Solarite.expr.twoArrays', () => {
	class A extends Solarite {
		fruits = ['Apple'];
		pets = ['Cat'];

		render() {
			h(this)`${this.fruits}${this.pets}`
		}
	}
	customElements.define('r-65', A);
	let a = new A();

	a.render();
	assert.eq(getHtml(a), '<r-65>AppleCat</r-65>');

	a.fruits.push('Banana');
	a.render();
	assert.eq(getHtml(a), '<r-65>AppleBananaCat</r-65>');

	a.pets.push('Dog');
	a.render();
	assert.eq(getHtml(a), '<r-65>AppleBananaCatDog</r-65>');

	a.pets.reverse();
	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), '<r-65>BananaAppleDogCat</r-65>');

	a.pets.reverse();
	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), '<r-65>AppleBananaCatDog</r-65>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-65>BananaCatDog</r-65>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-65>CatDog</r-65>');

	a.pets.shift();
	a.render();
	assert.eq(getHtml(a), '<r-65>Dog</r-65>');

	a.pets.shift();
	a.render();
	assert.eq(getHtml(a), '<r-65></r-65>');

	a.fruits.push('Apple');
	a.render();
	assert.eq(getHtml(a), '<r-65>Apple</r-65>');

	a.pets.push('Cat');
	a.render();
	assert.eq(getHtml(a), '<r-65>AppleCat</r-65>');
});

Testimony.test('Solarite.expr.staticFunction', () => {
	class A extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`Items: ${() => [1, 2, 3]}`
		}
	}
	customElements.define('r-70', A);

	let a = new A();
	assert.eq(getHtml(a), '<r-70>Items: 123</r-70>');
});

Testimony.test('Solarite.expr.staticElement', () => {
	class A extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`Field: ${document.createElement('input')}`
		}
	}
	customElements.define('r-74', A);

	let a = new A();
	assert.eq(getHtml(a), '<r-74>Field: <input></r-74>');
});

Testimony.test('Solarite.expr.varText', () => {
	class A extends Solarite {
		value = 'Apple';

		render() { h(this)`The fruit is ${this.value}!` }
	}
	customElements.define('r-90', A);

	let a = new A();
	a.render();

	assert.eq(getHtml(a), '<r-90>The fruit is Apple!</r-90>');
	assert.eq(a.childNodes.length, 3);

	a.value = 'Banana';
	a.render();
	assert.eq(getHtml(a), '<r-90>The fruit is Banana!</r-90>');
	assert.eq(a.childNodes.length, 3);

	a.value = 'Cherry';
	a.render();
	assert.eq(getHtml(a), '<r-90>The fruit is Cherry!</r-90>');
	assert.eq(a.childNodes.length, 3);
});

Testimony.test('Solarite.expr.translatedTextKept', `Text alone in its element that a page translator replaced keeps its translation while its value is unchanged, whether it is given as a string, a function, a one-item array, a boolean, a Date or an h.map() list of one string, and shows the new value once it changes.  A function is called once per render.  Raw DOM nodes beside a piece of text stay where they are, so they are not taken out and put back on every render.`, () => {
	let el = document.createElement('div');
	let name = 'Alice', on = true, day = new Date(2020, 0, 1), calls = 0;
	let render = () => h(el)`<p><b>${name}</b><i>${() => { calls++; return name; }}</i><u>${[name]}</u><s>${on}</s><q>${day}</q><em>${h.map([1], () => name)}</em></p>`;
	render();
	translatePage(el);
	let cells = [...el.firstElementChild.children];
	let shown = () => cells.map(cell => cell.textContent).join('|');
	let changes = new MutationObserver(() => {});
	for (let cell of cells)
		changes.observe(cell, {childList: true});

	// 1. Nothing changes.
	calls = 0;
	render();
	assert.eq(changes.takeRecords().length, 0);
	assert.eq(shown(), 'T:Alice|T:Alice|T:Alice|T:true|T:' + day + '|T:Alice');
	assert.eq(calls, 1);

	// 2. Everything but the date changes.
	name = 'Bob';
	on = false;
	calls = 0;
	render();
	assert.eq(shown(), 'Bob|Bob|Bob||T:' + day + '|Bob');
	assert.eq(calls, 1);
	translatePage(el);
	day = new Date(2021, 0, 1);
	render();
	assert.eq(shown(), 'T:Bob|T:Bob|T:Bob||' + day + '|T:Bob');
	changes.disconnect();

	// 3. Raw nodes beside a piece of text: an input, and an element that counts how often it is
	// taken out of the document.
	let tag = uniqueTag(), removed = 0;
	customElements.define(tag, class extends HTMLElement {
		disconnectedCallback() {
			removed++;
		}
	});
	let input = document.createElement('input'), widget = document.createElement(tag), n = 0;
	let holder = document.createElement('div');
	document.body.append(holder);
	let renderNodes = () => h(holder)`<label>${[input, ' Remember me']}</label><span>${[widget, 'Hint']}</span><s>${n}</s>`;
	renderNodes();
	translatePage(holder);
	let label = holder.querySelector('label');
	changes.observe(label, {childList: true});
	for (n = 1; n < 4; n++)
		renderNodes();
	assert.eq(changes.takeRecords().length, 0);
	assert.eq(removed, 0);
	assert.eq(label.firstChild, input);
	assert.eq(holder.querySelector('s').textContent, '3');
	changes.disconnect();
	holder.remove();
});

Testimony.test('Solarite.expr.cyclicRef', () => {


	class R100 extends Solarite {
		value = { name: 'Apple', self: null };

		render() {
			h(this)`The fruit is ${this.value.name}!`
		}
	}

	let a = new R100();
	a.value.self = a; // cyclic reference.
	a.render();

	assert.eq(getHtml(a), '<r-100>The fruit is Apple!</r-100>');

	a.value.name = 'Banana';
	a.render();
	assert.eq(getHtml(a), '<r-100>The fruit is Banana!</r-100>');

	a.value.name = 'Cherry';
	a.render();
	assert.eq(getHtml(a), '<r-100>The fruit is Cherry!</r-100>');
});

Testimony.test('Solarite.expr.textareaChild', 'Make sure we throw if an expression is the child of a textarea.', () => {

	class R110 extends HTMLElement {
		text = 1

		render() {
			h(this)`<textarea>${this.text}</textarea>`
		}
	}
	customElements.define('r-110', R110);


	let a = new R110();

	let error;
	try {
		a.render()
	}
	catch (e) {
		error = e;
	}
	assert(error);
	assert(error.message.includes(`no \${...} inside textarea`));
});

Testimony.test('Solarite.expr.textareaGrandchild', 'Make sure we throw if an expression is the child of a textarea.', () => {

	class R120 extends HTMLElement {
		text = 1

		render() {
			h(this)`<textarea><div>${this.text}</div></textarea>`
		}
	}
	customElements.define('r-120', R120);


	let a = new R120();

	let error;
	try {
		a.render()
	}
	catch (e) {
		error = e;
	}
	assert(error);
	assert(error.message.includes(`no \${...} inside textarea`));
});

Testimony.test('Solarite.expr.textareaHtmlLikeText', `A textarea's text is not html: what looks like a tag, a quote or a comment in it changes nothing for the expressions after the textarea, and an expression inside it gets the error that says what to do.`, () => {
	let el = document.createElement('div');
	let render = value => h(el)`<textarea>a<b c="d <!-- e's</textarea><p title="${value}">${value}</p>`;
	render(1);
	assert.eq(el.firstChild.value, `a<b c="d <!-- e's`);
	assert.eq(el.lastChild.outerHTML, '<p title="1">1</p>');
	render(2);
	assert.eq(el.lastChild.outerHTML, '<p title="2">2</p>');

	let error;
	try {
		toEl(h`<div><textarea>a<b ${1}</textarea></div>`);
	}
	catch (e) {
		error = e;
	}
	assert(error.message.includes(`no \${...} inside textarea`));
});

Testimony.test('Solarite.expr.badEscape', `An escape sequence that JavaScript rejects in a template, such as the "\\2014" of a css content value, leaves that part of the template undefined.  The template throws and says why, and does not render without that part.`, () => {
	let error;
	try {
		toEl(h`<div><style>p::before { content: "\2014" } p { color: ${'red'} }</style><p>${1}</p></div>`);
	}
	catch (e) {
		error = e;
	}
	assert(error.message.includes('bad escape sequence'));

	// The message shows the part of the template that holds the bad escape, as it was written.
	assert(error.message.includes('content: "\\2014"'), error.message);

	// With no expression in the template.
	error = null;
	try {
		toEl(h`<p title="\00a0">a</p>`);
	}
	catch (e) {
		error = e;
	}
	assert(error.message.includes('bad escape sequence'));
});

Testimony.test('Solarite.expr.contenteditableChild', 'Make sure we throw if an expression is the child of a contenteditable.', () => {

	class R140 extends HTMLElement {
		text = 1

		render() {
			h(this)`<div contenteditable style="width: 10px; height: 10px; background: red">${this.text}</div>`
		}
	}
	customElements.define('r-140', R140);


	let a = new R140();
	document.body.append(a)

	let error;
	try {
		a.render()
	}
	catch (e) {
		error = e;
	}
	assert(error);
	assert(error.message.includes(`no \${...} inside contenteditable`));
});

Testimony.test('Solarite.expr.contenteditableGrandchild', 'Make sure we throw if an expression is the child of a contenteditable.', () => {

	class R150 extends HTMLElement {
		text = 1

		render() {
			h(this)`<div contenteditable style="width: 10px; height: 10px; background: red">${this.text}</div>`
		}
	}
	customElements.define('r-150', R150);


	let a = new R150();
	document.body.append(a)

	let error;
	try {
		a.render()
	}
	catch (e) {
		error = e;
	}
	assert(error);
	assert(error.message.includes(`no \${...} inside contenteditable`));
});

Testimony.test('Solarite.expr.contenteditableValueEmpties', 'Empty values clear a contenteditable and the same element can be filled again.', () => {

	class R151 extends HTMLElement {
		text = 'abc'

		render() {
			h(this)`<div contenteditable value=${this.text}></div>`
		}
	}
	customElements.define('r-151', R151);

	let a = new R151();
	document.body.append(a);
	try {
		a.render();
		let div = a.querySelector('div');
		assert.eq(div.innerHTML, 'abc');

		for (let empty of ['', null, undefined, false, () => '', () => null, () => undefined, () => false]) {
			a.text = '<b>abc</b>';
			a.render();
			assert.eq(div.innerHTML, '<b>abc</b>');

			a.text = empty;
			a.render();
			assert.eq(a.querySelector('div'), div);
			assert.eq(div.innerHTML, '');
			assert.eq(div.getAttribute('value'), null);
		}

		a.text = 0;
		a.render();
		assert.eq(div.innerHTML, '0');

		a.text = 'de';
		a.render();
		assert.eq(a.querySelector('div'), div);
		assert.eq(div.innerHTML, 'de');
	}
	finally {
		a.remove();
	}
});
//endregion




/*┌─────────────────╮
  | SVG             |
  └─────────────────╯*/
//region SVG
const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

Testimony.test('svg.template', 'svg`` produces a Template flagged svgMode', async () => {
	let t = svg`<circle r="1"/>`;
	assert(t instanceof Template);
	assert.eq(t.svgMode, true);
	assert.eq((h`<circle r="1"/>`).svgMode, false);
});

Testimony.test('svg.nested', 'Nested svg`` fragment keeps the SVG namespace', async () => {

	let el = toEl(h`<svg viewBox="0 0 10 10">${svg`<rect width="10" height="10"/>`}<polyline points="0,0 10,10"/></svg>`);
	assert.eq(el.namespaceURI, SVG_NS);
	assert.eq(el.querySelector('rect').namespaceURI, SVG_NS);
	assert.eq(el.querySelector('polyline').namespaceURI, SVG_NS);
});

Testimony.test('svg.array', 'Array of svg`` fragments are all SVG-namespaced', async () => {

	let el = toEl(h`<svg viewBox="0 0 10 10">${[1, 2, 3].map(r => svg`<circle r="${r}"/>`)}</svg>`);
	let circles = el.querySelectorAll('circle');
	assert.eq(circles.length, 3);
	for (let i = 0; i < 3; i++) {
		assert.eq(circles[i].namespaceURI, SVG_NS);
		assert.eq(circles[i].getAttribute('r'), String(i + 1));
	}
});

Testimony.test('svg.text', 'Text interpolation inside <text> works', async () => {

	let el = toEl(h`<svg viewBox="0 0 10 10">${svg`<text x="1" y="9">${'Label ' + 42}</text>`}</svg>`);
	let text = el.querySelector('text');
	assert.eq(text.namespaceURI, SVG_NS);
	assert.eq(text.textContent, 'Label 42');
});

Testimony.test('svg.cacheReuse', 'Same svg`` call site reused in a loop; h and svg of identical strings do not collide', async () => {

	// Same call site in a loop shares one strings array → one cached SVG shell.
	let templates = [1, 2].map(() => svg`<rect width="2" height="2"/>`);
	assert(templates[0].html === templates[1].html); // same strings array identity
	assert(Shell.get(templates[0].html, true) === Shell.get(templates[1].html, true));

	// Same strings array fetched in html mode gets a different shell.
	assert(Shell.get(templates[0].html, false) !== Shell.get(templates[0].html, true));

	let el = toEl(h`<svg viewBox="0 0 4 4">${templates}</svg>`);
	let rects = el.querySelectorAll('rect');
	assert.eq(rects.length, 2);
	assert.eq(rects[0].namespaceURI, SVG_NS);
	assert.eq(rects[1].namespaceURI, SVG_NS);
});

Testimony.test('svg.plainHUnchanged', 'A plain h`` fragment inside an svg stays HTML-namespaced', async () => {
	let el = toEl(h`<svg viewBox="0 0 10 10">${h`<rect width="10" height="10"/>`}</svg>`);
	assert.eq(el.querySelector('rect').namespaceURI, HTML_NS); // unchanged (broken) behavior without the svg tag
});

Testimony.test('svg.embeds', 'svg`` fragments support data-id and event bindings', () => {

	let clicks = 0;
	class SvgR1 extends HTMLElement {
		marker;
		render() {
			h(this)`<svg-r1><svg viewBox="0 0 20 20" width="60" height="60">${
				svg`<circle data-id="marker" cx="10" cy="10" r="8" fill="teal" onclick=${() => clicks++} />`
			}</svg></svg-r1>`;
		}
	}
	customElements.define('svg-r1', SvgR1);

	let el = new SvgR1();
	document.body.append(el);
	el.render();

	assert(el.marker instanceof Element, 'data-id resolved');
	assert.eq(el.marker.namespaceURI, 'http://www.w3.org/2000/svg');
	el.marker.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(clicks, 1);

	el.remove();
});

Testimony.test('svg.chart', 'A composed chart from nested fragments paints', () => {

	let points = [{x: 0, y: 40}, {x: 25, y: 10}, {x: 50, y: 30}, {x: 75, y: 5}, {x: 100, y: 25}];
	let grid = svg`<line x1="0" y1="25" x2="100" y2="25" stroke="#ccc" stroke-width="0.5"/>
		<line x1="50" y1="0" x2="50" y2="50" stroke="#ccc" stroke-width="0.5"/>
		<text x="2" y="48" font-size="6" fill="#888">composed</text>`;

	let el = toEl(h`<svg viewBox="0 0 100 50" width="300" height="150" style="border:1px solid #999">
		${grid}
		<polyline points="${points.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="steelblue"/>
		${points.map(p => svg`<circle cx="${p.x}" cy="${p.y}" r="2" fill="tomato"/>`)}
	</svg>`);
	document.body.append(el);

	assert.eq(el.querySelectorAll('line').length, 2);
	assert.eq(el.querySelectorAll('circle').length, 5);

	// SVG-namespaced elements inside a sized svg report a bounding box; HTML-namespaced ones don't paint.
	let circle = el.querySelector('circle');
	assert(circle.getBoundingClientRect().width > 0, 'circle paints');
	let line = el.querySelector('line');
	assert(line.getBoundingClientRect().width > 0, 'grid line paints');

	el.remove();
});
//endregion


//region loop
/*┌─────────────────╮
  | Loop            |
  └─────────────────╯*/
Testimony.test('Solarite.loop.strings', () => {
	class A extends Solarite {
		fruits = ['Apple', 'Banana'];

		render() {
			h(this)`${this.fruits.map(fruit => fruit)}`
		}
	}
	customElements.define('r-200', A);
	let a = new A();
	document.body.append(a);

	a.render();
	assert.eq(getHtml(a), '<r-200>AppleBanana</r-200>');


	let apple = a.childNodes[1];
	a.fruits.push('Cherry');
	a.render();
	assert.eq(getHtml(a), '<r-200>AppleBananaCherry</r-200>');
	assert.eq(a.childNodes[1], apple);

	apple = a.childNodes[1];
	a.fruits.pop();
	a.render();
	assert.eq(getHtml(a), '<r-200>AppleBanana</r-200>');
	assert.eq(a.childNodes[1], apple); // Make sure it wasn't replaced.

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-200>Banana</r-200>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-200></r-200>');

	a.fruits.push('Apple');
	a.render();
	assert.eq(getHtml(a), '<r-200>Apple</r-200>');

	a.remove();
});

Testimony.test('Solarite.map.basic', `h.map reuses a row's DOM while the object is unchanged`, () => {
	class A extends Solarite {
		rows = [{id: 1, label: 'Apple'}, {id: 2, label: 'Banana'}];

		render() {
			h(this)`${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}`
		}
	}
	customElements.define('r-910', A);
	let a = new A();
	document.body.append(a);

	a.render();
	assert.eq(getHtml(a), '<r-910><p>Apple</p><p>Banana</p></r-910>');

	// Same object references keep the same elements.
	let apple = a.children[0], banana = a.children[1];
	a.render();
	assert.eq(a.children[0], apple);
	assert.eq(a.children[1], banana);

	// Replacing a row with a new object (immutable update) re-renders just that row.
	a.rows = [a.rows[0], {...a.rows[1], label: 'Cherry'}];
	a.render();
	assert.eq(getHtml(a), '<r-910><p>Apple</p><p>Cherry</p></r-910>');
	assert.eq(a.children[0], apple); // Unchanged row kept its element.

	a.remove();
});

Testimony.test('Solarite.map.mutationIgnored', `Mutating a row in place does NOT re-render it (immutability contract)`, () => {
	class A extends Solarite {
		rows = [{id: 1, label: 'Apple'}];

		render() {
			h(this)`${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}`
		}
	}
	customElements.define('r-911', A);
	let a = new A();
	document.body.append(a);

	a.render();
	// Mutate in place: same reference, so h.map keeps the cached Template and the row is NOT updated.
	a.rows[0].label = 'Apricot';
	a.render();
	assert.eq(getHtml(a), '<r-911><p>Apple</p></r-911>'); // Stale, as documented.

	// Replacing the object DOES update it.
	a.rows = [{...a.rows[0]}];
	a.render();
	assert.eq(getHtml(a), '<r-911><p>Apricot</p></r-911>');
	a.remove();
});

Testimony.test('Solarite.map.reorder', `Reordering the same objects moves their DOM without rebuilding`, () => {
	class A extends Solarite {
		rows = [{id: 1, label: 'Apple'}, {id: 2, label: 'Banana'}, {id: 3, label: 'Cherry'}];

		render() {
			h(this)`${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}`
		}
	}
	customElements.define('r-912', A);
	let a = new A();
	document.body.append(a);

	a.render();
	let cherry = a.children[2];

	// Swap first and last: same object references, just reordered.
	let temp = a.rows[0];
	a.rows[0] = a.rows[2];
	a.rows[2] = temp;
	a.render();
	assert.eq(getHtml(a), '<r-912><p>Cherry</p><p>Banana</p><p>Apple</p></r-912>');
	assert.eq(a.children[0], cherry); // Moved, not rebuilt.

	a.rows.splice(1, 1);
	a.render();
	assert.eq(getHtml(a), '<r-912><p>Cherry</p><p>Apple</p></r-912>');
	a.remove();
});

Testimony.test('Solarite.map.immutableMapAlias', `h.immutableMap is the same function as h.map`, () => {
	assert.eq(h.immutableMap, h.map);

	class A extends Solarite {
		rows = [{id: 1, label: 'Apple'}];
		render() {
			h(this)`${h.immutableMap(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}`
		}
	}
	customElements.define('r-913', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), '<r-913><p>Apple</p></r-913>');
	a.remove();
});

Testimony.test('Solarite.map.nested', `An h.map() nested in an array still renders`, () => {
	class A extends Solarite {
		rows = [{id: 1, label: 'Apple'}, {id: 2, label: 'Banana'}];

		render() {
			h(this)`${['<b>', h`<i>x</i>`, h.map(this.rows, row => h`<p>${row.label}</p>`), 'end']}`
		}
	}
	customElements.define('r-914', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), '<r-914>&lt;b&gt;<i>x</i><p>Apple</p><p>Banana</p>end</r-914>');

	// A second render reuses the cached Templates and leaves the DOM alone.
	let apple = a.querySelector('p');
	a.render();
	assert.eq(getHtml(a), '<r-914>&lt;b&gt;<i>x</i><p>Apple</p><p>Banana</p>end</r-914>');
	assert.eq(a.querySelector('p'), apple);
	a.remove();
});

Testimony.test('Solarite.map.strings', `An h.map() callback can return plain strings`, () => {
	class A extends Solarite {
		rows = [{id: 1, label: 'Apple'}, {id: 2, label: 'Banana'}];

		render() {
			h(this)`<div>${h.map(this.rows, row => row.label)}</div>`
		}
	}
	customElements.define('r-915', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), '<r-915><div>AppleBanana</div></r-915>');

	a.rows = [a.rows[0], {...a.rows[1], label: 'Cherry'}];
	a.render();
	assert.eq(getHtml(a), '<r-915><div>AppleCherry</div></r-915>');
	a.remove();
});

Testimony.test('Solarite.map.nonObjects', `A row is reused while its item is === to the one it was built from`, () => {
	let calls = 0;
	class A extends Solarite {
		rows = ['Apple', 'Banana'];

		render() {
			h(this)`${h.map(this.rows, row => { calls++; return h`<p>${row}</p>` })}`
		}
	}
	customElements.define('r-916', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), '<r-916><p>Apple</p><p>Banana</p></r-916>');

	// Strings compare equal by value, so an unchanged one keeps its row.
	calls = 0;
	a.render();
	assert.eq(calls, 0);
	assert.eq(getHtml(a), '<r-916><p>Apple</p><p>Banana</p></r-916>');

	// A different string is a different item, so its row rebuilds.
	a.rows = ['Apple', 'Cherry'];
	a.render();
	assert.eq(calls, 1);
	assert.eq(getHtml(a), '<r-916><p>Apple</p><p>Cherry</p></r-916>');
	a.remove();
});

Testimony.test('Solarite.map.shift', `Removing a row from the middle reuses every other row's Template`, () => {
	let calls = 0;
	class A extends Solarite {
		rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}, {id: 3, label: 'c'}, {id: 4, label: 'd'}];

		render() {
			h(this)`${h.map(this.rows, row => { calls++; return h`<p key=${row.id}>${row.label}</p>` })}`
		}
	}
	customElements.define('r-917', A);
	let a = new A();
	document.body.append(a);
	a.render();
	let [p1, p2, p3, p4] = [...a.children];

	// Every later row shifts one position, so none of them match positionally; the
	// per-item cache still supplies their Templates and their elements survive.
	calls = 0;
	a.rows.splice(1, 1);
	a.render();
	assert.eq(getHtml(a), '<r-917><p>a</p><p>c</p><p>d</p></r-917>');
	assert.eq(calls, 0);
	assert.eq(a.children[0], p1);
	assert.eq(a.children[1], p3);
	assert.eq(a.children[2], p4);

	// And a later render still recognizes the shifted rows by identity.
	calls = 0;
	a.render();
	assert.eq(calls, 0);
	assert.eq(a.children[1], p3);
	a.remove();
});

Testimony.test('Solarite.map.removeRun', `Removing a run of rows keeps every other row and builds nothing`, () => {
	let calls = 0;
	const mk = n => Array.from({length: n}, (_, i) => ({id: i + 1, label: 'L' + (i + 1)}));
	class A extends Solarite {
		rows = mk(8);

		render() {
			h(this)`<div>${h.map(this.rows, row => { calls++; return h`<p key=${row.id}>${row.label}</p>` })}</div>`
		}
	}
	customElements.define('r-remrun-1', A);
	let a = new A();
	document.body.append(a);
	a.render();
	let host = a.firstElementChild;
	let els = [...host.children];
	const text = () => [...host.children].map(el => el.textContent).join(' ');

	// 1. A run from the middle.
	calls = 0;
	a.rows.splice(2, 3);
	a.render();
	assert.eq(text(), 'L1 L2 L6 L7 L8');
	assert.eq(calls, 0);
	assert.eq([...host.children], [els[0], els[1], els[5], els[6], els[7]]);
	assert.eq(els[2].isConnected, false);

	// 2. From the front, then from the back.
	a.rows.shift();
	a.render();
	assert.eq(text(), 'L2 L6 L7 L8');
	a.rows.length = 2;
	a.render();
	assert.eq(text(), 'L2 L6');
	assert.eq(calls, 0);
	assert.eq([...host.children], [els[1], els[5]]);

	// 3. The rows that stayed are still matched to their items afterwards: one is rewritten in
	// place, then they swap, and each keeps its element.
	a.rows[1] = {...a.rows[1], label: 'six'};
	a.render();
	assert.eq(text(), 'L2 six');
	assert.eq(calls, 1);
	a.rows.reverse();
	a.render();
	assert.eq(text(), 'six L2');
	assert.eq([...host.children], [els[5], els[1]]);

	// 4. A removed key that comes back gets a new element, since its old one was discarded.
	a.rows.push({id: 3, label: 'L3'});
	a.render();
	assert.eq(text(), 'six L2 L3');
	assert.neq(host.children[2], els[2]);

	// 5. Two separate removals in one render are not a single run, and still come out right.
	a.rows = mk(6);
	a.render();
	a.rows.splice(4, 1);
	a.rows.splice(1, 1);
	a.render();
	assert.eq(text(), 'L1 L3 L4 L6');
	a.remove();
});

Testimony.test('Solarite.map.removeRunShapes', `A removed run of unkeyed, text or multi-node rows is handled like any other removal`, () => {
	class A extends Solarite {
		rows = [];
		mode = 'unkeyed';

		render() {
			h(this)`<div>${h.map(this.rows, row =>
				this.mode === 'unkeyed' ? h`<p>${row.label}</p>`
				: this.mode === 'text' ? row.label
				: h`<dt key=${row.id}>${row.id}</dt><dd>${row.label}</dd>`)}</div>`
		}
	}
	customElements.define('r-remrun-2', A);
	let a = new A();
	document.body.append(a);
	const mk = () => [{id: 1, label: 'a'}, {id: 2, label: 'b'}, {id: 3, label: 'c'}, {id: 4, label: 'd'}];

	// 1. Unkeyed rows.  The removed row is pooled, so the next row drawn from that template
	// takes its element instead of building a new one, as the positional diff has always done.
	a.rows = mk();
	a.render();
	let host = a.firstElementChild;
	let [p1, p2, p3, p4] = [...host.children];
	a.rows.splice(1, 1);
	a.render();
	assert.eq(getHtml(host), '<div><p>a</p><p>c</p><p>d</p></div>');
	assert.eq([...host.children], [p1, p3, p4]);
	a.rows.push({id: 5, label: 'e'});
	a.render();
	assert.eq(getHtml(host), '<div><p>a</p><p>c</p><p>d</p><p>e</p></div>');
	assert.eq(host.children[3], p2);

	// 2. Rows that are plain strings.
	a.rows = [];
	a.render();
	a.mode = 'text';
	a.rows = mk();
	a.render();
	assert.eq(getHtml(host), '<div>abcd</div>');
	a.rows.splice(1, 2);
	a.render();
	assert.eq(getHtml(host), '<div>ad</div>');

	// 3. Rows made of more than one node.
	a.rows = [];
	a.render();
	a.mode = 'pair';
	a.rows = mk();
	a.render();
	let dt4 = host.children[6];
	a.rows.splice(0, 2);
	a.render();
	assert.eq(getHtml(host), '<div><dt>3</dt><dd>c</dd><dt>4</dt><dd>d</dd></div>');
	assert.eq(host.children[2], dt4);
	a.remove();
});

Testimony.test('Solarite.map.removeRunOfEqualValues', `Removing a run from a list of strings, several of them equal, builds no row: the rows that stay are recognized although equal values stand at other positions.`, () => {
	let calls = 0;
	let el = document.createElement('div');
	let rows = ['p3', 'p4', 'p2', 'p0', 'p4', 'p3', 'p1', 'p0', 'p3', 'p4', 'p2', 'p1'];
	let render = () => h(el)`<div>${h.map(rows, s => { calls++; return h`<p>${s}</p>`; })}</div>`;
	render();
	assert.eq(calls, 12);
	let ps = [...el.querySelectorAll('p')];

	// The walk that follows a shifted list by its items loses its place among equal values and
	// builds five of these rows again.  Comparing the two item arrays from both ends does not.
	calls = 0;
	rows.splice(1, 4);
	render();
	assert.eq(el.textContent, 'p3p3p1p0p3p4p2p1');
	assert.eq(calls, 0);
	assert.eq([...el.querySelectorAll('p')], [ps[0], ...ps.slice(5)]);
});

Testimony.test('Solarite.map.identicalUnkeyedRows', `In a list without keys whose rows all look the same, removing one run of adjacent items removes the elements those items were drawn in, so what was typed into a row stays with its item.  Items removed in two separate places are matched by position instead.`, () => {
	// The second shape binds an event on <i>, an element whose onclick property once counted as a
	// live property and so turned this removal off for every row of the list.
	let noop = () => {};
	let shapes = [() => h`<p><input></p>`, () => h`<p><i onclick=${noop}>x</i><input></p>`];
	for (let shape of shapes) {
		let el = document.createElement('div');
		let rows = [{}, {}, {}];
		let render = () => h(el)`<div>${h.map(rows, shape)}</div>`;
		render();
		let ps = [...el.querySelectorAll('p')];
		ps.forEach((p, i) => p.querySelector('input').value = 'typed ' + (i + 1));

		// 1. One run: the first item goes, and its own element goes with it.
		rows.shift();
		render();
		assert.eq([...el.querySelectorAll('p')], [ps[1], ps[2]]);
		assert.eq([...el.querySelectorAll('input')].map(input => input.value).join(), 'typed 2,typed 3');

		// 2. Two runs in one render: rows that look the same are matched by position, so the
		// last two elements go whichever items were removed.  Rows that hold state need a key.
		rows = [{}, {}, {}, {}, {}];
		render();
		ps = [...el.querySelectorAll('p')];
		rows.splice(3, 1);
		rows.splice(1, 1);
		render();
		assert.eq([...el.querySelectorAll('p')], [ps[0], ps[1], ps[2]]);
	}
});

Testimony.test('Solarite.map.afterNodes', `An h.map() can replace a render that produced raw Nodes`, () => {
	class A extends Solarite {
		useNodes = true;
		rows = [{id: 1, label: 'Apple'}];

		render() {
			h(this)`<div>${this.useNodes ? document.createElement('hr') : h.map(this.rows, row => h`<p>${row.label}</p>`)}</div>`
		}
	}
	customElements.define('r-918', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), '<r-918><div><hr></div></r-918>');

	a.useNodes = false;
	a.render();
	assert.eq(getHtml(a), '<r-918><div><p>Apple</p></div></r-918>');

	a.useNodes = true;
	a.render();
	assert.eq(getHtml(a), '<r-918><div><hr></div></r-918>');
	a.remove();
});

Testimony.test('Solarite.map.growShrink', `An h.map() list can grow from and shrink to empty`, () => {
	class A extends Solarite {
		rows = [];

		render() {
			h(this)`<div>${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define('r-919', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), '<r-919><div></div></r-919>');

	a.rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}];
	a.render();
	assert.eq(getHtml(a), '<r-919><div><p>a</p><p>b</p></div></r-919>');

	a.rows = [];
	a.render();
	assert.eq(getHtml(a), '<r-919><div></div></r-919>');

	a.rows = [{id: 3, label: 'c'}];
	a.render();
	assert.eq(getHtml(a), '<r-919><div><p>c</p></div></r-919>');
	a.remove();
});

Testimony.test('Solarite.map.patchSelect', `Changing one row rewrites only that row`, () => {
	class A extends Solarite {
		rows = [];
		sel = null;
		render() {
			h(this)`<div>${h.map(this.rows, row =>
				h`<p key=${row.id} class=${row.id === this.sel ? 'on' : ''}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define('r-920', A);
	let a = new A();
	a.rows = [];
	for (let i=1; i<=50; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();
	let ps = [...a.querySelectorAll('p')];

	// Select row 10 the way the benchmark does: replace that row's object.
	a.sel = 10;
	a.rows[9] = {...a.rows[9]};
	a.render();
	assert.eq(a.querySelectorAll('p')[9].className, 'on');
	assert.eq(a.querySelectorAll('p')[9], ps[9]); // Same element, rewritten in place.
	assert.eq(a.querySelectorAll('p')[8], ps[8]);
	assert.eq(a.querySelectorAll('p').length, 50);

	// Move the selection: two rows change, everything else is untouched.
	a.sel = 20;
	a.rows[9] = {...a.rows[9]};
	a.rows[19] = {...a.rows[19]};
	a.render();
	assert.eq(a.querySelectorAll('p')[9].className, '');
	assert.eq(a.querySelectorAll('p')[19].className, 'on');
	assert.eq(a.querySelectorAll('p')[19], ps[19]);
	a.remove();
});

Testimony.test('Solarite.map.patchSwap', `Swapping two rows moves their nodes and nothing else`, () => {
	class A extends Solarite {
		rows = [];
		render() {
			h(this)`<div>${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define('r-921', A);
	let a = new A();
	for (let i=1; i<=50; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();
	let ps = [...a.querySelectorAll('p')];

	let temp = a.rows[1];
	a.rows[1] = a.rows[48];
	a.rows[48] = temp;
	a.render();
	let now = [...a.querySelectorAll('p')];
	assert.eq(now.length, 50);
	assert.eq(now[1], ps[48]); // The nodes moved with their keys.
	assert.eq(now[48], ps[1]);
	assert.eq(now[1].textContent, 'r49');
	assert.eq(now[48].textContent, 'r2');
	assert.eq(now[0], ps[0]);

	// And swapping back restores the original order.
	temp = a.rows[1];
	a.rows[1] = a.rows[48];
	a.rows[48] = temp;
	a.render();
	assert.eq(a.querySelectorAll('p')[1], ps[1]);
	assert.eq(a.querySelectorAll('p')[1].textContent, 'r2');
	a.remove();
});

Testimony.test('Solarite.map.patchUpdate', `A partial update rewrites just the changed rows`, () => {
	class A extends Solarite {
		rows = [];
		render() {
			h(this)`<div>${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define('r-922', A);
	let a = new A();
	for (let i=0; i<100; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();
	let ps = [...a.querySelectorAll('p')];

	for (let i=0; i<100; i+=10)
		a.rows[i] = {...a.rows[i], label: a.rows[i].label + '!'};
	a.render();
	let now = [...a.querySelectorAll('p')];
	for (let i=0; i<100; i++) {
		assert.eq(now[i], ps[i]); // Every row kept its element.
		assert.eq(now[i].textContent, 'r' + i + (i % 10 === 0 ? '!' : ''));
	}
	a.remove();
});

Testimony.test('Solarite.map.patchStampedRows', `Rows changed by a partial update keep their element and take every changed value: text, an attribute, a handler, and for JSX rows the key carried on the template.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let hits = [];
	let rows = [{id: 1, a: 'one', c: 'x'}, {id: 2, a: 'two', c: 'y'}, {id: 3, a: 'three', c: 'z'}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id} class=${r.c} onclick=${[item => hits.push(item.a), r]}><i>${r.a}</i></p>`)}</div>`;
	render();
	let ps = [...el.querySelectorAll('p')];

	// 1. Text, attribute and handler all follow the new item; the other rows are untouched.
	rows[1] = {id: 2, a: 'TWO', c: 'yy'};
	render();
	assert.eq([...el.querySelectorAll('p')], ps);
	assert.eq(ps[1].textContent, 'TWO');
	assert.eq(ps[1].className, 'yy');
	assert.eq(ps[0].textContent + ps[2].textContent, 'onethree');
	ps[1].click();
	ps[0].click();
	assert.eq(hits.join(), 'TWO,one');

	// 2. A second change to the same row, removing the attribute.
	rows[1] = {id: 2, a: 'two again', c: ''};
	render();
	assert.eq(el.querySelectorAll('p')[1], ps[1]);
	assert.eq(ps[1].textContent, 'two again');
	assert.eq(ps[1].hasAttribute('class'), false);
	ps[1].click();
	assert.eq(hits.join(), 'TWO,one,two again');
	el.remove();

	// 3. JSX rows carry their key on the Template rather than in an expression.
	let el2 = document.createElement('div');
	document.body.append(el2);
	let items = [{id: 1, t: 'a'}, {id: 2, t: 'b'}];
	let render2 = () => h(el2)`<ul>${h.map(items, i => jsx('li', {children: i.t}, i.id))}</ul>`;
	render2();
	let lis = [...el2.querySelectorAll('li')];
	items[0] = {id: 1, t: 'A'};
	render2();
	assert.eq(el2.querySelector('li'), lis[0]);
	assert.eq(lis[0].textContent, 'A');
	items[0] = {id: 9, t: 'nine'}; // A new key at the same position is a new element.
	render2();
	assert(el2.querySelector('li') !== lis[0]);
	assert.eq(el2.querySelector('li').textContent, 'nine');
	assert.eq(el2.querySelectorAll('li')[1], lis[1]);
	el2.remove();
});

Testimony.test('Solarite.map.patchNewKey', `Replacing a row with a new key builds a new row`, () => {
	class A extends Solarite {
		rows = [];
		render() {
			h(this)`<div>${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define('r-923', A);
	let a = new A();
	for (let i=1; i<=20; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();
	let ps = [...a.querySelectorAll('p')];

	a.rows[5] = {id: 999, label: 'new'};
	a.render();
	let now = [...a.querySelectorAll('p')];
	assert.eq(now.length, 20);
	assert.eq(now[5].textContent, 'new');
	assert(now[5] !== ps[5]); // A new key means a new element.
	assert.eq(now[4], ps[4]);
	assert.eq(now[6], ps[6]);
	assert.eq(ps[5].parentNode, null); // The replaced row's element left the DOM.
	a.remove();
});

Testimony.test('Solarite.map.patchManyMoves', `A big reorder still lands correctly`, () => {
	class A extends Solarite {
		rows = [];
		render() {
			h(this)`<div>${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define('r-924', A);
	let a = new A();
	for (let i=1; i<=40; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();
	let byId = {};
	for (let p of a.querySelectorAll('p'))
		byId[p.textContent] = p;

	a.rows.reverse(); // Every position changes, so this can't use the patch path.
	a.render();
	let now = [...a.querySelectorAll('p')];
	assert.eq(now.length, 40);
	for (let i=0; i<40; i++) {
		assert.eq(now[i].textContent, 'r' + (40 - i));
		assert.eq(now[i], byId['r' + (40 - i)]); // Nodes followed their keys.
	}

	// One more render with a mix of a move and an in-place change.
	let t = a.rows[0];
	a.rows[0] = a.rows[39];
	a.rows[39] = t;
	a.rows[10] = {...a.rows[10], label: 'changed'};
	a.render();
	now = [...a.querySelectorAll('p')];
	assert.eq(now[0].textContent, 'r1');
	assert.eq(now[39].textContent, 'r40');
	assert.eq(now[10].textContent, 'changed');
	a.remove();
});

Testimony.test('Solarite.map.patchComponentRows', `Rows holding components are still visited when nothing changed`, () => {
	let childRenders = 0;

	class Child extends Solarite {
		label = '';

		constructor(attribs) {
			super(attribs);
			Object.assign(this, attribs); // Field initializers have already run at this point.
		}

		render(attribs) {
			if (attribs)
				Object.assign(this, attribs);
			childRenders++;
			h(this)`<b>${this.label}</b>`
		}
	}
	customElements.define('r-925-child', Child);

	class A extends Solarite {
		rows = [];
		suffix = '';
		render() {
			h(this)`<div>${h.map(this.rows, row =>
				h`<p key=${row.id}><r-925-child label=${row.label + this.suffix}></r-925-child></p>`)}</div>`
		}
	}
	customElements.define('r-925', A);
	let a = new A();
	for (let i=1; i<=5; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();
	assert.eq(a.querySelectorAll('b')[0].textContent, 'r1');

	// Only the replaced row picks up the new suffix: h.map caches a row's template by the
	// item's identity, so an unchanged row keeps the template built from the old outer state.
	// Every row's component is still re-rendered, which is what surfaces changes inside it.
	childRenders = 0;
	a.suffix = '!';
	a.rows[0] = {...a.rows[0]};
	a.render();
	assert.eq(a.querySelectorAll('b')[0].textContent, 'r1!');
	assert.eq(a.querySelectorAll('b')[3].textContent, 'r4');
	assert.eq(childRenders, 5); // Including the four rows whose items never changed.
	a.remove();
});

Testimony.test('Solarite.map.spread', `An h.map() can still be spread into an array`, () => {
	class A extends Solarite {
		rows = [{id: 1, label: 'Apple'}, {id: 2, label: 'Banana'}];

		render() {
			h(this)`${[...h.map(this.rows, row => h`<p>${row.label}</p>`), h`<i>end</i>`]}`
		}
	}
	customElements.define('r-928', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), '<r-928><p>Apple</p><p>Banana</p><i>end</i></r-928>');
	a.render();
	assert.eq(getHtml(a), '<r-928><p>Apple</p><p>Banana</p><i>end</i></r-928>');
	a.remove();
});

Testimony.test('Solarite.map.liveProps', `A checkbox a user flipped is restored from the model`, () => {
	class A extends Solarite {
		rows = [{id: 1, on: false}, {id: 2, on: true}, {id: 3, on: false}];

		render() {
			h(this)`<div>${h.map(this.rows, row =>
				h`<p key=${row.id}><input type="checkbox" checked=${row.on}></p>`)}</div>`
		}
	}
	customElements.define('r-930', A);
	let a = new A();
	document.body.append(a);
	a.render();

	let boxes = [...a.querySelectorAll('input')];
	assert.eq(boxes[0].checked, false);
	assert.eq(boxes[1].checked, true);

	// The user clicks one, so the DOM property no longer matches the expression that wrote it.
	// A render with unchanged data must put it back — rows holding live properties are the
	// reason the reconciler still visits rows whose values didn't change.
	boxes[0].checked = true;
	boxes[1].checked = false;
	a.render();
	assert.eq(a.querySelectorAll('input')[0].checked, false);
	assert.eq(a.querySelectorAll('input')[1].checked, true);
	assert.eq(a.querySelectorAll('input')[0], boxes[0]); // Same elements, just corrected.

	// And a real change still lands.
	a.rows[2] = {...a.rows[2], on: true};
	a.render();
	assert.eq(a.querySelectorAll('input')[2].checked, true);
	a.remove();
});

Testimony.test('Solarite.map.svg', `h.map works with svg`+'`` '+`templates`, () => {
	class A extends Solarite {
		dots = [{id: 1, x: 10}, {id: 2, x: 20}, {id: 3, x: 30}];

		render() {
			h(this)`<svg width="100" height="20">${h.map(this.dots, dot =>
				svg`<circle key=${dot.id} cx=${dot.x} cy="10" r="3"></circle>`)}</svg>`
		}
	}
	customElements.define('r-929', A);
	let a = new A();
	document.body.append(a);
	a.render();

	let circles = [...a.querySelectorAll('circle')];
	assert.eq(circles.length, 3);
	assert.eq(circles[1].getAttribute('cx'), '20');
	assert.eq(circles[0].namespaceURI, 'http://www.w3.org/2000/svg');

	// Patch one: same element, new attribute.
	a.dots[1] = {...a.dots[1], x: 55};
	a.render();
	assert.eq(a.querySelectorAll('circle')[1], circles[1]);
	assert.eq(a.querySelectorAll('circle')[1].getAttribute('cx'), '55');

	// Swap two: elements move with their keys.
	let t = a.dots[0];
	a.dots[0] = a.dots[2];
	a.dots[2] = t;
	a.render();
	assert.eq(a.querySelectorAll('circle')[0], circles[2]);
	assert.eq(a.querySelectorAll('circle')[2], circles[0]);
	a.remove();
});

Testimony.test('Solarite.map.fuzz', `Random list edits always produce the right DOM. This is a slow test.`, () => {

	// A deterministic generator, so a failure can be reproduced by re-running the test.
	// Math.imul keeps the multiplication exact: a plain product overflows what a double holds,
	// its low bits come back as zeros, and every draw is then even.  The low bits of this kind
	// of generator also repeat quickly, so the draw is taken from the higher ones.
	let seed = 1234567;
	const rnd = n => {
		seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
		return (seed >>> 8) % n;
	};

	let nextId = 1;
	const mk = () => ({id: nextId++, label: 'L' + nextId, tall: rnd(4) === 0});

	// `tall` rows render from a different template, so rows sometimes change shape as well as
	// content — which the reconciler can't rewrite in place and has to rebuild.
	const run = (keyed, tag) => {
		const cls = keyed
			? class extends Solarite {
				rows = [];
				render() {
					h(this)`<div>${h.map(this.rows, row => row.tall
						? h`<div key=${row.id}><b>${row.label}</b></div>`
						: h`<p key=${row.id}>${row.label}</p>`)}</div>`
				}
			}
			: class extends Solarite {
				rows = [];
				render() {
					h(this)`<div>${h.map(this.rows, row => row.tall
						? h`<div><b>${row.label}</b></div>`
						: h`<p>${row.label}</p>`)}</div>`
				}
			};
		customElements.define(tag, cls);
		let a = new cls();
		document.body.append(a);

		let byKey = new Map();
		const check = op => {
			let host = a.firstElementChild;
			let els = [...host.children];
			assert.eq(els.length, a.rows.length);
			for (let i=0; i<els.length; i++) {
				let row = a.rows[i];
				if (els[i].textContent !== row.label)
					throw new Error(`${tag} after ${op}: position ${i} is "${els[i].textContent}", expected "${row.label}"`);
				if (els[i].tagName !== (row.tall ? 'DIV' : 'P'))
					throw new Error(`${tag} after ${op}: position ${i} is a <${els[i].tagName}>, expected ${row.tall ? 'DIV' : 'P'}`);

				// Keyed lists keep a row's element for as long as its key is in the list — unless
				// the row changed shape, which can only be done by building a new element.
				if (keyed) {
					let prev = byKey.get(row.id);
					if (prev !== undefined && prev.isConnected && prev !== els[i]
						&& prev.tagName === (row.tall ? 'DIV' : 'P'))
						throw new Error(`${tag} after ${op}: key ${row.id} did not keep its element`);
				}
			}
			byKey.clear();
			for (let i=0; i<els.length; i++)
				byKey.set(a.rows[i].id, els[i]);
		};

		for (let step=0; step<250; step++) {
			let rows = a.rows, len = rows.length;
			let op = rnd(10);
			let name = op + '@' + len;
			switch (op) {
				case 0: { // Insert fresh rows somewhere — sometimes more than the reconciler
					// looks ahead for when it tries to recognize an inserted block.
					let at = rnd(len + 1), k = rnd(8) === 0 ? 1 + rnd(120) : 1 + rnd(4);
					for (let i=0; i<k; i++)
						rows.splice(at + i, 0, mk());
					break;
				}
				case 1: { // Remove a few rows.
					if (!len) break;
					let at = rnd(len);
					rows.splice(at, 1 + rnd(3));
					break;
				}
				case 2: { // Move one row.
					if (len < 2) break;
					let from = rnd(len), to = rnd(len);
					rows.splice(to, 0, rows.splice(from, 1)[0]);
					break;
				}
				case 3: { // Swap two rows.
					if (len < 2) break;
					let i = rnd(len), j = rnd(len);
					let t = rows[i];
					rows[i] = rows[j];
					rows[j] = t;
					break;
				}
				case 4: { // Update some rows immutably, the h.map contract.
					if (!len) break;
					// Sometimes change more rows than the reconciler collects before it stops to
					// work out what kind of change it is, so that decision gets exercised.
					let k = rnd(6) === 0 ? len : 1 + rnd(Math.min(len, 20));
					for (let i=0; i<k; i++) {
						let at = rnd(len);
						let flip = rnd(5) === 0; // Sometimes change the row's shape too.
						rows[at] = {...rows[at], label: rows[at].label + '!',
							tall: flip ? !rows[at].tall : rows[at].tall};
					}
					break;
				}
				case 5: rows.reverse(); break;
				case 6: { // Shuffle.
					for (let i=len-1; i>0; i--) {
						let j = rnd(i + 1);
						let t = rows[i];
						rows[i] = rows[j];
						rows[j] = t;
					}
					break;
				}
				case 7: a.rows = []; break;
				case 8: { // Replace the whole list.
					let n = rnd(8) === 0 ? 300 + rnd(400) : rnd(60);
					let next = new Array(n);
					for (let i=0; i<n; i++)
						next[i] = mk();
					a.rows = next;
					break;
				}
				default: { // Grow or shrink to a random length, sometimes past the thresholds
					// the reconciler switches strategy at.
					let n = rnd(8) === 0 ? 300 + rnd(400) : rnd(60);
					while (a.rows.length > n)
						a.rows.pop();
					while (a.rows.length < n)
						a.rows.push(mk());
				}
			}
			a.render();
			check(name);
		}
		a.remove();
	};

	run(true, 'r-926');
	run(false, 'r-927');
});

Testimony.test('Solarite.map.callbackGrowsArray', `A list that grows while it is being drawn still recognizes its rows on the next render`, () => {
	let rows = [{id: 1}, {id: 2}, {id: 3}], calls = 0, grow = true;
	let el = document.createElement('div');
	let render = () => h(el)`<div>${h.map(rows, r => {
		calls++;
		if (grow) {
			grow = false;
			rows.push({id: 4});
		}
		return h`<p key=${r.id}>${r.id}</p>`;
	})}</div>`;
	render();
	assert.eq(el.textContent, '123'); // The length was read before the callback ran.
	let ps = [...el.querySelectorAll('p')];

	calls = 0;
	render();
	assert.eq(el.textContent, '1234');
	assert.eq([...el.querySelectorAll('p')].slice(0, 3).every((p, i) => p === ps[i]), true);
	assert.eq(calls, 1); // Only the row that was never drawn.
});

Testimony.test('Solarite.map.arrayLikeReadByIndex', `An array-like is read by index when it is remembered, as it is when it is drawn`, () => {
	// Indexed like an array, but iterates newest first, as a history or an undo stack might.
	class Stack {
		constructor(items) {
			this.length = items.length;
			for (let i=0; i<items.length; i++)
				this[i] = items[i];
		}
		*[Symbol.iterator]() {
			for (let i=this.length-1; i>=0; i--)
				yield this[i];
		}
	}
	let a = {id: 1}, b = {id: 2}, c = {id: 3};
	let el = document.createElement('div');
	let render = items => h(el)`<div>${h.map(items, r => h`<p key=${r.id}>${r.id}</p>`)}</div>`;
	render(new Stack([a, b, c]));
	assert.eq(el.textContent, '123');
	render(new Stack([c, b, a]));
	assert.eq(el.textContent, '321');
});

// Helpers for the list tests below: a name for a throwaway component, and the text of a
// list's rows.

let uniqueTagCount = 0;

/**
 * A custom element name no other test registers.  The counter keeps names apart within one load
 * of this file, and the random part keeps them apart if the file is ever loaded twice into one
 * page, since a name can be registered only once per page.
 * @return {string} */
const uniqueTag = () => 'unique-el-' + (++uniqueTagCount) + '-' + Math.random().toString(36).slice(2, 7);

/**
 * @param host {HTMLElement}
 * @param selector {string}
 * @return {string} The text of each element under host that matches selector, joined with commas. */
const textsOf = (host, selector) => [...host.querySelectorAll(selector)].map(el => el.textContent).join();

Testimony.test('Solarite.map.reentrantDisconnectRawNode', `A custom element inside a removed row that re-renders its list from disconnectedCallback leaves the list consistent`, () => {
	let owner = null;
	let probeTag = uniqueTag();
	class Probe extends HTMLElement {
		disconnectedCallback() {
			if (owner !== null)
				owner.render();
		}
	}
	customElements.define(probeTag, Probe);

	class A extends Solarite {
		rows = [1, 2, 3, 4, 5].map(id => ({id, label: 'r' + id, el: document.createElement(probeTag)}));

		render() {
			h(this)`<div>${h.map(this.rows, row => h`<p key=${row.id}><b>${row.label}</b>${row.el}</p>`)}</div>`
		}
	}
	customElements.define(uniqueTag(), A);
	let a = new A();
	document.body.append(a);
	a.render();
	let host = a.firstElementChild;
	assert.eq(textsOf(host, 'b'), 'r1,r2,r3,r4,r5');

	owner = a;
	a.rows.splice(1, 1);
	a.render();
	owner = null;
	assert.eq(textsOf(host, 'b'), 'r1,r3,r4,r5');

	// The list must still be tracked row for row.
	a.rows.push({id: 6, label: 'r6', el: document.createElement(probeTag)});
	a.render();
	assert.eq(textsOf(host, 'b'), 'r1,r3,r4,r5,r6');

	a.rows.splice(1, 1);
	a.render();
	assert.eq(textsOf(host, 'b'), 'r1,r4,r5,r6');

	a.rows = [];
	a.render();
	assert.eq(host.children.length, 0);
	a.remove();
});

Testimony.test('Solarite.map.reentrantDisconnectComponent', `A Solarite child component in a nested template that re-renders the parent when it disconnects`, () => {
	let owner = null;
	class Child extends Solarite {
		render() {
			h(this)`<i>child</i>`
		}

		disconnectedCallback() {
			if (owner !== null)
				owner.render();
		}
	}
	customElements.define('r-reentrant-child', Child);
	let childTag = 'r-reentrant-child';

	class A extends Solarite {
		rows = [1, 2, 3, 4, 5].map(id => ({id, label: 'r' + id}));

		render() {
			h(this)`<div>${h.map(this.rows, row => h`<p key=${row.id}><b>${row.label}</b>${h`<r-reentrant-child></r-reentrant-child>`}</p>`)}</div>`
		}
	}
	customElements.define(uniqueTag(), A);
	let a = new A();
	document.body.append(a);
	a.render();
	let host = a.firstElementChild;
	assert.eq(textsOf(host, 'b'), 'r1,r2,r3,r4,r5');
	assert.eq(host.querySelectorAll(childTag).length, 5);

	owner = a;
	a.rows.splice(1, 2);
	a.render();
	owner = null;
	assert.eq(textsOf(host, 'b'), 'r1,r4,r5');

	a.rows.push({id: 6, label: 'r6'});
	a.render();
	assert.eq(textsOf(host, 'b'), 'r1,r4,r5,r6');
	a.remove();
});

Testimony.test('Solarite.map.reentrantCallback', `A callback that renders its host again while the list is being drawn leaves every item drawn once, by a row that calls its own handler, whether the rows are keyed, unkeyed or plain text`, () => {
	let hits = [];
	const click = r => [x => hits.push(x.id), r];
	const shapes = {
		keyed: r => h`<li key=${r.id} onclick=${click(r)}>${r.id} </li>`,
		unkeyed: r => h`<li onclick=${click(r)}>${r.id} </li>`,
		// Rows of two kinds, so an unkeyed row can't always be rewritten where it stands.
		unkeyedMixed: r => r.id % 2 ? h`<li onclick=${click(r)}>${r.id} </li>` : h`<li class="even" onclick=${click(r)}><b>${r.id} </b></li>`,
		text: r => r.id + ' '
	};

	// Each is the list before, the list after, and the item whose callback renders again.
	// An unkeyed row is reused for whatever item now stands at its position, so the render the
	// callback starts leaves rows showing other items than the outer render remembers them by.
	const cases = [
		[[8], [20, 8, 21], 20], // Rows arrive on both sides of one that stays.
		[[1, 2, 3], [4, 3, 2, 1], 4], // Rows arrive and the others change places.
		[[3, 1, 4], [1, 2, 3, 4], 2], // The callback of a row in the middle.
		[[9, 1, 2, 3], [4, 3, 2, 1], 3] // The length stays the same.
	];
	for (let name in shapes)
		for (let [before, after, on] of cases) {
			let el = document.createElement('div');
			document.body.append(el);
			let items = {}, item = id => items[id] ??= {id};
			let rows = before.map(item), again = null;
			let render = () => h(el)`<ul>${h.map(rows, r => {
				if (again === r) {
					again = null;
					render();
				}
				return shapes[name](r);
			})}</ul>`;
			render();

			let what = `${name} [${before}] to [${after}]`, want = after.join(' ') + ' ';
			rows = after.map(item);
			again = item(on);
			render();
			assert.eq(what + ': ' + el.textContent, what + ': ' + want);
			if (name !== 'text') {
				hits = [];
				for (let li of el.querySelectorAll('li'))
					li.click();
				assert.eq(what + ': ' + hits.join(' ') + ' ', what + ': ' + want);
			}

			// The rows must also be remembered by the items they show, or the next render
			// would find nothing to do and leave a wrong row standing.
			render();
			assert.eq(what + ', next render: ' + el.textContent, what + ', next render: ' + want);
			el.remove();
		}
});

Testimony.test('Solarite.map.reentrantCallbackOtherContent', `A callback that renders its host with no rows, or with plain text where the list is, is overruled by the render it interrupted: that render's rows are drawn once, and still once after the next render`, () => {
	let el = document.createElement('div');
	let again = null;
	let render = list => h(el)`<ul>${typeof list === 'string' ? list : h.map(list, r => {
		if (again !== null && again.on === r) {
			let other = again.other;
			again = null;
			render(other);
		}
		return h`<li key=${r.id}>${r.id}</li>`;
	})}</ul>`;
	let one = {id: 1}, two = {id: 2}, three = {id: 3};

	// 1. The nested render empties the list while the outer one is building the rows that changed.
	render([one, two]);
	again = {on: two, other: []};
	render([two, three]);
	assert.eq(textsOf(el, 'li'), '2,3');
	render([two, three]);
	assert.eq(textsOf(el, 'li'), '2,3');

	// 2. The nested render puts plain text where the list is.
	render([]);
	again = {on: one, other: 'none'};
	render([one, two]);
	assert.eq(el.textContent, '12');
	render([one, two]);
	assert.eq(el.textContent, '12');
});

Testimony.test('Solarite.map.reentrantRawNodes', `A row that is created while a list is being patched may render its host with raw DOM nodes where the list is.  The rows which that render took out are not handed to a later render, which would draw each of them without its second node.`, () => {
	for (let between of [true, false]) {
		let el = document.createElement('div');
		let raw = document.createElement('em');
		let showRaw = false, armed = false;
		let rows = [1, 2, 3, 4].map(id => ({id}));
		let row = r => h`<dt key=${r.id}>${() => {
			if (armed) {
				armed = false;
				showRaw = true;
				render();
				showRaw = false;
			}
			return r.id;
		}}</dt><dd>${r.id}</dd>`;
		let list = () => showRaw ? [raw] : h.map(rows, row);
		let render = () => between ? h(el)`<dl><b>head</b>${list()}<i>tail</i></dl>` : h(el)`<dl>${list()}</dl>`;
		const text = () => (between ? 'head' : '') + rows.map(r => '' + r.id + r.id).join('') + (between ? 'tail' : '');
		render();
		assert.eq(el.textContent, text());

		// 1. The last row gets a new key.  Only that row is built, by the path that patches the
		// rows which changed, and the function inside it renders the host with the raw node.
		rows = [...rows.slice(0, 3), {id: 9}];
		armed = true;
		render();
		assert.eq(armed, false);

		// 2. The renders after it draw every row whole.
		for (let i=0; i<2; i++) {
			render();
			assert.eq(el.textContent, text(), 'between=' + between);
			assert.eq(el.querySelectorAll('dd').length, 4);
		}

		// 3. And the list is still followed row for row.
		rows = rows.slice(1);
		render();
		assert.eq(el.textContent, text(), 'between=' + between);
		rows = [{id: 7}, ...rows];
		render();
		assert.eq(el.textContent, text(), 'between=' + between);
		assert.eq(el.querySelectorAll('dt, dd').length, 8);
	}
});

Testimony.test('Solarite.map.reentrantRawNodesMovedRows', `Two rows change places in the render in which a new row renders its host with a raw DOM node where the list is.  The rows that were moved are then in the list only, not also kept for reuse, so the renders after it draw every row whole.`, () => {
	for (let between of [true, false]) {
		let el = document.createElement('div');
		let raw = document.createElement('em');
		let showRaw = false, beside = false, armed = false;
		let a = {id: 1}, b = {id: 2}, c = {id: 3}, d = {id: 4};
		let rows = [a, b, c, d];
		let row = r => h`<dt key=${r.id}>${r.id !== 9 ? r.id : () => {
			if (armed) {
				armed = false;
				showRaw = true;
				render();
				showRaw = false;
			}
			return r.id;
		}}</dt><dd>${r.id}</dd>`;
		let list = () => showRaw ? [raw] : beside ? [raw, h.map(rows, row)] : h.map(rows, row);
		let render = () => between ? h(el)`<dl><b>head</b><hr>${list()}<hr><i>tail</i></dl>` : h(el)`<dl>${list()}</dl>`;
		const text = () => (between ? 'head' : '') + rows.map(r => '' + r.id + r.id).join('') + (between ? 'tail' : '');
		render();
		assert.eq(el.textContent, text());

		// 1. Two rows change places and the last row gets a new key.  The function in the new
		// row renders the host with the raw node, which takes every old row out; the render it
		// interrupted then puts the two rows that changed places back.
		rows = [a, c, b, {id: 9}];
		armed = true;
		render();
		assert.eq(armed, false);

		// 2. Fewer rows, so that the two are removed again, then more rows than the list has,
		// beside the raw node, which takes rows from the ones kept for reuse.
		rows = [a, c];
		render();
		assert.eq(el.textContent, text(), 'between=' + between);
		rows = [a, c, {id: 5}, {id: 6}, {id: 7}, {id: 8}];
		beside = true;
		render();
		assert.eq(el.textContent, text(), 'between=' + between);
		assert.eq(el.querySelectorAll('dd').length, 6);
		beside = false;
		render();
		assert.eq(el.textContent, text(), 'between=' + between);
		assert.eq(el.querySelectorAll('dt, dd').length, 12);
	}
});

Testimony.test('Solarite.map.reentrantMovedRowsThenThrow', `Two rows change places in the render in which a new row renders its host with a raw DOM node where the list is, and another new row then throws.  The list is left empty, and the rows that had been moved are not kept for reuse in pieces: the renders after it draw every row whole.`, () => {
	for (let between of [true, false]) {
		let el = document.createElement('div');
		let raw = document.createElement('em');
		let showRaw = false, armed = false;
		let a = {id: 1}, b = {id: 2}, c = {id: 3}, d = {id: 4}, nine = {id: 9};
		let rows = [a, b, c, d];
		let row = r => r.id === 8 ? h`<p key=${r.id} onclick=${'not a function'}>8</p>` : h`<dt key=${r.id}>${r.id !== 9 ? r.id : () => {
			if (armed) {
				armed = false;
				showRaw = true;
				render();
				showRaw = false;
			}
			return r.id;
		}}</dt><dd>${r.id}</dd>`;
		let render = () => between
			? h(el)`<dl><b>head</b><hr>${showRaw ? [raw] : h.map(rows, row)}<hr><i>tail</i></dl>`
			: h(el)`<dl>${showRaw ? [raw] : h.map(rows, row)}</dl>`;
		const text = () => (between ? 'head' : '') + rows.map(r => '' + r.id + r.id).join('') + (between ? 'tail' : '');
		render();
		assert.eq(el.textContent, text());

		// 1. The last row is created first and renders the host with the raw node; row 1 is then
		// put back in front of it, and row 8 throws.
		rows = [b, {id: 8}, a, nine];
		armed = true;
		let threw = false;
		try { render(); } catch (e) { threw = true; }
		assert.eq(threw, true);
		assert.eq(armed, false);

		// 2. The same rows without the one that throws.
		rows = [b, a, nine];
		for (let i=0; i<2; i++) {
			render();
			assert.eq(el.textContent, text(), 'between=' + between);
			assert.eq(el.querySelectorAll('dd').length, 3);
		}
	}
});

Testimony.test('Solarite.map.reentrantBesideRawNode', `A row of a list that stands beside a raw DOM node may render its host while the list is drawn, with anything where the list is.  The render it interrupted then draws its own list, and the renders after it draw every row once, whole and in its place.`, () => {
	// A list with a raw node in it is drawn from the rows now standing in the DOM, taken one by
	// one.  A render that started inside that loop took its rows from the same ones, so a row
	// was used twice, and the rows the outer render had not taken yet were kept for reuse while
	// they still stood in the list.
	for (let nested of ['rawOnly', 'otherRows', 'text', 'nothing'])
		for (let mapped of [false, true])
			for (let between of [true, false]) {
				let el = document.createElement('div');
				let raw = document.createElement('em');
				let inner = false, armed = false, withRaw = true;
				let ids = [1, 2, 3, 4];
				const row = id => h`<dt>${() => {
					if (armed && id === 3) {
						armed = false;
						inner = true;
						render();
						inner = false;
					}
					return id;
				}}</dt><dd>${id}</dd>`;
				const rows = list => mapped ? h.map(list, row) : list.map(row);
				let plain = null;
				const content = () => !inner
					? plain ?? (withRaw ? [raw, rows(ids)] : rows(ids))
					: nested === 'rawOnly' ? [raw] : nested === 'otherRows' ? rows([7, 8, 9]) : nested === 'text' ? 'plain' : [];
				const render = () => between ? h(el)`<dl><b>head</b>${content()}<i>tail</i></dl>` : h(el)`<dl>${content()}</dl>`;
				const text = () => (between ? 'head' : '') + ids.map(id => '' + id + id).join('') + (between ? 'tail' : '');
				const check = () => {
					render();
					assert.eq(el.textContent, text(), nested + ' mapped=' + mapped + ' between=' + between);
					assert.eq(el.querySelectorAll('dt, dd').length, ids.length * 2);
					assert.eq(el.querySelectorAll('em').length, withRaw ? 1 : 0);
				};
				check();

				// 1. The third row renders the host while the list beside the raw node is drawn.
				armed = true;
				check();
				assert.eq(armed, false);

				// 2. The renders after it.
				check();
				ids = [1, 2];
				check();
				ids = [1, 2, 21, 22, 23, 24];
				check();
				withRaw = false;
				check();
				ids = [...ids, 31, 32];
				check();
				ids = [];
				check();

				// 3. Again, from a row that is new, in a render that has no raw node itself.
				withRaw = true;
				ids = [5, 6];
				check();
				withRaw = false;
				ids = [5, 6, 3];
				armed = true;
				check();
				assert.eq(armed, false);
				ids = [5, 6, 3, 41, 42];
				check();

				// 4. And from the one row that replaces the raw node standing alone.  A render that
				// puts plain text there must not leave its text node remembered when the render it
				// interrupted has taken the node out again.
				withRaw = true;
				ids = [];
				check();
				withRaw = false;
				ids = [3];
				armed = true;
				check();
				assert.eq(armed, false);
				plain = 'after';
				render();
				assert.eq(el.textContent, (between ? 'head' : '') + 'after' + (between ? 'tail' : ''), nested + ' mapped=' + mapped + ' between=' + between);
				plain = null;
				ids = [1, 2];
				check();
			}
});

Testimony.test('Solarite.map.reentrantBesideRawNodeSameRow', `A render that starts inside a row of a list beside a raw DOM node may redraw that very row with other values.  The render it interrupted writes all of its own values to the row afterward, not only the ones it had not reached.`, () => {
	let el = document.createElement('div');
	let raw = document.createElement('em');
	let armed = 0;
	let render = rows => h(el)`<dl><b>head</b>${[raw, rows]}<i>tail</i></dl>`;
	const row = (id, level) => h`<dt>${level ? () => {
		// A row of level 2 renders the host with rows 7 and 8, and row 8, of level 1, renders
		// it once more with the raw node alone.
		if (armed === 2 && level === 2) {
			armed = 1;
			render([row(7), row(8, 1)]);
		}
		else if (armed === 1 && level === 1) {
			armed = 0;
			render([]);
		}
		return id;
	} : id}</dt><dd>${id}</dd>`;
	render([row(1), row(2), row(3)]);

	// 1. The first row is redrawn as 7 by the render its own function starts, while its <dt>
	// is still waiting for what the function returns.
	armed = 2;
	render([row(1, 2), row(2), row(3)]);
	assert.eq(armed, 0);
	assert.eq(el.textContent, 'head112233tail');
	assert.eq(el.querySelectorAll('dt, dd').length, 6);

	// 2. The renders after it.
	render([row(1), row(2), row(3), row(4)]);
	assert.eq(el.textContent, 'head11223344tail');
	render([row(1)]);
	render([row(5), row(6), row(7), row(8), row(9)]);
	assert.eq(el.textContent, 'head5566778899tail');
	assert.eq(el.querySelectorAll('dt, dd').length, 10);
});

Testimony.test('Solarite.map.reentrantBesideRawNodeEveryCall', `A row of a list beside a raw DOM node may render its host every time its function is called, behind a guard against calling itself.  The render it interrupts starts over once and then keeps what the nested render drew, so it finishes.`, () => {
	// Starting over calls the functions in the rows again.  A function that answers every call
	// by rendering the host would be started over for ever, where the render used to finish.
	for (let mapped of [false, true]) {
		let el = document.createElement('div');
		let raw = document.createElement('em');
		let busy = false, armed = false, renders = 0;
		let ids = [1, 2, 3];
		const row = id => h`<dt>${() => {
			if (armed && !busy) {
				busy = true;
				try {
					render();
				}
				finally {
					busy = false;
				}
			}
			return id;
		}}</dt><dd>${id}</dd>`;
		const render = () => {
			// The limit turns a render that never finishes into a failure of this test.
			if (++renders > 20)
				throw new Error('The host was rendered more than 20 times.');
			h(el)`<dl><b>head</b>${[raw, mapped ? h.map(ids, row) : ids.map(row)]}<i>tail</i></dl>`;
		};
		const check = () => {
			renders = 0;
			render();
			assert.eq(el.textContent, 'head' + ids.map(id => '' + id + id).join('') + 'tail', 'mapped=' + mapped);
			assert.eq(el.querySelectorAll('dt, dd').length, ids.length * 2);
			assert.eq(el.querySelectorAll('em').length, 1);
		};
		check();

		// 1. Every row's function renders the host: with the same rows, with other rows, with
		// none, and with rows that are all new.
		armed = true;
		check();
		ids = [3, 4, 1, 5];
		check();
		ids = [];
		check();
		ids = [6, 7];
		check();

		// 2. The renders after it.
		armed = false;
		check();
		ids = [6, 8, 7];
		check();
	}

	// 3. Every render draws other values (a counter), so the render that is kept is not the one
	// that was interrupted.  The row whose function started it holds values of both, and the
	// next render, which brings the kept render's values again, has to write the ones that
	// differ: also when the function is the same object every time, so that nothing but those
	// values tells the two renders apart.
	for (let stable of [false, true]) {
		let el = document.createElement('div');
		let raw = document.createElement('em');
		let busy = false, armed = false, renders = 0, count = 0, counting = true;
		let ids = [1, 2, 3];
		const label = () => {
			if (armed && !busy) {
				busy = true;
				try {
					render();
				}
				finally {
					busy = false;
				}
			}
			return 'row';
		};
		const row = id => h`<dt title=${'t' + count}>${stable ? label : () => label()}</dt><dd>${id + ':' + count}</dd>`;
		const render = () => {
			if (++renders > 20)
				throw new Error('The host was rendered more than 20 times.');
			if (counting)
				count++;
			h(el)`<dl>${[raw, ids.map(row)]}</dl>`;
		};
		render();
		armed = true;
		render();
		armed = false;
		counting = false;
		render();
		assert.eq(el.textContent, ids.map(id => 'row' + id + ':' + count).join(''), 'stable=' + stable);
		assert.eq([...el.querySelectorAll('dt')].map(dt => dt.title).join(), ids.map(() => 't' + count).join(), 'stable=' + stable);
	}
});

Testimony.test('Solarite.map.reentrantBesideRawNodeTwice', `A row of a list that follows a raw DOM node may render its host twice in a row while the list is drawn, the second time with plain text or an h.map() where the list is.  The render it interrupted leaves neither behind.`, () => {
	// Only the first render that starts inside is sent the way of the one it interrupts.  The
	// second may put a bare text node there, or remember the items of its h.map(), and the
	// render that starts over has to take both over: a later render otherwise wrote its text
	// into a node that had left the document, or took the rows for the rows of those items.
	const others = [{id: 7}, {id: 8}, {id: 9}];
	const otherRow = item => h`<dt>${item.id}</dt>`;
	for (let second of ['text', 'map'])
		for (let between of [true, false]) {
			let el = document.createElement('div');
			let raw = document.createElement('em');
			let inner = null, later = null, armed = false, withRaw = true;
			let ids = [1, 2, 3];
			const row = id => h`<dt>${() => {
				if (armed && id === 2) {
					armed = false;
					inner = [];
					render();
					inner = second === 'text' ? 'plain' : h.map(others, otherRow);
					render();
					inner = null;
				}
				return id;
			}}</dt>`;
			const content = () => inner ?? later ?? (withRaw ? [raw, ids.map(row)] : ids.map(row));
			const render = () => between ? h(el)`<dl><b>head</b>${content()}<i>tail</i></dl>` : h(el)`<dl>${content()}</dl>`;
			const check = (expected, step) => {
				render();
				assert.eq(el.textContent, between ? 'head' + expected + 'tail' : expected, step + ' second=' + second + ' between=' + between);
			};
			check('123', 'first');

			// 1. The list no longer has the raw node, but is still drawn the way a list with one is.
			withRaw = false;
			armed = true;
			check('123', 'interrupted');
			assert.eq(armed, false);

			// 2. What the second nested render drew, given again, and the list after it.
			later = second === 'text' ? 'after' : h.map(others, otherRow);
			check(second === 'text' ? 'after' : '789', 'later');
			later = null;
			check('123', 'rows');
			withRaw = true;
			ids = [1, 2, 3, 4];
			check('1234', 'with the raw node');
			assert.eq(el.querySelectorAll('dt').length, 4);
			assert.eq(el.querySelectorAll('em').length, 1);
		}
});

Testimony.test('Solarite.map.reentrantDisconnectBesideRawNode', `An element in a row of a list beside a raw DOM node may render its host from its disconnectedCallback, as the row is removed.  The render that removed the row then draws its own list, and the renders after it draw every row once and whole.`, () => {
	// The render that the element starts runs between the removing of the old nodes and the
	// placing of the new ones.  The outer render used to carry on and place its nodes over
	// what that render had drawn, while the list remembered that render's rows.
	let leaving = null;
	class LeavingBesideRaw extends HTMLElement {
		disconnectedCallback() {
			if (leaving)
				leaving(this);
		}
	}
	customElements.define(uniqueTag(), LeavingBesideRaw);

	for (let mapped of [false, true])
		for (let layout of ['between', 'whole', 'root']) {
			let el = document.createElement('div');
			document.body.append(el);
			let raw = document.createElement('em');
			let inner = null, extra = false;
			let ids = [1, 2, 3, 4];
			const row = id => h`<dt>${id}</dt><dd>${id}</dd>`;
			const content = () => inner || [raw, mapped ? h.map(ids, row) : ids.map(row), ...(extra ? [h`<p>last</p>`] : [])];
			const render = () => layout === 'between' ? h(el)`<dl><b>head</b>${content()}<i>tail</i></dl>`
				: layout === 'whole' ? h(el)`<dl>${content()}</dl>` : h(el)`${content()}`;
			const text = () => (layout === 'between' ? 'head' : '') + ids.map(id => '' + id + id).join('') + (extra ? 'last' : '') + (layout === 'between' ? 'tail' : '');
			const check = step => {
				render();
				assert.eq(el.textContent, text(), step + ' mapped=' + mapped + ' ' + layout);
				assert.eq(el.querySelectorAll('dt, dd').length, ids.length * 2);
				assert.eq(el.querySelectorAll('em').length, 1);
			};
			const arm = nested => {
				el.querySelectorAll('dd')[ids.length - 1].append(new LeavingBesideRaw());
				leaving = element => {
					leaving = null;
					inner = nested();
					render();
					inner = null;
					element.remove();
				};
			};
			check('first');

			// 1. The last two rows go, and the element in the last one renders the host with the
			// raw node alone.
			arm(() => [raw]);
			ids = [1, 2];
			check('raw alone');
			assert.eq(leaving, null);
			check('after');
			ids = [1, 2, 5, 6, 7];
			check('grown');

			// 2. The last row goes, and the element renders the host with other rows.
			arm(() => [raw, row(8), row(9)]);
			ids = [1, 2, 5, 6];
			check('other rows');
			assert.eq(leaving, null);
			ids = [1, 2, 5, 6, 10, 11];
			check('grown again');

			// 3. Every row goes, and the element renders the host with plain text.
			arm(() => 'plain');
			ids = [];
			check('emptied');
			assert.eq(leaving, null);
			ids = [12, 13, 14];
			check('filled');

			// 4. The last row goes and a row of another kind comes, and the element renders the
			// host with that same list.  Its render must not take the new row for placed
			// already, because the render it interrupts was about to place it.
			arm(() => null);
			ids = [12, 13];
			extra = true;
			check('same list');
			assert.eq(leaving, null);
			assert.eq(el.querySelectorAll('p').length, 1);
			el.remove();
		}
});

Testimony.test('Solarite.map.removedRunRendersRawNodes', `An element inside a removed row may render the host from its disconnectedCallback with a raw DOM node where the list is.  The rows removed together with that row are kept for reuse whole.`, () => {
	// The rows of a removed run leave one after another.  The render that the element starts
	// finds the rows still waiting in the DOM but not in the list, and removes them one node at
	// a time; a row was then kept for reuse holding its first node only.
	let gone = null;
	class LeavingRun extends HTMLElement {
		disconnectedCallback() {
			if (gone)
				gone(this);
		}
	}
	customElements.define(uniqueTag(), LeavingRun);

	for (let runLength of [2, 3]) {
		let el = document.createElement('div');
		document.body.append(el);
		let raw = document.createElement('em');
		let showRaw = false;
		let rows = [1, 2, 3, 4, 5].map(id => ({id}));
		let render = () => h(el)`<dl><b>head</b>${showRaw ? [raw] : h.map(rows, r => h`<dt>${r.id}</dt><dd>${r.id}</dd>`)}<i>tail</i></dl>`;
		const text = () => 'head' + rows.map(r => '' + r.id + r.id).join('') + 'tail';
		render();

		// 1. Code outside the template puts such an element in the second row.  That row and
		// the ones after it are then removed as one run, and the element renders the host
		// while the others are still waiting.
		el.querySelectorAll('dd')[1].append(new LeavingRun());
		gone = element => {
			gone = null;
			showRaw = true;
			render();
			showRaw = false;
			element.remove();
		};
		rows = [rows[0], ...rows.slice(1 + runLength)];
		render();
		assert.eq(gone, null);

		// 2. The renders after it draw every row whole, also the ones taken from the rows kept
		// for reuse.
		render();
		assert.eq(el.textContent, text(), 'runLength=' + runLength);
		rows = [...rows, {id: 6}, {id: 7}, {id: 8}];
		for (let i=0; i<2; i++) {
			render();
			assert.eq(el.textContent, text(), 'runLength=' + runLength);
			assert.eq(el.querySelectorAll('dt, dd').length, rows.length * 2);
		}
		el.remove();
	}
});

Testimony.test('Solarite.map.keyedNeverPooled', `Keyed rows removed by any shape of removal are never reused, and nothing is retained after a clear`, () => {
	class A extends Solarite {
		rows = [1, 2, 3, 4, 5, 6].map(id => ({id, label: 'r' + id}));

		render() {
			h(this)`<section><hr>${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}</section>`
		}
	}
	customElements.define(uniqueTag(), A);
	let a = new A();
	document.body.append(a);
	a.render();
	let host = a.firstElementChild;
	let removed = [];
	const step = fn => {
		let before = [...host.querySelectorAll('p')];
		fn();
		a.render();
		let after = new Set(host.querySelectorAll('p'));
		for (let el of before)
			if (!after.has(el))
				removed.push(el);
		for (let el of after)
			if (removed.includes(el))
				throw new Error('a removed keyed element came back');
		assert.eq(textsOf(host, 'p'), a.rows.map(r => r.label).join());
	};
	step(() => a.rows.splice(2, 2));
	step(() => a.rows.push({id: 3, label: 'r3'}, {id: 4, label: 'r4'}));
	step(() => a.rows.shift());
	step(() => a.rows.unshift({id: 1, label: 'r1'}));
	step(() => a.rows = []);
	step(() => a.rows = [1, 2, 3].map(id => ({id, label: 'r' + id})));
	step(() => a.rows.length = 1);
	step(() => a.rows.push({id: 2, label: 'r2'}));
	a.remove();
});

Testimony.test('Solarite.map.internalStateAfterClear', `Nothing is retained by a keyed list after it empties, and the path's arrays stay aligned`, () => {
	class A extends Solarite {
		rows = [1, 2, 3, 4, 5, 6].map(id => ({id, label: 'r' + id}));

		render() {
			h(this)`<div>${h.map(this.rows, row => h`<p key=${row.id}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define(uniqueTag(), A);
	let a = new A();
	document.body.append(a);
	a.render();
	let rootNg = Globals.rootNodeGroups.get(a);
	let path = rootNg.paths.find(p => p instanceof PathToNodes);
	assert.eq(path.nodeGroups.length, 6);
	a.rows.splice(1, 2);
	a.render();
	assert.eq(path.nodeGroups.length, 4);
	assert.eq(path.lastItems.length, 4);
	assert.eq(path.nodeGroups.map(ng => ng.key).join(), '1,4,5,6');
	assert.eq(path.lastItems.map(r => r.id).join(), '1,4,5,6');
	assert.eq(path.nodeGroupsDetachedAvailable, null);
	a.rows = [];
	a.render();
	assert.eq(path.nodeGroups.length, 0);
	assert.eq(path.lastItems === null ? 0 : path.lastItems.length, 0);
	assert.eq(path.nodeGroupsDetachedAvailable, null);
	assert.eq(path.nodeGroupsAttachedAvailable, null);
	a.remove();
});

Testimony.test('Solarite.map.eventsAfterRemoval', `Handlers of the rows that stay still fire with their own row, and a handler that removes its own row mid-dispatch`, () => {
	let log = [];
	class A extends Solarite {
		rows = [1, 2, 3, 4, 5, 6].map(id => ({id, label: 'r' + id}));

		del(row, ev) {
			log.push('del' + row.id);
			this.rows.splice(this.rows.indexOf(row), 1);
			this.render();
		}

		render() {
			h(this)`<div onclick=${() => log.push('host')}>${h.map(this.rows, row =>
				h`<p key=${row.id} onclick=${() => log.push('row' + row.id)}><a onclick=${[this.del, row]}>x</a><b onclick=${ev => { log.push('stop' + row.id); ev.stopPropagation() }}>${row.label}</b></p>`)}</div>`
		}
	}
	customElements.define(uniqueTag(), A);
	let a = new A();
	document.body.append(a);
	a.render();
	let host = a.firstElementChild;

	a.rows.splice(1, 2);
	a.render();
	host.children[1].querySelector('b').click();
	assert.eq(log.join(), 'stop4');
	log.length = 0;

	// The handler removes its own row; the row and host handlers still run, as the event had started.
	host.children[2].querySelector('a').click();
	assert.eq(log.join(), 'del5,row5,host');
	assert.eq(textsOf(host, 'b'), 'r1,r4,r6');
	log.length = 0;

	host.children[2].querySelector('a').click();
	assert.eq(log.join(), 'del6,row6,host');
	host.children[0].querySelector('a').click();
	assert.eq(textsOf(host, 'b'), 'r4');
	log.length = 0;
	host.children[0].click();
	assert.eq(log.join(), 'row4,host');
	a.remove();
});

Testimony.test('Solarite.map.selectorAfterRemoval', `A selector finds the right rows after the fast path cut rows out`, () => {
	class A extends Solarite {
		rows = [1, 2, 3, 4, 5, 6].map(id => ({id, label: 'r' + id}));
		sel = h.selector();

		render() {
			h(this)`<div>${h.map(this.rows, row =>
				h`<p key=${row.id} class=${this.sel.when(row.id, 'danger')}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define(uniqueTag(), A);
	let a = new A();
	document.body.append(a);
	a.render();
	let host = a.firstElementChild;
	const sel = () => [...host.children].filter(el => el.className === 'danger').map(el => el.textContent).join();

	a.sel.set(4);
	assert.eq(sel(), 'r4');
	a.rows.splice(1, 2);
	a.render();
	assert.eq(sel(), 'r4');
	a.sel.set(5);
	assert.eq(sel(), 'r5');
	a.sel.set(2); // Gone.
	assert.eq(sel(), '');
	a.rows.splice(1, 1); // Removes 4.
	a.render();
	a.sel.set(6);
	assert.eq(sel(), 'r6');
	a.rows.pop(); // The selected row goes.
	a.render();
	assert.eq(sel(), '');
	a.sel.set(1);
	assert.eq(sel(), 'r1');
	a.rows = [];
	a.render();
	a.sel.set(5);
	a.rows = [{id: 5, label: 'r5'}, {id: 7, label: 'r7'}];
	a.render();
	assert.eq(sel(), 'r5');
	a.remove();
});

Testimony.test('Solarite.map.staleItemsAfterArrayCallback', `A render whose callback returns arrays, or whose rows are raw nodes, leaves nothing behind that a later render of the earlier items could mistake for the current rows.`, () => {
	let el = document.createElement('div');
	let a = {t: 'a'}, b = {t: 'b'}, c = {t: 'c'};
	let mode = 'tpl', items = [a, b, c];
	let render = () => h(el)`<div>${h.map(items, r =>
		mode === 'tpl' ? h`<p>${r.t}</p>` : mode === 'arrays' ? [h`<p>${r.t}</p>`] : Object.assign(document.createElement('p'), {textContent: r.t}))}</div>`;
	for (let other of ['arrays', 'nodes']) {
		mode = 'tpl';
		items = [a, b, c];
		render();
		assert.eq(el.textContent, 'abc');
		mode = other;
		items = [{t: 'x'}, {t: 'y'}, {t: 'z'}];
		render();
		assert.eq(el.textContent, 'xyz');
		mode = 'tpl';
		items = [a, b, c];
		render();
		assert.eq(el.textContent, 'abc', other);
	}
});

Testimony.test('Solarite.map.keyedRowsBecomeArrays', `A keyed list re-rendered at the same length, whose callback now returns an array for each changed row, is drawn the general way, and is a keyed list again when the callback returns templates again.`, () => {
	// At an unchanged length only the changed rows are built, and that short route can only
	// place a Template or a string: it has to notice anything else and hand the render on.
	let el = document.createElement('div');
	let a = {id: 1, t: 'a'}, b = {id: 2, t: 'b'}, c = {id: 3, t: 'c'};
	let items = [a, b, c], asArrays = false;
	let row = r => h`<p key=${r.id}>${r.t}</p>`;
	let render = () => h(el)`<div>${h.map(items, r => asArrays ? [row(r)] : row(r))}</div>`;
	render();
	let [p1, p2, p3] = el.querySelectorAll('p');

	items = [{id: 1, t: 'x'}, {id: 2, t: 'y'}, {id: 3, t: 'z'}];
	asArrays = true;
	render();
	assert.eq(el.textContent, 'xyz');
	assert.eq([...el.querySelectorAll('p')], [p1, p2, p3]); // The keys are the same, so the elements are.

	items = [c, a, b];
	asArrays = false;
	render();
	assert.eq(el.textContent, 'cab');
	assert.eq([...el.querySelectorAll('p')], [p3, p1, p2]);
});

Testimony.test('Solarite.map.oddResultAnywhere', `An h.map() callback may return an array, a raw node, a nested list, a function, a number or nothing for any item, not only for the first one, and the list is then drawn as a plain array of the same values is.`, () => {
	// What a callback may return besides a Template or a string.
	const odd = {
		array: r => [h`<p>${r.id}a</p>`, h`<p>${r.id}b</p>`],
		emptyArray: () => [],
		node: r => Object.assign(document.createElement('p'), {textContent: r.id + 'n'}),
		nestedMap: r => h.map([1, 2], n => h`<i>${r.id}.${n}</i>`),
		function: r => () => h`<p>${r.id}f</p>`,
		number: r => r.id,
		null: () => null,
		undefined: () => undefined,
		false: () => false,
	};
	let nextId = 1;
	const row = isOdd => ({id: nextId++, isOdd});
	const html = el => el.innerHTML.replace(/<!--.*?-->/g, '');

	// Draw each value in turn into el, and after each one compare with a fresh element that drew
	// the same items as a plain array.  toValue turns a list of items into what is drawn.
	const check = (lists, fn, toValue, what) => {
		let el = document.createElement('div');
		for (let items of lists) {
			h(el)`<div>${toValue(items)}</div>`;
			let expected = document.createElement('div');
			h(expected)`<div>${items.map(fn)}</div>`;
			assert.eq(html(el), html(expected), what);
		}
	};

	for (let keyed of [false, true])
		for (let kind in odd) {
			const fn = r => r.isOdd ? odd[kind](r) : keyed ? h`<p key=${r.id}>${r.id}</p>` : h`<p>${r.id}</p>`;
			const mapped = items => h.map(items, fn);
			let a = row(false), b = row(false), c = row(false);
			let what = (keyed ? 'keyed ' : 'unkeyed ') + kind + ' ';

			// 1. The odd row in each position of a new list.
			check([[row(true), a, b]], fn, mapped, what + 'first');
			check([[a, row(true), b]], fn, mapped, what + 'middle');
			check([[a, b, row(true)]], fn, mapped, what + 'last');
			check([[row(true), row(true)]], fn, mapped, what + 'every');

			// 2. The odd row arriving in a list that is already drawn, and leaving it again.
			check([[a, b, c], [a, row(true), c], [a, row(false), c], [a, b, c]], fn, mapped, what + 'replaced');
			check([[a, b], [a, b, row(true)], [a, b, row(true), row(false)], [a, b]], fn, mapped, what + 'appended');
			check([[a, b], [row(true), a, b], [a, b]], fn, mapped, what + 'prepended');
			check([[a, b, c], [c, row(true), a, b], [b, a, c]], fn, mapped, what + 'reordered');

			// 3. After a render that was not an h.map(): a plain array, then one holding a raw node.
			let el = document.createElement('div');
			for (let before of [[h`<p>x</p>`, h`<b>x</b>`], [document.createElement('hr'), h`<b>x</b>`]]) {
				let items = [a, row(true), b];
				h(el)`<div>${before}</div>`;
				h(el)`<div>${h.map(items, fn)}</div>`;
				let expected = document.createElement('div');
				h(expected)`<div>${items.map(fn)}</div>`;
				assert.eq(html(el), html(expected), what + 'after another render');
			}
		}
});

Testimony.test('Solarite.map.oddResultNested', `An h.map() list that is inside an array, returned by a function, or returned by the callback of another h.map() draws whatever its callback returns the same way a list given directly does: an array, a raw node, a number or nothing for an item, as well as templates and strings.`, () => {
	const results = {
		template: n => h`<p>${n}</p>`,
		string: n => 's' + n,
		number: n => n,
		null: () => null,
		undefined: () => undefined,
		array: n => [h`<b>${n}</b>`, h`<i>${n}</i>`],
		node: n => Object.assign(document.createElement('u'), {textContent: n}),
		nestedMap: n => h.map([1, 2], m => m === 1 ? n + '.' + m : h`<i>${n}.${m}</i>`),
		mixed: n => n % 2 ? h`<p>${n}</p>` : n
	};
	const html = el => el.innerHTML.replace(/<!--.*?-->/g, '');

	// 1. Each kind of result, in each way of nesting, shows what the same values show as a plain array.
	for (let kind in results)
		for (let wrap of [list => [list], list => () => list, list => [h`<hr>`, list, 'end']]) {
			let el = document.createElement('div'), direct = document.createElement('div');
			for (let items of [[1, 2], [2, 3, 1], [], [4]]) {
				h(el)`<div>${wrap(h.map(items, results[kind]))}</div>`;
				h(direct)`<div>${wrap(items.map(results[kind]))}</div>`;
				assert.eq(html(el), html(direct), kind);
			}
		}

	// 2. A list of lists given directly, whose inner callback hides the even items.
	let el = document.createElement('div');
	for (let groups of [[[1, 2], [3]], [[3], [], [2, 1], [4, 5]]]) {
		h(el)`<div>${h.map(groups, group => h.map(group, n => n % 2 ? n : null))}</div>`;
		assert.eq(html(el), '<div>' + groups.flat().filter(n => n % 2).join('') + '</div>');
	}
});

Testimony.test('Solarite.map.oddResultKeepsOtherRows', `When a row that is an array, or nothing at all, joins a keyed h.map() list, the rows whose items did not change keep their elements, in that render and the ones after it.`, () => {
	for (let odd of [r => [h`<i>${r.id}a</i>`, h`<i>${r.id}b</i>`], () => null])
		for (let shape of ['replaced', 'appended', 'prepended']) {
			let el = document.createElement('div');
			let a = {id: 1}, b = {id: 2}, c = {id: 3}, x = {id: 4, isOdd: true};
			let items = [a, b, c];
			let render = () => h(el)`<div>${h.map(items, r => r.isOdd ? odd(r) : h`<p key=${r.id}>${r.id}</p>`)}</div>`;
			render();
			let [pa, pb, pc] = el.querySelectorAll('p');

			items = shape === 'replaced' ? [a, x, c] : shape === 'appended' ? [a, b, c, x] : [x, a, b, c];
			for (let pass of ['first', 'second']) {
				render();
				let ps = [...el.querySelectorAll('p')];
				assert.eq(ps[0] === pa && ps.at(-1) === pc && (shape === 'replaced' || ps[1] === pb), true, shape + ', ' + pass + ' render');
			}
		}
});

Testimony.test('Solarite.map.throwingRowLeavesNoOrphans', `A row that throws while it is created leaves the list empty rather than half-drawn, puts back a parent that was taken out of the document, and the next render draws the whole list once.`, () => {
	for (let keyed of [true, false])
		for (let count of [5, 600]) { // 600 keyed rows go in with the parent detached.
			let el = document.createElement('div');
			document.body.append(el);
			let rows = [];
			for (let i=0; i<count; i++)
				rows.push({id: i});
			let bad = count - 2;
			let row = r => keyed
				? h`<li key=${r.id} onclick=${r.id === bad ? 'not a function' : () => {}}>${r.id}</li>`
				: h`<li onclick=${r.id === bad ? 'not a function' : () => {}}>${r.id}</li>`;
			let render = () => h(el)`<ul>${h.map(rows, row)}</ul><footer></footer>`;
			let threw = false;
			try { render(); } catch (e) { threw = true; }
			assert.eq(threw, true);
			assert.eq(el.querySelector('ul') !== null, true, 'the list parent is in place');
			assert.eq(el.querySelectorAll('li').length, 0, 'no orphan rows');

			bad = -1;
			render();
			assert.eq(el.querySelectorAll('li').length, count);
			assert.eq(el.querySelector('ul').textContent, rows.map(r => r.id).join(''));

			// The same when rows are added to a list that already has some.
			bad = count + 3;
			for (let i=count; i<count+6; i++)
				rows.push({id: i});
			threw = false;
			try { render(); } catch (e) { threw = true; }
			assert.eq(threw, true);
			bad = -1;
			render();
			assert.eq(el.querySelector('ul').textContent, rows.map(r => r.id).join(''), 'keyed=' + keyed + ' count=' + count);
			el.remove();
		}
});

Testimony.test('Solarite.map.throwingRowAmongReplacedRows', `A new row that throws while a few rows of a keyed list are replaced at the same length, which is settled by a shorter route than the general diff, leaves the list empty as well, so the next render shows exactly the items it is given.`, () => {
	for (let mapped of [true, false]) {
		let el = document.createElement('div');
		let rows = [1, 2, 3, 4], bad = -1;
		let row = id => h`<li key=${id} onclick=${id === bad ? 'not a function' : () => {}}>${id}</li>`;
		let render = () => h(el)`<ul>${mapped ? h.map(rows, row) : rows.map(row)}</ul>`;
		render();

		// Row 9 is created after row 8 has already been put in place.
		rows = [1, 9, 8, 4];
		bad = 9;
		let threw = false;
		try { render(); } catch (e) { threw = true; }
		assert.eq(threw, true);
		assert.eq(el.querySelectorAll('li').length, 0, 'no orphan rows, mapped=' + mapped);

		// The same items once they are valid, then other items, then the original ones.
		bad = -1;
		for (let next of [[1, 9, 8, 4], [1, 5, 6, 4], [1, 2, 3, 4]]) {
			rows = next;
			render();
			assert.eq(el.textContent, next.join(''), 'mapped=' + mapped);
		}
	}
});

Testimony.test('Solarite.map.throwingRowThenFixed', `A row whose update throws part-way is drawn right by the next render, whatever item it is given then: the item fixed, or the item it showed before.  In an h.map() list with or without keys, and in an array, no item is shown twice and none is lost.`, () => {
	let ok = () => {};

	// A row throws while it is updated: an attribute is given a function that throws, or an
	// event is given a string.
	let rows = {
		attribute: keyed => keyed
			? item => h`<li key=${item.id} title=${() => item.user.name}>${item.id}-${item.v}</li>`
			: item => h`<li title=${() => item.user.name}>${item.id}-${item.v}</li>`,
		event: keyed => keyed
			? item => h`<li key=${item.id} onclick=${item.user ? ok : 'oops'}>${item.id}-${item.v}</li>`
			: item => h`<li onclick=${item.user ? ok : 'oops'}>${item.id}-${item.v}</li>`
	};
	for (let kind of ['mapped', 'mappedKeyed', 'array'])
		for (let how in rows) {
			let row = rows[how](kind === 'mappedKeyed'), what = kind + ', ' + how;
			let el = document.createElement('div');
			let items;
			let render = () => h(el)`<ul>${kind === 'array' ? items.map(row) : h.map(items, row)}</ul>`;
			let user = {name: 'u'};

			// 1. A new copy of y that throws moves to the front, and the app then fixes it.
			let x = {id: 'x', v: 'p', user}, y = {id: 'y', v: 'q', user}, z = {id: 'z', v: 'q', user};
			items = [x, y];
			render();
			items = [{...y, user: null}, x, z];
			assert(thrownBy(render) !== null, what);
			items = [{...y}, x, z];
			render();
			assert.eq(textsOf(el, 'li'), 'y-q,x-p,z-q', what + ', fixed');
			render();
			assert.eq(textsOf(el, 'li'), 'y-q,x-p,z-q', what + ', next render');

			// 2. The list keeps its length, one row's new item throws, and the app goes back to the
			// item the row showed before.
			let a = {id: 'a', v: 1, user}, b = {id: 'b', v: 2, user};
			items = [a, b];
			render();
			items = [a, {id: 'b', v: 3, user: null}];
			assert(thrownBy(render) !== null, what);
			items = [a, b];
			render();
			assert.eq(textsOf(el, 'li'), 'a-1,b-2', what + ', back');
		}
});

Testimony.test('Solarite.map.throwingRowKeepsPooledRows', `Rows of several nodes that were removed in the same render in which a new row throws can still be reused: each comes back whole when a later render needs a row of its kind, and what follows the list stays in place.`, () => {
	for (let mapped of [true, false]) {
		let el = document.createElement('div');
		let rows = [1, 2], bad = false;
		let pair = id => h`<dt>${id}</dt><dd>${id}</dd>`;
		let single = id => h`<p onclick=${bad ? 'not a function' : () => {}}>${id}</p>`;
		let row = pair;
		// The list has two neighbours on each side, so it can't be emptied by clearing its parent.
		let render = () => h(el)`<div><b>head</b><hr>${mapped ? h.map(rows, id => row(id)) : rows.map(row)}<hr><i>tail</i></div>`;
		render();
		assert.eq(el.textContent, 'head1122tail');

		// 1. Both two-node rows are removed, and kept for reuse, before the row replacing them throws.
		rows = [3];
		row = single;
		bad = true;
		let threw = false;
		try { render(); } catch (e) { threw = true; }
		assert.eq(threw, true);
		assert.eq(el.textContent, 'headtail', 'mapped=' + mapped);

		// 2. Rows of the first kind again, which are taken from the ones kept above.
		bad = false;
		row = pair;
		rows = [4, 5, 6];
		render();
		assert.eq(el.textContent, 'head445566tail', 'mapped=' + mapped);
		assert.eq(el.querySelectorAll('dt').length, 3);
		assert.eq(el.querySelectorAll('dd').length, 3);

		// 3. And the template still renders.
		rows = [7];
		render();
		assert.eq(el.textContent, 'head77tail', 'mapped=' + mapped);
	}
});

Testimony.test('Solarite.map.throwingRowForgetsNestedText', `Plain text that a row put where its list is, by rendering its host while the list was being drawn, is forgotten with the rows when a later row throws: the same text given afterwards is shown.`, () => {
	for (let between of [true, false]) {
		let el = document.createElement('div');
		let armed = false, loading = false, content = [];
		let render = () => between
			? h(el)`<div><b>head</b><hr>${loading ? 'Loading' : content}<hr><i>tail</i></div>`
			: h(el)`<div>${loading ? 'Loading' : content}</div>`;
		let row = id => h`<p>${() => {
			if (armed) {
				armed = false;
				loading = true;
				render();
				loading = false;
			}
			return id;
		}}</p>`;
		render();

		// 1. The first row renders the host with text in the list's place; the second row throws.
		content = [row(1), h`<p onclick=${'not a function'}>2</p>`];
		armed = true;
		let threw = false;
		try { render(); } catch (e) { threw = true; }
		assert.eq(threw, true);
		assert.eq(armed, false);

		// 2. The text is shown when it is given again, and so are rows after it.
		loading = true;
		render();
		assert.eq(el.textContent, between ? 'headLoadingtail' : 'Loading', 'between=' + between);
		loading = false;
		content = [row(3)];
		render();
		assert.eq(el.textContent, between ? 'head3tail' : '3', 'between=' + between);
	}
});

Testimony.test('Solarite.map.throwingRowDroppedRowRenders', `When a row throws, the rows that are dropped may hold an element that renders the host from its disconnectedCallback.  What that render draws is the list from then on: the next render does not draw a second copy beside it.`, () => {
	let gone = null;
	class Leaving extends HTMLElement {
		disconnectedCallback() {
			if (gone)
				gone();
		}
	}
	customElements.define(uniqueTag(), Leaving);

	for (let between of [true, false]) {
		let el = document.createElement('div');
		document.body.append(el);
		let rows = [1, 2, 3], bad = false;
		let row = id => h`<p key=${id} onclick=${bad && id === 9 ? 'not a function' : () => {}}>${id}</p>`;
		let render = () => between
			? h(el)`<div><b>head</b><hr>${rows.map(row)}<hr><i>tail</i></div>`
			: h(el)`<div>${rows.map(row)}</div>`;
		render();

		// 1. Code outside the template puts such an element in the first row.  Row 9 then
		// throws; the first row had been kept, and taking it out renders the host with rows
		// that are valid.
		el.querySelector('p').append(new Leaving());
		gone = () => {
			gone = null;
			bad = false;
			rows = [1, 7, 8];
			render();
		};
		bad = true;
		rows = [1, 9];
		let threw = false;
		try { render(); } catch (e) { threw = true; }
		assert.eq(threw, true);
		assert.eq(gone, null);

		// 2. The same rows again are drawn once.
		render();
		assert.eq(el.textContent, between ? 'head178tail' : '178', 'between=' + between);
		assert.eq(el.querySelectorAll('p').length, 3);
		el.remove();
	}
});

Testimony.test('Solarite.map.throwingRowOtherRoutes', `Whatever makes a new row throw (a component whose constructor fails, a nested list whose callback throws), and also when rows are being inserted between rows that move, the list is left empty and the next render draws it once.`, () => {

	// Render once with the fault, then twice without it.
	const failThenDraw = (el, render, want) => {
		let threw = false;
		try { render(true); } catch (e) { threw = true; }
		assert.eq(threw, true, want);
		assert.eq(el.textContent, '', want);
		render(false);
		assert.eq(el.textContent, want);
		render(false);
		assert.eq(el.textContent, want);
	};

	// 1. A component inside a row, whose constructor throws.
	let fail = false;
	class Child extends Solarite {
		constructor() {
			super();
			if (fail)
				throw new Error('thrown on purpose by the test');
		}

		render() {
			h(this)`<b>c</b>`
		}
	}
	customElements.define('r-throwing-row-child', Child);
	let el = document.createElement('div');
	let rows = [{id: 1}, {id: 2, child: true}, {id: 3}];
	failThenDraw(el, failing => {
		fail = failing;
		h(el)`<ul>${h.map(rows, r => h`<li key=${r.id}>${r.id}${r.child ? h`<r-throwing-row-child></r-throwing-row-child>` : ''}</li>`)}</ul>`;
	}, '12c3');

	// 2. A list inside a row, whose callback throws.
	el = document.createElement('div');
	rows = [{id: 1, kids: [1, 2]}, {id: 2, kids: [3, 4]}, {id: 3, kids: [5]}];
	failThenDraw(el, failing => {
		h(el)`<ul>${h.map(rows, r => h`<li key=${r.id}>${h.map(r.kids, kid => {
			if (failing && kid === 4)
				throw new Error('thrown on purpose by the test');
			return h`<b>${kid}</b>`;
		})}</li>`)}</ul>`;
	}, '12345');

	// 3. A list that is already drawn, whose rows all move while two new ones arrive between
	// them.  The second new row to be created throws, after the first is already in place.
	el = document.createElement('div');
	let a = {id: 1}, b = {id: 2}, c = {id: 3}, d = {id: 4};
	rows = [a, b, c, d];
	let bad = 0;
	let render = () => h(el)`<ul>${h.map(rows, r => h`<li key=${r.id} onclick=${r.id === bad ? 'not a function' : () => {}}>${r.id}</li>`)}</ul>`;
	render();
	rows = [d, {id: 9}, c, {id: 8}, b, a];
	failThenDraw(el, failing => {
		bad = failing ? 9 : 0;
		render();
	}, '493821');
});

Testimony.test('Solarite.map.keyedRowNotPooledBehindString', `A keyed row removed from a list whose first row is a plain string, or a row without a key, is discarded whichever way the removal is settled, so a new key never gets its element.`, () => {
	// Whether a list is keyed is decided by its first row, so these lists are not.  A removal
	// that is one run of adjacent rows is settled by removeRun() and any other by the positional
	// diff, and each of the two has its own place where a removed row is pooled or discarded.
	for (let first of ['string', 'unkeyed'])
		for (let runs of [1, 2]) {
			let el = document.createElement('div');
			let head = first === 'string' ? 'head' : {title: 'head'};
			let mid = first === 'string' ? 'mid' : {title: 'mid'};
			let row = r => typeof r === 'string' ? r : r.title ? h`<h3>${r.title}</h3>` : h`<p key=${r.id}>${r.id}</p>`;
			let items = runs === 1 ? [head, {id: 1}, {id: 2}, {id: 3}] : [head, {id: 1}, mid, {id: 2}];
			let render = () => h(el)`<div>${h.map(items, row)}</div>`;
			render();
			let before = [...el.querySelectorAll('p')];

			// Every keyed row goes: as one run, or as two with a row that stays between them.
			items = runs === 1 ? [head] : [head, mid];
			render();
			assert.eq(el.querySelectorAll('p').length, 0);

			items = [...items, {id: 7}, {id: 8}];
			render();
			let after = [...el.querySelectorAll('p')];
			assert.eq(el.textContent, runs === 1 ? 'head78' : 'headmid78');
			assert.eq(after.some(p => before.includes(p)), false, first + ' row first, removed in ' + runs + ' run(s)');
		}
});

Testimony.test('Solarite.map.keyedListKeepsStringRows', `A row of a keyed list that is a plain string keeps its text node while rows are added before it, after it, or between it and the next string, whether the list is an h.map() or an array.`, () => {
	for (let mapped of [true, false]) {
		let el = document.createElement('div');
		let rows = [{id: 1}, {sep: ' | '}, {id: 2}, {sep: ' / '}, {id: 3}];
		let row = r => r.sep ? r.sep : h`<b key=${r.id}>${r.id}</b>`;
		let render = () => h(el)`<p>${mapped ? h.map(rows, row) : rows.map(row)}</p>`;
		render();
		let p = el.firstElementChild;
		let before = [...p.childNodes].filter(n => n.nodeType === 3);
		assert.eq(before.length, 2);

		// Which of the first render's text nodes shows each string row now; -1 is a new node.
		let kept = () => [...p.childNodes].filter(n => n.nodeType === 3).map(n => before.indexOf(n)).join();

		rows.push({id: 4}); // Both strings are before the new row.
		render();
		assert.eq(p.textContent, '1 | 2 / 34');
		assert.eq(kept(), '0,1', 'append, mapped=' + mapped);

		rows.unshift({id: 0}); // Both are after it.
		render();
		assert.eq(p.textContent, '01 | 2 / 34');
		assert.eq(kept(), '0,1', 'prepend, mapped=' + mapped);

		rows.splice(4, 0, {id: 9}); // One on each side.
		render();
		assert.eq(p.textContent, '01 | 29 / 34');
		assert.eq(kept(), '0,1', 'insert, mapped=' + mapped);
	}
});

Testimony.test('Solarite.map.rawNodeRowReturns', `A raw DOM node that is a row's child is shown again when its item returns to an unkeyed list, whichever row showed the node in between.`, () => {
	const item = text => ({node: Object.assign(document.createElement('span'), {textContent: text})});
	const html = rows => rows.map(r => '<p><i>' + r.node.outerHTML + '</i></p>').join('');
	const row = r => h`<p><i>${r.node}</i></p>`;
	const deepRow = r => h`<p>${h`<i>${r.node}</i>`}</p>`; // The node sits one template below the row.

	for (let list of [rows => h.map(rows, row), rows => rows.map(row), rows => h.map(rows, deepRow)]) {
		let a = item('A'), b = item('B'), c = item('C');
		let el = document.createElement('div');
		const show = rows => {
			h(el)`<div>${list(rows)}</div>`;
			assert.eq(el.firstElementChild.innerHTML, html(rows));
		};

		// 1. An unkeyed list is rewritten by position, so when a and c leave it is the first row
		// that shows b, and b's node moves into it.  The row b was drawn in is removed without
		// its node, and must not be the row b is shown in when it comes back.
		show([a, b, c]);
		show([b]);
		show([]);
		show([b]);

		// 2. The same when the row is removed on its own first and loses its node afterwards.
		show([a, b, c]);
		show([a, c]);
		show([a, b]);
		show([a]);
		show([a, b]);
	}

	// 3. An item that moves to another list and back, as a card dragged between two columns does.
	let a = item('A'), b = item('B'), c = item('C');
	let el = document.createElement('div');
	const show = (left, right) => {
		h(el)`<div><ul>${h.map(left, row)}</ul><ol>${h.map(right, row)}</ol></div>`;
		assert.eq(el.firstElementChild.innerHTML, '<ul>' + html(left) + '</ul><ol>' + html(right) + '</ol>');
	};
	show([a, b], [c]);
	show([a], [c, b]);
	show([a, b], [c]);
});

Testimony.test('Solarite.map.rawNodeRowsFuzz', `Unkeyed rows that each hold a raw DOM node show every item's node through random selections and reorderings of the same items, as filtering a list makes.`, () => {
	const row = r => h`<p><i>${r.node}</i></p>`;
	const deepRow = r => h`<p>${h`<i>${r.node}</i>`}</p>`;
	for (let list of [rows => h.map(rows, row), rows => rows.map(row), rows => h.map(rows, deepRow)])
		for (let start of [11, 12345, 987654]) {

			// The deterministic generator Solarite.map.fuzz uses, which explains its two details.
			let seed = start;
			const rnd = n => {
				seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
				return (seed >>> 8) % n;
			};
			let el = document.createElement('div');
			let all = ['A', 'B', 'C', 'D', 'E', 'F'].map(text => ({node: Object.assign(document.createElement('span'), {textContent: text})}));
			for (let step=0; step<200; step++) {

				// A random selection of the items, one time in three in a random order.  Drawing
				// from so few items is what makes a removed row meet its own item again.
				let rows = all.filter(() => rnd(2) === 1);
				if (rnd(3) === 0)
					for (let i=rows.length-1; i>0; i--) {
						let j = rnd(i + 1), t = rows[i];
						rows[i] = rows[j];
						rows[j] = t;
					}
				h(el)`<div>${list(rows)}</div>`;
				assert.eq(el.firstElementChild.innerHTML, rows.map(r => '<p><i>' + r.node.outerHTML + '</i></p>').join(''),
					'seed ' + start + ' step ' + step);
			}
		}
});

Testimony.test('Solarite.map.textRowsThenPrimitive', `A list of text rows, replaced by plain text and then drawn again from the same items, shows the rows again.`, () => {
	let el = document.createElement('div');
	let rows = [{label: 'A'}];
	let render = list => h(el)`<div>${list ? h.map(rows, r => r.label) : 'hello'}</div>`;
	render(true);
	assert.eq(el.textContent, 'A');
	render(false);
	assert.eq(el.textContent, 'hello');
	render(true);
	assert.eq(el.textContent, 'A');
});

Testimony.test('Solarite.map.textRowsFuzz', `h.map() rows that are plain strings survive random insertions, removals, returns of removed items, moves and edits.`, () => {
	for (let start of [11, 12345, 987654]) {

		// The deterministic generator Solarite.map.fuzz uses, which explains its two details.
		let seed = start;
		const rnd = n => {
			seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
			return (seed >>> 8) % n;
		};
		let el = document.createElement('div');
		let id = 0;
		const mk = () => ({label: 'L' + (++id)});
		let rows = [], graveyard = [];
		let render = () => h(el)`<div>${h.map(rows, r => r.label + ';')}</div>`;
		for (let step=0; step<600; step++) {
			let op = rnd(7);
			if (op === 0 || rows.length === 0) // Insert a few.
				for (let k=1+rnd(3); k>0; k--)
					rows.splice(rnd(rows.length + 1), 0, mk());
			else if (op === 1) // Remove a run.
				graveyard.push(...rows.splice(rnd(rows.length), 1 + rnd(3)));
			else if (op === 2) // Bring removed items back, the same objects.
				for (let k=Math.min(graveyard.length, 1+rnd(3)); k>0; k--)
					rows.splice(rnd(rows.length + 1), 0, graveyard.splice(rnd(graveyard.length), 1)[0]);
			else if (op === 3) { // Swap two.
				let i = rnd(rows.length), j = rnd(rows.length), t = rows[i];
				rows[i] = rows[j];
				rows[j] = t;
			}
			else if (op === 4) { // Replace one with a changed copy.
				let i = rnd(rows.length);
				rows[i] = {label: rows[i].label + '!'};
			}
			else if (op === 5) // Reverse.
				rows.reverse();
			else { // Remove one and put a new row in the hole.
				let i = rnd(rows.length);
				graveyard.push(rows[i]);
				rows[i] = mk();
			}
			if (graveyard.length > 30)
				graveyard.splice(0, 15);
			render();
			assert.eq(el.textContent, rows.map(r => r.label + ';').join(''), 'seed ' + start + ' step ' + step + ' op ' + op);
		}
	}
});

Testimony.test('Solarite.map.throwingCallbackLeavesDomUntouched', `An h.map() callback that throws while a list is first drawn leaves the list's parent in place and empty, and the next render draws it cleanly.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [], bad = true;
	for (let i = 0; i < 600; i++)
		rows.push({id: i});
	let render = () => h(el)`<ul>${h.map(rows, r => { if (bad && (r.id === 2 || r.id === 300)) throw new Error('boom'); return h`<li key=${r.id}>${r.id}</li>`; })}</ul><footer></footer>`;
	let threw = false;
	try { render(); } catch (e) { threw = true; }
	assert.eq(threw, true);
	assert.eq(el.querySelector('ul') !== null, true);
	assert.eq(el.querySelectorAll('li').length, 0);
	bad = false;
	render();
	assert.eq(el.querySelectorAll('li').length, 600);
	assert.eq(el.querySelector('li').textContent, '0');
	el.remove();
});


/**
 * Build a 50-row table bound to a selector, for the tests below.
 * @param tag {string} A unique custom element name.
 * @param rowCount {int}
 * @return {HTMLElement} */
function selectorTable(tag, rowCount=50) {
	class A extends Solarite {
		rows = [];
		sel = h.selector();
		renders = 0;

		render() {
			this.renders++;
			h(this)`<div>${h.map(this.rows, row =>
				h`<p key=${row.id} class=${this.sel.when(row.id, 'danger')}>${row.label}</p>`)}</div>`
		}
	}
	customElements.define(tag, A);
	let a = new A();
	for (let i=1; i<=rowCount; i++)
		a.rows.push({id: i, label: 'r' + i});
	document.body.append(a);
	a.render();
	return a;
}

Testimony.test('Solarite.selector.initialKey', `A selector starts with the key it is given, or with none`, () => {
	assert.eq(h.selector().key, null);
	assert.eq(h.selector(undefined).key, null);
	assert.eq(h.selector(5).key, 5);
	assert.eq(h.selector(0).key, 0);
});

Testimony.test('Solarite.selector.basic', `A selector writes only the two rows that change, with no render`, () => {
	let a = selectorTable('r-940');
	let ps = [...a.querySelectorAll('p')];
	let rendersBefore = a.renders;

	// Nothing selected yet, so no row carries the attribute at all.
	assert.eq(a.querySelectorAll('[class]').length, 0);
	assert.eq(a.sel.key, null);

	a.sel.set(10);
	assert.eq(a.sel.key, 10);
	assert.eq(ps[9].getAttribute('class'), 'danger');
	assert.eq(a.querySelectorAll('[class]').length, 1);
	assert.eq(a.renders, rendersBefore); // The whole point: no re-render.

	// Moving the selection clears the old row and sets the new one.
	a.sel.set(20);
	assert.eq(ps[9].hasAttribute('class'), false);
	assert.eq(ps[19].getAttribute('class'), 'danger');
	assert.eq(a.querySelectorAll('[class]').length, 1);

	// Deselecting leaves nothing behind.
	a.sel.set(null);
	assert.eq(a.querySelectorAll('[class]').length, 0);
	assert.eq(a.renders, rendersBefore);
	a.remove();
});

Testimony.test('Solarite.selector.noEmptyAttribute', `An unselected row has no attribute, not an empty one`, () => {
	let a = selectorTable('r-941', 3);
	// key= is consumed for diffing and never reaches the DOM, so this is exactly the markup a
	// hand-written implementation would produce — no empty class= on the unselected rows.
	assert.eq(a.querySelector('div').innerHTML, '<p>r1</p><p>r2</p><p>r3</p>');

	a.sel.set(2);
	assert.eq(a.querySelector('div').innerHTML, '<p>r1</p><p class="danger">r2</p><p>r3</p>');

	a.sel.set(null);
	assert.eq(a.querySelector('div').innerHTML, '<p>r1</p><p>r2</p><p>r3</p>');
	a.remove();
});

Testimony.test('Solarite.selector.survivesRender', `Selection survives a re-render and follows a moved row`, () => {
	let a = selectorTable('r-942', 10);
	a.sel.set(4);
	let p4 = a.querySelectorAll('p')[3];
	assert.eq(p4.getAttribute('class'), 'danger');

	// A re-render that changes nothing must leave the selection alone.
	a.render();
	assert.eq(a.querySelectorAll('p')[3], p4);
	assert.eq(p4.getAttribute('class'), 'danger');

	// Reordering moves the row's node; the highlight rides along with it.
	a.rows.reverse();
	a.render();
	let ps = [...a.querySelectorAll('p')];
	assert.eq(ps[6], p4);
	assert.eq(ps[6].getAttribute('class'), 'danger');
	assert.eq(a.querySelectorAll('[class]').length, 1);

	// And the selection can still be moved afterwards.
	a.sel.set(9);
	assert.eq(p4.hasAttribute('class'), false);
	assert.eq(ps[1].getAttribute('class'), 'danger');
	a.remove();
});

Testimony.test('Solarite.selector.rowRemoved', `Removing the selected row leaves no stale binding`, () => {
	let a = selectorTable('r-943', 10);
	a.sel.set(5);
	let p5 = a.querySelectorAll('p')[4];

	a.rows.splice(4, 1);
	a.render();
	assert.eq(a.querySelectorAll('p').length, 9);
	assert.eq(a.querySelectorAll('[class]').length, 0);

	// Selecting a still-present row must not resurrect the removed one.
	a.sel.set(6);
	assert.eq(a.querySelectorAll('p')[4].getAttribute('class'), 'danger');
	assert.eq(a.querySelectorAll('[class]').length, 1);
	assert.eq(p5.isConnected, false);
	a.remove();
});

Testimony.test('Solarite.selector.newRowsAdopt', `A row rendered while its key is selected comes up highlighted`, () => {
	let a = selectorTable('r-944', 3);

	// Select a key that has no row yet.
	a.sel.set(7);
	assert.eq(a.querySelectorAll('[class]').length, 0);

	a.rows.push({id: 7, label: 'r7'});
	a.render();
	assert.eq(a.querySelectorAll('p')[3].getAttribute('class'), 'danger');
	assert.eq(a.querySelectorAll('[class]').length, 1);
	a.remove();
});

Testimony.test('Solarite.selector.refIdentity', `when() returns one of two singletons, so a row's expression changes identity exactly when its selectedness does`, () => {
	let sel = h.selector();

	// Every unselected key shares one object, so an unchanged row compares equal on a
	// re-render and skips the write.  Allocating nothing per key is what makes a selector
	// free to draw.
	let off = sel.when(3, 'danger');
	assert.eq(sel.when(3, 'danger'), off);
	assert.eq(sel.when(4, 'danger'), off);
	assert.eq(off.value(), '');

	// Selecting 3 hands key 3 the other singleton, and only key 3.
	sel.set(3);
	let on = sel.when(3, 'danger');
	assert(on !== off);
	assert.eq(on.value(), 'danger');
	assert.eq(sel.when(4, 'danger'), off);
	assert.eq(off.value(), '');

	// The two singletons are stable across selections, not rebuilt each time.
	sel.set(4);
	assert.eq(sel.when(4, 'danger'), on);
	assert.eq(sel.when(3, 'danger'), off);
});

Testimony.test('Solarite.selector.onOffValues', `on and off can be any values, not just class names`, () => {
	class A extends Solarite {
		rows = [{id:1},{id:2}];
		sel = h.selector(2);
		render() {
			h(this)`<div>${h.map(this.rows, row =>
				h`<p key=${row.id} title=${this.sel.when(row.id, 'yes', 'no')}></p>`)}</div>`
		}
	}
	customElements.define('r-945', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(a.querySelector('div').innerHTML, '<p title="no"></p><p title="yes"></p>');

	a.sel.set(1);
	assert.eq(a.querySelector('div').innerHTML, '<p title="yes"></p><p title="no"></p>');
	a.remove();
});

Testimony.test('Solarite.selector.keyReuse', `A node reused under a new key stops answering to the old one`, () => {
	// The list shrinks to a single row carrying a key that has never been rendered.  Whatever
	// the reconciler does with the old elements, the vanished key must stop reaching a row.
	class A extends Solarite {
		rows = [{id:1},{id:2},{id:3}];
		sel = h.selector();
		render() {
			h(this)`<div>${h.map(this.rows, row =>
				h`<p key=${row.id} class=${this.sel.when(row.id, 'danger')}>${row.id + ''}</p>`)}</div>`
		}
	}
	customElements.define('r-946', A);
	let a = new A();
	document.body.append(a);
	a.render();

	a.rows = [{id:9}];
	a.render();
	assert.eq(a.querySelectorAll('p').length, 1);

	// Key 1 used to own that first <p>.  Selecting it must not highlight the row now showing 9.
	a.sel.set(1);
	assert.eq(a.querySelectorAll('[class]').length, 0);

	a.sel.set(9);
	assert.eq(a.querySelector('p').getAttribute('class'), 'danger');
	a.remove();
});

Testimony.test('Solarite.selector.noPerRowState', `A selector accumulates nothing as rows come and go`, () => {
	let a = selectorTable('r-947', 0);

	// A selector's whole state is two singletons plus the attribute name and the list it was
	// rendered into.  Nothing here is per key, so there is nothing that could grow with the
	// number of rows drawn and nothing that could pin a removed row's element in memory.
	// Capture the shape while the list is empty, then again after 800 rows have come and gone.
	let shape = sel => Object.getOwnPropertyNames(sel).sort().join(',');
	let before = shape(a.sel);

	// Fill and empty the list many times with fresh ids, selecting each round so set() runs.
	let id = 1;
	for (let round=0; round<40; round++) {
		a.rows = [];
		for (let i=0; i<20; i++)
			a.rows.push({id: id++, label: 'r'});
		a.render();
		a.sel.set(id - 1);
		a.rows = [];
		a.render();
	}
	a.sel.set(null);

	assert.eq(shape(a.sel), before);
	for (let name of Object.getOwnPropertyNames(a.sel)) {
		let v = a.sel[name];
		assert(!(v instanceof Map) && !(v instanceof Set) && !Array.isArray(v),
			`selector field ${name} is a collection, so it can accumulate per-row state`);
	}

	// And it still works afterwards.
	a.rows = [{id: 99999, label: 'x'}];
	a.render();
	a.sel.set(99999);
	assert.eq(a.querySelector('p').getAttribute('class'), 'danger');
	a.remove();
});

Testimony.test('Solarite.selector.needsKeys', `set() on an unkeyed list says so instead of doing nothing`, () => {
	// set() finds a row by its key, so a list with no key=${...} can never be reached.  Saying
	// so is much kinder than silently leaving the highlight where it was.
	class A extends Solarite {
		rows = [{id:1},{id:2}];
		sel = h.selector();
		render() {
			h(this)`<div>${h.map(this.rows, row =>
				h`<p class=${this.sel.when(row.id, 'danger')}>${row.id + ''}</p>`)}</div>`
		}
	}
	customElements.define('r-949', A);
	let a = new A();
	document.body.append(a);
	a.render();

	assert.throws(() => a.sel.set(1), 'keyed');
	a.remove();
});

Testimony.test('Solarite.selector.deselect', `set(null) clears the highlight without a render`, () => {
	let a = selectorTable('r-948', 5);
	let rendersBefore = a.renders;
	a.sel.set(3);
	assert.eq(a.querySelectorAll('[class]').length, 1);

	a.sel.set(null);
	assert.eq(a.sel.key, null);
	assert.eq(a.querySelectorAll('[class]').length, 0);
	assert.eq(a.renders, rendersBefore);

	// The bindings survive deselection, so reselecting still reaches the row without a render.
	a.sel.set(3);
	assert.eq(a.querySelectorAll('p')[2].getAttribute('class'), 'danger');
	assert.eq(a.renders, rendersBefore);
	a.remove();
});

Testimony.test('Solarite.selector.notOnRowRoot', `A selector below the row's root element says so instead of writing the wrong node`, () => {
	// set() reaches a row through its key and writes the row's own root element, so an
	// attribute on a descendant would be read here and written somewhere else later.
	let sel = h.selector();
	let div = document.createElement('div');
	assert.throws(() => h(div)`<div>${h.map([{id:1}, {id:2}], row =>
		h`<p key=${row.id}><span class=${sel.when(row.id, 'danger')}></span></p>`)}</div>`, 'root element');
});

Testimony.test('Solarite.selector.badPlacement', `A selector outside a whole attribute value throws a clear error`, () => {
	let sel = h.selector();

	// As element content.
	assert.throws(() => h(document.createElement('div'))`<p>${sel.when(1, 'x')}</p>`);

	// Inside a multi-part attribute value.
	assert.throws(() => h(document.createElement('div'))`<p class="row ${sel.when(1, 'x')}"></p>`);
});

Testimony.test('Solarite.attrib.unquotedValue', `An unquoted attribute value doesn't swallow the tag's closing >`, () => {
	// The template tokenizer used to treat an unquoted attribute value as running until the next
	// quote, so a one-character value put the '>' inside it: `<td colspan=2>` left the parser
	// still inside the tag, and the expression that followed could not be placed.  That threw
	// "bad html or duplicate attrib" on ordinary, valid HTML.  A longer value happened
	// to work, and `colspan=${x}` worked too because the chunk boundary landed right after the
	// '=', which is why this survived so long.
	let el = document.createElement('div');
	h(el)`<table><tr><td colspan=2>${'hello'}</td></tr></table>`;
	assert.eq(el.querySelector('td').getAttribute('colspan'), '2');
	assert.eq(el.querySelector('td').textContent, 'hello');

	// Several unquoted values in one tag, and one followed by a bare attribute.
	let el2 = document.createElement('div');
	h(el2)`<div id=a class=b hidden>${'x'}</div>`;
	assert.eq(el2.querySelector('div').id, 'a');
	assert.eq(el2.querySelector('div').className, 'b');
	assert.eq(el2.querySelector('div').hasAttribute('hidden'), true);
	assert.eq(el2.querySelector('div').textContent, 'x');

	// A '>' inside a QUOTED value must still not end the tag.
	let el3 = document.createElement('div');
	h(el3)`<div title="a>b">${'y'}</div>`;
	assert.eq(el3.querySelector('div').getAttribute('title'), 'a>b');
	assert.eq(el3.querySelector('div').textContent, 'y');
});

Testimony.test('Solarite.loop.paragraphs', () => {
	class A extends Solarite {
		fruits = ['Apple', 'Banana'];

		render() {
			h(this)`${this.fruits.map(fruit => h`<p>${fruit}</p>`)}`
		}
	}
	customElements.define('r-210', A);
	let a = new A();

	a.render();

	assert.eq(getHtml(a), '<r-210><p>Apple</p><p>Banana</p></r-210>');

	a.fruits.push('Cherry');
	a.render();
	assert.eq(getHtml(a), '<r-210><p>Apple</p><p>Banana</p><p>Cherry</p></r-210>');

	a.fruits.pop();
	a.render();
	assert.eq(getHtml(a), '<r-210><p>Apple</p><p>Banana</p></r-210>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-210><p>Banana</p></r-210>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-210></r-210>');

	a.fruits.push('Apple');
	a.render();
	assert.eq(getHtml(a), '<r-210><p>Apple</p></r-210>');

	a.remove();
});

Testimony.test('Solarite.loop.paragraphsBefore', `Same as above, but with another element afterward.`, () => {
	class A extends Solarite {
		fruits = ['Apple', 'Banana'];

		render() {
			h(this)`${this.fruits.map(fruit => h`<p>${fruit}</p>`)}<hr>`
		}
	}
	customElements.define('r-212', A);
	let a = new A();
	document.body.append(a);

	assert.eq(getHtml(a), '<r-212><p>Apple</p><p>Banana</p><hr></r-212>');

	a.fruits.push('Cherry');
	a.render();
	assert.eq(getHtml(a), '<r-212><p>Apple</p><p>Banana</p><p>Cherry</p><hr></r-212>');

	a.fruits.pop();
	a.render();
	assert.eq(getHtml(a), '<r-212><p>Apple</p><p>Banana</p><hr></r-212>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-212><p>Banana</p><hr></r-212>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-212><hr></r-212>');

	a.fruits.push('Apple');
	a.render();
	assert.eq(getHtml(a), '<r-212><p>Apple</p><hr></r-212>');

	a.remove();
});

Testimony.test('Solarite.loop.continuity', `Make sure elements are reused in a consistent way.`, () => {
	class A extends Solarite {
		fruits = ['Apple', 'Banana'];

		render() {
			h(this)`${this.fruits.map(fruit => h`<p>${fruit}</p>`)}`
		}
	}
	customElements.define('a-213', A);
	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), '<a-213><p>Apple</p><p>Banana</p></a-213>');

	let apple = a.children[0];
	let banana = a.children[1];
	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<a-213><p>Banana</p></a-213>');
	assert.eq(a.children[0], banana);

	a.fruits.pop();
	a.render();
	assert.eq(getHtml(a), '<a-213></a-213>');

	// We get back the same element.
	a.fruits.push('Apple');
	a.render();
	assert.eq(getHtml(a), '<a-213><p>Apple</p></a-213>');
	assert.eq(a.children[0], apple);


	a.fruits.push('Banana');
	a.render();
	assert.eq(getHtml(a), '<a-213><p>Apple</p><p>Banana</p></a-213>');
	assert.eq(a.children[0], apple);
	assert.eq(a.children[1], banana);

	// Make sure we maintain continuity after adding to the beginning.
	a.fruits.unshift('Cherry');
	a.render();
	assert.eq(getHtml(a), '<a-213><p>Cherry</p><p>Apple</p><p>Banana</p></a-213>');
	assert.eq(a.children[1], apple);
	assert.eq(a.children[2], banana);

	a.remove();
});

Testimony.test('Solarite.loop.continuity2', `Identical items`, () => {

	class A214 extends Solarite {
		constructor(items=[]) {
			super();
			this.items = items;
		}

		render() {
			h(this)`
			<a-214>
				${this.items.map(item => h`
					<div>${item}</div>
				`)}
				<button onclick=${this.render}>Render</button>
			</a-214>`
		}
	}
	let a = new A214(['apple', 'apple', 'apple']);
	document.body.append(a);

	let apple1 = a.children[0];
	let apple2 = a.children[1];

	// Remove an item, to make sure rendering prefers NodeGroups that are already attached.
	// An older version of the code would juggle on each render and preferably attached the previously detached node.
	a.items.splice(1, 1);

	a.render();
	assert.eq(apple1, a.children[0]);
	assert.eq(apple2, a.children[1]);

	a.render();
	assert.eq(apple1, a.children[0]);
	assert.eq(apple2, a.children[1]);

	a.remove();
});

Testimony.test('Solarite.loop.zeroExprReuse', `A pooled zero-expression, multi-root item (no paths, not stampable) must rewrite without crashing when reused.`, () => {

	class A extends Solarite {
		loading = true;
		items = ['a', 'b'];

		render() {
			h(this)`<div>${this.loading
				? h`<b>Loading…</b><i>wait</i>`
				: this.items.map(t => h`<span>${t}</span>`)}</div>`
		}
	}
	customElements.define('r-zero-expr-reuse', A);
	let a = new A();
	a.render();
	assert.eq(getHtml(a), '<r-zero-expr-reuse><div><b>Loading…</b><i>wait</i></div></r-zero-expr-reuse>');

	// Switch away so the zero-expression group is detached to the reuse pool.
	a.loading = false;
	a.render();
	assert.eq(getHtml(a), '<r-zero-expr-reuse><div><span>a</span><span>b</span></div></r-zero-expr-reuse>');

	// Switch back: the pooled group is reused and rewritten in place.
	a.loading = true;
	a.render();
	assert.eq(getHtml(a), '<r-zero-expr-reuse><div><b>Loading…</b><i>wait</i></div></r-zero-expr-reuse>');

	a.remove();
});

Testimony.test('Solarite.loop.multiNodeRowsAfterRawNodes', `Rows of several nodes that were taken out while raw DOM nodes stood in their place come back whole when rows of their kind are drawn again, whether the list is then drawn beside a raw node or as plain rows.`, () => {
	for (let besideNode of [true, false]) {
		let el = document.createElement('div');
		let node = document.createElement('u');
		let row = id => h`<dt>${id}</dt>-<dd>${id}</dd>`;
		let content = [1, 2, 3].map(row);
		let render = () => h(el)`<dl><b>head</b>${content}<i>tail</i></dl>`;
		render();
		assert.eq(el.textContent, 'head1-12-23-3tail');

		// 1. A raw node replaces the rows, which are kept for reuse.
		content = [node];
		render();
		assert.eq(el.textContent, 'headtail');

		// 2. Rows again: next to the node, or after plain text has stood there in between.
		if (besideNode)
			content = [node, row(4), row(5)];
		else {
			content = 'plain';
			render();
			assert.eq(el.textContent, 'headplaintail');
			content = [4, 5].map(row);
		}
		render();
		assert.eq(el.textContent, 'head4-45-5tail', 'besideNode=' + besideNode);
		assert.eq(el.querySelectorAll('dt').length, 2);
		assert.eq(el.querySelectorAll('dd').length, 2);
	}
});

Testimony.test('Solarite.loop.throwingRowBesideRawNode', `A row that throws in a list that also holds a raw DOM node leaves the rows that were shown as the list.  The renders after it draw every row whole and in its place.`, () => {
	for (let between of [true, false]) {
		let el = document.createElement('div');
		let node = document.createElement('u');
		let bad = 0;
		let row = id => h`<dt onclick=${id === bad ? 'not a function' : () => {}}>${id}</dt><dd>${id}</dd>`;
		let content = [node, row(1), row(2), row(3)];
		let render = () => between ? h(el)`<dl><b>head</b>${content}<i>tail</i></dl>` : h(el)`<dl>${content}</dl>`;
		const text = ids => (between ? 'head' : '') + ids.map(id => '' + id + id).join('') + (between ? 'tail' : '');
		render();
		assert.eq(el.textContent, text([1, 2, 3]));

		// 1. The second row throws while it is rewritten.  The three rows stay where they were.
		bad = 2;
		content = [node, row(1), row(2), row(3)];
		let threw = false;
		try { render(); } catch (e) { threw = true; }
		assert.eq(threw, true);
		assert.eq(el.textContent, text([1, 2, 3]), 'between=' + between);

		// 2. The node alone, then rows again: none of them comes back in pieces.
		bad = 0;
		content = [node];
		render();
		assert.eq(el.textContent, text([]));
		content = [node, row(5), row(6), row(7)];
		render();
		assert.eq(el.textContent, text([5, 6, 7]), 'between=' + between);
		assert.eq(el.querySelectorAll('dd').length, 3);
		content = [5, 6, 7, 8].map(row);
		render();
		assert.eq(el.textContent, text([5, 6, 7, 8]), 'between=' + between);
		assert.eq(el.querySelectorAll('dt, dd').length, 8);
	}
});

Testimony.test('Solarite.loop.rawNodeSwitch', `A raw DOM node shown by one of two templates is in place again each time the expression switches back to that template.`, () => {
	const span = text => Object.assign(document.createElement('span'), {textContent: text});
	let node = span('N'), other = span('O');
	let el = document.createElement('div');
	const inner = () => el.firstElementChild.innerHTML;

	// 1. The same node in either of two templates.
	let render = first => h(el)`<div>${first ? h`<p>${node}</p>` : h`<b>${node}</b>`}</div>`;
	for (let i=0; i<2; i++) {
		render(true);
		assert.eq(inner(), '<p><span>N</span></p>');
		render(false);
		assert.eq(inner(), '<b><span>N</span></b>');
	}

	// 2. One of the templates holds the node a template deeper, beside another raw node.
	el = document.createElement('div');
	render = first => h(el)`<div>${first ? h`<p>${[other, h`<i>${node}</i>`]}</p>` : h`<b>${node}</b>`}</div>`;
	for (let i=0; i<2; i++) {
		render(true);
		assert.eq(inner(), '<p><span>O</span><i><span>N</span></i></p>');
		render(false);
		assert.eq(inner(), '<b><span>N</span></b>');
	}

	// 3. Templates that hold nodes, in an array beside a raw node.  Such an array is reconciled
	// by node identity rather than by position, and keeps the templates it stopped showing in
	// a pool of its own.
	el = document.createElement('div');
	let a = span('A'), b = span('B');
	const p = n => h`<p>${n}</p>`; // One template site, so the rows share a shell.
	const show = (items, expected) => {
		h(el)`<div>${items}</div>`;
		assert.eq(inner(), expected);
	};
	show([p(a), p(b), other], '<p><span>A</span></p><p><span>B</span></p><span>O</span>');
	show([p(b), other], '<p><span>B</span></p><span>O</span>');
	show([other], '<span>O</span>');
	show([p(b), other], '<p><span>B</span></p><span>O</span>');
	show([p(a), p(b), other], '<p><span>A</span></p><p><span>B</span></p><span>O</span>');
});

Testimony.test('Solarite.loop.rawNodeMovesToAnotherPlace', `A raw DOM node that moves from one expression to another under the same parent element is shown in its new place.`, () => {
	// The place that gives the node up can be written after the place that takes it, and its
	// list of the nodes it drew last time still names the node then.  It used to remove the
	// node from the parent, although the node stood in its new place already.
	const clean = html => html.replace(/<!--.*?-->/g, '');
	const html = v => [v].flat().map(item => item?.nodeType ? item.outerHTML || item.nodeValue : (item || '')).join('');
	let node = document.createElement('hr'), other = document.createElement('b');

	// 1. Between two expressions of one template, in both directions and drawn again unchanged:
	// in an element, as children of the render root, and in a shadow root.
	for (let where of ['element', 'root', 'shadow']) {
		let el = document.createElement('div');
		let root = where === 'shadow' ? el.attachShadow({mode: 'open'}) : el;
		let render = (a, b) => where === 'root' ? h(root)`${a}|${b}` : h(root)`<div>${a}|${b}</div>`;
		for (let [a, b] of [[node, 'x'], ['x', node], ['x', node], [node, 'x'], [node, 'x'], ['x', node], [null, null], [null, node], [node, null]]) {
			render(a, b);
			assert.eq(clean((where === 'root' ? root : root.firstElementChild).innerHTML), html(a) + '|' + html(b), where);
		}
	}

	// 2. Through three places, and given by a function or inside an array.
	let el = document.createElement('div');
	for (let at of [0, 1, 2, 1, 0, 2, 0, 2, 2, 1]) {
		let v = ['a', 'b', 'c'];
		v[at] = node;
		h(el)`<div>${v[0]}|${() => v[1]}|${[[v[2]]]}</div>`;
		assert.eq(clean(el.firstElementChild.innerHTML), v.map(html).join('|'));
	}

	// 3. Between two lists, when the list that gives the node up has other nodes to remove,
	// and when it becomes empty.
	el = document.createElement('div');
	let steps = [
		[[other, node, h`<i>1</i>`], 'x', '<b></b><hr><i>1</i>|x'], [['y'], [node, 'x'], 'y|<hr>x'], [[node, other], null, '<hr><b></b>|'],
		[[other], [h`<i>2</i>`, node], '<b></b>|<i>2</i><hr>'], [[other], [h`<i>2</i>`, node], '<b></b>|<i>2</i><hr>'],
		[[node, other], [h`<i>2</i>`], '<hr><b></b>|<i>2</i>'], [[], [other, node], '|<b></b><hr>'], [[node], [other], '<hr>|<b></b>']
	];
	for (let [a, b, expected] of steps) {
		h(el)`<div>${a}|${b}</div>`;
		assert.eq(clean(el.firstElementChild.innerHTML), expected);
	}

	// 4. A text node, and several nodes changing sides at once, between siblings.
	el = document.createElement('div');
	let text = document.createTextNode('N'), bold = Object.assign(document.createElement('b'), {textContent: 'M'});
	for (let [a, b] of [[[text, bold], []], [[bold], [text]], [[], [text, bold]], [[text], [bold]], [[bold, text], 'x'], ['x', [bold, text]], [bold, text], [text, bold]]) {
		h(el)`<div><i>h</i>${a}<i>m</i>${b}<i>t</i></div>`;
		assert.eq(clean(el.firstElementChild.innerHTML), '<i>h</i>' + html(a) + '<i>m</i>' + html(b) + '<i>t</i>');
	}
});

Testimony.test('Solarite.loop.rawNodeMovesBetweenRows', `A raw DOM node that moves between rows which have no element of their own, or between such a row and an expression beside the list, is shown in its new place.`, () => {
	// A row without an element of its own puts the nodes of its expressions among the nodes of
	// the list, so the row, the list and every expression in them have one parent element.
	const clean = el => el.firstElementChild.innerHTML.replace(/<!--.*?-->/g, '');
	const html = v => v?.nodeType ? v.outerHTML : (v || '');
	let node = document.createElement('hr'), other = document.createElement('b');

	// 1. From row to row, in an array and in h.map(), with rows coming and going.
	for (let mapped of [false, true]) {
		let el = document.createElement('div');
		const row = r => h`${r[0]}${r[1]}`;
		let steps = [
			[['p', 'q'], [node, 'r']], [[node, 'r'], ['p', 'q']], [['p', 'q'], [node, 'r']], [['p', node], ['s', 'r']], [['p', 'q'], ['s', node]],
			[[node, 'q'], ['s', 't']], [['u', 'q'], ['s', 't'], [node, 'w']], [['u', node]], [['u', 'v'], [node, 'w']], [[node, 'w']], [], [['p', node], ['s', 'r']]
		];
		for (let rows of steps) {
			h(el)`<div>${mapped ? h.map(rows, row) : rows.map(row)}</div>`;
			assert.eq(clean(el), rows.map(r => html(r[0]) + html(r[1])).join(''), 'mapped=' + mapped);
		}
	}

	// 2. Between a row and an expression beside the list.  With a raw node of its own, the list
	// is drawn by the route that reads each row's nodes from a list the row keeps, which named
	// the node after it had left; a row removed in the same render then took the node with it.
	for (let withRaw of [false, true]) {
		let el = document.createElement('div');
		const row = v => h`<i>r</i>${v}`;
		let steps = [[[node], 'x'], [['q'], node], [[node], 'x'], [[], node], [[node], null], [['a', node], 'x'], [['a'], node], [['a', 'b'], node], [[node, 'b'], null], [[], null], [[], node]];
		for (let [rows, side] of steps) {
			h(el)`<div>${withRaw ? [other, rows.map(row)] : rows.map(row)}|${side}</div>`;
			assert.eq(clean(el), (withRaw ? '<b></b>' : '') + rows.map(v => '<i>r</i>' + html(v)).join('') + '|' + html(side), 'withRaw=' + withRaw);
		}
	}

	// 3. Between the rows of two lists that are themselves rows of a list.
	let el = document.createElement('div');
	const inner = v => h`${v}.`;
	const outer = group => h`[${group.map(inner)}]`;
	for (let groups of [[['a', node], ['c', 'd']], [['a', 'b'], ['c', node]], [['a', 'b'], [node, 'd']], [[node, 'b'], ['c', 'd']], [['a', 'b'], ['c', 'd'], [node]], [['a', node]], [[node], ['e']], [['e'], [node]]]) {
		h(el)`<div>${groups.map(outer)}</div>`;
		assert.eq(clean(el), groups.map(group => '[' + group.map(v => html(v) + '.').join('') + ']').join(''));
	}

	// 4. A template of several root nodes beside an expression, inside a component.
	class RawNodeMoves extends Solarite {
		inside = node;
		beside = 'x';
		render() {
			h(this)`<raw-node-moves>${h`<i>1</i>${this.inside}<u>2</u>`}|${this.beside}</raw-node-moves>`;
		}
	}
	RawNodeMoves.define('raw-node-moves');
	let component = new RawNodeMoves();
	for (let [inside, beside] of [[node, 'x'], ['t', node], ['t', node], [node, 'x'], [null, node], [node, null]]) {
		Object.assign(component, {inside, beside});
		component.render();
		assert.eq(component.innerHTML.replace(/<!--.*?-->/g, ''), '<i>1</i>' + html(inside) + '<u>2</u>|' + html(beside));
	}
});

Testimony.test('Solarite.loop.rawNodeMovesWhenRenderFails', `A raw DOM node still moves to the place it is given to when the render that first moved it threw, or started inside another render.`, () => {
	const clean = el => el.firstElementChild.innerHTML.replace(/<!--.*?-->/g, '');
	let node = document.createElement('hr');
	let bad = false;
	const row = () => h`<p onclick=${bad ? 'not a function' : () => {}}>r</p>`;
	const throws = fn => {
		try { fn(); } catch (e) { return true; }
		return false;
	};

	// 1. The place that takes the node throws after it was given the node, before anything moved.
	let el = document.createElement('div');
	let render = (a, b) => h(el)`<div>${a}|${b}</div>`;
	render(node, 'x');
	bad = true;
	assert.eq(throws(() => render('x', [node, row()])), true);
	bad = false;
	render('x', [node, row()]);
	assert.eq(clean(el), 'x|<hr><p>r</p>');
	render(node, [row()]);
	assert.eq(clean(el), '<hr>|<p>r</p>');
	bad = true;
	assert.eq(throws(() => render('y', [node, row(), row()])), true);
	bad = false;
	render(node, 'z');
	assert.eq(clean(el), '<hr>|z');
	render('z', node);
	assert.eq(clean(el), 'z|<hr>');

	// 2. The place that gives the node up throws while it is rewritten.
	el = document.createElement('div');
	render([node, row()], 'x');
	bad = true;
	assert.eq(throws(() => render([row(), row()], node)), true);
	bad = false;
	render([row()], node);
	assert.eq(clean(el), '<p>r</p>|<hr>');
	render([node, row()], 'x');
	assert.eq(clean(el), '<hr><p>r</p>|x');

	// 3. A function in the second expression renders the host with the node moved, and the
	// render it interrupted then puts the node back where it had it.
	el = document.createElement('div');
	let state = {a: node, b: 'x'}, armed = false;
	render = () => h(el)`<div>${state.a}|${() => {
		if (armed) {
			armed = false;
			let outer = state;
			state = {a: 'q', b: node};
			render();
			state = outer;
		}
		return state.b;
	}}</div>`;
	render();
	armed = true;
	render();
	assert.eq(clean(el), '<hr>|x');
	state = {a: 'y', b: node};
	render();
	assert.eq(clean(el), 'y|<hr>');
});

Testimony.test('Solarite.loop.rawNodeGivenTwice', `A raw DOM node that one render gives to two places is shown in the place written last, and in the place that is given it alone afterward.`, () => {
	// A node can stand in one place only.  Expressions of one template are written from the
	// last to the first, so of two that are given the same node the first one holds it.
	const clean = el => el.firstElementChild.innerHTML.replace(/<!--.*?-->/g, '');
	const html = v => v?.nodeType ? v.outerHTML : (v || '');
	let node = document.createElement('hr'), other = document.createElement('b');

	// 1. Two expressions: both, then either alone, in every order.
	let el = document.createElement('div');
	let steps = [
		[node, node], [node, node], ['x', node], [node, node], [node, 'x'], [node, node], ['x', node], ['x', node], [node, node], [null, null],
		[node, node], ['x', node], [node, 'x'], [node, node], [node, 'x']
	];
	for (let [a, b] of steps) {
		h(el)`<div>${a}|${b}</div>`;
		assert.eq(clean(el), a === node && b === node ? '<hr>|' : html(a) + '|' + html(b));
	}

	// 2. Twice in one array: the first position holds it.
	el = document.createElement('div');
	for (let [items, expected] of [[[node, node], '<hr>'], [[node, other, node], '<hr><b></b>'], [[other, node], '<b></b><hr>'], [[node, other, node], '<hr><b></b>'], [[], ''], [[other, node, node], '<b></b><hr>']]) {
		h(el)`<div><i>h</i>${items}<i>t</i></div>`;
		assert.eq(clean(el), '<i>h</i>' + expected + '<i>t</i>');
	}

	// 3. Two rows.  Rows are written from the first to the last, so the last row holds it.
	// Known limit: a row whose values did not change is not written again, so the first row
	// does not take the node back when the last one lets go of it, until its own values change.
	el = document.createElement('div');
	let render = (a, b) => h(el)`<div>${[a, b].map(v => h`<p>${v}</p>`)}</div>`;
	render(node, node);
	assert.eq(clean(el), '<p></p><p><hr></p>');
	render(node, 'x');
	assert.eq(clean(el), '<p></p><p>x</p>');
	render('y', 'x');
	render(node, 'x');
	assert.eq(clean(el), '<p><hr></p><p>x</p>');
	render(node, node);
	assert.eq(clean(el), '<p></p><p><hr></p>');
	render('y', node);
	assert.eq(clean(el), '<p>y</p><p><hr></p>');

	// 4. A list item and a row of the same list.  The list places its own items after its rows
	// are built, so the item holds the node.  The row takes it when it is given it alone, in a
	// render that writes all of the row's expressions again because another of them changed.
	el = document.createElement('div');
	const titled = (title, v) => h`<p title="${title} ${title}">${v}</p>`;
	steps = [
		[[node, titled('a', 'v')], '<hr><p title="a a">v</p>'], [[node, titled('a', node)], '<hr><p title="a a"></p>'],
		[['x', titled('b', node)], 'x<p title="b b"><hr></p>'], [[node, titled('c', node)], '<hr><p title="c c"></p>'],
		[[titled('d', node)], '<p title="d d"><hr></p>']
	];
	for (let [items, expected] of steps) {
		h(el)`<div>${items}</div>`;
		assert.eq(clean(el), expected);
	}
});

Testimony.test('Solarite.loop.rawNodesFuzz', `Raw DOM nodes that are each given to one place per render are shown where they are given, through random moves between expressions, a child element, and rows that have no element of their own.`, () => {
	const clean = el => el.firstElementChild.innerHTML.replace(/<!--.*?-->/g, '');
	const html = v => [v].flat().map(item => item?.nodeType ? item.outerHTML : (item || '')).join('');
	const row = r => h`${r.a}-${r.b}`;
	for (let mapped of [false, true])
		for (let start of [11, 12345, 987654]) {

			// The deterministic generator Solarite.map.fuzz uses, which explains its two details.
			let seed = start;
			const rnd = n => {
				seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
				return (seed >>> 8) % n;
			};
			let el = document.createElement('div');
			let nodes = ['A', 'B', 'C', 'D'].map(text => Object.assign(document.createElement('i'), {textContent: text}));
			for (let step=0; step<150; step++) {

				// Each node goes to one of seven places or to none: either expression of one
				// of two rows, the expression beside the list, the one inside the <p>, or the
				// last one.  A place with several nodes gets an array, sometimes with text.
				let rows = Array.from({length: 1 + rnd(2)}, () => ({a: [], b: []}));
				let places = [...rows.flatMap(r => [r.a, r.b]), [], [], []];
				for (let node of nodes) {
					let at = rnd(8);
					if (at < places.length)
						places[at].push(node);
				}
				let [side, inside, last] = places.slice(-3).map(place => place.length === 0 ? (rnd(2) ? 'x' : null) : place.length === 1 && rnd(2) ? place[0] : (rnd(2) ? place : [...place, 'y']));
				for (let r of rows) {
					r.a = r.a.length ? r.a : 'x';
					r.b = r.b.length === 1 ? r.b[0] : r.b;
				}
				h(el)`<div>${mapped ? h.map(rows, row) : rows.map(row)}|${side}|<p>${inside}</p>|${last}</div>`;
				assert.eq(clean(el), rows.map(r => html(r.a) + '-' + html(r.b)).join('') + '|' + html(side) + '|<p>' + html(inside) + '</p>|' + html(last),
					'mapped ' + mapped + ' seed ' + start + ' step ' + step);
			}
		}
});

Testimony.test('Solarite.loop.rawNodeListReusesDroppedRows', `Rows dropped from a list that holds a raw node are kept, and come back as the same elements`, () => {
	// A list with a raw DOM node in it is reconciled by its own path, which keeps the rows a render
	// stopped showing: first among those still attached, and from the next render on in a pool.
	let hr = document.createElement('hr');
	let el = document.createElement('div');
	const render = labels => h(el)`<div>${[hr, labels.map(label => h`<p>${label}</p>`)]}</div>`;
	const rows = () => [...el.querySelectorAll('p')];

	render(['a', 'b', 'c']);
	let [a, b, c] = rows();

	// 1. Dropped rows that come back on the very next render.
	render(['a']);
	assert.eq(rows().length, 1);
	assert(rows()[0] === a);
	render(['a', 'b', 'c']);
	assert(rows()[0] === a);
	assert(rows()[1] === b);
	assert(rows()[2] === c);

	// 2. Dropped rows that stay away for two renders.
	render(['a']);
	render(['a']);
	render(['a', 'b', 'c']);
	assert.eq(el.firstElementChild.innerHTML, '<hr><p>a</p><p>b</p><p>c</p>');
	assert(rows()[0] === a);
	assert(rows()[1] === b);
	assert(rows()[2] === c);
});

Testimony.test('Solarite.loop.eventBindings', () => {
	let callCount = 0;

	class R215 extends Solarite {
		fruits = ['Apple', 'Banana'];

		checkFruit(fruit, i) {
			assert.eq(i, 0)

			callCount++;
		}

		render() {
			h(this)`${this.fruits.map((fruit, i) => h`<p onclick="${() => this.checkFruit(fruit, i)}">${fruit}</p>`)}`
		}
	}

	let a = new R215();
	document.body.append(a);
	a.firstElementChild.dispatchEvent(new MouseEvent('click', {bubbles: true}))

	a.fruits.shift();
	a.render();
	a.firstElementChild.dispatchEvent(new MouseEvent('click', {bubbles: true}))

	a.remove();
});

// TODO: Why is this called pathCache?  What does it test?
Testimony.test('Solarite.loop.pathCache', () => {

	class R216 extends Solarite {
		pets = ['Cat'];
		fruits = ['Apple', 'Banana'];

		render() {
			h(this)`${this.pets.map(pet =>
				h`${this.fruits.map(fruit =>
					h`<p>Item</p>`
				)}`
			)}`
		}
	}

	let a = new R216();
	a.render();
	assert.eq(getHtml(a), `<r-216><p>Item</p><p>Item</p></r-216>`);

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), `<r-216><p>Item</p></r-216>`);
});

Testimony.test('Solarite.loop.nested', () => {

	class A extends Solarite {
		pets = ['Cat', 'Dog'];
		fruits = ['Apple', 'Banana'];

		render() {
			h(this)`${this.pets.map(pet =>
				h`${this.fruits.map(fruit =>
					h`<p>${pet} eats ${fruit}</p>`
				)}`
			)}`
		}
	}
	customElements.define('r-220', A);

	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Cat eats Apple</p><p>Cat eats Banana</p><p>Dog eats Apple</p><p>Dog eats Banana</p></r-220>`);

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Cat eats Banana</p><p>Dog eats Banana</p></r-220>`);

	a.fruits.unshift('Apricot');
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Cat eats Apricot</p><p>Cat eats Banana</p><p>Dog eats Apricot</p><p>Dog eats Banana</p></r-220>`);

	a.pets.pop();
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Cat eats Apricot</p><p>Cat eats Banana</p></r-220>`);

	a.pets.unshift('Bird');
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Bird eats Apricot</p><p>Bird eats Banana</p><p>Cat eats Apricot</p><p>Cat eats Banana</p></r-220>`);

	a.pets.reverse();
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Cat eats Apricot</p><p>Cat eats Banana</p><p>Bird eats Apricot</p><p>Bird eats Banana</p></r-220>`);

	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Cat eats Banana</p><p>Cat eats Apricot</p><p>Bird eats Banana</p><p>Bird eats Apricot</p></r-220>`);

	a.pets.reverse();
	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Bird eats Apricot</p><p>Bird eats Banana</p><p>Cat eats Apricot</p><p>Cat eats Banana</p></r-220>`);

	a.pets.pop();
	a.render();
	assert.eq(getHtml(a), `<r-220><p>Bird eats Apricot</p><p>Bird eats Banana</p></r-220>`);

	a.pets.pop();
	a.render();
	assert.eq(getHtml(a), `<r-220></r-220>`);

	a.remove();
});

Testimony.test('Solarite.loop.nested2', () => {

	class A extends Solarite {
		fruits = ['Apple', 'Banana'];
		pets = ['Cat', 'Dog'];

		render() {
			h(this)`${this.pets.map(pet =>
				h`<div>${this.fruits.map(fruit =>
					h`<p>${pet} eats ${fruit}</p>`
				)}</div>`
			)}`
		}
	}
	customElements.define('r-224', A);

	let a = new A();
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Cat eats Apple</p><p>Cat eats Banana</p></div><div><p>Dog eats Apple</p><p>Dog eats Banana</p></div></r-224>`);

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Cat eats Banana</p></div><div><p>Dog eats Banana</p></div></r-224>`);

	a.fruits.unshift('Apricot');
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Cat eats Apricot</p><p>Cat eats Banana</p></div><div><p>Dog eats Apricot</p><p>Dog eats Banana</p></div></r-224>`);

	a.pets.pop(); // remove Dog.
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Cat eats Apricot</p><p>Cat eats Banana</p></div></r-224>`);

	a.pets.unshift('Bird');
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Bird eats Apricot</p><p>Bird eats Banana</p></div><div><p>Cat eats Apricot</p><p>Cat eats Banana</p></div></r-224>`);

	a.pets.reverse();
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Cat eats Apricot</p><p>Cat eats Banana</p></div><div><p>Bird eats Apricot</p><p>Bird eats Banana</p></div></r-224>`);

	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Cat eats Banana</p><p>Cat eats Apricot</p></div><div><p>Bird eats Banana</p><p>Bird eats Apricot</p></div></r-224>`);

	a.pets.reverse();
	a.fruits.reverse();
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Bird eats Apricot</p><p>Bird eats Banana</p></div><div><p>Cat eats Apricot</p><p>Cat eats Banana</p></div></r-224>`);

	a.pets.pop();
	a.render();
	assert.eq(getHtml(a), `<r-224><div><p>Bird eats Apricot</p><p>Bird eats Banana</p></div></r-224>`);

	a.pets.pop();
	a.render();
	assert.eq(getHtml(a), `<r-224></r-224>`);

	a.remove();
});

Testimony.test('Solarite.loop.nested3', `Move items from one sublist to another.`, () => {

	class A225 extends Solarite {
		fruitGroups = [
			['Apple'],
			['Banana', 'Cherry']
		];

		render() {
			h(this)`${this.fruitGroups.map(fruitGroup =>
				h`<div>${fruitGroup.map(fruit =>
					h`<span>${fruit}</span>`
				)}</div>`
			)}`
		}
	}
	A225.define();
	window.verify = true;

	let a = new A225();
	document.body.append(a);
	a.render();

	let cherry = a.fruitGroups[1].pop();
	a.fruitGroups[0].push(cherry);
	a.render();


	let banana = a.fruitGroups[1].pop();
	a.fruitGroups[0].push(banana);
	a.render();

	window.verify = false;
	a.remove();
});

// Tried to make a simpler version of nested3, but it works fine:
Testimony.test('Solarite.loop.nested4', () => {

	class A226 extends Solarite {
		fruits1 = ['Apple']
		fruits2 = ['Banana', 'Cherry']

		render() {
			h(this)`
				<div>${this.fruits1.map(fruit => h`<span>${fruit}</span>`)}</div>
				<div>${this.fruits2.map(fruit => h`<span>${fruit}</span>`)}</div>`
		}
	}
	A226.define();
	window.verify = true;

	let a = new A226();
	document.body.append(a);
	a.render();

	let cherry = a.fruits2.pop();
	a.fruits1.push(cherry);
	a.render();


	let banana = a.fruits2.pop();
	a.fruits1.push(banana);
	a.render();

	window.verify = false;
	a.remove();
});

Testimony.test('Solarite.loop.nested5', () => {

	// This test was originally created by reducing a failure in production code
	// to the simplest version, a NodeGroup-reuse bookkeeping bug in nested loops.

	// v could also be a function to trigger this same test.
	// Since functions are new on each render().
	let v = 'F1';

	class A227 extends Solarite {
		boxes = [
			["A"],
			["A", "B"]
		]

		render() {
			h(this)`
			<a-227>${this.boxes.map(item =>
				h`${item.map(item2 =>
					h`<div title=${v}>${item2}</div>`
				)}`
			)}</a-227>`;
		}
	}
	A227.define();

	//window.verify = true;

	let a = new A227();
	document.body.append(a); // calls render()




	v = 'F2';
	a.boxes = [
		["A", "B"],
		['A']
	]
	a.render();

	assert.eq(a.outerHTML, `<a-227><!--Path:1--><!--Path:0--><div title="F2">A</div><div title="F2">B</div><!--PathEnd:0--><!--Path:0--><div title="F2">A</div><!--PathEnd:0--><!--PathEnd:1--></a-227>`);

	window.verify = false;
	a.remove();
});

Testimony.test('Solarite.loop.nestedConditional', () => {

	let isGoodBoy = true;

	class R227 extends Solarite {
		pets = ['Cat', 'Dog'];
		fruits = ['Apple', 'Banana'];

		render() {
			h(this)`${this.pets.map(pet =>
				h`${this.fruits.map(fruit =>
					isGoodBoy
						? h`<p>${pet} prepares ${fruit}</p>`
						: h`<p>${pet} eats ${fruit}</p>`
				)}`
			)}`
		}
	}
	let a = new R227;

	document.body.append(a);
	assert.eq(getHtml(a), `<r-227><p>Cat prepares Apple</p><p>Cat prepares Banana</p><p>Dog prepares Apple</p><p>Dog prepares Banana</p></r-227>`);

	isGoodBoy = false;
	a.render();
	assert.eq(getHtml(a), `<r-227><p>Cat eats Apple</p><p>Cat eats Banana</p><p>Dog eats Apple</p><p>Dog eats Banana</p></r-227>`);

	isGoodBoy = true;
	a.render();
	assert.eq(getHtml(a), `<r-227><p>Cat prepares Apple</p><p>Cat prepares Banana</p><p>Dog prepares Apple</p><p>Dog prepares Banana</p></r-227>`);

	a.fruits.pop();
	isGoodBoy = false;
	a.render();
	assert.eq(getHtml(a), `<r-227><p>Cat eats Apple</p><p>Dog eats Apple</p></r-227>`);

	a.remove();
});

Testimony.test('Solarite.loop.conditionalNested', () => {

	class R240 extends Solarite {
		pets = [
			{
				name: 'Cat',
				activities: ['Sleep', 'Eat', 'Pur']
			},
			{
				name: 'Dog',
				activities: ['Frolic', 'Fetch']
			}
		];

		render() {
			h(this)`${this.pets.map(pet =>
				pet.activities.map(activity =>
					activity.length >= 5
						? h`<p>${pet.name} will ${activity}.</p>`
						: ``
				)
			)}`
		}
	}
	let a = new R240();
	document.body.append(a);

	assert.eq(getHtml(a), `<r-240><p>Cat will Sleep.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></r-240>`);


	a.pets[0].activities[0] = 'Doze'; // Less than 5 characters.
	a.render()
	assert.eq(getHtml(a), `<r-240><p>Dog will Frolic.</p><p>Dog will Fetch.</p></r-240>`);
	//assert.eq(Refract.elsCreated, []);


	a.pets[0].activities[0] = 'Slumber';
	a.render()
	assert.eq(getHtml(a), `<r-240><p>Cat will Slumber.</p><p>Dog will Frolic.</p><p>Dog will Fetch.</p></r-240>`);
	//assert.eq(Refract.elsCreated, ["<p>", "Cat", " will ", "Slumber", "."]);

	a.remove();
});


Testimony.test('Solarite.loop.tripleNested', 'Triple nested grid', () => {

	class R250 extends Solarite {
		rows = [[[0]]];

		render() {
			h(this)`${this.rows.map(row =>
				h`${row.map(items =>
					h`${items.map(item =>
						h`${item}`
					)}`
				)}`
			)}`
		}
	}

	let a = new R250();
	document.body.append(a);
	assert.eq(getHtml(a), `<r-250>0</r-250>`);

	a.rows[0][0][0] = 4;
	a.render();
	assert.eq(getHtml(a), `<r-250>4</r-250>`);

	a.rows = [];
	a.render();
	assert.eq(getHtml(a), `<r-250></r-250>`);

	a.rows = [
		[[1,2],[3,4]],
		[[5,6],[7,8]]
	];
	a.render()
	assert.eq(getHtml(a), `<r-250>12345678</r-250>`);

	// Replace numbers with nodes.
	let p1 = h('<p>1</p')
	let p2 = h('<p>2</p')
	let p3 = h('<p>3</p')
	let p4 = h('<p>4</p')
	let p5 = h('<p>5</p')
	let p6 = h('<p>6</p')
	let p7 = h('<p>7</p')
	let p8 = h('<p>8</p')

	a.rows = [
		[[p1,p2],[p3,p4]],
		[[p5,p6],[p7,p8]]
	];
	a.render()
	assert.eq(getHtml(a), `<r-250><p>1</p><p>2</p><p>3</p><p>4</p><p>5</p><p>6</p><p>7</p><p>8</p></r-250>`);

	// Reverse the order.
	a.rows = [
		[[p8,p7],[p6,p5]],
		[[p4,p3],[p2,p1]]
	];
	a.render(); // TODO: checkNodesCache() fails at this step.
	assert.eq(getHtml(a), `<r-250><p>8</p><p>7</p><p>6</p><p>5</p><p>4</p><p>3</p><p>2</p><p>1</p></r-250>`);

	a.rows = [];
	a.render();
	assert.eq(getHtml(a), `<r-250></r-250>`);



	a.remove();
});

//endregion




/*┌─────────────────╮
  | Keyed           |
  └─────────────────╯*/
//region keyed

Testimony.test('Solarite.keyed.basic', `Rows with unchanged keys keep their DOM nodes.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<p key=${r.id}>${r.label}</p>`)}`;

	render([{id: 1, label: 'a'}, {id: 2, label: 'b'}]);
	assert.eq(getHtml(el), '<div><p>a</p><p>b</p></div>');
	let [a, b] = el.children;

	render([{id: 1, label: 'a'}, {id: 2, label: 'b2'}]);
	assert.eq(getHtml(el), '<div><p>a</p><p>b2</p></div>');
	assert.eq(el.children[0], a);
	assert.eq(el.children[1], b); // Same node, rewritten in place.

	el.remove();
});

Testimony.test('Solarite.keyed.swap', `Node identity follows the key on swap.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<p key=${r.id}>${r.label}</p>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}, {id: 3, label: 'c'}, {id: 4, label: 'd'}];
	render(rows);
	let [a, b, c, d] = el.children;

	[rows[1], rows[2]] = [rows[2], rows[1]];
	render(rows);
	assert.eq(getHtml(el), '<div><p>a</p><p>c</p><p>b</p><p>d</p></div>');
	assert.eq(el.children[0], a);
	assert.eq(el.children[1], c); // Moved, not rewritten.
	assert.eq(el.children[2], b);
	assert.eq(el.children[3], d);

	el.remove();
});

Testimony.test('Solarite.keyed.reverse', () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<p key=${r.id}>${r.label}</p>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}, {id: 3, label: 'c'}];
	render(rows);
	let nodes = [...el.children];

	rows.reverse();
	render(rows);
	assert.eq(getHtml(el), '<div><p>c</p><p>b</p><p>a</p></div>');
	assert.eq(el.children[0], nodes[2]);
	assert.eq(el.children[1], nodes[1]);
	assert.eq(el.children[2], nodes[0]);

	el.remove();
});

Testimony.test('Solarite.keyed.remove', `Other rows keep identity when one is removed.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<p key=${r.id}>${r.label}</p>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}, {id: 3, label: 'c'}];
	render(rows);
	let [a, , c] = el.children;

	rows.splice(1, 1);
	render(rows);
	assert.eq(getHtml(el), '<div><p>a</p><p>c</p></div>');
	assert.eq(el.children[0], a);
	assert.eq(el.children[1], c);

	el.remove();
});

Testimony.test('Solarite.keyed.insert', `Existing rows keep identity when one is inserted between them.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<p key=${r.id}>${r.label}</p>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 3, label: 'c'}];
	render(rows);
	let [a, c] = el.children;

	rows.splice(1, 0, {id: 2, label: 'b'});
	render(rows);
	assert.eq(getHtml(el), '<div><p>a</p><p>b</p><p>c</p></div>');
	assert.eq(el.children[0], a);
	assert.eq(el.children[2], c);

	el.remove();
});

Testimony.test('Solarite.keyed.replaceAll', `New keys always get new nodes, per keyed semantics.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<p key=${r.id}>${r.label}</p>`)}`;

	render([{id: 1, label: 'a'}, {id: 2, label: 'b'}]);
	let [a, b] = el.children;

	render([{id: 3, label: 'c'}, {id: 4, label: 'd'}]);
	assert.eq(getHtml(el), '<div><p>c</p><p>d</p></div>');
	assert(el.children[0] !== a);
	assert(el.children[0] !== b);
	assert(el.children[1] !== a);
	assert(el.children[1] !== b);

	el.remove();
});

Testimony.test('Solarite.keyed.clearAndRecreate', `Cleared keyed rows aren't pooled; recreating makes new nodes.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<p key=${r.id}>${r.label}</p>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}];
	render(rows);
	let [a, b] = el.children;

	render([]);
	assert.eq(getHtml(el), '<div></div>');

	render(rows);
	assert.eq(getHtml(el), '<div><p>a</p><p>b</p></div>');
	assert(el.children[0] !== a);
	assert(el.children[1] !== b);

	el.remove();
});

Testimony.test('Solarite.keyed.inputState', `Un-rendered DOM state follows the key through a reorder.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<div key=${r.id}><input placeholder=${r.label}></div>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}, {id: 3, label: 'c'}];
	render(rows);
	let input = el.children[1].querySelector('input');
	input.value = 'typed by user'; // Never rendered; survives only if the node itself is kept.

	rows.reverse();
	render(rows);
	assert.eq(el.children[1].querySelector('input'), input);
	assert.eq(input.value, 'typed by user');

	el.remove();
});

Testimony.test('Solarite.keyed.multiRoot', `Keyed templates with multiple root nodes move as one range.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<dt key=${r.id}>${r.id}</dt><dd>${r.label}</dd>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}, {id: 3, label: 'c'}];
	render(rows);
	assert.eq(getHtml(el), '<div><dt>1</dt><dd>a</dd><dt>2</dt><dd>b</dd><dt>3</dt><dd>c</dd></div>');
	let dt2 = el.children[2], dd2 = el.children[3];

	[rows[0], rows[1]] = [rows[1], rows[0]];
	render(rows);
	assert.eq(getHtml(el), '<div><dt>2</dt><dd>b</dd><dt>1</dt><dd>a</dd><dt>3</dt><dd>c</dd></div>');
	assert.eq(el.children[0], dt2);
	assert.eq(el.children[1], dd2);

	el.remove();
});

Testimony.test('Solarite.keyed.multiRootRemoved', `Keyed rows of several root nodes that leave a list are taken out whole, each with all of its nodes, whether a few rows go or all of them are replaced, and the rows that stay keep their elements.`, () => {
	for (let mapped of [true, false]) {
		let el = document.createElement('div');
		let rows = [1, 2, 3, 4, 5, 6].map(id => ({id}));
		let row = r => h`<dt key=${r.id}>${r.id}</dt>-<dd>${r.id}</dd>`;
		// The list has two neighbours on each side, so it is never emptied by clearing its parent.
		let render = () => h(el)`<dl><b>head</b><hr>${mapped ? h.map(rows, row) : rows.map(row)}<hr><i>tail</i></dl>`;
		const text = () => 'head' + rows.map(r => r.id + '-' + r.id).join('') + 'tail';
		render();
		assert.eq(el.textContent, text());
		let dts = [...el.querySelectorAll('dt')], dds = [...el.querySelectorAll('dd')];

		// 1. Rows 2, 3 and 5 go, in two places.
		rows = [rows[0], rows[3], rows[5]];
		render();
		assert.eq(el.textContent, text(), 'mapped=' + mapped);
		assert.eq([...el.querySelectorAll('dt')], [dts[0], dts[3], dts[5]]);
		assert.eq([...el.querySelectorAll('dd')], [dds[0], dds[3], dds[5]]);
		for (let i of [1, 2, 4])
			assert.eq(el.contains(dts[i]) || el.contains(dds[i]), false);

		// 2. Rows move while others go and new ones arrive.
		rows = [rows[2], {id: 7}, rows[0]];
		render();
		assert.eq(el.textContent, text(), 'mapped=' + mapped);
		assert.eq(el.querySelectorAll('dt')[0], dts[5]);
		assert.eq(el.querySelectorAll('dd')[2], dds[0]);
		assert.eq(el.contains(dts[3]) || el.contains(dds[3]), false);

		// 3. Every row is replaced by rows with other keys.
		rows = [{id: 8}, {id: 9}];
		render();
		assert.eq(el.textContent, text(), 'mapped=' + mapped);
		assert.eq(el.querySelectorAll('dt, dd').length, 4);
		assert.eq(el.contains(dts[0]) || el.contains(dds[5]), false);
	}
});

Testimony.test('Solarite.keyed.component', `Keys work on component rows and aren't passed as args.`, () => {
	class KeyedRow extends Solarite {
		constructor(args={}) {
			super();
			this.label = args.label;
			this.gotKey = 'key' in args;
		}
		render() {
			h(this)`<span>${this.label}</span>`;
		}
	}
	customElements.define('keyed-row', KeyedRow);

	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<keyed-row key=${r.id} label=${r.label}></keyed-row>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}];
	render(rows);
	assert.eq(getHtml(el), '<div><keyed-row label="a"><span>a</span></keyed-row><keyed-row label="b"><span>b</span></keyed-row></div>');
	assert.eq(el.children[0].gotKey, false);
	assert(!el.children[0].hasAttribute('key'));
	let [a, b] = el.children;

	[rows[0], rows[1]] = [rows[1], rows[0]];
	render(rows);
	assert.eq(el.children[0], b);
	assert.eq(el.children[1], a);

	el.remove();
});

Testimony.test('Solarite.keyed.staticKeyThrows', () => {
	assert.throws(() => {
		let ng = new NodeGroup(h`<p key="foo">hi</p>`);
	}, 'key must be one whole expression');
});

Testimony.test('Solarite.keyed.mixedKeyThrows', () => {
	assert.throws(() => {
		let t = h`<p key="a${1}b">hi</p>`;
		let ng = new NodeGroup(t);
		ng.applyExprs(t.exprs);
	}, 'key must be one whole expression');
});

Testimony.test('Solarite.keyed.nestedKeyThrows', () => {
	assert.throws(() => {
		let t = h`<div><p key=${1}>hi</p></div>`;
		let ng = new NodeGroup(t);
		ng.applyExprs(t.exprs);
	}, 'top-level');
});

Testimony.test('Solarite.keyed.duplicateKeyAttribThrows', () => {
	assert.throws(() => {
		let t = h`<p key=${1} key=${2}>hi</p>`;
		let ng = new NodeGroup(t);
		ng.applyExprs(t.exprs);
	});
});

Testimony.test('Solarite.keyed.keyedInsideUnkeyed', `A keyed list nested inside unkeyed content.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`<b>title</b><ul>${rows.map(r => h`<li key=${r.id}>${r.label}</li>`)}</ul>`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}];
	render(rows);
	assert.eq(getHtml(el), '<div><b>title</b><ul><li>a</li><li>b</li></ul></div>');
	let ul = el.querySelector('ul');
	let [a, b] = ul.children;

	rows.reverse();
	render(rows);
	assert.eq(getHtml(el), '<div><b>title</b><ul><li>b</li><li>a</li></ul></div>');
	assert.eq(ul.children[0], b);
	assert.eq(ul.children[1], a);

	el.remove();
});

Testimony.test('Solarite.keyed.toUnkeyed', `Switching a list from keyed to unkeyed templates still renders.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	h(el)`${[1, 2].map(id => h`<p key=${id}>k${id}</p>`)}`;
	assert.eq(getHtml(el), '<div><p>k1</p><p>k2</p></div>');

	h(el)`${['x', 'y'].map(t => h`<i>${t}</i>`)}`;
	assert.eq(getHtml(el), '<div><i>x</i><i>y</i></div>');

	h(el)`${[3, 4].map(id => h`<p key=${id}>k${id}</p>`)}`;
	assert.eq(getHtml(el), '<div><p>k3</p><p>k4</p></div>');

	el.remove();
});

Testimony.test('Solarite.keyed.unkeyedRowAmongManyReplaced', `A row without a key, a template or a plain string, that stays where it is in a keyed h.map() list is still drawn when many of the other rows get new keys and one that stays shifts by a position.`, () => {
	for (let asString of [false, true]) {
		let el = document.createElement('div');
		let mk = id => ({id});
		let note = {note: 'note'};
		let rows = [mk(0), mk(1), note];
		for (let i=2; i<=22; i++)
			rows.push(mk(i));
		let render = () => h(el)`<div>${h.map(rows, r => r.note ? (asString ? r.note : h`<i>${r.note}</i>`) : h`<p key=${r.id}>${r.id},</p>`)}</div>`;
		render();
		let kept = el.querySelectorAll('p')[21]; // Key 21.

		// Rows 1 to 20 get new keys, a new row comes before row 21, and row 22 goes: the same
		// length, with more rows out of place than the reconciler settles by matching them
		// against each other.
		let next = [rows[0], mk(101), note];
		for (let i=2; i<=21; i++)
			next.push(mk(100 + i));
		next.push(rows[22]);
		assert.eq(next.length, rows.length);
		rows = next;
		render();
		assert.eq(el.textContent, rows.map(r => r.note || r.id + ',').join(''), 'asString=' + asString);
		assert.eq([...el.querySelectorAll('p')].at(-1), kept);
	}
});

Testimony.test('Solarite.keyed.keysAfterUnkeyedFirstRow', `A row keeps its element by its key when the list's first row has none: a row an h.map() callback hides by returning null, a plain string, or a heading written as a template without a key.  The same when a raw DOM node stands among the rows.`, () => {
	let spinner = document.createElement('progress');
	let row = todo => h`<li key=${todo.id}>${todo.id}<input></li>`;
	let visible = todos => todos.filter(todo => !todo.hidden);
	let shapes = {
		hiddenFirst: todos => h.map(todos, todo => todo.hidden ? null : row(todo)),
		leadingString: todos => ['Todo:', ...visible(todos).map(row)],
		headerTemplate: todos => [h`<li class="hdr">Todo</li>`, ...visible(todos).map(row)],
		rawNodeFirst: todos => [spinner, ...visible(todos).map(row)],
		rawNodeLast: todos => [...visible(todos).map(row), spinner]
	};
	for (let name in shapes) {
		let el = document.createElement('div');
		let todos = {};
		for (let id of [1, 2, 3, 4, 5])
			todos[id] = {id, hidden: name === 'hiddenFirst' && id === 1};
		let ids;
		let render = () => h(el)`<ul>${shapes[name](ids.map(id => todos[id]))}</ul>`;

		// The input of each todo, by its id, as it was when the todo was first shown.
		let inputs = {};
		let check = step => {
			let lis = [...el.querySelectorAll('li:not(.hdr)')];
			assert.eq(lis.map(li => li.textContent).join(), visible(ids.map(id => todos[id])).map(todo => todo.id).join(), name + ', ' + step);
			for (let li of lis)
				assert.eq(inputs[li.textContent] ??= li.querySelector('input'), li.querySelector('input'), name + ', ' + step + ': the element of todo ' + li.textContent);
		};

		// The first todo stays first, so the hidden one stays hidden in front.
		for (let [step, order] of [['create', [1, 2, 3, 4]], ['2 to the end', [1, 3, 4, 2]], ['shuffle', [1, 4, 2, 3]], ['replace one', [1, 2, 5, 3]], ['remove two', [1, 5]]]) {
			ids = order;
			render();
			check(step);
		}
	}
});

Testimony.test('Solarite.keyed.unkeyedRowsNotWarned', `In the debug build, a keyed list warns about a row that is a template without a key, but not about a plain string or a row hidden by returning null.`, () => {
	let warn = console.warn, warnings = [];
	console.warn = (...args) => warnings.push(args.join(' '));
	try {
		let el = document.createElement('div');
		let todos = [{id: 1}, {id: 2, hidden: true}, {id: 3}, {id: 4, sep: true}, {id: 5}];
		let render = () => h(el)`<ul>${h.map(todos, todo => todo.hidden ? null : todo.sep ? ' | ' : h`<li key=${todo.id}>${todo.id}</li>`)}</ul>`;
		render();
		todos = [todos[2], todos[1], todos[0], todos[3], todos[4]];
		render();
		todos = [todos[1], todos[0], todos[2], todos[3], todos[4]]; // The hidden row first.
		render();
		todos = [todos[0], todos[2], todos[1], todos[3], todos[4]];
		render();
		assert.eq(warnings.filter(text => text.includes('Unkeyed')).length, 0);

		h(el)`<ul>${[h`<li key=${1}>1</li>`, h`<li>2</li>`]}</ul>`;
		assert.eq(warnings.filter(text => text.includes('Unkeyed')).length, 1);
	}
	finally {
		console.warn = warn;
	}
});

Testimony.test('Solarite.keyed.noneKeptBetweenKeptEnds', `A keyed list whose middle is all new keys, between rows that stay, keeps the ends and replaces the middle`, () => {
	let el = document.createElement('div');
	let mk = (id, label='r' + id) => ({id, label});
	let rows = [mk(1), mk(2), mk(3), mk(4), mk(5), mk(6)];
	let hits = [];
	let render = () => h(el)`<div><b>head</b>${h.map(rows, r => h`<p key=${r.id} onclick=${[x => hits.push(x.id), r]}>${r.label}</p>`)}<i>foot</i></div>`;
	render();
	let before = [...el.querySelectorAll('p')];

	// Old middle 2..5 goes; a longer new middle comes.  No old key in the window survives.
	rows = [rows[0], mk(20), mk(21), mk(22), mk(23), mk(24), mk(25), mk(26), mk(27), mk(28), mk(29), rows[5]];
	render();
	let after = [...el.querySelectorAll('p')];
	assert.eq(el.firstElementChild.textContent, 'headr1r20r21r22r23r24r25r26r27r28r29r6foot');
	assert.eq(after[0], before[0]);
	assert.eq(after[11], before[5]);
	assert.eq(before.slice(1, 5).some(p => p.isConnected || after.includes(p)), false);
	assert.eq(el.querySelector('b').textContent + el.querySelector('i').textContent, 'headfoot');
	document.body.append(el);
	after[5].click();
	after[11].click();
	el.remove();
	assert.eq(hits.join(), '24,6');

	// And the reverse: the middle shrinks to rows with new keys.
	rows = [rows[0], mk(40), rows[11]];
	render();
	assert.eq(el.firstElementChild.textContent, 'headr1r40r6foot');
	assert.eq(el.querySelectorAll('p')[0], before[0]);
	assert.eq(el.querySelectorAll('p')[2], before[5]);
});

//endregion




/*┌─────────────────╮
  | Stamp           |
  └─────────────────╯*/
//region stamp
// "Stamping" is the allocation-free creation fast path (see Shell.stampable and
// NodeGroup.applyStamp).  Qualifying templates (one root element, no components, every
// path one expression) create NodeGroups with NO per-instance Path objects: expressions
// are written through shared per-shell "stamper" paths, and in-place rewrites compare
// and write through them too (NodeGroup.rewriteStamp).  Real Path objects are
// materialized lazily, only when a child expression stops being a primitive
// (NodeGroup.materializePaths).  These tests pin the transitions between those states.

Testimony.test('Solarite.stamp.primitiveToTemplate', `A stamped row's child expr can become a Template.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = items => h(el)`${items.map(i => h`<p class=${'c' + i.id}><span>${i.content}</span></p>`)}`;

	let items = [{id: 1, content: 'plain'}];
	render(items);
	assert.eq(getHtml(el), '<div><p class="c1"><span>plain</span></p></div>');

	items[0].content = h`<b>bold</b>`;
	render(items);
	assert.eq(getHtml(el), '<div><p class="c1"><span><b>bold</b></span></p></div>');

	items[0].content = 'back';
	render(items);
	assert.eq(getHtml(el), '<div><p class="c1"><span>back</span></p></div>');

	el.remove();
});

Testimony.test('Solarite.stamp.templateAtCreate', `Rows created with Template child exprs (stamp bail) render and rewrite.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = items => h(el)`${items.map(i => h`<p class=${'c' + i.id}><span>${i.content}</span></p>`)}`;

	let items = [{id: 1, content: h`<i>it</i>`}, {id: 2, content: 'txt'}];
	render(items);
	assert.eq(getHtml(el), '<div><p class="c1"><span><i>it</i></span></p><p class="c2"><span>txt</span></p></div>');

	items[0].content = 'now plain';
	items[1].content = h`<u>u</u>`;
	render(items);
	assert.eq(getHtml(el), '<div><p class="c1"><span>now plain</span></p><p class="c2"><span><u>u</u></span></p></div>');

	el.remove();
});

Testimony.test('Solarite.stamp.poolReuse', `Cleared stamped rows reused from the pool render correctly.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = items => h(el)`${items.map(i => h`<p title=${i.t}>${i.x}</p>`)}`;

	render([{t: 'a', x: 1}, {t: 'b', x: 2}]);
	let a = el.children[0];
	render([]);
	assert.eq(getHtml(el), '<div></div>');

	render([{t: 'c', x: 3}, {t: 'd', x: 4}]);
	assert.eq(getHtml(el), '<div><p title="c">3</p><p title="d">4</p></div>');
	assert.eq(el.children[0], a); // Non-keyed pool reuses the same node.

	el.remove();
});

Testimony.test('Solarite.stamp.pooledRowTemplateChild', `A row that is re-applied through the raw-node list route can be given a template where its text was: it shows the template, keeps its attribute and its handler current, and goes back to text and to a template again.`, () => {
	for (let eventDelegation of [true, false]) {
		let el = document.createElement('div');
		document.body.append(el);
		let hits = [];
		let hr = document.createElement('hr'); // A raw node in the list sends it down the general route.
		let row = (i, cell) => h`<p title=${'t' + i} onclick=${[n => hits.push(n), i]}><b>${cell}</b></p>`; // One template site, so the rows share a shell.
		let render = items => h(el, {eventDelegation})`<div>${[...items, hr]}</div>`;

		render([row(1, 'one')]);
		let p = el.querySelector('p');
		assert.eq(p.outerHTML, '<p title="t1"><b>one</b></p>');

		// The same row, given a template for a child.
		render([row(2, h`<i>two</i>`)]);
		assert.eq(el.querySelector('p'), p);
		assert.eq(p.outerHTML, '<p title="t2"><b><i>two</i></b></p>');
		p.click();
		assert.eq(hits.join(), '2');

		render([row(3, 'three')]);
		assert.eq(p.outerHTML, '<p title="t3"><b>three</b></p>');
		render([row(4, h`<u>four</u>`)]);
		assert.eq(el.querySelector('p'), p);
		assert.eq(p.outerHTML, '<p title="t4"><b><u>four</u></b></p>');
		p.click();
		assert.eq(hits.join(), '2,4', 'eventDelegation=' + eventDelegation);
		assert.eq(el.firstElementChild.lastChild, hr);

		el.remove();
	}
});

Testimony.test('Solarite.stamp.keyedRewrite', `Stamped keyed rows rewrite in place without losing node state.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let render = rows => h(el)`${rows.map(r => h`<div key=${r.id} class=${r.cls}><input placeholder=${r.label}></div>`)}`;

	let rows = [{id: 1, cls: 'x', label: 'a'}, {id: 2, cls: 'y', label: 'b'}];
	render(rows);
	let input = el.children[0].querySelector('input');
	input.value = 'typed';

	rows[0].cls = 'x2';
	rows[0].label = 'a2';
	render(rows);
	assert.eq(el.children[0].className, 'x2');
	assert.eq(input.placeholder, 'a2');
	assert.eq(input.value, 'typed');
	assert.eq(el.children[0].querySelector('input'), input);

	el.remove();
});

Testimony.test('Solarite.stamp.prefilledText', `Row text is cloned in from the shell's master: literal for any characters, numbers included, per row, and correct across re-renders that change it, turn it into a template, and turn it back; a pooled row re-applied through the generic path writes its text too.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, a: '<b>&amp;</b>', b: 5}, {id: 2, a: 'two', b: 6}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><i>${r.a}</i><u>${r.b}</u></p>`)}</div>`;
	render();
	let ps = el.querySelectorAll('p');
	assert.eq(ps[0].firstChild.textContent, '<b>&amp;</b>');
	assert.eq(ps[0].firstChild.childNodes.length, 1);
	assert.eq(ps[0].lastChild.textContent, '5');
	assert.eq(ps[1].firstChild.textContent, 'two');
	assert.eq(ps[1].lastChild.textContent, '6');

	rows[1] = {id: 2, a: 'TWO', b: 6};
	render();
	assert.eq(el.querySelectorAll('p')[1], ps[1]);
	assert.eq(ps[1].firstChild.textContent, 'TWO');
	assert.eq(ps[1].firstChild.childNodes.length, 1);

	// A child that becomes a template materializes real paths; back to text works too.
	rows[1] = {id: 2, a: h`<s>deep</s>`, b: 6};
	render();
	assert.eq(ps[1].firstChild.innerHTML, '<s>deep</s>');
	rows[1] = {id: 2, a: 'plain', b: 7};
	render();
	assert.eq(ps[1].firstChild.innerHTML, 'plain');
	assert.eq(ps[1].lastChild.textContent, '7');

	// A brand-new row whose child starts as a template.
	rows.push({id: 3, a: h`<em>new</em>`, b: 8});
	render();
	let p3 = el.querySelectorAll('p')[2];
	assert.eq(p3.firstChild.innerHTML, '<em>new</em>');
	assert.eq(p3.lastChild.textContent, '8');
	el.remove();

	// Pooled rows re-applied through the generic path (raw nodes in the list) write their text.
	let el2 = document.createElement('div');
	document.body.append(el2);
	let hr = document.createElement('hr');
	let quote = text => h`<q>${text}</q>`; // One template site, so the rows share a shell.
	let items = [quote('a'), hr];
	let render2 = () => h(el2)`<div>${items}</div>`;
	render2();
	let q = el2.querySelector('q');
	assert.eq(q.textContent, 'a');
	items = [quote('b'), hr];
	render2();
	assert.eq(el2.querySelector('q'), q);
	assert.eq(q.textContent, 'b');
	el2.remove();
});

Testimony.test('Solarite.stamp.masterPartialWrite', `A row with a template child, drawn between rows of plain text, leaves the shared master row clean`, () => {
	let el = document.createElement('div');
	let rows = [
		{id: 1, a: 'A1', b: 'B1'},
		{id: 2, a: 'A2', b: h`<b>T2</b>`}, // Writes A2 into the master, then finds b is not text.
		{id: 3, a: '', b: h`<b>T3</b>`},   // Removes the master's first text node, then gives up.
		{id: 4, a: '', b: ''},
		{id: 5, a: 5, b: 0},
		{id: 6, a: 'A6', b: [h`<b>T6</b>`, 'x']},
		{id: 7, a: 'A7', b: 'B7'}
	];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><i>${r.a}</i><u>${r.b}</u></p>`)}</div>`;
	render();
	let html = () => [...el.querySelectorAll('p')].map(p => p.innerHTML.replace(/<!--.*?-->/g, '')).join('|');
	let want = '<i>A1</i><u>B1</u>|<i>A2</i><u><b>T2</b></u>|<i></i><u><b>T3</b></u>|<i></i><u></u>|<i>5</i><u>0</u>|<i>A6</i><u><b>T6</b>x</u>|<i>A7</i><u>B7</u>';
	assert.eq(html(), want);
	assert.eq(el.querySelectorAll('p')[3].querySelector('i').childNodes.length, 0); // No empty text node.

	// Again in the other order, into the same master.
	rows = rows.map(r => ({...r, id: r.id + 10})).reverse();
	render();
	assert.eq(html(), want.split('|').reverse().join('|'));
});

Testimony.test('Solarite.stamp.rewriteAfterOutsideTextContent', `After a row was rewritten once, something outside the library replaces the cell's text; the next rewrite must still show the new value.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, a: 'one'}, {id: 2, a: 'two'}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><i>${r.a}</i></p>`)}</div>`;
	render();
	rows[0] = {id: 1, a: 'ONE'};
	render();
	let i = el.querySelector('i');
	assert.eq(i.textContent, 'ONE');

	i.textContent = 'edited elsewhere'; // A new Text node replaces the old one.
	rows[0] = {id: 1, a: 'uno'};
	render();
	assert.eq(i.textContent, 'uno');
	el.remove();
});

Testimony.test('Solarite.stamp.rewriteAfterNormalize', `A cell rewritten to the empty string keeps an empty text node; normalize() on any ancestor removes it, and the next rewrite must still show.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, a: 'one'}, {id: 2, a: 'two'}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><i>${r.a}</i></p>`)}</div>`;
	render();
	rows[0] = {id: 1, a: ''};
	render();
	let i = el.querySelector('i');
	assert.eq(i.textContent, '');

	el.normalize(); // Standard DOM call; removes empty Text nodes.
	rows[0] = {id: 1, a: 'back'};
	render();
	assert.eq(i.textContent, 'back');
	el.remove();
});

Testimony.test('Solarite.stamp.rewriteAfterSplitText', `A search highlighter splits a cell's text and wraps the match in <mark>, leaving the original Text node in place as the first piece.  The next rewrite must replace the whole cell.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, a: 'one'}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><i>${r.a}</i></p>`)}</div>`;
	render();
	rows[0] = {id: 1, a: 'find me here'};
	render();
	let i = el.querySelector('i');
	let tail = i.firstChild.splitText(5), mark = document.createElement('mark');
	tail.replaceWith(mark);
	mark.append(tail);
	assert.eq(i.innerHTML, 'find <mark>me here</mark>');

	rows[0] = {id: 1, a: 'new text'};
	render();
	assert.eq(i.innerHTML, 'new text');
	el.remove();
});

Testimony.test('Solarite.stamp.rewriteAfterWrappedText', `A page translator wraps a cell's text in a <font> element.  The next rewrite must replace it.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, a: 'one'}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><i>${r.a}</i></p>`)}</div>`;
	render();
	rows[0] = {id: 1, a: 'two'};
	render();
	let i = el.querySelector('i');
	let font = document.createElement('font');
	font.textContent = 'deux';
	i.firstChild.replaceWith(font);

	rows[0] = {id: 1, a: 'three'};
	render();
	assert.eq(i.innerHTML, 'three');
	el.remove();
});

Testimony.test('Solarite.stamp.translatedCellToTemplate', `A list row's cell whose text a page translator replaced shows only the new template when its text changes to a template, and only the new text when it changes back, in an h.map() list with and without keys, in an array, and in a row taken from the pool.  A cell beside it whose text is unchanged keeps its translation.`, () => {
	for (let kind of ['mapped', 'mappedKeyed', 'array', 'pooled']) {
		let el = document.createElement('div');
		let rows = [{id: 1, a: 'Alice', b: 'admin'}, {id: 2, a: 'Bob', b: 'user'}];
		let row = kind === 'mappedKeyed'
			? r => h`<li key=${r.id}><span>${r.a}</span><b>${r.b}</b></li>`
			: r => h`<li><span>${r.a}</span><b>${r.b}</b></li>`;
		let render = () => kind === 'array' ? h(el)`<ul>${rows.map(row)}</ul>` : h(el)`<ul>${h.map(rows, row)}</ul>`;
		render();
		translatePage(el);
		let li = el.querySelectorAll('li')[1];

		// Only b changes, from text to a template.  A row of the pool is given an item whose a is
		// the text it showed.
		if (kind === 'pooled') {
			rows = [rows[0]];
			render();
			rows = [rows[0], {id: 3, a: 'Bob', b: h`<i>editor</i>`}];
		}
		else
			rows = [rows[0], {...rows[1], b: h`<i>editor</i>`}];
		render();
		assert.eq(el.querySelectorAll('li')[1], li, kind);
		assert.eq(li.querySelector('b').innerHTML, '<i>editor</i>', kind);
		assert.eq(li.querySelector('span').textContent, 'T:Bob', kind);

		// Back to text, and the other cell changes as well.
		rows = [rows[0], {...rows[1], a: 'Robert', b: 'owner'}];
		render();
		assert.eq(li.querySelector('b').innerHTML, 'owner', kind);
		assert.eq(li.querySelector('span').innerHTML, 'Robert', kind);
	}

	// A row that is one cell.
	let el = document.createElement('div');
	let items = [{v: 'one'}, {v: 'two'}];
	let render = () => h(el)`<ul>${h.map(items, item => h`<li>${item.v}</li>`)}</ul>`;
	render();
	translatePage(el);
	items = [{v: h`<b>bold</b>`}, items[1]];
	render();
	assert.eq(el.querySelector('ul').innerHTML.replace(/<font[^>]*>/g, '<font>'), '<li><b>bold</b></li><li><font><font>T:two</font></font></li>');
	items = [{v: 'three'}, items[1]];
	render();
	assert.eq(el.querySelector('li').innerHTML, 'three');
});

Testimony.test('Solarite.stamp.materializeReleasesKeptText', `White box: after a cell that was rewritten as text becomes a template, the row holds no node that is no longer in its own subtree.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, a: 'one'}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id} onclick=${() => {}}><i>${r.a}</i></p>`)}</div>`;
	render();
	rows[0] = {id: 1, a: 'ONE'};
	render();
	rows[0] = {id: 1, a: h`<b>bold</b>`};
	render();
	let p = el.querySelector('p');
	assert.eq(p.innerHTML, '<i><b>bold</b></i>');
	let ng = Object.getOwnPropertySymbols(p).map(k => p[k]).find(v => v && v.startNode === p);
	assert(ng);
	let kept = (ng.stampSlotsCache || []).filter(n => n && n !== p && !p.contains(n));
	assert.eq(kept.length, 0);
	el.remove();
});

Testimony.test('Solarite.stamp.clickAndUpdateInterleaved', `The row's kept nodes are shared by the dispatcher (which resolves up to the event's node) and the rewrite (which resolves up to the text's parent), in either order and with the event node before or after the text.`, () => {
	const shapes = [
		r => h`<p key=${r.id}><a onclick=${[x => hits.push('a' + x.a), r]}>go</a><i>${r.a}</i><u class=${r.c}>${r.b}</u></p>`,
		r => h`<p key=${r.id}><i>${r.a}</i><u class=${r.c}>${r.b}</u><a onclick=${[x => hits.push('a' + x.a), r]}>go</a></p>`,
		r => h`<p key=${r.id} class=${r.c}><i>${r.a}</i><a onclick=${[x => hits.push('a' + x.a), r]}><u>${r.b}</u></a></p>`
	];
	let hits = [];
	for (let shape of shapes)
		for (let clickFirst of [true, false]) {
			let el = document.createElement('div');
			document.body.append(el);
			let rows = [{id: 1, a: 'one', b: 1, c: 'x'}, {id: 2, a: 'two', b: 2, c: ''}];
			let render = () => h(el)`<div>${h.map(rows, shape)}</div>`;
			render();
			let p = el.querySelector('p'), a = p.querySelector('a'), i = p.querySelector('i'), u = p.querySelector('u');
			let uc = () => p.className || u.className;
			if (clickFirst) {
				a.click();
				assert.eq(hits.pop(), 'aone');
			}
			rows[0] = {id: 1, a: 'ONE', b: 1, c: 'x'}; // Only the first text.
			render();
			assert.eq(i.textContent + '|' + u.textContent + '|' + uc(), 'ONE|1|x');
			a.click();
			assert.eq(hits.pop(), 'aONE');
			rows[0] = {id: 1, a: 'ONE', b: 11, c: 'y'}; // Only the second text and the class.
			render();
			assert.eq(i.textContent + '|' + u.textContent + '|' + uc(), 'ONE|11|y');
			rows[0] = {id: 1, a: '', b: '', c: ''};
			render();
			assert.eq(i.textContent + '|' + u.textContent + '|' + uc(), '||');
			a.click();
			assert.eq(hits.pop(), 'a');
			rows[0] = {id: 1, a: 0, b: 'z', c: 'q'};
			render();
			assert.eq(i.textContent + '|' + u.textContent + '|' + uc(), '0|z|q');
			assert.eq(el.querySelector('p'), p);
			assert.eq(el.querySelectorAll('p')[1].textContent.replace('go', ''), 'two2');
			el.remove();
		}
});

Testimony.test('Solarite.stamp.emptyChildLeavesNoNode', `A row whose child expression is '' has no text node in that cell, like every other way of rendering it, and later rows aren't affected.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, a: ''}, {id: 2, a: 'two'}, {id: 3, a: ''}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><i>${r.a}</i><u>${r.id}</u></p>`)}</div>`;
	render();
	let ps = el.querySelectorAll('p');
	assert.eq(ps[0].firstChild.childNodes.length, 0);
	assert.eq(ps[0].firstChild.hasChildNodes(), false);
	assert.eq(ps[1].firstChild.textContent, 'two');
	assert.eq(ps[1].firstChild.childNodes.length, 1);
	assert.eq(ps[2].firstChild.childNodes.length, 0);
	assert.eq(ps[2].lastChild.textContent, '3');
	// An empty cell can be written later, and a written one emptied.
	rows[0] = {id: 1, a: 'one'};
	rows[1] = {id: 2, a: ''};
	render();
	assert.eq(el.querySelectorAll('p')[0], ps[0]);
	assert.eq(ps[0].firstChild.textContent, 'one');
	assert.eq(ps[1].firstChild.textContent, '');
	el.remove();
});

Testimony.test('Solarite.stamp.rewriteKeepsTextNode', `A row rewritten in place writes into the text node it already has: the node stays the same object, a cell that gains its text later keeps the node it gets, and a row re-applied through the raw-node list route in between is still written correctly afterwards.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, a: 'one', b: 1}, {id: 2, a: 'two', b: 2}];
	let render = () => h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><i>${r.a}</i><u>${r.b}</u></p>`)}</div>`;
	render();
	let p = el.querySelector('p'), i = p.firstChild, u = p.lastChild;
	let tn = i.firstChild, un = u.firstChild;

	// 1. Repeated rewrites reuse the row's own text nodes.
	for (let n = 0; n < 3; n++) {
		rows[0] = {id: 1, a: 'one' + n, b: 10 + n};
		render();
		assert.eq(i.firstChild, tn);
		assert.eq(tn.nodeValue, 'one' + n);
		assert.eq(u.firstChild, un);
		assert.eq(un.nodeValue, '' + (10 + n));
	}
	assert.eq(i.childNodes.length, 1);

	// 2. Only the child that changed is written.
	rows[0] = {id: 1, a: 'one2', b: 99};
	render();
	assert.eq(i.textContent, 'one2');
	assert.eq(u.textContent, '99');
	assert.eq(el.querySelectorAll('p')[1].textContent, 'two2');

	// 3. A cell that starts empty has no text node; once written it keeps the one it gets.
	rows.push({id: 3, a: '', b: 3});
	render();
	let i3 = el.querySelectorAll('p')[2].firstChild;
	assert.eq(i3.childNodes.length, 0);
	rows[2] = {id: 3, a: 'three', b: 3};
	render();
	let tn3 = i3.firstChild;
	assert.eq(tn3.nodeValue, 'three');
	rows[2] = {id: 3, a: 'THREE', b: 3};
	render();
	assert.eq(i3.firstChild, tn3);
	assert.eq(i3.textContent, 'THREE');
	el.remove();

	// 4. The raw-node list route replaces a row's text node; a later in-place rewrite must
	// write the node that is in the document, not the one the row wrote before.
	let el2 = document.createElement('div');
	document.body.append(el2);
	let hr = document.createElement('hr');
	let quote = text => h`<q>${text}</q>`; // One template site, so the rows share a shell.
	let items = [quote('a')];
	let render2 = () => h(el2)`<div>${items}</div>`;
	render2();
	let q = el2.querySelector('q');
	items = [quote('b')];
	render2(); // Rewritten in place.
	assert.eq(q.textContent, 'b');
	items = [quote('c'), hr];
	render2(); // Re-applied through the raw-node route.
	assert.eq(el2.querySelector('q'), q);
	assert.eq(q.textContent, 'c');
	for (let text of ['d', 'e', 'f']) { // The first of these still takes the raw-node route.
		items = [quote(text)];
		render2();
		assert.eq(el2.querySelector('q'), q);
		assert.eq(q.textContent, text);
		assert.eq(q.childNodes.length, 1);
	}
	el2.remove();
});

//endregion




/*┌─────────────────╮
  | Delegation      |
  └─────────────────╯*/
//region delegation
// Tests for event delegation, which is on by default: a template handler is stored on its
// element, and when an event of that type starts, a capture-phase listener on the component
// root and on the document attaches a real listener to each element on the event's path that
// has one, so the browser dispatches them natively.  Pass eventDelegation:false to opt out, or
// prefix one attribute with native: to bind just that handler at render time.  List rows are
// the exception: nothing is stored on their elements, and the dispatcher reads their handlers
// from the row's template.  See createDispatcher() in PathToAttribValue.js.

Testimony.test('Solarite.delegation.click', `A delegated handler gets the usual arguments and this.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let count = 0, gotEl = null, gotThis = null;
	h(el, {eventDelegation: true})`<button onclick=${function(e, btn) { count++; gotEl = btn; gotThis = this; }}>hi</button>`;

	let btn = el.firstChild;
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(count, 1);
	assert.eq(gotEl, btn);
	assert.eq(gotThis, el);

	el.remove();
});

Testimony.test('Solarite.delegation.args', `Array-form handlers receive args through delegation.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let got = null;
	let rows = ['a', 'b'];
	h(el, {eventDelegation: true})`${rows.map(r => h`<p onclick=${[(arg, e, p) => got = [arg, p], r]}>${r}</p>`)}`;

	el.children[1].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(got[0], 'b');
	assert.eq(got[1], el.children[1]);

	el.remove();
});

Testimony.test('Solarite.delegation.argCounts', `A handler written as an array gets its own arguments, then the event and the element, with the root as this, however many arguments it has.  The same holds for an element of the root's own template, for a list row, and for handlers bound with addEventListener.`, () => {
	for (let eventDelegation of [true, false]) {
		let el = document.createElement('div');
		document.body.append(el);
		let log = [];
		let fn = function(...args) {
			let node = args.pop(), ev = args.pop();
			log.push([this === el, ev.type, node.tagName, ...args].join(' '));
			return args.length;
		};
		let handlers = [fn, [fn], [fn, 'a'], [fn, 'a', 'b'], [fn, 'a', 'b', 'c'], [fn, 'a', 'b', 'c', 'd']];
		h(el, {eventDelegation})`<div>
			<s onclick=${handlers[0]}></s><s onclick=${handlers[1]}></s><s onclick=${handlers[2]}></s>
			<s onclick=${handlers[3]}></s><s onclick=${handlers[4]}></s><s onclick=${handlers[5]}></s>
			${handlers.map(handler => h`<b onclick=${handler}>x</b>`)}</div>`;

		let own = el.querySelectorAll('s'), rows = el.querySelectorAll('b');
		for (let i=0; i<handlers.length; i++) {
			own[i].dispatchEvent(new MouseEvent('click', {bubbles: true}));
			rows[i].dispatchEvent(new MouseEvent('click', {bubbles: true}));
		}
		let expected = ['', '', ' a', ' a b', ' a b c', ' a b c d'];
		assert.eq(log.join(), expected.map(args => `true click S${args},true click B${args}`).join());

		// A binding made with addEventListener hands back what its handler returned.
		if (!eventDelegation)
			assert.eq([...own].map(s => getEventBinding(s, 'click').handleEvent(new MouseEvent('click'))).join(), '0,0,1,2,3,4');
		el.remove();
	}
});

Testimony.test('Solarite.delegation.currentTarget', `currentTarget is the bound element, not the document.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let got = null;
	h(el, {eventDelegation: true})`<div onclick=${e => got = e.currentTarget}><span>inner</span></div>`;

	let span = el.querySelector('span');
	span.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(got, el.firstChild);

	el.remove();
});

Testimony.test('Solarite.delegation.bubbling', `Inner and outer delegated handlers both fire, inner first; stopPropagation halts.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let order = [];
	let stop = false;
	h(el, {eventDelegation: true})`
		<div onclick=${() => order.push('outer')}>
			<button onclick=${e => { order.push('inner'); if (stop) e.stopPropagation(); }}>hi</button>
		</div>`;

	let btn = el.querySelector('button');
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(order.join(','), 'inner,outer');

	order = [];
	stop = true;
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(order.join(','), 'inner');

	el.remove();
});

Testimony.test('Solarite.delegation.rebind', `Re-renders swap the handler without double-firing.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let counts = [0, 0];
	let render = which => h(el, {eventDelegation: true})`<button onclick=${() => counts[which]++}>hi</button>`;

	render(0);
	let btn = el.firstChild;
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(counts.join(','), '1,0');

	render(1);
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(counts.join(','), '1,1');

	el.remove();
});

Testimony.test('Solarite.delegation.array', `An event-name array delegates only the listed events; others bind directly.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let clicks = 0, inputs = 0;
	h(el, {eventDelegation: ['click']})`<input onclick=${() => clicks++} oninput=${() => inputs++}>`;

	let input = el.firstChild;
	input.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	input.dispatchEvent(new Event('input', {bubbles: true}));
	assert.eq(clicks, 1);
	assert.eq(inputs, 1);

	el.remove();
});

Testimony.test('Solarite.delegation.nonBubbling', `Non-bubbling events still work with the option on.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let scrolls = 0;
	h(el, {eventDelegation: true})`<div style="overflow:auto; height: 10px;" onscroll=${() => scrolls++}><div style="height: 100px;"></div></div>`;

	el.firstChild.dispatchEvent(new Event('scroll')); // scroll doesn't bubble.
	assert.eq(scrolls, 1);

	el.remove();
});

Testimony.test('Solarite.delegation.keyedMove', `Delegated handlers follow keyed rows when they move.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let got = null;
	let render = rows => h(el, {eventDelegation: true})`${rows.map(r =>
		h`<p key=${r.id} onclick=${[id => got = id, r.id]}>${r.label}</p>`)}`;

	let rows = [{id: 1, label: 'a'}, {id: 2, label: 'b'}];
	render(rows);
	rows.reverse();
	render(rows);

	el.children[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(got, 2);

	el.remove();
});

Testimony.test('Solarite.delegation.defaultOn', `Delegation is on by default without passing the option, and behaves like a real listener.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let count = 0;
	h(el)`<div><button onclick=${() => count++}>hi</button></div>`;

	let btn = el.querySelector('button');
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(count, 1);

	// A non-bubbling event reaches it too: the dispatcher attaches the listener during the
	// capture phase, which descends the whole path whether or not the event bubbles.
	btn.dispatchEvent(new MouseEvent('click'));
	assert.eq(count, 2);

	el.remove();
});

Testimony.test('Solarite.delegation.off', `eventDelegation:false binds every event directly.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let count = 0;
	h(el, {eventDelegation: false})`<div><button onclick=${() => count++}>hi</button></div>`;

	// Direct binding fires even for a non-bubbling event dispatched on the button itself.
	el.querySelector('button').dispatchEvent(new MouseEvent('click'));
	assert.eq(count, 1);

	el.remove();
});

Testimony.test('Solarite.delegation.offSeveralBindings', `With eventDelegation:false one element can hold several handlers and a two-way binding.  Each is one listener, a re-render replaces the function it calls without adding another, and getEventBinding() finds each by its own key.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let log = [];
	let model = {text: 'a'};
	let render = n => h(el, {eventDelegation: false})`<input value=${[model, 'text']}
		onclick=${() => log.push('click' + n)}
		onkeyup=${[function(tag, ev, node) { log.push(tag + n + node.tagName + (this === el)) }, 'keyup']}
		onfocus=${() => log.push('focus' + n)}>`;
	let fire = input => {
		input.dispatchEvent(new MouseEvent('click'));
		input.dispatchEvent(new KeyboardEvent('keyup'));
		input.dispatchEvent(new FocusEvent('focus'));
		input.value += 'b';
		input.dispatchEvent(new Event('input'));
	};

	// 1. Four bindings on one element, each found by its key.  A two-way binding's key is its
	// attribute's name, not the name of the event it listens for.
	render(1);
	let input = el.firstChild;
	let keys = ['value', 'click', 'keyup', 'focus'];
	let bindings = keys.map(key => getEventBinding(input, key));
	assert.eq(bindings.map(b => typeof b?.handleEvent).join(), 'function,function,function,function');
	assert.eq(new Set(bindings).size, 4);
	assert.eq(getEventBinding(input, 'input'), undefined);
	fire(input);
	assert.eq(log.join(), 'click1,keyup1INPUTtrue,focus1');
	assert.eq(model.text, 'ab');

	// 2. A re-render keeps the same four bindings; each now calls the new function, once.
	log = [];
	render(2);
	assert.eq(keys.map((key, i) => getEventBinding(input, key) === bindings[i]).join(), 'true,true,true,true');
	fire(input);
	assert.eq(log.join(), 'click2,keyup2INPUTtrue,focus2');
	assert.eq(model.text, 'abb');

	el.remove();
});

Testimony.test('Solarite.delegation.detached', `Delegated handlers work while the component is detached from the document.`, () => {
	class D80 extends Solarite {
		count = 0;
		render() {
			h(this)`<d-80><button onclick=${() => this.count++}>hi</button></d-80>`;
		}
	}
	D80.define();

	let a = new D80(); // Never appended to the document.
	a.render();
	a.querySelector('button').dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(a.count, 1);
});

Testimony.test('Solarite.delegation.documentOptionIgnored', `The retired eventDelegation:'document' option is accepted and simply delegates.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let count = 0;
	h(el, {eventDelegation: 'document'})`<div><button onclick=${() => count++}>hi</button></div>`;

	el.querySelector('button').click();
	assert.eq(count, 1);

	el.remove();
});

Testimony.test('Solarite.delegation.stampedReparented', `The handlers of list rows made by the compiled stamp program keep working after a row is moved outside its component.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let hits = [];
	let rows = [1, 2, 3];
	h(el)`<div>${rows.map(n =>
		h`<p key=${n} onmouseup=${[i => hits.push(i), n]}>row</p>`)}</div>`;

	// These handlers stay in the row's template and never go through bindEvent(), so the row
	// registers the dispatcher itself (registerRowDispatchers), and the document half of that
	// registration is what still reaches a row after it has been moved out from under its root.
	let p = el.querySelectorAll('p')[1];
	let elsewhere = document.createElement('div');
	document.body.append(elsewhere);
	elsewhere.append(p);
	p.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	assert.eq(hits.join(), '2');

	el.remove();
	elsewhere.remove();
});

Testimony.test('Solarite.delegation.nested', `Nested components each delegate without double-firing.`, () => {
	let outer = 0, inner = 0, outerThis = null, innerThis = null;

	class D90Inner extends Solarite {
		render() {
			h(this)`<d-90-inner><button onclick=${function() { inner++; innerThis = this; }}>inner</button></d-90-inner>`;
		}
	}
	D90Inner.define();

	class D90Outer extends Solarite {
		render() {
			h(this)`<d-90-outer onclick=${function() { outer++; outerThis = this; }}><d-90-inner></d-90-inner></d-90-outer>`;
		}
	}
	D90Outer.define();

	let a = new D90Outer();
	document.body.append(a);

	a.querySelector('button').dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(inner, 1); // Inner handler fires exactly once, not twice.
	assert.eq(outer, 1); // Outer handler also fires once as the click bubbles up.
	assert.eq(innerThis, a.firstChild); // Each handler runs with its own component as this.
	assert.eq(outerThis, a);

	a.remove();
});


// The four tests below were written as failing reproductions of the defects in the old
// bubble-phase dispatcher, which ran every delegated handler only once the event reached the
// component root.  Each asserts what the browser itself does, which is also what Solarite
// produces with eventDelegation:false -- delegation is an optimization, not a change in
// semantics.  The "Old dispatcher:" comments record what used to happen.

Testimony.test('Solarite.delegation.stopPropagationVsRealListener', `A delegated handler's stopPropagation stops a real listener on an ancestor.`, () => {

	// A confirm button that stops propagation to keep its container from also acting.  The
	// old dispatcher ran the button's handler only when the event reached the component
	// root, after the container's real listener, so stopPropagation() came too late.
	let order = [];
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<div><button onclick=${e => {order.push('button'); e.stopPropagation()}}>x</button></div>`;
	el.firstChild.addEventListener('click', () => order.push('div'));

	el.querySelector('button').click();

	assert.eq(order.join(), 'button'); // Old dispatcher: 'div,button'.

	el.remove();
});

Testimony.test('Solarite.delegation.realListenerStopsDelegated', `An ancestor's stopPropagation must not cancel a handler below it.`, () => {

	// The same ordering seen from the other side.  The button's handler has already run by
	// the time the ancestor's does, so stopping propagation up there is too late to silence
	// it.  With the old dispatcher the event never reached the root and the button's handler
	// was skipped entirely.
	let order = [];
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<div><button onclick=${() => order.push('button')}>x</button></div>`;
	el.firstChild.addEventListener('click', e => {order.push('div'); e.stopPropagation()});

	el.querySelector('button').click();

	assert.eq(order.join(), 'button,div'); // Old dispatcher: 'div'.

	el.remove();
});

Testimony.test('Solarite.delegation.syntheticNonBubbling', `A synthetic event that doesn't bubble still reaches a delegated handler.`, () => {

	// new Event('input') defaults to bubbles:false, so it never reached the old root-level
	// dispatcher.  Anything replaying recorded events, or a test driving a control directly,
	// saw the handler silently do nothing.  Capture descends the whole path regardless.
	let count = 0;
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<input oninput=${() => count++}>`;

	el.firstChild.dispatchEvent(new Event('input'));

	assert.eq(count, 1); // Old dispatcher: 0.

	el.remove();
});

Testimony.test('Solarite.delegation.reparented', `A node moved outside its component keeps its delegated handlers.`, () => {

	// Moving a rendered node elsewhere in the page -- docking a toolbar, portaling a menu --
	// takes it off the path to its component root.  The old dispatcher lost it unless the
	// component had passed the eventDelegation:'document' opt-in; now the dispatcher on the
	// document reaches it wherever it lives.
	let count = 0;
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<button onkeyup=${() => count++}>x</button>`;

	let button = el.firstChild;
	document.body.append(button); // Now a sibling of el instead of a descendant.
	button.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true}));

	assert.eq(count, 1); // Old dispatcher: 0.

	button.remove();
	el.remove();
});

Testimony.test('Solarite.delegation.sameNodeOrder', `A delegated handler runs after every listener its element already had, even after an earlier dispatch in the same task.`, () => {
	let order = [];
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<button onclick=${() => order.push('template')}>x</button>`;
	let button = el.firstChild;
	button.addEventListener('click', () => order.push('first'));

	button.click();
	assert.eq(order.join(), 'first,template');

	// The temporary listener for the click above is already gone: it is removed when the event
	// reaches the last element it has a handler on.  A listener added now still runs before the
	// template handler, because the dispatcher attaches its own listener only when the next
	// event starts.
	button.addEventListener('click', () => order.push('second'));
	order = [];
	button.click();
	assert.eq(order.join(), 'first,second,template');

	el.remove();
});

Testimony.test('Solarite.delegation.reentrant', `A handler that dispatches another event of the same type mid-dispatch leaves the outer dispatch intact.`, () => {
	let order = [];
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<div onclick=${() => order.push('div')}>
		<button onclick=${() => { order.push('a'); el.querySelector('.b').click(); }}>a</button>
		<button class="b" onclick=${() => order.push('b')}>b</button>
	</div>`;

	el.querySelector('button').click();
	// The nested click on b runs to completion (b, then their shared div), then the outer click
	// continues up to the div -- exactly what four addEventListener calls would give.
	assert.eq(order.join(), 'a,b,div,div');

	el.remove();
});

Testimony.test('Solarite.delegation.rerenderMidDispatch', `A handler that re-renders swaps an ancestor's handler before the event reaches it, and the new one runs.`, () => {
	let hits = [];
	let el = document.createElement('div');
	document.body.append(el);
	let render = n => h(el)`<div onclick=${() => hits.push('div' + n)}><button onclick=${() => { hits.push('button'); render(2); }}>x</button></div>`;
	render(1);

	el.querySelector('button').click();
	// A listener bound at render time reads its current handler too, so this matches
	// eventDelegation:false; what must not happen is the stale div1 running, or a throw.
	assert.eq(hits.join(), 'button,div2');

	el.remove();
});

Testimony.test('Solarite.delegation.captureStopOnAncestor', `An ancestor's capture-phase stopPropagation keeps a delegated handler below it from running.`, () => {
	let count = 0;
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<div><button onclick=${() => count++}>x</button></div>`;
	el.firstChild.addEventListener('click', e => e.stopPropagation(), true);

	el.querySelector('button').click();
	assert.eq(count, 0);

	el.remove();
});

Testimony.test('Solarite.delegation.shadowRoot', `Handlers inside a closed shadow root fire, for a synthetic event that never reaches the document and for a real click the document can't see into.`, () => {
	let order = [];
	let host = document.createElement('div');
	document.body.append(host);
	let el = document.createElement('div');
	host.attachShadow({mode: 'closed'}).append(el);
	h(el)`<div onclick=${() => order.push('div')}><button onclick=${() => order.push('button')}>x</button></div>`;

	// composed defaults to false, so this event stops at the shadow root and the dispatcher on
	// the document never runs; the one on the component root is what handles it.
	el.querySelector('button').dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(order.join(), 'button,div');

	// click() is composed and does reach the document, whose composedPath() hides everything
	// inside a closed root, so the root's dispatcher has to walk the path again itself.
	order = [];
	el.querySelector('button').click();
	assert.eq(order.join(), 'button,div');

	host.remove();
});

Testimony.test('Solarite.delegation.nativePrefix', `native:onclick registers one handler with addEventListener while the rest of the component stays delegated.`, () => {
	let order = [];
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<div><button native:onclick=${function(e, btn) { order.push('button'); e.stopPropagation(); this.hit = btn; }}>x</button></div>`;
	let div = el.firstChild, button = div.firstChild;
	div.addEventListener('click', () => order.push('div'));

	// Registered at render, so it runs at the button's own turn and can stop the div's real listener.
	button.click();
	assert.eq(order.join(), 'button');
	assert.eq(el.hit, button); // The usual (event, element) signature with the root as `this`.

	// The prefixed attribute never reaches the DOM.
	assert.eq(button.hasAttribute('native:onclick'), false);

	// A non-bubbling synthetic event reaches it too, which a delegated handler can't hear.
	order = [];
	button.dispatchEvent(new MouseEvent('click'));
	assert.eq(order.join(), 'button');

	el.remove();
});

// Helpers for the tests below that compare delegated handlers with listeners bound at render, or
// that check which temporary listeners an event leaves behind.

/** @return {HTMLDivElement} A new element attached to the document. */
function attachedDiv() {
	let el = document.createElement('div');
	document.body.append(el);
	return el;
}

/**
 * Run a scenario once delegated (the default) and once with eventDelegation:false, which
 * binds real listeners at render and is therefore the browser's own answer.
 * @param scenario {function(HTMLElement, Object, string[])} Given a host, render options and a log.
 * @return {string[]} [delegated log, native log], each joined with commas. */
function delegatedAndNative(scenario) {
	let out = [];
	for (let opt of [true, false]) {
		let el = attachedDiv();
		let log = [];
		try { scenario(el, {eventDelegation: opt}, log); }
		finally { el.remove(); }
		out.push(log.join());
	}
	return out;
}

/**
 * Track the bubble-phase listeners of one event type that are added and removed while fn runs.
 * @param type {string}
 * @param fn {function(Map<EventTarget, Set>)} Given the live map.
 * @return {Map<EventTarget, Set>} What was still attached when fn returned. */
function trackListeners(type, fn) {
	let live = new Map(), origAdd = EventTarget.prototype.addEventListener, origRemove = EventTarget.prototype.removeEventListener;
	EventTarget.prototype.addEventListener = function(t, l, o) {
		if (t === type && !o) {
			let set = live.get(this) || new Set();
			set.add(l);
			live.set(this, set);
		}
		return origAdd.call(this, t, l, o);
	};
	EventTarget.prototype.removeEventListener = function(t, l, o) {
		if (t === type && !o) {
			let set = live.get(this);
			if (set) {
				set.delete(l);
				if (!set.size)
					live.delete(this);
			}
		}
		return origRemove.call(this, t, l, o);
	};
	try { fn(live); }
	finally { EventTarget.prototype.addEventListener = origAdd; EventTarget.prototype.removeEventListener = origRemove; }
	return live;
}

Testimony.test('Solarite.delegation.redispatchDifferentDepth', `One Event object dispatched on two elements at different depths runs the handler of each.`, () => {
	let [d, n] = delegatedAndNative((el, opt, log) => {
		h(el, opt)`<div><a onclick=${() => log.push('a')}>a</a><p><b onclick=${() => log.push('b')}>b</b></p></div>`;
		let ev = new MouseEvent('click', {bubbles: true});
		el.querySelector('a').dispatchEvent(ev);
		el.querySelector('b').dispatchEvent(ev);
	});
	assert.eq(n, 'a,b');
	assert.eq(d, n);
});

Testimony.test('Solarite.delegation.redispatchDifferentDepthRows', `One Event object dispatched on two list rows at different depths runs the handlers of each.`, () => {
	let [d, n] = delegatedAndNative((el, opt, log) => {
		let rows = [{id: 1}, {id: 2}];
		h(el, opt)`<div>${h.map(rows, r => h`<p key=${r.id} onclick=${[row => log.push('p' + row.id), r]}><span><b onclick=${[row => log.push('b' + row.id), r]}>x</b></span></p>`)}</div>`;
		let ev = new MouseEvent('click', {bubbles: true});
		el.querySelectorAll('p')[0].dispatchEvent(ev);
		el.querySelectorAll('b')[1].dispatchEvent(ev);
	});
	assert.eq(n, 'p1,b2,p2');
	assert.eq(d, n);
});

Testimony.test('Solarite.delegation.redispatchSameDepth', `One Event object dispatched on two siblings (same path length).`, () => {
	let [d, n] = delegatedAndNative((el, opt, log) => {
		h(el, opt)`<div><a onclick=${() => log.push('a')}>a</a><b onclick=${() => log.push('b')}>b</b></div>`;
		let ev = new MouseEvent('click', {bubbles: true});
		el.querySelector('a').dispatchEvent(ev);
		el.querySelector('b').dispatchEvent(ev);
	});
	assert.eq(n, 'a,b');
	assert.eq(d, n);
});

Testimony.test('Solarite.delegation.redispatchSameDepthRows', `One Event object dispatched on two list rows that sit at the same depth runs the handler of each.`, () => {
	let [d, n] = delegatedAndNative((el, opt, log) => {
		let rows = [{id: 1}, {id: 2}];
		h(el, opt)`<div>${h.map(rows, r => h`<p key=${r.id} onclick=${[row => log.push('p' + row.id), r]}>x</p>`)}</div>`;
		let ps = el.querySelectorAll('p'), ev = new MouseEvent('click', {bubbles: true});
		ps[0].dispatchEvent(ev);
		ps[1].dispatchEvent(ev);
	});
	assert.eq(n, 'p1,p2');
	assert.eq(d, n);
});

Testimony.test('Solarite.delegation.redispatchDetachedRoot', `One Event object dispatched on two elements at different depths of a detached root.`, () => {
	let el = document.createElement('div');
	let log = [];
	h(el)`<div><a onclick=${() => log.push('a')}>a</a><p><b onclick=${() => log.push('b')}>b</b></p></div>`;
	let ev = new MouseEvent('click', {bubbles: true});
	el.querySelector('a').dispatchEvent(ev);
	el.querySelector('b').dispatchEvent(ev);
	assert.eq(log.join(), 'a,b');
});

Testimony.test('Solarite.delegation.redispatchAfterStop', `An Event object whose first dispatch was stopped part-way is dispatched again elsewhere; each handler on the second path runs once.`, () => {
	let [d, n] = delegatedAndNative((el, opt, log) => {
		h(el, opt)`<div onclick=${() => log.push('div')}><a onclick=${e => { log.push('a'); e.stopPropagation(); }}>a</a><p onclick=${() => log.push('p')}><b onclick=${() => log.push('b')}>b</b></p></div>`;
		let ev = new MouseEvent('click', {bubbles: true});
		el.querySelector('a').dispatchEvent(ev);
		el.querySelector('b').dispatchEvent(ev);
		log.push('|');
		el.querySelector('b').click();
	});
	assert.eq(n, 'a,b,p,div,|,b,p,div');
	assert.eq(d, n);
});

Testimony.test('Solarite.delegation.dispatcherThrows', `A row whose static structure outside code broke makes the dispatcher throw; afterwards handlers elsewhere on the path still obey the ordering rule.`, () => {
	let el = attachedDiv();
	let order = [];
	let rows = [{id: 1}];
	h(el)`<div>${h.map(rows, r => h`<p key=${r.id}><span>${h`<b onclick=${() => order.push('template')}>x</b>`}</span><i><u onclick=${[() => order.push('u'), r]}>u</u></i></p>`)}</div>`;
	let b = el.querySelector('b');
	el.querySelector('i').remove(); // Outside code breaks the row.
	let errors = 0;
	let swallow = e => { errors++; e.preventDefault(); };
	window.addEventListener('error', swallow);
	try {
		b.click();
		b.addEventListener('click', () => order.push('late'));
		order.length = 0;
		b.click();
	}
	finally { window.removeEventListener('error', swallow); }
	// A delegated handler runs after every listener its element had when the event started.
	assert.eq(order.join(), 'late,template');
	el.remove();
});

Testimony.test('Solarite.delegation.listenerBalance', `Every temporary listener attached for an event that ran to its end is removed again, across nested lists, nested dispatch, re-render and row removal mid-dispatch.`, () => {
	let el = attachedDiv();
	let log = [];
	let groups = [{id: 1, items: [{id: 11}, {id: 12}]}, {id: 2, items: [{id: 21}]}];
	let render = () => h(el)`<div onclick=${() => log.push('root')}>${h.map(groups, g =>
		h`<section key=${g.id} onclick=${[x => log.push('g' + x.id), g]}>${h.map(g.items, it =>
			h`<li key=${it.id} onclick=${[x => log.push('i' + x.id), it]}><a onclick=${[x => {
				log.push('a' + x.id);
				if (x.id === 11)
					el.querySelectorAll('a')[2]?.click();
				if (x.id === 12) {
					groups = [{id: 1, items: [groups[0].items[0]]}, groups[1]];
					render();
				}
			}, it]}>x</a></li>`)}</section>`)}</div>`;
	render();
	let live = trackListeners('click', () => {
		el.querySelectorAll('a')[0].click();
		el.querySelectorAll('a')[1].click();
		el.querySelectorAll('a')[0].click();
	});
	assert.eq(log.join(), 'a11,a21,i21,g2,root,i11,g1,root,a12,i12,g1,root,a11,i11,g1,root');
	assert.eq(live.size, 0);
	el.remove();
});

Testimony.test('Solarite.delegation.nestedInnerStopped', `A nested dispatch whose propagation is stopped doesn't cost the outer one a handler, and later events run each handler once.`, () => {
	let [d, n] = delegatedAndNative((el, opt, log) => {
		let nest = true;
		let rows = [{id: 1}, {id: 2}];
		h(el, opt)`<div onclick=${() => log.push('div')}>${h.map(rows, r => h`<p key=${r.id} onclick=${[x => log.push('p' + x.id), r]}><a onclick=${[(x, e) => {
			log.push('a' + x.id);
			if (x.id === 1 && nest) {
				nest = false;
				el.querySelectorAll('a')[1].click();
			}
			else if (x.id === 2)
				e.stopPropagation();
		}, r]}>x</a></p>`)}</div>`;
		let as = el.querySelectorAll('a');
		as[0].click();
		log.push('|');
		as[0].click();
		log.push('|');
		as[1].click();
		log.push('|');
		as[0].click();
	});
	assert.eq(d, n);
});

Testimony.test('Solarite.delegation.nestedInnerStoppedSwept', `An event whose handler dispatched other events of the same type that never reached their last handler (stopped, or not bubbling) still removes every temporary listener when it ends, theirs included.`, () => {
	// 1. List rows.  The first row's handler clicks the second row and then the third; each of
	// those clicks is stopped at its own target.
	let el = attachedDiv();
	let log = [];
	let rows = [{id: 1}, {id: 2}, {id: 3}];
	h(el)`<div onclick=${() => log.push('div')}>${h.map(rows, r => h`<p key=${r.id} onclick=${[x => log.push('p' + x.id), r]}><a onclick=${[(x, e) => {
		log.push('a' + x.id);
		if (x.id === 1) {
			el.querySelectorAll('a')[1].click();
			el.querySelectorAll('a')[2].click();
		}
		else
			e.stopPropagation();
	}, r]}>x</a></p>`)}</div>`;
	let live = trackListeners('click', () => el.querySelector('a').click());
	assert.eq(log.join(), 'a1,a2,a3,p1,div');
	assert.eq(live.size, 0);
	el.remove();

	// 2. Elements outside a list, and a nested event that doesn't bubble.
	el = attachedDiv();
	log = [];
	h(el)`<div onclick=${() => log.push('div')}><b onclick=${() => {
		log.push('b');
		el.querySelector('i').dispatchEvent(new MouseEvent('click'));
	}}>b</b><i onclick=${() => log.push('i')}>i</i></div>`;
	live = trackListeners('click', () => el.querySelector('b').click());
	assert.eq(log.join(), 'b,i,div');
	assert.eq(live.size, 0);
	el.remove();
});

Testimony.test('Solarite.delegation.lingerThenOtherRoot', `Listeners left by a stopped dispatch in one root are cleared by the next event of that type, even when it happens in a detached root.`, () => {
	let log = [];
	let a = attachedDiv(), b = document.createElement('div');
	h(a)`<div onclick=${() => log.push('adiv')}><button onclick=${e => { log.push('abtn'); e.stopPropagation(); }}>x</button></div>`;
	h(b)`<div onclick=${() => log.push('bdiv')}><button onclick=${() => log.push('bbtn')}>x</button></div>`;
	let live = trackListeners('click', () => {
		a.querySelector('button').click();
		b.querySelector('button').dispatchEvent(new MouseEvent('click', {bubbles: true}));
	});
	assert.eq(log.join(), 'abtn,bbtn,bdiv');
	assert.eq(live.size, 0);
	a.remove();
});

Testimony.test('Solarite.delegation.removeOwnRowMidDispatch', `A handler that removes its own row (keyed and unkeyed) or clears the list; the handlers further up the path run as a native listener's would.`, () => {
	for (let keyed of [true, false])
		for (let mode of ['remove', 'clear', 'replace']) {
			let [d, n] = delegatedAndNative((el, opt, log) => {
				let rows = [{id: 1}, {id: 2}, {id: 3}];
				let act = x => {
					log.push('a' + x.id);
					if (mode === 'remove')
						rows = rows.filter(r => r !== x);
					else if (mode === 'clear')
						rows = [];
					else
						rows = rows.map(r => ({id: r.id + 10}));
					render();
				};
				let row = r => keyed
					? h`<p key=${r.id} onclick=${[x => log.push('p' + x.id), r]}><a onclick=${[act, r]}>x</a></p>`
					: h`<p onclick=${[x => log.push('p' + x.id), r]}><a onclick=${[act, r]}>x</a></p>`;
				let render = () => h(el, opt)`<div onclick=${() => log.push('root' + rows.length)}>${rows.map(row)}</div>`;
				render();
				el.querySelectorAll('a')[0].click();
				log.push('|');
				// Re-queried each time: a row a handler removed is out of the document, where a
				// delegated handler is documented not to run.
				for (let i=0; i<3; i++)
					el.querySelectorAll('a')[i]?.click();
			});
			assert.eq(d, n, `keyed=${keyed} mode=${mode}`);
		}
});

Testimony.test('Solarite.delegation.lastHandlerClearsList', `The handler on the outermost handled node empties the list and re-renders it; later clicks run each handler once.`, () => {
	let [d, n] = delegatedAndNative((el, opt, log) => {
		let rows = [{id: 1}, {id: 2}];
		let render = () => h(el, opt)`<div>${h.map(rows, r => h`<p key=${r.id} onclick=${[x => { log.push('p' + x.id); rows = []; render(); rows = [{id: 7}, {id: 8}]; render(); }, r]}><a onclick=${[x => log.push('a' + x.id), r]}>x</a></p>`)}</div>`;
		render();
		el.querySelector('a').click();
		log.push('|');
		el.querySelectorAll('a')[1].click();
		log.push(el.querySelectorAll('p').length);
	});
	assert.eq(d, n);
});

Testimony.test('Solarite.delegation.closedShadowRows', `List rows inside a closed shadow root, under a host whose ancestor has a handler in another root: each handler runs once, inner first.`, () => {
	let log = [];
	let outer = attachedDiv();
	h(outer)`<div onclick=${() => log.push('outer')}><span class="host"></span></div>`;
	let host = outer.querySelector('.host');
	let inner = document.createElement('div');
	host.attachShadow({mode: 'closed'}).append(inner);
	let rows = [{id: 1}, {id: 2}];
	h(inner)`<div onclick=${() => log.push('inner')}>${h.map(rows, r => h`<p key=${r.id} onclick=${[x => log.push('p' + x.id), r]}><a onclick=${[x => log.push('a' + x.id), r]}>x</a></p>`)}</div>`;
	let as = inner.querySelectorAll('a');

	let live = trackListeners('click', () => {
		as[1].click();
		assert.eq(log.join(), 'a2,p2,inner,outer');
		log.length = 0;
		as[0].click();
		assert.eq(log.join(), 'a1,p1,inner,outer');
		log.length = 0;
		as[0].dispatchEvent(new MouseEvent('click', {bubbles: true})); // Not composed: stops at the shadow root.
		assert.eq(log.join(), 'a1,p1,inner');
		log.length = 0;
		as[1].click();
		assert.eq(log.join(), 'a2,p2,inner,outer');
	});
	assert.eq(live.size, 0);
	outer.remove();
});

Testimony.test('Solarite.delegation.shadowRootTarget', `Handlers of a template rendered straight into a shadow root fire, open or closed, with or without delegation: on the template's own elements and on the rows of a list, for a real click, for a synthetic event that never leaves the shadow root and for one that doesn't bubble.`, () => {
	for (let mode of ['open', 'closed'])
		for (let opt of [true, false]) {
			let log = [];
			let host = attachedDiv();
			let root = host.attachShadow({mode});
			let render = (label, rows) => h(root, {eventDelegation: opt})`<div onclick=${() => log.push('div')}>
				<button onclick=${() => log.push(label)} onfocus=${() => log.push('focus')} native:onmousedown=${() => log.push('down')}>x</button>
				${h.map(rows, row => h`<p key=${row.id}><a onclick=${[x => log.push('a' + x.id), row]}>x</a></p>`)}</div>`;
			let rows = [{id: 1}, {id: 2}];
			render('one', rows);
			let button = root.querySelector('button'), as = root.querySelectorAll('a');
			let said = (expected, what) => {
				assert.eq(log.join(), expected, `${mode}, eventDelegation=${opt}, ${what}`);
				log.length = 0;
			};

			// click() is composed and reaches the document, which can't see into a closed shadow root.
			button.click();
			said('one,div', 'click()');
			as[1].click();
			said('a2,div', 'click() on a row');

			// composed defaults to false, so these stop at the shadow root, and the dispatcher
			// registered on the shadow root itself is the only one that sees them.
			button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
			said('one,div', 'not composed');
			as[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
			said('a1,div', 'not composed, on a row');
			button.dispatchEvent(new MouseEvent('click'));
			said('one', 'not bubbling');

			// Events that are bound when the template renders.
			button.dispatchEvent(new FocusEvent('focus'));
			button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
			said('focus,down', 'bound at render');

			// A second render through the same shadow root replaces the handlers and reorders the rows.
			render('two', [rows[1], rows[0], {id: 3}]);
			assert.eq(root.querySelector('button'), button);
			button.click();
			for (let a of root.querySelectorAll('a'))
				a.click();
			said('two,div,a2,div,a1,div,a3,div', 'second render');

			host.remove();
		}
});

Testimony.test('Solarite.delegation.standaloneFragment', `Delegated handlers of a standalone template with several root nodes run once its nodes are in the page: on its root elements, below them, and on the rows of a list at its top level.  Such a template is cloned in the inert document of a template element, and registering the dispatcher on that document left its handlers unreachable unless something else in the page had bound the same event type.`, () => {
	// contextmenu and mouseover are delegated event types that no other test binds, so nothing
	// else has registered their dispatchers on the page's document.
	let log = [];
	let items = [{id: 1}, {id: 2}];
	let fragment = h()`<button oncontextmenu=${() => log.push('a')}>a</button><p><button oncontextmenu=${() => log.push('b')}>b</button></p>${
		h.map(items, item => h`<i key=${item.id} onmouseover=${[x => log.push('row' + x.id), item]}>${item.id}</i>`)}`;
	assert(fragment instanceof DocumentFragment);
	let host = attachedDiv();
	host.append(fragment);
	let [a, b] = host.querySelectorAll('button');
	b.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true}));
	a.dispatchEvent(new MouseEvent('contextmenu')); // One that doesn't bubble.
	host.querySelectorAll('i')[1].dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
	assert.eq(log.join(), 'b,a,row2');

	// A delegated handler still runs after a listener its element already had.
	a.addEventListener('contextmenu', () => log.push('own'));
	a.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true}));
	assert.eq(log.join(), 'b,a,row2,own,a');
	host.remove();
});

Testimony.test('Solarite.delegation.standaloneReparented', `An element moved out of the one root element of a standalone template keeps its delegated handler, as one moved out of a component does.  The root element listens for itself, but the document that listened for what leaves it was the inert one the template was cloned in.`, () => {
	// pointerup is bound by no other test; see standaloneFragment.
	let count = 0;
	let el = h()`<div><button onpointerup=${() => count++}>x</button></div>`;
	let host = attachedDiv();
	host.append(el);
	let button = el.firstChild;
	button.dispatchEvent(new Event('pointerup', {bubbles: true}));
	host.append(button); // Now a sibling of its root instead of a descendant.
	button.dispatchEvent(new Event('pointerup', {bubbles: true}));
	assert.eq(count, 2);
	host.remove();
});

Testimony.test('Solarite.delegation.standaloneFragmentUnseen', `Known limit: a standalone template with several root nodes has no root element to listen on, so its delegated handlers run only where the page's document can see the event.  In a detached element, or inside a closed shadow root, they don't; a native: handler does, and so does the handler of a standalone template with one root element.`, () => {
	for (let where of ['detached', 'closed']) {
		let log = [];
		let several = h()`<button onmouseout=${() => log.push('delegated')} native:onmouseout=${() => log.push('native')}>a</button><i>i</i>`;
		let one = h()`<button onmouseout=${() => log.push('one')}>a</button>`;
		let host = document.createElement('div');
		let parent = host;
		if (where === 'closed') {
			document.body.append(host);
			parent = host.attachShadow({mode: 'closed'});
		}
		parent.append(several, one);
		for (let button of parent.querySelectorAll('button'))
			button.dispatchEvent(new MouseEvent('mouseout', {bubbles: true, composed: true}));
		assert.eq(log.join(), 'native,one', where);
		host.remove();
	}
});

Testimony.test('Solarite.delegation.standaloneTopLevelExpression', `Delegated handlers of a standalone template with an expression at its top level run once its nodes are in the page: on an element beside the expression, and on the rows of a list that is the expression.  Such a template gives a DocumentFragment, so it is the page's document that listens, as for a template with several root nodes, and the same limit holds: in an element that isn't in the page, or in a closed shadow root, only the native: handler runs.  The rows used to be dropped, and the element came back alone as the root, listening for itself.`, () => {
	for (let where of ['page', 'detached', 'closed']) {
		let log = [];
		let items = [{id: 1}, {id: 2}];
		let fragment = h()`<button onpointerover=${() => log.push('button')} native:onpointerover=${() => log.push('native')}>a</button>${
			h.map(items, item => h`<i key=${item.id} onpointerover=${[x => log.push('row' + x.id), item]}>${item.id}</i>`)}`;
		assert(fragment instanceof DocumentFragment);
		let host = document.createElement('div');
		let parent = host;
		if (where !== 'detached')
			document.body.append(host);
		if (where === 'closed')
			parent = host.attachShadow({mode: 'closed'});
		parent.append(fragment);
		for (let el of parent.querySelectorAll('button, i'))
			el.dispatchEvent(new MouseEvent('pointerover', {bubbles: true, composed: true}));
		assert.eq(log.join(), where === 'page' ? 'native,button,row1,row2' : 'native', where);
		host.remove();
	}
});

Testimony.test('Solarite.delegation.redispatchSameTarget', `One Event object dispatched twice on the same element runs the handler twice, in the document, in a detached root and inside a shadow root.`, () => {
	for (let where of ['document', 'detached', 'shadow'])
		for (let opt of [true, false]) {
			let el = document.createElement('div'), host = null, log = [];
			if (where === 'document')
				document.body.append(el);
			else if (where === 'shadow') {
				host = document.createElement('div');
				document.body.append(host);
				host.attachShadow({mode: 'open'}).append(el);
			}
			h(el, {eventDelegation: opt})`<div><a onclick=${() => log.push('a')}>a</a></div>`;
			let ev = new MouseEvent('click', {bubbles: true});
			el.querySelector('a').dispatchEvent(ev);
			el.querySelector('a').dispatchEvent(ev);
			assert.eq(log.join(''), 'aa', where + ', eventDelegation=' + opt);
			(host || el).remove();
		}
});

Testimony.test('Solarite.delegation.nestedDispatchOnRemovedRow', `A row handler that removes its own row and then dispatches an event on it runs the row's handlers again, as listeners bound at render would, whether or not anything above the row has a handler.`, () => {
	let run = (opt, withRootHandler) => {
		let el = document.createElement('div');
		document.body.append(el);
		let log = [], rows = [{id: 1}, {id: 2}], once = true;
		let rowHandler = (x, e, node) => {
			log.push('p' + x.id);
			if (once) {
				once = false;
				rows = rows.filter(y => y !== x);
				render();
				node.querySelector('a').dispatchEvent(new MouseEvent('click', {bubbles: true}));
			}
		};
		let list = () => h.map(rows, r => h`<p key=${r.id} onclick=${[rowHandler, r]}><a onclick=${[x => log.push('a' + x.id), r]}>x</a></p>`);
		let render = () => withRootHandler
			? h(el, {eventDelegation: opt})`<div onclick=${() => log.push('root')}>${list()}</div>`
			: h(el, {eventDelegation: opt})`<div>${list()}</div>`;
		render();
		el.querySelector('a').click();
		el.remove();
		return log.join();
	};
	assert.eq(run(true, false), 'a1,p1,a1,p1');
	assert.eq(run(true, false), run(false, false));
	assert.eq(run(true, true), run(false, true));
});

Testimony.test('Solarite.delegation.nestedDispatchOnRemovedElement', `The same for an element that is not a list row: a handler that takes its own element out of the page and then dispatches an event on it runs the element's handlers again, as listeners bound at render would.`, () => {
	let run = (opt, withRootHandler) => {
		let el = attachedDiv();
		let log = [], show = true, once = true;
		let handler = (e, node) => {
			log.push('p');
			if (once) {
				once = false;
				show = false;
				render();
				node.querySelector('a').dispatchEvent(new MouseEvent('click', {bubbles: true}));
			}
		};
		let inner = () => show ? h`<p onclick=${handler}><a onclick=${() => log.push('a')}>x</a></p>` : '';
		let render = () => withRootHandler
			? h(el, {eventDelegation: opt})`<div onclick=${() => log.push('root')}>${inner()}</div>`
			: h(el, {eventDelegation: opt})`<div>${inner()}</div>`;
		render();
		el.querySelector('a').click();
		el.remove();
		return log.join();
	};
	assert.eq(run(true, false), 'a,p,a,p');
	assert.eq(run(true, false), run(false, false));
	assert.eq(run(true, true), run(false, true));
});

Testimony.test('Solarite.delegation.movedOutOfRow', `An element moved out of its list row loses its delegated handler, because the dispatcher finds a row's handlers through the row's root element.  A native: handler on it keeps working, and so does every handler of a row that is moved whole.`, () => {
	let log = [];
	class List extends Solarite {
		rows = [{id: 1}, {id: 2}];

		render() {
			h(this)`<div>${h.map(this.rows, r =>
				h`<p key=${r.id} onclick=${[function(row) { log.push('p' + row.id + (this === list ? '' : ' with the wrong this')); }, r]}><a onclick=${[row => log.push('a' + row.id), r]}>a</a><b native:onclick=${[row => log.push('b' + row.id), r]}>b</b></p>`)}</div>`
		}
	}
	customElements.define(uniqueTag(), List);
	let list = new List();
	document.body.append(list);
	list.render();
	let elsewhere = attachedDiv();
	let [p1, p2] = list.querySelectorAll('p');

	// 1. A whole row moved elsewhere in the page: every handler runs, with the component as this.
	elsewhere.append(p1);
	p1.querySelector('a').click();
	p1.querySelector('b').click();
	assert.eq(log.join(), 'a1,p1,b1,p1');

	// 2. Elements moved out of their row: the delegated one is silent, the native: one is not.
	log = [];
	let a2 = p2.querySelector('a'), b2 = p2.querySelector('b');
	elsewhere.append(a2, b2);
	a2.click();
	b2.click();
	assert.eq(log.join(), 'b2');

	// 3. The row they left still answers.
	p2.click();
	assert.eq(log.join(), 'b2,p2');
	list.remove();
	elsewhere.remove();
});

Testimony.test('Solarite.delegation.rowAfterOutsideListener', `A listener other code added to a list row's element runs before the row's delegated handler, and after a handler bound at render.  When that listener removes the row, the event still finishes on it either way.`, () => {
	let [d, n] = delegatedAndNative((el, opt, log) => {
		let rows = [{id: 1}, {id: 2}, {id: 3}];
		let render = () => h(el, opt)`<div onclick=${() => log.push('root' + rows.length)}>${h.map(rows, r => h`<p key=${r.id} onclick=${[x => log.push('p' + x.id), r]}><a onclick=${[x => log.push('a' + x.id), r]}>x</a></p>`)}</div>`;
		render();
		let p = el.querySelectorAll('p')[1];
		p.addEventListener('click', () => {
			log.push('outside');
			rows = rows.filter(r => r.id !== 2);
			render();
		});
		p.querySelector('a').click();
		log.push('|');
		for (let a of el.querySelectorAll('a'))
			a.click();
	});

	// The one documented difference from a regular listener: a delegated handler is attached
	// when the event starts, so it comes after a listener its element already had.
	assert.eq(d, 'a2,outside,p2,root2,|,a1,p1,root2,a3,p3,root2');
	assert.eq(n, 'a2,p2,outside,root2,|,a1,p1,root2,a3,p3,root2');
});

Testimony.test('Solarite.delegation.nativePrefixStamped', `native: handlers in list rows are bound with addEventListener when the row is drawn, instead of being left in the row's template for the dispatcher.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let hits = [];
	let rows = [1, 2, 3];
	let render = mult => h(el)`<div>${rows.map(n =>
		h`<p key=${n} native:onmouseup=${[(i, e, p) => hits.push([i * mult, p]), n]}>row</p>`)}</div>`;
	render(1);

	// Non-bubbling dispatch: only a listener on the node itself can hear it.
	let p = el.querySelectorAll('p')[1];
	p.dispatchEvent(new MouseEvent('mouseup'));
	assert.eq(hits.length, 1);
	assert.eq(hits[0][0], 2);
	assert.eq(hits[0][1], p);

	// A re-render with new handlers updates the binding in place, never doubling it.
	render(10);
	p.dispatchEvent(new MouseEvent('mouseup'));
	assert.eq(hits.length, 2);
	assert.eq(hits[1][0], 20);

	el.remove();
});

Testimony.test('Solarite.delegation.rowsStoreNothing', `A list row made by the compiled stamp program stores no handler on its nodes, before, during or after an event: the dispatcher reads handlers from the row's template, and a re-rendered row's new handler is what runs.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let hits = [];
	let rows = [{id: 1}, {id: 2}, {id: 3}];
	let render = () => h(el)`<div>${h.map(rows, r =>
		h`<p key=${r.id}><a onclick=${[function(row, e, a) { hits.push([row, a, this, Object.getOwnPropertySymbols(a).length]); }, r]}>x</a><i onmouseup=${[row => hits.push('i' + row.id), r]}></i></p>`)}</div>`;
	render();
	let p = el.querySelectorAll('p')[1], a = p.firstChild, i = p.lastChild;

	// Nothing is stored on the nodes that carry handlers; the row root carries one pointer.
	assert.eq(Object.getOwnPropertySymbols(a).length, 0);
	assert.eq(Object.getOwnPropertySymbols(i).length, 0);
	assert.eq(Object.getOwnPropertySymbols(p).length, 1);

	a.click();
	assert.eq(hits.length, 1);
	assert.eq(hits[0][0], rows[1]);
	assert.eq(hits[0][1], a);
	assert.eq(hits[0][2], el);
	assert.eq(hits[0][3], 0); // Nothing on the node while its handler ran.
	i.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	assert.eq(hits[1], 'i2');

	// Nothing was written onto the node for the event either, so it still has no property of
	// its own.
	assert.eq(Object.getOwnPropertySymbols(a).length, 0);
	assert.eq(Object.getOwnPropertySymbols(i).length, 0);
	assert.eq(Object.getOwnPropertySymbols(p).length, 1);

	// A re-render that changes the row's handler: the next event runs the new one.
	rows[1] = {id: 2, v: 'new'};
	render();
	assert.eq(el.querySelectorAll('p')[1], p); // Same key, same element.
	a.click();
	assert.eq(hits[2][0], rows[1]);
	assert.eq(hits[2][0].v, 'new');
	rows[1] = {id: 2, v: 'newer'};
	render();
	a.click();
	assert.eq(hits[3][0].v, 'newer');

	el.remove();
});

Testimony.test('Solarite.delegation.nestedRows', `Rows nested inside rows each run their own delegated handler once, with the component as this.`, () => {
	class D95 extends Solarite {
		hits = [];
		groups = [{id: 1, items: [{id: 11}, {id: 12}]}, {id: 2, items: [{id: 21}]}];
		render() {
			h(this)`<d-95>${h.map(this.groups, g =>
				h`<section key=${g.id} onclick=${[function(group) { this.hits.push('g' + group.id); }, g]}>${h.map(g.items, it =>
					h`<span key=${it.id} onclick=${[function(item) { this.hits.push('i' + item.id); }, it]}>x</span>`)}</section>`)}</d-95>`;
		}
	}
	D95.define();
	let a = new D95();
	document.body.append(a);
	a.querySelectorAll('span')[1].click();
	assert.eq(a.hits.join(), 'i12,g1');
	a.querySelectorAll('span')[2].click();
	assert.eq(a.hits.join(), 'i12,g1,i21,g2');
	a.remove();
});

Testimony.test('Solarite.delegation.rowRerenderMidDispatch', `A row handler that re-renders swaps an enclosing row's handler before the event reaches it, and the new one runs.`, () => {
	let hits = [];
	let el = document.createElement('div');
	document.body.append(el);
	let groups = [{id: 1, n: 1, items: [{id: 11}]}];
	let render = () => h(el)`<div>${h.map(groups, g =>
		h`<section key=${g.id} onclick=${[group => hits.push('g' + group.n), g]}>${h.map(g.items, it =>
			h`<span key=${it.id} onclick=${[() => { hits.push('i'); groups[0] = {id: 1, n: 2, items: groups[0].items}; render(); }, it]}>x</span>`)}</section>`)}</div>`;
	render();
	el.querySelector('span').click();
	assert.eq(hits.join(), 'i,g2');
	el.remove();
});

Testimony.test('Solarite.delegation.rowsWithOptions', `List rows under eventDelegation:false or an event-name array bind the ordinary way.`, () => {
	let hits = [];
	let rows = [{id: 1}, {id: 2}];
	let el1 = document.createElement('div'), el2 = document.createElement('div');
	document.body.append(el1, el2);
	h(el1, {eventDelegation: false})`<div>${h.map(rows, r => h`<p key=${r.id} onclick=${[row => hits.push('f' + row.id), r]}>x</p>`)}</div>`;
	h(el2, {eventDelegation: ['mouseup']})`<div>${h.map(rows, r => h`<p key=${r.id} onclick=${[row => hits.push('c' + row.id), r]} onmouseup=${[row => hits.push('m' + row.id), r]}>x</p>`)}</div>`;
	let p1 = el1.querySelectorAll('p')[1], p2 = el2.querySelectorAll('p')[1];
	assert.eq(getEventBinding(p1, 'click') !== undefined, true); // A real listener, registered at render.
	assert.eq(getEventBinding(p2, 'click') !== undefined, true);
	assert.eq(getEventBinding(p2, 'mouseup'), undefined); // Delegated by name, stored on the node.
	p1.click();
	p2.click();
	p2.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	assert.eq(hits.join(), 'f2,c2,m2');
	el1.remove();
	el2.remove();
});

Testimony.test('Solarite.delegation.pooledRowMidDispatch', `A pooled row re-applied through the raw-node list route mid-dispatch has its new template in place before the enclosing handler's turn, so that handler runs with current arguments.`, () => {
	for (let opt of [true, false]) {
		let el = document.createElement('div');
		document.body.append(el);
		let hits = [];
		let hr = document.createElement('hr');
		let rows = [{n: 1}];
		let row = r => h`<p onclick=${[item => hits.push('p' + item.n), r]}><b onclick=${[item => { hits.push('b' + item.n); if (item.n === 1) { rows[0] = {n: 2}; render(); } }, r]}>x</b></p>`;
		let render = () => h(el, {eventDelegation: opt})`<div>${[...rows.map(row), hr]}</div>`;
		render();
		let p = el.querySelector('p');
		el.querySelector('b').click();
		assert.eq(el.querySelector('p'), p); // The same element, reused from the pool.
		assert.eq(hits.join(), 'b1,p2', 'eventDelegation=' + opt);
		el.remove();
	}
});

Testimony.test('Solarite.delegation.rowUpdateThrows', `A row update that throws part-way leaves each of the row's handlers as a listener bound at render would be: the ones the update had already reached receive the new item, the rest still receive the old one, and the next render finishes the row.`, () => {
	// Expressions are applied from the last to the first, so the update reaches <b>, then the
	// text, then <a>'s handler and its title, and <p> last.  What stops it is either a handler
	// that isn't a function or an attribute function that throws.
	for (let cause of ['handler', 'title'])
		for (let mapped of [true, false]) // h.map() patches the changed row; an array goes through the keyed diff.
			for (let nested of [false, true]) // A row whose text is a template has paths of its own.
				for (let opt of [true, false]) {
					let el = document.createElement('div');
					document.body.append(el);
					let hits = [], built = [], bad = false, rows = [{id: 1, n: 0}];
					let row = r => {
						let title = bad && cause === 'title' ? () => { throw new Error('thrown on purpose by the test'); } : 't' + r.n;
						let onA = bad && cause === 'handler' ? 'not a function' : [item => hits.push('a' + item.n), r];
						let t = h`<p key=${r.id} onclick=${[item => hits.push('p' + item.n), r]}><a title=${title} onclick=${onA}>${nested ? h`<u>${r.n}</u>` : r.n}</a><b onclick=${[item => hits.push('b' + item.n), r]}>x</b></p>`;
						built.push([t, t.exprs.slice()]);
						return t;
					};
					let render = () => h(el, {eventDelegation: opt})`<div>${mapped ? h.map(rows, row) : rows.map(row)}</div>`;
					render();
					let a = el.querySelector('a'), b = el.querySelector('b');

					bad = true;
					rows = [{id: 1, n: 1}];
					let threw = false;
					try { render(); } catch (e) { threw = true; }
					let which = `cause=${cause} mapped=${mapped} nested=${nested} eventDelegation=${opt}`;
					assert.eq(threw, true, which);
					assert.eq(el.querySelector('a'), a, which); // The same row, updated as far as the throw.
					assert.eq(a.textContent, '1', which);
					assert.eq(a.title, 't0', which);
					b.click();
					a.click();
					assert.eq(hits.join(), cause === 'handler' ? 'b1,p0,a0,p0' : 'b1,p0,a1,p0', which);

					// The templates the rows were built from are as the callback made them: h.map()
					// hands a row's template out again while its item stays the same.
					assert.eq(built.every(([t, exprs]) => exprs.every((expr, i) => t.exprs[i] === expr)), true, which);

					bad = false;
					hits = [];
					render();
					assert.eq(a.title, 't1', which);
					b.click();
					a.click();
					assert.eq(hits.join(), 'b1,p1,a1,p1', which);
					el.remove();
				}
});

Testimony.test('Solarite.delegation.rowUpdateThrowsRawNodeList', `Known limit: in a list that also holds a raw DOM node, a row update that throws part-way leaves all of the row's delegated handlers on the old item, where listeners bound at render have been replaced as far as the throw.  The next render brings both up to date.`, () => {
	for (let opt of [true, false]) {
		let el = document.createElement('div');
		document.body.append(el);
		let hits = [], bad = false, rows = [{n: 0}];
		let hr = document.createElement('hr');
		let row = r => h`<p onclick=${[item => hits.push('p' + item.n), r]}><a onclick=${bad ? 'not a function' : [item => hits.push('a' + item.n), r]}>${r.n}</a><b onclick=${[item => hits.push('b' + item.n), r]}>x</b></p>`;
		let render = () => h(el, {eventDelegation: opt})`<div>${[...rows.map(row), hr]}</div>`;
		render();

		bad = true;
		rows = [{n: 1}];
		let threw = false;
		try { render(); } catch (e) { threw = true; }
		assert.eq(threw, true);
		assert.eq(el.querySelector('a').textContent, '1');
		el.querySelector('b').click();

		// The two would agree on 'b1,p0' if this route recorded how far the update got, as
		// rowUpdateThrows shows the others do.
		assert.eq(hits.join(), opt ? 'b0,p0' : 'b1,p0');

		bad = false;
		hits = [];
		render();
		el.querySelector('b').click();
		assert.eq(hits.join(), 'b1,p1', 'eventDelegation=' + opt);
		el.remove();
	}
});

Testimony.test('Solarite.delegation.sameTaskSecondClickAttachesOnce', `A second event on a row attaches one temporary listener to the node, as the first did, and each is removed again when its event is over.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let noop = () => {};
	h(el)`<div>${h.map([{id: 1}], r => h`<p key=${r.id}><a onclick=${[noop, r]}>x</a></p>`)}</div>`;
	let a = el.querySelector('a');
	let ops = [], origAdd = EventTarget.prototype.addEventListener, origRemove = EventTarget.prototype.removeEventListener;
	EventTarget.prototype.addEventListener = function(...args) { if (this === a) ops.push('add'); return origAdd.apply(this, args); };
	EventTarget.prototype.removeEventListener = function(...args) { if (this === a) ops.push('remove'); return origRemove.apply(this, args); };
	try {
		a.click();
		assert.eq(ops.join(), 'add,remove'); // Its temporary listener was removed again once its handler returned.
		a.click();
		assert.eq(ops.join(), 'add,remove,add,remove'); // Nothing was left to remove first.
	}
	finally { EventTarget.prototype.addEventListener = origAdd; EventTarget.prototype.removeEventListener = origRemove; }
	el.remove();
});

Testimony.test('Solarite.delegation.firstClickResolvesOnce', `A row's first event resolves its nodes once, however many of them bind that event.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let noop = () => {};
	let rows = [{id: 1}, {id: 2}];
	h(el)`<table><tbody>${h.map(rows, row => h`<tr key=${row.id}><td><button onclick=${[noop, row]}>1</button></td><td><button onclick=${[noop, row]}>2</button></td><td><button onclick=${[noop, row]}>3</button></td><td><button onclick=${[noop, row]}>4</button></td><td><button onclick=${[noop, row]}>5</button></td></tr>`)}</tbody></table>`;
	let count = 0, orig = NodeGroup.prototype.resolveStampSlots;
	NodeGroup.prototype.resolveStampSlots = function(...args) { count++; return orig.apply(this, args); };
	try {
		el.querySelectorAll('button')[4].click();
		assert.eq(count, 1);
		el.querySelectorAll('button')[0].click(); // Same row, later in the same task: nothing to resolve.
		assert.eq(count, 1);
	}
	finally { NodeGroup.prototype.resolveStampSlots = orig; }
	el.remove();
});

Testimony.test('Solarite.delegation.stoppedDispatchSweptNext', `A dispatch whose propagation a handler stopped before the event reached the last node it had a handler on leaves its temporary listeners in place; the next dispatch of that type clears them first, and the handler still runs exactly once.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let hits = 0, outer = 0;
	h(el)`<div>${h.map([{id: 1}], r => h`<p key=${r.id} onclick=${[() => outer++, r]}><a onclick=${[(row, e) => { hits++; e.stopPropagation(); }, r]}>x</a></p>`)}</div>`;
	let a = el.querySelector('a');
	let ops = [], origAdd = EventTarget.prototype.addEventListener, origRemove = EventTarget.prototype.removeEventListener;
	EventTarget.prototype.addEventListener = function(...args) { if (this === a) ops.push('add'); return origAdd.apply(this, args); };
	EventTarget.prototype.removeEventListener = function(...args) { if (this === a) ops.push('remove'); return origRemove.apply(this, args); };
	try {
		a.click();
		assert.eq(hits, 1);
		assert.eq(outer, 0);
		assert.eq(ops.at(-1), 'add'); // Never swept: the event never reached the row's root, the last node it had a handler on.
		ops = [];
		a.click();
	}
	finally { EventTarget.prototype.addEventListener = origAdd; EventTarget.prototype.removeEventListener = origRemove; }
	assert.eq(hits, 2);
	assert.eq(ops[0], 'remove'); // Cleared before anything is attached for the new event.
	assert.eq(ops.filter(op => op === 'add').length, 1);
	el.remove();
});

Testimony.test('Solarite.delegation.sweptAtLastHandler', `The temporary listeners of a dispatch are removed when the event reaches the last node it has a handler on, even if that handler stops propagation, so nothing waits for the event to reach the document.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let hits = [];
	let stop = false;
	h(el)`<div onclick=${e => { hits.push('div'); if (stop) e.stopPropagation(); }}>${h.map([{id: 1}], r =>
		h`<p key=${r.id}><a onclick=${[() => hits.push('a'), r]}>x</a></p>`)}</div>`;
	let a = el.querySelector('a'), div = el.firstElementChild;
	let live = new Set(), origAdd = EventTarget.prototype.addEventListener, origRemove = EventTarget.prototype.removeEventListener;
	EventTarget.prototype.addEventListener = function(...args) { if (this === a || this === div) live.add(this); return origAdd.apply(this, args); };
	EventTarget.prototype.removeEventListener = function(...args) { if (this === a || this === div) live.delete(this); return origRemove.apply(this, args); };

	// What a listener further up than every handler sees when the event gets to it.
	let seenAbove = -1;
	let above = () => seenAbove = live.size;
	el.addEventListener('click', above);
	try {
		a.click();
		assert.eq(hits.join(), 'a,div');
		assert.eq(seenAbove, 0);
		assert.eq(live.size, 0);

		stop = true;
		a.click();
		assert.eq(hits.join(), 'a,div,a,div');
		assert.eq(live.size, 0);
	}
	finally { EventTarget.prototype.addEventListener = origAdd; EventTarget.prototype.removeEventListener = origRemove; }
	el.remove();
});

Testimony.test('Solarite.delegation.registeredMidDispatch', `The first delegated handler of an event type can be rendered while an event of that type is being dispatched; the event then finishes without an error, and the handler works from the next event on.`, () => {
	// dblclick is delegatable and no other test uses it, so its dispatcher is registered here
	// for the first time, by the render the native listener below performs mid-dispatch.
	let el = document.createElement('div');
	document.body.append(el);
	let errors = [], hits = 0;
	let onError = e => { errors.push(e.message); e.preventDefault(); };
	window.addEventListener('error', onError);
	let open = false;
	let render = () => h(el)`<div><button native:ondblclick=${() => { open = true; render(); }}>open</button>${open ? h`<a ondblclick=${() => hits++}>x</a>` : ''}</div>`;
	render();
	try {
		el.querySelector('button').dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
		assert.eq(errors.join(), '');
		el.querySelector('a').dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
		assert.eq(hits, 1);
		assert.eq(errors.join(), '');
	}
	finally { window.removeEventListener('error', onError); }
	el.remove();
});

Testimony.test('Solarite.delegation.nonBubblingThenBubbling', `An event that doesn't bubble never reaches the handlers above its target; the listeners attached for them are cleared by the next event, which runs every handler exactly once.`, () => {
	let hits = [];
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<div onclick=${() => hits.push('div')}><button onclick=${() => hits.push('button')}>x</button></div>`;
	let button = el.querySelector('button');

	button.dispatchEvent(new MouseEvent('click'));
	assert.eq(hits.join(), 'button');

	hits = [];
	button.click();
	assert.eq(hits.join(), 'button,div');
	button.click();
	assert.eq(hits.join(), 'button,div,button,div');
	el.remove();
});

Testimony.test('Solarite.delegation.throwingHandler', `A handler that throws doesn't keep the handlers after it from running, and leaves no temporary listener behind.`, () => {
	let hits = [];
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<div onclick=${() => { hits.push('div'); throw new Error('thrown on purpose by the test'); }}><button onclick=${() => { hits.push('button'); throw new Error('thrown on purpose by the test'); }}>x</button></div>`;
	let button = el.querySelector('button'), div = el.firstElementChild;
	let live = new Set(), origAdd = EventTarget.prototype.addEventListener, origRemove = EventTarget.prototype.removeEventListener;
	EventTarget.prototype.addEventListener = function(...args) { if (this === button || this === div) live.add(this); return origAdd.apply(this, args); };
	EventTarget.prototype.removeEventListener = function(...args) { if (this === button || this === div) live.delete(this); return origRemove.apply(this, args); };

	// The browser reports an exception thrown by a listener to window.onerror rather than
	// to the code that dispatched the event; keep those two reports out of the test's way.
	let reported = 0;
	let swallow = e => { reported++; e.preventDefault(); };
	window.addEventListener('error', swallow);
	try {
		button.click();
	}
	finally {
		window.removeEventListener('error', swallow);
		EventTarget.prototype.addEventListener = origAdd;
		EventTarget.prototype.removeEventListener = origRemove;
	}
	assert.eq(hits.join(), 'button,div');
	assert.eq(reported, 2);
	assert.eq(live.size, 0);

	hits = [];
	window.addEventListener('error', swallow);
	try { button.click(); } finally { window.removeEventListener('error', swallow); }
	assert.eq(hits.join(), 'button,div');
	el.remove();
});

Testimony.test('Solarite.delegation.nestedRootsWalkOnce', `An event passing through nested components is walked once: the inner component's dispatcher finds the event already handled by the document's and attaches nothing more.`, () => {
	let hits = [];
	class D96Inner extends Solarite {
		render() {
			h(this)`<d-96-inner><button onclick=${() => hits.push('inner')}>x</button></d-96-inner>`;
		}
	}
	D96Inner.define();
	class D96Outer extends Solarite {
		render() {
			h(this)`<d-96-outer><div onclick=${() => hits.push('outer')}><d-96-inner></d-96-inner></div></d-96-outer>`;
		}
	}
	D96Outer.define();
	let outer = new D96Outer();
	document.body.append(outer);
	let button = outer.querySelector('button');
	let adds = 0, orig = EventTarget.prototype.addEventListener;
	EventTarget.prototype.addEventListener = function(...args) { if (this === button) adds++; return orig.apply(this, args); };
	try { button.click(); } finally { EventTarget.prototype.addEventListener = orig; }
	assert.eq(hits.join(), 'inner,outer');
	assert.eq(adds, 1);

	// Detached, the outer component's own dispatcher is the first to see the event.
	outer.remove();
	hits = [];
	button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(hits.join(), 'inner,outer');
});

Testimony.test('Solarite.delegation.orderAfterStoppedDispatch', `A listener added after a dispatch that was stopped part-way still runs before the template handler on the next event.`, () => {
	let order = [];
	let el = document.createElement('div');
	document.body.append(el);
	h(el)`<div onclick=${() => order.push('div')}><button onclick=${e => { order.push('template'); e.stopPropagation(); }}>x</button></div>`;
	let button = el.querySelector('button');
	button.addEventListener('click', () => order.push('first'));
	button.click();
	assert.eq(order.join(), 'first,template');

	button.addEventListener('click', () => order.push('second'));
	order = [];
	button.click();
	assert.eq(order.join(), 'first,second,template');
	el.remove();
});

Testimony.test('Solarite.delegation.orderInNestedDispatch', `A handler that adds a listener to an ancestor and then dispatches another event of the same type: the ancestor's template handler runs after the new listener in both dispatches.`, () => {
	let order = [];
	let el = document.createElement('div');
	document.body.append(el);
	let added = false;
	h(el)`<div onclick=${() => order.push('div')}><button onclick=${() => {
		order.push('button');
		if (!added) {
			added = true;
			el.firstElementChild.addEventListener('click', () => order.push('late'));
			el.querySelector('i').click();
		}
	}}>x</button><i onclick=${() => order.push('i')}></i></div>`;
	el.querySelector('button').click();
	assert.eq(order.join(), 'button,i,late,div,late,div');
	el.remove();
});

Testimony.test('Solarite.delegation.nativeListenerNestedDispatch', `A listener added with addEventListener that dispatches another event of the same type through its own element doesn't cost the outer event that element's template handler, and no temporary listener is left behind.`, () => {
	let sorted = log => log.split(',').sort().join();

	// 1. The listener sits on the last element the outer click has a handler on.
	let [d, n] = delegatedAndNative((el, opt, log) => {
		h(el, opt)`<div onclick=${() => log.push('div')}><b onclick=${() => log.push('b')}>b</b><i onclick=${() => log.push('i')}>i</i></div>`;
		let nest = true;
		el.firstElementChild.addEventListener('click', () => {
			log.push('listener');
			if (nest) {
				nest = false;
				el.querySelector('i').click();
			}
		});
		assert.eq(trackListeners('click', () => el.querySelector('b').click()).size, 0);
	});
	// Delegated handlers run after the listener on the same element, so the order differs from
	// handlers bound at render, but each of the two clicks reaches the div's handler.
	assert.eq(n, 'b,div,listener,i,div,listener');
	assert.eq(d, 'b,listener,i,listener,div,div');

	// 2. The listener sits on the root of a list row, below another element with a handler.
	[d, n] = delegatedAndNative((el, opt, log) => {
		let rows = [{id: 1}, {id: 2}];
		h(el, opt)`<div onclick=${() => log.push('div')}>${h.map(rows, r => h`<p key=${r.id} onclick=${[x => log.push('p' + x.id), r]}><a onclick=${[x => log.push('a' + x.id), r]}>x</a><i onclick=${[x => log.push('i' + x.id), r]}>y</i></p>`)}</div>`;
		let p = el.querySelector('p'), nest = true;
		p.addEventListener('click', () => {
			log.push('listener');
			if (nest) {
				nest = false;
				p.querySelector('i').click();
			}
		});
		assert.eq(trackListeners('click', () => p.querySelector('a').click()).size, 0);
	});
	assert.eq(d, 'a1,listener,i1,listener,p1,div,p1,div');
	assert.eq(sorted(d), sorted(n));

	// 3. Three clicks deep: the listener's click runs a handler that dispatches a third, and
	// that one passes through the listener's element while the first click is still there.
	[d, n] = delegatedAndNative((el, opt, log) => {
		let nest = true, deeper = true;
		h(el, opt)`<div onclick=${() => log.push('div')}><b onclick=${() => log.push('b')}>b</b><i onclick=${() => {
			log.push('i');
			if (deeper) {
				deeper = false;
				el.querySelector('u').click();
			}
		}}>i</i><u onclick=${() => log.push('u')}>u</u></div>`;
		el.firstElementChild.addEventListener('click', () => {
			log.push('listener');
			if (nest) {
				nest = false;
				el.querySelector('i').click();
			}
		});
		assert.eq(trackListeners('click', () => el.querySelector('b').click()).size, 0);
	});
	assert.eq(d, 'b,listener,i,u,listener,div,listener,div,div');
	assert.eq(sorted(d), sorted(n));
});

Testimony.test('Solarite.delegation.rowHandlerInvalidatedMidDispatch', `A row whose handler an earlier handler in the same dispatch re-rendered runs the handler it has when its turn comes, read from the row and not from a copy made when the event started.`, () => {
	let hits = [];
	let el = document.createElement('div');
	document.body.append(el);
	let rows = [{id: 1, n: 1}];
	let render = () => h(el)`<div>${h.map(rows, r =>
		h`<p key=${r.id} onclick=${[row => hits.push('p' + row.n), r]}><a onclick=${[() => { hits.push('a'); rows[0] = {id: 1, n: rows[0].n + 1}; render(); }, r]}>x</a></p>`)}</div>`;
	render();
	let p = el.querySelector('p'), a = p.firstChild;
	a.click();
	assert.eq(hits.join(), 'a,p2');
	a.click();
	assert.eq(hits.join(), 'a,p2,a,p3');

	// Nothing was ever written onto the nodes that carry the handlers.
	assert.eq(Object.getOwnPropertySymbols(a).length, 0);
	assert.eq(Object.getOwnPropertySymbols(p).length, 1);
	el.remove();
});

Testimony.test('Solarite.delegation.nestedDispatchesInARow', `A handler that dispatches two events of the same type, one after the other, doesn't cost the outer event the handlers it hasn't reached yet.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let hits = [];
	let done = false;
	h(el)`<div onclick=${() => hits.push('div')}><p onclick=${() => {
		hits.push('p');
		if (!done) {
			done = true;
			let i = el.querySelector('i');
			i.click();
			i.click();
		}
	}}><b>x</b></p><i onclick=${() => hits.push('i')}></i></div>`;
	el.querySelector('b').click();
	assert.eq(hits.join(), 'p,i,div,i,div,div');
	el.remove();
});
//endregion




//region embed
/*┌─────────────────╮
  | Embed           |
  └─────────────────╯*/

Testimony.test('Solarite.embed.styleStatic', () => {
	let count = 0;

	class R300 extends Solarite {
		render() {
			h(this)`
				<style>
					:host { color: blue }
				</style>
				Text that should be blue.
				${count}
			`;
		}
	}

	let a = new R300();
	document.body.append(a);

	assert.eq(a.getAttribute('data-style'), '1');
	assert.eq(a.querySelector('style').textContent.trim(), `r-300[data-style="1"] { color: blue }`)

	// Make sure styleid isn't incremented on render.
	count++;
	a.render();

	assert.eq(a.getAttribute('data-style'), '1');
	assert.eq(a.querySelector('style').textContent.trim(), `r-300[data-style="1"] { color: blue }`)

	a.remove();
});

Testimony.test('Solarite.embed.styleStaticNested', () => {
	let count = 0;

	// This bug only happened when extending from Solarite,
	// since it adds the children before calling the constructor.
	class B305 extends Solarite {
		render() {
			h(this)`
				<style>:host { color: blue }</style>
				Text that should be blue.
			`;
		}
	}
	B305.define();

	class A305 extends Solarite {
		render() {
			h(this)`
			<a-305>
				<style>:host { color: red }</style>
				Text that should be red.
				${count}
				<br><b-305></b-305>
			</a-305>`;
		}
	}


	let a = new A305();
	document.body.append(a);
	let b = a.querySelector('b-305');

	assert.eq(a.querySelector('style').textContent.trim(), `a-305[data-style="1"] { color: red }`)
	assert.eq(b.querySelector('style').textContent.trim(), `b-305[data-style="1"] { color: blue }`)

	// Make sure styleid isn't incremented on render.
	count++;
	a.render();
	// console.log(a.outerHTML)
	assert.eq(a.querySelector('style').textContent.trim(), `a-305[data-style="1"] { color: red }`)
	assert.eq(b.querySelector('style').textContent.trim(), `b-305[data-style="1"] { color: blue }`)

	a.remove();
});

Testimony.test('Solarite.embed.styleStaticNested2', () => {
	let count = 0;

	class B308 extends HTMLElement {
		constructor() {
			super();
			this.render();
		}
		render() {
			h(this)`
				<style>:host { color: blue }</style>
				Text that should be blue.
			`;
		}
	}
	customElements.define('b-308', B308);

	class A308 extends HTMLElement {
		constructor() {
			super();
			this.render();
		}

		// Below, the count expression changes the path to the static component <b-308>
		render() {
			h(this)`
			<a-308>
				<style>:host { color: red }</style>
				Text that should be red.
				${count}
				<br><b-308></b-308>
			</a-308>`;
		}
	}
	customElements.define('a-308', A308);


	let a = new A308();
	document.body.append(a);
	let b = a.querySelector('b-308');

	assert.eq(a.querySelector('style').textContent.trim(), `a-308[data-style="1"] { color: red }`)
	assert.eq(b.querySelector('style').textContent.trim(), `b-308[data-style="1"] { color: blue }`)

	// Make sure styleid isn't incremented on render.
	count++;
	a.render();
	// console.log(a.outerHTML)
	assert.eq(a.querySelector('style').textContent.trim(), `a-308[data-style="1"] { color: red }`)
	assert.eq(b.querySelector('style').textContent.trim(), `b-308[data-style="1"] { color: blue }`)

	a.remove();
});

Testimony.test('Solarite.embed.optionsNoStyles', () => {
	let count = 0;

	class R310 extends Solarite {
		render() {
			let options = {styles: false};
			h(this, options)`
				<style>
					:host { color: blue }
				</style>
				Text that should be blue.
				${count}
			`;
		}
	}

	let a = new R310();
	document.body.append(a);
	assert.eq(a.querySelector('style').textContent.trim(), `:host { color: blue }`)

	a.remove();
});

Testimony.test('Solarite.embed.styleDynamic', () => {
	let style1 = `:host { color: red }`
	let style2 = `:host { font-weight: bold }`

	class R320 extends Solarite {
		render() {
			h(this)`
				<style>
					${style1} ${style2}
				</style>
				Text that should be bold and red.
			`;
		}
	}

	let a = new R320();
	document.body.append(a);

	assert.eq(a.querySelector('style').textContent.trim(), `r-320[data-style="1"] { color: red } r-320[data-style="1"] { font-weight: bold }`)

	style1 = `:host { color: gold }`
	a.render();
	assert.eq(a.querySelector('style').textContent.trim(), `r-320[data-style="1"] { color: gold } r-320[data-style="1"] { font-weight: bold }`)

	a.remove();
});

Testimony.test('Solarite.embed.styleDynamicNoSpaces', () => {
	let style1 = `:host { color: red }`
	let style2 = `:host { font-weight: bold }`

	class R322 extends Solarite {
		render() {
			h(this)`
				<style>${style1}${style2}</style>
				Text that should be bold and red.
			`;
		}
	}

	let a = new R322();
	document.body.append(a);

	assert.eq(a.querySelector('style').childNodes.length, 5) // includes zero-length text node placeholders inserted.
	assert.eq(a.querySelector('style').textContent, `r-322[data-style="1"] { color: red }r-322[data-style="1"] { font-weight: bold }`)

	style1 = `:host { color: gold }`
	a.render();
	assert.eq(a.querySelector('style').textContent.trim(), `r-322[data-style="1"] { color: gold }r-322[data-style="1"] { font-weight: bold }`)

	a.remove();
});

Testimony.test('Solarite.embed.styleDynamicTag', () => {
	let style1 = h`<style>:host { color: green }</style>`

	class R325 extends Solarite {
		render() {
			h(this)`${style1}Text.`;
		}
	}

	let a = new R325();
	document.body.append(a);
	assert.eq(getHtml(a), `<r-325 data-style="1"><style>r-325[data-style="1"] { color: green }</style>Text.</r-325>`)

	style1 = h`<style>:host { color: orangered }</style>`
	a.render();
	assert.eq(getHtml(a), `<r-325 data-style="1"><style>r-325[data-style="1"] { color: orangered }</style>Text.</r-325>`)

	a.remove();
});

Testimony.test('Solarite.embed.styleHostParens', () => {
	class R327 extends Solarite {
		render() {
			h(this)`
				<style>
					:host(.sel) { color: rgb(0, 128, 0) }
					:host(:focus-within) { outline: 1px solid red }
					:host(:focus-within:not(.no-focus)) b { font-weight: bold }
					:host { padding: 3px }
				</style>
				<b>Text that turns green when .sel is added.</b>
			`;
		}
	}

	let a = new R327();
	document.body.append(a);

	let css = a.querySelector('style').textContent.replace(/\s+/g, ' ').trim();
	assert.eq(css,
		`r-327[data-style="1"].sel { color: rgb(0, 128, 0) } ` +
		`r-327[data-style="1"]:focus-within { outline: 1px solid red } ` +
		`r-327[data-style="1"]:focus-within:not(.no-focus) b { font-weight: bold } ` +
		`r-327[data-style="1"] { padding: 3px }`);

	// A wrong rewrite fails silently: the browser discards an invalid selector without any
	// console message. So also prove the rule was accepted by watching it apply.
	a.classList.add('sel');
	assert.eq(getComputedStyle(a).color, 'rgb(0, 128, 0)');

	a.remove();
});

Testimony.test('Solarite.embed.styleHostSplit', () => {
	// An expression can end a text node with ':host', leaving nothing after it for the
	// rewriter's lookahead to see.
	let sel = ':host';

	class R328 extends Solarite {
		render() {
			h(this)`<style>${sel} { color: rgb(0, 0, 128) }</style>Text that should be navy.`;
		}
	}

	let a = new R328();
	document.body.append(a);

	assert.eq(a.querySelector('style').textContent, `r-328[data-style="1"] { color: rgb(0, 0, 128) }`);
	assert.eq(getComputedStyle(a).color, 'rgb(0, 0, 128)');

	a.remove();
});

Testimony.test('Solarite.embed.styleLessThan', `A < in a style's text opens no tag, so the expressions after it in the style are written and the style applies.`, () => {
	let color = 'rgb(0, 0, 128)';

	class R329 extends Solarite {
		render() {
			h(this)`<style>/* <b> isn't html */ @media (1px<width) { :host { color: ${color} } }</style>Text that should be navy.`;
		}
	}

	let a = new R329();
	a.render();
	document.body.append(a);

	assert.eq(a.querySelector('style').textContent, `/* <b> isn't html */ @media (1px<width) { r-329[data-style="1"] { color: rgb(0, 0, 128) } }`);
	assert.eq(getComputedStyle(a).color, 'rgb(0, 0, 128)');

	color = 'rgb(128, 0, 0)';
	a.render();
	assert.eq(getComputedStyle(a).color, 'rgb(128, 0, 0)');

	a.remove();
});

Testimony.test('Solarite.embed.svg', () => {
	class R330 extends Solarite {
		render() {
			h(this)`
				<div>
					<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
						<circle cx="25" cy="25" r="25" fill="blue" />
						<rect x="50" y="50" width="50" height="100" fill="green" />
					</svg>
				</div>
			`;
		}
	}

	let a = new R330();
	document.body.append(a);

	// Not sure how to test this, but it looks good visually.
	a.remove();
});

Testimony.test('Solarite.svg.dynamicChildren', () => {
	class R335 extends Solarite {
		values = [8, 14, 6];

		render() {
			let max = Math.max(...this.values);

			h(this)`
			<r-335>
				${svg`
				<svg viewBox="0 0 ${this.values.length * 14} 40" width="12em" height="4em" fill="currentColor">
					${this.values.map((value, i) => svg`
						<rect x=${i * 14} y=${40 - value / max * 40} width="10" height=${value / max * 40} rx="2">
							<title>${value}</title>
						</rect>`
					)}
				</svg>`}
			</r-335>`;
		}
	}

	let a = new R335();
	document.body.append(a);

	let rects = a.querySelectorAll('rect');
	assert.eq(rects.length, 3);
	assert.eq(rects[0].namespaceURI, 'http://www.w3.org/2000/svg');
	assert.eq(rects[0].querySelector('title').textContent, '8');

	a.values = [2, 4];
	a.render();
	rects = a.querySelectorAll('rect');
	assert.eq(rects.length, 2);
	assert.eq(rects[1].namespaceURI, 'http://www.w3.org/2000/svg');
	assert.eq(rects[1].querySelector('title').textContent, '4');

	a.remove();
});

Testimony.test('Solarite.embed.scriptStatic', () => {
	window.scriptStaticCount = 0;
	class R340 extends Solarite {
		render() {
			h(this)`
				<div>
					<script>
						window.scriptStaticCount++;
					</script>
				</div>
			`;
		}
	}

	let a = new R340();
	a.render();
	assert.eq(window.scriptStaticCount, 1);

	// Hasn't changed. Make sure it's not re-run.
	a.render();
	assert.eq(window.scriptStaticCount, 1);

	delete window.scriptStaticCount;
});

Testimony.test('Solarite.embed.scriptLessThan', `A < in a script's text opens no tag: the script runs, once, and the expressions after it find their places.`, () => {
	window.scriptLessThanCount = 0;
	let el = document.createElement('div');
	let render = value => h(el)`<script>for (let i=0, n=2; i<n; i++) window.scriptLessThanCount++; // isn't html</script><p title="${value}">${value}</p>`;
	render(1);
	assert.eq(window.scriptLessThanCount, 2);
	render(2);
	assert.eq(window.scriptLessThanCount, 2);
	assert.eq(el.lastChild.outerHTML, '<p title="2">2</p>');
	delete window.scriptLessThanCount;

	// An expression in the script's own text, after the '<'.
	let data = document.createElement('div');
	let renderData = value => h(data, {scripts: false})`<script type="text/plain">if (a<b) c(${value})</script>`;
	renderData(1);
	assert.eq(data.firstChild.textContent, 'if (a<b) c(1)');
	renderData(2);
	assert.eq(data.firstChild.textContent, 'if (a<b) c(2)');
});

Testimony.test('Solarite.embed.scriptTypes', `Only a script the browser would run is run: one with no type, or a JavaScript type.  A script of any other type holds data, such as JSON-LD, which is written with its expressions and left alone, and a module is not run either.`, () => {
	window.scriptTypesLog = [];
	let el = document.createElement('div');
	let render = name => h(el)`<script>scriptTypesLog.push('none')</script><script type="">scriptTypesLog.push('empty')</script>
		<script type="text/javascript">scriptTypesLog.push('js')</script><script type=" Application/X-JavaScript ">scriptTypesLog.push('x')</script>
		<script type="application/ld+json">{"@type": "Person", "name": "${name}"}</script><script type="application/json">{"a": 1}</script>
		<script type="module">scriptTypesLog.push('module')</script><script type="text/plain">scriptTypesLog.push('plain')</script>`;
	render('Ann');
	render('Bo');
	assert.eq(scriptTypesLog.join(), 'none,empty,js,x');
	assert.eq(JSON.parse(el.querySelector('[type="application/ld+json"]').textContent).name, 'Bo');
	delete window.scriptTypesLog;
});

Testimony.test('Solarite.embed.scriptAfterExpressions', `A script runs once its template's expressions are written, its own text and the attributes beside it included: in a root template, in a child template and in a list row.  A script in a template with no expressions runs too, and none runs again on the next render.`, () => {
	window.scriptAfterLog = [];
	let el = document.createElement('div');
	document.body.append(el);
	let render = v => h(el)`<p data-script-after title=${v}></p><script>scriptAfterLog.push('${v}' + document.querySelector('[data-script-after]').title)</script>`;
	render('a');
	render('b');
	assert.eq(scriptAfterLog.join(), 'aa');

	scriptAfterLog = [];
	let renderChildren = n => h(el)`<div>${h`<script>scriptAfterLog.push('child ${n}')</script>`}</div>${h.map([n], m => h`<section><script>scriptAfterLog.push('row ${m}')</script></section>`)}${h`<script>scriptAfterLog.push('static')</script>`}`;
	renderChildren(1);
	assert.eq(scriptAfterLog.sort().join(), 'child 1,row 1,static');
	el.remove();
	delete window.scriptAfterLog;
});

// This feature is disabled because it doesn't seem useful.
Testimony.test('Solarite.embed._scriptDynamic', () => {

	let val = 1;
	class R350 extends Solarite {
		render() {
			h(this)`
				<div>
					<script>
						window.scriptStaticCount = ${val};
					</script>
				</div>
			`;
		}
	}

	let a = new R350();
	a.render();
	assert.eq(window.scriptStaticCount, 1);

	// Hasn't changed. Make sure it's not re-run.
	a.render();
	assert.eq(window.scriptStaticCount, 1);

	val = 2;
	a.render();
	assert.eq(window.scriptStaticCount, 2);

	delete window.scriptStaticCount;
});

//endregion



//region attrib
/*┌─────────────────╮
  | Attrib          |
  └─────────────────╯*/
Testimony.test('Solarite.attrib.single', () => {

	let val = 'one';

	class R400 extends Solarite {
		render() {
			h(this)`<div class="${val}">${val}</div>`;
		}
	}

	let a = new R400();
	a.render();

	assert.eq(getHtml(a), `<r-400><div class="one">one</div></r-400>`)


	val = 'two';
	a.render();
	assert.eq(getHtml(a), `<r-400><div class="two">two</div></r-400>`)
});

Testimony.test('Solarite.attrib.singleAndText', () => {

	let val = 'one';

	class R410 extends Solarite {
		render() {
			h(this)`<div class="before ${val} after">${val}</div>`;
		}
	}

	let a = new R410();
	a.render();

	assert.eq(getHtml(a), `<r-410><div class="before one after">one</div></r-410>`);


	val = 'two';
	a.render();
	assert.eq(getHtml(a), `<r-410><div class="before two after">two</div></r-410>`);


	val = false;
	a.render();
	assert.eq(getHtml(a), `<r-410><div class="before  after"></div></r-410>`);
});

Testimony.test('Solarite.attrib.mixedTypesAndText', `Expressions of every type inside one attribute value are joined with its text: undefined, null, false, arrays and objects add nothing, a function is called, a Date is written as text.`, () => {
	let el = document.createElement('div');
	let render = (...v) => h(el)`<div title="a ${v[0]} ${v[1]} ${v[2]} ${v[3]} ${v[4]} z" lang="${v[5]}${v[6]}"></div>`;

	render(1, null, undefined, true, 0, 'e', 'n');
	assert.eq(el.firstChild.getAttribute('title'), 'a 1   true 0 z');
	assert.eq(el.firstChild.getAttribute('lang'), 'en');

	render(false, new Date(0), {b: 1}, [1, 2], () => () => 'f', 10n, '');
	assert.eq(el.firstChild.getAttribute('title'), 'a  1970-01-01 00:00:00.000Z   f z');
	assert.eq(el.firstChild.getAttribute('lang'), '10');
});

Testimony.test('Solarite.attrib.function', () => {

	let val = 'one';

	class R413 extends Solarite {
		render() {
			h(this)`<div class="${()=>val}">${val}</div>`;
		}
	}

	let a = new R413();
	a.render();

	assert.eq(getHtml(a), `<r-413><div class="one">one</div></r-413>`)


	val = 'two';
	a.render();
	assert.eq(getHtml(a), `<r-413><div class="two">two</div></r-413>`)
});

Testimony.test('Solarite.attrib.functionAndText', () => {

	let val = 'one';

	class R415 extends Solarite {
		render() {
			h(this)`<div class="before ${()=>val} after">${val}</div>`;
		}
	}

	let a = new R415();
	a.render();

	assert.eq(getHtml(a), `<r-415><div class="before one after">one</div></r-415>`);


	val = 'two';
	a.render();
	assert.eq(getHtml(a), `<r-415><div class="before two after">two</div></r-415>`);


	val = false;
	a.render();
	assert.eq(getHtml(a), `<r-415><div class="before  after"></div></r-415>`);
});

Testimony.test('Solarite.attrib.double', () => {

	let val1 = 'one';
	let val2 = 'two';

	class R420 extends Solarite {
		render() {
			h(this)`<div class="${val1}${val2}">${val1}</div>`;
		}
	}

	let a = new R420();
	a.render();

	assert.eq(getHtml(a), `<r-420><div class="onetwo">one</div></r-420>`)

	val1 = 'oneB';
	val2 = 'twoB';
	a.render();
	assert.eq(getHtml(a), `<r-420><div class="oneBtwoB">oneB</div></r-420>`)
});

Testimony.test('Solarite.attrib.doubleAndText', () => {

	let val1 = 'one';
	let val2 = 'two';

	class R430 extends Solarite {
		render() {
			h(this)`<div class="a ${val1} b ${val2} c">${val1}</div>`;
		}
	}

	let a = new R430();
	a.render();

	assert.eq(getHtml(a), `<r-430><div class="a one b two c">one</div></r-430>`)

	val1 = 'oneB';
	val2 = 'twoB';
	a.render();
	assert.eq(getHtml(a), `<r-430><div class="a oneB b twoB c">oneB</div></r-430>`)
});

Testimony.test('Solarite.attrib.duplicate', 'Warn on duplicate attributes', () => {

	let val = 'one';

	class R435 extends Solarite {
		render() {
			h(this)`<div class="a" class="${val}"></div>`;
		}
	}

	let a = new R435();
	let errorMessage = '';
	try {
		a.render();
	} catch (e) {
		errorMessage = e.message;	}

	assert(errorMessage.includes('duplicate attrib'));
});

Testimony.test('Solarite.attrib.quoteInUnquotedValue', `An attribute value written without quotes may hold an apostrophe or a quote, as it may in any html file.  The expressions after it, in the same value or anywhere later, still find their places.`, () => {
	let el = document.createElement('div');
	let render = value => h(el)`<p title=don't data-x=a"b>${value}</p><a href=/s?q=it's&n=${value} class=x>${value}</a>`;
	render(1);
	assert.eq(getHtml(el), `<div><p title="don't" data-x="a&quot;b">1</p><a href="/s?q=it's&amp;n=1" class="x">1</a></div>`);
	render(2);
	assert.eq(getHtml(el), `<div><p title="don't" data-x="a&quot;b">2</p><a href="/s?q=it's&amp;n=2" class="x">2</a></div>`);

	// In the rows of a keyed list, reordered.
	let list = document.createElement('ul');
	let renderList = ids => h(list)`${ids.map(id => h`<li key=${id} title=it's>${id}</li>`)}`;
	renderList([1, 2]);
	let first = list.firstElementChild;
	renderList([2, 1]);
	assert.eq(getHtml(list), `<ul><li title="it's">2</li><li title="it's">1</li></ul>`);
	assert.eq(list.lastElementChild, first);

	// A quote inside what the browser makes a comment of: <!...> and a '</' that no letter follows.
	assert.eq(getHtml(toEl(h`<div><!x don't><p>${1}</p></ isn't><i>${2}</i></div>`)), '<div><p>1</p><i>2</i></div>');
});

Testimony.test('Solarite.attrib.unquotedBeforeSelfClose', `An unquoted value that is one whole expression straight before a tag's /> ends there, and the tag closes itself, though html would read the slash as part of the value.  A handler written so is bound and not called while rendering, a value gets no slash, and an svg element is closed, in a template and in the rows of a list.  A slash written inside quotes stays in the value.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let calls = 0, f = () => { calls++; return 'ret'; };
	let render = n => h(el)`<input oninput=${f}/><input type=checkbox onchange=${f}/><img src=${'/a.png'}/><input value=${'v'}/><svg>${svg`<circle r=${n}/><rect/>`}</svg>`;
	render(5);
	render(6);
	let [input, checkbox, img, text] = el.children;
	assert.eq(calls, 0);
	assert.eq(input.getAttribute('oninput'), null);
	input.dispatchEvent(new Event('input', {bubbles: true}));
	checkbox.dispatchEvent(new Event('change'));
	assert.eq(calls, 2);
	assert.eq(img.getAttribute('src') + '|' + text.value, '/a.png|v');
	assert.eq(el.querySelector('circle').getAttribute('r'), '6');
	assert.eq(el.querySelector('circle').childNodes.length, 0); // Closed, so the <rect> is beside it.

	// The rows of a list.
	calls = 0;
	h(el)`${h.map([1, 2], id => h`<button onclick=${[f, id]} title=${id}/>`)}`;
	assert.eq(calls, 0);
	el.lastElementChild.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(calls + '|' + el.lastElementChild.title, '1|2');
	el.remove();

	// A slash inside the quotes, or followed by more of the value, belongs to the value.
	let base = '/base';
	let links = toEl(h`<p><a href="${base}/">a</a><a href=${base}/page>b</a><a href=${base}/ title=t>c</a></p>`);
	assert.eq([...links.children].map(a => a.getAttribute('href')).join(), '/base/,/base/page,/base/');
});

Testimony.test('Solarite.attrib.sparse', () => {

	let isEdit = false;

	class R440 extends Solarite {
		render() {
			h(this)`<div ${isEdit && 'contenteditable'}>${isEdit && 'Editable!'}</div>`;
		}
	}

	let a = new R440();
	a.render();
	assert.eq(getHtml(a), `<r-440><div></div></r-440>`)

	isEdit = true
	a.render();
	assert.eq(getHtml(a), `<r-440><div contenteditable="">Editable!</div></r-440>`)

	isEdit = false
	a.render();
	assert.eq(getHtml(a), `<r-440><div></div></r-440>`)
});

Testimony.test('Solarite.attrib.doubleSparse', () => {

	let toggle = false;

	class R450 extends Solarite {
		render() {
			h(this)`<div ${toggle && 'disabled spellcheck="false"'}>${toggle && 'Toggled!'}</div>`;
		}
	}

	let a = new R450();
	a.render();
	assert.eq(getHtml(a), `<r-450><div></div></r-450>`)

	toggle = true
	a.render();
	assert.eq(getHtml(a), `<r-450><div disabled="" spellcheck="false">Toggled!</div></r-450>`)

	toggle = false
	a.render();
	assert.eq(getHtml(a), `<r-450><div></div></r-450>`)
});

Testimony.test('Solarite.attrib.toggle', () => {

	let toggle = false;

	class R460 extends Solarite {
		render() {
			h(this)`<div disabled=${toggle}>${toggle && 'Toggled!'}</div>`;
		}
	}

	let a = new R460();
	a.render();
	assert.eq(getHtml(a), `<r-460><div></div></r-460>`)

	toggle = true
	a.render();
	assert.eq(getHtml(a), `<r-460><div disabled="">Toggled!</div></r-460>`)

	toggle = false
	a.render();
	assert.eq(getHtml(a), `<r-460><div></div></r-460>`)
});

Testimony.test('Solarite.attrib.toggleFunction', () => {

	let toggle = false;

	class R465 extends Solarite {
		render() {
			h(this)`<div disabled=${()=>toggle}>${toggle && 'Toggled!'}</div>`;
		}
	}

	let a = new R465();
	a.render();
	assert.eq(getHtml(a), `<r-465><div></div></r-465>`)

	toggle = true
	a.render();
	assert.eq(getHtml(a), `<r-465><div disabled="">Toggled!</div></r-465>`)

	toggle = false
	a.render();
	assert.eq(getHtml(a), `<r-465><div></div></r-465>`)
});

Testimony.test('Solarite.attrib.removeEmpty', 'Every empty value removes an ordinary attribute', () => {

	let val = 'red';

	class R466 extends Solarite {
		render() {
			h(this)`<div class=${val}></div>`;
		}
	}

	let a = new R466();
	a.render();
	let div = a.querySelector('div');
	assert.eq(div.getAttribute('class'), 'red');

	// Each of these removes the attribute outright, rather than leaving class="" behind.
	// Starting from a real value each time is the case that used to write an empty attribute.
	for (let empty of [undefined, false, null, '']) {
		val = 'red';
		a.render();
		val = empty;
		a.render();
		assert.eq(div.hasAttribute('class'), false, `class=\${${JSON.stringify(empty) ?? 'undefined'}} left an attribute`);
	}

	// A function expression returning an empty value skips makePrimitive(), so it's a separate path.
	class R467 extends Solarite {
		render() {
			h(this)`<div class=${() => val}></div>`;
		}
	}
	let b = new R467();
	val = 'red';
	b.render();
	let bDiv = b.querySelector('div');
	assert.eq(bDiv.getAttribute('class'), 'red');
	for (let empty of [undefined, false, null, '']) {
		val = 'red';
		b.render();
		val = empty;
		b.render();
		assert.eq(bDiv.hasAttribute('class'), false, `class=\${()=>${JSON.stringify(empty) ?? 'undefined'}} left an attribute`);
	}

	// Zero is a real value and must survive.
	val = 0;
	a.render();
	assert.eq(a.querySelector('div').getAttribute('class'), '0');
});

Testimony.test('Solarite.attrib.emptyProperty', 'An empty value clears an html property instead of writing "false"', () => {

	let val = 'abc';
	let checked = true;

	class R468 extends Solarite {
		render() {
			h(this)`<div><input data-id="text" value=${val}><input data-id="box" type="checkbox" checked=${checked}></div>`;
		}
	}

	let a = new R468();
	a.render();
	assert.eq(a.text.value, 'abc');
	assert.eq(a.box.checked, true);

	// A string-valued property must end up empty, not holding the text "false".
	for (let empty of [undefined, false, null, '']) {
		val = 'abc';
		a.render();
		val = empty;
		a.render();
		assert.eq(a.text.value, '', `value=\${${JSON.stringify(empty) ?? 'undefined'}} did not clear the input`);
	}

	// A boolean-valued property still goes false.
	checked = false;
	a.render();
	assert.eq(a.box.checked, false);

	// And '' on a property is an ordinary value, so the input is still usable afterwards.
	val = 'xyz';
	a.render();
	assert.eq(a.text.value, 'xyz');
});

Testimony.test('Solarite.attrib.mediaProperties', `A <video> or an <audio> is muted and given a volume through the muted and volume properties it inherits from HTMLMediaElement, in a template and in the rows of a list, instead of being given muted and volume attributes that do nothing.`, () => {
	let el = document.createElement('div');
	let render = (muted, volume) => h(el)`<video muted=${muted} volume=${volume}></video>${h.map([{muted, volume}], a => h`<p><audio muted=${a.muted} volume=${a.volume}></audio></p>`)}`;
	let state = () => [el.querySelector('video'), el.querySelector('audio')].map(m => m.muted + ' ' + m.volume).join();
	render(true, 0.25);
	assert.eq(state(), 'true 0.25,true 0.25');
	render(false, 1);
	assert.eq(state(), 'false 1,false 1');
	render(true, 0.5);
	assert.eq(state(), 'true 0.5,true 0.5');
});

Testimony.test('Solarite.attrib.emptyBooleanProperty', `null and an empty string turn a boolean property such as disabled off, as false does, given as values or returned by functions, on the first render and later ones, and in the rows of a list as they are created and rewritten.  Zero is an ordinary value, and disabled="0" disables, as in html.`, () => {
	let el = document.createElement('div');
	let got = [];
	for (let v of [true, null, true, '', true, false, true, undefined, true, () => '', true, () => null, 0]) {
		h(el)`<button disabled=${v}></button>`;
		got.push(Number(el.firstChild.disabled));
	}
	assert.eq(got.join(''), '1010101010101');

	// A first render, on the properties of several elements.
	h(el)`<button disabled=${null}></button><input required=${''}><select multiple=${null}></select><details open=${''}></details><select multiple><option selected=${null}>b</option></select>`;
	let [button, input, select, details, multi] = el.children;
	assert.eq([button.disabled, input.required, select.multiple, details.open, multi.firstChild.selected].map(Number).join(''), '00000');

	// The rows of a list, made and then rewritten.
	let render = values => h(el)`${h.map(values.map((off, i) => ({id: i, off})), row => h`<p key=${row.id}><button disabled=${row.off}>b</button></p>`)}`;
	let states = () => [...el.querySelectorAll('button')].map(b => Number(b.disabled)).join('');
	render([null, '', true]);
	assert.eq(states(), '001');
	render([true, true, null]);
	assert.eq(states(), '110');
	render(['', null, '']);
	assert.eq(states(), '000');
});

Testimony.test('Solarite.attrib.pseudoRoot', () => {
	let title = 'Hello'
	class R470 extends Solarite {
		render() {
			h(this)`<r-470 title="${title}">World</r-470>`
		}
	}

	let a = new R470();
	a.render();
	assert.eq(getHtml(a), `<r-470 title="Hello">World</r-470>`)


	title = 'Goodbye'
	a.render();
	assert.eq(a.outerHTML, `<r-470 title="Goodbye">World</r-470>`)

	title = false
	a.render();
	assert.eq(a.outerHTML, `<r-470>World</r-470>`)
});

Testimony.test('Solarite.attrib.pseudoRoot2', 'Static attribute overrides.', () => {
	let title = 'Hello'
	class R472 extends Solarite {
		render() {
			h(this)`<r-472 title="${title}" style="color: red">World</r-472>`
		}
	}
	R472.define();

	let b = toEl(`<r-472 style="color: green"></r-472>`);
	document.body.append(b);
	assert.eq(b.outerHTML, `<r-472 style="color: green" title="Hello">World</r-472>`);
	b.remove();


});

Testimony.test('Solarite.attrib.pseudoRoot3', 'Dynamic attribute overrides.', () => {
	let title = 'Hello'
	class R473 extends Solarite {
		render() {
			h(this)`<r-473 title="${title}" style="color: red">World</r-473>`
		}
	}
	R473.define();


	let a = toEl(`<r-473 title="Goodbye"></r-473>`);
	document.body.append(a);

	// Dynamic attributes take precedence
	assert.eq(a.outerHTML, `<r-473 title="Hello" style="color: red">World</r-473>`);

	a.render();
	assert.eq(a.outerHTML, `<r-473 title="Hello" style="color: red">World</r-473>`);


	title = 'Blue';
	a.setAttribute('style', 'color: blue');

	a.render();
	assert.eq(a.outerHTML, `<r-473 title="Blue" style="color: blue">World</r-473>`);

	a.remove();
});

Testimony.test('Solarite.attrib.multiple', '', () => {
	let button = 'Hello'
	class R474 extends Solarite {
		render() {
			h(this)`
				<r-474><button ${'class="primary"'} onclick=${e => {}}>${button}</button></r-474>`
		}
	}

	let a = new R474();
	a.render();

	assert.eq(getHtml(a), `<r-474><button class="primary">Hello</button></r-474>`);
});

Testimony.test('Solarite.attrib.multipleForms', `Whole attributes can be given as a string, an array of strings (nested or not), an object, or a function returning any of those.  Each render removes the attributes the one before it added and this one doesn't.`, () => {
	let el = document.createElement('div');
	let render = attribs => h(el)`<div><b ${attribs}>x</b></div>`;
	let html = () => el.firstChild.innerHTML;

	render('title="one two" data-x=1 hidden');
	assert.eq(html(), `<b title="one two" data-x="1" hidden="">x</b>`);

	render(['title="three"', ['lang=en', 'hidden']]);
	assert.eq(html(), `<b title="three" hidden="" lang="en">x</b>`);

	render({title: 'four', lang: null, hidden: false, 'data-y': 0, dir: undefined, class: ''});
	assert.eq(html(), `<b title="four" data-y="0" class="">x</b>`);

	render(() => ({title: 'five', hidden: true}));
	assert.eq(html(), `<b title="five" hidden="true">x</b>`);

	render(() => `title='six' data-z="a b"`);
	assert.eq(html(), `<b title="six" data-z="a b">x</b>`);

	render(() => null);
	assert.eq(html(), `<b>x</b>`);

	render('id=b1');
	render(null);
	assert.eq(html(), `<b>x</b>`);
});

Testimony.test('Solarite.attrib.wholeStringNames', `Whole attributes given as a string are split into the names the browser's own parser finds in them, so a name with a colon, a dot or an @ arrives whole, on an element and on a component.`, () => {
	let attribs = `x-on:click.prevent="go()" xml:lang=en @click='c' hx-on:click=h title="t" data-a.b`;
	let names = el => [...el.attributes].map(a => a.name + '=' + a.value).sort().join();
	let t = document.createElement('template');
	t.innerHTML = `<p ${attribs}></p>`;
	let expected = names(t.content.firstChild);

	let el = document.createElement('div');
	h(el)`<p ${attribs}></p>`;
	assert.eq(names(el.firstChild), expected);

	let got = null;
	class WholeStringNames extends HTMLElement {
		constructor(args) {
			super();
			got = Object.keys(args || {}).sort().join();
		}
	}
	customElements.define('whole-string-names', WholeStringNames);
	h(el)`<whole-string-names ${attribs}></whole-string-names>`;
	assert.eq(names(el.firstChild), expected);
	assert.eq(got, '@click,dataA.b,hxOn:click,title,xOn:click.prevent,xml:lang');
});

Testimony.test('Solarite.attrib.ids1', () => {
	class R500 extends Solarite {
		one;
		render() {
			h(this)`<div data-id="one"></div>`;
		}
	}

	let a = new R500();
	a.render();

	assert(a.one.tagName === 'DIV')
});

Testimony.test('Solarite.attrib.ids2', () => {
	class R510 extends Solarite {
		one;
		render() {
			h(this)`<div data-id="one"><p id="two"></p></div>`;
		}
	}

	let a = new R510();
	a.render();

	assert(a.one.tagName === 'DIV')
	assert(a.two.tagName === 'P')
});

Testimony.test('Solarite.attrib.idsDelve', () => {
	class R520 extends Solarite {
		one;
		render() {
			h(this)`<div data-id="one"><p id="path.to.p"></p></div>`;
		}
	}

	let a = new R520();
	a.render();

	assert(a.one.tagName === 'DIV')
	assert(a.path.to.p.tagName === 'P')
});

Testimony.test('Solarite.attrib.idsClobberBuiltin', "data-id matching a built-in property throws", () => {
	class R521 extends Solarite {
		render() {
			h(this)`<div data-id="title"></div>`; // title is a built-in HTMLElement property.
		}
	}
	assert.throws(() => new R521().render());
});

Testimony.test('Solarite.attrib.idsClobberMethod', "data-id matching a class method throws", () => {
	class R522 extends Solarite {
		render() {
			h(this)`<div data-id="save"></div>`;
		}
		save() {}
	}
	assert.throws(() => new R522().render());
});

Testimony.test('Solarite.attrib.property', () => {
	class R530 extends Solarite {
		enabled;
		render() {
			h(this)`<r-530><input type="checkbox" checked=${this.enabled}></p></r-530>`;
		}
	}

	let a = new R530();
	a.render();

	let input = a.firstElementChild;
	assert.eq(input.checked, false);

	a.enabled = true;
	a.render();
	assert.eq(input.checked, true);

	// Make sure manually checking it doesn't break it..
	input.checked = true;

	a.enabled = false;
	a.render();
	assert.eq(input.checked, false);

	input.click();
	assert.eq(input.checked, true);
	assert.eq(a.enabled, false); // It's not updated because we're not using two-way binding.  See the binding tests for that.
});

Testimony.test('Solarite.attrib.property2', 'same as above, but with disabled attrib', () => {
	class R531 extends Solarite {
		enabled;
		render() {
			h(this)`<r-531><button disabled=${!this.enabled}>Button</button></r-531>`;
		}
	}

	let a = new R531();
	a.render();
	document.body.append(a);

	let button = a.firstElementChild;
	assert.eq(button.disabled, true);

	a.enabled = true;
	a.render();
	assert.eq(button.disabled, false);

	// Make sure manually checking it doesn't break it..
	button.disabled = false;

	a.enabled = true;
	a.render();
	assert.eq(button.disabled, false);

	button.click();
	assert.eq(button.disabled, false);
	assert.eq(a.enabled, true); // It's not updated because we're not using two-way binding.  See the binding tests for that.

	button.remove();
});

Testimony.test('Solarite.attrib.inputValue', 'Make sure we can one-way bind to the value of input.', () => {

	class R540 extends Solarite {
		text = 1

		render() {
			h(this)`<input data-id="input" value=${this.text} oninput=${ev=>{ this.text = ev.target.value; this.render() }}>`
		}
	}

	let a = new R540();
	document.body.append(a);
	assert.eq(a.input.value, '1');


	// Simulate typing.
	// This caused reseting it to '2' below to fail until I modified Path.applyValueAttrib()
	a.input.value += '3'
	assert.eq(a.input.value, '13');

	a.text = 2
	a.render()
	assert.eq(a.input.value, '2')

	a.remove();
});

Testimony.test('Solarite.attrib.textareaValue', 'Make sure we can one-way bind to the value of textarea.', () => {

	class R550 extends Solarite {
		text = 1

		render() {
			h(this)`<textarea data-id="textarea" value=${this.text + '0'}></textarea>`
		}
	}

	let a = new R550();
	document.body.append(a);
	assert.eq(a.textarea.value, '10')


	// Simulate typing.
	// This caused reseting it to '2' below to fail until I modified Path.applyValueAttrib()
	a.textarea.value += '3'
	assert.eq(a.textarea.value, '103');

	a.text = 2
	a.render()
	assert.eq(a.textarea.value, '20')

	a.remove();
});

Testimony.test('Solarite.attrib.contenteditableValue', 'Make sure we can one-way bind to the value of contenteditables.', () => {

	class R555 extends Solarite {
		text = 1

		render() {
			h(this)`<div contenteditable data-id="contenteditable" value=${this.text + '0'}></div>`
		}
	}

	let a = new R555();
	document.body.append(a);
	assert.eq(a.contenteditable.innerHTML, '10')


	// Simulate typing.
	// This caused reseting it to '2' below to fail until I modified Path.applyValueAttrib()
	a.contenteditable.innerHTML += '3'
	assert.eq(a.contenteditable.innerHTML, '103');

	a.text = 2
	a.render()
	assert.eq(a.contenteditable.innerHTML, '20')

	a.remove();
});

Testimony.test('Solarite.attrib.objectAttributes', 'Make sure we can specify attributes as an object.', () => {
	class R560 extends Solarite {
		attrs = {
			class: 'test-class',
			'data-test': 'test-data',
			style: 'color: red',
			disabled: true
		}

		render() {
			h(this)`<div data-id="div" ${this.attrs}></div>`
		}
	}

	let a = new R560();
	document.body.append(a);

	// Check that all attributes from the object were applied
	assert.eq(a.div.getAttribute('class'), 'test-class');
	assert.eq(a.div.getAttribute('data-test'), 'test-data');
	assert.eq(a.div.getAttribute('style'), 'color: red');
	assert.eq(a.div.getAttribute('disabled'), 'true');

	// Update attributes and re-render
	a.attrs = {
		class: 'new-class',
		'data-test': 'new-data',
		style: 'color: blue'
		// disabled is removed
	};
	a.render();

	// Check that attributes were updated
	assert.eq(a.div.getAttribute('class'), 'new-class');
	assert.eq(a.div.getAttribute('data-test'), 'new-data');
	assert.eq(a.div.getAttribute('style'), 'color: blue');
	assert.eq(a.div.hasAttribute('disabled'), false); // disabled should be removed

	// Test with falsy values
	a.attrs = {
		class: 'final-class',
		'data-test': null,     // should be skipped
		style: undefined,      // should be skipped
		disabled: false        // should be skipped
	};
	a.render();

	// Check that falsy attributes were skipped
	assert.eq(a.div.getAttribute('class'), 'final-class');
	assert.eq(a.div.hasAttribute('data-test'), false);
	assert.eq(a.div.hasAttribute('style'), false);
	assert.eq(a.div.hasAttribute('disabled'), false);

	a.remove();
});
//endregion




//region comments
/*┌─────────────────╮
  | comments        |
  └─────────────────╯*/
Testimony.test('Solarite.comments.one', () => {

	class A480 extends Solarite {
		render() {
			h(this)`
				<!--a-->
				<div></div>`
		}
	}
	let a = new A480();
	document.body.append(a);
	assert.eq(getHtml(a), `<a-480><div></div></a-480>`);
	a.remove();
});

Testimony.test('Solarite.comments.two', () => {

	class A482 extends Solarite {
		render() {
			h(this)`<div><!--${1} ${2}-->${3}</div>`
		}
	}
	let a = new A482();

	a.render();
	assert.eq(getHtml(a), `<a-482><div>3</div></a-482>`)
	a.remove();
});

Testimony.test('Solarite.comments.punctuation', `An html comment may hold apostrophes, quotes and >, as it may in any html file.  The expressions after it and the ones commented out inside it still find their places.`, () => {
	let el = document.createElement('div');
	let render = value => h(el)`
		<!-- Don't show this to guests -->
		<p title=${value}>${value}</p>
		<!-- when a > b, "quoted" ${value} or 'not' -->
		<i class="a ${value}">${value}</i>`;
	render(1);
	assert.eq(getHtml(el), '<div><p title="1">1</p><i class="a 1">1</i></div>');
	render(2);
	assert.eq(getHtml(el), '<div><p title="2">2</p><i class="a 2">2</i></div>');

	// A block of html that was commented out, with the quoted attributes and the expressions it had.
	let block = document.createElement('div');
	let renderBlock = (a, b) => h(block)`<b>${a}</b><!-- <a href="${a}" title='it's'>${b}</a> > --><u>${b}</u>`;
	renderBlock(1, 2);
	assert.eq(getHtml(block), '<div><b>1</b><u>2</u></div>');
	renderBlock(3, 4);
	assert.eq(getHtml(block), '<div><b>3</b><u>4</u></div>');

	// The comment is kept as it was written, with a mark where its expression was.
	let kept = toEl(h`<div><!-- it's ${1} > 0 -->${2}</div>`);
	assert.eq(kept.firstChild.nodeValue.replace(/\ufdd0[\ue000-\uf8ff]/, '?'), ` it's ? > 0 `);
	assert.eq(kept.textContent, '2');

	// A conditional comment, a comment ended by --!>, and one that is never closed.
	assert.eq(getHtml(toEl(h`<div><!--[if IE]><p>${1}</p><![endif]--><p>${2}</p></div>`)), '<div><p>2</p></div>');
	assert.eq(toEl(h`<div><!-- don't --!><p title="${1}">${2}</p></div>`).lastChild.outerHTML, '<p title="1">2</p>');
	assert.eq(toEl(h`<div><p>${1}</p><!-- isn't closed <i>${2}</i></div>`).firstChild.outerHTML, '<p>1</p>');

	// Between the rows of a table, where the parser allows a comment and no text.
	let table = toEl(h`<table><tbody><!-- can't "skip" > --><tr><td>${1}</td></tr><!-- ${2}'s row --><tr><td>${3}</td></tr></tbody></table>`);
	assert.eq(getHtml(table), '<table><tbody><tr><td>1</td></tr><tr><td>3</td></tr></tbody></table>');

	// In svg.
	let chart = toEl(h`<svg>${svg`<!-- the circle's r > 0 --><circle r=${5}></circle>`}</svg>`);
	assert.eq(chart.firstElementChild.getAttribute('r'), '5');
});

Testimony.test('Solarite.comments.processingInstruction', `An expression inside <?x ...>, which some browsers make a comment of and Chrome a processing instruction, is counted as one in a comment is, and the expressions after it find their places.`, () => {
	let el = document.createElement('article');
	let render = (a, b) => h(el)`<p>a<?x ${a} ?>b</p><i>${b}</i>`;
	render('y', 1);
	render('z', 2);
	assert.eq(el.querySelector('p').textContent + '|' + el.querySelector('i').textContent, 'ab|2');
});

Testimony.test('Solarite.comments.inRows', `A comment that holds an apostrophe, a quote or > does not break the rows of a list, a component's template, or the render after one that threw.`, () => {

	// Keyed rows, reordered.  The row's elements are kept.
	let list = document.createElement('ul');
	let renderList = ids => h(list)`${ids.map(id => h`<li key=${id}><!-- the row's "id" > 0 --><a href=${'#' + id}>${id}</a></li>`)}`;
	renderList([1, 2]);
	let first = list.firstElementChild;
	assert.eq(getHtml(list), '<ul><li><a href="#1">1</a></li><li><a href="#2">2</a></li></ul>');
	renderList([2, 1]);
	assert.eq(getHtml(list), '<ul><li><a href="#2">2</a></li><li><a href="#1">1</a></li></ul>');
	assert.eq(list.lastElementChild, first);

	// Rows of an h.map() without keys, with an expression inside the comment, updated in place.
	let mapped = document.createElement('ul');
	let renderMapped = items => h(mapped)`${h.map(items, item => h`<li><!-- can't show ${item.id} --><b>${item.text}</b></li>`)}`;
	let a = {id: 1, text: 'a'};
	renderMapped([a, {id: 2, text: 'b'}]);
	assert.eq(getHtml(mapped), '<ul><li><b>a</b></li><li><b>b</b></li></ul>');
	renderMapped([{id: 3, text: 'c'}, a]);
	assert.eq(getHtml(mapped), '<ul><li><b>c</b></li><li><b>a</b></li></ul>');

	// A component with a slot, declared inside another template and rendered twice.
	class C484 extends Solarite {
		constructor(attribs={}) {
			super(attribs);
		}
		render(attribs={}) {
			h(this)`<c-484><!-- it's "the" label > ${attribs.label} --><b>${attribs.label}</b><slot></slot></c-484>`;
		}
	}
	C484.define();
	let host = document.createElement('div');
	let renderHost = label => h(host)`<!-- the parent's --><c-484 label=${label}><i>child</i></c-484>`;
	renderHost('x');
	assert.eq(getHtml(host), '<div><c-484 label="x"><b>x</b><slot><i>child</i></slot></c-484></div>');
	renderHost('y');
	assert.eq(getHtml(host), '<div><c-484 label="y"><b>y</b><slot><i>child</i></slot></c-484></div>');

	// A template that throws for another reason leaves nothing behind: the same comment renders afterward.
	let error;
	try {
		toEl(h`<!-- it's --><p a=${1} a=${2}></p>`);
	}
	catch (e) {
		error = e;
	}
	assert(error.message.includes('duplicate attribute'));
	assert.eq(toEl(h`<!-- it's --><p a=${1}>${2}</p>`).outerHTML, '<p a="1">2</p>');

	// A render that starts another render of a template with such a comment, from inside an expression.
	let inner = document.createElement('div'), outer = document.createElement('div');
	h(outer)`<!-- outer's --><p>${() => {
		h(inner)`<!-- inner's > --><i>${1}</i>`;
		return 2;
	}}</p>`;
	assert.eq(getHtml(inner), '<div><i>1</i></div>');
	assert.eq(getHtml(outer), '<div><p>2</p></div>');
});
//endregion



//region toEl
/*┌─────────────────╮
  | toEl            |
  └─────────────────╯*/

Testimony.test('Solarite.toEl.staticElement', () => {
	let button = toEl(`<button>hi</button>`);
	assert(button instanceof HTMLElement); // Not a DocumentFragment
	assert.eq(getHtml(button), `<button>hi</button>`)
})

Testimony.test('Solarite.toEl.staticElement2', () => {
	let button = toEl(`
		<button>hi</button>`);
	assert(button instanceof HTMLElement); // Not a DocumentFragment
	assert.eq(getHtml(button), `<button>hi</button>`)
})

Testimony.test('Solarite.toEl.staticElement3', () => {
	let button = toEl(` <!-- comment -->
		<button>hi</button>`);
	assert(button instanceof HTMLElement); // Not a DocumentFragment
	assert.eq(getHtml(button), `<button>hi</button>`)
})

Testimony.test('Solarite.toEl.staticElement4', () => {
	let button = toEl(` Hello`);
	assert(button instanceof Text);
	assert.eq(getHtml(button), ` Hello`)
})

Testimony.test('Solarite.toEl.staticElement5', () => {
	let button = toEl(` <!--comment--> Hello`);
	assert(button instanceof Text);
	assert.eq(getHtml(button), ` Hello`)
})

Testimony.test('Solarite.toEl.fragment', () => {
	let fragment = toEl(`Hello <button>hi</button>`);
	assert(fragment instanceof DocumentFragment);
	assert.eq(getHtml(fragment), `Hello |<button>hi</button>`)
});

Testimony.test('Solarite.toEl.topLevelExpression', `A template with an expression at its top level, beside its nodes rather than inside one of them, gives a DocumentFragment holding all of its top-level nodes in order, with what the expression drew among them.  It used to give the one node beside the expression alone and drop what the expression drew: Total: \${n} gave the text "Total: ", and a heading followed by a list gave the heading.  A template whose top level is one element or one component, with only white space or comments around it, still gives that element or component.`, () => {
	// What a result shows once it is appended somewhere, without the comments that mark where
	// the expressions are.
	let shown = node => {
		let div = document.createElement('div');
		div.append(node);
		return div.innerHTML.replace(/<!--.*?-->/g, '');
	};
	let rows = () => [1, 2].map(i => h`<p>${i}</p>`);

	// 1. Every such shape gives a DocumentFragment, which shows everything once it is appended.
	for (let [result, html] of [
		[toEl(h`Total: ${5}`), 'Total: 5'],
		[toEl(h`${5} items`), '5 items'],
		[toEl(h`<h1>Fruit</h1>${rows()}`), '<h1>Fruit</h1><p>1</p><p>2</p>'],
		[toEl(h` ${'x'} <b>y</b> `), ' x <b>y</b> '],
		[toEl(h`<tr><th>h</th></tr>${[1].map(i => h`<tr><td>${i}</td></tr>`)}`), '<tr><th>h</th></tr><tr><td>1</td></tr>'],
		[toEl(svg`<circle r="1"></circle>${svg`<g></g>`}`), '<circle r="1"></circle><g></g>'],
		[toEl(jsxTemplate(['<h1>Fruit</h1>', ''], jsxEscape(rows()))), '<h1>Fruit</h1><p>1</p><p>2</p>'], // Precompiled <><h1>Fruit</h1>{rows}</>

		// The template decides, not the value: one that draws nothing this time is a fragment too.
		[toEl(h`<b>x</b>${false}`), '<b>x</b>'],

		// These were fragments already.
		[toEl(h`${'x'}`), 'x'],
		[toEl(h`<h2>List</h2><ul>${rows()}</ul>`), '<h2>List</h2><ul><p>1</p><p>2</p></ul>']
	]) {
		assert(result instanceof DocumentFragment, html);
		assert.eq(shown(result), html);
	}

	// 2. A component beside an expression comes in the fragment too, constructed.
	class TopLevelComponent extends Solarite {
		constructor({a} = {}) {
			super();
			this.a = a;
		}
		render() {
			h(this)`<b>${this.a}</b>`;
		}
	}
	customElements.define('top-level-component', TopLevelComponent);
	let withComponent = toEl(h`<top-level-component a=${1}></top-level-component>${'beside'}`);
	assert(withComponent.firstChild instanceof TopLevelComponent);
	assert.eq(shown(withComponent), '<top-level-component a="1"><b>1</b></top-level-component>beside');

	// 3. One element, with white space and comments around it, is still given alone, also when one
	// of those comments holds an expression that was commented out, and so is one component.  An
	// expression inside the element or in a <style> is not at the top level.
	let one = h()`
		<!-- a comment -->
		<b title=${'t'}>${'x'}</b>
		<!-- ${'commented out'} -->`;
	assert(one instanceof HTMLElement);
	assert.eq(getHtml(one), '<b title="t">x</b>');
	assert(toEl(h`<div>Total: ${5}</div>`) instanceof HTMLDivElement);
	assert(toEl(h`<style>b { color: ${'red'} }</style>`) instanceof HTMLStyleElement);
	assert(toEl(h` <top-level-component a=${2}></top-level-component> `) instanceof TopLevelComponent);
});

Testimony.test('Solarite.toEl.topLevelList', `The rows of a list at the top level of a standalone template come back in its fragment, beside the template's other nodes, keyed or not and made by h.map() or not.  Rendering the template again through what it returned, as the render() of an object given to toEl() does, updates the rows where they were put.  An empty list leaves only the comment that marks where its rows go.`, () => {
	for (let mode of ['keyed', 'unkeyed', 'map', 'mapKeyed']) {
		let keyed = mode === 'keyed' || mode === 'mapKeyed';
		let list = toEl({
			items: [{id: 1}, {id: 2}],
			render() {
				let row = keyed ? item => h`<p key=${item.id}>${item.id}</p>` : item => h`<p>${item.id}</p>`;
				h(this)`<h1>Fruit</h1>${mode.startsWith('map') ? h.map(this.items, row) : this.items.map(row)}`;
			}
		});
		assert(list instanceof DocumentFragment, mode);
		assert.eq(getHtml(list), '<h1>Fruit</h1>|<p>1</p>|<p>2</p>', mode);

		// Appended between two nodes of the page, then reordered, emptied and filled again.
		let host = attachedDiv();
		host.append('[', list, ']');
		let second = host.querySelectorAll('p')[1];
		list.items = [list.items[1], list.items[0], {id: 3}];
		list.render();
		assert.eq(getHtml(host), '<div>[<h1>Fruit</h1><p>2</p><p>1</p><p>3</p>]</div>', mode);
		if (keyed)
			assert.eq(host.querySelector('p'), second, mode);
		list.items = [];
		list.render();
		assert.eq(getHtml(host), '<div>[<h1>Fruit</h1>]</div>', mode);
		list.items = [{id: 4}];
		list.render();
		assert.eq(getHtml(host), '<div>[<h1>Fruit</h1><p>4</p>]</div>', mode);
		host.remove();
	}

	// An empty list: beside the heading the fragment holds the comment its rows go before.  Alone,
	// it holds that comment and the one they go after.
	assert.eq(getHtml(h()`<h1>t</h1>${[]}`, true), '<h1>t</h1>|<!--PathEnd:0-->');
	assert.eq(getHtml(h()`${h.map([], item => h`<p>${item}</p>`)}`, true), '<!--Path:0-->|<!--PathEnd:0-->');
});

Testimony.test('Solarite.toEl.fragmentUpdate', `A standalone template that gives a DocumentFragment is updated by rendering the same template into that fragment again, while its nodes are still in it and after they were appended somewhere.  Appending them empties the fragment, and the update reaches them where they are: in the page, in a shadow root, or in an element that is not in the page.`, () => {
	// 1. h(fragment, template), before and after the nodes are appended.
	let total = n => h`Total: ${n}`;
	let fragment = toEl(total(5));
	h(fragment, total(6));
	let host = attachedDiv();
	host.append(fragment);
	assert.eq(fragment.childNodes.length, 0);
	h(fragment, total(7));
	assert.eq(getHtml(host), '<div>Total: 7</div>');
	host.remove();

	// 2. An object given to toEl() renders itself again from its own method.
	for (let where of ['page', 'open', 'closed', 'detached']) {
		let counter = toEl({
			count: 1,
			add() {
				this.count++;
				this.render();
			},
			render() {
				h(this)`Count: ${this.count}`;
			}
		});
		let el = document.createElement('div');
		let parent = where === 'open' || where === 'closed' ? el.attachShadow({mode: where}) : el;
		if (where !== 'detached')
			document.body.append(el);
		parent.append(counter);
		counter.add();
		counter.add();
		assert.eq(parent.textContent, 'Count: 3', where);
		el.remove();
	}
});

Testimony.test('Solarite.toEl.standalone1', () => {
	let button = toEl({
		count: 0,

		inc() {
			this.count++;
			this.render();
		},

		render() {
			h(this)`<button onclick=${this.inc}>I've been clicked ${this.count} times.</button>`
		}
	});
	//document.body.append(button);

	assert.eq(getHtml(button), `<button>I've been clicked 0 times.</button>`)

	button.inc();
	assert.eq(getHtml(button), `<button>I've been clicked 1 times.</button>`);

	button.dispatchEvent(new MouseEvent('click'));
	assert.eq(getHtml(button), `<button>I've been clicked 2 times.</button>`);

	//button.remove();
});

Testimony.test('Solarite.toEl.standalone2', () => {
	let list = toEl({
		items: [],

		add() {
			this.items.push('Item ' + this.items.length);
			this.render();
		},

		render() {
			h(this)`
			<div>
				<button onclick=${()=>this.add()}>Add Item</button>
				<hr>
				${this.items.map(item => h`
					<p>${item}</p>
				`)}
			</div>`
		}
	});

	//document.body.append(list);

	assert.eq(getHtml(list), `<div><button>Add Item</button><hr></div>`);

	// At one point, rendering a standalone component the first time would re-render everything.
	// Here we make sure the hr element doesn't come back.
	list.querySelector('hr').remove();
	list.render();

	assert.eq(getHtml(list), `<div><button>Add Item</button></div>`);

	list.add();
	assert.eq(getHtml(list), `<div><button>Add Item</button><p>Item 0</p></div>`);

	list.querySelector('button').dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(getHtml(list), `<div><button>Add Item</button><p>Item 0</p><p>Item 1</p></div>`);

	//list.remove();
});

Testimony.test('Solarite.toEl.standaloneId', "Test id's on standalone elmenets.", () => {
	let list = toEl({
		items: [],

		add() {
			this.items.push('Item ' + this.items.length);
			this.render();
		},

		render() {
			h(this)`
			<div>
			   <button data-id="button" onclick=${this.add}>Add Item</button>
			</div>`
		}
	});

	assert.eq(list.button.tagName, 'BUTTON');
});

Testimony.test('Solarite.toEl.standaloneStyle', "Test id's on standalone elmenets.", () => {
	let box = toEl({
		render() {
			h(this)`
			<div>
	         <style>:host { display: block; background: red; width: 20px; height: 20px }</style>
	      </div>`
		}
	});

	let styleId = box.getAttribute('data-style');
	assert.eq(box.firstElementChild.textContent, `div[data-style="${styleId}"] { display: block; background: red; width: 20px; height: 20px }`);
});

Testimony.test('Solarite.toEl.standalone3', () => {

	// Make sure a div inside a div doesn't replace the parent div.
	let list = toEl({
		items: [],

		render() {
			h(this)`
			<div>
				${this.items.map(item => h`
					<div>
						<input placeholder="Name" value=${item.name}>
						<input type="number" value=${item.qty}>
						<button onclick=${()=>this.removeItem(item)}>x</button>
					</div>
				`)}
			</div>`
		}
	});

	list.items.push({name: 'name', qty: 2});
	list.render();

	assert.eq(getHtml(list), `<div><div><input placeholder="Name" value="name"><input type="number" value="2"><button>x</button></div></div>`);
});


// TODO: This one fails because "this" isn't pointing to the right object when passed as part of a web component constructor:
/*
 h({

		onTableSelect(table, tableList) {
			this.select.value = table;
			this.select.close();
			this.render();
			tableList.render();
		},
		onViewSelect(table, tableList) {
			this.select.close();
			tableList.render();
		},

		render() {

			h(this)`
				<div class="group">
					<select-box-2 data-id="select" focusopen filter select class="input rem14" placeholder="Select table" value=${binding}>
						<table-list db=${DB} tables=${tables} access-level=${2} actions=${
							{
								onTableSelect: this.onTableSelect,
								onViewSelect: this.onViewSelect
							}
						}></table-list>
					</select-box-2>
					<file-button class="button primary row center-v" style="cursor: pointer !important" disabled=${this.select && !this.select.value}
						onchange=${(e, el) => onFileChange(e,this.select.value)}>Upload</file-button>
				</div>`
		}
	})
 */

Testimony.test('Solarite.toEl.standaloneChild', () => {

	function createItem(item) {
		return toEl({
			item: item,
			render(attribs = null) {
				// If attributes passed to constructor have changed.
				if (attribs)
					this.item = attribs.item;
				h(this)`
				<div>
				   <b>${this.item.name}</b> - ${this.item.description}<br>
				</div>`
			}
		});
	}

	function createList(items) {
		return toEl({
			items: items,
			render() {
				h(this)`
				<div>
					${this.items.map(item =>
					createItem(item)
				)}
				</div>`
			}
		});
	}

	let list = createList([
		{
			name: 'English',
			description: 'See spot run.'
		},

		{
			name: 'Science',
			description: 'Snails are mollusks.'
		}
	]);
	document.body.append(list);

	list.items[0].name = 'PhysEd';
	list.render(); // calls NotesItem.render() with the new item.

	assert.eq(getHtml(list), `<div><div><b>PhysEd</b> - See spot run.<br></div><div><b>Science</b> - Snails are mollusks.<br></div></div>`);

	list.remove();
});

Testimony.test('Solarite.toEl.component', `A template whose only node is a component gives the component itself, constructed with its attribute expressions and given the children declared inside its tag, exactly as when it has a sibling beside it or a wrapper around it.  It used to give the placeholder element that stands for a component until it is constructed, named to-el-component-solarite-placeholder, and to construct nothing.`, () => {
	let constructed = [];
	class ToElComponent extends Solarite {
		constructor({count = 0} = {}) {
			super();
			this.count = count;
			constructed.push(count);
		}
		add() {
			this.count++;
			this.render();
		}
		render() {
			h(this)`<button onclick=${this.add}>${this.count}</button><slot></slot>`;
		}
	}
	customElements.define('to-el-component', ToElComponent);

	// 1. toEl(), with an attribute expression, a static attribute and a child that has an expression.
	let a = toEl(h`<to-el-component count=${1} title="t"><i>${'kid'}</i></to-el-component>`);
	assert(a instanceof ToElComponent);
	assert.eq(getHtml(a), '<to-el-component title="t" count="1"><button>1</button><slot><i>kid</i></slot></to-el-component>');

	// 2. h(), with whitespace and a comment around the tag, and with no expressions at all.
	let b = h()`
		<!-- comment -->
		<to-el-component count=${2}></to-el-component>
	`;
	assert(b instanceof ToElComponent);
	let c = h()`<to-el-component></to-el-component>`;
	assert(c instanceof ToElComponent);
	assert.eq(constructed.join(), '1,2,0');

	// 3. It is a working component: its own handler renders it again, in the page.
	document.body.append(a);
	a.firstChild.click();
	assert.eq(getHtml(a), '<to-el-component title="t" count="1"><button>2</button><slot><i>kid</i></slot></to-el-component>');
	a.remove();

	// 4. Events written on the component's own tag are bound to the component.
	let log = [];
	let d = toEl(h`<to-el-component native:onkeyup=${() => log.push('keyup')} onfocus=${() => log.push('focus')}></to-el-component>`);
	d.dispatchEvent(new KeyboardEvent('keyup'));
	d.dispatchEvent(new FocusEvent('focus'));
	assert.eq(log.join(), 'keyup,focus');

	// 5. A customized built-in, written with is="...".
	class ToElParagraph extends HTMLParagraphElement {
		constructor({text} = {}) {
			super();
			this.text = text;
		}
		render() {
			h(this)`<b>${this.text}</b>`;
		}
	}
	customElements.define('to-el-paragraph', ToElParagraph, {extends: 'p'});
	let p = toEl(h`<p is="to-el-paragraph" text=${'hi'}></p>`);
	assert(p instanceof ToElParagraph);
	assert.eq(getHtml(p), '<p is="to-el-paragraph" text="hi"><b>hi</b></p>');

	// 6. With a sibling it comes in a fragment, and inside a wrapper in the wrapper, as before.
	let fragment = toEl(h`<to-el-component count=${3}></to-el-component><hr>`);
	assert(fragment instanceof DocumentFragment);
	assert(fragment.firstChild instanceof ToElComponent);
	let div = toEl(h`<div><to-el-component count=${4}></to-el-component></div>`);
	assert(div.firstChild instanceof ToElComponent);
	assert.eq(constructed.join(), '1,2,0,0,3,4');
});

Testimony.test('Solarite.toEl.componentDelegated', `A delegated handler written on the tag of a component that is a template's only node runs once the component is in the page.  The template's root is the fragment the component is made in, so this is the page's document listening for a standalone template, and the component being constructed at all.`, () => {
	class ToElDelegated extends Solarite {
		render() {
			h(this)`<button>x</button>`;
		}
	}
	customElements.define('to-el-delegated', ToElDelegated);

	// pointerdown is bound by no other test; see Solarite.delegation.standaloneFragment.
	let log = [];
	let el = toEl(h`<to-el-delegated onpointerdown=${(ev, node) => log.push(node.tagName)}></to-el-delegated>`);
	let host = document.createElement('div');
	document.body.append(host);
	host.append(el);
	el.firstChild.dispatchEvent(new Event('pointerdown', {bubbles: true}));
	assert.eq(log.join(), 'TO-EL-DELEGATED');
	host.remove();
});

Testimony.test('Solarite.toEl.componentThrows', `A component that is a template's only node and whose constructor throws lets the error through and leaves nothing behind for the next one: neither the children that were on their way to its slot nor a half-made root.`, () => {
	class ToElThrows extends Solarite {
		constructor({fail} = {}) {
			super();
			if (fail)
				throw new Error('constructor failed');
		}
		render() {
			h(this)`<b>ok</b><slot></slot>`;
		}
	}
	customElements.define('to-el-throws', ToElThrows);
	let error;
	try {
		toEl(h`<to-el-throws fail=${true}><i>lost</i></to-el-throws>`);
	}
	catch (e) {
		error = e;
	}
	assert.eq(error?.message, 'constructor failed');
	assert.eq(Globals.currentSlotChildren, null);
	let good = toEl(h`<to-el-throws fail=${false}></to-el-throws>`);
	assert.eq(getHtml(good), '<to-el-throws><b>ok</b><slot></slot></to-el-throws>');
});

Testimony.test('Solarite.toEl.componentDefinedLater', `A template whose only node is a component that isn't defined yet gives the placeholder, as it does for one nested deeper, and the component is built in the placeholder's place when customElements.define() is called.`, async () => {
	let warn = console.warn;
	console.warn = (...args) => {
		if (!(args[0] + '').includes('<to-el-late'))
			warn(...args);
	};
	try {
		let el = toEl(h`<to-el-late name=${'one'}><i>kid</i></to-el-late>`);
		let host = document.createElement('div');
		host.append(el);
		assert.eq(host.querySelector('to-el-late'), null);

		customElements.define('to-el-late', class extends HTMLElement {
			constructor(attribs) {
				super();
				this.name = attribs?.name;
			}
			render() {
				h(this)`<b>${this.name}</b><slot></slot>`;
			}
		});
		await customElements.whenDefined('to-el-late');
		await Promise.resolve();
		assert.eq(getHtml(host), '<div><to-el-late name="one"><b>one</b><slot><i>kid</i></slot></to-el-late></div>');
	}
	finally {
		console.warn = warn;
	}
});

//endregion



//region h
/*┌─────────────────╮
  | h               |
  └─────────────────╯*/
Testimony.test('Solarite.h.fragment2', () => {
	let fragment = h()`Hello <button>hi</button>`;
	assert(fragment instanceof DocumentFragment);
	assert.eq(getHtml(fragment), `Hello |<button>hi</button>`)
});

Testimony.test('Solarite.h.topLevelExpression', `h()\`...\` gives a DocumentFragment for a template with an expression at its top level, and appending it shows everything the template draws.  Total: \${n} used to give only the text "Total: ", and a heading followed by a list only the heading.  One element is still given as that element.`, () => {
	let n = 5;
	let rows = () => [1, 2].map(i => h`<li>${i}</li>`);
	let a = h()`<div>Total: ${n}</div>`;
	let b = h()`Total: ${n}`;
	let c = h()`<h2>List</h2><ul>${rows()}</ul>`;
	let d = h()`<h1>Fruit</h1>${rows()}`;
	assert(a instanceof HTMLDivElement);
	for (let result of [b, c, d])
		assert(result instanceof DocumentFragment);
	let host = attachedDiv();
	host.append(a, '|', b, '|', c, '|', d);
	assert.eq(getHtml(host), '<div><div>Total: 5</div>|Total: 5|<h2>List</h2><ul><li>1</li><li>2</li></ul>|<h1>Fruit</h1><li>1</li><li>2</li></div>');
	host.remove();
});

Testimony.test('Solarite.h.staticElement3', () => {
	let button = h()`<button>hi</button>`;
	assert(button instanceof HTMLElement);
	assert.eq(getHtml(button), `<button>hi</button>`)
});

Testimony.test('Solarite.h.staticElement4', () => {
	// with line return
	let button = h()`
		<button>hi</button>`;
	assert(button instanceof HTMLElement);
	assert.eq(getHtml(button), `<button>hi</button>`)
})

Testimony.test('Solarite.h.element', () => {
	let adjective = 'better'
	let button = h()`<button>I'm a <b>${adjective}</b> button</button>`;

	assert.eq(getHtml(button), `<button>I'm a <b>better</b> button</button>`)
})

Testimony.test('Solarite.h.fragmentRoot', `A template renders into a DocumentFragment or a shadow root as it does into an element, whether it has one root element or several: its nodes become children of the fragment, and a second render updates them in place.`, () => {
	for (let makeRoot of [
		() => document.createDocumentFragment(),
		() => document.createElement('div').attachShadow({mode: 'open'}),
		() => document.createElement('div').attachShadow({mode: 'closed'})
	]) {
		// 1. One root element.  A fragment has no tag for that element to be matched against.
		let root = makeRoot();
		let render = value => h(root)`<p title=${value}>${value}</p>`;
		render('a');
		let p = root.firstChild;
		assert.eq(getHtml(root), '<p title="a">a</p>');
		render('b');
		assert.eq(getHtml(root), '<p title="b">b</p>');
		assert.eq(root.firstChild, p);

		// 2. The same through h(root, template), and for a template with no expressions.
		root = makeRoot();
		h(root, h`<p>${1}</p>`);
		assert.eq(getHtml(root), '<p>1</p>');
		root = makeRoot();
		h(root)`<p>x</p>`;
		assert.eq(getHtml(root), '<p>x</p>');

		// 3. A keyed list inside the one root.
		root = makeRoot();
		let renderList = ids => h(root)`<ul>${ids.map(id => h`<li key=${id}>${id}</li>`)}</ul>`;
		renderList([1, 2]);
		let first = root.firstChild.firstElementChild;
		renderList([2, 1, 3]);
		assert.eq(getHtml(root), '<ul><li>2</li><li>1</li><li>3</li></ul>');
		assert.eq(root.firstChild.children[1], first);

		// 4. Several root nodes, and text.
		root = makeRoot();
		let renderTwo = value => h(root)`<b>${value}</b> and <i>${value}</i>`;
		renderTwo(1);
		renderTwo(2);
		assert.eq(getHtml(root), '<b>2</b>| and |<i>2</i>');

		// 5. What the fragment held before is kept after the template's nodes, as in an element.
		root = makeRoot();
		root.append(document.createElement('hr'));
		h(root)`<p>${1}</p>`;
		assert.eq(getHtml(root), '<p>1</p>|<hr>');
	}

	// 6. A custom element's own tag as the one root is merged into that element when the template
	// is rendered into it, and is an ordinary child when rendered into a fragment.
	class FragmentRootChild extends Solarite {
		render() {
			h(this)`<fragment-root-child><em>mine</em></fragment-root-child>`;
		}
	}
	customElements.define('fragment-root-child', FragmentRootChild);
	let root = document.createDocumentFragment();
	h(root)`<fragment-root-child title="t"></fragment-root-child>`;
	assert.eq(getHtml(root), '<fragment-root-child title="t"><em>mine</em></fragment-root-child>');
});

Testimony.test('Solarite.h.fragmentListCleared', `A list whose rows are all a DocumentFragment holds is taken out when it is cleared, so later renders show only their own rows: a fragment rendered again before it is placed, and the fragment where an element keeps the children it was given.`, () => {
	// 1. A fragment rendered again while it is still detached.
	for (let keyed of [false, true]) {
		let frag = document.createDocumentFragment(), ids = [1, 2, 3];
		let row = keyed ? id => h`<p key=${id}>${id}</p>` : id => h`<p>${id}</p>`;
		let render = () => h(frag)`${h.map(ids, row)}`;
		render();
		ids = [];
		render();
		assert.eq(frag.querySelectorAll('p').length, 0);
		ids = [5, 6];
		render();
		assert.eq(textsOf(frag, 'p'), '5,6');
	}

	// 2. An element that keeps the children it was given in a fragment until it is opened, as a
	// panel that draws its content lazily does.  With and without white space around the list.
	class FragmentKeeper extends HTMLElement {
		kept = document.createDocumentFragment();
		connectedCallback() {
			if (!this.opened)
				this.kept.append(...this.childNodes);
		}
		open() {
			this.opened = true;
			this.append(this.kept);
		}
	}
	customElements.define('fragment-keeper', FragmentKeeper);
	for (let keyed of [false, true])
		for (let space of [false, true]) {
			let el = document.createElement('div');
			document.body.append(el);
			let ids = [1, 2, 3];
			let row = keyed ? id => h`<p key=${id}>${id}</p>` : id => h`<p>${id}</p>`;
			let render = () => space
				? h(el)`<div><fragment-keeper> ${h.map(ids, row)} </fragment-keeper></div>`
				: h(el)`<div><fragment-keeper>${h.map(ids, row)}</fragment-keeper></div>`;
			render();
			ids = [];
			assert.eq(thrownBy(render), null);
			ids = [7];
			assert.eq(thrownBy(render), null);
			let keeper = el.querySelector('fragment-keeper');
			keeper.open();
			assert.eq(textsOf(keeper, 'p'), '7', 'keyed: ' + keyed + ', space: ' + space);
			el.remove();
		}
});

Testimony.test('Solarite.h.shadowHost', `An element that has a shadow root of its own is rendered into like any other element, whether the shadow root is open or closed.  With an open one every render used to empty the element first: the second render left it blank for good, and what it held before its first render was thrown away instead of being kept as slot content.`, () => {
	for (let mode of ['open', 'closed']) {
		// 1. Rendered three times.  What the element held before stays, after the template's nodes.
		let el = document.createElement('div');
		el.attachShadow({mode}).innerHTML = '<slot></slot>';
		el.append(document.createElement('hr'));
		let render = value => h(el)`<p>${value}</p>`;
		render(1);
		let p = el.firstChild;
		assert.eq(getHtml(el), '<div><p>1</p><hr></div>', mode);
		render(2);
		render(3);
		assert.eq(getHtml(el), '<div><p>3</p><hr></div>', mode);
		assert.eq(el.firstChild, p);

		// 2. A keyed list with a handler: the rows keep their elements and their handlers.
		let log = [];
		el = attachedDiv();
		el.attachShadow({mode}).innerHTML = '<slot></slot>';
		let renderList = ids => h(el)`<ul>${ids.map(id => h`<li key=${id} onclick=${() => log.push(id)}>${id}</li>`)}</ul>`;
		renderList([1, 2]);
		let first = el.firstChild.firstChild;
		renderList([2, 1, 3]);
		assert.eq(getHtml(el), '<div><ul><li>2</li><li>1</li><li>3</li></ul></div>', mode);
		assert.eq(el.firstChild.children[1], first);
		first.click();
		assert.eq(log.join(), '1', mode);
		el.remove();
	}
});

Testimony.test('Solarite.h.shadowHostComponent', `A component that has an open shadow root holding a slot, and renders its own content with h(this), keeps that content when it renders again: from its own click handler, and when the template it is declared in renders again.  The children declared inside its tag go to the slot of its template.`, () => {
	class ShadowHostCounter extends Solarite {
		count = 0;
		constructor({label = ''} = {}) {
			super();
			this.label = label;
			this.attachShadow({mode: 'open'}).innerHTML = '<slot></slot>';
		}
		add() {
			this.count++;
			this.render();
		}
		render(attribs) {
			if (attribs?.label)
				this.label = attribs.label;
			h(this)`<button onclick=${this.add}>${this.label}${this.count}</button><slot></slot>`;
		}
	}
	customElements.define('shadow-host-counter', ShadowHostCounter);

	// 1. On its own, in the page, clicked twice.
	let counter = new ShadowHostCounter({label: 'n'});
	document.body.append(counter);
	let button = counter.firstChild;
	button.click();
	button.click();
	assert.eq(getHtml(counter), '<shadow-host-counter><button>n2</button><slot></slot></shadow-host-counter>');
	assert.eq(counter.firstChild, button);
	counter.remove();

	// 2. Declared in a parent template with a child, and the parent rendered twice.
	let parent = attachedDiv();
	let render = label => h(parent)`<section><shadow-host-counter label=${label}><b>kid</b></shadow-host-counter></section>`;
	render('a');
	counter = parent.firstChild.firstChild;
	counter.firstChild.click();
	render('b');
	assert.eq(getHtml(parent), '<div><section><shadow-host-counter label="b"><button>b1</button><slot><b>kid</b></slot></shadow-host-counter></section></div>');
	assert.eq(parent.firstChild.firstChild, counter);
	parent.remove();
});

Testimony.test('Solarite.h.otherArgs', `What h() makes of an argument that is no template, string, function or element`, () => {
	// 1. Nothing to render gives an empty template.
	for (let empty of [null, false]) {
		let template = h(empty);
		assert(template instanceof Template);
		assert.eqJson(template.html, ['']);
	}

	// 2. Anything else is refused, an object that toEl() is not building included.
	const message = arg => {
		try {
			h(arg);
		}
		catch (e) {
			return e.message;
		}
	};
	assert.eq(message({}), 'h() does not support argument of type: object');
	assert.eq(message(5), 'h() does not support argument of type: number');
	assert.eq(message(0), 'h() does not support argument of type: 0');
	assert.eq(message(true), 'h() does not support argument of type: boolean');
	assert.eq(message(Symbol()), 'h() does not support argument of type: symbol');
});


//endregion




//region component
/*┌─────────────────╮
  | Component       |
  └─────────────────╯*/
Testimony.test('Solarite.component.tr', () => {

	class TR510 extends HTMLTableRowElement {
		constructor() {
			super();
			this.render();
		}
		render() {
			h(this)`<td>hello</td>`
		}
	}
	customElements.define('tr-510', TR510, {extends: 'tr'});

	let table = document.createElement('table')

	table.append(new TR510())
	document.body.append(table)

	assert.eq(table.outerHTML, `<table><tr is="tr-510"><td>hello</td></tr></table>`)

	table.remove();
});

Testimony.test('Solarite.component.arrayAttribWithEmptyItem', `An array of an object and an empty value reaches a child component as that array`, () => {
	// An attribute value of [object, 'name'] is a two-way binding path, which a component
	// receives as the value at that path.  [object, null] is not one, since null names nothing,
	// so the child gets the array itself.
	let got = [];
	class ArrayAttribChild extends Solarite {
		constructor(attribs) {
			super();
			got.push(attribs.items);
		}
		render() {
			h(this)`<array-attrib-child>x</array-attrib-child>`;
		}
	}
	ArrayAttribChild.define('array-attrib-child');

	let first = {a: 1, list: ['x']};
	const give = items => {
		h(document.createElement('div'))`<div><array-attrib-child items=${items}></array-attrib-child></div>`;
		return got.pop();
	};
	for (let empty of [null, undefined, false]) {
		let items = [first, empty];
		assert(give(items) === items);
		items = [first, 'a', empty];
		assert(give(items) === items);
	}

	// A path is still followed.
	assert.eq(give([first, 'a']), 1);
	assert.eq(give([first, 'list', 0]), 'x');
});

Testimony.test('Solarite.component.attribsFromDOM', () => {
	let construct = 0;
	let render = 0;
	let isChanged = false;

	class C500 extends Solarite {
		constructor(attribs={}) {
			super(attribs);
			construct++;
			this.attribs = attribs;
			this.render();
		}

		render(attribs=null, hasChanged=() => true) {
			if (attribs)
				this.attribs = attribs;

			h(this)`<c-500>${this.attribs.name}:${this.attribs.rows.join('|')}</c-500>`;
			render++;
			isChanged = hasChanged();
		}
	}
	C500.define();


	let div = document.createElement('div');
	div.innerHTML = '<c-500 name="a" rows="${[1, 2, 3, 4]}"></c-500>';
	let c = div.querySelector('c-500');


	//await new Promise(resolve => setTimeout(resolve, 1));
	assert.eq(getHtml(c), '<c-500 name="a" rows="${[1, 2, 3, 4]}">a:1|2|3|4</c-500>');
	assert.eq(construct, 1);
	assert.eq(render, 1);
	assert.eq(isChanged, true);

	c.render(); // Call without passing in attribs.
	assert.eq(getHtml(c), '<c-500 name="a" rows="${[1, 2, 3, 4]}">a:1|2|3|4</c-500>'); // unchanged
	assert.eq(construct, 1);
	assert.eq(render, 2);
	assert.eq(isChanged, true);

	c.render({name:'b', rows:[5]});
	assert.eq(getHtml(c), '<c-500 name="a" rows="${[1, 2, 3, 4]}">b:5</c-500>');
	assert.eq(construct, 1);
	assert.eq(render, 3);
	assert.eq(isChanged, true);

});

Testimony.test('Solarite.component.attribsFromParentComponent', () => {
	let construct = 0;
	let render = 0;
	let isChanged = false;

	class B504 extends Solarite {
		constructor(attribs={}) {
			super(attribs);
			construct++;
		}

		render(attribs={}, hasChanged=() => true) {
			//console.log('render', attribs);
			h(this)`<b-504>${attribs.name}:${attribs.rows.join('|')}</b-504>`;
			render++;
			isChanged = hasChanged();
		}
	}
	B504.define();

	class A504 extends Solarite {
		render() {
			h(this)`<a-504><b-504 name="a" rows=${[1, 2, 3, 4]}></b-504></a-504>`;
		}
	}
	customElements.define('a-504', A504);

	let a = new A504();
	document.body.append(a); // calls render()

	let b = a.querySelector('b-504');
	assert.eq(getHtml(a), `<a-504><b-504 name="a">a:1|2|3|4</b-504></a-504>`);
	assert.eq(construct, 1)
	assert.eq(render, 1);
	assert.eq(isChanged, true);

	a.render();
	assert.eq(construct, 1)
	assert.eq(render, 2); // ensure b.render() was called.
	assert.eq(isChanged, false);

	a.remove();

});

Testimony.test('Solarite.component.renderChanged', () => {
	let isChanged = false;

	class B506 extends Solarite {
		render(attribs={}, hasChanged=() => true) {
			h(this)`<b-506>${attribs.name}</b-506>`;
			isChanged = hasChanged();
		}
	}
	B506.define();

	class A506 extends Solarite {
		name = 'a';
		render() {
			h(this)`<a-506><b-506 name=${this.name}></b-506></a-506>`;
		}
	}
	A506.define();

	let a = new A506();
	document.body.append(a);
	let b = a.querySelector('b-506');
	assert.eq(getHtml(a), '<a-506><b-506 name="a">a</b-506></a-506>');
	assert.eq(isChanged, true);

	a.render();
	assert.eq(getHtml(a), '<a-506><b-506 name="a">a</b-506></a-506>');
	assert.eq(isChanged, false);

	a.name = 'b';
	a.render();
	assert.eq(getHtml(a), '<a-506><b-506 name="b">b</b-506></a-506>');
	assert.eq(isChanged, true);

	a.remove();
});

Testimony.test('Solarite.component.attribFunctions', 'Make sure we can pass functions to components via attributes', () => {
	let construct = 0;
	let render = 0;

	class C510Child extends Solarite {
		/** @param attribs {{getContent: function}} */
		constructor(attribs={}) {
			super(attribs);

			this.content = attribs.getContent({val: 1}); // comes from get-content attribute

			construct++;
			this.render(attribs);
		}

		render(attribs={}) {
			h(this)`<c-510-child>${this.content}</c-510-child>`;
			render++;
		}
	}
	C510Child.define('c-510-child');

	class C510 extends Solarite {
		render() {
			h(this)`<c-510><c-510-child get-content=${obj => 'a' + obj.val}></c-510-child></c-510>`;
		}
	}
	customElements.define('c-510', C510);

	let c = new C510();
	document.body.append(c); // renders

	assert.eq(getHtml(c), `<c-510><c-510-child>a1</c-510-child></c-510>`);

	c.remove();
});

Testimony.test('Solarite.component.eventAttrib',
	`Event attributes on a component bind once with (event, element) args and aren't passed as constructor fields.`, () => {

	let constructorAttribs;

	class C511Child extends Solarite {
		constructor(attribs={}) {
			super(attribs);
			constructorAttribs = attribs;

			// Copy constructor fields onto ourself, like a typical component.  If attribs
			// contained the onchange handler, this would set the element's native onchange
			// property, making the handler fire twice — and the native call passes only
			// (event), without the element argument.
			Object.assign(this, attribs);
			this.render();
		}

		render() {
			h(this)`<c-511-child></c-511-child>`;
		}
	}
	C511Child.define('c-511-child');

	let calls = [];
	class C511 extends Solarite {
		render() {
			h(this)`<c-511><c-511-child onchange=${(ev, el) => calls.push([ev.type, el])}></c-511-child></c-511>`;
		}
	}
	customElements.define('c-511', C511);

	let c = new C511();
	document.body.append(c);
	let child = c.querySelector('c-511-child');

	// The handler must reach the component only as an event binding, never as a field.
	assert(!('onchange' in constructorAttribs));
	assert.eq(child.onchange, null);

	// change isn't a delegatable event, so this exercises the direct addEventListener path.
	child.dispatchEvent(new Event('change', {bubbles: true}));
	assert.eq(calls.length, 1);
	assert.eq(calls[0][0], 'change');
	assert.eq(calls[0][1], child);

	c.remove();
});

Testimony.test('Solarite.component.staticChildrenInDom', () => {
	let construct = 0;
	let render = 0;

	class C515 extends HTMLElement {
		constructor() {
			super();
			construct++;
		}

		render() {
			h(this)`<c-515><slot></slot></c-515>`;
			render++;
		}
	}
	customElements.define('c-515', C515);


	let div = document.createElement('div');
	div.innerHTML = `<c-515><span>hello</span></c-515>`;
	let c = div.querySelector('c-515');
	c.render();

	assert.eq(getHtml(div.firstChild), `<c-515><slot><span>hello</span></slot></c-515>`);
	assert.eq(construct, 1);
	assert.eq(render, 1);

	c.render();

	assert.eq(getHtml(div.firstChild), `<c-515><slot><span>hello</span></slot></c-515>`);
	assert.eq(construct, 1);
	assert.eq(render, 2);

});

Testimony.test('Solarite.component.staticChildrenInSubComponent', () => {
	let construct = 0;
	let render = 0;

	class B516 extends HTMLElement {
		constructor() {
			super();
			construct++;
		}

		render() {
			h(this)`<b-516><slot></slot></b-516>` // TODO: Allow sending it as a NodeList instead of array.
			render++;
		}
	}
	customElements.define('b-516', B516);

	class A516 extends HTMLElement {
		render() {
			h(this)`<a-516><b-516>A<hr></b-516></a-516>`;
		}
	}
	customElements.define('a-516', A516);

	let a = new A516();
	document.body.append(a);
	a.render();
	let b = a.querySelector('b-516');

	assert.eq(a.outerHTML, `<a-516><b-516><slot>A<hr></slot></b-516></a-516>`);
	assert.eq(construct, 1)
	assert.eq(render, 1);


	a.render();
	assert.eq(a.outerHTML, `<a-516><b-516><slot>A<hr></slot></b-516></a-516>`);
	assert.eq(construct, 1)
	assert.eq(render, 2);

	b.render();
	assert.eq(a.outerHTML, `<a-516><b-516><slot>A<hr></slot></b-516></a-516>`);
	assert.eq(construct, 1)
	assert.eq(render, 3);

	a.remove();
});

Testimony.test('Solarite.component.dynamicChildrenInSubComponent', () => {

	const roles = ['A', 'B'];
	let construct = 0;
	let render = 0;

	class B517 extends HTMLElement {
		constructor() {
			super();
			construct++;
		}

		render() {
			h(this)`<b-517><slot></slot></b-517>` // TODO: Allow sending it as a NodeList instead of array.
			render++;
		}
	}
	customElements.define('b-517', B517);

	class A517 extends HTMLElement {
		render() {
			h(this)`<a-517><b-517>${roles}</b-517></a-517>`;
		}
	}
	customElements.define('a-517', A517);

	let a = new A517();
	document.body.append(a);
	a.render();
	let b = a.querySelector('b-517');

	assert.eq(getHtml(a), `<a-517><b-517><slot>AB</slot></b-517></a-517>`);
	assert.eq(construct, 1);
	assert.eq(render, 1);

	a.render();
	assert.eq(getHtml(a), `<a-517><b-517><slot>AB</slot></b-517></a-517>`);
	assert.eq(construct, 1);
	assert.eq(render, 2);

	roles.push('C');
	a.render();
	assert.eq(getHtml(a), `<a-517><b-517><slot>ABC</slot></b-517></a-517>`);
	assert.eq(construct, 1);
	assert.eq(render, 3);

	roles.splice(0, 3);
	a.render();
	assert.eq(getHtml(a), `<a-517><b-517><slot></slot></b-517></a-517>`);
	assert.eq(construct, 1);
	assert.eq(render, 4);

	roles.push('C');
	a.render();
	assert.eq(getHtml(a), `<a-517><b-517><slot>C</slot></b-517></a-517>`);
	assert.eq(construct, 1);
	assert.eq(render, 5);

	b.render();
	assert.eq(getHtml(a), `<a-517><b-517><slot>C</slot></b-517></a-517>`);
	assert.eq(construct, 1);
	assert.eq(render, 6);

	a.remove();
});

Testimony.test('Solarite.component.componentWithStaticAttribsFromExpr', 'Make sure child component is instantiated and not left as -solarite-placeholder', () => {
	let construct = 0;
	let render = 0;
	class C520Child extends HTMLElement {
		constructor() {
			super();
			construct++;
		}

		render(attribs) {
			h(this)`<c-520-child>${attribs.name}</c-520-child>`
			render++;
		}
	}
	customElements.define('c-520-child', C520Child);

	class C520 extends HTMLElement {
		render() {
			h(this)`<c-520>${h`<c-520-child name="a"></c-520-child>`}</c-520>`
		}
	}
	customElements.define('c-520', C520);


	let a = new C520();
	a.render();
	assert.eq(`<c-520><c-520-child name="a">a</c-520-child></c-520>`, getHtml(a));
	assert.eq(construct, 1);
	assert.eq(render, 1);

	a.render(); // Rendering again without changes should still call child.render exactly once per parent render
	assert.eq(`<c-520><c-520-child name="a">a</c-520-child></c-520>`, getHtml(a));
	assert.eq(construct, 1);
	assert.eq(render, 2);

	a.render();
	assert.eq(construct, 1);
	assert.eq(render, 3);
});

Testimony.test('Solarite.component.componentWithDynamicAttribsFromExpr', () => {
	let renderCount = 0;

	// Definition
	class C521Child extends HTMLElement {
		constructor(attribs) {
			super();
		}

		render(attribs) {
			h(this)`<c-521-child style="color: ${attribs.color.value}">hi${attribs.message.text}</c-521-child>`
			renderCount++;
		}
	}
	customElements.define('c-521-child', C521Child);

	let message = {text: 'bye'};
	let color = {value: 'red'};

	class C521 extends HTMLElement {
		render() {
			h(this)`<c-521>${h`<c-521-child color=${color} message=${message}></c-521-child>`}</c-521>`
		}
	}
	customElements.define('c-521', C521);


	// Test 1
	let a = new C521();
	a.render();
	assert.eq(`<c-521><c-521-child style="color: red">hibye</c-521-child></c-521>`, getHtml(a));

	// Test 2
	message = {text: 'world'}
	a.render();
	assert.eq(`<c-521><c-521-child style="color: red">hiworld</c-521-child></c-521>`, getHtml(a));

	renderCount=0;
	a.render();
	// This only works because Path.applyExactNodes() calls applyExprs() if the NodeGroup has a web component.
	assert.eq(renderCount, 1);
});

Testimony.test('Solarite.component.componentWithDynamicAttribsFromExpr2', () => {

	class B522 extends HTMLElement {
		constructor(attribs) {
			super();
			this.attribs = attribs;
		}

		render(attribs) {
			this.attribs = attribs;
			h(this)`Title: ${attribs.title}`
		}
	}
	customElements.define('b-522', B522);

	let flag = true;

	class A522 extends HTMLElement {
		render() {
			h(this)`<a-522><b-522 ${flag && 'title="test"'}></b-522></a-522>`
		}
	}
	customElements.define('a-522', A522);

	let a = new A522();
	a.render();
	assert.eq(`<a-522><b-522 title="test">Title: test</b-522></a-522>`, getHtml(a));

	flag = false;
	a.render();
	assert.eq(`<a-522><b-522>Title: </b-522></a-522>`, getHtml(a));

	flag = true;
	a.render();
	assert.eq(`<a-522><b-522 title="test">Title: test</b-522></a-522>`, getHtml(a));
});

Testimony.test('Solarite.component.attribsFromObjectOrString', `Whole attributes on a component, given as an object or as a string, reach its constructor and its render() as camelCase arguments along with the attributes written in the template.`, () => {
	let constructed = [];
	class B523 extends HTMLElement {
		constructor(attribs) {
			super();
			constructed.push(JSON.stringify(attribs));
		}
		render(attribs) {
			this.attribs = attribs;
		}
	}
	customElements.define('b-523', B523);

	let make = attribs => {
		let el = document.createElement('div');
		h(el)`<div><b-523 name="n" ${attribs}></b-523></div>`;
		return el.querySelector('b-523');
	};

	let b = make({'max-size': 3, title: 't', open: true});
	assert.eq(constructed[0], `{"name":"n","maxSize":3,"title":"t","open":true}`);
	assert.eq(JSON.stringify(b.attribs), constructed[0]);
	assert.eq(b.getAttribute('max-size'), '3');

	b = make(`max-size=4 title="t two" open`);
	assert.eq(constructed[1], `{"name":"n","maxSize":"4","title":"t two","open":""}`);
	assert.eq(JSON.stringify(b.attribs), constructed[1]);
	assert.eq(b.getAttribute('max-size'), '4');

	// A value that stands for no attributes passes nothing.
	for (let other of [false, null, undefined, ''])
		assert.eq(JSON.stringify(make(other).attribs), `{"name":"n"}`);
	assert.eq(constructed.length, 6);
});

Testimony.test('Solarite.component.dashedAttribs', `A component's element carries each attribute once, under the name the template gives it, and render() receives the same arguments on every render.  An attribute with a dash in its name used to get a second copy without the dash, which kept its first value and came back as one more argument.`, () => {
	let calls = [];
	class B526 extends HTMLElement {
		constructor(attribs) {
			super();
			calls.push(JSON.stringify(attribs));
		}
		render(attribs) {
			calls.push(JSON.stringify(attribs));
		}
	}
	customElements.define('b-526', B526);
	let names = el => el.getAttributeNames().sort().map(name => `${name}=${el.getAttribute(name)}`).join(' ');

	// 1. Attributes written in the template, with and without expressions.
	let el = document.createElement('div');
	let render = size => h(el)`<div><b-526 data-foo="1" plain="p" max-size=${size} aria-label="x ${size}" tab-index=${0}></b-526></div>`;
	render(3);
	let b = el.querySelector('b-526');
	assert.eq(names(b), `aria-label=x 3 data-foo=1 max-size=3 plain=p tab-index=0`);
	assert.eq(calls[0], `{"dataFoo":"1","plain":"p","ariaLabel":"x 3","tabIndex":0,"maxSize":3}`);
	assert.eq(calls[1], calls[0]);

	// A twin named tabindex made the component focusable.
	assert.eq(b.tabIndex, -1);

	render(4);
	assert.eq(names(b), `aria-label=x 4 data-foo=1 max-size=4 plain=p tab-index=0`);
	assert.eq(calls[2], `{"dataFoo":"1","plain":"p","ariaLabel":"x 4","tabIndex":0,"maxSize":4}`);
	assert.eq(calls.length, 3);

	// 2. Whole attributes, as an object and as a string.  The ones a render leaves out are gone.
	calls = [];
	el = document.createElement('div');
	render = attribs => h(el)`<div><b-526 ${attribs}></b-526></div>`;
	render({'max-size': 3, 'data-k': 'a'});
	b = el.querySelector('b-526');
	assert.eq(names(b), `data-k=a max-size=3`);
	render({'max-size': 4});
	assert.eq(names(b), `max-size=4`);
	render(`max-size=5 data-k="b"`);
	assert.eq(names(b), `data-k=b max-size=5`);
	assert.eq(calls.join(), `{"maxSize":3,"dataK":"a"},{"maxSize":3,"dataK":"a"},{"maxSize":4},{"maxSize":"5","dataK":"b"}`);

	// 3. Rows of a list, built for one item and rewritten for another.
	calls = [];
	el = document.createElement('div');
	render = ids => h(el)`<div>${ids.map(id => h`<b-526 row-id=${id}></b-526>`)}</div>`;
	render([1, 2]);
	render([5, 6]);
	assert.eq([...el.querySelectorAll('b-526')].map(names).join(), `row-id=5,row-id=6`);
	assert.eq(calls.slice(4).join(), `{"rowId":5},{"rowId":6}`);

	// 4. The example of the documentation: every render passes the same arguments.
	calls = [];
	let item = {name: 'English'};
	el = document.createElement('div');
	render = size => h(el)`<div><b-526 item=${item} font-size=${size} data-id="item"></b-526></div>`;
	render(15);
	render(16);
	assert.eq(names(el.querySelector('b-526')), `data-id=item font-size=16`);
	assert.eq(calls.join(), `{"dataId":"item","fontSize":15,"item":{"name":"English"}},{"dataId":"item","fontSize":15,"item":{"name":"English"}},{"dataId":"item","fontSize":16,"item":{"name":"English"}}`);
});

Testimony.test('Solarite.component.boundAttrib', `A two-way binding on a component reaches it as the constructor argument, the render() argument and the property of that name, each holding the value of the latest render.  It used to leave an attribute behind as well, which kept the first value for good, so a component that read its attributes with assignAttributes() on every render was handed the first value again each time.`, () => {
	let seen = [];
	class B528 extends HTMLElement {
		value = 'unset';
		constructor(attribs) {
			super();
			seen.push('new ' + attribs.value);
		}
		render(attribs) {
			assignAttributes(this);
			seen.push(`render ${attribs.value} ${this.value}`);
		}
		connectedCallback() {
			seen.push(`connected ${this.value} ${this.getAttribute('value')}`);
		}
	}
	customElements.define('b-528', B528);

	let model = {name: 'a'};
	let el = document.createElement('div');
	document.body.append(el);
	let render = () => h(el)`<div><b-528 value=${[model, 'name']} max-size=${3}></b-528></div>`;
	render();
	let b = el.querySelector('b-528');

	// The first render() runs before the binding is applied, so the property is still the
	// component's own there; the argument has the value.
	assert.eq(seen.join(), `new a,render a unset,connected a null`);
	assert.eq(b.getAttributeNames().join(), 'max-size');

	// Later renders write the property before they call render().  The stale attribute had
	// assignAttributes() put the first value back over it.
	model.name = 'b';
	render();
	assert.eq(seen[3], `render b b`);
	assert.eq(b.value, 'b');
	assert.eq(b.getAttributeNames().join(), 'max-size');

	// The component's own change travels back.
	b.value = 'c';
	b.dispatchEvent(new Event('input', {bubbles: true}));
	assert.eq(model.name, 'c');
	el.remove();
});

Testimony.test('Solarite.component.definedLater', `A component whose tag isn't defined yet is built when customElements.define() is called, from the expressions of the latest render.  One warning is logged however many renders happen meanwhile, and a render that runs straight after the define builds it at once, and only once.`, async () => {
	let warnings = 0;
	let warn = console.warn;
	console.warn = (...args) => {
		if ((args[0] + '').includes('<late-52'))
			warnings++;
		else
			warn(...args);
	};
	try {
		let constructed = [];
		const define = tag => customElements.define(tag, class extends HTMLElement {
			constructor(attribs) {
				super();
				constructed.push(tag + ':' + attribs?.name);
			}
			render(attribs) {
				h(this)`<b>${attribs?.name}</b>`;
			}
		});

		// 1. Rendered three times before it is defined.
		let el = document.createElement('div');
		let render = name => h(el)`<div><late-524 name=${name}></late-524></div>`;
		render('one');
		render('two');
		render('three');
		assert.eq(warnings, 1);
		assert.eq(el.querySelector('late-524'), null);
		assert.eq(constructed.length, 0);
		define('late-524');
		await customElements.whenDefined('late-524');
		await Promise.resolve();
		assert.eq(constructed.join(), 'late-524:three');
		assert.eq(getHtml(el), `<div><div><late-524 name="three"><b>three</b></late-524></div></div>`);

		// It renders the usual way from then on.
		render('four');
		assert.eq(constructed.length, 1);
		assert.eq(getHtml(el), `<div><div><late-524 name="four"><b>four</b></late-524></div></div>`);
		assert.eq(warnings, 1);

		// 2. Rendered again straight after the define, before the wait is over.
		let el2 = document.createElement('div');
		let render2 = name => h(el2)`<div><late-525 name=${name}></late-525></div>`;
		render2('one');
		assert.eq(warnings, 2);
		define('late-525');
		render2('two');
		assert.eq(constructed.join(), 'late-524:three,late-525:two');
		await customElements.whenDefined('late-525');
		await Promise.resolve();
		assert.eq(constructed.join(), 'late-524:three,late-525:two');
		assert.eq(getHtml(el2), `<div><div><late-525 name="two"><b>two</b></late-525></div></div>`);
		assert.eq(warnings, 2);
	}
	finally {
		console.warn = warn;
	}
});

Testimony.test('Solarite.component.definedLaterIs', `A customized built-in (is="...") whose class isn't defined yet is built when customElements.define() is called, the same as a component with a tag of its own: once, from the expressions of the latest render, with the children declared inside it in its slot.`, async () => {
	// console.warn is left alone, unlike in definedLater: async tests run interleaved, and two
	// of them swapping console.warn would each put back the other's replacement.
	let constructed = [];
	const define = (tag, Base) => customElements.define(tag, class extends Base {
		constructor(attribs) {
			super();
			constructed.push(tag + ':' + attribs?.name);
		}
		render(attribs) {
			h(this)`<b>${attribs?.name}</b><slot></slot>`;
		}
	}, {extends: Base === HTMLLIElement ? 'li' : 'p'});

	// 1. Rendered twice before it is defined.
	let el = document.createElement('div');
	let render = name => h(el)`<div><p is="late-is-a" name=${name}><i>kid</i></p></div>`;
	render('one');
	render('two');
	assert.eq(constructed.length, 0);
	define('late-is-a', HTMLParagraphElement);
	await customElements.whenDefined('late-is-a');
	await Promise.resolve();
	assert.eq(constructed.join(), 'late-is-a:two');
	assert.eq(getHtml(el), `<div><div><p is="late-is-a" name="two"><b>two</b><slot><i>kid</i></slot></p></div></div>`);

	// It renders the usual way from then on.
	render('three');
	assert.eq(constructed.length, 1);
	assert.eq(getHtml(el), `<div><div><p is="late-is-a" name="three"><b>three</b><slot><i>kid</i></slot></p></div></div>`);

	// 2. Rendered again straight after the define, before the wait is over: built once.
	let el2 = document.createElement('div');
	let render2 = name => h(el2)`<div><p is="late-is-b" name=${name}></p></div>`;
	render2('one');
	define('late-is-b', HTMLParagraphElement);
	render2('two');
	assert.eq(constructed.join(), 'late-is-a:two,late-is-b:two');
	await customElements.whenDefined('late-is-b');
	await Promise.resolve();
	assert.eq(constructed.join(), 'late-is-a:two,late-is-b:two');
	assert.eq(getHtml(el2), `<div><div><p is="late-is-b" name="two"><b>two</b><slot></slot></p></div></div>`);

	// 3. Rows of a keyed list.  Each row is built in place and stays the element of its key.
	let el3 = document.createElement('ul');
	let items = [{id: 1, name: 'a'}, {id: 2, name: 'b'}, {id: 3, name: 'c'}];
	let render3 = () => h(el3)`<ul>${h.map(items, item => h`<li is="late-is-c" key=${item.id} name=${item.name}></li>`)}</ul>`;
	render3();
	define('late-is-c', HTMLLIElement);
	await customElements.whenDefined('late-is-c');
	await Promise.resolve();
	let rows = [...el3.querySelectorAll('li')];
	assert.eq(rows.map(row => row.getAttribute('is') + ':' + row.textContent).join(), 'late-is-c:a,late-is-c:b,late-is-c:c');
	items = [items[2], items[0]];
	render3();
	assert.eq([...el3.querySelectorAll('li')].map(row => rows.indexOf(row)).join(), '2,0');
	assert.eq(constructed.length, 5);
});

Testimony.test('Solarite.component.nested', () => {

	let bRenderCount = 0;

	class B525 extends Solarite {
		render() {
			h(this)`<div>B</div>`;
			bRenderCount++;
		}
	}
	B525.define();


	class A525 extends Solarite {
		render() {
			h(this)`<b-525></b-525>`
		}
	}

	let a = new A525();
	assert(!(a.firstChild instanceof B525))

	a.render();
	assert(a.firstChild instanceof B525);
	assert.eq(getHtml(a), `<a-525><b-525><div>B</div></b-525></a-525>`);
})

Testimony.test('Solarite.component.nestedExprConstructorArg', "Pass an object to the nested component's constructor", () => {

	let bRenderCount = 0;
	class B527 extends Solarite {

		constructor({user}={}) {
			super();
			this.user = user;
		}

		render(props={}) {
			if (props.user)
				this.user = props.user;
			h(this)`<div>Name:</div><div>${this.user.name}</div><div>Email:</div><div>${this.user.email}</div>`;
			bRenderCount++;
		}

	}
	B527.define();

	class A527 extends Solarite {
		title = 'Users'
		user = {name: 'John', email: 'john@example.com'};
		render() {
			h(this)`${this.title}<b-527 user="${this.user}"></b-527>`
		}
	}

	let a = new A527();
	document.body.append(a);
	assert.eq(getHtml(a), `<a-527>Users<b-527><div>Name:</div><div>John</div><div>Email:</div><div>john@example.com</div></b-527></a-527>`)


	a.user = {name: 'Fred', email: 'fred@example.com'};
	a.render();
	assert.eq(getHtml(a), `<a-527>Users<b-527><div>Name:</div><div>Fred</div><div>Email:</div><div>fred@example.com</div></b-527></a-527>`)


	a.user.name = 'Barry'
	a.render();
	assert.eq(getHtml(a), `<a-527>Users<b-527><div>Name:</div><div>Barry</div><div>Email:</div><div>fred@example.com</div></b-527></a-527>`)

	bRenderCount = 0
	a.render();
	assert.eq(bRenderCount, 1) // Make sure the child re-rendered.

	a.title = 'Users2'
	a.render();
	assert.eq(getHtml(a), `<a-527>Users2<b-527><div>Name:</div><div>Barry</div><div>Email:</div><div>fred@example.com</div></b-527></a-527>`)
	assert.eq(bRenderCount, 2); // Make sure the child re-rendered.

	a.remove();
});

Testimony.test('Solarite.component.nestedEventAttrib', () => {

	let clicked = 0;
	class B530 extends HTMLElement {

		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`
			<b-530>
				<div>Name:</div><div>Fred</div>
			</b-530>`;
		}

	}
	customElements.define('b-530', B530);

	class A530 extends Solarite {
		render() {
			h(this)`
			<a-530>
				<b-530 onclick=${() => clicked++}></b-530>
			</a-530>`
		}
	}

	let a = new A530();
	a.render();
	document.body.append(a);

	let b = a.querySelector('b-530');
	b.click();
	assert.eq(clicked, 1);

	a.remove();
});


Testimony.test('Solarite.component.nestedBinding', () => {

	class B535 extends HTMLElement {

		#value = null;

		get value() { return this.#value; }
		set value(v) {
			this.#value = v; this.render()
			this.dispatchEvent(new CustomEvent('input', {bubbles: true}));
		}

		constructor() {
			super();
			this.render();
		}

		render() {
			h(this)`
			<b-535>
				<div>Value: ${this.#value}</div>
			</b-535>`;
		}

	}
	customElements.define('b-535', B535);

	class A535 extends Solarite {
		value = 1;

		render() {
			h(this)`
			<a-535>
				<b-535 value=${[this, 'value']}></b-535>
			</a-535>`
		}
	}

	let a = new A535();
	a.render();
	document.body.append(a);

	let b = a.querySelector('b-535');

	b.value = 2;
	assert.eq(a.value, 2);

	a.value = 3;
	a.render();
	assert.eq(b.value, 3);
	a.remove();
});

// Pass an object to the child.
Testimony.test('Solarite.component.nestedNonSolarite', () => {

	let bRenderCount = 0;
	class B540 extends HTMLElement {

		constructor({user}={}) {
			super();
			this.user = user;
			this.render();
		}

		render(props={}) {
			if (props.user)
				this.user = props.user;
			h(this)`<div>Name:</div><div>${this.user.name}</div><div>Email:</div><div>${this.user.email}</div>`;
			bRenderCount++;
		}
	}
	customElements.define('b-540', B540);

	class A540 extends HTMLElement {
		title = 'Users'
		user = {name: 'John', email: 'john@example.com'};
		render() {
			h(this)`${this.title}<b-540 user="${this.user}"></b-540>`
		}
	}
	customElements.define('a-540', A540);

	let a = new A540();
	a.render();
	document.body.append(a);
	assert.eq(getHtml(a), `<a-540>Users<b-540><div>Name:</div><div>John</div><div>Email:</div><div>john@example.com</div></b-540></a-540>`)


	a.user = {name: 'Fred', email: 'fred@example.com'};
	a.render();
	assert.eq(getHtml(a), `<a-540>Users<b-540><div>Name:</div><div>Fred</div><div>Email:</div><div>fred@example.com</div></b-540></a-540>`)


	a.user.name = 'Barry'
	a.render();
	assert.eq(getHtml(a), `<a-540>Users<b-540><div>Name:</div><div>Barry</div><div>Email:</div><div>fred@example.com</div></b-540></a-540>`)

	bRenderCount = 0
	a.render();
	assert.eq(bRenderCount, 1) // render() is still called even when the changed flag is false.

	a.title = 'Users2'
	a.render();
	assert.eq(getHtml(a), `<a-540>Users2<b-540><div>Name:</div><div>Barry</div><div>Email:</div><div>fred@example.com</div></b-540></a-540>`)
	assert.eq(bRenderCount, 2) // render() is still called even when the changed flag is false.

	a.remove();
});

Testimony.test('Solarite.component.hasChanged', `hasChanged(), the second argument to render(), detects deep mutations.`, () => {
	let lastChanged;

	class B545 extends HTMLElement {
		render(attribs=null, hasChanged=() => true) {
			lastChanged = hasChanged();
			h(this)`<div>${attribs?.user?.name}</div>`
		}
	}
	customElements.define('b-545', B545);

	class A545 extends HTMLElement {
		user = {name: 'John'};
		render() {
			h(this)`<a-545><b-545 user=${this.user}></b-545></a-545>`
		}
	}
	customElements.define('a-545', A545);

	let a = new A545();
	a.render();
	document.body.append(a);
	assert.eq(lastChanged, true); // First render.

	a.render();
	assert.eq(lastChanged, false); // Nothing changed.

	a.user.name = 'Fred'; // Deep mutation of the same object.
	a.render();
	assert.eq(lastChanged, true);

	a.render();
	assert.eq(lastChanged, false);

	a.user = {name: 'Fred'}; // New object with identical content hashes the same.
	a.render();
	assert.eq(lastChanged, false);

	a.user = {name: 'Barry'};
	a.render();
	assert.eq(lastChanged, true);

	a.remove();
});

/**
 * An argument that counts how often the comparison behind hasChanged() reads it.  Its toJSON() sends it to
 * getObjectHash(), whose JSON.stringify() calls toJSON() once per comparison. */
function countedArg(name) {
	let arg = {name, reads: 0, toJSON() { arg.reads++; return {name: arg.name}; }};
	return arg;
}

Testimony.test('Solarite.component.hasChangedOnlyWhenCalled', `A component that never calls hasChanged() never pays for the comparison, and one that calls it twice in a render pays once.`, () => {
	let calls = 0, answers = [];

	class B546 extends HTMLElement {
		render(attribs=null, hasChanged=() => true) {
			for (let i = 0; i < calls; i++)
				answers.push(hasChanged());
			h(this)`<div>${attribs?.user?.name}</div>`
		}
	}
	customElements.define('b-546', B546);

	class A546 extends HTMLElement {
		user = countedArg('John');
		render() {
			h(this)`<a-546><b-546 user=${this.user}></b-546></a-546>`
		}
	}
	customElements.define('a-546', A546);

	let a = new A546();
	a.render();
	a.render();
	a.render();
	assert.eq(a.user.reads, 0); // Never asked, never compared.
	assert.eq(a.textContent, 'John');

	calls = 2;
	a.render();
	assert.eq(a.user.reads, 1); // Asked twice, compared once.
	assert.eqJson(answers, [true, true]); // The renders before didn't ask, so there was nothing to compare against.

	a.render();
	assert.eq(a.user.reads, 2);
	assert.eqJson(answers.slice(2), [false, false]);
});

Testimony.test('Solarite.component.hasChangedAfterSkipping', `A render that doesn't call hasChanged() leaves the next call answering true, even when the arguments are back to what the last call compared.  The component drew the arguments in between, so "unchanged" would be wrong.`, () => {
	let ask = true, lastChanged;

	class B547 extends HTMLElement {
		render(attribs=null, hasChanged=() => true) {
			if (ask)
				lastChanged = hasChanged();
			h(this)`<div>${attribs?.user?.name}</div>`
		}
	}
	customElements.define('b-547', B547);

	class A547 extends HTMLElement {
		user = {name: 'John'};
		render() {
			h(this)`<a-547><b-547 user=${this.user}></b-547></a-547>`
		}
	}
	customElements.define('a-547', A547);

	let a = new A547();
	a.render();
	a.render();
	assert.eq(lastChanged, false);

	ask = false;
	a.user.name = 'Fred';
	a.render();
	a.user.name = 'John'; // Back to what the last call compared.
	ask = true;
	a.render();
	assert.eq(lastChanged, true);

	a.render();
	assert.eq(lastChanged, false);
});

Testimony.test('Solarite.component.hasChangedOutsideRender', `hasChanged() answers true when called after render() has returned, and a manual render() uses the default.`, () => {
	let kept, lastChanged;

	class B548 extends HTMLElement {
		render(attribs=null, hasChanged=() => true) {
			kept = hasChanged;
			lastChanged = hasChanged();
			h(this)`<div>${attribs?.user?.name ?? 'manual'}</div>`
		}
	}
	customElements.define('b-548', B548);

	class A548 extends HTMLElement {
		user = {name: 'John'};
		render() {
			h(this)`<a-548><b-548 user=${this.user}></b-548></a-548>`
		}
	}
	customElements.define('a-548', A548);

	let a = new A548();
	a.render();
	a.render();
	assert.eq(lastChanged, false);
	assert.eq(kept(), true); // After render() returned.

	let b = a.querySelector('b-548');
	b.render(); // No arguments:  the default answers.
	assert.eq(lastChanged, true);
	assert.eq(b.textContent, 'manual');
});

Testimony.test('Solarite.component.hasChangedConstructorRender', `A component whose constructor renders itself gets true on the parent's next render, then false.`, () => {
	let lastChanged;

	class B549 extends Solarite {
		constructor(attribs={}) {
			super();
			this.user = attribs.user;
			this.render();
		}
		render(attribs=null, hasChanged=() => true) {
			if (attribs)
				this.user = attribs.user;
			lastChanged = hasChanged();
			h(this)`<b-549>${this.user.name}</b-549>`
		}
	}
	B549.define('b-549');

	class A549 extends HTMLElement {
		user = {name: 'John'};
		render() {
			h(this)`<a-549><b-549 user=${this.user}></b-549></a-549>`
		}
	}
	customElements.define('a-549', A549);

	let a = new A549();
	a.render();
	assert.eq(a.textContent, 'John');
	a.render();
	assert.eq(lastChanged, true);
	a.render();
	assert.eq(lastChanged, false);
});

Testimony.test('Solarite.component.hasChangedReplacerData', `hasChanged() sees functions, elements and cycles in the arguments:  swapping one function or element for another counts as a change, and circular data doesn't throw.`, () => {
	let lastChanged;

	class B550 extends HTMLElement {
		render(attribs=null, hasChanged=() => true) {
			lastChanged = hasChanged();
			h(this)`<div>x</div>`
		}
	}
	customElements.define('b-550', B550);

	let f1 = () => 1, f2 = () => 2;
	let el1 = document.createElement('div'), el2 = document.createElement('div');
	let cycle = {name: 'a'};
	cycle.self = cycle;

	class A550 extends HTMLElement {
		args = {format: f1, target: el1, config: {format: f1}, cycle};
		render() {
			let {format, target, config, cycle} = this.args;
			h(this)`<a-550><b-550 format=${format} target=${target} config=${config} cycle=${cycle}></b-550></a-550>`
		}
	}
	customElements.define('a-550', A550);

	let a = new A550();
	a.render();
	a.render();
	assert.eq(lastChanged, false);

	a.args.format = f2; // A function given straight to an attribute.
	a.render();
	assert.eq(lastChanged, true);

	a.args.config.format = f2; // A function inside an object.
	a.render();
	assert.eq(lastChanged, true);

	a.args.target = el2;
	a.render();
	assert.eq(lastChanged, true);

	cycle.name = 'b';
	a.render();
	assert.eq(lastChanged, true);
	a.render();
	assert.eq(lastChanged, false);
});

Testimony.test('Solarite.hash.plainMatchesReplacer', `getPlainHash() gives exactly the string getObjectHash() gives, and takes its fast way for plain data.`, async () => {
	let {getObjectHash, getPlainHash} = await import('../src/Template.js');
	let f = () => 1, el = document.createElement('div'), tpl = h`<b>${1}</b>`;
	let cycle = {a: 1}; cycle.self = cycle;
	let shared = {s: 1};
	class Row { constructor(i) { this.id = i; this.label = 'Row ' + i; } }
	let rows = Array.from({length: 50}, (_, i) => ({id: i, label: 'Item ' + i, price: i * 1.25, done: !!(i % 2), tags: ['a', 'b']}));
	let cases = {
		plain: [[{text: 'Milk', done: false}]],
		rows: [[rows]],
		classInstances: [[[new Row(1), new Row(2)]]],
		date: [[new Date(0)]],
		nulls: [[null, undefined, NaN, 0, '', -0, Infinity]],
		deep: [[{a: [{b: [1, {c: 'x'}]}]}]],
		manyAttributes: [['a ', 'b'], [rows], [true]],
		topFunction: [[f], [rows]],
		topNode: [[el]],
		map: [[new Map([[1, 2]])]],
		nestedFunction: [[{cb: f}]],
		nestedNode: [[{el}]],
		template: [[tpl]],
		cycle: [[cycle]],
		shared: [[shared, shared]],
		sharedAcrossAttributes: [[shared], [shared]],
		customToJSON: [[{toJSON: () => ({cb: f})}]],
		protoToJSON: [[new (class { n = 1; toJSON() { return {cb: f}; } })()]],
		sparse: [[[1, , 3]]],
	};
	let fast = ['plain', 'rows', 'classInstances', 'date', 'nulls', 'deep', 'manyAttributes', 'topFunction', 'topNode', 'map', 'sparse'];
	for (let [name, exprs] of Object.entries(cases)) {
		let plain = getPlainHash(exprs);
		if (fast.includes(name))
			assert(plain !== undefined, name + ' should take the fast way');
		else
			assert.eq(plain, undefined, name + ' needs the replacer');
		if (plain !== undefined)
			assert.eq(plain, getObjectHash(exprs), name);
	}
});

// TODO: This redraws every tr on every update.
// Maybe that can be fixed when keying is supported?
Testimony.test('Solarite.component.nestedTrLoop', () => {

	function tableRow(user) {
		let tr = toEl({
			render() {
				h(this)`<tr><td>${user.name}</td><td>${user.email}</td></tr>`
			}
		})
		return tr;
	}

	class MyTable extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'}
		]
		render() {
			h(this)`<table><tbody>${this.users.map(user => tableRow(user))}</tbody></table>`
		}
	}
	let table = new MyTable
	document.body.append(table)
	assert.eq(getHtml(table),
		`<my-table><table><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></my-table>`)


	table.users[1].name = 'Barry'

	table.render();
	assert.eq(getHtml(table),
		`<my-table><table><tbody>` +
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Barry</td><td>fred@example.com</td></tr>` +
		`</tbody></table></my-table>`)

	table.remove();
});

Testimony.test('Solarite.component.nestedComponentTrLoop', () => {
	let construct = 0;
	let render = 0;

	class TR540 extends HTMLTableRowElement {
		constructor() {
			super();
			let attribs = Solarite.getAttribs(this);
			this.user = attribs.user;
			construct++;
		}

		// The code at the end of Path.applyValueAttrib() updates the user property when the attribute changes.
		// So we don't need to intercept the props passed to render()
		render(attribs=null) { // Props is set when re-rendering, so we don't have to recreate the whole component.
			if (attribs?.user)
				this.user = attribs.user;
			h(this)`<td>${this.user.name}</td><td>${this.user.email}</td>`
			render++;
		}
	}
	customElements.define('tr-540', TR540, {extends: 'tr'});

	class Table540 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'}
		]
		render() {
			h(this)`<table><tbody>${this.users.map(user => h`<tr is="tr-540" user="${user}"></tr>`)}</tbody></table>`
		}
	}
	let table = new Table540();
	document.body.append(table);
	assert.eq(getHtml(table),
		`<table-540><table><tbody>`+
		`<tr is="tr-540"><td>John</td><td>john@example.com</td></tr>` +
		`<tr is="tr-540"><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-540>`);
	assert.eq(construct, 2); // because there are two tr's
	assert.eq(render, 2);


	table.users[1].name = 'Barry'
	table.render();
	assert.eq(getHtml(table),
		`<table-540><table><tbody>` +
		`<tr is="tr-540"><td>John</td><td>john@example.com</td></tr>` +
		`<tr is="tr-540"><td>Barry</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-540>`);
	assert.eq(construct, 2);
	assert.eq(render, 4);


	table.users[1] = {name: 'Dave', email: 'dave@example.com'};
	table.render();
	assert.eq(getHtml(table),
		`<table-540><table><tbody>` +
		`<tr is="tr-540"><td>John</td><td>john@example.com</td></tr>` +
		`<tr is="tr-540"><td>Dave</td><td>dave@example.com</td></tr>` +
		`</tbody></table></table-540>`)
	assert.eq(construct, 2);
	assert.eq(render, 6);

	table.remove();
});
//endregion



//region slots
/*┌─────────────────╮
  | Slots           |
  └─────────────────╯*/
// This is the same as the component children tests?
Testimony.test('Solarite.slots.basic', () => {
	class S10 extends Solarite {
		constructor(attribs={}) {
			super(attribs);
		}

		render(attribs) {
			h(this)`<s-10 title="test">slot content:<slot></slot></s-10>`
		}
	}
	S10.define(); // register as <s-10>.

	// 1. Test render() call when added to the DOM.
	let div = toEl('<div><s-10>test</s-10></div>'); // provide "test" as slot content.
	document.body.append(div); // will auto call render

	assert.eq(div.outerHTML, `<div><s-10 title="test">slot content:<slot>test</slot></s-10></div>`)

	div.remove();


	// 2. Slot on web component nested inside another web component.
	class P10 extends Solarite {
		render() {
			h(this)`<p-10><s-10>test2</s-10></p-10>`
		}
	}
	P10.define();

	div = toEl('<div><p-10></p-10></div>'); // provide "test" as slot content.
	document.body.append(div); // will auto call render

	assert.eq(div.outerHTML, `<div><p-10><s-10 title="test">slot content:<slot>test2</slot></s-10></p-10></div>`)
	div.remove();

});

Testimony.test('Solarite.slots.named', () => {

	class S20 extends Solarite {
		render() {
			h(this)`<div>slot content:<slot name="one"></slot><slot></slot><slot name="two"></slot></div>`
		}
	}
	S20.define();

	let div = toEl('<div><s-20>zero<div slot="one">One</div><div slot="one">One Again</div><div slot="two">Two</div>Three</s-20></div>')
	document.body.append(div);

	assert.eq(div.outerHTML, `<div><s-20><div>slot content:<slot name="one"><div slot="one">One</div><div slot="one">One Again</div></slot><slot>zeroThree</slot><slot name="two"><div slot="two">Two</div></slot></div></s-20></div>`)

	div.remove();
});

Testimony.test('Solarite.slots.namedTopLevelOnly', `A named slot takes only the children the element was given, not an element with that slot attribute inside one of them, which belongs to whatever holds it.`, () => {
	// 1. Inside a plain child.  It used to be taken out of its <section> and put in the slot.
	let el = toEl(`<div><section><b slot="head">inner</b></section><i slot="head">outer</i></div>`);
	h(el)`<header><slot name="head"></slot></header><main><slot></slot></main>`;
	assert.eq(getHtml(el), '<div><header><slot name="head"><i slot="head">outer</i></slot></header><main><slot><section><b slot="head">inner</b></section></slot></main></div>');

	// 2. Two components with a slot of the same name, one given to the other.  The outer one
	// took the inner one's child.
	class S25 extends Solarite {
		render() { h(this)`<header><slot name="head"></slot></header><slot></slot>`; }
	}
	S25.define();
	class S26 extends Solarite {
		render() { h(this)`<h2><slot name="head"></slot></h2>`; }
	}
	S26.define();
	let host = document.createElement('div');
	h(host)`<s-25><s-26><b slot="head">inner</b></s-26></s-25>`;
	assert.eq(getHtml(host), '<div><s-25><header><slot name="head"></slot></header><slot><s-26><h2><slot name="head"><b slot="head">inner</b></slot></h2></s-26></slot></s-25></div>');
});

Testimony.test('Solarite.slots.slotless', `Add children even when no slots present.`, () => {

	class S30 extends Solarite {
		render() {
			h(this)`<div>child1</div>`
		}
	}
	S30.define();

	let div = toEl('<div><s-30>child2<br>child3</s-30></div>')
	document.body.append(div);

	assert.eq(div.outerHTML, `<div><s-30><div>child1</div>child2<br>child3</s-30></div>`)

	div.remove();
});

Testimony.test('Solarite.slots.elementWithoutRender', `A custom element that doesn't render through Solarite keeps the children declared inside its tag, and they go on being updated.  They used to be left in the placeholder the element replaces, so the element came out empty.`, () => {

	// 1. No render() at all, as with an element from another library.
	class S31 extends HTMLElement {}
	customElements.define('s-31', S31);

	let clicks = 0;
	let div = document.createElement('div');
	document.body.append(div);
	let render = (text, items) => h(div)`<div><s-31 title=${text}><b>${text}</b> and <button onclick=${() => clicks++}>go</button>${items.map(item => h`<p>${item}</p>`)}</s-31></div>`;
	render('one', [1, 2]);
	assert.eq(getHtml(div), `<div><div><s-31 title="one"><b>one</b> and <button>go</button><p>1</p><p>2</p></s-31></div></div>`);
	div.querySelector('button').click();
	assert.eq(clicks, 1);

	let s31 = div.querySelector('s-31');
	let p2 = div.querySelectorAll('p')[1];
	render('two', [2, 3, 1]);
	assert.eq(getHtml(div), `<div><div><s-31 title="two"><b>two</b> and <button>go</button><p>2</p><p>3</p><p>1</p></s-31></div></div>`);
	assert.eq(div.querySelector('s-31'), s31);
	assert.eq(div.querySelectorAll('p')[1], p2); // Rows are rewritten in place, not drawn again.
	render('two', []);
	assert.eq(getHtml(div), `<div><div><s-31 title="two"><b>two</b> and <button>go</button></s-31></div></div>`);
	div.remove();

	// 2. A shadow root with a <slot> of its own shows them, as it would for children in plain html.
	class S32 extends HTMLElement {
		constructor() {
			super();
			this.attachShadow({mode: 'open'}).innerHTML = `<i><slot></slot></i>`;
		}
	}
	customElements.define('s-32', S32);
	div = document.createElement('div');
	document.body.append(div);
	render = items => h(div)`<div><s-32><b>${items.length}</b>${h.map(items, item => h`<p key=${item.id}>${item.id}</p>`)}</s-32></div>`;
	let a = {id: 'a'}, b = {id: 'b'}, c = {id: 'c'};
	render([a, b]);
	assert.eq(getHtml(div), `<div><div><s-32><b>2</b><p>a</p><p>b</p></s-32></div></div>`);
	let slot = div.querySelector('s-32').shadowRoot.querySelector('slot');
	assert.eq(slot.assignedNodes().filter(node => node.nodeType === 1).map(node => node.textContent).join(), '2,a,b');
	let pa = div.querySelector('p');
	render([c, b, a]);
	assert.eq(getHtml(div), `<div><div><s-32><b>3</b><p>c</p><p>b</p><p>a</p></s-32></div></div>`);
	assert.eq(div.querySelectorAll('p')[2], pa);
	assert.eq(slot.assignedNodes().filter(node => node.nodeType === 1).map(node => node.textContent).join(), '3,c,b,a');
	div.remove();

	// 3. Components declared among the children are kept with them, each with its own children.
	class S33 extends Solarite {
		render() {
			h(this)`<s-33><u><slot></slot></u></s-33>`;
		}
	}
	S33.define('s-33');
	div = document.createElement('div');
	h(div)`<div><s-31><s-31><em>${'a'}</em></s-31><s-33>${'b'}</s-33></s-31></div>`;
	assert.eq(getHtml(div), `<div><div><s-31><s-31><em>a</em></s-31><s-33><u><slot>b</slot></u></s-33></s-31></div></div>`);

	// 4. A render() that adds content of its own, without Solarite: the children come after
	// it, as they do in a Solarite component that has no slot.
	class S34 extends HTMLElement {
		render() {
			if (!this.firstChild)
				this.append(document.createElement('hr'));
		}
	}
	customElements.define('s-34', S34);
	div = document.createElement('div');
	render = text => h(div)`<div><s-34><b>${text}</b></s-34></div>`;
	render('one');
	assert.eq(getHtml(div), `<div><div><s-34><hr><b>one</b></s-34></div></div>`);
	render('two');
	assert.eq(getHtml(div), `<div><div><s-34><hr><b>two</b></s-34></div></div>`);

	// 5. A customized built-in: a <select> needs its options before it can be given its value.
	class S3h extends HTMLSelectElement {}
	customElements.define('s-3h', S3h, {extends: 'select'});
	div = document.createElement('div');
	render = value => h(div)`<div><select is="s-3h" value=${value}><option value="a">A</option>${['b', 'c'].map(v => h`<option value=${v}>${v}</option>`)}</select></div>`;
	render('c');
	let select = div.querySelector('select');
	assert(select instanceof S3h);
	assert.eq(select.options.length, 3);
	assert.eq(select.value, 'c');
	render('b');
	assert.eq(select.value, 'b');
});

Testimony.test('Solarite.slots.renderedLater', `A component whose first render through Solarite comes after it was created still gets the children declared inside its tag, in its slot.`, () => {

	// 1. render() does nothing until the component is ready.
	class S36 extends Solarite {
		ready = false;
		render() {
			if (this.ready)
				h(this)`<s-36><u><slot></slot></u></s-36>`;
		}
	}
	S36.define('s-36');

	let div = document.createElement('div');
	let render = (text, items) => h(div)`<div><s-36><b>${text}</b>${items.map(item => h`<p key=${item}>${item}</p>`)}</s-36></div>`;
	render('one', [1, 2]);
	assert.eq(getHtml(div), `<div><div><s-36><b>one</b><p>1</p><p>2</p></s-36></div></div>`);

	let s36 = div.querySelector('s-36');
	let p1 = div.querySelector('p');
	s36.ready = true;
	s36.render();
	assert.eq(getHtml(div), `<div><div><s-36><u><slot><b>one</b><p>1</p><p>2</p></slot></u></s-36></div></div>`);
	render('two', [2, 3, 1]);
	assert.eq(getHtml(div), `<div><div><s-36><u><slot><b>two</b><p>2</p><p>3</p><p>1</p></slot></u></s-36></div></div>`);
	assert.eq(div.querySelectorAll('p')[2], p1); // The rows moved into the slot are the ones updated.

	// 2. A class that renders only when it is connected, inside a parent that isn't connected yet.
	class S37 extends HTMLElement {
		connectedCallback() {
			h(this)`<s-37><u><slot></slot></u></s-37>`;
		}
	}
	customElements.define('s-37', S37);

	div = document.createElement('div');
	render = text => h(div)`<div><s-37><b>${text}</b></s-37></div>`;
	render('one');
	document.body.append(div);
	assert.eq(getHtml(div), `<div><div><s-37><u><slot><b>one</b></slot></u></s-37></div></div>`);
	render('two');
	assert.eq(getHtml(div), `<div><div><s-37><u><slot><b>two</b></slot></u></s-37></div></div>`);

	div.remove();
});

/**
 * The message render() throws when a custom element that doesn't render through Solarite has
 * taken apart the nodes an expression drew inside its tag.
 * @param tag {string} The element's tag name.
 * @return {string} */
const elementChanged = tag => `Solarite: <${tag}> changed the nodes \${...} drew inside it; wrap the \${...} in an element it leaves alone.`;

/**
 * The message of the error fn throws, or null when it throws nothing.
 * @param fn {function()}
 * @return {?string} */
function thrownBy(fn) {
	try {
		fn();
	}
	catch (e) {
		return e.message;
	}
	return null;
}

Testimony.test('Solarite.slots.elementDiscardsChildren', `An element that replaces its own content throws away the children it was given.  The next render throws an error that names the element, and so does every render after it.  Nothing is removed, drawn again or put back, and the expressions written after the element still get their values.`, () => {

	// 1. The content is replaced on every render(), the way a component written without
	// Solarite renders.  The first render() runs before the children are handed over, so they
	// show until the second.
	class S38 extends HTMLElement {
		render(attribs) {
			this.innerHTML = `<s>${attribs.name}</s>`;
		}
	}
	customElements.define('s-38', S38);

	let kinds = {
		array: items => items.map(item => h`<p>${item}</p>`),
		keyed: items => items.map(item => h`<p key=${item}>${item}</p>`),
		map: items => h.map(items, item => h`<p>${item}</p>`),
		template: items => items.length % 2 ? h`<i>${items.length}</i>` : h`<u>${items.length}</u>`,
		text: items => items.join()
	};
	let lists = [[1, 2], [1, 2, 3], [3, 1], [5, 3, 1, 6], [], [9], [9, 5]];
	for (let kind in kinds) {
		let div = document.createElement('div');
		let render = (name, items) => h(div)`<div title=${name}><s-38 name=${name}><b>${name}</b>${kinds[kind](items)}</s-38><em>${items.length}</em></div>`;
		render('n0', lists[0]);
		assert.eq(getHtml(div.querySelector('s-38')).startsWith(`<s-38 name="n0"><s>n0</s><b>n0</b>`), true);

		// The second render draws into the children, which are as Solarite left them, and
		// then calls the element's render(), which discards them.
		render('n1', lists[1]);
		assert.eq(getHtml(div), `<div><div title="n1"><s-38 name="n1"><s>n1</s></s-38><em>3</em></div></div>`);

		// From then on every render throws, before it draws anything inside the element.  The
		// template's expressions are applied last to first, so the one after the element has
		// its new value, and the element's own attribute and the one before it have not.
		for (let i=2; i<lists.length; i++) {
			assert.eq(thrownBy(() => render('n' + i, lists[i])), elementChanged('s-38'));
			assert.eq(getHtml(div), `<div><div title="n1"><s-38 name="n1"><s>n1</s></s-38><em>${lists[i].length}</em></div></div>`);
		}
	}

	// 2. The content is replaced once, when the element is connected.
	class S39 extends HTMLElement {
		connectedCallback() {
			this.innerHTML = `<s>mine</s>`;
		}
	}
	customElements.define('s-39', S39);
	for (let kind in kinds) {
		let div = document.createElement('div');
		document.body.append(div);
		let render = items => h(div)`<div><s-39>${kinds[kind](items)}</s-39></div>`;
		render(lists[0]);
		for (let i=1; i<lists.length; i++) {
			assert.eq(thrownBy(() => render(lists[i])), elementChanged('s-39'));
			assert.eq(getHtml(div), `<div><div><s-39><s>mine</s></s-39></div></div>`);
		}
		div.remove();
	}

	// 3. An element that removes only the comments and text among its children takes the
	// markers a list is drawn between.  The rows stay where the element left them, showing
	// the items of the last render that worked.
	class S3a extends HTMLElement {
		connectedCallback() {
			for (let node of [...this.childNodes])
				if (node.nodeType !== 1)
					node.remove();
		}
	}
	customElements.define('s-3a', S3a);
	let div = document.createElement('div');
	document.body.append(div);
	let render = items => h(div)`<div><s-3a>${items.map(item => h`<p>${item}</p>`)}</s-3a></div>`;
	render([1, 2]);
	assert.eq(getHtml(div), `<div><div><s-3a><p>1</p><p>2</p></s-3a></div></div>`);
	for (let items of [[2, 3], [], [4]]) {
		assert.eq(thrownBy(() => render(items)), elementChanged('s-3a'));
		assert.eq(getHtml(div), `<div><div><s-3a><p>1</p><p>2</p></s-3a></div></div>`);
	}
	div.remove();

	// 4. An expression inside a child element is another matter.  The element threw the
	// child away whole, and the expression's nodes are inside it as Solarite left them, so
	// nothing is thrown: the child goes on being updated where nobody sees it.
	class S6a extends HTMLElement {
		connectedCallback() {
			this.given = this.firstChild;
			this.innerHTML = `<s>mine</s>`;
		}
	}
	customElements.define('s-6a', S6a);
	div = document.createElement('div');
	document.body.append(div);
	render = text => h(div)`<div><s-6a><b>${text}</b></s-6a></div>`;
	render('one');
	assert.eq(thrownBy(() => render('two')), null);
	assert.eq(getHtml(div), `<div><div><s-6a><s>mine</s></s-6a></div></div>`);
	assert.eq(div.querySelector('s-6a').given.outerHTML, `<b>two</b>`);
	div.remove();
});

Testimony.test('Solarite.slots.elementMovesChildren', `An element that moves the children it was given, into its shadow root or into a wrapper, has them updated where it put them.`, () => {

	// 1. Everything is moved into the shadow root.
	class S3b extends HTMLElement {
		connectedCallback() {
			if (!this.shadowRoot)
				this.attachShadow({mode: 'open'}).append(...this.childNodes);
		}
	}
	customElements.define('s-3b', S3b);

	let clicked = [];
	let div = document.createElement('div');
	document.body.append(div);
	let render = (text, items) => h(div)`<div><s-3b><b>${text}</b>${items.map(item => h`<button key=${item} onclick=${() => clicked.push(item)}>${item}</button>`)}<i>${text}</i></s-3b></div>`;
	render('one', [1, 2, 3]);
	let s3b = div.querySelector('s-3b');
	assert.eq(getHtml(s3b), `<s-3b></s-3b>`);
	assert.eq(getHtml(s3b.shadowRoot), `<b>one</b>|<button>1</button>|<button>2</button>|<button>3</button>|<i>one</i>`);

	let button2 = s3b.shadowRoot.querySelectorAll('button')[1];
	render('two', [3, 2, 4]);
	assert.eq(getHtml(s3b), `<s-3b></s-3b>`);
	assert.eq(getHtml(s3b.shadowRoot), `<b>two</b>|<button>3</button>|<button>2</button>|<button>4</button>|<i>two</i>`);
	assert.eq(s3b.shadowRoot.querySelectorAll('button')[1], button2);
	button2.click();
	assert.eq(clicked.join(), '2');

	render('three', []);
	assert.eq(getHtml(s3b.shadowRoot), `<b>three</b>|<i>three</i>`);
	render('four', [5]);
	assert.eq(getHtml(s3b.shadowRoot), `<b>four</b>|<button>5</button>|<i>four</i>`);
	div.remove();

	// 2. Everything is moved into a wrapper of the element's own.
	class S3c extends HTMLElement {
		connectedCallback() {
			if (!this.firstElementChild?.matches('section')) {
				let section = document.createElement('section');
				section.append(...this.childNodes);
				this.append(section);
			}
		}
	}
	customElements.define('s-3c', S3c);
	div = document.createElement('div');
	document.body.append(div);
	render = items => h(div)`<div><s-3c>${h.map(items, item => h`<p>${item.name}</p>`)}</s-3c></div>`;
	let a = {name: 'a'}, b = {name: 'b'}, c = {name: 'c'};
	render([a, b]);
	assert.eq(getHtml(div), `<div><div><s-3c><section><p>a</p><p>b</p></section></s-3c></div></div>`);
	let pb = div.querySelectorAll('p')[1];
	render([c, b]);
	assert.eq(getHtml(div), `<div><div><s-3c><section><p>c</p><p>b</p></section></s-3c></div></div>`);
	assert.eq(div.querySelectorAll('p')[1], pb);
	render([]);
	render([a]);
	assert.eq(getHtml(div), `<div><div><s-3c><section><p>a</p></section></s-3c></div></div>`);
	div.remove();
});

Testimony.test('Solarite.slots.elementMovesSomeChildren', `An element that takes apart the nodes Solarite drew inside it (moves the rows of a list without the markers around them, takes a row out, puts the rows in another order, puts a node of its own between them, wraps each of them) makes the next render throw an error that names it.  The render changes nothing inside the element, and when the element puts the nodes back as they were, rendering works again on the same rows.`, () => {

	// 1. The elements among the children are moved into the shadow root, and the comments
	// that mark where the list goes are left behind.
	class S3d extends HTMLElement {
		connectedCallback() {
			if (!this.shadowRoot)
				this.attachShadow({mode: 'open'}).append(...this.children);
		}
	}
	customElements.define('s-3d', S3d);

	let div = document.createElement('div');
	document.body.append(div);
	let render = items => h(div)`<div><s-3d>${items.map(item => h`<p key=${item}>${item}</p>`)}</s-3d></div>`;
	render([1, 2, 3]);
	let s3d = div.querySelector('s-3d');
	assert.eq(getHtml(s3d.shadowRoot), `<p>1</p>|<p>2</p>|<p>3</p>`);

	// A keyed reorder moves rows before one another, and used to throw from the DOM here:
	// the rows it measures against were no longer children of the element.
	assert.eq(thrownBy(() => render([3, 1, 2, 4])), elementChanged('s-3d'));
	assert.eq(thrownBy(() => render([])), elementChanged('s-3d'));
	assert.eq(getHtml(s3d.shadowRoot), `<p>1</p>|<p>2</p>|<p>3</p>`);
	assert.eq(getHtml(s3d), `<s-3d></s-3d>`);

	// The element puts the rows back between the comments, and they are updated in place.
	let p1 = s3d.shadowRoot.querySelector('p');
	s3d.lastChild.before(...s3d.shadowRoot.childNodes);
	render([3, 1, 2, 4]);
	assert.eq(getHtml(s3d), `<s-3d><p>3</p><p>1</p><p>2</p><p>4</p></s-3d>`);
	assert.eq(s3d.querySelectorAll('p')[1], p1);
	div.remove();

	class S3e extends HTMLElement {}
	customElements.define('s-3e', S3e);
	for (let keyed of [false, true]) {
		div = document.createElement('div');
		render = items => h(div)`<div><s-3e><h2>List</h2>${items.map(item => keyed ? h`<p key=${item}>${item}</p>` : h`<p>${item}</p>`)}<hr></s-3e></div>`;
		render([1, 2, 3]);
		let s3e = div.querySelector('s-3e');
		let rows = [...s3e.querySelectorAll('p')];
		let asGiven = `<div><div><s-3e><h2>List</h2><p>1</p><p>2</p><p>3</p><hr></s-3e></div></div>`;

		// What the element does, what the element then holds, and how it undoes it.
		let changes = [
			// 2. A row is removed, as a list that lets its items be dismissed or filtered would.
			[() => rows[0].remove(), `<h2>List</h2><p>2</p><p>3</p>`, () => rows[1].before(rows[0])],

			// 3. The rows are put in another order, as a list that sorts its items would.
			[() => s3e.querySelector('hr').before(...[...rows].reverse()), `<h2>List</h2><p>3</p><p>2</p><p>1</p>`, () => s3e.querySelector('hr').before(...rows)],

			// 4. A node of the element's own is put among them.
			[() => rows[0].after(document.createElement('br')), `<h2>List</h2><p>1</p><br><p>2</p><p>3</p>`, () => s3e.querySelector('br').remove()],

			// 5. Each row is wrapped in an element of its own.
			[() => {
				for (let row of rows) {
					let li = document.createElement('li');
					row.replaceWith(li);
					li.append(row);
				}
			}, `<h2>List</h2><li><p>1</p></li><li><p>2</p></li><li><p>3</p></li>`, () => {
				for (let li of [...s3e.querySelectorAll('li')])
					li.replaceWith(li.firstChild);
			}],

			// 6. Everything is taken out, one node at a time, as an element that hides its
			// content would, and put back later in the same order.
			[() => {
				s3e.saved = [...s3e.childNodes];
				s3e.replaceChildren();
			}, ``, () => s3e.append(...s3e.saved)],

			// 7. A child that has no expression in it, but stands next to one that has, is
			// taken out: it is where the list starts.
			[() => s3e.querySelector('h2').remove(), `<p>1</p><p>2</p><p>3</p>`, () => s3e.prepend(s3e.saved[0])]
		];
		for (let [change, html, undo] of changes) {
			change();
			html = `<div><div><s-3e>${html}${html ? '<hr>' : ''}</s-3e></div></div>`;
			assert.eq(getHtml(div), html);
			assert.eq(thrownBy(() => render([3, 2, 1, 4])), elementChanged('s-3e'));
			assert.eq(thrownBy(() => render([])), elementChanged('s-3e'));
			assert.eq(getHtml(div), html); // Nothing was removed, drawn or put back.
			undo();
			assert.eq(getHtml(div), asGiven);
			render([1, 2, 3]);
			assert.eq(getHtml(div), asGiven);
			assert.eq([...s3e.querySelectorAll('p')].every((p, i) => p === rows[i]), true);
		}

		// Left alone, the list is updated as any other.
		render([3, 1]);
		assert.eq(getHtml(div), `<div><div><s-3e><h2>List</h2><p>3</p><p>1</p><hr></s-3e></div></div>`);
	}

	// 8. The same holds a level down, for a list written inside a child of the element: the
	// element reaches into the child and takes a row.
	div = document.createElement('div');
	render = items => h(div)`<div><s-3e><ul>${items.map(item => h`<li key=${item}>${item}</li>`)}</ul><b>${items.length}</b></s-3e></div>`;
	render([1, 2, 3]);
	let li1 = div.querySelector('li');
	li1.remove();
	assert.eq(thrownBy(() => render([3, 1, 2, 4])), elementChanged('s-3e'));
	assert.eq(getHtml(div), `<div><div><s-3e><ul><li>2</li><li>3</li></ul><b>4</b></s-3e></div></div>`);
	div.querySelector('ul').prepend(li1);
	render([3, 1, 2, 4]);
	assert.eq(getHtml(div), `<div><div><s-3e><ul><li>3</li><li>1</li><li>2</li><li>4</li></ul><b>4</b></s-3e></div></div>`);
	assert.eq(div.querySelectorAll('li')[1], li1);
});

Testimony.test('Solarite.slots.elementReachesIntoRows', `Only the nodes an expression drew itself are looked for.  What a ROW drew inside itself, such as an item of a list written inside the row, is known to the row alone, so an element that takes such a node out is not named: the row's own list throws the DOM's error when it trips over the missing node.  That error, like every error thrown while an expression inside the element is drawn, reaches the caller as it is, the first time and every time.  Nothing is drawn a second time in the same render, and the next render draws the expression from nothing.`, () => {
	class S3g extends HTMLElement {}
	customElements.define('s-3g', S3g);
	let inner = items => items.map(item => h`<b key=${item}>${item}</b>`);

	// 1. The element removes an item of a keyed list inside a row.  The next render of that
	// list moves its rows before the missing one, and the DOM throws.
	for (let keyed of [true, false]) {
		let div = document.createElement('div');
		let render = rows => h(div)`<div><s-3g>${rows.map(row => keyed
			? h`<li key=${row.id}><ul>${inner(row.items)}</ul></li>`
			: h`<li><ul>${inner(row.items)}</ul></li>`)}</s-3g></div>`;
		render([{id: 1, items: [1, 2, 3]}, {id: 2, items: [3, 1]}]);
		div.querySelector('b').remove();
		let error;
		try {
			render([{id: 1, items: [3, 1]}, {id: 2, items: [5, 3, 1, 6]}, {id: 3, items: []}]);
		}
		catch (e) {
			error = e;
		}
		assert.eq(error?.name, 'NotFoundError');

		// Nothing the expression drew is left standing, so no later render trips over it.
		assert.eq(getHtml(div), `<div><div><s-3g></s-3g></div></div>`);
		render([{id: 1, items: [3, 1]}, {id: 2, items: [5, 3, 1, 6]}, {id: 3, items: []}]);
		assert.eq(getHtml(div), `<div><div><s-3g><li><ul><b>3</b><b>1</b></ul></li><li><ul><b>5</b><b>3</b><b>1</b><b>6</b></ul></li><li><ul></ul></li></s-3g></div></div>`);

		// Left alone, the rows are updated in place again.
		let li = div.querySelector('li');
		render([{id: 1, items: [1]}, {id: 2, items: [6, 5]}]);
		assert.eq(getHtml(div), `<div><div><s-3g><li><ul><b>1</b></ul></li><li><ul><b>6</b><b>5</b></ul></li></s-3g></div></div>`);
		assert.eq(div.querySelector('li'), li);
	}

	// 2. The element empties its rows, and the rows are then taken out and kept for reuse.
	// Drawn again, the first of them fails over the place its own list has lost.  The rows
	// kept for reuse go with the rest, so the render after that makes every row anew.
	let div = document.createElement('div');
	let render = rows => h(div)`<div><s-3g>${rows.map(row => h`<li><i>${row.id}</i>${inner(row.items)}<hr></li>`)}</s-3g></div>`;
	render([{id: 1, items: [1, 2]}, {id: 2, items: [3]}]);
	for (let li of div.querySelectorAll('li'))
		li.textContent = 'mine';
	render([]);
	let rows = [{id: 1, items: [2, 1]}, {id: 2, items: [3, 4]}, {id: 3, items: [5]}];
	assert.eq(thrownBy(() => render(rows)) !== null, true);
	assert.eq(getHtml(div), `<div><div><s-3g></s-3g></div></div>`);
	render(rows);
	assert.eq(getHtml(div), `<div><div><s-3g><li><i>1</i><b>2</b><b>1</b><hr></li><li><i>2</i><b>3</b><b>4</b><hr></li><li><i>3</i><b>5</b><hr></li></s-3g></div></div>`);

	// 3. A mistake in the template is thrown as it is, and the rows are built once: the
	// expression used to be drawn a second time before the error got out.
	div = document.createElement('div');
	let built = 0;
	render = (items, handler) => h(div)`<div><s-3g>${h.map(items, item => {
		built++;
		return h`<p onclick=${item.id === 2 ? handler : () => 1}>${item.id}</p>`;
	})}</s-3g></div>`;
	let one = {id: 1}, two = {id: 2};
	render([one], () => 1);
	built = 0;
	assert.eq(thrownBy(() => render([one, two], 'not a function')), 'Solarite: onclick=${...} is not a function.');
	assert.eq(built, 1);
	render([one, two], () => 1);
	assert.eq(getHtml(div), `<div><div><s-3g><p>1</p><p>2</p></s-3g></div></div>`);

	// 4. A row whose constructor throws once is not tried a second time either: the error
	// reaches the caller the first time it happens.
	let failures = 1;
	class S6b extends HTMLElement {
		constructor() {
			super();
			if (failures-- > 0)
				throw new Error('once');
		}
	}
	customElements.define('s-6b', S6b);
	div = document.createElement('div');
	render = items => h(div)`<div><s-3g>${items.map(item => h`<s-6b key=${item}></s-6b>`)}</s-3g></div>`;
	assert.eq(thrownBy(() => render([1, 2])), 'once');
	render([1, 2]);
	assert.eq(getHtml(div), `<div><div><s-3g><s-6b></s-6b><s-6b></s-6b></s-3g></div></div>`);
});

Testimony.test('Solarite.slots.elementRendersBesideChildren', `An element that renders its own content beside the children it was given, as an element made with Lit does when it renders into itself, leaves them where they are, and they go on being updated.`, async () => {

	// Lit renders after the element is connected, in a microtask, in front of the children it
	// finds there, and from then on changes only its own nodes.
	class S3f extends HTMLElement {
		count = 0;
		connectedCallback() {
			this.before = this.firstChild;
			this.update();
		}
		async update() {
			await null;
			this.own?.remove();
			this.own = document.createElement('s');
			this.own.textContent = 'own ' + this.count++;
			this.insertBefore(this.own, this.before);
		}
	}
	customElements.define('s-3f', S3f);

	let div = document.createElement('div');
	document.body.append(div);
	let render = items => h(div)`<div><s-3f>${items.map(item => h`<p key=${item}>${item}</p>`)}</s-3f></div>`;
	render([1, 2]);
	let s3f = div.querySelector('s-3f');
	await null;
	await null;
	assert.eq(getHtml(div), `<div><div><s-3f><s>own 0</s><p>1</p><p>2</p></s-3f></div></div>`);

	let p2 = div.querySelectorAll('p')[1];
	render([2, 1, 3]);
	s3f.update();
	await null;
	await null;
	assert.eq(getHtml(div), `<div><div><s-3f><s>own 1</s><p>2</p><p>1</p><p>3</p></s-3f></div></div>`);
	assert.eq(div.querySelector('p'), p2);
	render([]);
	render([4]);
	assert.eq(getHtml(div), `<div><div><s-3f><s>own 1</s><p>4</p></s-3f></div></div>`);
	div.remove();
});

Testimony.test('Solarite.slots.elementMayDo', `What an element that doesn't render through Solarite may do with the children it was given, without an error: change the children themselves, put nodes of its own before the first of them or after the last, and move all of them together, in the order given, into a wrapper, another part of the page or a fragment it keeps aside.  White space is a node like any other: it may be added around the children, not among them, and the white space between tags in the template may not be removed.`, () => {
	class S6c extends HTMLElement {}
	customElements.define('s-6c', S6c);
	let clicks = 0;

	// What the element does, and where its children are afterwards.
	let may = {
		changesTheChildren: x => {
			for (let el of x.children) {
				el.className = 'mine';
				el.setAttribute('slot', 'a');
				el.addEventListener('click', () => clicks++);
			}
			return x;
		},
		addsItsOwnBefore: x => {
			x.prepend(document.createElement('s'), ' ');
			return x;
		},
		addsItsOwnAfter: x => {
			x.append(' ', document.createElement('s'));
			return x;
		},
		movesAllOneAtATime: x => {
			x.wrapper ??= x.appendChild(document.createElement('section'));
			for (let node of [...x.childNodes])
				if (node !== x.wrapper)
					x.wrapper.appendChild(node);
			return x.wrapper;
		},
		movesAllElsewhere: x => {
			x.portal ??= document.createElement('aside');
			x.portal.append(...x.childNodes);
			return x.portal;
		},
		setsAllAside: x => {
			x.aside ??= document.createDocumentFragment();
			x.aside.append(...x.childNodes);
			return x.aside;
		},
		takesOneOutAndPutsItBack: x => {
			let p = x.querySelector('p'), next = p.nextSibling;
			p.remove();
			next.before(p);
			return x;
		}
	};
	for (let name in may) {
		let div = document.createElement('div');
		let render = items => h(div)`<div><s-6c><h2>List</h2>${items.map(item => h`<p key=${item}>${item}</p>`)}<hr></s-6c></div>`;
		render([1, 2, 3]);
		let x = div.querySelector('s-6c'), p1 = x.querySelector('p');
		let home = may[name](x);
		render([3, 1, 2, 4]);
		assert.eq(textsOf(home, 'p'), '3,1,2,4');
		assert.eq(home.querySelectorAll('p')[1], p1); // The rows are updated, not drawn again.
		home = may[name](x);
		render([2]);
		assert.eq(textsOf(home, 'p'), '2');
		assert.eq(home.querySelector('h2').nextElementSibling.textContent, '2');
	}

	// White space between two rows is a node of the element's own among them.
	let div = document.createElement('div');
	let render = items => h(div)`<div><s-6c><h2>List</h2>${items.map(item => h`<p key=${item}>${item}</p>`)}<hr></s-6c></div>`;
	render([1, 2]);
	div.querySelector('p').after(' ');
	assert.eq(thrownBy(() => render([2, 1])), elementChanged('s-6c'));

	// A template written over several lines has white space between its tags, and an
	// expression is drawn between the two nodes beside it, whatever they are: here two text
	// nodes of white space.  An element that strips those has taken the place away.
	div = document.createElement('div');
	render = items => h(div)`<div><s-6c>
		<h2>List</h2>
		${items.map(item => h`<p key=${item}>${item}</p>`)}
		<hr>
	</s-6c></div>`;
	render([1, 2]);
	render([2, 1]);
	assert.eq(textsOf(div, 'p'), '2,1');
	for (let node of [...div.querySelector('s-6c').childNodes])
		if (node.nodeType === 3 && !node.nodeValue.trim())
			node.remove();
	assert.eq(thrownBy(() => render([1, 2])), elementChanged('s-6c'));

	// An expression in an element of its own leaves the other element free to do what it
	// likes with that element: here it takes it out, and later puts it back in a wrapper.
	div = document.createElement('div');
	render = items => h(div)`<div><s-6c><div>${items.map(item => h`<p key=${item}>${item}</p>`)}</div><hr></s-6c></div>`;
	render([1, 2]);
	let x = div.querySelector('s-6c'), inner = x.firstChild;
	inner.remove();
	render([2, 1, 3]);
	assert.eq(getHtml(div), `<div><div><s-6c><hr></s-6c></div></div>`);
	assert.eq(textsOf(inner, 'p'), '2,1,3');
	x.append(document.createElement('section'));
	x.lastChild.append(inner);
	render([3]);
	assert.eq(getHtml(div), `<div><div><s-6c><hr><section><div><p>3</p></div></section></s-6c></div></div>`);
});

Testimony.test('Solarite.slots.elementErrorState', `The render that throws because an element took apart the nodes an expression drew inside it leaves everything in a state the next render can work from: the expression is not touched, the expressions written after it in the template have their new values and the ones before it their old ones, and the element's own render() is not called.  The next render throws the same error, and the first render after the element has put the nodes back draws everything.`, () => {
	let renders = 0;
	class S6d extends HTMLElement {
		render() {
			renders++;
		}
	}
	customElements.define('s-6d', S6d);

	let div = document.createElement('div');
	let render = (n, items) => h(div)`<div title=${'t' + n}><b>${n}</b><s-6d n=${n}><h2>${n}</h2>${items.map(item => h`<p key=${item}>${item}</p>`)}<hr><u>${n}</u></s-6d><i>${n}</i></div>`;
	render(0, [1, 2, 3]);
	assert.eq(getHtml(div), `<div><div title="t0"><b>0</b><s-6d n="0"><h2>0</h2><p>1</p><p>2</p><p>3</p><hr><u>0</u></s-6d><i>0</i></div></div>`);
	assert.eq(renders, 1);

	// 1. The element takes a row out.  The list is not drawn, nor is anything written before
	// it in the template: the heading inside the element, the element's attribute, its
	// render(), the text before it and the attribute on the outer element.
	let x = div.querySelector('s-6d'), rows = [...x.querySelectorAll('p')];
	rows[0].remove();
	for (let n of [1, 2]) {
		assert.eq(thrownBy(() => render(n, [3, 2, 1, 4])), elementChanged('s-6d'));
		assert.eq(getHtml(div), `<div><div title="t0"><b>0</b><s-6d n="0"><h2>0</h2><p>2</p><p>3</p><hr><u>${n}</u></s-6d><i>${n}</i></div></div>`);
		assert.eq(renders, 1);
	}

	// 2. The element puts the row back, and the next render draws everything, on the rows
	// that were there.
	rows[1].before(rows[0]);
	render(3, [3, 2, 1, 4]);
	assert.eq(getHtml(div), `<div><div title="t3"><b>3</b><s-6d n="3"><h2>3</h2><p>3</p><p>2</p><p>1</p><p>4</p><hr><u>3</u></s-6d><i>3</i></div></div>`);
	assert.eq([...x.querySelectorAll('p')].slice(0, 3).every((p, i) => p === rows[2 - i]), true);
	assert.eq(renders, 2);

	// 3. The same holds for such an element inside a row of a list that is itself inside
	// such an element.  The outer list is not emptied because one of its rows threw this
	// error, which would have the next render build every row anew without a word.
	class S7f extends HTMLElement {}
	customElements.define('s-7f', S7f);
	div = document.createElement('div');
	render = (n, items) => h(div)`<div><s-6d><h2>T</h2>${items.map(item => h`<li key=${item}><s-7f><b>${item}</b>${[n, n + 1].map(i => h`<p>${i}</p>`)}</s-7f></li>`)}<hr></s-6d></div>`;
	let html = (n, items) => `<div><div><s-6d><h2>T</h2>${items.map(item => `<li><s-7f><b>${item}</b><p>${n}</p><p>${n + 1}</p></s-7f></li>`).join('')}<hr></s-6d></div></div>`;
	render(0, [1, 2, 3]);
	assert.eq(getHtml(div), html(0, [1, 2, 3]));
	let items = [...div.querySelectorAll('li')];
	let p = items[1].querySelector('p'), next = p.nextSibling;
	p.remove();
	for (let n of [1, 2]) {
		assert.eq(thrownBy(() => render(n, [1, 2, 3])), elementChanged('s-7f'));
		assert.eq([...div.querySelectorAll('li')].every((li, i) => li === items[i]), true);
		assert.eq(textsOf(items[1], 'p'), '1');
	}
	next.before(p);
	render(3, [1, 2, 3]);
	assert.eq(getHtml(div), html(3, [1, 2, 3]));
	assert.eq([...div.querySelectorAll('li')].every((li, i) => li === items[i]), true);
});

Testimony.test('Solarite.slots.solariteMovesChildren', `What Solarite itself does with the children is never taken for the element's doing.  A Solarite component whose first render comes later than its creation is given its children like any other element, and its first render then moves them into its slots, which parts a list from a child with a slot attribute that stood next to it.  The list goes on being drawn, as it is for the same component rendering at once, and nothing is thrown.`, () => {
	let lists = [[1, 2], [3, 1, 2], [2], [4, 2, 5]];
	let n = 0;
	for (let when of ['atOnce', 'whenConnected', 'later']) {
		let tag = 's-6e-' + when.toLowerCase();
		let own = [`<header><slot name="head"></slot></header><main><slot></slot></main>`];
		class S6e extends HTMLElement {
			constructor() {
				super();
				if (when === 'atOnce')
					this.show();
			}
			connectedCallback() {
				if (when === 'whenConnected')
					this.show();
			}
			show() {
				h(this)(own);
			}
		}
		customElements.define(tag, S6e);

		// 1. A child with a slot attribute stands directly before the list, so it is the
		// node the list starts after.  The list used to be removed for good by the render
		// that followed the component's own first render.
		let div = document.createElement('div');
		document.body.append(div);
		let s = [`<div><${tag}><b slot="head">`, `</b>`, `</${tag}></div>`];
		let render = items => h(div)(s, items.length, items.map(item => h`<p key=${item}>${item}</p>`));
		render(lists[0]);
		let x = div.querySelector(tag);
		if (when === 'later')
			x.show();
		let html = items => `<div><div><${tag}><header><slot name="head"><b slot="head">${items.length}</b></slot></header><main><slot>${items.map(item => `<p>${item}</p>`).join('')}</slot></main></${tag}></div></div>`;
		assert.eq(getHtml(div), html(lists[0]));
		render(lists[1]);
		assert.eq(getHtml(div), html(lists[1]));
		let p2 = [...div.querySelectorAll('p')].find(p => p.textContent === '2');
		for (let items of lists.slice(2)) {
			render(items);
			assert.eq(getHtml(div), html(items));
		}
		assert.eq([...div.querySelectorAll('p')].find(p => p.textContent === '2'), p2);
		div.remove();

		// 2. The rows themselves carry a slot attribute, so the component's first render
		// takes them out of the list.  Rows in a named slot are more than a list can keep
		// in order (it throws from the DOM in a component that renders at once), but a
		// component that renders later must not be told that it took its children apart:
		// the list is drawn again where it is written, every row once.
		if (when !== 'atOnce') {
			div = document.createElement('div');
			document.body.append(div);
			s = [`<div><${tag}><b>`, `</b>`, `</${tag}></div>`];
			render = items => h(div)(s, items.length, items.map(item => h`<p slot="head" key=${item}>${item}</p>`));
			render(lists[0]);
			if (when === 'later')
				div.querySelector(tag).show();
			assert.eq(textsOf(div.querySelector('header'), 'p'), '1,2');
			for (let items of lists.slice(1)) {
				assert.eq(thrownBy(() => render(items)), null);
				assert.eq(textsOf(div, 'p'), items.join());
				assert.eq(div.querySelector('b').textContent, items.length + '');
			}
			div.remove();
		}
	}
});

Testimony.test('Solarite.slots.slotInsideElement', `A Solarite component that puts its <slot> inside an element that doesn't render through Solarite, such as a card from another library, has its children updated there.  They are that element's then, like children written inside its tag: when it takes them apart, the next render of the template that drew them throws the error that names it.`, () => {
	class S6f extends HTMLElement {}
	customElements.define('s-6f', S6f);

	// The component renders in its constructor, or when it is connected.
	for (let when of ['atOnce', 'whenConnected']) {
		let tag = 's-6g-' + when.toLowerCase();
		let own = [`<s-6f><slot></slot></s-6f>`];
		class S6g extends HTMLElement {
			constructor() {
				super();
				if (when === 'atOnce')
					h(this)(own);
			}
			connectedCallback() {
				if (when === 'whenConnected')
					h(this)(own);
			}
		}
		customElements.define(tag, S6g);

		let div = document.createElement('div');
		document.body.append(div);
		let s = [`<div><${tag}>`, `</${tag}></div>`];
		let render = items => h(div)(s, items.map(item => h`<p key=${item}>${item}</p>`));
		let html = inside => `<div><div><${tag}><s-6f><slot>${inside}</slot></s-6f></${tag}></div></div>`;
		render([1, 2]);
		assert.eq(getHtml(div), html(`<p>1</p><p>2</p>`));
		let p1 = div.querySelector('p');
		render([2, 1, 3]);
		assert.eq(getHtml(div), html(`<p>2</p><p>1</p><p>3</p>`));
		assert.eq(div.querySelectorAll('p')[1], p1);

		// 1. The element puts the rows in another order.  The list used to be drawn in the
		// wrong order from then on, without a word.
		let slot = div.querySelector('slot'), rows = [...slot.children];
		slot.lastChild.before(...[...rows].reverse());
		assert.eq(thrownBy(() => render([1, 2])), elementChanged('s-6f'));
		assert.eq(getHtml(div), html(`<p>3</p><p>1</p><p>2</p>`));
		slot.lastChild.before(...rows);
		render([1, 2]);
		assert.eq(getHtml(div), html(`<p>1</p><p>2</p>`));

		// 2. The element empties the slot it was given.  The list used to stay empty, and
		// a later render threw "Cannot read properties of null" from inside the DOM.
		let saved = [...slot.childNodes];
		slot.textContent = '';
		for (let items of [[2, 1], [], [3]]) {
			assert.eq(thrownBy(() => render(items)), elementChanged('s-6f'));
			assert.eq(getHtml(div), html(``));
		}
		slot.append(...saved);
		render([2, 1]);
		assert.eq(getHtml(div), html(`<p>2</p><p>1</p>`));
		div.remove();
	}
});

Testimony.test('Solarite.slots.namedSlotsInsideElement', `A list that Solarite itself parted from the node before it, by putting that node in a named slot, goes on being drawn when an element that doesn't render through Solarite is around the slots: nothing is thrown, and the list does not stop at what the first render drew.`, () => {
	class S7a extends HTMLElement {}
	customElements.define('s-7a', S7a);
	let lists = [[1, 2], [3, 1, 2], [], [2, 4]];

	for (let when of ['atOnce', 'whenConnected']) {

		// 1. The element is around a Solarite component that has a named and an unnamed slot.
		// 2. The Solarite component puts both slots inside the element, as a card with a
		// place for a heading does when it is built on another library's card.
		let shapes = [
			[`<header><slot name="head"></slot></header><main><slot></slot></main>`, tag => [`<div><s-7a><${tag}><b slot="head">`, `</b>`, `</${tag}></s-7a></div>`]],
			[`<s-7a><header><slot name="head"></slot></header><main><slot></slot></main></s-7a>`, tag => [`<div><${tag}><b slot="head">`, `</b>`, `</${tag}></div>`]]
		];
		for (let i=0; i<shapes.length; i++) {
			let tag = `s-7b-${when.toLowerCase()}-${i}`;
			let own = [shapes[i][0]];
			class S7b extends HTMLElement {
				constructor() {
					super();
					if (when === 'atOnce')
						h(this)(own);
				}
				connectedCallback() {
					if (when === 'whenConnected')
						h(this)(own);
				}
			}
			customElements.define(tag, S7b);

			let div = document.createElement('div');
			document.body.append(div);
			let s = shapes[i][1](tag);
			let render = items => h(div)(s, items.length, items.map(item => h`<p key=${item}>${item}</p>`));
			for (let items of lists) {
				assert.eq(thrownBy(() => render(items)), null);
				assert.eq(div.querySelector('header b').textContent, items.length + '');
				assert.eq(textsOf(div.querySelector('main'), 'p'), items.join());
				assert.eq(div.querySelectorAll('p').length, items.length);
			}
			div.remove();
		}
	}
});

Testimony.test('Solarite.slots.elementRowsDefinedLater', `Rows that are components defined after they were first drawn, as a component whose code is loaded on demand is, are built in place of their placeholders outside any render.  Inside an element that doesn't render through Solarite that is Solarite's own doing: the next render throws nothing and draws on the components that were built, and the element is still looked for afterwards.  The lists the placeholders stood in forget them, so none comes back when a row changes.`, async () => {
	class S7c extends HTMLElement {}
	customElements.define('s-7c', S7c);
	const warn = console.warn;
	console.warn = (...args) => {
		if (!(args[0] + '').includes('<s-7'))
			warn(...args);
	};
	try {
		// 1. Each row is such a component.  2. Each row has one among its nodes.
		let shapes = [
			['s-7d', item => h`<s-7d key=${item}>${item}</s-7d>`, items => items.map(item => `<s-7d>${item}</s-7d>`).join('')],
			['s-7e', item => h`<i>${item}</i><s-7e>${item}</s-7e>`, items => items.map(item => `<i>${item}</i><s-7e>${item}</s-7e>`).join('')]
		];
		for (let [tag, row, html] of shapes) {
			let div = document.createElement('div');
			let render = items => h(div)`<div><s-7c><h2>List</h2>${items.map(row)}<hr></s-7c></div>`;
			render([1, 2, 3]);
			customElements.define(tag, class extends HTMLElement {});
			await customElements.whenDefined(tag);
			await Promise.resolve();
			assert.eq(getHtml(div), `<div><div><s-7c><h2>List</h2>${html([1, 2, 3])}<hr></s-7c></div></div>`);
			let built = [...div.querySelectorAll(tag)];

			assert.eq(thrownBy(() => render([1, 2, 3])), null);
			assert.eq(thrownBy(() => render([1, 2, 3, 4])), null);
			assert.eq(getHtml(div), `<div><div><s-7c><h2>List</h2>${html([1, 2, 3, 4])}<hr></s-7c></div></div>`);
			assert.eq([...div.querySelectorAll(tag)].slice(0, 3).every((el, i) => el === built[i]), true);

			// The element takes a row's component out.
			built[1].remove();
			assert.eq(thrownBy(() => render([1, 2])), elementChanged('s-7c'));
		}

		// 3. A DOM node stands beside the rows, which sends the list to the reconciler
		// that works from the list's own record of its nodes.  That record named the
		// placeholders too, and when one row changed they were put back in the page beside
		// the components, in a plain element as well.
		for (let outer of ['s-7c', 'section']) {
			let tag = 's-7g-' + outer;
			let div = document.createElement('div');
			let node = document.createElement('u');
			let s = [`<div><${outer}><h2>List</h2>`, `<hr></${outer}></div>`], rowHtml = [`<${tag}>`, `</${tag}>`];
			let render = items => h(div)(s, [items.map(item => h(rowHtml, item)), node]);
			let html = items => `<div><div><${outer}><h2>List</h2>${items.map(item => `<${tag}>${item}</${tag}>`).join('')}<u></u><hr></${outer}></div></div>`;
			render(['a', 'b', 'c']);
			customElements.define(tag, class extends HTMLElement {});
			await customElements.whenDefined(tag);
			await Promise.resolve();
			for (let items of [['a', 'B', 'c'], ['a', 'B', 'c'], ['a', 'c'], ['d', 'a', 'c']]) {
				assert.eq(thrownBy(() => render(items)), null);
				assert.eq(getHtml(div), html(items));
			}
		}
	}
	finally {
		console.warn = warn;
	}
});

Testimony.test('Solarite.slots.elementRenderInsideDraw', `A render that starts while an expression inside such an element is half drawn, from the code of a row or of a node as it leaves the document, does not take the half-drawn expression for the element's doing.  When the element does take the place away during such a render, the render it started inside throws the error that names the element, not what the DOM threw over the missing nodes.`, () => {
	let host = null, armed = false, errors = [];
	let again = () => {
		if (armed) {
			armed = false;
			try {
				host();
			}
			catch (e) {
				errors.push(e.message);
			}
		}
	};
	class S6i extends HTMLElement {}
	customElements.define('s-6i', S6i);

	// 1. A row renders the host as it leaves the document, while the list it belonged to is
	// half drawn: some rows are out and some are not, and when the whole list is cleared
	// even the comments it is drawn between are out for a moment.
	customElements.define('s-6k', class extends HTMLElement {
		disconnectedCallback() {
			again();
		}
	});
	for (let keyed of [true, false]) {
		let lists = [[1, 2, 3, 4], [4, 2], [], [5, 6], [5]];
		let div = document.createElement('div');
		document.body.append(div);
		let n = 0;
		host = () => h(div)`<div><s-6i>${lists[n].map(item => keyed ? h`<s-6k key=${item}>${item}</s-6k>` : h`<s-6k>${item}</s-6k>`)}</s-6i></div>`;
		for (n = 0; n < lists.length; n++) {
			armed = n > 0;
			assert.eq(thrownBy(host), null);
			assert.eq(textsOf(div, 's-6k'), lists[n].join());
		}
		assert.eq(errors.length, 0);

		// The element is still looked for after all that.
		n = 0;
		host();
		div.querySelector('s-6k').remove();
		assert.eq(thrownBy(host), elementChanged('s-6i'));
		div.remove();
	}

	// 2. A row renders the host from its constructor during the FIRST render.  The render
	// that starts inside the draw is then the one that builds the element and gives it the
	// children, half drawn.  The first render throws what it throws in a Solarite component
	// with a slot; what matters here is that the expression reads its nodes when its own
	// draw is done, so the next renders work, and still look for what the element does.
	customElements.define('s-6m', class extends HTMLElement {
		constructor() {
			super();
			again();
		}
	});
	let lists = [[1, 2, 3], [1, 2, 3, 4], [4, 2], [], [2, 5]];
	let div = document.createElement('div');
	let n = 0;
	host = () => h(div)`<div><s-6i>${lists[n].map(item => h`<s-6m key=${item}>${item}</s-6m>`)}</s-6i></div>`;
	armed = true;
	thrownBy(host);
	armed = false;
	for (n = 1; n < lists.length; n++) {
		assert.eq(thrownBy(host), null);
		assert.eq(textsOf(div, 's-6m'), lists[n].join());
	}
	n = 1;
	host();
	div.querySelector('s-6m').remove();
	assert.eq(thrownBy(host), elementChanged('s-6i'));
	assert.eq(errors.length, 0);

	// 3. The element replaces its content in its render(), which the render that starts
	// inside the draw calls.  The place is then gone under the draw that is under way.
	class S6l extends HTMLElement {
		render() {
			if (this.wipes)
				this.innerHTML = '<s>mine</s>';
		}
	}
	customElements.define('s-6l', S6l);
	div = document.createElement('div');
	n = 0;
	host = () => h(div)`<div><s-6l>${lists[n].map(item => h`<s-6m key=${item}>${item}</s-6m>`)}</s-6l></div>`;
	host();
	n = 1;
	armed = true;
	div.querySelector('s-6l').wipes = true;
	assert.eq(thrownBy(host), elementChanged('s-6l'));
	assert.eq(thrownBy(host), elementChanged('s-6l'));
	assert.eq(getHtml(div), `<div><div><s-6l><s>mine</s></s-6l></div></div>`);
});

Testimony.test('Solarite.slots.translatedTextInElement', `Text written straight inside the tag of an element that doesn't render through Solarite, as in <sl-button>\${label}</sl-button>, shows each new value after a page translator replaced it with a <font> element, and keeps its translation while its value is unchanged.  No render throws, and the expressions before the element keep updating, in a template and in the rows of a list.  An element that puts the text in a wrapper of its own is still named.`, () => {
	// A button in the style of Shoelace's, whose shadow root shows the label through a slot.
	class S8a extends HTMLElement {
		constructor() {
			super();
			this.attachShadow({mode: 'open'}).innerHTML = '<button><slot></slot></button>';
		}
	}
	customElements.define('s-8a', S8a);

	// 1. In a template, with and without white space around the expression.
	for (let space of [false, true]) {
		let el = document.createElement('div');
		document.body.append(el);
		let heading = 'Inbox', label = 'Save';
		let render = () => space
			? h(el)`<h1>${heading}</h1><s-8a> ${label} </s-8a>`
			: h(el)`<h1>${heading}</h1><s-8a>${label}</s-8a>`;
		render();
		let button = el.querySelector('s-8a');
		translatePage(el);

		// Only what stands before the element changes, and the label keeps its translation.
		heading = 'Sent';
		assert.eq(thrownBy(render), null);
		assert.eq(el.querySelector('h1').textContent, 'Sent');
		assert.eq(button.textContent.trim(), 'T:Save');

		// The label changes, before and after the new one is translated too.
		label = 'Send';
		assert.eq(thrownBy(render), null);
		assert.eq(button.textContent.trim(), 'Send');
		translatePage(el);
		heading = 'Drafts';
		label = 'Done';
		assert.eq(thrownBy(render), null);
		assert.eq(el.querySelector('h1').textContent, 'Drafts');
		assert.eq(button.textContent.trim(), 'Done');

		// The reader asks for the page in its own language again.
		translatePage(el);
		untranslatePage(el);
		label = 'Undo';
		assert.eq(thrownBy(render), null);
		assert.eq(button.textContent.trim(), 'Undo');
		el.remove();
	}

	// 2. In the rows of a list, keyed and not: one row's label changes and a row is added.
	for (let keyed of [false, true]) {
		let el = document.createElement('div');
		document.body.append(el);
		let items = [{id: 1, name: 'Apple'}, {id: 2, name: 'Pear'}, {id: 3, name: 'Plum'}], heading = 'Fruit';
		let render = () => h(el)`<h2>${heading}</h2><ul>${h.map(items, item => keyed
			? h`<li key=${item.id}><s-8a>${item.name}</s-8a></li>`
			: h`<li><s-8a>${item.name}</s-8a></li>`)}</ul>`;
		render();
		translatePage(el);
		items = [items[0], {id: 2, name: 'Peach'}, items[2], {id: 4, name: 'Fig'}];
		heading = 'Fruits';
		assert.eq(thrownBy(render), null);
		assert.eq(el.querySelector('h2').textContent, 'Fruits');
		assert.eq(textsOf(el, 's-8a'), 'T:Apple,Peach,T:Plum,Fig');
		el.remove();
	}

	// 3. An element that puts the text it was given in a <span> of its own changes the nodes the
	// expression drew, and is named for it as before.
	customElements.define('s-8b', class extends HTMLElement {
		connectedCallback() {
			let text = [...this.childNodes].find(node => node.nodeType === 3);
			if (text) {
				let span = document.createElement('span');
				text.replaceWith(span);
				span.append(text);
			}
		}
	});
	let el = document.createElement('div');
	document.body.append(el);
	let label = 'Save';
	let render = () => h(el)`<p><s-8b>${label}</s-8b></p>`;
	render();
	label = 'Send';
	assert.eq(thrownBy(render), elementChanged('s-8b'));
	el.remove();
});

Testimony.test('Solarite.slots.elementRawNodes', `A DOM node that the application made and gave to a template is the application's to move, inside an element that doesn't render through Solarite as anywhere else: nothing is thrown when it has left its place, and the same happens to it as in a plain element.  The rows Solarite drew beside it are still looked for.`, () => {
	class S6j extends HTMLElement {}
	customElements.define('s-6j', S6j);

	let results = [];
	for (let tag of ['section', 's-6j']) {
		let div = document.createElement('div'), other = document.createElement('aside');
		let node = document.createElement('u');
		let s = [`<div><${tag}><h2>T</h2>`, `<hr></${tag}></div>`];
		let render = (given, items) => h(div)(s, [items.map(item => h`<p key=${item}>${item}</p>`), given ? node : 'none']);
		let log = [];
		let step = fn => {
			log.push(thrownBy(fn));
			log.push(getHtml(div).replaceAll(tag, 'x') + ' ' + getHtml(other));
		};
		step(() => render(true, [1, 2]));

		// The application moves its node away, and renders with the same node, with another
		// list, without the node and with it again.
		other.append(node);
		step(() => render(true, [1, 2]));
		step(() => render(true, [2, 1, 3]));
		other.append(node);
		step(() => render(false, [3]));
		step(() => render(true, [3]));
		results.push(log);
	}
	assert.eq(results[1].filter((item, i) => i % 2 === 0).join(), ',,,,'); // Nothing thrown.
	assert.eq(results[1], results[0]);
	assert.eq(results[1][3], `<div><div><x><h2>T</h2><p>1</p><p>2</p><hr></x></div></div> <aside><u></u></aside>`);

	// A row Solarite drew is another matter, with the application's node gone or not.
	let div = document.createElement('div'), other = document.createElement('aside');
	let node = document.createElement('u');
	let render = items => h(div)`<div><s-6j><h2>T</h2>${[items.map(item => h`<p key=${item}>${item}</p>`), node]}<hr></s-6j></div>`;
	render([1, 2]);
	other.append(node);
	div.querySelector('p').remove();
	assert.eq(thrownBy(() => render([2, 1])), elementChanged('s-6j'));
});

Testimony.test('Solarite.slots.textTemplate', `A component whose template is only text keeps the children it was given, after the text.`, () => {
	class S35 extends Solarite {
		render() {
			h(this)`Hello`
		}
	}
	S35.define();

	// 1. Children from the page's html.  They used to be left in front of the text.
	let div = toEl('<div><s-35><br>child</s-35></div>')
	document.body.append(div);
	assert.eq(div.outerHTML, `<div><s-35>Hello<br>child</s-35></div>`)
	div.remove();

	// 2. Children declared in a parent's template, which used to be dropped, and a list among
	// them that the parent goes on drawing.
	div = document.createElement('div');
	let render = items => h(div)`<s-35><br>${items.map(item => h`<i>${item}</i>`)}</s-35>`;
	render([1, 2]);
	assert.eq(getHtml(div), `<div><s-35>Hello<br><i>1</i><i>2</i></s-35></div>`)
	render([3]);
	assert.eq(getHtml(div), `<div><s-35>Hello<br><i>3</i></s-35></div>`)

	// 3. The same for a plain element that held something before a text template was rendered
	// into it, as for every other kind of template.
	div = toEl('<div><br></div>');
	h(div)`Hello`;
	assert.eq(div.outerHTML, `<div>Hello<br></div>`)
});

Testimony.test('Solarite.slots.childRendersParent', `A child that renders its parent from its connectedCallback or disconnectedCallback, as a tab does to register with its tab set, leaves the render that is moving it into its slot undisturbed.`, () => {
	for (let which of ['connectedCallback', 'disconnectedCallback']) {
		let host = document.createElement('div'), armed = false, calls = 0, count = 0, clicks = 0;
		let onClick = () => clicks++;
		let render = () => h(host)`<p onclick=${onClick}>${++count}</p><slot></slot>`;
		let tag = 's-47-' + which.slice(0, 3);
		class Child extends HTMLElement {}
		Child.prototype[which] = function() {
			if (armed) {
				armed = false;
				calls++;
				render();
			}
		};
		customElements.define(tag, Child);
		host.innerHTML = `<${tag}>kid</${tag}>`;
		let child = host.firstChild;
		document.body.append(host);

		// The first render takes the child out of the element and puts it in the slot, and the
		// child's callback renders the element in the middle of that.  The template used to
		// be drawn twice, one copy holding the other.
		armed = true;
		render();
		assert.eq(calls, 1);
		assert.eq(getHtml(host), `<div><p>1</p><slot><${tag}>kid</${tag}></slot></div>`);
		assert.eq(host.querySelector('slot').firstChild, child);

		// Both renders were given the same handler, and one of them has bound it.
		host.querySelector('p').click();
		assert.eq(clicks, 1);

		// Later renders update the one template.
		render();
		assert.eq(getHtml(host), `<div><p>3</p><slot><${tag}>kid</${tag}></slot></div>`);
		host.remove();
	}
});

Testimony.test('Solarite.slots.nestedConstruction', `A component that builds another component keeps its own slot children.`, () => {

	// Solarite hands slot children to a new component through the single
	// Globals.currentSlotChildren global.  Here the outer template gives a <button> to
	// <s-40-bar>, but s-40-bar's field initializer constructs and renders an <s-40-menu>
	// first, and the <s-40-icon> nested in that menu's template nulls the global on its way
	// out.  By the time s-40-bar renders itself there is nothing left for its slot.
	class S40Icon extends Solarite {
		render() { h(this)`<s-40-icon>i</s-40-icon>`; }
	}
	S40Icon.define();

	class S40Menu extends Solarite {
		constructor() { super(); this.render(); } // Renders before s-40-bar renders itself.
		render() { h(this)`<s-40-menu><s-40-icon></s-40-icon></s-40-menu>`; }
	}
	S40Menu.define();

	class S40Bar extends Solarite {
		menu = new S40Menu(); // Field initializers run while the hand-off is still pending.
		render() { h(this)`<s-40-bar><slot></slot></s-40-bar>`; }
	}
	S40Bar.define();

	let div = document.createElement('div');
	document.body.append(div);
	h(div)`<div><s-40-bar><button>one</button></s-40-bar></div>`;

	assert.eq(getHtml(div.querySelector('slot')), `<slot><button>one</button></slot>`);
	assert.eq(getHtml(div.querySelector('s-40-bar').menu), `<s-40-menu><s-40-icon>i</s-40-icon></s-40-menu>`);

	div.remove();
});

Testimony.test('Solarite.slots.nestedConstructionUndefinedTag', `Waiting on customElements.define() doesn't discard another component's slot children.`, () => {

	// The same hand-off, lost at the other exit.  PathToComponent.applyAll() returns early
	// when a tag isn't defined yet -- the normal case for a lazily imported module -- and
	// that early return nulls Globals.currentSlotChildren too, so a component whose children
	// are still parked there renders an empty slot.  Expect a console warning about
	// <s-41-later>; it is the code path under test.
	class S41Menu extends Solarite {
		constructor() { super(); this.render(); }
		render() { h(this)`<s-41-menu><s-41-later></s-41-later></s-41-menu>`; }
	}
	S41Menu.define();

	class S41Bar extends Solarite {
		menu = new S41Menu();
		render() { h(this)`<s-41-bar><slot></slot></s-41-bar>`; }
	}
	S41Bar.define();

	let div = document.createElement('div');
	document.body.append(div);
	h(div)`<div><s-41-bar><button>one</button></s-41-bar></div>`;

	assert.eq(getHtml(div.querySelector('slot')), `<slot><button>one</button></slot>`);

	div.remove();
});

Testimony.test('Solarite.slots.selfNestedConstruction', `A component that builds another instance of its own class keeps its slot children.`, () => {

	// The one case the hand-off cannot address: both instances are the same class, so the
	// inner one matches too and takes the children.  It works only because the hand-off is
	// not cleared when it is read, letting the outer instance take them straight back.
	// Anything that makes the read consume-once breaks this, which is why it has a test.
	let depth = 0;
	class S42Node extends Solarite {
		constructor() {
			super();
			if (depth++ === 0)
				this.child = new S42Node();
			this.render();
		}
		render() { h(this)`<s-42-node><slot></slot></s-42-node>`; }
	}
	S42Node.define();

	let div = document.createElement('div');
	document.body.append(div);
	h(div)`<div><s-42-node><button>one</button></s-42-node></div>`;

	let outer = div.querySelector('s-42-node');
	assert.eq(getHtml(outer.querySelector('slot')), `<slot><button>one</button></slot>`);
	assert.eq(getHtml(outer.child.querySelector('slot')), `<slot></slot>`);

	div.remove();
});

Testimony.test('Solarite.slots.customizedBuiltIn', `A customized built-in declared with children puts them in its slot.`, () => {

	// A customized built-in reports the tagName of the element it extends, so this component
	// is 's-44-panel' but its element says DIV.  A hand-off addressed by tag name could never
	// reach it; addressing by Constructor is what makes this work.
	class S44Panel extends HTMLDivElement {
		render() { h(this)`<h3>title</h3><slot></slot>`; }
	}
	customElements.define('s-44-panel', S44Panel, {extends: 'div'});

	let div = document.createElement('div');
	document.body.append(div);
	h(div)`<div><div is="s-44-panel"><button>one</button></div></div>`;

	assert.eq(getHtml(div.querySelector('slot')), `<slot><button>one</button></slot>`);

	div.remove();
});

Testimony.test('Solarite.slots.customizedBuiltInConstructorRender', `A customized built-in that renders in its constructor keeps its slot children.`, () => {

	// A dashed component tag is neutralized in the shell by renaming the TAG, so the browser
	// never upgrades the placeholder.  A customized built-in can't use that trick, because
	// its tag has to stay real -- a <tr is="x"> that isn't a <tr> is thrown out by the
	// parser's table rules -- so Shell.js:288-290 renames its ATTRIBUTE to '_is' instead.
	// That isn't enough: 'is' is also recorded in the element's internal is-value slot, which
	// removeAttribute() can't clear and cloneNode() copies.  Every clone of the placeholder
	// still counts as a customized built-in, so the browser upgrades it as soon as it enters
	// a live document, and PathToComponent.applyAll() then builds a SECOND instance.
	//
	// When the constructor renders, it renders the placeholder -- which still holds the
	// children the user declared -- and applyAll() hands that output to the real instance as
	// if it were declared children, nesting the component's own first render inside its own
	// slot.
	//
	// The bug was INTERMITTENT, which is why both halves are asserted here.  Nothing is
	// upgraded until insertion into a live document, so rendering into a detached root always
	// produced the right answer while rendering into a connected one produced the wrong one.
	// A fixture built detached would have passed against the broken code.
	class S45Panel extends HTMLDivElement {
		constructor() {
			super();
			this.render();
		}
		render() { h(this)`<h3>title</h3><slot></slot>`; }
	}
	customElements.define('s-45-panel', S45Panel, {extends: 'div'});

	// Connected before rendering: the placeholder clone enters a live document, so this is
	// the arrangement that used to upgrade it early.
	let connected = document.createElement('div');
	document.body.append(connected);
	h(connected)`<div><div is="s-45-panel"><button>one</button></div></div>`;
	assert.eq(getHtml(connected.querySelector('slot')), `<slot><button>one</button></slot>`);

	// Detached while rendering, connected afterwards.  Must agree with the above.
	let detached = document.createElement('div');
	h(detached)`<div><div is="s-45-panel"><button>one</button></div></div>`;
	document.body.append(detached);
	assert.eq(getHtml(detached.querySelector('slot')), `<slot><button>one</button></slot>`);

	connected.remove();
	detached.remove();
});

Testimony.test('Solarite.slots.customizedBuiltInConstructedOnce', `A customized built-in is constructed once, not twice.`, () => {

	// The shell's placeholder for a customized built-in used to keep its internal is-value
	// even after Shell.js removed the 'is' attribute, so the browser upgraded every clone on
	// insertion and PathToComponent.applyAll() then built a second instance and replaced it.
	// That was invisible whenever the constructor did nothing -- the discarded instance never
	// rendered -- but it ran user code twice on every render.
	let constructed = 0;
	class S46Row extends HTMLDivElement {
		constructor() {
			super();
			constructed++;
		}
		render() { h(this)`<b>row</b><slot></slot>`; }
	}
	customElements.define('s-46-row', S46Row, {extends: 'div'});

	let div = document.createElement('div');
	document.body.append(div);
	h(div)`<div><div is="s-46-row"><button>one</button></div></div>`;

	assert.eq(constructed, 1);
	assert.eq(getHtml(div.querySelector('slot')), `<slot><button>one</button></slot>`);

	div.remove();
});

Testimony.test('Solarite.slots.constructorThrows', `A component whose constructor throws doesn't strand the slot hand-off.`, () => {

	// The restore is in a finally precisely so a throw mid-construction can't leave a stale
	// hand-off parked for whatever renders next.  Without it the next component to render
	// would inherit these children.
	class S43Bad extends Solarite {
		constructor() {
			super();
			throw new Error('boom');
		}
		render() { h(this)`<s-43-bad></s-43-bad>`; }
	}
	S43Bad.define();

	class S43Good extends Solarite {
		render() { h(this)`<s-43-good><slot></slot></s-43-good>`; }
	}
	S43Good.define();

	let div = document.createElement('div');
	document.body.append(div);
	assert.throws(() => h(div)`<div><s-43-bad><button>stranded</button></s-43-bad></div>`);

	// A later, unrelated component must not inherit the children of the one that blew up.
	let div2 = document.createElement('div');
	document.body.append(div2);
	h(div2)`<div><s-43-good></s-43-good></div>`;
	assert.eq(getHtml(div2.querySelector('slot')), `<slot></slot>`);

	div.remove();
	div2.remove();
});

//endregion




//region events
/*┌─────────────────╮
  | Events          |
  └─────────────────╯*/
Testimony.test('Solarite.events.classic', () => {

	class Ev10 extends Solarite {
		count = 1

		render() {
			h(this)`<input data-id="input" value=${this.count} oninput="this.closest('ev-10').count = 3">`
		}
	}

	let a = new Ev10();
	document.body.append(a);

	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.count, 3);

	a.remove();
});


Testimony.test('Solarite.events.classicWithExpr', () => {

	class Ev12 extends Solarite {
		count = 1

		render() {
			h(this)`<input data-id="input" value=${this.count} oninput="this.closest('ev-12').count = ${5}">`
		}
	}

	let a = new Ev12();
	document.body.append(a);

	a.input.dispatchEvent(new Event('input'));
	assert.eq(a.count, 5);

	a.remove();
});

Testimony.test('Solarite.events.classicWithExprs', `An event attribute written as text with several expressions in it stays a plain attribute, rewritten when an expression changes, and other handlers of the same template are bound as usual.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let clicks = 0;
	let render = (a, b) => h(el)`<input data-total="0" oninput="this.dataset.total = ${a} + ${b}" onclick=${() => clicks++}>`;

	render(2, 3);
	let input = el.firstChild;
	assert.eq(input.getAttribute('oninput'), 'this.dataset.total = 2 + 3');
	input.dispatchEvent(new Event('input'));
	assert.eq(input.dataset.total, '5');

	render(4, 5);
	assert.eq(input.getAttribute('oninput'), 'this.dataset.total = 4 + 5');
	input.dispatchEvent(new Event('input'));
	assert.eq(input.dataset.total, '9');

	input.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(clicks, 1);
	el.remove();
});

Testimony.test('Solarite.events.handlerWithTextThrows', `A handler with text beside it in an event attribute, such as a stray space inside the quotes, throws instead of being called while rendering to make an inline handler of what it returns.  The same for a [fn, ...args] array, and in the rows of a list.`, () => {
	let el = document.createElement('div');
	let calls = 0, f = () => { calls++; return 'ret'; };
	assert.throws(() => h(el)`<button onclick="${f} ">b</button>`, 'mixes a handler with text');
	assert.throws(() => h(el)`<button onclick=${f}/ disabled>b</button>`, 'mixes a handler with text');
	assert.throws(() => h(el)`<button onclick="go(${[f, 1]})">b</button>`, 'mixes a handler with text');
	assert.throws(() => h(el)`${h.map([1], id => h`<button onclick=" ${[f, id]}">b</button>`)}`, 'mixes a handler with text');
	assert.eq(calls, 0);
});

Testimony.test('Solarite.events.rebind', 'Ensure function is unbound/rebound on render', () => {

	let assignCalls = 0;

	class Ev20 extends Solarite {
		count = 1

		assign(val) {
			this.count = val;
			assignCalls++;
		}

		render() {
			h(this)`<input data-id="input" value=${this.count} oninput="${(e, el) => this.assign(el.value)}">`
		}
	}
	Ev20.define();

	let a = new Ev20();
	a.render();
	assert.eq(assignCalls, 0);
	a.firstChild.dispatchEvent(new Event('input', {bubbles: true}));
	assert.eq(assignCalls, 1);

	a.render();
	a.firstChild.dispatchEvent(new Event('input', {bubbles: true}));
	assert.eq(assignCalls, 2);
});

Testimony.test('Solarite.events.afterFirstRenderThrew', `A handler is bound by the render that follows a first render that threw.`, () => {
	// Expressions are applied from the last to the first, so when the input's value throws,
	// the handlers of the two buttons before it have not been reached.  The next render gives
	// the same functions again, and must not take them to be bound already.
	let count = 0, onClick = () => count++;
	for (let options of [{}, {eventDelegation: false}]) {
		let el = document.createElement('div');
		document.body.append(el);
		let render = onFocus => h(el, h`<button onclick=${onClick}>a</button><button native:onclick=${onClick}>b</button><input onfocus=${onFocus}>`, options);
		assert.throws(() => render('not a function'));

		count = 0;
		render(() => {});
		el.children[0].click();
		el.children[1].click();
		assert.eq(count, 2);

		// Renders after a complete one skip a handler that is the same function, as before.
		render(() => {});
		el.children[0].click();
		assert.eq(count, 3);
		el.remove();
	}

	// The same in a component whose first render() throws.
	class E25 extends HTMLElement {
		ready = false;
		render() {
			h(this)`<e-25 onclick=${onClick}><input onfocus=${this.ready ? onClick : null}></e-25>`;
		}
	}
	customElements.define('e-25', E25);
	let a = new E25();
	assert.throws(() => a.render());
	a.ready = true;
	a.render();
	count = 0;
	a.click();
	assert.eq(count, 1);
});

Testimony.test('Solarite.events.args', 'Ensure event function args are received', () => {

	class Ev30 extends Solarite {
		count = 0

		assign(val) {
			this.count = val;
		}

		render() {
			h(this)`<input data-id="input" value='1' oninput="${(e, el) => this.assign(el.value)}">`
		}
	}
	Ev30.define();

	let a = new Ev30();
	a.render();
	a.firstChild.dispatchEvent(new Event('input', {bubbles: true}));
	assert.eq(a.count, '1');

	a.firstChild.value = '2';
	a.firstChild.dispatchEvent(new Event('input', {bubbles: true}));
	assert.eq(a.count, '2');
});

Testimony.test('Solarite.events.noHandlerProperty', `An event that elements have no on* property for is still bound from its on* attribute: focusin and focusout have none in any browser, and the touch events have none on a machine without a touch screen.  The handler runs when the event arrives and is not called while rendering.`, () => {
	// A template's attribute names are fixed text, so each event gets a template of its own.
	const renders = {
		focusin: (el, o, a, b) => h(el, o)`<p onfocusin=${a}><input onfocusin=${b}></p>`,
		focusout: (el, o, a, b) => h(el, o)`<p onfocusout=${a}><input onfocusout=${b}></p>`,
		touchstart: (el, o, a, b) => h(el, o)`<p ontouchstart=${a}><input ontouchstart=${b}></p>`,
		touchmove: (el, o, a, b) => h(el, o)`<p ontouchmove=${a}><input ontouchmove=${b}></p>`,
		touchend: (el, o, a, b) => h(el, o)`<p ontouchend=${a}><input ontouchend=${b}></p>`,
		touchcancel: (el, o, a, b) => h(el, o)`<p ontouchcancel=${a}><input ontouchcancel=${b}></p>`
	};
	for (let eventDelegation of [true, false])
		for (let type in renders) {
			let el = document.createElement('div');
			document.body.append(el);
			let log = [];
			let handler = (suffix, ev) => log.push(ev.type + suffix);
			renders[type](el, {eventDelegation}, [handler, 1], ev => handler(2, ev));
			assert.eq(log.length, 0, type + ': not called by the render');
			assert.eq(el.querySelector('input').hasAttribute('on' + type), false);

			el.querySelector('input').dispatchEvent(new Event(type, {bubbles: true}));
			assert.eq(log.join(), type + '2,' + type + '1', 'eventDelegation=' + eventDelegation);
			el.remove();
		}
});

Testimony.test('Solarite.events.stringInRowThrows', `A string given to an event attribute that is bound when the template renders (an event that isn't delegated, or any event written with native:) is a mistake wherever it is written.  In a list row it throws the same error as outside one, instead of being written to the row as an attribute, where the browser would run an on* value as an inline handler.`, () => {
	// A template's attribute names are fixed text, so each attribute gets templates of its own:
	// one outside a list, one as the row of a list.
	const renders = {
		onfocus: [
			(el, v) => h(el)`<p onfocus=${v}>x</p>`,
			(el, v) => h(el)`<ul>${[1, 2].map(n => h`<li onfocus=${v}>${n}</li>`)}</ul>`
		],
		'native:onclick': [
			(el, v) => h(el)`<p native:onclick=${v}>x</p>`,
			(el, v) => h(el)`<ul>${[1, 2].map(n => h`<li native:onclick=${v}>${n}</li>`)}</ul>`
		]
	};
	for (let name in renders)
		for (let render of renders[name]) {
			let el = document.createElement('div');
			assert.throws(() => render(el, 'window.stringHandlerRan = true'), name + '=${...} is not a function');
			assert.eq([...el.querySelectorAll('*')].some(node => node.hasAttribute(name)), false, name);

			// A function in the same place is bound as a listener on the element itself.
			el = document.createElement('div');
			let hits = 0;
			render(el, () => hits++);
			el.querySelector('p, li').dispatchEvent(new Event(name.split('on')[1])); // Doesn't bubble.
			assert.eq(hits, 1, name);
		}
});

Testimony.test('Solarite.events.onComponent', 'Event attrib on root component', () => {

	class Ev40 extends Solarite {
		count = 0

		assign(val) {
			this.count = val;
		}

		render() {
			h(this)`<ev-40 oninput="${(e, el) => this.assign(el.firstChild.value)}"><input data-id="input" value='1'></ev-40>`
		}
	}
	Ev40.define();

	let a = new Ev40();
	a.render();
	a.firstChild.dispatchEvent(new Event('input', {bubbles: true}));
	assert.eq(a.count, '1');

	a.firstChild.value = '2';
	a.firstChild.dispatchEvent(new Event('input', {bubbles: true}));
	assert.eq(a.count, '2');
});

Testimony.test('Solarite.events.onChild', () => {

	class E50 extends HTMLElement {
		constructor() {
			super();
			this.items = [];
			this.render();
		}

		addItem() {
			this.items.push(1);
			this.render();
		}

		render() {
			h(this)`
			<e-50>
				<button onclick=${this.addItem}>Add Item</button>
			</e-50>`
		}
	}
	customElements.define('e-50', E50);

	let e = new E50();
	e.querySelector('button').dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(e.items.length, 1);
});

Testimony.test('Solarite.events.onExprChild', () => {

	class E60 extends HTMLElement {
		constructor() {
			super();
			this.items = [];
			this.render();
		}

		addItem() {
			this.items.push(1);
			this.render();
		}

		render() {
			h(this)`
			<e-60>
				${h`<button onclick=${this.addItem}>Add Item</button>`}
			</e-60>`
		}
	}
	customElements.define('e-60', E60);

	let e = new E60();
	e.querySelector('button').dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(e.items.length, 1);
});
//endregion




//region binding
/*┌─────────────────╮
  | Binding         |
  └─────────────────╯*/
Testimony.test('Solarite.binding.input', () => {

	class B10 extends Solarite {
		count = 1

		render() {
			h(this)`<input data-id="input" value=${[this, 'count']}>`
		}
	}

	let b = new B10();
	document.body.append(b);
	assert.eq(b.input.value, '1')
	b.count = 2
	b.render()
	assert.eq(b.input.value, '2')

	b.input.value = 3;
	b.input.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	assert.eq(b.count, '3')

	b.remove();
});

Testimony.test('Solarite.binding.getEventBinding', () => {

	class B11 extends Solarite {
		count = 1

		render() {
			h(this)`<input data-id="input" value=${[this, 'count']}><span data-id="bare"></span>`
		}
	}

	let b = new B11();
	document.body.append(b);

	// 1. The two-way 'value' binding is reachable and flushes the model synchronously.
	b.input.value = '5';
	let binding = getEventBinding(b.input, 'value');
	assert(binding);
	binding.handleEvent(new Event('input'));
	assert.eq(b.count, '5');

	// 2. Unknown key on a bound node, and any key on an unbound node, return undefined.
	assert.eq(getEventBinding(b.input, 'click'), undefined);
	assert.eq(getEventBinding(b.bare, 'value'), undefined);

	b.remove();
});

Testimony.test('Solarite.binding.inputReuse', () => {

	class B12 extends Solarite {
		items = [1, 2, 3]

		render() {
			h(this)`${this.items.map(item => h`<input data-id="input" value=${item}>`)}`;
		}
	}

	let b = new B12();
	document.body.append(b);

	// Remove and re-add the input with a new value.
	b.items = [];
	b.render();

	b.items = [4];
	b.render();

	// Make sure it takes the new value.
	assert.eq(b.firstElementChild.value, '4');

	b.remove();
});

Testimony.test('Solarite.binding.checkbox', () => {

	class B15 extends Solarite {
		enabled;

		render() {
			h(this)`<input data-id="input" type="checkbox" checked=${[this, 'enabled']}>`
		}
	}

	let b = new B15();
	document.body.append(b);
	assert.eq(b.input.checked, false)

	b.enabled = true
	b.render()
	assert.eq(b.input.checked, true)

	b.input.click();
	assert.eq(b.input.checked, false)
	assert.eq(b.enabled, false)

	b.remove();
});

Testimony.test('Solarite.binding.radio', () => {

	class B16 extends Solarite {
		color = 'green'

		render() {
			h(this)`
				<input data-id="red"   type="radio" name="b16color" value="red"   checked=${[this, 'color']}>
				<input data-id="green" type="radio" name="b16color" value="green" checked=${[this, 'color']}>
				<input data-id="blue"  type="radio" name="b16color" value="blue"  checked=${[this, 'color']}>`
		}
	}

	let b = new B16();
	document.body.append(b);

	// Model value selects the matching radio.
	assert.eq(b.green.checked, true)
	assert.eq(b.red.checked, false)
	assert.eq(b.blue.checked, false)

	// Re-render moves the selection.
	b.color = 'blue'
	b.render()
	assert.eq(b.blue.checked, true)
	assert.eq(b.green.checked, false)

	// Clicking a radio writes its value back to the model.
	b.red.click();
	assert.eq(b.red.checked, true)
	assert.eq(b.color, 'red')

	b.remove();
});

Testimony.test('Solarite.binding.textarea', () => {

	class B20 extends Solarite {
		text = 1

		render() {
			h(this)`<textarea data-id="input" value=${[this, 'text']}></textarea>`
		}
	}

	let b = new B20();
	document.body.append(b);
	assert.eq(b.input.value, '1')

	b.text = 2
	b.render()
	assert.eq(b.input.value, '2')

	b.input.value = 3;
	b.input.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	assert.eq(b.text, '3')

	b.remove();
});

Testimony.test('Solarite.binding.contenteditable', () => {

	class B24 extends HTMLElement {
		text = 1

		render() {
			h(this)`<div contenteditable data-id="input" value=${[this, 'text']}></div>`
		}
	}
	customElements.define('b-24', B24);

	let b = new B24();
	b.render();
	document.body.append(b);
	assert.eq(b.input.textContent, '1')

	b.text = 2
	b.render()
	assert.eq(b.input.textContent, '2')

	b.input.innerHTML = 3;
	b.input.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	assert.eq(b.text, '3')

	b.remove();
});

// TODO: Set select.value when option children are rendered and don't exist when the value attrib is evaluated by Path.applyValueAttrib()
Testimony.test('Solarite.binding.select', () => {

	class B30 extends Solarite {
		count = 1

		render() {
			h(this)`<select data-id="input" value=${[this, 'count']}><option>1</option><option>2</option><option>3</option></select>`
		}
	}

	let b = new B30();
	document.body.append(b);
	assert.eq(b.input.value, '1')

	b.count = 2
	b.render()
	assert.eq(b.input.value, '2');

	b.input.value = 3;
	b.input.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	assert.eq(b.count, '3')

	b.remove();
});

Testimony.test('Solarite.binding.selectMultiple', () => {

	class B33 extends Solarite {
		items = [2]

		render() {
			h(this)`<select multiple data-id="input" value=${[this, 'items']}><option value="1">Item 1</option><option value="2"">Item 2</option><option value="3">Item 3</option></select>`
		}
	}

	let b = new B33();
	document.body.append(b);
	assert.eq([...b.input.selectedOptions].map(o=>o.value), ['2']);

	b.items = ['1', '3'];
	b.render();
	assert.eq([...b.input.selectedOptions].map(o=>o.value), ['1', '3']);


	b.items = ['2'];
	b.render();
	assert.eq([...b.input.selectedOptions].map(o=>o.value), ['2']);
	assert.eq(b.input.value, '2')

	b.items = [1, 3]
	b.render()
	assert.eq([...b.input.selectedOptions].map(o=>o.value), ['1', '3']);
	assert.eq(b.input.value, '1');

	b.input.value = 3;
	b.input.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	assert.eq(b.items, ['3'])

	b.remove();
});

Testimony.test('Solarite.binding.selectDynamic', () => {

	class B36 extends Solarite {
		count = 1

		render() {
			h(this)`<select data-id="input" value=${[this, 'count']}>${[1, 2, 3].map(item => h`<option>${item}</option>`)}</select>`
		}
	}

	let b = new B36();
	document.body.append(b);
	assert.eq(b.input.value, '1')
	assert.eq(b.input.selectedIndex, 0);

	b.count = 2
	b.render();
	assert.eq(b.input.value, '2');
	assert.eq(b.input.selectedIndex, 1);

	b.input.value = 3;
	b.input.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	assert.eq(b.count, '3')
	assert.eq(b.input.selectedIndex, 2);

	b.remove();
});

Testimony.test('Solarite.binding.number', () => {

	class B40 extends Solarite {
		count = 1

		render() {
			h(this)`<input type="number" data-id="input" value=${[this, 'count']}>`
		}
	}

	let b = new B40();
	document.body.append(b);
	assert.eq(b.input.value, '1')

	b.count = 2
	b.render()
	assert.eq(b.input.value, '2')

	b.input.value = 3;
	b.input.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	assert.eq(b.count, 3)

	b.remove();
});

Testimony.test('Solarite.binding.undefined', () => {

	class B50 extends Solarite {
		render() {
			h(this)`<input data-id="input" value=${[this, 'count']}>`
		}
	}

	let b = new B50();
	document.body.append(b);
//	console.log(b.input.value);
	assert.eq(b.input.value, '')

	b.remove();
});

Testimony.test('Solarite.binding.arrayWithEmptyItem', `An array of an object and an empty value is not a two-way binding`, () => {
	// It was taken for a path to the property named "null", so typing into the input wrote that
	// property onto the object.
	for (let empty of [null, undefined, false]) {
		let item = {a: 1};
		let el = document.createElement('div');
		h(el)`<div><input value=${[item, empty]}></div>`;
		let input = el.querySelector('input');
		assert.eq(getEventBinding(input, 'value'), undefined);
		input.value = 'typed';
		input.dispatchEvent(new Event('input', {bubbles: true}));
		assert.eqJson(item, {a: 1});
	}
});

Testimony.test('Solarite.binding.loop', 'similar to the loop.continuity2 test above', () => {

	class V70 extends Solarite {
		constructor(items=[]) {
			super();
			this.items = items;
		}

		removeItem(i) {
			this.items.splice(i, 1);
			this.render();
		}

		render() {
			h(this)`
			<v-70>
				${this.items.map((item, i) => h`
					<div>
						<input type="number" oninput=${this.render} value=${[item, 'qty']}>
						<button onclick=${()=>this.removeItem(i)}>x</button>
					</div>
				`)}
				<button onclick=${this.render}>Render</button>
			</v-70>`
		}
	}
	let v = new V70([
		{name: 'apple', qty: 1},
		{name: 'banana', qty: 2},
		{name: 'cherry', qty: 3}
	]);
	document.body.append(v);


	let input1 = v.children[0].children[0];
	let input2 = v.children[1].children[0];

	v.removeItem(1);



	input1.value = 10;
	input1.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	v.render();
	assert.eq(input1, v.children[0].children[0]);
	assert.eq(input2, v.children[1].children[0]);

	input1.value = 20;
	input1.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	v.render();
	assert.eq(input1, v.children[0].children[0]);
	assert.eq(input2, v.children[1].children[0]);

	input2.value = 30;
	input2.dispatchEvent(new Event('input', {
		bubbles: true,
		cancelable: true,
	}));
	v.render();
	assert.eq(input1, v.children[0].children[0]);
	assert.eq(input2, v.children[1].children[0]);

	v.remove();
});

//endregion




//region jsx
/*┌─────────────────╮
  | JSX             |
  └─────────────────╯*/
Testimony.test('Solarite.jsx.full', () => {

	let value = 1;
	const increment = () => value++;

	/*
	<div>
		<p data-id="label" class="big"><small>{'sum'}:</small> {this.value+''}</p>
		<button onclick={increment}>Increment</button>
	</div>
	 */

	// Children are NOT flattened into the parent statics (unlike the old fromJsx experiment):
	// each nested element is its own Template hole.  Assert real rendered output instead of
	// the internal html/exprs split.
	const el =
		h("div", null,
			h("p", {"data-id": "label", class: 'big'},
				h("small", null, "sum", ":"), " ", value),
			h("button", { onclick: increment }, "Increment")
		).render();

	let p = el.querySelector('p');
	assert.eq(p.getAttribute('data-id'), 'label');   // static id/data-id stays in the statics
	assert.eq(p.className, 'big');
	assert.eq(el.querySelector('small').textContent, 'sum:');
	assert.eq(p.textContent, 'sum: 1');
	let button = el.querySelector('button');
	assert.eq(button.textContent, 'Increment');
	assert.eq(button.hasAttribute('onclick'), false); // bound via addEventListener, not an attribute
	button.dispatchEvent(new Event('click', {bubbles: true})); // click is delegated at the root
	assert.eq(value, 2);
});



//endregion


//region additional jsx tests
/*┌─────────────────╮
  | JSX - More      |
  └─────────────────╯*/
Testimony.test('Solarite.jsx.attributes', () => {

    // <div id="x" data-id="y" class={"c"} title={"t"}></div>
    const jsx = h('div', { id: 'x', 'data-id': 'y', class: 'c', title: 't' });

    const template = new Template([
        '<div id="x" data-id="y" class=',
        ' title=',
        '></div>'
    ], ['c', 't']);

    assert.eqJson(jsx.html, template.html);
    assert.eqJson(jsx.exprs, template.exprs);
});

Testimony.test('Solarite.jsx.children.mix', () => {

    const num = 42;
    // <div>Hello {num}<span>!</span></div> — the nested <span> stays its own child hole.
    const el = h('div', null, 'Hello', num, h('span', null, '!')).render();

    assert.eq(el.textContent, 'Hello42!');
    assert.eq(el.querySelector('span').textContent, '!');
});

Testimony.test('Solarite.jsx.void', () => {
    // <img data-id="p" src={"/photo.jpg"}>
    const jsx = h('img', { 'data-id': 'p', src: '/photo.jpg' });

    const template = new Template([
        '<img data-id="p" src=',
        '>'
    ], ['/photo.jpg']);

    assert.eqJson(jsx.html, template.html);
    assert.eqJson(jsx.exprs, template.exprs);
});

Testimony.test('Solarite.jsx.nullishChildren', () => {
    // <p>{null}{false}{undefined}</p>
    const jsx = h('p', null, null, false, undefined);
    const template = new Template(['<p>', '', '', '</p>'], [null, false, undefined]);
    assert.eqJson(jsx.html, template.html);
    assert.eqJson(jsx.exprs, template.exprs);
});

Testimony.test('Solarite.jsx.arrayChildren', () => {
    // <ul>{[<li>A</li>, <li>B</li>]}</ul> — the array is one child hole; PathToNodes renders each.
    const el = h('ul', null, [h('li', null, 'A'), h('li', null, 'B')]).render();

    let lis = el.querySelectorAll('li');
    assert.eq(lis.length, 2);
    assert.eq(lis[0].textContent, 'A');
    assert.eq(lis[1].textContent, 'B');
});

Testimony.test('Solarite.jsx.shapes', `The html of a JSX element is what the same element written as a tagged template would have`, () => {
	// What a tagged template hands its tag function.
	const strings = htmlStrings => [...htmlStrings];
	let a = 1, b = 2, c = 3;

	// 1. No attributes: zero, one and several children.
	assert.eqJson(h('p', null).html, strings`<p></p>`);
	assert.eqJson(h('p', null, a).html, strings`<p>${a}</p>`);
	assert.eqJson(h('p', null, a, b, c).html, strings`<p>${a}${b}${c}</p>`);

	// 2. Attributes, with and without children.
	assert.eqJson(h('p', {title: a}).html, strings`<p title=${a}></p>`);
	assert.eqJson(h('p', {title: a, lang: b}).html, strings`<p title=${a} lang=${b}></p>`);
	assert.eqJson(h('p', {title: a, lang: b}, c).html, strings`<p title=${a} lang=${b}>${c}</p>`);
	assert.eqJson(h('p', {title: a, lang: b, dir: c}, a, b).html, strings`<p title=${a} lang=${b} dir=${c}>${a}${b}</p>`);

	// 3. A static id is part of the html, wherever it is among the props.
	assert.eqJson(h('p', {id: 'x'}).html, strings`<p id="x"></p>`);
	assert.eqJson(h('p', {title: a, id: 'x', lang: b}, c).html, strings`<p id="x" title=${a} lang=${b}>${c}</p>`);

	// 4. The expressions line up with the holes: attributes first, then children.
	assert.eqJson(h('p', {title: a, id: 'x', lang: b}, c).exprs, [a, b, c]);

	// 5. A void element has no end tag, and children given to it are dropped.
	assert.eqJson(h('br', null).html, strings`<br>`);
	assert.eqJson(h('input', {value: a, type: b}).html, strings`<input value=${a} type=${b}>`);
	assert.eqJson(h('IMG', {id: 'x', src: a}, b).html, strings`<IMG id="x" src=${a}>`);
	assert.eqJson(h('IMG', {id: 'x', src: a}, b).exprs, [a]);

	// 6. A fragment is nothing but its child holes.
	assert.eqJson(h(Fragment, null).html, ['']);
	assert.eqJson(h(Fragment, null, a, b, c).html, strings`${a}${b}${c}`);
	assert.eqJson(h(Fragment, null, a, b, c).exprs, [a, b, c]);

	// 7. Whatever a static id holds stays inside its own string.
	assert.eqJson(h('p', {id: 'a\0b', title: a}, b).html, ['<p id="a\0b" title=', '>', '</p>']);
});

Testimony.test('Solarite.jsx.staticId', `A string id is written into the html, escaped; any other id is an expression`, () => {
	let template = h('p', {id: 'a"b&c'});
	assert.eqJson(template.html, ['<p id="a&quot;b&amp;c"></p>']);
	assert.eqJson(template.exprs, []);
	assert.eq(template.render().id, 'a"b&c');

	assert.eqJson(h('p', {'data-id': 'a"b'}).html, ['<p data-id="a&quot;b"></p>']);

	template = h('p', {id: 5});
	assert.eqJson(template.html, ['<p id=', '></p>']);
	assert.eqJson(template.exprs, [5]);
});

Testimony.test('Solarite.jsx.key', `A JSX key reaches the Template from the props or from the runtime's own argument, and is never an attribute`, () => {
	// 1. Classic factory: the key is among the props.
	let li = h('li', {key: 5, title: 't'}, 'x');
	assert.eq(li.key, 5);
	assert.eqJson(li.html, ['<li title=', '>', '</li>']);
	assert.eqJson(li.exprs, ['t', 'x']);
	assert.eq(h('li', {title: 't'}).key, undefined);
	assert.eq(h('li', null).key, undefined);

	// 2. Automatic runtime: the key is an argument of its own, and wins over one left in the props.
	assert.eq(jsx('li', {title: 't'}, 7).key, 7);
	assert.eq(jsx('li', {key: 5}, 7).key, 7);
	assert.eq(jsx('li', {key: 5}).key, 5);
	assert.eqJson(jsx('li', {key: 5}, 7).html, ['<li></li>']);
	assert.eq(jsxs('li', {key: 5, children: ['a', 'b']}).key, 5);

	// 3. A function component is not shown its key; the Template it returns gets it.
	let seen;
	const Row = props => {
		seen = props;
		return h('li', null, props.label);
	};
	assert.eq(h(Row, {key: 3, label: 'a'}).key, 3);
	assert.eqJson(seen, {label: 'a'});
	assert.eq(jsx(Row, {key: 3, label: 'a'}, 9).key, 9);
	assert.eq(h(Row, {label: 'a'}).key, undefined);

	// A key the component set itself stays when none is given.
	const Keyed = () => h('li', {key: 'own'});
	assert.eq(h(Keyed, null).key, 'own');

	// 4. A component class becomes its tag, keyed the same way.
	class JsxKeyRow extends HTMLElement {}
	customElements.define('jsx-key-row', JsxKeyRow);
	let row = h(JsxKeyRow, {key: 4, title: 't'});
	assert.eq(row.key, 4);
	assert.eqJson(row.html, ['<jsx-key-row title=', '></jsx-key-row>']);
	assert.eq(jsx(JsxKeyRow, {key: 4}, 8).key, 8);

	// 5. A fragment has no element to key.
	assert.eq(h(Fragment, {key: 1}, 'a').key, undefined);
	assert.eq(jsx(Fragment, {children: 'a'}, 1).key, undefined);
});

Testimony.test('Solarite.jsx.factoryArgs', `h(tag, props, ...children) is JSX only when the props argument is there`, () => {
	// 1. Props are null for an element without attributes, as the transform writes it.
	assert.eqJson(h('b', null).html, ['<b></b>']);
	assert.eqJson(h('b', {}).html, ['<b></b>']);
	assert.eqJson(h('b', null, 'x').exprs, ['x']);

	// 2. A string alone, or followed by something that is not props, is html.
	assert.eqJson(h('b').html, ['b']);
	assert.eqJson(h('b', undefined).html, ['b']);
	assert.eqJson(h('b', 'x').html, ['b']);
	assert.eqJson(h('b', 1).exprs, []);

	// 3. A String object is taken as a string either way.
	assert.eqJson(h(new String('b'), null).html, ['<b></b>']);

	// 4. A component or a fragment with no props at all.
	const Count = props => h('i', null, Object.keys(props).length);
	assert.eqJson(h(Count).exprs, [0]);
	assert.eqJson(h(Count, null).exprs, [0]);
	assert.eqJson(h(Fragment).html, ['']);
});

//endregion


//region jsx runtime (Tier 1 precompile + Tier 2 automatic)
/*┌─────────────────╮
  | JSX Runtime     |
  └─────────────────╯*/

// These tests feed the runtime the exact contract a build step (Deno precompile / a Solarite build
// plugin) emits, so no build step is needed to run them.  Hoisted statics are module-level consts
// with stable identity, exactly as the transform emits them.

// const x = <div class="greeting"><a href={link}>Hello <b>{name}!</b></a></div>;
const T_GREETING = ['<div class="greeting"><a ', '>Hello <b>', '!</b></a></div>'];

Testimony.test('Solarite.jsxrt.tier1.basic', () => {
	let link = 'http://x', name = 'Bob';
	let el = jsxTemplate(T_GREETING, jsxAttr('href', link), jsxEscape(name)).render();
	assert.eq(el.tagName, 'DIV');
	assert.eq(el.querySelector('a').getAttribute('href'), 'http://x');
	assert.eq(el.querySelector('a').textContent, 'Hello Bob!');
});

Testimony.test('Solarite.jsxrt.tier1.stableShell', () => {
	// Re-rendering with the same hoisted statics must reuse the Shell (parse once) and the DOM nodes.
	let el = toEl({ name: 'a', render(){ h(this, jsxTemplate(T_GREETING, jsxAttr('href', '#'), jsxEscape(this.name))); } });
	let a1 = el.querySelector('a'), b1 = el.querySelector('b');
	let shellsBefore = Globals.shells.get(T_GREETING);
	el.name = 'b'; el.render();
	assert.eq(el.querySelector('a'), a1);                 // same node reused
	assert.eq(el.querySelector('b'), b1);
	assert.eq(el.querySelector('a').textContent, 'Hello b!');
	assert(Globals.shells.get(T_GREETING) === shellsBefore); // same cached Shell
});

Testimony.test('Solarite.jsxrt.tier1.event', () => {
	const T = ['<button ', '>', '</button>'];
	let clicks = 0;
	let el = jsxTemplate(T, jsxAttr('onclick', () => clicks++), jsxEscape('go')).render();
	assert.eq(el.hasAttribute('onclick'), false);         // bound, not an attribute
	el.dispatchEvent(new Event('click', {bubbles:true}));
	assert.eq(clicks, 1);
});

Testimony.test('Solarite.jsxrt.tier1.booleanAttr', () => {
	const T = ['<button ', '>x</button>'];
	// Deno emits a bare string at the attribute hole for booleans; '' must add no attribute.
	let on = jsxTemplate(T, 'disabled').render();
	let off = jsxTemplate(T, '').render();
	assert.eq(on.hasAttribute('disabled'), true);
	assert.eq(off.hasAttribute('disabled'), false);
});

Testimony.test('Solarite.jsxrt.tier1.styleObject', () => {
	const T = ['<div ', '></div>'];
	let el = jsxTemplate(T, jsxAttr('style', {color: 'red', fontSize: '2px'})).render();
	assert.eq(el.getAttribute('style'), 'color:red;font-size:2px');
});

Testimony.test('Solarite.jsxrt.tier1.htmlProperty', () => {
	const T = ['<input ', '>'];
	let el = toEl({ v: 'a', render(){ h(this, jsxTemplate(T, jsxAttr('value', this.v))); } });
	assert.eq(el.value, 'a');     // set as a property, not just the attribute
	el.v = 'bb'; el.render();
	assert.eq(el.value, 'bb');
});

Testimony.test('Solarite.jsxrt.tier1.componentArgs', `Precompiled JSX attributes on a custom element tag reach the component as the same attributes of a tagged template do: under their own names, with their types.  Each used to arrive as two arguments called "name" and "value", so an array or object never arrived at all.`, () => {
	let calls = [];
	class JsxArgs1 extends HTMLElement {
		constructor(attribs) {
			super();
			calls.push(attribs);
		}
		render(attribs, hasChanged=() => true) {
			calls.push(attribs);
			this.changed = hasChanged();
		}
	}
	customElements.define('jsx-args-1', JsxArgs1);

	// What a build plugin emits for
	// <div><jsx-args-1 items={items} max-size={size} open={true} get-label={label} style={{...}}
	//     value={[model, 'name']} onclick={onClick} native:onkeydown={onKey} title="t"/></div>
	const T = ['<div><jsx-args-1 ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' title="t"></jsx-args-1></div>'];
	let items = [1, 2], model = {name: 'a'}, clicks = 0, keys = 0;
	let label = () => 'label', onClick = () => clicks++, onKey = () => keys++;
	let el = document.createElement('div');
	let render = size => h(el, jsxTemplate(T, jsxAttr('items', items), jsxAttr('max-size', size), jsxAttr('open', true),
		jsxAttr('get-label', label), jsxAttr('style', {color: 'red', fontSize: '2px'}), jsxAttr('value', [model, 'name']),
		jsxAttr('onclick', onClick), jsxAttr('native:onkeydown', onKey)));
	render(3);

	// 1. The constructor and the first render() get the same arguments.
	assert.eq(calls.length, 2);
	for (let attribs of calls) {
		assert.eq(Object.keys(attribs).sort().join(), 'getLabel,items,maxSize,open,style,title,value');
		assert.eq(attribs.items, items);
		assert.eq(attribs.maxSize, 3);
		assert.eq(attribs.open, true);
		assert.eq(attribs.getLabel, label);
		assert.eq(attribs.style, 'color:red;font-size:2px');
		assert.eq(attribs.value, 'a');
		assert.eq(attribs.title, 't');
	}

	// 2. The events are bound to the element and are not arguments.
	let component = el.querySelector('jsx-args-1');
	component.dispatchEvent(new Event('click', {bubbles: true}));
	component.dispatchEvent(new Event('keydown'));
	assert.eq(clicks, 1);
	assert.eq(keys, 1);
	assert.eq(component.onclick, null);

	// 3. The element carries what a tagged template would have written.  It used to be given
	// attributes called "name" and "value" as well.
	assert.eq(component.getAttribute('max-size'), '3');
	assert.eq(component.getAttribute('style'), 'color:red;font-size:2px');
	assert.eq(component.hasAttribute('name'), false);
	assert.eq(component.value, 'a');

	// 4. A later render passes the new values.
	model.name = 'b';
	render(4);
	assert.eq(calls.length, 3);
	assert.eq('name' in calls[2], false);
	assert.eq(calls[2].maxSize, 4);
	assert.eq(calls[2].value, 'b');
	assert.eq(calls[2].items, items);
	assert.eq(calls[2].getLabel, label);
	assert.eq(component.changed, true);
	assert.eq(component.getAttribute('max-size'), '4');

	// 5. The class form, which is compiled another way, passes the same.
	calls = [];
	el = document.createElement('div');
	h(el, jsx('div', {children: jsx(JsxArgs1, {items, 'max-size': 3, open: true, 'get-label': label, style: {color: 'red', fontSize: '2px'},
		value: [model, 'name'], onclick: onClick, 'native:onkeydown': onKey, title: 't'})}));
	assert.eq(Object.keys(calls[0]).sort().join(), 'getLabel,items,maxSize,open,style,title,value');
	assert.eq(calls[0].style, 'color:red;font-size:2px');
	assert.eq(calls[0].maxSize, 3);
});

Testimony.test('Solarite.jsxrt.tier1.componentArgsInList', `Custom elements written in precompiled JSX as the rows of a list are each given their own arguments, and a row rewritten for another item is given that item's.`, () => {
	let calls = [];
	class JsxArgs2 extends HTMLElement {
		constructor(attribs) {
			super();
			calls.push('new ' + JSON.stringify(attribs));
		}
		render(attribs) {
			calls.push('render ' + JSON.stringify(attribs));
		}
	}
	customElements.define('jsx-args-2', JsxArgs2);

	// <ul>{rows.map((row, i) => <jsx-args-2 key={row.id} row={row} index={i}/>)}</ul>, with
	// and without the key.
	const UL = ['<ul>', '</ul>'];
	const KEYED = ['<jsx-args-2 ', ' ', ' ', '></jsx-args-2>'], PLAIN = ['<jsx-args-2 ', ' ', '></jsx-args-2>'];
	for (let keyed of [true, false]) {
		calls = [];
		let el = document.createElement('div');
		let render = rows => h(el, jsxTemplate(UL, jsxEscape(rows.map((row, i) => keyed
			? jsxTemplate(KEYED, jsxAttr('key', row.id), jsxAttr('row', row), jsxAttr('index', i))
			: jsxTemplate(PLAIN, jsxAttr('row', row), jsxAttr('index', i))))));
		let a = {id: 'a'}, b = {id: 'b'}, c = {id: 'c'};
		render([a, b]);
		assert.eq(calls.join(), `new {"index":0,"row":{"id":"a"}},render {"index":0,"row":{"id":"a"}},new {"index":1,"row":{"id":"b"}},render {"index":1,"row":{"id":"b"}}`);
		let first = el.querySelector('jsx-args-2');

		calls = [];
		render([b, a, c]);
		let rows = [...el.querySelectorAll('jsx-args-2')];
		assert.eq(rows.map(row => row.getAttribute('index')).join(), '0,1,2');
		assert.eq(rows.map(row => row.getAttributeNames().join()).join('|'), 'index|index|index');

		// Keyed, the elements follow their items and each is told its new index.  Without a
		// key they stay where they are and are given the other item.  Either way the first
		// row holds b and the second a.
		assert.eq(rows[keyed ? 1 : 0], first);
		assert.eq(calls.slice(0, 2).sort().join(), `render {"index":0,"row":{"id":"b"}},render {"index":1,"row":{"id":"a"}}`);
		assert.eq(calls.slice(2).join(), `new {"index":2,"row":{"id":"c"}},render {"index":2,"row":{"id":"c"}}`);
	}
});

Testimony.test('Solarite.jsxrt.tier1.fragment', () => {
	const T = ['', '', ''];   // <>{a}{b}</>
	let frag = jsxTemplate(T, jsxEscape('x'), jsxEscape('y'));
	let host = toEl({ render(){ h(this, h`<div>${frag}</div>`); } });
	assert.eq(host.textContent, 'xy');
});

Testimony.test('Solarite.jsxrt.tier1.keyedReuse', () => {
	const UL = ['<ul>', '</ul>'];
	const LI = ['<li ', '>', '</li>'];
	const list = items => jsxTemplate(UL, jsxEscape(items.map(i =>
		jsxTemplate(LI, jsxAttr('key', i.id), jsxEscape(i.t)))));

	let el = toEl({ items: [{id:1,t:'a'},{id:2,t:'b'},{id:3,t:'c'}], render(){ h(this, list(this.items)); } });
	let lis = [...el.querySelectorAll('li')];
	lis.forEach((n,i) => n.__m = i);

	el.items = [el.items[2], el.items[0], el.items[1]]; // shuffle [c,a,b]
	el.render();
	let after = [...el.querySelectorAll('li')];
	assert.eq(after.map(n => n.textContent), ['c','a','b']);
	assert.eq(after.map(n => n.__m), [2,0,1]);            // nodes followed their key
});

Testimony.test('Solarite.jsxrt.tier2.automatic', () => {
	// jsxs('div', {children: [ jsx('span',{children:'hi'}), jsx('input',{value:'v'}) ]})
	let t = jsxs('div', { class: 'a', children: [
		jsx('span', { children: 'hi' }),
		jsx('input', { value: 'v' }),
	]});
	let el = t.render();
	assert.eq(el.className, 'a');
	assert.eq(el.querySelector('span').textContent, 'hi');
	assert.eq(el.querySelector('input').value, 'v');
});

Testimony.test('Solarite.jsxrt.tier2.functionComponent', () => {
	function Greet(props) { return h('p', null, 'Hi ', props.name); }
	let el = jsx(Greet, { name: 'Sam' }).render();
	assert.eq(el.tagName, 'P');
	assert.eq(el.textContent, 'Hi Sam');
});

Testimony.test('Solarite.jsxrt.tier2.shapeIntern', () => {
	// Same (tag, prop-names, child-count) shape => identical interned html array => Shell reused.
	let a = h('div', { class: 'x' }, 'one');
	let b = h('div', { class: 'y' }, 'two');
	assert(a.html === b.html);                   // interned, stable identity
	let c = h('div', { id: 'z' }, 'three');
	assert(a.html !== c.html);                   // different prop set => different shape
});

Testimony.test('Solarite.jsxrt.classic.fragment', () => {
	let el = toEl(h('div', null, h(Fragment, null, h('b', null, 'x'), h('i', null, 'y'))));
	assert.eq(el.querySelector('b').textContent, 'x');
	assert.eq(el.querySelector('i').textContent, 'y');
});

Testimony.test('Solarite.jsxrt.classic.fragmentKeepsNodes', `A fragment's children survive a re-render`, () => {
	// Every render of a fragment has to hand Template the same html array.  Given a new array each
	// time, the fragment was a different template on every render, so its children were rebuilt:
	// an input lost its focus and what had been typed, and a child component was constructed again.
	let constructed = 0;
	class FragmentKeepsChild extends Solarite {
		constructor() {
			super();
			constructed++;
		}
		render() {
			h(this)`<fragment-keeps-child>c</fragment-keeps-child>`;
		}
	}
	FragmentKeepsChild.define('fragment-keeps-child');

	// 1. Classic factory.
	let el = document.createElement('div');
	let render = n => h(el, h('div', null, h(Fragment, null, h('input', null), h(FragmentKeepsChild, null), h('i', null, n))));
	render(1);
	let input = el.querySelector('input');
	let child = el.querySelector('fragment-keeps-child');
	input.value = 'typed';
	render(2);
	assert.eq(el.querySelector('i').textContent, '2');
	assert(el.querySelector('input') === input);
	assert.eq(input.value, 'typed');
	assert(el.querySelector('fragment-keeps-child') === child);
	assert.eq(constructed, 1);

	// 2. Automatic runtime, a fragment of several children and of one.
	el = document.createElement('div');
	render = n => h(el, jsx('div', {children: jsxs(Fragment, {children: [
		jsx('input', {}),
		jsx(Fragment, {children: jsx('i', {children: n})})
	]})}));
	render(1);
	input = el.querySelector('input');
	let i = el.querySelector('i');
	render(2);
	assert.eq(i.textContent, '2');
	assert(el.querySelector('input') === input);
	assert(el.querySelector('i') === i);

	// 3. Rows that are fragments, and a fragment returned by a function component.
	const Pair = props => h(Fragment, null, h('dt', null, props.term), h('dd', null, props.text));
	el = document.createElement('div');
	render = texts => h(el, h('dl', null, texts.map((text, term) => h(Pair, {term, text}))));
	render(['a', 'b', 'c']);
	let dts = [...el.querySelectorAll('dt')];
	render(['a', 'B', 'c']);
	assert.eq(el.textContent, '0a1B2c');
	assert.eqJson([...el.querySelectorAll('dt')].map((dt, i) => dt === dts[i]), [true, true, true]);

	// 4. Same child count, same array; a different count gets its own.
	assert(h(Fragment, null, 1, 2).html === h(Fragment, null, 3, 4).html);
	assert(h(Fragment, null, 1, 2).html !== h(Fragment, null, 1).html);
	assert.eqJson(h(Fragment, null, 1, 2).html, ['', '', '']);
	assert.eqJson(h(Fragment, null).html, ['']);
});

Testimony.test('Solarite.jsxrt.classic.fragmentNotKeptPerRender', `Re-rendering a fragment keeps no copy of what it showed before`, () => {
	// A row that a render replaces is kept for reuse under the identity of its html.  A fragment
	// with a new html array on every render was replaced on every render, and each replaced copy
	// was kept, with its elements, under an identity that never came again.
	let el = document.createElement('div');
	for (let n = 0; n < 5; n++)
		h(el, h('div', null, h(Fragment, null, h('input', null), h('i', null, n))));
	let path = Globals.rootNodeGroups.get(el).paths.find(path => path instanceof PathToNodes);
	assert.eq(path.nodeGroups.length, 1);
	assert.eqJson(Object.keys(path.nodeGroupsDetachedAvailable?.data || {}), []);
});

Testimony.test('Solarite.jsxrt.classic.fragmentRawNodeMoves', `A raw DOM node that moves from one fragment to another of the same number of children, under one parent, is shown in its new place.`, () => {
	// Fragments of one child count are one template, so the fragment that receives the node is
	// rewritten in place, and it is written before the one that gives the node up.
	let el = document.createElement('div');
	let node = document.createElement('hr');
	const html = v => v === node ? '<hr>' : v;
	for (let rows of [[['p', 'q'], [node, 'r']], [[node, 'r'], ['p', 'q']], [['p', 'q'], [node, 'r']], [['p', node], ['s', 'r']], [['p', 'q'], ['s', node]], [[node, 'q'], ['s', 't']], [['u', 'q']], [['u', 'q'], [node, 'x']]]) {
		h(el, h('div', null, rows.map(([a, b]) => h(Fragment, null, a, b))));
		assert.eq(el.firstElementChild.innerHTML.replace(/<!--.*?-->/g, ''), rows.map(([a, b]) => html(a) + html(b)).join(''));
	}
});

//endregion


//region full
/*┌─────────────────╮
  | Full            |
  └─────────────────╯*/
Testimony.test('Solarite.full.tree', ()=> {

	class TreeItem extends HTMLElement {
		treeData;
		renderContent;

		constructor(fields) {
			super();
			for (let name in fields)
				if (name in this)
					this[name] = fields[name];
			this.render();
		}
		render() {
			h(this)`
			<tree-item>
				<div data-id="childItems">
					${(this.treeData.children || []).map(child => h`
						<tree-item tree-data=${child} render-content=${this.renderContent}></tree-item>
					`)}
				</div>
			</tree-item>`
		}
	}
	customElements.define('tree-item', TreeItem);


	class TreeParent extends HTMLElement {
		render() {
			// Tree two levels deep
			let treeData = {
				children: [{}]
			};

			h(this)`
			<tree-parent class="'dt-root">
				<tree-item data-id="root" tree-data=${treeData}></tree-item>
			</tree-parent>`
		}
	}

	customElements.define('tree-parent', TreeParent);


	let dt = new TreeParent();
	dt.render();
	document.body.append(dt);
});

Testimony.test('Solarite.full.reRender', `Render a child web component multiple times`, ()=> {

	class ReRenderChild extends HTMLElement {

	}
	customElements.define('re-render-child', ReRenderChild);


	class ReRender extends HTMLElement {
		constructor() {
			super();
			this.columns = [1, 2, 3];
			this.render();
			this.render();
			this.render();
		}
		render() {
			h(this)`
			<re-render>
				${this.columns.map(col => h`
					<re-render-child></re-render-child>`
				)}
			</re-render>`
		}
	}
	customElements.define('re-render', ReRender);


	let form = new ReRender();
	form.render();
	document.body.append(form);

})

Testimony.test('Solarite.full._todoList', () => {
	class ShoppingList extends HTMLElement {
		constructor(items=[]) {
			super();
			this.items = items;
			this.render();
		}

		addItem() {
			this.items.push({name: '', qty: 0});
			this.render();
		}

		removeItem(item) {
			this.items.splice(this.items.indexOf(item), 1);
			this.render();
		}

		render() {
			h(this)`
			<shopping-list>
				<style>:host input { width: 80px }</style>

				<button onclick=${this.addItem}>Add Item</button>

				${this.items.map(item => h`
					<div>
						<input placeholder="Item" value=${item.name}
							oninput=${e => { // two-way binding
				item.name = e.target.value;
				this.render()
			}}>
					</div>
				`)}
			</shopping-list>`
		}
	}

	customElements.define('shopping-list', ShoppingList);
	document.body.append(new ShoppingList()); // add <shopping-list> element
});

Testimony.test('Solarite.full._treeItems', () => {

	//import '../src/Solarite.js'

	class TreeItem extends Solarite {

		constructor(title, children=[]) {
			super();
			this.childItems = children;
			this.titleText = title;
			this.showChildren = true;
		}

		toggleChildren() {
			this.showChildren = !this.showChildren
			this.render();
		}

		render() {
			h(this)`
				<tree-item>
					<style>
						:host #childItems { padding-left: 20px }
					</style>
					<div onclick="${this.toggleChildren}">${this.titleText}</div>
					<div hidden="${!this.showChildren}">
						${this.childItems}
					</div>
				</tree-item>`;
		}
	}
	TreeItem.define();

	let root = new TreeItem('Root', [
		new TreeItem('Folder 1', [
			new TreeItem('File 1'),
			new TreeItem('File 2'),
			new TreeItem('File 3')
		]),
		new TreeItem('Folder 2')
	])

	document.body.append(root);
	root.remove();
});


// An attempt to create a simpler version that reproduces the same bug as full.misc.
// but this version always works, and doesn't reproduce the issue.
Testimony.test('Solarite.full._isc2', () => {
	let items = [
		{name: 'Apples', qty: 1},
		{name: 'Banans', qty: 2},
		{name: 'Cherries', qty: 3}
	]
	let toggle = false;

	class Misc2 extends HTMLElement {
		render() {
			h(this)`
			<misc-2>
				${items.map(item => h`
					<div>
						${h`<span>${item.name}</span>`}
						${h`<span>${item.qty}</span>`}
					</div>`
			)}

			</misc-2>`;
		}
	}

	customElements.define('misc-2', Misc2);

	let m = new Misc2();
	document.body.append(m);
	m.render();


	// let temp = items[0];
	// items[0] = items[1];
	// items[1] = temp;

	// items[0].name = 'Bananas';
	// items[0].qty = 3;

	//items[0] = items[1];

	toggle = !toggle;

	m.render();

	toggle = !toggle;

	m.render();

	toggle = !toggle;

	m.render();

});




Testimony.test('Solarite.full._misc', () => {

	class Misc1 extends HTMLElement {

		items = [];
		options = [];



		constructor(options) {
			super();
			this.options = options;
			this.items = items;

			for (let product of this.items)
				for (let option of this.options)
					option[product.id + '_showOther'] = !!(product[option.name] && option.name !== product[option.name]);

			this.render();
		}

		async setValue(product, option, field, value) {
			product[field] = value;
			option[product.id + '_showOther'] = !!(value && option.name !== value);
			this.render();
		}

		render() {
			h(this)`
			<misc-1>
				${this.items.map(item => h`
					<p>
						${this.options.map(option => h`
							<div style="display: flex">
								${h`<button onclick=${() => this.setValue(item, option, option.name, '')}>${option.name}</button>`}

								${option[item.id + '_showOther']  && h`<input>`}
							</div>`
			)}
					</p>
					<br><br>
				`)}
			</misc-1>`;
		}
	}
	customElements.define('misc-1', Misc1);

	let options = [
		{
			name: "a"
		},
		{
			name: "b"
		},
		{
			name: "c"
		}
	];
	let items = [
		{
			"id": 1,
			"a": 1,
			"b": 2,
			"c": 3
		},
		{
			"id": 2,
			"a": 1,
			"b": 2,
			"c": null
		}
	];
	let sp = new Misc1(options, items);
	document.body.append(sp);

	sp.children[0].setAttribute('style', 'border: 1px solid red');

	sp.children[0].children[0].querySelector('input').setAttribute('style', 'border: 3px solid #f80');
	sp.children[0].children[1].querySelector('input').setAttribute('style', 'border: 3px solid #fc0');
	sp.children[0].children[2].querySelector('input').setAttribute('style', 'border: 3px solid #660');

	sp.children[1].setAttribute('style', 'border: 1px solid blue');

	sp.children[3].children[0].setAttribute('style', 'border: 3px solid #0f8');
	sp.children[3].children[1].setAttribute('style', 'border: 3px solid #0fc');
	sp.children[3].children[2].setAttribute('style', 'border: 3px solid #0cf');

	// Trigger bug:
	//sp.setValue(products[0], 'b', '');
	//sp.setValue(products[0], 'c', '');
});


Testimony.test('Solarite.attrib.typedConstructor', () => {

	// super(attribs, types) coerces literal-string attribute values to the declared
	// types before the subclass copies them onto its fields.
	class RTypedCtor extends Solarite {
		count = 0;
		enabled = false;
		when = null;
		constructor(attribs) {
			super(attribs, {count: Number, enabled: Boolean, when: Date});
			Object.assign(this, attribs);
		}
		render() {
			h(this)`<div></div>`;
		}
	}

	// Strings coerce: Number, a bare attribute (empty string) => true, Date.
	let a = new RTypedCtor({count: '5', enabled: '', when: '2026-07-21'});
	assert.eq(a.count, 5);
	assert.eq(a.enabled, true);
	assert.eq(a.when instanceof Date, true);

	// 'false' and '0' are the only boolean strings that read as false.
	let b = new RTypedCtor({count: '0', enabled: 'false'});
	assert.eq(b.count, 0);
	assert.eq(b.enabled, false);
	assert.eq(new RTypedCtor({enabled: '0'}).enabled, false);

	// Non-string values (e.g. a ${true} template expression) pass through untouched.
	let c = new RTypedCtor({count: 3, enabled: true});
	assert.eq(c.count, 3);
	assert.eq(c.enabled, true);

	// With no types map the constructor behaves exactly as before: no coercion.
	class RUntypedCtor extends Solarite {
		flag = null;
		constructor(attribs) {
			super(attribs);
			Object.assign(this, attribs);
		}
		render() {
			h(this)`<div></div>`;
		}
	}
	assert.eq(new RUntypedCtor({flag: 'true'}).flag, 'true');

	a.render();
	assert.eq(getHtml(a), `<r-typed-ctor><div></div></r-typed-ctor>`);
});


//endregion

/*┌─────────────────────────────╮
  | Alias (expr-array borrow)   |
  └─────────────────────────────╯*/
//region alias

// Targeted checks for the collectItems alias fast path: an all-Templates array
// is borrowed directly during apply, so re-rendering after the USER mutates
// their own array (same instance or new instance) must behave exactly like the
// old copying path, and Solarite must not hold a reference to the array.

Testimony.test('Solarite.alias.sameArrayMutated', `Re-rendering after in-place mutations of the same borrowed array matches the copying path.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	let rows = [h`<p>a</p>`, h`<p>b</p>`];
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	assert.eq(el.querySelectorAll('p').length, 2);
	assert.eq(el.textContent, 'ab');

	// Mutate the SAME array instance in place, then re-render.
	rows.push(h`<p>c</p>`);
	rows[0] = h`<p>A</p>`;
	render();
	assert.eq(el.querySelectorAll('p').length, 3);
	assert.eq(el.textContent, 'Abc');

	// Shrink in place.
	rows.length = 1;
	render();
	assert.eq(el.querySelectorAll('p').length, 1);
	assert.eq(el.textContent, 'A');

	el.remove();
});

Testimony.test('Solarite.alias.keyedSameArrayMutated', `Keyed reorder via in-place swap of the borrowed array moves nodes by identity.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	let data = [{id: 1, t: 'one'}, {id: 2, t: 'two'}, {id: 3, t: 'three'}];
	let rows = data.map(d => h`<p key=${d.id}>${d.t}</p>`);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	assert.eq(el.textContent, 'onetwothree');
	let first = el.querySelector('p');

	// Swap two entries of the same array instance; keyed diff should move nodes.
	[rows[0], rows[2]] = [rows[2], rows[0]];
	render();
	assert.eq(el.textContent, 'threetwoone');
	assert.eq(el.querySelectorAll('p')[2], first); // Node identity followed the key.

	el.remove();
});

Testimony.test('Solarite.alias.mixedArrayFallsBack', `An array with any non-Template takes the copying path with identical output.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	// A non-Template element anywhere must take the copying path with identical results.
	let rows = [h`<p>a</p>`, 'text', 5, null, [h`<p>b</p>`]];
	h(el)`<div>${rows}</div>`;
	assert.eq(el.firstElementChild.childNodes.length, 5); // p, 'text', '5', '', p
	assert.eq(el.textContent, 'atext5b');

	el.remove();
});

Testimony.test('Solarite.alias.frozenArray', `A frozen user array renders fine — the borrow never writes to it.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	// The alias must never write to the user's array; a frozen one would throw in strict mode.
	let rows = Object.freeze([h`<p>x</p>`, h`<p>y</p>`]);
	h(el)`<div>${rows}</div>`;
	assert.eq(el.textContent, 'xy');
	h(el)`<div>${Object.freeze([h`<p>z</p>`])}</div>`;
	assert.eq(el.textContent, 'z');

	el.remove();
});

//endregion

/*┌─────────────────────────────╮
  | Detach (bulk-insert detour) |
  └─────────────────────────────╯*/
//region detach

// Targeted checks for the detached-parent bulk-insert detour in applyKeyed step 5a:
// when a whole-parent keyed list is fully replaced with more than 500 rows, the parent
// element is detached before the insert loop and reattached once afterward.  These tests
// prove the detour fires exactly when intended (observed via a MutationObserver on the
// grandparent), that every guarded case stays on the old direct-insert path, and that
// rendered output, node identity, events, and focus are unchanged either way.

/**
 * Build n keyed row templates with keys starting at keyBase. */
function makeRows(n, keyBase=0) {
	let rows = new Array(n);
	for (let i=0; i<n; i++)
		rows[i] = h`<p key=${keyBase + i}>${'r' + (keyBase + i)}</p>`;
	return rows;
}

/**
 * Watch parent's own childList (not subtree) and report whether the given child
 * was removed and re-added during fn() — i.e. whether the detour fired. */
function sawDetach(parent, child, fn) {
	let mo = new MutationObserver(() => {});
	mo.observe(parent, {childList: true});
	fn();
	let recs = mo.takeRecords();
	mo.disconnect();
	let removed = recs.some(r => [...r.removedNodes].includes(child));
	let added = recs.some(r => [...r.addedNodes].includes(child));
	return removed && added;
}

Testimony.test('Solarite.detach.createLargeFromEmpty', `Creating >500 rows into an empty whole-parent list takes the detach detour (one remove+add seen by the grandparent).`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	// Krausest shape: empty keyed tbody, then create-rows in one render.
	let rows = [];
	let render = () => h(el)`<table><tbody>${rows}</tbody></table>`;
	render();
	let tbody = el.querySelector('tbody');
	assert.eq(tbody.childElementCount, 0);

	rows = new Array(1200);
	for (let i=0; i<1200; i++)
		rows[i] = h`<tr key=${i}><td>${'r' + i}</td></tr>`;
	let detoured = sawDetach(el.querySelector('table'), tbody, render);

	assert(detoured); // The detour must fire for a >500-row create into an empty list.
	assert.eq(el.querySelector('tbody'), tbody); // Same node reattached.
	assert.eq(tbody.childElementCount, 1200);
	assert.eq(tbody.firstElementChild.textContent, 'r0');
	assert.eq(tbody.children[599].textContent, 'r599');
	assert.eq(tbody.lastElementChild.textContent, 'r1199');
	assert(tbody.isConnected);

	el.remove();
});

Testimony.test('Solarite.detach.replaceAllLarge', `Fully replacing a large keyed list also takes the detour.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	let rows = makeRows(800);
	let render = () => h(el)`<div class="wrap">${rows}</div>`;
	render();
	let list = el.firstElementChild;
	assert.eq(list.childElementCount, 800);
	let oldFirst = list.firstElementChild;

	// All-new keys: kept === 0, full region → fastClear + detour.
	rows = makeRows(800, 10000);
	let detoured = sawDetach(el, list, render);

	assert(detoured);
	assert.eq(list.childElementCount, 800);
	assert.eq(list.firstElementChild.textContent, 'r10000');
	assert.eq(list.lastElementChild.textContent, 'r10799');
	assert(list.firstElementChild !== oldFirst); // Keyed semantics: new keys get new nodes.

	el.remove();
});

Testimony.test('Solarite.detach.smallListStaysDirect', `500 rows or fewer insert directly — no detach.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	let rows = makeRows(100);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	let list = el.firstElementChild;

	rows = makeRows(100, 5000);
	let detoured = sawDetach(el, list, render);

	assert(!detoured); // At or below the threshold, inserts stay on the direct path.
	assert.eq(list.childElementCount, 100);
	assert.eq(list.firstElementChild.textContent, 'r5000');

	el.remove();
});

Testimony.test('Solarite.detach.notWholeParentSkips', `A list that does not own its whole parent never detaches.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	// Leading text keeps the list from being the parent's entire content,
	// so wholeParent is false and the detour must not fire.
	let rows = makeRows(600);
	let render = () => h(el)`<div>head${rows}</div>`;
	render();
	let list = el.firstElementChild;

	rows = makeRows(600, 20000);
	let detoured = sawDetach(el, list, render);

	assert(!detoured);
	assert.eq(list.querySelectorAll('p').length, 600);
	assert(list.textContent.startsWith('headr20000'));
	assert(list.textContent.endsWith('r20599'));

	el.remove();
});

Testimony.test('Solarite.detach.keptRowsUse5b', `Replacements that keep some rows use the mixed insert path, not the detour.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	let rows = makeRows(600);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	let list = el.firstElementChild;
	let keeper = list.children[300]; // key 300

	// Keep one key in the middle; kept > 0 routes to step 5b, never the detour.
	// The kept row must come from the same template call site (inside makeRows)
	// or itemClose treats it as a different shape and recreates it.
	rows = makeRows(600, 40000);
	rows[250] = makeRows(1, 300)[0];
	let detoured = sawDetach(el, list, render);

	assert(!detoured);
	assert.eq(list.childElementCount, 600);
	assert.eq(list.children[250], keeper); // Node identity followed the kept key.
	assert.eq(list.children[0].textContent, 'r40000');
	assert.eq(list.children[599].textContent, 'r40599');

	el.remove();
});

Testimony.test('Solarite.detach.disconnectedParentSkips', `A parent not in the document inserts directly.`, () => {
	// Never appended to the document: the gate's isConnected check skips the
	// detour, and rendering must still work on the fully detached tree.
	let el = document.createElement('div');

	let rows = makeRows(600);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	let list = el.firstElementChild;
	assert.eq(list.childElementCount, 600);

	rows = makeRows(600, 60000);
	render();
	assert.eq(list.childElementCount, 600);
	assert.eq(list.firstElementChild.textContent, 'r60000');
	assert.eq(list.lastElementChild.textContent, 'r60599');
});

Testimony.test('Solarite.detach.customElementParentSkips', `A web-component parent is never detached, so its lifecycle callbacks cannot fire mid-render.`, () => {
	// The reachable custom-element-parent case: a self-rendering h(this) component
	// whose root element directly wraps the keyed list, so the wholeParent node IS
	// the component.  Detaching it mid-render would fire its disconnected/connected
	// callbacks, where subclasses may run teardown logic — the gate must skip it.
	class DetachSelfList extends HTMLElement {
		connectedCallback() { DetachSelfList.conn++; this.render(); }
		disconnectedCallback() { DetachSelfList.disc++; }
		render() { h(this)`<detach-self-list>${this.rows}</detach-self-list>`; }
	}
	DetachSelfList.conn = 0;
	DetachSelfList.disc = 0;
	customElements.define('detach-self-list', DetachSelfList);

	let list = document.createElement('detach-self-list');
	list.rows = makeRows(600);
	document.body.append(list); // connectedCallback renders the first 600 rows.
	assert.eq(DetachSelfList.conn, 1);
	assert.eq(list.childElementCount, 600);

	list.rows = makeRows(600, 80000);
	let detoured = sawDetach(document.body, list, () => list.render());

	assert(!detoured);
	assert.eq(DetachSelfList.disc, 0); // Lifecycle callbacks never fired mid-render.
	assert.eq(DetachSelfList.conn, 1);
	assert.eq(list.childElementCount, 600);
	assert.eq(list.firstElementChild.textContent, 'r80000');
	assert.eq(list.lastElementChild.textContent, 'r80599');

	list.remove();
});

Testimony.test('Solarite.detach.eventsSurviveReattach', `Delegated event handlers still fire after the detach/reattach cycle.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	// A row's delegated handlers are found through the pointer on its root element;
	// detach/reattach must not lose it.
	let clicked = [];
	let rows = new Array(600);
	for (let i=0; i<600; i++)
		rows[i] = h`<p key=${i} onclick=${() => clicked.push(i)}>${'r' + i}</p>`;
	h(el)`<div>${rows}</div>`;

	let list = el.firstElementChild;
	list.children[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	list.children[599].dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(clicked.join(','), '0,599');

	el.remove();
});

Testimony.test('Solarite.detach.clearThenRecreate', `Clear followed by a large re-create (the benchmark 09+07 pattern) renders correctly.`, () => {
	let el = document.createElement('div');
	document.body.append(el);

	// Krausest 09 + 07 sequence: create, clear, create again.
	let rows = makeRows(700);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	let list = el.firstElementChild;
	assert.eq(list.childElementCount, 700);

	rows = [];
	render();
	assert.eq(list.childElementCount, 0);

	rows = makeRows(700, 90000);
	render();
	assert.eq(list.childElementCount, 700);
	assert.eq(list.firstElementChild.textContent, 'r90000');
	assert.eq(list.lastElementChild.textContent, 'r90699');

	el.remove();
});

Testimony.test('Solarite.detach.focusOutsideSurvives', `Focus outside the list parent is not disturbed by the detour.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let input = document.createElement('input');
	document.body.append(input);
	input.focus();

	let rows = makeRows(600);
	let render = () => h(el)`<div>${rows}</div>`;
	render();
	rows = makeRows(600, 70000);
	render(); // Detour fires; focus outside the detached parent must be untouched.

	assert.eq(document.activeElement, input);
	assert.eq(el.firstElementChild.childElementCount, 600);

	input.remove();
	el.remove();
});

//endregion

Testimony.test('Solarite.expr.translated', `After a page translator has replaced the text of a page with <font> elements, text that is all its element holds, as in <span>\${name}</span>, shows every new value: beside other words, when it becomes empty, when it changes to a template and back, in the rows of a list, and inside an element that doesn't render through Solarite.  Text whose value did not change keeps its translation, and showing the page untranslated again breaks nothing.`, () => {
	// What the page would show untranslated.
	let plain = node => node.textContent.replaceAll('T:', '');

	// 1. Text beside other words.
	let el = document.createElement('div'), name = 'one', other = 'same';
	let render = () => h(el)`<p>Hello <span>${name}</span>, <b>${other}</b>!</p>`;
	render();
	translatePage(el);
	let span = el.querySelector('span'), b = el.querySelector('b');
	assert.eq(el.textContent, 'T:Hello T:oneT:, T:sameT:!');
	name = 'two';
	render();
	assert.eq(span.innerHTML, 'two');
	assert.eq(b.textContent, 'T:same');
	translatePage(el);
	assert.eq(span.textContent, 'T:two');
	render();
	assert.eq(span.textContent, 'T:two');
	name = '';
	render();
	assert.eq(span.innerHTML, '');
	name = 'three';
	render();
	assert.eq(span.innerHTML, 'three');

	// 2. The reader asks for the original page again.
	translatePage(el);
	name = 'four';
	render();
	untranslatePage(el);
	assert.eq(el.innerHTML, '<p>Hello <span>four</span>, <b>same</b>!</p>');
	name = 'five';
	other = 'other';
	render();
	assert.eq(el.innerHTML, '<p>Hello <span>five</span>, <b>other</b>!</p>');

	// 3. Text that becomes a template, and a template that becomes text.
	let on = true;
	render = () => h(el)`<p>Saved: <span>${on ? 'Yes' : h`<i>No</i>`}</span></p>`;
	render();
	span = el.querySelector('span');
	for (let i = 0; i < 4; i++) {
		translatePage(el);
		on = !on;
		render();
		assert.eq(plain(span), on ? 'Yes' : 'No');
		assert.eq(span.children.length, on ? 0 : 1);
		assert.eq(span.children[0]?.tagName, on ? undefined : 'I');
	}

	// 4. Rows of a list, keyed and not, as an array and with h.map().
	let rows = {
		keyed: items => items.map(item => h`<li key=${item.id}><span>${item.id}</span>: <span>${item.label}</span></li>`),
		unkeyed: items => items.map(item => h`<li><span>${item.id}</span>: <span>${item.label}</span></li>`),
		mapped: items => h.map(items, item => h`<li><span>${item.id}</span>: <span>${item.label}</span></li>`),
		oneCell: items => h.map(items, item => h`<li>${item.label}</li>`)
	};
	for (let kind in rows) {
		let items = [1, 2, 3, 4].map(id => ({id, label: 'label ' + id})), holder = document.createElement('div');
		let check = step => {
			h(holder)`<ul>${rows[kind](items)}</ul>`;
			assert.eq([...holder.firstChild.children].map(plain).join('|'), items.map(item => kind === 'oneCell' ? item.label : item.id + ': ' + item.label).join('|'), kind + ', ' + step);
			translatePage(holder);
		};
		check('create');
		items[1] = {id: 2, label: 'changed'};
		check('change one');
		items.reverse();
		check('reverse');
		items = [{id: 9, label: 'new'}, ...items.slice(0, 2).map(item => ({id: item.id, label: item.label + '!'}))];
		check('add, remove and change');
		items = [];
		check('clear');
		assert.eq(holder.innerHTML, '<ul></ul>');
	}

	// 5. Inside an element that doesn't render through Solarite.
	class TranslatedPlain extends HTMLElement {}
	customElements.define('translated-plain', TranslatedPlain);
	name = 'one';
	on = true;
	render = () => h(el)`<div><translated-plain><span>${name}</span> <u>${on ? 'Yes' : h`<i>No</i>`}</u></translated-plain></div>`;
	render();
	span = el.querySelector('span');
	let u = el.querySelector('u');
	for (let value of ['two', 'three', 'three', 'four']) {
		translatePage(el);
		name = value;
		on = !on;
		render();
		assert.eq(plain(span), value);
		assert.eq(plain(u), on ? 'Yes' : 'No');
		assert.eq(u.children.length, on ? 0 : 1);
	}
});
