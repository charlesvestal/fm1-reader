#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Every page of a built site, checked with axe-core (WCAG 2.2 A and AA, and best practice) in a headless Chrome,
// at desktop and phone widths, in light and dark. What it can't judge is in PAGES.md: read and listen too.
//   cd tools/a11y && npm install && npx playwright install chromium     (once)
//   node tools/a11y/check.mjs SITE_DIR [--json out.json]               exit 1 on serious or critical problems
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const root = path.resolve(process.argv[2] || '.');
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.gif': 'image/gif', '.mp4': 'video/mp4' };

const pages = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.html')) pages.push(path.relative(root, p));
    }
})(root);

const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const results = [];
for (const page of pages) {
    for (const [vw, scheme] of [[1280, 'light'], [390, 'dark']]) {
        const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, colorScheme: scheme });
        const tab = await ctx.newPage();
        const errors = [];
        tab.on('pageerror', (e) => errors.push(String(e)));
        try {
            await tab.goto(base + page.split(path.sep).join('/'), { waitUntil: 'load', timeout: 20000 });
            await tab.waitForTimeout(400);
            await tab.addScriptTag({ content: AXE });
            const r = await tab.evaluate(async () => await window.axe.run(document, {
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
            }));
            const hscroll = await tab.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
            results.push({ page, vw, scheme, hscroll, errors, violations: r.violations.map((v) => ({
                id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
                count: v.nodes.length })) });
        } catch (e) {
            results.push({ page, vw, scheme, errors: [String(e)], violations: [] });
        }
        await ctx.close();
    }
}
await browser.close();
server.close();

let bad = 0;
for (const r of results) {
    const v = r.violations;
    const serious = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
    bad += serious.length;
    const tag = `${r.page} (${r.vw}px ${r.scheme})`;
    if (!v.length && !r.hscroll && !r.errors.length) { console.log(`ok    ${tag}`); continue; }
    console.log(`${serious.length ? 'FAIL' : 'warn'}  ${tag}`);
    for (const x of v) console.log(`        ${x.impact.padEnd(8)} ${x.id} (${x.count}): ${x.help}\n                 ${x.nodes.join(' | ')}`);
    if (r.hscroll) console.log('        serious  horizontal scroll at this width');
    for (const e of r.errors) console.log(`        error    ${e.slice(0, 200)}`);
    if (r.hscroll) bad++;
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
console.log(`\n${pages.length} pages, ${results.length} checks: ${bad} serious or critical`);
process.exit(bad ? 1 : 0);
