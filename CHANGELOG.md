# Changelog

All notable changes to Solarite are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/). While the version is below 1.0, minor releases may include breaking changes; these are called out below.

## [Unreleased]

### Fixed
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
