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

const unused = Symbol('unused');

/*┌──────────────────╮
  | Asserts          |
  └──────────────────╯*/
class AssertError extends Error {
	constructor(msgOrActual='Assertion Failed', expected, op, message) {
		if (message) {
			// If the message is an object, stringify it.
			if (!(typeof message === 'string' || message instanceof String)) {
				try {
					message = JSON.stringify(message);
				} catch (e) {
					message = message + '';
				}
			}
			super(message);
		}
		else if (expected !== undefined)
			super(`Failed:\n${dump(msgOrActual)}\n${op}\n${dump(expected)}`);
		else
			super(msgOrActual);
		this.name = "AssertError";
	}
}

function assert(val, message=unused) {
	if (!val) {
		if (Testimony.debugOnAssertFail)
			debugger;
		if (message === unused)
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

	startsWith(actual, expected, message) {
		if (!actual.startsWith(expected)) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(actual, expected, 'startsWith', message);
		}
	},

	endsWith(actual, expected, message) {
		if (!actual.endsWith(expected)) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(actual, expected, 'endsWith', message);
		}
	},

	includes(actual, expected, message) {
		if (!actual.includes(expected)) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(actual, expected, 'includes', message);
		}
	},

	gte(val1, val2, message) {
		if (val1 < val2) {
			if (Testimony.debugOnAssertFail)
				debugger;
			throw new AssertError(val1, val2, ' < ', message);
		}
	},

	throws(fn, message) {
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
 * @param testName {string}
 * @return {Promise<any>} */
async function runWithinIframe(iframe, fn, args, testName='') {
	// Ensure the iframe exists and is initialized enough for scripting
	if (!iframe.contentWindow || !iframe.contentDocument)
		await new Promise(resolve => iframe.addEventListener('load', () => resolve(), {once: true}));

	const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));

	// Listen for the result via postMessage
	const result = new Promise((resolve, reject) => {
		window.addEventListener('message', function handler(e) {
			if (e.data?.testimonyId !== id) return;
			window.removeEventListener('message', handler);
			if (e.data.error)
				reject(Object.assign(new Error(e.data.error.message), {stack: e.data.error.stack}));
			else
				resolve(e.data.result);
		});
	});

	// Pass args via the iframe window to avoid serialization limits
	iframe.contentWindow.__testimonyArgs = args;

	// Inject a module script that runs the test function and posts the result back
	const script = iframe.contentDocument.createElement('script');
	script.type = 'module';
	script.textContent = `
		// Esbuild's dev mode sometimes injects __name(f, n) helpers into functions.
		// Since these helpers aren't defined inside the iframe, we provide a no-op fallback.
		if (!window.__name) window.__name = (f, n) => f;
		const fn = ${fn.toString()};
		const args = window.__testimonyArgs;
		delete window.__testimonyArgs;
		try {
			const result = await fn(...args);
			parent.postMessage({testimonyId: '${id}', result}, '*');
		} catch(e) {
 		parent.postMessage({testimonyId: '${id}', error: {message: e.message, stack: e.stack}}, '*');
		}
	//# sourceURL=testimony-iframe/${testName || 'unknown'}.js
	`;
	iframe.contentDocument.head.appendChild(script);

	return result;
}



/*┌──────────────────╮
  | TestComponent UI |
  └──────────────────╯*/

if (!globalThis.HTMLElement) // Don't define this when running from command line.
	globalThis.HTMLElement = function(){};

/**
 * Render a test as HTML elements. */
class TestComponent extends HTMLElement {

	static #styleInjected = false;

	static injectStyles() {
		if (this.#styleInjected) return;
		this.#styleInjected = true;
		const style = document.createElement('style');
		style.textContent = `
			test-item {
				label { display: inline-flex; gap: 8px }
				input[type=checkbox] { width: 8px; appearance: none; margin: 0; color: inherit }
				[data-id=expandCB] {
					&:after { content: '+'; user-select: none; cursor: pointer }
					&:checked:after { content: '–' }
				}
				[data-id=enableCB] {
					&:after { content: ' '; color: #55f; font-weight: bold; text-shadow: 1px 0 0 #55f }
					&:checked:after { content: 'x'; position: absolute; top: -2px  }
				}
				> div > label > [data-id=statusContainer] { line-height: 1; display: inline-block; min-width: 8px; max-width: 8px; font-weight: bold }
 			&.running > div > label > [data-id=statusContainer] { position: relative; top: 3px; color: #fff }
				&.runningChildFailed > div > label > [data-id=statusContainer] { position: relative; top: 3px; color: #f00 }
				&.pass > div > label > [data-id=statusContainer]::before { position: relative; top: 3px; color: #0c0; content: '✓' }
				&.fail > div > label > [data-id=statusContainer]::before { color: #f00; content: 'x'}
				[data-id=childContainer] { padding-left: 26px }
				a { text-decoration: none }
			}
		`;
		document.head.appendChild(style);
	}

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
		TestComponent.injectStyles();
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

		// Make every parent checked if all its non-underscored children are checked.
		let p = this;
		while (p = p.parentNode)
			if (p.nodeType === 1 && p.matches('test-item'))
				p.querySelector('[name=r]').checked = ![...p.childContainer.querySelectorAll('[name=r]:not([data-disabled])')].find(cb => {
					let isUnderscored = cb.value.split('.').pop().startsWith('_');
					return !cb.checked && !isUnderscored;
				});
	}

	/**
	 * Called when the expand button is clicked. */
	clickExpand() {
		this.test.expanded = this.expandCB.checked;
		this.childContainer.style.display = this.expandCB.checked ? '' : 'none';
	}

	interval;
	startTime;

	/**
	 * Update the html that shows the status. */
	renderStatus() {
		const clearCounter = () => {
			clearInterval(this.interval);
			this.interval = null;
			this.startTime = null;
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

			// Only set the start time once per test run.
			// This prevents the timer from resetting when a sub-group finishes
			// and the parent briefly becomes Pass before the next sub-group starts.
			if (!this.startTime)
				this.startTime = Date.now();

			if (!this.interval) {
				this.statusContainer.innerHTML = Math.floor((Date.now() - this.startTime) / 1000);
				this.interval = setInterval(() => {
					this.statusContainer.innerHTML = Math.floor((Date.now() - this.startTime) / 1000);
				}, 1000);
			}
		}

 	else if (this.test.status === TestStatus.Pass) {
			clearInterval(this.interval);
			this.interval = null;
			// Capture start time for groups that finish before the timer ever started.
			if (!this.startTime)
				this.startTime = Date.now();
			this.statusContainer.innerHTML = '';
			this.className = 'pass';
		}
		else { // false, Error
			clearInterval(this.interval);
			this.interval = null;
			if (!this.startTime)
				this.startTime = Date.now();
			this.statusContainer.innerHTML = '';
			this.className = 'fail';
		}

		if (this.test.status instanceof Error) {

			let msg = this.test.status.message;
			let stack = Testimony.shortenErrorStack(this.test.status.stack).join('<br>');

			//if (this.test.status instanceof AssertError)
			//	msg = enc(msg).replace(/\r?\n/g, '<br>'); // Let Asserts print the content of html.
				// But we want errors from remote tests to show us the rendered html from the server.

			this.errorMessage.innerHTML = stack;
		}
		else
			this.errorMessage.innerHTML = '';

 	if (this.countContainer) {
			let countText = '';
			if (this.test.totalCount) {
				countText = `${this.test.passCount}/${this.test.totalCount}`;
				let isFinished = this.test.status === TestStatus.Pass || this.test.status === TestStatus.Fail || this.test.status instanceof Error;
				if (isFinished && this.startTime) {
					let elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
					countText += ` ${elapsed} seconds`;
				}
			}
			this.countContainer.innerHTML = countText;
		}

	}

	renderResult() {
		this.resultContainer.innerHTML = this.test.result === undefined ? '' : this.test.result;
	}

	render() {
		// If it's html, print it as is, instead of our own style with 50% opacity.
		const descIsHtml = /^<[^>]+>/.test(this.test.desc.trim());

		this.innerHTML = `
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
				<span style="white-space: nowrap; line-height: 1; position: relative">[<input data-id="enableCB" type="checkbox" name="r" value="${enc(this.test.name)}"
					${this.test.enabled ? 'checked' : ''}
					onchange="this.closest('test-item').clickEnable()">]</span>
				
				<!-- Status -->
				<span data-id="statusContainer"></span>
				
				<!-- Name -->
				<span>
 				${enc(this.test.getShortName())}${this.test.externalUrl ? `<a 
						href="${enc(this.test.externalUrl)}" target="_blank" style="line-height: 1" title="Open external test url in new tab">🡵</a>` : ''}
					<span data-id="countContainer" style="opacity: .5"></span>
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

	/** @type {string} */
	name;

	/** @type {string} */
	desc;

	/** @type {string} */
	html;

	/** @type {function} */
	setup;

	/** @type {function} */
	teardown;

	/** @type {string} If set, this is an external test. */
	externalUrl;

	sequential = false;
	isIframe = false;
	isShadowDom = false;

	iframeTestArgs = []; // arguments given to iframe function
	iframeContextProps = null; // object properties merged onto TestimonyContext for iframe tests
	size = null; // [width, height] for iframe/shadow DOM
	shadowDomContextProps = null; // object properties merged onto TestimonyContext for shadow DOM tests

	/** @type {?int} Per-test timeout in ms.  Overrides Testimony.defaultTimeout. */
	timeout = null;

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
	 * @param sequential {boolean}
	 * @param parent {?Test}} */
	constructor(name='', desc='', fn=null, sequential=false, parent=null) {
		this.name = name;
		this.desc = desc;
		this.fn = fn;
		this.sequential = sequential;
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
			let passCount = 0;
			let totalCount = 0;
			for (let child of Object.values(this.children)) {
				let s = child.status;
				if (s instanceof Error)
					s = TestStatus.Fail;
				status[s] = (status[s] || 0) + 1;

				// Count passing leaf tests recursively.
				if (child.children) {
					passCount += child.passCount || 0;
					totalCount += child.totalCount || 0;
				}
				else if (child.enabled) {
					totalCount++;
					if (child.status === TestStatus.Pass)
						passCount++;
				}
			}
			this.passCount = passCount;
			this.totalCount = totalCount;

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
	async run() {

		// A test to run.
		if (this.fn && this.enabled)
			await this.runTest();

		// A node containing other tests.
		if (!this.fn)
			await this.runChildren();

		return this.status;
	}

	async runTest() {
		let context;
		let doIt = async (setupResponse) => {
			let el, iframe, iframeWrapper;

			// update func to create and destroy html before and after test.

			// As a shadow DOM.
			if (this.isShadowDom) {
				let shadowHost = document.createElement('div');
   	      let sw = this.size?.[0] || Testimony.defaultSize[0];
				let sh = this.size?.[1] || Testimony.defaultSize[1];
				shadowHost.setAttribute('style', `width: ${sw}px; height: ${sh}px; overflow: auto; border: 1px solid #ccc; background: white`);

				let title = document.createElement('div');
				title.textContent = this.name;
				title.setAttribute('style', 'font-weight: bold; font-size: 12px; margin-bottom: 4px; color: #888;');

				let shadowWrapper = document.createElement('div');
				shadowWrapper.append(title, shadowHost);
				document.body.append(shadowWrapper);

				let shadowRoot = shadowHost.attachShadow({mode: 'open'});
				shadowRoot.innerHTML = this.html || '';

				// Store refs for context and cleanup
				var shadowRootRef = shadowRoot;
				var shadowWrapperRef = shadowWrapper;
				var shadowHostRef = shadowHost;

				// Snapshot body children so we can remove anything the test appends outside the shadow DOM.
				var bodyChildrenBefore = new Set(document.body.children);
			}

			// As an iframe.
			else if (this.isIframe) {
				// Create a wrapper div with a title for the iframe
				iframeWrapper = document.createElement('div');
				iframeWrapper.setAttribute('style', 'margin: 8px 0; border: 1px solid #ccc');
				let title = document.createElement('div');
				title.textContent = this.name;
				title.setAttribute('style', 'font-weight: bold; font-size: 12px; margin-bottom: 4px; color: #888;');
				iframeWrapper.append(title);

				iframe = document.createElement('iframe');
				let iw = this.size?.[0] || Testimony.defaultSize[0];
				let ih = this.size?.[1] || Testimony.defaultSize[1];
				iframe.setAttribute('style', `width: ${iw}px; height: ${ih}px; border: none;`);
				iframeWrapper.append(iframe);
				document.body.append(iframeWrapper);
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
				shadowRoot: shadowRootRef || null,
			}, iframeWrapper);

			// Merge extra context properties from testIframe / testShadowDom
			let extraProps = this.iframeContextProps || this.shadowDomContextProps;
			if (extraProps)
				for (let key in extraProps)
					context[key] = extraProps[key];

			// Run
			let status;
			if (this.isShadowDom) {
				try {
					status = await this.fn(context);
				} finally {
					// Remove the shadow wrapper and any elements the test appended to the outer body.
					shadowWrapperRef.remove();

					// Doesn't work because it removes subsequently running test children:
					// for (let child of [...document.body.children])
					// 	if (!bodyChildrenBefore.has(child))
					// 		child.remove();
				}
			}
			else if (this.isIframe) {
				// Save scroll position so focus events inside the iframe don't leave the outer page scrolled.
				let scrollX = window.scrollX, scrollY = window.scrollY;

				let args = [
					...this.iframeTestArgs,
					context
				]
				try {
					status = await runWithinIframe(iframe, this.fn, args, this.name);
				} finally {
					window.scrollTo(scrollX, scrollY);
				}
				iframeWrapper.remove();
			}
 		else if (el)
				status = await this.fn(el, context);
			else
				status = await this.fn(context);

			// Remove html
			if (el)
				el.parentNode.removeChild(el);

			if (Object.keys(TestStatus).includes(status))
				this.status = status;
			else if (status !== false)
				this.status = TestStatus.Pass;

			return status;
		};

		let setupResponse;
		if (this.setup)
			setupResponse = await this.setup();

		// If running under Puppeteer/Deno, clear old screenshots for this test name before the run.
		try {
			if (globalThis.__testimonyCleanupScreenshots)
				await globalThis.__testimonyCleanupScreenshots(this.name);
		} catch {}

		this.status = TestStatus.Running;
		Testimony.currentTest = this;
		if (this.element)
			this.element.renderStatus();

		// Wrap doIt with timeout
		let timeoutMs = this.timeout ?? Testimony.defaultTimeout;
		let doItWithTimeout = async (setupResponse) => {
			if (!timeoutMs)
				return await doIt(setupResponse);
			let timer;
			let timeoutPromise = new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs);
			});
			try {
				return await Promise.race([doIt(setupResponse), timeoutPromise]);
			} finally {
				clearTimeout(timer);
			}
		};

		let pass = false;
		try {
			if (Testimony.throwOnError) {
				this.result = await doItWithTimeout(setupResponse);
				pass = true;
			} else {
				try {
					this.result = await doItWithTimeout(setupResponse);
					pass = true;
					Testimony.passedTests.push(this.name);
				} catch (e) {
					this.status = e;
					console.error(e && (e.stack || e.message) ? (e.stack || e.message) : e)
					Testimony.failedTests.push([this.name, Testimony.shortenError(e, '\n')]);
				}
			}
		}
		finally {
 		if (this.teardown) // Always call teardown() even on error.
				await this.teardown(setupResponse);

			if (!pass && !(this.status instanceof Error))
				this.status = TestStatus.Fail;

			if (this.element) {
				this.element.renderStatus();
				this.element.renderResult();
			}
			if (this.parent)
				this.parent.updateStatusFromChildren();

			Testimony.currentTest = null;
		}
	}

	async runChildren() {
		let sequential = [];
		let concurrent = [];

		for (let child of Object.values(this.children || {})) {
			if (!child.hasEnabledTests())
				continue;
			if (child.sequential || child.children)
				sequential.push(child);
			else
				concurrent.push(child);
		}

		// Start concurrent tests
		let promises = concurrent.map(child => {
			if (child.fn)
				child.status = TestStatus.Running;
			let promise = child.run();
			promise.then(() => {
				this.updateStatusFromChildren();
			});
			return promise;
		});

		this.updateStatusFromChildren();

		// Run sequential tests one at a time
		for (let child of sequential) {
			if (child.fn && child.status === TestStatus.NotStarted)
				child.status = TestStatus.Running;
			await child.run();
			this.updateStatusFromChildren();
		}

		// Wait for concurrent tests to finish
		await Promise.all(promises);

		this.updateStatusFromChildren();
	}

	hasEnabledTests() {
		if (!this.children)
			return this.enabled;
		for (let child of Object.values(this.children))
			if (child.hasEnabledTests())
				return true;
		return false;
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

export class TestimonyContext {

	/** @type {function(value:*)} */
	assert;

	/** @type {string} */
	testName;

	/** The result of the setup() function. */
	setupResult;

	/** @type {?HTMLElement} The wrapper div containing the iframe and title. */
	iframeWrapper;

	/** @type {?ShadowRoot} The shadow root for shadow DOM tests. */
	shadowRoot;


	/**
	 * @param test {Test}
	 * @param iframe {?HTMLIFrameElement}
	 * @param fields {object}
	 * @param iframeWrapper {?HTMLElement} */
	constructor(test, iframe, fields, iframeWrapper=null) {
		for (let name in fields)
			this[name] = fields[name];

		this.test = test;
		this.iframe = iframe;
		this.iframeWrapper = iframeWrapper || null;
	}

	/**
	 * Add a button that must be clicked to resume the test.
	 * Skipped automatically when running in headless/CLI mode.
	 * @param text {string}
	 * @returns {Promise<void>} */
	async clickToResume(text = 'Click to resume test') {
		// Skip in headless/CLI mode
		if (globalThis.__testimonyScreenshot)
			return;

		const button = document.createElement('button');
		button.textContent = text;
		if (this.iframeWrapper)
			this.iframeWrapper.insertBefore(button, this.iframeWrapper.firstChild);
		else
			document.body.appendChild(button);
		await new Promise(resolve => button.addEventListener('click', () => {resolve(); button.remove()}, {once: true}));
	}

	/**
	 * Take a screenshot and save the result to tests/files/screenshots/.
	 * This ONLY works when running under Puppeteer/Deno.
	 * In the browser it will do nothing and return null.
	 * @param filename {?string} Optional custom filename (without extension).
	 * @return {Promise<?string>} The path to the screenshot relative to the document root. */
	async screenshot(filename=null) {
		if (!globalThis.__testimonyScreenshot)
			return null;
		const targetId = 'screenshot-' + Math.random().toString(36).slice(2);
		const selector = `[data-screenshot-id="${targetId}"]`;

		if (this.test.isShadowDom) {
			// Mark the shadow host so Puppeteer can find this exact target on the outer page.
			let host = this.shadowRoot.host;
			host.setAttribute('data-screenshot-id', targetId);
			let result = await globalThis.__testimonyScreenshot(this.test.name, filename, selector);
			host.removeAttribute('data-screenshot-id');
			return result;
		}

		if (this.test.isIframe) {
			// Mark the iframe so Puppeteer can find this exact target on the outer page.
			this.iframe.setAttribute('data-screenshot-id', targetId);
			let result = await globalThis.__testimonyScreenshot(this.test.name, filename, selector);
			this.iframe.removeAttribute('data-screenshot-id');
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
	defaultTimeout: 20000, // Default per-test timeout in ms.  Set to 0 or null to disable.
	defaultSize: [500, 300], // Default [width, height] for iframe/shadow DOM tests.
	testFileRootPath: '',

	rootTest: new Test(),
	passedTests: [],

	/** @type {[string, string][]} E.g: [ [ 'users.account.resetPassword', 'Error: expected 1 to equal 2']] */
	failedTests: [],

	/** @type {?Test} The leaf test currently executing its fn. */
	currentTest: null,

	finished: false,

	_getCallerPrefix() {
		try {
			let stack = new Error().stack;
			let urls = stack.match(/(?:http[s]?|file):\/\/[^\s'")]*/g) || [];
			let callerUrlStr = urls.find(url => !url.includes('/Testimony.js'));
			if (callerUrlStr) {
				if (callerUrlStr.includes('?forTestimony=1')) return '';
				callerUrlStr = callerUrlStr.replace(/:\d+(:\d+)?$/, '');

				// Extract filename from URL
				let filename = callerUrlStr.split('/').pop().replace(/\.test\.(js|ts)$/, '');

				let callerDir = new URL('.', callerUrlStr).href;
				let testimonyDir = new URL('.', import.meta.url).href;
				let prefix = this._calculatePrefix(callerDir, testimonyDir, this.testFileRootPath);

				if (prefix) return prefix + '.' + filename;
				return filename;
			}
		} catch (e) {
			// Fail silently
		}
		return '';
	},

	_calculatePrefix(callerDir, testimonyDir, rootPath) {
		if (callerDir.startsWith(testimonyDir)) {
			let relPath = callerDir.substring(testimonyDir.length);
			if (rootPath) {
				if (!rootPath.endsWith('/')) rootPath += '/';
				if (relPath.startsWith(rootPath)) {
					relPath = relPath.substring(rootPath.length);
				}
			}
			if (relPath.endsWith('/')) relPath = relPath.slice(0, -1);
			if (relPath) {
				return relPath.replace(/\//g, '.');
			}
		}
		return '';
	},

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

		// Intercept form submit to shorten the URL by using group names instead of individual test names.
		let form = parent.closest('form');
		if (form)
			form.addEventListener('submit', e => {
				e.preventDefault();

				let url = new URL(window.location);
				url.search = '';

				// Collect other form params (like throwOnError)
				for (let el of form.elements)
					if (el.name && el.name !== 'r' && el.name !== 'x' && el.checked)
						url.searchParams.append(el.name, el.value);

				// Collect enabled test names, then collapse groups.
				let enabledNames = this.getMinimalEnabledNames(this.rootTest);
				for (let name of enabledNames)
					url.searchParams.append('r', name);

				// Collect expanded groups.
				for (let el of form.querySelectorAll('input[name=x]:checked'))
					url.searchParams.append('x', el.value);

				window.location.href = url.toString();
			});
	},

	/**
	 * Get the minimal set of 'r' param values to represent all enabled tests.
	 * If all non-underscored children of a group are enabled, use the group name instead.
	 * @param test {Test}
	 * @returns {string[]} */
	getMinimalEnabledNames(test) {
		let isChecked = test.element?.enableCB?.checked;

		if (!test.children)
			return isChecked ? [test.name] : [];

		// Check if all non-underscored children are enabled (recursively).
		let hasNonUnderscoredChild = false;
		let allNonUnderscoreEnabled = true;
		for (let child of Object.values(test.children)) {
			let isUnderscored = child.getShortName().startsWith('_');
			if (!isUnderscored) {
				hasNonUnderscoredChild = true;
				if (!this.allChecked(child))
					allNonUnderscoreEnabled = false;
			}
		}

		// If all non-underscored children enabled, use the group name (plus any individually enabled underscored tests).
		if (allNonUnderscoreEnabled && test.name && (isChecked || hasNonUnderscoredChild)) {
			let result = [test.name];
			
			const addCheckedUnderscored = (t) => {
				for (let child of Object.values(t.children || {})) {
					if (child.getShortName().startsWith('_') && child.element?.enableCB?.checked)
						result.push(child.name);
					addCheckedUnderscored(child);
				}
			};
			addCheckedUnderscored(test);
			
			return result;
		}

		// Otherwise recurse into children.
		let result = [];
		for (let child of Object.values(test.children))
			result.push(...this.getMinimalEnabledNames(child));
		return result;
	},

	/**
	 * Check if a test and all its non-underscored descendants are checked.
	 * @param test {Test}
	 * @returns {boolean} */
	allChecked(test) {
		if (!test.children)
			return !!test.element?.enableCB?.checked;
		for (let child of Object.values(test.children)) {
			if (child.getShortName().startsWith('_'))
				continue;
			if (!this.allChecked(child))
				return false;
		}
		return true;
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

		// Catch fire-and-forget async errors that no test awaits.
		// Attribute to the currently running test, or report as unattributed.
		window.addEventListener('unhandledrejection', this._onUnhandledRejection);

		await this.rootTest.run();

		// Drain: wait briefly to catch late async rejections (e.g. in-flight requests
		// that fail after teardown drops the test database).
		await new Promise(r => setTimeout(r, 500));

		this.finished = true;
	},

	/** @param e {PromiseRejectionEvent} */
	_onUnhandledRejection(e) {
		e.preventDefault(); // Suppress default console error (we handle it ourselves).
		let reason = e.reason;
		let msg = reason instanceof Error
			? Testimony.shortenError(reason, '\n')
			: String(reason);

		// Attribute to the currently running test, or label as unattributed.
		let test = Testimony.currentTest;
		let testName = test?.name || '(unattributed)';

		console.error(`Unhandled rejection in ${testName}: ${msg}`);

		// Mark test as failed if it was running or already passed.
		if (test && !(test.status instanceof Error)) {
			let err = reason instanceof Error ? reason : new Error(msg);
			test.status = err;

			// Move from passed to failed if it already finished.
			let passedIdx = Testimony.passedTests.indexOf(testName);
			if (passedIdx >= 0)
				Testimony.passedTests.splice(passedIdx, 1);

			if (!Testimony.failedTests.some(([n]) => n === testName))
				Testimony.failedTests.push([testName, msg]);

			// Update browser UI.
			if (test.element) {
				test.element.renderStatus();
				test.element.renderResult();
			}
			if (test.parent)
				test.parent.updateStatusFromChildren();
		}
		else {
			// No test is running — attribute to last-run or generic.
			if (!Testimony.failedTests.some(([n]) => n === testName))
				Testimony.failedTests.push([testName, msg]);
		}
	},

	/**
	 * Add a test.
	 * @param name {string} Name of the test shown in the test list.  Use dots for categorization.
	 *    E.g:  'users.account.resetPassword'
	 * @param args {*} The arguments can appear in this order.  Everything is optional except the function.
	 *  - {string} description - shown in the user interface in dark text, next to the test.
	 *  - {string} Html to create an element to pass to the function, if the trimmed version starts with <
	 *  - {sequential:string|boolean=, setup:?function(), teardown:?function(context:TestimonyContext)}
	 *      If set, run setup() before the test and teardown() after the test passing the TestimonyContext to teardown().
	 *  - {function(el:HTMLElement|HTMLDocument, context:TestimonyContext)=} The function that performs the test.
	 * @return Test */
	test(name, ...args) {

		// Guard against common mistakes
		if (this.finished)
			throw new Error(`Cannot register test "${name}" after run() has completed.`);

		let prefix = this._getCallerPrefix();
		if (prefix) {
			if (!name.startsWith(prefix + '.')) {
				name = prefix + '.' + name;
			}
		}

		if (name.split('.').some(part => part === 'constructor'))
			console.warn(`Test name "${name}" contains reserved word "constructor" which may conflict with Object.prototype.constructor.`);
		if (!args.some(arg => typeof arg === 'function'))
			throw new Error(`Test "${name}" has no test function.`);

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

				// Check for duplicates
				if (test.children[item]?.fn)
					throw new Error(`Test "${name}" is already registered.`);

				let parent = test;
				test = new Test(name, '', null, false, parent);

				// Sort arguments
				for (let arg of args) {
					if (typeof arg === 'function')
						test.fn = arg;
 				else if (arg && typeof arg === 'object') { // new path
						if (arg.desc)
							test.desc = arg.desc;
						if (arg.html)
							test.html = arg.html;
						if (arg.setup)
							test.setup = arg.setup;
						if (arg.teardown)
							test.teardown = arg.teardown;
						if (arg.sequential !== undefined)
							test.sequential = arg.sequential;
						if (arg.timeout !== undefined)
							test.timeout = arg.timeout;
	               if (arg.size)
	                   test.size = arg.size;
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
	 * Add a test that runs inside a shadow DOM for style isolation while sharing the parent JS context.
	 * Arguments are the same as Testimony.test() except for an optional context-props object at the end.
	 * @param name {string} Name of the test shown in the test list.  Use dots for categorization.
	 * @param args {*} Arguments are the same as Testimony.test() except:
	 *  - {object} A plain object after the test function whose properties are merged onto TestimonyContext.
	 * @return Test */
	testShadowDom(name, ...args) {

		// Check for a trailing plain object after the test function — these become context properties.
		let shadowDomContextProps = null;
		let fnIndex = args.findIndex(a => typeof a === 'function');
		if (fnIndex >= 0 && fnIndex < args.length - 1) {
			let trailing = args.splice(fnIndex + 1);
			if (trailing.length === 1 && trailing[0] && typeof trailing[0] === 'object' && !Array.isArray(trailing[0]))
				shadowDomContextProps = trailing[0];
		}

		let result = this.test(name, ...args);
		result.isShadowDom = true;
		result.shadowDomContextProps = shadowDomContextProps;
		return result;
	},

	/**
	 * Add a test that runs inside the context of an iframe that will be created and appended to the document.
	 * Arguments are the same as Testimony.test() except for an optional context-props object at the end.
	 * @param name {string} Name of the test shown in the test list.  Use dots for categorization.
	 * @param args {*} Arguments are the same as Testimony.test() except:
	 *  - {object} A plain object after the test function whose properties are merged onto TestimonyContext.
	 * @return Test */
	testIframe(name, ...args) {

		// Check for a trailing plain object after the test function — these become context properties.
		let iframeContextProps = null;
		let fnIndex = args.findIndex(a => typeof a === 'function');
		if (fnIndex >= 0 && fnIndex < args.length - 1) {
			let trailing = args.splice(fnIndex + 1);
			if (trailing.length === 1 && trailing[0] && typeof trailing[0] === 'object' && !Array.isArray(trailing[0]))
				iframeContextProps = trailing[0];
		}

		let result = this.test(name, ...args);
		result.isIframe = true;
		result.iframeTestArgs = [];
		result.iframeContextProps = iframeContextProps;
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
			let result = responseText.slice(responseText.indexOf(passText) + passText.length).trim();
			result = result.replace(/^in [\d.]+ seconds\.\s*/, '');
			return result || undefined;
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
		// Remove stacktrace lines inside Testimony.js that calls runtests.
		let lines = error.stack.split(/\n/g).filter(line => !line.includes('Testimony.js') || line.includes('eval at runWithinIframe'));
		let errorStack = lines.join('\r\n'); // Remove the line that invokes Testimony.js
		errorStack = errorStack.replace(/\r?\n/g, br);
		return errorStack.replace(new RegExp(window.location.origin, 'g'), ''); // Remove server name to shorten error stack.
	},

	/**
	 * @param errorStack {string|string[]}
	 * @returns {string[]} */
	shortenErrorStack(errorStack) {
		if (typeof errorStack === 'string')
			errorStack = errorStack.split(/\n/g);

		let lines = errorStack.filter(line => !line.includes('Testimony.js') || line.includes('eval at runWithinIframe'));
		lines = lines.map(line => line.replace(new RegExp(window.location.origin, 'g'), ''));
		return lines;
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
	await page.exposeFunction('__testimonyScreenshot', (testName, filename, selector=null) => CommandLineUtil.screenshot(testName, page, counts, filename, selector));

	// Forward page console output to our terminal, preserving error stacks when possible.
	page.on('console', CommandLineUtil.consoleLog);

	let rejectFailure;
	const failure = new Promise((_, reject) => {
		rejectFailure = reject;
	});
	let pageErrorHandled = false;
	page.on('pageerror', async err => {
		if (pageErrorHandled) return;
		pageErrorHandled = true;

		// Extract the actual page content (e.g. PHP error rendered as text)
		// instead of showing the useless JS SyntaxError.
		let detail = '';
		try {
			detail = await page.evaluate(() =>
				document.body?.innerText || document.documentElement?.innerText || '');
		} catch {}
		const trimmed = detail.trim().slice(0, 3000);
		if (trimmed)
			console.error(`\x1b[31mTest page error:\n${trimmed}\x1b[0m`);
		else
			console.error(`\x1b[31mPage error: ${err?.stack || err?.message || err}\x1b[0m`);
		rejectFailure(err);
	});

	// Wait for the tests to finish
	const success = page.waitForFunction(() => window.Testimony?.finished === true, {timeout: 0});

	// Go to test pages.
	const url = webServer
		? `${webServer}/${path}?${urlArgs.join('&')}`
		: `http:/localhost:${port}/${path}?${urlArgs.join('&')}`;
	const response = await page.goto(url);

	// 1. If the HTTP response itself is an error, surface it immediately.
	if (response && !response.ok()) {
		const body = await response.text().catch(() => '');
		const plain = body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
		console.error(`\x1b[31mTest page returned HTTP ${response.status()}:\n${plain.slice(0, 2000)}\x1b[0m`);
		success.catch(() => {});
		await browser.close();
		if (server) stopServer(server);
		Deno.exit(1);
	}

	// 2. Wait for Testimony to initialize. If the page has a fatal PHP error,
	// JS modules won't load and window.Testimony will never appear.
	const initTimeout = 5_000;
	const initResult = await Promise.race([
		page.waitForFunction(() => !!window.Testimony, {timeout: initTimeout})
			.then(() => 'ok')
			.catch(() => 'timeout'),
		failure.then(() => 'ok').catch(() => 'pageerror'),
	]);

	if (initResult !== 'ok') {
		const bodyText = await page.evaluate(() =>
			document.body?.innerText || document.documentElement?.innerText || '')
			.catch(() => '');
		const trimmed = bodyText.trim().slice(0, 3000);
		if (initResult === 'timeout')
			console.error(`\x1b[31mTest page failed to initialize Testimony within ${initTimeout / 1000}s.\nPage content:\n${trimmed || '(empty)'}\x1b[0m`);
		// pageerror case: error already printed by the handler above.
		success.catch(() => {});
		await browser.close();
		if (server) stopServer(server);
		Deno.exit(1);
	}

	// 3. Wait for all tests to finish (or a page error to occur).
	try {
		await Promise.race([success, failure]);
	} catch {
		// Error already printed by pageerror handler.
		success.catch(() => {});
		await browser.close();
		if (server) stopServer(server);
		Deno.exit(1);
	}

	const failedTests = await page.evaluate(() => window.Testimony?.failedTests);
	const passedTests = await page.evaluate(() => window.Testimony?.passedTests);
	CommandLineUtil.printTestResult(passedTests, failedTests);

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
	async screenshot(testName, page, counts, customFilename=null, selector=null) {
		const sep = Deno.build.os === 'windows' ? '\\' : '/';
		const abs = (rel) => `${Deno.cwd()}${sep}files${sep}screenshots${sep}${rel}`;

		// Find the target element: iframe or shadow host
		let handle = selector ? await page.$(selector) : null;
		if (!handle)
			handle = await page.$('iframe#screenshot-iframe');
		if (!handle)
			handle = await page.$('#screenshot-shadow-host');
		if (!handle)
			throw new Error('test iframe or shadow host not found');
		let isIframe = await handle.evaluate(el => el.tagName === 'IFRAME');

		let filename;
		if (customFilename) {
			filename = CommandLineUtil.sanitizePath(customFilename);
			if (!filename.endsWith('.png'))
				filename += '.png';
		} else {
			const base = CommandLineUtil.sanitizePath(testName || 'screenshot');
			const n = (counts[base] || 0) + 1;
			counts[base] = n;
			filename = `${base}${n > 1 ? n : ''}.png`;
		}
		const path = abs(filename);
		await Deno.mkdir(`files${sep}screenshots`, {recursive: true});
		await handle.evaluate(el => el.scrollIntoView({block: 'center', inline: 'center'}));

		if (isIframe) {
			// Measure the full content size inside the iframe
			const frame = await handle.contentFrame();
			if (!frame) throw new Error('no contentFrame for test iframe');
			const contentSize = await frame.evaluate(() => {
				const de = document.documentElement;
				const b = document.body || document.documentElement;
				const w = Math.max(de.scrollWidth, de.offsetWidth, b.scrollWidth, b.offsetWidth);
				const h = Math.max(de.scrollHeight, de.offsetHeight, b.scrollHeight, b.offsetHeight);
				return {w, h};
			});

			// Temporarily resize the iframe element and the page viewport to fit full content
			const originalStyle = await page.evaluate(el => el.getAttribute('style') || '', handle);
			const vp = page.viewport();
			const newWidth = Math.max(vp.width, Math.min(contentSize.w, 10000));
			const newHeight = Math.max(vp.height, Math.min(contentSize.h, 10000));
			await page.setViewport({width: newWidth, height: newHeight});
			await page.evaluate((el, size) => {
				el.style.width = size.w + 'px';
				el.style.height = size.h + 'px';
				el.style.display = 'block';
			}, handle, contentSize);

			await handle.screenshot({ path});

			// Restore styles and viewport
			await page.evaluate((el, style) => { if (style) el.setAttribute('style', style); else el.removeAttribute('style') }, handle, originalStyle);
			await page.setViewport(vp);
		}
		else
			await handle.screenshot({ path });

		console.log(`%cScreenshot saved to "${path}".`, 'color: #80f');
		return path;
	},

	async screenshotCleanup(testName, counts) {
		try {
			const base = CommandLineUtil.sanitizePath(testName);
			const sep = Deno.build.os === 'windows' ? '\\' : '/';
			const screenshotDir = `${Deno.cwd()}${sep}files${sep}screenshots`;
			for await (const entry of Deno.readDir(screenshotDir)) {
				if (!entry.isFile)
					continue;
				if (!entry.name.toLowerCase().endsWith('.png'))
					continue;
				if (!entry.name.startsWith(base))
					continue;
				try {
					await Deno.remove(`${screenshotDir}${sep}${entry.name}`)
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
