// The built bundle, not src/: the pages that advertise a 12.6KB library shouldn't fetch it as 23 separate modules.
// Everything under docs/js imports this same file, so the page holds one copy of Solarite.
import h, {toEl, Solarite} from "../../dist/Solarite.min.js";
import "./ui/FlexResizer.js";
import highlight from "./ui/StaticCode.js";

/** The site root, which every example's relative imports (`./dist/Solarite.min.js`) are written against. */
const root = new URL('../../', import.meta.url);

/**
 * What every preview document starts with, before anything the caller adds.
 * The base address makes an example's `./dist/...` import work whichever page the playground is on.
 * The import map is for compiled JSX, which imports 'solarite/jsx-runtime'.  It names the runtime built for
 * Solarite.min.js, the build the examples import; the plain jsx-runtime.js imports Solarite.js, which would
 * put a second copy of Solarite in the preview. */
const importMap = JSON.stringify({imports: {
	'solarite': `${root}dist/Solarite.min.js`,
	'solarite/jsx-runtime': `${root}dist/jsx-runtime.min.js`}});

let jsxWorker, jsxRequests = 0;

/**
 * Compile JSX to JavaScript in a worker, which is only started the first time it is needed because the
 * compiler is 3.5MB.
 * @param code {string}
 * @return {Promise<string>} */
function compileJsx(code) {
	return new Promise(resolve => {
		jsxWorker ??= new Worker(new URL('./JsxWorker.js', import.meta.url), {type: 'module'});
		let id = ++jsxRequests;
		jsxWorker.addEventListener('message', function listen({data}) {
			if (data.id !== id)
				return;
			jsxWorker.removeEventListener('message', listen);
			resolve(data.code);
		});
		jsxWorker.postMessage({id, code});
	});
}

export default class Playground extends Solarite {

	/**
	 * @param value {string} The code to show.
	 * @param language {string} 'javascript', 'jsx' and 'html' get a live preview.  Anything else is an editor alone,
	 *     and the documentation relies on that: a fence written as `JavaScript` rather than `javascript` has no preview.
	 *     It can be changed later; the next run() uses the new value.
	 * @param width {int} Width of the editor, as a percentage.
	 * @param prefix {string} Html for the preview document's head, such as a stylesheet link.
	 * @param maxHeight {int} If the editor is taller than the preview, and taller than this height, limit it the max of this height and the preview height.
	 * @param capPreview {boolean} Keep the preview from growing taller than the editor beside it; it scrolls instead.
	 * @param lazy {boolean} Show the code statically coloured, and load the editor, a 740KB download, only when someone
	 *     points at, focuses, or touches the code.  The preview runs either way.
	 * */
	constructor({value, language='javascript', width=50, prefix='', maxHeight=620, capPreview=false, lazy=false}={}) {
		super();
		value = value || (this.code ? this.code.querySelector('script')?.textContent : '');
		this.value = value;
		this.language = language;
		this.width = width;
		this.prefix2 = prefix;
		this.maxHeight = maxHeight;
		this.capPreview = capPreview;
		this.lazy = lazy;
		this.runs = 0;
		this.render();

		// The code is always drawn statically first, so there is something to read while the editor arrives.
		this.showStatic(value);
		if (lazy)
			for (let type of ['pointerenter', 'focusin', 'touchstart'])
				this.placeholder.addEventListener(type, () => this.loadEditor(type === 'focusin'), {once: true, passive: true});
		else
			this.loadEditor();
		this.run();
	}

	/** Draw code in the static placeholder, coloured if it is a language the small highlighter knows. */
	showStatic(code) {
		if (/^(javascript|js|jsx|html)$/i.test(this.language))
			this.placeholder.innerHTML = highlight(code);
		else
			this.placeholder.textContent = code;
	}

	/** The code being shown, whether or not the editor has been loaded yet. */
	get source() {
		return this.editorReady ? this.editor.value : this.value;
	}
	set source(value) {
		this.value = value;
		if (this.editorReady)
			this.editor.value = value;
		else
			this.showStatic(value);
	}

	/**
	 * Replace the static code with the real editor.  Does nothing if that has already happened.
	 * @param focus {boolean} Move the focus into the editor, because it was on the code being replaced. */
	async loadEditor(focus=false) {
		if (this.loading)
			return;
		this.loading = true;

		// The editor element is made here rather than in the template so the static code stays on screen until the
		// editor has drawn itself; swapping first would show an empty card while CodeMirror downloads.
		let {default: CodeEditor2} = await import("./ui/CodeEditor2.js");
		let editor = new CodeEditor2({value: this.value, language: this.language});
		await editor.ready;

		// Code set while the editor was loading, by a tab or Reset, went to the placeholder; carry it over.
		editor.value = this.value;
		this.editor = editor;
		this.editorReady = true;
		this.placeholder.replaceWith(editor);
		if (focus)
			editor.view?.focus();

		editor.addEventListener('input', () => {
			this.edited = true;
			this.run();
		});
		editor.setTabSize(2);

		// Attach the TypeScript language service (completions, hover, diagnostics) lazily on first
		// focus, so the ~3.5MB compiler + type libs never load until someone actually types here.
		this.editor.addEventListener('focusin', () => {
			import("./lsp/ts/TsService.js").then(({default: tsService}) => {
				this.editor.setServices({js: tsService({
					filename: 'file.js', fetchImports: false, compilerOptions: {checkJs: false}
				})});
			});
		}, {once: true});
	}

	/**
	 * Show the code in the preview.
	 * Afterwards a `preview` event is dispatched.  `detail.error` is true if the example threw while it started, and
	 * `detail.edited` is true if the run came from someone typing rather than from the page.
	 * @param force {boolean} Run even though the code hasn't changed, to reset what the example was showing. */
	async run(force=false) {
		let code = this.source;
		let edited = this.edited;
		this.edited = false;

		// The editor reports each edit twice, and a run is a whole new document, so the same code is only run once.
		if (!force && code === this.lastCode && this.language === this.lastLanguage)
			return;
		this.lastCode = code;
		this.lastLanguage = this.language;
		let html;
		if (this.language === 'javascript')
			html = `<script type="module">${code}</script>`;
		else if (this.language === 'jsx') {

			// Compiling takes a moment, so a newer edit can overtake this one; only the latest is shown.
			let run = ++this.runs;
			code = await compileJsx(code);
			if (run !== this.runs || this.language !== 'jsx')
				return;
			html = `<script type="module">${code}</script>`;
		}
		else if (this.language === 'html')
			html = code;
		else {
			for (let pane of [this.placeholder, this.editor]) {
				pane?.style.setProperty('width', '100%');
				pane?.style.setProperty('border-right', 'none');
			}
			this.resizer.style.display = 'none';
			this.preview.style.display = 'none';
			return;
		}
		let run = ++this.runs;

		// Create a new preview iframe and swap it for the old one once the example has drawn itself.
		let newIframe = toEl(`<iframe data-id="preview" frameborder="0" style="display: none; height: 0">`);
		let failed = false;
		newIframe.onload = () => {

			newIframe.contentWindow.document.open();
			newIframe.contentWindow.onerror = (msg, url, line, col, error) => {
				failed = true;
				setTimeout(() => {
					let message;
					if (error instanceof newIframe.contentWindow.SyntaxError)
						message = `${msg} on line ${line}:${col}`
					else
						message = shortenError(error)

					let errorDiv = `<div style="color: red; font: 12px sans-serif; position: fixed; left: 0; bottom: 0;
						width: 100%; padding: 5px; max-height: 50%; overflow-y: auto; background: white">${message}</div>`;
					newIframe.contentWindow.document.body.append(toEl(errorDiv));
				}, 0);
			}

			newIframe.contentWindow.document.write(
				`<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${root}">` +
				`<script type="importmap">${importMap}</script>${this.prefix2}</head><body>` + html +

				// Modules run in document order once parsing ends, so this one runs after the example's own, even
				// if that one threw, and tells the swap below that the example has drawn whatever it is going to.
				`<script type="module">frameElement.dispatchEvent(new Event('drawn'))<\/script>`);

			newIframe.contentWindow.document.close();

			if (document.documentElement.hasAttribute('dark'))
				newIframe.contentWindow.document.documentElement.setAttribute('dark', '');

			// Prevent flashing.  The old preview stays until the new one's `drawn` event, sent by the script written
			// after the example.  Swapping any sooner shows an empty frame for a moment on every edit.  A frame does
			// NOT fire `load` again for a document written from inside its first `load`, so that can't be the signal.
			// The timer is only for a document that never gets that far, such as one whose imports never arrive.
			let swapped = false;
			let swap = () => {
				if (swapped)
					return;
				swapped = true;
				clearTimeout(timer);

				// A newer run has started, and its frame will replace the current one instead.
				if (run !== this.runs) {
					newIframe.remove();
					return;
				}
				// Keep the width the divider was dragged to; it is pinned on the frame being replaced.
				newIframe.style.minWidth = this.preview.style.minWidth;
				newIframe.style.maxWidth = this.preview.style.maxWidth;
				this.preview.remove();
				newIframe.style.display = '';
				this.preview = newIframe;
				let newPreviewHeight = this.fitPreview(newIframe);

				// From here on the preview follows its content, e.g. when an example adds a row to a list.
				let body = newIframe.contentDocument?.body;
				if (body)
					new newIframe.contentWindow.ResizeObserver(() =>

						// Not inside the observer's own callback: resizing what it observes there raises a
						// "loop" error, which the onerror handler above would print over the example.
						newIframe.contentWindow.requestAnimationFrame(() => this.fitPreview(newIframe))
					).observe(body);

				if (this.maxHeight && this.editorReady) {

					// Get scroll position.
					let scroller = this.editor.querySelector('.cm-editor > .cm-scroller');
					let scroll = {x: scroller?.scrollLeft || 0, y: scroller?.scrollTop || 0};

					// Don't let CodeEditor be taller than preview.
					this.editor.style.height = '';
					let editorHeight = this.editor.getBoundingClientRect().height;
					if (editorHeight > newPreviewHeight && editorHeight > this.maxHeight)
						this.editor.style.height = Math.max(newPreviewHeight, this.maxHeight) + 'px';

					// Restore scroll position.
					if (scroller) {
						scroller.scrollTop = scroll.y;
						scroller.scrollLeft = scroll.x;
						requestAnimationFrame(() => {
							scroller.scrollTop = scroll.y;
							scroller.scrollLeft = scroll.x;
						});
					}
				}
				this.dispatchEvent(new CustomEvent('preview', {detail: {error: failed, edited}}));
			};
			newIframe.onload = null;
			newIframe.addEventListener('drawn', swap);
			let timer = setTimeout(swap, 3000);
		}

		this.insertBefore(newIframe, this.preview);
	}

	/**
	 * Make the preview exactly as tall as its content.
	 * @param iframe {HTMLIFrameElement}
	 * @return {int} The content's height. */
	fitPreview(iframe) {
		let html = iframe.contentDocument?.documentElement;
		if (!html || !iframe.isConnected)
			return 0;

		// 1. Measure with the scrollbar off.  A scrollbar that appears while the content grows narrows it,
		//    rewraps it, and makes it measure taller than it is, which near a height limit keeps the scrollbar for good.
		html.style.overflowY = 'hidden';

		// 2. Round up.  Content is often a fraction of a pixel taller than a whole number, and a frame even
		//    a fraction short of its content is given a scrollbar at some zoom levels.
		let height = Math.ceil(html.getBoundingClientRect().height);
		if (iframe.contentDocument.body.scrollWidth > iframe.clientWidth)
			height += 24; // If it has a horizontal scrollbar.

		// 3. Beside the editor, optionally stop at the editor's height and scroll from there.
		let sideBySide = getComputedStyle(this).flexDirection === 'row';
		let limit = this.capPreview && sideBySide ? (this.editorReady ? this.editor : this.placeholder).offsetHeight : Infinity;
		iframe.style.height = '';
		iframe.style.minHeight = Math.min(height, limit) + 'px';
		iframe.style.maxHeight = '100%';
		html.style.overflowY = height > limit ? 'auto' : 'hidden';
		return height;
	}


	render() {
		h(this)`
			<play-ground>
				<style>
					@media (width < 768px) { /* On mobile, put preview below code */
						:host :is(code-editor-2, .static-code) { max-height: 300px; border-bottom: var(--border) }
						:host [data-id=preview] { margin: 0; min-width: 0 }
						:host flex-resizer { display: none }
					}
					@media (768px <= width) {
						:host :is(code-editor-2, .static-code) { width: ${this.width}%; border-right: var(--border) }
						:host [data-id=preview] { width: ${100 - this.width}%; min-width: 0; margin: 0 }
					}
				</style>
				<pre data-id="placeholder" class="static-code" tabindex="0"></pre>
				<flex-resizer data-id="resizer" vertical></flex-resizer>
				<iframe data-id="preview" frameborder="0"></iframe>
				<slot data-id="code" style="display: none"></slot>
			</play-ground>`
	}
}
Playground.define('play-ground');

function shortenError(error, br='<br>&nbsp;&nbsp;') {
	if (typeof error === 'string')
		return error;

	return error.stack.replace(/\r?\n/g, br);
}
