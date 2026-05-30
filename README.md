# backpressure

MP's monorepo of homegrown code-quality "backpressure" tooling:

- `@mplibunao/oxlint-standards`: opinionated oxlint rule presets
- `@mplibunao/tsconfig`: strict shared TypeScript configs

> Status: monorepo scaffold plus first oxlint rule substrate in progress.

## Current scope

The active setup plan lives at `docs/exec-plans/active/backpressure-monorepo-setup-2026-05-29.md`.

The first package is `packages/oxlint-standards`. It currently proves the minimal oxlint JS-plugin substrate with `no-effect-as`, real-engine fixture replay, packed-consumer smoke testing, and CI / OIDC publishing skeletons.
