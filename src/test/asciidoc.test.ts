import fs from 'fs';
import glob from 'fast-glob';
import path from 'path';

import {dedent, getTempDir} from '../utils.js';
import {extractSamples} from '../code-sample.js';
import {baseExtract} from './common.js';
import {Processor} from '../processor.js';
import ts from 'typescript';
import {flushLog, getTestLogs} from '../logger.js';

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
    const inputFiles = glob.sync('./src/test/inputs/*.asciidoc');

    for (const inputFile of inputFiles) {
      const {base, name} = path.parse(inputFile);
      expect(extractSamples(fs.readFileSync(inputFile, 'utf8'), name, base)).toMatchSnapshot(name);
    }
  });

  test('basic', () => {
    expect(extractSamples(ASCII_DOC1, 'doc1', 'source.asciidoc')).toEqual([
      {
        ...baseExtract,
        language: 'ts',
        descriptor: './source.asciidoc:5',
        lineNumber: 7,
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
        descriptor: './source.asciidoc:11',
        id: 'noid-11',
        lineNumber: 10,
        content: `console.log('Hello', 'TS');`,
      },
    ]);
  });

  test('skip directive', () => {
    expect(extractSamples(ASCIIDOC_SKIP, 'skip', 'source.asciidoc')).toMatchObject([
      {
        skip: true,
      },
    ]);
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
        descriptor: './source.asciidoc:3',
        lineNumber: 5,
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
        descriptor: './source.asciidoc:11',
        lineNumber: 13,
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
        descriptor: './source.asciidoc:28',
        lineNumber: 30,
        id: 'prepended-with-ids',
        content: `console.log(a);`,
        prefixes: [{id: 'prefix'}, {id: 'combined'}],
      },
    ]);
  });

  test('prepend-subset-of-id', () => {
    const samples = extractSamples(
      dedent`
  [[type-and-func]]
  [source,ts]
  ----
  type ABC = 'A' | 'B' | 'C';
  function foo() {}
  ----

  // verifier:prepend-subset-of-id-to-following:type-and-func:1-1
  [source,ts]
  ----
  function foo(abc: ABC) {}
  ----
  `,
      'prepend-subset-of-id',
      'source.asciidoc',
    );
    expect(samples.slice(-1)).toEqual([
      {
        ...baseExtract,
        language: 'ts',
        descriptor: './source.asciidoc:11',
        lineNumber: 10,
        id: 'prepend-subset-of-id-11',
        content: `function foo(abc: ABC) {}`,
        prefixes: [{id: 'type-and-func', lines: [1, 1]}],
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
        descriptor: './source.asciidoc:2',
        lineNumber: 4,
        id: 'tsx-example',
        content: `console.log(a);`,
        isTSX: true,
      },
    ]);
  });

  test('done-with-file', () => {
    expect(
      extractSamples(
        dedent`
    // verifier:done-with-file
    [source,ts]
    ----
    console.log(a);
    ----

    and:
    [source,ts]
    ----
    const x = 12;
    ----

    // verifier:reset
    [[back-in-business]]
    [source,ts]
    ----
    const backInBusiness = 23;
    ----
    `,
        'done-with-file',
        'source.asciidoc',
      ).slice(-1),
    ).toEqual([
      {
        ...baseExtract,
        language: 'ts',
        descriptor: './source.asciidoc:14',
        lineNumber: 16,
        id: 'back-in-business',
        content: `const backInBusiness = 23;`,
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
        descriptor: './source.asciidoc:5',
        lineNumber: 4,
        id: 'header-reset-5',
        sectionHeader: 'Chapter 1',
        language: 'ts',
        content: `const x = 12;`,
      },
      {
        ...baseExtract,
        descriptor: './source.asciidoc:12',
        id: 'header-reset-12',
        lineNumber: 11,
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
        descriptor: './source.asciidoc:5',
        lineNumber: 4,
        id: 'header-reset-5',
        sectionHeader: 'Chapter 1',
        language: 'ts',
        content: `const x = 12;`,
      },
      {
        ...baseExtract,
        descriptor: './source.asciidoc:11',
        id: 'header-reset-11',
        lineNumber: 10,
        sectionHeader: 'Chapter 1',
        language: 'ts',
        content: `const x = 12;`,
        prefixes: [
          {
            id: 'header-reset-5',
          },
        ],
      },
    ]);

    expect(
      extractSamples(
        dedent`
      == Chapter 1
      // verifier:done-with-file
      [source,ts]
      ----
      const x = 12;
      ----

      == Chapter 2
      [source,ts]
      ----
      const x = 12;
      ----
    `,
        'header-reset-done-with-file',
        'source.asciidoc',
      ),
    ).toEqual([
      {
        ...baseExtract,
        content: 'const x = 12;',
        descriptor: './source.asciidoc:5',
        id: 'header-reset-done-with-file-5',
        language: 'ts',
        lineNumber: 4,
        replacementId: undefined,
        sectionHeader: 'Chapter 1',
        skip: true,
      },
      {
        ...baseExtract,
        descriptor: './source.asciidoc:11',
        lineNumber: 10,
        id: 'header-reset-done-with-file-11',
        sectionHeader: 'Chapter 2',
        language: 'ts',
        content: `const x = 12;`,
        prefixes: [],
        skip: false,
      },
    ]);
  });
});

describe('checker', () => {
  afterEach(() => {
    flushLog();
  });

  const curDir = path.resolve(process.cwd());
  const scrubTimingText = (line: string) =>
    line
      .replace(/(\d+) ms/, '--- ms')
      .replace(getTempDir(), 'TMPDIR')
      .replace(curDir, 'CWD');

  const config = ts.parseJsonConfigFileContent(
    {
      compilerOptions: {
        strictNullChecks: true,
        module: 'commonjs',
        esModuleInterop: true,
      },
    },
    ts.sys,
    process.cwd(),
  );
  const host = ts.createCompilerHost(config.options, true);

  test.each([
    './src/test/inputs/commented-sample-with-error.asciidoc',
    './src/test/inputs/president.asciidoc',
    './src/test/inputs/equivalent.asciidoc',
    './src/test/inputs/empty-twoslash.asciidoc',
    './src/test/inputs/prepend-and-skip.asciidoc',
    './src/test/inputs/program-listing.asciidoc',
    './src/test/inputs/prepend-as-file.asciidoc',
    './src/test/inputs/check-jsonc.asciidoc',
    './src/test/inputs/express.asciidoc',
    './src/test/inputs/node-output.asciidoc',
    './src/test/inputs/twoslash-assertion.asciidoc',
    './src/test/inputs/issue-235.asciidoc',
    './src/test/inputs/top-level-await.asciidoc',
  ])(
    'asciidoc checker snapshots %p',
    async inputFile => {
      const statuses: string[] = [];

      const processor = new Processor(
        {
          alsologtostderr: false,
          filter: undefined,
          nocache: true,
          replacements: undefined,
          _: [],
          $0: 'test',
        },
        {
          host,
          options: config.options,
        },
        {},
      );
      processor.onSetStatus(status => {
        statuses.push(status);
      });
      await processor.processSourceFile(inputFile, 1, 1);
      expect({
        logs: getTestLogs().map(scrubTimingText),
        statuses,
      }).toMatchSnapshot(inputFile);
    },
    40_000,
  );
});
