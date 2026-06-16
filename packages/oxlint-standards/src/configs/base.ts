import type { OxlintConfig } from 'oxlint';

import { generalPreset } from '../presets/index.js';

const maxStatementsPerFunction = 10;

export const baseConfig = {
  categories: {
    correctness: 'error',
    nursery: 'off',
    pedantic: 'off',
    restriction: 'error',
    style: 'off',
    suspicious: 'error',
  },
  jsPlugins: [...generalPreset.jsPlugins],
  options: {
    reportUnusedDisableDirectives: 'error',
  },
  plugins: ['typescript', 'import'],
  rules: {
    ...generalPreset.rules,
    '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/consistent-type-exports': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    '@typescript-eslint/dot-notation': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-empty-interface': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-import-type-side-effects': 'error',
    '@typescript-eslint/no-inferrable-types': 'error',
    '@typescript-eslint/no-invalid-void-type': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/no-restricted-types': 'error',
    '@typescript-eslint/no-this-alias': 'error',
    '@typescript-eslint/no-unnecessary-type-constraint': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-useless-constructor': 'error',
    '@typescript-eslint/prefer-function-type': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    complexity: ['error', 20],
    curly: 'error',
    'default-param-last': 'error',
    eqeqeq: 'error',
    'guard-for-in': 'error',
    'import/consistent-type-specifier-style': 'off',
    'import/exports-last': 'off',
    'import/first': 'error',
    'import/group-exports': 'off',
    'import/max-dependencies': ['error', { max: 15 }],
    'import/no-cycle': 'off',
    'import/no-default-export': 'off',
    'import/no-duplicates': ['error', { preferInline: true }],
    'import/no-named-export': 'off',
    'import/no-nodejs-modules': 'off',
    'import/no-relative-parent-imports': 'off',
    'import/no-self-import': 'error',
    'import/prefer-default-export': 'off',
    'max-depth': ['error', 4],
    'max-lines': ['error', 500],
    'max-lines-per-function': ['error', 75],
    'max-params': ['error', 4],
    'max-statements': ['error', { max: maxStatementsPerFunction }],
    'no-async-promise-executor': 'error',
    'no-cond-assign': 'error',
    'no-console': 'error',
    'no-continue': 'off',
    'no-debugger': 'error',
    'no-duplicate-imports': 'off',
    'no-else-return': 'error',
    'no-empty': 'error',
    'no-eval': 'error',
    'no-implicit-coercion': 'error',
    'no-magic-numbers': ['error', { ignore: [0, 1, 4, 15, 20, 75, 500] }],
    'no-multi-assign': 'error',
    'no-nested-ternary': 'error',
    'no-new-func': 'error',
    'no-param-reassign': 'error',
    'no-return-assign': 'error',
    'no-script-url': 'error',
    'no-shadow': 'error',
    'no-template-curly-in-string': 'error',
    'no-ternary': 'off',
    // TypeScript compiler already reports undefined identifiers (TS2304) with full env/type
    // awareness in the same check pipeline. no-undef adds nothing it catches and false-positives
    // on runtime globals (process, Bun) without per-consumer env declarations;
    // typescript-eslint recommends keeping it off for TS.
    'no-undef': 'off',
    'no-unneeded-ternary': 'error',
    'no-unsafe-optional-chaining': 'error',
    'no-unused-private-class-members': 'error',
    'no-useless-catch': 'error',
    'no-void': 'error',
    'oxc/no-barrel-file': 'off',
    'prefer-const': 'error',
    'prefer-promise-reject-errors': 'error',
    'prefer-template': 'error',
    // oxlint has no autofixable import-ordering rule (no import/order) and oxfmt does not sort
    // imports, so sort-imports is not autofixable across statements and imposes permanent manual
    // churn on every consumer; MP decided to drop it; import order is left to review.
    'sort-imports': 'off',
  },
  overrides: [
    {
      // Test files are intentionally fixture-heavy, but depth/params/complexity still catch hard-to-read test structure.
      files: ['**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-type-assertion': 'off',
        // Test files build partial mock AST nodes via forced casts; this is the same
        // test-mock concession already granted to no-unsafe-type-assertion, and it
        // benefits every consumer's test suite. The plugin prefix is required because
        // no-double-cast is a custom JS-plugin rule, not a native oxlint rule.
        '@mplibunao/oxlint-standards/no-double-cast': 'off',
        'import/max-dependencies': 'off',
        'max-lines': 'off',
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'no-magic-numbers': 'off',
      },
    },
  ],
} satisfies OxlintConfig;
