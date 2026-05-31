# ADR 003: Monorepo scope and naming

- Status: accepted
- Date: 2026-05-30

## Context

The original package idea was `@mplibunao/oxlint-standards`. The repo was renamed to `backpressure` so it can hold broader homegrown guardrail tooling without renaming the package that already matches the npm account setup.

## Decision

The git repo and monorepo are named `backpressure`. v0 contains two package tracks: `@mplibunao/oxlint-standards` first, then `@mplibunao/tsconfig` after the oxlint pipeline is proven.

Preset and config files are the unit of opt-in. New stack-specific opinions become new presets or config files inside the relevant package until independent cadence, heavy dependencies, or discoverability justify a separate package.

## Consequences

- The repo charter is broader than lint and tsconfig, but v0 does not expand beyond those packages.
- Effect carve-outs stay inside the `effect` preset. `general` remains stack-neutral.
- Future domains such as drizzle, bun, sql, next, and stack-neutral React can grow as presets before they become packages.

