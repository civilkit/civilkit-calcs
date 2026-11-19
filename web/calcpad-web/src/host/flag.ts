// `/calcs/?host=1`: the full app as a frame inside another program (CivilKit Studio), see docs/embedding.md ("Host mode (full app)").
// One document, owned by the host: the host sends it with civilkit-load and gets every edit back with civilkit-source, so the app keeps
// no copy of the document, no session, no drafts and no recent files. Preferences (theme, editor and calculation settings) are kept
// as in the standalone app. `?embed=1` is a different, smaller view (src/embed/embed.ts); embed wins if both are given.
const params = new URLSearchParams(window.location.search);
const embed = params.get('embed');
export const hostMode: boolean = params.get('host') === '1' && !(embed && embed !== '0')
    && typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === 'undefined';

/** Ribbon actions that open, create, save or list files: the host owns those, so host mode shows none of them. */
export const HOST_HIDDEN_ACTIONS = new Set(['newsheet', 'newcalcpad', 'open', 'save', 'saveas', 'filemenu', 'importWorksheet']);
