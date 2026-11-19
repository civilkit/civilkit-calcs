// Host mode in Monaco: the host's names. `civilkit-names` feeds the completion list (as the engineer types `Mz_M` the model's variables are offered),
// and the names the host defines (`civilkit-define`) are drawn in the accent colour with the host's note as the hover text, so a value that
// comes from the model does not look like one typed into the sheet. Nothing here touches the document.
import * as monaco from 'monaco-editor';
import type { NameItem } from './define';

let items: NameItem[] = [];
let defined = new Map<string, { unit: string; note: string }>();
let registered = false;
let timer = 0;
let collection: monaco.editor.IEditorDecorationsCollection | null = null;
let collectionFor: monaco.editor.IStandaloneCodeEditor | null = null;

const WORD = /[A-Za-z_°-￿][\w°-￿]*/g;
const MAX_DECORATIONS = 3000;

/** The names offered: the host's list, then the ones it has defined that the list does not carry. */
function offered(): NameItem[] {
    const seen = new Set(items.map((i) => i.name));
    const rest: NameItem[] = [];
    for (const [name, d] of defined) if (!seen.has(name)) rest.push({ name, unit: d.unit, detail: d.note });
    return [...items, ...rest];
}

function registerOnce(): void {
    if (registered) return;
    registered = true;
    for (const language of ['calcpad', 'calcpad-sheet']) {
        monaco.languages.registerCompletionItemProvider(language, {
            provideCompletionItems(model, position) {
                const word = model.getWordUntilPosition(position);
                const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
                const typed = word.word.toLowerCase();
                const list = offered().filter((i) => !typed || i.name.toLowerCase().includes(typed)).slice(0, 200);
                return {
                    suggestions: list.map((i) => ({
                        label: { label: i.name, description: i.unit || undefined },
                        kind: monaco.languages.CompletionItemKind.Variable,
                        detail: [i.unit, i.detail].filter(Boolean).join(' - ') || 'from the host',
                        insertText: i.name,
                        sortText: `0_${i.name}`,       // the host's names first
                        range,
                    })),
                };
            },
        });
    }
}

/** Replaces the list of names the host offers. */
export function setHostNames(list: NameItem[]): void {
    items = list;
    if (list.length) registerOnce();
}

/** Replaces the names the host has defined (with the unit shown and the note), and draws them. */
export function setHostDefined(map: Map<string, { unit: string; note: string }>, editor: monaco.editor.IStandaloneCodeEditor | null): void {
    defined = map;
    if (map.size) registerOnce();
    if (editor) decorate(editor);
}

/** Draws the host's defined names in the editor (the decoration is its own class, `ck-host-var`, styled in styles/app.css). */
export function decorate(editor: monaco.editor.IStandaloneCodeEditor): void {
    const model = editor.getModel();
    if (!collection || collectionFor !== editor) { collection?.clear(); collection = editor.createDecorationsCollection([]); collectionFor = editor; }
    if (!model || !defined.size) { collection.clear(); return; }
    const decos: monaco.editor.IModelDeltaDecoration[] = [];
    const lines = model.getLinesContent();
    for (let i = 0; i < lines.length && decos.length < MAX_DECORATIONS; i++) {
        WORD.lastIndex = 0;
        for (let m = WORD.exec(lines[i]); m && decos.length < MAX_DECORATIONS; m = WORD.exec(lines[i])) {
            const d = defined.get(m[0]);
            if (!d) continue;
            decos.push({
                range: new monaco.Range(i + 1, m.index + 1, i + 1, m.index + 1 + m[0].length),
                options: {
                    inlineClassName: 'ck-host-var',
                    hoverMessage: { value: d.note ? `**from the host:** ${d.note.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&')}` : '**from the host**' },
                },
            });
        }
    }
    collection.set(decos);
}

/** Keeps the drawing right while the document is edited (debounced). */
export function followEdits(editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable {
    return editor.onDidChangeModelContent(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => decorate(editor), 200);
    });
}
