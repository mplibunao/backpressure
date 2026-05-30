# backpressure

MP's monorepo for homegrown code-quality backpressure tooling.

Current v0 packages:

- `@mplibunao/oxlint-standards`: opinionated oxlint JS-plugin presets.
- `@mplibunao/tsconfig`: planned strict shared TypeScript configs after the oxlint package proves the pipeline.

## Current scope

The active setup plan lives at `docs/exec-plans/active/backpressure-monorepo-setup-2026-05-29.md`.

`packages/oxlint-standards` now contains the group-3 Effect catalog substrate: 47 linteffect v0.0.6 rules are ported, 21 structural executor/recon rules are reimplemented, 1 built-in default is enabled, 13 checks are delegated to `@effect/language-service`, and 3 source rules are explicitly dropped. The package validates implemented rules through RuleTester, real oxlint fixture replay, and packed-consumer smoke testing.

`@mplibunao/tsconfig` remains out of this work group.
