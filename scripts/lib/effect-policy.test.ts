import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { tsgoPolicy } from '../config/tsgo-policy.ts';
import { readmeTscOverrideEntry } from '../packages/tsconfig/readme-snippets.ts';
import {
  type TsgoPolicy,
  gradeTsgoRules,
  lintPolicyModule,
  oxlintRouteTsconfig,
  tscRouteTsconfig,
  tscTestOverrideEntry,
} from './effect-policy.ts';
import { repoRoot } from './script-runtime.ts';
import { stableJson } from './stable-json.ts';
import {
  type TsgoSnapshot,
  captureTsgoSnapshot,
  parseTsgoSnapshot,
  readmeNamePairs,
} from './tsgo-snapshot.ts';

const snapshotText = readFileSync(
  join(repoRoot, 'scripts', 'references', 'tsgo', tsgoPolicy.pinnedVersion, 'metadata.json'),
  'utf8',
);
const snapshot = parseTsgoSnapshot(snapshotText);
const rows = gradeTsgoRules(snapshot, tsgoPolicy);

const severityOf = (kebab: string): string | undefined =>
  rows.find((row) => row.ruleName === `effecttsgo/${kebab}`)?.severity;

const namesWith = (severity: string, category?: string): readonly string[] =>
  rows
    .filter(
      (row) =>
        row.severity === severity &&
        (category === globalThis.undefined || row.category === category),
    )
    .map((row) => row.ruleName.replace('effecttsgo/', ''))
    .toSorted();

const withPolicy = (overrides: Partial<TsgoPolicy>): TsgoPolicy => ({
  ...tsgoPolicy,
  ...overrides,
});

const tamperedSnapshot = (edit: (record: Record<string, unknown>) => void): string => {
  const record = JSON.parse(snapshotText) as Record<string, unknown>;
  edit(record);
  return JSON.stringify(record);
};

const snapshotRules = (record: Record<string, unknown>): Array<Record<string, unknown>> =>
  record['rules'] as Array<Record<string, unknown>>;

describe('tsgo grading', () => {
  it('produces the decided totals with the JSON rule off', () => {
    expect(rows).toHaveLength(116);
    expect(namesWith('error')).toHaveLength(44);
    expect(namesWith('warn')).toHaveLength(67);
    expect(namesWith('off')).toEqual([
      'catch-die-to-or-die',
      'deterministic-keys',
      'missing-effect-service-dependency',
      'prefer-schema-over-json',
      'strict-boolean-expressions',
    ]);
  });

  it('grades each category exactly as decided', () => {
    expect(namesWith('warn', 'correctness')).toEqual(['duplicate-package']);
    expect(namesWith('warn', 'antipattern')).toEqual([
      'catch-unfailable-effect',
      'effect-fn-iife',
      'effect-gen-uses-adapter',
      'lazy-effect',
      'prefer-unsafe-constructor',
      'return-effect-in-gen',
      'schema-sync-in-effect',
    ]);
    expect(namesWith('error', 'style')).toEqual([
      'effect-do-notation',
      'effect-fn-opportunity',
      'nested-effect-gen-yield',
      'unnecessary-fail-yieldable-error',
    ]);
    expect(namesWith('error', 'effect-native')).toEqual([
      'crypto-random-uuid-in-effect',
      'global-console-in-effect',
      'global-date-in-effect',
      'global-random-in-effect',
      'global-timers-in-effect',
      'instance-of-schema',
      'process-env-in-effect',
    ]);
    expect(severityOf('strict-effect-provide')).toBe('error');
    expect(severityOf('unnecessary-pipe-chain')).toBe('warn');
    expect(severityOf('missed-pipeable-opportunity')).toBe('warn');
  });

  it('keeps enabled correctness rows at error except the install-state exception', () => {
    const quietCritical = rows.filter(
      (row) =>
        ['correctness', 'safety'].includes(row.rationaleClass) &&
        row.severity !== 'error' &&
        row.severity !== 'off',
    );
    expect(quietCritical.map((row) => row.ruleName)).toEqual(['effecttsgo/duplicate-package']);
    expect(
      rows.filter((row) => row.rationaleClass === 'style' && row.severity === 'error'),
    ).toEqual([]);
  });

  it('rejects a policy key that names no pinned rule', () => {
    const exceptions = {
      ...tsgoPolicy.exceptions,
      'no-such-rule': tsgoPolicy.exceptions['lazy-effect'],
    };
    expect(() => gradeTsgoRules(snapshot, withPolicy({ exceptions }))).toThrow(/no-such-rule/u);
    expect(() => gradeTsgoRules(snapshot, withPolicy({ boundaryRules: ['global-dates'] }))).toThrow(
      /global-dates/u,
    );
  });

  it('rejects an exception whose recorded category no longer matches upstream', () => {
    const exceptions = {
      ...tsgoPolicy.exceptions,
      'lazy-effect': { ...tsgoPolicy.exceptions['lazy-effect'], category: 'style' as const },
    };
    expect(() => gradeTsgoRules(snapshot, withPolicy({ exceptions }))).toThrow(/lazy-effect/u);
  });

  it('rejects a pinned-version or category-count drift', () => {
    expect(() => gradeTsgoRules(snapshot, withPolicy({ pinnedVersion: '0.46.0' }))).toThrow(
      /0\.46\.0/u,
    );
    const expectedCategoryCounts = { ...tsgoPolicy.expectedCategoryCounts, style: 51 };
    expect(() => gradeTsgoRules(snapshot, withPolicy({ expectedCategoryCounts }))).toThrow(
      /style/u,
    );
  });
});

// A one-rule capture input built from the first pinned rule, in upstream field names.
const singleRuleCapture = () => {
  const rule = snapshot.rules[0];
  const upstream = {
    codes: rule?.codes,
    defaultSeverity: rule?.defaultSeverity,
    description: rule?.description,
    fixable: rule?.fixable,
    // Upstream spells the Effect-native group id in camelCase; the snapshot normalizes it.
    group: rule?.category === 'effect-native' ? 'effectNative' : rule?.category,
    name: rule?.diagnosticName,
    preview: rule?.preview,
    supportedEffect: rule?.supportedEffect,
  };
  const kebab = rule?.ruleName.replace('effecttsgo/', '') ?? '';
  const readme = `<!-- supported-components:start -->\n| Oxlint | \`1.82.0\` |\n| oxlint-tsgolint | \`7.0.2001\` |\n| TypeScript | \`7.0.2\` |\n<!-- supported-components:end -->\ndocs/rules/${kebab}.md"><code>${rule?.diagnosticName ?? ''}</code>`;
  const base = {
    commit: snapshot.source.commit,
    docsRuleFileNames: [`${kebab}.md`],
    fileHashes: { 'README.md': 'x' },
    licenseText: 'Copyright (c) 2026 Effect\n',
    metadataText: JSON.stringify({ rules: [upstream] }),
    oxlintSchemaText: JSON.stringify({ properties: { [`effecttsgo/${kebab}`]: {} } }),
    readmeText: readme,
    repository: 'https://example.invalid',
    tag: snapshot.source.tag,
    version: snapshot.package.version,
  };
  return { base, upstream };
};

describe('tsgo snapshot', () => {
  it('pairs names from the README rather than by case conversion', () => {
    const uuid = snapshot.rules.find((rule) => rule.ruleName === 'effecttsgo/crypto-random-uuid');
    expect(uuid?.diagnosticName).toBe('cryptoRandomUUID');
    expect(readmeNamePairs('docs/rules/a-b.md"><code>aB</code>').get('aB')).toBe('a-b');
  });

  it('keeps the provenance and rules-page fields for every rule', () => {
    expect(snapshot.source.tag).toBe(`@effect/tsgo@${tsgoPolicy.pinnedVersion}`);
    expect(snapshot.supportedTargets.oxlint).toContain('1.82.0');
    for (const rule of snapshot.rules) {
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.preview.sourceText.length).toBeGreaterThan(0);
      expect(typeof rule.fixable).toBe('boolean');
    }
  });

  it('rejects hand edits that break structure', () => {
    const duplicate = tamperedSnapshot((record) => {
      const rules = snapshotRules(record);
      rules.push({ ...rules.at(-1) });
    });
    expect(() => parseTsgoSnapshot(duplicate)).toThrow(/duplicate/u);
    const unsorted = tamperedSnapshot((record) => {
      snapshotRules(record).reverse();
    });
    expect(() => parseTsgoSnapshot(unsorted)).toThrow(/sorted/u);
    const noPreview = tamperedSnapshot((record) => {
      delete snapshotRules(record)[0]?.['preview'];
    });
    expect(() => parseTsgoSnapshot(noPreview)).toThrow(/preview/u);
    const badCategory = tamperedSnapshot((record) => {
      const [first] = snapshotRules(record);
      if (first !== globalThis.undefined) {
        first['category'] = 'effectNative';
      }
    });
    expect(() => parseTsgoSnapshot(badCategory)).toThrow(/category/u);
  });

  it('rejects a capture whose name sets disagree', () => {
    const { base } = singleRuleCapture();
    expect(captureTsgoSnapshot(base).rules).toHaveLength(1);
    expect(() => captureTsgoSnapshot({ ...base, oxlintSchemaText: '{}' })).toThrow(
      /oxlint-schema/u,
    );
    expect(() => captureTsgoSnapshot({ ...base, docsRuleFileNames: [] })).toThrow(/docs\/rules/u);
  });

  it('rejects repeated metadata rows instead of collapsing them', () => {
    const { base, upstream } = singleRuleCapture();
    const withRows = (metadataRows: readonly unknown[]) => ({
      ...base,
      metadataText: JSON.stringify({ rules: metadataRows }),
    });
    expect(() => captureTsgoSnapshot(withRows([upstream, upstream]))).toThrow(
      /metadata rule names contains duplicate/u,
    );
    const conflicting = { ...upstream, description: 'A different description for the same rule.' };
    expect(() => captureTsgoSnapshot(withRows([upstream, conflicting]))).toThrow(
      /metadata rule names contains duplicate/u,
    );
  });
});

describe('tsgo projections', () => {
  const pluginOf = (config: Record<string, unknown>): Record<string, unknown> =>
    (config['compilerOptions'] as { plugins: Array<Record<string, unknown>> }).plugins[0] ?? {};

  it('keeps severities out of the oxlint-route overlay', () => {
    const plugin = pluginOf(oxlintRouteTsconfig(tsgoPolicy));
    expect(plugin).toEqual({
      barrelImportPackages: [],
      diagnostics: false,
      effectFn: ['span', 'inferred-span', 'suggested-span'],
      name: '@effect/language-service',
      namespaceImportPackages: ['effect'],
      pipeableMinArgCount: 2,
    });
  });

  it('gives the tsc route every severity in upstream spelling and no inert override', () => {
    const plugin = pluginOf(tscRouteTsconfig(rows, tsgoPolicy));
    const severities = plugin['diagnosticSeverity'] as Record<string, string>;
    expect(Object.keys(severities)).toHaveLength(116);
    expect(new Set(Object.values(severities))).toEqual(new Set(['error', 'off', 'warning']));
    expect(severities['duplicatePackage']).toBe('warning');
    expect(plugin['ignoreEffectWarningsInTscExitCode']).toBe(false);
    // An override inside an extended overlay only matches files under the overlay's own folder.
    expect(plugin).not.toHaveProperty('overrides');
  });

  it('projects the consumer-owned test-file override entry from the policy', () => {
    const entry = tscTestOverrideEntry(rows, tsgoPolicy);
    expect(Object.keys(entry).toSorted()).toEqual(['name', 'overrides']);
    expect(entry['name']).toBe('@effect/language-service');
    const [override, ...rest] = entry['overrides'] as Array<{
      include: string[];
      options: unknown;
    }>;
    expect(rest).toEqual([]);
    expect(override?.options).toEqual({ diagnosticSeverity: { strictEffectProvide: 'off' } });
    expect(override?.include).toEqual(tsgoPolicy.testFilePatterns);
    expect(override?.include).toContain('**/*.test.ts');
    expect(override?.include).toContain('**/__tests__/**/*');
  });

  it('documents exactly the projected override entry in the tsconfig package README', () => {
    expect(readmeTscOverrideEntry()).toEqual(tscTestOverrideEntry(rows, tsgoPolicy));
  });

  it('serializes deterministically and never imports from the lint module', () => {
    const snapshotCopy: TsgoSnapshot = parseTsgoSnapshot(snapshotText);
    const again = gradeTsgoRules(snapshotCopy, tsgoPolicy);
    expect(stableJson(tscRouteTsconfig(again, tsgoPolicy))).toBe(
      stableJson(tscRouteTsconfig(rows, tsgoPolicy)),
    );
    const module = lintPolicyModule(rows, tsgoPolicy, tsgoPolicy.pinnedVersion);
    expect(module).not.toMatch(/^import /mu);
    expect(module).toContain('"effecttsgo/strict-effect-provide": "off"');
  });
});
