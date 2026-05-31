import { definePreset, presetRulesForDomain } from './shared.js';

export const generalPreset = definePreset(
  presetRulesForDomain('general', { includeBuiltIn: true }),
);
