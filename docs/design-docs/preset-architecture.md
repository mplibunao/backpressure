# Preset architecture & consumer-safety

Status: accepted (2026-05-30) · Authored ahead of build because it carries settled
decisions that Items 5/10/14/15 of the setup plan depend on.
[ADR-007](../decisions/007-tsgo-delegation-and-overlap.md) owns the Effect preset's `@effect/tsgo` delegation.

## Purpose

How `@mplibunao/oxlint-standards` groups rules into presets, and how we keep a rule
from firing in a project it was never meant for. This is the authoritative
preset-taxonomy and consumer-safety reference; `rule-pack-architecture.md` (rule
sources + jsPlugins substrate) points here rather than restating it.

## Principle: the preset axis is stack coupling, not file type

A preset is the consumer's unit of opt-in and part of our public API. For v0, the
public API is the named-export contract from the main package entry (`.`): consumers
import `effectPreset`, `generalPreset`, etc. from `"@mplibunao/oxlint-standards"`.
No subpath imports. Preset names are public API; renaming after publish is breaking.
The axis that keeps presets coherent is
**which stack a rule presumes**, not which file type it inspects.

"React" is a file-type axis, and it is the wrong one: our React rules presume Effect
and its Atom modules, so naming the preset `react` would silently hand Effect opinions to
any React project. The same trap exists for any rule whose name reads generic but
whose opinion is stack-specific.

This is the same split D2 / ADR-001 already made for `general` vs `effect` (Effect
carve-outs like `require-yield: off` are confined to `effect` so `general` stays
stack-neutral). This doc applies that principle to the rest of the catalog.

## Taxonomy (v0)

| Preset | Presumes | Holds | Notes |
|---|---|---|---|
| `effect` | Effect (gen-first) | Composition-shape + structural Effect rules, plus every `@effect/tsgo` check at a pinned severity | The core opinion, with carve-outs confined here. A full config: it carries the `effecttsgo` plugin, the type-aware option, and a test-file override, and it requires the patched-oxlint route. |
| `effect-react` | Effect and its Atom modules in React | Atom/state/render rules (`no-react-state`, `no-render-side-effects`, `no-atom-registry-effect-sync`) | Effect's opinion extended into React. |
| `general` | Nothing (stack-neutral) | Universal TS/JS hygiene (`no-double-cast`, `no-ts-nocheck`, `no-nested-ternary`, `prevent-dynamic-imports`) | Safe for any project, Effect or not. |
| `boundaries` | Monorepo layout | Cross-package/layer import rules (`no-cross-package-relative-imports`) | Architecture rules that are not stack rules. |
| `react` *(reserved)* | Nothing (general React) | Not created in v0. | Reserved name for future stack-neutral React rules such as rules-of-hooks. |

Future stack presets (`drizzle`, `bun`, `sql`, `next`, …) follow the same rule: a new
preset per stack, never folded into `general` or `effect`.

## Mutually exclusive presets

Some presets encode contradictory philosophies and must never be enabled together.
The docs state this explicitly so a consumer cannot assemble a self-contradictory
rule set:

- **`effect-react` owns the React state-hook ban** (`no-react-state` means "use atoms").
  A future general **`react`** preset would *regulate* those same hooks
  such as exhaustive-deps. Enabling both means one rule forbids a hook the other
  polices. They target different audiences (atom-first vs hooks-first) by design.

Import-gating prevents *false positives* (a gated rule self-silences with no Effect
import) but it does NOT prevent this kind of incoherence. That is a taxonomy
decision made here.

## Consumer-safety: the gating audit

A rule bites a consumer when it fires in a project that did not opt into its stack.
Every rule is classified on one axis:

- **import-gated**: in the source GritQL, wrapped in `file($body) where { $body <: contains "effect" / "@effect-atom" }`. Self-silences without the import. Safe at the source-audit level; the implemented gate may be stricter if Item 6 chooses real import-binding instead of the loose text/subtree `contains` gate.
- **distinctive-callee**: no import gate, but matches an unambiguous Effect identifier (`Effect.as`, `Effect.all` + side-effect contents). False positives outside Effect are near-zero. Low risk, but formally relies on callee-name matching. See the Item 6 import-guard decision when reimplementing.
- **ungated / broad-firing**: no gate, matches a generic construct. Fires anywhere. This is the bite risk.

### Findings (50 linteffect rules, audited 2026-05-30)

This audit is historical: it classified the source rules as they stood on 2026-05-30. The Effect v4 alignment later dropped `no-family-collection-read` and `no-effect-as`, and the implemented gate recognizes the v4 Atom packages (`@effect/atom-react`, `@effect/atom-solid`, and `@effect/atom-vue`) instead of `@effect-atom`.

- **45 / 50** are import-gated on `"effect"` in the source GritQL. Safe for taxonomy purposes; realized gate strength follows the Item 6 import-guard decision.
- **`no-family-collection-read`** gates on `@effect-atom`. Safe in non-atom projects.
- **`no-effect-as`, `no-effect-all-step-sequencing`** are distinctive-callee. Low risk.
- **Two ungated/broad-firing rules** are the bite risks:
  - **`no-react-state`** bans `useState`/`useReducer`/`useContext`/`useCallback`/`useEffect`/`useSyncExternalStore` on any file. Resolved: it belongs in **`effect-react`**, and the broad ungated ban is the intended shape for that preset. PA-3 later narrowed it to five hooks.
  - **`prevent-dynamic-imports`** matches any `import()` with a generic "keep dependencies explicit" message. This is a **stack-neutral general-JS opinion, not Effect**. Resolved: it moves to **`general`**, where banning `import()` and code-splitting is a strong opt-in opinion the consumer chooses knowingly. It is not silently bundled with the Effect rules.

### Method (how this stays enforced)

The exhaustive, per-rule application of this audit lives in **Item 10's machine-checkable
manifest**, which carries a `consumer-safety/gating` field for every rule (incl. the
executor reimplements and recon additions, not just the linteffect set). This doc owns
the principle and the known findings; the manifest owns the per-rule disposition. The
audit question for any new rule: *is its matcher a distinctive stack identifier (safe) or
a common construct (needs an import gate, or a stack-neutral preset)?*

## Decisions

- **PA-1: Stack-coupling axis.** Presets group by presumed stack, not file type.
- **PA-2: `effect-react` split.** Effect/atom-in-React rules ship in `effect-react`, not a generic `react`. The unqualified `react` name is reserved for future stack-neutral React rules. This decision happens before publish because preset names are public API; renaming after publish is breaking.
- **PA-3: `no-react-state` bans five hooks and allows `useState`.** It bans `useEffect`, `useReducer`, `useContext`, `useCallback`, and `useSyncExternalStore`, in line with the React team's "You Might Not Need an Effect" direction. Atoms hold shared and server state, and atom-react's `ScopedAtom` replaces context: it subscribes per atom instead of re-rendering every context consumer. `useState` stays allowed for state local to one component, because per-instance state has no clean atom equivalent. The rule cannot tell whether a `useState` value is shared; the house-style instructions carry that limit. It stays ungated because it runs only where `effect-react` is enabled, and it is an opinion of `effect-react`, not a general rule. Amended 2026-09-26 from a six-hook ban by the [Effect v4 alignment](../exec-plans/completed/effect-rules-v4-alignment-2026-09-25.md).
- **PA-4: `prevent-dynamic-imports` moves to `general`.** Reclassified out of the Effect rule set; it is a stack-neutral general-JS opinion. Enabled by default in `general` as deliberate backpressure toward explicit imports; per-rule overridable by setting it to `off`. It bans ALL `import()`, not only perf-motivated lazy loading, so disable it when adopting code-splitting and measuring perf. CDP or Lighthouse can capture Web Vitals, but the app needs to run under a representative workload.
- **PA-5: Mutually exclusive presets are documented.** Item 15's preset docs state which presets must not be enabled together, such as `effect-react` versus a future general `react`.

## Future work

- A stack-neutral **`react`** preset (rules-of-hooks, exhaustive-deps, jsx-key, an anti-`useEffect` rule recommending TanStack/RSC). Evaluate **react.doctor** (https://www.react.doctor/) as a rule source and, Branch-B-style, a React diagnostics layer to recommend rather than reimplement. Details live in the tech-debt tracker. Out of v0.
- Per-rule `consumer-safety/gating` audit completed for the executor reimplements and recon additions as the manifest is built (Item 10).

## References

- Completed setup plan: `docs/exec-plans/completed/backpressure-monorepo-setup-2026-05-29.md` (Items 5, 10, 14, 15).
- ADR-001 `effect-preset-posture.md` (gen-first, Branch B, carve-out confinement).
- `rule-pack-architecture.md` (rule sources + jsPlugins substrate; defers here for taxonomy).
