---
schema_version: 1
id: BP-TD-011
repo_key: BP
record_type: tech-debt
number: 11
title: Revisit dropping `yaml` if Bun gains strict YAML parsing
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
      ref: docs/exec-plans/tech-debt-tracker.md#td-011
---
Revisit dropping `yaml` if Bun gains strict YAML parsing.

## Problem

The Bun runtime migration (`docs/exec-plans/completed/bun-runtime-migration-2026-06-07.md`) keeps the `yaml` dependency. `scripts/checks/check-release-workflow.ts` needs duplicate-key rejection, and Bun's built-in `Bun.YAML.parse` silently keeps the last value on duplicate keys (probed on Bun 1.3.11; the current API reference still exposes only `parse(input: string)` with no strict option). YAML 1.2 treats duplicate mapping keys as an error, so `yaml` with `{ uniqueKeys: true }` is the spec-correct parser and Bun's built-in is a lenient gap.

Revisit swapping `yaml` for `Bun.YAML` only when Bun adds duplicate-key rejection or a strict parsing option. The single consumer is `check-release-workflow.ts`, and the duplicate-key test in `check-release-workflow.test.ts` is the guard to keep green through any future swap. No upstream issue was filed (decision 2026-06-07).

## Why deferred

Kept as an active backpressure follow-up during the introspection migration disposition pass.

## Revisit trigger

Revisit in backpressure when the original tracker condition above is ready to build.