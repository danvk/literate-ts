import _ from 'lodash';

import {CodeSample, PrefixedCodeSample} from './types';
import {log} from './logger';
import {fail} from './test-tracker';
import { extractAsciidocSamples } from './asciidoc';
import { extractMarkdownSamples } from './markdown';

/** Apply HIDE..END and COMPRESS..END directives */
export function stripSource(source: string) {
  // g = match all
  // m = make ^ match at the start of lines (not just start of string)
  // s = let . match newlines
  return source
    .replace(/^ *\/\/ HIDE.*?^ *\/\/ END\n?/gms, '')
    .replace(/^( *\/\/) COMPRESS.*?^\1 END/gms, '$1 ...')
    .replace(/\/\* COMPRESS .* END \*\//g, '/* ... */');
}

/**
 * Verify that the sample in the book matches the alternative in the file.
 *
 * The idea is that the version in the file is an expanded version of what's in the book,
 * something that can actually be run.
 */
export function checkSource(sample: CodeSample, source: string) {
  // Strip out code behind HIDE..END markers
  const strippedSource = stripSource(source);
  if (sample.content.trim() !== strippedSource.trim()) {
    fail('Inline sample does not match sample in source file', sample.id);
    log('Inline sample:');
    log(sample.content.trim());
    log('----');
    log('Stripped source file sample:');
    log(strippedSource.trim() + '\n');
    return false;
  }
  return true;
}

export function applyPrefixes(
  samples: PrefixedCodeSample[],
  sources: {[id: string]: string} = {},
): CodeSample[] {
  const idToSample = _.keyBy(samples, 'id');
  const sliceLines = (text: string, lines: number[] | undefined) =>
    lines
      ? text
          .split('\n')
          .slice(lines[0] - 1, lines[1])
          .join('\n')
      : text;
  return samples.map(sample => {
    const prefixes = sample.id.endsWith('-output') ? [] : sample.prefixes;
    const content = prefixes
      .map(({id, lines}) => sliceLines(sources[id] || idToSample[id].content, lines))
      .concat([sources[sample.id] || sample.content])
      .join('\n');
    return {
      id: sample.id,
      sectionId: sample.sectionId,
      sectionHeader: sample.sectionHeader,
      language: sample.language,
      tsOptions: sample.tsOptions,
      nodeModules: sample.nodeModules,
      isTSX: sample.isTSX,
      checkJS: sample.checkJS,
      sourceFile: sample.sourceFile,
      content,
    };
  });
}

export function extractSample(text: string, slug: string, sourceFile: string) {
  if (sourceFile.endsWith('.asciidoc')) {
    return extractAsciidocSamples(text, slug, sourceFile);
  } else if (sourceFile.endsWith('.md')) {
    return extractMarkdownSamples(text, slug, sourceFile);
  }
  throw new Error(`Unknown source format, expected .{asciidoc,md}: ${sourceFile}`);
}
