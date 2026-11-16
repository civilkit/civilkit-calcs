# HTML and styling in a worksheet

<!-- description: Put HTML in comment lines, use the report's ready-made CSS classes, and see what print, Word and Excel do with them. -->

A comment line is passed to the report as HTML, so you can colour a verdict, add a reference, rule a table or float a picture. This page covers the HTML you can write, the classes the report already styles, and what each output does with them.

## HTML in comment lines

A line that starts with `'` is a comment, and everything after the quote is copied to the report as written. The closing quote is optional at the end of a line. Anything outside quotes is read as math, so HTML must always sit inside a comment.

<!-- expect: Beam | B1 | Results -->
```cpd
'Beam <b>B1</b>: span L<sub>eff</sub> = 6 m, f<sup>2</sup> check
"Results
x = 2
```

Tags that work as you would expect in a web page: `<b>`, `<i>`, `<u>`, `<s>`, `<sup>`, `<sub>`, `<br/>`, `<hr/>`, `<p>`, `<ul>`/`<ol>`/`<li>`, `<h3>` to `<h6>`, `<span style="color:red;">`, `<table>` and `<img>`. A line that starts with `"` is a heading: it is written as an `<h3>`.

Math inside a comment is not calculated. To colour or style a real expression, close the comment before it and open a new one after it. The two comments carry the opening and closing tags:

<!-- expect: as simple as | 2 + 2 = 4 -->
```cpd
'<span style="color:#b00020;"> as simple as '
2 + 2
'</span>
```

The tags enclose the result line, and the whole line is coloured. Keep the quotes balanced: a stray tag outside a comment is parsed as math and gives an error.

## Predefined classes

The report stylesheet defines a few classes for the things engineering sheets need most. Assign one to an element with `class="..."`. Each one below was checked to change the report on this engine.

| Class | On | Effect in the report |
| --- | --- | --- |
| `err` | `span`, `p`, `div` | Crimson text on a light red background. For a failed check. |
| `ok` | `span`, `p`, `div` | Green text on a light green background. For a passed check. |
| `ref` | `span`, `p` | Floats to the right edge, green on pale green. For a code clause or an equation number. |
| `bordered` | `table` | Grid lines, a shaded and centred header row, some space above. |
| `data` | `table` | First column left aligned, the other columns right aligned. No lines. |
| `side` | `img` | Floats to the right (same as `style="float:right"`), at most half the width, so the text wraps beside it. |
| `fold` | `div` | See the note below. |

<!-- expect: Check: | satisfied | EN 1992 | Mu | 120.5 -->
```cpd
'<span class="ok">Check: the section is satisfied</span>
'<span class="ref">[EN 1992-1-1, 9.2.2]</span>
'<table class="bordered"><thead><tr><th>Bar</th><th>Mu (kN·m)</th></tr></thead>
'<tbody><tr><td>T12</td><td>120.5</td></tr></tbody></table>
```

A pass-or-fail message that follows the calculation is the usual use of `err` and `ok`:

```cpd
M = 50 kN*m
#if M < 100 kN*m
    '<span class="ok">Bending: satisfied</span>
#else
    '<span class="err">Bending: not satisfied</span>
#end if
```

Classes only style the elements that carry them. `ok` and `err` do not change a result's colour; put them on the comment around it. A class you invent that the stylesheet does not know does nothing.

### Pictures

`<img>` works in a comment. Use a full URL (or a path relative to the worksheet), and either `class="side"` or `style="float:right"` to let the text wrap beside the picture. Without a float the picture sits in the text flow and splits it. In the browser a picture's width never goes beyond the page.

```text
'<img class="side" src="https://example.com/site-plan.png" alt="Site plan">
```

### Folding

`<div class="fold">` clips the block to its first line, with a small arrow after it. CalcpadCE opens it on a click. In the CivilKit Calcs report I found no click handler: the block stays clipped, on screen and in print, so the hidden lines cannot be read there. Do not use it to hide working you still want readers to see. In a sheet, a heading marked `{collapse}` folds and unfolds properly: see [Collapsing sections](../editing.md#collapsing-sections).

## Markdown in comments

Turn Markdown on for comment lines with `#md on` and off with `#md off`. The syntax then includes the usual emphasis and headings and these extensions:

| Write | Result |
| --- | --- |
| `++text++` | underlined |
| `~~text~~` | struck through |
| `==text==` | highlighted |
| `x^2^` | superscript |
| `y~i~` | subscript |
| `> text` | block quote |

<!-- expect: bold | highlighted | under | strike | quote -->
```cpd
#md on
'**bold** ==highlighted== ++under++ ~~strike~~ x^2^ y~i~
'> quote
#md off
```

Without `#md on`, a comment line is HTML only: `'**not bold**` is printed with the stars.

## Text blocks

`#html` ... `#end html` writes its lines as raw HTML, with no leading quote on each line. `#markdown` ... `#end markdown` does the same for Markdown. Use them for longer passages; `#cpd` goes back to calculation inside one. They share the classes above: `<p class="ok">` works in an `#html` block.

<!-- expect: Note | inside a block -->
```cpd
#html
<p class="ok">Note: written inside a block</p>
#end html
#markdown
**Note** inside a block
#end markdown
```

Highlighting with `==text==` inside a `#markdown` block is written as `≡text≡`. Use `<mark>` there, or `#md on` comment lines. Lines inside `#hide` ... `#show` are not written to the report, HTML or not.

## What each output does with it

| Output | What happens |
| --- | --- |
| Report on screen | All of the above, drawn by the report stylesheet. |
| Print / PDF | The same stylesheet. A `side` picture is scaled to 80%. A `fold` block stays clipped. |
| Save HTML | The tags and classes are kept, with the stylesheet, so the page looks as on screen. |
| Word | `err` and `ok` keep their colour and shading, on a `<span>` or a `<p>`. `ref` is right aligned and shaded when it is on a `<p>`; on a `<span>` it is plain text. `bordered` tables keep grid lines. `side` and `float:right` pictures are embedded and placed on the right. `sup`, `sub`, `u`, `s` and `mark` keep their form. A `fold` block is written out in full. A `data` table is written plainly, with no alignment rule. |
| Excel | The text is kept in the Report sheet. Colour, borders and floats are not carried, and a table becomes a cell range. |

See [Exporting](../exporting.md) for how to run each one.

One quirk in Word: comment lines made only of inline HTML (a bare `<span>`) are joined with the line after them into one paragraph, and such a line directly before a table lands in the table's first cell. Wrap each comment in `<p>...</p>` to keep them apart. CalcpadCE behaves the same.

## Not here

The desktop toolbar buttons, MathType and Word templates of CalcpadCE do not exist in CivilKit Calcs. In a sheet, the ribbon's **Text Formatting** tab inserts the same tags and classes for you.
