// oxlint-disable-next-line import/no-default-export -- oxlint loads JS plugins via default export
export { plugin, plugin as default, pluginName, rules } from './plugin.js';
export {
  collectionRuleNames,
  implementedCustomRuleNames,
  linteffectSourceRuleNames,
  deriveOmittedNonErrorRuleAllowlist,
  manifestCollectionsForConfiguredFragment,
  ruleManifest,
  styleAtErrorExceptions,
  tsgoOwnedChecks,
} from './rule-manifest.js';
export type { TsgoRuleId } from './generated/tsgo-policy.js';
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
  effectBoundaryRules,
  effectTsgoConfig,
  type EffectTsgoConfig,
  jsdocConfig,
  nodeRuntimeConfig,
  unicornConfig,
  vitestConfig,
} from './configs/index.js';
export {
  boundariesPreset,
  effectPreset,
  effectReactPreset,
  type EffectPresetConfig,
  generalPreset,
  type PresetConfig,
  type RuleConfig,
  type RuleSeverity,
} from './presets/index.js';
