import {dedent, matchAndExtract, reduceIndentation, sha256} from '../utils.js';

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
});
