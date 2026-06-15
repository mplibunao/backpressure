# Lint standards consolidation: plan

Status: deep-plan complete; resolve the WI-1 pre-build items before building
(2026-06-15)

## Goal

Stop every consumer repo from hand-rolling the same ~25 lint rules. Decide what
`@mplibunao/oxlint-standards` should ship beyond its custom AST rules, fold the
shared hygiene + structural ceilings + type-import style into the package, resolve
the inline-vs-top-level type-import conflict at the source, and reconcile the
taste-distillery canon and `@mplibunao/tsconfig` so the same drift cannot recur.

## Background

All findings below come from read-only recon across introspection, backpressure,
surf-cli, tome.nvim, and the taste-distillery canon. File:line anchors are in
`## References`.

### Current state: the package ships almost nothing reusable

`@mplibunao/oxlint-standards` exports four presets (`generalPreset`,
`effectPreset`, `effectReactPreset`, `boundariesPreset`), but the preset shape is
only `{ jsPlugins, rules }` (`src/presets/shared.ts:11-16`). Presets set **no
oxlint categories** and carry **only custom plugin rules plus a couple built-ins**.
`generalPreset` is five rules total: `prevent-dynamic-imports`, `no-double-cast`,
`no-ts-nocheck`, `no-redundant-primitive-cast`, and built-in `no-nested-ternary`.

None of the standard config a TypeScript repo actually needs lives in the package:
no category severities, no `typescript/*` or `import/*` rules, and none of the
structural ceilings. Every consumer re-declares all of that locally.

### Consumption map

| Repo | Consumes preset? | How | Local block |
|---|---|---|---|
| introspection | yes (`generalPreset`) | pnpm `catalog:` → published npm `0.1.0` | ~25 rules + categories + ceilings |
| backpressure (root) | **no**: owns the package but its root config does not import its own preset | workspace owner | ~25 rules + categories + ceilings, near-identical to introspection |
| surf-cli | no dependency at all | fully local | large independent rule set |
| tome.nvim | no dependency at all | fully local | independent; uses **top-level** type-imports |

The introspection and backpressure-root blocks are nearly identical. That
duplication is the core problem. surf-cli and tome.nvim do not consume the package
today, so they are evidence of what is broadly wanted, not live consumers.

### Fold-in classification (first-cut recommendation)

Every rule in surf-cli and tome.nvim was classified on a factual axis. Distilled:

**A. Stack-neutral hygiene, not yet in the shared block, strong base/`general`
candidates** (appear in surf-cli and/or tome.nvim, no stack assumption):
`eqeqeq`, `no-debugger`, `no-empty`, `no-cond-assign`, `no-async-promise-executor`,
`no-undef`, `no-unused-private-class-members`, `typescript/no-unused-vars`
(`^_` ignore), `typescript/ban-ts-comment`, `typescript/no-invalid-void-type`,
`prefer-const`, `prefer-template`, `curly`, `typescript/consistent-type-exports`,
`typescript/no-inferrable-types`, `typescript/prefer-function-type`, `no-else-return`,
`typescript/no-restricted-types`, `typescript/no-unnecessary-type-constraint`,
`typescript/no-useless-constructor`, `no-useless-catch`, `typescript/no-this-alias`,
`no-void`, `typescript/prefer-optional-chain`, `typescript/dot-notation`, `no-eval`,
`default-param-last`, `no-unsafe-optional-chaining`, `no-barrel-file`.

**B. Type-aware (need the type checker; home is a dedicated decision, NOT base):**
`no-floating-promises`, `no-misused-promises`, `await-thenable`,
`no-unnecessary-condition`, `only-throw-error`, `no-base-to-string`, `unbound-method`,
`restrict-template-expressions`, `no-implied-eval`, `no-redundant-type-constituents`,
`switch-exhaustiveness-check`, `no-confusing-void-expression`, `no-deprecated`.
Coverage reality check: `no-floating-promises` is wanted by **both** surf-cli and
tome.nvim (strongest cross-repo signal), but it is NOT covered by `tsc` (no compiler
flag exists) and NOT by `@effect/language-service` (which handles Effect-specific
concerns, not raw Promise floating). "Delegate to LS/tsc" overstates coverage: the
only thing that catches these is the lint rule itself. oxlint's type-aware support is
recent and may be incomplete, experimental, or carry a perf cost (the same gap Biome
has; ESLint covers it via typescript-eslint, but on the slow type-checked path).
Deferred to its own decision, contingent on verifying oxlint type-aware at the pinned
version (see the deferred bucket in WI-21).

**C. Stack/tool-coupled (belong in a stack preset, existing or future, never
`general`):** `jest/*` (surf-cli), `vitest/*` (tome.nvim), `react/*`,
`react-perf/*`, `jsx-a11y/*` (tome.nvim → the reserved stack-neutral `react`
preset), `jsdoc/*` (tome.nvim → a docs preset), `unicorn/*` (both → an opinionated
`unicorn`/recommended layer), `oxc/*`, and most `import/*` rules (a base/import
config or `boundaries`).

**D. Conflicts to resolve, not silently fold:**
- `no-shadow`: surf-cli wants `error`; `effectPreset` sets it `off` (gen-first
  shadowing). Coherent only if a base sets it on and `effect` keeps its `off`
  carve-out.
- `@typescript-eslint/explicit-function-return-type`: tome.nvim `error`,
  backpressure root `off`. Genuine disagreement.
- `no-non-null-assertion`: surf-cli and tome.nvim want `error`; the `effect` preset
  doc deliberately leaves it at the consumer's native default. Reconcile.
- `import/no-default-export`, `import/no-relative-parent-imports`: introspection
  sets `off`, tome.nvim sets `error`. Opposite intent.

### The type-import conflict and its correct fix

The goal is a hybrid: mixed value+type imports use inline (`import {value, type T}`);
type-only imports use top-level (`import type {T}`). Three rules interact, and the
naive "set both rules to inline" config is wrong:

- `typescript/consistent-type-imports` `{ prefer: type-imports, fixStyle:
  inline-type-imports }` marks and inlines the type specifier on a mixed import.
- `typescript/no-import-type-side-effects: error` forces a top-level `import type`
  when every specifier is type-only, because under `verbatimModuleSyntax: true`
  (already on in `@mplibunao/tsconfig base.json`) an all-inline-type import leaves a
  runtime `import {}` side-effect. This rule owns the type-only case.
- `import/consistent-type-specifier-style` must be `off`. Its `prefer-top-level`
  setting rejects the inline mixed form and recreates the `no-duplicate-imports`
  clash; its `prefer-inline` setting fights `no-import-type-side-effects` on type-only
  imports. Neither value is compatible with the hybrid.

Critical correction: introspection's current config already runs
`consistent-type-imports` inline + `no-import-type-side-effects` while leaving
`consistent-type-specifier-style` at its `prefer-top-level` category default. That is
exactly the config that forced the `/* eslint-disable no-duplicate-imports */` idiom.
Leaving the rule unset is not the fix; it must be set to `off` explicitly and verified
against the active category. introspection and backpressure already lean inline;
tome.nvim uses top-level; canon is silent, so inline is MP's call.

### Architecture constraints (hard, from preset-architecture.md + TD canon)

- Preset axis is **stack coupling, not file type**. `general` must stay
  stack-neutral. Preset names are public API; renaming after publish is breaking
  (PA-1..PA-5).
- **Graded severity, no blanket all-error packs** (TD-CARD-033). A fold-in cannot
  mark everything `error`.
- **Native-first; build only what no tool ships; delegate type-aware checks**
  (TD-CARD-032), which supports keeping the type-aware cluster out of base.
- `rule-manifest.ts` owns the machine-readable rule catalog and preset membership
  (TD-CARD-026).

### Rollout and supply chain constraints

- Both repos enforce `minimumReleaseAge: 10080` (7 days), `strict: true`. A freshly
  published `@mplibunao/*` version is blocked for a week.
- pnpm catalogs **reject** `file:`/`link:` entries
  (`ERR_PNPM_CATALOG_ENTRY_INVALID_SPEC`), and CI checks out a single repo with
  `pnpm install --frozen-lockfile`, so a local sibling link breaks introspection CI.
  "Pull from local" is not viable as stated.
- Escape hatch already in use: `trustPolicyExclude` (for effect betas) has a sibling
  `minimumReleaseAgeExclude` that can exempt first-party `@mplibunao/*` packages.
- backpressure already validates the package as a consumer **without publishing**
  via `smoke:oxlint-packed-consumer`. Release is changesets + npm Trusted Publishing
  (OIDC), on push to `main` (ADR-006).

### taste-distillery canon: cards own posture, baselines own config

`source-of-truth-boundaries.md` says each fact has one owner and other surfaces must
not restate it. **Cards own** the default/posture/rationale; **baselines own**
copyable config; cards do not own "full copyable config." A direct precedent exists
for the question "should canon even list the rules": the Vale/doc-garden
baseline **stopped shipping a copyable `.vale.ini`** and points to `/doc-garden
setup` because the skill owns the version-pinned list (same pattern for
branch-protection and Corepack/mise).

TD-BASELINE-004 currently inlines the exact ceiling values (`max-lines` 500,
`max-lines-per-function` 75, `complexity` 20, `max-params` 4,
`import/max-dependencies` 15, etc.) and tells consumers to extend the package.
Once the package ships those values, the inlined copy becomes a duplicate fact.
TD-CARD-008 owns the posture; TD-BASELINE-004 owns the config. Amendment goes
through the authoring guide (frozen IDs, supersede rather than delete).

### Already-built pieces (Q5 reviewability)

`docs/references/rules.md` + `rule-manifest.ts` + `scripts/checks/check-rule-inventory.ts`
already document the **custom** rules. What is missing is an **effective-config**
view (categories expanded + standard plugin rules). `oxlint --print-config` and
`oxlint --rules --format=json` generate exactly that, and the existing inventory
gate is the place to hang it.

### `@effect/language-service` and `@mplibunao/tsconfig` (Q4)

The tsconfig package deliberately omits `@effect/language-service`: the documented
boundary (oxlint-standards README + `rules.md:30`) is "LS is type-aware and
project-specific; consumers wire it." MP recalls LS being the original reason for
creating the tsconfig package, so this boundary is up for reconciliation. The
type-aware cluster in group B above is the natural home for several LS diagnostics.

## Resolved decisions

Resolved with MP after the external draft. These are settled inputs to the work
items.

- **D-A Delivery model.** Add a new `baseConfig` export plus a family of opt-in
  config fragments. `generalPreset` and the other custom-rule presets keep their
  `{ jsPlugins, rules }` shape unchanged (expanding them would be a breaking API
  change and would break the stack-coupling taxonomy). `baseConfig` is a full
  config fragment (`categories`, `options`, `plugins`, `jsPlugins`, `rules`,
  `overrides`) and includes `...generalPreset.rules` so customs are not duplicated.
- **D-B Ship good configs, but gate each public NAME on a real consumer.** Configs are
  opt-in, so building them is low-risk. The real risk is that export NAMES are public
  API and lock at publish (PA-1/PA-2), so export a config only when a real consumer
  adopts it in this or the next branch. First cut: `baseConfig`, `vitestConfig`,
  `nodeRuntimeConfig`, `composeLintConfigs` (backpressure + introspection consume them
  now). Near-term: `jsdocConfig`, `architectureConfig`, `namedExportsConfig`
  (backpressure/introspection/tome adopt soon). **Deferred, do not export yet:**
  `explicitApiConfig`, `reactConfig`, `jsxA11yConfig`, `reactPerfConfig`: no consumer
  until tome, and the `reactConfig`-vs-reserved-`react`-preset naming collision
  (PA-2/PA-5) is unresolved. Naming convention to lock first: custom rule packs are
  `…Preset`, full fragments are `…Config`, no fragment is named off a reserved preset
  name, and there is one React surface, not two.
- **D-C Type-import style: inline hybrid.** `consistent-type-imports` inline +
  `no-import-type-side-effects: error` + `import/consistent-type-specifier-style: 'off'`
  (explicit, not omitted) + **`no-duplicate-imports: 'off'`** (the exact ESLint-core
  rule whose clash produced the original `eslint-disable` idiom; the inline-aware
  `import/no-duplicates { preferInline: true }` is its replacement). Pin all four via
  the WI-6 gate and add a fixture for the type-only + `preferInline` interaction. The
  trio runs green in backpressure's live root today, so it is empirically conflict-free
  for the split it targets. See the corrected Background section.
- **D-D Severity under `--max-warnings 0`.** Both repos run `vp lint --max-warnings 0`,
  so `warn` already fails CI. Keep that guardrail, so the model is binary: every
  rule is `error` or `off`, no cosmetic `warn` tier. The design critique confirmed this
  does NOT violate TD-CARD-033 (strength `default`): its real invariants are
  grade-by-problem-kind and reject-blanket-all-error, and "stay quieter" is satisfied by
  `off`. Two conditions: (a) the per-rule grade-by-kind proof lives in WI-5's `rationale
  class` field (the canon-compliance mechanism per TD-SPECIMEN-003); (b) the draft's
  former `warn` rules (`prefer-template`, `no-inferrable-types`, `dot-notation`,
  `no-this-alias`, `prefer-function-type`, `no-unnecessary-type-constraint`) each land
  explicitly as `error` or `off`, not silently dropped.
- **D-E Rollout.** Dogfood in backpressure first (it consumes its own configs and
  validates via packed-consumer smoke), publish via changesets/OIDC, then introspection
  via a catalog bump with version-scoped `minimumReleaseAgeExclude` entries for the
  exact new first-party versions. A branch-stack runway gates publish (see WI-11).
- **D-F `@effect/language-service`.** Ship an `effect.json` export in
  `@mplibunao/tsconfig` that extends `base.json` and adds the LS plugin wiring;
  `base.json` stays stack-neutral. LS is an optional peer, not a hard dependency.
- **D-G taste-distillery canon.** TD-CARD-008 keeps the posture; TD-BASELINE-004
  stops inlining the exact ceiling values and instead shows a composition recipe
  pointing at the package; the authoring guide gains a "do not duplicate package- or
  skill-owned generated config" rule. Add an Effect-LS hard-stop card and a
  JSDoc-as-contract card.
- **D-H Rule reviewability.** Generate a checked-in effective-config reference via
  `oxlint --print-config` / `--rules --format=json`, gated by `check-rule-inventory.ts`
  (two-way: every configured rule is known to oxlint, and the checked-in doc is not
  stale).

### Specific rule decisions folded into `baseConfig`

- `typescript/array-type`: `array-simple` (not `generic`, since the `generic` default
  was unreviewed LLM output; `array-simple` keeps `T[]` for plain types and `Array<T>`
  for complex ones).
- `max-statements`: `error` at `{ max: 10 }`. Ties to existing tracker task #17
  ("enable max-statements in backpressure + decompose violators"); expect a real
  decomposition sweep, which is the intended decompose-not-suppress behavior.
- `sort-imports`: `error` (autofixable, low-churn). `sort-keys`: **dropped**.
  Alphabetical key order buys findability and diff-determinism, not readability, and
  usually fights semantic grouping (records read best as id/name/related-fields, not
  A-Z). Under `--max-warnings 0` a `warn` would still block, it is not safely
  autofixable, and it churns on data/golden objects. The decomposition ceilings
  (`max-statements`, `max-lines-per-function`, `complexity`) are the real
  agent-readability guardrails. Revisit only as a rule scoped to large flat lookup
  maps, if ever.
- `no-non-null-assertion`: `error` in base (both surf-cli and tome.nvim want it).
  Reconcile the `effect`-preset doc note that currently leaves it at the consumer
  default.
- `no-shadow`: `error` in base; `effectPreset` keeps its `off` carve-out.
- Stack-neutral import hygiene in base: `import/first`, `import/no-self-import`,
  `import/no-duplicates` with `preferInline`. Architecture-policy import rules
  (`import/no-cycle`, `import/no-relative-parent-imports`, `no-barrel-file`,
  `import/no-default-export`) stay OUT of base and live in `architectureConfig` /
  `namedExportsConfig`.

## Approach

Consolidate into `@mplibunao/oxlint-standards` as a layered set of composable config
fragments, fixing the type-import conflict at the source and making the shipped
posture reviewable as generated evidence. Keep the existing custom-rule presets
untouched in shape. Roll out by dogfooding in backpressure, publishing, then adopting
in introspection, with the opt-in layers staged per repo afterward. Finally, move the
exact rule values out of taste-distillery so the package is the single source of truth.

Export model:

| Export | Role | Ship in first cut? |
|---|---|---|
| `generalPreset`, `effectPreset`, `effectReactPreset`, `boundariesPreset` | Existing custom-rule presets, shape unchanged | n/a (unchanged) |
| `baseConfig` | New canonical stack-neutral TS lint baseline (full fragment) | yes |
| `vitestConfig` | Vitest test hygiene | yes |
| `nodeRuntimeConfig` | `unicorn/prefer-node-protocol` and Node/Bun import hygiene | yes |
| `composeLintConfigs` | Deterministic merge helper (unique-concat plugins, later-wins rules, concat overrides) | yes |
| `jsdocConfig` | JSDoc-as-contract rules (types stay off) | export when adopted (backpressure/tome) |
| `architectureConfig` | `import/no-cycle`, `no-relative-parent-imports`, `no-barrel-file` | export when adopted (backpressure/tome) |
| `namedExportsConfig` | `import/no-default-export` + config-file overrides | export when adopted |
| `explicitApiConfig` | Scoped `explicit-function-return-type` for API boundaries | **deferred**: no consumer yet |
| `reactConfig`, `jsxA11yConfig`, `reactPerfConfig` | Stack-neutral React/a11y/perf | **deferred**: no consumer + `react` naming collision (resolve PA-2/PA-5 first) |

Per-repo adoption (from the external draft's matrix): backpressure = base + vitest +
nodeRuntime, then jsdoc/namedExports/architecture if sweeps are manageable;
introspection = base + vitest + nodeRuntime + `effectPreset` scoped to Effect files +
`effect.json` + LS; tome = the full UI stack later; surf-cli = selective, after the
model is proven; taste-distillery = base + nodeRuntime for its TS scripts only.

## Work items

Phase 1 is the publishable cut. Phases 2-3 are sequenced follow-on branches; the
stacked-branch runway (WI-11) gates any publish.

### Phase 1: package base, dogfood, publish, introspection

1. **Pre-build resolutions (RESOLVED 2026-06-15 by the WI-1 spike).** (a) **Fragment
   type source: reuse oxlint's `OxlintConfig`.** `vite-plus` types `lint?: OxlintConfig`
   (`vite-plus/dist/index.d.ts:4,11`) and `OxlintConfig` re-adds inline-object
   `extends?: OxlintConfig[]` (`oxlint/dist/index.d.ts:687-688`). The package declares
   zero dependencies today and hand-rolls `PresetConfig` at `shared.ts:11-16`; add
   `oxlint` as a peer dependency (every consumer already installs it through `vite-plus`)
   plus a dev dependency for the package's own typecheck. Fragments are typed
   `OxlintConfig`, so they cannot drift from what `lint:` accepts. (b)
   **`composeLintConfigs` is built, not skipped.** The spike confirmed native `extends`
   merges `rules` (child later-wins) and carries base `categories`/`plugins` rule
   severities through the full vite-plus to oxlint boundary (`vp lint` exit 0, base rules
   fire). But `overrides` is REPLACE-semantics: a base fragment's `overrides` are dropped
   unless the consumer re-declares them. The shared test-file overrides live in
   `baseConfig`, so relying on `extends` would silently drop them in every consumer and
   defeat the consolidation. The helper returns a single flat `OxlintConfig` (no
   `extends`) that merges rules later-wins, plugins and jsPlugins by union, categories
   per-category later-wins, and overrides by concat, which is the one merge `extends`
   cannot do. (c) **Naming taxonomy locked:** custom rule packs keep `…Preset`
   (`generalPreset`, `effectPreset`, `effectReactPreset`, `boundariesPreset`); full
   fragments are `…Config` (`baseConfig`, `vitestConfig`, `nodeRuntimeConfig`); the merge
   helper is `composeLintConfigs`; the React surface is deferred (WI-20), is a single
   surface when built, and is never named off the reserved `react` preset. Size S.
2. **Config-fragment type + composition.** Type every fragment as `OxlintConfig` from
   `oxlint` (WI-1a) and add `oxlint` as a peer plus dev dependency. Build
   `composeLintConfigs` (WI-1b): return type `OxlintConfig`, merge is plugins and
   jsPlugins union, later-wins rules, per-category later-wins categories, and concat
   overrides (the gap native `extends` cannot fill). Tests cover duplicate-plugin removal,
   rule precedence, and overrides concat across at least two fragments plus a consumer
   tail. Document native `extends` as the lightweight rules-only alternative, but the
   shipped consumer path is the helper so base-fragment overrides reach consumers.
   Existing presets compile unchanged. Key: `src/presets/shared.ts:11-16`, new
   `src/configs/`, `src/index.ts`. Size M.
3. **`baseConfig`.** The canonical baseline: graded categories (`correctness`,
   `suspicious`, `restriction` error; `style` off with explicit rules re-listed),
   `options` (`reportUnusedDisableDirectives`), structural ceilings incl.
   `max-statements` 10, the type-import hybrid (D-C), `array-simple`, `no-non-null`
   error, `no-shadow` error, group-A hygiene, base import hygiene, `sort-imports`
   error, `...generalPreset.rules`, and shared test overrides (off: `max-lines`,
   `max-lines-per-function`, `max-statements`, `import/max-dependencies`,
   `no-magic-numbers`, `no-unsafe-type-assertion`; kept on: `max-depth`, `max-params`,
   `complexity`). Explicit stance: `baseConfig` does NOT set `typeAware`/`typeCheck`
   (the live config sets them `true`, but that contradicts delegating the type-aware
   cluster; state the change, do not drop it silently). Pick ONE rule namespace
   (`@typescript-eslint/*`, as the live config uses, vs `typescript/*`) for configs and
   manifest keys and assert it in the WI-6 gate (oxlint aliases both, so
   `--print-config` may normalize and flap the staleness check). Done when an
   effective-config diff shows exactly which rules the `style: off` flip drops and each
   is intentional. Key: new `src/configs/base.ts`. Size L.
4. **`vitestConfig` + `nodeRuntimeConfig`.** Vitest test-hygiene rules; `nodeRuntimeConfig`
   owns `unicorn/prefer-node-protocol`. Both documented as opt-in layers. Size M.
5. **Extend `rule-manifest.ts`.** The current schema cannot express the new facts:
   `presetEnabled: boolean` + `sourcePresets: string[]` + the `domain` enum
   (`rule-manifest.ts:3,32-47`) cannot say "native rule, member of `baseConfig` AND
   `nodeRuntimeConfig`, rationale class = safety." Replace `presetEnabled` with a
   `collections`/`enabledIn` array (the draft's concrete fix), add a `rationale class`
   field (correctness/safety/agent-failure-mode/style, the grade-by-kind proof D-D
   relies on), and define the severity collapse (manifest `off|info|warning|error` →
   config `off|warn|error`, then `warn→error` under `--max-warnings 0`). Do not expand
   `generalPreset`. Keeps TD-CARD-026 true. Size L.
6. **Effective-config generation + inventory gate.** Consumption is an in-memory JS
   object via `vite-plus`, not a file oxlint reads, so the generator must materialize a
   temp `.oxlintrc.json` from each fragment, then run `oxlint --print-config` /
   `--rules --format=json`. Extend `check-rule-inventory.ts` to fail on unknown rules,
   manifest/config drift, a stale doc, and namespace mismatch (assert the WI-3 namespace
   choice so alias normalization does not flap). Key:
   `scripts/checks/check-rule-inventory.ts`, `docs/references/`. Size L.
7. **README + `rules.md` consumption model.** Document presets vs config fragments vs
   `composeLintConfigs`, the intended consumer shape, and link `rules.md` to the
   generated effective-config doc instead of restating rules. Size M.
8. **Dogfood in backpressure root.** Import `baseConfig` + `vitestConfig` +
   `nodeRuntimeConfig` via `composeLintConfigs`; delete the duplicated local block;
   decompose `max-statements` violators (task #17). Done when `vp check`, package
   tests, and the inventory gate pass. Key: `vite.config.ts:24-86`. Size L.
9. **Packed-consumer smoke covers new exports.** `smoke:oxlint-packed-consumer`
   exercises `baseConfig`/`vitestConfig`, native + custom rules resolve, and a bad
   fixture trips at least one base rule and one custom rule. Size M.
10. **Changesets for both packages.** Cover the new exports and the documented hard
    cutover (no compat shim). Size S.
11. **Branch-stack release runway.** No publish until every lower branch in the stack
    (main → branch 1 → this) merges to `main`; the changeset lands on the
    merge-to-main branch; introspection rollout is blocked on the npm version
    existing; canon edits are blocked on the published effective-config doc. Size S.
12. **Publish from backpressure.** Green check, Version Packages PR, Trusted Publishing
    with provenance. Size S.
13. **Roll out to introspection.** Catalog bump to the new versions + version-scoped
    `minimumReleaseAgeExclude` if inside the 7-day window; consume
    `baseConfig`/`vitestConfig`/`nodeRuntimeConfig`; `effectPreset` scoped to
    Effect-heavy files via an explicit override (not a global `no-shadow: off`); delete
    the local block. Done when `pnpm check` passes. Key: `introspection/vite.config.ts`,
    `package.json`, `pnpm-workspace.yaml`. Size M.

### Phase 2: tsconfig and Effect language service

14. **`effect.json` in `@mplibunao/tsconfig`.** Extends `base.json`, adds
    `compilerOptions.plugins` for `@effect/language-service` with MP's diagnostic
    severities; `base.json` stays neutral; LS is an optional peer with docs covering
    editor vs build-time (`effect-language-service patch`) diagnostics. Size M.
15. **introspection adopts `effect.json` + LS.** Install `@effect/language-service`,
    extend `effect.json`, choose and document an enforcement mode (editor vs CI). Size M.

### Phase 3: canon and opt-in layers (staged adoption)

16. **TD Effect-LS hard-stop card.** Strength hard-stop; scope TS workspaces importing
    `effect`; default install + configure via `@mplibunao/tsconfig/effect.json` with a
    CI-visible diagnostic path. introspection is the proving repo. Size M.
17. **TD source-of-truth edits.** TD-BASELINE-004 drops the inlined thresholds and shows
    a composition recipe; TD-CARD-008 names `baseConfig` as the consumption path;
    authoring guide gets the no-duplication rule. Blocked on WI-6/WI-12. Size M.
18. **`jsdocConfig` + TD JSDoc-as-contract card.** JSDoc documents behavior/contracts,
    not types (`require-param-type`/`require-returns-type` off). Dogfood after a sweep.
    Size M.
19. **`architectureConfig`, `namedExportsConfig`.** Opt-in import-architecture layers
    (`import/no-cycle`, `no-relative-parent-imports`, `no-barrel-file`;
    `import/no-default-export` + config-file overrides). Export when backpressure/tome
    actually adopt them and sweeps are manageable. Size M.
20. **Deferred fragments (export only when a consumer AND the naming lock are ready):**
    `explicitApiConfig` (scoped `explicit-function-return-type`) and the React stack
    `reactConfig` / `jsxA11yConfig` / `reactPerfConfig` (tome is the eventual proving
    repo, and the `react` naming collision per PA-2/PA-5 must be resolved first). Do not
    lock these public names in this cut. Size M (when unblocked).
21. **Close-out + deferred records.** Move the plan to completed; record final versions
    and validation; open tech-debt records for the deferred decisions: the type-aware
    async cluster (`no-floating-promises` et al.) as its own boundary plan, gated on
    verifying oxlint type-aware at the pinned version (implemented? stable vs nursery?
    correct and complete? perf cost vs current AST-only lint?), since it is NOT covered
    by `tsc` or the Effect LS and the only proven alternative is ESLint+typescript-eslint;
    `bunConfig` (Bun-API-leakage) vs `browserConfig` (`import/no-nodejs-modules`) split;
    `max-statements` threshold revisit; unicorn opinionated layer; the React +
    `explicitApi` fragments (WI-20). Size S.

## Resolved by the design critique

The Phase 6 critique (`docs/reviews/lint-standards-consolidation-critique-2026-06-15.md`)
grounded each tension in the installed `oxlint@1.58.0` / `vite-plus@0.1.15` types:

- **Severity vs `--max-warnings 0`**: resolved (D-D): binary `error`/`off` does not
  violate TD-CARD-033; no advisory lane; the grade-by-kind proof moves to WI-5.
- **Composition**: the comparison is against oxlint's native `extends`, not `vite-plus`
  (which does no merging). Build `composeLintConfigs` only if `extends` fails to merge
  in-memory fragments (WI-1b / WI-2).
- **Fragment type**: reuse oxlint's `OxlintConfig` (with the dep/peer consequence) vs
  hand-roll; decided in WI-1a.
- **Naming taxonomy**: real collision: `…Preset` for rule packs, `…Config` for
  fragments, no fragment named off a reserved preset, one React surface only. Defer the
  React + `explicitApi` exports (WI-20).
- **`no-duplicate-imports`**: must be explicit `off` (D-C).
- **`style: off` coverage**: the effective-config diff (WI-3) confirms which rules drop.

## References

- Preset shape + presets: `packages/oxlint-standards/src/presets/shared.ts:11-16`,
  `general.ts:3-5`, `effect.ts:3-7`, `boundaries.ts:3`, `effect-react.ts:3`.
- Custom rule catalog: `packages/oxlint-standards/src/rule-manifest.ts`.
- Package README + LS boundary: `packages/oxlint-standards/README.md:31-73`.
- Rule inventory doc + gate: `docs/references/rules.md`,
  `scripts/checks/check-rule-inventory.ts`.
- Preset taxonomy: `docs/design-docs/preset-architecture.md` (PA-1..PA-5).
- Release boundary: `docs/decisions/006-changesets-versioning-and-publish-boundary.md`.
- tsconfig package: `packages/tsconfig/base.json:2-25`, `package.json`,
  `NOTICE.md:3-5`.
- introspection consumer: `vite.config.ts:33-116`, `package.json:49-56`,
  `pnpm-workspace.yaml:7-13,30-60`.
- backpressure root consumer: `vite.config.ts:24-86`.
- surf-cli config: `vite.config.ts:140-438`.
- tome.nvim config: `vite.config.ts:60-227`.
- TD canon: `taste-distillery/docs/source-of-truth-boundaries.md:3-9`,
  `cards/docs-and-knowledge/vale-and-doc-garden-modes.md:34-35`,
  `cards/linting-and-guardrails/oxlint-hard-ceilings.md` (TD-CARD-008),
  `baselines/linting-and-guardrails/oxlint-hard-ceilings.md` (TD-BASELINE-004),
  `cards/linting-and-guardrails/oxlint-rule-pack-posture.md` (TD-CARD-026),
  `cards/linting-and-guardrails/graded-rule-severity.md` (TD-CARD-033),
  `cards/linting-and-guardrails/build-only-what-no-good-tool-ships.md` (TD-CARD-032).
