---
schema_version: 1
id: BP-TD-009
repo_key: BP
record_type: tech-debt
number: 9
title: Catalog domain split and replay-scenario consolidation
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
      ref: docs/exec-plans/tech-debt-tracker.md#td-009
---
Catalog domain split and replay-scenario consolidation.

## Problem

WG3 refactor review on 2026-05-31 extracted shared import, wrapper-ownership, side-effect, preset, and script-runtime helpers. The review deliberately left three follow-ups: keep `rule-catalog.ts` unsplit, keep the full RuleTester/replay scenario corpus in place, and keep repeated AST/mock-context builders inside mutation-hardening utility tests instead of moving them to a test-support module. The catalog still has cross-rule ownership predicates that can break when moved blindly, and the replay matrix is the current behavior oracle. Trigger this cleanup after WG3 is merged and before adding the next large rule family: first create generated before/after rule maps and replay-case snapshots, then split one domain at a time (`general`, `boundaries`, `effect-react`, then `effect`). Move shared scenario strings into a test-support module only when the snapshots prove identical membership and diagnostics, plus stable branch IDs.

## Why deferred

Kept as an active backpressure follow-up during the introspection migration disposition pass.

## Revisit trigger

Revisit in backpressure when the original tracker condition above is ready to build.