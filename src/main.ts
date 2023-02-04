import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import glob from 'glob';
import _ from 'lodash';
import ora from 'ora';
import ts from 'typescript';
import yargs from 'yargs';

import {checkSource, applyPrefixes, extractSamples} from './code-sample';
import {startLog, log, flushLog, logFile} from './logger';
import {runNode} from './node-runner';
import {
  getTestResults,
  startFile,
  fail,
  finishFile,
  finishSample,
  startSample,
} from './test-tracker';
import {checkTs, ConfigBundle} from './ts-checker';
import {CodeSample} from './types';
import {getTempDir, writeTempFile, fileSlug} from './utils';

const packagePath = path.join(__dirname, '../../package.json');

const argv = yargs
  .strict()
  .demandCommand(1, 'Must specify path to at least one source file.')
  .options({
    replacements: {
      type: 'string',
      description:
        'If specified, load **/*.{ts,js,txt} under this directory' +
        'as additional sources. See README for details on how to use these.',
      alias: 'r',
    },
    filter: {
      type: 'string',
      description: 'Only check IDs with the given prefix',
      alias: 'f',
    },
    alsologtostderr: {
      type: 'boolean',
      description: 'Log to stderr in addition to a log file',
    },
  })
  .version(
    'version',
    [
      `literate-ts version: ${require(packagePath).version}`,
      `TypeScript version: ${ts.version}`,
    ].join('\n'),
  )
  .parse();

const sourceFiles = argv._;
startLog(!!argv.alsologtostderr);

const sources: {[id: string]: string} = {};
if (argv.replacements) {
  for (const filePath of glob.sync(argv.replacements + '/**')) {
    const filename = path.basename(filePath);
    const [noExt, ext] = filename.split('.');
    if (ext === 'txt' || ext === 'js' || ext === 'ts') {
      sources[noExt] = fs.readFileSync(filePath, 'utf8');
    }
  }
}

// TODO(danvk): prefer the tsconfig.json from asciidocs directory
const unParsedConfig = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config || {};
const {options: tsOptions} = ts.parseJsonConfigFileContent(unParsedConfig, ts.sys, process.cwd());

console.log('Verifying with TypeScript', ts.version);
const spinner = argv.alsologtostderr ? null : ora('Initializing').start();

const typeScriptBundle: ConfigBundle = {
  options: tsOptions,
  host: ts.createCompilerHost(tsOptions, true),
};

function checkOutput(expectedOutput: string, input: CodeSample) {
  const actualOutput = input.output;
  if (!actualOutput) {
    fail(`Sample ${input.id} was not run or produced no output.`);
    return;
  }

  // Remove stack traces from output
  const tmpDir = getTempDir();
  const checkOutput = (actualOutput.stderr + actualOutput.stdout)
    .split('\n')
    .filter(line => !line.startsWith('    at ')) // prune stack traces to one line
    .filter(line => !line.match(/^Node.js v18.8.0/)) // Newer versions of Node log a version number
    // Remove temp paths which vary from run to run.
    .map(line => (tmpDir ? line.replace('/private' + tmpDir, '').replace(tmpDir, '') : line))
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
  }
}

async function checkSample(sample: CodeSample, idToSample: {[id: string]: CodeSample}) {
  const {id, language} = sample;
  const {content} = sample;
  startSample(id);

  if (language === 'ts' || (language === 'js' && sample.checkJS)) {
    await checkTs(sample, id + '-output' in idToSample, typeScriptBundle);
  } else if (language === 'js') {
    // Run the sample through Node and record the output.
    const path = writeTempFile(id + '.js', content);
    const output = await runNode(path);
    idToSample[id].output = output;

    // It's OK for a JS sample to fail, but only if its output is in another sample.
    if (output.code !== 0 && !idToSample[id + '-output']) {
      fail(`Node exited with code ${output.code} but there is no corresponding -output sample.`);
    } else {
      log(`Node exited with code ${output.code}`);
    }
  } else if (language === null && id.endsWith('-output')) {
    // Verify the output of a previous code sample.
    const inputId = id.split('-output')[0];
    const input = idToSample[inputId];
    if (!input) {
      fail(`No paired input: #${inputId}`);
    } else {
      checkOutput(content, input);
      log('Actual output matched expected.');
    }
  }
  finishSample();
}

function setStatus(status: string) {
  if (!spinner) return;
  spinner.text = status;
  spinner.render();
}

async function processSourceFile(path: string, fileNum: number, outOf: number) {
  const fileStatus = `${fileNum}/${outOf}: ${path}`;
  setStatus(fileStatus);
  startFile(path);

  const text = fs.readFileSync(path, 'utf-8');

  const rawSamples = extractSamples(text, fileSlug(path), path);
  log(`Found ${rawSamples.length} code samples in ${path}`);

  for (const sample of rawSamples) {
    const {id} = sample;
    const source = sources[id];
    if (source) {
      checkSource(sample, source);
    }
  }
  const samples = applyPrefixes(rawSamples, sources);

  const outputs = _.keyBy(samples, 'id');
  for (const [i, sample] of Object.entries(samples)) {
    const n = 1 + Number(i);
    if (argv.filter && !sample.id.startsWith(argv.filter)) {
      continue;
    }
    setStatus(`${fileStatus}: ${n}/${samples.length} ${sample.id}`);
    await checkSample(sample, outputs);
  }

  finishFile();
}

export function main() {
  (async () => {
    let n = 0;
    let numFailures = 0;
    let numTotal = 0;
    for (const sourceFile of sourceFiles) {
      await processSourceFile(sourceFile, ++n, sourceFiles.length);
    }

    if (spinner) spinner.stop();

    for (const [file, fileResults] of Object.entries(getTestResults())) {
      const numPassed = _.sum(_.map(fileResults, n => (n === 0 ? 1 : 0)));
      console.log(file, `${numPassed}/${_.size(fileResults)} passed`);
      for (const [id, failures] of Object.entries(fileResults)) {
        numTotal += 1;
        if (failures > 0) {
          console.log(chalk.red(` ✗ ${id}`));
          numFailures += 1;
        }
      }
    }

    if (numFailures > 0) {
      console.log(chalk.red(`✗ ${numFailures} / ${numTotal} samples failed.`));
      if (!argv.alsologtostderr) {
        console.log(`View detailed logs at ${logFile}`);
      }
    } else {
      console.log(chalk.green(`✓ All ${numTotal} samples passed!`));
    }
  })()
    .catch(e => {
      if (spinner) spinner.stop();
      console.error(e);
    })
    .then(flushLog);
}
