---
schema_version: 1
id: BP-TD-017
repo_key: BP
record_type: tech-debt
number: 17
title: Triage the rules and supported versions of the next @effect/tsgo pin
status: done
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-09-26T12:13:08Z
updated_at: 2026-09-26T23:12:29Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/done
  - visibility/local-only
source:
  discovered_at: 2026-09-26T12:13:08Z
resolution:
  disposition: done
  resolved_at: 2026-09-26T23:12:29Z
  rationale: The pin moved to `@effect/tsgo` 0.46.1, the first release containing Effect-TS/tsgo#768. Its snapshot replaced the 0.45.0 one. The release adds three style rules and removes or re-categorizes none, and each new rule takes the style default of `warn`. Both package READMEs state the new supported matrix, and `pnpm check:effect-integration` passes on both routes with oxlint 1.81.0 as the unsupported control. Later bumps stay gated by the policy's expected category counts and ADR-007's re-grade follow-up.
  evidence_refs:
    - kind: plan
      ref: docs/exec-plans/active/effect-rules-v4-implementation-progress-ledger.md
      label: Effect rules v4 progress ledger, entry for the @effect/tsgo 0.46.1 bump
      note: Grades, overlap checks, release-age controls, and the integration commands with their exit codes.
---
Triage the rules and supported versions of the next `@effect/tsgo` pin.

## Problem

The Effect preset pinned `@effect/tsgo` 0.45.0 and set all 113 of its rules explicitly, generated from `scripts/config/tsgo-policy.ts` and the retained snapshot `scripts/references/tsgo/0.45.0/metadata.json`. Its supported tools were equally exact: oxlint `1.81.0` or `1.82.0` (`vite-plus` `0.3.1` or `0.3.2`), oxlint-tsgolint `7.0.2001`, and TypeScript `7.0.2` for the patched-tsc route. `vite-plus` `0.3.3` (oxlint `1.83.0`) and `1.0.0-rc` (oxlint `1.85.0`) were not supported, so consumers could not upgrade `vite-plus` until the pin moved. A new release can add, rename, or re-categorize rules. A new rule silently takes its category's default severity, so each one needs a deliberate grade.

## Why deferred

No release newer than 0.45.0 carried the upstream fix for Effect options through `extends` (Effect-TS/tsgo#768), which BP-TD-014 waits on. Bumping to 0.46.0 would have changed the supported matrix and the rule set without that fix, so the next bump waited for the release that contained it.

## Revisit trigger

Revisit when an `@effect/tsgo` release containing Effect-TS/tsgo#768 is published. MP allows that release in before the seven-day `minimumReleaseAge` window closes, through exact-version exclusions for `@effect/tsgo` and its platform binary packages. Also revisit when a later `vite-plus` release is needed and a newer `@effect/tsgo` supports its oxlint.

## Done when

Done when the catalog pins the new release, the integration pins and unsupported-oxlint control in `scripts/config/effect-toolchain.json` match its supported matrix, its metadata snapshot replaces the 0.45.0 one, every new, renamed, or re-categorized rule has a reviewed grade in the policy, the supported matrix in both package READMEs matches the release, and `pnpm check:effect-integration` passes on the new matrix.

Resolved 2026-09-26 (UTC): 0.46.1 is pinned with exact-version release-age exclusions for it and its platform packages, and every condition above holds.
