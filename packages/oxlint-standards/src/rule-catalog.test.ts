/* oxlint-disable max-lines -- The catalog parity matrix intentionally keeps all rule examples together. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it, vi } from 'vitest';

import { catalogRuleDefinitions, catalogRules } from './rule-catalog.js';
import { ruleMessage } from './rule-messages.js';

vi.setConfig({ testTimeout: 1000 });
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' }, sourceType: 'module' },
});

interface CatalogFixture {
  readonly code: string;
  readonly expectedErrors?: number;
  readonly filename?: string;
}

const upstreamFixtureRoot = join(process.cwd(), 'test-fixtures', 'linteffect', 'tests', 'fixtures');

const sourceFixture = (ruleName: string, fileName: string): string =>
  readFileSync(join(upstreamFixtureRoot, ruleName, fileName), 'utf8');

const toCatalogFixture = (fixture: string | CatalogFixture): CatalogFixture =>
  typeof fixture === 'string' ? { code: fixture } : fixture;

const run = (
  name: keyof typeof catalogRules,
  cases: {
    readonly invalid: ReadonlyArray<string | CatalogFixture>;
    readonly valid: ReadonlyArray<string | CatalogFixture>;
  },
): void => {
  const rule = catalogRules[name];
  // Name is constrained to keyof catalogRules, so this guard is a type-narrowing invariant — never fires at runtime.
  if (typeof rule === 'undefined') {
    throw new Error(`Catalog rule missing: ${name}`);
  }
  ruleTester.run(name, rule, {
    invalid: cases.invalid.map((fixture) => {
      const catalogFixture = toCatalogFixture(fixture);
      const { expectedErrors = 1, ...testCase } = catalogFixture;
      return {
        ...testCase,
        errors: Array.from({ length: expectedErrors }, () => ({ message: ruleMessage(name) })),
      };
    }),
    valid: cases.valid.map(toCatalogFixture),
  });
};

run('no-barrel-import', {
  invalid: [
    "import { Effect } from 'effect';\nEffect.succeed(1);",
    "import * as Effect from 'effect';\nEffect.succeed(1);",
  ],
  valid: [
    "import type { Effect } from 'effect';\ntype A = Effect.Effect<number>;",
    "import Effect from 'effect';\nconsole.info(Effect);",
    "import 'effect';",
    "import * as Effect from 'effect/Effect';\nEffect.succeed(1);",
  ],
});

run('effect-no-multiple-provide', {
  invalid: [
    "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A), Effect.provide(B));",
    "import * as E from 'effect/Effect';\nimport { pipe } from 'effect/Function';\npipe(effect, E.provide(A), E.provide(B));",
    "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A)).pipe(Effect.provide(B));",
    // Behavior regression: three provides across inner+outer chain must report exactly once (not twice).
    "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A), Effect.provide(B)).pipe(Effect.provide(C));",
    // Behavior regression: nested standalone pipe(pipe(...)) must be detected as one composed pipeline.
    "import * as Effect from 'effect/Effect';\nimport { pipe } from 'effect/Function';\npipe(pipe(effect, Effect.provide(A)), Effect.provide(B));",
    // Guard regression: inner standalone pipe with 2+ provides must report exactly once (not twice).
    // The inner pipe must not be reported separately, even though it also exceeds the provide threshold.
    {
      code: "import * as Effect from 'effect/Effect';\nimport { pipe } from 'effect/Function';\npipe(pipe(effect, Effect.provide(A), Effect.provide(B)), Effect.provide(C));",
      expectedErrors: 1,
    },
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.provide(effect, Layer.mergeAll(A, B));",
    "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A), Effect.map(() => Effect.provide(B)));",
    'const Effect = { provide: (x: unknown) => x };\neffect.pipe(Effect.provide(A), Effect.provide(B));',
    "import * as Effect from 'effect/Effect';\nconst pipe = (...steps: Array<unknown>) => steps;\npipe(effect, Effect.provide(A), Effect.provide(B));",
    // Ownership regression: const pipe alias with multiple provides is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nimport { pipe } from 'effect/Function';\nconst run = pipe(pipe(effect, Effect.provide(A)), Effect.provide(B));",
    // Exactly one provide across a chained member pipe must not report.
    "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A)).pipe(Effect.map(f));",
    // A single provide in a simple member pipe is valid.
    "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A));",
    // Single standalone provide — keeps the boundary test symmetric for both pipe forms.
    "import * as Effect from 'effect/Effect';\nimport { pipe } from 'effect/Function';\npipe(effect, Effect.provide(A));",
  ],
});

run('no-inline-schema-compile', {
  invalid: [
    "import * as Schema from 'effect/Schema';\nconst User = Schema.Struct({ name: Schema.String });\nexport const parseUser = (input: unknown) => Schema.decodeUnknownEffect(User)(input);",
    "import * as Schema from 'effect/Schema';\nexport const parseUser = (input: unknown) => Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))(input);",
    "import * as Schema from 'effect/Schema';\nexport const parseUser = (input: unknown) => Schema.decodeUnknownEffect(models.User)(input);",
    "import * as Schema from 'effect/Schema';\nexport const parseJson = (raw: string) => Schema.decodeSync(Schema.fromJsonString(User))(raw);",
    "import * as Schema from 'effect/Schema';\nexport const parseUser = (raw: unknown) => Schema.decodeSync(Schema.optional(User))(raw);",
    "import * as Schema from 'effect/Schema';\nexport const parseUser = (raw: unknown) => Schema.decodeSync(Schema.transform(User, f))(raw);",
    "import * as Schema from 'effect/Schema';\nexport const parseJson = (raw: string) => Schema.decodeSync(Schema.fromJsonString(Schema.optional(User)))(raw);",
  ],
  valid: [
    "import * as Schema from 'effect/Schema';\nexport const parseJson = (raw: string) => Schema.decodeSync(Schema.fromJsonString(makeSchema()))(raw);",
    "import * as Schema from 'effect/Schema';\nconst User = Schema.Struct({ name: Schema.String });\nconst decodeUser = Schema.decodeUnknownEffect(User);\nexport const parseUser = (input: unknown) => decodeUser(input);",
    "import * as Schema from 'effect/Schema';\nexport const parseWith = <A, I>(schema: Schema.Codec<A, I>, input: unknown) => Schema.decodeUnknownEffect(schema)(input);",
    "import * as Schema from 'effect/Schema';\nexport const makeDecoder = <A, I>(schema: Schema.Codec<A, I>) => Schema.decodeUnknownEffect(schema);",
    "import * as Schema from 'effect/Schema';\nexport const parseUser = (input: unknown) => Schema.decodeUnknownEffect(makeSchema())(input);",
  ],
});

run('no-family-collection-read', {
  invalid: [
    sourceFixture('no-family-collection-read', 'invalid-get.ts'),
    sourceFixture('no-family-collection-read', 'invalid-get-get.ts'),
    sourceFixture('no-family-collection-read', 'invalid-atom-get.ts'),
  ],
  valid: [
    sourceFixture('no-family-collection-read', 'valid-keyed-source.ts'),
    sourceFixture('no-family-collection-read', 'valid-outside-family.ts'),
  ],
});

run('no-naked-object-state-update', {
  invalid: [
    sourceFixture('no-naked-object-state-update', 'invalid-spread.ts'),
    sourceFixture('no-naked-object-state-update', 'invalid-from-entries.ts'),
    {
      code: sourceFixture('no-naked-object-state-update', 'invalid-object-assign.ts'),
      expectedErrors: 2,
    },
    {
      code: sourceFixture('no-naked-object-state-update', 'invalid-json-transition.ts'),
      expectedErrors: 2,
    },
    "import * as Ref from 'effect/Ref';\nRef.modify(stateRef, (state) => { return { ...state, ready: true }; });",
  ],
  valid: [
    sourceFixture('no-naked-object-state-update', 'valid-effect-record-set.ts'),
    "import * as Ref from 'effect/Ref';\nRef.update(stateRef, (state) => state);",
    "import * as Ref from 'effect/Ref';\nRef.update(stateRef, (state) => Object.fromEntries(entries));",
    "import * as Ref from 'effect/Ref';\nRef.update(stateRef, (state) => Object.assign(state, patch));",
    "import * as Effect from 'effect/Effect';\nJSON.parse(payload);",
    // ContainsObjectSpread returns false for plain object with no spread — should not flag.
    "import * as Ref from 'effect/Ref';\nRef.update(stateRef, (s) => ({ count: s.count + 1 }));",
    "import * as Ref from 'effect/Ref';\nRef.update(stateRef, (state) => { return { count: state.count + 1 }; });",
  ],
});

run('no-effect-side-effect-wrapper', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.as(setState(value), undefined);",
    "import * as Effect from 'effect/Effect';\nEffect.zipRight(Effect.logInfo('x'), next);",
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.as(Atom.set(atom, value), undefined);",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.as(program, value);",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.zipRight(Effect.logInfo('x'), next);",
    // Ownership regression: side-effect wrapper inside pipe alias is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.zipRight(Effect.logInfo('x'), next), Effect.map(f));",
  ],
});

run('no-return-in-arrow', {
  invalid: ["import * as Effect from 'effect/Effect';\nitems.map((item) => { return item.id; });"],
  valid: [
    // Effect import is required because the exemption only matters when the rule is active.
    "import * as Effect from 'effect/Effect';\nimport * as Schema from 'effect/Schema';\nSchema.filter((value) => { return value !== null; }, { message: () => 'x' });",
    "import * as Effect from 'effect/Effect';\nimport * as S from 'effect/Schema';\nS.filter((value) => { return value !== null; }, { message: () => 'x' });",
  ],
});

run('no-unknown-boolean-coercion-helper', {
  invalid: [
    'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value === "boolean";\nMatch.value(input).pipe(Match.orElse(() => null));',
  ],
  valid: [
    'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value === "boolean";',
    'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value !== "boolean";\nMatch.value(input).pipe(Match.orElse(() => null));',
    'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value === "string";\nMatch.value(input).pipe(Match.orElse(() => null));',
    'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value === "boolean";\nMatch.value(input).pipe(Match.orElse(() => nullableValue));',
  ],
});

run('no-model-overlay-cast', {
  invalid: [
    sourceFixture('no-model-overlay-cast', 'invalid-named-type.ts'),
    "import * as Effect from 'effect/Effect';\nconst user = value as Readonly<User>;",
    "import * as Effect from 'effect/Effect';\nconst user = value as Domain.User;",
    "import * as Effect from 'effect/Effect';\nconst users = value as Array<User>;",
    "import * as Effect from 'effect/Effect';\nconst user = value as { id: string };",
  ],
  valid: [
    sourceFixture('no-model-overlay-cast', 'valid-as-const-literal.ts'),
    sourceFixture('no-model-overlay-cast', 'valid-as-const-tuple.ts'),
    'function read() { return value as Domain.User; }',
    'const user = makeUser(raw as User);',
    'items.map((raw) => raw as User);',
    // Let/var declarations must not fire: only const is flagged.
    "import * as Effect from 'effect/Effect';\nlet user = value as Domain.User;",
    "import * as Effect from 'effect/Effect';\nvar user = value as Domain.User;",
  ],
});

run('no-switch-statement', {
  invalid: [
    sourceFixture('no-switch-statement', 'invalid-switch.ts'),
    sourceFixture('no-switch-statement', 'invalid-switch-submodule-import.ts'),
    sourceFixture('no-switch-statement', 'invalid-switch-atom-react.ts'),
  ],
  valid: [
    sourceFixture('no-switch-statement', 'valid-match-value.ts'),
    sourceFixture('no-switch-statement', 'valid-switch-without-effect.ts'),
  ],
});

run('no-arrow-ladder', {
  invalid: ["import * as Effect from 'effect/Effect';\n((x) => ((y) => y)(x))(value);"],
  valid: [
    'const value = ((x) => ((y) => y)(x))(input);',
    // Curried non-arrow calls must stay valid and not be treated as inline IIFEs.
    "import * as Effect from 'effect/Effect';\ngetHandler()(value);",
  ],
});

run('no-atom-registry-effect-sync', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.sync(() => Atom.get(atom));",
  ],
  valid: ["import { Atom } from '@effect-atom/atom-react';\nAtom.get(atom);"],
});

run('no-branch-in-object', {
  invalid: [
    "import * as Option from 'effect/Option';\nconst value = { ready: Option.match(input, { onSome: () => true, onNone: () => false }) };",
    "import * as Match from 'effect/Match';\nconst value = { ready: Match.value(input).pipe(Match.when('a', () => true)) };",
    "import * as Either from 'effect/Either';\nconst value = { ready: Either.match(input, { onRight: () => true, onLeft: () => false }) };",
    "import * as Match from 'effect/Match';\nconst value = ((branch) => ({ ready: branch }))(Match.value(input).pipe(Match.when('a', () => true)));",
    "import * as Option from 'effect/Option';\nconst value = ((branch) => { return { ready: branch }; })(Option.match(input, { onSome: () => true, onNone: () => false }));",
    "import * as Either from 'effect/Either';\nconst value = (function (branch) { return { ready: branch }; })(Either.match(input, { onRight: () => true, onLeft: () => false }));",
    // Ownership regression: branch wrapped in a helper call inside an IIFE arg is source-covered via descendant scan.
    "import * as Option from 'effect/Option';\nconst value = ((branch) => ({ ready: branch }))(decorate(Option.match(input, { onSome: () => true, onNone: () => false })));",
  ],
  valid: [
    'const value = { ready: condition ? true : false };',
    "import * as Match from 'effect/Match';\nconst value = { ready: decorate(Match.value(input).pipe(Match.when('a', () => true))) };",
    "import * as Option from 'effect/Option';\nconst value = { ready: decorate(Option.match(input, { onSome: () => true, onNone: () => false })) };",
    "import * as Either from 'effect/Either';\nconst value = { ready: decorate(Either.match(input, { onRight: () => true, onLeft: () => false })) };",
    "import * as Option from 'effect/Option';\nconst value = { ready: ((branch) => branch)(Option.match(input, { onSome: () => true, onNone: () => false })) };",
  ],
});

run('no-call-tower', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.map(Effect.succeed(1), (n) => n);",
    "import * as Effect from 'effect/Effect';\nEffect.catchAll(Effect.tryPromise(fetchUser), handle);",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.map(program, (n) => n);",
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.succeed(value));",
  ],
});

run('no-effect-all-step-sequencing', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nEffect.all([Ref.set(ref, value)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nEffect.all([Ref.set(ref, value)]).pipe(Effect.asVoid);",
    "import * as Effect from 'effect/Effect';\nEffect.all([Effect.logInfo('done')], { concurrency: 1 });",
    // Atom.set from @effect-atom/atom-react counts as a state-changing sequential step.
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.all([Atom.set(atom, value)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Fiber from 'effect/Fiber';\nEffect.all([Fiber.interrupt(fiber)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as SubscriptionRef from 'effect/SubscriptionRef';\nEffect.all([SubscriptionRef.set(ref, value)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Reactivity from 'effect/Reactivity';\nEffect.all([Reactivity.invalidate(signal)], { concurrency: 1 });",
    // A pipeline reports when any direct step discards state-changing work with asVoid.
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nEffect.all([Ref.set(ref, value)]).pipe(Effect.map(f), Effect.asVoid);",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.all([program], { concurrency: 2 });",
    "import * as Effect from 'effect/Effect';\nEffect.all([Effect.sync(() => console.log('x'))], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nEffect.all([Effect.sync(() => setState(value))], { concurrency: 1 });",
    // Ownership regression: Effect.all inside pipe alias is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nconst run = pipe(Effect.all([Ref.set(ref, value)], { concurrency: 1 }), Effect.map(f));",
    "import * as Effect from 'effect/Effect';\nimport * as Fiber from 'effect/Fiber';\nEffect.all([Fiber.join(fiber)], { concurrency: 1 });",
  ],
});

run('no-effect-async', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.async((resume) => resume(Effect.succeed(1)));",
  ],
  valid: [
    'const Effect = { async: () => null };\nEffect.async();',
    // Ownership regression: Effect.async inside pipe alias is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.async(register), Effect.map(f));",
  ],
});

run('no-effect-bind', {
  invalid: ["import * as Effect from 'effect/Effect';\nEffect.bind('user', loadUser);"],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.map(program, f);",
    // Ownership regression: Effect.bind inside pipe wrapper alias is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.bind('user', loadUser), Effect.map(f));",
  ],
});

run('no-effect-call-in-effect-arg', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.succeed(1), f);",
    "import * as Effect from 'effect/Effect';\nEffect.provide(Effect.scoped(acquire), layer);",
    // Ownership regression: deep direct Effect arg (depth > 1) in expression-statement position has no enabled owner.
    "import * as Effect from 'effect/Effect';\nEffect.map(Effect.flatMap(Effect.succeed(1), f), g);",
    // Ownership regression: second-arg-only deep nesting is now owned here (no-effect-ladder first-arg only).
    "import * as Effect from 'effect/Effect';\nconst program = Effect.zipRight(program, Effect.map(Effect.succeed(1), f));",
    // Ownership regression: flatMap(flatMap) in expression-statement is no longer owned by no-flatmap-ladder.
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.flatMap(program, f), g);",
    // Ownership regression: flatten(map) in expression-statement has no other enabled owner.
    "import * as Effect from 'effect/Effect';\nEffect.flatten(Effect.map(program, f));",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, f);",
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.succeed(value));",
    // Const form: still owned by no-flatmap-ladder.
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.flatMap(Effect.succeed(1), f), g);",
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatten(Effect.map(program, f));",
    "import * as Effect from 'effect/Effect';\nEffect.orElse(Effect.flatMap(program, f), fallback);",
    "import * as Effect from 'effect/Effect';\nEffect.zipRight(Effect.logInfo('x'), next);",
    // Ownership regression: Atom.set is a side-effect; no-effect-side-effect-wrapper owns this shape.
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.zipRight(Atom.set(atom, value), Effect.succeed(next));",
    "import * as Effect from 'effect/Effect';\nEffect.as(Effect.succeed(1), value);",
    "import * as Effect from 'effect/Effect';\nEffect.bind('user', Effect.succeed(user));",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.map(Effect.succeed(1), f); }",
    // Ownership regression: Effect.map(Effect.succeed(...)) inside pipe alias is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.map(Effect.succeed(1), f), Effect.map(g));",
  ],
});

run('no-effect-do', {
  invalid: ["import * as Effect from 'effect/Effect';\nconst program = Effect.Do;"],
  valid: ['const Effect = { Do: {} };\nconst program = Effect.Do;'],
});

run('no-effect-ladder', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);",
    "import * as Effect from 'effect/Effect';\nconst program = Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy);",
    "import * as Effect from 'effect/Effect';\nfunction run() { if (ready) { return Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy); } return fallback; }",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.succeed(1), g);",
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.succeed(value));",
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.map(Effect.succeed(1), f), g);",
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.flatMap(Effect.succeed(1), f), g);",
    "import * as Effect from 'effect/Effect';\nlet program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);",
    "import * as Effect from 'effect/Effect';\nvar program = Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy);",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy); }",
    // Ownership regression: flatten(map) const is owned by no-flatmap-ladder, not no-effect-ladder.
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatten(Effect.map(Effect.succeed(1), f));",
    // Ownership regression: second-arg-only deep nesting is not owned by no-effect-ladder (first-arg only).
    "import * as Effect from 'effect/Effect';\nconst program = Effect.zipRight(program, Effect.map(Effect.succeed(1), f));",
    // Ownership regression: single-callee rules (no-effect-as, no-effect-bind) own these shapes.
    "import * as Effect from 'effect/Effect';\nconst program = Effect.as(Effect.map(Effect.succeed(1), f), value);",
    "import * as Effect from 'effect/Effect';\nconst program = Effect.bind('user', Effect.map(Effect.succeed(user), f));",
    // Ownership regression: non-first-arg deep nesting is not a ladder — first-arg depth is only 1.
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.map(program, Effect.succeed(1)), g);",
    // Ownership regression: no-effect-orElse-ladder owns this const form.
    "import * as Effect from 'effect/Effect';\nconst program = Effect.orElse(Effect.flatMap(Effect.succeed(1), f), fallback);",
    // Ownership regression: no-effect-side-effect-wrapper owns this const form.
    "import * as Effect from 'effect/Effect';\nconst program = Effect.zipRight(Effect.map(Effect.logInfo('x'), f), next);",
  ],
});

run('no-effect-never', {
  invalid: ["import * as Effect from 'effect/Effect';\nconst program = Effect.never;"],
  valid: ['const Effect = { never: {} };\nconst program = Effect.never;'],
});

run('no-effect-orElse-ladder', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.orElse(Effect.flatMap(program, f), fallback);",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.orElse(program, fallback);",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.orElse(Effect.flatMap(program, f), fallback); }",
  ],
});

run('no-effect-succeed-variable', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.succeed(value);",
    "import * as Effect from 'effect/Effect';\nEffect.succeed(1);",
    "import * as Effect from 'effect/Effect';\nEffect.succeed(value ?? fallback);",
    "import * as Effect from 'effect/Effect';\nlet run = () => Effect.succeed(value);",
    "import * as Effect from 'effect/Effect';\nvar run = () => Effect.succeed(value);",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.succeed('ready');",
    "import * as Effect from 'effect/Effect';\nEffect.succeed({ value });",
    "import * as Effect from 'effect/Effect';\nEffect.succeed([value]);",
    "import * as Effect from 'effect/Effect';\nEffect.succeed(makeValue());",
    "import * as Effect from 'effect/Effect';\nEffect.succeed(condition ? value : fallback);",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed(value);",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed('ready');",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.succeed(value); }",
    // Regression coverage: descendant inside wrapper-owned expression must not be double-reported.
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.map(Effect.succeed(value), f);",
    // Ownership regression: Effect.succeed inside standalone pipe wrapper alias must not double-report.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.succeed(value), Effect.map(f));",
  ],
});

run('no-effect-sync-console', {
  invalid: ["import * as Effect from 'effect/Effect';\nEffect.sync(() => console.log('x'));"],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.sync(() => value);",
    "import * as Effect from 'effect/Effect';\nEffect.sync(() => setState(value));",
  ],
});

run('no-effect-type-alias', {
  invalid: [
    "import { Effect } from 'effect';\ntype Program = Effect.Effect<number>;",
    // Regression coverage: type-only imports must also activate the type-modeling rule.
    "import type { Effect } from 'effect';\ntype Program = Effect.Effect<number>;",
    "import type * as Effect from 'effect/Effect';\ntype Program = Effect.Effect<number>;",
  ],
  valid: [
    'type Program = Promise<number>;',
    "import { Effect } from 'effect';\nfunction run(): Effect.Effect<number> { return program; }",
    "import { Effect } from 'effect';\ninterface Service { run(): Effect.Effect<number>; }",
    "import { Effect } from 'effect';\nfunction run(program: Effect.Effect<number>) { return program; }",
  ],
});

run('no-effect-wrapper-alias', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nconst wrapper = pipe(Effect.succeed(1), Effect.map(f));",
    // Ownership regression: pipe source contains an Effect call as a descendant.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(decorate(Effect.succeed(1)), Effect.map(f));",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed(value);",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed('ready');",
    "import * as Effect from 'effect/Effect';\nconst run = (value: string) => Effect.sync(() => value);",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.sync(task); }",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.succeed(value); }",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.map(Effect.succeed(1), f); }",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.orElse(Effect.flatMap(program, f), fallback); }",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.zipRight(Effect.logInfo('x'), next);",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.tryPromise(fetchUser);",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.acquireRelease(acquire, release); }",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy); }",
  ],
  valid: [
    // Ownership split: direct Effect.gen wrappers are owned by prefer-effect-fn, not no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.gen(function* () { yield* task; });",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.gen(function* () { yield* task; }); }",
    "import * as Effect from 'effect/Effect';\nconst program = Effect.succeed(1);",
    "import * as Effect from 'effect/Effect';\nconst mapped = pipe(program, Effect.map(f));",
    // Behavior regression: member .pipe(...) alias is not source-covered; must stay valid.
    "import * as Effect from 'effect/Effect';\nconst run = decorate(Effect.succeed(1)).pipe(Effect.map(f));",
    // Behavior regression: const function-expression wrapper is not source-covered (source covers arrow and declaration only).
    "import * as Effect from 'effect/Effect';\nconst run = function () { return Effect.succeed(value); };",
    // Source parity: block-bodied const arrow wrapper is not source-covered.
    "import * as Effect from 'effect/Effect';\nconst run = () => { return Effect.succeed(value); };",
    "import * as Effect from 'effect/Effect';\nconst run = () => { const program = Effect.succeed(value); return program; };",
    "import * as Effect from 'effect/Effect';\nlet run = () => Effect.succeed(value);",
    "import * as Effect from 'effect/Effect';\nvar run = () => Effect.succeed(value);",
  ],
});

run('no-flatmap-ladder', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.flatMap(program, f), g);",
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatten(Effect.map(program, f));",
    // Behavior regression: flatMap in callback (second arg) position is now caught via full-arg scan.
    "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(program, () => Effect.flatMap(other, f));",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, f);",
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.flatMap(program, f), g);",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.flatMap(Effect.flatMap(program, f), g); }",
    "import * as Effect from 'effect/Effect';\nlet program = Effect.flatMap(Effect.flatMap(program, f), g);",
    "import * as Effect from 'effect/Effect';\nvar program = Effect.flatten(Effect.map(program, f));",
  ],
});

run('no-fromnullable-nullish-coalesce', {
  invalid: ["import * as Option from 'effect/Option';\nOption.fromNullable(value ?? null);"],
  valid: [
    "import * as Option from 'effect/Option';\nOption.fromNullable(value);",
    "import * as Option from 'effect/Option';\nOption.fromNullable(value || null);",
    "import * as Option from 'effect/Option';\nOption.fromNullable(value && null);",
  ],
});

run('no-iife-wrapper', {
  invalid: ["import * as Effect from 'effect/Effect';\n(() => value)();"],
  valid: [
    '(() => value)();',
    "import * as Effect from 'effect/Effect';\n((x) => ((y) => y)(x))(value);",
  ],
});

run('no-inline-runtime-provide', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { const live = yield* runtime.pipe(Effect.provide(Live)); return live; });",
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { return yield* runtime.pipe(Effect.provide(Live)); });",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.provide(program, Live);",
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* runtime.pipe(Effect.provide(Live)); });",
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* runtime.pipe(Effect.provide(program, Live)); });",
    "import * as Effect from 'effect/Effect';\nruntime.pipe(Effect.provide(Live));",
  ],
});

run('no-manual-effect-channels', {
  invalid: [
    "import { Effect } from 'effect';\nfunction run(): Effect.Effect<number, Error, Env> { return program; }",
    "import { Layer } from 'effect';\ninterface Service { readonly layer: Layer.Layer<Service, Error, Env>; }",
    "import { Layer } from 'effect';\ntype Live = Layer.Layer<Service, Error, Env>;",
    // Regression coverage: type-only imports must also activate the type-modeling rule.
    "import type { Effect } from 'effect';\nfunction run(): Effect.Effect<number, Error, Env> { return program; }",
    "import type { Layer } from 'effect';\ntype Live = Layer.Layer<Service, Error, Env>;",
  ],
  valid: [
    "import { Effect } from 'effect';\ntype Program = Effect.Effect<number, Error, Env>;",
    "import { Effect } from 'effect';\ntype Program = Effect.Effect;",
  ],
});

run('no-match-effect-branch', {
  invalid: [
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => Effect.flatMap(program, f)));",
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => { const next = Effect.flatMap(program, f); return next; }));",
    "import * as Option from 'effect/Option';\nimport * as Effect from 'effect/Effect';\nOption.match(input, { onSome: () => Effect.map(program, f), onNone: () => value });",
    "import * as Option from 'effect/Option';\nimport * as Effect from 'effect/Effect';\nOption.match(input, { onSome: () => { const next = Effect.map(program, f); return next; }, onNone: () => value });",
    // Standalone pipe sequencing makes the Effect branch count as sequenced work.
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => pipe(Effect.succeed(1), doSomething)));",
    // A Match pipeline reports when any branch sequences Effect work, even if later branches are plain fallbacks.
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => Effect.flatMap(program, f)), Match.orElse(() => fallback));",
  ],
  valid: [
    "import * as Match from 'effect/Match';\nMatch.value(kind).pipe(Match.when('a', () => 'a'));",
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.when('a', () => Effect.flatMap(program, f));",
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => Effect.succeed(1)));",
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => pipe(value, f)));",
    // Behavior regression: member .pipe() is not source sequencing; Effect call alone is not enough.
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => Effect.succeed(value).pipe(f)));",
  ],
});

run('no-match-void-branch', {
  invalid: [
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when(true, () => Effect.void));",
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when(false, () => Effect.void));",
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.orElse(() => Effect.void));",
  ],
  valid: [
    "import * as Match from 'effect/Match';\nMatch.value(kind).pipe(Match.when(true, () => undefined));",
    "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('not-found', () => Effect.void));",
  ],
});

run('no-nested-effect-call', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.map(Effect.flatMap(Effect.succeed(1), f), g);",
    "import * as Effect from 'effect/Effect';\nEffect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy);",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.map(Effect.succeed(1), g);",
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.succeed(value));",
    // Behavior regression: second-arg deep nesting not caught after first-arg ladder-depth fix.
    "import * as Effect from 'effect/Effect';\nEffect.map(program, Effect.flatMap(Effect.succeed(1), f));",
  ],
});

run('no-nested-effect-gen', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* Effect.gen(function* () { yield* task; }); });",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* task; });",
    // Ownership regression: nested Effect.gen inside pipe alias is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.gen(function* () { yield* Effect.gen(function* () { yield* task; }); }), Effect.map(f));",
  ],
});

run('no-option-as', {
  invalid: ["import * as Option from 'effect/Option';\nOption.as(option, value);"],
  valid: [
    "import * as Option from 'effect/Option';\nOption.map(option, f);",
    // Ownership regression: barrel "effect" namespace import must not activate Option rules.
    "import * as Effect from 'effect';\nEffect.as(option, value);",
  ],
});

run('no-option-boolean-normalization', {
  invalid: [
    "import * as Option from 'effect/Option';\nOption.match(input, { onSome: (value) => value === true, onNone: () => false });",
    "import * as Option from 'effect/Option';\nOption.match(input, { onSome: (value) => true === value, onNone: () => false });",
  ],
  valid: [
    "import * as Option from 'effect/Option';\nOption.match(input, { onSome: Boolean, onNone: () => false });",
    "import * as Option from 'effect/Option';\nOption.match(input, { onSome: () => flag === true, onNone: () => false });",
    "import * as Option from 'effect/Option';\nOption.match(input, { onSome: (value) => value !== true, onNone: () => false });",
    "import * as Option from 'effect/Option';\nOption.match(input, { onSome: (value) => value === true, onNone: () => true });",
    // Comparing a different identifier must not be treated as normalizing the matched value.
    "import * as Option from 'effect/Option';\nOption.match(input, { onSome: (value) => other === true, onNone: () => false });",
    "import * as Option from 'effect/Option';\nOption.match(input, { onSome: (value) => true === other, onNone: () => false });",
  ],
});

run('no-pipe-ladder', {
  invalid: [
    "import * as Effect from 'effect/Effect';\npipe(value, pipe(other, f));",
    "import * as Effect from 'effect/Effect';\npipe(pipe(source, f), g);",
    // Ownership regression: nested member .pipe(...) in a standalone pipe step must also be caught.
    "import * as Effect from 'effect/Effect';\npipe(value, other.pipe(f));",
    // Ownership regression: nested member .pipe(...) inside a member pipe step must also be caught.
    "import * as Effect from 'effect/Effect';\nsource.pipe(other.pipe(f));",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\npipe(value, f);",
    "import * as Effect from 'effect/Effect';\nsource.pipe(f).pipe(g);",
    // Ownership regression: const pipe alias whose source contains an Effect call is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(pipe(Effect.succeed(1), f), g);",
    // A non-pipe function call in a pipe step must not be detected as a nested pipe.
    "import * as Effect from 'effect/Effect';\npipe(value, doSomething(x));",
    // A non-pipe outer function call must not be detected as a pipe expression.
    "import * as Effect from 'effect/Effect';\ndoSomething(effect, pipe(a, b));",
  ],
});

run('no-react-state', {
  invalid: ['const [value] = useState(0);', 'React.useEffect(() => {}, []);'],
  valid: ['useAtom(atom);'],
});

run('no-render-side-effects', {
  invalid: [
    "import * as Match from 'effect/Match';\nMatch.value(kind).pipe(Match.when('a', () => sideEffect()));",
  ],
  valid: [
    "import * as Match from 'effect/Match';\nconst value = Match.value(kind).pipe(Match.when('a', () => 'a'));",
    "import * as Match from 'effect/Match';\ndoSomething(Match.when('a', () => sideEffect()));",
    "import * as Match from 'effect/Match';\nMatch.when('a', () => sideEffect());",
  ],
});

run('no-return-in-callback', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nitems.map(function itemToId(item) { return item.id; });",
  ],
  valid: [
    'items.map(function itemToId(item) { return item.id; });',
    "import * as Effect from 'effect/Effect';\nitems.map((item) => { return item.id; });",
    "import * as Effect from 'effect/Effect';\n(function () { return value; })();",
  ],
});

run('no-return-null', {
  invalid: ["import * as Effect from 'effect/Effect';\nfunction value() { return null; }"],
  valid: ['function value() { return null; }'],
});

run('no-runtime-runfork', {
  invalid: ["import * as Runtime from 'effect/Runtime';\nRuntime.runFork(runtime, program);"],
  valid: ['const Runtime = { runFork: () => null };\nRuntime.runFork(runtime, program);'],
});

run('no-string-sentinel-const', {
  invalid: ["import * as Effect from 'effect/Effect';\nconst status = 'ready';"],
  valid: [
    "const status = 'ready';",
    "import * as Effect from 'effect/Effect';\nlet status = 'ready';",
    "import * as Effect from 'effect/Effect';\nvar status = 'ready';",
  ],
});

run('no-string-sentinel-return', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.succeed('ready');",
    "import * as Effect from 'effect/Effect';\nlet run = () => Effect.succeed('ready');",
    "import * as Effect from 'effect/Effect';\nvar run = () => Effect.succeed('ready');",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.succeed(status);",
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed('ready');",
    // Regression coverage: string sentinel nested inside wrapper-owned expression must not double-report.
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.map(Effect.succeed('ready'), f);",
    // Ownership regression: string sentinel inside standalone pipe wrapper alias must not double-report.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.succeed('ready'), Effect.map(f));",
  ],
});

run('no-try-catch', {
  invalid: [
    "import * as Effect from 'effect/Effect';\ntry { run(); } catch (error) { handle(error); }",
  ],
  valid: [
    'try { run(); } catch (error) { handle(error); }',
    "import * as Effect from 'effect/Effect';\ntry { run(); } finally { cleanup(); }",
  ],
});

run('no-wrapgraphql-catchall', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nwrapGraphqlCall(request).pipe(Effect.catchAll(handle));",
    "import * as Effect from 'effect/Effect';\npipe(wrapGraphqlCall(request), Effect.catchAll(handle));",
    "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.flatMap(applyResponse), Effect.catchAll(handle));",
    "import * as Effect from 'effect/Effect';\npipe(program, Effect.flatMap(applyResponse), Effect.catchAll(handle));",
    "import * as Effect from 'effect/Effect';\nprogram.pipe(wrapGraphqlCall(request)).pipe(Effect.catchAll(handle));",
    "import * as Effect from 'effect/Effect';\npipe(pipe(program, Effect.flatMap(applyResponse)), Effect.catchAll(handle));",
    // A GraphQL source can appear among other pipeline steps before catchAll.
    "import * as Effect from 'effect/Effect';\npipe(program, Effect.map(value, f), wrapGraphqlCall(request), Effect.catchAll(handle));",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.catchAll(handle));",
    "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.catchAll((error) => applyResponse(error)));",
    "import * as Effect from 'effect/Effect';\nEffect.catchAll(program, (error) => applyResponse(error));",
    // A non-wrapGraphqlCall function call at the pipe source must not fire.
    "import * as Effect from 'effect/Effect';\ndoSomething(request).pipe(Effect.catchAll(handle));",
  ],
});

run('warn-effect-sync-wrapper', {
  invalid: ["import * as Effect from 'effect/Effect';\nEffect.sync(() => setState(value));"],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.sync(() => console.log('x'));",
    // Behavior regression: block-bodied return is not expression-bodied; source parity excludes it.
    "import * as Effect from 'effect/Effect';\nEffect.sync(() => { return setState(value); });",
    // Ownership regression: Effect.sync inside pipe alias is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.sync(() => setState(value)), Effect.map(f));",
    "import * as Effect from 'effect/Effect';\nEffect.sync(() => console.warn('x'));",
    "import * as Effect from 'effect/Effect';\nEffect.sync(() => console.debug('x'));",
  ],
});

run('no-json-parse', {
  invalid: ["import * as Effect from 'effect/Effect';\nJSON.parse(payload);"],
  valid: [
    'Schema.decodeUnknownSync(User)(payload);',
    'JSON.parse(payload);',
    "import type { Effect } from 'effect';\nJSON.parse(payload);",
  ],
});

run('prefer-schema-inferred-types', {
  invalid: [
    "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Struct({ id: Schema.String });\ntype User = { id: string };",
    "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Struct({ id: Schema.String }).pipe(annotations);\ntype User = { id: string };",
    "import * as Schema from 'effect/Schema';\nconst UserSchema = pipe(Schema.Struct({ id: Schema.String }), annotations);\ntype User = { id: string };",
    // Ownership regression: non-allowlisted constructors (e.g. Schema.Tuple) must also be recognised.
    "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Tuple(Schema.String, Schema.Number);\ntype User = { id: string };",
  ],
  valid: [
    "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Struct({ id: Schema.String });\ntype Account = { id: string };",
  ],
});

run('no-promise-catch', {
  invalid: ["import * as Effect from 'effect/Effect';\npromise.catch(handle);"],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.catch(program, handle);",
    "import * as E from 'effect/Effect';\nE.catch(program, handle);",
    'promise.catch(handle);',
  ],
});

run('no-promise-reject', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nPromise.reject(error);",
    "import * as Effect from 'effect/Effect';\nnew Promise((resolve, reject) => reject(error));",
    "import * as Effect from 'effect/Effect';\nnew Promise((resolve, rejectWith) => { const fail = rejectWith; fail(error); });",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.fail(error);",
    'const reject = (value: unknown) => value; reject(error);',
    'Promise.reject(error);',
    'new Promise((resolve, rejectWith) => { const reject = (value: unknown) => value; reject(error); });',
    // A non-Promise constructor must not be treated as a Promise executor.
    "import * as Effect from 'effect/Effect';\nnew NotAPromise((resolve, reject) => reject(error));",
    // A regular function call must not be treated as a Promise executor.
    "import * as Effect from 'effect/Effect';\ncallFn((resolve, reject) => reject(error));",
  ],
});

run('no-instanceof-error', {
  invalid: ["import * as Effect from 'effect/Effect';\nif (error instanceof Error) throw error;"],
  valid: [
    "import * as Effect from 'effect/Effect';\nif (error instanceof DomainError) throw error;",
    'if (error instanceof Error) throw error;',
  ],
});

run('no-instanceof-tagged-error', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nif (error instanceof DomainError) throw error;",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nif (error instanceof Error) throw error;",
    'if (error instanceof DomainError) throw error;',
  ],
});

run('no-manual-tag-check', {
  invalid: ["import * as Effect from 'effect/Effect';\nif ('_tag' in error) handle(error);"],
  valid: [
    "import * as Effect from 'effect/Effect';\nPredicate.isTagged('DomainError')(error);",
    "if ('_tag' in error) handle(error);",
    "import * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);",
    "import type { Effect } from 'effect';\nif ('_tag' in error) handle(error);",
  ],
});

run('no-effect-internal-tags', {
  invalid: [
    "import * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);",
    "import { Option } from 'effect';\nif (option._tag === 'Some') use(option);",
    "import * as Result from 'effect/Result';\nif (result._tag === 'Left') use(result);",
    "import { Result } from 'effect';\nif (result._tag === 'Right') use(result);",
    // Option/None (tests the 'None' tag string in effectDataModuleTags).
    "import * as Option from 'effect/Option';\nif (option._tag === 'None') use(option);",
    // Either module tags.
    "import * as Either from 'effect/Either';\nif (either._tag === 'Left') use(either);",
    "import * as Either from 'effect/Either';\nif (either._tag === 'Right') use(either);",
    // Exit module tags.
    "import * as Exit from 'effect/Exit';\nif (exit._tag === 'Success') use(exit);",
    "import * as Exit from 'effect/Exit';\nif (exit._tag === 'Failure') use(exit);",
    {
      code: "import * as Cause from 'effect/Cause';\nif (c._tag==='Fail') f();\nif (c._tag==='Die') f();\nif (c._tag==='Interrupt') f();\nif (c._tag==='Sequential') f();\nif (c._tag==='Parallel') f();\nif (c._tag==='Then') f();\nif (c._tag==='Both') f();\nif (c._tag==='Empty') f();",
      expectedErrors: 8,
    },
    // Barrel imports for modules not yet individually tested via `import { M } from 'effect'`.
    "import { Either } from 'effect';\nif (either._tag === 'Left') use(either);",
    "import { Exit } from 'effect';\nif (exit._tag === 'Success') use(exit);",
    "import { Cause } from 'effect';\nif (cause._tag === 'Fail') use(cause);",
  ],
  valid: [
    "if (option._tag === 'Custom') use(option);",
    "import { Effect } from 'effect';\nif (option._tag === 'Some') use(option);",
    "import * as Option from 'effect/Option';\nif (result._tag === 'Success') use(result);",
    "import * as Exit from 'effect/Exit';\nif (option._tag === 'Some') use(option);",
    // Cause import with a non-internal tag comparison is fine.
    "import * as Cause from 'effect/Cause';\nif (cause._tag === 'CustomCause') use(cause);",
    "import type { Option } from 'effect';\nif (option._tag === 'Some') use(option);",
    "import type * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);",
  ],
});

run('no-unknown-error-message', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nString(error);",
    "import * as Effect from 'effect/Effect';\nerror.message;",
    "import * as Effect from 'effect/Effect';\nconst { message } = error;",
    "import * as Effect from 'effect/Effect';\nString(cause);",
    "import * as Effect from 'effect/Effect';\nerr.message;",
    "import * as Effect from 'effect/Effect';\nString(reason);",
    "import * as Effect from 'effect/Effect';\nString(unknownError);",
    "import * as Effect from 'effect/Effect';\ne.message;",
  ],
  valid: [
    'String(error);',
    "import * as Effect from 'effect/Effect';\nString(value);",
    "import * as Effect from 'effect/Effect';\ndomain.message;",
    "import * as Effect from 'effect/Effect';\nconst { message } = userNotification;",
  ],
});

run('prefer-yield-tagged-error', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* Effect.fail(new DomainError()); });",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* new DomainError(); });",
    // Non-delegate yield does not trigger the rule (delegate check must be === true).
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield Effect.fail(new DomainError()); });",
    // Non-constructor arg: yield* Effect.fail(variable) cannot be simplified to yield* variable.
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* Effect.fail(existingError); });",
    // Plain Error construction must stay distinct from tagged domain errors.
    "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* Effect.fail(new Error('msg')); });",
  ],
});

run('no-redundant-error-factory', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nfunction makeDomainError() { return new DomainError(); }",
    "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message: string) { return new DomainError(message); }",
    "import * as Effect from 'effect/Effect';\nfunction DomainError(input: { message: string }) { return new TaggedDomainError(input.message); }",
    "import * as Effect from 'effect/Effect';\nconst DomainError = (message: string) => new TaggedDomainError({ message });",
    "import * as Effect from 'effect/Effect';\nfunction makeDomainError() { return new DomainError('literal'); }",
    // Behavior regression: AssignmentPattern param (default value) is forwardable.
    "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message = 'default') { return new DomainError(message); }",
    // Behavior regression: RestElement param (...rest) is forwardable via member access.
    "import * as Effect from 'effect/Effect';\nfunction makeDomainError(...args) { return new DomainError(args[0]); }",
    // Behavior regression: named FunctionExpression used as declarator init — use variable name, not inner fn name.
    "import * as Effect from 'effect/Effect';\nconst makeDomainError = function factory(message) { return new DomainError(message); };",
  ],
  valid: [
    'function makeDomainError(message: string) { return new DomainError(message); }',
    "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message: string, cause: Error) { return new DomainError(message, cause); }",
    "import * as Effect from 'effect/Effect';\nfunction makeDomain(message: string) { return new DomainError(message); }",
    "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message: string) { return new DomainError(format(message)); }",
    "import * as Effect from 'effect/Effect';\nuseFactory(function DomainError() { return new DomainError(); });",
  ],
});

run('no-redundant-primitive-cast', {
  invalid: ['const name = value as string;'],
  valid: [
    'const user = value as User;',
    { code: 'const port = value as number;', filename: `${process.cwd()}/vite.config.ts` },
    { code: 'const port = value as number;', filename: `${process.cwd()}/scripts/build.ts` },
  ],
});

run('no-effect-escape-hatch', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.orDie(program);",
    "import * as Effect from 'effect/Effect';\nEffect.die(program);",
    "import * as Effect from 'effect/Effect';\nEffect.dieMessage('fatal');",
    "import * as Effect from 'effect/Effect';\nEffect.orDieWith(program, mapError);",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.catch(program, handler);",
    {
      code: "import * as Effect from 'effect/Effect';\nEffect.orDie(program);",
      filename: `${process.cwd()}/src/program.test.ts`,
    },
    {
      code: "import * as Effect from 'effect/Effect';\nEffect.orDie(program);",
      // __tests__/ directory pattern in isTestFileName regex.
      filename: `${process.cwd()}/__tests__/program.ts`,
    },
    {
      code: "import * as Effect from 'effect/Effect';\nEffect.orDie(program);",
      // Tests/ directory at path start in isTestFileName regex.
      filename: `${process.cwd()}/tests/program.ts`,
    },
    {
      code: "import * as Effect from 'effect/Effect';\nEffect.die(program);",
      filename: 'tests/program.ts',
    },
    {
      code: "import * as Effect from 'effect/Effect';\nEffect.orDieWith(program, mapError);",
      filename: 'test/program.ts',
    },
    {
      code: "import * as Effect from 'effect/Effect';\nEffect.dieMessage('fatal');",
      filename: 'src/program.test.mts',
    },
    // Ownership regression: Effect.orDie inside pipe alias is owned by no-effect-wrapper-alias.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.orDie(program), Effect.map(f));",
  ],
});

run('prefer-effect-fn', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.gen(function* () { yield* task; });",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.gen(function* () { yield* task; }); }",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nconst run = Effect.gen(function* () { yield* task; });",
    "import * as Effect from 'effect/Effect';\nconst run = () => { const program = Effect.gen(function* () { yield* task; }); return program; };",
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.gen(function* () { yield* task; }));",
    "import * as Effect from 'effect/Effect';\npipe(program, Effect.flatMap(() => Effect.gen(function* () { yield* task; })));",
    'const Effect = { gen: (value: unknown) => value };\nconst run = () => Effect.gen(function* () { yield* task; });',
  ],
});

run('prefer-effect-predicate', {
  invalid: [
    "import { Predicate } from 'effect';\nconst isPresent = (value: string | null) => value !== null;",
    "import { Predicate } from 'effect';\nfunction isPresent(value: string | null) { return value !== null; }",
    "import { Predicate } from 'effect';\nitems.filter((value) => value !== null);",
    "import * as Predicate from 'effect/Predicate';\nconst isPresent = (value: string | null) => value !== null;",
    "import * as Effect from 'effect/Effect';\nitems.filter((value) => value !== null);",
    "import { Predicate } from 'effect';\nconst isAbsent = (value: string | null) => value == null;",
    "import { Predicate } from 'effect';\nconst isAbsent = (value: string | null) => value === null;",
    "import { Predicate } from 'effect';\nconst isPresent = (value: string | null) => value != null;",
    // Reversed nullish comparisons are valid predicates over the parameter.
    "import { Predicate } from 'effect';\nconst isPresent = (value: string | null) => null !== value;",
    "import { Predicate } from 'effect';\nconst isAbsent = (value: string | null) => null === value;",
  ],
  valid: [
    'const isPresent = (value: string | null) => value !== null;',
    "import { Predicate } from 'effect';\nconst isTrue = (value: boolean) => value === true;",
    "import { Predicate } from 'effect';\nconst isPositive = (value: number) => value > 0;",
    "import { Predicate } from 'effect';\nitems.map((value) => value !== null);",
    // Comparing a different identifier must not be treated as a predicate over the parameter.
    "import { Predicate } from 'effect';\nconst isPresent = (value: string | null) => other !== null;",
    // A reversed nullish comparison using a different identifier is valid.
    "import { Predicate } from 'effect';\nconst isPresent = (value: string | null) => null !== other;",
    // Two-parameter callbacks must not be treated as unary nullish predicates.
    "import { Predicate } from 'effect';\nconst isPresent = (value: string | null, other: unknown) => value !== null;",
  ],
});

run('no-double-cast', {
  invalid: [
    'const value = raw as unknown as User;',
    'const value = raw as any as User;',
    '// lint-allow-double-cast:\nconst value = raw as unknown as User;',
    'const marker = "lint-allow-double-cast: typed boundary";\nconst value = raw as unknown as User;',
    // Behavior regression: string-literal-like text inside the cast node must not suppress.
    'const value = ("/* lint-allow-double-cast: sneaky suppression */" as unknown) as User;',
    // Behavior regression: fake comment as a prefixed string literal must not suppress.
    'const value = ("prefix /* lint-allow-double-cast: reason */" as unknown) as User;',
    // Behavior regression: block comment inside node body is no longer accepted (no node text scan).
    'const value = raw /* lint-allow-double-cast: legacy external payload boundary */ as unknown as User;',
    '// lint-allow-double-cast: too far away\nconst other = 1;\nconst value = raw as unknown as User;',
  ],
  valid: [
    'const value = raw as User;',
    'const value = raw as Input as User;',
    'const value = raw as User as unknown;',
    '// lint-allow-double-cast: legacy external payload boundary\nconst value = raw as unknown as User;',
    // No space between colon and reason — [^\S\r\n]* allows zero spaces.
    '// lint-allow-double-cast:nospace\nconst value = raw as unknown as User;',
    '// lint-allow-double-cast: x\nconst value = raw as unknown as User;',
    'const value = /* lint-allow-double-cast: legacy external payload boundary */ raw as unknown as User;',
    { code: 'const value = raw as unknown as User;', filename: 'eslint.config.ts' },
    { code: 'const value = raw as unknown as User;', filename: 'scripts/codegen.ts' },
  ],
});

run('no-ts-nocheck', {
  invalid: ['// @ts-nocheck\nconst value = 1;'],
  valid: ['// @ts-expect-error test fixture\nconst value = 1;'],
});

run('prevent-dynamic-imports', {
  invalid: ["const module = import('./module');"],
  valid: ["import { value } from './module';\nconsole.info(value);"],
});

// Sync module-level setup: production rule needs real package.json to detect roots.
// Hooks are disabled (no-hooks rule); create the tree eagerly and clean up on exit.
const crossPkgTestRoot = join(tmpdir(), `backpressure-cross-pkg-${process.pid}`);
mkdirSync(join(crossPkgTestRoot, 'packages', 'pkg-a', 'src'), { recursive: true });
writeFileSync(join(crossPkgTestRoot, 'packages', 'pkg-a', 'package.json'), '{"name":"pkg-a"}');
mkdirSync(join(crossPkgTestRoot, 'packages', 'pkg-b', 'src'), { recursive: true });
writeFileSync(join(crossPkgTestRoot, 'packages', 'pkg-b', 'package.json'), '{"name":"pkg-b"}');
// Grouped workspace: packages/group/pkg-a and packages/group/pkg-b
mkdirSync(join(crossPkgTestRoot, 'packages', 'group', 'pkg-a', 'src'), { recursive: true });
writeFileSync(
  join(crossPkgTestRoot, 'packages', 'group', 'pkg-a', 'package.json'),
  '{"name":"group-pkg-a"}',
);
mkdirSync(join(crossPkgTestRoot, 'packages', 'group', 'pkg-b', 'src'), { recursive: true });
writeFileSync(
  join(crossPkgTestRoot, 'packages', 'group', 'pkg-b', 'package.json'),
  '{"name":"group-pkg-b"}',
);
// Apps workspace: apps/web and apps/api are separate package roots under the same marker.
mkdirSync(join(crossPkgTestRoot, 'apps', 'web', 'src'), { recursive: true });
writeFileSync(join(crossPkgTestRoot, 'apps', 'web', 'package.json'), '{"name":"web"}');
mkdirSync(join(crossPkgTestRoot, 'apps', 'api', 'src'), { recursive: true });
writeFileSync(join(crossPkgTestRoot, 'apps', 'api', 'package.json'), '{"name":"api"}');
process.on('exit', () => {
  rmSync(crossPkgTestRoot, { recursive: true, force: true });
});

// Tested here because the main run() helper only imports catalogRules, while consumers also rely on the definition list export.
describe('catalog rule definitions export', () => {
  it('exports name and rule for every catalog entry', () => {
    expect(catalogRuleDefinitions).toHaveLength(Object.keys(catalogRules).length);
    for (const def of catalogRuleDefinitions) {
      expect(def.name).toBeDefined();
      expect(def.rule).toBe(catalogRules[def.name]);
    }
  });
});

describe('catalog rule metadata', () => {
  it('each rule has a description, recommended severity, and type', () => {
    for (const [, rule] of Object.entries(catalogRules)) {
      expect(rule.meta?.docs?.description).not.toBe(ruleMessage(''));
      expect(rule.meta?.docs?.recommended).toMatch(/^(error|warn)$/);
      expect(rule.meta?.type).toMatch(/^(problem|suggestion)$/);
    }
  });
});

run('no-cross-package-relative-imports', {
  invalid: [
    {
      code: "import { value } from '../../pkg-b/value';",
      filename: join(crossPkgTestRoot, 'packages', 'pkg-a', 'src', 'file.ts'),
    },
    // Behavior regression: grouped workspace — packages/group/pkg-a to packages/group/pkg-b.
    {
      code: "import { value } from '../../../group/pkg-b/value';",
      filename: join(crossPkgTestRoot, 'packages', 'group', 'pkg-a', 'src', 'file.ts'),
    },
    // Behavior regression: package-root directory import resolves directly to pkg-b directory.
    {
      code: "import { value } from '../../pkg-b';",
      filename: join(crossPkgTestRoot, 'packages', 'pkg-a', 'src', 'file.ts'),
    },
    // Behavior regression: 'apps' workspace marker — apps/web to apps/api.
    // Apps workspaces must resolve package roots the same way packages workspaces do.
    {
      code: "import { value } from '../../api/src/handler';",
      filename: join(crossPkgTestRoot, 'apps', 'web', 'src', 'file.ts'),
    },
  ],
  valid: [
    {
      code: "import { value } from './local';",
      filename: join(crossPkgTestRoot, 'packages', 'pkg-a', 'src', 'file.ts'),
    },
    {
      code: "import { value } from '../shared/value';",
      filename: join(crossPkgTestRoot, 'packages', 'pkg-a', 'src', 'feature', 'file.ts'),
    },
    // Behavior regression: grouped same-package import stays inside packages/group/pkg-a.
    {
      code: "import { value } from '../shared/value';",
      filename: join(crossPkgTestRoot, 'packages', 'group', 'pkg-a', 'src', 'feature.ts'),
    },
    // Cross-app import within the same apps/web package is valid (same package root).
    {
      code: "import { value } from '../shared/value';",
      filename: join(crossPkgTestRoot, 'apps', 'web', 'src', 'feature.ts'),
    },
    // These paths have no package.json; workspacePackageRoot returns null for both
    // From and to, so no cross-package report is emitted (trivially valid).
    {
      code: "import { value } from '../shared/value';",
      filename: `${process.cwd()}/apps/web/src/feature/file.ts`,
    },
    {
      code: "import { value } from '../shared/value';",
      filename: `${process.cwd()}/examples/demo/src/feature/file.ts`,
    },
    // Import resolving far above the workspace root stays valid when the target has no package root.
    {
      code: "import { value } from '../../../../../../../../outside';",
      filename: join(crossPkgTestRoot, 'packages', 'pkg-a', 'src', 'file.ts'),
    },
  ],
});
