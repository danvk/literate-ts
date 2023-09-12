import _ from 'lodash';

import {CodeSample, PrefixedCodeSample, Prefix, IdMetadata} from './types.js';
import {fail} from './test-tracker.js';
import {extractAsciidocSamples} from './asciidoc.js';
import {extractMarkdownSamples} from './markdown.js';
import {generateIdMetadata} from './metadata.js';

export interface Processor {
  /** Let the processor know about the current line number (0-based). */
  setLineNum(line: number): void;
  setHeader(header: string): void;
  setDirective(directive: string): void;
  setNextId(idMetadata: IdMetadata): void;
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
  let lastSectionHeader: string | null = null;
  let lastMetadata: IdMetadata | null = null;
  let lastLanguage: string | null = null;
  let prefixes: readonly Prefix[] = [];
  let skipNext = false;
  let skipRemaining = false;
  let prependNext = false;
  let prependLines: number[] | null = null;
  let nextIsReplaced: string | null = null;
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
      lastSectionHeader = header;
      lastMetadata = null;
    },
    setDirective(directive) {
      if (directive === 'reset') {
        prefixes = [];
        prependNext = false;
        skipNext = false;
        skipRemaining = false;
        tsOptions = {};
        nodeModules = [];
        nextIsTSX = false;
        nextShouldCheckJs = false;
      } else if (directive === 'prepend-to-following') {
        prependNext = true;
      } else if (directive.startsWith('prepend-subset-to-following:')) {
        prependNext = true;
        prependLines = directive.split(':', 2)[1].split('-').map(Number);
      } else if (directive.startsWith('prepend-id-to-following')) {
        prefixes = prefixes.concat([
          {
            id: directive.split(':', 2)[1],
          },
        ]);
      } else if (directive.startsWith('prepend-subset-of-id-to-following')) {
        const [, id, lineRange] = directive.split(':');
        const lines = lineRange.split('-').map(Number);
        prefixes = prefixes.concat([{id, lines}]);
      } else if (directive.startsWith('skip')) {
        skipNext = true;
      } else if (directive.startsWith('done-with-file')) {
        skipRemaining = true;
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
      } else if (directive.startsWith('replace-with-id')) {
        nextIsReplaced = directive.split(':', 2)[1];
      } else {
        throw new Error(`Unknown directive: ${directive}`);
      }
    },
    setNextId(id) {
      lastMetadata = id;
    },
    setNextLanguage(lang) {
      lastLanguage = lang;
    },
    addSample(content) {
      if (
        !lastMetadata &&
        (lastLanguage === 'ts' || (lastLanguage === 'js' && nextShouldCheckJs))
      ) {
        // TS samples get checked even without IDs.
        lastMetadata = generateIdMetadata(slug + '-' + (1 + lineNum), sourceFile, lineNum);
      }
      if (lastMetadata) {
        if (!skipNext && !skipRemaining) {
          samples.push({
            ...lastMetadata,
            sectionHeader: lastSectionHeader,
            language: lastLanguage as CodeSample['language'],
            content,
            prefixes,
            replacementId: nextIsReplaced ?? undefined,
            nodeModules,
            isTSX: nextIsTSX,
            checkJS: nextShouldCheckJs,
            sourceFile,
            lineNumber: lineNum,
            tsOptions: {...tsOptions},
            prefixesLength: 0,
          });
        }
        if (prependNext) {
          prefixes = prefixes.concat([
            {
              id: lastMetadata.id,
              ...(prependLines ? {lines: prependLines} : {}),
            },
          ]);
          prependNext = false;
          prependLines = null;
        }
      }
    },
    resetWithNormalLine() {
      lastMetadata = null;
      lastLanguage = null;
      skipNext = false;
      nextIsTSX = false;
      nextShouldCheckJs = false;
      nextIsReplaced = null;
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
    fail(
      `
Inline sample for ${sample.id} does not match sample in source file
Inline sample:
${sample.content.trim()}
----
Stripped source file sample:
${strippedSource.trim()}
----
      `.trimStart(),
      {sample},
    );
    return false;
  }
  return true;
}

/** Combine a code sample with all active prefixes to form a standalone code sample. */
export function applyPrefixes(samples: PrefixedCodeSample[]): CodeSample[] {
  const idToSample = _.keyBy(samples, 'id');
  const sliceLines = (text: string, lines: number[] | undefined) =>
    lines
      ? text
          .split('\n')
          .slice(lines[0] - 1, lines[1])
          .join('\n')
      : text;
  return samples.map(sample => {
    if (sample.replacementId) {
      throw new Error(`Logic error: sample {sample.id} was not replaced.`);
    }
    const prefixes = sample.id.endsWith('-output') ? [] : sample.prefixes;
    const combinedPrefixes = prefixes.map(({id, lines}) =>
      sliceLines(idToSample[id].content, lines),
    );
    const content = combinedPrefixes.concat([sample.content]).join('\n');
    return {
      descriptor: sample.descriptor,
      id: sample.id,
      sectionHeader: sample.sectionHeader,
      language: sample.language,
      tsOptions: sample.tsOptions,
      nodeModules: sample.nodeModules,
      isTSX: sample.isTSX,
      checkJS: sample.checkJS,
      sourceFile: sample.sourceFile,
      lineNumber: sample.lineNumber,
      prefixesLength: _.sum(combinedPrefixes.map(p => p.split('\n').length)),
      content,
    };
  });
}

export function applyReplacements(
  rawSamples: readonly Readonly<PrefixedCodeSample>[],
  externalReplacements: {[id: string]: string} = {},
): PrefixedCodeSample[] {
  const samples = _.cloneDeep(rawSamples) as PrefixedCodeSample[];
  const idToSample = _.keyBy(samples, 'id');

  // First check the external replacements
  for (const sample of samples) {
    const {id} = sample;
    const source = externalReplacements[id];
    if (source) {
      checkSource(sample, source);
      sample.content = source;
    }
  }
  // TODO: flag unused replacements

  // Next do the inline replacements
  for (const sample of samples) {
    const {replacementId} = sample;
    if (!replacementId) {
      continue;
    }

    const replacementSample = idToSample[replacementId];
    if (!replacementSample) {
      fail(`No sample with ID ${replacementId} to replace ${sample.id}.`);
    } else {
      checkSource(sample, replacementSample.content);
      sample.content = replacementSample.content;
      delete sample.replacementId;
    }
  }

  return samples;
}

const EQUIVALENT_RE = /\^\? type ([A-Za-z0-9_]+) = (.*)( \(equivalent to (.*)\))$/m;

/** Patch the code sample to test "equivalent to" types */
export function addResolvedChecks(sample: CodeSample): CodeSample {
  const {content} = sample;
  const m = EQUIVALENT_RE.exec(content);
  if (!m) {
    return sample;
  }

  const [, typeName, raw, equivClause, equivType] = m;
  console.log(typeName, raw, equivClause, equivType);

  // Strip the "equivalent to" bit, add Resolve<T> helper and secondary type assertion.
  // See https://github.com/danvk/literate-ts/issues/132 and
  // https://effectivetypescript.com/2022/02/25/gentips-4-display/
  let newContent = content.replace(equivClause, '');
  newContent += '\ntype Resolve<Raw> = Raw extends Function ? Raw : {[K in keyof Raw]: Raw[K]};';
  newContent += `\ntype Synth${typeName} = Resolve<${typeName}>;`;
  newContent += `\n//   ^? type Synth${typeName} = ${equivType}\n`;

  return {
    ...sample,
    content: newContent,
  };
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
