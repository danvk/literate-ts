import ts from 'typescript';

const TS_PROGRAM = `
interface Foo {
  method(param: \`#\${string}\`): string;
}

const img = document.querySelector('img');
//    ^? const img: Element`;

const unParsedConfig = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config || {};
const {options: tsOptions} = ts.parseJsonConfigFileContent(unParsedConfig, ts.sys, process.cwd());

const host = ts.createCompilerHost(tsOptions, true);

console.log(TS_PROGRAM);

const scanner = ts.createScanner(
  ts.ScriptTarget.ES2015,
  false,
  ts.LanguageVariant.Standard,
  TS_PROGRAM,
  (msg, len, arg0) => {
    console.error('err!', msg, len, arg0);
  },
);

while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
  // const token = scanner.getToken();
  console.log('tok:', scanner.getTokenText());
}
