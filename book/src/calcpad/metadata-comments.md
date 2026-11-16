# Metadata comments

<!-- description: Metadata comments are HTML comments holding JSON that the report hides: definition notes, PDF page setup and the input values Save values writes. -->

A metadata comment stores information about a document without printing it in the report. It is a
JSON object inside an HTML comment, written on a comment line.

## What the engine accepts

A metadata comment is an ordinary comment line (it starts with `'` or `"`) that holds `<!--{ ... }-->`:

<!-- expect: A(3; 4) = 12 | Visible note -->
```cpd
'<!--{"desc": "Cross-sectional area"}-->
A(b; h) = b*h
A(3; 4)
'Visible note
```

The engine writes the comment into the HTML output as a raw HTML comment, so it is hidden when the
page is shown and is still in the file. Nothing in it is calculated, and the lines around it
calculate as usual.

| Form | Where it goes | What it is for |
| --- | --- | --- |
| `{"desc": ...}` with `paramTypes`, `paramDesc`, `returnType` | The line directly above a variable, function, macro or unit | A description and parameter notes for the editor |
| `{"pdf": {...}}` | Anywhere in the document | Page setup of the document's own PDF |
| `{"uiOverrides": {...}}` | Under the `<!--sheet-->` line of a sheet | Input values kept by **Save values** |

These are the forms this guide covers. The engine copies each of them to the output unchanged, as
the example above shows for `desc`; the editor and the app are what act on them.

## Rules for writing one

* Keep the whole comment on one line.
* The text inside has to be valid JSON. The engine does not check it: a comment such as
  `'<!--{bad json}-->` is copied to the output and the sheet calculates as before.

<!-- expect: x = 1 | x + 1 = 1 + 1 = 2 -->
```cpd
'<!--{bad json}-->
x = 1
x + 1
```

A plain HTML comment line that does not start with `'` is not a comment to the engine. It is read
as a formula and fails with `Missing operand`, so always put the `'` first.

## Describing a definition

Put a `desc` comment on the line directly above what it describes. The other keys name the kind
of value each argument takes (`value`, `vector`, `matrix` or `any`), a short note for each
argument in order, and what a function returns:

<!-- expect: I(2; 3) = 4.5 -->
```cpd
'<!--{"desc": "Second moment of area of a rectangle", "paramTypes": ["value", "value"], "paramDesc": ["width", "height"], "returnType": "value"}-->
I(b; h) = b*h^3/12
I(2; 3)
```

The calculation is the same with or without the comment. The notes are for people reading the
source and for editor hints.

## Page setup of the PDF

A document can carry its own PDF page setup, for example
`{"pdf": {"format": "A4", "orientation": "landscape", "marginTop": "2cm"}}`. The engine passes this
comment through like any other. [Exporting](../exporting.md) says that the page of **Print PDF**
and the **Pages** view comes from the Settings, Export tab "or the document's own PDF settings";
see that page for where the settings are changed.

## Saved input values

The Input view keeps the values you type in the page, not in the file. **Save values** writes them
to a `uiOverrides` comment. The keys in it are the input name and a counter, as in `"L:1"`.
[Input lines](ui-inputs.md) describes the Input view and what saving does, and
[Templates](../templates.md) shows the saved line in a sheet:

```text
<!--sheet-->
'<!--{"uiOverrides":{"L:1":"8"}}-->
```

In short:

* The comment is a metadata comment like the others: the report does not print it.
* A saved value belongs to the input's name. If you rename an input, the value saved under the old
  name is not used any more.
* Delete the comment line to go back to the defaults. **Update defaults** writes the values into
  the lines instead and removes them from the comment.
* The engine does not read `uiOverrides`. The Input form applies it, so a calculation on the
  command line shows the default:

<!-- expect: L = 6 m | M = L · 2 = 6 m · 2 = 12 m -->
```cpd
'<!--{"uiOverrides":{"L:1":"8"}}-->
#UI L = 6m
M = L*2
```

Here the saved `8` is not used and `L` stays `6 m`. In the app, Input mode and the report apply the
saved value, and Preview shows the defaults.

## What the report and the exports do

The comment is an HTML comment, so a browser does not draw it: it is not part of the report you read
or print. It stays in the saved file and in the HTML the engine writes. The pages for
[Exporting](../exporting.md) say what each export contains. How Word and Excel treat these
comments was not checked.

## See also

* [Input lines](ui-inputs.md): `#UI`, the Input view and Save values
* [Templates](../templates.md): sheets and the saved line
* [Exporting](../exporting.md): PDF settings and the Pages view
* [Directives and commands](directives.md): comments and text modes
