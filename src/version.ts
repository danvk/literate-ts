import path from 'path';

const packagePath = path.join(
  __dirname,
  // The path to package.json is slightly different when you run via ts-node
  __dirname.includes('dist') ? '../../package.json' : '../package.json',
);

export const VERSION = require(packagePath).version;
