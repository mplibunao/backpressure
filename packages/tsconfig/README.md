# @mplibunao/tsconfig

Strict shared TypeScript configs.

## Base configs

- `@mplibunao/tsconfig/base.json`: strict compiler options with no runtime environment.
- `@mplibunao/tsconfig/server.json`: `base.json` plus Bun types for server and CLI packages.
- `@mplibunao/tsconfig/browser.json`: `base.json` plus DOM libraries and the React JSX transform.

Extend one of them and add your own `include`:

```json
{
  "extends": "@mplibunao/tsconfig/server.json",
  "include": ["src"]
}
```

## Effect overlays

Two overlays carry the `@effect/tsgo` settings that go with the Effect config from `@mplibunao/oxlint-standards`. Each overlay sets only the Effect plugin entry. It sets no `include`, `types`, `lib`, or `jsx`, so it never resets what your base config chose. List your base config first and the overlay last.

Pick exactly one route and extend only its overlay:

| Route | Overlay | Who reports Effect diagnostics | Severity owner |
| --- | --- | --- | --- |
| Default: patched oxlint | `effect.json` | `oxlint` or `vp lint` with the full `effectPreset` | The oxlint config |
| Fallback: patched TypeScript 7 | `effect-tsc.json` | `tsc` during your normal typecheck | The overlay |

Both overlays share the same plugin options, generated from one graded policy. The default overlay sets `diagnostics: false`, so your editor does not repeat what oxlint reports. It also carries no severity map. The fallback overlay sets every one of the 113 `@effect/tsgo` diagnostics explicitly, and both errors and warnings fail the typecheck.

### Tested versions

| Package | Default route | Fallback route |
| --- | --- | --- |
| `@effect/tsgo` | `0.45.0` | `0.45.0` |
| `typescript` | `6.0.2` | `7.0.2` |
| `vite-plus` | `0.3.2` | not used |
| `oxlint` | `1.82.0` | not used |
| `oxlint-tsgolint` | `7.0.2001` | not used |
| `effect` | `4.0.0-rc.115` | `4.0.0-rc.115` |

`@effect/tsgo` patches only the exact targets it supports. With another oxlint version the patch fails, and Effect linting fails with it.

### Default route: patched oxlint

1. Install `@effect/tsgo`, `vite-plus`, `oxlint`, and `oxlint-tsgolint` at the versions above.
2. Patch the linter. Append `effect-tsgo patch --no-typescript --oxlint` to your existing `prepare` script and keep what it already runs: `vp config && effect-tsgo patch --no-typescript --oxlint`. If you install with `--ignore-scripts`, run the patch yourself after every install.
3. Extend the overlay:

```json
{
  "extends": ["@mplibunao/tsconfig/server.json", "@mplibunao/tsconfig/effect.json"],
  "include": ["src"]
}
```

4. Compose the full `effectPreset` from `@mplibunao/oxlint-standards` into your lint config. It includes the delegated rules, their severities, and the test-file scope.

An unpatched oxlint rejects that config with an unknown `effecttsgo` plugin error, so a missing patch fails the lint instead of passing silently.

### Fallback route: patched TypeScript 7

1. Install `@effect/tsgo` and `typescript` at the versions above.
2. Patch the compiler: run `effect-tsgo patch` in `prepare`, or after every install when you use `--ignore-scripts`. Check the result with `tsc --version`, which prints a version ending in `+effect-tsgo.0.45.0`. An unpatched `tsc` ignores the plugin and reports no Effect diagnostics at all.
3. Extend the overlay and add the test-file override in your own tsconfig:

```json
{
  "extends": ["@mplibunao/tsconfig/server.json", "@mplibunao/tsconfig/effect-tsc.json"],
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        "overrides": [
          {
            "include": [
              "**/*.test.cjs",
              "**/*.test.cts",
              "**/*.test.js",
              "**/*.test.jsx",
              "**/*.test.mjs",
              "**/*.test.mts",
              "**/*.test.ts",
              "**/*.test.tsx",
              "**/*.spec.cjs",
              "**/*.spec.cts",
              "**/*.spec.js",
              "**/*.spec.jsx",
              "**/*.spec.mjs",
              "**/*.spec.mts",
              "**/*.spec.ts",
              "**/*.spec.tsx",
              "**/*-test.cjs",
              "**/*-test.cts",
              "**/*-test.js",
              "**/*-test.jsx",
              "**/*-test.mjs",
              "**/*-test.mts",
              "**/*-test.ts",
              "**/*-test.tsx",
              "**/*-spec.cjs",
              "**/*-spec.cts",
              "**/*-spec.js",
              "**/*-spec.jsx",
              "**/*-spec.mjs",
              "**/*-spec.mts",
              "**/*-spec.ts",
              "**/*-spec.tsx",
              "**/__tests__/**/*",
              "**/test/**/*",
              "**/tests/**/*"
            ],
            "options": {
              "diagnosticSeverity": {
                "strictEffectProvide": "off"
              }
            }
          }
        ]
      }
    ]
  },
  "include": ["src"]
}
```

The override turns `strictEffectProvide` off in test files, the same scope the default route's oxlint config uses. It has to live in your tsconfig: `@effect/tsgo` resolves an override's `include` globs from the folder of the tsconfig that declares it, so globs inside the installed overlay would match only files in the package's own folder. In a monorepo, put this entry in a shared tsconfig that each package extends, and the globs resolve from that shared file's folder.

This route runs no linter, so it does not apply the custom AST rules from the lint package.

### Plugin entries

Keep the entry name `@effect/language-service`; `@effect/tsgo` reads its settings under that name.

On the fallback route, the patched `tsc` merges the Effect entry across `extends` key by key. An entry you add, like the override above, changes only the keys it sets, and a `plugins` array that has no Effect entry still keeps the overlay's Effect settings. Standard `tsconfig` rules still apply to any other TypeScript plugins: a `plugins` array in your tsconfig replaces the inherited array.

On the default route, the patched oxlint reads the Effect settings from the `tsconfig.json` nearest each linted file. When that file uses `extends`, oxlint runs with upstream's default Effect settings instead, so the overlay's `effectFn` and other options do not reach it. With the default `effectFn`, `effect-fn-opportunity` reports only wrappers piped into `Effect.withSpan`. The lint package's `prefer-effect-fn` rule reports the plain `(...) => Effect.gen(...)` wrappers that it misses there.
