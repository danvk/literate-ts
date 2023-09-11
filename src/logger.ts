import fs from 'fs';

import {getTempDir} from './utils.js';

let logHandle: number | null = null;
let _alsoStderr = false;

declare global {
  // eslint-disable-next-line no-var
  var __TEST__: boolean;
}

export let logFile: string | null = null;

export function startLog(alsoLogToStderr: boolean) {
  logFile = getTempDir() + '/log.txt';
  console.log(`Logging details to ${logFile}`);
  logHandle = fs.openSync(logFile, 'w');
  _alsoStderr = alsoLogToStderr;
}

export function isLoggingToStderr() {
  return _alsoStderr;
}

let logsForTest: string[] = [];

export function log(message: string) {
  // TODO(danvk): figure out how to use a jest mock
  if (global.__TEST__) {
    logsForTest.push(message);
    console.log(message);
    return;
  }

  if (!logHandle) {
    throw new Error('Did not call startLog() before log()');
  }

  fs.writeSync(logHandle, message + '\n');
  if (_alsoStderr) {
    console.log(message);
  }
}

export function flushLog() {
  if (global.__TEST__) {
    logsForTest = [];
  }

  if (logHandle !== null) {
    fs.closeSync(logHandle);
  }
}

export function getTestLogs() {
  return logsForTest;
}
