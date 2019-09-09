import { log, isLoggingToStderr } from "./logger";

let currentFile: string;
let currentSampleId: string;
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
  currentSampleId = '';
}

export function startSample(sampleId: string) {
  currentSampleId = sampleId;
  results[currentFile][currentSampleId] = 0;
  sampleStartMs = Date.now();
  log(`BEGIN #${sampleId}\n`);
}

export function finishSample() {
  const elapsedMs = Date.now() - sampleStartMs;
  log(`\nEND #${currentSampleId} (${elapsedMs} ms)\n`);
  currentSampleId = '';
}

export function fail(message: string) {
  const fullMessage = `${currentFile} ${currentSampleId}: ${message}`;
  if (!isLoggingToStderr()) {
    console.error(fullMessage);
  }
  log(fullMessage);
  if (!(global as any).__TEST__) {
    results[currentFile][currentSampleId]++;
  }
}

export function getTestResults() {
  return results;
}
