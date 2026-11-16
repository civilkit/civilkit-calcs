"""Run every ```calcpad block of the CalcpadCE documentation through our Cli and report which ones our engine rejects.

Usage: python3 -I tools/docs_audit.py [--ref ../calcpad-ref] [--cli target/release/Cli] [--out DIR]
Writes DIR/report.md and DIR/blocks.json. A block that is only a syntax template (it names f(x), a, b, n and so on) fails
on purpose; the report lists the engine's message so each can be sorted by hand: template, real difference, or bug.
"""
import argparse, json, re, subprocess, tempfile
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--ref", default="../calcpad-ref")
ap.add_argument("--cli", default="target/release/Cli")
ap.add_argument("--out", default="../doc-audit")
ap.add_argument("--upstream-cli", default="../reference-builds/calcpad-dotnet-out/Cli", help="upstream Calcpad.Cli build; run with DOTNET_ROOT set")
ap.add_argument("--dotnet-root", default="../tools/dotnet-sdk")
a = ap.parse_args()
ref, cli, out = Path(a.ref).resolve(), Path(a.cli).resolve(), Path(a.out).resolve()
out.mkdir(parents=True, exist_ok=True)
FENCE = re.compile(r"^```calcpad[^\n]*\n(.*?)^```", re.S | re.M)
ERR = re.compile(r'<span class="err"[^>]*>(.*?)</span>|class="error"[^>]*>(.*?)</', re.S)
TAG = re.compile(r"<[^>]+>")
import os
ucli = Path(a.upstream_cli).resolve()
env = dict(os.environ, DOTNET_ROOT=str(Path(a.dotnet_root).resolve()))
def run(exe, src, env=None):
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "b.cpd"; f.write_text(src, encoding="utf-8")
        o = Path(d) / "b.html"
        try:
            r = subprocess.run([str(exe), str(f), str(o), "-b", "-s"], capture_output=True, text=True, timeout=60, cwd=d, env=env)
            html = o.read_text(encoding="utf-8") if o.exists() else ""
            code, err = r.returncode, r.stderr.strip()[:200]
        except subprocess.TimeoutExpired:
            html, code, err = "", -9, "timeout"
    msgs = [TAG.sub("", x or y).strip() for x, y in ERR.findall(html)]
    return ("ok" if code == 0 and not msgs else "fail"), msgs, err, html
def norm(h):
    return re.sub(r"\s+", " ", re.sub(r'id="[^"]*"|data-[a-z-]+="[^"]*"', "", h)).strip()
rows = []
for md in sorted((ref / "docs").glob("*.md")):
    for n, m in enumerate(FENCE.finditer(md.read_text(encoding="utf-8")), 1):
        src = m.group(1)
        st, msgs, err, html = run(cli, src)
        ust, umsgs, _, uhtml = run(ucli, src, env) if ucli.exists() else ("n/a", [], "", "")
        if ust == "n/a": cls = "no upstream build"
        elif st == "ok" and ust == "ok": cls = "same" if norm(html) == norm(uhtml) else "OUTPUT DIFFERS"
        elif st == "fail" and ust == "fail": cls = "template (both reject)"
        elif st == "fail": cls = "OURS REJECTS, upstream accepts"
        else: cls = "upstream rejects, ours accepts"
        rows.append(dict(page=md.name, n=n, status=st, upstream=ust, cls=cls, stderr=err, errors=msgs[:3], uerrors=umsgs[:2], first=src.strip().splitlines()[0][:100] if src.strip() else ""))
(out / "blocks.json").write_text(json.dumps(rows, indent=1))
from collections import Counter
cnt = Counter(r["cls"] for r in rows)
lines = ["# CalcpadCE docs run on our engine and on the upstream build\n", f"{len(rows)} calcpad blocks: " + ", ".join(f"{v} {k}" for k, v in cnt.most_common()) + "\n"]
for cls in ("OURS REJECTS, upstream accepts", "OUTPUT DIFFERS", "upstream rejects, ours accepts"):
    sel = [r for r in rows if r["cls"] == cls]
    if not sel: continue
    lines += [f"\n## {cls}\n", "| page | # | first line | our message | upstream message |", "|---|---|---|---|---|"]
    for r in sel:
        e = (r["errors"][0] if r["errors"] else r["stderr"]).replace("|", "\\|")[:100]
        u = (r["uerrors"][0] if r["uerrors"] else "").replace("|", "\\|")[:100]
        lines.append(f"| {r['page']} | {r['n']} | `{r['first'].replace('|','/')}` | {e} | {u} |")
(out / "report.md").write_text("\n".join(lines) + "\n")
print(lines[1], "->", out / "report.md")
