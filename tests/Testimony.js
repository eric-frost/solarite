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

/**
 * Every assert below raises its failure inline rather than through a shared helper, and the
 * `if (Testimony.debugOnAssertFail) debugger;` is repeated on purpose: a helper would add its own
 * frame between the assert and the test, so a developer who pauses on a failed assertion would
 * land one frame further from the code that failed.  Keep the duplication. */
function assert(val, message=unused) {
	if (!val) {
		if (Testimony.debugOnAssertFail)
			debugger;
		throw new AssertError(message === unused ? 'Assertion Failed' : message);
	}
}

Object.assign(assert, {
	// JUnit, PhpUnit, and mocha all use the order: expected, actual.  These take actual first.
	eq(actual, expected, message) {
		if (!isSame(actual, expected)) {
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

	throws(fn, message) {
		let threw = true;
		try {
			fn();
			threw = false;
		}
		catch (e) {
			if (message && !e.message.includes(message)) {
				if (Testimony.debugOnAssertFail)
					debugger;
				throw new AssertError(`Expected error: '${message}' But got: '${e.message}'`);
			}
		}
		if (!threw) {
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


/**
 * Where relative test urls resolve from, captured at import time.
 *
 * Server-side tests are registered with page-relative urls ('php-admin/util/RestTest.php?x'),
 * and a bare fetch() of one resolves against the document's CURRENT address.  Tests are allowed
 * to move that address: QcConsole's setup checks call history.replaceState('/qc-console?kiosk=1')
 * to prove the console reads its own url, and DataTable's do the same with ?table=.  While one of
 * those is on screen, every OTHER test's relative url resolves against the new path and Apache
 * answers 404 for a file that exists — which surfaced as a different php test failing with a raw
 * "404 Not Found" page on roughly every second full run.
 *
 * Captured before any test can run, so the address bar cannot retarget a request. */
const pageBase = globalThis.location ? new URL('.', globalThis.location.href).href : '';

/** The page's full address at load.  A test that pushes or replaces the address is put back here
 * afterwards, and named, because a rewritten address breaks the form that reruns the selection and
 * has been seen on the page when it froze. */
const pageHref = globalThis.location?.href ?? '';


/*┌──────────────────╮
  | Locks            |
  └──────────────────╯*/

/**
 * The shared resources a test can reserve.  A lock is just a NAME, so declaring one is
 * `{locks: Lock.Focus}`, and needing two is `{locks: [Lock.Focus, Lock.Group]}`.
 *
 * WHY LOCKS AND NOT A "RUN THIS ONE ALONE" FLAG.  Up to sixteen tests run at a time inside one
 * page, and almost all of them are independent.  Serializing a test against the whole suite to
 * protect one narrow thing is enormously wasteful.  Naming the resource lets two tests that need
 * DIFFERENT resources keep running side by side, and only the ones that collide wait.
 *
 * The names below are the ones the runner itself understands.  ANY OTHER STRING WORKS TOO and
 * needs no change here — if two test files share a scratch table, have both declare
 * `{locks: 'importScratchTable'}` and they will serialize against each other and nothing else.
 * That open set is the whole point of naming locks rather than enumerating them.
 *
 * A test takes all of its locks at once or none of them, so it never holds half of what it asked
 * for while waiting for the rest.  That is what makes deadlock impossible without having to
 * define an acquisition order. */
export const Lock = {

	/** Serialize against SIBLINGS ONLY — the other tests in the same file or class.  Expands to a
	 *  lock named after the test's own group, so two files never wait on each other.  For tests
	 *  that share a fixture, a table, or a singleton with each other and nothing else. */
	Group: 'Group',

	/** The keyboard focus, which is ONE slot shared by the entire browser tab.  Take this if the
	 *  test asserts where the focus went, or if it MOVES the focus and would otherwise yank it
	 *  out from under a test that is asserting.
	 *
	 *  A mutex only works if both sides take it, so this is a cooperative contract: the thieves
	 *  have to declare it too, not just the victims.  What can actually steal the focus is a
	 *  short list — an explicit .focus() or .select(), showModal(), autofocus, and real user
	 *  input.  A synthetic el.click() or dispatchEvent() does NOT move the focus, which is why
	 *  the great majority of tests can ignore this lock entirely.
	 *
	 *  Acquiring it also clears the focus slot and waits for the page to accept a new focus (see
	 *  clearFocus), so a holder never needs to check that itself. */
	Focus: 'Focus',

	/** The whole page, uncontended: no other test running, no dialog open, no competition for the
	 *  main thread.
	 *
	 *  This is for the handful of tests that MEASURE the page rather than call into it, where a
	 *  busy main thread is indistinguishable from the thing being measured.  Two examples, both
	 *  real: DeviceHub's cadence test asks whether a fast scan loop still gets turns while a slow
	 *  one is mid-round, and sixteen concurrent tests stretch short timers enough to fake a "no";
	 *  KeyboardWedge's subject tells a barcode scanner from a human typing by inter-key delay, so
	 *  a stalled main thread turns a synthetic scan into stray typing.
	 *
	 *  Unlike every other lock it is granted by SCHEDULING, not by waiting: the test is moved into
	 *  a phase that runs after every other test in the run has finished.  A mutex cannot deliver
	 *  what this promises, because taking one mid-run only stops tests that have not STARTED — the
	 *  fifteen already in flight keep going.  Draining the pool on demand would work but costs a
	 *  drain per holder; running them together at the end costs one drain, at the point where it
	 *  is free.  Use it sparingly: it is the only lock that cannot overlap with anything. */
	Page: 'Page',
};

/**
 * Accept a lock declaration in any of its spellings and return a plain array of names.
 * @param locks {string|string[]|undefined}
 * @param where {string} Test name, for the error message.
 * @return {string[]} */
function normalizeLocks(locks, where) {
	if (locks === undefined || locks === null)
		return [];
	let list = Array.isArray(locks) ? locks : [locks];
	for (let name of list)
		if (typeof name !== 'string' || !name.trim())
			throw new Error(`Test "${where}": locks must be a name or an array of names, e.g. `
				+ `{locks: Lock.Focus} or {locks: [Lock.Focus, 'myScratchTable']}.  Got: `
				+ JSON.stringify(locks));
	return list;
}

/**
 * Drop the focus back to <body> and wait until the page will accept a new one.
 *
 * Two jobs, and callers need both.  The wait is for modality
 *
 — while any test anywhere has a modal dialog open,
 * showModal() puts it in the top layer and makes the entire rest of the document inert, so a
 * focus() call from a different test does nothing at all: document.activeElement never moves and
 * not even a focus event fires.
 *
 * The CLEARING half matters just as much, and is easier to forget.  Focusing the throwaway probe
 * and then removing it drops the focus to <body>, so the caller starts from a known slot.  A
 * component that declines to steal a focus somebody already placed deliberately — QcDetail's
 * ensureCtnFocus is this suite's example, and it is deliberate behaviour, not a bug — will simply
 * not arm itself if the previous step in the same test left something else focused.  Call this
 * immediately before the action whose focus you are about to assert on.
 *
 * The check is a probe rather than a search for `dialog[open]`, because the blocking dialog is
 * usually inside another test's shadow root where document.querySelector cannot see it.
 *
 * WHAT THIS DELIBERATELY DOES NOT WAIT FOR is document.hasFocus() — whether the browser WINDOW
 * holds the operating system's focus.  That matters to a few subjects (CodeMirror computes
 * `view.hasFocus` as `document.hasFocus() && root.activeElement === contentDOM`, and its
 * autocompletion will not open without it), which is why it was once part of the condition.  But
 * waiting cannot make it true: nothing a page does can take the window focus back, so a run in a
 * headless browser, in a background window, or on a machine where the human clicked away simply
 * never satisfies it.  Waiting only converted a condition this suite cannot control into a full
 * timeout per call — 5 seconds each, serialized by Lock.Focus across every test that declares it,
 * which measured out at ~220 seconds of a ~330 second run doing nothing whatsoever.  It is now
 * reported once per run (see warnIfWindowUnfocused) instead of being waited on.
 *
 * Taking Lock.Focus or Lock.Page calls this once as the test starts, so a test whose focus-moving
 * action is its first step needs no call of its own.  A test that focuses something, does other
 * work, and then wants a fresh focus decision does.
 *
 * @param ms {int} How long to keep waiting before giving up and letting the assertion speak.
 * @return {Promise<boolean>} Whether the page ever accepted the focus. */
async function clearFocus(ms=5000) {
	let deadline = performance.now() + ms;
	let probe = document.createElement('button');
	probe.style.cssText = 'position:fixed; left:-9999px; opacity:0';
	document.body.append(probe);
	try {
		while (true) {
			probe.focus();
			// Only the inertness can change while we wait, so it is the only thing waited on.
			if (document.activeElement === probe)
				return true;
			if (performance.now() >= deadline)
				return false;   // let the caller's assertion speak
			await new Promise(resolve => setTimeout(resolve, 10));
		}
	}
	finally {
		probe.remove(); // Focus falls back to <body>, leaving the slot free for the caller.
	}
}

/*┌──────────────────────╮
  | Page plumbing        |
  └──────────────────────╯*/

/**
 * Where a test's fixture — its shadow host, its iframe, its html — is attached: the body, always.
 *
 * The test page shows fixtures in a column of their own beside the results, but it does that with
 * LAYOUT rather than by moving them into a container, and this function exists to say why.
 *
 * WHAT SURROUNDS A FIXTURE IS PART OF IT, whether anyone meant it to be.  Code under test can see
 * its own surroundings: DomText.simplify() calls `Dom.getNext()` on its last descendant to find
 * where its range ends, and takes a different branch depending on whether that returns a node or
 * null.  Appended to the body a fixture is the last node in the document and it returns null.  Put
 * one level down inside a container and it returns the html parser's trailing newline — a
 * `#text "\n\n"` is enough — and simplify stops unwrapping redundant spans, failing a test with an
 * assertion that has nothing to do with layout.
 *
 * Stripping that whitespace fixes the first case and not the general one: thirty-five test files
 * append their own fixture straight to the body, and any of them holding one across an await parks
 * a node after the container for as long as that test runs.  Moving the container to the end
 * instead is worse still — relocating an element RELOADS every iframe inside it, which broke tests
 * by the dozen when tried.
 *
 * So the fixtures stay exactly where they have always been, and the page puts the results tree in a
 * fixed pane on the left with the body's own content area indented past it.  Same DOM, same
 * neighbours, same behaviour — and every fixture lands in the right-hand column, including the
 * thirty-five files' worth that never go through this function at all. */
function fixtureHost() {
	return document.body;
}

/**
 * Silence everything the suite plays, in one place, for the whole run.
 *
 * The QC console beeps on every scan — a blip on a match, a buzz on a miss, a three-note phrase
 * when a carton completes — and its tests drive exactly those paths, so a full run is minutes of
 * beeping at whoever is at the desk.  Muting belongs here rather than in the tests because the
 * sound comes from `beep()` inside QcFlow, several layers below anything a test holds a reference
 * to, and an ES module export cannot be stubbed from outside.
 *
 * It works by replacing the context's `destination` with a gain node pinned at zero that is itself
 * wired to the real destination.  Every graph a caller builds is therefore still built, still runs,
 * and still ends somewhere real — it just arrives at the speakers multiplied by nothing.  Silencing
 * the output rather than stubbing the API is what keeps this honest: code that inspects its own
 * audio graph sees the graph it made.
 *
 * The iframe attribute route does NOT work, and it is worth writing down so nobody spends an
 * afternoon on it again.  `allow="autoplay 'none'"` is real and it does apply — the frame's
 * `featurePolicy.allowsFeature('autoplay')` correctly reports false — but Chrome gates WebAudio on
 * USER ACTIVATION as well, and a frame that has been clicked has that, so an AudioContext created
 * inside it still comes up `running` and still makes noise (measured 2026-08-25).  The attribute is
 * set anyway, since it does stop `<audio>`/`<video>` autoplay, but it cannot be the whole answer.
 *
 * @param win {Window} The window to silence — the test page, or a test iframe. */
function muteAudio(win) {
	let proto = win.BaseAudioContext?.prototype || win.AudioContext?.prototype;
	if (!proto || proto.testimonyMuted)
		return;
	let real = Object.getOwnPropertyDescriptor(proto, 'destination');
	if (!real?.get)
		return;
	let sinks = new WeakMap();
	Object.defineProperty(proto, 'destination', {
		configurable: true,
		get() {
			let sink = sinks.get(this);
			if (!sink) {
				sink = this.createGain();
				sink.gain.value = 0;
				sink.connect(real.get.call(this));
				sinks.set(this, sink);
			}
			return sink;
		},
	});
	proto.testimonyMuted = true;
}

if (globalThis.document)
	muteAudio(globalThis);


/*┌──────────────────────╮
  | Main-thread monitor  |
  └──────────────────────╯*/

/**
 * Record the long tasks that freeze the page, so a frozen run can say what froze it.
 *
 * A blocked main thread is the one failure mode this runner cannot otherwise report on, because
 * everything it would use to report — timers, the status counters, the console it writes to when a
 * test finishes — is blocked too.  The page simply stops: the counters stick at whatever second
 * they last painted, clicks do nothing, and scrolling still works because that is composited.  Long
 * enough and the browser itself offers to kill the tab ("Page Unresponsive"), which is the only
 * outward sign that the cause was the main thread rather than the network or a stuck test.
 *
 * PerformanceObserver delivers its entries from OUTSIDE that blockage: the entry is buffered while
 * the thread is stuck and handed over once it frees up, so a block that hides everything else still
 * gets named here.  Blocks are reported twice — immediately, for anything long enough that a human
 * would have felt it, and as a summary at the end of the run.
 *
 * The attribution the browser gives is coarse (which container frame, not which function), so the
 * summary reports the timing and lets whoever reads it correlate against the tests that were
 * running.  A CPU profile is the tool for the next step down.
 *
 * @type {{duration: int, startTime: int, container: string}[]} */
const longTasks = [];

/** A task longer than this is reported the moment it ends: the page visibly froze for that long. */
const FREEZE_MS = 3000;

function watchMainThread() {
	if (typeof PerformanceObserver === 'undefined')
		return;
	try {
		new PerformanceObserver(list => {
			for (let entry of list.getEntries()) {
				let where = (entry.attribution || [])
					.map(a => a.containerName || a.containerId || a.containerSrc || a.containerType)
					.filter(Boolean).join(', ');
				longTasks.push({duration: Math.round(entry.duration),
					startTime: Math.round(entry.startTime), container: where});
				if (entry.duration >= FREEZE_MS)
					Testimony.notice(`The page froze for ${(entry.duration / 1000).toFixed(1)} seconds `
						+ `(main thread blocked${where ? ', in ' + where : ''}).  Nothing ran during `
						+ `that time — no test finished, no timer fired, and no click was handled.  `
						+ `The tests running at that moment are the place to look.`);
			}
		}).observe({entryTypes: ['longtask']});
	}
	catch (e) { /* not supported here; the summary just stays empty */ }
}
watchMainThread();

/** What the main thread spent frozen, for the end-of-run summary.  Empty when nothing blocked. */
function longTaskSummary() {
	let total = longTasks.reduce((sum, t) => sum + t.duration, 0);
	if (total < 1000) // A few hundred milliseconds of layout is normal, not a freeze.
		return '';
	let worst = [...longTasks].sort((a, b) => b.duration - a.duration).slice(0, 5);
	return `Main thread blocked for ${(total / 1000).toFixed(1)}s in total across `
		+ `${longTasks.length} long tasks.  Worst: `
		+ worst.map(t => `${(t.duration / 1000).toFixed(1)}s at ${(t.startTime / 1000).toFixed(0)}s`
			+ (t.container ? ` (${t.container})` : '')).join(', ')
		+ '.  While the main thread is blocked the page is frozen: no test progresses and no click '
		+ 'is handled.';
}


/**
 * Say once, not once per test, that the browser window does not hold the operating system's focus.
 *
 * Most focus assertions are unaffected: focus() still moves document.activeElement and still fires
 * focus events in an unfocused window, which is why this is a note and not a failure.  What breaks
 * is the handful of subjects that consult document.hasFocus() themselves — CodeMirror's
 * autocompletion is the one in this suite.  Nothing the page can do will fix it, so the only
 * useful response is to tell whoever reads the log where to look.
 */
let warnedUnfocused = false;
function warnIfWindowUnfocused() {
	if (warnedUnfocused || document.hasFocus())
		return;
	warnedUnfocused = true;
	Testimony.notice('This browser window does not hold the OS focus, so document.hasFocus() is false '
		+ 'for the whole run.  Focus assertions based on document.activeElement still work; only '
		+ 'subjects that read document.hasFocus() themselves (CodeMirror autocompletion) are '
		+ 'affected.  This is normal for a headless run and for any window the human clicked away '
		+ 'from — it is reported once, and nothing waits on it.');
}

/**
 * The run's lock table: which named resources are held right now, and who is waiting.
 *
 * A lock name is used as its own key, with one exception: Lock.Group does not mean one resource,
 * it means "the group I belong to", so it expands to a different key per file.  A test asking for
 * `[Lock.Focus, Lock.Group]` inside `js-admin.ui.SelectBox` waits on the keys
 * ['Focus', 'group:js-admin.ui.SelectBox'].
 *
 * Waiters are granted in arrival order and a later waiter may NOT jump the queue past an earlier
 * one it conflicts with.  Without that rule a wide request (Focus) could be starved indefinitely
 * by a stream of narrow ones that never leave the page unlocked at the same instant. */
class LockTable {

	/** @type {Set<string>} Keys held right now. */
	#held = new Set();

	/** @type {{keys: string[], resolve: function}[]} Waiters, oldest first. */
	#queue = [];

	/** Translate a test's declared lock names into the concrete keys it has to hold.  Lock.Page is
	 * dropped here rather than filtered by the caller: it is granted by scheduling, so a test that
	 * asked for it is already running alone and has nothing to wait for.
	 * @param locks {string[]} Declared names.
	 * @param groupName {string} The name of the test's parent group, for Lock.Group.
	 * @return {string[]} */
	static keysFor(locks, groupName) {
		return locks
			.filter(name => name !== Lock.Page)
			.map(name => name === Lock.Group ? 'group:' + groupName : name);
	}

	/**
	 * Take every key at once, or wait until all of them are free together.
	 * @param keys {string[]}
	 * @return {Promise<void>} */
	async acquire(keys) {
		if (!keys.length)
			return;
		if (!this.#blocked(keys, this.#queue.length))
			return void keys.forEach(key => this.#held.add(key));
		await new Promise(resolve => this.#queue.push({keys, resolve}));
		keys.forEach(key => this.#held.add(key));
	}

	/** @param keys {string[]} */
	release(keys) {
		keys.forEach(key => this.#held.delete(key));
		this.#grantWaiting();
	}

	/** True if any key is held, or is claimed by a waiter ahead of position `before`.
	 * @param keys {string[]}
	 * @param before {int} How many queue entries count as "ahead of" this request. */
	#blocked(keys, before) {
		for (let key of keys) {
			if (this.#held.has(key))
				return true;
			for (let i = 0; i < before; i++)
				if (this.#queue[i].keys.includes(key))
					return true;
		}
		return false;
	}

	/** Walk the queue oldest-first and wake everyone whose keys are now free, skipping (but still
	 *  counting) anyone still blocked, so nobody overtakes a waiter it collides with. */
	#grantWaiting() {
		for (let i = 0; i < this.#queue.length; i++) {
			if (this.#blocked(this.#queue[i].keys, i))
				continue;
			let [waiter] = this.#queue.splice(i, 1);
			i--;
			waiter.keys.forEach(key => this.#held.add(key));
			waiter.resolve();
			// The waiter re-adds its keys on wake; adding them here too is what stops the next
			// iteration of this same loop from handing the same key to somebody else.
		}
	}
}

const lockTable = new LockTable();


/*┌──────────────────╮
  | Modal registry   |
  └──────────────────╯*/

/** Name the test file a stack came from, e.g. 'js-admin/ui/DialogBox.test.ts'.  Testimony's own
 *  Testimony._active is useless for this: sixteen tests are in flight at once, so
 *  it names whichever one happened to start last, not the one whose code is on the stack. */
function testFileFromStack(stack) {
	let match = (stack || '').match(/([\w./-]*[\w-]+\.test\.[a-z]+)/);
	return match ? match[1] : '';
}

/**
 * Modal dialogs currently open, and the test file that opened each.
 *
 * A test that TIMES OUT never reaches its cleanup — losing the timeout race only makes the test
 * REPORT a failure; JavaScript cannot cancel the running function, so its body carries on and its
 * modal stays open for the rest of the run, inerting the page for everyone after it.  The
 * Lock.Page phase uses this registry to close those leftovers before it starts.  A registry is
 * the only way to find them, because the offending dialog is usually inside another test's shadow
 * root where document.querySelector cannot see it. */
const openModals = new Map();

/** Wrap showModal/close so openModals stays accurate.  Two thin wrappers, installed once. */
function trackModalDialogs() {
	if (!globalThis.HTMLDialogElement)
		return;
	let show = HTMLDialogElement.prototype.showModal;
	HTMLDialogElement.prototype.showModal = function(...args) {
		openModals.set(this, testFileFromStack(new Error().stack) || 'an unidentified test');
		return show.apply(this, args);
	};
	let close = HTMLDialogElement.prototype.close;
	HTMLDialogElement.prototype.close = function(...args) {
		openModals.delete(this);
		return close.apply(this, args);
	};
}
trackModalDialogs();

/**
 * Close modal dialogs left open by tests that already finished.
 *
 * Three callers, each with its own reason to be safe:  the Lock.Page phase, where nothing at all is
 * in flight;  the end of the run, where the same is true and the point is to leave the human a page
 * they can click;  and a test taking Lock.Focus, where the mutex guarantees no other modal-opening
 * test is running, since every test in this suite that opens one declares that lock.
 *
 * @return {string[]} The tests whose dialogs had to be closed, for reporting. */
function closeAbandonedModals() {
	let abandoned = [];
	for (let [dialog, who] of [...openModals]) {
		if (!dialog.open) {
			openModals.delete(dialog);
			continue;
		}
		abandoned.push(who);
		try { dialog.close(); }
		catch { openModals.delete(dialog); }
		dialog.remove();
	}
	return [...new Set(abandoned)];
}

/** What is blocking, in as much detail as the page will give up: where the focus is stuck, and
 *  which test opened each dialog that is still open right now. */
function openModalsNote() {
	let active = document.activeElement;
	let where = active ? `${active.localName}${active.id ? '#' + active.id : ''}`
		+ `${active.className && typeof active.className === 'string' ? '.' + active.className.trim().split(/\s+/).join('.') : ''}`
		: 'nothing';
	let note = `  The focus is stuck on <${where}>.`;
	let stillOpen = [...openModals].filter(([d]) => d.open && d.matches(':modal'));
	if (stillOpen.length)
		note += '  Modal dialogs still open, by the test that opened them: '
			+ [...new Set(stillOpen.map(([, who]) => who))].join(', ') + '.';
	else
		note += '  No modal dialog is open, so the block is something else — a disconnected '
			+ 'iframe or a page that has lost window focus.';
	return note;
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
			::highlight(testSearch) { background: #fd0; color: #000 }
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

		// The counts shown beside this group, the groups beneath it, and the groups above it all changed.
		for (let item of [this, ...this.childContainer.querySelectorAll('test-item')])
			item.renderStatus();
		for (let item = this.parentNode?.closest('test-item'); item; item = item.parentNode?.closest('test-item'))
			item.renderStatus();
	}

	/**
	 * Called when the expand button is clicked. */
	clickExpand() {
		this.test.expanded = this.expandCB.checked;
		this.childContainer.style.display = this.expandCB.checked ? '' : 'none';
	}

	/**
	 * Show or hide the children without touching test.expanded, which stays the human's own choice.
	 * The search uses this to open groups temporarily and put them back when it is cleared. */
	setOpen(open) {
		if (!this.expandCB || this.expandCB.checked === open) // Most groups don't change between keystrokes.
			return;
		this.expandCB.checked = open;
		this.childContainer.style.display = open ? '' : 'none';
	}

	/**
	 * Find every place the search text occurs in this test's short name, ignoring case.
	 * The matches come back as Ranges over the name's text for the CSS Custom Highlight API to
	 * paint, because rewriting the html of thousands of names on every keystroke was slow.
	 * @param query {string} Lowercase search text.
	 * @returns {Range[]} */
	findMatches(query) {
		let text = this.nameContainer.firstChild, result = []; // No text node at all for the unnamed root.
		let lower = text?.data.toLowerCase() ?? '';
		for (let i = 0; (i = lower.indexOf(query, i)) !== -1; i += query.length) {
			let range = new Range();
			range.setStart(text, i);
			range.setEnd(text, i + query.length);
			result.push(range);
		}
		return result;
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
			else if (this.test.children) { // Before the run: how many tests this group holds, and how many are ticked.
				let {total, checked} = this.leafCounts();
				countText = checked && checked !== total ? `(${checked}/${total})` : `(${total})`;
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
 				<span data-id="nameContainer">${enc(this.test.getShortName())}</span>${this.test.slow ? `<span style="opacity: .5" title="Skipped in fast mode"> [slow]</span>` : ''}${this.test.externalUrl ? `<a
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

		// Children exist now, so a group can show how many tests are ticked beneath it.
		this.renderStatus();
	}

	/**
	 * How many leaf tests are beneath this node, and how many of them have their box ticked — the
	 * number that will run.  Ticks are read from the checkboxes rather than Test.enabled, because
	 * ticking a box changes only the boxes until the form is submitted.
	 * @returns {{total:int, checked:int}} */
	leafCounts() {
		if (!this.test.children)
			return {total: 1, checked: this.enableCB?.checked ? 1 : 0};
		let total = 0, checked = 0;
		for (let child of this.childContainer.children)
			if (child instanceof TestComponent) {
				let counts = child.leafCounts();
				total += counts.total;
				checked += counts.checked;
			}
		return {total, checked};
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
 * Bounds the number of leaf tests executing at once, so a full run doesn't fire hundreds of
 * simultaneous HTTP requests and oversubscribe a small php-fpm pool.  First come, first served. */
class Semaphore {
	constructor(max) {
		this.max = max;
		this.active = 0;
		this.queue = [];
	}
	async acquire() {
		if (this.active >= this.max)
			await new Promise(resolve => this.queue.push(resolve));
		this.active++;
	}
	release() {
		this.active--;
		this.queue.shift()?.();
	}
}

/**
 * Bounds how many test IFRAMES exist at once, which is a much tighter budget than the slot count.
 *
 * An iframe is a fresh realm with its own module map, so it re-imports the ENTIRE graph its test
 * touches — measured at 130-200 requests for a page that pulls in DataTable — sharing nothing with
 * the parent page or with any other iframe.  HTTP caching does not save it: the responses are 304s,
 * but they are still that many round trips.
 *
 * At sixteen concurrent the suite put 500-4200 requests in flight at once and the whole page's
 * throughput collapsed roughly eightyfold — 766 tests finished in the nine seconds before the storm,
 * 20 in the thirty-two seconds during it — because every other test's fetch, and every click and
 * reload the human tries, queues behind them.  Chrome opens six sockets per host for HTTP/1.1, so
 * the queue is the whole cost.
 *
 * Capping it costs a little serialization across the ~80 iframe tests and buys back a page that
 * still answers while the suite runs.
 * @type {?Semaphore} */
let iframeLimit = null;

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

	/** @type {string[]} The shared resources this test reserves for its whole duration, e.g.
	 *   `{locks: [Lock.Focus, Lock.Group]}`.  Empty means the test touches nothing shared and can
	 *   run alongside anything. */
	locks = [];

	isIframe = false;
	isShadowDom = false;

	/** @type {boolean} Slow test (live network, benchmark).  Skipped when the url has fast=1,
	 * unless selected by exact name. */
	slow = false;

	/** @type {boolean} Member of a runAsOneRequest() file.  Doesn't hold a semaphore slot while
	 * awaiting the shared fetch; the coordinator holds one slot for the whole file. */
	oneRequest = false;

	iframeContextProps = null; // object properties merged onto TestimonyContext for iframe tests
	size = null; // [width, height] for iframe/shadow DOM
	shadowDomContextProps = null; // object properties merged onto TestimonyContext for shadow DOM tests

	/** @type {?int} Per-test timeout in ms.  Overrides Testimony.defaultTimeout. */
	timeout = null;

	/** @type {?function} Set while an iframe test is running: tears the iframe down, which is the
	 *   only real way to stop a test.  Null for every other kind. */
	_cancel = null;

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
	 * @param locks {string[]} Lock names.
	 * @param parent {?Test}} */
	constructor(name='', desc='', fn=null, locks=[], parent=null) {
		this.name = name;
		this.desc = desc;
		this.fn = fn;
		this.locks = locks;
		this.parent = parent;

		if (globalThis.window?.location) {
			this.enabled = this.getEnabledFromUrl();
			this.expanded = this.getExpandedFromUrl();
		}
	}

	getEnabledFromUrl() {
		let url = new URL(window.location);
		let fast = url.searchParams.has('fast');

		// Used by Deno.
		if (url.searchParams.has('allTests'))
			return !this.getShortName().startsWith('_') && !(fast && this.slow);

		else {
			let r = url.searchParams.getAll('r');

			// Check even underscored and slow names if they're selected (and not just a parent)
			if (r.includes(this.name))
				return true;

			let parent = this.name;
			do {
				// Enable test if a parent is enabled and the name doesn't start with _.
				if (r.includes(parent)) {
					return !this.getShortName().startsWith('_') && !(fast && this.slow);
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

	/**
	 * Run this leaf test: wait for its gates, build its fixture, run its function under the
	 * timeout, then tear everything down and record the result.  Each step is its own method so
	 * that the order the gates are taken in — the one thing that keeps a run from deadlocking —
	 * reads as a short list here instead of being buried among fixture code. */
	async runTest() {
		// Under the command-line runner, clear old screenshots for this test name before the run.
		// Only iframe and shadow-DOM tests can take a screenshot, and the call is a round trip
		// through puppeteer plus a directory listing, so a plain test must not pay for it.
		if (globalThis.__testimonyCleanupScreenshots && (this.isIframe || this.isShadowDom)) {
			try {
				await globalThis.__testimonyCleanupScreenshots(this.name);
			} catch {}
		}

		let queuedAt = performance.now(); // From here the test waits for its locks and a slot.
		this.status = TestStatus.Running;
		Testimony._active.add(this);
		if (this.element)
			this.element.renderStatus();

		let gates = await this._acquireGates();
		let startedAt = performance.now(); // Every gate is held: the test's own time starts now.
		let hrefAtStart = globalThis.location?.href;

		let pass = false;
		let setupResponse;
		try {
			// The fixture's setup() runs here, once the test holds its slot, so sixty fixtures that
			// each clone a database do not all fire at once before the run has begun.  A setup that
			// throws fails this test alone: an exception escaping runTest() would reject the whole
			// run's Promise.all and end the run with most of its tests unreported.
			if (this.setup)
				setupResponse = await this.setup();
			this.result = await this._withTimeout(() => this._execute(setupResponse));
			pass = true;
			Testimony.passedTests.push(this.name);
		} catch (e) {
			if (Testimony.throwOnError) // Let the debugger catch it.
				throw e;
			this.status = e; // The tree shows the failure and its stack; the console is not repeated to.
			Testimony.failedTests.push([this.name, Testimony.shortenError(e, '\n')]);
		}
		finally {
			this._restoreAddress(hrefAtStart);
			await this._finish(pass, setupResponse, queuedAt, startedAt);
			Testimony._active.delete(this);
			this._releaseGates(gates);
		}
	}

	/**
	 * Wait for everything this test must hold before it runs, in the one order that cannot
	 * deadlock, and return what to release afterwards.
	 *
	 * Locks come BEFORE the semaphore slot, and the order matters.  A test that already holds
	 * a slot never waits for a lock, so slots always drain and the two can never deadlock each
	 * other.  Taken the other way round, sixteen lock-waiters could occupy every slot while the
	 * holder they are waiting on sits in the queue behind them, and the run would stop dead.
	 *
	 * The iframe permit comes before the slot for the same reason: whoever holds a slot must
	 * never be waiting on something scarcer than a slot.  There are far more iframe tests than
	 * the four permits, so the other way round all sixteen slots fill with iframe tests, four of
	 * them run and twelve sit holding a slot they cannot use, and every other test in the suite
	 * starves waiting for a slot that will not come back.
	 *
	 * Only leaf tests take a slot.  Group nodes go through runChildren() and never hold a slot
	 * while awaiting children, so a held slot never waits on another slot.  Members of a
	 * one-request file skip the slot: N of them await ONE shared fetch, and the coordinator holds
	 * a single slot for that fetch instead.
	 * @returns {{lockKeys:string[], iframe:boolean, slot:boolean}} */
	async _acquireGates() {
		let lockKeys = LockTable.keysFor(this.locks, this.parent?.name || '');
		await lockTable.acquire(lockKeys);

		// Lock.Focus promises a page that will actually accept the focus, so its holder never has
		// to check.  A modal left open by a test that timed out is the usual reason it will not.
		//
		// Deliberately NOT done for Lock.Page.  Those tests run in a phase where nothing else is
		// in flight and abandoned modals have already been closed, so there is nothing to wait
		// for — and clearFocus() does not only wait, it also drops the focus to <body>.  Forcing
		// that on a test before its own setup has run changes where the test starts from, which
		// is measurably worse: it broke four QcConsole tests that had been passing.  A Lock.Page
		// test that wants a reset calls clearFocus() itself, at the point that suits it.
		if (this.locks.includes(Lock.Focus)) {
			warnIfWindowUnfocused();

			// Clear leftovers BEFORE this test starts, not just at the end of the run.  A modal
			// dialog inerts the whole document, so the focus this test is about to take cannot be
			// taken at all while one is up, and clearFocus() below would burn its whole deadline
			// against a page that can never accept it.
			//
			// Anything open at this moment is a leftover, and closing it is safe: Lock.Focus is a
			// mutex, so no other test holding it is running, and every test in this suite that
			// opens a modal declares Lock.Focus.  The usual source is a test that TIMED OUT and
			// then opened its dialog anyway — losing the timeout race only reports a failure,
			// while the body carries on past its own teardown and opens the dialog behind it.
			// That is precisely the case a teardown cannot fix and this can.
			let leftovers = closeAbandonedModals();
			if (leftovers.length)
				Testimony.notice(`${this.name} found modal dialogs still open, left by: `
					+ leftovers.join(', ') + '.  They were closed so this test could take the '
					+ 'focus — a modal makes the whole document inert.  Those tests failed to '
					+ 'clean up, most likely by continuing to run after they timed out.');

			if (!await clearFocus())
				Testimony.notice(`${this.name} holds Lock.Focus but the page will not take the focus.`
					+ openModalsNote() + '  Its focus assertions may fail for that reason.');
		}

		if (this.isIframe) {
			iframeLimit ??= new Semaphore(Testimony.maxIframes);
			await iframeLimit.acquire();
		}

		let slot = !this.oneRequest;
		if (slot)
			await Testimony._getSemaphore().acquire();
		return {lockKeys, iframe: this.isIframe, slot};
	}

	/** Give back what _acquireGates() took. */
	_releaseGates({lockKeys, iframe, slot}) {
		if (iframe)
			iframeLimit.release();
		if (slot)
			Testimony._getSemaphore().release();
		lockTable.release(lockKeys);
	}

	/**
	 * Run `body` under this test's timeout.  Members of a one-request file get no timer: they
	 * await a shared fetch whose queue wait would otherwise be charged against every member, and
	 * the coordinator applies its own timeout to the fetch, counted from when it actually fires.
	 * @param body {function():Promise<*>} */
	async _withTimeout(body) {
		let timeoutMs = this.oneRequest ? 0 : (this.timeout ?? Testimony.defaultTimeout);
		if (!timeoutMs)
			return await body();
		let timer;
		let timeoutPromise = new Promise((_, reject) => {
			timer = setTimeout(() => {
				// Kill it if we can (iframe tests only — see _cancel), so a hung test stops
				// costing the run instead of carrying on invisibly behind its own failure.
				let killed = !!this._cancel;
				try { this._cancel?.(); } catch { killed = false; }
				reject(new Error(`Test timed out after ${timeoutMs}ms`
					+ (killed ? ' and was cancelled with its iframe.'
						: '.  It is STILL RUNNING: JavaScript cannot cancel an async function,'
						+ ' so its timers and requests carry on.  Use Testimony.testIframe() to'
						+ ' make a test like this actually stoppable.')));
			}, timeoutMs);
		});
		try {
			return await Promise.race([body(), timeoutPromise]);
		} finally {
			clearTimeout(timer);
		}
	}

	/**
	 * Build the test's fixture — a shadow root, an iframe, or an element in the page, according
	 * to how it was registered — run its function against it, and take the fixture down again.
	 * @returns {*} Whatever the test function returned. */
	async _execute(setupResponse) {
		let fixture = this._buildFixture();
		let context = new TestimonyContext(this, fixture.iframe, {
			assert,
			testName: this.name,
			setupResult: setupResponse,
			shadowRoot: fixture.shadowRoot,
		}, fixture.iframeWrapper);

		// Merge extra context properties from testIframe / testShadowDom
		let extraProps = this.iframeContextProps || this.shadowDomContextProps;
		if (extraProps)
			for (let key in extraProps)
				context[key] = extraProps[key];

		let status;
		if (this.isShadowDom) {
			try {
				status = await this.fn(context);
			} finally {
				fixture.remove();
			}
		}
		else if (this.isIframe) {
			// Save scroll position so focus events inside the iframe don't leave the outer page scrolled.
			let scrollX = window.scrollX, scrollY = window.scrollY;

			// Hand the timeout a way to actually STOP this test.  Removing an iframe destroys
			// its browsing context: its timers stop, its pending requests are abandoned, its
			// modal dialogs leave the top layer.  That is real cancellation, and an iframe
			// test is the only kind that can have it — everywhere else, losing the timeout
			// race just reports a failure while the body runs on to completion.
			this._cancel = fixture.remove;
			try {
				status = await runWithinIframe(fixture.iframe, this.fn, [context], this.name);
			} finally {
				this._cancel = null;
				window.scrollTo(scrollX, scrollY);
			}
			fixture.remove();
		}
		else if (fixture.el) {
			status = await this.fn(fixture.el, context);
			fixture.remove();
		}
		else
			status = await this.fn(context);

		if (Object.keys(TestStatus).includes(status))
			this.status = status;
		else if (status !== false)
			this.status = TestStatus.Pass;
		return status;
	}

	/**
	 * Create the DOM a test runs against.  Every kind returns the same shape so _execute() can
	 * treat them alike: `remove()` takes the whole fixture out of the page again.
	 * @returns {{el:?HTMLElement, iframe:?HTMLIFrameElement, iframeWrapper:?HTMLElement, shadowRoot:?ShadowRoot, remove:function()}} */
	_buildFixture() {
		let width = this.size?.[0] || Testimony.defaultSize[0];
		let height = this.size?.[1] || Testimony.defaultSize[1];
		let title = () => {
			let el = document.createElement('div');
			el.textContent = this.name;
			el.setAttribute('style', 'font-weight: bold; font-size: 12px; margin-bottom: 4px; color: #888;');
			return el;
		};

		// As a shadow DOM.
		if (this.isShadowDom) {
			let shadowHost = document.createElement('div');
			shadowHost.setAttribute('style', `width: ${width}px; height: ${height}px; overflow: auto; border: 1px solid #ccc; background: white`);
			let shadowWrapper = document.createElement('div');
			shadowWrapper.append(title(), shadowHost);
			fixtureHost().append(shadowWrapper);
			let shadowRoot = shadowHost.attachShadow({mode: 'open'});
			shadowRoot.innerHTML = this.html || '';
			return {el: null, iframe: null, iframeWrapper: null, shadowRoot, remove: () => shadowWrapper.remove()};
		}

		// As an iframe.
		if (this.isIframe) {
			let iframeWrapper = document.createElement('div');
			iframeWrapper.setAttribute('style', 'margin: 8px 0; border: 1px solid #ccc');
			iframeWrapper.append(title());

			let iframe = document.createElement('iframe');
			iframe.setAttribute('style', `width: ${width}px; height: ${height}px; border: none;`);
			// Stops <audio>/<video> autoplay in the frame.  Not enough on its own for WebAudio
			// — see muteAudio, which handles the frame's realm once it exists.
			iframe.setAttribute('allow', "autoplay 'none'");
			iframeWrapper.append(iframe);
			fixtureHost().append(iframeWrapper);
			muteAudio(iframe.contentWindow);

			const trimmedHtml = (this.html || '').trim();
			const isFullDoc = trimmedHtml.startsWith('<html') || trimmedHtml.startsWith('<!');
			// The page's import map, so the frame's imports resolve to the same mtime-stamped urls the
			// page already loaded and come from memory instead of re-asking the server (the tests
			// page explains why that matters).  A full document gets it right after its <head>.
			const importMap = Testimony.iframeImportMap
				? `<script type="importmap">${JSON.stringify(Testimony.iframeImportMap)}</script>` : '';
			const html = isFullDoc
				? this.html.replace(/<head(\s[^>]*)?>/i, m => m + importMap)
				: `<!DOCTYPE html>
					<html lang="en">
						<head>
							<meta charset="UTF-8">
							<base href="${document.baseURI}">
							${importMap}
							<style>body { background: white }</style>
						</head>
						<body>${this.html || ''}</body>
					</html>`;
			const doc = iframe.contentDocument;
			doc.open();
			doc.write(html);
			doc.close();
			return {el: null, iframe, iframeWrapper, shadowRoot: null, remove: () => iframeWrapper.remove()};
		}

		// As part of the regular document.
		if (this.html) {
			let el = createEl(this.html);
			fixtureHost().append(el);
			return {el, iframe: null, iframeWrapper: null, shadowRoot: null, remove: () => el.remove()};
		}

		return {el: null, iframe: null, iframeWrapper: null, shadowRoot: null, remove: () => {}};
	}

	/**
	 * A test that runs in this page and leaves its address changed gets the address put back and
	 * gets named: the code it exercised writes history, so it belongs in an iframe, whose address
	 * is its own, or should be handed a stub history.  Iframe tests rewrite their own frame's
	 * address, and a PHP test runs on the server, so neither is looked at.  Tests overlap, so the
	 * name is the test that was running when the change was noticed, which is usually but not
	 * always the one that made it. */
	_restoreAddress(hrefAtStart) {
		if (this.isIframe || this.externalUrl || this.oneRequest || !hrefAtStart || location.href === hrefAtStart)
			return;
		let changed = location.href.slice(pageBase.length);
		Testimony.urlChangers.push({name: this.name, url: changed});
		history.replaceState(history.state, '', pageHref);
		Testimony.notice(`${this.name} changed the page address to ${changed} — it was put back.  Give the code under test a stub history, or move the test into an iframe, where the address is its own.`);
	}

	/**
	 * After the test function has finished, however it finished: run the fixture's teardown,
	 * settle the status, refresh the page, and record the timing. */
	async _finish(pass, setupResponse, queuedAt, startedAt) {
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

		Testimony.timings.push({
			name: this.name,
			ms: Math.round(performance.now() - startedAt),
			waitMs: Math.round(startedAt - queuedAt),
			end: Math.round(performance.now()), // Page time when it finished, to see what makes up the run's tail.
			kind: this.isIframe ? 'iframe' : this.isShadowDom ? 'shadow' : this.oneRequest ? 'oneRequest' : this.externalUrl ? 'external' : 'plain',
			pass,
			server: Testimony._serverSeconds[this.name] ?? null,
		});
	}

	async runChildren() {
		let concurrent = [];

		// Groups (files/folders) run concurrently with each other, just like leaves — the
		// semaphore already bounds actual request fan-out, so this doesn't oversubscribe the
		// server; it just removes the file-after-file serialization that made a suite take the
		// SUM of its files' times instead of roughly the max.
		//
		// Everything starts together.  A test that reserved a resource with {locks: ...} still
		// starts here and then waits inside runTest() for its keys, so two tests that need
		// DIFFERENT resources never wait on each other.  The one exception is Lock.Page, which
		// cannot be delivered by waiting at all: see Testimony._pageQueue.
		for (let child of Object.values(this.children || {})) {
			if (!child.hasEnabledTests())
				continue;
			if (child.locks.includes(Lock.Page) && child.fn)
				Testimony._pageQueue.push(child);
			else
				concurrent.push(child);
		}

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
	/** @type {int} Default per-test timeout in ms.  Set to 0 or null to disable.
	 *
	 * Generous on purpose.  A timeout here is not a cheap "this test is slow" signal — losing the
	 * race only makes the test REPORT a failure, because JavaScript cannot cancel a running async
	 * function, so the body carries on holding its locks' worth of trouble: its modal stays open,
	 * its timers keep firing, its requests keep landing.  A test that trips this because the box
	 * was briefly busy therefore costs far more than the time it saved, and the old 20s tripped
	 * under the suite's own 16-way load. */
	defaultTimeout: 60000,
	defaultSize: [500, 300], // Default [width, height] for iframe/shadow DOM tests.

	/** @type {int} Max leaf tests executing at once.  Caps HTTP fan-out onto the php-fpm
	 * pool so a full run doesn't produce spurious timeouts.  Override per-run with ?concurrency=N.
	 * Sized to match the dev pm.max_children of 16 (see /home/projects/computer/setup.yml);
	 * exceeding the pool just queues requests and measures SLOWER. */
	maxConcurrency: 16,

	/**
	 * How many #[RunAsOneRequest] files may be in flight at once, in a pool of their own.  Each is
	 * one long request that clones a database in its constructor and then runs every method of the
	 * file, so it is the heaviest work in the suite and the run's tail when it queues behind the
	 * thousands of two-millisecond requests registered before it.  A pool of their own lets them
	 * start at once; a SMALL pool keeps their clones from contending — measured 2026-09-09: sixteen
	 * clones at once made every batch take thirty seconds instead of a few. */
	maxOneRequestConcurrency: 4,

	/** How many test iframes may exist at once — far fewer than maxConcurrency, because each one
	 *  re-imports the whole module graph in its own realm rather than sharing the parent's.  See
	 *  iframeLimit for the measurements behind the number.  Override with `?maxIframes=` in the
	 *  url to compare. */
	maxIframes: 4,

	/** @type {?object} The page's import map, copied into every fixture iframe so a frame's imports
	 *  resolve to the same mtime-stamped urls the page already loaded and are reused from memory.  Set by
	 *  tests/index.php; without it a frame's imports re-request every module, and Chrome keeps each
	 *  such response's 2 MB shared-memory pipe until the next major garbage collection — enough of
	 *  them exhausted a desktop renderer's descriptor limit and froze the tab (2026-09-10). */
	iframeImportMap: null,

	/** @type {int} Retry attempts for testExternal when fetch rejects (connection reset) or returns
	 * 503.  Never retries a response that returned a body, so it can't mask a real failure. */
	externalRetries: 2,

	/** @type {int} Base backoff in ms between testExternal retries; grows linearly per attempt. */
	externalRetryBackoff: 250,

	/** @type {int} Timeout in ms for a runAsOneRequest fetch (a whole file's methods in one
	 * request), counted from when the request fires — queue wait is never charged. */
	oneRequestTimeout: 120000,

	/**
	 * Tests that reserved {locks: Lock.Page}, run one at a time after every other test in the run
	 * has finished.
	 *
	 * WHY THIS ONE LOCK IS SCHEDULED AND NOT WAITED FOR.  Every other lock can be delivered by
	 * making its holder wait, because the resource is only touched by tests that declared it.
	 * Lock.Page promises something no mutex can hand over: that NOTHING ELSE IS RUNNING.  Taking
	 * a mutex mid-run only stops tests that have not started yet — the fifteen already in flight
	 * carry on clicking, rendering and competing for the main thread.  Draining the pool on
	 * demand would work, but each holder would pay for its own drain, and the runner would stall
	 * and refill once per holder.  Running them together after the last ordinary test costs one
	 * drain, at the point where it is free.
	 *
	 * It is also the only arrangement that survives a timeout.  A test killed by its timer keeps
	 * running — losing the race makes it REPORT a failure, but JavaScript cannot cancel the
	 * function — so a mutex released on timeout hands the page to the next holder while the
	 * previous one is still writing to it.  Nothing is scheduled after this phase, so nothing can
	 * be corrupted by a straggler; the phase closes their abandoned modal dialogs on the way in.
	 *
	 * @type {Test[]} */
	_pageQueue: [],

	/** @type {?Semaphore} The server-request pool, created lazily from maxConcurrency on first use. */
	_semaphore: null,

	/** @type {?Semaphore} The one-request-file pool, created lazily from maxOneRequestConcurrency on first use. */
	_oneRequestSemaphore: null,

	/** @type {LockTable} The named-lock mutex table.  Exposed for stall diagnosis. */
	_lockTable: lockTable,

	rootTest: new Test(),
	passedTests: [],

	/** @type {[string, string][]} E.g: [ [ 'users.account.resetPassword', 'Error: expected 1 to equal 2']] */
	failedTests: [],

	/** @type {Set<Test>} The leaf tests executing right now.  An unhandled rejection can be
	 * attributed to a test only when exactly one is running; with sixteen in flight it is reported
	 * as unattributed rather than pinned on whichever test happened to be registered last. */
	_active: new Set(),

	/**
	 * One entry per leaf test that ran: {name, ms, waitMs, kind, pass, server}.  `ms` is wall time
	 * from the moment the test held every gate it needed (locks, the iframe permit, a concurrency
	 * slot) until its teardown finished; `waitMs` is how long it queued for those gates first.  A
	 * member of a one-request file still waits inside `ms` for the file's shared request.  `server`
	 * is the seconds a PHP test's method took on the server, when the response reported it.  The
	 * command-line runner writes this to files/timings.json; it is what says which tests are slow.
	 * @type {{name:string, ms:int, waitMs:int, end:int, kind:string, pass:boolean, server:?float}[]} */
	timings: [],

	/** Server-side seconds per PHP test name, filled in as responses arrive.  @type {Object<string, float>} */
	_serverSeconds: Object.create(null),

	/**
	 * Messages the runner itself wants a human to see — a frozen main thread, an abandoned modal,
	 * a file that failed to import.  They go to the console as they happen and are kept here so the
	 * command-line runner, which no longer echoes the page's console, can print them at the end.
	 * @type {string[]} */
	notices: [],

	/** Tests that rewrote this page's address, with what they left there.  @type {{name:string, url:string}[]} */
	urlChangers: [],

	/** Record a runner notice: keep it for the end-of-run report and warn on the console now. */
	notice(message) {
		this.notices.push(message);
		console.warn(message);
	},

	/**
	 * Everything a run produced, in one structure: the counts, one entry per test that ran with
	 * its timing and its error if it failed, failures that belong to no test entry (a name that
	 * matched nothing, an unattributed rejection), and the runner's notices.  The command-line
	 * runner prints this as JSON under --json.
	 * @returns {{passed:int, failed:int, tests:object[], failures:object[], notices:string[]}} */
	getResults() {
		let errors = new Map(this.failedTests);
		let tests = this.timings.map(t => ({...t, error: errors.get(t.name) ?? null}));
		let named = new Set(this.timings.map(t => t.name));
		return {
			passed: this.passedTests.length,
			failed: this.failedTests.length,
			tests,
			failures: this.failedTests.filter(([name]) => !named.has(name)).map(([name, error]) => ({name, error})),
			notices: [...this.notices],
		};
	},

	finished: false,

	_getCallerPrefix() {
		try {
			let stack = new Error().stack;
			let urls = stack.match(/(?:http[s]?|file):\/\/[^\s'")]*/g) || [];
			let callerUrlStr = urls.find(url => !url.includes('/Testimony.js'));
			if (callerUrlStr) {
				if (callerUrlStr.includes('?forTestimony=1')) return '';
				callerUrlStr = callerUrlStr.replace(/:\d+(:\d+)?$/, '');

				// Strip the query string.  When test() is called from the test page's own inline
				// script (e.g. safeImport registering a failed-to-load placeholder), the caller
				// url is the page itself; its ?r=... params would otherwise become the "filename"
				// and mangle the test name.
				callerUrlStr = callerUrlStr.replace(/[?#].*$/, '');

				// A test registered from the page's own inline script — safeImport's failed-to-load
				// placeholder — already carries its full name, so the page contributes no prefix.
				if (globalThis.location && callerUrlStr === location.href.replace(/[?#].*$/, ''))
					return '';

				// Extract filename from URL
				let filename = callerUrlStr.split('/').pop().replace(/\.test\.(js|ts)$/, '');

				let callerDir = new URL('.', callerUrlStr).href;
				let testimonyDir = new URL('.', import.meta.url).href;
				let prefix = this._calculatePrefix(callerDir, testimonyDir);

				if (prefix) return prefix + '.' + filename;
				return filename;
			}
		} catch (e) {
			// Fail silently
		}
		return '';
	},

	/** The dotted folder path of a test file below the tests folder: 'js-admin/util/' → 'js-admin.util'. */
	_calculatePrefix(callerDir, testimonyDir) {
		if (!callerDir.startsWith(testimonyDir))
			return '';
		return callerDir.substring(testimonyDir.length).replace(/\/$/, '').replace(/\//g, '.');
	},

	/**
	 * Get a test by its full dotted name.
	 * @param name {string}
	 * @returns {?Test} */
	getTest(name) {
		let test = this.rootTest;
		for (let item of name.split(/\./g).filter(part => part.trim().length)) {
			test = test.children?.[item];
			if (!test)
				return null;
		}
		return test;
	},

	/**
	 * Check if a test with the given name exists.
	 * @param name {string}
	 * @returns {boolean} */
	testExists(name) {
		return this.getTest(name) !== null;
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
	 * Highlight the tests whose names contain the text, and open every group that holds one.
	 * Clearing the text puts each group back the way the human left it.
	 * @param query {string}
	 * @returns {int} How many names matched. */
	search(query) {
		query = query.trim().toLowerCase();
		let count = 0, first = null, ranges = [];
		let visit = test => {
			let found = query ? test.element.findMatches(query) : [];
			if (found.length) {
				count++;
				first ||= test.element;
				ranges.push(...found);
			}
			let below = false;
			for (let child of Object.values(test.children || {}))
				below = visit(child) || below; // visit() first, so every child is visited.
			test.element.setOpen(below || test.expanded);
			return found.length > 0 || below;
		};
		visit(this.rootTest);
		CSS.highlights.set('testSearch', new Highlight(...ranges));
		first?.firstElementChild.scrollIntoView({block: 'nearest'});
		return count;
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

			// Per-run concurrency override.
			let concurrency = parseInt(url.searchParams.get('concurrency'), 10);
			if (concurrency > 0)
				this.maxConcurrency = concurrency;

			let maxIframes = parseInt(url.searchParams.get('maxIframes'), 10);
			if (maxIframes > 0)
				this.maxIframes = maxIframes;

			// A name that matches nothing is reported directly rather than as a registered test.
			// Registering a placeholder was the old approach and it hid the very problem it was
			// meant to surface: Testimony.test() prefixes a new test with the CALLER's filename,
			// and the caller here is the test page, so the placeholder landed at 'index.<name>'
			// where the r= filter could not select it either.  Nothing ran, and the runner said
			// the generic "No tests ran" instead of naming the typo.
			let requested = url.searchParams.getAll('r');
			for (let name of requested)
				if (!this.testExists(name))
					this.failedTests.push([name, `Test "${name}" does not exist.  Names are the `
						+ `full dotted path, starting with the folder and file — e.g. `
						+ `js-admin.util.ObjectUtil.diff.arrays, not ObjectUtil.diff.arrays.`]);
		}

		// Catch fire-and-forget async errors that no test awaits.
		// Attribute to the currently running test, or report as unattributed.
		window.addEventListener('unhandledrejection', this._onUnhandledRejection);

		try {
			await this.rootTest.run();

			// The Lock.Page phase: one test at a time, with nothing else in flight — no other
			// test to move the focus, hold a modal open, or compete for the main thread.  Except
			// a modal a test that TIMED OUT left behind, since it never reached its cleanup.
			let abandoned = this._pageQueue.length ? closeAbandonedModals() : [];
			if (abandoned.length)
				Testimony.notice('Closed modal dialogs abandoned by: ' + abandoned.join(', ')
					+ '.  Those tests failed without cleaning up, and their dialogs would have '
					+ 'inerted the page for every Lock.Page test below.');
			for (let test of this._pageQueue) {
				test.status = TestStatus.Running;
				await test.run();
				test.parent?.updateStatusFromChildren();
			}

			// Drain: wait briefly to catch late async rejections (e.g. in-flight requests
			// that fail after teardown drops the test database).
			await new Promise(r => setTimeout(r, 500));
		} finally {
			// A modal dialog left open by a test makes the ENTIRE page inert: every click is
			// swallowed, everywhere, while the page still SCROLLS — so it reads as a frozen UI
			// rather than a blocked one, and the results nobody can expand are the first thing a
			// human tries to click.  The Lock.Page sweep above cannot cover this: it only runs
			// when something is queued for that phase, and only sees dialogs abandoned by then.
			// One opened after it inerts the finished page for good.  This sweep is
			// unconditional and last, so the page a human is left looking at is always usable.
			let frozen = longTaskSummary();
			if (frozen)
				Testimony.notice(frozen);

			let stranded = closeAbandonedModals();
			if (stranded.length)
				Testimony.notice('Closed modal dialogs that were still open when the run ended, left '
					+ 'by: ' + stranded.join(', ') + '.  A modal dialog makes the whole page '
					+ 'inert, so these would have swallowed every click on the results.');

			// Always set finished, even if the run throws — the CLI and browser UI both poll it;
			// leaving it false makes the page look completely dead.
			this.finished = true;
		}
	},

	/** @param e {PromiseRejectionEvent} */
	_onUnhandledRejection(e) {
		e.preventDefault(); // Suppress default console error (we handle it ourselves).
		let reason = e.reason;
		let msg = reason instanceof Error
			? Testimony.shortenError(reason, '\n')
			: String(reason);

		// Attribute it to the running test only when there is exactly one; otherwise say which
		// tests were in flight, which is all that can honestly be said.
		let active = [...Testimony._active];
		let test = active.length === 1 ? active[0] : null;
		let testName = test?.name || (active.length ? `(one of: ${active.map(t => t.name).join(', ')})` : '(unattributed)');

		Testimony.notice(`Unhandled rejection in ${testName}: ${msg}`);

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
	 *  - {locks:int=, timeout:int=, slow:boolean=, setup:?function(), teardown:?function(context:TestimonyContext)}
	 *      locks names the shared resources the test reserves — one name or an array of them,
	 *      e.g. {locks: Lock.Focus} or {locks: [Lock.Focus, Lock.Group]}.  Any string works; the
	 *      names on Lock are simply the ones the runner itself understands.
	 *      If setup is set, run it before the test and teardown() after, passing teardown the
	 *      TestimonyContext.
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
				test = new Test(name, '', null, [], parent);

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
						if (arg.locks !== undefined)
							test.locks = normalizeLocks(arg.locks, name);
						if (arg.timeout !== undefined)
							test.timeout = arg.timeout;
						if (arg.slow !== undefined)
							test.slow = arg.slow;
						if (arg.oneRequest !== undefined)
							test.oneRequest = arg.oneRequest;
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

				// The constructor computed enabled before the slow option was parsed above.
				if (test.slow && globalThis.window?.location)
					test.enabled = test.getEnabledFromUrl();

				parent.children[item] = test;
				return test;
			}

			// Create test if it doesn't exist.
			else {
				test.children[item] = test.children[item] || new Test(pathSoFar.join('.'), '', null, [], test);
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
			let resp = await Testimony._fetchWithRetry(url);
			let responseText = await resp.text();
			if (!responseText.includes(passText))
				throw new Error(Testimony._phpErrorToText(responseText));
			let result = responseText.slice(responseText.indexOf(passText) + passText.length).trim();
			let seconds = result.match(/^in ([\d.]+) seconds\.\s*/);
			if (seconds)
				Testimony._serverSeconds[test.name] = parseFloat(seconds[1]);
			result = result.replace(/^in [\d.]+ seconds\.\s*/, '');
			return result || undefined;
		});

		// Allow clicking the link icon to go directly to the test.
		test.externalUrl = Testimony._absolute(url);

		return test;
	},

	/**
	 * Coordinate a #[RunAsOneRequest] PHP test file: ONE http request runs all enabled methods
	 * server-side on one instance, so an expensive constructor (usually a createTestingDB clone)
	 * runs once per file instead of once per method.  Each method still registers as its own
	 * test whose fn awaits its entry via result(), so failures, output and the UI stay per-method.
	 * If the response frame is missing (a method die()'d or hard-fataled mid-batch), falls back
	 * to running every method as its own request, exactly like testExternal.
	 * @param url {string} e.g. 'php-admin/util/AuthTest.php'
	 * @param methods {string[]} All test method names in the file.
	 * @returns {{result: function(string):Promise<*>}} */
	runAsOneRequest(url, methods) {
		// Derive the test-name prefix from the url the same way the PHP side does.
		let prefix = url.replace(/\.php$/, '').replace(/\//g, '.');
		let fetchPromise = null;
		let entries = null; // Map method -> {pass, seconds, output?, error?, result?}
		let fallback = false; // Frame missing: re-run methods individually.

		const fetchBatch = async () => {
			let enabled = methods.filter(m => Testimony.getTest(`${prefix}.${m}`)?.enabled);
			let token = Math.random().toString(36).slice(2);
			let sem = Testimony._getSemaphore('oneRequest');
			await sem.acquire(); // One slot for the whole file, from the one-request pool; member tests hold none.
			let text;
			try {
				// Timeout counted from here (after the slot), so queue wait isn't charged.
				let abort = new AbortController();
				let timer = setTimeout(() => abort.abort(new Error(`One-request run of ${url} timed out after ${Testimony.oneRequestTimeout}ms`)), Testimony.oneRequestTimeout);
				try {
					let resp = await fetch(Testimony._absolute(`${url}?methods=${enabled.join(',')}&batch=${token}`),
						{signal: abort.signal, credentials: 'omit'});
					text = await resp.text();
				} finally {
					clearTimeout(timer);
				}
			} finally {
				sem.release();
			}
			let parts = text.split(`--TESTIMONY-${token}--`);
			if (parts.length < 3) {
				fallback = true;
				Testimony.notice(`Batch request for ${url} returned no result frame; running its methods `
					+ `individually.  Response tail:\n${text.slice(-500)}`);
				return;
			}
			entries = new Map(JSON.parse(parts[parts.length - 2]).map(e => [e.method, e]));
		};

		const individual = async method => {
			let sem = Testimony._getSemaphore();
			await sem.acquire(); // Batched tests skip the per-test slot, so take one here.
			try {
				let abort = new AbortController();
				let timer = setTimeout(() => abort.abort(new Error(`${url}?${method} timed out after ${Testimony.oneRequestTimeout}ms`)), Testimony.oneRequestTimeout);
				let text;
				try {
					let resp = await fetch(Testimony._absolute(`${url}?${method}`), {signal: abort.signal, credentials: 'omit'});
					text = await resp.text();
				} finally {
					clearTimeout(timer);
				}
				if (!text.includes('test passed'))
					throw new Error(Testimony._phpErrorToText(text));
				return text.slice(text.indexOf('test passed') + 'test passed'.length)
					.replace(/^ in [\d.]+ seconds\.\s*/, '').trim() || undefined;
			} finally {
				sem.release();
			}
		};

		return {
			async result(method) {
				fetchPromise ??= fetchBatch();
				try {
					await fetchPromise;
				} catch (e) {
					// Batch fetch itself failed (timeout, connection reset): run methods
					// individually so each reports its own real result.
					if (!fallback) {
						fallback = true;
						Testimony.notice(`Batch request for ${url} failed (${e.message}); running its methods individually.`);
					}
				}
				if (fallback)
					return individual(method);
				let e = entries.get(method);
				if (!e)
					throw new Error(`Batch response for ${url} has no result for ${method}.`);
				if (typeof e.seconds === 'number')
					Testimony._serverSeconds[`${prefix}.${method}`] = e.seconds;
				if (!e.pass)
					throw new Error((e.error || 'Failed.') + (e.output ? '\n' + e.output : ''));
				if (e.output)
					console.log(`${prefix}.${method} output:\n${e.output}`);
				return e.result;
			}
		};
	},

	/**
	 * Register the tests that live in PHP files.
	 *
	 * Each path is imported as a JavaScript module: the PHP file sees `?forTestimony=1` and, instead
	 * of running anything, prints one Testimony registration per test method.  The imports are all
	 * issued at once, because each is a ~2 ms request and there are more than a hundred of them, so
	 * awaiting them one by one spent most of the discovery phase waiting on the network.  Files then
	 * finish registering in an arbitrary order, so once every import has settled the file and folder
	 * nodes are put back into the order the paths were given.
	 *
	 * A file that fails to import — a parse error, a missing exposeToWeb() line, a 500 — is not
	 * dropped silently: it registers as one failing test under the file's own name, so the failure
	 * shows in red on the page in the place the file's tests would have been, and fails the
	 * command-line run.
	 *
	 * @param paths {string|string[]} Paths relative to the tests page, e.g. './php-admin/util/PathTest.php'. */
	async safeImport(paths) {
		if (typeof paths === 'string')
			paths = [paths];
		await Promise.all(paths.map(path => this._importTestFile(path)));
		this._orderGroups(paths);
	},

	/**
	 * Reduce what a PHP test request answered to text a terminal can show.
	 *
	 * A test that fails outside batch mode answers with Xdebug's HTML error table: the message in
	 * one or two header rows, then a call stack with a row per frame and five cells per row.  That
	 * table is unreadable as raw markup, so it is rewritten as the message followed by one
	 * "#n function  location" line per frame.  Anything printed before the table — a test's own
	 * output — is kept above it.  Text with no table is returned trimmed.
	 * @param body {string}
	 * @returns {string} */
	_phpErrorToText(body) {
		if (!/class='xdebug-error/i.test(body) || typeof DOMParser === 'undefined')
			return body.trim();
		let doc = new DOMParser().parseFromString(body, 'text/html');
		let lines = [];
		let seen = new Set();
		for (let table of doc.querySelectorAll('table.xdebug-error')) {
			for (let row of table.querySelectorAll('tr')) {
				let cells = [...row.children].map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
				let line = cells.length === 5 && /^\d+$/.test(cells[0])
					? `#${cells[0]} ${cells[3]}  ${cells[4]}`  // A stack frame: number, time, memory, function, location.
					: cells.join(' ').replace(/^\( ! \)\s*/, '');
				if (line && line !== 'Call Stack' && !/^# Time Memory Function Location$/.test(line) && !seen.has(line)) {
					seen.add(line);
					lines.push(line);
				}
			}
			table.remove();
		}
		let rest = doc.body.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
		return (rest ? rest + '\n' : '') + lines.join('\n');
	},

	/** Import one PHP test file, registering a failing placeholder test if it cannot be loaded. */
	async _importTestFile(path) {
		try {
			await import(`${path}?forTestimony=1`); // server must send JS + correct MIME
		} catch (err) {
			// Fetch the same URL manually to see the error output.  Resolved the same way the
			// import() above resolves it — against the test page, not the address bar.
			let text;
			try {
				const resp = await fetch(Testimony._absolute(path), {credentials: 'omit'});
				text = await resp.text();
			} catch (fetchErr) {
				text = String(fetchErr);
			}
			let summary = (this._phpErrorToText(text) || String(err)).split('\n')[0];

			// List the file as a failing test with the error in red as the description.  The name
			// is the one the file's tests would have had, so it sorts into place in the tree.
			Testimony.test(`${this._testNameFromPath(path)}.loadFailed`,
				{desc: `<span style="color:#f00">${enc(path)} failed to load: ${enc(summary)}</span>`},
				() => { throw new Error(`${path} failed to load: ${summary}`); });
			Testimony.notice(`Import failed: ${path}: ${summary}`);
		}
	},

	/** './php-admin/util/PathTest.php' → 'php-admin.util.PathTest', the same rule Testimony.php uses. */
	_testNameFromPath(path) {
		return path.replace(/^\.\//, '').replace(/\.php$/i, '').replace(/[\\/]/g, '.');
	},

	/**
	 * Put the file and folder nodes that `paths` registered back into the order `paths` lists them.
	 * Leaf tests keep their declaration order; only nodes named by a path, or by a folder on the
	 * way to one, are moved. */
	_orderGroups(paths) {
		let rank = new Map(); // Full dotted name → index of the first path under it.
		paths.forEach((path, i) => {
			let parts = this._testNameFromPath(path).split('.');
			for (let depth = 1; depth <= parts.length; depth++) {
				let name = parts.slice(0, depth).join('.');
				if (!rank.has(name))
					rank.set(name, i);
			}
		});

		const reorder = test => {
			if (!test.children)
				return;
			let entries = Object.entries(test.children);
			let ranked = entries.filter(([, child]) => rank.has(child.name))
				.sort((a, b) => rank.get(a[1].name) - rank.get(b[1].name));
			if (!ranked.length)
				return;
			let next = 0;
			test.children = Object.fromEntries(entries.map(entry => rank.has(entry[1].name) ? ranked[next++] : entry));
			for (let child of Object.values(test.children))
				reorder(child);
		};
		reorder(this.rootTest);
	},

	// Internal functions:

	/**
	 * The pool a test takes its slot from, created lazily so a maxConcurrency override
	 * (e.g. ?concurrency=N) set before the run takes effect.
	 * @param pool {string} 'oneRequest' for the request that runs a whole PHP file; anything else shares the main pool.
	 * @returns {Semaphore} */
	_getSemaphore(pool='main') {
		if (pool === 'oneRequest')
			return this._oneRequestSemaphore ??= new Semaphore(this.maxOneRequestConcurrency);
		return this._semaphore ??= new Semaphore(this.maxConcurrency);
	},

	/**
	 * Resolve a page-relative test url against the address the test page was LOADED from, never
	 * against wherever a running test has since pushed the address bar.  See pageBase.
	 * @param url {string}
	 * @returns {string} */
	_absolute(url) {
		return pageBase ? new URL(url, pageBase).href : url;
	},

	/**
	 * fetch() that retries only connection-level failures and 503s, so transient pool blips don't
	 * surface as spurious test failures.  A response with any other status is returned as-is and
	 * never retried, so a real 200/500 body can't be masked.
	 *
	 * Sent WITHOUT cookies, like every other request the runner itself makes to a PHP test.  A
	 * developer runs the page logged in, and with the session cookie along, PHP serializes every
	 * test request on that session's lock (php-admin took 86 s in the browser against 25 s from
	 * the command line, with "could not reach the server" timeouts) and the tests see the
	 * developer's login (a test that expects an anonymous request fails).  Without it, a browser
	 * run and a headless run make identical requests.
	 * @param url {string}
	 * @returns {Promise<Response>} */
	async _fetchWithRetry(url) {
		url = this._absolute(url);
		for (let attempt = 0; ; attempt++) {
			try {
				let resp = await fetch(url, {credentials: 'omit'});
				if (resp.status === 503 && attempt < this.externalRetries) {
					await new Promise(r => setTimeout(r, this.externalRetryBackoff * (attempt + 1)));
					continue;
				}
				return resp;
			} catch (e) {
				if (attempt < this.externalRetries) {
					await new Promise(r => setTimeout(r, this.externalRetryBackoff * (attempt + 1)));
					continue;
				}
				throw e;
			}
		}
	},

	/**
	 * @param error {Error}
	 * @param br {string}
	 * @returns {string} */
	shortenError(error, br='\n  ') {
		return this.shortenErrorStack(error.stack || error.message || String(error)).join(br);
	},

	/**
	 * The stack without the runner's own frames and without the server name, line by line.
	 * @param errorStack {string|string[]}
	 * @returns {string[]} */
	shortenErrorStack(errorStack) {
		if (typeof errorStack === 'string')
			errorStack = errorStack.split(/\n/g);
		return errorStack
			.filter(line => !line.includes('Testimony.js') || line.includes('eval at runWithinIframe'))
			.map(line => line.replace(new RegExp(window.location.origin, 'g'), ''));
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
 * @param extraUrlArgs {string[]} Extra query params, e.g. 'fast=1' or 'concurrency=8'.
 * @returns {Promise<void>} */
async function runPage(path, webServer=null, webRoot=null, tests=null, headless=false, port=8004, extraUrlArgs=[], {verbose=false, json=false, list=false}={}) {

	/*
	import puppeteer from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';
	import { Launcher } from 'https://esm.sh/chrome-launcher@0.15.0';
	import { serveDir } from 'jsr:@std/http@1.1.3/file-server';
	 */

	// Set cwd to the same path as Testimony.js.  Is this only needed on windows?
	const scriptDir = new URL(".", import.meta.url);
	Deno.chdir(scriptDir);

	// Dynamically import so we only pull them in if necessary.
	const [
		{default: puppeteer},
		{Launcher},
		{serveDir},
	] = await Promise.all([
		import('https://deno.land/x/puppeteer@16.2.0/mod.ts'),
		import('https://esm.sh/chrome-launcher@0.15.0'),
		import('jsr:@std/http@1.1.3/file-server')
	]);

	/**
	 * Serve webRoot over http so the headless browser can load the test page from it.
	 * Two of the choices here are deliberate and should not be undone:
	 * 1. The listener binds 127.0.0.1 instead of every interface.  This server hands
	 *    out the whole web root with no authentication whatsoever, so nothing beyond
	 *    this machine should be able to reach it while a test run is in progress.
	 * 2. serveDir resolves the request path against the root and rejects anything that
	 *    escapes it, which is what stops a request for "/../../../etc/passwd" from
	 *    reading a file outside the web root.  Do not replace it by joining the url
	 *    pathname onto the root and opening whatever string comes out — a browser
	 *    normalizes ".." away before sending, but any other http client can send it. */
	const startServer = () => {
		const absWebRoot = Deno.realPathSync(webRoot);
		return Deno.serve(
			{hostname: '127.0.0.1', port, onListen() {}},
			request => serveDir(request, {fsRoot: absWebRoot, quiet: true}));
	};

	/**
	 * Deno keeps the listening socket open until BOTH the shutdown promise and the
	 * server's `finished` promise have settled, so awaiting only one of them lets a
	 * back-to-back run race the previous run for the port and fail to bind. */
	const stopServer = async (server) => {
		await server.shutdown();
		await server.finished;
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
	let urlArgs = [...extraUrlArgs];
	if (!tests)
		urlArgs.push('allTests=1');
	else
		for (let test of tests)
			urlArgs.push(`r=${test}`);


	const counts = Object.create(null);


	// Cleanup: Expose bridges for taking and cleaning up screenshots of the test's iframe.
	await page.exposeFunction('__testimonyCleanupScreenshots', testName => CommandLineUtil.screenshotCleanup(testName, counts));
	await page.exposeFunction('__testimonyScreenshot', (testName, filename, selector=null) => CommandLineUtil.screenshot(testName, page, counts, filename, selector));

	// Forward the page's console output to the terminal only when asked.  A failing test's error
	// and stack are reported from Testimony.failedTests at the end, and the runner's own warnings
	// from Testimony.notices, so by default the page's console (test chatter, production code's
	// logging, the browser's "Failed to load resource" lines for deliberate 500s) stays silent.
	if (verbose && !json)
		page.on('console', CommandLineUtil.consoleLog);

	let rejectFailure;
	const failure = new Promise((_, reject) => {
		rejectFailure = reject;
	});
	let pageErrorHandled = false;
	page.on('pageerror', async err => {
		if (pageErrorHandled) return;
		pageErrorHandled = true;

		// Report BOTH: the page content (e.g. a PHP error rendered as text, where the JS
		// SyntaxError that follows it says nothing) and the error itself (where the page is a
		// working test page and something threw inside it, and the page text is just the UI).
		// Showing only the page text hid the stack of a real exception thrown from a
		// ResizeObserver callback, which is the only place it was recorded.
		let detail = '';
		try {
			detail = await page.evaluate(() =>
				document.body?.innerText || document.documentElement?.innerText || '');
		} catch {}
		const trimmed = detail.trim().slice(0, 3000);
		if (trimmed)
			console.error(`\x1b[31mTest page error: ${err?.stack || err?.message || err}\n${trimmed}\x1b[0m`);
		else
			console.error(`\x1b[31mPage error: ${err?.stack || err?.message || err}\x1b[0m`);
		rejectFailure(err);
	});

	// Wait for the tests to finish
	const success = page.waitForFunction(() => window.Testimony?.finished === true, {timeout: 0});

	// Go to test pages.
	const url = webServer
		? `${webServer}/${path}?${urlArgs.join('&')}`
		: `http://127.0.0.1:${port}/${path}?${urlArgs.join('&')}`;
	const runStartedAt = performance.now();
	const response = await page.goto(url);

	// 1. If the HTTP response itself is an error, surface it immediately.
	if (response && !response.ok()) {
		const body = await response.text().catch(() => '');
		const plain = body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
		console.error(`\x1b[31mTest page returned HTTP ${response.status()}:\n${plain.slice(0, 2000)}\x1b[0m`);
		success.catch(() => {});
		await browser.close();
		if (server) await stopServer(server);
		return 1;
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
		if (server) await stopServer(server);
		return 1;
	}

	// 3. Wait for all tests to finish (or a page error to occur).
	try {
		await Promise.race([success, failure]);
	} catch {
		// Error already printed by pageerror handler.
		success.catch(() => {});
		await browser.close();
		if (server) await stopServer(server);
		return 1;
	}

	// --list: the discovered names, one per line, without running anything.  The page runs
	// whatever its url selected, so wait for that (an unselected page finishes at once).
	if (list) {
		await success;
		const names = await page.evaluate(() => {
			const leaves = [];
			const walk = t => t.children ? Object.values(t.children).forEach(walk) : leaves.push(t.name);
			walk(window.Testimony.rootTest);
			return leaves.sort();
		});
		console.log(names.join('\n'));
		await browser.close();
		if (server) await stopServer(server);
		return 0;
	}

	const failedTests = await page.evaluate(() => window.Testimony?.failedTests);
	const passedTests = await page.evaluate(() => window.Testimony?.passedTests);

	// Zero tests ran means a bad selector (or everything filtered out), never success.
	// Without this, a typo'd test name prints "All tests passed" — fatal for a commit hook.
	if (!passedTests.length && !failedTests.length) {
		console.error(`\x1b[31mNo tests ran.${tests ? ' Nothing matched: ' + tests.join(', ') : ''}\x1b[0m`);
		await browser.close();
		if (server) await stopServer(server);
		return 1;
	}

	const notices = await page.evaluate(() => window.Testimony?.notices || []);
	const timings = await page.evaluate(() => window.Testimony?.timings || []);
	await CommandLineUtil.writeTimings(timings);
	const seconds = (performance.now() - runStartedAt) / 1000;
	if (json) // For another program: the whole result, nothing else on stdout.
		console.log(JSON.stringify({...await page.evaluate(() => window.Testimony.getResults()), seconds: +seconds.toFixed(2)}, null, '\t'));
	else
		CommandLineUtil.printTestResult(passedTests, failedTests, notices, seconds, verbose);

	await browser.close();
	if (server)
		await stopServer(server);

	return failedTests.length ? 1 : 0;
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

	/**
	 * The end-of-run report: what failed, what the runner noticed, and one summary line.  The
	 * passed tests are listed only when verbose; a green run should read as one line.
	 * @param passedTests {string[]}
	 * @param failedTests {[string, string][]} Name and shortened error.
	 * @param notices {string[]} Runner warnings collected during the run (see Testimony.notices).
	 * @param seconds {float} Wall time of the run.
	 * @param verbose {boolean} */
	printTestResult(passedTests, failedTests, notices=[], seconds=0, verbose=false) {
		if (verbose && passedTests.length)
			console.log(`%cThese ${passedTests.length} tests passed:\n - ${passedTests.join('\n - ')}`, 'color: #0c0');

		if (failedTests.length) {
			console.log(`These ${failedTests.length} tests failed:`);
			for (const [testName, testError] of failedTests)
				console.error(`%c${testName} - ${testError}`, 'color: #c00');
		}

		for (const notice of notices)
			console.warn(`%c${notice}`, 'color: #cc0');

		let summary = `${passedTests.length} passed, ${failedTests.length} failed in ${seconds.toFixed(1)} s.`;
		console.log(failedTests.length ? summary : `%c${summary}`, ...(failedTests.length ? [] : ['color: #0c0']));
	},

	/**
	 * Write the per-test timings to files/timings.json, slowest first, so "which tests are slow"
	 * has an answer that does not require re-running anything.  Nothing is printed: the file is
	 * for whoever is working on the suite's speed, not for a routine run. */
	async writeTimings(timings) {
		try {
			let sorted = [...timings].sort((a, b) => b.ms - a.ms);
			let json = JSON.stringify({
				date: new Date().toISOString(),
				tests: sorted.length,
				totalMs: sorted.reduce((sum, t) => sum + t.ms, 0),
				timings: sorted,
			}, null, '\t');
			await Deno.writeTextFile('files/timings.json', json);
		} catch (e) {
			console.warn(`Could not write files/timings.json: ${e.message}`);
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

		// Find the target element: the test's iframe or shadow host.
		let handle = selector ? await page.$(selector) : null;
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



// Also hung off Testimony so a test that has only the global can reach the names.  The generated
// PHP test modules emit plain strings ({locks: ["Group"]}) and need nothing from here.
Testimony.Lock = Lock;

globalThis.Testimony = Testimony; // used by command line test runner.

export default Testimony;
export {assert, clearFocus, Testimony};


// If Testimony.js is run directly from the command line
if (import.meta.main) {
	let pages = null;
	let tests = null;
	let webserver = null;
	let webroot = null;
	let headless = false;
	let verbose = false;
	let json = false;
	let list = false;
	let extraUrlArgs = [];
	for (let arg of Deno.args) {

		if (arg.startsWith('--page=')) {
			if (!pages)
				pages = [];
			pages.push(arg.slice('--page='.length));
		}

		else if (arg.startsWith('--webroot='))
			webroot = arg.slice('--webroot='.length);

		// Use a different web server instead of running our own.
		else if (arg.startsWith('--webserver='))
			webserver = arg.slice('--webserver='.length);


		else if (arg == '--headless')
			headless = true;

		// Echo everything the page logs and list the tests that passed.  The default is to print
		// only what failed, so a green run is a single line.
		else if (arg == '--verbose')
			verbose = true;

		// Print the run's results as JSON (see Testimony.getResults) instead of the text report.
		else if (arg == '--json')
			json = true;

		// Print the discovered test names, one per line, and run nothing.
		else if (arg == '--list')
			list = true;

		// Skip tests marked slow (live network calls, benchmarks).
		else if (arg == '--fast')
			extraUrlArgs.push('fast=1');

		else if (arg.startsWith('--concurrency='))
			extraUrlArgs.push('concurrency=' + parseInt(arg.slice('--concurrency='.length), 10));

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

	// Pages run one after another; the process exits once, non-zero if any page had a failure.
	// (The old loop neither awaited runPage() nor stopped it from exiting after the first page.)
	if (pages) {
		let code = 0;
		for (let page of pages)
			code = Math.max(code, await runPage(page, webserver, webroot, list ? [] : tests, headless, 8004, extraUrlArgs, {verbose, json, list}));
		Deno.exit(code);
	}
}
