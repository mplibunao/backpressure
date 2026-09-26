---
"@mplibunao/oxlint-standards": minor
---

Consolidate the rule pack and enforce a broader baseline. The base config gains import-hygiene and control-flow rules plus a `unicornConfig` general-quality fragment. The test override gains four vitest hygiene rules, and the base now enables `@typescript-eslint/explicit-module-boundary-types`. A new `jsdocConfig` fragment validates existing doc blocks without forcing documentation onto undocumented exports. Every newly enabled rule is graded by kind in the manifest.

The package now builds with tsdown as a single-entry ESM bundle with bundled declarations, and its source uses the `#oxlint-standards/*` package-internal alias, which resolves at build time so no internal specifier leaks to consumers.

Adopting repos that lint with the base config will see the new error-level rules fire on existing code, so plan a cleanup pass when upgrading.

**Breaking: the Effect preset now requires `@effect/tsgo`.** Type-aware Effect checks move from the recommended `@effect/language-service` setup to `@effect/tsgo`, which patches oxlint so its `effecttsgo/*` rules report in the same lint run. The preset configures all 113 of them and enables 108. `effectPreset` is now a full config: besides this package's rules and the `no-shadow` and `require-yield` carve-outs, it carries the `effecttsgo` plugin, `options.typeAware`, an explicit severity for every `@effect/tsgo` rule, and a test-file override. Compose the whole object with `composeLintConfigs`; copying only its `rules` loses the rest.

Effect consumers must now:

- Install `@effect/tsgo` `0.45.0`, a new optional peer dependency, with a supported toolchain: `vite-plus` `0.3.1` or `0.3.2`, which bundle oxlint `1.81.0` or `1.82.0`, and oxlint-tsgolint `7.0.2001`. `vite-plus` `0.3.3` and the `1.0.0-rc` releases are not supported yet.
- Run `effect-tsgo patch --no-typescript --oxlint` from `prepare`, or after every install when installing with `--ignore-scripts`.
- Extend `@mplibunao/tsconfig/effect.json` last in each tsconfig that covers Effect code.

An unpatched or unsupported oxlint stops with `Unknown plugin: 'effecttsgo'`. Consumers that do not use `effectPreset` need none of this, and the `oxlint` peer range stays `^1.58.0`.

These 26 rules are removed. Delete every setting that names one, including `off` settings: `effect-no-multiple-provide`, `no-call-tower`, `no-effect-as`, `no-effect-async`, `no-effect-do`, `no-effect-never`, `no-effect-orElse-ladder`, `no-effect-succeed-variable`, `no-effect-sync-console`, `no-effect-type-alias`, `no-effect-wrapper-alias`, `no-family-collection-read`, `no-inline-runtime-provide`, `no-manual-effect-channels`, `no-match-void-branch`, `no-naked-object-state-update`, `no-nested-effect-call`, `no-nested-effect-gen`, `no-return-in-arrow`, `no-return-in-callback`, `no-runtime-runfork`, `no-string-sentinel-const`, `no-string-sentinel-return`, `no-wrapgraphql-catchall`, `prefer-yield-tagged-error`, and `warn-effect-sync-wrapper`. Ten of them have an `@effect/tsgo` replacement that the preset ships at `error`; the package README maps each one.

Public API changes:

- Removed `lspOwnedChecks`; `tsgoOwnedChecks` lists the delegated `effecttsgo/*` rule IDs.
- Removed the `effectVersionSensitivity` field from `RuleManifestEntry`. The rule-domain value `lsp` is now `tsgo`, the disposition `LSP-delegated` is now `tsgo-delegated`, and the source ownership `LSP` is now `@effect/tsgo`.
- `effectPreset` is typed as the new `EffectPresetConfig` instead of `PresetConfig`.
- Added `effectTsgoConfig`, `effectBoundaryRules` (a rules object that relaxes boundary code on the globs you choose), `tsgoOwnedChecks`, and the types `EffectPresetConfig`, `EffectTsgoConfig`, and `TsgoRuleId`.

Rule changes: the new `no-string-error-channel` reports `Effect.fail` with a string. `no-manual-tag-check`, `no-unknown-error-message`, `no-effect-call-in-effect-arg`, `no-effect-ladder`, `no-flatmap-ladder`, `no-effect-side-effect-wrapper`, `no-return-null`, `no-inline-schema-compile`, and `no-effect-escape-hatch` now match narrower, reference-compatible shapes. `no-pipe-ladder` now reports only Effect pipelines nested in other Effect pipelines or transforming callbacks, including some shapes it missed before. `no-react-state` allows `useState`. `no-return-null` and `no-inline-schema-compile` drop to `warn`. Every rule now has a written message with a fix.
