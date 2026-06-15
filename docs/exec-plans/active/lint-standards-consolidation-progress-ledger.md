# Lint standards consolidation: exec-plan progress ledger

Progress ledger for the orchestrate-loop execution of plan
[`lint-standards-consolidation-2026-06-15.md`](./lint-standards-consolidation-2026-06-15.md)
(work items WI-1 through WI-21) and its design critique
[`lint-standards-consolidation-critique-2026-06-15.md`](../../reviews/lint-standards-consolidation-critique-2026-06-15.md).
Each tracked unit gets one entry recording whether each workflow gate (verify,
review loop, refactor loop, commit) actually ran. The status table below indexes
every work item; per-item detail sections are appended as items land.

## Scope of this run

This orchestrate run targets the buildable, committable core in backpressure:

- **WI-1 through WI-10** are implemented, gated, and committed on this branch.
- **WI-11** (branch-stack runway) is documented as a release gate, not executed.
- **WI-12** (publish) is deferred: it needs the lower branches merged to `main`,
  a Version Packages PR, and npm Trusted Publishing over OIDC, none of which an
  agent run completes autonomously.
- **WI-13** (introspection rollout) is deferred: it is blocked on the published
  npm version existing inside the 7-day `minimumReleaseAge` window, and the
  introspection working tree currently holds in-flight substrate-reshape work
  (IX-SR-02) that this run must not collide with.
- **Phases 2 and 3** (WI-14 through WI-21) are sequenced follow-on branches,
  out of scope here.

## Branches (stacked for review)

- backpressure: `lint/oxlint-standards-consolidation`, branched off
  `reshape/introspection-v1`. The lint work stacks on the reshape branch because
  `main` is behind (it lacks the records-adoption and Vale-pin commits the
  reshape branch carries). Merge order is `main` then `reshape/introspection-v1`
  then this branch.
- introspection: adoption branch created when WI-13 is unblocked (after publish).
- taste-distillery: stacked branch created when WI-16 through WI-19 land.

## How this run is verified

The orchestrator owns the gates and does not trust agent self-reports:

- **Per-item review loop:** a `context_builder` review pass over the item diff,
  fix iterations delegated back to the implementer, re-review on the same chat
  until only nits remain.
- **Per-item refactor loop:** explore scouts scope the surface; a separate
  `context_builder` chat then builds the refactor plan for an engineer to
  execute, with follow-up re-analysis until no opportunity remains.
- **Independent checks before each commit:** the orchestrator runs the relevant
  backpressure checks (`vp check`, package vitest, `check-rule-inventory.ts`,
  `smoke:oxlint-packed-consumer`, `pnpm prose`) rather than relying on the
  agent's targeted runs.
- **Effective-config evidence:** WI-6 generates a checked-in effective-config
  view, so every base or fold-in rule change is measured against a captured diff
  rather than asserted.

## Pre-build resolutions (WI-1, settle before WI-2 and WI-3)

The critique requires three decisions before any config code is written. Each is
recorded here with its resolution before the dependent item is dispatched.

| Resolution | Blocks | Status | Resolution ref |
| --- | --- | --- | --- |
| (a) Config-fragment type source: oxlint `OxlintConfig` vs hand-rolled | WI-2 | RESOLVED | reuse `OxlintConfig`, add `oxlint` peer+dev dep (WI-1 detail) |
| (b) `composeLintConfigs` vs oxlint native `extends` | WI-2 | RESOLVED | build the helper; `extends` cannot concat base `overrides` (WI-1 detail) |
| (c) Naming taxonomy lock (`…Preset` for rule packs, `…Config` for fragments, one React surface) | WI-2, WI-3 | RESOLVED | locked (WI-1 detail) |

## Status

Commit SHAs are in the backpressure repo unless a prefix marks another repo
(`ix` is introspection, `td` is taste-distillery). Sizes are from the plan.

| ID | Item | Size | Status | Commits |
| --- | --- | --- | --- | --- |
| WI-1 | Pre-build resolutions (fragment type, compose vs extends, naming lock) | S | DONE | `3428581` |
| WI-2 | Config-fragment type + composition (helper built: `extends` cannot concat overrides) | M | DONE | `196dcb8` |
| WI-3 | `baseConfig` canonical baseline | L | DONE | `63a2651` |
| WI-4 | `vitestConfig` + `nodeRuntimeConfig` | M | PENDING | |
| WI-5 | Extend `rule-manifest.ts` (collections + rationale class + severity collapse) | L | PENDING | |
| WI-6 | Effective-config generation + inventory gate | L | PENDING | |
| WI-7 | README + `rules.md` consumption model | M | PENDING | |
| WI-8 | Dogfood in backpressure root (delete local block, decompose `max-statements`) | L | PENDING | |
| WI-9 | Packed-consumer smoke covers new exports | M | PENDING | |
| WI-10 | Changesets for both packages | S | PENDING | |
| WI-11 | Branch-stack release runway | S | DOCUMENTED (gate) | |
| WI-12 | Publish from backpressure | S | DEFERRED (manual blocker) | |
| WI-13 | Roll out to introspection | M | DEFERRED (release-age + in-flight reshape) | |
| WI-14 | `effect.json` in `@mplibunao/tsconfig` | M | DEFERRED (Phase 2) | |
| WI-15 | introspection adopts `effect.json` + LS | M | DEFERRED (Phase 2) | |
| WI-16 | TD Effect-LS hard-stop card | M | DEFERRED (Phase 3) | |
| WI-17 | TD source-of-truth edits | M | DEFERRED (Phase 3) | |
| WI-18 | `jsdocConfig` + TD JSDoc card | M | DEFERRED (Phase 3) | |
| WI-19 | `architectureConfig` + `namedExportsConfig` | M | DEFERRED (Phase 3) | |
| WI-20 | Deferred fragments (explicitApi, React stack) | M | DEFERRED (naming + consumer) | |
| WI-21 | Close-out + deferred tech-debt records | S | DEFERRED (after Phase 1) | |

## Per-item detail

Entries are appended here as each item passes its gates and commits.

### WI-1: Pre-build resolutions (DONE)

- **Spike:** one `engineer` agent (sonnet:high) ran a read-only empirical spike in
  throwaway temp dirs against the installed `oxlint@1.58.0` and `vite-plus@0.1.15`.
  It touched no package files. The orchestrator approved each command, declined the
  `dtrace`/`lsof` mechanism probe as not decision-relevant, and steered the agent to
  finalize once the decision-relevant facts were captured.
- **(a) Fragment type source: reuse oxlint `OxlintConfig`.** `packages/oxlint-standards`
  declares zero dependencies today. `vite-plus` types its `lint?` field as a single
  `OxlintConfig` imported from `oxlint` (`vite-plus/dist/index.d.ts:4,11`), and
  `OxlintConfig` re-adds inline-object `extends?: OxlintConfig[]`
  (`oxlint/dist/index.d.ts:687-688`) over the raw `Oxlintrc` whose `extends` is
  `string[]` file paths. Decision: type fragments as `OxlintConfig` and add `oxlint`
  as a peer dependency (every consumer already installs it through `vite-plus`) plus a
  dev dependency for the package's own typecheck. This makes fragments unable to drift
  from what a consumer's `lint:` assignment accepts.
- **(b) Build `composeLintConfigs`, do not rely on `extends` alone.** The spike proved
  native `extends` merges `rules` with child-later-wins precedence and carries a base
  fragment's `categories`/`plugins`-resolved rule severities into the consumer's
  effective rule set, all the way through the vite-plus to oxlint runtime boundary. The
  end-to-end check: a temp `vite.config.ts` with
  `lint: { extends: [baseConfig, vitestConfig], rules: { 'no-console': 'warn' } }` ran
  `vp lint` at exit 0, with `no-console` firing as a warning (child wins over base
  `error`) and `no-debugger` firing as a warning (carried from the base fragment).
  The decisive caveat: `overrides` is REPLACE-semantics. When the consumer's `lint:`
  omits `overrides`, the base fragment's `overrides` are dropped from the effective
  config. Because the shared test-file overrides live in `baseConfig`, an `extends`-only
  path would silently strip them in every consumer and defeat the consolidation. The
  helper resolves this: it returns a single flat `OxlintConfig` (no `extends`) merging
  rules later-wins, plugins and jsPlugins by union, categories per-category later-wins,
  and overrides by concat. Overrides concat is the helper's sole reason to exist, the
  one merge `extends` cannot perform; this is evidence-gated, not speculative.
- **(c) Naming taxonomy locked.** Custom rule packs keep the `…Preset` suffix
  (`generalPreset`, `effectPreset`, `effectReactPreset`, `boundariesPreset`); full
  config fragments take the `…Config` suffix (`baseConfig`, `vitestConfig`,
  `nodeRuntimeConfig`); the merge helper is `composeLintConfigs`. The React surface is
  deferred to WI-20, will ship as a single surface, and is never named off the reserved
  `react` preset (PA-2/PA-5).
- **Review gate:** a code review does not apply, because this item produced decisions,
  not code. The review ran as orchestrator verification plus the prose gate. The
  orchestrator cross-checked every claim against the spike's command output and the
  cited `oxlint`/`vite-plus` type line numbers, and confirmed the overrides footgun
  changes WI-2 from a conditional build into building the helper unconditionally.
  `pnpm prose` over the changed docs reported 0 errors.
- **Refactor gate:** not applicable, because no code changed.
- **Checks:** prose gate green on the plan and ledger edits.
- **Commits:** `3428581` for the WI-1 resolution edits to the plan and the ledger.
- **Issues:** none open. The overrides REPLACE-semantics constraint is carried forward
  into WI-2 (helper concat) and WI-3 (where `baseConfig` test overrides live).
- **Action items for MP:** none.

### WI-2: Config-fragment type + composeLintConfigs (DONE)

- **Build:** one `pair` agent (Codex CLI, gpt-5.5, reasoning high). It added
  `composeLintConfigs(...configs: OxlintConfig[]): OxlintConfig` in new
  `src/configs/compose.ts`, barrelled through `src/configs/index.ts`, and re-exported
  from `src/index.ts`. Fragments are typed as oxlint's `OxlintConfig`; the package
  gained `oxlint` as a peer dependency (`^1.58.0`) and a dev dependency (`catalog:`,
  resolved to `1.58.0`). The existing custom-rule presets and their `PresetConfig`
  shape are untouched. The helper returns a single flat config with no `extends` and
  merges rules later-wins, plugins and jsPlugins by stable de-duped union, categories
  per-category later-wins, overrides by concat, the option-like maps shallow-merge
  later-wins, and ignorePatterns concat with de-dup; empty fields are omitted. The
  jsPlugins de-dup key separates string entries from object entries so the two variants
  cannot collide.
- **Review gate:** one `context_builder` review on chat `wi-2-review-39583F` plus a
  follow-up. The first pass returned zero must-fix and four test-hardening suggestions
  plus one nit; the orchestrator judged them cheap and worth applying to a core merge
  helper and delegated them back. The agent added a compile-time field-drift guard (a
  bidirectional `AssertNever` over `keyof OxlintConfig` versus the handled-plus-ignored
  key set, so a future oxlint field forces an explicit merge-or-ignore and fails the
  typecheck otherwise), expanded jsPlugins identity coverage (same name with a different
  specifier stays distinct; a string entry cannot collide with an object key), added a
  standalone `extends`-drop test with no overrides involved, and added an
  input-immutability and reference-identity test. The nit (`vi.setConfig` timeout) was
  kept because sibling package tests use that convention. The follow-up review on the
  same chat found no remaining must-fix or substantive issue and cleared the item to
  commit.
- **Refactor gate:** explore scouts skipped, since the surface is one small pure helper.
  One `context_builder` analysis on chat `compose-refactor-review-7FAE7F`; it found no
  high, medium, or low value opportunities and explicitly rejected both candidate angles
  (unifying the two dedup helpers, and a data-driven result-omission table) with reasons:
  the split avoids forcing an identity key function on the common string-array case, and
  the explicit omission block spells out each emitted field. No follow-up needed; the
  loop converged on the first pass.
- **Checks:** the orchestrator ran the checks independently after each gate, green every
  time: `pnpm --filter @mplibunao/oxlint-standards typecheck` (clean), the package
  vitest suite (661 tests pass, 7 of them in the new `compose.test.ts`), `pnpm lint`
  (`vp lint --max-warnings 0`: 0 warnings and 0 errors over 59 files with 300 rules),
  and `pnpm --filter @mplibunao/oxlint-standards build` (clean).
- **Commits:** `196dcb8` for the helper, tests, exports, and the `oxlint` peer and dev
  dependency, plus this ledger-record commit. The WI-1 commit SHA `3428581` is
  backfilled into the status table here.
- **Issues:** none open.
- **Action items for MP:** none. The `oxlint` dev dependency uses the repo `catalog:`
  spec, consistent with the catalog-only policy that rejects `file:` and `link:`.

### WI-3: baseConfig canonical baseline (DONE)

- **Build:** one `pair` agent (Codex CLI, gpt-5.5, reasoning high). It added
  `baseConfig` as an `OxlintConfig` fragment in `src/configs/base.ts` with `base.test.ts`,
  exported through both barrels. It folds the live root config (`vite.config.ts:24-86`)
  into the package and applies every plan decision: graded categories (correctness,
  suspicious, restriction error; nursery, pedantic, style off), the type-import quartet
  (`consistent-type-imports` inline, `no-import-type-side-effects` error,
  `consistent-type-specifier-style` off, explicit `no-duplicate-imports` off) plus
  inline-aware `import/no-duplicates`, `array-simple`, `max-statements` at 10, the
  structural ceilings, `no-non-null-assertion`/`no-shadow`/`sort-imports` error,
  `sort-keys` dropped, group-A hygiene, `...generalPreset.rules` and jsPlugins, options
  with no `typeAware`/`typeCheck`, and the test-file ceiling-relaxation override. Rules
  use the `@typescript-eslint/*` namespace. The agent verified by materializing the
  fragment to a temp `.oxlintrc.json` and running `oxlint --print-config`.
- **Review gate:** one `context_builder` review on chat `review-base-config-831EB3` plus
  two follow-ups. It caught two substantive P1 issues the orchestrator confirmed and
  delegated back:
  - The `style: off` flip silently dropped rules that grade as safety/correctness, not
    cosmetic (TD-CARD-033 grade-by-kind). Nine were re-listed as explicit `error` after
    verifying each against `oxlint --rules`: `prefer-promise-reject-errors`,
    `no-return-assign`, `guard-for-in`, `no-new-func`, `no-script-url`,
    `no-template-curly-in-string`, `no-implicit-coercion`, `no-multi-assign`, and
    `@typescript-eslint/no-empty-interface`. Genuinely cosmetic rules
    (`consistent-type-definitions`, `prefer-for-of`, `default-case-last`,
    `consistent-type-assertions`) stayed dropped.
  - Behavior-parity gap: `baseConfig` loaded the `import` plugin under `restriction:
    error` but did not carry the live root's explicit import-policy offs. An empirical
    `oxlint --print-config` confirmed `import/no-default-export`,
    `import/no-relative-parent-imports`, and `import/no-cycle` were active as `deny`,
    which would have banned default exports repo-wide and broken WI-8 dogfood parity. The
    full live-root-disabled set plus the deferred architecture rules (`import/no-cycle`,
    `oxc/no-barrel-file`, using oxlint's exact rule name) were set to `off`; the
    after-state print-config shows all as `allow`.
  Also fixed: removed the stray `10` from the `no-magic-numbers` ignore list (back to the
  live `[0, 1, 4, 15, 20, 75, 500]`). Two boundary tests were added (style-off
  kept-vs-dropped, deferred import policy stays out of base) plus a `generalPreset`
  inclusion test. The third review pass cleared the item with one non-blocking nit, which
  was applied.
- **Refactor gate:** explore scouts skipped, since `baseConfig` is declarative config
  data. One `context_builder` analysis on chat `wi3-refactor-review-523766`; it judged
  the file at a good local optimum and rejected the tempting extractions (sharing
  constants between source and tests would reduce drift detection; the flat rules map is
  the clearest form; the `no-magic-numbers` ignores are policy, not derived values). One
  low finding (a test named after the transient WI-3 label) was applied as a rename. No
  follow-up needed.
- **Checks:** the orchestrator ran the checks independently after each gate, green every
  time: `pnpm --filter @mplibunao/oxlint-standards typecheck` (clean), the package vitest
  suite (674 tests pass across 9 files), and `pnpm lint` (`vp lint --max-warnings 0`: 0
  warnings and 0 errors over 61 files). The effective-config evidence for the style-off
  drop set (51 rules) and the import-policy offs was produced ad-hoc via
  `oxlint --print-config`; WI-6 formalizes it as a checked-in gate.
- **Commits:** `63a2651` for `baseConfig`, its tests, and the exports, plus this
  ledger-record commit.
- **Issues:** none open. Deferred to WI-6: a checked-in effective-config view that pins
  the style-off drop set, the import-policy offs, and documents the `typeAware`/`typeCheck`
  omission, so future oxlint version bumps cannot silently change the effective posture.
- **Action items for MP:** none.
