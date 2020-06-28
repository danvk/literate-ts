import _ from 'lodash';

import {CodeSample, PrefixedCodeSample, Prefix} from './types';
import {matchAndExtract} from './utils';

const EXTRACT_ID = /\[\[([^\]]*)\]\]/;
const EXTRACT_SOURCE = /\[source,(ts|js)\]/;
const EXTRACT_DIRECTIVE = /^\/\/ verifier:(.*)$/;
const TOP_HEADER = /^={1,3} (.*)$/;

export function extractSamples(
  text: string,
  filename: string,
  sourceFile: string,
): PrefixedCodeSample[] {
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
