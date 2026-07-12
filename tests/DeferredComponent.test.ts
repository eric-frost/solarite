/**
 * Deferred component instantiation (the ModelView/SceneViewer lazy-import case, 2026-07-09):
 * A dash-tag in an h-template that isn't customElements.define()'d yet used to throw an
 * UNCAUGHT async error from the connectedCallback reaction and leave an inert
 * -solarite-placeholder forever.  PathToComponent.apply() now keeps the placeholder and
 * subscribes customElements.whenDefined(), instantiating with the LATEST rendered exprs
 * once the definition lands — like a native custom-element upgrade. */
import Testimony, {assert, TestimonyContext} from "../../Testimony.js";

const html = `
	<!DOCTYPE html>
	<html lang="en">
		<head><meta charset="UTF-8"></head>
		<body></body>
	</html>`;

Testimony.testIframe('deferredUpgrade', 'undefined child component defers, then upgrades with the latest exprs on define()', html, async (context:TestimonyContext) => {
	const assert = context.assert;
	const {default: h, Solarite} = await import('/admin/common/js/solarite/Solarite.js');

	let src = '/first/path.gltf';
	class DcHost extends Solarite {
		render() { h(this)`<dc-host><dc-widget src=${src}></dc-widget></dc-host>`; }
	}
	(DcHost as any).define('dc-host');

	// 1. Render while <dc-widget> is undefined: no throw, placeholder holds the attribute.
	const host:any = new DcHost();
	document.body.append(host);
	let ph = host.querySelector('dc-widget-solarite-placeholder');
	assert(ph, 'placeholder stays when the component is not defined');
	assert.eq(ph.getAttribute('src'), '/first/path.gltf');

	// 2. Re-render while still undefined: the deferred exprs must be the LATEST.
	src = '/second/path.gltf';
	host.render();
	ph = host.querySelector('dc-widget-solarite-placeholder');
	assert.eq(ph.getAttribute('src'), '/second/path.gltf');

	// 3. define() upgrades the placeholder with NO manual re-render, passing constructor args.
	class DcWidget extends Solarite {
		src = '';
		constructor(opts:any = {}) {
			super();
			if (opts.src) this.src = opts.src;
		}
		render() { h(this)`<dc-widget><b>${this.src}</b></dc-widget>`; }
	}
	(DcWidget as any).define('dc-widget');
	await customElements.whenDefined('dc-widget');
	await new Promise(r => setTimeout(r, 20)); // whenDefined subscribers run as microtasks

	assert(!host.querySelector('dc-widget-solarite-placeholder'), 'placeholder replaced after define()');
	const widget = host.querySelector('dc-widget');
	assert(widget, 'real component instantiated');
	assert.eq(widget.src, '/second/path.gltf', 'constructor received the latest exprs');
	assert(widget.textContent.includes('/second/path.gltf'), 'component rendered its content');

	host.remove();
});
