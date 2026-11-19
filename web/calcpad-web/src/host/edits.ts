// Host mode: civilkit-insert and civilkit-patch, the edits a host makes to the open document without replacing it (pure planning, no DOM;
// host.ts applies the plans to Monaco as one undoable edit each).

const MAX_TEXT = 100_000;       // characters of one inserted text, one find or one replace
const MAX_EDITS = 500;
const MAX_PATCH_TOTAL = 1_000_000;

/** A range of the document (offsets from 0, end exclusive) and its new text. */
export interface PlannedEdit { start: number; end: number; text: string }

/** `civilkit-insert {text}`: the edit that puts `text` at the selection (start..end offsets, equal for a caret). A caret in the middle of a line gets a line
 *  break first, and the text always ends with one, so the text on either side is never glued on. Line ends in `text` become \n (Monaco converts them
 *  to the document's own). */
export function planInsert(doc: string, selStart: number, selEnd: number, raw: unknown): { ok: true; edit: PlannedEdit } | { ok: false; error: string } {
    if (typeof raw !== 'string') return { ok: false, error: 'insert: text must be a string' };
    if (raw.length > MAX_TEXT) return { ok: false, error: `insert: text is over ${MAX_TEXT} characters` };
    if (!raw) return { ok: false, error: 'insert: text is empty' };
    const body = raw.replace(/\r\n?/g, '\n');
    const lineStart = doc.lastIndexOf('\n', selStart - 1) + 1;
    const midLine = selStart > lineStart;
    return { ok: true, edit: { start: selStart, end: selEnd, text: (midLine ? '\n' : '') + body + (body.endsWith('\n') ? '' : '\n') } };
}

const shown = (s: string): string => JSON.stringify(s.length > 40 ? `${s.slice(0, 40)}...` : s);

function occurrences(doc: string, find: string): number[] {
    const at: number[] = [];
    for (let k = doc.indexOf(find); k >= 0; k = doc.indexOf(find, k + 1)) at.push(k);
    return at;
}

/** `civilkit-patch {edits:[{find, replace}]}`: each `find` must occur exactly once in `doc`. The edits that do are planned (in the order given; an edit whose
 *  match overlaps an earlier planned one is refused), the others come back as `errors`. A malformed message (not a list, too many, too much text) is refused whole. */
export function planPatch(doc: string, raw: unknown): { ok: true; edits: PlannedEdit[]; errors: string[] } | { ok: false; error: string } {
    if (!Array.isArray(raw)) return { ok: false, error: 'patch: edits must be a list of {find, replace}' };
    if (raw.length === 0) return { ok: false, error: 'patch: edits is empty' };
    if (raw.length > MAX_EDITS) return { ok: false, error: `patch: at most ${MAX_EDITS} edits in one message` };
    const field = (e: unknown, k: 'find' | 'replace'): unknown => (e && typeof e === 'object' ? (e as Record<string, unknown>)[k] : undefined);
    let total = 0;
    for (const e of raw) {
        for (const k of ['find', 'replace'] as const) {
            const v = field(e, k);
            if (typeof v !== 'string') continue;
            if (v.length > MAX_TEXT) return { ok: false, error: `patch: a ${k} is over ${MAX_TEXT} characters` };
            total += v.length;
        }
    }
    if (total > MAX_PATCH_TOTAL) return { ok: false, error: `patch: the edits are over ${MAX_PATCH_TOTAL} characters in all` };
    const edits: PlannedEdit[] = [];
    const errors: string[] = [];
    raw.forEach((e, i) => {
        const find = field(e, 'find');
        const replace = field(e, 'replace');
        if (typeof find !== 'string' || !find) { errors.push(`patch: edit ${i + 1} has no find text`); return; }
        if (typeof replace !== 'string') { errors.push(`patch: edit ${i + 1} (${shown(find)}) has no replace text`); return; }
        const at = occurrences(doc, find);
        if (at.length !== 1) { errors.push(`patch: ${shown(find)} matched ${at.length} ${at.length === 1 ? 'time' : 'times'}, it must match exactly once`); return; }
        const start = at[0];
        const end = start + find.length;
        if (edits.some((x) => start < x.end && x.start < end)) { errors.push(`patch: ${shown(find)} overlaps an earlier edit`); return; }
        edits.push({ start, end, text: replace });
    });
    return { ok: true, edits, errors };
}
