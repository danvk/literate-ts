import {CompilerOptions} from 'typescript';

export interface IdMetadata {
  descriptor: string;
  id: string;
}

export interface CodeSample {
  /** file.ext:line for this code sample */
  descriptor: string;
  language: 'js' | 'ts' | 'node' | 'json' | null;
  /** either user-supplied sample ID or file-line */
  id: string;
  sectionHeader: string | null;
  content: string;
  isTSX: boolean;
  checkJS: boolean;
  tsOptions: CompilerOptions;
  sourceFile: string;
  lineNumber: number;
  /** Is this code sample in a commented-out block? (Disables cosmetic checks.) */
  inCommentBlock: boolean;
  nodeModules: readonly string[];
  /** If set, write this sample to a file with the given name instead of prepending. */
  targetFilename: string | null;
  auxiliaryFiles: AuxiliaryFile[];
  /** Combined length of prefixes, for offsetting error messages */
  prefixesLength: number;
  skip: boolean;
  output?: SampleOutput;
  /** The raw content of the code sample (if different than content) */
  originalContent?: string;
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

export interface AuxiliaryFile {
  filename: string;
  content: string;
}

export interface PlaygroundEntry {
  displayedCode: string;
  playgroundUrl: string;
  id: string;
  sourceFile: string;
  sourceLineNumber: number;
  language: CodeSample['language'];
  tsOptions: CompilerOptions;
}
