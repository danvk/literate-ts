import fs from 'fs';

import ts from 'typescript';

import {
  extractExpectedErrors,
  hasTypeAssertions,
  extractTypeAssertions,
  checkTypeAssertions,
  getLanguageServiceHost,
} from '../ts-checker';
import {dedent} from '../utils';

describe('ts-checker', () => {
  describe('extractExpectedErrors', () => {
    test('basic functionality', () => {
      expect(
        extractExpectedErrors(dedent`
        const city = 'new york city';
        console.log(city.toUppercase());
                      // ~~~~~~~~~~~ Property 'toUppercase' does not exist.
        // 345678901234567890123456789
        //        1         2
      `),
      ).toEqual([
        {
          line: 1,
          start: 17,
          end: 28,
          message: `Property 'toUppercase' does not exist.`,
        },
      ]);
    });

    test('multiline error', () => {
      expect(
        extractExpectedErrors(dedent`
        const city = 'new york city';
        console.log(city.toUppercase());
                      // ~~~~~~~~~~~ Property 'toUppercase' does not exist.
                      //             Did you mean 'toUpperCase'?
      `),
      ).toEqual([
        {
          line: 1,
          start: 17,
          end: 28,
          message: `Property 'toUppercase' does not exist. Did you mean 'toUpperCase'?`,
        },
      ]);
    });

    test('two errors on a line', () => {
      expect(
        extractExpectedErrors(dedent`
        function add(a, b) {
                  // ~    Parameter 'a' implicitly has an 'any' type.
                  //    ~ Parameter 'b' implicitly has an 'any' type.
        // 345678901234567890123456789
        //        1         2
          return a + b;
        }
      `),
      ).toEqual([
        {
          line: 0,
          start: 13,
          end: 14,
          message: `Parameter 'a' implicitly has an 'any' type.`,
        },
        {
          line: 0,
          start: 16,
          end: 17,
          message: `Parameter 'b' implicitly has an 'any' type.`,
        },
      ]);

      expect(
        extractExpectedErrors(dedent`
        if (pt.x < box.x[0] || pt.x > box.x[1] ||
            //     ~~~                ~~~  Object is possibly undefined
        // 3456789012345678901234567890123
        //        1         2         3
      `),
      ).toEqual([
        {
          line: 0,
          start: 11,
          end: 14,
          message: `Object is possibly undefined`,
        },
        {
          line: 0,
          start: 30,
          end: 33,
          message: `Object is possibly undefined`,
        },
      ]);
    });

    test('comment on first line', () => {
      expect(
        extractExpectedErrors(dedent`
        // HIDE
        type Shape = null;
        // END
        function calculateArea(shape: Shape) {
          if ('height' in shape) {
            return shape.width * shape.height;  // shape's type is Rectangle
          } else {
            return shape.width * shape.width;  // shape's type is Square
          }
        }
      `),
      ).toEqual([]);
    });

    test('error with no expected message', () => {
      expect(
        extractExpectedErrors(dedent`
        const states: State[] = [
          {name: 'Alaska',  capitol: 'Juneau'},
                         // ~~~~~~~~~~~~~~~~~
        // 3456789012345678901234567890123456789
        //        1         2         3
          {name: 'Arizona', capitol: 'Phoenix'},
                         // ~~~~~~~~~~~~~~~~~~ Object literal may only specify known
        ];
      `),
      ).toEqual([
        {
          line: 1,
          start: 20,
          end: 37,
          message: '',
        },
        {
          line: 5,
          start: 20,
          end: 38,
          message: `Object literal may only specify known`,
        },
      ]);
    });
  });

  test('hasTypeAssertions', () => {
    expect(
      hasTypeAssertions(dedent`
      for (const x of xs) {
        x;  // type is number
      }`),
    ).toBe(true);

    expect(
      hasTypeAssertions(dedent`
      for (const xValue of xs) {
        xValue;
        // ^? const xValue: number
      }`),
    ).toBe(true);

    expect(
      hasTypeAssertions(dedent`
      for (const x of xs) {
        x;  // number
      }`),
    ).toBe(false);
  });

  const getAssertions = (text: string) => {
    const testFile = ts.createSourceFile('test.ts', text, ts.ScriptTarget.ES2015);
    const scanner = ts.createScanner(
      ts.ScriptTarget.ES2015,
      false,
      testFile.languageVariant,
      testFile.getFullText(),
    );
    return extractTypeAssertions(scanner, testFile);
  };

  describe('extractTypeAssertions', () => {
    test('simple same-line assertion', () => {
      expect(
        getAssertions(dedent`
        for (const x of xs) {
          x;  // type is number
        }`),
      ).toEqual([
        {
          line: 1,
          type: 'number',
        },
      ]);
    });

    test('assertion with an adjective', () => {
      expect(
        getAssertions(dedent`
        for (const x of xs) {
          x;  // type is just number
        }`),
      ).toEqual([
        {
          line: 1,
          type: 'number',
        },
      ]);
    });

    test('assertion on on next line', () => {
      expect(
        getAssertions(dedent`
        type T = typeof document.getElementById;
          // type is (elementId: string) => HTMLElement | null
        `),
      ).toEqual([
        {
          line: 0,
          type: '(elementId: string) => HTMLElement | null',
        },
      ]);
    });

    test('multiline assertion', () => {
      expect(
        getAssertions(dedent`
        const o = {x: 1, y: 2};
        // type is {
        //   x: number;
        //   y: number;
        // }
        function addWithExtras(a: number, b: number) {
          const c = a + b;  // type is number
          // ...
          return c;
        }
        `),
      ).toEqual([
        {
          line: 0,
          type: '{ x: number; y: number; }',
        },
        {
          line: 6,
          type: 'number',
        },
      ]);
    });
  });

  describe('extractTypeAssertions twoslash', () => {
    test('simple twoslash assertion', () => {
      expect(
        getAssertions(dedent`
        for (const xValue of xs) {
          xValue;
          // ^? const xValue: number
        }`),
      ).toEqual([
        {
          line: 1,
          character: 5,
          position: 32,
          type: 'const xValue: number',
        },
      ]);
    });

    test('multiline twoslash assertion', () => {
      expect(
        getAssertions(dedent`
        const o = {x: 1, y: 2};
        //    ^? const o: {
        //         x: number;
        //         y: number;
        //       }
        function addWithExtras(a: number, b: number) {
          const c = a + b;
          //    ^? const c: number
          // ...
          return c;
        }
        `),
      ).toEqual([
        {
          line: 0,
          character: 6,
          position: 6,
          type: 'const o: { x: number; y: number; }',
        },
        {
          line: 6,
          character: 8,
          position: 154,
          type: 'const c: number',
        },
      ]);
    });
  });

  describe('checkTypeAssertions', () => {
    // const unParsedConfig = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config || {};
    const config = ts.parseJsonConfigFileContent(
      {
        compilerOptions: {
          strictNullChecks: true,
          module: 'commonjs',
        },
      },
      ts.sys,
      process.cwd(),
    );
    // const host = ts.createCompilerHost(config.options, true);

    const checkAssertions = (text: string) => {
      // TODO(danvk): it would be nice to not write to disk here, but using a virtual sourceFile
      //              brought up many errors inside the TypeScript compiler.
      const filename = `/tmp/test.ts`;
      fs.writeFileSync(filename, text, 'utf8');
      // const sourceFile = ts.createSourceFile(filename, text, ts.ScriptTarget.ES2015, true /* setParentNodes */);
      const program = ts.createProgram([filename], config.options /*, host */);
      const sourceFile = program.getSourceFile(filename);
      if (!sourceFile) {
        throw new Error('could not get sourceFile');
      }
      const scanner = ts.createScanner(
        ts.ScriptTarget.ES2015,
        false,
        sourceFile.languageVariant,
        sourceFile.getFullText(),
      );

      const assertions = extractTypeAssertions(scanner, sourceFile);
      const languageService = ts.createLanguageService(getLanguageServiceHost(program));
      return checkTypeAssertions(sourceFile, program.getTypeChecker(), languageService, assertions);
    };

    test('type assertion on a value', () => {
      expect(
        checkAssertions(dedent`
        const x = 2 + '3';  // ok, x's type is string
        const y = '2' + 3;  // ok, y's type is string
      `),
      ).toBe(true);
    });

    test('type assertion on a type', () => {
      expect(
        checkAssertions(dedent`
        type T = typeof document.getElementById;
        // type is (elementId: string) => HTMLElement | null
      `),
      ).toBe(true);
    });

    test('type assertion on a nested value', () => {
      expect(
        checkAssertions(dedent`
        const o = { x: 'a' };
        o;  // type is { x: string; }
        o.x;  // type is string
      `),
      ).toBe(true);
    });

    test('type assertion on a multiline value', () => {
      expect(
        checkAssertions(dedent`
        const o = {
          x: 'a',
        };  // type is { x: string; }
      `),
      ).toBe(true);
    });

    test('type assertion on a call expression', () => {
      expect(
        checkAssertions(dedent`
        const double = (n: number) => ('' + n * n);
        double(10);  // type is string
      `),
      ).toBe(true);
    });

    test('multiline type assertions', () => {
      expect(
        checkAssertions(dedent`
        const v = {x: 10, y: 20};
        // type is {
        //   x: number;
        //   y: number;
        // }
      `),
      ).toBe(true);
    });

    test('type assertion with ellipsis', () => {
      expect(
        checkAssertions(dedent`
        const v = { foo: 0, bar: 1, baz: 2, quux: 3 };
        type T = keyof typeof v;  // type is "foo" | "bar" | "baz" | ...
        `),
      ).toBe(true);
    });

    test('type assertion with excitement', () => {
      expect(
        checkAssertions(dedent`
        type T = ['a', 'b'][number];  // type is "a" | "b"!
        `),
      ).toBe(true);
    });

    describe('twoslash assertions', () => {
      test('simple assertions', () => {
        expect(
          checkAssertions(dedent`
          const x = 2 + '3';
          //    ^? const x: string
          const y = '2' + 3;
          //    ^? const y: string
        `),
        ).toBe(true);
      });

      test('failing assertion', () => {
        expect(
          checkAssertions(dedent`
          const x = 2 + '3';
          //    ^? const x: number
          `),
        ).toBe(false);
      });

      test('type assertion on a type', () => {
        expect(
          checkAssertions(dedent`
          type T = typeof document.getElementById;
          //   ^? type T = (elementId: string) => HTMLElement | null
        `),
        ).toBe(true);
      });
    });

    // third-party type
    // test('type assertion on a third-party type', () => {
    //   expect(checkAssertions(dedent`
    //     import {Geometry} from 'geojson';
    //     declare let g: Geometry;
    //     if (g.type === 'Point') {
    //       const {coordinates} = g;  // type is number[]
    //     }
    //   `)).toBe(true);
    // });

    // test('type assertion on a third-party type', () => {
    //   expect(checkAssertions(dedent`
    //     import {foo} from '/tmp/module';
    //     foo  // type is number
    //   `)).toBe(true);
    // });
  });
});
