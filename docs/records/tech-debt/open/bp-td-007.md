---
schema_version: 1
id: BP-TD-007
repo_key: BP
record_type: tech-debt
number: 7
title: Future stack-neutral React preset
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
      ref: docs/exec-plans/tech-debt-tracker.md#td-007
---
Future stack-neutral React preset.

## Problem

Reserve `react` for stack-neutral React rules such as rules-of-hooks, exhaustive-deps, JSX key checks, and anti-`useEffect` guidance. Evaluate react.doctor as both a rule source and a diagnostics layer to recommend, then lift only cheap structural rules that fill a gap.

## Why deferred

Kept as an active backpressure follow-up during the introspection migration disposition pass.

## Revisit trigger

Revisit in backpressure when the original tracker condition above is ready to build.