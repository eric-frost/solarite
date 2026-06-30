# vite-plugin-solarite

Compiles JSX/TSX into **Solarite precompile output** so JSX renders at the **same speed as `h` tagged
templates**. It runs in Vite's `enforce: 'pre'` slot (before Vite's own JSX handling) and only at
build time — nothing is shipped to the browser.

Thin wrapper around [`babel-plugin-solarite`](../babel-plugin-solarite), which does the actual
compiling.

```sh
npm install --save-dev vite-plugin-solarite
```

```js
// vite.config.js
import solarite from 'vite-plugin-solarite';
export default { plugins: [solarite()] };
```

## Options

- `importSource` — runtime module specifier (default `"solarite/jsx-runtime"`).
