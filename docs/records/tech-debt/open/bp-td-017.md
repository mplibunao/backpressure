---
schema_version: 1
id: BP-TD-017
repo_key: BP
record_type: tech-debt
number: 17
title: Triage the rules and supported versions of the next @effect/tsgo pin
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-09-26T12:13:08Z
updated_at: 2026-09-26T12:13:08Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-09-26T12:13:08Z
---
## Problem

The Effect preset pins `@effect/tsgo` 0.45.0 and sets all 113 of its rules explicitly, generated from `scripts/config/tsgo-policy.ts` and the retained snapshot `scripts/references/tsgo/0.45.0/metadata.json`. Its supported tools are equally exact: oxlint `1.81.0` or `1.82.0` (`vite-plus` `0.3.1` or `0.3.2`), oxlint-tsgolint `7.0.2001`, and TypeScript `7.0.2` for the patched-tsc route. `vite-plus` `0.3.3` (oxlint `1.83.0`) and `1.0.0-rc` (oxlint `1.85.0`) are not supported, so consumers cannot upgrade `vite-plus` until the pin moves. A new release can add, rename, or re-categorize rules. A new rule silently takes its category's default severity, so each one needs a deliberate grade.

## Why deferred

No release newer than 0.45.0 carries the upstream fix for Effect options through `extends` (Effect-TS/tsgo#768), which BP-TD-014 waits on. Bumping to 0.46.0 would change the supported matrix and the rule set without that fix, so the next bump waits for the release that contains it.

## Revisit trigger

Revisit when an `@effect/tsgo` release containing Effect-TS/tsgo#768 is published. MP allows that release in before the seven-day `minimumReleaseAge` window closes, through exact-version exclusions for `@effect/tsgo` and its platform binary packages. Also revisit when a later `vite-plus` release is needed and a newer `@effect/tsgo` supports its oxlint.

## Done when

Done when the catalog and `scripts/config/effect-toolchain.json` pin the new release, its metadata snapshot replaces the 0.45.0 one, every new, renamed, or re-categorized rule has a reviewed grade in the policy, the supported matrix in both package READMEs matches the release, and `pnpm check:effect-integration` passes on the new matrix.
