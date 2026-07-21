import ts from "../../vendor/typescript.esm.js";
import { unwrapDoc } from "../DocText.js";
const libsReady = fetch(new URL("../../vendor/typescript-libs.json", import.meta.url)).then((r) => {
  if (!r.ok)
    throw new Error("typescript-libs.json: HTTP " + r.status);
  return r.json();
}).then((json) => {
  libs = json;
});
let libs = {};
const buffers = new Map;
const fetched = new Map;
const fetchFailed = new Set;
const fetchPending = new Set;
const fetchDepth = new Map;
const projects = new Map;
let fetchImports = true;
let maxFetchedFiles = 200;
const MAX_FETCH_DEPTH = 5;
const FORMAT = {
  convertTabsToSpaces: false,
  tabSize: 4,
  indentSize: 4,
  indentStyle: 2,
  newLineCharacter: `
`,
  insertSpaceAfterCommaDelimiter: true,
  insertSpaceAfterKeywordsInControlFlowStatements: true,
  insertSpaceBeforeAndAfterBinaryOperators: true
};
const libKey = (f) => f.startsWith("/") ? f.slice(1) : f;
function getProject(key) {
  let svc = projects.get(key);
  if (svc)
    return svc;
  let options = ts.convertCompilerOptionsFromJson(JSON.parse(key), "/").options;
  let host = {
    getScriptFileNames: () => [
      ...[...buffers.entries()].filter(([, b]) => b.project === key).map(([f]) => f),
      ...fetched.keys()
    ],
    getScriptVersion: (f) => String(buffers.get(f)?.version ?? fetched.get(f)?.version ?? 1),
    getScriptSnapshot: (f) => {
      let text = readFile(f);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => "/",
    getCompilationSettings: () => options,
    getDefaultLibFileName: () => "/lib.esnext.full.d.ts",
    fileExists: (f) => readFile(f) !== undefined,
    readFile,
    resolveModuleNames: (names, containingFile) => names.map((name) => resolveModule(name, containingFile))
  };
  svc = ts.createLanguageService(host);
  projects.set(key, svc);
  return svc;
}
function readFile(f) {
  return buffers.get(f)?.text ?? fetched.get(f)?.text ?? libs[libKey(f)];
}
function resolveModule(name, containingFile) {
  let spec = name.split("?")[0];
  if (!spec.startsWith("/") && !spec.startsWith("."))
    return;
  let path;
  try {
    path = new URL(spec, "https://x" + containingFile).pathname;
  } catch {
    return;
  }
  if (!/\.(ts|tsx|js|jsx|mjs|d\.ts)$/.test(path))
    return;
  if (readFile(path) !== undefined)
    return { resolvedFileName: path, extension: path.match(/\.[^.]+$/)[0], isExternalLibraryImport: false };
  queueFetch(path, (fetchDepth.get(containingFile) || 0) + 1);
  return;
}
let fetchTimer = null;
let landed = false;
function queueFetch(path, depth) {
  if (!fetchImports || depth > MAX_FETCH_DEPTH || fetched.size + fetchPending.size >= maxFetchedFiles || fetchPending.has(path) || fetchFailed.has(path) || buffers.has(path))
    return;
  fetchPending.add(path);
  let url = /\.(ts|tsx|jsx)$/.test(path) ? path + "?raw" : path;
  fetch(url).then((r) => r.ok ? r.text() : Promise.reject(r.status)).then((text) => {
    fetched.set(path, { text, version: 1 });
    fetchDepth.set(path, depth);
    landed = true;
  }).catch(() => {
    fetchFailed.add(path);
  }).finally(() => {
    fetchPending.delete(path);
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
      if (!fetchPending.size && landed) {
        landed = false;
        postMessage({ event: "filesLoaded" });
      }
    }, 100);
  });
}
function sync(file, code) {
  let buf = buffers.get(file);
  if (buf.text !== code) {
    buf.text = code;
    buf.version++;
  }
}
const severityMap = { 0: "warning", 1: "error", 2: "info", 3: "info" };
function memberSections(svc, result) {
  if (!result.isMemberCompletion)
    return null;
  try {
    let checker = svc.getProgram().getTypeChecker();
    let heights = new Map;
    let heightOf = (sym) => {
      if (heights.has(sym))
        return heights.get(sym);
      heights.set(sym, 0);
      let h = 0;
      let t = checker.getDeclaredTypeOfSymbol(sym);
      if (t.isClassOrInterface()) {
        for (let base of checker.getBaseTypes(t))
          if (base.symbol)
            h = Math.max(h, 1 + heightOf(base.symbol));
      }
      heights.set(sym, h);
      return h;
    };
    let bySym = new Map;
    let out = new Map;
    let leftovers = [];
    for (let e of result.entries) {
      let container = e.symbol?.declarations?.[0]?.parent;
      let nameNode = container && (ts.isClassLike(container) || ts.isInterfaceDeclaration(container)) ? container.name : null;
      let csym = nameNode && checker.getSymbolAtLocation(nameNode);
      if (!csym) {
        leftovers.push(e);
        continue;
      }
      let section = bySym.get(csym);
      if (!section) {
        let lib = /^\/?lib\..*\.d\.ts$/.test(container.getSourceFile().fileName);
        section = { name: csym.name, rank: (lib ? 1e6 : 0) + 1000 - Math.min(heightOf(csym), 999) };
        bySym.set(csym, section);
      }
      out.set(e, section);
    }
    if (bySym.size < 2)
      return null;
    for (let e of leftovers)
      out.set(e, OTHER_SECTION);
    return out;
  } catch (ex) {
    console.warn("Completion sections skipped:", ex);
    return null;
  }
}
const OTHER_SECTION = { name: "other", rank: 2000000 };
const methods = {
  open({ file, compilerOptions, fetchImports: fi, maxFetchedFiles: mf }) {
    if (fi === false)
      fetchImports = false;
    if (mf)
      maxFetchedFiles = mf;
    let project = JSON.stringify(compilerOptions);
    buffers.set(file, { text: "", version: 1, project });
    getProject(project);
  },
  close({ file }) {
    buffers.delete(file);
  },
  completions({ file, code, pos }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let result = svc.getCompletionsAtPosition(file, pos, {
      includeCompletionsForModuleExports: true,
      includeCompletionsWithInsertText: true,
      useLabelDetailsInCompletionEntries: false,
      includeSymbol: true
    });
    if (!result)
      return null;
    let sections = memberSections(svc, result);
    return {
      isNewIdentifierLocation: result.isNewIdentifierLocation,
      entries: result.entries.slice(0, 1000).map((e) => ({
        name: e.name,
        kind: e.kind,
        kindModifiers: e.kindModifiers,
        sortText: e.sortText,
        insertText: e.insertText,
        source: e.source,
        hasAction: !!e.hasAction,
        data: e.data,
        section: sections?.get(e)
      }))
    };
  },
  completionDetails({ file, code, pos, name, source, data }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let d = svc.getCompletionEntryDetails(file, pos, name, FORMAT, source, {}, data);
    if (!d)
      return null;
    return {
      display: ts.displayPartsToString(d.displayParts),
      documentation: unwrapDoc(ts.displayPartsToString(d.documentation)),
      edits: (d.codeActions || []).flatMap((a) => a.changes).filter((c) => c.fileName === file).flatMap((c) => c.textChanges).map((c) => ({ from: c.span.start, to: c.span.start + c.span.length, insert: c.newText }))
    };
  },
  hover({ file, code, pos }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let info = svc.getQuickInfoAtPosition(file, pos);
    if (!info)
      return null;
    let contents = ts.displayPartsToString(info.displayParts);
    let doc = ts.displayPartsToString(info.documentation);
    if (doc)
      contents += `

` + unwrapDoc(doc);
    return { contents, from: info.textSpan.start, to: info.textSpan.start + info.textSpan.length };
  },
  diagnostics({ file, code }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let all = [
      ...svc.getSyntacticDiagnostics(file),
      ...svc.getSemanticDiagnostics(file),
      ...svc.getSuggestionDiagnostics(file)
    ];
    return all.filter((d) => d.start !== undefined).slice(0, 100).map((d, i) => {
      let message = ts.flattenDiagnosticMessageText(d.messageText, `
`);
      for (let r of d.relatedInformation || [])
        message += `
` + ts.flattenDiagnosticMessageText(r.messageText, `
`);
      let fixes = [];
      if (i < 20)
        try {
          fixes = svc.getCodeFixesAtPosition(file, d.start, d.start + d.length, [d.code], FORMAT, {}).map((f) => ({
            description: f.description,
            edits: f.changes.filter((c) => c.fileName === file).flatMap((c) => c.textChanges).map((c) => ({ from: c.span.start, to: c.span.start + c.span.length, insert: c.newText }))
          })).filter((f) => f.edits.length);
        } catch {}
      return {
        from: d.start,
        to: d.start + d.length,
        severity: severityMap[d.category] || "info",
        message,
        fixes,
        code: d.code
      };
    });
  },
  signatureHelp({ file, code, pos }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let help = svc.getSignatureHelpItems(file, pos, undefined);
    if (!help)
      return null;
    return {
      activeSignature: help.selectedItemIndex,
      activeParameter: help.argumentIndex,
      signatures: help.items.map((item) => {
        let label = ts.displayPartsToString(item.prefixDisplayParts);
        let sep = ts.displayPartsToString(item.separatorDisplayParts);
        let params = [];
        item.parameters.forEach((p, i) => {
          if (i)
            label += sep;
          let text = ts.displayPartsToString(p.displayParts);
          params.push({ start: label.length, end: label.length + text.length });
          label += text;
        });
        label += ts.displayPartsToString(item.suffixDisplayParts);
        return { label, params, documentation: unwrapDoc(ts.displayPartsToString(item.documentation)) };
      })
    };
  },
  definition({ file, code, pos }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let result = svc.getDefinitionAndBoundSpan(file, pos);
    if (!result?.definitions?.length)
      return null;
    return result.definitions.map((d) => ({
      url: d.fileName === file ? "" : d.fileName,
      from: d.textSpan.start,
      to: d.textSpan.start + d.textSpan.length
    }));
  },
  highlights({ file, code, pos }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let result = svc.getDocumentHighlights(file, pos, [file]);
    if (!result)
      return [];
    return result.flatMap((h) => h.highlightSpans).map((s) => ({ from: s.textSpan.start, to: s.textSpan.start + s.textSpan.length }));
  },
  rename({ file, code, pos, newName }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let info = svc.getRenameInfo(file, pos, {});
    if (!info.canRename)
      return null;
    let locs = svc.findRenameLocations(file, pos, false, false, {}) || [];
    return locs.filter((l) => l.fileName === file).map((l) => ({ from: l.textSpan.start, to: l.textSpan.start + l.textSpan.length, insert: newName }));
  },
  format({ file, code, from, to }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let edits = from === undefined ? svc.getFormattingEditsForDocument(file, FORMAT) : svc.getFormattingEditsForRange(file, from, to, FORMAT);
    return edits.map((e) => ({ from: e.span.start, to: e.span.start + e.span.length, insert: e.newText }));
  },
  inlayHints({ file, code, from, to }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let hints = svc.provideInlayHints(file, { start: from, length: to - from }, {
      includeInlayParameterNameHints: "all",
      includeInlayFunctionLikeReturnTypeHints: false
    });
    return hints.map((h) => ({ pos: h.position, label: typeof h.text === "string" ? h.text : ts.displayPartsToString(h.text), kind: h.kind }));
  },
  linkedEditing({ file, code, pos }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let result = svc.getLinkedEditingRangeAtPosition(file, pos);
    if (!result?.ranges?.length)
      return null;
    return result.ranges.map((r) => ({ from: r.start, to: r.start + r.length }));
  },
  navigationTree({ file, code }) {
    sync(file, code);
    let svc = getProject(buffers.get(file).project);
    let strip = (n) => ({
      text: n.text,
      kind: n.kind,
      spans: n.spans.map((s) => ({ from: s.start, to: s.start + s.length })),
      childItems: (n.childItems || []).map(strip)
    });
    return strip(svc.getNavigationTree(file));
  },
  transpile({ code }) {
    let out = ts.transpileModule(code, { compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false
    } });
    return { output: out.outputText.replace(/^"use strict";\r?\n/, "") };
  }
};
let chain = libsReady;
onmessage = (e) => {
  let { id, method, params } = e.data;
  chain = chain.catch(() => {}).then(() => {
    try {
      postMessage({ id, result: methods[method](params) ?? null });
    } catch (err) {
      postMessage({ id, error: String(err?.message || err) });
    }
  });
};
