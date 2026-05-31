# Technical debt tracker

This tracker holds accepted deferrals. A deferral is not real until it is written here or in the relevant future-phase stub. IDs are stable; gaps mean a prior deferral was completed or removed rather than renumbered.

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
- `require-error-code-assertion` idea: assert which error occurred, not just that something failed. Do not port the screenshot matcher as-is; its `ok === false` shape assumes a non-Effect result type. Reshape per the error model actually in use (for Effect, assert the tagged error, not just that the Effect failed). Hold until the matcher is defined against a model MP uses.

Stryker complements these, it does not replace them. Mutation testing finds coverage gaps in a slow batch; these rules name the bad-test shape at write time. A `no-mock-echo` test over a thin pass-through wrapper can still earn a clean mutation score while testing nothing real.

### TD-009: Catalog domain split and replay-scenario consolidation

WG3 refactor review on 2026-05-31 extracted shared import, wrapper-ownership, side-effect, preset, and script-runtime helpers, but deliberately did not split `rule-catalog.ts` into domain subcatalog files, centralize the full RuleTester/replay scenario corpus, or extract repeated AST/mock-context builders from mutation-hardening utility tests into a test-support module. The catalog still has cross-rule ownership predicates that are easy to break when moved blindly, and the replay matrix is the current behavior oracle. Trigger this cleanup after WG3 is merged and before adding the next large rule family: first create generated before/after rule maps and replay-case snapshots, then split one domain at a time (`general`, `boundaries`, `effect-react`, then `effect`) and move shared scenario strings into a test-support module only when the snapshots prove identical membership, diagnostic counts, and branch IDs.

### TD-010: `no-effect-as` named barrel import policy

The 2026-05-31 refactor review preserved the existing `no-effect-as` binding behavior: the standalone `no-effect-as` rule recognizes namespace imports such as `import * as Effect from "effect/Effect"` and the `Effect` namespace alias from the `effect` barrel, but it does not currently diagnose the named barrel form `import { Effect } from "effect"; Effect.as(...)`. This was not changed during WG3 refactor fixes because changing it would expand behavior after a clean correctness review. Revisit when deciding whether `no-barrel-import` fully owns named barrel imports in presets or whether each standalone rule should also catch named barrel imports; add explicit RuleTester and replay cases for whichever policy is chosen.
