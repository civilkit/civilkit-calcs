// Host mode's commands: what the host's own menus may ask the app to do (`civilkit-command {id}`). Each id runs one of the ribbon's
// existing actions (wasm/ribbon-actions.ts), so a host menu item and the ribbon button are the same thing. Only ids listed here are
// accepted, and none of them opens, saves or lists files, touches the library or recent files, or leaves the page (the host owns those).
import { isSheetEditor, runAction, type RibbonCtx } from '../wasm/ribbon-actions';
import { isSheetText } from '../wasm/sheet';

interface Command {
    /** The ribbon action it runs (ribbon-data.ts). */
    action: string;
    /** Why it cannot run now, or null. */
    unavailable?: (c: RibbonCtx) => string | null;
}

const needsEditor = (c: RibbonCtx): string | null => (c.editor() ? null : 'there is no open document');
const needsSheet = (c: RibbonCtx): string | null => needsEditor(c)
    ?? (isSheetEditor(c.editor()) || isSheetText(c.editor().getModel?.()?.getValue?.() ?? '') ? null : 'the document is not a sheet');
const needsFn = (f: (c: RibbonCtx) => unknown, what: string) => (c: RibbonCtx): string | null => (f(c) ? null : `${what} is not available`);

export const COMMANDS: Record<string, Command> = {
    samples: { action: 'samples', unavailable: needsFn((c) => c.files.o.openSamples, 'the samples browser') },
    export: { action: 'exportTab', unavailable: needsFn((c) => c.files.o.openExport, 'the Export dialog') },
    word: { action: 'word', unavailable: needsFn((c) => c.files.o.exportDocx, 'Word export') },
    excel: { action: 'excel', unavailable: needsFn((c) => c.files.o.exportXlsx, 'Excel export') },
    pdf: { action: 'pdf' },
    showcompiled: { action: 'showcompiled', unavailable: needsSheet },
    symbolic: { action: 'symbolic', unavailable: needsEditor },
    find: { action: 'find', unavailable: needsEditor },
    undo: { action: 'undo', unavailable: needsEditor },
    redo: { action: 'redo', unavailable: needsEditor },
    calculate: { action: 'calc' },
    settings: { action: 'settings' },
    insert: { action: 'tab:insert' },
    variables: { action: 'tab:variables' },
    errors: { action: 'tab:errors' },
    contents: { action: 'tab:toc' },
    format: { action: 'tab:formatting' },
    preview: { action: 'mode:preview' },
    unwrapped: { action: 'mode:unwrapped' },
    inputform: { action: 'mode:ui' },
    report: { action: 'mode:report' },
    shortcuts: { action: 'shortcuts' },
};

/** The ids a host may send, in a stable order (the `commands` of civilkit-ready). */
export const COMMAND_IDS: string[] = Object.keys(COMMANDS);

/** Runs a command: null when it was started, else why it was not. */
export function runCommand(id: unknown, ctx: RibbonCtx | null): string | null {
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(COMMANDS, id)) return `unknown command "${String(id).slice(0, 40)}"`;
    if (!ctx) return `command "${id}" is not available yet`;
    const c = COMMANDS[id];
    const why = c.unavailable?.(ctx);
    if (why) return `command "${id}" cannot run: ${why}`;
    try {
        runAction(c.action, ctx);
    } catch (err) {
        return `command "${id}" failed: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`;
    }
    return null;
}
