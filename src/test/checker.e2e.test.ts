import {readFile, writeFile} from 'fs/promises';
import path from 'path';

import {getTempDir} from '../utils.js';
import {Processor} from '../processor.js';
import ts from 'typescript';
import {flushLog, getTestLogs} from '../logger.js';

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
    './src/test/inputs/augment-dom.asciidoc',
    './src/test/inputs/error-start-of-line.asciidoc',
    './src/test/inputs/check-emit.asciidoc',
    './src/test/inputs/long-lines.asciidoc',
  ])(
    'asciidoc checker snapshots %p',
    async inputFile => {
      const {name} = path.parse(inputFile);
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
      const logs = getTestLogs().map(scrubTimingText);

      const logFile = `src/test/baselines/${name}.log.txt`;
      const statusFile = `src/test/baselines/${name}.status.txt`;
      const logText = logs.join('\n') + '\n';
      const statusText = statuses.join('\n') + '\n';

      if (process.env.UPDATE_MODE) {
        await writeFile(logFile, logText, 'utf-8');
        await writeFile(statusFile, statusText, 'utf-8');
      }

      const expectedLogs = await readFile(logFile, 'utf-8');
      expect(logText).toEqual(expectedLogs);
      const expectedStatuses = await readFile(statusFile, 'utf-8');
      expect(statusText).toEqual(expectedStatuses);
    },
    40_000,
  );
});
