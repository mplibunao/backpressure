---
schema_version: 1
id: BP-TD-008
repo_key: BP
record_type: tech-debt
number: 8
title: Test-integrity rules and a `tests` preset
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
      ref: docs/exec-plans/tech-debt-tracker.md#td-008
---
Test-integrity rules and a `tests` preset.

## Problem

Candidate post-v0 preset for catching fake or assertion-free tests, the kind agents produce. Source: a Twitter screenshot reviewed on 2026-05-31.

- `no-mock-echo`: flag a test that asserts the result equals the exact value a mock was configured to return. Tautological, so it tests the mock rather than the code. Stack-neutral across mock libraries and high value as agent backpressure. Default severity `warn` under the graded posture (ADR 004). Detection is heuristic, so scope carefully: match the asserted expected value against the mock's configured return inside the same test, and expect false-positive edges.

Stryker complements these, it does not replace them. Mutation testing finds coverage gaps in a slow batch; these rules name the bad-test shape at write time. A `no-mock-echo` test over a thin pass-through wrapper can still earn a clean mutation score while testing nothing real.

When these rules ship, they are candidates to distill into taste-distillery canon as a test-integrity / anti-slop-tests card. taste-distillery deliberately does not pre-track this item; it distills from shipped evidence instead.

## Why deferred

Kept as an active backpressure follow-up during the introspection migration disposition pass.

## Revisit trigger

Revisit in backpressure when the original tracker condition above is ready to build.