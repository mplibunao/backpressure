import type { OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import { baseConfig } from './base.js';
import { composeLintConfigs } from './compose.js';
import { nodeRuntimeConfig } from './node-runtime.js';

vi.setConfig({ testTimeout: 1000 });

// Cast to OxlintConfig so optional fields absent from the narrowed literal type are accessible.
const config = nodeRuntimeConfig as OxlintConfig;
const rules = config.rules ?? {};

describe('nodeRuntime config fragment', () => {
  it('declares the unicorn plugin so the fragment resolves standalone', () => {
    expect(config.plugins).toStrictEqual(['unicorn']);
  });

  it('enforces the node: protocol prefix', () => {
    expect(rules['unicorn/prefer-node-protocol']).toBe('error');
  });

  it('wins after baseConfig in the intended composition order', () => {
    const composed = composeLintConfigs(baseConfig, nodeRuntimeConfig);

    expect(composed.rules?.['unicorn/prefer-node-protocol']).toBe('error');
  });

  it('contains no unicorn silence wall entries', () => {
    expect(Object.keys(rules)).toStrictEqual(['unicorn/prefer-node-protocol']);
  });

  it('applies globally with no overrides (runtime hygiene is not test-scoped)', () => {
    expect(config.overrides).toBeUndefined();
  });
});
