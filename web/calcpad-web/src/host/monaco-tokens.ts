// Host mode: Monaco follows the host's tokens. Monaco cannot read CSS variables, so when tokens are applied (host.ts) a theme is defined from the
// computed --ck-* values (surface, text, line numbers, cursor, selection, widgets) on top of the light or dark one, and selected. Clearing the
// tokens goes back to the app's own theme.
import * as monaco from 'monaco-editor';
import { civilkitDarkTheme, civilkitLightTheme } from '../editor/theme';
import { getResolvedAppTheme } from '../editor/app-theme';
import { setCalcpadEditorTheme } from '../editor/setup';

const canvas = document.createElement('canvas').getContext('2d');

/** A computed CSS colour as #rrggbb (or #rrggbbaa), or null when it is not one the canvas understands. */
function hex(value: string): string | null {
    if (!canvas || !value.trim()) return null;
    canvas.fillStyle = '#000';
    canvas.fillStyle = value.trim();
    const v = String(canvas.fillStyle);
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(v);
    if (!m) return null;
    const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${h(+m[1])}${h(+m[2])}${h(+m[3])}${h(+m[4] * 255)}`;
}

const withAlpha = (colour: string, alpha: string): string => `${colour.slice(0, 7)}${alpha}`;

/** Defines and selects the host's Monaco theme from the current --ck-* values, or restores the app's own theme when `active` is false. */
export function syncEditorTheme(active: boolean): void {
    const resolved = getResolvedAppTheme();
    if (!active) { setCalcpadEditorTheme(resolved); return; }
    const css = getComputedStyle(document.documentElement);
    const c = (name: string) => hex(css.getPropertyValue(name));
    const panel = c('--ck-panel'), text = c('--ck-text'), text2 = c('--ck-text-2'), text3 = c('--ck-text-3');
    const accent = c('--ck-accent'), raised = c('--ck-raised'), line = c('--ck-line'), sunken = c('--ck-sunken');
    const base = resolved === 'light' ? civilkitLightTheme : civilkitDarkTheme;
    const colors: Record<string, string> = { ...base.colors };
    const set = (key: string, value: string | null) => { if (value) colors[key] = value; };
    set('editor.background', panel);
    set('editorGutter.background', panel);
    set('editor.foreground', text);
    set('editorLineNumber.foreground', text3);
    set('editorLineNumber.activeForeground', text2);
    set('editorCursor.foreground', accent);
    if (raised) set('editor.lineHighlightBackground', withAlpha(raised, '80'));
    if (accent) {
        set('editor.selectionBackground', withAlpha(accent, '48'));
        set('editor.inactiveSelectionBackground', withAlpha(accent, '29'));
        set('editor.selectionHighlightBackground', withAlpha(accent, '29'));
        set('editorBracketMatch.background', withAlpha(accent, '29'));
    }
    set('editorWidget.background', raised);
    set('editorWidget.foreground', text);
    set('editorWidget.border', line);
    set('editorSuggestWidget.background', raised);
    set('editorSuggestWidget.foreground', text);
    set('editorSuggestWidget.border', line);
    set('editorSuggestWidget.selectedBackground', line);
    set('input.background', sunken);
    set('input.foreground', text);
    set('input.border', line);
    set('scrollbarSlider.background', line ? withAlpha(line, '99') : null);
    monaco.editor.defineTheme('civilkit-host', { ...base, colors });
    monaco.editor.setTheme('civilkit-host');
}
