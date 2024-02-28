/** @type {import("@types/eslint").Linter.Config} */
module.exports = {
  env: {
    es2022: true,
    node: true,
  },
  extends: ['eslint:recommended', 'plugin:n/recommended'],
  overrides: [
    {
      extends: ['plugin:@typescript-eslint/recommended'],
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      rules: {
        // These off-by-default rules work well for this repo and we like them on.
        'logical-assignment-operators': ['error', 'always', {enforceForIfStatements: true}],
        'operator-assignment': 'error', // Disable autofixing "let" -> "const" just because I haven't mutated it _yet_.
        // Autofixing `() => fn()` -> `() => { fn() }` is a recipe for trouble.
        '@typescript-eslint/no-confusing-void-expression': 'off',
        '@typescript-eslint/no-unnecessary-condition': [
          'error',
          {
            // why isn't this the default?
            // https://github.com/typescript-eslint/typescript-eslint/issues/7047
            allowConstantLoopConditions: true,
          },
        ],
        'no-autofix/@typescript-eslint/no-confusing-void-expression': 'warn',
        'no-autofix/prefer-const': 'warn',
        'perfectionist/sort-interfaces': 'off',
        'prefer-const': 'off',
      },
    },
    {
      files: '**/*.md/*.ts',
      rules: {
        'n/no-missing-import': ['error', {allowModules: ['literate-ts']}],
      },
    },
    {
      extends: ['plugin:@typescript-eslint/recommended-type-checked'],
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'no-autofix'],
  reportUnusedDisableDirectives: true,
  root: true,
  rules: {
    // These off/less-strict-by-default rules work well for this repo and we like them on.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        args: 'all',
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],

    // These on-by-default rules don't work well for this repo and we like them off.
    'no-case-declarations': 'off',
    'no-constant-condition': 'off',
    'no-inner-declarations': 'off',
    'no-mixed-spaces-and-tabs': 'off',
  },
};
