// Shared test code

import {CodeSample} from '../types.js';

export const baseSample = {
  tsOptions: {},
  nodeModules: [],
  isTSX: false,
  checkJS: false,
  sectionHeader: null,
  sourceFile: 'source.asciidoc',
  prefixesLength: 0,
  skip: false,
  targetFilename: null,
  auxiliaryFiles: [],
  inCommentBlock: false,
  originalContent: undefined,
} satisfies Partial<CodeSample>;

export const baseExtract = {
  ...baseSample,
  prefixes: [],
};
