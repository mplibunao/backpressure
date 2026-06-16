#!/usr/bin/env bun
/* oxlint-disable max-lines -- The inventory gate intentionally co-locates manifest, source, and runtime invariants. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildOxlintRuleCatalog,
  configuredRuleEntries,
  generateEffectiveConfigArtifact,
  isConfiguredRuleKnown,
  type RuleEntry,
  serializeArtifact,
} from '../lib/effective-config.ts';
import { fail, repoRoot } from '../lib/script-runtime.ts';
import { buildOxlintStandards, oxlintBin } from '../packages/oxlint-standards/package.ts';

const distEntryPath = join(repoRoot, 'packages', 'oxlint-standards', 'dist', 'index.js');
const sourceRoot =
  process.env['LINTEFFECT_SOURCE_ROOT'] ?? join(repoRoot, 'test-fixtures', 'linteffect');
const rulesDir = join(sourceRoot, 'rules');
const configDir = join(sourceRoot, 'configs');
const fixtureRoot = join(sourceRoot, 'tests', 'fixtures');
const expectedSourceRuleCount = 50;
const sourceConfigs = ['core', 'web', 'ts-type', 'full'];
const explicitDrops = ['no-effect-fn-generator', 'no-if-statement', 'no-ternary'];
const sourceConfigAnomalies = [
  'no-effect-succeed-variable',
  'no-inline-runtime-provide',
  'no-wrapgraphql-catchall',
];
const sourceFixtureParity = 'source-fixture-replay';
const semanticScenarioParity = 'semantic-scenario-replay';
const delegatedParity = 'delegated';
const notApplicableParity = 'not-applicable';
const minimumSemanticInvalidCases = 1;
const minimumSemanticValidCases = 2;
const minimumQuietOrOffCollectionEntries = 5;

interface ManifestEntry {
  readonly disposition: string;
  readonly gating: string;
  readonly implementationStatus: string;
  readonly collections: readonly string[];
  readonly name: string;
  readonly note: string;
  readonly parityStatus: string;
  readonly rationaleClass: string;
  readonly severity: string;
  readonly sourceOwnership: string;
  readonly sourcePresets: readonly string[];
  readonly testSource: string;
}

interface ReplayCase {
  readonly branchIds?: readonly string[];
  readonly name: string;
}

interface ReplaySuite {
  readonly diagnostic: {
    readonly ruleName: string;
  };
  readonly invalid: readonly ReplayCase[];
  readonly requiredBranchIds: readonly string[];
  readonly valid: readonly ReplayCase[];
}

interface SourceFixtureSet {
  readonly invalid: readonly string[];
  readonly valid: readonly string[];
}

interface RuleConfigOverride {
  readonly rules?: Record<string, unknown>;
}

interface RuleConfigFragment {
  readonly overrides?: readonly RuleConfigOverride[];
  readonly rules?: Record<string, unknown>;
}

interface InventoryPackageEntry {
  readonly configs: Record<string, RuleConfigFragment>;
  readonly manifestEntries: readonly ManifestEntry[];
  readonly pluginName: string;
  readonly rules: Record<string, unknown>;
}

const read = (path: string) => readFileSync(path, 'utf8');
const compareText = (left: string, right: string) => left.localeCompare(right);
const uniqueSorted = (values: Iterable<string>) => [...new Set(values)].sort(compareText);
const sorted = (values: readonly string[]) => [...values].sort(compareText);
const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const list = (values: readonly string[]) => (values.length === 0 ? 'none' : values.join(', '));
// Pending WI-17 / ADR-004 policy reconciliation: these are the only style-class rules
// Currently allowed to stay at error because they are mechanical, autofixable exceptions.
const styleAtErrorExceptions = new Set([
  '@typescript-eslint/array-type',
  '@typescript-eslint/dot-notation',
  '@typescript-eslint/no-inferrable-types',
  '@typescript-eslint/prefer-function-type',
  'prefer-template',
]);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isManifestEntry = (value: unknown): value is ManifestEntry =>
  isObjectRecord(value) &&
  typeof value['disposition'] === 'string' &&
  typeof value['gating'] === 'string' &&
  typeof value['implementationStatus'] === 'string' &&
  isStringArray(value['collections']) &&
  typeof value['name'] === 'string' &&
  typeof value['note'] === 'string' &&
  typeof value['parityStatus'] === 'string' &&
  typeof value['rationaleClass'] === 'string' &&
  typeof value['severity'] === 'string' &&
  typeof value['sourceOwnership'] === 'string' &&
  isStringArray(value['sourcePresets']) &&
  typeof value['testSource'] === 'string';
const isReplayCase = (value: unknown): value is ReplayCase =>
  isObjectRecord(value) &&
  typeof value['name'] === 'string' &&
  (typeof value['branchIds'] === 'undefined' || isStringArray(value['branchIds']));
const isReplaySuite = (value: unknown): value is ReplaySuite =>
  isObjectRecord(value) &&
  isObjectRecord(value['diagnostic']) &&
  typeof value['diagnostic']['ruleName'] === 'string' &&
  isStringArray(value['requiredBranchIds']) &&
  Array.isArray(value['invalid']) &&
  value['invalid'].every(isReplayCase) &&
  Array.isArray(value['valid']) &&
  value['valid'].every(isReplayCase);
const isReplaySuites = (value: unknown): value is readonly ReplaySuite[] =>
  Array.isArray(value) && value.every(isReplaySuite);
const isManifestEntries = (value: unknown): value is readonly ManifestEntry[] =>
  Array.isArray(value) && value.every(isManifestEntry);
const isRuleConfigOverride = (value: unknown): value is RuleConfigOverride =>
  isObjectRecord(value) &&
  (typeof value['rules'] === 'undefined' || isObjectRecord(value['rules']));
const isRuleConfigFragment = (value: unknown): value is RuleConfigFragment =>
  isObjectRecord(value) &&
  (typeof value['rules'] === 'undefined' || isObjectRecord(value['rules'])) &&
  (typeof value['overrides'] === 'undefined' ||
    (Array.isArray(value['overrides']) && value['overrides'].every(isRuleConfigOverride)));

// Type alias for the composeLintConfigs factory function exported from the built package.
type ComposeConfigsFn = (...configs: readonly object[]) => object;

const isComposeConfigsFn = (value: unknown): value is ComposeConfigsFn =>
  typeof value === 'function';

const extractComposeConfigsFn = (namespace: unknown): ComposeConfigsFn => {
  if (isObjectRecord(namespace)) {
    const composeFn = namespace['composeLintConfigs'];
    if (isComposeConfigsFn(composeFn)) {
      return composeFn;
    }
  }
  return fail('Built package did not export composeLintConfigs.');
};
const readReplaySuites = (moduleNamespace: unknown): readonly ReplaySuite[] => {
  if (isObjectRecord(moduleNamespace) && isReplaySuites(moduleNamespace['replaySuites'])) {
    return moduleNamespace['replaySuites'];
  }

  return fail('Fixture replay script did not export replaySuites as an array.');
};
const readPackageEntry = (moduleNamespace: unknown): InventoryPackageEntry => {
  if (
    isObjectRecord(moduleNamespace) &&
    isManifestEntries(moduleNamespace['ruleManifest']) &&
    isObjectRecord(moduleNamespace['rules']) &&
    typeof moduleNamespace['pluginName'] === 'string' &&
    isRuleConfigFragment(moduleNamespace['baseConfig']) &&
    isRuleConfigFragment(moduleNamespace['vitestConfig']) &&
    isRuleConfigFragment(moduleNamespace['nodeRuntimeConfig'])
  ) {
    return {
      configs: {
        baseConfig: moduleNamespace['baseConfig'],
        nodeRuntimeConfig: moduleNamespace['nodeRuntimeConfig'],
        vitestConfig: moduleNamespace['vitestConfig'],
      },
      manifestEntries: moduleNamespace['ruleManifest'],
      pluginName: moduleNamespace['pluginName'],
      rules: moduleNamespace['rules'],
    };
  }

  return fail('Built package did not export ruleManifest, configs, and runtime rules.');
};

const configuredSeverity = (setting: unknown): unknown =>
  Array.isArray(setting) ? setting[0] : setting;
const normalizeConfigRuleName = (ruleName: string, pluginRulePrefix: string): string =>
  ruleName.startsWith(pluginRulePrefix) ? ruleName.slice(pluginRulePrefix.length) : ruleName;
const explicitConfiguredRules = (
  config: RuleConfigFragment,
  pluginRulePrefix: string,
): ReadonlyArray<readonly [string, unknown]> => {
  const rules = Object.entries(config.rules ?? {}).map(
    ([ruleName, setting]) =>
      [normalizeConfigRuleName(ruleName, pluginRulePrefix), configuredSeverity(setting)] as const,
  );
  const overrideRules = (config.overrides ?? []).flatMap((override) =>
    Object.entries(override.rules ?? {}).map(
      ([ruleName, setting]) =>
        [normalizeConfigRuleName(ruleName, pluginRulePrefix), configuredSeverity(setting)] as const,
    ),
  );

  return [...rules, ...overrideRules];
};

const sourceRuleNames = uniqueSorted(
  readdirSync(rulesDir)
    .filter((file) => file.endsWith('.grit'))
    .map((file) => basename(file, '.grit')),
);

const configMembership = new Map<string, string[]>(sourceRuleNames.map((name) => [name, []]));
for (const configName of sourceConfigs) {
  const configText = read(join(configDir, `${configName}.jsonc`));
  for (const match of configText.matchAll(/rules\/([\w-]+)\.grit/g)) {
    const [, ruleName] = match;
    if (typeof ruleName !== 'string') {
      continue;
    }

    const currentMembership = configMembership.get(ruleName) ?? [];
    currentMembership.push(configName);
    configMembership.set(ruleName, currentMembership);
  }
}

const sourceFixtureFiles = new Map<string, SourceFixtureSet>();
if (existsSync(fixtureRoot)) {
  for (const ruleName of readdirSync(fixtureRoot)) {
    const ruleFixtureDir = join(fixtureRoot, ruleName);
    const files = readdirSync(ruleFixtureDir)
      .filter((file) => file.endsWith('.ts'))
      .sort(compareText);
    sourceFixtureFiles.set(ruleName, {
      invalid: files.filter((file) => file.startsWith('invalid-')),
      valid: files.filter((file) => file.startsWith('valid-')),
    });
  }
}

buildOxlintStandards();

const [replayModule, packageEntry]: [unknown, unknown] = await Promise.all([
  // oxlint-disable-next-line @mplibunao/oxlint-standards/prevent-dynamic-imports -- loads freshly-built dist at runtime; no static import exists until the build step runs
  import(pathToFileURL(join(repoRoot, 'scripts', 'checks', 'fixture-replay.ts')).href),
  // oxlint-disable-next-line @mplibunao/oxlint-standards/prevent-dynamic-imports -- loads freshly-built dist at runtime; no static import exists until the build step runs
  import(pathToFileURL(distEntryPath).href),
]);
const replaySuites = readReplaySuites(replayModule);
const { configs, manifestEntries, pluginName, rules } = readPackageEntry(packageEntry);

// ─── Effective-config staleness gate ────────────────────────────────────────
// Bracket notation required because configs is Record<string, RuleConfigFragment>.
// Nullish coalesce with fail() narrows from RuleConfigFragment|undefined to RuleConfigFragment.
const baseConfigEntry = configs['baseConfig'] ?? fail('Package missing baseConfig entry.');
const vitestConfigEntry = configs['vitestConfig'] ?? fail('Package missing vitestConfig entry.');
const nodeRuntimeConfigEntry =
  configs['nodeRuntimeConfig'] ?? fail('Package missing nodeRuntimeConfig entry.');
const composeLintConfigsFn = extractComposeConfigsFn(packageEntry);
const fullComposed = composeLintConfigsFn(
  baseConfigEntry,
  vitestConfigEntry,
  nodeRuntimeConfigEntry,
);
const freshArtifact = serializeArtifact(
  generateEffectiveConfigArtifact(baseConfigEntry, fullComposed, oxlintBin),
);
const effectiveConfigPath = join(repoRoot, 'docs', 'references', 'effective-config.json');
if (!existsSync(effectiveConfigPath)) {
  fail('effective-config.json is missing. Run `pnpm gen:effective-config` to generate it.');
}
if (read(effectiveConfigPath) !== freshArtifact) {
  fail('effective-config.json is stale. Run `pnpm gen:effective-config` to regenerate it.');
}

// ─── Unknown-rule gate ───────────────────────────────────────────────────────
const allConfiguredEntries: readonly RuleEntry[] = [
  ...configuredRuleEntries(baseConfigEntry),
  ...configuredRuleEntries(vitestConfigEntry),
  ...configuredRuleEntries(nodeRuntimeConfigEntry),
];

// P1-4a: Assert canonical namespace — the package must author @typescript-eslint/* directly.
// Authoring typescript/* (oxlint's internal alias) is a namespace regression that must fail loudly.
const nonCanonicalEntries = allConfiguredEntries.filter((entry) =>
  entry.rawName.startsWith('typescript/'),
);
if (nonCanonicalEntries.length > 0) {
  fail(
    `Configured rules must use @typescript-eslint/* namespace, not typescript/*: ${list(uniqueSorted(nonCanonicalEntries.map((entry) => entry.rawName)))}.`,
  );
}

// P1-4b: Collision detection — two different raw names normalizing to the same canonical key
// With different severities would silently shadow one configuration. Fail instead.
const entriesByCanonical = new Map<string, RuleEntry[]>();
for (const entry of allConfiguredEntries) {
  const group = entriesByCanonical.get(entry.canonicalName) ?? [];
  group.push(entry);
  entriesByCanonical.set(entry.canonicalName, group);
}
const canonicalCollisions: string[] = [];
for (const [canonicalName, group] of entriesByCanonical) {
  const rawNames = new Set(group.map((ruleEntry) => ruleEntry.rawName));
  const severities = new Set(group.map((ruleEntry) => JSON.stringify(ruleEntry.severity)));
  if (rawNames.size > 1 && severities.size > 1) {
    canonicalCollisions.push(canonicalName);
  }
}
if (canonicalCollisions.length > 0) {
  fail(
    `Canonical rule names have conflicting raw aliases with different severities: ${list(canonicalCollisions)}.`,
  );
}

// P1-1 + P1-2: Authoritative catalog from `oxlint --rules` — checks every configured rule name
// Against every rule oxlint actually knows, after the same canonical normalization.
// Custom plugin rules (prefixed with pluginName/) are excluded: they are JS-plugin rules
// That oxlint's --rules output does not enumerate.
const oxlintCatalog = buildOxlintRuleCatalog(oxlintBin);
const allCanonicalNames = uniqueSorted(allConfiguredEntries.map((entry) => entry.canonicalName));
const unknownConfiguredRules = allCanonicalNames.filter(
  (ruleName) => !isConfiguredRuleKnown(ruleName, oxlintCatalog, pluginName),
);
if (unknownConfiguredRules.length > 0) {
  fail(
    `The package configures rules oxlint does not recognize (check for typos): ${list(unknownConfiguredRules)}.`,
  );
}

const pluginRulePrefix = `${pluginName}/`;
const manifestNames = manifestEntries.map((entry) => entry.name);
const duplicateNames = uniqueSorted(
  manifestNames.filter((name, index) => manifestNames.indexOf(name) !== index),
);
if (duplicateNames.length > 0) {
  fail(`Manifest contains duplicate rule names: ${list(duplicateNames)}.`);
}

if (sourceRuleNames.length !== expectedSourceRuleCount) {
  fail(`Expected ${expectedSourceRuleCount} source .grit rules, found ${sourceRuleNames.length}.`);
}

const linteffectEntries = manifestEntries.filter((entry) => entry.sourceOwnership === 'linteffect');
const linteffectNames = linteffectEntries.map((entry) => entry.name);
const implementedCustomEntries = manifestEntries.filter(
  (entry) => entry.implementationStatus === 'implemented' && entry.disposition !== 'built-in',
);
const droppedLinteffectNames = linteffectEntries
  .filter((entry) => entry.disposition === 'dropped')
  .map((entry) => entry.name);
const runtimeRuleNames = new Set(Object.keys(rules));
const replaySuiteByRule = new Map<string, ReplaySuite>();
for (const replaySuite of replaySuites) {
  const {
    diagnostic: { ruleName },
  } = replaySuite;
  const existingSuite = replaySuiteByRule.get(ruleName);
  if (typeof existingSuite === 'undefined') {
    replaySuiteByRule.set(ruleName, replaySuite);
    continue;
  }

  replaySuiteByRule.set(ruleName, {
    diagnostic: replaySuite.diagnostic,
    invalid: [...existingSuite.invalid, ...replaySuite.invalid],
    requiredBranchIds: uniqueSorted([
      ...existingSuite.requiredBranchIds,
      ...replaySuite.requiredBranchIds,
    ]),
    valid: [...existingSuite.valid, ...replaySuite.valid],
  });
}

const missingFromManifest = sourceRuleNames.filter((name) => !linteffectNames.includes(name));
const extraInManifest = linteffectNames.filter((name) => !sourceRuleNames.includes(name));
if (missingFromManifest.length > 0 || extraInManifest.length > 0) {
  fail(
    `Manifest/source mismatch. Missing: ${list(missingFromManifest)}; extra: ${list(extraInManifest)}.`,
  );
}

for (const entry of linteffectEntries) {
  const expectedPresets = sorted(configMembership.get(entry.name) ?? []);
  const actualPresets = sorted(entry.sourcePresets);
  if (!sameList(actualPresets, expectedPresets)) {
    fail(
      `${entry.name} sourcePresets mismatch. Expected [${expectedPresets.join(', ')}], got [${actualPresets.join(', ')}].`,
    );
  }
}

for (const name of explicitDrops) {
  if (!droppedLinteffectNames.includes(name)) {
    fail(`Expected ${name} to be explicitly dropped.`);
  }
}

for (const name of sourceConfigAnomalies) {
  if (!linteffectNames.includes(name)) {
    fail(`Expected source-config anomaly ${name} to be represented.`);
  }
}

const collectionEntries = manifestEntries.filter((entry) => entry.collections.length > 0);
const collectionEntriesFor = (collection: string): readonly ManifestEntry[] =>
  manifestEntries.filter((entry) => entry.collections.includes(collection));
const omittedNonErrorRuleAllowlist = new Set([
  // Test files disable unsafe assertions because fixture-heavy tests need boundary casts.
  '@typescript-eslint/no-unsafe-type-assertion',
  // Test files build partial mock AST nodes via forced casts (same concession as above).
  // The normalized name strips the @mplibunao/oxlint-standards/ plugin prefix.
  'no-double-cast',
  // The linteffect no-ternary source row stays collection-less; base explicitly leaves it off.
  'no-ternary',
  // Vitest and Unicorn non-owned rules are explicitly silenced to prevent category bleed.
  ...Object.keys(configs['vitestConfig']?.rules ?? {}).map((ruleName) =>
    normalizeConfigRuleName(ruleName, pluginRulePrefix),
  ),
  ...Object.keys(configs['nodeRuntimeConfig']?.rules ?? {})
    .filter((ruleName) => ruleName !== 'unicorn/prefer-node-protocol')
    .map((ruleName) => normalizeConfigRuleName(ruleName, pluginRulePrefix)),
]);
const enabledWithoutImplementation = collectionEntries.filter(
  (entry) => entry.implementationStatus !== 'implemented',
);
if (enabledWithoutImplementation.length > 0) {
  fail(
    `Preset-enabled rules must be implemented: ${list(enabledWithoutImplementation.map((entry) => entry.name))}.`,
  );
}

const enabledWithoutParity = collectionEntries.filter(
  (entry) =>
    entry.disposition !== 'built-in' &&
    ![sourceFixtureParity, semanticScenarioParity].includes(entry.parityStatus),
);
if (enabledWithoutParity.length > 0) {
  fail(
    `Collection-backed custom rules require source or semantic parity: ${list(enabledWithoutParity.map((entry) => entry.name))}.`,
  );
}

const quietOrOffEntries = collectionEntries.filter((entry) => entry.severity !== 'error');
if (quietOrOffEntries.length <= minimumQuietOrOffCollectionEntries) {
  fail('Collection-backed manifest looks blanket-all-error; expected a meaningful quiet/off set.');
}

for (const rationaleClass of ['correctness', 'safety', 'agent-failure-mode', 'style']) {
  if (!collectionEntries.some((entry) => entry.rationaleClass === rationaleClass)) {
    fail(`Collection-backed manifest lacks ${rationaleClass} rationale coverage.`);
  }
}

const quietlyEnabledCriticalRules = collectionEntries.filter(
  (entry) =>
    ['correctness', 'safety'].includes(entry.rationaleClass) &&
    entry.severity !== 'off' &&
    entry.severity !== 'error',
);
if (quietlyEnabledCriticalRules.length > 0) {
  fail(
    `Enabled correctness/safety rules must stay at error: ${list(quietlyEnabledCriticalRules.map((entry) => entry.name))}.`,
  );
}

const styleErrorEntries = collectionEntries.filter(
  (entry) => entry.rationaleClass === 'style' && entry.severity === 'error',
);
const styleErrorNames = sorted(styleErrorEntries.map((entry) => entry.name));
const styleErrorExceptionNames = sorted([...styleAtErrorExceptions]);
if (!sameList(styleErrorNames, styleErrorExceptionNames)) {
  fail(
    `Style-class error rules must exactly match the pending-policy exception allowlist. Expected [${styleErrorExceptionNames.join(', ')}], got [${styleErrorNames.join(', ')}].`,
  );
}

const styleErrorsWithoutAutofixEvidence = styleErrorEntries.filter(
  (entry) => !entry.note.includes('autofixable') || !entry.note.includes('vp check --fix'),
);
if (styleErrorsWithoutAutofixEvidence.length > 0) {
  fail(
    `Style-class error exceptions must evidence autofixable + vp check --fix: ${list(styleErrorsWithoutAutofixEvidence.map((entry) => entry.name))}.`,
  );
}

for (const [collection, config] of Object.entries(configs)) {
  const manifestNamesForCollection = new Set(
    collectionEntriesFor(collection).map((entry) => entry.name),
  );
  const configuredRules = explicitConfiguredRules(config, pluginRulePrefix);
  const missingErrorRules = configuredRules
    .filter(([, severity]) => severity === 'error')
    .map(([ruleName]) => ruleName)
    .filter((ruleName) => !manifestNamesForCollection.has(ruleName));
  if (missingErrorRules.length > 0) {
    fail(`${collection} explicit error rules missing manifest rows: ${list(missingErrorRules)}.`);
  }

  const missingNonErrorRules = configuredRules
    .filter(([, severity]) => severity !== 'error')
    .map(([ruleName]) => ruleName)
    .filter(
      (ruleName) =>
        !manifestNamesForCollection.has(ruleName) && !omittedNonErrorRuleAllowlist.has(ruleName),
    );
  if (missingNonErrorRules.length > 0) {
    fail(
      `${collection} non-error manifest omissions must be allowlisted: ${list(missingNonErrorRules)}.`,
    );
  }
}

const implementedWithoutRuntimeRule = implementedCustomEntries.filter(
  (entry) => !runtimeRuleNames.has(entry.name),
);
if (implementedWithoutRuntimeRule.length > 0) {
  fail(
    `Implemented custom rules missing from runtime plugin map: ${list(implementedWithoutRuntimeRule.map((entry) => entry.name))}.`,
  );
}

const implementedWithoutReplay = implementedCustomEntries.filter(
  (entry) => !replaySuiteByRule.has(entry.name),
);
if (implementedWithoutReplay.length > 0) {
  fail(
    `Implemented custom rules missing fixture replay suites: ${list(implementedWithoutReplay.map((entry) => entry.name))}.`,
  );
}

for (const entry of implementedCustomEntries) {
  if (entry.parityStatus !== semanticScenarioParity) {
    continue;
  }

  const replaySuite = replaySuiteByRule.get(entry.name);
  if (typeof replaySuite === 'undefined') {
    continue;
  }

  if (replaySuite.requiredBranchIds.length === 0) {
    fail(`${entry.name} claims semantic-scenario-replay but has no requiredBranchIds matrix.`);
  }

  if (
    replaySuite.invalid.length < minimumSemanticInvalidCases ||
    replaySuite.valid.length < minimumSemanticValidCases
  ) {
    fail(
      `${entry.name} claims semantic-scenario-replay but has only ${replaySuite.invalid.length} invalid and ${replaySuite.valid.length} valid replay case(s).`,
    );
  }

  if (
    entry.gating === 'effect-import' &&
    !replaySuite.valid.some((fixtureCase) => fixtureCase.name.includes('non-Effect file'))
  ) {
    fail(
      `${entry.name} claims effect-import gating but lacks a non-Effect false-positive replay case.`,
    );
  }

  const coveredBranchIds = new Set(
    [...replaySuite.invalid, ...replaySuite.valid].flatMap(
      (fixtureCase) => fixtureCase.branchIds ?? [],
    ),
  );
  const missingBranchIds = replaySuite.requiredBranchIds.filter(
    (branchId) => !coveredBranchIds.has(branchId),
  );
  if (missingBranchIds.length > 0) {
    fail(`${entry.name} semantic branch matrix is incomplete. Missing: ${list(missingBranchIds)}.`);
  }
}

for (const entry of manifestEntries) {
  const hasSourceFixture = sourceFixtureFiles.has(entry.name);
  if (entry.testSource === 'linteffect-fixture' && !hasSourceFixture) {
    fail(
      `${entry.name} declares linteffect-fixture testSource but no upstream fixture directory exists.`,
    );
  }

  if (hasSourceFixture && entry.sourceOwnership === 'linteffect') {
    if (entry.testSource !== 'linteffect-fixture') {
      fail(`${entry.name} has upstream fixtures but testSource is ${entry.testSource}.`);
    }

    if (entry.parityStatus !== sourceFixtureParity) {
      fail(`${entry.name} has upstream fixtures but parityStatus is ${entry.parityStatus}.`);
    }
  }

  if (entry.disposition === 'LSP-delegated' && entry.parityStatus !== delegatedParity) {
    fail(`${entry.name} is LSP-delegated but parityStatus is ${entry.parityStatus}.`);
  }

  if (
    ['dropped', 'built-in'].includes(entry.disposition) &&
    entry.parityStatus !== notApplicableParity
  ) {
    fail(
      `${entry.name} has ${entry.disposition} disposition but parityStatus is ${entry.parityStatus}.`,
    );
  }
}

for (const [ruleName, fixtureSets] of sourceFixtureFiles.entries()) {
  const replaySuite = replaySuiteByRule.get(ruleName);
  if (typeof replaySuite === 'undefined') {
    fail(`${ruleName} has upstream source fixtures but no replay suite.`);
    continue;
  }

  const replayInvalidNames = new Set(replaySuite.invalid.map((fixtureCase) => fixtureCase.name));
  const replayValidNames = new Set(replaySuite.valid.map((fixtureCase) => fixtureCase.name));
  const missingInvalid = fixtureSets.invalid.filter(
    (file) => !replayInvalidNames.has(`linteffect:${ruleName}/${file}`),
  );
  const missingValid = fixtureSets.valid.filter(
    (file) => !replayValidNames.has(`linteffect:${ruleName}/${file}`),
  );

  if (missingInvalid.length > 0 || missingValid.length > 0) {
    fail(
      `${ruleName} replay suite does not cover all upstream fixtures. Missing invalid: ${list(missingInvalid)}; missing valid: ${list(missingValid)}.`,
    );
  }
}

if (!manifestEntries.some((entry) => entry.name === 'lsp/missingEffectServiceDependency')) {
  fail('Expected @effect/language-service delegated checks to be represented.');
}

const parityCounts = Object.fromEntries(
  [sourceFixtureParity, semanticScenarioParity, delegatedParity, notApplicableParity].map(
    (status) => [status, manifestEntries.filter((entry) => entry.parityStatus === status).length],
  ),
);
const implementedLinteffectCount = linteffectEntries.filter(
  (entry) => entry.implementationStatus === 'implemented',
).length;

process.stdout.write(
  `rule inventory passed: ${sourceRuleNames.length} source rules represented, ${implementedLinteffectCount} linteffect rules implemented, ${droppedLinteffectNames.length} linteffect rules dropped, parity ${JSON.stringify(parityCounts)}\n`,
);
