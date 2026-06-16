import { describe, expect, it, vi } from 'vitest';

import { generalPreset } from '../presets/index.js';
import { baseConfig } from './base.js';

const rules = baseConfig.rules ?? {};
const safetyStyleRulesToKeep = [
  '@typescript-eslint/no-empty-interface',
  'guard-for-in',
  'no-implicit-coercion',
  'no-multi-assign',
  'no-new-func',
  'no-return-assign',
  'no-script-url',
  'no-template-curly-in-string',
  'prefer-promise-reject-errors',
] as const;
const cosmeticStyleRulesIntentionallyDropped = [
  '@typescript-eslint/consistent-type-assertions',
  '@typescript-eslint/consistent-type-definitions',
  '@typescript-eslint/prefer-for-of',
  'default-case-last',
  'sort-keys',
] as const;
const deferredImportPolicyRules = [
  'import/exports-last',
  'import/group-exports',
  'import/no-default-export',
  'import/no-named-export',
  'import/no-nodejs-modules',
  'import/no-relative-parent-imports',
  'import/prefer-default-export',
  'import/no-cycle',
  'oxc/no-barrel-file',
] as const;

vi.setConfig({ testTimeout: 1000 });

describe('base config fragment', () => {
  it('sets graded categories without enabling blanket style rules', () => {
    expect(baseConfig.categories).toStrictEqual({
      correctness: 'error',
      nursery: 'off',
      pedantic: 'off',
      restriction: 'error',
      style: 'off',
      suspicious: 'error',
    });
  });

  it('pins the inline hybrid type-import rules', () => {
    expect(rules['@typescript-eslint/consistent-type-imports']).toStrictEqual([
      'error',
      { fixStyle: 'inline-type-imports' },
    ]);
    expect(rules['@typescript-eslint/no-import-type-side-effects']).toBe('error');
    expect(rules['import/consistent-type-specifier-style']).toBe('off');
    expect(rules['no-duplicate-imports']).toBe('off');
    expect(rules['import/no-duplicates']).toStrictEqual(['error', { preferInline: true }]);
  });

  it('pins the base-specific rule decisions', () => {
    expect(rules['@typescript-eslint/array-type']).toStrictEqual([
      'error',
      { default: 'array-simple' },
    ]);
    expect(rules['max-statements']).toStrictEqual(['error', { max: 10 }]);
    expect(rules['@typescript-eslint/no-non-null-assertion']).toBe('error');
    expect(rules['no-shadow']).toBe('error');
    expect(rules['sort-imports']).toBe('off');
    expect(rules).not.toHaveProperty('sort-keys');
  });

  it('keeps the live structural ceilings in base', () => {
    expect(rules).toMatchObject({
      complexity: ['error', 20],
      'import/max-dependencies': ['error', { max: 15 }],
      'max-depth': ['error', 4],
      'max-lines': ['error', 500],
      'max-lines-per-function': ['error', 75],
      'max-params': ['error', 4],
      'no-magic-numbers': ['error', { ignore: [0, 1, 4, 15, 20, 75, 500] }],
    });
  });

  it('keeps safety and correctness rules explicit when the style category is off', () => {
    for (const ruleName of safetyStyleRulesToKeep) {
      expect(rules[ruleName]).toBe('error');
    }

    for (const ruleName of cosmeticStyleRulesIntentionallyDropped) {
      expect(rules).not.toHaveProperty(ruleName);
    }
  });

  it('keeps deferred import policy out of base', () => {
    for (const ruleName of deferredImportPolicyRules) {
      expect(rules[ruleName]).toBe('off');
    }
  });

  it('includes the general preset custom plugin contract', () => {
    for (const [ruleName, ruleConfig] of Object.entries(generalPreset.rules)) {
      expect(rules).toHaveProperty(ruleName, ruleConfig);
    }

    expect(baseConfig.jsPlugins).toEqual(expect.arrayContaining([...generalPreset.jsPlugins]));
  });

  it('does not enable the type-aware oxlint mode in the base fragment', () => {
    expect(baseConfig.options).toStrictEqual({ reportUnusedDisableDirectives: 'error' });
    expect(baseConfig.options).not.toHaveProperty('typeAware');
    expect(baseConfig.options).not.toHaveProperty('typeCheck');
  });

  it('carries the shared test-file ceiling relaxation override', () => {
    expect(baseConfig.overrides).toHaveLength(1);
    expect(baseConfig.overrides?.[0]).toStrictEqual({
      files: ['**/*.test.ts'],
      rules: {
        '@mplibunao/oxlint-standards/no-double-cast': 'off',
        '@typescript-eslint/no-unsafe-type-assertion': 'off',
        'import/max-dependencies': 'off',
        'max-lines': 'off',
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'no-magic-numbers': 'off',
      },
    });
  });

  it('uses the @typescript-eslint namespace for TypeScript rules', () => {
    expect(
      Object.keys(rules).filter((ruleName) => ruleName.startsWith('typescript/')),
    ).toStrictEqual([]);
    expect(
      Object.keys(rules).filter((ruleName) => ruleName.startsWith('@typescript-eslint/')),
    ).toEqual(
      expect.arrayContaining([
        '@typescript-eslint/array-type',
        '@typescript-eslint/consistent-type-imports',
        '@typescript-eslint/no-import-type-side-effects',
        '@typescript-eslint/no-non-null-assertion',
      ]),
    );
  });
});
