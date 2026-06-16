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

  // ─── nodeRuntimeConfig ──────────────────────────────────────────────────────
  // The static off-list in node-runtime.ts is exhaustive by design.
  // But a hand-maintained list cannot prove itself at runtime.
  // This guard materializes the composed config and asks the live oxlint engine
  // Whether any unicorn rules beyond prefer-node-protocol are active.
  // If a future oxlint release adds a unicorn rule under an enabled category,
  // The off-list will miss it and this guard will fail — that is the intended signal.
  describe('nodeRuntime: only unicorn/prefer-node-protocol fires globally', () => {
    it('--print-config on baseConfig + nodeRuntimeConfig shows exactly one active unicorn rule', () => {
      const composed = composeLintConfigs(baseConfig, nodeRuntimeConfig);
      const { configPath, filePath } = writeOxlintFixture(
        composed,
        'subject.ts',
        'export const x = 1;\n',
      );

      const result = runOxlint(['--config', configPath, '--print-config', filePath]);
      const effectiveConfig = parsePrintConfig(result.stdout);
      const activeUnicornRules = activeRulesWithPrefix(effectiveConfig.rules, ['unicorn/']);

      expect(activeUnicornRules).toStrictEqual([['unicorn/prefer-node-protocol', 'deny']]);
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
  // 2. Test-scope guard (synthesized flat config): exactly 4 vitest + 11 jest hygiene rules active.
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

    it('test-scope activates exactly the 4 vitest and 11 jest hygiene rules', () => {
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
        .sort();

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
        'vitest/hoisted-apis-on-top',
        'vitest/no-conditional-tests',
        'vitest/require-awaited-expect-poll',
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
