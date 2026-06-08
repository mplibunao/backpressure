# Technical debt tracker

This tracker holds accepted deferrals for future sessions or future phases. It is not a same-session task list. Work already queued for the current session belongs in the active plan or the current review notes; use the chat summary only when no durable doc applies. A deferral is not real until it is written here or in the relevant future-phase stub. IDs are stable; gaps mean a prior deferral was completed or removed rather than renumbered.

## Deferred from v0 baseline

### TD-001: Executor-coupled rules

Do not build `no-direct-cloud-executor-schema-import`, `require-reactivity-keys`, or workos-vault-scoped rules in v0. These rules are tied to executor's application boundaries, not a general reusable package.

### TD-002: Package split triggers

Keep new stack opinions as presets or config files until a domain earns an independent package through separate cadence, heavy peer dependencies, or clearer discoverability.

### TD-003: General and boundaries preset growth

Grow `general` and `boundaries` only when a rule is stack-neutral or architecture-specific enough to avoid surprising Effect consumers and non-Effect consumers.

### TD-004: ESLint RuleTester cross-check

Oxlint RuleTester is the primary runtime because it proves parser parity. Add ESLint RuleTester only as an optional portability cross-check after the first structural rules are stable.

### TD-006: Optional hygiene gates

Madge circular-dependency checks, bundle-size diffs, ast-grep repo hygiene, `no-js-extension-imports`, and `no-opaque-instance-fields` are out of the baseline. Add each only when a concrete pattern earns the gate.

### TD-007: Future stack-neutral React preset

Reserve `react` for stack-neutral React rules such as rules-of-hooks, exhaustive-deps, JSX key checks, and anti-`useEffect` guidance. Evaluate react.doctor as both a rule source and a diagnostics layer to recommend, then lift only cheap structural rules that fill a gap.

### TD-008: Test-integrity rules and a `tests` preset

Candidate post-v0 preset for catching fake or assertion-free tests, the kind agents produce. Source: a Twitter screenshot reviewed on 2026-05-31.

- `no-mock-echo`: flag a test that asserts the result equals the exact value a mock was configured to return. Tautological, so it tests the mock rather than the code. Stack-neutral across mock libraries and high value as agent backpressure. Default severity `warn` under the graded posture (ADR 004). Detection is heuristic, so scope carefully: match the asserted expected value against the mock's configured return inside the same test, and expect false-positive edges.

Stryker complements these, it does not replace them. Mutation testing finds coverage gaps in a slow batch; these rules name the bad-test shape at write time. A `no-mock-echo` test over a thin pass-through wrapper can still earn a clean mutation score while testing nothing real.

When these rules ship, they are candidates to distill into taste-distillery canon as a test-integrity / anti-slop-tests card. taste-distillery deliberately does not pre-track this item; it distills from shipped evidence instead.

### TD-009: Catalog domain split and replay-scenario consolidation

WG3 refactor review on 2026-05-31 extracted shared import, wrapper-ownership, side-effect, preset, and script-runtime helpers. The review deliberately left three follow-ups: keep `rule-catalog.ts` unsplit, keep the full RuleTester/replay scenario corpus in place, and keep repeated AST/mock-context builders inside mutation-hardening utility tests instead of moving them to a test-support module. The catalog still has cross-rule ownership predicates that can break when moved blindly, and the replay matrix is the current behavior oracle. Trigger this cleanup after WG3 is merged and before adding the next large rule family: first create generated before/after rule maps and replay-case snapshots, then split one domain at a time (`general`, `boundaries`, `effect-react`, then `effect`). Move shared scenario strings into a test-support module only when the snapshots prove identical membership and diagnostics, plus stable branch IDs.

### TD-010: `no-effect-as` named barrel import policy

The 2026-05-31 refactor review preserved the existing `no-effect-as` binding behavior: the standalone `no-effect-as` rule recognizes namespace imports such as `import * as Effect from "effect/Effect"` and the `Effect` namespace alias from the `effect` barrel, but it does not currently diagnose the named barrel form `import { Effect } from "effect"; Effect.as(...)`. This was not changed during WG3 refactor fixes because changing it would expand behavior after a clean correctness review. Revisit when deciding whether `no-barrel-import` fully owns named barrel imports in presets or whether each standalone rule should also catch named barrel imports; add explicit RuleTester and replay cases for whichever policy is chosen.

### TD-011: Revisit dropping `yaml` if Bun gains strict YAML parsing

The Bun runtime migration (`docs/exec-plans/active/bun-runtime-migration-2026-06-07.md`) keeps the `yaml` dependency. `scripts/checks/check-release-workflow.ts` needs duplicate-key rejection, and Bun's built-in `Bun.YAML.parse` silently keeps the last value on duplicate keys (probed on Bun 1.3.11; the current API reference still exposes only `parse(input: string)` with no strict option). YAML 1.2 treats duplicate mapping keys as an error, so `yaml` with `{ uniqueKeys: true }` is the spec-correct parser and Bun's built-in is a lenient gap.

Revisit swapping `yaml` for `Bun.YAML` only when Bun adds duplicate-key rejection or a strict parsing option. The single consumer is `check-release-workflow.ts`, and the duplicate-key test in `check-release-workflow.test.ts` is the guard to keep green through any future swap. No upstream issue was filed (decision 2026-06-07).
