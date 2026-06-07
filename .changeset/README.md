# Changesets

Use `pnpm changeset` to describe package-facing changes. Changesets owns package version bumps, package changelogs, the Version Packages PR, npm publishing, tags, and GitHub releases.

Steady-state releases run through `.github/workflows/release.yml`. The workflow uses npm Trusted Publishing with OIDC provenance and does not use registry token secrets or per-package manual approval environments.
