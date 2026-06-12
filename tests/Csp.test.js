/**
 * Verifies Solarite renders and dispatches events under a strict Content-Security-Policy
 * (default-src 'self'), the same policy the js-framework-benchmark uses for its #1139 flag.
 * The work happens in files/csp.html, since CSP must be set before a document loads. */
import Testimony, {assert} from './Testimony.js';

Testimony.test('Csp.strict', `No violations under Content-Security-Policy default-src 'self'`, async () => {
	let iframe = document.createElement('iframe');
	iframe.src = 'files/csp.html';
	iframe.style.display = 'none';
	document.body.append(iframe);

	try {
		let result;
		for (let i = 0; i < 100 && !result; i++) {
			await new Promise(resolve => setTimeout(resolve, 30));
			result = iframe.contentWindow?.__cspResult;
		}
		assert(result, 'Timed out waiting for files/csp.html to produce a result.');

		assert.eq(result.violations.join('\n'), '');
		assert.eq(result.clicks, 1);
		assert.eq(result.selectedId, 1);
		assert.eq(result.rowCount, 3);
		assert.eq(result.dangerCount, 1);
	}
	finally {
		iframe.remove();
	}
});
