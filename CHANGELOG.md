# Changelog

All notable changes to Solarite are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/). While the version is below 1.0, minor releases may include breaking changes; these are called out below.

## [Unreleased]

### Added
- **`h.selector()`** — a selection that updates only the rows it actually affects. Moving a highlight from one row of a thousand to another changes two attributes, but expressing that as ordinary component state means calling `render()` and letting the reconciler walk the list to rediscover it. A selector writes those two attributes directly instead, with no `render()` call and no walk:

  ```js
  class Table extends Solarite {
      selected = h.selector();

      pick(row) {
          this.selected.set(row.id);   // no render() call
      }

      render() {
          h(this)`<tbody>${h.map(this.rows, row =>
              h`<tr key=${row.id} class=${this.selected.when(row.id, 'danger')}
                  onclick=${[this.pick, row]}>${row.label}</tr>`)}</tbody>`;
      }
  }
  ```

  `when(key, on, off)` must be a whole attribute value — not part of one, and not element content; both throw with an explanation. An `off` value of `''` (the default) leaves no attribute at all rather than an empty one. The selection lives on the selector rather than on the rows, so it survives re-renders, follows a row through a reorder, and `set()` is safe to call whether or not those rows are currently on screen. Bindings for rows that no longer exist are swept as the selection moves, so nothing has to be released by hand; `selector.size` reports how many are held if you ever want to check.

### Changed
- **Breaking:** `h.map()` returns a `MappedList` (the items plus the callback) rather than an array of templates, so the reconciler can recognize an unchanged row by the item it was built from. Put it straight into a template expression as before. It is iterable, so spreading it (`[...h.map(rows, fn)]`), nesting it inside an array, or returning it from a function all still work and expand to templates — but each of those builds every row, which is the work the identity shortcut exists to skip. A row is now reused for as long as its item is `===` to the one that built it, which means primitives compare by value where they previously rebuilt every render.
- **Much faster list re-renders.** A same-length list in which only a few rows changed no longer scans the list at all: only the changed positions are built and patched, so a selection or a partial update costs work proportional to the change. A list that changed length follows the offset an insertion or removal creates instead of treating every later row as changed. The persistent per-item template cache is gone, replaced by a map built on demand from the rows a list already holds — it had been paying a write for every row of every list ever built, and holding each template alive for as long as the caller held the item.
- **Faster list creation.** An attribute whose whole value is one expression is no longer baked into the parsed template as an empty attribute, so every clone carries one fewer attribute and an empty value now writes nothing at all. Visible consequence: `class=${''}` leaves the element with no `class` attribute rather than `class=""`, and an object- or function-valued attribute on a component (which has no string form) no longer leaves an empty attribute behind. Also, the path-resolution program can walk siblings as well as descend, cutting the pointer walks a typical table row needs; delegated event dispatchers are registered once per template per root instead of being checked at every bound node; and a full list replace now detaches its parent before emptying it, not after.
- **Re-rendering a component no longer re-binds event handlers that didn't change.** A root template's `onclick=${this.method}` bindings are the same handlers on every render, and re-binding them is provably a no-op, so they're skipped. Together with the list work, a `render()` where nothing at all changed is now several times cheaper.
- An element's render closure is cached even when `render()` passes options, which is how it is usually written.
- Two shapes that a benchmark wouldn't catch were measured and fixed along the way: a partial update of a very long list, and inserting rows into the middle or the front of one. Both used to fall off the fast path and build a lookup map of every row; the reconciler now works out whether a list was reordered (where such a map pays) or merely had its contents changed (where it doesn't).

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
