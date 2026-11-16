# Numerical methods

<!-- description: Solve equations, find extremes, integrate, differentiate and iterate in a worksheet with $Root, $Inf, $Sup, $Area, $Slope, $Sum, $Repeat and $While. -->

Numerical commands solve what has no closed form: roots, extremes, integrals, derivatives, sums and
loops, each written as one expression. A command has the form
`$Name{expression @ variable = a : b}` and returns a number, so you can use it inside any
expression or assign it to a name. The variable (`x`, `k`, `t`, any name) is local to the command:
the worksheet's own `x` is not changed.

| Command | Result |
| --- | --- |
| `$Root{f(x) @ x = a : b}` | A root of f in the interval |
| `$Inf{f(x) @ x = a : b}`, `$Sup{...}` | A local minimum, a local maximum |
| `$Area{f(x) @ x = a : b}`, `$Integral{...}` | The definite integral |
| `$Slope{f(x) @ x = a}`, `$Derivative{...}` | The first derivative at a point |
| `$Sum`, `$Product`, `$Repeat` | An iterated sum, product, or any repeated expression |
| `$While{condition; expr; ...}` | A loop that runs while the condition holds |

`$Root`, `$Inf`, `$Sup`, `$Area`, `$Integral`, `$Slope` and `$Derivative` work with real numbers
only. `$Sum`, `$Product`, `$Repeat` and `$While` also work with complex numbers. Trig functions
use degrees unless you write `#rad`, so the examples below say which they use.

## Roots

<!-- expect: $Root{f(x) = 0; x ∈ [2; 3]} = 2.09 | x ∈ [0; 2]} = 1.05 -->
```cpd
#rad
f(x) = x^3 - 2*x - 5
r = $Root{f(x) @ x = 2 : 3}
q = $Root{cos(x) = 0.5 @ x = 0 : 2}
```

Write `= c` after the expression to solve f(x) = c instead of f(x) = 0.

The method narrows the interval around a sign change, so `f(a)` and `f(b)` (after subtracting c)
must have opposite signs. Two things follow:

* A function that stays on one side of zero has no root to find. `$Root{x^2 + 1 @ x = -1 : 1}`
  reports `No solution for`.
* A function that only touches zero has no sign change either. `$Root{(x-1)^2 @ x = 0 : 3}`
  reports `No solution for`, although x = 1 is a root.

If the interval holds several roots you get only one of them. Plot the function first, then call
`$Root` once per interval that brackets a single crossing:

<!-- expect: x ∈ [-3; 0]} = -1 | x ∈ [0; 3]} = 1 -->
```cpd
a = $Root{x^2 - 1 @ x = -3 : 0}
b = $Root{x^2 - 1 @ x = 0 : 3}
```

## Minimum and maximum

`$Inf` finds a local minimum and `$Sup` a local maximum. The position where it occurs is stored in
a variable named after the argument with `_inf` or `_sup` added: `x_inf`, `x_sup`, or `t_sup` if you
wrote `@ t = ...`.

<!-- expect: x ∈ [0; 6]} = -4 | x_inf = 2 -->
```cpd
v = $Inf{x^2 - 4*x @ x = 0 : 6}
x_inf
```

If there is no local extreme inside the interval, you get the better of the two end values, and
the stored position is that end. Here sine (in degrees) is still rising at 3, so the maximum is at
the right-hand end:

<!-- expect: x ∈ [0; 3]} = 0.0523 | x_sup = 3 -->
```cpd
h = $Sup{sin(x) @ x = 0 : 3}
x_sup
```

With several local minima, one is returned, not necessarily the smallest. Narrow the interval
around the one you want. The result variable is set by the command, so read it straight after the
call: the next `$Inf` overwrites it.

## Integrals

<!-- expect: sin(x) d x = 2 | exp(-(x^2)) d x = 0.882 -->
```cpd
#rad
A = $Area{sin(x) @ x = 0 : π}
I = $Integral{exp(-x^2) @ x = 0 : 2}
```

Both give the definite integral, using different algorithms:

* `$Area` is adaptive (Gauss-Lobatto). It copes with kinks and jumps, so use it when you are not
  sure the function is well behaved.
* `$Integral` (tanh-sinh) is sharper for smooth, continuous functions, and can fail outright on
  others. Split the interval at the discontinuities and add the pieces, or use `$Area`.

A step function shows the difference:

<!-- expect: sign(x) d x = 1 -->
```cpd
c = $Area{sign(x) @ x = -1 : 2}
```

```text
d = $Integral{sign(x) @ x = -1 : 2}
Error: No solution for: $Integral{sign(x); x = -1...2}
```

A function that is undefined inside the interval, such as `1/x` across 0, is an error for both:
`The function f(x) is not defined for x = 0`.

## Derivatives

<!-- expect: m = d d x x^3 | x = 2 = 12 | n = d d x x^3 | x = 2 = 12 -->
```cpd
m = $Slope{x^3 @ x = 2}
n = $Derivative{x^3 @ x = 2}
```

| | `$Slope` | `$Derivative` |
| --- | --- | --- |
| Method | Finite differences with extrapolation | Complex step |
| Accuracy | Within the Precision setting | Close to machine precision |
| Function | Continuous and smooth near the point | Analytic only |
| Nested commands | Allowed | Not allowed |

`$Slope` is the safe default. It can contain another numerical command:

<!-- expect: = 4 -->
```cpd
s = $Slope{$Area{t^2 @ t = 0 : x} @ x = 2}
```

`$Derivative` fails quietly on a function that is not analytic. It returns 0 for `abs(x)` at x = 2
(the true slope is 1) and 0 when the function contains `$Area`, with no error. Use `$Slope` for
those. CalcpadCE behaves the same way.

## Sums and products

<!-- expect: = 1.63 | ∑ | = 120 | = 120 -->
```cpd
S = $Sum{1/k^2 @ k = 1 : 100}
P = $Product{k @ k = 1 : 5}
C = $Product{(i + 10 - 3)/i @ i = 1 : 3}
```

`$Sum` and `$Product` step `k` upward in whole numbers from `a` to `b`, so keep a below b. With
`a` above `b` the command does not count down: `$Sum{k @ k = 5 : 2}` returns 5 and
`$Product{k @ k = 3 : 1}` returns 3, one term each. The body does not have to use `k`:
`$Sum{7 @ k = 1 : 3}` adds 7 three times and gives 21.

The `C` line above is the binomial coefficient C(10; 3) built as a product. It avoids the
large intermediate factorials of `fact(10)/(fact(3)*fact(7))`, so it stays accurate for large n.

## Repeat

`$Repeat{expression @ k = a : b}` evaluates the expression once per value of `k` and returns the
last result. On its own that equals a sum or product written the slow way. It earns its place when
the expression assigns to a variable that the next pass reads:

<!-- expect: inside = g(0.1) = 0.113 -->
```cpd
g(c) = $Repeat{z = z^2 + c @ i = 1 : 100}
inside = g(0.1)
```

This is the Mandelbrot iteration. Starting from `z = 0`, the sequence settles near 0.1127 for
c = 0.1, which means 0.1 is inside the set. Assignments inside the loop are local to it, which is
why `z` starts from 0 on every call without you resetting it.

For a point outside the set the value grows without bound. With real numbers the sequence
overflows and the call stops with `The function z = z^2 + c is not defined for i = 12` (c = 1).
Switch on complex numbers to iterate with a complex `c`. A complex point outside the set, such as
1 + 1i, ends as `+∞` instead of an error:

<!-- expect: = 0.23 -->
```cpd
#settings {"complex": true}
g(c) = $Repeat{z = z^2 + c @ i = 1 : 100}
a = abs(g(0.1 + 0.2i))
```

See [Vectors and matrices](../vectors-matrices.md) for the complex setting, and
`mandelbrot(x; y)` in the [function reference](../reference/functions.md) for a built-in version.

## While

`$While{condition; expr1; expr2; ...}` runs the expressions as long as the condition is true and
returns the last value. A variable you create inside with `=` is local to the loop, even if the
name already exists outside. To change an outer variable on purpose, assign with `←`:

<!-- expect: n ← n + 3 = 12 -->
```cpd
n = 0
u = $While{n < 10; n ← n + 3}
```

The loop stops once `n` reaches 12 and the outer `n` holds that value. Written with `=` instead,
`n = n + 3` makes a new local `n` on each pass while the condition keeps reading the outer `n`,
which never changes. The loop cannot end, and after a long wait (it can be minutes) you get:

```text
Possibly infinite loop detected, n > 1000000000 iterations
```

A condition that can never become false does the same. If a `$While` seems to hang, check that the
loop variable is updated with `←`.

## Precision

The `Precision` setting is the relative precision the root, extreme, integral and derivative
commands aim for. The default is 1e-14 and the allowed range is 1e-15 to 1e-2. Set it on its own
line with a decimal number, or in `#settings`:

<!-- expect: = 1.414211 | = 1.414214 -->
```cpd
#round 6
Precision = 0.01
a = $Root{x^2 = 2 @ x = 0 : 3}
Precision = 0.00000000000001
b = $Root{x^2 = 2 @ x = 0 : 3}
```

A loose precision gives an answer correct to fewer digits (1.414211 against
1.414214 above). Tighten it only if a result must hold more digits than the default gives.
In `#settings` JSON you may write `{"precision": 1e-6}`; on an assignment line `1e-6` is not
accepted, because the `e` is read as the constant e. Spell the number out, as above.

## When a command fails

| Symptom | Cause and fix |
| --- | --- |
| `No solution for: $Root{...}` | No sign change in the interval, or a double root that only touches zero. Plot, then bracket a crossing. |
| `No solution for: $Integral{...}` | Discontinuity or a singularity. Use `$Area`, or split the interval. |
| `The function f(x) is not defined for x = ...` | The expression is undefined at a point the method tried. Narrow the interval. |
| `$Derivative` returns 0 or a wrong value | Function is not analytic or contains another command. Use `$Slope`. |
| `Possibly infinite loop detected` | The `$While` condition never turns false. Update the variable with `←`. |
| Wrong angle in a trig function | Angles are degrees by default. Add `#rad`. |
