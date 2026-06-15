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
| WI-4 | `vitestConfig` + `nodeRuntimeConfig` | M | DONE | `71f5622` |
| WI-5 | Extend `rule-manifest.ts` (collections + rationale class + severity collapse) | L | DONE | `45d3845` |
| WI-6 | Effective-config generation + inventory gate | L | DONE | `fbfa23a` |
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

### WI-4: vitestConfig + nodeRuntimeConfig (DONE)

- **Build:** one `engineer` agent (Claude Code, sonnet:high). It added `vitestConfig`
  (`src/configs/vitest.ts`) and `nodeRuntimeConfig` (`src/configs/node-runtime.ts`) as
  opt-in `OxlintConfig` layer fragments, with `vitest.test.ts`, `node-runtime.test.ts`,
  and `drift-guards.test.ts`, exported through both barrels. `vitestConfig` enables the
  vitest plugin, silences all vitest rules globally, and re-enables four hygiene rules
  (`hoisted-apis-on-top`, `no-conditional-tests`, `require-awaited-expect-poll`,
  `warn-todo`) under a `**/*.test.ts` override. `nodeRuntimeConfig` enables only
  `unicorn/prefer-node-protocol`.
- **Review gate:** one `context_builder` review on chat `wi4-lint-review-790734` plus two
  follow-ups. The core finding (which the agent had independently surfaced mid-build): a
  layer fragment that enables a plugin gets that plugin's whole category set swept on when
  composed with `baseConfig`'s error categories. Empirically, unicorn swept 33 rules and
  vitest swept several. The agent suppressed the unwanted rules by explicit enumeration
  (an exhaustive unicorn off-list; all vitest rules off globally, four re-enabled in the
  override). The review's must-fixes hardened this from a brittle hand-list into a proven
  contract by adding engine-backed drift guards in `drift-guards.test.ts`: they shell out
  to the real `oxlint` binary, materialize `composeLintConfigs(baseConfig, fragment)`, and
  assert via `oxlint --print-config` that the only active `unicorn/*` rule is
  `prefer-node-protocol` and that zero `vitest/*` rules are active globally, plus a
  real-fixture lint proving `warn-todo` fires only in `.test.ts`. A sanity check (forcing
  a stray unicorn rule on) confirmed the node guard fails on bleed. `vitest.test.ts` was
  tightened to assert the override re-enables exactly the four rules. The
  `--print-config`-ignores-per-file-overrides quirk was accounted for: global suppression
  is proven by print-config, per-file scoping by fixture lint plus the static exact-set
  assertion. Final review pass found no remaining issue.
- **Orchestrator-caught regression (verify gate):** the agent's scoped self-check reported
  lint clean, but the orchestrator's independent full `vp lint --max-warnings 0` found 10
  errors (`eslint(capitalized-comments)`, `eslint(id-length)`) in the two new test files
  under the current root config's `style: 'error'`. They would vanish once WI-8 switches
  the root to `baseConfig` (style off), but the repo had to be green now to commit through
  the pre-commit `vp check` gate. The agent fixed them by editing code (capitalized the
  comments, renamed single-character identifiers), not by suppressing rules.
- **Refactor gate:** one `context_builder` analysis on chat `wi4-refactor-review-178A6C`;
  only low findings. Applied: extracted a `writeOxlintFixture` helper for the repeated
  temp-config and fixture setup in the drift guards, and corrected a comment that
  overstated what the drift tests alone prove (crediting `vitest.test.ts` for the
  exact-set proof). Declined the cross-file namespace-filter helper as not worthwhile for
  two files. The exhaustive unicorn off-list was kept (accepted design, protected by the
  drift guard).
- **Checks:** the orchestrator ran the checks independently after each gate:
  `pnpm --filter @mplibunao/oxlint-standards typecheck` (clean), the package vitest suite
  (688 tests pass across 12 files, including 3 engine-backed drift guards), and
  `pnpm exec vp lint --max-warnings 0` (0 warnings and 0 errors over 66 files).
- **Behavior change for WI-8 dogfood:** the four vitest hygiene rules were not active in
  the live root config, so the WI-8 dogfood will surface real violations on test files for
  `hoisted-apis-on-top`, `no-conditional-tests`, `require-awaited-expect-poll`, and
  `warn-todo`. This is expected, and decomposed during WI-8 rather than suppressed.
- **Commits:** `71f5622` for the two fragments, their tests, the drift guards, and the
  exports, plus this ledger-record commit.
- **Issues:** none open. The plugin-category-sweep behavior is now a known pattern: any
  future layer fragment that adds a plugin needs the same suppress-plus-drift-guard
  treatment. WI-9 covers the new exports in the packed-consumer smoke.
- **Action items for MP:** none.

### WI-5: rule-manifest schema extension (DONE)

- **Build:** one `pair` agent (Codex CLI, gpt-5.5, reasoning high). It extended
  `rule-manifest.ts`: replaced the boolean `presetEnabled` with a `collections` array
  (`generalPreset`/`effectPreset`/.../`baseConfig`/`vitestConfig`/`nodeRuntimeConfig`),
  added a `rationaleClass` field (`correctness | safety | agent-failure-mode | style`),
  and added a typed severity-collapse helper (`off|info|warning|error` to
  `off|warn|error`, noting `--max-warnings 0` makes `warn` fail like `error`). It added
  manifest rows for the explicit `baseConfig`/`vitestConfig`/`nodeRuntimeConfig` rule
  decisions (not for category-swept rules, which WI-6's generated effective-config view
  will own), kept the `generalPreset` rule set unchanged, and updated the consumers
  (`rule-manifest-selection.ts`, preset construction, `check-rule-inventory.ts`,
  `src/index.ts`) plus a new `rule-manifest.test.ts`. The pre-existing
  `oxlint-disable max-lines` on the manifest is an accepted data-catalog exception, not a
  new suppression.
- **Review gate:** one `context_builder` review on chat `wi-5-review-52C36C` plus two
  follow-ups. The substantive catch: the agent had graded cosmetic rules
  (`array-type`, `dot-notation`, `no-inferrable-types`, `prefer-function-type`,
  `prefer-template`, `sort-imports`) as `agent-failure-mode` to satisfy a self-imposed
  "no error rule is style" invariant, which is reverse-engineering the grade. Fix: those
  rules are now graded `style` (severities unchanged at `error`, a settled WI-3
  and live-parity decision), each with a note justifying enforcement (autofixable,
  diff-determinism, auto-fixed by `vp check --fix`). The wrong invariant was replaced with
  the real grade-by-kind invariants applied across all collection-backed rules
  (not blanket-all-error; correctness and safety rules must be `error`; style-at-error
  rules must be in an explicit `STYLE_AT_ERROR_EXCEPTIONS` allowlist and carry autofix
  evidence), mirrored into `check-rule-inventory.ts`. `sourceRule` now throws if a
  collection-backed entry omits an explicit `rationaleClass` (inference is kept only for
  legacy non-collection rows), and a reverse-completeness check asserts every explicit
  config `error` rule has a manifest row (allowlist for intentional offs and bleed-guards).
- **Deferred policy decision (recorded, not resolved here):** whether autofixable
  mechanical style rules may sit at `error` is a deliberate exception to TD-CARD-033,
  which says style rules stay quieter. WI-5 makes the exception explicit and reviewable via the
  `STYLE_AT_ERROR_EXCEPTIONS` allowlist but does NOT ratify it. Ratifying or rejecting it
  (downgrade those rules to `off`, or document the exception in ADR-004 / TD-CARD-033) is
  deferred to the canon-edit phase (WI-17) and listed in the WI-21 deferred records. This
  is the orchestrator holding the scope line: WI-5 records the rule grades and flags the
  tension while leaving settled severities and canon untouched.
- **Refactor gate:** one `context_builder` analysis on chat `wi5-refactor-review-59E2B6`;
  it kept the data-dense manifest and the intentional source-vs-built-package invariant
  duplication. Applied: derived `check-rule-inventory.ts`'s `pluginRulePrefix` from the
  built package's exported `pluginName` (removing a hardcoded second source of truth);
  routed `nativeRule()` through the `sourceRule()` finalizer so the explicit-rationale
  guard stays centralized; renamed two helpers that read alike
  (`defaultCollectionsForDomain`, `presetCollectionOnlyForDomain`).
- **Checks:** the orchestrator ran the checks independently after each gate:
  `pnpm --filter @mplibunao/oxlint-standards typecheck` (clean), the package vitest suite
  (699 tests pass across 13 files), `pnpm exec vp lint --max-warnings 0` (0 over 67
  files), and `pnpm inventory:rules` (passed: 50 source rules represented, parity intact).
- **Commits:** `45d3845` for the manifest schema, rows, consumers, and tests, plus this
  ledger-record commit.
- **Issues:** the style-at-error policy decision above is open and tracked for WI-17.
- **Action items for MP:** decide the style-at-error policy when the canon phase (WI-17)
  is reached: ratify "autofixable mechanical style may be error" in ADR-004 / TD-CARD-033,
  or downgrade the six allowlisted rules to `off`. Not blocking the Phase-1 publishable cut.

### WI-6: effective-config generation + inventory gate (DONE)

- **Build:** a first `pair` agent (Codex) stalled with no file output after many cycles
  on the open-ended brief, so the orchestrator cancelled it (nothing had landed) and
  re-dispatched with prescriptive decisions baked in. The replacement `engineer` agent
  (Claude Code, sonnet:high) built: a generator (`scripts/checks/generate-effective-config.ts`)
  and shared lib (`scripts/lib/effective-config.ts`) that materialize a temp
  `.oxlintrc.json` per composition, run `oxlint --print-config`, normalize the
  `typescript/*` alias to the canonical `@typescript-eslint/*`, and emit a sorted,
  deterministic checked-in artifact `docs/references/effective-config.json`. The artifact
  captures four scopes: `base.global`, `base.test`, `full.global`, `full.test` (test scope
  synthesized by flattening `**/*.test.ts` overrides into global, because `--print-config`
  ignores per-file overrides). A `gen:effective-config` script regenerates it. The
  inventory gate (`check-rule-inventory.ts`) was extended to fail on a stale artifact, an
  unknown configured rule, a non-canonical `typescript/*` namespace, and an alias
  collision.
- **Review gate:** one `context_builder` review on chat `wi6-config-review-C58912` plus
  four follow-ups, which caught a chain of real issues:
  - The unknown-rule check was fooled by a generic basename fallback (`bogus/no-unused-vars`
    passed) and a blanket `oxc/*` bypass (`oxc/no-barrell-file` passed). Fixed by building
    an authoritative catalog from `oxlint --rules --format=json` and a centralized
    `isConfiguredRuleKnown` predicate.
  - The `@typescript-eslint/*` alias synthesis was still over-permissive
    (`@typescript-eslint/no-alert` would pass). Narrowed to an explicit extension-rule
    allowlist (`no-unused-vars`, `no-useless-constructor`), grounded in the empirical fact
    that only those two appear under oxlint's `eslint` scope while every other configured
    TS rule is in the `typescript` scope.
  - The regression test inlined a COPY of the recognition logic (guarding nothing). Moved
    to `scripts/lib/effective-config.test.ts`, importing and exercising the real functions
    against live `oxlint --rules`, asserting a 9-case recognized/rejected table.
  - The artifact surfaced 11 `jest/*` rules bleeding active globally from the vitest
    plugin. These are useful vitest test-hygiene rules the live root config kept, so rather
    than silence them (a regression), they were made intentional and test-scoped: off
    globally, re-enabled at `error` in the `**/*.test.ts` override, given manifest rows,
    and pinned by the drift guard.
  Final review pass: no remaining must-fix.
- **Orchestrator independent verification (beyond agent self-report):** the orchestrator
  tampered one severity in the committed artifact and confirmed the staleness gate fires
  with the regenerate message, then restored it; confirmed the four artifact scopes and
  rule counts (`base` 201, `full` 359); and confirmed `full.global` has zero active
  `jest/*`/`vitest/*` rules while `full.test` carries exactly the intended 11 jest + 4
  vitest. The orchestrator also caught the first agent's stall via repeated no-progress
  polling and a git-status check.
- **Refactor gate:** one `context_builder` analysis on chat `wi6-refactor-review-D7A3F0`;
  only low findings, all recommended deferred: keep the WI-4 drift guards' materialization
  logic independent of the script lib (independence boundary), do not extract the
  built-package export validation until a third consumer, and leave the test-glob matcher
  as is (the `**/*.test.ts` contract is already documented in `vitest.ts`). No changes
  applied; the code is at a good local optimum.
- **Checks:** the orchestrator ran the checks independently after each gate:
  `pnpm --filter @mplibunao/oxlint-standards typecheck` (clean), the full vitest suite
  (767 tests pass across 17 files, including the engine-backed regression and drift
  guards), `pnpm exec vp lint --max-warnings 0` (0 over the repo), and `pnpm inventory:rules`
  (passed; the staleness, unknown-rule, namespace, and collision checks all run).
- **Commits:** `fbfa23a` for the generator, shared lib, artifact, gate extension, and the
  jest-hygiene scoping fix to `vitestConfig`/manifest/drift-guards, plus this ledger-record
  commit.
- **Issues:** a known lockfile-sync warning (`node_modules out of sync with lockfile`) prints
  on pnpm commands because the WI-2 `oxlint` dev dependency landed in the lockfile but the
  working copy was not re-installed; it does not block any gate (the binary resolves and all
  checks pass). Run `pnpm install` to clear it before the WI-8 dogfood.
- **Action items for MP:** none.
