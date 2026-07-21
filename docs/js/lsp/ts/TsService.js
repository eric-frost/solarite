let worker = null;
let refs = 0;
let nextCallId = 1;
let nextEditorId = 1;
const pending = new Map;
const refreshListeners = new Set;
const openFiles = new Set;
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./TsWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      let { id, result, error, event } = e.data;
      if (event === "filesLoaded") {
        for (let l of refreshListeners)
          l();
        return;
      }
      let p = pending.get(id);
      pending.delete(id);
      if (error !== undefined)
        p?.reject(new Error(error));
      else
        p?.resolve(result);
    };
    worker.onerror = (e) => console.warn("TsService worker error:", e.message);
  }
  return worker;
}
function call(method, params) {
  return new Promise((resolve, reject) => {
    let id = nextCallId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, method, params });
  });
}
const DEFAULT_OPTIONS = {
  allowJs: true,
  checkJs: true,
  target: "ESNext",
  module: "ESNext",
  moduleResolution: "Bundler",
  allowImportingTsExtensions: true,
  noEmit: true,
  moduleDetection: "force",
  strict: false,
  skipLibCheck: true,
  jsx: "react",
  jsxFactory: "h"
};
const KIND_MAP = {
  method: "method",
  function: "function",
  "local function": "function",
  property: "property",
  getter: "property",
  setter: "property",
  var: "variable",
  let: "variable",
  "local var": "variable",
  parameter: "variable",
  const: "constant",
  "enum member": "constant",
  class: "class",
  "local class": "class",
  interface: "interface",
  type: "type",
  enum: "enum",
  module: "namespace",
  keyword: "keyword",
  string: "text"
};
export default function tsService(options = {}) {
  let id = nextEditorId++;
  let filename = options.filename || "file.ts";
  let file = filename.startsWith("/") ? openFiles.has(filename) ? filename.replace(/(\.[^.]+)$/, `.b${id}$1`) : filename : `/buf/${id}/${filename}`;
  openFiles.add(file);
  refs++;
  let compilerOptions = { ...DEFAULT_OPTIONS, ...options.compilerOptions };
  let opened = call("open", {
    file,
    compilerOptions,
    fetchImports: options.fetchImports,
    maxFetchedFiles: options.maxFetchedFiles
  });
  let seq = { complete: 0, hover: 0, diag: 0, sig: 0, hl: 0 };
  let importsLoading = options.fetchImports !== false;
  if (importsLoading) {
    const settle = () => importsLoading = false;
    refreshListeners.add(settle);
    setTimeout(settle, 20000);
  }
  async function fresh(key, method, params) {
    let mySeq = ++seq[key];
    await opened;
    let result = await call(method, params).catch(() => null);
    return mySeq === seq[key] ? result : null;
  }
  return {
    async completions(ctx) {
      let prefix = ctx.code.slice(0, ctx.pos).match(/[A-Za-z0-9_$]*$/)[0];
      if (!prefix && !ctx.explicit && ctx.code[ctx.pos - 1] !== ".")
        return null;
      let result = await fresh("complete", "completions", { file, code: ctx.code, pos: ctx.pos });
      if (!result?.entries?.length)
        return null;
      let from = ctx.pos - prefix.length;
      return {
        from,
        options: result.entries.map((e) => ({
          label: e.name,
          type: KIND_MAP[e.kind] || "text",
          detail: e.source ? "auto-import" : undefined,
          section: e.section,
          boost: -Number(e.sortText?.[0] || 0) || undefined,
          info: async () => {
            let d = await call("completionDetails", { file, code: ctx.code, pos: ctx.pos, name: e.name, source: e.source, data: e.data });
            if (!d?.display && !d?.documentation)
              return null;
            let el = document.createElement("div");
            el.style.whiteSpace = "pre-wrap";
            el.textContent = d.display + (d.documentation ? `

` + d.documentation : "");
            return el;
          },
          apply: !e.source ? undefined : (view, completion, applyFrom, applyTo) => {
            view.dispatch({
              changes: { from: applyFrom, to: applyTo, insert: e.name },
              selection: { anchor: applyFrom + e.name.length }
            });
            let doc = view.state.doc;
            call("completionDetails", {
              file,
              code: doc.toString(),
              pos: applyFrom + e.name.length,
              name: e.name,
              source: e.source,
              data: e.data
            }).then((d) => {
              if (d?.edits?.length && view.state.doc === doc)
                view.dispatch({ changes: d.edits });
            });
          }
        }))
      };
    },
    async hover(ctx) {
      return fresh("hover", "hover", { file, code: ctx.code, pos: ctx.pos });
    },
    async diagnostics(code) {
      let result = await fresh("diag", "diagnostics", { file, code });
      if (!result)
        return [];
      if (importsLoading)
        result = result.filter((d) => d.code !== 2307);
      return result.map((d) => ({
        from: d.from,
        to: Math.max(d.to, d.from + 1),
        severity: d.severity,
        message: d.message,
        code: d.code,
        actions: d.fixes.map((f) => ({
          name: f.description,
          apply: (view) => {
            if (view.state.doc.toString() === code)
              view.dispatch({ changes: f.edits });
          }
        }))
      }));
    },
    async signatureHelp(ctx) {
      return fresh("sig", "signatureHelp", { file, code: ctx.code, pos: ctx.pos });
    },
    async definition(ctx) {
      await opened;
      return call("definition", { file, code: ctx.code, pos: ctx.pos }).catch(() => null);
    },
    async highlights(ctx) {
      return await fresh("hl", "highlights", { file, code: ctx.code, pos: ctx.pos }) || [];
    },
    async rename(ctx) {
      await opened;
      return call("rename", { file, code: ctx.code, pos: ctx.pos, newName: ctx.newName }).catch(() => null);
    },
    async format(code, from, to) {
      await opened;
      return call("format", { file, code, from, to }).catch(() => []);
    },
    async inlayHints(ctx) {
      await opened;
      return call("inlayHints", { file, code: ctx.code, from: ctx.from, to: ctx.to }).catch(() => []);
    },
    async navigationTree(code) {
      await opened;
      return call("navigationTree", { file, code });
    },
    async linkedEditing(ctx) {
      await opened;
      return call("linkedEditing", { file, code: ctx.code, pos: ctx.pos }).catch(() => null);
    },
    async transpile(code) {
      await opened;
      let result = await call("transpile", { code }).catch(() => null);
      return result?.output ?? null;
    },
    onRefresh(listener) {
      refreshListeners.add(listener);
    },
    dispose() {
      openFiles.delete(file);
      call("close", { file });
      if (--refs <= 0) {
        worker?.terminate();
        worker = null;
        refs = 0;
        pending.clear();
        refreshListeners.clear();
      }
    }
  };
}
