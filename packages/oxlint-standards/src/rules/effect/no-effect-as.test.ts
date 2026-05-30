import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import { noEffectAsRuleImplementation } from './no-effect-as-internal.js';
import { noEffectAsMessage } from './no-effect-as.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
    sourceType: 'module',
  },
});

ruleTester.run('no-effect-as', noEffectAsRuleImplementation, {
  invalid: [
    {
      code: "import * as Effect from 'effect/Effect';\nEffect.as(value);",
      errors: [{ message: noEffectAsMessage }],
    },
    {
      code: "import * as E from 'effect/Effect';\nfoo(E.as(value));",
      errors: [{ messageId: 'avoidEffectAs' }],
    },
    {
      code: "import * as Effect from 'effect';\nconst mapped = pipe(effect, Effect.as({ ok: true }));",
      errors: [{ message: noEffectAsMessage }],
    },
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.asVoid(value);",
    "import * as Option from 'effect/Option';\nOption.as(value);",
    "import * as Effect from 'effect/Effect';\nEffect['as'](value);",
    'const Effect = { as: (value: unknown) => value };\nEffect.as(value);',
    "import { Effect } from 'effect';\nEffect.as(value);",
    "import * as Effect from 'effect/Effect';\nfunction f(Effect: { as(value: unknown): unknown }) {\n  Effect.as(value);\n}",
    "import * as Effect from 'effect/Effect';\nconst run = () => {\n  const Effect = { as: (value: unknown) => value };\n  Effect.as(value);\n};",
  ],
});
