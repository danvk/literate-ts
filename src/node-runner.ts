import {exec} from 'child_process';
import util from 'util';
import {basename} from 'node:path';

import {log} from './logger.js';

export interface ExecErrorType {
  code: number;
  stdout: string;
  stderr: string;
  path: string;
}

/** Run a JavaScript program through Node.js. Returns the output. */
export async function runNode(path: string): Promise<ExecErrorType> {
  try {
    const env = {
      ...process.env,
      FORCE_COLOR: '0', // See https://github.com/jestjs/jest/issues/14391
      NODE_DISABLE_COLORS: '1', // Avoid colorful stack traces
      NODE_OPTIONS: '', // Clear any potential debug options from launch.json
    };
    const {stdout, stderr} = await util.promisify(exec)(`node ${path}`, {
      env,
    });
    return {code: 0, stderr, stdout, path};
  } catch (eIn) {
    const e = eIn as ExecErrorType;
    const {code, stderr, stdout} = e;
    log(`Node exited with error ${e.code} on ${basename(path)}`);
    return {code, stderr, stdout, path};
  }
}
