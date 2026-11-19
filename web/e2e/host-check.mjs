// Host mode of the full app (docs/embedding.md "Host mode (full app)"): /?host=1 in a frame, the host page on another origin, end to end in headless Chromium.
//   cd web && CALCS_BASE=/ npm run build && node e2e/host-check.mjs [--port 5121] [--host-port 5122] [--shots DIR]
// Never use port 5101 (other sessions serve a build there); pass your own ports.
//   1. ready once with caps and protocol; one tab, no tab/split buttons, no suite bar, no File/New/Open/Save in the ribbon;
//   2. civilkit-load puts the document in place: loaded (name, revision), results (values), no civilkit-source for the host's own text,
//      no second ready; a typed edit sends civilkit-source with a rising revision; the next load adopts the host's revision;
//   3. refused loads (type, name, files, revision) change nothing; values set the sheet's inputs;
//   4. Save asks the host (civilkit-save-request) and downloads nothing;
//   5. nothing of the document is stored: no recent files, no session, no IndexedDB database; a reload starts blank;
//   6. civilkit-theme: mode, Studio's tokens as inline --ck-* overrides, bad values refused, clearing;
//   6b. civilkit-command: every id shows its pane or dialog, refusals, Samples > Open without a question, tokens reach Monaco and the dialogs;
//   7. the plain app (no ?host) still has its File menu, tabs and suite bar logic; no console errors anywhere.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const dist = resolve(arg('--dist', join(here, '..', 'calcpad-web', 'dist')));
const port = Number(arg('--port', '5121'));
const hostPort = Number(arg('--host-port', '5122'));
const shots = arg('--shots', '');
if (port === 5101 || hostPort === 5101) { console.log('port 5101 is not for this check'); process.exit(1); }
if (shots) mkdirSync(shots, { recursive: true });
const origin = `http://127.0.0.1:${port}`;
const hostOrigin = `http://127.0.0.1:${hostPort}`;
const failures = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
if (!existsSync(join(dist, 'index.html'))) { console.log(`no build in ${dist}: cd web && CALCS_BASE=/ npm run build`); process.exit(1); }

const py = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dist, stdio: 'ignore' });
const HOST_PAGE = `<!doctype html><meta charset="utf-8"><title>studio</title>
<iframe id="f" src="${origin}/?host=1&nosw" width="1200" height="760" sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"></iframe>
<script>window.msgs=[];addEventListener('message',function(e){if(e.source===document.getElementById('f').contentWindow)msgs.push({origin:e.origin,data:e.data})});</script>`;
const host = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(HOST_PAGE); });
await new Promise((ok) => host.listen(hostPort, '127.0.0.1', ok));
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${origin}/index.html`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 200)); }

const browser = await chromium.launch();
const consoleErrors = [];
const context = await browser.newContext({ viewport: { width: 1300, height: 820 }, acceptDownloads: true });
const page = await context.newPage();
const downloads = [];
page.on('download', (d) => downloads.push(d.suggestedFilename()));
const onConsole = (p) => {
    p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${p.url()}: ${m.text()}`); });
    p.on('pageerror', (e) => consoleErrors.push(`${p.url()}: ${e.message}`));
};
onConsole(page);
async function until(fn, ok, tries = 120) {
    let v;
    for (let i = 0; i < tries; i++) { v = await fn().catch(() => null); if (v != null && ok(v)) return v; await new Promise((r) => setTimeout(r, 250)); }
    return v;
}
const msgs = () => page.evaluate(() => window.msgs);
const send = (m) => page.evaluate((x) => document.getElementById('f').contentWindow.postMessage(x, '*'), m);
const app = () => page.frames().find((f) => f.url().includes('host=1'));
const types = (list, t) => list.filter((x) => x.data.type === t);
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
/** Sends a message and returns the messages that followed, once `ok` holds. */
async function exchange(m, ok, tries = 120) {
    const n = (await msgs()).length;
    await send(m);
    const all = await until(msgs, (l) => ok(l.slice(n)), tries);
    return all.slice(n);
}
const editorText = () => app().evaluate(() => window.calcpadActiveEditor.getValue());

await page.goto(`${hostOrigin}/`);
const first = await until(msgs, (l) => types(l, 'civilkit-ready').length > 0, 240);
const ready = types(first, 'civilkit-ready')[0];

// ---- 1. ready, and the chrome ------------------------------------------------------------------------------------
check(!!ready && ready.data.protocol === 1 && ['load', 'loaded', 'source', 'results', 'theme', 'tokens', 'errors', 'save'].every((c) => ready.data.caps.includes(c)), `civilkit-ready carries protocol 1 and the caps (${JSON.stringify(ready?.data.caps)}, protocol ${ready?.data.protocol})`);
check(ready?.origin === origin, `and comes from the app's origin (${ready?.origin})`);
await app().waitForFunction(() => !!window.calcpadActiveEditor && !!document.querySelector('#cprs-ribbon .rb-quick'), null, { timeout: 60000 });
await settle(800);
const chrome = await app().evaluate(() => {
    const shown = (sel) => [...document.querySelectorAll(sel)].some((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0);
    return {
        tabs: document.querySelectorAll('.tab-strip .tab').length,
        tabNew: shown('.tab-new'), split: shown('.tab-split'), tabClose: shown('.tab-close'),
        suite: !!document.querySelector('ck-suitebar'), langPrompt: !!document.querySelector('#cprs-language-prompt'),
        file: !!document.querySelector('[data-ribbon-btn="file"]'),
        q: ['q-new', 'q-open', 'q-save', 'q-undo', 'q-redo'].map((id) => !!document.querySelector(`[data-ribbon-btn="${id}"]`)),
        host: document.documentElement.dataset.host,
    };
});
check(chrome.tabs === 1 && !chrome.tabNew && !chrome.split && !chrome.tabClose, `one tab, no new, close or split buttons (${JSON.stringify(chrome)})`);
check(!chrome.suite && !chrome.langPrompt && !chrome.file && !chrome.q[0] && !chrome.q[1] && !chrome.q[2] && chrome.q[3] && chrome.q[4], 'no suite bar, language prompt, File menu, New, Open or Save; Undo and Redo stay');
const tabsOf = async (id) => { await app().locator(`[data-ribbon-tab="${id}"]`).click(); await settle(200); return app().evaluate(() => [...document.querySelectorAll('[data-ribbon-btn]')].map((b) => b.dataset.ribbonBtn)); };
const docBtns = await tabsOf('document');
check(!docBtns.includes('d-saveas') && !docBtns.includes('d-import') && docBtns.includes('d-word') && docBtns.includes('d-excel') && docBtns.includes('d-pdf') && docBtns.includes('d-export'), `Document tab: no Save as or Import, export (Word, Excel, PDF) stays (${docBtns.filter((b) => /^d-(saveas|import|word|excel|pdf|export)/.test(b))})`);
const resBtns = await tabsOf('resources');
check(!resBtns.includes('x-library') && !resBtns.includes('x-newsheet') && !resBtns.includes('x-newcalcpad') && resBtns.includes('x-samples'), `Resources tab: no Library or New sheet, Samples stays (${resBtns.filter((b) => /^x-(library|new|samples)/.test(b))})`);
check((await editorText()) === '', 'the editor starts blank (no welcome sheet, no restored session)');

// ---- 2. load, results, source, revisions ------------------------------------------------------------------------
const SHEET = '<!--sheet-->\n# From the host\n\nL: ? 6 m [2 .. 12 step 0.5] | span\nw: ? 12 kN/m | load\nM_max = w*L^2/8\n';
let got = await exchange({ type: 'civilkit-load', source: SHEET, name: 'studio-beam', revision: 5 }, (l) => types(l, 'civilkit-loaded').length > 0 && types(l, 'civilkit-results').length > 0);
const loaded = types(got, 'civilkit-loaded')[0];
const res = types(got, 'civilkit-results')[0];
check(loaded?.data.name === 'studio-beam' && loaded.data.revision === 5, `civilkit-loaded echoes name and revision (${JSON.stringify(loaded?.data)})`);
check(!!res && res.data.name === 'studio-beam' && Math.abs(res.data.values.M_max?.value - 54) < 0.01 && Array.isArray(res.data.errors), `civilkit-results has the values (M_max ${res?.data.values.M_max?.value})`);
check((await editorText()) === SHEET, 'the editor holds the host\'s text exactly');
check(types(got, 'civilkit-ready').length === 0, 'no second civilkit-ready after a load');
const tabTitle = await app().locator('.tab-strip .tab .tab-title').first().textContent();
check(tabTitle === 'studio-beam', `the one tab is named by the host (${tabTitle})`);
await settle(1500);
check(types(await msgs(), 'civilkit-source').length === 0, "no civilkit-source for the host's own load");
check(types(await msgs(), 'civilkit-ready').length === 1, 'civilkit-ready was sent once in all');

// A typed edit.
await app().evaluate(() => { const e = window.calcpadActiveEditor; const m = e.getModel(); e.setPosition({ lineNumber: m.getLineCount(), column: m.getLineMaxColumn(m.getLineCount()) }); e.focus(); });
let n = (await msgs()).length;
await page.keyboard.type('\n// typed once');
let s1 = await until(msgs, (l) => types(l.slice(n), 'civilkit-source').length > 0);
const src1 = types(s1.slice(n), 'civilkit-source')[0];
check(src1?.data.revision === 6 && src1.data.name === 'studio-beam' && src1.data.source === SHEET + '\n// typed once' && src1.data.source === await editorText(), `a typed edit sends civilkit-source at revision 6 with the whole text (${src1?.data.revision})`);
n = (await msgs()).length;
await page.keyboard.type(' and more');
s1 = await until(msgs, (l) => types(l.slice(n), 'civilkit-source').length > 0);
const src2 = types(s1.slice(n), 'civilkit-source')[0];
check(src2?.data.revision > src1.data.revision && /and more$/.test(src2.data.source), `the next edit has a higher revision (${src2?.data.revision})`);
const typedBurst = types(s1.slice(n), 'civilkit-source').length;
check(typedBurst === 1, `typing is debounced into one civilkit-source (${typedBurst})`);

// A second load adopts the host's revision, sets inputs, and is not echoed.
n = (await msgs()).length;
got = await exchange({ type: 'civilkit-load', source: SHEET, name: 'studio-beam', revision: 10, values: { L: 8, w: 10 } }, (l) => types(l, 'civilkit-loaded').length > 0 && types(l, 'civilkit-results').length > 0);
const res2 = types(got, 'civilkit-results').at(-1);
check(types(got, 'civilkit-loaded')[0].data.revision === 10, 'a second civilkit-loaded carries the host revision 10');
check(Math.abs(res2?.data.values.M_max?.value - 80) < 0.01, `values { L: 8, w: 10 } set the inputs: M_max = 80 (${res2?.data.values.M_max?.value})`);
check((await editorText()) === SHEET, 'the second load replaced the typed text');
await settle(1500);
check(types((await msgs()).slice(n), 'civilkit-source').length === 0, "no civilkit-source for the second load either");
check(types((await msgs()).slice(n), 'civilkit-ready').length === 0, 'and no ready');
n = (await msgs()).length;
await app().evaluate(() => { const e = window.calcpadActiveEditor; const m = e.getModel(); e.setPosition({ lineNumber: m.getLineCount(), column: m.getLineMaxColumn(m.getLineCount()) }); e.focus(); });
await page.keyboard.type('\n// after the second load');
s1 = await until(msgs, (l) => types(l.slice(n), 'civilkit-source').length > 0);
check(types(s1.slice(n), 'civilkit-source')[0]?.data.revision === 11, `the next edit is revision 11 (${types(s1.slice(n), 'civilkit-source')[0]?.data.revision})`);
check((await app().evaluate(() => document.querySelectorAll('.tab-strip .tab').length)) === 1, 'still one tab after the loads');

// An error in the sheet comes with its line.
got = await exchange({ type: 'civilkit-load', source: '<!--sheet-->\nL_m: 5 m\nw_m: 14000 N/m\nw: w_m -> kN/m\nbad: L_m + w_m\n', name: 'bad', revision: 20 }, (l) => types(l, 'civilkit-results').length > 0);
const bad = types(got, 'civilkit-results')[0];
check(Array.isArray(bad?.data.errors) && bad.data.errors.some((x) => x.line === 5 && x.severity === 'error'), `civilkit-results carries the sheet's errors with their line (${JSON.stringify(bad?.data.errors)})`);
// civilkit-get repeats, civilkit-get-source answers.
got = await exchange({ type: 'civilkit-get' }, (l) => types(l, 'civilkit-results').length > 0, 40);
check(types(got, 'civilkit-results').length === 1, 'civilkit-get repeats the last results');
got = await exchange({ type: 'civilkit-get-source' }, (l) => types(l, 'civilkit-source').length > 0, 40);
check(types(got, 'civilkit-source')[0]?.data.revision === 20 && /bad: L_m/.test(types(got, 'civilkit-source')[0].data.source), `civilkit-get-source answers with the text at its revision (${types(got, 'civilkit-source')[0]?.data.revision})`);

// ---- 3. refused loads --------------------------------------------------------------------------------------------
const before = await editorText();
for (const badLoad of [{ source: 5 }, { source: SHEET, name: 'a b/c' }, { source: SHEET, files: { '../x.csv': 'QQ==' } }, { source: SHEET, files: { 'a.csv': '***' } }, { source: SHEET, revision: -1 }, { source: SHEET, revision: 1.5 }, { source: SHEET, values: { 'a b': 1 } }, { source: SHEET, values: { L: 'x;y' } }, { source: 'x'.repeat(1_000_001) }]) {
    got = await exchange({ type: 'civilkit-load', ...badLoad }, (l) => types(l, 'civilkit-error').length > 0, 30);
    check(types(got, 'civilkit-error').length === 1 && types(got, 'civilkit-loaded').length === 0, `civilkit-load ${JSON.stringify(badLoad).slice(0, 50)} is refused (${types(got, 'civilkit-error')[0]?.data.errors})`);
}
check((await editorText()) === before, 'refused loads left the document alone');
// An attached file is readable by the sheet, and the empty document is a valid load.
got = await exchange({ type: 'civilkit-load', source: '<!--sheet-->\nk: ? 2\n', name: 'with-file', revision: 30, files: { 'data.csv': 'MSwyCjMsNA==' } }, (l) => types(l, 'civilkit-loaded').length > 0);
check(types(got, 'civilkit-loaded').length === 1, 'a load with a files entry is accepted');
got = await exchange({ type: 'civilkit-load', source: '', name: 'blank', revision: 31 }, (l) => types(l, 'civilkit-loaded').length > 0);
check(types(got, 'civilkit-loaded').length === 1 && (await editorText()) === '', 'an empty document is a valid load');
// Messages from another frame are not heard.
n = (await msgs()).length;
await page.evaluate(() => { const f = document.createElement('iframe'); f.srcdoc = '<script>parent.frames[0].postMessage({type:"civilkit-load",source:"hacked",name:"x"},"*")<\/script>'; document.body.append(f); });
await settle(1500);
check((await editorText()) === '' && types((await msgs()).slice(n), 'civilkit-loaded').length === 0, 'a message from a frame that is not the parent is ignored');

// ---- 4. Save asks the host ----------------------------------------------------------------------------------------
await exchange({ type: 'civilkit-load', source: SHEET, name: 'to-save', revision: 40 }, (l) => types(l, 'civilkit-loaded').length > 0);
await app().evaluate(() => window.calcpadActiveEditor.focus());
n = (await msgs()).length;
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
got = (await until(msgs, (l) => types(l.slice(n), 'civilkit-save-request').length > 0, 40)).slice(n);
const sv = types(got, 'civilkit-save-request')[0];
check(!!sv && sv.data.source === SHEET && sv.data.name === 'to-save' && sv.data.revision === 40, `Ctrl+S sends civilkit-save-request with the text (${JSON.stringify(sv?.data).slice(0, 80)}...)`);
await settle(500);
check(downloads.length === 0, `and downloads nothing (${downloads})`);

// ---- 5. nothing stored -------------------------------------------------------------------------------------------
const stored = await app().evaluate(async () => {
    const ws = localStorage.getItem('calcpad-workspace-state');
    return { keys: Object.keys(localStorage), recent: localStorage.getItem('calcpad-rs-recent-files'), openFiles: ws ? JSON.parse(ws).openFiles : [],
        idb: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [], text: Object.values(localStorage).some((v) => v.includes('From the host') || v.includes('typed once')) };
});
check(stored.recent === null && stored.openFiles.length === 0 && !stored.idb.includes('calcpad-rs') && !stored.text, `no recent files, session, IndexedDB database or document text stored (${JSON.stringify({ ...stored, keys: stored.keys.length + ' keys' })})`);
await page.reload();
const again = await until(msgs, (l) => types(l, 'civilkit-ready').length > 0, 240);
await app().waitForFunction(() => !!window.calcpadActiveEditor, null, { timeout: 60000 });
await settle(1500);
check(types(again, 'civilkit-ready').length === 1 && (await editorText()) === '', 'a reload starts blank: nothing of the last document is restored');
check(types(await msgs(), 'civilkit-source').length === 0, 'and sends no source');

// ---- 6. theme ----------------------------------------------------------------------------------------------------
const themeOf = () => app().evaluate(() => document.documentElement.dataset.theme);
await send({ type: 'civilkit-theme', mode: 'light' });
check((await until(themeOf, (t) => t === 'light', 20)) === 'light', 'civilkit-theme light paints the app light');
await send({ type: 'civilkit-theme', mode: 'dark' });
check((await until(themeOf, (t) => t === 'dark', 20)) === 'dark', 'civilkit-theme dark paints it dark');
got = await exchange({ type: 'civilkit-theme', mode: 'blue' }, (l) => types(l, 'civilkit-error').length > 0, 30);
check(types(got, 'civilkit-error').length === 1, 'an unknown mode is refused');
got = await exchange({ type: 'civilkit-theme' }, (l) => types(l, 'civilkit-error').length > 0, 30);
check(types(got, 'civilkit-error').length === 1, 'civilkit-theme with neither mode nor tokens is refused');
const prop = (p) => app().evaluate((name) => document.documentElement.style.getPropertyValue(name).trim(), p);
const computed = (p) => app().evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), p);
const sample = await app().evaluate(() => getComputedStyle(document.querySelector('.app-layout')).backgroundColor);
await send({ type: 'civilkit-theme', mode: 'dark', tokens: { 'bg-0': '#102030', 'bg-1': '#123456', 'bg-2': 'rgb(20, 30, 40)', 'txt-0': 'hsl(210, 20%, 90%)', '--accent': '#ff8800', 'font-ui': '"Inter", system-ui, sans-serif', 'font-mono': 'Menlo, monospace', 'not-a-token': 'whatever' } });
await settle(400);
const tok = { panel: await prop('--ck-panel'), bg: await prop('--ck-bg'), sunken: await prop('--ck-sunken'), raised: await prop('--ck-raised'), text: await prop('--ck-text'), accent: await prop('--ck-accent'), focus: await prop('--ck-focus'), font: await prop('--ck-font'), mono: await prop('--ck-mono') };
check(tok.panel === '#123456' && tok.bg === '#102030' && tok.sunken === '#102030' && tok.raised === 'rgb(20, 30, 40)' && tok.text === 'hsl(210, 20%, 90%)' && tok.accent === '#ff8800' && tok.focus === '#ff8800', `tokens map onto the --ck-* properties (${JSON.stringify(tok)})`);
check(tok.font === '"Inter", system-ui, sans-serif' && tok.mono === 'Menlo, monospace', 'and the font stacks too');
check((await computed('--ck-panel')) === '#123456', 'the computed style on :root follows');
const after = await app().evaluate(() => getComputedStyle(document.querySelector('#cprs-ribbon .rb, .app-layout')).backgroundColor);
const changed = await app().evaluate(() => { const all = [...document.querySelectorAll('*')]; return all.some((e) => getComputedStyle(e).backgroundColor === 'rgb(18, 52, 86)'); });
check(changed, 'an element of the app is painted with the new panel colour (#123456)');
if (shots) await page.screenshot({ path: join(shots, 'host-tokens.png') });
for (const badTokens of [{ 'bg-1': 'url(https://x/y.png)' }, { 'bg-1': '#fff; color: red' }, { 'bg-1': 'red' }, { 'bg-1': '#12' }, { 'font-ui': 'a; b' }, { 'font-ui': 'url(x)' }, { 'font-ui': 'a } body { x' }, { accent: 5 }, 'text', ['a']]) {
    got = await exchange({ type: 'civilkit-theme', tokens: badTokens }, (l) => types(l, 'civilkit-error').length > 0, 30);
    check(types(got, 'civilkit-error').length === 1, `tokens ${JSON.stringify(badTokens).slice(0, 50)} are refused`);
}
check((await prop('--ck-panel')) === '#123456', 'a refused tokens message leaves the earlier overrides alone');
await send({ type: 'civilkit-theme', mode: 'dark' });
await settle(400);
check((await prop('--ck-panel')) === '' && (await prop('--ck-accent')) === '' && (await prop('--ck-font')) === '', 'a civilkit-theme without tokens clears the overrides');
await send({ type: 'civilkit-theme', tokens: { 'bg-1': '#123456' } });
await settle(300);
await send({ type: 'civilkit-theme', tokens: {} });
await settle(300);
check((await prop('--ck-panel')) === '', 'empty tokens clear them too');
const studio = { '--bg-0': '#0c0e12', '--bg-1': '#14171d', '--bg-2': '#1b1f27', '--bg-3': '#232833', '--txt-0': '#e7ebf2', '--txt-1': '#9aa5b4', '--txt-2': '#7c8896', '--line': '#2a3038', '--line-2': '#363d49', '--accent': '#4da3ff', '--accent-soft': '#1c3450', '--accent-cta': '#2563d8', '--ok': '#3fb950', '--warn': '#d4a72c', '--danger': '#f85149', '--danger-ink': '#ff8a96', '--radius-sm': '5px', '--font-ui': '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', '--font-mono': 'ui-monospace, SF Mono, Menlo, Consolas, monospace', '--fs-ui': '12px' };
got = await exchange({ type: 'civilkit-theme', mode: 'dark', tokens: studio }, () => true, 1);
await settle(400);
check((await prop('--ck-panel')) === '#14171d' && (await prop('--ck-accent-soft')) === '#1c3450' && (await prop('--ck-mono')) === 'ui-monospace, SF Mono, Menlo, Consolas, monospace' && types(got, 'civilkit-error').length === 0, "Studio's own dark token map (leading -- and unknown keys included) is accepted");

// ---- 6b. civilkit-command: the host's own menus reach the app's features ------------------------------------------------
{
    const COMMANDS = ['samples', 'export', 'word', 'excel', 'pdf', 'showcompiled', 'symbolic', 'find', 'undo', 'redo', 'calculate', 'settings', 'insert', 'variables', 'errors', 'contents', 'format', 'preview', 'unwrapped', 'inputform', 'report', 'shortcuts'];
    check(ready?.data.caps.includes('command') && JSON.stringify(ready.data.commands) === JSON.stringify(COMMANDS), `ready lists the command ids and the command cap (${JSON.stringify(ready?.data.commands)})`);
    const SHEET2 = '<!--sheet-->\n# Commands\n\nL: ? 6 m [2 .. 12 step 0.5]\nA = L*2\n';
    await exchange({ type: 'civilkit-load', source: SHEET2, name: 'cmd-doc', revision: 50 }, (l) => types(l, 'civilkit-loaded').length > 0);
    await settle(600);
    const closeAll = () => app().evaluate(() => { document.getElementById('cprs-dialog')?.remove(); document.querySelector('.cprs-samples-backdrop')?.remove(); document.querySelector('[data-testid=compiled-view]')?.closest('[role=dialog], .cprs-panel, div[id]')?.remove?.(); });
    const dialogs = () => app().evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.getAttribute('aria-label')));
    const run = async (id) => {
        const n = (await msgs()).length;
        await send({ type: 'civilkit-command', id });
        await settle(900);
        return types((await msgs()).slice(n), 'civilkit-error');
    };
    // Each id does something visible.
    let errs = await run('samples');
    check(errs.length === 0 && await until(() => app().evaluate(() => !!document.querySelector('.cprs-samples')), (v) => v, 20), 'samples opens the Samples browser');
    // Open in the browser: no "replace your sheet?" question, the one document is replaced, the host hears it as an edit.
    const dialogsSeen = [];
    page.on('dialog', (d) => { dialogsSeen.push(d.message()); void d.dismiss(); });
    await app().evaluate(() => (document.querySelector('.cprs-s-item') ).click());
    await app().waitForFunction(() => !document.querySelector('.cprs-s-open').disabled, null, { timeout: 20000 });
    const before = await editorText();
    const nS = (await msgs()).length;
    await app().evaluate(() => document.querySelector('.cprs-s-open').click());
    await until(editorText, (t) => t !== before && t.length > 0, 60);
    await settle(900);
    const afterText = await editorText();
    const nowDialogs = await app().evaluate(() => ({ samples: !!document.querySelector('.cprs-samples'), confirm: [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter((d) => /replace|discard|overwrite|unsaved/i.test(d.textContent ?? '')).length, tabs: document.querySelectorAll('.tab-strip .tab').length }));
    const srcMsgs = types((await msgs()).slice(nS), 'civilkit-source');
    check(afterText !== before && afterText.length > 0 && !nowDialogs.samples && nowDialogs.confirm === 0 && dialogsSeen.length === 0 && nowDialogs.tabs === 1, `Samples > Open replaces the document without a question and still one tab (${JSON.stringify({ ...nowDialogs, native: dialogsSeen.length })})`);
    check(srcMsgs.length === 1 && srcMsgs[0].data.source === afterText && srcMsgs[0].data.revision > 50, `the host hears the sample as an edit: civilkit-source with its text (revision ${srcMsgs[0]?.data.revision}, ${srcMsgs.length} message)`);
    await exchange({ type: 'civilkit-load', source: SHEET2, name: 'cmd-doc', revision: 60 }, (l) => types(l, 'civilkit-loaded').length > 0);
    await settle(600);

    errs = await run('export');
    check(errs.length === 0 && (await dialogs()).includes('Export'), 'export shows the Export pane');
    errs = await run('showcompiled');
    check(errs.length === 0 && await app().evaluate(() => !!document.querySelector('[data-testid=compiled-view]')), 'showcompiled shows the compiled Calcpad');
    await closeAll();
    errs = await run('symbolic');
    check(errs.length === 0 && (await dialogs()).includes('Symbolic algebra'), 'symbolic opens the symbolic algebra dialog');
    await closeAll();
    errs = await run('find');
    check(errs.length === 0 && await app().evaluate(() => !!document.querySelector('.find-widget.visible') || !!document.querySelector('[aria-label="Find / Replace"]')), 'find opens Find / Replace');
    errs = await run('settings');
    check(errs.length === 0 && (await dialogs()).includes('Settings'), 'settings opens the Settings pane');
    for (const [id, label] of [['insert', 'Insert'], ['variables', 'Variables'], ['contents', 'Contents']]) {
        errs = await run(id);
        const tab = await app().evaluate((l) => [...document.querySelectorAll('[class*=tab][class*=active], [aria-selected=true]')].some((e) => (e.getAttribute('data-tab') || e.textContent || '').trim().startsWith(l)), label);
        check(errs.length === 0 && tab, `${id} shows the ${label} sidebar tab`);
    }
    for (const [id, label] of [['errors', 'Errors and warnings'], ['format', 'Prettify'], ['shortcuts', 'Keyboard shortcuts']]) {
        errs = await run(id);
        check(errs.length === 0 && (await dialogs()).includes(label), `${id} shows "${label}"`);
    }
    await closeAll();
    for (const id of ['calculate', 'preview', 'unwrapped', 'inputform', 'report']) {
        errs = await run(id);
        check(errs.length === 0, `${id} runs without an error`);
    }
    await run('preview');
    // Undo reverts an edit made in the editor.
    await app().evaluate(() => { const e = window.calcpadActiveEditor; e.pushUndoStop(); e.executeEdits('t', [{ range: e.getModel().getFullModelRange(), text: 'x = 1\n' }]); e.pushUndoStop(); });
    check((await editorText()) === 'x = 1\n', 'an edit is made in the editor');
    errs = await run('undo');
    check(errs.length === 0 && (await editorText()) === SHEET2, 'undo reverts it');
    errs = await run('redo');
    check(errs.length === 0 && (await editorText()) === 'x = 1\n', 'redo brings it back');
    // Refusals: an unknown id, a missing id, and a command the document cannot take now.
    errs = await run('nope');
    check(errs.length === 1 && /unknown command/.test(errs[0].data.errors[0]), `an unknown id is refused (${errs[0]?.data.errors})`);
    errs = await run(undefined);
    check(errs.length === 1 && /unknown command/.test(errs[0].data.errors[0]), 'a command without an id is refused');
    errs = await run('constructor');
    check(errs.length === 1 && /unknown command/.test(errs[0].data.errors[0]), 'an id from Object.prototype is refused');
    await exchange({ type: 'civilkit-load', source: 'a = 1\n', name: 'plain', revision: 70 }, (l) => types(l, 'civilkit-loaded').length > 0);
    errs = await run('showcompiled');
    check(errs.length === 1 && /cannot run.*not a sheet/.test(errs[0].data.errors[0]), `showcompiled on a plain worksheet says why it cannot run (${errs[0]?.data.errors})`);
    // A command from a frame that is not the parent is ignored.
    const nI = (await msgs()).length;
    await page.evaluate(() => { const f = document.createElement('iframe'); f.srcdoc = '<script>parent.frames[0].postMessage({type:"civilkit-command",id:"samples"},"*")<\/script>'; document.body.append(f); });
    await settle(900);
    check(!(await app().evaluate(() => !!document.querySelector('.cprs-samples'))) && types((await msgs()).slice(nI), 'civilkit-error').length === 0, 'a command from a frame that is not the parent is ignored');

    // The host's tokens reach Monaco and the dialogs (the Samples dialog reads --vscode-* which come from --ck-*).
    await send({ type: 'civilkit-theme', mode: 'dark', tokens: { 'bg-1': '#123456', 'txt-0': '#fedcba' } });
    await settle(900);
    const mon = await app().evaluate(() => { const bg = document.querySelector('.monaco-editor .monaco-editor-background'); return bg ? getComputedStyle(bg).backgroundColor : null; });
    check(mon === 'rgb(18, 52, 86)', `Monaco follows the host's panel colour (${mon})`);
    await run('samples');
    const dlgBg = await app().evaluate(() => { const d = document.querySelector('.cprs-samples'); return d ? getComputedStyle(d).backgroundColor : null; });
    check(dlgBg === 'rgb(18, 52, 86)', `and so does the Samples dialog (${dlgBg})`);
    await closeAll();
    await send({ type: 'civilkit-theme', mode: 'dark' });
    await settle(900);
    const mon2 = await app().evaluate(() => { const bg = document.querySelector('.monaco-editor .monaco-editor-background'); return bg ? getComputedStyle(bg).backgroundColor : null; });
    check(mon2 !== 'rgb(18, 52, 86)', `clearing the tokens gives Monaco its own theme back (${mon2})`);
}

// ---- 6c. civilkit-insert and civilkit-patch: the host edits the open document -----------------------------------------------
{
    check(['insert', 'patch'].every((c) => ready.data.caps.includes(c)), `ready lists the caps insert and patch (${JSON.stringify(ready?.data.caps)})`);
    const DOC = '<!--sheet-->\na: 1 m\nb: 2 m\nc: 3 m\n';
    // The revision the next civilkit-source must have: the host's, then one more for each source seen since (an undo is an edit too).
    let cur = 0;
    let mark = 0;
    const sync = async () => { const l = types((await msgs()).slice(mark), 'civilkit-source'); if (l.length) cur = l.at(-1).data.revision; };
    const load = async (rev) => { const l = await exchange({ type: 'civilkit-load', source: DOC, name: 'edits', revision: rev }, (x) => types(x, 'civilkit-loaded').length > 0); await settle(500); cur = rev; mark = (await msgs()).length; return l; };
    const ed = (fn, arg) => app().evaluate(fn, arg);
    const setSel = (a) => ed((r) => { const e = window.calcpadActiveEditor; e.setSelection({ startLineNumber: r[0], startColumn: r[1], endLineNumber: r[2], endColumn: r[3] }); e.focus(); }, a);
    const pos = () => ed(() => { const p = window.calcpadActiveEditor.getPosition(); return [p.lineNumber, p.column]; });
    const undo = async () => { await ed(() => window.calcpadActiveEditor.trigger('test', 'undo', null)); await settle(600); await sync(); };
    /** Sends a message, returns the civilkit-source and civilkit-error messages that follow. */
    async function edit(m, wantSource = true) {
        const l = await exchange(m, (x) => (wantSource ? types(x, 'civilkit-source').length > 0 : types(x, 'civilkit-error').length > 0));
        await settle(wantSource ? 400 : 100);
        const expect = cur + 1;
        await sync();
        return { source: types(l, 'civilkit-source'), error: types(l, 'civilkit-error'), expect };
    }

    // insert at a caret at the start of a line: its own line, caret after it, one source, one undo step
    await load(200);
    await setSel([3, 1, 3, 1]);
    let r = await edit({ type: 'civilkit-insert', text: 'x: 9 m\n' });
    check((await editorText()) === '<!--sheet-->\na: 1 m\nx: 9 m\nb: 2 m\nc: 3 m\n', `insert at the start of a line puts the text there (${JSON.stringify(await editorText())})`);
    check(JSON.stringify(await pos()) === '[4,1]', `the caret is after the inserted text (${JSON.stringify(await pos())})`);
    check(r.source.length === 1 && r.source[0].data.revision === r.expect && r.source[0].data.source === await editorText(), `a civilkit-source follows at the next revision (${r.source.map((x) => x.data.revision)})`);
    await undo();
    check((await editorText()) === DOC, 'one undo restores the text before the insert');
    check(r.error.length === 0, 'no error for a good insert');

    // mid-line: a line break first, and the text ends with one
    await setSel([2, 3, 2, 3]);
    r = await edit({ type: 'civilkit-insert', text: 'y: 5 m' });
    check((await editorText()) === '<!--sheet-->\na:\ny: 5 m\n 1 m\nb: 2 m\nc: 3 m\n', `insert mid-line goes on its own line (${JSON.stringify(await editorText())})`);
    check(r.source.length === 1 && r.source[0].data.revision === r.expect, `and is the next revision (${r.source.map((x) => x.data.revision)})`);
    await undo();
    check((await editorText()) === DOC, 'one undo restores it');

    // a selection is replaced
    await setSel([3, 1, 3, 7]);
    r = await edit({ type: 'civilkit-insert', text: 'z: 7 m' });
    check((await editorText()) === '<!--sheet-->\na: 1 m\nz: 7 m\n\nc: 3 m\n', `insert replaces the selection (${JSON.stringify(await editorText())})`);
    await undo();
    check((await editorText()) === DOC, 'and one undo restores the selected text');

    // refused inserts change nothing
    for (const bad of [{ text: 5 }, { text: '' }, { text: 'x'.repeat(100001) }, {}]) {
        r = await edit({ type: 'civilkit-insert', ...bad }, false);
        check(r.error.length === 1 && /^insert:/.test(r.error[0].data.errors[0]) && (await editorText()) === DOC, `civilkit-insert ${JSON.stringify(bad).slice(0, 30)} is refused (${r.error[0]?.data.errors})`);
    }

    // patch: two edits, one undo step, no cursor jump
    await load(300);
    await setSel([4, 3, 4, 3]);                              // inside "b: 2 m"... line 4 is c: 3 m
    const before = await pos();
    r = await edit({ type: 'civilkit-patch', edits: [{ find: 'a: 1 m', replace: 'a: 10 m' }, { find: 'c: 3 m', replace: 'c: 30 m' }] });
    check((await editorText()) === '<!--sheet-->\na: 10 m\nb: 2 m\nc: 30 m\n', `patch applies both edits (${JSON.stringify(await editorText())})`);
    check(r.source.length === 1 && r.source[0].data.revision === r.expect && r.error.length === 0, `one civilkit-source at the next revision, no error (${r.source.map((x) => x.data.revision)})`);
    check(JSON.stringify(await pos()) === JSON.stringify(before), `the caret did not jump (${JSON.stringify(before)} -> ${JSON.stringify(await pos())})`);
    await undo();
    check((await editorText()) === DOC, 'one undo reverts both edits');

    // a caret after the patched text keeps its place relative to the text (shifts with it)
    await setSel([4, 7, 4, 7]);                              // end of "c: 3 m"
    await edit({ type: 'civilkit-patch', edits: [{ find: 'a: 1 m', replace: 'a: 1000 m' }] });
    check(JSON.stringify(await pos()) === '[4,7]' && (await ed(() => { const e = window.calcpadActiveEditor; return e.getModel().getLineContent(e.getPosition().lineNumber); })) === 'c: 3 m', 'a caret in unchanged text stays on the same text');
    await undo();

    // refused edits are reported, the valid one still applies
    await load(400);
    r = await edit({ type: 'civilkit-patch', edits: [{ find: 'b: 2 m', replace: 'b: 20 m' }, { find: 'nothing here', replace: 'x' }, { find: ' m', replace: ' mm' }, { find: '', replace: 'x' }, { find: 'a: 1 m', replace: 7 }] });
    const errs = r.error[0]?.data.errors ?? [];
    check((await editorText()) === '<!--sheet-->\na: 1 m\nb: 20 m\nc: 3 m\n', `the valid edit applies and the others do not (${JSON.stringify(await editorText())})`);
    check(errs.length === 4 && errs.some((e) => /"nothing here" matched 0 times/.test(e)) && errs.some((e) => /" m" matched 4 times|" m" matched 3 times/.test(e)) && errs.some((e) => /edit 4 has no find text/.test(e)) && errs.some((e) => /edit 5 .*no replace text/.test(e)), `one civilkit-error names each refused edit (${JSON.stringify(errs)})`);
    check(r.source.length === 1 && r.source[0].data.revision === r.expect, `the source of the partial patch is the next revision (${r.source.map((x) => x.data.revision)})`);

    // overlapping matches: the later one is refused
    await load(500);
    r = await edit({ type: 'civilkit-patch', edits: [{ find: 'a: 1 m\nb', replace: 'A' }, { find: 'b: 2 m', replace: 'B' }] });
    check((await editorText()) === '<!--sheet-->\nA: 2 m\nc: 3 m\n' && (r.error[0]?.data.errors ?? []).some((e) => /overlaps an earlier edit/.test(e)), `an overlapping later edit is refused (${JSON.stringify(await editorText())}, ${JSON.stringify(r.error[0]?.data.errors)})`);

    // whole-message refusals change nothing
    await load(600);
    for (const bad of [{ edits: 'x' }, { edits: [] }, { edits: Array.from({ length: 501 }, () => ({ find: 'a', replace: 'b' })) }, { edits: [{ find: 'x'.repeat(100001), replace: '' }] }, {}]) {
        r = await edit({ type: 'civilkit-patch', ...bad }, false);
        check(r.error.length === 1 && /^patch:/.test(r.error[0].data.errors[0]) && (await editorText()) === DOC && r.source.length === 0, `civilkit-patch ${JSON.stringify(bad).slice(0, 30)} is refused whole (${r.error[0]?.data.errors})`);
    }
}

// ---- 7. the plain app ---------------------------------------------------------------------------------------------
const plain =await context.newPage();
onConsole(plain);
await plain.goto(`${origin}/?nosw`);
await plain.waitForFunction(() => !!window.calcpadActiveEditor && !!document.querySelector('#cprs-ribbon .rb-quick'), null, { timeout: 60000 });
const p = await plain.evaluate(() => ({ file: !!document.querySelector('[data-ribbon-btn="file"]'), save: !!document.querySelector('[data-ribbon-btn="q-save"]'), newBtn: !!document.querySelector('[data-ribbon-btn="q-new"]'),
    tabNew: getComputedStyle(document.querySelector('.tab-new')).display, split: getComputedStyle(document.querySelector('.tab-split')).display, host: document.documentElement.dataset.host ?? null, text: window.calcpadActiveEditor.getValue().length > 0 }));
check(p.file && p.save && p.newBtn && p.tabNew !== 'none' && p.split !== 'none' && p.host === null && p.text, `without ?host the app is as before: File menu, New, Save, tab buttons, welcome sheet (${JSON.stringify(p)})`);
await plain.close();

check(consoleErrors.length === 0, `no console errors${consoleErrors.length ? ': ' + consoleErrors.slice(0, 5).join(' | ') : ''}`);
await browser.close();
host.close();
py.kill();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nhost check passed');
process.exit(failures.length ? 1 : 0);
