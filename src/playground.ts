/** Generate TypeScript Playground URLs */

import lzString from 'lz-string';
import {CompilerOptions, version} from 'typescript';

export function getPlaygroundUrl(
  source: string,
  options: CompilerOptions,
  tsVersion = version,
): string {
  const code = lzString.compressToBase64(source);
  // Options are passed as URL components: exactOptionalPropertyTypes=true
  // Enum options are passed numerically: target=9&module=1
  // at least at the moment, the target setting doesn't seem to work.
  // language comes out as "filetype=js"
  const strOptions: [string, string][] = [['ts', tsVersion]];
  for (const [key, val] of Object.entries(options)) {
    let v;
    if (typeof val === 'string') {
      v = val;
    } else if (typeof val === 'boolean' || typeof val === 'number') {
      v = String(val);
    }
    if (v !== undefined) {
      strOptions.push([key, v]);
    }
  }
  console.log(strOptions);
  const params = new URLSearchParams(strOptions).toString();
  return `https://www.typescriptlang.org/play/?${params}#code/${code}`;
}
