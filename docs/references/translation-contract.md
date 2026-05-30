# Translation contract

Status: current for the Item 6 substrate.

This contract defines how `@catenarycloud/linteffect` GritQL rules become `@mplibunao/oxlint-standards` oxlint JS-plugin rules. The baseline source is `@catenarycloud/linteffect` v0.0.6, which contains 50 GritQL rules. The first translated rule is `no-effect-as`.

## Rule shape

Each translated rule is an ESLint-compatible oxlint JS-plugin rule. Rules use `create(context)` only. `createOnce` is avoided because it is oxlint-specific and would narrow the escape hatch to ESLint-compatible execution.

GritQL `contains` maps to one of two ESTree shapes:

- If the source pattern maps to a node oxlint already visits, the translated rule uses the narrowest direct visitor. `no-effect-as` uses `CallExpression` because `Effect.as(value)` is a call expression.
- If the source pattern searches for a nested shape inside a larger node, the translated rule starts from the smallest reliable visitor and uses the shared descendant walker in `src/utils/ast.ts`.

When one source rule has multiple GritQL branches, the TypeScript rule should make the branches explicit as a small node-type matrix. The matrix belongs in the rule test names or rule comments when the shape needs extra context.

## Import guard

The source pack often uses a loose file-level `contains "effect"` gate. This package uses a stricter import-binding gate for Effect namespace calls.

The shared helper collects namespace imports from `effect` and `effect/Effect`, then rules match member expressions against those local names. This means `import * as Effect from "effect/Effect"; Effect.as(value)` and aliases such as `import * as E from "effect/Effect"; E.as(value)` are in scope. An unbound global named `Effect`, a local object named `Effect`, and a named barrel import such as `import { Effect } from "effect"` are out of scope for `no-effect-as`. The future `no-barrel-import` rule owns the barrel-import case.

This stricter gate is a deliberate false-positive control. It makes rules fire on a real Effect binding instead of any object named `Effect`.

## Effect v4 identifiers

Rules target Effect v4 first. v3-only spellings are out of v0 scope unless a v4 structural rule catches them naturally.

The shared identifier module is `packages/oxlint-standards/src/utils/effect-identifiers.ts`. It currently owns only identifiers used by implemented rules: Effect namespace module specifiers and the `Effect.as` value-mapping member. A future Effect rename should change that module first, not each rule.

Future category sets should be added to `effect-identifiers.ts` only when the first implemented rule needs them. Until Item 10 creates the manifest, these high-risk v4 categories are planning guidance rather than code that already exists:

- Schema: `Schema.*` in core, `check`, `refine`, array constructors such as `Union` and `Literals`, and `decodeEffect`.
- Service and Layer: `Context.Service`, `.layer`, and `Layer.effect`.
- Error: `catch`, `Result`, `Schema.TaggedErrorClass`, and `Data.TaggedError`. `Data.TaggedError` is valid v4 and must not be blanket-banned.

The Item 10 manifest owns future category assignment and severity decisions. Implemented rules should still match these names through namespace-import-bound member expressions, not through bare strings.

## Source refresh

The source baseline is v0.0.6. The source catalog still has 50 rules. The refresh changed two known rules and future ports must preserve those refinements:

- `no-model-overlay-cast` exempts `as const`.
- `no-switch-statement` reports the full `switch` statement.

## Severity policy

A rule's source severity is input evidence. ADR 004 sets the governing default by the kind of problem a rule catches, and `src/rule-manifest.ts` records the chosen default per rule. `no-effect-as` is `error` in source and stays `error` in the `effect` preset because it catches a real correctness problem. Consumer projects can override any rule in their own oxlint config.

A deliberate deviation from the source severity belongs in the manifest note, with the rationale. See `docs/decisions/004-rule-curation-and-severity-posture.md`.

## Test runtime and real engine checks

Rule-level tests use oxlint's `RuleTester` from `oxlint/plugins-dev` for parser parity. Real-engine checks are still required because `RuleTester` does not prove package loading through `jsPlugins`.

The local fixture replay script builds the package and loads `dist/index.js` through a temp `.oxlintrc.json`; it then checks real oxlint diagnostics. The packed-consumer smoke script builds the package, packs the tarball, installs it into a temp project, and verifies both the diagnostic and package allowlist.

## Alpha API pin

Oxlint JS plugins are alpha. The repo pins `oxlint` and `@oxlint/plugins` to `1.58.0` in the strict pnpm catalog, with an override only for oxlint's transitive `oxlint-tsgolint` engine package. The snapshotted API surface this substrate depends on is:

- default-exported plugin object
- `meta.name`
- `rules`
- `create(context)` visitor rules
- `context.report({ node, message | messageId })`
- `oxlint/plugins-dev` `RuleTester`
- `.oxlintrc.json` `jsPlugins`, including package specifiers and `{ name, specifier }` object entries

Do not bump the oxlint catalog casually. A bump needs the unit tests, fixture replay, and packed-consumer smoke to pass together.
