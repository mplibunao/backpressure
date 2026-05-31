# ADR 001: Effect preset posture

- Status: accepted
- Date: 2026-05-30

## Context

`@mplibunao/oxlint-standards` ports and reimplements fast AST-shape rules for Effect code. The investigation found that modern community repos are mostly on Effect v4, that `Effect.fn` / `Effect.fnUntraced` is the dominant named-method shape, and that `@effect/language-service` owns many semantic checks better than an AST linter can.

## Decision

The `effect` preset is gen-first and targets Effect v4 identifiers. It ships structural oxlint rules only. Type-aware semantics are delegated to the consumer's `@effect/language-service` setup, which this package recommends but does not bundle.

No pipe/gen split preset exists. The catalog has one opinion: `Effect.gen` is for logic. `pipe` is for combinator tails and wiring. Domain methods should use named `Effect.fn` / `Effect.fnUntraced` wrappers instead of anonymous functions that only return `Effect.gen`.

The rule pack does not depend on Rika's package. Rika may be used only as a reference for structural rule scenarios that are not covered by the language service.

## Consequences

- Effect v3 spellings are out of v0 scope unless a structural v4 rule also catches them naturally.
- Rules may overlap language-service diagnostics only when the AST rule provides useful config-free backpressure. `no-barrel-import` is the known exception.
- Effect-specific native-rule carve-outs, such as `require-yield: off` and `no-shadow: off`, stay confined to the `effect` preset so non-Effect consumers keep stricter defaults.
- `no-if-statement`, `no-effect-fn-generator`, `no-ternary`, and executor's `no-match-orelse` are not built for v0 because they conflict with the gen-first posture or real-world Match usage.
- Error-model rules must not blanket-ban `Data.TaggedError`. The v0 catalog preserves the Data-vs-Schema boundary: Schema-tagged errors are for wire contracts, while Data-tagged errors remain valid for internal errors.
