// Pure grading, route projection, and serialization for the delegated @effect/tsgo policy.
// Callers supply the parsed snapshot and policy; nothing here reads the filesystem or imports tsgo.

import { fail } from './script-runtime.ts';
import { literal } from './stable-json.ts';
import {
  assertSameSet,
  assertUnique,
  kebabFromRuleName,
  kebabToRuleName,
  objectField,
  oxlintSchemaRuleNames,
  parseJsonObject,
  tsgoCategories,
  type TsgoCategory,
  type TsgoSnapshot,
  type TsgoSnapshotRule,
} from './tsgo-snapshot.ts';

export type TsgoSeverity = 'error' | 'off' | 'warn';
export type TsgoRationaleClass = 'agent-failure-mode' | 'correctness' | 'safety' | 'style';

const effectPluginName = '@effect/language-service';
const tscSeveritySpelling: Readonly<Record<TsgoSeverity, string>> = {
  error: 'error',
  off: 'off',
  warn: 'warning',
};

export interface TsgoGrade {
  readonly rationaleClass: TsgoRationaleClass;
  readonly reason: string;
  readonly severity: TsgoSeverity;
}

export interface TsgoException extends TsgoGrade {
  readonly category: TsgoCategory;
}

export interface TsgoConditionalRule extends TsgoException {
  readonly measurementSeverity: TsgoSeverity;
}

export interface TsgoPluginOptions {
  readonly barrelImportPackages: readonly string[];
  readonly effectFn: readonly string[];
  readonly namespaceImportPackages: readonly string[];
  readonly pipeableMinArgCount: number;
}

export interface TsgoPolicy {
  readonly boundaryRules: readonly string[];
  readonly categoryDefaults: Readonly<Record<TsgoCategory, TsgoGrade>>;
  readonly commonPluginOptions: TsgoPluginOptions;
  readonly conditional: Readonly<Record<string, TsgoConditionalRule>>;
  readonly exceptions: Readonly<Record<string, TsgoException>>;
  readonly expectedCategoryCounts: Readonly<Record<TsgoCategory, number>>;
  readonly oxlintRouteDiagnostics: boolean;
  readonly pinnedVersion: string;
  readonly testFileOverrides: Readonly<Record<string, TsgoSeverity>>;
  readonly testFilePatterns: readonly string[];
}

export interface GradedTsgoRule extends TsgoGrade {
  readonly category: TsgoCategory;
  readonly diagnosticName: string;
  readonly ruleName: string;
}

const assertKnownRules = (
  names: readonly string[],
  byKebab: ReadonlyMap<string, TsgoSnapshotRule>,
  label: string,
): void => {
  const unknown = names.filter((name) => !byKebab.has(name));
  if (unknown.length > 0) {
    fail(`${label} names rules absent from the pinned snapshot: ${unknown.join(', ')}.`);
  }
};

// The recorded category catches an upstream re-categorization that would otherwise leave a
// stale exception silently governing a rule whose meaning moved.
const assertExceptionCategories = (
  exceptions: Readonly<Record<string, TsgoException>>,
  byKebab: ReadonlyMap<string, TsgoSnapshotRule>,
  label: string,
): void => {
  assertKnownRules(Object.keys(exceptions), byKebab, label);
  for (const [name, exception] of Object.entries(exceptions)) {
    const actual = byKebab.get(name)?.category;
    if (actual !== exception.category) {
      fail(
        `${label} ${name} is recorded as ${exception.category}; the pinned category is ${String(actual)}.`,
      );
    }
  }
};

const assertCategoryCounts = (snapshot: TsgoSnapshot, policy: TsgoPolicy): void => {
  for (const category of tsgoCategories) {
    const count = snapshot.rules.filter((rule) => rule.category === category).length;
    if (count !== policy.expectedCategoryCounts[category]) {
      fail(
        `Pinned ${category} has ${count} rules; the policy expects ${policy.expectedCategoryCounts[category]}.`,
      );
    }
  }
};

const assertPolicyKeysMatchSnapshot = (snapshot: TsgoSnapshot, policy: TsgoPolicy): void => {
  const byKebab = new Map(snapshot.rules.map((rule) => [kebabFromRuleName(rule.ruleName), rule]));
  assertExceptionCategories(policy.exceptions, byKebab, 'Policy exception');
  assertExceptionCategories(policy.conditional, byKebab, 'Conditional rule');
  const overlap = Object.keys(policy.exceptions).filter((name) => name in policy.conditional);
  if (overlap.length > 0) {
    fail(`Rules cannot be both exceptions and conditional: ${overlap.join(', ')}.`);
  }
  assertKnownRules(policy.boundaryRules, byKebab, 'Boundary rule list');
  assertKnownRules(Object.keys(policy.testFileOverrides), byKebab, 'Test-file override');
  assertUnique(policy.boundaryRules, 'Boundary rule list');
  assertUnique(policy.testFilePatterns, 'Test-file patterns');
};

// Every validation runs before any row is produced, so a stale or misspelled policy key fails
// instead of silently leaving a rule on its category default. Every rule gets an explicit
// severity, including off, so category activation cannot revive a deliberately disabled rule.
export const gradeTsgoRules = (
  snapshot: TsgoSnapshot,
  policy: TsgoPolicy,
): readonly GradedTsgoRule[] => {
  if (snapshot.package.version !== policy.pinnedVersion) {
    fail(
      `Policy is graded for ${policy.pinnedVersion}; the snapshot is ${snapshot.package.version}.`,
    );
  }
  assertCategoryCounts(snapshot, policy);
  assertPolicyKeysMatchSnapshot(snapshot, policy);
  return snapshot.rules.map((rule) => {
    const kebab = kebabFromRuleName(rule.ruleName);
    const grade =
      policy.exceptions[kebab] ??
      policy.conditional[kebab] ??
      policy.categoryDefaults[rule.category];
    return {
      category: rule.category,
      diagnosticName: rule.diagnosticName,
      rationaleClass: grade.rationaleClass,
      reason: grade.reason,
      ruleName: rule.ruleName,
      severity: grade.severity,
    };
  });
};

const pluginEntry = (
  policy: TsgoPolicy,
  routeOptions: Record<string, unknown>,
): Record<string, unknown> => ({
  ...policy.commonPluginOptions,
  name: effectPluginName,
  ...routeOptions,
});

// Options-only overlay for the default oxlint route. It carries no severity map, so the oxlint
// fragment stays the only severity owner on that route.
export const oxlintRouteTsconfig = (policy: TsgoPolicy): Record<string, unknown> => ({
  compilerOptions: {
    plugins: [pluginEntry(policy, { diagnostics: policy.oxlintRouteDiagnostics })],
  },
});

const diagnosticSeverities = (
  entries: ReadonlyArray<readonly [string, TsgoSeverity]>,
): Readonly<Record<string, string>> =>
  Object.fromEntries(entries.map(([name, severity]) => [name, tscSeveritySpelling[severity]]));

const diagnosticNameFor = (rows: readonly GradedTsgoRule[], kebab: string): string =>
  rows.find((row) => row.ruleName === kebabToRuleName(kebab))?.diagnosticName ??
  fail(`No graded row for ${kebab}.`);

// Options-only overlay for the TypeScript 7 fallback route, which owns every severity itself and
// fails typecheck on both errors and warnings. It carries no test-file override: tsgo rebases an
// extended config's override globs onto that config's own folder (inside node_modules), so the
// override has to live in the consumer's tsconfig; `tscTestOverrideEntry` is that entry.
export const tscRouteTsconfig = (
  rows: readonly GradedTsgoRule[],
  policy: TsgoPolicy,
): Record<string, unknown> => ({
  compilerOptions: {
    plugins: [
      pluginEntry(policy, {
        diagnosticSeverity: diagnosticSeverities(
          rows.map((row) => [row.diagnosticName, row.severity]),
        ),
        diagnostics: true,
        ignoreEffectErrorsInTscExitCode: false,
        ignoreEffectWarningsInTscExitCode: false,
      }),
    ],
  },
});

// The plugin entry a tsc-route consumer adds to its own tsconfig. tsgo merges it key by key with
// the extended overlay, so it needs only the test-file override. The tsconfig package README
// documents exactly this entry, and a test holds the two equal.
export const tscTestOverrideEntry = (
  rows: readonly GradedTsgoRule[],
  policy: TsgoPolicy,
): Record<string, unknown> => ({
  name: effectPluginName,
  overrides: [
    {
      include: policy.testFilePatterns,
      options: {
        diagnosticSeverity: diagnosticSeverities(
          Object.entries(policy.testFileOverrides).map(([kebab, severity]) => [
            diagnosticNameFor(rows, kebab),
            severity,
          ]),
        ),
      },
    },
  ],
});

const qualifiedOverrides = (policy: TsgoPolicy): Readonly<Record<string, TsgoSeverity>> =>
  Object.fromEntries(
    Object.entries(policy.testFileOverrides).map(([kebab, severity]) => [
      kebabToRuleName(kebab),
      severity,
    ]),
  );

const moduleHeader = [
  '/* oxlint-disable max-lines -- Generated data table: one row per pinned @effect/tsgo rule. */',
  '// Generated by `pnpm gen:effect-policy` from scripts/config/tsgo-policy.ts and the pinned',
  '// @effect/tsgo metadata snapshot. Do not edit by hand; `pnpm effect-policy:check` rejects drift.',
  '',
];

const moduleTypes = [
  `export type TsgoRuleCategory = ${tsgoCategories.map(literal).join(' | ')};`,
  "export type TsgoRuleSeverity = 'error' | 'off' | 'warn';",
  "export type TsgoRationaleClass = 'agent-failure-mode' | 'correctness' | 'safety' | 'style';",
  '',
];

const rowInterface = [
  'export interface TsgoPolicyRow {',
  '  readonly category: TsgoRuleCategory;',
  '  readonly diagnosticName: TsgoDiagnosticName;',
  '  readonly rationaleClass: TsgoRationaleClass;',
  '  readonly reason: string;',
  '  readonly ruleName: TsgoRuleId;',
  '  readonly severity: TsgoRuleSeverity;',
  '}',
  '',
];

// The lint package module is data only and imports nothing, so it cannot pull tsgo, script code,
// or the tsconfig package into the published runtime.
export const lintPolicyModule = (
  rows: readonly GradedTsgoRule[],
  policy: TsgoPolicy,
  version: string,
): string =>
  [
    ...moduleHeader,
    `export const tsgoPolicyVersion = ${literal(version)};`,
    '',
    ...moduleTypes,
    `export const tsgoRuleIds = ${literal(rows.map((row) => row.ruleName))} as const;`,
    'export type TsgoRuleId = (typeof tsgoRuleIds)[number];',
    '',
    `export const tsgoDiagnosticNames = ${literal(rows.map((row) => row.diagnosticName))} as const;`,
    'export type TsgoDiagnosticName = (typeof tsgoDiagnosticNames)[number];',
    '',
    ...rowInterface,
    `export const tsgoPolicyRows: readonly TsgoPolicyRow[] = ${literal(rows)};`,
    '',
    `export const tsgoTestFilePatterns: readonly string[] = ${literal(policy.testFilePatterns)};`,
    '',
    `export const tsgoTestFileRuleOverrides: Readonly<Partial<Record<TsgoRuleId, TsgoRuleSeverity>>> = ${literal(qualifiedOverrides(policy))};`,
    '',
    `export const tsgoBoundaryRuleIds: readonly TsgoRuleId[] = ${literal(policy.boundaryRules.map(kebabToRuleName).toSorted())};`,
    '',
  ].join('\n');

export interface PublishedPackageInput {
  readonly categoryPresets: Readonly<Record<TsgoCategory, string>>;
  readonly diagnosticSchemaText: string;
  readonly oxlintSchemaText: string;
  readonly packageJsonText: string;
}

const presetRuleNames = (presetText: string, label: string): readonly string[] =>
  Object.keys(objectField(parseJsonObject(presetText, label), 'rules', label));

const diagnosticSchemaNames = (schemaText: string): readonly string[] => {
  const definitions = objectField(
    parseJsonObject(schemaText, 'schema.json'),
    'definitions',
    'schema.json',
  );
  const severity = objectField(
    definitions,
    'effectLanguageServicePluginDiagnosticSeverityDefinition',
    'schema.json definitions',
  );
  return Object.keys(objectField(severity, 'properties', 'schema.json diagnostic severity'));
};

// Cross-checks the snapshot against the published package: the category preset JSON, the oxlint
// schema, and the tsconfig diagnostic option schema all ship in the npm tarball.
export const assertPublishedPackageMatches = (
  snapshot: TsgoSnapshot,
  published: PublishedPackageInput,
): void => {
  const { version } = parseJsonObject(published.packageJsonText, '@effect/tsgo package.json');
  if (version !== snapshot.package.version) {
    fail(
      `Installed @effect/tsgo is ${String(version)}; the snapshot is ${snapshot.package.version}.`,
    );
  }
  for (const category of tsgoCategories) {
    assertSameSet(
      snapshot.rules.filter((rule) => rule.category === category).map((rule) => rule.ruleName),
      presetRuleNames(published.categoryPresets[category], `${category}.json`),
      `Snapshot ${category} rules and the published ${category} preset`,
    );
  }
  assertSameSet(
    snapshot.rules.map((rule) => rule.ruleName),
    oxlintSchemaRuleNames(published.oxlintSchemaText),
    'Snapshot rules and the published oxlint-schema.json',
  );
  assertSameSet(
    snapshot.rules.map((rule) => rule.diagnosticName),
    diagnosticSchemaNames(published.diagnosticSchemaText),
    'Snapshot diagnostics and the published schema.json severity map',
  );
};
