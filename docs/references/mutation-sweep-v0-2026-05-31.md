# Mutation sweep: v0 baseline (2026-05-31)

Initial full sweep across all rule logic and AST helpers. This report records baseline scores, survivor classification, and the continuation plan for the delegated sweep that gates the first publish.

## Behavioral default gate baseline

Run with the default `stryker.config.mjs` (no `STRYKER_MUTATE`, no `STRYKER_SWEEP`). Excludes static/equivalent files (`rule-manifest.ts`, `rule-messages.ts`, `plugin.ts`, `rules/effect/no-effect-as-message.ts`) and always-excluded build-time utility (`utils/reports.ts`).

| Metric | Value |
|---|---|
| Mutation score | **68.64%** (3338 killed + 13 timeout / 4882 total) |
| Covered mutation score | 71.15% |
| Total mutants | 4882 |
| Killed | 3338 |
| Timeout (treated as killed) | 13 |
| Survived | 1359 |
| No coverage | 172 |
| Errors | 0 |
| Duration | 6 minutes 43 seconds |

**This is the publish-gate score.** Target is 80%+ on behavioral files.

## Full-sweep aggregate (evidence only)

Run with `STRYKER_SWEEP=1`. Includes all source files, including static/equivalent ones. Recorded as evidence for survivor classification; not used as the publish-gate score.

| Metric | Value |
|---|---|
| Mutation score | **66.54%** (3354 killed + 13 timeout / 5060 total) |
| Covered mutation score | 69.24% |
| Total mutants | 5060 |
| Killed | 3354 |
| Timeout (treated as killed) | 13 |
| Survived | 1496 |
| No coverage | 197 |
| Errors | 0 |
| Duration | 7 minutes 21 seconds |

## Per-file breakdown

### Excellent (80%+, production quality)

| File | Score | Killed | Survived | No cov | Classification |
|---|---|---|---|---|---|
| `presets/boundaries.ts` | 100% | 1 | 0 | 0 | ✅ Done |
| `presets/effect-react.ts` | 100% | 1 | 0 | 0 | ✅ Done |
| `presets/effect.ts` | 100% | 4 | 0 | 0 | ✅ Done |
| `presets/general.ts` | 100% | 3 | 0 | 0 | ✅ Done |
| `presets/shared.ts` | 100% | 11 | 0 | 0 | ✅ Done |
| `rules/effect/no-effect-as-internal.ts` | 87.88% | 29 | 4 | 0 | Trivial survivors (meta strings) |
| `utils/effect-identifiers.ts` | 85.71% | 12 | 2 | 0 | Trivial survivors (set member strings) |

### Good (70-79%, acceptable, investigate survivors)

| File | Score | Killed | Survived | No cov | Classification |
|---|---|---|---|---|---|
| `utils/ast.ts` | 79.07% | 101+1 | 22 | 5 | Mix: some killable boundary checks, some equivalent |

### Fair (60-69%, investigate, likely real gaps)

| File | Score | Killed | Survived | No cov | Classification |
|---|---|---|---|---|---|
| `rule-catalog.ts` | 68.03% | 2847+11 | 1203 | 140 | Bulk of survivors; primary hardening target |
| `utils/imports.ts` | 67.63% | 139+1 | 51 | 16 | Killable: import analysis branches not fully asserted |
| `utils/effect-ownership.ts` | 70.35% | 159 | 61 | 6 | Killable: wrapper/pipe ownership edge cases |
| `utils/side-effects.ts` | 59.62% | 31 | 16 | 5 | Killable: side-effect detection branches |

### Low (below 50%, expected for data/config files)

| File | Score | Killed | Survived | No cov | Classification |
|---|---|---|---|---|---|
| `rule-manifest.ts` | 11.32% | 12 | 71 | 23 | **Equivalent/trivial**: manifest is mostly static data (severity strings, domain assignments, and similar config fields). Survivors are string literals and object property mutations in configuration data. Not worth chasing. |
| `rule-messages.ts` | 3.13% | 2 | 62 | 0 | **Equivalent**: pure string constants. Tests use `ruleMessage()` to get expected messages, so Stryker mutates a string and the test expectation mutates with it. This is by design; message content is not the behavioral contract. |
| `plugin.ts` | 0% | 0 | 3 | 0 | **Equivalent**: `pluginName` and `meta.name` string assignments. Tests use the plugin's own name, so mutations are invisible. |
| `rules/effect/no-effect-as-message.ts` | 0% | 0 | 1 | 0 | **Equivalent**: single message string constant (same reason as `rule-messages.ts`). |
| `utils/reports.ts` | 50% | 2 | 0 | 2 | 2 no-coverage mutants in a utility only used at build time. Accept. |

## Survivor classification summary

| Category | Count | Action |
|---|---|---|
| **Killable** | ~1350 | Strengthen tests, primarily in `rule-catalog.ts` (1203), `utils/effect-ownership.ts` (61), `utils/imports.ts` (51), `utils/ast.ts` (22), `utils/side-effects.ts` (16) |
| **Equivalent** | ~140 | Accept; message strings, manifest metadata, plugin name (tests reference the same constant, so mutations are invisible) |
| **Trivial** | ~6 | Accept; meta description/recommended strings in rule definitions |

## Key findings

1. **Preset assembly is rock-solid**: all 5 preset files at 100%. The manifest-to-preset pipeline is well-tested.

2. **Rule logic (`rule-catalog.ts`) is the dominant survivor source**: 1203 survivors in a 3700-line file. Each rule has many condition branches that the current test suite doesn't fully exercise. The tests cover the primary valid/invalid paths but miss internal branch flips. The killable survivors are real assertion gaps, not false flags.

3. **Utility modules have real gaps**: `imports.ts` (67.63%), `effect-ownership.ts` (70.35%), and `side-effects.ts` (59.62%) have branches where a condition flip doesn't change the test outcome. These are the highest-value hardening targets because they're shared infrastructure.

4. **Data files score low by design**: `rule-manifest.ts` (11.32%) and `rule-messages.ts` (3.13%) are static data. Their survivors are string/object mutations in configuration metadata. Chasing these would be score-chasing per the anti-patterns.

## How to continue the full delegated sweep

This document is historical baseline evidence. The priority hardening order has moved to the active exec plan (Item 18 in `docs/exec-plans/active/backpressure-monorepo-setup-2026-05-29.md`). Command contract, allowed test surface, and target class descriptions are in `docs/references/mutation-testing.md`.

## Artifacts

- HTML report: `reports/mutation/index.html`
- JSON report: `reports/mutation/report.json`
- Stryker config: `stryker.config.mjs`

## Relationship to publish gate

Per Item 18 of the exec plan, the full mutation sweep and survivor hardening is a prerequisite for the first publish (Item 19). This baseline establishes the starting point. The delegated sweep (orchestrator dispatching workers per file) completes the gate. The target is 80%+ on behavioral files (everything except the data/config files classified as equivalent above).
