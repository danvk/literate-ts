import fs from 'fs';
import {readFile, writeFile} from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

import {extractSamples} from '../code-sample.js';

const TEST_DIR = 'src/test/inputs';
const asciidocFiles = fs
  .readdirSync(TEST_DIR, {recursive: true})
  .filter((path): path is string => typeof path === 'string')
  .filter(path => path.endsWith('.asciidoc'))
  .map(p => path.join(TEST_DIR, p));

const markdownFiles = fs
  .readdirSync(TEST_DIR, {recursive: true})
  .filter((path): path is string => typeof path === 'string')
  .filter(path => path.endsWith('.md'))
  .map(p => path.join(TEST_DIR, p));

describe('asciidoc extract baselines', () => {
  it.each(asciidocFiles.map(file => [file]))('snapshot: %s', async inputFile => {
    if (inputFile.includes('duplicate')) {
      return; // this one throws and is tested separately in asciidoc.test.ts
    }
    const {base, name} = path.parse(inputFile);
    const content = await readFile(inputFile, 'utf8');
    const samples = extractSamples(content, name, base);
    const sampleTxt = yaml.dump(samples, {noRefs: true});
    const baselineFile = `src/test/baselines/${name}.extract.yaml`;
    if (process.env.UPDATE_MODE) {
      await writeFile(baselineFile, sampleTxt, 'utf-8');
    }
    const expected = await readFile(baselineFile, 'utf-8');
    expect(sampleTxt).toEqual(expected);
  });
});

describe('markdown extract baselines', () => {
  it.each(markdownFiles.map(file => [file]))('snapshot: %s', async inputFile => {
    const {base, name} = path.parse(inputFile);
    const content = await readFile(inputFile, 'utf8');
    const samples = extractSamples(content, name, base);
    const sampleTxt = yaml.dump(samples, {noRefs: true});
    const baselineFile = `src/test/baselines/${name}.md.extract.yaml`;
    if (process.env.UPDATE_MODE) {
      await writeFile(baselineFile, sampleTxt, 'utf-8');
    }
    const expected = await readFile(baselineFile, 'utf-8');
    expect(sampleTxt).toEqual(expected);
  });
});
