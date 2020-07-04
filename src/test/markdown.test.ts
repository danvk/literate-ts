import fs from 'fs';
import glob from 'glob';
import path from 'path';

import {extractSamples} from '../code-sample';

describe('markdown', () => {
  it('should match snapshots', () => {
    const inputFiles = glob.sync('./src/test/inputs/*.md');

    for (const inputFile of inputFiles) {
      const {base, name} = path.parse(inputFile);
      expect(extractSamples(fs.readFileSync(inputFile, 'utf8'), name, base)).toMatchSnapshot(name);
    }
  });
});
