---
title:  Solarite JS Library
append-head:  <script src="docs/js/ui/DarkToggle.js"></script><script type="module" src="docs/js/documentation.js"></script><link rel="stylesheet" href="docs/media/documentation.css"><link rel="stylesheet" href="docs/media/eternium.css"><link rel="icon" href="docs/media/solarite-machine.webp" type="image/webp"><script async defer src="https://buttons.github.io/buttons.js"></script>

---

<!-- To convert documentation to html: (1) Open in Typora.  (2) Select the GitHub theme, or go to Settings -> Export -> Html -> Theme -> Github. (3) Then go to File -> Export -> Export as html with styles to index.html. -->

<!-- Playgrounds that don't have a lowercase language name will not have a preview. -->

# Solarite

Solarite is a small (9KB min+gzip), fast, compilation-free JavaScript library for enhancing web components with minimal DOM updates on re-render.

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class ShoppingList extends Solarite { // Solarite extends HTMLElement
	constructor(items=[]) {
		super();
		this.items = items;
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

document.body.append(new ShoppingList()); // add <shopping-list> and call render()
```

## Key Features

- **Compilation-Free**:  No build step required. Standard ES6 modules work directly in the browser.
- **Explicit Rendering**:  You control exactly when updates happen by calling `render()`.  No unexpected side effects.
- **Minimal Rendering:**  Only changed DOM elements are updated.
- **Simple State Management**:  No signals and no special state setup required. Use regular JavaScript variables and data structures of arbitrary depth.
- **Two-Way Binding**:  Built-in shorthand for connecting data to form elements.
- **Scoped CSS**:  Native styles that apply only to your component while still inheriting parent styles--without Shadow DOM.
- **Automatic Element References**:  Elements with `id` or `data-id` automatically become class properties.

- **Component Composition**:  Attributes are passed as constructor arguments to nested components for easy data flow.
- **TypeScript Support**:  Includes a comprehensive `.d.ts` file for excellent IDE support and type safety in TypeScript projects.
- **MIT License**:  Free for commercial use with no attribution required.

## Installation

### Quick Start

Import the module directly from a CDN:

- [Solarite.min.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.min.js) (9KB minified+gzipped)

Or install via NPM:

```bash
npm install solarite
```

### Development Tips

For the best development experience, use an IDE like [WebStorm](https://www.jetbrains.com/webstorm/) or [VS Code](https://code.visualstudio.com/) with a Lit-html extension for syntax highlighting of HTML template strings. Solarite's included `Solarite.d.ts` provides auto-completion and type checking for all core APIs.

## Performance

Solarite provides near-native performance by performing targeted DOM updates.  Benchmark is un on a Ryzen 7 3700X on Windows 10.  Performance is still improving.

![js-framework-benchmark](docs/js-framework-benchmark.png)

Note that the JS Framework Benchmark separates keyed and non-keyed frameworks.  Solarite is non-keyed according to the criteria of this benchmark but in this chart it's placed next to keyed frameworks since otherwise we can't compare it with the most popular frameworks.

## Core Concepts

### Web Components

Solarite enhances [web components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) with efficient and minimal re-rendering of elements when your data changes. This approach minimizes DOM operations and improves performance.

In this minimal example, we create a class called `MyComponent` which extends from `HTMLElement` (the standard way to create web components). We add a `render()` method to define its HTML content, and call it from the constructor when a new instance is created.

**Important**: All browsers require web component tag names to contain at least one dash (e.g., `my-component`, not `mycomponent`). This is a standard requirement for custom elements.

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class MyComponent extends Solarite {
	name = 'Fred';

	render() {
        // This is how we'd create a web component using vanilla JavaScript
        // without Solarite.  But this recreates all children on every render!
        //this.innerHTML = `Hello <b>${this.name}!<b>`;

        // Using Solarite's h() function performs minimal updates on render.
		h(this)`<my-component>Hello <b>${this.name}!</b></my-component>`
	}
}

// Register the <my-component> tag name with the browser.
MyComponent.define('my-component'); // Optional.

let mc = new MyComponent();
document.body.append(mc);

mc.name = 'Solarite';
mc.render();

```

We can alternatively instantiate the element directly from html:

```Html
<my-component></my-component>
```

Note that we call `.define()` to register the `<my-component>` tag name with the browser.  Internally, this calls the Broser's `customElements.define()` function.  Browsers can only use web components that have been defined.

However, if you don't call `.define()` and create an instance of your element via `new`  it will be defined automatically using the ClassName converted to kebob-case as the tag name.  However this will NOT work if the first encounter with the element is when it's instantiated from html via its tag name.

Since these are just regular web components, they can define the [connectedCallback()](https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks-dom.html#connectedcallback) and [disconnectedCallback()](https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks-dom.html#disconnectedcallback) methods that will be called when they're added and removed from the DOM, respectively.

### Rendering

#### How Rendering Works

Use the `h` function as a [tagged template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) to convert HTML strings and embedded expressions into a Solarite `Template`. This data structure efficiently stores processed HTML and expressions for optimal rendering.

When you call `h(this)` followed by a template string, it renders that `Template` as the element's attributes and children.  This is similar to assigning to the browser's built-in `this.outerHTML` property, but with a crucial difference:  Solarite's updates are much faster because only the changed elements are replaced, not all nodes.

When an element is first added to the DOM, the render() function is called automatically.  But only if it hasn't already been previously called manually.

#### Manual Rendering

Unlike many frameworks, Solarite does not automatically re-render when data changes. Instead, you must call the `render()` function manually when you want to update the DOM. This is a deliberate design choice that:

1. Gives you complete control over when rendering occurs.  You can update data without triggering a render.
2. Reduces unexpected side effects, making behavior more predictable.

This approach is particularly useful in performance-critical applications where you need precise control over when DOM updates occur.

Wrapping the web component's html in its tag name is optional.  But without it you then must set any attributes on your web component manually:

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class MyComponent extends Solarite {
	name = 'Solarite';
	render() { 
		// With optional element tags:
		// h(this)`<my-component class="big">Hello <b>${this.name}!<b></my-component>`

		// Without optional element tags:
		h(this)`Hello <b>${this.name}!<b>`;
        this.setAttribute('class', 'big');
	}
}
MyComponent.define('my-component');
let myComponent = new MyComponent();
document.body.append(myComponent);
```

If you do wrap the web component's html in its tag, that tag name must exactly match the tag name passed to `customElements.define()`.

Note that by default, `h()` will render expressions as text, with escaped html entities.  To render as html, wrap a variable in the `h()` function to create a template.  This example also uses Solarite's `toEl()` function which converts a string or Template to a DOM element.

```javascript
import h, {toEl} from './dist/Solarite.min.js';

let folderIcon = // https://icon-sets.iconify.design/material-symbols/folder-outline/
`<svg width="10em" height="10em" viewBox="0 0 24 24">
	<path fill="currentColor" d="M2 4h8l2 2h10v14H2V4Zm2 2v12h16V8h-8.825l-2-2H4Zm0 12V6v12Z"/>
</svg>`;

console.log(h(folderIcon));

let icon1 = toEl({
	render() { // Bad:  Renders svg as html entities.
		h(this)`<div>${folderIcon}</div>`
	}
});
document.body.append(icon1);


let icon2 = toEl({
	render() { // Good: folderIcon html string wrapped in h()
		h(this)`<div>${h(folderIcon)}</div>`
	}
});
document.body.append(icon2);

```

These types of objects can be returned by in expressions with `h` tagged template literals:

1. strings and numbers.
2. boolean true, which will be rendered as 'true'
3. false, null, and undefined, which will be rendered as empty string.
4. Solarite Templates, which can be created by `h`-tagged template literals.
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
import h, {Solarite} from './dist/Solarite.min.js';

class ObjectAttributeDemo extends Solarite {
    constructor() {
        super();
        this.attrs = {
            class: 'important',
            style: 'color: blue',
            'data-test': 'example',
            disabled: false
        };
    }

    setDisabled() {
        this.attrs.disabled = true;
        this.render();
    }

    render() {
        h(this)`
        <object-attribute-demo>
            <button ${this.attrs} onclick=${this.setDisabled}>
                Click to disable
            </button>
        </object-attribute-demo>`
    }
}
ObjectAttributeDemo.define('object-attribute-demo');
document.body.append(new ObjectAttributeDemo());
```

In the example above, all attributes from the `this.attrs` object are applied to the button element. If a value is `undefined`, `false`, or `null`, the attribute will be skipped or removed if it was previously set.

Note that attributes can also be assigned to the root element, such as `class="big"` on the `<object-attribute-demo>` tag above.

### Id's

Any element in the html with an `id` or `data-id` attribute is automatically bound to a property with the same name on the class instance.  But this only happens after `render()` is first called:

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class RaceTeam extends Solarite {    
	render() {
        h(this)`
		<race-team>
            <input data-id="driver" value="Mario">
            <div data-id="car">Cutlas Supreme</div>
            <div data-id="instructor.name">Lightning McQueen</div>
        </race-team>`
	}
}
let raceTeam = new RaceTeam();
document.body.append(raceTeam); // calls render();

raceTeam.driver.value = 'Luigi'; 
raceTeam.car.style.border = '1px solid green';
// We don't need to call render() because we're editing the DOM Directly.
```

Id's that have values matching built-in HTMLElement attribute names such as `title` or `disabled` are not allowed.

### Events

To intercept events, set the value of an event attribute like `onclick` to a function.  Alternatively, set the value to an array where the first item is a function and subsequent items are arguments to that function.

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class EventDemo extends Solarite {
	showMessage(message) {
		alert(message);
	}

	render() { 
		h(this)`
		<event-demo>
			<button onclick=${(ev, el)=>alert('Element ' + el.tagName + ' clicked!')}>
				Click me</button>
			<button onclick=${[this.showMessage, 'I too was clicked!']}>
				Click me too!</button>
		</event-demo>`
	}
} 
document.body.append(new EventDemo());
```

Event binding with an array containing a function and its arguments is slightly faster, since the function isn't recreated when `render()` is called, and it doesn't need to be unbound and rebound.  But the performance difference is usually negligible.

Make sure to put your events inside `${...}` expressions, because classic events can't reference variables in the current scope.

### Two-Way Binding

Two-way binding creates a connection between your component's data and form elements, so changes in either one automatically update the other. This is particularly useful for forms and interactive UI elements.

#### Basic Two-Way Binding

Form elements can update the properties that provide their values when an event attribute such as `oninput` is assigned a function to perform the update:

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class BindingDemo extends Solarite {

	constructor() {
        super();
        this.count = 0;
        this.lines = [];
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
document.body.append(new BindingDemo());
```

`<input>`,  `<select>`, `<textarea>`, and elements with the `contenteditable` attribute can all use the `value` attribute to set their value on render.  Likewise so can any custom web component that defines a `value` property.

#### Shorthand Two-Way Binding

Solarite also provides a shortcut for two-way binding using array syntax: `value=${[this, 'count']}`:

1. When `render()` is called, the input's value is set to `this.count`
2. When a user types in the input, an input event listener updates `this.count` with the new value.

Optionally add an `oninput=${this.render}` attribute to trigger re-rendering when the value changes.

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class BindingDemo extends Solarite {
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

document.body.append(new BindingDemo());
```

### Loops

The most common way to render lists is with JavaScript's [Array.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) function:

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

class TodoList extends Solarite {
	items = [0, 1, 2, 3];
    
    addItem() {
        this.items.push(this.items.length);
        this.render();      
    }
    
	render() {
		h(this)`
        <todo-list>
            ${this.items.map(item => 
                h`${item}<br>`
            )}
            <button onclick=${this.addItem}>
                Add Item
            </button>
        </todo-list>`
	}
}

document.body.append(new TodoList());
```

#### Efficient List Updates

When youadd another element to the `items` list (or if you changed/removed one) and call `render()`, Solarite only redraws the changed elements.

**Important**: Nested template literals must also have the `h` prefix. Without this prefix, they'll be rendered as escaped text instead of HTML elements.  Try removing the `h` from line 15 to see what happens.

### Scoped Styles

Solarite provides a powerful scoped styling system that allows components to define styles that apply only to themselves and their children.  Unlike Shadow DOM, this allows styles to be inherited from the rest of the document.

When you include a `<style>` element in your component template, Solarite automatically scopes those styles to your component instance. This prevents style leakage and conflicts with other elements.

Internally, scoped styles become:

1. A unique `data-style` attribute to the root element with an incrementing `data-style` attribute for each component instance
2.  `:host` selectors are replaced with the web component tag name and unique identifier:  `fancy-text[data-style="1"]`)

```javascript
import h from './dist/Solarite.min.js';

class FancyText extends HTMLElement {
    constructor() {
        super();
        this.render();
    }    
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
document.body.append(new FancyText());
```

A style tag with the  `global` attribute defines the style only once in the document head, instead of for every instance of a component.  This improves rendering performance with many instances.  Unlike regular styles, global styles cannot have expressions within them.

```javascript
import h from './dist/Solarite.min.js';

class FancyText extends HTMLElement {
    constructor() {
        super();
        this.render();
    }
	render() { 
        h(this)`
        <fancy-text>
            <style global>
                :host { display: block; color: blue; margin: 10ps; background: #345 } 
            </style>
            <p>We all share the same style tag in the document &lt;head&gt;.</p>
        </fancy-text>`
	}
}

customElements.define('fancy-text', FancyText);

document.body.append(new FancyText());
document.body.append(new FancyText());
document.body.append(new FancyText());
document.body.append(new FancyText());
```

### Slots

Slots allow you to pass HTML content from a parent component into specific locations within a child component's template. This is useful for creating reusable layout components like modals, cards, or tabs.

#### Basic Slots

Use the `<slot>` element to define where children should be rendered:

```javascript
import h, {Solarite, toEl} from './dist/Solarite.min.js';

class MyFrame extends Solarite {
    render() {
        h(this)`
        <my-frame>
            <div style="border: 10px solid gray">
                <slot></slot>
            </div>
        </my-frame>`
    }
}
MyFrame.define('my-frame');

// Usage:
document.body.append(toEl(`
	<my-frame><span>Inside the frame</span></my-frame>
`));

```

#### Named Slots

To use multiple slots, give them a `name` attribute. Children are then assigned to these slots using the `slot` attribute:

```javascript
import h, {Solarite, toEl} from './dist/Solarite.min.js';

class MyLayout extends Solarite {
    render() {
        h(this)`<my-layout>
            <header><slot name="header"></slot></header>
            <main><slot></slot></main>
            <footer><slot name="footer"></slot></footer>
        </my-layout>`
    }
}
MyLayout.define('my-layout');

// Usage:
document.body.append(toEl(`
    <my-layout>
        <div slot="header">Page Title</div>
        <p>Main content goes here.</p>
        <div slot="footer">Copyright 2024</div>
    </my-layout>
`));
```

Elements without a `slot` attribute are placed in the unnamed (default) slot. Multiple elements can be assigned to the same slot; they will be appended in the order they appear.

#### Slotless Components

If a component's template doesn't contain any `<slot>` elements, any children provided to the component will be appended to the end of the component's root element by default.



### Child Components

Solarite makes it easy to compose complex UIs by combining smaller, reusable components.

#### Passing Data to Child Components

When one web component is embedded within the html of another, its attributes are automatically passed as arguments to the constructor:

```javascript
import h, {Solarite} from './dist/Solarite.min.js';

// A single row
class NotesItem extends Solarite {
	// Constructor receives item object from attributes.
	constructor(fields={}) {
		super();
		this.item = fields.item;
        this.fontSize = fields.fontSize;
		this.render();
	}

	render(fields=null, changed=true) { // Same arguments as constructor
        if (!changed)
            return; // fields haven't changed since previous render() call.
        
        if (fields) {
			this.item = fields.item;
			this.fontSize = fields.fontSize;
		}
		h(this)`
		<notes-item>
		   <style> 
		   		:host { font-size: ${this.fontSize}px;
		   			display: block;
		   			background: #ccf;
		   			padding: 4px;
		   			input { width: 90px }
		   		}
		   	</style>
		   <div oninput=${() => this.parentNode.render()}>
			   <input value=${[this.item, 'name']}>
			   <input value=${[this.item, 'description']}>
		   </div>
		</notes-item>`
	}
}
// Defining is required because we instantiate it from <notes-item> 
NotesItem.define('notes-item'); // rather than from new NotesItem()


// Contains all NotesItems
class NotesList extends Solarite {
    constructor(items=[]) {
        super();
        this.items = items;
    }
    
    add() {
        this.items.push({name: '', description: ''});
        
        // This calls render(item, changed=false) on the first 
        // two NotesItems, and changed=true on the third one.
        // We always call render() even when nothing has changed
        // so that the component can decide for itself what to do.
        this.render();
    }
    
	render() { 
		h(this)`
		<notes-list>
			${this.items.map((item, i) => // Pass item object to NotesItem constructor:
				h`<notes-item item=${item} font-size=${15+i}</notes-item>`
			)}
			<button onclick=${this.add}>Add Item</button>
			<pre>items = ${JSON.stringify(this.items, null, 4)}</pre>
		</notes-list>`
	}
}

let list = new NotesList([
    {name: 'English', description: 'See spot run.'},
	{name: 'Science', description: 'Space is big.'}
]);
document.body.append(list);
```

#### Attribute Name Conversion

Since HTML attributes are case-insensitive, Solarite automatically converts dash-case (kebab-case) attribute names to camelCase when passing them to component constructors. For example, the `font-size` attribute becomes the `fontSize` property of  the first argument passed to the constructor and to the `render()` function.

#### Component Rendering Hierarchy

When calling `render()` on a parent component:

1. The code in the render() function is executed, which typically means the `h()` function  is executed to render itself and its children.
2. For each child web component in the template (whether a Solarite web component or otherwise), Solarite calls that child's `render()` method, if it has one.
3. The child component receives its attributes as an object in the first argument of its `render()` function, and the boolean `changed` flag as its second argument.
4. The child component can then decide whether to call the `h()` function to render itself and its children.

This allows each component to control its own rendering while maintaining a predictable data flow.

In the above code, we alternatively could've created the `<notes-item>` element via the `new` keyword, but this is ill-advised.  Doing so would cause all `NotesItem` components to be recreated on every render:

```JavaScript
class NotesList extends HTMLElement {
	render() { 
		h(this)`
		<notes-list>
			${this.items.map(item => // Pass item object to NotesItem constructor:
				new NotesItem({item: item}) // Causes full redraw every time (!)
			)}
		</notes-list>`
	}
}
```

### Functions

#### h()

The `h()` function handles template creation, DOM updates, and element instantiation:

```JavaScript
import h from './dist/Solarite.min.js';

// Convert the html to a Solarite Template that can later be used to create nodes.
let template = h`<b>Hello ${"World"}!</b>`;
let template = h(`<b>Hello ${"World"}!</b>`);

// Convert a template string to an HTMLElement
let el = h()`<b>Hello ${"World"}!</b>`;

// Convert a template string with multiple-top-level nodes to a DocumentFragment
let el = h()`Hello <b>${"World"}!</b>`;

// h(HTMLElement)`string`
// Create template and render its node(s) as a child of HTMLElement el.
h(el)`<b>Hello ${'World'}</b>`;
```

#### toEl()

The `toEl()` function converts a string or a template created via the `h` function into a DOM element.  It enforces these rules:

- If the html begins with a start tag and ends with an end tag (minus whitespace before or after it), that whitespace is trimmed.
- If the HTML contains more than one `Node`, all nodes will be created with a `DocumentFragment` as their parent, which will be returned.
- Otherwise a single `Node` will be returned.

```javascript
import h, {toEl} from './dist/Solarite.min.js';

let a = toEl('Hello');                             // Create single text node.
let b = toEl('  <div>Yo</div> ');       // Create single HTMLDivElement
let c = toEl('<b>Hi</b><u>Bye</u>'); // Create document fragment as a parent to the Nodes

let template = h`<div>${'Waz'+'up'}</div>`;
let d = toEl(template)               // Render Template
              
document.body.append(a, b, c, d);
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

Following these guidelines ensures that Solarite's rendering system continues to work correctly alongside your manual DOM operations.  This example creates a list inside a `div` element and demonstrates which manual DOM operations are allowed:

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

#### Non-Component Elements

The `toEl()` function can create html elements.  

```javascript
import {toEl} from './dist/Solarite.min.js';

let button = toEl(`<button>Hello World</button>`);
document.body.append(button);
```

You can also pass objects to `toEl()` with a `render()` method.  This object can optionally have additional properties and methods, which become bound to the resulting element.  When `render()` is called, only the changed nodes will be updated.

```javascript
import h, {toEl} from './src/Solarite.js';

let button = toEl({
    count: 0,

    inc() {
        this.count++;
        this.render();
    },

    render() {
        h(this)`<button onclick=${() => this.inc()}>I've been clicked ${this.count} times.</button>`
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

This is an experimental feature and is likely to change in the future.

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
