# backpressure

MP's monorepo for homegrown code-quality backpressure tooling.

Current v0 packages:

- `@mplibunao/oxlint-standards`: opinionated oxlint JS-plugin presets.
- `@mplibunao/tsconfig`: strict shared TypeScript configs.

## Current scope

The completed setup plan lives at `docs/exec-plans/completed/backpressure-monorepo-setup-2026-05-29.md`.

Release readiness, including the unified Changesets publish flow and npm Trusted Publishing setup, lives at `docs/references/release-readiness.md`.

`packages/oxlint-standards` contains the group-3 Effect catalog substrate: 47 linteffect v0.0.6 rules are ported, 21 structural executor/recon rules are reimplemented, 1 built-in default is enabled, 13 checks are delegated to `@effect/language-service`, and 3 source rules are explicitly dropped. The package validates implemented rules through RuleTester, real oxlint fixture replay, and packed-consumer smoke testing.

`packages/tsconfig` contains the second v0 package. It publishes `base.json`, `server.json`, and `browser.json` strict TypeScript presets with `exactOptionalPropertyTypes` enabled, validates the package tarball allowlist, and smoke-tests all three exported configs from a packed throwaway TypeScript consumer.
