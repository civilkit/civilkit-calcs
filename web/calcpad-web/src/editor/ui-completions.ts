import * as monaco from 'monaco-editor';
import { calcpadBlockAt } from './nav/context';

/**
 * Completion for the `ui` module of interactive panels (public/py/lib/ui.py, guide: Interactive panels) inside a Python block:
 * type `ui.` and the controls, layouts and helpers are offered with their signature and a line of help. The Python language in the
 * editor has no completion of its own, so this is the only list there; it offers nothing unless the cursor is in a Python block and
 * the line is a `ui.` access.
 */
interface UiItem { name: string; snippet: string; detail: string; doc: string; kind: monaco.languages.CompletionItemKind }

const K = monaco.languages.CompletionItemKind;

export const UI_ITEMS: UiItem[] = [
    { name: 'slider', kind: K.Function, snippet: 'slider("${1:name}", ${2:default}, ${3:min}, ${4:max}, step=${5:1}, unit="${6}", label="${7}")',
      detail: 'ui.slider(name, default, min, max, step=None, unit="", label=None, sheet=False)',
      doc: 'A slider. The function receives a number between min and max. `sheet=True` also writes the value into the sheet input of the same name when the slider is released.' },
    { name: 'number', kind: K.Function, snippet: 'number("${1:name}", ${2:default}, ${3:min}, ${4:max}, unit="${5}", label="${6}")',
      detail: 'ui.number(name, default, lo=None, hi=None, step=None, unit="", label=None, sheet=False)',
      doc: 'A box to type a number in, applied on Enter or when the box is left. A value outside lo and hi is brought back to the nearest.' },
    { name: 'select', kind: K.Function, snippet: 'select("${1:name}", [${2:("Label", value)}], label="${3}")',
      detail: 'ui.select(name, options, default=None, label=None)',
      doc: 'A drop-down. Options are labels, or (label, value) pairs; the function receives the value of the chosen option.' },
    { name: 'checkbox', kind: K.Function, snippet: 'checkbox("${1:name}", ${2:True}, label="${3}")',
      detail: 'ui.checkbox(name, default=False, label=None)', doc: 'A checkbox; the function receives True or False.' },
    { name: 'player', kind: K.Function, snippet: 'player("${1:name}", ${2:0}, ${3:59}, fps=${4:10}, loop=True, label="${5}")',
      detail: 'ui.player(name, start, stop, fps=5, loop=True, label=None)',
      doc: 'A frame number with Play and Pause. The next frame is asked for only after the last one is drawn; a frame that takes over 1.5 s stops it.' },
    { name: 'button', kind: K.Function, snippet: 'button("${1:name}", "${2:Label}")',
      detail: 'ui.button(name, label=None)', doc: 'A button. The function receives how many times it has been pressed, so each press is a new value.' },
    { name: 'input', kind: K.Function, snippet: 'input("${1:name}", ${2:default})',
      detail: 'ui.input(name, default=None)', doc: "The number in the sheet's own `?` input of that name, for a panel to start from." },
    { name: 'panel', kind: K.Function, snippet: 'panel(${1:widgets}, plotly=False)',
      detail: '@ui.panel(widget, ..., plotly=False)',
      doc: 'Decorator: the function runs now and again, alone, whenever one of its widgets changes. A widget given to two panels is one control.' },
    { name: 'manipulate', kind: K.Function, snippet: 'manipulate(("${1:name}", ${2:min}, ${3:max}), labels={})',
      detail: '@ui.manipulate(("L", 2, 12, 6, 0.5, "m"), ("mode", [..]), ("on", True), labels=None)',
      doc: 'The short form of a panel. One tuple per argument of the function, in order.' },
    { name: 'plot', kind: K.Function, snippet: 'plot(${1:x}, ${2:y}, names=[${3}], xlabel="${4}", ylabel="${5}", ylim=${6:None})',
      detail: 'ui.plot(x, *ys, names=None, xlabel="", ylabel="", title="", xlim=None, ylim=None, height=320)',
      doc: 'A line chart in one call. Give xlim and ylim to keep the axes still while a control moves.' },
    { name: 'table', kind: K.Class, snippet: 'table(${1:rows}, header=[${2}])', detail: 'ui.table(rows, header=None)', doc: 'A small table to return from a panel.' },
    { name: 'text', kind: K.Class, snippet: 'text(${1:s})', detail: 'ui.text(s)', doc: 'Plain text to return from a panel (never HTML).' },
    { name: 'markdown', kind: K.Class, snippet: 'markdown(${1:s})', detail: 'ui.markdown(s)',
      doc: 'A little Markdown: # headings, **bold**, *italic*, `code`, - lists, 1. lists, paragraphs. HTML in it is shown as text.' },
    { name: 'row', kind: K.Class, snippet: 'row(${1:a}, ${2:b})', detail: 'ui.row(*items)', doc: 'Results side by side (they wrap on a narrow screen).' },
    { name: 'column', kind: K.Class, snippet: 'column(${1:a}, ${2:b})', detail: 'ui.column(*items)', doc: 'Results one under another, as one block.' },
    { name: 'tabs', kind: K.Class, snippet: 'tabs(("${1:First}", ${2:a}), ("${3:Second}", ${4:b}))', detail: 'ui.tabs((label, content), ...)', doc: 'Results in tabs.' },
    { name: 'check_panels', kind: K.Function, snippet: 'check_panels()', detail: 'ui.check_panels()',
      doc: 'Calls every panel twice with its starting values and says whether the answers agree: a panel function should depend on its arguments only.' },
];

/** The items offered for the text before the cursor, or null when the cursor is not after `ui.`. */
export function uiPrefix(lineBeforeCursor: string): { word: string } | null {
    const m = /\bui\.(\w*)$/.exec(lineBeforeCursor);
    return m ? { word: m[1] } : null;
}

/** True when 0-based line `lineIdx` is inside a Python block opened above it: `#python` in a worksheet, a ```python fence in a sheet. */
export function inPythonBlock(lines: string[], lineIdx: number, sheet: boolean): boolean {
    if (!sheet) return calcpadBlockAt(lines, lineIdx) === 'python';
    let open = false;
    for (let i = 0; i < lineIdx; i++) {
        if (!open && /^\s*```\s*python\s*$/i.test(lines[i])) open = true;
        else if (open && /^\s*```\s*$/.test(lines[i])) open = false;
    }
    return open;
}

/**
 * Registered on the document languages, not on Python: the editor colours a Python block as embedded code, but the language of the
 * text model there is still the document's, so that is the provider that gets asked.
 */
export function registerUiCompletions(): monaco.IDisposable {
    const make = (sheet: boolean): monaco.languages.CompletionItemProvider => ({
        triggerCharacters: ['.'],
        provideCompletionItems(model, position) {
            const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column));
            const hit = uiPrefix(before);
            if (!hit) return { suggestions: [] };
            if (!inPythonBlock(model.getLinesContent(), position.lineNumber - 1, sheet)) return { suggestions: [] };
            const range = new monaco.Range(position.lineNumber, position.column - hit.word.length, position.lineNumber, position.column);
            return {
                suggestions: UI_ITEMS.map((i) => ({
                    label: i.name,
                    kind: i.kind,
                    detail: i.detail,
                    documentation: { value: i.doc },
                    insertText: i.snippet,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                })),
            };
        },
    });
    const a = monaco.languages.registerCompletionItemProvider('calcpad', make(false));
    const b = monaco.languages.registerCompletionItemProvider('calcpad-sheet', make(true));
    return { dispose() { a.dispose(); b.dispose(); } };
}
