import { Template } from './Solarite';

export function jsxTemplate(strings: string[], ...exprs: any[]): Template;
export function jsxAttr(name: string, value: any): any;
export function jsxEscape(value: any): any;
export function jsx(tag: any, props: any, key?: any): Template;
export function jsxs(tag: any, props: any, key?: any): Template;
export function jsxDEV(tag: any, props: any, key?: any): Template;
export const Fragment: unique symbol;

/**
 * Types for `tsconfig` / `deno.json` with `jsx: "react-jsx" | "precompile"` and
 * `jsxImportSource: "solarite"`.  IntrinsicElements is intentionally permissive for now: any
 * lowercase tag with any attributes is allowed.  A JSX expression evaluates to a Solarite Template. */
export namespace JSX {
	type Element = Template;
	interface ElementChildrenAttribute { children: {}; }
	interface IntrinsicElements {
		[tagName: string]: any;
	}
}
