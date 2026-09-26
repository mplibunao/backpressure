/* oxlint-disable @mplibunao/oxlint-standards/no-ts-nocheck -- string literal, not a real @ts-nocheck directive */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it, vi } from 'vitest';

import type { Rule } from '@oxlint/plugins';

import { catalogRuleDefinitions, catalogRules } from './rule-catalog.js';
import { ruleMessage } from './rule-messages.js';
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

run('no-effect-side-effect-wrapper', {
  invalid: [
    "import * as Effect from 'effect/Effect';\nEffect.as(setState(value), undefined);",
    "import * as Effect from 'effect/Effect';\nEffect.zipRight(Effect.logInfo('x'), next);",
    "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.as(Atom.set(atom, value), undefined);",
    // Named wrappers and pipe aliases get no exemption: the eager side effect runs either way.
    "import * as Effect from 'effect/Effect';\nconst run = () => Effect.zipRight(Effect.logInfo('x'), next);",
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.zipRight(Effect.logInfo('x'), next), Effect.map(f));",
  ],
  valid: ["import * as Effect from 'effect/Effect';\nEffect.as(program, value);"],
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
    // A pipe alias gets no exemption: the sequential Effect.all still reports.
    "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nconst run = pipe(Effect.all([Ref.set(ref, value)], { concurrency: 1 }), Effect.map(f));",
  ],
  valid: [
    "import * as Effect from 'effect/Effect';\nEffect.all([program], { concurrency: 2 });",
    "import * as Effect from 'effect/Effect';\nEffect.all([Effect.sync(() => console.log('x'))], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nEffect.all([Effect.sync(() => setState(value))], { concurrency: 1 });",
    "import * as Effect from 'effect/Effect';\nimport * as Fiber from 'effect/Fiber';\nEffect.all([Fiber.join(fiber)], { concurrency: 1 });",
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

run('no-return-null', {
  invalid: ["import * as Effect from 'effect/Effect';\nfunction value() { return null; }"],
  valid: ['function value() { return null; }'],
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

run('no-effect-internal-tags', {
  invalid: [
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
    "import * as Effect from 'effect/Effect';\nEffect.orDie(program);",
    "import * as Effect from 'effect/Effect';\nEffect.die(program);",
    "import * as Effect from 'effect/Effect';\nEffect.dieMessage('fatal');",
    "import * as Effect from 'effect/Effect';\nEffect.orDieWith(program, mapError);",
    // A pipe alias gets no exemption.
    "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.orDie(program), Effect.map(f));",
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

const effectImport = "import * as Effect from 'effect/Effect';\n";
const effectAndPipeImports = `${effectImport}import { pipe } from 'effect/Function';\n`;
const withEffect = (body: string): string => `${effectImport}${body}`;
const withEffectAndPipe = (body: string): string => `${effectAndPipeImports}${body}`;

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
    // The error-level owners report these shapes; the warning never replaces them.
    withEffect('const program = Effect.flatten(Effect.map(program, f));'),
    withEffect('function run() { return Effect.flatMap(Effect.flatMap(program, f), g); }'),
  ],
});

run('no-pipe-ladder', {
  invalid: [
    withEffect('work.pipe(Effect.flatMap((x) => other.pipe(Effect.map(f), Effect.catch(g))));'),
    withEffect('Effect.flatMap(work, (x) => other.pipe(Effect.map(f), Effect.catch(g)));'),
    withEffectAndPipe('pipe(pipe(work, Effect.map(f)), Effect.catch(g));'),
    // A qualifying pipeline inside another pipeline's step expression.
    withEffect('work.pipe(Effect.zip(other.pipe(Effect.map(f))));'),
    withEffect(
      'work.pipe(Effect.flatMap((x) => { const next = other.pipe(Effect.map(f)); return next; }));',
    ),
    // Barrel, aliased, and Function-namespace bindings of pipe.
    `${effectImport}import { pipe } from 'effect';\npipe(pipe(work, Effect.map(f)), Effect.catch(g));`,
    `${effectImport}import { pipe as flow } from 'effect/Function';\nflow(flow(work, Effect.map(f)), Effect.catch(g));`,
    `${effectImport}import * as Fn from 'effect/Function';\nFn.pipe(Fn.pipe(work, Effect.map(f)), Effect.catch(g));`,
    `${effectImport}import { Function } from 'effect';\nFunction.pipe(Function.pipe(work, Effect.map(f)), Effect.catch(g));`,
    // A chained inner segment is the same edge as its outer segment.
    withEffect(
      'work.pipe(Effect.flatMap((x) => other.pipe(Effect.map(f)).pipe(Effect.catch(g))));',
    ),
    // Each deeper pipeline is a distinct nesting edge.
    {
      code: withEffect(
        'first.pipe(Effect.flatMap(() => second.pipe(Effect.flatMap(() => third.pipe(Effect.map(f))))));',
      ),
      expectedErrors: 2,
    },
    // A const pipe alias gets no exemption.
    withEffectAndPipe('const run = pipe(pipe(Effect.succeed(1), Effect.map(f)), Effect.catch(g));'),
    // A pipeline inside a conditional receiver is nested in the outer pipeline's source, not chained.
    withEffect('(cond ? other.pipe(Effect.map(f)) : fallback).pipe(Effect.catch(recover));'),
    // Inline callbacks in a catchTags or catchReasons handler map, in both layouts.
    withEffect('Effect.catchTags(work, { Failure: () => fallback.pipe(Effect.map(f)) });'),
    withEffect('work.pipe(Effect.catchTags({ Failure: () => fallback.pipe(Effect.map(f)) }));'),
    withEffect(
      'work.pipe(Effect.catchTags({ Failure() { return fallback.pipe(Effect.map(f)); } }));',
    ),
    withEffect(
      "Effect.catchReasons(work, 'AiError', { RateLimit: () => fallback.pipe(Effect.map(f)) });",
    ),
    withEffect(
      "work.pipe(Effect.catchReasons('AiError', { RateLimit: () => fallback.pipe(Effect.map(f)) }));",
    ),
    withEffect(
      'Effect.catchTags(work, { Failure: () => fallback.pipe(Effect.map(f)) } satisfies Handlers);',
    ),
  ],
  valid: [
    // Without a runtime Effect binding no step is bound: no import, or type-only imports.
    'work.pipe(Effect.flatMap(() => other.pipe(Effect.map(f))));',
    "import type * as Effect from 'effect/Effect';\nwork.pipe(Effect.flatMap(() => other.pipe(Effect.map(f))));",
    "import { type Effect } from 'effect';\nwork.pipe(Effect.flatMap(() => other.pipe(Effect.map(f))));",
    `${effectImport}import * as Schedule from 'effect/Schedule';\nEffect.retry(work, Schedule.exponential('1 second').pipe(Schedule.both(Schedule.recurs(3))));`,
    "import * as Layer from 'effect/Layer';\nLive.pipe(Layer.provide(Base.pipe(Layer.provide(Config))));",
    "import * as Schema from 'effect/Schema';\nSchema.Struct({ name: Schema.String.pipe(Schema.minLength(1)) }).pipe(Schema.brand('User'));",
    withEffect(
      'Effect.gen(function* () { const user = yield* load.pipe(Effect.map(f), Effect.catch(g)); return user; });',
    ),
    // A generator passed to Effect.gen is its own scope, even inside a transforming callback.
    withEffect(
      'work.pipe(Effect.flatMap(() => Effect.gen(function* () { return yield* other.pipe(Effect.map(f)); })));',
    ),
    withEffect('const program = work.pipe(Effect.map(f), Effect.catch(g));'),
    // Chained pipes belong to effecttsgo/unnecessary-pipe-chain.
    withEffect('work.pipe(Effect.map(f)).pipe(Effect.catch(g));'),
    // Direct receiver chains stay chains through a non-qualifying segment or a type assertion.
    withEffect('work.pipe(Effect.map(f)).pipe(g).pipe(Effect.catch(h));'),
    withEffect('(work.pipe(Effect.map(f)) as Work).pipe(Effect.catch(g));'),
    // Opaque or bare-member steps do not make a pipeline Effect control flow.
    withEffectAndPipe('pipe(pipe(work, f), g);'),
    withEffect('work.pipe(Effect.flatMap(() => other.pipe(Effect.asVoid)));'),
    // An unbound or locally shadowed pipe is not the Effect pipe.
    withEffect('pipe(pipe(work, Effect.map(f)), Effect.catch(g));'),
    withEffectAndPipe('const run = (pipe) => pipe(pipe(work, Effect.map(f)), Effect.catch(g));'),
    // Resource callbacks and unrelated function declarations stop relationship discovery.
    withEffect('Effect.acquireRelease(open, (handle) => close(handle).pipe(Effect.map(f)));'),
    withEffect(
      'work.pipe(Effect.flatMap(() => { function helper() { return other.pipe(Effect.map(f)); } return helper(); }));',
    ),
    // Only a verified handler-map position is followed: not an unrelated object, a nested object,
    // a getter, the options slot, or another member's options object.
    withEffect('const handlers = { Failure: () => fallback.pipe(Effect.map(f)) };'),
    withEffect(
      'Effect.catchTags(work, { Failure: { nested: () => fallback.pipe(Effect.map(f)) } });',
    ),
    withEffect(
      'Effect.catchTags(work, { get Failure() { return fallback.pipe(Effect.map(f)); } });',
    ),
    withEffect('Effect.catchTags(work, handlers, { log: () => fallback.pipe(Effect.map(f)) });'),
    withEffect(
      'Effect.match(work, { onFailure: () => fallback.pipe(Effect.map(f)), onSuccess: g });',
    ),
    withEffect(
      'const run = (Effect) => Effect.catchTags(work, { Failure: () => fallback.pipe(Effect.map(f)) });',
    ),
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
