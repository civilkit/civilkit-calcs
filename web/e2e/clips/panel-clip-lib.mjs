// Shared by the recorders of the interactive panel clips (41 to 44): opens a Panels sample the way the other panel clip does and
// gives helpers to drag a panel's slider and wait for its output. Not a recorder itself (record.mjs reads only NN-name.mjs).
import { settle, sleep, widenResults } from './lib.mjs';

/** The front result frame that holds the drawn panel (the preview is double buffered). */
export async function panelFrame(page, ms = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        for (const f of page.frames()) {
            if (f === page.mainFrame()) continue;
            const front = await f.frameElement().then((e) => e.evaluate((x) => !x.classList.contains('preview-frame-back'))).catch(() => false);
            if (front && await f.locator('.cprs-panel .cprs-w').count().catch(() => 0)) return f;
        }
        await sleep(300);
    }
    throw new Error('the panel was not drawn');
}

export async function until(fn, ms = 60000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await sleep(150); }
    return false;
}

/**
 * Opens `sample` (a manifest id), answers the question about running Python and waits for the panel and `ready(frame)`.
 * Returns the result frame. The waits are cut from the clip.
 */
export async function openPanelSample(rec, url, sample, ready, { beforeReady } = {}) {
    const { page } = rec;
    await page.click('[data-ribbon-tab=resources]');
    await page.click('[data-ribbon-btn=x-sidebar]');
    await widenResults(page);
    const u = new URL(url);
    u.searchParams.set('sample', sample);
    u.searchParams.set('theme', 'light');
    await page.goto(u.toString(), { timeout: 240000 });
    await page.waitForFunction(() => window.calcpadActiveEditor != null, null, { timeout: 240000 });
    await page.waitForFunction(() => /import ui/.test(window.calcpadActiveEditor.getValue()), null, { timeout: 60000 });
    const yes = page.locator('#cprs-python-yes').first();
    await yes.waitFor({ state: 'visible', timeout: 120000 });
    await sleep(1500);
    await rec.begin();
    await sleep(1200);
    await rec.click(yes, { ms: 650 });
    if (beforeReady) await rec.skip(() => beforeReady(page), 0.3);
    return rec.skip(async () => {
        const f = await panelFrame(page);
        await until(() => ready(f), 90000);
        await f.evaluate(() => { const p = document.querySelector('.cprs-panel'); document.scrollingElement.scrollTop += p.getBoundingClientRect().top - 8; });
        await settle(page);
        await sleep(800);
        return f;
    }, 0.3);
}

/** Presses on a panel slider's thumb and drags it to `to`, letting go there. `label` is the control's label text. */
export async function dragSlider(rec, fr, label, to, ms = 1500) {
    const { page } = rec;
    const loc = fr.locator('.cprs-w', { hasText: label }).locator('input[type=range]').first();
    const info = await loc.evaluate((e) => ({ min: +e.min, max: +e.max, val: +e.value }));
    const b = await loc.boundingBox();
    const at = (v) => b.x + 8 + (b.width - 16) * (v - info.min) / (info.max - info.min);
    const y = b.y + b.height / 2;
    await rec.glide(at(info.val), y, 700);
    await sleep(250);
    await page.mouse.down();
    await page.evaluate(([x, yy]) => window.__clipPtr?.(x, yy, true), [at(info.val), y]);
    await rec.glide(at(to), y, ms);
    await page.mouse.up();
    await page.evaluate(([x, yy]) => window.__clipPtr?.(x, yy, false), [at(to), y]);
}
