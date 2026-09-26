// One written message per implemented custom rule: why the shape is a problem, the concrete fix,
// and the reference or house policy behind it. A `{{name}}` placeholder is filled per report.
// Keep each rendered diagnostic line, `x @mplibunao/oxlint-standards(<rule>): <message>`, within
// `maxDiagnosticLineLength`: oxlint's non-terminal reporter wraps longer lines.
export const maxDiagnosticLineLength = 370;

const explicitRuleMessages = new Map<string, string>([
  [
    'no-arrow-ladder',
    'Rule: no-arrow-ladder. Why: nested immediately invoked functions hide sequencing and invite wrapper hacks. Fix: bind intermediate values with const and keep one flat pipeline or Effect.gen. Ref: linteffect.',
  ],
  [
    'no-atom-registry-effect-sync',
    'Rule: no-atom-registry-effect-sync. Why: {{method}} returns an Effect, so calling it inside Effect.sync builds an Effect that never runs. Fix: yield* it from Effect code instead of wrapping it in Effect.sync. AtomRegistry instance methods stay synchronous. Ref: effect reactivity Atom.',
  ],
  [
    'no-barrel-import',
    "Rule: no-barrel-import. Why: a value import from the effect barrel hides which module a name comes from. Fix: import the namespace subpath, such as import * as Effect from 'effect/Effect', including when copying reference snippets. Type-only imports are fine. Ref: ADR-001.",
  ],
  [
    'no-branch-in-object',
    'Rule: no-branch-in-object. Why: a Match or Option.match inside an object literal hides the decision in the object shape. Fix: compute the value into a named const first, then build the object from named values. Ref: linteffect.',
  ],
  [
    'no-cross-package-relative-imports',
    "Rule: no-cross-package-relative-imports. Why: a relative import into another workspace package bypasses that package's public exports. Fix: import the package by name through its package.json exports. Ref: executor.",
  ],
  [
    'no-double-cast',
    'Rule: no-double-cast. Why: a cast through any or unknown hides an unsound type boundary. Fix: decode with Schema or narrow with a typed adapter, or put // lint-allow-double-cast: <reason> on the line above. Ref: executor.',
  ],
  [
    'no-effect-all-step-sequencing',
    'Rule: no-effect-all-step-sequencing. Why: Effect.all with concurrency 1 or a discarded asVoid result hides sequential side-effect steps in an array. Fix: yield* each step in Effect.gen or chain them with Effect.andThen; keep Effect.all for combining values. Ref: linteffect.',
  ],
  [
    'no-effect-bind',
    'Rule: no-effect-bind. Why: Effect.bind accumulates values builder-style and hides the order of steps. Fix: write the steps in Effect.gen as const value = yield* step. Ref: linteffect.',
  ],
  [
    'no-effect-call-in-effect-arg',
    'Rule: no-effect-call-in-effect-arg. Why: an Effect call as the source of a data-first transformation, such as Effect.map(Effect.succeed(1), f), reads inside out. Fix: pipe the source (source.pipe(Effect.map(f))) or use Effect.gen. Runners, forks, and resource helpers may take an Effect. Ref: house style.',
  ],
  [
    'no-effect-escape-hatch',
    'Rule: no-effect-escape-hatch. Why: Effect.die and orDie turn a recoverable failure into a defect that typed handlers never see. Fix: keep a typed error. For a truly unrecoverable invariant or entry config failure, add an inline disable that says why; oxlint overrides can exempt a file. Ref: house style.',
  ],
  [
    'no-effect-internal-tags',
    'Rule: no-effect-internal-tags. Why: comparing the _tag of an Option, Exit, Result, or Cause reason depends on its internal representation. Fix: use the public helpers, such as Option.isSome, Exit.isFailure, Result.match, or Cause.isFailReason. Ref: executor.',
  ],
  [
    'no-effect-ladder',
    'Rule: no-effect-ladder. Why: a const or returned data-first transformation whose source nests more Effect calls reads from the innermost call outward. Fix: start from the innermost source and pipe each step, or use Effect.gen. Ref: house style.',
  ],
  [
    'no-effect-side-effect-wrapper',
    'Rule: no-effect-side-effect-wrapper. Why: Effect.as evaluates its value when the Effect is built, so a side-effect call there runs once, early, and an Effect passed as the value never runs. Fix: run the effect as a step with Effect.tap or yield* in Effect.gen. A pure value is fine. Ref: linteffect.',
  ],
  [
    'no-flatmap-ladder',
    'Rule: no-flatmap-ladder. Why: flatMap nested in flatMap, or flatten over map, stacks sequencing that hides the order of steps. Fix: write the steps in Effect.gen with yield*, or pipe them one after another. Ref: house style.',
  ],
  [
    'no-fromnullable-nullish-coalesce',
    'Rule: no-fromnullable-nullish-coalesce. Why: ?? null adds nothing to Option.fromNullishOr, and ?? undefined makes fromUndefinedOr treat null as absent. Fix: use Option.fromNullishOr(value); keep fromUndefinedOr(value) only if null is impossible or a real value. No autofix. Ref: effect Option.',
  ],
  [
    'no-iife-wrapper',
    'Rule: no-iife-wrapper. Why: an immediately invoked inline function hides a decision or a sequence inside a wrapper. Fix: bind the value with const and keep one flat pipeline, Match, or Effect.gen. Ref: linteffect.',
  ],
  [
    'no-inline-schema-compile',
    'Rule: no-inline-schema-compile. Why: a schema built inside a function is a new schema on each call, which can miss the parser cache keyed by schema AST. Fix: hoist the schema to module scope, and optionally the decoder or encoder; decoding a hoisted schema inline is fine. Ref: effect Schema.',
  ],
  [
    'no-instanceof-error',
    "Rule: no-instanceof-error. Why: instanceof Error guesses at an untyped failure instead of keeping it in the typed error channel. Fix: model expected failures as tagged errors handled with Effect.catchTag or catchTags, and keep an unknown cause as a typed error's cause. Ref: executor.",
  ],
  [
    'no-instanceof-tagged-error',
    'Rule: no-instanceof-tagged-error. Why: instanceof on a tagged error ties handling to class identity instead of its tag. Fix: recover with Effect.catchTag or catchTags, or branch with Match.tag. Ref: executor.',
  ],
  [
    'no-json-parse',
    'Rule: no-json-parse. Why: JSON.parse throws and returns an untyped value inside Effect code. Fix: decode through Schema, such as Schema.decodeUnknownEffect(Schema.fromJsonString(MySchema)). Ref: executor.',
  ],
  [
    'no-manual-tag-check',
    'Rule: no-manual-tag-check. Why: comparing _tag by hand re-implements the tagged dispatch Effect already provides. Fix: use Effect.catchTag or catchTags for errors, Match.tag for values, and Effect.catchReason for nested reasons; reading _tag without branching is fine. Ref: house style, not an Effect rule.',
  ],
  [
    'no-match-effect-branch',
    'Rule: no-match-effect-branch. Why: sequencing Effect work inside a Match or Option.match branch hides control flow. Fix: select a value in the match, then run one Effect pipeline outside it, or move the logic into Effect.gen. Ref: linteffect.',
  ],
  [
    'no-model-overlay-cast',
    'Rule: no-model-overlay-cast. Why: an as assertion on a const overlays an unchecked type and hides schema drift. Fix: decode with the matching Schema and read the typed fields; as const is fine. Ref: linteffect.',
  ],
  [
    'no-option-as',
    'Rule: no-option-as. Why: Option.as replaces the value with a placeholder and hides what is selected. Fix: use Option.map or Option.match and return the value explicitly. Ref: linteffect.',
  ],
  [
    'no-option-boolean-normalization',
    'Rule: no-option-boolean-normalization. Why: Option.match with onSome: (v) => v === true and onNone: () => false re-coerces a boolean at each use. Fix: decode the boolean once at the Schema boundary and read it directly. Ref: linteffect.',
  ],
  [
    'no-pipe-ladder',
    'Rule: no-pipe-ladder. Why: an Effect pipeline nested in another Effect pipeline, or in a transforming callback such as Effect.flatMap, hides control flow like nested try/catch. Fix: flatten the nested logic into Effect.gen and yield* each step. Nested Schedule, Layer, and Schema pipes are fine. Ref: house style.',
  ],
  [
    'no-promise-catch',
    'Rule: no-promise-catch. Why: Promise .catch() handles failures outside the typed Effect error channel. Fix: wrap the Promise with Effect.tryPromise and recover with Effect.catch, catchTag, or catchTags. Ref: executor.',
  ],
  [
    'no-promise-reject',
    'Rule: no-promise-reject. Why: a rejected Promise carries an untyped failure that Effect cannot track. Fix: fail with Effect.fail and a tagged error, or wrap Promise code with Effect.tryPromise. Ref: executor.',
  ],
  [
    'no-react-state',
    'Rule: no-react-state. Why: useEffect, useReducer, useContext, useCallback, and useSyncExternalStore bypass the atom runtime. Fix: use atoms for shared or server state, ScopedAtom instead of context, and useState only for state local to one component. Ref: house style, PA-3.',
  ],
  [
    'no-redundant-error-factory',
    'Rule: no-redundant-error-factory. Why: a helper that only constructs a tagged error hides the constructor without adding behavior. Fix: construct the tagged error directly, such as new MyError({ ... }). Ref: executor.',
  ],
  [
    'no-redundant-primitive-cast',
    'Rule: no-redundant-primitive-cast. Why: value as string, number, or boolean asserts a primitive without checking it. Fix: remove a redundant cast, or decode unknown data with Schema or a typed adapter first. Ref: executor.',
  ],
  [
    'no-render-side-effects',
    'Rule: no-render-side-effects. Why: a Match.value(...).pipe(...) statement runs branch side effects during render. Fix: keep Match as a pure expression and move the side effect into an event handler or an Effect action. Ref: linteffect.',
  ],
  [
    'no-return-null',
    'Rule: no-return-null. Why: null as an optional Effect result makes callers guard for a sentinel. Fix: return Option.none() or use Effect.succeedNone; use Option.fromNullishOr and Option.getOrNull at nullable interfaces. Effect can carry null; this is house style. Ref: house style.',
  ],
  [
    'no-string-error-channel',
    'Rule: no-string-error-channel. Why: a string failure gives callers no stable tag to recover on. Fix: fail with a named tagged error, Data-tagged for internal errors or Schema-tagged for wire errors, so callers can use Effect.catchTag. No autofix: the class, tag, and fields are domain choices. Ref: house style.',
  ],
  [
    'no-switch-statement',
    'Rule: no-switch-statement. Why: switch spreads a decision across imperative cases in Effect code. Fix: use Match.value or Match.type, Option.match, or Result.match, then run one pipeline. Ref: linteffect.',
  ],
  [
    'no-try-catch',
    'Rule: no-try-catch. Why: try/catch in Effect code bypasses the typed error channel. Fix: wrap throwing code with Effect.try or Effect.tryPromise, and handle failures with typed errors and the Effect.catch combinators. Ref: linteffect.',
  ],
  [
    'no-ts-nocheck',
    'Rule: no-ts-nocheck. Why: a ts-nocheck directive silently turns off type checking for the whole file. Fix: fix the types, or use a narrow ts-expect-error comment with a reason. Ref: executor.',
  ],
  [
    'no-unknown-boolean-coercion-helper',
    "Rule: no-unknown-boolean-coercion-helper. Why: a local typeof value === 'boolean' helper beside a Match.orElse null fallback coerces unknown data in service code. Fix: decode the optional boolean at the Schema boundary and read the typed value. Ref: linteffect.",
  ],
  [
    'no-unknown-error-message',
    "Rule: no-unknown-error-message. Why: a value caught by catch or an Effect.try or tryPromise handler is unknown; reading message or calling String() assumes an unchecked shape. Fix: keep it as a typed error's cause, or decode or narrow it into a validated binding. A cast does not make it safe. Ref: house style.",
  ],
  [
    'prefer-effect-fn',
    'Rule: prefer-effect-fn. Why: a named function that only returns Effect.gen rebuilds a generator wrapper that Effect.fn already provides, without its span or stack frame. Fix: define it as Effect.fn("name")(function* (...) { ... }), or Effect.fnUntraced for hot paths. Ref: ADR-001.',
  ],
  [
    'prefer-effect-predicate',
    'Rule: prefer-effect-predicate. Why: a hand-written nullish predicate duplicates the Effect Predicate helpers. Fix: use Predicate.isNotNull, isNotUndefined, isNotNullish, isNull, isUndefined, or isNullish. Ref: executor.',
  ],
  [
    'prefer-schema-inferred-types',
    'Rule: prefer-schema-inferred-types. Why: a hand-written object type beside a matching Schema can drift from it. Fix: derive the type from the schema, such as type User = typeof UserSchema.Type. Ref: executor.',
  ],
  [
    'prevent-dynamic-imports',
    'Rule: prevent-dynamic-imports. Why: import() hides a dependency behind deferred loading, so code paths are harder to read and verify. Fix: use a static import; turn the rule off where code splitting is measured and intended. Ref: linteffect, PA-4.',
  ],
]);

const placeholderPattern = /\{\{(\w+)\}\}/g;

// Tests and inventory ask whether a rule has written guidance without triggering the lookup error.
export const hasExplicitRuleMessage = (ruleName: string): boolean =>
  explicitRuleMessages.has(ruleName);

// Throws for a rule with no written message and for an unfilled placeholder, so a new rule cannot
// ship a generated message.
export const ruleMessage = (
  ruleName: string,
  data: Readonly<Record<string, string>> = {},
): string => {
  const template = explicitRuleMessages.get(ruleName);
  if (template === globalThis.undefined) {
    throw new Error(`No written message for rule ${ruleName}.`);
  }

  return template.replaceAll(placeholderPattern, (_placeholder, key: string) => {
    const value = data[key];
    if (value === globalThis.undefined) {
      throw new Error(`Message for rule ${ruleName} needs a value for {{${key}}}.`);
    }
    return value;
  });
};
