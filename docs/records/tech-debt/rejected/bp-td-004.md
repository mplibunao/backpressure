---
schema_version: 1
id: BP-TD-004
repo_key: BP
record_type: tech-debt
number: 4
title: ESLint RuleTester cross-check
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
      ref: docs/exec-plans/tech-debt-tracker.md#td-004
resolution:
  disposition: rejected
  resolved_at: 2026-06-10T00:00:00Z
  rationale: Oxlint-only direction is settled; the portability cross-check was not pursued.
---
ESLint RuleTester cross-check.

## Problem

Oxlint RuleTester is the primary runtime because it proves parser parity. Add ESLint RuleTester only as an optional portability cross-check after the first structural rules are stable.

## Why deferred

Oxlint-only direction is settled; the portability cross-check was not pursued.

## Revisit trigger

No further trigger remains; the WI-12 migration disposition closed this legacy entry as rejected.