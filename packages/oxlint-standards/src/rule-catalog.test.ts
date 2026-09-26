/* oxlint-disable @mplibunao/oxlint-standards/no-ts-nocheck -- string literal, not a real @ts-nocheck directive */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it, vi } from 'vitest';

import type { Rule } from '@oxlint/plugins';

import { catalogRuleDefinitions, catalogRules } from './rule-catalog.js';
import { hasExplicitRuleMessage, ruleMessage } from './rule-messages.js';
import { ownershipRegistry } from './utils/effect-ownership.js';

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
  // Placeholder values for a rule whose message names the reported call.
  readonly messageData?: Readonly<Record<string, string>>;
}

const upstreamFixtureRoot = join(process.cwd(), 'test-fixtures', 'linteffect', 'tests', 'fixtures');

const sourceFixture = (ruleName: string, fileName: string): string =>
  readFileSync(join(upstreamFixtureRoot, ruleName, fileName), 'utf8');

const toCatalogFixture = (fixture: string | CatalogFixture): CatalogFixture =>
  typeof fixture === 'string' ? { code: fixture } : fixture;

const requireRule = (name: string): Rule => {
  const rule = catalogRules[name];
  if (rule === globalThis.undefined) {
    throw new Error(`Catalog rule missing: ${name}`);
  }
  return rule;
};

const run = (
  name: keyof typeof catalogRules,
  cases: {
    readonly invalid: ReadonlyArray<string | CatalogFixture>;
    readonly valid: ReadonlyArray<string | CatalogFixture>;
  },
): void => {
  ruleTester.run(name, requireRule(name), {
    invalid: cases.invalid.map((fixture) => {
      const catalogFixture = toCatalogFixture(fixture);
      const { expectedErrors = 1, messageData, ...testCase } = catalogFixture;
      return {
        ...testCase,
        errors: Array.from({ length: expectedErrors }, () => ({
          message: ruleMessage(name, messageData),
        })),
      };
    }),
    valid: cases.valid.map(toCatalogFixture),
  });
};

const effectImport = "import * as Effect from 'effect/Effect';\n";
const effectAndPipeImports = `${effectImport}import { pipe } from 'effect/Function';\n`;
const withEffect = (body: string): string => `${effectImport}${body}`;
const withEffectAndPipe = (body: string): string => `${effectAndPipeImports}${body}`;

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

const schemaImport = "import * as Schema from 'effect/Schema';\n";
const withSchema = (body: string): string => `${schemaImport}${body}`;

run('no-inline-schema-compile', {
  invalid: [
    withSchema(
      'export const parseUser = (input: unknown) => Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))(input);',
    ),
    withSchema(
      'export const parseJson = (raw: string) => Schema.decodeSync(Schema.fromJsonString(User))(raw);',
    ),
    withSchema(
      'export const parseJson = (raw: string) => Schema.decodeSync(Schema.fromJsonString(makeSchema()))(raw);',
    ),
    // Building the decoder is the smell, whether it is applied at once, returned, or assigned.
    withSchema(
      'export const makeParser = () => Schema.decodeUnknownEffect(Schema.Struct({ id: Schema.String }));',
    ),
    withSchema(
      'function parse(raw: unknown) { const decode = Schema.decodeUnknownSync(Schema.Array(Schema.String)); return decode(raw); }',
    ),
    withSchema(
      'const write = (user: User) => Schema.encodeSync(Schema.Struct({ id: Schema.String }))(user);',
    ),
    withSchema(
      'const check = (raw: unknown) => Schema.decodeUnknownResult(Schema.Struct({ id: Schema.String }))(raw);',
    ),
    withSchema(
      'const parse = (raw: unknown) => Schema.decodeSync(Schema.Struct({ id: Schema.String }) as Schema.Codec<User>)(raw);',
    ),
    "import { Schema } from 'effect';\nconst parse = (raw: unknown) => Schema.decodeSync(Schema.Struct({}))(raw);",
    "import * as S from 'effect/Schema';\nconst parse = (raw: unknown) => S.decodeSync(S.Struct({}))(raw);",
  ],
  valid: [
    withSchema(
      'const User = Schema.Struct({ name: Schema.String });\nexport const parseUser = (input: unknown) => Schema.decodeUnknownEffect(User)(input);',
    ),
    withSchema(
      'export const parseUser = (input: unknown) => Schema.decodeUnknownEffect(models.User)(input);',
    ),
    withSchema(
      'export const parseWith = <A, I>(schema: Schema.Codec<A, I>, input: unknown) => Schema.decodeUnknownEffect(schema)(input);',
    ),
    withSchema(
      'export const makeDecoder = <A, I>(schema: Schema.Codec<A, I>) => Schema.decodeUnknownEffect(schema);',
    ),
    withSchema(
      'export const decodeUser = Schema.decodeSync(Schema.Struct({ id: Schema.String }));',
    ),
    withSchema(
      'export const parseUser = (input: unknown) => Schema.decodeUnknownEffect(makeSchema())(input);',
    ),
    // Predicates and transformation constructors are outside the decoder and encoder policy.
    withSchema('const isUser = (value: unknown) => Schema.is(Schema.Struct({}))(value);'),
    withSchema('const assertUser = (value: unknown) => Schema.asserts(Schema.Struct({}))(value);'),
    withSchema('const toNumber = () => Schema.String.pipe(Schema.decodeTo(Schema.Number));'),
    // Deliberately syntactic: a schema first assigned to a local is not tracked.
    withSchema(
      'const parse = (raw: unknown) => { const Local = Schema.Struct({}); return Schema.decodeSync(Local)(raw); };',
    ),
    'const Schema = { decodeSync: (s) => s, Struct: (s) => s };\nconst parse = (raw) => Schema.decodeSync(Schema.Struct({}))(raw);',
    "import type * as Schema from 'effect/Schema';\nconst parse = (raw) => Schema.decodeSync(Schema.Struct({}))(raw);",
  ],
});

run('no-effect-side-effect-wrapper', {
  invalid: [
    // The value slot: the second argument data-first, the only argument data-last.
    "import * as Effect from 'effect/Effect';\nEffect.as(program, console.log('x'));",
    "import * as Effect from 'effect/Effect';\nEffect.as(program, setState(value));",
    "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.as(console.log('x')));",
    "import * as Effect from 'effect/Effect';\nconst replace = Effect.as(setState(value));",
    // An Effect passed as the value is never run.
    "import * as Effect from 'effect/Effect';\nEffect.as(program, Effect.logInfo('x'));",
    "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/unstable/reactivity';\nEffect.as(program, Atom.set(count, 1));",
    "import * as Effect from 'effect/Effect';\nimport * as Atom from 'effect/reactivity/Atom';\nprogram.pipe(Effect.as(Atom.set(count, 1)));",
    "import * as Effect from 'effect/Effect';\nEffect.as(program, (() => console.log('x'))());",
    // Invoking a function evaluates its parameter defaults, even when a generator body waits.
    "import * as Effect from 'effect/Effect';\nEffect.as(Effect.succeed(1), (function* (v = console.log('now')) {})());",
    // Computed keys, static fields, and static blocks run when the class is defined.
    "import * as Effect from 'effect/Effect';\nEffect.as(program, class { static value = console.log('now'); });",
    "import * as Effect from 'effect/Effect';\nEffect.as(program, class { static { console.log('now'); } });",
    "import * as Effect from 'effect/Effect';\nEffect.as(program, class { [console.log('key')] = 1; });",
    // A curried Atom.set returns a function, but its arguments are still evaluated eagerly.
    "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/unstable/reactivity';\nEffect.as(Effect.succeed(1), Atom.set(console.log('x')));",
    "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/unstable/reactivity';\nprogram.pipe(Effect.as(Atom.set(console.log('x'))));",
    // Named wrappers and pipe aliases get no exemption
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.as(program, console.log('x'));",
    "import * as Effect from 'effect/Effect';\nimport { pipe } from 'effect/Function';\nconst run = pipe(program, Effect.as(setState(value)));",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.as(program, value);",
    "import * as Effect from 'effect/Effect';\nEffect.as(program, { id: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Option from 'effect/Option';\nprogram.pipe(Effect.as(Option.some(1)));",
    // Only the reviewed side-effect calls count; an arbitrary call is not presumed impure.
    "import * as Effect from 'effect/Effect';\nEffect.as(program, makeValue());",
    // The first data-first argument is the source Effect, not the value.
    "import * as Effect from 'effect/Effect';\nEffect.as(Effect.logInfo('x'), value);",
    // A spread hides the argument count, so the overload and the value slot are unknown.
    "import * as Effect from 'effect/Effect';\nEffect.as(...([Effect.logInfo('source'), 42] as const));",
    "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.as(...[console.log('x')]));",
    // Defaults of a function that is never called, and instance fields, do not run.
    "import * as Effect from 'effect/Effect';\nEffect.as(program, (v = console.log('later')) => v);",
    "import * as Effect from 'effect/Effect';\nEffect.as(Effect.succeed(1), class { value = console.log('later'); });",
    "import * as Effect from 'effect/Effect';\nEffect.as(setState(value), undefined);",
    // A function value runs only when called.
    "import * as Effect from 'effect/Effect';\nEffect.as(program, () => console.log('x'));",
    // Invoking a generator function only creates an iterator; its body is deferred.
    "import * as Effect from 'effect/Effect';\nEffect.as(Effect.succeed(1), (function* () { console.log('later'); })());",
    "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.as((function* () { console.log('later'); })()));",
    // The one-argument Atom.set returns a function, not an Effect, in both Effect.as arities.
    "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/unstable/reactivity';\nEffect.as(Effect.succeed(1), Atom.set(1));",
    "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/unstable/reactivity';\nprogram.pipe(Effect.as(Atom.set(1)));",
    "import * as Effect from 'effect/Effect';\nEffect.zipRight(Effect.logInfo('x'), next);",
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.as(program, Atom.set(count, 1));",
    "const Effect = { as: (a, b) => b };\nEffect.as(program, console.log('x'));",
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
    // A file whose only Effect-stack import is a v4 Atom binding is an Effect file.
    "import { useAtomValue } from '@effect/atom-react';\nconst label = () => { switch (useAtomValue(statusAtom)) { case 'idle': return 'waiting'; default: return 'done'; } };",
    "import { useAtom } from '@effect/atom-solid';\nswitch (state) { default: break; }",
    "import { useAtom } from '@effect/atom-vue';\nswitch (state) { default: break; }",
  ],
  valid: [
    sourceFixture('no-switch-statement', 'valid-match-value.ts'),
    sourceFixture('no-switch-statement', 'valid-switch-without-effect.ts'),
    // Retained upstream fixture: it imports only the v3 @effect-atom/atom-react package, which the
    // v4-primary decision puts out of scope, so it no longer marks an Effect file.
    sourceFixture('no-switch-statement', 'invalid-switch-atom-react.ts'),
    "import type { AtomValue } from '@effect/atom-react';\nswitch (state) { default: break; }",
    "import { describe } from '@effect/vitest';\nswitch (state) { default: break; }",
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

const atomImports =
  "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/unstable/reactivity';\n";
const withAtom = (body: string): string => `${atomImports}${body}`;
const atomCase = (code: string, method: string, expectedErrors = 1): CatalogFixture => ({
  code,
  expectedErrors,
  messageData: { method: `Atom.${method}` },
});

run('no-atom-registry-effect-sync', {
  invalid: [
    atomCase(withAtom('Effect.sync(() => Atom.set(count, 1));'), 'set'),
    atomCase(withAtom('Effect.sync(() => { Atom.refresh(count); });'), 'refresh'),
    atomCase(withAtom('Effect.sync(() => Atom.get(count));'), 'get'),
    atomCase(withAtom('Effect.sync(() => Atom.update(count, (n) => n + 1));'), 'update'),
    atomCase(withAtom('Effect.sync(() => Atom.modify(count, (n) => [n, n + 1]));'), 'modify'),
    atomCase(withAtom('Effect.sync(function () { return Atom.get(count); });'), 'get'),
    // One diagnostic per offending call, at the call.
    atomCase(withAtom('Effect.sync(() => { Atom.set(a, 1); Atom.set(b, 2); });'), 'set', 2),
    // An inline function invoked on the spot runs inside the sync callback.
    atomCase(withAtom('Effect.sync(() => (() => Atom.set(count, 1))());'), 'set'),
    atomCase(withAtom('Effect.sync(() => (function () { return Atom.set(count, 1); })());'), 'set'),
    // Effect.sync calls its callback, which evaluates the parameter defaults, even of a generator.
    atomCase(withAtom('Effect.sync((v = Atom.set(count, 1)) => v);'), 'set'),
    atomCase(withAtom('Effect.sync(function* (v = Atom.set(count, 1)) {});'), 'set'),
    atomCase(withAtom('Effect.sync(() => class { static value = Atom.set(count, 1); });'), 'set'),
    atomCase(
      "import * as Effect from 'effect/Effect';\nimport * as A from 'effect/unstable/reactivity/Atom';\nEffect.sync(() => A.set(count, 1));",
      'set',
    ),
    atomCase(
      "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/reactivity';\nEffect.sync(() => Atom.set(count, 1));",
      'set',
    ),
    atomCase(
      "import { Effect } from 'effect';\nimport * as Atom from 'effect/reactivity/Atom';\nEffect.sync(() => Atom.refresh(count));",
      'refresh',
    ),
  ],
  valid: [
    withAtom('Effect.gen(function* () { yield* Atom.set(count, 1); });'),
    withAtom('const write = Atom.set(count, 1);'),
    // Registry instance operations are synchronous in v4.
    withAtom('Effect.sync(() => registry.set(count, 1));'),
    withAtom('Effect.sync(() => atomRegistry.set(count, 1));'),
    // A nested generator and a declared function are their own execution boundaries.
    withAtom('Effect.sync(() => Effect.gen(function* () { yield* Atom.set(count, 1); }));'),
    withAtom('Effect.sync(() => { const later = () => Atom.set(count, 1); return later; });'),
    // A generator body is deferred, whether it is the callback or invoked inside it.
    withAtom('Effect.sync(function* () { Atom.set(count, 1); });'),
    withAtom('Effect.sync(() => (function* () { Atom.set(count, 1); })());'),
    // Instance fields wait for instantiation; defaults of an uncalled function never run.
    withAtom('Effect.sync(() => class { value = Atom.set(count, 1); });'),
    withAtom('Effect.sync(() => { const later = (v = Atom.set(count, 1)) => v; return later; });'),
    // The data-last form returns a function, not an Effect.
    withAtom('Effect.sync(() => Atom.set(1));'),
    withAtom('const run = (Atom) => Effect.sync(() => Atom.set(count, 1));'),
    "import * as Effect from 'effect/Effect';\nconst Atom = { set: (a, v) => v };\nEffect.sync(() => Atom.set(count, 1));",
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.sync(() => Atom.set(count, 1));",
    "import * as Effect from 'effect/Effect';\nimport type { Atom } from 'effect/unstable/reactivity';\nEffect.sync(() => Atom.set(count, 1));",
  ],
});

run('no-branch-in-object', {
  invalid: [
    "import * as Option from 'effect/Option';\nconst value = { ready: Option.match(input, { onSome: () => true, onNone: () => false }) };",
    "import * as Match from 'effect/Match';\nconst value = { ready: Match.value(input).pipe(Match.when('a', () => true)) };",
    "import * as Match from 'effect/Match';\nconst value = ((branch) => ({ ready: branch }))(Match.value(input).pipe(Match.when('a', () => true)));",
    "import * as Option from 'effect/Option';\nconst value = ((branch) => { return { ready: branch }; })(Option.match(input, { onSome: () => true, onNone: () => false }));",
    "import * as Option from 'effect/Option';\nconst value = (function (branch) { return { ready: branch }; })(Option.match(input, { onSome: () => true, onNone: () => false }));",
    // Ownership regression: branch wrapped in a helper call inside an IIFE arg is source-covered via descendant scan.
    "import * as Option from 'effect/Option';\nconst value = ((branch) => ({ ready: branch }))(decorate(Option.match(input, { onSome: () => true, onNone: () => false })));",
  ],
  valid: [
    'const value = { ready: condition ? true : false };',
    "import * as Match from 'effect/Match';\nconst value = { ready: decorate(Match.value(input).pipe(Match.when('a', () => true))) };",
    "import * as Option from 'effect/Option';\nconst value = { ready: decorate(Option.match(input, { onSome: () => true, onNone: () => false })) };",
    // v4 has no Either module.
    "import * as Either from 'effect/Either';\nconst value = { ready: Either.match(input, { onRight: () => true, onLeft: () => false }) };",
    "import * as Option from 'effect/Option';\nconst value = { ready: ((branch) => branch)(Option.match(input, { onSome: () => true, onNone: () => false })) };",
  ],
});

run('no-effect-all-step-sequencing', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nEffect.all([Ref.set(ref, value)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nEffect.all([Ref.set(ref, value)]).pipe(Effect.asVoid);",
    "import * as Effect from 'effect/Effect';\nEffect.all([Effect.logInfo('done')], { concurrency: 1 });",
    // The v4 Atom.set Effect counts as a state-changing sequential step.
    "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/unstable/reactivity';\nEffect.all([Atom.set(atom, value)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Atom from 'effect/reactivity/Atom';\nEffect.all([Atom.set(atom, value)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Fiber from 'effect/Fiber';\nEffect.all([Fiber.interrupt(fiber)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as SubscriptionRef from 'effect/SubscriptionRef';\nEffect.all([SubscriptionRef.set(ref, value)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Reactivity from 'effect/unstable/reactivity/Reactivity';\nEffect.all([Reactivity.invalidate(signal)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport { Reactivity } from 'effect/reactivity';\nEffect.all([Reactivity.invalidate(signal)], { concurrency: 1 });",
    // A pipeline reports when any direct step discards state-changing work with asVoid.
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nEffect.all([Ref.set(ref, value)]).pipe(Effect.map(f), Effect.asVoid);",
    // A pipe alias gets no exemption: the sequential Effect.all still reports.
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nconst run = pipe(Effect.all([Ref.set(ref, value)], { concurrency: 1 }), Effect.map(f));",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.all([program], { concurrency: 2 });",
    "import * as Effect from 'effect/Effect';\nEffect.all([Effect.sync(() => console.log('x'))], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nEffect.all([Effect.sync(() => setState(value))], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Fiber from 'effect/Fiber';\nEffect.all([Fiber.join(fiber)], { concurrency: 1 });",
    // The curried Atom.set returns a function, not a state-changing Effect step.
    "import * as Effect from 'effect/Effect';\nimport { Atom } from 'effect/unstable/reactivity';\nEffect.all([Effect.succeed(Atom.set(1))], { concurrency: 1 });",
    // Retired v3 modules no longer identify Atom or Reactivity.
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.all([Atom.set(atom, value)], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Reactivity from 'effect/Reactivity';\nEffect.all([Reactivity.invalidate(signal)], { concurrency: 1 });",
  ],
});

run('no-effect-bind', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.bind('user', loadUser);",
    // A pipe alias gets no exemption.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.bind('user', loadUser), Effect.map(f));",
  ],
  valid: ["import * as Effect from 'effect/Effect';\nEffect.map(program, f);"],
});

const optionImport = "import * as Option from 'effect/Option';\n";
const withOption = (body: string): string => `${optionImport}${body}`;

run('no-fromnullable-nullish-coalesce', {
  invalid: [
    withOption('Option.fromNullishOr(value ?? null);'),
    withOption('Option.fromUndefinedOr(value ?? undefined);'),
    withOption('Option.fromNullishOr((value ?? null));'),
    "import * as O from 'effect/Option';\nO.fromNullishOr(value ?? null);",
    "import { Option } from 'effect';\nOption.fromUndefinedOr(value ?? undefined);",
  ],
  valid: [
    withOption('Option.fromNullishOr(value);'),
    withOption('Option.fromUndefinedOr(value);'),
    withOption('Option.fromUndefinedOr(value ?? fallback);'),
    withOption('Option.fromNullishOr(value || null);'),
    // Each constructor has its own redundant fallback; the pairs are not merged.
    withOption('Option.fromNullishOr(value ?? undefined);'),
    withOption('Option.fromUndefinedOr(value ?? null);'),
    // `undefined` must be the global value.
    withOption('const read = (undefined) => Option.fromUndefinedOr(value ?? undefined);'),
    'const Option = { fromNullishOr: (x) => x };\nOption.fromNullishOr(value ?? null);',
    // The removed v3 constructor belongs to tsgo's outdated-API check.
    withOption('Option.fromNullable(value ?? null);'),
  ],
});

run('no-iife-wrapper', {
  invalid: ["import * as Effect from 'effect/Effect';\n(() => value)();"],
  valid: [
    '(() => value)();',
    "import * as Effect from 'effect/Effect';\n((x) => ((y) => y)(x))(value);",
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

run('no-react-state', {
  invalid: [
    'useEffect(() => {}, []);',
    'React.useEffect(() => {}, []);',
    'React.useReducer(reducer, initial);',
    'useContext(ThemeContext);',
    'React.useCallback(() => {}, []);',
    'useSyncExternalStore(subscribe, getSnapshot);',
  ],
  valid: [
    'const [value] = useState(0);',
    'const [open] = React.useState(false);',
    'useAtom(atom);',
    "import * as Effect from 'effect/Effect';\nconst [value] = useState(0);",
    "import { useAtom } from '@effect/atom-react';\nconst [count] = useAtom(countAtom);",
  ],
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

run('no-return-null', {
  invalid: [
    withEffect('Effect.gen(function* () { return null; });'),
    withEffect('Effect.gen({ self: this }, function* () { return null; });'),
    withEffect('Effect.gen(function* () { if (missing) { return null; } return 1; });'),
    withEffect("Effect.fn('load')(function* () { return null; });"),
    // A string constant or an unknown binding is a span name.
    withEffect("const span = 'load';\nEffect.fn(span)(function* () { return null; });"),
    withEffect('Effect.fn(`load`)(function* () { return null; });'),
    withEffect(
      // An interpolated template, assembled so the fixture itself is not a template.
      'const span = `load.$' +
        '{kind}`;\nEffect.fn(span, { attributes })(function* () { return null; });',
    ),
    withEffect("Effect.fn('load', { attributes })(function* () { return null; }, Effect.orDie);"),
    withEffect('Effect.fn(function* () { return null; });'),
    withEffect('Effect.succeed(null);'),
    withEffect('const load = () => Effect.succeed(null as never);'),
    "import { Effect as E } from 'effect';\nE.succeed(null);",
  ],
  valid: [
    // React components and nullable boundary helpers keep returning null.
    withEffect('export const View = () => { return null; };'),
    withEffect('function find(): User | null { return null; }'),
    // A nested ordinary helper is its own function boundary.
    withEffect('Effect.gen(function* () { const pick = () => { return null; }; return pick(); });'),
    withEffect(
      "import * as Option from 'effect/Option';\nEffect.gen(function* () { return Option.none(); });",
    ),
    withEffect('const none = Effect.succeedNone;'),
    withEffect('Effect.succeed(value);'),
    withEffect('Effect.gen(function* () { return undefined; });'),
    withEffect('function* values() { return null; }'),
    withEffect('Effect.fnUntraced(function* () { return null; });'),
    // With two arguments, Effect.gen takes the body second; the first is its options.
    withEffect('Effect.gen(function* () { return null; }, extra);'),
    // A traced function called with a generator argument is not the Effect.fn factory.
    withEffect('Effect.fn(function* () { return 1; })(function* () { return null; });'),
    // So is a traced function whose body is a provable function binding.
    withEffect(
      'const body = function* () { return 1; };\nEffect.fn(body)(function* () { return null; });',
    ),
    withEffect('function* body() { return 1; }\nEffect.fn(body)(function* () { return null; });'),
    // An unresolved first argument leaves the Effect.fn overload unknown.
    withEffect(
      'export const make = (spanName: string) => Effect.fn(spanName)(function* () { return null; });',
    ),
    withEffect(
      "import { spanName } from './names';\nEffect.fn(spanName)(function* () { return null; });",
    ),
    withEffect("let span = 'load';\nEffect.fn(span)(function* () { return null; });"),
    'const Effect = { gen: (f) => f };\nEffect.gen(function* () { return null; });',
    "import type * as Effect from 'effect/Effect';\nEffect.succeed(null);",
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

run('no-json-parse', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nJSON.parse(payload);",
    "import { useAtomValue } from '@effect/atom-react';\nJSON.parse(payload);",
  ],
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

run('no-effect-internal-tags', {
  invalid: [
    "import { Option } from 'effect';\nif (option._tag === 'Some') use(option);",
    "import * as Option from 'effect/Option';\nif (option._tag === 'None') use(option);",
    "import * as Result from 'effect/Result';\nif (result._tag === 'Success') use(result);",
    "import { Result } from 'effect';\nif (result._tag === 'Failure') use(result);",
    "import * as Exit from 'effect/Exit';\nif (exit._tag === 'Success') use(exit);",
    "import * as Exit from 'effect/Exit';\nif (exit._tag === 'Failure') use(exit);",
    // A v4 Cause is untagged; each of its reasons carries the tag.
    {
      code: "import * as Cause from 'effect/Cause';\nif (reason._tag === 'Fail') f();\nif (reason._tag === 'Die') f();\nif (reason._tag === 'Interrupt') f();",
      expectedErrors: 3,
    },
    "import { Exit } from 'effect';\nif (exit._tag === 'Success') use(exit);",
    "import { Cause } from 'effect';\nif (reason._tag === 'Fail') use(reason);",
  ],
  valid: [
    "if (option._tag === 'Custom') use(option);",
    "import { Effect } from 'effect';\nif (option._tag === 'Some') use(option);",
    "import * as Option from 'effect/Option';\nif (result._tag === 'Success') use(result);",
    "import * as Exit from 'effect/Exit';\nif (option._tag === 'Some') use(option);",
    // Cause import with a non-internal tag comparison is fine.
    "import * as Cause from 'effect/Cause';\nif (cause._tag === 'CustomCause') use(cause);",
    // v3 representations: the combinator Cause tags, Either, and Result Left/Right.
    "import * as Cause from 'effect/Cause';\nif (cause._tag === 'Sequential') use(cause);",
    "import * as Either from 'effect/Either';\nif (either._tag === 'Left') use(either);",
    "import * as Result from 'effect/Result';\nif (result._tag === 'Left') use(result);",
    "import type { Option } from 'effect';\nif (option._tag === 'Some') use(option);",
    "import type * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);",
    // A computed identifier key is a runtime key, not a static _tag read.
    "import * as Option from 'effect/Option';\nif (option[_tag] === 'Some') use(option);",
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
    withEffect('Effect.orDie(program);'),
    withEffect('Effect.die(reason);'),
    // A member reference reports as well as a call.
    withEffect('program.pipe(Effect.orDie);'),
    withEffect('const boom = () => Effect.orDie(program);'),
    withEffect('function boom() { return Effect.orDie(program); }'),
    // A pipe alias gets no exemption.
    withEffectAndPipe('const run = pipe(program, Effect.orDie);'),
    withEffect('const run = pipe(Effect.orDie(program), Effect.map(f));'),
    "import { Effect } from 'effect';\nEffect.die(reason);",
  ],
  valid: [
    withEffect('Effect.catch(program, handler);'),
    withEffect('Effect.fail(new DomainError());'),
    'const Effect = { orDie: (value) => value };\nEffect.orDie(program);',
    "import type * as Effect from 'effect/Effect';\nEffect.orDie(program);",
    // v4 exports only die and orDie; the removed names belong to tsgo's outdated-API check.
    withEffect("Effect.dieMessage('fatal');"),
    withEffect('Effect.orDieWith(program, mapError);'),
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
      code: "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.orDie);",
      filename: 'test/program.ts',
    },
    {
      code: "import * as Effect from 'effect/Effect';\nEffect.die(reason);",
      filename: 'src/program.test.mts',
    },
  ],
});

run('prefer-effect-fn', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.gen(function* () { yield* task; });",
    "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.gen(function* () { yield* task; }); }",
    "import * as Effect from 'effect/Effect';\nconst addOne = (n: number) => Effect.gen(function* () { return n + 1; });",
    "import * as Effect from 'effect/Effect';\nconst run = function () { return Effect.gen(function* () { yield* task; }); };",
    "import { Effect } from 'effect';\nconst run = () => Effect.gen(function* () { yield* task; });",
    "import * as Fx from 'effect/Effect';\nconst run = () => Fx.gen(function* () { yield* task; });",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nconst run = Effect.gen(function* () { yield* task; });",
    "import * as Effect from 'effect/Effect';\nconst run = () => { const program = Effect.gen(function* () { yield* task; }); return program; };",
    "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.gen(function* () { yield* task; }));",
    "import * as Effect from 'effect/Effect';\npipe(program, Effect.flatMap(() => Effect.gen(function* () { yield* task; })));",
    "import * as Effect from 'effect/Effect';\nconst run = Effect.fn('run')(function* () { yield* task; });",
    // The piped-span form is left to effecttsgo/effect-fn-opportunity, which reports it on every route.
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.gen(function* () { yield* task; }).pipe(Effect.withSpan('run'));",
    'const Effect = { gen: (value: unknown) => value };\nconst run = () => Effect.gen(function* () { yield* task; });',
    "import * as Effect from 'effect/Effect';\nconst make = (Effect: { gen: (body: unknown) => unknown }) => { const run = () => Effect.gen(function* () {}); return run; };",
    "import type * as Effect from 'effect/Effect';\nconst run = () => Effect.gen(function* () { yield* task; });",
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
  it('each rule has a written description, recommended severity, and type', () => {
    for (const [name, rule] of Object.entries(catalogRules)) {
      expect(hasExplicitRuleMessage(name)).toBe(true);
      expect(rule.meta?.docs?.description).toMatch(new RegExp(`^Rule: ${name}\\. Why: `));
      expect(rule.meta?.docs?.description).not.toMatch(/\{\{\w+\}\}/);
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

run('no-effect-call-in-effect-arg', {
  invalid: [
    withEffect('Effect.map(Effect.succeed(1), f);'),
    withEffect('Effect.flatMap(Effect.succeed(1), f);'),
    withEffect('Effect.flatten(Effect.map(work, f));'),
    withEffect('Effect.catch(Effect.tryPromise(work), recover);'),
    withEffect('Effect.flatMap(Effect.flatMap(program, f), g);'),
    withEffect('Effect.tap(Effect.succeed(1), log);'),
    withEffect('Effect.andThen(Effect.succeed(1), next);'),
    withEffect("Effect.catchTag(Effect.tryPromise(work), 'NotFound', recover);"),
    withEffect('Effect.catchTags(Effect.tryPromise(work), { NotFound: recover });'),
    withEffect('Effect.zip(Effect.succeed(1), Effect.succeed(2));'),
    withEffect('Effect.zip(Effect.succeed(1), other, { concurrent: true });'),
    // A data-first transformation is itself a provable Effect value.
    withEffect('Effect.zip(Effect.succeed(1), Effect.flatten(work));'),
    withEffect('Effect.map(Effect.all([first, second]), f);'),
    // A dual member's data-first call is an Effect source whatever the member.
    withEffect('Effect.map(Effect.as(work, 1), f);'),
    withEffect('Effect.map(Effect.provide(work, layer), f);'),
    withEffect('Effect.flatMap(Effect.forkChild(work), f);'),
    // Captured members with no annotation in source, or a conditional return, are still sources.
    withEffect('Effect.map(Effect.tx(work), f);'),
    withEffect('Effect.map(Effect.fromOption(maybe), f);'),
    // provide's verified discriminator is its first argument, which is provably an Effect here.
    withEffect('Effect.zip(Effect.succeed(1), Effect.provide(Effect.succeed(2), layer));'),
    // Const, named-function return, and pipe-alias placements get no exemption.
    withEffect('const program = Effect.map(Effect.succeed(1), f);'),
    withEffect('const program = Effect.flatten(Effect.map(program, f));'),
    withEffect('function run() { return Effect.map(Effect.succeed(1), f); }'),
    withEffectAndPipe('const run = pipe(Effect.map(Effect.succeed(1), f), Effect.map(g));'),
    // An exempt runner, fork, or resource helper does not hide the transformation inside it.
    withEffect('Effect.runPromise(Effect.map(Effect.succeed(1), f));'),
    withEffect('Effect.forkChild(Effect.flatMap(Effect.succeed(1), f));'),
    withEffect('Effect.scoped(Effect.map(Effect.succeed(1), f));'),
    withEffect(
      'const program = Effect.repeat(Effect.catch(Effect.tryPromise(fetchUser), handle), policy);',
    ),
    withEffect('const program = Effect.as(Effect.map(Effect.succeed(1), f), value);'),
    withEffect('const program = Effect.zipRight(program, Effect.map(Effect.succeed(1), f));'),
    "import { Effect as Fx } from 'effect';\nFx.map(Fx.succeed(1), f);",
    "import * as Fx from 'effect/Effect';\nFx.map(Fx.succeed(1), f);",
  ],
  valid: [
    withEffect('Effect.map(work, f);'),
    withEffect('Effect.flatMap(work, () => Effect.succeed(value));'),
    // Data-last calls whose first argument is an Effect continuation, not the source.
    withEffect('Effect.andThen(Effect.succeed(2));'),
    withEffect('Effect.tap(Effect.log(message));'),
    withEffect('Effect.zip(Effect.succeed(2));'),
    withEffect('Effect.zip(Effect.succeed(2), { concurrent: true });'),
    withEffect("Effect.catchTag('NotFound', () => Effect.succeed(fallback));"),
    // Runners, forks, and resource helpers may take an Effect directly.
    withEffect('Effect.runPromise(Effect.gen(function* () { return 1; }));'),
    withEffect('Effect.forkChild(Effect.gen(function* () { return 1; }));'),
    withEffect('Effect.acquireRelease(Effect.sync(acquire), release);'),
    withEffect('Effect.scoped(Effect.gen(function* () { return 1; }));'),
    withEffect('Effect.ensuring(work, Effect.sync(cleanup));'),
    withEffect('Effect.provide(Effect.scoped(acquire), layer);'),
    // Non-transforming or non-v4 outer calls.
    withEffect('Effect.as(Effect.succeed(1), value);'),
    withEffect('Effect.orElse(Effect.flatMap(program, f), fallback);'),
    withEffect("Effect.bind('user', Effect.succeed(user));"),
    withEffect("Effect.zipRight(Effect.logInfo('x'), next);"),
    // A second argument that may be options cannot prove the zip data-first overload.
    withEffect('Effect.zip(Effect.succeed(1), other);'),
    // A runner result or a data-last pipeable function is not a provable Effect value.
    withEffect(
      'Effect.zip(Effect.succeed(1), Effect.runSync(Effect.succeed({ concurrent: true })));',
    ),
    withEffect('Effect.zip(Effect.succeed(1), Effect.map(f));'),
    withEffect('Effect.map(Effect.runSync(work), f);'),
    withEffect('Effect.map(Effect.runPromise(work), f);'),
    // A data-last dual call is a pipeable function, not an Effect source.
    withEffect('Effect.map(Effect.as(1), f);'),
    withEffect('Effect.zip(Effect.succeed(1), Effect.provide(layer));'),
    // fromOption has no Effect-typed discriminator, so it cannot prove the zip data-first overload.
    withEffect('Effect.zip(Effect.succeed(1), Effect.fromOption(maybe));'),
    // A spread hides the argument count, so the overload is unknown.
    withEffect('Effect.andThen(Effect.succeed(1), ...([] as const));'),
    withEffect('Effect.zip(Effect.succeed(1), ...rest);'),
    // Binding controls: a shadowing parameter, a type-only import, and a lookalike object.
    withEffect('const run = (Effect) => Effect.map(Effect.succeed(1), f);'),
    "import type * as Effect from 'effect/Effect';\nEffect.map(Effect.succeed(1), f);",
    'const Effect = { map, succeed };\nEffect.map(Effect.succeed(1), f);',
  ],
});

run('no-effect-ladder', {
  invalid: [
    withEffect('const program = Effect.flatMap(Effect.flatMap(Effect.succeed(1), f), g);'),
    withEffect(
      'const program = Effect.map(Effect.catch(Effect.tryPromise(fetchUser), handle), f);',
    ),
    withEffect(
      'function run() { if (ready) { return Effect.map(Effect.catch(Effect.tryPromise(fetchUser), handle), f); } return fallback; }',
    ),
    // Named wrappers get no exemption.
    withEffect('function run() { return Effect.flatMap(Effect.map(Effect.succeed(1), f), g); }'),
  ],
  valid: [
    withEffect('Effect.flatMap(Effect.succeed(1), g);'),
    withEffect('Effect.flatMap(program, () => Effect.succeed(value));'),
    withEffect('Effect.flatMap(Effect.map(Effect.succeed(1), f), g);'),
    withEffect('let program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);'),
    withEffect('var program = Effect.map(Effect.catch(Effect.tryPromise(fetchUser), handle), f);'),
    // The outer call must satisfy the data-first transforming contract.
    withEffect(
      'const program = Effect.repeat(Effect.catch(Effect.tryPromise(fetchUser), handle), policy);',
    ),
    withEffect('const program = Effect.as(Effect.map(Effect.succeed(1), f), value);'),
    withEffect('const program = Effect.orElse(Effect.flatMap(Effect.succeed(1), f), fallback);'),
    withEffect("const program = Effect.bind('user', Effect.map(Effect.succeed(user), f));"),
    withEffect("const program = Effect.zipRight(Effect.map(Effect.logInfo('x'), f), next);"),
    // Only the first-argument source chain counts as ladder depth.
    withEffect('const program = Effect.zipRight(program, Effect.map(Effect.succeed(1), f));'),
    withEffect('const program = Effect.flatMap(Effect.map(program, Effect.succeed(1)), g);'),
  ],
});

run('no-flatmap-ladder', {
  invalid: [
    withEffect('const program = Effect.flatMap(program, () => Effect.flatMap(other, f));'),
    withEffect(
      'const program = Effect.flatMap(program, (value) => { return Effect.flatMap(other, f); });',
    ),
    // Named wrappers get no exemption.
    withEffect(
      'function run() { return Effect.flatMap(program, () => Effect.flatMap(other, f)); }',
    ),
  ],
  valid: [
    withEffect('Effect.flatMap(program, f);'),
    withEffect('Effect.flatMap(program, () => Effect.flatMap(other, f));'),
    withEffect('let program = Effect.flatMap(program, () => Effect.flatMap(other, f));'),
    // no-pipe-ladder reports a closure ladder at its inner continuation.
    withEffect(
      'const program = Effect.flatMap(work, (x) => Effect.flatMap(other(x), (y) => save(x, y)));',
    ),
    withEffect(
      'function run() { return Effect.flatMap(work, (x) => Effect.flatMap(other(x), (y) => save(x, y))); }',
    ),
    // The error-level owners report these shapes; the warning never replaces them.
    withEffect('const program = Effect.flatten(Effect.map(program, f));'),
    withEffect('function run() { return Effect.flatMap(Effect.flatMap(program, f), g); }'),
  ],
});

// The stress table of docs/analysis/effect-nesting-rules-first-principles.md, section 5: its own
// S and D snippets, each checked against both rules with the table's L and D columns.
const stressSnippets = {
  S1: 'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.map((posts) => ({ user, posts })))));',
  S2: 'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save({ user, posts })))));',
  S3: 'Effect.flatMap(getUser, (user) => Effect.flatMap(fetchPosts(user.id), (posts) => save({ user, posts })));',
  S4: 'pipe(getUser, Effect.flatMap((user) => pipe(fetchPosts(user.id), Effect.tap((posts) => log(posts)))));',
  S5: 'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id)), Effect.tap((posts) => log(posts)), Effect.map((posts) => posts.length));',
  S6: "Effect.gen(function* () { const posts = yield* fetchPosts(id).pipe(Effect.timeout('1 second'), Effect.mapError((cause) => new NotFound(cause))); return posts; });",
  S7: "Effect.gen(function* () { return yield* getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.tap(() => log('done'))))); });",
  S8: 'work.pipe(Effect.catch((error) => log(error).pipe(Effect.as(0))));',
  S9: "work.pipe(Effect.catchTag('NotFound', (error) => log(error).pipe(Effect.andThen(Effect.succeed(0)))));",
  S10: 'Effect.forEach(items, (item) => fetchPosts(item).pipe(Effect.map((posts) => posts.length)));',
  S11: 'Effect.forEach(items, (item) => fetchPosts(item).pipe(Effect.flatMap((posts) => save({ item, posts }))));',
  S12: "Effect.all([work.pipe(Effect.map(String)), work.pipe(Effect.mapError((cause) => new NotFound(cause)))], { concurrency: 'unbounded' });",
  S13: 'getUser.pipe(Effect.flatMap((user) => Effect.gen(function* () { const posts = yield* fetchPosts(user.id); yield* save(posts); return posts; })));',
  S14: 'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(posts).pipe(Effect.andThen(log(user)))))));',
  S15: 'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap(save))));',
  S16: 'getUser.pipe(Effect.flatMap((user) => Effect.all(items.map((item) => fetchPosts(item).pipe(Effect.flatMap((posts) => save({ user, posts })))))));',
  D1: "work.pipe(Effect.catch(() => log('failed')));",
  D2: 'work.pipe(Effect.catch(() => Effect.succeed(0)));',
  D3: 'work.pipe(Effect.orElseSucceed(() => 0));',
  D4: 'work.pipe(Effect.catch((error) => log(error).pipe(Effect.as(0))));',
  D5: "work.pipe(Effect.catchTag('NotFound', () => Effect.succeed(0)));",
  D6: 'work.pipe(Effect.tapError((error) => log(error)), Effect.catch(() => Effect.succeed(0)));',
  D7: 'work.pipe(Effect.catchCause(() => Effect.void));',
  D8: 'work.pipe(Effect.mapError(() => new NotFound()));',
  D9: 'work.pipe(Effect.mapError((cause) => new NotFound(cause)));',
  D10: "Effect.tryPromise({ try: () => fetch('x'), catch: () => new NotFound() });",
  D11: 'work.pipe(Effect.match({ onFailure: () => null, onSuccess: (n) => n }));',
  D12: 'work.pipe(Effect.catch((_) => Effect.succeed(0)));',
  D13: 'work.pipe(Effect.catch(({ message }) => log(message)));',
  D14: 'Effect.catch(Effect.tapError(work, (e) => log(e)), () => Effect.succeed(0));',
} as const;
type StressRow = keyof typeof stressSnippets;
const stressRows = Object.keys(stressSnippets) as StressRow[];
// The rows whose L or D column says "yes"; every other row is valid for that rule.
const ladderRows: ReadonlySet<StressRow> = new Set(['S2', 'S3', 'S4', 'S7', 'S11', 'S14', 'S16']);
const discardRows: ReadonlySet<StressRow> = new Set(['D1', 'D2', 'D7', 'D8', 'D10', 'D11', 'D12']);
// S8 and D4 are the same snippet, and RuleTester rejects a repeated case.
const stressCases = (reported: ReadonlySet<StressRow>, expected: boolean): string[] => [
  ...new Set(
    stressRows
      .filter((row) => reported.has(row) === expected)
      .map((row) => withEffectAndPipe(stressSnippets[row])),
  ),
];

// Repo rows (R1 to R27) whose shape no stress snippet covers; R4 shares S12's shape.
run('no-pipe-ladder', {
  invalid: [
    ...stressCases(ladderRows, true),
    // Inline andThen in its data-first spelling.
    withEffect('Effect.forEach(items, (item) => Effect.andThen(load(item), (x) => save(x)));'),
    // Each offending level of a pyramid reports once.
    {
      code: withEffect(
        'a.pipe(Effect.flatMap((x) => b.pipe(Effect.flatMap((y) => c.pipe(Effect.flatMap((z) => d(x, y, z)))))));',
      ),
      expectedErrors: 2,
    },
    // A nested step callback is judged on its own: its ladder is not also the outer callback's.
    withEffect(
      'work.pipe(Effect.flatMap((x) => other(x).pipe(Effect.catch((e) => log(e).pipe(Effect.flatMap(() => fallback(x)))))));',
    ),
    // Two continuations in one callback are one ladder.
    withEffect(
      'Effect.flatMap((x) => a.pipe(Effect.tap((y) => f(y)), Effect.flatMap((z) => g(x, z))));',
    ),
    // R6: t3code apps/server/src/provider/Layers/CodexSessionRuntime.ts:2404.
    withEffect(
      'child.exitCode.pipe(Effect.flatMap((exitCode) => Ref.get(closedRef).pipe(Effect.flatMap((closed) => { if (closed) { return Effect.void; } return report(exitCode); }))));',
    ),
    // R8: t3code apps/server/src/provider/makeManagedServerProvider.ts:252.
    withEffect(
      'getRefreshInterval.pipe(Effect.flatMap((refreshInterval) => Effect.raceFirst(tick, change).pipe(Effect.flatMap((intervalElapsed) => refresh(intervalElapsed, refreshInterval)))));',
    ),
    // R9: t3code apps/desktop/src/app/DesktopObservability.ts:291 (also a discard).
    withEffect(
      'work.pipe(Effect.catch(() => refreshFileSize(fs, path).pipe(Effect.flatMap((size) => Ref.set(currentSize, size)))));',
    ),
    // R18: executor packages/core/api/src/observability.ts:107, a handler callback.
    withEffect(
      "work.pipe(Effect.catchTag('StorageError', (err) => resolveCapture.pipe(Effect.flatMap((c) => c.captureException(Cause.fail(err))), Effect.flatMap((traceId) => Effect.fail(new InternalError({ traceId }))))));",
    ),
    // R23: effect-solutions packages/website/scripts/generate-og/browser.ts:11, a release callback.
    withEffect(
      "Effect.acquireRelease(launch, (browser) => Effect.promise(() => browser.close()).pipe(Effect.tap(() => Console.log('Browser closed'))));",
    ),
    // R24: effect packages/effect/test/encoding/SchemaBinary.test.ts:312.
    withEffect(
      "Effect.forEach(values, (value) => encode(value).pipe(Effect.flatMap((bytes) => Effect.yieldNow.pipe(Effect.as(bytes)))), { concurrency: 'unbounded' });",
    ),
    // Other step members: tapError, acquireUseRelease, catchCause.
    withEffect('work.pipe(Effect.tapError((e) => report(e).pipe(Effect.tap((id) => log(id)))));'),
    withEffect(
      'Effect.acquireUseRelease(open, (handle) => read(handle).pipe(Effect.flatMap((data) => parse(data))), close);',
    ),
    withEffect(
      'work.pipe(Effect.catchCause((cause) => Effect.flatMap(Effect.log(cause), () => fallback)));',
    ),
    // Handler-object values of catchTags, catchReasons, matchEffect, and matchCauseEffect, in
    // both layouts, method syntax, and through a satisfies wrapper.
    withEffect(
      'Effect.catchTags(work, { Failure: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) });',
    ),
    withEffect(
      'work.pipe(Effect.catchTags({ Failure(e) { return log(e).pipe(Effect.andThen(() => save(e))); } }));',
    ),
    withEffect(
      'Effect.catchTags(work, { Failure: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) } satisfies Handlers);',
    ),
    withEffect(
      "Effect.catchReasons(work, 'AiError', { RateLimit: (r) => wait(r).pipe(Effect.flatMap(() => retry(r))) });",
    ),
    withEffect(
      'work.pipe(Effect.matchEffect({ onFailure: (e) => log(e).pipe(Effect.flatMap(() => fallback)), onSuccess: Effect.succeed }));',
    ),
    withEffect(
      'Effect.matchCauseEffect(work, { onFailure: Effect.failCause, onSuccess: (a) => save(a).pipe(Effect.tap((id) => log(id))) });',
    ),
    // Type assertions around either callback, and a computed tag key, are no escape.
    withEffect(
      'work.pipe(Effect.flatMap(((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(user, posts)))) as Handler));',
    ),
    withEffect(
      'work.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap(((posts) => save(user, posts)) satisfies Next))));',
    ),
    withEffect(
      'Effect.catchTags(work, { [tag]: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) });',
    ),
    // Barrel and aliased Effect bindings.
    "import { Effect as Fx } from 'effect';\nwork.pipe(Fx.flatMap((x) => other(x).pipe(Fx.flatMap((y) => save(x, y)))));",
  ],
  valid: [
    ...stressCases(ladderRows, false),
    // Without a runtime Effect binding no call is bound: no import, type-only imports, a shadow.
    stressSnippets.S2,
    `import type * as Effect from 'effect/Effect';\n${stressSnippets.S2}`,
    `import { type Effect } from 'effect';\n${stressSnippets.S2}`,
    withEffect(`const run = (Effect) => ${stressSnippets.S2}`),
    // R19: executor packages/core/sdk/src/executor.ts:3215, a value map in a loop body.
    withEffect(
      'Effect.forEach(rows, (row) => describeAuthMethodsForRow(row).pipe(Effect.map((authMethods) => rowToIntegration(row, authMethods))));',
    ),
    // R1: t3code apps/server/src/serverRuntimeStartup.ts:161, a one-step handler.
    withEffect(
      "getCounts().pipe(Effect.catch((cause) => Effect.logWarning('failed', { cause }).pipe(Effect.as({ threadCount: 0, projectCount: 0 }))));",
    ),
    // R3: t3code scripts/sync-reference-repos.ts:240, and structural members around a continuation.
    withEffect(
      "Effect.all([collect(child.stdout), collect(child.stderr), child.exitCode.pipe(Effect.map(Number))], { concurrency: 'unbounded' });",
    ),
    withEffect('Effect.all([a.pipe(Effect.flatMap((x) => b(x)))]);'),
    withEffect('Effect.forkChild(a.pipe(Effect.flatMap((x) => b(x))));'),
    withEffect('Effect.scoped(a.pipe(Effect.flatMap((x) => b(x))));'),
    // A generator frame holds its own continuations.
    withEffect(
      'getUser.pipe(Effect.flatMap((user) => Effect.gen(function* () { return yield* fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(posts))); })));',
    ),
    // R5 (t3code apps/server/src/provider/Layers/ProviderRegistry.ts:556) and R11 (t3code
    // apps/server/src/desktopUpdate/DesktopAppUpdate.ts:92): opaque or value continuations.
    withEffect(
      'providerSource.refresh.pipe(Effect.flatMap((nextProvider) => correlate(providerSource, nextProvider).pipe(Effect.flatMap(syncProvider))));',
    ),
    withEffect(
      'current.pipe(Effect.flatMap((previous) => previous === stage ? Effect.void : Ref.set(lastStage, stage).pipe(Effect.andThen(reportProgress(stage)))));',
    ),
    // R7 (t3code apps/server/src/pullRequest/PullRequestService.ts:2542): one closure, adornment.
    withEffect(
      'Effect.flatMap(Clock.currentTimeMillis, (now) => { const recorded = record(now); return revalidate(recorded).pipe(Effect.as(snapshot.value)); });',
    ),
    // R10 (t3code apps/server/src/provider/Layers/CodexAdapter.ts:2713): a flat finalizer.
    withEffect(
      'Effect.acquireRelease(Effect.void, () => stopAll().pipe(Effect.andThen(Queue.shutdown(q)), Effect.andThen(close), Effect.ignore));',
    ),
    // R15 (t3code apps/server/src/resourceTelemetry/NativeTelemetryClient.ts:758).
    withEffect(
      'Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : Ref.update(state, markUnavailable).pipe(Effect.andThen(publishHealth)));',
    ),
    // Shapes the pipeline-nesting contract used to report: a one-step pipeline in a callback, a
    // pipeline in argument position, nested standalone pipes, adornment-only handler-map values,
    // and a pipeline in a conditional receiver.
    withEffect('work.pipe(Effect.flatMap((x) => other.pipe(Effect.map(f), Effect.catch(g))));'),
    withEffect('work.pipe(Effect.zip(other.pipe(Effect.map(f))));'),
    withEffectAndPipe('pipe(pipe(work, Effect.map(f)), Effect.catch(g));'),
    withEffect('Effect.catchTags(work, { Failure: () => fallback.pipe(Effect.map(f)) });'),
    withEffect('(cond ? other.pipe(Effect.map(f)) : fallback).pipe(Effect.catch(recover));'),
    `${effectImport}import * as Schedule from 'effect/Schedule';\nEffect.retry(work, Schedule.exponential('1 second').pipe(Schedule.both(Schedule.recurs(3))));`,
    // A continuation outside any step callback, including inside a non-Effect callback.
    withEffect('a.pipe(Effect.flatMap((x) => b(x)));'),
    withEffect('items.map((item) => load(item).pipe(Effect.flatMap((x) => save(x))));'),
    // Members outside the step set own no ladder: map transforms a value, sync runs no effect,
    // and match handlers return values.
    withEffect('work.pipe(Effect.map((x) => other(x).pipe(Effect.flatMap((y) => save(y)))));'),
    withEffect('Effect.sync(() => a.pipe(Effect.flatMap((x) => b(x))));'),
    withEffect(
      'Effect.match(work, { onFailure: (e) => log(e).pipe(Effect.flatMap(() => fallback)), onSuccess: f });',
    ),
    // Function declarations, class bodies, and generator methods stop the search.
    withEffect(
      'work.pipe(Effect.flatMap(() => { function helper() { return a.pipe(Effect.flatMap((x) => b(x))); } return helper(); }));',
    ),
    withEffect(
      'work.pipe(Effect.flatMap(() => new (class { run() { return a.pipe(Effect.flatMap((x) => b(x))); } })().run()));',
    ),
    withEffect(
      'Effect.catchTags(work, { *Failure() { return yield* a.pipe(Effect.flatMap((x) => b(x))); } });',
    ),
    // Only a verified handler-object position is followed: not an unrelated object, a nested
    // object, or a getter.
    withEffect(
      'const handlers = { Failure: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) };',
    ),
    withEffect(
      'Effect.catchTags(work, { Failure: { nested: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) } });',
    ),
    withEffect(
      'Effect.catchTags(work, { get Failure() { return log(e).pipe(Effect.flatMap((id) => save(id))); } });',
    ),
  ],
});

// The report sits on the inner continuation, not on the outer step call.
ruleTester.run('no-pipe-ladder location', requireRule('no-pipe-ladder'), {
  invalid: [
    {
      code: withEffect(
        'getUser.pipe(\n  Effect.flatMap((user) =>\n    fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(user, posts))),\n  ),\n);',
      ),
      // oxlint's RuleTester columns are zero-based.
      errors: [{ column: 29, line: 4, message: ruleMessage('no-pipe-ladder') }],
    },
  ],
  valid: [],
});

run('no-discarded-failure', {
  invalid: [
    ...stressCases(discardRows, true),
    // R9: t3code apps/desktop/src/app/DesktopObservability.ts:291 (also a ladder).
    withEffect(
      'work.pipe(Effect.catch(() => refreshFileSize(fs, path).pipe(Effect.flatMap((size) => Ref.set(currentSize, size)))));',
    ),
    // R12: t3code packages/client-runtime/src/authorization/service.ts:204.
    withEffect(
      "proof.pipe(Effect.mapError(() => new ConnectionBlockedError({ reason: 'configuration', detail: 'Could not create the websocket authorization proof.' })));",
    ),
    // R14: t3code scripts/mock-update-server.ts:63; R21: effect-solutions update-notifier.ts:40.
    withEffect('Effect.try({ try: () => decodeURIComponent(rawPath), catch: () => null });'),
    withEffect("Effect.tryPromise({ try: () => readFile(file, 'utf8'), catch: () => null });"),
    // R16: executor registry.ts:135; R17: executor executor.ts:3147.
    withEffect('fs.stat(cacheFile).pipe(Effect.catch(() => Effect.succeed(undefined)));'),
    withEffect('listSources.pipe(Effect.catchCause(() => Effect.succeed([])));'),
    // R20: executor hosted-http-client.ts:144 and R26: effect ai-docs 10_creating-effects.ts:61,
    // content-free sources (accepted limitation D).
    withEffect(
      "Effect.try({ try: () => new URL(value), catch: () => new HostedOutboundRequestBlocked({ url: value, reason: 'URL is invalid' }) });",
    ),
    withEffect(
      'Effect.fromNullishOr(header).pipe(Effect.mapError(() => new MissingWorkspaceId()));',
    ),
    // R22: effect-solutions packages/cli/src/cli.ts:197 as the table quotes it, without the
    // tapError the real site has; R25: effect HttpServerRequest.test.ts:18.
    withEffect('main.pipe(Effect.catch(() => Effect.sync(() => process.exit(1))));'),
    withEffect('Effect.tryPromise({ try: () => webRequest.formData(), catch: () => undefined });'),
    // R27: effect ai-docs 01_error-handling.ts:29, only the final blanket catch reports.
    withEffect(
      "loadPort('invalid').pipe(Effect.catchTag('ReservedPortError', (_) => Effect.succeed(3000)), Effect.catch((_) => Effect.succeed(3000)));",
    ),
    // Every blanket member and handler key, data-first layouts, and function syntax.
    withEffect('Effect.catchDefect(work, () => Effect.succeed(0));'),
    withEffect('work.pipe(Effect.catchEager(() => Effect.succeed(0)));'),
    withEffect('Effect.mapError(work, () => new Failure());'),
    withEffect('Effect.catch(work, function () { return fallback; });'),
    withEffect('Effect.matchCause(work, { onFailure: () => 0, onSuccess: (n) => n });'),
    withEffect(
      'work.pipe(Effect.matchEffect({ onFailure: () => Effect.succeed(0), onSuccess: Effect.succeed }));',
    ),
    withEffect(
      'work.pipe(Effect.matchCauseEffect({ onFailure: () => Effect.succeed(0), onSuccess: Effect.succeed }));',
    ),
    withEffect('Effect.matchEager(work, { onFailure: () => 0, onSuccess: (n) => n });'),
    withEffect('work.pipe(Effect.mapBoth({ onFailure: () => new Failure(), onSuccess: f }));'),
    withEffect('Effect.try({ try: work, catch() { return null; } });'),
    withEffect("Effect.try({ try: work, 'catch': () => null });"),
    withEffect('Effect.tryPromise({ try: work, catch: () => null } satisfies Options);'),
    // A type assertion around the handler is no escape.
    withEffect('work.pipe(Effect.catch((() => fallback) as RecoveryHandler));'),
    withEffect('Effect.try({ try: work, catch: (() => null) satisfies Handler });'),
    // The last definition of the handler property is the effective one.
    withEffect('Effect.try({ try: work, catch: (cause) => wrap(cause), catch: () => null });'),
    // A plain parameter the body never references is unread, including one with a default, one
    // spelled only as an object key or member property, and beside a TypeScript this parameter.
    withEffect('work.pipe(Effect.catch((error) => fallback));'),
    withEffect('work.pipe(Effect.mapError((error = fallback) => new Failure()));'),
    withEffect('work.pipe(Effect.mapError((error) => new Failure({ error: true })));'),
    withEffect('work.pipe(Effect.mapError((cause) => new Failure({ detail: state.cause })));'),
    withEffect('Effect.catch(work, function (this: Context) { return this.fallback; });'),
    // A name inside type syntax reads nothing at runtime.
    withEffect('work.pipe(Effect.mapError((cause) => ({}) as { cause?: string }));'),
    withEffect('work.pipe(Effect.mapError((error) => new Failure() as Failure<typeof error>));'),
    // A tap after the recovery, in an enclosing pipeline, or unbound records nothing first.
    withEffect('work.pipe(Effect.catch(() => fallback), Effect.tapError(log));'),
    withEffect(
      'work.pipe(Effect.tapError(log), Effect.flatMap(() => other.pipe(Effect.catch(() => fallback))));',
    ),
    withEffect('work.pipe(tapError(log), Effect.catch(() => fallback));'),
    // Barrel and aliased Effect bindings.
    "import { Effect as Fx } from 'effect';\nwork.pipe(Fx.catch(() => Fx.succeed(0)));",
  ],
  valid: [
    ...stressCases(discardRows, false),
    // Without a runtime Effect binding no call is bound: no import, type-only imports, a shadow.
    stressSnippets.D2,
    `import type * as Effect from 'effect/Effect';\n${stressSnippets.D2}`,
    `import { type Effect } from 'effect';\n${stressSnippets.D2}`,
    withEffect(`const run = (Effect) => ${stressSnippets.D2}`),
    // R13 (t3code apps/desktop/src/settings/DesktopAppSettings.ts:409) and the other named
    // discards (accepted limitation C).
    withEffect(
      'decode(raw).pipe(Effect.map(normalize), Effect.orElseSucceed(() => defaultSettings));',
    ),
    withEffect(
      'work.pipe(Effect.ignore, Effect.ignoreCause, Effect.option, Effect.result, Effect.exit);',
    ),
    // R1, R2 (t3code apps/server/src/auth/SessionStore.ts:589), and R15: the error is read.
    withEffect(
      "getCounts().pipe(Effect.catch((cause) => Effect.logWarning('failed', { cause }).pipe(Effect.as(0))));",
    ),
    withEffect(
      "Effect.catchCause((cause) => Effect.logError('failed').pipe(Effect.annotateLogs({ sessionId, cause })));",
    ),
    withEffect(
      'Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : Ref.update(state, markUnavailable));',
    ),
    // The other tag- or predicate-scoped members.
    withEffect('work.pipe(Effect.catchTags({ NotFound: () => Effect.succeed(0) }));'),
    withEffect("work.pipe(Effect.catchReason('AiError', 'RateLimit', () => Effect.succeed(0)));"),
    withEffect('work.pipe(Effect.catchIf(isRetryable, () => Effect.succeed(0)));'),
    withEffect('work.pipe(Effect.catchFilter(filter, () => Effect.succeed(0)));'),
    // Recorded first by the other failure taps, through a standalone pipe, and before a match.
    withEffect(
      'work.pipe(Effect.tapCause(log), Effect.map(f), Effect.catchCause(() => Effect.void));',
    ),
    withEffect('work.pipe(Effect.tapDefect(log), Effect.catchDefect(() => Effect.void));'),
    withEffectAndPipe('pipe(work, Effect.tapError(log), Effect.catch(() => fallback));'),
    withEffect(
      'work.pipe(Effect.tapError((error) => Effect.logDebug(error)), Effect.match({ onFailure: () => undefined, onSuccess: (value) => value }));',
    ),
    // Rest, destructured, shorthand, and computed-member reads.
    withEffect('work.pipe(Effect.catch((...failures) => fallback));'),
    withEffect('work.pipe(Effect.catch(([first]) => log(first)));'),
    withEffect('work.pipe(Effect.mapError((error) => new Failure({ error })));'),
    withEffect('work.pipe(Effect.mapError((key) => new Failure(messages[key])));'),
    withEffect('work.pipe(Effect.mapError((cause) => wrap(cause) as Failure));'),
    // Name matching does not model shadowing (accepted limitation F).
    withEffect('work.pipe(Effect.catch((e) => items.map((e) => e.id)));'),
    // A named handler, a thunk-only tryPromise, and the onSuccess handler are out of reach.
    withEffect('work.pipe(Effect.catch(handler));'),
    withEffect("Effect.tryPromise(() => fetch('x'));"),
    withEffect('work.pipe(Effect.match({ onFailure: (e) => e.message, onSuccess: () => 0 }));'),
    // A later definition, spread, or runtime-computed key replaces or may replace the handler.
    withEffect('Effect.try({ try: work, catch: () => null, catch: (cause) => wrap(cause) });'),
    withEffect('Effect.try({ try: work, catch: () => null, ...overrides });'),
    withEffect('Effect.try({ try: work, catch: () => null, [key]: other });'),
    // Only a verified options object is followed: not an unrelated object or a getter.
    withEffect('const options = { catch: () => null };'),
    withEffect('Effect.try({ try: work, get catch() { return () => null; } });'),
  ],
});

run('no-manual-tag-check', {
  invalid: [
    withEffect("if (error._tag === 'DomainError') handle(error);"),
    withEffect("if ('DomainError' !== error._tag) handle(error);"),
    withEffect("if ('_tag' in error) handle(error);"),
    withEffect("if (error.reason._tag === 'StatusCodeError') handle(error);"),
    withEffect("if (error['_tag'] == 'DomainError') handle(error);"),
    withEffect("if (error?._tag != 'DomainError') handle(error);"),
    withEffect("const kind = error._tag === 'DomainError' ? 'domain' : 'other';"),
    // One comparison is one diagnostic, even with a tag read on both sides.
    withEffect('if (left._tag === right._tag) handle(left);'),
  ],
  valid: [
    withEffect('Effect.log(error._tag);'),
    withEffect(`const label = \`failed with \${error._tag}\`;`),
    withEffect("Effect.catchTag('DomainError', handler);"),
    "import * as Match from 'effect/Match';\nMatch.tag('DomainError', handler);",
    withEffect('if (key in error) handle(error);'),
    withEffect('if (_tag in error) handle(error);'),
    withEffect("if (error[key] === 'DomainError') handle(error);"),
    withEffect("if (error[_tag] === 'DomainError') handle(error);"),
    "if ('_tag' in error) handle(error);",
    "import type { Effect } from 'effect';\nif ('_tag' in error) handle(error);",
  ],
});

run('no-unknown-error-message', {
  invalid: [
    withEffect('try { run(); } catch (problem) { use(problem.message); }'),
    withEffect('try { run(); } catch (problem) { use(String(problem)); }'),
    withEffect(
      'try { run(); } catch (problem) { const { message: detail } = problem; use(detail); }',
    ),
    withEffect('try { run(); } catch ({ message }) { use(message); }'),
    withEffect('Effect.tryPromise({ try: work, catch: (problem) => problem.message });'),
    withEffect('Effect.try({ try: work, catch: (problem) => String(problem) });'),
    withEffect(
      'Effect.tryPromise({ try: work, catch: ({ message }) => new Failure({ message }) });',
    ),
    withEffect("Effect.try({ try: work, catch(problem) { return problem['message']; } });"),
    withEffect('Effect.try({ try: work, catch: function (problem) { return problem.message; } });'),
    withEffect(
      'const toFailure = (problem) => problem.message;\nEffect.tryPromise({ try: work, catch: toFailure });',
    ),
    // A hoisted handler declared after its use is still the direct handler.
    withEffect(
      'Effect.tryPromise({ try: work, catch: toFailure });\nfunction toFailure(problem) { return problem.message; }',
    ),
    // A closure still reads the raw caught binding.
    withEffect('try { run(); } catch (problem) { const later = () => problem.message; later(); }'),
    // A cast or a rename-free wrapper does not make the value safe.
    withEffect('try { run(); } catch (problem) { use((problem as Error).message); }'),
    // Guards do not cross a function boundary, do not survive reassignment, and do not cover the
    // alternate branch or a different operation.
    withEffect(
      'try { run(); } catch (problem) { if (problem instanceof Error) { const later = () => problem.message; later(); } }',
    ),
    withEffect(
      'try { run(); } catch (problem) { problem = normalize(problem); if (problem instanceof Error) use(problem.message); }',
    ),
    withEffect(
      'try { run(); } catch (problem) { if (problem instanceof Error) { use(1); } else { use(problem.message); } }',
    ),
    withEffect(
      'try { run(); } catch (problem) { if (problem instanceof Error) use(String(problem)); }',
    ),
    withEffect(
      'class Error {}\ntry { run(); } catch (problem) { if (problem instanceof Error) use(problem.message); }',
    ),
    // A handler shared by two Effect.try calls is one caught binding and one diagnostic.
    withEffect(
      'const toFailure = ({ message }) => new Failure({ message });\nEffect.try({ try: work, catch: toFailure });\nEffect.tryPromise({ try: work, catch: toFailure });',
    ),
    // One declaration is one diagnostic, even with several message properties.
    // A parameter named undefined is not the global, so it proves nothing.
    withEffect(
      'function handle(undefined) { try { run(); } catch (problem) { if (problem === undefined) use(String(problem)); } }',
    ),
    // A catch after a spread still wins, and among duplicate keys the last one wins.
    withEffect(
      'Effect.tryPromise({ ...defaults, try: work, catch: (problem) => problem.message });',
    ),
    withEffect(
      'Effect.tryPromise({ try: work, catch: (cause) => new Failure({ cause }), catch: (problem) => problem.message });',
    ),
    // Assignment destructuring extracts from the unknown value like a declaration does.
    withEffect(
      'try { run(); } catch (problem) { let detail; ({ message: detail } = problem); use(detail); }',
    ),
    // Compound and logical assignments read the message first.
    withEffect("try { run(); } catch (problem) { problem.message += '!'; }"),
    withEffect("try { run(); } catch (problem) { problem.message ??= 'fallback'; }"),
    withEffect('try { run(); } catch (problem) { const { message, message: again } = problem; }'),
    // A redeclaring var initializer replaces the value, so the earlier guard proves nothing.
    withEffect(
      'try { run(); } catch (problem) { if (problem instanceof Error) { var problem = replacement; use(problem.message); } }',
    ),
    withEffect(
      "Effect.try({ try: work, catch: (problem) => { if (problem instanceof Error) { var problem = replacement; return problem.message; } return 'unknown'; } });",
    ),
    // A later plain catch property replaces an earlier accessor, so it is the handler.
    withEffect(
      'Effect.tryPromise({ try: work, get catch() { return recover; }, catch: (problem) => problem.message });',
    ),
    withEffect(
      'Effect.tryPromise({ try: work, set catch(problem) { record(problem); }, catch: (problem) => problem.message });',
    ),
    // An optional-chain read still reads the message.
    withEffect('try { run(); } catch (problem) { use(problem?.message); }'),
    // A defaulted handler parameter still binds the caught value.
    withEffect('Effect.try({ try: work, catch: (problem = fallback) => problem.message });'),
    withEffect(
      "Effect.tryPromise({ try: work, catch: ({ message } = { message: 'fallback' }) => message });",
    ),
    // A computed key or a default value inside a destructuring target is evaluated, so it reads.
    withEffect(
      'try { run(); } catch (problem) { ({ [problem.message]: detail } = notification); }',
    ),
    withEffect('try { run(); } catch (problem) { ({ value = problem.message } = notification); }'),
  ],
  valid: [
    withEffect("Effect.catchTag('Failure', (error) => Effect.succeed(error.message));"),
    withEffect('const error = notification;\nuse(error.message);'),
    withEffect('try { run(); } catch (problem) { const helper = (problem) => problem.message; }'),
    withEffect(
      'try { run(); } catch (problem) { const decoded = decodeProblem(problem); use(decoded.message); }',
    ),
    withEffect(
      'try { run(); } catch (problem) { if (problem instanceof Error) { use(problem.message); } }',
    ),
    withEffect(
      "try { run(); } catch (problem) { use(problem instanceof Error ? problem.message : 'unknown'); }",
    ),
    withEffect(
      'try { run(); } catch (problem) { use(problem instanceof Error && problem.message); }',
    ),
    withEffect(
      "try { run(); } catch (problem) { if (typeof problem === 'object' && problem !== null && 'message' in problem) { use(problem.message); } }",
    ),
    withEffect(
      'try { run(); } catch (problem) { if (problem instanceof Error) { const { message } = problem; use(message); } }',
    ),
    withEffect(
      "try { run(); } catch (problem) { if (typeof problem === 'string') { use(String(problem)); } }",
    ),
    withEffect(
      "const String = (value: unknown) => 'text';\ntry { run(); } catch (problem) { use(String(problem)); }",
    ),
    // A catch property outside a bound Effect.try options object is not a caught input.
    withEffect('const handlers = { catch: (problem) => problem.message };'),
    withEffect(
      'const run = (Effect) => Effect.tryPromise({ try: work, catch: (problem) => problem.message });',
    ),
    // Mutable handler wiring is not followed.
    withEffect(
      'let toFailure = (problem) => problem.message;\nEffect.tryPromise({ try: work, catch: toFailure });',
    ),
    withEffect('function show(error: Error) { return error.message; }'),
    withEffect(
      'try { run(); } catch (problem) { if (problem === undefined) { use(String(problem)); } }',
    ),
    // A reassigned or overridable handler binding is not the body that receives the caught value.
    withEffect(
      'function describe(problem) { return problem.message; }\ndescribe = validatedHandler;\nEffect.tryPromise({ try: work, catch: describe });',
    ),
    withEffect(
      'function describe(problem) { return problem.message; }\nEffect.tryPromise({ try: work, catch: describe, ...replacementHandlers });',
    ),
    withEffect(
      'Effect.tryPromise({ try: work, catch: (problem) => problem.message, [handlerKey]: recover });',
    ),
    withEffect(
      'Effect.tryPromise({ try: work, catch: (problem) => problem.message, catch: (cause) => new Failure({ cause }) });',
    ),
    withEffect(
      'try { run(); } catch (problem) { let detail; if (problem instanceof Error) { ({ message: detail } = problem); } use(detail); }',
    ),
    withEffect("try { run(); } catch (problem) { problem.message = 'replaced'; }"),
    withEffect('try { run(); } catch (problem) { delete problem.message; }'),
    withEffect('try { run(); } catch (problem) { delete problem?.message; }'),
    // A catch accessor after a plain catch handler is the effective definition, so the wiring is unknown.
    withEffect(
      'Effect.tryPromise({ try: work, catch: (problem) => problem.message, get catch() { return recover; } });',
    ),
    withEffect(
      'Effect.tryPromise({ try: work, catch: (cause) => new Failure({ cause }), set catch(problem) { use(problem.message); } });',
    ),
    // Destructuring and loop-head targets only write the member, directly or through a wrapper.
    withEffect('try { run(); } catch (problem) { ({ value: problem.message } = notification); }'),
    withEffect('try { run(); } catch (problem) { [problem.message] = values; }'),
    withEffect(
      "try { run(); } catch (problem) { ({ value: problem.message = 'fallback' } = notification); }",
    ),
    withEffect(
      'try { run(); } catch (problem) { ({ outer: { inner: problem.message } } = notification); }',
    ),
    withEffect('try { run(); } catch (problem) { [...problem.message] = values; }'),
    withEffect('try { run(); } catch (problem) { ({ value: (problem.message) } = notification); }'),
    withEffect("try { run(); } catch (problem) { (problem.message as string) = 'replaced'; }"),
    withEffect('try { run(); } catch (problem) { for (problem.message of values) {} }'),
    // Only a redeclaration of the caught binding voids a guard; another var does not.
    withEffect(
      'try { run(); } catch (problem) { if (problem instanceof Error) { var detail = problem.message; use(detail); } }',
    ),
    // A defaulted parameter keeps guard proofs.
    withEffect(
      "Effect.try({ try: work, catch: (problem = fallback) => (problem instanceof Error ? problem.message : 'unknown') });",
    ),
    'try { run(); } catch (problem) { use(problem.message); }',
  ],
});

run('no-string-error-channel', {
  invalid: [
    withEffect("Effect.fail('error');"),
    withEffect("Effect.fail('error' as const);"),
    withEffect("Effect.fail(('error'));"),
    withEffect("Effect.fail('error' satisfies string);"),
    withEffect(`Effect.fail(\`error \${code}\`);`),
    withEffect('Effect.fail(`error`);'),
    withEffect("const failWith = () => Effect.fail('boom');"),
    withEffect("Effect.flatMap(work, () => Effect.fail('boom'));"),
    withEffectAndPipe("const run = pipe(work, Effect.flatMap(() => Effect.fail('boom')));"),
    { code: withEffect("Effect.fail('boom');"), filename: `${process.cwd()}/src/program.test.ts` },
    "import { Effect as Fx } from 'effect';\nFx.fail('boom');",
  ],
  valid: [
    withEffect('Effect.fail(new DomainError({ reason }));'),
    withEffect('Effect.fail(error);'),
    withEffect("const reason = 'boom';\nEffect.fail(reason);"),
    withEffect("Effect.succeed('ready');"),
    withEffect('Effect.fail(sql`select 1`);'),
    withEffect('Effect.fail(...reasons);'),
    withEffect(
      "import * as Data from 'effect/Data';\nclass Timeout extends Data.TaggedError('Timeout')<{}> {}\nEffect.gen(function* () { return yield* new Timeout(); });",
    ),
    withEffect("const run = (Effect) => Effect.fail('boom');"),
    "const Effect = { fail: (value: string) => value };\nEffect.fail('boom');",
    "import type * as Effect from 'effect/Effect';\nEffect.fail('boom');",
  ],
});

// Each registry edge names a shape the owner reports and the reporter leaves alone. An edge
// without an example here fails, so a new suppression cannot land without its proof.
const ownershipEdgeExamples = new Map<string, string>([
  [
    'no-effect-call-in-effect-arg|no-effect-ladder',
    withEffect('const program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);'),
  ],
  [
    'no-effect-call-in-effect-arg|no-effect-call-in-effect-arg',
    withEffect('Effect.map(Effect.flatMap(Effect.succeed(1), f), g);'),
  ],
  [
    'no-flatmap-ladder|no-effect-call-in-effect-arg',
    withEffect('const program = Effect.flatMap(Effect.flatMap(program, f), g);'),
  ],
  [
    'no-flatmap-ladder|no-effect-ladder',
    withEffect('const program = Effect.flatten(Effect.map(Effect.succeed(1), f));'),
  ],
  [
    'no-flatmap-ladder|no-pipe-ladder',
    withEffect(
      'const program = Effect.flatMap(work, (x) => Effect.flatMap(other(x), (y) => save(x, y)));',
    ),
  ],
  [
    'no-manual-tag-check|no-effect-internal-tags',
    "import * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);",
  ],
]);

const ownershipEdgeKeys = ownershipRegistry.flatMap((edge) =>
  edge.owners.map((owner) => `${edge.reporter}|${owner}`),
);

describe('ownership registry examples', () => {
  it('cover every reporter and owner pair in the registry', () => {
    expect([...ownershipEdgeExamples.keys()].toSorted()).toStrictEqual(
      [...new Set(ownershipEdgeKeys)].toSorted(),
    );
  });
});

for (const [key, code] of ownershipEdgeExamples) {
  const [reporter = '', owner = ''] = key.split('|');
  ruleTester.run(`ownership ${key}: owner reports`, requireRule(owner), {
    invalid: [{ code, errors: [{ message: ruleMessage(owner) }] }],
    valid: [],
  });
  if (reporter !== owner) {
    ruleTester.run(`ownership ${key}: reporter defers`, requireRule(reporter), {
      invalid: [],
      valid: [code],
    });
  }
}
