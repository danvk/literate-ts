import {matchAndExtract} from './utils';
import {Processor} from './code-sample';
import {generateIdMetadata} from './metadata';

const EXTRACT_BACKTICKS = /```(tsx|ts)/;
const EXTRACT_ID = /\[\[([^\]]*)\]\]/;
const EXTRACT_SOURCE = /\[source,(ts|js)\]/;
const EXTRACT_DIRECTIVE = /^\/\/ verifier:(.*)$/;
const TOP_HEADER = /^={1,3} (.*)$/;

export function extractAsciidocSamples(sourceFile: string, text: string, p: Processor) {
  const lines = text.split('\n');

  const extractCodeSample = (i: number, until: string) => {
    i += 1;
    const startLine = i;
    p.setLineNum(startLine);

    for (; i < lines.length && lines[i] !== until; i++);

    const content = lines.slice(startLine, i).join('\n');
    p.addSample(content);

    return i;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idRaw = matchAndExtract(EXTRACT_ID, line);
    const language = matchAndExtract(EXTRACT_SOURCE, line);
    const header = matchAndExtract(TOP_HEADER, line);
    const directive = matchAndExtract(EXTRACT_DIRECTIVE, line);

    if (idRaw) {
      p.setNextId(generateIdMetadata(idRaw, sourceFile, i));
    } else if (language) {
      p.setNextLanguage(language);
    } else if (header) {
      p.setHeader(header);
    } else if (directive) {
      p.setDirective(directive);
    } else {
      const matches = matchAndExtract(EXTRACT_BACKTICKS, line);
      if (matches) {
        p.setNextLanguage(matches);
        i = extractCodeSample(i, '```');
      } else if (line === '----') {
        i = extractCodeSample(i, '----');
      }

      p.resetWithNormalLine();
    }
  }
}
