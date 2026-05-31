const explicitRuleMessages = new Map<string, string>([
  [
    'effect-no-multiple-provide',
    'Rule: effect-no-multiple-provide. Why: multiple Effect.provide steps in one pipeline defeat Layer memoization. Fix: merge layers before one provide.',
  ],
  [
    'no-barrel-import',
    'Rule: no-barrel-import. Why: Effect code should import concrete submodules so tree-shaking and namespace conventions stay explicit.',
  ],
  [
    'no-effect-as',
    'Rule: avoid Effect.as. Why: it hides sequencing and turns effects into placeholders. Fix: use Effect.map for value mapping or Effect.asVoid after explicit pipeline steps.',
  ],
  [
    'no-double-cast',
    'Rule: no-double-cast. Why: double casts through any or unknown hide unsound type boundaries. Fix: validate or narrow before asserting the target type.',
  ],
  [
    'no-effect-sync-console',
    'Rule: no-effect-sync-console. Why: console calls inside Effect.sync hide logging as a synchronous side effect. Fix: use Effect.log* or move logging outside the wrapper.',
  ],
  [
    'no-effect-wrapper-alias',
    'Rule: no-effect-wrapper-alias. Why: aliases around newly-created Effect pipelines hide the real unit of Effect composition. Fix: name the Effect program directly or use Effect.fn.',
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
    'Rule: no-manual-tag-check. Why: manual _tag checks couple code to representation details. Fix: use Predicate.isTagged or Match.',
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
    'Rule: no-unknown-error-message. Why: unknown caught values are not guaranteed to expose message safely. Fix: narrow or decode before reading message.',
  ],
  [
    'warn-effect-sync-wrapper',
    'Rule: warn-effect-sync-wrapper. Why: Effect.sync should wrap synchronous value production, not arbitrary side-effect helper calls.',
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
