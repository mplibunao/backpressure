# Decision records

Accepted decisions for `backpressure` live here. New ADRs use `template.md` and keep the decision stable, brief, and linkable.

| ADR | Status | Summary |
| --- | --- | --- |
| [001: Effect preset posture](001-effect-preset-posture.md) | Accepted | The Effect preset is gen-first, v4-primary, and structural-only. ADR-007 supersedes its language-service delegation. |
| [002: Stack and harness](002-stack-and-harness.md) | Accepted | The repo uses pnpm 11, vite-plus, strict TypeScript, oxlint ceilings, Vale, and publish-time artifact checks. |
| [003: Monorepo scope and naming](003-monorepo-scope-and-naming.md) | Accepted | The repo is `backpressure`; v0 published package names stay under `@mplibunao/*`; private unpublished tool packages are allowed. |
| [004: Rule curation and severity posture](004-rule-curation-and-severity-posture.md) | Accepted | The package builds the gaps, ports structural ESLint-only rules, and grades severity by problem kind. ADR-007 updates the type-aware delegate. |
| [005: Repo script language](005-repo-script-language.md) | Accepted | Repo-authored scripts use TypeScript by default so quality and release gates participate in typechecking. |
| [006: Changesets versioning and publish boundary](006-changesets-versioning-and-publish-boundary.md) | Accepted | Changesets owns package versions, changelogs, npm publishing, tags, and GitHub releases through one OIDC/provenance workflow. |
| [007: tsgo delegation and overlap](007-tsgo-delegation-and-overlap.md) | Accepted | Type-aware Effect checks are delegated to `@effect/tsgo` through a patched-oxlint default route and a patched-tsc alternative; private unpublished tool packages are allowed. Accepted, not yet implemented. |
