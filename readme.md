# Solarite

Solarite makes native web components fast to update, with no build step and no signals. You write plain JavaScript and call `render()` when your data changes; Solarite then patches only the DOM that changed. It's small (12.6KB with Brotli) and runs straight in the browser as a standard ES module.

**[Documentation & live examples →](https://eric-frost.github.io/solarite/docs/)**

## Install

```bash
npm install solarite
```

Or use it with no build step at all, straight from a CDN:

```javascript
import h, {Solarite} from
  'https://cdn.jsdelivr.net/npm/solarite@0.8.0/dist/Solarite.min.js';
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

It's one of the fastest UI libraries measured.  It scores **1.07** on the [js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/current.html), where hand-written vanilla JavaScript scores 1.01 and lower is better.

### Compared to Lit

[Lit](https://lit.dev/) is a popular library for building web components. Here's where Solarite differs:

- **Scoped CSS without Shadow DOM.** Solarite scopes each component's `<style>` in the light DOM, so global stylesheets, form participation, and third-party CSS still reach your elements. There's no Shadow DOM boundary to work around.
- **No reactivity system to learn.** No signals, no `@property` decorators, no reactive controllers. Mutate plain JavaScript objects and arrays of any depth, then call `render()`. Updates happen exactly when you ask for them.
- **No build step.** Solarite works in vanilla JS with a single import statement.  JSX plugins for Babel, esbuild, and Vite are there if you want them.
- **Closer to vanilla speed.** Solarite sits near the top of the [js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/current.html), ahead of most signal-based and virtual-DOM libraries.

The trade-off is that Solarite doesn't track dependencies for you.  It re-renders when you call `render()`.

## License

[MIT](LICENSE).  Free for commercial use, no attribution required.
