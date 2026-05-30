# Rule pack architecture

Status: baseline current-state design, seeded before rule work.

## Purpose

`@mplibunao/oxlint-standards` ships opinionated oxlint JS-plugin presets. The current substrate proves one source-derived rule, the real oxlint execution path, and the packed-consumer package-loading path before the bulk catalog port begins.

## Source model

The package combines three rule sources:

- **linteffect port**: GritQL rules from `@catenarycloud/linteffect`, translated into ESTree visitors with MIT attribution.
- **structural reimplementations**: useful ideas from executor and recon repos, rewritten as this package's own oxlint rules.
- **recon additions**: rules discovered from current Effect ecosystem patterns, such as barrel-import and function-shape checks.

Type-aware Effect semantics are not reimplemented here. The package recommends `@effect/language-service` for semantic checks and keeps this package focused on fast AST-shape backpressure.

## Runtime substrate

Rules are authored as ESLint-v9-compatible JavaScript plugin rules and loaded by oxlint through `jsPlugins`. Each rule uses `create(context)`, not oxlint-only `createOnce`, unless a later ADR explicitly narrows portability.

The plugin package ships compiled `.js` and `.d.ts` files under `dist/`. Consumers should configure oxlint with a standalone `.oxlintrc.json` because plugin resolution through inline vite-plus config is not yet proven.

The alpha API contract is pinned in `docs/references/translation-contract.md`: default plugin export, `meta.name`, `rules`, `create(context)`, `context.report`, `oxlint/plugins-dev` `RuleTester`, and `.oxlintrc.json` `jsPlugins`.

## Presets

Preset taxonomy is owned by `docs/design-docs/preset-architecture.md`. This design intentionally links that document instead of restating the taxonomy. The key boundary is that `general` remains stack-neutral and Effect-specific carve-outs stay inside `effect`.

## Validation plan

Rule work now uses three validation layers:

1. RuleTester coverage for each rule.
2. Real-oxlint fixture replay for parser and engine parity.
3. Packed-consumer smoke tests that install the tarball and load the plugin as a consumer would.
