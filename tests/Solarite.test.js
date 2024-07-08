// noinspection DuplicatedCode

import {camelToDashes, htmlContext} from "../src/solarite/Util.js";
import {watchGet, watchSet} from "../src/solarite/watch.js";
import Testimony, {assert} from './Testimony.js';
Testimony.enableJsDom();

import {Solarite, r} from '../src/solarite/Solarite.js';
//import {Red, r, Perf} from '../dist/Solarite.min.js'; // This will help the Benchmark test warm up.
import {watch} from "../src/solarite/watch2.js";
import watch3 from "../src/solarite/watch3.js";



Testimony.test('Util.htmlContext', () => {
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

Testimony.test('Util.camelToDashes', () => {
	assert.eq(camelToDashes('ProperName'), 'proper-name');
	assert.eq(camelToDashes('HTMLElement'), 'html-element');
	assert.eq(camelToDashes('BigUI'), 'big-ui');
	assert.eq(camelToDashes('UIForm'), 'ui-form');
	assert.eq(camelToDashes('A100'), 'a-100');
});

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


// Expr
Testimony.test('Solarite.expr.staticString', () => {
	class R40 extends Solarite {
		render() {
			r(this)`Solarite ${'🟥'} Component`
		}
	}

	let a = new R40();
	document.body.append(a);

	assert.eq(getHtml(a), '<r-40>Solarite 🟥 Component</r-40>');

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

	let a = new R44({render:true}); // auto render on construct.
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








// Loop:
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
	document.body.append(a);

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


Testimony.test('Solarite.loop.paragraphsBefore', () => {
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

Testimony.test('Solarite.loop.eventBindings', async () => {
	await new Promise((resolve, reject) => {
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
	document.body.append(a);
	a.render();
	assert.eq(getHtml(a), `<r-216><p>Item</p><p>Item</p></r-216>`);

	a.fruits.shift();
	a.render();
	assert.eq(getHtml(a), `<r-216><p>Item</p></r-216>`);

	a.remove();
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
	//window.debug = true;
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
			this.html = r`
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
	
	assert.eq(a.outerHTML, `<a-227><!--PathStart:0--><!--PathStart:0--><div title="F2"><!--PathStart:1-->A<!--PathEnd:1--></div><div title="F2"><!--PathStart:1-->B<!--PathEnd:1--></div><!--PathEnd:0--><!--PathStart:0--><div title="F2"><!--PathStart:1-->A<!--PathEnd:1--></div><!--PathEnd:0--><!--PathEnd:0--></a-227>`);
	
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


Testimony.test('Solarite.loop.tripleNested', 'Triple nested grid', () => {

	class R250 extends Solarite {
		rows = [[[0]]];

		render() {
			this.html = r`${this.rows.map(row =>
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

	a.rows = [
		[[p8,p7],[p6,p5]],
		[[p4,p3],[p2,p1]]
	];
	a.render()
	assert.eq(getHtml(a), `<r-250><p>8</p><p>7</p><p>6</p><p>5</p><p>4</p><p>3</p><p>2</p><p>1</p></r-250>`);

	a.rows = [];
	a.render();
	assert.eq(getHtml(a), `<r-250></r-250>`);

	a.remove();
});








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
			this.html = r`<r-470 title="${title}">World</r-470>`
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



Testimony.test('Solarite.comments', () => {
	
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

Testimony.test('Solarite.comments2', () => {
	
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





Testimony.test('Solarite.ids', () => {
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

Testimony.test('Solarite.r._createElement', () => {

	let button = r()`<button>hi</button>`
	console.log(button.outerHTML)
	document.body.append(button);
})


Testimony.test('Solarite.r.element', () => {
	let adjective = 'better'
	let button = r()`<button>I'm a <b>${adjective}</b> button</button>`;
	
	assert.eq(getHtml(button), `<button>I'm a <b>better</b> button</button>`)
})



Testimony.test('Solarite.r.lightweightComponent', () => {
	function betterButton(count=0) {
		let result = r(
			() => r`<button onclick=${(ev, self)=>{count++; self.render()}}>I'm a ${count}X better button</button>`
		);
		result.inc = () => {
			count++;
			result.render();
		}
		return result;
	}

	let button = betterButton(3);
	assert.eq(getHtml(button), `<button onclick="">I'm a 3X better button</button>`)

	button.inc();
	assert.eq(getHtml(button), `<button onclick="">I'm a 4X better button</button>`)
})

Testimony.test('Solarite.r.lightweightComponent2', () => {
	function betterButton(count=0) {
		let result = r(
			() => r`<button onclick=${(ev, self)=>{count++; self.render()}}>I'm a ${count}X better button</button>`
		);
		result.inc = () => {
			count++;
			result.render();
		}
		return result;
	}

	let button = betterButton(3);
	assert.eq(getHtml(button), `<button onclick="">I'm a 3X better button</button>`)

	button.inc();
	assert.eq(getHtml(button), `<button onclick="">I'm a 4X better button</button>`)
})




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
	
	assert.eq(a.outerHTML, `<a-512><div><b-512 name="User" userid="2"><!--PathStart:0-->User | 2<!--PathEnd:1--></b-512></div></a-512>`);
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
	
	assert.eq(a.outerHTML, `<a-513><div><b-513 name="User" userid="2"><!--PathStart:0-->User | 2<!--PathEnd:1--></b-513></div></a-513>`);
});

Testimony.test('Solarite.component.getArg', 'Attribs specified html when not nested in another Solarite component.', () => {
	
	Solarite.getArgs = function(el) {
		debugger;
		return {};
	}
	
	class B514 extends Solarite {
		constructor({name, userid}={}) {
			super();
			this.name = this.getArg('name', name);
			this.userId = this.getArg('userid', userid);
			this.render();
		}
		
		render() {
			this.html = r`<b-514>${this.name} | ${this.userId}</b-514>`
		}
	}
	B514.define();
	

	let div = document.createElement('div');
	div.innerHTML = `<b-514 name="User" userid="2"></b-514>`
	
	assert.eq(div.outerHTML, `<div><b-514 name="User" userid="2"><!--PathStart:0-->User | 2<!--PathEnd:1--></b-514></div>`)
	
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
	assert.eq(bRenderCount, 0) // Value passed to b didn't change, so it shouldn't re-render.

	a.remove();
});



// TODO: This redraws every tr on every update.
// Maybe that can be fixed when keying is supported?
Testimony.test('Solarite.component.nestedTrLoop', () => {

	function tableRow(user) {
		let tr = r(() => r`<tr><td>${user.name}</td><td>${user.email}</td></tr>`)
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



// Slots

Testimony.test('Solarite.slots.basic', () => {

	class S10 extends Solarite {
		render() {
			this.html = r`<div>slot content:<slot></slot></div>`
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


// Events

// TODO:
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



// Binding

Testimony.test('Solarite.binding.input', () => {

	class B10 extends Solarite {
		count = 1

		render() {
			this.html = r`<input data-id="input" value=${this.count} oninput=${[this, 'count']}>`

			// Alternate syntax:
			// this.html = r`<input data-bind=${this.$.value}>`
			// this.html = r`<input value=${this.value} oninput=${el => this.value = el.value}>`
			// this.html = r`<input data-bind=${[this, 'value']}>`
			//you havethis.html = r`<input data-id="input" value=${this.count} oninput=${this.count}>` // requires this.render = this.render.bind(Proxy(this).  Won't hash properly.
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
			this.html = r`<textarea data-id="input" value=${this.text} oninput=${[this, 'text']}></textarea>`
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
			this.html = r`<select data-id="input" value=${this.count} onchange=${[this, 'count']}><option>1</option><option>2</option><option>3</option></select>`
		}
	}

	let b = new B30();
	document.body.append(b);
	assert.eq(b.input.value, '1')

	b.count = 2
	b.render()
	assert.eq(b.input.value, '2');

	b.input.value = 3;
	b.input.dispatchEvent(new Event('change', {
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
			this.html = r`<select data-id="input" value=${this.count} onchange=${[this, 'count']}>${[1, 2, 3].map(item => r`<option>${item}</option>`)}</select>`
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
	b.input.dispatchEvent(new Event('change', {
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
			this.html = r`<input type="number" data-id="input" value=${this.count} oninput=${[this, 'count']}>`
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

	class W100 extends HTMLElement {

		name = 'Fred';

		constructor() {
			super();
			watch3(this, 'name');
			this.render();
		}

		render() {
			r(this)`<w-100>${() => this.name + '!'}</w-100>`;
		}
	}
	customElements.define('w-100', W100);

	let a = new W100();
	document.body.append(a);
	assert(a.outerHTML, `<w-100>Fred!</w-100>`);

	a.name = 'Jim';
	assert(a.outerHTML, `<w-100>Jim!</w-100>`);
});


Testimony.test('Solarite.watch3.nodes', () => {

	class W110 extends HTMLElement {

		name = 'Fred';
		name2 = 'White';

		constructor() {
			super();
			watch3(this, 'name');
			this.render();
		}

		render() {
			r(this)`<w-110>${() => r`<div>${this.name + '!'}</div>`} ${this.name2}</w-110>`;
		}
	}
	customElements.define('w-110', W110);

	let a = new W110();
	document.body.append(a);
	console.log(getHtml(a))

	a.name = 'Jim';
	console.log(getHtml(a))

	a.name2 = 'Brown';
	debugger;
	a.render();
	console.log(getHtml(a))
});






Testimony.test('Solarite.full.treeItems', () => {

	//import '../src/RedComponent.js'

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
					<div id="childItems" hidden="${!this.showChildren}">
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


