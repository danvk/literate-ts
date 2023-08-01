import {log, isLoggingToStderr} from './logger';
import {CodeSample} from './types';

let currentFile: string;
let currentSample: CodeSample | undefined;
let sampleStartMs: number;
const results: {[file: string]: {[descriptor: string]: number}} = {};

export function startFile(file: string) {
  log(`---- BEGIN FILE ${file}\n`);
  currentFile = file;
  results[currentFile] = {};
}

export function finishFile() {
  log(`---- END FILE ${currentFile}\n`);
  currentFile = '';
  currentSample = undefined;
}

export function startSample(sample: CodeSample) {
  currentSample = sample;
  results[currentFile][sample.descriptor] = 0;
  sampleStartMs = Date.now();
  log(`BEGIN #${sample.descriptor}\n`);
}

export function finishSample() {
  const elapsedMs = Date.now() - sampleStartMs;
  log(`\nEND #${currentSample!.descriptor} (${elapsedMs} ms)\n`);
  currentSample = undefined;
}

export function fail(message: string, sample?: CodeSample) {
  if (sample === undefined) {
    sample = currentSample;
  }

  const fullMessage = `💥 ${currentSample?.descriptor}: ${message}`;
  if (!isLoggingToStderr()) {
    console.error('\n' + fullMessage);
  }
  log(fullMessage);
  if (!(global as any).__TEST__) {
    results[currentFile][currentSample!.descriptor]++;
  }
}

export function getTestResults() {
  return results;
}
