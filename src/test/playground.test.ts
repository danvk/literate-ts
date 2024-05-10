import ts from 'typescript';
import {getPlaygroundUrl} from '../playground.js';

describe('getPlaygroundUrl', () => {
  it('should encode a playground URL for a code snippet', () => {
    expect(getPlaygroundUrl(`console.log(2+2);`, {}, '5.3.3')).toEqual(
      'https://www.typescriptlang.org/play/?ts=5.3.3#code/MYewdgziA2CmB00QHMAUAmA1OglAbiA=',
    );
  });

  it('should encode a playground URL with options', () => {
    expect(
      getPlaygroundUrl(
        `console.log(2+2);`,
        {strict: true, target: ts.ScriptTarget.ES2022},
        '5.5.0-beta',
      ),
    ).toEqual(
      'https://www.typescriptlang.org/play/?ts=5.5.0-beta&strict=true&target=9#code/MYewdgziA2CmB00QHMAUAmA1OglAbiA=',
    );
  });
});
