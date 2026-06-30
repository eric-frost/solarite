# esbuild-plugin-solarite

Compiles JSX/TSX into **Solarite precompile output** so JSX renders at the **same speed as `h` tagged
templates**. It runs as an esbuild `onLoad` plugin (esbuild only ever sees plain JS) and only at
build time — nothing is shipped to the browser.

Thin wrapper around [`babel-plugin-solarite`](../babel-plugin-solarite), which does the actual
compiling.

```sh
npm install --save-dev esbuild-plugin-solarite
```

```js
import esbuild from 'esbuild';
import solarite from 'esbuild-plugin-solarite';

await esbuild.build({
	entryPoints: ['app.tsx'], bundle: true, outfile: 'app.js',
	plugins: [solarite()]
});
```

## Options

- `importSource` — runtime module specifier (default `"solarite/jsx-runtime"`).
