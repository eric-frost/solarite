/**
 * Solarite JavaScript UI library.
 * MIT License
 * https://vorticode.github.io/solarite/
 */

export interface RenderOptions {
    styles?: boolean;
    scripts?: boolean;
    ids?: boolean;
    render?: boolean;

    /** Defaults to true: bubbling events (click, input, etc.) dispatch from one document-level
     * listener instead of addEventListener per element - much faster creation and teardown
     * of large lists.  Pass false to bind every event directly, or an array to delegate only
     * the listed event names.  Non-bubbling events always bind directly.  Note: delegated
     * handlers run when the event reaches the document, so manual stopPropagation() on an
     * ancestor suppresses them, and manually added ancestor listeners fire first.  A
     * programmatically dispatched non-bubbling event won't reach delegated handlers. */
    eventDelegation?: boolean | string[];
}

/**
 * Tagged template literal or function for creating Templates and rendering to the DOM.
 *
 * The key attribute is reserved for keyed lists: `h`<tr key=${row.id}>...``
 * It must be a single whole-value expression on a top-level element; DOM node identity
 * then follows the key across re-renders (state preservation, minimal moves).
 * Static or mixed key values throw, and components never receive key as an arg. */
declare function h(htmlStrings: TemplateStringsArray, ...exprs: any[]): Template;
declare function h(htmlStrings: string | string[], ...exprs: any[]): Template;
declare function h(el: HTMLElement | DocumentFragment, options?: RenderOptions): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => HTMLElement | DocumentFragment;
declare function h(el: HTMLElement | DocumentFragment, template: Template, options?: RenderOptions): void;
declare function h(tag: string, props: object, ...children: any[]): Template; // JSX
declare function h(obj: {render: Function}): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => void; // Rebound render
declare function h(): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => Node|DocumentFragment;

declare namespace h {
	/** Memoize a Template by object identity; fn runs only when deps (===, shallow for arrays) changed. */
	function memo<T extends object>(obj:T, deps:any, fn:(obj:T) => Template): Template;
}

/** Tagged template literal for SVG markup and SVG child fragments. */
declare function svg(htmlStrings: TemplateStringsArray, ...exprs: any[]): Template;
declare function svg(htmlStrings: string | string[], ...exprs: any[]): Template;

export default h;
export {h, svg};

/**
 * Solarite provides more features if your web component extends Solarite instead of HTMLElement. */
export class Solarite extends HTMLElement {
    constructor(attribs?: Record<string, any> | null);
    render(attribs?: Record<string, any>, changed?:boolean): void;
    renderFirstTime(): void;
    connectedCallback(): void;
    static define(tagName?: string | null): void;
    static getAttribs(el: HTMLElement): Record<string, any>;
}


/**
 * Convert a template, string, or object into a DOM Node or Element. */
export function toEl(arg: string | Template | {render: () => void}): Node | HTMLElement | DocumentFragment;

/** An event binding registered by a two-way or event attribute, dispatchable via handleEvent(). */
export interface EventBinding {
	handleEvent(event: Event): any;
}

/** Get the EventBinding registered for a node+key, or undefined. */
export function getEventBinding(node: Node, key: string): EventBinding | undefined;

/** Cast targets for assignFields().  Each value equals its own string literal. */
export const Cast: {
	readonly int: 'int';
	readonly float: 'float';
	readonly number: 'number';
	readonly boolean: 'boolean';
	readonly string: 'string';
};

/**
 * Assign fields from `src` to `dest` if they exist in `dest`.
 *
 * `cast` is an optional record where the key is the field name.
 * - Ignore fields: Use `false` as the value.
 * - Basic Casting: Use `'int'`, `'float'`, `'number'`, `'boolean'`, `'string'`.
 * - Class Casting: Pass a class constructor or its string name to instantiate the field.
 * - Array Casting: Use `[Class]` or `'Class[]'`. The source must be an array.
 *
 * Auto-casting only applies to string sources: when a field has no `cast` entry and its
 * source value is a string, the string is cast to the destination field's current type
 * (number, boolean, or Date).  Non-string sources are assigned as-is unless an explicit
 * `cast` is given, and `null`/`undefined` are never coerced.
 *
 * If `strict` is true, throw when a `src` field is neither in `dest` nor ignored via `cast`. */
export function assignFields(dest: object, src: object|null, cast?: Record<string, string|Function|boolean|string[]|Function[]>, strict?: boolean): void;

export class Template {
    exprs: any[];
    html: string[];
    constructor(htmlStrings: string[], exprs: any[]);
    render(el?: HTMLElement | null, options?: RenderOptions): HTMLElement | DocumentFragment;
    getCloseKey(): string;
    static fromJsx(tag: string, props: Record<string, any> | null, children: any[]): Template;
}

export function delve(obj: object, path: string[], createVal?: any): any;

/**
 * Internal utilities and state. */
export const Globals: {
    connected: WeakSet<HTMLElement>;
    currentSlotChildren: any[] | null;
    div: HTMLDivElement;
    doc: Document;
    elementClasses: {[key: string]: typeof Node};
    htmlProps: {[key: string]: boolean};
    rootNodeGroups: WeakMap<HTMLElement, any>;
    objToEl: WeakMap<any, any>;
    rendered: WeakSet<HTMLElement>;
    shells: WeakMap<string[], any>;
    reset: Function;
};

export const SolariteUtil: {
    arraySame(a: any[], b: any[]): boolean;
    attribsToObject(el: HTMLElement, ignore?: string | null): Record<string, any>;
    bindId(root: any, el: HTMLElement): void;
    bindStyles(style: HTMLStyleElement, root: HTMLElement): void;
    camelToDashes(str: string): string;
    dashesToCamel(str: string): string;
    defineClass(Class: typeof HTMLElement, tagName?: string | null): void;
    isIterable(obj: any): boolean;
    trimEmptyNodes(nodes: NodeList | Node[]): Node[];
    [key: string]: any;
};

