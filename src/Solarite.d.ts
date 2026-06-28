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
	/** Render a list, reusing each item's DOM while the item is the SAME object; replace an item
	 *  (don't mutate it) to re-render it.  fn runs only for new items.  No deps: identity is the dep. */
	function map<T>(items:T[], fn:(item:T) => Template): Template[];

	/** Alias of h.map with a name that flags the immutability contract at the call site. */
	function immutableMap<T>(items:T[], fn:(item:T) => Template): Template[];
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

/**
 * Read an element's html attributes onto fields that already exist on the element, to
 * support plain-html instantiation like `<my-timer duration="7" auto-start>`.
 *
 * Attribute names convert from kebab-case to camelCase.  A `${...}` attribute is JSON-parsed
 * back to its original type.  Every other attribute value is a string: if its field is named
 * in `types`, the string is cast with that converter, otherwise it's assigned as a string.
 *
 * `types` maps a field name to a converter: Number, Boolean, String, Date, or any function
 * taking the string and returning a value.  Boolean is true for any string except 'false'
 * and '0', so a bare attribute reads as true.  Field names in `ignore` are skipped. */
export function assignAttributes(dest: HTMLElement, types?: Record<string, Function>, ignore?: string[]): void;

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

