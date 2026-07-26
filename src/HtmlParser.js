
// The three contexts.  They're small integers instead of strings so that comparing them is cheap
// and so that zero can mean "no context change" inside the parse() loop below.
const Text = 1, Tag = 2, Attribute = 3;

export default class HtmlParser {
	constructor() {
		this.reset();
	}

	/**
	 * Throw away any half-parsed tag or attribute and start over in text context.
	 * @return {int} The text context, so that parse(null) can hand it straight back to its caller. */
	reset() {
		this.quote = null; // The quote character that opened the attribute value we're inside of: null, '"', or "'".
		this.buffer = ''; // The characters seen so far in the current tag name, attribute name, or attribute value.
		return this.context = Text;
	}

	/**
	 * Parse the next chunk of html, starting with the same context we left off with from the previous chunk.
	 * @param html {string}
	 * @param onContextChange {?function(html:string, index:int, prevContext:int, nextContext:int)}
	 *     Called every time the context changes, and again at the last context.
	 * @return {int} One of HtmlParser.Text, HtmlParser.Tag, or HtmlParser.Attribute:  the context at the end of html. */
	parse(html, onContextChange=null) {
		if (html === null)
			return this.reset();

		// The whole parse runs on these three locals and copies them back to the instance at the end.
		// A local is both smaller and faster than reaching through a property on every character.
		let {context, quote, buffer} = this;

		for (let i = 0; i < html.length; i++) {
			const char = html[i];
			let next = 0; // The context this character moves us into, or zero to stay in the one we're in.

			if (context === Text) {
				if (char === '<' && html[i + 1].match(/[/a-z!]/i)) // Start of a tag or comment.
					next = Tag;
			}
			else if (context === Tag) {
				if (char === '>')
					next = Text;

				// A space, a self-closing slash, or the '?' of an xml declaration ends the attribute name we were
				// collecting.  A run of spaces lands here too, but clearing an already empty buffer changes nothing.
				else if (char === ' ' || char === '/' || char === '?')
					buffer = '';

				else if (char === '"' || char === "'" || char === '=')
					next = Attribute;
				else
					buffer += char;
			}
			else {
				// Start an attribute quote.
				if (!quote && !buffer.length && (char === '"' || char === "'"))
					quote = char;
				else if (char === quote || (!quote && buffer.length))
					next = Tag;
				else if (!quote && char === '>')
					next = Text;
				else if (char !== ' ')
					buffer += char;
			}

			// Every one of the context changes above shares this same bookkeeping.  Two details are folded in:
			// text resumes *after* the '>' we just read, so its index is one past the current character, and the
			// only path into an attribute is the '"', "'", or '=' we just read, where an '=' opens an unquoted value.
			if (next) {
				onContextChange?.(html, next === Text ? i+1 : i, context, next);
				context = next;
				quote = next === Attribute && char !== '=' ? char : null;
				buffer = '';
			}
		}

		this.context = context;
		this.quote = quote;
		this.buffer = buffer;
		onContextChange?.(html, html.length, context, null);
		return context;
	}
}

HtmlParser.Attribute = Attribute;
HtmlParser.Text = Text;
HtmlParser.Tag = Tag;
