# Review: Effect rules and v4 guidance alignment plan

Reviewed: `docs/exec-plans/active/effect-rules-v4-alignment-2026-09-25.md` against ADR-001, ADR-004, `preset-architecture.md`, `rule-intake.md`, `rule-pack-architecture.md`, the rule catalog and manifest, `check-rule-inventory.ts`, `@effect/tsgo` at tag `@effect/tsgo@0.45.0` (rule docs and `oxlint-presets/*.json`), executor's `.oxlintrc.jsonc`, and the t3code and effect `tsconfig.base.json` plugin blocks. Taste-distillery canon was read through GNO (TD-CARD-008, -024, -026, -032, -033).

Shorthand: `RC` = `packages/oxlint-standards/src/rule-catalog.ts`, `RM` = `packages/oxlint-standards/src/rule-manifest.ts`, `TSGO` = `/Users/mp/references/effect-ts/tsgo` at the 0.45.0 tag.

## Verdict

**Ready after the listed fixes.** The per-rule decisions hold up; none contradicts the references or the ADRs on its merits. What blocks the build is around them. The tsgo severities the plan relies on are not what tsgo's `recommended` preset ships. Kept rules still defer to rules the plan drops. The switch from `@effect/language-service` to a required `@effect/tsgo` rewrites three governance docs the plan does not name. The plan's own regression gate, the reference-snippet harness, no longer exists. Fix F1 to F4 before the build step; the rest can land in the same change.

## Findings

### F1 (high): kept rules skip code they treat as owned by dropped rules

Plan section: Decided, "Rule ownership hand-offs" (`:215`). The plan names one case; the guard is systemic.

Evidence: `isInAnyWrapperOwnedExpression` (`src/utils/effect-ownership.ts:163-169`) returns true inside a named wrapper's returned expression (`:62-89`, the shape `prefer-effect-fn` owned) or a const `pipe(Effect.*, …)` alias (`:116-160`, the shape `no-effect-wrapper-alias` owned). Both owners are dropped. Kept rules that carry the guard: `no-effect-escape-hatch` (`RC:2506`), `no-effect-side-effect-wrapper` (`RC:2532`), `no-effect-bind` (`RC:2182`), and the reworked `no-effect-call-in-effect-arg` (`RC:2207`) and `no-pipe-ladder` (`RC:2831`). `no-effect-ladder` (`RC:2253-2259`) and `no-flatmap-ladder` (`RC:2448`) also defer to `effectSingleCalleeRuleOwners = {as, async, bind}` (`RC:751-763`); `no-effect-as` and `no-effect-async` are dropped. Concretely, `const boom = () => Effect.orDie(x)` and `const run = pipe(Effect.succeed(1), Effect.orDie)` are unflagged today (`rule-catalog.test.ts:963`) and stay unflagged by anything after the drop, while `no-effect-escape-hatch` stays at `error`.

Recommended change: in the build step, remove the wrapper-owned and single-callee guards from every kept rule whose owner is dropped, flip the "owned by `no-effect-wrapper-alias`" valid cases (`rule-catalog.test.ts:93,170,292,304,313,344,594,636,743,963`) to invalid cases on the surviving rule, and add a test that fails when a guard names a rule with `disposition: 'dropped'`.

### F2 (high): the tsgo severities the plan depends on are not in `recommended`

Plan section: Decided `:40` ("no lower than the dropped rule's") and Open decision 2 ("start from the 0.45.0 `recommended` preset").

Evidence: `TSGO:oxlint-presets/recommended.json` ships `multiple-effect-provide`, `unnecessary-fail-yieldable-error`, `global-console-in-effect`, and `outdated-api` at `warn`; the rules they replace are `error` (`RM:1699,2031,1124,955,1073,1648`). `effect-do-notation` is absent from `recommended` entirely (it is only in `style.json`), so building on `recommended` silently drops `no-effect-do` (`RM:1006`, `error`). `nested-effect-gen-yield`, `strict-effect-provide`, and `missed-pipeable-opportunity` are also outside `recommended`. Decided `:50` relies on `run-effect-inside-effect` and sets no severity; `recommended` has it at `warn`.

Recommended change: materialize the explicit severity list (see Open item 1) instead of extending `recommended`. Encode the floor as a test. Dropped manifest entries gain `replacedBy: ['effecttsgo/…']`; the test asserts that the shipped severity for each replacement is at least the dropped entry's collapsed severity.

### F3 (high): the tsgo delegation amends ADR-001 and ADR-004 without saying so

Plan section: Decided `:32`, `:42`.

Evidence: ADR-001 (`docs/decisions/001-effect-preset-posture.md:12`) delegates type-aware semantics to `@effect/language-service`, which the package recommends but does not bundle, and its `:21` consequence allows AST/language-service overlap only when the AST rule gives config-free backpressure. ADR-004 restates the language-service delegation (`004-rule-curation-and-severity-posture.md:10,20`). The plan makes `@effect/tsgo` required for the Effect preset and moves the surface from editor to lint. The same wording lives in `docs/decisions/index.md:7`, `rule-pack-architecture.md:7,18`, the README (`packages/oxlint-standards/README.md:109-155`), the manifest's `lspDelegatedChecks` list (`RM:2722-2734`, which names `importFromBarrel` and `missingEffectServiceDependency`, neither of which exists in tsgo per plan `:256`), and a hard-coded inventory assertion (`scripts/checks/check-rule-inventory.ts:693` fails if `lsp/missingEffectServiceDependency` disappears).

Recommended change: add an ADR (007) that supersedes ADR-001's delegation clause and ADR-004's language-service wording: tsgo is the delegation target, the Effect preset requires the patch route, and the overlap rule becomes: an AST rule may overlap a tsgo rule when it is stricter or when it fires without a TypeScript project. That rule is what keeps `no-json-parse` next to `prefer-schema-over-json` and `no-barrel-import` legitimate. Update the index summary, `rule-pack-architecture.md` source model and counts, the README section and catalog counts, rename the manifest's LSP entries to tsgo names that exist, and replace the `:693` assertion. Taste-distillery: no conflict. No card owns per-rule lint decisions; TD-CARD-032 names `@effect/language-service` only as example evidence, and TD-CARD-024, which models tagged unions with `Match` and keeps `Effect.run*` at composition roots or tests, supports the `no-manual-tag-check` and `run-effect-inside-effect` decisions.

### F4 (high): the verification plan cannot catch a regression

Plan section: Evidence "Method" (`:133`, "The harness lived in a session scratchpad and is gone") and Next steps 6 (`:353`, "rerun the reference-snippet harness").

Recommended change, in order of value:

1. Make the decision test a durable vitest suite: a reference-corpus test that runs every preset-enabled custom rule as `valid` over the effect-solutions, `LLMS.md`, and v4-test snippets the plan cites, each with a provenance comment. This is the only gate that enforces the rule that no active rule may fire on reference code.
2. Make the app run repeatable: a script under `scripts/checks/` that lints the t3code and executor checkouts with the built plugin and prints per-rule counts; commit the after-change counts to the completed plan next to the before table (`:299-308`).
3. Pin `@effect/tsgo` exactly as a devDependency and add a test that every `effecttsgo/*` name in the shipped fragment exists in the pinned `oxlint-schema.json`, and that every rule in the pinned version is either in the fragment or in an explicit `off` list. A tsgo bump then forces triage; the local checkout already shows the drift (12 commits past the tag, a new `strict` preset, 22 rules moved out of `recommended`, plan `:237`).
4. A test that every preset-enabled custom rule has an explicit entry in `src/rule-messages.ts`, since Next steps 3 promises written messages and nothing enforces it.
5. The tsgo route end to end: a `smoke:oxlint-packed-consumer` variant that installs the pinned tsgo and runs the patch, then asserts that one `effecttsgo/*` diagnostic at `error` exits 1.

### F5 (medium): where the tsgo settings live is under-specified, and part of it is not where the plan puts it

Plan section: Decided `:26` (`"effectFn": [...]` setting), `:32`, `:42`, `:52`.

Evidence: tsgolint parses plugin options from the tsconfig `compilerOptions.plugins` block (`TSGO:etsoxlintrunner/runner.go:73,110`, `etscore.ParseFromPlugins`), so `effectFn`, `namespaceImportPackages`, and `pipeableMinArgCount` come from `@mplibunao/tsconfig`'s Effect config even on the oxlint route. The preset type carries only `jsPlugins` and `rules` (`src/presets/shared.ts:11-16`), while the tsgo fragment needs `plugins: ['effecttsgo']`, `options.typeAware: true` (`TSGO:oxlint-presets/recommended.json:2-7`), and an `overrides` entry to turn `strict-effect-provide` off for tests (`:52`). The README already states that `overrides` must be composed, not extended (`README.md:49-52`).

Recommended change: state that severities ship as an oxlint config fragment under `src/configs/` composed through `composeLintConfigs`, non-severity options ship in the tsconfig Effect config, and the scratch-consumer verification must prove that `effectFn` in tsconfig changes the oxlint-route output (the current verification proves only that diagnostics appear). Extend "one route per project" to "severities live in one place": check whether tsconfig `diagnosticSeverity` also applies on the oxlint route, because two sources of truth would silently disagree. Record in the 0.2.0 changeset that the Effect preset now fails on an unpatched oxlint; that is the intended loud failure, but it is a breaking change for existing consumers.

### F6 (medium): `preset-architecture.md` drifts beyond PA-3

Plan section: Decided `:21` ("This amends PA-3 … `:90`").

Evidence: the taxonomy table lists `effect-react` as holding `no-inline-runtime-provide`, `no-naked-object-state-update`, and `no-family-collection-read` (`preset-architecture.md:36`); all three are dropped. The gating findings still describe `no-family-collection-read` (`:71`) and the six-hook ban (`:74`). After the change `effect-react` holds `no-react-state`, `no-render-side-effects`, and `no-atom-registry-effect-sync`.

Recommended change: amend lines 36, 71, 74, and 90 in the same change, and say so in the plan.

### F7 (medium): two Decided items contradict each other on chained pipes

Plan section: Decided `:31` versus `:41`, and Options table D (`:97`).

Evidence: `:31` says the reworked `no-pipe-ladder` "also flags chained `.pipe(a).pipe(b)`" and its message points to "merging chained pipes"; `:41` says it builds only the nested half and tsgo's `unnecessary-pipe-chain` owns chains.

Recommended change: rewrite `:31` to the nested-Effect-pipe half only and drop the chained-pipe clause from the message. Also lower `unnecessary-pipe-chain` to `warn`. tsgo classes it Style with default `suggestion` (`TSGO:docs/rules/unnecessary-pipe-chain.md`), and the original rule never flagged chains (Options A, `:94`). The plan's agent-failure evidence covers nesting (`:99`), not chains, so ADR-004 puts chains at the quieter level.

### F8 (medium): three decisions leave severity or scope unstated

Plan section: Decided `:34`, `:36`, `:50`.

- `:36` introduces a new rule for `Effect.fail("literal")` with no name, severity, gating, or preset. Recommend `no-string-error-channel`, `error` (an untyped error channel is an agent failure mode under ADR-004), `effect-callee` gating, `effect` preset, matching a string literal or template as the sole `Effect.fail` argument.
- `:34` narrows `no-inline-schema-compile` but keeps the manifest `error` (`RM:1767`) for what its own message now calls a cache miss; t3code runs the same rule at `warn` (`:280`). Recommend `warn`.
- `:50` depends on `run-effect-inside-effect` with no severity. Recommend `error`; TD-CARD-024 keeps `Effect.run*` at composition roots or tests, and the rule's message names the `run*With` fix.

### F9 (medium): the narrowed `no-manual-tag-check` still fires on reference code, and the plan does not record that as a chosen deviation

Plan section: Decided `:29`; decision test `:17`.

Evidence: the comparison branch keeps flagging `error.reason._tag === "NotFound"`, which the plan attributes to effect-solutions (`:324`, `ES/…/06-error-handling.md:111`). The decision test allows this only when MP chose the deviation, and Decided does not say so.

Recommended change: add one sentence to `:29` recording the deviation and the reference it overrides, and have the message cite `Effect.catchReason` as the reference-backed replacement. Keep `error`: canon (TD-CARD-024) prefers `Match` for tagged unions, and executor enforces the same rule.

### F10 (medium): `prefer-schema-over-json` lands below the rule it replaces and flags the same shape that produced the noise

Plan section: Decided `:46`.

Evidence: `no-naked-object-state-update` is `error` (`RM:1344`); the replacement ships at `warn`. tsgo's rule flags `JSON.stringify` as well as `JSON.parse` (`TSGO:docs/rules/prefer-schema-over-json.md` message), and 694 of 747 t3code hits on the old rule were plain `JSON.stringify` (`:316`). The tsgo rule is scoped to Effect code and t3code runs its language-service twin at `error` (`t3code/tsconfig.base.json:39`), which suggests the real count is lower, but the plan has not measured it.

Recommended change: say the `:40` floor applies to the seven listed rules only, and gate `prefer-schema-over-json` on the app-run count from F4.2: `warn` if the count is small, `off` if it reproduces the stringify noise, with `no-json-parse` staying at `error` either way.

### F11 (low): version lockstep versus the package's peer range

Plan section: Delegation route verification `:203-204`.

Evidence: `@effect/tsgo` 0.45.0 supports oxlint 1.81 and 1.82 only; `@mplibunao/oxlint-standards` declares `oxlint: ^1.58.0` (`packages/oxlint-standards/package.json:41`). A vite-plus bump ahead of tsgo turns every Effect-preset consumer's lint into `Unknown plugin: 'effecttsgo'`.

Recommended change: keep the wide peer for non-Effect consumers, document the supported tsgo/oxlint/vite-plus matrix in the README, group `vite-plus` and `@effect/tsgo` in Renovate, and pin the tested pair in the packed-consumer smoke.

### F12 (low): drop mechanics and stale counts

Plan section: Next steps 3 ("Drops … are manifest and config changes").

Evidence: the inventory check hard-codes the drop list (`check-rule-inventory.ts:26`), expects dropped linteffect entries to keep a manifest row with `disposition: 'dropped'`, `implementationStatus: 'not-implemented'`, `parityStatus: 'not-applicable'`, `collections: []`, and a reason (`RM:1223-1237` is the precedent), and requires a replay suite for every implemented custom rule (`:644-651`); `fixture-replay.ts` still carries suites for rules the plan deletes (`no-call-tower`, `:1217`). The `effectVersionSensitivity` field carries no signal (plan `:146`) and no Decided item touches it. README catalog counts (`README.md:143-155`) go stale.

Recommended change: drop by disposition, never by deleting rows; extend `explicitDrops`; remove replay suites for deleted rules; either populate `effectVersionSensitivity` with the stale-v3 evidence or remove the field; regenerate the README counts.

### F13 (low): deferrals have no home while `introspection` is unavailable

Plan section: `:355` (blocker) and the deferrals inside Decided.

Evidence: `introspection` is not on PATH here (`command not found`), and the plan already defers `Effect.forkDetach` research (`:50`), the `missed-pipeable-opportunity` check (`:43`), tsgo drift and the `strict` preset (`:237`), and the dead v3 branches (`:342`). Dropping `no-effect-as` also resolves BP-TD-010 (`.introspection/generated/gno-markdown/tech-debt/open/bp-td-010.md`), which must be superseded in the same change.

Recommended change: add a Next step that names where each deferral is recorded. The home is an introspection record once the sibling build is fixed, or a record file edited directly and validated afterwards. Close BP-TD-010 in the same change.

### F14 (low): stale status line

`:3` still reads "per-rule decisions pending" while Decided is complete. Update when the review is absorbed.

## Open item 1: tsgo rule selection

Recommendation: generate one explicit `effecttsgo/*` severity list from the four category presets at the pinned tag (`TSGO:oxlint-presets/{correctness,antipattern,style,effect-native}.json` are the category membership), not from `recommended`. Reasons: `recommended` omits four rules the plan depends on (F2), and upstream is already moving rules out of it (22 in 12 commits), so its membership is not a stable base. Grade by ADR-004 kind, which maps cleanly onto tsgo's categories:

- **Correctness (21 rules): `error`**, except `duplicate-package` at `warn` (an install-state problem). This raises `outdated-api`, `promise-in-effect-success`, `obsolete-match-import`, `obsolete-schema-import`, `generic-effect-services`, `any-unknown-in-error-context`, and `unsafe-effect-type-assertion` above their `recommended` level; t3code runs the last two at `error` (`t3code/tsconfig.base.json:27-28`).
- **Anti-pattern (20 rules):** `error` for `try-catch-in-effect-gen`, `run-effect-inside-effect`, `leaking-requirements`, `effect-in-failure`, `effect-in-void-success`, `lazy-promise-in-effect-sync`, `unknown-in-effect-catch`, `global-error-in-effect-catch`, `global-error-in-effect-failure`, `multiple-effect-provide`, `strict-effect-provide` (tests off), `scope-in-layer-effect`, and `layer-merge-all-with-dependencies`: each hides a failure path or breaks a scope, which is the agent failure mode this pack exists for. `warn` for the refactoring hints: `return-effect-in-gen`, `catch-unfailable-effect`, `effect-fn-iife`, `effect-gen-uses-adapter`, `lazy-effect`, `prefer-unsafe-constructor`, `schema-sync-in-effect` (decided).
- **Style (50 rules): `warn`** by default; they are fixable idiom rewrites and teaching them is the point. Exceptions at `error`: `effect-fn-opportunity` and `nested-effect-gen-yield` (decided), `effect-do-notation` and `unnecessary-fail-yieldable-error` (floor). `off`: `catch-die-to-or-die` (decided), `strict-boolean-expressions` (stack-neutral; belongs to `general` through oxlint's native `typescript/strict-boolean-expressions`), `missing-effect-service-dependency` (v3-only), and `deterministic-keys` (needs project key conventions). Enable `missed-pipeable-opportunity` at `warn` for the `:43` evaluation, then decide.
- **Effect-native (22 rules):** `error` for the in-Effect variants of date, random, uuid (decided), console (floor), timers, and `process-env` (Config is the Effect answer and `process.env` inside Effect code is exactly agent slop); `warn` for `global-fetch-in-effect` (`HttpClient` still lives under `effect/unstable/http`), `abort-controller-in-effect`, the outside-Effect siblings (decided pattern), `schema-sync`, `extends-native-error`, and `prefer-schema-over-json` pending F10; `error` for `instance-of-schema` (t3code `:29`); `warn` for `async-function`, `new-promise`, and `node-builtin-import`, and put those three in the boundary relaxation from Open item 2, because boundary code is where they misfire.

Two caveats for MP. Under `vp lint --max-warnings 0` (root `package.json:20`), `warn` still fails the gate, so the grading changes what agents triage first, not what CI accepts. And the effect repo itself runs the language service with `ignoreEffectWarningsInTscExitCode: true` (`effect/tsconfig.base.json:41-42`), so the core team's own posture is quieter than either t3code's or this list; that is evidence that `warn` is the right default for Style, not that the `error` set above is too loud.

## Open item 2: boundary scoping

Recommendation: do not ship path overrides for React, Electron, CLI, or script code. Ship two things instead.

1. A test-file override inside the Effect config fragment (`strict-effect-provide` off, matching what `baseConfig` already does for structural ceilings, `README.md:50`). Test files are a stack-neutral convention; app layout is not.
2. An exported boundary relaxation, a rules object consumers attach to their own `files` globs through `composeLintConfigs`, covering the exception-and-promise boundary set executor turns off by path (`executor/.oxlintrc.jsonc:70-80`): `no-effect-escape-hatch`, `no-instanceof-error`, `no-json-parse`, `no-promise-catch`, `no-promise-reject`, `no-switch-statement`, `no-try-catch`, `no-unknown-error-message`, plus tsgo's `async-function`, `new-promise`, `node-builtin-import`, and the outside-Effect `global-*` siblings. Document it with executor's globs as the example.

Reasons: PA-1 makes the preset axis stack coupling, not file type, and executor's six overrides are executor's layout (`apps/cli`, `runtime-*`, `e2e`, `marketing`, `mcp-apps-shell`); no glob transfers. A named relaxation keeps the exemption reviewable in one config line instead of 800 inline disables, which is the "explicit scoped relaxation" shape TD-CARD-008 sanctions. React needs no override: `effect-react` already scopes the React opinions, and the React false positives were fixed by narrowing rules (`no-return-null`, `:47`) rather than by path.
