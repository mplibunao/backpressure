import { pluginName } from '../plugin.js';

export type RuleSeverity = 'off' | 'warn' | 'error';
export type RuleConfig = RuleSeverity | readonly [RuleSeverity, ...ReadonlyArray<unknown>];

export interface PresetConfig {
  readonly jsPlugins: readonly [typeof pluginName];
  readonly rules: Record<string, RuleConfig>;
}

export const presetJsPlugins = [pluginName] as const;

export const pluginRuleName = (ruleName: string): `${typeof pluginName}/${string}` =>
  `${pluginName}/${ruleName}`;
