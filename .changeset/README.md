# Changesets

Use `pnpm changeset` to describe package-facing changes. Changesets owns package version bumps, package changelogs, and the Version Packages PR.

Publishing stays in `.github/workflows/release.yml`. Do not add `changeset publish`, `NPM_TOKEN`, or `NODE_AUTH_TOKEN`; npm publishing must keep the existing manual OIDC/provenance workflow and package-specific GitHub environment approvals.
