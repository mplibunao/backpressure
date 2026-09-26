import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createTempDir, isObjectRecord, removeTempDir, repoRoot } from './script-runtime.ts';

// Preview limit for error messages when oxlint output cannot be parsed.
const outputPreviewLength = 400;
// JSON indent for the temp configs handed to oxlint --print-config.
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

// One built-in rule as `oxlint --rules --format=json` describes it. `configNames` holds every
// canonical spelling a config may use for the rule: eslint-scope rules use the bare value, plus the
// @typescript-eslint/ alias for the extension-rule allowlist above; every other scope uses
// `scope/value` with underscores turned into dashes (jsx_a11y → jsx-a11y), and the typescript
// scope is further normalized to @typescript-eslint/*.
export interface OxlintRuleItem {
  readonly category: string;
  readonly configNames: readonly string[];
  readonly docsUrl: string;
  readonly fix: string;
  // The plugin scope as `oxlint --rules` spells it, for example `jsx_a11y`.
  readonly scope: string;
  readonly typeAware: boolean;
  // The bare rule name, which is also the part inside the parentheses of a reported diagnostic code.
  readonly value: string;
}

const itemConfigNames = (scope: string, value: string): readonly string[] => {
  if (scope !== 'eslint') {
    return [normalizeTypescriptAlias(`${scope.replaceAll('_', '-')}/${value}`)];
  }
  return typescriptEslintExtensionRules.has(value)
    ? [value, `@typescript-eslint/${value}`]
    : [value];
};

const parseRuleItem = (item: unknown): OxlintRuleItem => {
  if (!isObjectRecord(item)) {
    throw new Error('oxlint --rules emitted a non-object item.');
  }
  const { category, docs_url: docsUrl, fix, scope, type_aware: typeAware, value } = item;
  if (
    typeof scope !== 'string' ||
    typeof value !== 'string' ||
    typeof category !== 'string' ||
    typeof docsUrl !== 'string' ||
    typeof fix !== 'string' ||
    typeof typeAware !== 'boolean'
  ) {
    throw new Error(`oxlint --rules item has an unexpected shape: ${JSON.stringify(item)}`);
  }
  return {
    category,
    configNames: itemConfigNames(scope, value),
    docsUrl,
    fix,
    scope,
    typeAware,
    value,
  };
};

// Parses `oxlint --rules --format=json` once. This is the source of truth for which built-in rules
// oxlint knows, not print-config output.
export const readOxlintRuleItems = (oxlintBin: string): readonly OxlintRuleItem[] => {
  const parsed: unknown = JSON.parse(spawnOxlintRules(oxlintBin));
  if (!Array.isArray(parsed)) {
    throw new Error('oxlint --rules did not emit a JSON array.');
  }
  return parsed.map(parseRuleItem);
};

// Every rule name oxlint recognizes, in the canonical spellings of `OxlintRuleItem.configNames`.
export const buildOxlintRuleCatalog = (oxlintBin: string): ReadonlySet<string> =>
  new Set(readOxlintRuleItems(oxlintBin).flatMap((item) => item.configNames));

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

// Where print-config runs. The default is the repo root with its own oxlint. A consumer context runs
// another engine (the isolated patched one) from the consumer directory, and the temp config and
// subject file go inside that directory so the config's JS plugins resolve from its node_modules.
export interface PrintConfigContext {
  readonly cwd: string;
  readonly timeoutMs: number;
}

// Runs oxlint --print-config and returns stdout; throws on process failure.
const spawnOxlintPrintConfig = (
  oxlintBin: string,
  configPath: string,
  filePath: string,
  context: PrintConfigContext | undefined,
): string => {
  const result = spawnSync(oxlintBin, ['--config', configPath, '--print-config', filePath], {
    cwd: context?.cwd ?? repoRoot,
    encoding: 'utf8',
    ...(context === globalThis.undefined
      ? {}
      : { killSignal: 'SIGKILL', timeout: context.timeoutMs }),
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
// Without a context it runs from the repo root so plugin resolution finds the root node_modules.
// `fileName` may name subdirectories, so a representative test or boundary path can be printed.
export const materializeEffectiveRules = (
  composed: object,
  oxlintBin: string,
  fileName = 'subject.ts',
  context?: PrintConfigContext,
): Record<string, unknown> => {
  const tempDir =
    context === globalThis.undefined
      ? createTempDir('oxlint-effective-')
      : mkdtempSync(join(context.cwd, '.oxlint-effective-'));
  try {
    const configPath = join(tempDir, '.oxlintrc.json');
    const filePath = join(tempDir, fileName);
    writeFileSync(configPath, JSON.stringify(composed, null, jsonIndentSpaces));
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, 'export const x = 1;\n');
    const rawRules = parsePrintConfig(
      spawnOxlintPrintConfig(oxlintBin, configPath, filePath, context),
    );
    return normalizeRuleKeys(rawRules);
  } finally {
    removeTempDir(tempDir);
  }
};

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

export const flattenTestOverridesIntoGlobal = (composed: object): object => {
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
