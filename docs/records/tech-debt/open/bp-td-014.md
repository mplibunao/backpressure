---
schema_version: 1
id: BP-TD-014
repo_key: BP
record_type: tech-debt
number: 14
title: Drop prefer-effect-fn again when tsgo's oxlint route keeps Effect options through extends
status: open
type: introspection-record
category: tech-debt
visibility: local-only
created_at: 2026-09-26T04:52:16Z
updated_at: 2026-09-26T07:30:00Z
tags:
  - record/tech-debt
  - repo/backpressure
  - status/open
  - visibility/local-only
source:
  discovered_at: 2026-09-26T04:52:16Z
---
## Problem

The Effect v4 alignment dropped the custom `prefer-effect-fn` rule in favor of `effecttsgo/effect-fn-opportunity`. That tsgo rule reports a wrapper only when an enabled `effectFn` fix variant applies to it. Upstream's default `effectFn` is `["span"]`, which covers only a wrapper piped into `Effect.withSpan`. The `@mplibunao/tsconfig/effect.json` overlay sets `["span", "inferred-span", "suggested-span"]`, which also covers the plain wrappers `prefer-effect-fn` catches.

On the default route (patched oxlint `1.82.0` with oxlint-tsgolint `7.0.2001`, `@effect/tsgo` `0.45.0`), tsgolint reads the Effect options from the `tsconfig.json` nearest each linted file. It applies them only when that file has no `extends`. Any `extends`, including extending the overlay, falls back to upstream defaults. The shipped setup extends the overlay, so plain `(...) => Effect.gen(...)` wrappers would go unreported. `prefer-effect-fn` is restored as an overlapping AST rule to keep that coverage.

## Reproduction

Lint three exported wrappers with only `effecttsgo/effect-fn-opportunity` enabled: `function addOne(n) { return Effect.gen(...) }`, `const addTwo = (n) => Effect.gen(...)`, and `const addThree = (n) => Effect.gen(...).pipe(Effect.withSpan('addThree'))`.

- A `tsconfig.json` with no `extends` and the overlay's plugin entry inline reports all three.
- The same `tsconfig.json` with no plugin entry reports only `addThree`.
- Any `extends` reports only `addThree`. The tested forms were a plain base with the plugin entry in the leaf, a plugin-only base file, and `effect.json` alone or in an array.
- `--tsconfig` does not change which file supplies the Effect options.

The TypeScript 7.0.2 route patched by `effect-tsgo patch` keeps the options through `extends` and reports all three. In the tagged source, the patched `tsc` imports `etscheckerhooks`, which registers the Effect option merge hook, and the tsgolint patch does not. Upstream fixed the same bug for `tsc` in Effect-TS/tsgo#176 (issue #169). The oxlint-route report is Effect-TS/tsgo#766.

## Why deferred

The fix belongs to upstream's tsgolint integration, and the backpressure landing group cannot wait for an upstream release. The restored AST rule keeps the error floor for the wrappers it catches without a TypeScript project.

## Revisit trigger

Upstream merged the fix in Effect-TS/tsgo#768 on 2026-09-26, after the 0.46.0 release. Revisit when the first `@effect/tsgo` release with the fix is published; MP allows that release in before the seven-day `minimumReleaseAge` window closes, through exact-version exclusions. Also revisit on every `@effect/tsgo` bump. `scripts/packages/oxlint-standards/smoke-effect-packed-consumer.ts` asserts the current behavior: under the shipped setup, `effect-fn-opportunity` reports only the `Effect.withSpan` wrapper. It fails with a message naming this record when tsgo starts reporting the plain wrappers.

## Done when

Done when `effecttsgo/effect-fn-opportunity` reports all three wrapper shapes under a consumer `tsconfig.json` that extends `effect.json` on the default route, and `prefer-effect-fn` is dropped again with a `replacedBy` edge to it and a restored replacement floor.
