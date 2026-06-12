# backpressure agent router

This repo is MP's personal monorepo for code-quality backpressure tooling. The v0 scope is intentionally narrow:

- `@mplibunao/oxlint-standards`: opinionated oxlint JS-plugin presets.
- `@mplibunao/tsconfig`: strict shared TypeScript configs.

## Start here

- Completed setup plan: `docs/exec-plans/completed/backpressure-monorepo-setup-2026-05-29.md`.
- Current rule-pack design: `docs/design-docs/rule-pack-architecture.md`.
- Preset taxonomy and consumer-safety model: `docs/design-docs/preset-architecture.md`.
- Candidate-rule intake procedure: `docs/design-docs/rule-intake.md`.
- Lint architecture terminology (rule / plugin / preset / shareable config): `docs/references/lint-glossary.md`.
- Accepted decisions index: `docs/decisions/index.md`.
- Deferred work records: run `introspection prime` before planning and `introspection check` before finishing changes.
- Legacy tracker pointer: `docs/exec-plans/tech-debt-tracker.md` explains the cutover to `docs/records/tech-debt/`.
- Prose gate policy: `docs/references/prose-gate.md`.

## Tooling posture

- Package manager: pnpm 11 via `packageManager` and Corepack.
- Authored TypeScript script runtime: Bun, pinned in `mise.toml` and `package.json.engines.bun`; CI and release get Bun from the existing `jdx/mise-action` install step. ADR-005 owns the detailed runtime boundary.
- Local front door: vite-plus (`vp`) for formatting, linting, testing, and hooks.
- Non-npm tooling: `mise.toml`, currently Bun, Node, and Vale.
- Introspection CLI: consumed from the local `../introspection` checkout during the WI-14 dogfood phase; `pnpm check` runs `introspection check` before prose.
- Prose gate: repo-local Vale config, always run with `--no-global`.

## Working rules

- Keep active exec plans under `docs/exec-plans/active/`; move them to `docs/exec-plans/completed/` when the plan is complete.
- Use `introspection prime` to inspect active deferred work and `introspection check` to validate record health. Do not add new deferrals to the legacy tracker.
- `AGENTS.md` is a symlink to this file. Update this file, not the symlink.
- Do not build oxlint rule logic during the baseline group. Empty package scaffolding is allowed only so build and package checks can run.
- Use a hard cutover when behavior changes. Do not add backwards-compatibility shims unless MP asks.
