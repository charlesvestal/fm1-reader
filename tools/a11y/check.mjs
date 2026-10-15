#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Every page of a built site, checked with axe-core (WCAG 2.2 A and AA, and best practice) in a headless Chrome,
// at desktop and phone widths, in light and dark. What it can't judge is in PAGES.md: read and listen too.
//   cd tools/a11y && npm install && npx playwright install chromium     (once)
//   node tools/a11y/check.mjs SITE_DIR [--json out.json] [--click 'emu/index.html=#go']
//     exit 1 on serious or critical problems, a script error, or horizontal scroll. --click (repeatable)
//     presses a control on a page first and checks it again in that state (an emulator switched on).
// Nothing leaves the local server: a redirect page is checked as it is, and frames from other sites stay empty.
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
    '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.gif': 'image/gif', '.mp4': 'video/mp4',
    '.vtt': 'text/vtt', '.webm': 'video/webm', '.webp': 'image/webp' };
const clicks = [];                                     // [page, selector]
process.argv.forEach((a, i) => { if (a === '--click') { const [p, sel] = process.argv[i + 1].split('='); clicks.push([p, sel]); } });

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
const runs = [];
for (const page of pages) {
    for (const st of [null, ...clicks.filter((c) => c[0] === page.split(path.sep).join('/')).map((c) => c[1])])
        for (const [vw, scheme] of [[1280, 'light'], [1280, 'dark'], [390, 'light'], [390, 'dark']]) runs.push([page, st, vw, scheme]);
}
for (const [page, click, vw, scheme] of runs) {
    {
        const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, colorScheme: scheme });
        await ctx.route(/.*/, (r) => {
            if (r.request().url().startsWith(base)) return r.continue();
            // off the site: a page leaving (a redirect) stays where it is (204); anything else isn't fetched
            return r.request().isNavigationRequest() && r.request().frame() === r.request().frame().page().mainFrame()
                ? r.fulfill({ status: 204 }) : r.abort();
        });
        const tab = await ctx.newPage();
        const errors = [];
        tab.on('pageerror', (e) => errors.push(String(e)));
        try {
            await tab.goto(base + page.split(path.sep).join('/'), { waitUntil: 'load', timeout: 20000 });
            await tab.waitForTimeout(400);
            if (click) { await tab.click(click, { timeout: 5000 }); await tab.waitForTimeout(800); }
            await tab.addScriptTag({ content: AXE });
            const r = await tab.evaluate(async () => await window.axe.run(document, {
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
            }));
            const hscroll = await tab.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
            results.push({ page: page + (click ? ` after ${click}` : ''), vw, scheme, hscroll, errors, violations: r.violations.map((v) => ({
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
    console.log(`${serious.length || r.hscroll || r.errors.length ? 'FAIL' : 'warn'}  ${tag}`);
    for (const x of v) console.log(`        ${x.impact.padEnd(8)} ${x.id} (${x.count}): ${x.help}\n                 ${x.nodes.join(' | ')}`);
    if (r.hscroll) console.log('        serious  horizontal scroll at this width');
    for (const e of r.errors) console.log(`        error    ${e.slice(0, 200)}`);
    if (r.hscroll) bad++;
    bad += r.errors.length;                              // a script error: the page may not work at all
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
console.log(`\n${pages.length} pages, ${results.length} checks: ${bad} serious or critical`);
process.exit(bad ? 1 : 0);
