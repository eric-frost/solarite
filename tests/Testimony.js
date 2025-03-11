/**
 * Provide functionality for running Deno tests in a web browser.
 * Has no external dependencies.
 *
 * TODO:
 *
 * 4.  Integrate with IntelliJ file watcher so we run cmd line tests when files change.
 * 5.  Run tests from @expect doc tags.
 * 6.  Documentation - Web tests, deno tests, intellij integration
 * 7.  Add to github.
 * 8.  Command line via node or Deno
 * 9.  Support other Deno options.
 * 11. URLs only mark which tests to include or exclude, to make url shorter
 * 12. Auto-expand to failed tests.
 */

class AssertError extends Error {
	constructor(expected, actual, op) {
		super('Assertion Failed');
		this.name = "AssertError";
		this.expected = expected;
		this.actual = actual;
		this.op = op;
	}
}

function assert(val) {
	if (!val) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(val, true);
	}
}

Object.assign(assert, {
	eq(expected, actual) {
		if (!isSame(expected, actual)) { // JUnit, PhpUnit, and mocha all use the order: expected, actual.
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(expected, actual, '==');
		}
	},

	eqJson(expected, actual) {
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(expected, actual);
		}
	},

	neq(val1, val2) {
		if (isSame(val1, val2)) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1 + ' === ' + val2);
		}
	},

	lte(val1, val2) {
		if (val1 > val2) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1 + ' > ' + val2);
		}
	}
});



/**
 * https://stackoverflow.com/a/6713782/
 * Modified to also compare Nodes.
 * @param x
 * @param y
 * @return {boolean} */
function isSame( x, y ) {
	if (x === y)
		return true; // if both x and y are null or undefined and exactly the same

	if (x instanceof Node || y instanceof Node)
		return x === y;

	// if they are not strictly equal, they both need to be Objects
	// they must have the exact same prototype chain, the closest we can do is
	// test their constructor.
	if (!(x instanceof Object) || !(y instanceof Object) || x.constructor !== y.constructor)
		return false;

	for (var p in x) {
		if (!x.hasOwnProperty(p))
			continue; // other properties were tested using x.constructor === y.constructor

		if (!y.hasOwnProperty(p))
			return false; // allows to compare x[ p ] and y[ p ] when set to undefined

		if (x[p] === y[p])
			continue; // if they have the same strict value or identity then they are equal

		if (typeof x[p] !== "object" || !isSame(x[p], y[p])) // Numbers, Strings, Functions, Booleans must be strictly equal
			return false; // Objects and Arrays must be tested recursively
	}

	for (p in y) // allows x[ p ] to be set to undefined
		if (y.hasOwnProperty(p) && !x.hasOwnProperty(p))
			return false;

	return true;
}

// Html.encode()
function h(text, quotes='"') {
	text = (text === null || text === undefined ? '' : text+'')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\a0/g, '&nbsp;')
	if (quotes.includes("'"))
		text = text.replace(/'/g, '&apos;');
	if (quotes.includes('"'))
		text = text.replace(/"/g, '&quot;');
	return text;
}

if (!globalThis.HTMLElement) // Don't define this when running from command line.
	globalThis.HTMLElement = function(){};

class TestItem extends HTMLElement {

	/** @type {Test} */
	test;

	statusContainer;
	childContainer;
	errorMessage;

	/** @type {HTMLInputElement} */
	expandCB;

	/** @type {HTMLInputElement} */
	enableCB;

	/** @param test {Test} */
	constructor(test) {
		super();
		this.test = test;
		test.element = this;

		let url = new URL(window.location);
		let r = url.searchParams.getAll('r');
		let parent = name;
		do {
			// Enable test if a parent is enabled.
			if (r.includes(parent)) {
				this.isEnabled = true;
				break;
			}
			parent = parent.split('.').slice(0, -1).join('.')
		} while (parent);


		this.render();
	}

	/**
	 * Called when the enabled checkbox is clicked. */
	clickEnable() {
		this.test.enabled = this.enableCB.checked;

		// Check all children if this is checked.
		[...this.childContainer.querySelectorAll('test-item')].map(testItem => {

			// Unchecking a parent can disable underscored tests.
			// But checking a parent can't enable underscored tests.
			let isUnderscored = testItem.test.getShortName().startsWith('_');
			if (this.enableCB.checked && !isUnderscored)
				testItem.enableCB.checked = true;
			if (!this.enableCB.checked)
				testItem.enableCB.checked = false;
		});

		// Make every parent checked if all its children are checked.
		let p = this;
		while (p = p.parentNode)
			if (p.nodeType === 1 && p.matches('test-item'))
				p.querySelector('[name=r]').checked = ![...p.childContainer.querySelectorAll('[name=r]:not([data-disabled])')].find(cb => !cb.checked);
	}

	/**
	 * Called when the expand button is clicked. */
	clickExpand() {
		this.test.expanded = this.expandCB.checked;
		this.childContainer.style.display = this.expandCB.checked ? '' : 'none';
	}

	interval;

	/**
	 * Update the html that shows the status. */
	renderStatus() {
		const clearCounter = () => {
			clearInterval(this.interval);
			this.statusContainer.innerHTML = '';
		}

		this.statusContainer.className = '';

		if (this.test.status === TestStatus.NotStarted) {
			clearCounter();
		}

		else if (this.test.status === TestStatus.Running || this.test.status === TestStatus.RunningChildFailed) {
			if (this.test.status === TestStatus.Running)
				this.className = 'running';
			else
				this.className = 'runningChildFailed';

			if (this.lastStatus !== TestStatus.Running && this.lastStatus !== TestStatus.RunningChildFailed) {
				if (this.test.name === 'DBTestMySQLi')
					console.log(this.lastStatus, this.test.status)

				this.statusContainer.innerHTML = 0;
				clearInterval(this.interval);
				this.interval = setInterval(() => {
					this.statusContainer.innerHTML = parseInt(this.statusContainer.innerHTML) + 1;
				}, 1000);
			}
		}

		else if (this.test.status === TestStatus.Pass) {
			clearCounter();
			this.className = 'pass';
		}
		else { // false, Error
			clearCounter();
			this.className = 'fail';
		}

		if (this.test.status instanceof Error)
			this.errorMessage.innerHTML = this.test.status.message;
		else
			this.errorMessage.innerHTML = '';

		this.lastStatus = this.test.status;
	}

	render() {
		// TODO: Add these styles once in the document head.
		this.innerHTML = `
		<style>		
			test-item label { display: inline-flex; gap: 8px }
			test-item input[type=checkbox] { width: 8px; appearance: none; margin: 0; color: inherit }						
			test-item [data-id=expandCB]:after { content: '+'; user-select: none; cursor: pointer }		
			test-item [data-id=expandCB]:checked:after { content: '–' }						
			test-item [data-id=enableCB]:after { content: ' '; color: #55f; font-weight: bold; text-shadow: 1px 0 0 #55f }
			test-item [data-id=enableCB]:checked:after { content: 'x' }						
			test-item > div > label > [data-id=statusContainer] { line-height: 1; display: inline-block; min-width: 8px; max-width: 8px; font-weight: bold }
			test-item.running > div > label > [data-id=statusContainer] { position: relative; top: 3px; color: #ff0 }
			test-item.runningChildFailed > div > label > [data-id=statusContainer] { position: relative; top: 3px; color: #f00 }
			test-item.pass > div > label > [data-id=statusContainer]::before { position: relative; top: 3px; color: #0c0; content: '✓' }
			test-item.fail > div > label > [data-id=statusContainer]::before { color: #f00; content: 'x' }
			test-item [data-id=childContainer] { padding-left: 26px }
		</style>					
		<div style="display: flex; gap: 8px">
			<!-- Expand button -->
			<div style="display: inline-block; min-width: 8px">
				${Object.keys(this.test.children || {}).length
			? `<input data-id="expandCB" type="checkbox" name="x" value="${h(this.test.name)}"
							${this.test.expanded ? 'checked' : ''}
							onchange="this.closest('test-item').clickExpand()">`
			: ``}
			</div>
			<label>
			
				<!-- Enabled -->
				<span style="white-space: nowrap">[<input data-id="enableCB" type="checkbox" name="r" value="${h(this.test.name)}"
					${this.test.enabled ? 'checked' : ''}
					onchange="this.closest('test-item').clickEnable()">]</span>
				
				<!-- Status -->
				<span data-id="statusContainer"></span>
				
				<!-- Name -->
				${h(this.test.getShortName())}
				
			</label>	
			<span style="opacity: .5">${h(this.test.desc)}</span>
			<div data-id="errorMessage" style="color: red; padding-left: 62px"></div>
		</div>
		<div data-id="childContainer" ${this.test.expanded ? `` : `style="display: none"`}></div>`;

		// Assign id's
		[...this.querySelectorAll('[data-id]')].map(el => {
			this[el.dataset.id] = el;
		});

		// Create child tests
		for (let testName in this.test.children) {
			let childTest = this.test.children[testName];
			let child = new TestItem(childTest);
			this.childContainer.append(child);
		}
	}
}

if (globalThis.customElements?.define)
	customElements.define('test-item', TestItem);

/** @enum */
export const TestStatus = {
	NotStarted: 'NotStarted',
	Running: 'Running',
	RunningChildFailed: 'RunningChildFailed',
	Pass: 'Pass',
	Fail: 'Fail', // Assert fail
	//Error: 'Error', // Error thrown
};

/**
 * The data for a test. */
class Test {
	name;
	desc;

	isSynchronous = false;

	/** @type Test */
	parent = null;

	/**
	 * @type {?Object<name:string, Test>} Null if it's a leaf node. */
	children = null;

	/**
	 * Every test will have either a fn OR children.
	 * @type {?function} */
	fn = null;

	expanded = true;
	enabled = true;

	/**
	 * @type {TestStatus|Error} */
	status = TestStatus.NotStarted;

	/** @type {TestItem} The WebComponent used to render this test.*/
	element;

	/**
	 * @param name {string}
	 * @param desc {string}
	 * @param fn {function
	 * @param isSynchronous {boolean}
	 * @param parent {?Test}} */
	constructor(name='', desc='', fn=null, isSynchronous=false, parent=null) {
		this.name = name;
		this.desc = desc;
		this.fn = fn;
		this.isSynchronous = isSynchronous;
		this.parent = parent;

		if (globalThis.window?.location) {
			this.enabled = this.getEnabledFromUrl();
			this.expanded = this.getExpandedFromUrl();
		}
	}

	getEnabledFromUrl() {
		let url = new URL(window.location);

		// Used by Deno.
		if (url.searchParams.has('allTests'))
			return !this.getShortName().startsWith('_');

		else {
			let r = url.searchParams.getAll('r');

			// Check even underscored names if they're selected (and not just a parent)
			if (r.includes(this.name))
				return true;

			let parent = this.name;
			do {
				// Enable test if a parent is enabled and the name doesn't start with _.
				if (r.includes(parent)) {
					return !this.getShortName().startsWith('_');
				}
				parent = parent.split('.').slice(0, -1).join('.')
			} while (parent);
		}

		return false;
	}


	getExpandedFromUrl() {
		// Expand root level (with no name) by default.
		return this.name === '' || (new URL(window.location)).searchParams.getAll('x').includes(this.name);
	}

	updateStatusFromChildren() {
		if (this.children) {


			/** @type {Object<string, int>} a count of each status type. */
			let status = {}
			let childCount = Object.keys(this.children).length;
			for (let child of Object.values(this.children)) {
				let s = child.status;
				if (s instanceof Error)
					s = TestStatus.Fail;
				status[s] = (status[s] || 0) + 1;
			}

			// If at least one failing
			if (status[TestStatus.RunningChildFailed] || (status[TestStatus.Fail] && status[TestStatus.Running]))
				this.status = TestStatus.RunningChildFailed;
			else if (status[TestStatus.Fail])
				this.status = TestStatus.Fail;

			// If at least one passing, none failing.
			else if (status[TestStatus.Pass] && !status[TestStatus.Fail] && !status[TestStatus.Running] && !status[TestStatus.RunningChildFailed])
				this.status = TestStatus.Pass;
			else if (status[TestStatus.Running])
				this.status = TestStatus.Running;
			else
				this.status = TestStatus.NotStarted;

			// if (this.name === 'DBTestMySQLi')
			// 	console.log(status, this.status)

			if (this.element)
				this.element.renderStatus();

			if (this.parent)
				this.parent.updateStatusFromChildren();
		}

	}

	/**
	 * Run this test or its children. */
	async run(synchronous=false) {

		// A test to run.
		if (this.fn && this.enabled) {
			let doIt = async () => {
				let status = await this.fn(this);
				if (Object.keys(TestStatus).includes(status))
					this.status = status;
				else if (status !== false)
					this.status = TestStatus.Pass;
				return status;
			};

			this.status = TestStatus.Running;
			if (this.element)
				this.element.renderStatus();

			let pass = false;
			try {
				if (Testimony.throwOnError) {
					await doIt();
					pass = true;
				} else {
					try {
						await doIt();
						pass = true;
					} catch (e) {
						this.status = e;
						console.error(e)
						Testimony.failedTests.push([this.name, Testimony.shortenError(e, '\n')]);
					}
				}
			}
			finally {
				if (!pass) {
					this.status = TestStatus.Fail;
				}

				if (this.element)
					this.element.renderStatus();
				if (this.parent)
					this.parent.updateStatusFromChildren();
			}
		}

		// A node containing other tests.
		if (!this.fn) {

			let childTests = Object.values(this.children || {})
				.filter(t => t.children || t.isSynchronous===synchronous);   // includes test groups

			// Sync tests
			if (synchronous) {
				for (let child of childTests)
					if (child.enabled && child.status === TestStatus.NotStarted)
						child.status = TestStatus.Running;
				this.updateStatusFromChildren();

				for (let child of childTests)
					await child.run(synchronous); // One at a time.

				this.updateStatusFromChildren();
			}
			else {

				// Async tests
				let promises = [];
				for (let child of childTests) {
					if (child.fn && child.enabled)
						child.status = TestStatus.Running;

					let promise = child.run(synchronous); // All at once.
					promise.then(() => {
						this.updateStatusFromChildren();
					});
					promises.push(promise);
				}

				this.updateStatusFromChildren();
				await Promise.all(promises);
			}

			this.updateStatusFromChildren();
		}


		return this.status;
	}

	/**
	 * The top level test returns a depth of 0.
	 * @returns {int} */
	getDepth() {
		return ((this.name || '').match(/\./g) || []).length;
	}

	/**
	 * Get the name after the last dot.
	 * @returns {string} */
	getShortName() {
		return /[^.]*$/.exec(this.name)[0];
	}
}

var Testimony = {

	debugOnAssertFail: false,
	throwOnError: true, // throw from original location on assert fail or error.
	expandLevel: 1,

	rootTest: new Test(),
	failedTests: [],

	finished: false,

	/**
	 * Run the root test and any of the root tests children.
	 * TODO: Separate rendering from running?
	 * @param parent {?HTMLElement}
	 * @returns {Promise<[string, Error][]>}
	 */
	async render(parent) {
		let root = new TestItem(this.rootTest);
		parent.append(root);
	},

	async run() {
		// Let all async tests run and finish before starting any sync tests.
		// This gets us results faster than if we run them in the opposite order.
		await this.rootTest.run(false);
		await this.rootTest.run(true);
		this.finished = true;
	},

	/**
	 * Add a test.
	 *
	 * Arguments can be given in any order, except that name must occur before desc.
	 * @param name {string}
	 * @param desc {string|function()=}
	 * @param html {string|function()=}
	 * @param func {function()=}
	 * @param isSynchronous */
	test(name, desc, html=null, func, isSynchronous=false) {
		let name2, desc2='', html2, func2, isSynchronous2;
		for (let arg of arguments) {
			if (typeof arg === 'function')
				func2 = arg;
			else if (typeof arg === 'boolean')
				isSynchronous2 = arg;
			else if ((arg+'').trim().match(/^<[!a-z]/i)) // an open tag.
				html2 = arg;
			else if (!name2)
				name2 = arg;
			else
				desc2 = arg || '';
		}

		// update func to create and destroy html before and after test.
		// TODO: Move this to TestItem?
		if (html2) {
			let oldFunc = func2;

			// As an iframe.
			if (html2.startsWith('<html') || html2.startsWith('<!')) {
				func2 = async () => {
					var iframe = document.createElement('iframe');
					iframe.style.display = 'none';
					document.body.append(iframe);

					var doc = iframe.contentDocument || iframe.contentWindow.document;
					doc.open();
					doc.write(html2);
					doc.close();

					let result = await oldFunc(doc);
					iframe.parentNode.removeChild(iframe);
					return result;
				};
			}

			// As part of the regular document
			else {
				func2 = async () => {
					let el = createEl(html2);
					document.body.append(el);
					let result = await oldFunc(el);
					document.body.removeChild(el);
					return result;
				}
			}
		}

		// Add to rootTest tree.
		let path = name2.split(/\./g);
		let pathSoFar = [];
		let test = this.rootTest;
		for (let item of path) {
			pathSoFar.push(item);

			if (!test.children)
				test.children = {};

			// If at leaf
			if (pathSoFar.length === path.length)
				test.children[item] = new Test(name2, desc2, func2, isSynchronous2, test); //{name: name2, desc: desc2, func: func2};

			// Create test if it doesn't exist.
			else {
				test.children[item] = test.children[item] || new Test(pathSoFar.join('.'), '', null, isSynchronous2, test);
				test = test.children[item];
			}
		}
	},

	// Internal functions:

	/**
	 * @param error {Error}
	 * @param br {string}
	 * @returns {string} */
	shortenError(error, br='<br>&nbsp;&nbsp;') {
		// slice(0, -3) to remove the 3 stacktrace lines inside Testimony.js that calls runtests.
		let errorStack = error.stack.split(/\n/g).slice(0, -3).join('\r\n');

		errorStack = errorStack.replace(/\r?\n/g, br);
		return errorStack.replace(new RegExp(window.location.origin, 'g'), ''); // Remove server name to shorten error stack.
	},

}















// Here and below is code for running from the command line
// via Deno with a headless Chrome browser and optionally a Deno web server.


/**
 * Requires Deno and a regular Chrome installation.
 * These arguments could be re-thought.
 * @param page {string}
 * @param webServer {string} Url to use if not running our own webserver.
 * @param webRoot {?string}  Used only if webServer is null
 * @param tests {?string[]}
 * @param headless {boolean}
 * @param port {int} Used only if webserer is null.  Defaults to 8004 to not conflict with commonly used development ports like 8000 or 8080.
 * @returns {Promise<void>} */
async function runPage(page, webServer=null, webRoot=null, tests=null, headless=false, port=8004) {

	/*
	import puppeteer from 'https://esm.sh/puppeteer@13.0.0';
	import { serve } from 'https://deno.land/std/http/server.ts';
	import { serveFile } from 'https://deno.land/std@0.102.0/http/file_server.ts';
	import { Launcher } from 'https://esm.sh/chrome-launcher@0.15.0';
	 */

	// Dynamically import so we only pull them in if necessary.
	const [
		{default: puppeteer},
		{Launcher},
		{serve},
		{serveFile},
	] = await Promise.all([
		import('https://deno.land/x/puppeteer@16.2.0/mod.ts'),
		import('https://esm.sh/chrome-launcher@0.15.0'),
		import('https://deno.land/std@0.102.0/http/server.ts'),
		import('https://deno.land/std@0.102.0/http/file_server.ts')
	]);

	const startServer = () => {

		const absWebRoot = Deno.realPathSync(webRoot);
		const server = serve({port: 8004});
		//console.log("HTTP web server running. Access it at: http://localhost:8000/");

		(async () => {
			for await (const request of server) {
				const url = new URL(request.url, `http://${request.headers.get("host")}`);
				const filepath = `${absWebRoot}${url.pathname}`;
				//console.log(filepath)
				try {
					const content = await serveFile(request, filepath);
					request.respond(content);
				} catch {
					request.respond({status: 404, body: "File not found"});
				}
			}
		})();

		return server;
	};

	const stopServer = (server) => {
		server.close();
	};

	const server = webServer
		? null
		: startServer();

	const installations = await Launcher.getInstallations();
	if (installations.length === 0)
		throw new Error("No Chrome installations found.");

	const executablePath = installations[0]; // Use the first found installation


	const browser = await puppeteer.launch({headless, executablePath});
	const browserPage = await browser.newPage();
	let args = [];

	if (!tests)
		args.push('allTests');
	else
		for (let test of tests)
			args.push(`&r=${test}`);


	const url = webServer
		? `${webServer}/${page}?${args.join('&')}`
		: `http:/localhost:${port}/${page}?${args.join('&')}`;
	//console.log(url)
	await browserPage.goto(url);

	// Wait for the tests to finish
	await browserPage.waitForFunction(() => window.Testimony?.finished === true);

	const failedTests = await browserPage.evaluate(() => window.Testimony?.failedTests);
	printTestResult(failedTests);

	await browser.close();
	if (server)
		stopServer(server);

	Deno.exit(failedTests.length ? 1 : 0);
}

function printTestResult(failedTests) {
	if (!failedTests.length)
		console.log(`%cAll tests passed.`, 'color: #0c0');
	else {
		console.log(`These tests failed:`);
		for (const [testName, testError] of failedTests) {
			console.error(`${testName} - %c${testError}`, 'color: red');
		}
	}
}


globalThis.Testimony = Testimony; // used by command line test runner.

export default Testimony;
export {assert, Testimony};


// If Testimony.js is run directly from the command line
if (import.meta.main) {
	let pages = null;
	let imports = null;
	let tests = null;
	let webserver = null;
	let webroot = null;
	let headless = false;
	for (let arg of Deno.args) {

		if (arg.startsWith('--page=')) {
			if (!pages)
				pages = [];
			pages.push(arg.slice('--page='.length));
		}

		else if (arg.startsWith('--import=')) {
			if (!imports)
				imports = [];
			imports.push(arg.slice('--import='.length));
		}

		else if (arg.startsWith('--webroot='))
			webroot = arg.slice('--webroot='.length);

		// Use a different web server instead of running our own.
		else if (arg.startsWith('--webserver='))
			webserver = arg.slice('--webserver='.length);


		else if (arg == '--headless')
			headless = true;

		else if (arg.startsWith('--')) {
			console.error(`Unsupported arg ${arg}`);
			Deno.exit(1);
		}

		// Capture test names to run.
		else {
			if (!tests)
				tests = [];
			tests.push(arg);
		}
	}

	if (webroot && !pages)
		pages = ['index.html'];

	if (pages) {
		for (let page of pages)
			runPage(page, webserver, webroot, tests, headless);
	}
}