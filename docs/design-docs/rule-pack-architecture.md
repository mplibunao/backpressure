# Rule pack architecture

Status: current-state design for the catalog after the Effect v4 alignment. [ADR-007](../decisions/007-tsgo-delegation-and-overlap.md) owns the `@effect/tsgo` delegation.

## Purpose

`@mplibunao/oxlint-standards` ships opinionated oxlint JS-plugin presets. The catalog has 43 custom rules (22 linteffect ports and 21 reimplementations of executor, recon, or linteffect ideas), the built-in oxlint settings of its config fragments, and 116 delegated `@effect/tsgo` checks that the Effect preset configures. `src/rule-manifest.ts` is the source of truth for these counts, and the generated `docs/references/rules.md` lists what each preset turns on.

## Source model

The package combines four rule sources:

- **linteffect port:** GritQL rules from `@catenarycloud/linteffect` v0.0.6, translated into ESTree visitors with MIT attribution. The manifest represents all 50 source rules, ports 22, reimplements 1 with different semantics, and drops 27 by disposition, keeping each dropped row and its vendored fixtures as history.
- **executor reimplementations:** structural rule ideas rewritten as this package's own oxlint rules. Executor remains an idea source, not a dependency.
- **recon additions:** current Effect ecosystem patterns, including `no-barrel-import` and `no-string-error-channel`.
- **built-in oxlint rules:** the config fragments set built-in rules explicitly, and `generalPreset` enables built-in `no-nested-ternary` instead of shipping the dropped blanket `no-ternary` rule.
- **`@effect/tsgo` delegation:** the manifest has one generated row per rule of the pinned `@effect/tsgo` release. Every row sets an explicit severity, `off` included. The severities come from `scripts/config/tsgo-policy.ts` and the retained metadata snapshot through `pnpm gen:effect-policy`, which also writes the `@mplibunao/tsconfig` Effect overlays, so one policy serves both routes.

Type-aware Effect checks are not reimplemented here. The Effect preset requires the patched-oxlint route, so an unpatched oxlint fails on the unknown `effecttsgo` plugin instead of skipping those checks. A dropped rule that `@effect/tsgo` covers records the replacement in `replacedBy`, and the replacement must ship at a severity no lower than the dropped rule's. An AST rule may overlap a delegated check when it is stricter or fires without a TypeScript project, as `no-json-parse` and `no-barrel-import` do.

## Runtime substrate

Rules are authored as ESLint-v9-compatible JavaScript plugin rules and loaded by oxlint through `jsPlugins`. Each rule uses `create(context)`, not oxlint-only `createOnce`, unless a later ADR explicitly narrows portability.

The plugin package builds with tsdown and ships a single-entry, Node-resolvable ESM bundle plus bundled declarations under `dist/`. This replaces the earlier `tsc -b` preserve-modules output. Package internals are private; the package exposes only the root entrypoint and `./package.json`, not public subpaths. Consumers compose configs inline in `vite.config.ts`, as this repository's own lint config does, or write the composed object to a standalone `.oxlintrc.json`, which the packed-consumer smokes use.

The alpha API contract is pinned in `docs/references/translation-contract.md`: default plugin export, `meta.name`, `rules`, `create(context)`, `context.report`, `oxlint/plugins-dev` `RuleTester`, and `.oxlintrc.json` `jsPlugins`.

## Presets and composition

Preset taxonomy is owned by `docs/design-docs/preset-architecture.md`. This design intentionally links that document instead of restating the taxonomy.

The key composition rule is that `general` remains stack-neutral. Effect-specific carve-outs, such as `require-yield: off` and `no-shadow: off`, stay inside `effect`. Non-Effect projects should compose `general` and any stack-specific presets they actually use. Future stack opinions such as drizzle, bun, sql, or next rules should become their own presets per ADR 003.

The `effect` preset is gen-first. `pipe` remains valid for combinator tails and wiring, but the catalog nudges business logic toward flat `Effect.gen` and named `Effect.fn` / `Effect.fnUntraced` wrappers.

## Validation layers

Custom rules and delegated checks are validated separately. Custom rules use four layers:

1. `scripts/checks/check-rule-inventory.ts` is the catalog contract. It builds and imports the package, requires the active custom rules to equal the runtime plugin map and the replay suites, compares linteffect source presets against the actual v0.0.6 configs, checks source-fixture replay for active rules, and checks the drop register and replacement edges.
2. RuleTester coverage exists for every implemented custom rule. These tests exercise focused AST semantics and false-positive edges.
3. Real-oxlint fixture replay proves compiled-plugin behavior. Source fixture parity means every upstream valid/invalid file for a linteffect fixture family is replayed with diagnostic counts. Reference scenario parity means recon, t3code, effect-smol, and executor-derived rules have reviewed valid/invalid scenario matrices. Smoke coverage is only a load/diagnostic sanity check and is not counted as parity.
4. Packed-consumer smoke tests install the tarball and load the plugin as a consumer would.

Delegated checks have no RuleTester parity. `pnpm effect-policy:check` rejects generated settings that drift from the policy or the pinned metadata, unit tests enforce the replacement floors and the ownership registry against the shipped fragment, and `pnpm check:effect-integration` runs both routes in isolated packed consumers on the patched tools. It compares the patched engine's applied severities with the policy.
