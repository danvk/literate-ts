import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';

const unParsedConfig = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config || {};
const {options: tsOptions} = ts.parseJsonConfigFileContent(unParsedConfig, ts.sys, process.cwd());

console.log('Verifying with TypeScript', ts.version);
console.log('options', tsOptions);

process.chdir('/private/var/folders/t_/3xnk295j79v51cmlqvtnhslc0000gn/T/tmp-1830-5FDAmCNK4pBs');

const host = ts.createCompilerHost(tsOptions, true);
// const srcPath = path.resolve('src/express.ts');
// const srcPath = '/Users/danvk/code/tmp-1830-5FDAmCNK4pBs/express-8.ts';
const srcPath =
  '/private/var/folders/t_/3xnk295j79v51cmlqvtnhslc0000gn/T/tmp-1830-5FDAmCNK4pBs/express-8.ts';

const program = ts.createProgram([srcPath], tsOptions, host);
const source = program.getSourceFile(srcPath);
if (!source) {
  throw new Error('Unable to recover source');
}

const diagnostics = ts.getPreEmitDiagnostics(program);
console.log('diagnostics', diagnostics);

// See https://github.com/JoshuaKGoldberg/eslint-plugin-expect-type/blob/a55413/src/rules/expect.ts#L506-L521
export function getLanguageServiceHost(program: ts.Program): ts.LanguageServiceHost {
  return {
    getCompilationSettings: () => program.getCompilerOptions(),
    getCurrentDirectory: () => program.getCurrentDirectory(),
    // getCurrentDirectory: () =>
    //   '/var/folders/t_/3xnk295j79v51cmlqvtnhslc0000gn/T/tmp-1830-5FDAmCNK4pBs',
    getDefaultLibFileName: options => {
      const libPath = ts.getDefaultLibFilePath(options);
      console.log('libPath', libPath);
      return libPath;
    },
    getScriptFileNames: () => program.getSourceFiles().map(sourceFile => sourceFile.fileName),
    getScriptSnapshot: name =>
      ts.ScriptSnapshot.fromString(program.getSourceFile(name)?.text ?? ''),
    getScriptVersion: () => '1',
    // NB: We can't check `program` for files, it won't contain valid files like package.json
    fileExists: path => {
      const exists = ts.sys.fileExists(path);
      console.log('exists?', path, exists);
      return exists;
    },
    readFile: (path, encoding) => {
      const result = ts.sys.readFile(path, encoding);
      console.log('read', path, '->', result?.length);
      return result;
    },
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
}

const checker = program.getTypeChecker();
const languageService = ts.createLanguageService(getLanguageServiceHost(program));

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

const position = source.getPositionOfLineAndCharacter(12, 4);
const node = getNodeAtPosition(source, position);
if (!node) {
  throw new Error(`Unable to find matching node at ${position}`);
}
console.log('matched node:', node.getText());
const qi = languageService.getQuickInfoAtPosition(source.fileName, node.getStart());
if (!qi?.displayParts) {
  throw new Error(`Unable to get quickinfo for twoslash assertion`);
}
const actual = qi.displayParts.map(dp => dp.text).join('');
console.log('type is', actual);
