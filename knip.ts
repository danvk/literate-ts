import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['index.ts'],
  project: ['src/**/*.ts'],
  ignore: [],
  ignoreBinaries: [],
  ignoreExportsUsedInFile: true,
  ignoreDependencies: [
  ],
};

export default config;
