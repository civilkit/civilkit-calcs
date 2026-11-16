# Known gaps and rough edges

Found while writing the Cookbook samples (PID, filter, Lagrangian, robot arm,
gradient descent, RSA, certificates). Each has a workaround used in the samples.
Ordered by how likely a new user is to hit it.

| # | Gap | Workaround in samples | Possible fix |
|---|-----|-----------------------|--------------|
| 1 | Trig functions default to degrees, so `sin(0.5)` is not what a Python or MATLAB user expects | Add `>> #rad` | Show a one-time hint when a trig argument looks like radians; document prominently |
| 2 | A variable named `m`, `g` or `h` silently replaces the unit of the same name | Use `mass`, `grav`, `hgt` | Warn when an assignment shadows a unit |
| 3 | ~~Loops print every pass~~ Documented already (`#hide`, `#show`, `#round`); my earlier note was wrong | | |
| 4 | No complex numbers in sheets (`i` is undefined) | Use real pairs, or a Python block | Add a complex type, or document the Python route |
| 5 | Vectors cannot be plotted directly | Plot component lists | Accept a vector as y-values |
| 6 | `plot` lines have no axis labels | Title carries the units | Add `xlabel` and `ylabel` options |
| 7 | `atan2(x; y)` takes x first, the reverse of most languages. Now stated in the function reference | Check order in each sample | Accept both with a hint |
| 8 | `qdd: 1 1/s^2` does not parse | Write `1/s^2` | Parse a number followed by a unit fraction |

Python blocks (MicroPython): no `next(gen, default)` and no `int.bit_length()`;
`pow` with three arguments and big integers work. Exported Python names lose
underscores in the results display. Plotly needs network access for its CDN.

Remove a row when it is fixed and mention the fix in CHANGELOG.md.
