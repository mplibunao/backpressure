# ADR 006: Changesets versioning and publish boundary

- Status: accepted
- Date: 2026-06-02

## Context

ADR-006 previously kept Changesets limited to versioning, changelog generation, and the Version Packages PR while package-specific manual GitHub Actions jobs owned npm publishing.

That split kept human approval close to each package publish, but it also left room for a half-finished release. The v0 failure mode was concrete: npm could be published while the matching GitHub tag and release were forgotten. The manual per-package approval also adds friction in a solo monorepo where branch protection, CI, package allowlist checks, packed-consumer smokes, and npm Trusted Publishing already provide the practical safety net.

## Decision

Reverse the previous ADR-006 boundary. Changesets now owns versioning, npm publishing, GitHub tags, and GitHub releases in one `changesets/action` flow.

`.github/workflows/release.yml` runs on pushes to `main`. When pending changesets exist, the action opens or updates the Version Packages PR. When the Version Packages PR merges and the changesets have been consumed, the same action runs `pnpm release`, which validates publish artifacts and then runs `changeset publish`.

The workflow uses npm Trusted Publishing with GitHub OIDC and provenance. The job has `id-token: write`, and `actions/setup-node` points npm at `https://registry.npmjs.org`. Provenance is enabled with `NPM_CONFIG_PROVENANCE: 'true'`; registry token secrets are not used.

`changesets/action` also creates the native package tags and GitHub releases from the generated package changelogs by setting `createGithubReleases: true`.

## Consequences

- Positive: npm publish and GitHub release creation are coupled in one action, so a release cannot complete on npm while the GitHub release is forgotten.
- Positive: the steady-state release operation is canonical for Changesets, lower-friction for a solo monorepo, and automatic when the Version Packages PR merges to `main`.
- Positive: npm authentication stays tokenless through Trusted Publishing and provenance.
- Negative: the release no longer has a per-package human approval checkpoint. The safety boundary moves to branch protection, CI, package allowlist assertions, packed-consumer smokes, and the `pnpm release` pre-publish gate.
- Follow-up: each npm package's Trusted Publishing binding must point at `.github/workflows/release.yml` with no GitHub Environment, because the previous per-package environment bindings are obsolete.
