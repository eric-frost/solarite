// TODO: Everything here fails because our own connectedCallback function is never called.
// Perhaps b/c these callbacks must be defined before we register the custom element.


/**
 * @type {Map<HTMLElement, Set<function(HTMLElement)>>} */
let connectCallbacks = new Map();
/**
 * @type {Map<HTMLElement, Set<function(HTMLElement)>>} */
let firstConnectCallbacks = new Map();
/**
 * @type {Map<HTMLElement, Set<function(HTMLElement)>>} */
let disconnectCallbacks = new Map();

function getElCallbacks(el, map) {
	let callbacks = connectCallbacks.get(el);
	if (!callbacks) {
		callbacks = new Set();
		connectCallbacks.set(el, callbacks);
	}
	return callbacks;
}

let createConnectedCallback = el => () => {
	debugger;
	for (let cb of getElCallbacks(el, connectCallbacks))
		cb();

	let cbs = getElCallbacks(el, firstConnectCallbacks);
	for (let cb of cbs) {
		cb();
		cbs.delete(cb);
	}
};


/**
 *
 * @param el {HTMLElement}
 * @param callback {function}
 * @return {function()} A function that removes the callback. */
export function onConnect(el, callback) {
	let callbacks = getElCallbacks(el, connectCallbacks);
	callbacks.add(callback);

	if (!el.constructor.prototype.hasOwnProperty('connectedCallback'))
		el.constructor.prototype.connectedCallback = createConnectedCallback(el);

	return () => {
		callbacks.delete(callback);
	}
}

export function onFirstConnect(el, callback) {
	let callbacks = getElCallbacks(el, firstConnectCallbacks);
	callbacks.add(callback);

	if (!el.hasOwnProperty('connectedCallback'))
		el.connectedCallback = createConnectedCallback(el);

	return () => {
		callbacks.delete(callback);
	}
}

export function onDisconnect(el, callback) {
	let callbacks = getElCallbacks(el, disconnectCallbacks);
	callbacks.add(callback);

	if (!el.hasOwnProperty('connectedCallback'))
		el.connectedCallback = () => {
			for (let cb of callbacks)
				cb();
		}

	return () => {
		callbacks.delete(callback);
	}
}