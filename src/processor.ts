import fs from 'fs';
import {dirname, isAbsolute} from 'path';

import {applyPrefixes, extractSamples, applyReplacements} from './code-sample.js';
import {fileSlug, writeTempFile} from './utils.js';
import {log} from './logger.js';
import {startFile, fail, finishFile, finishSample, startSample} from './test-tracker.js';
import {CodeSample} from './types.js';
import {ConfigBundle, checkTs} from './ts-checker.js';
import {runNode} from './node-runner.js';
import {Args} from './args.js';
import _ from 'lodash';

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
  } else {
    log('Actual output matched expected.');
  }
}

async function checkSample(
  sample: CodeSample,
  idToSample: {[id: string]: CodeSample},
  argv: Args,
  typeScriptBundle: ConfigBundle,
) {
  const {id, language} = sample;
  const {content} = sample;
  startSample(sample);

  if (language === 'ts' || (language === 'js' && sample.checkJS)) {
    const result = await checkTs(sample, id + '-output' in idToSample, typeScriptBundle, {
      skipCache: !!argv.nocache,
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
    }
  }
  finishSample();
}

// TODO: move these functions into a class to capture shared state
export async function processSourceFile(
  path: string,
  fileNum: number,
  outOf: number,
  argv: Args,
  typeScriptBundle: ConfigBundle,
  sources: {[id: string]: string},
  setStatus: (status: string) => void,
) {
  const displayPath = isAbsolute(path) ? path : `./${path}`;
  const fileStatus = `${fileNum}/${outOf}: ${displayPath}`;
  setStatus(fileStatus);
  startFile(path);

  const text = fs.readFileSync(path, 'utf-8');

  const rawSamples = extractSamples(text, fileSlug(path), path);
  log(`Found ${rawSamples.length} code samples in ${path}`);

  const replacedSamples = applyReplacements(rawSamples, sources);
  const samples = applyPrefixes(replacedSamples);

  const outputs = _.keyBy(samples, 'id');
  for (const [i, sample] of Object.entries(samples)) {
    const n = 1 + Number(i);
    if (argv.filter && !sample.id.startsWith(argv.filter)) {
      continue;
    }
    setStatus(`${fileStatus}: ${n}/${samples.length} ${sample.descriptor}`);
    await checkSample(sample, outputs, argv, typeScriptBundle);
  }

  finishFile();
}
