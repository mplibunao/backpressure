# Release readiness: v0 packages

This checklist is the publish gate for `@mplibunao/oxlint-standards` and `@mplibunao/tsconfig`.

## Required local gate

Run these commands before opening a release refactor/review gate:

1. `pnpm changesets:check`
2. `pnpm check`
3. `pnpm pack:dry-run`
4. `git diff --check`

`pnpm check` includes build, the release workflow contract check, the Changesets contract check, rule inventory, fixture replay, the oxlint packed-consumer smoke, the tsconfig packed-consumer smoke, recursive package dry-run checks, and the prose gate. `pnpm pack:dry-run` remains a separate explicit release-readiness command because it is the direct publish-artifact check a maintainer expects to run before release.

## Steady-state release flow

`.github/workflows/release.yml` is the only release workflow. It runs on pushes to `main` and can be retried manually without package-specific inputs.

The workflow uses `changesets/action@v1` for both halves of the flow:

1. If pending changesets exist, the action opens or updates the Version Packages PR with `pnpm version-packages`.
2. When MP merges the Version Packages PR to `main`, the action automatically publishes the packages that Changesets versioned by running `pnpm release`.
3. The same action creates the native package tags and GitHub releases from the package changelogs with `createGithubReleases: true`.

This coupling is intentional. npm publish and GitHub releases happen in one action, so the v0 failure mode where npm was published but the GitHub release was forgotten is structurally removed.

## Pre-publish safety gate

`pnpm release` is the action's publish command. It runs `pnpm release:prepare` before `changeset publish`, so `changeset publish` is unreachable unless the build, npm Trusted Publishing client check, Changesets release-state sanity check, package allowlist checks, and packed-consumer smokes pass.

The exact ordered command sequence is executable policy, not prose policy. `scripts/lib/release-contract.ts` owns the publishable package inventory and expected `release:prepare` composition; `package.json` exposes that composition; `pnpm check-release-workflow` asserts they stay aligned.

`check-changesets-release-state.ts` is the pre-publish sanity check for the unified action. It verifies that no pending changeset files remain, each releaseable package has a non-placeholder version, and each package changelog contains the matching version heading.

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

## npm Trusted Publishing configuration MP must update

Steady-state publishing uses npm Trusted Publishing with GitHub OIDC and provenance. Do not configure registry token secrets for this repo.

For each npm package, update the package's Trusted Publishing binding:

- Package: `@mplibunao/oxlint-standards`
  - Provider: GitHub Actions
  - Repository: `mplibunao/backpressure`
  - Workflow file: `.github/workflows/release.yml`
  - GitHub Environment: environment field blank/unset
- Package: `@mplibunao/tsconfig`
  - Provider: GitHub Actions
  - Repository: `mplibunao/backpressure`
  - Workflow file: `.github/workflows/release.yml`
  - GitHub Environment: environment field blank/unset

If an existing binding points at a package-specific environment such as `npm-publish-oxlint-standards` or `npm-publish-tsconfig`, clear that environment from the npm binding. The workflow no longer declares GitHub Environments because per-package manual approval is intentionally dropped.

The workflow must keep `id-token: write`, `actions/setup-node` with `registry-url: https://registry.npmjs.org`, and `NPM_CONFIG_PROVENANCE: 'true'`.

## First-publish bootstrap exception

Use this exception only if npm cannot create a Trusted Publishing binding until the package exists. Steady state is automatic through `.github/workflows/release.yml`.

1. Run `pnpm release:prepare` from the repo root.
2. From the package directory, manually run `npm publish --access public --tag latest` in a visible persistent terminal so MP can complete passkey or browser authentication.
3. Verify the publish with `npm view <package> version dist-tags --json`. `npm access get status <package>` only proves that the package record exists; it does not prove that a version is published.
4. Create and push the matching package tag, using the Changesets tag format: `@mplibunao/oxlint-standards@<version>` or `@mplibunao/tsconfig@<version>`.
5. Create the matching GitHub release from that tag and the package changelog entry. A manual bootstrap is not complete until npm and GitHub both show the release.
6. Configure the npm Trusted Publishing binding above before the next release.

When verifying a package that was just published from MP's machine, beware user-level npm safety config such as `before` or minimum-release-age settings. Those settings can make a newly published package look missing even when npm has published it. For public registry verification, use a clean temporary npm user config: `NPM_CONFIG_USERCONFIG=$(mktemp) npm view <package> version dist-tags --json`. Do not use a clean config for authenticated publish commands; publish commands need MP's npm login state.

## Rule catalog and mutation gates

`scripts/checks/check-rule-inventory.ts` remains the catalog-completeness assertion. The rule inventory covers the 50 `biome-effect-linting-rules` v0.0.6 rules and every intentional exception. The exceptions are the dropped anti-house-style rules, the built-in replacement for `no-ternary`, v0.0.6 refinements, `effect-no-multiple-provide`, recon additions, structural executor reimplementations, and `@effect/language-service` delegated semantic checks. Rika remains reference material only, not a dependency.

The v0 mutation sweep passed on 2026-05-31 with a behavioral mutation score of **81.81%** (`3981` killed + `13` timeout / `4882` total). The durable evidence is `docs/reports/mutation/2026-05-31-v0-sweep.md`.

Mutation testing is a procedural local publish gate, not a CI gate. CI does not run Stryker because the sweep is intentionally delegated, slow, and review-heavy. Before publishing `@mplibunao/oxlint-standards`, reviewers should confirm that the dated v0 mutation sweep evidence still matches the release candidate or rerun the mutation workflow if rule/helper behavior changed after that evidence. The JSON-only `@mplibunao/tsconfig` package does not need a mutation sweep.
