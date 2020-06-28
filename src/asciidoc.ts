import _, {head} from 'lodash';

import {CodeSample, PrefixedCodeSample, Prefix} from './types';
import {matchAndExtract} from './utils';
import {Processor} from './code-sample';

const EXTRACT_ID = /\[\[([^\]]*)\]\]/;
const EXTRACT_SOURCE = /\[source,(ts|js)\]/;
const EXTRACT_DIRECTIVE = /^\/\/ verifier:(.*)$/;
const TOP_HEADER = /^={1,3} (.*)$/;

export function extractAsciidocSamples(text: string, p: Processor) {
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const id = matchAndExtract(EXTRACT_ID, line);
    const language = matchAndExtract(EXTRACT_SOURCE, line);
    const header = matchAndExtract(TOP_HEADER, line);
    const directive = matchAndExtract(EXTRACT_DIRECTIVE, line);

    if (id) {
      p.setNextId(id);
    } else if (language) {
      p.setNextLanguage(language);
    } else if (header) {
      p.setHeader(header);
    } else if (directive) {
      p.setDirective(directive);
    } else {
      if (line === '----') {
        // This is a code sample. Extract it!
        i += 1;
        const startLine = i;
        p.setLineNum(startLine);

        for (; lines[i] !== '----'; i++);

        const content = lines.slice(startLine, i).join('\n');
        p.addSample(content);
      }

      p.resetWithNormalLine();
    }
  }
}
