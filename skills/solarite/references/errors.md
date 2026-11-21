# Solarite runtime errors and warnings

Exact causes and fixes for errors and warnings thrown by Solarite.

## Template parsing and syntax

- **`Solarite: key must be one whole expression.`**
  `key` was written as a static string (`key="a"`) or mixed with text (`key="row-${id}"`).  Use a single expression: `key=${id}`.
- **`Solarite: key must be on a top-level element.`**
  `key=${...}` was placed on a nested child instead of the row template's root element.  Move `key=${...}` to the outermost tag of the template returned for each list item.
- **`Solarite: duplicate key attribute.`**
  Two elements in the same template have `key=${...}` (or the same element has it twice).  A template may have at most one `key`.
- **`Solarite: no ${...} inside textarea; use value="${...}".`**
  An expression was placed between `<textarea>` and `</textarea>`.  Move it to the `value` attribute: `<textarea value=${this.text}></textarea>` (or `value=${[this, 'text']}` for two-way binding).
- **`Solarite: no ${...} inside contenteditable; use value="${...}".`**
  An expression was placed inside an element with `contenteditable`.  Use `<div contenteditable value=${this.html}></div>` instead.
- **`Solarite: bad escape sequence in template: ...`**
  An invalid backslash escape appeared in a tagged template literal (`html.raw` had an `undefined` cooked string).  Escape backslashes (`\\`) or fix the invalid `\u`/`\x` sequence.
- **`Solarite: bad html or duplicate attribute: ...`**
  The template HTML could not be parsed cleanly or repeated the same attribute on one tag.  Check for unclosed quotes, malformed tags, or duplicate attribute names.

## Events and two-way bindings

- **`Solarite: onclick="...${...}..." mixes a handler with text.`**
  Extra characters or whitespace were placed inside quotes next to an event handler expression.  Pass the handler as the whole attribute value: `onclick=${this.save}`.
- **`Solarite: onclick=${...} is not a function.`** / **`Solarite cannot bind to <... onclick=${...}> because it's not a function.`**
  An event attribute received something other than a function, `[fn, ...args]`, `null`, `undefined`, or `false`.  Check that the method exists (`this.save`, not `this.save()`) and wasn't called eagerly during `render()`.
- **`Solarite cannot bind value to ...`**
  A two-way binding array `[obj, 'prop']` received a null/non-object target.  Ensure `obj` is initialized before `render()` runs.

## Selectors (`h.selector()`)

- **`Solarite: a selector must own the whole class attribute.`** / **`Solarite: a selector must own the whole attribute.`**
  `selector.when(...)` was embedded inside a larger attribute value (`class="row ${sel.when(...)}"`) or used as element content instead of an attribute.  Move constant text into `when(key, 'row active', 'row')`.
- **`Solarite: a selector must be on the row's root element.`**
  `selector.when(...)` was placed on a descendant inside a list row rather than the row's top-level element.  Move the binding onto the row root and style descendants with CSS (e.g. `.active td`).
- **`Solarite: a selector must be on a keyed list, as key=${...}.`**
  The list rows using `selector.when(...)` have no `key=${...}` attribute.  Add `key=${row.id}` to the row root element.

## Lists, foreign elements, and DOM integrity

- **`Solarite: <tag> changed the nodes ${...} drew inside it; wrap the ${...} in an element it leaves alone.`**
  A non-Solarite custom element (or browser extension / page translator) reordered, wrapped, replaced, or stripped nodes Solarite placed inside `<tag>`.  Wrap the expression in a plain container (`<tag><div>${items}</div></tag>`), or wrap dynamic text beside static text in a `<span>`.
- **`Unkeyed item in a keyed list; it is rebuilt whenever it is among the rows that changed:`** (warning)
  A keyed list contained a row template without `key=${...}`.  Give every row in the list a `key=${...}`, or return `null`/`false` to omit a row.
- **`Duplicate key in keyed list:`** (warning)
  Two items in the same list evaluated to the same `===` key.  Make keys unique per list (e.g. use unique IDs, not duplicate values).

## Components, IDs, and module loading

- **`Solarite: <tag-name> is not defined yet; waiting for customElements.define().`** (warning)
  A parent template rendered `<tag-name>` before the child component class was registered.  Call `ChildClass.define('tag-name')` (or `customElements.define(...)`) before rendering the parent.
- **`render() is not defined for ...`**
  A subclass of `Solarite` did not implement a `render()` method.
- **`First argument must be an object.`**
  `super(attribs)` on `Solarite` was called with a non-object value (e.g. a string or number).  Pass an attributes object (such as `fields`) or omit the argument.
- **`Solarite web component class ... must extend HTMLElement.`**
  A class passed to `toEl()` does not extend `Solarite` or `HTMLElement`.
- **`Solarite: id="..." would overwrite an existing ... property.`** (source / debug build)
  A static `id` or `data-id` matched an `HTMLElement` property (like `title` or `style`), a class method, or a field holding a non-Node value.  Rename the `id` or use a non-colliding `data-id`.
- **`h() does not support argument of type: ...`** / **`toEl() does not support argument of type: ...`**
  An unsupported value was passed to `h(...)` or `toEl(...)`.  Check that tagged templates use backticks (``h`...` ``) and that `h(el)` receives a real `HTMLElement` or `DocumentFragment`.
- **`Solarite loaded twice: ...`** (warning)
  Two copies of Solarite (for example `Solarite.js` and `Solarite.min.js`, or mismatched `jsx-runtime` bundles) were loaded into the same page.  Templates from one copy are not recognized by the other; align your imports or `<script type="importmap">` so every entry resolves to the same build.
