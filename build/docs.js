/**
 * Build docs/index.html from docs/index.md.  Run by build/build.bat, or on its own from this folder:
 *
 *   deno run --no-lock --node-modules-dir=none --allow-read --allow-write docs.js
 *
 * The Markdown parser is the only dependency.  Deno fetches it the first time and caches it, so nothing is
 * installed and nothing is added to the repository.
 *
 * The page is one long document under a band that says "Documentation".  Each heading gets an id so it can be linked to, and headings two to four
 * levels deep become the outline down the left side.  A fenced code block becomes `<pre data-lang="...">` with
 * the code as plain text inside; docs/js/documentation.js turns those into live editors in the browser, and
 * until it does (or if scripts are off) they read as ordinary code blocks.
 *
 * The build fails, rather than writing a page with dead links, if two headings end up with the same id or if
 * a link to an anchor, in the documentation or on the homepage, points at a heading that doesn't exist. */
import {marked} from 'npm:marked@16';

const here = new URL('.', import.meta.url);
const read = path => Deno.readTextFileSync(new URL(path, here));
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 1. Split off the front matter, which holds the page's title and description.
let markdown = read('../docs/index.md');
const meta = {};
markdown = markdown.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/, (all, block) => {
	for (const line of block.split(/\r?\n/)) {
		const [, key, value] = line.match(/^([\w-]+):\s*(.*)$/) ?? [];
		if (key)
			meta[key] = value;
	}
	return '';
});

/**
 * A heading's id: lower case, punctuation dropped, spaces to hyphens.  "Id's" is `ids` and "h()" is `h`.
 * These match the ids the page had when it was exported from Typora, so existing links keep working. */
const slug = text => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, '')
	.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

// 2. Render, collecting the headings on the way.
const headings = [];
marked.use({renderer: {
	heading({tokens, depth}) {
		const html = this.parser.parseInline(tokens);
		const id = slug(html);
		if (headings.some(heading => heading.id === id))
			throw new Error(`Two headings share the id "${id}".  Reword one of them.`);
		headings.push({id, depth, html});
		return `<h${depth} id="${id}">${html}</h${depth}>\n`;
	},
	code({text, lang}) {
		return `<pre data-lang="${escapeHtml(lang ?? '')}"><code>${escapeHtml(text)}</code></pre>\n`;
	}
}});
let content = marked.parse(markdown);

// The blue band at the top says "Documentation", which is in the template.  The Markdown's own # title names the
// file for whoever edits it and is left out of the page, along with any notes to editors written as comments above it.
const opening = content.match(/^\s*(?:<!--[\s\S]*?-->\s*)*<h1[^>]*>[\s\S]*?<\/h1>/);
if (!opening)
	throw new Error('docs/index.md must start with a # heading.');
content = content.slice(opening[0].length);

// 3. The outline: nested lists of the headings two to four levels deep.
let outline = '', depth = 1;
for (const heading of headings.filter(heading => heading.depth >= 2 && heading.depth <= 4)) {
	for (; depth < heading.depth; depth++)
		outline += '<ul>';
	for (; depth > heading.depth; depth--)
		outline += '</li></ul>';
	outline += `${outline.endsWith('<ul>') ? '' : '</li>'}<li><a href="#${heading.id}">${heading.html}</a>`;
}
for (; depth > 1; depth--)
	outline += '</li></ul>';

// 4. Every link to an anchor must land on a heading: the documentation's own, and the homepage's into it.
const ids = new Set(headings.map(heading => heading.id));
const wanted = [
	...[...content.matchAll(/href="#([^"]+)"/g)].map(match => ['docs/index.md', match[1]]),
	...[...read('../index.html').matchAll(/href="docs\/#([^"]+)"/g)].map(match => ['index.html', match[1]])];
const dead = wanted.filter(([, id]) => !ids.has(decodeURIComponent(id)));
if (dead.length)
	throw new Error('Links to headings that do not exist:\n' + dead.map(([file, id]) => `  ${file} -> #${id}`).join('\n'));

// 5. Fill the template.
const page = read('../docs/template.html')
	.replaceAll('{{title}}', escapeHtml(meta.title ?? 'Documentation'))
	.replaceAll('{{description}}', escapeHtml(meta.description ?? ''))
	.replace('{{outline}}', () => outline)
	.replace('{{content}}', () => content);
Deno.writeTextFileSync(new URL('../docs/index.html', here), page);
console.log(`Successfully created ../docs/index.html (${page.length.toLocaleString()} bytes, ` +
	`${headings.length} headings, ${(content.match(/<pre data-lang/g) ?? []).length} code blocks).`);
