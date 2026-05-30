import { pluginRuleName, presetJsPlugins, type PresetConfig } from './shared.js';

export const effectPreset = {
  jsPlugins: presetJsPlugins,
  rules: {
    [pluginRuleName('no-effect-as')]: 'error',
    'no-shadow': 'off',
    'require-yield': 'off',
  },
} satisfies PresetConfig;
