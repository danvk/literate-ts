import {readPackageUpSync} from 'read-pkg-up';

export const VERSION = readPackageUpSync({cwd: __dirname})?.packageJson.version ?? '?.?.?';
