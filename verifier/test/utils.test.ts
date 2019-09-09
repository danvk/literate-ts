import {matchAndExtract} from '../utils';

describe('utils', () => {
  test('matchAndExtract', () => {
    const pat = /foo (bar)/;
    expect(matchAndExtract(pat, 'foo bar')).toEqual('bar');
    expect(matchAndExtract(pat, 'hello foo bar baz')).toEqual('bar');
    expect(matchAndExtract(pat, 'foo baz')).toEqual(null);
  });
});
