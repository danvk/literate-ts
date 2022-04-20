import _ from 'lodash';

import {CodeSample, PrefixedCodeSample, Prefix, IdMetadata} from './types';
import {log} from './logger';
import {fail} from './test-tracker';
import {extractAsciidocSamples} from './asciidoc';
import {extractMarkdownSamples} from './markdown';
import {generateId} from './ids';

export interface Processor {
  setLineNum(line: number): void;
  setHeader(header: string): void;
  setDirective(directive: string): void;
  setNextId(idTemp: IdMetadata): void;
  setNextLanguage(lang: string | null): void;
  addSample(code: string): void;
  resetWithNormalLine(): void;
}

function process(
  text: string,
  slug: string,
  sourceFile: string,
  processor: (filename: string, text: string, processor: Processor) => void,
): PrefixedCodeSample[] {
  const samples: PrefixedCodeSample[] = [];

  let lineNum = 0;
  let lastSectionId: IdMetadata | null = null;
  let lastSectionHeader: string | null = null;
  let lastId: IdMetadata | null = null;
  let lastLanguage: string | null = null;
  let prefixes: readonly Prefix[] = [];
  let skipNext = false;
  let prependNext = false;
  let prependLines: number[] | null = null;
  let nodeModules: readonly string[] = [];
  let tsOptions: {[key: string]: string | boolean} = {};
  let nextIsTSX = false;
  let nextShouldCheckJs = false;

  const p: Processor = {
    setLineNum(line) {
      lineNum = line;
    },
    setHeader(header) {
      p.setDirective('reset');
      lastSectionId = lastId;
      lastSectionHeader = header;
      lastId = null;
    },
    setDirective(directive) {
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
            id: generateId(
              directive
                .split(':')
                .slice(1)
                .join(':'),
              sourceFile,
              lineNum,
            ),
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
        throw new Error(`Unknown directive: ${directive}`);
      }
    },
    setNextId(id) {
      lastId = id;
    },
    setNextLanguage(lang) {
      lastLanguage = lang;
    },
    addSample(content) {
      if (!lastId && (lastLanguage === 'ts' || (lastLanguage === 'js' && nextShouldCheckJs))) {
        // TS samples get checked even without IDs.
        lastId = generateId(slug + '-' + lineNum, sourceFile, lineNum);
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
    },
    resetWithNormalLine() {
      lastId = null;
      lastLanguage = null;
      skipNext = false;
      nextIsTSX = false;
      nextShouldCheckJs = false;
    },
  };

  processor(sourceFile, text, p);

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
  const idToSample = _.keyBy(samples, 'id.key');
  const sliceLines = (text: string, lines: number[] | undefined) =>
    lines
      ? text
          .split('\n')
          .slice(lines[0] - 1, lines[1])
          .join('\n')
      : text;
  return samples.map(sample => {
    const prefixes = sample.id.key.endsWith('-output') ? [] : sample.prefixes;
    const content = prefixes
      .map(({id, lines}) => sliceLines(sources[id.key] || idToSample[id.key].content, lines))
      .concat([sources[sample.id.key] || sample.content])
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

export function extractSamples(text: string, slug: string, sourceFile: string) {
  let processor;
  if (sourceFile.endsWith('.asciidoc')) {
    processor = extractAsciidocSamples;
  } else if (sourceFile.endsWith('.md')) {
    processor = extractMarkdownSamples;
  } else {
    throw new Error(`Unknown source format, expected .{asciidoc,md}: ${sourceFile}`);
  }

  return process(text, slug, sourceFile, processor);
}
