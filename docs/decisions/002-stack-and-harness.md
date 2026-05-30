# ADR 002: Stack and harness

- Status: accepted
- Date: 2026-05-30

## Context

This repo needs a small, reproducible toolchain for TypeScript package authoring, lint-rule tests, prose checks, and npm publishing. The stack should match MP's personal defaults and avoid copying the source rule repo's projen, Yarn, or Biome setup.

## Decision

Use pnpm 11 workspaces with strict supply chain settings, vite-plus as the local command front door, strict TypeScript with `exactOptionalPropertyTypes: true`, Vitest for tests, oxlint hard ceilings for repo source, and Vale through doc-garden's Personal dev-tooling profile.

Release readiness will be proven by build, `npm pack`, packed-consumer smoke tests, package allowlist checks, and a delegated mutation-testing sweep before first publish. CI and OIDC trusted publishing are planned after the baseline, not implemented in this first work group.

## Consequences

- Corepack owns pnpm through `packageManager`; `mise.toml` owns non-npm binaries such as Vale.
- `vp check` remains the fast local shape, while package scripts expose named `lint`, `typecheck`, `test`, `build`, `prose`, and `check` commands.
- The repo's own source can adopt stricter oxlint ceilings than legacy repos because this codebase is greenfield.
