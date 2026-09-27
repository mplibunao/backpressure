import type { OxlintConfig } from 'oxlint';
import { describe, expect, it, vi } from 'vitest';

import { jsdocConfig } from './jsdoc.js';

vi.setConfig({ testTimeout: 1000 });

// Cast to OxlintConfig so optional fields absent from the narrowed literal type are accessible.
const config = jsdocConfig as OxlintConfig;
const rules = config.rules ?? {};

const enabledValidateRules = [
  'jsdoc/check-access',
  'jsdoc/check-tag-names',
  'jsdoc/empty-tags',
  'jsdoc/require-param',
  'jsdoc/require-returns',
] as const;
const expectedJsdocCatalogRules = [
  'jsdoc/check-access',
  'jsdoc/check-property-names',
  'jsdoc/check-tag-names',
  'jsdoc/empty-tags',
  'jsdoc/implements-on-classes',
  'jsdoc/no-defaults',
  'jsdoc/require-param',
  'jsdoc/require-param-description',
  'jsdoc/require-param-name',
  'jsdoc/require-param-type',
  'jsdoc/require-property',
  'jsdoc/require-property-description',
  'jsdoc/require-property-name',
  'jsdoc/require-property-type',
  'jsdoc/require-returns',
  'jsdoc/require-returns-description',
  'jsdoc/require-returns-type',
  'jsdoc/require-yields',
] as const;

describe('jsdoc config fragment', () => {
  it('declares the jsdoc plugin for base composition', () => {
    expect(config.plugins).toStrictEqual(['jsdoc']);
  });

  it('lists every current oxlint jsdoc rule explicitly in the silence wall', () => {
    expect(Object.keys(rules).toSorted()).toStrictEqual([...expectedJsdocCatalogRules]);
  });

  it('enables only the validate-where-documented jsdoc rules', () => {
    const activeRules = Object.entries(rules)
      .filter(([, setting]) => setting !== 'off')
      .map(([ruleName]) => ruleName)
      .toSorted();

    expect(activeRules).toStrictEqual([...enabledValidateRules].toSorted());
  });

  it('silences every non-validate jsdoc rule globally', () => {
    const enabledRuleNames = new Set<string>(enabledValidateRules);
    const inactiveRuleSeverities = expectedJsdocCatalogRules
      .filter((ruleName) => !enabledRuleNames.has(ruleName))
      .map((ruleName) => [ruleName, rules[ruleName]]);

    expect(inactiveRuleSeverities).toStrictEqual(
      expectedJsdocCatalogRules
        .filter((ruleName) => !enabledRuleNames.has(ruleName))
        .map((ruleName) => [ruleName, 'off']),
    );
  });
});
