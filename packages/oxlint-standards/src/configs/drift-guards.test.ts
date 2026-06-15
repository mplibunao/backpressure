import type { OxlintConfig } from 'oxlint';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { baseConfig, composeLintConfigs, nodeRuntimeConfig, vitestConfig } from './index.js';

// These tests shell out to the oxlint binary and are slower than unit tests.
vi.setConfig({ testTimeout: 15_000 });

// Navigate from this file (configs/) up to the repo root: configs → src → oxlint-standards → packages → repo root.
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');
const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint');

const runOxlint = (
  args: Array<string>,
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
      const activeUnicornRules = Object.entries(effectiveConfig.rules ?? {})
        .filter(([key]) => key.startsWith('unicorn/'))
        .filter(([, value]) => value !== 'allow');

      expect(activeUnicornRules).toStrictEqual([['unicorn/prefer-node-protocol', 'deny']]);
    });
  });

  // ─── vitestConfig ────────────────────────────────────────────────────────────
  // Two guards prove the vitest scoping contract together.
  // Global guard (print-config): all vitest rules resolve to off/allow at the global level.
  // Behavioral guard (fixture lint): warn-todo fires on `.test.ts` but not on `.ts`.
  // Together with the exact-set assertion in vitest.test.ts, this validates the full test-file scoping.
  describe('vitestConfig: test-file override scoping', () => {
    it('--print-config on baseConfig + vitestConfig shows zero active vitest rules globally', () => {
      const composed = composeLintConfigs(baseConfig, vitestConfig);
      // Non-test path: `--print-config` reflects only global rules, not per-file overrides.
      const { configPath, filePath } = writeOxlintFixture(
        composed,
        'subject.ts',
        'export const x = 1;\n',
      );

      const result = runOxlint(['--config', configPath, '--print-config', filePath]);
      const effectiveConfig = parsePrintConfig(result.stdout);
      const activeVitestRules = Object.entries(effectiveConfig.rules ?? {})
        .filter(([key]) => key.startsWith('vitest/'))
        .filter(([, value]) => value !== 'allow');

      expect(activeVitestRules).toStrictEqual([]);
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
