"""Interactive panels for a worksheet's Python block (docs/interactive-panels-design.md).

    import ui
    L = ui.slider("L", 6, 2, 12, unit="m")
    w = ui.slider("w", 12, 1, 40, unit="kN/m")

    @ui.panel(L, w)
    def beam(L, w):
        ...
        return fig            # a plotly figure, text, ui.table(...), or a list of them

    # the short form: the controls are written as tuples, in the order of the function's arguments
    @ui.manipulate(("a", 1, 5), ("n", 1, 6, 2), ("mode", ["sin", "cos"]), ("grid", True))
    def wave(a, n, mode, grid):
        ...

The block runs once, as always. For every `@ui.panel` the page draws the widgets and the first result. When a widget changes, the
page sends the new values back and ONLY the panel's function runs again, in the interpreter that is still alive; the sheet is not
recalculated. The function should depend on its arguments and on values the block already computed, not on state it changes.

This module is the Python side. It speaks to the page through `_cp_host` (panel, panelOut, seed). Everything it receives from the
page is checked here again: a value is converted by its widget, clamped to the widget's range, and refused when it does not fit.
"""
import json
import _cp_host

__all__ = ["slider", "select", "checkbox", "player", "number", "button", "input", "panel", "manipulate", "plot", "table", "text",
           "markdown", "row", "column", "tabs", "check_panels"]

_panels = {}
_seed = None


def _seed_for(pid):
    global _seed
    if _seed is None:
        try:
            _seed = json.loads(_cp_host.seed())
        except Exception:
            _seed = {}
    s = _seed.get(pid)
    return s if isinstance(s, dict) else {}


def _sheet_inputs():
    d = _seed_for("@inputs")
    return d


_uid = [0]


def _finite(v, what):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise TypeError("ui: " + what + " must be a number, not " + type(v).__name__)
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError("ui: " + what + " is " + str(v))
    return v


def _nice_step(span):
    """A step of 1, 2 or 5 times a power of ten that gives 100 to 200 steps over the range."""
    s = span / 100.0
    p = 1.0
    while s >= 10:
        s /= 10
        p *= 10
    while s < 1:
        s *= 10
        p /= 10
    for m in (1, 2, 5, 10):
        if s <= m:
            return m * p
    return 10 * p


class _Widget:
    kind = ""

    def __init__(self, name, label):
        if not isinstance(name, str) or not name:
            raise TypeError("ui: the first argument of a widget is its name, a string")
        self.name = name
        self.label = label or name
        _uid[0] += 1
        self.uid = _uid[0]

    def spec(self):
        raise NotImplementedError

    def coerce(self, v):
        """The page's raw value, made into a legal one (or ValueError)."""
        raise NotImplementedError

    def value_of(self, stored):
        """What the function receives for the stored (wire) value."""
        return stored


class _Slider(_Widget):
    kind = "slider"

    def __init__(self, name, default, lo, hi, step, unit, label, sheet=False):
        _Widget.__init__(self, name, label)
        self.sheet = bool(sheet)
        for k, v in (("default", default), ("min", lo), ("max", hi)):
            _finite(v, name + " " + k)
        if not lo < hi:
            raise ValueError("ui.slider(" + repr(name) + "): min must be below max")
        whole = isinstance(default, int) and isinstance(lo, int) and isinstance(hi, int) and (step is None or isinstance(step, int))
        if step is None:
            step = 1 if whole else _nice_step(hi - lo)
        _finite(step, name + " step")
        if step <= 0:
            raise ValueError("ui.slider(" + repr(name) + "): step must be positive")
        self.lo, self.hi, self.step, self.unit, self.whole = lo, hi, step, unit or "", whole
        self.default = self.coerce(default)

    def coerce(self, v):
        v = _finite(v if not isinstance(v, bool) else None, self.name)
        v = min(max(v, self.lo), self.hi)
        v = self.lo + round((v - self.lo) / self.step) * self.step
        v = min(max(v, self.lo), self.hi)
        if self.whole:
            return int(round(v))
        return float("%.10g" % v)

    def spec(self):
        d = {"kind": "slider", "name": self.name, "label": self.label, "min": self.lo, "max": self.hi, "step": self.step,
             "unit": self.unit}
        if self.sheet:
            d["sheet"] = True
        return d


class _Player(_Slider):
    kind = "player"

    def __init__(self, name, start, stop, fps, loop, label):
        _Slider.__init__(self, name, start, start, stop, 1, "", label)
        _finite(fps, name + " fps")
        if not 0 < fps <= 30:
            raise ValueError("ui.player(" + repr(name) + "): fps must be above 0 and at most 30")
        self.fps, self.loop = fps, bool(loop)

    def spec(self):
        d = _Slider.spec(self)
        d["kind"] = "player"
        d["fps"] = self.fps
        d["loop"] = self.loop
        return d


class _Select(_Widget):
    kind = "select"

    def __init__(self, name, options, default, label):
        _Widget.__init__(self, name, label)
        if isinstance(options, dict):
            pairs = [(k, options[k]) for k in options]
        else:
            pairs = []
            for o in options:
                pairs.append((str(o[0]), o[1]) if isinstance(o, (list, tuple)) else (str(o), o))
        if len(pairs) < 2:
            raise ValueError("ui.select(" + repr(name) + "): needs two options or more")
        self.labels = [p[0] for p in pairs]
        self.values = [p[1] for p in pairs]
        self.default = 0
        if default is not None:
            if default in self.labels:
                self.default = self.labels.index(default)
            elif default in self.values:
                self.default = self.values.index(default)
            else:
                raise ValueError("ui.select(" + repr(name) + "): default " + repr(default) + " is not one of the options")

    def coerce(self, v):
        if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v < len(self.labels):
            raise ValueError("ui.select(" + repr(self.name) + "): no such option")
        return v

    def value_of(self, stored):
        return self.values[stored]

    def spec(self):
        return {"kind": "select", "name": self.name, "label": self.label, "options": self.labels}


class _Checkbox(_Widget):
    kind = "checkbox"

    def __init__(self, name, default, label):
        _Widget.__init__(self, name, label)
        self.default = bool(default)

    def coerce(self, v):
        if not isinstance(v, bool):
            raise ValueError("ui.checkbox(" + repr(self.name) + "): expects true or false")
        return v

    def spec(self):
        return {"kind": "checkbox", "name": self.name, "label": self.label}


class _Number(_Widget):
    kind = "number"

    def __init__(self, name, default, lo, hi, step, unit, label, sheet=False):
        _Widget.__init__(self, name, label)
        self.sheet = bool(sheet)
        _finite(default, name + " default")
        for k, v in (("min", lo), ("max", hi), ("step", step)):
            if v is not None:
                _finite(v, name + " " + k)
        if lo is not None and hi is not None and not lo < hi:
            raise ValueError("ui.number(" + repr(name) + "): min must be below max")
        if step is not None and step <= 0:
            raise ValueError("ui.number(" + repr(name) + "): step must be positive")
        self.lo, self.hi, self.step, self.unit = lo, hi, step, unit or ""
        self.whole = isinstance(default, int) and (step is None or isinstance(step, int)) and (lo is None or isinstance(lo, int)) \
            and (hi is None or isinstance(hi, int))
        self.default = self.coerce(default)

    def coerce(self, v):
        v = _finite(v if not isinstance(v, bool) else None, self.name)
        if self.lo is not None:
            v = max(v, self.lo)
        if self.hi is not None:
            v = min(v, self.hi)
        if self.whole:
            return int(round(v))
        return float("%.10g" % v)

    def spec(self):
        d = {"kind": "number", "name": self.name, "label": self.label, "unit": self.unit}
        if self.lo is not None:
            d["min"] = self.lo
        if self.hi is not None:
            d["max"] = self.hi
        if self.step is not None:
            d["step"] = self.step
        if self.sheet:
            d["sheet"] = True
        return d


class _Button(_Widget):
    kind = "button"

    def __init__(self, name, label):
        _Widget.__init__(self, name, label)
        self.default = 0

    def coerce(self, v):
        if isinstance(v, bool) or not isinstance(v, int) or v < 0 or v > 1000000000:
            raise ValueError("ui.button(" + repr(self.name) + "): expects a click count")
        return v

    def spec(self):
        return {"kind": "button", "name": self.name, "label": self.label}


def slider(name, default, lo, hi, step=None, unit="", label=None, sheet=False):
    """A slider. The function receives a number between lo and hi (an int when all of default, lo, hi and step are ints).
    sheet=True also writes the value into the sheet input of the same name when the slider is released (see ui.input)."""
    return _Slider(name, default, lo, hi, step, unit, label, sheet)


def number(name, default, lo=None, hi=None, step=None, unit="", label=None, sheet=False):
    """A box to type a number in (applied on Enter or when the box is left). lo and hi are optional limits; a value outside them is
    brought back to the nearest. The function receives an int when default, step, lo and hi are ints, otherwise a float."""
    return _Number(name, default, lo, hi, step, unit, label, sheet)


def button(name, label=None):
    """A button. The function receives the number of times it has been pressed (0 at first), so a press is a new value:
    use it as a seed, or compare it with a count the block keeps."""
    return _Button(name, label)


def input(name, default=None):
    """The value of the sheet's own `?` input called `name`, as a number, for a panel to start from. A sheet input that has no
    number (or no such input) gives `default`; with no default it is an error that names the input."""
    d = _sheet_inputs()
    v = d.get(name)
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        if default is None:
            raise ValueError("ui.input(" + repr(name) + "): the sheet has no number input of that name")
        return default
    return v


def select(name, options, default=None, label=None):
    """A drop-down. options: a list of labels, or of (label, value) pairs; a dict works but its order is not promised here."""
    return _Select(name, options, default, label)


def checkbox(name, default=False, label=None):
    """A checkbox; the function receives True or False."""
    return _Checkbox(name, default, label)


def player(name, start, stop, fps=5, loop=True, label=None):
    """A frame number from start to stop (ints) with play and pause. The next frame is asked for only after the last one is drawn."""
    return _Player(name, start, stop, fps, loop, label)


def _spec_widget(spec, labels):
    """One widget from a tuple of ui.manipulate: ("L", lo, hi[, default[, step[, unit]]]), ("mode", [options]), ("on", True).
    A widget made with ui.slider(...) and the others is accepted as it is."""
    if isinstance(spec, _Widget):
        return spec
    if not isinstance(spec, (list, tuple)) or len(spec) < 2 or not isinstance(spec[0], str):
        raise TypeError("ui.manipulate: each control is a tuple that starts with a name, such as ('L', 2, 12) or ('mode', ['a', 'b'])")
    name, rest = spec[0], list(spec[1:])
    label = labels.get(name) if labels else None
    if len(rest) == 1 and isinstance(rest[0], bool):
        return _Checkbox(name, rest[0], label)
    if len(rest) == 1 and isinstance(rest[0], (list, tuple, dict)):
        return _Select(name, rest[0], None, label)
    unit = ""
    if len(rest) >= 3 and isinstance(rest[-1], str):
        unit = rest.pop()
    if len(rest) < 2 or len(rest) > 4:
        raise TypeError("ui.manipulate(" + repr(name) + "): use (name, min, max), (name, min, max, default), (name, min, max, default, step) "
                        "and, for a unit, a last text such as 'm'")
    lo, hi = rest[0], rest[1]
    default = rest[2] if len(rest) > 2 and rest[2] is not None else None
    step = rest[3] if len(rest) > 3 else None
    if len(rest) == 4 and isinstance(rest[3], str):
        unit, step = rest[3], None
    _finite(lo, name + " min")
    _finite(hi, name + " max")
    if default is None:
        default = (lo + hi) // 2 if isinstance(lo, int) and isinstance(hi, int) and (hi - lo) % 2 == 0 else (lo + hi) / 2.0
    return _Slider(name, default, lo, hi, step, unit, label)


def manipulate(*controls, labels=None):
    """The short form of a panel, as a short form of a panel. One tuple per argument of the function, in order:

        @ui.manipulate(("a", 1, 5), ("n", 1, 6, 2, 1), ("mode", ["sin", "cos"]), ("grid", True), labels={"a": "Amplitude"})
        def wave(a, n, mode, grid): ...

    ("a", lo, hi) is a slider that starts in the middle; a default, a step and a unit follow: ("L", 2, 12, 6, 0.5, "m").
    ("mode", [options]) is a drop-down (options as for ui.select) and ("grid", True) a checkbox. The function is a panel: it runs
    now, and again alone when a control moves."""
    return panel(*[_spec_widget(c, labels) for c in controls])


def plot(x, *ys, names=None, xlabel="", ylabel="", title="", xlim=None, ylim=None, height=320):
    """A Plotly line chart in one call, for a panel to return. x and every y are lists (or numpy arrays) of the same length.
    Names label the lines. A line with no name takes the colour of the line before it and stays out of the legend (the mirror of an envelope, say). Give xlim and ylim, such as ylim=(-5, 5), to keep the axes
    still while a control moves."""
    import plotly.graph_objects as go
    if not ys:
        raise TypeError("ui.plot(x, y, ...) needs at least one y")
    fig = go.Figure()
    palette = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"]
    k = -1
    for i, y in enumerate(ys):
        nm = names[i] if names and i < len(names) else ""
        if nm or k < 0:
            k += 1
        fig.add_trace(go.Scatter(x=x, y=y, mode="lines", name=nm or None, showlegend=bool(nm), line=dict(color=palette[k % len(palette)])))
    fig.update_layout(height=height, margin=dict(l=56, r=16, t=40 if title else 16, b=44), xaxis_title=xlabel, yaxis_title=ylabel,
                      title=title or None)
    if xlim:
        fig.update_xaxes(range=list(xlim))
    if ylim:
        fig.update_yaxes(range=list(ylim))
    return fig


class table:
    """A small table to return from a panel: ui.table([[1, 2], [3, 4]], header=["a", "b"])."""

    def __init__(self, rows, header=None):
        self.rows = [[_cell(c) for c in r] for r in rows]
        self.header = [str(h) for h in header] if header else None


def _cell(c):
    if isinstance(c, float):
        return "%.6g" % c
    return str(c)


class text:
    """Plain text (never HTML) to return from a panel."""

    def __init__(self, s):
        self.s = str(s)


class markdown:
    """A little Markdown to return from a panel: # headings, **bold**, *italic*, `code`, - lists, 1. lists and paragraphs.
    It is turned into markup by the page itself; HTML written in it is shown as text, and there are no links or images."""

    def __init__(self, s):
        self.s = str(s)


class _Layout:
    kind = ""

    def __init__(self, items):
        self.items = list(items)


class row(_Layout):
    """Results side by side (they wrap on a narrow screen): return ui.row(fig1, fig2)."""
    kind = "row"

    def __init__(self, *items):
        _Layout.__init__(self, items)


class column(_Layout):
    """Results one under another, as a block: ui.row(ui.column(fig, "note"), table)."""
    kind = "col"

    def __init__(self, *items):
        _Layout.__init__(self, items)


class tabs:
    """Results in tabs: return ui.tabs(("Moment", fig1), ("Shear", [fig2, "note"]))."""

    def __init__(self, *pairs):
        if not pairs:
            raise TypeError("ui.tabs needs at least one (label, content) pair")
        self.pairs = []
        for pr in pairs:
            if not isinstance(pr, (list, tuple)) or len(pr) != 2:
                raise TypeError("ui.tabs takes (label, content) pairs, such as ui.tabs(('Moment', fig))")
            self.pairs.append((str(pr[0]), pr[1]))


_MAX_ITEMS = 200
_MAX_DEPTH = 4


def _items(ret, who, depth=0, count=None):
    """The JSON texts of what a panel function returned."""
    if count is None:
        count = [0]
    if ret is None:
        return []
    if isinstance(ret, (list, tuple)):
        out = []
        for r in ret:
            out.extend(_items(r, who, depth, count))
        return out
    count[0] += 1
    if count[0] > _MAX_ITEMS:
        raise ValueError(who + ": more than " + str(_MAX_ITEMS) + " results in one panel")
    if isinstance(ret, _Layout):
        if depth >= _MAX_DEPTH:
            raise ValueError(who + ": layouts are nested more than " + str(_MAX_DEPTH) + " deep")
        inner = _items(ret.items, who, depth + 1, count)
        return ['{"t":"' + ret.kind + '","items":[' + ",".join(inner) + "]}"]
    if isinstance(ret, tabs):
        if depth >= _MAX_DEPTH:
            raise ValueError(who + ": layouts are nested more than " + str(_MAX_DEPTH) + " deep")
        parts = []
        for label, content in ret.pairs:
            parts.append('{"label":' + json.dumps(label) + ',"items":[' + ",".join(_items(content, who, depth + 1, count)) + "]}")
        return ['{"t":"tabs","tabs":[' + ",".join(parts) + "]}"]
    if hasattr(ret, "to_json") and hasattr(ret, "add_trace"):
        return ['{"t":"plotly","fig":' + ret.to_json() + "}"]
    if isinstance(ret, table):
        return [json.dumps({"t": "table", "head": ret.header, "rows": ret.rows})]
    if isinstance(ret, markdown):
        return [json.dumps({"t": "md", "s": ret.s})]
    if isinstance(ret, (str, text)):
        return [json.dumps({"t": "text", "s": ret if isinstance(ret, str) else ret.s})]
    if isinstance(ret, (int, float)) and not isinstance(ret, bool):
        return [json.dumps({"t": "text", "s": _cell(ret)})]
    raise TypeError(who + ": the function returned a " + type(ret).__name__ + "; return a plotly figure, text, ui.table(...), "
                    "ui.markdown(...), a layout (ui.row, ui.column, ui.tabs) or a list of them")


class _Panel:
    def __init__(self, pid, widgets, fn):
        self.id, self.widgets, self.fn = pid, widgets, fn
        self.n = 0          # answers given so far; the page holds the output of answer `n` when it quotes it as its base
        self.last = []      # the items of the last answer, to leave out what did not change

    def stored(self, values):
        """Wire values, checked widget by widget; a missing name keeps the default."""
        out = {}
        for w in self.widgets:
            if values is not None and w.name in values:
                out[w.name] = w.coerce(values[w.name])
            else:
                out[w.name] = w.default
        return out

    def run(self, stored):
        args = [w.value_of(stored[w.name]) for w in self.widgets]
        return _items(self.fn(*args), "ui.panel " + self.id)

    def result(self, stored, base=None):
        """The answer for `stored`. When the page says which answer it holds (`base`) and it is the last one, a result that did not
        change is sent as {"t":"same"}: a table or note beside a chart is not sent again on every move."""
        items = self.run(stored)
        sent = items
        if base is not None and base == self.n and len(items) == len(self.last):
            sent = ['{"t":"same"}' if items[i] == self.last[i] else items[i] for i in range(len(items))]
        if base is not None:
            self.n += 1
        self.last = items
        return '{"panel":' + json.dumps(self.id) + ',"n":' + str(self.n) + ',"values":' + json.dumps(stored) + ',"out":[' + ",".join(sent) + "]}"


def panel(*widgets, plotly=False):
    """Decorator: the function runs with the widgets' values now and again whenever one changes. A widget given to more than one
    panel is one control: moving it in one panel moves it in the others and each of them runs again. plotly=True loads Plotly for a
    panel whose first result is not a chart but a later one will be."""
    if not widgets:
        raise TypeError("ui.panel needs at least one widget: @ui.panel(ui.slider(...))")
    names = []
    for w in widgets:
        if not isinstance(w, _Widget):
            raise TypeError("ui.panel takes widgets (ui.slider, ui.select, ui.checkbox, ui.player, ui.number, ui.button), not a "
                            + type(w).__name__)
        if w.name in names:
            raise ValueError("ui.panel: two widgets are named " + repr(w.name))
        names.append(w.name)

    def deco(fn):
        base = getattr(fn, "__name__", "panel")
        pid = base
        n = 1
        while pid in _panels:
            n += 1
            pid = base + "_" + str(n)
        p = _Panel(pid, widgets, fn)
        _panels[pid] = p
        seed = _seed_for(pid)
        want = {}
        for w in widgets:
            if w.name in seed:
                want[w.name] = seed[w.name]
        try:
            stored = p.stored(want)
        except Exception:
            stored = p.stored(None)
        specs = []
        for w in widgets:
            d = w.spec()
            d["value"] = stored[w.name]
            d["default"] = w.default
            d["wid"] = w.uid
            specs.append(d)
        head = '{"id":' + json.dumps(pid) + ',"widgets":' + json.dumps(specs) + (',"plotly":true' if plotly else "")
        _cp_host.panel(head + ',"first":' + p.result(stored) + "}")
        return fn

    return deco


def check_panels():
    """A check for the rule that a panel function depends on its arguments only: every panel is called twice with its starting
    values and the two answers are compared. Prints one line per panel and returns True when all agree. Call it in the block
    (after the panels) while you write them; a panel that gives different answers keeps something in a global it changes."""
    ok = True
    for pid in _panels:
        p = _panels[pid]
        st = p.stored(None)
        try:
            a = ",".join(p.run(st))
            b = ",".join(p.run(st))
        except Exception as e:
            print("panel " + pid + ": the function raised " + type(e).__name__ + ": " + str(e))
            ok = False
            continue
        if a == b:
            print("panel " + pid + ": same answer twice")
        else:
            print("panel " + pid + ": DIFFERENT answers for the same values - the function changes something it reads")
            ok = False
    return ok


def _event(text_):
    """Called by the page's worker for a widget change. Answers through _cp_host.panelOut, never raises."""
    pid = ""
    try:
        req = json.loads(text_)
        pid = req.get("panel", "")
        p = _panels.get(pid)
        if p is None:
            raise ValueError("no such panel " + repr(pid))
        base = req.get("base")
        if isinstance(base, bool) or not isinstance(base, int):
            base = None
        _cp_host.panelOut(p.result(p.stored(req.get("values")), base))
    except Exception as e:
        _cp_host.panelOut(json.dumps({"panel": pid, "error": type(e).__name__ + ": " + str(e)}))
