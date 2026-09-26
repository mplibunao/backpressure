import { describe, expect, it } from 'vitest';

import type { OxlintRuleItem } from './effective-config.ts';
import type { RuleList } from './rule-list.ts';
import {
  buildRuleList,
  fullCompositionTarget,
  type ManifestRow,
  normalizeSeverity,
  type RuleListInputs,
} from './rules-collector.ts';
import { renderRulesMarkdown } from './rules-markdown.ts';

const testOverride = (rules: Record<string, string>) => [{ files: ['**/*.test.ts'], rules }];

const manifest: readonly ManifestRow[] = [
  {
    collections: ['effectPreset'],
    disposition: 'ported',
    domain: 'effect',
    implementationStatus: 'implemented',
    name: 'keep-me',
    note: 'Catches X.',
    severity: 'error',
  },
  {
    collections: ['generalPreset', 'baseConfig'],
    disposition: 'reimplemented',
    domain: 'general',
    implementationStatus: 'implemented',
    name: 'general-rule',
    note: 'Catches G.',
    severity: 'warning',
  },
  {
    collections: [],
    disposition: 'dropped',
    domain: 'effect',
    implementationStatus: 'not-implemented',
    name: 'gone',
    note: 'Dropped.',
    severity: 'error',
  },
  {
    collections: ['baseConfig'],
    disposition: 'built-in',
    domain: 'base',
    implementationStatus: 'implemented',
    name: 'no-shadow',
    note: 'Shadow note.',
    severity: 'error',
  },
];

const item = (configName: string): OxlintRuleItem => ({
  category: 'correctness',
  configNames: [configName],
  docsUrl: `https://oxc.example/${configName}`,
  fix: 'none',
  typeAware: false,
});

const baseScopes = {
  overrides: testOverride({ 'pkg/general-rule': 'off' }),
  rules: { 'pkg/general-rule': 'warn' },
};
const tsgoFragment = {
  overrides: testOverride({ 'effecttsgo/a-rule': 'off' }),
  rules: { 'effecttsgo/a-rule': 'error', 'effecttsgo/off-rule': 'off' },
};

const inputs = (effectPresetRules: Record<string, string> = {}): RuleListInputs => ({
  configs: {
    baseConfig: baseScopes,
    boundariesPreset: { rules: {} },
    effectPreset: {
      overrides: tsgoFragment.overrides,
      rules: {
        'no-shadow': 'off',
        'pkg/keep-me': 'error',
        ...tsgoFragment.rules,
        ...effectPresetRules,
      },
    },
    effectReactPreset: { rules: {} },
    effectTsgoConfig: tsgoFragment,
    generalPreset: { rules: { 'no-nested-ternary': 'error', 'pkg/general-rule': 'warn' } },
    [fullCompositionTarget]: baseScopes,
  },
  manifest,
  messageTemplate: (ruleName) => {
    if (ruleName === 'gone') {
      throw new Error('A dropped rule has no message.');
    }
    return `Rule: ${ruleName}. Why: it hurts. Fix: do ${ruleName} right. Ref: ADR-001.`;
  },
  oxlintItems: [
    item('eqeqeq'),
    item('no-alert'),
    item('no-nested-ternary'),
    item('no-shadow'),
    item('vitest/x'),
    { ...item('@typescript-eslint/array-type'), fix: 'fix' },
  ],
  pluginName: 'pkg',
  printed: {
    baseConfig: {
      normal: {
        eqeqeq: ['deny', {}],
        'no-alert': 'allow',
        'no-shadow': 'deny',
        'typescript/array-type': 'warn',
      },
      test: {
        eqeqeq: 'deny',
        'no-alert': 'allow',
        'no-shadow': 'deny',
        'typescript/array-type': 'allow',
      },
    },
    [fullCompositionTarget]: {
      normal: { 'no-shadow': 'deny', 'vitest/x': 'allow' },
      test: { 'no-shadow': 'deny', 'vitest/x': 'deny' },
    },
  },
  tsgo: {
    attribution: 'MIT, Copyright (c) Test',
    docsBaseUrl: 'https://tsgo.example/rules/',
    rows: [
      { ruleName: 'effecttsgo/a-rule', severity: 'error' },
      { ruleName: 'effecttsgo/off-rule', severity: 'off' },
    ],
    snapshotRules: ['a-rule', 'off-rule'].map((kebab) => ({
      category: 'antipattern',
      description: `Upstream ${kebab}.`,
      fixable: kebab === 'a-rule',
      preview: { diagnostics: [{ end: 5, start: 0, text: 'bad' }], sourceText: 'bad()' },
      ruleName: `effecttsgo/${kebab}`,
    })),
    testOverrides: { 'effecttsgo/a-rule': 'off' },
    version: '9.9.9',
  },
});

const ruleNamed = (list: RuleList, name: string) =>
  list.rules.find((rule) => rule.name === name) ?? expect.unreachable(`${name} is missing`);

describe('buildRuleList', () => {
  const list = buildRuleList(inputs());

  it('merges the three sources in order and leaves out dropped and everywhere-off rules', () => {
    expect(list.rules.map((rule) => `${rule.source}:${rule.name}`)).toStrictEqual([
      'package:pkg/general-rule',
      'package:pkg/keep-me',
      'tsgo:effecttsgo/a-rule',
      'oxlint:@typescript-eslint/array-type',
      'oxlint:eqeqeq',
      'oxlint:no-nested-ternary',
      'oxlint:no-shadow',
      'oxlint:vitest/x',
    ]);
  });

  it('takes package severities from the manifest and test severities from the config overrides', () => {
    const rule = ruleNamed(list, 'pkg/general-rule');
    expect(rule.activations).toStrictEqual([
      { normal: 'warn', target: 'generalPreset', test: 'warn' },
      { normal: 'warn', target: 'baseConfig', test: 'off' },
      { normal: 'warn', target: fullCompositionTarget, test: 'off' },
    ]);
    expect([rule.description, rule.fix, rule.reference]).toStrictEqual([
      'Catches G.',
      'do general-rule right.',
      'ADR-001.',
    ]);
  });

  it('attributes tsgo rows to the Effect preset and fragment with the policy test override', () => {
    const rule = ruleNamed(list, 'effecttsgo/a-rule');
    expect(rule.activations).toStrictEqual([
      { normal: 'error', target: 'effectPreset', test: 'off' },
      { normal: 'error', target: 'effectTsgoConfig', test: 'off' },
    ]);
    expect(rule.docsUrl).toBe('https://tsgo.example/rules/a-rule.md');
  });

  it('normalizes print-config deny, warn, and allow, including the typescript alias', () => {
    expect(ruleNamed(list, '@typescript-eslint/array-type').activations).toStrictEqual([
      { normal: 'warn', target: 'baseConfig', test: 'off' },
    ]);
    expect(ruleNamed(list, 'vitest/x').activations).toStrictEqual([
      { normal: 'off', target: fullCompositionTarget, test: 'error' },
    ]);
  });

  it('credits presets only with the built-in rules they set explicitly', () => {
    const presetTargets = new Set([
      'generalPreset',
      'effectPreset',
      'effectReactPreset',
      'boundariesPreset',
    ]);
    const presetBuiltIns = list.rules
      .filter((rule) => rule.source === 'oxlint')
      .flatMap((rule) =>
        rule.activations
          .filter((activation) => presetTargets.has(activation.target))
          .map((activation) => `${activation.target}:${rule.name}:${activation.normal}`),
      );
    expect(presetBuiltIns).toStrictEqual([
      'generalPreset:no-nested-ternary:error',
      'effectPreset:no-shadow:off',
    ]);
    expect(ruleNamed(list, 'no-shadow').description).toBe('Shadow note.');
  });

  it('fails when a built preset disagrees with the manifest', () => {
    expect(() => buildRuleList(inputs({ 'pkg/keep-me': 'warn' }))).toThrow(
      /effectPreset in the built package disagrees.*built pkg\/keep-me=warn.*source pkg\/keep-me=error/u,
    );
  });

  it('fails when a built tsgo config lacks the policy test-file override', () => {
    const missingOverride = {
      ...inputs(),
      configs: { ...inputs().configs, effectTsgoConfig: { rules: tsgoFragment.rules } },
    };
    expect(() => buildRuleList(missingOverride)).toThrow(
      /effectTsgoConfig in the built package disagrees.*built tests effecttsgo\/a-rule=error.*source tests effecttsgo\/a-rule=off/u,
    );
  });

  it('fails when a built tsgo config changes the policy test-file severity', () => {
    const changedOverride = {
      ...inputs(),
      configs: {
        ...inputs().configs,
        effectTsgoConfig: {
          overrides: testOverride({ 'effecttsgo/a-rule': 'warn' }),
          rules: tsgoFragment.rules,
        },
      },
    };
    expect(() => buildRuleList(changedOverride)).toThrow(
      /effectTsgoConfig in the built package disagrees.*built tests effecttsgo\/a-rule=warn.*source tests effecttsgo\/a-rule=off/u,
    );
  });

  it('fails on a configured built-in rule oxlint does not list', () => {
    const unknownBuiltIn = { ...inputs(), oxlintItems: inputs().oxlintItems.slice(1) };
    expect(() => buildRuleList(unknownBuiltIn)).toThrow(/eqeqeq is configured/u);
  });
});

describe('normalizeSeverity', () => {
  it.for([
    ['deny', 'error'],
    ['warn', 'warn'],
    ['allow', 'off'],
    ['error', 'error'],
    ['off', 'off'],
  ] as const)('maps %s to %s', ([spelling, severity]) => {
    expect(normalizeSeverity([spelling, {}])).toBe(severity);
  });

  it('rejects an unknown spelling', () => {
    expect(() => normalizeSeverity('bogus')).toThrow(/Unknown rule severity/u);
  });
});

describe('renderRulesMarkdown', () => {
  it('renders the golden page', () => {
    const list: RuleList = {
      rules: [
        {
          activations: [
            { normal: 'error', target: 'effectPreset', test: 'error' },
            { normal: 'error', target: 'baseConfig', test: 'off' },
          ],
          category: 'effect',
          description: 'Flags `A | B` and Effect<A> | pipes.',
          docsUrl: null,
          example: null,
          fix: 'use `x`.',
          fixable: null,
          name: 'pkg/rule',
          reference: 'ADR-001.',
          source: 'package',
        },
        {
          activations: [{ normal: 'warn', target: 'effectTsgoConfig', test: 'warn' }],
          category: 'style',
          description: 'Upstream text.',
          docsUrl: 'https://tsgo.example/a.md',
          example: { diagnostics: [], sourceText: '' },
          fix: null,
          fixable: true,
          name: 'effecttsgo/a',
          reference: null,
          source: 'tsgo',
        },
        {
          activations: [{ normal: 'off', target: 'baseConfig', test: 'error' }],
          category: 'restriction',
          description: null,
          docsUrl: 'https://oxc.example/x',
          example: null,
          fix: null,
          fixable: false,
          name: 'x',
          reference: null,
          source: 'oxlint',
        },
      ],
      targets: ['effectPreset', 'baseConfig'],
      tsgoAttribution: 'MIT, Copyright (c) Test',
      tsgoVersion: '9.9.9',
    };

    expect(renderRulesMarkdown(list)).toBe(
      [
        '# Rules reference',
        '',
        '<!-- Generated by `pnpm gen:rules-page` from scripts/checks/generate-rules-page.ts. Do not edit by hand. -->',
        '',
        'This page lists every rule that at least one shipped preset or config turns on. It is generated from the rule manifest, the pinned `@effect/tsgo` policy, and the root oxlint engine. Regenerate it with `pnpm gen:rules-page`; `pnpm check` fails when it is stale. To search and filter the same list, run `pnpm rules:view`.',
        '',
        'Severity reads `normal / tests` when test files differ, where tests means files that match the test-file overrides. The presets, configs, and compositions are:',
        '',
        '- `effectPreset`',
        '- `baseConfig`',
        '',
        'The tsgo descriptions come from `@effect/tsgo` 9.9.9 (MIT, Copyright (c) Test).',
        '',
        '## Package rules (1)',
        '',
        'Rules this package implements. What it catches is the manifest note; the fix is the rule message.',
        '',
        '| Rule | Presets and configs | Severity | What it catches | Docs |',
        '| --- | --- | --- | --- | --- |',
        '| `pkg/rule` | `effectPreset`, `baseConfig` | `effectPreset`: error<br>`baseConfig`: error / off | Flags `A \\| B` and Effect&lt;A> \\| pipes. **Fix:** use `x`. | Ref: ADR-001. |',
        '',
        '## tsgo rules (1)',
        '',
        'Rules delegated to `@effect/tsgo`, which run only on the patched oxlint route. Descriptions are the upstream text; tsgo rules the policy sets off everywhere are not listed.',
        '',
        '| Rule | Presets and configs | Severity | What it catches | Docs |',
        '| --- | --- | --- | --- | --- |',
        '| `effecttsgo/a` | `effectTsgoConfig` | warn | Upstream text. | [docs](https://tsgo.example/a.md) |',
        '',
        '## Built-in oxlint rules (1)',
        '',
        'Built-in rules come from `oxlint --print-config` on `baseConfig` and on the base, Vitest, and Node runtime composition, plus the built-in rules a preset sets explicitly.',
        '',
        '| Rule | Presets and configs | Severity | What it catches | Docs |',
        '| --- | --- | --- | --- | --- |',
        '| `x` | `baseConfig` | off / error | Category: `restriction`. | [docs](https://oxc.example/x) |',
        '',
      ].join('\n'),
    );
  });
});
