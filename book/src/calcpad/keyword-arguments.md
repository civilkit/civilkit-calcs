# Keyword arguments

<!-- description: Call functions and macros by parameter name, give parameters default values, and follow the rules for string variables and macro names. -->

Functions and macros can name their arguments in a call (`f(x = 5)`) and can give parameters a
default value. This page also lists the rules for string variables and macro names that the
[directives page](directives.md) only touches on.

## Defaults in a function

Write a default after the parameter with `=`. A parameter with a default is optional in a call.

<!-- expect: f(5) = 1 | f(5; 3; 2) = 17 -->
```cpd
f(x; y = 0; z = 1) = x*y + z
a = f(5; 3; 2)
b = f(5)
```

Required parameters must come before optional ones in the definition. `f(x; y = 0; z) = x*y + z`
is an error: `Required parameter "z" cannot follow an optional parameter.` A default can carry
units, for example `y = 1kg`.

## Positional and keyword arguments

A call can pass arguments by position, by name (`name = value`), or both. Keyword arguments may
come in any order. Once you use a keyword you cannot go back to positional arguments.

<!-- expect: f(x = 5; z = 2; y = 3) = 17 | f(5; z = 2) = 2 | g(y = 1; x = 2) = 3 -->
```cpd
f(x; y = 0; z = 1) = x*y + z
a = f(x = 5; z = 2; y = 3)
b = f(5; z = 2)
g(x; y) = x + y
c = g(y = 1; x = 2)
```

`b` passes `x` by position, `z` by name and lets `y` take its default of 0. Keywords also work on
functions that have no defaults, as `g` shows. The value after `=` is an ordinary expression:
`f(x = a + 1)` evaluates `a + 1` first.

### Errors

These are all rejected, with the same message in CalcpadCE.

| Call | Message |
|---|---|
| `f(1; x = 2)` (`x` already passed by position) | `Duplicate argument for parameter "x".` |
| `f(q = 1)` (no parameter `q`) | `Unknown keyword argument: "q".` |
| `f(y = 2; 3)` (positional after keyword) | `Invalid number of arguments.` |
| `f()` (required `x` missing) | `Invalid syntax: "( )".` |

Built-in functions take neither keywords nor defaults: `sin(x = 1)` is an error.

## Macros with defaults

A macro parameter ends in `$`, and so does its keyword. The call syntax is the same as for
functions.

<!-- expect: result = 1 + 2 + 3 = 6 | result = 1 + 2 + 7 = 10 | result = 1 + 10 + 7 = 18 -->
```cpd
#def calc$(a$; b$ = 10; c$ = 5)
    result = a$ + b$ + c$
#end def
calc$(1; 2; 3)
calc$(a$ = 1; c$ = 7; b$ = 2)
calc$(1; c$ = 7)
```

When every parameter has a default, an empty call uses them all:

<!-- expect: r = 10 · 5 = 50 | s = 3 · 4 = 12 -->
```cpd
#def area$(w$ = 10; h$ = 5)
    r = w$*h$
#end def
area$()
#def area2$(w$ = 10; h$ = 5) = w$*h$
s = area2$(3; 4)
```

The same errors apply as for functions: a duplicate (`calc$(1; a$ = 3)`), an unknown keyword
(`calc$(z$ = 3)`), a required parameter after an optional one in the definition, and a positional
argument after a keyword. Defining the same parameter twice is also refused.

### A default is text, not a value

A macro default is pasted into the body as text, exactly like an argument. It is not evaluated
first, so its unit takes part only after substitution:

<!-- expect: r = 2 kg + 1 kg = 3 kg -->
```cpd
#def add$(a$; b$ = 1kg) = a$ + b$
r = add$(2kg)
```

`add$(2)` fails with `Inconsistent units: "unitless + kg"`, because the text becomes `2 + 1kg`.

A default may refer to a string variable defined earlier:

<!-- expect: r = 2 · 12 kN = 24 kN -->
```cpd
#def load$ = 12kN
#def force$(n$; p$ = load$) = n$*p$
r = force$(2)
```

### Empty argument lists

`name$()` with parentheses and nothing inside means different things depending on the macro.

| Macro | `name$()` |
|---|---|
| Every parameter optional | All defaults are used. |
| One required parameter | The parameter becomes empty text, so the body is likely a syntax error. |
| Two or more required parameters | `Invalid number of arguments.` |

The CalcpadCE page says an empty call passes empty strings to a macro without defaults. In both
engines that only holds for one parameter; with two required parameters the call is refused.

## String variables

A string variable is a macro without parameters. It holds text that is pasted wherever you write
its name, before the line is parsed.

<!-- expect: a = 12 kN -->
```cpd
#def sv$ = 12kN
a = sv$
```

A multi-line variable pastes several lines at once:

<!-- expect: a = 1 | b = 2 -->
```cpd
#def pair$
    a = 1
    b = 2
#end def
pair$
```

## Naming rules

| Rule | Detail |
|---|---|
| Ending | A variable, macro or parameter name must end in `$`. |
| Characters | Letters, digits and `_`. The first character cannot be a digit. |
| Case | Names are case sensitive: `m$` and `M$` are different, and `M$` is reported as `Macro not defined: M$.` |
| Rejected | `#def 3bad$ = 7` gives `Invalid symbol "3" in macro name.` A `*` or `-` is rejected the same way. |
| Inside a definition | Another `#def` is not allowed: `Invalid inside macro definition.` |
| Input fields | `?` in a macro body gives `Undefined input field.` |

The upstream CalcpadCE guide writes the inline macro form as `#def *macro_name$(...)`. The `*`
is rejected by both engines (`Invalid symbol "*" in macro name`); leave it out.

Digits are allowed after the first character:

<!-- expect: r = 7 | r = 4 · 2 = 8 -->
```cpd
#def a1$ = 7
r = a1$
#def _my_v$ = 4
r = _my_v$*2
```

A macro body may mention other macros or variables. They are looked up when the macro is called,
so a variable defined after the macro still works if it exists at the call.

## See also

- [Directives and commands](directives.md) for `#def` basics and the other directives.
- [Deviations from CalcpadCE](../appendix/deviations.md).
