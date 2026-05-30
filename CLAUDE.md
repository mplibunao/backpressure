# backpressure agent router

This repo is MP's personal monorepo for code-quality backpressure tooling. The v0 scope is intentionally narrow:

- `@mplibunao/oxlint-standards`: opinionated oxlint JS-plugin presets.
- `@mplibunao/tsconfig`: strict shared TypeScript configs, planned after the oxlint package proves the pipeline.

## Start here

- Active setup plan: `docs/exec-plans/active/backpressure-monorepo-setup-2026-05-29.md`.
- Current rule-pack design: `docs/design-docs/rule-pack-architecture.md`.
- Preset taxonomy and consumer-safety model: `docs/design-docs/preset-architecture.md`.
- Accepted decisions index: `docs/decisions/index.md`.
- Deferred work tracker: `docs/exec-plans/tech-debt-tracker.md`.
- Prose gate policy: `docs/references/prose-gate.md`.

## Tooling posture

- Package manager: pnpm 11 via `packageManager` and Corepack.
- Local front door: vite-plus (`vp`) for formatting, linting, testing, and hooks.
- Non-npm tooling: `mise.toml`, currently Vale and Node.
- Prose gate: repo-local Vale config, always run with `--no-global`.

## Working rules

- Keep the active setup plan under `docs/exec-plans/active/` until the plan is actually complete.
- `AGENTS.md` is a symlink to this file. Update this file, not the symlink.
- Do not build oxlint rule logic during the baseline group. Empty package scaffolding is allowed only so build and package checks can run.
- Use a hard cutover when behavior changes. Do not add backwards-compatibility shims unless MP asks.
