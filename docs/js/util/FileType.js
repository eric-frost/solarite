/** @copyright Vorticode LLC */

/**
 * Categorize file extensions into file types.
 * Also see Mime.js */
var FileType = {

	imageSupported: 'avif bmp gif jpg jpeg png tga webp'.split(' '),
	image: 'ai avif bmp cur dds dicom gif heic heif ico jpg jpeg krita png psd psp svg tga tif tiff webp xcf'.split(' '),
	audio: 'aac aax aif aiff aifc alac amr ape au flac m4a mmf mp3 oga ogg opus pcm ra wav wma'.split(' '),
	video: '3g2 avi divx drc flv h264 h265 m2ts m4p m4v mkv mjpeg mng mp4 mpg mpeg mpeg2 mpv mov mts ogv qt rm ts vob webm wmv xvid'.split(' '),
	php: ['php'],
	javascript: ['js', 'jsx', 'jscript'],
	json: ['json'],
	typescript: ['ts', 'tsx'],
	html: ['htm', 'html', 'xhtml'],
	css: ['css'],
	scss: ['scss'],
	less: ['less'],
	markdown: ['md', 'markdown'],
	sql: ['sql'],
	spreadsheet: ['csv', 'xlsx'],
	python: ['py'],
	htaccess: ['htaccess', 'htpasswd'],
	database: ['sqlite', 'sqlite3', 'db'],
	model3d: ['gltf', 'glb'],

	// TODO, include others above?
	code: ['bat', 'cmd', 'sh', 'bash', 'zsh', 'cs', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hh', 'hxx', 'ino', 'd', 'go', 'rs', 'zig', 'pl', 'pm', 'swift', 'kt', 'kts', 'rb', 'lua', 'ps1', 'psm1', 'psd1', 'vue', 'dart', 'coffee', 'cfm', 'cfml', 'cfc', 'asm', 's', 'wat', 'wast',
		'hx', 'lisp', 'cl', 'el', 'groovy', 'gradle', 'mm', 'pas', 'scm', 'ss', 'st', 'tcl', 'vb', 'vbs', 'clj', 'cljs', 'cljc', 'edn', 'hs', 'ml', 'mli', 'fs', 'fsx', 'fsi', 'sml', 'glsl', 'vert', 'frag', 'wgsl', 'v', 'sv', 'vhd', 'vhdl', 'm', 'wl', 'r'],


	/**
	 * Get all categories the extension belongs to, with more exclusive categories first.
	 * @param ext {string}
	 * @returns {string[]} */
	getCategories(ext) {
		let result = [];
		for (let name in FileType) {
			if (Array.isArray(FileType[name]) && FileType[name].includes(ext))
				result.push(name);
		}
		return result;
	}
};

FileType.webPage = [...FileType.html, ...FileType.php];

FileType.text = ['1st', 'asc', 'cfg', 'csv', 'env', 'ini', 'conf', 'gitignore', 'log', 'ltx', 'man', 'map', 'org', 'tex', 'txt', 'text', 'readme', 'xml',
	'yaml', 'yml', 'toml', 'properties', 'dockerfile', 'diff', 'patch', 'xsd', 'xsl', 'cmake', 'proto', 'http', 'nb',
	...FileType.php, ...FileType.javascript, ...FileType.json, ...FileType.typescript, ...FileType.html, ...FileType.python,
	...FileType.css, ...FileType.markdown, ...FileType.sql, ...FileType.htaccess, ...FileType.code]


export default FileType;

/**
 * Languages supported by CodeEditor2.ts.  The first block (plus Apache) ships in the primary
 * CodeMirror bundle; everything else lives in the secondary codemirror6b-langs.js bundle that
 * CodeEditor2 lazy-loads on first use (see its PRIMARY_LANGS set).
 * @enum */
const Language = {
	Css: 'Css',
	Html: 'Html',
	JavaScript: 'JavaScript',
	TypeScript: 'TypeScript',
	Json: 'Json',
	Php: 'Php',
	Markdown: 'Markdown',
	Sql: 'Sql',

	Python: 'Python',
	Cpp: 'Cpp', // C too — the C++ grammar parses both.
	CSharp: 'CSharp',
	Rust: 'Rust',
	Java: 'Java',
	Go: 'Go',
	Kotlin: 'Kotlin',
	Swift: 'Swift',
	Zig: 'Zig',
	D: 'D',
	Vue: 'Vue',
	Angular: 'Angular',
	Xml: 'Xml',
	Yaml: 'Yaml',
	Toml: 'Toml',
	Shell: 'Shell',
	PowerShell: 'PowerShell',
	Perl: 'Perl',
	Ruby: 'Ruby',
	Lua: 'Lua',
	Dockerfile: 'Dockerfile',
	Nginx: 'Nginx',
	Apache: 'Apache', // Apache config / .htaccess.  First-party mode, primary bundle.
	Diff: 'Diff',
	Properties: 'Properties',
	Wast: 'Wast', // WebAssembly text format.
	Glsl: 'Glsl', // OpenGL/WebGL shaders (three.js WebGLRenderer).
	Wgsl: 'Wgsl', // WebGPU shaders (three.js WebGPURenderer).
	Lisp: 'Lisp',
	CoffeeScript: 'CoffeeScript',
	Clojure: 'Clojure',
	Haskell: 'Haskell',
	Groovy: 'Groovy',
	Haxe: 'Haxe',
	Pascal: 'Pascal',
	R: 'R',
	Scheme: 'Scheme',
	Smalltalk: 'Smalltalk',
	Tcl: 'Tcl',
	VB: 'VB',
	VBScript: 'VBScript',
	CMake: 'CMake',
	Protobuf: 'Protobuf',
	Http: 'Http',
	Assembly: 'Assembly',
	Verilog: 'Verilog',
	Vhdl: 'Vhdl',
	Latex: 'Latex',
	Mathematica: 'Mathematica',
	Octave: 'Octave', // MATLAB too.
	OCaml: 'OCaml',
	FSharp: 'FSharp',
	Sml: 'Sml',
	ObjectiveCpp: 'ObjectiveCpp',

	/**
	 * Map file extensions to programming languages.
	 * @param ext {string}
	 * @returns {Language|null} */
	fromExtension(ext) {
		if (ext.startsWith('.'))
			ext = ext.slice(1);
		ext = ext.toLowerCase();
		for (let name in languageExtensions)
			if (languageExtensions[name].includes(ext))
				return Language[name];
		return null;
	}
};

// Order matters for ambiguous extensions: first match wins (TypeScript before JavaScript keeps
// .ts out of the js bucket).  Angular and Nginx have no unambiguous extension (component
// templates are .html, nginx configs .conf) — select those by language name instead.
const languageExtensions = {
	Css: [...FileType.css, ...FileType.scss, ...FileType.less],
	Html: FileType.html,
	TypeScript: FileType.typescript,
	JavaScript: FileType.javascript,
	Json: FileType.json,
	Php: FileType.php,
	Markdown: FileType.markdown,
	Python: FileType.python,
	Sql: FileType.sql,
	Cpp: ['c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'ino'],
	CSharp: ['cs'],
	Rust: ['rs'],
	Java: ['java'],
	Go: ['go'],
	Kotlin: ['kt', 'kts'],
	Swift: ['swift'],
	Zig: ['zig'],
	D: ['d'],
	Vue: ['vue'],
	Xml: ['xml', 'svg', 'xsd', 'xsl'],
	Yaml: ['yaml', 'yml'],
	Toml: ['toml'],
	Shell: ['sh', 'bash', 'zsh'],
	PowerShell: ['ps1', 'psm1', 'psd1'],
	Perl: ['pl', 'pm'],
	Ruby: ['rb'],
	Lua: ['lua'],
	Dockerfile: ['dockerfile'],
	Apache: [...FileType.htaccess, 'conf'], // .conf could be nginx, but this project is Apache.
	Diff: ['diff', 'patch'],
	Properties: ['properties', 'ini', 'env', 'cfg'],
	Wast: ['wat', 'wast'],
	Glsl: ['glsl', 'vert', 'frag'],
	Wgsl: ['wgsl'],
	Lisp: ['lisp', 'cl', 'el'],
	CoffeeScript: ['coffee'],
	Clojure: ['clj', 'cljs', 'cljc', 'edn'],
	Haskell: ['hs'],
	Groovy: ['groovy', 'gradle'],
	Haxe: ['hx'],
	Pascal: ['pas'],
	R: ['r'],
	Scheme: ['scm', 'ss'],
	Smalltalk: ['st'],
	Tcl: ['tcl'],
	VB: ['vb'],
	VBScript: ['vbs'],
	CMake: ['cmake'],
	Protobuf: ['proto'],
	Http: ['http'],
	Assembly: ['asm', 's'],
	Verilog: ['v', 'sv'],
	Vhdl: ['vhd', 'vhdl'],
	Latex: ['tex', 'ltx'],
	Mathematica: ['wl', 'nb'],
	Octave: ['m'], // MATLAB/Octave wins .m over Objective-C here.
	OCaml: ['ml', 'mli'],
	FSharp: ['fs', 'fsx', 'fsi'],
	Sml: ['sml'],
	ObjectiveCpp: ['mm'],
};
export {Language};