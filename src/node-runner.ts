import {exec, spawnSync} from 'child_process';
import util from 'util';

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
    const {stdout, stderr} = await util.promisify(exec)(`node ${path}`);
    return {code: 0, stderr, stdout, path};
  } catch (eIn) {
    const e = eIn as ExecErrorType;
    const {code, stderr, stdout} = e;
    log(`Node exited with error ${e.code} on ${path}`);
    return {code, stderr, stdout, path};
  }
}

export function runNodeRepl(commands: string[]): ExecErrorType {
  const result = spawnSync('node', ['--interactive'], {input: commands.join('\n')});
  if (result.error) {
    console.error(result.error);
  }
  return {
    code: result.status!,
    stdout: result.stdout.toString('utf-8'),
    stderr: result.stderr.toString('utf-8'),
    path: '',
  };
}
