const explicitRuleMessages = new Map<string, string>([
  [
    'no-barrel-import',
    'Rule: no-barrel-import. Why: Effect code should import concrete submodules so tree-shaking and namespace conventions stay explicit.',
  ],
  [
    'no-double-cast',
    'Rule: no-double-cast. Why: double casts through any or unknown hide unsound type boundaries. Fix: validate or narrow before asserting the target type.',
  ],
  [
    'no-inline-schema-compile',
    'Rule: no-inline-schema-compile. Why: compiling Schema decoders inside functions repeats work on every call. Fix: hoist the compiled decoder or encoder to module scope.',
  ],
  [
    'no-instanceof-error',
    'Rule: no-instanceof-error. Why: Effect error channels should model expected failures instead of checking the platform Error class.',
  ],
  [
    'no-instanceof-tagged-error',
    'Rule: no-instanceof-tagged-error. Why: tagged Effect errors should be matched by tag or predicates, not instanceof checks.',
  ],
  [
    'no-json-parse',
    'Rule: no-json-parse. Why: Effect code should decode unknown JSON through Schema instead of untyped JSON.parse.',
  ],
  [
    'no-manual-tag-check',
    'Rule: no-manual-tag-check. Why: comparing _tag by hand re-implements the tagged dispatch Effect already provides. Fix: use Effect.catchTag or catchTags for errors, Match.tag for values, and Effect.catchReason for nested reasons; reading _tag without branching is fine. Ref: house style, not an Effect rule.',
  ],
  [
    'no-effect-call-in-effect-arg',
    'Rule: no-effect-call-in-effect-arg. Why: an Effect call as the source of a data-first transformation, such as Effect.map(Effect.succeed(1), f), reads inside out. Fix: pipe the source (source.pipe(Effect.map(f))) or use Effect.gen. Runners, forks, and resource helpers may take an Effect. Ref: house style.',
  ],
  [
    'no-effect-ladder',
    'Rule: no-effect-ladder. Why: a const or returned data-first transformation whose source nests more Effect calls reads from the innermost call outward. Fix: start from the innermost source and pipe each step, or use Effect.gen. Ref: house style.',
  ],
  [
    'no-flatmap-ladder',
    'Rule: no-flatmap-ladder. Why: flatMap nested in flatMap, or flatten over map, stacks sequencing that hides the order of steps. Fix: write the steps in Effect.gen with yield*, or pipe them one after another. Ref: house style.',
  ],
  [
    'no-pipe-ladder',
    'Rule: no-pipe-ladder. Why: an Effect pipeline nested in another Effect pipeline, or in a transforming callback such as Effect.flatMap, hides control flow like nested try/catch. Fix: flatten the nested logic into Effect.gen and yield* each step. Nested Schedule, Layer, and Schema pipes are fine. Ref: house style.',
  ],
  [
    'no-string-error-channel',
    'Rule: no-string-error-channel. Why: a string failure gives callers no stable tag to recover on. Fix: fail with a named tagged error, Data-tagged for internal errors or Schema-tagged for wire errors, so callers can use Effect.catchTag. No autofix: the class, tag, and fields are domain choices. Ref: house style.',
  ],
  [
    'no-match-effect-branch',
    'Rule: no-match-effect-branch. Why: Match and Option branches should stay value-level; move Effect work into Effect composition.',
  ],
  [
    'no-promise-catch',
    'Rule: no-promise-catch. Why: Effect code should use Effect.catch* combinators instead of Promise.catch.',
  ],
  [
    'no-promise-reject',
    'Rule: no-promise-reject. Why: Effect code should fail through Effect.fail or typed errors instead of rejected Promises.',
  ],
  [
    'no-redundant-error-factory',
    'Rule: no-redundant-error-factory. Why: factory wrappers around tagged errors obscure the error constructor without adding behavior.',
  ],
  [
    'no-unknown-error-message',
    "Rule: no-unknown-error-message. Why: a value caught by catch or an Effect.try or tryPromise handler is unknown; reading message or calling String() assumes an unchecked shape. Fix: keep it as a typed error's cause, or decode or narrow it into a validated binding. A cast does not make it safe. Ref: house style.",
  ],
]);

const intentPhrase = (ruleName: string): string =>
  ruleName
    .replace(/^no-/, 'avoid ')
    .replace(/^prefer-/, 'prefer ')
    .replace(/^warn-/, 'review ')
    .replaceAll('-', ' ');

export const ruleMessage = (ruleName: string): string =>
  explicitRuleMessages.get(ruleName) ??
  `Rule: ${ruleName}. Why: ${intentPhrase(ruleName)} in files covered by this catalog policy.`;
