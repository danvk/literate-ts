import {readPackageUpSync} from 'read-pkg-up';
import {fileURLToPath} from 'url';
import {dirname} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const VERSION = readPackageUpSync({cwd: __dirname})?.packageJson.version ?? '?.?.?';
