import type { OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import { unicornConfig } from './unicorn.js';

vi.setConfig({ testTimeout: 1000 });

// Cast to OxlintConfig so optional fields absent from the narrowed literal type are accessible.
const config = unicornConfig as OxlintConfig;
const rules = config.rules ?? {};

const sweptErrorRules = [
  'unicorn/no-array-reverse',
  'unicorn/no-array-sort',
  'unicorn/no-await-in-promise-methods',
  'unicorn/no-empty-file',
  'unicorn/no-single-promise-in-promise-methods',
  'unicorn/no-thenable',
  'unicorn/no-unnecessary-await',
  'unicorn/no-useless-fallback-in-spread',
  'unicorn/no-useless-length-check',
  'unicorn/no-useless-spread',
  'unicorn/prefer-modern-math-apis',
  'unicorn/prefer-number-properties',
  'unicorn/prefer-set-size',
  'unicorn/prefer-string-starts-ends-with',
] as const;
const explicitErrorRules = [
  'unicorn/error-message',
  'unicorn/new-for-builtins',
  'unicorn/no-static-only-class',
  'unicorn/no-typeof-undefined',
  'unicorn/no-useless-promise-resolve-reject',
  'unicorn/no-useless-switch-case',
  'unicorn/no-useless-undefined',
  'unicorn/prefer-array-find',
  'unicorn/prefer-array-flat-map',
  'unicorn/prefer-array-some',
  'unicorn/prefer-date-now',
  'unicorn/prefer-includes',
  'unicorn/prefer-math-min-max',
  'unicorn/prefer-math-trunc',
  'unicorn/prefer-native-coercion-functions',
  'unicorn/prefer-optional-catch-binding',
  'unicorn/prefer-regexp-test',
  'unicorn/prefer-string-slice',
  'unicorn/prefer-structured-clone',
  'unicorn/throw-new-error',
] as const;
const heldOrDeferredRules = [
  'unicorn/filename-case',
  'unicorn/no-invalid-fetch-options',
  'unicorn/no-invalid-remove-event-listener',
  'unicorn/number-literal-case',
  'unicorn/switch-case-braces',
] as const;
const effectAndBunConflictRules = [
  'unicorn/consistent-function-scoping',
  'unicorn/custom-error-definition',
  'unicorn/no-instanceof-builtins',
  'unicorn/no-null',
  'unicorn/numeric-separators-style',
  'unicorn/prefer-logical-operator-over-ternary',
  'unicorn/prefer-ternary',
] as const;

describe('unicorn config fragment', () => {
  it('declares the unicorn plugin for base composition', () => {
    expect(config.plugins).toStrictEqual(['unicorn']);
  });

  it('leaves category-swept DP-2 rules to the live oxlint categories', () => {
    for (const ruleName of sweptErrorRules) {
      expect(rules).not.toHaveProperty(ruleName);
    }
  });

  it('pins the explicit DP-2 unicorn entries at their decided severities', () => {
    for (const ruleName of explicitErrorRules) {
      expect(rules[ruleName]).toBe('error');
    }

    expect(rules['unicorn/prefer-set-has']).toBe('warn');
  });

  it('keeps held, deferred, browser-family, and idiom-conflict rules silenced', () => {
    for (const ruleName of [...heldOrDeferredRules, ...effectAndBunConflictRules]) {
      expect(rules[ruleName]).toBe('off');
    }
  });

  it('does not own the Node/Bun runtime node: protocol rule', () => {
    expect(rules['unicorn/prefer-node-protocol']).toBe('off');
  });
});
