// The embed view (docs/embedding.md): `/calcs/?embed=1&sample=<id>` shows one sample as an input form and its live
// results, for an iframe on another site or on our own landing pages. It reuses the app's calculation path (the wasm
// transport answers /api/calcpad/convert in the page) but none of the app's chrome or state: no editor, no ribbon,
// no tabs, nothing written to localStorage or IndexedDB, no service worker registration, no network request beyond
// the app's own static files.
//
// Parameters: sample=<manifest id>, theme=light|dark|auto, mode=input|results|both, hide=title,
// embed=edit (a compact text editor below), allowpython=1 (Python blocks may run, after the usual question).
//
// postMessage API (only with the embedding page, event.source === window.parent):
//   to the host    {type:'civilkit-embed-height', height}   on every layout change
//                  {type:'civilkit-ready', sample, inputs}   once the form is built
//                  {type:'civilkit-results', sample, values:{name:{value, unit, text}}, errors:[{line, severity, message}]}   after each calculation
//                  {type:'civilkit-error', errors:[...]}     a civilkit-set that was refused (in full or in part)
//   from the host  {type:'civilkit-set', values:{L: 8}}     set inputs by name (checked: a known name, a finite number
//                                                            within the slider bounds, one of the options)
//                  {type:'civilkit-get'}                    post the last results again
//                  {type:'civilkit-load', source, files?, values?, name?, promote?}   show the host's own sheet or worksheet text
//                                                            (with `?host=1` the embed starts empty and waits for it)
// Inlined (?inline) rather than imported as style sheets: the entry's one dynamic import would otherwise preload the
// app's style sheets instead of these.
import tokensCss from '../styles/civilkit-tokens.css?inline';
import formCss from './form.css?inline';
import embedCss from './embed.css?inline';
import { installWasmTransport } from '../wasm/transport';
import { compileSheet, isSheetText } from '../wasm/sheet';
import { loadManifest, sampleSource, type Sample } from '../wasm/samples';
import { buildApiSettings, DEFAULT_CALCPAD_SETTINGS } from 'calcpad-frontend/types/settings';
import { buildField, el, showValue } from './form';
import { checkValue, parseInputs, promoteNumberLines, pythonBlocks, withoutPython, type EmbedInput } from './inputs';

const DEFAULT_SAMPLE = 'template-simply-supported-beam';
const params = new URLSearchParams(window.location.search);
const editMode = params.get('embed') === 'edit';
const sampleId = params.get('sample') || DEFAULT_SAMPLE;
const themeParam = ((v) => (v === 'light' || v === 'dark' ? v : 'auto'))(params.get('theme'));
const viewMode = ((v) => (v === 'input' || v === 'results' ? v : 'both'))(params.get('mode'));
const hidden = new Set((params.get('hide') ?? '').split(',').map((s) => s.trim()));
const allowPython = params.get('allowpython') === '1';
/** `?host=1`: no sample; the host supplies the text with civilkit-load. */
const hostMode = params.get('host') === '1';

const base = new URL(import.meta.env.BASE_URL || './', document.baseURI).href;
const framed = window.parent !== window;
/** Where messages to the host go: its origin when the browser tells us (Chromium), else any (the host is whoever framed us). */
const hostOrigin = (() => {
    const o = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0];
    return o && o !== 'null' ? o : '*';
})();
const toHost = (msg: Record<string, unknown>) => { if (framed) window.parent.postMessage(msg, hostOrigin); };

const transport = installWasmTransport();
transport.pythonScope = () => 'embed';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

document.head.append(Object.assign(document.createElement('style'), { textContent: tokensCss + formCss + embedCss }));

// ---- theme --------------------------------------------------------------------------------------------------------
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const theme = (): 'light' | 'dark' => (themeParam === 'auto' ? (dark.matches ? 'dark' : 'light') : themeParam);
const paintTheme = () => { document.documentElement.dataset.theme = theme(); };
paintTheme();

// ---- the page -----------------------------------------------------------------------------------------------------
/** The name the results are reported under and the engine's source path uses: the sample id, or what the host called its text. */
let docId = hostMode ? 'host' : sampleId;
const openUrl = new URL(`./?sample=${encodeURIComponent(sampleId)}`, base).href;
const root = el('div', { className: 'ce', 'data-mode': viewMode });
const title = el('h1', { className: 'ce-title' }, 'Loading...');
if (hidden.has('title')) title.classList.add('ce-sr');
const open = el('a', { className: 'ce-open', href: openUrl, target: '_blank', rel: 'noopener' }, 'Open in CivilKit Calcs', el('span', { className: 'ce-sr' }, ' (opens in a new tab)'));
const head = el('header', { className: 'ce-head' }, title, open);
const note = el('div', { className: 'ce-note', role: 'note', hidden: true });
const form = el('form', { className: 'ce-form', 'aria-label': 'Inputs', noValidate: true });
form.addEventListener('submit', (e) => e.preventDefault());
const frame = el('iframe', { className: 'ce-frame', title: 'Results', sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox' } as never) as HTMLIFrameElement;
const status = el('p', { className: 'ce-status', role: 'status', 'aria-live': 'polite' });
const results = el('section', { className: 'ce-results', 'aria-label': 'Results' }, frame, status);
const body = el('div', { className: 'ce-body' });
if (viewMode !== 'results') body.append(form);
if (viewMode !== 'input') body.append(results);
root.append(head, note, body);
document.getElementById('app')?.replaceWith(root);
if (!root.isConnected) document.body.append(root);
document.querySelector('noscript')?.remove();

// ---- state --------------------------------------------------------------------------------------------------------
let sample: Sample | null = null;
let source = '';          // the sheet text as written (the edit box holds it)
let content = '';         // what the engine is given: Python left out unless allowed, number lines made inputs
let extraFiles: Record<string, string> = {};
let images = (html: string) => html;
let inputs: EmbedInput[] = [];
const values = new Map<string, string>();
let lastResults: Record<string, unknown> | null = null;
/** The errors the last convert reported (macros and the like), merged into the problems sent with the results. */
let lastErrors: { line: number | null; message: string }[] = [];
const settings = buildApiSettings(DEFAULT_CALCPAD_SETTINGS);

const api = (endpoint: string) => `${window.location.origin}/api/calcpad/${endpoint}`;
const overrides = () => Object.fromEntries(values);
const request = () => ({
    content, settings, outputFormat: 'html', forPrint: false, theme: theme(), enableUi: false, uiOverrides: overrides(),
    includeLineAnchors: false, hideErrorLines: true, write: false, extraFiles, sourceFilePath: `/${docId}.${isSheetText(content) ? 'sheet' : 'cpd'}`,
});

// ---- the form (form.ts) --------------------------------------------------------------------------------------------
const fieldOptions = {
    idPrefix: 'ce-in',
    value: (name: string) => values.get(name),
    changed: (input: EmbedInput, v: string) => { values.set(input.name, v); schedule(); },
};

function buildForm(): void {
    form.replaceChildren();
    if (!inputs.length) form.append(el('p', { className: 'ce-empty' }, 'This sheet has no inputs to change.'));
    for (const i of inputs) form.append(buildField(i, fieldOptions));
}

// ---- calculation --------------------------------------------------------------------------------------------------
let timer = 0;
let running = false;
let again = false;
function schedule(delay = 90): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void render(); }, delay);
}

/** The results page: links open in a new tab, and the page reports its height so the frame can fit it. */
function prepare(html: string): string {
    const extra = '<base target="_blank"><style>html,body{overflow:hidden!important}</style><script>(function(){'
        + 'var last=0;function h(){var b=document.body;if(!b)return;var r=Math.ceil(b.getBoundingClientRect().bottom+(parseFloat(getComputedStyle(b).marginBottom)||0)+window.scrollY);'
        + 'if(r!==last){last=r;parent.postMessage({type:"civilkit-results-height",height:r},"*")}}'
        + 'document.addEventListener("DOMContentLoaded",function(){h();new ResizeObserver(h).observe(document.body)});addEventListener("load",h)})()</script>';
    const i = html.search(/<head[^>]*>/i);
    if (i < 0) return extra + html;
    const end = html.indexOf('>', i) + 1;
    return html.slice(0, end) + extra + html.slice(end);
}

window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data as { type?: unknown; height?: unknown };
    if (d?.type === 'civilkit-results-height' && typeof d.height === 'number' && Number.isFinite(d.height)) {
        frame.style.height = `${Math.max(80, Math.min(d.height, 20000))}px`;
    }
});

async function render(): Promise<void> {
    if (running) { again = true; return; }
    running = true;
    results.setAttribute('aria-busy', 'true');
    status.textContent = 'Calculating...';
    try {
        const res = await fetch(api('convert'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request()) });
        if (!res.ok) throw new Error(await res.text());
        const errors = JSON.parse(decodeURIComponent(res.headers.get('X-Calcpad-Errors') ?? '%5B%5D')) as { sourceLine?: number; message?: string }[];
        lastErrors = errors.slice(0, 50).map((e) => ({ line: typeof e.sourceLine === 'number' && e.sourceLine > 0 ? e.sourceLine : null, message: String(e.message ?? '').slice(0, 300) }));
        frame.srcdoc = prepare(images(await res.text()));
        status.textContent = errors.length ? `Calculated, with ${errors.length} error${errors.length === 1 ? '' : 's'} in the sheet.` : 'Calculated.';
        if (framed && !again) await postResults();
    } catch (err) {
        status.textContent = 'The calculation failed.';
        frame.srcdoc = `<p style="font:14px system-ui,sans-serif;color:#b00">The calculation failed: ${esc(String(err instanceof Error ? err.message : err)).slice(0, 400)}</p>`;
    } finally {
        running = false;
        results.removeAttribute('aria-busy');
        if (again) { again = false; schedule(0); }
    }
}

/** What the variables came to (the transport's values endpoint), to the host. */
/** The sheet's errors for the host: the ones the engine writes into the page (a unit clash, an undefined name) with their line in the
 *  host's text (counted from 1), merged with what the convert reported itself. One more engine run, with line anchors, which is how the
 *  page tells an error's line; it is only made when framed. */
async function sheetProblems(): Promise<{ line: number | null; severity: 'error'; message: string }[]> {
    const out = lastErrors.map((e) => ({ line: e.line, severity: 'error' as const, message: e.message }));
    try {
        const res = await fetch(api('convert'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request(), includeLineAnchors: true }) });
        if (res.ok) {
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            for (const el of Array.from(doc.querySelectorAll('span.err')).slice(0, 50)) {
                const n = Number(el.getAttribute('data-source-line'));
                const line = Number.isFinite(n) && n > 0 ? n : null;
                const message = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
                if (message && !out.some((o) => o.line === line && o.message === message)) out.push({ line, severity: 'error', message });
            }
        }
    } catch { /* the results go without the problems */ }
    return out.slice(0, 50);
}

async function postResults(): Promise<void> {
    const problems = await sheetProblems();
    const res = await fetch(api('values'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request()) });
    if (!res.ok) return;
    const { variables } = (await res.json()) as { variables: { name: string; value: string; unit: string }[] };
    const out: Record<string, { value: number | string; unit: string; text: string }> = {};
    for (const v of variables) {
        const n = Number(v.value);
        const value = v.value.trim() !== '' && Number.isFinite(n) ? n : v.value;
        out[v.name] = { value, unit: v.unit ?? '', text: `${v.value}${v.unit ? ' ' + v.unit : ''}` };
    }
    lastResults = { type: 'civilkit-results', sample: docId, values: out, errors: problems };
    toHost(lastResults);
}

// ---- the host -----------------------------------------------------------------------------------------------------
/** Sets inputs from a host's `values`; the refused ones come back as messages. */
function applyValues(raw: Record<string, unknown>): { errors: string[]; changed: boolean } {
    const errors: string[] = [];
    let changed = false;
    for (const [name, v] of Object.entries(raw).slice(0, 200)) {
        const input = inputs.find((i) => i.name === name);
        if (!input) { errors.push(`${String(name).slice(0, 60)}: not an input of this sheet`); continue; }
        const c = checkValue(input, v);
        if (!c.ok) { errors.push(c.error); continue; }
        if (values.get(name) !== c.value) { values.set(name, c.value); changed = true; }
        showValue(form, input.name, input, c.value);
    }
    return { errors, changed };
}

const MAX_SOURCE = 1_000_000;       // characters of sheet text in one civilkit-load
const MAX_FILES = 5_000_000;        // base64 characters of attached files in one civilkit-load
const FILE_NAME = /^(?!\/)(?!.*\.\.)[\w .,()+\-\/]{1,120}\.(cpd|txt|csv|xlsx|xlsm)$/i;
const DOC_NAME = /^[\w.\-]{1,60}$/;

/** What a civilkit-load asks for, checked: the text, the files (a name that is a plain relative path, its bytes in base64), the name. */
function checkLoad(d: { source?: unknown; files?: unknown; values?: unknown; name?: unknown; promote?: unknown }): { ok: true; source: string; files: Record<string, string>; name: string; promote: boolean } | { ok: false; error: string } {
    if (typeof d.source !== 'string' || d.source.trim() === '') return { ok: false, error: 'source must be the sheet text' };
    if (d.source.length > MAX_SOURCE) return { ok: false, error: `source is over ${MAX_SOURCE} characters` };
    const files: Record<string, string> = {};
    if (d.files !== undefined) {
        if (!d.files || typeof d.files !== 'object' || Array.isArray(d.files)) return { ok: false, error: 'files must be an object of name to base64 text' };
        let total = 0;
        for (const [k, v] of Object.entries(d.files as Record<string, unknown>)) {
            if (!FILE_NAME.test(k)) return { ok: false, error: `files: "${k.slice(0, 60)}" is not a relative .cpd, .txt, .csv, .xlsx or .xlsm name` };
            if (typeof v !== 'string' || !/^[A-Za-z0-9+/=\s]*$/.test(v)) return { ok: false, error: `files: "${k}" is not base64 text` };
            total += v.length;
            if (total > MAX_FILES) return { ok: false, error: `files are over ${MAX_FILES} characters in all` };
            files[k] = v;
        }
    }
    if (d.name !== undefined && (typeof d.name !== 'string' || !DOC_NAME.test(d.name))) return { ok: false, error: 'name must be letters, digits, dot, dash or underscore (up to 60)' };
    if (d.promote !== undefined && typeof d.promote !== 'boolean') return { ok: false, error: 'promote must be true or false' };
    return { ok: true, source: d.source, files, name: typeof d.name === 'string' ? d.name : 'host', promote: d.promote === true };
}

// One load at a time, in the order sent: each rebuilds the form, then the results follow.
let loading: Promise<void> = Promise.resolve();

window.addEventListener('message', (e) => {
    if (!framed || e.source !== window.parent) return;
    const d = e.data as { type?: unknown; values?: unknown; source?: unknown; files?: unknown; name?: unknown; promote?: unknown };
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    if (d.type === 'civilkit-get') { if (lastResults) toHost(lastResults); return; }
    if (d.type === 'civilkit-load') {
        const c = checkLoad(d);
        if (!c.ok) { toHost({ type: 'civilkit-error', errors: [c.error] }); return; }
        loading = loading.then(async () => {
            try {
                docId = c.name;
                extraFiles = c.files;
                images = (html: string) => html;
                lastResults = null;
                lastErrors = [];
                values.clear();
                title.textContent = c.name;
                document.title = `${c.name}: CivilKit Calcs`;
                await useSource(c.source, c.promote);
                const set = d.values && typeof d.values === 'object' && !Array.isArray(d.values) ? applyValues(d.values as Record<string, unknown>) : { errors: [], changed: false };
                if (set.errors.length) toHost({ type: 'civilkit-error', errors: set.errors });
                postReady();
                await render();
            } catch (err) {
                toHost({ type: 'civilkit-error', errors: [`the text could not be loaded: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`] });
            }
        });
        return;
    }
    if (d.type !== 'civilkit-set') return;
    if (!d.values || typeof d.values !== 'object' || Array.isArray(d.values)) {
        toHost({ type: 'civilkit-error', errors: ['values must be an object of input names'] });
        return;
    }
    const { errors, changed } = applyValues(d.values as Record<string, unknown>);
    if (errors.length) toHost({ type: 'civilkit-error', errors });
    if (changed) schedule(0);
    else if (!errors.length && lastResults) toHost(lastResults);
});

// The embed's own height, for a host that resizes the frame (embed.js).
let lastHeight = 0;
new ResizeObserver(() => {
    const h = Math.ceil(root.getBoundingClientRect().height);
    if (h !== lastHeight) { lastHeight = h; toHost({ type: 'civilkit-embed-height', height: h }); }
}).observe(root);

// ---- the sheet ----------------------------------------------------------------------------------------------------
async function useSource(text: string, promote = true): Promise<void> {
    source = text;
    const py = pythonBlocks(text);
    let run = allowPython || !py.length ? text : withoutPython(text);
    const sheet = isSheetText(run);
    if (sheet && promote) run = promoteNumberLines(run);
    content = run;
    note.replaceChildren();
    note.hidden = !(py.length && !allowPython);
    if (!note.hidden) {
        note.append(
            el('p', {}, `This sheet has ${py.length === 1 ? 'a Python block' : `${py.length} Python blocks`}. An embed does not run Python, so results that need it are missing here. `,
                el('a', { href: openUrl, target: '_blank', rel: 'noopener' }, 'Open it in CivilKit Calcs'), ' to run it.'),
            el('details', {}, el('summary', {}, 'Show the Python'), el('pre', {}, py.join('\n\n'))),
        );
    }
    const calcpad = sheet ? (await compileSheet(run)).text : run;
    const next = parseInputs(calcpad);
    for (const k of [...values.keys()]) if (!next.some((i) => i.name === k)) values.delete(k);
    inputs = next;
    buildForm();
}

function addEditor(): void {
    const area = el('textarea', { className: 'ce-editor', spellcheck: false, value: source, rows: 12, 'aria-label': 'Sheet text' });
    let t = 0;
    area.addEventListener('input', () => {
        window.clearTimeout(t);
        t = window.setTimeout(async () => { await useSource(area.value); schedule(0); }, 400);
    });
    root.append(el('details', { className: 'ce-edit' }, el('summary', {}, 'Edit the sheet'), area,
        el('p', { className: 'ce-hint' }, 'Changes stay in this page. Open in CivilKit Calcs for the full editor.')));
}

function fail(message: string): void {
    title.textContent = 'CivilKit Calcs';
    title.classList.remove('ce-sr');
    body.replaceChildren(el('p', { className: 'ce-missing' }, message, ' ', el('a', { href: new URL('./embed/', base).href, target: '_blank', rel: 'noopener' }, 'See the samples that can be embedded.')));
}

async function start(): Promise<void> {
    if (hostMode) {
        title.textContent = 'Waiting for the host';
        open.hidden = true;
        buildForm();
        postReady();
        return;
    }
    try {
        const m = await loadManifest();
        sample = m.samples.find((s) => s.id === sampleId) ?? null;
    } catch { /* fall through */ }
    if (!sample) { fail(`There is no sample "${sampleId}".`); return; }
    title.textContent = sample.title;
    document.title = `${sample.title}: CivilKit Calcs`;
    frame.title = `Results: ${sample.title}`;
    const src = await sampleSource(sample);
    extraFiles = src.extraFiles;
    images = src.images;
    await useSource(src.text);
    if (editMode) addEditor();
    postReady();
    await render();
}

function postReady(): void {
    toHost({ type: 'civilkit-ready', sample: hostMode ? null : docId, inputs: inputs.map(({ name, kind, label, unit, value, min, max, step, options }) => ({ name, kind, label, unit, value, min, max, step, options })) });
}

if (themeParam === 'auto') dark.addEventListener('change', () => { paintTheme(); schedule(0); });
start().catch((err) => fail(`The sample could not be loaded (${String(err instanceof Error ? err.message : err).slice(0, 200)}).`));
