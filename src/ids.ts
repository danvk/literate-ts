import {IdMetadata} from './types';

export function generateId(idRaw: string, sourceFile: string, line: number): IdMetadata {
  return {
    descriptor: `./${sourceFile}:${line}`,
    key: idRaw,
  };
}
