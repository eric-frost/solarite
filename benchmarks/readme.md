These are implementations for krausest's  https://github.com/krausest/js-framework-benchmark.

To use them, either copy them or symbolic link these folders into the frameworks/keyed and frameworks/non-keyed folders.


## How to run the js-framework-benchmark tests

### To Run a test:
Run `npm start` from the folder where you've cloned the js-framework-benchmark repository.
in another command window:


```
cd webdriver-ts
npm run bench non-keyed/solarite-naive keyed/solarite-naive
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
npm run bench non-keyed/solarite-naive keyed/solarite-naive keyed/redcomponent keyed/vanillajs keyed/inferno keyed/solid keyed/svelte keyed/vue keyed/lit keyed/preact keyed/react keyed/angular keyed/ember keyed/knockout keyed/alpine non-keyed/mikado non-keyed/delorean non-keyed/vanillajs non-keyed/vanillajs-1 non-keyed/inferno non-keyed/lit non-keyed/redcomponent non-keyed/svelte non-keyed/vue non-keyed/react
```

### Run a single benchmark within a test (partialUpdate below - numbers start with 01_)
```
cd webdriver-ts
npm run bench -- --framework keyed/redcomponent --benchmark 09_
cd ../webdriver-ts-results
npm ci
cd ../webdriver-ts
npm run results
```

### To see if it's keyed:
npm run isKeyed keyed/redcomponent

### Run Instance for testing
From the keyed/redcomponent folder:
`npm run build-prod`
http://localhost:8080/frameworks/non-keyed/redcomponent/index.html

