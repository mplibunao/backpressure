---
schema_version: 1
id: BP-TD-002
repo_key: BP
record_type: tech-debt
number: 2
title: Package split triggers
status: superseded
category: tech-debt
visibility: local-only
created_at: 2026-06-10T00:00:00Z
updated_at: 2026-09-27T04:16:52Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/superseded
  - visibility/local-only
source:
  discovered_at: 2026-06-10T00:00:00Z
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

No further trigger remains; the introspection migration disposition closed this legacy entry as superseded.