// Pure gates over the shipped Effect config. Callers pass the manifest and the actual composed
// fragment, so tests can feed altered copies and prove each gate fails.
import { tsgoTestFilePatterns } from './generated/tsgo-policy.js';
import { pluginRuleName } from './presets/shared.js';
import { type RuleManifestEntry, collapseManifestSeverity } from './rule-manifest.js';
import { type OwnershipEdge, validateOwnershipRegistry } from './utils/effect-ownership.js';

type ShippedSeverity = 'error' | 'off' | 'warn';

interface ShippedOverride {
  readonly files: readonly string[];
  readonly rules?: Readonly<Record<string, unknown>>;
}

export interface ShippedRuleFragment {
  readonly overrides?: readonly ShippedOverride[];
  readonly rules?: Readonly<Record<string, unknown>>;
}

interface ReplacementFloorException {
  readonly files: readonly string[];
  readonly ruleId: string;
  readonly severity: ShippedSeverity;
}

// The one scoped exception to a replacement floor: test code provides Layers directly, so the
// test-file override turns strict-effect-provide off there. Production files keep the error floor.
export const replacementFloorExceptions: readonly ReplacementFloorException[] = [
  { files: tsgoTestFilePatterns, ruleId: 'effecttsgo/strict-effect-provide', severity: 'off' },
];

const severityRank: Readonly<Record<ShippedSeverity, number>> = { off: 0, warn: 1, error: 2 };
const numericSeverity: readonly ShippedSeverity[] = ['off', 'warn', 'error'];
const spelledSeverity: Readonly<Record<string, ShippedSeverity>> = {
  allow: 'off',
  deny: 'error',
  error: 'error',
  off: 'off',
  warn: 'warn',
};

// Oxlint accepts a severity alone or first in an options tuple, spelled or numeric.
const shippedSeverity = (setting: unknown): ShippedSeverity | undefined => {
  const value: unknown = Array.isArray(setting) ? setting[0] : setting;
  if (typeof value === 'number') {
    return numericSeverity[value];
  }
  return typeof value === 'string' ? spelledSeverity[value] : globalThis.undefined;
};

interface FloorEdge {
  readonly floor: ShippedSeverity;
  readonly label: string;
  readonly target: string;
}

const floorEdges = (manifest: readonly RuleManifestEntry[]): readonly FloorEdge[] =>
  manifest.flatMap((entry) =>
    entry.disposition === 'dropped'
      ? (entry.replacedBy ?? []).map((target) => ({
          floor: collapseManifestSeverity(entry.severity),
          label: `${entry.name} -> ${target}`,
          target,
        }))
      : [],
  );

const sameFiles = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((pattern) => right.includes(pattern));

const isDocumentedException = (ruleId: string, severity: unknown, files: readonly string[]) =>
  replacementFloorExceptions.some(
    (exception) =>
      exception.ruleId === ruleId &&
      exception.severity === shippedSeverity(severity) &&
      sameFiles(exception.files, files),
  );

const globalFloorProblems = (
  edges: readonly FloorEdge[],
  fragment: ShippedRuleFragment,
): readonly string[] =>
  edges.flatMap((edge) => {
    const shipped = shippedSeverity(fragment.rules?.[edge.target]);
    if (shipped === globalThis.undefined) {
      return [`${edge.label}: not configured in the shipped fragment`];
    }
    return severityRank[shipped] < severityRank[edge.floor]
      ? [`${edge.label}: shipped ${shipped} is below the ${edge.floor} floor`]
      : [];
  });

// A file-scoped override may lower a replacement target only as a documented exception, so a
// scope can never quietly erase the global grading.
const overrideFloorProblems = (
  edges: readonly FloorEdge[],
  fragment: ShippedRuleFragment,
): readonly string[] =>
  (fragment.overrides ?? []).flatMap((override, index) =>
    Object.entries(override.rules ?? {}).flatMap(([ruleId, setting]) => {
      const shipped = shippedSeverity(setting) ?? 'off';
      const lowered = edges.filter(
        (edge) => edge.target === ruleId && severityRank[shipped] < severityRank[edge.floor],
      );
      return lowered.length > 0 && !isDocumentedException(ruleId, setting, override.files)
        ? lowered.map(
            (edge) => `${edge.label}: override ${index} lowers it to ${shipped} below the floor`,
          )
        : [];
    }),
  );

const exceptionProblems = (
  edges: readonly FloorEdge[],
  fragment: ShippedRuleFragment,
): readonly string[] =>
  replacementFloorExceptions.flatMap((exception) => {
    if (!edges.some((edge) => edge.target === exception.ruleId)) {
      return [`${exception.ruleId}: documented floor exception names no replacement target`];
    }
    const present = (fragment.overrides ?? []).some((override) =>
      isDocumentedException(exception.ruleId, override.rules?.[exception.ruleId], override.files),
    );
    return present
      ? []
      : [`${exception.ruleId}: documented ${exception.severity} test-file exception is missing`];
  });

// Every dropped rule with a replacement hands its diagnostic to tsgo rules the shipped config
// grades at least as strictly. Returns the checked edges; throws with every broken one.
export const assertReplacementFloors = (
  manifest: readonly RuleManifestEntry[],
  fragment: ShippedRuleFragment,
): readonly string[] => {
  const edges = floorEdges(manifest);
  const problems = [
    ...globalFloorProblems(edges, fragment),
    ...overrideFloorProblems(edges, fragment),
    ...exceptionProblems(edges, fragment),
  ];
  if (problems.length > 0) {
    throw new Error(`Replacement floors broken:\n${problems.join('\n')}`);
  }
  return edges.map((edge) => `${edge.label}: ${edge.floor}`);
};

// The registry check against manifest collections, plus the actual shipped config: every owner
// and reporter is present in the fragment, and no shipped owner is quieter than its reporter.
export const validateShippedOwnership = (
  registry: readonly OwnershipEdge[],
  manifest: readonly RuleManifestEntry[],
  fragment: ShippedRuleFragment,
): readonly string[] => {
  const shippedOf = (name: string): ShippedSeverity | undefined =>
    shippedSeverity(fragment.rules?.[pluginRuleName(name)]);
  const fragmentProblems = registry.flatMap((edge) => {
    const reporter = shippedOf(edge.reporter);
    if (reporter === globalThis.undefined || reporter === 'off') {
      return [`${edge.reporter} (${edge.shape}): reporter is not enabled in the shipped fragment`];
    }
    return edge.owners.flatMap((ownerName) => {
      const owner = shippedOf(ownerName);
      const label = `${edge.reporter} -> ${ownerName} (${edge.shape})`;
      if (owner === globalThis.undefined || owner === 'off') {
        return [`${label}: owner is not enabled in the shipped fragment`];
      }
      return severityRank[owner] < severityRank[reporter]
        ? [`${label}: shipped ${owner} owner cannot suppress a shipped ${reporter} reporter`]
        : [];
    });
  });
  return [...validateOwnershipRegistry(registry, manifest), ...fragmentProblems];
};
