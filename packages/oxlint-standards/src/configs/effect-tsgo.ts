import type { OxlintConfig } from 'oxlint';

import {
  type TsgoRuleId,
  type TsgoRuleSeverity,
  tsgoRuleIds,
  tsgoTestFilePatterns,
  tsgoTestFileRuleOverrides,
} from '#oxlint-standards/generated/tsgo-policy.js';
import {
  entriesForCollections,
  oxlintSeverityForManifestEntry,
} from '#oxlint-standards/rule-manifest-selection.js';

// The rule namespace the @effect/tsgo patch registers inside oxlint.
export const tsgoPluginName = 'effecttsgo';

type TsgoRuleMap = Readonly<Partial<Record<TsgoRuleId, TsgoRuleSeverity>>>;

interface TsgoTestFileOverride {
  readonly files: readonly string[];
  readonly rules: TsgoRuleMap;
}

interface PatchedTsgoFragment {
  readonly options: { readonly typeAware: true };
  readonly overrides: readonly [TsgoTestFileOverride];
  readonly plugins: readonly [typeof tsgoPluginName];
  readonly rules: TsgoRuleMap;
}

// The full-config view consumers compose. The unpatched oxlint declarations type `plugins` as a
// closed union without `effecttsgo`; the patched engine extends that schema, so the one bridge
// between the two lives in `isPatchedEngineConfig` below.
export type EffectTsgoConfig = OxlintConfig & PatchedTsgoFragment;

const knownRuleIds: ReadonlySet<string> = new Set(tsgoRuleIds);
const ruleSeverities: ReadonlySet<unknown> = new Set(['error', 'off', 'warn']);

const hasOnlyKnownRules = (rules: TsgoRuleMap): boolean =>
  Object.entries(rules).every(
    ([ruleId, severity]) => knownRuleIds.has(ruleId) && ruleSeverities.has(severity),
  );

const setsEveryRule = (rules: TsgoRuleMap): boolean =>
  hasOnlyKnownRules(rules) && Object.keys(rules).length === knownRuleIds.size;

const isTestFileOverride = (override: TsgoTestFileOverride): boolean =>
  override.files.length > 0 &&
  override.files.every((pattern) => typeof pattern === 'string' && pattern.length > 0) &&
  Object.keys(override.rules).length > 0 &&
  hasOnlyKnownRules(override.rules);

// Validates the narrowly typed fragment against the pinned rule set before it is exposed as an
// `OxlintConfig`. Every one of the 113 rules must carry an explicit setting so that a category the
// consumer enables cannot revive a rule this package set off.
export const isPatchedEngineConfig = (
  fragment: PatchedTsgoFragment,
): fragment is EffectTsgoConfig =>
  fragment.plugins.length === 1 &&
  fragment.plugins[0] === tsgoPluginName &&
  Object.keys(fragment.options).join() === 'typeAware' &&
  fragment.options.typeAware &&
  setsEveryRule(fragment.rules) &&
  fragment.overrides.every(isTestFileOverride);

const manifestTsgoRules = (): TsgoRuleMap => {
  const rules: Partial<Record<TsgoRuleId, TsgoRuleSeverity>> = {};
  const severityByName = new Map(
    entriesForCollections(['effectTsgoConfig']).map((entry) => [
      entry.name,
      oxlintSeverityForManifestEntry(entry),
    ]),
  );
  for (const ruleId of tsgoRuleIds) {
    const severity = severityByName.get(ruleId);
    if (severity !== globalThis.undefined) {
      rules[ruleId] = severity;
    }
  }
  return rules;
};

const fragment: PatchedTsgoFragment = {
  options: { typeAware: true },
  overrides: [{ files: tsgoTestFilePatterns, rules: tsgoTestFileRuleOverrides }],
  plugins: [tsgoPluginName],
  rules: manifestTsgoRules(),
};

// The delegated half of the full Effect config. Severities come from the manifest rows generated
// from the graded policy; the override turns strict-effect-provide off in test files only.
const invalidFragment = (): never => {
  throw new Error(
    'effectTsgoConfig must set every pinned @effect/tsgo rule, the effecttsgo plugin, and typeAware.',
  );
};

export const effectTsgoConfig: EffectTsgoConfig = isPatchedEngineConfig(fragment)
  ? fragment
  : invalidFragment();
