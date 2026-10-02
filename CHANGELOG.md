# Changelog

All notable changes to Solarite are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/). While the version is below 1.0, minor releases may include breaking changes; these are called out below.

## [Unreleased]

### Changed
- Long lists build and clear faster.  A new row is cloned with its text already in place instead of being filled in afterward, and the row's delegated handlers stay in its template rather than being written onto the elements that carry them; the event dispatcher finds the row on the event's path and reads each handler from the row's template when that handler's turn comes.  Both changes mean nothing below the row's root element is touched while the list is built, which was most of the per-row cost, and the browser has correspondingly less to tear down when the list is cleared.
- The loops that build, keep and place the rows of a list are small functions of their own instead of sections of two large ones.  A JavaScript engine decides what to compile one function at a time and in proportion to how much of that function has run, so a loop inside a large function that runs once per render stayed in the slowest tier through a whole list; on its own it is compiled within the first few hundred rows.
- Updating and removing rows of an `h.map()` list does less work.  A row rewritten in place writes into the text node it already has.  A list that lost one run of adjacent rows (a deleted row, a deleted selection, a list cut short) is settled by comparing the old and new items from both ends, so only the rows that left are visited.  A keyed list whose rows were all replaced, such as the next page of a table, skips the per-row matching it used to do first.
- Handling an event does less.  The temporary listeners the dispatcher attaches for an event are removed when the event has reached the last element it has a handler on, instead of by a timer task afterward; if a handler stops the event before that, they stay until the next event of that type.  The dispatcher no longer searches every element on the event's path through its whole prototype chain for a handler, and adds no property to the event.
- **Behavior change:** an element moved out of its list row (not the whole row, an element inside it) no longer keeps its delegated handlers; a `native:` handler does.
- **Behavior change:** in an `h.map()` list without keys, removing one run of adjacent items now removes the elements those items were drawn in.  Rows whose values were identical used to be matched by position, so removing the first of three identical rows dropped the last element, and anything typed into the rows moved up by one.  Removing items in two separate places in one render still matches identical rows by position; give rows a `key` when their elements hold state.
- The Brotli download grew from 12.7KB to 14.0KB.

### Fixed
- An `h.map()` whose callback returns plain strings no longer shows the wrong text after items are inserted, removed or reordered.
- A list drawn by `h.map()` that was replaced by a plain string or number, or by rows that are arrays or raw DOM nodes, and then drawn again from the same items, now shows those items again instead of keeping what replaced them.
- A row that throws while it is created (an event attribute given something that isn't a function, a component whose constructor fails) no longer leaves a half-drawn list that the next render draws a second copy of, and no longer leaves a long keyed list's parent element out of the document.  The error still reaches the caller; the list is left empty and the next render draws it whole.
- A keyed row removed from a list whose first row is a plain string or has no key is discarded like any other keyed row, so a new key never inherits its element.
- An `h.map()` callback that renders its own host again no longer leaves one item drawn twice and another missing.  It happened in a list without keys when rows were inserted or changed places in the same render: the render the callback started had reused rows for other items, and the render it interrupted went on from what it remembered of them, and the wrong rows then stayed until the items changed.  The interrupted render now notices and starts the list over, so the list it was given is the one shown.  The same holds when the nested render empties the list or puts plain text in its place, which could leave a second copy of the rows.
- A row of a keyed list that is a plain string, such as a separator between keyed rows, keeps its text node while it shows the same text and the list changes only before it or only after it.  A keyed list given as an array used to remove and recreate the text node of every such row on each render.
- A listener added with `addEventListener` that dispatches another event of the same type through its own element no longer costs the first event that element's template handler.  The handler used to run for the second event only.
- An event whose handler dispatched another event of the same type that was stopped now removes its temporary listeners when it ends.  They used to stay, with the stopped event's, until the next event of that type.
- A keyed `h.map()` list that also holds a row without a key no longer throws `NotFoundError` when, in one render that keeps the list's length, more than eight of its rows get new keys and a row that stays ends up at another position.  The row without a key was removed and then used as the place to insert the next row.
- An event handler on a plain element such as `<i>`, `<em>` or `<section>` no longer counts as a live property, which had made every row of such a list be rewritten on every render.
- One `Event` object dispatched a second time now runs delegated handlers the second time as well.  It used to be skipped when both targets sat at the same depth.
- `onfocusin` and `onfocusout` attributes bind their handlers like every other event.  Elements have no property of those names to detect the event by, so the attribute was treated as an ordinary one: the function was called while rendering and its result written as the attribute's text.  The touch events (`ontouchstart`, `ontouchmove`, `ontouchend`, `ontouchcancel`) had the same problem on a machine without a touch screen.
- A string given to an event attribute that is bound when the template renders (`onfocus`, `onscroll`, `native:onclick`) throws in a list row as it does everywhere else.  In a row it was written as an ordinary attribute instead, so the browser ran the string as code when the event fired.
- A string of whole attributes, such as `<div ${'title="Hello" hidden'}>`, is applied again in the minified build.  Since 0.8.0 `Solarite.min.js` wrote none of them, and a child component given such a string received none of those attributes: the minifier had removed the code that reads the string.  The unminified build was not affected.
- An `h.map()` callback may return an array, a DOM node, a nested list, a number, `null` or nothing for any item.  This used to work only when the first item's result was of that kind; for a later item it threw, and `null` threw for the first item too, so a callback that hid a row by returning `null` could not be used.
- A DOM node used as a child in a template is shown again when that template comes back after being removed: an item filtered out of a list without keys and back in, or a node shown in one of two templates by turns.  The template's elements were kept for reuse while the node had been moved elsewhere, and came back empty.
- A list row whose update throws part-way (an event attribute given something that isn't a function, an attribute function that throws) no longer shows part of the new item while every one of its delegated handlers still receives the old one.  The handlers the update had reached now receive the new item and the rest the old one, exactly as with `eventDelegation: false`, and the next render writes what is still missing.  A list that also holds raw DOM nodes is the exception: there a row's delegated handlers still all wait for the next render.

## [0.9.0] - 2026-09-19

### Added
- A `native:` prefix on an event attribute, such as `<button native:onclick=${...}>`, binds that one handler with `addEventListener` when the template renders instead of delegating it. Delegated handlers are attached when an event starts, so they run after any listener other code has added to the same element; use the prefix when that handler has to come first. It takes the same arguments, `this`, and array form as any other handler, and works in JSX as `native:onclick={...}`.
- `dist/jsx-runtime.min.js` and `dist/jsx-dev-runtime.min.js`, which import `Solarite.min.js`. A page that imports the minified build by path, as every example in the documentation does, should map `solarite/jsx-runtime` to the minified runtime; mapping it to `jsx-runtime.js` loads the unminified build as a second copy of Solarite.
- A console warning when a second copy of Solarite loads into a page, naming the address of both. Two copies don't recognise each other's templates or components, and the failures that follow give no hint of the cause. Every build shares one marker, so the source, debug, and minified builds all detect one another. This adds 73 bytes to the Brotli download.

### Changed
- **Breaking:** the `eventDelegation: 'document'` render option is gone. Passing it is harmless and just means "delegate", because what it did, keeping handlers alive on an element another component moves elsewhere in the page, now happens for every delegated handler.
- The Brotli download grew from 12.4KB to 12.7KB: mostly the reworked event dispatch described under Fixed, plus 73 bytes for the double-load warning.

### Fixed
- Delegated event handlers now behave exactly like listeners added with `addEventListener`. They used to run only once the event bubbled up to the component's root, which silently broke four things: `stopPropagation()` in a template handler could not stop a listener someone had added on an ancestor, because that listener had already run; a listener on an ancestor that stopped propagation kept the template handler from ever running; an event dispatched programmatically without `bubbles: true` never reached a handler; and an element moved out of its component lost its handlers. Solarite now attaches a real listener to each element on an event's path the moment the event starts and lets the browser dispatch normally, so ordering, `stopPropagation()`, `currentTarget`, non-bubbling events and moved elements all just work, and rendering stays as cheap as before.
- A customized built-in — a component written as `<div is="my-panel">` rather than `<my-panel>` — is now constructed once instead of twice, and one that renders from its constructor no longer nests that first render inside its own `<slot>`. The browser was upgrading the placeholder Solarite parses the template into, because an element's `is` is recorded internally and survives both removing the attribute and cloning the element; Solarite now rebuilds those elements while building the template so the placeholder stays inert. The visible symptom only appeared when rendering into an element already in the page, which is why it could pass a test and fail in the browser.
- A component declared with children inside another template no longer renders an empty `<slot>` when its own constructor builds a second component. Solarite passes those children to the new component through one shared variable, and any component created in between — typically by a field initializer, such as a toolbar that owns a menu — used to overwrite it, so the children vanished with no error and nothing in the console. The hand-off is now saved and restored around each component's construction and carries the constructor it was meant for, so an unrelated component created in the middle leaves it alone. Customized built-ins (`<div is="my-panel">`) receive their slot children correctly too.

## [0.8.0] - 2026-08-02

### Added
- **`h.selector()`** updates only the keyed rows affected by a selection change, without calling `render()` or scanning the list. Selections survive re-renders and reorders and may target a row before it exists. `when(key, on, off)` must provide a whole attribute value on the keyed row's root element.

### Changed
- **Breaking:** `h.map()` now returns an iterable `MappedList` instead of an array of templates. Embed it directly to reuse rows by item identity; spreading or nesting it still works but expands every row and loses that shortcut.
- List creation, partial updates, insertions, removals, reorders, and unchanged renders are faster. Solarite now patches only changed positions when possible, avoids unnecessary template caching and attribute work, reuses render closures, and skips unchanged event bindings.
- **Breaking:** an attribute is now removed whenever its whole-value expression is empty. `false`, `null`, `undefined`, and `''` all remove it, where previously `null` and `''` could leave `class=""` behind on an element that already had a value. Attributes an element exposes as a property, such as an `<input>`'s `value`, are unaffected: there `''` still means "empty value" and clears the field.
- The Brotli download is 9% smaller, from 13.6KB to 12.4KB.
- The production package now thows useful error messages if you use Solarite wrong. `#IFDEBUG` now contains only Solarite's internal assertions and tree validation.

### Fixed
- Valid short unquoted attributes such as `<td colspan=2>` no longer break template parsing.
- Custom elements registered under a tag other than their class's kebab-case name resolve correctly in the minified build.
- JSX projects now load one shared Solarite runtime instead of separate `solarite` and `solarite/jsx-runtime` copies.
- Functional scoped-style selectors such as `:host(:focus-within)` and dynamic plain `:host` selectors are rewritten correctly.
- The build no longer mistakes marker text in comments for an unmatched `#IFDEBUG` block.
- Clearing a form element through an expression no longer fills it with the text `false`. `<input value=${false}>` and `<input value=${undefined}>` now empty the field, because a property is cleared with a value of its own type instead of always being assigned `false`.

## [0.7.0] - 2026-07-04

### Added
- **JSX support.** Optional JSX as an alternative to `h` tagged templates, via build-time plugins for Babel, esbuild, and Vite (`babel-plugin-solarite`, `esbuild-plugin-solarite`, `vite-plugin-solarite`), plus a zero-install runtime that works with any JSX-aware toolchain. The plugins precompile to the same fast path as tagged templates; nothing here requires a build step for non-JSX users.
- `assignAttributes(el, types?, ignore?)` — reads an element's HTML attributes onto matching fields with type casting (`Number`, `Boolean`, `Date`, `String`, or a custom function), enabling plain-HTML instantiation like `<my-timer duration="7" auto-start>`.
- `getEventBinding(node, key)` — retrieve the `EventBinding` registered for a node.

### Changed
- **Breaking:** `assignFields` (and the `Cast` enum) are removed in favor of `assignAttributes`, which folds type casting into a single call.
- Event delegation is now on by default: bubbling events dispatch from one document-level listener instead of `addEventListener` per element, for much faster creation and teardown of large lists. Pass `eventDelegation: false` or an array of event names to opt out or narrow it.
- Tighter terser compress options for a smaller minified bundle.

## [0.6.0]

### Added
- **Keyed lists.** A reserved `key=${expr}` attribute makes DOM node identity follow the data across re-renders, using a two-pointer prefix/suffix scan plus a longest-increasing-subsequence pass for minimal node moves. Passes the official krausest keyed checks.
- `h.map` (replacing `h.memo`) for efficient identity-based list rendering — a ~2% benchmark gain (score 1.10 → 1.08).
- Two-way binding for radio buttons.

### Changed
- Playgrounds in the docs lazy-load below the scroll margin for faster page load.
- Smaller bundle: removed `udomdiff` and `getArg.js`.

## [0.5.2 and earlier]

Initial public releases (0.2.x–0.5.x). Highlights across these versions:

- SVG template support.
- CSP compliance, so the library avoids a penalty on the js-framework-benchmark.
- A positional two-pointer DOM diff that closed most of the gap with hand-written vanilla JavaScript.
- Scoped CSS in the light DOM (no Shadow DOM), automatic element references from `id`/`data-id`, slots, and component composition via constructor arguments.

See the [git history](https://github.com/eric-frost/solarite/commits/main) for full detail.
