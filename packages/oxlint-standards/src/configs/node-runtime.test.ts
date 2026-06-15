import type { OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import { nodeRuntimeConfig } from './node-runtime.js';

vi.setConfig({ testTimeout: 1000 });

// Cast to OxlintConfig so optional fields absent from the narrowed literal type are accessible.
const config = nodeRuntimeConfig as OxlintConfig;
const rules = config.rules ?? {};

describe('nodeRuntime config fragment', () => {
  it('declares the unicorn plugin', () => {
    expect(config.plugins).toContain('unicorn');
  });

  it('enforces the node: protocol prefix', () => {
    expect(rules['unicorn/prefer-node-protocol']).toBe('error');
  });

  it('silences all other unicorn rules to prevent category bleed', () => {
    // Every unicorn rule except prefer-node-protocol must be explicitly off.
    // Category-activation bleed (e.g. restriction/correctness: 'error' from baseConfig)
    // Would otherwise enable opinionated or browser-specific unicorn rules.
    const otherUnicornRules = Object.entries(rules).filter(
      ([key]) => key.startsWith('unicorn/') && key !== 'unicorn/prefer-node-protocol',
    );
    const activeOtherRules = otherUnicornRules.filter(([, value]) => value !== 'off');

    expect(activeOtherRules).toStrictEqual([]);
    expect(otherUnicornRules.length).toBeGreaterThan(0);
  });

  it('applies globally with no overrides (runtime hygiene is not test-scoped)', () => {
    expect(config.overrides).toBeUndefined();
  });
});
