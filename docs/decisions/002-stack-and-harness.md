# ADR 002: Stack and harness

- Status: accepted
- Date: 2026-05-30

## Context

This repo needs a small, reproducible toolchain for TypeScript package authoring, lint-rule tests, prose checks, and npm publishing. The stack should match MP's personal defaults and avoid copying the source rule repo's projen, Yarn, or Biome setup.

## Decision

Use pnpm 11 workspaces with strict supply chain settings, vite-plus as the local command front door, strict TypeScript with `exactOptionalPropertyTypes: true`, Vitest for tests, oxlint hard ceilings for repo source, and Vale through doc-garden's Personal dev-tooling profile.

Release readiness is proven by build, `npm pack`, packed-consumer smoke tests, the dedicated package allowlist script, and a delegated mutation-testing sweep before first publish. CI runs the local gate plus fixture replay, package allowlist, and packed-consumer smoke. Mutation testing remains a procedural local publish gate, not a CI gate; keep current evidence in [release readiness](../references/release-readiness.md#mutation-gate-status) and the [mutation sweep report](../references/mutation-sweep-v0-2026-05-31.md) rather than embedding dated scores in this durable ADR. OIDC trusted publishing uses a manual workflow until npm trusted-publisher bindings are configured.

## Consequences

- Corepack owns pnpm through `packageManager`; `mise.toml` owns non-npm binaries such as Vale.
- `vp check` remains the fast local shape, while package scripts expose named `lint`, `typecheck`, `test`, `build`, `prose`, and `check` commands.
- The repo's own source can adopt stricter oxlint ceilings than legacy repos because this codebase is greenfield.
- npm trusted publishing needs one binding per package. Configure `@mplibunao/oxlint-standards` against `.github/workflows/release.yml` before the first publish; configure `@mplibunao/tsconfig` separately when Item 20 lands. Do not store an `NPM_TOKEN`.
