// The checks of host mode's messages (pure, no DOM): what a civilkit-load asks for, the values it sets, the theme and the token overrides.
// The same limits as the embed's checkLoad (src/embed/embed.ts), except that an empty document is allowed (a new, blank sheet).

export const PROTOCOL = 1;
export const CAPS = ['load', 'loaded', 'source', 'results', 'theme', 'tokens', 'errors', 'save', 'command', 'insert', 'patch'] as const;

const MAX_SOURCE = 1_000_000;       // characters of sheet text in one civilkit-load
const MAX_FILES = 5_000_000;        // base64 characters of attached files in one civilkit-load
const FILE_NAME = /^(?!\/)(?!.*\.\.)[\w .,()+\-\/]{1,120}\.(cpd|txt|csv|xlsx|xlsm)$/i;
const DOC_NAME = /^[\w.\-]{1,60}$/;
const VALUE_NAME = /^[A-Za-z_°-￿][\w°-￿]{0,59}$/;
const MAX_VALUES = 200;

export interface HostLoad {
    source: string;
    name: string;
    files: Record<string, string>;
    revision: number;
    values: Record<string, string>;
}

/** A civilkit-load, checked. `revision` is the host's own counter (echoed back in civilkit-loaded); absent counts as 0. */
export function checkHostLoad(d: { source?: unknown; files?: unknown; values?: unknown; name?: unknown; revision?: unknown }): { ok: true; load: HostLoad } | { ok: false; error: string } {
    if (typeof d.source !== 'string') return { ok: false, error: 'source must be the sheet text' };
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
    if (d.revision !== undefined && !(typeof d.revision === 'number' && Number.isInteger(d.revision) && d.revision >= 0 && d.revision <= Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'revision must be a whole number, 0 or more' };
    const values: Record<string, string> = {};
    if (d.values !== undefined) {
        if (!d.values || typeof d.values !== 'object' || Array.isArray(d.values)) return { ok: false, error: 'values must be an object of input names' };
        const entries = Object.entries(d.values as Record<string, unknown>);
        if (entries.length > MAX_VALUES) return { ok: false, error: `values: at most ${MAX_VALUES} names` };
        for (const [k, v] of entries) {
            if (!VALUE_NAME.test(k)) return { ok: false, error: `values: "${k.slice(0, 60)}" is not an input name` };
            const text = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : typeof v === 'string' ? v.trim() : typeof v === 'boolean' ? (v ? '1' : '0') : '';
            if (!text || text.length > 60 || /[\r\n<>;]/.test(text)) return { ok: false, error: `values: "${k}" must be a number, a number with a unit, a choice or true/false` };
            values[k] = text;
        }
    }
    return { ok: true, load: { source: d.source, name: typeof d.name === 'string' ? d.name : 'host', files, revision: typeof d.revision === 'number' ? d.revision : 0, values } };
}

export type ThemeMode = 'light' | 'dark' | 'auto';
export const isThemeMode = (m: unknown): m is ThemeMode => m === 'light' || m === 'dark' || m === 'auto';

// ---- tokens: Studio's design tokens, as inline overrides of our own --ck-* ones --------------------------------------
/** Studio's token names (the keys of `tokens`, with or without a leading `--`) to the app's own custom properties (src/styles/civilkit-tokens.css).
 *  Matched by what each one is for and by the values the two sets share (Studio's bg-1 is our panel, txt-0 our text, accent our accent). Unknown keys
 *  are ignored; `bg-3` and `line-2` have no counterpart here (hover surfaces and strong borders) and are accepted and checked, then unused. */
export const TOKEN_MAP: Record<string, { props: string[]; kind: 'colour' | 'font' }> = {
    'bg-0': { props: ['--ck-bg', '--ck-sunken'], kind: 'colour' },
    'bg-1': { props: ['--ck-panel'], kind: 'colour' },
    'bg-2': { props: ['--ck-raised'], kind: 'colour' },
    'bg-3': { props: [], kind: 'colour' },
    'txt-0': { props: ['--ck-text'], kind: 'colour' },
    'txt-1': { props: ['--ck-text-2'], kind: 'colour' },
    'txt-2': { props: ['--ck-text-3'], kind: 'colour' },
    'line': { props: ['--ck-line'], kind: 'colour' },
    'line-2': { props: [], kind: 'colour' },
    'accent': { props: ['--ck-accent', '--ck-focus'], kind: 'colour' },
    'accent-soft': { props: ['--ck-accent-soft'], kind: 'colour' },
    'accent-cta': { props: ['--ck-accent-strong'], kind: 'colour' },
    'ok': { props: ['--ck-ok'], kind: 'colour' },
    'warn': { props: ['--ck-warn'], kind: 'colour' },
    'danger': { props: ['--ck-err'], kind: 'colour' },
    'font-ui': { props: ['--ck-font'], kind: 'font' },
    'font-mono': { props: ['--ck-mono'], kind: 'font' },
};
const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
const COLOUR = new RegExp(
    String.raw`^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})`
    + String.raw`|rgba?\(\s*${NUM}%?\s*[, ]\s*${NUM}%?\s*[, ]\s*${NUM}%?\s*(?:[,/]\s*${NUM}%?\s*)?\)`
    + String.raw`|hsla?\(\s*${NUM}(?:deg)?\s*[, ]\s*${NUM}%\s*[, ]\s*${NUM}%\s*(?:[,/]\s*${NUM}%?\s*)?\))$`,
);
const FONT = /^[A-Za-z0-9 ,'"_\-]{1,200}$/;

/** `tokens` of a civilkit-theme, checked: the known keys with safe values. An absent or empty object clears; a bad value refuses the whole message. */
export function checkTokens(raw: unknown): { ok: true; props: Record<string, string> } | { ok: false; error: string } {
    const props: Record<string, string> = {};
    if (raw === undefined || raw === null) return { ok: true, props };
    if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'tokens must be an object of Studio token names to values' };
    for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
        const k = key.replace(/^--/, '');
        const t = Object.prototype.hasOwnProperty.call(TOKEN_MAP, k) ? TOKEN_MAP[k] : undefined;
        if (!t) continue;
        const text = typeof v === 'string' ? v.trim() : '';
        const ok = t.kind === 'colour' ? COLOUR.test(text) : FONT.test(text) && !/url\s*\(/i.test(text);
        if (!ok) return { ok: false, error: `tokens: "${key.slice(0, 40)}" has a value that is not a ${t.kind === 'colour' ? 'hex, rgb() or hsl() colour' : 'font stack of names, quotes, commas and hyphens'}` };
        for (const p of t.props) props[p] = text;
    }
    return { ok: true, props };
}
