# Solarite

Solarite makes native web components fast to update, with no build step and no signals. You write plain JavaScript and call `render()` when your data changes; Solarite then patches only the DOM that actually changed. It's tiny (12KB min+gzip) and runs straight in the browser as a standard ES module.

**[Documentation & live examples →](https://vorticode.github.io/solarite/)**

## Install

```bash
npm install solarite
```

Or use it with no build step at all, straight from a CDN:

```javascript
import h, {Solarite} from
  'https://cdn.jsdelivr.net/npm/solarite@0.7.0/dist/Solarite.min.js';
```

## Example

```javascript
import h, {Solarite} from 'solarite';

class Counter extends Solarite {
  count = 0;

  render() {
    h(this)`
      <my-counter>
        <button onclick=${() => { this.count++; this.render() }}>
          Clicked ${this.count} times
        </button>
      </my-counter>`;
  }
}
Counter.define('my-counter');
document.body.append(new Counter());
```

## Why Solarite?

It's one of the fastest UI libraries measured: a score of **1.08** on the [js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/current.html) — about 8% slower than hand-written vanilla JavaScript — while staying tiny and build-free.

### Compared to Lit

Lit is the best-known way to build web components. Here's where Solarite differs:

- **Scoped CSS without Shadow DOM.** Solarite scopes each component's `<style>` in the light DOM, so global stylesheets, form participation, and third-party CSS still reach your elements. There's no Shadow DOM boundary to work around.
- **No reactivity system to learn.** No signals, no `@property` decorators, no reactive controllers. Mutate plain JavaScript objects and arrays of any depth, then call `render()`. Updates happen exactly when you ask for them.
- **Truly build-free.** Ship the ES module as-is. Optional JSX plugins exist for Babel, esbuild, and Vite, but nothing requires a compiler.
- **Closer to vanilla speed.** Solarite sits near the top of the benchmark, ahead of most signal-based and virtual-DOM libraries.

The trade-off is deliberate: Solarite re-renders when you call `render()` rather than tracking dependencies automatically. Explicit updates, no hidden reactivity — a design choice, not a missing feature.

## License

[MIT](LICENSE) — free for commercial use, no attribution required.
