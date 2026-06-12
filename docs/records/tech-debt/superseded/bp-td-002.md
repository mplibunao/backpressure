---
schema_version: 1
id: BP-TD-002
repo_key: BP
record_type: tech-debt
number: 2
title: Package split triggers
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
      ref: docs/exec-plans/tech-debt-tracker.md#td-002
resolution:
  disposition: superseded
  resolved_at: 2026-06-10T00:00:00Z
  rationale: Split-trigger policy is owned by the package/preset design docs.
  evidence_refs:
    - kind: doc
      ref: docs/design-docs/preset-architecture.md
---
Package split triggers.

## Problem

Keep new stack opinions as presets or config files until a domain earns an independent package through separate cadence, heavy peer dependencies, or clearer discoverability.

## Why deferred

Split-trigger policy is owned by the package/preset design docs.

## Revisit trigger

No further trigger remains; the WI-12 migration disposition closed this legacy entry as superseded.