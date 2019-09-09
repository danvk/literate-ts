import {exec} from 'child_process';
import util from 'util';

import {log} from './logger';

export interface ExecErrorType {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a JavaScript program through Node.js. Returns the output. */
export async function runNode(path: string): Promise<ExecErrorType> {
  try {
    const {stdout, stderr} = await util.promisify(exec)(`node ${path}`);
    return {code: 0, stderr, stdout};
  } catch (eIn) {
    const e: ExecErrorType = eIn;
    const {code, stderr, stdout} = e;
    log(`Node exited with error ${e.code} on ${path}`);
    return {code, stderr, stdout};
  }
}
