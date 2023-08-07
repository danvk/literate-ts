import {CompilerOptions} from 'typescript';

export interface IdMetadata {
  descriptor: string;
  id: string;
}

export interface CodeSample {
  descriptor: string;
  language: 'js' | 'ts' | null;
  id: string;
  sectionHeader: string | null;
  content: string;
  isTSX: boolean;
  checkJS: boolean;
  tsOptions: CompilerOptions;
  sourceFile: string;
  lineNumber: number;
  nodeModules: readonly string[];
  /** Combined length of prefixes, for offsetting error messages */
  prefixesLength: number;
  output?: SampleOutput;
}

export interface Prefix {
  id: string;
  lines?: number[];
}

export interface PrefixedCodeSample extends CodeSample {
  prefixes: readonly Prefix[];
  replacementId?: string;
}

export interface SampleOutput {
  code: number;
  stdout: string;
  stderr: string;
  path: string;
}
