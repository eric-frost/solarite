/** @copyright Vorticode LLC */

/**
 * Use warm colors for xml-like languages, cool colors for other languages.
 *
 * Deliberately imports NO CodeMirror itself: CodeMirror rejects extensions built from a
 * different module instance than the EditorState's, so the caller passes in its own bundle
 * (vendor/codemirror6b.js for CodeEditor2.ts).  Theme edits therefore need no bundle rebuild.
 *
 * @param cm {object} The caller's CodeMirror bundle module; the returned extensions belong to it.
 * @param lang {string} Can be 'js', 'md', 'htaccess', etc.  The file extension.
 * @param isDark {boolean}
 * @returns {*[]} */
function codeMirrorThemeSolarIce(cm, lang, isDark=false) {
	const {EditorView, HighlightStyle, syntaxHighlighting, tags: t} = cm;

	lang = (lang || '').toLowerCase(); // CodeEditor2's Language enum values are capitalized ('Php').
	if (lang === 'javascript') // CodeEditor2's enum value.
		lang = 'js';

	// Re-used colors
	const
		stone = "#7d8799",
		text = isDark ? "#aaa" : 'black',
		darkBackground = "#21252b",
		highlightBackground = isDark ? "#2c313a" : '#ddd',
		background = isDark ? 'transparent' : 'white', // transparent in dark: inherit the page/card bg (no distinct editor fill)
		tooltipBackground = "#353a42",
		selection = isDark ? "#234" : '#ccc',
		cursor = "#528bff"


	// Editor theme styles.
	const solarIceTheme = EditorView.theme({
		"&": { // parent selector
			color: text,
			backgroundColor: background,
		},

		".cm-content": {
			caretColor: cursor,
			//fontFamily: 'Hack',
			//lineHeight: 1
		},

		".cm-cursor, .cm-dropCursor": {borderLeftColor: cursor},
		"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: selection },

		".cm-panels": {backgroundColor: darkBackground, color: text},
		".cm-panels.cm-panels-top": {borderBottom: "2px solid black"},
		".cm-panels.cm-panels-bottom": {borderTop: "2px solid black"},

		".cm-searchMatch": {
			backgroundColor: "#72a1ff59",
			outline: "1px solid #457dff"
		},
		".cm-searchMatch.cm-searchMatch-selected": {
			backgroundColor: "#6199ff2f"
		},

		".cm-activeLine": {backgroundColor: "transparent"}, // Transparent b/c it's drawn on top of selection.  CodeMirror bug.
		".cm-selectionMatch": {backgroundColor: isDark ? "#aafe661a" : '#eee'}, // Mark occurances

		"&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
			backgroundColor: "#bad0f847"
		},

		".cm-gutters": {
			backgroundColor: background,
			color: stone,
			border: "none"
		},

		":focus-within .cm-activeLineGutter": {
			backgroundColor: highlightBackground
		},

		".cm-foldPlaceholder": {
			backgroundColor: "transparent",
			border: "none",
			color: "#ddd"
		},

		".cm-tooltip": {
			border: "none",
			backgroundColor: tooltipBackground
		},
		".cm-tooltip .cm-tooltip-arrow:before": {
			borderTopColor: "transparent",
			borderBottomColor: "transparent"
		},
		".cm-tooltip .cm-tooltip-arrow:after": {
			borderTopColor: tooltipBackground,
			borderBottomColor: tooltipBackground
		},
		".cm-tooltip-autocomplete": {
			"& > ul > li[aria-selected]": {
				backgroundColor: highlightBackground,
				color: text
			},
			// Group headers (declaring class) for sectioned completions — overrides the base
			// theme's list-item/silver-border look.  Fixed colors: the tooltip background is
			// tooltipBackground (dark) in BOTH page themes.
			"& > ul > completion-section": {
				display: "block",
				padding: "3px 8px 1px",
				fontFamily: "Arial, sans-serif",
				fontSize: "85%",
				letterSpacing: ".05em",
				color: "#8a94a3",
				borderTop: "1px solid #4a5058",
				borderBottom: "none",
				opacity: 1
			},
			"& > ul > completion-section:first-child": {
				borderTop: "none"
			}
		}
	}, {dark: true})

	// Code styles
	let styles = [

		// Universal
		{
			tag: [t.comment],
			color: isDark ? '#0c0' : '#060'
		},
		{
			tag: [t.docComment], // doesn't work?
			color: '#49c',
			fontWeight: 'bold'
		},
		{
			tag: [t.docString], // doesn't work?
			color: '#49c'
		},

		// Html
		{
			tag: [t.angleBracket, t.documentMeta], // t.meta is the doctype
			color: isDark ? '#b32' : '#e00'
		},
		{
			tag: [t.attributeValue],
			color: isDark ? '#d60' : '#f50'
		},
		{
			tag: [t.character], // html entity
			color: isDark ? '#880' : '#880'
		},
		{
			tag: [t.content], // Text in html
			color: isDark ? '#987' : '#210'
		},
		// Html and css
		{
			tag: [t.tagName], // Tag name selector
			color: lang === 'css'
				? (isDark ? '#26f' : '#00f')
				: (isDark ? '#b32' : '#e00') // html/php
		},
		{
			tag: [t.attributeName],
			color: lang === 'css'
				? (isDark ? '#469' : '#469')
				: (isDark ? '#885b22' : '#600')
		},
		
		// CSS
		{
			tag: [t.atom], // Css value like 'Arial' or 'none'.  Keyword 'super' in javascript
			color: lang === 'js'
				? (isDark ? '#26f' : '#00f')
				: (isDark ? '#75f' : '')
		},
		{
			tag: [t.unit],
			color: isDark ? '#95a' : ''
		},
		{
			tag: [t.color],
			color: isDark ? '#95a' : '#60b'
		},
		{
			tag: [t.constant(t.name)], // pseudo-selector
			color: isDark ? '#598' : '#18a'
		},

		// C-like
		{
			tag: [t.keyword, t.modifier, t.self], // public/private/protected, css selector.  self=this keyword.
			color: isDark ? '#26f' : '#00f',
			fontWeight: 'bold'
		},
		{
			tag: [t.bool, t.typeName],
			color: isDark ? '#26f' : '#00f'
		},
		{
			tag: [t.function(t.name)],
			color: isDark ? '#598' : '#18a'
		},
		{
			tag: [t.name, t.propertyName],
			color: isDark ? '#469' : '#038'
		},
		{
			tag: [t.constant],
			color: isDark ? '#598' : '#598'
		},
		{
			tag: [t.labelName],
			color: isDark ? '#469' : '#057'
		},


		{
			tag: [t.number],
			color: isDark ? '#95a' : '#60b'
		},
		{
			tag: [t.string, t.regexp], // t.string also colors html entities
			color: isDark ? '#75f' : '#60b'
		},
		{
			tag: [t.separator], // '::' or '->' in php
			color: text
		},
		{
			tag: t.invalid,
			color: 'red',
			textDecoration: 'underline'
		},


		// Unused
		{
			tag: [],
			color: '#ff0'
		},

		// Unknown
		// These will show up as yellow so i can figure ot what they are.
		{
			tag: [t.standard(t.name), t.annotation, t.macroName],
			color: '#ff0'
		},


		// Markdown:
		{
			tag: t.meta,
			fontWeight: "bold",
			color: '#abc'
		},
		{
			tag: t.strong,
			fontWeight: "bold",
			color: "#ccc"
		},
		{
			tag: t.emphasis,
			fontStyle: "italic",
		},
		{
			tag: t.strikethrough,
			textDecoration: "line-through",
		},
		{
			tag: t.link,
			color: '#469',
			textDecoration: "underline"
		},
		{
			tag: t.heading1,
			fontWeight: "900",
			fontSize: '250%',
			color: 'white',
			backgroundColor: '#08f'
		},
		{
			tag: t.heading2,
			fontWeight: "bold",
			fontSize: '180%',
			color: isDark ? 'white' : 'black',
			textDecoration: 'underline'
		},
		{
			tag: t.heading3,
			fontWeight: "bold",
			color: isDark ? 'white' : 'black',
			fontSize: '120%',
			textDecoration: 'underline'
		},
		{
			tag: t.heading4,
			fontWeight: "bold",
			color: isDark ? 'white' : '#102',
			textDecoration: 'underline'
		},
		{
			tag: t.heading5,
			color: isDark ? '#acf' : '#035',
			textDecoration: 'underline'
		},
		{
			tag: t.heading6,
			color: isDark ? '#acf' : '#035',
		},
		{
			tag: t.quote,
			backgroundColor: isDark ? '#2b313b' : '#def',
		},
		{
			tag: t.monospace,
			backgroundColor: isDark ? '#1b1e22' : '#def',
		}
	];

	if (lang==='html' || lang==='php' || lang==='xml' || lang==='vue')
		styles.push({
			tag: t.processingInstruction, // php tags, <?xml ?> declarations
			color: '#ff00ff',
			fontWeight: 'bold'
		});

	/// The highlighting style for code.
	// List of things that can be syntax colored at:
	// https://lezer.codemirror.net/docs/ref/#highlight.tags
	// codemirror\node_modules\@lezer\highlight\dist\highlight.d.ts
	var solarIceHighlightStyle = HighlightStyle.define(styles)

	return [solarIceTheme, syntaxHighlighting(solarIceHighlightStyle)]
}


export default codeMirrorThemeSolarIce;
