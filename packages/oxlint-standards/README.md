# @mplibunao/oxlint-standards

Opinionated oxlint rule pack for MP's code-quality backpressure package.

The package exports an oxlint JS plugin, custom-rule presets, and full config fragments.

## Consumption model

The package ships two kinds of named exports.

**Presets** (`generalPreset`, `effectPreset`, `effectReactPreset`, `boundariesPreset`)
carry the package's own AST rules. Their shape is `{ jsPlugins, rules }`. Presets do
not set categories, options, or standard plugin rules; they add only the custom rule
group the consumer opts into.

**Config fragments** (`baseConfig`, `vitestConfig`, `nodeRuntimeConfig`) are typed
`OxlintConfig` objects with categories, options, plugins, rules, and overrides. They
encode the canonical TypeScript lint baseline and opt-in stack layers. Compose them
with `composeLintConfigs` inside a `vite.config.ts`:

```typescript
import {
  baseConfig,
  composeLintConfigs,
  nodeRuntimeConfig,
  vitestConfig,
} from '@mplibunao/oxlint-standards';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: composeLintConfigs(
    baseConfig,
    vitestConfig,
    nodeRuntimeConfig,
    {
      rules: { /* project-specific rules */ },
      overrides: [ /* project-specific overrides */ ],
    },
  ),
});
```

`composeLintConfigs` accepts any number of `OxlintConfig` fragments and returns a
single flat config: rules merge with later-wins semantics, plugins and `jsPlugins`
merge by union, and overrides concatenate.

**Why `composeLintConfigs` instead of `extends`:** oxlint's native `extends` field
merges `rules`, `categories`, and `plugins`, but it uses replace semantics for
`overrides`; a child config's `overrides` array replaces the parent's rather than
appending to it. `baseConfig` ships test-file overrides that relax structural ceilings
for test code. Using `extends` would silently drop those overrides in every consumer.
`composeLintConfigs` concatenates `overrides` arrays instead.

For Effect-heavy repos, scope `effectPreset` to Effect source files via a tail
override:

```typescript
lint: composeLintConfigs(
  baseConfig,
  vitestConfig,
  nodeRuntimeConfig,
  {
    overrides: [
      {
        files: ['src/**/*.ts'],
        rules: { ...effectPreset.rules },
        jsPlugins: [...effectPreset.jsPlugins],
      },
    ],
  },
),
```

For every rule each preset and config turns on, with its severity for normal and test files,
see the generated `docs/references/rules.md`. In this repository, `pnpm rules:view` serves
the same list locally with search and filters.

### Preset-only usage

To load a custom-rule preset without a full config baseline, reference it from a
standalone `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@mplibunao/oxlint-standards"],
  "rules": {
    "@mplibunao/oxlint-standards/no-effect-as": "error",
    "@mplibunao/oxlint-standards/no-barrel-import": "error"
  }
}
```

## Rule severity

Rules ship with graded default severities. Correctness, safety, and agent-failure-mode rules default to `error`. Style and preference rules default to a quieter level. The aim is an `error` signal worth acting on instead of a wall of errors.

Some coding agents act on `error` but skip `warn`, so an adversarial review step helps the quieter rules land. Every rule is overridable: raise any rule to `error` in your own `.oxlintrc.json` when you want a hard stop. The reasoning is in `docs/decisions/004-rule-curation-and-severity-posture.md`.

## Presets

The main package entry exports:

- `effectPreset`: gen-first Effect v4 structural rules. It includes `require-yield: off` and `no-shadow: off` because idiomatic `Effect.gen` conflicts with those native rules.
- `effectReactPreset`: Effect and `@effect-atom` rules for React code, including atom/state-update rules and the broad React state-hook ban.
- `generalPreset`: stack-neutral JS/TS backpressure. It owns `prevent-dynamic-imports`, `no-double-cast`, `no-ts-nocheck`, `no-redundant-primitive-cast`, and built-in `no-nested-ternary`.
- `boundariesPreset`: package-boundary rules such as `no-cross-package-relative-imports`.

The unqualified `react` preset name is reserved for a future stack-neutral React preset. Do not combine `effect-react` with that future hooks-first preset because `effect-react` forbids hooks that a general React preset would regulate.

## Effect language-service boundary

This package ships fast AST-shape rules only. Type-aware Effect semantics belong in the consumer's own `@effect/language-service` setup.

Recommended consumer setup:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        "diagnosticSeverity": {
          "importFromBarrel": "error",
          "missingEffectServiceDependency": "error",
          "leakingRequirements": "error",
          "unsafeEffectTypeAssertion": "error",
          "instanceOfSchema": "error",
          "globalDate": "error",
          "globalRandom": "error",
          "globalConsole": "error",
          "globalFetch": "error",
          "globalTimers": "error",
          "preferSchemaOverJson": "error",
          "schemaSyncInEffect": "error",
          "cryptoRandomUUID": "error"
        }
      }
    ]
  }
}
```

`no-barrel-import` intentionally overlaps the language service's `importFromBarrel` diagnostic because the AST rule gives config-free feedback before a TypeScript project is wired.

## Catalog posture

v0 targets Effect v4 identifiers and conventions: gen-first logic, named `Effect.fn` / `Effect.fnUntraced` wrappers, namespace imports from submodules, and v4 Schema, Layer, and Error names. Effect v3 spellings are out of scope unless a v4 structural matcher catches them naturally.

The catalog currently records:

- 50 linteffect v0.0.6 source rules represented for inventory.
- 47 ported linteffect rules.
- 3 explicit linteffect drops: `no-if-statement`, `no-effect-fn-generator`, and `no-ternary`.
- 21 reimplemented structural/recon rules, including `effect-no-multiple-provide`, `prefer-effect-fn`, `no-barrel-import`, `no-inline-schema-compile`, and executor-derived error/schema/promise rules.
- 1 built-in default: oxlint `no-nested-ternary` in `generalPreset`.
- 13 LSP-owned semantic diagnostics documented for `@effect/language-service`.

See `docs/references/rules.md` for the consumer-facing catalog and `src/rule-manifest.ts` for the machine-checkable source of truth.

## Attribution

The linteffect-derived rules are derived from `@catenarycloud/linteffect`, the MIT-licensed GritQL rule pack by Roman Naumenko. The GritQL tooling is not copied into this package.

Executor, t3code, and effect-smol are idea or scenario references for reimplemented rules; this package copies no runtime code from them. Rika's Effect rules are reference material only, and this package does not depend on Rika.
