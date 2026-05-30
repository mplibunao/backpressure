# Prose gate

Status: accepted baseline policy.

## Policy

The repo uses doc-garden's Personal dev-tooling Vale profile for current docs by default. Current docs include README files, `CLAUDE.md`, ADRs, design docs, package docs, and reference docs.

Historical and evidence docs get scoped exceptions. `docs/exec-plans/**` and `docs/investigations/**` preserve research notes, quoted evidence, terse labels, and planning language. Vale still checks those files, but `.vale.ini` disables the noisy rules that would rewrite evidence rather than improve the current product docs.

The prose gate blocks from v0:

- `pnpm prose` checks repo docs and package README files.
- `pnpm check` includes `pnpm prose`.
- `.vite-hooks/commit-msg` runs `pnpm prose:commit -- "$1"` so commit messages use the `ai-tells-commits` style.

## Sync behavior

Hooks must work in fresh clones. The scripts call `scripts/vale-ensure-styles.sh`, which runs `vale --no-global sync` only when one of the configured style package directories is missing.

## License and notice mirrors

Published packages must include `LICENSE` and `NOTICE.md`. Keep package-level license and notice files mirrored from the root files when attribution or license terms change. This baseline keeps the package artifacts publishable before any derived rule logic ships.
