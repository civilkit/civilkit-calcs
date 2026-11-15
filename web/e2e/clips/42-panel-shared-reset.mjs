// 26.11.2: two panels that share one slider. The same widget object is given to both, so moving the span in the first moves it in
// the second; the second panel is made with plotly=True, so the chart it draws only after the move still has Plotly. Reset puts
// the shared control back in both.
import { sleep } from './lib.mjs';
import { dragSlider, openPanelSample, until } from './panel-clip-lib.mjs';

export default {
    id: 'panel-shared-reset',
    viewport: { width: 1280, height: 1000 },
    crop: { x: 360, y: 190, w: 920, h: 810 },
    async run(rec, { url }) {
        const second = (f) => f.locator('.cprs-panel').nth(1);
        const fr = await openPanelSample(rec, url, 'panels-shared', async (f) =>
            (await f.locator('.cprs-panel .js-plotly-plot').count()) > 0 && (await second(f).innerText()).includes('Move the span slider'));
        await sleep(1600);
        await dragSlider(rec, fr, 'Span', 9, 1800);
        await rec.skip(() => until(async () => (await second(fr).locator('.js-plotly-plot').count()) > 0 && (await second(fr).locator('.cprs-w output').first().innerText()) === '9 m'), 0.4);
        rec.mark('poster');
        await sleep(2400);
        await rec.click(fr.locator('.cprs-reset').first(), { ms: 700 });
        await rec.skip(() => until(async () => (await second(fr).locator('.cprs-w output').first().innerText()) === '3 m'), 0.4);
        await sleep(1800);
        await rec.finish();
    },
};
