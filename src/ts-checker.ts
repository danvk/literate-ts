import fs from 'fs-extra';
import findCacheDirectory from 'find-cache-dir';
import {convert as htmlToText} from 'html-to-text';
import repl from 'node:repl';
import {Readable, Writable} from 'node:stream';

import stableJsonStringify from 'fast-json-stable-stringify';
import _ from 'lodash';
import path from 'path';
import ts from 'typescript';

import {log} from './logger.js';
import {FailureLocation, fail, getLastFailReason} from './test-tracker.js';
import {writeTempFile, matchAndExtract, getTempDir, matchAll, sha256, tuple} from './utils.js';
import {CodeSample} from './types.js';
import {ExecErrorType, runNode} from './node-runner.js';
import {VERSION} from './version.js';
import {readPackageUpSync} from 'read-pkg-up';

export interface TypeScriptError {
  line: number;
  start: number; // inclusive
  end: number; // exclusive
  message: string;
}

export interface ExpectTypeAssertion {
  line: number;
  type: string;
}

export interface TwoslashAssertion {
  /** Position in the source file that the twoslash assertion points at */
  position: number;
  line: number;
  character: number;
  /** The expected type in the twoslash comment */
  type: string;
}

export type TypeScriptTypeAssertion = ExpectTypeAssertion | TwoslashAssertion;

export interface ConfigBundle {
  options: ts.CompilerOptions;
  host: ts.CompilerHost;
}

const COMMENT_PAT = /^( *\/\/) /;
const TILDE_PAT = / (~+)/g;
const POST_TILDE_PAT = /\/\/ [~ ]+(?:(.*))?/;
const TYPE_ASSERTION_PAT = /\/\/.*[tT]ype is (?:still )?(?:just )?(.*)\.?$/;
const TWOSLASH_PAT = /\/\/ (?: *)\^\? ?(.*)$/;

function isTwoslashAssertion(a: TypeScriptTypeAssertion): a is TwoslashAssertion {
  return 'position' in a;
}

export function extractExpectedErrors(content: string): TypeScriptError[] {
  const lines = content.split('\n');
  const errors: TypeScriptError[] = [];

  let lastCodeLine: number;
  lines.forEach((line, i) => {
    const comment = matchAndExtract(COMMENT_PAT, line);
    if (!comment) {
      lastCodeLine = i;
      return;
    }

    const tildes = matchAll(TILDE_PAT, line);
    if (tildes.length === 0) {
      const lastError = errors[errors.length - 1];
      if (lastError && lines[lastError.line + 1].startsWith(comment)) {
        // Presumably this is a continuation of the error.
        lastError.message += ' ' + line.slice(comment.length).trim();
      }
      return;
    }

    const messageMatch = POST_TILDE_PAT.exec(line);
    const message = (messageMatch ? messageMatch[1] || '' : '').trim();
    for (const m of tildes) {
      const start = m.index + 1;
      const end = start + m[1].length;
      errors.push({line: lastCodeLine, start, end, message});
    }
  });
  return errors;
}

function doErrorsOverlap(a: TypeScriptError, b: TypeScriptError) {
  return a.line === b.line && a.start <= b.end && b.start <= a.end;
}

function checkMatchingErrors(expectedErrorsIn: TypeScriptError[], actualErrors: TypeScriptError[]) {
  const expectedErrors = expectedErrorsIn.slice();
  const matchedErrors: TypeScriptError[] = [];
  let anyFailures = false;
  for (const error of actualErrors) {
    const i = _.findIndex(expectedErrors, e => doErrorsOverlap(e, error));
    if (i >= 0) {
      const matchedError = expectedErrors.splice(i, 1)[0];
      matchedErrors.push(matchedError);
      log('matched errors:');
      log('  expected: ' + matchedError.message);
      log('    actual: ' + error.message);

      const posMismatch = [];
      const dStart = error.start - matchedError.start;
      const dEnd = error.end - matchedError.end;
      if (dStart) posMismatch.push(`start: ${dStart}`);
      if (dEnd) posMismatch.push(`end: ${dEnd}`);
      if (posMismatch.length) {
        log('  mismatched error span: ' + posMismatch.join(', '));
      }

      let matchType = '';
      let disagree = false;
      if (error.message === matchedError.message) {
        matchType = 'perfect';
      } else if (!error.message) {
        matchType = 'empty message';
      } else if (error.message.includes(matchedError.message)) {
        matchType = 'subset';
      } else if (matchedError.message.includes('...')) {
        const parts = matchedError.message.split('...');
        const allMatch = _.every(parts, part => error.message.includes(part));
        if (allMatch) {
          matchType = 'match with ...';
        } else {
          disagree = true;
        }
      } else {
        disagree = true;
      }
      if (disagree) {
        log('  error messages could not be matched!');
      } else {
        log('  error messages match: ' + matchType);
      }
    } else {
      const {line, start, end, message} = error;
      fail(`Unexpected TypeScript error: ${message}`, {location: {line, start, end}});
      anyFailures = true;
    }
  }

  for (const error of expectedErrors) {
    const {line, start, end, message} = error;
    fail(`Expected TypeScript error was not produced: ${message}`, {location: {line, start, end}});
    anyFailures = true;
  }

  if (expectedErrorsIn.length) {
    log(`Matched ${matchedErrors.length}/${expectedErrorsIn.length} errors.`);
  } else if (actualErrors.length === 0) {
    log(`Code passed type checker.`);
  }

  return !anyFailures;
}

export function hasTypeAssertions(content: string) {
  const lines = content.split('\n');
  return !!_.find(lines, line => TYPE_ASSERTION_PAT.exec(line) || TWOSLASH_PAT.exec(line));
}

export function extractTypeAssertions(source: ts.SourceFile): TypeScriptTypeAssertion[] {
  const assertions: TypeScriptTypeAssertion[] = [];
  const lineStarts = source.getLineStarts();
  const text = source.getFullText();

  let appliesToPreviousLine = false;
  let colForContinuation = null;
  let commentPrefixForContinuation = null; // expected whitespace after the "//" for twoslash

  for (let i = 0; i < lineStarts.length; i++) {
    const lineText = text.slice(
      lineStarts[i],
      i === lineStarts.length - 1 ? undefined : lineStarts[i + 1] - 1,
    );

    const isFullLineComment = !!lineText.match(/^ *\/\//);
    if (!isFullLineComment) {
      appliesToPreviousLine = false;
      colForContinuation = null;
      commentPrefixForContinuation = null;
    }
    appliesToPreviousLine = isFullLineComment;

    const commentPos = lineText.indexOf('//');
    if (commentPos === -1) {
      continue;
    }
    const pos = lineStarts[i] + commentPos;
    const lineChar = source.getLineAndCharacterOfPosition(pos);
    let {line} = lineChar;
    const {character} = lineChar;
    const commentText = lineText.slice(commentPos);
    if (
      appliesToPreviousLine &&
      character === colForContinuation &&
      (commentPrefixForContinuation === null ||
        commentText.startsWith(commentPrefixForContinuation))
    ) {
      assertions[assertions.length - 1].type += ' ' + commentText.slice(2).trim();
    } else {
      const type = matchAndExtract(TYPE_ASSERTION_PAT, commentText);
      if (type) {
        if (appliesToPreviousLine) line -= 1;
        assertions.push({line, type});
        colForContinuation = character;
      } else {
        const type = matchAndExtract(TWOSLASH_PAT, commentText);
        if (type === null) continue;
        if (!isFullLineComment) {
          throw new Error('Twoslash assertion must be first on line.');
        }
        const twoslashOffset = commentText.indexOf('^?');
        const commentIndex = pos; // position of the "//" in source file
        const caretIndex = commentIndex + twoslashOffset;
        // The position of interest is wherever the "^" (caret) is, but on the previous line.
        const position = caretIndex - (lineStarts[line] - lineStarts[line - 1]);
        const lineAndChar = source.getLineAndCharacterOfPosition(position);
        // line and char aren't strictly needed but they make the tests much more readable.
        assertions.push({position, type, ...lineAndChar});
        colForContinuation = character;
        commentPrefixForContinuation = commentText.slice(0, twoslashOffset);
      }
    }
  }

  return assertions;
}

// Use this to figure out which node you really want:
// const debugWalkNode = (node: ts.Node, indent = '') => {
//   console.log(`${indent}${node.kind}: ${node.getText()}`);
//   for (const child of node.getChildren()) {
//     debugWalkNode(child, '  ' + indent);
//   }
// };

/**
 * Figure out which node we should check the type of.
 *
 * For a declaration (`const x = 12`) we want to check the 'x'.
 * This winds up being the first identifier in the AST.
 */
export function getNodeForType(node: ts.Node): ts.Node {
  const findIdentifier = (node: ts.Node): ts.Node | null => {
    if (
      node.kind === ts.SyntaxKind.Identifier ||
      node.kind === ts.SyntaxKind.PropertyAccessExpression ||
      node.kind === ts.SyntaxKind.CallExpression
    ) {
      return node;
    }
    for (const child of node.getChildren()) {
      const childId = findIdentifier(child);
      if (childId) {
        return childId;
      }
    }
    return null;
  };

  return findIdentifier(node) || node;
}

export function typesMatch(expected: string, actual: string) {
  if (expected.endsWith('!')) {
    expected = expected.slice(0, -1);
  }

  if (expected === actual) {
    return true;
  }
  const n = expected.length;
  return expected.endsWith('...') && actual.slice(0, n - 3) === expected.slice(0, n - 3);
}

export function checkExpectTypeAssertions(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  assertions: ExpectTypeAssertion[],
): boolean {
  const numAssertions = assertions.length;
  let matchedAssertions = 0;
  let anyFailures = false;

  // Match assertions to the first node that appears on the line they apply to.
  const walkTree = (node: ts.Node) => {
    if (
      node.kind !== ts.SyntaxKind.SourceFile &&
      node.kind !== ts.SyntaxKind.SyntaxList &&
      node.kind !== ts.SyntaxKind.Block
    ) {
      const pos = node.getEnd();
      const {line} = source.getLineAndCharacterOfPosition(pos);
      const assertionIndex = _.findIndex(assertions, {line});
      if (assertionIndex >= 0) {
        const assertion = assertions[assertionIndex];

        const nodeForType = getNodeForType(node);
        const type = checker.getTypeAtLocation(nodeForType);
        const actualType = checker.typeToString(type, nodeForType);

        if (!typesMatch(assertion.type, actualType)) {
          const {character: start} = source.getLineAndCharacterOfPosition(nodeForType.getStart());
          const {character: end} = source.getLineAndCharacterOfPosition(nodeForType.getEnd());
          const testedText = node !== nodeForType ? ` (tested \`${nodeForType.getText()}\`)` : '';
          fail(
            `Failed type assertion for \`${node.getText()}\`${testedText}\n` +
              `  Expected: ${assertion.type}\n` +
              `    Actual: ${actualType}`,
            {
              location: {
                line,
                start,
                end,
              },
            },
          );
          anyFailures = true;
        } else {
          log(`Type assertion match:`);
          log(`  Expected: ${assertion.type}`);
          log(`    Actual: ${actualType}`);
          matchedAssertions++;
        }

        assertions.splice(assertionIndex, 1);
      }
    }

    ts.forEachChild(node, child => {
      walkTree(child);
    });
  };

  walkTree(source);
  if (assertions.length) {
    fail('Unable to attach all assertions to nodes');
    return false;
  } else if (numAssertions) {
    log(`  ${matchedAssertions}/${numAssertions} type assertions matched.`);
  }

  return !anyFailures;
}

function getNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  let candidate: ts.Node | undefined = undefined;
  ts.forEachChild(sourceFile, function iterate(node) {
    const start = node.getStart();
    const end = node.getEnd();
    if (position >= start && position <= end) {
      candidate = node;
      ts.forEachChild(node, iterate);
    }
  });
  return candidate;
}

/** Normalize "B | A" -> "A | B" */
export function sortUnions(type: string): string {
  let level = 0;
  const topLevelPipes: number[] = [];
  for (let i = 0; i < type.length; i++) {
    const c = type.charAt(i);
    if (c === '|' && level === 0) {
      topLevelPipes.push(i);
    } else if (c === '{' || c === '(' || c === '<') {
      level += 1;
    } else if (c === '}' || c === '}' || c === '>') {
      level -= 1;
    }
    // TODO: quotes
  }

  if (level !== 0 || topLevelPipes.length === 0) {
    return type; // do no harm if we don't understand the type.
  }
  topLevelPipes.splice(0, 0, -1);
  const parts = topLevelPipes.map((idx, i) => type.slice(idx + 1, topLevelPipes[i + 1]).trim());
  return _.sortBy(parts).join(' | ');
}

/** This variant of split puts the rest of the string in the last group, rather than truncating. */
export function limitedSplit(txt: string, pattern: string | RegExp, limit: number): string[] {
  const groups = txt.split(pattern);
  if (groups.length <= limit) {
    return groups;
  }
  if (typeof pattern === 'string') {
    return [...groups.slice(0, limit - 1), groups.slice(limit - 1).join(pattern)];
  }
  const globalPat = new RegExp(pattern, 'g');
  const out = [];
  let pos = 0;
  for (const m of txt.matchAll(globalPat)) {
    if (out.length < limit - 1) {
      out.push(txt.slice(pos, m.index));
      if (m.index === undefined) {
        throw new Error();
      }
      pos = m.index + m[0].length;
    } else {
      out.push(txt.slice(pos));
      break;
    }
  }
  return out;
}

// TODO: it's much easier to normalize actual based on the displayParts
//       This isn't 100% correct if a type has a space in it, e.g. type T = "string literal"
// (exported for testing)
export const normalize = (input: string) => {
  const isFunction = !!input.match(/^ *function /) || !!input.match(/=>/);

  let name: string;
  let type: string;
  if (!isFunction) {
    const parts = limitedSplit(input, /[:=]/, 2);
    if (parts.length !== 2) {
      // this might be a typo, e.g. missing the ":" or "=" in a type assertion.
      return input;
    }
    [name, type] = parts;
  } else {
    name = 'n/a';
    type = input;
  }

  const normType = sortUnions(type)
    .replace(/[\n\r ]+/g, ' ')
    .replace(/\( */g, '(')
    .replace(/ *\)/, ')')
    .trim();
  return isFunction ? normType : `${name}: ${normType}`;
};

export function matchModuloWhitespace(actual: string, expected: string): boolean {
  const normActual = normalize(actual);
  const normExpected = normalize(expected);
  if (normActual === normExpected) {
    return true;
  } else if (normExpected.includes('...')) {
    const parts = limitedSplit(normExpected, '...', 2);
    if (parts.length !== 2) {
      return false;
    }
    const [left, right] = parts;
    return (
      normActual.startsWith(left) &&
      normActual.endsWith(right) &&
      normActual.length > left.length + right.length
    );
  }
  return false;
}

export function checkTwoslashAssertions(
  source: ts.SourceFile,
  languageService: ts.LanguageService,
  assertions: TwoslashAssertion[],
): boolean {
  let anyFailures = false;
  let matchedAssertions = 0;
  for (const assertion of assertions) {
    const {position, type} = assertion;
    if (position === -1) {
      // special case for a twoslash assertion on line 1.
      fail(`Twoslash assertion on first line: ${type}`);
      continue;
    }
    const node = getNodeAtPosition(source, position);
    if (!node) {
      fail(`Unable to find matching node for twoslash assertion: ${type}`);
      continue;
    }

    const qi = languageService.getQuickInfoAtPosition(source.fileName, node.getStart());
    if (!qi?.displayParts) {
      fail(`Unable to get quickinfo for twoslash assertion ${type}`);
      continue;
    }
    const actual = qi.displayParts.map(dp => dp.text).join('');
    if (!matchModuloWhitespace(actual, type)) {
      const {line, character: start} = source.getLineAndCharacterOfPosition(node.getStart());
      const {character: end} = source.getLineAndCharacterOfPosition(node.getEnd());
      fail(
        `Failed type assertion for \`${node.getText()}\`\n` +
          `  Expected: ${type}\n` +
          `    Actual: ${actual}`,
        {
          location: {
            line,
            start,
            end,
          },
        },
      );
      anyFailures = true;
    } else {
      log(`Twoslash type assertion match:`);
      log(`  Expected: ${type}`);
      log(`    Actual: ${actual}`);
      matchedAssertions++;
    }
  }

  if (assertions.length) {
    log(`  ${matchedAssertions}/${assertions.length} twoslash type assertions matched.`);
  }

  return !anyFailures;
}

export function checkTypeAssertions(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  languageService: ts.LanguageService,
  assertions: TypeScriptTypeAssertion[],
) {
  const [twoslashAssertions, expectTypeAssertions] = _.partition(assertions, isTwoslashAssertion);
  let ok = true;
  if (expectTypeAssertions.length) {
    ok = ok && checkExpectTypeAssertions(source, checker, expectTypeAssertions);
  }
  if (twoslashAssertions.length) {
    ok = ok && checkTwoslashAssertions(source, languageService, twoslashAssertions);
  }

  return ok;
}

// See https://github.com/JoshuaKGoldberg/eslint-plugin-expect-type/blob/a55413/src/rules/expect.ts#L506-L521
export function getLanguageServiceHost(program: ts.Program): ts.LanguageServiceHost {
  return {
    getCompilationSettings: () => program.getCompilerOptions(),
    getCurrentDirectory: () => program.getCurrentDirectory(),
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => program.getSourceFiles().map(sourceFile => sourceFile.fileName),
    getScriptSnapshot: name =>
      ts.ScriptSnapshot.fromString(program.getSourceFile(name)?.text ?? ''),
    getScriptVersion: () => '1',
    // NB: We can't check `program` for files, it won't contain valid files like package.json
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
}

export interface CheckTsResult {
  passed: boolean;
  failure?: {message: string; location?: FailureLocation};
  output?: ExecErrorType;
  // TODO: include more details about errors
}

function getCheckTsCacheKey(inSample: CodeSample, runCode: boolean) {
  const {descriptor: _1, id: _2, sectionHeader: _3, sourceFile: _4, ...sample} = inSample;
  const key = {
    sample,
    runCode,
    // `config` has compiler options but these are already in `sample`
    versions: {
      typeScript: ts.version,
      literateTs: VERSION,
      nodeJs: process.version,
    },
  };
  return tuple(sha256(stableJsonStringify(key)), key);
}

export const CACHE_DIR = findCacheDirectory({name: 'literate-ts', create: true})!;
if (!CACHE_DIR) {
  throw new Error(`Unable to find cache dir`);
}

export async function checkTs(
  sample: CodeSample,
  runCode: boolean,
  config: ConfigBundle,
  options: {skipCache: boolean},
): Promise<CheckTsResult> {
  const [key, cacheKey] = getCheckTsCacheKey(sample, runCode);
  const tempFilePath = path.join(CACHE_DIR, `${key}.json`);
  const hit = await fs.pathExists(tempFilePath);
  if (hit && !options.skipCache) {
    const result = await fs.readFile(tempFilePath, 'utf8');
    const {key: _, ...out} = JSON.parse(result) as CheckTsResult & {key: unknown};
    if (out.failure) {
      const {message, ...context} = out.failure;
      fail(message, context);
    }
    return out;
  }

  const result = await uncachedCheckTs(sample, runCode, config);
  if (result.passed === false) {
    result.failure = getLastFailReason() ?? undefined;
  }

  if (!options.skipCache) {
    await fs.writeFile(tempFilePath, JSON.stringify({...result, key: cacheKey}), 'utf8');
  }
  return result;
}

function setupNodeModules(sample: CodeSample, sampleDir: string, options: ts.CompilerOptions) {
  const nodeModulesPath = path.join(sampleDir, 'node_modules');
  fs.emptyDirSync(nodeModulesPath);

  const allModules = [...sample.nodeModules];
  const sourceFileAbsPath = path.resolve(process.cwd(), sample.sourceFile);
  const copiedModules = new Set();
  let nodeModule;
  while ((nodeModule = allModules.shift()) !== undefined) {
    if (copiedModules.has(nodeModule)) {
      continue; // already resolved
    }
    // Use the TypeScript API to resolve a location for this module relative to the source file.
    // Copy it over and add any transitive dependencies to the list.
    const {resolvedModule} = ts.resolveModuleName(nodeModule, sourceFileAbsPath, options, ts.sys);
    if (!resolvedModule) {
      fail(
        `Could not find requested (or transitive) node_module ${nodeModule}. See logs for details.`,
      );
      return {passed: false};
    }
    const {resolvedFileName} = resolvedModule;
    const pkg = readPackageUpSync({cwd: resolvedFileName});
    if (!pkg) {
      fail(`Could not find package.json from ${resolvedFileName}.`);
      return {passed: false};
    }
    const nodeModuleDir = path.dirname(pkg.path);
    const nodeModuleDirRelative = nodeModuleDir.replace(/^.*?\/node_modules\//, '');
    const dest = path.join(nodeModulesPath, nodeModuleDirRelative);
    fs.copySync(nodeModuleDir, dest);
    log(`Copied ${nodeModuleDir} -> ${dest}`);
    copiedModules.add(nodeModule);

    for (const dep of Object.keys(pkg.packageJson.dependencies ?? {})) {
      allModules.push(dep); // no need to de-dupe here, it's done at the top of the loop.
    }
  }
}

/** Verify that a TypeScript sample has the expected errors and no others. */
async function uncachedCheckTs(
  sample: CodeSample,
  runCode: boolean,
  config: ConfigBundle,
): Promise<CheckTsResult> {
  const {id, content} = sample;
  const fileName = sample.targetFilename || id + (sample.isTSX ? '.tsx' : `.${sample.language}`);
  const tsFile = writeTempFile(fileName, content);
  const sampleDir = getTempDir();
  const allFiles = [tsFile];
  for (const auxFile of sample.auxiliaryFiles) {
    const {filename, content} = auxFile;
    const absPathFile = writeTempFile(filename, content);
    allFiles.push(absPathFile);
  }

  const options: ts.CompilerOptions = {
    ...config.options,
    ...sample.tsOptions,
  };

  setupNodeModules(sample, sampleDir, options);
  if (!_.isEmpty(sample.nodeModules)) {
    options.typeRoots = [path.join(sampleDir, 'node_modules', '@types')];
  }

  const program = ts.createProgram(allFiles, options, config.host);
  const source = program.getSourceFile(tsFile);
  if (!source) {
    fail('Unable to load TS source file');
    return {passed: false};
  }

  let diagnostics = ts.getPreEmitDiagnostics(program);

  if (runCode) {
    const emitResult = program.emit();
    diagnostics = diagnostics.concat(emitResult.diagnostics);

    if (emitResult.emitSkipped) {
      fail('Failed to emit JavaScript for TypeScript sample.');
      return {passed: false};
    }
  }

  const expectedErrors = extractExpectedErrors(content);
  const numLines = content.split('\n').length;
  const actualErrorsRaw: TypeScriptError[] = diagnostics
    .map(diagnostic => {
      let line, character;
      if (diagnostic.file) {
        const x = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!);
        line = x.line;
        character = x.character;
      } else {
        line = character = 0;
      }
      const end = character + (diagnostic.length ?? 0);
      return {
        line,
        start: character,
        end,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      };
    })
    // sometimes library errors show up as being past the end of the source.
    .filter(err => err.line < numLines);

  // There's no way to represent expected errors with identical spans.
  // Usually these go from least- to most-specific, so just take the last one.
  const actualErrors = _(actualErrorsRaw)
    .groupBy(e => `${e.line}:${e.start}-${e.end}`)
    .mapValues(errs => errs.slice(-1)[0])
    .values()
    .value();

  let ok = checkMatchingErrors(expectedErrors, actualErrors);

  if (hasTypeAssertions(content)) {
    const checker = program.getTypeChecker();

    const assertions = extractTypeAssertions(source);
    if (assertions.length) {
      const languageService = ts.createLanguageService(getLanguageServiceHost(program));
      const typeAssertionsOk = checkTypeAssertions(source, checker, languageService, assertions);
      ok = ok && typeAssertionsOk;
    } else {
      fail('Unable to extract type assertions');
    }
  }

  if (!ok) {
    log(content);
    log(`tsconfig options: ${JSON.stringify(options)}`);
  }

  if (!runCode) return {passed: ok};

  const jsFile = tsFile.replace(/\.ts$/, '.js');
  if (!fs.existsSync(jsFile)) {
    fail(`Did not produce JS output in expected place: ${jsFile}`);
    return {passed: false};
  }

  const output = await runNode(jsFile);
  return {passed: false, output};
}

export async function checkProgramListing(
  sample: CodeSample,
  config: ConfigBundle,
): Promise<CheckTsResult> {
  // The bit before the `<pre>` is presumably prepended material.
  // We need to convert this to JS and load it separately.
  const [preamble, listingHTML] = sample.content.split('<pre ');
  const listing = htmlToText('<pre ' + listingHTML);

  let jsPreambleFile;
  if (preamble) {
    // Note: some copying of uncachedCheckTs() here.
    const tsFile = writeTempFile('programlisting-premable.ts', preamble);
    const options: ts.CompilerOptions = {
      ...config.options,
      ...sample.tsOptions,
    };
    const program = ts.createProgram([tsFile], options, config.host);
    const source = program.getSourceFile(tsFile);
    if (!source) {
      fail('Unable to load TS source file');
      return {passed: false};
    }
    let diagnostics = ts.getPreEmitDiagnostics(program);
    const emitResult = program.emit();
    diagnostics = diagnostics.concat(emitResult.diagnostics);
    jsPreambleFile = tsFile.replace(/\.ts$/, '.js');
    if (!fs.existsSync(jsPreambleFile)) {
      fail(`Did not produce JS output in expected place: ${jsPreambleFile}`);
      return {passed: false};
    }

    if (emitResult.emitSkipped) {
      fail('Failed to emit JavaScript for TypeScript sample.');
      return {passed: false};
    }
  }

  const [rawInputs, expectedOutputs] = _.partition(listing.trim().split('\n'), line =>
    line.startsWith('> '),
  );
  let inputs = rawInputs.map(input => input.slice(2));
  if (jsPreambleFile) {
    inputs = [`.load ${jsPreambleFile}`, '"--reset--"', ...inputs];
  }

  const inputStream = new Readable();
  for (const input of inputs) {
    inputStream.push(input); // the string you want
    inputStream.push('\n');
  }
  inputStream.push(null); // indicates end-of-file basically - the end of the stream

  const capturedOutputs: string[] = [];

  class CaptureStream extends Writable {
    _write(chunk: Buffer, enc: string, next: () => void) {
      const s = chunk.toString();
      capturedOutputs.push(s);
      next();
    }
  }
  const outputStream = new CaptureStream();

  const server = repl.start({
    input: inputStream,
    output: outputStream,
  });
  const replOutput = await new Promise<string[]>((resolve, reject) => {
    inputStream.push(null);
    server.addListener('exit', () => {});
    server.addListener('close', () => {
      outputStream.end();
      let finalOutputs = [];
      for (const output of capturedOutputs) {
        if (output === '> ') continue;
        if (output.trim() === `'--reset--'`) {
          finalOutputs = [];
        } else {
          finalOutputs.push(output.trim());
        }
      }
      resolve(finalOutputs);
    });
  });

  if (_.isEqual(replOutput.slice(0, -1), expectedOutputs) && replOutput.at(-1) === 'undefined') {
    // special case to allow commands that console.log instead of evaluating to anything.
  } else if (!_.isEqual(replOutput, expectedOutputs)) {
    // TODO: report exact mismatched spans
    let message = `Node session did not match program listing.`;
    if (replOutput.length === expectedOutputs.length) {
      for (const [expected, actual] of _.zip(expectedOutputs, replOutput)) {
        message += `\n  - ${expected}\n  + ${actual}`;
      }
    } else {
      const expected = expectedOutputs.join('\n');
      const actual = replOutput.join('\n');
      message += `\nExpected:\n${expected}\nActual:\n${actual}`;
    }
    fail(message);
    // console.log('expected:', JSON.stringify(expectedOutputs));
    // console.log('actual:', JSON.stringify(replOutput));
    return {passed: false};
  }
  log('Node session matched program listing.');
  return {passed: true};
}
