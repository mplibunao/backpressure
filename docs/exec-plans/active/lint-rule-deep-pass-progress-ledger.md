# Lint rule deep-pass: exec-plan progress ledger

Progress ledger for the orchestrate-loop execution of the rule deep-pass resolution
[`lint-rule-disposition-resolution-2026-06-16.md`](../../reviews/lint-rule-disposition-resolution-2026-06-16.md)
(the decision record) against its audit
[`lint-rule-disposition-audit-2026-06-16.md`](../../reviews/lint-rule-disposition-audit-2026-06-16.md).
This run turns the resolution's confirmed calls into config on top of the committed WI-1 through
WI-9 foundation tracked in
[`lint-standards-consolidation-progress-ledger.md`](./lint-standards-consolidation-progress-ledger.md).
Each tracked unit gets one entry recording whether each workflow gate (verify, review loop,
refactor loop, commit) actually ran. The status table below indexes every work item; per-item
detail sections are appended as items land.

## Scope of this run

The deep pass turns the resolution's decisions into config. Backpressure-only; the package is
dogfooded here, and downstream consumers inherit the changes only when they adopt the published
version.

- **DP-1 through DP-5** land on the existing lint branch, each gated and committed.
- **introspection is out of scope.** It consumes `@mplibunao/oxlint-standards` but its adoption
  is deferred (WI-13 in the consolidation ledger) and it carries in-flight substrate-reshape work
  (IX-SR-02 and later). This run must not touch it. It will inherit the new base, the
  `unicornConfig` and `jsdocConfig` fragments, and the explicit-return posture when it next adopts.
- **WI-10 (changesets)** was parked in the consolidation run until the deep pass finished, so the
  changeset captures the final config rather than a state about to change. It lands here as DP-5.

## Canon coordination (TD-CARD-033)

TD-CARD-033 "Graded rule severity" (accepted, strength `default`) says correctness, safety, and
agent-failure-mode rules default to `error` while style and preference rules stay quieter. The
pack's style-at-error posture (the WI-5 `styleAtErrorExceptions` allowlist, widened by the DP-2
unicorn set) deviates from that default. WI-5 flagged it as unratified and deferred ratification to
the canon phase (WI-17).

MP decided **Path B**: amend TD-CARD-033 to permit graded style-at-error for opinionated
agent-nudging packs, recorded per-rule, rather than scatter consumer-repo ADR overrides (the pack
ships the posture to every consumer, so it is a general-default shift, not one repo's deviation).
MP folded the amendment into this run as the immediate next step rather than a separate canon phase.

**Landed (taste-distillery branch `reshape/introspection-v1`).** The amendment permits a narrow,
per-rule-recorded style-at-error exception for agent-nudging packs and explicitly does not soften
TD-CARD-008. Commits: `9a1231b` (amendment), `d6b0ba8` (evidence-sentence fix naming the live
inventory-gate allowlist instead of a non-existent symbol), `276c86b` (tighten redundant wording).
The amendment commit `9a1231b` landed before its gates ran; the review and refactor gates were then
run fix-forward, which produced `d6b0ba8` and `276c86b`. Gates: governed canon gates `just docs`
and `just prose` green; orchestrate-loop review gate clean (no findings) and refactor gate converged
after one tightening. DP-1 rules are all graded correctness/safety/agent-failure-mode and need no
exception; the deviation this card now ratifies lives in DP-2.

## Branch

backpressure: `lint/oxlint-standards-consolidation` (the same branch that carries WI-1 through
WI-9). The deep pass refines the baseline that WI-3 established, so it continues on that branch and
WI-10 follows it.

## How this run is verified

The orchestrator owns the gates and does not trust agent self-reports:

- **Per-item review loop:** a `context_builder` review pass over the item diff, fix iterations
  delegated back to the implementer, re-review on the same chat until only nits remain.
- **Per-item refactor loop:** explore scouts scope the surface where useful; a separate
  `context_builder` chat then builds the refactor plan for an engineer to execute, with follow-up
  re-analysis until no opportunity remains.
- **Independent checks before each commit:** the orchestrator runs the relevant backpressure checks
  (`vp lint --max-warnings 0`, package vitest, `pnpm inventory:rules`, the engine-backed drift
  guards, `smoke:oxlint-packed-consumer`, `pnpm prose`) rather than relying on the agent's targeted
  runs.
- **Effective-config evidence:** every base or fragment rule change regenerates the checked-in
  `docs/references/effective-config.json`, so the posture change is measured against a captured
  diff rather than asserted. New plugins (jsdoc) follow the established silence-wall-plus-drift-guard
  pattern from `unicornConfig`/`vitestConfig`.
- **Canon guard (TD-CARD-033):** every newly enabled rule is graded by kind in the manifest
  (`rationaleClass`), with style-at-error rules held in the `styleAtErrorExceptions` allowlist and
  carrying autofix evidence. No blanket all-error pack.

## Status

Commit SHAs are in the backpressure repo. Sizes reflect the dogfood blast radius, not just the
config edit.

| ID | Item | Size | Status | Commits |
| --- | --- | --- | --- | --- |
| DP-1 | Base architecture rules + control-flow/promotions (4 import rules with carve-outs and repo setup, `no-continue`, `no-throw-literal`, `no-self-compare`) | L | DONE | `db539d0` |
| DP-1c | Bundler migration to tsdown (single-file ESM bundle) + `#oxlint-standards/*` alias; re-enable `no-relative-parent-imports` for the package src only (monorepo-wide disable kept); dist no-leak + artifact guards; TD build-system card | L | DONE | `6485b2d`, `6054bbe`, `db3f338`, `4e62741`; TD `0437b7b` |
| DP-2 | `unicornConfig` fragment (move the silence wall, enable the general-quality set, trim `nodeRuntimeConfig`, extend the drift guard) | L | DONE | `f2f934b` |
| DP-3 | vitest rules + `explicit-module-boundary-types` (four test-scoped rules, comment fix, make the return-type rule explicit with options) | M | DONE | `bc0fe38` |
| DP-4 | `jsdocConfig` fragment (jsdoc plugin, silence wall, validate-only set, drift guard) | L | PENDING | |
| DP-5 | Changesets and close-out (WI-10 against the final config, full re-dogfood) | S | PENDING | |

## Per-item detail

Entries are appended here as each item passes its gates and commits.

### DP-1: Base architecture rules + control-flow and promotions (DONE)

- **Build:** one `pair` agent (Codex CLI, gpt-5.5, reasoning high). It measured the blast radius
  before any sweep and reported per-rule counts, then swept after orchestrator approval.
  `baseConfig` now enables `import/no-cycle`, `oxc/no-barrel-file`, `import/no-default-export`,
  `import/no-relative-parent-imports`, `no-continue`, `eslint/no-throw-literal`, and
  `eslint/no-self-compare`, with two carve-out overrides (`oxc/no-barrel-file` off for
  `**/src/index.ts`; `import/no-default-export` off for `**/*.config.*`). The `oxc` plugin is newly
  activated behind an exhaustive silence wall so only `oxc/no-barrel-file` is owned.
- **Blast radius (measured first):** `import/no-relative-parent-imports` 56, `no-continue` 21,
  `import/no-default-export` 2, `import/no-cycle` 0, `oxc/no-barrel-file` 0.
- **Decision 1 (`import/no-relative-parent-imports`, orchestrator call):** the 56 hits span package
  internals, scripts, and smoke harnesses. backpressure is a published library and tooling monorepo
  with no natural `@/` source root, and alias rewriting would add build and runtime resolver
  complexity. Per the rubric's visible per-repo opt-out, the rule stays BASE at error for app
  consumers while backpressure turns it off in a trailing `composeLintConfigs` fragment in
  `vite.config.ts` with a reason comment. Accepted gap: no repo dogfoods this rule yet, because the
  introspection adoption is deferred.
- **Decision 2 (`import/no-default-export`, oxlint contract):** the two hits are `plugin.ts`
  (`export default plugin`) and `index.ts` (`plugin as default`). oxlint loads JS plugins via their
  default export, so these exports are required. They carry justified inline disables with a reason
  comment rather than a rule weakening.
- **Decision 3 (`no-continue`, 21 sites):** restructured across 9 source and script files by
  inverting guards or extracting loop bodies; no suppressions.
- **Grading refinement (orchestrator):** the resolution graded `import/no-relative-parent-imports`
  inconsistently. It is graded `agent-failure-mode` here, since agents over-produce deep relative
  import chains and a style grade would wrongly require the autofixable-style-at-error allowlist. The
  other DP-1 rules grade safety (`no-cycle`), agent-failure-mode (`no-barrel-file`,
  `no-default-export`, `no-continue`), and correctness (`no-throw-literal`, `no-self-compare`). All
  are error-by-kind under TD-CARD-033, so none touch the style allowlist.
- **Verify-gate catch (orchestrator):** the agent activated the `oxc` plugin with a silence wall but
  no drift guard. The orchestrator required one before review. An engine-backed oxc drift guard now
  asserts only `oxc/no-barrel-file` is active, with a sanity check confirming it fails when a stray
  oxc rule is forced on.
- **Review gate:** one `context_builder` review on chat `dp1-review-E1349A` plus a follow-up. One
  must-fix DISPROVEN (orchestrator override): the review claimed `oxc/no-barrel-file` would fail on
  internal barrels (`src/configs/index.ts`, `src/presets/index.ts`); `vp lint --max-warnings 0` is
  0/0 with the rule active because its default threshold is roughly 100 re-exports and those files
  use a few named re-exports, and the narrow `**/src/index.ts` carve-out is intentional (only the
  public entrypoint is the legitimate barrel). Applied: the suggestion (engine-backed tests that a
  105-re-export `src/index.ts` is exempt from `oxc/no-barrel-file` and a config-file default export
  is exempt from `import/no-default-export`) and the nit (split a rewritten boolean in
  `utils/imports.ts` into named booleans). The follow-up review found no remaining issue.
- **Refactor gate:** one `context_builder` analysis on chat `dp1-refactor-review-43A980` plus a
  follow-up, two rounds to convergence. Round one applied three cleanups: an `activeRulesWithPrefix`
  test helper, flatter inventory-gate replay loops via extracted assertion helpers, and a shared
  config-derived allowlist helper consumed by both the manifest test and the inventory gate (the
  manifest test keeps an independent manifest-versus-config check plus a focused check that the
  helper never allowlists the owned `oxc/no-barrel-file`). Round two renamed that helper to
  `deriveOmittedNonErrorRuleAllowlist` for clarity and decoupled a drift guard from override
  ordering (selecting the test override by its `**/*.test.ts` glob, not index 0). Deferred:
  `deriveOmittedNonErrorRuleAllowlist` sits on the package public root but only the repo gate needs
  it; the export-surface cleanup is a separate minor follow-up.
- **Orchestrator independent verification (beyond agent self-report):** an unexplained 50-line
  deletion appeared in `lint-standards-consolidation-2026-06-15.md` during the run and was reverted,
  since it is not part of DP-1. The `oxc` silence wall was confirmed bleed-free by reading the
  effective-config artifact, where only `oxc/no-barrel-file` resolves to `deny` and every other
  `oxc/*` rule is `allow`. The orchestrator re-ran lint, typecheck, inventory, and the durable-ref
  check rather than trusting the agent's green report, and confirmed `import/no-default-export` fires
  only on the two oxlint-contract export sites.
- **Checks:** the orchestrator ran independently after each gate, green every time:
  `pnpm exec vp lint --max-warnings 0` (0/0 over 70 files, 171 rules), the package vitest suite (706
  tests), `pnpm inventory:rules` (50 source rules, parity intact), `pnpm typecheck` (clean),
  `pnpm durable:refs` (clean after the doc fix below), and the package build.
- **Durable-ref fix:** `pnpm durable:refs` failed on the deep-pass review docs, which cited plan
  work-item labels, not on DP-1 code. The orchestrator removed those labels from the audit and
  resolution docs and the gate passes.
- **Commits:** `fcb1088` for the planning docs (resolution, audit, ledger, BP-TD-012), `db539d0` for
  the DP-1 code, plus this ledger-record commit.
- **Issues:** none open in the DP-1 code. Two are carried forward: the
  `deriveOmittedNonErrorRuleAllowlist` export-surface cleanup (minor), and the TD-CARD-033 Path B
  amendment (see canon coordination above), whose sequencing relative to this run is pending MP.
- **Action items for MP:** confirm whether the TD-CARD-033 amendment folds into this run as a
  close-out step or stays the separate canon phase. Note that `import/no-relative-parent-imports`
  ships in BASE with no current dogfood, because backpressure opts out as a library and introspection
  exercises it only on adoption. (Resolved by DP-1c below: the package now dogfoods the rule.)

### DP-1c: tsdown build migration + package-scoped import conformance (CODE DONE; TD card pending)

- **Scope:** package-only, per the corrected oracle plan. The package src re-enables
  `import/no-relative-parent-imports`; the monorepo-wide disable stays for app and scripts that have
  no bundler/alias plan. This closes DP-1's "no repo dogfoods this rule" gap for the package.
- **Build (delegated):** one `pair` agent (Codex CLI, gpt-5.5, reasoning high), dispatched via
  `agent_run` with an oriented brief pointing at the plan, a scope boundary, and hard guardrails (no
  rule weakening, keep the default-export contract, no commit). An earlier orchestrator attempt
  drifted off-workflow (generic Agent tool, turn-by-turn brief); it was stopped, its partial changes
  reverted, and the work re-dispatched through `agent_run` per orchestrate-loop.
- **Decisions:** tsdown single-entry ESM bundle (not preserve-modules/unbundle), with dts plus
  declaration maps; `tsc -b` stays the typecheck. The alias `#oxlint-standards/* -> ./src/*` lives
  only in the package `tsconfig.json` as the single source; `vite.config.ts` mirrors it for Vitest
  source runs. No explicit tsdown alias was added, to avoid a second alias source that could drift.
- **Blast radius:** 15 parent-relative import specifier lines in package src migrated to the alias,
  ending at 0; the remaining `../` matches are test-fixture strings only.
- **Verify gate (orchestrator, independent of the agent report):** the changed set stayed confined to
  the package, root `vite.config.ts`, the package scripts, and the docs. An anti-cheat scan found no
  new `oxlint-disable`/`eslint-disable`/`@ts-` comments. The rule re-enable is a package-scoped
  override layered after the monorepo-wide `off`, not a global weaken. A fresh build emitted the
  four-file dist contract with zero `#oxlint-standards/` leaks in `index.js` and `index.d.ts`;
  independent `vp lint` was 0/0 and `tsc -b` was clean.
- **Review gate:** `context_builder` review (chat `tsdown-review-780589`) plus a follow-up. One
  must-fix: switching the build from `tsc -b` to tsdown removed the implicit typecheck from the
  publish path, so `pnpm typecheck` was added to `release:prepare`. One suggestion applied: the dist
  no-leak guard became AST-based: it parses `dist/index.js` and `dist/index.d.ts` with the
  TypeScript compiler and fails on any relative specifier, catching root-level leaks (`./plugin.js`
  and similar) that the prior enumerated check missed. One suggestion declined: an explicit tsdown
  alias, to keep the single tsconfig source. The follow-up review was clean.
- **Refactor gate:** a separate `context_builder` chat (`dp-1c-refactor-review-0C486E`). Three P2
  cleanups landed in `artifact-assertions.ts`: shared arrays now back the packed-file contracts as
  one source of truth; AST extraction moved into a `moduleSpecifierForNode` helper, leaving the
  visitor to filter and record; the nested/root private-path rule now lives in a named
  `matchesForbiddenPackagePath` helper. The follow-up analysis reported convergence.
- **Orchestrator independent verification (the key catch):** the orchestrator's full `pnpm check`,
  run beyond the agent's targeted commands, caught that the review-gate typecheck addition broke the
  pinned `release:prepare` contract in `scripts/lib/release-contract.ts`. The agent's targeted
  re-checks had not exercised `check-release-workflow`. The pinned contract was updated to the
  intended new release path as an explicit reviewed change, and the full check then passed.
- **Checks (orchestrator, independent):** full `pnpm check` green, covering build, `vp lint` 0/0 over 71
  files and 171 rules, version pins, `tsc -b`, 771 tests, the release-workflow contract, the
  changesets contract, rule inventory, fixture replay (87 suites, 512 cases), the oxlint and tsconfig
  packed smokes, both package allowlists (oxlint packs 9 files), `introspection check`, and prose
  (0 findings over 45 files).
- **Commits:** `6485b2d` (migration code, config, scripts, lockfile), `6054bbe` (architecture and
  translation-contract docs), `db3f338` (explicit `--noEmit` on the typecheck scripts), `4e62741`
  (dist guard also rejects leaked `#oxlint-standards/` aliases, with a positive-control test), plus
  the ledger-record commits.
- **Issues:** none open in the DP-1c code.
- **Taste-distillery canon (landed):** TD-CARD-038 (build published packages with tsdown, under
  `ci-and-release`), its anchoring investigation (the bundler comparison), and TD-SPECIMEN-009 (the
  frozen backpressure build) landed on the taste-distillery branch `reshape/introspection-v1` as
  commit `0437b7b`, gated by `just docs`, `just prose`, and the orchestrate-loop review and refactor
  loops. The canon review there surfaced one further backpressure fix: the dist guard rejected only
  relative specifiers, so a leaked `#oxlint-standards/` alias would have passed; the guard was
  strengthened to reject the alias prefix too (`4e62741`).
- **Deferred (tracked):** repo-wide `no-relative-parent-imports` conformance for app and scripts sits
  outside DP-1c by design; the monorepo-wide disable stays until those areas gain an alias plan.

### DP-2: unicornConfig fragment (DONE)

- **Build (delegated):** one fresh `pair` agent (Codex CLI, gpt-5.5, reasoning high), dispatched via
  `agent_run` against the resolution's unicorn section. It measured the blast radius non-destructively
  (a temporary script that imported the config, removed the silence lines, added the explicit entries,
  and counted diagnostics) and graded rules against the live oxlint catalog rather than guessing.
- **Fragment + split:** a new `src/configs/unicorn.ts` owns the unicorn plugin, the silence wall, and
  the explicit-on rules; `baseConfig` composes it. `nodeRuntimeConfig` keeps only
  `unicorn/prefer-node-protocol` (and re-declares `plugins: ['unicorn']` so it resolves standalone).
- **Rules (per the resolution):** the swept and explicit sets at `error`, `prefer-set-has` at `warn`.
  `number-literal-case` and `switch-case-braces` stay held (oxfmt turf). The Effect/Bun-idiom
  conflicts stay dropped. `filename-case` and the browser/DOM family are deferred, with the
  browser-family correctness members (`no-invalid-fetch-options`, `no-invalid-remove-event-listener`)
  kept per-rule in the silence list so the sweep cannot turn them on.
- **Canon grading (TD-CARD-033):** every enabled rule is graded by kind in the manifest; the
  style-at-error rules sit in the `styleAtErrorExceptions` allowlist with autofix evidence, including
  the documented no-autofix entry `no-useless-switch-case`. No blanket all-error.
- **Blast radius (measured first):** `no-typeof-undefined` 32, `no-array-sort` 18, `prefer-set-has` 1
  warning. After cleanup: 0 violations and 0 warnings. Fixes used `globalThis.undefined`, `toSorted`,
  and one `Set#has`, with no suppressions.
- **Verify gate (orchestrator, independent):** the anti-cheat scan found no new suppressions, and the
  silence wall moved rather than expanded (`no-abusive-eslint-disable` was already silenced at HEAD).
  The `toSorted` rewrites were checked safe: each operates on a fresh or result-consumed array (spread,
  `map`, `filter`, `Object.entries`, or test assertions), so no caller relies on in-place mutation.
  A clean `pnpm check` (after wiping `.tsbuildinfo`) caught a typecheck failure the agent's incremental
  run masked: `toSorted` is an ES2023 API but the repo's `lib` defaulted to ES2022. Since `no-array-sort`
  mandates `toSorted` and the Bun/Node runtime supports it, the fix added `"lib": ["ES2023"]` (target
  stays ES2022) and restored the concrete public `baseConfig.rules` type via `ConfigWithRules`.
- **Review gate:** `context_builder` review (`unicorn-review-0FF22E`) plus follow-ups. One must-fix was
  DISPROVEN by an orchestrator probe: the review claimed the unattended `vp check --fix` lane could
  apply dangerous autofixes, but `vp check --fix` applied only the safe instances (`[...[1,2,3]]` to
  `[1,2,3]`, `parseInt` to `Number.parseInt`) and left the behavior-changing ones (a `[...src]` clone,
  `isNaN`) untouched. Applied instead: the manifest now records that autofix boundary for
  `no-useless-spread`, `prefer-number-properties`, and `prefer-set-has`; `nodeRuntimeConfig` became
  self-contained; and a contract test pins that `composeLintConfigs(baseConfig, nodeRuntimeConfig)`
  resolves `prefer-node-protocol` to `error` (the split made that rule order-sensitive). The changeset
  is DP-5 scope, so it was not added.
- **Refactor gate:** a separate `context_builder` chat (`dp2-refactor-review-D0FC38`). Two P1
  consolidations landed: a `manifestCollectionsForConfiguredFragment` helper and a centralized
  `styleAtErrorExceptions` constant, each a single source of truth consumed by both the manifest test
  and the inventory gate. Two P2 ideas were deferred with reasons: the `unicorn.test.ts` and
  `drift-guards.test.ts` expected-rule lists stay separate (independent static and engine-backed
  assertions are a deliberate strength), and the `deriveOmittedNonErrorRuleAllowlist` restructure waits
  until that area is next touched. The follow-up reported convergence.
- **Checks (orchestrator, independent):** clean full `pnpm check` green, covering build, `vp lint`
  0/0, version pins, `tsc -b --noEmit`, 782 tests, the release-workflow and changesets contracts, rule
  inventory, fixture replay, both packed smokes, both package allowlists, `introspection check`, and
  prose.
- **Commits:** `f2f934b` (the fragment, manifest grading, lib bump, violation fixes, drift guard, and
  effective-config), plus this ledger-record commit.
- **Issues:** none open in the DP-2 code.
- **Deferred (tracked):** the export-surface cleanup carried from DP-1 grew, because the inventory gate
  consumes `manifestCollectionsForConfiguredFragment` and `styleAtErrorExceptions` from the built
  package, so both are exported from the public root alongside the existing manifest helpers. Folding
  these gate-only helpers off the public surface stays the deferred cleanup. `number-literal-case` and
  `switch-case-braces` remain held pending oxfmt scope; `filename-case` and the browser family remain
  deferred.

### DP-3: vitest rules and explicit-module-boundary-types (DONE)

- **Build (delegated):** one fresh `pair` agent (Codex CLI, gpt-5.5-fast, reasoning high), dispatched
  via `agent_run` against the resolution's vitest and explicit-return sections. It measured the blast
  radius first and graded the new rules against the live oxlint catalog.
- **vitest fragment:** the four added rules (`consistent-each-for`, `no-import-node-test`,
  `require-mock-type-parameters`, `require-local-test-context-for-concurrent-snapshots`) go into the
  global silence wall at `off` and re-enable at `error` only inside the `**/*.test.ts` override, the
  same bleed-prevention pattern `unicornConfig` uses. The `require-test-timeout` comment was corrected:
  the rule stays off as a team-policy opt-in rather than a technical conflict, because the repo's
  `vi.setConfig({ testTimeout })` form satisfies it.
- **explicit-module-boundary-types:** made an explicit `error` entry in `base.ts` with
  `allowHigherOrderFunctions`, `allowTypedFunctionExpressions`, and a denied
  `allowArgumentsExplicitlyTypedAsAny`. `oxlint --print-config` showed it already resolved to `deny`
  through the restriction sweep both before and after, so the change surfaces the policy rather than
  altering it; `explicit-function-return-type` stays off to avoid the redundant twin.
- **Canon grading (TD-CARD-033):** the five newly explicit rules are graded by kind in the manifest.
  `consistent-each-for` and `require-local-test-context-for-concurrent-snapshots` grade correctness;
  `no-import-node-test` and `require-mock-type-parameters` grade agent-failure-mode;
  `explicit-module-boundary-types` grades correctness. None is style-at-error, so the allowlist did not
  grow.
- **Blast radius (measured first):** the live checkout held five `it.each` array-case sites, not the
  resolution's historical estimate of about twelve, and `explicit-module-boundary-types` surfaced zero
  new violations because it already fired. The five `it.each` sites moved to `it.for`, ending at zero
  `it.each` repo-wide.
- **Verify gate (orchestrator, independent):** the four rules were confirmed present in both the
  silence wall and the test override, never in a global rules map. The `it.each` to `it.for`
  conversions were checked behavior-preserving: every converted case is a scalar string or a
  destructured object, so none relied on the array-spreading that only `it.each` does. The anti-cheat
  scan found no new `oxlint-disable` comments, and a clean `pnpm check` (after wiping `.tsbuildinfo`)
  was green.
- **Review gate:** `context_builder` review (`dp3-review-DCCAEC`). No findings. It independently
  confirmed the bleed-safety, the conversion equivalence, the visible-not-changed reading of
  `explicit-module-boundary-types`, and the manifest consistency. One residual was noted and accepted:
  the four new rules carry no per-rule live diagnostic fixture, which matches the existing curated set,
  where only `warn-todo` carries a behavioral fixture as the representative scoping proof and the rest
  rely on the exact-set scope assertions.
- **Refactor gate:** a separate `context_builder` chat (`dp3-refactor-review-6259B3`). No findings.
  The rule-name repetition across the silence wall, the override, and the exact-set assertions is the
  intended drift-protection design, the comments explain intent, and the manifest rows match their
  neighbors.
- **Checks (orchestrator, independent):** clean full `pnpm check` green, covering build, `vp lint` 0/0
  over 74 files and 206 rules, version pins, `tsc -b --noEmit`, 782 tests, the release-workflow and
  changesets contracts, rule inventory, fixture replay, both packed smokes, both package allowlists,
  `introspection check`, and prose (0 findings over 45 files).
- **Commits:** `bc0fe38` (the four vitest rules, the explicit return-type entry, manifest grading, the
  `it.for` conversions, and regenerated effective-config), plus this ledger-record commit.
- **Issues:** none open in the DP-3 code.
- **Deferred (tracked):** unchanged from DP-2. The export-surface cleanup, the held `number-literal-case`
  and `switch-case-braces`, and the deferred `filename-case` and browser family all carry forward.
