# backpressure

MP's monorepo for homegrown code-quality backpressure tooling.

Current v0 packages:

- `@mplibunao/oxlint-standards`: opinionated oxlint JS-plugin presets.
- `@mplibunao/tsconfig`: strict shared TypeScript configs.

## Current scope

The completed setup plan lives at `docs/exec-plans/completed/backpressure-monorepo-setup-2026-05-29.md`.

Release readiness, including the unified Changesets publish flow and npm Trusted Publishing setup, lives at `docs/references/release-readiness.md`.

`packages/oxlint-standards` is the oxlint rule pack: custom rules, presets, and config fragments, including the Effect preset. See [its README](packages/oxlint-standards/README.md) for setup. `docs/references/rules.md` lists every rule each preset and config turns on.

`packages/tsconfig` holds the strict shared TypeScript configs and the Effect overlays. See [its README](packages/tsconfig/README.md).

`packages/rules-viewer` is a private, unpublished local viewer for the rule list; `pnpm rules:view` starts it.
