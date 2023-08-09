import _ from 'lodash';
import {log, isLoggingToStderr} from './logger.js';
import {CodeSample} from './types.js';

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
  lastFailReason = null;
}

export interface FailureLocation {
  line: number;
  start: number;
  end: number;
}

export interface FailureContext {
  sample?: CodeSample;
  location?: FailureLocation;
}

let lastFailReason: {message: string; location?: FailureLocation} | null = null;
export function fail(message: string, context: FailureContext = {}) {
  let {sample} = context;
  if (sample === undefined) {
    sample = currentSample;
  }
  lastFailReason = {message, location: context.location};

  let {location} = context;
  if (location && sample) {
    // Change to a location in the source file.
    // If this is outside the code sample then fall back to reporting the error at the start.
    const offset = location.line - sample.prefixesLength;
    if (offset >= 0) {
      // The +1 is for 1-based line numbers.
      location = {...location, line: sample.lineNumber + offset + 1};
    } else {
      location = undefined;
    }
  }

  const fullMessage = location
    ? `💥 ${sample?.sourceFile}:${location.line}:${1 + location.start}-${
        1 + location.end
      }: ${message}`
    : `💥 ${sample?.descriptor}: ${message}`;
  if (!isLoggingToStderr()) {
    console.error('\n' + fullMessage);
  }
  log(fullMessage);
  if (!(global as any).__TEST__) {
    results[currentFile][sample!.descriptor]++;
  }
}

export function getLastFailReason() {
  return lastFailReason;
}

export function getTestResults() {
  return results;
}
