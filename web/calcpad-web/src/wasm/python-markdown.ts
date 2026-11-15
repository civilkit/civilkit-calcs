// calcpad-rs: the Markdown of `ui.markdown(...)` (public/py/lib/ui.py), written as markup by the HOST, never by Python and never by
// the results frame. Every character of the source is escaped first, then a few patterns are turned into tags, so nothing in the text
// can become markup of its own: HTML written in it is shown as text, and there are no links, images or raw blocks.
//
//   # heading, ## heading, ### heading      **bold**   *italic* or _italic_   `code`
//   - item / * item                          1. item
//   a blank line starts a new paragraph; a line break inside a paragraph is kept.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Bold, italic and code in a line that is already escaped. Code first, so its content is left alone. */
function inline(escaped: string): string {
    const parts = escaped.split(/(`[^`]+`)/g);
    return parts.map((p, i) => {
        if (i % 2 === 1) return `<code>${p.slice(1, -1)}</code>`;
        return p
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
            .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
    }).join('');
}

const MAX_CHARS = 20_000;

/** The markup for a Markdown text (at most 20,000 characters are read). */
export function markdownToHtml(source: string): string {
    const lines = escapeHtml(String(source).slice(0, MAX_CHARS)).split(/\r?\n/);
    const out: string[] = [];
    let para: string[] = [];
    let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
    const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
    for (const line of lines) {
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        const ul = /^\s*[-*]\s+(.*)$/.exec(line);
        const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
        if (!line.trim()) { flushPara(); flushList(); continue; }
        if (h) { flushPara(); flushList(); out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); continue; }
        if (ul || ol) {
            flushPara();
            const tag = ul ? 'ul' : 'ol';
            if (list && list.tag !== tag) flushList();
            if (!list) list = { tag, items: [] };
            list.items.push((ul ?? ol)![1]);
            continue;
        }
        flushList();
        para.push(line);
    }
    flushPara();
    flushList();
    return out.join('');
}
