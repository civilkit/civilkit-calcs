# Language rules: expressions, brackets and numbers

<!-- description: The Calcpad language rules: how lines and brackets are read, operator precedence, variable naming, number limits, and how results are rounded and formatted. -->

This page collects the rules of the Calcpad language that decide whether a line is accepted, how an expression is evaluated, and how the result is printed. The
examples here are plain Calcpad language; in a sheet the same expressions work after a `>>` line
or inside a `calcpad` fence. Trig functions use degrees unless you write `#rad`.

## Lines

Each line is one expression, a comment in quotes, or a directive. Do not end an expression with
`=`: that is the assignment operator, and the result is added for you. A line that ends in `=`
is an error.

```text
Error in "a = 2 =" on line [ 1 ]: Improper use of the assignment operator '='.
```

A long expression can be split in two ways:

- end the line with `_` and carry on in the next line;
- or just break the line after an open bracket `(` or after a `;` inside a bracket.

```cpd
x = 1 + _
    2 + 3
y = max(1;
        3)
z = (
    1 + 2)
```

A break after an operator without `_` is not allowed: `x = 1 +` then `2` gives
`Incomplete expression`, and the `2` on the next line is a separate expression.

## Brackets

Only round brackets group an expression. Square brackets make vectors and matrices (see
[Vectors and matrices](../vectors-matrices.md)), and curly brackets are not an operator at all:
`a = {2}` gives `Invalid symbol: "{"`.

| Mistake | Message |
| --- | --- |
| `b = (2 + 3` | `Missing right bracket ")"` |
| `c = 2 + )3` | `Missing left bracket "("` |
| `d = sin 30` or `e = sqr 9` | `Invalid syntax`: a function name must be followed by `(` |
| `k = 3`, then `m = k(2)` | `Invalid function: "k"`: a variable is not a function |

The output adds brackets where they make the arithmetic unambiguous, even if you did not type
them. A negative value that is substituted into a power, or a product, is shown in brackets:

<!-- expect: a ^2 = (-2)^2 = 4 | -a = -(-2) = 2 | a · (-3) = -2 · (-3) = 6 -->
```cpd
a = -2
a^2
-a
a*(-3)
```

## Operators and precedence

From first to last, the order of evaluation is:

| Level | Operators |
| --- | --- |
| 1 | `!` factorial |
| 2 | `^` power (right to left) |
| 3 | `*`, `/`, `\` (integer division), `⦼` or `%%` (remainder) |
| 4 | `+`, `-` |
| 5 | `<`, `>`, `≤`, `≥`, `≡`, `≠` (all the same level) |
| 6 | `∧`, `∨`, `⊕` |

Operators of the same level go from left to right, with one exception: `^` goes from right to
left, so `2^3^2` is `2^(3^2) = 512`, not `(2^3)^2 = 64`. This is unlike many calculators and
Excel. A unary minus comes after the power, so `-2^2` is `-4`; write `(-2)^2` for 4.

<!-- expect: 2^3 2 = 512 | 2^3∙^2 = 64 | -(2^2) = -4 | 2 · 3 2 · 3 = 9 | 2^-1 = 0.5 -->
```cpd
2^3^2
(2^3)^2
-2^2
2*3/2*3
2^-1
```

The relational operators give 1 for true and 0 for false, so they can be used inside arithmetic.
In the logical operators any nonzero value counts as true, and the result is again 1 or 0:

<!-- expect: 5 and 2 = 1 | 0 or 7 = 1 | 7 mod 3 = 1 | = 3 -->
```cpd
5 && 2
0 || 7
7 %% 3
a = 3
b = 1
a*(a ≥ b) + b*(a < b)
```

The shortcuts `==`, `!=`, `<=`, `>=`, `&&`, `||` and `%%` are replaced by the operators in the
table. CalcpadCE's manual also lists `//` and `^^` as shortcuts, but neither works here nor in
CalcpadCE itself: `7 // 2` gives `Invalid syntax: "/ /"` and `1 ^^ 1` gives `Invalid syntax: "^ ^"`.
Write `÷` and `⊕` (or `∧`, `∨`) directly. `%` alone is kept for percent units and is not the
remainder (`7 % 3` is `Invalid syntax`).

A negative base with a fractional exponent has no real result: `(-8)^(1/3)` prints `Undefined`
in the default real mode. Complex mode (below) gives `1 + 1.73i` at two decimals.

## Variables

A name is case sensitive: `A` and `a` are two variables. Letters, digits, `_` and the Greek and
other letters are allowed. Everything after a `_` is a subscript in the output, so `x_1`
prints as x with a small 1, and `x₁` (with a real subscript character) is a different variable
from `x_1`.

```cpd
A = 1
a = 2
x_1 = 3
x₁ = 4
A + a
x_1 + x₁
```

A variable must be defined above the line that uses it. Using a name that has not been defined
yet gives `Undefined variable or units`, and the definition below it does not help:

```text
Error in "u = v + 1" on line [ 1 ]: Undefined variable or units: "v".
```

Short names can clash with units. `y` is the unit of a year, so `x = y + 1` gives
`Inconsistent units: "y + unitless"` rather than the message above. Pick a name that is not a
unit, or see [Units](../units.md).

Assigning to a name again replaces its value for the lines that follow; lines above keep what
they printed.

<!-- expect: r = 1 | r = 5 | s = r + 1 = 5 + 1 = 6 -->
```cpd
r = 1
r = 5
s = r + 1
```

A `#const` cannot be replaced; see [Directives](directives.md).

## Number limits

A number is a double-precision value, about 15 significant digits.

| You write | You get |
| --- | --- |
| `10^308*10` (beyond about 1.8E308) | `+∞` |
| `-10^308*10` | `-∞` |
| `1/0` | `+∞`; `-1/0` gives `-∞` |
| `0/0` | `Undefined` |
| `10^-330` (below about 4.9E-324) | `0` |
| `3.4e+6` | error: `Error parsing "e" as units` |
| `4.94065645841247E-324` | error: `Error parsing "E" as units` |

There is no exponent notation for a literal. Write a power of ten instead:

<!-- expect: 3.4 · 10^6 = 3400000 | 10^-330 = 0 -->
```cpd
3.4*10^6
10^-330
```

An infinite or undefined result is shown, not raised as an error, but the engine marks it like
one (the line turns red), so check for it:

```text
1/0 = +∞
0/0 = Undefined
```

## Complex mode and polar entry

Complex numbers are off until you switch them on. In the Calcpad language, put a settings line
first; in the app it is also a switch in Settings. With it on, `i` is the imaginary unit (`1i`
works too) and `A∠φ` enters a value by magnitude and angle, in degrees unless `#rad` is set:

<!-- expect: z = 2 + 3i | 2 + 1i | 2.12 + 2.12i | 1 + 1.73i -->
```cpd
#settings {"complex": true}
z = 2 + 3i
w = 1i + 2
p = 3∠45
(-8)^(1/3)
```

`5 << 30` is a shortcut for `5∠30`. Comparing a complex value, as in `(1+2i) < 3`, gives
`Undefined` rather than an error. Without the settings line both `2 + 3i` and `3∠45` are
errors (`Error parsing "i" as units`, `Invalid symbol: "∠"`).

This is an addition of CivilKit Calcs: CalcpadCE run on a file rejects both `i` entry and `∠`,
with or without the setting, because its complex mode is a switch in the desktop program. See
[Deviations from CalcpadCE](../appendix/deviations.md).

## Rounding and number format

The output shows `n` decimals, set by the **Decimals** setting. `#round n` changes it from that
line on, `#round default` goes back. `n` is from 0 to 15, and a value outside that range is
taken as the nearest limit: `#round -1` rounds like 0 and `#round 20` like 15. The keyword can
be written `#Round` too.

A small result would print as all zeros, so a value under 1 is shown with one digit more than
`n` significant digits, and a very small one switches to the form `3.142×10-5`. With `#round 3`:

<!-- expect: 10^-6 · π = 10^-6 · 3.142 = 3.142×10^-6 | 0.001 · π = 0.001 · 3.142 = 0.003142 | 0.1 · π = 0.1 · 3.142 = 0.3142 | 1 · π = 1 · 3.142 = 3.142 | 1000 · π = 1000 · 3.142 = 3141.593 -->
```cpd
#round 3
0.000001*π
0.001*π
0.1*π
1*π
1000*π
```

The CalcpadCE manual shows `0.001*π` as `0.00314`, `0.1*π` as `0.314` and `1000*π` as `3141.59`
for `#round 3`. Both engines actually print `0.003142`, `0.3142` and `3141.593`, as above;
`#round 2` is what gives `0.00314`. Only the display is rounded: the stored value keeps its
full precision.

`#format` sets a format string for all following results, and `:` followed by a format string
formats one value. Upper-case letters are the ones to use. Lower case `f2` also works, but `e2` prints `1.23e+002` in plain text, where `E2` prints the `×10` form shown below:

| Format | Meaning | Example |
| --- | --- | --- |
| `F2` | fixed, 2 decimals | `123.456789:F2` gives `123.46` |
| `E3` | exponent form | `123456.789:E3` gives `1.235×10+005` |
| `N3` | number, 3 decimals | `0.0012345678:N3` gives `0.001` |
| `G3` | general, 3 significant digits | `123456m:G3` gives `1.23×10 5 m` |
| `C2` | currency, with the local symbol | not shown, depends on the locale |
| `0.000e-00` | custom pattern | `0.12:0.000e-00` gives `1.200e-01` |

<!-- expect: 123457 = 1.235×10^+005 | 123.46 = 123.46 | 0.00123 = 0.001 | 0.12 = 1.200e-01 | π = 3.1416 | π = 3.141592653589793 -->
```cpd
123456.789:E3
123.456789:F
0.0012345678:N3
0.12:0.000e-00
#format F4
π
#format default
#round 15
π
```

A letter with no number uses the current rounding (`F` above printed 2 decimals, the default here). The 0 to 15 limit belongs to `#round`; a format such as `F20` is not clamped and just
prints extra digits that are not meaningful. A malformed format (`#format F-1`) gives `Invalid format string`
and the previous format stays. The decimal separator in the app follows
[Number format](../number-format.md).
