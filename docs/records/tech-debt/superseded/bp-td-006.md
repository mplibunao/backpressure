---
schema_version: 1
id: BP-TD-006
repo_key: BP
record_type: tech-debt
number: 6
title: Optional hygiene gates
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
      ref: docs/exec-plans/tech-debt-tracker.md#td-006
resolution:
  disposition: superseded
  resolved_at: 2026-06-10T00:00:00Z
  rationale: Earn-the-gate candidates are rule intake's job. During WI-14, add the two named rule candidates (`no-js-extension-imports`, `no-opaque-instance-fields`; reference impls in effect-smol `@effect/oxc`) to `rule-intake.md` if absent.
  evidence_refs:
    - kind: doc
      ref: docs/design-docs/rule-intake.md
---
Optional hygiene gates.

## Problem

Madge circular-dependency checks, bundle-size diffs, ast-grep repo hygiene, `no-js-extension-imports`, and `no-opaque-instance-fields` are out of the baseline. Add each only when a concrete pattern earns the gate.

## Why deferred

Earn-the-gate candidates are rule intake's job. During WI-14, add the two named rule candidates (`no-js-extension-imports`, `no-opaque-instance-fields`; reference impls in effect-smol `@effect/oxc`) to `rule-intake.md` if absent.

## Revisit trigger

No further trigger remains; the WI-12 migration disposition closed this legacy entry as superseded.