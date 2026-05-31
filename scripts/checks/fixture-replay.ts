#!/usr/bin/env node
/* oxlint-disable max-lines -- The replay matrix is intentionally data-dense proof material. */
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
  readonly branchIds?: ReadonlyArray<string>;
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
  readonly invalid: ReadonlyArray<ReplayCase>;
  readonly requiredBranchIds: ReadonlyArray<string>;
  readonly rules: RuleConfig;
  readonly valid: ReadonlyArray<ReplayCase>;
}

interface SuiteOptions {
  readonly invalid: ReadonlyArray<ReplayCase>;
  readonly message?: string;
  readonly requiredBranchIds?: ReadonlyArray<string>;
  readonly ruleName: string;
  readonly valid: ReadonlyArray<ReplayCase>;
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
    ruleName: 'no-effect-as',
    requiredBranchIds: [
      'invalid.effect-as-value-replacement',
      'invalid.let-wrapper-unowned-by-wrapper-alias',
      'invalid.var-wrapper-unowned-by-wrapper-alias',
      'valid.effect-as-void',
      'valid.const-wrapper-owned-by-wrapper-alias',
      'valid.barrel-non-effect-alias',
    ],
    invalid: [
      scenario(
        'source-derived Effect.as namespace call',
        "import * as Effect from 'effect/Effect';\nEffect.as(value);\n",
        { branchIds: ['invalid.effect-as-value-replacement'] },
      ),
      scenario(
        'ownership split: let wrapper is not owned by no-effect-wrapper-alias',
        "import * as Effect from 'effect/Effect';\nlet run = () => Effect.as(value);\n",
        {
          branchIds: ['invalid.let-wrapper-unowned-by-wrapper-alias'],
        },
      ),
      scenario(
        'ownership split: var wrapper is not owned by no-effect-wrapper-alias',
        "import * as Effect from 'effect/Effect';\nvar run = () => Effect.as(value);\n",
        {
          branchIds: ['invalid.var-wrapper-unowned-by-wrapper-alias'],
        },
      ),
    ],
    valid: [
      scenario(
        'allows Effect.asVoid because the source rule targets value replacement only',
        "import * as Effect from 'effect/Effect';\nEffect.asVoid(value);\n",
        { branchIds: ['valid.effect-as-void'] },
      ),
      scenario(
        'ownership split: const wrapper return is owned by no-effect-wrapper-alias',
        "import * as Effect from 'effect/Effect';\nconst run = () => Effect.as(value);\n",
        {
          branchIds: ['valid.const-wrapper-owned-by-wrapper-alias'],
        },
      ),
      scenario(
        'Ownership regression: barrel effect with non-Effect alias does not trigger no-effect-as',
        "import * as Option from 'effect';\nOption.as(value);\n",
        {
          branchIds: ['valid.barrel-non-effect-alias'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-family-collection-read',
    invalid: [
      sourceCase('no-family-collection-read', 'invalid-get.ts', { expectedLine: 13 }),
      sourceCase('no-family-collection-read', 'invalid-get-get.ts', { expectedLine: 10 }),
      sourceCase('no-family-collection-read', 'invalid-atom-get.ts', { expectedLine: 10 }),
    ],
    valid: [
      sourceCase('no-family-collection-read', 'valid-keyed-source.ts'),
      sourceCase('no-family-collection-read', 'valid-outside-family.ts'),
    ],
  }),
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
        expectedLine: 10,
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
    ruleName: 'no-naked-object-state-update',
    invalid: [
      sourceCase('no-naked-object-state-update', 'invalid-spread.ts', { expectedLine: 10 }),
      sourceCase('no-naked-object-state-update', 'invalid-from-entries.ts', { expectedLine: 22 }),
      sourceCase('no-naked-object-state-update', 'invalid-object-assign.ts', {
        expectedDiagnostics: 2,
        expectedLine: 11,
      }),
      sourceCase('no-naked-object-state-update', 'invalid-json-transition.ts', {
        expectedDiagnostics: 2,
        expectedLine: 12,
      }),
    ],
    valid: [
      sourceCase('no-naked-object-state-update', 'valid-effect-record-set.ts'),
      scenario(
        'review false-positive: Object.fromEntries without Object.entries is not source shape',
        "import * as Ref from 'effect/Ref';\nRef.update(stateRef, (state) => Object.fromEntries(entries));\n",
      ),
      scenario(
        'review false-positive: Object.assign without empty target is not source shape',
        "import * as Ref from 'effect/Ref';\nRef.update(stateRef, (state) => Object.assign(state, patch));\n",
      ),
      scenario(
        'ownership split: JSON.parse belongs to no-json-parse',
        "import * as Effect from 'effect/Effect';\nJSON.parse(payload);\n",
      ),
    ],
  }),
  suite({
    ruleName: 'no-switch-statement',
    invalid: [
      sourceCase('no-switch-statement', 'invalid-switch.ts', { expectedLine: 6 }),
      sourceCase('no-switch-statement', 'invalid-switch-submodule-import.ts', { expectedLine: 6 }),
      sourceCase('no-switch-statement', 'invalid-switch-atom-react.ts', { expectedLine: 7 }),
    ],
    valid: [
      sourceCase('no-switch-statement', 'valid-match-value.ts'),
      sourceCase('no-switch-statement', 'valid-switch-without-effect.ts'),
    ],
  }),
  suite({
    ruleName: 'effect-no-multiple-provide',
    requiredBranchIds: [
      'invalid.member-pipe-direct-steps',
      'invalid.standalone-bound-pipe-direct-steps',
      'invalid.chained-member-pipe-steps',
      'invalid.three-provides-inner-outer-chain',
      'invalid.nested-standalone-pipe',
      'valid.nested-callback-provide',
      'valid.local-pipe-helper',
    ],
    invalid: [
      scenario(
        'direct member pipe steps count as one pipeline',
        "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A), Effect.provide(B));\n",
        { branchIds: ['invalid.member-pipe-direct-steps'] },
      ),
      scenario(
        'standalone imported pipe steps count as one pipeline',
        "import * as E from 'effect/Effect';\nimport { pipe } from 'effect/Function';\npipe(effect, E.provide(A), E.provide(B));\n",
        { branchIds: ['invalid.standalone-bound-pipe-direct-steps'] },
      ),
      scenario(
        'chained member pipe steps count across the same pipeline',
        "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A)).pipe(Effect.provide(B));\n",
        { branchIds: ['invalid.chained-member-pipe-steps'] },
      ),
      scenario(
        'Behavior regression: three provides across inner+outer chain report via outermost call only',
        "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A), Effect.provide(B)).pipe(Effect.provide(C));\n",
        { branchIds: ['invalid.three-provides-inner-outer-chain'] },
      ),
      scenario(
        'Behavior regression: nested standalone pipe(pipe(...)) is detected as one composed pipeline',
        "import * as Effect from 'effect/Effect';\nimport { pipe } from 'effect/Function';\npipe(pipe(effect, Effect.provide(A)), Effect.provide(B));\n",
        { branchIds: ['invalid.nested-standalone-pipe'] },
      ),
    ],
    valid: [
      scenario(
        'nested callback provide is not a direct pipe step',
        "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A), Effect.map(() => Effect.provide(B)));\n",
        { branchIds: ['valid.nested-callback-provide'] },
      ),
      scenario(
        'single merged provide remains valid',
        "import * as Effect from 'effect/Effect';\nEffect.provide(effect, Layer.mergeAll(A, B));\n",
      ),
      scenario(
        'local helper named pipe is not treated as Effect pipe',
        "import * as Effect from 'effect/Effect';\nconst pipe = (...steps) => steps;\npipe(effect, Effect.provide(A), Effect.provide(B));\n",
        { branchIds: ['valid.local-pipe-helper'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-side-effect-wrapper',
    requiredBranchIds: [
      'invalid.effect-as-side-effect',
      'invalid.zip-right-log',
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
    ruleName: 'no-return-in-arrow',
    requiredBranchIds: [
      'invalid.effect-arrow-callback-return',
      'valid.schema-filter-return-exception',
    ],
    invalid: [
      scenario(
        'source shape: callback arrow block returns inside Effect file',
        "import * as Effect from 'effect/Effect';\nitems.map((item) => { return item.id; });\n",
        { branchIds: ['invalid.effect-arrow-callback-return'] },
      ),
    ],
    valid: [
      scenario(
        'source exception: Schema.filter callbacks may return from block bodies',
        "import * as Schema from 'effect/Schema';\nSchema.filter((value) => { return value !== null; }, { message: () => 'x' });\n",
        { branchIds: ['valid.schema-filter-return-exception'] },
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
    ruleName: 'prefer-effect-fn',
    requiredBranchIds: [
      'invalid.arrow-wrapper-effect-gen',
      'valid.inline-effect-gen-value',
      'valid.inline-flatmap-callback',
      'valid.pipe-flatmap-callback',
      'valid.local-effect-helper',
    ],
    invalid: [
      scenario(
        'recon scenario: redundant Effect.gen wrapper function',
        "import * as Effect from 'effect/Effect';\nconst run = () => Effect.gen(function* () { yield* task; });\n",
        { branchIds: ['invalid.arrow-wrapper-effect-gen'] },
      ),
    ],
    valid: [
      scenario(
        'allows inline Effect.gen value',
        "import * as Effect from 'effect/Effect';\nconst run = Effect.gen(function* () { yield* task; });\n",
        { branchIds: ['valid.inline-effect-gen-value'] },
      ),
      scenario(
        'review false-positive: inline flatMap callback may return Effect.gen',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.gen(function* () { yield* task; }));\n",
        { branchIds: ['valid.inline-flatmap-callback'] },
      ),
      scenario(
        'review false-positive: pipe flatMap callback may return Effect.gen',
        "import * as Effect from 'effect/Effect';\npipe(program, Effect.flatMap(() => Effect.gen(function* () { yield* task; })));\n",
        { branchIds: ['valid.pipe-flatmap-callback'] },
      ),
      scenario(
        'leaves local non-imported Effect-shaped helper alone',
        'const Effect = { gen: (value) => value };\nconst run = () => Effect.gen(function* () { yield* task; });\n',
        { branchIds: ['valid.local-effect-helper'] },
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
    invalid: [
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
    ],
  }),
  suite({
    ruleName: 'no-effect-escape-hatch',
    requiredBranchIds: ['invalid.escape-hatch', 'valid.test-file-carveout'],
    invalid: [
      scenario(
        'executor scenario: Effect.orDie escape hatch',
        "import * as Effect from 'effect/Effect';\nEffect.orDie(program);\n",
        { branchIds: ['invalid.escape-hatch'] },
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
    ruleName: 'no-return-in-callback',
    requiredBranchIds: [
      'invalid.function-expression-callback',
      'valid.arrow-callback-owned-by-arrow-rule',
      'valid.function-iife-owned-by-iife-rule',
    ],
    invalid: [
      scenario(
        'source branch: FunctionExpression callback return',
        "import * as Effect from 'effect/Effect';\nitems.map(function itemToId(item) { return item.id; });\n",
        {
          branchIds: ['invalid.function-expression-callback'],
        },
      ),
    ],
    valid: [
      scenario(
        'review false-positive: arrow callback return belongs to no-return-in-arrow',
        "import * as Effect from 'effect/Effect';\nitems.map((item) => { return item.id; });\n",
        {
          branchIds: ['valid.arrow-callback-owned-by-arrow-rule'],
        },
      ),
      scenario(
        'review false-positive: FunctionExpression callee is an IIFE, not a callback argument',
        "import * as Effect from 'effect/Effect';\n(function () { return value; })();\n",
        {
          branchIds: ['valid.function-iife-owned-by-iife-rule'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-manual-effect-channels',
    requiredBranchIds: [
      'invalid.effect-return-type',
      'invalid.layer-alias',
      'valid.effect-alias-owned-by-type-alias',
    ],
    invalid: [
      scenario(
        'reference branch: Effect.Effect return type reports manual channels',
        "import { Effect } from 'effect';\nfunction run(): Effect.Effect<number, Error, Env> { return program; }\n",
        { branchIds: ['invalid.effect-return-type'] },
      ),
      scenario(
        'review branch: Layer.Layer aliases stay owned by manual channel rule',
        "import { Layer } from 'effect';\ntype Live = Layer.Layer<Service, Error, Env>;\n",
        { branchIds: ['invalid.layer-alias'] },
      ),
    ],
    valid: [
      scenario(
        'duplicate-intent split: Effect.Effect alias is owned by no-effect-type-alias',
        "import { Effect } from 'effect';\ntype Program = Effect.Effect<number, Error, Env>;\n",
        { branchIds: ['valid.effect-alias-owned-by-type-alias'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-pipe-ladder',
    requiredBranchIds: [
      'invalid.nested-pipe-as-source-argument',
      'invalid.nested-pipe-as-step-argument',
      'invalid.nested-member-pipe-in-standalone-step',
      'invalid.nested-member-pipe-in-member-step',
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
        { branchIds: ['invalid.nested-pipe-as-step-argument'] },
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
    ],
    valid: [
      scenario(
        'flat standalone pipe remains valid',
        "import * as Effect from 'effect/Effect';\npipe(value, f);\n",
        { branchIds: ['valid.flat-pipe'] },
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
          branchIds: ['invalid.direct-struct-duplicate-type'],
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
      ),
    ],
  }),
  suite({
    ruleName: 'no-redundant-error-factory',
    requiredBranchIds: [
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
    ],
    valid: [
      scenario(
        'allows non-Effect files',
        'function makeDomainError(message) { return new DomainError(message); }\n',
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
    ruleName: 'no-call-tower',
    requiredBranchIds: [
      'invalid.direct-map-succeed',
      'invalid.try-promise-catch-all',
      'valid.callback-body-effect',
    ],
    invalid: [
      scenario(
        'direct nested Effect argument',
        "import * as Effect from 'effect/Effect';\nEffect.map(Effect.succeed(1), (n) => n);\n",
        {
          branchIds: ['invalid.direct-map-succeed'],
        },
      ),
      scenario(
        'source wildcard branch: any Effect member call nests tryPromise under catchAll',
        "import * as Effect from 'effect/Effect';\nEffect.catchAll(Effect.tryPromise(fetchUser), handle);\n",
        {
          branchIds: ['invalid.try-promise-catch-all'],
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
    ],
  }),
  suite({
    ruleName: 'no-effect-all-step-sequencing',
    requiredBranchIds: [
      'invalid.ref-set-concurrency-one',
      'invalid.pipe-as-void',
      'invalid.effect-log-step',
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
      'valid.callback-body-effect',
      'valid.effect-as-owned-by-no-effect-as',
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
        'ownership split: Effect.as owns its nested argument shape',
        "import * as Effect from 'effect/Effect';\nEffect.as(Effect.succeed(1), value);\n",
        {
          branchIds: ['valid.effect-as-owned-by-no-effect-as'],
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
      'valid.orelse-ladder-const-owned-by-specific',
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
        'Ownership regression: const orElse-ladder shape is owned by no-effect-orElse-ladder, not no-effect-ladder',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.orElse(Effect.flatMap(Effect.succeed(1), f), fallback);\n",
        {
          branchIds: ['valid.orelse-ladder-const-owned-by-specific'],
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
      'valid.expression-statement-flatmap',
      'valid.let-initializer-flatmap',
      'valid.var-initializer-flatten',
    ],
    invalid: [
      scenario(
        'source branch: const initializer with nested flatMap',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.flatMap(program, f), g);\n",
        {
          branchIds: ['invalid.const-flatmap-flatmap'],
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
    ],
    valid: [
      scenario(
        'source parity: expression statement flatMap ladder is outside source scope',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.flatMap(program, f), g);\n",
        {
          branchIds: ['valid.expression-statement-flatmap'],
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
    ruleName: 'no-inline-runtime-provide',
    requiredBranchIds: [
      'invalid.variable-initializer-yield-runtime-pipe-provide',
      'invalid.return-yield-runtime-pipe-provide',
      'valid.standalone-yield-runtime-pipe',
      'valid.ordinary-two-arg-provide',
      'valid.non-yield-runtime-pipe',
    ],
    invalid: [
      scenario(
        'source branch: generator variable initializer yields runtime pipe with single-argument provide step',
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { const live = yield* runtime.pipe(Effect.provide(Live)); return live; });\n",
        {
          branchIds: ['invalid.variable-initializer-yield-runtime-pipe-provide'],
        },
      ),
      scenario(
        'source branch: generator return argument yields runtime pipe with single-argument provide step',
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { return yield* runtime.pipe(Effect.provide(Live)); });\n",
        {
          branchIds: ['invalid.return-yield-runtime-pipe-provide'],
        },
      ),
    ],
    valid: [
      scenario(
        'source false-positive: standalone yield expression is not an inline runtime provide branch',
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* runtime.pipe(Effect.provide(Live)); });\n",
        {
          branchIds: ['valid.standalone-yield-runtime-pipe'],
        },
      ),
      scenario(
        'source exclusion: ordinary two-argument Effect.provide is not inline runtime provide',
        "import * as Effect from 'effect/Effect';\nEffect.provide(program, Live);\n",
        {
          branchIds: ['valid.ordinary-two-arg-provide'],
        },
      ),
      scenario(
        'source exclusion: non-yield runtime pipe is not generator inline provide',
        "import * as Effect from 'effect/Effect';\nruntime.pipe(Effect.provide(Live));\n",
        {
          branchIds: ['valid.non-yield-runtime-pipe'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-effect-succeed-variable',
    requiredBranchIds: [
      'invalid.identifier-value',
      'invalid.literal-value',
      'invalid.nullish-coalescing-value',
      'valid.object-expression',
      'valid.array-expression',
      'valid.call-expression',
      'valid.conditional-expression',
      'invalid.let-wrapper-unowned-by-wrapper-alias',
      'invalid.var-wrapper-unowned-by-wrapper-alias',
      'valid.const-wrapper-owned-by-wrapper-alias',
    ],
    invalid: [
      scenario(
        'source branch: Effect.succeed receives bare identifier',
        "import * as Effect from 'effect/Effect';\nEffect.succeed(value);\n",
        {
          branchIds: ['invalid.identifier-value'],
        },
      ),
      scenario(
        'source branch: Effect.succeed receives numeric literal',
        "import * as Effect from 'effect/Effect';\nEffect.succeed(1);\n",
        {
          branchIds: ['invalid.literal-value'],
        },
      ),
      scenario(
        'source branch: Effect.succeed receives nullish coalescing expression',
        "import * as Effect from 'effect/Effect';\nEffect.succeed(value ?? fallback);\n",
        {
          branchIds: ['invalid.nullish-coalescing-value'],
        },
      ),
      scenario(
        'ownership split: let wrapper is diagnosed by the inner succeed-variable rule',
        "import * as Effect from 'effect/Effect';\nlet run = () => Effect.succeed(value);\n",
        {
          branchIds: ['invalid.let-wrapper-unowned-by-wrapper-alias'],
        },
      ),
      scenario(
        'ownership split: var wrapper is diagnosed by the inner succeed-variable rule',
        "import * as Effect from 'effect/Effect';\nvar run = () => Effect.succeed(value);\n",
        {
          branchIds: ['invalid.var-wrapper-unowned-by-wrapper-alias'],
        },
      ),
    ],
    valid: [
      scenario(
        'source exclusion: object expression',
        "import * as Effect from 'effect/Effect';\nEffect.succeed({ value });\n",
        {
          branchIds: ['valid.object-expression'],
        },
      ),
      scenario(
        'source exclusion: array expression',
        "import * as Effect from 'effect/Effect';\nEffect.succeed([value]);\n",
        {
          branchIds: ['valid.array-expression'],
        },
      ),
      scenario(
        'source exclusion: call expression',
        "import * as Effect from 'effect/Effect';\nEffect.succeed(makeValue());\n",
        {
          branchIds: ['valid.call-expression'],
        },
      ),
      scenario(
        'source exclusion: conditional expression',
        "import * as Effect from 'effect/Effect';\nEffect.succeed(condition ? value : fallback);\n",
        {
          branchIds: ['valid.conditional-expression'],
        },
      ),
      scenario(
        'ownership split: string literals belong to no-string-sentinel-return',
        "import * as Effect from 'effect/Effect';\nEffect.succeed('ready');\n",
      ),
      scenario(
        'ownership split: const wrapper return is owned by no-effect-wrapper-alias',
        "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed(value);\n",
        {
          branchIds: ['valid.const-wrapper-owned-by-wrapper-alias'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-string-sentinel-return',
    requiredBranchIds: [
      'invalid.direct-string-sentinel',
      'invalid.let-wrapper-unowned-by-wrapper-alias',
      'invalid.var-wrapper-unowned-by-wrapper-alias',
      'valid.identifier-value',
      'valid.const-wrapper-owned-by-wrapper-alias',
    ],
    invalid: [
      scenario(
        'source branch: Effect.succeed receives a string sentinel literal',
        "import * as Effect from 'effect/Effect';\nEffect.succeed('ready');\n",
        {
          branchIds: ['invalid.direct-string-sentinel'],
        },
      ),
      scenario(
        'ownership split: let wrapper is diagnosed by the inner string-sentinel rule',
        "import * as Effect from 'effect/Effect';\nlet run = () => Effect.succeed('ready');\n",
        {
          branchIds: ['invalid.let-wrapper-unowned-by-wrapper-alias'],
        },
      ),
      scenario(
        'ownership split: var wrapper is diagnosed by the inner string-sentinel rule',
        "import * as Effect from 'effect/Effect';\nvar run = () => Effect.succeed('ready');\n",
        {
          branchIds: ['invalid.var-wrapper-unowned-by-wrapper-alias'],
        },
      ),
    ],
    valid: [
      scenario(
        'source exclusion: non-literal success values are not sentinel returns',
        "import * as Effect from 'effect/Effect';\nEffect.succeed(status);\n",
        {
          branchIds: ['valid.identifier-value'],
        },
      ),
      scenario(
        'ownership split: const wrapper return is owned by no-effect-wrapper-alias',
        "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed('ready');\n",
        {
          branchIds: ['valid.const-wrapper-owned-by-wrapper-alias'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-nested-effect-call',
    requiredBranchIds: [
      'invalid.direct-map-flatmap-succeed',
      'invalid.repeat-catchall-trypromise',
      'valid.callback-body-effect',
      'valid.second-arg-deep-not-nested',
    ],
    invalid: [
      scenario(
        'direct deeply nested Effect call',
        "import * as Effect from 'effect/Effect';\nEffect.map(Effect.flatMap(Effect.succeed(1), f), g);\n",
        {
          branchIds: ['invalid.direct-map-flatmap-succeed'],
        },
      ),
      scenario(
        'source wildcard branch: repeat wraps catchAll wraps tryPromise',
        "import * as Effect from 'effect/Effect';\nEffect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy);\n",
        {
          branchIds: ['invalid.repeat-catchall-trypromise'],
        },
      ),
    ],
    valid: [
      scenario(
        'callback body Effect call is not nested argument depth',
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(program, () => Effect.succeed(value));\n",
        {
          branchIds: ['valid.callback-body-effect'],
        },
      ),
      scenario(
        'Behavior regression: second-arg deep nesting not caught by first-arg ladder-depth helper',
        "import * as Effect from 'effect/Effect';\nEffect.map(program, Effect.flatMap(Effect.succeed(1), f));\n",
        {
          branchIds: ['valid.second-arg-deep-not-nested'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-render-side-effects',
    requiredBranchIds: [
      'invalid.expression-statement-match-value-pipe',
      'valid.assigned-match-value-pipe',
      'valid.standalone-match-when',
    ],
    invalid: [
      scenario(
        'source branch: expression statement Match.value pipe with branch',
        "import * as Match from 'effect/Match';\nMatch.value(kind).pipe(Match.when('a', () => sideEffect()));\n",
        {
          branchIds: ['invalid.expression-statement-match-value-pipe'],
        },
      ),
    ],
    valid: [
      scenario(
        'source exclusion: assigned Match.value pipe is not render side-effect statement',
        "import * as Match from 'effect/Match';\nconst value = Match.value(kind).pipe(Match.when('a', () => 'a'));\n",
        {
          branchIds: ['valid.assigned-match-value-pipe'],
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
    requiredBranchIds: ['invalid.generic-tag-in-check', 'valid.option-tag-owned-by-internal-tags'],
    invalid: [
      scenario(
        'executor branch: generic manual _tag presence check',
        "import * as Effect from 'effect/Effect';\nif ('_tag' in error) handle(error);\n",
        {
          branchIds: ['invalid.generic-tag-in-check'],
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
        { branchIds: ['invalid.direct-option-match'] },
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
    ruleName: 'no-effect-type-alias',
    requiredBranchIds: [
      'invalid.type-alias-effect-reference',
      'valid.function-return-type',
      'valid.interface-method-return-type',
      'valid.parameter-annotation',
    ],
    invalid: [
      scenario(
        'source branch: Effect.Effect reference inside type alias',
        "import { Effect } from 'effect';\ntype Program = Effect.Effect<number>;\n",
        {
          branchIds: ['invalid.type-alias-effect-reference'],
        },
      ),
    ],
    valid: [
      scenario(
        'review false-positive: function return type is not a type alias',
        "import { Effect } from 'effect';\nfunction run(): Effect.Effect<number> { return program; }\n",
        {
          branchIds: ['valid.function-return-type'],
        },
      ),
      scenario(
        'review false-positive: interface method return type is not a type alias',
        "import { Effect } from 'effect';\ninterface Service { run(): Effect.Effect<number>; }\n",
        {
          branchIds: ['valid.interface-method-return-type'],
        },
      ),
      scenario(
        'review false-positive: parameter annotation is not a type alias',
        "import { Effect } from 'effect';\nfunction run(program: Effect.Effect<number>) { return program; }\n",
        {
          branchIds: ['valid.parameter-annotation'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-match-void-branch',
    requiredBranchIds: [
      'invalid.when-true-effect-void',
      'invalid.when-false-effect-void',
      'invalid.orelse-effect-void',
      'valid.string-tag-effect-void',
    ],
    invalid: [
      scenario(
        'source branch: boolean true Match.when returns Effect.void',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when(true, () => Effect.void));\n",
        {
          branchIds: ['invalid.when-true-effect-void'],
        },
      ),
      scenario(
        'source branch: boolean false Match.when returns Effect.void',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when(false, () => Effect.void));\n",
        {
          branchIds: ['invalid.when-false-effect-void'],
        },
      ),
      scenario(
        'source branch: Match.orElse returns Effect.void',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.orElse(() => Effect.void));\n",
        {
          branchIds: ['invalid.orelse-effect-void'],
        },
      ),
    ],
    valid: [
      scenario(
        'review false-positive: string tag branch may return Effect.void',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when('not-found', () => Effect.void));\n",
        {
          branchIds: ['valid.string-tag-effect-void'],
        },
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
    ],
    valid: [
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
    ruleName: 'no-effect-wrapper-alias',
    requiredBranchIds: [
      'invalid.pipe-wrapper-source',
      'invalid.pipe-wrapper-decorated-source',
      'invalid.variable-arrow-effect-succeed',
      'invalid.variable-arrow-effect-sync',
      'invalid.function-declaration-effect-return',
      'valid.pipe-existing-program',
      'valid.member-pipe-alias-not-covered',
      'valid.function-expression-not-source-covered',
      'valid.block-bodied-arrow-not-source-covered',
      'valid.let-wrapper-source-exclusion',
      'valid.var-wrapper-source-exclusion',
    ],
    invalid: [
      scenario(
        'source branch: pipe starts from Effect wrapper constructor',
        "import * as Effect from 'effect/Effect';\nconst wrapper = pipe(Effect.succeed(1), Effect.map(f));\n",
        { branchIds: ['invalid.pipe-wrapper-source'] },
      ),
      scenario(
        'Ownership regression: pipe source contains a descendant Effect call',
        "import * as Effect from 'effect/Effect';\nconst run = pipe(decorate(Effect.succeed(1)), Effect.map(f));\n",
        { branchIds: ['invalid.pipe-wrapper-decorated-source'] },
      ),
      scenario(
        'source branch: variable arrow returns Effect.succeed',
        "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed(value);\n",
        { branchIds: ['invalid.variable-arrow-effect-succeed'] },
      ),
      scenario(
        'source branch: variable arrow returns Effect.sync',
        "import * as Effect from 'effect/Effect';\nconst run = (value) => Effect.sync(() => value);\n",
        { branchIds: ['invalid.variable-arrow-effect-sync'] },
      ),
      scenario(
        'source branch: function declaration returns Effect wrapper',
        "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.sync(task); }\n",
        { branchIds: ['invalid.function-declaration-effect-return'] },
      ),
    ],
    valid: [
      scenario(
        'review false-positive: mapping an existing program is not aliasing a wrapper',
        "import * as Effect from 'effect/Effect';\nconst mapped = pipe(program, Effect.map(f));\n",
        { branchIds: ['valid.pipe-existing-program'] },
      ),
      scenario(
        'Behavior regression: member .pipe(...) alias is not source-covered by no-effect-wrapper-alias',
        "import * as Effect from 'effect/Effect';\nconst run = decorate(Effect.succeed(1)).pipe(Effect.map(f));\n",
        { branchIds: ['valid.member-pipe-alias-not-covered'] },
      ),
      scenario(
        'Behavior regression: const function-expression wrapper is not source-covered (arrow and declaration only)',
        "import * as Effect from 'effect/Effect';\nconst run = function () { return Effect.succeed(value); };\n",
        { branchIds: ['valid.function-expression-not-source-covered'] },
      ),
      scenario(
        'Source parity: block-bodied const arrow is not source-covered (expression-bodied only)',
        "import * as Effect from 'effect/Effect';\nconst run = () => { return Effect.succeed(value); };\n",
        { branchIds: ['valid.block-bodied-arrow-not-source-covered'] },
      ),
      scenario(
        'source exclusion: let wrapper aliases are not reported',
        "import * as Effect from 'effect/Effect';\nlet run = () => Effect.succeed(value);\n",
        { branchIds: ['valid.let-wrapper-source-exclusion'] },
      ),
      scenario(
        'source exclusion: var wrapper aliases are not reported',
        "import * as Effect from 'effect/Effect';\nvar run = () => Effect.succeed(value);\n",
        { branchIds: ['valid.var-wrapper-source-exclusion'] },
      ),
      scenario(
        'allows block wrapper that returns a named program',
        "import * as Effect from 'effect/Effect';\nconst run = () => { const program = Effect.succeed(value); return program; };\n",
      ),
    ],
  }),
  suite({
    ruleName: 'warn-effect-sync-wrapper',
    requiredBranchIds: [
      'invalid.non-console-wrapper',
      'valid.block-bodied-return-excluded',
      'valid.console-warn-exempt',
      'valid.console-debug-exempt',
    ],
    invalid: [
      scenario(
        'source branch: Effect.sync returns a non-console side-effect wrapper',
        "import * as Effect from 'effect/Effect';\nEffect.sync(() => setState(value));\n",
        { branchIds: ['invalid.non-console-wrapper'] },
      ),
    ],
    valid: [
      scenario(
        'Behavior regression: block-bodied return is outside source shape; expression-bodied only',
        "import * as Effect from 'effect/Effect';\nEffect.sync(() => { return setState(value); });\n",
        { branchIds: ['valid.block-bodied-return-excluded'] },
      ),
      scenario(
        'review false-positive: console.warn remains owned by console-specific rule',
        "import * as Effect from 'effect/Effect';\nEffect.sync(() => console.warn('x'));\n",
        { branchIds: ['valid.console-warn-exempt'] },
      ),
      scenario(
        'review false-positive: console.debug remains owned by console-specific rule',
        "import * as Effect from 'effect/Effect';\nEffect.sync(() => console.debug('x'));\n",
        { branchIds: ['valid.console-debug-exempt'] },
      ),
    ],
  }),
  suite({
    ruleName: 'no-wrapgraphql-catchall',
    requiredBranchIds: [
      'invalid.member-pipe-wrap-graphql-target',
      'invalid.standalone-pipe-wrap-graphql-target',
      'invalid.flatmap-apply-response-step',
      'invalid.standalone-pipe-flatmap-apply-response-step',
      'invalid.nested-target-wrap-graphql-step',
      'invalid.nested-target-flatmap-apply-response-step',
      'valid.catchall-handler-mentions-apply-response',
      'valid.direct-catchall-handler-mentions-apply-response',
    ],
    invalid: [
      scenario(
        'source branch: member pipe target is wrapGraphqlCall',
        "import * as Effect from 'effect/Effect';\nwrapGraphqlCall(request).pipe(Effect.catchAll(handle));\n",
        {
          branchIds: ['invalid.member-pipe-wrap-graphql-target'],
        },
      ),
      scenario(
        'source branch: standalone pipe target is wrapGraphqlCall',
        "import * as Effect from 'effect/Effect';\npipe(wrapGraphqlCall(request), Effect.catchAll(handle));\n",
        {
          branchIds: ['invalid.standalone-pipe-wrap-graphql-target'],
        },
      ),
      scenario(
        'source branch: pipeline step flatMaps applyResponse before catchAll',
        "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.flatMap(applyResponse), Effect.catchAll(handle));\n",
        {
          branchIds: ['invalid.flatmap-apply-response-step'],
        },
      ),
      scenario(
        'source branch: standalone pipe step flatMaps applyResponse before catchAll',
        "import * as Effect from 'effect/Effect';\npipe(program, Effect.flatMap(applyResponse), Effect.catchAll(handle));\n",
        {
          branchIds: ['invalid.standalone-pipe-flatmap-apply-response-step'],
        },
      ),
      scenario(
        'source branch: nested target member pipe contains wrapGraphqlCall before catchAll',
        "import * as Effect from 'effect/Effect';\nprogram.pipe(wrapGraphqlCall(request)).pipe(Effect.catchAll(handle));\n",
        {
          branchIds: ['invalid.nested-target-wrap-graphql-step'],
        },
      ),
      scenario(
        'source branch: nested target standalone pipe contains applyResponse before catchAll',
        "import * as Effect from 'effect/Effect';\npipe(pipe(program, Effect.flatMap(applyResponse)), Effect.catchAll(handle));\n",
        {
          branchIds: ['invalid.nested-target-flatmap-apply-response-step'],
        },
      ),
    ],
    valid: [
      scenario(
        'review false-positive: catchAll handler may call applyResponse',
        "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.catchAll((error) => applyResponse(error)));\n",
        {
          branchIds: ['valid.catchall-handler-mentions-apply-response'],
        },
      ),
      scenario(
        'review false-positive: direct catchAll handler may mention applyResponse outside a source pipeline',
        "import * as Effect from 'effect/Effect';\nEffect.catchAll(program, (error) => applyResponse(error));\n",
        {
          branchIds: ['valid.direct-catchall-handler-mentions-apply-response'],
        },
      ),
    ],
  }),
  suite({
    ruleName: 'no-promise-catch',
    requiredBranchIds: [
      'invalid.promise-catch',
      'valid.effect-catch-namespace',
      'valid.effect-catch-alias',
    ],
    invalid: [
      scenario(
        'executor branch: promise catch in Effect file',
        "import * as Effect from 'effect/Effect';\npromise.catch(handle);\n",
        { branchIds: ['invalid.promise-catch'] },
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
        'no-branch-in-object',
        "import * as Option from 'effect/Option';\nconst value = { ready: Option.match(input, { onSome: () => true, onNone: () => false }) };\n",
        'const value = { ready: condition ? true : false };\n',
      ],
      [
        'no-effect-async',
        "import * as Effect from 'effect/Effect';\nEffect.async((resume) => resume(Effect.succeed(1)));\n",
        'const Effect = { async: () => null };\nEffect.async();\n',
      ],
      [
        'no-effect-bind',
        "import * as Effect from 'effect/Effect';\nEffect.bind('user', loadUser);\n",
        "import * as Effect from 'effect/Effect';\nEffect.map(program, f);\n",
      ],
      [
        'no-effect-do',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.Do;\n",
        'const Effect = { Do: {} };\nconst program = Effect.Do;\n',
      ],
      [
        'no-effect-never',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.never;\n",
        'const Effect = { never: {} };\nconst program = Effect.never;\n',
      ],
      [
        'no-effect-orElse-ladder',
        "import * as Effect from 'effect/Effect';\nEffect.orElse(Effect.flatMap(program, f), fallback);\n",
        "import * as Effect from 'effect/Effect';\nEffect.orElse(program, fallback);\n",
      ],
      [
        'no-effect-succeed-variable',
        "import * as Effect from 'effect/Effect';\nEffect.succeed(value);\n",
        "import * as Effect from 'effect/Effect';\nEffect.succeed({ value });\n",
      ],
      [
        'no-effect-sync-console',
        "import * as Effect from 'effect/Effect';\nEffect.sync(() => console.log('x'));\n",
        "import * as Effect from 'effect/Effect';\nEffect.sync(() => setState(value));\n",
      ],
      [
        'no-effect-type-alias',
        "import { Effect } from 'effect';\ntype Program = Effect.Effect<number>;\n",
        'type Program = Promise<number>;\n',
      ],
      [
        'no-effect-wrapper-alias',
        "import * as Effect from 'effect/Effect';\nconst wrapper = pipe(Effect.succeed(1), Effect.map(f));\n",
        "import * as Effect from 'effect/Effect';\nconst mapped = pipe(program, Effect.map(f));\n",
      ],
      [
        'no-flatmap-ladder',
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.flatMap(program, f), g);\n",
        "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.flatMap(program, f), g);\n",
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
        'no-inline-runtime-provide',
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { const live = yield* runtime.pipe(Effect.provide(Live)); return live; });\n",
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* runtime.pipe(Effect.provide(Live)); });\n",
      ],
      [
        'no-manual-effect-channels',
        "import { Effect } from 'effect';\nfunction run(): Effect.Effect<number, Error, Env> { return program; }\n",
        "import { Effect } from 'effect';\ntype Program = Effect.Effect<number, Error, Env>;\n",
      ],
      [
        'no-match-void-branch',
        "import * as Match from 'effect/Match';\nimport * as Effect from 'effect/Effect';\nMatch.value(kind).pipe(Match.when(true, () => Effect.void));\n",
        "import * as Match from 'effect/Match';\nMatch.value(kind).pipe(Match.when(true, () => undefined));\n",
      ],
      [
        'no-nested-effect-gen',
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* Effect.gen(function* () { yield* task; }); });\n",
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* task; });\n",
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
        'no-pipe-ladder',
        "import * as Effect from 'effect/Effect';\npipe(value, pipe(other, f));\n",
        "import * as Effect from 'effect/Effect';\npipe(value, f);\n",
      ],
      ['no-react-state', 'const [value] = useState(0);\n', 'const [value] = useAtom(atom);\n'],
      [
        'no-render-side-effects',
        "import * as Match from 'effect/Match';\nMatch.value(kind).pipe(Match.when('a', () => sideEffect()));\n",
        "import * as Match from 'effect/Match';\nconst value = Match.value(kind).pipe(Match.when('a', () => 'a'));\n",
      ],
      [
        'no-return-in-callback',
        "import * as Effect from 'effect/Effect';\nitems.map(function itemToId(item) { return item.id; });\n",
        'items.map(function itemToId(item) { return item.id; });\n',
      ],
      [
        'no-return-null',
        "import * as Effect from 'effect/Effect';\nfunction value() { return null; }\n",
        'function value() { return null; }\n',
      ],
      [
        'no-runtime-runfork',
        "import * as Runtime from 'effect/Runtime';\nRuntime.runFork(runtime, program);\n",
        'const Runtime = { runFork: () => null };\nRuntime.runFork(runtime, program);\n',
      ],
      [
        'no-string-sentinel-const',
        "import * as Effect from 'effect/Effect';\nconst status = 'ready';\n",
        "import * as Effect from 'effect/Effect';\nlet status = 'ready';\n",
      ],
      [
        'no-string-sentinel-return',
        "import * as Effect from 'effect/Effect';\nEffect.succeed('ready');\n",
        "import * as Effect from 'effect/Effect';\nEffect.succeed(status);\n",
      ],
      [
        'no-try-catch',
        "import * as Effect from 'effect/Effect';\ntry { run(); } catch (error) { handle(error); }\n",
        "import * as Effect from 'effect/Effect';\ntry { run(); } finally { cleanup(); }\n",
      ],
      [
        'no-wrapgraphql-catchall',
        "import * as Effect from 'effect/Effect';\nwrapGraphqlCall(request).pipe(Effect.catchAll(handle));\n",
        "import * as Effect from 'effect/Effect';\nprogram.pipe(Effect.catchAll(handle));\n",
      ],
      [
        'warn-effect-sync-wrapper',
        "import * as Effect from 'effect/Effect';\nEffect.sync(() => setState(value));\n",
        "import * as Effect from 'effect/Effect';\nEffect.sync(() => console.log('x'));\n",
      ],
      [
        'no-json-parse',
        "import * as Effect from 'effect/Effect';\nJSON.parse(payload);\n",
        'JSON.parse(payload);\n',
      ],
      [
        'prefer-schema-inferred-types',
        "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Struct({ id: Schema.String });\ntype User = { id: string };\n",
        "import * as Schema from 'effect/Schema';\nconst UserSchema = Schema.Struct({ id: Schema.String });\ntype Account = { id: string };\n",
      ],
      [
        'no-promise-catch',
        "import * as Effect from 'effect/Effect';\npromise.catch(handle);\n",
        'promise.catch(handle);\n',
      ],
      [
        'no-instanceof-error',
        "import * as Effect from 'effect/Effect';\nif (error instanceof Error) throw error;\n",
        'if (error instanceof Error) throw error;\n',
      ],
      [
        'no-instanceof-tagged-error',
        "import * as Effect from 'effect/Effect';\nif (error instanceof DomainError) throw error;\n",
        'if (error instanceof DomainError) throw error;\n',
      ],
      [
        'no-manual-tag-check',
        "import * as Effect from 'effect/Effect';\nif ('_tag' in error) handle(error);\n",
        "if ('_tag' in error) handle(error);\n",
      ],
      [
        'prefer-yield-tagged-error',
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* Effect.fail(new DomainError()); });\n",
        "import * as Effect from 'effect/Effect';\nEffect.gen(function* () { yield* new DomainError(); });\n",
      ],
      [
        'no-redundant-error-factory',
        "import * as Effect from 'effect/Effect';\nfunction makeDomainError(message: string) { return new DomainError(message); }\n",
        'function makeDomainError(message: string) { return new DomainError(message); }\n',
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
      return;
    }

    ensureSuccess(result, `${fixtureCase.name}\n${commandOutput(result)}`);
  } finally {
    removeTempDir(tempDir);
  }
};

// Converts presetEntriesForDomains entries to the RuleConfig format expected by the fixture runner.
// Rule names (entry.name) are used directly without plugin prefixes; the runner resolves plugin context.
const presetRuleConfigForDomains = (domains: ReadonlyArray<RuleDomain>): RuleConfig =>
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

const runPresetNestedDuplicateIntentReplay = (): void => {
  const rules = effectPresetRuleConfig();
  const tempDir = createTempDir('backpressure-preset-nested-intent-');

  try {
    const shallowResult = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules,
      source: "import * as Effect from 'effect/Effect';\nEffect.flatMap(Effect.sync(task), f);\n",
      sourceFileName: 'shallow.ts',
    });
    const shallowLabel = 'preset duplicate-intent ownership: shallow nested Effect call';
    ensureFailure(shallowResult, shallowLabel);
    assertDiagnosticCount(shallowResult, {
      count: 1,
      label: shallowLabel,
      ruleName: 'no-effect-call-in-effect-arg',
    });
    assertDiagnosticCount(shallowResult, {
      count: 0,
      label: shallowLabel,
      ruleName: 'no-call-tower',
    });
    assertDiagnosticCount(shallowResult, {
      count: 0,
      label: shallowLabel,
      ruleName: 'no-effect-ladder',
    });

    const deepResult = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules,
      source:
        "import * as Effect from 'effect/Effect';\nconst program = Effect.flatMap(Effect.map(Effect.sync(task), f), g);\n",
      sourceFileName: 'deep.ts',
    });
    const deepLabel = 'preset duplicate-intent ownership: deep nested Effect call';
    ensureFailure(deepResult, deepLabel);
    assertDiagnosticCount(deepResult, { count: 1, label: deepLabel, ruleName: 'no-effect-ladder' });
    assertDiagnosticCount(deepResult, {
      count: 0,
      label: deepLabel,
      ruleName: 'no-effect-call-in-effect-arg',
    });
    assertDiagnosticCount(deepResult, {
      count: 0,
      label: deepLabel,
      ruleName: 'no-nested-effect-call',
    });
  } finally {
    removeTempDir(tempDir);
  }
};

interface PresetOwnershipCase {
  readonly label: string;
  readonly nonOwners: ReadonlyArray<string>;
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

const overlapBaseOwnershipCases = (): ReadonlyArray<PresetOwnershipCase> => [
  {
    label: 'preset duplicate-intent ownership: arrow ladder',
    nonOwners: ['no-iife-wrapper'],
    owner: 'no-arrow-ladder',
    source: "import * as Effect from 'effect/Effect';\n((x) => ((y) => y)(x))(value);\n",
    sourceFileName: 'arrow-ladder.ts',
  },
  {
    label: 'preset duplicate-intent ownership: function IIFE',
    nonOwners: ['no-return-in-callback'],
    owner: 'no-iife-wrapper',
    source: "import * as Effect from 'effect/Effect';\n(function () { return value; })();\n",
    sourceFileName: 'function-iife.ts',
  },
  {
    label: 'preset duplicate-intent ownership: wrapper alias',
    nonOwners: ['no-effect-succeed-variable'],
    owner: 'no-effect-wrapper-alias',
    source: "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed(value);\n",
    sourceFileName: 'wrapper-alias.ts',
  },
  {
    label: 'preset duplicate-intent ownership: function wrapper alias',
    nonOwners: ['no-effect-succeed-variable'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.succeed(value); }\n",
    sourceFileName: 'function-wrapper-alias.ts',
  },
  {
    label: 'preset duplicate-intent ownership: string wrapper alias',
    nonOwners: ['no-effect-succeed-variable', 'no-string-sentinel-return'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = () => Effect.succeed('ready');\n",
    sourceFileName: 'string-wrapper-alias.ts',
  },
  {
    label: 'preset duplicate-intent ownership: deep ladder wrapper alias',
    nonOwners: ['no-effect-ladder', 'no-effect-call-in-effect-arg', 'no-nested-effect-call'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.repeat(Effect.catchAll(Effect.tryPromise(fetchUser), handle), policy); }\n",
    sourceFileName: 'deep-ladder-wrapper-alias.ts',
  },
  {
    label: 'preset duplicate-intent ownership: mapped wrapper alias',
    nonOwners: ['no-effect-call-in-effect-arg', 'no-call-tower'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.map(Effect.succeed(1), f); }\n",
    sourceFileName: 'mapped-wrapper-alias.ts',
  },
  {
    label: 'preset duplicate-intent ownership: orElse wrapper alias',
    nonOwners: ['no-effect-orElse-ladder', 'no-effect-call-in-effect-arg'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.orElse(Effect.flatMap(program, f), fallback); }\n",
    sourceFileName: 'orelse-wrapper-alias.ts',
  },
];

const overlapLadderOwnershipCases = (): ReadonlyArray<PresetOwnershipCase> => [
  {
    label: 'preset duplicate-intent ownership: side-effect wrapper alias',
    nonOwners: ['no-effect-side-effect-wrapper', 'no-effect-call-in-effect-arg'],
    owner: 'no-effect-wrapper-alias',
    source:
      'import * as Effect from \'effect/Effect\';\nconst run = () => Effect.zipRight(Effect.logInfo("x"), next);\n',
    sourceFileName: 'side-effect-wrapper-alias.ts',
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

const overlapSideEffectOwnershipCases = (): ReadonlyArray<PresetOwnershipCase> => [
  {
    label: 'preset duplicate-intent ownership: Effect.as side-effect wrapper',
    nonOwners: ['no-effect-as'],
    owner: 'no-effect-side-effect-wrapper',
    source: "import * as Effect from 'effect/Effect';\nEffect.as(setState(value), undefined);\n",
    sourceFileName: 'side-effect-as.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.as Atom.set side-effect wrapper',
    nonOwners: ['no-effect-as'],
    owner: 'no-effect-side-effect-wrapper',
    source:
      "import * as Effect from 'effect/Effect';\nimport { Atom } from '@effect-atom/atom-react';\nEffect.as(Atom.set(atom, value), undefined);\n",
    sourceFileName: 'atom-side-effect-as.ts',
  },
  {
    label: 'preset duplicate-intent ownership: Effect.as nested Effect argument',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-as',
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
    label: 'preset duplicate-intent ownership: Effect.succeed string sentinel',
    nonOwners: ['no-effect-succeed-variable'],
    owner: 'no-string-sentinel-return',
    source: "import * as Effect from 'effect/Effect';\nEffect.succeed('ready');\n",
    sourceFileName: 'string-succeed.ts',
  },
  {
    label: 'preset duplicate-intent ownership: orElse ladder',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-orElse-ladder',
    source:
      "import * as Effect from 'effect/Effect';\nEffect.orElse(Effect.flatMap(program, f), fallback);\n",
    sourceFileName: 'orelse-ladder.ts',
  },
];

const overlapWrapperAliasNestedCases = (): ReadonlyArray<PresetOwnershipCase> => [
  // Ownership regression: single-callee rules own deep-arg const forms; no-effect-ladder must not double-report.
  {
    label: 'preset duplicate-intent ownership: Effect.as deep arg const',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-as',
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
  // Regression coverage: wrapper-alias owns nested Effect calls inside owned expression; inner rules must not fire.
  {
    label: 'preset duplicate-intent ownership: wrapper-alias nested Effect.succeed',
    nonOwners: ['no-effect-succeed-variable'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = () => Effect.map(Effect.succeed(value), f);\n",
    sourceFileName: 'wrapper-nested-succeed.ts',
  },
  {
    label: 'preset duplicate-intent ownership: wrapper-alias nested string sentinel',
    nonOwners: ['no-string-sentinel-return'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = () => Effect.map(Effect.succeed('ready'), f);\n",
    sourceFileName: 'wrapper-nested-sentinel.ts',
  },
  {
    label: 'preset duplicate-intent ownership: wrapper-alias nested Effect.as',
    nonOwners: ['no-effect-as'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = () => Effect.map(Effect.as(value), f);\n",
    sourceFileName: 'wrapper-nested-as.ts',
  },
  // Ownership regression: standalone pipe wrapper alias also owns nested calls inside.
  {
    label: 'preset duplicate-intent ownership: pipe-alias nested Effect.succeed',
    nonOwners: ['no-effect-succeed-variable'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.succeed(value), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-nested-succeed.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias nested string sentinel',
    nonOwners: ['no-string-sentinel-return'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.succeed('ready'), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-nested-sentinel.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias nested Effect.as',
    nonOwners: ['no-effect-as'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.as(value), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-nested-as.ts',
  },
];

const overlapPipeAliasNestedCases = (): ReadonlyArray<PresetOwnershipCase> => [
  // Ownership regression: broader inner-rule suppression inside pipe wrapper alias.
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.bind source',
    nonOwners: ['no-effect-bind'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.bind('user', loadUser), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-bind.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias nested Effect.map(Effect.succeed)',
    nonOwners: ['no-effect-call-in-effect-arg'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.map(Effect.succeed(1), f), Effect.map(g));\n",
    sourceFileName: 'pipe-alias-map-succeed.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.zipRight side-effect',
    nonOwners: ['no-effect-side-effect-wrapper'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.zipRight(Effect.logInfo('x'), next), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-zipright.ts',
  },
  // Ownership regression: broader pipe-alias inner-rule suppression.
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.async',
    nonOwners: ['no-effect-async'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.async(register), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-async.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias Effect.all step-sequencing',
    nonOwners: ['no-effect-all-step-sequencing'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nimport * as Ref from 'effect/Ref';\nconst run = pipe(Effect.all([Ref.set(ref, value)], { concurrency: 1 }), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-all-step.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias warn-effect-sync-wrapper',
    nonOwners: ['warn-effect-sync-wrapper'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.sync(() => setState(value)), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-sync-wrapper.ts',
  },
  {
    label: 'preset duplicate-intent ownership: pipe-alias no-effect-escape-hatch',
    nonOwners: ['no-effect-escape-hatch'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(Effect.orDie(program), Effect.map(f));\n",
    sourceFileName: 'pipe-alias-escape-hatch.ts',
  },
];

const overlapConstFormCases = (): ReadonlyArray<PresetOwnershipCase> => [
  // Ownership regression: specific ladder and side-effect-wrapper rules own const forms; no-effect-ladder must not double-report.
  {
    label: 'preset duplicate-intent ownership: const orElse-ladder',
    nonOwners: ['no-effect-ladder'],
    owner: 'no-effect-orElse-ladder',
    source:
      "import * as Effect from 'effect/Effect';\nconst program = Effect.orElse(Effect.flatMap(Effect.succeed(1), f), fallback);\n",
    sourceFileName: 'const-orelse-ladder.ts',
  },
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

const overlapGenWrapperCases = (): ReadonlyArray<PresetOwnershipCase> => [
  // Ownership split: direct Effect.gen wrapper functions are owned by prefer-effect-fn, not no-effect-wrapper-alias.
  {
    label: 'preset duplicate-intent ownership: const arrow Effect.gen wrapper',
    nonOwners: ['no-effect-wrapper-alias'],
    owner: 'prefer-effect-fn',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = () => Effect.gen(function* () { yield* task; });\n",
    sourceFileName: 'arrow-gen-wrapper.ts',
  },
  // Ownership regression: const pipe wrapper aliases are owned by no-effect-wrapper-alias; no-pipe-ladder/effect-no-multiple-provide are nonOwners.
  {
    label: 'preset duplicate-intent ownership: const pipe ladder wrapper',
    nonOwners: ['no-pipe-ladder'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nconst run = pipe(pipe(Effect.succeed(1), f), g);\n",
    sourceFileName: 'const-pipe-ladder-wrapper.ts',
  },
  {
    label: 'preset duplicate-intent ownership: const pipe multi-provide wrapper',
    nonOwners: ['effect-no-multiple-provide', 'no-pipe-ladder'],
    owner: 'no-effect-wrapper-alias',
    source:
      "import * as Effect from 'effect/Effect';\nimport { pipe } from 'effect/Function';\nconst run = pipe(pipe(effect, Effect.provide(A)), Effect.provide(B));\n",
    sourceFileName: 'const-pipe-multi-provide-wrapper.ts',
  },
  {
    label: 'preset duplicate-intent ownership: function declaration Effect.gen wrapper',
    nonOwners: ['no-effect-wrapper-alias'],
    owner: 'prefer-effect-fn',
    source:
      "import * as Effect from 'effect/Effect';\nfunction run() { return Effect.gen(function* () { yield* task; }); }\n",
    sourceFileName: 'fn-decl-gen-wrapper.ts',
  },
];

const runPresetOverlapDuplicateIntentReplay = (): void => {
  const rules = effectPresetRuleConfig();
  const tempDir = createTempDir('backpressure-preset-overlap-intent-');
  const cases: ReadonlyArray<PresetOwnershipCase> = [
    ...overlapBaseOwnershipCases(),
    ...overlapLadderOwnershipCases(),
    ...overlapSideEffectOwnershipCases(),
    ...overlapWrapperAliasNestedCases(),
    ...overlapPipeAliasNestedCases(),
    ...overlapConstFormCases(),
    ...overlapGenWrapperCases(),
  ];
  try {
    for (const ownershipCase of cases) {
      assertPresetOwnership(tempDir, rules, ownershipCase);
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
    assertDiagnosticCount(composedResult, {
      count: 0,
      label: composedLabel,
      ruleName: 'no-naked-object-state-update',
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
      `effect-react standalone JSON.parse is not an object-state update\n${commandOutput(effectReactOnlyResult)}`,
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

const runMultipleProvideCountReplay = (): void => {
  const tempDir = createTempDir('backpressure-multiple-provide-count-');

  try {
    const result = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: { 'effect-no-multiple-provide': 'error' },
      source:
        "import * as Effect from 'effect/Effect';\neffect.pipe(Effect.provide(A), Effect.provide(B)).pipe(Effect.provide(C));\n",
      sourceFileName: 'three-provides-chain.ts',
    });
    const label = 'Behavior regression: three provides in inner+outer chain report exactly once';
    ensureFailure(result, label);
    assertDiagnosticCount(result, { count: 1, label, ruleName: 'effect-no-multiple-provide' });

    const nestedResult = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: { 'effect-no-multiple-provide': 'error' },
      source:
        "import * as Effect from 'effect/Effect';\nimport { pipe } from 'effect/Function';\npipe(pipe(effect, Effect.provide(A)), Effect.provide(B));\n",
      sourceFileName: 'nested-standalone-pipe.ts',
    });
    const nestedLabel =
      'Behavior regression: nested standalone pipe(pipe(...)) reports exactly once';
    ensureFailure(nestedResult, nestedLabel);
    assertDiagnosticCount(nestedResult, {
      count: 1,
      label: nestedLabel,
      ruleName: 'effect-no-multiple-provide',
    });
  } finally {
    removeTempDir(tempDir);
  }
};

const runTypeAliasChannelDuplicateIntentReplay = (): void => {
  const tempDir = createTempDir('backpressure-type-channel-intent-');

  try {
    const result = runOxlintOnSource({
      cwd: tempDir,
      pluginSpecifier: distPluginPath,
      rules: { 'no-effect-type-alias': 'error', 'no-manual-effect-channels': 'error' },
      source:
        "import { Effect } from 'effect';\ntype Program = Effect.Effect<number, Error, Env>;\n",
    });
    const label = 'preset duplicate-intent ownership: Effect.Effect type alias';
    ensureFailure(result, label);
    assertDiagnosticCount(result, { count: 1, label, ruleName: 'no-effect-type-alias' });
    assertDiagnosticCount(result, { count: 0, label, ruleName: 'no-manual-effect-channels' });
  } finally {
    removeTempDir(tempDir);
  }
};

export const runFixtureReplay = (): void => {
  buildOxlintStandards();

  let replayCaseCount = 0;
  runPresetDuplicateIntentReplay();
  runPresetNestedDuplicateIntentReplay();
  runPresetOverlapDuplicateIntentReplay();
  runComposedPresetDuplicateIntentReplay();
  runMultipleProvideCountReplay();
  runTypeAliasChannelDuplicateIntentReplay();

  for (const replaySuite of replaySuites) {
    for (const fixtureCase of replaySuite.valid) {
      replayCaseCount += 1;
      runReplayCase(replaySuite, fixtureCase, false);
    }

    for (const fixtureCase of replaySuite.invalid) {
      replayCaseCount += 1;
      runReplayCase(replaySuite, fixtureCase, true);
    }
  }

  printLine(`fixture replay passed: ${replaySuites.length} suites, ${replayCaseCount} cases`);
};

const [, entrypointPath] = process.argv;
if (typeof entrypointPath === 'string' && import.meta.url === pathToFileURL(entrypointPath).href) {
  runFixtureReplay();
}
