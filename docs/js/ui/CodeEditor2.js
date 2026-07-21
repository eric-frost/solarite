import h, { Solarite } from "../../../src/Solarite.js";
import { Language } from "../util/FileType.js";
export default class CodeEditor2 extends Solarite {
  static userOptions = {
    folding: true,
    inlayHints: false,
    docsOnDemand: false,
    linkedTags: false,
    theme: "SolarIce",
    sqlDialect: "StandardSQL"
  };
  static settingsStorage = "none";
  static #optionsLoaded = false;
  static #loadUserOptions() {
    if (this.#optionsLoaded)
      return;
    this.#optionsLoaded = true;
    if (this.settingsStorage === "localStorage")
      try {
        Object.assign(this.userOptions, JSON.parse(localStorage.getItem("codeEditor2.options") || "{}"));
      } catch {}
  }
  view = null;
  ready;
  language = null;
  wordWrap = false;
  tabSize = 4;
  readOnly = false;
  services = null;
  lintDelay = 750;
  completionDelay = 250;
  onGoToDefinition = null;
  inlayHints = false;
  markOccurrences = true;
  lintMarkers = "number";
  editor;
  placeholder;
  #cm = null;
  #theme = null;
  #value = "";
  #compartments = null;
  #suppressChange = false;
  undoOwner = null;
  #lastUndoDepth = 0;
  extraExtensions = [];
  #lintNumber = null;
  #lintDisabled = {};
  #sqlConfig = null;
  #appliedSqlDialect = "";
  constructor({
    value = "",
    language = null,
    wordWrap = false,
    tabSize = 4,
    readOnly = false,
    services = null,
    lintDelay = 750,
    completionDelay = 250,
    onGoToDefinition = null,
    inlayHints = false,
    lintMarkers = "number",
    settingsStorage = null,
    extraExtensions = null
  } = {}) {
    super();
    let storage = this.getAttribute("settings-storage") ?? settingsStorage;
    if (storage === "none" || storage === "localStorage")
      CodeEditor2.settingsStorage = storage;
    CodeEditor2.#loadUserOptions();
    let textarea = this.querySelector(":scope > textarea");
    this.#value = this.getAttribute("value") ?? textarea?.value ?? value;
    textarea?.remove();
    if (extraExtensions)
      this.extraExtensions = extraExtensions;
    let bare = (v) => v === "" || !!v;
    this.language = normalizeLanguage(this.getAttribute("language") ?? language);
    this.wordWrap = this.hasAttribute("word-wrap") || bare(wordWrap);
    this.readOnly = this.hasAttribute("read-only") || bare(readOnly);
    this.tabSize = parseInt(this.getAttribute("tab-size")) || tabSize;
    this.services = services;
    this.lintDelay = parseInt(this.getAttribute("lint-delay")) || lintDelay;
    this.completionDelay = parseInt(this.getAttribute("completion-delay")) || completionDelay;
    this.onGoToDefinition = onGoToDefinition;
    this.inlayHints = this.hasAttribute("inlay-hints") || bare(inlayHints);
    let lm = this.getAttribute("lint-markers") ?? lintMarkers;
    this.lintMarkers = lm === "stripe" || lm === "none" ? lm : "number";
    this.render();
    this.ready = this.#init();
  }
  async#init() {
    let [{ cm, theme }] = await Promise.all([
      loadCodeMirror(),
      needsLanguageBundle(this.language) ? loadLanguageBundle() : null
    ]);
    this.#cm = cm;
    this.#theme = theme;
    this.#compartments = {
      language: new cm.Compartment,
      lineWrapping: new cm.Compartment,
      tabSize: new cm.Compartment,
      theme: new cm.Compartment,
      intel: new cm.Compartment,
      folding: new cm.Compartment,
      readOnly: new cm.Compartment
    };
    this.#appliedSqlDialect = CodeEditor2.userOptions.sqlDialect;
    let state = cm.EditorState.create({ doc: this.#value, extensions: this.#extensions() });
    this.view = new cm.EditorView({ state, parent: this.editor });
    this.placeholder.remove();
    this.placeholder = null;
    this.#resolveSqlService();
    this.classList.toggle("ce2-docs-hidden", CodeEditor2.userOptions.docsOnDemand);
  }
  #extensions() {
    let cm = this.#cm;
    return [
      cm.lineNumbers({ domEventHandlers: this.#lintNumberExt().domEventHandlers }),
      this.#compartments.folding.of(CodeEditor2.userOptions.folding ? [cm.foldGutter(), cm.keymap.of(cm.foldKeymap)] : []),
      cm.history(),
      cm.drawSelection(),
      cm.highlightSpecialChars(),
      cm.bracketMatching(),
      cm.closeBrackets(),
      cm.autocompletion(),
      cm.indentUnit.of(" ".repeat(this.tabSize)),
      cm.EditorState.allowMultipleSelections.of(true),
      cm.keymap.of([
        { key: "Tab", run: cm.acceptCompletion },
        { key: "Ctrl-q", run: (view) => {
          if (!CodeEditor2.userOptions.docsOnDemand || !cm.completionStatus(view.state))
            return false;
          this.classList.toggle("ce2-docs-hidden");
          return true;
        } },
        cm.indentWithTab,
        ...cm.closeBracketsKeymap,
        ...cm.completionKeymap,
        ...cm.defaultKeymap,
        { key: "Mod-z", run: () => this.undoOwner ? (this.undoOwner.undo(), true) : false },
        { key: "Mod-y", run: () => this.undoOwner ? (this.undoOwner.redo(), true) : false },
        { key: "Mod-Shift-z", run: () => this.undoOwner ? (this.undoOwner.redo(), true) : false },
        ...cm.historyKeymap,
        ...cm.searchKeymap
      ]),
      cm.syntaxHighlighting(cm.defaultHighlightStyle, { fallback: true }),
      cm.EditorView.updateListener.of((update) => {
        if (update.docChanged && !this.#suppressChange) {
          this.dispatchEvent(new Event("input", { bubbles: true }));
          this.dispatchEvent(new Event("change", { bubbles: true }));
        }
        {
          let depth = cm.undoDepth(update.state);
          if (depth > this.#lastUndoDepth && !this.#suppressChange)
            this.undoOwner?.committed(this);
          this.#lastUndoDepth = depth;
        }
        if (CodeEditor2.userOptions.docsOnDemand && !this.classList.contains("ce2-docs-hidden") && !cm.completionStatus(update.state))
          this.classList.add("ce2-docs-hidden");
      }),
      this.#compartments.theme.of(this.#theme(this.language, this.#isDark())),
      this.#compartments.tabSize.of(cm.EditorState.tabSize.of(this.tabSize)),
      this.#compartments.lineWrapping.of(this.wordWrap ? cm.EditorView.lineWrapping : []),
      this.#compartments.readOnly.of(this.#readOnlyExt()),
      this.#compartments.language.of(languageExtension(cm, this.language, this.#sqlConfig)),
      this.#compartments.intel.of(this.#intelExtensions()),
      ...this.extraExtensions.map((e) => typeof e === "function" ? e(cm) : e)
    ];
  }
  async setServices(services) {
    this.services = services;
    this.#lintDisabled = {};
    await this.ready;
    this.view.dispatch({ effects: this.#compartments.intel.reconfigure(this.#intelExtensions()) });
    this.#resolveSqlService();
  }
  async#resolveSqlService() {
    let sql = this.services?.sql ?? null;
    if (typeof sql === "function")
      try {
        sql = await sql();
      } catch (e) {
        console.warn("CodeEditor2: sql schema provider failed:", e);
        sql = null;
      }
    this.#sqlConfig = sql;
    if (this.view && (sql || this.language === Language.Sql)) {
      this.view.dispatch({ effects: this.#compartments.language.reconfigure(languageExtension(this.#cm, this.language, this.#sqlConfig)) });
      if (sql)
        this.#cm.forceLinting(this.view);
    }
  }
  #lintNumberExt() {
    if (this.#lintNumber)
      return this.#lintNumber;
    let cm = this.#cm;
    let RANK = { info: 1, warning: 2, error: 3 };
    let LnumMarker = class extends cm.GutterMarker {
      constructor(severity) {
        super();
        this.severity = severity;
        this.elementClass = "ce2-lnum-" + severity;
      }
      eq(other) {
        return other.severity === this.severity;
      }
    };
    let markerCache = {};
    let markerFor = (severity) => markerCache[severity] || (markerCache[severity] = new LnumMarker(severity));
    let build = (state) => {
      let worst = new Map;
      cm.forEachDiagnostic(state, (d, from) => {
        if (!RANK[d.severity])
          return;
        let lineStart = state.doc.lineAt(Math.min(from, state.doc.length)).from;
        let cur = worst.get(lineStart);
        if (!cur || RANK[d.severity] > RANK[cur])
          worst.set(lineStart, d.severity);
      });
      let ranges = [...worst.entries()].sort((a, b) => a[0] - b[0]).map(([from, sev]) => markerFor(sev).range(from));
      return cm.RangeSet.of(ranges);
    };
    let markers = cm.StateField.define({
      create: build,
      update: (value, tr) => tr.docChanged || tr.effects.length ? build(tr.state) : value,
      provide: (f) => cm.lineNumberMarkers.from(f)
    });
    let setTip = cm.StateEffect.define();
    let tip = cm.StateField.define({
      create: () => null,
      update(value, tr) {
        for (let e of tr.effects)
          if (e.is(setTip))
            value = e.value;
        if (value && (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(cm.setDiagnosticsEffect))))
          value = null;
        return value;
      },
      provide: (f) => cm.showTooltip.from(f)
    });
    let lineDiags = (state, lineStart) => {
      let out = [];
      cm.forEachDiagnostic(state, (d, from) => {
        if (state.doc.lineAt(Math.min(from, state.doc.length)).from === lineStart)
          out.push(d);
      });
      return out.sort((a, b) => (RANK[b.severity] || 0) - (RANK[a.severity] || 0));
    };
    let makeTip = (lineStart, diags) => ({
      pos: lineStart,
      above: false,
      arrow: true,
      create: () => {
        let dom = document.createElement("div");
        dom.className = "ce2-lnum-tip";
        for (let d of diags) {
          let row = dom.appendChild(document.createElement("div"));
          row.className = "ce2-lnum-tip-" + d.severity;
          row.textContent = d.message;
        }
        return { dom };
      }
    });
    let domEventHandlers = {
      mousemove: (view, line) => {
        if (this.lintMarkers !== "number")
          return false;
        let cur = view.state.field(tip, false);
        let diags = lineDiags(view.state, line.from);
        if (!diags.length) {
          if (cur)
            view.dispatch({ effects: setTip.of(null) });
        } else if (!cur || cur.pos !== line.from)
          view.dispatch({ effects: setTip.of(makeTip(line.from, diags)) });
        return false;
      },
      mouseleave: (view) => {
        if (view.state.field(tip, false))
          view.dispatch({ effects: setTip.of(null) });
        return false;
      }
    };
    return this.#lintNumber = { extension: [markers, tip], domEventHandlers };
  }
  setLintMarkers(mode) {
    if (mode === this.lintMarkers)
      return;
    this.lintMarkers = mode;
    this.ready.then(() => {
      if (!this.view)
        return;
      this.view.dispatch({ effects: this.#compartments.intel.reconfigure(this.#intelExtensions()) });
      this.#cm.forceLinting(this.view);
    });
  }
  #intelExtensions() {
    let cm = this.#cm;
    let services = this.services || {};
    let ext = [];
    let jsLang = this.language === Language.TypeScript ? getChain(cm).tsSupport.language : cm.javascriptLanguage;
    let byLanguage = [
      [cm.phpLanguage, services.php, "php"],
      [jsLang, services.js, "js"]
    ].filter(([lang, svc]) => lang && svc);
    for (let [lang, svc, key] of byLanguage)
      if (svc.completions)
        ext.push(lang.data.of({ autocomplete: async (context) => {
          if (!context.explicit) {
            await new Promise((r) => setTimeout(r, this.completionDelay));
            if (context.aborted)
              return null;
          }
          let code = this.#codeFor(context.state, key);
          return code === null ? null : svc.completions({ code, pos: context.pos, explicit: context.explicit });
        } }));
    let hoverable = byLanguage.filter(([, svc]) => svc.hover);
    let sqlIntel = !!services.sql;
    if (hoverable.length || sqlIntel)
      ext.push(cm.hoverTooltip(async (view, pos) => {
        let info = null;
        if (sqlIntel && this.#sqlActiveAt(view.state, pos))
          info = this.#sqlHover(view.state, pos);
        else
          for (let [lang, svc, key] of hoverable) {
            if (!lang.isActiveAt(view.state, pos))
              continue;
            let code = this.#codeFor(view.state, key);
            info = code === null ? null : await svc.hover({ code, pos });
            break;
          }
        if (!info)
          return null;
        return { pos: info.from, end: info.to, create: () => {
          let dom = document.createElement("div");
          dom.style.padding = "2px 6px";
          dom.style.whiteSpace = "pre-wrap";
          dom.style.maxWidth = "40em";
          if (typeof info.contents === "string")
            dom.textContent = info.contents;
          else
            dom.append(info.contents);
          return { dom };
        } };
      }));
    let diagable = byLanguage.filter(([, svc, key]) => svc.diagnostics && !this.#lintDisabled[key]);
    if (diagable.length || sqlIntel) {
      ext.push(cm.linter(async (view) => {
        let out = [];
        for (let [, svc, key] of diagable) {
          if (this.#lintDisabled[key])
            continue;
          let code = this.#codeFor(view.state, key);
          if (code === null)
            continue;
          let result = await svc.diagnostics(code);
          if (result === null) {
            this.#lintDisabled[key] = true;
            setTimeout(() => this.view?.dispatch({ effects: this.#compartments.intel.reconfigure(this.#intelExtensions()) }));
            continue;
          }
          out.push(...this.#filterForeignDiagnostics(view.state, key, result));
        }
        if (sqlIntel)
          out.push(...this.#sqlDiagnostics(view.state));
        return out;
      }, { delay: this.lintDelay }));
      if (this.lintMarkers === "stripe")
        ext.push(cm.lintGutter());
      else if (this.lintMarkers === "number")
        ext.push(this.#lintNumberExt().extension);
    }
    ext.push(...this.#extendedIntel(byLanguage));
    return ext;
  }
  #serviceAt(state, pos) {
    for (let [lang, svc, key] of this.#intelServices)
      if (lang.isActiveAt(state, pos))
        return [svc, key];
    return null;
  }
  #topKey() {
    return this.language === Language.Php ? "php" : this.language === Language.JavaScript || this.language === Language.TypeScript ? "js" : null;
  }
  #topService() {
    return this.services?.[this.#topKey()] ?? null;
  }
  #servicesWith(member) {
    let top = this.#topKey();
    return this.#intelServices.filter(([, svc]) => svc[member]).map(([, svc, key]) => [svc, key]).sort((a, b) => (a[1] === top ? -1 : 0) - (b[1] === top ? -1 : 0));
  }
  #projCache = null;
  static #PROJECTION_CAP = 65536;
  #segments(state) {
    let cm = this.#cm;
    let len = state.doc.length;
    let tree = cm.ensureSyntaxTree(state, len, 500) || cm.syntaxTree(state);
    if (tree.length < len)
      return null;
    let topKey = this.#topKey() || "php";
    const ROOTS = { Script: "js", Document: "html", Template: "php", Program: "php", StyleSheet: "css" };
    let segs = [];
    for (let pos = 0;pos < len; pos++) {
      let n = tree.topNode;
      for (let ch = n.enter(pos, 1);ch; ch = ch.enter(pos, 1))
        n = ch;
      let lang = topKey;
      for (let x = n;x; x = x.parent)
        if (ROOTS[x.name]) {
          lang = x.name === "Script" && SQL_HOSTS[x.parent?.name] ? "sql" : ROOTS[x.name];
          break;
        }
      if (segs.length && segs[segs.length - 1].lang === lang)
        segs[segs.length - 1].to = pos + 1;
      else
        segs.push({ from: pos, to: pos + 1, lang });
    }
    return segs;
  }
  #mixedFlag = false;
  #docInfo(state) {
    let tree = this.#cm.syntaxTree(state);
    if (this.#projCache?.doc !== state.doc || this.#projCache?.tree !== tree) {
      let segs = this.#segments(state);
      tree = this.#cm.syntaxTree(state);
      this.#projCache = { doc: state.doc, tree, segs, projections: {} };
      if (segs)
        this.#mixedFlag = segs.some((s) => s.lang !== (this.#topKey() || "php"));
    }
    return this.#projCache;
  }
  #codeFor(state, key) {
    if (key === this.#topKey() || !this.view)
      return state.doc.toString();
    if (state.doc.length > CodeEditor2.#PROJECTION_CAP)
      return null;
    let info = this.#docInfo(state);
    if (info.segs === null)
      return null;
    if (info.projections[key] === undefined) {
      let src = state.doc.toString();
      let out = "";
      let segs = info.segs;
      for (let i = 0;i < segs.length; i++) {
        let s = segs[i];
        if (s.lang === key) {
          out += src.slice(s.from, s.to);
          continue;
        }
        let blank = src.slice(s.from, s.to).replace(/[^\n]/g, " ");
        if (this.#isIsland(segs, i, key)) {
          let c = blank.search(/ /);
          if (c > -1)
            blank = blank.slice(0, c) + "0" + blank.slice(c + 1);
        }
        out += blank;
      }
      info.projections[key] = out;
    }
    return info.projections[key];
  }
  #isIsland(segs, i, key) {
    return segs[i].lang === (this.#topKey() || "php") && (segs[i - 1]?.lang === key || segs[i + 1]?.lang === key);
  }
  #filterForeignDiagnostics(state, key, diags) {
    if (key === this.#topKey())
      return diags;
    let segs = this.#docInfo(state).segs;
    if (segs === null)
      return [];
    return diags.filter((d) => {
      let inOwn = false;
      for (let i = 0;i < segs.length; i++) {
        let s = segs[i];
        if (this.#isIsland(segs, i, key) && d.from <= s.to && d.to >= s.from)
          return false;
        if (s.lang === key && d.from < s.to && d.to > s.from)
          inOwn = true;
      }
      return inOwn;
    });
  }
  #isMixed(state) {
    if (!this.view || this.#topKey() === null)
      return false;
    if (state.doc.length > CodeEditor2.#PROJECTION_CAP)
      return this.#topKey() === "php";
    this.#docInfo(state);
    return this.#mixedFlag;
  }
  #sqlActiveAt(state, pos) {
    let cm = this.#cm;
    return [cm.StandardSQL, cm.MariaSQL, cm.SQLite].some((d) => d.language.isActiveAt(state, pos));
  }
  #sqlHover(state, pos) {
    let schema = this.#sqlConfig?.schema;
    if (!schema)
      return null;
    let word = state.wordAt(pos);
    if (!word)
      return null;
    let name = state.sliceDoc(word.from, word.to).toLowerCase();
    let tableOf = [];
    for (let [table, cols] of Object.entries(schema)) {
      if (table.toLowerCase() === name) {
        let list = cols.slice(0, 24).join(", ") + (cols.length > 24 ? ", …" : "");
        return {
          from: word.from,
          to: word.to,
          contents: `Table ${table} — ${cols.length} column${cols.length === 1 ? "" : "s"}
${list}`
        };
      }
      if (cols.some((col) => col.toLowerCase() === name))
        tableOf.push(table);
    }
    if (tableOf.length)
      return { from: word.from, to: word.to, contents: "Column of " + tableOf.slice(0, 8).join(", ") + (tableOf.length > 8 ? ` (+${tableOf.length - 8} more)` : "") };
    return null;
  }
  #sqlRegions(state) {
    if (this.language === Language.Sql)
      return [{ from: 0, text: state.doc.toString() }];
    if (this.#topKey() === null || state.doc.length > CodeEditor2.#PROJECTION_CAP)
      return [];
    let info = this.#docInfo(state);
    if (!info.segs)
      return [];
    if (!info.sqlRegions) {
      let src = state.doc.toString();
      let regions = info.sqlRegions = [];
      let segs = info.segs;
      for (let i = 0;i < segs.length; i++) {
        if (segs[i].lang !== "sql")
          continue;
        let from = segs[i].from;
        let text = src.slice(segs[i].from, segs[i].to);
        while (true) {
          let j = i + 1;
          while (j < segs.length && segs[j].lang !== "sql")
            j++;
          if (j >= segs.length || !this.#sameString(state, segs[i].to, segs[j].to))
            break;
          let gap = src.slice(segs[i].to, segs[j].from).replace(/[^\n]/g, " ");
          text += "0" + gap.slice(1) + src.slice(segs[j].from, segs[j].to);
          i = j;
        }
        regions.push({ from, text });
      }
    }
    return info.sqlRegions;
  }
  #sameString(state, gapPos, needTo) {
    let n = this.#cm.syntaxTree(state).topNode;
    for (let ch = n.enter(gapPos, 1);ch; ch = ch.enter(gapPos, 1))
      n = ch;
    for (let x = n;x; x = x.parent)
      if (SQL_HOSTS[x.name] && x.to >= needTo)
        return true;
    return false;
  }
  #sqlDiagnostics(state) {
    let out = [];
    let sqlLanguage = getChain(this.#cm).sqlLanguage;
    let schema = this.#sqlConfig?.schema;
    let tables = schema && Object.keys(schema).length ? new Set(Object.keys(schema).map((t) => t.toLowerCase())) : null;
    const TABLE_AFTER = { from: 1, join: 1, into: 1, update: 1 };
    for (let region of this.#sqlRegions(state)) {
      let tokens = [];
      let c = sqlLanguage.parser.parse(region.text).cursor();
      let skipTo = -1;
      do {
        if (c.from < skipTo)
          continue;
        if (c.name === "CompositeIdentifier") {
          tokens.push({ name: "Composite", from: c.from, to: c.to });
          skipTo = c.to;
        } else if (!c.node.firstChild)
          tokens.push({ name: c.name, from: c.from, to: c.to });
      } while (c.next());
      let text = (i) => region.text.slice(tokens[i].from, tokens[i].to).toLowerCase();
      let ctes = new Set;
      for (let i = 0;i + 2 < tokens.length; i++)
        if (tokens[i].name === "Identifier" && tokens[i + 1].name === "Keyword" && text(i + 1) === "as" && tokens[i + 2].name === "(")
          ctes.add(text(i));
      for (let i = 0;i < tokens.length; i++) {
        let t = tokens[i];
        if (t.name === "⚠")
          out.push({
            from: region.from + t.from,
            severity: "error",
            message: "SQL syntax error",
            to: region.from + Math.min(Math.max(t.to, t.from + 1), region.text.length)
          });
        else if (tables && (t.name === "Identifier" || t.name === "QuotedIdentifier") && i > 0 && tokens[i - 1].name === "Keyword" && TABLE_AFTER[text(i - 1)] && !(text(i - 1) === "update" && i > 1 && tokens[i - 2].name === "Keyword" && text(i - 2) === "key")) {
          let name = text(i).replace(/^[`"]|[`"]$/g, "");
          if (!tables.has(name) && !ctes.has(name))
            out.push({
              from: region.from + t.from,
              to: region.from + t.to,
              severity: "warning",
              message: `Unknown table '${name}'`
            });
        }
      }
    }
    return out;
  }
  #intelServices = [];
  #refreshListener = null;
  #extendedIntel(byLanguage) {
    let cm = this.#cm;
    let ext = [];
    this.#intelServices = byLanguage;
    let hasAny = (member) => byLanguage.some(([, svc]) => svc[member]);
    let fresh = (view, doc) => view.dom.isConnected && view.state.doc === doc;
    this.#refreshListener ??= () => this.view && this.view.dispatch({ effects: this.#compartments.intel.reconfigure(this.#intelExtensions()) });
    for (let [, svc] of byLanguage)
      svc.onRefresh?.(this.#refreshListener);
    if (hasAny("signatureHelp")) {
      let setSig = cm.StateEffect.define();
      let sigField = cm.StateField.define({
        create: () => null,
        update: (tip, tr) => {
          for (let e of tr.effects)
            if (e.is(setSig))
              tip = e.value;
          return tip && tr.docChanged ? { ...tip, pos: tr.changes.mapPos(tip.pos) } : tip;
        },
        provide: (f) => cm.showTooltip.from(f)
      });
      let active = false, timer = null;
      let close = (view) => {
        active = false;
        view.dispatch({ effects: setSig.of(null) });
      };
      let query = (view) => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          let doc = view.state.doc;
          let pos = view.state.selection.main.head;
          let [svc, key] = this.#serviceAt(view.state, pos) || [null, ""];
          let code = svc?.signatureHelp ? this.#codeFor(view.state, key) : null;
          if (code === null)
            return;
          let help = await svc.signatureHelp({ code, pos });
          if (!fresh(view, doc) || pos !== view.state.selection.main.head)
            return;
          if (!help?.signatures?.length)
            return active && close(view);
          active = true;
          view.dispatch({ effects: setSig.of({ pos, above: true, create: () => {
            let dom = document.createElement("div");
            dom.className = "ce2-signature";
            let sig = help.signatures[help.activeSignature] || help.signatures[0];
            let param = sig.params?.[help.activeParameter];
            if (param) {
              let b = document.createElement("b");
              b.textContent = sig.label.slice(param.start, param.end);
              dom.append(sig.label.slice(0, param.start), b, sig.label.slice(param.end));
            } else
              dom.textContent = sig.label;
            return { dom };
          } }) });
        }, 120);
      };
      ext.push(sigField);
      ext.push(cm.EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          let typed = "";
          update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => typed += inserted);
          if (/[(,]/.test(typed) || active)
            query(update.view);
        } else if (update.selectionSet && active)
          query(update.view);
      }));
      ext.push(cm.keymap.of([{ key: "Escape", run: (view) => {
        if (!active)
          return false;
        close(view);
        return true;
      } }]));
      ext.push(cm.EditorView.baseTheme({ ".ce2-signature": { padding: "2px 6px", whiteSpace: "pre-wrap", maxWidth: "50em" } }));
    }
    if (hasAny("highlights") && this.markOccurrences) {
      let setHl = cm.StateEffect.define();
      let mark = cm.Decoration.mark({ class: "ce2-occurrence" });
      let hlField = cm.StateField.define({
        create: () => cm.Decoration.none,
        update: (deco, tr) => {
          for (let e of tr.effects)
            if (e.is(setHl))
              return e.value;
          return tr.docChanged ? cm.Decoration.none : deco;
        },
        provide: (f) => cm.EditorView.decorations.from(f)
      });
      let timer = null;
      ext.push(hlField, cm.EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged)
          return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          let view = update.view;
          let doc = view.state.doc;
          let sel = view.state.selection.main;
          let [svc, key] = (sel.empty ? this.#serviceAt(view.state, sel.head) : null) || [null, ""];
          let code = svc?.highlights && view.dom.isConnected ? this.#codeFor(view.state, key) : null;
          if (code === null)
            return;
          let spans = await svc.highlights({ code, pos: sel.head }) || [];
          if (!fresh(view, doc))
            return;
          view.dispatch({ effects: setHl.of(cm.Decoration.set(spans.filter((s) => s.to > s.from).sort((a, b) => a.from - b.from).map((s) => mark.range(s.from, s.to)))) });
        }, 300);
      }));
      ext.push(cm.EditorView.baseTheme({ ".ce2-occurrence": { backgroundColor: "rgba(127, 127, 127, .22)" } }));
    }
    if (hasAny("rename"))
      ext.push(cm.keymap.of([{ key: "F2", run: (view) => {
        let pos = view.state.selection.main.head;
        let [svc, key] = this.#serviceAt(view.state, pos) || [null, ""];
        let code = svc?.rename ? this.#codeFor(view.state, key) : null;
        if (code === null)
          return false;
        let word = view.state.wordAt(pos);
        let newName = prompt("Rename to:", word ? view.state.sliceDoc(word.from, word.to) : "");
        if (!newName)
          return true;
        let doc = view.state.doc;
        let segs = key === this.#topKey() ? null : this.#docInfo(view.state).segs;
        svc.rename({ code, pos, newName }).then((edits) => {
          if (segs)
            edits = edits?.filter((e) => segs.some((s) => s.lang === key && e.from >= s.from && e.to <= s.to));
          if (edits?.length && fresh(view, doc))
            view.dispatch({ changes: edits });
        });
        return true;
      } }]));
    if (this.onGoToDefinition && hasAny("definition")) {
      let go = (view, pos) => {
        let [svc, key] = this.#serviceAt(view.state, pos) || [null, ""];
        let code = svc?.definition ? this.#codeFor(view.state, key) : null;
        if (code === null)
          return;
        svc.definition({ code, pos }).then((defs) => {
          if (defs?.length)
            this.onGoToDefinition(defs, this);
        });
      };
      ext.push(cm.keymap.of([{ key: "F12", run: (view) => {
        go(view, view.state.selection.main.head);
        return true;
      } }]));
      ext.push(cm.EditorView.domEventHandlers({ mousedown: (e, view) => {
        if (!(e.ctrlKey || e.metaKey) || e.button !== 0)
          return false;
        let pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null)
          return false;
        go(view, pos);
        return true;
      } }));
    }
    ext.push(cm.keymap.of([{ key: "Mod-Shift-f", run: () => {
      this.format();
      return true;
    } }]));
    if ((this.inlayHints || CodeEditor2.userOptions.inlayHints) && hasAny("inlayHints")) {

      class HintWidget extends cm.WidgetType {
        label;
        constructor(label) {
          super();
          this.label = label;
        }
        eq(other) {
          return other.label === this.label;
        }
        toDOM() {
          let s = document.createElement("span");
          s.className = "ce2-inlay";
          s.textContent = this.label;
          return s;
        }
      }
      let setHints = cm.StateEffect.define();
      let hintField = cm.StateField.define({
        create: () => cm.Decoration.none,
        update: (deco, tr) => {
          for (let e of tr.effects)
            if (e.is(setHints))
              return e.value;
          return tr.docChanged ? deco.map(tr.changes) : deco;
        },
        provide: (f) => cm.EditorView.decorations.from(f)
      });
      let timer = null;
      let query = async (view) => {
        let doc = view.state.doc;
        let all = [];
        for (let [svc, key] of this.#servicesWith("inlayHints")) {
          let code = this.#codeFor(view.state, key);
          if (code === null)
            continue;
          let hints = await svc.inlayHints({ code, from: 0, to: code.length }) || [];
          if (key !== this.#topKey()) {
            let segs = this.#docInfo(view.state).segs;
            hints = segs ? hints.filter((h) => segs.some((s) => s.lang === key && h.pos >= s.from && h.pos <= s.to)) : [];
          }
          all.push(...hints);
        }
        if (!fresh(view, doc))
          return;
        view.dispatch({ effects: setHints.of(cm.Decoration.set(all.sort((a, b) => a.pos - b.pos).map((h) => cm.Decoration.widget({ widget: new HintWidget(h.label), side: 1 }).range(h.pos)), true)) });
      };
      ext.push(hintField, cm.EditorView.updateListener.of((update) => {
        if (!update.docChanged)
          return;
        clearTimeout(timer);
        timer = setTimeout(() => query(update.view), this.lintDelay);
      }));
      ext.push(cm.EditorView.baseTheme({ ".ce2-inlay": { opacity: ".55", fontSize: "85%", padding: "0 .15em" } }));
      setTimeout(() => this.view && query(this.view));
    }
    if (CodeEditor2.userOptions.linkedTags && hasAny("linkedEditing")) {
      let linked = null;
      let mirroring = false;
      let timer = null;
      ext.push(cm.EditorView.updateListener.of((update) => {
        if (mirroring)
          return;
        if (update.docChanged && linked) {
          let [a, b] = linked;
          let single = null, count = 0;
          update.changes.iterChanges((fromA, toA) => {
            count++;
            single = { from: fromA, to: toA };
          });
          let inA = single && single.from >= a.from && single.to <= a.to;
          let inB = single && single.from >= b.from && single.to <= b.to;
          if (count === 1 && inA !== inB) {
            let map = (r) => ({ from: update.changes.mapPos(r.from, -1), to: update.changes.mapPos(r.to, 1) });
            let src = map(inA ? a : b), dst = map(inA ? b : a);
            let text = update.state.sliceDoc(src.from, src.to);
            if (update.state.sliceDoc(dst.from, dst.to) !== text) {
              mirroring = true;
              update.view.dispatch({ changes: { from: dst.from, to: dst.to, insert: text }, userEvent: "input.linked" });
              mirroring = false;
            }
          }
          linked = null;
        }
        if (!update.selectionSet && !update.docChanged)
          return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          let view = update.view;
          let doc = view.state.doc;
          let pos = view.state.selection.main.head;
          let [svc, key] = this.#serviceAt(view.state, pos) || [null, ""];
          let code = svc?.linkedEditing ? this.#codeFor(view.state, key) : null;
          if (code === null)
            return;
          let ranges = await svc.linkedEditing({ code, pos });
          if (!fresh(view, doc))
            return;
          linked = ranges?.length === 2 ? ranges : null;
        }, 150);
      }));
    }
    return ext;
  }
  async format() {
    await this.ready;
    if (!this.view)
      return;
    let cm = this.#cm;
    let state = this.view.state;
    let doc = state.doc;
    let svc = this.#topService();
    if (!this.#isMixed(state)) {
      if (svc?.format) {
        let edits = await svc.format(doc.toString());
        if (edits?.length && this.view?.state.doc === doc)
          this.view.dispatch({ changes: edits });
      } else {
        let changes = cm.indentRange(state, 0, doc.length);
        if (!changes.empty)
          this.view.dispatch({ changes });
      }
      return;
    }
    let segs = this.#docInfo(state).segs;
    if (!segs)
      return;
    let inSeg = (from, to, langs) => segs.some((s) => langs.includes(s.lang) && from >= s.from && to <= s.to);
    let changes = [];
    let jsSvc = this.services?.js;
    let reindent = jsSvc?.format ? ["php", "html", "css"] : ["php", "html", "css", "js"];
    cm.indentRange(state, 0, doc.length).iterChanges((fromA, toA, fromB, toB, inserted) => {
      if (inSeg(fromA, toA, reindent))
        changes.push({ from: fromA, to: toA, insert: inserted.toString() });
    });
    if (jsSvc?.format) {
      let code = this.#codeFor(state, "js");
      let edits = code === null ? [] : await jsSvc.format(code) || [];
      for (let e of edits)
        if (inSeg(e.from, e.to, ["js"]))
          changes.push(e);
    }
    if (changes.length && this.view?.state.doc === doc)
      this.view.dispatch({ changes });
  }
  #isDark() {
    return (this.ownerDocument || document).documentElement.hasAttribute("dark");
  }
  get value() {
    return this.view ? this.view.state.doc.toString() : this.#value;
  }
  set value(val) {
    val = String(val ?? "");
    if (this.view) {
      this.#suppressChange = true;
      this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: val } });
      this.#suppressChange = false;
    } else {
      this.#value = val;
      this.placeholder.textContent = val;
    }
  }
  undo() {
    if (this.view)
      this.#cm.undo(this.view);
  }
  redo() {
    if (this.view)
      this.#cm.redo(this.view);
  }
  canUndo() {
    return !!this.view && this.#cm.undoDepth(this.view.state) > 0;
  }
  canRedo() {
    return !!this.view && this.#cm.redoDepth(this.view.state) > 0;
  }
  flushPending() {}
  applyExternal(from, to, insert) {
    if (!this.view) {
      this.#value = this.#value.slice(0, from) + insert + this.#value.slice(to);
      return;
    }
    let Transaction = this.view.state.update({}).constructor;
    this.#suppressChange = true;
    try {
      this.view.dispatch({
        changes: { from, to, insert },
        annotations: Transaction.addToHistory.of(false)
      });
    } finally {
      this.#suppressChange = false;
    }
  }
  async setLanguage(language) {
    this.language = normalizeLanguage(language);
    if (needsLanguageBundle(this.language))
      await loadLanguageBundle();
    await this.ready;
    this.view.dispatch({ effects: [
      this.#compartments.language.reconfigure(languageExtension(this.#cm, this.language, this.#sqlConfig)),
      this.#compartments.theme.reconfigure(this.#theme(this.language, this.#isDark())),
      this.#compartments.intel.reconfigure(this.#intelExtensions())
    ] });
  }
  setWordWrap(on) {
    this.wordWrap = on;
    if (this.view)
      this.view.dispatch({ effects: this.#compartments.lineWrapping.reconfigure(on ? this.#cm.EditorView.lineWrapping : []) });
  }
  #readOnlyExt() {
    let cm = this.#cm;
    return this.readOnly ? [cm.EditorState.readOnly.of(true), cm.EditorView.editable.of(false)] : [];
  }
  setReadOnly(on) {
    this.readOnly = on;
    if (this.view)
      this.view.dispatch({ effects: this.#compartments.readOnly.reconfigure(this.#readOnlyExt()) });
  }
  setMarkOccurrences(on) {
    this.markOccurrences = on;
    if (this.view)
      this.view.dispatch({ effects: this.#compartments.intel.reconfigure(this.#intelExtensions()) });
  }
  setTabSize(size) {
    this.tabSize = size;
    if (this.view)
      this.view.dispatch({ effects: this.#compartments.tabSize.reconfigure(this.#cm.EditorState.tabSize.of(size)) });
  }
  focus() {
    this.view?.focus();
  }
  updateTheme() {
    if (this.view)
      this.view.dispatch({ effects: this.#compartments.theme.reconfigure(this.#theme(this.language, this.#isDark())) });
  }
  connectedCallback() {
    super.connectedCallback?.();
    instances.add(this);
    watchDarkMode(this.ownerDocument || document);
  }
  disconnectedCallback() {
    super.disconnectedCallback?.();
    instances.delete(this);
  }
  render(fields = null, changed = true) {
    h(this)`
		<code-editor-2>
			<style>
				:host { position: relative; flex-direction: column; min-width: 0; min-height: 0;
					&:not([hidden]) { display: flex }

					&.ce2-docs-hidden .cm-tooltip.cm-completionInfo { display: none }

					[data-id=placeholder] { margin: 0; min-height: 3em; padding-left: 32px; white-space: pre; overflow: auto;
						font-family: Hack, monospace } /* Same font/metrics as .cm-scroller so mounting doesn't shift layout. */

					/* Flex the whole chain (host → editor → .cm-editor → .cm-scroller) rather than
					   height:100%, so the scroller bounds and scrolls even when the host has only a
					   max-height and no definite height (e.g. the environment page's max-height:70vh). */
					[data-id=editor] { flex: 1 1 auto; width: 100%; min-height: 0; display: flex; flex-direction: column;
						.cm-editor { flex: 1 1 auto; width: 100%; min-height: 0; display: flex; flex-direction: column }
					}
					/* Family only — size inherits from the embedding context; tune with font-size on the element. */
				.cm-scroller { overflow: auto; min-height: 10px; flex: 1 1 auto; width: 100%; font-family: Hack, monospace !important }

					/* Remove outline added by CodeMirror on focus. */
					[data-id=editor] .cm-editor.cm-focused { outline: none }

					/* 'number' display: diagnostics color the line-number BACKGROUND (a foreground tint is
					   too easy to miss) — hover the number for detail.  Solid fills with white text so a
					   flagged line reads at a glance and wins over the active-line gutter highlight in both
					   themes (the warning amber is darkened enough for white to stay legible). */
					.cm-lineNumbers .cm-gutterElement.ce2-lnum-error { background: #e5484d; color: #fff; font-weight: 600 }
					.cm-lineNumbers .cm-gutterElement.ce2-lnum-warning { background: #b9820e; color: #fff; font-weight: 600 }
					.cm-lineNumbers .cm-gutterElement.ce2-lnum-info { background: #6a89b0; color: #fff; font-weight: 600 }
					.ce2-lnum-tip { padding: 4px 8px; font: .9em Arial; max-width: 40em; white-space: pre-wrap }
					.ce2-lnum-tip > div + div { margin-top: 3px }
					.ce2-lnum-tip-error { color: #e5484d }
					.ce2-lnum-tip-warning { color: #d5a022 }
					.ce2-lnum-tip-info { color: #6a89b0 }

					/* 'stripe' display: reuse cm.lintGutter() but replace its per-line icon (a
					   backgroundImage SVG) with a thin, solid, full-height severity-colored rectangle —
					   no symbol, no rounded corners.  Hover the bar for detail (lintGutter's own tooltip). */
					.cm-gutter-lint { width: 6px; padding: 0 }
					.cm-gutter-lint .cm-gutterElement { padding: 0; display: flex; justify-content: center; align-items: stretch }
					.cm-gutter-lint .cm-lint-marker { width: 4px; border-radius: 0; background-image: none }
					.cm-gutter-lint .cm-lint-marker svg { display: none }
					.cm-gutter-lint .cm-lint-marker-error { background-color: #e5484d }
					.cm-gutter-lint .cm-lint-marker-warning { background-color: #b9820e }
					.cm-gutter-lint .cm-lint-marker-info { background-color: #6a89b0 }

					/* Search panel styles */
					.cm-panels.cm-panels-bottom { border-top: var(--border, 1px solid #cbcfd7) }
					.cm-panels { background-color: var(--background, white) !important; color: var(--text, #333) !important }
				}
			</style>
			<pre data-id="placeholder">${this.#value}</pre>
			<div data-id="editor" class="column"></div>
		</code-editor-2>`;
  }
}
let cmPromise = null;
function loadCodeMirror() {
  cmPromise ??= Promise.all([
    import("../codemirror/codemirror6b.js"),
    import("../codemirror/CodeMirrorThemeSolarIce.js")
  ]).then(([cm, themeMod]) => ({ cm, theme: (lang, isDark) => themeMod.default(cm, lang, isDark) }));
  return cmPromise;
}
const PRIMARY_LANGS = new Set([
  Language.Php,
  Language.Html,
  Language.JavaScript,
  Language.TypeScript,
  Language.Css,
  Language.Sql,
  Language.Json,
  Language.Markdown,
  Language.Apache
]);
function needsLanguageBundle(language) {
  return !!language && !PRIMARY_LANGS.has(language);
}
let cmLangs = null;
let cmLangsPromise = null;
function loadLanguageBundle() {
  cmLangsPromise ??= import("../codemirror/codemirror6b-langs.js").then((m) => cmLangs = m);
  return cmLangsPromise;
}
let chain = null;
const SQL_HEAD = new RegExp("^\\s*(?:" + [
  "select",
  "with",
  "explain",
  "describe",
  "grant",
  "revoke",
  "call",
  "pragma",
  "truncate",
  "update\\s+\\S+\\s+set",
  "delete\\s+from",
  "insert\\s+(?:into|ignore)",
  "replace\\s+into",
  "create\\s+(?:or\\s+replace|table|temp|temporary|view|index|unique|trigger|database)",
  "drop\\s+(?:table|view|index|trigger|database)",
  "alter\\s+table",
  "show\\s+(?:tables|columns|databases|create|status|variables|index|grants|processlist|full)"
].join("|") + ")\\b", "i");
const SQL_DIALECTS = ["StandardSQL", "MariaSQL", "SQLite"];
const SQL_HOSTS = { TemplateString: 1, String: 1, HeredocString: 1 };
function sqlStringMount(sqlParser, node, input) {
  if (node.to - node.from > 1e5)
    return null;
  let head = input.read(node.from, Math.min(node.to, node.from + 300));
  let bodyStart, bodyEnd;
  if (node.name === "HeredocString") {
    let m = /^<<<[ \t]*["']?\w+["']?\r?\n/.exec(head);
    if (!m)
      return null;
    bodyStart = node.from + m[0].length;
    let lastNl = input.read(node.from, node.to).lastIndexOf(`
`);
    bodyEnd = lastNl >= m[0].length ? node.from + lastNl : node.to;
  } else {
    let q = head[0];
    if (q !== "`" && q !== "'" && q !== '"')
      return null;
    bodyStart = node.from + 1;
    bodyEnd = node.to - (node.to - node.from > 1 && input.read(node.to - 1, node.to) === q ? 1 : 0);
  }
  if (bodyStart >= bodyEnd || !SQL_HEAD.test(input.read(bodyStart, Math.min(bodyEnd, bodyStart + 300))))
    return null;
  let holes = [];
  if (node.name === "HeredocString") {
    if (!/^<<<[ \t]*'/.test(head)) {
      let body = input.read(bodyStart, bodyEnd);
      let re = /\{\$[^}\n]*\}|\$\{[^}\n]*\}|\$[a-zA-Z_]\w*(?:\[[^\]\n]*\]|->\w+)*/g;
      for (let m;m = re.exec(body); )
        holes.push({ from: bodyStart + m.index, to: bodyStart + m.index + m[0].length });
    }
  } else
    for (let ch = node.node.firstChild;ch; ch = ch.nextSibling)
      if (ch.name === "Interpolation" || ch.name === "VariableName")
        holes.push({ from: ch.from, to: ch.to });
  let ranges = [];
  let pos = bodyStart;
  for (let h of holes) {
    if (pos < h.from)
      ranges.push({ from: pos, to: Math.min(h.from, bodyEnd) });
    pos = Math.max(pos, h.to);
  }
  if (pos < bodyEnd)
    ranges.push({ from: pos, to: bodyEnd });
  return ranges.length ? { parser: sqlParser, overlay: ranges } : null;
}
function getChain(cm) {
  let dialectName = SQL_DIALECTS.includes(CodeEditor2.userOptions.sqlDialect) ? CodeEditor2.userOptions.sqlDialect : "StandardSQL";
  if (!chain || chain.dialectName !== dialectName) {
    let sqlDialect = cm[dialectName];
    let sqlParser = sqlDialect.language.parser;
    let customHtmlParser = null;
    const htmlHead = /^`(?:\s|\$\{[^{}]*\})*</;
    let templateWrap = cm.parseMixed((node, input) => {
      if (node.name !== "TemplateString")
        return null;
      if (!htmlHead.test(input.read(node.from, Math.min(node.to, node.from + 300))))
        return sqlStringMount(sqlParser, node, input);
      let ranges = [];
      let pos = node.from + 1;
      for (let interp of node.node.getChildren("Interpolation")) {
        if (pos < interp.from)
          ranges.push({ from: pos, to: interp.from });
        pos = interp.to;
      }
      let end = node.to - (input.read(node.to - 1, node.to) === "`" ? 1 : 0);
      if (pos < end)
        ranges.push({ from: pos, to: end });
      return ranges.length ? { parser: customHtmlParser, overlay: ranges } : null;
    });
    let jsLanguage = cm.javascriptLanguage.configure({ wrap: templateWrap });
    let htmlSupport = cm.html({ nestedLanguages: [{
      tag: "script",
      attrs: (attrs) => !attrs.type || /^(?:text|application)\/(?:x-)?(?:java|ecma)script$|^module$|^$/i.test(attrs.type),
      parser: jsLanguage.parser
    }] });
    customHtmlParser = htmlSupport.language.parser;
    let phpWrap = cm.parseMixed((node, input) => {
      if (node.type.isTop)
        return { parser: customHtmlParser, overlay: (n) => n.name === "Text" };
      if (node.name === "String" || node.name === "HeredocString")
        return sqlStringMount(sqlParser, node, input);
      return null;
    });
    let phpSupport = new cm.LanguageSupport(cm.phpLanguage.configure({ wrap: phpWrap, top: "Template" }));
    let tsSupport = cm.javascript({ typescript: true });
    chain = { jsLanguage, htmlSupport, phpSupport, tsSupport, sqlDialect, sqlLanguage: sqlDialect.language, dialectName };
  }
  return chain;
}
const STREAM_MODES = {
  [Language.CSharp]: "csharp",
  [Language.Kotlin]: "kotlin",
  [Language.Swift]: "swift",
  [Language.Shell]: "shell",
  [Language.PowerShell]: "powerShell",
  [Language.Perl]: "perl",
  [Language.Ruby]: "ruby",
  [Language.Lua]: "lua",
  [Language.Toml]: "toml",
  [Language.Dockerfile]: "dockerFile",
  [Language.Nginx]: "nginx",
  [Language.Diff]: "diff",
  [Language.Properties]: "properties",
  [Language.D]: "d",
  [Language.Glsl]: "shader",
  [Language.ObjectiveCpp]: "objectiveCpp",
  [Language.Lisp]: "commonLisp",
  [Language.CoffeeScript]: "coffeeScript",
  [Language.Clojure]: "clojure",
  [Language.Haskell]: "haskell",
  [Language.Groovy]: "groovy",
  [Language.Haxe]: "haxe",
  [Language.Pascal]: "pascal",
  [Language.R]: "r",
  [Language.Scheme]: "scheme",
  [Language.Smalltalk]: "smalltalk",
  [Language.Tcl]: "tcl",
  [Language.VB]: "vb",
  [Language.VBScript]: "vbScript",
  [Language.CMake]: "cmake",
  [Language.Protobuf]: "protobuf",
  [Language.Http]: "http",
  [Language.Assembly]: "gas",
  [Language.Verilog]: "verilog",
  [Language.Vhdl]: "vhdl",
  [Language.Latex]: "stex",
  [Language.Mathematica]: "mathematica",
  [Language.Octave]: "octave",
  [Language.OCaml]: "oCaml",
  [Language.FSharp]: "fSharp",
  [Language.Sml]: "sml"
};
let streamLanguages = {};
function streamLanguage(cm, name) {
  return streamLanguages[name] ??= cm.StreamLanguage.define(cmLangs[name]);
}
function languageExtension(cm, language, config) {
  let c = getChain(cm);
  let nestedSql = config ? cm.sql({ ...config, dialect: c.sqlDialect }).support : [];
  switch (language) {
    case Language.Php:
      return [c.phpSupport, c.htmlSupport.support, nestedSql];
    case Language.Html:
      return [c.htmlSupport, nestedSql];
    case Language.JavaScript:
      return [c.jsLanguage, cm.javascript().support, nestedSql];
    case Language.TypeScript:
      return [c.tsSupport, nestedSql];
    case Language.Css:
      return [cm.css()];
    case Language.Sql: {
      let cfg = { ...config || {} };
      cfg.dialect = typeof cfg.dialect === "string" ? { MariaSQL: cm.MariaSQL, SQLite: cm.SQLite, StandardSQL: cm.StandardSQL }[cfg.dialect] : cfg.dialect || c.sqlDialect;
      return [cm.sql(cfg)];
    }
    case Language.Json:
      return [cm.json()];
    case Language.Markdown:
      return [cm.markdown()];
    case Language.Apache:
      return [streamLanguage(cm, "apache")];
    case Language.Python:
      return cmLangs ? [cmLangs.python()] : [];
    case Language.Cpp:
      return cmLangs ? [cmLangs.cpp()] : [];
    case Language.Rust:
      return cmLangs ? [cmLangs.rust()] : [];
    case Language.Java:
      return cmLangs ? [cmLangs.java()] : [];
    case Language.Go:
      return cmLangs ? [cmLangs.go()] : [];
    case Language.Xml:
      return cmLangs ? [cmLangs.xml()] : [];
    case Language.Yaml:
      return cmLangs ? [cmLangs.yaml()] : [];
    case Language.Vue:
      return cmLangs ? [cmLangs.vue()] : [];
    case Language.Angular:
      return cmLangs ? [cmLangs.angular()] : [];
    case Language.Zig:
      return cmLangs ? [cmLangs.zig()] : [];
    case Language.Wast:
      return cmLangs ? [cmLangs.wast()] : [];
    case Language.Wgsl:
      return cmLangs ? [cmLangs.wgsl()] : [];
    default:
      if (STREAM_MODES[language])
        return cmLangs ? [streamLanguage(cm, STREAM_MODES[language])] : [];
      return [];
  }
}
function normalizeLanguage(input) {
  if (!input)
    return null;
  let lower = String(input).toLowerCase();
  for (let name in Language)
    if (typeof Language[name] === "string" && name.toLowerCase() === lower)
      return Language[name];
  return Language.fromExtension(String(input));
}
const instances = new Set;
const watchedDocuments = new Set;
function watchDarkMode(doc) {
  if (watchedDocuments.has(doc))
    return;
  watchedDocuments.add(doc);
  new MutationObserver((mutations) => {
    for (let m of mutations)
      if (m.attributeName === "dark") {
        for (let editor of instances)
          if (editor.ownerDocument === doc)
            editor.updateTheme();
        break;
      }
  }).observe(doc.documentElement, { attributes: true });
}
CodeEditor2.define("code-editor-2");
