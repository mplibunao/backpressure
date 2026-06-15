import type { OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import { vitestConfig } from './vitest.js';

vi.setConfig({ testTimeout: 1000 });

// Cast to OxlintConfig so optional fields absent from the narrowed literal type are accessible.
const config = vitestConfig as OxlintConfig;
const globalRules = config.rules ?? {};
const testFileOverride = config.overrides?.find((ov) => ov.files?.includes('**/*.test.ts'));

describe('vitest config fragment', () => {
  it('declares the vitest plugin at top level', () => {
    expect(config.plugins).toContain('vitest');
  });

  it('silences all vitest rules globally to prevent category bleed onto non-test files', () => {
    // Every vitest rule must be explicitly off at the top level. The override re-enables
    // The specific hygiene rules we want. Without this, category settings
    // (e.g. correctness: 'error' from baseConfig) would activate them globally.
    const vitestRules = Object.entries(globalRules).filter(([key]) => key.startsWith('vitest/'));
    const activeGlobalRules = vitestRules.filter(([, value]) => value !== 'off');

    expect(activeGlobalRules).toStrictEqual([]);
    expect(vitestRules.length).toBeGreaterThan(0);
  });

  it('carries the live-compat off for no-importing-vitest-globals in global rules', () => {
    // The live root config sets this off; preserving it here means WI-8 dogfood is a no-op.
    // It is globally off (not just in the override) because explicit imports are the repo style.
    expect(globalRules['vitest/no-importing-vitest-globals']).toBe('off');
  });

  it('silences require-test-timeout globally (conflicts with vi.setConfig testTimeout pattern)', () => {
    expect(globalRules['vitest/require-test-timeout']).toBe('off');
  });

  it('carries exactly one override scoped to the test-file glob', () => {
    expect(config.overrides).toHaveLength(1);
    expect(testFileOverride).toBeDefined();
    expect(testFileOverride?.files).toContain('**/*.test.ts');
  });

  it('silences all jest/* rules globally to prevent category bleed onto non-test files', () => {
    // Oxlint routes vitest-compatible hygiene through jest/* because vitest implements the jest API.
    // Every jest/* rule must be explicitly off at global level; the override re-enables them scoped.
    const jestRules = Object.entries(globalRules).filter(([key]) => key.startsWith('jest/'));
    const activeGlobalJestRules = jestRules.filter(([, value]) => value !== 'off');

    expect(activeGlobalJestRules).toStrictEqual([]);
    expect(jestRules.length).toBeGreaterThan(0);
  });

  it('enables exactly these 11 jest test-hygiene rules in the test-file override', () => {
    const overrideRules = testFileOverride?.rules ?? {};
    const activeJestOverrideRules = Object.entries(overrideRules)
      .filter(([key]) => key.startsWith('jest/'))
      .filter(([, value]) => value !== 'off')
      .map(([key]) => key)
      .sort();

    expect(activeJestOverrideRules).toStrictEqual([
      'jest/expect-expect',
      'jest/no-commented-out-tests',
      'jest/no-conditional-expect',
      'jest/no-disabled-tests',
      'jest/no-export',
      'jest/no-focused-tests',
      'jest/no-standalone-expect',
      'jest/require-to-throw-message',
      'jest/valid-describe-callback',
      'jest/valid-expect',
      'jest/valid-title',
    ]);
  });

  it('enables exactly these four hygiene rules in the test-file override and no others', () => {
    const overrideRules = testFileOverride?.rules ?? {};
    // Sorting makes the assertion order-independent and deterministic across future edits.
    const activeVitestOverrideRules = Object.entries(overrideRules)
      .filter(([key]) => key.startsWith('vitest/'))
      .filter(([, value]) => value !== 'off')
      .map(([key]) => key)
      .sort();

    expect(activeVitestOverrideRules).toStrictEqual([
      'vitest/hoisted-apis-on-top',
      'vitest/no-conditional-tests',
      'vitest/require-awaited-expect-poll',
      'vitest/warn-todo',
    ]);
  });
});
