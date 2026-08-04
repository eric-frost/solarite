These are implementations for krausest's https://github.com/krausest/js-framework-benchmark.

## Folders

- `solarite/` - The non-keyed implementation. Merged upstream as `frameworks/non-keyed/solarite`.
- `solarite-keyed/` - The keyed implementation. Same app, but the row template uses `key=${row.id}` and the title says keyed.
- `vanilla3/` - A vanilla-js reference implementation used for local comparison.
- `real-world/` - Solarite-only coverage for nested components, scoped styles, forms, SVG, raw Nodes, and long keyed reorders. It reports each workload separately rather than inventing a composite score.
- `results/` - Historical local benchmark results.

Each implementation's `Solarite.min.js` is a symlink to `../../dist/Solarite.min.js`, so run `bash build/build.bat` after changing `src/` and both entries pick up the new build.

## Wiring into the local benchmark repo

The local benchmark repo is `/home/projects/local/js-framework-benchmark`. The code lives only in this repo; the benchmark repo links to it:

- `frameworks/non-keyed/solarite/main.js` is a symlink to `benchmarks/solarite/main.js` here. Its `index.html`, `package.json`, and `Solarite.min.js` are real files; make sure min.js is current before measuring.
- `frameworks/keyed/solarite` is a whole-folder symlink to `benchmarks/solarite-keyed` here.
- `frameworks/keyed/solarite-non-keyed` shows the non-keyed implementation in keyed comparisons. It holds per-file symlinks into `../../non-keyed/solarite/` plus its own package.json. It is local-only; never PR it upstream.

Upstream PRs need real files: the krausest CI builder breaks on symlinks. Copy the files when preparing a PR.

## Quick manual test

Start the server with `npm start` from the benchmark repo root, then open:

- http://localhost:8080/frameworks/non-keyed/solarite/
- http://localhost:8080/frameworks/keyed/solarite/

Append `?benchmark=10` to run the built-in 10x benchmark loop (cold/warm/best reporting in the console).

Open `http://solarite.loc/benchmarks/real-world/` for the broader application suite, or append `?runs=12` to run it immediately. Each sample includes synchronous Solarite work plus a forced layout. Compare revisions back-to-back in the same browser session; the numbers are not absolute performance claims and are not part of js-framework-benchmark.

## Commands

All from the benchmark repo root unless noted.

```bash
# Build + smoketest one implementation (also runs the keyedness check):
npm run rebuild-ci keyed/solarite

# Keyedness check alone (from webdriver-ts/):
node dist/isKeyed.js --headless --chromeBinary /usr/bin/google-chrome keyed/solarite

# CSP compliance (from webdriver-ts/, exit 0 = pass):
node dist/isCSPCompliant.js --headless --chromeBinary /usr/bin/google-chrome keyed/solarite

# Benchmark one framework (from webdriver-ts/):
node dist/benchmarkRunner.js --runner playwright --headless true --framework keyed/solarite

# Or via npm from the repo root:
npm run bench -- --framework keyed/solarite

# Rebuild the results page, then open http://localhost:8080/webdriver-ts-results/dist/index.html
npm run results
```

## Measuring tips

- Always A/B old-vs-new builds back-to-back on the same machine state; never compare against results from another day.
- Disable video wallpapers and close parallel Chrome instances (including the chrome-devtools MCP) during runs.
- Headless playwright captures paint events correctly.
- The local Testimony benchmarks (`cd tests && bash run.bat Benchmark`) are a faster proxy: 10x iframe runs for solarite, solarite-keyed, and vanilla3.
