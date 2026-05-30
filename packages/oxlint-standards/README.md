# @mplibunao/oxlint-standards

Opinionated oxlint presets for MP's code-quality backpressure package.

Status: first substrate rule available. The package exports an oxlint JS plugin plus early preset objects.

## Usage

Install the package, then load it from a standalone `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@mplibunao/oxlint-standards"],
  "rules": {
    "@mplibunao/oxlint-standards/no-effect-as": "error"
  }
}
```

The compiled package is the supported consumer path. Inline vite-plus `jsPlugins` config may work later, but this package validates the standalone oxlint config path first.

## Current rule

`no-effect-as` reports namespace-bound `Effect.as(...)` calls from `effect` or `effect/Effect` imports. Use `Effect.map` for value mapping or `Effect.asVoid` after explicit pipeline steps.

## Presets

The main package entry exports:

- `effectPreset`
- `effectReactPreset`
- `generalPreset`
- `boundariesPreset`

Only `effectPreset` currently enables a package rule. The unqualified `react` preset name is reserved for a future stack-neutral React preset.

## Attribution

`no-effect-as` is derived from `@catenarycloud/linteffect`, the MIT-licensed GritQL rule pack by Roman Naumenko. The GritQL tooling is not copied into this package.
