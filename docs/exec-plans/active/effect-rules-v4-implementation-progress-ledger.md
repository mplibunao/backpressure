# Effect rules v4: exec-plan progress ledger

Progress ledger for the orchestrate-loop execution of plan
[`effect-rules-v4-implementation-2026-09-25.md`](./effect-rules-v4-implementation-2026-09-25.md)
and the decision record
[`effect-rules-v4-alignment-2026-09-25.md`](./effect-rules-v4-alignment-2026-09-25.md).
Each tracked unit gets one row. Per-item detail sections are appended as items land.

## Intake baseline

Recorded on 2026-09-25 against `lint/oxlint-standards-consolidation` at `42c77c6`.

- `pnpm test`: 790 passed (20 files).
- `pnpm check`: stops at `introspection check`. A direct `pnpm introspection:check` exited 1 with `config.schema_violation: config TOML failed JSON Schema validation`. The sibling `../introspection` build rejects `[records.list]`. Do not remove that block.
- `pnpm prose`: Vale reported no alerts across 53 files.

## Status

Commit SHAs are in the backpressure repo. The orchestrator commits; agents do not. Sizes are from the plan (S/M/L).

| ID | Item | Size | Status | Commits |
| --- | --- | --- | --- | --- |
| WI-01 | Record ownership and initialize the execution ledger | S | DONE (uncommitted) | |
| WI-02 | Establish pinned inputs and the isolated toolchain foundation | L | PENDING | |
| WI-03 | Remove obsolete runtime policies and repair ownership contracts | L | PENDING | |
| WI-04 | Narrow composition and error contracts | L | PENDING | |
| WI-05 | Retarget v4 APIs and finish the remaining narrowings and messages | L | PENDING | |
| WI-06 | Activate the full Effect config and both package surfaces | L | PENDING | |
| WI-11 | Rule list with its generated page and local viewer | M | PENDING | |
| WI-07 | Install all six durable gates | L | PENDING | |
| WI-08 | Measure the two apps and finalize conditional delegation | M | PENDING | |
| WI-09 | Complete consumer guidance, records, and changesets | M | PENDING | |
| WI-10 | Run acceptance and classify the remaining blocker accurately | S | PENDING | |

## Per-item detail

### WI-01: Record ownership and initialize the execution ledger (DONE, uncommitted)

- **Build:** governance only. No package or runtime behavior changed.
- **ADR-007:** recorded as [ADR-007](../../decisions/007-tsgo-delegation-and-overlap.md).
- **Supersession notes:** dated 2026-09-25 notes appended to ADR-001, ADR-003, and ADR-004. Historical text was not rewritten.
- **Index:** `docs/decisions/index.md` lists ADR-007 and updates the current delegated-ownership summaries.
- **Router:** `CLAUDE.md` links ADR-007 and this ledger only. The `check:effect-integration` instruction is deferred.
- **Current-state docs:** `docs/design-docs/rule-pack-architecture.md`, `docs/design-docs/preset-architecture.md`, `docs/design-docs/rule-intake.md`, and `docs/references/rules.md` now mark the ADR-007 successor as intended and not yet implemented. Shipping behavior in those files is unchanged.
- **Review gate:** not run here; the orchestrator owns review.
- **Refactor gate:** not applicable; no code changed.
- **Checks:** see [Intake baseline](#intake-baseline). Those are the runs for this item.
- **Commits:** none. The orchestrator commits. Unrelated untracked plan, review, and `prompt-exports/` files were left untouched.
- **Issues:** the introspection schema blocker remains. It does not block independent prose or tests.
- **Action items for MP:** none.
