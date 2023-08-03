import fs from 'fs';

import {getTempDir} from './utils.js';

let logHandle: number | null = null;
let _alsoStderr = false;

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

export function log(message: string) {
  // TODO(danvk): figure out how to use a jest mock
  if ((global as any).__TEST__) {
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
  if (logHandle !== null) {
    fs.closeSync(logHandle);
  }
}
