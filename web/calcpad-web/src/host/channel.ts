// The line to the host page: messages go to the parent only, to its origin where the browser tells us (Chromium's ancestorOrigins),
// and are only accepted from the parent window. The same trust rule as the embed (src/embed/embed.ts).
export const framed: boolean = window.parent !== window;

const hostOrigin: string = (() => {
    const o = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0];
    return o && o !== 'null' ? o : '*';
})();

export function toHost(msg: Record<string, unknown>): void {
    if (framed) window.parent.postMessage(msg, hostOrigin);
}

/** Calls `handler` for each message sent by the parent window (and nobody else) whose `type` is a string. */
export function fromHost(handler: (data: { type: string; [k: string]: unknown }) => void): void {
    window.addEventListener('message', (e) => {
        if (!framed || e.source !== window.parent) return;
        if (hostOrigin !== '*' && e.origin !== hostOrigin) return;
        const d = e.data as { type?: unknown } | null;
        if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
        handler(d as { type: string });
    });
}
