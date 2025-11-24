---
title:  Solarite JS Library
append-head:  <script src="docs/js/ui/DarkToggle.js"></script><script type="module" src="docs/js/documentation.js"></script><link rel="stylesheet" href="docs/media/documentation.css"><link rel="stylesheet" href="docs/media/eternium.css"><link rel="icon" href="docs/media/solarite-machine.webp" type="image/webp"><script async defer src="https://buttons.github.io/buttons.js"></script>

---

<!-- To convert documentation to html: (1) Open in Typora.  (2) Select the GitHub theme, or go to Settings -> Export -> Html -> Theme -> Github. (3) Then go to File -> Export -> Export as html with styles to index.html. -->

<!-- Playgrounds that don't have a lowercase language name will not have a preview. -->

# Solarite

Solarite is a small (8KB min+gzip), fast, compilation-free JavaScript library for adding reactivity to web components.  This allows minimal DOM updates when data changes.

```javascript
import h from './dist/Solarite.min.js';

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
		// Think of h(this) as like:
		// this.outerHTML = `<shopping-list>...` 
		// but rendering only minimal DOM updates when the html changes.
		h(this)`
        <shopping-list>
            <style> /* scoped styles */
                :host input { width: 80px }
            </style>

            <button onclick=${this.addItem}>Add Item</button>

            ${this.items.map(item => h`
                <div>  <!-- 2-way binding -->
                    <input placeholder="Item"value=${[item, 'name']}
                        oninput=${this.render}>
                    <input type="number" value=${[item, 'qty']}
                        oninput=${this.render}>
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

## Key Features

- **Explicit Rendering**: You control when rendering happens through the manually invoked `render()` method - no unexpected side effects.
- **Simple State Management**: No special state setup required. Use regular JavaScript variables and data structures.
- **Scoped Styling**: Define styles that apply only to your web component and its children while still inheriting external styles.
- **Automatic Element References**: Elements with `id` or `data-id` attributes automatically become properties of your component class.
- **Component Composition**: Attributes are passed as constructor arguments to nested components for easy data flow.
- **Zero Dependencies**: Single file with no build steps or dependencies. Not even Node.js.  Just `import` Solarite.js or Solarite.min.js into your vanilla JavaScript and start coding.
- **MIT License**: Free for commercial use with no attribution required.

## Installation

### Quick Start

Import one of these pre-bundled ES6 modules directly into your project:

- [Solarite.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.js) - 109KB (unminified)
- [Solarite.min.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.min.js) - 25KB / 8.6KB gzipped

Alternatively, get Solarite from GitHub or NPM:

- [Solarite GitHub Repository](https://github.com/Vorticode/solarite)  <a class="github-button" href="https://github.com/vorticode/solarite" data-color-scheme="no-preference: light; light: light; dark: dark;" data-icon="octicon-star" data-size="small" data-show-count="true" aria-label="Star vorticode/solarite on GitHub">Star</a>
- Clone the repository: `git clone https://github.com/Vorticode/solarite.git`
- Install via NPM: `npm install solarite`

### Development Tips

For the best development experience, use a JetBrains IDE like [WebStorm](https://www.jetbrains.com/webstorm/), [PhpStorm](https://www.jetbrains.com/phpstorm/), or [IDEA](https://www.jetbrains.com/idea/) which will automatically syntax highlight the HTML template strings.

## Performance

Here is Solarite on Stefan Krause's famous js-framework-benchmark versus some other common libraries.  Run on a Ryzen 7 3700X on Windows 10.  Performance is still improving.

![js-framework-benchmark](docs/js-framework-benchmark.png)

Note that the JS Framework Benchmark separates keyed and non-keyed frameworks.  Solarite is non-keyed according to the criteria of this benchmark but in this chart it's placed next to keyed frameworks since otherwise we can't compare it with the most popular frameworks.

## Core Concepts

### Web Components

Solarite enhances [web components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) with efficient reactivity, re-rendering only the elements that change when your data updates. This approach minimizes DOM operations and improves performance.

In this minimal example, we create a class called `MyComponent` which extends from `HTMLElement` (the standard way to create web components). We add a `render()` method to define its HTML content, and call it from the constructor when a new instance is created.

**Important**: All browsers require web component tag names to contain at least one dash (e.g., `my-component`, not `mycomponent`). This is a standard requirement for custom elements.

```javascript
import h from './dist/Solarite.min.js';

class MyComponent extends HTMLElement {
	name = 'Solarite';

    constructor() {
        super(); // JavaScript requires a super() call for sub-class construtors.
        this.render();
    }

	render() {
        // This is how we'd create a web component using vanilla JavaScript
        // without Solarite.  But this recreates all children on every render!
        //this.innerHTML = `Hello <b>${this.name}!<b>`;

        // Using Solarite's h() function performs minimal updates on render.
		h(this)`<my-component>Hello <b>${this.name}!</b></my-component>`
	}
}

// Register the <my-component> tag name with the browser.
// Browsers require this for all web components.
customElements.define('my-component', MyComponent);

document.body.append(new MyComponent());
```

Alternatively, instead of instantiating the element in JavaScript, we could can instantiate the element directly from html:

```Html
<my-component></my-component>
```

JavaScript veterans will realize that other than the `h()` function, this is highly similar to one might create vanilla JavaScript web components.  This is by design!

Since these are just regular web components, they can define the [connectedCallback()](https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks-dom.html#connectedcallback) and [disconnectedCallback()](https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks-dom.html#disconnectedcallback) methods that will be called when they're added and removed from the DOM, respectively.  These functions are only supported for web components and not regular elements.

### Regular Elements

The `toEl()` function can create html elements:

```javascript
import {toEl} from './dist/Solarite.min.js';

let button = toEl(`<button>Hello World</button>`);
document.body.append(button);
```

You can also pass objects to `toEl()` with a `render()` method.  This object can optionally have additional properties and methods, which become bound to the resulting element.  When `render()` is called, only the changed nodes will be updated.

```javascript
import h, {toEl} from './dist/Solarite.min.js';

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
document.body.append(button);
```

If you want multiple instances of such an element, the code above can be wrapped in a function:

```javascript
import h, {toEl} from './dist/Solarite.min.js';

function createButton(text) {
	return toEl({
		count: 0,

		inc() {
			this.count++;
			this.render();
		},

		render() {
			h(this)`<button onclick=${this.inc}>${this.count} ${text}</button>`
		}
	})
}
document.body.append(createButton('clicks'));
document.body.append(createButton('tickles'));
```

### Rendering

#### How Rendering Works

The `h` function, when used as a [tagged template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates), converts HTML and embedded expressions into a Solarite `Template`. This data structure efficiently stores processed HTML and expressions for optimal rendering.

When you call `h(this)` followed by a template string, it renders that `Template` as the element's attributes and children. Conceptually, this is similar to assigning to the browser's built-in `this.outerHTML` property, but with a crucial difference: Solarite's updates are much faster because only the changed elements are replaced, not all nodes.

#### Manual Rendering

Unlike many frameworks, Solarite does not automatically re-render when data changes. Instead, you must call the `render()` function manually when you want to update the DOM. This is a deliberate design choice that:

1. Gives you complete control over when rendering occurs
2. Reduces unexpected side effects
3. Allows you to update internal data without triggering a render
4. Makes application behavior more predictable

This approach is particularly useful in performance-critical applications where you need precise control over when DOM updates occur.

Wrapping the web component's html in its tag name is optional.  But without it you then must set any attributes on your web component manually, as seen in this example:

```javascript
import h from './dist/Solarite.min.js';

class MyComponent extends HTMLElement {
	name = 'Solarite';
	render() { 
		// With optional element tags:
		// h(this)`<my-component class="big">Hello <b>${this.name}!<b></my-component>`

		// Without optional element tags:
		h(this)`Hello <b>${this.name}!<b>`;
        this.setAttribute('class', 'big');
	}
}
customElements.define('my-component', MyComponent);
document.body.append(new MyComponent());
```

If you do wrap the web component's html in its tag, that tag name must exactly match the tag name passed to `customElements.define()`.

Note that by default, `h()` will render expressions as text, with escaped html entities.  To render as html, wrap a variable in the `h()` function to create a template:

```javascript
import h from './dist/Solarite.min.js';

let folderIcon = `
<svg width="10em" height="10em" viewBox="0 0 24 24">
	<path fill="currentColor" d="M2 4h8l2 2h10v14H2V4Zm2 2v12h16V8h-8.825l-2-2H4Zm0 12V6v12Z"/>
</svg>`;

console.log(h(folderIcon));

let icon1 = h({
	render() { // Bad:  Renders svg as html entities.
		h(this)`<div>${folderIcon}</div>`
	}
});
document.body.append(icon1);


let icon2 = h({
	render() { // folderIcon html string wrapped in h()
		h(this)`<div>${h(folderIcon)}</div>`
	}
});
document.body.append(icon2);

```

Folder icon comes from [Google](https://icon-sets.iconify.design/material-symbols/folder-outline/).

These types of objects can be returned by in expressions with `h` tagged template literals:

1. strings and numbers.
2. boolean true, which will be rendered as 'true'
3. false, null, and undefined, which will be rendered as empty string.
4. Solarite Templates created by `h`-tagged template literals.
5. DOM Nodes, including other web components.
6. Arrays of any of the above.
7. Functions that return any of the above.

### Attributes

Dynamic attributes can be specified by inserting expressions inside a tag.  An expression can be part or all of an attribute value, or a string specifying multiple whole attributes.  For example:

```javascript
import h, {toEl} from './dist/Solarite.min.js';

let style = 'width: 100px; height: 40px; background: orange';
let isEditable = true;
let height = 40;

let attributeDemo = toEl({
	render() { 
		h(this)`
        <div class="big">
            <div style=${style}>Look at me</div>
            <div style="${'width: 100px'}; height: ${height}px; background: gray">Look at me</div>
            <div style="width: 100px; height: 40px; background: brown" ${'title="I have a title"'}>Hover me</div>
            <div style="width: 100px; height: 40px; background: red" contenteditable=${isEditable} >Edit me</div>
        </div>`
	}
});

document.body.append(attributeDemo);

style = 'width: 100px; height: 40px; background: green';
setTimeout(attributeDemo.render, 2000);
```

Expressions can also toggle the presence of an attribute.  In the last div above, if `isEditable` is false, null, or undefined, the contenteditable attribute will be removed.

You can also specify multiple attributes at once using an object, where the keys are attribute names and the values are attribute values:

```javascript
import h from './dist/Solarite.min.js';

class ObjectAttributeDemo extends HTMLElement {
    constructor() {
        super();
        this.attrs = {
            class: 'important',
            style: 'color: blue',
            'data-test': 'example',
            disabled: false
        };
        this.render();
    }

    toggleDisabled() {
        this.attrs.disabled = !this.attrs.disabled;
        this.render();
    }

    render() {
        h(this)`
        <object-attribute-demo>
            <button ${this.attrs} onclick=${this.toggleDisabled}>
                Click to toggle disabled
            </button>
        </object-attribute-demo>`
    }
}
customElements.define('object-attribute-demo', ObjectAttributeDemo);
document.body.append(new ObjectAttributeDemo());
```

In the example above, all attributes from the `this.attrs` object are applied to the button element. If a value is `undefined`, `false`, or `null`, the attribute will be skipped or removed if it was previously set.

Note that attributes can also be assigned to the root element, such as `class="big"` on the `<attribute-demo>` tag above.

### Id's

Any element in the html with an `id` or `data-id` attribute is automatically bound to a property with the same name on the class instance.  But this only happens after `render()` is first called:

```javascript
import h, {toEl} from './dist/Solarite.min.js';

let raceTeam = toEl({    
	render() { 
        h(this)`
		<div>
            <input id="driver" value="Mario">
            <div data-id="car">Cutlas Supreme</div>
            <div data-id="instructor.name">Lightning McQueen</div>
        </div>`
	}
});
document.body.append(raceTeam);

raceTeam.driver.value = 'Luigi'; 
raceTeam.car.style.border = '1px solid green';
// We don't need to call render() because we're editing the DOM Directly.
```

Id's that have values matching built-in HTMLElement attribute names such as `title` or `disabled` are not allowed.

### Events

To intercept events, set the value of an event attribute like `onclick` to a function.  Alternatively, set the value to an array where the first item is a function and subsequent items are arguments to that function.

```javascript
import h from './dist/Solarite.min.js';

class EventDemo extends HTMLElement {
	constructor() {
		super();
		this.render();
	}

	showMessage(message) {
		alert(message);
	}

	render() { 
		h(this)`
		<event-demo>
			<button onclick=${(ev, el)=>alert('Element ' + el.tagName + ' clicked!')}>Click me</button>
			<button onclick=${[this.showMessage, 'I too was clicked!']}>Click me too!</button>
		</event-demo>`
	}
} 
customElements.define('event-demo', EventDemo);
document.body.append(new EventDemo());
```

Event binding with an array containing a function and its arguments is slightly faster, since the function isn't recreated when `render()` is called, and it doesn't need to be unbound and rebound.  But the performance difference is usually negligible.

Make sure to put your events inside `${...}` expressions, because classic events can't reference variables in the current scope.

### Two-Way Binding

Two-way binding creates a connection between your component's data and form elements, so changes in either one automatically update the other. This is particularly useful for forms and interactive UI elements.

#### Basic Two-Way Binding

Form elements can update the properties that provide their values when an event attribute such as `oninput` is assigned a function to perform the update:

```javascript
import h from './dist/Solarite.min.js';

class BindingDemo extends HTMLElement {

	constructor() {
        super();
        this.count = 0;
        this.lines = [];
        this.render();
    }

	render() { 
		h(this)`
        <binding-demo>
            <input type="number" value=${this.count} 
                oninput=${ev => {
                    this.count = ev.target.value;
                    this.render();
                }}>
            <pre>count is ${this.count}</pre>
            <textarea rows="6" value=${this.lines.join('\n')}
            	oninput=${ev => {
        			this.lines = ev.target.value.split('\n')
                    this.render();
        		}}            
            ></textarea>            
            <pre>line count is ${this.lines.length}</pre>
            <button onclick=${()=> { 
                this.count = 0;
            	this.lines = [];
                this.render();
            }}>Reset</button>
        </binding-demo>`
	}
}
customElements.define('binding-demo', BindingDemo);

document.body.append(new BindingDemo());
```

`<input>`,  `<select>`, `<textarea>`, and elements with the `contenteditable` attribute can all use the `value` attribute to set their value on render.  Likewise so can any custom web component that defines a `value` property.

#### Shorthand Two-Way Binding

Solarite provides a convenient shorthand syntax for two-way binding by passing a property path as an array to an attribute. For example, with `value=${[this, 'count']}`:

1. When the component renders, the input's value is set to `this.count`
2. When a user types in the input, Solarite automatically updates `this.count` with the new value
3. You still need to add an `oninput=${this.render}` attribute if you want to trigger re-rendering when the value changes

This approach reduces boilerplate code and makes your components more maintainable.

```javascript
import h from './dist/Solarite.min.js';

class BindingDemo extends HTMLElement {

	constructor() {
        super();
        this.reset();
    }

    reset() {        
        this.count = 0;
        this.isBig = false;
        this.render();
    }

	render() { 
		h(this)`
        <binding-demo>
        	<style> :host { font-size: ${this.isBig ? 20 : 12}px }</style>
            <input type="number" value=${[this, 'count']}
                oninput=${this.render}><br>
            <label>
                <input type="checkbox" checked=${[this, 'isBig']}
                    oninput=${this.render}> Big Text
            </label>
            <pre>count is ${this.count}</pre>
            <button onclick=${this.reset}>Reset</button>
        </binding-demo>`
	}
}
customElements.define('binding-demo', BindingDemo);

document.body.append(new BindingDemo());
```



### Loops

Solarite makes it easy to render dynamic lists of items using standard JavaScript array methods. This approach leverages your existing JavaScript knowledge rather than introducing custom directives or syntax.

#### Using Array.map() for Lists

The most common way to render lists is with JavaScript's [Array.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) function:

```javascript
import h from './dist/Solarite.min.js';

class TodoList extends HTMLElement {
	render() { 
		h(this)`
        <todo-list>
            ${this.items.map(item => 
                h`${item}<br>`
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

#### Efficient List Updates

When you change an element or add another element to the `items` list and call `render()`, Solarite only redraws the changed or new elements. The other list items remain untouched in the DOM.

**Important**: Nested template literals must also have the `h` prefix. Without this prefix, they'll be rendered as escaped text instead of HTML elements.

### Component Styling

#### Scoped Styles

Solarite provides a powerful scoped styling system that allows components to define styles that apply only to themselves and their children, while still inheriting styles from the rest of the document.

When you include a `<style>` element in your component template, Solarite automatically scopes those styles to your component instance. This prevents style leakage and conflicts with other components or the main document.

Solarite implements scoped styles through a clever technique:

1. It adds a unique `data-style` attribute to the root element with an incrementing `data-style` attribute for each component instance
2. It rewrites any `:host` selectors inside your style tags to target that specific instance (e.g., `:host` becomes `fancy-text[data-style="1"]`)

This approach provides style inheritance instead of having to start as Shadow DOM requires.

```javascript
import h from './dist/Solarite.min.js';

class FancyText extends HTMLElement {
	render() { 
        h(this)`
        <fancy-text>
            <style>
                :host { display: block; border: 10px dashed red } 
                :host p { text-shadow: 0 0 3px #f40 } 
            </style>
            <p>I have a red border and shadow!</p>
        </fancy-text>`

        /* The code above is rewritten as:
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

### Child Components

Solarite makes it easy to compose complex UIs by combining smaller, reusable components. This approach promotes code reuse and maintainability.

#### Passing Data to Child Components

When one web component is embedded within another, its attributes and children are automatically passed as arguments to the constructor:

```javascript
import h from './dist/Solarite.min.js';

class NotesItem extends HTMLElement {
	// Constructor receives item object from attributes.
	constructor({item, fontSize}, children) {
		super();
		this.item = item;
        this.fontSize = fontSize;
		this.render();
	}

	render({item, fontSize}={}, children) { // Same arguments as constructor
        if (item && fontSize) {
			if (this.item === item && this.fontSize === fontSize)
				// We skip h() checking if any DOM nodes need to be re-rendered 
                return; // because we already know nothing has changed.
			this.item = item;
			this.fontSize = fontSize;
		}
		h(this)`
		<notes-item>
		   <style> :host { font-size: ${this.fontSize}px }</style>
		   <b>${this.item?.name}</b> - ${this.item?.description}<br>
		</notes-item>`
	}
}
customElements.define('notes-item', NotesItem);

class NotesList extends HTMLElement {
	render() { 
		h(this)`
		<notes-list>
			${this.items.map((item, i) => // Pass item object to NotesItem constructor:
				h`<notes-item item=${item} font-size=${15+i}</notes-item>`
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

list.items[0].name = 'PhysEd';

// list.items[0] has changed, 
// so this will call render() on the first NotesItem, 
// passing the new item object to its render() function.
list.render();

```

#### Attribute Name Conversion

Since HTML attributes are case-insensitive, Solarite automatically converts dash-case (kebab-case) attribute names to camelCase when passing them to components. For example, the `font-size` attribute becomes the `fontSize` argument in the component constructor and render method.

#### Component Rendering Hierarchy

When you call `render()` on a parent component:

1. The parent component renders its template
2. For each child component in the template, Solarite calls that child's `render()` method
3. The child component receives the new attributes as an object in the first argument of its `render()` function
4. The child component can compare these attributes with its current state and decide whether to call h() to check if anything needs to re-render.
5. If the child component calls `h(this)`, the process continues if that child component has child components of its own.

This hierarchical rendering system gives each component control over its own rendering decisions while maintaining a predictable data flow.

In the above code, we alternatively could've created the `<notes-item>` element via the `new` keyword, but doing so would cause all `NotesItem` components to be recreated on every render.

```JavaScript
class NotesList extends HTMLElement {
	render() { 
		h(this)`
		<notes-list>
			${this.items.map(item => // Pass item object to NotesItem constructor:
				new NotesItem({item: item}) // Causes full redraw (!)
			)}
		</notes-list>`
	}
}
```

### The h() Function

The `h()` function is the core of Solarite's rendering system. It handles template creation, DOM updates, and element instantiation. Understanding its various usage patterns will help you get the most out of Solarite.

Multiple Ways to Use h():

```JavaScript
import h from './dist/Solarite.min.js';

// Convert the html to a Solarite Template that can later be used to create nodes.
let template = h`<b>Hello ${"World"}!</b>`;
let template = h(`<b>Hello ${"World"}!</b>`);

// Convert a string to an HTMLElement
let el = h()`<b>Hello ${"World"}!</b>`;

// Convert a string with multiple-top-level nodes to a DocumentFragment
let el = h()`Hello <b>${"World"}!</b>`;

// h(HTMLElement)`string`
// Create template and render its node(s) as a child of HTMLElement el.
h(el)`<b>Hello ${'World'}</b>`;
```

### Advanced Techniques

#### Extending Native HTML Elements

HTML has strict rules about which elements can be children of certain container elements. For example, a `<table>` can only have specific children like `<tr>`, `<thead>`, etc.

If you want to create a custom component to use in these restricted contexts (like a custom `<tr>` element), you can extend the appropriate native HTML element instead of the generic `HTMLElement`.

To do this, pass the native element constructor as the third argument to `customElements.define`.  This is standard, vanilla JavaScript and is not specific to Solarite.

```javascript
import h from './dist/Solarite.min.js';

class LineItem extends HTMLElement {
	constructor(user) {
		super();
		this.user = user;
        this.render();
	}

	render() { 
		h(this)`			   
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

#### Manual DOM Operations

While Solarite handles most DOM updates automatically, there are cases where you might want to perform manual DOM operations for specific optimizations or integrations with third-party libraries.

You can safely perform manual DOM operations in these scenarios:

1. **Attribute Modifications**: You can modify any attributes that were not created by expressions, on any nodes that were not created by expressions.

2. **Node Addition/Removal**: You can add or remove nodes that meet all these criteria:
   - Not created by an expression
   - Not positioned directly before or after an expression that creates nodes
   - Do not have any attributes created by expressions

3. **Temporary Modifications**: You can modify any node temporarily, as long as you restore its previous position and attributes before `render()` is called again.

Following these guidelines ensures that Solarite's rendering system continues to work correctly alongside your manual DOM operations.

This example creates a list inside a `div` element and demonstrates which manual DOM operations are allowed.

```javascript
import h, {toEl} from './dist/Solarite.min.js';

let list = toEl({
    items: [],

    add() {
        this.items.push('Item ' + this.items.length);
        this.render();
    },

    render() {
        h(this)`<div>
        	<button onclick=${this.add}>Add Item</button>
        	<hr>
        	${this.items.map(item => h`
        		<p>${item}</p>
        	`)}
        </div>`
    }
});

document.body.append(list);

// Set attributes not created by expressions.  This is allowed. 
list.setAttribute('title', 'DOM manipuulation demo');
list.querySelector('button').setAttribute('title', 'Click me');

// Remove the <hr> element.
// This is fine, because the hr element isn't part of an expression.
// And isn't adjacent to an expression, because there's a whitespace
// node between the <hr> and the expression.
// You could also put a comment node between them.
list.querySelector('hr').remove();
list.render();

// Remove the first <p> element and add it back again.
// This is fine, because we put it back the way it was before render()
list.add();
let p = list.querySelector('p');
list.append(p); // put it back.
list.render();

// Remove the first <p> element.
// This will cause an error because we're modifying nodes created by an expression.
// list.querySelector('p').remove();
// list.render();
```



### The Solarite Class (Experimental)

For a more streamlined development experience, you can inherit from the `Solarite` class instead of directly from `HTMLElement`. This adds several convenient features to your web components:

1. **Automatic Rendering**: The `render()` method is automatically called when the element is added to the DOM, thanks to a built-in `connectedCallback()` implementation in the Solarite parent class.

2. **Automatic Registration**: The `customElements.define()` call happens automatically when an element is instantiated via `new`. It derives the element name from your class name by:
   - Converting the class name to kebab-case (with dashes)
   - Ensuring there's at least one dash in the name (required by browsers)
   - Appending `-element` if no suitable place for a dash is found

This approach reduces boilerplate code.

If you want the component to have a tag name that's different than the name derived from the class name, you can pass a different name to `define()`:

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class TodoList extends Solarite {
	render() { 
		h(this)`
        <todo-list>
            ${this.items.map(item => 
                h`${item}<br>`
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

## How Solarite Works

Understanding how Solarite works internally can help you write more efficient components and debug issues more effectively.

### Efficient Rendering Algorithm

Consider this example where we're rendering a list of tasks:

```javascript
import h from './dist/Solarite.min.js';

class MyTasks extends HTMLElement {
	tasks = [];

	deleteTask(index) {
		this.tasks.splice(index, 1);
		this.render();
	}

	render() {
		h(this)`
		<div>
			 ${this.tasks.map((task, index) =>  h`
				<div>
					 ${task}
					 <button onclick=${() => this.deleteTask(index)}>Delete</button>
				 </div>`
			 )}
		</div>`;
	}
}
customElements.define('my-tasks', MyTasks);

let myTasks = new MyTasks();
for (let i=0; i<10; i++)
	myTasks.tasks.push('Item ' + i);
myTasks.render();
document.body.append(myTasks);
```

When you call `render()`, Solarite performs these steps:

1. **Template Parsing**: The `h()` function processes the template literal, separating static HTML from dynamic expressions.

2. **Expression Hashing**: Solarite creates a hash of every `${...}` expression's value. This allows it to quickly identify which expressions have changed since the last render.

3. **Differential Rendering**: By comparing the current hashes with those from the previous render, Solarite determines exactly which DOM elements and attributes need to be updated.

4. **Minimal DOM Updates**: Only the elements and attributes with changed values are modified in the DOM, leaving everything else untouched.

### DOM Diffing

For efficient list updates, Solarite uses [WebReflection/udomdiff](https://github.com/WebReflection/udomdiff), a lightweight and fast algorithm for comparing and updating DOM nodes. This ensures that list operations (adding, removing, or reordering items) are performed with minimal DOM manipulations.

## Examples

This is the time example from Lit.js implemented with Solarite:

```html
<script type="module">
import h, {getArg, ArgType} from './dist/Solarite.min.js';

const replay = h`<svg enable-background="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><title>Replay</title><g><rect fill="none" height="24" width="24"/><rect fill="none" height="24" width="24"/><rect fill="none" height="24" width="24"/></g><g><g/><path d="M12,5V1L7,6l5,5V7c3.31,0,6,2.69,6,6s-2.69,6-6,6s-6-2.69-6-6H4c0,4.42,3.58,8,8,8s8-3.58,8-8S16.42,5,12,5z"/></g></svg>`;
const pause = h`<svg height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><title>Pause</title><path d="M0 0h24v24H0V0z" fill="none"/><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
const play = h`<svg height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><title>Play</title><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 8.64L15.27 12 10 15.36V8.64M8 5v14l11-7L8 5z"/></svg>`;

class MyTimer extends HTMLElement {

    constructor({duration}={}) {
        super();

        // getArg() gets the duration value from the html attributes when the
        // element is instatiated in regular html and not inside a tagged template.
        this.duration = getArg(this, 'duration', duration, ArgType.Float);
        this.end = null;
        this.remaining = this.duration * 1000;
        this.render();
    }

    render() {
        const min = Math.floor(this.remaining / 60000);
        const sec = pad(min, Math.floor((this.remaining / 1000) % 60));
        const hun = pad(true, Math.floor((this.remaining % 1000) / 10));
        h(this)`
        <my-timer>
          ${min ? `${min}:${sec}` : `${sec}.${hun}`}
          <footer>
            <style>
            :host { display: inline-block; min-width: 90px; font-size: 30px; text-align: center; padding: 0.2em; margin: 0.2em 0.1em;
                footer { user-select: none }        
            }
            </style>
            ${
              this.remaining === 0
                ? ''
                : this.running
                  ? h`<span onclick=${this.pause}>${pause}</span>`
                  : h`<span onclick=${this.start}>${play}</span>`
            }
            <span onclick=${this.reset}>${replay}</span>
          </footer>
        </my-timer>`;
    }

    start() {
        this.end = Date.now() + this.remaining;
        this.tick();
    }

    pause() {
        this.end = null;
        this.render();
    }

    reset() {
        this.remaining = this.duration * 1000;
        this.end = this.running ? Date.now() + this.remaining : null;
        this.render();
    }

    tick() {
        if (this.running) {
            this.remaining = Math.max(0, this.end - Date.now());
            this.render();
            requestAnimationFrame(() => this.tick());
        }
    }

    get running() {
        return this.end && this.remaining;
    }
}
customElements.define('my-timer', MyTimer);

function pad(pad, val) {
    return pad ? String(val).padStart(2, '0') : val;
}
</script>
<my-timer duration="7"></my-timer>
<my-timer duration="60"></my-timer>
<my-timer duration="300"></my-timer>
```

## Upcoming Features

Solarite is actively being developed with several exciting features planned for future releases:

1. **Shadow DOM Support**: Optional integration with the browser's native Shadow DOM for true encapsulation of styles and DOM.

2. **JSX Support**: Alternative syntax for those who prefer JSX over template literals.

3. **Automatic Rendering**: An opt-in feature to automatically re-render components when watched properties change, eliminating the need to manually call `render()`.

4. **Performance Optimizations**: Continued improvements to rendering speed and efficiency.

Stay tuned for updates on these features by following the [GitHub repository](https://github.com/Vorticode/solarite) <a class="github-button" href="https://github.com/vorticode/solarite" data-color-scheme="no-preference: light; light: light; dark: dark;" data-icon="octicon-star" data-size="small" data-show-count="true" aria-label="Star vorticode/solarite on GitHub">Star</a>.
