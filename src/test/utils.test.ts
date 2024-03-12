import ts from 'typescript';

import {dedent, getEnumValue, matchAndExtract, reduceIndentation, sha256} from '../utils.js';

describe('utils', () => {
  test('matchAndExtract', () => {
    const pat = /foo (bar)/;
    expect(matchAndExtract(pat, 'foo bar')).toEqual('bar');
    expect(matchAndExtract(pat, 'hello foo bar baz')).toEqual('bar');
    expect(matchAndExtract(pat, 'foo baz')).toEqual(null);
  });

  test('sha256', () => {
    expect(sha256('')).toMatchInlineSnapshot(
      `"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"`,
    );
  });

  test('reduce indentation', () => {
    expect(
      reduceIndentation(dedent`
      function foo(nums) {
          for (num of nums) {
              console.log(num);
          }
      }
    `),
    ).toEqual(dedent`
    function foo(nums) {
      for (num of nums) {
        console.log(num);
      }
    }
  `);
  });

  test('getEnumValue', () => {
    expect(getEnumValue('ScriptTarget', ts.ScriptTarget, 2)).toEqual(2);
    expect(getEnumValue('ScriptTarget', ts.ScriptTarget, '2')).toEqual(2);
    expect(getEnumValue('ScriptTarget', ts.ScriptTarget, 'ES2020')).toEqual(7);
    expect(() => getEnumValue('ScriptTarget', ts.ScriptTarget, 'ES2007')).toThrow(
      /ES2007 is not a valid ScriptTarget. Expected one of: 0, 1, 2, 3, 4, 5, 6, 7/,
    );
    expect(() => getEnumValue('ScriptTarget', ts.ScriptTarget, 2007)).toThrow(
      /2007 is not a valid ScriptTarget. Expected one of: 0, 1, 2, 3, 4, 5, 6, 7/,
    );
  });
});
