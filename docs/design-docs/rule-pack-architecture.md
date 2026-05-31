# Rule pack architecture

Status: current-state design for the group-3 catalog.

## Purpose

`@mplibunao/oxlint-standards` ships opinionated oxlint JS-plugin presets. The package now has the v0 catalog substrate: 47 linteffect ports, 21 structural executor/recon reimplementations, 1 built-in default, and documented delegation to `@effect/language-service` for 13 semantic checks.

## Source model

The package combines four rule sources:

- **linteffect port:** GritQL rules from `@catenarycloud/linteffect` v0.0.6, translated into ESTree visitors with MIT attribution. The manifest represents all 50 source rules, ports 47, and explicitly drops `no-if-statement`, `no-effect-fn-generator`, and `no-ternary`.
- **executor reimplementations:** structural rule ideas rewritten as this package's own oxlint rules. Executor remains an idea source, not a dependency.
- **recon additions:** current Effect ecosystem patterns, including `effect-no-multiple-provide`, `prefer-effect-fn`, and `no-barrel-import`.
- **built-in oxlint rules:** `generalPreset` enables built-in `no-nested-ternary` instead of shipping the dropped blanket `no-ternary` rule.

Type-aware Effect semantics are not reimplemented here. The package recommends `@effect/language-service` for semantic checks and keeps this package focused on fast AST-shape backpressure. `no-barrel-import` intentionally overlaps the language service because it gives config-free feedback.

## Runtime substrate

Rules are authored as ESLint-v9-compatible JavaScript plugin rules and loaded by oxlint through `jsPlugins`. Each rule uses `create(context)`, not oxlint-only `createOnce`, unless a later ADR explicitly narrows portability.

The plugin package ships compiled `.js` and `.d.ts` files under `dist/`. Consumers should configure oxlint with a standalone `.oxlintrc.json` because plugin resolution through inline vite-plus config is not yet proven.

The alpha API contract is pinned in `docs/references/translation-contract.md`: default plugin export, `meta.name`, `rules`, `create(context)`, `context.report`, `oxlint/plugins-dev` `RuleTester`, and `.oxlintrc.json` `jsPlugins`.

## Presets and composition

Preset taxonomy is owned by `docs/design-docs/preset-architecture.md`. This design intentionally links that document instead of restating the taxonomy.

The key composition rule is that `general` remains stack-neutral. Effect-specific carve-outs, such as `require-yield: off` and `no-shadow: off`, stay inside `effect`. Non-Effect projects should compose `general` and any stack-specific presets they actually use. Future stack opinions such as drizzle, bun, sql, or next rules should become their own presets per ADR 003.

The `effect` preset is gen-first. `pipe` remains valid for combinator tails and wiring, but the catalog nudges business logic toward flat `Effect.gen` and named `Effect.fn` / `Effect.fnUntraced` wrappers.

## Validation layers

Rule work uses four validation layers:

1. `scripts/checks/check-rule-inventory.ts` is the catalog contract. It builds and imports the package, verifies implemented custom entries exist in the runtime plugin map, compares linteffect source presets against the actual v0.0.6 configs, and checks source-fixture replay completeness.
2. RuleTester coverage exists for every implemented custom rule. These tests exercise focused AST semantics and false-positive edges.
3. Real-oxlint fixture replay proves compiled-plugin behavior. Source fixture parity means every upstream valid/invalid file for a linteffect fixture family is replayed with diagnostic counts. Reference scenario parity means recon, t3code, effect-smol, and executor-derived rules have reviewed valid/invalid scenario matrices. Smoke coverage is only a load/diagnostic sanity check and is not counted as parity.
4. Packed-consumer smoke tests install the tarball and load the plugin as a consumer would.
