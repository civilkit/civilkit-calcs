// calcpad-rs: mounts the ribbon above the app in the browser build (the desktop build has its native menu).
import { createApp } from 'vue';
import Ribbon from './Ribbon.vue';
import type { WebFiles } from './web-files';
import { ICONS_BIG, ICONS_SMALL } from './ribbon-icons';
import type { RibbonCtx } from './ribbon-actions';

export interface RibbonHost {
    app: unknown;
    bridge: unknown;
    showSidebarTab: (id: string) => void;
}

/** The ribbon's context (what its buttons run with), for host mode's commands (src/host/commands.ts). Null before the ribbon is mounted. */
let mounted: Omit<RibbonCtx, 'anchor'> | null = null;
export function ribbonContext(): RibbonCtx | null {
    return mounted ? { ...mounted, anchor: document.body } : null;
}

export function mountRibbon(files: WebFiles, host: RibbonHost): void {
    const el = document.createElement('div');
    el.id = 'cprs-ribbon';
    el.style.flex = 'none';
    document.body.insertBefore(el, document.body.firstChild);
    // For the icon sheet and the tests.
    (window as unknown as { calcpadRibbonIcons: unknown }).calcpadRibbonIcons = { big: ICONS_BIG, small: ICONS_SMALL };
    const ctx = { files, ...host, editor: () => (window as unknown as { calcpadActiveEditor?: unknown }).calcpadActiveEditor } as Omit<RibbonCtx, 'anchor'>;
    mounted = ctx;
    createApp(Ribbon, { ctx }).mount(el);
}
