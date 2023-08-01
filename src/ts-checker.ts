import fs from 'fs-extra';

import _ from 'lodash';
import path from 'path';
import ts from 'typescript';

import {log} from './logger';
import {fail} from './test-tracker';
import {writeTempFile, matchAndExtract, getTempDir, matchAll} from './utils';
import {CodeSample} from './types';
import {runNode} from './node-runner';

export interface TypeScriptError {
  line: number;
  start: number; // inclusive
  end: number; // exclusive
  message: string;
}

export interface TypeScriptTypeAssertion {
  line: number;
  type: string;
  /** If the assertion refers to a specific position (i.e. for twoslash) */
  character?: number;
}

export interface ConfigBundle {
  options: ts.CompilerOptions;
  host: ts.CompilerHost;
}

const COMMENT_PAT = /^( *\/\/) /;
const TILDE_PAT = / (~+)/g;
const POST_TILDE_PAT = /\/\/ [~ ]+(?:(.*))?/;
const TYPE_ASSERTION_PAT = /\/\/.*[tT]ype is (?:still )?(?:just )?(.*)\.?$/;
const TWOSLASH_PAT = /\/\/ (?: *)\^\? (.*)$/;

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
      fail(`Unexpected TypeScript error: ${line}:${start}-${end}: ${message}`);
      anyFailures = true;
    }
  }

  for (const error of expectedErrors) {
    const {line, start, end, message} = error;
    fail(`Expected TypeScript error was not produced: ${line}:${start}-${end}: ${message}`);
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

export function extractTypeAssertions(
  scanner: ts.Scanner,
  source: ts.SourceFile,
): TypeScriptTypeAssertion[] {
  const assertions: TypeScriptTypeAssertion[] = [];

  let appliesToPreviousLine = false;
  let colForContinuation = null;
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    const token = scanner.getToken();
    if (token === ts.SyntaxKind.WhitespaceTrivia) continue; // ignore leading whitespace.

    if (token === ts.SyntaxKind.NewLineTrivia) {
      // an assertion at the start of a line applies to the previous line.
      appliesToPreviousLine = true;
      continue;
    }

    const pos = scanner.getTokenPos();
    const lineChar = source.getLineAndCharacterOfPosition(pos);
    let {line} = lineChar;
    const {character} = lineChar;

    if (token === ts.SyntaxKind.SingleLineCommentTrivia) {
      const commentText = scanner.getTokenText();
      if (character === colForContinuation) {
        assertions[assertions.length - 1].type += ' ' + commentText.slice(2).trim();
      } else {
        const type = matchAndExtract(TYPE_ASSERTION_PAT, commentText);
        if (type) {
          if (appliesToPreviousLine) line -= 1;
          assertions.push({line, type});
          colForContinuation = character;
        } else {
          console.log(JSON.stringify(commentText));
          const type = matchAndExtract(TWOSLASH_PAT, commentText);
          console.log(type);
          if (!type) continue;
          if (!appliesToPreviousLine) {
            throw new Error('Twoslash assertion must be first on line.');
          }
          line -= 1;
          const twoslashCharacter = character + commentText.indexOf('^?');
          assertions.push({line, type, character: twoslashCharacter});
          colForContinuation = character;
        }
      }
    } else {
      appliesToPreviousLine = false;
      colForContinuation = null;
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

export function checkTypeAssertions(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  assertions: TypeScriptTypeAssertion[],
) {
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
          const testedText = node !== nodeForType ? ` (tested ${nodeForType.getText()})` : '';
          fail(`Failed type assertion for ${node.getText()}${testedText}`);
          log(`  Expected: ${assertion.type}`);
          log(`    Actual: ${actualType}`);
          anyFailures = true;
        } else {
          log(`Type assertion match: ${node.getText()} => ${assertion.type}`);
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

/** Verify that a TypeScript sample has the expected errors and no others. */
export async function checkTs(sample: CodeSample, runCode: boolean, config: ConfigBundle) {
  const {id, content} = sample;
  const fileName = id + (sample.isTSX ? '.tsx' : `.${sample.language}`);
  const tsFile = writeTempFile(fileName, content);
  const sampleDir = getTempDir();
  const nodeModulesPath = path.join(sampleDir, 'node_modules');
  fs.emptyDirSync(nodeModulesPath);
  for (const nodeModule of sample.nodeModules) {
    // For each requested module, look for node_modules in the same directory as the source file
    // and then march up directories until we find it.
    // There's probably a better way to do this.
    let match;
    const candidates = [];
    let dir = path.dirname(path.resolve(process.cwd(), sample.sourceFile));
    while (true) {
      const candidate = path.join(dir, 'node_modules', nodeModule);
      candidates.push(candidate);
      if (fs.pathExistsSync(candidate)) {
        match = candidate;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    if (!match) {
      fail(`Could not find requested node_module ${nodeModule}. See logs for details.`);
      log('Looked in:\n  ' + candidates.join('\n  '));
      return;
    }
    fs.copySync(match, path.join(nodeModulesPath, nodeModule));
  }

  const options: ts.CompilerOptions = {
    ...config.options,
    ...sample.tsOptions,
  };
  if (!_.isEmpty(sample.nodeModules)) {
    options.typeRoots = [path.join(sampleDir, 'node_modules', '@types')];
  }

  const program = ts.createProgram([tsFile], options, config.host);
  const source = program.getSourceFile(tsFile);
  if (!source) {
    fail('Unable to load TS source file');
    return;
  }

  let diagnostics = ts.getPreEmitDiagnostics(program);

  if (runCode) {
    const emitResult = program.emit();
    diagnostics = diagnostics.concat(emitResult.diagnostics);

    if (emitResult.emitSkipped) {
      fail('Failed to emit JavaScript for TypeScript sample.');
      return;
    }
  }

  const expectedErrors = extractExpectedErrors(content);
  const numLines = content.split('\n').length;
  const actualErrorsRaw: TypeScriptError[] = diagnostics
    .map(diagnostic => {
      const {line, character} = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!);
      return {
        line,
        start: character,
        end: character + diagnostic.length!,
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
    const languageVersion = config.options.target || ts.ScriptTarget.ES5;
    const scanner = ts.createScanner(
      languageVersion,
      false,
      source.languageVariant,
      source.getFullText(),
    );
    const checker = program.getTypeChecker();

    const assertions = extractTypeAssertions(scanner, source);
    ok = ok && checkTypeAssertions(source, checker, assertions);
  }

  if (!ok) {
    log(content);
    log(`tsconfig options: ${JSON.stringify(options)}`);
  }

  if (!runCode) return;

  const jsFile = tsFile.replace(/\.ts$/, '.js');
  if (!fs.existsSync(jsFile)) {
    fail(`Did not produce JS output in expected place: ${jsFile}`);
    return;
  }

  sample.output = await runNode(jsFile);
}
