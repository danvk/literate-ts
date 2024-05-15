import {readFile, writeFile} from 'fs/promises';
import path from 'path';

import {getTempDir} from '../utils.js';
import {Processor} from '../processor.js';
import ts from 'typescript';
import {flushLog, getTestLogs} from '../logger.js';

const ALL_TESTS = [
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
  './src/test/inputs/augment-dom.asciidoc',
  './src/test/inputs/error-start-of-line.asciidoc',
  './src/test/inputs/check-emit.asciidoc',
  './src/test/inputs/long-lines.asciidoc',
  './src/test/inputs/unaligned-error.asciidoc',
  './src/test/inputs/playground.asciidoc',
];

export function testsForShard(shard: number, total: number) {
  return ALL_TESTS.filter((t, i) => i % total === shard);
}

export function checkerTest(shard: number, total: number) {
  const shardTests = testsForShard(shard, total);

  describe('checker baselines', () => {
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

    test.each(shardTests)(
      'asciidoc checker snapshots %p',
      async inputFile => {
        const {name} = path.parse(inputFile);
        const statuses: string[] = [];
        const testPlayground = name.includes('playground');

        const processor = new Processor(
          {
            alsologtostderr: false,
            filter: undefined,
            nocache: true,
            replacements: undefined,
            _: [],
            $0: 'test',
            playground: testPlayground,
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
        const logs = getTestLogs().map(scrubTimingText);

        const logFile = `src/test/baselines/${name}.log.txt`;
        const statusFile = `src/test/baselines/${name}.status.txt`;
        const playFile = `src/test/baselines/${name}.playground.json`;
        const logText = logs.join('\n') + '\n';
        const statusText = statuses.join('\n') + '\n';
        const playText = JSON.stringify(processor.playgrounds, null, 2);

        if (process.env.UPDATE_MODE) {
          await writeFile(logFile, logText, 'utf-8');
          await writeFile(statusFile, statusText, 'utf-8');
          await writeFile(playFile, playText, 'utf-8');
        }

        const expectedLogs = await readFile(logFile, 'utf-8');
        expect(logText).toEqual(expectedLogs);
        const expectedStatuses = await readFile(statusFile, 'utf-8');
        expect(statusText).toEqual(expectedStatuses);
        if (testPlayground) {
          const expectedPlayground = await readFile(playFile, 'utf-8');
          expect(playText).toEqual(expectedPlayground);
        }
      },
      40_000,
    );
  });
}
