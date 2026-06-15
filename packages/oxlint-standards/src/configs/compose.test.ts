import type { OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import { composeLintConfigs } from './compose.js';

vi.setConfig({ testTimeout: 1000 });

describe('config composition', () => {
  it('deduplicates built-in plugins and JS plugin entries without changing first-seen order', () => {
    const customPlugin = { name: 'custom', specifier: 'eslint-plugin-custom' };

    const result = composeLintConfigs(
      {
        jsPlugins: ['./local-plugin.js', customPlugin],
        plugins: ['import', 'typescript'],
      },
      {
        jsPlugins: [
          './local-plugin.js',
          { name: 'custom', specifier: 'eslint-plugin-custom' },
          { name: 'custom-alt', specifier: 'eslint-plugin-custom' },
        ],
        plugins: ['typescript', 'vitest'],
      },
    );

    expect(result.plugins).toStrictEqual(['import', 'typescript', 'vitest']);
    expect(result.jsPlugins).toStrictEqual([
      './local-plugin.js',
      customPlugin,
      { name: 'custom-alt', specifier: 'eslint-plugin-custom' },
    ]);
  });

  it('treats JS plugin identity as the entry variant plus object name and specifier', () => {
    const scenarios: ReadonlyArray<{
      readonly configs: ReadonlyArray<OxlintConfig>;
      readonly expected: NonNullable<OxlintConfig['jsPlugins']>;
    }> = [
      {
        configs: [
          { jsPlugins: [{ name: 'custom', specifier: 'eslint-plugin-custom' }] },
          { jsPlugins: [{ name: 'custom', specifier: 'eslint-plugin-custom-alt' }] },
        ],
        expected: [
          { name: 'custom', specifier: 'eslint-plugin-custom' },
          { name: 'custom', specifier: 'eslint-plugin-custom-alt' },
        ],
      },
      {
        configs: [
          { jsPlugins: ['object:custom\u0000eslint-plugin-custom'] },
          { jsPlugins: [{ name: 'custom', specifier: 'eslint-plugin-custom' }] },
        ],
        expected: [
          'object:custom\u0000eslint-plugin-custom',
          { name: 'custom', specifier: 'eslint-plugin-custom' },
        ],
      },
    ];

    for (const { configs, expected } of scenarios) {
      expect(composeLintConfigs(...configs).jsPlugins).toStrictEqual(expected);
    }
  });

  it('uses later rule and category values when fragments collide', () => {
    const result = composeLintConfigs(
      {
        categories: { correctness: 'warn', style: 'off' },
        rules: { eqeqeq: 'warn', 'no-debugger': 'error' },
      },
      {
        categories: { correctness: 'error', suspicious: 'warn' },
        rules: { eqeqeq: 'error', 'no-alert': 'warn' },
      },
    );

    expect(result.categories).toStrictEqual({
      correctness: 'error',
      style: 'off',
      suspicious: 'warn',
    });
    expect(result.rules).toStrictEqual({
      eqeqeq: 'error',
      'no-alert': 'warn',
      'no-debugger': 'error',
    });
  });

  it('concats base, layer, and consumer overrides into one flat config without extends', () => {
    const baseOverride: NonNullable<OxlintConfig['overrides']>[number] = {
      files: ['**/*.test.ts'],
      rules: { 'no-magic-numbers': 'off' },
    };
    const layerOverride: NonNullable<OxlintConfig['overrides']>[number] = {
      files: ['scripts/**/*.ts'],
      rules: { 'no-console': 'off' },
    };
    const consumerOverride: NonNullable<OxlintConfig['overrides']>[number] = {
      files: ['vite.config.ts'],
      rules: { 'import/no-default-export': 'off' },
    };

    const result = composeLintConfigs(
      { extends: [{}], overrides: [baseOverride] },
      { overrides: [layerOverride] },
      { overrides: [consumerOverride] },
    );

    expect(result.overrides).toStrictEqual([baseOverride, layerOverride, consumerOverride]);
    expect(result.overrides).toContain(baseOverride);
    expect(result).not.toHaveProperty('extends');
  });

  it('drops extends even when no override merge is involved', () => {
    const result = composeLintConfigs({ extends: [{}] }, { rules: { eqeqeq: 'error' } });

    expect(result).toStrictEqual({ rules: { eqeqeq: 'error' } });
    expect(result).not.toHaveProperty('extends');
  });

  it('shallow-merges option-like maps and omits empty fields', () => {
    const result = composeLintConfigs(
      {
        env: { node: true },
        globals: { describe: 'readonly' },
        ignorePatterns: ['dist/**', 'coverage/**'],
        options: { reportUnusedDisableDirectives: 'warn' },
        settings: { jsdoc: { mode: 'typescript' } },
      },
      {
        env: { browser: true, node: false },
        globals: { describe: 'off', it: 'readonly' },
        ignorePatterns: ['coverage/**', 'tmp/**'],
        options: { reportUnusedDisableDirectives: 'error' },
        settings: { jsdoc: { mode: 'typescript-flavor' } },
      },
    );

    expect(result).toStrictEqual({
      env: { browser: true, node: false },
      globals: { describe: 'off', it: 'readonly' },
      ignorePatterns: ['dist/**', 'coverage/**', 'tmp/**'],
      options: { reportUnusedDisableDirectives: 'error' },
      settings: { jsdoc: { mode: 'typescript-flavor' } },
    });
    expect(composeLintConfigs()).toStrictEqual({});
  });

  it('does not mutate or reuse top-level input containers', () => {
    const inputPlugins: NonNullable<OxlintConfig['plugins']> = ['import', 'typescript'];
    const inputIgnorePatterns: NonNullable<OxlintConfig['ignorePatterns']> = ['dist/**'];
    const inputRules: NonNullable<OxlintConfig['rules']> = { eqeqeq: 'warn' };
    const inputOverrides: NonNullable<OxlintConfig['overrides']> = [
      { files: ['**/*.test.ts'], rules: { 'no-magic-numbers': 'off' } },
    ];
    const inputConfig: OxlintConfig = {
      ignorePatterns: inputIgnorePatterns,
      overrides: inputOverrides,
      plugins: inputPlugins,
      rules: inputRules,
    };

    const result = composeLintConfigs(inputConfig, {
      ignorePatterns: ['coverage/**'],
      overrides: [{ files: ['scripts/**/*.ts'], rules: { 'no-console': 'off' } }],
      plugins: ['vitest'],
      rules: { eqeqeq: 'error' },
    });

    expect(inputPlugins).toStrictEqual(['import', 'typescript']);
    expect(inputIgnorePatterns).toStrictEqual(['dist/**']);
    expect(inputRules).toStrictEqual({ eqeqeq: 'warn' });
    expect(inputOverrides).toStrictEqual([
      { files: ['**/*.test.ts'], rules: { 'no-magic-numbers': 'off' } },
    ]);

    expect(result.plugins).not.toBe(inputPlugins);
    expect(result.ignorePatterns).not.toBe(inputIgnorePatterns);
    expect(result.rules).not.toBe(inputRules);
    expect(result.overrides).not.toBe(inputOverrides);
    expect(result).toMatchObject({
      ignorePatterns: ['dist/**', 'coverage/**'],
      plugins: ['import', 'typescript', 'vitest'],
      rules: { eqeqeq: 'error' },
    });
  });
});
