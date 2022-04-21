import {IdMetadata} from './types';

export function generateIdMetadata(id: string, sourceFile: string, line: number): IdMetadata {
  return {
    descriptor: `./${sourceFile}:${line}`,
    id,
  };
}
