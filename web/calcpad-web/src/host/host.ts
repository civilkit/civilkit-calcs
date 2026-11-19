// Host mode (?host=1): the full app as a frame in another program. The host owns the one document; this module is the line to it.
//   host to app:  civilkit-load {source, name?, files?, values?, revision?}   replace the document (no prompt, nothing stored here)
//                 civilkit-theme {mode?, tokens?}                              light | dark | auto, and Studio's design tokens
//                 civilkit-command {id}                                        run one of the `commands` of civilkit-ready (commands.ts)
//                 civilkit-insert {text}                                       put text at the caret (own line), one undo step
//                 civilkit-patch {edits:[{find, replace}]}                     exact one-match replacements, one undo step
//                 civilkit-define {values, notes?}                             variables the host defines, before the document's own lines (define.ts)
//                 civilkit-names {items:[{name, unit, detail}]}                names the editor's completion offers (hostvars.ts)
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
import * as monaco from 'monaco-editor';
import { buildApiSettings } from 'calcpad-frontend/types/settings';
import type { TabManager } from '../tabs/tab-manager';
import type { FileLibrary } from '../wasm/library';
import { compileSheet, isSheetText } from '../wasm/sheet';
import { pythonBlocks, withoutPython } from '../embed/inputs';
import { framed, fromHost, toHost } from './channel';
import { COMMAND_IDS, runCommand } from './commands';
import { syncEditorTheme } from './monaco-tokens';
import { onAppThemeChanged } from '../editor/app-theme';
import { ribbonContext } from '../wasm/ribbon';
import { planInsert, planPatch, type PlannedEdit } from './edits';
import { buildPrelude, checkDefine, checkNames, documentDefinitions, vectorValue, type Prelude } from './define';
import { decorate, followEdits, setHostDefined, setHostNames } from './hostvars';
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
    /** Calculates the preview and the editor's checks again (the host's defined variables changed; the document did not). */
    recalc: () => void;
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

    type Problem = { line: number | null; severity: 'error' | 'warning'; message: string };

    /** A sheet line that looks like a definition (`name: 5 kN`) but is read as text (a trailing `<!-- -->`, say): the name is not defined, and
     *  the engine says nothing of it until something uses the name. */
    async function lostDefinitions(content: string): Promise<Problem[]> {
        if (!isSheetText(content)) return [];
        const c = await compileSheet(content);
        const lines = content.split('\n');
        const out: Problem[] = [];
        for (let i = 0; i < lines.length && out.length < 20; i++) {
            if (c.kinds[i] !== 'p') continue;
            const m = /^\s*([A-Za-z_\u00B0-\uFFFF][\w\u00B0-\uFFFF]*)\s*:\s*[-+]?[\d.]/.exec(lines[i]);
            if (m) out.push({ line: i + 1, severity: 'warning', message: `This line is read as text, not as a definition, so ${m[1]} is not defined. Check it for a comment after the value (use "| note" for a note).` });
        }
        return out;
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
        const problems: Problem[] = [];
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
            const { variables, vectors } = (await vres.json()) as { variables: { name: string; value: string; unit: string }[]; vectors?: { name: string; rows: string[][] }[] };
            const vec = new Map((vectors ?? []).map((v) => [v.name, vectorValue(v.rows)]));
            // The host's own variables: the document's definition of the same name wins (it comes later), with a warning that names it.
            const own = prelude ? await documentDefinitions(run, isSheetText(run)) : new Map<string, number>();
            const hostNames = new Set<string>();
            if (prelude) {
                for (const [n, cp] of prelude.calcpad) {
                    const at = own.get(n) ?? own.get(cp);
                    if (at) problems.push({ line: at, severity: 'warning', message: `${n} is defined here and by the host; the document's own value is used from this line on.` });
                    else { hostNames.add(n); hostNames.add(cp); }
                }
            }
            problems.push(...await lostDefinitions(run));
            const values: Record<string, { value: number | string | unknown[]; unit: string; text: string; host?: true; vector?: true }> = {};
            for (const v of variables) {
                const vv = vec.get(v.name);
                if (vv) { values[v.name] = vv; if (hostNames.has(v.name)) values[v.name].host = true; continue; }
                const n = Number(v.value);
                values[v.name] = { value: v.value.trim() !== '' && Number.isFinite(n) ? n : v.value, unit: v.unit ?? '', text: `${v.value}${v.unit ? ' ' + v.unit : ''}` };
                if (hostNames.has(v.name)) values[v.name].host = true;
            }
            // The engine names a variable the way Calcpad writes it (a sheet's phiMs_M54 is φMs_M54): the host's own spelling is an alias of its value.
            if (prelude) for (const [n, cp] of prelude.calcpad) if (cp !== n && values[cp]?.host && !values[n]) values[n] = values[cp];
            lastResults = { type: 'civilkit-results', name, values, errors: problems.slice(0, 50) };
            toHost(lastResults);
        } catch { /* the host gets no results for this run */ }
    }

    // ---- in: the host's variables (define.ts) and names (hostvars.ts) ---------------------------------------------------------
    let prelude: Prelude | null = null;
    let decorating = false;
    const engine = () => (window as unknown as { calcpadEngine?: { setHostPrelude?: (p: Prelude | null) => void } }).calcpadEngine;
    /** The first unit in a value (`-1.79 kN*m` is kN*m; of a vector, its first element's), for the editor's hover and completion detail. */
    const unitOf = (value: string): string => /^\[?\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?\s*([^\s;,\]]*)/.exec(value)?.[1] ?? '';

    /** The plain lines through the engine, without any earlier prelude: what it says of them, by line. */
    async function engineCheck(plain: string): Promise<{ line: number | null; message: string }[]> {
        const body = {
            content: plain, settings: buildApiSettings(ctx.settings() as never), outputFormat: 'html', forPrint: false, theme: 'light', enableUi: false,
            includeLineAnchors: true, hideErrorLines: true, write: false, sourceFilePath: '/define.cpd', noPrelude: true,   // anchors: the errors carry their line
        };
        const res = await fetch(api('convert'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) return [{ line: null, message: 'the values could not be calculated' }];
        const errs = JSON.parse(decodeURIComponent(res.headers.get('X-Calcpad-Errors') ?? '%5B%5D')) as { sourceLine?: number; message?: string }[];
        return errs.slice(0, 6000).map((e) => ({ line: typeof e.sourceLine === 'number' && e.sourceLine > 0 ? e.sourceLine : null, message: String(e.message ?? '').slice(0, 200) }));
    }

    function drawHostNames(): void {
        const ed = activeEditor();
        if (!ed) return;
        if (!decorating) { decorating = true; followEdits(ed); }
        decorate(ed);
    }

    let defining: Promise<void> = Promise.resolve();
    async function define(d: { values?: unknown; notes?: unknown }): Promise<void> {
        const c = checkDefine(d);
        if (!c.ok) { toHost({ type: 'civilkit-error', errors: [c.error] }); return; }
        const built = await buildPrelude(c.defines, engineCheck);
        if (!built.ok) { toHost({ type: 'civilkit-error', errors: [built.error] }); return; }
        prelude = built.prelude;
        engine()?.setHostPrelude?.(prelude);
        const shown = new Map<string, { unit: string; note: string }>();
        for (const x of c.defines) shown.set(x.name, { unit: unitOf(x.value), note: c.notes[x.name] ?? '' });
        setHostDefined(shown, activeEditor());
        if (shown.size) drawHostNames();
        ctx.recalc();          // the preview and the editor's checks: the document's text did not change, so nothing else would
        scheduleResults(0);
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
            if (prelude) queueMicrotask(drawHostNames);
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
        // Monaco cannot read CSS variables: its theme is defined from the computed values (after the style has been applied).
        queueMicrotask(() => syncEditorTheme(tokenProps.length > 0));
    }
    // A change of the app's own theme re-selects Monaco's theme; with tokens in force the host's one goes back on.
    onAppThemeChanged(() => { if (tokenProps.length) queueMicrotask(() => syncEditorTheme(true)); });

    // ---- in: edits of the open document (edits.ts plans them; Monaco applies each as one undo step, so the host's edit is one Ctrl+Z) ----
    type Editor = monaco.editor.IStandaloneCodeEditor;
    const activeEditor = (): Editor | null => ((window as unknown as { calcpadActiveEditor?: Editor }).calcpadActiveEditor ?? null);
    function applyPlanned(ed: Editor, planned: PlannedEdit[], caretAfter: boolean): void {
        const model = ed.getModel();
        if (!model || !planned.length) return;
        const ops = planned.map((e) => {
            const a = model.getPositionAt(e.start);
            const b = model.getPositionAt(e.end);
            return { range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), text: e.text, forceMoveMarkers: caretAfter };
        });
        ed.pushUndoStop();
        // Insert puts the caret after the new text; a patch leaves the selection where the (moved) text puts it.
        ed.executeEdits('civilkit-host', ops, caretAfter
            ? (inverse) => { const r = inverse[0].range; return [new monaco.Selection(r.endLineNumber, r.endColumn, r.endLineNumber, r.endColumn)]; }
            : undefined);
        ed.pushUndoStop();
    }
    function insertText(raw: unknown): void {
        const ed = activeEditor();
        const model = ed?.getModel();
        const sel = ed?.getSelection();
        if (!ed || !model || !sel) { toHost({ type: 'civilkit-error', errors: ['insert: there is no open document'] }); return; }
        const plan = planInsert(model.getValue(), model.getOffsetAt(sel.getStartPosition()), model.getOffsetAt(sel.getEndPosition()), raw);
        if (!plan.ok) { toHost({ type: 'civilkit-error', errors: [plan.error] }); return; }
        applyPlanned(ed, [plan.edit], true);
        ed.focus();
    }
    function patchText(raw: unknown): void {
        const ed = activeEditor();
        const model = ed?.getModel();
        if (!ed || !model) { toHost({ type: 'civilkit-error', errors: ['patch: there is no open document'] }); return; }
        const plan = planPatch(model.getValue(), raw);
        if (!plan.ok) { toHost({ type: 'civilkit-error', errors: [plan.error] }); return; }
        applyPlanned(ed, plan.edits, false);
        if (plan.errors.length) toHost({ type: 'civilkit-error', errors: plan.errors });
    }

    fromHost((d) => {
        switch (d.type) {
            case 'civilkit-insert':
                insertText(d.text);
                return;
            case 'civilkit-patch':
                patchText(d.edits);
                return;
            case 'civilkit-define':
                defining = defining.then(() => define(d as { values?: unknown; notes?: unknown })).catch((err) => {
                    toHost({ type: 'civilkit-error', errors: [`define failed: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`] });
                });
                return;
            case 'civilkit-names': {
                const c = checkNames(d.items);
                if (!c.ok) { toHost({ type: 'civilkit-error', errors: [c.error] }); return; }
                setHostNames(c.items);
                return;
            }
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
            case 'civilkit-command': {
                const why = runCommand(d.id, ribbonContext());
                if (why) toHost({ type: 'civilkit-error', errors: [why] });
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
    toHost({ type: 'civilkit-ready', caps: [...CAPS], commands: COMMAND_IDS, protocol: PROTOCOL, tokens: Object.keys(TOKEN_MAP) });
}
