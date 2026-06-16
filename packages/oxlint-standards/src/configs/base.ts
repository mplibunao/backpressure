import type { OxlintConfig } from 'oxlint';

import { generalPreset } from '#oxlint-standards/presets/index.js';
import { composeLintConfigs } from './compose.js';
import { unicornConfig } from './unicorn.js';

type ConfigWithRules = OxlintConfig & { readonly rules: NonNullable<OxlintConfig['rules']> };

const maxStatementsPerFunction = 10;

const baseCoreConfig = {
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
  plugins: ['typescript', 'import', 'oxc'],
  rules: {
    ...generalPreset.rules,
    '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/consistent-type-exports': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    '@typescript-eslint/dot-notation': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': [
      'error',
      {
        allowHigherOrderFunctions: true,
        allowTypedFunctionExpressions: true,
        allowArgumentsExplicitlyTypedAsAny: false,
      },
    ],
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
    'import/no-cycle': 'error',
    'import/no-default-export': 'error',
    'import/no-duplicates': ['error', { preferInline: true }],
    'import/no-named-export': 'off',
    'import/no-nodejs-modules': 'off',
    'import/no-relative-parent-imports': 'error',
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
    'no-continue': 'error',
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
    'no-self-compare': 'error',
    'no-param-reassign': 'error',
    'no-return-assign': 'error',
    'no-script-url': 'error',
    'no-shadow': 'error',
    'no-template-curly-in-string': 'error',
    'no-throw-literal': 'error',
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
    'oxc/approx-constant': 'off',
    'oxc/bad-array-method-on-arguments': 'off',
    'oxc/bad-bitwise-operator': 'off',
    'oxc/bad-char-at-comparison': 'off',
    'oxc/bad-comparison-sequence': 'off',
    'oxc/bad-min-max-func': 'off',
    'oxc/bad-object-literal-comparison': 'off',
    'oxc/bad-replace-all-arg': 'off',
    'oxc/branches-sharing-code': 'off',
    'oxc/const-comparisons': 'off',
    'oxc/double-comparisons': 'off',
    'oxc/erasing-op': 'off',
    'oxc/misrefactored-assign-op': 'off',
    'oxc/missing-throw': 'off',
    'oxc/no-accumulating-spread': 'off',
    'oxc/no-async-await': 'off',
    'oxc/no-async-endpoint-handlers': 'off',
    'oxc/no-barrel-file': 'error',
    'oxc/no-const-enum': 'off',
    'oxc/no-map-spread': 'off',
    'oxc/no-optional-chaining': 'off',
    'oxc/no-rest-spread-properties': 'off',
    'oxc/no-this-in-exported-function': 'off',
    'oxc/number-arg-out-of-range': 'off',
    'oxc/only-used-in-recursion': 'off',
    'oxc/uninvoked-array-callback': 'off',
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
      // Package entrypoints are intentional public API surfaces; banning barrels there would make exports less discoverable.
      files: ['**/src/index.ts'],
      rules: {
        'oxc/no-barrel-file': 'off',
      },
    },
    {
      // Tool config loaders such as vite, vitest, and stryker require or conventionally expect default exports.
      files: ['**/*.config.*'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
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

export const baseConfig = composeLintConfigs(baseCoreConfig, unicornConfig) as ConfigWithRules;
