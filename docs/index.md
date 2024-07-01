---
title:  Solarite Documentation
append-head:  <script src="docs/js/ui/DarkToggle.js"></script><script type="module" src="docs/js/documentation.js"></script><link rel="stylesheet" href="docs/media/documentation.css"><link rel="stylesheet" href="/docs/media/eternium.css">

---

<!-- To create documentation: (1) Open in Typora.  (2) Select the GitHub theme. (3) Export as html with styles to index.html. -->

# Solarite Docs

Solarite is a small (10KB min+gzip), fast, compilation-free JavaScript web component library that closely follows modern web standards.

This project is currently in ALPHA stage and not yet recommended for production code.  This documentations is also incomplete.

If using Visual Studio Code, the Leet-Html extension is recommended to syntax highlight html inside template strings.

```javascript
// Type here to edit this code!
import {Solarite, r} from '/src/solarite/Solarite.js';

class ShoppingList extends Solarite {
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
		this.html = r`
			<shopping-list>
				<style>
					:host input { width: 50px }
				</style>
				<button onclick=${this.addItem}>Add Item</button>
				${this.items.map(item => r`
					<div style="display: flex; flex-direction: row">
						<input value=${item.name} oninput=${[item, 'name']} placeholder="Name">
						<input value=${item.qty} oninput=${[item, 'qty']}>
						<button onclick=${[this.removeItem, item]}>x</button>
					</div>			   
				`)}
				<pre>items = ${() => JSON.stringify(this.items, null, 4)}</pre>
			</shopping-list>`
	}
}
document.body.append(new ShoppingList()); // adds a child named <shopping-list>
```

==TODO Does it re-render all Items on update?== 

## Features

==TODO: Show benchmark==

- No custom build steps and no dependencies.  Not even Node.js.  Just `import` Solarite.js or Solarite.min.js.
- Creates native HTML Elements and Web Components which can be used anywhere in your document and alongside other libraries.
- No need to set up state.  Instead, use any regular variables or data structures in html templates.
- Minimal updates on render
- Local (scoped) styles
- Two-way form element binding.
- Optional shadow DOM (coming soon)
- Optional JSX support (coming soon)
- MIT license.  Free for commercial use.  No attribution needed.

## Using

Import one of these pre-bundled es6 modules into your project:

- [RedComponent.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.js) - 76KB
- [RedComponent.min.js](https://cdn.jsdelivr.net/gh/Vorticode/Solarite/dist/Solarite.js) - 21KB / 7KB gzipped

==TODO: NPM==

## Examples

## Concepts

### Creating Web Components

In this minimal example, we make a new class called `MyComponent` and provide a `render()` function to set its html.

All browsers require custom web component names to have a dash in the middle.  Red Component looks at the case of the class name and converts it to a name with dashes.  If it can't find at least one place to put a dash, it will append `-element` to the end.

```javascript
import {Solarite, r} from '../dist/Solarite.js';

class MyComponent extends Solarite {
	name = 'Red Component';
	render() { 
		this.html = r`<my-component>Hello <b>${this.name}!<b></my-component>`
	}
}

document.body.append(new MyComponent());
```

A JetBrains IDE like [WebStorm](https://www.jetbrains.com/webstorm/), [PhpStorm](https://www.jetbrains.com/phpstorm/), or [IDEA](https://www.jetbrains.com/idea/) will syntax highlight the html template strings.

Note that the template strings use the `r` prefix.  This `r` parses the html into a data structure that Red Component can use.

Alternatively, instead of instantiating the element in JavaScript, we could can instantiate the element directly from html.  This only works if we first call `MyComponent.define()` so so that our element's tag name is mapped to our class: 

```html2
<script>  
	// ... 
	// document.body.append(new MyComponent());
	MyComponent.define()
</script>

<my-component></my-component>
```

Internally, the `define()` function calculates the tag name from the class name and then calls the built-in [customElements.define()](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define).

If you want the component to have a tag name that's different than the name derived from the class name, you can pass a different name to `define()`:

```javascript2
MyComponent.define('my-awesome-component')
```

### The render() function, r, and this.html

The `r` function, when used as part of a template literal, converts the html and embedded expressions into a data structure.  When that data structure is assigned to `this.html`, it updates the content of the web component.  You can think of this like assigning to the browser's built-in `this.outerHTML` property, except in this case instead of replacing all of the content, only the changed elements are replaced, which is much faster.

The render() function is called automatically when an element is added to the DOM via [connectedCallback()](https://developer.mozilla.org/en-US/docs/Web/API/Web_components#connectedcallback).

Unlike other frameworks Red Component does not re-render automatically when data changes, so you should call the render() function manually as needed.  This is a deliberate design choice to reduce "magic," since in some cases you may want to update internal data without rendering.



Wrapping the web component's html in its tag name is optional.  You could instead just assign the html for the child elements to `this.html`.  But then you will have to set any attributes on your web component some other way.

```javascript
import {Solarite, r} from '../dist/Solarite.js';

class MyComponent extends Solarite {
	name = 'Solarite';
	render() { 
		// With optional element tags:
		// this.html = r`<my-component>Hello <b>${this.name}!<b></my-component>`
		
		// Without optional element tags:
		this.html = r`Hello <b>${this.name}!<b>`
	}
}

document.body.append(new MyComponent());
```

If you do provide the outer tag, its name must exactly match the "dashes" version of the class name, or a custom name if you pass one to `define()`.

### Inheriting from existing DOM elements.

Suppose you want to use a custom component for each `<tr>` in a `<table>`.  Html won't allow you to put just any element as a child of table or tbody.  In this case you can make your web component inherit from the browser's built in `<tr>` element:

```javascript
import {Solarite, r} from '../dist/Solarite.js';

class LineItem extends Solarite('tr') {
	constructor(user) {
		super();
		this.user = user;
	}
						   
	render() { 
		this.html = r`
			<tr>			   
				<td>${this.user.name}</td>
				<td>${this.user.email}</td>
			</tr>`
	}
}
LineItem.define();

let table = document.createElement('table')
for (let i=0; i<10; i++) {
	let user = {name: 'User ' + i, email: 'user'+i+'@example.com'};
	table.append(new LineItem(user));
}
document.body.append(table)
```

### Loops

Just as in some of the examples above, loops can be written with the build-in [Array.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) function:

```javascript
import {Solarite, r} from '../dist/Solarite.js';

class TodoList extends Solarite {
	render() { 
		this.html = r`
			<todo-list>
				${this.items.map(item => 
					r`${item}<br>`
				)}
			</todo-list>`
	}
}

let list = new TodoList();
list.items = ['one', 'two', 'three'];
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
import {Solarite, r} from '../dist/Solarite.js';

let style = 'width: 100px; height: 40px; background: orange';
let isEditable = true;
let height = 40;

class AttributeDemo extends Solarite {
	render() { 
		this.html = r`
			<attribute-demo class="big">
				
				<div style=${style}>Look at me</div>

				<div style="${'width: 100px'}; height: ${height}px; background: gray">Look at me</div>
				
				<div style="width: 100px; height: 40px; background: red" ${'title="I have a title"'}>Hover me</div>

				<div style="width: 100px; height: 40px; background: brown" contenteditable=${isEditable} >Edit me</div>
			</attribute-demo>`
	}
}
document.body.append(new AttributeDemo());
```

Expressions can also toggle the presence of an attribute.  In the last div above, if `isEditable` is false, null, or undefined, the contenteditable attribute will be removed.

Note that attributes can also be assigned to the root element, such as `class="big"` on the `<attribute-demo>` tag above.

### Events

Listen for events by assigning a function expression to any event attribute.  Or by passing an array where the first item is a function and subsequent items are arguments to that function.

```javascript
import {Solarite, r} from '../dist/Solarite.js';

class EventDemo extends Solarite {
    showMessage(message) {
        alert(message);
    }
    
	render() { 
		this.html = r`
			<event-demo>
				<div onclick=${()=>alert('I was clicked!')}>Click me</div>
				<div onclick=${[this.showMessage, 'I too was clicked!']}>Click me</div>
			</event-demo>`
	}
}
document.body.append(new EventDemo());
```

Event binding with an array containing a function and its arguments is slightly faster, since when render() is called, Red Component can see that the function hasn't changed, and it doesn't need to be unbound and rebound.  But the performance difference is negligible in most cases.

Make sure to put your events inside `${...}` expressions, because classic events can't reference variables in the current scope.

### Two-Way Binding

==TODO: This demo should use auto-rendering==

Form elements can update the properties that provide their values if an event attribute such as `oninput` is assigned the path to a property to update:

```javascript
import {Solarite, r} from '../dist/Solarite.js';

class BindingDemo extends Solarite {
   
	constructor() {
		super();
        this.count = 0;
        // autoRender(this, 'count');
    }
    
	render() { 
		this.html = r`
			<binding-demo>
				<input type="number" value=${this.count} oninput=${[this, 'count']}>
				<pre>count is ${this.count}</pre>
				<button onclick=${()=>this.count=0}>Reset</button>
			</binding-demo>`
	}
}
document.body.append(new BindingDemo());
```

In addition to `<input>`,  `<select>` and `<textarea>` can also use the `value` attribute to set their value on render.  Likewise so can any custom web components that define a `value` property.

### Ids

Any element in the html with an `id` or `data-id` attribute is automatically bound to a property with the same name on the root element.  But this only happens after `render()` is first called:

```javascript
import {Solarite, r} from '../dist/Solarite.js';

class RaceTeam extends Solarite {
    constructor() {
        super();
        
        // Id's are not set until render() is first called.
        this.render();
        
        // No need to render() again since we're changing the DOM manually.
        this.driver.value = 'Mario'; 
    }
    
	render() { this.html = r`
		<race-team>
            <input id="driver" value="Vermin Supreme">
            <div data-id="car">Cutlas Supreme</div>
            <div data-id="instructor.name">Lightning McQueen</div>
        </race-team>`
	}
}
let rt = new RaceTeam();
document.body.append(rt);
rt.car.style.border = '1px solid green';

```

Ids that match built-in HTMLElement attribute names such as `title` or `disabled` are not allowed.

### Scoped Styles

Html with `style` elements will be rewritten so that the `:host` selector applies to the root element.  This allows an element to specify styles that will apply only to itself and its children, while still inheriting styles from the rest of the document.

These local, "scoped" styles are implemented by:

1. Adding a `data-style` attribute to the root element with a unique, incrementing id value.
2. Replacing any `:host` selectors inside the style with `element-name[data-style="1"]`.  For example the `:host` selector below becomes `fancy-text[data-style="1"]`.

```javascript
import {Solarite, r} from '../dist/Solarite.js';

class FancyText extends Solarite {
	render() { 
        return r`
        <fancy-text>
            <style>
                :host { border: 10px dashed red } /* style for <fancy-text> */
                :host p { text-shadow: 0 0 5px orange } 
            </style>
            <p>I have a red border and shadow!</p>
        </fancy-text>`
	}
}
document.body.append(new FancyText());
```

Note that if shadown-dom is used, the element will not rewrite the `:host` selector in styles, as  browsers natively support the `:host` selector when inside shadow DOM.

### Sub Components

And constructors

Calling render() on a parent component will call it on sub-components too.

### Slots

### The r() function

### Classless Elements

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

## Differences from other Libraries

### React

### Lit.js

### Solid.js