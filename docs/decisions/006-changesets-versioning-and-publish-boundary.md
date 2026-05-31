# 006: Changesets versioning and publish boundary

## Status

Accepted.

## Decision

Use Changesets for per-package versioning, package changelog generation, and the Version Packages PR.

Keep npm publishing in `.github/workflows/release.yml`. The release workflow remains manually dispatched, package-specific, approval-gated through GitHub environments, and published through npm Trusted Publishing with OIDC provenance.

Do not use `changeset publish`, `NPM_TOKEN`, or `NODE_AUTH_TOKEN` for this repo.

## Rationale

Changesets solves the missing release-state ownership problem: package versions and package changelogs should be generated from reviewed changesets instead of manual edits.

Changesets should not own publishing because the repo's release safety model depends on package-specific GitHub environment approvals, npm Trusted Publishing bindings, branch guards, package allowlist checks, packed-consumer smoke tests, and `npm publish --provenance`.

## Consequences

A Version Packages PR is a release train. After merging a Version Packages PR, publish every package versioned by that PR through the existing manual release workflow before merging another feature changeset.
