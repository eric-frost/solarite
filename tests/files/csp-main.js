// Runs inside files/csp.html, which is served with Content-Security-Policy: default-src 'self'.
// Mirrors the js-framework-benchmark usage patterns, recording any CSP violations.
// If we have a CSP violation, Solarite will be flagged with a penalty tag on the benchmark.
let violations = [];
document.addEventListener('securitypolicyviolation', e =>
	violations.push(`${e.violatedDirective}: ${e.blockedURI || e.sourceFile || e.sample || ''}`));

let {Solarite, h} = await import('../../src/Solarite.js');

class CspTest extends Solarite {
	rows = [{id: 1, label: 'one'}, {id: 2, label: 'two'}];
	selectedId = null;
	clicks = 0;

	add() {
		this.clicks++;
		this.rows.push({id: this.rows.length + 1, label: 'added'});
		this.render();
	}

	select(row) {
		this.selectedId = row.id;
		this.render();
	}

	render() {
		h(this)`
		<csp-test>
			<button data-id="addButton" onclick=${this.add}>Add</button>
			<table><tbody>
				${this.rows.map(row => h`
					<tr class=${row.id === this.selectedId ? 'danger' : ''}>
						<td>${row.id}</td>
						<td><a onclick=${[this.select, row]}>${row.label}</a></td>
					</tr>`)}
			</tbody></table>
		</csp-test>`;
	}
}
customElements.define('csp-test', CspTest);

let app = new CspTest();
document.body.append(app);

app.addButton.dispatchEvent(new MouseEvent('click'));
app.querySelector('a').dispatchEvent(new MouseEvent('click'));

// Let any async securitypolicyviolation events arrive.
await new Promise(resolve => setTimeout(resolve, 50));

window.__cspResult = {
	violations,
	clicks: app.clicks,
	selectedId: app.selectedId,
	rowCount: app.querySelectorAll('tr').length,
	dangerCount: app.querySelectorAll('tr.danger').length
};
