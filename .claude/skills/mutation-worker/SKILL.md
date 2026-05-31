# mutation-worker

Run one file through the mutation loop: mutate, analyze survivors, strengthen tests, re-run, and report. Keep the work scoped to `mutate_path` and the allowed worker edit surface.

Use `docs/references/mutation-testing.md` as the source of truth for shared policy:

- [Command contract](../../../docs/references/mutation-testing.md#command-contract)
- [Allowed worker edit surface](../../../docs/references/mutation-testing.md#allowed-worker-edit-surface)
- [Survivor classification](../../../docs/references/mutation-testing.md#survivor-classification)
- [Score guidance](../../../docs/references/mutation-testing.md#score-guidance)
- [Anti-patterns](../../../docs/references/mutation-testing.md#anti-patterns)
- [Performance expectations](../../../docs/references/mutation-testing.md#performance-expectations)
- [Error handling](../../../docs/references/mutation-testing.md#error-handling)

## Inputs

- **mutate_path**: repo-relative path to the file to mutate, e.g. `packages/oxlint-standards/src/rule-catalog.ts` (required; ask the user if not provided)
- **target_score**: minimum mutation score to aim for (default: 80)
- **max_iterations**: maximum improvement iterations (default: 3)

## Workflow

1. **Initial run**: Run `git status --short`. Abort on production source diffs, Stryker artifacts, or unexpected files. When running standalone, require a fully clean tree. Then run the single-file mutation command from the reference doc's command contract with `STRYKER_MUTATE=<mutate_path>`.
2. **Analyze survivors**: Classify each survivor using the reference doc's survivor classification: killable, equivalent, or trivial.
3. **Strengthen tests**: Add or improve assertions only for killable survivors. Modify only files in the reference doc's allowed worker edit surface.
4. **Verify tests pass**: Run the worker iteration gate from the reference doc's command contract before re-running mutation.
5. **Re-run and compare**: Run the same single-file mutation command and compare scores.
6. **Iterate or stop**: Stop when `target_score` is met, `max_iterations` is exhausted, progress plateaus, or only equivalent/trivial survivors remain.
7. **Cleanup check**: Run `git status --short`. Confirm source files are clean, Stryker artifacts are absent, and any remaining diff is limited to the allowed worker edit surface.

## Early reporting

Report back to the orchestrator before burning all iterations if:

- **Large file + low initial score**: file over 300 lines and initial score below 60%.
- **Diminishing returns**: after 2 iterations with under 5% total improvement.
- **High time investment**: estimated time to reach target over 2 hours.

## Report format

```text
Mutation Testing Complete for: [filename]

Results:
  Initial Score: X.X% (killed/total)
  Final Score: Y.Y% (killed/total)
  Improvement: +Z.Z% (+N mutants killed)
  Iterations Used: N/M

Changes Made:
  - [List of test files modified, e.g. rule-catalog.test.ts]
  - [Brief description of test improvements per file]

Remaining Survivors (N):
  - [Category] [Description]

Artifacts Cleaned: ✅ (git status --short confirmed clean source files)
Recommendation: [Pass / Needs more work / Accept as-is]
```

## Constraints

- Never modify `stryker.config.mjs` during a worker pass.
- Never modify production source files to improve mutation scores.
- Never add assertions only to chase score; follow the reference doc's anti-pattern guidance.
- All test changes must pass the final gate before reporting success.
