# Lint rule disposition audit

> The deep-pass mandate at the end of this audit is resolved in
> `lint-rule-disposition-resolution-2026-06-16.md`, which carries the final per-rule calls,
> the corrections an adversarial review caught, and the decisions still reserved for MP.

A full accounting of every rule the consolidation turned **off** or parked in an
**unbuilt opt-in layer**, plus the opinionated **on** decisions, so MP can decide each
against his own taste rather than the agents' defaults. Triggered by the finding that the
import-architecture rules were defaulted off and left unscheduled for the app repos.

Sources: `packages/oxlint-standards/src/configs/base.ts`, `node-runtime.ts`, `vitest.ts`,
and the deferred opt-in layers described in
`docs/exec-plans/active/lint-standards-consolidation-2026-06-15.md`.

## How to decide: base vs layer vs off

Two enable-tests, not one:

1. **Would you turn this on, by hand, on a fresh app repo of yours?** (your taste)
2. **Does it catch a slop pattern agents over-produce that you do not want?** (the reason
   this package exists). You might not set `no-continue` by hand, yet still want it policing
   generated code.

Enable a rule (in base, or the layer it belongs to) when it is correctness or safety, when
you would set it by hand, or when it catches an agent-failure-mode pattern.

**Keep it off, or out of base, if any of these hold:**

- a better tool in the pipeline already does it (`tsc`, the Effect language-service, or
  `oxfmt`); let the better tool own it (the lesson from `no-undef`);
- it is style or formatting an autoformatter owns;
- it is mostly noise: high false-positive, or you would disable it often with justification;
- it contradicts a taste you hold (you *want* the thing it bans);
- it is stack or project-type-specific (goes in a layer keyed to that type, not base);
- oxlint cannot run it yet (verify against the rule page; do not assume).

**"Needs setup or a sweep" is NOT a reason to drop a rule.** Path aliases, converting default
exports, removing barrels, decomposing functions: that is repo setup the rule earns, not
grounds to exclude it. Treating setup cost as a disqualifier is what put the architecture
rules off everywhere.

**For every rule you enable, also:**

- grade it (`rationaleClass`: correctness, safety, agent-failure-mode, or style) and set
  severity by kind, per the WI-5 manifest mechanism;
- decide it in a cluster where it interacts with neighbors (`no-continue` with `max-depth`;
  the type-import quartet), not in isolation;
- record autofixability, verified against the oxc rule page (autofixable is cheap to adopt;
  non-autofixable cosmetic is ongoing friction that needs a higher bar).

**Base-vs-layer axis:** enumerate your project types (app, library, CLI, browser, Effect,
React). A rule good across most of them is BASE; one that fits only a type is a layer keyed
to that type.

**Default direction:** base is opinionated-on by default; weakening a rule is an explicit,
visible per-repo opt-out, never a silent unbuilt layer (the failure that started this audit).

Two inputs feed the decision; neither overrides your taste. Per-project fit (above) decides
base vs layer.

Current popularity is a real quality signal when defined right: it means present mindshare
among quality-conscious devs (what the modern crowd has moved to), not cumulative install
count. By that measure oxlint and Biome are popular and eslint-config-airbnb is not, despite
its legacy install base. Recency-weighted mindshare tracks quality because that crowd churns
off bad tools fast. The deep pass starts from the modern tool's own curation, oxlint's
defaults and any recommended sets it ships plus the current rule packs, rather than
hand-assembling or copying a legacy config (the tool maintains its own curation, so you
inherit its updates). Then it filters through your project types and taste, and lets the
agent-failure-mode purpose add what the mainstream omits. Premature hype (hot for a quarter,
gone the next) does not earn a slot; taste and purpose break ties.

Legend in the tables: **BASE** = on by default; **STACK/RUNTIME** = on in the matching
layer; **DEFER** = blocked on tooling; **OFF** = correctly disabled, with reason.

## A. Base disables that look mis-defaulted (the main event)

| Rule | Now | Recommend | Why | Setup cost |
| --- | --- | --- | --- | --- |
| `import/no-cycle` | off | **BASE** | general; cycles cause init-order bugs and block tree-shaking; your hand-default | none |
| `oxc/no-barrel-file` | off | **BASE** | general; barrels break tree-shaking; your stated dislike | one carve-out for the package's own public `index.ts` |
| `import/no-default-export` | off | **BASE** + override | your by-hand default (named exports) | convert default exports; narrow override for files a tool forces to default-export, like `vite.config.ts` |
| `import/no-relative-parent-imports` | off | **BASE** | your by-hand default (feature-scoped relatives, `@/...` across features) | configure tsconfig path aliases in each repo |
| `no-undef` | off | **OFF (your veto)** | redundant on TS: the compiler reports TS2304 with better accuracy and this false-positives on runtime globals; typescript-eslint recommends off for TS. My call in WI-8, not yours | n/a |

The first four are the rules you said you would set by hand. Under the test above they are
BASE; the cost is repo setup the agents skipped, not a reason to exclude. **MP has decided:
flip all four to BASE.**

## B. Base disables that are defensible (transparency)

| Rule / group | Now | Note |
| --- | --- | --- |
| `import/no-named-export`, `import/prefer-default-export` | off | correct: these are the opposite of named-exports-only |
| `import/no-nodejs-modules` | off | correct for Node/Bun; belongs in a future `browserConfig` (stack layer) |
| `no-duplicate-imports` | off | replaced by `import/no-duplicates` with `preferInline` (the type-import fix) |
| `import/consistent-type-specifier-style` | off | intentional part of the type-import quartet |
| `import/exports-last`, `import/group-exports` | off | low-value ordering; your call if you want them |
| `no-continue` | off | carried from the live config. MP does not write `continue` and reads it as an LLM-ism, so this is a candidate to ENABLE graded `agent-failure-mode` (push generated code toward his style). It composes with `max-depth`/`complexity` to force restructuring (filter-first, extract a helper) rather than nesting, closing both escape hatches. Lean enable in the deep pass |
| `no-ternary` | off | carried from the live config; separate taste call, not yet weighed. Resolve in the deep pass |
| `sort-keys` | dropped | the plan's "not safely autofixable" was wrong: the oxc docs list a partial auto-fix (some violations). The real question is taste, alphabetical vs semantic key order (id/name/related fields, config grouped by concern), which is yours. Re-evaluate in the deep pass |
| `sort-imports` | off | partially autofixable: oxlint fixes member order within a line (14 of 97 in backpressure) but not cross-statement reordering or Multiple-before-Single (the other 83), leaving ongoing manual friction for a cosmetic-only gain. Re-evaluate in the deep pass |
| `nursery` category | off | experimental rules; reasonable to keep off |
| `pedantic` category | off | nitpick tier; worth one scan to see if any belong on |
| `style` category | off | binary error/off posture (ADR-004): specific style rules pulled to error via the WI-5 allowlist, the rest off. Worth confirming nothing you want is in the off remainder |

## C. unicorn: 1 of ~120 rules on (the biggest dodge)

`nodeRuntimeConfig` enables only `unicorn/prefer-node-protocol` and silences ~120 others to
stop category bleed. That silencing was blast-radius control, not a per-rule judgment. Three
buckets:

- **Correctly off (browser/DOM, you are not in that stack):** the `prefer-dom-node-*`,
  `prefer-query-selector`, `no-document-cookie`, `prefer-add-event-listener`,
  `prefer-keyboard-event-key`, `prefer-classlist-toggle`, `relative-url-style`,
  `require-post-message-target-origin`, `no-invalid-fetch-options` family. These move to a
  future `browserConfig` if you ever do browser work.
- **Candidates to enable (general JS quality, off only to dodge the sweep):**
  `throw-new-error`, `error-message`, `new-for-builtins`, `no-instanceof-builtins`,
  `prefer-string-slice`, `prefer-string-starts-ends-with`, `prefer-includes`,
  `prefer-set-has`, `prefer-array-find`/`-some`/`-flat-map`, `prefer-optional-catch-binding`,
  `prefer-native-coercion-functions`, `prefer-number-properties`, `prefer-date-now`,
  `prefer-regexp-test`, `prefer-structured-clone`, `no-useless-*` (several),
  `no-unnecessary-await`, `consistent-function-scoping`, `custom-error-definition`,
  `prefer-modern-math-apis`. These match a modern, clean JS taste and deserve a real pass.
- **Style/preference (your call):** `no-null`, `prefer-ternary`,
  `prefer-logical-operator-over-ternary`, `numeric-separators-style`, `number-literal-case`,
  `switch-case-braces`, `filename-case`. Opinionated; some you may reject.

Recommendation: this needs a dedicated pass to pull the general-quality bucket on (likely a
real `unicornConfig` that composes into base, or fold the agreed set into base directly).

## D. vitest / jest: 15 on, ~20 vitest off

On (test scope): 4 vitest hygiene (`hoisted-apis-on-top`, `no-conditional-tests`,
`require-awaited-expect-poll`, `warn-todo`) plus all 11 jest-namespaced hygiene rules.

- **Candidates among the off:** `consistent-test-filename`, `no-import-node-test`,
  `prefer-to-be-falsy`/`-truthy`/`-object`, `prefer-strict-boolean-matchers`,
  `prefer-expect-type-of`. Reasonable test hygiene you may want.
- **Correctly off (documented conflicts):** `require-test-timeout` (clashes with the
  `vi.setConfig({ testTimeout })` pattern), `no-importing-vitest-globals` (repo uses explicit
  imports).
- **Style/preference (your call):** `prefer-called-once`/`-times`/`-exactly-once-with`,
  `prefer-describe-function-title`, `consistent-vitest-vi`, `consistent-each-for`.

Less egregious than unicorn (hygiene was curated), but the candidates bucket is worth a
glance.

## E. Deferred opt-in layers: do they belong as layers, or in base?

Re-evaluating each parked layer against the test above:

| Layer | Contents | Verdict |
| --- | --- | --- |
| `architectureConfig` | `no-cycle`, `no-relative-parent-imports`, `no-barrel-file` | **collapses into BASE** (section A): general taste, not stack-specific. The layer mostly should not exist |
| `namedExportsConfig` | `no-default-export` plus config overrides | **collapses into BASE** plus a narrow override. Not a separate opt-in |
| `jsdocConfig` | contract-JSDoc on public surfaces, types off | **DECIDED: fold into BASE** (MP wants it generally). Open: scope (all public surfaces vs exported only) |
| `explicitApiConfig` | `explicit-function-return-type` | **DECIDED: on by default in BASE**. Open: the variant/scope. Cracked teams usually scope it to module boundaries (`explicit-module-boundary-types`) or use `allowExpressions` so inline callbacks are exempt, rather than every function. Verify which oxlint supports |
| `reactConfig` / `jsxA11yConfig` / `reactPerfConfig` | React rules | **STACK**, correct as a layer: only relevant in React repos, keep separate. Also has the `react` naming collision to resolve first |
| type-aware async (`no-floating-promises` et al.) | needs oxlint type-aware | **DEFER**, correct: blocked on verifying oxlint type-aware works at the pinned version. The only tooling-gated set |
| `bunConfig` vs `browserConfig` | `import/no-nodejs-modules` split | **RUNTIME**, correct as a layer: runtime-specific |

Conclusion: the truly separate layers are the **stack** ones (React, Effect, already a
preset), the **runtime** ones (Node, browser), and the **tooling-gated** one (type-aware).
The architecture and named-exports layers are not real separation; they are good general
rules that should default on. `jsdoc` and explicit-return-types are now decided on (fold into
base); only their exact scope stays open.

## Decided by MP

- **Section A:** flip all four import rules to BASE (with the repo setup: path aliases,
  named-export conversion, barrel removal, one config-file override for mandatory defaults).
- **`jsdocConfig`:** fold into BASE (contract-JSDoc, types off). Wanted generally.
- **`explicit-function-return-type`:** on by default in BASE. Open sub-question: the exact
  variant/scope (section E).
- **Sequencing:** the rule re-evaluation runs as a separate deep pass (mandate below). The
  changeset step waits until after it, so the changeset captures the final config rather than a
  state we are about to change.

## Mandate for the deep pass

Take this audit and decide each remaining rule's home, grounded in evidence, not vibes:

1. For every rule in the OFF and candidate buckets (section B remainder, section C unicorn,
   section D vitest) and the deferred layers (section E), apply the test above and place it:
   fold into BASE, put in a stack or runtime layer, or drop.
2. Cross-check against what mature, serious TS teams actually enable (research the common
   strict-but-sane rule sets), and against fit per project type (app vs library vs CLI vs
   browser), so BASE encodes a defensible default and the layers carry the rest.
3. Resolve the open scoping calls: `explicit-function-return-type` (all functions vs module
   boundaries via `explicit-module-boundary-types` vs `allowExpressions` for inline
   callbacks; verify which oxlint supports), `jsdoc` scope (all public surfaces vs exported
   only), and the unicorn general-quality set.
4. Re-evaluate `sort-imports`: partially autofixable (member order within a line),
   but the cross-statement reordering is not, so it is ongoing manual friction for a
   cosmetic-only gain. Keep with that friction, drop, or wait for an autofixable
   `import/order` to land in oxlint.
5. `no-undef`: confirm keep-off (redundant with the TS compiler) or restore.
6. Produce the updated base plus layers, re-dogfood backpressure, then pin the changeset
   against the final state.

**Verify autofix claims against the oxc docs.** The plan's "autofixable / not autofixable"
wording was inherited from ESLint, not checked against oxlint. MP found the oxc rule pages
list partial auto-fixes ("for some violations") for both `sort-imports` and `sort-keys`,
contradicting the plan. Before relying on any autofix claim, read the rule's page at
`oxc.rs/docs/guide/usage/linter/rules/...` and confirm. Do not carry ESLint assumptions.
