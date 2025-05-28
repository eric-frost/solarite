These are implementations for krausest's  https://github.com/krausest/js-framework-benchmark.

To use them, either copy them or symbolic link these folders into the frameworks/keyed and frameworks/non-keyed folders:

From within the keyed folder:
mklink /J solarite "../../../lib/solarite/benchmarks/watch"


## How to run the js-framework-benchmark tests

### To Run a test:
Run `npm start` from the folder where you've cloned the js-framework-benchmark repository.
in another command window:


```
cd webdriver-ts
npm run bench non-keyed/solarite keyed/solarite non-keyed/solarite-naive keyed/solarite-naive
cd ../webdriver-ts-results
npm ci
cd ../webdriver-ts
npm run results
cd ../
```
Then open:
http://localhost:8080/webdriver-ts-results/table.html

### Run every test I care about:

```
npm run bench non-keyed/solarite-naive keyed/solarite-naive keyed/solarite keyed/vanillajs keyed/inferno keyed/solid keyed/svelte keyed/vue keyed/lit keyed/preact keyed/react keyed/angular keyed/ember keyed/knockout keyed/alpine non-keyed/mikado non-keyed/delorean non-keyed/vanillajs non-keyed/vanillajs-1 non-keyed/inferno non-keyed/lit non-keyed/solarite non-keyed/svelte non-keyed/vue non-keyed/react
```

### Run a single benchmark within a test (partialUpdate below - numbers start with 01_)
This doesn't seem to work.
```
cd webdriver-ts
npm run bench -- --framework keyed/solarite --benchmark 04_
cd ../webdriver-ts-results
npm ci
cd ../webdriver-ts
npm run results
```

### To see if it's keyed:
npm run isKeyed keyed/solarite

### Run Instance for testing
From the keyed/solarite folder:
`npm run build-prod`
http://localhost:8080/frameworks/non-keyed/solarite/index.html

