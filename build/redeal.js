/**
 * Re-deal the letters of the minified build so that it compresses better.
 *
 * Terser names variables by position: the first parameter of every function is `t`, the second `e`, and so on.
 * Which letter a variable gets cannot change what the code does, but it changes how often the same byte sequences
 * recur, and that decides how well gzip and Brotli compress the file.  This pass tries many small renamings of the
 * finished file and keeps those that do not make its gzip size worse.  On the 44KB bundle that takes about 2.2%
 * off the Brotli size (320 of 14,700 bytes) while the minified size stays where it was.
 *
 * Gzip is the measure, not Brotli, although Brotli is the size we publish.  Brotli at quality 11 jumps by 10 to 40
 * bytes when one character changes anywhere in the file, so a search that follows it collects luck that the next
 * edit of the source takes away again.  Gzip moves smoothly, and Brotli follows it down.
 *
 * Only two kinds of renaming are tried, because these are the ones that were found to work:
 * 1. Swap two letters throughout one function (every local of it called x becomes y and the reverse).
 * 2. Swap the names of two top-level variables, together with the same swap inside every function that needs it.
 * Renaming one variable at a time, or letting a function take a letter it does not use yet, reaches less than
 * two thirds of the result: such a step is often accepted because it changes nothing, and then stands in the way.
 *
 * Safety.  Two variables may share a name only if neither is used anywhere inside the other's scope, which is the
 * rule every minifier uses.  Each renaming is checked against that rule before it is tried.  At the end the output is
 * parsed again and compared with the input: every character that is not part of a variable name must be unchanged,
 * and every identifier must resolve to the same declaration as before.  If either fails the pass throws and leaves
 * the file as terser wrote it.
 *
 * Property names are left alone: dealing terser's mangled property names again was measured too and added nothing
 * within the same number of tries.
 *
 * usage: deno run --allow-read --allow-write --allow-env redeal.js <file.min.js> [tries=25000] [seed=1] [out file]
 * (also runs under node).  --allow-env is for @babel/parser, which reads its options from the environment.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import process from 'node:process';
import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;

function gzipSize(text) {
	return zlib.gzipSync(text, {level: 9}).length;
}

/**
 * Find every variable identifier of `code` and the declaration each one resolves to.
 *
 * A "binding" is one declaration.  Names that are declared nowhere in the file (`document`, `Array`) get one
 * binding each that can never be renamed.  A binding's `unit` is the outermost function around its scope: one
 * top-level function or one method, with everything nested inside it.
 * @param code {string}
 * @returns {{
 *     vars: {start:int, end:int, binding:int}[],
 *     bindings: {name:string, scope:int, refScopes:Set<int>, fixed:boolean, top:boolean, unit:int}[],
 *     scopeParent: int[]}} */
function analyze(code) {
	let ast = parser.parse(code, {sourceType: 'module'});
	let bindings = [], bindingIds = new Map(), platformIds = new Map(), vars = [];
	let scopeIds = new Map(), scopeParent = [], scopeIsFunction = [];

	let scopeId = scope => {
		let id = scopeIds.get(scope);
		if (id === undefined) {
			id = scopeIds.size;
			scopeIds.set(scope, id);
			scopeIsFunction[id] = scope.path.isFunction();
			scopeParent[id] = -1; // Reserve the slot before the parent takes the next id.
			scopeParent[id] = scope.parent ? scopeId(scope.parent) : -1;
		}
		return id;
	};

	let bindingId = (babelBinding, name) => {
		if (!babelBinding) { // A name of the platform.  It lives above the program, in scope -1.
			if (!platformIds.has(name)) {
				platformIds.set(name, bindings.length);
				bindings.push({name, scope: -1, refScopes: new Set(), fixed: true, top: false, unit: -1});
			}
			return platformIds.get(name);
		}
		if (!bindingIds.has(babelBinding)) {
			bindingIds.set(babelBinding, bindings.length);
			bindings.push({name, scope: scopeId(babelBinding.scope), refScopes: new Set(), fixed: false,
				top: babelBinding.scope.block.type === 'Program', unit: -1});
		}
		return bindingIds.get(babelBinding);
	};

	traverse(ast, {
		Identifier(path) {
			let node = path.node, parent = path.parent, type = parent.type;

			// 1. Skip identifiers that are not variables: property names, private names, labels, import.meta.
			if ((type === 'MemberExpression' || type === 'OptionalMemberExpression') && parent.property === node && !parent.computed)
				return;
			if (type === 'PrivateName' || type === 'MetaProperty' || type === 'LabeledStatement' || type === 'BreakStatement' || type === 'ContinueStatement')
				return;
			let isKey = (type === 'ObjectProperty' || type === 'ObjectMethod' || type === 'ClassMethod' || type === 'ClassProperty' || type === 'ClassAccessorProperty')
				&& parent.key === node && !parent.computed;
			let isShorthand = type === 'ObjectProperty' && parent.shorthand;
			if (isKey && !isShorthand)
				return;
			let isExport = type === 'ExportSpecifier';
			if (isExport && parent.exported === node && parent.local.start !== node.start)
				return;

			// 2. Resolve it.  The name of a function declaration belongs to the scope around the function, even
			// when a parameter of the same name shadows it inside.
			let scope = path.key === 'id' && path.parentPath.isFunctionDeclaration() ? path.parentPath.scope.parent : path.scope;
			let id = bindingId(scope.getBinding(node.name), node.name);
			bindings[id].refScopes.add(scopeId(scope));

			// 3. `{x}` and `export {x}` write a variable and a property or export name with one word, so that
			// variable keeps its name.  A mangling minifier does not print either; this is for safety.
			if (isShorthand || (isExport && parent.local.start === parent.exported.start))
				bindings[id].fixed = true;

			if (!vars.length || vars[vars.length - 1].start !== node.start) // `{x}` visits the same word twice.
				vars.push({start: node.start, end: node.end, binding: id});
		}
	});
	vars.sort((a, b) => a.start - b.start);

	// 4. Each binding's unit.
	for (let binding of bindings) {
		for (let s = binding.scope; s !== -1; s = scopeParent[s])
			if (scopeIsFunction[s])
				binding.unit = s;
		if (binding.top)
			binding.unit = -1;
	}
	return {vars, bindings, scopeParent};
}

/**
 * For each binding, list the bindings that may not share its name: `a` and `b` clash when `a` is declared at or
 * above `b`'s scope and is used somewhere inside `b`'s scope, since a `b` of the same name would then capture
 * that use.
 * @returns {int[][]} */
function findClashes(bindings, scopeParent) {
	// 1. ancestors[s] holds scope s and every scope around it.  -1, where platform names live, is around all.
	let ancestors = scopeParent.map((_, s) => {
		let result = new Set([-1]);
		for (let x = s; x !== -1; x = scopeParent[x])
			result.add(x);
		return result;
	});
	let above = scope => scope === -1 ? platformOnly : ancestors[scope];

	// 2. usedIn[b] holds every scope that contains a use of binding b, and all scopes around those.
	let usedIn = bindings.map(binding => {
		let result = new Set([-1]);
		for (let s of binding.refScopes)
			for (let x of ancestors[s])
				result.add(x);
		return result;
	});

	// 3. Compare every pair.
	let clashes = bindings.map(() => []);
	for (let i = 0; i < bindings.length; i++)
		for (let j = i + 1; j < bindings.length; j++) {
			let a = bindings[i], b = bindings[j];
			if ((above(b.scope).has(a.scope) && usedIn[i].has(b.scope)) || (above(a.scope).has(b.scope) && usedIn[j].has(a.scope))) {
				clashes[i].push(j);
				clashes[j].push(i);
			}
		}
	return clashes;
}
const platformOnly = new Set([-1]);

/**
 * Throw unless `after` is `before` with nothing changed but the names of variables, each identifier still
 * resolving to the declaration it resolved to before. */
function verify(before, after) {
	let a = analyze(before), b = analyze(after);
	if (a.vars.length !== b.vars.length)
		throw new Error('redeal: the number of identifiers changed.');

	// 1. The text between the identifiers is the same.
	let between = (text, vars) => {
		let result = '', pos = 0;
		for (let v of vars) {
			result += text.slice(pos, v.start) + '\0';
			pos = v.end;
		}
		return result + text.slice(pos);
	};
	if (between(before, a.vars) !== between(after, b.vars))
		throw new Error('redeal: something other than a variable name changed.');

	// 2. Identifiers that shared a declaration still share one, those that did not still do not, and each
	// declaration is in the scope it was in.  Scopes are numbered in the order the walk meets them, which is the
	// same for both files once step 1 has passed.
	let aToB = new Map(), bToA = new Map();
	for (let i = 0; i < a.vars.length; i++) {
		let x = a.vars[i].binding, y = b.vars[i].binding;
		if ((aToB.has(x) && aToB.get(x) !== y) || (bToA.has(y) && bToA.get(y) !== x))
			throw new Error(`redeal: "${after.slice(b.vars[i].start, b.vars[i].end)}" at ${b.vars[i].start} resolves to another declaration.`);
		aToB.set(x, y);
		bToA.set(y, x);
		let before = a.bindings[x], now = b.bindings[y];
		if (before.scope !== now.scope || before.fixed !== now.fixed || (before.fixed && before.name !== now.name))
			throw new Error(`redeal: "${now.name}" at ${b.vars[i].start} moved or should not have been renamed.`);
	}
}

/**
 * @param code {string} A minified ES module.
 * @param tries {int} How many renamings to try.  25,000 take 40 seconds and reach about 95% of what 60,000 reach.
 * @param seed {int} The search is random but repeatable: the same input, tries and seed give the same output.
 * @returns {{code:string, gzipBefore:int, gzipAfter:int, renamed:int}} */
export default function redeal(code, tries=25000, seed=1) {
	let random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	let pickFrom = list => list[Math.floor(random() * list.length)];

	let {vars, bindings, scopeParent} = analyze(code);
	let clashes = findClashes(bindings, scopeParent);
	let names = bindings.map(binding => binding.name);

	// 1. Cut the file at every identifier that may be renamed.
	let slots = vars.filter(v => !bindings[v.binding].fixed);
	let pieces = [], pos = 0;
	for (let slot of slots) {
		pieces.push(code.slice(pos, slot.start));
		pos = slot.end;
	}
	let tail = code.slice(pos);
	let render = () => {
		let result = '';
		for (let i = 0; i < slots.length; i++)
			result += pieces[i] + names[slots[i].binding];
		return result + tail;
	};

	// 2. Group the locals by function, and prepare to pick a function in proportion to how many identifiers
	// it holds, so that the large functions get most of the tries.
	let members = new Map(), tops = [];
	bindings.forEach((binding, i) => {
		if (binding.fixed)
			return;
		if (binding.top)
			tops.push(i);
		else if (binding.unit !== -1) {
			if (!members.has(binding.unit))
				members.set(binding.unit, []);
			members.get(binding.unit).push(i);
		}
	});
	let unitOfSlot = slots.map(slot => bindings[slot.binding].unit).filter(unit => unit !== -1);
	if (!unitOfSlot.length)
		return {code, gzipBefore: gzipSize(code), gzipAfter: gzipSize(code), renamed: 0};

	let hasClash = changed => {
		for (let c of changed)
			for (let d of clashes[c])
				if (names[d] === names[c])
					return true;
		return false;
	};
	let swap = (changed, x, y) => {
		for (let c of changed)
			names[c] = names[c] === x ? y : x;
	};

	// 3. Climb.
	let best = gzipSize(code), gzipBefore = best;
	for (let i = 0; i < tries; i++) {
		let changed, x, y;

		// 3a. One try in ten swaps two top-level names.  A function that uses one of them and has a local
		// called like the other swaps the same two letters throughout, which keeps it valid.
		if (tops.length > 1 && random() < .1) {
			let a = pickFrom(tops), b = pickFrom(tops);
			x = names[a];
			y = names[b];
			if (x === y)
				continue;
			changed = [a, b];
			names[a] = y;
			names[b] = x;
			let swapped = new Set();
			for (let top of [a, b])
				for (let other of clashes[top]) {
					let unit = bindings[other].unit;
					if (names[other] === names[top] && members.has(unit) && !swapped.has(unit)) {
						swapped.add(unit);
						for (let c of members.get(unit))
							if (names[c] === x || names[c] === y) {
								names[c] = names[c] === x ? y : x;
								changed.push(c);
							}
					}
				}
		}

		// 3b. The other nine swap two letters that one function already uses.
		else {
			let unit = members.get(pickFrom(unitOfSlot));
			let used = [...new Set(unit.map(c => names[c]))];
			x = pickFrom(used);
			y = pickFrom(used);
			if (x === y)
				continue;
			changed = unit.filter(c => names[c] === x || names[c] === y);
			swap(changed, x, y);
		}

		// 3c. Keep it if it is allowed and gzip is no worse.
		if (hasClash(changed)) {
			swap(changed, x, y);
			continue;
		}
		let size = gzipSize(render());
		if (size <= best)
			best = size;
		else
			swap(changed, x, y);
	}

	// 4. Check the result against the input before handing it back.
	let result = render();
	verify(code, result);
	return {code: result, gzipBefore, gzipAfter: best, renamed: names.filter((name, i) => name !== bindings[i].name).length};
}

if (import.meta.main ?? (process.argv[1] && import.meta.url.endsWith(process.argv[1]))) {
	let [file, tries='25000', seed='1', outFile=file] = process.argv.slice(2);
	let code = fs.readFileSync(file, 'utf8');
	let start = Date.now();
	let result = redeal(code, +tries, +seed);
	fs.writeFileSync(outFile, result.code);
	console.log(`Re-dealt ${result.renamed} variable names of ${file} in ${Math.round((Date.now() - start) / 1000)}s: ` +
		`gzip ${result.gzipBefore.toLocaleString()} -> ${result.gzipAfter.toLocaleString()} bytes, ` +
		`${code.length.toLocaleString()} -> ${result.code.length.toLocaleString()} minified.`);
}
