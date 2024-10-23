// noinspection DuplicatedCode

// Broken tests will be annotated with FIXME

import {camelToDashes, htmlContext} from "../src/solarite/Util.js";
//import {watchGet, watchSet} from "../src/solarite/watch.js";

import {Solarite, r, getArg, renderWatched} from '../src/solarite/Solarite.js';
//import {Solarite, r, getArg} from '../dist/Solarite.min.js'; // This will help the Benchmark test warm up.
//import {watch} from "../src/solarite/watch2.js";
import watch from "../src/solarite/watch3.js";
//import NodeGroupManager from "../src/solarite/NodeGroupManager.js";
import NodeGroup from "../src/solarite/NodeGroup.js";
import Template from "../src/solarite/Template.js";
import Shell from "../src/solarite/Shell.js";

import Testimony, {assert} from './Testimony.js';
import Globals from "../src/solarite/Globals.js";

// This function is used by the various tests.
window.getHtml = (item, includeComments=false) => {
	if (!item)
		return item;

	if (item.fragment)
		item = item.fragment; // Shell
	if (item instanceof DocumentFragment)
		item = [...item.childNodes]

	else if (item.getNodes)
		item = item.getNodes()

	let result;
	if (Array.isArray(item)) {
		if (!includeComments)
			item = item.filter(n => n.nodeType !==8)

		result = item.map(n => n.nodeType === 8 ? `<!--${n.textContent}-->` : n.outerHTML || n.textContent).join('|');
	}
	else
		result = item.outerHTML || item.textContent

	if (!includeComments)
		result = result.replace(/(<)!--(.*?)-->/g, '')

	// Remove whitespace between tags, so we can write simpler tests.
	return result.replace(/^\s+</g, '<').replace(/>\s+</g, '><').replace(/>\s+$/g, '>');
}



//<editor-fold desc="shell">
/* ┌─────────────────╮
 * | Shell           |
 * └─────────────────╯*/
Testimony.test('Solarite.Shell.empty', () => {
	let shell = new Shell(['', ''])
	assert.eq(getHtml(shell, true), '<!--ExprPath:0-->|<!--ExprPathEnd:0-->')
});

Testimony.test('Solarite.Shell.paragraph', () => {
	let shell = new Shell(['<p>', '</p>'])
	assert.eq(getHtml(shell, true), '<p><!--ExprPath:0--><!--ExprPathEnd:0--></p>')
});

Testimony.test('Solarite.Shell.nodeBefore', () => {
	let shell = new Shell(['a', ''])
	assert.eq(getHtml(shell, true), 'a|<!--ExprPathEnd:0-->')
});

Testimony.test('Solarite.Shell.nodeAfter', () => {
	let shell = new Shell(['', 'b'])
	assert.eq(getHtml(shell, true), '<!--ExprPath:0-->|b')
});

Testimony.test('Solarite.Shell.nodeBeforeAfter', () => {
	let shell = new Shell(['a', 'b'])
	assert.eq(getHtml(shell, true), 'a|b')
});

Testimony.test('Solarite.Shell.emptyTwoPaths', () => {
	let shell = new Shell(['', '', ''])
	assert.eq(getHtml(shell, true), '<!--ExprPath:0-->|<!--ExprPathEnd:0-->|<!--ExprPathEnd:1-->')
});

Testimony.test('Solarite.Shell.nodeBetweenPaths', () => {
	let shell = new Shell(['', 'a', ''])
	assert.eq(getHtml(shell, true), '<!--ExprPath:0-->|a|<!--ExprPathEnd:1-->')
});

Testimony.test('Solarite.Shell.nodesAroundPaths', () => {
	let shell = new Shell(['a', 'b', 'c'])
	assert.eq(getHtml(shell, true), 'a|b|c')
});

Testimony.test('Solarite.Shell.emptyTwoPathsNested', () => {
	let shell = new Shell(['<p>', '', '</p>'])
	assert.eq(getHtml(shell, true), '<p><!--ExprPath:0--><!--ExprPathEnd:0--><!--ExprPathEnd:1--></p>')
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



//</editor-fold>



//<editor-fold desc="nodegroup">
/* ┌─────────────────╮
 * | NodeGroup       |
 * └─────────────────╯*/
Testimony.test('Solarite.NodeGroup.empty', () => {

	let ng = new NodeGroup(new Template([``], []))
	assert.eq(getHtml(ng), '')

	ng.applyExprs([])
	assert.eq(getHtml(ng), '')
});


Testimony.test('Solarite.NodeGroup.oneExpr', () => {

	let ng = new NodeGroup(new Template([``, ``], ['1']))
	assert.eq(getHtml(ng), '1')

	ng.applyExprs([2])
	assert.eq(getHtml(ng), '2')

	ng.applyExprs([[3, 4, 5]])
	assert.eq(getHtml(ng), '3|4|5')
});

Testimony.test('Solarite.NodeGroup.emptyAdjacent', () => {
	let ng = new NodeGroup(new Template([``, ``, ``], ['1', '2']))
	ng.verify();

	assert.eq(getHtml(ng), '1|2')

	ng.applyExprs([3, 4])
	assert.eq(getHtml(ng), '3|4')

	ng.applyExprs([[1, 2, 3], [4, 5, 6]])
	assert.eq(getHtml(ng), '1|2|3|4|5|6')
});


Testimony.test('Solarite.NodeGroup.paragraph', () => {
	let ng = new NodeGroup(new Template(['<p>', '</p>'], ['1']))
	assert.eq(getHtml(ng), '<p>1</p>')

	ng.applyExprs([2])
	assert.eq(getHtml(ng), '<p>2</p>')

	ng.applyExprs([[3, 4, 5]])
	assert.eq(getHtml(ng), '<p>345</p>')
});

Testimony.test('Solarite.NodeGroup.node', () => {
	let a = r('<p>a</p>')
	let b = r('<p>b</p>')
	let ng = new NodeGroup(new Template(['<div>', '</div>'], [a]))

	assert.eq(getHtml(ng), '<div><p>a</p></div>')

	ng.applyExprs([b]);
	assert.eq(getHtml(ng), '<div><p>b</p></div>')

	ng.applyExprs([1]);
	assert.eq(getHtml(ng), '<div>1</div>')

	ng.applyExprs([a]);
	assert.eq(getHtml(ng), '<div><p>a</p></div>')
});

Testimony.test('Solarite.NodeGroup._nodeSwap', () => {
	let a = r('<p>a</p>')
	let b = r('<p>b</p>')
	let ng = new NodeGroup(new Template(['<div>', '', '</div>'], [a, b]))
	document.body.append(ng.startNode)

	assert.eq(getHtml(ng), '<div><p>a</p><p>b</p></div>')

	ng.applyExprs([b, a]);
	assert.eq(getHtml(ng), '<div><p>b</p><p>a</p></div>');
});


Testimony.test('Solarite.NodeGroup.arrayReverse', () => {
	let list = [r('a'), r('b')];

	let ng = new NodeGroup(new Template(['<div>', '</div>'], [list]))
	ng.verify();
	assert(getHtml(ng), '<div>ab</div')

	list.reverse();
	ng.applyExprs([list])
	assert(getHtml(ng), '<div>ba</div')
});
//</editor-fold>



//<editor-fold desc="util">
/* ┌─────────────────╮
 * | Util            |
 * └─────────────────╯*/

Testimony.test('Solarite.Util.htmlContext', () => {
	assert.eq(htmlContext('<div class="test'), htmlContext.Attribute)
	assert.eq(htmlContext('">hello '), htmlContext.Text);
	assert.eq(htmlContext('<span data-attr="hi > there"'), htmlContext.Tag);
	assert.eq(htmlContext(` attr='`), htmlContext.Attribute);
	assert.eq(htmlContext(`'`), htmlContext.Tag);
	assert.eq(htmlContext(' attr='), htmlContext.Attribute);
	assert.eq(htmlContext('a'), htmlContext.Attribute);
	assert.eq(htmlContext(' '), htmlContext.Tag);
	assert.eq(htmlContext(' attr='), htmlContext.Attribute);
	assert.eq(htmlContext('>'), htmlContext.Text);
});

Testimony.test('Solarite.Util.camelToDashes', () => {
	assert.eq(camelToDashes('ProperName'), 'proper-name');
	assert.eq(camelToDashes('HTMLElement'), 'html-element');
	assert.eq(camelToDashes('BigUI'), 'big-ui');
	assert.eq(camelToDashes('UIForm'), 'ui-form');
	assert.eq(camelToDashes('A100'), 'a-100');
});
//</editor-fold>



//<editor-fold desc="basic">
/* ┌─────────────────╮
 * | Basic           |
 * └─────────────────╯*/
Testimony.test('Solarite.basic.empty', () => {
	class A extends HTMLElement {
		constructor() {
			super();
			this.render();
		}

		render() {
			r(this)``
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
            this.html = r`<r-11></r-11>`
        }
    }
    R11.define();

    let a = r(`<r-11 title="Hello"></r-11>`);
    assert.eq(a.outerHTML, `<r-11 title="Hello"></r-11>`);
});



Testimony.test('Solarite.basic.text', () => {
	class A extends Solarite {
		render() {
			r(this)`Here's Solarite &lt;Component&gt;` // apostophe, <>, and and unicode.
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
			r(this)`Solarite Component`
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
			this.html = r`<r-30 title="Hello">World</r-30>`
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
			this.html = r`<div>Hello!</div>`
		}
	}
	R35.define();

	let a = document.createElement('r-35');

	assert.eq(getHtml(a), `<r-35></r-35>`); // Not rendered yet.
	assert(a instanceof Solarite);

	a.render();
	assert.eq(getHtml(a), `<r-35><div>Hello!</div></r-35>`);
});
//</editor-fold>



//<editor-fold desc="expr">
/* ┌─────────────────╮
 * | Expr            |
 * └─────────────────╯*/
Testimony.test('Solarite.expr.staticString', () => {
	class R40 extends HTMLElement {
		render() {
			r(this)`Solarite ${'Test'} Component`
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
			r(this)`This text is ${r(`<b>Bold</b>`)}!`
		}
	}
	A.define('r-42');

	let a = new A();
	assert.eq(getHtml(a), '<r-42>This text is <b>Bold</b>!</r-42>');
});

Testimony.test('Solarite.expr.table', () => {

	class R43 extends Solarite {
		constructor() {
			super();
			this.render();
		}

		render() {
			r(this)`<table><tr>${r(`<td>Table Cell</td>`)}</tr></table>`
		}
	}
	let a = new R43();

	assert.eq(getHtml(a), `<r-43><table><tbody><tr><td>Table Cell</td></tr></tbody></table></r-43>`)
});


Testimony.test('Solarite.expr.documentFragment', () => {

	class R44 extends Solarite {
		render() {
			r(this)`This text is ${r(`<b>Bold</b><i>Italic</i>`)}!`
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
			r(this)`${this.valueless}` // Make sure it renders undefined as ''
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
			r(this)`Solarite ${123} Component`
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
			r(this)`${new Date('2010-02-01 00:00:00').getUTCFullYear()}`
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
			r(this)`Items: ${[1, 2, 3]}`
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
			r(this)`${this.fruits}`
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
			r(this)`${this.fruits}`
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
			r(this)`${this.fruits}${this.pets}`
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
			r(this)`Items: ${() => [1, 2, 3]}`
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
			r(this)`Field: ${document.createElement('input')}`
		}
	}
	customElements.define('r-74', A);

	let a = new A();
	assert.eq(getHtml(a), '<r-74>Field: <input></r-74>');
});

Testimony.test('Solarite.expr.varText', () => {
	class A extends Solarite {
		value = 'Apple';

		render() { r(this)`The fruit is ${this.value}!` }
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
			this.html = r`The fruit is ${this.value.name}!`
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
//</editor-fold>



//<editor-fold desc="loop">
/* ┌─────────────────╮
 * | Loop            |
 * └─────────────────╯*/
Testimony.test('Solarite.loop.strings', () => {
	class A extends Solarite {
		fruits = ['Apple', 'Banana'];

		render() {
			r(this)`${this.fruits.map(fruit => fruit)}`
		}
	}
	customElements.define('r-200', A);
	let a = new A();

	a.render();
	assert.eq(getHtml(a), '<r-200>AppleBanana</r-200>');

	a.fruits.push('Cherry');
	a.render();
	assert.eq(getHtml(a), '<r-200>AppleBananaCherry</r-200>');

	a.fruits.pop();
	a.render();
	assert.eq(getHtml(a), '<r-200>AppleBanana</r-200>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-200>Banana</r-200>');

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), '<r-200></r-200>');

	a.fruits.push('Apple');
	a.render();
	assert.eq(getHtml(a), '<r-200>Apple</r-200>');
});

Testimony.test('Solarite.loop.paragraphs', () => {
	class A extends Solarite {
		fruits = ['Apple', 'Banana'];

		render() {
			r(this)`${this.fruits.map(fruit => r`<p>${fruit}</p>`)}`
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
			r(this)`${this.fruits.map(fruit => r`<p>${fruit}</p>`)}<hr>`
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
			r(this)`${this.fruits.map(fruit => r`<p>${fruit}</p>`)}`
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
			r(this)`
			<a-214>
				${this.items.map(item => r`
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

Testimony.test('Solarite.loop.eventBindings', async () => {
	await new Promise((resolve, reject) => { // TODO: This doesn't need to be async?
		let callCount = 0;

		class R215 extends Solarite {
			fruits = ['Apple', 'Banana'];

			checkFruit(fruit, i) {
				assert.eq(i, 0)

				callCount++;
				if (callCount===2)
					resolve();
			}

			render() {
				this.html = r`${this.fruits.map((fruit, i) => r`<p onclick="${() => this.checkFruit(fruit, i)}">${fruit}</p>`)}`
			}
		}

		let a = new R215();
		document.body.append(a);
		a.firstElementChild.dispatchEvent(new MouseEvent('click'))

		a.fruits.shift();
		a.render();
		a.firstElementChild.dispatchEvent(new MouseEvent('click'))


		a.remove();
	});

});

// TODO: Why is this called pathCache?  What does it test?
Testimony.test('Solarite.loop.pathCache', () => {

	class R216 extends Solarite {
		pets = ['Cat'];
		fruits = ['Apple', 'Banana'];

		render() {
			r(this)`${this.pets.map(pet =>
				r`${this.fruits.map(fruit =>
					r`<p>Item</p>`
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
			r(this)`${this.pets.map(pet =>
				r`${this.fruits.map(fruit =>
					r`<p>${pet} eats ${fruit}</p>`
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
			r(this)`${this.pets.map(pet =>
				r`<div>${this.fruits.map(fruit =>
					r`<p>${pet} eats ${fruit}</p>`
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
			r(this)`${this.fruitGroups.map(fruitGroup =>
				r`<div>${fruitGroup.map(fruit =>
					r`<span>${fruit}</span>`
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
			this.html = r`
				<div>${this.fruits1.map(fruit => r`<span>${fruit}</span>`)}</div>
				<div>${this.fruits2.map(fruit => r`<span>${fruit}</span>`)}</div>`
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
	//window.debug = true;
	a.render();
	
	window.verify = false;
	a.remove();
});

Testimony.test('Solarite.loop.nested5', () => {
	
	// This test was originally created by reducing a failure in production code
	// to the simplest version.
	// The problem was that NodeGroupManager.findAndDeleteClose() was trying to
	// delete the old exactKey, but it didn't exist because it had already been assigned.
	// Commenting out the assert() fixed the problem.
	
	// v could also be a function to trigger this same test.
	// Since functions are new on each render().
	let v = 'F1';
	
	class A227 extends Solarite {
		boxes = [
			["A"],
			["A", "B"]
		]
		
		render() {
			r(this)`
			<a-227>${this.boxes.map(item =>
				r`${item.map(item2 =>
					r`<div title=${v}>${item2}</div>`
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
	
	assert.eq(a.outerHTML, `<a-227><!--ExprPath:0--><!--ExprPath:0--><div title="F2"><!--ExprPath:1-->A<!--ExprPathEnd:1--></div><div title="F2"><!--ExprPath:1-->B<!--ExprPathEnd:1--></div><!--ExprPathEnd:0--><!--ExprPath:0--><div title="F2"><!--ExprPath:1-->A<!--ExprPathEnd:1--></div><!--ExprPathEnd:0--><!--ExprPathEnd:0--></a-227>`);
	
	window.verify = false;
	a.remove();
});

Testimony.test('Solarite.loop.nestedConditional', () => {

	let isGoodBoy = true;

	class R227 extends Solarite {
		pets = ['Cat', 'Dog'];
		fruits = ['Apple', 'Banana'];

		render() {
			r(this)`${this.pets.map(pet =>
				r`${this.fruits.map(fruit =>
					isGoodBoy 
						? r`<p>${pet} prepares ${fruit}</p>`
						: r`<p>${pet} eats ${fruit}</p>`
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
			this.html =
				r`${this.pets.map(pet =>
					pet.activities.map(activity =>
						activity.length >= 5
							? r`<p>${pet.name} will ${activity}.</p>`
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

//import {hashReset} from "../src/solarite/hash.js";

Testimony.test('Solarite.loop.tripleNested', 'Triple nested grid', () => {

	Globals.reset();

	class R250 extends Solarite {
		rows = [[[0]]];

		render() {
			r(this)`${this.rows.map(row =>
				r`${row.map(items =>
					r`${items.map(item =>
						r`${item}`
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
	let p1 = r('<p>1</p')
	let p2 = r('<p>2</p')
	let p3 = r('<p>3</p')
	let p4 = r('<p>4</p')
	let p5 = r('<p>5</p')
	let p6 = r('<p>6</p')
	let p7 = r('<p>7</p')
	let p8 = r('<p>8</p')

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

//</editor-fold>




//<editor-fold desc="embed">
/* ┌─────────────────╮
 * | Embed            |
 * └─────────────────╯*/

Testimony.test('Solarite.embed.styleStatic', () => {
	let count = 0;

	class R300 extends Solarite {
		render() {
			this.html = r`
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

	assert.eq(a.querySelector('style').textContent.trim(), `r-300[data-style="1"] { color: blue }`)

	// Make sure styleid isn't incremented on render.
	count++;
	a.render();
	assert.eq(a.querySelector('style').textContent.trim(), `r-300[data-style="1"] { color: blue }`)

	a.remove();
});

Testimony.test('Solarite.embed.optionsNoStyles', () => {
	let count = 0;

	class R310 extends Solarite {
		render() {
			let options = {styles: false};
			r(this, options)`
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
			this.html = r`
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
			this.html = r`
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
	let style1 = r`<style>:host { color: green }</style>`

	class R325 extends Solarite {
		render() {
			this.html = r`${style1}Text.`;
		}
	}

	let a = new R325();
	document.body.append(a);
	assert.eq(getHtml(a), `<r-325 data-style="1"><style>r-325[data-style="1"] { color: green }</style>Text.</r-325>`)

	style1 = r`<style>:host { color: orangered }</style>`
	a.render();
	assert.eq(getHtml(a), `<r-325 data-style="1"><style>r-325[data-style="1"] { color: orangered }</style>Text.</r-325>`)

	a.remove();
});

Testimony.test('Solarite.embed.svg', () => {
	class R330 extends Solarite {
		render() {
			this.html = r`
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

Testimony.test('Solarite.embed.scriptStatic', () => {
	window.scriptStaticCount = 1;
	class R340 extends Solarite {
		render() {
			this.html = r`
				<div>
					<script>
						window.scriptStaticCount = 1;
					</script>
				</div>
			`;
		}
	}

	let a = new R340();
	a.render();
	assert.eq(window.scriptStaticCount, 1);

	// Hasn't changed. Make sure it's nto re-run.
	a.render();
	assert.eq(window.scriptStaticCount, 1);

	delete window.scriptStaticCount;
});

// This feature is disabled because it doesn't seem useful.
Testimony.test('Solarite.embed._scriptDynamic', () => {

	let val = 1;
	class R350 extends Solarite {
		render() {
			this.html = r`
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

//</editor-fold>




//<editor-fold desc="attrib">
/* ┌─────────────────╮
 * | Attrib          |
 * └─────────────────╯*/

Testimony.test('Solarite.attrib.single', () => {

	let val = 'one';

	class R400 extends Solarite {
		render() {
			this.html = r`<div class="${val}">${val}</div>`;
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
			this.html = r`<div class="before ${val} after">${val}</div>`;
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

Testimony.test('Solarite.attrib.double', () => {

	let val1 = 'one';
	let val2 = 'two';

	class R420 extends Solarite {
		render() {
			this.html = r`<div class="${val1}${val2}">${val1}</div>`;
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
			this.html = r`<div class="a ${val1} b ${val2} c">${val1}</div>`;
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

Testimony.test('Solarite.attrib.doubleAndText', () => {

	let val1 = 'one';
	let val2 = 'two';

	class R430 extends Solarite {
		render() {
			this.html = r`<div class="a ${val1} b ${val2} c">${val1}</div>`;
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

Testimony.test('Solarite.attrib.sparse', () => {

	let isEdit = false;

	class R440 extends Solarite {
		render() {
			this.html = r`<div ${isEdit && 'contenteditable'}>${isEdit && 'Editable!'}</div>`;
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

	let isEdit = false;

	class R450 extends Solarite {
		render() {
			this.html = r`<div ${isEdit && 'contenteditable spellcheck="false"'}>${isEdit && 'Editable!'}</div>`;
		}
	}

	let a = new R450();
	a.render();
	assert.eq(getHtml(a), `<r-450><div></div></r-450>`)

	isEdit = true
	a.render();
	assert.eq(getHtml(a), `<r-450><div contenteditable="" spellcheck="false">Editable!</div></r-450>`)

	isEdit = false
	a.render();
	assert.eq(getHtml(a), `<r-450><div></div></r-450>`)
});

Testimony.test('Solarite.attrib.toggle', () => {

	let isEdit = false;

	class R460 extends Solarite {
		render() {
			this.html = r`<div contenteditable=${isEdit}>${isEdit && 'Editable!'}</div>`;
		}
	}

	let a = new R460();
	a.render();
	assert.eq(getHtml(a), `<r-460><div></div></r-460>`)

	isEdit = true
	a.render();
	assert.eq(getHtml(a), `<r-460><div contenteditable="">Editable!</div></r-460>`)

	isEdit = false
	a.render();
	assert.eq(getHtml(a), `<r-460><div></div></r-460>`)
});

Testimony.test('Solarite.attrib.pseudoRoot', () => {
	let title = 'Hello'
	class R470 extends Solarite {
		render() {
			r(this)`<r-470 title="${title}">World</r-470>`
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
			this.html = r`<r-472 title="${title}" style="color: red">World</r-472>`
		}
	}
	R472.define();

	let b = r(`<r-472 style="color: green"></r-472>`);
	document.body.append(b);
	assert.eq(b.outerHTML, `<r-472 style="color: green" title="Hello">World</r-472>`);
	b.remove();
	

});

Testimony.test('Solarite.attrib.pseudoRoot3', 'Dynamic attribute overrides.', () => {
	let title = 'Hello'
	class R473 extends Solarite {
		render() {
			this.html = r`<r-473 title="${title}" style="color: red">World</r-473>`
		}
	}
	R473.define();


	let a = r(`<r-473 title="Goodbye"></r-473>`);
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
			this.html = r`
				<r-474><button ${'class="primary"'} onclick=${e => {}}>${button}</button></r-474>`
		}
	}

	let a = new R474();
	a.render();

	assert.eq(getHtml(a), `<r-474><button onclick="" class="primary">Hello</button></r-474>`);
});

Testimony.test('Solarite.attrib.ids1', () => {
	class R500 extends Solarite {
		one;
		render() {
			r(this)`<div data-id="one"></div>`;
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
			r(this)`<div data-id="one"><p id="two"></p></div>`;
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
			r(this)`<div data-id="one"><p id="path.to.p"></p></div>`;
		}
	}

	let a = new R520();
	a.render();

	assert(a.one.tagName === 'DIV')
	assert(a.path.to.p.tagName === 'P')
});
//</editor-fold>




//<editor-fold desc="comments">
/* ┌─────────────────╮
 * | comments        |
 * └─────────────────╯*/
Testimony.test('Solarite.comments.one', () => {
	
	class A480 extends Solarite {
		render() {
			this.html = r`
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
			this.html = r`<div><!--${1} ${2}-->${3}</div>`
		}
	}
	let a = new A482();
	
	a.render();
	assert.eq(getHtml(a), `<a-482><div>3</div></a-482>`)
	a.remove();
});
//</editor-fold>




//<editor-fold desc="r">
/* ┌─────────────────╮
 * | r               |
 * └─────────────────╯*/
Testimony.test('Solarite.r.staticElement', () => {
	let button = r(`<button>hi</button>`);
	assert(button instanceof HTMLElement); // Not a DocumentFragment
	assert.eq(getHtml(button), `<button>hi</button>`)
})

Testimony.test('Solarite.r.staticElement2', () => {
	let button = r(`
		<button>hi</button>`);
	assert(button instanceof HTMLElement); // Not a DocumentFragment
	assert.eq(getHtml(button), `<button>hi</button>`)
})

Testimony.test('Solarite.r.staticElement3', () => {
	let button = r(` <!-- comment -->
		<button>hi</button>`);
	assert(button instanceof HTMLElement); // Not a DocumentFragment
	assert.eq(getHtml(button), `<button>hi</button>`)
})

Testimony.test('Solarite.r.staticElement4', () => {
	let button = r(` Hello`);
	assert(button instanceof Text);
	assert.eq(getHtml(button), ` Hello`)
})

Testimony.test('Solarite.r.staticElement5', () => {
	let button = r(` <!--comment--> Hello`);
	assert(button instanceof Text);
	assert.eq(getHtml(button), ` Hello`)
})

Testimony.test('Solarite.r.fragment', () => {
	let fragment = r(`Hello <button>hi</button>`);
	assert(fragment instanceof DocumentFragment);
	assert.eq(getHtml(fragment), `Hello |<button>hi</button>`)
});

Testimony.test('Solarite.r.fragment2', () => {
	let fragment = r()`Hello <button>hi</button>`;
	assert(fragment instanceof DocumentFragment);
	assert.eq(getHtml(fragment), `Hello |<button>hi</button>`)
});

Testimony.test('Solarite.r.staticElement3', () => {
	let button = r()`<button>hi</button>`;
	assert(button instanceof HTMLElement);
	assert.eq(getHtml(button), `<button>hi</button>`)
});

Testimony.test('Solarite.r.staticElement4', () => {
	// with line return
	let button = r()`
		<button>hi</button>`;
	assert(button instanceof HTMLElement);
	assert.eq(getHtml(button), `<button>hi</button>`)
})

Testimony.test('Solarite.r.element', () => {
	let adjective = 'better'
	let button = r()`<button>I'm a <b>${adjective}</b> button</button>`;
	
	assert.eq(getHtml(button), `<button>I'm a <b>better</b> button</button>`)
})

Testimony.test('Solarite.r.standalone1', () => {
	let button = r({
		count: 0,

		inc() {
			this.count++;
			this.render();
		},

		render() {
			r(this)`<button onclick=${this.inc}>I've been clicked ${this.count} times.</button>`
		}
	});
	//document.body.append(button);

	assert.eq(getHtml(button), `<button onclick="">I've been clicked 0 times.</button>`)

	button.inc();
	assert.eq(getHtml(button), `<button onclick="">I've been clicked 1 times.</button>`);

	button.dispatchEvent(new MouseEvent('click'));
	assert.eq(getHtml(button), `<button onclick="">I've been clicked 2 times.</button>`);

	//button.remove();
});

Testimony.test('Solarite.r.standalone2', () => {
	let list = r({
		items: [],

		add() {
			this.items.push('Item ' + this.items.length);
			this.render();
		},

		render() {
			r(this)`
			<div>
	            <button onclick=${this.add}>Add Item</button>
	            <hr>
	            ${this.items.map(item => r`
	                <p>${item}</p>
	            `)}
	        </div>`
		}
	});

	//document.body.append(list);

	assert.eq(getHtml(list), `<div><button onclick="">Add Item</button><hr></div>`);

	// At one point, rendering a standalone component the first time would re-render everything.
	// Here we make sure the hr element doesn't come back.
	list.querySelector('hr').remove();
	list.render();

	assert.eq(getHtml(list), `<div><button onclick="">Add Item</button></div>`);

	list.add();
	assert.eq(getHtml(list), `<div><button onclick="">Add Item</button><p>Item 0</p></div>`);

	list.querySelector('button').dispatchEvent(new MouseEvent('click'));
	assert.eq(getHtml(list), `<div><button onclick="">Add Item</button><p>Item 0</p><p>Item 1</p></div>`);

	//button.remove();
});

Testimony.test('Solarite.r.standaloneId', "Test id's on standalone elmenets.", () => {
	let list = r({
		items: [],

		add() {
			this.items.push('Item ' + this.items.length);
			this.render();
		},

		render() {
			r(this)`
			<div>
			   <button data-id="button" onclick=${this.add}>Add Item</button>
			</div>`
		}
	});

	assert.eq(list.button.tagName, 'BUTTON');
});

Testimony.test('Solarite.r.standaloneStyle', "Test id's on standalone elmenets.", () => {
	let box = r({
		render() {
			r(this)`
			<div>
	         <style>:host { display: block; background: red; width: 20px; height: 20px }</style>      
	      </div>`
		}
	});

	let styleId = box.getAttribute('data-style');
	assert.eq(box.firstElementChild.textContent, `div[data-style="${styleId}"] { display: block; background: red; width: 20px; height: 20px }`);
});

Testimony.test('Solarite.r.standalone3', () => {

	// Make sure a div inside a div doesn't replace the parent div.
	let list = r({
		items: [],

		render() {
			r(this)`
			<div>
				${this.items.map(item => r`
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

	assert.eq(getHtml(list), `<div><div><input placeholder="Name" value="name"><input type="number" value="2"><button onclick="">x</button></div></div>`);
});

Testimony.test('Solarite.r.standaloneChild', () => {

	function createItem(item) {
		return r({
			item: item,
			render(attribs = null) {
				// If attributes passed to constructor have changed.
				if (attribs)
					this.item = attribs.item;
				r(this)`
				<div>
				   <b>${this.item.name}</b> - ${this.item.description}<br>
				</div>`
			}
		});
	}

	function createList(items) {
		return r({
			items: items,
			render() {
				r(this)`
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
//</editor-fold>




//<editor-fold desc="component">
/* ┌─────────────────╮
 * | Component       |
 * └─────────────────╯*/
Testimony.test('Solarite.component.tr', () => {

	class TR510 extends Solarite('tr') {
		render() {
			this.html = r`<td>hello</td>`
		}
	}

	let table = document.createElement('table')

	table.append(new TR510())
	document.body.append(table)

	assert.eq(table.outerHTML, `<table><tr is="tr-510"><td>hello</td></tr></table>`)

	table.remove();

});

Testimony.test('Solarite.component.staticAttribs', () => {
	// Note that all attribs become lowercase.
	// Not sure how to prevent this w/o using an xml doctype.
	class B512 extends Solarite {
		constructor({name, userid}={}) {
			super();
			this.name = name;
			this.userId = userid;
		}
		
		render() {
			this.html = r`<b-512>${this.name} | ${this.userId}</b-512>`
		}
	}
	B512.define();
	
	class A512 extends Solarite {
		render() {
			this.html = r`<div><b-512 name="User" userId="2"></b-512></div>`;
		}
	}
	A512.define();
	
	let a = new A512();
	a.render();
	
	assert.eq(a.outerHTML, `<a-512><div><b-512 name="User" userid="2"><!--ExprPath:0-->User | 2<!--ExprPathEnd:1--></b-512></div></a-512>`);
});

Testimony.test('Solarite.component.dynamicAttribs', 'Attribs specified via ${...}', () => {
	
	class B513 extends Solarite {
		constructor({name, userid}={}) {
			super();
			this.name = name;
			this.userId = userid;
		}
		
		render() {
			this.html = r`<b-513>${this.name} | ${this.userId}</b-513>`
		}
	}
	B513.define();
	
	class A513 extends Solarite {
		render() {
			this.html = r`<div><b-513 name="${'User'}" userId="${2}"></b-513></div>`;
		}
	}
	A513.define();
	
	let a = new A513();
	a.render();
	
	assert.eq(a.outerHTML, `<a-513><div><b-513 name="User" userid="2"><!--ExprPath:0-->User | 2<!--ExprPathEnd:1--></b-513></div></a-513>`);
});

Testimony.test('Solarite.component.getArg', 'Attribs specified html when not nested in another Solarite component.', () => {

	class B514 extends Solarite {
		constructor({name, userid}={}) {
			super();

			this.name = getArg(this, 'name', name);
			this.userId = getArg(this, 'userid', userid);
			this.render();
		}
		
		render() {
			this.html = r`<b-514>${this.name} | ${this.userId}</b-514>`
		}
	}
	B514.define();
	

	let div = document.createElement('div');
	div.innerHTML = `<b-514 name="User" userid="2"></b-514>`

	assert.eq(div.outerHTML, `<div><b-514 name="User" userid="2"><!--ExprPath:0-->User | 2<!--ExprPathEnd:1--></b-514></div>`)
	
});

Testimony.test('Solarite.component.nested', () => {

	let bRenderCount = 0;

	class B515 extends Solarite {
		render() {
			this.html = r`<div>B</div>`;
			bRenderCount++;
		}
	}
	B515.define();


	class A515 extends Solarite {
		render() {
			this.html =
				r`<b-515></b-515>`
		}
	}

	let a = new A515();
	assert(!(a.firstChild instanceof B515))

	a.render();
   assert(a.firstChild instanceof B515);
	assert.eq(getHtml(a), `<a-515><b-515><div>B</div></b-515></a-515>`);
})

// Pass an object to the child.
Testimony.test('Solarite.component.nested2', () => {

	let bRenderCount = 0;
	class B520 extends Solarite {

		constructor({user}={}) {
			super();
			this.user = user;
		}

		render(props={}) {
			if (props.user)
				this.user = props.user;
			this.html = r`<div>Name:</div><div>${this.user.name}</div><div>Email:</div><div>${this.user.email}</div>`;
			bRenderCount++;
		}

	}
	B520.define();

	class A520 extends Solarite {
		title = 'Users'
		user = {name: 'John', email: 'john@example.com'};
		render() {
			r(this)`${this.title}<b-520 user="${this.user}"></b-520>`
		}
	}

	let a = new A520();
	document.body.append(a);
	assert.eq(getHtml(a), `<a-520>Users<b-520 user=""><div>Name:</div><div>John</div><div>Email:</div><div>john@example.com</div></b-520></a-520>`)


	a.user = {name: 'Fred', email: 'fred@example.com'};
	a.render();
	assert.eq(getHtml(a), `<a-520>Users<b-520 user=""><div>Name:</div><div>Fred</div><div>Email:</div><div>fred@example.com</div></b-520></a-520>`)


	a.user.name = 'Barry'
	a.render();
	assert.eq(getHtml(a), `<a-520>Users<b-520 user=""><div>Name:</div><div>Barry</div><div>Email:</div><div>fred@example.com</div></b-520></a-520>`)

	bRenderCount = 0
	a.render();
	assert.eq(bRenderCount, 0)

	a.title = 'Users2'
	a.render();
	assert.eq(getHtml(a), `<a-520>Users2<b-520 user=""><div>Name:</div><div>Barry</div><div>Email:</div><div>fred@example.com</div></b-520></a-520>`)
	assert.eq(bRenderCount, 0); // Value passed to b didn't change, so it shouldn't re-render.

	a.remove();
});

// Pass an object to the child.
Testimony.test('Solarite.component.nestedNonSolarite', () => {

	let bRenderCount = 0;
	class B530 extends HTMLElement {

		constructor({user}={}) {
			super();
			this.user = user;
			this.render();
		}

		render(props={}) {
			if (props.user)
				this.user = props.user;
			r(this)`<div>Name:</div><div>${this.user.name}</div><div>Email:</div><div>${this.user.email}</div>`;
			bRenderCount++;
		}
	}
	customElements.define('b-530', B530);

	class A530 extends HTMLElement {
		title = 'Users'
		user = {name: 'John', email: 'john@example.com'};
		render() {
			r(this)`${this.title}<b-530 user="${this.user}"></b-530>`
		}
	}
	customElements.define('a-530', A530);

	let a = new A530();
	a.render();
	document.body.append(a);
	assert.eq(getHtml(a), `<a-530>Users<b-530 user=""><div>Name:</div><div>John</div><div>Email:</div><div>john@example.com</div></b-530></a-530>`)


	a.user = {name: 'Fred', email: 'fred@example.com'};
	a.render();
	assert.eq(getHtml(a), `<a-530>Users<b-530 user=""><div>Name:</div><div>Fred</div><div>Email:</div><div>fred@example.com</div></b-530></a-530>`)


	a.user.name = 'Barry'
	a.render();
	assert.eq(getHtml(a), `<a-530>Users<b-530 user=""><div>Name:</div><div>Barry</div><div>Email:</div><div>fred@example.com</div></b-530></a-530>`)

	bRenderCount = 0
	a.render();
	assert.eq(bRenderCount, 0)

	a.title = 'Users2'
	a.render();
	assert.eq(getHtml(a), `<a-530>Users2<b-530 user=""><div>Name:</div><div>Barry</div><div>Email:</div><div>fred@example.com</div></b-530></a-530>`)
	assert.eq(bRenderCount, 0) // Value passed to b didn't change, so it shouldn't re-render.

	a.remove();
});

// TODO: This redraws every tr on every update.
// Maybe that can be fixed when keying is supported?
Testimony.test('Solarite.component.nestedTrLoop', () => {

	function tableRow(user) {
		let tr = r({
			render() {
				r(this)`<tr><td>${user.name}</td><td>${user.email}</td></tr>`
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
			this.html = r`<table><tbody>${this.users.map(user => tableRow(user))}</tbody></table>`
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

	class TR540 extends Solarite('tr') {
		constructor({user}={}) {
			super();
			this.user = user;
		}

		render() {
			this.html = r`<td>${this.user.name}</td><td>${this.user.email}</td>`
		}
	}
	TR540.define('tr-540');

	class Table540 extends Solarite {

		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'}
		]
		render() {
			this.html = r`<table><tbody>${this.users.map(user => r`<tr is="tr-540" user="${user}"></tr>`)}</tbody></table>`
		}
	}
	let table = new Table540
	document.body.append(table)
	assert.eq(getHtml(table),
		`<table-540><table><tbody>`+
		`<tr is="tr-540" user=""><td>John</td><td>john@example.com</td></tr>` +
		`<tr is="tr-540" user=""><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-540>`)


	table.users[1].name = 'Barry'
	table.render();
	assert.eq(getHtml(table),
		`<table-540><table><tbody>` +
		`<tr is="tr-540" user=""><td>John</td><td>john@example.com</td></tr>` +
		`<tr is="tr-540" user=""><td>Barry</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-540>`)

	table.remove();
});
//</editor-fold>




//<editor-fold desc="slots">
/* ┌─────────────────╮
 * | Slots           |
 * └─────────────────╯*/
Testimony.test('Solarite.slots.basic', () => {

	class S10 extends Solarite {
		render() {
			r(this)`<div>slot content:<slot></slot></div>`
		}
	}
	S10.define();

	let div = r('<div><s-10>test</s-10></div>')
	document.body.append(div);

	assert.eq(div.outerHTML, `<div><s-10><div>slot content:<slot>test</slot></div></s-10></div>`)

	div.remove();
});

Testimony.test('Solarite.slots.named', () => {

	class S20 extends Solarite {
		render() {
			this.html = r`<div>slot content:<slot name="one"></slot><slot></slot><slot name="two"></slot></div>`
		}
	}
	S20.define();

	let div = r('<div><s-20>zero<div slot="one">One</div><div slot="one">One Again</div><div slot="two">Two</div>Three</s-20></div>')
	document.body.append(div);

	assert.eq(div.outerHTML, `<div><s-20><div>slot content:<slot name="one"><div slot="one">One</div><div slot="one">One Again</div></slot><slot>zeroThree</slot><slot name="two"><div slot="two">Two</div></slot></div></s-20></div>`)

	div.remove();
});

Testimony.test('Solarite.slots.slotless', `Add children even when no slots present.`, () => {

	class S30 extends Solarite {
		render() {
			r(this)`<div>child1</div>`
		}
	}
	S30.define();

	let div = r('<div><s-30>child2<br>child4</s-30></div>')
	document.body.append(div);

	assert.eq(div.outerHTML, `<div><s-30><div>child1</div>child2<br>child4</s-30></div>`)

	div.remove();
});
//</editor-fold>




//<editor-fold desc="events">
/* ┌─────────────────╮
 * | Events          |
 * └─────────────────╯*/
Testimony.test('Solarite.events.classic', () => {

	class Ev10 extends Solarite {
		count = 1

		render() {
			this.html = r`<input data-id="input" value=${this.count} oninput="this.count=el.count">`
		}
	}

	let a = new Ev10();
	document.body.append(a);


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
			this.html = r`<input data-id="input" value=${this.count} oninput="${(e, el) => this.assign(el.value)}">`
		}
	}
	Ev20.define();
	
	let a = new Ev20();
	a.render();
	assert.eq(assignCalls, 0);
	a.firstChild.dispatchEvent(new Event('input'));
	assert.eq(assignCalls, 1);
	
	a.render();
	a.firstChild.dispatchEvent(new Event('input'));
	assert.eq(assignCalls, 2);
});

Testimony.test('Solarite.events.args', 'Ensure event function args are received', () => {
	
	class Ev30 extends Solarite {
		count = 0
		
		assign(val) {
			this.count = val;
		}
		
		render() {
			this.html = r`<input data-id="input" value='1' oninput="${(e, el) => this.assign(el.value)}">`
		}
	}
	Ev30.define();
	
	let a = new Ev30();
	a.render();
	a.firstChild.dispatchEvent(new Event('input'));
	assert.eq(a.count, '1');
	
	a.firstChild.value = '2';
	a.firstChild.dispatchEvent(new Event('input'));
	assert.eq(a.count, '2');
});

Testimony.test('Solarite.events.onComponent', 'Event attrib on root component', () => {
	
	class Ev40 extends Solarite {
		count = 0
		
		assign(val) {
			this.count = val;
		}
		
		render() {
			this.html = r`<ev-40 oninput="${(e, el) => this.assign(el.firstChild.value)}"><input data-id="input" value='1'></ev-40>`
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
			r(this)`
			<e-50>				
				<button onclick=${this.addItem}>Add Item</button>
			</e-50>`
		}
	}
	customElements.define('e-50', E50);

	let e = new E50();
	e.querySelector('button').dispatchEvent(new MouseEvent('click'));
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
			r(this)`
			<e-60>				
				${r`<button onclick=${this.addItem}>Add Item</button>`}
			</e-60>`
		}
	}
	customElements.define('e-60', E60);

	let e = new E60();
	e.querySelector('button').dispatchEvent(new MouseEvent('click'));
	assert.eq(e.items.length, 1);
});
//</editor-fold>




//<editor-fold desc="binding">
/* ┌─────────────────╮
 * | Binding         |
 * └─────────────────╯*/
Testimony.test('Solarite.binding.input', () => {

	class B10 extends Solarite {
		count = 1

		render() {
			this.html = r`<input data-id="input" value=${[this, 'count']}>`
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

Testimony.test('Solarite.binding.inputReuse', () => {
	
	class B12 extends Solarite {
		items = [1, 2, 3]
		
		render() {
			this.html = r`${this.items.map(item => r`<input data-id="input" value=${item}>`)}`;
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

Testimony.test('Solarite.binding.textarea', () => {

	class B20 extends Solarite {
		text = 1

		render() {
			this.html = r`<textarea data-id="input" value=${[this, 'text']}></textarea>`
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

// TODO: Set select.value when option children are rendered and don't exist when the value attrib is evaluated by ExprPath.applyValueAttrib()
Testimony.test('Solarite.binding.select', () => {

	class B30 extends Solarite {
		count = 1

		render() {
			this.html = r`<select data-id="input" value=${[this, 'count']}><option>1</option><option>2</option><option>3</option></select>`
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

Testimony.test('Solarite.binding.selectDynamic', () => {
	
	class B32 extends Solarite {
		count = 1
		
		render() {
			this.html = r`<select data-id="input" value=${[this, 'count']}>${[1, 2, 3].map(item => r`<option>${item}</option>`)}</select>`
		}
	}
	
	let b = new B32();
	document.body.append(b);
	assert.eq(b.input.value, '1')
	assert.eq(b.input.selectedIndex, 0);
	
	b.count = 2
	b.render()
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
			this.html = r`<input type="number" data-id="input" value=${[this, 'count']}>`
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
			r(this)`
			<v-70>	
				${this.items.map((item, i) => r`
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

//</editor-fold>




//<editor-fold desc="watch">
/* ┌─────────────────╮
 * | Watch           |
 * └─────────────────╯*/
/*
Testimony.test('Solarite.watched.watchSet', () => {
	
	class W10 extends Solarite {
		user = {
			name: 'John',
			email: 'john@example.com'
		}
		render() {
			this.html = r`
				<w-10>
					<div>${watchGet([this, 'user'], user => user.name + ' (user)')}</div>
					<div>${watchGet([this, 'user', 'email'])}</div>
				</w-10>`
		}
	}
	
	let a = new W10();
	document.body.append(a);
	
	// swap property on user.
	watchSet(a).user.name = 'Fred';
	a.renderWatched();
	//console.log(getHtml(a))
	assert.eq(getHtml(a), `<w-10><div>Fred (user)</div><div>john@example.com</div></w-10>`)
	
	// Swap whole user.
	watchSet(a).user = {name: 'Fred', email: 'fred@example.com'};
	a.renderWatched();
	//console.log(getHtml(a))
	assert.eq(getHtml(a), `<w-10><div>Fred (user)</div><div>fred@example.com</div></w-10>`)
	
	
	a.remove();
});






Testimony.test('Solarite.watched.forEach', () => {

	class Table650 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'}
		]
		render() {
			this.html = r`
				<table style="table-layout: fixed; width: 150px">
					<tbody>${
						forEach([this, 'users'], user =>
							r`<tr><td>${user.name}</td><td>${user.email}</td></tr>`
						)}
					</tbody>
				</table>`
		}
	}
	let table = new Table650
	document.body.append(table)

	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
			`<tr><td>John</td><td>john@example.com</td></tr>` +
			`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	// Watch one row, set property
	watchSet(table).users[1].name = 'Barry'

	table.renderWatched();
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
			`<tr><td>John</td><td>john@example.com</td></tr>` +
			`<tr><td>Barry</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	// Watch one row, set property twice
	watchSet(table).users[1].name = 'Bob'
	watchSet(table).users[1].name = 'Rob'
	table.renderWatched();
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Rob</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	// Watch all rows, set property of one.
	watchSet(table).users[1].name = 'George'
	table.renderWatched();
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>George</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	// Watch whole object, set property of one.
	watchSet(table).users[1].name = 'Jim'
	table.renderWatched();
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Jim</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	// Update entire row object
	watchSet(table).users[1] = {name: 'Ned', email: 'ned@example.com'}
	table.renderWatched();
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Ned</td><td>ned@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	table.remove();

});


Testimony.test('Solarite.watched.forEachSpliceDelete', () => {

	class W50 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'},
			{name: 'George', email: 'george@example.com'},
			{name: 'Bill', email: 'bill@example.com'}
		]
		render() {
			this.html = r`<table style="table-layout: fixed; width: 150px"><tbody>${forEach([this, 'users'], user => r`<tr><td>${user.name}</td><td>${user.email}</td></tr>`)}</tbody></table>`
		}
	}
	let table = new W50
	document.body.append(table)

	assert.eq(getHtml(table),
		`<w-50><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`<tr><td>George</td><td>george@example.com</td></tr>` +
		`<tr><td>Bill</td><td>bill@example.com</td></tr>` +
		`</tbody></table></w-50>`)


	// Splice
	watchSet(table).users.splice(1, 2)
	table.renderWatched();
	assert.eq(getHtml(table),
		`<w-50><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Bill</td><td>bill@example.com</td></tr>` +
		`</tbody></table></w-50>`)

	table.remove();
});

Testimony.test('Solarite.watched.forEachSpliceInsert', () => {
	
	class W60 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'}
		]
		render() {
			this.html = r`
				<table style="table-layout: fixed; width: 150px">
					<tbody>${forEach([this, 'users'], user => 
						r`<tr><td>${user.name}</td><td>${user.email}</td></tr>`
					)}
					</tbody>
				</table>`
		}
	}
	let table = new W60
	document.body.append(table)
	
	assert.eq(getHtml(table),
		`<w-60><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></w-60>`)
	
	
	// Splice
	watchSet(table).users.splice(1, 0, {name: 'George', email: 'george@example.com'})
	table.renderWatched();
	assert.eq(getHtml(table),
		`<w-60><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>George</td><td>george@example.com</td></tr>` +
		`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></w-60>`)
	
	table.remove();
});





// Experiment with a new syntax for watching.
Testimony.test('Solarite.watched._$', () => {

	class Table670 extends Solarite {
		title = 'Title';
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'}
		]
		render() {
			this.html = // r() can check for instanceof Proxy and convert it to something?
			  r`${this.$.title}
				<table style="table-layout: fixed; width: 150px">
					<tbody>${this.$.users.map(user => 
						r`<tr><td>${user.name}</td><td>${user.email}</td></tr>`)}
					</tbody>
				</table>`
		}
	}
	let table = new Table670
	document.body.append(table)


	table.$.title = 'test';
	table.$.users[1].name = 'Jim';

	//table.remove();
});





Testimony.test('Solarite.watch2.set', () => {
	
	class W10 extends Solarite {
		user = {
			name: 'John',
			email: 'john@example.com'
		}
		render() {
			this.html = r`
				<w-10>
					<div>${() => watch(this).user.name + ' (user)'}</div>
					<div>${() => watch(this).user.email}</div>
				</w-10>`
		}
	}
	
	let a = new W10();
	document.body.append(a);
	
	// swap property on user.
	watch(a).user.name = 'Fred';
	//console.log(getHtml(a))
	assert.eq(getHtml(a), `<w-10><div>Fred (user)</div><div>john@example.com</div></w-10>`)
	
	// Swap whole user.
	watch(a).user = {name: 'Fred', email: 'fred@example.com'};
	//console.log(getHtml(a))
	assert.eq(getHtml(a), `<w-10><div>Fred (user)</div><div>fred@example.com</div></w-10>`)
	
	
	a.remove();
});

*/

Testimony.test('Solarite.watch2._forEach', () => {

	class Table650 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'}
		]
		render() {
			this.html = r`
				<table style="table-layout: fixed; width: 150px">
					<tbody>${
						watch(this).users.map(user =>
							r`<tr><td>${user.name}</td><td>${user.email}</td></tr>`
						)}
					</tbody>
				</table>`
		}
	}
	let table = new Table650
	document.body.append(table)

	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
			`<tr><td>John</td><td>john@example.com</td></tr>` +
			`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	// Watch one row, set property
    watch(table).users[1].name = 'Barry'

	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
			`<tr><td>John</td><td>john@example.com</td></tr>` +
			`<tr><td>Barry</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	// Watch one row, set property twice
    watch(table).users[1].name = 'Bob'
    watch(table).users[1].name = 'Rob'
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Rob</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)


	// Watch whole object, set property of one.
    watch(table).users[1].name = 'Jim'
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Jim</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	// Update entire row object
	watch(table).users[1] = {name: 'Ned', email: 'ned@example.com'}
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Ned</td><td>ned@example.com</td></tr>` +
		`</tbody></table></table-650>`)
	
	// Clear
	watch(table).users = [];
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
		`</tbody></table></table-650>`)
	
	
	// This gets the wrong value via NodeGroupManager b/c we never update exactKeys.
	watch(table).users = [
		{name: 'John', email: 'john@example.com'},
		{name: 'Fred', email: 'fred@example.com'}
	];
	assert.eq(getHtml(table),
		`<table-650><table style="table-layout: fixed; width: 150px"><tbody>`+
			`<tr><td>John</td><td>john@example.com</td></tr>` +
			`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></table-650>`)

	table.remove();

});

Testimony.test('Solarite.watch2._forEachSpliceDelete', () => {

	class W50 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'},
			{name: 'George', email: 'george@example.com'},
			{name: 'Bill', email: 'bill@example.com'}
		]
		render() {
			this.html = r`<table style="table-layout: fixed; width: 150px"><tbody>${watch(this).users.map(user => r`<tr><td>${user.name}</td><td>${user.email}</td></tr>`)}</tbody></table>`
		}
	}
	let table = new W50
	document.body.append(table)

	assert.eq(getHtml(table),
		`<w-50><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`<tr><td>George</td><td>george@example.com</td></tr>` +
		`<tr><td>Bill</td><td>bill@example.com</td></tr>` +
		`</tbody></table></w-50>`)


	// Splice middle.
	watch(table).users.splice(1, 2)
	assert.eq(getHtml(table),
		`<w-50><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Bill</td><td>bill@example.com</td></tr>` +
		`</tbody></table></w-50>`)
	
	
	// Splice to remove all.
	watch(table).users.splice(0, 2);
	assert.eq(getHtml(table),
		`<w-50><table style="table-layout: fixed; width: 150px"><tbody>`+
		`</tbody></table></w-50>`)
	
	table.remove();
});

Testimony.test('Solarite.watch2._forEachSpliceDeleteStart', () => {

	class W55 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'},
			{name: 'George', email: 'george@example.com'},
			{name: 'Bill', email: 'bill@example.com'}
		]
		render() {
			this.html = r`${watch(this).users.map(user => r`<div>${user.name}|${user.email}</div>`)}`
		}
	}
	let table = new W55
	document.body.append(table)

	assert.eq(getHtml(table),
		`<w-55>`+
		`<div>John|john@example.com</div>` +
		`<div>Fred|fred@example.com</div>` +
		`<div>George|george@example.com</div>` +
		`<div>Bill|bill@example.com</div>` +
		`</w-55>`)


	// Splice start.
	watch(table).users.splice(0, 1)
	assert.eq(getHtml(table),
		`<w-55>`+
		`<div>Fred|fred@example.com</div>` +
		`<div>George|george@example.com</div>` +
		`<div>Bill|bill@example.com</div>` +
		`</w-55>`)
	
	
	// Splice start.
	watch(table).users.splice(0, 1)
	assert.eq(getHtml(table),
		`<w-55>`+
		`<div>George|george@example.com</div>` +
		`<div>Bill|bill@example.com</div>` +
		`</w-55>`)
	
	
	watch(table).users.splice(0, 1)
	assert.eq(getHtml(table),
		`<w-55>`+
		`<div>Bill|bill@example.com</div>` +
		`</w-55>`)
	
	table.remove();
});

Testimony.test('Solarite.watch2._forEachSpliceDeleteEvent', () => {

	class W57 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'},
			{name: 'George', email: 'george@example.com'},
			{name: 'Bill', email: 'bill@example.com'}
		]
		
		delete(user) {
			let idx = this.users.indexOf(user);
			assert(idx > 0)
			this.users.splice(idx, 1);
		}
		
		render() {
			this.html = r`${watch(this).users.map(user => r`<div onclick="${()=>this.delete(user)}">${user.name}|${user.email}</div>`)}`
		}
	}
	let table = new W57
	document.body.append(table)

	assert.eq(getHtml(table),
		`<w-57>`+
		`<div onclick="">John|john@example.com</div>` +
		`<div onclick="">Fred|fred@example.com</div>` +
		`<div onclick="">George|george@example.com</div>` +
		`<div onclick="">Bill|bill@example.com</div>` +
		`</w-57>`);

	table.remove();
});

Testimony.test('Solarite.watch2._forEachSpliceInsert', () => {

	class W60 extends Solarite {
		users = [
			{name: 'John', email: 'john@example.com'},
			{name: 'Fred', email: 'fred@example.com'}
		]
		render() {
			this.html = r`
				<table style="table-layout: fixed; width: 150px">
					<tbody>${watch(this).users.map(user =>
						r`<tr><td>${user.name}</td><td>${user.email}</td></tr>`
					)}
					</tbody>
				</table>`
		}
	}
	let table = new W60
	document.body.append(table)

	assert.eq(getHtml(table),
		`<w-60><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></w-60>`)


	// Splice
	watch(table).users.splice(1, 0, {name: 'George', email: 'george@example.com'})
	assert.eq(getHtml(table),
		`<w-60><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>George</td><td>george@example.com</td></tr>` +
		`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`</tbody></table></w-60>`)

	// Splice to insert at end.
	watch(table).users.splice(3, 0, {name: 'Bill', email: 'bill@example.com'})
	assert.eq(getHtml(table),
		`<w-60><table style="table-layout: fixed; width: 150px"><tbody>`+
		`<tr><td>John</td><td>john@example.com</td></tr>` +
		`<tr><td>George</td><td>george@example.com</td></tr>` +
		`<tr><td>Fred</td><td>fred@example.com</td></tr>` +
		`<tr><td>Bill</td><td>bill@example.com</td></tr>` +
		`</tbody></table></w-60>`)

	table.remove();
});








Testimony.test('Solarite.watch3.primitive', () => {

	class W10 extends HTMLElement {

		constructor() {
			super();
			watch(this, 'name', 'Fred');
			this.render();
		}

		render() {
			r(this)`<w-10>${() => this.name + '!'}</w-10>`;
		}
	}
	customElements.define('w-10', W10);

	let a = new W10();
	document.body.append(a);
	assert.eq(getHtml(a), `<w-10>Fred!</w-10>`);

	a.name = 'Jim';
	let modified = renderWatched(a);
	console.log(modified);
	assert.eq(getHtml(a), `<w-10>Jim!</w-10>`);

	a.remove();
});

Testimony.test('Solarite.watch3.primitive2', `One primitive variable used twice.`, () => {

	class W20 extends Solarite {

		constructor() {
			super();
			this.name = 'Fred';
			watch(this, 'name');
			this.render();
		}

		render() {
			r(this)`<w-20>${() => this.name + '.'}<br>${() => this.name + '!'}</w-20>`;
		}
	}

	let a = new W20();
	assert.eq(getHtml(a), `<w-20>Fred.<br>Fred!</w-20>`);

	a.name = 'Jim';
	let modified = renderWatched(a);
	console.log(modified);
	assert.eq(getHtml(a), `<w-20>Jim.<br>Jim!</w-20>`);
});

Testimony.test('Solarite.watch3.object', () => {

	class W30 extends HTMLElement {

		user = {name: 'Fred'}

		constructor() {
			super();
			watch(this, 'user');
			this.render();
		}

		render() {
			r(this)`<w-30>${() => this.user.name + '!'}</w-30>`;
		}
	}
	customElements.define('w-30', W30);

	let a = new W30();
	document.body.append(a);
	assert.eq(getHtml(a), `<w-30>Fred!</w-30>`);

	a.user.name = 'Jim';
	let modified = renderWatched(a);
	console.log(modified);
	assert.eq(getHtml(a), `<w-30>Jim!</w-30>`);

	a.user = {name: 'Bob'};
	modified = renderWatched(a);
	console.log(modified);
	assert.eq(getHtml(a), `<w-30>Bob!</w-30>`);

	a.remove();
});

Testimony.test('Solarite.watch3._loop', `replace array elements`, () => {

	class W50 extends HTMLElement {

		items = ['apple', 'banana', 'cherry'];

		constructor() {
			super();
			watch(this, 'items');
			this.render();
		}

		render() {
			r(this)`<w-50>${this.items.map(item => r`<div>${item}</div>`)}</w-50>`;
		}
	}
	customElements.define('w-50', W50);

	let a = new W50();
	document.body.append(a);

	//debugger;
	a.items[1] = 'banana2';
	let modified = renderWatched(a);
	//console.log(modified);
	assert.eq(getHtml(a), `<w-50><div>apple</div><div>banana2</div><div>cherry</div></w-50>`);

	a.items[1] = 'banana3';
	modified = renderWatched(a);
	//console.log(modified);
	assert.eq(getHtml(a), `<w-50><div>apple</div><div>banana3</div><div>cherry</div></w-50>`);

	a.items[2] = 'cherry2';
	modified = renderWatched(a);
	//console.log(modified);
	assert.eq(getHtml(a), `<w-50><div>apple</div><div>banana3</div><div>cherry2</div></w-50>`);


	a.items[0] = 'apple3';
	a.items[2] = 'cherry3';
	modified = renderWatched(a);
	//console.log(modified);
	assert.eq(getHtml(a), `<w-50><div>apple3</div><div>banana3</div><div>cherry3</div></w-50>`);
	assert.eq(modified, [a.children[0], a.children[2]]);


	a.items = ['apple4', 'banana4', 'cherry4'];
	modified = renderWatched(a);
	//console.log(modified);
	assert.eq(getHtml(a), `<w-50><div>apple4</div><div>banana4</div><div>cherry4</div></w-50>`);
	assert.eq(modified, [a.children[0], a.children[2]]);


	//a.remove();
});


Testimony.test('Solarite.watch3._loop2', `replace whole array`, () => {

	class W50 extends HTMLElement {

		items = ['apple', 'banana', 'cherry'];

		constructor() {
			super();
			watch(this, 'items');
			this.render();
		}

		render() {
			r(this)`<w-50>${this.items.map(item => r`<div>${item}</div>`)}</w-50>`;
		}
	}
	customElements.define('w-50', W50);

	let a = new W50();
	document.body.append(a);

	a.items = ['apple2', 'banana2', 'cherry2'];
	let modified = renderWatched(a);
	//console.log(modified);
	assert.eq(getHtml(a), `<w-50><div>apple2</div><div>banana2</div><div>cherry2</div></w-50>`);
	assert.eq(modified, [a.children[0], a.children[2]]);


	//a.remove();
});



//<editor-fold desc="full">
/* ┌─────────────────╮
 * | Full            |
 * └─────────────────╯*/

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
			r(this)`
			<shopping-list>
				<style>:host input { width: 80px }</style>
					
				<button onclick=${this.addItem}>Add Item</button>
	
				${this.items.map(item => r`
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
			r(this)`
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
			r(this)`
			<misc-2>
				${items.map(item => r`
					<div>
						${r`<span>${item.name}</span>`}
						${r`<span>${item.qty}</span>`}
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
			r(this)`
			<misc-1>
				${this.items.map(item => r`
					<p>						
						${this.options.map(option => r`
							<div style="display: flex">
								${r`<button onclick=${() => this.setValue(item, option, option.name, '')}>${option.name}</button>`}
								
								${option[item.id + '_showOther']  && r`<input>`}							
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


//<editor-fold desc="full">

