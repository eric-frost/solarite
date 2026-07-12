/**
 * Live-HTML-property refresh (the DataTable ghost-selection bug, 2026-07-07):
 * Solarite's diff skips expressions whose value didn't change between renders, but users flip
 * checkbox/value/selected PROPERTIES underneath the cached expression.  Boolean live-property
 * bindings are therefore exempt from the unchanged-value skip; string value bindings keep the
 * old semantics so typing in a bound input isn't clobbered by unrelated renders. */
import Testimony, {assert, TestimonyContext} from "../../Testimony.js";

const html = `
	<!DOCTYPE html>
	<html lang="en">
		<head><meta charset="UTF-8"></head>
		<body></body>
	</html>`;

Testimony.testIframe('checkedRefresh', 'user-flipped checkboxes reset on same-values renders; user-typed text survives', html, async (context:TestimonyContext) => {
	const assert = context.assert;
	const {default: h, Solarite} = await import('/admin/common/js/solarite/Solarite.js');

	class LpRows extends Solarite {
		rows = [{id: 1, sel: false}, {id: 2, sel: false}, {id: 3, sel: false}];
		render() {
			h(this)`<lp-rows>${this.rows.map((r:any) => h`
				<div><input type="checkbox" checked=${r.sel}><input class="txt" value=${r.id + '-note'}></div>
			`)}</lp-rows>`;
		}
	}
	(LpRows as any).define('lp-rows');

	const el:any = new LpRows();
	document.body.append(el);
	const boxes = () => [...el.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
	assert.eq(boxes().length, 3);
	assert(boxes().every(b => !b.checked));

	// A click flips the PROPERTY without a render; a later render with the SAME values must
	// reset it — the live-property exemption to the unchanged-value skip.
	boxes()[1].checked = true;
	el.render();
	assert(!boxes()[1].checked, 'same-values render resets a user-flipped checkbox');

	// The ghost-selection case (bulk delete): flip position 1, remove that row so a DIFFERENT
	// row shifts into the position, re-render — the shifted-in row must not look selected.
	boxes()[1].checked = true;
	el.rows.splice(1, 1);
	el.render();
	assert.eq(boxes().length, 2);
	assert(boxes().every(b => !b.checked), 'no ghost checkbox after rows shift');

	// Model-driven state still wins in both directions.
	el.rows[0].sel = true;
	el.render();
	assert(boxes()[0].checked, 'model true renders checked');
	boxes()[0].checked = false; // user unchecks; the model still says true
	el.render();
	assert(boxes()[0].checked, 'same-values render restores a model-true checkbox');

	// String value bindings keep the old skip semantics — the exemption is boolean-only, so
	// user-typed text in a bound input survives unrelated same-values renders.
	const txt = el.querySelector('.txt') as HTMLInputElement;
	assert.eq(txt.value, '1-note');
	txt.value = 'edited';
	el.render();
	assert.eq(txt.value, 'edited', 'user-typed text survives a same-values render');
});
