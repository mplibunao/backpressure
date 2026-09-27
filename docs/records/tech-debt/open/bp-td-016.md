---
schema_version: 1
id: BP-TD-016
repo_key: BP
record_type: tech-debt
number: 16
title: Re-measure whether tsgo's missed-pipeable-opportunity covers the custom pipe rules
status: open
category: tech-debt
visibility: local-only
created_at: 2026-09-26T12:13:08Z
updated_at: 2026-09-27T04:16:52Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-09-26T12:13:08Z
---
## Problem

The Effect v4 alignment allows dropping `no-effect-call-in-effect-arg` if `effecttsgo/missed-pipeable-opportunity` covers the same code once enabled. The preset ships that check at `warn`. The app audit on 2026-09-26 (`docs/reports/effect-v4-app-audit-2026-09-25.md`, section "Pipe-opportunity comparison") measured the overlap with `@effect/tsgo` 0.45.0 on t3code `53456bc01` and executor `480b390ee`: 6 of 482 custom pipe-rule spans intersect a tsgo span. `no-pipe-ladder` overlaps on 6 of 413 t3code spans and 0 of 43 executor spans, `no-effect-call-in-effect-arg` on 0 of 17 and 0 of 9, and the two ladder rules report nothing. Of the 811 t3code tsgo spans, 620 are nested Schema constructors. The two checks target different code, so every custom rule stays.

## Why deferred

At the pinned release, `missed-pipeable-opportunity` does not cover the custom rules, so retiring one now would lose coverage. The comparison has to be re-run against a later `@effect/tsgo` release before any rule can go.

## Revisit trigger

Revisit on each `@effect/tsgo` bump that changes `missed-pipeable-opportunity`, or when upstream notes a change to its matching. Re-run the pipe comparison with `bun scripts/checks/effect-app-audit.ts --mode shipped` on the recorded app snapshots.

## Done when

Done when a re-measured comparison on a newer `@effect/tsgo` release shows whether `missed-pipeable-opportunity` covers `no-effect-call-in-effect-arg` or the other custom pipe rules, and any rule it covers is dropped with a `replacedBy` edge, or the record is closed with the evidence that it does not.
