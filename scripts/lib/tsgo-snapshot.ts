// Pure capture, validation, and published-package cross-checks for the retained @effect/tsgo
// metadata snapshot. Callers supply file contents; nothing here reads the filesystem.

import { fail, isObjectRecord } from './script-runtime.ts';

export const tsgoCategories = ['antipattern', 'correctness', 'effect-native', 'style'] as const;
export type TsgoCategory = (typeof tsgoCategories)[number];
export const supportedTargetNames = ['oxlint', 'oxlint-tsgolint', 'typescript'] as const;
export type SupportedTargetName = (typeof supportedTargetNames)[number];

const snapshotSchemaVersion = 1;
const tsgoPackageName = '@effect/tsgo';
const tsgoRulePrefix = 'effecttsgo/';
const upstreamGroupToCategory: Readonly<Record<string, TsgoCategory>> = {
  antipattern: 'antipattern',
  correctness: 'correctness',
  effectNative: 'effect-native',
  style: 'style',
};
const supportedTargetLabels: Readonly<Record<string, SupportedTargetName>> = {
  Oxlint: 'oxlint',
  'oxlint-tsgolint': 'oxlint-tsgolint',
  TypeScript: 'typescript',
};
const kebabNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const camelNamePattern = /^[a-z][A-Za-z0-9]*$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const readmePairPattern = /docs\/rules\/([a-z0-9-]+)\.md"><code>([A-Za-z0-9]+)<\/code>/gu;
const supportedSectionPattern =
  /<!-- supported-components:start -->([\s\S]*?)<!-- supported-components:end -->/u;

export interface TsgoPreviewDiagnostic {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

export interface TsgoSnapshotRule {
  readonly category: TsgoCategory;
  readonly codes: readonly number[];
  readonly defaultSeverity: string;
  readonly description: string;
  readonly diagnosticName: string;
  readonly fixable: boolean;
  readonly preview: {
    readonly diagnostics: readonly TsgoPreviewDiagnostic[];
    readonly sourceText: string;
  };
  readonly ruleName: string;
  readonly supportedEffect: readonly string[];
}

export interface TsgoSnapshot {
  readonly license: { readonly copyright: string; readonly file: string; readonly spdx: string };
  readonly package: { readonly name: string; readonly version: string };
  readonly rules: readonly TsgoSnapshotRule[];
  readonly schemaVersion: number;
  readonly source: {
    readonly commit: string;
    readonly files: Readonly<Record<string, string>>;
    readonly repository: string;
    readonly tag: string;
  };
  readonly supportedTargets: Readonly<Record<SupportedTargetName, readonly string[]>>;
}

export interface CaptureInput {
  readonly commit: string;
  readonly docsRuleFileNames: readonly string[];
  readonly fileHashes: Readonly<Record<string, string>>;
  readonly licenseText: string;
  readonly metadataText: string;
  readonly oxlintSchemaText: string;
  readonly readmeText: string;
  readonly repository: string;
  readonly tag: string;
  readonly version: string;
}

type RuleIdentity = Pick<TsgoSnapshotRule, 'category' | 'diagnosticName' | 'ruleName'>;

const sortedUnique = (values: Iterable<string>): readonly string[] =>
  [...new Set(values)].toSorted();

export const assertUnique = (values: readonly string[], label: string): void => {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== globalThis.undefined) {
    fail(`${label} contains duplicate ${duplicate}.`);
  }
};

export const assertSameSet = (
  left: readonly string[],
  right: readonly string[],
  label: string,
): void => {
  if (sortedUnique(left).join('\n') !== sortedUnique(right).join('\n')) {
    const onlyLeft = left.filter((value) => !right.includes(value));
    const onlyRight = right.filter((value) => !left.includes(value));
    fail(
      `${label} differ. Only left: [${onlyLeft.join(', ')}]; only right: [${onlyRight.join(', ')}].`,
    );
  }
};

const stringField = (record: Record<string, unknown>, key: string, label: string): string => {
  const value = record[key];
  return typeof value === 'string' ? value : fail(`${label}.${key} must be a string.`);
};

const stringArrayField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): readonly string[] => {
  const value = record[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : fail(`${label}.${key} must be a string array.`);
};

export const objectField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> => {
  const value = record[key];
  return isObjectRecord(value) ? value : fail(`${label}.${key} must be an object.`);
};

export const parseJsonObject = (text: string, label: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(text);
  return isObjectRecord(parsed) ? parsed : fail(`${label} must be a JSON object.`);
};

export const kebabToRuleName = (kebab: string): string => `${tsgoRulePrefix}${kebab}`;

export const kebabFromRuleName = (ruleName: string): string =>
  ruleName.startsWith(tsgoRulePrefix)
    ? ruleName.slice(tsgoRulePrefix.length)
    : fail(`${ruleName} is not an ${tsgoRulePrefix} rule.`);

// The oxlint schema lists every tsgo rule as a property key; collect them without assuming a path.
const collectPrefixedKeys = (value: unknown, found: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPrefixedKeys(item, found);
    }
  } else if (isObjectRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith(tsgoRulePrefix)) {
        found.add(key);
      }
      collectPrefixedKeys(child, found);
    }
  }
};

export const oxlintSchemaRuleNames = (schemaText: string): readonly string[] => {
  const found = new Set<string>();
  collectPrefixedKeys(JSON.parse(schemaText), found);
  return sortedUnique(found);
};

// The tagged README is the only upstream file pairing both spellings: each diagnostics-table row
// links docs/rules/<kebab>.md next to <code>camelName</code>. Generic case conversion is wrong for
// names such as cryptoRandomUUID, so the pairing is always read, never derived.
export const readmeNamePairs = (readmeText: string): ReadonlyMap<string, string> => {
  const pairs = new Map<string, string>();
  for (const [, kebab = '', camel = ''] of readmeText.matchAll(readmePairPattern)) {
    if (pairs.has(camel) && pairs.get(camel) !== kebab) {
      fail(`README pairs ${camel} with both ${pairs.get(camel) ?? ''} and ${kebab}.`);
    }
    pairs.set(camel, kebab);
  }
  assertUnique([...pairs.values()], 'README kebab names');
  return pairs;
};

const requiredTarget = (
  targets: Partial<Record<SupportedTargetName, readonly string[]>>,
  name: SupportedTargetName,
): readonly string[] => targets[name] ?? fail(`README supported targets lack ${name}.`);

export const readmeSupportedTargets = (
  readmeText: string,
): Readonly<Record<SupportedTargetName, readonly string[]>> => {
  const section =
    supportedSectionPattern.exec(readmeText)?.[1] ??
    fail('README has no supported-components section.');
  const targets: Partial<Record<SupportedTargetName, readonly string[]>> = {};
  for (const [, label = '', versions = ''] of section.matchAll(/^\| ([^|]+?) \| ([^|]+) \|$/gmu)) {
    const target = supportedTargetLabels[label];
    if (target !== globalThis.undefined) {
      targets[target] = [...versions.matchAll(/`([^`]+)`/gu)].map((version) => version[1] ?? '');
    }
  }
  return {
    oxlint: requiredTarget(targets, 'oxlint'),
    'oxlint-tsgolint': requiredTarget(targets, 'oxlint-tsgolint'),
    typescript: requiredTarget(targets, 'typescript'),
  };
};

const previewDiagnostic = (diagnostic: unknown, label: string): TsgoPreviewDiagnostic => {
  if (
    !isObjectRecord(diagnostic) ||
    typeof diagnostic['start'] !== 'number' ||
    typeof diagnostic['end'] !== 'number'
  ) {
    return fail(`${label} must hold numeric start/end.`);
  }
  return {
    end: diagnostic['end'],
    start: diagnostic['start'],
    text: stringField(diagnostic, 'text', label),
  };
};

const previewField = (
  rule: Record<string, unknown>,
  label: string,
): TsgoSnapshotRule['preview'] => {
  const preview = objectField(rule, 'preview', label);
  const diagnostics = preview['diagnostics'];
  if (!Array.isArray(diagnostics)) {
    return fail(`${label}.preview.diagnostics must be an array.`);
  }
  return {
    diagnostics: diagnostics.map((diagnostic: unknown, index) =>
      previewDiagnostic(diagnostic, `${label}.preview.diagnostics[${index}]`),
    ),
    sourceText: stringField(preview, 'sourceText', `${label}.preview`),
  };
};

// Shared by capture (upstream field names) and re-parsing (snapshot field names); only the
// identity fields differ between the two shapes.
const ruleWithIdentity = (
  value: Record<string, unknown>,
  identity: RuleIdentity,
): TsgoSnapshotRule => {
  const label = `tsgo rule ${identity.diagnosticName}`;
  const { codes, fixable } = value;
  if (typeof fixable !== 'boolean' || !Array.isArray(codes) || !codes.every(Number.isInteger)) {
    return fail(`${label} must hold boolean fixable and integer codes.`);
  }
  return {
    ...identity,
    codes: codes.map(Number),
    defaultSeverity: stringField(value, 'defaultSeverity', label),
    description: stringField(value, 'description', label),
    fixable,
    preview: previewField(value, label),
    supportedEffect: stringArrayField(value, 'supportedEffect', label),
  };
};

const categoryFor = (value: string, label: string): TsgoCategory =>
  tsgoCategories.find((category) => category === value) ??
  fail(`${label} has unknown category ${value}.`);

const upstreamRule = (value: unknown, pairs: ReadonlyMap<string, string>): TsgoSnapshotRule => {
  if (!isObjectRecord(value)) {
    return fail('metadata rules[] entries must be objects.');
  }
  const diagnosticName = stringField(value, 'name', 'metadata rule');
  const label = `metadata rule ${diagnosticName}`;
  const group = stringField(value, 'group', label);
  const kebab = pairs.get(diagnosticName) ?? fail(`${label} has no README kebab pairing.`);
  return ruleWithIdentity(value, {
    category: upstreamGroupToCategory[group] ?? fail(`${label} has unknown group ${group}.`),
    diagnosticName,
    ruleName: kebabToRuleName(kebab),
  });
};

const assertSnapshotRule = (rule: TsgoSnapshotRule): void => {
  const kebab = kebabFromRuleName(rule.ruleName);
  if (!kebabNamePattern.test(kebab) || !camelNamePattern.test(rule.diagnosticName)) {
    fail(`Snapshot rule ${rule.ruleName} / ${rule.diagnosticName} has a malformed name.`);
  }
  if (rule.description.length === 0 || rule.preview.sourceText.length === 0) {
    fail(`Snapshot rule ${rule.ruleName} must keep its description and preview source.`);
  }
};

const assertSnapshotProvenance = (snapshot: TsgoSnapshot): void => {
  if (
    snapshot.schemaVersion !== snapshotSchemaVersion ||
    snapshot.package.name !== tsgoPackageName
  ) {
    fail(`Snapshot must be schemaVersion ${snapshotSchemaVersion} for ${tsgoPackageName}.`);
  }
  if (
    !commitPattern.test(snapshot.source.commit) ||
    snapshot.source.tag !== `${tsgoPackageName}@${snapshot.package.version}`
  ) {
    fail('Snapshot provenance must name the resolved commit and the version tag.');
  }
  if (snapshot.license.spdx !== 'MIT' || Object.keys(snapshot.source.files).length === 0) {
    fail('Snapshot must retain the MIT attribution and the hashes of its source files.');
  }
  const emptyTarget = supportedTargetNames.find(
    (target) => snapshot.supportedTargets[target].length === 0,
  );
  if (emptyTarget !== globalThis.undefined) {
    fail(`Snapshot supportedTargets.${emptyTarget} must not be empty.`);
  }
};

export const validateTsgoSnapshot = (snapshot: TsgoSnapshot): TsgoSnapshot => {
  assertSnapshotProvenance(snapshot);
  const ruleNames = snapshot.rules.map((rule) => rule.ruleName);
  if (ruleNames.join('\n') !== ruleNames.toSorted().join('\n')) {
    fail('Snapshot rules must be sorted by ruleName.');
  }
  assertUnique(ruleNames, 'Snapshot rule names');
  assertUnique(
    snapshot.rules.map((rule) => rule.diagnosticName),
    'Snapshot diagnostic names',
  );
  for (const rule of snapshot.rules) {
    assertSnapshotRule(rule);
  }
  return snapshot;
};

const copyrightLine = (licenseText: string): string =>
  licenseText.split('\n').find((line) => line.startsWith('Copyright')) ??
  fail('LICENSE has no copyright line.');

// Code-unit order, matching the default sort the validator compares against.
const byRuleName = (left: TsgoSnapshotRule, right: TsgoSnapshotRule): number =>
  Number(left.ruleName > right.ruleName) - Number(left.ruleName < right.ruleName);

// Asserts that the three name sets (metadata camelCase names, oxlint schema kebab names, and the
// README pairing), plus the docs/rules file names, describe the same rules.
const assertNameSetsAgree = (
  rules: readonly TsgoSnapshotRule[],
  pairs: ReadonlyMap<string, string>,
  input: CaptureInput,
): void => {
  assertSameSet(
    rules.map((rule) => rule.diagnosticName),
    [...pairs.keys()],
    'metadata names and README pairings',
  );
  assertSameSet(
    rules.map((rule) => rule.ruleName),
    oxlintSchemaRuleNames(input.oxlintSchemaText),
    'paired rule names and oxlint-schema.json rule names',
  );
  assertSameSet(
    rules.map((rule) => kebabFromRuleName(rule.ruleName)),
    input.docsRuleFileNames.map((fileName) => fileName.replace(/\.md$/u, '')),
    'paired rule names and docs/rules files',
  );
};

export const captureTsgoSnapshot = (input: CaptureInput): TsgoSnapshot => {
  const metadata = parseJsonObject(input.metadataText, 'metadata.json');
  const upstreamRules = Array.isArray(metadata['rules'])
    ? metadata['rules']
    : fail('metadata.json needs rules[].');
  const pairs = readmeNamePairs(input.readmeText);
  const rules = upstreamRules.map((rule: unknown) => upstreamRule(rule, pairs));
  // The set comparisons below and the snapshot itself would otherwise collapse a repeated
  // upstream row, identical or conflicting, into one rule without any error.
  assertUnique(
    rules.map((rule) => rule.ruleName),
    'metadata rule names',
  );
  assertUnique(
    rules.map((rule) => rule.diagnosticName),
    'metadata diagnostic names',
  );
  assertNameSetsAgree(rules, pairs, input);
  return validateTsgoSnapshot({
    license: { copyright: copyrightLine(input.licenseText), file: 'LICENSE', spdx: 'MIT' },
    package: { name: tsgoPackageName, version: input.version },
    rules: rules.toSorted(byRuleName),
    schemaVersion: snapshotSchemaVersion,
    source: {
      commit: input.commit,
      files: input.fileHashes,
      repository: input.repository,
      tag: input.tag,
    },
    supportedTargets: readmeSupportedTargets(input.readmeText),
  });
};

const snapshotRule = (value: unknown): TsgoSnapshotRule => {
  if (!isObjectRecord(value)) {
    return fail('Snapshot rules[] entries must be objects.');
  }
  return ruleWithIdentity(value, {
    category: categoryFor(stringField(value, 'category', 'snapshot rule'), 'snapshot rule'),
    diagnosticName: stringField(value, 'diagnosticName', 'snapshot rule'),
    ruleName: stringField(value, 'ruleName', 'snapshot rule'),
  });
};

const stringRecordField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): Readonly<Record<string, string>> => {
  const value = objectField(record, key, label);
  return Object.fromEntries(
    Object.keys(value).map((name) => [name, stringField(value, name, `${label}.${key}`)]),
  );
};

const parsedSource = (record: Record<string, unknown>): TsgoSnapshot['source'] => {
  const source = objectField(record, 'source', 'snapshot');
  return {
    commit: stringField(source, 'commit', 'snapshot.source'),
    files: stringRecordField(source, 'files', 'snapshot.source'),
    repository: stringField(source, 'repository', 'snapshot.source'),
    tag: stringField(source, 'tag', 'snapshot.source'),
  };
};

const parsedTargets = (record: Record<string, unknown>): TsgoSnapshot['supportedTargets'] => {
  const targets = objectField(record, 'supportedTargets', 'snapshot');
  return {
    oxlint: stringArrayField(targets, 'oxlint', 'snapshot.supportedTargets'),
    'oxlint-tsgolint': stringArrayField(targets, 'oxlint-tsgolint', 'snapshot.supportedTargets'),
    typescript: stringArrayField(targets, 'typescript', 'snapshot.supportedTargets'),
  };
};

// JSON.parse output carries no type guarantees; this re-runs every structural check on the
// committed snapshot so a hand edit cannot bypass the capture-time assertions.
export const parseTsgoSnapshot = (text: string): TsgoSnapshot => {
  const record = parseJsonObject(text, 'tsgo metadata snapshot');
  const rules = Array.isArray(record['rules']) ? record['rules'] : fail('Snapshot needs rules[].');
  const license = objectField(record, 'license', 'snapshot');
  const packageRecord = objectField(record, 'package', 'snapshot');
  const { schemaVersion } = record;
  return validateTsgoSnapshot({
    license: {
      copyright: stringField(license, 'copyright', 'snapshot.license'),
      file: stringField(license, 'file', 'snapshot.license'),
      spdx: stringField(license, 'spdx', 'snapshot.license'),
    },
    package: {
      name: stringField(packageRecord, 'name', 'snapshot.package'),
      version: stringField(packageRecord, 'version', 'snapshot.package'),
    },
    rules: rules.map(snapshotRule),
    schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : Number.NaN,
    source: parsedSource(record),
    supportedTargets: parsedTargets(record),
  });
};
