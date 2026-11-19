# Embedding a calculator

<!-- description: Put a live sheet on another web page: the embed address, its options, the loader script, sandboxing and the postMessage API for setting inputs. -->

An **embed** shows one sample sheet on another web page: its inputs as a small form and its results beside or under
it. A reader changes an input and the results recalculate in their own browser, with the workings shown. The page
[Embed a calculator](https://civilkit.io/calcs/embed/) lists the calculators with a snippet to copy for each.

## The embed address

An embed is the app's address with `embed=1` and the id of a sample:

```html
<iframe src="https://civilkit.io/calcs/?embed=1&sample=template-simply-supported-beam"
        width="100%" height="560" style="border:1px solid #ccc" loading="lazy"
        title="Simply supported beam check: CivilKit Calcs" allow=""
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
```

The id is the one the samples browser and the `?sample=` links use. The embed shows no ribbon, no sidebar, no tabs
and no editor: a slim header with the sheet's title and an **Open in CivilKit Calcs** link (it opens the same
sample in the full app in a new tab), the form and the results.

The form is drawn from the sheet's input lines (see [Templates with inputs](templates.md)): a number box, a
slider for a number with bounds (`L: ? 6 m [2 .. 12 step 0.5]`), a list, radio buttons or a checkbox. A typed number
outside the slider's bounds is not used and the box says why. A sheet with no inputs at all gets its plain number
lines (`L: 9.8 m | span`) as inputs, so a worked example can still be tried.

| Option | Values | What it does |
|---|---|---|
| `sample` | a sample id | The sheet to show (default: the simply supported beam template). |
| `theme` | `light`, `dark`, `auto` | `auto` (the default) follows the reader's system setting. |
| `mode` | `input`, `results`, `both` | Only the form, only the results, or both (the default). |
| `hide` | `title` | Leaves out the title (the Open link stays). |
| `embed` | `1`, `edit` | `edit` adds a small text editor below, for changing the sheet itself. |
| `allowpython` | `1` | Lets the sheet's Python blocks run (the reader is still asked first). |

Without `allowpython=1` the Python blocks of a sheet are not run: the embed shows their code and a note, and the
results that need them are missing.

## The loader script

Instead of writing the frame yourself, put a placeholder where it goes and load the script once:

```html
<div data-civilkit-sample="template-pipe-flow-darcy" data-height="560" data-theme="auto"></div>
<script src="https://civilkit.io/calcs/embed.js" async></script>
```

The script (about 3 KB, no dependencies) turns each placeholder into the frame above, with the sandbox, and then
fits the frame's height to its content as the reader works. It accepts `data-theme`, `data-mode`, `data-hide`,
`data-height` (the height before the content is measured) and `data-title`. For a copy of Calcs on your own host,
`data-origin` and `data-path` say where it lives (`https://example.com` and `/calcs/`); the script accepts height
messages only from that origin. Each message from the frame is also fired on the iframe as a `civilkit` event.

## Talking to the embed

The embed and the page around it talk with `postMessage`. The embed answers only its parent page
(`event.source === window.parent`) and checks every value; the page should check that a message comes from
`https://civilkit.io` (or its own copy).

| Message | Direction | Meaning |
|---|---|---|
| `{type: 'civilkit-ready', caps, sample, inputs}` | embed to page | The form is built. It is sent again after every `civilkit-load`, so answer the first one only. `caps` lists what this embed understands (`load`, `loaded`, `errors`, `theme`), so a page can check for a feature instead of a version. `inputs` lists each input: `name`, `kind` (`number`, `select`, `radio`, `check`), `label`, `unit`, `value`, and `min`, `max`, `step` or `options`. |
| `{type: 'civilkit-results', sample, values, errors}` | embed to page | After each calculation. `values` maps each name to `{value, unit, text}`: a number where the value is one, and the text as shown. `errors` lists the sheet's own errors as `{line, severity, message}` (a unit clash, an undefined name), `line` counted from 1 in the page's text. |
| `{type: 'civilkit-embed-height', height}` | embed to page | The embed's content height in pixels, after every layout change. |
| `{type: 'civilkit-error', errors}` | embed to page | A `civilkit-set` was refused in full or in part, with the reasons. |
| `{type: 'civilkit-set', values: {L: 8}}` | page to embed | Sets inputs by name, then calculates. A number may carry a unit (`{L: '5000 mm'}`, `{w: '8000 N/m'}`): the engine converts it to the unit the input declares, and a unit of another dimension shows up as an error in the next `civilkit-results`. |
| `{type: 'civilkit-get'}` | page to embed | Sends the last results again. |
| `{type: 'civilkit-load', source, files?, values?, name?, promote?}` | page to embed | Shows the page's own sheet or worksheet text instead of a sample. Use `?embed=1&host=1` so the embed starts empty and waits for it. `source` is the text (up to 1,000,000 characters); `files` is an object of name to base64 text for `.cpd`, `.txt`, `.csv`, `.xlsx` and `.xlsm` files the sheet reads (plain relative names, up to 5,000,000 characters in all); `values` sets inputs as `civilkit-set` does; `name` (letters, digits, dot, dash, underscore) is what the results are reported under; `promote: true` turns the sheet's plain number lines into inputs (left alone by default, so the host's definitions stay definitions). The embed answers with `civilkit-ready`, `civilkit-results` and then `civilkit-loaded`, or `civilkit-error` for a refused load (the reason is also shown in the embed). |
| `{type: 'civilkit-loaded', sample}` | embed to page | A load has been shown and calculated. Use it, not `civilkit-ready`, to know a load is done. |
| `{type: 'civilkit-theme', mode}` | page to embed | `'light'`, `'dark'` or `'auto'`, as the `theme` option but after the embed is open. |

A value set from the page must name an input of the sheet. A number must be finite and, for a slider, within its
bounds; a choice must be one of its option values (or labels); a checkbox takes `true`, `false`, `1` or `0`. The valid
values of a message are applied and the others are reported in one `civilkit-error`.

```js
const frame = document.querySelector('iframe[src*="embed=1"]');
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://civilkit.io' || e.source !== frame.contentWindow) return;
  if (e.data.type === 'civilkit-results') console.log(e.data.values.M_max.text);
});
// Once the frame says it is ready:
frame.contentWindow.postMessage({ type: 'civilkit-set', values: { L: 8, w: 20 } }, 'https://civilkit.io');
```

## Host mode: the whole app in a frame

`?embed=1` is a small form with results. A program that wants the whole of CivilKit Calcs inside it (the ribbon, the editor, forms, samples, plots, Python, the Word, Excel and PDF export), the way CivilKit Studio's Calc tab does, opens the app with `?host=1`:

```html
<iframe src="https://civilkit.io/calcs/?host=1&theme=dark"
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"></iframe>
```

The host owns the file. The app shows one document, the one the host sends, and tells the host about every edit. It keeps no copy: no tabs, no drafts, no recent files, no restored session, no browser database. The File menu, New, Open, Save as and the library are not there; the suite bar is not there either. Saving is the host's job: Save and Ctrl+S send `civilkit-save-request`. The app's settings (theme, editor and calculation options) are kept in the browser as in the app, and the export buttons work as usual. `allow-same-origin` lets the app keep its settings; leave `allow-downloads` out and the export buttons cannot save a file.

Messages go to the parent window only, and the app answers to its parent only (`event.source` is checked, and the origin where the browser tells it).

| Message | Direction | What it does |
|---|---|---|
| `{type: 'civilkit-ready', caps, protocol, tokens}` | app to host | **Once**, when the app takes messages. `caps` lists what it understands (`load`, `loaded`, `source`, `results`, `theme`, `tokens`, `errors`, `save`); `protocol` is 1; `tokens` lists the design-token names `civilkit-theme` accepts. |
| `{type: 'civilkit-load', source, name?, files?, values?, revision?}` | host to app | Replaces the open document, with no question and nothing stored. `source` is the text (up to 1,000,000 characters, empty is fine). `name` (letters, digits, dot, dash, underscore, up to 60) is the document's name and the tab's title. `files` is an object of name to base64 text for the `.cpd`, `.txt`, `.csv`, `.xlsx` and `.xlsm` files the sheet reads (plain relative names, up to 5,000,000 characters in all); they are kept in memory only, and the files of the load before are dropped. `values` sets the sheet's inputs by name (numbers, a number with a unit such as `"8000 mm"`, a choice, `true` or `false`; up to 200). `revision` is the host's own counter for the text. A refused load changes nothing and answers `civilkit-error`. |
| `{type: 'civilkit-loaded', name, revision}` | app to host | After **each** load, once the document is shown and calculated. `revision` is the one the load carried. |
| `{type: 'civilkit-source', source, name, revision}` | app to host | After each edit, once typing pauses (about 0.3 s): the whole text. `revision` goes up by one each time, from the `revision` of the last load, so the host can drop a stale message. It is never sent for the host's own load, so a host that answers each message with a load cannot loop. |
| `{type: 'civilkit-results', name, values, errors}` | app to host | After a load and after edits: `values` is each variable as `{value, unit, text}`; `errors` is a list of `{line, severity, message}` with `line` counted from 1 in the host's text. The results of a sheet with Python blocks leave the Python out. |
| `{type: 'civilkit-save-request', source, name, revision}` | app to host | Save or Ctrl+S was used. The app writes nothing itself. |
| `{type: 'civilkit-get'}` and `{type: 'civilkit-get-source'}` | host to app | Repeat the last `civilkit-results`; send `civilkit-source` now, at the current revision. |
| `{type: 'civilkit-theme', mode?, tokens?}` | host to app | `mode` is `'light'`, `'dark'` or `'auto'` (the same as `?theme=`; the choice is not saved). `tokens` is a flat object of the host's design tokens, see below. A message without `tokens` clears the earlier ones. |
| `{type: 'civilkit-update-available'}` | app to host | A newer build of the app is ready. The app never shows its own Reload button in a host frame; the host decides when to reload. |
| `{type: 'civilkit-error', errors}` | app to host | A message was refused (the reasons, as text). |

**Tokens.** `tokens` maps Studio's token names to colours and fonts, and the app paints them onto its own `--ck-*` properties as inline overrides on the page. Names may be written with or without a leading `--`; unknown names are ignored. Colours are `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` or `hsl()`/`hsla()`; fonts are a stack of names, quotes, commas and hyphens. Anything else (`url()`, a semicolon, a brace, a named colour) refuses the whole message with `civilkit-error` and changes nothing.

| Token | Sets |
|---|---|
| `bg-0` | `--ck-bg`, `--ck-sunken` (the workspace and the input wells) |
| `bg-1` | `--ck-panel` (panels, the editor) |
| `bg-2` | `--ck-raised` (toolbars, tab bar, menus) |
| `txt-0`, `txt-1`, `txt-2` | `--ck-text`, `--ck-text-2`, `--ck-text-3` |
| `line` | `--ck-line` |
| `accent`, `accent-soft`, `accent-cta` | `--ck-accent` and `--ck-focus`, `--ck-accent-soft`, `--ck-accent-strong` |
| `ok`, `warn`, `danger` | `--ck-ok`, `--ck-warn`, `--ck-err` |
| `font-ui`, `font-mono` | `--ck-font`, `--ck-mono` |
| `bg-3`, `line-2` | checked, then unused (no counterpart in the app) |

The editor's own colours follow the light or dark `mode`, not the tokens.

## Privacy

The embed runs the same engine as the app, in the reader's browser. It sends nothing to a server, sets no cookies,
loads no analytics and stores nothing: the app's own saved settings, files and open tabs are not changed by it. It does not register the app's offline service worker either (a reader who already uses the app
gets the embed from the same offline copy).
