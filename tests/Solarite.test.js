// noinspection DuplicatedCode,JSUnusedAssignment

import Testimony, {assert} from './Testimony.js';

import h, {toEl, Solarite, Template, Globals, SolariteUtil, svg, getEventBinding, Fragment} from '../src/Solarite.js';
import {jsxTemplate, jsxAttr, jsxEscape, jsx, jsxs} from '../src/jsx-runtime.js';
import NodeGroup from '../src/NodeGroup.js';
import Shell from '../src/Shell.js';

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

// Exercises the raw-Node fallback (PathToNodes.applyGeneric -> reconcileNodes).
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
// expression is a child of some node, and a private-use character when it sits inside a tag or attribute value.
// So feeding it the chunks below and reading back the placeholders tells us the context after every chunk.
Testimony.test('Solarite.Util.htmlContext', () => {

	// One letter per gap between chunks:  t for text context, a for anything else (tag or attribute).
	let check = (chunks, contexts) =>
		assert.eq(Shell.addPlaceholders(chunks), chunks.map((chunk, i) =>
			i === contexts.length
				? chunk
				: chunk + (contexts[i] === 't' ? '<!--!✨!-->' : String.fromCharCode(0xe000 + i))
		).join(''));

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
		'<my-el-SOLARITE-PLACEHOLDER a="' + String.fromCharCode(0xe000) + '">');
});

Testimony.test('Solarite.Util.camelToDashes', () => {
	assert.eq(SolariteUtil.camelToDashes('ProperName'), 'proper-name');
	assert.eq(SolariteUtil.camelToDashes('HTMLElement'), 'html-element');
	assert.eq(SolariteUtil.camelToDashes('BigUI'), 'big-ui');
	assert.eq(SolariteUtil.camelToDashes('UIForm'), 'ui-form');
	assert.eq(SolariteUtil.camelToDashes('A100'), 'a-100');
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
	let seed = 1234567;
	const rnd = n => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed % n;
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
	Globals.reset();

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

//endregion




/*┌─────────────────╮
  | Delegation      |
  └─────────────────╯*/
//region delegation
// Tests for event delegation, which is on by default: bubbling events dispatch from one
// listener per event type on the component root instead of addEventListener per element.
// Pass eventDelegation:false to opt out.  See the delegatedDispatcher in PathToAttribValue.js.

Testimony.test('Solarite.delegation.click', `eventDelegation option dispatches through one root listener.`, () => {
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

Testimony.test('Solarite.delegation.defaultOn', `Delegation is on by default without passing the option.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let count = 0;
	h(el)`<div><button onclick=${() => count++}>hi</button></div>`;

	let btn = el.querySelector('button');
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(count, 1); // The delegated root listener caught the bubbling click.

	// A non-bubbling event never reaches the root listener, so it doesn't fire.
	btn.dispatchEvent(new MouseEvent('click'));
	assert.eq(count, 1);

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

Testimony.test('Solarite.delegation.documentOption', `eventDelegation:'document' keeps handlers firing on nodes re-parented outside their component.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let count = 0;
	h(el, {eventDelegation: 'document'})`<div><button onclick=${() => count++}>hi</button></div>`;

	let btn = el.querySelector('button');

	// Inside the component: the root dispatcher handles it; the document dispatcher
	// sees the done-marker and must not double-fire.
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(count, 1);

	// Re-parented outside the component (the dock-parked-toolbar case): the click
	// bubbles past el entirely, and only the document dispatcher can reach the handler.
	let elsewhere = document.createElement('div');
	document.body.append(elsewhere);
	elsewhere.append(btn);
	btn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(count, 2);

	el.remove();
	elsewhere.remove();
});

Testimony.test('Solarite.delegation.documentOptionOffByDefault', `Without 'document', a re-parented node's delegated handler goes quiet.`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let count = 0;
	// mousedown, not click: another test's 'document' option leaves a click dispatcher on the
	// shared document for the rest of the suite, which would falsely catch this handler.
	h(el)`<div><button onmousedown=${() => count++}>hi</button></div>`;

	let btn = el.querySelector('button');
	let elsewhere = document.createElement('div');
	document.body.append(elsewhere);
	elsewhere.append(btn);

	// Bubbles only through elsewhere -> body -> document; no dispatcher on that path.
	btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
	assert.eq(count, 0);

	el.remove();
	elsewhere.remove();
});

Testimony.test('Solarite.delegation.documentOptionStamped', `The 'document' option also covers handlers written by the compiled stamp program (list rows).`, () => {
	let el = document.createElement('div');
	document.body.append(el);
	let hits = [];
	let rows = [1, 2, 3];
	h(el, {eventDelegation: 'document'})`<div>${rows.map(n =>
		h`<p key=${n} onmouseup=${[i => hits.push(i), n]}>row</p>`)}</div>`;

	// Re-parent a stamped row outside the component; its array-form handler must still fire.
	// (mouseup keeps this test's document dispatcher independent of the other two tests'.)
	let p = el.querySelectorAll('p')[1];
	let elsewhere = document.createElement('div');
	document.body.append(elsewhere);
	elsewhere.append(p);
	p.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
	assert.eq(hits.length, 1);
	assert.eq(hits[0], 2);

	el.remove();
	elsewhere.remove();
});

Testimony.test('Solarite.delegation.nested', `Nested components each delegate without double-firing.`, () => {
	let outer = 0, inner = 0;

	class D90Inner extends Solarite {
		render() {
			h(this)`<d-90-inner><button onclick=${() => inner++}>inner</button></d-90-inner>`;
		}
	}
	D90Inner.define();

	class D90Outer extends Solarite {
		render() {
			h(this)`<d-90-outer onclick=${() => outer++}><d-90-inner></d-90-inner></d-90-outer>`;
		}
	}
	D90Outer.define();

	let a = new D90Outer();
	document.body.append(a);

	a.querySelector('button').dispatchEvent(new MouseEvent('click', {bubbles: true}));
	assert.eq(inner, 1); // Inner handler fires exactly once, not twice.
	assert.eq(outer, 1); // Outer handler also fires once as the click bubbles up.

	a.remove();
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

		render(attribs=null, changed=true) {
			if (attribs)
				this.attribs = attribs;

			h(this)`<c-500>${this.attribs.name}:${this.attribs.rows.join('|')}</c-500>`;
			render++;
			isChanged = changed;
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

		render(attribs={}, changed=true) {
			//console.log('render', attribs);
			h(this)`<b-504>${attribs.name}:${attribs.rows.join('|')}</b-504>`;
			render++;
			isChanged = changed;
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
		render(attribs={}, changed=true) {
			h(this)`<b-506>${attribs.name}</b-506>`;
			isChanged = changed;
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

Testimony.test('Solarite.component.changedFlag', `The changed argument to render() detects deep mutations.`, () => {
	let lastChanged;

	class B545 extends HTMLElement {
		render(attribs=null, changed=true) {
			lastChanged = changed;
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

	// Delegated handlers ride on per-node expandos; detach/reattach must not lose them.
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
