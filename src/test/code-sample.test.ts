import {stripSource, applyPrefixes} from '../code-sample';
import {dedent} from '../utils';
import { extractSamples } from '../asciidoc';
import { baseSample } from './common';

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

describe('code-sample', () => {
  test('prepend directive', () => {
    expect(applyPrefixes(extractSamples(ASCIIDOC_PREPEND, 'prepend', 'source.asciidoc'))).toEqual(
      [
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
      ],
    );
  });

  test('multiple prepend directives', () => {
    expect(
      applyPrefixes(extractSamples(ASCIIDOC_PREPEND_MULTIPLE, 'mpd', 'source.asciidoc')),
    ).toEqual([
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
          'source.asciidoc',
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
          'source.asciidoc',
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

  test('does not prepend to -output', () => {
    expect(
      applyPrefixes(
        extractSamples(
          dedent`
      // verifier:prepend-to-following
      [[hello]]
      [source,ts]
      ----
      console.log('Hello');
      ----

      This writes:
      [[hello-output]]
      ----
      Hello
      ----
      `,
          'header-reset',
          'source.asciidoc',
        ),
      ),
    ).toEqual([
      {
        ...baseSample,
        language: 'ts',
        id: 'hello',
        content: `console.log('Hello');`,
      },
      {
        ...baseSample,
        language: null,
        id: 'hello-output',
        content: 'Hello',
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
