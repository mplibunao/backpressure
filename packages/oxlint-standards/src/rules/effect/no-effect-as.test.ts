import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import { noEffectAsRuleImplementation } from './no-effect-as-internal.js';
import { noEffectAsMessage } from './no-effect-as-message.js';

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
      code: "import * as Effect from 'effect/Effect';\nlet run = () => Effect.as(value);",
      errors: [{ message: noEffectAsMessage }],
    },
    {
      code: "import * as Effect from 'effect/Effect';\nvar run = () => Effect.as(value);",
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
    "import * as Effect from 'effect/Effect';\nEffect.as(setState(value), undefined);",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.as(value); }",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.as(value);",
    // Regression coverage: nested Effect.as inside wrapper-owned expression must not double-report.
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.map(Effect.as(value), f);",
    // Ownership regression: Effect.as inside standalone pipe wrapper alias must not double-report.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.as(value), Effect.map(f));",
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.as(Atom.set(atom, value), undefined);",
    "import * as Option from 'effect/Option';\nOption.as(value);",
    // Ownership regression: barrel 'effect' namespace import with non-Effect alias must not trigger no-effect-as.
    "import * as Option from 'effect';\nOption.as(value);",
    "import * as Effect from 'effect/Effect';\nEffect['as'](value);",
    'const Effect = { as: (value: unknown) => value };\nEffect.as(value);',
    "import { Effect } from 'effect';\nEffect.as(value);",
    "import * as Effect from 'effect/Effect';\nfunction f(Effect: { as(value: unknown): unknown }) {\n  Effect.as(value);\n}",
    "import * as Effect from 'effect/Effect';\nconst run = () => {\n  const Effect = { as: (value: unknown) => value };\n  Effect.as(value);\n};",
  ],
});
