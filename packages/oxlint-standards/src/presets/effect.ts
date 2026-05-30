import { definePreset, presetRulesForDomain } from './shared.js';

export const effectPreset = definePreset({
  ...presetRulesForDomain('effect'),
  'no-shadow': 'off',
  'require-yield': 'off',
});
