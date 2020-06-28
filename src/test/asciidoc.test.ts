import fs from 'fs';

import {dedent} from '../utils';
import {extractSamples} from '../code-sample';
import {baseExtract} from './common';

const ASCII_DOC1 = `

For instance, this is a valid TypeScript program:

[[greet-ts]]
[source,ts]
----
function greet(who: string) {
  console.log('Hello', who);
}
----

But when you run this through a program like \`node\` that expects JavaScript, you'll get an error:

----
function greet(who: string) {
                  ^

SyntaxError: Unexpected token :
----

`;

const ASCIIDOC_NO_ID = `
blah blah

[source,js]
----
console.log('Hello', 'node');
----

[source,ts]
----
console.log('Hello', 'TS');
----

`;

const ASCIIDOC_SKIP = `

// verifier:skip (this isn't really TypeScript)
[source,ts]
----
keyof A&B = (keyof A) | (keyof B)
----
`;

const ASCIIDOC_PREPEND = `

// verifier:prepend-to-following
[[prefix]]
[source,ts]
----
type AB = 'a' | 'b';
----

[[combined]]
[source,ts]
----
const a: AB = 'a';
----

// verifier:reset

[[final]]
[source,ts]
----
const a: AB = 'a';
----
`;

describe('extractSamples', () => {
  test('snapshot', () => {
    const dir = './src/test/inputs';

    // TODO(danvk): use a glob here
    const inputs = ['doc1', 'noid', 'prepend', 'prepend-multiple', 'skip'];

    for (const input of inputs) {
      expect(
        extractSamples(
          fs.readFileSync(`${dir}/${input}.asciidoc`, 'utf8'),
          input,
          `${input}.asciidoc`,
        ),
      ).toMatchSnapshot(input);
    }
  });

  test('basic', () => {
    expect(extractSamples(ASCII_DOC1, 'doc1', 'source.asciidoc')).toEqual([
      {
        ...baseExtract,
        language: 'ts',
        id: 'greet-ts',
        content: dedent`
          function greet(who: string) {
            console.log('Hello', who);
          }`,
      },
    ]);
  });

  test('no ID', () => {
    // Only the TypeScript sample gets extracted (may want to revisit this).
    expect(extractSamples(ASCIIDOC_NO_ID, 'noid', 'source.asciidoc')).toEqual([
      {
        ...baseExtract,
        language: 'ts',
        id: 'noid-10',
        content: `console.log('Hello', 'TS');`,
      },
    ]);
  });

  test('skip directive', () => {
    expect(extractSamples(ASCIIDOC_SKIP, 'skip', 'source.asciidoc')).toEqual([]);
  });

  test('tsconfig directive', () => {
    expect(
      extractSamples(
        dedent`
    // verifier:tsconfig:noImplicitAny=false
    // verifier:tsconfig:strictNullChecks=false
    [[implicit-any]]
    [source,ts]
    ----
    const x: number = null;
    ----

    // verifier:tsconfig:noImplicitAny=true
    // verifier:tsconfig:strictNullChecks=true
    [[strict]]
    [source,ts]
    ----
    const x: number = null;
    ----

    `,
        'tsconfig',
        'source.asciidoc',
      ),
    ).toEqual([
      {
        ...baseExtract,
        language: 'ts',
        id: 'implicit-any',
        content: `const x: number = null;`,
        tsOptions: {
          noImplicitAny: false,
          strictNullChecks: false,
        },
      },
      {
        ...baseExtract,
        language: 'ts',
        id: 'strict',
        content: `const x: number = null;`,
        tsOptions: {
          noImplicitAny: true,
          strictNullChecks: true,
        },
      },
    ]);
  });

  test('prepend-with-id', () => {
    expect(
      extractSamples(
        ASCIIDOC_PREPEND +
          '\n' +
          dedent`
    // verifier:reset

    // verifier:prepend-id-to-following:prefix
    // verifier:prepend-id-to-following:combined
    [[prepended-with-ids]]
    [source,ts]
    ----
    console.log(a);
    ----
    `,
        'prepend-with-id',
        'source.asciidoc',
      ).slice(-1),
    ).toEqual([
      {
        ...baseExtract,
        language: 'ts',
        id: 'prepended-with-ids',
        content: `console.log(a);`,
        prefixes: [{id: 'prefix'}, {id: 'combined'}],
      },
    ]);
  });

  test('next-is-tsx', () => {
    expect(
      extractSamples(
        dedent`
    // verifier:next-is-tsx
    [[tsx-example]]
    [source,ts]
    ----
    console.log(a);
    ----
    `,
        'tsx-example',
        'source.asciidoc',
      ).slice(-1),
    ).toEqual([
      {
        ...baseExtract,
        language: 'ts',
        id: 'tsx-example',
        content: `console.log(a);`,
        isTSX: true,
      },
    ]);
  });

  test('header resets', () => {
    expect(
      extractSamples(
        dedent`
      == Chapter 1
      // verifier:prepend-to-following
      [source,ts]
      ----
      const x = 12;
      ----

      [[chapter-2]]
      == Chapter 2
      [source,ts]
      ----
      const x = 12;
      ----
    `,
        'header-reset',
        'source.asciidoc',
      ),
    ).toEqual([
      {
        ...baseExtract,
        id: 'header-reset-4',
        sectionHeader: 'Chapter 1',
        language: 'ts',
        content: `const x = 12;`,
      },
      {
        ...baseExtract,
        id: 'header-reset-11',
        sectionId: 'chapter-2',
        sectionHeader: 'Chapter 2',
        language: 'ts',
        content: `const x = 12;`,
      },
    ]);

    expect(
      extractSamples(
        dedent`
      == Chapter 1
      // verifier:prepend-to-following
      [source,ts]
      ----
      const x = 12;
      ----

      ==== Chapter 2
      [source,ts]
      ----
      const x = 12;
      ----
    `,
        'header-reset',
        'source.asciidoc',
      ),
    ).toEqual([
      {
        ...baseExtract,
        id: 'header-reset-4',
        sectionHeader: 'Chapter 1',
        language: 'ts',
        content: `const x = 12;`,
      },
      {
        ...baseExtract,
        id: 'header-reset-10',
        sectionHeader: 'Chapter 1',
        language: 'ts',
        content: `const x = 12;`,
        prefixes: [
          {
            id: 'header-reset-4',
          },
        ],
      },
    ]);
  });
});
