import {
  stripSource,
  applyPrefixes,
  extractSamples,
  applyReplacements,
  addResolvedChecks,
} from '../code-sample.js';
import {PrefixedCodeSample} from '../types.js';
import {dedent} from '../utils.js';
import {baseExtract, baseSample} from './common.js';

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
    expect(applyPrefixes(extractSamples(ASCIIDOC_PREPEND, 'prepend', 'source.asciidoc'))).toEqual([
      {
        ...baseSample,
        descriptor: './source.asciidoc:4',
        lineNumber: 6,
        language: 'ts',
        id: 'prefix',
        content: `type AB = 'a' | 'b';`,
      },
      {
        ...baseSample,
        descriptor: './source.asciidoc:10',
        lineNumber: 12,
        prefixesLength: 1,
        language: 'ts',
        id: 'combined',
        content: dedent`
          type AB = 'a' | 'b';
          const a: AB = 'a';`,
      },
      {
        ...baseSample,
        descriptor: './source.asciidoc:18',
        lineNumber: 20,
        language: 'ts',
        id: 'final',
        content: `const a: AB = 'a';`,
      },
    ]);
  });

  test('multiple prepend directives', () => {
    expect(
      applyPrefixes(extractSamples(ASCIIDOC_PREPEND_MULTIPLE, 'mpd', 'source.asciidoc')),
    ).toEqual([
      {
        ...baseSample,
        descriptor: './source.asciidoc:5',
        lineNumber: 4,
        language: 'ts',
        id: 'mpd-5',
        content: `type AB = 'a' | 'b';`,
      },
      {
        ...baseSample,
        descriptor: './source.asciidoc:11',
        lineNumber: 10,
        language: 'ts',
        id: 'mpd-11',
        prefixesLength: 1,
        content: dedent`
          type AB = 'a' | 'b';
          type ABC = AB | 'c';`,
      },
      {
        ...baseSample,
        descriptor: './source.asciidoc:16',
        lineNumber: 15,
        prefixesLength: 2,
        language: 'ts',
        id: 'mpd-16',
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
        descriptor: './source.asciidoc:2',
        lineNumber: 4,
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
        descriptor: './source.asciidoc:11',
        lineNumber: 13,
        language: 'ts',
        id: 'b',
        prefixesLength: 3,
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
        descriptor: './source.asciidoc:2',
        lineNumber: 4,
        language: 'js',
        id: 'a',
        content: dedent`
          import _ from 'lodash';
          const p = {name: 'Bob'};
          const x = 12;`,
      },
      {
        ...baseSample,
        descriptor: './source.asciidoc:10',
        lineNumber: 12,
        language: 'ts',
        id: 'b',
        prefixesLength: 2,
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
        descriptor: './source.asciidoc:2',
        lineNumber: 4,
        language: 'ts',
        id: 'hello',
        content: `console.log('Hello');`,
      },
      {
        ...baseSample,
        descriptor: './source.asciidoc:9',
        lineNumber: 10,
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

describe('applyReplacements', () => {
  const foo: PrefixedCodeSample = {
    ...baseExtract,
    language: 'ts',
    descriptor: './source.asciidoc:4',
    id: 'foo',
    content: '',
    prefixesLength: 0,
    lineNumber: 4,
  };

  const compressed = dedent`
  function foo() {
    // ...
  }
  const x = foo();`;
  const full = dedent`
  function foo() {
    // COMPRESS
    return 1 + 2 + 3;
    // END
  }
  const x = foo();`;

  it('should apply external replacements', () => {
    expect(
      applyReplacements(
        [
          {
            ...foo,
            content: compressed,
          },
        ],
        {
          foo: full,
        },
      ),
    ).toEqual([
      {
        ...foo,
        content: full,
      },
    ]);
  });

  it('should apply inline replacements', () => {
    expect(
      applyReplacements(
        [
          {
            ...foo,
            content: compressed,
            replacementId: 'replace',
          },
          {
            ...foo,
            id: 'replace',
            content: full,
          },
        ],
        {},
      ),
    ).toEqual([
      {
        ...foo,
        content: full,
      },
      {
        ...foo,
        id: 'replace',
        content: full,
      },
    ]);
  });
});

describe('addResolvedChecks', () => {
  it('should leave most code samples alone', () => {
    const sample = applyPrefixes(
      extractSamples(
        dedent`
          [source,ts]
          ----
          interface Point {
            x: number;
            y: number;
          }
          type T = keyof Point;
          //   ^? type T = keyof Point
          ----
          `,
        'equivalent-assertion',
        'source.asciidoc',
      ),
    );
    expect(addResolvedChecks(sample[0])).toEqual(sample[0]);
  });

  it('should patch a code sample with an "equivalent to" assertion', () => {
    const sample = applyPrefixes(
      extractSamples(
        dedent`
          [source,ts]
          ----
          interface Point {
            x: number;
            y: number;
          }
          type T = keyof Point;
          //   ^? type T = keyof Point (equivalent to "x" | "y")
          ----
          `,
        'equivalent-assertion',
        'source.asciidoc',
      ),
    );
    expect(addResolvedChecks(sample[0]).content).toEqual(
      dedent`
      interface Point {
        x: number;
        y: number;
      }
      type T = keyof Point;
      //   ^? type T = keyof Point
      type Resolve<Raw> = Raw extends Function ? Raw : {[K in keyof Raw]: Raw[K]};
      type SynthT = Resolve<T>;
      //   ^? type SynthT = "x" | "y"
      `,
    );
  });

  it('should patch a type assertion in a larger code sample', () => {
    const sample = applyPrefixes(
      extractSamples(
        dedent`
          This is also a helpful mindset with finite sets, such as the ones you might get from
          \`keyof T\`, which returns type for just the keys of an object type:

          // verifier:reset
          [[sort-by]]
          [source,ts]
          ----
          interface Point {
            x: number;
            y: number;
          }
          type PointKeys = keyof Point;
          //   ^? type PointKeys = keyof Point (equivalent to "x" | "y")

          function sortBy<K extends keyof T, T>(vals: T[], key: K): T[] {
            // ...
          }
          const pts: Point[] = [{x: 1, y: 1}, {x: 2, y: 0}];
          sortBy(pts, 'x');  // OK, 'x' extends 'x'|'y' (aka keyof T)
          sortBy(pts, 'y');  // OK, 'y' extends 'x'|'y'
          sortBy(pts, Math.random() < 0.5 ? 'x' : 'y');  // OK, 'x'|'y' extends 'x'|'y'
          sortBy(pts, 'z');
                   // ~~~ Type '"z"' is not assignable to parameter of type '"x" | "y"
          ----

          The set interpretation also makes more sense when you have types whose relationship
          isn't strictly hierarchical.
        `,
        'equivalent-assertion',
        'source.asciidoc',
      ),
    );

    expect(addResolvedChecks(sample[0]).content).toEqual(dedent`
      interface Point {
        x: number;
        y: number;
      }
      type PointKeys = keyof Point;
      //   ^? type PointKeys = keyof Point

      function sortBy<K extends keyof T, T>(vals: T[], key: K): T[] {
        // ...
      }
      const pts: Point[] = [{x: 1, y: 1}, {x: 2, y: 0}];
      sortBy(pts, 'x');  // OK, 'x' extends 'x'|'y' (aka keyof T)
      sortBy(pts, 'y');  // OK, 'y' extends 'x'|'y'
      sortBy(pts, Math.random() < 0.5 ? 'x' : 'y');  // OK, 'x'|'y' extends 'x'|'y'
      sortBy(pts, 'z');
               // ~~~ Type '"z"' is not assignable to parameter of type '"x" | "y"
      type Resolve<Raw> = Raw extends Function ? Raw : {[K in keyof Raw]: Raw[K]};
      type SynthPointKeys = Resolve<PointKeys>;
      //   ^? type SynthPointKeys = "x" | "y"
      `);
  });

  it('should patch a type assertion split across lines', () => {
    const sample = applyPrefixes(
      extractSamples(
        dedent`
          You can also split the assertion onto another line:

          [source,ts]
          ----
          type T2 = keyof Point;
          //   ^? type T2 = keyof Point
          //      (equivalent to "x" | "y")
          ----
        `,
        'equivalent-assertion',
        'source.asciidoc',
      ),
    );

    expect(addResolvedChecks(sample[0]).content).toEqual(dedent`
      type T2 = keyof Point;
      //   ^? type T2 = keyof Point
      type Resolve<Raw> = Raw extends Function ? Raw : {[K in keyof Raw]: Raw[K]};
      type SynthT2 = Resolve<T2>;
      //   ^? type SynthT2 = "x" | "y"
      `);
  });

  it('should patch a type assertion on a value', () => {
    const sample = applyPrefixes(
      extractSamples(
        dedent`
          You can use the same pattern with values as well as types:

          [source,ts]
          ----
          function foo(pt: Point) {
            let k: keyof Point;
            for (k in pt) {
              // ^? let k: keyof Point (equivalent to "x" | "y")
            }
          }
          ----
        `,
        'equivalent-assertion',
        'source.asciidoc',
      ),
    );

    const actual = addResolvedChecks(sample[0]).content;
    expect(actual).toEqual(dedent`
      function foo(pt: Point) {
        let k: keyof Point;
        for (k in pt) {
          // ^? let k: keyof Point
        }
      }
      type Resolve<Raw> = Raw extends Function ? Raw : {[K in keyof Raw]: Raw[K]};
      type SynthK = Resolve<keyof Point>;
      //   ^? type SynthK = "x" | "y"
      `);
  });
});
