---
name: solarite
description: Writing, editing, and debugging Solarite web components, h`` and svg`` templates, JSX, keyed lists, h.map(), h.selector(), two-way bindings, delegated events, scoped :host styles, slots, and child components. Use when working in any project that imports solarite.
license: MIT
metadata:
  author: Eric Frost
  repository: https://github.com/eric-frost/solarite
---

# Solarite

Solarite is a browser-first UI library for native web components with **no signals, no automatic dependency tracking, no Shadow DOM, and no required build step**.  Store state in ordinary JavaScript properties, objects, and arrays, mutate them directly, and call `this.render()` whenever you want the DOM updated.  Solarite patches only the DOM nodes and attributes that changed.

## Mental model and non-negotiable rules

- **Manual synchronous rendering:** Nothing redraws until `render()` runs, and when ``h(this)`...` `` returns, the DOM is already updated.  Never invent `createSignal`, `useState`, `@property`, `requestUpdate()`, `useEffect`, or `attachShadow()`.
- **Plain web components:** Components extend `Solarite` (which extends `HTMLElement`) or `HTMLElement` directly.  Tag names must contain a hyphen (`my-counter`).
- **Scoped CSS in light DOM:** `<style>` inside a component scopes `:host` and `:host(...)` via a `data-style` attribute, with no Shadow DOM boundary, so global stylesheets and native forms still work.
- **Explicit registration when used by tag name:** Extending `Solarite` auto-defines the element only when instantiated with `new MyComp()`.  Whenever a tag appears in plain HTML or inside another component's template (`<my-comp>`), call `MyComp.define('my-comp')` (or `MyComp.define()`, which converts `MyComp` to `my-comp`) first.

## Imports and minimal component

```js
import h, {Solarite, svg, toEl, assignAttributes, convertType,
  getEventBinding, delve, Fragment} from 'solarite';

class Counter extends Solarite {
  count = 0;

  inc() {
    this.count++;
    this.render();
  }

  render() {
    h(this)`
      <my-counter>
        <style>
          :host { display: block; }
          :host button { font-weight: bold; }
        </style>
        <button onclick=${this.inc}>Clicked ${this.count} times</button>
      </my-counter>`;
  }
}
Counter.define('my-counter');
```

- `Solarite` calls `render()` automatically on first `connectedCallback()` unless `render()` was already called.
- Wrapping the template in `<my-counter>...</my-counter>` lets you put attributes, classes, and root event handlers on the host element; the outer tag must exactly match the registered tag name.  Omitting the wrapper tag is allowed if you don't need host attributes in the template.
- Switching between two different top-level ``h(this)`...` `` templates inside `render()` discards the old template's DOM and internal state.  To keep state across branches, use one root template with a conditional expression inside it.
- To extend built-in HTML elements (such as `<tr>`), extend `HTMLTableRowElement`, register with `customElements.define('line-item', LineItem, {extends: 'tr'})`, and use `<tr is="line-item" user=${u}></tr>`.  The `is` attribute must be static (never `is=${name}`).

## Templates, expressions, attributes, and SVG

- **Tagged templates:** ``h`...` `` creates a `Template`; ``h(el)`...` `` or `h(el, template, options)` renders into an `HTMLElement`, `DocumentFragment`, or `ShadowRoot`; ``h()`...` `` and `toEl(templateOrHtml)` materialize a `Node` or `DocumentFragment`.
- **Nested HTML must be tagged:** Every nested HTML snippet inside `${...}` must use ``h`...` `` (or ``svg`...` ``).  Plain strings are always escaped as text.
- **SVG:** Wrap `<svg>` and any dynamic SVG child fragments (e.g. `<rect>` inside `.map()`) with ``svg`...` `` so nodes are created in the SVG namespace.
- **Expression values:** Strings, numbers, `true` (renders `"true"`), `false`/`null`/`undefined` (renders nothing), `Template`, `Node`, `DocumentFragment`, `MappedList`, arrays, or functions returning any of those.
- **Attributes:** `false`, `null`, `undefined`, and `''` remove ordinary attributes (`0` and `'0'` are written).  On form controls, `value=${''}` or `value=${null}` clears `.value`, and boolean properties (`checked`, `disabled`, `required`) become `false`.  On `contenteditable` elements, `value=${...}` writes and clears `innerHTML`.
- **Forbidden body expressions:** Never put `${...}` inside `<textarea>` or a `contenteditable` element's body; always use `value=${...}` (body expressions throw).
- **Trailing slash and spread:** An unquoted expression followed immediately by `/>` closes the tag; quote the attribute (`href="${base}/"`) if the value must end with `/`.  Pass an object directly inside a tag (`<button ${attrs}>`) to apply multiple attributes (`false`/`null`/`undefined` keys are skipped/removed).
- **Element references (`id` / `data-id`):** Static `id="x"` or `data-id="x"` (including dotted paths like `data-id="form.email"`) binds the DOM element onto `this.x` after the first `render()`.  Never use an `id` that collides with a built-in `HTMLElement` property (`title`, `style`), a method, or a non-Node field.

## Events and two-way binding

- **Handlers:** Pass a function (`onclick=${this.save}`) or an array (`onclick=${[this.remove, item]}`).  Array form avoids allocating a closure per render.  Solarite invokes the handler with `this` set to the component root, passing `(...arrayArgs, event, element)`.  A handler must be the entire attribute value (`onclick="${fn} "` throws).
- **Event delegation (default on):** Bubbling events (`click`, `input`, `keydown`, etc.) are attached just-in-time via a capture listener on the component root and document rather than calling `addEventListener` per element.  Prefix with `native:` (`native:onclick=${fn}`) when listener order relative to third-party `addEventListener` calls matters or when an element is moved out of its list row.  Disable globally for a component via ``h(this, {eventDelegation: false})`...` `` or whitelist with `{eventDelegation: ['click']}`.
- **Two-way binding:** `value=${[obj, 'prop']}` (or `checked=${[obj, 'flag']}` for checkboxes and radio groups) writes the property into the element on `render()` and writes user input back to `obj.prop` on `input` with automatic type conversion (`number`/`range` -> Number, `date`/`time`/`datetime-local` -> Date|null, `checkbox` -> Boolean, `radio` -> String, `file` -> File[], `select multiple` -> string[], `contenteditable` -> innerHTML).
- **Two-way binding does not auto-render:** Add `oninput=${this.render}` on the input (or hoist one `oninput=${this.render}` onto a parent wrapper tag) when the UI must redraw as the user types.  (Note: a hoisted `oninput=${this.render}` passes `(event, el)` into `render()`, so use `oninput=${() => this.render()}` if `render(fields)` inspects its first argument.)
- **Same-tick flush:** If a click handler must read a bound field before `input` fires in the same tick, flush it with `getEventBinding(el, 'value')?.handleEvent(new Event('input'))`.

## Lists, keys, `h.map()`, and `h.selector()`

Choose the list tool that matches how your data updates:

| Pattern | When to use | Update contract |
|---|---|---|
| ``items.map(r => h`...`)`` | Short lists, or rows mutated in place (e.g. with two-way bindings) | Mutate freely and call `this.render()` |
| `key=${r.id}` on row root | Any list that reorders/inserts/deletes while keeping input focus, DOM state, or child components | Single whole expression on one top-level element; unique per list |
| ``h.map(items, r => h`...`)`` | Large lists where few rows change per render (`h.immutableMap` is an alias) | **Immutable items only:** replace changed rows (`{...r, name}`) so `===` fails; never mutate in place |
| `h.selector()` | Highlighting a selected row in a long keyed list without calling `render()` | Keyed rows; `when()` must own the whole attribute on the row's root element |

- **`key` rules:** Must be a single whole-value expression (`key=${row.id}`) on a top-level element of the row template, and only one per template.  Static (`key="a"`), mixed (`key="row-${id}"`), nested, or duplicate keys throw.  `key` is never written to the DOM or passed to child components (don't name a component prop `key`).
- **`h.map()` rules:** Put ``h.map(this.rows, row => h`...`)`` directly in `${...}`; spreading it (`...h.map(...)`) or wrapping it in an array forces every row to rebuild and loses the fast path.  Never use `h.map()` when rows are mutated in place (such as live two-way inputs on `row`), because identical object references are skipped.  Composes with `key=${row.id}`.
- **`h.selector()` usage:**

```js
class UserTable extends Solarite {
  rows = [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}];
  selected = h.selector();

  pick(row) {
    this.selected.set(row.id); // Updates 2 rows; no render() call.
  }

  render() {
    h(this)`
      <user-table>
        ${h.map(this.rows, row => h`
          <div key=${row.id}
            class=${this.selected.when(row.id, 'row active', 'row')}
            onclick=${[this.pick, row]}>${row.name}</div>`)}
      </user-table>`;
  }
}
```

Put any constant classes inside the `on` and `off` arguments of `when(key, on, off)` (`off` defaults to `''`, removing the attribute).  Mixing `when()` with text (`class="row ${sel.when(...)}"`), placing it on a nested element, or using it on an unkeyed list throws.

## Scoped styles, slots, and foreign elements

- `<style>` is scoped per component instance (`:host` and `:host(...)` rewrite to `tag[data-style="N"]`).
- `<style global>` is hoisted once into `<head>` and shared across all instances; it cannot contain `${...}` expressions, and the first template's `<style global>` stays for the life of the page.
- `<slot>` and `<slot name="header">` place light-DOM children from the parent (`<div slot="header">`).  Components without `<slot>` append light-DOM children after template content.
- **Foreign custom elements:** If a third-party custom element reorders, wraps, replaces, or strips light-DOM children inside its tag, wrap Solarite's `${...}` in a plain element (`<third-party-list><div>${rows}</div></third-party-list>`) so Solarite's boundary nodes stay intact.

## Child components

- Embed child components by tag name (`<notes-item item=${item} font-size=${15}></notes-item>`), never `new NotesItem(...)` inside `render()` (which recreates the element every render).
- Kebab-case attribute names convert to camelCase keys in `fields` passed to `constructor(fields)` and `render(fields, hasChanged)`.  Non-primitive values (objects, arrays, functions, two-way bindings) are passed in `fields` without serializing to DOM attributes.
- **Skipping unchanged child renders:** Call `hasChanged()` inside `render(fields = null, hasChanged = () => true)`:

```js
render(fields = null, hasChanged = () => true) {
  if (!hasChanged()) return;
  if (fields) Object.assign(this, fields);
  h(this)`<notes-item>${this.item.name}</notes-item>`;
}
```

`hasChanged()` runs a deep `JSON.stringify` comparison only when called.  Avoid inline arrow functions (`onclick=${() => ...}`) on child tags when using `hasChanged()`, because a new function reference each render makes `hasChanged()` return `true`.
- **Plain-HTML instantiation:** When a component may be created from raw HTML attributes (`<my-timer duration="7" auto-start>`), populate and cast string attributes with `assignAttributes(this, {duration: Number, autoStart: Boolean})` after `Object.assign(this, fields)` (or pass `(attribs, types)` to `super(attribs, types)` before assigning).  `Boolean` treats every string except `'false'` and `'0'` as `true` (so bare `auto-start` becomes `true`).

## JSX

- JSX expressions evaluate to a Solarite `Template`; render them with `h(this, <div>...</div>)`.
- Use standard HTML attribute names (`class`, `onclick`, `for`, `native:onclick`), **not** React's `className` or `onClick`.  `style={{color: 'red'}}` converts style objects to CSS strings.  `key={item.id}` works like `key=${item.id}`.  Static `id="..."` / `data-id="..."` still bind onto `this`.
- Precompile for tagged-template speed: Deno (`"jsx": "precompile", "jsxImportSource": "solarite"`), or install `vite-plugin-solarite`, `esbuild-plugin-solarite`, or `babel-plugin-solarite`.  Without a plugin, `"jsx": "react-jsx", "jsxImportSource": "solarite"` also works.
- Without a bundler, map both `"solarite"` and `"solarite/jsx-runtime"` to matching builds (`Solarite.min.js` + `jsx-runtime.min.js`) so two copies of Solarite are never loaded on the same page.

## DOM safety and browser translation

- Never remove or reorder DOM nodes created by `${...}` without putting them back before the next `render()`.  If a third-party tooltip/popover library inserts sibling nodes inside a list row, wrap its anchor in its own element (`<span><a>?</a></span>`).
- On pages users may auto-translate in Chrome, wrap dynamic text that sits beside static text in its own element (`<p>Hello <span>${this.name}</span>!</p>`), or add `translate="no"` where translation should be disabled.

## Troubleshooting runtime errors

For the full list of Solarite runtime errors and warnings with exact causes and fixes, read [references/errors.md](references/errors.md).
