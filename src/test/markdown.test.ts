import fs from 'fs';

import { extractMarkdownSamples } from "../markdown";

describe('markdown', () => {
  it('should match snapshots', () => {
    const dir = './src/test/inputs';

    // TODO(danvk): use a glob here
    const inputs = [
      'doc1',
      'noid',
      'prepend',
      'prepend-multiple',
      'skip',
    ];

    for (const input of inputs) {
      expect(
        extractMarkdownSamples(
          fs.readFileSync(`${dir}/${input}.md`, 'utf8'),
          input,
          `${input}.md`,
        ),
      ).toMatchSnapshot(input);
    }
  });
});
