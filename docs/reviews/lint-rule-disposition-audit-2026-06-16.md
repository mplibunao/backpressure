# Lint rule disposition audit

A full accounting of every rule the consolidation turned **off** or parked in an
**unbuilt opt-in layer**, plus the opinionated **on** decisions, so MP can decide each
against his own taste rather than the agents' defaults. Triggered by the finding that the
import-architecture rules were defaulted off and left unscheduled for the app repos.

Sources: `packages/oxlint-standards/src/configs/base.ts`, `node-runtime.ts`, `vitest.ts`,
and the deferred layers described in
`docs/exec-plans/active/lint-standards-consolidation-2026-06-15.md` (WI-18 to WI-21).

## How to decide: base vs layer vs off

The one question for every rule:

> **Would you turn this on, by hand, on a fresh app repo of yours?**

If yes, it belongs **on by default** (in base, or in a layer your repos always compose).
Only **two** reasons validly keep a good rule out of the default:

1. **Stack-specific:** it only means something in a stack you are not always in (React,
   Effect, browser/DOM, Node-only APIs). Those live in a stack or runtime layer that applies
   when you are in that stack. This is real separation.
2. **Tooling not ready:** the rule is not verified to run in oxlint at the pinned version
   (the type-aware family). Defer until verified.

**"Needs setup or a sweep" is NOT a valid reason.** Path aliases, converting default
exports, removing barrels, decomposing functions: that is work the repo setup should do to
match the rule, not grounds to drop the rule. Treating setup cost as a disqualifier is the
exact failure that put the architecture rules off everywhere.

A rule is correctly **off** only when: it is redundant with another check already running
(the TypeScript compiler), it contradicts a taste you hold (you *want* the thing
it bans), or it is for a stack you are not in.

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
BASE; the cost is repo setup the agents skipped, not a reason to exclude.

## B. Base disables that are defensible (transparency)

| Rule / group | Now | Note |
| --- | --- | --- |
| `import/no-named-export`, `import/prefer-default-export` | off | correct: these are the opposite of named-exports-only |
| `import/no-nodejs-modules` | off | correct for Node/Bun; belongs in a future `browserConfig` (stack layer) |
| `no-duplicate-imports` | off | replaced by `import/no-duplicates` with `preferInline` (the type-import fix) |
| `import/consistent-type-specifier-style` | off | intentional part of the type-import quartet |
| `import/exports-last`, `import/group-exports` | off | low-value ordering; your call if you want them |
| `no-continue`, `no-ternary` | off | style preference; flag if you want either |
| `sort-keys` | dropped | data and golden objects read best by meaning, not A to Z; churns |
| `sort-imports` | off | your decision this session: not autofixable across statements in oxlint |
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

| Layer (plan WI) | Contents | Verdict |
| --- | --- | --- |
| `architectureConfig` (WI-19) | `no-cycle`, `no-relative-parent-imports`, `no-barrel-file` | **collapses into BASE** (section A): general taste, not stack-specific. The layer mostly should not exist |
| `namedExportsConfig` (WI-19) | `no-default-export` plus config overrides | **collapses into BASE** plus a narrow override. Not a separate opt-in |
| `jsdocConfig` (WI-18) | contract-JSDoc on public surfaces, types off | **your taste call**, not mine to bucket. If you always want enforced contract docs it is BASE; if situational, a layer. Open question |
| `explicitApiConfig` (WI-20) | scoped `explicit-function-return-type` | **your taste call**: if you want explicit return types on public API by default, BASE; otherwise a layer. Open question |
| `reactConfig` / `jsxA11yConfig` / `reactPerfConfig` (WI-20) | React rules | **STACK**, correct as a layer: only relevant in React repos, keep separate. Also has the `react` naming collision to resolve first |
| type-aware async (`no-floating-promises` et al.) (WI-21) | needs oxlint type-aware | **DEFER**, correct: blocked on verifying oxlint type-aware works at the pinned version. The only tooling-gated set |
| `bunConfig` vs `browserConfig` (WI-21) | `import/no-nodejs-modules` split | **RUNTIME**, correct as a layer: runtime-specific |

Conclusion: the truly separate layers are the **stack** ones (React, Effect, already a
preset), the **runtime** ones (Node, browser), and the **tooling-gated** one (type-aware).
The architecture and named-exports layers are not real separation; they are good general
rules that should default on. `jsdoc` and `explicitApi` are open taste calls for you.

## Open decisions for MP

1. Flip the four section-A rules to BASE (and do the repo setup: aliases, named-export
   conversion, barrel removal, one config-file override). Confirm.
2. unicorn: approve a pass to enable the general-quality bucket (section C).
3. vitest: approve the candidate hygiene rules (section D), or leave as is.
4. `no-undef`: keep off (TS-redundant) or restore. Your veto.
5. `jsdocConfig` and `explicitApiConfig`: base-on, situational layer, or drop (your taste).
6. Sequencing: do these change `base.ts` now (re-dogfood backpressure) or land as a tracked
   Phase-3 amendment after WI-10 closes this run.
