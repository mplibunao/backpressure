import type { OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import {
  baseConfig,
  jsdocConfig,
  nodeRuntimeConfig,
  unicornConfig,
  vitestConfig,
} from './configs/index.js';
import { tsgoPolicyRows } from './generated/tsgo-policy.js';
import { pluginRuleName } from './presets/shared.js';
import {
  collapseManifestSeverity,
  entriesForCollections,
  deriveOmittedNonErrorRuleAllowlist,
  manifestCollectionsForConfiguredFragment,
  presetEntriesForDomains,
  ruleManifest,
  styleAtErrorExceptions,
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
  'unicornConfig',
  'jsdocConfig',
  'nodeRuntimeConfig',
] as const satisfies readonly RuleCollection[];
const configCollectionPairs = [
  { collection: 'baseConfig', config: baseConfig },
  { collection: 'vitestConfig', config: vitestConfig },
  { collection: 'unicornConfig', config: unicornConfig },
  { collection: 'jsdocConfig', config: jsdocConfig },
  { collection: 'nodeRuntimeConfig', config: nodeRuntimeConfig },
] as const satisfies readonly ConfigCollectionPair[];
const missingRuleSeverity = Symbol('missing rule severity');
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
    if (severity !== globalThis.undefined) {
      return severity;
    }
  }

  return missingRuleSeverity;
};

const entriesForCollection = (collection: RuleCollection): readonly RuleManifestEntry[] =>
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

const derivedOmittedNonErrorRuleAllowlist = (): ReadonlySet<string> =>
  deriveOmittedNonErrorRuleAllowlist({
    baseConfig,
    nodeRuntimeConfig,
    pluginRulePrefix: pluginRuleName(''),
    unicornConfig,
    jsdocConfig,
    vitestConfig,
  });

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

    expect(styleErrorEntries.map((entry) => entry.name).toSorted()).toStrictEqual(
      styleAtErrorExceptions.toSorted(),
    );
    expect(
      styleErrorEntries
        .filter(
          (entry) =>
            !entry.note.includes('Autofix evidence:') &&
            (!entry.note.includes('autofixable') || !entry.note.includes('vp check --fix')),
        )
        .map((entry) => entry.name),
    ).toStrictEqual([]);
  });

  it('keeps generalPreset membership stable while adding baseConfig membership to the same rules', () => {
    const generalPresetEntries = entriesForCollection('generalPreset');

    expect(generalPresetEntries.map((entry) => entry.name).toSorted()).toStrictEqual(
      presetEntriesForDomains(['general'], { includeBuiltIn: true })
        .map((entry) => entry.name)
        .toSorted(),
    );
    expect(
      generalPresetEntries.filter((entry) => entry.collections.includes('baseConfig')),
    ).toHaveLength(generalPresetEntries.length);
  });

  it('round-trips baseConfig collection membership into the base config rules', () => {
    for (const entry of entriesForCollection('baseConfig')) {
      // Wrap in a labeled object so the entry name appears in failure diffs
      // (jest/valid-expect disallows the Vitest-only second argument to expect()).
      expect({ name: entry.name, severity: topLevelSeverity(baseConfig, entry) }).toEqual({
        name: entry.name,
        severity: collapseManifestSeverity(entry.severity),
      });
    }
  });

  it('round-trips vitestConfig collection membership through the test override', () => {
    const vitestEntries = entriesForCollection('vitestConfig');

    expect(vitestEntries.map((entry) => entry.name).toSorted()).toStrictEqual([
      // Jest-namespace rules exposed by oxlint's vitest plugin (vitest implements the jest API).
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
      'vitest/consistent-each-for',
      'vitest/hoisted-apis-on-top',
      'vitest/no-conditional-tests',
      'vitest/no-import-node-test',
      'vitest/require-awaited-expect-poll',
      'vitest/require-local-test-context-for-concurrent-snapshots',
      'vitest/require-mock-type-parameters',
      'vitest/warn-todo',
    ]);

    for (const entry of vitestEntries) {
      expect({ name: entry.name, severity: overrideSeverity(vitestConfig, entry) }).toEqual({
        name: entry.name,
        severity: collapseManifestSeverity(entry.severity),
      });
    }
  });

  it('records the DP-2 unicorn manifest surface exactly once', () => {
    const unicornEntries = entriesForCollection('unicornConfig');

    expect(unicornEntries.map((entry) => entry.name).toSorted()).toStrictEqual([
      'unicorn/error-message',
      'unicorn/new-for-builtins',
      'unicorn/no-array-reverse',
      'unicorn/no-array-sort',
      'unicorn/no-await-in-promise-methods',
      'unicorn/no-empty-file',
      'unicorn/no-single-promise-in-promise-methods',
      'unicorn/no-static-only-class',
      'unicorn/no-thenable',
      'unicorn/no-typeof-undefined',
      'unicorn/no-unnecessary-await',
      'unicorn/no-useless-fallback-in-spread',
      'unicorn/no-useless-length-check',
      'unicorn/no-useless-promise-resolve-reject',
      'unicorn/no-useless-spread',
      'unicorn/no-useless-switch-case',
      'unicorn/no-useless-undefined',
      'unicorn/prefer-array-find',
      'unicorn/prefer-array-flat-map',
      'unicorn/prefer-array-some',
      'unicorn/prefer-date-now',
      'unicorn/prefer-includes',
      'unicorn/prefer-math-min-max',
      'unicorn/prefer-math-trunc',
      'unicorn/prefer-modern-math-apis',
      'unicorn/prefer-native-coercion-functions',
      'unicorn/prefer-number-properties',
      'unicorn/prefer-optional-catch-binding',
      'unicorn/prefer-regexp-test',
      'unicorn/prefer-set-has',
      'unicorn/prefer-set-size',
      'unicorn/prefer-string-slice',
      'unicorn/prefer-string-starts-ends-with',
      'unicorn/prefer-structured-clone',
      'unicorn/throw-new-error',
    ]);
  });

  it('records the DP-4 jsdoc manifest surface exactly once', () => {
    const jsdocEntries = entriesForCollection('jsdocConfig');

    expect(jsdocEntries.map((entry) => entry.name).toSorted()).toStrictEqual([
      'jsdoc/check-access',
      'jsdoc/check-tag-names',
      'jsdoc/empty-tags',
      'jsdoc/require-param',
      'jsdoc/require-returns',
    ]);

    for (const entry of jsdocEntries) {
      expect({ name: entry.name, severity: topLevelSeverity(jsdocConfig, entry) }).toEqual({
        name: entry.name,
        severity: collapseManifestSeverity(entry.severity),
      });
    }
  });

  it('round-trips nodeRuntimeConfig membership without manifesting silenced unicorn bleed guards', () => {
    const nodeRuntimeEntries = entriesForCollection('nodeRuntimeConfig');

    expect(nodeRuntimeEntries.map((entry) => entry.name)).toStrictEqual([
      'unicorn/prefer-node-protocol',
    ]);

    for (const entry of nodeRuntimeEntries) {
      expect({ name: entry.name, severity: topLevelSeverity(nodeRuntimeConfig, entry) }).toEqual({
        name: entry.name,
        severity: collapseManifestSeverity(entry.severity),
      });
    }
  });

  it('requires every explicit config error to have a manifest row in that collection', () => {
    for (const { collection, config } of configCollectionPairs) {
      const manifestNames = new Set(
        entriesForCollections(manifestCollectionsForConfiguredFragment(collection)).map(
          (entry) => entry.name,
        ),
      );
      const configuredErrorNames = explicitConfiguredRules(config)
        .filter(([, severity]) => severity === 'error')
        .map(([ruleName]) => ruleName);

      expect(configuredErrorNames.filter((ruleName) => !manifestNames.has(ruleName))).toStrictEqual(
        [],
      );
    }
  });

  it('derives oxc silence-wall omissions without allowlisting the owned oxc rule', () => {
    const allowlist = derivedOmittedNonErrorRuleAllowlist();
    const silencedOxcRules = Object.entries(baseConfig.rules ?? {})
      .filter(
        ([ruleName, setting]) =>
          ruleName.startsWith('oxc/') &&
          ruleName !== 'oxc/no-barrel-file' &&
          configuredSeverity(setting) === 'off',
      )
      .map(([ruleName]) => normalizeConfigRuleName(ruleName));

    expect(
      [...allowlist].filter((ruleName) => ruleName.startsWith('oxc/')).toSorted(),
    ).toStrictEqual(silencedOxcRules.toSorted());
    expect(allowlist.has('oxc/no-barrel-file')).toBe(false);
  });

  it('keeps missing non-error manifest rows limited to the scoped off-rule allowlist', () => {
    const allowlist = derivedOmittedNonErrorRuleAllowlist();

    for (const { collection, config } of configCollectionPairs) {
      const manifestNames = new Set(
        entriesForCollections(manifestCollectionsForConfiguredFragment(collection)).map(
          (entry) => entry.name,
        ),
      );
      const missingNonErrorNames = explicitConfiguredRules(config)
        .filter(([, severity]) => severity !== 'error')
        .map(([ruleName]) => ruleName)
        .filter((ruleName) => !manifestNames.has(ruleName) && !allowlist.has(ruleName));

      expect(missingNonErrorNames).toStrictEqual([]);
    }
  });
});

describe('replacement edges', () => {
  const manifestSeverityRank = { off: 0, info: 1, warning: 1, error: 2 } as const;
  const tsgoSeverityRank = { off: 0, warn: 1, error: 2 } as const;
  const policyByRuleId = new Map(tsgoPolicyRows.map((row) => [row.ruleName, row]));

  it('declares replacedBy only on dropped rows', () => {
    expect(
      ruleManifest
        .filter((entry) => entry.replacedBy !== globalThis.undefined)
        .filter((entry) => entry.disposition !== 'dropped')
        .map((entry) => entry.name),
    ).toStrictEqual([]);
  });

  it('hands each dropped row to tsgo rules graded at least as strictly', () => {
    const loweredEdges = ruleManifest.flatMap((entry) =>
      (entry.replacedBy ?? [])
        .filter((ruleId) => {
          const row = policyByRuleId.get(ruleId);
          return (
            row === globalThis.undefined ||
            tsgoSeverityRank[row.severity] < manifestSeverityRank[entry.severity]
          );
        })
        .map((ruleId) => `${entry.name} -> ${ruleId}`),
    );

    expect(loweredEdges).toStrictEqual([]);
  });
});
