import {CompilerOptions} from 'typescript';

export interface CodeSample {
  language: 'js' | 'ts' | null;
  id: string;
  sectionId: string | null;
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
}

export interface SampleOutput {
  code: number;
  stdout: string;
  stderr: string;
}
