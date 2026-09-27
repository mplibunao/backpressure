import type { OxlintConfig } from 'oxlint';

import { pluginName } from '#oxlint-standards/plugin.js';
import type { RuleDomain } from '#oxlint-standards/rule-manifest.js';
import {
  oxlintSeverityForManifestEntry,
  presetEntriesForDomains,
} from '#oxlint-standards/rule-manifest-selection.js';

export type RuleSeverity = 'off' | 'warn' | 'error';
export type RuleConfig = RuleSeverity | readonly [RuleSeverity, ...(readonly unknown[])];

// The AST-only presets: this package's own rules and nothing else.
export interface PresetConfig {
  readonly jsPlugins: readonly [typeof pluginName];
  readonly rules: Record<string, RuleConfig>;
}

// The full Effect config: custom rules plus the delegated tsgo plugin, type-aware option, every
// tsgo severity, and the test-file override. It needs the patched oxlint engine.
export type EffectPresetConfig = OxlintConfig & {
  readonly jsPlugins: NonNullable<OxlintConfig['jsPlugins']>;
  readonly options: NonNullable<OxlintConfig['options']>;
  readonly overrides: NonNullable<OxlintConfig['overrides']>;
  readonly plugins: NonNullable<OxlintConfig['plugins']>;
  readonly rules: NonNullable<OxlintConfig['rules']>;
};

export const presetJsPlugins = [pluginName] as const;

export const pluginRuleName = (ruleName: string): `${typeof pluginName}/${string}` =>
  `${pluginName}/${ruleName}`;

// Selects custom rows and, when asked, built-in rows. Delegated tsgo rows never reach a preset:
// they belong to effectTsgoConfig and must not gain this package's rule prefix.
export const presetRulesForDomain = (
  domain: RuleDomain,
  options: { readonly includeBuiltIn?: boolean } = {},
): Record<string, RuleSeverity> => {
  const rules: Record<string, RuleSeverity> = {};

  for (const entry of presetEntriesForDomains([domain], options)) {
    if (entry.disposition === 'tsgo-delegated') {
      throw new Error(`Delegated rule ${entry.name} cannot join the ${domain} preset.`);
    }
    const ruleName = entry.disposition === 'built-in' ? entry.name : pluginRuleName(entry.name);
    rules[ruleName] = oxlintSeverityForManifestEntry(entry);
  }

  return rules;
};

export const definePreset = (rules: Record<string, RuleConfig>): PresetConfig => ({
  jsPlugins: presetJsPlugins,
  rules,
});
