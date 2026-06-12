---
schema_version: 1
id: BP-TD-001
repo_key: BP
record_type: tech-debt
number: 1
title: Executor-coupled rules
status: rejected
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-06-10T00:00:00Z
updated_at: 2026-06-10T00:00:00Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/rejected
  - visibility/local-only
source:
  discovered_at: 2026-06-10T00:00:00Z
  refs:
    - kind: tracker
      ref: docs/exec-plans/tech-debt-tracker.md#td-001
resolution:
  disposition: rejected
  resolved_at: 2026-06-10T00:00:00Z
  rationale: Tied to executor's application boundaries, not general package material (MP cleanup ruling, 2026-06-01).
---
Executor-coupled rules.

## Problem

Do not build `no-direct-cloud-executor-schema-import`, `require-reactivity-keys`, or workos-vault-scoped rules in v0. These rules are tied to executor's application boundaries, not a general reusable package.

## Why deferred

Tied to executor's application boundaries, not general package material (MP cleanup ruling, 2026-06-01).

## Revisit trigger

No further trigger remains; the WI-12 migration disposition closed this legacy entry as rejected.