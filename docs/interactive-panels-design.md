# Interactive panels: design and prototype

Status: the vertical slice (phase 0) shipped in 26.10.18. Phases 1 to 3 and `ui.manipulate` / `ui.plot` (the short form, the short form) shipped in 26.11.2: number boxes, buttons, Markdown, row/column/tabs, Reset, a widget shared by panels,
`plotly=True`, unchanged results not sent again, a slow-frame stop, values saved with the file, sliders tied to sheet inputs, chart
pictures for export, `ui` completions in the editor. What is built is checked by `web/e2e/panels-check.mjs`; the sections that say
**Proposed** or **Not built** are not. The whole thing is opt-in by the import, needs no flag, and changes nothing for a worksheet
that does not use it.

Two requests ask for this: interactive, code-controlled panels, and animation of a code cell's output. They are one feature: a
widget changes a value, Python runs again for the part that depends on it, and a chart, table or text is redrawn in place. An
animation is the same loop driven by a timer instead of a finger.

## What exists, and what it cannot do

| Piece | Today |
|---|---|
| Sheet `?` inputs | Compile to engine `#UI` controls. A change is kept in the page (`uiOverrides`) and the **whole worksheet** is converted again. Python is not involved: blocks run before the engine, from their own text, and cannot read Calcpad variables. |
| Python blocks | One MicroPython interpreter per calculation, blocks run in order, results substituted into the worksheet text before the engine runs. 10 s per block, 30 s per calculation, consent once per tab. |
| Plotly API | `fig.show()` sends figure JSON; the results frame draws it. Controls are Plotly's own (`updatemenus`, `sliders`, `frames`) and independent of each other: they can only switch between results computed in advance. |
| Results frame | A sandboxed `iframe` (`allow-scripts` only, opaque origin) holding the report HTML under a Content-Security-Policy with `connect-src blob:`. Its only way out is `postMessage` to the host, which checks the sender window. |

So today a chart can switch between precomputed cases, and an input change re-converts everything but cannot reach Python. The
beam explorer sample needs 31 precomputed load factor steps and 15 solves to fake what one `ui.slider` would do.

## Ideas worth borrowing from HoloViz Panel

Read from the public documentation only (panel.holoviz.org); no code is copied and nothing is vendored. We borrow:

1. **A widget stands in for its value.** The function receives plain numbers, not widget objects. (Panel: a widget can stand in for its `value`.)
2. **Bind a function to widgets; re-run it when they change.** Panel's `pn.bind` and reactive functions. Ours is a decorator, `@ui.panel(a, b)`, because the dependency list is explicit and MicroPython cannot inspect signatures well.
3. **Layout containers** `Row`, `Column`, `Tabs` for outputs and widgets (phase 2).
4. **Panes infer what to draw** from the return value: a figure, text, a table. Ours: a Plotly figure, a string, `ui.table`, or a list of them.
5. **A Player widget** with an interval and a loop policy: `ui.player(name, start, stop, fps=, loop=)`.
6. **Throttling**: the last value wins, intermediate ones are dropped (Panel offers `throttled` and `value_throttled`). Ours is stronger: one call in flight per panel, the newest values wait their turn.
7. **Widgets can also be bound to each other and to layout properties** (phase 3, as `ui.bind`).
8. **Readable defaults**: a slider shows its value and unit without being asked.

We will **not** do: a Bokeh or Tornado server, a websocket protocol, Param or any observable-property system, a widget zoo (colour
pickers, date pickers, file upload, data grids: the engine's `#UI` datagrid already exists), templates and dashboards, linked
brushing between plots, callbacks that mutate other widgets, `Page` or sidebar layouts, hot reload, a second plotting library.
No code runs outside the existing worker, and nothing is fetched at run time.

## The API

```python
import ui

L    = ui.slider("L", 6, 2, 12, step=0.5, unit="m", label="Span")      # int when default, min, max, step are ints
mat  = ui.select("mat", [("Steel", 200e9), ("Timber", 11e9)])          # value is the second item of the pair
ribs = ui.checkbox("ribs", True, label="Stiffeners")
step = ui.player("step", 0, 59, fps=10, loop=True)                      # an int frame number with Play and Pause

@ui.panel(L, mat, ribs)                 # widgets in the order of the function's arguments
def beam(L, mat, ribs):
    ...
    return [fig, ui.table(rows, header=["Result", "Value"]), "a line of text"]   # any mix; None is nothing
```

* A widget has a **name** (first argument, used to save and restore its value), a **label** (what the reader sees, default the name),
  and a **default**. A slider has `min`, `max`, `step` and `unit`. A select takes a list of labels or `(label, value)` pairs (a
  `dict` is accepted, but the order is not promised on this runtime).
* `@ui.panel(...)` runs the function once at that point of the block (so a plain error has the usual line number) and draws
  the widgets above its output. The function's name is the panel's name.
* The function returns a Plotly figure (not shown with `fig.show()` inside it), a `str` or `ui.text(...)` (always text, never
  HTML), `ui.table(rows, header=)`, or a list of these. Anything else is a `TypeError` naming the type.
* `print()` inside a panel function is dropped. The first call's print output is shown as usual.
* **Short form (built):** `@ui.manipulate(("L", 2, 12, 6, 0.5, "m"), ("mode", [..]), ("on", True), labels={...})` makes the widgets from
  tuples and decorates the function as a panel. The controls are an ordered list of tuples, not keyword arguments, because this
  runtime does not promise keyword (or dict) order. `ui.plot(x, y1, y2, ..., names=, xlabel=, ylabel=, xlim=, ylim=)` returns a line
  chart so the common case needs no Plotly code.
* **Built in 26.11.2:** `ui.number(name, default, lo, hi, step, unit, label, sheet)` (a typed-in box, applied on Enter or blur);
  `ui.button(name, label)` (the function receives the count of presses: an event made into a value, so it fits the same
  one-call-per-change loop); `ui.markdown(s)`; `ui.row`, `ui.column`, `ui.tabs((label, content), ...)` as return values;
  `ui.panel(..., plotly=True)`; `ui.input(name, default)` and `sheet=True` for the link with a sheet `?` input (below);
  `ui.check_panels()`. A widget object given to more than one panel is one control (identity, through a `wid` in the spec), which
  makes a separate `ui.bind(widget, fn)` unnecessary: it was not built.
* **Not built:** `ui.bind` (see above); a bundled copy of Plotly for offline charts (3.6 MB: a policy decision, still open).

## Semantics

**When does code run?** At calculation, the block runs top to bottom once, exactly as today. For each `@ui.panel`, the function is
called with the widgets' starting values. A widget change sends the new values to the host, which asks the **same Python
interpreter** to call only that panel's function. The sheet is not converted, no other block runs, no Calcpad line is
recalculated. (Prototype: measured 135 to 215 ms from a slider change to the redrawn table, including the test's 100 ms polling,
for the beam sample with a 61-point chart.)

**State.** The interpreter and the block's globals stay alive after the last block, so the function can read everything the block
computed (a stiffness matrix, a solved model) without recomputing it. That is the point: heavy setup stays outside the function.
It is also a hazard. A function that changes globals gives answers that depend on the order of the user's moves. Rule: a panel function
is a pure function of its arguments and of values the block computed before it. The dev check is built: `ui.check_panels()` calls each
function twice with its starting values and compares the output (it can only see a change that shows in the output of the second call).

**Determinism and replay.** The starting values of every panel are part of the run's key. A recalculation (an edit, a theme change, an
export) starts a fresh interpreter seeded with the values the panels were last moved to, so the sheet comes back as it was left and
the first output is for those values. The values are kept per tab in memory (**Prototype**); phase 2 writes them into the sheet's
`uiOverrides` line with the other saved values, under keys `panel:NAME:WIDGET`, so **Save values** keeps them and a reopened file
starts there.

**One call in flight per panel.** The frame sends a change only when the last answer has arrived; changes meanwhile are
merged into one, newest values. A drag therefore never queues work, and a player draws the next frame only after the last one, so
the frame rate is `min(fps, 1 / calculation time)`. After 250 ms without an answer the panel is marked busy (`aria-busy`, dimmed).

**Time and cost.** An update call has the block limit (10 s, 60 s after "run again with a longer limit"). A function that goes over
it ends the interpreter, because Python cannot be interrupted from outside; the panel says so, and it stays dead (events are answered
"out of date") until the worksheet is calculated again, which starts a new interpreter. Nothing else is lost. Tested: a function
that never returns is stopped at 10 s. Phase 2 adds a soft limit (about 1.5 s) that stops a player and says "this frame is slow".
Output of one update is capped at 2 MB (a figure and its data); a panel counts as one of the 20 figures. The cost of a call is
the function's own: a 61-point chart is a few ms of Python plus a few ms of Plotly; the beam explorer's 190 kB figure shows the
ceiling of what to send per frame. Sending only changed trace data (`restyle`) instead of the whole figure is a phase 3 option.

**Debouncing.** None by time: the one-in-flight rule is better (it adapts to cost, has no delay when the function is fast, and drops
nothing the user can see). A slider reports on every `input`, a select and a checkbox on `change`.

**Consent.** A panel page can only exist after a run the user allowed, and every update goes to the interpreter of that run. The
page names its run (`data-run`); an update that names any other run is answered "out of date" and runs nothing. Tested.

**Saved sheets.** The source of the sheet is the Python (and, in phase 2, the `uiOverrides` line). Nothing else is stored; the
widgets are drawn from the Python every time.

**Exports.** Word, Excel and Print cannot run scripts. They carry a static snapshot of the **current state**: the output of the first
call (a table and text as real content; a chart as the existing "interactive chart" note, until phase 2 adds a static drawing) and
a note: "Interactive panel beam: Span = 10 m, Uniform load = 12 kN/m, Show = Bending moment. It is drawn in the browser; print
and export show it at these values." The values are the ones the panel was left at, because an export is a recalculation seeded
from them (**Prototype**, tested for Report, Word and Excel). The widget container is empty in the HTML, so nothing but the
note and the output reaches a document.

## Two-way binding with sheet `?` inputs (built in 26.11.2)

Two directions, with different costs.

* **Sheet to panel** (`ui.input("L", default)`). The host hands the interpreter the numbers of the sheet's `?` inputs in the seed
  (`"@inputs"`): the entered value (the `uiOverrides` entry whose key starts `L:`), else the default written in the line, read from the
  compiled sheet text before the run (`panelPrepare`). The seed is part of the run's cache key, so a change of an input runs the block
  again from the new value. Only plain number inputs, only the entered value, not a value the engine computed from other lines.
* **Panel to sheet** (`sheet=True` on `ui.slider` or `ui.number`). During a drag the panel updates locally (the fast path). When the
  control is released (`change`) the frame posts `panelSheet`; the host checks its shape and the run, finds the input's control key
  (`uiControls`, or the docked inputs), writes `uiOverrides`, writes the source when "keep form values in the source" is on, and
  converts the sheet once. The Input view applies entered values, the Preview does not (unless its setting says so), so the sheet's lines
  follow in Input view. `export()` inside a panel function is refused: a value that changes per frame cannot be a definition.

The widget's name must be the input's name. Tested in `panels-check.mjs`: the slider starts from the sheet input, a drag converts nothing,
the release writes the value into the input and converts once.

## Security model

Unchanged guarantees: the interpreter is in the existing sandboxed worker (no network, no storage, `js` imports refused); the
results frame keeps `allow-scripts` only and its CSP; the frame talks to the host by `postMessage` and the host accepts a message only
from a window that is one of its own preview frames.

New surface and how it is closed:

* The frame is untrusted (it renders worksheet HTML). A forged `panelEvent` can do one thing: ask for a panel's function to run
  with chosen **numbers and booleans**. The host checks the shape (plain names, at most 32 values, finite numbers or booleans, a short
  run id). Python converts each value with its widget: a slider clamps and snaps to its step, a select takes an index in range, a
  checkbox only a boolean. Anything else is refused by name. No code, no string, no object reaches Python as code. Tested with forged
  events: out-of-range, string, unknown panel, bad option, wrong run, long name.
* The reply goes only to the window that asked (`event.source`), never broadcast.
* Output items are drawn with `textContent` (text, table cells) or Plotly (figures): no HTML from Python is inserted as markup.
* Scripts run in the frame are the same inline script class the page already allows; no new network access and no new library.
* The host never executes anything it receives; `ui._event` finds a function by panel name in a table the block built.
* Cost abuse: one call in flight per panel, 10 s kill, 2 MB answer cap, 20 figures per run.

## Phone layout and accessibility

* Widgets stack and each slider's label sits on its own line above the control, the track takes the full width, the readout
  stays visible (checked at 390 px: no horizontal scroll, controls at least 28 px tall; the buttons and selects are 40 and 36 px).
  The frame's width, not the screen's, decides the layout, so a narrow results pane on a desktop gets the same layout.
* Every control has a real `<label for>`; a slider is a native `input[type=range]` (arrow keys, Home, End, Page keys work), its
  `aria-valuetext` is the value with its unit; a player button is a toggle (`aria-pressed`) named "Play NAME"; the group of controls is
  labelled; an error is `role="alert"`; the panel is `aria-busy` while a call runs.
* Focus rings are visible in both themes; light and dark follow the page (the Plotly theme is the existing one).
* Motion: a player never starts by itself; it pauses when the tab is hidden; the figure has no transitions. Prototype caveat: the
  chart itself is as accessible as Plotly's canvas; the table and text result carry the numbers in text.
* Proposed: a text summary line returned with every figure is the habit the samples show ("Operating point: 41.2 l/s at 21.3 m head").

## Offline behaviour

The interpreter, `ui.py` (11 KB, fetched only when a block mentions `ui`) and the panel script are local. The panel's widgets,
table and text work offline once the page has been visited (there is still no service worker: a first visit needs a connection, as
for all Python). A chart needs Plotly.js from its CDN as before; offline the chart's place shows the existing note, widgets still work,
tables and text still update. Phase 3 can ship Plotly with the app to make charts offline too (3.6 MB, a policy decision, not a
technical one).

## Prototype: what is built

Web and Python layer only; no Rust, no wasm rebuild.

| File | Role |
|---|---|
| `public/py/lib/ui.py` | `slider`, `select`, `checkbox`, `player`, `panel`, `table`, `text`; value checking; the update entry point `_event`. |
| `public/py/lib/calcpad_py.py`, `files.json` | Host functions `panel`, `panelOut`, `seed`; `ui.py` is lazy (fetched when a block mentions `ui`). |
| `src/wasm/python-worker.ts` | `panel` message: runs `ui._event` in the live interpreter; a panel part for the first result; the seed; 2 MB cap. |
| `src/wasm/python-runner.ts` | The seed is part of the cache key; `live` run; `panelEvent` (stale check, 10 s kill); a result with a panel is served from the cache only while its interpreter is still the live one. |
| `src/wasm/python-blocks.ts` | Panel markup: empty widget container, the first output as static markup, the note, the spec in base64. |
| `src/wasm/python-panels.ts` | Frame script and CSS; host handler (shape check, reply to the asking frame); per-tab values; export strip. |
| `src/wasm/transport.ts`, `src/App.vue` | Seed passed in; panel script added after the Plotly one; widget container removed for Word and Excel; `panelEvent` routed. |
| `public/sheet-samples/Panel *.sheet` | The three examples below (Samples, group "Panels"). |
| `e2e/panels-check.mjs` | Over 40 checks: drawing, a change without a conversion, redraw in place, replay, exports, forged events, players, an exception, a hung function, phone layout. Light, dark, desktop and phone screenshots. |

What it **proves**: the main risk, a live re-run of a Python function from a widget in a sandboxed frame, is cheap (about 150 ms
here) and safe under the existing model; state, consent, the time limit and exports compose with it; the seed carries the state across
recalculations and into exports.

(That was the state of phase 0; the table below says what 26.11.2 added.)

## Phased plan

| Phase | Content | Status |
|---|---|---|
| 0 | The vertical slice. | shipped in 26.10.18 |
| 1 | Soft time limit and "slow frame" stop for players (1.5 s, `SLOW_MS`), `ui.number`, `ui.button`, `ui.markdown` (written by the host from escaped text), `ui.row`/`column`/`tabs`, guide chapter, samples, an editor completion list for `ui` (`editor/ui-completions.ts`), a Chromium and WebKit e2e run | shipped in 26.11.2 (WebKit: see Unverified) |
| 2 | Values kept in `uiOverrides` (`panel:NAME:WIDGET`, hidden from the form rows, written by Save values, read back from the file's comment), chart pictures for print and export (the frame snapshots each chart it draws, under the key of the figure JSON the export recalculation will produce), `plotly=True`, `ui.check_panels()`, a Reset button | shipped in 26.11.2 |
| 3 | `ui.input` and `sheet=True`, a widget shared by panels (identity, no `ui.bind`), unchanged results not sent again, bundled Plotly for offline | shipped in 26.11.2 except bundled Plotly (not built) |
| 4 | Animation extras: record a player to an animated image or video for export, a "cache frames" mode with Plotly frames | not built (optional) |

Changed from the plan: `restyle`-only updates were replaced by item-level diffing. The interpreter keeps the last answer of each panel
and, when the page says which answer it holds (`base`), sends `{"t":"same"}` for a result that did not change; Plotly's own `react`
keeps zoom and camera (`uirevision`). A figure that changed is still sent whole.

## Risks

1. **Hidden state in the interpreter.** Functions that mutate globals. Mitigation: documented rule, purity check in phase 2.
2. **A stuck function costs the session.** MicroPython in a worker cannot be interrupted; the kill discards the interpreter and the
   user recalculates to get it back. Mitigation: soft limit, clear message. A worker per panel would isolate it but doubles memory.
3. **Plotly cost per frame.** Sending the whole figure per update is fine to a few thousand points; beyond that, `restyle` (phase 3).
4. **Frame is replaced on every recalculation.** A live drag during a recalculation is answered "out of date" and the new frame
   comes seeded with the last values; verified for the edit case, not for a drag racing a conversion.
5. **Export of charts.** A picture, taken by the frame after each draw (about 600 ms later) and matched by the key of the figure JSON. If an
   export is made before the picture exists, or the figure JSON differs on recalculation (a function that is not deterministic), the
   note is carried instead.
6. **Scope creep toward a dashboard tool.** The "will not do" list is the defence.

## Unverified

Not tested: Firefox; a real touch device; memory growth over thousands of updates; a worksheet with a panel in an `#include`d file (blocks
there are not seen at all); behaviour when Plotly loads slowly after the first update (the code guards `typeof Plotly`); the sheet-input link
with a loop or a repeated input (the first control with that name is used); `ui.input` for an input that is not a plain number (gives the
default); two panels moved at the same instant beyond the shared-slider case in the checks.

## Examples

Each is a complete sheet shipped in the Samples dialog (group "Panels") and run by `e2e/panels-check.mjs`.

### 1. Beam deflection explorer: sliders, a drop-down, a chart and a table

````
<!--sheet-->
# Beam deflection explorer (interactive panel)

A simply supported beam under a uniform load. Move the sliders: the moment, deflection and the table below the chart are calculated again as you move them, in the Python session of this sheet, and the rest of the sheet is not recalculated. Print, Word and Excel show the chart and table at the values the sliders were left at.

```python
import ui
import numpy as np
import plotly.graph_objects as go

E = 200e9          # Pa, steel
I = 8.0e-5         # m^4, second moment of area of the section

L = ui.slider("L", 6, 2, 12, step=0.5, unit="m", label="Span")
w = ui.slider("w", 12, 1, 40, unit="kN/m", label="Uniform load")
what = ui.select("what", ["Deflection", "Bending moment"], label="Show")

@ui.panel(L, w, what)
def beam(L, w, what):
    x = np.linspace(0, L, 61)
    q = w * 1000.0
    M = q * x * (L - x) / 2 / 1000.0                                  # kN.m
    y = q * x * (L**3 - 2 * L * x**2 + x**3) / (24 * E * I) * 1000.0  # mm
    show = y if what == "Deflection" else M
    name = "Deflection (mm)" if what == "Deflection" else "Bending moment (kN.m)"
    fig = go.Figure(go.Scatter(x=x, y=show, mode="lines", fill="tozeroy", line_width=2.5, name=name))
    fig.update_layout(height=320, margin=dict(l=56, r=16, t=16, b=44), xaxis_title="x (m)", yaxis_title=name,
                      yaxis_autorange="reversed" if what == "Deflection" else True)
    rows = [["Maximum moment", "%.2f kN.m" % (w * L * L / 8)],
            ["Maximum deflection", "%.2f mm" % (5 * q * L**4 / (384 * E * I) * 1000.0)],
            ["Span / deflection", "%.0f" % (L * 1000.0 / (5 * q * L**4 / (384 * E * I) * 1000.0))]]
    return [fig, ui.table(rows, header=["Result", "Value"])]
```

The quantity below is the sheet's own and does not follow the sliders. Binding a slider to a sheet input is a later step.

L_sheet: 6 m | span used by the sheet
````

The two sliders and the drop-down are one panel. Moving any of them calls `beam` again and redraws the chart and the table; the
steel properties and the unit conversions are written once above it.

### 2. Pump operating point: a player moves the pump curve

````
<!--sheet-->
# Pump operating point (interactive panel with a player)

A pump curve `H = H0 n^2 - a Q^2` meets a system curve `H = Hs + k Q^2`. The speed ratio `n` is a **player**: press Play and the pump curve moves while the operating point follows it. Each frame is one call of the panel's function, made after the last one is drawn, so the speed adapts to how fast the calculation is. The static head and the pipe resistance are sliders.

```python
import ui
import numpy as np
import plotly.graph_objects as go

H0, a = 42.0, 1800.0         # shut-off head (m) and pump curve constant (m per (m3/s)^2)

Hs = ui.slider("Hs", 12, 0, 30, unit="m", label="Static head")
k = ui.slider("k", 3500, 500, 8000, step=100, label="Pipe resistance")
n = ui.player("n", 60, 110, fps=6, label="Speed (% of rated)")

@ui.panel(Hs, k, n)
def pump(Hs, k, n):
    r = n / 100.0
    Q = np.linspace(0, 0.14, 71)
    pump_h = H0 * r * r - a * Q * Q
    sys_h = Hs + k * Q * Q
    top = H0 * r * r - Hs
    if top > 0:
        Qop = (top / (a + k)) ** 0.5
        Hop = Hs + k * Qop * Qop
    else:
        Qop, Hop = 0.0, Hs
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=Q * 1000, y=pump_h, mode="lines", name="Pump at %d %%" % n))
    fig.add_trace(go.Scatter(x=Q * 1000, y=sys_h, mode="lines", name="System"))
    fig.add_trace(go.Scatter(x=[Qop * 1000], y=[Hop], mode="markers", marker=dict(size=12, color="#e07000"), name="Operating point"))
    fig.update_layout(height=340, margin=dict(l=56, r=16, t=16, b=44), xaxis_title="Q (l/s)", yaxis_title="H (m)",
                      xaxis_range=[0, 140], yaxis_range=[0, 60], legend=dict(orientation="h", y=-0.25))
    return [fig, "Operating point: %.1f l/s at %.1f m head" % (Qop * 1000, Hop)]
```
````

`n` is a player over 60 to 110 percent speed. Each frame is one call; the next is asked for after the last is drawn, so a slow
chart slows the animation instead of queuing. Dragging a slider while it plays is allowed and merged into the next call.

### 3. Column buckling: a select, a slider and a player

````
<!--sheet-->
# Column buckling (interactive panel with a player)

An axially loaded pinned-pinned-type column with a small initial bow. The player raises the load as a fraction of the Euler load `P_cr`; the chart shows the bowed shape growing as `1 / (1 - P/P_cr)`. Choose the end condition and the length; the player restarts from the value it is at.

```python
import ui
import math
import numpy as np
import plotly.graph_objects as go

E = 200e9            # Pa
I = 3.5e-6           # m^4
e0 = 0.004           # m, initial bow at mid-height (L/1500 is typical; fixed here)

L = ui.slider("L", 4, 2, 10, step=0.5, unit="m", label="Length")
ends = ui.select("ends", [("Pinned - pinned", 1.0), ("Fixed - pinned", 0.7), ("Fixed - free", 2.0), ("Fixed - fixed", 0.5)], label="End condition")
f = ui.player("f", 0, 19, fps=5, label="Load P / Pcr (%, step 5)")

@ui.panel(L, ends, f)
def column(L, ends, f):
    K = ends
    Pcr = math.pi**2 * E * I / (K * L)**2 / 1000.0       # kN
    ratio = f * 0.05
    amp = 1.0 / (1.0 - ratio)
    x = np.linspace(0, L, 41)
    y = e0 * amp * 1000.0 * np.sin(math.pi * x / L)       # mm
    fig = go.Figure(go.Scatter(x=y, y=x, mode="lines", line_width=3, name="Bowed shape"))
    fig.update_layout(height=340, margin=dict(l=56, r=16, t=16, b=44), xaxis_title="Lateral displacement (mm)", yaxis_title="Height (m)",
                      xaxis_range=[-1, 90], yaxis_range=[0, L])
    return [fig, "P = %.0f kN (%.0f %% of Pcr = %.0f kN); mid-height bow = %.1f mm" % (ratio * Pcr, ratio * 100, Pcr, e0 * amp * 1000.0)]
```
````

The end condition changes the effective length factor, the player raises the load towards the Euler load, and the bowed shape
grows as `1 / (1 - P/Pcr)`. Stopping the player at any frame leaves that frame in the print.
