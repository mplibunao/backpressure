/* oxlint-disable max-lines -- The manifest is intentionally data-dense because it is the canonical machine-checkable catalog. */

export type RuleDomain =
  | 'effect'
  | 'effect-react'
  | 'general'
  | 'boundaries'
  | 'lsp'
  | 'base'
  | 'test'
  | 'runtime';
export type RuleCollection =
  | 'generalPreset'
  | 'effectPreset'
  | 'effectReactPreset'
  | 'boundariesPreset'
  | 'baseConfig'
  | 'vitestConfig'
  | 'nodeRuntimeConfig';
export type RuleRationaleClass = 'correctness' | 'safety' | 'agent-failure-mode' | 'style';
export type RuleManifestSeverity = 'off' | 'info' | 'warning' | 'error';
export type RuleConfigSeverity = 'off' | 'warn' | 'error';
export type RuleDisposition =
  | 'ported'
  | 'reimplemented'
  | 'built-in'
  | 'LSP-delegated'
  | 'dropped'
  | 'not-implemented';
export type RuleSourceOwnership =
  | 'linteffect'
  | 'executor'
  | 'recon:effect-smol'
  | 'recon:t3code'
  | 'recon'
  | 'built-in'
  | 'oxlint-native'
  | 'LSP';
export type RuleTestSource = 'linteffect-fixture' | 't3code' | 'scenario-only' | 'none';
export type RuleParityStatus =
  | 'source-fixture-replay'
  | 'semantic-scenario-replay'
  | 'delegated'
  | 'not-applicable';
export type RuleGating =
  | 'effect-import'
  | 'effect-callee'
  | 'effect-react-import'
  | 'ungated-broad'
  | 'stack-neutral'
  | 'test-file'
  | 'runtime'
  | 'boundary';

export interface RuleManifestEntry {
  readonly name: string;
  readonly domain: RuleDomain;
  readonly sourcePresets: ReadonlyArray<string>;
  readonly severity: RuleManifestSeverity;
  readonly rationaleClass: RuleRationaleClass;
  readonly implementationStatus: 'implemented' | 'not-implemented' | 'delegated';
  readonly testStatus: 'covered' | 'not-applicable';
  readonly parityStatus: RuleParityStatus;
  readonly disposition: RuleDisposition;
  readonly effectVersionSensitivity: string;
  readonly sourceOwnership: RuleSourceOwnership;
  readonly testSource: RuleTestSource;
  readonly gating: RuleGating;
  readonly collections: ReadonlyArray<RuleCollection>;
  readonly note: string;
}

type RuleManifestEntryInput = Omit<RuleManifestEntry, 'rationaleClass'> & {
  readonly rationaleClass?: RuleRationaleClass;
};

const presetCollectionByDomain: Partial<Record<RuleDomain, RuleCollection>> = {
  boundaries: 'boundariesPreset',
  effect: 'effectPreset',
  'effect-react': 'effectReactPreset',
  general: 'generalPreset',
};

const defaultCollectionsForDomain = (domain: RuleDomain): ReadonlyArray<RuleCollection> => {
  const presetCollection = presetCollectionByDomain[domain];
  if (typeof presetCollection === 'undefined') {
    return [];
  }

  return domain === 'general' ? [presetCollection, 'baseConfig'] : [presetCollection];
};

const inferRationaleClass = (entry: RuleManifestEntryInput): RuleRationaleClass => {
  if (entry.disposition === 'LSP-delegated') {
    return 'correctness';
  }

  if (entry.gating === 'boundary') {
    return 'safety';
  }

  if (['info', 'warning'].includes(entry.severity)) {
    return 'agent-failure-mode';
  }

  if (entry.severity === 'off') {
    return 'style';
  }

  if (entry.gating === 'ungated-broad' || entry.name.includes('ladder')) {
    return 'agent-failure-mode';
  }

  return 'correctness';
};

const sourceRule = (entry: RuleManifestEntryInput): RuleManifestEntry => {
  if (entry.collections.length > 0 && typeof entry.rationaleClass === 'undefined') {
    throw new Error(`Collection-backed rule ${entry.name} requires an explicit rationaleClass.`);
  }

  return {
    ...entry,
    rationaleClass: entry.rationaleClass ?? inferRationaleClass(entry),
  };
};

const lspDelegatedCheck = (name: string): RuleManifestEntry =>
  sourceRule({
    name: `lsp/${name}`,
    domain: 'lsp',
    sourcePresets: [],
    severity: 'error',
    implementationStatus: 'delegated',
    testStatus: 'not-applicable',
    parityStatus: 'delegated',
    disposition: 'LSP-delegated',
    effectVersionSensitivity: 'type-aware semantic',
    sourceOwnership: 'LSP',
    testSource: 'none',
    gating: 'effect-import',
    collections: [],
    note: '@effect/language-service owns this semantic/type-aware diagnostic.',
  });

const lspDelegatedChecks = (names: ReadonlyArray<string>): ReadonlyArray<RuleManifestEntry> =>
  names.map(lspDelegatedCheck);

// --- Authoring helpers ---
// Use these for new entries instead of sourceRule to avoid repeating boilerplate defaults.
// Existing entries use the older sourceRule helper and are not converted here.
// Partial conversion is intentional — converting all entries in bulk would make the diff unreviewable
// With no behavior difference between the two forms.

interface PortedScenarioRuleOptions {
  readonly name: string;
  readonly domain: RuleDomain;
  readonly sourcePresets: ReadonlyArray<string>;
  readonly severity: RuleManifestSeverity;
  readonly rationaleClass: RuleRationaleClass;
  readonly gating: RuleGating;
  readonly collections: ReadonlyArray<RuleCollection>;
  readonly note: string;
}

/**
 * Ported linteffect rule with semantic-scenario-replay coverage.
 * Hardcodes: ported / implemented / covered / semantic-scenario-replay / v4-primary structural / linteffect / testSource:none.
 */
export const portedScenarioRule = ({
  name,
  domain,
  sourcePresets,
  severity,
  rationaleClass,
  gating,
  collections,
  note,
}: PortedScenarioRuleOptions): RuleManifestEntry =>
  sourceRule({
    name,
    domain,
    sourcePresets,
    severity,
    rationaleClass,
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating,
    collections,
    note,
  });

interface PortedFixtureRuleOptions {
  readonly name: string;
  readonly domain: RuleDomain;
  readonly sourcePresets: ReadonlyArray<string>;
  readonly rationaleClass: RuleRationaleClass;
  readonly gating: RuleGating;
  readonly collections: ReadonlyArray<RuleCollection>;
  readonly note: string;
}

/**
 * Ported linteffect rule tested via upstream source fixtures.
 * Hardcodes: ported / error / implemented / covered / source-fixture-replay / v4-primary structural / linteffect / linteffect-fixture.
 */
export const portedFixtureRule = ({
  name,
  domain,
  sourcePresets,
  rationaleClass,
  gating,
  collections,
  note,
}: PortedFixtureRuleOptions): RuleManifestEntry =>
  sourceRule({
    name,
    domain,
    sourcePresets,
    severity: 'error',
    rationaleClass,
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'source-fixture-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'linteffect-fixture',
    gating,
    collections,
    note,
  });

interface ReimplementedScenarioRuleOptions {
  readonly name: string;
  readonly domain: RuleDomain;
  readonly severity: RuleManifestSeverity;
  readonly rationaleClass: RuleRationaleClass;
  readonly effectVersionSensitivity: string;
  readonly sourceOwnership: RuleSourceOwnership;
  readonly testSource: RuleTestSource;
  readonly gating: RuleGating;
  readonly collections: ReadonlyArray<RuleCollection>;
  readonly note: string;
}

/**
 * Net-new or executor/recon reimplemented rule (no linteffect source).
 * Hardcodes: reimplemented / sourcePresets:[] / implemented / covered / semantic-scenario-replay.
 */
export const reimplementedScenarioRule = ({
  name,
  domain,
  severity,
  rationaleClass,
  effectVersionSensitivity,
  sourceOwnership,
  testSource,
  gating,
  collections,
  note,
}: ReimplementedScenarioRuleOptions): RuleManifestEntry =>
  sourceRule({
    name,
    domain,
    sourcePresets: [],
    severity,
    rationaleClass,
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity,
    sourceOwnership,
    testSource,
    gating,
    collections,
    note,
  });

interface BuiltInRuleOptions {
  readonly name: string;
  readonly domain: RuleDomain;
  readonly severity: RuleManifestSeverity;
  readonly rationaleClass: RuleRationaleClass;
  readonly gating: RuleGating;
  readonly collections: ReadonlyArray<RuleCollection>;
  readonly note: string;
}

/**
 * Built-in oxlint rule included in a preset with no custom implementation.
 * Hardcodes: built-in / sourcePresets:[] / implemented / not-applicable / not-applicable / structural / built-in / none.
 */
export const builtInRule = ({
  name,
  domain,
  severity,
  rationaleClass,
  gating,
  collections,
  note,
}: BuiltInRuleOptions): RuleManifestEntry =>
  sourceRule({
    name,
    domain,
    sourcePresets: [],
    severity,
    rationaleClass,
    implementationStatus: 'implemented',
    testStatus: 'not-applicable',
    parityStatus: 'not-applicable',
    disposition: 'built-in',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'built-in',
    testSource: 'none',
    gating,
    collections,
    note,
  });

interface NativeRuleOptions {
  readonly name: string;
  readonly domain: RuleDomain;
  readonly severity: RuleManifestSeverity;
  readonly rationaleClass: RuleRationaleClass;
  readonly collections: ReadonlyArray<RuleCollection>;
  readonly gating: RuleGating;
  readonly note: string;
}

/**
 * Native oxlint/plugin rule explicitly decided by an exported config fragment.
 * Category-swept native rules are intentionally not represented here; WI-6 owns the generated effective-config view.
 */
export const nativeRule = ({
  name,
  domain,
  severity,
  rationaleClass,
  collections,
  gating,
  note,
}: NativeRuleOptions): RuleManifestEntry =>
  sourceRule({
    name,
    domain,
    sourcePresets: [],
    severity,
    rationaleClass,
    implementationStatus: 'implemented',
    testStatus: 'not-applicable',
    parityStatus: 'not-applicable',
    disposition: 'built-in',
    effectVersionSensitivity: 'native oxlint/plugin rule',
    sourceOwnership: 'oxlint-native',
    testSource: 'none',
    gating,
    collections,
    note,
  });

const baseConfigCollections = ['baseConfig'] as const;
const vitestConfigCollections = ['vitestConfig'] as const;
const nodeRuntimeConfigCollections = ['nodeRuntimeConfig'] as const;

const baseRule = (options: Omit<NativeRuleOptions, 'collections' | 'domain'>): RuleManifestEntry =>
  nativeRule({ ...options, collections: baseConfigCollections, domain: 'base' });
const vitestRule = (
  options: Omit<NativeRuleOptions, 'collections' | 'domain'>,
): RuleManifestEntry =>
  nativeRule({ ...options, collections: vitestConfigCollections, domain: 'test' });
const nodeRuntimeRule = (
  options: Omit<NativeRuleOptions, 'collections' | 'domain'>,
): RuleManifestEntry =>
  nativeRule({ ...options, collections: nodeRuntimeConfigCollections, domain: 'runtime' });

export const ruleManifest = [
  sourceRule({
    name: 'no-arrow-ladder',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-atom-registry-effect-sync',
    domain: 'effect-react',
    sourcePresets: ['web', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect-react'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-branch-in-object',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-call-tower',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: [],
    note: 'Implemented and replay-covered, but omitted from presets because no-effect-call-in-effect-arg owns the overlapping shallow nested-call intent.',
  }),
  sourceRule({
    name: 'no-effect-all-step-sequencing',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-as',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester and replay coverage.',
  }),
  sourceRule({
    name: 'no-effect-async',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-bind',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-call-in-effect-arg',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-do',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-fn-generator',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    implementationStatus: 'not-implemented',
    testStatus: 'not-applicable',
    parityStatus: 'not-applicable',
    disposition: 'dropped',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: [],
    note: 'Effect.fn generator bodies are preferred traced units of logic.',
  }),
  sourceRule({
    name: 'no-effect-ladder',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-never',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-orElse-ladder',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-side-effect-wrapper',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester and replay coverage.',
  }),
  sourceRule({
    name: 'no-effect-succeed-variable',
    domain: 'effect',
    sourcePresets: [],
    severity: 'warning',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-sync-console',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-type-alias',
    domain: 'effect',
    sourcePresets: ['ts-type', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-effect-wrapper-alias',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment. Ownership split: direct Effect.gen wrapper declarations (const arrow or function declaration returning Effect.gen) are intentionally excluded and owned by prefer-effect-fn; pipe(Effect.gen(...), ...) aliases remain owned by this rule.',
  }),
  sourceRule({
    name: 'no-family-collection-read',
    domain: 'effect-react',
    sourcePresets: ['web', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'source-fixture-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'linteffect-fixture',
    gating: 'effect-react-import',
    collections: defaultCollectionsForDomain('effect-react'),
    note: 'Source-fixture-faithful structural port with RuleTester and replay coverage.',
  }),
  sourceRule({
    name: 'no-flatmap-ladder',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'warning',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-fromnullable-nullish-coalesce',
    domain: 'effect',
    sourcePresets: ['ts-type', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-if-statement',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    implementationStatus: 'not-implemented',
    testStatus: 'not-applicable',
    parityStatus: 'not-applicable',
    disposition: 'dropped',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: [],
    note: 'Conflicts with gen-first posture; guards inside generators are allowed.',
  }),
  sourceRule({
    name: 'no-iife-wrapper',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-inline-runtime-provide',
    domain: 'effect-react',
    sourcePresets: ['web'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect-react'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-manual-effect-channels',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-match-effect-branch',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-match-void-branch',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-model-overlay-cast',
    domain: 'effect',
    sourcePresets: ['ts-type', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'source-fixture-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'linteffect-fixture',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Source-fixture-faithful structural port with RuleTester and replay coverage.',
  }),
  sourceRule({
    name: 'no-naked-object-state-update',
    domain: 'effect-react',
    sourcePresets: ['web', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'source-fixture-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'linteffect-fixture',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect-react'),
    note: 'Source-fixture-backed structural port. JSON.parse ownership is intentionally delegated to no-json-parse in composed presets so object-state update diagnostics stay focused on stringify/object-rebuild shapes.',
  }),
  sourceRule({
    name: 'no-nested-effect-call',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: [],
    note: 'Implemented and replay-covered, but omitted from presets because no-effect-ladder owns the overlapping deep nested-call intent.',
  }),
  sourceRule({
    name: 'no-nested-effect-gen',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-option-as',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-option-boolean-normalization',
    domain: 'effect',
    sourcePresets: ['ts-type', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-pipe-ladder',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-react-state',
    domain: 'effect-react',
    sourcePresets: ['web', 'full'],
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'ungated-broad',
    collections: defaultCollectionsForDomain('effect-react'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-render-side-effects',
    domain: 'effect-react',
    sourcePresets: ['web', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect-react'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-return-in-arrow',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'info',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester and replay coverage.',
  }),
  sourceRule({
    name: 'no-return-in-callback',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'info',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-return-null',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-runtime-runfork',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-string-sentinel-const',
    domain: 'effect',
    sourcePresets: ['ts-type', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-string-sentinel-return',
    domain: 'effect',
    sourcePresets: ['ts-type', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-switch-statement',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'source-fixture-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'linteffect-fixture',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Source-fixture-faithful structural port with RuleTester and replay coverage.',
  }),
  sourceRule({
    name: 'no-ternary',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    implementationStatus: 'not-implemented',
    testStatus: 'not-applicable',
    parityStatus: 'not-applicable',
    disposition: 'dropped',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: [],
    note: 'Blanket ternary ban is too broad; general enables built-in no-nested-ternary instead.',
  }),
  sourceRule({
    name: 'no-try-catch',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'no-unknown-boolean-coercion-helper',
    domain: 'effect',
    sourcePresets: ['ts-type', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester and replay coverage.',
  }),
  sourceRule({
    name: 'no-wrapgraphql-catchall',
    domain: 'effect',
    sourcePresets: ['full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'prevent-dynamic-imports',
    domain: 'general',
    sourcePresets: ['core', 'full'],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'stack-neutral',
    collections: defaultCollectionsForDomain('general'),
    note: 'Scenario-covered structural port with RuleTester and replay coverage.',
  }),
  sourceRule({
    name: 'warn-effect-sync-wrapper',
    domain: 'effect',
    sourcePresets: ['core', 'full'],
    severity: 'warning',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'ported',
    effectVersionSensitivity: 'v4-primary structural',
    sourceOwnership: 'linteffect',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural port with RuleTester coverage and preset assignment.',
  }),
  sourceRule({
    name: 'effect-no-multiple-provide',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'recon',
    testSource: 'none',
    gating: 'effect-callee',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Net-new D3 rule; counts direct pipe provide steps with Effect namespace binding.',
  }),
  sourceRule({
    name: 'prefer-effect-predicate',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Executor-derived structural nullish predicate rule.',
  }),
  sourceRule({
    name: 'prefer-effect-fn',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'v4-primary Effect.gen wrapper shape',
    sourceOwnership: 'recon',
    testSource: 'scenario-only',
    gating: 'effect-callee',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Recon-derived gen-first rule: redundant wrappers around Effect.gen should become Effect.fn/fnUntraced.',
  }),
  sourceRule({
    name: 'no-barrel-import',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'recon:effect-smol',
    testSource: 'scenario-only',
    gating: 'ungated-broad',
    collections: defaultCollectionsForDomain('effect'),
    note: 'effect-smol scenario port: named and namespace value imports from effect only.',
  }),
  sourceRule({
    name: 'no-inline-schema-compile',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'recon:t3code',
    testSource: 't3code',
    gating: 'effect-callee',
    collections: defaultCollectionsForDomain('effect'),
    note: 't3code scenario port for inline Schema compiler calls inside function bodies.',
  }),
  sourceRule({
    name: 'no-cross-package-relative-imports',
    domain: 'boundaries',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'safety',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'boundary',
    collections: defaultCollectionsForDomain('boundaries'),
    note: 'Executor-derived cross-package relative import rule.',
  }),
  sourceRule({
    name: 'no-redundant-primitive-cast',
    domain: 'general',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'stack-neutral',
    collections: defaultCollectionsForDomain('general'),
    note: 'Executor-derived primitive as-cast rule.',
  }),
  sourceRule({
    name: 'no-effect-escape-hatch',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-callee',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Executor-derived Effect die/orDie escape-hatch rule.',
  }),
  sourceRule({
    name: 'no-double-cast',
    domain: 'general',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'stack-neutral',
    collections: defaultCollectionsForDomain('general'),
    note: 'Executor-derived double cast rule.',
  }),
  sourceRule({
    name: 'no-ts-nocheck',
    domain: 'general',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'stack-neutral',
    collections: defaultCollectionsForDomain('general'),
    note: 'Executor-derived ts-nocheck rule.',
  }),
  builtInRule({
    name: 'no-nested-ternary',
    domain: 'general',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    collections: defaultCollectionsForDomain('general'),
    note: 'Built-in oxlint rule enabled instead of linteffect no-ternary.',
  }),
  sourceRule({
    name: 'no-json-parse',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'prefer-schema-inferred-types',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'no-promise-catch',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'no-promise-reject',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'no-instanceof-error',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'no-instanceof-tagged-error',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'no-manual-tag-check',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'no-effect-internal-tags',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'no-unknown-error-message',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'prefer-yield-tagged-error',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),
  sourceRule({
    name: 'no-redundant-error-factory',
    domain: 'effect',
    sourcePresets: [],
    severity: 'error',
    rationaleClass: 'correctness',
    implementationStatus: 'implemented',
    testStatus: 'covered',
    parityStatus: 'semantic-scenario-replay',
    disposition: 'reimplemented',
    effectVersionSensitivity: 'structural',
    sourceOwnership: 'executor',
    testSource: 'none',
    gating: 'effect-import',
    collections: defaultCollectionsForDomain('effect'),
    note: 'Scenario-covered structural reimplementation with explicit replay branch matrix and RuleTester coverage.',
  }),

  baseRule({
    name: '@typescript-eslint/array-type',
    severity: 'error',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Style rule enforced at error because it is autofixable, preserves consistency, reduces diff churn, and is fixed automatically by `vp check --fix`.',
  }),
  baseRule({
    name: '@typescript-eslint/ban-ts-comment',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Suppressing TypeScript diagnostics is a type-safety escape hatch, not style.',
  }),
  baseRule({
    name: '@typescript-eslint/consistent-type-exports',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Type-only exports must stay explicit so runtime exports are reviewable.',
  }),
  baseRule({
    name: '@typescript-eslint/consistent-type-imports',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Owns the inline side of the hybrid type-import policy for mixed imports.',
  }),
  baseRule({
    name: '@typescript-eslint/dot-notation',
    severity: 'error',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Style rule enforced at error because it is autofixable, preserves property-access consistency, reduces diff churn, and is fixed automatically by `vp check --fix`.',
  }),
  baseRule({
    name: '@typescript-eslint/explicit-function-return-type',
    severity: 'off',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Global explicit return types are too broad; a future scoped API config owns that policy.',
  }),
  baseRule({
    name: '@typescript-eslint/no-empty-interface',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Empty interfaces create misleading type surfaces.',
  }),
  baseRule({
    name: '@typescript-eslint/no-explicit-any',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Explicit any is a type-safety escape hatch.',
  }),
  baseRule({
    name: '@typescript-eslint/no-import-type-side-effects',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Owns the type-only side of the hybrid policy by preventing runtime import side effects.',
  }),
  baseRule({
    name: '@typescript-eslint/no-inferrable-types',
    severity: 'error',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Style rule enforced at error because it is autofixable, preserves annotation consistency, reduces diff churn, and is fixed automatically by `vp check --fix`.',
  }),
  baseRule({
    name: '@typescript-eslint/no-invalid-void-type',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Invalid void positions distort API meaning.',
  }),
  baseRule({
    name: '@typescript-eslint/no-non-null-assertion',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Non-null assertions hide nullability risk from review and runtime checks.',
  }),
  baseRule({
    name: '@typescript-eslint/no-restricted-types',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Restricted types prevent known-unsafe type surfaces.',
  }),
  baseRule({
    name: '@typescript-eslint/no-this-alias',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Former warning promoted under --max-warnings 0; avoids confusing generated aliases.',
  }),
  baseRule({
    name: '@typescript-eslint/no-unnecessary-type-constraint',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Former warning promoted under --max-warnings 0; removes redundant generic noise.',
  }),
  baseRule({
    name: '@typescript-eslint/no-unused-vars',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Unused variables hide dead code while allowing intentional underscore placeholders.',
  }),
  baseRule({
    name: '@typescript-eslint/no-useless-constructor',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Removes generated class boilerplate that adds no behavior.',
  }),
  baseRule({
    name: '@typescript-eslint/prefer-function-type',
    severity: 'error',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Style rule enforced at error because it is autofixable, preserves type-shape consistency, reduces diff churn, and is fixed automatically by `vp check --fix`.',
  }),
  baseRule({
    name: '@typescript-eslint/prefer-optional-chain',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Optional chains reduce nullish branch mistakes.',
  }),
  baseRule({
    name: 'complexity',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Structural ceiling that forces decomposition before functions become hard to review.',
  }),
  baseRule({
    name: 'curly',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Braces prevent accidental single-line control-flow edits.',
  }),
  baseRule({
    name: 'default-param-last',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Default parameters before required parameters make calls ambiguous.',
  }),
  baseRule({
    name: 'eqeqeq',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Strict equality avoids coercion bugs.',
  }),
  baseRule({
    name: 'guard-for-in',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Prototype keys in for-in loops are a correctness and security footgun.',
  }),
  baseRule({
    name: 'import/consistent-type-specifier-style',
    severity: 'off',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Explicitly off because either preference conflicts with the hybrid type-import policy.',
  }),
  baseRule({
    name: 'import/exports-last',
    severity: 'off',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Export ordering is not part of the base policy.',
  }),
  baseRule({
    name: 'import/first',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Imports stay before executable statements so module evaluation order is obvious.',
  }),
  baseRule({
    name: 'import/group-exports',
    severity: 'off',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Grouped exports are not a base readability invariant.',
  }),
  baseRule({
    name: 'import/max-dependencies',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Structural dependency ceiling prevents modules from becoming broad coordination points.',
  }),
  baseRule({
    name: 'import/no-cycle',
    severity: 'off',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Cycle policy belongs to a future architecture config, not the base layer.',
  }),
  baseRule({
    name: 'import/no-default-export',
    severity: 'off',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Named-export policy belongs to a future namedExportsConfig.',
  }),
  baseRule({
    name: 'import/no-duplicates',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Replacement for no-duplicate-imports that supports inline type specifiers.',
  }),
  baseRule({
    name: 'import/no-named-export',
    severity: 'off',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'No-named-export conflicts with the package named-export preference.',
  }),
  baseRule({
    name: 'import/no-nodejs-modules',
    severity: 'off',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Browser/runtime portability belongs to a future browser config, not Node/Bun base.',
  }),
  baseRule({
    name: 'import/no-relative-parent-imports',
    severity: 'off',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Parent-import architecture policy belongs to a future architecture config.',
  }),
  baseRule({
    name: 'import/no-self-import',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Self-imports create circular or nonsensical module edges.',
  }),
  baseRule({
    name: 'import/prefer-default-export',
    severity: 'off',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Default-export preference conflicts with named-export package posture.',
  }),
  baseRule({
    name: 'max-depth',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Structural ceiling keeps nested control flow reviewable.',
  }),
  baseRule({
    name: 'max-lines',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'File-size ceiling prevents unreviewable modules.',
  }),
  baseRule({
    name: 'max-lines-per-function',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Function-size ceiling forces decomposition of large generated routines.',
  }),
  baseRule({
    name: 'max-params',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Parameter ceiling prevents overloaded function contracts.',
  }),
  baseRule({
    name: 'max-statements',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Statement ceiling forces decomposition before functions become procedural slabs.',
  }),
  baseRule({
    name: 'no-async-promise-executor',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Async Promise executors can drop thrown errors.',
  }),
  baseRule({
    name: 'no-cond-assign',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Assignments in conditions are almost always mistakes.',
  }),
  baseRule({
    name: 'no-console',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Console output in package code leaks ad hoc diagnostics into consumers.',
  }),
  baseRule({
    name: 'no-continue',
    severity: 'off',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Continue is allowed when it simplifies loop guard structure.',
  }),
  baseRule({
    name: 'no-debugger',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Debugger statements must not ship.',
  }),
  baseRule({
    name: 'no-duplicate-imports',
    severity: 'off',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Explicitly off because import/no-duplicates with preferInline owns this check.',
  }),
  baseRule({
    name: 'no-else-return',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Removes generated branch nesting after early returns.',
  }),
  baseRule({
    name: 'no-empty',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Empty blocks hide incomplete control-flow branches.',
  }),
  baseRule({
    name: 'no-eval',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Eval is a code-injection and reviewability hazard.',
  }),
  baseRule({
    name: 'no-implicit-coercion',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Implicit coercion makes runtime conversion behavior unclear.',
  }),
  baseRule({
    name: 'no-magic-numbers',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Magic-number ceiling keeps thresholds and sentinels named unless centrally exempted.',
  }),
  baseRule({
    name: 'no-multi-assign',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Chained assignment makes mutation targets easy to miss.',
  }),
  baseRule({
    name: 'no-new-func',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Dynamic function construction is a code-injection hazard.',
  }),
  baseRule({
    name: 'no-param-reassign',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Parameter reassignment hides mutation at function boundaries.',
  }),
  baseRule({
    name: 'no-return-assign',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Assignments in returns hide side effects in value expressions.',
  }),
  baseRule({
    name: 'no-script-url',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Script URLs are an injection hazard.',
  }),
  baseRule({
    name: 'no-shadow',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Base forbids shadowing; effectPreset keeps the explicit gen-first carve-out.',
  }),
  baseRule({
    name: 'no-template-curly-in-string',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Template placeholders in plain strings are usually interpolation mistakes.',
  }),
  baseRule({
    name: 'no-undef',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Undefined references are runtime failures.',
  }),
  baseRule({
    name: 'no-unneeded-ternary',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Removes generated boolean-expression noise.',
  }),
  baseRule({
    name: 'no-unsafe-optional-chaining',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Unsafe optional chains can still dereference undefined.',
  }),
  baseRule({
    name: 'no-unused-private-class-members',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Unused private members indicate dead or incomplete class state.',
  }),
  baseRule({
    name: 'no-useless-catch',
    severity: 'error',
    rationaleClass: 'agent-failure-mode',
    gating: 'stack-neutral',
    note: 'Useless catch blocks add control-flow noise without handling failures.',
  }),
  baseRule({
    name: 'no-void',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Void expressions can hide intentionally discarded results.',
  }),
  baseRule({
    name: 'oxc/no-barrel-file',
    severity: 'off',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Barrel-file architecture policy belongs to a future architecture config.',
  }),
  baseRule({
    name: 'prefer-const',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'stack-neutral',
    note: 'Const declarations make mutation intent explicit.',
  }),
  baseRule({
    name: 'prefer-promise-reject-errors',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'stack-neutral',
    note: 'Rejected values should preserve error semantics.',
  }),
  baseRule({
    name: 'prefer-template',
    severity: 'error',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Style rule enforced at error because it is autofixable, preserves string-composition consistency, reduces diff churn, and is fixed automatically by `vp check --fix`.',
  }),
  baseRule({
    name: 'sort-imports',
    severity: 'error',
    rationaleClass: 'style',
    gating: 'stack-neutral',
    note: 'Style rule enforced at error because it is autofixable, provides diff-determinism, preserves import-order consistency, and is fixed automatically by `vp check --fix`.',
  }),
  vitestRule({
    name: 'vitest/hoisted-apis-on-top',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'Vitest hoisted APIs must appear before other statements or mocks can behave incorrectly.',
  }),
  vitestRule({
    name: 'vitest/no-conditional-tests',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'test-file',
    note: 'Conditional tests hide failures when a branch never runs.',
  }),
  vitestRule({
    name: 'vitest/require-awaited-expect-poll',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'Unawaited expect.poll calls can false-pass.',
  }),
  vitestRule({
    name: 'vitest/warn-todo',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'test-file',
    note: 'Committed todo/skip markers silently omit test coverage.',
  }),
  // Jest-namespace rules exposed by oxlint's vitest plugin (vitest implements the jest API).
  // These are test-hygiene rules that match the live root config's active jest/* set.
  vitestRule({
    name: 'jest/expect-expect',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'Test bodies that never call expect() can false-pass silently.',
  }),
  vitestRule({
    name: 'jest/no-commented-out-tests',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'test-file',
    note: 'Commented-out tests are dead code that bypasses coverage and pollutes the suite.',
  }),
  vitestRule({
    name: 'jest/no-conditional-expect',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'expect() inside a conditional can silently pass when the branch is not taken.',
  }),
  vitestRule({
    name: 'jest/no-disabled-tests',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'test-file',
    note: '.skip and .xit silently omit coverage without failing CI.',
  }),
  vitestRule({
    name: 'jest/no-export',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'Exporting from a test file can cause isolation failures when the module is imported elsewhere.',
  }),
  vitestRule({
    name: 'jest/no-focused-tests',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'test-file',
    note: '.only left in a test file silently disables all other tests in the suite.',
  }),
  vitestRule({
    name: 'jest/no-standalone-expect',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'expect() outside a test body is not executed by the test runner.',
  }),
  vitestRule({
    name: 'jest/require-to-throw-message',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'toThrow() without a message accepts any error, masking wrong-error false-passes.',
  }),
  vitestRule({
    name: 'jest/valid-describe-callback',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'Async describe callbacks produce unhandled promise rejections; the callback must be synchronous.',
  }),
  vitestRule({
    name: 'jest/valid-expect',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'Invalid expect() usage (missing matcher, incorrectly awaited) causes silent false-passes.',
  }),
  vitestRule({
    name: 'jest/valid-title',
    severity: 'error',
    rationaleClass: 'correctness',
    gating: 'test-file',
    note: 'Non-string test titles produce confusing output and may indicate a copy-paste error.',
  }),
  nodeRuntimeRule({
    name: 'unicorn/prefer-node-protocol',
    severity: 'error',
    rationaleClass: 'safety',
    gating: 'runtime',
    note: 'The node: protocol removes ambiguity between built-ins and same-named packages.',
  }),
  ...lspDelegatedChecks([
    'importFromBarrel',
    'missingEffectServiceDependency',
    'leakingRequirements',
    'unsafeEffectTypeAssertion',
    'instanceOfSchema',
    'globalDate',
    'globalRandom',
    'globalConsole',
    'globalFetch',
    'globalTimers',
    'preferSchemaOverJson',
    'schemaSyncInEffect',
    'cryptoRandomUUID',
  ]),
] as const satisfies ReadonlyArray<RuleManifestEntry>;

export const implementedCustomRuleNames = ruleManifest
  .filter(
    (entry) => entry.implementationStatus === 'implemented' && entry.disposition !== 'built-in',
  )
  .map((entry) => entry.name);
export const collectionRuleNames = ruleManifest
  .filter((entry) => entry.collections.length > 0)
  .map((entry) => entry.name);
export const lspOwnedChecks = ruleManifest
  .filter((entry) => entry.disposition === 'LSP-delegated')
  .map((entry) => entry.name.replace('lsp/', ''));
export const linteffectSourceRuleNames = ruleManifest
  .filter((entry) => entry.sourceOwnership === 'linteffect')
  .map((entry) => entry.name);

// --- Manifest query helpers ---
// Defined here (not in rule-manifest-selection.ts) so scripts can import via .ts extension;
// Node's native TS loader cannot remap .js specifiers to .ts source at script runtime.

interface PresetRulesOptions {
  readonly includeBuiltIn?: boolean;
}

// Config fragments accept only off/warn/error. The manifest keeps info/warning distinct
// Because rule provenance may care about advisory strength; both advisory severities collapse to warn.
// Repos running `--max-warnings 0` then make warn fail CI the same way error does.
export const collapseManifestSeverity = (severity: RuleManifestSeverity): RuleConfigSeverity => {
  if (severity === 'off') {
    return 'off';
  }

  return severity === 'error' ? 'error' : 'warn';
};

export const oxlintSeverityForManifestEntry = (entry: RuleManifestEntry): RuleConfigSeverity =>
  collapseManifestSeverity(entry.severity);

export const entriesForCollections = (
  collections: ReadonlyArray<RuleCollection>,
): ReadonlyArray<RuleManifestEntry> =>
  ruleManifest.filter((entry) =>
    entry.collections.some((collection) => collections.includes(collection)),
  );

const presetCollectionOnlyForDomain = (domain: RuleDomain): RuleCollection | undefined =>
  presetCollectionByDomain[domain];

// Returns preset-collection manifest entries for the given domains without plugin prefixes.
// Preset assemblers should call pluginRuleName on each result to build rule config keys.
// Scripts and tests can use entry.name values directly without any plugin prefix.
export const presetEntriesForDomains = (
  domains: ReadonlyArray<RuleDomain>,
  { includeBuiltIn = false }: PresetRulesOptions = {},
): ReadonlyArray<RuleManifestEntry> => {
  const presetCollections = domains
    .map(presetCollectionOnlyForDomain)
    .filter((collection): collection is RuleCollection => typeof collection !== 'undefined');

  return ruleManifest.filter(
    (entry) =>
      entry.collections.some((collection) => presetCollections.includes(collection)) &&
      (includeBuiltIn || entry.disposition !== 'built-in'),
  );
};
