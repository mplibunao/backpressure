# mutation-orchestrator

Orchestrate mutation testing across targeted source files. Owns the full lifecycle from baseline verification through sequential file delegation to final validation.

See [mutation-testing.md](../../../docs/references/mutation-testing.md) for concepts, survivor classification, and anti-patterns.

## Inputs

- **scope**: which files to mutate (required; ask the user if not provided)
- **agent**: which agent role to delegate to (pair, engineer, design, etc; ask the user if not provided; don't guess, as agent tier matters for this kind of work)
- **target_score**: minimum mutation score to aim for (default: 80)
- **max_iterations**: maximum improvement iterations per file (default: 3)

## Workflow

1. **Baseline green**: Run `git status --short` and abort if the working tree is not clean — stale Stryker artifacts from a failed previous run must be resolved before starting. Then run `pnpm check` (includes lint, typecheck, tests, and build). If either fails, stop and report.
2. **Delegate per file**: For each file in scope, spawn a separate agent and instruct it to follow `.claude/skills/mutation-worker/SKILL.md` with `mutate_path`, `target_score`, and `max_iterations`. Process files **sequentially**, one file per agent, each in its own isolated context.
3. **Collect results and commit test changes**: After each worker reports success, collect its summary (initial score, final score, survivors, list of changed test files, cleanup confirmed). Then commit any test-file changes before spawning the next worker to keep a clean baseline:
   - Review the diff. Stage only files within the **allowed test surface** per the command contract in [mutation-testing.md](../../../docs/references/mutation-testing.md).
   - Commit: `git commit -m 'test(mutation): strengthen tests for <basename>'`
   - Reject the commit if source files, Stryker artifacts (`reports/mutation/`), or any unexpected files are staged.
4. **Combined report**: Run `pnpm test:mutation` with no `STRYKER_MUTATE` override to get the combined score across all targets.
5. **Final validation**: Run `pnpm check` (includes lint, typecheck, tests, and build) to confirm no artifacts were left behind. Then run `git status --short`; the working tree must be clean after each worker commit and final validation. Any remaining diff is a blocker unless MP explicitly asks to stop before committing.

## Mutation targets

Target classes: rule logic (`rule-catalog.ts`, `rules/effect/*.ts`), AST helpers (`utils/*.ts`), and preset assembly (`presets/shared.ts`). Static/equivalent data files are excluded from the behavioral gate by default. Exact globs and exclusion rationale are in `stryker.config.mjs`; see [mutation-testing.md](../../../docs/references/mutation-testing.md) for target class descriptions.

## Score guidelines

See [mutation-testing.md](../../../docs/references/mutation-testing.md) for detailed score bands. Target 80%+ for production-quality tests; accept 70%+ for most features.

## Constraints

- Mutation testing is manual/local only. Never add it to CI or `pnpm check`
- The `break: null` threshold means Stryker never fails the build on score. The orchestrator decides when to stop
- If the worker reports equivalent survivors, accept them. Do not force another iteration
- One mutation run at a time, no parallel runs (Stryker mutates source files in-place)
- Working tree must be clean before starting. Ask the user to commit pending work if needed. Stryker mutates source files and cleanup from a failed run is painful.

## Dependencies

- `.claude/skills/mutation-worker/SKILL.md`: single-file mutation loop (delegated to, not restated here)
- `stryker.config.mjs`: root Stryker configuration
- `docs/references/mutation-testing.md`: full mutation testing reference
