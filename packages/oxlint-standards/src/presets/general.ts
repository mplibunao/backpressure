import { presetJsPlugins, type PresetConfig } from './shared.js';

export const generalPreset = {
  jsPlugins: presetJsPlugins,
  rules: {},
} satisfies PresetConfig;
