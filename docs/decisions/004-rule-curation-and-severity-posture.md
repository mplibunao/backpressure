# ADR 004: Rule curation and severity posture

- Status: accepted
- Date: 2026-05-31

## Context

The package started as Effect rules and is growing into MP's cross-project backpressure pack. Over time it will gather rules from many sources, including ports of existing packs and reimplementations of ideas seen elsewhere. Two questions recur for every candidate. The first is what the package builds itself versus what it borrows from existing tools. The second is how loud each rule should be by default.

ADR 001 already settled one case of the first question for Effect: type-aware Effect semantics are delegated to `@effect/language-service` rather than reimplemented. This ADR generalizes that posture to every stack and settles the severity default.

A first pass set every rule to `error`. In practice that read as noise and left no room for an agent to exercise judgement.

## Decision

**Curation.** The package builds rules that no good tool ships. When oxlint has no native equivalent and a needed rule exists only as an ESLint plugin, the package ports the structural (AST-only) version into an oxlint JS plugin. Everything else is delegated: native oxlint rules are enabled in config, and type-aware or already-covered checks are recommended through an existing plugin or a language service. The package allows stylistic and preference rules, alongside correctness rules.

**Severity is graded by the kind of problem a rule catches.** Correctness, safety, and agent-failure-mode rules default to `error`. Style and preference rules default to a quieter level. A rule's source severity is input evidence; this ADR sets the governing default, and `src/rule-manifest.ts` records the chosen default per rule.

**ESLint-only port limits.** A type-aware rule cannot become a JS plugin, because JS plugins have no type information; such a rule stays delegated to a language service. Ported logic keeps the upstream license with attribution, and a large or fast-moving plugin is recommended to consumers rather than copied.

**Alternatives considered.** All-error gives the strongest push against an agent that skips warnings. It also removes judgement and trains readers to ignore the whole gate. The package rejects it for that cost. A graded default plus an optional strict (all-error) variant stays a future option rather than a v0 commitment.

## Consequences

- Positive: the package scales across stacks without reimplementing the ecosystem; the `error` signal stays worth acting on; the curation posture matches ADR 001's delegation stance.
- Negative: a `warn` rule can be skipped by some agents (Claude today more than Codex); a graded catalog needs a per-rule judgement on every addition; ported rules carry attribution and maintenance cost.
- Follow-up: `docs/design-docs/rule-intake.md` holds the step-by-step triage; `docs/references/translation-contract.md` defers its severity policy to this ADR; the package README documents the consumer-facing severity note; an optional strict preset variant is revisited only if consumers ask.
