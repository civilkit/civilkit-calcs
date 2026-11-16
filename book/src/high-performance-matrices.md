# High-performance vectors and matrices

<!-- description: High-performance (hp) vectors and matrices in the Calcpad language: constructors, the one-unit rule, typing, solver requirements and special matrix types. -->

An hp vector or matrix is a compact variant meant for large numerical models. It stores the numbers
together with a single unit for the whole object, which is what makes it faster and smaller than an
ordinary vector or matrix. In a calculation it behaves like the ordinary one, with the rules below.
The examples on this page are written in the Calcpad language (`;` separates arguments, `|` separates
matrix rows); see [Vectors and matrices](vectors-matrices.md) for the basics.

## Creating hp objects

The constructors have the same arguments as the ordinary ones, with `_hp` added to the name.

| Function | Result |
| --- | --- |
| `vector_hp(n)` | empty hp vector of length n |
| `range_hp(x1; xn; s)` | hp vector from a range of values |
| `matrix_hp(m; n)` | empty hp matrix, m by n |
| `identity_hp(n)` | identity matrix |
| `diagonal_hp(n; d)` | diagonal matrix with d on the diagonal |
| `column_hp(m; c)` | m by 1 matrix filled with c |
| `utriang_hp(n)`, `ltriang_hp(n)` | upper or lower triangular matrix |
| `symmetric_hp(n)` | symmetric matrix |

`hp(x)` converts an ordinary vector or matrix, so you can fill one from a bracket list.
`ishp(x)` tells you whether a value is hp (1) or not (0). The conversion copies every element, so use it
for small arrays and build large ones with the constructors.

<!-- expect: [ 1 2 0.3 ] m | ishp(⃗a) = 1 | ishp(⃗b) = 0 | range_hp(1;5;1) = [ 1 2 3 4 5 ] -->
```cpd
a = hp([1m; 20dm; 30cm])
ishp(a)
b = [1; 2; 3]
ishp(b)
d = range_hp(1; 5; 1)
```

## One unit for the whole object

All elements of an hp object share one unit. When you convert a list with different but compatible
units, they are converted to the unit of the first element (above, `20dm` becomes 2 m). Units that
cannot be converted into each other are an error, and so is writing an element whose unit does not
match the object:

```text
x = hp([1m; 20s; 30kg])
Inconsistent units: "m , kg".
```

<!-- expect: a = [ 0.5 2 ] m -->
```cpd
a = hp([1m; 2m])
a.1 = 50cm
a
```

Writing `a.2 = 3s` or a plain `a.2 = 3` into that vector gives `Inconsistent units`. A new
`vector_hp(2)` has no unit, so it takes unitless numbers only; to get a vector in metres, convert a
list that already carries the unit.

## Typing and mixing

An expression made only of hp values gives an hp result. As soon as one operand is an ordinary vector
or matrix, the result is ordinary. A function that reduces to a number, such as `sum`, returns a
plain number.

<!-- expect: ishp(⃗a+⃗a) = 1 | ishp(⃗a+[1;1;1]) = 0 | ishp(⃗a+hp([1;1;1])) = 1 -->
```cpd
a = hp([1; 2; 3])
ishp(a + a)
ishp(a + [1; 1; 1])
ishp(a + hp([1; 1; 1]))
```

Mixing is allowed, so you can feed an hp matrix to a function that takes ordinary ones. The reverse is
not true: some functions insist on hp arguments.

## Functions that need hp

| Function | Needs |
| --- | --- |
| `slsolve(A; b)` | A hp and symmetric-typed, b an hp vector |
| `smsolve(A; B)` | A hp and symmetric-typed, B hp |
| `fft(M)`, `ift(M)` | an hp matrix |

An ordinary argument is refused:

```text
slsolve([2; -1|-1; 2]; [1; 0])
Argument must be hp matrix.
```

A matrix that is hp but not symmetric-typed gives `Matrix must be symmetric.` even if its numbers are
symmetric, because the type is what counts. Copy the numbers into a `symmetric_hp` matrix:

<!-- expect: slsolve(S;hp([1;0])) = [ 0.667 0.333 ] -->
```cpd
S = copy(hp([2; -1|-1; 2]); symmetric_hp(2); 1; 1)
slsolve(S; hp([1; 0]))
```

`slsolve` is an iterative (conjugate gradient) solver, so its answer is accurate to the tolerance in
the `Tol` setting. It suits large banded or sparse systems; for small ones `lsolve` is simpler.
`ift` undoes `fft`:

<!-- expect: F = fft(H) = 10 -2 -2 -2 | ift(F) = 1 2 3 4 -->
```cpd
H = hp([1; 2; 3; 4|0])
F = fft(H)
ift(F)
```

## Special matrix types

`diagonal`, `symmetric`, `column`, `utriang` and `ltriang` (and the `_hp` forms) create matrices with
a fixed structure. They keep that structure when you write into them, which gives these rules.

**Writing outside the structure is an error.** A diagonal matrix has no element at (1; 2), a column
matrix has only column 1, an upper triangular one has nothing below the diagonal and a lower
triangular one nothing above it. Even writing 0 there is refused:

```text
D = diagonal(3; 5)
D.(1; 2) = 7
Index out of range: 1, 2.
```

Writing inside the structure works as usual:

<!-- expect: D = 5 0 0 0 7 0 0 0 5 | U = 0 0 1 0 0 0 0 0 0 -->
```cpd
D = diagonal(3; 5)
D.(2; 2) = 7
D
U = utriang(3)
U.(1; 3) = 1
U
```

**A symmetric matrix mirrors writes.** Writing to one triangle sets the other as well, so you never
have to keep the two halves in step:

<!-- expect: S = 0 0 4 0 0 0 4 0 0 -->
```cpd
S = symmetric(3)
S.(3; 1) = 4
S
```

**Filling keeps the type.** `mfill`, `fill_row` and `fill_col` respect the structure, so
`mfill(ltriang(3); 2)` fills only the lower triangle:

<!-- expect: mfill(ltriang(3);2) = 2 0 0 2 2 0 2 2 2 -->
```cpd
L = mfill(ltriang(3); 2)
```

**`mresize` changes the matrix in place.** `B = mresize(A; 3; 3)` resizes `A` itself and returns it,
so after the call both names show the new size. It keeps a special type when the new size still fits
it (a diagonal, symmetric or triangular matrix stays square):

<!-- expect: n_rows(A) = 3 | n_rows(B) = 3 -->
```cpd
A = matrix(2; 2)
B = mresize(A; 3; 3)
n_rows(A)
n_rows(B)
```

The same in-place behaviour holds for `copy`: it writes into its second argument and returns it.
`row` and `col` of a special matrix return a full row or column, zeros included.

## Eigenvalues of a symmetric matrix

`eigenvals(M; n)`, `eigenvecs(M; n)` and `eigen(M; n)` take an optional count `n`. On this engine
**a positive n returns the n smallest eigenvalues** (in ascending order) and **a negative n returns
the n largest** (largest first). Without `n`, or with `n = 0`, you get all of them, ascending. A plain
matrix that equals its transpose is accepted as it is (see [Deviations](appendix/deviations.md)); the
solvers above are stricter and need the symmetric type. The example copies into `symmetric(3)` only to
show the typed form.

<!-- expect: eigenvals(A) = [ 0.586 2 3.41 ] | eigenvals(A;2) = [ 0.586 2 ] | eigenvals(A;-2) = [ 3.41 2 ] -->
```cpd
A = copy([2; -1; 0|-1; 2; -1|0; -1; 2]; symmetric(3); 1; 1)
eigenvals(A)
eigenvals(A; 2)
eigenvals(A; -2)
```

CalcpadCE's written documentation states the opposite sign convention (positive for the largest), but
its program behaves as shown above, and so does this one. Check a small case before relying on it. The
same holds for hp matrices.

Very large eigenproblems (hundreds of rows) use a different algorithm that returns only a few
eigenvalues; check such results against a smaller model or a full `eigenvals(A)` before you trust them.
