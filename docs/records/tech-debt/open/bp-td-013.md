---
schema_version: 1
id: BP-TD-013
repo_key: BP
record_type: tech-debt
number: 13
title: Re-enable jsdoc/check-param-names for stale @param drift once oxlint ships it
status: open
category: tech-debt
visibility: local-only
created_at: 2026-06-16T13:29:14Z
updated_at: 2026-09-27T04:16:52Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-06-16T13:29:14Z
---
## Problem

DP-4 of the lint deep pass (see docs/reviews/lint-rule-disposition-resolution-2026-06-16.md) folded the native validate-where-documented jsdoc set into `jsdocConfig`. The resolution named `jsdoc/check-param-names` as the rule that checks documented parameter names against the signature, but oxlint 1.58.0 does not ship it. The oxlint rule listing has no such entry, and configuring `jsdoc/check-param-names` produces an error that the rule is not found in the jsdoc plugin. The shipped set uses `jsdoc/require-param`, which reports a real signature parameter that an existing doc block fails to document. One drift case stays uncovered. A stale `@param` tag for a parameter that no longer exists produces no diagnostic as long as every real parameter still has its own tag. The DP-4 behavioral drift guard in drift-guards.test.ts pins this gap as a living test that turns red if a future oxlint version starts catching it.

## Why deferred

`jsdoc/check-param-names` is not available in the pinned oxlint version, so the missing coverage cannot be added by turning a rule on. A custom plugin rule would be the realistic way to add it now, which is more work than this base-config pass should carry. The interim `require-param` and `require-returns` pair already catches the common agent-failure-mode where a doc block drifts from the signature after a parameter is added or renamed. The residual stale-tag case is rare and does not block DP-4.

## Revisit trigger

Revisit when a future oxlint version ships `jsdoc/check-param-names`. At that point the rule belongs in the `jsdocConfig` re-enable set, graded correctness in the manifest and dropped from the silence wall. The stale `@param` fixture in the DP-4 behavioral drift guard should then expect a diagnostic instead of an empty result.

## Done when

Done when `jsdoc/check-param-names` resolves active in baseConfig and the behavioral drift guard asserts that it reports on a stale `@param` tag.
