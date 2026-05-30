# Rules reference

Status: early reference for Items 6, 10, 15, and 16.

`@mplibunao/oxlint-standards` ships fast AST-shape rules. `@effect/language-service` owns type-aware semantic diagnostics. Consumers can override each oxlint rule in their own config.

## Current rule

### `@mplibunao/oxlint-standards/no-effect-as`

Default preset: `effect`.

Default severity: `error`.

Source: `@catenarycloud/linteffect` v0.0.6 `rules/no-effect-as.grit`.

The rule reports `Effect.as(...)` when `Effect` is a namespace import from `effect` or `effect/Effect`. It does not report local objects named `Effect` or named barrel imports. The stricter binding check prevents false positives; the future `no-barrel-import` rule owns barrel imports.

Diagnostic intent: avoid `Effect.as` because it hides sequencing and turns effects into placeholders. Use `Effect.map` for value mapping or `Effect.asVoid` after explicit pipeline steps.

## Presets

The package exports four preset modules from the main package entry:

- `effectPreset`: Effect v4 structural rules. It currently enables `no-effect-as` and confines Effect-specific native suppressions to this preset: `require-yield: off` and `no-shadow: off`.
- `effectReactPreset`: reserved for Effect and atom rules in React code.
- `generalPreset`: reserved for stack-neutral rules.
- `boundariesPreset`: reserved for package-boundary rules.

The unqualified `react` preset name is reserved for a future stack-neutral React preset and is not created in v0.

## Recommended language-service boundary

Consumers using Effect should also configure `@effect/language-service` in their own TypeScript setup. This package does not bundle the language service because the language service is type-aware and project-specific.

Recommended diagnostics to keep at `error` are:

- `importFromBarrel`
- `missingEffectServiceDependency`
- `leakingRequirements`
- `unsafeEffectTypeAssertion`
- `instanceOfSchema`
- global `Date`, `Random`, `Console`, `Fetch`, and timer usage
- `preferSchemaOverJson`
- `schemaSyncInEffect`
- `cryptoRandomUUID`

Structural AST checks can still overlap language-service checks when config-free feedback is useful. The planned `no-barrel-import` rule is the known exception because it can flag the `effect` barrel without TypeScript project wiring.

Rika's Effect rules are reference material only. This package does not depend on Rika; structural Rika scenarios that are not language-service-owned may be reimplemented here later.
