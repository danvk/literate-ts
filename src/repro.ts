import ts from 'typescript';

const TS_PROGRAM = `
type T = \`\${number}\`;

const one = 1;
// comment
`;

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
  console.log('tok:', scanner.getTokenText());
}
