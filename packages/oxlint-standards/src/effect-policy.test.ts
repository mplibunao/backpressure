import { describe, expect, it } from 'vitest';

import { effectTsgoConfig } from './configs/effect-tsgo.js';
import {
  type ShippedRuleFragment,
  assertReplacementFloors,
  validateShippedOwnership,
} from './effect-policy.js';
import { tsgoPolicyRows, tsgoRuleIds, tsgoTestFilePatterns } from './generated/tsgo-policy.js';
import * as packageRoot from './index.js';
import { effectPreset } from './presets/effect.js';
import { pluginRuleName } from './presets/shared.js';
import { type RuleManifestEntry, ruleManifest, tsgoOwnedChecks } from './rule-manifest.js';
import { type OwnershipEdge, ownershipRegistry } from './utils/effect-ownership.js';

// The decided drop register's replacement edges, restated here so a manifest edit cannot move
// both the edge and its expectation at once.
const decidedFloorEdges = [
  'effect-no-multiple-provide -> effecttsgo/multiple-effect-provide: error',
  'no-effect-async -> effecttsgo/outdated-api: error',
  'no-effect-do -> effecttsgo/effect-do-notation: error',
  'no-effect-orElse-ladder -> effecttsgo/outdated-api: error',
  'no-effect-sync-console -> effecttsgo/global-console-in-effect: error',
  'no-inline-runtime-provide -> effecttsgo/strict-effect-provide: error',
  'no-nested-effect-gen -> effecttsgo/nested-effect-gen-yield: error',
  'no-runtime-runfork -> effecttsgo/run-effect-inside-effect: error',
  'no-wrapgraphql-catchall -> effecttsgo/outdated-api: error',
  'prefer-yield-tagged-error -> effecttsgo/unnecessary-fail-yieldable-error: error',
];

const withRules = (
  fragment: ShippedRuleFragment,
  edit: (rules: Record<string, unknown>) => void,
): ShippedRuleFragment => {
  const rules = { ...fragment.rules };
  edit(rules);
  return { ...fragment, rules };
};

const withManifestRow = (
  name: string,
  change: Partial<RuleManifestEntry>,
): readonly RuleManifestEntry[] =>
  ruleManifest.map((entry) => (entry.name === name ? { ...entry, ...change } : entry));

const edgeFor = (reporter: string, owner: string): OwnershipEdge => ({
  reporter,
  owners: [owner],
  shape: 'test shape',
  ownsShape: () => true,
});

describe('assertReplacementFloors()', () => {
  it('proves all ten decided edges against the shipped Effect preset', () => {
    expect(assertReplacementFloors(ruleManifest, effectPreset).toSorted()).toStrictEqual(
      decidedFloorEdges,
    );
    expect(assertReplacementFloors(ruleManifest, effectTsgoConfig)).toHaveLength(10);
  });

  it('fails when a replacement is graded below the dropped rule', () => {
    const lowered = withRules(effectPreset, (rules) => {
      rules['effecttsgo/effect-do-notation'] = 'warn';
    });
    expect(() => assertReplacementFloors(ruleManifest, lowered)).toThrow(
      'no-effect-do -> effecttsgo/effect-do-notation: shipped warn is below the error floor',
    );
  });

  it('reads tuple, numeric, and deny/allow spellings before comparing', () => {
    const tupleOff = withRules(effectPreset, (rules) => {
      rules['effecttsgo/outdated-api'] = [0, { unused: true }];
    });
    expect(() => assertReplacementFloors(ruleManifest, tupleOff)).toThrow(
      'no-effect-async -> effecttsgo/outdated-api: shipped off is below the error floor',
    );
    const denied = withRules(effectPreset, (rules) => {
      rules['effecttsgo/outdated-api'] = 'deny';
    });
    expect(assertReplacementFloors(ruleManifest, denied)).toHaveLength(10);
  });

  it('fails when a replacement is missing from the shipped fragment', () => {
    const missing = withRules(effectPreset, (rules) => {
      delete rules['effecttsgo/nested-effect-gen-yield'];
    });
    expect(() => assertReplacementFloors(ruleManifest, missing)).toThrow(
      'no-nested-effect-gen -> effecttsgo/nested-effect-gen-yield: not configured in the shipped fragment',
    );
  });

  it('fails when an edge points at a rule the fragment does not ship', () => {
    const manifest = withManifestRow('no-effect-do', {
      replacedBy: ['effecttsgo/no-such-rule' as never],
    });
    expect(() => assertReplacementFloors(manifest, effectPreset)).toThrow(
      'no-effect-do -> effecttsgo/no-such-rule: not configured in the shipped fragment',
    );
  });

  it('fails when an undocumented override lowers a replacement', () => {
    const scoped: ShippedRuleFragment = {
      ...effectPreset,
      overrides: [
        ...effectPreset.overrides,
        { files: ['src/legacy/**'], rules: { 'effecttsgo/multiple-effect-provide': 'warn' } },
      ],
    };
    expect(() => assertReplacementFloors(ruleManifest, scoped)).toThrow(
      'effect-no-multiple-provide -> effecttsgo/multiple-effect-provide: override 1 lowers it to warn below the floor',
    );
  });

  it('fails when the strict-provide exception reaches beyond the test-file scope', () => {
    const widened: ShippedRuleFragment = {
      ...effectPreset,
      overrides: [
        {
          files: [...tsgoTestFilePatterns, 'src/**'],
          rules: { 'effecttsgo/strict-effect-provide': 'off' },
        },
      ],
    };
    expect(() => assertReplacementFloors(ruleManifest, widened)).toThrow(
      /override 0 lowers it to off below the floor[\s\S]*documented off test-file exception is missing/u,
    );
  });

  it('requires the documented test-file exception to ship', () => {
    const withoutOverride: ShippedRuleFragment = { ...effectPreset, overrides: [] };
    expect(() => assertReplacementFloors(ruleManifest, withoutOverride)).toThrow(
      'effecttsgo/strict-effect-provide: documented off test-file exception is missing',
    );
  });

  it('keeps the global strict-provide error beside its test-file scope', () => {
    expect(effectPreset.rules['effecttsgo/strict-effect-provide']).toBe('error');
  });
});

describe('validateShippedOwnership()', () => {
  it('accepts the shipped registry against the shipped Effect preset', () => {
    expect(validateShippedOwnership(ownershipRegistry, ruleManifest, effectPreset)).toStrictEqual(
      [],
    );
  });

  it('rejects an owner that has no manifest row', () => {
    expect(
      validateShippedOwnership(
        [edgeFor('no-effect-call-in-effect-arg', 'no-such-rule')],
        ruleManifest,
        effectPreset,
      ),
    ).toStrictEqual([
      'no-effect-call-in-effect-arg -> no-such-rule (test shape): owner is not an active custom rule',
      'no-effect-call-in-effect-arg -> no-such-rule (test shape): owner is not enabled in the shipped fragment',
    ]);
  });

  it('rejects a dropped owner', () => {
    expect(
      validateShippedOwnership(
        [edgeFor('no-effect-call-in-effect-arg', 'no-effect-as')],
        ruleManifest,
        effectPreset,
      ),
    ).toStrictEqual([
      'no-effect-call-in-effect-arg -> no-effect-as (test shape): owner is not an active custom rule',
      'no-effect-call-in-effect-arg -> no-effect-as (test shape): owner is not enabled in the shipped fragment',
    ]);
  });

  it('rejects an owner the shipped fragment quiets below its reporter', () => {
    const quieted = withRules(effectPreset, (rules) => {
      rules[pluginRuleName('no-effect-internal-tags')] = 'warn';
    });
    expect(validateShippedOwnership(ownershipRegistry, ruleManifest, quieted)).toStrictEqual([
      'no-manual-tag-check -> no-effect-internal-tags (_tag comparison against an imported Effect data-module tag): shipped warn owner cannot suppress a shipped error reporter',
    ]);
  });

  it('rejects an owner the shipped fragment turns off', () => {
    const disabled = withRules(effectPreset, (rules) => {
      rules[pluginRuleName('no-effect-ladder')] = 'off';
    });
    expect(validateShippedOwnership(ownershipRegistry, ruleManifest, disabled)).toContain(
      'no-flatmap-ladder -> no-effect-ladder (data-first transformation whose source is an Effect call): owner is not enabled in the shipped fragment',
    );
  });
});

describe('delegated tsgo identity', () => {
  const tsgoRows = ruleManifest.filter((entry) => entry.disposition === 'tsgo-delegated');

  it('replaces the language-service rows with one generated row per pinned rule', () => {
    expect(tsgoRows.map((entry) => entry.name)).toStrictEqual([...tsgoRuleIds]);
    expect(tsgoOwnedChecks).toStrictEqual([...tsgoRuleIds]);
    expect(tsgoRows).toHaveLength(tsgoPolicyRows.length);
    expect(ruleManifest.filter((entry) => entry.name.startsWith('lsp/'))).toStrictEqual([]);
    expect(packageRoot).not.toHaveProperty('lspOwnedChecks');
    expect(packageRoot.tsgoOwnedChecks).toBe(tsgoOwnedChecks);
  });

  it('marks every delegated row as integration-validated and owned by @effect/tsgo', () => {
    const shapes = new Set(
      tsgoRows.map((entry) =>
        JSON.stringify([
          entry.domain,
          entry.implementationStatus,
          entry.testStatus,
          entry.parityStatus,
          entry.sourceOwnership,
          entry.gating,
          entry.collections,
          entry.sourcePresets,
          entry.testSource,
        ]),
      ),
    );
    expect([...shapes]).toStrictEqual([
      JSON.stringify([
        'tsgo',
        'delegated',
        'not-applicable',
        'delegated',
        '@effect/tsgo',
        'type-aware',
        ['effectTsgoConfig'],
        [],
        'none',
      ]),
    ]);
  });

  it('keeps the graded totals, including the explicit offs', () => {
    const count = (severity: string) =>
      tsgoRows.filter((entry) => entry.severity === severity).length;
    expect([count('error'), count('warning'), count('off')]).toStrictEqual([44, 64, 5]);
    expect(
      tsgoRows.filter((entry) => entry.severity === 'off').map((entry) => entry.name),
    ).toStrictEqual([
      'effecttsgo/catch-die-to-or-die',
      'effecttsgo/deterministic-keys',
      'effecttsgo/missing-effect-service-dependency',
      'effecttsgo/prefer-schema-over-json',
      'effecttsgo/strict-boolean-expressions',
    ]);
  });

  it('carries no Effect-version sensitivity field on any row', () => {
    expect(ruleManifest.filter((entry) => 'effectVersionSensitivity' in entry)).toStrictEqual([]);
  });
});
