# Rules reference

`@mplibunao/oxlint-standards` ships fast AST-shape rules. `@effect/language-service` owns type-aware semantic diagnostics. Consumers can override each oxlint rule in their own config.

The machine-checkable catalog is `packages/oxlint-standards/src/rule-manifest.ts`. The inventory gate is `scripts/checks/check-rule-inventory.ts`.

## Catalog summary

- **linteffect source coverage:** 50 v0.0.6 source rules are represented. 47 are ported. 3 are explicitly dropped: `no-if-statement`, `no-effect-fn-generator`, and `no-ternary`.
- **reimplemented and recon rules:** 21 structural rules are implemented from executor ideas or recon findings, including `effect-no-multiple-provide`, `prefer-effect-fn`, `no-barrel-import`, `no-inline-schema-compile`, schema/error/promise rules, and `no-cross-package-relative-imports`.
- **built-in rule defaults:** `generalPreset` enables oxlint's built-in `no-nested-ternary` instead of the dropped blanket `no-ternary` rule.
- **language-service boundary:** 13 semantic or type-aware diagnostics are delegated to `@effect/language-service`.
- **parity status:** implemented custom rules carry either source fixture parity or reviewed semantic scenario parity in the manifest. Source fixture parity means every upstream valid/invalid fixture file is replayed with diagnostic counts. Semantic scenario parity means the reference behavior is covered by focused valid/invalid scenario matrices. Packed-consumer smoke coverage is tracked separately and does not make a rule parity-complete.

## Presets

- `effectPreset`: gen-first Effect v4 rules. The preset enables ported linteffect Effect rules, structural executor reimplementations, and recon additions such as `effect-no-multiple-provide`, `prefer-effect-fn`, `no-barrel-import`, and `no-inline-schema-compile`. It also sets `require-yield: off` and `no-shadow: off` because idiomatic `Effect.gen` conflicts with those native rules. `no-namespace` and `no-non-null-assertion` stay at the consumer's native oxlint defaults for v0; there is no catalog evidence that this package should relax them globally.
- `effectReactPreset`: Effect and atom-in-React rules, including `no-family-collection-read`, `no-naked-object-state-update`, `no-react-state`, `no-render-side-effects`, `no-atom-registry-effect-sync`, and `no-inline-runtime-provide`. `no-naked-object-state-update` owns object-state rebuild shapes; `JSON.parse` is owned by `no-json-parse` in the `effect` preset so composed presets report that intent once.
- `generalPreset`: stack-neutral rules. It owns `prevent-dynamic-imports`, `no-double-cast`, `no-ts-nocheck`, `no-redundant-primitive-cast`, and built-in `no-nested-ternary`.
- `boundariesPreset`: monorepo import-boundary rules. It currently owns `no-cross-package-relative-imports`.

The unqualified `react` preset name is reserved for a future stack-neutral React preset. `effect-react` is mutually exclusive with that future preset because `effect-react` owns the broad React state-hook ban.

## Effect v4 target

v0 targets Effect v4 identifiers and conventions: gen-first logic, named `Effect.fn` / `Effect.fnUntraced` wrappers, namespace imports from submodules, and v4 Schema/Layer/Error names. Effect v3 spellings are out of scope unless a structural rule catches them naturally.

## Recommended `@effect/language-service` setup

Install and wire the language service in the consumer project. This package does not bundle the language service because the language service is type-aware and project-specific.

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

Structural AST checks can intentionally overlap language-service checks when config-free feedback is useful. `no-barrel-import` is the explicit v0 exception because it can flag the `effect` barrel before TypeScript project wiring exists.

Rika's Effect rules are reference material only. This package does not depend on Rika.

## Attribution

The implemented linteffect-derived rules are derived from `@catenarycloud/linteffect` v0.0.6, MIT © Roman Naumenko. Executor, t3code, and effect-smol are idea or scenario references for reimplemented rules; copied runtime code is not used.
