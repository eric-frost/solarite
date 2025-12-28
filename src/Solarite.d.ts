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
 * Tagged template literal or function for creating Templates and rendering to the DOM.
 */
export default function h(htmlStrings: TemplateStringsArray, ...exprs: any[]): Template;
export default function h(htmlStrings: string | string[], ...exprs: any[]): Template;
export default function h(el: HTMLElement | DocumentFragment, options?: RenderOptions): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => HTMLElement | DocumentFragment;
export default function h(el: HTMLElement | DocumentFragment, template: Template, options?: RenderOptions): void;
export default function h(tag: string, props: object, ...children: any[]): Template; // JSX
export default function h(obj: {render: Function}): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => void; // Rebound render


/**
 * Convert a template, string, or object into a DOM Node or Element. */
export function toEl(arg: string | Template | {render: () => void}): Node | HTMLElement | DocumentFragment;

/**
 * Retrieve and cast an attribute value from an HTMLElement. */
export function getArg(el: HTMLElement, attributeName: string, defaultValue?: any,
    type?: typeof ArgType[keyof typeof ArgType] | Function | any[], fallback?: any): any;

/**
 * Update attributes on an element from an object. */
export function setArgs(el: HTMLElement, args: object): void;

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
}

export function delve(obj: object, path: string[], createVal?: any): any;

/**
 * Internal utilities and state.
 */
export const Globals: {
    connected: WeakSet<HTMLElement>;
    currentExprPath: any;
    div: HTMLDivElement;
    elementClasses: {[key: string]: typeof Node};
    htmlProps: {[key: string]: boolean};
    nodeEvents: WeakMap<Node, {[eventName: string]: [Function, Function, any[]]}>;
    nodeGroups: WeakMap<HTMLElement, any>;
    objToEl: WeakMap<any, any>;
    rendered: WeakSet<HTMLElement>;
    rendering: WeakSet<HTMLElement>;
    shells: WeakMap<string[], any>;
    reset: Function;
    count: number;
};

export const SolariteUtil: {
    camelToDashes(str: string): string;
    dashesToCamel(str: string): string;
    trimEmptyNodes(nodes: NodeList | Node[]): Node[];
    [key: string]: any;
};

