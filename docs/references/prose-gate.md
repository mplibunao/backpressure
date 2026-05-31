# Prose gate

Status: accepted baseline policy.

## Policy

The repo uses doc-garden's Personal dev-tooling Vale profile across README files, `CLAUDE.md`, ADRs, design docs, package docs, reference docs, exec plans, investigations, and `docs/reports/**`. Root-level `reports/` is outside the current prose gate.

Historical and evidence docs follow these rules:

- Preserve historical meaning. Do not rewrite a decision, plan, investigation, or report so it says something different from what happened.
- Apply generic readability rules to historical and evidence docs.
- Prefer repo vocabulary or meaning-preserving rewrites over scoped Vale disables.
- Escalate when a Vale rule cannot be satisfied without changing the record.
- Do not reintroduce historical-doc scoped Vale disables.

The prose gate blocks from v0:

- `pnpm prose` checks repo docs and package README files.
- `pnpm check` includes `pnpm prose`.
- `.vite-hooks/commit-msg` runs `pnpm prose:commit -- "$1"` so commit messages use the `ai-tells-commits` style.

## Sync behavior

Hooks must work in fresh clones. The scripts call `scripts/vale-ensure-styles.sh`, which runs `vale --no-global sync` only when one of the configured style package directories is missing.

## License and notice mirrors

Published packages must include `LICENSE` and `NOTICE.md`. Keep package-level license and notice files mirrored from the root files when attribution or license terms change. This baseline keeps the package artifacts publishable before any derived rule logic ships.
