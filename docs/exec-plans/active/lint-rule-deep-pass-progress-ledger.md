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
pack's style-at-error posture (the WI-5 `STYLE_AT_ERROR_EXCEPTIONS` allowlist, widened by the DP-2
unicorn set) deviates from that default. WI-5 flagged it as unratified and deferred ratification to
the canon phase (WI-17).

MP decided **Path B**: amend TD-CARD-033 to permit graded style-at-error for opinionated
agent-nudging packs, recorded per-rule, rather than scatter consumer-repo ADR overrides (the pack
ships the posture to every consumer, so it is a general-default shift, not one repo's deviation).
The amendment is a governed taste-distillery edit (`just docs`, `just prose`); its sequencing
relative to this backpressure run is the open scope question above the ledger. DP-1 rules are all
graded correctness/safety/agent-failure-mode and need no exception; the deviation lives in DP-2.

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
  (`rationaleClass`), with style-at-error rules held in the `STYLE_AT_ERROR_EXCEPTIONS` allowlist and
  carrying autofix evidence. No blanket all-error pack.

## Status

Commit SHAs are in the backpressure repo. Sizes reflect the dogfood blast radius, not just the
config edit.

| ID | Item | Size | Status | Commits |
| --- | --- | --- | --- | --- |
| DP-1 | Base architecture rules + control-flow/promotions (4 import rules with carve-outs and repo setup, `no-continue`, `no-throw-literal`, `no-self-compare`) | L | DONE | `db539d0` |
| DP-2 | `unicornConfig` fragment (move the silence wall, enable the general-quality set, trim `nodeRuntimeConfig`, extend the drift guard) | L | PENDING | |
| DP-3 | vitest rules + `explicit-module-boundary-types` (four test-scoped rules, comment fix, make the return-type rule explicit with options) | M | PENDING | |
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
  exercises it only on adoption.
