# Mutation sweep: v0 baseline (2026-05-31)

Initial full sweep across all rule logic and AST helpers. This report records dated baseline scores, survivor classification, and post-hardening evidence for the delegated sweep that gates the first publish.

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


## Behavioral default gate after hardening

Run after the delegated worker sweep strengthened the shared helpers and rule catalog tests. This is the publish-gate evidence for Item 18.

| Metric | Value |
|---|---|
| Mutation score | **81.81%** (3981 killed + 13 timeout / 4882 total) |
| Covered mutation score | 84.10% |
| Total mutants | 4882 |
| Killed | 3981 |
| Timeout (treated as killed) | 13 |
| Survived | 755 |
| No coverage | 133 |
| Errors | 0 |
| Duration | 6 minutes 59 seconds |

**Publish-gate result:** passed. The behavioral gate target is 80%+ and the post-hardening score is 81.81%.

### Delegated hardening results

| Target | Baseline | Post-hardening | Commit | Result |
|---|---:|---:|---|---|
| `utils/side-effects.ts` | 59.62% | 96.15% | `1bde0e9` | Passed target |
| `utils/imports.ts` | 67.63% | 90.82% | `5ac5641` | Passed target |
| `utils/effect-ownership.ts` | 70.35% | 88.94% | `e05ea6c` | Passed target |
| `utils/ast.ts` | 79.07% | 98.45% | `a36f19f` | Passed target |
| `rule-catalog.ts` | 68.03% | 80.03% | `bd91fe6` | Passed target |

The remaining survivors are primarily equivalent/defensive AST-shape guards, static branch noise, or unimportant catalog-path variations. They remain useful evidence for future test-quality work after the v0 gate passes.

### Remaining survivor classification appendix

| Target | Remaining survived mutants | Classification | Representative rationale |
|---|---:|---|---|
| `rule-catalog.ts` | 707 | Equivalent/defensive/trivial | Compound-condition guard flips (~250), constant-set string variants (~40), type-check ordering (~150), regex variants (~50), and recursion/ancestor guard variants (~217). Extra tests here would mostly pin internal code shape instead of public rule behavior. |
| `utils/effect-ownership.ts` | 25 | Defensive/trivial | Ancestor-chain and wrapper ownership guards already have positive and negative contract coverage. Remaining mutations sit in shortcuts that protect unusual AST shapes. |
| `utils/imports.ts` | 18 | Defensive/trivial | Import-kind, namespace-alias, and type-only guard branches are covered through public helper behavior. Remaining variants mostly duplicate already-covered import-shape outcomes. |
| `utils/ast.ts` | 2 | Defensive/trivial | Remaining AST guard variants are equivalent under the helper contracts used by rules. |
| `utils/side-effects.ts` | 2 | Defensive/trivial | Side-effect detection branches have positive/negative coverage; remaining variants do not change the public detection contract. |
| `rules/effect/no-effect-as-internal.ts` | 1 | Trivial | The remaining survivor is not worth a rule-specific assertion because rule behavior is already covered through valid/invalid cases. |

### Remaining no-coverage classification appendix

| Target | No-coverage mutants | Classification | Representative rationale |
|---|---:|---|---|
| `rule-catalog.ts` | 132 | Accepted for v0 | These come from defensive and rarely reached AST-shape paths inside the large rule catalog. The public valid/invalid rule behavior is covered by RuleTester and fixture replay. |
| `utils/imports.ts` | 1 | Accepted for v0 | One defensive import-helper branch stayed unexecuted after the target passed. The import helper's public runtime/type-only behavior is covered by dedicated tests. |

This appendix is intentionally coarse-grained. The release decision is based on the behavioral gate crossing 80% plus worker-reviewed remaining mutation classes. The ignored HTML/JSON Stryker output remains a local debugging artifact, not the durable source of truth.

## Full-sweep aggregate (evidence only)

Historical run with `STRYKER_SWEEP=1`. It included static/equivalent files plus `utils/reports.ts` before `utils/reports.ts` became always-excluded build/test support. Current `STRYKER_SWEEP=1` includes static/equivalent source files but still excludes always-excluded build/test support. This section remains baseline evidence only; it is not used as the publish-gate score.

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

### Excellent after hardening (80%+, production quality)

| File | Baseline score | Post-hardening score | Classification |
|---|---:|---:|---|
| `presets/boundaries.ts` | 100% | 100% | ✅ Done |
| `presets/effect-react.ts` | 100% | 100% | ✅ Done |
| `presets/effect.ts` | 100% | 100% | ✅ Done |
| `presets/general.ts` | 100% | 100% | ✅ Done |
| `presets/shared.ts` | 100% | 100% | ✅ Done |
| `rules/effect/no-effect-as-internal.ts` | 87.88% | 96.97% | ✅ Done; one harmless survivor remains |
| `utils/effect-identifiers.ts` | 85.71% | 100% | ✅ Done |
| `utils/ast.ts` | 79.07% | 98.45% | ✅ Hardened |
| `utils/effect-ownership.ts` | 70.35% | 88.94% | ✅ Hardened |
| `utils/imports.ts` | 67.63% | 90.82% | ✅ Hardened |
| `utils/side-effects.ts` | 59.62% | 96.15% | ✅ Hardened |
| `rule-catalog.ts` | 68.03% | 80.03% | ✅ Hardened to target; remaining survivors classified as acceptable |

### Low / excluded data and support files

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
| **Killable at baseline** | ~1350 | Addressed through the delegated hardening sweep. The default gate moved from 68.64% to 81.81%. |
| **Remaining equivalent/defensive survivors** | ~755 | Accepted for v0 after the target passed; mostly defensive AST guards, static data paths, and mutations where extra tests would pin internal code shape rather than behavior. |
| **Remaining no-coverage mutants** | 133 | Accepted for v0 as defensive or rare AST paths; see the no-coverage appendix above. |
| **Trivial** | small remainder | Accepted; meta description/recommended strings and equivalent catalog/reporting noise. |

## Key findings

1. **Preset assembly is rock-solid**: all 5 preset files at 100%. The manifest-to-preset pipeline is well-tested.

2. **Rule logic (`rule-catalog.ts`) was the dominant survivor source and is now at target**: the delegated worker moved it from 68.03% to 80.03%. The remaining survivors are mostly compound-condition and defensive-shape mutations where extra assertions would overfit internal code shape.

3. **Shared utilities were the highest-value hardening targets and are now strong**: `side-effects.ts` (96.15%), `imports.ts` (90.82%), `effect-ownership.ts` (88.94%), and `ast.ts` (98.45%) now all clear the behavioral target.

4. **Data files score low by design**: `rule-manifest.ts`, `rule-messages.ts`, `plugin.ts`, and message-only files are static data. Their survivors are string/object mutations in configuration metadata. Chasing these would be score-chasing per the anti-patterns, so the default gate excludes them.

## How to repeat or extend the sweep

This document is dated evidence from the 2026-05-31 v0 sweep, not an active work queue. To repeat the same evidence run, use the command contract in `docs/references/mutation-testing.md`. To extend mutation hardening after v0, start from the current codebase and write a new dated report instead of treating the 2026-05-31 survivor lists as live assignments.

## Artifacts

- HTML report: `reports/mutation/index.html`
- JSON report: `reports/mutation/report.json`
- Stryker config: `stryker.config.mjs`

## Relationship to publish gate

Per Item 18 of the exec plan, the full mutation sweep and survivor hardening is a prerequisite for the first publish (Item 19). This report now records both the starting point and the completed hardening evidence. The target was 80%+ on behavioral files (everything except the data/config files classified as equivalent above); the final default gate score is 81.81%, so Item 18's publish prerequisite is satisfied.
