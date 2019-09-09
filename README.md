# literate-ts

Literate TS helps you verify TypeScript code samples in written text (blog posts, books, etc.).

It does this by letting you assert three things:

1. **Expected errors**. To assert the existence of an error, use a comment with a
   squiggly underscore in it:

   ```ts
   let str = 'not a number';
   let num: number = str;
   // ~~~ Type 'string' is not assignable to type 'number'.
   ```

   Literate TS will verify that this error occurs in your code sample, _and no others_.

1. **Types**. To assert that the type of an expression is what you expect, use a comment starting with
   "type is":

   ```ts
   'four score'.split(' ');  // type is string[]
   ```

   Literate TS will verify that the type is precisely what you specify textually, ala [dtslint][].

1. **Output**. To assert the output of a code sample, give it an ID and include a paired one ending
   with `-output`. For example:

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

   Literate TS will convert your code sample to JavaScript, run it and diff the output.

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


[dtslint]: https://github.com/microsoft/dtslint
