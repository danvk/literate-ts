// Shared test code

export const baseSample = {
  tsOptions: {},
  nodeModules: [],
  isTSX: false,
  checkJS: false,
  sectionHeader: null,
  sourceFile: 'source.asciidoc',
  prefixesLength: 0,
};

export const baseExtract = {
  ...baseSample,
  prefixes: [],
};
