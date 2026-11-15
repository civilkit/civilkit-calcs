// The Cookbook sample sheets (Samples > Cookbook): each one loads, runs its Python, shows no error, and every check line it prints
// is a PASS (a line starting "FAIL:" means a worked result no longer agrees with its own check). A sheet with a panel is moved once.
//   PLAYWRIGHT_BROWSERS_PATH=... node e2e/cookbook-check.mjs [--url U] [--out DIR] [--only text]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('--url', 'http://127.0.0.1:4180/');
const out = arg('--out', join(tmpdir(), 'civilkit-calcs-cookbook'));
const only = arg('--only', '');
const samples = join(dirname(fileURLToPath(import.meta.url)), '../calcpad-web/public/sheet-samples');
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const manifest = JSON.parse(readFileSync(join(samples, 'manifest.json'), 'utf8'));
const list = manifest.samples.filter((s) => s.group === 'Cookbook' && (!only || s.id.includes(only) || s.title.includes(only)));
check(manifest.groups.includes('Cookbook') && list.length >= (only ? 1 : 7), `the Cookbook group lists ${list.length} samples`);
const browser = await chromium.launch();

/** The result frames on screen (the preview is double buffered: the back one can hold an older render). */
async function frames(page) {
    const out = [];
    for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const front = await f.frameElement().then((e) => e.evaluate((x) => !x.classList.contains('preview-frame-back'))).catch(() => false);
        if (front) out.push(f);
    }
    return out;
}
const textOf = async (page) => (await Promise.all((await frames(page)).map((f) => f.evaluate(() => document.body?.innerText ?? '').catch(() => '')))).join('\n');
const waitFor = async (fn, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };

for (const s of list) {
    const file = join(samples, s.file.replace(/^sheet-samples\//, ''));
    const src = readFileSync(file, 'utf8');
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/^Canceled/.test(String(e))) errors.push(String(e)); });
    await page.goto(url);
    await page.waitForFunction(() => window.calcpadActiveEditor != null && window.calcpadFiles != null, null, { timeout: 90000 });
    await page.evaluate((v) => window.calcpadActiveEditor.setValue(v), src);
    // the question about running Python; then wait until the checks have printed
    const ran = await waitFor(async () => {
        const yes = page.locator('#cprs-python-yes');
        if (await yes.count().catch(() => 0)) await yes.first().click().catch(() => {});
        const t = await textOf(page);
        return /^PASS:/m.test(t);
    });
    const text = await textOf(page);
    const pass = (text.match(/^PASS:/gm) ?? []).length;
    const bad = (text.match(/^FAIL:/gm) ?? []).length;
    check(ran && pass >= 2, `${s.title}: ${pass} check lines read PASS`);
    check(bad === 0, `${s.title}: no check line reads FAIL`);
    let errs = [];
    for (const f of await frames(page)) errs.push(...await f.evaluate(() => [...document.querySelectorAll('.err, .cprs-panel-err')].map((e) => e.textContent.trim().slice(0, 160))).catch(() => []));
    check(errs.length === 0, `${s.title}: no error in the results${errs.length ? ': ' + errs[0] : ''}`);
    // a panel: move its first control and see that it answers without an error
    let panelFrame = null;
    for (const f of await frames(page)) if (await f.locator('.cprs-panel .cprs-w').count().catch(() => 0)) panelFrame = f;
    if (panelFrame) {
        const before = await panelFrame.locator('.cprs-panel-out').first().innerText().catch(() => '');
        await panelFrame.evaluate(() => {
            const el = document.querySelector('.cprs-panel-ui input, .cprs-panel-ui select');
            if (el.type === 'range') { el.value = Number(el.value) === Number(el.max) ? el.min : el.max; el.dispatchEvent(new Event('input', { bubbles: true })); }
            else if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); }
            else if (el.type === 'number') { el.value = String(Number(el.value) + 1); el.dispatchEvent(new Event('change', { bubbles: true })); }
            else { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); }
        });
        await page.waitForTimeout(4000);
        const perr = await panelFrame.locator('.cprs-panel-err').count().catch(() => 0);
        const after = await panelFrame.locator('.cprs-panel-out').first().innerText().catch(() => '');
        check(perr === 0, `${s.title}: moving the panel gives no panel error`);
        check(after !== before || (await panelFrame.locator('.cprs-panel .js-plotly-plot').count()) > 0, `${s.title}: the panel answers`);
    }
    await page.screenshot({ path: join(out, `${s.id}.png`) });
    check(errors.length === 0, `${s.title}: no page errors${errors.length ? ': ' + errors[0] : ''}`);
    await ctx.close();
}
await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nall cookbook checks passed');
process.exit(fails.length ? 1 : 0);
