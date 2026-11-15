// 26.11.2: the "Beam diagrams" panel sample. A button steps through three load cases (it hands the function its press count), a
// number box takes a typed span (applied on Enter), the diagrams are two tabs that keep their choice, the summary above them is
// Markdown, and Reset puts everything back.
import { sleep } from './lib.mjs';
import { openPanelSample, until } from './panel-clip-lib.mjs';

export default {
    id: 'panel-controls-tabs',
    viewport: { width: 1280, height: 900 },
    crop: { x: 360, y: 190, w: 920, h: 710 },
    async run(rec, { url }) {
        const { page } = rec;
        const md = (f) => f.locator('.cprs-panel-md').first().innerText().catch(() => '');
        const fr = await openPanelSample(rec, url, 'panels-tabs', async (f) =>
            (await f.locator('.cprs-panel .js-plotly-plot').count()) > 0 && (await md(f)).includes('Load case 1 of 3'));
        await sleep(1400);
        // the second tab, then the button
        await rec.click(fr.locator('.cprs-tab', { hasText: 'Shear force' }), { ms: 700 });
        await sleep(900);
        await rec.click(fr.locator('.cprs-w button', { hasText: 'Next load case' }), { ms: 700 });
        await rec.skip(() => until(async () => (await md(fr)).includes('Load case 2 of 3')), 0.4);
        await sleep(1600);
        // a typed span: select the box, type 9, Enter
        const span = fr.locator('#cprs-w-beam-L');
        await rec.click(span, { ms: 700 });
        await page.keyboard.press('ControlOrMeta+a');
        await sleep(200);
        await rec.type('9', 160);
        await page.keyboard.press('Enter');
        await rec.skip(() => until(async () => (await md(fr)).includes('kN.m at x = 4.50')), 0.4);
        rec.mark('poster');
        await sleep(2000);
        await rec.click(fr.locator('.cprs-reset'), { ms: 700 });
        await rec.skip(() => until(async () => (await md(fr)).includes('Load case 1 of 3') && (await span.inputValue()) === '6'), 0.4);
        await sleep(1800);
        await rec.finish();
    },
};
