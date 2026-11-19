// Host mode (?host=1): the full app as a frame in another program. The host owns the one document; this module is the line to it.
//   host to app:  civilkit-load {source, name?, files?, values?, revision?}   replace the document (no prompt, nothing stored here)
//                 civilkit-theme {mode?, tokens?}                              light | dark | auto, and Studio's design tokens
//                 civilkit-get                                                 repeat the last civilkit-results
//                 civilkit-get-source                                          send civilkit-source now (same revision)
//   app to host:  civilkit-ready {caps, protocol}                              ONCE, when the app takes messages
//                 civilkit-loaded {name, revision}                             after each load, once it is shown and calculated
//                 civilkit-source {source, name, revision}                     after each edit (debounced), never for the host's own load
//                 civilkit-results {name, values, errors}                      after a load and after edits
//                 civilkit-save-request {source, name, revision}               Ctrl+S / Save: the host decides what saving means
//                 civilkit-update-available                                    a newer build is ready (see update-notice.ts)
//                 civilkit-error {errors}                                      a refused message
// Same trust rule as the embed: messages from the parent window only (channel.ts). Docs: docs/embedding.md, "Host mode (full app)".
import { buildApiSettings } from 'calcpad-frontend/types/settings';
import type { TabManager } from '../tabs/tab-manager';
import type { FileLibrary } from '../wasm/library';
import { isSheetText } from '../wasm/sheet';
import { pythonBlocks, withoutPython } from '../embed/inputs';
import { framed, fromHost, toHost } from './channel';
import { CAPS, PROTOCOL, TOKEN_MAP, checkHostLoad, checkTokens, isThemeMode, type HostLoad, type ThemeMode } from './protocol';

export interface HostContext {
    tabs: () => TabManager;
    library?: Pick<FileLibrary, 'put' | 'remove'>;
    settings: () => unknown;
    bridge: unknown;
    setTheme: (mode: ThemeMode) => void;
    /** Shows the results pane (a host that hid it still gets civilkit-results). */
    showPreview: () => void;
    /** The entered values of the #UI inputs, keyed by variable name, as the app's input form keeps them. */
    uiValues: { key: () => string; get: () => Record<string, string>; reset: (values: Record<string, string>) => void };
}

const SOURCE_DEBOUNCE_MS = 300;
const RESULTS_DEBOUNCE_MS = 600;
const RENDER_WAIT_MS = 6000;

export function installHost(ctx: HostContext): void {
    if (!framed) return;                                 // opened on its own: nothing to talk to, the app works as the page it is
    const tabs = () => ctx.tabs();
    const text = (): string => tabs().activeModel?.getValue() ?? '';

    let name = 'host';
    /** The revision of the last text sent to the host (or adopted from its load); every civilkit-source is one more. */
    let revision = 0;
    /** True while a civilkit-load is being put in place: the edit events it causes are the host's own text, not an edit. */
    let applying = false;
    let lastSent = '';
    let loadedFiles: string[] = [];
    let lastResults: Record<string, unknown> | null = null;
    let sourceTimer = 0;
    let resultsTimer = 0;
    let resultsSeq = 0;
    let loading: Promise<void> = Promise.resolve();

    // ---- out: the text after an edit ----------------------------------------------------------------------------------
    const sendSource = (): void => {
        window.clearTimeout(sourceTimer);
        const now = text();
        if (now === lastSent) return;
        lastSent = now;
        revision += 1;
        toHost({ type: 'civilkit-source', source: now, name, revision });
    };
    tabs().onTabContentChanged(() => {
        if (applying) return;
        window.clearTimeout(sourceTimer);
        sourceTimer = window.setTimeout(sendSource, SOURCE_DEBOUNCE_MS);
        scheduleResults();
    });

    // ---- out: the results ---------------------------------------------------------------------------------------------
    const api = (endpoint: string) => `${window.location.origin}/api/calcpad/${endpoint}`;
    function scheduleResults(delay = RESULTS_DEBOUNCE_MS): void {
        window.clearTimeout(resultsTimer);
        resultsTimer = window.setTimeout(() => { void postResults(); }, delay);
    }

    async function postResults(): Promise<void> {
        const seq = ++resultsSeq;
        const content = text();
        // A sheet with Python blocks: the results are of the rest (the run asks its own question in the preview, not here).
        const run = pythonBlocks(content).length ? withoutPython(content) : content;
        const request = {
            content: run,
            settings: buildApiSettings(ctx.settings() as never),
            outputFormat: 'html', forPrint: false, theme: 'light', enableUi: false,
            uiOverrides: ctx.uiValues.get(), includeLineAnchors: true, hideErrorLines: true, write: false,
            sourceFilePath: `/${name}.${isSheetText(run) ? 'sheet' : 'cpd'}`,
        };
        const problems: { line: number | null; severity: 'error'; message: string }[] = [];
        try {
            const res = await fetch(api('convert'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
            if (res.ok) {
                const errs = JSON.parse(decodeURIComponent(res.headers.get('X-Calcpad-Errors') ?? '%5B%5D')) as { sourceLine?: number; message?: string }[];
                for (const e of errs.slice(0, 50)) problems.push({ line: typeof e.sourceLine === 'number' && e.sourceLine > 0 ? e.sourceLine : null, severity: 'error', message: String(e.message ?? '').slice(0, 300) });
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                for (const el of Array.from(doc.querySelectorAll('span.err')).slice(0, 50)) {
                    const n = Number(el.getAttribute('data-source-line'));
                    const line = Number.isFinite(n) && n > 0 ? n : null;
                    const message = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
                    if (message && !problems.some((o) => o.line === line && o.message === message)) problems.push({ line, severity: 'error', message });
                }
            }
            const vres = await fetch(api('values'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
            if (!vres.ok || seq !== resultsSeq) return;      // a newer edit has started another run
            const { variables } = (await vres.json()) as { variables: { name: string; value: string; unit: string }[] };
            const values: Record<string, { value: number | string; unit: string; text: string }> = {};
            for (const v of variables) {
                const n = Number(v.value);
                values[v.name] = { value: v.value.trim() !== '' && Number.isFinite(n) ? n : v.value, unit: v.unit ?? '', text: `${v.value}${v.unit ? ' ' + v.unit : ''}` };
            }
            lastResults = { type: 'civilkit-results', name, values, errors: problems.slice(0, 50) };
            toHost(lastResults);
        } catch { /* the host gets no results for this run */ }
    }

    // ---- in: a document -----------------------------------------------------------------------------------------------
    const b64 = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
    /** Resolves when the preview has shown the next render (it announces the engine's errors when it does), or after a while. */
    const nextRender = (): Promise<void> => new Promise((resolve) => {
        const done = () => { window.removeEventListener('message', on); window.clearTimeout(t); resolve(); };
        const on = (e: MessageEvent) => { if ((e.data as { type?: unknown } | null)?.type === 'updateConvertErrors') done(); };
        const t = window.setTimeout(done, RENDER_WAIT_MS);
        window.addEventListener('message', on);
    });

    async function load(l: HostLoad): Promise<void> {
        window.clearTimeout(sourceTimer);
        applying = true;
        try {
            // The files the sheet reads: this load's, in memory (host mode stores nothing); the last load's are dropped.
            for (const old of loadedFiles) if (!(old in l.files)) await ctx.library?.remove(old);
            loadedFiles = Object.keys(l.files);
            for (const [file, data] of Object.entries(l.files)) await ctx.library?.put(file, b64(data));
            name = l.name;
            revision = l.revision;
            ctx.showPreview();
            const shown = nextRender();
            tabs().newUntitled(l.source, name);
            ctx.uiValues.reset(l.values);
            lastSent = text();
            await shown;
        } finally {
            applying = false;
        }
        toHost({ type: 'civilkit-loaded', name, revision });
        scheduleResults(0);
    }

    // ---- in: the rest -------------------------------------------------------------------------------------------------
    let tokenProps: string[] = [];
    function applyTokens(props: Record<string, string>): void {
        const root = document.documentElement.style;
        for (const p of tokenProps) root.removeProperty(p);
        tokenProps = Object.keys(props);
        for (const [p, v] of Object.entries(props)) root.setProperty(p, v);
    }

    fromHost((d) => {
        switch (d.type) {
            case 'civilkit-load': {
                const c = checkHostLoad(d as Parameters<typeof checkHostLoad>[0]);
                if (!c.ok) { toHost({ type: 'civilkit-error', errors: [c.error] }); return; }
                loading = loading.then(() => load(c.load)).catch((err) => {
                    toHost({ type: 'civilkit-error', errors: [`the document could not be loaded: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`] });
                });
                return;
            }
            case 'civilkit-theme': {
                if (d.mode !== undefined && !isThemeMode(d.mode)) { toHost({ type: 'civilkit-error', errors: ['mode must be light, dark or auto'] }); return; }
                if (d.mode === undefined && d.tokens === undefined) { toHost({ type: 'civilkit-error', errors: ['civilkit-theme needs a mode, tokens, or both'] }); return; }
                const t = checkTokens(d.tokens);
                if (!t.ok) { toHost({ type: 'civilkit-error', errors: [t.error] }); return; }
                if (d.mode !== undefined) ctx.setTheme(d.mode as ThemeMode);
                applyTokens(t.props);        // absent or empty tokens clear the overrides
                return;
            }
            case 'civilkit-get':
                if (lastResults) toHost(lastResults);
                return;
            case 'civilkit-get-source':
                window.clearTimeout(sourceTimer);
                lastSent = text();
                toHost({ type: 'civilkit-source', source: lastSent, name, revision });
                return;
            default:
                return;                       // other types are for later items (completion, bind): ignored, not an error
        }
    });

    // Save / Ctrl+S: the host decides what saving means (web-files.ts raises this event in host mode).
    window.addEventListener('civilkit-host-save', () => {
        sendSource();
        toHost({ type: 'civilkit-save-request', source: text(), name, revision });
    });

    // Ready, once: from here on the app takes civilkit-load.
    toHost({ type: 'civilkit-ready', caps: [...CAPS], protocol: PROTOCOL, tokens: Object.keys(TOKEN_MAP) });
}
