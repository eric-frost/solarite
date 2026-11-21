/**
 * Solarite JavaScript UI library.
 * MIT License
 * https://eric-frost.github.io/solarite/
 */

export interface RenderOptions {
    styles?: boolean;
    scripts?: boolean;
    ids?: boolean;
    render?: boolean;

    /**
     * Delegate bubbling events (default true).  A handler is kept on its element, or for a list
     * row in the row's template, instead of being registered with addEventListener, and when an
     * event of that type starts, a capture-phase listener on the component root and the document
     * attaches a real listener to each element on the event's path that has one; the browser
     * then dispatches normally.  Much faster creation and teardown of large lists, with native
     * ordering, stopPropagation(), currentTarget, non-bubbling events and moved elements all
     * behaving as with addEventListener, except that an element moved out of its list row loses
     * its delegated handlers.  A template made by h() or toEl() with no one root element is
     * served by the page's document alone, and its handlers' this is the fragment.  One more
     * difference: a delegated handler is attached when the event starts, so it runs after
     * listeners other code added to the same element.  Prefix an attribute with native:
     * (native:onclick) to bind just that handler at render time.
     * Pass false to bind every event directly, or an array to delegate only the listed event
     * names.  Non-bubbling events always bind directly. */
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
declare function h(tag: string | Function | symbol, props: object | null, ...children: any[]): Template; // JSX classic factory
declare function h(obj: {render: Function}): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => void; // Rebound render
declare function h(): (htmlStrings: TemplateStringsArray, ...exprs: any[]) => Node|DocumentFragment;

/**
 * Anything an expression can draw as content, as in `<div>${value}</div>`, and so anything an h.map() callback may
 * return for an item:  a Template; a string, number or other value, drawn as its text; null, undefined or false,
 * which draw nothing; a DOM node, DocumentFragment or NodeList; another h.map() list; an array of any of these; or a
 * function that returns one of them. */
export type Renderable =
	Template | string | number | bigint | boolean | Date | null | undefined | void
	| Node | NodeList | MappedList<any> | readonly Renderable[] | (() => Renderable);

declare namespace h {
	/** Render a list, reusing each item's DOM while the item is the SAME object; replace an item
	 *  (don't mutate it) to re-render it.  fn runs only for rows the reconciler can't match.
	 *  No deps: identity is the dep.  Returns a MappedList, not an array.  Put it straight into
	 *  a template expression; it's iterable if you really need each item's result.
	 *  fn usually returns a Template, but may return anything an expression can draw, such as
	 *  null to leave an item out. */
	function map<T>(items:T[], fn:(item:T) => Renderable): MappedList<T>;

	/** Alias of h.map with a name that flags the immutability contract at the call site. */
	function immutableMap<T>(items:T[], fn:(item:T) => Renderable): MappedList<T>;

	/** A selection that writes only the two rows it affects, with no render() call.  Bind with
	 *  when() as a whole attribute value; move it with set(). */
	function selector<K = any>(key?: K | null): Selector<K>;
}

/** Tagged template literal for SVG markup and SVG child fragments. */
declare function svg(htmlStrings: TemplateStringsArray, ...exprs: any[]): Template;
declare function svg(htmlStrings: string | string[], ...exprs: any[]): Template;

export default h;
export {h, svg};

/**
 * Solarite provides more features if your web component extends Solarite instead of HTMLElement. */
export class Solarite extends HTMLElement {
	/**
	 * Fill in and fix up the attribs object a component's constructor receives, so the component
	 * can then copy those values onto its own fields, e.g. with Object.assign(this, attribs).
	 *
	 * 1.  If attribs is an empty object, fill it with the attributes on the DOM element.
	 *     This happens when the browser creates the element from plain html, because then nothing
	 *     calls the constructor with arguments.  Attribute names convert from dash-case to
	 *     camelCase, and `${...}` values are parsed from JSON.
	 * 2.  If types is given, convert attribs values from strings to those types.  Attribute values
	 *     written as literal text always arrive as strings, whether from plain html or from an h()
	 *     template.  types maps a field name to Number, Boolean, String, Date, or any function
	 *     taking the string and returning a value.  Boolean is true for every string except
	 *     'false' and '0', so a bare attribute like `<select-box-3 editable>` becomes true.
	 *     Values that are already not strings, like a `${true}` template expression, are left alone.
	 *
	 * This runs before the subclass initializes its fields and renders, so converted values are
	 * right the first time, even for fields that change what render() builds.  This constructor
	 * can't copy attribs onto fields itself, because subclass field initializers run after it
	 * finishes and would overwrite them; that's why the subclass does the final assign. */
    constructor(attribs?: Record<string, any> | null, types?: Record<string, Function> | null);
    /**
     * @param attribs The attributes a parent template gives this element.
     * @param hasChanged Whether those attributes differ from the last render that called it, compared deeply.  The
     *     comparison only runs when called.  Absent when render() is called directly. */
    render(attribs?: Record<string, any>, hasChanged?: () => boolean): void;
    renderFirstTime(): void;
    /**
     * Schedule render() to run once on the next microtask, coalescing repeated calls in the
     * same tick.  Resolves after the render runs, when a synchronous render satisfies it first,
     * or immediately if the element was removed from the DOM. */
    queueRender(): Promise<void>;
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

/**
 * Convert an attribute string with the given converter: Number, Boolean, String, Date,
 * or any function taking the string and returning a value.  Boolean is true for any string
 * except 'false' and '0', so a bare attribute reads as true.  No converter returns the
 * string unchanged. */
export function convertType(value: string, type?: Function): any;

/** What h.map() returns: the source items plus the callback that builds one item's Template,
 * so the reconciler can recognize an unchanged row by the item it was built from.  Iterating it
 * yields what the callback returns for each item, calling it for every one, for code that needs an
 * array. */
export class MappedList<T = any> {
	items: T[];
	fn: (item: T) => Renderable;
	constructor(items: T[], fn: (item: T) => Renderable);
	[Symbol.iterator](): IterableIterator<Renderable>;
}

/** What h.selector() returns.  Holds one selected key; when() binds an attribute to whether a
 * row's key is that one, and set() moves the selection by writing only the rows that change. */
export class Selector<K = any> {
	constructor(key?: K | null);

	/** The selected key, or null. */
	readonly key: K | null;

	/** Bind an attribute to whether key is the selected one.  Must supply the WHOLE attribute
	 *  value, on the row's own root element, and the rows must be keyed — each of those throws
	 *  otherwise.  An off value of '' (the default) leaves no attribute rather than an empty one. */
	when(key: K, on: any, off?: any): SelectorRef<K>;

	/** Move the selection, writing at most two attributes and calling no render().
	 *  Pass null to deselect. */
	set(key: K | null): void;
}

/** What when() returns.  A Selector owns exactly TWO of these — one meaning "this row is the
 * selected one" and one meaning "it isn't" — rather than one per key, so drawing a row costs no
 * allocation.  The stable identity is also what lets an unchanged row skip its write on a
 * re-render: a row's expression changes identity exactly when its selectedness does. */
export class SelectorRef<K = any> {
	readonly selector: Selector<K>;

	/** True for the selector's "selected" singleton, false for its "unselected" one. */
	readonly selected: boolean;

	value(): any;
}

export class Template {
    exprs: any[];
    html: string[];
    /** List key for keyed diffing, set by the JSX runtime from a `key` prop. */
    key?: any;
    constructor(htmlStrings: string[], exprs: any[]);
    /**
     * Render into el, which may also be a DocumentFragment or a ShadowRoot, and return el.  With no el, return what
     * the template makes:  its element (an HTMLElement, an SVG element or a component), a Text node for a template of
     * text alone, or a DocumentFragment for a template with several top-level nodes or an expression at its top level. */
    render<E extends HTMLElement | DocumentFragment>(el: E, options?: RenderOptions): E;
    render(el?: null, options?: RenderOptions): Node;
    getCloseKey(): string;
}

/** JSX fragment marker for the classic/automatic factories: `<>...</>`. */
export const Fragment: unique symbol;

export function delve(obj: object, path: string[], createVal?: any): any;

/**
 * Internal utilities and state. */
export const Globals: {
    connected: WeakSet<HTMLElement>;
    currentSlotChildren: {Constructor: Function, nodes: Node[]} | null;
    div: HTMLDivElement;
    doc: Document;
    elementClasses: {[key: string]: typeof Node};
    htmlProps: {[key: string]: boolean};
    rootNodeGroups: WeakMap<HTMLElement, any>;
    objToEl: WeakMap<any, any>;
    rendered: WeakSet<HTMLElement>;
    queuedRenders: Map<HTMLElement, Promise<void>>;
    shells: WeakMap<string[], any>;
};

export const SolariteUtil: {
    arraySame(a: any[], b: any[]): boolean;
    attribsToObject(el: HTMLElement, ignore?: string | null): Record<string, any>;
    bindId(root: any, el: HTMLElement): void;
    bindStyles(style: HTMLStyleElement, root: HTMLElement): void;
    camelToDashes(str: string): string;
    dashesToCamel(str: string): string;
    defineClass(Class: typeof HTMLElement, tagName?: string | null): string;
    isIterable(obj: any): boolean;
    trimEmptyNodes(nodes: NodeList | Node[]): Node[];
    [key: string]: any;
};

