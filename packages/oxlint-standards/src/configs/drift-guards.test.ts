import type { OxlintConfig } from 'oxlint';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { baseConfig, composeLintConfigs, nodeRuntimeConfig, vitestConfig } from './index.js';

// These tests shell out to the oxlint binary and are slower than unit tests.
vi.setConfig({ testTimeout: 15_000 });

// Navigate from this file (configs/) up to the repo root: configs → src → oxlint-standards → packages → repo root.
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');
const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint');

const runOxlint = (
  args: string[],
): { readonly stdout: string; readonly stderr: string; readonly status: number } => {
  const result = spawnSync(oxlintBin, args, { encoding: 'utf8' });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
};

// Parse the JSON object that `oxlint --print-config` writes to stdout.
const parsePrintConfig = (stdout: string): { readonly rules?: Record<string, string> } => {
  try {
    return JSON.parse(stdout) as { readonly rules?: Record<string, string> };
  } catch {
    throw new Error(
      `oxlint --print-config did not emit valid JSON.\nstdout: ${stdout.slice(0, 400)}`,
    );
  }
};

const activeRulesWithPrefix = (
  rules: Record<string, string> | undefined,
  prefixes: readonly string[],
): Array<readonly [string, string]> =>
  Object.entries(rules ?? {})
    .filter(([key]) => prefixes.some((prefix) => key.startsWith(prefix)))
    .filter(([, value]) => value !== 'allow');

const isTestFilePattern = (pattern: string): boolean =>
  pattern.includes('.test.ts') || pattern.includes('.spec.ts');

const testOverrideRules = (config: OxlintConfig): NonNullable<OxlintConfig['rules']> => {
  const testOverride = (config.overrides ?? []).find(
    (override) =>
      Array.isArray(override.files) &&
      override.files.some((pattern) => typeof pattern === 'string' && isTestFilePattern(pattern)),
  );
  return testOverride?.rules ?? {};
};

describe('drift guards — engine-backed suppression contracts', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'oxlint-drift-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Write a composed config and a single fixture file into the active temp directory.
  // Returns the paths so each test can pass them to runOxlint inline.
  const writeOxlintFixture = (
    composed: OxlintConfig,
    fileName: string,
    source: string,
  ): { readonly configPath: string; readonly filePath: string } => {
    const configPath = join(tempDir, '.oxlintrc.json');
    const filePath = join(tempDir, fileName);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(composed, null, 2));
    writeFileSync(filePath, source);
    return { configPath, filePath };
  };

  // ─── unicornConfig + nodeRuntimeConfig ─────────────────────────────────────
  // unicornConfig owns the stack-neutral general-quality surface. nodeRuntimeConfig owns
  // only the Node/Bun `node:` protocol rule. These guards prove that split against the
  // live oxlint engine, including category-swept rules that are not explicit config keys.
  describe('unicornConfig: DP-2 general-quality surface', () => {
    const expectedBaseUnicornRules = [
      ['unicorn/error-message', 'deny'],
      ['unicorn/new-for-builtins', 'deny'],
      ['unicorn/no-array-reverse', 'deny'],
      ['unicorn/no-array-sort', 'deny'],
      ['unicorn/no-await-in-promise-methods', 'deny'],
      ['unicorn/no-empty-file', 'deny'],
      ['unicorn/no-single-promise-in-promise-methods', 'deny'],
      ['unicorn/no-static-only-class', 'deny'],
      ['unicorn/no-thenable', 'deny'],
      ['unicorn/no-typeof-undefined', 'deny'],
      ['unicorn/no-unnecessary-await', 'deny'],
      ['unicorn/no-useless-fallback-in-spread', 'deny'],
      ['unicorn/no-useless-length-check', 'deny'],
      ['unicorn/no-useless-promise-resolve-reject', 'deny'],
      ['unicorn/no-useless-spread', 'deny'],
      ['unicorn/no-useless-switch-case', 'deny'],
      ['unicorn/no-useless-undefined', 'deny'],
      ['unicorn/prefer-array-find', 'deny'],
      ['unicorn/prefer-array-flat-map', 'deny'],
      ['unicorn/prefer-array-some', 'deny'],
      ['unicorn/prefer-date-now', 'deny'],
      ['unicorn/prefer-includes', 'deny'],
      ['unicorn/prefer-math-min-max', 'deny'],
      ['unicorn/prefer-math-trunc', 'deny'],
      ['unicorn/prefer-modern-math-apis', 'deny'],
      ['unicorn/prefer-native-coercion-functions', 'deny'],
      ['unicorn/prefer-number-properties', 'deny'],
      ['unicorn/prefer-optional-catch-binding', 'deny'],
      ['unicorn/prefer-regexp-test', 'deny'],
      ['unicorn/prefer-set-has', 'warn'],
      ['unicorn/prefer-set-size', 'deny'],
      ['unicorn/prefer-string-slice', 'deny'],
      ['unicorn/prefer-string-starts-ends-with', 'deny'],
      ['unicorn/prefer-structured-clone', 'deny'],
      ['unicorn/throw-new-error', 'deny'],
    ] as const;
    const expectedRuntimeOnlyRules = [['unicorn/prefer-node-protocol', 'deny']] as const;
    const intentionallyInactiveRules = [
      'unicorn/consistent-function-scoping',
      'unicorn/custom-error-definition',
      'unicorn/filename-case',
      'unicorn/no-instanceof-builtins',
      'unicorn/no-invalid-fetch-options',
      'unicorn/no-invalid-remove-event-listener',
      'unicorn/no-null',
      'unicorn/number-literal-case',
      'unicorn/numeric-separators-style',
      'unicorn/prefer-dom-node-append',
      'unicorn/prefer-dom-node-dataset',
      'unicorn/prefer-dom-node-remove',
      'unicorn/prefer-dom-node-text-content',
      'unicorn/prefer-logical-operator-over-ternary',
      'unicorn/prefer-modern-dom-apis',
      'unicorn/prefer-query-selector',
      'unicorn/prefer-ternary',
      'unicorn/switch-case-braces',
    ] as const;

    const printUnicornRules = (composed: OxlintConfig): Record<string, string> | undefined => {
      const { configPath, filePath } = writeOxlintFixture(
        composed,
        'subject.ts',
        'export const x = 1;\n',
      );

      const result = runOxlint(['--config', configPath, '--print-config', filePath]);
      return parsePrintConfig(result.stdout).rules;
    };

    it('--print-config on baseConfig shows exactly the DP-2 stack-neutral unicorn rules', () => {
      const activeUnicornRules = activeRulesWithPrefix(printUnicornRules(baseConfig), ['unicorn/']);

      expect(activeUnicornRules).toStrictEqual(expectedBaseUnicornRules);
    });

    it('--print-config on baseConfig + nodeRuntimeConfig adds only prefer-node-protocol', () => {
      const composed = composeLintConfigs(baseConfig, nodeRuntimeConfig);
      const activeUnicornRules = activeRulesWithPrefix(printUnicornRules(composed), ['unicorn/']);

      const expectedFullUnicornRules = [
        ...expectedBaseUnicornRules,
        ...expectedRuntimeOnlyRules,
      ].toSorted(([leftRule], [rightRule]) => leftRule.localeCompare(rightRule));

      expect(activeUnicornRules).toStrictEqual(expectedFullUnicornRules);
    });

    it('keeps held, deferred, browser-family, and idiom-conflict unicorn rules inactive', () => {
      const rules = printUnicornRules(baseConfig) ?? {};

      for (const ruleName of intentionallyInactiveRules) {
        expect({ ruleName, severity: rules[ruleName] }).toStrictEqual({
          ruleName,
          severity: 'allow',
        });
      }
    });
  });
  // ─── jsdocConfig ─────────────────────────────────────────────────────────────
  // jsdocConfig owns validate-where-documented behavior. The guard proves the live
  // engine sees only the intended jsdoc rules after baseConfig composes the plugin.
  describe('jsdocConfig: DP-4 validate-where-documented surface', () => {
    const expectedBaseJsdocRules = [
      ['jsdoc/check-access', 'deny'],
      ['jsdoc/check-tag-names', 'deny'],
      ['jsdoc/empty-tags', 'deny'],
      ['jsdoc/require-param', 'deny'],
      ['jsdoc/require-returns', 'deny'],
    ] as const;
    const intentionallyInactiveRules = [
      'jsdoc/check-property-names',
      'jsdoc/implements-on-classes',
      'jsdoc/no-defaults',
      'jsdoc/require-param-description',
      'jsdoc/require-param-name',
      'jsdoc/require-param-type',
      'jsdoc/require-property',
      'jsdoc/require-property-description',
      'jsdoc/require-property-name',
      'jsdoc/require-property-type',
      'jsdoc/require-returns-description',
      'jsdoc/require-returns-type',
      'jsdoc/require-yields',
    ] as const;

    const printJsdocRules = (): Record<string, string> | undefined => {
      const { configPath, filePath } = writeOxlintFixture(
        baseConfig,
        'subject.ts',
        'export const x = 1;\n',
      );

      const result = runOxlint(['--config', configPath, '--print-config', filePath]);
      return parsePrintConfig(result.stdout).rules;
    };

    it('--print-config on baseConfig shows exactly the DP-4 jsdoc validate rules', () => {
      const activeJsdocRules = activeRulesWithPrefix(printJsdocRules(), ['jsdoc/']);

      expect(activeJsdocRules).toStrictEqual(expectedBaseJsdocRules);
    });

    it('keeps every other current jsdoc rule inactive', () => {
      const rules = printJsdocRules() ?? {};

      for (const ruleName of intentionallyInactiveRules) {
        expect({ ruleName, severity: rules[ruleName] }).toStrictEqual({
          ruleName,
          severity: 'allow',
        });
      }
    });
  });

  describe('jsdocConfig: DP-4 validate-where-documented behavior', () => {
    const jsdocDiagnosticRules = (output: string): string[] =>
      Array.from(
        output.matchAll(/eslint-plugin-jsdoc\(([^)]+)\)/g),
        ([, ruleName]) => `jsdoc/${ruleName}`,
      ).toSorted();

    const lintBaseConfigFixtureForJsdocRules = (fileName: string, source: string): string[] => {
      const { configPath, filePath } = writeOxlintFixture(baseConfig, fileName, source);
      const result = runOxlint(['--config', configPath, filePath]);
      return jsdocDiagnosticRules(result.stdout + result.stderr);
    };

    it('validates only functions that already have JSDoc blocks', () => {
      const undocumentedRules = lintBaseConfigFixtureForJsdocRules(
        'undocumented.ts',
        `export function undocumentedExport(value: string): string {
  return value;
}
`,
      );
      const incompleteDocumentedRules = lintBaseConfigFixtureForJsdocRules(
        'incomplete-documented.ts',
        `/**
 * Echoes the value.
 */
export function incompleteDocumented(value: string): string {
  return value;
}
`,
      );
      const staleExtraParamRules = lintBaseConfigFixtureForJsdocRules(
        'stale-extra-param.ts',
        `/**
 * Increments the value.
 *
 * @param value The value to increment.
 * @param stale Removed option.
 * @returns The incremented value.
 */
export function staleExtraParam(value: number): number {
  return value + 1;
}
`,
      );

      expect(undocumentedRules).toStrictEqual([]);
      expect(incompleteDocumentedRules).toStrictEqual([
        'jsdoc/require-param',
        'jsdoc/require-returns',
      ]);
      // Known gap: oxlint 1.58.0 does not expose jsdoc/check-param-names, so stale extra @param tags are not diagnosed when every real parameter is documented.
      expect(staleExtraParamRules).toStrictEqual([]);
    });
  });

  // ─── baseConfig oxc scope ───────────────────────────────────────────────────
  // Enabling the oxc plugin for oxc/no-barrel-file must not silently activate the
  // rest of the oxc namespace through baseConfig's correctness/suspicious/restriction categories.
  // If a future oxlint release adds an oxc rule under an enabled category,
  // The explicit off-list will miss it and this guard will fail — that is the intended signal.
  describe('baseConfig: only oxc/no-barrel-file fires globally', () => {
    it('--print-config on baseConfig shows exactly one active oxc rule', () => {
      const composed = composeLintConfigs(baseConfig);
      const { configPath, filePath } = writeOxlintFixture(
        composed,
        'subject.ts',
        'export const x = 1;\n',
      );

      const result = runOxlint(['--config', configPath, '--print-config', filePath]);
      const effectiveConfig = parsePrintConfig(result.stdout);
      const activeOxcRules = activeRulesWithPrefix(effectiveConfig.rules, ['oxc/']);

      expect(activeOxcRules).toStrictEqual([['oxc/no-barrel-file', 'deny']]);
    });
  });

  // ─── baseConfig override carve-outs ─────────────────────────────────────────
  // These fixture-lint guards prove the override globs apply in the live engine,
  // not merely that baseConfig contains the expected override objects.
  describe('baseConfig: override carve-outs apply at runtime', () => {
    it('does not report oxc/no-barrel-file for the package public src/index.ts entrypoint', () => {
      const composed = composeLintConfigs(baseConfig);
      const barrelExports = Array.from(
        { length: 105 },
        (_, index) => `export { value${index} } from './module-${index}.js';`,
      ).join('\n');
      const { configPath, filePath } = writeOxlintFixture(
        composed,
        'src/index.ts',
        `${barrelExports}\n`,
      );

      const result = runOxlint(['--config', configPath, filePath]);
      const output = result.stdout + result.stderr;

      expect(result.status).toBe(0);
      expect(output).not.toContain('oxc(no-barrel-file)');
    });

    it('does not report import/no-default-export for tool config files', () => {
      const composed = composeLintConfigs(baseConfig);
      const { configPath, filePath } = writeOxlintFixture(
        composed,
        'vite.config.ts',
        'export default {};\n',
      );

      const result = runOxlint(['--config', configPath, filePath]);
      const output = result.stdout + result.stderr;

      expect(result.status).toBe(0);
      expect(output).not.toContain('eslint-plugin-import(no-default-export)');
    });
  });

  // ─── vitestConfig ────────────────────────────────────────────────────────────
  // Three guards prove the vitest scoping contract together:
  // 1. Global guard (print-config, full composition): zero active vitest/* and jest/* rules.
  // 2. Test-scope guard (synthesized flat config): exactly 8 vitest + 11 jest hygiene rules active.
  // 3. Behavioral guard (fixture lint): warn-todo fires on `.test.ts` but not on `.ts`.
  // Together with the exact-set assertions in vitest.test.ts, this validates the full test-file scoping.
  describe('vitestConfig: test-file override scoping', () => {
    it('full composition shows zero active vitest/* and jest/* rules at the global level', () => {
      // Non-test path: `--print-config` reflects only global rules, not per-file overrides.
      // Full composition (base + vitest + nodeRuntime) is used so nodeRuntimeConfig interactions
      // Cannot inadvertently re-activate a vitest or jest rule.
      const composed = composeLintConfigs(baseConfig, vitestConfig, nodeRuntimeConfig);
      const { configPath, filePath } = writeOxlintFixture(
        composed,
        'subject.ts',
        'export const x = 1;\n',
      );

      const result = runOxlint(['--config', configPath, '--print-config', filePath]);
      const effectiveConfig = parsePrintConfig(result.stdout);
      const activeTestHygieneRules = activeRulesWithPrefix(effectiveConfig.rules, [
        'vitest/',
        'jest/',
      ]);

      expect(activeTestHygieneRules).toStrictEqual([]);
    });

    it('test-scope activates exactly the 8 vitest and 11 jest hygiene rules', () => {
      // --print-config does not activate file-path overrides regardless of target path.
      // Synthesize the test-file scope: merge the test override into global rules and
      // Strip overrides so print-config sees a flat config — the same approach as
      // FlattenTestOverridesIntoGlobal in scripts/lib/effective-config.ts.
      const testScopeVitestConfig = {
        ...vitestConfig,
        rules: { ...vitestConfig.rules, ...testOverrideRules(vitestConfig) },
        overrides: [],
      } as OxlintConfig;
      const composed = composeLintConfigs(baseConfig, testScopeVitestConfig, nodeRuntimeConfig);
      const { configPath, filePath } = writeOxlintFixture(
        composed,
        'subject.ts',
        'export const x = 1;\n',
      );

      const result = runOxlint(['--config', configPath, '--print-config', filePath]);
      const effectiveConfig = parsePrintConfig(result.stdout);
      const activeHygieneRules = activeRulesWithPrefix(effectiveConfig.rules, ['vitest/', 'jest/'])
        .map(([key]) => key)
        .toSorted();

      expect(activeHygieneRules).toStrictEqual([
        'jest/expect-expect',
        'jest/no-commented-out-tests',
        'jest/no-conditional-expect',
        'jest/no-disabled-tests',
        'jest/no-export',
        'jest/no-focused-tests',
        'jest/no-standalone-expect',
        'jest/require-to-throw-message',
        'jest/valid-describe-callback',
        'jest/valid-expect',
        'jest/valid-title',
        'vitest/consistent-each-for',
        'vitest/hoisted-apis-on-top',
        'vitest/no-conditional-tests',
        'vitest/no-import-node-test',
        'vitest/require-awaited-expect-poll',
        'vitest/require-local-test-context-for-concurrent-snapshots',
        'vitest/require-mock-type-parameters',
        'vitest/warn-todo',
      ]);
    });

    it('warn-todo fires on a .test.ts fixture', () => {
      const composed = composeLintConfigs(baseConfig, vitestConfig);
      // A .todo() call is the clearest single-line trigger for vitest/warn-todo.
      const { configPath, filePath: fixturePath } = writeOxlintFixture(
        composed,
        'subject.test.ts',
        "import { it } from 'vitest';\nit.todo('flagged by warn-todo');\n",
      );

      const result = runOxlint(['--config', configPath, fixturePath]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('eslint-plugin-vitest(warn-todo)');
    });

    it('no vitest rules fire on a non-test .ts fixture', () => {
      const composed = composeLintConfigs(baseConfig, vitestConfig);
      // Deliberately named .ts (not .test.ts) to confirm the override does not apply.
      const { configPath, filePath: fixturePath } = writeOxlintFixture(
        composed,
        'subject.ts',
        'export const x = 1;\n',
      );

      const result = runOxlint(['--config', configPath, fixturePath]);

      // Exit status may be non-zero if base rules fire — only vitest diagnostics matter here.
      const vitestLines = (result.stdout + result.stderr)
        .split('\n')
        .filter((line) => line.includes('eslint-plugin-vitest('));
      expect(vitestLines).toStrictEqual([]);
    });
  });
});
