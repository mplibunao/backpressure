import { describe, expect, it } from 'vitest';

import {
  tsgoBoundaryRuleIds,
  tsgoRuleIds,
  tsgoTestFilePatterns,
} from '#oxlint-standards/generated/tsgo-policy.js';
import { pluginName } from '#oxlint-standards/plugin.js';
import { effectPreset } from '#oxlint-standards/presets/effect.js';
import { effectReactPreset } from '#oxlint-standards/presets/effect-react.js';
import { pluginRuleName } from '#oxlint-standards/presets/shared.js';
import {
  entriesForCollections,
  manifestCollectionsForConfiguredFragment,
  ruleManifest,
} from '#oxlint-standards/rule-manifest.js';
import { baseConfig } from './base.js';
import { composeLintConfigs } from './compose.js';
import { effectBoundaryRules } from './effect-boundaries.js';
import { effectTsgoConfig, isPatchedEngineConfig, tsgoPluginName } from './effect-tsgo.js';
import { nodeRuntimeConfig } from './node-runtime.js';
import { vitestConfig } from './vitest.js';

const nativeCarveOuts = ['no-shadow', 'require-yield'];
const tsgoRulePrefix = `${tsgoPluginName}/`;

describe('effectTsgoConfig', () => {
  it('sets the plugin, type-aware mode, every pinned rule, and the test-file override only', () => {
    expect(Object.keys(effectTsgoConfig).toSorted()).toStrictEqual([
      'options',
      'overrides',
      'plugins',
      'rules',
    ]);
    expect(effectTsgoConfig.plugins).toStrictEqual(['effecttsgo']);
    expect(effectTsgoConfig.options).toStrictEqual({ typeAware: true });
    expect(Object.keys(effectTsgoConfig.rules)).toStrictEqual([...tsgoRuleIds]);
    expect(effectTsgoConfig.overrides).toStrictEqual([
      { files: tsgoTestFilePatterns, rules: { 'effecttsgo/strict-effect-provide': 'off' } },
    ]);
  });

  it('takes each severity from its generated manifest row', () => {
    const manifestSeverity = new Map(
      entriesForCollections(['effectTsgoConfig']).map((entry) => [entry.name, entry.severity]),
    );
    const spelled = { error: 'error', off: 'off', warning: 'warn' } as const;
    for (const [ruleId, severity] of Object.entries(effectTsgoConfig.rules)) {
      const row = manifestSeverity.get(ruleId);
      expect(row === 'error' || row === 'off' || row === 'warning' ? spelled[row] : row).toBe(
        severity,
      );
    }
  });

  it('matches the escape-hatch test-file convention with suffix and directory scopes', () => {
    expect(tsgoTestFilePatterns).toStrictEqual(
      expect.arrayContaining([
        '**/*.test.ts',
        '**/*.spec.tsx',
        '**/*-test.mts',
        '**/*-spec.cjs',
        '**/__tests__/**/*',
        '**/test/**/*',
        '**/tests/**/*',
      ]),
    );
    expect(tsgoTestFilePatterns.filter((pattern) => /[{}]/u.test(pattern))).toStrictEqual([]);
  });
});

describe('isPatchedEngineConfig()', () => {
  const valid = {
    options: { typeAware: true },
    overrides: [{ files: ['**/*.test.ts'], rules: { 'effecttsgo/strict-effect-provide': 'off' } }],
    plugins: ['effecttsgo'],
    rules: effectTsgoConfig.rules,
  } as const;
  const withoutRule = Object.fromEntries(
    Object.entries(effectTsgoConfig.rules).filter(
      ([ruleId]) => ruleId !== 'effecttsgo/lazy-effect',
    ),
  );

  it('accepts the complete fragment', () => {
    expect(isPatchedEngineConfig(valid)).toBe(true);
  });

  it.each([
    ['a missing rule', { ...valid, rules: withoutRule }],
    [
      'an unknown rule',
      { ...valid, rules: { ...effectTsgoConfig.rules, 'effecttsgo/nope': 'error' } },
    ],
    [
      'a misspelled severity',
      { ...valid, rules: { ...effectTsgoConfig.rules, 'effecttsgo/lazy-effect': 'warning' } },
    ],
    ['another plugin', { ...valid, plugins: ['typescript'] }],
    ['a second option', { ...valid, options: { typeAware: true, typeCheck: true } }],
    ['type-aware off', { ...valid, options: { typeAware: false } }],
    [
      'an override without files',
      { ...valid, overrides: [{ files: [], rules: valid.overrides[0].rules }] },
    ],
    [
      'an override naming another namespace',
      { ...valid, overrides: [{ files: ['**/*.test.ts'], rules: { 'no-console': 'off' } }] },
    ],
  ])('rejects %s', (_label, fragment) => {
    expect(isPatchedEngineConfig(fragment as never)).toBe(false);
  });
});

describe('effectPreset', () => {
  const customEffectRules = entriesForCollections(['effectPreset']).map((entry) =>
    pluginRuleName(entry.name),
  );

  it('composes the custom rules, carve-outs, and the full delegated fragment', () => {
    expect(effectPreset.jsPlugins).toStrictEqual([pluginName]);
    expect(effectPreset.plugins).toStrictEqual(['effecttsgo']);
    expect(effectPreset.options).toStrictEqual({ typeAware: true });
    expect(effectPreset.overrides).toStrictEqual(effectTsgoConfig.overrides);
    expect(Object.keys(effectPreset.rules).toSorted()).toStrictEqual(
      [...customEffectRules, ...nativeCarveOuts, ...tsgoRuleIds].toSorted(),
    );
    expect(effectPreset.rules['no-shadow']).toBe('off');
    expect(effectPreset.rules['require-yield']).toBe('off');
  });

  it('keeps delegated IDs out of this package namespace', () => {
    const ruleIds = Object.keys(effectPreset.rules);
    expect(
      ruleIds.filter((ruleId) => ruleId.includes(`${pluginName}/${tsgoPluginName}`)),
    ).toStrictEqual([]);
    expect(
      ruleIds.filter(
        (ruleId) => !ruleId.startsWith(`${pluginName}/`) && !ruleId.startsWith(tsgoRulePrefix),
      ),
    ).toStrictEqual(nativeCarveOuts);
  });

  it('is fully explained by the effectPreset and effectTsgoConfig manifest collections', () => {
    const explained = new Set(
      manifestCollectionsForConfiguredFragment('effectPreset').flatMap((collection) =>
        entriesForCollections([collection]).map((entry) =>
          entry.disposition === 'tsgo-delegated' ? entry.name : pluginRuleName(entry.name),
        ),
      ),
    );
    expect(
      Object.keys(effectPreset.rules).filter((ruleId) => !explained.has(ruleId)),
    ).toStrictEqual(nativeCarveOuts);
  });

  it('leaves effect-react as the three-rule AST add-on', () => {
    expect(Object.keys(effectReactPreset)).toStrictEqual(['jsPlugins', 'rules']);
    expect(Object.keys(effectReactPreset.rules)).toHaveLength(3);
  });

  it('adds nothing Effect-specific to the ordinary baseline compositions', () => {
    const ordinary = composeLintConfigs(baseConfig, vitestConfig, nodeRuntimeConfig);
    expect(ordinary.plugins).not.toContain('effecttsgo');
    expect(ordinary.options).not.toHaveProperty('typeAware');
    expect(
      Object.keys(ordinary.rules ?? {}).filter((ruleId) => ruleId.startsWith(tsgoRulePrefix)),
    ).toStrictEqual([]);
  });

  it('adds effecttsgo to the plugins a consumer baseline already lists', () => {
    const composed = composeLintConfigs(baseConfig, effectPreset);
    expect(composed.plugins).toStrictEqual([...(baseConfig.plugins ?? []), 'effecttsgo']);
    expect(composed.options).toStrictEqual({ ...baseConfig.options, typeAware: true });
  });
});

describe('effectBoundaryRules', () => {
  it('turns off exactly the decided package and outside-Effect delegated rules', () => {
    expect(Object.keys(effectBoundaryRules)).toStrictEqual(
      [
        ...[
          'no-effect-escape-hatch',
          'no-instanceof-error',
          'no-json-parse',
          'no-promise-catch',
          'no-promise-reject',
          'no-switch-statement',
          'no-try-catch',
          'no-unknown-error-message',
        ].map((ruleName) => pluginRuleName(ruleName)),
        ...[
          'async-function',
          'crypto-random-uuid',
          'global-console',
          'global-date',
          'global-fetch',
          'global-random',
          'global-timers',
          'new-promise',
          'node-builtin-import',
          'process-env',
        ].map((ruleName) => `${tsgoRulePrefix}${ruleName}`),
      ].toSorted(),
    );
    expect(new Set(Object.values(effectBoundaryRules))).toStrictEqual(new Set(['off']));
    expect(Object.isFrozen(effectBoundaryRules)).toBe(true);
  });

  it('keeps every in-Effect sibling, strict-provide, and native baseline rule active', () => {
    const ruleIds = Object.keys(effectBoundaryRules);
    expect(ruleIds.filter((ruleId) => ruleId.endsWith('-in-effect'))).toStrictEqual([]);
    expect(ruleIds).not.toContain('effecttsgo/strict-effect-provide');
    expect(ruleIds).not.toContain('no-console');
    expect(ruleIds.every((ruleId) => ruleId in effectPreset.rules)).toBe(true);
    expect(ruleIds.filter((ruleId) => ruleId.startsWith(tsgoRulePrefix)).toSorted()).toStrictEqual(
      [...tsgoBoundaryRuleIds].toSorted(),
    );
  });

  it('relaxes only the path a consumer names, with later overrides winning', () => {
    const composed = composeLintConfigs(effectPreset, {
      overrides: [{ files: ['src/platform/**'], rules: { ...effectBoundaryRules } }],
    });
    expect(composed.rules?.['effecttsgo/global-date']).toBe('warn');
    expect(composed.overrides?.at(-1)).toStrictEqual({
      files: ['src/platform/**'],
      rules: { ...effectBoundaryRules },
    });
  });

  it('names only rows that exist and are active', () => {
    const activeNames = new Set(
      ruleManifest
        .filter((entry) => entry.collections.length > 0)
        .map((entry) =>
          entry.disposition === 'tsgo-delegated' ? entry.name : pluginRuleName(entry.name),
        ),
    );
    expect(
      Object.keys(effectBoundaryRules).filter((ruleId) => !activeNames.has(ruleId)),
    ).toStrictEqual([]);
  });
});
