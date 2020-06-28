import _ from 'lodash';

import {CodeSample, PrefixedCodeSample, Prefix} from './types';
import {matchAndExtract} from './utils';
import { Processor } from './code-sample';

const EXTRACT_ID = /<!-- #([^ ]+) -->/;
const EXTRACT_DIRECTIVE = /<!-- verifier:(.*) -->/;
const TOP_HEADER = /^#{1,3} (.*)$/;

export function extractMarkdownSamples(text: string, p: Processor) {
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const id = matchAndExtract(EXTRACT_ID, line);
    if (id) {
      p.setNextId(id);
      continue;
    }

    const header = matchAndExtract(TOP_HEADER, line);
    if (header) {
      p.setHeader(header);
      continue;
    }

    const directive = matchAndExtract(EXTRACT_DIRECTIVE, line);
    if (directive) {
      p.setDirective(directive);
      continue;
    }

    if (line.startsWith('```')) {
      const language = line.slice(3);
      p.setNextLanguage(language || null);

      const startLine = i + 1;
      p.setLineNum(startLine);

      i += 1;
      for (; lines[i] !== '```'; i++);

      const content = lines.slice(startLine, i).join('\n');
      p.addSample(content);
    }

    p.resetWithNormalLine();
  }
}
