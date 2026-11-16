# Linter messages

<!-- description: The editor's linter marks mistakes with a CPD code as you type: what it checks, how it shows, every code with its fix, and how to silence one. -->

The linter reads your worksheet while you type and marks problems before you run it. Each mark
carries a code that starts with `CPD-`, such as `CPD-3301`, and a message. This page lists the
codes and what to do about each.

## What it checks and where it shows

The linter looks at the whole worksheet, including the files it pulls in with `#include`, and
checks these: `#include` lines, macro definitions, brackets and blocks, names (variables,
functions, macros, units) and how they are used, and the metadata comments and `#UI` lines. It
works on a sheet too: the sheet is turned into a Calcpad worksheet first, and the marks are
shown on your sheet lines.

It runs about half a second after you stop typing, and again when you switch tabs or refresh.
You see it in three places:

* **Underlines** in the source: red for an error, yellow for a warning, blue for information.
  Hover over one to read the code and the message.
* **The Errors dialog** (**Errors and warnings**), from the ribbon or the status bar, lists the
  marks of the open file.
* **The status bar** shows the number of errors, warnings and information marks.

The linter runs in the editor only. The command-line `Cli` and the engine do not lint, so a
worksheet that has lint marks can still calculate, and some errors that the engine reports
(an undefined name, say) are also caught by the linter before you run.

### Choosing how much to show

**Settings > Editor > Linter Minimum Severity** has three choices: *Error*, *Warning* and
*Information (all)*. A mark below the level you choose is hidden, from the underlines and from
the Errors dialog alike. The default is *Information (all)*. Changing it takes effect at once.

Most worksheets show many `CPD-3312` marks at the default, because every value you calculate
and never use again counts as unused. Set the minimum to *Warning* to hide them.

## Reading a message

A message has the text of the code, then a colon and a detail about your line, for example
`Undefined variable: 'zz'`.
The tables below give the text of each code. Where the detail is a name or a count from your
line, it is not repeated here.

## Includes

| Code | Severity | Message | Fix |
| --- | --- | --- | --- |
| CPD-1101 | Error | Malformed #include statement | Write `#include name.cpd`. |
| CPD-1102 | Error | Missing #include filename | Add the file after `#include`. |
| CPD-1103 | Warning | Deprecated #include input values | Remove the `#{...}` values and declare the inputs with `#UI` in the included file. |

## Macros

| Code | Severity | Message | Fix |
| --- | --- | --- | --- |
| CPD-2201 | Error | Duplicate macro definition | Rename one of them or delete the second. |
| CPD-2202 | Error | Macro name must end with '$' | Write `#def name$`. |
| CPD-2203 | Error | Macro parameter must end with '$' | Write `p$` in the parameter list. |
| CPD-2204 | Error | Invalid macro name (must start with a letter) | Start the name with a letter. |
| CPD-2205 | Error | Malformed #def syntax | Write `#def name$` or `#def name$(p1$; p2$)`. |
| CPD-2206 | Error | Unmatched #def or #end def | Pair every `#def` with an `#end def`. |
| CPD-2207 | Error | Nested macro definition not allowed | Close the first macro before starting the next. |
| CPD-2208 | Error | Macro parameter must start with a letter | Start the parameter with a letter. |
| CPD-2209 | Warning | Macro definition inside a control block has no effect | Move the `#def` out of the `#if` or loop. |
| CPD-2210 | Error | Invalid character in macro name | Use ASCII letters, digits and underscores. |
| CPD-2211 | Error | Invalid character in macro parameter | Use ASCII letters, digits and underscores. |
| CPD-2212 | Error | Duplicate macro parameter | Give each parameter its own name. |
| CPD-2213 | Error | Required parameter after optional parameter | Put the optional parameters last. |

## Brackets and blocks

| Code | Severity | Message | Fix |
| --- | --- | --- | --- |
| CPD-3101 | Error | Unmatched opening parenthesis | Add the closing `)`. |
| CPD-3102 | Error | Unmatched closing parenthesis | Remove it or add the opening `(`. |
| CPD-3103 | Error | Unmatched opening square bracket | Add the closing `]`. |
| CPD-3104 | Error | Unmatched closing square bracket | Remove it or add the opening `[`. |
| CPD-3105 | Error | Unmatched opening curly brace or control block | Add the closing `}`, or the `#end if` or `#loop` of the block. |
| CPD-3106 | Error | Unmatched closing curly brace | Remove it or add the opening `{`. |

## Names

| Code | Severity | Message | Fix |
| --- | --- | --- | --- |
| CPD-3201 | Error | Invalid variable name (must start with a letter) | Start the name with a letter. |
| CPD-3202 | Error | Invalid function name | Start the name with a letter. |
| CPD-3203 | Error | Function name conflicts with a built-in function | Pick another name. |
| CPD-3204 | Error | Variable name conflicts with a keyword | Pick another name. |
| CPD-3205 | Warning | Variable name conflicts with a built-in constant | Pick another name. |
| CPD-3206 | Error | Function must have at least one parameter | Add a parameter, or make it a variable. |
| CPD-3207 | Error | Required parameter after optional parameter in function definition | Put the optional parameters last. |

## Usage

| Code | Severity | Message | Fix |
| --- | --- | --- | --- |
| CPD-3301 | Error | Undefined variable | Define it above the line, or fix the spelling. |
| CPD-3302 | Error | Function called with the wrong number of parameters | Match the number in the definition. |
| CPD-3303 | Error | Undefined macro | Define it with `#def` above the line. |
| CPD-3304 | Error | Macro called with the wrong number of parameters | Match the number in the definition. |
| CPD-3305 | Error | Undefined function | Define it above the line, or fix the spelling. |
| CPD-3306 | Warning | Invalid element access | Index only vectors and matrices. |
| CPD-3307 | Error | Too few parameters | Add the missing arguments of the built-in function. |
| CPD-3308 | Error | Too many parameters | Remove the extra arguments. |
| CPD-3309 | Warning | Parameter type mismatch | Pass a value of the type the function expects. |
| CPD-3310 | Error | Undefined unit | Fix the unit name; see [Units](../units.md). |
| CPD-3311 | Error | Empty parameter in a function call | Fill in the empty argument or delete its `;`. |
| CPD-3312 | Information | Unused variable | Use the value, or ignore the mark. |
| CPD-3313 | Information | Redefinition of existing function | Rename one of the functions. |
| CPD-3314 | Error | Unknown keyword argument | Use a parameter name from the macro. |
| CPD-3315 | Error | Unknown keyword argument in function call | Use a parameter name from the function. |

## Semantics

| Code | Severity | Message | Fix |
| --- | --- | --- | --- |
| CPD-3401 | Error | Invalid operator usage | Replace operators such as `++`, which Calcpad does not have. |
| CPD-3402 | Error | Unknown command name | Check the spelling of the `$` command. |
| CPD-3403 | Error | Unknown directive | Check the spelling of the `#` directive. |
| CPD-3404 | Warning | Invalid assignment (multiple assignments on the same line) | Put each assignment on its own line. |
| CPD-3405 | Error | # directive not allowed inside a command block | Use `if()`, `$Repeat` and the like inside the braces. |
| CPD-3406 | Error | Invalid command syntax | Write `@ variable = start : end`. |
| CPD-3407 | Error | Incomplete expression | Finish the right-hand side. |
| CPD-3408 | Error | Command variable mismatch | Use the loop variable the command declares. |
| CPD-3409 | Error | Reassignment of a constant | Do not assign to a name you defined as a constant. |
| CPD-3410 | Error | Outer-scope assignment (←) to an undefined variable | Define the variable before the block. |

## Metadata comments, #settings and #UI

| Code | Severity | Message | Fix |
| --- | --- | --- | --- |
| CPD-3411 | Warning | Invalid paramType value in a metadata comment | Use a value the comment accepts. |
| CPD-3412 | Warning | Invalid metadata-comment JSON | Fix the JSON, or the unknown property name. |
| CPD-3413 | Warning | Invalid #settings JSON | Fix the JSON after `#settings`. |
| CPD-3414 | Warning | Invalid PDF settings in a metadata comment | Check the PDF properties. |
| CPD-3415 | Warning | Invalid #UI format | Write `#UI` with a variable assignment. |
| CPD-3416 | Warning | 'uiOverrides' metadata comment not on the first line | Move it to the first line of the file. |
| CPD-3417 | Warning | Duplicate 'uiOverrides' metadata comment | Keep one; only the first is read. |
| CPD-3418 | Warning | 'uiOverrides' sharing a comment with another key | Give `uiOverrides` a comment of its own. |
| CPD-3419 | Warning | Deprecated stored input value | Replace `?{...}` with `#UI`. |
| CPD-3601 | Warning | Invalid format specifier | Use a format of the form the `#format` directive takes. |
| CPD-3801 | Error | The #python block has no '#end python' line | Close the block; see [Python](../python.md). |

## Examples

Most of these marks match an error the engine gives when you run the worksheet. A line the
engine rejects is shown as text, then the corrected version as a worksheet.

An undefined name (`CPD-3301`). The engine says `Undefined variable or units: "zz"`:

```text
q = zz + 1
```

```cpd
zz = 2
q = zz + 1
```

The wrong number of arguments (`CPD-3302`). The engine says `Invalid number of arguments`:

```text
f(x; y) = x + y
z = f(1)
```

<!-- expect: z = f(1; 2) = 3 -->
```cpd
f(x; y) = x + y
z = f(1; 2)
```

A bracket left open (`CPD-3101`). The engine says `Missing right bracket ")"`:

```text
x = (1 + 2
```

<!-- expect: x = 1 + 2 = 3 -->
```cpd
x = (1 + 2)
```

A unit the engine does not know (`CPD-3310`). It says `Error parsing "foo" as units`:

```text
a = 3 foo
```

<!-- expect: a = 3 m -->
```cpd
a = 3 m
```

A macro defined twice (`CPD-2201`). The engine says `Duplicate macro name: "m$"`:

```text
#def m$
    1
#end def
#def m$
    2
#end def
```

<!-- expect: 1 = 1 -->
```cpd
#def m$
    1
#end def
m$
```

A name the engine reserves (`CPD-3203`, `CPD-3205`, `CPD-3409`). Defining your own `sin` gives
`"sin" is a built-in function and cannot be redefined`, and assigning to `π` gives
`Cannot modify constant "π"`:

```text
sin(x) = x
π = 3
```

<!-- expect: y = sin(30) = 0.5 -->
```cpd
y = sin(30)
```

## Silencing a message

Wrap the lines in a pair of metadata comments. `LintIgnore` lists the codes to hide from that
line on, and `EndLintIgnore` ends the region. Codes are not case sensitive.

<!-- expect: x = 1 -->
```cpd
'<!--{"LintIgnore": ["CPD-3312"]}-->
x = 1
'<!--{"EndLintIgnore": []}-->
```

* An empty list, `"LintIgnore": []`, hides every code until the matching `EndLintIgnore`.
* `EndLintIgnore` with codes ends just those; with an empty list it ends all open regions.
* A region left open runs to the end of the file.

Suppression hides the mark only. It does not change the calculation, so wrapping a line that the
engine rejects, such as `q = zz`, still gives the engine's error when you run it. The comments
are printed in the results as ordinary text comments.

## See also

* [Directives and commands](directives.md) for `#def`, `#include`, `#if` and the loops.
* [Troubleshooting](../troubleshooting.md) for the messages the engine gives when you run.
