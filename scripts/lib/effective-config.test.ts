import { beforeAll, describe, expect, it, vi } from 'vitest';

import { oxlintBin } from '../packages/oxlint-standards/package.ts';
import { buildOxlintRuleCatalog, isConfiguredRuleKnown } from './effective-config.ts';

// These tests shell out to the oxlint binary and are slower than unit tests.
vi.setConfig({ testTimeout: 15_000 });

// The real plugin name for the package — custom-plugin rules under this prefix bypass the catalog.
const pluginName = '@mplibunao/oxlint-standards';

describe('isConfiguredRuleKnown — catalog recognition regression', () => {
  // Shared catalog built once for all cases; rebuilding per-test would be unnecessarily slow.
  let catalog: ReadonlySet<string> = new Set<string>();

  beforeAll(() => {
    catalog = buildOxlintRuleCatalog(oxlintBin);
  });

  // Translates the boolean result to a label string to avoid the prefer-to-be-truthy /
  // Prefer-strict-boolean-matchers conflict active in the root config until WI-8 resolves it.
  const classify = (ruleName: string): string =>
    isConfiguredRuleKnown(ruleName, catalog, pluginName) ? 'known' : 'unknown';

  // Rules the package actively configures: must always pass the gate.
  it.for([
    // TypeScript extension rules: eslint-scope in --rules output, accepted under @typescript-eslint/ alias.
    '@typescript-eslint/no-unused-vars',
    '@typescript-eslint/no-useless-constructor',
    // Real typescript-scope rule — covered via normalizeTypescriptAlias in the catalog build.
    '@typescript-eslint/array-type',
    // Non-typescript plugin rules.
    'unicorn/prefer-node-protocol',
    'oxc/no-barrel-file',
  ] as const)('recognizes %s', (ruleName) => {
    expect(classify(ruleName)).toBe('known');
  });

  // Rules that must NEVER pass the gate.
  it.for([
    // Valid eslint rule but NOT a TypeScript extension — must not pass under @typescript-eslint/*.
    '@typescript-eslint/no-alert',
    // Typo in rule name.
    '@typescript-eslint/no-unused-varz',
    // Typo in scope name (double 'r').
    'oxc/no-barrell-file',
    // Completely bogus namespace.
    'bogus/no-unused-vars',
  ] as const)('rejects %s', (ruleName) => {
    expect(classify(ruleName)).toBe('unknown');
  });
});
