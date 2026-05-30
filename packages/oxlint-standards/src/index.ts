export { plugin, plugin as default, pluginName, rules } from './plugin.js';
export {
  implementedCustomRuleNames,
  lspOwnedChecks,
  linteffectSourceRuleNames,
  ruleManifest,
} from './rule-manifest.js';
export type {
  RuleDisposition,
  RuleDomain,
  RuleGating,
  RuleManifestEntry,
  RuleParityStatus,
  RuleSourceOwnership,
  RuleTestSource,
} from './rule-manifest.js';
export {
  boundariesPreset,
  effectPreset,
  effectReactPreset,
  generalPreset,
  type PresetConfig,
  type RuleConfig,
  type RuleSeverity,
} from './presets/index.js';
