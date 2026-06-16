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
| DP-1 | Base architecture rules + control-flow/promotions (4 import rules with carve-outs and repo setup, `no-continue`, `no-throw-literal`, `no-self-compare`) | L | PENDING | |
| DP-2 | `unicornConfig` fragment (move the silence wall, enable the general-quality set, trim `nodeRuntimeConfig`, extend the drift guard) | L | PENDING | |
| DP-3 | vitest rules + `explicit-module-boundary-types` (four test-scoped rules, comment fix, make the return-type rule explicit with options) | M | PENDING | |
| DP-4 | `jsdocConfig` fragment (jsdoc plugin, silence wall, validate-only set, drift guard) | L | PENDING | |
| DP-5 | Changesets and close-out (WI-10 against the final config, full re-dogfood) | S | PENDING | |

## Per-item detail

Entries are appended here as each item passes its gates and commits.
