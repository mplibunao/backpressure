---
schema_version: 1
id: BP-TD-010
repo_key: BP
record_type: tech-debt
number: 10
title: "`no-effect-as` named barrel import policy"
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-06-10T00:00:00Z
updated_at: 2026-06-10T00:00:00Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-06-10T00:00:00Z
  refs:
    - kind: tracker
      ref: docs/exec-plans/tech-debt-tracker.md#td-010
---
`no-effect-as` named barrel import policy.

## Problem

The 2026-05-31 refactor review preserved the existing `no-effect-as` binding behavior: the standalone `no-effect-as` rule recognizes namespace imports such as `import * as Effect from "effect/Effect"` and the `Effect` namespace alias from the `effect` barrel, but it does not currently diagnose the named barrel form `import { Effect } from "effect"; Effect.as(...)`. This was not changed during WG3 refactor fixes because changing it would expand behavior after a clean correctness review. Revisit when deciding whether `no-barrel-import` fully owns named barrel imports in presets or whether each standalone rule should also catch named barrel imports; add explicit RuleTester and replay cases for whichever policy is chosen.

## Why deferred

Kept as an active backpressure follow-up during the introspection migration disposition pass.

## Revisit trigger

Revisit in backpressure when the original tracker condition above is ready to build.