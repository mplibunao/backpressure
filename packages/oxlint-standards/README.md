# @mplibunao/oxlint-standards

Opinionated oxlint rule pack for MP's code-quality backpressure package.

The package exports an oxlint JS plugin, custom-rule presets, and full config fragments.

## Consumption model

The package ships two kinds of named exports.

**Presets** are the rule groups a consumer opts into. `generalPreset`, `effectReactPreset`, and
`boundariesPreset` contain `jsPlugins` and `rules`. `effectPreset` also carries plugins,
options, and a test-file override (see [Effect setup](#effect-setup)). The
[Presets](#presets) section lists what each one holds.

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
single flat config: rules and options merge with later-wins semantics, plugins and
`jsPlugins` merge by union, and overrides concatenate.

**Why `composeLintConfigs` instead of `extends`:** oxlint's native `extends` field
merges `rules`, `categories`, and `plugins`, but it uses replace semantics for
`overrides`; a child config's `overrides` array replaces the parent's rather than
appending to it. `baseConfig` ships test-file overrides that relax structural ceilings
for test code. Using `extends` would silently drop those overrides in every consumer.
`composeLintConfigs` concatenates `overrides` arrays instead.

For every rule each preset and config turns on, with its severity for normal and test files,
see the generated `docs/references/rules.md` in the repository. In the repository,
`pnpm rules:view` serves the same list locally with search and filters.

### Preset-only usage

To load a custom-rule preset without a full config baseline, reference it from a
standalone `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@mplibunao/oxlint-standards"],
  "rules": {
    "@mplibunao/oxlint-standards/no-double-cast": "error",
    "@mplibunao/oxlint-standards/no-ts-nocheck": "error"
  }
}
```

Do not copy only the rules of `effectPreset` this way. Its `@effect/tsgo` checks need the
plugin, the type-aware option, and the test-file override that come with the full object.

## Rule severity

Rules ship with graded default severities. Correctness, safety, and agent-failure-mode rules default to `error`. Style and preference rules default to a quieter level. The aim is an `error` signal worth acting on instead of a wall of errors.

Some coding agents act on `error` but skip `warn`, so an adversarial review step helps the quieter rules land. Under `--max-warnings 0`, a warning still fails the lint. Every rule is overridable: raise any rule to `error` in your own config when you want a hard stop. The reasoning is in `docs/decisions/004-rule-curation-and-severity-posture.md`.

## Presets

The main package entry exports:

- `effectPreset`: the full Effect v4 config. It holds the package's gen-first structural rules, every `@effect/tsgo` check with an explicit severity, and `require-yield: off` and `no-shadow: off`, because idiomatic `Effect.gen` conflicts with those native rules. It requires the setup below.
- `effectReactPreset`: three rules for React code built on Effect atoms: `no-react-state`, `no-render-side-effects`, and `no-atom-registry-effect-sync`. Compose it with `effectPreset`.
- `generalPreset`: stack-neutral JS/TS backpressure. It owns `prevent-dynamic-imports`, `no-double-cast`, `no-ts-nocheck`, `no-redundant-primitive-cast`, and built-in `no-nested-ternary`.
- `boundariesPreset`: package-boundary rules such as `no-cross-package-relative-imports`.

The unqualified `react` preset name is reserved for a future stack-neutral React preset. Do not combine `effect-react` with that future hooks-first preset because `effect-react` forbids hooks that a general React preset would regulate.

## Effect setup

`effectPreset` delegates type-aware Effect checks to [`@effect/tsgo`](https://github.com/Effect-TS/tsgo), which patches oxlint so its `effecttsgo/*` rules report next to this package's rules. The preset sets all 116 of them explicitly, so none depends on upstream defaults. An unpatched oxlint rejects the preset with `Unknown plugin: 'effecttsgo'`, so a missing patch fails the lint instead of passing silently.

Pick one route. Using both reports every Effect diagnostic twice.

### Supported versions

`@effect/tsgo` patches only the exact tool versions it supports. For `@effect/tsgo` 0.46.1:

| Package | Default route (patched oxlint) | Fallback route (patched TypeScript) |
| --- | --- | --- |
| `@effect/tsgo` | `0.46.1` | `0.46.1` |
| `vite-plus` | `0.3.2` or `0.3.3`; tested with `0.3.2` | not used |
| `oxlint` | `1.82.0` or `1.83.0`, the versions those `vite-plus` releases bundle | not used |
| `oxlint-tsgolint` | `7.0.2001` | not used |
| `typescript` | your project's version; tested with `6.0.2` | `7.0.2` |
| `effect` | a v4 release that `@effect/tsgo` accepts; tested with `4.0.0-rc.115` | same |

This repository's integration tests run `vite-plus` 0.3.2 with oxlint 1.82.0. `@effect/tsgo` 0.46.1 also supports the `vite-plus` `1.0.0-rc` releases (oxlint `1.85.0` with oxlint-tsgolint `7.0.2002` or `7.0.2003`), which this package has not tested yet. It does not support `vite-plus` 0.3.1 (oxlint 1.81.0): the patch fails, and linting then fails with `Unknown plugin: 'effecttsgo'`. Upgrade `@effect/tsgo` and `vite-plus` together.

Both routes install `@effect/tsgo` at the exact pinned version. If your pnpm workspace sets `minimumReleaseAge` and that release is younger than the window, the install fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. Add exact-version `minimumReleaseAgeExclude` entries for `@effect/tsgo` and its seven platform packages, so the window stays in force for everything else:

```yaml
minimumReleaseAgeExclude:
  - '@effect/tsgo@0.46.1'
  - '@effect/tsgo-darwin-arm64@0.46.1'
  - '@effect/tsgo-darwin-x64@0.46.1'
  - '@effect/tsgo-linux-arm@0.46.1'
  - '@effect/tsgo-linux-arm64@0.46.1'
  - '@effect/tsgo-linux-x64@0.46.1'
  - '@effect/tsgo-win32-arm64@0.46.1'
  - '@effect/tsgo-win32-x64@0.46.1'
```

### Default route: patched oxlint

1. Install `@effect/tsgo`, `vite-plus`, `oxlint`, `oxlint-tsgolint`, and `@mplibunao/tsconfig` at supported versions, plus `bun-types` if your tsconfig extends `server.json`.
2. Append the patch to your existing `prepare` script, keeping what it already runs: `vp config && effect-tsgo patch --no-typescript --oxlint`. If you install with `--ignore-scripts`, run `effect-tsgo patch --no-typescript --oxlint` yourself after every install.
3. Extend the Effect overlay last in each tsconfig that covers Effect code: `"extends": ["@mplibunao/tsconfig/server.json", "@mplibunao/tsconfig/effect.json"]`. The `@mplibunao/tsconfig` README describes the overlay.
4. Compose the whole `effectPreset` into your lint config, and add `effectReactPreset` for React code:

```typescript
import {
  baseConfig,
  composeLintConfigs,
  effectBoundaryRules,
  effectPreset,
  effectReactPreset,
  nodeRuntimeConfig,
  vitestConfig,
} from '@mplibunao/oxlint-standards';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: composeLintConfigs(
    baseConfig,
    vitestConfig,
    nodeRuntimeConfig,
    effectPreset,
    effectReactPreset,
    {
      overrides: [
        { files: ['apps/cli/src/**/*.{ts,tsx}'], rules: { ...effectBoundaryRules } },
      ],
    },
  ),
});
```

A standalone `.oxlintrc.json` works too: write the composed object to it as JSON.

The preset turns `effecttsgo/strict-effect-provide` off in test files: names ending in `.test`, `.spec`, `-test`, or `-spec` with a JS or TS extension, and files under `test`, `tests`, or `__tests__` folders.

How the patched oxlint finds your TypeScript settings:

- It takes each file's TypeScript project from the nearest `tsconfig.json`, the way an editor does. The `--tsconfig` flag does not change that choice.
- When it cannot load that tsconfig, oxlint reports `typescript(tsconfig-error)` and that project's files get no `effecttsgo` diagnostics. Two causes are options that TypeScript 7 rejects and a missing `types` package: `server.json` needs `bun-types` installed. Fix the tsconfig until the error goes away.
- It reads the Effect plugin options from that `tsconfig.json` and the files it extends, so the overlay's options apply with the setup above. With them, `effecttsgo/effect-fn-opportunity` reports plain `(...) => Effect.gen(...)` wrappers as well as wrappers piped into `Effect.withSpan`.

To check the setup, add this file temporarily and run `vp lint`:

```typescript
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

class Config extends Context.Service<Config>()('Config', { make: Effect.succeed({}) }) {
  static Default = Layer.effect(this, this.make);
}

export const program = Effect.void.pipe(Effect.provide(Config.Default));

export const addOne = (n: number) =>
  Effect.gen(function* () {
    const value = yield* Effect.succeed(n);
    return value + 1;
  }).pipe(Effect.withSpan('addOne'));
```

Expect `effecttsgo(strict-effect-provide)` on the `Effect.provide` line and `effecttsgo(effect-fn-opportunity)` on `addOne`, both at error. Other rules in your config, such as the base config's return-type rule, may also report on this file. The first needs Effect's types to resolve, so a silent run means the file is outside a working TypeScript project or `effect` is not installed where the file can import it. An `Unknown plugin: 'effecttsgo'` error means the patch did not run.

### Fallback route: patched TypeScript 7

For a project that does not lint with oxlint:

1. Install `@effect/tsgo`, `typescript` 7.0.2, and `@mplibunao/tsconfig`.
2. Run `effect-tsgo patch` in `prepare`, or after every install when you use `--ignore-scripts`. `tsc --version` then ends in `+effect-tsgo.0.46.1`.
3. Extend `@mplibunao/tsconfig/effect-tsc.json` last, and add the test-file override entry from the `@mplibunao/tsconfig` README to your own tsconfig.

Your normal typecheck then reports the `@effect/tsgo` checks, and both errors and warnings fail it. This route runs no linter, so it does not apply this package's own rules.

### Boundary relaxation

`effectBoundaryRules` is a rules object for code at a boundary, such as a CLI entry point, a script, or a runtime adapter, where Promises, `JSON.parse`, and untyped failures are expected. Attach it to your own `files` globs in a final override, as the example above does. It turns off:

- this package's `no-effect-escape-hatch`, `no-instanceof-error`, `no-json-parse`, `no-promise-catch`, `no-promise-reject`, `no-switch-statement`, `no-try-catch`, and `no-unknown-error-message`;
- `@effect/tsgo`'s `async-function`, `new-promise`, `node-builtin-import`, `global-console`, `global-date`, `global-fetch`, `global-random`, `global-timers`, `crypto-random-uuid`, and `process-env`.

The `*-in-effect` checks and `strict-effect-provide` stay on, so code inside an Effect is still held to them. The base config's `no-console` also stays on unless you turn it off. The object carries no globs because every project's layout differs. The executor app relaxes these paths:

```typescript
{
  files: [
    'apps/cli/src/**/*.{ts,tsx}',
    'apps/desktop/src/main.ts',
    'scripts/**/*.{ts,js}',
    'apps/*/scripts/**/*.{ts,js}',
    'packages/*/*/scripts/**/*.{ts,js}',
    'packages/kernel/runtime-*/src/**/*.{ts,tsx,js,mjs}',
  ],
  rules: { ...effectBoundaryRules },
}
```

## Effect house style

The Effect rules enforce part of a house style. Lint cannot check every point, so treat each line as an instruction for the people and agents writing the code:

- **Imports and functions**
  - Translate `import { Effect } from 'effect'` in reference snippets to namespace subpath imports such as `import * as Effect from 'effect/Effect'`.
  - Explicit `Effect.Effect<...>` and `Layer.Layer<...>` annotations and type aliases are welcome; they help readers and type-check speed.
  - Write logic in `Effect.gen`, and reusable generator functions with `Effect.fn('name')` or, on hot paths, `Effect.fnUntraced`.
  - A plain function that returns a non-generator Effect, such as `() => Effect.succeed(value)`, is fine.
- **Errors**
  - Keep failures in the typed error channel as tagged errors: `Data.TaggedError` for internal errors, `Schema.TaggedErrorClass` for errors that cross the wire.
  - Never fail with a string literal or template string.
  - Recover with `Effect.catchTag`, `Effect.catchTags`, `Match.tag`, or `Effect.catchReason` instead of comparing `_tag` by hand; reading `_tag` to log it is fine.
  - Keep an unknown caught value as a typed error's `cause`, or decode it; never guess through `.message`, `String(error)`, or a cast.
  - A `catch`, `catchCause`, `mapError`, `match` `onFailure`, or `try` `catch` handler must read its error, such as by passing it on as `cause` or logging it; recording it first with `Effect.tapError` also counts. To absorb only some failures, name them with `Effect.catchTag`; to discard on purpose, use a named discard such as `Effect.orElseSucceed` or `Effect.ignore({ log: true })`.
- **Defects, runners, and provision**
  - Reserve `Effect.die` and `Effect.orDie` for unrecoverable failures, such as bad configuration at app entry, each with an inline disable that says why.
  - Run Effects only at composition roots and in tests, never from inside Effect logic.
  - Provide Layers at the root with an inline disable for `effecttsgo/strict-effect-provide`. Test files are exempt, and `Effect.provideService` is allowed.
- **React state**
  - Use atoms for shared and server state, and `useState` only for state local to one component. `no-react-state` cannot tell whether a `useState` value is shared.
  - Replace context with atom-react's `ScopedAtom`, which re-renders only the components that read a given atom.
  - `yield*` the v4 `Atom.get`, `set`, `update`, `modify`, and `refresh` Effects instead of wrapping them in `Effect.sync`; `AtomRegistry` instance methods stay synchronous.
- **Pipelines**
  - Do not put an inline `Effect.flatMap`, `andThen`, or `tap` callback inside another Effect callback, and do not build inside-out towers like `Effect.map(Effect.flatMap(source, f), g)`. `yield*` each step in one `Effect.gen` or `Effect.fn`, or pipe from the source.
  - One-step or adornment-only handler bodies, a value `Effect.map` inside a callback, `Effect.all` items, `Schedule`, `Layer`, and `Schema` pipes, runner and resource arguments, forked generators, ordinary `Effect.as`, `Effect.never`, and `Effect.sync` around a synchronous side effect are all fine.
- **Optional values and schemas**
  - Return `Option.none()` or `Effect.succeedNone` for an optional Effect result, not `null`; use `Option.fromNullishOr` and `Option.getOrNull` at nullable boundaries.
  - `Option.fromUndefinedOr` turns `null` into `Some(null)`; use `Option.fromNullishOr` when either can appear.
  - Hoist stable schemas to module scope; decoding inline with a hoisted schema is fine.
- **Domain values**
  - Model statuses and outcomes as Schema literals or tagged types, not ad hoc control-flow strings; other string constants and string results are fine.
  - Rebuild a `Schema.Class` value with its constructor, such as `MyClass.make(...)`, not object spread; spreading an ordinary record is fine.
- **Lint setup**
  - Use the full Effect config, the patch step, one route, and scoped boundary relaxation through `effectBoundaryRules`.
  - Do not turn off diagnostics wholesale or bring back removed rule settings to make a gate pass.

## Upgrading from 0.1.0

This release is breaking for Effect consumers.

- `effectPreset` is now a full config that requires `@effect/tsgo` and the patch. Compose the whole object; a config that copies only its `rules` misses the plugin and options.
- `@effect/tsgo` 0.46.1 is a new optional peer dependency. Consumers that do not use `effectPreset` do not need it, and the `oxlint` peer range stays `^1.58.0`.
- `lspOwnedChecks` is removed; `tsgoOwnedChecks` lists the delegated `effecttsgo/*` rule IDs. Rule metadata drops `effectVersionSensitivity`. The language-service values `lsp`, `LSP-delegated`, and `LSP` become the domain `tsgo`, the disposition `tsgo-delegated`, and the source ownership `@effect/tsgo`.
- New exports: `effectTsgoConfig`, `effectBoundaryRules`, `tsgoOwnedChecks`, and the types `EffectPresetConfig`, `EffectTsgoConfig`, and `TsgoRuleId`.
- These 27 rules are removed from the plugin. Delete any setting that names one of them, including `off` settings. Where an `@effect/tsgo` check replaces a rule, the preset ships that check at `error`:

| Removed rule | What covers its shape now |
| --- | --- |
| `effect-no-multiple-provide` | `effecttsgo/multiple-effect-provide` |
| `no-effect-async` | `effecttsgo/outdated-api` |
| `no-effect-do` | `effecttsgo/effect-do-notation` |
| `no-effect-orElse-ladder` | `effecttsgo/outdated-api` |
| `no-effect-sync-console` | `effecttsgo/global-console-in-effect` |
| `no-inline-runtime-provide` | `effecttsgo/strict-effect-provide` |
| `no-nested-effect-gen` | `effecttsgo/nested-effect-gen-yield` |
| `no-runtime-runfork` | `effecttsgo/run-effect-inside-effect` |
| `no-wrapgraphql-catchall` | `effecttsgo/outdated-api` |
| `prefer-effect-fn` | `effecttsgo/effect-fn-opportunity` |
| `prefer-yield-tagged-error` | `effecttsgo/unnecessary-fail-yieldable-error` |
| `no-call-tower` | `no-effect-call-in-effect-arg`, which owns the shallow nested-call shape |
| `no-nested-effect-call` | `no-effect-ladder`, which owns the deep nested-call shape |
| `no-effect-as` | Plain `Effect.as` is allowed; `no-effect-side-effect-wrapper` still reports a side-effect call in its value slot |
| `no-naked-object-state-update` | `JSON.stringify` and object spread are allowed; `no-json-parse` still reports `JSON.parse` |
| `no-effect-never`, `no-effect-succeed-variable`, `no-effect-type-alias`, `no-effect-wrapper-alias`, `no-family-collection-read`, `no-manual-effect-channels`, `no-match-void-branch`, `no-return-in-arrow`, `no-return-in-callback`, `no-string-sentinel-const`, `no-string-sentinel-return`, `warn-effect-sync-wrapper` | Nothing; the shapes they flagged are allowed |

- New rules: `no-string-error-channel` reports `Effect.fail` with a string argument, and `no-discarded-failure` reports a blanket recovery handler that never reads its error unless a `tapError`, `tapCause`, or `tapDefect` recorded it first.
- Several kept rules changed what they report. `no-manual-tag-check`, `no-unknown-error-message`, `no-effect-call-in-effect-arg`, `no-effect-ladder`, `no-flatmap-ladder`, `no-effect-side-effect-wrapper`, `no-return-null`, `no-inline-schema-compile`, and `no-effect-escape-hatch` are narrowed. `no-pipe-ladder` now reports an inline `Effect.flatMap`, `andThen`, or `tap` callback nested inside another Effect callback, once per outer callback; nested pipelines without such a callback are no longer reported. `no-fromnullable-nullish-coalesce`, `no-atom-registry-effect-sync`, and `no-effect-internal-tags` target v4 names. `no-react-state` no longer bans `useState`. `no-return-null` and `no-inline-schema-compile` are now warnings. The rules page says what each rule catches now.

## Catalog posture

v0 targets Effect v4 identifiers and conventions: gen-first logic, named `Effect.fn` / `Effect.fnUntraced` wrappers, namespace imports from submodules, and v4 Schema, Layer, and Error names. Effect v3 spellings are out of scope unless a v4 structural matcher catches them naturally.

The catalog currently records:

- 43 custom rules: 22 ported from linteffect v0.0.6 and 21 reimplemented from executor, recon, t3code, effect-smol, and linteffect ideas. `effectPreset` holds 35 of them, `effectReactPreset` 3, `generalPreset` 4, and `boundariesPreset` 1.
- 116 `@effect/tsgo` checks at their pinned 0.46.1 settings, with 44 at `error` and 67 at `warn`. The other 5 are `off`, including `prefer-schema-over-json`.
- 50 linteffect source rules represented for inventory, of which 27 are dropped.
- 30 dropped rules in total, 11 of them with an `@effect/tsgo` replacement.
- 135 built-in oxlint rule settings across the config fragments, including `no-nested-ternary` in `generalPreset`.

See `docs/references/rules.md` for the consumer-facing catalog and `src/rule-manifest.ts` for the machine-checkable source of truth.

## Attribution

The linteffect-derived rules are derived from `@catenarycloud/linteffect`, the MIT-licensed GritQL rule pack by Roman Naumenko. The GritQL tooling is not copied into this package.

Executor, t3code, and effect-smol are idea or scenario references for reimplemented rules; this package copies no runtime code from them. Rika's Effect rules are reference material only, and this package does not depend on Rika.
