import {createHash} from 'crypto';
import fs from 'fs';
import tmp from 'tmp';
import {basename} from 'path';

let _tmpDir: string | null = null;

/** Get a consistent temp dir for the duration of the program */
export function getTempDir(): string {
  if (!_tmpDir) {
    _tmpDir = tmp.dirSync().name;
  }
  return _tmpDir;
}

/** Write a temp file; return the absolute path to it.  */
export function writeTempFile(fileName: string, content: string): string {
  const tmpDir = getTempDir();
  const path = tmpDir + '/' + fileName;
  fs.writeFileSync(path, content, 'utf8');
  return path;
}

export function matchAndExtract(pat: RegExp, text: string): string | null {
  const m = pat.exec(text);
  if (!m) {
    return null;
  }
  return m[1];
}

export function matchAll(pat: RegExp, text: string): RegExpExecArray[] {
  let m: RegExpExecArray | null;
  const out = [];
  while ((m = pat.exec(text)) !== null) {
    out.push(m);
  }
  return out;
}

/** Given "a/b/c/foo.txt", return "foo" */
export function fileSlug(path: string): string {
  const base = basename(path);
  const parts = base.split('.');
  if (parts.length > 1) {
    return parts.slice(0, -1).join('.');
  }
  return base;
}

/**
 * Removes leading indents from a template string without removing all leading whitespace.
 * Based on code from tslint.
 */
export function dedent(strings: TemplateStringsArray, ...values: (string | number)[]) {
  let fullString = strings.reduce((accumulator, str, i) => accumulator + values[i - 1] + str);

  if (fullString[0] === '\n') {
    fullString = fullString.slice(1);
  }

  // match all leading spaces/tabs at the start of each line
  const match = fullString.match(/^[ \t]*(?=\S)/gm);
  if (!match) {
    // e.g. if the string is empty or all whitespace.
    return fullString;
  }

  // find the smallest indent, we don't want to remove all leading whitespace
  const indent = Math.min(...match.map(el => el.length));
  if (indent > 0) {
    const regexp = new RegExp('^[ \\t]{' + indent + '}', 'gm');
    fullString = fullString.replace(regexp, '');
  }
  return fullString;
}

export function sha256(message: string) {
  return createHash('sha256')
    .update(message)
    .digest('hex');
}

export const tuple = <Args extends unknown[]>(...args: Args): Args => args;
