import {matchAndExtract} from './utils.js';
import {Processor} from './code-sample.js';
import {generateIdMetadata} from './metadata.js';

const EXTRACT_BACKTICKS = /```(tsx|ts)/;
const EXTRACT_ID = /\[\[([^\]]*)\]\]/;
const EXTRACT_SOURCE = /\[source,(ts|js)\]/;
const EXTRACT_DIRECTIVE = /^\/\/ verifier:(.*)$/;
const TOP_HEADER = /^={1,3} (.*)$/;

export function extractAsciidocSamples(sourceFile: string, text: string, p: Processor) {
  let isIgnoringFencedCodeBlocks = false;
  const lines = text.split('\n');

  const extractCodeSample = (i: number, until: string) => {
    i += 1;
    const startLine = i;
    p.setLineNum(startLine);

    for (; i < lines.length && lines[i] !== until; i++);

    const content = lines.slice(startLine, i).join('\n');
    if (until === '++++' && content.includes(`<pre data-type="programlisting">&gt; `)) {
      p.setNextLanguage('node');
    }
    p.addSample(content);

    return i;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const id = matchAndExtract(EXTRACT_ID, line);
    const language = matchAndExtract(EXTRACT_SOURCE, line);
    const header = matchAndExtract(TOP_HEADER, line);
    const directive = matchAndExtract(EXTRACT_DIRECTIVE, line);

    if (id) {
      p.setNextId(generateIdMetadata(id, sourceFile, i));
    } else if (language) {
      p.setNextLanguage(language);
    } else if (header) {
      p.setHeader(header);
    } else if (directive) {
      if (directive === 'ignore-fenced-codeblocks') {
        isIgnoringFencedCodeBlocks = true;
      } else {
        p.setDirective(directive);
      }
    } else {
      const matches = matchAndExtract(EXTRACT_BACKTICKS, line);
      if (matches) {
        if (!isIgnoringFencedCodeBlocks) {
          p.setNextLanguage(matches);
          i = extractCodeSample(i, '```');
        }
      } else if (line === '----') {
        i = extractCodeSample(i, '----');
      } else if (line === '++++') {
        i = extractCodeSample(i, '++++');
      }

      p.resetWithNormalLine();
    }
  }
}
