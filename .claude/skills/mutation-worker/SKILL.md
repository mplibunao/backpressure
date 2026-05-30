# mutation-worker

Run a single-file mutation testing loop: mutate, analyze survivors, strengthen tests, re-run, iterate.

See [mutation-testing.md](../../../docs/references/mutation-testing.md) for concepts, survivor classification, and anti-patterns.

## Inputs

- **mutate_path**: repo-relative path to the file to mutate, e.g. `packages/oxlint-standards/src/rule-catalog.ts` (required; ask the user if not provided)
- **target_score**: minimum mutation score to aim for (default: 80)
- **max_iterations**: maximum improvement iterations (default: 3)

## Workflow

1. **Initial run**: Verify the working tree is clean:
   ```bash
   git status --short
   ```
   Abort if any unexpected output appears. The forbidden dirty state is: source file diffs under `packages/oxlint-standards/src/**` (non-test), Stryker artifacts (`reports/mutation/`), or any untracked file outside the test tree. Clean test-file changes (`*.test.ts`) are acceptable only when the orchestrator has confirmed they come from a prior accepted worker pass — in that case the orchestrator commits them between workers, so the tree will be clean anyway. When running standalone, the tree must be fully clean before starting. Then run Stryker with the repo-relative path:
   ```bash
   STRYKER_MUTATE="<mutate_path>" pnpm test:mutation
   ```
2. **Analyze survivors**: Read the clear-text output. For each surviving mutant, classify it:
   - **Killable**: a missing or weak assertion. Strengthen the test.
   - **Equivalent**: the mutation doesn't change observable behavior. Document and skip.
   - **Trivial**: low-value kill that would require pinning to the exact code shape. Skip.
3. **Strengthen tests**: Add or improve assertions to kill non-equivalent survivors. Follow testing practices:
   - Use `it.each` for parameterized cases
   - Keep tests ≤10 lines
   - Never add assertions just to chase score
   - Only modify test files, never change source files to improve mutation scores
4. **Verify tests pass**: Run `pnpm test` before re-running mutation.
5. **Re-run**: Run Stryker again on the same file. Compare scores.
6. **Iterate or stop**: stop when the score meets target_score or when iterations are exhausted. Also stop if only equivalent/trivial survivors remain.
7. **Cleanup check**: Run `git status --short` and verify:
   - No `@ts-nocheck`, `@ts-ignore`, or Stryker artifacts left in any file.
   - Only changes from the allowed test surface remain uncommitted. Source files must be unchanged.

   Verify only the **allowed test surface** is dirty (defined in the command contract in [mutation-testing.md](../../../docs/references/mutation-testing.md)). Any diff outside the allowed surface (production source, Stryker artifacts, unexpected scripts) is a blocker; revert and report before handing off to the orchestrator.

## Mutation targets in this repo

Source files are pure functions over ESTree nodes. Common survivor patterns by class: rule logic → unasserted condition branches; AST helpers → boundary conditions not fully tested; preset assembly → missing preset-membership assertions. See [mutation-testing.md](../../../docs/references/mutation-testing.md) for target class descriptions.

## Early reporting

Report back to the orchestrator before burning all iterations if:

- **Large file + low initial score**: file over 300 lines AND initial score below 60%. Report score and estimated iterations needed. Recommend starting with smaller files.
- **Diminishing returns**: after 2 iterations with under 5% total improvement. Report progress plateau.
- **High time investment**: estimated time to reach target over 2 hours. Let orchestrator decide.

## Survivor analysis

Evaluate each survivor on merit using the classification in the workflow above (killable, equivalent, trivial). Do not skip survivors by category. A condition flip in an import guard that's part of the rule's public contract is worth testing, while the same flip in an internal-only helper shortcut may not be.

## Anti-patterns

See [mutation-testing.md](../../../docs/references/mutation-testing.md) for the full list. Avoid score chasing and noisy assertions. If a run is interrupted, check for leftover `@ts-nocheck` artifacts in source files.

## Performance

See [mutation-testing.md](../../../docs/references/mutation-testing.md) for time estimates by file size. `rule-catalog.ts` is very large (~3700 lines); if the full file is impractical, scope to rule sections with `STRYKER_MUTATE`.

## Error handling

See [mutation-testing.md](../../../docs/references/mutation-testing.md) for detailed error handling. Key: if Stryker fails, check config and ensure `pnpm test` passes first. If tests break, revert and try a different approach. If no progress after 2 iterations, report and stop.

## Report format

```
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

- Never modify `stryker.config.mjs`
- Never modify source files to improve mutation scores, only test files
- All test changes must pass `pnpm check` before reporting success (`pnpm check` includes lint, typecheck, tests, and build)
- Working tree must be clean before starting. Ask the user to commit pending work if needed. Stryker mutates source files and cleanup from a failed run is painful.
