/**
 * Runs Solarite browser tests via Playwright + a simple HTTP server.
 * Usage: node run-tests.mjs [testNameFilter]
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg.default || pkg;

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 18004;
const MIME = {
	'.html': 'text/html',
	'.js':   'application/javascript',
	'.css':  'text/css',
	'.json': 'application/json',
};

const testFilter = process.argv[2] || '';

const server = createServer(async (req, res) => {
	let path = req.url.split('?')[0];
	if (path === '/') path = '/tests/index.html';
	const filePath = join(ROOT, path);
	try {
		const data = await readFile(filePath);
		const ext = extname(filePath);
		res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
		res.end(data);
	} catch {
		res.writeHead(404);
		res.end('Not found: ' + path);
	}
});

await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', msg => {
	if (msg.type() === 'error') process.stderr.write('[browser error] ' + msg.text() + '\n');
});
page.on('pageerror', err => process.stderr.write('[page error] ' + err.message + '\n'));

const url = `http://localhost:${PORT}/tests/index.html?${testFilter ? 'r=' + encodeURIComponent(testFilter) : 'allTests=1'}`;
await page.goto(url);

// Wait for Testimony.finished = true
await page.waitForFunction(() => window.Testimony?.finished === true, { timeout: 120000 });

// Collect results: walk the test tree via test-item elements
const results = await page.evaluate(() => {
	const items = document.querySelectorAll('test-item');
	const out = [];
	for (const item of items) {
		const t = item.test;
		if (!t || !t.fn) continue; // skip group nodes (no fn = not a leaf test)
		const s = t.status;
		const isPass = s === 'Pass';
		const isFail = s === 'Fail' || (s instanceof Error) || (typeof s === 'object' && s !== null);
		out.push({
			name: t.name,
			pass: isPass,
			fail: isFail,
			error: (s instanceof Error) ? s.message : (isFail && !isPass ? String(s) : ''),
		});
	}
	return out;
});

await browser.close();
server.close();

let passed = 0, failed = 0, skipped = 0;
const failures = [];
for (const r of results) {
	if (r.pass) passed++;
	else if (r.fail) { failed++; failures.push(r); }
	else skipped++;
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} not run\n`);

if (failures.length) {
	console.log('FAILURES:');
	for (const f of failures)
		console.log(`  FAIL: ${f.name}\n       ${f.error}\n`);
	process.exit(1);
} else {
	console.log('All tests passed!');
}
