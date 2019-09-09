import {CompilerOptions} from 'typescript';

export interface CodeSample {
  language: 'js' | 'ts' | null;
  id: string;
  content: string;
  isTSX: boolean;
  checkJS: boolean;
  tsOptions: CompilerOptions;
  nodeModules: readonly string[];
  output?: SampleOutput;
}

export interface Prefix {
  id: string;
  lines?: number[];
}

export interface PrefixedCodeSample extends CodeSample {
  prefixes: readonly Prefix[];
}

export interface SampleOutput {
  code: number;
  stdout: string;
  stderr: string;
}
