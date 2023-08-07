import path from 'node:path';
import {IdMetadata} from './types.js';

export function generateIdMetadata(id: string, sourceFile: string, line: number): IdMetadata {
  const file = path.isAbsolute(sourceFile) ? sourceFile : `./${sourceFile}`;
  return {
    descriptor: `${file}:${1 + line}`,
    id,
  };
}
