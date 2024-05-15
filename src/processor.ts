import fs from 'fs';
import {ParseError, parse as parseJSONC, printParseErrorCode} from 'jsonc-parser';
import {dirname, isAbsolute, resolve} from 'path';

import {
  applyPrefixes,
  extractSamples,
  applyReplacements,
  addResolvedChecks,
} from './code-sample.js';
import {fileSlug, reduceIndentation, writeTempFile} from './utils.js';
import {log} from './logger.js';
import {startFile, fail, finishFile, finishSample, startSample} from './test-tracker.js';
import {CodeSample, PlaygroundEntry} from './types.js';
import {ConfigBundle, checkProgramListing, checkTs} from './ts-checker.js';
import {runNode} from './node-runner.js';
import {Args} from './args.js';
import _ from 'lodash';
import {NormalizedReadResult, readPackageUpSync} from 'read-pkg-up';
import {htmlToText} from 'html-to-text';
import {getPlaygroundUrl} from './playground.js';

function checkOutput(expectedOutput: string, input: CodeSample) {
  const actualOutput = input.output;
  if (!actualOutput) {
    fail(`Sample ${input.id} was not run or produced no output.`);
    return;
  }

  // Remove stack traces from output
  const tmpDir = dirname(actualOutput.path);
  const checkOutput = (actualOutput.stderr + actualOutput.stdout)
    .split('\n')
    .filter(line => !line.startsWith('    at ')) // prune stack traces to one line
    .filter(line => !line.match(/^Node.js v\d+/)) // Newer versions of Node log a version number
    // Remove temp paths which vary from run to run.
    .filter(line => !tmpDir || !line.includes(tmpDir))
    .join('\n')
    .trim();
  // remove markers
  expectedOutput = expectedOutput
    .split('\n')
    .filter(line => line !== '// HIDE' && line !== '// END')
    .join('\n')
    .trim();

  if (expectedOutput !== checkOutput) {
    fail(`Actual output from Node did not match expected output.`);
    log('Expected:');
    log(expectedOutput);
    log('----');
    log('Actual:');
    log(checkOutput);
    log('----');
  } else {
    log('Actual output matched expected.');
  }
}

function checkEmitOutput(expectedOutput: string, input: CodeSample) {
  const actualOutput = input.output?.stdout;
  if (!actualOutput) {
    fail(`Sample ${input.id} was not run or produced no output.`);
    return;
  }
  // TS output uses a four-space indent. Standardize on two-space indent instead.
  const checkOutput = reduceIndentation(actualOutput.trim());

  if (expectedOutput !== checkOutput) {
    fail(`Actual JS emit did not match expected JS.`);
    log('Expected:');
    log(expectedOutput);
    log('----');
    log('Actual:');
    log(checkOutput);
    log('----');
  } else {
    log('Actual JS emit matched expected.');
  }
}

function checkLineLengths(sample: CodeSample, printWidth: number) {
  if (sample.inCommentBlock) {
    return; // no need to run cosmetic checks on commented-out code samples.
  }
  let content = sample.originalContent ?? sample.content;
  if (sample.language === 'node') {
    // program listing, need to strip HTML to get displayed line length.
    content = htmlToText(content);
  }
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    line = lines[i].trimEnd();
    if (line.length > printWidth) {
      fail(`Line too long: ${line.length} > ${printWidth}`, {
        location: {line: i + sample.prefixesLength, start: printWidth, end: line.length},
      });
    }
  });
}

export class Processor {
  argv: Args;
  typeScriptBundle: ConfigBundle;
  sources: {[id: string]: string};
  setStatus: (status: string) => void;
  playgrounds: PlaygroundEntry[];

  constructor(argv: Args, typeScriptBundle: ConfigBundle, sources: {[id: string]: string}) {
    this.argv = argv;
    this.typeScriptBundle = typeScriptBundle;
    this.sources = sources;
    this.setStatus = _.noop;
    this.playgrounds = [];
  }

  onSetStatus(setStatus: (status: string) => void) {
    this.setStatus = setStatus;
  }

  async processSourceFile(path: string, fileNum: number, outOf: number) {
    const displayPath = isAbsolute(path) ? path : `./${path}`;
    const fileStatus = `${fileNum}/${outOf}: ${displayPath}`;
    this.setStatus(fileStatus);
    startFile(path);

    const text = fs.readFileSync(path, 'utf-8');

    const rawSamples = extractSamples(text, fileSlug(path), path);
    log(`Found ${rawSamples.length} code samples in ${path}`);

    const replacedSamples = applyReplacements(rawSamples, this.sources);
    const samples = applyPrefixes(replacedSamples).map(addResolvedChecks);

    const sourceFileAbsPath = resolve(process.cwd(), path);
    const pkg = readPackageUpSync({cwd: sourceFileAbsPath});

    const outputs = _.keyBy(samples, 'id');
    for (const [i, sample] of Object.entries(samples)) {
      const n = 1 + Number(i);
      if (this.argv.filter && !sample.id.startsWith(this.argv.filter)) {
        continue;
      }
      this.setStatus(`${fileStatus}: ${n}/${samples.length} ${sample.descriptor}`);
      await this.checkSample(sample, outputs, pkg);
      if (this.argv.playground) {
        this.addPlayground(path, sample);
      }
    }

    finishFile();
  }

  async checkSample(
    sample: CodeSample,
    idToSample: {[id: string]: CodeSample},
    pkg: NormalizedReadResult | undefined,
  ): Promise<void> {
    const {id, language, content, skip} = sample;
    if (skip) {
      return;
    }
    startSample(sample);

    if (language === 'ts' || (language === 'js' && sample.checkJS)) {
      const shouldRun = `${id}-output` in idToSample;
      const shouldEmit = `${id}-emit-js` in idToSample;
      if (shouldRun && shouldEmit) {
        fail(`Cannot both run and check emitted JS`);
      }
      const outputMode = shouldRun ? 'run' : shouldEmit ? 'emit' : false;
      const result = await checkTs(sample, outputMode, this.typeScriptBundle, {
        skipCache: !!this.argv.nocache,
      });
      if (result.output !== undefined) {
        sample.output = result.output;
      }
    } else if (language === 'js') {
      // Run the sample through Node and record the output.
      const path = writeTempFile(id + '.js', content);
      const output = await runNode(path);
      idToSample[id].output = output;

      // It's OK for a JS sample to fail, but only if its output is in another sample.
      if (output.code !== 0 && !idToSample[`${id}-output`]) {
        fail(`Node exited with code ${output.code} but there is no corresponding -output sample.`);
      } else {
        log(`Node exited with code ${output.code}`);
      }

      if (id.endsWith('-emit-js')) {
        // Verify the generated JS for a previous code sample.
        const inputId = id.split('-emit-js')[0];
        const input = idToSample[inputId];
        if (!input) {
          fail(`No paired input: #${inputId}`);
        } else {
          checkEmitOutput(content, input);
        }
      }
    } else if (language === 'node') {
      // Node.js CLI "program listing"
      await checkProgramListing(sample, this.typeScriptBundle);
    } else if (language === 'json') {
      const errors: ParseError[] = [];
      parseJSONC(sample.content, errors);
      if (errors.length) {
        const errorsTxt = errors.map(e => printParseErrorCode(e.error));
        const warning =
          sample.prefixesLength > 0 ? ' (prefixes are active, try adding a reset)' : '';
        fail(`Invalid JSONC${warning}: ${errorsTxt}`);
      }
    } else if (language === null && id.endsWith('-output')) {
      // Verify the output of a previous code sample.
      const inputId = id.split('-output')[0];
      const input = idToSample[inputId];
      if (!input) {
        fail(`No paired input: #${inputId}`);
      } else {
        checkOutput(content, input);
      }
    }

    const printWidth = pkg?.packageJson.prettier?.printWidth;
    if (printWidth) {
      checkLineLengths(sample, printWidth);
    }

    finishSample();
  }

  addPlayground(sourceFile: string, sample: CodeSample) {
    const {language, tsOptions} = sample;
    if (sample.skip || sample.inCommentBlock || (language !== 'ts' && language !== 'js')) {
      return;
    }
    this.playgrounds.push({
      displayedCode: sample.originalContent ?? sample.content,
      id: sample.id,
      sourceFile,
      sourceLineNumber: sample.lineNumber,
      language,
      tsOptions,
      playgroundUrl: getPlaygroundUrl(sample.content + '\n', tsOptions),
    });
  }
}
