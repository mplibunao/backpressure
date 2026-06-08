# ADR 005: Repo script language

- Status: accepted
- Date: 2026-05-31

## Context

Repo-authored scripts are release and quality gates. They should fail during normal typechecking when their contracts drift.

## Decision

Write repo-authored scripts in TypeScript by default. Run runnable `scripts/**/*.ts` entrypoints with Bun, using `#!/usr/bin/env bun` for executable files and `bun <relative-path-to-scripts/...>.ts` from package scripts. Keep scripts under `scripts/**/*.ts` so `tsconfig.scripts.json` includes them in `pnpm typecheck`.

Keep package binaries owned by their packages. pnpm owns installs and workspace recursion; Vitest owns tests; `tsc` owns typechecking; Changesets owns versioning and publishing; Stryker owns mutation testing. Do not wrap those package binaries in `bun run --bun` unless a future ADR changes the owner boundary.

Organize TypeScript scripts by purpose:

- `scripts/checks/` holds repo-wide runnable checks.
- `scripts/lib/` holds shared helper modules; do not put runnable entrypoints here.
- `scripts/packages/<package>/` holds package-specific checks, smokes, metadata, and artifact assertions.
- top-level `scripts/*.sh` is reserved for existing shell hook/prose entrypoints.

Use JavaScript or MJS only for tool config files or external tool constraints that cannot load TypeScript directly. When JavaScript or MJS is necessary, add a short local comment or nearby doc note that names the constraint.

## Consequences

- New gate scripts, smoke tests, and inventory checks should follow the existing `scripts/**/*.ts` pattern and use Bun when they are runnable entrypoints.
- Release-readiness checks participate in the same typechecking gate as package code, even though Bun is the execution runtime for authored scripts.
- Tool config files such as `stryker.config.mjs` may stay in the format required by the tool.
- Runtime pin drift is checked separately: `mise.toml` owns the Bun version and `package.json.engines.bun` must match it.
