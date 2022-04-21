// Shared test code

export const baseSample = {
  tsOptions: {},
  nodeModules: [],
  isTSX: false,
  checkJS: false,
  sectionHeader: null,
  sourceFile: 'source.asciidoc',
};

export const baseExtract = {
  ...baseSample,
  prefixes: [],
};
