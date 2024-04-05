import fs from 'fs';

import {extractSamples} from '../code-sample.js';

test('duplicate throws', () => {
  const inputFile = './src/test/inputs/duplicate-ids.asciidoc';
  const contents = fs.readFileSync(inputFile, 'utf8');
  expect(() => extractSamples(contents, 'duplicate-ids', 'duplicate-ids.asciidoc')).toThrow(
    'Duplicate ID: example',
  );
});
