# Interactive panels

<!-- description: Sliders, number boxes, buttons and drop-downs in a Python block that redraw charts, tables, Markdown and tabs in place as you move them, without recalculating the sheet. -->

An interactive panel is a set of controls drawn above a chart, a table or a line of text, all made
by one Python block. Move a slider and one Python function runs again with the new value, and its
chart or table is redrawn in place. The rest of the sheet is not recalculated, so a panel stays
quick even when the sheet is long.

The samples in the **Panels** group show seven of them: a beam deflection explorer, a pump
operating point with a play button, a column buckling player, a free vibration chart written
with the short form `ui.manipulate`, beam diagrams in tabs with number boxes and a button, two
panels that share one slider, and a slider tied to a sheet input.

## Prompt-friendly summary

A complete sheet with a slider that redraws a chart:

````sheet python
# Moment explorer

```python
import ui
import plotly.graph_objects as go
L = ui.slider("L", 6, 2, 12, step=0.5, unit="m", label="Span")
@ui.panel(L)
def moment(L):
    x = [L * i / 40 for i in range(41)]
    return go.Figure(go.Scatter(x=x, y=[12 * v * (L - v) / 2 for v in x]))
```
````

The five rules:

1. Write it in a ` ```python ` fence of a sheet, `import ui`, make the widgets with `ui.slider`,
   `ui.number`, `ui.select`, `ui.checkbox`, `ui.button` or `ui.player`, and decorate one function with
   `@ui.panel(widget, ...)` (or write the controls as tuples with `@ui.manipulate`). The function takes
   one argument per widget, in the same order, and receives plain values.
2. Return a Plotly figure (do not call `fig.show()`; `ui.plot(x, y)` makes a line chart), a string,
   `ui.markdown(...)`, `ui.table(rows, header=[...])`, a layout (`ui.row`, `ui.column`, `ui.tabs`) or a
   list of these. A panel whose first result is not a chart needs `plotly=True` if a later one will be.
3. The panel cannot read the sheet's quantities, and the sheet cannot read the panel's values, with two
   exceptions: `ui.input("L")` starts a panel from the sheet's own input `L`, and a slider made with
   `sheet=True` writes its value back into that input. Put every other number the panel needs in the block.
4. The Python is a small stand-in for numpy: `reshape`, `vstack`, `hstack` and `sort` are not there
   (`meshgrid` and `math.hypot` are). Build large lists with a loop or a comprehension: a list
   literal of more than 16,000 numbers in the code is refused.
5. Do the heavy work once in the block body and keep the panel function light: it runs on every
   move of a control.

## A panel, a sheet slider or an input form

There are three ways to put a slider in front of a reader. Choose by what has to change.

| You want | Use | What a move does |
| --- | --- | --- |
| A chart, table or text redrawn live while dragging | An interactive panel | Runs one Python function again. Nothing else is recalculated. |
| The same, and the sheet's lines below follow when you let go | A panel slider tied to a sheet input (`sheet=True`) | Moves the chart live, then writes the value into the sheet input and recalculates the sheet once. |
| A sheet input with a slider, `L: ? 6 m [2 .. 12 step 0.5]` | [Templates with inputs](templates.md) | Recalculates the whole sheet with the new value, a moment after you stop. |
| A fill-in form of several inputs | Input mode, see [Templates with inputs](templates.md) | Recalculates the whole sheet; every quantity line follows. |

A sheet slider changes a quantity that the lines below use, with its unit, and the report shows the
working. A panel is for exploring: the chart follows your finger, but its numbers stay inside the
panel.

## The first run

A panel is part of a Python block, so the first calculation of the sheet in a tab asks "This
worksheet runs Python code" with **Run Python** and **Not now**. The block runs in a sandbox in the
page, see [Python blocks](python.md#the-sandbox). The first run takes several seconds while Python
starts and, for a chart, while Plotly loads from its CDN; after that a move of a control usually
redraws in a fraction of a second.

## A chart: the beam moment

````sheet python
# Beam moment explorer

```python
import ui
import plotly.graph_objects as go

L = ui.slider("L", 6, 2, 12, step=0.5, unit="m", label="Span")
w = ui.slider("w", 12, 1, 40, unit="kN/m", label="Load")

@ui.panel(L, w)
def moment(L, w):
    x = [L * i / 60 for i in range(61)]
    M = [w * v * (L - v) / 2 for v in x]
    fig = go.Figure(go.Scatter(x=x, y=M, mode="lines", fill="tozeroy", name="M"))
    fig.update_layout(height=320, xaxis_title="x (m)", yaxis_title="M (kN.m)")
    return [fig, "Maximum moment %.1f kN.m at midspan" % (w * L * L / 8)]
```
````

The page shows two sliders, Span and Load, each with its value and unit beside it, then the chart
and the line of text. At the start it reads `Maximum moment 54.0 kN.m at midspan`. Drag Span to
10 m and the curve and the text follow: `Maximum moment 150.0 kN.m at midspan`.

What happens, in order:

1. The block runs once, top to bottom, like any Python block.
2. At `@ui.panel(L, w)` the function `moment` is called with the starting values, 6 and 12, and its
   result is drawn under the controls.
3. Each move of a control calls `moment` again with the new values, in the same Python session, and
   only the panel is redrawn. The function's name, `moment`, is the panel's name.

## A 3D surface

A 3D trace works the same way. Here one slider sets the amplitude of a surface:

````sheet python
# Surface explorer

```python
import ui
import math
import plotly.graph_objects as go

a = ui.slider("a", 1.0, 0.2, 3.0, step=0.1, label="Amplitude")
xs = [-3 + 0.2 * i for i in range(31)]

@ui.panel(a)
def surface(a):
    Z = [[a * math.sin(x) * math.cos(y) for x in xs] for y in xs]
    fig = go.Figure(go.Surface(x=xs, y=xs, z=Z))
    fig.update_layout(height=420, scene=dict(zaxis=dict(range=[-3, 3])))
    return fig
```
````

The grid `xs` is made once, in the block body. The fixed `zaxis` range keeps the box the same size
while the surface grows and shrinks; without it, Plotly rescales the axis on every move. A rotated
view is kept when the surface is redrawn.

## A table, a drop-down and a checkbox

A panel does not need a chart. This one returns only a table:

````sheet python
# Timber joist spans

```python
import ui

d = ui.select("d", [("200 mm", 0.2), ("300 mm", 0.3), ("400 mm", 0.4)], default="300 mm", label="Depth")
b = ui.slider("b", 90, 45, 200, step=5, unit="mm", label="Width")
sw = ui.checkbox("sw", True, label="Include own weight")

@ui.panel(d, b, sw)
def spans(d, b, sw):
    Z = b / 1000 * d * d / 6
    g = 5.0 * b / 1000 * d if sw else 0.0
    rows = []
    for L in [3, 4, 5, 6]:
        M = (2.0 + g) * L * L / 8
        rows.append([L, "%.2f" % M, "%.1f" % (M / Z / 1000)])
    return ui.table(rows, header=["Span (m)", "M (kN.m)", "Stress (MPa)"])
```
````

The drop-down shows the labels (`200 mm`, ...) and the function receives the value paired with the
chosen label (`0.3`). The checkbox gives `True` or `False`. A table without a chart never loads
Plotly, so it also works offline once the page has been visited.

## A player

`ui.player` is a frame number with a **Play** and **Pause** button. Each frame is one call of the
function, and the next frame is asked for only after the last one is drawn, so a slow function plays
slower rather than piling up.

````sheet python
# Travelling wave

```python
import ui
import math
import plotly.graph_objects as go

t = ui.player("t", 0, 39, fps=8, label="Frame")
xs = [i * 0.1 for i in range(101)]

@ui.panel(t)
def wave(t):
    y = [math.sin(x - t * 0.3) for x in xs]
    fig = go.Figure(go.Scatter(x=xs, y=y, mode="lines"))
    fig.update_layout(height=260, yaxis_range=[-1.2, 1.2])
    return fig
```
````

A player never starts by itself, and it pauses when the browser tab is hidden. With `loop=False` it
stops at the last frame.

## The short form: `ui.manipulate`

<video controls preload="none" poster="videos/ui-manipulate.jpg" style="width:100%;max-width:960px" src="videos/ui-manipulate.mp4" aria-label="Free vibration written with ui.manipulate: dragging the damping ratio and the natural frequency redraws the decay curve"></video>

When a panel is a few controls and a function, `ui.manipulate` writes both at once, in the manner of
Mathematica's Manipulate. Each control is one tuple, in the order of the function's arguments, and
`ui.plot` draws a line chart in one call.

````sheet python
# Damped decay

```python
import ui
import numpy as np

@ui.manipulate(("fn", 0.5, 5, 2, 0.1, "Hz"), ("zeta", 0, 0.9, 0.2, 0.05),
               labels={"fn": "Natural frequency", "zeta": "Damping ratio"})
def decay(fn, zeta):
    wn = 2 * np.pi * fn
    t = np.linspace(0, 5 / fn, 300)
    env = np.exp(-zeta * wn * t)
    wd = wn * np.sqrt(1 - zeta**2)
    return ui.plot(t, env * np.cos(wd * t), env, names=["Displacement", "Envelope"],
                   xlabel="Time (s)", ylim=(-1.1, 1.1))
```
````

A tuple is read like this:

* `("L", 2, 12)` is a slider from 2 to 12 that starts in the middle. A default, a step and a unit
  can follow, in that order: `("L", 2, 12, 6, 0.5, "m")`. A unit can also be the last item on its
  own: `("L", 2, 12, "m")`.
* `("mode", ["Deflection", "Moment"])` is a drop-down; the options are written as for `ui.select`.
* `("grid", True)` is a checkbox.
* A widget made with `ui.slider`, `ui.player` and the others can be used in place of a tuple, for a
  control the tuple cannot describe (a player, for one).
* `labels={"L": "Span"}` gives a control the text the reader sees; the name stays `L`.

The tuples are in a fixed order because the Python here does not promise the order of keyword
arguments, which is why `ui.manipulate(L=(2, 12))` is not offered.

`ui.plot(x, y1, y2, ..., names=[...], xlabel="", ylabel="", title="", xlim=None, ylim=None,
height=320)` makes a line chart. Give `ylim` (and `xlim`) when the picture should keep its axes as
a control moves; otherwise the chart rescales every time. A line without a name takes the colour of the line
before it and is left out of the legend, which suits the mirror image of an envelope. For anything else (a bar chart, a surface, several panels of axes) build the figure
with `plotly.graph_objects` as before.

## Number boxes and buttons

The clip shows number boxes, the button, tabs, Markdown and Reset together.

<video controls preload="none" poster="videos/panel-controls-tabs.jpg" style="width:100%;max-width:960px" src="videos/panel-controls-tabs.mp4" aria-label="Beam diagrams in tabs with number boxes, a button, a Markdown summary and Reset"></video>

`ui.number(name, default, min=None, max=None, step=None, unit="", label=None)` is a box to type a
number in. The value is taken when you press Enter or leave the box, not on every key, and a value
outside `min` and `max` is brought back to the nearest one.

`ui.button(name, label=None)` is a button. The function receives **how many times it has been
pressed**, so every press is a new value: use it as a random seed, or to step through cases with
`clicks % 3`. The count starts at 0 and **Reset** (below) sets it back to 0.

````sheet python
# A button that steps through load cases

```python
import ui

w = ui.number("w", 12, 1, 80, unit="kN/m", label="Load")
case = ui.button("case", "Next case")

@ui.panel(w, case)
def beam(w, case):
    k = case % 3
    return "Case %d of 3: %s, %.1f kN.m" % (k + 1, ["udl", "udl and mid-span point", "udl and thirds"][k], w * 36 / 8)
```
````

## Markdown, rows and tabs

A panel function can return `ui.markdown(text)`: a little Markdown for a summary. It understands
`#`, `##` and `###` headings, `**bold**`, `*italic*`, `` `code` ``, `-` lists, `1.` lists and paragraphs
(a blank line starts one). HTML written in the text is shown as text, and there are no links or
images: the page makes the markup itself, from the escaped text.

Three layouts hold other results. They can be nested up to four deep, and a panel can hold up to 200
results in all.

| Return | Shows |
| --- | --- |
| `ui.row(a, b)` | The results side by side; they wrap on a narrow screen |
| `ui.column(a, b)` | The results one under another, as one block (useful inside a row) |
| `ui.tabs(("Moment", fig1), ("Shear", [fig2, "note"]))` | One tab per pair; the tab you chose stays chosen when the panel updates. The arrow keys, Home and End move between the tabs. |

````sheet python
# Diagrams in tabs, with a summary

```python
import ui

L = ui.number("L", 6, 1, 20, unit="m", label="Span")
w = ui.number("w", 12, 1, 80, unit="kN/m", label="Load")

@ui.panel(L, w)
def beam(L, w):
    xs = [L * i / 30 for i in range(31)]
    M = [w * x * (L - x) / 2 for x in xs]
    V = [w * (L / 2 - x) for x in xs]
    return [ui.markdown("### Result\n- Maximum moment **%.1f kN.m**\n- Maximum shear **%.1f kN**" % (w * L * L / 8, w * L / 2)),
            ui.tabs(("Moment", ui.plot(xs, M, xlabel="x (m)", ylabel="M (kN.m)")),
                    ("Shear", ui.plot(xs, V, xlabel="x (m)", ylabel="V (kN)")))]
```
````

On a printed page or in Word, a tab group shows every tab one after the other, each under its
name.

## Reset, and one control in two panels

<video controls preload="none" poster="videos/panel-shared-reset.jpg" style="width:100%;max-width:960px" src="videos/panel-shared-reset.mp4" aria-label="Two panels sharing one slider; the second draws its chart after the move; Reset puts the shared slider back"></video>

Every panel has a **Reset** button that puts its controls back to the values the panel started
with (it is greyed out while they are there). A button's count goes back to 0.

A widget made once and given to **more than one panel** is one control. Moving it in either panel
moves the other copy, and both functions run again. Make the widget once, above the panels:

````sheet python
# One slider, two panels

```python
import ui

L = ui.slider("L", 6, 2, 12, step=0.5, unit="m", label="Span")

@ui.panel(L)
def moment(L):
    return "Moment at 12 kN/m: %.1f kN.m" % (12 * L * L / 8)

@ui.panel(L)
def shear(L):
    return "Support reaction at 12 kN/m: %.1f kN" % (12 * L / 2)
```
````

Two widgets that only share a name are not linked: it is the same Python object that counts.

## Keeping the values with the file

The values a panel was left at are saved with the sheet's other entered values. In the **Input**
view they make **Save values** available; it writes them into the comment on the first line of the
file (`"panel:beam:L": "10"`), and a reopened file starts every panel where you left it. The
values are only held in memory until you save, like any entered value, and **Reset to defaults**
in the Input view clears them with the rest.

## A slider tied to a sheet input

<video controls preload="none" poster="videos/panel-sheet-input.jpg" style="width:100%;max-width:960px" src="videos/panel-sheet-input.mp4" aria-label="A panel slider tied to a sheet input: dragging moves the chart, letting go writes the input and recalculates the sheet"></video>

A panel cannot read the sheet's quantities, but it can read and write the sheet's **inputs**.

* `ui.input("L", 6)` gives the number in the sheet's own input line `L: ? 6 m [2 .. 12 step 0.5]`
  (the value entered in the form, or the default written in the line). The second argument is used
  when the sheet has no such input. It is read when the Python runs, so a change of the input
  runs the block again from the new value.
* `ui.slider("L", start, 2, 12, sheet=True)` (also `ui.number`) writes its value into the sheet
  input `L` when you **let go** of the slider, and the sheet recalculates once. While you drag, only
  the panel's function runs.

Choose **Input** in the results bar to see the lines under the panel follow; the Preview view
shows the sheet without the entered values.

````sheet python
# A slider that sets the sheet's input

L: ? 6 m [2 .. 12 step 0.5] | span

```python
import ui

span = ui.slider("L", ui.input("L", 6), 2, 12, step=0.5, unit="m", label="Span", sheet=True)

@ui.panel(span)
def note(L):
    return "The chart would be drawn for a span of %.1f m." % L
```

Mmax: 12 * L^2 / 8 -> kN*m | maximum moment
````

The name of the widget must be the name of the input (`L`).

## Checking a panel

A panel function should depend on its arguments and on what the block made before it, and not
change anything it reads. `ui.check_panels()` calls every panel twice with its starting values and
prints whether the two answers agree; put it at the end of the block while you write panels, and take it out
when they are done. A panel that fails it usually changes a list or a counter that lives outside the function.

## The `ui` reference

| Call | Draws | The function receives |
| --- | --- | --- |
| `ui.slider(name, default, min, max, step=None, unit="", label=None, sheet=False)` | A slider with its value and unit beside it | A number between `min` and `max`, on a step. An `int` when `default`, `min`, `max` and `step` are all whole numbers, otherwise a `float`. |
| `ui.number(name, default, min=None, max=None, step=None, unit="", label=None, sheet=False)` | A box to type a number in (Enter or leaving the box applies it) | The number, kept between `min` and `max`; an `int` when its numbers are whole |
| `ui.select(name, options, default=None, label=None)` | A drop-down | The value of the chosen option |
| `ui.button(name, label=None)` | A button | How many times it has been pressed (0 at first) |
| `ui.input(name, default=None)` | Nothing: a function | The number in the sheet's input `name`, or `default` |
| `ui.checkbox(name, default=False, label=None)` | A checkbox | `True` or `False` |
| `ui.player(name, start, stop, fps=5, loop=True, label=None)` | A slider with Play and Pause | A whole frame number from `start` to `stop` |
| `@ui.panel(widget, ..., plotly=False)` | The controls, a Reset button, then the function's result. `plotly=True` loads Plotly for a panel whose first result is not a chart. | (a decorator) |
| `@ui.manipulate(("name", min, max, ...), ..., labels=None)` | The same, with each control written as a tuple | (a decorator; see the short form above) |
| `ui.plot(x, y, ..., names=None, xlabel="", ylabel="", title="", xlim=None, ylim=None, height=320)` | A line chart | (a return value) |
| `ui.table(rows, header=None)` | A table | (a return value) |
| `ui.text(s)` | A line of plain text | (a return value) |
| `ui.markdown(s)` | A little Markdown, written as markup by the page | (a return value) |
| `ui.row(...)`, `ui.column(...)`, `ui.tabs((label, content), ...)` | Results side by side, stacked, or in tabs | (return values) |
| `ui.check_panels()` | Nothing: prints whether each panel gives the same answer twice | `True` or `False` |

Details that matter:

* **name** is the first argument of every widget. It must be unique within a panel. **label** is
  what the reader sees; it defaults to the name.
* **step**: without one, a slider of whole numbers moves by 1, and any other slider takes a round
  step that gives 100 to 200 steps across its range. A value is always kept between `min` and `max`
  and snapped to a step.
* **unit** is only shown beside the value. The function receives a plain number, so write the
  conversions yourself (`w * 1000` for kN/m to N/m).
* **options** of `ui.select` is a list of labels (`["Steel", "Timber"]`, the value is the label
  itself) or of `(label, value)` pairs. A `dict` works, but its order is not promised. `default` is
  a label or a value; without it the first option is chosen. A select needs two options or more.
* **fps** of a player is at most 30. A frame waits for the last one, so the real rate can be lower.
* **Return values**: a Plotly figure from `plotly.graph_objects`, a `str` or `ui.text(...)` (always
  shown as text, never as HTML), a number, `ui.markdown(...)`, `ui.table(...)`, a layout, or a list
  of these in the order they are drawn. `None` draws nothing. Anything else is a `TypeError` that
  names the type.
* Numbers in a `ui.table` are written with six significant digits. Format them yourself
  (`"%.2f" % M`) to fix the decimals.

## Several outputs, several panels

To drive two charts with the same slider, return both from one function: `return [fig1, fig2]`.

A block can hold several panels, each with its own `@ui.panel` and its own controls. Moving a control
reruns only its own panel's function, unless the same widget was given to more than one panel: then it
is one control and each panel it belongs to runs again (see above).

## Errors

* An error during the first call is a normal Python error: one red line naming the sheet line.
* An error after a move (a division by zero at one end of a slider, say) is shown in the panel,
  with its type. The panel recovers at the next value that works.
* An update that takes longer than 1.5 seconds is reported under the panel ("This update took ..."),
  and a player is stopped, so a slow frame does not run away from you. The panel carries on and the
  next quick update clears the note.
* A function that runs for more than 10 seconds is stopped. The panel says so, and it stays out of
  date until the sheet is calculated again (edit any line, or press calculate).
* `print()` inside the panel function shows only on the first call. Return a string to show text
  that follows the controls.

## Printing and exports

Print, PDF, Word and Excel cannot run Python. They show the panel at the values the controls were
left at, without the controls, and a note under it, for example: "Interactive panel moment: Span =
10 m, Load = 12 kN/m. It is drawn in the browser; print and export show it at these values." Text,
Markdown and tables are carried as they are, a row as a row, and the tabs of a tab group one after the
other under their names. A chart is carried as a picture of the chart as it was drawn (a note naming
it when it was never drawn, for instance offline), as for any
[Plotly chart](python.md#plotly-offline-printing-and-exports).

The values the controls were left at are kept while the tab is open, so a recalculation (an edit
elsewhere in the sheet) starts the panel where you left it. They are kept with the file when you
**Save values** in the Input view (see above), and a reopened file starts from them.

## Limits

**A panel cannot read the sheet's quantities, and the sheet cannot read the panel.** Python runs
before the sheet's quantity lines and cannot see them, and a panel's value never reaches a quantity
line. The two bridges are the sheet's **inputs**: `ui.input("L")` reads the number entered in (or
written as the default of) an input line, and a slider made with `sheet=True` writes into one when
released. Only numbers cross, only for inputs that are plain numbers, and the sheet follows only in
the Input view. For anything else a panel holds its own data: write the section properties, loads and
lengths in the block. An `export()` from the block body works as in any block, but it is done once,
before any control moves; do not call `export()` in a panel function.

**The numpy stand-in is small.** The block runs on MicroPython with a light stand-in for numpy,
not on full Python. The list of what works is in [Which numpy and
matplotlib](python.md#which-numpy-and-matplotlib). Things that surprise people:

* `numpy.reshape`, `vstack`, `hstack` and `sort` raise `NotImplementedError`. `numpy.meshgrid`,
  `hypot`, `arctan2`, `outer`, `interp`, `polyfit` and `polyval` work, as does `math.hypot`.
* A list literal of more than 16,000 numbers written out in the code is refused before it runs,
  with a hint to build the list in a loop or parse a text string. Shorter ones, even several
  thousand numbers, work.
* `np.linspace` and array arithmetic work, but plain lists and comprehensions are just as quick for
  the sizes a chart needs.

**It runs only in the browser.** The [MCP server](mcp.md) does not run Python blocks, so it cannot
evaluate a sheet with a panel. Word and Excel get the snapshot described above.

**Plotly comes from its CDN.** A chart needs a connection the first time (the controls, tables, text
and Markdown work without one). Plotly is loaded when the first result of a panel holds a chart, or
when the panel is made with `plotly=True`; without either, a chart that first appears after some move
shows a note instead. Offline, the chart's place shows a note and everything else keeps working.

**The usual Python limits apply**: 10 seconds per call, and an answer of at most 2 MB (a figure and
its data) per move. See [Python blocks](python.md#limits).

## Keeping it fast

The function runs on every move of a control, so keep in it only what depends on the controls. Work
that does not, such as a grid, a stiffness matrix or a solved model, belongs in the block body, which
runs once. The function can read the variables the block made before it.

````sheet python
# Precomputed surface

```python
import ui
import math
import plotly.graph_objects as go

xs = [-3 + 0.1 * i for i in range(61)]
base = [[math.sin(x) * math.cos(y) for x in xs] for y in xs]

k = ui.slider("k", 1.0, 0.1, 2.0, step=0.1, label="Scale")

@ui.panel(k)
def scaled(k):
    Z = [[k * v for v in row] for row in base]
    fig = go.Figure(go.Surface(x=xs, y=xs, z=Z))
    fig.update_layout(height=420, scene=dict(zaxis=dict(range=[-2, 2])))
    return fig
```
````

The sines and cosines of the 61 by 61 grid are worked out once; each move only multiplies.

The page also helps: when a move leaves a result unchanged (a table or a note beside the chart), the
Python answers "same" and that result is not sent or drawn again, and a chart keeps its zoom and
camera between moves. A big figure still travels whole on every move, so keep the points of a chart
to what it needs.

* Keep charts to a few thousand points. The whole figure is sent on every move.
* Do not change globals in the function. A function that depends only on its arguments and on what
  the block computed before it gives the same picture for the same control values, whatever order
  the reader moved them in.
* Fix axis ranges (`yaxis_range`, `scene=dict(zaxis=dict(range=...))`) so the chart does not jump
  while dragging.
