# Changelog

All notable changes to Solarite are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/). While the version is below 1.0, minor releases may include breaking changes; these are called out below.

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
