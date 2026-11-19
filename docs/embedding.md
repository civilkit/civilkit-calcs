# Embedding: design notes

The user-facing description is the guide chapter `book/src/embedding.md` (served at `/calcs/guide/embedding`) and the
catalogue page `/calcs/embed/`. This file records how the embed is built and why.

## What it is

`/calcs/?embed=1&sample=<id>` shows one sample of `public/sheet-samples/manifest.json` (or `public/samples/manifest.json`)
as an input form and its live results, for an iframe on another site or on our own landing pages. Options: `theme`
(`light`, `dark`, `auto`), `mode` (`input`, `results`, `both`), `hide=title`, `embed=edit` (a text editor below) and
`allowpython=1`.

## How it is built

* **A separate entry.** `index.html` loads `src/boot.ts`, which imports `src/embed/embed.ts` when `embed` is set and
  `src/main.ts` otherwise. The embed never loads Monaco, the ribbon, the tabs, the suite bar or the update notice, and it
  never registers the service worker. The two dynamic imports live in two exported functions: written as one if/else,
  the bundler merged their preload lists and an embed preloaded the whole app (about 1 MB gzipped). The embed's style
  sheets are imported `?inline` for the same reason. The embed chunk is about 20 KB (8 KB gzipped, its styles included) plus the shared
  settings chunk and the wasm.
* **The same calculation path.** `installWasmTransport()` answers `/api/calcpad/convert` in the page exactly as for the
  app's preview: sheet compile, engine in a worker, TeX, Mermaid, the dark theme styles, the script policy. The results
  page goes into a sandboxed `srcdoc` iframe (`allow-scripts allow-popups allow-popups-to-escape-sandbox`, as the
  samples browser's preview) with a small script that reports its height, so the frame grows to its content and the
  embed's own height is the whole story.
* **Its own form.** The form is drawn from the `#UI` lines of the compiled sheet (`src/embed/inputs.ts`): the sheet
  compiler already turns `name: ? ...` lines into `#UI {json} name = value 'note`, which carries the type, the options and
  the slider bounds in a form that is easy to read. Entered values go to the engine as `uiOverrides`, the mechanism the
  app's Input mode uses, so the report shows them exactly as the app would. Drawing our own form (rather than the
  engine's Input-mode page) gives one accessible, compact form at 320 px and lets the postMessage API check values
  against the same parsed bounds and options.
* **Sheets without inputs.** A sheet with no `?` line gets its top-level number lines (`L: 9.8 m | span`, outside
  fences) turned into inputs before the compile, so the worked examples (gable frame, shear frame, principal
  stresses) can be tried. A line with an expression, a vector or a conversion is left alone.
* **Results for the host.** After each calculation, when framed, the embed asks the transport's `values` endpoint
  (one more engine run with the variables recorded) and posts `{type:'civilkit-results', values:{name:{value, unit,
  text}}}`. It is only done when framed, so a stand-alone embed pays nothing.
* **Recalculation.** One render at a time; an input during a render marks the page dirty and one more render follows.
  Superseded renders are not aborted, because aborting the running job costs a fresh engine worker (the transport
  restarts it), which is slower than finishing a render that takes tens of milliseconds.

## postMessage API

Only the embedding page may drive the embed: a message is accepted only when `event.source === window.parent`. Messages
to the host go to `location.ancestorOrigins[0]` where the browser provides it (Chromium) and to `'*'` otherwise; the
host is by definition the page that framed us and the messages carry only the sample's public values and what the
reader typed into that host's frame.

| Message | Direction |
|---|---|
| `civilkit-embed-height {height}` | embed to host, on every layout change (ResizeObserver on the embed root) |
| `civilkit-ready {caps, sample, inputs}` | embed to host, when the form is built; again after every `civilkit-load`, so a host answers the first one only (use `civilkit-loaded` to know a load finished). `caps` lists what this embed understands: `load`, `loaded`, `errors`, `theme` |
| `civilkit-loaded {sample}` | embed to host, once a `civilkit-load` has been shown and calculated |
| `civilkit-theme {mode}` | host to embed: `light`, `dark` or `auto` (follow the browser), as `?theme=` but after load; anything else is refused with `civilkit-error` |
| `civilkit-results {sample, values}` | embed to host, after each calculation |
| `civilkit-error {errors}` | embed to host, for a refused set |
| `civilkit-set {values}` | host to embed: names must be inputs; numbers finite and within the slider bounds, or a number with a unit (`"5000 mm"`, `"8000 N/m"`), whose shape only is checked here: the engine converts it to the unit the input declares, applies the bounds after the conversion and refuses another dimension, which comes back in the next `civilkit-results` errors (calcpad-core `ui.rs`, `convert_override`; `tests/ui_override_units.rs`); a choice one of the option values or labels; a checkbox true, false, 1 or 0. At most 200 names a message. |
| `civilkit-get` | host to embed: repeat the last results |
| `civilkit-load {source, files?, values?, name?, promote?}` | host to embed: show the host's own text (see "The host's own text") |

## The host's own text

`?embed=1&host=1` starts with no sample (the title says it waits, the Open link is hidden, `civilkit-ready` carries
`sample: null` and no inputs) and `civilkit-load` supplies the text. It goes through the same `useSource` as a sample: the
sheet is compiled for the form, number lines are promoted as for a sheet without inputs, and Python blocks are left out
unless `allowpython=1`. Checked in `checkLoad`: `source` a non-empty string up to 1,000,000 characters; `files` an object of
plain relative `.cpd/.txt/.csv/.xlsx/.xlsm` names (no leading slash, no `..`) to base64, 5,000,000 characters in all (they
become the request's `extraFiles`, as a sample's assets do); `name` letters, digits, dot, dash, underscore, at most 60
(it names the results' `sample` field and the engine's source path, and the title shows it). A refused load changes nothing
and answers `civilkit-error`, and the reason is also shown in the embed's status line. Loads are queued and run in order; each clears the entered values, then applies `values` if
given. `promote` (a boolean, default false) is the host's choice to have plain number lines of a sheet become editable inputs as they do for a sample; without it the host's definitions stay definitions and only the sheet's own `?` inputs are boxes. `civilkit-results` carries `errors: [{line, severity, message}]`: the errors the engine wrote into the page (a unit clash, an undefined name), `line` counted from 1 in the host's text, which cost one more engine run (with line anchors) after each calculation when framed. A load works in a framed embed only, from the parent only, like every other message; it works with any
`sample` too (it replaces the sample). A re-render whose page head (styles, fonts) is unchanged and whose body has no script is swapped into the loaded results frame (`showResults`) instead of reloading it, which spares re-parsing the page's ~1.7 MB head on every recalculation. Nothing is stored: the text lives in the page until it is reloaded, so the host owns it.

## embed.js

`public/embed.js` (served at `/calcs/embed.js`, under 3 KB, no dependencies) replaces each
`<div data-civilkit-sample="ID">` with the iframe, sandboxed with `allow-scripts allow-same-origin allow-popups
allow-popups-to-escape-sandbox`, and resizes it on `civilkit-embed-height` messages whose `event.origin` is
`https://civilkit.io` and whose source is that frame. `data-origin` and `data-path` point it at a self-hosted copy (and
let `web/e2e/embed-check.mjs` run it against a local build on another port). Every embed message is re-fired on the
iframe as a `civilkit` DOM event. The sandbox needs `allow-same-origin` (the engine's workers and module scripts load from
the app's origin) and `allow-popups-to-escape-sandbox` (so Open in CivilKit Calcs opens a normal, unsandboxed tab).

## Python

Python blocks run user code, so an embed leaves them out of what it calculates unless the address has `allowpython=1`,
and shows their code with a note instead. With `allowpython=1` the app's usual question is still asked before the first
run: a host can allow Python, it cannot accept it for the reader.

## Storage, privacy, analytics

The embed writes nothing to localStorage, sessionStorage or IndexedDB, and registers no service worker (the check in
`web/e2e/embed-check.mjs` confirms all four after an embed in which a value was changed, then opens the full app in the same
browser profile). It does read the script library list (`calcpad-libraries` in localStorage) through the script policy,
as every render does. No request leaves the app's own origin: no analytics, no fonts from elsewhere.

## Headers and the service worker

`web/calcpad-web/cloudflare/_headers` sets no `X-Frame-Options` and no `frame-ancestors` for the app, so the app (and so
the embed) can be framed by any site; nothing was added. Pages headers match paths, not query strings, so a
`frame-ancestors` rule for `?embed=1` alone is not possible: adding one would apply to the whole app. If the app ever
needs a frame restriction, it has to leave `/calcs/` (the shell that serves `?embed=1`) open, or the embed moves to its own
path (for example a separate `embed.html` entry) with its own rule.

The service worker is unchanged in behaviour: a reader who already has the app installed gets the embed from the same
precache (`index.html` is matched ignoring the query), and an embed never installs it. `embed/` (the catalogue page) is
left out of the precache like `learn/`; `embed.js` is precached with the rest of the build, which does no harm.

## Host mode (full app)

`?host=1` is the second way to put Calcs in a frame, beside the light embed above: the whole app (ribbon, Monaco, forms, samples,
plots, Python, export) with one document owned by the host. It was built for CivilKit Studio's Calc tab, which stores the sheet text
in its project file. The user-facing description and the message table are in `book/src/embedding.md` ("Host mode: the whole app in a
frame"); this section records how it is built.

* **Entry.** `src/boot.ts` does not branch on it: `main.ts` loads as always and `src/host/flag.ts` (`hostMode`) is read by the pieces
  that differ. `?embed` wins if both are given; the flag is false in the desktop app. If the page is not framed `installHost` does
  nothing, so `?host=1` opened on its own is a blank app.
* **One document.** `tabs/tab-manager.ts`: in host mode `newUntitled`, `openFile` and `openDraft` replace the one tab's text
  (`replaceOnly`, a clean document) and `close` does nothing, so every caller (samples, imports, civilkit-load) lands in the same tab.
  CSS under `html[data-host]` hides the tab's close button, the + and the split button; `splitEditor` and "Open Full HTML" return early.
* **Nothing stored.** The web build had no session restore or draft autosave to begin with (those are the desktop's, in the Tauri
  block of `main.ts`); what the browser build writes is switched off here: the recent-files list (`web-files.ts`), the IndexedDB library and
  handles (`library.ts`: in host mode the library is memory only and starts empty, so a document calculates the same wherever it is
  opened, and no database is opened at all), `#write` downloads, drop-to-open, Ctrl+O, the `beforeunload` guard and the language prompt. Preferences
  (`calcpad-settings`, the layout and result mode in `calcpad-workspace-state`, the editor's word wrap) are kept and shared with the
  standalone app. The e2e check asserts: no recent files, no `openFiles`, no `calcpad-rs` database, none of the text in localStorage,
  and a blank editor after a reload.
* **Ribbon.** `host/flag.ts` lists the actions that open, create, save or list files (`newsheet`, `newcalcpad`, `open`, `save`,
  `saveas`, `filemenu`, `importWorksheet`); `wasm/Ribbon.vue` leaves those buttons, the File button and the empty groups out.
  Samples, the spreadsheet import (cells into the sheet) and the exports stay. A sample replaces the open document, which the host
  hears about as an edit.
* **Protocol.** `host/host.ts` (messages), `host/protocol.ts` (the checks, pure), `host/channel.ts` (parent-only in and out). The embed
  has the same limits in `embed.ts`; the checks are copied rather than shared so the embed is untouched (an empty document is allowed here).
  `civilkit-source` is sent from `onTabContentChanged` after 300 ms of quiet, except while a load is being put in place (`applying`);
  the load adopts the host's `revision` and each source is one more. Results are one convert with line anchors and one values call
  (about 0.6 s after the last edit), independent of whether the results pane is showing; a sheet with Python blocks is run without
  them, so a Python consent question is never raised for the host's results.
* **Commands.** `civilkit-command {id}` (`host/commands.ts`) runs one of the ribbon's own actions (`wasm/ribbon-actions.ts` `runAction`) through
  the ribbon's context (`wasm/ribbon.ts` `ribbonContext()`), so a host menu item and the ribbon button are the same code. The ids are an
  allow-list (`COMMANDS`; `hasOwnProperty`, so `constructor` is unknown): `samples`, `export`, `word`, `excel`, `pdf`, `showcompiled`, `symbolic`, `find`,
  `undo`, `redo`, `calculate`, `settings`, `insert`, `variables`, `errors`, `contents`, `format`, `preview`, `unwrapped`, `inputform`, `report`, `shortcuts`.
  None opens, saves or lists files. Each may declare why it cannot run now (no editor, not a sheet, no samples browser), which answers
  `civilkit-error`, as does an unknown id. `civilkit-ready` carries `commands` (the exact list) and `caps` has `command`. The Samples browser's
  Open never asked "replace your sheet?" (it calls `newUntitled`, which replaces the one tab in host mode); a test asserts there is no question.
* **Edits by the host.** `civilkit-insert {text}` and `civilkit-patch {edits:[{find, replace}]}` (`host/edits.ts`, pure planning; `host.ts` applies the plan to
  the active Monaco editor, `window.calcpadActiveEditor`). Each is one `executeEdits` between two `pushUndoStop` calls, so it is one Ctrl+Z; neither uses
  `setValue`, so the undo stack and the caret survive (a patch passes no cursor-state computer, so Monaco moves the selection with the text; an insert puts the
  caret after the new text). They are not `applying` edits: the normal `onTabContentChanged` path sends the `civilkit-source` that follows, at the next revision.
  Insert: a caret mid-line gets `\n` first, the text always ends with `\n`, `\r\n` becomes `\n` (Monaco converts to the model's own). Patch: every `find` must occur once
  in the text as it is when the message arrives (`String.indexOf` counting overlapping occurrences); edits are taken in message order and a match overlapping an
  earlier planned one is refused; refused edits do not stop the others (partial apply) and come back in one `civilkit-error`. Limits: 100,000 characters per text,
  500 edits, 1,000,000 characters in all (`MAX_*` in `edits.ts`). `caps` has `insert` and `patch`.
* **Comments in sheet text (tested 2026-11-19, host-check sandbox).** A trailing `// note` after a definition leaves the variable undefined (`//` reads as division),
  a trailing `<!-- ... -->` does too, and neither puts anything in `civilkit-results.errors`; an HTML comment on its own line did not break the definitions
  after it. The supported note is `name: value | note` (docs/sheet-syntax.md). The book chapter tells hosts to keep their markers out of the sheet text.
* **Update notice.** `update-notice.ts` posts `civilkit-update-available` in host mode instead of showing its Reload button.
* **Theme.** `civilkit-theme` calls `setAppTheme` (not the bridge's `updateColorTheme`), so the host's choice is never saved over the
  user's own preference. Tokens are inline custom properties on `<html>` (`host/protocol.ts` `TOKEN_MAP`); the dialogs read `--vscode-*` which are
  `--ck-*`, so they follow. Monaco cannot read CSS variables: `host/monaco-tokens.ts` defines a `civilkit-host` theme from the computed values on top of the light
  or dark one (surface, text, line numbers, cursor, selection, widgets) whenever tokens are applied or the app's theme changes, and selects it; no tokens
  gives the app's own theme back. The syntax colours stay the app's.
* **Tests.** `web/e2e/host-check.mjs` (own ports; never 5101), including section 6c for insert and patch.

## Landing pages and the catalogue

`tools/learn/render.mjs` adds a "Try it" section (a lazy iframe with a fixed height of 560 px, so nothing shifts, and an
Open link under it that works without the frame) to every landing page with a sample. `tools/learn/embed.mjs` writes
`public/embed/index.html` with a snippet for every sample a landing page uses; `tools/make_learn_pages.mjs` writes it with
the landing pages and lists it in the sitemap, so `--check` covers it. `web/e2e/seo-check.mjs` checks its head, its
breadcrumb (CivilKit > Calcs > Embed), its links and every snippet address.

## Not done

* No Monaco editor in `embed=edit`: a plain text box keeps the embed small. The full editor is one click away.
* No per-embed persistence: values are lost on reload, by design.
* A Calcpad worksheet (not a sheet) with plain `?` inputs and no `#UI` lines shows its results without a form.
* The loader does not throttle or cap very tall embeds; a host that wants a cap should set its own `max-height` and let
  the frame scroll.
