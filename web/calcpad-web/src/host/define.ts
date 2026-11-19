// Host-defined variables (`civilkit-define`, `civilkit-names`): the checks of the messages (pure) and the prelude the values become.
// A value is what a sheet line `name: value` takes: a number, a number with a unit (`-1.79 kN*m`), or a vector of them (`[16 ft; 12 ft]`,
// `[1; 2; 12]`; `,` also separates). The prelude is those lines compiled by the sheet compiler (so the names and units are read exactly as a
// sheet reads them: `phi` is φ), hidden (`#hide` ... `#show`) and put in front of every calculation by the transport (setHostPrelude).
import { compileSheet, SHEET_MARKER } from '../wasm/sheet';
import type { HostPrelude } from '../wasm/transport';

export const MAX_DEFINES = 2000;           // names in one civilkit-define
export const MAX_DEFINE_CHARS = 65_536;    // characters of values and notes in one civilkit-define (about 64 KB)
export const MAX_ELEMENTS = 5000;          // elements of one vector
export const MAX_NAMES = 5000;             // items of one civilkit-names

const NAME = /^[A-Za-z_°-￿][\w°-￿]{0,59}$/;
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const UNIT = String.raw`[A-Za-z°µμΩ%][A-Za-z0-9°µμΩ%_*/^()·∙⋅∕-]{0,40}`;
/** One quantity: a number, then optionally a unit (the lookahead keeps `1e400` a number, not a number of unit `e400`). */
const QUANTITY = new RegExp(`^${NUM}(?:\\s*(?![eE][-+]?\\d)${UNIT})?$`);
const NOTE = /^[^\u0000-\u001f]{0,300}$/;

export interface Define { name: string; value: string }
export type Checked<T> = ({ ok: true } & T) | { ok: false; error: string };

/** The number at the start of a quantity is a finite one (`1e400` is not). */
const finite = (q: string): boolean => Number.isFinite(Number(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(q)?.[0]));

/** One value, normalised (a vector's elements joined with `; `), or why it is not one. */
export function checkValue(raw: unknown): { ok: true; text: string; elements: number } | { ok: false; error: string } {
    const text = typeof raw === 'number' ? (Number.isFinite(raw) ? String(raw) : '') : typeof raw === 'string' ? raw.trim() : '';
    if (!text) return { ok: false, error: 'must be a number, a number with a unit, or a vector of them' };
    if (text.startsWith('[')) {
        if (!text.endsWith(']')) return { ok: false, error: 'a vector must end with ]' };
        if (text.slice(1, -1).trim() === '') return { ok: false, error: 'an empty vector [] cannot be defined: leave the name out and define a count of 0 (guard the loops with "if n > 0:")' };
        const parts = text.slice(1, -1).split(/[;,]/).map((p) => p.trim());
        if (parts.length > MAX_ELEMENTS) return { ok: false, error: `a vector has at most ${MAX_ELEMENTS} elements` };
        for (let i = 0; i < parts.length; i++) {
            if (!QUANTITY.test(parts[i]) || !finite(parts[i])) return { ok: false, error: `element ${i + 1} must be a number or a number with a unit` };
        }
        return { ok: true, text: `[${parts.join('; ')}]`, elements: parts.length };
    }
    if (!QUANTITY.test(text) || !finite(text)) return { ok: false, error: 'must be a number, a number with a unit (such as 8 kN*m), or a vector in [ ]' };
    return { ok: true, text, elements: 1 };
}

/** The `values` (and `notes`) of a civilkit-define. An absent or empty `values` clears. Nothing is applied when anything is wrong. */
export function checkDefine(d: { values?: unknown; notes?: unknown }): Checked<{ defines: Define[]; notes: Record<string, string> }> {
    const defines: Define[] = [];
    const notes: Record<string, string> = {};
    if (d.values !== undefined && d.values !== null) {
        if (typeof d.values !== 'object' || Array.isArray(d.values)) return { ok: false, error: 'values must be an object of names to values' };
        const entries = Object.entries(d.values as Record<string, unknown>);
        if (entries.length > MAX_DEFINES) return { ok: false, error: `values: at most ${MAX_DEFINES} names` };
        let chars = 0;
        for (const [name, v] of entries) {
            if (!NAME.test(name)) return { ok: false, error: `values: "${name.slice(0, 60)}" is not a name (letters, digits and underscore, up to 60, not starting with a digit)` };
            const c = checkValue(v);
            if (!c.ok) return { ok: false, error: `values: "${name}" ${c.error}` };
            chars += name.length + c.text.length;
            if (chars > MAX_DEFINE_CHARS) return { ok: false, error: `values are over ${MAX_DEFINE_CHARS} characters in all` };
            defines.push({ name, value: c.text });
        }
    }
    if (d.notes !== undefined && d.notes !== null) {
        if (typeof d.notes !== 'object' || Array.isArray(d.notes)) return { ok: false, error: 'notes must be an object of names to text' };
        const entries = Object.entries(d.notes as Record<string, unknown>);
        if (entries.length > MAX_DEFINES) return { ok: false, error: `notes: at most ${MAX_DEFINES} names` };
        let chars = 0;
        for (const [name, v] of entries) {
            if (!NAME.test(name)) return { ok: false, error: `notes: "${name.slice(0, 60)}" is not a name` };
            if (typeof v !== 'string' || !NOTE.test(v)) return { ok: false, error: `notes: "${name}" must be text of one line (up to 300 characters)` };
            chars += v.length;
            if (chars > MAX_DEFINE_CHARS) return { ok: false, error: `notes are over ${MAX_DEFINE_CHARS} characters in all` };
            notes[name] = v;
        }
    }
    return { ok: true, defines, notes };
}

export interface NameItem { name: string; unit: string; detail: string }

/** The `items` of a civilkit-names; an absent or empty list clears. */
export function checkNames(raw: unknown): Checked<{ items: NameItem[] }> {
    if (raw === undefined || raw === null) return { ok: true, items: [] };
    if (!Array.isArray(raw)) return { ok: false, error: 'items must be a list of {name, unit, detail}' };
    if (raw.length > MAX_NAMES) return { ok: false, error: `items: at most ${MAX_NAMES}` };
    const items: NameItem[] = [];
    for (let i = 0; i < raw.length; i++) {
        const it = raw[i] as { name?: unknown; unit?: unknown; detail?: unknown } | null;
        if (!it || typeof it !== 'object' || typeof it.name !== 'string' || !NAME.test(it.name)) return { ok: false, error: `items: item ${i + 1} needs a name (letters, digits and underscore, up to 60)` };
        for (const k of ['unit', 'detail'] as const) {
            const v = it[k];
            if (v !== undefined && (typeof v !== 'string' || !NOTE.test(v))) return { ok: false, error: `items: "${it.name}" ${k} must be text of one line` };
        }
        items.push({ name: it.name, unit: typeof it.unit === 'string' ? it.unit : '', detail: typeof it.detail === 'string' ? it.detail : '' });
    }
    return { ok: true, items };
}

export interface Prelude extends HostPrelude {
    /** The compiled lines (no #hide), one per define, in order. */
    compiled: string[];
    /** The name as the sheet compiler writes it in Calcpad (phi is φ), by the name as sent. */
    calcpad: Map<string, string>;
}

/** What the engine says of the plain lines: for each error its line (1 based, in the plain text) and message. */
export type EngineCheck = (plain: string) => Promise<{ line: number | null; message: string }[]>;

/**
 * The prelude for a set of defines, or why a define cannot be: a name or value the sheet compiler or the engine refuses (a reserved word, a unit
 * name, a unit that does not exist) names the define. `check` runs the plain lines through the engine once (without any earlier prelude).
 */
export async function buildPrelude(defines: Define[], check: EngineCheck): Promise<Checked<{ prelude: Prelude | null }>> {
    if (!defines.length) return { ok: true, prelude: null };
    const sheet = await compileSheet(`${SHEET_MARKER}\n${defines.map((d) => `${d.name}: ${d.value}`).join('\n')}\n`);
    const nameAt = (sheetLine: number): string => defines[Math.min(Math.max(sheetLine - 1, 0), defines.length - 1)].name;
    const bad = sheet.diagnostics.find((x) => x.severity === 'error');
    if (bad) return { ok: false, error: `values: "${nameAt(bad.line)}": ${bad.message}` };
    const plain = sheet.text.replace(/\n+$/, '').split('\n');
    if (plain.length !== defines.length) return { ok: false, error: 'values could not be compiled (a value spans lines)' };
    // Each one must be read as a definition (a line that is read as text defines nothing).
    for (let i = 0; i < defines.length; i++) {
        if (sheet.kinds[i + 1] !== 'q') return { ok: false, error: `values: "${defines[i].name}" is not read as a value (${defines[i].value.slice(0, 40)})` };
    }
    // A definition's `line` is its sheet line counted from 0, the marker being line 0: define i is on line i + 1.
    const calcpad = new Map(sheet.defs.map((x) => [defines[x.line - 1]?.name ?? x.name, x.calcpad]));
    // The same lines for a worksheet in plain Calcpad, where the names stay as sent (the compiler's greek names are a sheet's).
    const raw = defines.map((d) => `${d.name} = ${d.value}`);
    for (const lines of [plain, raw]) {
        const errors = await check(lines.join('\n'));
        if (errors.length) {
            const e = errors[0];
            return { ok: false, error: `values: "${e.line ? nameAt(e.line) : defines[0].name}": ${e.message}` };
        }
    }
    // A name the engine already knows (a unit, a function, a constant) cannot be a variable: asked for in a fresh calculation, it is not an error.
    for (const names of [defines.map((d) => calcpad.get(d.name) ?? d.name), defines.map((d) => d.name)]) {
        const unknown = await check(names.map((n) => `ck_probe = ${n}`).join('\n'));
        const undefinedAt = new Set(unknown.filter((e) => e.line).map((e) => e.line));
        for (let i = 0; i < defines.length; i++) {
            if (!undefinedAt.has(i + 1)) return { ok: false, error: `values: "${defines[i].name}" is a unit, a function or a constant of Calcpad and cannot be a variable name` };
        }
    }
    return { ok: true, prelude: { text: `#hide\n${plain.join('\n')}\n#show`, plain: `#hide\n${raw.join('\n')}\n#show`, lines: plain.length + 2, compiled: plain, calcpad } };
}

// ---- results: a vector's elements ----------------------------------------------------------------------------------------

export interface VectorValue { value: { value: number | string; unit: string }[]; unit: string; text: string; vector: true }

/** The engine's sheet of one vector (rows `Index, Value, Unit`) as a results value; null for a matrix or anything else. */
export function vectorValue(rows: string[][]): VectorValue | null {
    if (!rows.length || rows[0].length !== 3 || rows[0][0] !== 'Index') return null;
    const value = rows.slice(1).map((r) => {
        const n = Number(r[1]);
        return { value: r[1].trim() !== '' && Number.isFinite(n) ? n : r[1], unit: r[2] ?? '' };
    });
    const shared = value.length > 0 && value.every((e) => e.unit === value[0].unit) ? value[0].unit : '';
    const body = value.map((e) => (shared ? String(e.value) : `${e.value}${e.unit ? ' ' + e.unit : ''}`)).join('; ');
    return { value, unit: shared, text: `[${body}]${shared ? ' ' + shared : ''}`, vector: true };
}

/** The names a document defines itself, with the line (1 based) of the first definition: sheets by the compiler, plain text by `name =`. */
export async function documentDefinitions(content: string, isSheet: boolean): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (isSheet) {
        const c = await compileSheet(content);
        for (const d of c.defs) {
            if (!out.has(d.name)) out.set(d.name, d.line + 1);
            if (!out.has(d.calcpad)) out.set(d.calcpad, d.line + 1);
        }
        return out;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = /^\s*([A-Za-z_°-￿][\w°-￿]*)\s*=(?!=)/.exec(lines[i]);
        if (m && !out.has(m[1])) out.set(m[1], i + 1);
    }
    return out;
}
