// Landing page of the Cookbook sample "Robot arm kinematics".
const SAMPLE = 'Cookbook robot arm kinematics.sheet';
// Without the Python blocks the names they export are undefined; give them placeholder values so the sheet's own maths runs.
// Nothing that depends on these placeholders is quoted on the page.
const STUBS = [
    ['fkx: fx(d1, d2, d3) -> m | tip of the solution', 'd1: 0; d2: 0; d3: 0\nfkx: fx(d1, d2, d3) -> m | tip of the solution'],
    ['if ws_rmax <= 0.75', 'ws_rmax: 0\nif ws_rmax <= 0.75'],
];

export default ({ V, tbl, taskSteps }) => ({
    slug: 'robot-arm-kinematics-calculator',
    label: 'Robot arm kinematics',
    group: 'calculator',
    area: 'robotics',
    title: 'Robot arm kinematics calculator, three joints',
    description: 'Worked example of forward and inverse kinematics for a three-joint planar robot arm: Jacobian, singularities, workspace and damped least squares, with units.',
    h1: 'Robot arm kinematics calculator',
    schema: [],
    open: 'cookbook-robot',
    video: V.first,
    related: ['engineering-calculations-with-units', 'engineering-calculation-software-free', 'export-calculations-to-word-excel-pdf'],
    howto: 'How to work through forward and inverse kinematics of a three-joint planar arm',
    runs: {
        base: { sample: SAMPLE, dropPython: true, replace: STUBS },
        stretched: { sample: SAMPLE, dropPython: true, replace: [...STUBS, ['t1: 0.5; t2: 0.3; t3: 0.1 | joint angles, rad', 't1: 0.5; t2: 0; t3: 0 | joint angles, rad']] },
    },
    lead: `<p>This is a worked example of the kinematics of a planar robot arm with three revolute joints: where the tool tip is for given joint angles (forward kinematics), how tip speed follows joint speed (the Jacobian), where the arm loses a direction of motion (singularities), and which angles reach a wanted point (inverse kinematics). It opens as a live sheet in CivilKit Calcs, and every formula is checked numerically in the sheet itself.</p>`,
    sections: [
        ['The arm', `<p>The links are 0.30 m, 0.25 m and 0.20 m long, so the arm stretched out reaches [[base:reach]]. All joints turn about the axis out of the page. The sheet sets angles to radians, so the base configuration of 0.5, 0.3 and 0.1 rad is about 29, 17 and 6 degrees. For a planar arm the Denavit-Hartenberg offset and twist are zero, so only each joint angle and link length matter.</p>`],
        ['Forward kinematics', `<p>The tip is the sum of three vectors, each turned by the sum of the joint angles up to it: x = L1 cos t1 + L2 cos(t1 + t2) + L3 cos(t1 + t2 + t3), and the same with sines for y. The tool points at t1 + t2 + t3. At the base configuration the engine gives:</p>
${tbl('base', [['Tool angle (rad)', 'phi_tool'], ['Distance of the tip from the base', 'dist']])}
<p>The sheet prints a PASS line when that distance is within the reach.</p>`],
        ['The Jacobian', `<p>Differentiating the tip position with respect to each joint angle gives a 2 by 3 matrix mapping joint speeds to tip velocity. The sheet writes its six entries from the formulas, then checks them against central finite differences of the forward kinematics, and prints a PASS line if no entry differs by 1e-8 m or more. That check uses no derivative formula, so it can catch a sign error. The first row at the base configuration:</p>
${tbl('base', [['J11 (m per rad)', 'J11'], ['J12', 'J12'], ['J13', 'J13']])}`],
        ['Manipulability and singularities', `<p>The manipulability w is the square root of the determinant of J times its transpose. It is zero when the arm has lost a direction. The sheet derives a closed form from the 2 by 2 minors of J, which shows that w does not depend on the first joint angle and vanishes only when every link lies on one line, stretched out or folded back.</p>
${tbl('base', [['w at the base configuration', 'w_closed'], ['w stretched out', 'w_ext'], ['w, elbow at a right angle, wrist bent back', 'w_bent']])}
<p>PASS lines check that the closed form equals the matrix value and that w is zero at the singular configurations. A plot shows w against the elbow angle.</p>`],
        ['Inverse kinematics', `<p>For links 1 and 2, a reachable target gives the elbow angle from the law of cosines and the first angle from two arctangents. The sign of the elbow angle is the choice of elbow: positive is elbow down, negative elbow up. The sheet builds a target from the tip at 0.5 and 0.3 rad and solves it back:</p>
${tbl('base', [['Target x', 'x_t'], ['Target y', 'y_t'], ['Elbow down, joint 1 (rad)', 'q1_dn'], ['Elbow down, joint 2 (rad)', 'q2_dn'], ['Elbow up, joint 1 (rad)', 'q1_up'], ['Elbow up, joint 2 (rad)', 'q2_up']])}
<p>PASS lines check that both solutions land on the target and that elbow down returns the original angles.</p>`],
        ['Three joints, workspace and sliders', `<p>Three joints need a target point and a tool angle. A controller iterates with damped least squares, which stays well behaved near singularities. That iteration, a workspace plot coloured by manipulability, and a set of three joint sliders are Python blocks in the sheet. They need Python, which the app asks permission to run once per tab, so this page quotes no number from them. The sheet checks the iteration against its own forward kinematics and against the closed form, whose wrist point for the target (0.45, 0.30) m at 1.0 rad is:</p>
${tbl('base', [['Wrist point x', 'x_w'], ['Wrist point y', 'y_w']])}`],
        ['Try the singular configuration', `<p>Setting the second and third angles to zero stretches the arm out. The engine then gives a tip distance of [[stretched:dist]] and a manipulability of [[stretched:w_closed]], and the sheet's regularity check prints FAIL, as it should.</p>`],
        ['What this is, and is not', `<div class="note">
<p><strong>This is a worked, self-checking example, not a design tool or a certified program.</strong> It prints PASS and FAIL lines for its own checks. It covers a planar arm only, with no dynamics and no collision checks. It is for learning and checking ideas, not for safety-critical use, and you should not run a real robot from it.</p>
<p>The problems follow the cookbook of the symplex library (MIT or Apache-2.0), rewritten for Calcs. Its public repository is github.com/cgorski/symplex.</p>
</div>`],
    ],
    steps: taskSteps('The link lengths, the base joint angles and the target point and tool angle are the values to change.'),
    faq: [
        ['Does the sheet need Python?', 'The forward kinematics, the Jacobian, the manipulability and the two-link inverse kinematics are sheet maths. The damped least squares iteration, the workspace plot and the sliders are Python blocks, which the app asks permission to run once per tab.'],
        ['Are the angles in degrees or radians?', 'Radians. The engine defaults to degrees for trigonometric functions, so the sheet switches to radians at the top, and the base angles of 0.5, 0.3 and 0.1 are radians.'],
        ['What is a singularity of the arm?', 'A configuration where the Jacobian loses rank and the tip cannot move in some direction. For this arm that is when every link lies on one line, stretched out or folded back, which is where the manipulability is zero.'],
        ['Why are there two inverse kinematics solutions?', 'The elbow can be up or down for the same target. The sheet computes both and checks that each puts the tip on the target.'],
        ['Can I use it to drive a real robot?', 'No. It is for learning and checking ideas, not for safety-critical use.'],
    ],
});
