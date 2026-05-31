# Release readiness: v0 packages

This checklist is the publish gate for the two v0 packages: `@mplibunao/oxlint-standards` and `@mplibunao/tsconfig`.

## Required local gate

Run these commands before opening the release refactor/review gate:

1. `pnpm changesets:check`
2. `pnpm check`
3. `pnpm pack:dry-run`
4. `git diff --check`

`pnpm check` includes build, the release workflow contract check, the Changesets contract check, rule inventory, fixture replay, the oxlint packed-consumer smoke, the tsconfig packed-consumer smoke, recursive package dry-run checks, and the prose gate. `pnpm pack:dry-run` remains a separate explicit release-readiness command because it is the direct publish-artifact check a maintainer expects to run before release.

## Package artifact contracts

`pnpm oxlint:package:allowlist` runs `scripts/packages/oxlint-standards/check-package-allowlist.ts`, the authoritative package allowlist assertion for `@mplibunao/oxlint-standards`.

The oxlint package script checks all of the following:

- `packages/oxlint-standards/package.json` keeps the publish `files` allowlist to `dist`, `README.md`, `CHANGELOG.md`, `LICENSE`, and `NOTICE.md`.
- `npm pack --dry-run --json` includes only root package metadata/docs and compiled `dist` files.
- required runtime and type entrypoints are present, including `dist/index.js`, `dist/index.d.ts`, `dist/plugin.js`, and `dist/rule-manifest.js`.
- private inputs such as source, tests, fixtures, and tsconfig files do not leak into the tarball.
- no Rika dependency is declared in the publish package.

`pnpm tsconfig:package:allowlist` runs `scripts/packages/tsconfig/check-package-allowlist.ts`, the authoritative package allowlist assertion for `@mplibunao/tsconfig`.

The tsconfig package script checks all of the following:

- `packages/tsconfig/package.json` keeps the publish `files` allowlist to `base.json`, `server.json`, `browser.json`, `CHANGELOG.md`, `LICENSE`, and `NOTICE.md`.
- `npm pack --dry-run --json` includes only the three config JSON files, package metadata, changelog, license, and notice.
- the package exports only `./base.json`, `./server.json`, `./browser.json`, and `./package.json`.
- `publishConfig.access` remains `public`.

`pnpm smoke:oxlint-packed-consumer` remains the runtime proof for `@mplibunao/oxlint-standards`: it builds the package, packs a tarball, installs that tarball in throwaway consumers, imports the public entrypoint, typechecks the public types without `@oxlint/plugins` as a consumer dependency, and runs real oxlint through `jsPlugins`.

`pnpm smoke:tsconfig-packed-consumer` is the runtime proof for `@mplibunao/tsconfig`: it packs a tarball, installs that tarball in a throwaway TypeScript project, and runs `tsc --noEmit` against projects that extend `@mplibunao/tsconfig/base.json`, `@mplibunao/tsconfig/server.json`, and `@mplibunao/tsconfig/browser.json`.

## Rule catalog contract

`scripts/checks/check-rule-inventory.ts` remains the catalog-completeness assertion. The rule inventory covers the 50 `biome-effect-linting-rules` v0.0.6 rules and every intentional exception. The exceptions are the dropped anti-house-style rules, the built-in replacement for `no-ternary`, v0.0.6 refinements, `effect-no-multiple-provide`, recon additions, structural executor reimplementations, and `@effect/language-service` delegated semantic checks. Rika remains reference material only, not a dependency.

## Mutation gate status

Item 18 passed on 2026-05-31 with a behavioral mutation score of **81.81%** (`3981` killed + `13` timeout / `4882` total). The durable evidence is `docs/reports/mutation/2026-05-31-v0-sweep.md`.

Mutation testing is a procedural local publish gate, not a CI gate. CI does not run Stryker because the sweep is intentionally delegated, slow, and review-heavy. Before publishing `@mplibunao/oxlint-standards`, reviewers should confirm that the dated Item 18 evidence still matches the release candidate or rerun the mutation workflow if rule/helper behavior changed after that evidence. The JSON-only `@mplibunao/tsconfig` package does not need a mutation sweep.

## Changesets versioning workflow

Changesets owns package versions, package changelogs, and the Version Packages PR. Changesets does not own npm publishing.

`.github/workflows/version-packages.yml` runs on pushes to `main` and can be manually retried with `workflow_dispatch`. The workflow uses `changesets/action@v1` with `version: pnpm version-packages:checked`, so the generated release PR must pass the full repo gate before it is opened or updated.

The version workflow must only use `GITHUB_TOKEN`. Do not add `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `changeset publish`, or another npm publish command to the version workflow.

Before the first public publish:

1. Merge the Changesets adoption PR with the initial changeset.
2. Let the Version Packages PR open.
3. Review and merge the Version Packages PR. The first Version Packages PR should bump both packages to `0.1.0`; it also generates the package changelog entries and removes the initial changeset.
4. If npm cannot configure Trusted Publishing because the package does not exist yet, do the one-time first publish manually from each package directory. Run manual `npm login` and `npm publish` commands in a visible persistent terminal, such as a tmux pane, so MP can complete passkey or browser authentication without depending on redacted agent output.
5. Verify the publish with `npm view <package> version dist-tags --json`. `npm access get status <package>` only proves that the package record exists; it does not prove that a version is published.
6. After the package has a visible npm version, configure the package-specific Trusted Publishing binding, then use `.github/workflows/release.yml` for future publishes.

A Version Packages PR is a release train. After merging it, publish every package versioned by that PR before merging another feature changeset.

## Manual first-publish auth flow

Use this flow only when npm has no existing package version and the package-specific Trusted Publishing binding cannot be created yet. Future publishes should use the release workflow after the binding exists.

1. Open a persistent terminal that MP can see, preferably a tmux pane.
2. From the package directory, run `npm publish --access public --tag <latest-or-next>`. Use `latest` for a normal release and `next` for a pre-release or canary-style release that should not become the default install target.
3. If npm asks for passkey or browser authentication, let MP complete the browser flow from that visible terminal. Do not rely on copied agent output for npm's tokenized auth URL; npm and the agent harness can redact or truncate the URL.
4. Resume only after `npm publish` exits successfully. Verify with `npm view <package> version dist-tags --json`; this is the release proof.

## GitHub/npm release workflow

`pnpm check-release-workflow` verifies that `.github/workflows/release.yml` and this release-readiness reference agree on the package input options, publish job IDs, package-specific GitHub environments, package allowlist commands, and package-specific Changesets release-state checks.

`.github/workflows/release.yml` has separate publish jobs and separate GitHub environments for each v0 package:

- `publish-oxlint-standards` publishes from `packages/oxlint-standards` through the `npm-publish-oxlint-standards` GitHub environment.
- `publish-tsconfig` publishes from `packages/tsconfig` through the `npm-publish-tsconfig` GitHub environment.

Both publish jobs require `id-token: write`, check that npm is at least `11.5.1`, verify the selected package has a non-`0.0.0` version with a matching changelog heading and no pending changesets, and publish with `npm publish --provenance`. The workflow is manually dispatched with one package selected per run, so each package keeps an independent release cadence and an independent npm Trusted Publishing binding.

Before the first publish, migrate the Item 19 oxlint setup away from the old generic `npm-publish` GitHub environment name. The oxlint package must use the package-specific `npm-publish-oxlint-standards` GitHub environment, and the npm Trusted Publishing binding for `@mplibunao/oxlint-standards` must point to this repository, `.github/workflows/release.yml`, and that exact environment name. If the generic `npm-publish` environment already exists from Item 19, rename it to `npm-publish-oxlint-standards` or recreate the binding after creating the package-specific environment; do not leave the oxlint package bound to `npm-publish`.

Configure a separate npm Trusted Publishing binding for package `@mplibunao/tsconfig` against the same repository/workflow and the `npm-publish-tsconfig` GitHub environment. Do not add an `NPM_TOKEN` for either package.

Each publish job is guarded to run only from `refs/heads/main`. Create and protect both package-specific GitHub environments; only maintainers should be able to approve either environment from `main` after the check job passes. Branch protection remains the separate operational backstop for getting changes onto `main`.

## CI/release duplication decision

Item 20 re-evaluated release setup duplication after adding the second package. The workflow still keeps explicit package-specific publish jobs instead of extracting a composite action or reusable workflow. The repeated setup block is short and stable, while the release behavior differs by package: the oxlint job builds compiled plugin output and runs the oxlint allowlist, and the tsconfig job validates a JSON-only package allowlist. A shared abstraction would hide those release differences without removing enough maintenance cost yet. Extract a composite action only after a third package or another repeated package-specific release path makes the duplication operational rather than cosmetic.
