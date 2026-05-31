import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it, vi } from 'vitest';

import { catalogRules } from '../rule-catalog.js';
import { presetEntriesForDomains } from '../rule-manifest.js';
import { ruleMessage } from '../rule-messages.js';
import { boundariesPreset } from './boundaries.js';
import { effectPreset } from './effect.js';
import { effectReactPreset } from './effect-react.js';
import { generalPreset } from './general.js';
import { pluginRuleName } from './shared.js';

vi.setConfig({ testTimeout: 1000 });
RuleTester.describe = describe;
RuleTester.it = it;

// Name is constrained to keyof catalogRules, so the entry is always present.
// The typeof guard is required because Record<string, Rule> returns Rule | undefined under noUncheckedIndexedAccess.
const requireCatalogRule = (name: keyof typeof catalogRules) => {
  const rule = catalogRules[name];
  if (typeof rule === 'undefined') {
    throw new Error(`Catalog rule missing: ${name}`);
  }
  return rule;
};

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' }, sourceType: 'module' },
});

const optionInternalTagSource =
  "import * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);";

const enabledRuleNames = (rules: Record<string, unknown>): Array<string> =>
  Object.entries(rules)
    .filter(([, value]) => value !== 'off')
    .map(([name]) => name);

describe('presets', () => {
  it('assembles the gen-first effect preset with required native suppressions', () => {
    const rules = enabledRuleNames(effectPreset.rules);
    const forbiddenRules = [
      pluginRuleName('no-effect-fn-generator'),
      pluginRuleName('no-if-statement'),
      pluginRuleName('no-match-orelse'),
      pluginRuleName('no-ternary'),
    ];

    expect(rules).toStrictEqual(
      expect.arrayContaining(
        presetEntriesForDomains(['effect']).map((entry) => pluginRuleName(entry.name)),
      ),
    );
    expect(effectPreset.rules['require-yield']).toBe('off');
    expect(effectPreset.rules['no-shadow']).toBe('off');
    expect(forbiddenRules.filter((ruleName) => ruleName in effectPreset.rules)).toStrictEqual([]);
  });

  it('keeps stack-neutral general separate from Effect carve-outs', () => {
    expect(generalPreset.rules).toHaveProperty(pluginRuleName('prevent-dynamic-imports'));
    expect(generalPreset.rules).toHaveProperty('no-nested-ternary');
    expect(
      ['require-yield', 'no-shadow', pluginRuleName('no-react-state')].filter(
        (ruleName) => ruleName in generalPreset.rules,
      ),
    ).toStrictEqual([]);
  });

  it('keeps Effect React rules in effect-react only', () => {
    expect(effectReactPreset.rules).toHaveProperty(pluginRuleName('no-family-collection-read'));
    expect(effectReactPreset.rules).toHaveProperty(pluginRuleName('no-naked-object-state-update'));
    expect(effectPreset.rules).not.toHaveProperty(pluginRuleName('no-family-collection-read'));
  });

  it('keeps boundary rules opt-in', () => {
    const boundaryRule = pluginRuleName('no-cross-package-relative-imports');

    expect(boundariesPreset.rules).toHaveProperty(boundaryRule);
    expect(
      [effectPreset.rules, generalPreset.rules].filter((rules) => boundaryRule in rules),
    ).toStrictEqual([]);
  });

  it('keeps Effect data-module tag checks owned by the internal-tag rule', () => {
    expect(effectPreset.rules).toHaveProperty(pluginRuleName('no-manual-tag-check'));
    expect(effectPreset.rules).toHaveProperty(pluginRuleName('no-effect-internal-tags'));
  });
});

ruleTester.run(
  'preset duplicate intent: no-manual-tag-check',
  requireCatalogRule('no-manual-tag-check'),
  {
    invalid: [],
    valid: [optionInternalTagSource],
  },
);

ruleTester.run(
  'preset duplicate intent: no-effect-internal-tags',
  requireCatalogRule('no-effect-internal-tags'),
  {
    invalid: [
      {
        code: optionInternalTagSource,
        errors: [{ message: ruleMessage('no-effect-internal-tags') }],
      },
    ],
    valid: [],
  },
);
