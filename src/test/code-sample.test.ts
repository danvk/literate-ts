import {extractSamples, stripSource, applyPrefixes} from '../code-sample';
import {dedent} from '../utils';

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

const ASCIIDOC_PREPEND_MULTIPLE = `
// verifier:prepend-to-following
[source,ts]
----
type AB = 'a' | 'b';
----

// verifier:prepend-to-following
[source,ts]
----
type ABC = AB | 'c';
----

[source,ts]
----
const c: ABC = 'c';
----
`;

const ASCIIDOC_SKIP = `

// verifier:skip (this isn't really TypeScript)
[source,ts]
----
keyof A&B = (keyof A) | (keyof B)
----
`;

describe('code-sample', () => {
  let baseSample = {
    tsOptions: {},
    nodeModules: [],
    isTSX: false,
    checkJS: false,
  };

  let baseExtract = {
    ...baseSample,
    prefixes: [],
  };

  describe('extractSamples', () => {
    test('basic', () => {
      expect(extractSamples(ASCII_DOC1, 'doc1')).toEqual([
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
      expect(extractSamples(ASCIIDOC_NO_ID, 'noid')).toEqual([
        {
          ...baseExtract,
          language: 'ts',
          id: 'noid-10',
          content: `console.log('Hello', 'TS');`,
        },
      ]);
    });

    test('prepend directive', () => {
      expect(applyPrefixes(extractSamples(ASCIIDOC_PREPEND, 'prepend'))).toEqual([
        {
          ...baseSample,
          language: 'ts',
          id: 'prefix',
          content: `type AB = 'a' | 'b';`,
        },
        {
          ...baseSample,
          language: 'ts',
          id: 'combined',
          content: dedent`
            type AB = 'a' | 'b';
            const a: AB = 'a';`,
        },
        {
          ...baseSample,
          language: 'ts',
          id: 'final',
          content: `const a: AB = 'a';`,
        },
      ]);
    });
  });

  test('multiple prepend directives', () => {
    expect(applyPrefixes(extractSamples(ASCIIDOC_PREPEND_MULTIPLE, 'mpd'))).toEqual([
      {
        ...baseSample,
        language: 'ts',
        id: 'mpd-4',
        content: `type AB = 'a' | 'b';`,
      },
      {
        ...baseSample,
        language: 'ts',
        id: 'mpd-10',
        content: dedent`
          type AB = 'a' | 'b';
          type ABC = AB | 'c';`,
      },
      {
        ...baseSample,
        language: 'ts',
        id: 'mpd-15',
        content: dedent`
          type AB = 'a' | 'b';
          type ABC = AB | 'c';
          const c: ABC = 'c';`,
      },
    ]);
  });

  test('prepend-subset directive', () => {
    expect(
      applyPrefixes(
        extractSamples(
          dedent`
    // verifier:prepend-subset-to-following:1-3
    [[a]]
    [source,ts]
    ----
    interface Person {
      name: string;
    }
    const p: Person = {name: 'Bob'};
    ----

    [[b]]
    [source,ts]
    ----
    const p = {} as Person;
    ----
    `,
          'prepend-subset',
        ),
      ),
    ).toEqual([
      {
        ...baseSample,
        language: 'ts',
        id: 'a',
        content: dedent`
        interface Person {
          name: string;
        }
        const p: Person = {name: 'Bob'};`,
      },
      {
        ...baseSample,
        language: 'ts',
        id: 'b',
        content: dedent`
        interface Person {
          name: string;
        }
        const p = {} as Person;`,
      },
    ]);
  });

  test('prepend-subset-of-js', () => {
    expect(
      applyPrefixes(
        extractSamples(
          dedent`
    // verifier:prepend-subset-to-following:1-2
    [[a]]
    [source,js]
    ----
    import _ from 'lodash';
    const p = {name: 'Bob'};
    const x = 12;
    ----

    [[b]]
    [source,ts]
    ----
    const {name} = p;
    ----
    `,
          'prepend-subset',
        ),
      ),
    ).toEqual([
      {
        ...baseSample,
        language: 'js',
        id: 'a',
        content: dedent`
          import _ from 'lodash';
          const p = {name: 'Bob'};
          const x = 12;`,
      },
      {
        ...baseSample,
        language: 'ts',
        id: 'b',
        content: dedent`
        import _ from 'lodash';
        const p = {name: 'Bob'};
        const {name} = p;`,
      },
    ]);
  });

  test('skip directive', () => {
    expect(extractSamples(ASCIIDOC_SKIP, 'skip')).toEqual([]);
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
});

describe('stripSource', () => {
  test('HIDE..END', () => {
    expect(
      stripSource(dedent`
    // HIDE
    type AB = 'a' | 'b';
    // END
    const a: AB = 'a';`),
    ).toEqual(`const a: AB = 'a';`);
  });

  test('indented HIDE..END', () => {
    expect(
      stripSource(dedent`
      function foo() {
        // HIDE
        type AB = 'a' | 'b';
        // END
        const a: AB = 'a';
      }`),
    ).toEqual(dedent`
      function foo() {
        const a: AB = 'a';
      }`);
  });

  test('multiple HIDE..END', () => {
    expect(
      stripSource(dedent`
    // HIDE
    type AB = 'a' | 'b';
    // END
    const a: AB = 'a';
    // HIDE
    console.log(a);
    // END
    `),
    ).toEqual(`const a: AB = 'a';\n`);
  });

  test('COMPRESS..END', () => {
    expect(
      stripSource(dedent`
      function foo() {
        // COMPRESS
        return 1 + 2 + 3;
        // END
      }
      const x = foo();`),
    ).toEqual(dedent`
      function foo() {
        // ...
      }
      const x = foo();`);
  });

  test('inline COMPRESS..END', () => {
    expect(
      stripSource(dedent`
      function foo() { /* COMPRESS */ return 1 + 2 + 3; /* END */ }
      const x = foo();`),
    ).toEqual(dedent`
      function foo() { /* ... */ }
      const x = foo();`);
  });
});
