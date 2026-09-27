---
schema_version: 1
id: BP-TD-012
repo_key: BP
record_type: tech-debt
number: 12
title: Enforce JSDoc presence on public API via a custom oxlint plugin rule
status: open
category: tech-debt
visibility: local-only
created_at: 2026-06-16T06:05:04Z
updated_at: 2026-09-27T04:16:52Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-06-16T06:05:04Z
---
## Problem

Native oxlint has no require-jsdoc rule, so it cannot require a doc block on exported or public symbols; the require-param and require-returns rules only validate doc blocks that already exist. The lint deep pass (docs/reviews/lint-rule-disposition-resolution-2026-06-16.md) adopts the native validate-where-documented set as the interim. MP wants JSDoc on public surfaces generally, since it replaces comments and feeds editor autocomplete. The right home for that enforcement is a custom rule in the oxlint-standards plugin, in the same shape as the Effect rules: a rule that walks exported function, class, and interface declarations and reports a missing leading doc block. Shipping it in the plugin means every adopting repo inherits it with no per-repo setup, unlike a repo-local ast-grep rule. Running eslint-plugin-jsdoc require-jsdoc directly is unlikely to work under oxlint JS-plugin host, which uses the @oxlint/plugins API rather than the ESLint rule API, so a native port or a custom rule is the realistic path.

## Why deferred

The interim validate-where-documented set lands in this pass. Building the custom require-on-public-API rule is additional work, a new rule visitor plus its tests and manifest entry, so it is split out rather than blocking the base config change.

## Revisit trigger

Revisit when MP wants enforced public-API documentation rather than validation only. Build the custom rule (suggested name require-jsdoc-on-exports) scoped to exported declarations and graded agent-failure-mode, then add it to the general domain so it ships in base.
