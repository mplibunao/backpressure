import { noEffectAsRuleImplementation } from './no-effect-as-internal.js';
export { noEffectAsMessage } from './no-effect-as-message.js';

interface PublicNoEffectAsRule {
  readonly create: (...args: Array<never>) => unknown;
  readonly meta: {
    readonly docs: {
      readonly description: string;
      readonly recommended: string;
    };
    readonly messages: {
      readonly avoidEffectAs: string;
    };
    readonly type: string;
  };
}

export const noEffectAsRule: PublicNoEffectAsRule = noEffectAsRuleImplementation;

export default noEffectAsRule;
