// Landing page of the Cookbook sample "Digital filter by the bilinear transform". The sheet has no Python blocks,
// so every quoted number comes from the engine run of the sheet itself.
const SHEET = 'Cookbook digital filter.sheet';

export default ({ V, tbl, notCode, taskSteps }) => ({
    slug: 'digital-filter-design-bilinear-transform',
    label: 'Digital filter design',
    group: 'calculator',
    area: 'controls',
    title: 'Digital low-pass filter design: bilinear transform',
    description: 'Turn an analogue low-pass into a digital filter with the bilinear transform: coefficients, frequency prewarping, DC and Nyquist checks, frequency response.',
    h1: 'Digital filter design with the bilinear transform',
    schema: [],
    open: 'cookbook-filter',
    video: V.templates,
    related: ['simply-supported-beam-calculator', 'engineering-calculation-software-free', 'engineering-calculations-with-units'],
    howto: 'How to design a digital low-pass filter from an analogue prototype',
    runs: {
        base: { sample: SHEET },
        fast: { sample: SHEET, set: { fc: 'fc:    ? 2 Hz [0.01 .. 4 step 0.001] | cutoff frequency', fs: 'fs:    ? 8 Hz [2 .. 200 step 1] | sample rate' } },
        pre: { sample: SHEET, set: { fc: 'fc:    ? 2 Hz [0.01 .. 4 step 0.001] | cutoff frequency', fs: 'fs:    ? 8 Hz [2 .. 200 step 1] | sample rate', prewarp: 'prewarp: ? on | prewarp the analog cutoff so the digital filter is exactly -3 dB at fc' } },
    },
    lead: `<p>A sensor signal usually needs smoothing before a controller or a logger sees it. The smoothing is often designed as an analogue RC low-pass and then run on a microcontroller as a difference equation. This sheet does that conversion for a first-order low-pass using the bilinear (Tustin) transform: it gives you the coefficients, checks the gain at DC and at the Nyquist frequency, simulates a step response, and plots the digital and analogue frequency responses side by side so you can see the frequency warping.</p>
<p>You give it a cutoff and a sample rate in hertz, and it hands back the two-tap filter and a C update function.</p>`,
    sections: [
        ['What it computes', `<p>The analogue prototype is H(s) = wc/(s + wc), with wc = 2 pi fc. The bilinear transform replaces s by (2/T)(z - 1)/(z + 1), where T is the sample time 1/fs. With k = wc T / 2 the result is a first-order digital filter with b0 = b1 = k/(1 + k) and a1 = (k - 1)/(k + 1). The filter runs as y[n] = b0 x[n] + b1 x[n-1] - a1 y[n-1].</p>
<p>The sheet evaluates H(z) at z = 1 (DC) and z = -1 (half the sample rate), runs a unit step through 100 samples, plots both magnitudes in dB, and finds where the digital -3 dB point lands.</p>`],
        ['Frequency prewarping', `<p>The transform squeezes the whole analogue frequency axis from 0 to infinity onto 0 to fs/2, through Omega = (2/T) tan(w T / 2). The digital -3 dB point is therefore at 2 atan(k) radians per sample rather than at wc T. The difference is tiny when the cutoff is far below the sample rate and grows quickly near fs/2.</p>
<p>Prewarping fixes the one frequency you care about. With the prewarp box ticked, wc inside the transform is replaced by (2/T) tan(wc T / 2), which puts the digital -3 dB point exactly on fc.</p>`],
        ['Worked example', `<p>The base case is a cutoff of 1 rad/s (about 0.159 Hz) sampled at 10 Hz. Engine results:</p>
${tbl('base', [['Sample time T', 'T'], ['k = wc T / 2', 'k'], ['Coefficient b0', 'b0'], ['Coefficient b1', 'b1'], ['Coefficient a1', 'a1'], ['Gain at DC', 'H_dc'], ['Gain at Nyquist', 'H_ny'], ['First step sample y[0]', 'y_first'], ['Step output after 100 samples', 'y_last'], ['Digital -3 dB frequency', 'f_dig'], ['Shift from the target cutoff', 'shift']])}
<p>The coefficients are the exact fractions 1/21, 1/21 and -19/21, shown here as decimals. The gain is [[base:H_dc]] at DC and [[base:H_ny]] at the Nyquist frequency, as a low-pass should give. The digital -3 dB point is at [[base:f_dig]] against a target of [[base:fc]], a shift of only [[base:shift]], because the cutoff is far below fs/4.</p>`],
        ['When warping matters', `<p>Now take a cutoff of 2 Hz sampled at 8 Hz, so the cutoff is right at fs/4. The coefficients become b0 = [[fast:b0]] and a1 = [[fast:a1]], and the digital -3 dB point lands at [[fast:f_dig]] instead of 2 Hz, a shift of [[fast:shift]]. The sheet warns that the cutoff is above fs/4.</p>
<p>Tick the prewarp box for the same inputs and k becomes [[pre:k]], with b0 = [[pre:b0]]. The digital -3 dB point is now at [[pre:f_dig]], on the target.</p>`],
        ['The checks it prints', `<p>Each check prints a PASS or FAIL line: the cutoff is below fs/2, a separate k = 1/20 case gives exactly 1/21 and -19/21, the DC gain is 1, the Nyquist gain is 0, the loop matches the closed form, and the magnitude at 2 atan(k) is 0.7071, which is -3 dB. A cutoff above fs/4 prints a warning, not a failure.</p>`],
        ['What this is, and is not', `<div class="note">
<p><strong>This is a worked, self-checking example, not a design tool or a certified program.</strong> It covers one first-order low-pass. It covers no higher orders, no band-pass or high-pass forms and no fixed-point analysis. It is for learning and for checking ideas, not for safety-critical use. The problem follows the cookbook of the symplex library (MIT or Apache-2.0), rewritten for Calcs; the library is at github.com/cgorski/symplex.</p>
</div>`],
        ['The sheet source', `<p>This is the sheet as it ships. The lines with a question mark are the inputs. It needs no Python.</p>
{{code:base}}`],
        ['How to use it', `<ol>
${taskSteps('The cutoff, the sample rate and the prewarp box are the three inputs.').map(([n, t]) => `<li><strong>${n}.</strong> ${t}</li>`).join('\n')}
</ol>`],
    ],
    steps: taskSteps('The cutoff, the sample rate and the prewarp box are the three inputs.'),
    faq: [
        ['What is the bilinear transform?', 'A way to turn an analogue transfer function H(s) into a digital one H(z) by replacing s with (2/T)(z - 1)/(z + 1). It keeps a stable filter stable.'],
        ['What is frequency prewarping?', 'The transform distorts the frequency axis through a tangent. Prewarping replaces the cutoff in the transform with (2/T) tan(wc T / 2), so the digital -3 dB point falls exactly on the cutoff you asked for.'],
        ['Why is the Nyquist gain zero?', 'The transform maps infinite analogue frequency to z = -1, half the sample rate, where this filter has a zero.'],
        ['Does the sheet need Python?', 'No. Everything is ordinary sheet calculation and a short loop.'],
        ['Can I use the coefficients in a real product?', 'Use them to learn and to check your own derivation. The sheet is a worked example, not a certified program, and it is not meant for safety-critical use.'],
    ],
});
