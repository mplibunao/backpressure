# Lint architecture glossary

The vocabulary for how this repo's lint tooling is layered. ESLint and oxlint
share the same model, so the terms apply to both. This doc names the layers once
so the design docs and the agents stop re-deriving them.

Scope is lint tooling only. The broader `backpressure` charter covers other
products (tsconfig presets, future guardrail CLIs), and those keep their own
vocabulary near their own docs rather than here.

The summary: `rule` is the atom, `plugin` is how rules are delivered, `preset`
decides which rules are on, and a `shareable config` is curation packaged as its
own cross-plugin product. Plugin and preset are orthogonal axes, not two rungs of
one ladder.

## The three axes

| Axis | What it is | What you author here | In this repo |
|---|---|---|---|
| Rule | One check: an AST visitor that calls `context.report` on a bad shape. | A single check. | Each file under `src/rules/`, such as `no-effect-as`. |
| Plugin | A namespaced container that bundles rules. It delivers rules; it does not decide which are on. | A bag of rules (or you depend on someone else's). | The default export with `meta.name: "@mplibunao/oxlint-standards"` and `rules`. |
| Preset / config | A named selection of rules with severities and options. The consumer's unit of opt-in. | A curated selection of rules. | `effect`, `effect-react`, `general`, `boundaries` under `src/presets/`. |

A plugin is the delivery axis and a preset is the curation axis. They are
orthogonal. A plugin can ship presets. A preset references the rules a plugin
delivers. Neither is a level of the other. They usually ride in the same package,
which makes them look stacked.

The words `config`, `preset`, `shareable config`, and `recommended` all sit on the
curation axis. ESLint's formal term is `configuration`. `preset` is the informal
word for a named, ready-made one. Do not over-read the synonyms.

## Shareable config: curation as its own package

A shareable config is the same curation axis as a preset, with two differences:
it ships as a standalone package, and it curates rules across many plugins rather
than one plugin's own rules. `eslint-config-airbnb` is the canonical example. It
pulls in several plugins and enables a chosen selection across all of them. The
`eslint-config-*` prefix is the ecosystem signal that a package's job is curation,
not rules.

This is the layer a cross-stack standards product lives on. The investigation
already framed the goal this way: a shareable config that assembles best-of-breed
plugins, plus one small plugin for the axis nobody else covers. See
`docs/investigations/effect-linting-rules-port-target-2026-05-29.md`.

## Repo, package, and lint role

These three get conflated often. Keep them separate.

- **`backpressure`** is the monorepo. It is a house that publishes packages, not a
  lint concept. It can hold one plugin, several plugins, tsconfig presets, or a CLI.
- **`@mplibunao/oxlint-standards`** is a package that plays two lint roles at once.
  It is a plugin (it ships rules) and it ships presets (it curates them). That dual
  role is why plugin and preset feel stacked in practice.
- A cross-stack **shareable config** (say, an Effect plus Drizzle plus TanStack
  plus Next posture) is a package this repo does not have yet. It becomes a new
  package in the monorepo when a split is justified, following ADR 003: split a
  domain into its own package only when it needs independent cadence or heavy
  dependencies.

## Overlap has two owners

Overlap resolution happens at two different layers, and conflating them is a common
trap.

- **Intra-preset overlap** is the plugin author's job. When two of your own rules
  target the same shape, enable exactly one in the preset and record which owns the
  intent. The manifest already does this: `no-call-tower` is disabled because
  `no-effect-call-in-effect-arg` owns the shallow nested-call intent, and
  `no-nested-effect-call` is disabled because `no-effect-ladder` owns the deep one.
- **Cross-plugin conflict** is the shareable config's job. When a rule from one
  plugin fights a rule from another, the config turns the loser off. This is the
  pattern `eslint-config-prettier` exists for. Because each plugin is authored in
  isolation, authors never have to make their plugins globally non-overlapping. The
  config layer reconciles them.

Conceptual overlap, where many rules push toward one philosophy such as gen-first
Effect, is coherence rather than a defect. The goal is no double-firing inside an
enabled preset, never zero overlap across the catalog.

## Adding a new stack: native, author, or delegate

oxlint cannot host arbitrary third-party ESLint plugins, because `jsPlugins` is
alpha and narrow. Adding a stack splits three ways, and the right branch depends
on whether oxlint already covers it. The default should be the cheapest branch
that fits, not reimplementation.

- **Native.** oxlint ports many popular rule sets natively, including Next.js and
  React hooks. For these the shareable config enables and tunes oxlint's built-in
  rules, with nothing extra to install or write.
- **Author.** For an opinion no one ships and that oxlint does not cover natively
  (the Effect rules here, or a niche library), author a jsPlugin. It can start as a
  preset inside `oxlint-standards` and graduate to its own package when it needs to.
- **Delegate.** For a stack oxlint does not cover where a good ESLint plugin or
  language-service already exists (TanStack Query, Drizzle, type-aware Effect
  semantics), recommend that the consumer run it. Delegating to an ESLint plugin
  does not mean the maintainer switches to ESLint. oxlint stays the front door, and
  ESLint is the documented escape hatch per ADR 001.

A cross-stack shareable config ends up a mix of "enable native oxlint rules,"
"enable my jsPlugin rules," and "go install these plugins or language services I
cannot host." That mixed shape is the realistic product, rather than a single
plugin that owns every stack.

## oxlint vocabulary notes

- oxlint has **native rules** built into the binary, such as `no-nested-ternary`,
  and **jsPlugin rules** loaded through `jsPlugins`, such as this package's rules.
  Same model as ESLint, with two sources of rules.
- For v0, presets are exposed as named exports from the main package entry (`.`),
  such as `effectPreset` imported from `"@mplibunao/oxlint-standards"`. No subpath
  imports. Preset names are the public API contract.
- Consumers configure a standalone `.oxlintrc.json` so oxlint discovers the plugin
  itself. Inline resolution through vite-plus config is not yet proven.

## References

- `docs/design-docs/preset-architecture.md`: preset taxonomy and consumer-safety.
- `docs/design-docs/rule-pack-architecture.md`: rule-source model and the jsPlugins
  substrate.
- `docs/decisions/001-effect-preset-posture.md`: gen-first, Branch B, carve-out
  confinement.
- `docs/investigations/effect-linting-rules-port-target-2026-05-29.md`: the
  shareable-config strategy.
