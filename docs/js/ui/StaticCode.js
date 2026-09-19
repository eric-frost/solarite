/**
 * Colour JavaScript, including html in tagged templates and JSX, as html, without loading a code editor.
 *
 * The playground shows this until someone reaches for the code, because the real editor is a 740KB download and most
 * visitors only read.  It is not a parser.  It knows comments, strings, keywords, template literals with `${}`
 * holes, and tags with attributes, which is enough for example code to look the way the editor will show it.
 * The class names are coloured in docs/media/site.css, with the editor's own colours.
 *
 * @param code {string}
 * @return {string} One `<div class="l">` per line, so CSS can number them like the editor's gutter. */
export default function highlight(code) {
	let out = '';
	const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
	const add = (cls, text) => out += cls ? `<span class="${cls}">${escape(text)}</span>` : escape(text);
	const keywords = /^(?:import|from|export|default|class|extends|constructor|super|this|new|return|let|const|var|if|else|for|of|in|while|function|async|await|static|get|set|typeof|instanceof|true|false|null|undefined)$/;
	const voidTags = /^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;

	/**
	 * JavaScript from `i` on.
	 * @param i {int}
	 * @param hole {boolean} Inside a `${}` or JSX `{}` hole, so stop at the brace that closes it.
	 * @return {int} Where it stopped. */
	function js(i, hole=false) {
		let depth = 0;
		while (i < code.length) {
			let rest = code.slice(i), match;
			if (code[i] === '}' && hole && !depth)
				return i;
			if (code[i] === '{' || code[i] === '}')
				depth += code[i] === '{' ? 1 : -1;
			if (match = rest.match(/^\/\/[^\n]*|^\/\*[\s\S]*?\*\//))
				add('c', match[0]);
			else if (match = rest.match(/^'(?:\\.|[^'\\\n])*'|^"(?:\\.|[^"\\\n])*"/))
				add('s', match[0]);
			else if (code[i] === '`') {
				add('t', '`');
				i = markup(i + 1, true);
				continue;
			}

			// A tag can only start where an expression can: after an opening bracket, an operator, or a line start.
			else if (/^<[A-Za-z]/.test(rest) && /(^|[(,=>?:&|{}\n;])\s*$/.test(code.slice(Math.max(0, i - 40), i))) {
				i = markup(i, false);
				continue;
			}
			else if (match = rest.match(/^[A-Za-z_$][\w$]*/))
				add(keywords.test(match[0]) ? 'k' : code[i + match[0].length] === '`' ? 'f' : 'v', match[0]);
			else
				match = [code[i]], add('', code[i]);
			i += match[0].length;
		}
		return i;
	}

	/**
	 * Html from `i` on: the inside of a template literal, which ends at its backtick, or a JSX element, which ends
	 * when its outermost tag closes.
	 * @return {int} Where it stopped. */
	function markup(i, template) {
		let open = 0;
		while (i < code.length) {
			let rest = code.slice(i), match;
			if (template && code[i] === '`') {
				add('t', '`');
				return i + 1;
			}
			if (template ? rest.startsWith('${') : code[i] === '{') {
				add('', template ? '${' : '{');
				i = js(i + (template ? 2 : 1), true);
				add('', '}');
				i++;
			}
			else if (match = rest.match(/^<\/?[A-Za-z][\w-]*/)) {
				let closing = match[0][1] === '/', name = match[0].replace(/^<\/?/, '');
				add('g', match[0]);
				i += match[0].length;

				// Attributes, up to the end of the tag.
				while (i < code.length && code[i] !== '>' && !code.startsWith('/>', i)) {
					rest = code.slice(i);
					if (template ? rest.startsWith('${') : code[i] === '{') {
						add('', template ? '${' : '{');
						i = js(i + (template ? 2 : 1), true) + 1;
						add('', '}');
					}
					else if (match = rest.match(/^"[^"]*"|^'[^']*'/))
						add('av', match[0]), i += match[0].length;
					else if (match = rest.match(/^[\w:-]+/))
						add('a', match[0]), i += match[0].length;
					else
						add('', code[i++]);
				}
				let selfClosing = code.startsWith('/>', i);
				add('g', selfClosing ? '/>' : '>');
				i += selfClosing ? 2 : 1;
				if (closing)
					open--;
				else if (!selfClosing && !voidTags.test(name))
					open++;
				if (!template && open <= 0)
					return i;
			}
			else {
				// A run of plain text, up to whatever could start a tag, a hole, or the end of the template.
				let run = rest.match(template ? /^(?:[^<`$]|\$(?!\{))+/ : /^[^<{]+/)?.[0] ?? code[i];
				add(template ? 't' : '', run);
				i += run.length;
			}
		}
		return i;
	}
	js(0);

	// Spans never cross a line here except in comments and template text, where closing and reopening them at each
	// line break keeps every line a complete piece of html.
	let lines = [], carry = '';
	for (let line of out.split('\n')) {
		let full = carry + line;
		let unclosed = (full.match(/<span class="[a-z]+">/g) || []).length - (full.match(/<\/span>/g) || []).length;
		carry = unclosed > 0 ? full.match(/<span class="[a-z]+">(?![\s\S]*<span)/)?.[0] ?? '' : '';
		lines.push(`<div class="l">${full}${unclosed > 0 ? '</span>' : ''}${full ? '' : '\n'}</div>`);
	}
	return lines.join('');
}
