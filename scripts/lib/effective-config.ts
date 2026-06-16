import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTempDir, isObjectRecord, removeTempDir, repoRoot } from './script-runtime.ts';

// Preview limit for error messages when oxlint output cannot be parsed.
const outputPreviewLength = 400;
// JSON indent for writing temp configs and the committed artifact.
const jsonIndentSpaces = 2;

// Canonical alias: @typescript-eslint/* (not typescript/*).
// Oxlint --print-config may emit TypeScript rules under the typescript/* alias;
// Normalizing here prevents alias drift from flapping diffs in the committed artifact.
export const normalizeTypescriptAlias = (ruleName: string): string =>
  ruleName.startsWith('typescript/')
    ? `@typescript-eslint/${ruleName.slice('typescript/'.length)}`
    : ruleName;

// Eslint-core rules oxlint accepts under the @typescript-eslint/ prefix as TypeScript extension aliases.
// These two rules appear only in the eslint scope of --rules output, yet oxlint accepts them
// with the @typescript-eslint/ prefix because they have TypeScript-aware extension implementations.
// Every other @typescript-eslint/* rule the package uses lives in the typescript scope
// and is already covered by normalizeTypescriptAlias — no extra entry needed for those.
// A new @typescript-eslint/<core-rule> config key will correctly fail the gate until added here.
// Fail-loud is intentional: the author must confirm the alias is a real TypeScript extension rule.
const typescriptEslintExtensionRules = new Set(['no-unused-vars', 'no-useless-constructor']);

// Runs oxlint --rules and returns stdout; throws on process failure.
const spawnOxlintRules = (oxlintBin: string): string => {
  const result = spawnSync(oxlintBin, ['--rules', '--format=json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.error !== globalThis.undefined) {
    throw new Error(`oxlint --rules failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderrText = typeof result.stderr === 'string' ? result.stderr : '';
    throw new Error(
      `oxlint --rules exited with non-zero status.\nstderr: ${stderrText.slice(0, outputPreviewLength)}`,
    );
  }
  return result.stdout ?? '';
};

// Adds one --rules JSON item to the catalog, normalizing scope and handling the TS extension alias.
const addCatalogItem = (catalog: Set<string>, item: Record<string, unknown>): void => {
  const { scope, value } = item;
  if (typeof scope !== 'string' || typeof value !== 'string') {
    return;
  }
  if (scope === 'eslint') {
    // Bare form — how eslint-scope rules are authored in configs.
    catalog.add(value);
    // @typescript-eslint/ alias — only for the explicit extension-rule allowlist above.
    if (typescriptEslintExtensionRules.has(value)) {
      catalog.add(`@typescript-eslint/${value}`);
    }
  } else {
    // All other scopes use `scope/value`, with underscore-to-dash conversion for compound names.
    catalog.add(normalizeTypescriptAlias(`${scope.replaceAll('_', '-')}/${value}`));
  }
};

// Builds the authoritative set of every rule name oxlint recognizes, normalized to canonical form.
// Runs `oxlint --rules --format=json` once; eslint-scope rules use the bare value,
// All other scopes use `scope/value` with underscore-to-dash conversion for compound scope names
// (e.g., jsx_a11y → jsx-a11y), and the typescript scope is further normalized to @typescript-eslint/*.
// This is the single source of truth for what oxlint actually knows — not print-config output.
export const buildOxlintRuleCatalog = (oxlintBin: string): ReadonlySet<string> => {
  const stdout = spawnOxlintRules(oxlintBin);
  const catalog = new Set<string>();
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error('oxlint --rules did not emit a JSON array.');
  }
  for (const item of parsed) {
    if (isObjectRecord(item)) {
      addCatalogItem(catalog, item);
    }
  }
  return catalog;
};

// Determines whether a configured rule is recognized — either by the oxlint catalog
// Or as a custom JS-plugin rule the package ships (which oxlint --rules does not enumerate).
// The plugin-prefix exclusion lives here (not inline in the gate) so the inventory gate
// And the regression test share one code path and cannot diverge.
export const isConfiguredRuleKnown = (
  canonicalRuleName: string,
  catalog: ReadonlySet<string>,
  pluginName: string,
): boolean => canonicalRuleName.startsWith(`${pluginName}/`) || catalog.has(canonicalRuleName);

const parsePrintConfig = (stdout: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!isObjectRecord(parsed)) {
      return {};
    }
    const rulesSection = parsed['rules'];
    return isObjectRecord(rulesSection) ? rulesSection : {};
  } catch {
    throw new Error(
      `oxlint --print-config did not emit valid JSON.\nstdout: ${stdout.slice(0, outputPreviewLength)}`,
    );
  }
};

// Runs oxlint --print-config and returns stdout; throws on process failure.
const spawnOxlintPrintConfig = (
  oxlintBin: string,
  configPath: string,
  filePath: string,
): string => {
  const result = spawnSync(oxlintBin, ['--config', configPath, '--print-config', filePath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.error !== globalThis.undefined) {
    throw new Error(`oxlint failed to start: ${result.error.message}`);
  }
  const stderrText = typeof result.stderr === 'string' ? result.stderr : '';
  if (result.status !== 0) {
    throw new Error(
      `oxlint --print-config exited with non-zero status.\nstderr: ${stderrText.slice(0, outputPreviewLength)}`,
    );
  }
  return result.stdout ?? '';
};

// Normalizes typescript/* rule aliases to @typescript-eslint/* in a raw rules map.
const normalizeRuleKeys = (rawRules: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  for (const [ruleKey, ruleValue] of Object.entries(rawRules)) {
    normalized[normalizeTypescriptAlias(ruleKey)] = ruleValue;
  }
  return normalized;
};

// Materializes a temp .oxlintrc.json + dummy source file, runs oxlint --print-config,
// Returns the effective rules map with TypeScript alias normalized to @typescript-eslint/*.
// Sets cwd to the repo root so plugin resolution finds node_modules regardless of temp dir location.
export const materializeEffectiveRules = (
  composed: object,
  oxlintBin: string,
  fileName = 'subject.ts',
): Record<string, unknown> => {
  const tempDir = createTempDir('oxlint-effective-');
  try {
    const configPath = join(tempDir, '.oxlintrc.json');
    const filePath = join(tempDir, fileName);
    writeFileSync(configPath, JSON.stringify(composed, null, jsonIndentSpaces));
    writeFileSync(filePath, 'export const x = 1;\n');
    const rawRules = parsePrintConfig(spawnOxlintPrintConfig(oxlintBin, configPath, filePath));
    return normalizeRuleKeys(rawRules);
  } finally {
    removeTempDir(tempDir);
  }
};

// Captures both the global and test-file effective rule sets for a single composition.
// Global scope uses a non-test path; test scope uses *.test.ts to activate file overrides.
export interface EffectiveScopeSnapshot {
  readonly global: Record<string, unknown>;
  readonly test: Record<string, unknown>;
}

export interface EffectiveConfigArtifact {
  readonly base: EffectiveScopeSnapshot;
  readonly full: EffectiveScopeSnapshot;
}

const sortedRecord = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record).toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
  );

// Oxlint --print-config does not activate file-path overrides regardless of the target file path.
// To capture the test-file scope, merge all overrides targeting *.test.ts into the global rules
// And run print-config on the modified (flat) config — this gives an accurate view of what test files see.
const isTestFilePattern = (pattern: string): boolean =>
  pattern.includes('.test.ts') || pattern.includes('.spec.ts');

// Merges one override's rules into baseRules if the override targets test files; no-ops otherwise.
const mergeTestOverrideRules = (
  baseRules: Record<string, unknown>,
  override: Record<string, unknown>,
): void => {
  const { files, rules: overrideRules } = override;
  const isTest =
    Array.isArray(files) &&
    files.some((pattern) => typeof pattern === 'string' && isTestFilePattern(pattern));
  if (!isTest) {
    return;
  }
  if (isObjectRecord(overrideRules)) {
    Object.assign(baseRules, overrideRules);
  }
};

const flattenTestOverridesIntoGlobal = (composed: object): object => {
  if (!isObjectRecord(composed)) {
    return composed;
  }
  const { rules: composedRules, overrides } = composed;
  const baseRules: Record<string, unknown> = isObjectRecord(composedRules)
    ? { ...composedRules }
    : {};
  if (Array.isArray(overrides)) {
    for (const override of overrides) {
      if (isObjectRecord(override)) {
        mergeTestOverrideRules(baseRules, override);
      }
    }
  }
  // Strip overrides so print-config sees a flat config — the test rules are now in global scope.
  return { ...composed, rules: baseRules, overrides: [] };
};

const captureCompositionScopes = (composed: object, oxlintBin: string): EffectiveScopeSnapshot => ({
  global: sortedRecord(materializeEffectiveRules(composed, oxlintBin, 'subject.ts')),
  test: sortedRecord(
    materializeEffectiveRules(flattenTestOverridesIntoGlobal(composed), oxlintBin, 'subject.ts'),
  ),
});

// Generates the two-composition artifact, each with global and test-file scopes.
// Base composition: baseConfig alone. Full composition: baseConfig + vitestConfig + nodeRuntimeConfig.
// Run via `pnpm gen:effective-config` to update the committed artifact.
export const generateEffectiveConfigArtifact = (
  baseComposed: object,
  fullComposed: object,
  oxlintBin: string,
): EffectiveConfigArtifact => ({
  base: captureCompositionScopes(baseComposed, oxlintBin),
  full: captureCompositionScopes(fullComposed, oxlintBin),
});

// Serializes the artifact to the checked-in format (sorted keys, 2-space indent, trailing newline).
export const serializeArtifact = (artifact: EffectiveConfigArtifact): string =>
  `${JSON.stringify(artifact, null, jsonIndentSpaces)}\n`;

// Minimal shape needed for extracting configured rule entries.
// Both OxlintConfig and RuleConfigFragment satisfy this interface.
export interface ConfigWithRules {
  readonly rules?: Record<string, unknown>;
  readonly overrides?: ReadonlyArray<{ readonly rules?: Record<string, unknown> }>;
}

// Each explicitly configured rule entry, carrying the raw name as authored,
// The canonical name (typescript/* normalized to @typescript-eslint/*),
// And the effective severity (first element of array-style config, or the value itself).
export interface RuleEntry {
  readonly rawName: string;
  readonly canonicalName: string;
  readonly severity: unknown;
}

// Returns all rule entries explicitly configured in the given config (rules + overrides.rules).
// Raw name is preserved for namespace assertions; canonical name is used for recognition checks.
export const configuredRuleEntries = (config: ConfigWithRules): readonly RuleEntry[] => {
  const entries: RuleEntry[] = [];
  for (const [ruleKey, ruleValue] of Object.entries(config.rules ?? {})) {
    entries.push({
      rawName: ruleKey,
      canonicalName: normalizeTypescriptAlias(ruleKey),
      severity: Array.isArray(ruleValue) ? ruleValue[0] : ruleValue,
    });
  }
  for (const override of config.overrides ?? []) {
    for (const [ruleKey, ruleValue] of Object.entries(override.rules ?? {})) {
      entries.push({
        rawName: ruleKey,
        canonicalName: normalizeTypescriptAlias(ruleKey),
        severity: Array.isArray(ruleValue) ? ruleValue[0] : ruleValue,
      });
    }
  }
  return entries;
};
