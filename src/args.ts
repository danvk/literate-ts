import ts from 'typescript';
import yargs from 'yargs';
import {VERSION} from './version.js';

export const argSchema = yargs()
  .strict()
  .demandCommand(1, 'Must specify path to at least one source file.')
  .options({
    replacements: {
      type: 'string',
      description:
        'If specified, load **/*.{ts,js,txt} under this directory' +
        'as additional sources. See README.md for details on how to use these.',
      alias: 'r',
    },
    filter: {
      type: 'string',
      description: 'Only check IDs with the given prefix',
      alias: 'f',
    },
    alsologtostderr: {
      type: 'boolean',
      description: 'Log to stderr in addition to a log file',
    },
    nocache: {
      type: 'boolean',
      description: `Don't read previous results from cache.`,
    },
    playground: {
      type: 'boolean',
      description: `Output a JSON file containing TypeScript Playground URLs.`,
    },
  })
  .version(
    'version',
    [`literate-ts version: ${VERSION}`, `TypeScript version: ${ts.version}`].join('\n'),
  );

export type Args = ReturnType<typeof argSchema.parseSync>;
