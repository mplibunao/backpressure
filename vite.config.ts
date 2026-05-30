import { defineConfig } from 'vite-plus';

const toolIgnorePatterns = [
  '**/*.md',
  '.claude/**',
  '.pnpm-store/**',
  'coverage/**',
  'dist/**',
  '**/dist/**',
  'node_modules/**',
  '**/node_modules/**',
  'styles/**',
];

export default defineConfig({
  fmt: {
    ignorePatterns: toolIgnorePatterns,
    semi: true,
    singleQuote: true,
    sortPackageJson: true,
  },
  lint: {
    categories: {
      correctness: 'error',
      nursery: 'off',
      pedantic: 'off',
      restriction: 'error',
      style: 'error',
      suspicious: 'error',
    },
    ignorePatterns: toolIgnorePatterns,
    options: {
      reportUnusedDisableDirectives: 'error',
      typeAware: true,
      typeCheck: true,
    },
    plugins: ['typescript', 'import', 'vitest'],
    rules: {
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      complexity: ['error', 20],
      'import/max-dependencies': ['error', { max: 15 }],
      'import/no-default-export': 'off',
      'import/no-named-export': 'off',
      'max-depth': ['error', 4],
      'max-lines': ['error', 500],
      'max-lines-per-function': ['error', 75],
      'max-params': ['error', 4],
      'no-console': 'error',
      'no-else-return': 'error',
      'no-magic-numbers': ['error', { ignore: [0, 1, 4, 15, 20, 75, 500] }],
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'no-unneeded-ternary': 'error',
    },
  },
  staged: {
    '*.{js,ts,tsx,jsx,json}': 'vp check --fix',
    '*.{md,mdx}': 'pnpm prose',
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    include: ['packages/**/*.test.ts'],
  },
});
