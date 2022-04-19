import {matchAndExtract} from './utils';
import {Processor} from './code-sample';

const EXTRACT_ID = /\[\[([^\]]*)\]\]/;
const EXTRACT_SOURCE = /\[source,(ts|js)\]/;
const EXTRACT_DIRECTIVE = /^\/\/ verifier:(.*)$/;
const TOP_HEADER = /^={1,3} (.*)$/;

export function extractAsciidocSamples(text: string, p: Processor) {
  const lines = text.split('\n');

  function extractCodeSample(i: number, until: string) {
    i += 1;
    const startLine = i;
    p.setLineNum(startLine);

    for (; lines[i] !== until; i++);

    const content = lines.slice(startLine, i).join('\n');
    p.addSample(content);

    return i;
  }

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
      const matches = /```(tsx|ts)/.exec(line);
      if (matches) {
        p.setNextLanguage(matches[1]);
        i = extractCodeSample(i, '```');
      } else if (line === '----') {
        i = extractCodeSample(i, '----');
      }

      p.resetWithNormalLine();
    }
  }
}
