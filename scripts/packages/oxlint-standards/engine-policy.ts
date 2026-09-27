// Compares what the patched oxlint engine applies to the delegated tsgo rules with the generated
// policy. The offline rules collector cannot see this: an oxlint category can switch a tsgo rule back
// on even though the shipped fragment sets it off.
import {
  type TsgoRuleSeverity,
  tsgoBoundaryRuleIds,
  tsgoPolicyRows,
  tsgoTestFileRuleOverrides,
} from '../../../packages/oxlint-standards/src/generated/tsgo-policy.ts';
import { normalizeSeverity } from '../../lib/rules-collector.ts';

// `boundary` is a representative consumer path whose final override attaches effectBoundaryRules.
export type PolicyScope = 'boundary' | 'normal' | 'test';

const tsgoPrefix = 'effecttsgo/';

const boundaryRuleIds: ReadonlySet<string> = new Set(tsgoBoundaryRuleIds);

const scopedSeverity = (
  scope: PolicyScope,
  row: (typeof tsgoPolicyRows)[number],
): TsgoRuleSeverity | undefined => {
  if (scope === 'test') {
    return tsgoTestFileRuleOverrides[row.ruleName];
  }
  return scope === 'boundary' && boundaryRuleIds.has(row.ruleName) ? 'off' : globalThis.undefined;
};

export const expectedTsgoSeverities = (scope: PolicyScope): ReadonlyMap<string, TsgoRuleSeverity> =>
  new Map(tsgoPolicyRows.map((row) => [row.ruleName, scopedSeverity(scope, row) ?? row.severity]));

// Print-config lists native, tsgo, and explicitly configured rules together but never the custom
// JS-plugin rules, so the counts are reported per source rather than as one total.
export const printedRuleSources = (
  printed: Readonly<Record<string, unknown>>,
  customPrefix: string,
): Readonly<Record<'custom' | 'native' | 'tsgo', number>> => {
  const names = Object.keys(printed);
  const tsgo = names.filter((name) => name.startsWith(tsgoPrefix)).length;
  const custom = names.filter((name) => name.startsWith(customPrefix)).length;
  return { custom, native: names.length - tsgo - custom, tsgo };
};

// Returns one line per disagreement. A tsgo rule absent from the printed config counts as off, so a
// policy `off` the engine leaves unlisted agrees, while any rule the engine reports on and the policy
// sets off, or any other severity difference, is a mismatch. A printed tsgo rule the policy does not
// know is also a mismatch: it means the pinned rule set and the engine disagree.
export const enginePolicyMismatches = (
  printed: Readonly<Record<string, unknown>>,
  expected: ReadonlyMap<string, TsgoRuleSeverity>,
): readonly string[] => {
  const printedTsgo = Object.keys(printed).filter((name) => name.startsWith(tsgoPrefix));
  const unknown = printedTsgo
    .filter((name) => !expected.has(name))
    .map((name) => `${name}: printed by the engine but absent from the generated policy`);
  const differing = [...expected].flatMap(([name, severity]) => {
    const actual = name in printed ? normalizeSeverity(printed[name]) : 'off';
    return actual === severity
      ? []
      : [`${name}: engine applies ${actual}, policy sets ${severity}`];
  });
  return [...unknown, ...differing].toSorted();
};
