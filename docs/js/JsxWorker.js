import ts from './vendor/typescript.esm.js';

/**
 * Compile JSX to JavaScript off the main thread, with the same settings the documentation gives for a tsconfig.json:
 * the automatic JSX runtime, imported from Solarite.  The file is named .tsx only so TypeScript parses JSX in it. */
onmessage = ({data: {id, code}}) => {
  const result = ts.transpileModule(code, {fileName: 'shopping-list.tsx', compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, jsxImportSource: 'solarite',
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}});
  postMessage({id, code: result.outputText});
};
