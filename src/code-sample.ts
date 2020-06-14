import _ from 'lodash';

import {CodeSample, PrefixedCodeSample, Prefix} from './types';
import {matchAndExtract} from './utils';
import {log} from './logger';
import {fail} from './test-tracker';

const EXTRACT_ID = /\[\[([^\]]*)\]\]/;
const EXTRACT_SOURCE = /\[source,(ts|js)\]/;
const EXTRACT_DIRECTIVE = /^\/\/ verifier:(.*)$/;
const TOP_HEADER = /^={1,3} (.*)$/;

export function extractSamples(text: string, filename: string, sourceFile: string): PrefixedCodeSample[] {
  const samples = [];
  const lines = text.split('\n');
  let i = 0;
  let line: string;

  const advance = () => {
    i++;
    line = lines[i];
  };

  let lastSectionId: string | null = null;
  let lastSectionHeader: string | null = null;
  let lastId: string | null = null;
  let lastLanguage: string | null = null;
  let prefixes: readonly Prefix[] = [];
  let skipNext = false;
  let prependNext = false;
  let prependLines: number[] | null = null;
  let nodeModules: readonly string[] = [];
  let tsOptions: {[key: string]: string | boolean} = {};
  let nextIsTSX = false;
  let nextShouldCheckJs = false;

  for (; i < lines.length; i++) {
    line = lines[i];
    const id = matchAndExtract(EXTRACT_ID, line);
    if (id) {
      lastId = id;
      continue;
    }

    const language = matchAndExtract(EXTRACT_SOURCE, line);
    if (language) {
      lastLanguage = language;
      continue;
    }

    const header = matchAndExtract(TOP_HEADER, line);
    if (header) {
      // Sufficiently high-level headings should reset
      line = '// verifier:reset';
      lastSectionId = lastId;
      lastSectionHeader = header;
      lastId = null;
    }

    const directive = matchAndExtract(EXTRACT_DIRECTIVE, line);
    if (directive) {
      if (directive === 'reset') {
        prefixes = [];
        prependNext = false;
        skipNext = false;
        tsOptions = {};
        nodeModules = [];
        nextIsTSX = false;
        nextShouldCheckJs = false;
      } else if (directive === 'prepend-to-following') {
        prependNext = true;
      } else if (directive.startsWith('prepend-subset-to-following:')) {
        prependNext = true;
        prependLines = directive
          .split(':', 2)[1]
          .split('-')
          .map(Number);
      } else if (directive.startsWith('prepend-id-to-following')) {
        prefixes = prefixes.concat([
          {
            id: directive
              .split(':')
              .slice(1)
              .join(':'),
          },
        ]);
      } else if (directive.startsWith('skip')) {
        skipNext = true;
      } else if (directive.startsWith('tsconfig:')) {
        const [key, value] = directive.split(':', 2)[1].split('=', 2);
        tsOptions[key] = value === 'true' ? true : value === 'false' ? false : value;
      } else if (directive.startsWith('include-node-module:')) {
        const value = directive.split(':', 2)[1];
        nodeModules = nodeModules.concat([value]);
      } else if (directive === 'next-is-tsx') {
        nextIsTSX = true;
      } else if (directive === 'check-js') {
        nextShouldCheckJs = true;
        tsOptions['allowJs'] = true; // convenience, it's useless without this!
        tsOptions['noEmit'] = true;
      } else {
        throw new Error(`Unknown directive: ${line}`);
      }
      continue;
    }

    if (line === '----') {
      // This is a code sample. Extract it!
      advance();
      const startLine = i;
      while (line !== '----') {
        advance();
      }
      const endLine = i;
      const content = lines.slice(startLine, endLine).join('\n');
      if (!lastId && (lastLanguage === 'ts' || (lastLanguage === 'js' && nextShouldCheckJs))) {
        // TS samples get checked even without IDs.
        lastId = filename + '-' + startLine;
      }
      if (lastId) {
        if (!skipNext) {
          samples.push({
            id: lastId,
            sectionId: lastSectionId,
            sectionHeader: lastSectionHeader,
            language: lastLanguage as CodeSample['language'],
            content,
            prefixes,
            nodeModules,
            isTSX: nextIsTSX,
            checkJS: nextShouldCheckJs,
            sourceFile,
            tsOptions: {...tsOptions},
          });
        }
        if (prependNext) {
          prefixes = prefixes.concat([
            {
              id: lastId,
              ...(prependLines ? {lines: prependLines} : {}),
            },
          ]);
          prependNext = false;
          prependLines = null;
        }
      }
    }

    lastId = null;
    lastLanguage = null;
    skipNext = false;
    nextIsTSX = false;
    nextShouldCheckJs = false;
  }

  return samples;
}

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
