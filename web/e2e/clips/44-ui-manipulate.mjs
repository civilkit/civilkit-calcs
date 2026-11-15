// 26.11.2: ui.manipulate. The "Free vibration" sample writes its three controls as tuples above one function; ui.plot draws the
// decay curve with its axis held still. Damping goes from under to critical to over, and the natural frequency doubles.
import { sleep } from './lib.mjs';
import { dragSlider, openPanelSample, until } from './panel-clip-lib.mjs';

export default {
    id: 'ui-manipulate',
    viewport: { width: 1280, height: 900 },
    crop: { x: 360, y: 190, w: 920, h: 710 },
    async run(rec, { url }) {
        const txt = (f) => f.locator('.cprs-panel-text').first().innerText().catch(() => '');
        const fr = await openPanelSample(rec, url, 'panels-manipulate', async (f) =>
            (await f.locator('.cprs-panel .js-plotly-plot').count()) > 0 && (await txt(f)).includes('Underdamped'));
        await sleep(1500);
        await dragSlider(rec, fr, 'Damping ratio', 0.5, 1700);
        await rec.skip(() => until(async () => /each cycle is [0-4]\d %/.test(await txt(fr))), 0.4);
        await sleep(1400);
        await dragSlider(rec, fr, 'Natural frequency', 4, 1500);
        await rec.skip(() => until(async () => (await fr.locator('.cprs-w output').first().innerText()) === '4 Hz'), 0.4);
        rec.mark('poster');
        await sleep(1600);
        await dragSlider(rec, fr, 'Damping ratio', 1.5, 1800);
        await rec.skip(() => until(async () => (await txt(fr)).includes('Overdamped')), 0.4);
        await sleep(2200);
        await rec.finish();
    },
};
