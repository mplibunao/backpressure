# Rule intake

Status: current-state procedure for triaging a candidate rule into this package. [ADR-007](../decisions/007-tsgo-delegation-and-overlap.md) owns the `@effect/tsgo` delegation.

## Purpose

How a candidate rule becomes part of `@mplibunao/oxlint-standards`, or gets turned away. A candidate is any idea, a rule seen elsewhere, or a port target. This document owns the step sequence. ADR 004 owns the curation strategy and the severity policy. Preset taxonomy is owned by `docs/design-docs/preset-architecture.md`. Terms such as rule, plugin, preset, and shareable config are defined in `docs/references/lint-glossary.md`.

## The triage

Run these steps in order.

1. **Decide what kind of problem it catches.** A correctness, safety, or agent-failure-mode rule defaults to `error`. A style or preference rule defaults to a quieter level. A candidate that catches nothing real is dropped with a one-line reason. Severity grading follows ADR 004.
2. **Find the stack it presumes.** A stack-neutral rule joins `general`. An Effect rule joins `effect`. A rule that presumes a specific tool joins that tool's preset, which may be a new preset. Preset choice follows `docs/design-docs/preset-architecture.md`.
3. **Check whether a good tool already covers it.** When oxlint ships a native rule, enable it in config. When only an ESLint plugin covers it and the rule is structural, port it. When a type-aware Effect check covers it, it belongs to `@effect/tsgo`: grade that check in `scripts/config/tsgo-policy.ts` instead of writing a rule. Other type-aware or well-covered checks are recommended through the existing plugin or language service. A structural rule may still overlap a delegated check when it is stricter or fires without a TypeScript project; record the overlap in its manifest note. The build, port, and delegate options are defined in `docs/references/lint-glossary.md` and decided by ADR 004 and ADR-007.
4. **Check whether it earns its own package.** A new rule stays a preset or rule inside this package until the split triggers in `docs/decisions/003-monorepo-scope-and-naming.md` apply.
5. **Record it.** Add the rule to `src/rule-manifest.ts` with its domain, gating, severity, and a note that says what it catches. Add tests, a written message, and for a port, attribution. To drop a rule, set its disposition to `dropped` with a reason instead of deleting the row. When an `@effect/tsgo` check takes over, list it in `replacedBy`; the replacement must ship at a severity no lower than the dropped rule's.

## `@effect/tsgo` rules

The delegated rules come from the pinned `@effect/tsgo` release, not from candidates. Every pinned rule gets an explicit severity from a category default or a named exception in `scripts/config/tsgo-policy.ts`, and `pnpm gen:effect-policy` regenerates the manifest rows and both tsconfig overlays. A bump captures the new release's metadata snapshot. A new rule takes its category's default, and a named exception that no longer matches a pinned rule or its category fails generation, so each bump includes a review of the new and changed rules. Upstream's `recommended` preset is not used, because its membership moves independently of this pack.

## Known candidates

Two optional hygiene candidates are on record: `no-js-extension-imports` and `no-opaque-instance-fields`. Both are evaluated through the triage sequence above, using the effect-smol `@effect/oxc` implementations as reference material rather than as automatic acceptance.

## Coherence

Two rules can target the same problem. The pack resolves that overlap by routing each rule to one owner preset. Overlap never justifies dropping a useful rule. The coherence rules live in `docs/design-docs/preset-architecture.md`.

## References

- `docs/decisions/004-rule-curation-and-severity-posture.md`: curation strategy and severity policy.
- `docs/design-docs/preset-architecture.md`: preset taxonomy and coherence.
- `docs/decisions/003-monorepo-scope-and-naming.md`: when a domain earns its own package.
- `docs/references/lint-glossary.md`: rule, plugin, preset, shareable config, and the build, port, and delegate options.
