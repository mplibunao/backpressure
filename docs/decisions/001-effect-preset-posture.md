# ADR 001: Effect preset posture

- Status: accepted
- Date: 2026-05-30

## Context

`@mplibunao/oxlint-standards` will port and reimplement fast AST-shape rules for Effect code. The investigation found that modern community repos are already mostly on Effect v4, that `Effect.fn` / `Effect.fnUntraced` is the dominant named-method shape, and that `@effect/language-service` owns many semantic checks better than an AST linter can.

## Decision

The `effect` preset is gen-first and targets Effect v4 identifiers. It ships structural oxlint rules only. Type-aware semantics are delegated to the consumer's `@effect/language-service` setup, which this package recommends but does not bundle.

The rule pack does not depend on Rika's package. Rika may be used only as a reference for structural rule scenarios that are not covered by the language service.

## Consequences

- Effect v3 spellings are out of v0 scope unless a structural v4 rule also catches them naturally.
- Rules may overlap language-service diagnostics only when the AST rule provides useful config-free backpressure. `no-barrel-import` is the known exception.
- Effect-specific native-rule carve-outs, such as `require-yield: off` and `no-shadow: off`, stay confined to the `effect` preset so non-Effect consumers keep stricter defaults.

