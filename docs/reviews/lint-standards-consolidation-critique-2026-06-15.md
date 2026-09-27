# Critique: lint-standards consolidation plan

Reviewed: `docs/exec-plans/active/lint-standards-consolidation-2026-06-15.md` against its
source draft (`prompt-exports/backpressure-consolidation.md`), `preset-architecture.md`,
`oxlint-standards/src/presets/shared.ts`, the live root config, and the installed
`vite-plus@0.1.15` / `oxlint@1.58.0` type surfaces. TD-CARD-033 was read via GNO.
Bounded critique only, not a rewrite.

## 1. Top 3 under-specified seams

1. **The config-fragment TYPE has an authoritative source the plan doesn't name (WI-2/D-A).**
   `vite-plus` types its `lint?` field as a single `OxlintConfig` from `oxlint`
   (`vite-plus/dist/index.d.ts:3,12`; `vite-plus/dist/lint.d.ts` is just `export type * from 'oxlint'`).
   `OxlintConfig extends Oxlintrc` and already carries `categories`, `options`, `plugins`,
   `jsPlugins`, `overrides` (`oxlint/dist/index.d.ts:151-237,687`). The plan says "new exported
   type for full config fragments" without deciding between two paths: reuse `OxlintConfig`
   (which means adding `oxlint` or `vite-plus` as a dep or peer, where the package today has
   neither and hand-rolls `PresetConfig` at `shared.ts:11-16`), or hand-roll a local structural
   type (the draft's "portability" choice) that can silently drift from what the consumer's
   `lint:` assignment actually accepts. Also unresolved: is `composeLintConfigs`'s return type
   `OxlintConfig` (so `lint: composeLintConfigs(...)` type-checks), and does the existing
   `PresetConfig.jsPlugins` shape match `OxlintConfig.jsPlugins` (`ExternalPluginEntry[]`, `:220`)?

2. **WI-2 verifies the wrong merge layer.** It says "verify `vite-plus` doesn't already merge
   fragments." It does not: `lint?: OxlintConfig` is one object, no array, no merge. The relevant
   native composition is oxlint's own: `OxlintConfig.extends?: OxlintConfig[]` plus an oxlint
   `defineConfig` helper (`oxlint/dist/index.d.ts:688,696`). The real question is whether
   `lint: { extends: [baseConfig, vitestConfig], rules: {…} }` is honored at the
   vite-plus-to-oxlint runtime boundary. Caveat: raw `.oxlintrc` `extends` is `string[]` file
   paths (`:167`); the inline-object form is the JS-API type only, so it must be verified at
   runtime, especially the `plugins` union and `overrides` merge. If it works,
   `composeLintConfigs` largely reinvents `extends`. Compare against `extends`, not vite-plus.

3. **The manifest schema delta (WI-5) is unspecified.** `RuleManifestEntry` carries a single
   `presetEnabled: boolean` and `sourcePresets: string[]`, and `domain` is
   `effect|effect-react|general|boundaries|lsp` (`rule-manifest.ts:3,32-47`). None of that can
   express "native rule, member of `baseConfig` AND `nodeRuntimeConfig`, rationale class =
   safety." WI-5 says "represent native/config membership + rationale class" but not how. The
   draft surfaced the concrete fix (replace `presetEnabled` with a `collections`/`enabledIn`
   array); the plan dropped it. Manifest `severity` is also `off|info|warning|error` versus config
   `off|warn|error`, and the collapse mapping is undefined.

## 2. Specificity balance

- **Dropped framing, `baseConfig.options`.** WI-3 lists only `reportUnusedDisableDirectives`.
  The draft (Q-B) and the live config (`vite.config.ts:32-35`) also set `typeAware: true` and
  `typeCheck: true`. The plan must take an explicit stance: shipping `typeAware: true` while
  delegating all type-aware rules to the LS boundary (group B) is contradictory; omitting it
  silently changes current behavior. Name it.
- **Appropriately deferred.** WI-4 does not re-pin the draft's exact vitest severities, which is
  the implementer's call. Good restraint; keep it.
- **Mild over-specification.** The plan pins `composeLintConfigs`'s internals ("unique-concat
  plugins, later-wins rules, concat overrides") before resolving whether the helper should exist
  at all (seam 2). That specifies mechanics ahead of the gating decision.

## 3. Contradictions and missing dependencies

- **Namespace mismatch.** The plan and decisions write `typescript/*`; the live config and presets
  use `@typescript-eslint/*` (`vite.config.ts:39-43`). oxlint aliases both, so `--print-config`
  may normalize to one form and make WI-6's "doc not stale" gate flap. Pick one namespace for
  configs plus manifest keys and assert it in the gate.
- **`--print-config` mechanism missing.** WI-6/WI-9 generate effective config via
  `oxlint --print-config`, but consumption is an in-memory JS object fed through `vite-plus`, not
  a file oxlint reads. The materialization step (emit a temp `.oxlintrc.json` from the fragment,
  then print) is unspecified and depends on seams 1 and 2.
- **WI-1 is a no-op.** "Record resolved architecture (this doc)" is already satisfied by the plan
  itself; it is not work.

## 4. Over-planning risk

The publishable cut needs `baseConfig`, `vitestConfig`, `nodeRuntimeConfig`, `composeLintConfigs`,
each with a live dogfood consumer. The plan also builds and exports `jsdocConfig`,
`architectureConfig`, `namedExportsConfig`, `explicitApiConfig`, `reactConfig`, `jsxA11yConfig`,
`reactPerfConfig` now, with no real consumer until "tome later" and only fixture validation.
Because preset and fragment names are public API and renaming after publish is breaking
(PA-1/PA-2), this locks seven speculative names against zero real usage. Cut the React trio and
`explicitApi` from this effort; ship them when tome actually adopts and the taxonomy is locked
(see the naming tension in §5).

## 5. Pressure-test of the four flagged tensions

- **(D-C) Type-import hybrid: conflict-free, but one rule is missing.** The trio already runs green
  in backpressure today (`vite.config.ts:40,43,44`), so it is empirically conflict-free and
  sufficient for the split it targets (mixed imports go inline, type-only imports stay
  top-level). The gap: the plan never
  sets `no-duplicate-imports: 'off'`, the exact rule whose clash produced the original
  `eslint-disable` idiom. The plan adds the inline-aware `import/no-duplicates {preferInline}`
  (the correct replacement) but leaves the ESLint-core `no-duplicate-imports` to whatever the
  category flip yields. It is version-sensitive: the live config does not set it and stays green,
  so it is currently not in an active error category at 1.58.0. Set it to `off` explicitly, pin it
  via the WI-6 gate, and add a fixture for the type-only plus `preferInline` interaction.
- **(D-D) Severity under `--max-warnings 0`: coherent with TD-CARD-033, no separate lane needed.**
  TD-CARD-033 (strength `default`) has two real invariants: grade `error` by problem kind
  (correctness/safety/agent-failure-mode) and reject blanket all-error packs. The card's "stay
  quieter" is satisfied by `off` (the quietest); it does not mandate a `warn` tier. D-D's "justify
  `error` or else `off`" preserves grade-by-kind and avoids blanket all-error, so it does not
  violate canon. Because `--max-warnings 0` makes `warn` equal to `error`, a real `warn` tier would
  be theatre, and a separate advisory lane is not warranted for these repos. Two conditions: (a)
  the per-rule grade-by-kind proof must move into WI-5's `rationale class`, since that field is the
  canon-compliance mechanism (per TD-SPECIMEN-003); (b) name the disposition of the draft's former
  `warn` rules (`prefer-template`, `no-inferrable-types`, `dot-notation`, `no-this-alias`), each of
  which must land as `error` or `off` rather than being silently dropped.
- **(composeLintConfigs vs vite-plus): not a DRY violation against vite-plus, but test it against
  oxlint `extends` first.** vite-plus provides no fragment merge, so some composition is needed.
  Whether a custom helper is justified depends entirely on oxlint's native `extends` (seam 2): if
  `extends` honors in-memory objects with a plugins-union and overrides-concat merge, the helper is
  redundant. Resolve that before building it.
- **(Naming taxonomy): real collision; resolve before building the React fragments.** PA-2 reserves
  the bare `react` name for a future stack-neutral React preset; the plan ships `reactConfig`, a
  fragment, for the same stack-neutral React concept. Two surfaces, overlapping intent, guaranteed
  future confusion. PA-5's mutual-exclusivity (`effect-react` versus a general `react`) is stated
  at the preset layer, but nothing stops a consumer composing `reactConfig` next to
  `effectReactPreset` through `composeLintConfigs`, so the fragment layer needs its own
  exclusivity statement. Cleanest convention: keep custom rule packs as `…Preset`, give every full
  fragment a consistent `…Config` suffix, and do not name the React fragment off a reserved preset
  name. Pick one React surface (preset or fragment), not both. Since this is unresolved and names
  are permanent post-publish, it reinforces §4: defer the React and UI fragments.

## Net

The Phase-1 spine (base/vitest/node/compose, then dogfood, publish, introspection) is sound. Before
building, resolve three things the plan leaves open: the fragment type's source of truth (seam 1),
`composeLintConfigs` versus oxlint `extends` (seam 2), and the preset-vs-fragment naming lock (§5,
naming). Add explicit `no-duplicate-imports: 'off'`, a `baseConfig` stance on
`typeAware`/`typeCheck`, and a manifest schema for native and config membership. Cut WI-1 and the
speculative React and `explicitApi` exports from this cut.
