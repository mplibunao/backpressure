// Collects every rule a shipped preset or config turns on into one list, then renders it as the
// generated rules page. Package rows come from the manifest, tsgo rows from the generated policy and
// the retained metadata snapshot, and built-in rows from the root oxlint engine.
//
// Only baseConfig and the base + vitest + node composition go through print-config. A preset sets
// no categories, so printing it would credit oxlint's default rules to the preset, and root oxlint
// rejects any config naming the `effecttsgo` plugin. Presets contribute built-in rows only through
// the rules they set explicitly, which keeps the collector offline and independent of the patch.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  tsgoPolicyRows,
  tsgoPolicyVersion,
  tsgoTestFileRuleOverrides,
} from '../../packages/oxlint-standards/src/generated/tsgo-policy.ts';
import {
  collapseManifestSeverity,
  type RuleManifestEntry,
  ruleManifest,
} from '../../packages/oxlint-standards/src/rule-manifest.ts';
import { ruleMessageTemplate } from '../../packages/oxlint-standards/src/rule-messages.ts';
import { distPluginPath, oxlintBin } from '../packages/oxlint-standards/package.ts';
import {
  flattenTestOverridesIntoGlobal,
  materializeEffectiveRules,
  normalizeTypescriptAlias,
  type OxlintRuleItem,
  readOxlintRuleItems,
} from './effective-config.ts';
import type { CollectedRule, RuleActivation, RuleList, RuleSeverity } from './rule-list.ts';
import { fail, isObjectRecord, repoRoot } from './script-runtime.ts';
import { kebabFromRuleName, type TsgoSnapshot, type TsgoSnapshotRule } from './tsgo-snapshot.ts';
import { readRetainedTsgoSnapshot } from './tsgo-snapshot-files.ts';

export const fullCompositionTarget = 'baseConfig + vitestConfig + nodeRuntimeConfig';
// Display order for every preset, config, and composition the list attributes rules to.
export const ruleTargets = [
  'generalPreset',
  'effectPreset',
  'effectReactPreset',
  'boundariesPreset',
  'effectTsgoConfig',
  'baseConfig',
  fullCompositionTarget,
] as const;
export type RuleTarget = (typeof ruleTargets)[number];
type PrintedTarget = 'baseConfig' | typeof fullCompositionTarget;

const tsgoRulePrefix = 'effecttsgo/';
const tsgoTargets: readonly RuleTarget[] = ['effectPreset', 'effectTsgoConfig'];
// Manifest collections a package rule can belong to, mapped to the targets that ship it. baseConfig
// spreads generalPreset, so general rules also reach the composition built on it.
const packageTargetsByCollection: Readonly<Partial<Record<string, readonly RuleTarget[]>>> = {
  baseConfig: ['baseConfig', fullCompositionTarget],
  boundariesPreset: ['boundariesPreset'],
  effectPreset: ['effectPreset'],
  effectReactPreset: ['effectReactPreset'],
  generalPreset: ['generalPreset'],
};
// Print-config spells severities deny/warn/allow; configs spell them error/warn/off.
const severityBySpelling: Readonly<Record<string, RuleSeverity>> = {
  allow: 'off',
  deny: 'error',
  error: 'error',
  off: 'off',
  warn: 'warn',
};
const messagePartsPattern = /\bFix: (?<fix>.+?) Ref: (?<reference>.+)$/su;

export type ManifestRow = Pick<
  RuleManifestEntry,
  'collections' | 'disposition' | 'domain' | 'implementationStatus' | 'name' | 'note' | 'severity'
>;
export type TsgoSnapshotRuleInput = Pick<
  TsgoSnapshotRule,
  'category' | 'description' | 'fixable' | 'preview' | 'ruleName'
>;

export interface PrintedScopes {
  readonly normal: Readonly<Record<string, unknown>>;
  readonly test: Readonly<Record<string, unknown>>;
}

export interface TsgoInputs {
  readonly attribution: string;
  readonly docsBaseUrl: string;
  readonly rows: ReadonlyArray<{ readonly ruleName: string; readonly severity: RuleSeverity }>;
  readonly snapshotRules: readonly TsgoSnapshotRuleInput[];
  readonly testOverrides: Readonly<Partial<Record<string, RuleSeverity>>>;
  readonly version: string;
}

export interface RuleListInputs {
  // The built config object for every target.
  readonly configs: Readonly<Record<RuleTarget, object>>;
  readonly manifest: readonly ManifestRow[];
  readonly messageTemplate: (ruleName: string) => string;
  readonly oxlintItems: readonly OxlintRuleItem[];
  readonly pluginName: string;
  readonly printed: Readonly<Record<PrintedTarget, PrintedScopes>>;
  readonly tsgo: TsgoInputs;
}

interface SeverityScopes {
  readonly normal: ReadonlyMap<string, RuleSeverity>;
  readonly test: ReadonlyMap<string, RuleSeverity>;
}
type TargetScopes = Readonly<Record<RuleTarget, SeverityScopes>>;

export const normalizeSeverity = (setting: unknown): RuleSeverity => {
  const spelling: unknown = Array.isArray(setting) ? setting[0] : setting;
  const severity =
    typeof spelling === 'string' ? severityBySpelling[spelling] : globalThis.undefined;
  return severity ?? fail(`Unknown rule severity ${JSON.stringify(setting)}.`);
};

// Code-unit order, so the generated page does not depend on the machine's locale.
const compareText = (left: string, right: string): number =>
  Number(left > right) - Number(left < right);

const targetIndex = (target: string): number => ruleTargets.findIndex((name) => name === target);

const rulesOf = (config: unknown): Readonly<Record<string, unknown>> => {
  const rules = isObjectRecord(config) ? config['rules'] : globalThis.undefined;
  return isObjectRecord(rules) ? rules : {};
};

const severityMap = (rules: Readonly<Record<string, unknown>>): Map<string, RuleSeverity> =>
  new Map(
    Object.entries(rules).map(([name, setting]) => [
      normalizeTypescriptAlias(name),
      normalizeSeverity(setting),
    ]),
  );

// Reads a config object's own settings; the test view applies its test-file overrides.
const configuredScopes = (config: object): SeverityScopes => ({
  normal: severityMap(rulesOf(config)),
  test: severityMap(rulesOf(flattenTestOverridesIntoGlobal(config))),
});

const targetScopes = (configs: RuleListInputs['configs']): TargetScopes => ({
  baseConfig: configuredScopes(configs.baseConfig),
  boundariesPreset: configuredScopes(configs.boundariesPreset),
  effectPreset: configuredScopes(configs.effectPreset),
  effectReactPreset: configuredScopes(configs.effectReactPreset),
  effectTsgoConfig: configuredScopes(configs.effectTsgoConfig),
  generalPreset: configuredScopes(configs.generalPreset),
  [fullCompositionTarget]: configuredScopes(configs[fullCompositionTarget]),
});

const isShippedPackageRow = (row: ManifestRow): boolean =>
  (row.disposition === 'ported' || row.disposition === 'reimplemented') &&
  row.implementationStatus === 'implemented';

const packageRowTargets = (row: ManifestRow): readonly RuleTarget[] =>
  row.collections
    .flatMap(
      (collection) =>
        packageTargetsByCollection[collection] ??
        fail(`Package rule ${row.name} is in ${collection}, which no rules-page target covers.`),
    )
    .toSorted((left, right) => targetIndex(left) - targetIndex(right));

const messageParts = (
  ruleName: string,
  template: string,
): { readonly fix: string; readonly reference: string } => {
  const groups = messagePartsPattern.exec(template)?.groups;
  const fix = groups?.['fix'];
  const reference = groups?.['reference'];
  if (fix === globalThis.undefined || reference === globalThis.undefined) {
    return fail(`The message for ${ruleName} has no "Fix: ... Ref: ..." parts.`);
  }
  return { fix, reference };
};

const packageRule = (
  row: ManifestRow,
  inputs: RuleListInputs,
  scopes: TargetScopes,
): CollectedRule => {
  const name = `${inputs.pluginName}/${row.name}`;
  const normal = collapseManifestSeverity(row.severity);
  const { fix, reference } = messageParts(row.name, inputs.messageTemplate(row.name));
  return {
    activations: packageRowTargets(row).map((target) => ({
      normal,
      target,
      test: scopes[target].test.get(name) ?? normal,
    })),
    category: row.domain,
    description: row.note,
    docsUrl: null,
    example: null,
    fix,
    fixable: null,
    name,
    reference,
    source: 'package',
  };
};

const tsgoRules = (tsgo: TsgoInputs): readonly CollectedRule[] => {
  const snapshotByName = new Map(tsgo.snapshotRules.map((rule) => [rule.ruleName, rule]));
  return tsgo.rows.map((row) => {
    const snapshotRule =
      snapshotByName.get(row.ruleName) ?? fail(`The tsgo snapshot has no row for ${row.ruleName}.`);
    const test = tsgo.testOverrides[row.ruleName] ?? row.severity;
    return {
      activations: tsgoTargets.map((target) => ({ normal: row.severity, target, test })),
      category: snapshotRule.category,
      description: snapshotRule.description,
      docsUrl: `${tsgo.docsBaseUrl}${kebabFromRuleName(row.ruleName)}.md`,
      example: {
        diagnostics: snapshotRule.preview.diagnostics,
        sourceText: snapshotRule.preview.sourceText,
      },
      fix: null,
      fixable: snapshotRule.fixable,
      name: row.ruleName,
      reference: null,
      source: 'tsgo',
    };
  });
};

const isNamespaced = (name: string, pluginName: string): boolean =>
  name.startsWith(`${pluginName}/`) || name.startsWith(tsgoRulePrefix);

const describeSettings = (settings: Iterable<readonly [string, RuleSeverity]>): Set<string> =>
  new Set([...settings].map(([name, severity]) => `${name}=${severity}`));

type SeverityScope = keyof SeverityScopes;

const scopeDifferences = (
  target: RuleTarget,
  scope: SeverityScope,
  builtScopes: SeverityScopes,
  context: { readonly pluginName: string; readonly sourceRules: readonly CollectedRule[] },
): readonly string[] => {
  const expected = describeSettings(
    context.sourceRules.flatMap((rule) =>
      rule.activations
        .filter((activation) => activation.target === target)
        .map((activation) => [rule.name, activation[scope]] as const),
    ),
  );
  const built = describeSettings(
    [...builtScopes[scope]].filter(([name]) => isNamespaced(name, context.pluginName)),
  );
  const label = scope === 'normal' ? '' : 'tests ';
  return [
    ...[...built]
      .filter((setting) => !expected.has(setting))
      .map((setting) => `built ${label}${setting}`),
    ...[...expected]
      .filter((setting) => !built.has(setting))
      .map((setting) => `source ${label}${setting}`),
  ];
};

// Fails when a built preset or config sets package or tsgo rules differently from the sources the
// page is rendered from, for normal or test files, so a stale build cannot produce a page that
// disagrees with what ships. tsgo test severities come from the policy, so a missing or changed
// test-file override in the build shows up here.
const assertConfigsMatchSources = (
  inputs: RuleListInputs,
  scopes: TargetScopes,
  sourceRules: readonly CollectedRule[],
): void => {
  const context = { pluginName: inputs.pluginName, sourceRules };
  for (const target of ruleTargets) {
    const differences = [
      ...scopeDifferences(target, 'normal', scopes[target], context),
      ...scopeDifferences(target, 'test', scopes[target], context),
    ].toSorted(compareText);
    if (differences.length > 0) {
      fail(
        `${target} in the built package disagrees with the manifest and tsgo policy; rebuild the package. Differing settings: ${differences.join(', ')}`,
      );
    }
  }
};

const printedEntries = (
  target: PrintedTarget,
  printed: PrintedScopes,
): ReadonlyArray<readonly [string, RuleActivation]> => {
  const normal = severityMap(printed.normal);
  const test = severityMap(printed.test);
  return [...new Set([...normal.keys(), ...test.keys()])].map((name) => [
    name,
    { normal: normal.get(name) ?? 'off', target, test: test.get(name) ?? 'off' },
  ]);
};

// Built-in settings per target: print-config for the two compositions, explicit settings otherwise.
const builtInEntries = (
  target: RuleTarget,
  inputs: RuleListInputs,
  scopes: TargetScopes,
): ReadonlyArray<readonly [string, RuleActivation]> => {
  if (target === 'baseConfig' || target === fullCompositionTarget) {
    return printedEntries(target, inputs.printed[target]);
  }
  const { normal, test } = scopes[target];
  return [...normal]
    .filter(([name]) => !isNamespaced(name, inputs.pluginName))
    .map(([name, severity]) => [
      name,
      { normal: severity, target, test: test.get(name) ?? severity },
    ]);
};

const builtInRules = (inputs: RuleListInputs, scopes: TargetScopes): readonly CollectedRule[] => {
  const activationsByName = new Map<string, RuleActivation[]>();
  for (const target of ruleTargets) {
    for (const [name, activation] of builtInEntries(target, inputs, scopes)) {
      activationsByName.set(name, [...(activationsByName.get(name) ?? []), activation]);
    }
  }
  const itemsByName = new Map(
    inputs.oxlintItems.flatMap((item) => item.configNames.map((name) => [name, item] as const)),
  );
  const notesByName = new Map(
    inputs.manifest.filter((row) => row.disposition === 'built-in').map((row) => [row.name, row]),
  );
  return [...activationsByName].map(([name, activations]) => {
    const item =
      itemsByName.get(name) ?? fail(`${name} is configured, but oxlint --rules does not list it.`);
    return {
      activations,
      category: item.category,
      description: notesByName.get(name)?.note ?? null,
      docsUrl: item.docsUrl,
      example: null,
      fix: null,
      fixable: item.fix !== 'none',
      name,
      reference: null,
      source: 'oxlint',
    };
  });
};

const isOnSomewhere = (rule: CollectedRule): boolean =>
  rule.activations.some((activation) => activation.normal !== 'off' || activation.test !== 'off');

const sourceIndex = (rule: CollectedRule): number =>
  ['package', 'tsgo', 'oxlint'].indexOf(rule.source);

const compareRules = (left: CollectedRule, right: CollectedRule): number =>
  sourceIndex(left) - sourceIndex(right) || compareText(left.name, right.name);

// Pure over its inputs so tests can feed hand-written configs and print-config maps.
export const buildRuleList = (inputs: RuleListInputs): RuleList => {
  const scopes = targetScopes(inputs.configs);
  const sourceRules = [
    ...inputs.manifest.filter(isShippedPackageRow).map((row) => packageRule(row, inputs, scopes)),
    ...tsgoRules(inputs.tsgo),
  ];
  assertConfigsMatchSources(inputs, scopes, sourceRules);
  const rules = [...sourceRules, ...builtInRules(inputs, scopes)]
    .filter(isOnSomewhere)
    .toSorted(compareRules);
  return {
    rules,
    targets: ruleTargets,
    tsgoAttribution: inputs.tsgo.attribution,
    tsgoVersion: inputs.tsgo.version,
  };
};

type ComposeConfigs = (...configs: readonly object[]) => object;

const isComposeConfigs = (value: unknown): value is ComposeConfigs => typeof value === 'function';

const shippedObject = (namespace: Record<string, unknown>, name: string): object => {
  const value = namespace[name];
  return isObjectRecord(value) ? value : fail(`The built package does not export ${name}.`);
};

const printScopes = (config: object): PrintedScopes => ({
  normal: materializeEffectiveRules(config, oxlintBin),
  test: materializeEffectiveRules(flattenTestOverridesIntoGlobal(config), oxlintBin),
});

const tsgoInputs = (snapshot: TsgoSnapshot): TsgoInputs => ({
  attribution: `${snapshot.license.spdx}, ${snapshot.license.copyright}`,
  docsBaseUrl: `${snapshot.source.repository}/blob/${snapshot.source.tag}/docs/rules/`,
  rows: tsgoPolicyRows,
  snapshotRules: snapshot.rules,
  testOverrides: tsgoTestFileRuleOverrides,
  version: snapshot.package.version,
});

// Reads the built package, so callers build it first.
export const collectRules = async (): Promise<RuleList> => {
  // oxlint-disable-next-line @mplibunao/oxlint-standards/prevent-dynamic-imports -- loads the freshly built dist at runtime; scripts have no static import path to it
  const namespace: unknown = await import(pathToFileURL(distPluginPath).href);
  const shipped = isObjectRecord(namespace)
    ? namespace
    : fail('The built package is not a module.');
  const { composeLintConfigs, pluginName } = shipped;
  if (!isComposeConfigs(composeLintConfigs) || typeof pluginName !== 'string') {
    return fail('The built package does not export composeLintConfigs and pluginName.');
  }
  const baseConfig = shippedObject(shipped, 'baseConfig');
  const fullComposition = composeLintConfigs(
    baseConfig,
    shippedObject(shipped, 'vitestConfig'),
    shippedObject(shipped, 'nodeRuntimeConfig'),
  );
  const snapshotDir = join(repoRoot, 'scripts', 'references', 'tsgo');
  return buildRuleList({
    configs: {
      baseConfig,
      boundariesPreset: shippedObject(shipped, 'boundariesPreset'),
      effectPreset: shippedObject(shipped, 'effectPreset'),
      effectReactPreset: shippedObject(shipped, 'effectReactPreset'),
      effectTsgoConfig: shippedObject(shipped, 'effectTsgoConfig'),
      generalPreset: shippedObject(shipped, 'generalPreset'),
      [fullCompositionTarget]: fullComposition,
    },
    manifest: ruleManifest,
    messageTemplate: ruleMessageTemplate,
    oxlintItems: readOxlintRuleItems(oxlintBin),
    pluginName,
    printed: {
      baseConfig: printScopes(baseConfig),
      [fullCompositionTarget]: printScopes(fullComposition),
    },
    tsgo: tsgoInputs(readRetainedTsgoSnapshot(snapshotDir, tsgoPolicyVersion)),
  });
};
