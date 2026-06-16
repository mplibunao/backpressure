# Lint rule deep-pass resolution

Resolves the mandate in `lint-rule-disposition-audit-2026-06-16.md` and answers the
three questions MP posed: should more rules be enabled, should rules fold into base, and
should any existing preset fold into base. Each call is grounded in the oxc rule pages and
checked by an adversarial reviewer, not asserted from ESLint habit.

The audit stays the brief (the rubric and MP's settled taste live there). This doc is the
decision record. It does not change `base.ts` yet; several calls below still need MP's
taste input, and editing the config is the step that follows.

Method: a workflow gathered evidence (oxlint's own curation, what modern strict-TS teams
enable, and per-rule autofix/category/option facts from `oxc.rs`), produced a graded
disposition per bucket, then ran a skeptic over every recommendation to refute weak
enables. The skeptic caught four factual defects and one incomplete plan; those corrections
are folded in below rather than carried forward.

## The insight that reframes half the questions: category bleed

oxlint activates rules by category at a severity. Setting `restriction: 'error'` with a
plugin enabled turns on every restriction rule of that plugin, listed or not; an entry in
`rules` only overrides that category default. `base.ts` runs `correctness`, `suspicious`,
and `restriction` at error. Three consequences govern the rest of this doc.

1. **Some rules MP thought were off are already on.** Three rules slated as "decide whether
   to enable" are active today through the category sweep: `typescript/no-misused-new`
   (correctness), `typescript/no-confusing-non-null-assertion` (suspicious), and
   `@typescript-eslint/explicit-module-boundary-types` (restriction). The work for these is
   to make them visible and intentional, not to flip them on.

2. **Adding a plugin silently enables its correctness and restriction rules.** Turning on
   the `jsdoc` or a future `react` plugin auto-activates that plugin's rules in the active
   categories. The pack's established discipline handles this: silence the whole plugin
   exhaustively, re-enable a vetted set by name, and lock it with a `drift-guards.test.ts`
   assertion. `node-runtime.ts` (unicorn) and `vitest.ts` already follow this pattern. Any
   new plugin must too, or it repeats the silent-unbuilt-layer failure the audit warned
   about.

3. **"Enable" means two different edits.** For a rule in `correctness`, `suspicious`, or
   `restriction`, enabling means removing its line from the silence list. For a rule in
   `pedantic`, `style`, or `perf` (all off), enabling means adding an explicit entry.

## Question 3 first: should any existing preset fold into base?

No. `effectPreset`, `effectReactPreset`, and `boundariesPreset` stay separate stack presets,
and the verification was conclusive. The custom rules self-gate inside their own bodies (a
rule returns early unless the file imports from `effect`, from `@effect-atom/atom-react`, or
crosses a workspace package boundary), so a preset's severity entry only toggles whether an
already-stack-scoped rule reports. The custom plugin is already loaded in base through
`generalPreset.jsPlugins`, so there is no plugin-activation reason to fold. Folding would
attach Effect and React severity entries to every non-Effect repo's effective config and
pollute the manifest's domain partition, even though the rule bodies no-op off-stack.

The mis-homing audit the mandate asked for came back clean. The five `general`-domain custom
rules (`prevent-dynamic-imports`, `no-redundant-primitive-cast`, `no-double-cast`,
`no-ts-nocheck`, and the built-in `no-nested-ternary`) are stack-neutral and correctly in
base. The two broad-looking custom rules are correctly stack-homed: `no-barrel-import` is
hard-scoped to imports from the `effect` package, and `no-react-state` is atom-react shaped.
Nothing general is stranded in a stack preset.

## Questions 1 and 2: what to enable, what to fold into base

### Base disables (section A is decided; mechanics and the rest resolved)

The four import rules MP decided are confirmed BASE. None are autofixable. All four are
restriction-category and currently pinned off, so the change is flipping the explicit `off`
to `error` and adding the noted carve-outs.

| Rule | Recommendation | Class | Mechanics and setup |
| --- | --- | --- | --- |
| `import/no-cycle` | BASE / error | safety | Defaults are Effect-friendly (`ignoreTypes: true`). Hard sequencing constraint: clear pre-existing cycles with a `dpdm`/`madge` sweep in the same change that flips it, or CI breaks. The most expensive rule at lint time. |
| `oxc/no-barrel-file` | BASE / error | agent-failure-mode | Add an override setting it off for the package's own public entrypoint (`**/src/index.ts`). Default threshold is 100 re-exports, so it rarely fires in practice; the override is cheap insurance. Distinct from the custom `no-barrel-import` (which bans value imports from `effect`). |
| `import/no-default-export` | BASE + override | agent-failure-mode | No native allowlist, so exceptions are file-glob overrides only. Override `**/*.config.*` (vite/vitest/stryker configs default-export). Keep React/Next entrypoint globs out of base; they belong in a React layer. |
| `import/no-relative-parent-imports` | BASE / error | maintainability | Configure tsconfig `@/*` path aliases in the same change, or it fires repo-wide and reads as noise. The alias setup is the repo work the rule earns. |

Resolved leftovers:

| Rule | Recommendation | Why |
| --- | --- | --- |
| `no-continue` | BASE / error, agent-failure-mode | Confirmed enable. MP reads `continue` as an LLM-ism. It composes with the depth and complexity ceilings. Banning a guard-`continue` inverts the `if` and raises nesting, so the resolution the ceilings want is extracting the loop body, the restructuring the pack exists to force. Same family as `no-else-return`, already on. Occasional friction on flat hot loops resolves via a per-line opt-out with justification. |
| `no-ternary` | OFF (MP's taste call) | The two slop forms are already banned by `no-nested-ternary` and `no-unneeded-ternary`. A flat ternary is idiomatic and sits in no mainstream config; banning it fights JSX. Recommend off unless MP personally never writes flat ternaries. |
| `sort-imports` | DROP | Confirmed. Autofix covers only member order within a single statement; cross-statement ordering is diagnostic-only, oxfmt does not sort imports, and oxlint has no `import/order`. Permanent manual churn for a cosmetic gain. |
| `sort-keys` | OFF | Same partial-autofix story; cosmetic key order with no correctness or agent-slop signal, and it fights intentionally ordered config objects. |
| `import/consistent-type-specifier-style` | OFF | Would contradict the active `consistent-type-imports` `fixStyle: 'inline-type-imports'`. The type-import trio is already coherent; the fourth member breaks it. |
| `no-duplicate-imports` | OFF | `import/no-duplicates` with `preferInline: true` is the type-aware superior version and is on; the core rule would double-report. |
| `import/exports-last`, `import/group-exports` | OFF | Low-value layout ordering with no correctness angle; fight co-located named exports that pair with the no-default-export taste. |
| `no-undef` | OFF (MP veto, confirmed) | The canonical "a better tool owns it" case: tsc reports TS2304 with full env awareness, and `no-undef` false-positives on runtime globals. Not relitigated. |

### Pedantic and style category promotions: two real, two already on

The audit suspected the off `pedantic`/`style` categories hid wanted rules. The honest
surface is small, because any high-value rule in `correctness`, `suspicious`, or
`restriction` is already enforced by the active categories. Keep the categories off (the
ADR-004 binary posture); promote specific rules by explicit entry.

| Rule | Status | Resolution |
| --- | --- | --- |
| `eslint/no-throw-literal` | pedantic, not enabled | PROMOTE to BASE / error. Enforces throwing Error instances; agents throw strings. Genuine promotion. |
| `eslint/no-self-compare` | pedantic, not enabled | PROMOTE to BASE / error. Catches `x === x`, a near-certain bug. The cleanest promotion. |
| `typescript/no-misused-new` | **already on** via `correctness: 'error'` | Correction: not a promotion. Already enforced. List it explicitly only as a documented redundant pin labelled "already on via correctness," if at all. |
| `typescript/no-confusing-non-null-assertion` | **already on** via `suspicious`, and unreachable | Correction: drop the promotion. It is already on, and `no-non-null-assertion` (active) bans every `!`, so the confusing subset can never exist. Dead weight as a base entry. |

### unicorn: pull the general-quality set on, in its own fragment

The biggest batch. Only `prefer-node-protocol` runs today; roughly 120 rules are silenced.
The general-JS-quality set should come on. The strongest recommendation here is structural,
and the reviewer agreed it is the bucket's best contribution.

**Placement: build a `unicornConfig` fragment that composes into base.** Move the silence
wall out of `nodeRuntimeConfig` into `unicornConfig`, which owns the unicorn plugin, the
full silence list, and the explicit-on entries. Base composes it. `nodeRuntimeConfig` keeps
only the runtime-coupled `prefer-node-protocol`. This stops roughly 30 universal rules from
being mis-filed under a runtime-named fragment (a browser or library target that composes
base but not node-runtime would otherwise lose them), keeps base's plugin list honest, and
makes the base-versus-runtime split physical rather than a silent layer.

Enable mechanic differs by category. Swept rules (in correctness, suspicious, restriction)
come on by removing their silence line; the rest need an explicit entry.

**Enable at error, swept (remove from silence list):** `no-thenable`,
`no-await-in-promise-methods`, `no-single-promise-in-promise-methods`, `no-unnecessary-await`,
`no-useless-fallback-in-spread`, `no-useless-length-check`, `no-useless-spread`,
`prefer-set-size`, `no-empty-file`, `prefer-string-starts-ends-with`, `no-array-sort`,
`no-array-reverse`, `prefer-modern-math-apis`, `prefer-number-properties`.

**Enable at error, explicit entry (pedantic/style/perf):** `no-typeof-undefined`,
`no-useless-switch-case`, `no-static-only-class`, `no-useless-undefined`,
`no-useless-promise-resolve-reject`, `prefer-date-now`, `prefer-regexp-test`,
`prefer-string-slice`, `prefer-includes`, `prefer-array-find`, `prefer-array-some`,
`prefer-array-flat-map`, `prefer-optional-catch-binding`, `prefer-native-coercion-functions`,
`prefer-math-min-max`, `prefer-math-trunc`, `prefer-structured-clone`, `new-for-builtins`,
`throw-new-error`, `error-message`.

**Enable at warn:** `prefer-set-has` (an advisory perf hint about hot membership, not a
bug; warn is the correct severity-by-kind call).

Corrections folded in from the skeptic:

- `no-array-sort` and `no-array-reverse`: the disposition hedged the autofix. The oxc page
  shows a full safe autofix rewriting `sort()` to `toSorted()` (and by symmetry `reverse()`
  to `toReversed()`), and a default `allowExpressionStatement: true` already exempts
  standalone in-place sorts, the deliberate-mutation case. Record autofix as yes; the
  residual false-positive surface is small. Still gate `--fix` to CI only, since the rewrite
  changes whether downstream code reads a mutated array or a new one.
- `no-useless-switch-case`: re-grade to style (redundancy cleanup), not correctness, and
  record autofix as none (planned). It flags an empty case before `default`, which `default`
  already handles; it does not catch fall-through bugs.
- **Dangerous autofix, enable the rule but never run `--fix` unattended:** `no-useless-spread`,
  `prefer-number-properties`, `prefer-set-has`. CI lint without `--fix` is safe.

**Hold pending oxfmt scope:** `number-literal-case` and `switch-case-braces`. Both are
formatter turf (hex casing, brace placement), and the repo has no oxfmt config to verify
against yet. Per the rubric, if oxfmt owns the formatting, let it own. Do not land these at
error speculatively. Resolve oxfmt's scope, then enable only what oxfmt provably does not
touch.

**Keep silenced or drop (verified against Effect/Bun idioms):** `no-null` (drop; null is a
real value in JSON, DB rows, and Effect Schema, and its autofix is dangerous),
`prefer-ternary` (drop; fringe, pushes toward nested ternaries base bans), `no-instanceof-builtins`
(off; single-realm code uses `instanceof`, Effect uses it internally),
`consistent-function-scoping` (off; fights factory closures and local Effect helpers),
`custom-error-definition` (off; fights `Data.TaggedError`/`Schema.TaggedError`),
`prefer-logical-operator-over-ternary` (off; the `||` rewrite is a falsy-value footgun, MP
prefers explicit `??`), `numeric-separators-style` (off; opinionated grouping size).

**Defer with a logged decision:** `filename-case` needs a case policy chosen first (kebab
matches the repo) plus a one-time rename sweep. The browser/DOM unicorn family stays off as a
group for a future `browserConfig`; note that the correctness members there
(`no-invalid-fetch-options`, `no-invalid-remove-event-listener`) must remain in the silence
list, since the sweep would otherwise turn them on. The per-rule silencing is necessary here.

A modest caveat the reviewer raised: several style rules land at error in this batch. That
is defensible under the pack's opinionated-on posture, but it is a posture choice, so it sits
in the open-decisions list below for MP to confirm.

### vitest and jest: four test-scoped additions plus a comment fix

The least egregious bucket; the hygiene set was already curated. A repo-state note matters:
the first research pass measured the wrong sibling repo, and the disposition was re-grounded
against backpressure directly (17 test files, all importing from `vitest`, 6580 `expect()`
sites, 12 `.each`/`.for` sites). The reviewer re-verified every count.

Add to the existing `**/*.test.ts` override, never global:

| Rule | Recommendation | Note |
| --- | --- | --- |
| `vitest/consistent-each-for` | TEST-SCOPE / error | The one unambiguous win, 12 live sites. Prevents the `.each` (array as one arg) versus `.for` (values spread) signature footgun. |
| `vitest/require-mock-type-parameters` | TEST-SCOPE / error | Inert today (no `vi.fn`), a cheap forward guard for type-safe mocks. "No present sites" is not a drop reason per the rubric. |
| `vitest/require-local-test-context-for-concurrent-snapshots` | TEST-SCOPE / error | Inert today (no `.concurrent`), but the repo is snapshot-heavy; guards a real flaky-snapshot trap the day someone adds concurrency. |
| `vitest/no-import-node-test` | TEST-SCOPE / error | Catches importing the `node:test` runner instead of vitest, a real agent autocomplete mistake. oxc grades it style; the relabel to agent-failure-mode holds. |

Required edit: the `vitest.ts` comment claiming `require-test-timeout` clashes with
`vi.setConfig({ testTimeout })` is wrong. The oxc page documents that form as satisfying the
rule, and the repo uses `vi.setConfig` 17 times, so the comment misdescribes the repo's own
pattern. Keep the rule off (restriction-category, team-policy opt-in), but correct the reason.

Everything else stays off as preference, not hygiene. The one borderline is
`prefer-expect-type-of` (16 live `expect(typeof ...)` sites that would rewrite to
`toBeTypeOf`); a clean opt-in at warn if MP likes that matcher, off to keep the override
hygiene-only. If MP wants the override tight, the minimal set is `consistent-each-for` alone;
the other three are forward insurance.

### explicit return types: already firing, make it visible

MP decided to add explicit return types to base. The right variant is
`@typescript-eslint/explicit-module-boundary-types`, not whole-codebase
`explicit-function-return-type`: it annotates only the public surface, the mainstream
strict-TS posture, and its defaults (`allowTypedFunctionExpressions`, `allowHigherOrderFunctions`)
exempt the inline pipe callbacks Effect code is dense with.

Correction: `explicit-module-boundary-types` is restriction-category, so it is already active
in base today through the category sweep. `base.ts` silences `explicit-function-return-type`
(line 28) but leaves the module-boundary twin unlisted, meaning consumers are likely already
linted by it. The action is to make it an explicit, visible entry (mirroring the
`explicit-function-return-type: 'off'` precedent) with the options block
`{ allowHigherOrderFunctions: true, allowTypedFunctionExpressions: true, allowArgumentsExplicitlyTypedAsAny: false }`,
and to confirm via `--print-config` whether it is already firing. Keep
`explicit-function-return-type` off; enabling both is redundant.

### jsdoc: native oxlint cannot do what was decided

MP decided to fold contract JSDoc into base. The deep pass found a capability gap MP needs to
weigh. oxlint has no `require-jsdoc`: it cannot force documentation onto undocumented exported
symbols, and the `require-*` rules expose no public-only or exported-only scoping. The native
capability is "validate where documented": when a doc block exists, its `@param` and
`@returns` must match the signature, and its tags must be valid. That behavior catches a real
agent-failure-mode, a signature edited without its doc updated. It does not require that public
API carry any documentation at all.

This is a fork for MP, covered in the open decisions. Two further constraints apply whichever
way it goes. First, adding the `jsdoc` plugin triggers category bleed: the correctness and
restriction jsdoc rules auto-activate, so this needs the same exhaustive silence wall plus a
`drift-guards.test.ts` assertion as unicorn and vitest, which the disposition omitted. Do not
flip the plugin on in base until that silencing and guard exist. Second, the validate rules
span three categories (`check-tag-names` and `check-param-names` are correctness;
`require-param`/`require-returns` are pedantic and must be listed explicitly or they stay
off; `check-access` and `empty-tags` are restriction policy bans worth individual vetting), so
the set must be enumerated by name, not enabled as a group.

## Deferred layers (confirmed as layers, with corrections)

| Layer | Verdict | Note |
| --- | --- | --- |
| architecture / named-exports | collapse into BASE | Not separate opt-ins; resolved in the base-disables tables above. |
| react / jsx-a11y / react-perf | STACK-LAYER, deferred | Only React repos. Name it `reactStackConfig`, not `react`, to avoid colliding with the effect-react domain. Apply the silence-wall plus drift-guard discipline when built. |
| type-aware async (`no-floating-promises`, `no-misused-promises`) | DEFER | Correction to the reason: `oxlint-tsgolint@0.18.1` is present in the catalog and node_modules. The real blockers are TypeScript pinned at 6.0.2 (below the 7.0+ requirement) and the config not opting into `typeAware`. Revisit when TS reaches 7.0+ and MP enables type-aware linting. The Effect language-service and custom Effect rules cover much of the floating-Effect risk meanwhile. |
| `browserConfig` (`import/no-nodejs-modules` plus the DOM unicorn family) | RUNTIME-LAYER, deferred | Node/Bun is the default floor; this layer is keyed to browser targets. |
| runtime unicorn posture (`no-process-exit`, `prefer-module`, `prefer-top-level-await`, others) | RUNTIME-LAYER, deferred | `no-process-exit` is the first plausible pickup for a CLI runtime layer (bypassing cleanup), worth flagging when that layer is built. |

## Decisions MP confirmed (2026-06-16)

- **`no-undef`:** keep off. tsc reports TS2304 in the same pipeline with full env awareness,
  and the rule false-positives on runtime globals. The canonical better-tool-owns-it case.
- **jsdoc:** fold the native validate-where-documented set into BASE now. That means the
  `jsdoc` plugin plus an exhaustive silence wall, a drift guard, and the enumerated validate
  rules enabled by name. It validates doc blocks that exist (catching `@param` drift and
  typo'd tags) but does not require docs on undocumented public API. Native oxlint cannot
  enforce presence, so that path (a custom `require-jsdoc-on-exports` rule shipped in the
  plugin) is tracked as `BP-TD-012`, to build when enforced coverage is wanted.
- **`no-ternary`:** keep off; only nested ternaries are banned.
- **vitest scope:** add the four-rule set (`consistent-each-for`,
  `require-mock-type-parameters`, `require-local-test-context-for-concurrent-snapshots`,
  `no-import-node-test`).
- **`prefer-expect-type-of`:** off, to keep the test override hygiene-only.
- **`number-literal-case` and `switch-case-braces`:** let oxfmt own both. Pin oxfmt's scope
  first, then drop these from the unicorn set.
- **`filename-case`:** leave off. The case varies by file role within a single repo (React
  `PascalCase`, dotted `auth.service.ts`, `camelCase` utilities), so a single policy fights
  more than it helps. Revisit only inside a future stack layer, never base.
- **explicit return types:** use `explicit-module-boundary-types` with
  `{ allowHigherOrderFunctions: true, allowTypedFunctionExpressions: true, allowArgumentsExplicitlyTypedAsAny: false }`.
  The cross-file tsc-perf win comes from exported functions, which this rule already covers,
  so whole-codebase annotation adds noise on inline Effect callbacks and risks widening the
  precise inferred types of internals without a matching perf gain. `isolatedDeclarations` is
  the future lever for the published packages, and it aligns with the module-boundary variant.

- **style rules at error (unicorn batch):** confirmed at error. Most autofix, so friction is
  low, and the idiom-and-consistency enforcement is wanted. A few are graded style with no
  full autofix (`error-message`, `prefer-native-coercion-functions`, `prefer-array-find`) or
  only a partial one (`prefer-includes`, `prefer-array-some`, `prefer-string-slice`); a
  violation there needs a manual edit, but those fire rarely.

## Open decisions

None remain. The next step is to apply the changes per the sequencing below.

## Suggested sequencing

1. Land the base-disables decided set (the four import rules, `no-continue`, the two
   pedantic promotions) together with their setup: the cycle-clearing sweep, the tsconfig
   aliases, and the override globs in the same change, since each rule needs its setup to
   avoid a noise flood.
2. Build `unicornConfig`, move the silence wall into it, enable the corrected general-quality
   set, and extend the drift guard to assert the intended unicorn surface (no browser rule,
   no unwanted correctness rule active).
3. Add the four vitest rules to the test override and fix the `require-test-timeout` comment.
4. Make `explicit-module-boundary-types` explicit with its options after confirming current
   firing via `--print-config`.
5. Resolve the jsdoc fork; if native, add the silence wall, the enumerated validate set, and
   a drift guard before flipping the plugin on.
6. Re-dogfood backpressure, then pin the changeset against the final state.

## Verification carried out

- Every autofix, category, and option claim was read from the `oxc.rs` rule pages, and the
  category-at-severity activation model was confirmed against the live oxlint binary.
- An adversarial reviewer ran over each disposition and refuted four factual defects
  (`no-misused-new` and `no-confusing-non-null-assertion` already on; the `no-array-sort`
  autofix understated; the jsdoc plan ignoring category bleed; the type-aware blocker
  misattributed) and the `no-useless-switch-case` mis-grade. Those corrections are the ones
  recorded above, not the original disposition text.
- The preset-fold answer was checked against the rule bodies in `rule-catalog.ts` and the
  manifest domain partition, not inferred from the preset names.
