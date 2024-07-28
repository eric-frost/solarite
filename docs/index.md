---
title:  Solarite JS Library
append-head:  <script src="docs/js/ui/DarkToggle.js"></script><script type="module" src="docs/js/documentation.js"></script><link rel="stylesheet" href="docs/media/documentation.css"><link rel="stylesheet" href="docs/media/eternium.css"><link rel="icon" href="docs/media/solarite-machine.webp" type="image/webp">
<script async defer src="https://buttons.github.io/buttons.js"></script>

---

<!-- To convert documentation to html: (1) Open in Typora.  (2) Select the GitHub theme. (3) Export as html with styles to index.html. -->

<!-- Playgrounds that don't have a lowercase language name will not have a preview. -->

# Solarite

Solarite is a small (8KB min+gzip), fast, compilation-free JavaScript library to enhance your vanilla web components.  Features:

- Very similar to writing native Web Components.
- Minimal DOM updates when rendering.
- No magic:  Rendering only when you want it, via the manually invoked render() method.
- Local scoped styles:  Inherit external styles but define new styles that apply only to the web component and its children.
- Elements with `id` or `data-id` attributes become class properties.
- Attributes are passed as constructor arguments to nested Solarite components.
- Single file.  No build steps and no dependencies.  Not even Node.js.  Just `import` Solarite.js or Solarite.min.js into your vanilla JavaScript and start coding.
- MIT license.  Free for commercial use.  No attribution needed.

With Solarite there's no need to set up state like with other frameworks.  Instead, use any regular variables or data structures in html templates.  Call `render()` manually and it will update changed elements synchronously.

```javascript
import {r} from './dist/Solarite.js';

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
		// Think of r(this) as like:
		// this.outerHTML = `<shopping-list>...` 
		// but rendering only minimal DOM updates when the html changes.
		r(this)`
        <shopping-list>
            <style> /* scoped styles */
                :host input { width: 80px }
            </style>

            <button onclick=${this.addItem}>Add Item</button>

            ${this.items.map(item => r`
                <div>
                    <input placeholder="Name" value=${item.name} 
                        oninput=${e => {
                            item.name = e.target.value; 
                            this.render()
                        }}>
                    <input type="number" value=${item.qty}
                        oninput=${e => {
                            item.qty = e.target.value; 
                            this.render()
                        }}>
                    <button onclick=${()=>this.removeItem(item)}>x</button>
                </div>			 
            `)}

            <pre>items = ${JSON.stringify(this.items, null, 4)}</pre>
        </shopping-list>`
	}
}

customElements.define('shopping-list', ShoppingList);
document.body.append(new ShoppingList()); // add <shopping-list> element
```

This project is currently in BETA stage and not yet recommended for production code.

To use, import one of these pre-bundled es6 modules into your project:

- [Solarite.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.js) - 87KB
- [Solarite.min.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.js) - 24KB / 8KB gzipped

Or get Solarite from GitHub or NPM:

- [Solarite GitHub Repository](https://github.com/Vorticode/solarite)  <a class="github-button" href="https://github.com/vorticode/solarite" data-color-scheme="no-preference: light; light: light; dark: dark;" data-icon="octicon-star" data-size="small" data-show-count="true" aria-label="Star vorticode/solarite on GitHub">Star</a>
- `git clone https://github.com/Vorticode/solarite.git`
- `npm install solarite`

## Concepts

### Web Components

In this minimal example, we make a new class called `MyComponent` which extends from `HTMLElement` like other web components.  We provide a `render()` function to set its html, and a constructor to call it when a new instance is created.

All browsers require custom web component tag names to have at least one dash in the middle.  

```javascript
import {r} from './dist/Solarite.js';

class MyComponent extends HTMLElement {
	name = 'Solarite';
    
    constructor() {
        super();
        this.render();
    }
    
	render() { 
		r(this)`<my-component>Hello <b>${this.name}!<b></my-component>`
	}
}

customElements.define('my-component', MyComponent);
document.body.append(new MyComponent());
```

Alternatively, instead of instantiating the element in JavaScript, we could can instantiate the element directly from html:

```html
<my-component></my-component>
```

JavaScript veterans will realize that other than the `r()` function, this is highly similar to one might create vanilla JavaScript web components.  This is by design!  

Tip:  A JetBrains IDE like [WebStorm](https://www.jetbrains.com/webstorm/), [PhpStorm](https://www.jetbrains.com/phpstorm/), or [IDEA](https://www.jetbrains.com/idea/) will syntax highlight the html template strings.

### Rendering

The `r` function, when used as part of a [tagged template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) , converts the html and embedded expressions into a Solarite `Template`.  This is a data structure used by Solarite to store processed html and expressions.  The call to `r(this)` then renders that `Template` as web component's attributes and children.  You can think of this like assigning to the browser's built-in `this.outerHTML` property, except updates are much faster because only the changed elements are replaced, instead of all nodes.

Unlike other frameworks, Solarite does not re-render automatically when data changes, so you should call the `render()` function manually.  This is a deliberate design choice to reduce magic, since in some cases you may want to update internal data without rendering.

Wrapping the web component's html in its tag name is optional.  But without it you then must set any attributes on your web component manually, as seen in this example:

```javascript
import {r} from './dist/Solarite.js';

class MyComponent extends HTMLElement {
	name = 'Solarite';
	render() { 
		// With optional element tags:
		// r(this)`<my-component class="big">Hello <b>${this.name}!<b></my-component>`
		
		// Without optional element tags:
		r(this)`Hello <b>${this.name}!<b>`;
        this.setAttribute('class', 'big');
	}
}
customElements.define('my-component', MyComponent);
document.body.append(new MyComponent());
```

If you do wrap the components html in its tag, that tag name must exactly match the tag name passed to customElements.define().

### Loops

As previously seen, loops can be written with JavaScript's [Array.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) function:

```javascript
import {r} from './dist/Solarite.js';

class TodoList extends HTMLElement {
	render() { 
		r(this)`
        <todo-list>
            ${this.items.map(item => 
                r`${item}<br>`
            )}
        </todo-list>`
	}
}
customElements.define('todo-list', TodoList);

let list = new TodoList();
list.items = ['one', 'two', 'three'];
list.render();
document.body.append(list);

list.items[1] = '2';
list.render();

list.items.splice(1, 0, 'two and a half');
list.render();
```

When we change an element or add another element to the `items` list, calling `render()` only redraws the changed or new element.  The other list items are not modified.

Note that nested template literals must also have the `r` prefix. Otherwise they'll be rendered as escaped text instead of HTML elements.

### Attributes

Dynamic attributes can be specified by inserting expressions inside a tag.  An expression can be part or all of an attribute value, or a string specifying multiple whole attributes.  For example:

```javascript
import {r} from './dist/Solarite.js';

let style = 'width: 100px; height: 40px; background: orange';
let isEditable = true;
let height = 40;

class AttributeDemo extends HTMLElement {
	render() { 
		r(this)`
        <attribute-demo class="big">

            <div style=${style}>Look at me</div>

            <div style="${'width: 100px'}; height: ${height}px; background: gray">Look at me</div>

            <div style="width: 100px; height: 40px; background: red" ${'title="I have a title"'}>Hover me</div>

            <div style="width: 100px; height: 40px; background: brown" contenteditable=${isEditable} >Edit me</div>
        </attribute-demo>`
	}
}
customElements.define('attribute-demo', AttributeDemo);
let ad = new AttributeDemo();
ad.render();
document.body.append(ad);
```

Expressions can also toggle the presence of an attribute.  In the last div above, if `isEditable` is false, null, or undefined, the contenteditable attribute will be removed.

Note that attributes can also be assigned to the root element, such as `class="big"` on the `<attribute-demo>` tag above.

### Events

Listen for events by assigning a function expression to any event attribute.  Or by passing an array where the first item is a function and subsequent items are arguments to that function.

```javascript
import {r} from './dist/Solarite.js';

class EventDemo extends HTMLElement {
	constructor() {
		super();
		this.render();
	}
	
	showMessage(message) {
		alert(message);
	}
	
	render() { 
		r(this)`
		<event-demo>
			<button onclick=${(ev, el)=>alert('Element ' + el.tagName + ' clicked!')}>Click me</button>
			<button onclick=${[this.showMessage, 'I too was clicked!']}>Click me too!</button>
		</event-demo>`
	}
} 
customElements.define('event-demo', EventDemo);
document.body.append(new EventDemo());
```

Event binding with an array containing a function and its arguments is slightly faster, since when `render()` is called, Solarite can see that the function hasn't changed, and it doesn't need to be unbound and rebound.  But the performance difference is usually negligible.

Make sure to put your events inside `${...}` expressions, because classic events can't reference variables in the current scope.

### Two-Way Binding

Form elements can update the properties that provide their values if an event attribute such as `oninput` is assigned the path to a property to update:

```javascript
import {r} from './dist/Solarite.js';

class BindingDemo extends HTMLElement {
   
	constructor() {
        super();
        this.count = 0;
        this.render();
    }
    
	render() { 
		r(this)`
        <binding-demo>
            <input type="number" value=${this.count} 
                oninput=${ev => {
                    this.count = ev.target.value;
                    this.render();
                }}>
            <pre>count is ${this.count}</pre>
            <button onclick=${()=> { 
                this.count = 0;
                this.render();
            }}>Reset</button>
        </binding-demo>`
	}
}
customElements.define('binding-demo', BindingDemo);

document.body.append(new BindingDemo());
```

In addition to `<input>`,  `<select>` and `<textarea>` can also use the `value` attribute to set their value on render.  Likewise so can any custom web components that define a `value` property.

### Id's

Any element in the html with an `id` or `data-id` attribute is automatically bound to a property with the same name on the class instance.  But this only happens after `render()` is first called:

```javascript
import {r} from './dist/Solarite.js';

class RaceTeam extends HTMLElement {
    constructor() {
        super();
        
        // Id's are not set until render() is first called.
        this.render();
        
        // Change the value of the input.
        // No need to render() again since we're changing the DOM manually.
        this.driver.value = 'Luigi'; 
    }
    
	render() { 
        r(this)`
		<race-team>
            <input id="driver" value="Mario">
            <div data-id="car">Cutlas Supreme</div>
            <div data-id="instructor.name">Lightning McQueen</div>
        </race-team>`
	}
}
customElements.define('race-team', RaceTeam);
let raceTeam = new RaceTeam();
document.body.append(raceTeam);


raceTeam.car.style.border = '1px solid green';

```

Id's that have values matching built-in HTMLElement attribute names such as `title` or `disabled` are not allowed.

### Scoped Styles

Html with `style` elements will be rewritten so that the `:host` selector applies to the root element.  This allows an element to specify styles that will apply only to itself and its children, while still inheriting styles from the rest of the document.

These local, "scoped" styles are implemented by:

1. Adding a `data-style` attribute to the root element with a unique, incrementing id value for each instance.
2. Replacing any `:host` selectors inside the style with `element-name[data-style="1"]`.  For example the `:host` selector below becomes `fancy-text[data-style="1"]`.

```javascript
import {r} from './dist/Solarite.js';

class FancyText extends HTMLElement {
	render() { 
        r(this)`
        <fancy-text>
            <style>
                :host { display: block; border: 10px dashed red } 
                :host p { text-shadow: 0 0 3px #f40 } 
            </style>
            <p>I have a red border and shadow!</p>
        </fancy-text>`
        
        /* This is rewritten as:
        <fancy-text data-style="1">
            <style>
                fancy-text[data-style="1"] { display: block; border: 10px dashed red } 
                fancy-text[data-style="1"] p { text-shadow: 0 0 3px #f40 } 
            </style>
            <p>I have a red border and shadow!</p>
        </fancy-text>`
        */
	}
}
customElements.define('fancy-text', FancyText);
let el = new FancyText();
el.render();
document.body.append(el);
```

Note that if shadow-dom is used, the element will not replace the `:host` selector in styles, as  browsers natively support the `:host` selector when inside shadow DOM.

### Sub Components

When one Solarite component is embedded within another, its attributes and children are passed as arguments to the constructor:

```javascript
import {r} from './dist/Solarite.js';

class NotesItem extends HTMLElement {
	// Constructor receives item object from attributes.
	constructor({item}, children) {
		super();
		this.item = item;
		this.render();
	}
	
	render() { 
		r(this)`
		<notes-item>
		   <b>${this.item.name}</b> - ${this.item.description}<br>
		</notes-item>`
	}
}
customElements.define('notes-item', NotesItem);

class NotesList extends HTMLElement {
	render() { 
		r(this)`
		<notes-list>
			${this.items.map(item => // Pass item object to NotesItem constructor:
				r`<notes-item item=${item}"></notes-item>`
			)}
		</notes-list>`
	}
}
customElements.define('notes-list', NotesList);

let list = new NotesList();
list.items = [
	{
		name: 'English',
		description: 'See spot run.'
	},
	
	{
		name: 'Science',
		description: 'Snails are mollusks.'
	}
]
list.render();
document.body.append(list);
```

Note that calling `render()` on a parent component will call it on sub-components too.

In the above code, we could also have created `<notes-item>` via the `new` keyword:

```JavaScript
class NotesList extends HTMLElement {
	render() { 
		r(this)`
		<notes-list>
			${this.items.map(item => // Pass item object to NotesItem constructor:
				new NotesItem({item: item})
			)}
		</notes-list>`
	}
}
```



### Classless Elements

The `r()` function can also create elements outside of a class.  Pass any object with a `render()` function as the first argument.  This object can optionally have additional properties and methods:

```javascript
import {r} from './src/solarite/Solarite.js';

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
document.body.append(button);
```

### The r() function

There are multiple ways to use the `r()` function:

```JavaScript
import {r} from './dist/Solarite.js';

// r`string`
// Convert the html to a Template that can later be used to create nodes.
let template = r`Hello ${"World"}!`;

// r(HTMLElement, Template)
// Render the template created by #1 to the <body> tag.
r(document.body, template);  

// r(Template):Node|HTMLElement
// Render Template created by #1 creating a standaline HTML Element
let el = r(template);

// r(HTMLElement)`string`
// Create template and render its nodes to el.
r(el)`<b>${'Hi'}</b>`;

// r(html:string):TextNode
// Create single text node.
let textNode = r('Hello');           

// r(html:string):HTMLElement
// Create single HTMLElement
let el2 = r('<b>Hello</b>');

// r(html:string):DocumentFragment
// Create document fragment because there's more than one node.
let fragment = r('<b>Hello</b><u>Goodbye</u>');

// r(function():Template, Object<string, function|*>):HTMLElement
// Crete a standalone element, with the fist function being the render function.
// This is seen in the "Classless Elements" section above.
let button = r({
    render() {
        r(this)`<button>Submit</button>`
    }
});
document.body.append(button);

```

### Extending Other DOM Elements.

Suppose you want to use a custom component for each `<tr>` in a `<table>`.  Html won't allow you to put just any element as a child of table or tbody.  In this case you can make your web component inherit from the browser's built in `<tr>` element, by passing it as the third argument to `customElements.define`:

```javascript
import {r} from './dist/Solarite.js';

class LineItem extends HTMLElement {
	constructor(user) {
		super();
		this.user = user;
        this.render();
	}
						   
	render() { 
		r(this)`			   
            <th>${this.user.name}</td>
            <td>${this.user.email}</td>`
	}
}

customElements.define('line-item', LineItem, HTMLTableRowElement);

let table = document.createElement('table')
for (let i=0; i<10; i++) {
	let user = {name: 'User ' + i, email: 'user'+i+'@example.com'};
	table.append(new LineItem(user));
}
document.body.append(table);
```

### Manual DOM Ops

This example creates a list as a Classless Element.

```javascript
import {r} from './src/solarite/Solarite.js';

let list = r({
    items: [],

    add() {
        this.items.push('Item ' + this.items.length);
        this.render();
    },

    render() {
        r(this)`<div>
        	<button onclick=${this.add}>Add Item</button>
        	<hr>
        	${this.items.map(item => r`
        		<p>${item}</p>
        	`)}
        </div>`
    }
});

document.body.append(list);

// Remove the <hr> element.
// This is fine, because the hr element isn't part of an expression.
//setTimeout(() => {
	list.querySelector('hr').remove();
    list.render();
//}, 1000);

// Remove the first <p> element and add it back again.
// This is fine, because we put it back the way it was before render()
//setTimeout(() => {
    list.add();
    let p = list.querySelector('p');
	list.append(p);
    list.render();
//}, 2000);

// Remove the first <p> element.
// This is bad(!) because we're modifying nodes created by an expression.
//setTimeout(() => {
//	list.querySelector('p').remove();
//  list.render();
//}, 3000);

```



### The Solarite Class (Experimental)

Instead of inheriting from HTMLElement, you can inherit from the `Solarite` class, which will add a little bit of magic to your web component:

1. `render()` is automatically called when the element is added to the DOM, via a `connectedCallback()` function in the Solarite parent class.
2. `customElements.define()` is automatically called when an element is instantiated via `new`.  It defines the element name based on the class name, by converting the class name to a tag name with dashes, because browsers require all custom elements to have at least one dash within the name.  If it can't find at least one place to put a dash, it will append `-element` to the end.

If you want the component to have a tag name that's different than the name derived from the class name, you can pass a different name to `define()`:

```javascript
import {r, Solarite} from './dist/Solarite.js';

class TodoList extends Solarite {
	render() { 
		r(this)`
        <todo-list>
            ${this.items.map(item => 
                r`${item}<br>`
            )}
        </todo-list>`
	}
}
// This is called automatically when we extend from Solarite:
//customElements.define('todo-list', TodoList);

let list = new TodoList();
list.items = ['one', 'two', 'three'];
//list.render(); render() is called automatically when appended to body.
document.body.append(list);

list.items[1] = '2';
list.render();
```

## How it works

Suppose you're looping over an array of 10 objects and printing them to a list or table:

```javascript
import {r} from './dist/Solarite.js';

class MyTasks extends HTMLElement {
	tasks = [];
	
	deleteTask(index) {
		this.tasks.splice(index, 1);
		this.render();
	}
	
	render() {
		r(this)`
		<div>
			 ${this.tasks.map((task, index) =>  r`
				<div>
					 ${task.text}
					 <button onClick=${() => this.deleteTask(index)}>Delete</button>
				 </div>`
			 )}
		</div>`;
	}
}
customElements.define('my-tasks', MyTasks);

let myTasks = new MyTasks();
for (let i=0; i<10; i++)
	myTasks.tasks.push({
		text: 'Item ' + i,
		completed: false
	});
myTasks.render();
document.body.append(myTasks);
```

When `render()` is called:

1. Solarite's `r()` function gets the array of raw strings created by tasks.map() using a template literal function.  
2. It then creates a hash of the values of each item in the array.  
3. Then it compares those hashes with the hashes from the last time rendering happened, and only update elements and attributes given values that have changed.

