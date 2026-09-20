import Playground from "./Playground.js";

// Turn the documentation's code blocks into live, editable playgrounds.  build/docs.js writes each fenced block as
// <pre data-lang="javascript"><code>…</code></pre>, which reads as ordinary code until this runs.
//
// The language is passed through exactly as the Markdown wrote it, and that is deliberate: the playground previews
// 'javascript', 'jsx' and 'html', so a fence written `JavaScript` or `Html` is an editor with no preview.  That is how
// docs/index.md marks an example that only declares something and would show an empty result.
//
// Every preview starts from docs/media/preview.css, so examples look alike and none is unstyled browser default.
const previewHead = `<link rel="stylesheet" href="${new URL('../media/preview.css', import.meta.url)}">`;

function upgrade(pre) {
	let playground = new Playground({value: pre.textContent, language: pre.dataset.lang, width: 75,
		maxHeight: 1000, prefix: previewHead});

	// For whatever reason, this makes loading about 20% faster, according to the chrome profiler.
	requestAnimationFrame(() => pre.replaceWith(playground));
}

// Only once a block scrolls near the viewport, because an editor costs far more than a <pre>.
let observer = new IntersectionObserver((entries, observer) => {
	for (let entry of entries)
		if (entry.isIntersecting) {
			observer.unobserve(entry.target);
			upgrade(entry.target);
		}
}, {rootMargin: '600px'});
for (let pre of document.querySelectorAll('pre[data-lang]'))
	observer.observe(pre);

// Mark the outline entry for the section being read.
let outline = document.querySelector('.outline');
let links = new Map([...outline.querySelectorAll('a')].map(a => [a.hash.slice(1), a]));
let headings = [...document.querySelectorAll('.prose :is(h2, h3, h4)[id]')];
let current;
function markCurrent() {
	let reading = headings.findLast(heading => heading.getBoundingClientRect().top < 120) ?? headings[0];
	let link = links.get(reading?.id);
	if (link === current)
		return;
	current?.removeAttribute('aria-current');
	link?.setAttribute('aria-current', 'location');
	current = link;
	revealCurrent();
}

// Keep the marked entry in view in the outline's own scroll area, without moving the page.  Measured from the
// rectangles because the outline is a column, a list, or a fixed panel depending on the screen.
function revealCurrent() {
	if (!current || outline.scrollHeight <= outline.clientHeight)
		return;
	let top = current.getBoundingClientRect().top - outline.getBoundingClientRect().top + outline.scrollTop;
	if (top < outline.scrollTop + 40 || top > outline.scrollTop + outline.clientHeight - 60)
		outline.scrollTop = top - outline.clientHeight / 2;
}
addEventListener('scroll', markCurrent, {passive: true});
markCurrent();

// On a phone the outline is a panel under the header, opened by the header's button (see the end of docs.css).  It
// closes once it has done its job: an entry was picked, Escape was pressed, or the reader tapped back on the page.
let toggle = document.getElementById('outline-toggle');
function setOutlineOpen(open) {
	outline.classList.toggle('open', open);
	toggle.setAttribute('aria-expanded', open);
	if (open)
		revealCurrent();
}
toggle.addEventListener('click', () => setOutlineOpen(!outline.classList.contains('open')));
outline.addEventListener('click', e => {
	let link = e.target.closest('a');
	if (!link)
		return;
	setOutlineOpen(false);
	settleOn(document.getElementById(link.hash.slice(1)));
});

// The examples passed on the way to a heading become editors as they come near the screen, and an editor with its
// result is taller than the code block it replaces, so a long jump stops short of the heading it aimed for.  Each time
// the scrolling stops, aim again, until the heading is where a jump puts it.
function settleOn(heading, tries=4) {
	addEventListener('scrollend', () => setTimeout(() => {
		let aim = parseFloat(getComputedStyle(heading).scrollMarginTop);
		if (tries && Math.abs(heading.getBoundingClientRect().top - aim) > 2) {
			heading.scrollIntoView();
			settleOn(heading, tries - 1);
		}
	}, 150), {once: true});
}
addEventListener('keydown', e => e.key === 'Escape' && setOutlineOpen(false));
addEventListener('pointerdown', e => !e.target.closest('.outline, #outline-toggle') && setOutlineOpen(false));
