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
  nodeModules: readonly string[];
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
