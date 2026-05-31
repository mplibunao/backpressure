# Release readiness: `@mplibunao/oxlint-standards`

This checklist is the publish gate for the first v0 package only: `@mplibunao/oxlint-standards`. Do not include `@mplibunao/tsconfig` here until Item 20 starts.

## Required local gate

Run these commands before opening the release refactor/review gate:

1. `pnpm check`
2. `pnpm pack:dry-run`
3. `git diff --check`

`pnpm check` includes build, rule inventory, fixture replay, packed-consumer smoke, recursive package dry-run checks that run the oxlint package allowlist assertion, and the prose gate. `pnpm pack:dry-run` remains a separate explicit release-readiness command because it is the direct publish-artifact check a maintainer expects to run before release.

## Package artifact contract

`pnpm oxlint:package:allowlist` runs `scripts/check-oxlint-package-allowlist.ts`, the authoritative package allowlist assertion for `@mplibunao/oxlint-standards`.

The script checks all of the following:

- `packages/oxlint-standards/package.json` keeps the publish `files` allowlist to `dist`, `README.md`, `LICENSE`, and `NOTICE.md`.
- `npm pack --dry-run --json` includes only root package metadata/docs and compiled `dist` files.
- required runtime and type entrypoints are present, including `dist/index.js`, `dist/index.d.ts`, `dist/plugin.js`, and `dist/rule-manifest.js`.
- private inputs such as source, tests, fixtures, and tsconfig files do not leak into the tarball.
- no Rika dependency is declared in the publish package.

The packed-consumer smoke remains the runtime proof: it builds the package, packs a tarball, installs that tarball in throwaway consumers, imports the public entrypoint, typechecks the public types without `@oxlint/plugins` as a consumer dependency, and runs real oxlint through `jsPlugins`.

## Rule catalog contract

`scripts/check-rule-inventory.ts` remains the catalog-completeness assertion. The rule inventory covers the 50 `biome-effect-linting-rules` v0.0.6 rules and every intentional exception. The exceptions are the dropped anti-house-style rules, the built-in replacement for `no-ternary`, v0.0.6 refinements, `effect-no-multiple-provide`, recon additions, structural executor reimplementations, and `@effect/language-service` delegated semantic checks. Rika remains reference material only, not a dependency.

## Mutation gate status

Item 18 passed on 2026-05-31 with a behavioral mutation score of **81.81%** (`3981` killed + `13` timeout / `4882` total). The durable evidence is `docs/references/mutation-sweep-v0-2026-05-31.md`.

Mutation testing is a procedural local publish gate, not a CI gate. CI does not run Stryker because the sweep is intentionally delegated, slow, and review-heavy. Before the first publish, reviewers should confirm that the dated Item 18 evidence still matches the release candidate or rerun the mutation workflow if rule/helper behavior changed after that evidence.

## GitHub/npm release workflow

`.github/workflows/release.yml` is scoped to `@mplibunao/oxlint-standards` for Item 19. The publish job uses the `npm-publish` GitHub environment with `id-token: write`. After the package build, the job re-runs `pnpm oxlint:package:allowlist` against the compiled artifact, checks that npm is at least `11.5.1`, then publishes with `npm publish --provenance`.

The publish job is guarded to run only from `refs/heads/main`. Create and protect a GitHub environment named `npm-publish`; only maintainers should be able to approve that environment from `main` after the check job passes. Branch protection remains the separate operational backstop for getting changes onto `main`.

Before the first publish, configure npm Trusted Publishing for package `@mplibunao/oxlint-standards` against this repository, `.github/workflows/release.yml`, and the `npm-publish` GitHub environment. Do not add an `NPM_TOKEN`. Configure a separate trusted-publisher binding for `@mplibunao/tsconfig` only when Item 20 starts.
