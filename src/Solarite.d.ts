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
}

/**
 * Tagged template literal or function for creating Templates and rendering to the DOM. */
declare function h(htmlStrings: TemplateStringsArray, ...exprs: any[]): Template;
declare function h(htmlStrings: string | string[], ...exprs: any[]): Template;
declare function h(el: HTMLElement | DocumentFragment, options?: RenderOptions): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => HTMLElement | DocumentFragment;
declare function h(el: HTMLElement | DocumentFragment, template: Template, options?: RenderOptions): void;
declare function h(tag: string, props: object, ...children: any[]): Template; // JSX
declare function h(obj: {render: Function}): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => void; // Rebound render
declare function h(): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => Node|DocumentFragment;

export default h;
export {h};
export {h as r}; // deprecated

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

/**
 * Assign fields from `src` to `dest` if they exist in `dest` and don't exist in `ignore`.
 * When a value in `src` is a string and the existing value in `dest` is a boolean, number, or Date,
 * it will be converted to that type. */
export function assignFields(dest: object, src: object|null, ignore?: string[]): void;

/**
 * @deprecated
 * Retrieve and cast an attribute value from an HTMLElement. */
export function getArg(el: HTMLElement, attributeName: string, defaultValue?: any,
    type?: typeof ArgType[keyof typeof ArgType] | Function | any[]): any;

/**
 * @deprecated
 * Update attributes on an element from an object. */
export function setArgs(el: HTMLElement, args: object): void;

/** @deprecated */
export const ArgType: {
    Bool: string;
    Int: string;
    Float: string;
    String: string;
    Json: string;
    Eval: string;
}

export class Template {
    exprs: any[];
    html: string[];
    constructor(htmlStrings: string[], exprs: any[]);
    render(el?: HTMLElement | null, options?: RenderOptions): HTMLElement | DocumentFragment;
    getExactKey(): string;
    getCloseKey(): string;
    static fromJsx(tag: string, props: Record<string, any> | null, children: any[]): Template;
}

export function delve(obj: object, path: string[], createVal?: any): any;

/**
 * Internal utilities and state. */
export const Globals: {
    connected: WeakSet<HTMLElement>;
    currentPath: any;
    currentSlotChildren: any[] | null;
    div: HTMLDivElement;
    doc: Document;
    elementClasses: {[key: string]: typeof Node};
    htmlProps: {[key: string]: boolean};
    nodeEvents: WeakMap<Node, {[eventName: string]: [Function, Function, any[]]}>;
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

