import type { OxlintConfig } from 'oxlint';

// Vitest test-hygiene fragment.
// Plugin declared globally so oxlint resolves the vitest/* namespace.
// All vitest rules are silenced at top level first to prevent category-activation bleed
// (e.g. correctness: 'error' from baseConfig would fire vitest rules on non-test files).
// The test-file override re-enables only the focused hygiene rules.
//
// Glob scope: rules apply to `**/*.test.ts` (repo convention).
// Consumers using `*.spec.ts` or `*.test.tsx` must extend the override with their own glob.
// Do not broaden this glob without a real consumer.
export const vitestConfig = {
  plugins: ['vitest'],
  rules: {
    // Globally silenced — re-enabled selectively in the test-file override below.
    // Listing all rules explicitly prevents category-activation bleed onto non-test files
    // (regardless of what categories a consumer sets alongside this fragment).
    'vitest/consistent-each-for': 'off',
    'vitest/consistent-test-filename': 'off',
    'vitest/consistent-vitest-vi': 'off',
    'vitest/hoisted-apis-on-top': 'off',
    'vitest/no-conditional-tests': 'off',
    'vitest/no-import-node-test': 'off',
    // Explicit imports are the repo style (vi.setConfig uses explicit imports).
    // The live root config already sets this off; preserving it here keeps WI-8 a no-op.
    'vitest/no-importing-vitest-globals': 'off',
    'vitest/prefer-called-exactly-once-with': 'off',
    'vitest/prefer-called-once': 'off',
    'vitest/prefer-called-times': 'off',
    'vitest/prefer-describe-function-title': 'off',
    'vitest/prefer-expect-type-of': 'off',
    'vitest/prefer-import-in-mock': 'off',
    'vitest/prefer-strict-boolean-matchers': 'off',
    'vitest/prefer-to-be-falsy': 'off',
    'vitest/prefer-to-be-object': 'off',
    'vitest/prefer-to-be-truthy': 'off',
    'vitest/require-awaited-expect-poll': 'off',
    'vitest/require-local-test-context-for-concurrent-snapshots': 'off',
    'vitest/require-mock-type-parameters': 'off',
    // Individual test timeouts conflict with the vi.setConfig({ testTimeout }) pattern.
    'vitest/require-test-timeout': 'off',
    'vitest/warn-todo': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.ts'],
      rules: {
        // The vi.mock / vi.hoisted declarations must be at the top of the file; otherwise hoisting fails silently.
        'vitest/hoisted-apis-on-top': 'error',
        // Conditional tests (if/switch inside test body) hide failures — a skipped branch never fails.
        'vitest/no-conditional-tests': 'error',
        // The expect.poll() call must be awaited; calling it without await produces a false pass.
        'vitest/require-awaited-expect-poll': 'error',
        // The .todo / .skip markers left in CI silently omit coverage without failing.
        'vitest/warn-todo': 'error',
      },
    },
  ],
} satisfies OxlintConfig;
