# Mutation report: Bun runtime migration Item 7, 2026-06-07

Item 7 verified that mutation testing still works after moving repo-authored TypeScript scripts to Bun, then hardened the new version-pin contract added by the migration.

## Scope

| Target | Purpose | Result |
|---|---|---|
| `packages/oxlint-standards/src/utils/effect-identifiers.ts` | Health check for Stryker plus Vitest after the Bun runtime migration | 100.00%; 14 caught / 14 total |
| `scripts/lib/version-pins.ts` | Primary behavioral target for the new Bun pin and workflow version contracts | 94.59% final score; 140 caught / 148 total |

Baseline `pnpm check` passed before mutation work started. Final `pnpm check` passed after the Item 7 fix commit.

## Primary target progression

| Stage | Score | Result |
|---|---:|---|
| Initial worker run | 53.33%; 72 caught / 135 total | Exposed weak coverage around workflow/runtime pin contracts |
| First hardening and fix pass | 90.37%; 122 caught / 135 total | Crossed the 80% mutation target |
| Review/refactor plus final worker follow-up | 94.59%; 140 caught / 148 total | Accepted final Item 7 score |

## Changes made during Item 7

The worker strengthened `scripts/checks/check-version-pins.test.ts`. Mutation review exposed public contract gaps in `scripts/lib/version-pins.ts`, and the committed follow-up `049747d` (`fix: tighten version pin workflow contracts`) fixed those gaps:

- `actions/setup-node` could be missing.
- `node-version` could be missing or non-string.
- The pnpm action could be missing.
- `jdx/mise-action` detection depended on step order.

## Remaining survivors

Item 7 classified the remaining survivors as same-behavior, trivial, or brittle score-chasing:

- Duplicate-key parser option mutation has the same behavior under current parser behavior.
- Diagnostic-formatting mutants only change message shape.
- Junk non-action step and scalar step internals don't change the public contract enough to justify brittle assertions.
- Message-only mutants aren't observable behavior changes.
- Wrapper no-op and workflow-path mutants would require brittle module/file mocking or deeper seam changes.

## Outcome

Item 7 was accepted under the manual mutation policy. Both scoped mutation runs produced scores, `version-pins.ts` exceeded the 80% target, and the remaining survivors were classified and accepted.

This report records manual mutation evidence only. It does not mean CI or Stryker enforces the score.
