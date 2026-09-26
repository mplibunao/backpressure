# Effect rules and v4 guidance alignment

Status: decisions complete and design-reviewed (2026-09-25); ready to build. Review: `docs/reviews/effect-rules-v4-alignment-review-2026-09-25.md`, findings F1 to F14 absorbed below. The branch is `lint/oxlint-standards-consolidation`, so these changes would land in the unreleased 0.2.0.

## Goal

Make sure the `effect` and `effect-react` presets do not give agents instructions that contradict the Effect v4 references MP gives them. The core purpose of this repo is to catch agent slop. A rule that flags idiomatic reference code teaches the wrong thing, and a rule that only matches v3 names protects nothing.

## Decision test

A rule **conflicts** when it fires on idiomatic code in the primary references:

- Effect v4 source repo (`Effect-TS/effect`, checked at `4.0.0-rc.117`): `packages/effect/test`, `packages/effect/typetest`, and `LLMS.md`. Library internals in `packages/effect/src` count for less, because a library sometimes does things app code should not.
- effect-solutions (`kitlangton/effect-solutions`, targets `effect@4.0.0-beta.59`): curated best practices.
- Secondary, for application structure only: `pingdotgg/t3code` and `UsefulSoftwareCo/executor`.

Before classifying a rule, check whether an existing decision already owns it: ADRs in `docs/decisions/` and the PA-* decisions in `docs/design-docs/preset-architecture.md`. A decided rule is recorded under Decided and is not reopened. For each remaining conflicting rule, MP answers one question: should agents deviate from the references here? If not, the rule changes until it stops firing on reference code. The options are drop, narrow, and retarget. When a rule stays, its fix message should cite a reference. Consensus research on x.com adds input but never overrides the references.

## Decided

- `no-react-state` keeps banning `useEffect`, `useReducer`, `useContext`, `useCallback`, and `useSyncExternalStore` in `effect-react`, and stops banning `useState` (option B, pattern 15). This amends PA-3 (`docs/design-docs/preset-architecture.md:90`), which must be updated in the same change as the rule. The rule stays ungated, because it only runs in projects that enable `effect-react`. `useContext` is replaced by atom-react's `ScopedAtom` (`EF/../atom/react/src/ScopedAtom.ts:2-5`), which subscribes per atom instead of re-rendering every context consumer. `useState` stays allowed for state local to one component, because per-instance state has no clean atom equivalent (it needs `Atom.family` or a `ScopedAtom` per instance). Both atom-heavy apps keep `useState` for local UI state (`EX/packages/react/src/components/add-account-modal.tsx:1496`). The message should say: use atoms for shared or server state, and `useState` only for state local to one component.
- `no-manual-effect-channels` is dropped. MP prefers explicit `Effect.Effect<…>` and `Layer.Layer<…>` annotations, for clarity and for type-check performance at scale (Michael Arnaldi, https://x.com/MichaelArnaldi/status/2053293956318781856, via Grok and not opened by the agent). The references write explicit Effect types on service interfaces (`ES/…/04-services-and-layers.md:94-95`, `LLMS.md:140`).
- `no-effect-type-alias` is dropped, for the same reason as `no-manual-effect-channels`: it bans explicit Effect types written with the `type` keyword. Grok research (pattern 1) found no consensus against aliasing Effect types.
- `no-return-in-callback` is dropped. It flags `return` inside `Effect.gen`/`Effect.fn` generators, which Effect's agent guidance requires (`LLMS.md:32-34,76-78` says to always return when raising an error, as `return yield* new XError(…)`). It also contradicts `prefer-yield-tagged-error`.
- `no-return-in-arrow` is dropped. Grok research (pattern 2) found no receipts calling early `return` in combinator handlers slop. effect-solutions writes that shape (`ES/…/04-services-and-layers.md:113-121`), and the rule also fires on non-Effect callbacks (`T3/apps/web/src/components/Sidebar.tsx:3567`).
- `prefer-effect-fn` is replaced by tsgo's `effect-fn-opportunity`, shipped at `error` with the plugin setting `"effectFn": ["span", "inferred-span", "suggested-span"]`. With that setting, tsgo flags every `(…) => Effect.gen(…)` wrapper shape backpressure catches, plus object methods and piped-span wrappers it misses (tsgo coverage mapping). With tsgo's default setting it flags only one of the five shapes.
  - Note, 2026-09-26 (orchestrator decision, pending MP confirmation): `prefer-effect-fn` is restored as an overlapping custom rule. On the patched oxlint route, tsgo applies the `effectFn` setting only when the `tsconfig.json` it discovers has no `extends`, so under the shipped overlay setup `effect-fn-opportunity` flags only the `Effect.withSpan` wrapper. BP-TD-014 owns dropping the custom rule again.
- `no-effect-wrapper-alias` is dropped. It flags plain functions returning a non-gen Effect (`const run = () => Effect.succeed(value)`), which pattern 3 research found idiomatic, and effect-solutions writes that shape (`ES/…/06-error-handling.md:228-236`).
- `no-effect-escape-hatch` stays at `error`, with two fixes: remove the names absent from v4 (`dieMessage`, `orDieWith`; v4 exports only `die` and `orDie`, `EF/src/Effect.ts:1635,3687`), and replace the generic message with a concrete fix: use typed errors, and when a failure truly cannot be recovered (such as config at app entry, `ES/…/06-error-handling.md:186-202`), add an inline disable comment that states why. executor runs the same ban with 18 justified inline disables.
- `no-manual-tag-check` is narrowed to comparisons only (option B below). It keeps flagging `e._tag === "X"` and `"_tag" in e`, stops flagging plain reads such as logging `e._tag`, and its message names `Effect.catchTag`/`catchTags`, `Match.tag`, and `Effect.catchReason` for nested reasons (all present in v4: `EF/src/Effect.ts:2743,2842,2955`, `EF/src/Match.ts:1021`). This is a chosen deviation from effect-solutions, which compares `error.reason._tag === "NotFound"` (`ES/…/06-error-handling.md:111`); the message names `Effect.catchReason` as the reference-backed replacement. The rule stays at `error`: executor enforces the same rule, and taste-distillery TD-CARD-024 prefers `Match` for tagged unions.
- `no-unknown-error-message` is rescoped (option C below). It flags `.message`, `String(x)`, and `{ message }` destructuring only where the value is truly unknown: the parameter of a `catch (e) {}` clause and the `catch:` callback parameter of `Effect.try`/`Effect.tryPromise`. The variable-name guess (`rule-catalog.ts:1375`) goes away, which also covers the `catchTag`/`catchTags` exemption executor added after the port.
- `no-pipe-ladder` is reworked as a closure-nesting rule and stays at `error`. It flags an inline `Effect.flatMap`, `andThen`, or `tap` callback nested inside another Effect callback, and allows one-step handler bodies, `Effect.all` items, and pipelines in argument position. A new rule, `no-discarded-failure` (`error`), flags error handlers that never read their error unless the failure was recorded first. Both come from `docs/analysis/effect-nesting-rules-first-principles.md`, which owns the criteria and messages. Chained pipes are owned by tsgo (next item).
- Type-aware Effect checks are delegated to `@effect/tsgo` (0.45.0 verified). The default route for consumers is patching oxlint (`effect-tsgo patch --no-typescript --oxlint`), so tsgo's `effecttsgo/*` rules report in lint next to this package's rules. The fallback route for projects without oxlint is patching TypeScript 7 `tsc` (`effect-tsgo patch`). A project uses one route, never both, to avoid duplicate reports. The packages ship settings and setup instructions only: `oxlint-standards` ships the tsgo rule settings with its Effect config, and `@mplibunao/tsconfig` ships an Effect config with the plugin settings. Both are generated from one severity list, and `@effect/tsgo` is at most an optional peer dependency. Consumers add `@effect/tsgo` and the `prepare` patch script themselves. Backpressure itself does not use Effect and needs no patch. tsgo's own rules are upstream-maintained, so this repo chooses presets and severities for them instead of reviewing them one by one. The rule mapping (see Next steps) surfaces any tsgo rule that contradicts a decision in this list. This supersedes ADR-001's language-service delegation clause and ADR-004's language-service wording, so it lands as ADR-007. ADR-007's overlap rule: an AST rule may overlap a tsgo rule when it is stricter or when it fires without a TypeScript project, which keeps `no-json-parse` beside `prefer-schema-over-json` and keeps `no-barrel-import`. Settings split by what reads them: severities ship as an oxlint config fragment under `src/configs/`, composed through `composeLintConfigs` (it carries `plugins: ['effecttsgo']`, `options.typeAware: true`, and the test-file override); non-severity tsgo options (`effectFn`, `namespaceImportPackages`, `pipeableMinArgCount`) ship in the `@mplibunao/tsconfig` Effect config, because tsgolint reads plugin options from tsconfig even on the oxlint route (`tsgo/etsoxlintrunner/runner.go:73,110`). The build verifies whether tsconfig `diagnosticSeverity` also applies on the oxlint route, so severities never have two sources. `@effect/tsgo` is pinned exactly in this repo; the README documents the supported tsgo, oxlint, and vite-plus version matrix; and Renovate groups `vite-plus` with `@effect/tsgo`. The package peer range stays `oxlint: ^1.58.0` for non-Effect consumers. The 0.2.0 changeset states that the Effect preset now fails on an unpatched oxlint, which is a breaking change for existing consumers.
- `no-effect-as` is dropped (option B, pattern 7). `Effect.as` is idiomatic (119 uses in `EF/test`, `ES/tests/03-basics.test.ts:201`). `no-effect-side-effect-wrapper` stays to catch `Effect.as(doSomething())`, which runs its argument eagerly. The `Effect.asVoid` suggestion comes from tsgo's `effectMapVoid`.
- `no-inline-schema-compile` is narrowed (option B, pattern 12). It flags only a schema built inside the function (a `Schema.*(…)` call passed to a decoder or encoder), such as `Schema.decodeUnknownEffect(Schema.Struct({…}))(input)`. Decoding with a hoisted schema is allowed. Its message changes to say why: v4 caches compiled parsers per schema object (`EF/src/internal/schema/compilerRegistry.ts:33,181`), so a schema rebuilt on every call misses the cache. Severity drops to `warn`: the smell is a cache miss, and t3code runs the same rule at `warn`.
- `no-effect-never` is dropped (option C, pattern 13). No source calls `Effect.never` slop. v4 tests use it 163 times, and t3code uses it on purpose to keep an atom loading (`T3/packages/client-runtime/src/state/session.ts:126-133`) and a mock server alive (`T3/apps/server/scripts/acp-mock-agent.ts:779`). tsgo has no counterpart. The alternatives were keeping the ban with a written message, or flagging only the redundant `Effect.forever(Effect.never)`. The advice to prefer `Layer.launch` for long-running servers belongs in agent instructions, not lint.
- `no-string-sentinel-const` and `no-string-sentinel-return` are dropped, and a new rule flags `Effect.fail("string literal")` (option C, pattern 14). Upstream's intent (`biome-effect-linting-rules/rules/no-string-sentinel-const.grit`) was status strings used as control flow. The AST pattern matches every string `const` and every `Effect.succeed("…")`, including file paths and official service IDs, and the app run found one real sentinel among hundreds of hits. A string in the error channel is unambiguous and always worse than a tagged error, and tsgo's `globalErrorInEffectFailure` covers only `new Error(…)`. Agent instructions add a house-style line: model statuses and outcomes as `Schema.Literal` or tagged types, not ad-hoc strings. The new rule is `no-string-error-channel` in the `effect` preset at `error` (an untyped error channel is an agent failure mode under ADR-004). It matches a string literal or template literal as the sole `Effect.fail` argument, gated like the other Effect-callee rules.
- `no-nested-effect-gen` is replaced by tsgo's `nested-effect-gen-yield`, enabled at `error` (it is off by default). It flags exactly a bare `yield* Effect.gen(…)` inside an Effect generator, which resolves the round 1 narrowing question. The severity follows the pattern 1 research, which found nested gens called out as typical LLM output.
- tsgo's `catch-die-to-or-die` is turned off. It rewrites `Effect.catch((e) => Effect.die(e))` to `Effect.orDie`, which `no-effect-escape-hatch` bans.
- `no-match-void-branch` is dropped. It is a style opinion with no source, and it conflicts with tsgo's `effect-succeed-with-void`.
- `effect-no-multiple-provide`, `prefer-yield-tagged-error`, `no-effect-sync-console`, `no-effect-do`, `no-effect-async`, `no-effect-orElse-ladder`, and `no-wrapgraphql-catchall` are dropped in favor of their tsgo counterparts (tsgo coverage mapping). Each replacement ships at a severity no lower than the rule it replaces (`multiple-effect-provide`, `unnecessary-fail-yieldable-error`, `global-console-in-effect`, `effect-do-notation`, and `outdated-api` at `error`), even where tsgo's `recommended` preset ships them at `warn` or omits them. A test enforces the floor: each dropped manifest entry records `replacedBy`, and the shipped severity of each replacement must be at least the dropped entry's.
- Chained `.pipe(a).pipe(b)` is owned by tsgo's `unnecessary-pipe-chain` at `warn`. MP's agent-failure evidence covers nesting, not chaining; tsgo classes chaining as style (default `suggestion`), so ADR-004 puts it at the quieter level.
- The Effect preset requires the tsgo setup (`@effect/tsgo` installed and `effect-tsgo patch --no-typescript --oxlint` in `prepare`). Implementation must document this as required in the package README and agent-facing setup docs. A missing patch fails loudly: the preset's `effecttsgo/*` settings make an unpatched oxlint stop with `Unknown plugin: 'effecttsgo'`.
- `no-effect-call-in-effect-arg` is reworked (option C, pattern 9). It flags only a data-first transforming combinator (`map`, `flatMap`, `andThen`, `tap`, `flatten`, `catch*`, `zip*`) whose first argument is another Effect call, such as `Effect.map(Effect.flatMap(Effect.succeed(1), f), g)`. It never flags runners (`run*`), forks (`fork*`), or resource helpers (`acquireRelease`, `scoped`, `ensuring`), which the app run showed are idiomatic (`EX/apps/local/src/main.ts:178`, `T3/apps/mobile/src/connection/platform.ts:58`). The message should point to pipe style or `Effect.gen`. The off-preset `no-call-tower` and `no-nested-effect-call` are deleted. Implementation checks whether tsgo's `missed-pipeable-opportunity` (off by default, silent in the mapping run) covers the same cases once enabled; if it does, this rule can be dropped in its favor.
- `no-effect-succeed-variable` is dropped (option B, pattern 10). It flags harmless `Effect.succeed(value)` while allowing `Effect.succeed(makeValue())` (`rule-catalog.ts:1700-1704`), the eager-evaluation bug the research names, and it fights tsgo's `sync-to-succeed`. The preset enables tsgo instead: `global-date-in-effect`, `global-random-in-effect`, and `crypto-random-uuid-in-effect` at `error`; their outside-Effect siblings `global-date`, `global-random`, and `crypto-random-uuid` at `warn`; `promise-in-effect-success` (a Promise stuck in the success channel) at `error`; and `effect-succeed-with-void` plus `prefer-succeed-some-or-none` at `warn`. No new custom rule: every low-false-positive eager case found (`Date.now()`, `Math.random()`, `crypto.randomUUID()`, a Promise) already has a type-aware tsgo rule, and a generic impure-call check cannot tell `makeValue()` from `Option.some(1)`.
- `warn-effect-sync-wrapper` is dropped (option B, pattern 11). Wrapping a synchronous, non-throwing side effect is the intended use of `Effect.sync` (189 uses in `EF/test`, `RcRef.test.ts:77`), and the rule is evaded by a block-bodied arrow (`rule-catalog.test.ts:742`). The preset enables tsgo instead: `lazy-promise-in-effect-sync` at `error` (a Promise inside `sync` escapes Effect error handling), plus `sync-to-succeed` and `schema-sync-in-effect` at `warn`. Throwing `JSON.parse` inside `sync` stays covered by `no-json-parse`.
- `no-naked-object-state-update` is deleted (pattern 16). Its JSON branch flagged every `JSON.stringify` in an Effect-importing file (694 of 747 T3 hits and all 985 EX hits were plain stringify calls); tsgo's `prefer-schema-over-json` is its candidate replacement; it fires inside Effect code, and points to `Schema.fromJsonString`, `Schema.UnknownFromJsonString`, or `Schema.toCodecJson`. `JSON.parse` stays covered by `no-json-parse`. Its spread-update branch has no supporting evidence: spread is Effect's own baseline (`Struct.assign` is implemented as `{ ...self, ...that }`, `EF/src/Struct.ts:258,285`), and Grok research found no receipts calling it slop. The one real hazard, spreading a `Schema.Class` instance into a plain object, needs type information, so it becomes an agent house-style line: rebuild `Schema.Class` values with `MyClass.make(…)`, not object spread. `prefer-schema-over-json` ships only after the repeatable app run counts its hits: `warn` if the count is small, `off` if it reproduces the stringify noise. `no-json-parse` stays at `error` either way.
- `no-return-null` is narrowed and lowered to `warn` (option C, pattern 17). It flags `return null` inside `Effect.gen`/`Effect.fn` generators and `Effect.succeed(null)` only. The message points to `Option.none()` / `Effect.succeedNone`, with `Option.fromNullishOr` / `Option.getOrNull` at boundaries. React components returning `null` (`T3/apps/web/src/components/preview/PreviewAutomationHosts.tsx:278`) and `T | null` boundary helpers (`EX/apps/cli/src/main.ts:2428`) are no longer flagged. The severity is `warn` because this is a style preference under ADR-004.
- `no-fromnullable-nullish-coalesce` is retargeted to v4's `Option.fromNullishOr(x ?? null)` and `Option.fromUndefinedOr(x ?? undefined)` (`EF/src/Option.ts:773,807`). t3code has a live case under the v4 name (`T3/apps/desktop/src/window/DesktopWindow.test.ts:350`), and tsgo does not cover it.
- `no-atom-registry-effect-sync` is retargeted to the v4 Atom module `effect/reactivity/Atom` and stays at `error`. Its `atomRegistry` branch is removed, because `AtomRegistry.set/get/update/modify` are synchronous in v4 (`EF/src/reactivity/AtomRegistry.ts:74-80`). v4 `Atom.get/set/update/modify/refresh` return Effects (`EF/src/reactivity/Atom.ts:2428-2513`), so `Effect.sync(() => Atom.set(count, 1))` builds an Effect that never runs. A scratch run showed tsgo 0.45.0 does not flag it. New message: `Atom.set` returns an Effect; `yield*` it instead of wrapping it in `Effect.sync`.
- `no-runtime-runfork` is dropped. `Runtime.runFork` is gone in v4, and tsgo's `run-effect-inside-effect` flags `Effect.runFork` inside Effect code (verified in a scratch run). `Effect.forkDetach` has legitimate uses in both apps, so it is not retargeted without research. `run-effect-inside-effect` ships at `error`; taste-distillery TD-CARD-024 keeps `Effect.run*` at composition roots or tests.
- `no-family-collection-read` is dropped. It detects row-reads-collection atoms by upstream's naming convention (`rule-catalog.ts:53`, names ending in `CollectionAtom`, `ListAtom`, `ResultsAtom`, and similar), which MP's projects do not use; both apps had zero hits.
- `no-inline-runtime-provide` is dropped in favor of tsgo's `strict-effect-provide`, enabled at `error` in the `effect` preset and turned off for test files. Entry points that provide layers use a justified inline disable, matching the `no-effect-escape-hatch` pattern. tsgo's rule is type-aware and fires only on Layers, which removes the false alarms on context built inside the same generator (`T3/packages/client-runtime/src/rpc/session.ts:210-213`). The backpressure rule also skipped the bare `yield* runtime.pipe(Effect.provide(Live))` form (`rule-catalog.test.ts:521`).
- `no-barrel-import` stays. MP rejects barrel imports (ADR-001 already records this rule as a deliberate exception). Agent instructions must tell agents to translate `import { Effect } from "effect"` in reference snippets into subpath imports (`import * as Effect from "effect/Effect"`). The v4 tests use both styles (280 barrel files vs 105 subpath files). effect-solutions uses only the barrel (26 vs 0), executor mostly the barrel (384 vs 72), and t3code mostly subpaths (7 vs 1529).

## Options considered

MP prefers the best option over the cheapest one when options differ in quality; effort is not a reason to pick a weaker option. The Decided list records MP's choice. The design review may recommend a different option when it has evidence-backed reasons. These tables list the options that were on the table.

### `no-effect-escape-hatch` (pattern 4): chose A

| Option | Effect | Work |
|---|---|---|
| A. Keep the ban, remove dead names, write a real message | Agents add a justified inline disable at each legitimate use, as executor does | Small |
| B. A plus an entry-files setting | Entry files such as `src/main.ts` are allowed automatically | Medium: new config option |
| C. Drop | `orDie` allowed anywhere, including mid-app error hiding | None |

Reason: hiding recoverable errors is an agent failure mode, and executor runs this ban with only 18 justified exceptions. Option B was revisited and rejected on merits: oxlint `overrides` already let a project turn the rule off for chosen files without new rule code, a file-wide exemption lets any `orDie` in that file through unreviewed, and legitimate defects (bugs, impossible states, `ES/…/06-error-handling.md:190`) are not limited to entry files. The rule message should mention the `overrides` route for projects that want an entry file exempt.

### `no-manual-tag-check` (pattern 5): chose B

| Option | Effect | Work |
|---|---|---|
| A. Keep as-is with a better message | Even logging `e._tag` is an error | Small |
| B. Flag comparisons only | Branching on tags is flagged; reads such as logging are allowed | Small to medium: remove the read branch, add tests |
| C. Drop | Hand-written tag ladders allowed | None |

Reason: research names tag branching as the smell, and blocking harmless reads trains agents to disable the rule.

### `no-unknown-error-message` (pattern 6): chose C

| Option | Effect | Work |
|---|---|---|
| A. Keep as-is | Flags typed errors whose variable is named `e`/`error` | None |
| B. Adopt executor's later `catchTag`/`catchTags` exemption | Current upstream behavior; still guesses by variable name elsewhere | Small |
| C. Flag only `catch (e)` clause parameters and `Effect.try`/`tryPromise` `catch:` callback parameters | Targets exactly where values are `unknown` | Medium: new matching logic |
| D. Drop and rely on the language service | Type-aware, but checks the callback's return type rather than `.message` reads, and only reaches agents when `tsc` is patched | None |

Reason: C is the most precise option, and the name heuristic misfires on typed errors.

### `no-pipe-ladder` (pattern 8): decided from first principles

| Option | Effect | Work |
|---|---|---|
| A. Keep as-is | Schedule/Layer/Schema nesting flagged; chained pipes allowed | None |
| B. Flag only nested pipes whose steps are `Effect.*` calls | Callback nesting flagged; normal Schedule/Layer/Schema nesting allowed | Medium: classify pipe steps by module name |
| C. Drop | Nothing flagged | None |
| D. B plus flag chained `.pipe(a).pipe(b)` | Also mirrors the language service's `unnecessaryPipeChain` suggestion at lint time | Medium |

Reason: MP's concern is that agent output drifts toward try/catch and defensive coding, and he treats nested try/catch, callback hell, and nested pipes as the same problem. None of the options above matched that concern: they classify pipes by module name, not by what makes nesting hard to read. The decision (2026-09-27) derives the rule from first principles in `docs/analysis/effect-nesting-rules-first-principles.md` and uses the reference repos only as checks.

### `no-react-state` (pattern 15): chose B

| Option | What is banned | Tradeoff |
|---|---|---|
| A. Keep as-is (PA-3) | All six hooks | Per-instance UI state needs `Atom.family` or `ScopedAtom` ceremony; stricter than both atom-heavy apps |
| B. Ban all except `useState` | `useEffect`, `useReducer`, `useContext`, `useCallback`, `useSyncExternalStore` | Context moves to `ScopedAtom`; only component-local state uses `useState` |
| C. Ban all except `useState` and `useContext` | The other four | Allows context even though `ScopedAtom` replaces it and avoids re-rendering every consumer |

Reason: the discourse against React hooks targets `useEffect` and server data held in client state, not local UI state. `ScopedAtom` is a direct replacement for `useContext`.

### `no-effect-call-in-effect-arg` (pattern 9): chose C

| Option | Effect | Work |
|---|---|---|
| A. Keep as-is | Flags idiomatic `runPromise(Effect.gen(…))`, `forkChild(Effect.gen(…))`, `acquireRelease(Effect.sync(…))` | Message only |
| B. Keep with an exemption list | Works, but the list grows with each new idiomatic case | Medium |
| C. Flag only data-first transforming combinators with an Effect-call first argument | Targets inside-out chains and never touches runners, forks, or resource helpers | Medium |
| D. Drop and rely on tsgo `missed-pipeable-opportunity` | Unproven: it did not fire on these shapes in the mapping run | None |

Reason: C describes the smell directly instead of chasing exceptions.

### Earlier yes/no decisions

- `no-manual-effect-channels`, `no-effect-type-alias`: the alternative was keeping a narrowed ban (such as only a bare `type X = Effect.Effect<…>`). Rejected because MP prefers explicit types.
- `no-return-in-callback`: the alternative was fixing the generator bug. Rejected because the rule has no documented intent to preserve.
- `no-return-in-arrow`: the alternative was a style hint toward one-line handlers. Rejected because no source calls early returns slop.
- `no-effect-wrapper-alias`: the alternative was keeping it as a hint toward `Effect.fn`. Rejected because `prefer-effect-fn` already covers the case the research supports.

## Evidence

### Method (verified)

On 2026-09-25, a RepoPrompt agent ran all 63 active rules (66 in the manifest minus 3 dropped) through oxlint's `RuleTester`. It used 45 snippets, most copied from effect-solutions docs and tests and from the v4 tests. A hit means the rule actually reported on a snippet. Controls behaved as expected: `Effect.Do` fired `no-effect-do`, and the v3 Atom import path fired `no-atom-registry-effect-sync` while the v4 path did not. Presets set severity only and pass no rule options, so testing each rule on its own matches preset behavior. The harness lived in a session scratchpad and is gone. To reproduce, load `catalogRules` from `src/rule-catalog.ts` into oxlint's `RuleTester` from `oxlint/dist/plugins-dev.js`, and run each rule as `valid` over the reference snippets cited below.

Shorthand: `ES/` = effect-solutions, `EF/` = `effect/packages/effect`, `RC` = `packages/oxlint-standards/src/rule-catalog.ts`.

### Summary counts (verified by execution)

| Bucket | Count | Meaning |
|---|---|---|
| Conflict | 19 | Fires on idiomatic reference code (one is `no-barrel-import`, now decided) |
| Stale v3 | 7 | Matches only names removed in v4, so it never fires |
| Stricter but compatible | 27 | More opinionated than upstream, contradicts nothing |
| Aligned | 10 | Encodes reference guidance |

The `effectVersionSensitivity` manifest field reads `structural` or `v4-primary structural` for every rule, including all 7 stale ones, so it carries no signal today.

### Conflicts

Evidence is verified; dispositions are agent opinion, for the review to decide.

| Rule | What it flags | Reference evidence | Suggested disposition (opinion) |
|---|---|---|---|
| `no-manual-effect-channels` (`RC:2643-2671`) | Any `Effect.Effect<…>` / `Layer.Layer<…>` with type arguments outside a type alias | `ES/…/04-services-and-layers.md:27-28,94-95,107,113,365` (service interface members, return annotations) | Drop or narrow heavily. With `no-effect-type-alias` it bans every explicit Effect type |
| `no-return-in-callback` (`RC:2902-2921`, walker `RC:375-392`) | Every `return` inside `Effect.gen`/`Effect.fn` generators, because generators are treated as callbacks. Its tests never cover generators (`rule-catalog.test.ts:661-670`) | `ES/…/04-services-and-layers.md:123-126`, `ES/tests/03-basics.test.ts:82-85` | Bug. Exclude generators, or drop |
| `no-return-in-arrow` (`RC:3178-3200`) | `return` in block-bodied call-argument arrows, including returns that belong to a generator nested inside the arrow | `ES/…/04-services-and-layers.md:113-121`, `ES/…/06-error-handling.md:108-112` | Narrow. The `Schema.filter` exemption (`RC:349-362`) is stale, since v4 has `Schema.check`/`makeFilter` |
| `no-nested-effect-gen` (`RC:2748-2778`) | Any `Effect.gen` with a descendant `Effect.gen` | `ES/…/13-cli.md:265-276` (layer helpers), `EF/test/Metric.test.ts:358` (`Effect.forkChild(Effect.gen(…))`) | See the round 1 section |
| `no-effect-wrapper-alias` (`RC:2390-2437`) | Const arrows whose body is an Effect constructor or pipe | `ES/…/06-error-handling.md:228-236` (`const fetchUser = (id) => Effect.tryPromise(…)`) | Narrow to plain aliases |
| `no-pipe-ladder` (`RC:2817-2850`) | Any pipe step containing another `.pipe(…)` | `ES/…/03-basics.md:94` (`Schedule.exponential(…).pipe(Schedule.both(…))` inside `Effect.retry`) | Narrow to Effect-in-Effect pipes. Without types this is a callee-name heuristic |
| `no-effect-call-in-effect-arg` (`RC:2195-2224`) | An Effect call with an Effect call as an argument | `EF/test/Metric.test.ts:358`, `EF/test/Cause.test.ts:657`; also fires on `Effect.runPromise(Effect.gen(…))` | Narrow: exempt `run*`, `fork*`, gen/fn arguments |
| `no-call-tower` (`RC:2057-2079`) | Same shape, no exemptions; in no preset | Same as above | Drop |
| `no-effect-as` (`rules/effect/no-effect-as-internal.ts:19-50`) | `Effect.as(x)` | `ES/tests/03-basics.test.ts:201`, 119 uses in `EF/test` (`Effect.test.ts:3613-3616`). It also misses the named barrel import (BP-TD-010) | Drop |
| `no-effect-succeed-variable` (`RC:2318-2343`) | `Effect.succeed(x)` for identifiers and most literals | `ES/tests/03-basics.test.ts:83` | Drop. It has no stated rationale |
| `warn-effect-sync-wrapper` (`RC:3046-3075`) | `Effect.sync(() => someCall())` | 189 uses in `EF/test` (`RcRef.test.ts:77`); same shape at `ES/packages/cli/src/cli.ts:113` | Drop |
| `no-effect-never` (`RC:2271-2289`) | Every `Effect.never` | 163 uses in `EF/test` (`RcRef.test.ts:340`); ES silent. Weakest conflict | Narrow to a named misuse, or drop |
| `no-effect-escape-hatch` (`RC:2496-2518`) | `die`, `dieMessage`, `orDie`, `orDieWith` outside tests | `ES/…/06-error-handling.md:188-201` recommends `Effect.orDie` at the app entry. `dieMessage`/`orDieWith` do not exist in v4 | Allow `orDie` at entry points (needs a file-glob setting); remove dead names |
| `no-manual-tag-check` (`RC:3430-3470`) | Any `._tag` read or comparison | `ES/…/06-error-handling.md:111`, `ES/…/04-services-and-layers.md:115`, `ES/tests/07-config.test.ts:179,263` | Drop the bare-read branch. Judging a comparison needs types |
| `no-unknown-error-message` (`RC:3494-3530`) | `.message`/`String(x)` on variables named `e`, `err`, `error`, `cause`, `reason` | `ES/…/06-error-handling.md:141` (typed `HttpError` in `catchTag`) | Needs types. Scope to `catch` clauses and `Effect.try*` `catch:` callbacks, or hand to `@effect/language-service` |
| `no-string-sentinel-return` (`RC:2982-3004`) | `Effect.succeed("literal")` | `ES/…/06-error-handling.md:180-181` | Needs meaning, not shape. Probably drop |
| `no-string-sentinel-const` (`RC:2963-2981`) | Every `const x = "…"` in an Effect-importing file | `ES/…/13-cli.md:268`, `ES/…/05-data-modeling.md:174` | Drop |
| `no-inline-schema-compile` (`RC:3076-3106`) | `Schema.decode*(S)(x)` invoked inline | `ES/…/05-data-modeling.md:176,181`, `ES/…/13-cli.md:271`. Its "repeats work" rationale is false in v4: compiled parsers are cached per schema (`EF/src/internal/schema/compilerRegistry.ts:33`) | Drop, or keep as style with the performance claim removed |

### Stale v3 (verified: these never fire on v4 code)

| Rule | v3 name it matches | v4 name | Suggested disposition (opinion) |
|---|---|---|---|
| `no-effect-async` (`RC:2151-2172`) | `Effect.async` | `Effect.callback` (`EF/src/Effect.ts:1228`) | Retarget if the intent (prefer promise wrappers) still holds |
| `no-effect-orElse-ladder` (`RC:2290-2317`) | `Effect.orElse`, `zipRight` | `Effect.catch`, `andThen` | Drop or retarget |
| `no-wrapgraphql-catchall` (`RC:3021-3045`) | `Effect.catchAll` | `Effect.catch` (`EF/src/Effect.ts:2693`) | Retarget or drop as project-specific |
| `no-runtime-runfork` (`RC:2944-2962`) | `Runtime.runFork` | none; use `Effect.runFork` or a `ManagedRuntime` instance | Retarget or drop |
| `no-fromnullable-nullish-coalesce` (`RC:2579-2600`) | `Option.fromNullable` | `Option.fromNullishOr` (`EF/src/Option.ts:773`) | Retarget |
| `no-atom-registry-effect-sync` (`RC:1977-2015`) | `@effect-atom/atom-react` | `effect/reactivity/Atom` | Retarget the shared import list |
| `no-family-collection-read` (`RC:2547-2578`) | `@effect-atom/atom-react` | `effect/reactivity/Atom` (`Atom.family` at `EF/src/reactivity/Atom.ts:1413`) | Same fix as above |

ADR-001 already puts v3 spellings out of v0 scope, so these rules are inconsistent with the repo's own posture.

Dead v3 branches inside compatible rules: `Either` branches (`no-branch-in-object`, `RC:2025`), `zipRight` (`no-effect-side-effect-wrapper`), the Cause and Either tag entries (`no-effect-internal-tags`, `RC:1473-1482`), and the old `effect/Reactivity` path (`no-effect-all-step-sequencing`, `RC:2123`).

### Stricter but compatible (27)

`no-effect-do`, `no-effect-bind`, `no-effect-type-alias`, `no-switch-statement`, `effect-no-multiple-provide` (its "defeats Layer memoization" message is overstated in v4, see `EF/src/Layer.ts:582-586,697-704`), `no-effect-side-effect-wrapper`, `no-effect-all-step-sequencing`, `no-branch-in-object`, `no-effect-internal-tags`, `no-iife-wrapper`, `no-arrow-ladder`, `no-effect-ladder`, `no-flatmap-ladder`, `no-nested-effect-call`, `no-option-as`, `no-option-boolean-normalization`, `no-instanceof-error`, `no-instanceof-tagged-error`, `no-redundant-error-factory`, `no-match-void-branch`, `no-match-effect-branch`, `no-return-null`, `no-unknown-boolean-coercion-helper`, `no-model-overlay-cast`, `no-inline-runtime-provide`, `no-react-state`, `no-naked-object-state-update`.

### Aligned (10)

`prefer-effect-fn`, `no-effect-sync-console`, `no-try-catch`, `no-promise-catch`, `no-promise-reject`, `prefer-yield-tagged-error`, `no-json-parse`, `prefer-schema-inferred-types`, `prefer-effect-predicate`, `no-render-side-effects`.

### Delegation route verification (2026-09-25)

Scratch pnpm projects with `effect@4.0.0-rc.117`, `@effect/tsgo@0.45.0`, and `vite-plus@0.3.2`:
- `effect-tsgo patch --oxlint` patched vite-plus's nested oxlint 1.82.0 and `oxlint-tsgolint@7.0.2001`. `vp lint` then reported `effecttsgo(...)` diagnostics, and a diagnostic set to `error` made it exit 1.
- The local `oxlint-standards` build and the `effecttsgo` rules reported together in one `vp lint` run.
- The oxlint route works on TypeScript 6.0.2 with `--no-typescript`. The tsc route needs TypeScript 7 (7.0.2 tested). It reported the diagnostics as `tsc` errors with exit 1, and plugin settings in a base tsconfig applied through `extends`.
- On a version mismatch (vite-plus 1.0.0-rc.0 bundles oxlint 1.85.0), the patch exits 1 with `UnsupportedTargetPackageVersionError`, and `vp lint` fails with `Unknown plugin: 'effecttsgo'`. A mismatch fails loudly, never silently.
- Supported versions move in lockstep: `@effect/tsgo` 0.45.0 supports oxlint 1.81 and 1.82 (vite-plus 0.3.1 and 0.3.2) and TypeScript 7.0.2 and 7.1.0-dev.20260909.1.

### Language-service delegation does not reach agents (verified)

ADR-001 delegates type-aware Effect checks to the consumer's `@effect/language-service`, and the package README lists 13 such checks. The language service loads only inside an editor: its README (`effect-ts/language-service/README.md:230`) says running `tsc` skips the plugin. MP's agents run without an editor, so those checks never reach them. The fix exists upstream: `effect-language-service patch` patches the project's TypeScript so the diagnostics appear in `tsc` and typecheck runs (`README.md:233-258`), made persistent through the `prepare` script. The package README (`packages/oxlint-standards/README.md:109-155`) documents only the editor plugin setup. Any disposition that relies on the language service depends on wiring it into a command agents run. Non-editor routes found on 2026-09-25 (language-service checkout 2026-04-02, tsgo checkout 2026-04-04):
- `effect-language-service diagnostics --project tsconfig.json` reports diagnostics without patching (`README.md:273-274`, `src/cli/diagnostics.ts:289-325`). Errors fail the command; warnings fail only with `--strict`; suggestions never fail.
- `@effect/tsgo`: after `effect-tsgo patch`, a normal `tsgo --noEmit` or `tsgo -b` typecheck reports the diagnostics (`tsgo/_packages/tsgo/src/cli.ts:158-211`). It ships `effectMapVoid`, `unknownInEffectCatch`, and `globalErrorInEffectCatch` (`tsgo/internal/rules/rules.go:11-24`).
- Ecosystem practice: the Effect monorepo, effect-smol, t3code, and executor all run a patch step in `prepare` (`effect-tsgo patch`, and executor also `effect-language-service patch`), then surface diagnostics in their normal typecheck.

### Rule ownership hand-offs (verified)

Several rules skip code that they treat as owned by another rule (`isInAnyWrapperOwnedExpression` and similar guards). One case: `no-pipe-ladder` leaves `const run = pipe(pipe(Effect.succeed(1), f), g)` to `no-effect-wrapper-alias` (`rule-catalog.test.ts:636-637`), which is now dropped. Implementation must audit every ownership guard that points at a dropped or narrowed rule, so that no case silently loses coverage.

### Missing rationale

Many rules have no explicit message in `src/rule-messages.ts`, so their "why" comes from a generated phrase such as `avoid return in callback`. For those rules, the intended smell has to be recovered before anyone can decide whether a narrowed version still catches it.

## Round 1: `no-nested-effect-gen`

Verified locally:
- `EF/../../LLMS.md:14-17,60`: use `Effect.gen` for inline code and `Effect.fn` for reusable functions, and avoid functions that only wrap and return an `Effect.gen`.
- `prefer-effect-fn` (`RC:3675`) already targets named `(…) => Effect.gen` wrappers, so this rule does not need to cover them.
- effect-solutions itself has a wrapper that goes against `LLMS.md`: `const save = (list) => Effect.gen(…)` at `ES/…/13-cli.md:276`.

External research (Grok summary of x.com, not verified by the agent):
- Nested bare `Effect.gen` is called out as typical LLM output: https://x.com/gnarledoctopus/status/2083582119947977147
- Core team: "if you are creating a function you should use Effect.fn": https://x.com/MichaelArnaldi/status/2018238586940710990 and "gen creates an effect, fn creates a function": https://x.com/MichaelArnaldi/status/1936834193020813657
- tsgo's `nestedEffectGenYield` (`nested-effect-gen-yield`) exists in `@effect/tsgo@0.45.0`, off by default. The earlier check against a stale language-service checkout missed it.

Resolved: the rule is replaced by tsgo's `nested-effect-gen-yield` (see Decided), which flags only a bare `yield* Effect.gen(…)` and allows piped nested gens.

## tsgo coverage mapping (verified 2026-09-25)

A RepoPrompt agent ran every backpressure Effect rule and all 113 `@effect/tsgo@0.45.0` oxlint rules on the same snippets, using the patched oxlint 1.82.0 from vite-plus 0.3.2. Severities and presets come from the 0.45.0 tag (`git show @effect/tsgo@0.45.0:docs/rules/*.md`). The local tsgo checkout is 12 commits past the tag: it adds 3 rules and a `strict` preset, and moves 22 effect-native rules out of `recommended`.

| Bucket | Count | Rules |
|---|---|---|
| Covered | 8 | `effect-no-multiple-provide` → `multiple-effect-provide`; `prefer-yield-tagged-error` → `unnecessary-fail-yieldable-error`; `no-effect-sync-console` → `global-console-in-effect`; `no-effect-do` → `effect-do-notation`; `prefer-effect-fn` → `effect-fn-opportunity` (needs plugin setting `"effectFn": ["span", "inferred-span", "suggested-span"]`); `no-effect-async`, `no-effect-orElse-ladder`, `no-wrapgraphql-catchall` → `outdated-api` (flags the v3 names on v4 code) |
| Partly | 15 | `no-try-catch`, `no-promise-reject`, `no-manual-tag-check`, `no-switch-statement`, `warn-effect-sync-wrapper`, `no-nested-effect-gen`, `no-effect-bind`, `no-iife-wrapper`, `no-return-in-arrow`, `no-flatmap-ladder`, `no-pipe-ladder`, `no-json-parse`, `no-model-overlay-cast`, `no-inline-runtime-provide`, `no-naked-object-state-update` |
| Conflict | 6 | See below |
| Not covered | 37 | The rest, including all Atom/React rules, `no-barrel-import`, `no-unknown-error-message`, `no-inline-schema-compile` |

Where tsgo has a counterpart, its type-aware version is strictly better: `multiple-effect-provide` fires only on chained Layers, not Context values. `unnecessary-fail-yieldable-error` decides yieldability from types, so it catches `Effect.fail(new NotFound())` and skips `Effect.fail(new TypeError(…))`. Most partly covered gaps are the same smell outside an Effect context, where tsgo does not look.

Conflicts (a tsgo fix produces code that a backpressure rule flags):
- `no-effect-escape-hatch` vs `catch-die-to-or-die`: tsgo rewrites `Effect.catch((e) => Effect.die(e))` to `Effect.orDie`.
- `no-effect-succeed-variable` and `no-string-sentinel-return` vs `sync-to-succeed`: tsgo rewrites `Effect.sync(() => 1)` to `Effect.succeed(1)`.
- `no-match-void-branch` vs `effect-succeed-with-void`: tsgo rewrites a Match branch to `Effect.void`.
- `no-return-in-callback` vs `missing-return-yield-star`, and `no-effect-fn-generator` vs `effect-fn-opportunity`: already resolved by dropping the backpressure side.

No tsgo rule contradicts a Decided item: none opposes explicit annotations or prefers barrel imports, and none covers React state.

Language-service-owned checks: 12 of the 13 listed in `lspOwnedChecks` exist in tsgo under the same name. `importFromBarrel` does not exist as a rule, so `no-barrel-import` is the only enforcement. `missingEffectServiceDependency` is v3-only.

tsgo adds 81 rules with no backpressure counterpart. High-value correctness rules on by default include `floating-effect`, `missing-effect-error`, `missing-effect-context`, `missing-layer-context`, and `missing-star-in-yield-effect-gen`.

## Provenance: upstream versus port (verified)

On 2026-09-25 a RepoPrompt agent compared each of the 32 flagged rules with its upstream source: linteffect `13f1a33`, executor `766c7903c` (the last pre-port commit touching these rules, on branch `backup/main-pre-reset-2026-09-25`), t3code `825263b6f`, and the effect-smol working tree. It ran the upstream and ported rules side by side where the behavior was in question.

| Bucket | Count | Meaning |
|---|---|---|
| Inherited | 23 | Upstream behaves the same way |
| Inherited v3 names | 5 | `no-effect-async`, `no-effect-orElse-ladder`, `no-wrapgraphql-catchall`, `no-runtime-runfork`, `no-fromnullable-nullish-coalesce` copy names absent from v4 |
| Port drift | 3 | Backpressure behaves differently from upstream |
| Backpressure original | 1 | `prefer-effect-fn` |

Port drift and port regressions:
- `no-return-in-callback`: upstream never matches returns inside `Effect.gen`/`Effect.fn` generators. The port does, and that accounts for the ~11k app hits. The port also dropped upstream's carve-out saying leaf-level Effect branches may use returns.
- `no-atom-registry-effect-sync` (Atom branch) and `no-family-collection-read`: upstream matches by text and fires on v4 `effect/reactivity/Atom` code. The port tied both to the v3 `@effect-atom/atom-react` import.
- `no-barrel-import`: effect-smol applies it to library source only and turns it off for tests, examples, and AI docs. Backpressure applies it everywhere, by decision (ADR-001).
- Messages: upstream rules carry a why and a fix. The port kept only the `no-effect-as` message verbatim; the rest fall back to the generic phrase.
- Scope: the 26 linteffect-derived rules upstream only check files with a barrel `"effect"` import, so upstream never linted subpath-import code such as t3code's. Its track record says little about that style, which is the one `no-barrel-import` now requires.

Other notes:
- executor's rules already had the dead `dieMessage`/`orDieWith` names and the bare `._tag` read ban. executor turns rules off by file path for CLI, scripts, and runtime code, and backpressure did not carry that scoping over.
- The false "rebuilt on every call" claim in `no-inline-schema-compile` comes from t3code; the only drift is severity (t3code `warn`, backpressure `error`).

## App evidence: t3code and executor

### Method (verified)

On 2026-09-25, a RepoPrompt agent ran the oxlint 1.58.0 CLI over each app's real source, using the built plugin (`packages/oxlint-standards/dist`) with only the 63 active rules plus the two off-preset rules enabled. `node_modules`, `dist`, vendored upstreams, generated files, and `*.d.ts` were excluded. Both apps are on v4, so the stale-v3 verdicts hold for them.

| App | Commit | Effect | Files | Diagnostics | Import style |
|---|---|---|---|---|---|
| t3code (`T3/`) | `53456bc01` | `4.0.0-rc.115` | 3,842 | 34,030 | `effect/*` subpaths |
| executor (`EX/`) | `480b390ee` | `4.0.0-beta.59` | 1,940 | 13,667 | `effect` barrel |

executor already lints itself with its own versions of 16 of these rules (`EX/.oxlintrc.jsonc`, `EX/scripts/oxlint-plugin-executor/rules/`), the source many of backpressure's rules were ported from. Its low counts on those rules reflect compliance, through 6 path overrides and about 800 inline disables, not a blind spot.

### Highest-volume hits

`src / test` diagnostics per app:

| Rule | T3 | EX | Verdict |
|---|---|---|---|
| `no-return-in-callback` | 6947 / 1850 | 1704 / 781 | Conflict (confirmed) |
| `no-return-in-arrow` | 3755 / 2305 | 968 / 791 | Conflict, broader than first found. It also flags plain non-Effect callbacks (`T3/apps/web/src/components/Sidebar.tsx:3567`) |
| `no-react-state` | 3040 / 12 | 572 / 22 | Narrowed (pattern 15); `useState` hits no longer count |
| `no-manual-effect-channels` | 2321 / 213 | 1050 / 211 | Conflict (confirmed) |
| `no-manual-tag-check` | 1351 / 1250 | 3 / 15 | Conflict, split between apps |
| `no-naked-object-state-update` | 289 / 458 | 182 / 803 | New conflict |
| `no-string-sentinel-const` | 421 / 657 | 211 / 406 | Conflict (confirmed) |
| `no-barrel-import` | 3 / 3 | 799 / 841 | Split. Kept as decided |

The app run confirmed 15 of the 19 conflicts. Of the other four, `no-barrel-import` and `no-manual-tag-check` split between the apps, and `no-inline-schema-compile` and `no-effect-never` changed verdict. It also confirmed all 7 stale-v3 verdicts: those rules have 0 hits while the apps use the v4 names (`Effect.callback` 34 / 21 times, `Effect.catch` 246 / 120 times, `Atom.family` 100 / 14 times). 16 rules have 0 hits in both apps.

### New or changed verdicts (verified hits; dispositions are agent opinion)

| Rule | Change | Evidence | Suggested disposition |
|---|---|---|---|
| `no-naked-object-state-update` | Compatible → conflict | 694 of 747 T3 hits and all 985 EX hits are plain `JSON.stringify` (cache keys, CLI output, JSON-RPC bodies) | Drop the stringify branch |
| `no-return-null` | Compatible → partial conflict | Flags React components that render nothing (`T3/apps/web/src/components/preview/PreviewAutomationHosts.tsx:278`) | Exempt `.tsx` components |
| `no-effect-type-alias` (`RC:2376-2380`) | Compatible → conflict | Flags any `Effect.Effect` anywhere inside a type alias, mostly service-shape members (`T3/apps/server/src/provider/Services/ProviderAdapter.ts:41`). With `no-manual-effect-channels`, no written Effect type is allowed anywhere, and the apps have about 3,900 of them | Drop, or limit to a top-level `type X = Effect.Effect<…>` |
| `no-inline-runtime-provide` (`RC:939-969`) | Compatible → partial conflict | Flags context built inside the same generator (`T3/packages/client-runtime/src/rpc/session.ts:210-213`) and per-test layers (374 T3 test hits) | Exempt tests and same-generator values |
| `no-atom-registry-effect-sync` | Stale v3 → conflict | Its one live branch flags `atomRegistry.set(...)` inside `Effect.sync`, but `AtomRegistry.set/get/update/modify` are synchronous in v4 (`EF/src/reactivity/AtomRegistry.ts:74-80`), so the flagged code is correct (`T3/packages/client-runtime/src/state/server.ts:890-898`) | Delete that branch; retarget the Atom branch |
| `no-inline-schema-compile` | Conflict → opt-in style | t3code ships its own identical rule at `warn` (`T3/oxlint-plugin-t3code/rules/no-inline-schema-compile.ts:12-21`). executor decodes inline (`EX/packages/core/config/src/load.ts:44`) | Opt-in style rule with a softened message |
| `no-unknown-error-message` | Fix changes | executor's current rule exempts `catchTag`/`catchTags` handler parameters (`EX/scripts/oxlint-plugin-executor/rules/no-unknown-error-message.js:27-60`). executor added that exemption on 2026-06-08, after the port (`491deb1`, 2026-05-31), so backpressure's copy went stale rather than drifting. 22 false hits in EX | At minimum restore that exemption |
| `no-effect-never` | Narrowing fix rejected | `return Effect.never` inside `runtime.atom(...)` keeps an atom loading on purpose (`T3/packages/client-runtime/src/state/session.ts:126-133`) | Drop |
| `no-manual-tag-check` | Split | executor enforces an identical rule with 18 hits, all exempt or disabled inline. t3code writes 2,601, including the effect-solutions pattern `error.reason._tag === "NotFound"` | Drop the bare-read branch; keep comparisons as a suggestion |

More exemption evidence:
- `no-effect-call-in-effect-arg` needs `scoped`, `acquireRelease`, `ensuring`, `flip`, `forkIn`, and `forkScoped` exempted as well (`T3/apps/mobile/src/connection/platform.ts:58`).
- `no-fromnullable-nullish-coalesce` misses a real target under the v4 name: `Option.fromNullishOr(created[0] ?? null)` at `T3/apps/desktop/src/window/DesktopWindow.test.ts:350`.
- `no-effect-succeed-variable` conflicts with v4's own API, `Schema.withDecodingDefault(Effect.succeed(false))` (`T3/apps/server/src/textGeneration/TextGenerationPrompts.ts:325`).

### Cross-cutting findings (verified)

- **Two rules contradict each other.** `prefer-yield-tagged-error` tells agents to write `return yield* new XError(…)`, and `no-return-in-callback` then flags that `return` (`T3/apps/server/src/project/AgentSessionImporter.ts:219`).
- **No fix guidance.** Only 16 effect-domain rules have written messages. The rest print a generic `avoid X` phrase, which gives an agent nothing to act on.
- **No boundary scoping.** Both apps mix React, Electron, CLI, and promise-adapter code into Effect-importing files. The preset has no scoping for boundary code, and the README's `src/**/*.ts` override example applies every rule there.
- **Rules that caught mostly real smells in the apps:** `no-json-parse`, `prefer-schema-inferred-types`, `prefer-effect-predicate`, `prefer-yield-tagged-error`, `no-effect-sync-console`, and mostly `no-model-overlay-cast`.

### After-change run (verified 2026-09-26)

The repeatable app audit replayed both snapshots after the rule rework; [the app audit report](../../reports/effect-v4-app-audit-2026-09-25.md) holds the per-rule tables, coverage, fingerprints, and every reviewed JSON hit.

| App | Files | Custom diagnostics before | After | Typed files | Shipped typed diagnostics |
|---|---|---|---|---|---|
| t3code | 3,841 | 34,030 | 6,414 | 3,802 | 18,646 |
| executor | 1,940 | 13,667 | 3,588 | 1,355 | 9,386 |

- `prefer-schema-over-json` ships `off`: executor reports 313 hits against a limit of 98, and 2 of 321 reviewed sites improve with Schema.
- tsgo's `missed-pipeable-opportunity` intersects 6 of 482 custom pipe-rule spans, mostly reporting nested Schema constructors, so it does not cover the custom rules.
- `effect-fn-opportunity` reports 2 and 1 wrappers where `prefer-effect-fn` reports 324 and 339.
- The typed engine rejects five executor tsconfigs under TypeScript 7 option validation and skips their programs, so executor's typed counts cover 1,355 of its 1,922 script files.

## tsgo severity list and boundary scoping (decided after design review)

tsgo severities ship as one explicit `effecttsgo/*` list generated from the four category presets at the pinned tag (`oxlint-presets/{correctness,antipattern,style,effect-native}.json`), not by extending `recommended`, whose membership moved 22 rules in 12 commits. Grading follows ADR-004, with the decided severities above taking precedence:

- Correctness: `error`, except `duplicate-package` at `warn` (an install-state problem).
- Anti-pattern: `error` for rules that hide a failure path or break a scope (`try-catch-in-effect-gen`, `run-effect-inside-effect`, `leaking-requirements`, `effect-in-failure`, `effect-in-void-success`, `lazy-promise-in-effect-sync`, `unknown-in-effect-catch`, `global-error-in-effect-catch`, `global-error-in-effect-failure`, `multiple-effect-provide`, `strict-effect-provide` with tests off, `scope-in-layer-effect`, `layer-merge-all-with-dependencies`); `warn` for refactoring hints (`return-effect-in-gen`, `catch-unfailable-effect`, `effect-fn-iife`, `effect-gen-uses-adapter`, `lazy-effect`, `prefer-unsafe-constructor`, `schema-sync-in-effect`).
- Style: `warn`, except `error` for `effect-fn-opportunity`, `nested-effect-gen-yield`, `effect-do-notation`, and `unnecessary-fail-yieldable-error`, and `off` for `catch-die-to-or-die`, `strict-boolean-expressions` (stack-neutral; belongs to `general` through oxlint's native rule), `missing-effect-service-dependency` (v3-only), and `deterministic-keys` (needs project key conventions). `missed-pipeable-opportunity` ships at `warn` for the evaluation in pattern 9.
- Effect-native: `error` for the in-Effect variants of date, random, uuid, console, timers, and `process-env`, and for `instance-of-schema`; `warn` for `global-fetch-in-effect`, `abort-controller-in-effect`, the outside-Effect siblings, `schema-sync`, `extends-native-error`, `async-function`, `new-promise`, and `node-builtin-import`; `prefer-schema-over-json` per pattern 16.

Under `vp lint --max-warnings 0`, `warn` still fails the gate, so the grading sets triage order, not what CI accepts.

Boundary scoping: the Effect preset ships no path globs for React, Electron, CLI, or script code, because PA-1 makes the preset axis stack coupling and every project's layout differs. It ships a test-file override inside the Effect config fragment (`strict-effect-provide` off) and an exported boundary-relaxation rules object that consumers attach to their own `files` globs through `composeLintConfigs`. The relaxation covers the boundary set executor turns off by path (`executor/.oxlintrc.jsonc:70-80`): `no-effect-escape-hatch`, `no-instanceof-error`, `no-json-parse`, `no-promise-catch`, `no-promise-reject`, `no-switch-statement`, `no-try-catch`, `no-unknown-error-message`, and tsgo's `async-function`, `new-promise`, `node-builtin-import`, and the outside-Effect `global-*` siblings. The README documents it with executor's globs as the example. taste-distillery TD-CARD-008 sanctions this shape of explicit scoped relaxation.

## Deferred follow-ups

Each of these now has a tech-debt record, written by hand on 2026-09-26 because the introspection CLI cannot validate records until its config schema issue is fixed:

- `Effect.forkDetach`: research whether it should be flagged (see `no-runtime-runfork` in Decided). Record: BP-TD-015.
- `missed-pipeable-opportunity`: after it ships at `warn`, compare its hits with `no-effect-call-in-effect-arg` and drop the custom rule if tsgo covers it (pattern 9). The 2026-09-26 app audit found it does not cover the custom rules at 0.45.0 (6 of 482 spans). Record: BP-TD-016.
- tsgo drift: the pinned-version test forces triage of new, renamed, or re-preset tsgo rules on every bump. Record: BP-TD-017.

## Next steps

1. Write ADR-007 (tsgo delegation and the overlap rule) and update `docs/decisions/index.md`, ADR-001 and ADR-004 supersession notes, `docs/design-docs/rule-pack-architecture.md` (source model and counts), `docs/design-docs/preset-architecture.md` (`:36`, `:71`, `:74`, `:90`), and the package README (language-service section and catalog counts).
2. Build the rule changes:
   - Drop rules by disposition, never by deleting manifest rows: `disposition: 'dropped'`, `implementationStatus: 'not-implemented'`, `parityStatus: 'not-applicable'`, `collections: []`, a reason, and `replacedBy` where tsgo takes over (`rule-manifest.ts:1223-1237` is the precedent). Extend `explicitDrops` in `scripts/checks/check-rule-inventory.ts:26`, replace the hard-coded language-service assertion at `:693`, rename the manifest's language-service list to tsgo names that exist, and remove replay suites for deleted rules (`scripts/checks/fixture-replay.ts`).
   - Remove every ownership guard that defers to a dropped rule: the wrapper-owned guard (`src/utils/effect-ownership.ts:163-169`) in `no-effect-escape-hatch`, `no-effect-side-effect-wrapper`, `no-effect-bind`, `no-effect-call-in-effect-arg`, and `no-pipe-ladder`, and the single-callee owners in `no-effect-ladder` and `no-flatmap-ladder` (`rule-catalog.ts:751-763`). Flip the "owned by `no-effect-wrapper-alias`" valid cases (`rule-catalog.test.ts:93,170,292,304,313,344,594,636,743,963`) to invalid cases on the surviving rule.
   - Narrowed and reworked rules each get a written definition of the smell, new valid and invalid cases, updated fixture replay, and a regenerated effective-config artifact.
   - Every kept rule gets a written message with a why and a fix, restoring upstream messages where they exist.
   - Clean up dead v3 branches in compatible rules (Stale v3 section). Remove or populate `effectVersionSensitivity` after checking what reads it.
   - Close BP-TD-010, which dropping `no-effect-as` resolves.
3. Ship the tsgo settings (severity fragment and tsconfig options) and document the required tsgo setup in the README and agent-facing docs.
4. Add the durable gates:
   - A reference-corpus vitest suite that runs every preset-enabled custom rule as `valid` over the effect-solutions, `LLMS.md`, and v4-test snippets this plan cites, each with a provenance comment.
   - A repeatable app-run script under `scripts/checks/` that lints the t3code and executor checkouts with the built plugin and prints per-rule counts. Record the after-change counts next to the before table.
   - A pinned-tsgo test: every `effecttsgo/*` name in the shipped fragment exists in the pinned `oxlint-schema.json`, and every rule in the pinned version is either configured or in an explicit `off` list.
   - The severity-floor test and the no-guard-names-a-dropped-rule test from Decided and step 2.
   - A test that every preset-enabled custom rule has an explicit entry in `src/rule-messages.ts`.
   - A packed-consumer smoke variant with the pinned tsgo patched in. It must show that an `effecttsgo/*` diagnostic at `error` exits 1 and that `effectFn` in tsconfig changes the oxlint-route output.
5. Update the agent house-style instructions with every decision agents must follow that the references do not already teach.
6. Record the 0.2.0 breaking change in the changeset.

Blocker for a green `pnpm check`: `introspection check` fails locally, because the sibling `../introspection` build does not know the `[records.list]` config block. Rule changes can still be verified with the other gates.
