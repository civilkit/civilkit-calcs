// 26.11.2: a panel slider tied to a sheet input. In Input mode the span slider of the panel starts from the sheet's input L and
// moves the chart live; when it is let go the value is written into the input (the docked input shows it) and the sheet's own
// lines below the panel recalculate.
import { frameWith, sleep } from './lib.mjs';
import { dragSlider, openPanelSample, panelFrame, until } from './panel-clip-lib.mjs';

export default {
    id: 'panel-sheet-input',
    viewport: { width: 1280, height: 900 },
    crop: { x: 0, y: 190, w: 1280, h: 710 },
    async run(rec, { url }) {
        const { page } = rec;
        let fr = await openPanelSample(rec, url, 'panels-sheet-input', async (f) => (await f.locator('.cprs-panel .js-plotly-plot').count()) > 0);
        await sleep(900);
        await rec.click(page.locator('.preview-mode-group .toolbar-btn', { hasText: /^Input$/ }), { ms: 700 });
        fr = await rec.skip(async () => {
            await sleep(1500);
            const f = await panelFrame(page);
            await until(async () => (await f.locator('.cprs-panel .js-plotly-plot').count()) > 0, 60000);
            await sleep(800);
            return f;
        }, 0.3);
        await sleep(1500);
        await dragSlider(rec, fr, 'Span', 10, 1800);
        await rec.skip(async () => {
            const f = await panelFrame(page);
            await until(async () => /150/.test(await f.locator('body').innerText().catch(() => '')), 60000);
            await sleep(900);
        }, 0.5);
        rec.mark('poster');
        await sleep(2600);
        await rec.finish();
    },
};
