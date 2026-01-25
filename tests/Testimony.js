/**
┏┳┓   •
 ┃▗▖┏╋╻┏┳┓┏┓┏┓┓┏
 ┻┗ ┛┗┗╹╹┗┗┛╹┗┗┫
@copyright Vort┛icode LLC
A testing framework that can run tests in the browser, or command line via Puppeteer.

TODO:
4.  Integrate with IntelliJ file watcher so we run cmd line tests when files change.
5.  Run tests from @expect doc tags.
6.  Documentation - Web tests, deno tests, intellij integration
7.  Add to github.
8.  Command line via node or Deno
9.  Support other Deno options.
11. URLs only mark which tests to include or exclude, to make url shorter
12. Auto-expand to failed tests.

Can't have a test with part of the name being "constructor"
*/


function dump(obj) {
	return JSON.stringify(obj).replace(/\\"/g, '"').replace(/^"/, '').replace(/"$/, '');
}

/*┌──────────────────╮
  | Asserts          |
  └──────────────────╯*/
class AssertError extends Error {
	constructor(msgOrActual='Assertion Failed', expected, op, message) {
		if (message)
			super(message);
		else if (expected !== undefined)
			super(`Failed:\n${dump(msgOrActual)}\n${op}\n${dump(expected)}`);
		else
			super(msgOrActual);
		this.name = "AssertError";
	}
}

function assert(val, message='zZz_unused') {
	if (!val) {
		if (Testimony.debugOnAssertFail)
			debugger;
		if (message === 'zZz_unused')
			message = 'Assertion Failed';
		throw new AssertError(message);
	}
}

Object.assign(assert, {
	eq(actual, expected, message) {
		if (!isSame(actual, expected)) { // JUnit, PhpUnit, and mocha all use the order: expected, actual.
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(actual, expected, '==', message);
		}
	},

	eqJson(actual, expected, message) {
		const jActual = JSON.stringify(actual, null, 2);
		const jExpected = JSON.stringify(expected, null, 2);

		if (jActual !== jExpected) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(jActual, jExpected, 'eqJson', message);
		}
	},

	neq(val1, val2, message) {
		if (isSame(val1, val2)) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1, val2, '!=', message);
		}
	},

	lte(val1, val2, message) {
		if (val1 > val2) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1, val2, ' > ', message);
		}
	},

	lt(val1, val2, message) {
		if (val1 >= val2) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1, val2, ' >= ', message);
		}
	},

	gt(val1, val2, message) {
		if (val1 <= val2) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1, val2, ' <= ', message);
		}
	},

	gte(val1, val2, message) {
		if (val1 < val2) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1, val2, ' < ', message);
		}
	},

	error(fn, message) {
		let throwed = true;
		try {
			fn();
			throwed = false;
		}
		catch (e) {
			if (message) {
				if (!e.message.includes(message)) {
					if (Testimony.debugOnAssertFail)
						debugger;
					throw new AssertError(`Expected error: '${message}' But got: '${e.message}'`);
				}
			}
		}
		if (!throwed) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError('Function did not throw an error.');
		}
	}
});



/*┌──────────────────╮
  | Utility Functions|
  └──────────────────╯*/

function createEl(html) {
	let el = document.createElement('div');
	el.innerHTML = html;
	return el.firstChild;
}

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
function enc(text, quotes='"') {
	text = ((text === null || text === undefined) ? '' : text+'')
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

/**
 * Run fn() inside the iframe, await'ing for it to complete, then returning the result.
 * If the iframe is not initialized, first wait for it to init.
 * @param iframe {HTMLIFrameElement}
 * @param fn {function}
 * @param args {any[]}
 * @return {Promise<any>} */
async function runWithinIframe(iframe, fn, args) {
	// Ensure the iframe exists and is initialized enough for scripting
	if (!iframe.contentWindow || !iframe.contentDocument) {
		await new Promise(resolve => iframe.addEventListener('load', () => resolve(), {once: true}));
	}

	// If the iframe is blank or lacks a <base>, write minimal HTML so dynamic import() resolves URLs the same as parent.
	// const doc = iframe.contentDocument;
	// const needsInit = !doc.documentElement || !doc.head || !doc.head.querySelector('base');
	// if (needsInit) {
	// 	doc.open();
	// 	doc.write(`<!doctype html><html><head><base href="${document.baseURI}"></head><body></body></html>`);
	// 	doc.close();
	// }

	// Stash args on both the iframe and parent windows so we can pass complex objects by reference
	const w = iframe.contentWindow;
	const argsKey = `__runWithinArgs_${Math.random().toString(36).slice(2)}`;
	const fnKey = `__runWithinFn_${Math.random().toString(36).slice(2)}`;
	w[argsKey] = args;
	window[argsKey] = args;

	// Define the function inside the iframe realm and invoke it there so 'document' refers to the iframe's document.
	w.eval(`window["${fnKey}"] = ${fn.toString()}`);
	try {
		let code = `(async () => { 
			try {		
				return await window["${fnKey}"].apply(null, window["${argsKey}"])
			} finally { 
				delete window["${fnKey}"]; 
				delete window["${argsKey}"] 
			} 
		})()`
		return await w.eval(code);
	} finally {
		try { delete w[argsKey] } catch {}
		try { delete window[argsKey] } catch {}
	}
}



/*┌──────────────────╮
  | TestComponent UI |
  └──────────────────╯*/

if (!globalThis.HTMLElement) // Don't define this when running from command line.
	globalThis.HTMLElement = function(){};

/**
 * Render a test as HTML elements. */
class TestComponent extends HTMLElement {

	/** @type {Test} */
	test;

	statusContainer;
	resultContainer;
	errorMessage;
	childContainer;

	/** @type {HTMLInputElement} */
	expandCB;

	/** @type {HTMLInputElement} */
	enableCB;

	/** @param test {Test} */
	constructor(test) {
		super();
		if (!test)
			return; // This can happen if a test accidently clones the body tag, and everything in it, including this test.
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
		[...this.childContainer.querySelectorAll('test-item')].map(TestComponent => {

			// Unchecking a parent can disable underscored tests.
			// But checking a parent can't enable underscored tests.
			let isUnderscored = TestComponent.test.getShortName().startsWith('_');
			if (this.enableCB.checked && !isUnderscored)
				TestComponent.enableCB.checked = true;
			if (!this.enableCB.checked)
				TestComponent.enableCB.checked = false;
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

		if (this.test.status instanceof Error) {
			let msg = Testimony.shortenError(this.test.status);
			this.errorMessage.innerHTML = enc(msg).replace(/\r?\n/g, '<br>');
		}
		else
			this.errorMessage.innerHTML = '';

		this.lastStatus = this.test.status;
	}

	renderResult() {
		this.resultContainer.innerHTML = this.test.result === undefined ? '' : this.test.result;
	}

	render() {
		// If it's html, print it as is, instead of our own style with 50% opacity.
		const descIsHtml = /^<[^>]+>/.test(this.test.desc.trim());

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
			test-item a { text-decoration: none }
		</style>					
		<div style="display: flex; gap: 8px">
			<!-- Expand button -->
			<div style="display: inline-block; min-width: 8px">
				${Object.keys(this.test.children || {}).length
			? `<input data-id="expandCB" type="checkbox" name="x" value="${enc(this.test.name)}"
							${this.test.expanded ? 'checked' : ''}
							onchange="this.closest('test-item').clickExpand()">`
			: ``}
			</div>
			<label>
			
				<!-- Enabled -->
				<span style="white-space: nowrap">[<input data-id="enableCB" type="checkbox" name="r" value="${enc(this.test.name)}"
					${this.test.enabled ? 'checked' : ''}
					onchange="this.closest('test-item').clickEnable()">]</span>
				
				<!-- Status -->
				<span data-id="statusContainer"></span>
				
				<!-- Name -->
				<span>
					${enc(this.test.getShortName())}${this.test.externalUrl ? `<a 
						href="${enc(this.test.externalUrl)}" target="_blank" title="Open external test url in new tab">🡵</a>` : ''}
					${descIsHtml ? this.test.desc : `<span style="opacity: .5">${this.test.desc}</span>`}
				</span>
			</label>	
			<div data-id="resultContainer" style="color: #77f"></div>
			<div data-id="errorMessage" style="color: red"></div>
		</div>
		<div data-id="childContainer" ${this.test.expanded ? `` : `style="display: none"`}></div>`;

		// Assign id's
		[...this.querySelectorAll('[data-id]')].map(el => {
			this[el.dataset.id] = el;
		});

		// Create child tests
		for (let testName in this.test.children) {
			let childTest = this.test.children[testName];
			let child = new TestComponent(childTest);
			this.childContainer.append(child);
		}
	}
}

if (globalThis.customElements?.define)
	customElements.define('test-item', TestComponent);

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
	html;
	setup;
	teardown;

	/** If set, this is an external test. */
	externalUrl;

	isSynchronous = false;
	isIframe = false;

	iframeTestArgs = []; // arguments given to iframe function

	/** @type Test */
	parent = null;

	/**
	 * @type {?Record<name:string, Test>} Null if it's a leaf node. */
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

	/** @type {TestComponent} The WebComponent used to render this test.*/
	element;

	/**
	 * @param name {string}
	 * @param desc {string}
	 * @param fn {function}
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


			/** @type {Record<string, int>} a count of each status type. */
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
		if (this.fn && this.enabled)
			await this.runTestAndHandleResult();

		// A node containing other tests.
		if (!this.fn)
			await this.runChildren(synchronous);

		return this.status;
	}

	async runTest(setupResponse) {
		let el, iframe;

		// update func to create and destroy html before and after test.

		// As an iframe.
		if (this.isIframe) {
			iframe = document.createElement('iframe');
			iframe.setAttribute('style', 'width: 100%; height: 600px; border: none;');
			//el.style.display = 'none';
			document.body.append(iframe);
			const doc = iframe.contentDocument;

			const trimmedHtml = (this.html || '').trim();
			const isFullDoc = trimmedHtml.startsWith('<html') || trimmedHtml.startsWith('<!');
			const html = isFullDoc
				? this.html
				: `<!DOCTYPE html>
						<html lang="en">
							<head>
								<meta charset="UTF-8">
								<base href="${document.baseURI}">
								<style>body { background: white }</style>
							</head>
							<body>${this.html || ''}</body>
						</html>`;
			doc.open();
			doc.write(html);
			doc.close();
		}

		// As part of the regular document
		else if (this.html) {
			el = createEl(this.html);
			document.body.append(el);
		}

		let context = new TestimonyContext(this, iframe, {
			assert,
			testName: this.name,
			setupResult: setupResponse,

			// Let a frame screenshot itself by calling await context.screenshot();
			// TODO: Is this unused?
			screenshot2: async () => {
				if (this.isIframe) {

					if (!globalThis.__testimonyScreenshot)
						return null;

					// Mark the iframe so Puppeteer can find it on the outer page.
					iframe.setAttribute('id', 'screenshot-iframe');
					// When running under Puppeteer, a bridge function is exposed.
					let result = await globalThis.__testimonyScreenshot(this.name);
					iframe.removeAttribute('id');
					return result;
				}
			}
		});

		const catchError = error => {
		//	pass = false;
			this.status = error.error;
		}

		// Catch errors from connectedCallback and other uncatchable errors:
		window.addEventListener("error", catchError);
		window.addEventListener("unhandledrejection", catchError);

		// Run
		let status;
		if (this.isIframe) {
			let args = [
				...this.iframeTestArgs,
				context
			]
			status = await runWithinIframe(iframe, this.fn, args);
			iframe.remove();
		}
		else if (el)
			// Async functions can sometimes mess up the catchError handler
			// And make it register for the wrong function.
			// So we only run the function as async if it's actually async.
			status =  isAsyncFunction(this.fn)
				? await this.fn(el, setupResponse)
				: this.fn(el, setupResponse);
		else
			status =  isAsyncFunction(this.fn)
				? await this.fn(setupResponse)
				: this.fn(setupResponse);

		window.removeEventListener("error", catchError);
		window.removeEventListener("unhandledrejection", catchError);

		// Remove html
		if (el)
			el.parentNode.removeChild(el);
		return status;
	}



	async runTestAndHandleResult() {
		let setupResponse;
		if (this.setup)
			setupResponse = await this.setup();

		// If running under Puppeteer/Deno, clear old screenshots for this test name before the run.
		try {
			if (globalThis.__testimonyCleanupScreenshots)
				await globalThis.__testimonyCleanupScreenshots(this.name);
		} catch {}

		this.status = TestStatus.Running;
		if (this.element)
			this.element.renderStatus();

		try {
			// Run
			if (Testimony.throwOnError) {
				this.result = await this.runTest(setupResponse);
			}
			else {
				try {
					this.result = await this.runTest(setupResponse);
				} catch (e) {
					this.status = e;
				}
			}
		}
		finally {

			if (this.status instanceof Error) {
				let e = this.status;
				//console.error(e && (e.stack || e.message) ? (e.stack || e.message) : e)
				Testimony.failedTests.push([this.name, Testimony.shortenError(e, '\n')]);
			}
			else {
				this.status = TestStatus.Pass;
				Testimony.passedTests.push(this.name);
			}

			if (this.teardown) // Always call teardown() even on error.
				await this.teardown(setupResponse);

			if (this.element) {
				this.element.renderStatus();
				this.element.renderResult();
			}
			if (this.parent)
				this.parent.updateStatusFromChildren();
		}
	}

	async runChildren(synchronous=false) {
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

class TestimonyContext {
	assert;
	testName;

	/** The result of the setup() function. */
	setupResult;

	/**
	 * @type {function():string} Take a screenshot and save the result to tests/screenshots/,
	 * returning the path relative to the document root.
	 * This is useful for AI's that want to see what they're building while they run tests.  */


	constructor(test, iframe, fields) {
		for (let name in fields)
			if (name in this)
				this[name] = fields[name];

		this.test = test;
		this.iframe = iframe;
	}

	/**
	 * Let a frame screenshot itself by calling await context.screenshot();
	 * @return {Promise<string>} The path to the screenshot relative to the document root. */
	async screenshot() {
		if (this.test.isIframe) {

			if (!globalThis.__testimonyScreenshot)
				return null;

			// Mark the iframe so Puppeteer can find it on the outer page.
			this.iframe.setAttribute('id', 'screenshot-iframe');
			// When running under Puppeteer, a bridge function is exposed.
			let result = await globalThis.__testimonyScreenshot(this.test.name);
			this.iframe.removeAttribute('id');
			return result;
		}
	}
}


/*┌──────────────────╮
  | Testimony Class  |
  └──────────────────╯*/
var Testimony = {

	debugOnAssertFail: false,
	throwOnError: true, // throw from original location on assert fail or error.
	expandLevel: 1,

	rootTest: new Test(),
	passedTests: [],

	/** @type {[string, string][]} E.g: [ [ 'users.account.resetPassword', 'Error: expected 1 to equal 2']] */
	failedTests: [],

	finished: false,

	/**
	 * Check if a test with the given name exists.
	 * @param name {string}
	 * @returns {boolean} */
	testExists(name) {
		let path = name.split(/\./g).filter(part => part.trim().length);
		let test = this.rootTest;
		for (let item of path) {
			if (!test.children || !test.children[item])
				return false;
			test = test.children[item];
		}
		return true;
	},

	/**
	 * Run the root test and any of the root tests children.
	 * TODO: Separate rendering from running?
	 * @param parent {?HTMLElement}
	 * @returns {Promise<[string, Error][]>}
	 */
	async render(parent) {
		let root = new TestComponent(this.rootTest);
		parent.append(root);
	},

	async run() {
		// Verify that all tests requested via 'r=' exist.
		if (globalThis.window?.location) {
			let url = new URL(window.location);
			let requested = url.searchParams.getAll('r');
			for (let name of requested) {
				if (!this.testExists(name)) {
					//this.failedTests.push([name, `Test does not exist.`]);

					// Doing it this way puts a red x on its parent:
					Testimony.test(name, () => {
					 	throw new Error(`Test "${name}" does not exist.`);
					});
				}
			}
		}

		// Let all async tests run and finish before starting any sync tests.
		// This gets us results faster than if we run them in the opposite order.
		await this.rootTest.run(false);
		await this.rootTest.run(true);
		this.finished = true;
	},

	/**
	 * Add a test.
	 * @param name {string} Name of the test shown in the test list.  Use dots for categorization.
	 *    E.g:  'users.account.resetPassword'
	 * @param args {*} The arguments can appear in this order.  Everything is optional except the function.
	 *  - {string} description - shown in the user interface in dark text, next to the test.
	 *  - {string} Html to create an element to pass to the function, if the trimmed version starts with <
	 *  - {synchronous:string|boolean=, setup:?function(), teardown:?function(setupResult:*)}
	 *      If set, run setup() before the test and teardown() after the test passing the result of setup() to teardown().
	 *  - {function(el:HTMLElement|HTMLDocument, setupResult:*)=} The function that performs the test.
	 * @return Test */
	test(name, ...args) {

		// Add to rootTest tree.
		let path = name.split(/\./g).filter(part => part.trim().length);
		let pathSoFar = [];
		let test = this.rootTest;
		for (let item of path) {
			pathSoFar.push(item);

			if (!test.children)
				test.children = {};

			// If at leaf
			if (pathSoFar.length === path.length) {

				let parent = test;
				test = new Test(name, '', null, false, parent);

				// Sort arguments
				for (let arg of args) {
					if (typeof arg === 'function')
						test.fn = arg;
					else if (typeof arg === 'boolean')
						test.isSynchronous = arg;
					else if (arg && typeof arg === 'object') { // new path
						if (arg.desc)
							test.desc = arg.desc;
						if (arg.html)
							test.html = arg.html;
						if (arg.setup)
							test.setup = arg.setup;
						if (arg.teardown)
							test.teardown = arg.teardown;
						if (arg.synchronous)
							test.isSynchronous = arg.synchronous;
					}
					else if ((arg+'').trim().match(/^<[!a-z]/i)) // an open tag.
						test.html = arg;
					else if (typeof arg === 'string')
						test.desc = arg || '';
					else
						throw new Error('Unsupported arg: ' + arg + ' of type ' + typeof arg);
				}

				parent.children[item] = test;
				return test;
			}

			// Create test if it doesn't exist.
			else {
				test.children[item] = test.children[item] || new Test(pathSoFar.join('.'), '', null, false, test);
				test = test.children[item];
			}
		}
	},

	/**
	 * Add a test that runs inside the context of an iframe that will be created and appended to the document.
	 * Arguments are the same as Testimony.test() except for the test function arguments array at the end.
	 * @param name {string} Name of the test shown in the test list.  Use dots for categorization.
	 *    E.g:  'users.account.resetPassword'
	 * @param args {*} Arguments are the same as Testimony.test() except for an additional arguments array at the end.
	 *  - {any[]} An array of arguments to pass to the test function that will run inside the iframe.
	 * @return Test */
	testIframe(name, ...args) {

		// Capture payload from args
		let iframeTestArgs = null;
		for (let i in args)
			if (Array.isArray(args[i])) {
				iframeTestArgs = args[i];
				args.splice(i, 1);
				break;
			}
		if (!iframeTestArgs)
			for (let i in args)
				if (typeof args[i] === 'function') {
					iframeTestArgs = args.splice(parseInt(i)+1);
					break;
			}

		let result = this.test(name, ...args);
		result.isIframe = true;
		result.iframeTestArgs = iframeTestArgs || [];
		return result;
	},

	/**
	 * Run a test on an external URL.
	 * This is commonly used to call tests written in a server-side language.
	 * @param name {string}
	 * @param options {object}
	 * @param url {string}
	 * @param passText {string} If the url returns this text, the test will be marked as passing.
	 * @returns {Test} */
	testExternal(name, options, url, passText='test passed') {
		// Shift arguments if options is not provided.
		if (typeof options === 'string') {
			passText = url || passText;
			url = options;
			options = {};
		}

		let test = Testimony.test(name, options, async () => {
			let resp = await fetch(url);
			let responseText = await resp.text();
			if (!responseText.includes(passText)) {
				// test.status = new Error(responseText); // Mark as failed even if we don't catch it.
				throw new Error(responseText);
			}
		});

		// Allow clicking the link icon to go directly to the test.
		test.externalUrl = url;

		return test;
	},

	/** Used for external tests. */
	async safeImport(path) {
		function parseError(str) {
			// crude tag check
			const hasHtmlTags = /<[^>]+>/.test(str);
			const hasXdebugMarker = /class='xdebug-error/i.test(str);

			if (hasHtmlTags && hasXdebugMarker) {
				const text = str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); // strip HTML
				const match = text.match(/(Fatal error|Parse error|Warning|Notice):.*?(?=( in |$))/i);
				return match ? match[0] : text;
			}

			return str;
		}

		try {
			await import(`${path}?forTestimony=1`); // server must send JS + correct MIME
		} catch (err) {
			// fallback: fetch the same URL manually to see error output
			const resp = await fetch(path);
			const text = await resp.text();

			// List the test with the error in red as the description:
			Testimony.test(
				enc(path.split(/[/\\]/).pop().replace(/\./g, '_')),
				{desc: `<span style="color:#f00">${enc(path)} failed to load:<br>${parseError(text)}</span>`}, () => {
				throw new Error(text)
			});
			console.error('Import failed:', err);
			console.error('Server output:', text);
		}
	},

	// Internal functions:

	/**
	 * @param error {Error}
	 * @param br {string}
	 * @returns {string} */
	shortenError(error, br='\n  ') {
		// slice(0, -3) to remove the 3 stacktrace lines inside Testimony.js that calls runtests.
		let lines = error.stack.split(/\n/g).filter(line => !line.includes('Testimony.js'));
		let errorStack = lines.join('\r\n'); // Remove the line that invokes Testimony.js
		errorStack = errorStack.replace(/\r?\n/g, br);
		return errorStack.replace(new RegExp(window.location.origin, 'g'), ''); // Remove server name to shorten error stack.
	},

}




/*┌──────────────────╮
  | Command Line     |
  └──────────────────╯*/

// Here and below is code for running from the command line via Deno
// with a headless Chrome browser and optionally a Deno web server.


/**
 * Requires Deno and a regular Chrome installation.
 * These arguments could be re-thought.
 * @param path {string}
 * @param webServer {?string} Url to use if not running our own webserver.
 * @param webRoot {?string}  Used only if webServer is null
 * @param tests {?string[]}
 * @param headless {boolean}
 * @param port {int} Used only if webserer is null.  Defaults to 8004 to not conflict with commonly used development ports like 8000 or 8080.
 * @returns {Promise<void>} */
async function runPage(path, webServer=null, webRoot=null, tests=null, headless=false, port=8004) {

	/*
	import puppeteer from 'https://esm.sh/puppeteer@13.0.0';
	import { serve } from 'https://deno.land/std/http/server.ts';
	import { serveFile } from 'https://deno.land/std@0.102.0/http/file_server.ts';
	import { Launcher } from 'https://esm.sh/chrome-launcher@0.15.0';
	 */

	// Set cwd to the same path as Testimony.js.  Is this only needed on windows?
	const scriptDir = new URL(".", import.meta.url);
	Deno.chdir(scriptDir);

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
		const server = serve({port});
		//console.log(`HTTP web server running. Access it at: http://localhost:${port}/`);

		(async () => {
			for await (const request of server) {
				const url = new URL(request.url, `http://${request.headers.get("host")}`);
				const filepath = `${absWebRoot}${url.pathname}`;
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

	// Find Browser
	const installations = await Launcher.getInstallations();
	if (installations.length === 0)
		throw new Error("No Chrome installations found.");
	const executablePath = installations[0]; // Use the first found installation


	// Start Browser
	const browser = await puppeteer.launch({headless, executablePath});
	const page = await browser.newPage();


	// Set tests
	let urlArgs = [];
	if (!tests)
		urlArgs.push('allTests=1');
	else
		for (let test of tests)
			urlArgs.push(`r=${test}`);


	const counts = Object.create(null);


	// Cleanup: Expose bridges for taking and cleaning up screenshots of the test's iframe.
	await page.exposeFunction('__testimonyCleanupScreenshots', testName => CommandLineUtil.screenshotCleanup(testName, counts));
	await page.exposeFunction('__testimonyScreenshot', testName => CommandLineUtil.screenshot(testName, page, counts));

	// Forward page console output to our terminal, preserving error stacks when possible.
	page.on('console', CommandLineUtil.consoleLog);

	let rejectFailure;
	const failure = new Promise((_, reject) => {
		rejectFailure = reject;
	});
	page.on('pageerror', err => {
		const text = `Page error: ${err && (err.stack || err.message) ? (err.stack || err.message) : String(err)}`;
		console.error(`%c${text}`, 'color: #c00');
		rejectFailure(err);
	});

	// Wait for the tests to finish
	// TODO: Also collect errors.
	const success = page.waitForFunction(() => window.Testimony?.finished === true);

	// Go to test pages.
	const url = webServer
		? `${webServer}/${path}?${urlArgs.join('&')}`
		: `http:/localhost:${port}/${path}?${urlArgs.join('&')}`;
	await page.goto(url);

	await Promise.race([success, failure]);

	const failedTests = await page.evaluate(() => window.Testimony?.failedTests);
	const passedTests = await page.evaluate(() => window.Testimony?.passedTests);
	CommandLineUtil.printTestResult(passedTests, failedTests);

	// Sleep for manual testing.
	//await new Promise(resolve => setTimeout(resolve, 500000));

	await browser.close();
	if (server)
		stopServer(server);

	Deno.exit(failedTests.length ? 1 : 0);
}

const CommandLineUtil = {

	async consoleLog(msg) {
		const type = msg.type(); // log, warning, error, etc.
		try {
			const parts = await Promise.all(msg.args().map(arg => arg.executionContext().evaluate(v => {
				if (v instanceof Error)
					return v.stack || v.message;
				if (typeof v === 'string')
					return v;
				try {
					return JSON.stringify(v);
				} catch {
					return String(v);
				}
			}, arg)));
			const text = parts.join(' ');
			if (type === 'error')
				console.error(`%c${text}`, 'color: #c00');
			else
				console.log(text);
		} catch (e) {
			// Fallback if serialization fails
			const text = msg.text();
			if (type === 'error')
				console.error(`%c${text}`, 'color: #c00');
			else
				console.log(text);
		}
	},

	printTestResult(passedTests, failedTests) {
		if (passedTests.length)
			console.log(`%cThese ${passedTests.length} tests passed:\n - ${passedTests.join('\n - ')}`, 'color: #0c0');

		if (!failedTests.length)
			console.log(`%cAll tests passed.`, 'color: #0c0');
		else {
			console.log(`These tests failed:`);
			for (const [testName, testError] of failedTests)
				console.error(`%c${testName} - ${testError}`, 'color: #c00');
		}
	},

	sanitizePath(path) {
		return path.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
	},

	/**
	 * @param testName
	 * @param page
	 * @param counts
	 * @return {Promise<string>} The path to the screenshot relative to the document root. */
	async screenshot(testName, page, counts) {
		const sep = Deno.build.os === 'windows' ? '\\' : '/';
		const abs = (rel) => `${Deno.cwd()}${sep}screenshots${sep}${rel}`;

		const iframeHandle = await page.$('iframe#screenshot-iframe');
		if (!iframeHandle)
			throw new Error('test iframe not found');

		const base = CommandLineUtil.sanitizePath(testName || 'screenshot');
		const n = (counts[base] || 0) + 1;
		counts[base] = n;
		const filename = `${base}${n > 1 ? n : ''}.png`;
		const path = abs(filename);
		await Deno.mkdir('screenshots', {recursive: true});

		// Measure the full content size inside the iframe
		const frame = await iframeHandle.contentFrame();
		if (!frame) throw new Error('no contentFrame for test iframe');
		const contentSize = await frame.evaluate(() => {
			const de = document.documentElement;
			const b = document.body || document.documentElement;
			const w = Math.max(de.scrollWidth, de.offsetWidth, b.scrollWidth, b.offsetWidth);
			const h = Math.max(de.scrollHeight, de.offsetHeight, b.scrollHeight, b.offsetHeight);
			return {w, h};
		});

		// Temporarily resize the iframe element and the page viewport to fit full content
		const originalStyle = await page.evaluate(el => el.getAttribute('style') || '', iframeHandle);
		const vp = page.viewport();
		const newWidth = Math.max(vp.width, Math.min(contentSize.w, 10000));
		const newHeight = Math.max(vp.height, Math.min(contentSize.h, 10000));
		await page.setViewport({width: newWidth, height: newHeight});
		await page.evaluate((el, size) => {
			el.style.width = size.w + 'px';
			el.style.height = size.h + 'px';
			el.style.display = 'block';
		}, iframeHandle, contentSize);

		// Take the screenshot of the entire iframe box
		await iframeHandle.screenshot({ path});

		// Restore styles and viewport
		await page.evaluate((el, style) => { if (style) el.setAttribute('style', style); else el.removeAttribute('style') }, iframeHandle, originalStyle);
		await page.setViewport(vp);

		console.log(`%cScreenshot saved to "${path}".`, 'color: #80f');
		return path;
	},

	async screenshotCleanup(testName, counts) {
		try {
			const base = CommandLineUtil.sanitizePath(testName);
			const sep = Deno.build.os === 'windows' ? '\\' : '/';
			for await (const entry of Deno.readDir(Deno.cwd())) {
				if (!entry.isFile)
					continue;
				if (!entry.name.toLowerCase().endsWith('.png'))
					continue;
				if (!entry.name.startsWith(base))
					continue;
				try {
					await Deno.remove(`${Deno.cwd()}${sep}screenshots${sep}${entry.name}`)
				} catch {}
			}
			counts[base] = 0;
		} catch {}
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


function isAsyncFunction(func) {
	return func.constructor.name === 'AsyncFunction';
}