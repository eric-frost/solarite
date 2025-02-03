
export default class HtmlContext {
	constructor() {
		this.defaultState = {
			context: HtmlContext.Text, // possible values: 'TEXT', 'TAG', 'ATTRIBUTE'
			quote: null, // possible values: null, '"', "'"
			buffer: '',
			lastChar: null
		};
		this.state = {...this.defaultState};
	}

	reset() {
		this.state = {...this.defaultState};
		return this.state.context;
	}

	parse(html) {
		if (html === null) {
			return this.reset();
		}
		for (let i = 0; i < html.length; i++) {
			const char = html[i];
			switch (this.state.context) {
				case HtmlContext.Text:
					if (char === '<' && html[i + 1].match(/[a-z!]/i)) { // Start of a tag or comment.
						this.state.context = HtmlContext.Tag;
						this.state.buffer = '';
					}
					break;
				case HtmlContext.Tag:
					if (char === '>') {
						this.state.context = HtmlContext.Text;
						this.state.quote = null;
						this.state.buffer = '';
					} else if (char === ' ' && !this.state.buffer) {
						// No attribute name is present. Skipping the space.
						continue;
					} else if (char === ' ' || char === '/' || char === '?') {
						this.state.buffer = ''; // Reset the buffer when a delimiter or potential self-closing sign is found.
					} else if (char === '"' || char === "'" || char === '=') {
						this.state.context = HtmlContext.Attribute;
						this.state.quote = char === '=' ? null : char;
						this.state.buffer = '';
					} else {
						this.state.buffer += char;
					}
					break;
				case HtmlContext.Attribute:
					if (!this.state.quote && !this.state.buffer.length && (char === '"' || char === "'")) {
						this.state.quote = char;
					} else if (char === this.state.quote || (!this.state.quote && this.state.buffer.length)) {
						this.state.context = HtmlContext.Tag;
						this.state.quote = null;
						this.state.buffer = '';
					} else if (!this.state.quote && char === '>') {
						this.state.context = HtmlContext.Text;
						this.state.quote = null;
						this.state.buffer = '';
					} else if (char !== ' ') {
						this.state.buffer += char;
					}
					break;
			}
		}
		return this.state.context;
	}
}

HtmlContext.Attribute = 'Attribute';
HtmlContext.Text = 'Text';
HtmlContext.Tag = 'Tag';