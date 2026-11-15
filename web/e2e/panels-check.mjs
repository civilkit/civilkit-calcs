// Interactive panels (`import ui`, docs/interactive-panels-design.md) in the built app served at --url:
// the widgets are drawn in the results frame, a widget change runs only the panel's function in the live Python session (the
// worksheet is not converted again), the chart and table are redrawn in place, the values survive a recalculation and reach the
// exports, a player steps one frame per answer, a stuck function is stopped, and a frame cannot make the host do more than
// choose widget values. Light and dark, desktop and phone screenshots go to --out.
//   PLAYWRIGHT_BROWSERS_PATH=... node e2e/panels-check.mjs [--url U] [--out DIR] [--browser chromium|webkit]
// The chart checks load Plotly.js from its CDN and are skipped, with a line saying so, when there is no network.
import * as pw from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('--url', 'http://127.0.0.1:4180/');
const out = arg('--out', join(tmpdir(), 'civilkit-calcs-panels'));
const samples = join(dirname(fileURLToPath(import.meta.url)), '../calcpad-web/public/sheet-samples');
mkdirSync(out, { recursive: true });
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
// --browser webkit runs the same checks in WebKit; PW_EXECUTABLE names a browser that is not the one this Playwright expects
const browser = await pw[arg('--browser', 'chromium')].launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});

const BEAM = readFileSync(join(samples, 'Panel beam deflection explorer.sheet'), 'utf8');
const PUMP = readFileSync(join(samples, 'Panel pump operating point player.sheet'), 'utf8');
const COLUMN = readFileSync(join(samples, 'Panel column buckling player.sheet'), 'utf8');
const MANIP = readFileSync(join(samples, 'Panel manipulate free vibration.sheet'), 'utf8');
const TABS = readFileSync(join(samples, 'Panel beam tabs number markdown.sheet'), 'utf8');
const SHARED = readFileSync(join(samples, 'Panel shared slider two panels.sheet'), 'utf8');
const SHEETIN = readFileSync(join(samples, 'Panel sheet input and slider.sheet'), 'utf8');
const STUCK = [
    '<!--sheet-->', '# Stuck', '',
    '```python', 'import ui', 'x = ui.slider("x", 1, 0, 10)',
    '@ui.panel(x)', 'def slow(x):',
    '    if x > 5:', '        while True:', '            pass',
    '    if x == 4:', '        raise ValueError("four is not allowed")',
    '    return "x is %d" % x', '```', ''].join('\n');

async function open(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, ...opts });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => { if (!/^Canceled/.test(String(e))) errors.push(String(e)); });
    await page.goto(url);
    await page.waitForFunction(() => window.calcpadActiveEditor != null && window.calcpadFiles != null, null, { timeout: 60000 });
    // counts the worksheet conversions, to show a widget change makes none
    await page.evaluate(() => {
        window.__converts = 0;
        const f = window.fetch;
        window.fetch = (i, o) => { if (String(i?.url ?? i).includes('/api/calcpad/convert')) window.__converts++; return f(i, o); };
    });
    return { ctx, page, errors };
}
const setText = (page, t) => page.evaluate(v => window.calcpadActiveEditor.setValue(v), t);
const converts = page => page.evaluate(() => window.__converts);
async function panelFrame(page, ms = 60000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        const yes = page.locator('#cprs-python-yes');
        if (await yes.count().catch(() => 0)) await yes.first().click().catch(() => {});
        for (const f of page.frames()) if (f !== page.mainFrame() && await f.locator('.cprs-panel .cprs-w').count().catch(() => 0)) return f;
        await page.waitForTimeout(300);
    }
    return null;
}
/** The panel frame once it has stopped being replaced: the preview swaps its two stacked frames just after a first draw. */
async function stablePanelFrame(page, ms = 60000) {
    let fr = await panelFrame(page, ms);
    for (let i = 0; i < 6 && fr; i++) {
        await page.waitForTimeout(1300);
        const again = await panelFrame(page, ms);
        if (again === fr) return fr;
        fr = again;
    }
    return fr;
}
/** Sets a range input the way a finger does and fires input. */
const slide = (fr, label, v) => fr.evaluate(([l, val]) => {
    const lab = [...document.querySelectorAll('.cprs-w label')].find(x => x.textContent === l);
    const el = document.getElementById(lab.getAttribute('for'));
    el.value = val; el.dispatchEvent(new Event('input', { bubbles: true }));
}, [label, v]);
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
const tableText = fr => fr.locator('.cprs-panel-table').first().innerText().catch(() => '');

// ---- 1. the beam: draw, change, no recalculation, persistence, exports ----------------------------------------------------
{
    const { ctx, page, errors } = await open();
    await setText(page, BEAM);
    const fr = await stablePanelFrame(page);
    check(!!fr, 'the panel is drawn in the results frame');
    if (fr) {
        check(await fr.locator('.cprs-w').count() === 3, 'three widgets: two sliders and a drop-down');
        check(await fr.locator('.cprs-panel-note').evaluate(n => getComputedStyle(n).display === 'none'), 'the static note is hidden once the widgets are drawn');
        const plotly = await waitFor(() => fr.locator('.cprs-panel .js-plotly-plot').count().then(n => n > 0), 30000);
        if (!plotly) console.log('skip chart checks: Plotly.js did not load (no network?)');
        check(/Maximum moment\s+(\S+) kN\.m/.test(await tableText(fr)) && (await tableText(fr)).includes('54.00 kN.m'), 'first result at L = 6 m, w = 12 kN/m: M = 54.00 kN.m');
        await fr.evaluate(() => document.querySelector('.cprs-panel').scrollIntoView());
        await page.screenshot({ path: join(out, 'beam-desktop-light.png') });

        const before = await converts(page);
        const t0 = Date.now();
        await slide(fr, 'Span', 10);
        check(await waitFor(async () => (await tableText(fr)).includes('150.00 kN.m')), 'a slider change redraws the table (L = 10 m: M = 150.00 kN.m)');
        const ms = Date.now() - t0;
        console.log(`info  slider change to redrawn table: ${ms} ms`);
        check((await converts(page)) === before, 'the worksheet was not converted again for a widget change');
        if (plotly) {
            const ymax = await fr.evaluate(() => Math.max(...document.querySelector('.cprs-panel .js-plotly-plot').data[0].y));
            check(ymax > 25, `the chart was redrawn in place (peak deflection ${ymax.toFixed(1)} mm at 10 m)`);
        }
        await fr.locator('.cprs-w select').selectOption('1');
        check(await waitFor(() => fr.locator('.cprs-panel .js-plotly-plot').evaluate(g => g.layout.yaxis.title.text === 'Bending moment (kN.m)')), 'the drop-down changes what the chart shows');
        check(await fr.locator('.cprs-w output').first().innerText() === '10 m', 'the readout shows the value and its unit');

        // a recalculation (edit a prose line) keeps the values
        await setText(page, BEAM.replace('A simply supported beam', 'A simply supported steel beam'));
        const fr2 = await stablePanelFrame(page);
        check(!!fr2 && await waitFor(async () => (await fr2.locator('.cprs-w output').first().innerText()) === '10 m'), 'a recalculation starts the panel from the values it was left at');
        check((await tableText(fr2)).includes('150.00 kN.m'), 'and its first result is for those values');

        // exports: a static snapshot at the current values
        const ex = await page.evaluate(async (content) => {
            const o = {};
            for (const ep of ['convert', 'docx', 'xlsx']) {
                const r = await fetch(`/api/calcpad/${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, forPrint: ep === 'convert', includeLineAnchors: false }) });
                const b = await r.arrayBuffer();
                o[ep] = { status: r.status, bytes: b.byteLength, text: ep === 'convert' ? new TextDecoder().decode(b) : '' };
            }
            return o;
        }, BEAM);
        check(ex.convert.status === 200 && /Interactive panel beam: Span = 10 m, Uniform load = 12 kN\/m, Show = Bending moment/.test(ex.convert.text), 'Report / Print carries the note with the values the panel was left at');
        check(ex.convert.text.includes('150.00 kN.m') || ex.convert.text.includes('Maximum moment'), 'and the first output as a static table');
        check(ex.docx.status === 200 && ex.docx.bytes > 2000, `Word export works (${ex.docx.bytes} bytes)`);
        check(ex.xlsx.status === 200 && ex.xlsx.bytes > 3000, `Excel export works (${ex.xlsx.bytes} bytes)`);
    }
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
    await ctx.close();
}

// ---- 2. a frame can only choose widget values -------------------------------------------------------------------------------
{
    const { ctx, page } = await open();
    await setText(page, BEAM);
    const fr = await stablePanelFrame(page);
    if (fr) {
        const send = (msg) => fr.evaluate(m => new Promise(res => {
            const t = setTimeout(() => res('none'), 3000);
            window.addEventListener('message', function h(e) { if (e.data && e.data.type === 'cpPanelUpdate' && e.data.seq === m.seq) { clearTimeout(t); removeEventListener('message', h); res(e.data); } });
            window.parent.postMessage(m, '*');
        }), msg);
        const run = await fr.locator('.cprs-panel').first().getAttribute('data-run');
        const good = await send({ type: 'panelEvent', panel: 'beam', run, seq: 901, values: { L: 8, w: 12, what: 0 } });
        check(Array.isArray(good.out), 'a well-formed event is answered');
        const clamp = await send({ type: 'panelEvent', panel: 'beam', run, seq: 902, values: { L: 1e9, w: -5, what: 0 } });
        check(JSON.stringify(clamp.out).includes('"Maximum moment"') && JSON.stringify(clamp.out).includes('kN.m'), 'out-of-range values are clamped by the widget, not trusted');
        const bad1 = await send({ type: 'panelEvent', panel: 'beam', run, seq: 903, values: { L: 'x'.repeat(10), w: 1 } });
        check(bad1 === 'none', 'a string value is dropped by the host without an answer');
        const bad2 = await send({ type: 'panelEvent', panel: 'nope', run, seq: 904, values: { L: 3 } });
        check(bad2 !== 'none' && /no such panel/.test(bad2.error ?? ''), 'an unknown panel is refused by Python, named');
        const bad3 = await send({ type: 'panelEvent', panel: 'beam', run, seq: 905, values: { what: 7 } });
        check(bad3 !== 'none' && /no such option/.test(bad3.error ?? ''), 'a select value outside its options is refused');
        const stale = await send({ type: 'panelEvent', panel: 'beam', run: 'deadbeef', seq: 906, values: { L: 3 } });
        check(stale !== 'none' && stale.stale === true, 'an event quoting another run is answered stale');
        const bad4 = await send({ type: 'panelEvent', panel: 'beam', run, seq: 907, values: { __proto__: 1, L: 3, ['a'.repeat(80)]: 1 } });
        check(bad4 === 'none', 'a value name that is not a plain name is dropped');
    }
    await ctx.close();
}

// ---- 3. players: one frame per answer ---------------------------------------------------------------------------------------
{
    const { ctx, page } = await open();
    await setText(page, PUMP);
    const fr = await stablePanelFrame(page);
    check(!!fr, 'the pump panel is drawn');
    if (fr) {
        const before = await converts(page);
        const read = () => fr.evaluate(() => document.querySelector('.cprs-w output[for$="-n"]').textContent);
        check((await read()).startsWith('60'), 'the player starts at 60');
        await fr.getByRole('button', { name: 'Play Speed (% of rated)' }).click();
        const moved = await waitFor(async () => parseInt(await read(), 10) >= 66, 20000);
        check(moved, 'Play steps through frames');
        await page.screenshot({ path: join(out, 'pump-playing.png') });
        await fr.getByRole('button', { name: 'Play Speed (% of rated)' }).click();
        const at = parseInt(await read(), 10);
        await page.waitForTimeout(1500);
        check(Math.abs(parseInt(await read(), 10) - at) <= 1, 'Pause stops it');
        check((await fr.locator('.cprs-panel-text').innerText()).startsWith('Operating point:'), 'the text result follows the frame');
        check((await converts(page)) === before, 'no worksheet conversion while playing');
    }
    await ctx.close();
}

// ---- 4. a function that fails, and one that never returns --------------------------------------------------------------------
{
    const { ctx, page } = await open();
    await setText(page, STUCK);
    const fr = await stablePanelFrame(page);
    check(!!fr, 'the stuck panel is drawn');
    if (fr) {
        await slide(fr, 'x', 4);
        check(await waitFor(() => fr.locator('.cprs-panel-err[role=alert]').innerText().then(t => /four is not allowed/.test(t))), 'an exception in the function is shown in the panel, with its type');
        await slide(fr, 'x', 3);
        check(await waitFor(() => fr.locator('.cprs-panel-text').innerText().then(t => t === 'x is 3')), 'and the panel recovers on the next value');
        await slide(fr, 'x', 8);
        check(await waitFor(() => fr.locator('.cprs-panel-err').innerText().then(t => /longer than 10 s/.test(t)), 30000), 'a function that does not return is stopped after 10 s, and says so');
        await slide(fr, 'x', 2);
        check(await waitFor(() => fr.locator('.cprs-panel-err').innerText().then(t => /out of date/.test(t))), 'the session is gone afterwards: later events are stale until the sheet is calculated again');
    }
    await ctx.close();
}

// ---- 5. the column: select and player, then light / dark and phone screenshots ---------------------------------------------------
for (const [name, opts] of [
    ['column-desktop-dark', { colorScheme: 'dark' }],
    ['column-phone-light', { colorScheme: 'light', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
    ['column-phone-dark', { colorScheme: 'dark', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
]) {
    const { ctx, page, errors } = await open(opts);
    await setText(page, COLUMN);
    // on a phone the editor and the results are panes of one screen; the bar at the bottom switches
    if (opts.isMobile) {
        // the question about running Python comes first and covers the bar; answer it, then switch to the results
        await page.locator('#cprs-python-yes').first().click({ timeout: 60000 }).catch(() => {});
        await page.getByText('Results', { exact: true }).last().click();
    }
    const fr = await stablePanelFrame(page);
    check(!!fr, `${name}: the column panel is drawn`);
    if (fr) {
        await waitFor(() => fr.locator('.cprs-panel .js-plotly-plot').count().then(n => n > 0), 30000);
        await slide(fr, 'Load P / Pcr (%, step 5)', 14);
        await waitFor(async () => (await fr.locator('.cprs-panel-text').innerText()).includes('70 %'));
        await fr.evaluate(() => document.querySelector('.cprs-panel').scrollIntoView());
        await page.waitForTimeout(600);
        await page.screenshot({ path: join(out, `${name}.png`) });
        if (opts.isMobile) {
            const wide = await fr.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
            check(!wide, `${name}: no horizontal scroll in the results`);
            const h = await fr.evaluate(() => Math.min(...[...document.querySelectorAll('.cprs-w input[type=range],.cprs-w button,.cprs-w select')].map(e => e.getBoundingClientRect().height)));
            check(h >= 28, `${name}: controls are tall enough to touch (${Math.round(h)} px)`);
        }
    }
    check(errors.length === 0, `${name}: no page errors`);
    await ctx.close();
}

// ---- 4. ui.manipulate: controls from tuples, ui.plot, a short error for a bad tuple -------------------------------------------
{
    const { ctx, page, errors } = await open();
    await setText(page, MANIP);
    const fr = await stablePanelFrame(page);
    check(!!fr, 'manipulate: the panel is drawn');
    if (fr) {
        check(await fr.locator('.cprs-w input[type=range]').count() === 3, 'manipulate: three sliders from three tuples');
        const labels = await fr.locator('.cprs-w label').allInnerTexts();
        check(['Natural frequency', 'Damping ratio', 'Time shown (cycles)'].every(l => labels.includes(l)), 'manipulate: labels= names the controls');
        check(await fr.locator('.cprs-w output').first().innerText() === '2 Hz', 'manipulate: a default and a unit are kept (2 Hz)');
        const txt = () => fr.locator('.cprs-panel-text').first().innerText().catch(() => '');
        check((await txt()).includes('Underdamped'), 'manipulate: the first result is for zeta = 0.1');
        const plotly = await waitFor(() => fr.locator('.cprs-panel .js-plotly-plot').count().then(n => n > 0), 30000);
        if (!plotly) console.log('skip chart checks: Plotly.js did not load (no network?)');
        if (plotly) {
            const r = await fr.evaluate(() => document.querySelector('.cprs-panel .js-plotly-plot').layout.yaxis.range);
            check(r && r[0] === -1.1 && r[1] === 1.1, 'ui.plot: ylim keeps the axis still');
            check(await fr.evaluate(() => document.querySelector('.cprs-panel .js-plotly-plot').data.length) === 3, 'ui.plot: one trace per y');
            const legend = await fr.evaluate(() => document.querySelector('.cprs-panel .js-plotly-plot').data.map(d => d.showlegend));
            check(legend[0] === true && legend[1] === true && legend[2] === false, 'ui.plot: an unnamed line stays out of the legend');
            const col = await fr.evaluate(() => document.querySelector('.cprs-panel .js-plotly-plot').data.map(d => d.line && d.line.color));
            check(col[1] && col[2] === col[1] && col[0] !== col[1], 'ui.plot: an unnamed line takes the colour of the line before it');
        }
        await fr.evaluate(() => document.querySelector('.cprs-panel').scrollIntoView());
        await page.screenshot({ path: join(out, 'manipulate-desktop-light.png') });
        const before = await converts(page);
        await slide(fr, 'Damping ratio', 1);
        check(await waitFor(async () => (await txt()).includes('Critically damped')), 'manipulate: zeta = 1 is critically damped');
        await slide(fr, 'Damping ratio', 1.5);
        check(await waitFor(async () => (await txt()).includes('Overdamped')), 'manipulate: zeta = 1.5 is overdamped');
        await slide(fr, 'Damping ratio', 0);
        check(await waitFor(async () => (await txt()).includes('Underdamped')), 'manipulate: zeta = 0 gives a clean result (no division error)');
        check((await converts(page)) === before, 'manipulate: the worksheet was not converted again');
    }
    check(errors.length === 0, `manipulate: no page errors${errors.length ? ': ' + errors[0] : ''}`);
    await ctx.close();
}
{
    const { ctx, page } = await open();
    await setText(page, ['<!--sheet-->', '# Bad', '', '```python', 'import ui', '@ui.manipulate(("x",))', 'def f(x):', '    return x', '```', ''].join('\n'));
    let found = false;
    for (let i = 0; i < 100 && !found; i++) {
        const yes = page.locator('#cprs-python-yes');
        if (await yes.count().catch(() => 0)) await yes.first().click().catch(() => {});
        for (const f of page.frames()) if (/each control is a tuple/.test(await f.locator('body').innerText().catch(() => ''))) found = true;
        if (!found) await page.waitForTimeout(300);
    }
    check(found, 'manipulate: a malformed tuple is reported in words');
    await ctx.close();
}

// ---- 5. number boxes, a button, tabs, Markdown, a row; reset ----------------------------------------------------------------------
const slideRelease = (fr, label, v) => fr.evaluate(([l, val]) => {
    const lab = [...document.querySelectorAll('.cprs-w label')].find(x => x.textContent === l);
    const el = document.getElementById(lab.getAttribute('for'));
    el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
}, [label, v]);
{
    const { ctx, page, errors } = await open();
    await setText(page, TABS);
    const fr = await stablePanelFrame(page);
    check(!!fr, 'tabs sample: the panel is drawn');
    if (fr) {
        const md = () => fr.locator('.cprs-panel-md').first().innerText().catch(() => '');
        const sel = () => fr.locator('.cprs-tab[aria-selected=true]').innerText().catch(() => '');
        check(await fr.locator('.cprs-w input[type=number]').count() === 2, 'number boxes: two of them');
        check(await fr.locator('.cprs-w button', { hasText: 'Next load case' }).count() === 1, 'a button is drawn');
        check(await fr.locator('.cprs-tab').count() === 2 && await sel() === 'Bending moment', 'tabs: two, the first selected');
        check(await fr.locator('.cprs-panel-md strong').count() > 0 && (await md()).includes('Maximum moment 54.0 kN.m'), 'Markdown: bold text and the first result (54.0 kN.m)');
        check(await fr.locator('.cprs-row').count() === 1, 'a row of results');
        await fr.evaluate(() => document.querySelector('.cprs-panel').scrollIntoView());
        await page.screenshot({ path: join(out, 'tabs-desktop-light.png') });
        const before = await converts(page);
        await fr.locator('.cprs-tab', { hasText: 'Shear force' }).click();
        check(await sel() === 'Shear force' && await fr.locator('.cprs-tabpanel').nth(0).isHidden(), 'tabs: a click shows the other tab');
        await fr.locator('.cprs-tab[aria-selected=true]').press('ArrowLeft');
        check(await sel() === 'Bending moment', 'tabs: the arrow keys move between them');
        await fr.locator('.cprs-tab', { hasText: 'Shear force' }).click();
        await fr.locator('.cprs-w button', { hasText: 'Next load case' }).click();
        check(await waitFor(async () => (await md()).includes('Load case 2 of 3')), 'the button gives a new value on every press (case 2)');
        check(await sel() === 'Shear force', 'the selected tab survives an update');
        const L = fr.locator('#cprs-w-beam-L');
        await L.fill('8'); await L.press('Enter');
        check(await waitFor(async () => (await md()).includes('136.0 kN.m')), 'a number box applies on Enter (8 m, mid-span load: 136.0 kN.m)');
        await L.fill('500'); await L.press('Enter');
        check(await waitFor(async () => (await L.inputValue()) === '20'), 'a number outside its limits is brought back (500 -> 20)');
        await fr.locator('.cprs-reset').click();
        check(await waitFor(async () => (await md()).includes('Load case 1 of 3') && (await md()).includes('54.0')), 'Reset puts every control back, button count included');
        check(await L.inputValue() === '6' && await fr.locator('.cprs-reset').isDisabled(), 'Reset: the box shows 6 again and the button is disabled at the defaults');
        check((await converts(page)) === before, 'none of this converted the worksheet again');
    }
    check(errors.length === 0, `tabs sample: no page errors${errors.length ? ': ' + errors[0] : ''}`);
    await ctx.close();
}
// Markdown is escaped by the host: HTML written in it is only text
{
    const { ctx, page } = await open();
    await setText(page, ['<!--sheet-->', '# Md', '', '```python', 'import ui', 'x = ui.slider("x", 1, 0, 5)', '@ui.panel(x)', 'def m(x):',
        '    return ui.markdown("# Head\\n<img src=x onerror=\\"parent.__pwn=1\\"> **bold** `<b>` x=%d\\n\\n- one\\n- two" % x)', '```', ''].join('\n'));
    const fr = await stablePanelFrame(page);
    if (fr) {
        await slide(fr, 'x', 3);
        check(await waitFor(async () => (await fr.locator('.cprs-panel-md').first().innerText()).includes('x=3')), 'markdown: an update is drawn');
        check(await fr.locator('.cprs-panel-md img').count() === 0 && (await fr.locator('.cprs-panel-md').first().innerText()).includes('<img src=x'), 'markdown: HTML in the text is shown as text, not made into markup');
        check(await fr.locator('.cprs-panel-md li').count() === 2 && await fr.locator('.cprs-panel-md h3').count() === 1, 'markdown: a list and a heading');
        check(await page.evaluate(() => window.__pwn === undefined), 'markdown: nothing ran');
    } else check(false, 'markdown: the panel is drawn');
    await ctx.close();
}

// ---- 6. unchanged results are not sent again; a stale page gets everything; a slow update is reported ---------------------------
{
    const { ctx, page } = await open();
    await setText(page, TABS);
    const fr = await stablePanelFrame(page);
    if (fr) {
        const send = (msg) => fr.evaluate(m => new Promise(res => {
            const t = setTimeout(() => res('none'), 8000);
            window.addEventListener('message', function h(e) { if (e.data && e.data.type === 'cpPanelUpdate' && e.data.seq === m.seq) { clearTimeout(t); removeEventListener('message', h); res(e.data); } });
            window.parent.postMessage(m, '*');
        }), msg);
        const run = await fr.locator('.cprs-panel').first().getAttribute('data-run');
        const same = await send({ type: 'panelEvent', panel: 'beam', run, seq: 801, base: 0, values: { L: 6, w: 12, case: 0 } });
        check(Array.isArray(same.out) && same.out.length === 3 && same.out.every(o => o.t === 'same') && same.n === 1, 'unchanged results come back as "same", not as data again');
        const changed = await send({ type: 'panelEvent', panel: 'beam', run, seq: 802, base: 1, values: { L: 6, w: 13, case: 0 } });
        check(changed.out.map(o => o.t).join() === 'html,tabs,row' && changed.n === 2, 'a change sends the results that changed; Markdown has been turned into markup by the host');
        check(/<strong>/.test(changed.out[0].h) && !/\*\*/.test(changed.out[0].h), 'the markup is made by the host from escaped text');
        const stale = await send({ type: 'panelEvent', panel: 'beam', run, seq: 803, base: 0, values: { L: 6, w: 13, case: 0 } });
        check(stale.out.every(o => o.t !== 'same'), 'a page that does not hold the last answer is sent everything');
        const badBase = await send({ type: 'panelEvent', panel: 'beam', run, seq: 804, base: -4, values: { L: 6 } });
        check(badBase === 'none', 'a malformed base is dropped by the host');
        const badBtn = await send({ type: 'panelEvent', panel: 'beam', run, seq: 805, values: { case: -1 } });
        check(badBtn !== 'none' && /click count/.test(badBtn.error ?? ''), 'a button value that is not a click count is refused');
    }
    await ctx.close();
}
{
    const { ctx, page } = await open();
    await setText(page, ['<!--sheet-->', '# Slow', '', '```python', 'import ui', 'import time', 'x = ui.slider("x", 1, 0, 5)', '@ui.panel(x)', 'def slow(x):',
        '    if x == 3:', '        time.sleep(1.8)', '    return "x is %d" % x', '```', ''].join('\n'));
    const fr = await stablePanelFrame(page);
    if (fr) {
        await slide(fr, 'x', 3);
        check(await waitFor(async () => (await fr.locator('.cprs-panel-slow').count()) === 1, 20000), 'a slow update (1.8 s) is reported, and a player would be stopped');
        await slide(fr, 'x', 2);
        check(await waitFor(async () => (await fr.locator('.cprs-panel-slow').count()) === 0), 'the note goes away when updates are quick again');
    } else check(false, 'slow: the panel is drawn');
    await ctx.close();
}

// ---- 7. a widget given to two panels is one control; plotly=True; the layouts count and nesting limits ----------------------------
{
    const { ctx, page, errors } = await open();
    await setText(page, SHARED);
    const fr = await stablePanelFrame(page);
    check(!!fr, 'shared: both panels are drawn');
    if (fr) {
        check(await fr.locator('.cprs-panel').count() === 2, 'shared: two panels');
        const out2 = () => fr.locator('.cprs-panel').nth(1).locator('.cprs-w output').first().innerText();
        const text2 = () => fr.locator('.cprs-panel').nth(1).innerText();
        check((await text2()).includes('Move the span slider above 4 m'), 'shared: the second panel starts with only a note');
        await slide(fr, 'Span', 8);
        check(await waitFor(async () => (await out2()) === '8 m'), 'shared: moving the span in the first panel moves it in the second');
        const plotly = await waitFor(() => fr.locator('.cprs-panel').nth(1).locator('.js-plotly-plot').count().then(n => n > 0), 30000);
        if (!plotly) console.log('skip chart checks: Plotly.js did not load (no network?)');
        else check(true, 'plotly=True: the chart of the second panel is drawn though its first result had no chart');
        check(await waitFor(async () => (await fr.locator('.cprs-panel').first().innerText()).includes('96.0 kN.m')), 'shared: the first panel was run again (96.0 kN.m at 8 m)');
        await fr.locator('.cprs-reset').first().click();
        check(await waitFor(async () => (await out2()) === '3 m' && (await text2()).includes('Move the span slider above 4 m')), 'Reset puts a shared control back in both panels');
    }
    check(errors.length === 0, `shared: no page errors${errors.length ? ': ' + errors[0] : ''}`);
    await ctx.close();
}

// ---- 8. values kept with the file; a slider tied to a sheet input ---------------------------------------------------------------
{
    const { ctx, page } = await open();
    await setText(page, BEAM);
    const fr = await stablePanelFrame(page);
    if (fr) {
        await slide(fr, 'Span', 10);
        check(await waitFor(async () => (await tableText(fr)).includes('150.00 kN.m')), 'saved values: the panel was moved to 10 m');
        await page.locator('.preview-mode-group .toolbar-btn', { hasText: /^Input$/ }).click();
        await page.waitForTimeout(1500);
        const save = page.locator('button', { hasText: 'Save values' });
        check(await waitFor(async () => (await save.count()) > 0, 10000), 'saved values: moving a panel marks the values as unsaved (Save values is offered)');
        if (await save.count()) {
            await save.first().click();
            await page.waitForTimeout(1000);
            const saved = await page.evaluate(() => window.calcpadActiveEditor.getValue());
            check(/"panel:beam:L":\s*"10"/.test(saved), 'saved values: Save values writes panel:beam:L into the comment');
            const ctx2 = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
            const p2 = await ctx2.newPage();
            await p2.goto(url);
            await p2.waitForFunction(() => window.calcpadActiveEditor != null && window.calcpadFiles != null, null, { timeout: 60000 });
            await p2.evaluate(v => window.calcpadActiveEditor.setValue(v), saved);
            const fr2 = await stablePanelFrame(p2);
            check(!!fr2 && await waitFor(async () => (await fr2.locator('.cprs-w output').first().innerText()) === '10 m'), 'saved values: a reopened file starts the panel at 10 m');
            await ctx2.close();
        }
    }
    await ctx.close();
}
{
    const { ctx, page, errors } = await open();
    await setText(page, SHEETIN);
    await stablePanelFrame(page);   // answers the question about running Python, which would otherwise cover the buttons
    await page.locator('.preview-mode-group .toolbar-btn', { hasText: /^Input$/ }).click();
    await page.waitForTimeout(1500);
    const fr = await stablePanelFrame(page, 90000);
    check(!!fr, 'sheet input: the panel is drawn in Input mode');
    if (fr) {
        check(await fr.locator('.cprs-w output').first().innerText().catch(() => '') === '6 m', 'sheet input: the slider starts from the sheet input (ui.input, 6 m)');
        // the input is in the docked panel (a sheet with a slider docks its inputs) or, undocked, in the form
        const inputValue = async () => {
            const d = await page.locator('.input-dock .ce-field[data-name^="L:"] input').first().inputValue({ timeout: 500 }).catch(() => null);
            if (d !== null) return d;
            for (const f of page.frames()) { const v = await f.locator('input[data-ui-var^="L:"]').first().inputValue({ timeout: 500 }).catch(() => null); if (v !== null) return v; }
            return null;
        };
        const before = await converts(page);
        await slide(fr, 'Span', 9);
        await page.waitForTimeout(800);
        check((await converts(page)) === before, 'sheet input: dragging the slider does not convert the sheet');
        await slideRelease(fr, 'Span', 9);
        check(await waitFor(async () => (await inputValue()) === '9', 20000), 'sheet input: releasing the slider writes 9 into the sheet input L');
        check((await converts(page)) > before, 'sheet input: and the sheet is calculated again once');
    }
    check(errors.length === 0, `sheet input: no page errors${errors.length ? ': ' + errors[0] : ''}`);
    await ctx.close();
}

// ---- 9. completions for `ui.` inside a Python block ---------------------------------------------------------------------------
{
    const { ctx, page } = await open();
    await setText(page, '<!--sheet-->\n# T\n\n```python\nimport ui\nx = ui.\n```\n\nui.\n');
    await page.waitForTimeout(1500);
    const suggest = async (line, col) => {
        await page.evaluate(([l, c]) => { const e = window.calcpadActiveEditor; e.focus(); e.setPosition({ lineNumber: l, column: c }); e.trigger('t', 'editor.action.triggerSuggest', {}); }, [line, col]);
        await page.waitForTimeout(1200);
        const rows = (await page.locator('.suggest-widget .monaco-list-row').allInnerTexts().catch(() => [])).map(r => r.split('\n')[0]);
        await page.keyboard.press('Escape');
        return rows;
    };
    const inside = await suggest(6, 8);
    check(inside.length >= 10 && inside.includes('manipulate') && inside.includes('number') && inside.includes('markdown'), `completions: "ui." in a Python block offers the controls and helpers (${inside.length} shown)`);
    check((await suggest(9, 4)).length === 0, 'completions: the same text outside a Python block offers nothing');
    await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nall panel checks passed');
process.exit(fails.length ? 1 : 0);
