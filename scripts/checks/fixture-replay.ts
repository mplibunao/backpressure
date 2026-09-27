#!/usr/bin/env bun
/* oxlint-disable max-lines -- The replay matrix is intentionally data-dense proof material. */
// oxlint-disable-next-line @mplibunao/oxlint-standards/no-ts-nocheck -- string literal, not a real @ts-nocheck directive
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ruleManifest,
  oxlintSeverityForManifestEntry,
  presetEntriesForDomains,
  type RuleDomain,
} from '../../packages/oxlint-standards/src/rule-manifest.ts';
import { ruleMessage } from '../../packages/oxlint-standards/src/rule-messages.ts';
import {
  commandOutput,
  createTempDir,
  ensureFailure,
  ensureSuccess,
  fail,
  printLine,
  removeTempDir,
  repoRoot,
} from '../lib/script-runtime.ts';
import {
  buildOxlintStandards,
  distPluginPath,
  oxlintPackageName,
} from '../packages/oxlint-standards/package.ts';
import {
  type CommandResult,
  type RuleConfig,
  assertDiagnostic,
  assertDiagnosticCount,
  assertDiagnosticLine,
  runOxlintOnSource,
} from '../packages/oxlint-standards/real-engine.ts';
import { runReferenceCorpusReplay } from './reference-corpus-replay.ts';

const effectImportGatedRules = new Set(
  ruleManifest
    .filter(
      (entry) => entry.gating === 'effect-import' && entry.implementationStatus === 'implemented',
    )
    .map((entry) => entry.name),
);
const additionalValidControls = new Map([['no-react-state', 'useAtom(atom);\n']]);
const nonEffectFalsePositiveControls = new Map([
  ['no-json-parse', 'JSON.parse(payload);\n'],
  ['no-promise-catch', 'promise.catch(handle);\n'],
  ['no-promise-reject', 'Promise.reject(error);\n'],
  ['no-instanceof-error', 'if (error instanceof Error) throw error;\n'],
  ['no-instanceof-tagged-error', 'if (error instanceof DomainError) throw error;\n'],
  ['no-manual-tag-check', "if ('_tag' in error) handle(error);\n"],
  ['no-unknown-error-message', 'try { run(); } catch (problem) { use(problem.message); }\n'],
  [
    'no-redundant-error-factory',
    'function makeDomainError(message) { return new DomainError(message); }\n',
  ],
]);
const typeOnlyEffectFalsePositiveControls = new Map(
  [...nonEffectFalsePositiveControls].map(([ruleName, source]) => [
    ruleName,
    `import type { Effect } from 'effect';\n${source}`,
  ]),
);

const effectImportLine = "import * as Effect from 'effect/Effect';\n";
const withEffect = (body: string): string => `${effectImportLine}${body}`;
const effectAndPipeImportLines = `${effectImportLine}import { pipe } from 'effect/Function';\n`;
const withEffectAndPipe = (body: string): string => `${effectAndPipeImportLines}${body}`;
const withSchema = (body: string): string => `import * as Schema from 'effect/Schema';\n${body}`;
const withOption = (body: string): string => `import * as Option from 'effect/Option';\n${body}`;
const atomImportLines = `${effectImportLine}import { Atom } from 'effect/unstable/reactivity';\n`;
const withAtom = (body: string): string => `${atomImportLines}${body}`;

const linteffectFixtureRoot = join(repoRoot, 'test-fixtures', 'linteffect', 'tests', 'fixtures');

interface ReplayCaseOptions {
  readonly branchIds?: readonly string[];
  readonly expectedDiagnostics?: number;
  readonly expectedLine?: number;
  // Placeholder values for a rule whose message names the reported call.
  readonly messageData?: Readonly<Record<string, string>>;
  readonly sourceFileName?: string;
  // Called with the temp dir path before oxlint runs; use to seed package.json roots.
  readonly setupTempDir?: (tempDir: string) => void;
}

interface ReplayCase extends ReplayCaseOptions {
  readonly name: string;
  readonly source: string;
}

interface ReplaySuite {
  readonly diagnostic: { readonly message: string; readonly ruleName: string };
  readonly invalid: readonly ReplayCase[];
  readonly requiredBranchIds: readonly string[];
  readonly rules: RuleConfig;
  readonly valid: readonly ReplayCase[];
}

interface SuiteOptions {
  readonly invalid: readonly ReplayCase[];
  readonly message?: string;
  // Branch IDs for the generated non-Effect control, for a rule whose reference valid case is
  // exactly that control.
  readonly nonEffectControlBranchIds?: readonly string[];
  readonly requiredBranchIds?: readonly string[];
  readonly ruleName: string;
  readonly valid: readonly ReplayCase[];
}

const sourceFixture = (ruleName: string, fileName: string) =>
  readFileSync(join(linteffectFixtureRoot, ruleName, fileName), 'utf8');

const sourceCase = (
  ruleName: string,
  fileName: string,
  options: ReplayCaseOptions = {},
): ReplayCase => ({
  name: `linteffect:${ruleName}/${fileName}`,
  source: sourceFixture(ruleName, fileName),
  ...options,
});

const scenario = (name: string, source: string, options: ReplayCaseOptions = {}): ReplayCase => ({
  name,
  source,
  ...options,
});

const suite = ({
  invalid,
  nonEffectControlBranchIds = [],
  requiredBranchIds = [],
  ruleName,
  valid,
  message = ruleMessage(ruleName),
}: SuiteOptions): ReplaySuite => {
  const validWithControls = [
    ...valid,
    ...(additionalValidControls.has(ruleName)
      ? [
          scenario(
            `additional false-positive control for ${ruleName}`,
            additionalValidControls.get(ruleName) ?? '',
          ),
        ]
      : []),
    ...(effectImportGatedRules.has(ruleName)
      ? [
          scenario(
            `non-Effect file does not activate ${ruleName}`,
            nonEffectFalsePositiveControls.get(ruleName) ?? 'const value = 1;\n',
            { branchIds: nonEffectControlBranchIds },
          ),
          scenario(
            `type-only Effect import does not activate ${ruleName}`,
            typeOnlyEffectFalsePositiveControls.get(ruleName) ??
              "import type { Effect } from 'effect';\nconst value = 1;\n",
          ),
        ]
      : []),
  ];
  return {
    diagnostic: { message, ruleName },
    invalid,
    requiredBranchIds,
    rules: { [ruleName]: 'error' },
    valid: validWithControls,
  };
};

export const replaySuites = [
  suite({
    ruleName: 'no-model-overlay-cast',
    requiredBranchIds: [
      'invalid.source-named-type',
      'invalid.generic-type',
      'invalid.qualified-type',
      'invalid.array-type',
      'invalid.type-literal',
      'valid.as-const-literal',
      'valid.as-const-tuple',
      'valid.nested-call-cast',
      'valid.callback-cast',
    ],
    invalid: [
      sourceCase('no-model-overlay-cast', 'invalid-named-type.ts', {
        branchIds: ['invalid.source-named-type'],
      }),
      scenario(
        'structural branch: generic overlay cast',
        "import * as Effect from 'effect/Effect';\nconst user = value as Readonly<User>;\n",
        {
          branchIds: ['invalid.generic-type'],
        },
      ),
      scenario(
        'structural branch: qualified overlay cast',
        "import * as Effect from 'effect/Effect';\nconst user = value as Domain.User;\n",
        {
          branchIds: ['invalid.qualified-type'],
        },
      ),
      scenario(
        'structural branch: array overlay cast',
        "import * as Effect from 'effect/Effect';\nconst users = value as Array<User>;\n",
        {
          branchIds: ['invalid.array-type'],
        },
      ),
      scenario(
        'structural branch: non-bare type literal overlay cast',
        "import * as Effect from 'effect/Effect';\nconst user = value as { id: string };\n",
        {
          branchIds: ['invalid.type-literal'],
        },
      ),
    ],
    valid: [
      sourceCase('no-model-overlay-cast', 'valid-as-const-literal.ts', {
        branchIds: ['valid.as-const-literal'],
      }),
      sourceCase('no-model-overlay-cast', 'valid-as-const-tuple.ts', {
        branchIds: ['valid.as-const-tuple'],
      }),
      scenario(
        'review false-positive: nested call cast is not a direct const initializer',
        "import * as Effect from 'effect/Effect';\nconst user = makeUser(raw as User);\n",
        { branchIds: ['valid.nested-call-cast'] },
      ),
      scenario(
        'review false-positive: callback cast is not a direct const initializer',
        "import * as Effect from 'effect/Effect';\nitems.map((raw) => raw as User);\n",
        { branchIds: ['valid.callback-cast'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-switch-statement',
    invalid: [
      sourceCase('no-switch-statement', 'invalid-switch.ts'),
      sourceCase('no-switch-statement', 'invalid-switch-submodule-import.ts'),
      scenario(
        'a v4 @effect/atom-react import alone makes the file an Effect file',
        "import { useAtomValue } from '@effect/atom-react';\nexport const label = () => { switch (useAtomValue(statusAtom)) { case 'idle': return 'waiting'; default: return 'done'; } };\n",
      ),
    ],
    valid: [
      sourceCase('no-switch-statement', 'valid-match-value.ts'),
      sourceCase('no-switch-statement', 'valid-switch-without-effect.ts'),
      // Retained upstream fixture with a changed expectation: its only import is the v3
      // @effect-atom/atom-react package. check-rule-inventory registers the exception.
      sourceCase('no-switch-statement', 'invalid-switch-atom-react.ts'),
      scenario(
        'a type-only @effect/atom-react import does not activate the rule',
        "import type { AtomValue } from '@effect/atom-react';\nswitch (state) { default: break; }\n",
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-side-effect-wrapper',
    requiredBranchIds: [
      'invalid.data-first-value-slot',
      'invalid.data-last-value-slot',
      'invalid.effect-valued-value',
      'invalid.v4-atom-set-value',
      'invalid.named-wrapper-not-exempt',
      'invalid.pipe-alias-not-exempt',
      'valid.pure-values',
      'valid.data-first-source-slot',
      'valid.function-value',
      'valid.retired-v3-identities',
      'valid.invoked-generator-deferred',
      'valid.curried-atom-set',
      'invalid.curried-atom-set-eager-argument',
      'valid.spread-arguments',
      'invalid.invoked-parameter-defaults',
      'valid.uncalled-parameter-defaults',
      'invalid.class-definition-time',
      'valid.class-instance-fields',
    ],
    invalid: [
      scenario(
        'data-first Effect.as evaluates a console call in its value slot',
        withEffect("Effect.as(program, console.log('x'));\n"),
        { branchIds: ['invalid.data-first-value-slot'] },
      ),
      scenario(
        'data-first Effect.as evaluates a setState call in its value slot',
        withEffect('Effect.as(program, setState(value));\n'),
        { branchIds: ['invalid.data-first-value-slot'] },
      ),
      scenario(
        'data-last Effect.as in a pipe evaluates its only argument',
        withEffect("program.pipe(Effect.as(console.log('x')));\n"),
        { branchIds: ['invalid.data-last-value-slot'] },
      ),
      scenario(
        'an Effect log passed as the value never runs',
        withEffect("Effect.as(program, Effect.logInfo('x'));\n"),
        { branchIds: ['invalid.effect-valued-value'] },
      ),
      scenario(
        'a v4 Atom.set passed as the value never runs',
        `${effectImportLine}import { Atom } from 'effect/unstable/reactivity';\nEffect.as(program, Atom.set(count, 1));\n`,
        { branchIds: ['invalid.v4-atom-set-value'] },
      ),
      scenario(
        'a later-v4 Atom.set passed data-last as the value never runs',
        `${effectImportLine}import * as Atom from 'effect/reactivity/Atom';\nprogram.pipe(Effect.as(Atom.set(count, 1)));\n`,
        { branchIds: ['invalid.v4-atom-set-value'] },
      ),
      scenario(
        'a named wrapper gets no exemption from the eager side effect',
        withEffect("const run = () => Effect.as(program, console.log('x'));\n"),
        { branchIds: ['invalid.named-wrapper-not-exempt'] },
      ),
      scenario(
        'a pipe alias gets no exemption from the eager side effect',
        withEffectAndPipe('const run = pipe(program, Effect.as(setState(value)));\n'),
        { branchIds: ['invalid.pipe-alias-not-exempt'] },
      ),
      scenario(
        'a curried Atom.set still evaluates an eager argument, in both Effect.as arities',
        withAtom(
          "Effect.as(Effect.succeed(1), Atom.set(console.log('x')));\nprogram.pipe(Effect.as(Atom.set(console.log('y'))));\n",
        ),
        { branchIds: ['invalid.curried-atom-set-eager-argument'], expectedDiagnostics: 2 },
      ),
      scenario(
        'an invoked generator still evaluates its parameter defaults',
        withEffect("Effect.as(Effect.succeed(1), (function* (v = console.log('now')) {})());\n"),
        { branchIds: ['invalid.invoked-parameter-defaults'] },
      ),
      scenario(
        'a static field, a static block, and a computed key run at class definition',
        withEffect(
          "Effect.as(program, class { static value = console.log('a'); });\nEffect.as(program, class { static { console.log('b'); } });\nEffect.as(program, class { [console.log('c')] = 1; });\n",
        ),
        { branchIds: ['invalid.class-definition-time'], expectedDiagnostics: 3 },
      ),
    ],
    valid: [
      scenario(
        'pure values and an unclassified call are not side effects',
        `${effectImportLine}import * as Option from 'effect/Option';\nEffect.as(program, value);\nEffect.as(program, { id: 1 });\nprogram.pipe(Effect.as(Option.some(1)));\nEffect.as(program, makeValue());\n`,
        { branchIds: ['valid.pure-values'] },
      ),
      scenario(
        'the first data-first argument is the source Effect',
        withEffect(
          "Effect.as(Effect.logInfo('x'), value);\nEffect.as(setState(value), undefined);\n",
        ),
        { branchIds: ['valid.data-first-source-slot'] },
      ),
      scenario(
        'a function value runs only when called',
        withEffect("Effect.as(program, () => console.log('x'));\n"),
        { branchIds: ['valid.function-value'] },
      ),
      scenario(
        'an invoked generator only creates an iterator, in both Effect.as arities',
        withEffect(
          "Effect.as(Effect.succeed(1), (function* () { console.log('later'); })());\nprogram.pipe(Effect.as((function* () { console.log('later'); })()));\n",
        ),
        { branchIds: ['valid.invoked-generator-deferred'] },
      ),
      scenario(
        'a spread argument leaves the Effect.as overload unknown',
        withEffect(
          "Effect.as(...([Effect.logInfo('source'), 42] as const));\nprogram.pipe(Effect.as(...[console.log('x')]));\n",
        ),
        { branchIds: ['valid.spread-arguments'] },
      ),
      scenario(
        'the defaults of a function that is never called do not run',
        withEffect("Effect.as(program, (v = console.log('later')) => v);\n"),
        { branchIds: ['valid.uncalled-parameter-defaults'] },
      ),
      scenario(
        'an instance field initializer waits for instantiation',
        withEffect("Effect.as(Effect.succeed(1), class { value = console.log('later'); });\n"),
        { branchIds: ['valid.class-instance-fields'] },
      ),
      scenario(
        'the curried Atom.set returns a function, in both Effect.as arities',
        withAtom(
          'Effect.as(Effect.succeed(1), Atom.set(1));\nprogram.pipe(Effect.as(Atom.set(1)));\n',
        ),
        { branchIds: ['valid.curried-atom-set'] },
      ),
      scenario(
        'the v3 zipRight and atom-react Atom are retired identities',
        `${effectImportLine}import { Atom } from '@effect-atom/atom-react';\nEffect.zipRight(Effect.logInfo('x'), next);\nEffect.as(program, Atom.set(count, 1));\n`,
        { branchIds: ['valid.retired-v3-identities'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-unknown-boolean-coercion-helper',
    requiredBranchIds: [
      'invalid.boolean-helper-null-match-fallback',
      'valid.boolean-helper-without-null-fallback',
      'valid.boolean-inequality-helper',
      'valid.nullable-value-fallback',
    ],
    invalid: [
      scenario(
        'source shape: typeof boolean helper in a Match.orElse null flow',
        'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value === "boolean";\nMatch.value(input).pipe(Match.orElse(() => null));\n',
        { branchIds: ['invalid.boolean-helper-null-match-fallback'] },
      ),
    ],
    valid: [
      scenario(
        'allows local boolean helper without null Match fallback',
        'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value === "boolean";\n',
        { branchIds: ['valid.boolean-helper-without-null-fallback'] },
      ),
      scenario(
        'review false-positive: typeof boolean inequality is not the source helper shape',
        'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value !== "boolean";\nMatch.value(input).pipe(Match.orElse(() => null));\n',
        { branchIds: ['valid.boolean-inequality-helper'] },
      ),
      scenario(
        'review false-positive: Match.orElse must return a literal null, not a nullable value',
        'import * as Match from \'effect/Match\';\nconst coerce = (value: unknown) => typeof value === "boolean";\nMatch.value(input).pipe(Match.orElse(() => nullableValue));\n',
        { branchIds: ['valid.nullable-value-fallback'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-barrel-import',
    requiredBranchIds: [
      'invalid.named-value-import',
      'invalid.namespace-value-import',
      'valid.type-only-import',
      'valid.default-import',
      'valid.side-effect-import',
      'valid.submodule-import',
    ],
    invalid: [
      scenario(
        'effect-smol scenario: named value import from effect barrel',
        "import { Effect } from 'effect';\nEffect.succeed(1);\n",
        {
          branchIds: ['invalid.named-value-import'],
        },
      ),
      scenario(
        'effect-smol scenario: namespace value import from effect barrel',
        "import * as Effect from 'effect';\nEffect.succeed(1);\n",
        {
          branchIds: ['invalid.namespace-value-import'],
        },
      ),
    ],
    valid: [
      scenario(
        'ignores type-only barrel import',
        "import type { Effect } from 'effect';\ntype A = Effect.Effect<number>;\n",
        {
          branchIds: ['valid.type-only-import'],
        },
      ),
      scenario(
        'ignores default import shape',
        "import Effect from 'effect';\nconsole.info(Effect);\n",
        { branchIds: ['valid.default-import'] },
      ),
      scenario('ignores side-effect-only barrel import', "import 'effect';\n", {
        branchIds: ['valid.side-effect-import'],
      }),
      scenario(
        'allows submodule namespace import',
        "import * as Effect from 'effect/Effect';\nEffect.succeed(1);\n",
        {
          branchIds: ['valid.submodule-import'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-inline-schema-compile',
    requiredBranchIds: [
      'invalid.inline-struct-applied',
      'invalid.inline-from-json-string',
      'invalid.returned-decoder-factory',
      'invalid.assigned-decoder-factory',
      'invalid.inline-encoder',
      'invalid.v4-result-decoder',
      'invalid.barrel-and-alias-bindings',
      'valid.hoisted-schema-reference',
      'valid.schema-parameter',
      'valid.module-scope-construction',
      'valid.opaque-factory-call',
      'valid.predicates-and-transformations',
      'valid.local-schema-not-tracked',
    ],
    invalid: [
      scenario(
        'an inline Struct passed to a decoder that is applied at once',
        withSchema(
          'const parseUser = (input) => Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))(input);\n',
        ),
        { branchIds: ['invalid.inline-struct-applied'] },
      ),
      scenario(
        't3code scenario: an inline fromJsonString wrapper is a new schema per call',
        withSchema('const parse = (raw) => Schema.decodeSync(Schema.fromJsonString(User))(raw);\n'),
        { branchIds: ['invalid.inline-from-json-string'] },
      ),
      scenario(
        'a returned decoder factory with an inline schema',
        withSchema(
          'const makeParser = () => Schema.decodeUnknownEffect(Schema.Struct({ id: Schema.String }));\n',
        ),
        { branchIds: ['invalid.returned-decoder-factory'] },
      ),
      scenario(
        'a decoder assigned before application still rebuilds its schema',
        withSchema(
          'function parse(raw) { const decode = Schema.decodeUnknownSync(Schema.Array(Schema.String)); return decode(raw); }\n',
        ),
        { branchIds: ['invalid.assigned-decoder-factory'] },
      ),
      scenario(
        'an encoder with an inline schema',
        withSchema(
          'const write = (user) => Schema.encodeSync(Schema.Struct({ id: Schema.String }))(user);\n',
        ),
        { branchIds: ['invalid.inline-encoder'] },
      ),
      scenario(
        'the v4 Result decoder factory',
        withSchema(
          'const check = (raw) => Schema.decodeUnknownResult(Schema.Struct({ id: Schema.String }))(raw);\n',
        ),
        { branchIds: ['invalid.v4-result-decoder'] },
      ),
      scenario(
        'barrel and aliased Schema bindings',
        "import { Schema } from 'effect';\nimport * as S from 'effect/Schema';\nconst a = (raw) => Schema.decodeSync(Schema.Struct({}))(raw);\nconst b = (raw) => S.decodeSync(S.Struct({}))(raw);\n",
        { branchIds: ['invalid.barrel-and-alias-bindings'], expectedDiagnostics: 2 },
      ),
    ],
    valid: [
      scenario(
        'decoding a hoisted schema or a member reference inline reuses one schema',
        withSchema(
          'const User = Schema.Struct({ name: Schema.String });\nconst parseUser = (input) => Schema.decodeUnknownEffect(User)(input);\nconst parseModel = (input) => Schema.decodeUnknownEffect(models.User)(input);\n',
        ),
        { branchIds: ['valid.hoisted-schema-reference'] },
      ),
      scenario(
        'reference scenario: a caller-provided schema',
        withSchema(
          'const parseWith = (schema, raw) => Schema.decodeUnknownEffect(schema)(raw);\nconst makeDecoder = (schema) => Schema.decodeUnknownEffect(schema);\n',
        ),
        { branchIds: ['valid.schema-parameter'] },
      ),
      scenario(
        't3code scenario: module-scope construction runs once',
        withSchema('const decodeUser = Schema.decodeSync(Schema.Struct({ id: Schema.String }));\n'),
        { branchIds: ['valid.module-scope-construction'] },
      ),
      scenario(
        'an opaque factory call is not a recognized Schema constructor',
        withSchema('const parse = (raw) => Schema.decodeUnknownEffect(makeSchema())(raw);\n'),
        { branchIds: ['valid.opaque-factory-call'] },
      ),
      scenario(
        'predicates and transformation constructors are outside this policy',
        withSchema(
          'const isUser = (value) => Schema.is(Schema.Struct({}))(value);\nconst assertUser = (value) => Schema.asserts(Schema.Struct({}))(value);\nconst toNumber = () => Schema.String.pipe(Schema.decodeTo(Schema.Number));\n',
        ),
        { branchIds: ['valid.predicates-and-transformations'] },
      ),
      scenario(
        'a schema first assigned to a local is not tracked',
        withSchema(
          'const parse = (raw) => { const Local = Schema.Struct({}); return Schema.decodeSync(Local)(raw); };\n',
        ),
        { branchIds: ['valid.local-schema-not-tracked'] },
      ),
    ],
  }),
  suite({
    ruleName: 'prefer-effect-predicate',
    requiredBranchIds: [
      'invalid.variable-predicate-helper',
      'invalid.function-predicate-helper',
      'invalid.inline-filter-predicate',
      'invalid.submodule-predicate-helper',
      'invalid.effect-submodule-filter-predicate',
      'valid.map-callback-nullish',
    ],
    invalid: [
      scenario(
        'executor branch: variable-declared nullish predicate helper',
        "import { Predicate } from 'effect';\nconst isPresent = (value) => value !== null;\n",
        {
          branchIds: ['invalid.variable-predicate-helper'],
        },
      ),
      scenario(
        'executor branch: function-declared nullish predicate helper',
        "import { Predicate } from 'effect';\nfunction isPresent(value) { return value !== null; }\n",
        {
          branchIds: ['invalid.function-predicate-helper'],
        },
      ),
      scenario(
        'executor branch: inline .filter nullish predicate',
        "import { Predicate } from 'effect';\nitems.filter((value) => value !== null);\n",
        {
          branchIds: ['invalid.inline-filter-predicate'],
        },
      ),
      scenario(
        'executor branch: Predicate submodule import activates nullish helper guidance',
        "import * as Predicate from 'effect/Predicate';\nconst isPresent = (value) => value !== null;\n",
        {
          branchIds: ['invalid.submodule-predicate-helper'],
        },
      ),
      scenario(
        'executor branch: Effect submodule import activates inline filter guidance',
        "import * as Effect from 'effect/Effect';\nitems.filter((value) => value !== null);\n",
        {
          branchIds: ['invalid.effect-submodule-filter-predicate'],
        },
      ),
      scenario(
        'executor scenario: local nullish predicate in Effect file',
        "import { Predicate } from 'effect';\nconst isPresent = (value: string | null) => value !== null;\n",
      ),
    ],
    valid: [
      scenario(
        'leaves non-Effect predicate helpers alone',
        'const isPresent = (value: string | null) => value !== null;\n',
      ),
      scenario(
        'reference scenario: boolean equality is intentional, not nullish presence',
        "import { Predicate } from 'effect';\nconst isTrue = (value) => value === true;\n",
      ),
      scenario(
        'reference scenario: numeric narrowing predicate remains local',
        "import { Predicate } from 'effect';\nconst isPositive = (value) => value > 0;\n",
      ),
      scenario(
        'review false-positive: arbitrary map callback is not predicate-helper scope',
        "import { Predicate } from 'effect';\nitems.map((value) => value !== null);\n",
        {
          branchIds: ['valid.map-callback-nullish'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-escape-hatch',
    requiredBranchIds: [
      'invalid.escape-hatch',
      'invalid.die',
      'invalid.member-reference',
      'invalid.named-wrappers',
      'invalid.pipe-alias-not-exempt',
      'valid.typed-recovery',
      'valid.local-lookalike',
      'valid.removed-v3-names',
      'valid.justified-inline-disable',
      'valid.test-file-carveout',
    ],
    invalid: [
      scenario(
        'executor scenario: Effect.orDie escape hatch',
        withEffect('Effect.orDie(program);\n'),
        {
          branchIds: ['invalid.escape-hatch'],
        },
      ),
      scenario('Effect.die turns a reason into a defect', withEffect('Effect.die(reason);\n'), {
        branchIds: ['invalid.die'],
      }),
      scenario(
        'a piped member reference reports without a call',
        withEffect('program.pipe(Effect.orDie);\n'),
        { branchIds: ['invalid.member-reference'] },
      ),
      scenario(
        'const arrow and function wrappers get no exemption',
        withEffect(
          'const boom = () => Effect.orDie(program);\nfunction crash() { return Effect.orDie(program); }\n',
        ),
        { branchIds: ['invalid.named-wrappers'], expectedDiagnostics: 2 },
      ),
      scenario(
        'a pipe alias gets no exemption from the escape-hatch ban',
        withEffectAndPipe('const run = pipe(program, Effect.orDie);\n'),
        { branchIds: ['invalid.pipe-alias-not-exempt'] },
      ),
    ],
    valid: [
      scenario(
        'allows typed failure and recovery',
        withEffect('Effect.catch(program, handler);\nEffect.fail(new DomainError());\n'),
        { branchIds: ['valid.typed-recovery'] },
      ),
      scenario(
        'leaves local escape-hatch-shaped helper alone',
        'const Effect = { orDie: (value) => value };\nEffect.orDie(program);\n',
        { branchIds: ['valid.local-lookalike'] },
      ),
      scenario(
        'the v3-only dieMessage and orDieWith belong to the outdated-API check',
        withEffect("Effect.dieMessage('fatal');\nEffect.orDieWith(program, mapError);\n"),
        { branchIds: ['valid.removed-v3-names'] },
      ),
      scenario(
        'a justified inline disable marks an unrecoverable entry failure',
        withEffect(
          '// oxlint-disable-next-line @mplibunao/oxlint-standards/no-effect-escape-hatch -- the app cannot start without its config\nconst config = Effect.orDie(loadConfig);\n',
        ),
        { branchIds: ['valid.justified-inline-disable'] },
      ),
      scenario(
        'reference carve-out: test files may use escape hatches',
        withEffect('Effect.orDie(program);\n'),
        {
          branchIds: ['valid.test-file-carveout'],
          sourceFileName: 'src/program.test.ts',
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-redundant-primitive-cast',
    requiredBranchIds: [
      'invalid.primitive-cast',
      'valid.config-file-carveout',
      'valid.tooling-file-carveout',
    ],
    invalid: [
      scenario(
        'executor scenario: redundant primitive assertion',
        'const name = value as string;\n',
        { branchIds: ['invalid.primitive-cast'] },
      ),
    ],
    valid: [
      scenario('allows domain/model assertions', 'const user = value as User;\n'),
      scenario('allows non-primitive assertion target', 'const user = value as UserModel;\n'),
      scenario(
        'reference carve-out: config files may cast primitive values',
        'const port = value as number;\n',
        {
          branchIds: ['valid.config-file-carveout'],
          sourceFileName: 'vite.config.ts',
        },
      ),
      scenario(
        'reference carve-out: tooling scripts may cast primitive values',
        'const port = value as number;\n',
        {
          branchIds: ['valid.tooling-file-carveout'],
          sourceFileName: 'scripts/build.ts',
        },
      ),
    ],
  }),
  // Case source: docs/analysis/effect-nesting-rules-first-principles.md, section 5 (S and R rows).
  suite({
    ruleName: 'no-pipe-ladder',
    requiredBranchIds: [
      'no-pipe-ladder.invalid-reference',
      'no-pipe-ladder.valid-reference',
      'invalid.continuation-spellings',
      'invalid.reports-inner-continuation',
      'invalid.ladder-in-generator',
      'invalid.ladder-in-loop-body',
      'invalid.three-deep-reports-once',
      'invalid.each-offending-level',
      'invalid.through-array-callback',
      'invalid.handler-callbacks',
      'invalid.handler-object-values',
      'invalid.resource-callback',
      'invalid.reference-repo-ladders',
      'invalid.wrapped-callbacks-and-computed-tags',
      'invalid.barrel-alias',
      'valid.no-runtime-effect-binding',
      'valid.value-map-in-callback',
      'valid.flat-chain-and-adorned-step',
      'valid.one-step-handlers',
      'valid.structural-positions',
      'valid.generator-frame',
      'valid.opaque-continuation',
      'valid.former-pipeline-nesting',
      'valid.non-step-members',
      'valid.search-boundaries',
      'valid.unverified-callback-objects',
    ],
    invalid: [
      scenario(
        'S2: a continuation inside a flatMap callback',
        withEffect(
          'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save({ user, posts })))));\n',
        ),
        { branchIds: ['no-pipe-ladder.invalid-reference'] },
      ),
      scenario(
        'S3 and S4: data-first and standalone pipe spellings, and inline andThen',
        withEffectAndPipe(
          'Effect.flatMap(getUser, (user) => Effect.flatMap(fetchPosts(user.id), (posts) => save({ user, posts })));\npipe(getUser, Effect.flatMap((user) => pipe(fetchPosts(user.id), Effect.tap((posts) => log(posts)))));\nEffect.forEach(items, (item) => Effect.andThen(load(item), (x) => save(x)));\n',
        ),
        { branchIds: ['invalid.continuation-spellings'], expectedDiagnostics: 3 },
      ),
      scenario(
        'the report sits on the inner continuation',
        withEffect(
          'getUser.pipe(\n  Effect.flatMap((user) =>\n    fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(user, posts))),\n  ),\n);\n',
        ),
        { branchIds: ['invalid.reports-inner-continuation'], expectedLine: 4 },
      ),
      scenario(
        'S7: a ladder inside a generator that could have held it',
        withEffect(
          "Effect.gen(function* () { return yield* getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.tap(() => log('done'))))); });\n",
        ),
        { branchIds: ['invalid.ladder-in-generator'] },
      ),
      scenario(
        'S11: a ladder in a forEach body',
        withEffect(
          'Effect.forEach(items, (item) => fetchPosts(item).pipe(Effect.flatMap((posts) => save({ item, posts }))));\n',
        ),
        { branchIds: ['invalid.ladder-in-loop-body'] },
      ),
      scenario(
        'S14: three deep reports once because the middle body holds only an opaque andThen',
        withEffect(
          'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(posts).pipe(Effect.andThen(log(user)))))));\n',
        ),
        { branchIds: ['invalid.three-deep-reports-once'] },
      ),
      scenario(
        'each offending level reports once: a pyramid, a nested handler judged on its own, and two continuations in one callback',
        withEffect(
          'a.pipe(Effect.flatMap((x) => b.pipe(Effect.flatMap((y) => c.pipe(Effect.flatMap((z) => d(x, y, z)))))));\nwork.pipe(Effect.flatMap((x) => other(x).pipe(Effect.catch((e) => log(e).pipe(Effect.flatMap(() => fallback(x)))))));\nEffect.flatMap((x) => a.pipe(Effect.tap((y) => f(y)), Effect.flatMap((z) => g(x, z))));\n',
        ),
        { branchIds: ['invalid.each-offending-level'], expectedDiagnostics: 4 },
      ),
      scenario(
        'S16: an array callback adds a scope rather than resetting one',
        withEffect(
          'getUser.pipe(Effect.flatMap((user) => Effect.all(items.map((item) => fetchPosts(item).pipe(Effect.flatMap((posts) => save({ user, posts })))))));\n',
        ),
        { branchIds: ['invalid.through-array-callback'] },
      ),
      scenario(
        'R18 and R9: continuations inside catchTag, catch, tapError, and catchCause handlers',
        withEffect(
          "work.pipe(Effect.catchTag('StorageError', (err) => resolveCapture.pipe(Effect.flatMap((c) => c.captureException(Cause.fail(err))), Effect.flatMap((traceId) => Effect.fail(new InternalError({ traceId }))))));\nwork.pipe(Effect.catch(() => refreshFileSize(fs, path).pipe(Effect.flatMap((size) => Ref.set(currentSize, size)))));\nwork.pipe(Effect.tapError((e) => report(e).pipe(Effect.tap((id) => log(id)))));\nwork.pipe(Effect.catchCause((cause) => Effect.flatMap(Effect.log(cause), () => fallback)));\n",
        ),
        { branchIds: ['invalid.handler-callbacks'], expectedDiagnostics: 4 },
      ),
      scenario(
        'catchTags, catchReasons, matchEffect, and matchCauseEffect handler-object values',
        withEffect(
          "Effect.catchTags(work, { Failure: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) } satisfies Handlers);\nwork.pipe(Effect.catchTags({ Failure(e) { return log(e).pipe(Effect.andThen(() => save(e))); } }));\nEffect.catchReasons(work, 'AiError', { RateLimit: (r) => wait(r).pipe(Effect.flatMap(() => retry(r))) });\nwork.pipe(Effect.matchEffect({ onFailure: (e) => log(e).pipe(Effect.flatMap(() => fallback)), onSuccess: Effect.succeed }));\nEffect.matchCauseEffect(work, { onFailure: Effect.failCause, onSuccess: (a) => save(a).pipe(Effect.tap((id) => log(id))) });\n",
        ),
        { branchIds: ['invalid.handler-object-values'], expectedDiagnostics: 5 },
      ),
      scenario(
        'R23: effect-solutions acquireRelease release callback, and an acquireUseRelease use callback',
        withEffect(
          "Effect.acquireRelease(launch, (browser) => Effect.promise(() => browser.close()).pipe(Effect.tap(() => Console.log('Browser closed'))));\nEffect.acquireUseRelease(open, (handle) => read(handle).pipe(Effect.flatMap((data) => parse(data))), close);\n",
        ),
        { branchIds: ['invalid.resource-callback'], expectedDiagnostics: 2 },
      ),
      scenario(
        'R6, R8, and R24: t3code and effect test ladders',
        withEffect(
          "child.exitCode.pipe(Effect.flatMap((exitCode) => Ref.get(closedRef).pipe(Effect.flatMap((closed) => { if (closed) { return Effect.void; } return report(exitCode); }))));\ngetRefreshInterval.pipe(Effect.flatMap((refreshInterval) => Effect.raceFirst(tick, change).pipe(Effect.flatMap((intervalElapsed) => refresh(intervalElapsed, refreshInterval)))));\nEffect.forEach(values, (value) => encode(value).pipe(Effect.flatMap((bytes) => Effect.yieldNow.pipe(Effect.as(bytes)))), { concurrency: 'unbounded' });\n",
        ),
        { branchIds: ['invalid.reference-repo-ladders'], expectedDiagnostics: 3 },
      ),
      scenario(
        'type assertions around either callback, and a computed tag key, are no escape',
        withEffect(
          'work.pipe(Effect.flatMap(((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(user, posts)))) as Handler));\nwork.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap(((posts) => save(user, posts)) satisfies Next))));\nEffect.catchTags(work, { [tag]: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) });\n',
        ),
        { branchIds: ['invalid.wrapped-callbacks-and-computed-tags'], expectedDiagnostics: 3 },
      ),
      scenario(
        'barrel alias binding',
        "import { Effect as Fx } from 'effect';\nwork.pipe(Fx.flatMap((x) => other(x).pipe(Fx.flatMap((y) => save(x, y)))));\n",
        { branchIds: ['invalid.barrel-alias'] },
      ),
    ],
    valid: [
      scenario(
        'without a runtime Effect binding no call is bound: no import, type-only imports, or a shadow',
        "getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(posts)))));\nimport type * as Effect from 'effect/Effect';\nimport { type Effect as Fx } from 'effect';\nwork.pipe(Fx.flatMap((x) => other(x).pipe(Fx.flatMap((y) => save(y)))));\n",
        { branchIds: ['valid.no-runtime-effect-binding'] },
      ),
      scenario(
        'S1, S10, and R19: a value map inside a step callback',
        withEffect(
          'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.map((posts) => ({ user, posts })))));\nEffect.forEach(items, (item) => fetchPosts(item).pipe(Effect.map((posts) => posts.length)));\nEffect.forEach(rows, (row) => describeAuthMethodsForRow(row).pipe(Effect.map((authMethods) => rowToIntegration(row, authMethods))));\n',
        ),
        { branchIds: ['valid.value-map-in-callback', 'no-pipe-ladder.valid-reference'] },
      ),
      scenario(
        'S5 and S6: a flat chain and an adorned yield* step',
        withEffect(
          "getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id)), Effect.tap((posts) => log(posts)), Effect.map((posts) => posts.length));\nEffect.gen(function* () { const posts = yield* fetchPosts(id).pipe(Effect.timeout('1 second'), Effect.mapError((cause) => new NotFound(cause))); return posts; });\n",
        ),
        { branchIds: ['valid.flat-chain-and-adorned-step'] },
      ),
      scenario(
        'S8, S9, R1, R10, and R15: one-step handlers and flat finalizers',
        withEffect(
          "work.pipe(Effect.catch((error) => log(error).pipe(Effect.as(0))));\nwork.pipe(Effect.catchTag('NotFound', (error) => log(error).pipe(Effect.andThen(Effect.succeed(0)))));\ngetCounts().pipe(Effect.catch((cause) => Effect.logWarning('failed', { cause }).pipe(Effect.as({ threadCount: 0, projectCount: 0 }))));\nEffect.acquireRelease(Effect.void, () => stopAll().pipe(Effect.andThen(Queue.shutdown(q)), Effect.andThen(close), Effect.ignore));\nEffect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : Ref.update(state, markUnavailable).pipe(Effect.andThen(publishHealth)));\n",
        ),
        { branchIds: ['valid.one-step-handlers'] },
      ),
      scenario(
        'S12 and R3: structural positions, even around a continuation',
        withEffect(
          "Effect.all([work.pipe(Effect.map(String)), work.pipe(Effect.mapError((cause) => new NotFound(cause)))], { concurrency: 'unbounded' });\nEffect.all([collect(child.stdout), collect(child.stderr), child.exitCode.pipe(Effect.map(Number))], { concurrency: 'unbounded' });\nEffect.all([a.pipe(Effect.flatMap((x) => b(x)))]);\nEffect.forkChild(a.pipe(Effect.flatMap((x) => b(x))));\nEffect.scoped(a.pipe(Effect.flatMap((x) => b(x))));\n",
        ),
        { branchIds: ['valid.structural-positions'] },
      ),
      scenario(
        'S13: a generator body is a fresh linear frame',
        withEffect(
          'getUser.pipe(Effect.flatMap((user) => Effect.gen(function* () { const posts = yield* fetchPosts(user.id); yield* save(posts); return posts; })));\ngetUser.pipe(Effect.flatMap((user) => Effect.gen(function* () { return yield* fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(posts))); })));\n',
        ),
        { branchIds: ['valid.generator-frame'] },
      ),
      scenario(
        'S15, R5, R7, and R11: opaque or value continuations and a single closure',
        withEffect(
          'getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap(save))));\nproviderSource.refresh.pipe(Effect.flatMap((nextProvider) => correlate(providerSource, nextProvider).pipe(Effect.flatMap(syncProvider))));\nEffect.flatMap(Clock.currentTimeMillis, (now) => { const recorded = record(now); return revalidate(recorded).pipe(Effect.as(snapshot.value)); });\ncurrent.pipe(Effect.flatMap((previous) => previous === stage ? Effect.void : Ref.set(lastStage, stage).pipe(Effect.andThen(reportProgress(stage)))));\n',
        ),
        { branchIds: ['valid.opaque-continuation'] },
      ),
      scenario(
        'shapes the pipeline-nesting contract reported: one-step pipelines, argument positions, nested pipes, and adornment-only handler maps',
        `${effectAndPipeImportLines}import * as Schedule from 'effect/Schedule';\nwork.pipe(Effect.flatMap((x) => other.pipe(Effect.map(f), Effect.catch(g))));\nwork.pipe(Effect.zip(other.pipe(Effect.map(f))));\npipe(pipe(work, Effect.map(f)), Effect.catch(g));\nEffect.catchTags(work, { Failure: () => fallback.pipe(Effect.map(f)) });\n(cond ? other.pipe(Effect.map(f)) : fallback).pipe(Effect.catch(recover));\nEffect.retry(work, Schedule.exponential('1 second').pipe(Schedule.both(Schedule.recurs(3))));\n`,
        { branchIds: ['valid.former-pipeline-nesting'] },
      ),
      scenario(
        'map, sync, match, and non-Effect callbacks own no ladder',
        withEffect(
          'a.pipe(Effect.flatMap((x) => b(x)));\nitems.map((item) => load(item).pipe(Effect.flatMap((x) => save(x))));\nwork.pipe(Effect.map((x) => other(x).pipe(Effect.flatMap((y) => save(y)))));\nEffect.sync(() => a.pipe(Effect.flatMap((x) => b(x))));\nEffect.match(work, { onFailure: (e) => log(e).pipe(Effect.flatMap(() => fallback)), onSuccess: f });\n',
        ),
        { branchIds: ['valid.non-step-members'] },
      ),
      scenario(
        'function declarations, class bodies, and generator methods stop the search',
        withEffect(
          'work.pipe(Effect.flatMap(() => { function helper() { return a.pipe(Effect.flatMap((x) => b(x))); } return helper(); }));\nwork.pipe(Effect.flatMap(() => new (class { run() { return a.pipe(Effect.flatMap((x) => b(x))); } })().run()));\nEffect.catchTags(work, { *Failure() { return yield* a.pipe(Effect.flatMap((x) => b(x))); } });\n',
        ),
        { branchIds: ['valid.search-boundaries'] },
      ),
      scenario(
        'callbacks outside a verified handler-object position are not step callbacks',
        withEffect(
          'const handlers = { Failure: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) };\nEffect.catchTags(work, { Failure: { nested: (e) => log(e).pipe(Effect.flatMap((id) => save(id))) } });\nEffect.catchTags(work, { get Failure() { return log(e).pipe(Effect.flatMap((id) => save(id))); } });\n',
        ),
        { branchIds: ['valid.unverified-callback-objects'] },
      ),
    ],
  }),
  suite({
    ruleName: 'prefer-schema-inferred-types',
    requiredBranchIds: [
      'prefer-schema-inferred-types.invalid-reference',
      'prefer-schema-inferred-types.valid-reference',

      'invalid.direct-struct-duplicate-type',
      'invalid.member-pipe-struct',
      'invalid.standalone-pipe-struct',
      'invalid.non-allowlisted-constructor',
    ],
    invalid: [
      scenario(
        'executor branch: direct Schema.Struct has duplicate type alias',
        "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Struct({ id: Schema.String });\ntype User = { id: string };\n",
        {
          branchIds: [
            'invalid.direct-struct-duplicate-type',
            'prefer-schema-inferred-types.invalid-reference',
          ],
        },
      ),
      scenario(
        'executor branch: Schema.Struct member pipe still matches schema model',
        "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Struct({ id: Schema.String }).pipe(annotations);\ntype User = { id: string };\n",
        {
          branchIds: ['invalid.member-pipe-struct'],
        },
      ),
      scenario(
        'executor branch: standalone pipe around Schema.Struct still matches schema model',
        "import * as Schema from 'effect/Schema';\nconst UserSchema = pipe(Schema.Struct({ id: Schema.String }), annotations);\ntype User = { id: string };\n",
        {
          branchIds: ['invalid.standalone-pipe-struct'],
        },
      ),
      scenario(
        'Ownership regression: non-allowlisted Schema constructor (Schema.Tuple) is a valid schema root',
        "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Tuple(Schema.String, Schema.Number);\ntype User = { id: string };\n",
        {
          branchIds: ['invalid.non-allowlisted-constructor'],
        },
      ),
    ],
    valid: [
      scenario(
        'allows unrelated type alias beside schema',
        "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Struct({ id: Schema.String });\ntype Account = { id: string };\n",
        { branchIds: ['prefer-schema-inferred-types.valid-reference'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-redundant-error-factory',
    requiredBranchIds: [
      'no-redundant-error-factory.invalid-reference',
      'no-redundant-error-factory.valid-reference',

      'invalid.zero-arg-forward',
      'invalid.parameter-forward',
      'invalid.parameter-member-forward',
      'invalid.object-forward',
      'invalid.literal-forward',
      'invalid.assignment-pattern-forward',
      'invalid.rest-element-forward',
      'valid.transformed-argument',
      'valid.multi-argument-constructor',
      'valid.callback-function-expression',
    ],
    invalid: [
      scenario(
        'executor branch: zero-arg helper forwards to tagged error constructor',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError() { return new DomainError(); }\n",
        { branchIds: ['invalid.zero-arg-forward'] },
      ),
      scenario(
        'executor branch: parameter forwards to tagged error constructor',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message) { return new DomainError(message); }\n",
        { branchIds: ['invalid.parameter-forward'] },
      ),
      scenario(
        'executor branch: parameter member forwards to tagged error constructor',
        "import * as Effect from 'effect/Effect';\nfunction DomainError(input) { return new TaggedDomainError(input.message); }\n",
        { branchIds: ['invalid.parameter-member-forward'] },
      ),
      scenario(
        'executor branch: object literal forwards fields to tagged error constructor',
        "import * as Effect from 'effect/Effect';\nconst DomainError = (message) => new TaggedDomainError({ message });\n",
        { branchIds: ['invalid.object-forward'] },
      ),
      scenario(
        'executor branch: literal forwards to tagged error constructor',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError() { return new DomainError('literal'); }\n",
        { branchIds: ['invalid.literal-forward'] },
      ),
      scenario(
        'Behavior regression: AssignmentPattern param (default value) is a forwardable parameter',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message = 'default') { return new DomainError(message); }\n",
        { branchIds: ['invalid.assignment-pattern-forward'] },
      ),
      scenario(
        'Behavior regression: RestElement param (...rest) is forwardable via member access',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError(...args) { return new DomainError(args[0]); }\n",
        { branchIds: ['invalid.rest-element-forward'] },
      ),
      scenario(
        'typed parameter forwards to tagged error constructor',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message: string) { return new DomainError(message); }\n",
        { branchIds: ['no-redundant-error-factory.invalid-reference'] },
      ),
    ],
    valid: [
      scenario(
        'allows typed-parameter helpers in non-Effect files',
        'function makeDomainError(message: string) { return new DomainError(message); }\n',
        { branchIds: ['no-redundant-error-factory.valid-reference'] },
      ),
      scenario(
        'allows transformed constructor arguments',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message) { return new DomainError(format(message)); }\n",
        { branchIds: ['valid.transformed-argument'] },
      ),
      scenario(
        'executor reference: multi-argument constructors are not redundant factories',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message, cause) { return new DomainError(message, cause); }\n",
        { branchIds: ['valid.multi-argument-constructor'] },
      ),
      scenario(
        'executor reference: named FunctionExpression callbacks are not helper declarations',
        "import * as Effect from 'effect/Effect';\nuseFactory(function DomainError() { return new DomainError(); });\n",
        {
          branchIds: ['valid.callback-function-expression'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-double-cast',
    requiredBranchIds: [
      'invalid.through-unknown',
      'invalid.through-any',
      'invalid.empty-allow-comment',
      'invalid.string-marker',
      'invalid.distant-comment-marker',
      'invalid.mid-node-block-comment',
      'invalid.prefix-string-marker',
      'valid.outer-unknown',
      'valid.allow-comment',
      'valid.pre-node-inline-block-comment',
      'valid.config-file-carve-out',
      'valid.tooling-file-carve-out',
    ],
    invalid: [
      scenario(
        'executor scenario: double cast through unknown',
        'const value = raw as unknown as User;\n',
        {
          branchIds: ['invalid.through-unknown'],
        },
      ),
      scenario(
        'executor scenario: double cast through any',
        'const value = raw as any as User;\n',
        {
          branchIds: ['invalid.through-any'],
        },
      ),
      scenario(
        'review branch: empty allow marker still reports',
        '// lint-allow-double-cast:\nconst value = raw as unknown as User;\n',
        {
          branchIds: ['invalid.empty-allow-comment'],
        },
      ),
      scenario(
        'review branch: string literal marker does not suppress',
        'const marker = "lint-allow-double-cast: typed boundary";\nconst value = raw as unknown as User;\n',
        {
          branchIds: ['invalid.string-marker'],
        },
      ),
      scenario(
        'review branch: non-immediate previous comment does not suppress',
        '// lint-allow-double-cast: too far away\nconst other = 1;\nconst value = raw as unknown as User;\n',
        {
          branchIds: ['invalid.distant-comment-marker'],
        },
      ),
      scenario(
        'Behavior regression: block comment inside node body is not a parsed comment; must still report',
        'const value = raw /* lint-allow-double-cast: legacy external payload boundary */ as unknown as User;\n',
        {
          branchIds: ['invalid.mid-node-block-comment'],
        },
      ),
      scenario(
        'Behavior regression: string-literal fake block comment must not suppress',
        'const value = ("prefix /* lint-allow-double-cast: reason */" as unknown) as User;\n',
        {
          branchIds: ['invalid.prefix-string-marker'],
        },
      ),
    ],
    valid: [
      scenario('allows single cast', 'const value = raw as User;\n'),
      scenario(
        'allows nested casts that do not pass through any or unknown',
        'const value = raw as Input as User;\n',
      ),
      scenario(
        'executor reference: outer unknown cast is not the forbidden double-cast shape',
        'const value = raw as User as unknown;\n',
        {
          branchIds: ['valid.outer-unknown'],
        },
      ),
      scenario(
        'reference carve-out: lint-allow-double-cast comment permits boundary cast',
        '// lint-allow-double-cast: legacy external payload boundary\nconst value = raw as unknown as User;\n',
        { branchIds: ['valid.allow-comment'] },
      ),
      scenario(
        'Behavior regression: pre-node inline block comment is in line-prefix and still suppresses',
        'const value = /* lint-allow-double-cast: legacy external payload boundary */ raw as unknown as User;\n',
        { branchIds: ['valid.pre-node-inline-block-comment'] },
      ),
      scenario(
        'executor carve-out: config files may use boundary double casts',
        'const value = raw as unknown as User;\n',
        {
          branchIds: ['valid.config-file-carve-out'],
          sourceFileName: 'eslint.config.ts',
        },
      ),
      scenario(
        'executor carve-out: tooling scripts may use boundary double casts',
        'const value = raw as unknown as User;\n',
        {
          branchIds: ['valid.tooling-file-carve-out'],
          sourceFileName: 'scripts/codegen.ts',
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-ts-nocheck',
    requiredBranchIds: [
      'invalid.ts-nocheck-directive',
      'valid.ts-expect-error-directive',
      'valid.ordinary-comment',
    ],
    invalid: [
      scenario('executor scenario: ts-nocheck directive', '// @ts-nocheck\nconst value = 1;\n', {
        branchIds: ['invalid.ts-nocheck-directive'],
      }),
    ],
    valid: [
      scenario(
        'allows targeted ts-expect-error directive',
        '// @ts-expect-error test fixture\nconst value = 1;\n',
        {
          branchIds: ['valid.ts-expect-error-directive'],
        },
      ),
      scenario('allows ordinary comments', '// regular implementation note\nconst value = 1;\n', {
        branchIds: ['valid.ordinary-comment'],
      }),
    ],
  }),
  suite({
    ruleName: 'prevent-dynamic-imports',
    requiredBranchIds: [
      'invalid.dynamic-import-expression',
      'valid.static-import',
      'valid.static-re-export',
    ],
    invalid: [
      scenario('general scenario: dynamic import expression', "const mod = import('./module');\n", {
        branchIds: ['invalid.dynamic-import-expression'],
      }),
    ],
    valid: [
      scenario(
        'allows static imports',
        "import { value } from './module';\nconsole.info(value);\n",
        { branchIds: ['valid.static-import'] },
      ),
      scenario('allows static re-exports', "export { value } from './module';\n", {
        branchIds: ['valid.static-re-export'],
      }),
    ],
  }),
  suite({
    ruleName: 'no-cross-package-relative-imports',
    requiredBranchIds: [
      'invalid.packages-cross-root',
      'invalid.apps-cross-root',
      'invalid.examples-cross-root',
      'invalid.grouped-workspace-cross-root',
      'invalid.directory-root-import',
      'valid.package-local-relative',
      'valid.package-parent-same-root',
      'valid.app-parent-same-root',
      'valid.example-parent-same-root',
    ],
    invalid: [
      scenario(
        'executor scenario: relative import crosses workspace package boundary',
        "import { value } from '../../pkg-b/value';\n",
        {
          branchIds: ['invalid.packages-cross-root'],
          sourceFileName: 'packages/pkg-a/src/file.ts',
          setupTempDir(tempDir) {
            mkdirSync(join(tempDir, 'packages', 'pkg-a'), { recursive: true });
            writeFileSync(join(tempDir, 'packages', 'pkg-a', 'package.json'), '{"name":"pkg-a"}');
            mkdirSync(join(tempDir, 'packages', 'pkg-b'), { recursive: true });
            writeFileSync(join(tempDir, 'packages', 'pkg-b', 'package.json'), '{"name":"pkg-b"}');
          },
        },
      ),
      scenario(
        'Behavior regression: grouped workspace (packages/group/pkg-a) detected as cross-package boundary',
        "import { value } from '../../../group/pkg-b/value';\n",
        {
          branchIds: ['invalid.grouped-workspace-cross-root'],
          sourceFileName: 'packages/group/pkg-a/src/file.ts',
          setupTempDir(tempDir) {
            mkdirSync(join(tempDir, 'packages', 'group', 'pkg-a'), { recursive: true });
            writeFileSync(
              join(tempDir, 'packages', 'group', 'pkg-a', 'package.json'),
              '{"name":"group-pkg-a"}',
            );
            mkdirSync(join(tempDir, 'packages', 'group', 'pkg-b'), { recursive: true });
            writeFileSync(
              join(tempDir, 'packages', 'group', 'pkg-b', 'package.json'),
              '{"name":"group-pkg-b"}',
            );
          },
        },
      ),
      scenario(
        'Behavior regression: package-root directory import resolves to package boundary correctly',
        "import { value } from '../../pkg-b';\n",
        {
          branchIds: ['invalid.directory-root-import'],
          sourceFileName: 'packages/pkg-a/src/file.ts',
          setupTempDir(tempDir) {
            mkdirSync(join(tempDir, 'packages', 'pkg-a'), { recursive: true });
            writeFileSync(join(tempDir, 'packages', 'pkg-a', 'package.json'), '{"name":"pkg-a"}');
            mkdirSync(join(tempDir, 'packages', 'pkg-b'), { recursive: true });
            writeFileSync(join(tempDir, 'packages', 'pkg-b', 'package.json'), '{"name":"pkg-b"}');
          },
        },
      ),
      scenario(
        'executor scenario: app package boundary discovered under apps',
        "import { value } from '../../api/value';\n",
        {
          branchIds: ['invalid.apps-cross-root'],
          sourceFileName: 'apps/web/src/file.ts',
          setupTempDir(tempDir) {
            mkdirSync(join(tempDir, 'apps', 'web'), { recursive: true });
            writeFileSync(join(tempDir, 'apps', 'web', 'package.json'), '{"name":"web"}');
            mkdirSync(join(tempDir, 'apps', 'api'), { recursive: true });
            writeFileSync(join(tempDir, 'apps', 'api', 'package.json'), '{"name":"api"}');
          },
        },
      ),
      scenario(
        'executor scenario: example package boundary discovered under examples',
        "import { value } from '../../demo-lib/value';\n",
        {
          branchIds: ['invalid.examples-cross-root'],
          sourceFileName: 'examples/demo/src/file.ts',
          setupTempDir(tempDir) {
            mkdirSync(join(tempDir, 'examples', 'demo'), { recursive: true });
            writeFileSync(join(tempDir, 'examples', 'demo', 'package.json'), '{"name":"demo"}');
            mkdirSync(join(tempDir, 'examples', 'demo-lib'), { recursive: true });
            writeFileSync(
              join(tempDir, 'examples', 'demo-lib', 'package.json'),
              '{"name":"demo-lib"}',
            );
          },
        },
      ),
    ],
    valid: [
      scenario('allows package-local relative import', "import { value } from './local';\n", {
        branchIds: ['valid.package-local-relative'],
        sourceFileName: 'packages/pkg-a/src/file.ts',
      }),
      scenario(
        'reference scenario: same-package parent import stays inside package root',
        "import { value } from '../shared/value';\n",
        {
          branchIds: ['valid.package-parent-same-root'],
          sourceFileName: 'packages/pkg-a/src/feature/file.ts',
        },
      ),
      scenario(
        'reference scenario: same app parent import stays inside app root',
        "import { value } from '../shared/value';\n",
        {
          branchIds: ['valid.app-parent-same-root'],
          sourceFileName: 'apps/web/src/feature/file.ts',
        },
      ),
      scenario(
        'reference scenario: same example parent import stays inside example root',
        "import { value } from '../shared/value';\n",
        {
          branchIds: ['valid.example-parent-same-root'],
          sourceFileName: 'examples/demo/src/feature/file.ts',
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-all-step-sequencing',
    requiredBranchIds: [
      'invalid.ref-set-concurrency-one',
      'invalid.pipe-as-void',
      'invalid.effect-log-step',
      'invalid.pipe-alias-not-exempt',
      'invalid.v4-atom-set-step',
      'invalid.v4-reactivity-invalidate-step',
      'valid.console-not-source-step',
      'valid.set-state-not-source-step',
      'valid.retired-v3-modules',
      'valid.curried-atom-set-step',
    ],
    invalid: [
      scenario(
        'source branch: Ref.set with concurrency one',
        "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nEffect.all([Ref.set(ref, value)], { concurrency: 1 });\n",
        {
          branchIds: ['invalid.ref-set-concurrency-one'],
        },
      ),
      scenario(
        'source branch: direct pipe asVoid',
        "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nEffect.all([Ref.set(ref, value)]).pipe(Effect.asVoid);\n",
        {
          branchIds: ['invalid.pipe-as-void'],
        },
      ),
      scenario(
        'source branch: Effect.log step',
        "import * as Effect from 'effect/Effect';\nEffect.all([Effect.logInfo('done')], { concurrency: 1 });\n",
        {
          branchIds: ['invalid.effect-log-step'],
        },
      ),
      scenario(
        'a pipe alias gets no exemption from step sequencing',
        "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nconst run = pipe(Effect.all([Ref.set(ref, value)], { concurrency: 1 }), Effect.map(f));\n",
        {
          branchIds: ['invalid.pipe-alias-not-exempt'],
        },
      ),
      scenario(
        'a v4 Atom.set step from the pinned reactivity barrel',
        withAtom('Effect.all([Atom.set(atom, value)], { concurrency: 1 });\n'),
        { branchIds: ['invalid.v4-atom-set-step'] },
      ),
      scenario(
        'a v4 Atom.set step from the later reactivity subpath',
        `${effectImportLine}import * as Atom from 'effect/reactivity/Atom';\nEffect.all([Atom.set(atom, value)], { concurrency: 1 });\n`,
        { branchIds: ['invalid.v4-atom-set-step'] },
      ),
      scenario(
        'a v4 Reactivity.invalidate step',
        `${effectImportLine}import * as Reactivity from 'effect/unstable/reactivity/Reactivity';\nEffect.all([Reactivity.invalidate(signal)], { concurrency: 1 });\n`,
        { branchIds: ['invalid.v4-reactivity-invalidate-step'] },
      ),
      scenario(
        'a v4 Reactivity.invalidate step from the later reactivity barrel',
        `${effectImportLine}import { Reactivity } from 'effect/reactivity';\nEffect.all([Reactivity.invalidate(signal)], { concurrency: 1 });\n`,
        { branchIds: ['invalid.v4-reactivity-invalidate-step'] },
      ),
    ],
    valid: [
      scenario(
        'allows non-source console step',
        "import * as Effect from 'effect/Effect';\nEffect.all([Effect.sync(() => console.log('x'))], { concurrency: 1 });\n",
        {
          branchIds: ['valid.console-not-source-step'],
        },
      ),
      scenario(
        'allows non-source setState step',
        "import * as Effect from 'effect/Effect';\nEffect.all([Effect.sync(() => setState(value))], { concurrency: 1 });\n",
        {
          branchIds: ['valid.set-state-not-source-step'],
        },
      ),
      scenario(
        'the v3 atom-react and effect/Reactivity modules no longer identify steps',
        `${effectImportLine}import { Atom } from '@effect-atom/atom-react';\nimport * as Reactivity from 'effect/Reactivity';\nEffect.all([Atom.set(atom, value), Reactivity.invalidate(signal)], { concurrency: 1 });\n`,
        { branchIds: ['valid.retired-v3-modules'] },
      ),
      scenario(
        'the curried Atom.set returns a function, not a state-changing step',
        withAtom('Effect.all([Effect.succeed(Atom.set(1))], { concurrency: 1 });\n'),
        { branchIds: ['valid.curried-atom-set-step'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-call-in-effect-arg',
    requiredBranchIds: [
      'invalid.captured-unannotated-and-conditional-sources',
      'valid.undiscriminated-conditional-argument',
      'invalid.effect-valued-transformation-argument',
      'invalid.effect-all-source',
      'invalid.dual-member-sources',
      'invalid.dual-member-proof',
      'valid.data-last-dual-sources',
      'valid.spread-arguments',
      'valid.non-effect-valued-arguments',
      'invalid.data-first-map-succeed',
      'invalid.chain-reports-once',
      'invalid.flatten-map',
      'invalid.catch-try-promise',
      'invalid.catch-tag-data-first',
      'invalid.zip-data-first',
      'invalid.const-placement',
      'invalid.named-function-return',
      'invalid.pipe-alias-placement',
      'invalid.inside-exempt-runner',
      'invalid.inside-non-transforming-const',
      'valid.data-first-identifier-source',
      'valid.callback-body-effect',
      'valid.data-last-effect-continuation',
      'valid.runner-fork-resource',
      'valid.non-transforming-outer',
      'valid.ambiguous-zip-options',
      'valid.ladder-owned-const',
      'valid.shadowed-effect',
    ],
    invalid: [
      scenario(
        'tx and fromOption are captured Effect sources',
        withEffect('Effect.map(Effect.tx(work), f);\nEffect.map(Effect.fromOption(maybe), f);\n'),
        {
          branchIds: ['invalid.captured-unannotated-and-conditional-sources'],
          expectedDiagnostics: 2,
        },
      ),
      scenario(
        'a data-first transformation is a provable Effect value that selects the zip data-first overload',
        withEffect('Effect.zip(Effect.succeed(1), Effect.flatten(work));\n'),
        { branchIds: ['invalid.effect-valued-transformation-argument'] },
      ),
      scenario(
        'Effect.all always returns an Effect, so it is a provable source',
        withEffect('Effect.map(Effect.all([first, second]), f);\n'),
        { branchIds: ['invalid.effect-all-source'] },
      ),
      scenario(
        'data-first calls of dual members are Effect sources',
        withEffect(
          'Effect.map(Effect.as(work, 1), f);\nEffect.map(Effect.provide(work, layer), f);\nEffect.flatMap(Effect.forkChild(work), f);\n',
        ),
        { branchIds: ['invalid.dual-member-sources'], expectedDiagnostics: 3 },
      ),
      scenario(
        'a dual member discriminated by a provable Effect argument selects the zip data-first overload',
        withEffect('Effect.zip(Effect.succeed(1), Effect.provide(Effect.succeed(2), layer));\n'),
        { branchIds: ['invalid.dual-member-proof'] },
      ),
      scenario(
        'data-first map over a direct Effect call',
        withEffect('Effect.map(Effect.succeed(1), f);\n'),
        { branchIds: ['invalid.data-first-map-succeed'] },
      ),
      scenario(
        'a nested data-first chain reports once at its outer link',
        withEffect('Effect.map(Effect.flatMap(Effect.succeed(1), f), g);\n'),
        { branchIds: ['invalid.chain-reports-once'] },
      ),
      scenario(
        'one-argument data-first flatten over an Effect call',
        withEffect('Effect.flatten(Effect.map(work, f));\n'),
        { branchIds: ['invalid.flatten-map'] },
      ),
      scenario(
        'data-first catch over a direct tryPromise',
        withEffect('Effect.catch(Effect.tryPromise(work), recover);\n'),
        { branchIds: ['invalid.catch-try-promise'] },
      ),
      scenario(
        'catchTag selects its data-first overload when the first argument is an Effect',
        withEffect("Effect.catchTag(Effect.tryPromise(work), 'NotFound', recover);\n"),
        { branchIds: ['invalid.catch-tag-data-first'] },
      ),
      scenario(
        'zip selects its data-first overload when the second argument is an Effect',
        withEffect('Effect.zip(Effect.succeed(1), Effect.succeed(2));\n'),
        { branchIds: ['invalid.zip-data-first'] },
      ),
      scenario(
        'const placement',
        withEffect('const program = Effect.map(Effect.succeed(1), f);\n'),
        { branchIds: ['invalid.const-placement'] },
      ),
      scenario(
        'named-function return placement',
        withEffect('function run() { return Effect.map(Effect.succeed(1), f); }\n'),
        { branchIds: ['invalid.named-function-return'] },
      ),
      scenario(
        'pipe-alias placement',
        withEffectAndPipe('const run = pipe(Effect.map(Effect.succeed(1), f), Effect.map(g));\n'),
        { branchIds: ['invalid.pipe-alias-placement'] },
      ),
      scenario(
        'an exempt runner does not hide the transformation it receives',
        withEffect('Effect.runPromise(Effect.map(Effect.succeed(1), f));\n'),
        { branchIds: ['invalid.inside-exempt-runner'] },
      ),
      scenario(
        'a non-transforming const outer call does not hide its inner transformation',
        withEffect(
          'const program = Effect.repeat(Effect.catch(Effect.tryPromise(fetchUser), handle), policy);\n',
        ),
        { branchIds: ['invalid.inside-non-transforming-const'] },
      ),
    ],
    valid: [
      scenario(
        'fromOption has no Effect-typed discriminator, so it cannot prove the zip data-first overload',
        withEffect('Effect.zip(Effect.succeed(1), Effect.fromOption(maybe));\n'),
        { branchIds: ['valid.undiscriminated-conditional-argument'] },
      ),
      scenario(
        'runner results and data-last pipeable functions are not provable Effect values',
        withEffect(
          'Effect.zip(Effect.succeed(1), Effect.runSync(Effect.succeed({ concurrent: true })));\nEffect.zip(Effect.succeed(1), Effect.map(f));\nEffect.map(Effect.runSync(work), f);\nEffect.map(Effect.runPromise(work), f);\n',
        ),
        { branchIds: ['valid.non-effect-valued-arguments'] },
      ),
      scenario(
        'data-last dual calls are pipeable functions, not Effect sources',
        withEffect(
          'Effect.map(Effect.as(1), f);\nEffect.zip(Effect.succeed(1), Effect.provide(layer));\n',
        ),
        { branchIds: ['valid.data-last-dual-sources'] },
      ),
      scenario(
        'a spread argument hides the count that selects the overload',
        withEffect(
          'Effect.andThen(Effect.succeed(1), ...([] as const));\nEffect.zip(Effect.succeed(1), ...rest);\n',
        ),
        { branchIds: ['valid.spread-arguments'] },
      ),
      scenario('data-first map over an identifier source', withEffect('Effect.map(work, f);\n'), {
        branchIds: ['valid.data-first-identifier-source'],
      }),
      scenario(
        'an Effect inside a callback is not the source',
        withEffect('Effect.flatMap(work, () => Effect.succeed(value));\n'),
        { branchIds: ['valid.callback-body-effect'] },
      ),
      scenario(
        'data-last calls whose first argument is an Effect continuation',
        withEffect(
          "Effect.andThen(Effect.succeed(2));\nEffect.zip(Effect.succeed(2), { concurrent: true });\nEffect.catchTag('NotFound', () => Effect.succeed(fallback));\n",
        ),
        { branchIds: ['valid.data-last-effect-continuation'] },
      ),
      scenario(
        'runners, forks, and resource helpers take an Effect directly',
        withEffect(
          'Effect.runPromise(Effect.gen(function* () { return 1; }));\nEffect.forkChild(Effect.gen(function* () { return 1; }));\nEffect.acquireRelease(Effect.sync(acquire), release);\nEffect.scoped(Effect.gen(function* () { return 1; }));\nEffect.ensuring(work, Effect.sync(cleanup));\n',
        ),
        { branchIds: ['valid.runner-fork-resource'] },
      ),
      scenario(
        'non-transforming or non-v4 outer calls',
        withEffect(
          "Effect.as(Effect.succeed(1), value);\nEffect.orElse(Effect.flatMap(program, f), fallback);\nEffect.provide(Effect.scoped(acquire), layer);\nEffect.bind('user', Effect.succeed(user));\n",
        ),
        { branchIds: ['valid.non-transforming-outer'] },
      ),
      scenario(
        'a second zip argument that may be options does not prove the data-first overload',
        withEffect('Effect.zip(Effect.succeed(1), other);\n'),
        { branchIds: ['valid.ambiguous-zip-options'] },
      ),
      scenario(
        'no-effect-ladder owns a deep const chain',
        withEffect('const program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);\n'),
        { branchIds: ['valid.ladder-owned-const'] },
      ),
      scenario(
        'a shadowing parameter is not the Effect namespace',
        withEffect('const run = (Effect) => Effect.map(Effect.succeed(1), f);\n'),
        { branchIds: ['valid.shadowed-effect'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-ladder',
    requiredBranchIds: [
      'invalid.const-flatmap-map-succeed',
      'invalid.const-flatmap-flatmap-succeed',
      'invalid.const-flatten-map-succeed',
      'invalid.return-map-catch-try-promise',
      'invalid.named-wrapper-not-exempt',
      'valid.callback-body-effect',
      'valid.expression-statement-ladder',
      'valid.let-initializer-ladder',
      'valid.var-initializer-ladder',
      'valid.non-transforming-outer',
      'valid.second-arg-deep-nesting',
      'valid.non-first-arg-deep-not-ladder',
    ],
    invalid: [
      scenario(
        'const data-first flatMap over a three-deep first-argument chain',
        withEffect('const program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);\n'),
        { branchIds: ['invalid.const-flatmap-map-succeed'] },
      ),
      scenario(
        'const flatMap over flatMap over an Effect call; the error owner wins over the flatMap warning',
        withEffect('const program = Effect.flatMap(Effect.flatMap(Effect.succeed(1), f), g);\n'),
        { branchIds: ['invalid.const-flatmap-flatmap-succeed'] },
      ),
      scenario(
        'const flatten over map over an Effect call',
        withEffect('const program = Effect.flatten(Effect.map(Effect.succeed(1), f));\n'),
        { branchIds: ['invalid.const-flatten-map-succeed'] },
      ),
      scenario(
        'return statement with map over catch over tryPromise',
        withEffect(
          'function run() { if (ready) { return Effect.map(Effect.catch(Effect.tryPromise(fetchUser), handle), f); } return fallback; }\n',
        ),
        { branchIds: ['invalid.return-map-catch-try-promise'] },
      ),
      scenario(
        'a named wrapper gets no exemption from the ladder',
        withEffect(
          'function run() { return Effect.flatMap(Effect.map(Effect.succeed(1), f), g); }\n',
        ),
        { branchIds: ['invalid.named-wrapper-not-exempt'] },
      ),
    ],
    valid: [
      scenario(
        'callback body Effect call is not ladder depth',
        withEffect('Effect.flatMap(program, () => Effect.succeed(value));\n'),
        { branchIds: ['valid.callback-body-effect'] },
      ),
      scenario(
        'expression statements are outside ladder scope',
        withEffect('Effect.flatMap(Effect.map(Effect.succeed(1), f), g);\n'),
        { branchIds: ['valid.expression-statement-ladder'] },
      ),
      scenario(
        'let initializers are outside ladder scope',
        withEffect('let program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);\n'),
        { branchIds: ['valid.let-initializer-ladder'] },
      ),
      scenario(
        'var initializers are outside ladder scope',
        withEffect(
          'var program = Effect.map(Effect.catch(Effect.tryPromise(fetchUser), handle), f);\n',
        ),
        { branchIds: ['valid.var-initializer-ladder'] },
      ),
      scenario(
        'the outer call must satisfy the data-first transforming contract',
        withEffect(
          'const retried = Effect.repeat(Effect.catch(Effect.tryPromise(fetchUser), handle), policy);\nconst replaced = Effect.as(Effect.map(Effect.succeed(1), f), value);\nconst recovered = Effect.orElse(Effect.flatMap(Effect.succeed(1), f), fallback);\n',
        ),
        { branchIds: ['valid.non-transforming-outer'] },
      ),
      scenario(
        'second-argument-only deep nesting is not a ladder',
        withEffect('const program = Effect.zipRight(program, Effect.map(Effect.succeed(1), f));\n'),
        { branchIds: ['valid.second-arg-deep-nesting'] },
      ),
      scenario(
        'a deep call in a later argument of the source is not ladder depth',
        withEffect('const program = Effect.flatMap(Effect.map(program, Effect.succeed(1)), g);\n'),
        { branchIds: ['valid.non-first-arg-deep-not-ladder'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-flatmap-ladder',
    requiredBranchIds: [
      'no-flatmap-ladder.invalid-reference',
      'no-flatmap-ladder.valid-reference',
      'invalid.const-callback-nested-flatmap',
      'invalid.block-callback-nested-flatmap',
      'invalid.named-wrapper-not-exempt',
      'valid.expression-statement-flatmap',
      'valid.let-initializer-flatmap',
      'valid.error-owner-data-first-nesting',
      'valid.error-owner-ladder',
      'valid.closure-ladder-owned-by-pipe-ladder',
    ],
    invalid: [
      scenario(
        'const flatMap whose callback nests another flatMap',
        withEffect('const program = Effect.flatMap(program, () => Effect.flatMap(other, f));\n'),
        {
          branchIds: [
            'invalid.const-callback-nested-flatmap',
            'no-flatmap-ladder.invalid-reference',
          ],
        },
      ),
      scenario(
        'block-bodied callback nests another flatMap',
        withEffect(
          'const program = Effect.flatMap(program, (value) => { return Effect.flatMap(other, f); });\n',
        ),
        { branchIds: ['invalid.block-callback-nested-flatmap'] },
      ),
      scenario(
        'a named wrapper gets no exemption from the flatMap ladder',
        withEffect(
          'function run() { return Effect.flatMap(program, () => Effect.flatMap(other, f)); }\n',
        ),
        { branchIds: ['invalid.named-wrapper-not-exempt'] },
      ),
    ],
    valid: [
      scenario(
        'expression statement flatMap ladder is outside scope',
        withEffect('Effect.flatMap(program, () => Effect.flatMap(other, f));\n'),
        { branchIds: ['valid.expression-statement-flatmap', 'no-flatmap-ladder.valid-reference'] },
      ),
      scenario(
        'no-pipe-ladder reports a closure ladder in a const initializer or return',
        withEffect(
          'const program = Effect.flatMap(work, (x) => Effect.flatMap(other(x), (y) => save(x, y)));\nfunction run() { return Effect.flatMap(work, (x) => Effect.flatMap(other(x), (y) => save(x, y))); }\n',
        ),
        { branchIds: ['valid.closure-ladder-owned-by-pipe-ladder'] },
      ),
      scenario(
        'let initializer flatMap ladder is outside scope',
        withEffect('let program = Effect.flatMap(program, () => Effect.flatMap(other, f));\n'),
        { branchIds: ['valid.let-initializer-flatmap'] },
      ),
      scenario(
        'no-effect-call-in-effect-arg reports data-first nesting at error, so the warning stays silent',
        withEffect(
          'const nested = Effect.flatMap(Effect.flatMap(program, f), g);\nconst flattened = Effect.flatten(Effect.map(program, f));\n',
        ),
        { branchIds: ['valid.error-owner-data-first-nesting'] },
      ),
      scenario(
        'no-effect-ladder reports a deep const chain at error, so the warning stays silent',
        withEffect('const program = Effect.flatten(Effect.map(Effect.succeed(1), f));\n'),
        { branchIds: ['valid.error-owner-ladder'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-render-side-effects',
    requiredBranchIds: [
      'no-render-side-effects.invalid-reference',
      'no-render-side-effects.valid-reference',

      'invalid.expression-statement-match-value-pipe',
      'valid.assigned-match-value-pipe',
      'valid.standalone-match-when',
    ],
    invalid: [
      scenario(
        'source branch: expression statement Match.value pipe with branch',
        "import * as Match from 'effect/Match';\nMatch.value(kind).pipe(Match.when('a', () => sideEffect()));\n",
        {
          branchIds: [
            'invalid.expression-statement-match-value-pipe',
            'no-render-side-effects.invalid-reference',
          ],
        },
      ),
    ],
    valid: [
      scenario(
        'source exclusion: assigned Match.value pipe is not render side-effect statement',
        "import * as Match from 'effect/Match';\nconst value = Match.value(kind).pipe(Match.when('a', () => 'a'));\n",
        {
          branchIds: ['valid.assigned-match-value-pipe', 'no-render-side-effects.valid-reference'],
        },
      ),
      scenario(
        'review false-positive: standalone Match.when expression is not Match.value pipe statement',
        "import * as Match from 'effect/Match';\nMatch.when('a', () => sideEffect());\n",
        {
          branchIds: ['valid.standalone-match-when'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-promise-reject',
    requiredBranchIds: [
      'invalid.promise-reject-static',
      'invalid.bound-reject-parameter-alias',
      'valid.local-reject-outside-executor',
      'valid.local-reject-helper-inside-executor',
    ],
    invalid: [
      scenario(
        'Promise.reject static call',
        "import * as Effect from 'effect/Effect';\nPromise.reject(error);\n",
        {
          branchIds: ['invalid.promise-reject-static'],
        },
      ),
      scenario(
        'bound promise reject parameter alias',
        "import * as Effect from 'effect/Effect';\nnew Promise((resolve, rejectWith) => { const fail = rejectWith; fail(error); });\n",
        {
          branchIds: ['invalid.bound-reject-parameter-alias'],
        },
      ),
    ],
    valid: [
      scenario(
        'local function named reject outside Promise executor',
        "import * as Effect from 'effect/Effect';\nconst reject = (value) => value; reject(error);\n",
        {
          branchIds: ['valid.local-reject-outside-executor'],
        },
      ),
      scenario(
        'local reject helper inside executor is not the second parameter',
        "import * as Effect from 'effect/Effect';\nnew Promise((resolve, rejectWith) => { const reject = (value) => value; reject(error); });\n",
        {
          branchIds: ['valid.local-reject-helper-inside-executor'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-manual-tag-check',
    nonEffectControlBranchIds: ['no-manual-tag-check.valid-reference'],
    requiredBranchIds: [
      'no-manual-tag-check.invalid-reference',
      'no-manual-tag-check.valid-reference',
      'invalid.generic-tag-in-check',
      'invalid.tag-equality-either-side',
      'invalid.nested-reason-tag',
      'invalid.computed-and-optional-tag',
      'valid.plain-tag-reads',
      'valid.tag-dispatch-combinators',
      'valid.runtime-key-reads',
      'valid.option-tag-owned-by-internal-tags',
    ],
    invalid: [
      scenario(
        'executor branch: generic manual _tag presence check',
        withEffect("if ('_tag' in error) handle(error);\n"),
        { branchIds: ['invalid.generic-tag-in-check', 'no-manual-tag-check.invalid-reference'] },
      ),
      scenario(
        'tag equality with the tag read on either side, one diagnostic per comparison',
        withEffect(
          "if (error._tag === 'DomainError') handle(error);\nif ('DomainError' !== error._tag) handle(error);\n",
        ),
        { branchIds: ['invalid.tag-equality-either-side'], expectedDiagnostics: 2 },
      ),
      scenario(
        'nested reason tag comparison',
        withEffect("if (error.reason._tag === 'StatusCodeError') handle(error);\n"),
        { branchIds: ['invalid.nested-reason-tag'] },
      ),
      scenario(
        'computed string-literal and optional-chain tag reads are static',
        withEffect(
          "if (error['_tag'] == 'DomainError') handle(error);\nif (error?._tag != 'DomainError') handle(error);\n",
        ),
        { branchIds: ['invalid.computed-and-optional-tag'], expectedDiagnostics: 2 },
      ),
    ],
    valid: [
      scenario(
        'reading a tag without branching on it',
        withEffect(`Effect.log(error._tag);\nconst label = \`failed with \${error._tag}\`;\n`),
        { branchIds: ['valid.plain-tag-reads'] },
      ),
      scenario(
        'tag dispatch through Effect and Match',
        `${effectImportLine}import * as Match from 'effect/Match';\nEffect.catchTag('DomainError', handler);\nMatch.tag('DomainError', handler);\n`,
        { branchIds: ['valid.tag-dispatch-combinators'] },
      ),
      scenario(
        'runtime keys and identifiers named _tag are not static tag reads',
        withEffect(
          "if (key in error) handle(error);\nif (_tag in error) handle(error);\nif (error[key] === 'DomainError') handle(error);\nif (error[_tag] === 'DomainError') handle(error);\n",
        ),
        { branchIds: ['valid.runtime-key-reads'] },
      ),
      scenario(
        'ownership boundary: Option Some tag is owned by no-effect-internal-tags',
        "import * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);\n",
        { branchIds: ['valid.option-tag-owned-by-internal-tags'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-internal-tags',
    requiredBranchIds: [
      'invalid.option-some-tag',
      'invalid.barrel-option-some-tag',
      'invalid.result-success-tag',
      'invalid.barrel-result-failure-tag',
      'invalid.cause-reason-tags',
      'valid.bare-effect-import',
      'valid.option-import-success-tag',
      'valid.exit-import-some-tag',
      'valid.v3-representations',
    ],
    invalid: [
      scenario(
        'imported Option module reports Option tag',
        "import * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);\n",
        {
          branchIds: ['invalid.option-some-tag'],
        },
      ),
      scenario(
        'barrel Option import reports Option tag',
        "import { Option } from 'effect';\nif (option._tag === 'Some') use(option);\n",
        {
          branchIds: ['invalid.barrel-option-some-tag'],
        },
      ),
      scenario(
        'executor branch: Result import reports the v4 Success tag',
        "import * as Result from 'effect/Result';\nif (result._tag === 'Success') use(result);\n",
        { branchIds: ['invalid.result-success-tag'] },
      ),
      scenario(
        'executor branch: barrel Result import reports the v4 Failure tag',
        "import { Result } from 'effect';\nif (result._tag === 'Failure') use(result);\n",
        { branchIds: ['invalid.barrel-result-failure-tag'] },
      ),
      scenario(
        'Cause import reports each v4 reason tag',
        "import * as Cause from 'effect/Cause';\nif (reason._tag === 'Fail') f();\nif (reason._tag === 'Die') f();\nif (reason._tag === 'Interrupt') f();\n",
        { branchIds: ['invalid.cause-reason-tags'], expectedDiagnostics: 3 },
      ),
    ],
    valid: [
      scenario(
        'bare effect import without data module does not activate rule',
        "import { Effect } from 'effect';\nif (option._tag === 'Some') use(option);\n",
        {
          branchIds: ['valid.bare-effect-import'],
        },
      ),
      scenario(
        'review false-positive: Option import does not own Success tag',
        "import * as Option from 'effect/Option';\nif (result._tag === 'Success') use(result);\n",
        {
          branchIds: ['valid.option-import-success-tag'],
        },
      ),
      scenario(
        'review false-positive: Exit import does not own Some tag',
        "import * as Exit from 'effect/Exit';\nif (option._tag === 'Some') use(option);\n",
        {
          branchIds: ['valid.exit-import-some-tag'],
        },
      ),
      scenario(
        'v3 Cause combinator, Either, and Result Left tags are not v4 representations',
        "import * as Cause from 'effect/Cause';\nimport * as Either from 'effect/Either';\nimport * as Result from 'effect/Result';\nif (cause._tag === 'Sequential') f();\nif (either._tag === 'Left') f();\nif (result._tag === 'Right') f();\n",
        { branchIds: ['valid.v3-representations'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-unknown-error-message',
    requiredBranchIds: [
      'invalid.optional-chain-message-read',
      'valid.optional-chain-delete',
      'valid.accessor-catch-property',
      'invalid.plain-catch-after-accessor',
      'invalid.redeclaring-var-voids-guard',
      'invalid.defaulted-handler-parameter',
      'invalid.evaluated-pattern-parts-read',
      'valid.pattern-write-targets',
      'valid.unrelated-var-and-defaulted-guard',
      'invalid.shadowed-undefined-guard',
      'invalid.effective-catch-property',
      'invalid.assignment-destructure',
      'invalid.compound-assignment-read',
      'valid.global-undefined-guard',
      'valid.reassigned-or-overridden-handler',
      'valid.guarded-assignment-destructure',
      'valid.plain-message-assignment',
      'valid.delete-message-operand',
      'invalid.catch-clause-message-read',
      'invalid.catch-clause-string-conversion',
      'invalid.catch-clause-destructure',
      'invalid.catch-parameter-destructure',
      'invalid.try-promise-handler-read',
      'invalid.try-handler-string-conversion',
      'invalid.handler-parameter-destructure',
      'invalid.object-method-handler',
      'invalid.const-and-declared-handlers',
      'invalid.captured-caught-binding',
      'invalid.cast-is-not-a-proof',
      'invalid.guard-voided-by-boundary-or-write',
      'valid.typed-catch-tag-handler',
      'valid.error-named-local',
      'valid.shadowing-inner-parameter',
      'valid.decoded-binding',
      'valid.error-instance-guard',
      'valid.object-message-guard',
      'valid.primitive-guard',
      'valid.shadowed-string',
      'valid.unrelated-catch-property',
      'valid.mutable-handler-not-followed',
    ],
    invalid: [
      scenario(
        'a later plain catch property replaces an earlier accessor and is the handler',
        withEffect(
          'Effect.tryPromise({ try: work, get catch() { return recover; }, catch: (problem) => problem.message });\nEffect.tryPromise({ try: work, set catch(problem) { record(problem); }, catch: (problem) => problem.message });\n',
        ),
        { branchIds: ['invalid.plain-catch-after-accessor'], expectedDiagnostics: 2 },
      ),
      scenario(
        'an optional-chain read still reads the message',
        withEffect('try { run(); } catch (problem) { use(problem?.message); }\n'),
        { branchIds: ['invalid.optional-chain-message-read'] },
      ),
      scenario(
        'a redeclaring var initializer voids an earlier guard',
        withEffect(
          "try { run(); } catch (problem) { if (problem instanceof Error) { var problem = replacement; use(problem.message); } }\nEffect.try({ try: work, catch: (problem) => { if (problem instanceof Error) { var problem = replacement; return problem.message; } return 'unknown'; } });\n",
        ),
        { branchIds: ['invalid.redeclaring-var-voids-guard'], expectedDiagnostics: 2 },
      ),
      scenario(
        'a defaulted handler parameter still binds the caught value',
        withEffect(
          "Effect.try({ try: work, catch: (problem = fallback) => problem.message });\nEffect.tryPromise({ try: work, catch: ({ message } = { message: 'fallback' }) => message });\n",
        ),
        { branchIds: ['invalid.defaulted-handler-parameter'], expectedDiagnostics: 2 },
      ),
      scenario(
        'a computed key or default value inside a destructuring target reads the message',
        withEffect(
          'try { run(); } catch (problem) { ({ [problem.message]: detail } = notification); ({ value = problem.message } = notification); }\n',
        ),
        { branchIds: ['invalid.evaluated-pattern-parts-read'], expectedDiagnostics: 2 },
      ),
      scenario(
        'a parameter named undefined does not prove a primitive',
        withEffect(
          'function handle(undefined) { try { run(); } catch (problem) { if (problem === undefined) use(String(problem)); } }\n',
        ),
        { branchIds: ['invalid.shadowed-undefined-guard'] },
      ),
      scenario(
        'a catch after a spread, or the last duplicate catch key, is the effective handler',
        withEffect(
          'Effect.tryPromise({ ...defaults, try: work, catch: (problem) => problem.message });\nEffect.tryPromise({ try: work, catch: (cause) => new Failure({ cause }), catch: (problem) => problem.message });\n',
        ),
        { branchIds: ['invalid.effective-catch-property'], expectedDiagnostics: 2 },
      ),
      scenario(
        'assignment destructuring of message from the caught value',
        withEffect(
          'try { run(); } catch (problem) { let detail; ({ message: detail } = problem); use(detail); }\n',
        ),
        { branchIds: ['invalid.assignment-destructure'] },
      ),
      scenario(
        'compound and logical assignments read the message first',
        withEffect(
          "try { run(); } catch (problem) { problem.message += '!'; }\ntry { run(); } catch (failure) { failure.message ??= 'fallback'; }\n",
        ),
        { branchIds: ['invalid.compound-assignment-read'], expectedDiagnostics: 2 },
      ),
      scenario(
        'native catch binding message read',
        withEffect('try { run(); } catch (problem) { use(problem.message); }\n'),
        { branchIds: ['invalid.catch-clause-message-read'] },
      ),
      scenario(
        'native catch binding passed to the global String',
        withEffect('try { run(); } catch (problem) { use(String(problem)); }\n'),
        { branchIds: ['invalid.catch-clause-string-conversion'] },
      ),
      scenario(
        'message destructured from the native catch binding',
        withEffect(
          'try { run(); } catch (problem) { const { message: detail } = problem; use(detail); }\n',
        ),
        { branchIds: ['invalid.catch-clause-destructure'] },
      ),
      scenario(
        'native catch parameter destructures message',
        withEffect('try { run(); } catch ({ message }) { use(message); }\n'),
        { branchIds: ['invalid.catch-parameter-destructure'] },
      ),
      scenario(
        'Effect.tryPromise catch handler reads message',
        withEffect('Effect.tryPromise({ try: work, catch: (problem) => problem.message });\n'),
        { branchIds: ['invalid.try-promise-handler-read'] },
      ),
      scenario(
        'Effect.try catch handler converts the caught value with String',
        withEffect('Effect.try({ try: work, catch: (problem) => String(problem) });\n'),
        { branchIds: ['invalid.try-handler-string-conversion'] },
      ),
      scenario(
        'catch handler destructures message from its parameter',
        withEffect(
          'Effect.tryPromise({ try: work, catch: ({ message }) => new Failure({ message }) });\n',
        ),
        { branchIds: ['invalid.handler-parameter-destructure'] },
      ),
      scenario(
        'object-method catch handler reads a computed message key',
        withEffect("Effect.try({ try: work, catch(problem) { return problem['message']; } });\n"),
        { branchIds: ['invalid.object-method-handler'] },
      ),
      scenario(
        'same-file const and hoisted function handlers',
        withEffect(
          'const toFailure = (problem) => problem.message;\nEffect.tryPromise({ try: work, catch: toFailure });\nEffect.try({ try: work, catch: describe });\nfunction describe(problem) { return problem.message; }\n',
        ),
        { branchIds: ['invalid.const-and-declared-handlers'], expectedDiagnostics: 2 },
      ),
      scenario(
        'a closure still reads the raw caught binding',
        withEffect(
          'try { run(); } catch (problem) { const later = () => problem.message; later(); }\n',
        ),
        { branchIds: ['invalid.captured-caught-binding'] },
      ),
      scenario(
        'a cast does not make the caught value safe',
        withEffect('try { run(); } catch (problem) { use((problem as Error).message); }\n'),
        { branchIds: ['invalid.cast-is-not-a-proof'] },
      ),
      scenario(
        'a guard does not cross a function boundary or survive a write',
        withEffect(
          'try { run(); } catch (problem) { if (problem instanceof Error) { const later = () => problem.message; later(); } }\ntry { run(); } catch (failure) { failure = normalize(failure); if (failure instanceof Error) use(failure.message); }\n',
        ),
        { branchIds: ['invalid.guard-voided-by-boundary-or-write'], expectedDiagnostics: 2 },
      ),
    ],
    valid: [
      scenario(
        'an optional-chain delete does not read the message',
        withEffect('try { run(); } catch (problem) { delete problem?.message; }\n'),
        { branchIds: ['valid.optional-chain-delete'] },
      ),
      scenario(
        'a catch accessor after a plain catch handler makes the wiring unknown',
        withEffect(
          'Effect.tryPromise({ try: work, catch: (problem) => problem.message, get catch() { return recover; } });\nEffect.tryPromise({ try: work, catch: (cause) => new Failure({ cause }), set catch(problem) { use(problem.message); } });\n',
        ),
        { branchIds: ['valid.accessor-catch-property'] },
      ),
      scenario(
        'destructuring and loop-head targets only write the message',
        withEffect(
          "try { run(); } catch (problem) { ({ value: problem.message } = notification); [problem.message] = values; ({ value: problem.message = 'fallback' } = notification); ({ outer: { inner: problem.message } } = notification); [...problem.message] = values; ({ value: (problem.message) } = notification); (problem.message as string) = 'replaced'; for (problem.message of values) {} }\n",
        ),
        { branchIds: ['valid.pattern-write-targets'] },
      ),
      scenario(
        'an unrelated var keeps the guard, and a defaulted parameter keeps guard proofs',
        withEffect(
          "try { run(); } catch (problem) { if (problem instanceof Error) { var detail = problem.message; use(detail); } }\nEffect.try({ try: work, catch: (problem = fallback) => (problem instanceof Error ? problem.message : 'unknown') });\n",
        ),
        { branchIds: ['valid.unrelated-var-and-defaulted-guard'] },
      ),
      scenario(
        'String after a guard against the global undefined',
        withEffect(
          'try { run(); } catch (problem) { if (problem === undefined) { use(String(problem)); } }\n',
        ),
        { branchIds: ['valid.global-undefined-guard'] },
      ),
      scenario(
        'reassigned, spread-overridable, computed-overridable, or overridden handlers are not caught-input consumers',
        withEffect(
          'function describe(problem) { return problem.message; }\ndescribe = validatedHandler;\nEffect.tryPromise({ try: work, catch: describe });\nfunction explain(problem) { return problem.message; }\nEffect.tryPromise({ try: work, catch: explain, ...replacementHandlers });\nEffect.tryPromise({ try: work, catch: (problem) => problem.message, [handlerKey]: recover });\nEffect.tryPromise({ try: work, catch: (problem) => problem.message, catch: (cause) => new Failure({ cause }) });\n',
        ),
        { branchIds: ['valid.reassigned-or-overridden-handler'] },
      ),
      scenario(
        'guarded assignment destructuring',
        withEffect(
          'try { run(); } catch (problem) { let detail; if (problem instanceof Error) { ({ message: detail } = problem); } use(detail); }\n',
        ),
        { branchIds: ['valid.guarded-assignment-destructure'] },
      ),
      scenario(
        'a plain message assignment only writes',
        withEffect("try { run(); } catch (problem) { problem.message = 'replaced'; }\n"),
        { branchIds: ['valid.plain-message-assignment'] },
      ),
      scenario(
        'deleting the message never reads it',
        withEffect('try { run(); } catch (problem) { delete problem.message; }\n'),
        { branchIds: ['valid.delete-message-operand'] },
      ),
      scenario(
        'typed catchTag handler reads its error message',
        withEffect("Effect.catchTag('Failure', (error) => Effect.succeed(error.message));\n"),
        { branchIds: ['valid.typed-catch-tag-handler'] },
      ),
      scenario(
        'a local named error is not a caught input',
        withEffect(
          'const error = notification;\nuse(error.message);\nconst { message } = error;\n',
        ),
        { branchIds: ['valid.error-named-local'] },
      ),
      scenario(
        'a same-name inner parameter shadows the caught binding',
        withEffect(
          'try { run(); } catch (problem) { const helper = (problem) => problem.message; }\n',
        ),
        { branchIds: ['valid.shadowing-inner-parameter'] },
      ),
      scenario(
        'reading details from a decoded binding',
        withEffect(
          'try { run(); } catch (problem) { const decoded = decodeProblem(problem); use(decoded.message); }\n',
        ),
        { branchIds: ['valid.decoded-binding'] },
      ),
      scenario(
        'an Error-instance guard in an if, a conditional, or an && chain',
        withEffect(
          "try { run(); } catch (problem) { if (problem instanceof Error) { use(problem.message); } }\ntry { run(); } catch (problem) { use(problem instanceof Error ? problem.message : 'unknown'); }\ntry { run(); } catch (problem) { use(problem instanceof Error && problem.message); }\n",
        ),
        { branchIds: ['valid.error-instance-guard'] },
      ),
      scenario(
        'a non-null object guard with a literal message property',
        withEffect(
          "try { run(); } catch (problem) { if (typeof problem === 'object' && problem !== null && 'message' in problem) { const { message } = problem; use(message); } }\n",
        ),
        { branchIds: ['valid.object-message-guard'] },
      ),
      scenario(
        'String after a primitive guard',
        withEffect(
          "try { run(); } catch (problem) { if (typeof problem === 'string') { use(String(problem)); } }\n",
        ),
        { branchIds: ['valid.primitive-guard'] },
      ),
      scenario(
        'a locally shadowed String is not the global',
        withEffect(
          "const String = (value: unknown) => 'text';\ntry { run(); } catch (problem) { use(String(problem)); }\n",
        ),
        { branchIds: ['valid.shadowed-string'] },
      ),
      scenario(
        'a catch property outside a bound Effect.try options object',
        withEffect(
          'const handlers = { catch: (problem) => problem.message };\nconst run = (Effect) => Effect.tryPromise({ try: work, catch: (problem) => problem.message });\n',
        ),
        { branchIds: ['valid.unrelated-catch-property'] },
      ),
      scenario(
        'mutable handler wiring is not followed',
        withEffect(
          'let toFailure = (problem) => problem.message;\nEffect.tryPromise({ try: work, catch: toFailure });\n',
        ),
        { branchIds: ['valid.mutable-handler-not-followed'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-string-error-channel',
    requiredBranchIds: [
      'invalid.string-literal-failure',
      'invalid.as-const-failure',
      'invalid.template-failures',
      'invalid.wrapped-placements',
      'invalid.test-file-not-exempt',
      'invalid.barrel-alias',
      'valid.tagged-error-failure',
      'valid.identifier-and-constant',
      'valid.success-string',
      'valid.tagged-template-and-spread',
      'valid.unrelated-local-fail',
      'valid.type-only-import',
    ],
    invalid: [
      scenario('string literal as the sole failure', withEffect("Effect.fail('error');\n"), {
        branchIds: ['invalid.string-literal-failure'],
      }),
      scenario('as const does not escape', withEffect("Effect.fail('timeout' as const);\n"), {
        branchIds: ['invalid.as-const-failure'],
      }),
      scenario(
        'plain and interpolated template literals',
        withEffect(`Effect.fail(\`error\`);\nEffect.fail(\`error \${code}\`);\n`),
        { branchIds: ['invalid.template-failures'], expectedDiagnostics: 2 },
      ),
      scenario(
        'named wrapper, callback, and pipe-alias placements',
        withEffectAndPipe(
          "const failWith = () => Effect.fail('boom');\nEffect.flatMap(work, () => Effect.fail('boom'));\nconst run = pipe(work, Effect.flatMap(() => Effect.fail('boom')));\n",
        ),
        { branchIds: ['invalid.wrapped-placements'], expectedDiagnostics: 3 },
      ),
      scenario('test files are not exempt', withEffect("Effect.fail('boom');\n"), {
        branchIds: ['invalid.test-file-not-exempt'],
        sourceFileName: 'program.test.ts',
      }),
      scenario(
        'barrel alias binding',
        "import { Effect as Fx } from 'effect';\nFx.fail('boom');\n",
        { branchIds: ['invalid.barrel-alias'] },
      ),
    ],
    valid: [
      scenario(
        'a tagged error instance or yielded tagged error',
        withEffect(
          "import * as Data from 'effect/Data';\nclass Timeout extends Data.TaggedError('Timeout')<{}> {}\nEffect.fail(new Timeout());\nEffect.gen(function* () { return yield* new Timeout(); });\n",
        ),
        { branchIds: ['valid.tagged-error-failure'] },
      ),
      scenario(
        'identifiers and string constants are not constant-folded',
        withEffect("const reason = 'boom';\nEffect.fail(reason);\nEffect.fail(error);\n"),
        { branchIds: ['valid.identifier-and-constant'] },
      ),
      scenario('a string in the success channel', withEffect("Effect.succeed('ready');\n"), {
        branchIds: ['valid.success-string'],
      }),
      scenario(
        'tagged template results and spread arguments',
        withEffect('Effect.fail(sql`select 1`);\nEffect.fail(...reasons);\n'),
        { branchIds: ['valid.tagged-template-and-spread'] },
      ),
      scenario(
        'an unrelated local fail function',
        "const Effect = { fail: (value: string) => value };\nEffect.fail('boom');\n",
        { branchIds: ['valid.unrelated-local-fail'] },
      ),
      scenario(
        'a type-only Effect import',
        "import type * as Effect from 'effect/Effect';\nEffect.fail('boom');\n",
        { branchIds: ['valid.type-only-import'] },
      ),
    ],
  }),
  // Case source: docs/analysis/effect-nesting-rules-first-principles.md, section 5 (D and R rows).
  suite({
    ruleName: 'no-discarded-failure',
    requiredBranchIds: [
      'no-discarded-failure.invalid-reference',
      'no-discarded-failure.valid-reference',
      'invalid.blind-catch',
      'invalid.blind-cause-recovery',
      'invalid.blind-map-error',
      'invalid.blind-try-handler',
      'invalid.blind-on-failure',
      'invalid.data-first-and-function-syntax',
      'invalid.unread-plain-parameters',
      'invalid.names-in-type-syntax',
      'invalid.not-recorded-first',
      'invalid.final-blanket-after-tag',
      'invalid.wrapped-and-redefined-handlers',
      'invalid.barrel-alias',
      'valid.no-runtime-effect-binding',
      'valid.named-discards',
      'valid.error-read',
      'valid.scoped-members',
      'valid.recorded-first',
      'valid.structured-reads',
      'valid.name-match-shadowing',
      'valid.out-of-reach',
      'valid.replaced-handler-property',
      'valid.unverified-options-objects',
    ],
    invalid: [
      scenario(
        'D2: a constant fallback over every failure',
        withEffect('work.pipe(Effect.catch(() => Effect.succeed(0)));\n'),
        { branchIds: ['no-discarded-failure.invalid-reference'] },
      ),
      scenario(
        'D1, D12, R9, R16, and R22: blind catch handlers',
        withEffect(
          "work.pipe(Effect.catch(() => log('failed')));\nwork.pipe(Effect.catch((_) => Effect.succeed(0)));\nwork.pipe(Effect.catch(() => refreshFileSize(fs, path).pipe(Effect.flatMap((size) => Ref.set(currentSize, size)))));\nfs.stat(cacheFile).pipe(Effect.catch(() => Effect.succeed(undefined)));\nmain.pipe(Effect.catch(() => Effect.sync(() => process.exit(1))));\n",
        ),
        { branchIds: ['invalid.blind-catch'], expectedDiagnostics: 5 },
      ),
      scenario(
        'D7 and R17: blind cause and defect recovery',
        withEffect(
          'work.pipe(Effect.catchCause(() => Effect.void));\nlistSources.pipe(Effect.catchCause(() => Effect.succeed([])));\nwork.pipe(Effect.catchDefect(() => Effect.succeed(0)));\nwork.pipe(Effect.catchEager(() => Effect.succeed(0)));\n',
        ),
        { branchIds: ['invalid.blind-cause-recovery'], expectedDiagnostics: 4 },
      ),
      scenario(
        'D8, R12, and R26: blind mapError',
        withEffect(
          "work.pipe(Effect.mapError(() => new NotFound()));\nproof.pipe(Effect.mapError(() => new ConnectionBlockedError({ reason: 'configuration', detail: 'Could not create the websocket authorization proof.' })));\nEffect.fromNullishOr(header).pipe(Effect.mapError(() => new MissingWorkspaceId()));\n",
        ),
        { branchIds: ['invalid.blind-map-error'], expectedDiagnostics: 3 },
      ),
      scenario(
        'D10, R14, R20, R21, and R25: blind try and tryPromise handlers in every property spelling',
        withEffect(
          "Effect.tryPromise({ try: () => fetch('x'), catch: () => new NotFound() });\nEffect.try({ try: () => decodeURIComponent(rawPath), catch: () => null });\nEffect.try({ try: () => new URL(value), catch: () => new HostedOutboundRequestBlocked({ url: value, reason: 'URL is invalid' }) });\nEffect.tryPromise({ try: () => readFile(file, 'utf8'), catch: () => null });\nEffect.tryPromise({ try: () => webRequest.formData(), catch: () => undefined });\nEffect.try({ try: work, catch() { return null; } });\nEffect.try({ try: work, 'catch': () => null });\nEffect.tryPromise({ try: work, catch: () => null } satisfies Options);\n",
        ),
        { branchIds: ['invalid.blind-try-handler'], expectedDiagnostics: 8 },
      ),
      scenario(
        'D11: blind onFailure handlers of every match member and mapBoth',
        withEffect(
          'work.pipe(Effect.match({ onFailure: () => null, onSuccess: (n) => n }));\nEffect.matchCause(work, { onFailure: () => 0, onSuccess: (n) => n });\nwork.pipe(Effect.matchEffect({ onFailure: () => Effect.succeed(0), onSuccess: Effect.succeed }));\nwork.pipe(Effect.matchCauseEffect({ onFailure: () => Effect.succeed(0), onSuccess: Effect.succeed }));\nEffect.matchEager(work, { onFailure: () => 0, onSuccess: (n) => n });\nwork.pipe(Effect.mapBoth({ onFailure: () => new Failure(), onSuccess: f }));\n',
        ),
        { branchIds: ['invalid.blind-on-failure'], expectedDiagnostics: 6 },
      ),
      scenario(
        'data-first layouts and function syntax',
        withEffect(
          'Effect.mapError(work, () => new Failure());\nEffect.catch(work, function () { return fallback; });\n',
        ),
        { branchIds: ['invalid.data-first-and-function-syntax'], expectedDiagnostics: 2 },
      ),
      scenario(
        'a plain parameter the body never references, including a default, a key-only spelling, and a this parameter',
        withEffect(
          'work.pipe(Effect.catch((error) => fallback));\nwork.pipe(Effect.mapError((error = fallback) => new Failure()));\nwork.pipe(Effect.mapError((error) => new Failure({ error: true })));\nwork.pipe(Effect.mapError((cause) => new Failure({ detail: state.cause })));\nEffect.catch(work, function (this: Context) { return this.fallback; });\n',
        ),
        { branchIds: ['invalid.unread-plain-parameters'], expectedDiagnostics: 5 },
      ),
      scenario(
        'a name inside type syntax reads nothing at runtime',
        withEffect(
          'work.pipe(Effect.mapError((cause) => ({}) as { cause?: string }));\nwork.pipe(Effect.mapError((error) => new Failure() as Failure<typeof error>));\n',
        ),
        { branchIds: ['invalid.names-in-type-syntax'], expectedDiagnostics: 2 },
      ),
      scenario(
        'a tap after the recovery, in an enclosing pipeline, or unbound records nothing first',
        withEffect(
          'work.pipe(Effect.catch(() => fallback), Effect.tapError(log));\nwork.pipe(Effect.tapError(log), Effect.flatMap(() => other.pipe(Effect.catch(() => fallback))));\nwork.pipe(tapError(log), Effect.catch(() => fallback));\n',
        ),
        { branchIds: ['invalid.not-recorded-first'], expectedDiagnostics: 3 },
      ),
      scenario(
        'R27: only the final blanket catch after a catchTag reports',
        withEffect(
          "loadPort('invalid').pipe(Effect.catchTag('ReservedPortError', (_) => Effect.succeed(3000)), Effect.catch((_) => Effect.succeed(3000)));\n",
        ),
        { branchIds: ['invalid.final-blanket-after-tag'] },
      ),
      scenario(
        'a type assertion around the handler is no escape, and the last handler definition wins',
        withEffect(
          'work.pipe(Effect.catch((() => fallback) as RecoveryHandler));\nEffect.try({ try: work, catch: (() => null) satisfies Handler });\nEffect.try({ try: work, catch: (cause) => wrap(cause), catch: () => null });\n',
        ),
        { branchIds: ['invalid.wrapped-and-redefined-handlers'], expectedDiagnostics: 3 },
      ),
      scenario(
        'barrel alias binding',
        "import { Effect as Fx } from 'effect';\nwork.pipe(Fx.catch(() => Fx.succeed(0)));\n",
        { branchIds: ['invalid.barrel-alias'] },
      ),
    ],
    valid: [
      scenario(
        'non-Effect file, type-only imports, or a shadowing parameter bind no call',
        "work.pipe(Effect.catch(() => Effect.succeed(0)));\nimport type * as Effect from 'effect/Effect';\nimport { type Effect as Fx } from 'effect';\nwork.pipe(Fx.catch(() => Fx.succeed(0)));\n",
        { branchIds: ['valid.no-runtime-effect-binding'] },
      ),
      scenario(
        'D3 and R13: named discards',
        withEffect(
          'work.pipe(Effect.orElseSucceed(() => 0));\ndecode(raw).pipe(Effect.map(normalize), Effect.orElseSucceed(() => defaultSettings));\nwork.pipe(Effect.ignore, Effect.ignoreCause, Effect.option, Effect.result, Effect.exit);\n',
        ),
        { branchIds: ['valid.named-discards'] },
      ),
      scenario(
        'D4, D9, D13, R1, R2, and R15: the handler reads its error',
        withEffect(
          "work.pipe(Effect.catch((error) => log(error).pipe(Effect.as(0))));\nwork.pipe(Effect.mapError((cause) => new NotFound(cause)));\nwork.pipe(Effect.catch(({ message }) => log(message)));\ngetCounts().pipe(Effect.catch((cause) => Effect.logWarning('failed', { cause }).pipe(Effect.as(0))));\nEffect.catchCause((cause) => Effect.logError('failed').pipe(Effect.annotateLogs({ sessionId, cause })));\nEffect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : Ref.update(state, markUnavailable));\n",
        ),
        { branchIds: ['valid.error-read'] },
      ),
      scenario(
        'D5: tag- and predicate-scoped members state what they absorb',
        withEffect(
          "work.pipe(Effect.catchTag('NotFound', () => Effect.succeed(0)));\nwork.pipe(Effect.catchTags({ NotFound: () => Effect.succeed(0) }));\nwork.pipe(Effect.catchReason('AiError', 'RateLimit', () => Effect.succeed(0)));\nwork.pipe(Effect.catchIf(isRetryable, () => Effect.succeed(0)));\nwork.pipe(Effect.catchFilter(filter, () => Effect.succeed(0)));\n",
        ),
        { branchIds: ['valid.scoped-members'] },
      ),
      scenario(
        'D6 and D14: recorded first by a failure tap in the pipe, a standalone pipe, or the data-first source',
        withEffectAndPipe(
          'work.pipe(Effect.tapError((error) => log(error)), Effect.catch(() => Effect.succeed(0)));\nEffect.catch(Effect.tapError(work, (e) => log(e)), () => Effect.succeed(0));\nwork.pipe(Effect.tapCause(log), Effect.map(f), Effect.catchCause(() => Effect.void));\nwork.pipe(Effect.tapDefect(log), Effect.catchDefect(() => Effect.void));\npipe(work, Effect.tapError(log), Effect.catch(() => fallback));\nwork.pipe(Effect.tapError((error) => Effect.logDebug(error)), Effect.match({ onFailure: () => undefined, onSuccess: (value) => value }));\n',
        ),
        { branchIds: ['valid.recorded-first', 'no-discarded-failure.valid-reference'] },
      ),
      scenario(
        'rest, destructured, shorthand, and computed-member reads',
        withEffect(
          'work.pipe(Effect.catch((...failures) => fallback));\nwork.pipe(Effect.catch(([first]) => log(first)));\nwork.pipe(Effect.mapError((error) => new Failure({ error })));\nwork.pipe(Effect.mapError((key) => new Failure(messages[key])));\n',
        ),
        { branchIds: ['valid.structured-reads'] },
      ),
      scenario(
        'name matching counts a same-named inner binding as a read',
        withEffect('work.pipe(Effect.catch((e) => items.map((e) => e.id)));\n'),
        { branchIds: ['valid.name-match-shadowing'] },
      ),
      scenario(
        'a named handler, a thunk-only tryPromise, and an onSuccess handler are out of reach',
        withEffect(
          "work.pipe(Effect.catch(handler));\nEffect.tryPromise(() => fetch('x'));\nwork.pipe(Effect.match({ onFailure: (e) => e.message, onSuccess: () => 0 }));\n",
        ),
        { branchIds: ['valid.out-of-reach'] },
      ),
      scenario(
        'a later definition, spread, or runtime-computed key replaces or may replace the handler',
        withEffect(
          'Effect.try({ try: work, catch: () => null, catch: (cause) => wrap(cause) });\nEffect.try({ try: work, catch: () => null, ...overrides });\nEffect.try({ try: work, catch: () => null, [key]: other });\n',
        ),
        { branchIds: ['valid.replaced-handler-property'] },
      ),
      scenario(
        'only a verified options object is followed',
        withEffect(
          'const options = { catch: () => null };\nEffect.try({ try: work, get catch() { return () => null; } });\n',
        ),
        { branchIds: ['valid.unverified-options-objects'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-match-effect-branch',
    requiredBranchIds: [
      'invalid.match-value-pipe-effect-branch',
      'invalid.option-match-effect-branch',
      'invalid.block-bodied-match-effect-branch',
      'invalid.block-bodied-option-effect-branch',
      'valid.match-value-value-branch',
      'valid.effect-succeed-alone',
      'valid.pipe-without-effect-sequencing',
      'valid.standalone-match-when',
      'valid.member-pipe-not-sequencing',
    ],
    invalid: [
      scenario(
        'source branch: full Match.value pipe contains Effect branch',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => Effect.flatMap(program, f)));\n",
        {
          branchIds: ['invalid.match-value-pipe-effect-branch'],
        },
      ),
      scenario(
        'source branch: Option.match contains Effect sequencing branch',
        "import * as Option from 'effect/Option';\nimport * as Effect from 'effect/Effect';\nOption.match(input, { onSome: () => Effect.map(program, f), onNone: () => value });\n",
        {
          branchIds: ['invalid.option-match-effect-branch'],
        },
      ),
      scenario(
        'source branch: block-bodied Match branch contains Effect work',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => { const next = Effect.flatMap(program, f); return next; }));\n",
        {
          branchIds: ['invalid.block-bodied-match-effect-branch'],
        },
      ),
      scenario(
        'source branch: block-bodied Option.match branch contains Effect sequencing work',
        "import * as Option from 'effect/Option';\nimport * as Effect from 'effect/Effect';\nOption.match(input, { onSome: () => { const next = Effect.map(program, f); return next; }, onNone: () => value });\n",
        {
          branchIds: ['invalid.block-bodied-option-effect-branch'],
        },
      ),
    ],
    valid: [
      scenario(
        'allows value-only Match.value pipe branch',
        "import * as Match from 'effect/Match';\nMatch.value(kind).pipe(Match.when('a', () => 'a'));\n",
        {
          branchIds: ['valid.match-value-value-branch'],
        },
      ),
      scenario(
        'standalone Match.when is not a full Match.value pipe',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.when('a', () => Effect.flatMap(program, f));\n",
        {
          branchIds: ['valid.standalone-match-when'],
        },
      ),
      scenario(
        'source false-positive: Effect.succeed alone is not branch sequencing',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => Effect.succeed(1)));\n",
        {
          branchIds: ['valid.effect-succeed-alone'],
        },
      ),
      scenario(
        'source false-positive: pipe without Effect or Stream sequencing is not enough',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => pipe(value, f)));\n",
        {
          branchIds: ['valid.pipe-without-effect-sequencing'],
        },
      ),
      scenario(
        'Behavior regression: member .pipe() is not source sequencing; Effect.succeed alone is not enough',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('a', () => Effect.succeed(value).pipe(f)));\n",
        {
          branchIds: ['valid.member-pipe-not-sequencing'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-branch-in-object',
    requiredBranchIds: [
      'no-branch-in-object.invalid-reference',
      'no-branch-in-object.valid-reference',

      'invalid.direct-option-match',
      'invalid.direct-match-value-pipe',
      'invalid.iife-object-return-match-arg',
      'invalid.iife-object-return-option-arg',
      'invalid.function-iife-object-return-option-arg',
      'invalid.iife-object-return-wrapped-branch-arg',
      'valid.wrapped-match-value-property',
      'valid.wrapped-option-match-property',
      'valid.v3-either-match',
      'valid.property-value-iife',
    ],
    invalid: [
      scenario(
        'source branch: direct Option.match property value',
        "import * as Option from 'effect/Option';\nconst value = { ready: Option.match(input, { onSome: () => true, onNone: () => false }) };\n",
        { branchIds: ['invalid.direct-option-match', 'no-branch-in-object.invalid-reference'] },
      ),
      scenario(
        'source branch: direct Match.value pipe property value',
        "import * as Match from 'effect/Match';\nconst value = { ready: Match.value(input).pipe(Match.when('a', () => true)) };\n",
        { branchIds: ['invalid.direct-match-value-pipe'] },
      ),
      scenario(
        'source branch: expression-bodied IIFE returns object and arg contains Match.value pipe',
        "import * as Match from 'effect/Match';\nconst value = ((branch) => ({ ready: branch }))(Match.value(input).pipe(Match.when('a', () => true)));\n",
        { branchIds: ['invalid.iife-object-return-match-arg'] },
      ),
      scenario(
        'source branch: block-bodied arrow IIFE returns object and arg contains Option.match',
        "import * as Option from 'effect/Option';\nconst value = ((branch) => { return { ready: branch }; })(Option.match(input, { onSome: () => true, onNone: () => false }));\n",
        { branchIds: ['invalid.iife-object-return-option-arg'] },
      ),
      scenario(
        'source branch: block-bodied function IIFE returns object and arg contains Option.match',
        "import * as Option from 'effect/Option';\nconst value = (function (branch) { return { ready: branch }; })(Option.match(input, { onSome: () => true, onNone: () => false }));\n",
        { branchIds: ['invalid.function-iife-object-return-option-arg'] },
      ),
      scenario(
        'Ownership regression: object-returning IIFE with branch wrapped in helper call is source-covered via descendant scan',
        "import * as Option from 'effect/Option';\nconst value = ((branch) => ({ ready: branch }))(decorate(Option.match(input, { onSome: () => true, onNone: () => false })));\n",
        { branchIds: ['invalid.iife-object-return-wrapped-branch-arg'] },
      ),
    ],
    valid: [
      scenario(
        'allows ordinary object branches outside Effect imports',
        'const value = { ready: condition ? true : false };\n',
        { branchIds: ['no-branch-in-object.valid-reference'] },
      ),
      scenario(
        'source parity: wrapped Match.value property value is not a direct branch value',
        "import * as Match from 'effect/Match';\nconst value = { ready: decorate(Match.value(input).pipe(Match.when('a', () => true))) };\n",
        {
          branchIds: ['valid.wrapped-match-value-property'],
        },
      ),
      scenario(
        'source parity: wrapped Option.match property value is not a direct branch value',
        "import * as Option from 'effect/Option';\nconst value = { ready: decorate(Option.match(input, { onSome: () => true, onNone: () => false })) };\n",
        {
          branchIds: ['valid.wrapped-option-match-property'],
        },
      ),
      scenario(
        'v4 has no Either module, so the v3 Either.match branch is gone',
        "import * as Either from 'effect/Either';\nconst value = { ready: Either.match(input, { onRight: () => true, onLeft: () => false }) };\n",
        { branchIds: ['valid.v3-either-match'] },
      ),
      scenario(
        'source parity: property-value IIFE is not the object-returning IIFE branch',
        "import * as Option from 'effect/Option';\nconst value = { ready: ((branch) => branch)(Option.match(input, { onSome: () => true, onNone: () => false })) };\n",
        {
          branchIds: ['valid.property-value-iife'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-promise-catch',
    nonEffectControlBranchIds: ['no-promise-catch.valid-reference'],
    requiredBranchIds: [
      'no-promise-catch.invalid-reference',
      'no-promise-catch.valid-reference',

      'invalid.promise-catch',
      'valid.effect-catch-namespace',
      'valid.effect-catch-alias',
    ],
    invalid: [
      scenario(
        'executor branch: promise catch in Effect file',
        "import * as Effect from 'effect/Effect';\npromise.catch(handle);\n",
        { branchIds: ['invalid.promise-catch', 'no-promise-catch.invalid-reference'] },
      ),
    ],
    valid: [
      scenario(
        'reference carve-out: Effect.catch namespace combinator',
        "import * as Effect from 'effect/Effect';\nEffect.catch(program, handle);\n",
        { branchIds: ['valid.effect-catch-namespace'] },
      ),
      scenario(
        'review false-positive: Effect.catch imported under namespace alias',
        "import * as E from 'effect/Effect';\nE.catch(program, handle);\n",
        { branchIds: ['valid.effect-catch-alias'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-json-parse',
    nonEffectControlBranchIds: ['no-json-parse.valid-reference'],
    requiredBranchIds: ['no-json-parse.invalid-reference', 'no-json-parse.valid-reference'],
    invalid: [
      scenario(
        'no-json-parse invalid replay',
        "import * as Effect from 'effect/Effect';\nJSON.parse(payload);\n",
        {
          branchIds: ['no-json-parse.invalid-reference'],
        },
      ),
      scenario(
        'a v4 @effect/atom-react import alone activates the rule',
        "import { useAtomValue } from '@effect/atom-react';\nJSON.parse(payload);\n",
      ),
    ],
    valid: [],
  }),
  suite({
    ruleName: 'no-instanceof-error',
    nonEffectControlBranchIds: ['no-instanceof-error.valid-reference'],
    requiredBranchIds: [
      'no-instanceof-error.invalid-reference',
      'no-instanceof-error.valid-reference',
    ],
    invalid: [
      scenario(
        'no-instanceof-error invalid replay',
        "import * as Effect from 'effect/Effect';\nif (error instanceof Error) throw error;\n",
        {
          branchIds: ['no-instanceof-error.invalid-reference'],
        },
      ),
    ],
    valid: [],
  }),
  suite({
    ruleName: 'no-instanceof-tagged-error',
    nonEffectControlBranchIds: ['no-instanceof-tagged-error.valid-reference'],
    requiredBranchIds: [
      'no-instanceof-tagged-error.invalid-reference',
      'no-instanceof-tagged-error.valid-reference',
    ],
    invalid: [
      scenario(
        'no-instanceof-tagged-error invalid replay',
        "import * as Effect from 'effect/Effect';\nif (error instanceof DomainError) throw error;\n",
        {
          branchIds: ['no-instanceof-tagged-error.invalid-reference'],
        },
      ),
    ],
    valid: [],
  }),
  suite({
    ruleName: 'no-atom-registry-effect-sync',
    message: ruleMessage('no-atom-registry-effect-sync', { method: 'Atom.set' }),
    requiredBranchIds: [
      'no-atom-registry-effect-sync.invalid-reference',
      'no-atom-registry-effect-sync.valid-reference',
      'invalid.expression-callback',
      'invalid.block-callback',
      'invalid.each-effect-member',
      'invalid.one-diagnostic-per-call',
      'invalid.invoked-inline-function',
      'invalid.v4-module-bindings',
      'valid.yielded-atom-effect',
      'valid.direct-effect-value',
      'valid.registry-instance-calls',
      'valid.own-execution-boundaries',
      'valid.data-last-returns-function',
      'valid.unbound-or-retired-atom',
      'valid.generator-bodies-deferred',
      'invalid.callback-parameter-defaults',
      'invalid.static-field-atom-call',
      'valid.deferred-class-and-default-code',
    ],
    invalid: [
      scenario(
        'Atom.set wrapped in an expression-bodied Effect.sync',
        withAtom('Effect.sync(() => Atom.set(count, 1));\n'),
        {
          branchIds: [
            'invalid.expression-callback',
            'no-atom-registry-effect-sync.invalid-reference',
          ],
        },
      ),
      scenario(
        'Atom.refresh in a block-bodied Effect.sync',
        withAtom('Effect.sync(() => { Atom.refresh(count); });\n'),
        { branchIds: ['invalid.block-callback'], messageData: { method: 'Atom.refresh' } },
      ),
      scenario(
        'Atom.get names the actual method',
        withAtom('Effect.sync(() => Atom.get(count));\n'),
        { branchIds: ['invalid.each-effect-member'], messageData: { method: 'Atom.get' } },
      ),
      scenario(
        'Atom.update names the actual method',
        withAtom('Effect.sync(() => Atom.update(count, (n) => n + 1));\n'),
        { branchIds: ['invalid.each-effect-member'], messageData: { method: 'Atom.update' } },
      ),
      scenario(
        'Atom.modify names the actual method',
        withAtom('Effect.sync(() => Atom.modify(count, (n) => [n, n + 1]));\n'),
        { branchIds: ['invalid.each-effect-member'], messageData: { method: 'Atom.modify' } },
      ),
      scenario(
        'each offending call reports once',
        withAtom('Effect.sync(() => { Atom.set(a, 1); Atom.set(b, 2); });\n'),
        { branchIds: ['invalid.one-diagnostic-per-call'], expectedDiagnostics: 2 },
      ),
      scenario(
        'an inline function invoked on the spot runs inside the callback',
        withAtom('Effect.sync(() => (() => Atom.set(count, 1))());\n'),
        { branchIds: ['invalid.invoked-inline-function'] },
      ),
      scenario(
        'a namespace alias of the pinned Atom subpath',
        `${effectImportLine}import * as A from 'effect/unstable/reactivity/Atom';\nEffect.sync(() => A.set(count, 1));\n`,
        { branchIds: ['invalid.v4-module-bindings'] },
      ),
      scenario(
        'the later-v4 reactivity barrel',
        `${effectImportLine}import { Atom } from 'effect/reactivity';\nEffect.sync(() => Atom.set(count, 1));\n`,
        { branchIds: ['invalid.v4-module-bindings'] },
      ),
      scenario(
        'Effect.sync evaluates its callback parameter defaults, even for a generator',
        withAtom(
          'Effect.sync((v = Atom.set(count, 1)) => v);\nEffect.sync(function* (v = Atom.set(count, 2)) {});\n',
        ),
        { branchIds: ['invalid.callback-parameter-defaults'], expectedDiagnostics: 2 },
      ),
      scenario(
        'a static field initializer runs when the class is defined',
        withAtom('Effect.sync(() => class { static value = Atom.set(count, 1); });\n'),
        { branchIds: ['invalid.static-field-atom-call'] },
      ),
    ],
    valid: [
      scenario(
        'yielding the Atom Effect from a generator',
        withAtom('Effect.gen(function* () { yield* Atom.set(count, 1); });\n'),
        { branchIds: ['valid.yielded-atom-effect'] },
      ),
      scenario('an Atom Effect used as a value', withAtom('const write = Atom.set(count, 1);\n'), {
        branchIds: ['valid.direct-effect-value', 'no-atom-registry-effect-sync.valid-reference'],
      }),
      scenario(
        'registry instance calls are synchronous in v4',
        withAtom(
          'Effect.sync(() => registry.set(count, 1));\nEffect.sync(() => atomRegistry.set(count, 1));\n',
        ),
        { branchIds: ['valid.registry-instance-calls'] },
      ),
      scenario(
        'a nested generator and a declared function are their own boundaries',
        withAtom(
          'Effect.sync(() => Effect.gen(function* () { yield* Atom.set(count, 1); }));\nEffect.sync(() => { const later = () => Atom.set(count, 1); return later; });\n',
        ),
        { branchIds: ['valid.own-execution-boundaries'] },
      ),
      scenario(
        'the data-last Atom.set returns a function, not an Effect',
        withAtom('Effect.sync(() => Atom.set(1));\n'),
        { branchIds: ['valid.data-last-returns-function'] },
      ),
      scenario(
        'a generator callback or an invoked generator runs no Atom call',
        withAtom(
          'Effect.sync(function* () { Atom.set(count, 1); });\nEffect.sync(() => (function* () { Atom.set(count, 1); })());\n',
        ),
        { branchIds: ['valid.generator-bodies-deferred'] },
      ),
      scenario(
        'an instance field and the defaults of an uncalled function do not run',
        withAtom(
          'Effect.sync(() => class { value = Atom.set(count, 1); });\nEffect.sync(() => { const later = (v = Atom.set(count, 1)) => v; return later; });\n',
        ),
        { branchIds: ['valid.deferred-class-and-default-code'] },
      ),
      scenario(
        'shadowed, local, and v3 atom-react Atom objects',
        `${effectImportLine}import { Atom as V3Atom } from '@effect-atom/atom-react';\nconst Local = { set: (a, v) => v };\nconst run = (Atom) => Effect.sync(() => Atom.set(count, 1));\nEffect.sync(() => Local.set(count, 1));\nEffect.sync(() => V3Atom.set(count, 1));\n`,
        { branchIds: ['valid.unbound-or-retired-atom'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-fromnullable-nullish-coalesce',
    requiredBranchIds: [
      'no-fromnullable-nullish-coalesce.invalid-reference',
      'no-fromnullable-nullish-coalesce.valid-reference',
      'invalid.from-nullish-or-null-fallback',
      'invalid.from-undefined-or-undefined-fallback',
      'invalid.alias-and-barrel-bindings',
      'valid.plain-constructors',
      'valid.other-fallbacks',
      'valid.unpaired-fallbacks',
      'valid.shadowed-undefined',
      'valid.removed-v3-name',
    ],
    invalid: [
      scenario(
        't3code scenario: ?? null inside fromNullishOr',
        withOption('Option.fromNullishOr(value ?? null);\n'),
        {
          branchIds: [
            'invalid.from-nullish-or-null-fallback',
            'no-fromnullable-nullish-coalesce.invalid-reference',
          ],
        },
      ),
      scenario(
        '?? undefined inside fromUndefinedOr',
        withOption('Option.fromUndefinedOr(value ?? undefined);\n'),
        { branchIds: ['invalid.from-undefined-or-undefined-fallback'] },
      ),
      scenario(
        'namespace alias and barrel Option bindings',
        "import * as O from 'effect/Option';\nimport { Option } from 'effect';\nO.fromNullishOr(value ?? null);\nOption.fromUndefinedOr(value ?? undefined);\n",
        { branchIds: ['invalid.alias-and-barrel-bindings'], expectedDiagnostics: 2 },
      ),
    ],
    valid: [
      scenario(
        'the plain constructors',
        withOption('Option.fromNullishOr(value);\nOption.fromUndefinedOr(value);\n'),
        {
          branchIds: [
            'valid.plain-constructors',
            'no-fromnullable-nullish-coalesce.valid-reference',
          ],
        },
      ),
      scenario(
        'a real fallback or a different operator',
        withOption(
          'Option.fromUndefinedOr(value ?? fallback);\nOption.fromNullishOr(value || null);\n',
        ),
        { branchIds: ['valid.other-fallbacks'] },
      ),
      scenario(
        'the two constructor and fallback pairs are not merged',
        withOption(
          'Option.fromNullishOr(value ?? undefined);\nOption.fromUndefinedOr(value ?? null);\n',
        ),
        { branchIds: ['valid.unpaired-fallbacks'] },
      ),
      scenario(
        'a shadowed undefined is not the global value',
        withOption('const read = (undefined) => Option.fromUndefinedOr(value ?? undefined);\n'),
        { branchIds: ['valid.shadowed-undefined'] },
      ),
      scenario(
        'the removed v3 fromNullable belongs to the outdated-API check',
        withOption('Option.fromNullable(value ?? null);\n'),
        { branchIds: ['valid.removed-v3-name'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-react-state',
    requiredBranchIds: [
      'no-react-state.invalid-reference',
      'no-react-state.valid-reference',
      'invalid.bare-banned-hooks',
      'invalid.member-banned-hooks',
      'valid.use-state',
      'valid.atom-hooks',
    ],
    invalid: [
      scenario(
        'bare calls of the banned hooks',
        'useEffect(() => {}, []);\nuseContext(ThemeContext);\nuseSyncExternalStore(subscribe, getSnapshot);\n',
        {
          branchIds: ['invalid.bare-banned-hooks', 'no-react-state.invalid-reference'],
          expectedDiagnostics: 3,
        },
      ),
      scenario(
        'member calls of the banned hooks',
        'React.useReducer(reducer, initial);\nReact.useCallback(() => {}, []);\nReact.useEffect(() => {}, []);\n',
        { branchIds: ['invalid.member-banned-hooks'], expectedDiagnostics: 3 },
      ),
    ],
    valid: [
      scenario(
        'useState stays allowed for component-local state',
        `${effectImportLine}const [value] = useState(0);\nconst [open] = React.useState(false);\n`,
        { branchIds: ['valid.use-state', 'no-react-state.valid-reference'] },
      ),
      scenario(
        'atom-react hooks',
        "import { useAtom } from '@effect/atom-react';\nconst [count] = useAtom(countAtom);\n",
        { branchIds: ['valid.atom-hooks'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-return-null',
    requiredBranchIds: [
      'no-return-null.invalid-reference',
      'no-return-null.valid-reference',
      'invalid.effect-gen-return',
      'invalid.effect-gen-options-return',
      'invalid.effect-fn-named-return',
      'invalid.effect-fn-direct-return',
      'invalid.span-name-bindings',
      'invalid.succeed-null',
      'valid.react-component',
      'valid.nullable-boundary-helper',
      'valid.nested-helper-boundary',
      'valid.option-results',
      'valid.other-generators',
      'valid.traced-function-bindings',
      'valid.unknown-fn-argument',
      'valid.unbound-effect',
    ],
    invalid: [
      scenario(
        'return null in an Effect.gen generator',
        withEffect('Effect.gen(function* () { if (missing) { return null; } return 1; });\n'),
        { branchIds: ['invalid.effect-gen-return', 'no-return-null.invalid-reference'] },
      ),
      scenario(
        'return null in the options form of Effect.gen',
        withEffect('Effect.gen({ self: service }, function* () { return null; });\n'),
        { branchIds: ['invalid.effect-gen-options-return'] },
      ),
      scenario(
        'return null in a named Effect.fn generator with pipeables',
        withEffect("Effect.fn('load')(function* () { return null; }, Effect.orElseSucceed(f));\n"),
        { branchIds: ['invalid.effect-fn-named-return'] },
      ),
      scenario(
        'return null in a direct Effect.fn generator',
        withEffect('const load = Effect.fn(function* () { return null; });\n'),
        { branchIds: ['invalid.effect-fn-direct-return'] },
      ),
      scenario(
        'a string constant and a template are provable span names',
        withEffect(
          "const span = 'load';\nEffect.fn(span)(function* () { return null; });\nEffect.fn(`save`)(function* () { return null; });\n",
        ),
        { branchIds: ['invalid.span-name-bindings'], expectedDiagnostics: 2 },
      ),
      scenario(
        'Effect.succeed(null) anywhere',
        withEffect('const load = () => Effect.succeed(null);\n'),
        { branchIds: ['invalid.succeed-null'] },
      ),
    ],
    valid: [
      scenario(
        't3code scenario: a React component returning null in an Effect file',
        withEffect('export const View = () => { return null; };\n'),
        { branchIds: ['valid.react-component', 'no-return-null.valid-reference'] },
      ),
      scenario(
        'executor scenario: a nullable boundary helper',
        withEffect('function find(): User | null { return null; }\n'),
        { branchIds: ['valid.nullable-boundary-helper'] },
      ),
      scenario(
        'a nested ordinary helper is its own function boundary',
        withEffect(
          'Effect.gen(function* () { const pick = () => { return null; }; return pick(); });\n',
        ),
        { branchIds: ['valid.nested-helper-boundary'] },
      ),
      scenario(
        'Option results and a non-null success value',
        `${effectImportLine}import * as Option from 'effect/Option';\nEffect.gen(function* () { return Option.none(); });\nconst none = Effect.succeedNone;\nEffect.succeed(value);\nEffect.gen(function* () { return undefined; });\n`,
        { branchIds: ['valid.option-results'] },
      ),
      scenario(
        'arbitrary generators and fnUntraced are outside the settled scope',
        withEffect(
          'function* values() { return null; }\nEffect.fnUntraced(function* () { return null; });\n',
        ),
        { branchIds: ['valid.other-generators'] },
      ),
      scenario(
        'a traced function called with a generator is not the Effect.fn factory',
        withEffect(
          'const body = function* () { return 1; };\nEffect.fn(body)(function* () { return null; });\nfunction* traced() { return 1; }\nEffect.fn(traced)(function* () { return null; });\n',
        ),
        { branchIds: ['valid.traced-function-bindings'] },
      ),
      scenario(
        'an unresolved or reassignable first argument leaves the Effect.fn overload unknown',
        withEffect(
          "import { spanName } from './names';\nexport const make = (name) => Effect.fn(name)(function* () { return null; });\nEffect.fn(spanName)(function* () { return null; });\nlet span = 'load';\nEffect.fn(span)(function* () { return null; });\n",
        ),
        { branchIds: ['valid.unknown-fn-argument'] },
      ),
      scenario(
        'a local Effect lookalike',
        'const Effect = { gen: (f) => f, succeed: (v) => v };\nEffect.gen(function* () { return null; });\nEffect.succeed(null);\n',
        { branchIds: ['valid.unbound-effect'] },
      ),
    ],
  }),
  ...(
    [
      [
        'no-arrow-ladder',
        "import * as Effect from 'effect/Effect';\n((x) => ((y) => y)(x))(value);\n",
        'const value = ((x) => ((y) => y)(x))(input);\n',
      ],
      [
        'no-effect-bind',
        "import * as Effect from 'effect/Effect';\nEffect.bind('user', loadUser);\n",
        "import * as Effect from 'effect/Effect';\nEffect.map(program, f);\n",
      ],
      [
        'no-iife-wrapper',
        "import * as Effect from 'effect/Effect';\n(() => value)();\n",
        '(() => value)();\n',
      ],
      [
        'no-option-as',
        "import * as Option from 'effect/Option';\nOption.as(option, value);\n",
        "import * as Option from 'effect/Option';\nOption.map(option, f);\n",
      ],
      [
        'no-option-boolean-normalization',
        "import * as Option from 'effect/Option';\nOption.match(input, { onSome: (value) => value === true, onNone: () => false });\n",
        "import * as Option from 'effect/Option';\nOption.match(input, { onSome: () => flag === true, onNone: () => false });\n",
      ],
      [
        'no-try-catch',
        "import * as Effect from 'effect/Effect';\ntry { run(); } catch (error) { handle(error); }\n",
        "import * as Effect from 'effect/Effect';\ntry { run(); } finally { cleanup(); }\n",
      ],
    ] as const
  ).map(([ruleName, invalidSource, validSource]) =>
    suite({
      ruleName,
      requiredBranchIds: [`${ruleName}.invalid-reference`, `${ruleName}.valid-reference`],
      invalid: [
        scenario(`${ruleName} invalid replay`, invalidSource, {
          branchIds: [`${ruleName}.invalid-reference`],
        }),
      ],
      valid: [
        scenario(`${ruleName} valid replay`, validSource, {
          branchIds: [`${ruleName}.valid-reference`],
        }),
      ],
    }),
  ),
];

// Asserts all expected-failure diagnostics for one invalid fixture case.
const assertExpectedFailure = (
  result: CommandResult,
  replaySuite: ReplaySuite,
  fixtureCase: ReplayCase,
): void => {
  ensureFailure(result, fixtureCase.name);
  assertDiagnostic(result, {
    ...replaySuite.diagnostic,
    ...(fixtureCase.messageData === globalThis.undefined
      ? {}
      : { message: ruleMessage(replaySuite.diagnostic.ruleName, fixtureCase.messageData) }),
    label: fixtureCase.name,
  });
  assertDiagnosticCount(result, {
    count: fixtureCase.expectedDiagnostics ?? 1,
    label: fixtureCase.name,
    ruleName: replaySuite.diagnostic.ruleName,
  });
  if (typeof fixtureCase.expectedLine === 'number') {
    assertDiagnosticLine(result, { label: fixtureCase.name, line: fixtureCase.expectedLine });
  }
};

const runReplayCase = (
  replaySuite: ReplaySuite,
  fixtureCase: ReplayCase,
  expectedFailure: boolean,
) => {
  const tempDir = createTempDir('backpressure-fixture-replay-');
  try {
    fixtureCase.setupTempDir?.(tempDir);
    const result = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: replaySuite.rules,
      source: fixtureCase.source,
      ...(typeof fixtureCase.sourceFileName === 'string'
        ? { sourceFileName: fixtureCase.sourceFileName }
        : {}),
    });
    if (expectedFailure) {
      assertExpectedFailure(result, replaySuite, fixtureCase);
      return;
    }
    ensureSuccess(result, `${fixtureCase.name}\n${commandOutput(result)}`);
  } finally {
    removeTempDir(tempDir);
  }
};

// Converts presetEntriesForDomains entries to the RuleConfig format expected by the fixture runner.
// Rule names (entry.name) are used directly without plugin prefixes; the runner resolves plugin context.
const presetRuleConfigForDomains = (domains: readonly RuleDomain[]): RuleConfig =>
  Object.fromEntries(
    presetEntriesForDomains(domains).map((entry) => [
      entry.name,
      oxlintSeverityForManifestEntry(entry),
    ]),
  );

const effectPresetRuleConfig = (): RuleConfig => presetRuleConfigForDomains(['effect']);

const effectReactPresetRuleConfig = (): RuleConfig => presetRuleConfigForDomains(['effect-react']);

const effectAndEffectReactPresetRuleConfig = (): RuleConfig =>
  presetRuleConfigForDomains(['effect', 'effect-react']);

const assertShallowNestedEffectOwnership = (tempDir: string, rules: RuleConfig): void => {
  const result = runOxlintOnSource({
    cwd: tempDir,
    pluginSpecifier: distPluginPath,
    rules,
    source: "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.sync(task), f);\n",
    sourceFileName: 'shallow.ts',
  });
  const label = 'preset duplicate-intent ownership: shallow nested Effect call';
  ensureFailure(result, label);
  assertDiagnosticCount(result, { count: 1, label, ruleName: 'no-effect-call-in-effect-arg' });
  assertDiagnosticCount(result, { count: 0, label, ruleName: 'no-effect-ladder' });
};

const assertDeepNestedEffectOwnership = (tempDir: string, rules: RuleConfig): void => {
  const result = runOxlintOnSource({
    cwd: tempDir,
    pluginSpecifier: distPluginPath,
    rules,
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.map(Effect.sync(task), f), g);\n",
    sourceFileName: 'deep.ts',
  });
  const label = 'preset duplicate-intent ownership: deep nested Effect call';
  ensureFailure(result, label);
  assertDiagnosticCount(result, { count: 1, label, ruleName: 'no-effect-ladder' });
  assertDiagnosticCount(result, { count: 0, label, ruleName: 'no-effect-call-in-effect-arg' });
};

const runPresetNestedDuplicateIntentReplay = (): void => {
  const rules = effectPresetRuleConfig();
  const tempDir = createTempDir('backpressure-preset-nested-intent-');
  try {
    assertShallowNestedEffectOwnership(tempDir, rules);
    assertDeepNestedEffectOwnership(tempDir, rules);
  } finally {
    removeTempDir(tempDir);
  }
};

interface PresetOwnershipCase {
  readonly label: string;
  readonly nonOwners: readonly string[];
  readonly owner: string;
  readonly source: string;
  readonly sourceFileName: string;
}

const assertPresetOwnership = (
  tempDir: string,
  rules: RuleConfig,
  ownershipCase: PresetOwnershipCase,
): void => {
  const result = runOxlintOnSource({
    cwd: tempDir,
    pluginSpecifier: distPluginPath,
    rules,
    source: ownershipCase.source,
    sourceFileName: ownershipCase.sourceFileName,
  });
  assertDiagnosticCount(result, {
    count: 1,
    label: ownershipCase.label,
    ruleName: ownershipCase.owner,
  });
  for (const ruleName of ownershipCase.nonOwners) {
    assertDiagnosticCount(result, { count: 0, label: ownershipCase.label, ruleName });
  }
};

const overlapBaseOwnershipCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: arrow ladder',
    nonOwners: ['no-iife-wrapper'],
    owner: 'no-arrow-ladder',
    source: "import * as Effect from 'effect/Effect';\n((x) => ((y) => y)(x))(value);\n",
    sourceFileName: 'arrow-ladder.ts',
  },
  {
    label: 'preset duplicate-intent ownership: function IIFE',
    nonOwners: ['no-arrow-ladder'],
    owner: 'no-iife-wrapper',
    source: "import * as Effect from 'effect/Effect';\n(function () { return value; })();\n",
    sourceFileName: 'function-iife.ts',
  },
  // Named wrappers get no exemption; each shape reports once through its surviving owner.
  {
    label: 'preset duplicate-intent ownership: deep ladder in a named wrapper',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-ladder',
    source: withEffect(
      'function run() { return Effect.map(Effect.catch(Effect.tryPromise(fetchUser), handle), f); }\n',
    ),
    sourceFileName: 'deep-ladder-named-wrapper.ts',
  },
  {
    label: 'preset duplicate-intent ownership: nested Effect argument in a named wrapper',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect('function run() { return Effect.map(Effect.succeed(1), f); }\n'),
    sourceFileName: 'mapped-named-wrapper.ts',
  },
];

// The two error-level owners take precedence over the flatMap warning.
const overlapLadderOwnershipCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: side-effect wrapper in a named wrapper',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source: withEffect("const run = () => Effect.as(program, console.log('x'));\n"),
    sourceFileName: 'side-effect-named-wrapper.ts',
  },
  {
    label: 'preset duplicate-intent ownership: const flatMap over flatMap over an Effect call',
    nonOwners: ['no-flatmap-ladder', 'no-effect-call-in-effect-arg'],
    owner: 'no-effect-ladder',
    source: withEffect(
      'const program = Effect.flatMap(Effect.flatMap(Effect.succeed(1), f), g);\n',
    ),
    sourceFileName: 'variable-flatmap-ladder.ts',
  },
  {
    label: 'preset duplicate-intent ownership: const flatten over map',
    nonOwners: ['no-flatmap-ladder', 'no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect('const program = Effect.flatten(Effect.map(program, f));\n'),
    sourceFileName: 'variable-flatten-map.ts',
  },
  {
    label: 'preset duplicate-intent ownership: deep const flatten over map',
    nonOwners: ['no-flatmap-ladder', 'no-effect-call-in-effect-arg'],
    owner: 'no-effect-ladder',
    source: withEffect('const program = Effect.flatten(Effect.map(Effect.succeed(1), f));\n'),
    sourceFileName: 'deep-flatten-map-ladder.ts',
  },
  {
    label: 'preset duplicate-intent ownership: const flatMap with a nested flatMap callback',
    nonOwners: ['no-effect-ladder', 'no-effect-call-in-effect-arg', 'no-pipe-ladder'],
    owner: 'no-flatmap-ladder',
    source: withEffect(
      'const program = Effect.flatMap(program, () => Effect.flatMap(other, f));\n',
    ),
    sourceFileName: 'callback-flatmap-ladder.ts',
  },
  {
    label: 'preset duplicate-intent ownership: const flatMap holding a closure ladder',
    nonOwners: ['no-flatmap-ladder', 'no-effect-call-in-effect-arg'],
    owner: 'no-pipe-ladder',
    source: withEffect(
      'const program = Effect.flatMap(work, (x) => Effect.flatMap(other(x), (y) => save(x, y)));\n',
    ),
    sourceFileName: 'const-closure-ladder.ts',
  },
  {
    label:
      'preset duplicate-intent ownership: returned data-first flatMap holding a closure ladder',
    nonOwners: ['no-flatmap-ladder', 'no-effect-call-in-effect-arg'],
    owner: 'no-pipe-ladder',
    source: withEffect(
      'function run() { return Effect.flatMap(work, (x) => Effect.flatMap(other(x), (y) => save(x, y))); }\n',
    ),
    sourceFileName: 'returned-closure-ladder.ts',
  },
  {
    label: 'preset duplicate-intent ownership: flatMap-flatMap expression statement',
    nonOwners: ['no-flatmap-ladder', 'no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect('Effect.flatMap(Effect.flatMap(program, f), g);\n'),
    sourceFileName: 'expr-flatmap-flatmap.ts',
  },
  {
    label: 'preset duplicate-intent ownership: eager value over an Effect-call source',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source: withEffect("Effect.as(Effect.succeed(1), console.log('x'));\n"),
    sourceFileName: 'as-eager-value-effect-source.ts',
  },
];

// An exempt or non-transforming outer call never hides the transformation inside it, and a
// nested chain reports once.
const overlapParentExemptOwnershipCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: a nested data-first chain reports once',
    nonOwners: ['no-effect-ladder', 'no-flatmap-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect('Effect.map(Effect.flatMap(Effect.succeed(1), f), g);\n'),
    sourceFileName: 'expr-chain-once.ts',
  },
  {
    label: 'preset duplicate-intent ownership: transformation inside an exempt runner',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect('Effect.runPromise(Effect.map(Effect.succeed(1), f));\n'),
    sourceFileName: 'runner-parent-exempt.ts',
  },
  {
    label: 'preset duplicate-intent ownership: transformation inside a const repeat',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect(
      'const program = Effect.repeat(Effect.catch(Effect.tryPromise(fetchUser), handle), policy);\n',
    ),
    sourceFileName: 'repeat-parent-exempt.ts',
  },
];

const overlapSideEffectOwnershipCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: Effect.as side-effect wrapper',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source: withEffect('Effect.as(program, setState(value));\n'),
    sourceFileName: 'side-effect-as.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.as Atom.set side-effect wrapper',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source: `${effectImportLine}import { Atom } from 'effect/unstable/reactivity';\nEffect.as(program, Atom.set(atom, value));\n`,
    sourceFileName: 'atom-side-effect-as.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.bind nested Effect argument',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-bind',
    source: withEffect("Effect.bind('user', Effect.succeed(user));\n"),
    sourceFileName: 'effect-bind-nested-effect.ts',
  },
  {
    label: 'preset duplicate-intent ownership: continuation nested in a flatMap callback',
    nonOwners: ['no-effect-call-in-effect-arg', 'no-flatmap-ladder'],
    owner: 'no-pipe-ladder',
    source: withEffect(
      'work.pipe(Effect.flatMap((x) => other(x).pipe(Effect.flatMap((y) => save(x, y)))));\n',
    ),
    sourceFileName: 'pipe-in-callback.ts',
  },
];

const overlapWrapperAliasNestedCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: transformation inside a const Effect.as',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect('const program = Effect.as(Effect.map(Effect.succeed(1), f), value);\n'),
    sourceFileName: 'as-deep-arg-const.ts',
  },
  {
    label: 'preset duplicate-intent ownership: non-first-arg deep nesting',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect(
      'const program = Effect.flatMap(Effect.map(program, Effect.succeed(1)), g);\n',
    ),
    sourceFileName: 'non-first-arg-deep.ts',
  },
  {
    label: 'preset duplicate-intent ownership: nested Effect argument in an arrow wrapper',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect('const run = () => Effect.map(Effect.succeed(value), f);\n'),
    sourceFileName: 'arrow-wrapper-nested-succeed.ts',
  },
];

// Pipe aliases get no exemption; each shape reports once through its surviving owner.
const overlapPipeAliasNestedCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.bind source',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-bind',
    source: withEffectAndPipe("const run = pipe(Effect.bind('user', loadUser), Effect.map(f));\n"),
    sourceFileName: 'pipe-alias-bind.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias nested Effect.map(Effect.succeed)',
    nonOwners: ['no-effect-ladder', 'no-pipe-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffectAndPipe(
      'const run = pipe(Effect.map(Effect.succeed(1), f), Effect.map(g));\n',
    ),
    sourceFileName: 'pipe-alias-map-succeed.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias data-last Effect.as side effect',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source: withEffectAndPipe(
      "const run = pipe(program, Effect.as(console.log('x')), Effect.map(f));\n",
    ),
    sourceFileName: 'pipe-alias-as-side-effect.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.all step-sequencing',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-all-step-sequencing',
    source: `${effectAndPipeImportLines}import * as Ref from 'effect/Ref';\nconst run = pipe(Effect.all([Ref.set(ref, value)], { concurrency: 1 }), Effect.map(f));\n`,
    sourceFileName: 'pipe-alias-all-step.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias no-effect-escape-hatch',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-escape-hatch',
    source: withEffectAndPipe('const run = pipe(Effect.orDie(program), Effect.map(f));\n'),
    sourceFileName: 'pipe-alias-escape-hatch.ts',
  },
  {
    label: 'preset duplicate-intent ownership: const pipe alias holding a closure ladder',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-pipe-ladder',
    source: withEffectAndPipe(
      'const run = pipe(Effect.succeed(1), Effect.flatMap((x) => pipe(load(x), Effect.flatMap((y) => save(x, y)))));\n',
    ),
    sourceFileName: 'const-pipe-ladder-alias.ts',
  },
];

const overlapConstFormCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: transformation inside a const orElse',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect(
      'const program = Effect.orElse(Effect.flatMap(Effect.succeed(1), f), fallback);\n',
    ),
    sourceFileName: 'const-orelse-deep-first-arg.ts',
  },
  {
    label: 'preset duplicate-intent ownership: const Effect.as with an eager value',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-side-effect-wrapper',
    source: withEffect("const replaced = Effect.as(program, console.log('x'));\n"),
    sourceFileName: 'const-as-eager-value.ts',
  },
  {
    label: 'preset duplicate-intent ownership: second-arg deep nesting',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: withEffect(
      'const program = Effect.zipRight(program, Effect.map(Effect.succeed(1), f));\n',
    ),
    sourceFileName: 'second-arg-deep.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.bind deep arg const',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-bind',
    source: withEffect(
      "const program = Effect.bind('user', Effect.map(Effect.succeed(user), f));\n",
    ),
    sourceFileName: 'bind-deep-arg-const.ts',
  },
  {
    label: 'preset duplicate-intent ownership: data-last Effect.as with a v4 Atom.set value',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source: `${effectImportLine}import * as Atom from 'effect/reactivity/Atom';\nprogram.pipe(Effect.as(Atom.set(atom, value)));\n`,
    sourceFileName: 'atom-set-data-last-as.ts',
  },
  {
    label: 'preset duplicate-intent ownership: string failure beside an escape hatch',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-string-error-channel',
    source: withEffect("const run = () => Effect.fail('boom');\n"),
    sourceFileName: 'string-failure.ts',
  },
];

const runPresetOverlapDuplicateIntentReplay = (): void => {
  const rules = effectPresetRuleConfig();
  const tempDir = createTempDir('backpressure-preset-overlap-intent-');
  const cases: readonly PresetOwnershipCase[] = [
    ...overlapBaseOwnershipCases(),
    ...overlapLadderOwnershipCases(),
    ...overlapParentExemptOwnershipCases(),
    ...overlapSideEffectOwnershipCases(),
    ...overlapWrapperAliasNestedCases(),
    ...overlapPipeAliasNestedCases(),
    ...overlapConstFormCases(),
  ];
  try {
    for (const ownershipCase of cases) {
      assertPresetOwnership(tempDir, rules, ownershipCase);
    }
  } finally {
    removeTempDir(tempDir);
  }
};

// Shapes the decision record allows. With the AST Effect preset alone they must lint clean, so
// no surviving rule reports them in place of a dropped one.
const decidedAllowedEffectShapes = [
  ['plain Effect-returning arrow', 'const run = () => Effect.succeed(value);'],
  ['plain Effect-returning function', 'function run() { return Effect.succeed(value); }'],
  ['string success value', "const run = () => Effect.succeed('ready');"],
  ['string const', "const status = 'ready';"],
  ['Effect.as value replacement', 'const mapped = Effect.as(program, value);'],
  ['Effect.as over an Effect call', 'Effect.as(Effect.succeed(1), value);'],
  ['v3 orElse over a data-first call', 'Effect.orElse(Effect.flatMap(program, f), fallback);'],
  ['pipe alias over an Effect source', 'const run = pipe(Effect.succeed(value), Effect.map(f));'],
  [
    'Effect.sync around a side effect',
    'const run = pipe(Effect.sync(() => setState(value)), Effect.map(f));',
  ],
  ['intentional nontermination', 'const keepAlive = Effect.never;'],
  [
    'early return in a combinator handler',
    'items.map((item) => { if (!item) { return fallback; } return item.id; });',
  ],
  ['runner over a generator', 'Effect.runPromise(Effect.gen(function* () { return 1; }));'],
  ['fork over a generator', 'Effect.forkChild(Effect.gen(function* () { return 1; }));'],
  ['acquire and release constructors', 'Effect.acquireRelease(Effect.sync(acquire), release);'],
  ['scoped generator', 'Effect.scoped(Effect.gen(function* () { return 1; }));'],
  ['ensuring cleanup', 'Effect.ensuring(work, Effect.sync(cleanup));'],
  ['provide over a scoped call', 'Effect.provide(Effect.scoped(acquire), layer);'],
  ['logging a tag', 'Effect.log(error._tag);'],
  [
    'typed catchTag handler reading its message',
    "Effect.catchTag('Failure', (error) => Effect.succeed(error.message));",
  ],
  ['failing with an error value', 'Effect.fail(error);'],
  ['chained Effect pipes', 'work.pipe(Effect.map(f)).pipe(Effect.catch(g));'],
  ['React component returning null', 'export const View = () => { return null; };'],
  ['nullable boundary helper', 'function find(): User | null { return null; }'],
  ['component-local useState', 'const [open] = useState(false);'],
  [
    'decoding a hoisted schema inline',
    "import * as Schema from 'effect/Schema';\nconst User = Schema.Struct({});\nconst parse = (raw) => Schema.decodeUnknownEffect(User)(raw);",
  ],
  ['registry instance call inside Effect.sync', 'Effect.sync(() => registry.set(count, 1));'],
  [
    'plain fromNullishOr',
    "import * as Option from 'effect/Option';\nconst maybe = Option.fromNullishOr(value);",
  ],
  ['Effect.as over a logging source', "Effect.as(Effect.logInfo('x'), value);"],
] as const;

const runDecidedAllowedShapesReplay = (): void => {
  const rules = effectPresetRuleConfig();
  const tempDir = createTempDir('backpressure-preset-allowed-shapes-');
  try {
    for (const [label, body] of decidedAllowedEffectShapes) {
      const result = runOxlintOnSource({
        cwd: tempDir,
        pluginSpecifier: distPluginPath,
        rules,
        source: `import * as Effect from 'effect/Effect';\n${body}\n`,
        sourceFileName: 'allowed-shape.ts',
      });
      const output = commandOutput(result);
      ensureSuccess(result, `decided-allowed Effect shape: ${label}\n${output}`);
      // A warning keeps the exit code at 0, so also require that no plugin rule reported.
      if (output.includes(`${oxlintPackageName}(`)) {
        fail(`decided-allowed Effect shape reported a diagnostic: ${label}\n${output}`);
      }
    }
  } finally {
    removeTempDir(tempDir);
  }
};

const runComposedPresetDuplicateIntentReplay = (): void => {
  const tempDir = createTempDir('backpressure-composed-preset-intent-');

  try {
    const composedResult = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: effectAndEffectReactPresetRuleConfig(),
      source:
        "import * as Effect from 'effect/Effect';\nimport { useAtomValue } from '@effect/atom-react';\nJSON.parse(payload);\n",
      sourceFileName: 'composed-json-parse.ts',
    });
    const composedLabel = 'composed preset duplicate-intent ownership: JSON.parse';
    ensureFailure(composedResult, composedLabel);
    assertDiagnosticCount(composedResult, {
      count: 1,
      label: composedLabel,
      ruleName: 'no-json-parse',
    });

    const effectReactOnlyResult = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: effectReactPresetRuleConfig(),
      source: "import { useAtomValue } from '@effect/atom-react';\nJSON.parse(payload);\n",
      sourceFileName: 'effect-react-json-parse.ts',
    });
    ensureSuccess(
      effectReactOnlyResult,
      `effect-react alone leaves JSON.parse to the effect preset\n${commandOutput(effectReactOnlyResult)}`,
    );
  } finally {
    removeTempDir(tempDir);
  }
};

const runPresetDuplicateIntentReplay = (): void => {
  const tempDir = createTempDir('backpressure-preset-intent-');

  try {
    const result = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: { 'no-effect-internal-tags': 'error', 'no-manual-tag-check': 'error' },
      source:
        "import * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);\n",
    });
    const label = 'preset duplicate-intent ownership: Option Some tag';
    ensureFailure(result, label);
    assertDiagnosticCount(result, { count: 1, label, ruleName: 'no-effect-internal-tags' });
    assertDiagnosticCount(result, { count: 0, label, ruleName: 'no-manual-tag-check' });
  } finally {
    removeTempDir(tempDir);
  }
};

// A React component whose only Effect-stack import is the v4 Atom binding gets the full
// import-gated Effect preset, not just the effect-react rules.
const runAtomBindingGateReplay = (): void => {
  const tempDir = createTempDir('backpressure-atom-binding-gate-');
  const label = 'Effect preset gating: React file importing only @effect/atom-react';
  try {
    const result = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: effectPresetRuleConfig(),
      source:
        "import { useAtomValue } from '@effect/atom-react';\nexport const Status = () => {\n  const status = useAtomValue(statusAtom);\n  const parsed = JSON.parse(status);\n  switch (parsed.kind) {\n    default:\n      return null;\n  }\n};\n",
      sourceFileName: 'Status.tsx',
    });
    ensureFailure(result, label);
    for (const ruleName of ['no-json-parse', 'no-switch-statement']) {
      assertDiagnosticCount(result, { count: 1, label, ruleName });
    }
  } finally {
    removeTempDir(tempDir);
  }
};

const runAllPresetReplays = (): void => {
  runAtomBindingGateReplay();
  runPresetDuplicateIntentReplay();
  runPresetNestedDuplicateIntentReplay();
  runPresetOverlapDuplicateIntentReplay();
  runDecidedAllowedShapesReplay();
  runComposedPresetDuplicateIntentReplay();
};

// Runs all suite cases and returns the total case count.
const runSuitesCases = (): number => {
  let count = 0;
  for (const replaySuite of replaySuites) {
    for (const fixtureCase of replaySuite.valid) {
      count += 1;
      runReplayCase(replaySuite, fixtureCase, false);
    }
    for (const fixtureCase of replaySuite.invalid) {
      count += 1;
      runReplayCase(replaySuite, fixtureCase, true);
    }
  }
  return count;
};

export const runFixtureReplay = (): void => {
  buildOxlintStandards();
  runAllPresetReplays();
  const replayCaseCount = runSuitesCases();
  const corpusVariantCount = runReferenceCorpusReplay();
  printLine(
    `fixture replay passed: ${replaySuites.length} suites, ${replayCaseCount} cases, ${corpusVariantCount} reference-corpus variants`,
  );
};

const [, entrypointPath] = process.argv;
if (typeof entrypointPath === 'string' && import.meta.url === pathToFileURL(entrypointPath).href) {
  runFixtureReplay();
}
