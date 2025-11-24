/**
 * Solarite JavaScript UI library.
 * MIT License
 * https://vorticode.github.io/solarite/
 */

export default function h(htmlStrings?: HTMLElement | string | string[] | TemplateStringsArray | Function | {render: Function}, ...exprs: any[]): Node | HTMLElement | Template | Function;
export function toEl(htmlOrTemplate: string|Template|{render:()=>void}) : Node|HTMLElement|DocumentFragment;

// Deprecated:
export function t(html: string): Template;


export const ArgType: {
	Bool: string;
	Int: string;
	Float: string;
	String: string;
	Json: string;
	Eval: string;
}

export function getArg(el:HTMLElement, attributeName:string, defaultValue?:any,
	type?:typeof ArgType[keyof typeof ArgType] | Function | any[], fallback?:any): any;

export interface RenderOptions {
    styles?: boolean;
    scripts?: boolean;
    ids?: boolean;
    render?: boolean;
}

export class Template {
    exprs: (Template|string|Function)[];
    html: string[];
    constructor(htmlStrings: string[], exprs: any[]);
    render(el?: HTMLElement, options?: RenderOptions): DocumentFragment | HTMLElement | null;
    getExactKey(): string;
    getCloseKey(): string;
}

export function delve(obj: object, path: string[], createVal?: any): any;



// Experimental:
//--------------

// Globals object
export const Globals: {
    //componentArgsHash: WeakMap<any, any>;
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

