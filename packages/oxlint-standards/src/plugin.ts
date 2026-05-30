import { noEffectAsRuleImplementation } from './rules/effect/no-effect-as-internal.js';

interface PublicOxlintPlugin {
  readonly meta: {
    readonly name: string;
  };
  readonly rules: Record<string, unknown>;
}

interface CreateOnlyRule {
  readonly create: (...args: Array<never>) => unknown;
  readonly createOnce?: never;
}

export const pluginName = '@mplibunao/oxlint-standards';

const internalRules = {
  'no-effect-as': noEffectAsRuleImplementation,
} satisfies Record<string, CreateOnlyRule>;

export const rules: PublicOxlintPlugin['rules'] = internalRules;

export const plugin: PublicOxlintPlugin = {
  meta: {
    name: pluginName,
  },
  rules,
};

export default plugin;
