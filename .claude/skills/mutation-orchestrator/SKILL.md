# mutation-orchestrator

Orchestrate mutation testing across targeted source files. Own the repo-level lifecycle: baseline verification, sequential worker delegation, result collection, allowed-surface commits, combined report, and final validation.

Use `docs/references/mutation-testing.md` as the source of truth for the shared policy:

- [Command contract](../../../docs/references/mutation-testing.md#command-contract)
- [Allowed worker edit surface](../../../docs/references/mutation-testing.md#allowed-worker-edit-surface)
- [Mutation targets](../../../docs/references/mutation-testing.md#mutation-targets)
- [Score guidance](../../../docs/references/mutation-testing.md#score-guidance)
- [Anti-patterns](../../../docs/references/mutation-testing.md#anti-patterns)
- [Performance expectations](../../../docs/references/mutation-testing.md#performance-expectations)
- [Error handling](../../../docs/references/mutation-testing.md#error-handling)

## Inputs

- **scope**: files to mutate (required; ask the user if not provided)
- **agent**: agent role to delegate to (required; ask the user if not provided because tier matters for survivor analysis)
- **target_score**: minimum mutation score to aim for (default: 80)
- **max_iterations**: maximum improvement iterations per file (default: 3)

## Workflow

1. **Baseline green**: Run `git status --short` and abort if the working tree is not clean. Then run the baseline gate from the reference doc's command contract.
2. **Delegate per file**: For each file in scope, spawn one worker agent with `.claude/skills/mutation-worker/SKILL.md`, `mutate_path`, `target_score`, and `max_iterations`. Process files sequentially because Stryker mutates source files in place.
3. **Collect and commit worker changes**: After each successful worker, collect initial score, final score, remaining survivor classifications, changed files, and cleanup confirmation. Review the diff, stage only files allowed by the reference doc's allowed worker edit surface, and commit with `git commit -m 'test(mutation): strengthen tests for <basename>'`.
4. **Combined report**: Run the default mutation command from the reference doc's command contract to get the combined behavioral score.
5. **Final validation**: Run the final gate from the reference doc's command contract, then run `git status --short`. Any remaining diff is a blocker unless MP explicitly asks to stop before committing.

## Constraints

- Mutation testing is manual/local only. Never add it to CI or `pnpm check`.
- The `break: null` threshold means Stryker never fails the build on score. The orchestrator decides when to stop.
- Accept worker-classified equivalent or trivial survivors. Do not force another iteration for score chasing.
- Commit only allowed-surface test or test-support changes. Reject source diffs, Stryker artifacts, and unexpected files.

## Dependencies

- `.claude/skills/mutation-worker/SKILL.md`: single-file mutation loop
- `docs/references/mutation-testing.md`: shared mutation policy and command contract
- `stryker.config.mjs`: root Stryker configuration
