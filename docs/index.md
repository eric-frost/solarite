---
title:  Solarite Documentation
append-head:  <script src="docs/js/ui/DarkToggle.js"></script><script type="module" src="docs/js/documentation.js"></script><link rel="stylesheet" href="docs/media/documentation.css"><link rel="stylesheet" href="docs/media/eternium.css"><link rel="icon" href="docs/media/solarite-machine.webp" type="image/webp">

---

<!-- To convert documentation to html: (1) Open in Typora.  (2) Select the GitHub theme. (3) Export as html with styles to index.html. -->

# Solarite

Solarite is a small (10KB min+gzip), fast, compilation-free JavaScript library to enhance your vanilla web components.  Features:

- Minimal DOM updates when render() method is manually called.
- No magic.  Rendering only occurs when you call the render() method.
- Local scoped styles:  Inherit external styles but define new styles that apply only to the web component and its children.
- Attributes are passed as constructor arguments to your web components.
- Elements with `id` or `data-id` attributes become class properties.

No need to set up state.  Instead, use any regular variables or data structures in html templates.  Call `render()` manually and it will update changed elements synchronously.

No custom build steps and no dependencies.  Not even Node.js.  Just `import` Solarite.js or Solarite.min.js.  MIT license.  Free for commercial use.  No attribution needed.

This project is currently in ALPHA stage and not yet recommended for production code.  This documentations is also incomplete.

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
				
				<pre>items = ${() => JSON.stringify(this.items, null, 4)}</pre>
			</shopping-list>`
	}
}

customElements.define('shopping-list', ShoppingList);
document.body.append(new ShoppingList()); // add <shopping-list> element
```



## Using

Import one of these pre-bundled es6 modules into your project:

- [Solarite.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.js) - 76KB
- [Solarite.min.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.js) - 21KB / 7KB gzipped

==TODO: NPM==

## Concepts

### Web Components

In this minimal example, we make a new class called `MyComponent` and provide a `render()` function to set its html, and a constructor to call it when a new instance is created.

All browsers require custom web component names to have a dash in the middle.  

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

JavaScript veterans will realize that other than the `r()` function, this is highly similar to one might create vanilla JavaScript web components.  This is by design.

Alternatively, instead of instantiating the element in JavaScript, we could can instantiate the element directly from html:

```html
<my-component></my-component>
```

A JetBrains IDE like [WebStorm](https://www.jetbrains.com/webstorm/), [PhpStorm](https://www.jetbrains.com/phpstorm/), or [IDEA](https://www.jetbrains.com/idea/) will syntax highlight the html template strings.

### render() and r()

The `r` function, when used as part of a [tagged template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) , converts the html and embedded expressions into a `Template`, which is an internal data structure used by Solarite to store processed html and expressions.  The call to `r(this)` then renders that `Template` to the web component.  You can think of this like assigning to the browser's built-in `this.outerHTML` property, except it's much faster because only the changed elements are replaced, instead of all nodes.

Unlike other frameworks Solarite does not re-render automatically when data changes, so you should call the render() function manually as needed.  This is a deliberate design choice to reduce "magic," since in some cases you may want to update internal data without rendering.

Wrapping the web component's html in its tag name is optional.  But without it you then must set any attributes on your web component some other way.

```javascript
import {r} from './dist/Solarite.js';

class MyComponent extends Solarite {
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

If you do provide the outer tag, its name must exactly match the tag name passed to customElements.define().

### Loops

Just as in some of the examples above, loops can be written with JavaScript's [Array.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) function:

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
document.body.append(list); // calls render() if it hasn't been called already.

list.items[1] = '2';
list.render();

list.items.splice(1, 0, 'two and a half');
list.render();
```

Note that nested template literals must also have the `r` prefix. Otherwise they'll be rendered as escaped text instead of HTML elements.

When we change an element or add another element to the `items` list, calling `render()` only redraws the changed or new element.  The other list items are not modified.

### Attributes

Attributes can be specified by inserting expressions inside a tag.  An expression can be part or all of an attribute value, or a string specifying multiple whole attributes.  For example:

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

class EventDemo extends Solarite {
    showMessage(message) {
        alert(message);
    }
    
	render() { 
		r(this)`
			<event-demo>
				<div onclick=${(ev, el)=>alert('Element ' + el.tagName + ' clicked!')}>Click me</div>
				<div onclick=${[this.showMessage, 'I too was clicked!']}>Click me</div>
			</event-demo>`
	}
}
document.body.append(new EventDemo());
```

Event binding with an array containing a function and its arguments is slightly faster, since when render() is called, Solarite can see that the function hasn't changed, and it doesn't need to be unbound and rebound.  But the performance difference is negligible in most cases.

Make sure to put your events inside `${...}` expressions, because classic events can't reference variables in the current scope.

### Two-Way Binding

==TODO: This demo should use auto-rendering==

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

Any element in the html with an `id` or `data-id` attribute is automatically bound to a property with the same name on the root element.  But this only happens after `render()` is first called:

```javascript
import {r} from './dist/Solarite.js';

class RaceTeam extends HTMLElement {
    constructor() {
        super();
        
        // Id's are not set until render() is first called.
        this.render();
        
        // Change the value of the input.
        // No need to render() again since we're changing the DOM manually.
        this.driver.value = 'Mario'; 
    }
    
	render() { 
        r(this)`
		<race-team>
            <input id="driver" value="Vermin Supreme">
            <div data-id="car">Cutlas Supreme</div>
            <div data-id="instructor.name">Lightning McQueen</div>
        </race-team>`
	}
}
customElements.define('race-team', RaceTeam);
let rt = new RaceTeam();
document.body.append(rt);

rt.car.style.border = '1px solid green';

```

Id's that have values matching built-in HTMLElement attribute names such as `title` or `disabled` are not allowed.

### Manual DOM Updates

==TODO==

### Scoped Styles

Html with `style` elements will be rewritten so that the `:host` selector applies to the root element.  This allows an element to specify styles that will apply only to itself and its children, while still inheriting styles from the rest of the document.

These local, "scoped" styles are implemented by:

1. Adding a `data-style` attribute to the root element with a unique, incrementing id value.
2. Replacing any `:host` selectors inside the style with `element-name[data-style="1"]`.  For example the `:host` selector below becomes `fancy-text[data-style="1"]`.

```javascript
import {r} from './dist/Solarite.js';

class FancyText extends HTMLElement {
	render() { 
        r(this)`
        <fancy-text>
            <style>
            	/* style for <fancy-text> */
                :host { display: block; border: 10px dashed red } 
                :host p { text-shadow: 0 0 3px #f40 } 
            </style>
            <p>I have a red border and shadow!</p>
        </fancy-text>`
	}
}
customElements.define('fancy-text', FancyText);
let el = new FancyText();
el.render();
document.body.append(el);
```

Note that if shadown-dom is used, the element will not rewrite the `:host` selector in styles, as  browsers natively support the `:host` selector when inside shadow DOM.

### Sub Components

And constructors

Calling render() on a parent component will call it on sub-components too.

### Slots

### The r() function

### Classless Elements

The `r()` function can also create elements outside of a class.  Pass a function that returns a `Template` as the first argument.  Optionally set the second argument to an object of additional properties and methods.

```javascript
import {r} from './dist/Solarite.js';

let count = 0;
let button = r(
    function() { return r`
    	<button onclick=${(ev, self) => {
            count++;
            this.render()
        }}>I've been clicked ${count} ${count==1 ? 'time' : 'times'}</button>`
    }
);

document.body.append(button);
```





## Experimental

### Extending existing DOM elements.

Suppose you want to use a custom component for each `<tr>` in a `<table>`.  Html won't allow you to put just any element as a child of table or tbody.  In this case you can make your web component inherit from the browser's built in `<tr>` element:

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
            <td>${this.user.name}</td>
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

### The Solarite Class (experimental)

Solarite looks at the case of the class name and converts it to a name with dashes.  If it can't find at least one place to put a dash, it will append `-element` to the end.

Internally, the `define()` function calculates the tag name from the class name and then calls the built-in [customElements.define()](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define).

If you want the component to have a tag name that's different than the name derived from the class name, you can pass a different name to `define()`:

```javascript
MyComponent.define('my-awesome-component')
```

When that data structure is assigned to `this.html`, it updates the content of the web component.

The render() function is called automatically when an element is added to the DOM via [connectedCallback()](https://developer.mozilla.org/en-US/docs/Web/API/Web_components#connectedcallback).

### Watches (Experimental)

## Reference



## How it works

Suppose you're looping over an array of 100 objects and printing them to a list or table.  Something like this:

```html2
 <ul>
	 ${tasks().map((task, index) => (
	 <li key={index} class={task.completed ? "completed" : ""}>
		 <input
				type="checkbox"
				checked={task.completed}
				onChange={() => toggleTask(index)}
		 />
		 {task.text}
		 <button onClick={() => deleteTask(index)}>Delete</button>
	 </li>
	 ))}
</ul>
```

The code gets the array of raw strings created by tasks.map() using a template literal function.  Then it creates a hash of each of those.  Then it compares those hashes with the hashes from the last time rendering happened, and only update elements associated with the changed hashes.

## Examples

## Differences from other Libraries

### React

### Lit.js

### Solid.js