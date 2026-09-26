import { catalogRules } from './rule-catalog.js';

interface PublicOxlintPlugin {
  readonly meta: {
    readonly name: string;
  };
  readonly rules: Record<string, unknown>;
}

export const pluginName = '@mplibunao/oxlint-standards';

// Rule shape is validated via the Rule type at each definition site in rule-catalog.ts.
export const rules: PublicOxlintPlugin['rules'] = catalogRules;

export const plugin: PublicOxlintPlugin = {
  meta: {
    name: pluginName,
  },
  rules,
};

// oxlint-disable-next-line import/no-default-export -- oxlint loads JS plugins via default export
export default plugin;
