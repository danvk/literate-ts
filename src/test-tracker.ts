import {log, isLoggingToStderr} from './logger';
import {IdMetadata} from './types';

let currentFile: string;
let currentSampleId: IdMetadata | undefined;
let sampleStartMs: number;
const results: {[file: string]: {[id: string]: number}} = {};

export function startFile(file: string) {
  log(`---- BEGIN FILE ${file}\n`);
  currentFile = file;
  results[currentFile] = {};
}

export function finishFile() {
  log(`---- END FILE ${currentFile}\n`);
  currentFile = '';
  currentSampleId = undefined;
}

export function startSample(sampleId: IdMetadata) {
  currentSampleId = sampleId;
  results[currentFile][currentSampleId.key] = 0;
  sampleStartMs = Date.now();
  log(`BEGIN #${sampleId.key}\n`);
}

export function finishSample() {
  const elapsedMs = Date.now() - sampleStartMs;
  log(`\nEND #${currentSampleId!.key} (${elapsedMs} ms)\n`);
  currentSampleId = undefined;
}

export function fail(message: string, sampleId?: IdMetadata) {
  if (sampleId === undefined) {
    sampleId = currentSampleId;
  }

  const fullMessage = `${currentSampleId?.descriptor}: ${message}`;
  if (!isLoggingToStderr()) {
    console.error('\n' + fullMessage);
  }
  log(fullMessage);
  if (!(global as any).__TEST__) {
    results[currentFile][currentSampleId!.key]++;
  }
}

export function getTestResults() {
  return results;
}
