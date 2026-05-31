#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { fail, repoRoot } from '../lib/script-runtime.ts';
import { buildOxlintStandards } from '../packages/oxlint-standards/package.ts';

const distEntryPath = join(repoRoot, 'packages', 'oxlint-standards', 'dist', 'index.js');
const sourceRoot =
  process.env['LINTEFFECT_SOURCE_ROOT'] ??
  '/Users/mp/references/effect-ts/biome-effect-linting-rules';
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

interface ManifestEntry {
  readonly disposition: string;
  readonly gating: string;
  readonly implementationStatus: string;
  readonly name: string;
  readonly parityStatus: string;
  readonly presetEnabled: boolean;
  readonly sourceOwnership: string;
  readonly sourcePresets: ReadonlyArray<string>;
  readonly testSource: string;
}

interface ReplayCase {
  readonly branchIds?: ReadonlyArray<string>;
  readonly name: string;
}

interface ReplaySuite {
  readonly diagnostic: {
    readonly ruleName: string;
  };
  readonly invalid: ReadonlyArray<ReplayCase>;
  readonly requiredBranchIds: ReadonlyArray<string>;
  readonly valid: ReadonlyArray<ReplayCase>;
}

interface SourceFixtureSet {
  readonly invalid: ReadonlyArray<string>;
  readonly valid: ReadonlyArray<string>;
}

interface InventoryPackageEntry {
  readonly manifestEntries: ReadonlyArray<ManifestEntry>;
  readonly rules: Record<string, unknown>;
}

const read = (path: string) => readFileSync(path, 'utf8');
const compareText = (left: string, right: string) => left.localeCompare(right);
const uniqueSorted = (values: Iterable<string>) => [...new Set(values)].sort(compareText);
const sorted = (values: ReadonlyArray<string>) => [...values].sort(compareText);
const sameList = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const list = (values: ReadonlyArray<string>) => (values.length === 0 ? 'none' : values.join(', '));

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isManifestEntry = (value: unknown): value is ManifestEntry =>
  isObjectRecord(value) &&
  typeof value['disposition'] === 'string' &&
  typeof value['gating'] === 'string' &&
  typeof value['implementationStatus'] === 'string' &&
  typeof value['name'] === 'string' &&
  typeof value['parityStatus'] === 'string' &&
  typeof value['presetEnabled'] === 'boolean' &&
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
const isReplaySuites = (value: unknown): value is ReadonlyArray<ReplaySuite> =>
  Array.isArray(value) && value.every(isReplaySuite);
const isManifestEntries = (value: unknown): value is ReadonlyArray<ManifestEntry> =>
  Array.isArray(value) && value.every(isManifestEntry);
const readReplaySuites = (moduleNamespace: unknown): ReadonlyArray<ReplaySuite> => {
  if (isObjectRecord(moduleNamespace) && isReplaySuites(moduleNamespace['replaySuites'])) {
    return moduleNamespace['replaySuites'];
  }

  return fail('Fixture replay script did not export replaySuites as an array.');
};
const readPackageEntry = (moduleNamespace: unknown): InventoryPackageEntry => {
  if (
    isObjectRecord(moduleNamespace) &&
    isManifestEntries(moduleNamespace['ruleManifest']) &&
    isObjectRecord(moduleNamespace['rules'])
  ) {
    return { manifestEntries: moduleNamespace['ruleManifest'], rules: moduleNamespace['rules'] };
  }

  return fail('Built package did not export ruleManifest and runtime rules.');
};

const sourceRuleNames = uniqueSorted(
  readdirSync(rulesDir)
    .filter((file) => file.endsWith('.grit'))
    .map((file) => basename(file, '.grit')),
);

const configMembership = new Map<string, Array<string>>(sourceRuleNames.map((name) => [name, []]));
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
  import(pathToFileURL(join(repoRoot, 'scripts', 'checks', 'fixture-replay.ts')).href),
  import(pathToFileURL(distEntryPath).href),
]);
const replaySuites = readReplaySuites(replayModule);
const { manifestEntries, rules } = readPackageEntry(packageEntry);
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

const enabledWithoutImplementation = manifestEntries.filter(
  (entry) => entry.presetEnabled && entry.implementationStatus !== 'implemented',
);
if (enabledWithoutImplementation.length > 0) {
  fail(
    `Preset-enabled rules must be implemented: ${list(enabledWithoutImplementation.map((entry) => entry.name))}.`,
  );
}

const enabledWithoutParity = manifestEntries.filter(
  (entry) =>
    entry.presetEnabled &&
    entry.disposition !== 'built-in' &&
    ![sourceFixtureParity, semanticScenarioParity].includes(entry.parityStatus),
);
if (enabledWithoutParity.length > 0) {
  fail(
    `Preset-enabled custom rules require source or semantic parity: ${list(enabledWithoutParity.map((entry) => entry.name))}.`,
  );
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
