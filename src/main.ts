import fs from 'fs';
import path, {isAbsolute} from 'path';

import chalk from 'chalk';
import glob from 'fast-glob';
import _ from 'lodash';
import ora from 'ora';
import ts from 'typescript';

import {startLog, flushLog, logFile} from './logger.js';
import {getTestResults} from './test-tracker.js';
import {CACHE_DIR, ConfigBundle} from './ts-checker.js';
import {Processor} from './processor.js';
import {argSchema} from './args.js';

const argv = argSchema.parseSync(process.argv.slice(2));

const sourceFiles = argv._.map(String);
startLog(!!argv.alsologtostderr);

const sources: {[id: string]: string} = {};
if (argv.replacements) {
  for (const filePath of glob.sync(argv.replacements + '/**')) {
    const filename = path.basename(filePath);
    const [noExt, ext] = filename.split('.');
    if (ext === 'txt' || ext === 'js' || ext === 'ts') {
      sources[noExt] = fs.readFileSync(filePath, 'utf8');
    }
  }
}

// TODO(danvk): prefer the tsconfig.json from asciidocs directory
const unParsedConfig = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config || {};
const {options: tsOptions} = ts.parseJsonConfigFileContent(unParsedConfig, ts.sys, process.cwd());

// Some settings should never be inherited from tsconfig.json because they'll
// interfere with literate-ts's ability to execute code samples.
delete tsOptions.outDir;
delete tsOptions.out;
delete tsOptions.outFile;

console.log('Verifying with TypeScript', ts.version);
if (!argv.nocache) {
  console.log('Cache dir:', CACHE_DIR);
} else {
  console.log(chalk.yellow('Skipping cache (--nocache specified)'));
}
const spinner = argv.alsologtostderr ? null : ora('Initializing').start();

const typeScriptBundle: ConfigBundle = {
  options: tsOptions,
  host: ts.createCompilerHost(tsOptions, true),
};

function setStatus(status: string) {
  if (!spinner) return;
  spinner.text = status;
  spinner.render();
}

export function main() {
  const processor = new Processor(argv, typeScriptBundle, sources);
  processor.onSetStatus(setStatus);

  (async () => {
    let n = 0;
    let numFailures = 0;
    let numTotal = 0;
    for (const sourceFile of sourceFiles) {
      await processor.processSourceFile(sourceFile, ++n, sourceFiles.length);
    }

    if (spinner) spinner.stop();

    for (const [file, fileResults] of Object.entries(getTestResults())) {
      const displayPath = isAbsolute(file) ? file : `./${file}`;
      const numPassed = _.sum(_.map(fileResults, n => (n === 0 ? 1 : 0)));
      if (numPassed < _.size(fileResults)) {
        console.log(`${displayPath}`, `${numPassed}/${_.size(fileResults)} passed`);
        for (const [id, failures] of Object.entries(fileResults)) {
          numTotal += 1;
          if (failures > 0) {
            console.log(chalk.red(` ✗ ${id}`));
            numFailures += 1;
          }
        }
      }
    }

    if (numFailures > 0) {
      console.log(chalk.red(`✗ ${numFailures} / ${numTotal} samples failed.`));
      if (!argv.alsologtostderr) {
        console.log(`View detailed logs at ${logFile}`);
      }
    } else {
      console.log(chalk.green(`✓ All ${numTotal} samples passed!`));
    }
  })()
    .catch(e => {
      if (spinner) spinner.stop();
      console.error(e);
    })
    .then(flushLog);
}
