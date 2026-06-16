// oxlint-disable-next-line import/no-default-export -- oxlint loads JS plugins via default export
export { plugin, plugin as default, pluginName, rules } from './plugin.js';
export {
  collectionRuleNames,
  implementedCustomRuleNames,
  lspOwnedChecks,
  linteffectSourceRuleNames,
  deriveOmittedNonErrorRuleAllowlist,
  ruleManifest,
} from './rule-manifest.js';
export type {
  RuleCollection,
  RuleConfigSeverity,
  RuleDisposition,
  RuleDomain,
  RuleGating,
  RuleManifestEntry,
  RuleManifestSeverity,
  RuleParityStatus,
  RuleRationaleClass,
  RuleSourceOwnership,
  RuleTestSource,
} from './rule-manifest.js';
export {
  baseConfig,
  composeLintConfigs,
  nodeRuntimeConfig,
  vitestConfig,
} from './configs/index.js';
export {
  boundariesPreset,
  effectPreset,
  effectReactPreset,
  generalPreset,
  type PresetConfig,
  type RuleConfig,
  type RuleSeverity,
} from './presets/index.js';
