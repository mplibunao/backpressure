# ADR 007: tsgo delegation and overlap

- Status: accepted
- Date: 2026-09-25

## Context

ADR 001 delegated type-aware Effect semantics to `@effect/language-service` and allowed AST overlap only when the AST rule gives useful config-free backpressure. ADR 004 reused that language-service wording for type-aware checks. The Effect v4 alignment (`docs/exec-plans/active/effect-rules-v4-alignment-2026-09-25.md`) found that language-service diagnostics do not reach agents, and that `@effect/tsgo` can report those checks through patched oxlint next to this package's rules.

ADR 003 said v0 does not expand beyond `@mplibunao/oxlint-standards` and `@mplibunao/tsconfig`. The alignment also needs a private unpublished local viewer so people can read the composed rule list.

## Decision

Type-aware Effect checks are delegated to `@effect/tsgo`. This package still ships structural oxlint rules only. Gen-first, v4-primary, Data-versus-Schema, and graded-severity decisions from ADR 001 and ADR 004 stay in force.

The default Effect consumer route is patched oxlint (`effect-tsgo patch --no-typescript --oxlint`). The alternative is patched TypeScript 7 `tsc` (`effect-tsgo patch`). A project selects one route, never both. One selected route has one severity owner. Packages ship settings and setup instructions, not a patching runtime. Published packages may declare `@effect/tsgo` only as an optional peer dependency, never as a runtime dependency. Consumers add `@effect/tsgo` and the prepare patch themselves. Backpressure itself does not use Effect and does not patch its own oxlint.

The default Effect preset requires the patched oxlint route: its `effecttsgo/*` settings make an unpatched oxlint stop with an unknown-plugin error. The oxlint peer range stays `^1.58.0` so non-Effect consumers keep the existing unpatched baseline.

Policy is an explicit pinned `@effect/tsgo` list generated from category defaults plus named exceptions. The repo does not extend upstream `recommended`, whose membership moves independently of this pack.

An AST check may overlap a `@effect/tsgo` diagnostic when it is stricter or when it fires without a TypeScript project. That overlap keeps rules such as `no-json-parse` beside `prefer-schema-over-json` and keeps `no-barrel-import`.

Private, unpublished tool packages are allowed in v0. `packages/rules-viewer` is one such package: `"private": true`, no `version` field, and no publish or pack scripts. Published package names stay under `@mplibunao/*`.

This decision is accepted. The shipping package still follows ADR 001's language-service recommendation until the alignment cutover lands.

## Consequences

- Positive: Effect consumers get type-aware diagnostics in the same oxlint channel agents already run.
- Positive: non-Effect consumers keep the existing oxlint peer baseline.
- Positive: a private viewer can exist without becoming a published package.
- Negative: Effect consumers must install `@effect/tsgo` and run the patch; an unpatched oxlint fails the Effect preset.
- Negative: two routes exist, and using both duplicates reports.
- Follow-up: land the alignment through the active execution ledger. Current-state design docs keep describing the language-service setup until that cutover lands.
