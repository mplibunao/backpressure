# Technical debt tracker

This tracker holds accepted deferrals. A deferral is not real until it is written here or in the relevant future-phase stub.

## Deferred from v0 baseline

### TD-001: Executor-coupled rules

Do not build `no-direct-cloud-executor-schema-import`, `require-reactivity-keys`, or workos-vault-scoped rules in v0. These rules are tied to executor's application boundaries, not a general reusable package.

### TD-002: Package split triggers

Keep new stack opinions as presets or config files until a domain earns an independent package through separate cadence, heavy peer dependencies, or clearer discoverability.

### TD-003: General and boundaries preset growth

Grow `general` and `boundaries` only when a rule is stack-neutral or architecture-specific enough to avoid surprising Effect consumers and non-Effect consumers.

### TD-004: ESLint RuleTester cross-check

Oxlint RuleTester is the primary runtime because it proves parser parity. Add ESLint RuleTester only as an optional portability cross-check after the first structural rules are stable.

### TD-005: Mutation testing workflow

Mutation testing is a delegated publish-readiness sweep, never a CI job. Adapt the tome.nvim Stryker orchestrator and worker skills when the rule catalog exists.

### TD-006: Optional hygiene gates

Madge circular-dependency checks, bundle-size diffs, ast-grep repo hygiene, `no-js-extension-imports`, and `no-opaque-instance-fields` are out of the baseline. Add each only when a concrete pattern earns the gate.

### TD-007: Future stack-neutral React preset

Reserve `react` for stack-neutral React rules such as rules-of-hooks, exhaustive-deps, JSX key checks, and anti-`useEffect` guidance. Evaluate react.doctor as both a rule source and a diagnostics layer to recommend, then lift only cheap structural rules that fill a gap.
