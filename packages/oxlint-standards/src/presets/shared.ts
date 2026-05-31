import { pluginName } from '../plugin.js';
import type { RuleDomain } from '../rule-manifest.js';
import {
  oxlintSeverityForManifestEntry,
  presetEntriesForDomains,
} from '../rule-manifest-selection.js';

export type RuleSeverity = 'off' | 'warn' | 'error';
export type RuleConfig = RuleSeverity | readonly [RuleSeverity, ...ReadonlyArray<unknown>];

export interface PresetConfig {
  readonly jsPlugins: readonly [typeof pluginName];
  readonly rules: Record<string, RuleConfig>;
}

export const presetJsPlugins = [pluginName] as const;

export const pluginRuleName = (ruleName: string): `${typeof pluginName}/${string}` =>
  `${pluginName}/${ruleName}`;

export const presetRulesForDomain = (
  domain: RuleDomain,
  options: { readonly includeBuiltIn?: boolean } = {},
): Record<string, RuleConfig> => {
  const rules: Record<string, RuleConfig> = {};

  for (const entry of presetEntriesForDomains([domain], options)) {
    const ruleName = entry.disposition === 'built-in' ? entry.name : pluginRuleName(entry.name);
    rules[ruleName] = oxlintSeverityForManifestEntry(entry);
  }

  return rules;
};

export const definePreset = (rules: Record<string, RuleConfig>): PresetConfig => ({
  jsPlugins: presetJsPlugins,
  rules,
});
