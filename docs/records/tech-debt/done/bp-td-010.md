---
schema_version: 1
id: BP-TD-010
repo_key: BP
record_type: tech-debt
number: 10
title: "`no-effect-as` named barrel import policy"
status: done
category: tech-debt
visibility: local-only
created_at: 2026-06-10T00:00:00Z
updated_at: 2026-09-27T04:16:52Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/done
  - visibility/local-only
source:
  discovered_at: 2026-06-10T00:00:00Z
resolution:
  disposition: done
  resolved_at: 2026-09-26T03:09:08Z
  rationale: The Effect v4 alignment dropped `no-effect-as` because `Effect.as` is idiomatic v4 code, so the named barrel import gap was deleted with the rule rather than fixed. No surviving rule inherits the policy question; `no-barrel-import` still rejects every value import from the `effect` barrel.
  evidence_refs:
    - kind: commit
      ref: ec4f4f8
      label: "refactor(oxlint-standards): drop 27 Effect rules replaced by tsgo or v4"
      note: Deleted the standalone no-effect-as rule, its message module, and its RuleTester file; the manifest row is now dropped.
    - kind: plan
      ref: docs/exec-plans/completed/effect-rules-v4-alignment-2026-09-25.md
      label: Decided entry for no-effect-as (option B, pattern 7)
---
`no-effect-as` named barrel import policy.

## Problem

The 2026-05-31 refactor review preserved the existing `no-effect-as` binding behavior: the standalone `no-effect-as` rule recognizes namespace imports such as `import * as Effect from "effect/Effect"` and the `Effect` namespace alias from the `effect` barrel, but it does not currently diagnose the named barrel form `import { Effect } from "effect"; Effect.as(...)`. This was not changed during WG3 refactor fixes because changing it would expand behavior after a clean correctness review. Revisit when deciding whether `no-barrel-import` fully owns named barrel imports in presets or whether each standalone rule should also catch named barrel imports; add explicit RuleTester and replay cases for whichever policy is chosen.

## Why deferred

Kept as an active backpressure follow-up during the introspection migration disposition pass.

## Revisit trigger

Revisit in backpressure when the original tracker condition above is ready to build.

Resolved 2026-09-26: the rule was deleted in the Effect v4 alignment, so no trigger remains.
