# babel-plugin-solarite

Compiles JSX/TSX into **Solarite precompile output** — the static HTML of each element is hoisted to
a module-level array and emitted as `jsxTemplate`/`jsxAttr`/`jsxEscape` calls (the same contract
Deno's `jsx: "precompile"` produces). That gives JSX the **same runtime speed as `h` tagged
templates**. Components and elements with a spread become `jsx(tag, props, key)` calls, handled by
Solarite's runtime.

This package is also the shared engine for [`vite-plugin-solarite`](../vite-plugin-solarite) and
[`esbuild-plugin-solarite`](../esbuild-plugin-solarite). Use those if you're on Vite or esbuild; use
this package directly for Babel, or programmatically.

It runs only at build time and is never shipped to the browser. The JSX runtime it targets lives in
the core `solarite` package (`solarite/jsx-runtime`).

## Babel

```sh
npm install --save-dev babel-plugin-solarite
```

```jsonc
// babel.config.json   (add @babel/preset-typescript if you use .tsx)
{ "plugins": ["babel-plugin-solarite"] }
```

The plugin enables JSX parsing itself, so no separate `@babel/plugin-syntax-jsx` is needed. Babel's
shorthand also works: `{ "plugins": ["solarite"] }`.

## Programmatic

```js
import { transform } from 'babel-plugin-solarite';
const { code, map } = transform(src, { filename: 'app.tsx' });
```

## CLI

Prints compiled JS to stdout (TypeScript types stripped) — handy for non-Node hosts shelling out:

```sh
npx solarite-jsx app.tsx > app.js
```

## Options

- `importSource` — runtime module specifier (default `"solarite/jsx-runtime"`).

## Notes

- Use native HTML attribute/event names (`class`, `onclick`), not React's `className`/`onClick`.
- `style={{…}}` objects are serialized to CSS text by the runtime.
- `key={…}` becomes the keyed-list key, never a rendered attribute.
- Static `id`/`data-id` stay in the static HTML so Solarite's `this.x` element references resolve.
