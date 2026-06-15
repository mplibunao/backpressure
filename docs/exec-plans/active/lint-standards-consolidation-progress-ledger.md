# Lint standards consolidation: exec-plan progress ledger

Progress ledger for the orchestrate-loop execution of plan
[`lint-standards-consolidation-2026-06-15.md`](./lint-standards-consolidation-2026-06-15.md)
(work items WI-1 through WI-21) and its design critique
[`lint-standards-consolidation-critique-2026-06-15.md`](../../reviews/lint-standards-consolidation-critique-2026-06-15.md).
Each tracked unit gets one entry recording whether each workflow gate (verify,
review loop, refactor loop, commit) actually ran. The status table below indexes
every work item; per-item detail sections are appended as items land.

## Scope of this run

This orchestrate run targets the buildable, committable core in backpressure:

- **WI-1 through WI-10** are implemented, gated, and committed on this branch.
- **WI-11** (branch-stack runway) is documented as a release gate, not executed.
- **WI-12** (publish) is deferred: it needs the lower branches merged to `main`,
  a Version Packages PR, and npm Trusted Publishing over OIDC, none of which an
  agent run completes autonomously.
- **WI-13** (introspection rollout) is deferred: it is blocked on the published
  npm version existing inside the 7-day `minimumReleaseAge` window, and the
  introspection working tree currently holds in-flight substrate-reshape work
  (IX-SR-02) that this run must not collide with.
- **Phases 2 and 3** (WI-14 through WI-21) are sequenced follow-on branches,
  out of scope here.

## Branches (stacked for review)

- backpressure: `lint/oxlint-standards-consolidation`, branched off
  `reshape/introspection-v1`. The lint work stacks on the reshape branch because
  `main` is behind (it lacks the records-adoption and Vale-pin commits the
  reshape branch carries). Merge order is `main` then `reshape/introspection-v1`
  then this branch.
- introspection: adoption branch created when WI-13 is unblocked (after publish).
- taste-distillery: stacked branch created when WI-16 through WI-19 land.

## How this run is verified

The orchestrator owns the gates and does not trust agent self-reports:

- **Per-item review loop:** a `context_builder` review pass over the item diff,
  fix iterations delegated back to the implementer, re-review on the same chat
  until only nits remain.
- **Per-item refactor loop:** explore scouts scope the surface; a separate
  `context_builder` chat then builds the refactor plan for an engineer to
  execute, with follow-up re-analysis until no opportunity remains.
- **Independent checks before each commit:** the orchestrator runs the relevant
  backpressure checks (`vp check`, package vitest, `check-rule-inventory.ts`,
  `smoke:oxlint-packed-consumer`, `pnpm prose`) rather than relying on the
  agent's targeted runs.
- **Effective-config evidence:** WI-6 generates a checked-in effective-config
  view, so every base or fold-in rule change is measured against a captured diff
  rather than asserted.

## Pre-build resolutions (WI-1, settle before WI-2 and WI-3)

The critique requires three decisions before any config code is written. Each is
recorded here with its resolution before the dependent item is dispatched.

| Resolution | Blocks | Status | Resolution ref |
| --- | --- | --- | --- |
| (a) Config-fragment type source: oxlint `OxlintConfig` vs hand-rolled | WI-2 | PENDING | |
| (b) `composeLintConfigs` vs oxlint native `extends` (does inline `extends` merge fragments at the vite-plus boundary?) | WI-2 | PENDING | |
| (c) Naming taxonomy lock (`…Preset` for rule packs, `…Config` for fragments, one React surface) | WI-2, WI-3 | PENDING | |

## Status

Commit SHAs are in the backpressure repo unless a prefix marks another repo
(`ix` is introspection, `td` is taste-distillery). Sizes are from the plan.

| ID | Item | Size | Status | Commits |
| --- | --- | --- | --- | --- |
| WI-1 | Pre-build resolutions (fragment type, compose vs extends, naming lock) | S | PENDING | |
| WI-2 | Config-fragment type + composition | M | PENDING | |
| WI-3 | `baseConfig` canonical baseline | L | PENDING | |
| WI-4 | `vitestConfig` + `nodeRuntimeConfig` | M | PENDING | |
| WI-5 | Extend `rule-manifest.ts` (collections + rationale class + severity collapse) | L | PENDING | |
| WI-6 | Effective-config generation + inventory gate | L | PENDING | |
| WI-7 | README + `rules.md` consumption model | M | PENDING | |
| WI-8 | Dogfood in backpressure root (delete local block, decompose `max-statements`) | L | PENDING | |
| WI-9 | Packed-consumer smoke covers new exports | M | PENDING | |
| WI-10 | Changesets for both packages | S | PENDING | |
| WI-11 | Branch-stack release runway | S | DOCUMENTED (gate) | |
| WI-12 | Publish from backpressure | S | DEFERRED (manual blocker) | |
| WI-13 | Roll out to introspection | M | DEFERRED (release-age + in-flight reshape) | |
| WI-14 | `effect.json` in `@mplibunao/tsconfig` | M | DEFERRED (Phase 2) | |
| WI-15 | introspection adopts `effect.json` + LS | M | DEFERRED (Phase 2) | |
| WI-16 | TD Effect-LS hard-stop card | M | DEFERRED (Phase 3) | |
| WI-17 | TD source-of-truth edits | M | DEFERRED (Phase 3) | |
| WI-18 | `jsdocConfig` + TD JSDoc card | M | DEFERRED (Phase 3) | |
| WI-19 | `architectureConfig` + `namedExportsConfig` | M | DEFERRED (Phase 3) | |
| WI-20 | Deferred fragments (explicitApi, React stack) | M | DEFERRED (naming + consumer) | |
| WI-21 | Close-out + deferred tech-debt records | S | DEFERRED (after Phase 1) | |

## Per-item detail

Entries are appended here as each item passes its gates and commits.
