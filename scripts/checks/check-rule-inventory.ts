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
import { tsgoRuleIds } from '../../packages/oxlint-standards/src/generated/tsgo-policy.ts';
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
// Independent source-drop allowlist: every linteffect-origin rule the catalog drops. It is kept
// apart from the manifest so that dropping a source rule by accident fails this gate.
const explicitDrops = [
  'no-call-tower',
  'no-effect-as',
  'no-effect-async',
  'no-effect-do',
  'no-effect-fn-generator',
  'no-effect-never',
  'no-effect-orElse-ladder',
  'no-effect-succeed-variable',
  'no-effect-sync-console',
  'no-effect-type-alias',
  'no-effect-wrapper-alias',
  'no-family-collection-read',
  'no-if-statement',
  'no-inline-runtime-provide',
  'no-manual-effect-channels',
  'no-match-void-branch',
  'no-naked-object-state-update',
  'no-nested-effect-call',
  'no-nested-effect-gen',
  'no-return-in-arrow',
  'no-return-in-callback',
  'no-runtime-runfork',
  'no-string-sentinel-const',
  'no-string-sentinel-return',
  'no-ternary',
  'no-wrapgraphql-catchall',
  'warn-effect-sync-wrapper',
];
// The full decided drop register, keyed by rule name with its exact replacement edges. The
// manifest's dropped rows and their replacedBy lists must match it exactly, in both directions.
const decidedDropRegister = new Map<string, readonly string[]>([
  ['effect-no-multiple-provide', ['effecttsgo/multiple-effect-provide']],
  ['no-call-tower', []],
  ['no-effect-as', []],
  ['no-effect-async', ['effecttsgo/outdated-api']],
  ['no-effect-do', ['effecttsgo/effect-do-notation']],
  ['no-effect-fn-generator', []],
  ['no-effect-never', []],
  ['no-effect-orElse-ladder', ['effecttsgo/outdated-api']],
  ['no-effect-succeed-variable', []],
  ['no-effect-sync-console', ['effecttsgo/global-console-in-effect']],
  ['no-effect-type-alias', []],
  ['no-effect-wrapper-alias', []],
  ['no-family-collection-read', []],
  ['no-if-statement', []],
  ['no-inline-runtime-provide', ['effecttsgo/strict-effect-provide']],
  ['no-manual-effect-channels', []],
  ['no-match-void-branch', []],
  ['no-naked-object-state-update', []],
  ['no-nested-effect-call', []],
  ['no-nested-effect-gen', ['effecttsgo/nested-effect-gen-yield']],
  ['no-return-in-arrow', []],
  ['no-return-in-callback', []],
  ['no-runtime-runfork', ['effecttsgo/run-effect-inside-effect']],
  ['no-string-sentinel-const', []],
  ['no-string-sentinel-return', []],
  ['no-ternary', []],
  ['no-wrapgraphql-catchall', ['effecttsgo/outdated-api']],
  ['prefer-effect-fn', ['effecttsgo/effect-fn-opportunity']],
  ['prefer-yield-tagged-error', ['effecttsgo/unnecessary-fail-yieldable-error']],
  ['warn-effect-sync-wrapper', []],
]);
// Retained upstream fixtures of active rules whose replay expectation changed by decision, keyed
// `<rule>/<fixture file>`. Each file stays vendored as history, and its replay case moves from the
// invalid list to the valid list. An entry must name an existing invalid fixture of an active rule.
const retiredSourceFixtureExpectations = new Map<string, string>([
  [
    'no-switch-statement/invalid-switch-atom-react.ts',
    'v3 is out of scope (Effect v4 alignment decided record): the fixture imports only the v3 @effect-atom/atom-react package, which no longer marks an Effect file.',
  ],
]);
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
  readonly replacedBy?: readonly string[];
  readonly severity: string;
  readonly sourceOwnership: string;
  readonly sourcePresets: readonly string[];
  readonly testSource: string;
  readonly testStatus: string;
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

type DeriveOmittedNonErrorRuleAllowlistFn = (options: {
  readonly baseConfig: RuleConfigFragment;
  readonly nodeRuntimeConfig: RuleConfigFragment;
  readonly pluginRulePrefix: string;
  readonly unicornConfig: RuleConfigFragment;
  readonly jsdocConfig: RuleConfigFragment;
  readonly vitestConfig: RuleConfigFragment;
}) => ReadonlySet<string>;

type ManifestCollectionsForConfiguredFragmentFn = (collection: string) => readonly string[];

interface InventoryPackageEntry {
  readonly configs: Record<string, RuleConfigFragment>;
  readonly manifestEntries: readonly ManifestEntry[];
  readonly deriveOmittedNonErrorRuleAllowlist: DeriveOmittedNonErrorRuleAllowlistFn;
  readonly manifestCollectionsForConfiguredFragment: ManifestCollectionsForConfiguredFragmentFn;
  readonly pluginName: string;
  readonly rules: Record<string, unknown>;
  readonly styleAtErrorExceptions: readonly string[];
}

const read = (path: string) => readFileSync(path, 'utf8');
const compareText = (left: string, right: string) => left.localeCompare(right);
const uniqueSorted = (values: Iterable<string>) => [...new Set(values)].toSorted(compareText);
const sorted = (values: readonly string[]) => [...values].toSorted(compareText);
const sameList = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const list = (values: readonly string[]) => (values.length === 0 ? 'none' : values.join(', '));
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
  (value['replacedBy'] === globalThis.undefined ||
    (isStringArray(value['replacedBy']) && value['replacedBy'].length > 0)) &&
  typeof value['severity'] === 'string' &&
  typeof value['sourceOwnership'] === 'string' &&
  isStringArray(value['sourcePresets']) &&
  typeof value['testSource'] === 'string' &&
  typeof value['testStatus'] === 'string';
const isReplayCase = (value: unknown): value is ReplayCase =>
  isObjectRecord(value) &&
  typeof value['name'] === 'string' &&
  (value['branchIds'] === globalThis.undefined || isStringArray(value['branchIds']));
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
  (value['rules'] === globalThis.undefined || isObjectRecord(value['rules']));
const isRuleConfigFragment = (value: unknown): value is RuleConfigFragment =>
  isObjectRecord(value) &&
  (value['rules'] === globalThis.undefined || isObjectRecord(value['rules'])) &&
  (value['overrides'] === globalThis.undefined ||
    (Array.isArray(value['overrides']) && value['overrides'].every(isRuleConfigOverride)));

// Type alias for the composeLintConfigs factory function exported from the built package.
type ComposeConfigsFn = (...configs: readonly object[]) => object;

const isComposeConfigsFn = (value: unknown): value is ComposeConfigsFn =>
  typeof value === 'function';
const isDeriveOmittedNonErrorRuleAllowlistFn = (
  value: unknown,
): value is DeriveOmittedNonErrorRuleAllowlistFn => typeof value === 'function';
const isManifestCollectionsForConfiguredFragmentFn = (
  value: unknown,
): value is ManifestCollectionsForConfiguredFragmentFn => typeof value === 'function';

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
    isRuleConfigFragment(moduleNamespace['nodeRuntimeConfig']) &&
    isRuleConfigFragment(moduleNamespace['unicornConfig']) &&
    isRuleConfigFragment(moduleNamespace['jsdocConfig']) &&
    isDeriveOmittedNonErrorRuleAllowlistFn(moduleNamespace['deriveOmittedNonErrorRuleAllowlist']) &&
    isManifestCollectionsForConfiguredFragmentFn(
      moduleNamespace['manifestCollectionsForConfiguredFragment'],
    ) &&
    isStringArray(moduleNamespace['styleAtErrorExceptions'])
  ) {
    return {
      configs: {
        baseConfig: moduleNamespace['baseConfig'],
        nodeRuntimeConfig: moduleNamespace['nodeRuntimeConfig'],
        unicornConfig: moduleNamespace['unicornConfig'],
        jsdocConfig: moduleNamespace['jsdocConfig'],
        vitestConfig: moduleNamespace['vitestConfig'],
      },
      deriveOmittedNonErrorRuleAllowlist: moduleNamespace['deriveOmittedNonErrorRuleAllowlist'],
      manifestEntries: moduleNamespace['ruleManifest'],
      manifestCollectionsForConfiguredFragment:
        moduleNamespace['manifestCollectionsForConfiguredFragment'],
      pluginName: moduleNamespace['pluginName'],
      rules: moduleNamespace['rules'],
      styleAtErrorExceptions: moduleNamespace['styleAtErrorExceptions'],
    };
  }

  return fail(
    'Built package did not export ruleManifest, configs, policy helpers, runtime rules, unicornConfig, and jsdocConfig.',
  );
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
    if (typeof ruleName === 'string') {
      const currentMembership = configMembership.get(ruleName) ?? [];
      currentMembership.push(configName);
      configMembership.set(ruleName, currentMembership);
    }
  }
}

const sourceFixtureFiles = new Map<string, SourceFixtureSet>();
if (existsSync(fixtureRoot)) {
  for (const ruleName of readdirSync(fixtureRoot)) {
    const ruleFixtureDir = join(fixtureRoot, ruleName);
    const files = readdirSync(ruleFixtureDir)
      .filter((file) => file.endsWith('.ts'))
      .toSorted(compareText);
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
const {
  configs,
  deriveOmittedNonErrorRuleAllowlist,
  manifestCollectionsForConfiguredFragment,
  manifestEntries,
  pluginName,
  rules,
  styleAtErrorExceptions,
} = readPackageEntry(packageEntry);

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
// One suite per rule: a second suite would silently rerun cases and split its branch matrix.
const replaySuiteRuleNames = replaySuites.map((replaySuite) => replaySuite.diagnostic.ruleName);
const duplicateReplaySuiteNames = uniqueSorted(
  replaySuiteRuleNames.filter((name, index) => replaySuiteRuleNames.indexOf(name) !== index),
);
if (duplicateReplaySuiteNames.length > 0) {
  fail(`Replay declares more than one suite for: ${list(duplicateReplaySuiteNames)}.`);
}
const replaySuiteByRule = new Map(
  replaySuites.map((replaySuite) => [replaySuite.diagnostic.ruleName, replaySuite]),
);

const assertSemanticReplayCaseCounts = (entry: ManifestEntry, replaySuite: ReplaySuite): void => {
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
};

const assertEffectImportReplayCoverage = (entry: ManifestEntry, replaySuite: ReplaySuite): void => {
  if (
    entry.gating === 'effect-import' &&
    !replaySuite.valid.some((fixtureCase) => fixtureCase.name.includes('non-Effect file'))
  ) {
    fail(
      `${entry.name} claims effect-import gating but lacks a non-Effect false-positive replay case.`,
    );
  }
};

const assertSemanticBranchMatrixCoverage = (
  entry: ManifestEntry,
  replaySuite: ReplaySuite,
): void => {
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
};

const assertSemanticScenarioReplayCoverage = (
  entry: ManifestEntry,
  replaySuite: ReplaySuite | undefined,
): void => {
  if (entry.parityStatus === semanticScenarioParity && replaySuite !== globalThis.undefined) {
    assertSemanticReplayCaseCounts(entry, replaySuite);
    assertEffectImportReplayCoverage(entry, replaySuite);
    assertSemanticBranchMatrixCoverage(entry, replaySuite);
  }
};

// Upstream fixtures replayed with the wrong expectation. A retired invalid fixture is expected in
// the valid list instead of the invalid one.
const sourceFixtureReplayGaps = (
  ruleName: string,
  fixtureSets: SourceFixtureSet,
  replaySuite: ReplaySuite,
): Record<'missingInvalid' | 'missingValid' | 'retiredStillInvalid', readonly string[]> => {
  const replayInvalidNames = new Set(replaySuite.invalid.map((fixtureCase) => fixtureCase.name));
  const replayValidNames = new Set(replaySuite.valid.map((fixtureCase) => fixtureCase.name));
  const caseName = (file: string): string => `linteffect:${ruleName}/${file}`;
  const isRetired = (file: string): boolean =>
    retiredSourceFixtureExpectations.has(`${ruleName}/${file}`);
  const retiredFiles = fixtureSets.invalid.filter(isRetired);
  return {
    missingInvalid: fixtureSets.invalid.filter(
      (file) => !isRetired(file) && !replayInvalidNames.has(caseName(file)),
    ),
    missingValid: [...fixtureSets.valid, ...retiredFiles].filter(
      (file) => !replayValidNames.has(caseName(file)),
    ),
    retiredStillInvalid: retiredFiles.filter((file) => replayInvalidNames.has(caseName(file))),
  };
};

const assertSourceFixtureReplayCoverage = (
  ruleName: string,
  fixtureSets: SourceFixtureSet,
  replaySuite: ReplaySuite | undefined,
): void => {
  if (replaySuite === globalThis.undefined) {
    fail(`${ruleName} has upstream source fixtures but no replay suite.`);
    return;
  }

  const { missingInvalid, missingValid, retiredStillInvalid } = sourceFixtureReplayGaps(
    ruleName,
    fixtureSets,
    replaySuite,
  );
  if (missingInvalid.length > 0 || missingValid.length > 0) {
    fail(
      `${ruleName} replay suite does not cover all upstream fixtures. Missing invalid: ${list(missingInvalid)}; missing valid: ${list(missingValid)}.`,
    );
  }
  if (retiredStillInvalid.length > 0) {
    fail(
      `${ruleName} replays retired fixtures as invalid: ${list(retiredStillInvalid)}. A retired expectation is replayed as valid.`,
    );
  }
};

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

if (!sameList(sorted(droppedLinteffectNames), sorted(explicitDrops))) {
  fail(
    `Dropped linteffect rules must exactly match the source-drop allowlist. Expected [${sorted(explicitDrops).join(', ')}], got [${sorted(droppedLinteffectNames).join(', ')}].`,
  );
}

const knownTsgoRuleIds = new Set<string>(tsgoRuleIds);
const unknownRegisterTargets = uniqueSorted(
  [...decidedDropRegister.values()].flat().filter((ruleId) => !knownTsgoRuleIds.has(ruleId)),
);
if (unknownRegisterTargets.length > 0) {
  fail(
    `Drop register names tsgo rules absent from the pinned policy: ${list(unknownRegisterTargets)}.`,
  );
}

const droppedEntries = manifestEntries.filter((entry) => entry.disposition === 'dropped');
const droppedNames = sorted(droppedEntries.map((entry) => entry.name));
const registerNames = sorted([...decidedDropRegister.keys()]);
if (!sameList(droppedNames, registerNames)) {
  fail(
    `Dropped manifest rows must exactly match the decided drop register. Missing rows: ${list(registerNames.filter((name) => !droppedNames.includes(name)))}; unregistered drops: ${list(droppedNames.filter((name) => !registerNames.includes(name)))}.`,
  );
}

const malformedDroppedEntries = droppedEntries.filter(
  (entry) =>
    entry.implementationStatus !== 'not-implemented' ||
    entry.testStatus !== 'not-applicable' ||
    entry.parityStatus !== notApplicableParity ||
    entry.collections.length > 0 ||
    entry.testSource !== 'none' ||
    entry.note.trim().length === 0,
);
if (malformedDroppedEntries.length > 0) {
  fail(
    `Dropped rows need not-implemented/not-applicable status, no collections, testSource none, and a reason: ${list(malformedDroppedEntries.map((entry) => entry.name))}.`,
  );
}

const mismatchedReplacementEdges = droppedEntries.filter(
  (entry) =>
    !sameList(sorted(entry.replacedBy ?? []), sorted(decidedDropRegister.get(entry.name) ?? [])),
);
if (mismatchedReplacementEdges.length > 0) {
  fail(
    `Dropped rows' replacedBy must match the decided drop register: ${list(mismatchedReplacementEdges.map((entry) => entry.name))}.`,
  );
}

const replacementEdgesOnActiveRows = manifestEntries.filter(
  (entry) => entry.disposition !== 'dropped' && entry.replacedBy !== globalThis.undefined,
);
if (replacementEdgesOnActiveRows.length > 0) {
  fail(
    `Only dropped rows may declare replacedBy: ${list(replacementEdgesOnActiveRows.map((entry) => entry.name))}.`,
  );
}

for (const name of sourceConfigAnomalies) {
  if (!linteffectNames.includes(name)) {
    fail(`Expected source-config anomaly ${name} to be represented.`);
  }
}

const collectionEntries = manifestEntries.filter((entry) => entry.collections.length > 0);
const collectionEntriesFor = (collection: string): readonly ManifestEntry[] =>
  manifestEntries.filter((entry) => entry.collections.includes(collection));
const omittedNonErrorRuleNames = deriveOmittedNonErrorRuleAllowlist({
  baseConfig: baseConfigEntry,
  nodeRuntimeConfig: nodeRuntimeConfigEntry,
  pluginRulePrefix,
  unicornConfig: configs['unicornConfig'] ?? fail('Built package missing unicornConfig.'),
  jsdocConfig: configs['jsdocConfig'] ?? fail('Built package missing jsdocConfig.'),
  vitestConfig: vitestConfigEntry,
});
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
  (entry) =>
    !entry.note.includes('Autofix evidence:') &&
    (!entry.note.includes('autofixable') || !entry.note.includes('vp check --fix')),
);
if (styleErrorsWithoutAutofixEvidence.length > 0) {
  fail(
    `Style-class error exceptions must document autofix evidence: ${list(styleErrorsWithoutAutofixEvidence.map((entry) => entry.name))}.`,
  );
}

for (const [collection, config] of Object.entries(configs)) {
  const manifestNamesForCollection = new Set(
    manifestCollectionsForConfiguredFragment(collection).flatMap((manifestCollection) =>
      collectionEntriesFor(manifestCollection).map((entry) => entry.name),
    ),
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
        !manifestNamesForCollection.has(ruleName) && !omittedNonErrorRuleNames.has(ruleName),
    );
  if (missingNonErrorRules.length > 0) {
    fail(
      `${collection} non-error manifest omissions must be allowlisted: ${list(missingNonErrorRules)}.`,
    );
  }
}

// Active custom rows, runtime rules, and replay suites must be the same set: a runtime rule with
// no manifest row escapes curation, and a dropped rule left in the runtime map still ships.
const implementedCustomNames = sorted(implementedCustomEntries.map((entry) => entry.name));
const runtimeNames = sorted([...runtimeRuleNames]);
const replaySuiteNames = sorted([...replaySuiteByRule.keys()]);
if (!sameList(runtimeNames, implementedCustomNames)) {
  fail(
    `Runtime plugin rules must exactly match implemented custom manifest rows. Missing from runtime: ${list(implementedCustomNames.filter((name) => !runtimeRuleNames.has(name)))}; runtime without an active row: ${list(runtimeNames.filter((name) => !implementedCustomNames.includes(name)))}.`,
  );
}

if (!sameList(replaySuiteNames, implementedCustomNames)) {
  fail(
    `Replay suites must exactly match implemented custom manifest rows. Missing replay: ${list(implementedCustomNames.filter((name) => !replaySuiteByRule.has(name)))}; replay without an active row: ${list(replaySuiteNames.filter((name) => !implementedCustomNames.includes(name)))}.`,
  );
}

for (const entry of implementedCustomEntries) {
  assertSemanticScenarioReplayCoverage(entry, replaySuiteByRule.get(entry.name));
}

for (const entry of manifestEntries) {
  const hasSourceFixture = sourceFixtureFiles.has(entry.name);
  if (entry.testSource === 'linteffect-fixture' && !hasSourceFixture) {
    fail(
      `${entry.name} declares linteffect-fixture testSource but no upstream fixture directory exists.`,
    );
  }

  // Dropped rows keep their vendored fixtures as history; only active rows owe source parity.
  if (
    hasSourceFixture &&
    entry.sourceOwnership === 'linteffect' &&
    entry.disposition !== 'dropped'
  ) {
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

const manifestEntryByName = new Map(manifestEntries.map((entry) => [entry.name, entry]));
const unknownRetiredFixtures = [...retiredSourceFixtureExpectations.keys()].filter((key) => {
  const [ruleName = '', file = ''] = key.split('/');
  const entry = manifestEntryByName.get(ruleName);
  return (
    entry === globalThis.undefined ||
    entry.disposition === 'dropped' ||
    !(sourceFixtureFiles.get(ruleName)?.invalid.includes(file) ?? false)
  );
});
if (unknownRetiredFixtures.length > 0) {
  fail(
    `Retired fixture expectations must name an invalid upstream fixture of an active rule: ${list(unknownRetiredFixtures)}.`,
  );
}
for (const [ruleName, fixtureSets] of sourceFixtureFiles.entries()) {
  const entry = manifestEntryByName.get(ruleName);
  if (entry === globalThis.undefined) {
    fail(`Upstream fixture directory ${ruleName} has no manifest row.`);
  } else if (entry.disposition !== 'dropped') {
    assertSourceFixtureReplayCoverage(ruleName, fixtureSets, replaySuiteByRule.get(ruleName));
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
