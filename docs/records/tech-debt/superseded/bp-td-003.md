---
schema_version: 1
id: BP-TD-003
repo_key: BP
record_type: tech-debt
number: 3
title: General and boundaries preset growth
status: superseded
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-06-10T00:00:00Z
updated_at: 2026-06-10T00:00:00Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/superseded
  - visibility/local-only
source:
  discovered_at: 2026-06-10T00:00:00Z
  refs:
    - kind: tracker
      ref: docs/exec-plans/tech-debt-tracker.md#td-003
resolution:
  disposition: superseded
  resolved_at: 2026-06-10T00:00:00Z
  rationale: Growth criteria are owned by rule intake.
  evidence_refs:
    - kind: doc
      ref: docs/design-docs/rule-intake.md
---
General and boundaries preset growth.

## Problem

Grow `general` and `boundaries` only when a rule is stack-neutral or architecture-specific enough to avoid surprising Effect consumers and non-Effect consumers.

## Why deferred

Growth criteria are owned by rule intake.

## Revisit trigger

No further trigger remains; the WI-12 migration disposition closed this legacy entry as superseded.