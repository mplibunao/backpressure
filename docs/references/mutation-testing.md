# Mutation testing

Mutation testing measures whether tests actually detect code changes. Unlike coverage metrics (which measure which lines *execute*), mutation testing measures which changes tests *catch*.

## How it works

1. **Stryker** modifies source code in small, targeted ways called **mutants**. It might flip `===` to `!==` or replace `+` with `-`. It can also remove return statements or swap boolean literals.
2. For each mutant, Stryker runs the test suite.
3. If a test fails, the mutant is **killed** (tests caught the change). Good.
4. If all tests pass, the mutant **survived** (tests missed the change). This reveals a gap in assertions.

The **mutation score** is the percentage of killed mutants. A high coverage percentage with a low mutation score means tests execute code without verifying its behavior.

## What it catches

| Problem | How mutation testing reveals it |
|---|---|
| Weak assertions | `expect(result).toBeTruthy()` passes even when the return value changes |
| Missing negative cases | No test verifies what happens with invalid input, so the mutant that removes the validation survives |
| Redundant tests | Multiple tests kill the exact same mutant, so the suite is larger than it needs to be |
| Dead code | A mutant that removes a code block survives because nothing depends on it |
| Coincidental passes | A test passes by accident because the assertion checks a side effect that happens to be correct for the wrong reasons |

## Survivor classification

Not every surviving mutant is a problem. Classify before acting:

| Category | Action | Example |
|---|---|---|
| **Killable** | Strengthen the test (a missing or weak assertion) | Flip `>` to `>=` survives because no test checks the boundary |
| **Equivalent** | Document and skip (the mutation doesn't change observable behavior) | Changing an internal variable name that's never exposed |
| **Trivial** | Skip per quality-over-quantity (killing it would require pinning to the exact code shape) | Asserting on exact error message strings |

## Anti-patterns

- **Score chasing**: adding low-value assertions just to kill a mutant. If a surviving mutant is equivalent, document it and move on.
- **Noisy assertions**: asserting with `.toStrictEqual` on entire objects when only one field matters. Precise assertions kill mutants more reliably.
- **Pinning to internals**: testing internal details to kill mutants. If the mutant survives because the test only checks the public contract, that's correct behavior.

## Workflow

### Orchestrator (repo-level)

The orchestrator owns the full lifecycle. See `.claude/skills/mutation-orchestrator/SKILL.md`.

1. Verify baseline is green (`pnpm check`)
2. For each file, spawn a separate agent to follow the worker skill (one file per agent, sequentially)
3. Run combined mutation report
4. Final validation (`pnpm check`)

### Worker (single-file loop)

The worker runs one file through the mutation cycle. See `.claude/skills/mutation-worker/SKILL.md`.

1. Set `STRYKER_MUTATE=<file>` and run `pnpm test:mutation`
2. Analyze survivors: classify each as killable, equivalent, or trivial
3. Strengthen tests to kill non-equivalent survivors
4. Re-run and compare
5. Stop when score meets the target, iterations are exhausted, or only equivalent/trivial survivors remain

## Command contract

| Gate | Command |
|---|---|
| Baseline / final gate (orchestrator) | `pnpm check` |
| Worker iteration gate | `pnpm test` |
| Single-file mutation run | `STRYKER_MUTATE=<repo-relative path> pnpm test:mutation` |
| Full evidence sweep (includes static/equivalent files except always-excluded build/test support) | `STRYKER_SWEEP=1 pnpm test:mutation` |

## Allowed worker edit surface

Only these test or test-support files may appear dirty at the end of a worker pass:

- `packages/oxlint-standards/src/**/*.test.ts` (package test files)
- `scripts/fixture-replay.ts` (fixture replay helper)

Production source files, Stryker artifacts (`reports/mutation/`), and unexpected scripts are blockers. The orchestrator may commit allowed-surface changes between workers; standalone workers should start from and return to a clean tree except for accepted allowed-surface edits.

## Mutation targets

The primary target class is pure-function rule logic and AST helpers: deterministic transformations over ESTree nodes, side-effect-free with clear behavioral contracts. Exact mutate globs and exclusion rationale live in `stryker.config.mjs`, the source of truth.

- **Rule logic**: `rule-catalog.ts` and extracted rule files under `rules/effect/`
- **AST helpers**: shared utilities under `utils/` for node traversal, import analysis, and Effect-specific pattern detection
- **Preset assembly**: `presets/shared.ts` (constructs preset configs from the manifest)

Static/equivalent data files (message strings, manifest metadata, plugin identity constants) and build-time utilities are excluded from the behavioral gate by default. Exact exclusion logic is in `stryker.config.mjs`.

## Performance expectations

| File size | Estimated mutation time |
|---|---|
| Small (under 100 lines) | 1-5 minutes |
| Medium (100-300 lines) | 5-15 minutes |
| Large (300-500 lines) | 15-45 minutes |
| Very large (500+ lines) | 45-120 minutes |

`rule-catalog.ts` is around 3700 lines. Expect the longest runs there. Scope with `STRYKER_MUTATE` to test individual files or subsets.

## Score guidance

| Score | Quality | Action |
|---|---|---|
| 80%+ | Excellent | Strong tests, ready for production |
| 70-79% | Good | Acceptable for most features |
| 60-69% | Fair | Investigate survivors, likely real gaps |
| Below 60% | Weak | Significant assertion gaps, needs hardening |

### Error handling

- **Stryker fails to run**: check `stryker.config.mjs` syntax and plugin versions. Ensure `pnpm test` passes first.
- **Tests break after changes**: revert the last test changes and try a different approach. Never commit broken tests.
- **Diminishing returns**: after 2 iterations with under 5% total improvement, stop. The remaining survivors are likely equivalent.
- **Large file + low initial score**: report the score and estimated iterations before burning cycles. Consider splitting the work.
- **`@ts-nocheck` artifacts**: Stryker instruments files during runs. If a run is interrupted, check that no `// @ts-nocheck` comments were left in source files.

## Scope

**Now (v0):** full sweep over rule logic (`rule-catalog.ts`, extracted rule files) and AST helpers (`utils/*.ts`) gates the first publish. Run as an agent workflow via the orchestrator/worker skills.

**Later:** expand as new packages and rule domains are added. Tracked in tech-debt-tracker.

**Not now:** CI gating. Mutation testing is an agent-run quality gate, never wired into CI.
