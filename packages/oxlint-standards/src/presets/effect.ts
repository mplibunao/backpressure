import { composeLintConfigs } from '#oxlint-standards/configs/compose.js';
import { effectTsgoConfig } from '#oxlint-standards/configs/effect-tsgo.js';
import { type EffectPresetConfig, presetJsPlugins, presetRulesForDomain } from './shared.js';

const composed = composeLintConfigs(
  {
    jsPlugins: [...presetJsPlugins],
    rules: {
      ...presetRulesForDomain('effect'),
      // Idiomatic Effect.gen shadows bindings and has generators without a yield.
      'no-shadow': 'off',
      'require-yield': 'off',
    },
  },
  effectTsgoConfig,
);

const missingField = (field: string): never => {
  throw new Error(`effectPreset composition lost its ${field}.`);
};

// The full Effect config. Selecting it on an unpatched oxlint fails with an unknown `effecttsgo`
// plugin, which is intended: the delegated half cannot run without the patch.
export const effectPreset: EffectPresetConfig = {
  ...composed,
  jsPlugins: composed.jsPlugins ?? missingField('jsPlugins'),
  options: composed.options ?? missingField('options'),
  overrides: composed.overrides ?? missingField('overrides'),
  plugins: composed.plugins ?? missingField('plugins'),
  rules: composed.rules ?? missingField('rules'),
};
