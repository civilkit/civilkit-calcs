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
//   6c. civilkit-insert and civilkit-patch; 6d. civilkit-define (scalars, vectors, precedence, lines, limits) and civilkit-names (completion), lost variables;
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

// ---- 6d. civilkit-define and civilkit-names: variables the host defines --------------------------------------------------------
{
    check(['define', 'names'].every((c) => ready.data.caps.includes(c)), `ready lists the caps define and names (${JSON.stringify(ready?.data.caps)})`);
    const lastRes = async (from) => types((await msgs()).slice(from), 'civilkit-results').at(-1)?.data;
    /** Loads `source` and waits for its results. */
    const loadDoc = async (source, rev = 1) => {
        const l = await exchange({ type: 'civilkit-load', source, name: 'defs', revision: rev }, (x) => types(x, 'civilkit-results').length > 0);
        await settle(600);
        return types(l, 'civilkit-results').at(-1)?.data;
    };
    /** Sends a civilkit-define and returns what followed once the results satisfy `ok` (or an error came). */
    const define = async (values, notes, ok = () => true, tries = 200) => {
        const msg = { type: 'civilkit-define', values };
        if (notes) msg.notes = notes;
        const l = await exchange(msg, (x) => types(x, 'civilkit-error').length > 0 || types(x, 'civilkit-results').some((r) => ok(r.data)), tries);
        return { results: types(l, 'civilkit-results').map((r) => r.data), error: types(l, 'civilkit-error').map((e) => e.data.errors), sources: types(l, 'civilkit-source'), all: l };
    };
    const hasErr = (res, re, line) => (res?.errors ?? []).some((e) => re.test(e.message) && (line === undefined || e.line === line));
    const versionId = () => app().evaluate(() => window.calcpadActiveEditor.getModel().getVersionId());

    // scalars: used in formulas, with a unit conversion; not in the document, no source, no edit
    const DOC = '<!--sheet-->\nutil: Mz_M54 / phiMs_M54\nM_kN: Mz_M54 -> kN*m\nM_Nmm: Mz_M54 -> N*mm\n';
    await loadDoc(DOC, 10);
    const v0 = await versionId();
    let r = await define({ Mz_M54: '-1.79 kN*m', phiMs_M54: '23.15 kN*m' }, undefined, (d) => d.values.util && !d.values.util.text.includes('Undefined'));
    let res = r.results.at(-1);
    check(Math.abs(res?.values.util?.value - (-1.79 / 23.15)) < 1e-6, `a defined name is used in a formula: util = Mz_M54 / phiMs_M54 (${res?.values.util?.value})`);
    check(Math.abs(res?.values.M_Nmm?.value - (-1790000)) < 1 && /N/.test(res.values.M_Nmm.unit), `-> converts a host value: M_Nmm = ${res?.values.M_Nmm?.value} ${res?.values.M_Nmm?.unit}`);
    check(res?.values.Mz_M54?.host === true && res.values.Mz_M54.value === -1.79 && /kN/.test(res.values.Mz_M54.unit), `the host's variable is in the values, marked host:true (${JSON.stringify(res?.values.Mz_M54)})`);
    check((res?.errors ?? []).length === 0, `no errors with the host's values (${JSON.stringify(res?.errors)})`);
    check(r.sources.length === 0 && (await editorText()) === DOC && (await versionId()) === v0, 'define sends no civilkit-source and changes neither the text nor the editor\'s version (undo stack)');

    // replace: a name left out is gone, and the use of it is an error with the document's own line
    r = await define({ Mz_M54: '-2 kN*m' }, undefined, (d) => d.values.Mz_M54?.value === -2);
    res = r.results.at(-1);
    check(res?.values.Mz_M54?.value === -2 && hasErr(res, /Undefined variable/, 2), `a second define replaces the set: phiMs_M54 is gone and its use errors on line 2 (${JSON.stringify(res?.errors)})`);
    r = await define({}, undefined, (d) => !d.values.Mz_M54);
    res = r.results.at(-1);
    check(!res?.values.Mz_M54 && hasErr(res, /Undefined variable/, 2) && hasErr(res, /Undefined variable/, 3), `an empty define clears them: the uses error on lines 2 and 3 (${JSON.stringify((res?.errors ?? []).map((e) => e.line))})`);

    // refused: nothing applied (the earlier set stays)
    await define({ Mz_M54: '-1.79 kN*m', phiMs_M54: '23.15 kN*m' }, undefined, (d) => d.values.util?.value !== undefined && typeof d.values.util.value === 'number');
    const bads = [
        [{ '1x': '5' }, /not a name/], [{ a: 'abc' }, /must be a number/], [{ a: '5 | note' }, /must be a number/], [{ a: '[1; abc]' }, /element 2/],
        [{ a: '5 kN\nb' }, /must be a number/], [{ a: '1e400' }, /number/], [{ a: '[1; 2' }, /\]/], [{ a: '5 nosuchunit_zz' }, /a/], [[1, 2], /object/],
    ];
    for (const [values, why] of bads) {
        const l = await exchange({ type: 'civilkit-define', values: values }, (x) => types(x, 'civilkit-error').length > 0, 60);
        const err = types(l, 'civilkit-error')[0]?.data.errors[0] ?? '';
        check(types(l, 'civilkit-error').length === 1 && why.test(err), `define ${JSON.stringify(values).slice(0, 40)} is refused (${err.slice(0, 80)})`);
    }
    {
        const many = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`n${i}`, '1']));
        const l = await exchange({ type: 'civilkit-define', values: many }, (x) => types(x, 'civilkit-error').length > 0, 60);
        check(/at most 2000/.test(types(l, 'civilkit-error')[0]?.data.errors[0] ?? ''), 'define over 2000 names is refused');
        const huge = { v: `[${Array.from({ length: 5001 }, () => '1').join('; ')}]` };
        const l2 = await exchange({ type: 'civilkit-define', values: huge }, (x) => types(x, 'civilkit-error').length > 0, 60);
        check(/at most 5000 elements/.test(types(l2, 'civilkit-error')[0]?.data.errors[0] ?? ''), 'a vector of more than 5000 elements is refused');
        const wide = Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`name_with_some_length_${i}`, `${'1'.repeat(40)} kN*m`]));
        const l3 = await exchange({ type: 'civilkit-define', values: wide }, (x) => types(x, 'civilkit-error').length > 0, 60);
        check(/over 65536 characters/.test(types(l3, 'civilkit-error')[0]?.data.errors[0] ?? ''), 'define over 64 KB is refused');
    }
    // a name the engine refuses (a unit) names the define and applies nothing
    {
        const l = await exchange({ type: 'civilkit-define', values: { Mz_M54: '-9 kN*m', m: '5' } }, (x) => types(x, 'civilkit-error').length > 0 || types(x, 'civilkit-results').length > 0, 60);
        const err = types(l, 'civilkit-error')[0]?.data.errors[0] ?? '';
        check(/"m"/.test(err), `a name that is a unit is refused, naming it (${err.slice(0, 100)})`);
    }
    r = await define({ Mz_M54: '-1.79 kN*m', phiMs_M54: '23.15 kN*m' }, undefined, (d) => typeof d.values.util?.value === 'number');
    check(Math.abs(r.results.at(-1)?.values.util?.value - (-1.79 / 23.15)) < 1e-6, 'the refused messages left the earlier set in place');

    // the sheet wins, with a warning that names the name and the line
    await loadDoc('<!--sheet-->\nMz_M54: 7 kN*m\nz: Mz_M54*2\n', 20);
    r = await define({ Mz_M54: '5 kN*m' }, undefined, (d) => d.values.z?.value !== undefined, 200);
    await settle(600);
    res = (await lastRes(0)) ?? r.results.at(-1);
    const warn = (res?.errors ?? []).find((e) => e.severity === 'warning' && /Mz_M54/.test(e.message));
    check(res?.values.Mz_M54?.value === 7 && res.values.Mz_M54.host !== true && res.values.z.value === 14, `the document's own definition wins (Mz_M54 = ${res?.values.Mz_M54?.value}, z = ${res?.values.z?.value})`);
    check(!!warn && warn.line === 2, `and the results carry a warning on the document's line (${JSON.stringify(warn)})`);

    // lines are the document's own with a prelude in front: a sheet, and plain Calcpad text
    await loadDoc('<!--sheet-->\nMz_M54: 7 kN*m\nq: 1\nbad: 3 +\n', 30);
    r = await define({ phiMs_M54: '23.15 kN*m', other: '3' }, undefined, (d) => d.values.phiMs_M54 !== undefined);
    res = r.results.at(-1);
    check((res?.errors ?? []).some((e) => e.severity === 'error' && e.line === 4), `error lines are not shifted by the prelude (sheet): ${JSON.stringify((res?.errors ?? []).map((e) => [e.line, e.severity]))}`);
    await loadDoc('U = phiMs_M54/2\nW = U|kN*m\nbad = 3 +\n', 31);
    r = await define({ phiMs_M54: '23.15 kN*m' }, undefined, (d) => d.values.U !== undefined);
    res = r.results.at(-1);
    check(Math.abs(res?.values.U?.value - 11.575) < 1e-6 && (res.errors ?? []).some((e) => e.line === 3 && /ncomplete/.test(e.message)), `plain Calcpad text: host values work and error lines are the text's own (${JSON.stringify(res?.errors)}, refused: ${JSON.stringify(r.error)})`);
    check(!/#hide|#show/.test(await editorText()) && (await editorText()) === 'U = phiMs_M54/2\nW = U|kN*m\nbad = 3 +\n', 'the prelude is not in the editor');

    // vectors: the literal forms, results shape, loops, element access, functions, units, out of range
    const VDOC = [
        '<!--sheet-->', 'n: len(member_nums)', 'big: max(Mz_members)', 'small: min(Mz_members)', 'tot: sum(Mz_members)', 'a: abs(Mz_members)', 'c: Mz_members -> kN*m',
        'for i in 1..n:', '    t: Mz_members.i', 'for x in Mz_members:', '    y: x*2', 'e: Mz_members.5', 's: sum(spans)', 'm2: max(conv)', 'm3: max(mixed)', '',
    ].join('\n');
    await loadDoc(VDOC, 40);
    r = await define({ Mz_members: '[-245.3 kN*m; 120.4 kN*m; -61 kN*m]', member_nums: '[1; 2; 12]', spans: '[16 ft; 12 ft]', conv: '[1 kN*m; 2000 N*m]', mixed: '[1 kN*m; 2 N*m; 3]' }, undefined, (d) => d.values.tot !== undefined);
    res = r.results.at(-1);
    const mv = res?.values.Mz_members;
    check(mv?.vector === true && mv.host === true && Array.isArray(mv.value) && mv.value.length === 3 && mv.value[0].value === -245.3 && /kN/.test(mv.value[0].unit) && /^\[-245\.3; 120\.4; -61\]/.test(mv.text), `a vector is in the results as an array of {value, unit} with its text (${JSON.stringify(mv).slice(0, 160)})`);
    check(res?.values.member_nums?.value?.map((e) => e.value).join() === '1,2,12' && res.values.n.value === 3, `a unitless vector, and len() of it (${JSON.stringify(res?.values.member_nums?.text)}, n = ${res?.values.n?.value})`);
    check(res?.values.big?.value === 120.4 && res.values.small.value === -245.3 && Math.abs(res.values.tot.value + 185.9) < 1e-9 && /kN/.test(res.values.big.unit), `max, min and sum of a vector of quantities keep the unit (big ${res?.values.big?.value} ${res?.values.big?.unit}, tot ${res?.values.tot?.value})`);
    check(res?.values.a?.vector && res.values.a.value.map((e) => e.value).join() === '245.3,120.4,61', `abs(v) is a vector (${res?.values.a?.text})`);
    check(res?.values.c?.vector && /kN/.test(res.values.c.unit || res.values.c.value?.[0]?.unit), `v -> kN*m is a vector in kN*m (${res?.values.c?.text})`);
    check(res?.values.t?.value === -61 && res.values.y?.value === -122 && res.values.x?.value === -61, `for i in 1..n with v.i and for x in v run over the defined vector (t ${res?.values.t?.value}, y ${res?.values.y?.value})`);
    check(hasErr(res, /Index out of range: 5/, 12), `an index out of range is an error with the document's line (${JSON.stringify((res?.errors ?? []).filter((e) => /range/.test(e.message)))})`);
    check(res?.values.s?.value === 28 && /ft/.test(res.values.s.unit) && res.values.spans.text === '[16; 12] ft', `[16 ft; 12 ft]: sum is 28 ft, the unit shown once (${res?.values.s?.value} ${res?.values.s?.unit}, ${res?.values.spans?.text})`);
    check(res?.values.m2?.value !== undefined && !hasErr(res, /max\(conv\)/), `max of a vector in two units of one dimension: ${JSON.stringify(res?.values.m2)}`);
    check(hasErr(res, /Inconsistent units/, 15), `mixed units (with a unitless element) are an Inconsistent units error on the document's line (${JSON.stringify((res?.errors ?? []).filter((e) => /nconsistent/.test(e.message)).map((e) => e.line))})`);
    // a vector with the comma form
    r = await define({ Mz_members: '[1, 2, 3]', member_nums: '[1; 2; 12]' }, undefined, (d) => d.values.Mz_members?.value?.length === 3);
    check(r.results.at(-1)?.values.Mz_members?.value.length === 3, 'the comma form [1, 2, 3] is a vector too');

    // size and timing: 3, 2000 and 5000 elements, and a loop over them
    await loadDoc('<!--sheet-->\nns: len(big_v)\nsm: sum(big_v)\nmx: max(big_v)\nfor i in 1..3:\n    t: big_v.i\nlast: big_v.ns\n', 50);
    for (const count of [3, 2000, 5000]) {
        const lit = `[${Array.from({ length: count }, (_, i) => `${((i % 97) + 1) * 0.5} kN*m`).join('; ')}]`;
        const t0 = Date.now();
        r = await define({ big_v: lit }, undefined, (d) => d.values.ns?.value === count, 300);
        const ms = Date.now() - t0;
        res = r.results.at(-1);
        const expectSum = Array.from({ length: count }, (_, i) => ((i % 97) + 1) * 0.5).reduce((a, b) => a + b, 0);
        check(res?.values.ns?.value === count && Math.abs(res.values.sm.value - expectSum) < 1e-6 && res.values.big_v.value.length === count && res.values.t.value === 1.5 && (res.errors ?? []).length === 0,
            `a vector of ${count} elements (${Math.round(lit.length / 1024)} KB): len, sum, max, a loop and an index all work, ${ms} ms to the results (errors ${JSON.stringify(res?.errors)})`);
    }

    // templates over model data: a count, an empty scope, a loop of a few hundred passes, an alias with the units kept
    {
        const l = await exchange({ type: 'civilkit-define', values: { Mz_empty: '[]' } }, (x) => types(x, 'civilkit-error').length > 0, 60);
        check(/empty vector \[\] cannot be defined/.test(types(l, 'civilkit-error')[0]?.data.errors[0] ?? ''), 'an empty vector [] is refused, with the convention in the message (a count of 0 instead)');
        const T = [
            '<!--sheet-->', 'n_sel: len(nums_sel)', 'k: n_selected', 'if n_selected > 0:', '    for i in 1..n_selected:', '        M: Mz_selected.i', '        num: nums_selected.i',
            '    for x in Mz_selected:', '        y: x', '    s: sum(Mz_selected)', 'z: 1', '',
        ].join('\n');
        await loadDoc(T, 80);
        r = await define({ n_selected: '0' }, undefined, (d) => d.values.k?.value === 0);
        res = r.results.at(-1);
        check(res?.values.z?.value === 1 && (res.errors ?? []).filter((e) => e.line !== 2).length === 0, `n = 0 with no vector defined: the loops inside "if n_selected > 0:" are silent, the names they mention need not exist (errors ${JSON.stringify((res?.errors ?? []).map((e) => [e.line, e.message.slice(0, 40)]))})`);
        check(hasErr(res, /Undefined variable/, 2), 'while a use outside the guard (len(nums_sel) on line 2) is the usual undefined-variable error');
        await loadDoc('<!--sheet-->\nn0: 0\nfor i in 1..n0:\n    t: i\n', 81);
        await define({});
        res = await lastRes(0);
        check(res?.values.t?.value === 0, `for i in 1..n with n = 0 is NOT zero passes: it counts down, i = 1 then 0 (t ends ${res?.values.t?.value}); guard with "if n > 0:"`);
        // a scope of three, the same template
        await loadDoc(T, 82);
        r = await define({ n_selected: '3', Mz_selected: '[-245.3 kN*m; 120.4 kN*m; -61 kN*m]', nums_selected: '[1; 2; 12]' }, undefined, (d) => d.values.s !== undefined);
        res = r.results.at(-1);
        check(res?.values.n_selected?.value === 3 && res.values.M?.value === -61 && res.values.num?.value === 12 && Math.abs(res.values.s.value + 185.9) < 1e-9 && /kN/.test(res.values.s.unit) && !hasErr(res, /./, 5), `the same template with 3 members: the loop prints a quantity per pass (M ends ${res?.values.M?.value} ${res?.values.M?.unit}, num ${res?.values.num?.value}, sum ${res?.values.s?.value})`);
        // a few hundred passes: a quantity line per pass, two per pass, with the timing
        const N = 300;
        const big = `[${Array.from({ length: N }, (_, i) => `${(i + 1) * 0.5} kN*m`).join('; ')}]`;
        const nums = `[${Array.from({ length: N }, (_, i) => i + 1).join('; ')}]`;
        await loadDoc(T, 83);
        const t0 = Date.now();
        r = await define({ n_selected: String(N), Mz_selected: big, nums_selected: nums }, undefined, (d) => d.values.M?.value === N * 0.5, 300);
        const ms = Date.now() - t0;
        res = r.results.at(-1);
        check(res?.values.M?.value === N * 0.5 && res.values.num.value === N && (res.errors ?? []).filter((e) => e.line !== 2).length === 0, `a loop of ${N} passes with two quantity lines each: ${ms} ms from define to results (errors ${JSON.stringify(res?.errors)})`);
        // an alias: one line switches the scope, units preserved; and the engine converts a vector in place with ->
        await loadDoc('<!--sheet-->\nmoments: Mz_selected\nn: len(moments)\nmx: max(moments)\nsm: sum(moments)\nfor x in moments:\n    y: x\n', 84);
        r = await define({ Mz_selected: '[-245.3 kN*m; 120.4 kN*m; -61 kN*m]' }, undefined, (d) => d.values.sm !== undefined);
        res = r.results.at(-1);
        check(res?.values.moments?.vector && res.values.moments.value.length === 3 && /kN/.test(res.values.moments.unit) && res.values.n.value === 3 && res.values.mx.value === 120.4 && /kN/.test(res.values.mx.unit) && res.values.y.value === -61,
            `an alias (moments: Mz_selected) is the vector with its units: len ${res?.values.n?.value}, max ${res?.values.mx?.value} ${res?.values.mx?.unit}, loop over it (y ${res?.values.y?.value} ${res?.values.y?.unit}); moments ${JSON.stringify(res?.values.moments?.text)}`);
        await loadDoc('<!--sheet-->\nmoments: Mz_selected\nc: moments -> N*m\nmx: max(moments)\n', 85);
        r = await define({ Mz_selected: '[-245.3 kN*m; 120.4 kN*m; -61 kN*m]' }, undefined, (d) => d.values.mx !== undefined);
        res = r.results.at(-1);
        check(res?.values.c?.vector && /N/.test(res.values.c.value?.[0]?.unit ?? res.values.c.unit) && res.values.mx.value > 1000, `v -> N*m converts the vector itself in place, aliases and the host's vector included (mx ${res?.values.mx?.value} ${res?.values.mx?.unit}, Mz_selected ${JSON.stringify(res?.values.Mz_selected?.text)})`);
        // the template of the guide: an alias and a loop inside the guard, for an empty scope and for three members
        const TT = ['<!--sheet-->', 'if n_selected > 0:', '    moments: Mz_selected', '    for i in 1..n_selected:', '        num: nums_selected.i', '        M: moments.i', '    M_max: max(moments)', 'z: 1', ''].join('\n');
        await loadDoc(TT, 86);
        r = await define({ n_selected: '0' }, undefined, (d) => d.values.z?.value === 1);
        res = r.results.at(-1);
        check(res?.values.z?.value === 1 && (res.errors ?? []).length === 0 && !res.values.M_max, `the guide's template with an empty scope (n_selected = 0) runs without errors (${JSON.stringify(res?.errors)})`);
        r = await define({ n_selected: '3', Mz_selected: '[-245.3 kN*m; 120.4 kN*m; -61 kN*m]', nums_selected: '[1; 2; 12]' }, undefined, (d) => d.values.M_max !== undefined);
        res = r.results.at(-1);
        check(res?.values.M_max?.value === 120.4 && /kN/.test(res.values.M_max.unit) && res.values.M.value === -61 && res.values.num.value === 12 && (res.errors ?? []).length === 0, `and with 3 members (M_max ${res?.values.M_max?.value} ${res?.values.M_max?.unit}; errors ${JSON.stringify(res?.errors)})`);
        await define({});
    }

    // notes: a decoration with the hover note on the host's names in the editor
    await loadDoc('<!--sheet-->\nuse: Mz_M54*2\nother: 4\n', 60);
    r = await define({ Mz_M54: '-1.79 kN*m' }, { Mz_M54: 'from model: M54 Mz, solved results' }, (d) => d.values.use !== undefined);
    await settle(800);
    const decos = await app().evaluate(() => window.calcpadActiveEditor.getModel().getAllDecorations().filter((d) => d.options.inlineClassName === 'ck-host-var').map((d) => ({ line: d.range.startLineNumber, hover: d.options.hoverMessage?.value ?? '' })));
    check(decos.length === 1 && decos[0].line === 2 && /from model: M54 Mz/.test(decos[0].hover), `the host's name is drawn in the editor with the note as its hover (${JSON.stringify(decos)})`);
    const colour = await app().evaluate(() => { const el = document.querySelector('.monaco-editor .ck-host-var'); return el ? getComputedStyle(el).textDecorationLine : null; });
    check(colour === 'underline', `the decoration is styled (${colour})`);
    // the editor's own check (the engine's lint) knows the name: a squiggle under the use of an undefined name goes away once it is defined
    const squiggles = () => app().evaluate(() => document.querySelectorAll('.monaco-editor .squiggly-error').length);
    await define({});
    const withoutDef = await until(squiggles, (n) => n > 0, 40);
    await define({ Mz_M54: '-1.79 kN*m' });
    const withDef = await until(squiggles, (n) => n === 0, 40);
    check(withoutDef > 0 && withDef === 0, `the editor's checks know a defined name: the squiggle under its use is gone after civilkit-define (${withoutDef} before, ${withDef} after)`);

    // names: completion offers them as the engineer types
    check((await exchange({ type: 'civilkit-names', items: 'x' }, (x) => types(x, 'civilkit-error').length > 0, 40)).length > 0, 'civilkit-names with bad items is refused');
    await send({ type: 'civilkit-names', items: [{ name: 'Mz_M12', unit: 'kN*m', detail: 'member 12 Mz, peak' }, { name: 'Mz_M13', unit: 'kN*m', detail: 'member 13 Mz' }, { name: 'length_M1', unit: 'm', detail: 'member 1 length' }] });
    await settle(300);
    await app().evaluate(() => {
        const ed = window.calcpadActiveEditor;
        const m = ed.getModel();
        const last = m.getLineCount();
        ed.focus();
        ed.executeEdits('t', [{ range: { startLineNumber: last, startColumn: m.getLineMaxColumn(last), endLineNumber: last, endColumn: m.getLineMaxColumn(last) }, text: 'v: Mz_M1' }]);
        ed.setPosition({ lineNumber: last, column: m.getLineMaxColumn(last) });
        ed.trigger('test', 'editor.action.triggerSuggest', {});
    });
    const rows = await until(() => app().evaluate(() => Array.from(document.querySelectorAll('.suggest-widget .monaco-list-row')).map((x) => x.textContent)), (l) => l.some((t) => /Mz_M12/.test(t)), 40);
    check((rows ?? []).some((t) => /Mz_M12/.test(t) && /kN/.test(t)) && (rows ?? []).some((t) => /Mz_M13/.test(t)) && !(rows ?? []).some((t) => /length_M1/.test(t)), `completion offers the host's names that match what is typed, with their unit (${JSON.stringify((rows ?? []).slice(0, 3))})`);
    await app().evaluate(() => window.calcpadActiveEditor.trigger('test', 'hideSuggestWidget', {}));
    await send({ type: 'civilkit-names', items: [] });

    // lost variables: a line read as text, or one that fails, is reported with its line
    await loadDoc('<!--sheet-->\na1: 245.3 kN*m   // x\nb: a1*2\n', 70);
    await define({});
    await settle(800);
    res = await lastRes(0);
    check(hasErr(res, /Invalid syntax/, 2) && hasErr(res, /Undefined variable/, 3), `a line that fails (a trailing // note) is reported with its line, and so is the use of the lost name (${JSON.stringify((res?.errors ?? []).map((e) => [e.line, e.message.slice(0, 30)]))})`);
    await loadDoc('<!--sheet-->\na1: 245.3 kN*m <!-- c -->\nb: 1\n', 71);
    await settle(1000);
    res = await lastRes(0);
    check((res?.errors ?? []).some((e) => e.severity === 'warning' && e.line === 2 && /a1/.test(e.message)), `a definition read as text is a warning on its line even when nothing uses it (${JSON.stringify(res?.errors)})`);
    await define({});
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
