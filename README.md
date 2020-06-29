# literate-ts

Literate TS statically checks TypeScript code samples in written text (blog posts, books, etc.).
It was developed and used to type check [_Effective TypeScript_][ets] (O'Reilly 2019) as well
as the companion blog, [effectivetypescript.com][etsblog].

## Quickstart

    $ npm install -D typescript literate-ts
    $ literate-ts path/to/posts/*.md

TypeScript is a peer dependency of literate-ts, so you'll need to install it yourself.
It's done this way so that you're in control of the TypeScript version.
(Checking for breakages when you update TS is one of the main uses cases of literate-ts.)

## What does this check?

Literate TS checks three sorts of things.

1. **Expected errors**. To assert the existence of an error, use a comment with a
   squiggly underscore in it:

   ```ts
   let str = 'not a number';
   let num: number = str;
   // ~~~ Type 'string' is not assignable to type 'number'.
   ```

   Literate TS will verify that this error occurs in your code sample, _and no others_.
   In other words, with no error annotations, literate-ts verifies that there are no errors.

2. **Types**. To assert that the type of an expression is what you expect, use a comment starting with
   "type is":

   ```ts
   'four score'.split(' ');  // type is string[]
   ```

   Literate TS will verify that the type is precisely what you specify textually, ala [dtslint][].

3. **Output**. To assert the output of a code sample, give it an ID and include a paired one ending
   with `-output`. In Asciidoc, for example:

   ```asciidoc
   [[sample]]
   [source,ts]
   ----
   console.log('Hello');
   ----

   [[sample-output]]
   ....
   Hello
   ....
   ```

   Literate TS will convert your code sample to JavaScript, run it through Node and diff the output.
   You can use this to create something like a unit test for your code samples.

## Why do this?

You ran your code samples through the TypeScript playground when you wrote them.
Why bother spending the time writing just the right set of directives and comments to get them
running through literate-ts?

I wondered this myself while writing [_Effective TypeScript_][ets], but eventually this tool
demonstrated its value many times over.

The arguments for using it are similar to those for writing tests or using TypeScript itself:

1. **Safe ~refactoring~ editing** Your code samples type checked when you wrote them. But then you,
   your co-author or your editor went and changed things. Maybe you renamed a variable or function
   in one sample and didn't update it in subsequent samples. Maybe you deleted the definition of a
   function that you referenced later. Literate TS found a few errors the first time through
   [_Effective TypeScript_][ets], but I can't recall a single edit I made that didn't trigger a
   verification failure.

2. **Damage control with new TypeScript releases** As Anders has said, semantic versioning in
   TypeScript is pretty meaningless because the whole _point_ of new releases is to break your code
   (or, rather, to reveal that it was already broken). When the next TypeScript release comes out,
   are you going to re-run all your code samples through it? With Literate TS this is easy. For
   reference, TypeScript 3.8 broke two of the 600 samples in [_Effective TypeScript_][ets]. I fixed
   them and did a new release. Nothing broke with TypeScript 3.9. In both cases, it was a tremendous
   relief to know exactly what the damage was, or to know that there was no damage at all.

3. **Comleteness**. You ran your code samples through TypeScript, but did you actually run all of
   them? Maybe you forgot one. Literate TS won't! Even the process of figuring out which code
   samples need to be prepended to others to form a valid compilation unit is helpful. If you can't
   create one, or the sequence is too elaborate, then something's probably wrong.

4. **Practicing what you preach** If you're writing a book or blog about TypeScript, you're probably
   already bought into the value of static analysis. Doing static analysis on your book is very much
   in the spirit of TypeScript!

## Source formats

literate-ts supports both Asciidoc and Markdown sources. The syntax used for each is slightly different.

### Markdown

Only fenced code blocks are supported in Markdown sources. For a source to be checked, it needs to
have its language marked as "ts" or "js":

    Here's a TypeScript code sample:

    ```ts
    let num = 10;  // type is number
    ```

To give a code sample an ID, use an HTML comment starting with a `#`:

    This sample has an ID of `Point`:

    <!-- #Point -->
    ```ts
    type Point = [number, number];
    ```

To pass a directive to the verifier, e.g. to tell it to concatenate sources, add an HTML comment
starting with `verifier:` immediately before the sample. For example:

    We can define a type using `interface`:

    <!-- verifier:prepend-to-following -->
    ```ts
    interface Student {
       name: string;
       age: number;
    }
    ```

    And then create objects of that type:

    ```ts
    const student: Student = { name: 'Bobby Droppers', age: 12 };
    ```

See below for a complete list of directives.

### Asciidoc

[Asciidoc] is a bit like Markdown, but more flexible and complicated.
In particular O'Reilly [uses it][atlas-asciidoc] in their [Atlas] publishing system.
Any recent O'Reilly book (including [_Effective TypeScript_][ets]) is written in Asciidoc.
GitHub also provides a rich display for Asciidoc source files.

In Asciidoc, code samples are marked with `----` or `....`. Samples must be marked
with `[source,ts]` to be checked, or `[source,js]` to be run through Node.

Directives begin with `// verifier`. For example:

    // verifier:prepend-to-following
    [source,ts]
    ----
    interface Student {
       name: string;
       age: number;
    }
    ----

    [source,ts]
    ----
    const student: Student = { name: 'Bobby Droppers', age: 12 };
    ----

See below for a complete list of directives.

### List of verifier directives

See above for how to give directive to literate-ts in your source format.

<dl>
  <dt>verifier:skip</dt>
  <dd>Don't verify the next code sample.</dd>
  <dt>verifier:reset</dt>
  <dd>Reset everything, particularly the set of prefixes being prepended.</dd>
  <dt>verifier:prepend-to-following</dt>
  <dd>
    In addition to verifying the next sample, prepend it to all following code samples
    (until a `reset`). If this is used on multiple code samples in sequence, they are prepended
    in the order they appear in the source file (i.e. the second sample comes after the first).
  </dd>
  <dt>verifier:prepend-subset-to-following:A-B</dt>
  <dd>
    In addition to verifying the next sample, prepend lines A-B from it (1-based)
    to the following samples. Useful if you want to define two things, A and B, in the first sample,
    then replace only B in the following sample.
  </dd>
  <dt>verifier:prepend-id-to-following:ID</dt>
  <dd>
    Start prepending a sample from earlier in the source file. Useful to reestablish some
    context after a `reset`.
  </dd>
  <dt>verifier:tsconfig:setting=value</dt>
  <dd>
    Set a tsconfig setting for the next code sample, e.g. `strictNullChecks=false`.
    These accumulate until the next `reset` directive.
  </dd>
  <dt>verifier:check-js</dt>
  <dd>
    Run the following sample with lang=JS through `tsc`.
    This is mostly useful for samples using the `// @ts-check` directive.
  </dd>
  <dt>verifier:next-is-tsx</dt>
  <dd>Put the next sample in a `.tsx` file, e.g. if it uses JSX syntax.</dd>
  <dt>include-node-module:module-name</dt>
  <dd>
    Make `module-name` available during type checking for subsequent sample
    (until the next `reset`). This module must also be installed in the source file's
    `node_modules` directory. Particularly useful with `@types`, e.g.
    `verifier:include-node-module:@types/lodash`.
  </dd>
</dl>

### Replacements

Sometimes you don't want to show the full implementation of a function. For example:

```ts
function computeSHA512(text: string): number {
  // ...
}
```

The implementation is hidden, but unfortunately so is the `return` statement, which means that
this won't type check (`tsc` complains that it returns `void` but is declared to return `number`).

Literate TS supports this through "replacements": if you give the code sample an ID of `sha512`
(see above for how to do this in Markdown and Asciidoc formats) then you can put something like
this in a file called `sha512.ts`:

```ts
function computeSHA512(text: string): number {
  // COMPRESS
  return 0;
  // END
}
```

Obviously this isn't a real implementation but it will make the type checker happy. You tell
Literate TS about this by passing a `replacements` directory via the `-r` flag:

    $ literate-ts -r path/to/replacements path/to/posts/*.md

The correspondence between replacements and their sources is checked and must be precise. In
addition to `COMPRESS...END`, you can also use `HIDE...END` to completely remove code. Of course,
be careful not to mislead the reader when you do this.
(This syntax comes from [pyliterate][pylit-post].)

## Development

Quickstart:

    $ yarn
    $ yarn ts-node index.ts examples/asciidoc/sample.asciidoc
    Logging details to /var/folders/st/8n5l6s0139x5dwpxfhl0xs3w0000gn/T/tmp-96270LdwL51L23N9D/log.txt
    Verifying with TypeScript 3.6.2
    examples/asciidoc/sample.asciidoc 5/5 passed
     ✓ sample-6
     ✓ sample-17
     ✓ sample-25
     ✓ sample-32
     ✓ sample-41
    ✓ All samples passed!
    ✨  Done in 9.24s.

Publish a new version:

    $ vim package.json # update version
    $ yarn test
    $ tsc
    $ npm publish

## References

- [Testing Types: An Introduction to dtslint][tsconf] (29m20s) -
  Talk I gave at tsconf 2019 which discusses an early version of literate-ts.
- Brett Slatkin's [pyliterate], which was the inspiration for this tool.
  See also his [post][pylit-post] on how pyliterate fit into his writing workflow.
- [Literate Programming][lp] - A programming paradigm introduced by Don Knuth in which code is
  interspersed in text, rather than comments being interspersed in code.

[dtslint]: https://github.com/microsoft/dtslint
[ets]: https://amzn.to/38s1oCK
[asciidoc]: https://asciidoc.org/
[atlas-asciidoc]: https://docs.atlas.oreilly.com/writing_in_asciidoc.html
[atlas]: https://atlas.oreilly.com/
[tsconf]: https://www.youtube.com/watch?v=nygcFEwOG8w
[pyliterate]: https://github.com/bslatkin/pyliterate
[lp]: https://en.wikipedia.org/wiki/Literate_programming
[etsblog]: https://effectivetypescript.com/
[pylit-post]: https://www.onebigfluke.com/2014/07/how-im-writing-programming-book.html
