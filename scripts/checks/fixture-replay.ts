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
  printLine,
  removeTempDir,
  repoRoot,
} from '../lib/script-runtime.ts';
import { buildOxlintStandards, distPluginPath } from '../packages/oxlint-standards/package.ts';
import {
  type CommandResult,
  type RuleConfig,
  assertDiagnostic,
  assertDiagnosticCount,
  assertDiagnosticLine,
  runOxlintOnSource,
} from '../packages/oxlint-standards/real-engine.ts';

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
  ['no-unknown-error-message', 'const { message } = error;\n'],
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

const linteffectFixtureRoot = join(repoRoot, 'test-fixtures', 'linteffect', 'tests', 'fixtures');

interface ReplayCaseOptions {
  readonly branchIds?: readonly string[];
  readonly expectedDiagnostics?: number;
  readonly expectedLine?: number;
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
      sourceCase('no-switch-statement', 'invalid-switch-atom-react.ts'),
    ],
    valid: [
      sourceCase('no-switch-statement', 'valid-match-value.ts'),
      sourceCase('no-switch-statement', 'valid-switch-without-effect.ts'),
    ],
  }),
  suite({
    ruleName: 'no-effect-side-effect-wrapper',
    requiredBranchIds: [
      'invalid.effect-as-side-effect',
      'invalid.zip-right-log',
      'invalid.named-wrapper-not-exempt',
      'invalid.pipe-alias-not-exempt',
      'valid.non-side-effect-first-arg',
    ],
    invalid: [
      scenario(
        'source shape: Effect.as hides a setState side effect',
        "import * as Effect from 'effect/Effect';\nEffect.as(setState(value), undefined);\n",
        { branchIds: ['invalid.effect-as-side-effect'] },
      ),
      scenario(
        'source shape: Effect.zipRight discards an Effect log result',
        "import * as Effect from 'effect/Effect';\nEffect.zipRight(Effect.logInfo('x'), next);\n",
        { branchIds: ['invalid.zip-right-log'] },
      ),
      scenario(
        'a named wrapper gets no exemption from the eager side effect',
        "import * as Effect from 'effect/Effect';\nconst run = () => Effect.zipRight(Effect.logInfo('x'), next);\n",
        { branchIds: ['invalid.named-wrapper-not-exempt'] },
      ),
      scenario(
        'a pipe alias gets no exemption from the eager side effect',
        "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.zipRight(Effect.logInfo('x'), next), Effect.map(f));\n",
        { branchIds: ['invalid.pipe-alias-not-exempt'] },
      ),
    ],
    valid: [
      scenario(
        'allows value replacement without side effect first arg',
        "import * as Effect from 'effect/Effect';\nEffect.as(program, value);\n",
        {
          branchIds: ['valid.non-side-effect-first-arg'],
        },
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
      'invalid.static-identifier-schema',
      'invalid.static-member-schema',
      'invalid.static-from-json-string',
      'invalid.static-optional-call',
      'invalid.static-transform-call',
      'invalid.static-from-json-string-recursive-call',
      'valid.dynamic-factory-call',
      'valid.dynamic-from-json-string',
    ],
    invalid: [
      scenario(
        't3code scenario: compile decoder inside function and immediately apply it',
        "import * as Schema from 'effect/Schema';\nconst parse = () => Schema.decodeSync(User)(raw);\n",
        { branchIds: ['invalid.static-identifier-schema'] },
      ),
      scenario(
        'reference scenario: static member schema input is still static',
        "import * as Schema from 'effect/Schema';\nconst parse = () => Schema.decodeSync(models.User)(raw);\n",
        { branchIds: ['invalid.static-member-schema'] },
      ),
      scenario(
        't3code scenario: nested static Schema.fromJsonString compiler input',
        "import * as Schema from 'effect/Schema';\nconst parse = () => Schema.decodeSync(Schema.fromJsonString(User))(raw);\n",
        { branchIds: ['invalid.static-from-json-string'] },
      ),
      scenario(
        't3code scenario: any nested Schema.* call is static schema input',
        "import * as Schema from 'effect/Schema';\nconst parse = () => Schema.decodeSync(Schema.optional(User))(raw);\n",
        { branchIds: ['invalid.static-optional-call'] },
      ),
      scenario(
        't3code scenario: Schema.transform static call is static schema input',
        "import * as Schema from 'effect/Schema';\nconst parse = () => Schema.decodeSync(Schema.transform(User, f))(raw);\n",
        { branchIds: ['invalid.static-transform-call'] },
      ),
      scenario(
        't3code scenario: Schema.fromJsonString recurses into nested static Schema call',
        "import * as Schema from 'effect/Schema';\nconst parse = () => Schema.decodeSync(Schema.fromJsonString(Schema.optional(User)))(raw);\n",
        { branchIds: ['invalid.static-from-json-string-recursive-call'] },
      ),
    ],
    valid: [
      scenario(
        't3code scenario: module-scope compiler reused by parser',
        "import * as Schema from 'effect/Schema';\nconst parse = Schema.decodeSync(User);\n",
      ),
      scenario(
        'reference scenario: dynamic schema helper compiles caller-provided schema',
        "import * as Schema from 'effect/Schema';\nconst parseWith = (schema, raw) => Schema.decodeUnknownEffect(schema)(raw);\n",
      ),
      scenario(
        'reference scenario: dynamic schema factory returns reusable compiler',
        "import * as Schema from 'effect/Schema';\nconst makeDecoder = (schema) => Schema.decodeUnknownEffect(schema);\n",
      ),
      scenario(
        'reference scenario: dynamic factory call is not a static schema input',
        "import * as Schema from 'effect/Schema';\nconst parse = () => Schema.decodeUnknownEffect(makeSchema())(raw);\n",
        { branchIds: ['valid.dynamic-factory-call'] },
      ),
      scenario(
        'reference scenario: Schema.fromJsonString dynamic factory stays dynamic',
        "import * as Schema from 'effect/Schema';\nconst parse = () => Schema.decodeSync(Schema.fromJsonString(makeSchema()))(raw);\n",
        { branchIds: ['valid.dynamic-from-json-string'] },
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
      'invalid.pipe-alias-not-exempt',
      'valid.test-file-carveout',
    ],
    invalid: [
      scenario(
        'executor scenario: Effect.orDie escape hatch',
        "import * as Effect from 'effect/Effect';\nEffect.orDie(program);\n",
        { branchIds: ['invalid.escape-hatch'] },
      ),
      scenario(
        'a pipe alias gets no exemption from the escape-hatch ban',
        "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.orDie(program), Effect.map(f));\n",
        { branchIds: ['invalid.pipe-alias-not-exempt'] },
      ),
    ],
    valid: [
      scenario(
        'allows ordinary Effect error handling',
        "import * as Effect from 'effect/Effect';\nEffect.catch(program, handler);\n",
      ),
      scenario(
        'leaves local escape-hatch-shaped helper alone',
        'const Effect = { orDie: (value) => value };\nEffect.orDie(program);\n',
      ),
      scenario(
        'reference carve-out: test files may use escape hatches',
        "import * as Effect from 'effect/Effect';\nEffect.orDie(program);\n",
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
  suite({
    ruleName: 'no-pipe-ladder',
    requiredBranchIds: [
      'no-pipe-ladder.invalid-reference',
      'no-pipe-ladder.valid-reference',

      'invalid.nested-pipe-as-source-argument',
      'invalid.nested-pipe-as-step-argument',
      'invalid.nested-member-pipe-in-standalone-step',
      'invalid.nested-member-pipe-in-member-step',
      'invalid.const-pipe-alias-not-exempt',
      'valid.flat-pipe',
      'valid.member-chain-target-pipe',
    ],
    invalid: [
      scenario(
        'review branch: standalone pipe source may itself be a pipe ladder',
        "import * as Effect from 'effect/Effect';\npipe(pipe(source, f), g);\n",
        { branchIds: ['invalid.nested-pipe-as-source-argument'] },
      ),
      scenario(
        'source branch: standalone pipe step may contain a nested pipe ladder',
        "import * as Effect from 'effect/Effect';\npipe(value, pipe(other, f));\n",
        { branchIds: ['invalid.nested-pipe-as-step-argument', 'no-pipe-ladder.invalid-reference'] },
      ),
      scenario(
        'Ownership regression: nested member .pipe(...) in standalone pipe step is also a ladder',
        "import * as Effect from 'effect/Effect';\npipe(value, other.pipe(f));\n",
        { branchIds: ['invalid.nested-member-pipe-in-standalone-step'] },
      ),
      scenario(
        'Ownership regression: nested member .pipe(...) inside member pipe step is also a ladder',
        "import * as Effect from 'effect/Effect';\nsource.pipe(other.pipe(f));\n",
        { branchIds: ['invalid.nested-member-pipe-in-member-step'] },
      ),
      scenario(
        'a const pipe alias whose source is an Effect call gets no exemption',
        "import * as Effect from 'effect/Effect';\nconst run = pipe(pipe(Effect.succeed(1), f), g);\n",
        { branchIds: ['invalid.const-pipe-alias-not-exempt'] },
      ),
    ],
    valid: [
      scenario(
        'flat standalone pipe remains valid',
        "import * as Effect from 'effect/Effect';\npipe(value, f);\n",
        { branchIds: ['valid.flat-pipe', 'no-pipe-ladder.valid-reference'] },
      ),
      scenario(
        'source parity: member pipe chains do not inspect the target expression',
        "import * as Effect from 'effect/Effect';\nsource.pipe(f).pipe(g);\n",
        {
          branchIds: ['valid.member-chain-target-pipe'],
        },
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
      'valid.console-not-source-step',
      'valid.set-state-not-source-step',
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
    ],
  }),
  suite({
    ruleName: 'no-effect-call-in-effect-arg',
    requiredBranchIds: [
      'invalid.direct-flatmap-succeed',
      'invalid.provide-scoped',
      'invalid.deep-arg-expression-statement',
      'invalid.flatmap-flatmap-expression-statement',
      'invalid.flatten-map-expression-statement',
      'invalid.effect-as-nested-effect-argument',
      'invalid.orelse-nested-effect-argument',
      'invalid.named-wrapper-not-exempt',
      'valid.callback-body-effect',
      'valid.effect-bind-owned-by-no-effect-bind',
      'valid.const-flatmap-flatmap',
      'valid.const-flatten-map',
    ],
    invalid: [
      scenario(
        'direct nested Effect argument',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.succeed(1), f);\n",
        {
          branchIds: ['invalid.direct-flatmap-succeed'],
        },
      ),
      scenario(
        'source wildcard branch: provide receives scoped Effect call directly',
        "import * as Effect from 'effect/Effect';\nEffect.provide(Effect.scoped(acquire), layer);\n",
        {
          branchIds: ['invalid.provide-scoped'],
        },
      ),
      scenario(
        'Ownership regression: deep direct Effect arg (depth > 1) in expression-statement has no other enabled owner',
        "import * as Effect from 'effect/Effect';\nEffect.map(Effect.flatMap(Effect.succeed(1), f), g);\n",
        {
          branchIds: ['invalid.deep-arg-expression-statement'],
        },
      ),
      scenario(
        'Ownership regression: flatMap(flatMap) expression-statement is no longer owned by no-flatmap-ladder',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.flatMap(program, f), g);\n",
        {
          branchIds: ['invalid.flatmap-flatmap-expression-statement'],
        },
      ),
      scenario(
        'Ownership regression: flatten(map) expression-statement has no other enabled owner',
        "import * as Effect from 'effect/Effect';\nEffect.flatten(Effect.map(program, f));\n",
        {
          branchIds: ['invalid.flatten-map-expression-statement'],
        },
      ),
      scenario(
        'no active rule owns a nested Effect argument to Effect.as',
        "import * as Effect from 'effect/Effect';\nEffect.as(Effect.succeed(1), value);\n",
        {
          branchIds: ['invalid.effect-as-nested-effect-argument'],
        },
      ),
      scenario(
        'no active rule owns a nested Effect argument to Effect.orElse',
        "import * as Effect from 'effect/Effect';\nEffect.orElse(Effect.flatMap(program, f), fallback);\n",
        {
          branchIds: ['invalid.orelse-nested-effect-argument'],
        },
      ),
      scenario(
        'a named wrapper gets no exemption from nested Effect arguments',
        "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.map(Effect.succeed(1), f); }\n",
        {
          branchIds: ['invalid.named-wrapper-not-exempt'],
        },
      ),
    ],
    valid: [
      scenario(
        'callback body Effect call is not a direct argument',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.succeed(value));\n",
        {
          branchIds: ['valid.callback-body-effect'],
        },
      ),
      scenario(
        'ownership split: Effect.bind owns its nested argument shape',
        "import * as Effect from 'effect/Effect';\nEffect.bind('user', Effect.succeed(user));\n",
        {
          branchIds: ['valid.effect-bind-owned-by-no-effect-bind'],
        },
      ),
      scenario(
        'Ownership regression: flatMap(flatMap) const is still owned by no-flatmap-ladder',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.flatMap(Effect.succeed(1), f), g);\n",
        {
          branchIds: ['valid.const-flatmap-flatmap'],
        },
      ),
      scenario(
        'Ownership regression: flatten(map) const is still owned by no-flatmap-ladder',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatten(Effect.map(program, f));\n",
        {
          branchIds: ['valid.const-flatten-map'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-ladder',
    requiredBranchIds: [
      'invalid.variable-initializer-flatmap-map-succeed',
      'invalid.return-repeat-catchall-trypromise',
      'valid.callback-body-effect',
      'valid.expression-statement-ladder',
      'valid.let-initializer-ladder',
      'valid.var-initializer-ladder',
      'valid.second-arg-deep-nesting',
      'invalid.const-orelse-deep-first-arg',
      'invalid.named-wrapper-not-exempt',
      'valid.side-effect-wrapper-const-owned-by-specific',
      'valid.non-first-arg-deep-not-ladder',
    ],
    invalid: [
      scenario(
        'source branch: variable initializer contains direct three-deep Effect ladder',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);\n",
        {
          branchIds: ['invalid.variable-initializer-flatmap-map-succeed'],
        },
      ),
      scenario(
        'source branch: return statement contains repeat wraps catchAll wraps tryPromise',
        "import * as Effect from 'effect/Effect';\nfunction run() { if (ready) { return Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy); } return fallback; }\n",
        {
          branchIds: ['invalid.return-repeat-catchall-trypromise'],
        },
      ),
      scenario(
        'no active rule owns a const orElse chain with a deep first argument',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.orElse(Effect.flatMap(Effect.succeed(1), f), fallback);\n",
        {
          branchIds: ['invalid.const-orelse-deep-first-arg'],
        },
      ),
      scenario(
        'a named wrapper gets no exemption from the ladder',
        "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy); }\n",
        {
          branchIds: ['invalid.named-wrapper-not-exempt'],
        },
      ),
    ],
    valid: [
      scenario(
        'callback body Effect call is not ladder depth',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.succeed(value));\n",
        {
          branchIds: ['valid.callback-body-effect'],
        },
      ),
      scenario(
        'source false-positive: expression statements are owned by narrower source branches',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.map(Effect.succeed(1), f), g);\n",
        {
          branchIds: ['valid.expression-statement-ladder'],
        },
      ),
      scenario(
        'source parity: let initializers are outside ladder scope',
        "import * as Effect from 'effect/Effect';\nlet program = Effect.flatMap(Effect.map(Effect.succeed(1), f), g);\n",
        {
          branchIds: ['valid.let-initializer-ladder'],
        },
      ),
      scenario(
        'source parity: var initializers are outside ladder scope',
        "import * as Effect from 'effect/Effect';\nvar program = Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy);\n",
        {
          branchIds: ['valid.var-initializer-ladder'],
        },
      ),
      scenario(
        'Ownership regression: second-arg-only deep nesting is not owned by no-effect-ladder (first-arg only)',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.zipRight(program, Effect.map(Effect.succeed(1), f));\n",
        {
          branchIds: ['valid.second-arg-deep-nesting'],
        },
      ),
      scenario(
        'Ownership regression: const side-effect-wrapper shape is owned by no-effect-side-effect-wrapper, not no-effect-ladder',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.zipRight(Effect.map(Effect.logInfo('x'), f), next);\n",
        {
          branchIds: ['valid.side-effect-wrapper-const-owned-by-specific'],
        },
      ),
      scenario(
        'Ownership regression: non-first-arg deep nesting is not a ladder; owned by no-effect-call-in-effect-arg',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.map(program, Effect.succeed(1)), g);\n",
        {
          branchIds: ['valid.non-first-arg-deep-not-ladder'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-flatmap-ladder',
    requiredBranchIds: [
      'invalid.const-flatmap-flatmap',
      'invalid.const-flatten-map',
      'invalid.callback-nested-flatmap',
      'invalid.named-wrapper-not-exempt',
      'no-flatmap-ladder.invalid-reference',
      'no-flatmap-ladder.valid-reference',
      'valid.expression-statement-flatmap',
      'valid.let-initializer-flatmap',
      'valid.var-initializer-flatten',
    ],
    invalid: [
      scenario(
        'source branch: const initializer with nested flatMap',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.flatMap(program, f), g);\n",
        {
          branchIds: ['invalid.const-flatmap-flatmap', 'no-flatmap-ladder.invalid-reference'],
        },
      ),
      scenario(
        'source branch: const initializer with flatten over map',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatten(Effect.map(program, f));\n",
        {
          branchIds: ['invalid.const-flatten-map'],
        },
      ),
      scenario(
        'Behavior regression: nested flatMap in callback arg is source-covered via full-arg scan',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(program, () => Effect.flatMap(other, f));\n",
        {
          branchIds: ['invalid.callback-nested-flatmap'],
        },
      ),
      scenario(
        'a named wrapper gets no exemption from the flatMap ladder',
        "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.flatMap(Effect.flatMap(program, f), g); }\n",
        {
          branchIds: ['invalid.named-wrapper-not-exempt'],
        },
      ),
    ],
    valid: [
      scenario(
        'source parity: expression statement flatMap ladder is outside source scope',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.flatMap(program, f), g);\n",
        {
          branchIds: ['valid.expression-statement-flatmap', 'no-flatmap-ladder.valid-reference'],
        },
      ),
      scenario(
        'source parity: let initializer flatMap ladder is outside source scope',
        "import * as Effect from 'effect/Effect';\nlet program = Effect.flatMap(Effect.flatMap(program, f), g);\n",
        {
          branchIds: ['valid.let-initializer-flatmap'],
        },
      ),
      scenario(
        'source parity: var initializer flatten ladder is outside source scope',
        "import * as Effect from 'effect/Effect';\nvar program = Effect.flatten(Effect.map(program, f));\n",
        {
          branchIds: ['valid.var-initializer-flatten'],
        },
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
      'valid.option-tag-owned-by-internal-tags',
    ],
    invalid: [
      scenario(
        'executor branch: generic manual _tag presence check',
        "import * as Effect from 'effect/Effect';\nif ('_tag' in error) handle(error);\n",
        {
          branchIds: ['invalid.generic-tag-in-check', 'no-manual-tag-check.invalid-reference'],
        },
      ),
    ],
    valid: [
      scenario(
        'ownership boundary: Option Some tag is owned by no-effect-internal-tags',
        "import * as Option from 'effect/Option';\nif (option._tag === 'Some') use(option);\n",
        {
          branchIds: ['valid.option-tag-owned-by-internal-tags'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-internal-tags',
    requiredBranchIds: [
      'invalid.option-some-tag',
      'invalid.barrel-option-some-tag',
      'invalid.result-left-tag',
      'invalid.barrel-result-right-tag',
      'valid.bare-effect-import',
      'valid.option-import-success-tag',
      'valid.exit-import-some-tag',
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
        'executor branch: Result import reports Left tag',
        "import * as Result from 'effect/Result';\nif (result._tag === 'Left') use(result);\n",
        {
          branchIds: ['invalid.result-left-tag'],
        },
      ),
      scenario(
        'executor branch: barrel Result import reports Right tag',
        "import { Result } from 'effect';\nif (result._tag === 'Right') use(result);\n",
        {
          branchIds: ['invalid.barrel-result-right-tag'],
        },
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
    ],
  }),
  suite({
    ruleName: 'no-unknown-error-message',
    requiredBranchIds: [
      'invalid.error-message-destructure',
      'valid.notification-message-destructure',
    ],
    invalid: [
      scenario(
        'destructured error message from error-like initializer',
        "import * as Effect from 'effect/Effect';\nconst { message } = error;\n",
        {
          branchIds: ['invalid.error-message-destructure'],
        },
      ),
    ],
    valid: [
      scenario(
        'destructured message from non-error notification',
        "import * as Effect from 'effect/Effect';\nconst { message } = userNotification;\n",
        {
          branchIds: ['valid.notification-message-destructure'],
        },
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
      'invalid.direct-either-match',
      'invalid.iife-object-return-match-arg',
      'invalid.iife-object-return-option-arg',
      'invalid.iife-object-return-either-arg',
      'invalid.iife-object-return-wrapped-branch-arg',
      'valid.wrapped-match-value-property',
      'valid.wrapped-option-match-property',
      'valid.wrapped-either-match-property',
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
        'source branch: direct Either.match property value',
        "import * as Either from 'effect/Either';\nconst value = { ready: Either.match(input, { onRight: () => true, onLeft: () => false }) };\n",
        { branchIds: ['invalid.direct-either-match'] },
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
        'source branch: block-bodied function IIFE returns object and arg contains Either.match',
        "import * as Either from 'effect/Either';\nconst value = (function (branch) { return { ready: branch }; })(Either.match(input, { onRight: () => true, onLeft: () => false }));\n",
        { branchIds: ['invalid.iife-object-return-either-arg'] },
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
        'source parity: wrapped Either.match property value is not a direct branch value',
        "import * as Either from 'effect/Either';\nconst value = { ready: decorate(Either.match(input, { onRight: () => true, onLeft: () => false })) };\n",
        {
          branchIds: ['valid.wrapped-either-match-property'],
        },
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
  ...(
    [
      [
        'no-arrow-ladder',
        "import * as Effect from 'effect/Effect';\n((x) => ((y) => y)(x))(value);\n",
        'const value = ((x) => ((y) => y)(x))(input);\n',
      ],
      [
        'no-atom-registry-effect-sync',
        "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.sync(() => Atom.get(atom));\n",
        "import { Atom } from '@effect-atom/atom-react';\nAtom.get(atom);\n",
      ],
      [
        'no-effect-bind',
        "import * as Effect from 'effect/Effect';\nEffect.bind('user', loadUser);\n",
        "import * as Effect from 'effect/Effect';\nEffect.map(program, f);\n",
      ],
      [
        'no-fromnullable-nullish-coalesce',
        "import * as Option from 'effect/Option';\nOption.fromNullable(value ?? null);\n",
        "import * as Option from 'effect/Option';\nOption.fromNullable(value);\n",
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
      ['no-react-state', 'const [value] = useState(0);\n', 'const [value] = useAtom(atom);\n'],
      [
        'no-return-null',
        "import * as Effect from 'effect/Effect';\nfunction value() { return null; }\n",
        'function value() { return null; }\n',
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
  assertDiagnostic(result, { ...replaySuite.diagnostic, label: fixtureCase.name });
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
    source:
      "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy); }\n",
    sourceFileName: 'deep-ladder-named-wrapper.ts',
  },
  {
    label: 'preset duplicate-intent ownership: nested Effect argument in a named wrapper',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source:
      "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.map(Effect.succeed(1), f); }\n",
    sourceFileName: 'mapped-named-wrapper.ts',
  },
  {
    label: 'preset duplicate-intent ownership: orElse in a named wrapper',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source:
      "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.orElse(Effect.flatMap(program, f), fallback); }\n",
    sourceFileName: 'orelse-named-wrapper.ts',
  },
];

const overlapLadderOwnershipCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: side-effect wrapper in a named wrapper',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source:
      'import * as Effect from \'effect/Effect\';\nconst run = () => Effect.zipRight(Effect.logInfo("x"), next);\n',
    sourceFileName: 'side-effect-named-wrapper.ts',
  },
  {
    label: 'preset duplicate-intent ownership: variable flatMap ladder',
    nonOwners: ['no-effect-ladder', 'no-effect-call-in-effect-arg'],
    owner: 'no-flatmap-ladder',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.flatMap(Effect.succeed(1), f), g);\n",
    sourceFileName: 'variable-flatmap-ladder.ts',
  },
  {
    label: 'preset duplicate-intent ownership: variable flatten map ladder',
    nonOwners: ['no-effect-ladder', 'no-effect-call-in-effect-arg'],
    owner: 'no-flatmap-ladder',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.flatten(Effect.map(program, f));\n",
    sourceFileName: 'variable-flatten-map.ts',
  },
  // Ownership regression: deep flatten(map(succeed)) — no-flatmap-ladder owns it; no-effect-ladder must not fire.
  {
    label: 'preset duplicate-intent ownership: deep flatten map ladder',
    nonOwners: ['no-effect-ladder', 'no-effect-call-in-effect-arg'],
    owner: 'no-flatmap-ladder',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.flatten(Effect.map(Effect.succeed(1), f));\n",
    sourceFileName: 'deep-flatten-map-ladder.ts',
  },
  {
    label: 'preset duplicate-intent ownership: flatMap-flatMap expression statement',
    nonOwners: ['no-flatmap-ladder', 'no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source:
      "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.flatMap(program, f), g);\n",
    sourceFileName: 'expr-flatmap-flatmap.ts',
  },
  {
    label: 'preset duplicate-intent ownership: flatten-map expression statement',
    nonOwners: ['no-flatmap-ladder', 'no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: "import * as Effect from 'effect/Effect';\nEffect.flatten(Effect.map(program, f));\n",
    sourceFileName: 'expr-flatten-map.ts',
  },
  {
    label: 'preset duplicate-intent ownership: zipRight side-effect wrapper',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source:
      "import * as Effect from 'effect/Effect';\nEffect.zipRight(Effect.logInfo('x'), next);\n",
    sourceFileName: 'zipright-side-effect.ts',
  },
];

const overlapSideEffectOwnershipCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: Effect.as side-effect wrapper',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source: "import * as Effect from 'effect/Effect';\nEffect.as(setState(value), undefined);\n",
    sourceFileName: 'side-effect-as.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.as Atom.set side-effect wrapper',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source:
      "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.as(Atom.set(atom, value), undefined);\n",
    sourceFileName: 'atom-side-effect-as.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.as nested Effect argument',
    nonOwners: ['no-effect-side-effect-wrapper', 'no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source: "import * as Effect from 'effect/Effect';\nEffect.as(Effect.succeed(1), value);\n",
    sourceFileName: 'effect-as-nested-effect.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.bind nested Effect argument',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-bind',
    source:
      "import * as Effect from 'effect/Effect';\nEffect.bind('user', Effect.succeed(user));\n",
    sourceFileName: 'effect-bind-nested-effect.ts',
  },
  {
    label: 'preset duplicate-intent ownership: orElse nested Effect argument',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source:
      "import * as Effect from 'effect/Effect';\nEffect.orElse(Effect.flatMap(program, f), fallback);\n",
    sourceFileName: 'orelse-nested-effect.ts',
  },
];

const overlapWrapperAliasNestedCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: Effect.as deep arg const',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-ladder',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.as(Effect.map(Effect.succeed(1), f), value);\n",
    sourceFileName: 'as-deep-arg-const.ts',
  },
  // Ownership regression: non-first-arg deep nesting — no-effect-ladder must not fire; no-effect-call-in-effect-arg owns.
  {
    label: 'preset duplicate-intent ownership: non-first-arg deep nesting',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.map(program, Effect.succeed(1)), g);\n",
    sourceFileName: 'non-first-arg-deep.ts',
  },
  {
    label: 'preset duplicate-intent ownership: nested Effect argument in an arrow wrapper',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = () => Effect.map(Effect.succeed(value), f);\n",
    sourceFileName: 'arrow-wrapper-nested-succeed.ts',
  },
];

// Pipe aliases get no exemption; each shape reports once through its surviving owner.
const overlapPipeAliasNestedCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.bind source',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-bind',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.bind('user', loadUser), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-bind.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias nested Effect.map(Effect.succeed)',
    nonOwners: ['no-effect-ladder', 'no-pipe-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.map(Effect.succeed(1), f), Effect.map(g));\n",
    sourceFileName: 'pipe-alias-map-succeed.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.zipRight side-effect',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.zipRight(Effect.logInfo('x'), next), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-zipright.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.all step-sequencing',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-all-step-sequencing',
    source:
      "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nconst run = pipe(Effect.all([Ref.set(ref, value)], { concurrency: 1 }), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-all-step.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias no-effect-escape-hatch',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-escape-hatch',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.orDie(program), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-escape-hatch.ts',
  },
  {
    label: 'preset duplicate-intent ownership: const pipe ladder alias',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-pipe-ladder',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(pipe(Effect.succeed(1), f), g);\n",
    sourceFileName: 'const-pipe-ladder-alias.ts',
  },
];

const overlapConstFormCases = (): readonly PresetOwnershipCase[] => [
  {
    label: 'preset duplicate-intent ownership: const orElse chain with a deep first argument',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-ladder',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.orElse(Effect.flatMap(Effect.succeed(1), f), fallback);\n",
    sourceFileName: 'const-orelse-deep-first-arg.ts',
  },
  // Ownership regression: side-effect-wrapper owns this const form; no-effect-ladder must not double-report.
  {
    label: 'preset duplicate-intent ownership: const side-effect-wrapper zipRight',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-side-effect-wrapper',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.zipRight(Effect.map(Effect.logInfo('x'), f), next);\n",
    sourceFileName: 'const-side-effect-zipright.ts',
  },
  // Ownership regression: second-arg-only deep nesting — no-effect-ladder must not fire; no-effect-call-in-effect-arg owns.
  {
    label: 'preset duplicate-intent ownership: second-arg deep nesting',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-call-in-effect-arg',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.zipRight(program, Effect.map(Effect.succeed(1), f));\n",
    sourceFileName: 'second-arg-deep.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.bind deep arg const',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-bind',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.bind('user', Effect.map(Effect.succeed(user), f));\n",
    sourceFileName: 'bind-deep-arg-const.ts',
  },
  // Ownership regression: Atom.set is a side-effect; no-effect-side-effect-wrapper owns this, not no-effect-call-in-effect-arg.
  {
    label: 'preset duplicate-intent ownership: Atom.set side-effect zipRight',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-side-effect-wrapper',
    source:
      "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.zipRight(Atom.set(atom, value), Effect.succeed(next));\n",
    sourceFileName: 'atom-set-zipright.ts',
  },
];

const runPresetOverlapDuplicateIntentReplay = (): void => {
  const rules = effectPresetRuleConfig();
  const tempDir = createTempDir('backpressure-preset-overlap-intent-');
  const cases: readonly PresetOwnershipCase[] = [
    ...overlapBaseOwnershipCases(),
    ...overlapLadderOwnershipCases(),
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
      ensureSuccess(result, `decided-allowed Effect shape: ${label}\n${commandOutput(result)}`);
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
        "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nJSON.parse(payload);\n",
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
      source: "import { Atom } from '@effect-atom/atom-react';\nJSON.parse(payload);\n",
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

const runAllPresetReplays = (): void => {
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
  printLine(`fixture replay passed: ${replaySuites.length} suites, ${replayCaseCount} cases`);
};

const [, entrypointPath] = process.argv;
if (typeof entrypointPath === 'string' && import.meta.url === pathToFileURL(entrypointPath).href) {
  runFixtureReplay();
}
