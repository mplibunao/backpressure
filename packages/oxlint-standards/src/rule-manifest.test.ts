import type { OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import { baseConfig, nodeRuntimeConfig, vitestConfig } from './configs/index.js';
import { pluginRuleName } from './presets/shared.js';
import {
  collapseManifestSeverity,
  entriesForCollections,
  presetEntriesForDomains,
  ruleManifest,
  type RuleCollection,
  type RuleManifestEntry,
} from './rule-manifest.js';

vi.setConfig({ testTimeout: 1000 });

type RuleSetting = NonNullable<OxlintConfig['rules']>[string];

interface ConfigCollectionPair {
  readonly collection: RuleCollection;
  readonly config: OxlintConfig;
}

const allCollections = [
  'generalPreset',
  'effectPreset',
  'effectReactPreset',
  'boundariesPreset',
  'baseConfig',
  'vitestConfig',
  'nodeRuntimeConfig',
] as const satisfies ReadonlyArray<RuleCollection>;
const configCollectionPairs = [
  { collection: 'baseConfig', config: baseConfig },
  { collection: 'vitestConfig', config: vitestConfig },
  { collection: 'nodeRuntimeConfig', config: nodeRuntimeConfig },
] as const satisfies ReadonlyArray<ConfigCollectionPair>;
const missingRuleSeverity = Symbol('missing rule severity');
// Pending WI-17 / ADR-004 policy reconciliation: these are the only style-class rules
// Currently allowed to stay at error because they are mechanical, autofixable exceptions.
const styleAtErrorExceptions = new Set([
  '@typescript-eslint/array-type',
  '@typescript-eslint/dot-notation',
  '@typescript-eslint/no-inferrable-types',
  '@typescript-eslint/prefer-function-type',
  'prefer-template',
  'sort-imports',
]);

const configuredSeverity = (setting: RuleSetting | undefined): unknown =>
  Array.isArray(setting) ? setting[0] : setting;

const normalizeConfigRuleName = (ruleName: string): string => {
  const pluginPrefix = pluginRuleName('');
  return ruleName.startsWith(pluginPrefix) ? ruleName.slice(pluginPrefix.length) : ruleName;
};

const ruleKeyForConfig = (entry: RuleManifestEntry): string =>
  entry.sourceOwnership === 'oxlint-native' || entry.disposition === 'built-in'
    ? entry.name
    : pluginRuleName(entry.name);

const topLevelSeverity = (config: OxlintConfig, entry: RuleManifestEntry): unknown =>
  configuredSeverity(config.rules?.[ruleKeyForConfig(entry)]);

const overrideSeverity = (config: OxlintConfig, entry: RuleManifestEntry): unknown => {
  const key = ruleKeyForConfig(entry);

  for (const override of config.overrides ?? []) {
    const severity = configuredSeverity(override.rules?.[key]);
    if (typeof severity !== 'undefined') {
      return severity;
    }
  }

  return missingRuleSeverity;
};

const entriesForCollection = (collection: RuleCollection): ReadonlyArray<RuleManifestEntry> =>
  entriesForCollections([collection]);

const explicitConfiguredRules = (
  config: OxlintConfig,
): ReadonlyArray<readonly [string, unknown]> => {
  const rules = Object.entries(config.rules ?? {}).map(
    ([ruleName, setting]) =>
      [normalizeConfigRuleName(ruleName), configuredSeverity(setting)] as const,
  );
  const overrideRules = (config.overrides ?? []).flatMap((override) =>
    Object.entries(override.rules ?? {}).map(
      ([ruleName, setting]) =>
        [normalizeConfigRuleName(ruleName), configuredSeverity(setting)] as const,
    ),
  );

  return [...rules, ...overrideRules];
};

const omittedNonErrorRuleAllowlist = (): ReadonlySet<string> =>
  new Set([
    // Test files disable unsafe assertions because fixture-heavy tests need boundary casts.
    '@typescript-eslint/no-unsafe-type-assertion',
    // The linteffect no-ternary source row stays collection-less; base explicitly leaves it off.
    'no-ternary',
    // Vitest and Unicorn non-owned rules are explicitly silenced to prevent category bleed.
    ...Object.keys(vitestConfig.rules ?? {}).map(normalizeConfigRuleName),
    ...Object.keys(nodeRuntimeConfig.rules ?? {})
      .filter((ruleName) => ruleName !== 'unicorn/prefer-node-protocol')
      .map(normalizeConfigRuleName),
  ]);

describe('rule manifest schema', () => {
  it('collapses manifest severities into oxlint config severities', () => {
    expect(collapseManifestSeverity('off')).toBe('off');
    expect(collapseManifestSeverity('info')).toBe('warn');
    expect(collapseManifestSeverity('warning')).toBe('warn');
    expect(collapseManifestSeverity('error')).toBe('error');
  });

  it('populates collection and rationale metadata for every manifest entry', () => {
    for (const entry of ruleManifest) {
      expect(entry.collections).toEqual(expect.any(Array));
      expect(['correctness', 'safety', 'agent-failure-mode', 'style']).toContain(
        entry.rationaleClass,
      );
      expect(Object.keys(entry)).not.toContain('presetEnabled');
    }
  });

  it('proves curated grading instead of blanket all-error posture', () => {
    const collectionEntries = entriesForCollections(allCollections);
    const quietOrOffEntries = collectionEntries.filter((entry) => entry.severity !== 'error');

    expect(collectionEntries.length).toBeGreaterThan(quietOrOffEntries.length);
    expect(quietOrOffEntries.length).toBeGreaterThan(5);
    for (const rationaleClass of ['correctness', 'safety', 'agent-failure-mode', 'style']) {
      expect(
        collectionEntries.filter((entry) => entry.rationaleClass === rationaleClass).length,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps enabled correctness and safety rules at error severity', () => {
    const quietlyEnabledCriticalRules = entriesForCollections(allCollections).filter(
      (entry) =>
        ['correctness', 'safety'].includes(entry.rationaleClass) &&
        entry.severity !== 'off' &&
        entry.severity !== 'error',
    );

    expect(quietlyEnabledCriticalRules.map((entry) => entry.name)).toStrictEqual([]);
  });

  it('keeps style-class error rules in the explicit autofixable exception set', () => {
    const styleErrorEntries = entriesForCollections(allCollections).filter(
      (entry) => entry.rationaleClass === 'style' && entry.severity === 'error',
    );

    expect(styleErrorEntries.map((entry) => entry.name).sort()).toStrictEqual(
      [...styleAtErrorExceptions].sort(),
    );
    expect(
      styleErrorEntries
        .filter(
          (entry) => !entry.note.includes('autofixable') || !entry.note.includes('vp check --fix'),
        )
        .map((entry) => entry.name),
    ).toStrictEqual([]);
  });

  it('keeps generalPreset membership stable while adding baseConfig membership to the same rules', () => {
    const generalPresetEntries = entriesForCollection('generalPreset');

    expect(generalPresetEntries.map((entry) => entry.name).sort()).toStrictEqual(
      presetEntriesForDomains(['general'], { includeBuiltIn: true })
        .map((entry) => entry.name)
        .sort(),
    );
    expect(
      generalPresetEntries.filter((entry) => entry.collections.includes('baseConfig')),
    ).toHaveLength(generalPresetEntries.length);
  });

  it('round-trips baseConfig collection membership into the base config rules', () => {
    for (const entry of entriesForCollection('baseConfig')) {
      expect(topLevelSeverity(baseConfig, entry), entry.name).toBe(
        collapseManifestSeverity(entry.severity),
      );
    }
  });

  it('round-trips vitestConfig collection membership through the test override', () => {
    const vitestEntries = entriesForCollection('vitestConfig');

    expect(vitestEntries.map((entry) => entry.name).sort()).toStrictEqual([
      'vitest/hoisted-apis-on-top',
      'vitest/no-conditional-tests',
      'vitest/require-awaited-expect-poll',
      'vitest/warn-todo',
    ]);

    for (const entry of vitestEntries) {
      expect(overrideSeverity(vitestConfig, entry), entry.name).toBe(
        collapseManifestSeverity(entry.severity),
      );
    }
  });

  it('round-trips nodeRuntimeConfig membership without manifesting silenced unicorn bleed guards', () => {
    const nodeRuntimeEntries = entriesForCollection('nodeRuntimeConfig');

    expect(nodeRuntimeEntries.map((entry) => entry.name)).toStrictEqual([
      'unicorn/prefer-node-protocol',
    ]);

    for (const entry of nodeRuntimeEntries) {
      expect(topLevelSeverity(nodeRuntimeConfig, entry), entry.name).toBe(
        collapseManifestSeverity(entry.severity),
      );
    }
  });

  it('requires every explicit config error to have a manifest row in that collection', () => {
    for (const { collection, config } of configCollectionPairs) {
      const manifestNames = new Set(entriesForCollection(collection).map((entry) => entry.name));
      const configuredErrorNames = explicitConfiguredRules(config)
        .filter(([, severity]) => severity === 'error')
        .map(([ruleName]) => ruleName);

      expect(configuredErrorNames.filter((ruleName) => !manifestNames.has(ruleName))).toStrictEqual(
        [],
      );
    }
  });

  it('keeps missing non-error manifest rows limited to the scoped off-rule allowlist', () => {
    const allowlist = omittedNonErrorRuleAllowlist();

    for (const { collection, config } of configCollectionPairs) {
      const manifestNames = new Set(entriesForCollection(collection).map((entry) => entry.name));
      const missingNonErrorNames = explicitConfiguredRules(config)
        .filter(([, severity]) => severity !== 'error')
        .map(([ruleName]) => ruleName)
        .filter((ruleName) => !manifestNames.has(ruleName) && !allowlist.has(ruleName));

      expect(missingNonErrorNames).toStrictEqual([]);
    }
  });
});
