// Landing page for the Cookbook sample "PID controller design". The Python panel of the sheet is dropped from the
// engine runs (it runs only in the browser), so every quoted number comes from the sheet's own calculation lines.
export default ({ V, tbl, notCode }) => {
    const S = 'Cookbook PID controller.sheet';
    const steps = [
        ['Open the sheet', 'Choose <strong>Open this template</strong> on this page. It opens in a new tab with the base gains.'],
        ['Switch to Input mode', 'In the results bar choose <strong>Input</strong>. The gains and motor values become sliders.'],
        ['Move the gains', 'Drag Kp, Ki and Kd. The coefficients, the Routh lines, the poles and the step response plot all recalculate.'],
        ['Read the verdicts', 'Read the PASS and FAIL lines. Python, needed only for the separate slider panel lower in the sheet, is asked for once per tab.'],
    ];
    return {
        slug: 'pid-controller-design-calculator',
        label: 'PID controller design',
        group: 'calculator',
        area: 'controls',
        title: 'PID controller design and tuning calculator',
        description: 'Design a PID controller for a DC motor: closed-loop polynomial, Routh-Hurwitz stability check, poles and step response, with the gains as sliders.',
        h1: 'PID controller design calculator',
        schema: [],
        open: 'cookbook-pid',
        video: V.templates,
        related: ['simply-supported-beam-calculator', 'engineering-calculation-software-free', 'engineering-calculations-with-units'],
        howto: 'How to check a PID controller for stability and see its step response',
        runs: {
            base: { sample: S, dropPython: true },
            unstable: { sample: S, dropPython: true, set: {
                Kp: 'Kp: ? 0.5 [0.2 .. 20 step 0.1] | proportional gain',
                Ki: 'Ki: ? 15 [0.1 .. 30 step 0.1] | integral gain',
            } },
            nokd: { sample: S, dropPython: true, set: {
                Kp: 'Kp: ? 15 [0.2 .. 20 step 0.1] | proportional gain',
                Kd: 'Kd: ? 0 [0 .. 3 step 0.05] | derivative gain',
            } },
        },
        lead: `<p>This sheet works through one classic control problem: a DC motor with a PID controller. It builds the closed-loop polynomial, tests it with the Routh-Hurwitz rule, finds the poles and plots the step response. In Input mode the gains are sliders.</p>`,
        sections: [
            ['What it computes', `<p>The motor is normalised, with time in seconds and no other units, so poles come out in 1/s. It has an inertia J, a damping b and a gain K, and the controller adds Kp, Ki and Kd. With unity feedback the poles are the roots of a cubic. The sheet then:</p>
<ol>
<li>It forms the monic cubic s^3 + a2 s^2 + a1 s + a0 from the gains and the motor values.</li>
<li>It applies the Routh-Hurwitz test and prints a PASS or FAIL line for each condition, then a verdict.</li>
<li>It solves the cubic in closed form and prints the three poles, then substitutes them back to check the residual.</li>
<li>It writes the step response as a sum of exponential terms, checks that it starts at zero, and plots it against the target of 1.</li>
</ol>
<p>It ends with the discrete update equation, a sample-time check and a short C function.</p>`],
            ['The formulas', `<ul>
<li>Characteristic equation: J s^3 + (b + K Kd) s^2 + K Kp s + K Ki = 0. Dividing by J gives a2 = (b + K Kd) / J, a1 = K Kp / J and a0 = K Ki / J.</li>
<li>Routh-Hurwitz for a cubic: stable when a2 &gt; 0, a0 &gt; 0 and a2 a1 &gt; a0. The third entry of the first column is (a2 a1 - a0) / a2.</li>
<li>Poles: the cubic is solved by the trigonometric form or by Cardano's cube roots, and the other two poles come from the remaining quadratic.</li>
<li>Discrete form: integral gain Ki Ts and derivative gain Kd / Ts per sample, with a sample time of at most a tenth of the fastest time constant.</li>
</ul>`],
            ['Worked example', `<p>Base case: Kp = 5, Ki = 2, Kd = 0.5, with J = 1, b = 10 and K = 20. Results from the engine:</p>
${tbl('base', [['Coefficient a2', 'a2'], ['Coefficient a1', 'a1'], ['Coefficient a0', 'a0'], ['Third Routh entry', 'R3'], ['First pole', 're1'], ['Second pole', 're2'], ['Third pole', 're3'], ['Largest sample time (rule of ten)', 'Ts_max']])}
<p>All three Routh conditions pass, so the sheet prints "VERDICT: the closed loop is stable." The three poles are real and negative, which agrees with the Routh result. The integral term makes the response settle to 1 with no steady-state error, and the slowest pole, [[base:re1]], sets the length of its tail.</p>`],
            ['Change the gains and watch the verdict flip', `<p>Set Kp to 0.5 and Ki to 15. Now a2 a1 is [[unstable:a1]] times [[unstable:a2]], which does not exceed a0 = [[unstable:a0]], so the third Routh entry is [[unstable:R3]] and the sheet prints FAIL. The poles confirm it: one real pole at [[unstable:re1]] and a complex pair with real part [[unstable:sig]] and imaginary part plus or minus [[unstable:om]]. A positive real part means growing oscillation.</p>
<p>Now remove the derivative term with Kd = 0 and Kp = 15. The coefficients become a2 = [[nokd:a2]], a1 = [[nokd:a1]] and a0 = [[nokd:a0]]. The loop is stable, but two poles are now a complex pair with real part [[nokd:sig]] and imaginary part plus or minus [[nokd:om]], so the response rings. Raising Kd adds damping.</p>`],
            ['The slider panel needs Python', `<p>Lower in the sheet is a separate interactive panel, written in Python. It has its own sliders for the fixed motor, integrates the closed-loop equations on every move, and prints a Routh verdict with the peak and overshoot. No numbers from it are quoted here. It needs Python, which the app asks permission to run once per tab. The rest of the sheet works without it.</p>`],
            ['What this is, and is not', `<p>This is a worked, self-checking example. It prints PASS and FAIL lines for the Routh conditions, pole residuals, the response start and the sample time. It is not a design tool, a certified program, or a model of your actual hardware: the plant is a normalised textbook motor with no actuator limits, delay or noise.</p>
<p>It is for learning and checking ideas, not for safety-critical use. The problems follow the cookbook of the symplex library (MIT or Apache-2.0), rewritten for Calcs; the public repository is <a href="https://github.com/cgorski/symplex">github.com/cgorski/symplex</a>.</p>`],
            ['How to use it', `<ol>
${steps.map(([n, t]) => `<li><strong>${n}.</strong> ${t}</li>`).join('\n')}
</ol>`],
        ],
        steps,
        faq: [
            ['How does the sheet check stability?', 'It uses the Routh-Hurwitz test on the closed-loop cubic: a2 and a0 must be positive and a2 a1 must exceed a0. It also finds the poles and checks that they agree.'],
            ['Can I use my own motor?', 'Yes. J, b and K are inputs. The formulas fit this plant shape, a motor with an integrator and a first-order lag; another plant needs other equations.'],
            ['Why does the loop go unstable with a high Ki and a low Kp?', 'The constant term a0 grows with Ki while a1 grows with Kp. When a2 a1 no longer exceeds a0, a pair of poles crosses into the right half plane.'],
            ['Does the whole sheet need Python?', 'No. The polynomial, Routh lines, poles, step response plot and sample-time check are ordinary sheet maths. Only the slider panel is Python, and the app asks permission once per tab.'],
            ['Can I use it to tune a real controller?', 'It is for learning and checking ideas, not for safety-critical use. Test on the real system with proper limits.'],
        ],
    };
};
