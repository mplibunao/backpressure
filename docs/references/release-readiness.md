# Release readiness: v0 packages

This checklist is the publish gate for the two v0 packages: `@mplibunao/oxlint-standards` and `@mplibunao/tsconfig`.

## Required local gate

Run these commands before opening the release refactor/review gate:

1. `pnpm check`
2. `pnpm pack:dry-run`
3. `git diff --check`

`pnpm check` includes build, the release workflow contract check, rule inventory, fixture replay, the oxlint packed-consumer smoke, the tsconfig packed-consumer smoke, recursive package dry-run checks, and the prose gate. `pnpm pack:dry-run` remains a separate explicit release-readiness command because it is the direct publish-artifact check a maintainer expects to run before release.

## Package artifact contracts

`pnpm oxlint:package:allowlist` runs `scripts/check-oxlint-package-allowlist.ts`, the authoritative package allowlist assertion for `@mplibunao/oxlint-standards`.

The oxlint package script checks all of the following:

- `packages/oxlint-standards/package.json` keeps the publish `files` allowlist to `dist`, `README.md`, `LICENSE`, and `NOTICE.md`.
- `npm pack --dry-run --json` includes only root package metadata/docs and compiled `dist` files.
- required runtime and type entrypoints are present, including `dist/index.js`, `dist/index.d.ts`, `dist/plugin.js`, and `dist/rule-manifest.js`.
- private inputs such as source, tests, fixtures, and tsconfig files do not leak into the tarball.
- no Rika dependency is declared in the publish package.

`pnpm tsconfig:package:allowlist` runs `scripts/check-tsconfig-package-allowlist.ts`, the authoritative package allowlist assertion for `@mplibunao/tsconfig`.

The tsconfig package script checks all of the following:

- `packages/tsconfig/package.json` keeps the publish `files` allowlist to `base.json`, `server.json`, `browser.json`, `LICENSE`, and `NOTICE.md`.
- `npm pack --dry-run --json` includes only the three config JSON files, package metadata, license, and notice.
- the package exports only `./base.json`, `./server.json`, `./browser.json`, and `./package.json`.
- `publishConfig.access` remains `public`.

`pnpm smoke:oxlint-packed-consumer` remains the runtime proof for `@mplibunao/oxlint-standards`: it builds the package, packs a tarball, installs that tarball in throwaway consumers, imports the public entrypoint, typechecks the public types without `@oxlint/plugins` as a consumer dependency, and runs real oxlint through `jsPlugins`.

`pnpm smoke:tsconfig-packed-consumer` is the runtime proof for `@mplibunao/tsconfig`: it packs a tarball, installs that tarball in a throwaway TypeScript project, and runs `tsc --noEmit` against projects that extend `@mplibunao/tsconfig/base.json`, `@mplibunao/tsconfig/server.json`, and `@mplibunao/tsconfig/browser.json`.

## Rule catalog contract

`scripts/check-rule-inventory.ts` remains the catalog-completeness assertion. The rule inventory covers the 50 `biome-effect-linting-rules` v0.0.6 rules and every intentional exception. The exceptions are the dropped anti-house-style rules, the built-in replacement for `no-ternary`, v0.0.6 refinements, `effect-no-multiple-provide`, recon additions, structural executor reimplementations, and `@effect/language-service` delegated semantic checks. Rika remains reference material only, not a dependency.

## Mutation gate status

Item 18 passed on 2026-05-31 with a behavioral mutation score of **81.81%** (`3981` killed + `13` timeout / `4882` total). The durable evidence is `docs/references/mutation-sweep-v0-2026-05-31.md`.

Mutation testing is a procedural local publish gate, not a CI gate. CI does not run Stryker because the sweep is intentionally delegated, slow, and review-heavy. Before publishing `@mplibunao/oxlint-standards`, reviewers should confirm that the dated Item 18 evidence still matches the release candidate or rerun the mutation workflow if rule/helper behavior changed after that evidence. The JSON-only `@mplibunao/tsconfig` package does not need a mutation sweep.

## GitHub/npm release workflow

`pnpm check-release-workflow` verifies that `.github/workflows/release.yml` and this release-readiness reference agree on the package input options, publish job IDs, package-specific GitHub environments, and package allowlist commands.

`.github/workflows/release.yml` has separate publish jobs and separate GitHub environments for each v0 package:

- `publish-oxlint-standards` publishes from `packages/oxlint-standards` through the `npm-publish-oxlint-standards` GitHub environment.
- `publish-tsconfig` publishes from `packages/tsconfig` through the `npm-publish-tsconfig` GitHub environment.

Both publish jobs require `id-token: write`, check that npm is at least `11.5.1`, and publish with `npm publish --provenance`. The workflow is manually dispatched with one package selected per run, so each package keeps an independent release cadence and an independent npm Trusted Publishing binding.

Before the first publish, migrate the Item 19 oxlint setup away from the old generic `npm-publish` GitHub environment name. The oxlint package must use the package-specific `npm-publish-oxlint-standards` GitHub environment, and the npm Trusted Publishing binding for `@mplibunao/oxlint-standards` must point to this repository, `.github/workflows/release.yml`, and that exact environment name. If the generic `npm-publish` environment already exists from Item 19, rename it to `npm-publish-oxlint-standards` or recreate the binding after creating the package-specific environment; do not leave the oxlint package bound to `npm-publish`.

Configure a separate npm Trusted Publishing binding for package `@mplibunao/tsconfig` against the same repository/workflow and the `npm-publish-tsconfig` GitHub environment. Do not add an `NPM_TOKEN` for either package.

Each publish job is guarded to run only from `refs/heads/main`. Create and protect both package-specific GitHub environments; only maintainers should be able to approve either environment from `main` after the check job passes. Branch protection remains the separate operational backstop for getting changes onto `main`.

## CI/release duplication decision

Item 20 re-evaluated release setup duplication after adding the second package. The workflow still keeps explicit package-specific publish jobs instead of extracting a composite action or reusable workflow. The repeated setup block is short and stable, while the release behavior differs by package: the oxlint job builds compiled plugin output and runs the oxlint allowlist, and the tsconfig job validates a JSON-only package allowlist. A shared abstraction would hide those release differences without removing enough maintenance cost yet. Extract a composite action only after a third package or another repeated package-specific release path makes the duplication operational rather than cosmetic.
