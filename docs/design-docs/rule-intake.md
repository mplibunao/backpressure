# Rule intake

Status: current-state procedure for triaging a candidate rule into this package.

## Purpose

How a candidate rule becomes part of `@mplibunao/oxlint-standards`, or gets turned away. A candidate is any idea, a rule seen elsewhere, or a port target. This document owns the step sequence. ADR 004 owns the curation strategy and the severity policy. Preset taxonomy is owned by `docs/design-docs/preset-architecture.md`. Terms such as rule, plugin, preset, and shareable config are defined in `docs/references/lint-glossary.md`.

## The triage

Run these steps in order.

1. **Decide what kind of problem it catches.** A correctness, safety, or agent-failure-mode rule defaults to `error`. A style or preference rule defaults to a quieter level. A candidate that catches nothing real is dropped with a one-line reason. Severity grading follows ADR 004.
2. **Find the stack it presumes.** A stack-neutral rule joins `general`. An Effect rule joins `effect`. A rule that presumes a specific tool joins that tool's preset, which may be a new preset. Preset choice follows `docs/design-docs/preset-architecture.md`.
3. **Check whether a good tool already covers it.** When oxlint ships a native rule, enable it in config. When only an ESLint plugin covers it and the rule is structural, port it. When the check is type-aware or already well covered, recommend the existing plugin or language service. The build, port, and delegate options are defined in `docs/references/lint-glossary.md` and decided by ADR 004.
4. **Check whether it earns its own package.** A new rule stays a preset or rule inside this package until the split triggers in `docs/decisions/003-monorepo-scope-and-naming.md` apply.
5. **Record it.** Add the rule to `src/rule-manifest.ts` with its domain, gating, severity, and a note. Add tests, and for a port, attribution.

## Known candidates

The WI-14 introspection migration moved two optional hygiene candidates out of the legacy tracker and into this intake owner doc: `no-js-extension-imports` and `no-opaque-instance-fields`. Both candidates should be evaluated through the triage sequence above, using the effect-smol `@effect/oxc` implementations as reference material rather than as automatic acceptance.

## Coherence

Two rules can target the same problem. The pack resolves that overlap by routing each rule to one owner preset. Overlap never justifies dropping a useful rule. The coherence rules live in `docs/design-docs/preset-architecture.md`.

## References

- `docs/decisions/004-rule-curation-and-severity-posture.md`: curation strategy and severity policy.
- `docs/design-docs/preset-architecture.md`: preset taxonomy and coherence.
- `docs/decisions/003-monorepo-scope-and-naming.md`: when a domain earns its own package.
- `docs/references/lint-glossary.md`: rule, plugin, preset, shareable config, and the build, port, and delegate options.
