# Effect rules v4 alignment: build plan

- Status: completed and accepted (2026-09-27). MP accepted G2 with the recorded executor coverage, so WI-08 is done under that acceptance and WI-10 is done with the introspection exit plan's standalone verification. The exit plan (`docs/exec-plans/active/introspection-exit-2026-09-27.md`) replaces the former introspection blocker and the instruction to keep introspection.
- Date: 2026-09-25.
- Target branch: `lint/oxlint-standards-consolidation`.
- Decision baseline: `effect-rules-v4-alignment-2026-09-25.md`, identified by the scaffold as commit `42c77c6`.
- Release: the pending `@mplibunao/oxlint-standards` 0.2.0; a separate minor changeset for the additive `@mplibunao/tsconfig` surface.
- Paths below are relative to `backpressure/` unless prefixed `EF/`, `ES/`, or `TSGO/`.

## 1. Summary

Implement the alignment plan's settled rule drops, narrowings, v4 retargeting, messages, and house style, and replace editor-only delegation with a required, executable `@effect/tsgo` integration for the Effect preset. Keep the ordinary backpressure toolchain unpatched and prove the supported integration in mandatory isolated, packed consumers, including the TypeScript 7 fallback. Generate both packages' tsgo settings from one pinned metadata snapshot and one grading policy. Change the catalog, ownership guards, replay expectations, and package contracts together so deleting a rule cannot leave a silent enforcement gap. This is a targeted cross-package migration, not a rewrite of the catalog or a migration of backpressure itself to Effect.

### Goal and authority

The alignment plan's `Decided`, `tsgo severity list and boundary scoping`, `Deferred follow-ups`, and ordered `Next steps` are binding. Review F1 to F14 is historical input already absorbed there, not a separate backlog to adjudicate again. Historical evidence tables and rejected alternatives do not override the final decisions. Custom `no-pipe-ladder` owns qualifying nesting; tsgo owns chained pipes at `warn`.

Complete the plan and its progress ledger without overwriting unrelated work. The scaffold and unrelated prompt exports may be untracked. Do not run a blanket clean, reset, or staging command. Do not edit the `AGENTS.md` symlink or the external Effect, effect-solutions, t3code, executor, and tsgo checkouts.

## 2. Current-state analysis

### Background: retained scaffold seams

Use these already-investigated seams rather than repeating the source investigation:

| Responsibility | Existing owner and extension point |
| --- | --- |
| Catalog and selection | `RuleManifestEntry` in `src/rule-manifest.ts`; `presetEntriesForDomains`, `entriesForCollections`, and `oxlintSeverityForManifestEntry`; forwarding exports in `rule-manifest-selection.ts`. |
| Custom presets | `presetRulesForDomain` and `definePreset` in `src/presets/shared.ts`; Effect's native `no-shadow` / `require-yield` carve-outs in `presets/effect.ts`. |
| Runtime rules | `catalogRules` and `catalogRuleDefinitions` in `rule-catalog.ts`, exposed by `plugin.ts`. `no-effect-as` also has a standalone rule module under `src/rules/effect/`. |
| Rule messages | `ruleMessage` in `rule-messages.ts`, currently backed by explicit messages plus a generated fallback. |
| Import and scope resolution | `collectImportNames`, `hasEffectStackImport`, and `isNamespaceImportReference` in `utils/imports.ts`; existing scope traversal must be reused for binding identity. |
| Ownership | `isInAnyWrapperOwnedExpression` and named-wrapper helpers in `utils/effect-ownership.ts`; single-callee and ladder ownership helpers in `rule-catalog.ts`. |
| Configuration composition | `composeLintConfigs` unions plugins and concatenates overrides; options and rules merge with later wins, and `extends` is deliberately ignored. It also has exhaustive top-level field guards. |
| Existing native config evidence | `configs/drift-guards.test.ts`, `scripts/lib/effective-config.ts`, and `generate-effective-config.ts`. The existing `base` / `full` artifact covers the non-Effect baseline; §3.12 replaces it. `--print-config` does not establish behavioral application of file overrides. |
| Catalog contracts | `check-rule-inventory.ts` cross-checks manifest, source presets, runtime, severity policy, and replay. Its three-name drop list, LSP assertion, and unconditional source-fixture checks need migration. |
| Replay | `fixture-replay.ts` holds source fixtures, semantic branch matrices, and extra combined-preset ownership checks outside the suite list. All three surfaces matter when dropping rules. |
| Packed consumption | `packed-consumer-harness.ts` installs with `--ignore-scripts`; `real-engine.ts` currently prefixes every supplied rule with this package's namespace. Neither implicitly prepares a tsgo consumer. |
| Lint packaging | One root ESM export and bundled declarations. `artifact-assertions.ts`, package allowlists, and the packed runtime/type smokes constrain the public artifact. The non-Effect oxlint peer remains `^1.58.0`. |
| TypeScript configuration | The tsconfig package currently exports only `base.json`, `server.json`, and `browser.json`, with exact package/tarball/export allowlists. |
| Releases | ADR-006 and the existing Changesets/release-contract checks own independent package versions and the unified publishing workflow. Do not manually bump package versions or rewrite publishing. |
| Tool pins | Root catalog: oxlint 1.58.0, vite-plus 0.1.15, TypeScript 6.0.2; workspace override: oxlint-tsgolint 0.18.1. Bun, pnpm, and other existing pins stay unchanged. |

The scaffold reports 790 passing tests and a local `pnpm check` failure at `introspection check`, caused by the sibling build rejecting `[records.list]`. Those are recorded intake results that this plan has not re-verified. Prose can and must be run independently rather than remaining untested behind that failure. The unpublished sibling dependency `file:../introspection` is a separate clean-checkout/CI installation blocker, not merely a lint failure.

### End-to-end flow and blocking transformations

Today, custom manifest rows flow through domain/collection selection, become package-prefixed rule settings, and reach `catalogRules` through the plugin export. RuleTester exercises source visitors; replay and packed consumers exercise the built bundle. Native fragments follow a separate path through `composeLintConfigs` into the live engine and the effective-config artifact (replaced by the generated rules page in §3.12).

The new delegated path is: pinned upstream metadata and category membership → reviewed grading policy → generated delegated manifest data and tsconfig JSON → `effectTsgoConfig` → full `effectPreset` → consumer composition → patched oxlint → diagnostics and exit status. The fallback consumes the same policy through tsconfig and patched TypeScript, not through oxlint. A route-specific projection changes names and severity spelling, not the underlying grading decision.

The main blockers are configuration completeness, stale ownership suppression, unconditional fixture-parity checks on future dropped rows, and two severity input locations. Installing tsgo or exporting its rule map alone resolves none of these.

## 3. Design

### 3.1 Resolved design choices

**Toolchain: isolate the patch, but make integration verification mandatory.** Keep backpressure's ordinary oxlint/vite-plus pair and `prepare: vp config` unchanged. Add exact `@effect/tsgo@0.45.0` as a root development dependency for pinned policy inspection, not as a root patch or runtime dependency. Use temporary consumers outside the workspace for the supported pair: vite-plus `0.3.2`, oxlint `1.82.0`, oxlint-tsgolint `7.0.2001`, and Effect `4.0.0-rc.117`. Root workspace overrides must not leak into these consumers.

This preserves the binding statement that backpressure itself does not need the patch, keeps real evidence for non-Effect consumers on the existing peer baseline, and tests the integration where consumers actually install it. MP decision: the isolated integration runs through a separate, intentional command, `pnpm check:effect-integration`, inside `release:prepare`, and in CI on pull requests, never inside `pnpm check`. Agents and subagents run `pnpm check` many times per task, and per-run network installs would silently slow every check and CI run. `pnpm check` keeps only the cheap, offline parts: the read-only policy staleness check (`effect-policy:check`), `rules-page:check`, and the in-repo config-shape tests. The integration command bundles both route smokes; the oxlint-route smoke includes the patched-engine policy comparison (§3.12). CI runs it from a separate workflow, `.github/workflows/effect-integration.yml`, on `pull_request` and `workflow_dispatch`, with `concurrency` grouped by ref and `cancel-in-progress: true`. The `rp-orchestrate-loop` lane pushes once per committed work item (plus crash-risk checkpoints), so a pull-request trigger runs per push. Canceling superseded runs keeps that cost down, and branch pushes without a pull request trigger nothing, matching `ci.yml`. The separate workflow keeps `pnpm check` fast and gives the integration its own status. The router (`CLAUDE.md`) tells agents to run it once, before committing a work item, when that item touched `configs/effect-tsgo.ts`, `configs/effect-boundaries.ts`, `presets/effect.ts`, the tsconfig overlays, the tsgo policy or metadata, or any pin in the supported matrix. Upgrading and patching the root would couple ordinary repository linting to a stack the repo does not use and would remove the unpatched compatibility control. Do not choose an unsupported newest vite-plus release merely because downstream upgrades are acceptable.

**Policy: generate from pinned metadata plus a grading table.** Author category defaults, named exceptions, rationales, common options, test scopes, and boundary relaxations once. Generate package projections deterministically; do not maintain 113 severities twice or extend upstream `recommended`. Upstream category remains provenance; backpressure's `rationaleClass` remains the governing local classification.

**TypeScript: do not migrate the root compiler in this change** (MP agreed; a TypeScript 7 upgrade of the repo is separate work). Keep 6.0.2 for authoring and the default oxlint-route consumer; exercise 7.0.2 in a distinct patched-tsc consumer. The supplied route evidence establishes that the oxlint route works on 6.0.2. Shipping JSON settings for a TypeScript 7 consumer does not require compiling this repository with TypeScript 7. A root compiler upgrade has no required behavior to prove here and would mix compiler migration failures into rule-alignment evidence.

**Work grouping: do not wait for introspection to do independent work.** Land governance first, establish the deterministic policy/integration substrate next, and change visitors together with their manifest and replay contracts. Execute each available gate separately and record the actual result. Never remove `[records.list]`, skip introspection in the canonical check, weaken a release assertion, or report a complete green check to conceal the existing blocker. Release readiness remains blocked until the independent sibling/CI issue is resolved and a clean full check succeeds.

### 3.2 Canonical tsgo policy, generation, and serialization

Add these repository-owned inputs:

- `scripts/references/tsgo/0.45.0/metadata.json`: a normalized, retained snapshot of the **0.45.0 tag**, with package version, source tag and resolved commit, source-file hashes, and one row per diagnostic. Each row carries `diagnosticName` (the exact camelCase key), `ruleName` (the exact fully qualified `effecttsgo/<kebab-name>`), and `category` (`correctness`, `antipattern`, `style`, or `effect-native`). Rows also keep the upstream `description`, `fixable`, and `preview` example for the rules page and viewer (§3.12). Retain license attribution for copied metadata. These are data; no upstream rule logic is ported. Pair each camelCase key with its kebab rule name from the tagged README rule table (`docs/rules/<kebab>.md` links next to `<code>camelName</code>`), cross-checked against `oxlint-schema.json`; no single upstream file carries both spellings. The capture step asserts three equal 113-element sets: metadata camelCase names, oxlint preset kebab names, and paired rows. The snapshot schema normalizes the upstream group id `effectNative` to `effect-native`. Keep one snapshot per pinned version: the generator derives the version from the root catalog and fails when `scripts/references/tsgo/<version>/metadata.json` is absent, and a tsgo bump deletes the previous snapshot (git history keeps it).
- `scripts/config/tsgo-policy.ts` holds pure, immutable policy data. It contains category defaults; exact per-rule severity/rationale exceptions; the conditional JSON-rule disposition; common plugin options; test patterns; and boundary rule IDs. No filesystem or package runtime imports.
- `scripts/config/effect-toolchain.json`: schema version 1 and the exact integration-only package pins named above, plus TypeScript 7.0.2. The tsgo pin itself comes from the root catalog, and the default-route TypeScript pin comes from `canonicalVersions()`, so those versions are not independently authored again.

Do not read `_packages/tsgo/src/metadata.json` from an installed npm package: the supplied publish allowlist does not ship that source path. Capture the tagged metadata once while building WI-02, and verify it against the installed 0.45.0 package's published category JSON, `oxlint-schema.json`, and diagnostic option schema. Resolve published files relative to the supported `@effect/tsgo/package.json` export; do not assume an unexported JSON subpath can be imported. The checkout's version field alone does not prove it is at the tag. A copy of the tagged `style.json` informed this plan; the generator's permanent input is the captured snapshot.

Add `generate-effect-policy.ts` with write and `--check` modes; `effect-policy:check` is `bun scripts/checks/generate-effect-policy.ts --check`, the only offline policy-check entrypoint. Supported-matrix checks go through the existing `versions:check` extension, and root-script gate assertions stay in `check-release-workflow.ts`. It validates input shape, exact version, duplicate IDs, name bijection, category membership, and the 113-rule union before producing output. It rejects unknown policy keys and silently missing rules. Category counts at this pin are 21 correctness, 20 antipattern, 50 style, and 22 effect-native. Never derive camelCase by a generic kebab conversion: names such as `cryptoRandomUUID` require the actual upstream mapping.

Outputs are `src/generated/tsgo-policy.ts` in the lint package and `effect.json` / `effect-tsc.json` in the tsconfig package. The generated TypeScript exports immutable delegated rows, identifier types, test scopes, and the delegated boundary subset. `ruleManifest` incorporates those rows; the lint fragment derives its actual severities from the manifest. The tsconfig projections come from the same in-memory graded rows. No generated runtime module imports tsgo, script code, an external checkout, or the other workspace package.

Generate sorted keys, stable row order, two-space JSON indentation, and trailing newlines. Validate all output in memory before replacing files. `--check` performs no writes and fails on missing or differing output. Builds and package checks verify committed output; they must not silently regenerate stale policy and conceal an unreviewed change. Re-running generation is idempotent. An interrupted generation can leave a partially updated working tree, but a subsequent check must reject it; no artifact is publishable until all projections agree.

#### Exact grading

| Category | Shipped decision |
| --- | --- |
| Correctness | All 21 at `error`, except `duplicate-package` at `warn`. |
| Anti-pattern | `error`: `try-catch-in-effect-gen`, `run-effect-inside-effect`, `leaking-requirements`, `effect-in-failure`, `effect-in-void-success`, `lazy-promise-in-effect-sync`, `unknown-in-effect-catch`, `global-error-in-effect-catch`, `global-error-in-effect-failure`, `multiple-effect-provide`, `strict-effect-provide`, `scope-in-layer-effect`, `layer-merge-all-with-dependencies`. The remaining seven are `warn`: `return-effect-in-gen`, `catch-unfailable-effect`, `effect-fn-iife`, `effect-gen-uses-adapter`, `lazy-effect`, `prefer-unsafe-constructor`, `schema-sync-in-effect`. |
| Style | All 50 at `warn`, except `error`: `effect-fn-opportunity`, `nested-effect-gen-yield`, `effect-do-notation`, `unnecessary-fail-yieldable-error`; and `off`: `catch-die-to-or-die`, `strict-boolean-expressions`, `missing-effect-service-dependency`, `deterministic-keys`. `unnecessary-pipe-chain` and `missed-pipeable-opportunity` remain `warn`. |
| Effect-native | `error`: `global-date-in-effect`, `global-random-in-effect`, `crypto-random-uuid-in-effect`, `global-console-in-effect`, `global-timers-in-effect`, `process-env-in-effect`, `instance-of-schema`. All remaining entries are `warn`, except `prefer-schema-over-json`, which follows the measured decision below. |

This produces 44 errors, 65 warnings, and 4 explicit offs when the JSON rule is enabled; otherwise 44 errors, 64 warnings, and 5 offs. These totals are a diagnostic cross-check, not a substitute for exact-name assertions. Every upstream rule has an explicit setting, including `off`, to prevent category activation from reviving deliberately disabled rules.

The upstream style category does not force the local rationale class. Record the four decided style-category errors as the specific gen-first/agent-failure policies they enforce, with decision references. Keep `no-return-null` and the narrowed schema-cache hint at local `style` / `warning`. Keep `duplicate-package` accurately classified as a correctness/install-state diagnostic and add a narrowly scoped quiet-critical exception for that one delegated rule, rather than weakening the existing correctness/safety severity gate for everyone. Existing native style-at-error exceptions retain their exact list and evidence requirements.

#### Conditional JSON decision

Start the integration evaluation with the shipped JSON rule explicitly `off`; run it at `warn` in the measurement-only configuration. Do not attach an error-preserving replacement edge from `no-naked-object-state-update` to it.

For this change, define “small” before running the experiment: the new rule's total diagnostics must be at most one tenth of the old stringify-branch totals in **each** unchanged app snapshot: at most 69 in t3code and 98 in executor. Review every resulting hit and require no recurrence of routine cache-key, protocol, CLI-output, or equivalent intentional serialization noise. Enable at `warn` only when both volume and review conditions pass; otherwise ship `off` and record the reason. MP decision: the one-tenth figure is an arbitrary guardrail, and the governing test is whether the rule makes the codebases better. The reviewer reads every hit and asks whether rewriting it with Schema would improve that code; a count under the threshold does not override a review that finds the hits unhelpful. Because the repo lints with `--max-warnings 0`, a `warn` rule still blocks agents, so a noisy warning costs as much as an error. Missing/unusable app evidence is not a successful evaluation and cannot justify enabling it. `no-json-parse` stays `error` in all cases.

### 3.3 Manifest and public rule identity

Extend `RuleManifestEntry` with optional `replacedBy`: a non-empty readonly list of generated, fully qualified `TsgoRuleId` values when present. It records a coverage-preserving handoff; loosely related rules do not belong in it. Absent means no severity-floor promise is made. Preserve the dropped source row's historical severity; never change it to `off` to evade the floor.

Replace the active LSP terminology in public metadata: domain `lsp` → `tsgo`; disposition `LSP-delegated` → `tsgo-delegated`; source ownership `LSP` → `@effect/tsgo`; add gating `type-aware` and collection `effectTsgoConfig`. Delegated rows use `implementationStatus: delegated`, `testStatus: not-applicable`, and `parityStatus: delegated`; integration evidence validates them, not custom RuleTester parity. Export `tsgoOwnedChecks` as fully qualified IDs and remove `lspOwnedChecks` without an alias. Include configured-off diagnostics in the delegated inventory, while documenting that “owned” is not “enabled.”

Remove `effectVersionSensitivity` from the interface, all row/helper inputs, generated metadata consumers, public declarations, and active documentation. Its current free-form values carry no reliable guarantee. Keep v4 evidence in row notes and the executable API/reference corpus rather than replacing one vague field with another. This is a hard public metadata cutover, covered by the changeset.

`presetRulesForDomain` must select only custom implemented rows plus explicitly requested built-ins. It must not prefix a delegated ID with `@mplibunao/oxlint-standards/`. Extend `manifestCollectionsForConfiguredFragment` so the fully composed Effect preset is explained by both `effectPreset` and `effectTsgoConfig`; retain the existing base/unicorn/jsdoc mapping.

#### Complete drop register

Preserve all existing source rows and all 50 linteffect source identities and `sourcePresets`. The thirteen `lsp/<camel>` rows built by `lspDelegatedChecks` (`rule-manifest.ts:2722-2735`) have no source-fixture history and are removed, replaced wholesale by the 113 generated `tsgo` rows: `missing-effect-service-dependency` returns as a generated `off` row and `importFromBarrel`, which has no tsgo counterpart, disappears. The inventory assertion on one of those names (`check-rule-inventory.ts:693-695`) becomes a check that the generated delegated row count equals the pinned metadata count. Besides the existing drops `no-if-statement`, `no-effect-fn-generator`, and `no-ternary`, drop these 27 runtime rules:

| Dropped rule | `replacedBy`, when applicable |
| --- | --- |
| `no-manual-effect-channels` | None; explicit annotations are allowed. |
| `no-effect-type-alias` | None; explicit aliases are allowed. |
| `no-return-in-callback` | None; returns, including generator error returns, are allowed. |
| `no-return-in-arrow` | None; handlers that return early are allowed. |
| `prefer-effect-fn` | `effecttsgo/effect-fn-opportunity` |
| `no-effect-wrapper-alias` | None; ordinary non-gen Effect-returning functions are allowed. |
| `no-effect-as` | None; value replacement is idiomatic. |
| `no-effect-never` | None; intentional nontermination is allowed. |
| `no-string-sentinel-const` | None; the new string-error rule is narrower, not equivalent. |
| `no-string-sentinel-return` | None; success-channel strings are allowed. |
| `no-nested-effect-gen` | `effecttsgo/nested-effect-gen-yield` |
| `no-match-void-branch` | None; void-valued branches are allowed. |
| `effect-no-multiple-provide` | `effecttsgo/multiple-effect-provide` |
| `prefer-yield-tagged-error` | `effecttsgo/unnecessary-fail-yieldable-error` |
| `no-effect-sync-console` | `effecttsgo/global-console-in-effect` |
| `no-effect-do` | `effecttsgo/effect-do-notation` |
| `no-effect-async` | `effecttsgo/outdated-api` |
| `no-effect-orElse-ladder` | `effecttsgo/outdated-api` |
| `no-wrapgraphql-catchall` | `effecttsgo/outdated-api` |
| `no-call-tower` | None; delete the already off-preset rule code. |
| `no-nested-effect-call` | None; delete the already off-preset rule code. |
| `no-effect-succeed-variable` | None; focused tsgo eager/success checks are complementary, not equivalent. |
| `warn-effect-sync-wrapper` | None; legitimate synchronous side effects remain allowed. |
| `no-naked-object-state-update` | None; JSON delegation is conditional and spread is allowed. |
| `no-runtime-runfork` | `effecttsgo/run-effect-inside-effect` |
| `no-family-collection-read` | None; naming-convention inference is removed. |
| `no-inline-runtime-provide` | `effecttsgo/strict-effect-provide` |

Each newly dropped row has `disposition: dropped`, `implementationStatus: not-implemented` (field names are literal), `testStatus: not-applicable`, `parityStatus: not-applicable`, `collections: []`, `testSource: none`, an explicit reason, and the replacement only where listed. Preserve origin, domain, source membership, and relevant historical evidence. Remove its runtime entry, RuleTester suite, executable replay suite, message entry, and now-unused helper or standalone rule module. Retain vendored source fixtures and attribution as history.

Update inventory in both directions: active custom rows must exactly equal runtime rule names and replay suite names; dropped names must be absent from both. Extend the independent source-drop allowlist for linteffect-origin drops, and validate the full decision drop register separately. The current unconditional `hasSourceFixture` checks and final loop over every fixture directory must first consult disposition. Dropped rows with retained upstream fixture directories are valid and must not require executable source parity. Active fixture-backed rules still require complete replay. Do not delete fixture directories or weaken active parity to satisfy the new drop mechanics.

The eleven replacement edges above all retain an `error` floor. Compare normalized actual shipped global severity with the source row; require the documented test-only `strict-effect-provide: off` exception explicitly. Scope exceptions must not erase global grading. Do not apply this floor to the conditional JSON rule or the removed succeed/sync opinions.

### 3.4 Effect config, type boundary, and boundary relaxation

Add `configs/effect-tsgo.ts`, exporting `effectTsgoConfig`: the complete 113-key delegated map, `plugins: ['effecttsgo']`, `options.typeAware: true`, and the test-file override for `effecttsgo/strict-effect-provide: off`. It carries no categories, automatic app-layout globs, or runtime dependency on tsgo.

Change the existing **`effectPreset` export itself** to compose its custom rules and two native carve-outs with `effectTsgoConfig` using `composeLintConfigs`. Do not leave `effectPreset` as an AST-only public bypass while merely recommending a new optional fragment. A consumer selecting the Effect preset must encounter the intended unknown-plugin failure on an unpatched engine. `effectReactPreset` remains a three-rule AST add-on (`no-react-state`, `no-render-side-effects`, `no-atom-registry-effect-sync`) and is documented alongside the full Effect preset. General and boundaries presets remain unchanged.

The old `PresetConfig` shape remains valid for the three AST-only presets. Add an exported `EffectPresetConfig` describing the full config and its required rules/JS-plugin fields; `effectPreset` changes from `PresetConfig` to this full-config type. Keep the `composeLintConfigs(...configs: OxlintConfig[]): OxlintConfig` contract and its merge algorithm unchanged. This is a configuration-shape breaking change; it adds no second composition system.

The unpatched oxlint 1.58 declarations type `plugins` as a closed union without `effecttsgo` (`node_modules/oxlint/dist/index.d.ts:37-38`), while `options.typeAware?: boolean` (`:366`) and `overrides` are already typed and `composeLintConfigs` already merges `options` (`compose.ts:115`). The adapter only needs to bridge the plugin literal. Handle this at one internal, documented adapter in `configs/effect-tsgo.ts`. It validates a narrowly typed fragment (literal plugin ID, boolean type-aware option, generated rule-ID union, supported override shape) and then projects it to `OxlintConfig`. A localized type assertion is acceptable because the patched engine extends the native schema; validate it with both the pinned schema and real packed type/runtime smokes. Do not use `any`, globally widen all plugin names to string, augment consumer modules, or spread assertions through callers. Retain the general config-field drift guard. Consumer declarations must not import `@effect/tsgo` or `@oxlint/plugins`.

Use the existing escape-hatch test filename convention for the new Effect-only scope: `.test` / `.spec` and the hyphen forms `-test` / `-spec` (`rule-catalog.ts:556-557` matches `[.-](test|spec)`), with JS/TS, JSX/TSX, c/m variants, and files under `test`, `tests`, or `__tests__`. Store the equivalent patterns once in policy; generate oxlint override `files` and tsc override `include` from it. Normalize path separators in custom-rule filename checks. Prove suffix and directory patterns in both actual engines. Do not broaden `vitestConfig` or base-config structural exemptions as a side effect.

Export `effectBoundaryRules` from `configs/effect-boundaries.ts` and the package root. It is an immutable-by-contract **rules object**, not a full config and not the existing monorepo `boundariesPreset`. Its exact disabled set is:

- Package rules: `no-effect-escape-hatch`, `no-instanceof-error`, `no-json-parse`, `no-promise-catch`, `no-promise-reject`, `no-switch-statement`, `no-try-catch`, `no-unknown-error-message`, each fully package-prefixed.
- Delegated rules: `async-function`, `new-promise`, `node-builtin-import`, `global-console`, `global-date`, `global-fetch`, `global-random`, `global-timers`, `crypto-random-uuid`, and `process-env`, each `effecttsgo/`-prefixed.

The last two are the outside-Effect siblings despite lacking the `global-` spelling. Do not disable any `*-in-effect` sibling, `strict-effect-provide`, or unrelated native baseline rule. Consumers attach the object to a final override with their own `files`; it does not globally relax a project. Document that base `no-console` remains active unless separately relaxed. Use executor's recorded boundary layout as an explicitly project-specific example, not a shipped glob contract. Exact historical glob strings not supplied in the packet must be copied only after reading the pinned executor config, not invented from directory nicknames.

### 3.5 Route-specific TypeScript settings and setup

Add `packages/tsconfig/effect.json` as an **options-only overlay**, without extending `base.json` and without `include`, `exclude`, `files`, `types`, `lib`, or `jsx`. A consumer composes its existing base/server/browser config first and this overlay last. This avoids resetting Bun or browser environment settings through another inherited base config.

The sole Effect plugin entry keeps the upstream parser name `@effect/language-service`; changing the delegation tool does not rename that configuration key. Common options are `effectFn: ['span', 'inferred-span', 'suggested-span']`, `namespaceImportPackages: ['effect']`, `barrelImportPackages: []`, and `pipeableMinArgCount: 2`. The default oxlint route uses `diagnostics: false` to suppress duplicate editor diagnostics, subject to the engine proof below. If the probe shows `diagnostics: false` also suppresses oxlint-route output, omit the key and accept duplicate editor diagnostics; that outcome is recorded in the ledger and does not block the work item. It contains **no `diagnosticSeverity` map and no severity-bearing plugin overrides**. The oxlint fragment is the only severity owner on that route.

Add `effect-tsc.json`, also an options-only overlay, with the same common options, diagnostics enabled, all 113 camelCase severity keys, and generated test-file overrides turning `strictEffectProvide` off. Map `warn` to the upstream schema's `warning` and keep `error` / `off`; verify the accepted spellings. Explicitly set `ignoreEffectErrorsInTscExitCode` and `ignoreEffectWarningsInTscExitCode` false so errors and warnings fail the typecheck; test the exit behavior instead of assuming it. The projection never emits `suggestion`, so the suggestions flag stays at its upstream default and makes no exit-behavior claim. The two route files are projections, not independent policies. Select exactly one; do not extend both. On the tsc route, tsgo merges the Effect plugin entry across `extends`: a consumer plugins array that names only other plugins keeps the overlay's Effect settings, and a consumer Effect entry merges key by key over the overlay's entry.

The setup documentation separates three steps. Installing the integration is one; patching the selected executable and opting into the settings are the other two. Default consumers install the supported pair and tsgo, extend `effect.json`, compose the entire `effectPreset`, and append `effect-tsgo patch --no-typescript --oxlint` to their existing prepare workflow. Preserve existing prepare work such as `vp config`. Projects using `--ignore-scripts` run the patch explicitly. Fallback consumers use TypeScript 7.0.2, `effect-tsc.json`, and `effect-tsgo patch` without the oxlint route. They receive delegated diagnostics through their normal typecheck; that route does not magically run this package's custom AST rules without a linter.

Probe conflicting `diagnosticSeverity` and oxlint settings early using a selected diagnostic, including off/warn/error combinations. Record whether tsconfig influences the oxlint route. Regardless of precedence, keep severity maps out of `effect.json`, so normal consumers have one owner. Prove that `diagnostics: false` does not suppress delegated oxlint output, as the supplied setup guide intends. Failure is an integration blocker, not permission to publish silently disabled checks.

Declare `@effect/tsgo: 0.45.0` in both packages as an **optional peer**, with optional metadata, to advertise the tested contract. Do not add a runtime dependency or install/prepare hook to either published package. Keep the broad oxlint peer for non-Effect users. Document the tested matrix, not an unverified range of compatible patch targets.

### 3.6 Shared AST contracts and rule behavior

Keep `create(context)` and the existing ESLint-compatible visitor substrate. Import sets, tracked bindings, and report-deduplication state belong to one rule context and one source file; no mutable process-global cache may retain AST nodes or scopes. All visitor work is synchronous. Reuse existing AST accessors and import resolution; add focused helpers rather than extracting or rewriting the entire catalog.

Add `utils/effect-context.ts` for nearest-function ownership and recognition of the supported Effect generator argument forms. Add `utils/effect-composition.ts` for bound pipe parsing, the transforming-combinator allowlist, and shared report eligibility. Extend `utils/imports.ts` with a narrowly exported `resolveVariable(context, identifier): Variable | null`, reusing the existing scope walk. Add `utils/caught-values.ts` for caught-input binding discovery and the small local guard checks described below. These internal helpers do not become package-root exports.

For callee-gated rules, support the existing namespace-subpath and named-barrel namespace imports, including aliases; reject type-only imports, locally shadowed names, and unrelated lookalike objects. A runtime import gate is not permission to match arbitrary variables by name. Direct imports of individual functions, CommonJS imports, computed callees, cross-file aliases, and unknown user wrappers are not newly inferred by this change. State these AST boundaries in tests rather than pretending to provide type-aware coverage.

The following cases describe the named rule in isolation. A valid case can still violate a different intentionally stricter rule; combined-preset tests carry explicit expected rule-ID sets. Unless a case says otherwise, `Effect`, `Option`, `Schema`, `Atom`, and `Function.pipe` denote real runtime imports from their documented subpaths, and referenced values are fixture declarations. The final typed integration fixtures must declare real compatible values rather than relying on unresolved identifiers.

#### `no-manual-tag-check`: comparisons only, error

Delete the bare `MemberExpression` reporting branch. Report once for a binary equality/inequality comparison (`===`, `!==`, `==`, `!=`) with a static `_tag` access on either side, or literal `'_tag' in value`. Retain the Effect-runtime-import gate and the active internal-data-tag ownership split. Accept both noncomputed `value._tag` and computed string-literal `value['_tag']`; do not mistake `value[key]` or `value[_tag]` for a static property. The presence test requires a string literal, not an identifier merely named `_tag`.

- Invalid: `error._tag === 'DomainError'`; `'DomainError' !== error._tag`; `'_tag' in error`; `error.reason._tag === 'StatusCodeError'`.
- Valid for this rule: `Effect.log(error._tag)`; a template containing `error._tag`; `Effect.catchTag('DomainError', handler)`; `Match.tag('DomainError', handler)`; `key in error`; tag logic in a file with no runtime Effect-stack import.
- Owned elsewhere: `option._tag === 'Some'` with an Option import must report through `no-effect-internal-tags`, not both rules.

Message: explain that manual tag branching duplicates the selected dispatch abstraction; name `Effect.catchTag` / `catchTags`, `Match.tag`, and `Effect.catchReason` for nested reasons. Record the deliberate deviation from ES `04-services-and-layers.md:115`; do not claim the references prohibit all manual comparisons.

#### `no-unknown-error-message`: caught-input provenance, error

Replace `isErrorLikeName` with binding identity. Under the existing runtime Effect-stack gate, register identifier parameters of native catch clauses and the `catch` handler of an object passed directly to a bound `Effect.try` / `Effect.tryPromise`. Handle arrow/function expressions and object-method syntax. An object property named `catch` elsewhere is not sufficient. Resolve a same-file function declaration or immutable function initializer used directly as that handler; do not chase mutable, computed, spread, conditional, or cross-file callback wiring.

Report a direct tracked-input `.message` / `['message']` read, `String(input)` using the actual global `String`, or message destructuring from that input. Parameter destructuring such as `catch: ({ message }) => ...` is itself a report because it extracts from the unknown boundary before validation. Report a declaration once even with multiple matching properties. Do not taint every local whose spelling is `error`, or propagate a catch taint into decoded return values.

Use small, explicit syntactic proofs to avoid rejecting the fix: a `.message` read/destructure is allowed in a branch that has proved the **same binding** is an unshadowed `Error` instance, or is non-null object-like and has the literal `message` property. `String(input)` is allowed after a same-binding primitive/null guard. Recognize the consequent of an `if` and the appropriate right-hand side of a short-circuit guard chain. Do not build a general TypeScript control-flow engine: a write to the binding invalidates the proof; an unrelated function boundary cannot inherit a speculative proof; arbitrary user type predicates and assertions are not automatically proof. Decoding/narrowing into a separate typed binding is the general escape from the raw-input rule. Other rules may still reject `instanceof Error` outside an explicitly relaxed boundary.

- Invalid: `catch (problem) { use(problem.message) }`; `catch (problem) { String(problem) }`; `catch (problem) { const { message: detail } = problem }`; `Effect.tryPromise({ try: work, catch: problem => problem.message })`; the equivalent `Effect.try` cases and destructured handler parameter.
- Valid: a typed `catchTag` / `catchTags` handler reading its error's message; `const error = notification; use(error.message)`; a same-name inner function parameter that is not the catch binding; `catch (problem) { const decoded = decodeProblem(problem); use(decoded.message) }`; `.message` after the explicit safe local guard; `String(problem)` after a primitive guard; a locally shadowed callable named `String`.
- Capture control: `catch (problem) { const later = () => problem.message }` still refers to the raw caught binding and is invalid; a shadowing `later(problem: Notification)` is not.

Message: preserve the unknown input as a typed error's `cause`, or decode/narrow it into a validated binding before extracting details. Do not promise that a cast or renaming makes an unknown error safe. This remains bounded AST analysis; unsupported flow-sensitive narrowing is documented, not represented as type-aware certainty.

#### `no-pipe-ladder`: closure nesting, error

The criteria, their derivation, and the stress test are in the [Effect nesting-rules analysis](../../analysis/effect-nesting-rules-first-principles.md) (section 2, C1 to C3 and C7; section 3). A step callback is an inline, non-generator function passed directly to a bound `Effect.flatMap`, `andThen`, `tap`, `tapError`, `tapCause`, `tapDefect`, `catch`, `catchCause`, `catchDefect`, `catchEager`, `catchIf`, `catchFilter`, `catchCauseIf`, `catchCauseFilter`, `catchTag`, `catchReason`, `forEach`, `acquireRelease`, or `acquireUseRelease`, or held as a property value, under any key, of the verified handler object of `catchTags`, `catchReasons`, `matchEffect`, or `matchCauseEffect`. Type assertions and parentheses around a callback do not hide it. A continuation closure is a bound `Effect.flatMap`, `andThen`, or `tap` call with an inline function argument, in pipe-step or data-first form.

Report a step callback whose body contains a continuation closure once, at its first continuation. Search the body without entering generator functions, function declarations, class bodies, or another step callback; any other callback, such as an array `map`, is searched through. Structural members (`all`, `race*`, `scoped`, `ensuring`, `fork*`, `run*`) never own a ladder. Keep the bound-namespace recognition of the other callee-gated rules. Register the overlap with `no-flatmap-ladder` in the ownership registry: that warning defers when the flatMap's step callback holds a closure ladder and keeps reporting opaque continuations such as `() => Effect.flatMap(other, f)`.

- Invalid: `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save({ user, posts })))))`; the data-first `Effect.flatMap(getUser, (user) => Effect.flatMap(fetchPosts(user.id), (posts) => save({ user, posts })))` and standalone-`pipe` spellings; the same inside a `catchTag` handler, a `forEach` body, a release callback, or a `catchTags` map value; a ladder inside `Effect.gen` that could have held it; one reached through an array callback.
- Valid: the flat chain `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id)), Effect.tap((posts) => log(posts)))`; a value `Effect.map` inside a step callback; `Effect.flatMap(namedFn)` and `Effect.andThen(effect)`; one-step or adornment-only handler bodies such as `Effect.catch((cause) => Effect.logWarning('failed', { cause }).pipe(Effect.as(fallback)))`; `Effect.all` items; a generator passed to `Effect.gen` inside a callback; nested pipes with no callback; Layer, Schema, and Schedule pipes.
- Count: the three-deep `first.pipe(Effect.flatMap(() => second.pipe(Effect.flatMap(() => third.pipe(Effect.map(f))))))` reports once, because the middle callback holds only a `map`.

Message: an inline continuation nested inside another Effect callback sequences steps by indentation, like nested `.then` or `try`/`catch`; `yield*` each step in one `Effect.gen` or `Effect.fn`, and keep one-step handler bodies and `Effect.all` items as they are.

#### `no-effect-call-in-effect-arg`: data-first transformations, error

The eligible outer call is a bound v4 transforming combinator: `map`, `flatMap`, `andThen`, `tap`, `flatten`, and the actual v4 transforming `catch*` / `zip*` exports. Record the explicit verified member set and data-first arity/signature shapes in `utils/effect-composition.ts`; do not add a future-facing string-prefix wildcard. For this rule, `flatten` has a one-argument data-first form; dual combinators must have a data-first argument layout. The first argument must itself be a direct bound Effect call. Do not search every argument or walk through callback bodies to turn a data-last overload into a data-first match.

Never report a runner (`run*`), fork (`fork*`), `acquireRelease`, `scoped`, or `ensuring` as the offending outer call. Exempting the wrapper does not hide a separate transforming violation nested within it. Use the ownership rules in §3.7 to prevent duplicates without lowering an error to the existing flatmap warning.

- Invalid: `Effect.map(Effect.succeed(1), f)`; `Effect.map(Effect.flatMap(Effect.succeed(1), f), g)`; `Effect.flatten(Effect.map(work, f))`; `Effect.catch(Effect.tryPromise(work), recover)`; corresponding const, named-function return, and pipe-alias placements.
- Valid: `Effect.map(work, f)`; `Effect.flatMap(work, () => Effect.succeed(value))`; a data-last overload whose first argument is another Effect because that argument is a continuation rather than the source; `Effect.runPromise(Effect.gen(...))`; `Effect.forkChild(Effect.gen(...))`; `Effect.acquireRelease(Effect.sync(acquire), release)`; `Effect.scoped(Effect.gen(...))`; `Effect.ensuring(work, Effect.sync(cleanup))`.
- Parent exclusion control: `Effect.runPromise(Effect.map(Effect.succeed(1), f))` must still report the inner transformation, not the runner.

Message: use pipe style for transforming tails or `Effect.gen` for nested logic. `missed-pipeable-opportunity` ships at warn and is measured against these cases; retain the custom rule in this release. The optional future deletion remains a recorded follow-up, not an unproven dependency of this cutover.

#### `no-inline-schema-compile`: inline schema construction, warn

Remove the uppercase-identifier/member-reference heuristic and its recursive `fromJsonString` special case. Match a bound decoder or encoder factory invoked within a function with a direct bound `Schema.*(...)` expression in its schema-argument position. The schema-construction call is the evidence; a hoisted identifier, member reference, or schema parameter is allowed. Check decoder/encoder creation even when the resulting decoder is returned or assigned before application: rebuilding the schema is the selected smell, not immediate application syntax. Keep `Schema.is` / `asserts` outside this narrowed decoder/encoder policy. Verify actual v4 compiler member names against the pinned source before retaining the existing identifier list.

- Invalid: `input => Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))(input)`; `raw => Schema.decodeSync(Schema.fromJsonString(User))(raw)`; and any function returning a decoder factory whose schema argument is a new inline `Schema.*(...)` expression.
- Valid: `input => Schema.decodeUnknownEffect(User)(input)` with a hoisted User schema; the corresponding `models.User` case; decoding/encoding with a schema parameter; module-scope `Schema.decodeSync(Schema.Struct(...))`; calls to an opaque `makeSchema()` not recognized as a bound Schema constructor.
- Deliberately syntactic boundary: do not add whole-function allocation tracking for a schema first assigned to a local variable. This rule catches the specified inline construction form, not every possible cache miss.

The supplied registry is keyed by **Schema AST identity**, not necessarily by the outer schema wrapper (`compilerRegistry.ts:33,181–188`). Message: constructing schema structure per call can defeat parser-cache reuse; hoist stable schemas, and optionally decoder factories. Do not claim every `Schema.*` call always allocates a new AST or that using a hoisted schema with an inline decoder recompiles it. A justified disable remains available for intentionally input-dependent schemas. Update rationale class and meta recommendation with the warning severity.

#### `no-return-null`: Effect values only, warn

Report `return null` only when its nearest enclosing function is a generator directly owned by `Effect.gen` or the supported direct/named forms of `Effect.fn`. Stop at every intervening function boundary. Also report bound `Effect.succeed(null)` anywhere, independent of generator ancestry. Do not expand into arbitrary generators, ordinary functions returning Effects, `return undefined`, promise boundaries, or a blanket TSX ban. `fnUntraced` is not silently added to the settled matcher scope; any broader family coverage needs a separately recorded decision.

- Invalid: `Effect.gen(function* () { return null })`; `Effect.fn('load')(function* () { return null })`; `Effect.succeed(null)`.
- Valid: a React component returning null, even with an Effect import; `function find(): T | null { return null }`; a nested ordinary helper returning null inside an Effect generator; `return Option.none()`; `Effect.succeedNone`; `Effect.succeed(value)` where the AST value is not literal null.

Message: prefer `Option.none()` / `Effect.succeedNone` for optional Effect results; use `Option.fromNullishOr` and `Option.getOrNull` at nullable interfaces. This is house style, not a claim that Effect cannot carry null.

#### `no-react-state`: five-hook ban, error

Keep the rule ungated. Remove `useState` from its closed set, leaving exactly `useEffect`, `useReducer`, `useContext`, `useCallback`, and `useSyncExternalStore`. Preserve the current bare-call and member-call matching contract; do not silently add import-alias tracking in this change.

- Invalid: `useEffect(...)`, `React.useReducer(...)`, `useContext(...)`, `React.useCallback(...)`, and `useSyncExternalStore(...)`.
- Valid: `useState(0)`, `React.useState(false)`, and atom-react hooks such as `useAtom(atom)`, with or without an Effect import.

Message: use atoms for shared/server state and `useState` only for state local to one component; use `ScopedAtom` for the chosen context-scoping pattern. The rule does not infer whether a particular `useState` value is shared; that restriction belongs to the accompanying house-style instructions. Amend PA-3 in the same behavior change.

#### `no-fromnullable-nullish-coalesce`: v4 names, error

Keep the public rule name for continuity of the rule's identity; remove its v3 matcher. Match exactly the selected forms `Option.fromNullishOr(value ?? null)` and `Option.fromUndefinedOr(value ?? undefined)`, with import-binding checks. `undefined` must denote the global undefined value, not a shadowed local. Do not combine all nullish fallbacks into one unqualified equivalence.

- Invalid: the two selected expressions above, including namespace aliases.
- Valid: `Option.fromNullishOr(value)`; `Option.fromUndefinedOr(value)`; `Option.fromUndefinedOr(value ?? fallback)`; `Option.fromNullishOr(value || null)`; a local Option lookalike; the removed v3 API under this rule, which tsgo's outdated-API check owns.

**No autofix.** For `fromNullishOr(value ?? null)`, removing the fallback preserves nullish treatment. For `fromUndefinedOr(value ?? undefined)`, removing it changes `null` from None into Some(null), as the supplied Option source explicitly documents. Its safe simplifying guidance is `Option.fromNullishOr(value)` when both null and undefined are absent; use plain `fromUndefinedOr(value)` only when null is impossible or intentionally preserved. Test both runtime truth tables in the typed fixture corpus. Do not describe the second transformation as unconditional redundant syntax.

#### `no-atom-registry-effect-sync`: v4 Atom Effects, error

Bind Atom to `effect/reactivity/Atom`, not the v3 atom-react source. Within the direct `Effect.sync` callback, report bound `Atom.get`, `set`, `update`, `modify`, or `refresh` calls that create an Effect rather than executing the intended operation. Handle expression and block callback bodies. Remove all name-based `atomRegistry` matching. Do not report a nested `Effect.gen` / Effect generator body merely because its syntax lies inside the sync callback; it has its own execution boundary. An immediate invocation inside that callback may be inspected, but an unrelated declared function is not presumed executed.

- Invalid: `Effect.sync(() => Atom.set(count, 1))`; `Effect.sync(() => { Atom.refresh(count) })`; equivalent direct calls for get/update/modify and namespace aliases.
- Valid: `yield* Atom.set(count, 1)` inside a generator; the direct Effect value `Atom.set(count, 1)`; `Effect.sync(() => registry.set(count, 1))`; the same synchronous call on a variable literally named `atomRegistry`; unrelated/shadowed Atom objects; a properly yielded Atom operation within its own nested Effect generator.

Report at the offending Atom call, with one diagnostic per offending call rather than one arbitrary first descendant. Message names the actual method: it returns an Effect; yield it from Effect code instead of wrapping it in `Effect.sync`. Registry instance get/set/update/modify/refresh are synchronous and remain valid. Keep this rule in `effect-react`, as settled, even though the v4 Atom API itself is not intrinsically React-only.

#### `no-effect-escape-hatch`: v4 die/orDie, error

The closed forbidden member set is exactly `die` and `orDie`. Continue matching bound member references, not only invocations, so `program.pipe(Effect.orDie)` reports. Keep the existing test filename exemption; remove all dropped-owner guards. Do not introduce entry-file allowlists in rule code.

- Invalid outside tests: `Effect.die(reason)`; `Effect.orDie(program)`; `program.pipe(Effect.orDie)`; `const boom = () => Effect.orDie(program)`; `function boom() { return Effect.orDie(program) }`; a const pipe alias using `Effect.orDie`.
- Valid: typed failure/recovery; an unrelated local Effect object; the same use under an existing test filename; removed `dieMessage` / `orDieWith` spellings **for this rule only**; a legitimate use with an engine-recognized, justified inline disable.

Message: preserve recoverable failures as typed errors; for a truly unrecoverable invariant or entry configuration failure, use a local disable explaining why recovery is impossible. Mention consumer `overrides` for a deliberate file-scoped exemption. The rule does not itself infer whether a failure is recoverable.

#### New `no-string-error-channel`: structured failures, error

Add one reimplemented rule in the `effect` domain, rationale `agent-failure-mode`, with binding-based `effect-callee` gating. Match a bound `Effect.fail` with exactly one non-spread argument whose expression is a string literal or untagged template literal, including interpolated templates. Peel transparent TypeScript assertion/satisfies/non-null and parenthesis wrappers for classification, so `Effect.fail('timeout' as const)` is not an escape. Do not constant-fold identifiers or tagged-template function results.

- Invalid: `Effect.fail('error')`; `Effect.fail('error' as const)`; `` Effect.fail(`error ${code}`) ``; the same calls inside named wrappers, callbacks, tests, or pipe aliases.
- Valid: `Effect.fail(new DomainError(...))`; yielded Data/Schema tagged errors; `Effect.fail(error)` where the argument is an identifier; `Effect.succeed('ready')`; string constants; an unrelated local `Effect.fail` function; type-only imports.

Report once at the string expression. Do not autofix, because inventing an error class, tag, and fields is a domain decision. Message: represent failures with a named structured/tagged error so callers have a stable recovery contract; internal Data-tagged and wire-facing Schema-tagged errors both remain legitimate under ADR-001. A string error is legal Effect code, not an “untyped” runtime error; this is the explicitly chosen house style. Add the decision deviation to the reference-corpus metadata.

#### New `no-discarded-failure`: read or record the failure, error

Add one reimplemented rule in the `effect` domain, rationale `agent-failure-mode`, with binding-based `effect-callee` gating. The criteria and the stress test are in the [Effect nesting-rules analysis](../../analysis/effect-nesting-rules-first-principles.md) (section 2, C4 to C6; section 4). A blind handler is an inline function with no parameters, or whose parameters are all plain identifiers that its body never references by name. Destructured and rest parameters count as read, `_` is an ordinary unread name, and name matching does not model shadowing.

Report once, at the combinator call, a blind handler passed to a bound `Effect.catch`, `catchCause`, `catchDefect`, `catchEager`, or `mapError`; held as `onFailure` of `match`, `matchEffect`, `matchCause`, `matchCauseEffect`, `matchEager`, or `mapBoth`; or held as `catch` of `Effect.try` or `Effect.tryPromise`. A type assertion around the handler does not hide it, and the last definition of the handler property is the effective one; a later spread or runtime-computed key leaves it unknown. Skip it when a bound `Effect.tapError`, `tapCause`, or `tapDefect` recorded the failure first, as an earlier argument of the same pipe call or as the data-first source.

- Invalid: `work.pipe(Effect.catch(() => Effect.succeed(0)))`; `Effect.catchCause(() => Effect.void)`; `Effect.mapError(() => new NotFound())`; `Effect.tryPromise({ try: () => fetch(url), catch: () => null })`; `Effect.match({ onFailure: () => undefined, onSuccess: (value) => value })`; `Effect.catch((_) => fallback)`.
- Valid: `Effect.catch((cause) => Effect.logError('failed', { cause }).pipe(Effect.as(fallback)))`; `Effect.mapError((cause) => new NotFound({ cause }))`; `Effect.catch(({ message }) => log(message))`; `work.pipe(Effect.tapError(log), Effect.catch(() => fallback))`; `Effect.catch(Effect.tapError(work, log), () => fallback)`; the tag- and predicate-scoped `catchTag`, `catchTags`, `catchReason`, `catchReasons`, `catchIf`, `catchFilter`, `catchCauseIf`, and `catchCauseFilter`; the named discards `orElseSucceed`, `ignore`, `ignoreCause`, `option`, `result`, and `exit`; a handler passed by name.

Do not autofix: carrying the cause, logging, and narrowing to tags are different fixes. Message: a handler that never reads its error drops the cause and absorbs new failure types. The fixes it names are tag narrowing with `catchTag`/`catchTags`, the error as `cause`, and recording first with `tapError` or `Effect.ignore({ log: true })`. The warn-level `effecttsgo/catch-to-ignore`, `catch-to-or-else-succeed`, and `catch-all-to-map-error` also report constant handlers; ADR-007 allows the overlap because this rule is stricter and runs without a TypeScript project.

### 3.7 Ownership cleanup and surviving-rule coherence

Remove `isInAnyWrapperOwnedExpression` from **every surviving call site**, including `no-effect-all-step-sequencing`, which is present in the supplied code but absent from the short F1 enumeration. Also remove dropped-wrapper suppression from `no-effect-escape-hatch`, `no-effect-side-effect-wrapper`, `no-effect-bind`, `no-effect-call-in-effect-arg`, `no-pipe-ladder`, `no-effect-ladder`, `no-flatmap-ladder`, and their eligibility helpers. Delete wrapper-only utilities when no remaining rule uses them; keep general `isFunctionLike`, return-expression, and bound-namespace helpers still in use.

Remove `as` and `async` from single-callee ownership. Retain `bind` only for the exact predicate the surviving `no-effect-bind` actually reports. Remove the `orElse` ownership branch in `isOwnedBySpecificEffectLadderRule` because its owner is dropped; do not rename it to `catch` without the specified transforming contract. A parent Effect call is not automatically an owner: `isDirectArgumentOfBoundEffectCall` must be replaced by a check that the parent will actually report the same nesting problem. This prevents an exempt runner/resource helper from hiding an inner violation.

Use a small declarative ownership registry in `utils/effect-ownership.ts` containing reporter/owner rule IDs and shared eligibility predicates. Every suppression must reference an active custom rule whose predicate holds for that exact shape. Validate that registry against active manifest rows. Do not add a second rule dispatcher or global mutable routing state. A static test also rejects imports/usages of the retired broad wrapper helpers; otherwise a registry-only test could pass while old unregistered guards remain.

Preserve distinct surviving ladder intents with explicit precedence:

1. `no-effect-ladder` owns its existing deep first-argument chains in const/return positions, but only where the outer call satisfies the approved transforming contract. It does not reintroduce runner/fork/resource bans through another rule.
2. `no-effect-call-in-effect-arg` owns other qualifying direct data-first nesting, including shallow const/return and named-wrapper cases. It remains error-level.
3. `no-flatmap-ladder` retains its existing warning for qualifying nested flatMap logic in callback/const-return shapes not already reported by the two error owners. A former warning owner must not suppress a newly specified error case merely because its predicate also matches.

Share predicates between reporter and suppression paths; do not approximate one with a looser descendant scan. Different concerns such as forbidden `orDie` and nested composition may report separately. “Exactly once” is per diagnostic intent, not a requirement to suppress every other useful rule in the file.

Reclassify the cited historical wrapper-owned cases one by one. Cases belonging to deleted rules move to typed tsgo coverage; cases now allowed by a narrowing stay valid with a changed explanation; qualifying surviving cases become invalid. Old no-pipe cases with opaque `f` / `g` steps do not become qualifying merely because their old owner disappeared. Remove the extra multiple-provide and type-alias duplicate-intent replay functions and invocations after their custom rules are deleted; replace their useful coverage at the delegated/full-preset layer.

#### Remaining v4 cleanup and kept messages

Clean only the dead branches named by the alignment plan and the directly affected shared import lists. Remove `Either` branches in `no-branch-in-object`, the obsolete Cause/Either entries and stale Result Left/Right expectations in `no-effect-internal-tags`, and the old `effect/Reactivity` branch. Populate remaining internal-tag mappings only from verified v4 representations; do not invent a flat Cause tag mapping from v3 names. Retarget shared Atom lookups in surviving all-step/side-effect helpers to the v4 module as well as the named Atom rule. Remove `zipRight` from side-effect-wrapper logic; do not blanket-ban legitimate `andThen` arguments as a replacement.

`no-effect-side-effect-wrapper` must still protect the decided eager-value use of `Effect.as`, not ban all `as`. Check the value slot correctly: first argument in data-last form, second in data-first form; the first argument of data-first `as` is the source Effect. Preserve the reviewed eager-call classification from `utils/side-effects.ts`, and test both arities with concrete eager side effects such as a console/mutation helper and valid pure value mapping. Do not use a generic “all function calls are impure” claim. The helper's full contents are not included in this packet; reading it is a required validation during WI-05, not evidence that it already satisfies this contract. If it lacks a required case, fix that specific eager-value classification with positive/pure controls, without creating the rejected generic succeed/impurity rule.

Audit every remaining `effect/*` or atom module/member literal used by touched rules against the pinned v4 source. Retired v3 fixture cases may remain retained source evidence, but active semantic replay must describe the v4 behavior. No compatibility alias or obsolete runtime matcher is kept solely to maintain an old test count.

Make `ruleMessage` fail for an unknown/unwritten runtime rule instead of manufacturing an intent phrase. Export an internal `hasExplicitRuleMessage` query for tests; do not expose a mutable message map in the package root. Every implemented custom rule gets an explicit why, a concrete fix, and reference/house-policy attribution. Restore upstream wording only when it remains accurate after narrowing. Remove messages for dropped runtime rules; their historical rationale remains in the manifest. Never retain the old unconditional schema-recompilation or multiple-provide/memoization claims.

### 3.8 Six durable gates

These six contracts are required outputs. Grouping two related assertions in one test file does not eliminate either obligation.

**G1: reference-corpus contract.** Add checked-in, minimal reference cases under `test-fixtures/effect-v4/` and `src/reference-corpus.test.ts`. Each case has a stable ID, original repository/version/path/line range, actual source excerpt, lint filename, permitted harness changes, intended valid behaviors, and explicit deviations keyed by rule ID. Keep raw source and a house-style adaptation distinct where necessary. Run every enabled custom Effect/effect-react rule on each relevant corpus case, defaulting to zero diagnostics; deviations require an exact expected rule and count rather than skipping the whole snippet. Add controls for general and boundaries preset rules in their existing suites rather than mistaking those policies for universal Effect-reference guidance.

No blanket “every rule accepts every original reference snippet” assertion is possible, because barrel imports, string failures, tag comparisons, and chosen data-first nesting restrictions are deliberately different. Each exception names its owning decision. An unexpected hit is a failure and is never added to the exception list automatically. For positive reference coverage, adapt only the conflicting syntax and preserve the behavior under test. Changing barrel imports to namespace subpaths does not justify rewriting a callback under test. Raw source containing obsolete beta APIs can be AST evidence without being a valid TypeScript-rc program; only the explicitly version-adapted typed controls are compiled in G6.

Required provenance register:

| Corpus case | Supplied provenance | Required expectation and deviation handling |
| --- | --- | --- |
| Gen-first guidance and error returns | `EF/LLMS.md:14–18,25–46` | `return yield*` is accepted; additional Effect tails remain valid. Original value barrel imports are explicit `no-barrel-import` deviations; positive copy changes imports only. |
| Named and untraced reusable functions | `EF/LLMS.md:65–94` | Keep reusable function guidance, generator returns, and `Effect.fn.Return` annotations valid; do not ban the chosen explicit types. |
| Explicit service interface | `EF/LLMS.md:135–145` | An explicit `Effect.Effect<...>` service member is accepted; service ID strings are accepted. |
| Nested reusable method and succeed(variable) | `ES/tests/03-basics.test.ts:80–87` | Nested named fn, `Effect.succeed(value)`, and return of a computed value are accepted. |
| Effect.as and string-failure edge | `ES/tests/03-basics.test.ts:198–207` | `Effect.as('done')` is accepted. The `Effect.fail('timeout' as const)` subexpression is an explicit new-rule deviation, not a failed as test. |
| Hoisted schema, inline decode and encode | `ES/packages/website/docs/05-data-modeling.md:166–183` | Decoding and encoding with hoisted `MoveFromJson` are accepted; string payload constants and generator returns are accepted. |
| Service methods, typed handler, nested reason | `ES/packages/website/docs/04-services-and-layers.md:84–125` | Explicit method types, handlers that return early, and typed error values are accepted. Line 115's tag comparison is a deliberate `no-manual-tag-check` deviation. Extract unrelated decoder construction separately rather than silently forgiving a new hit. |
| Typed catchTag message and success strings | `ES/packages/website/docs/06-error-handling.md:116–181` | Typed handler `.message` and `Effect.succeed('Recovered...')` are accepted. |
| Unrecoverable app-entry defect | `ES/packages/website/docs/06-error-handling.md:186–202` | Raw app-entry `orDie` is an expected house-style diagnostic; a justified inline-disable adaptation is accepted by the real engine. Do not rename the fixture to a test file to avoid the diagnostic. |
| Nested layer/helper generators | `ES/packages/website/docs/13-cli.md:254–287` | Nested helper generators and explicit service interfaces are not blanket violations. The plain save/gen wrapper is a separate tsgo rewrite case under primary LLMS guidance, not an all-diagnostics-valid typed fixture. |
| Schedule pipe inside retry | `ES/packages/website/docs/03-basics.md:86–97` | Nested Schedule steps do not trigger custom pipe-ladder. |
| Legitimate sync and resource management | `EF/packages/effect/test/RcRef.test.ts:68–83` | Sync mutation and acquire/release constructors remain valid. |
| Forked nested generator | `EF/packages/effect/test/Metric.test.ts:347–366` | Passing a nested gen to `forkChild` is valid; no blanket nested-gen or outer-call ban. |
| Nested data-first map and string failure | `EF/packages/effect/test/Cause.test.ts:650–658` | String failure and data-first `map(succeed(...), ...)` are separate explicit house deviations. Positive controls preserve the surrounding test intent without claiming these shapes are house-compliant. |
| as with constant string results | `EF/packages/effect/test/Effect.test.ts:3608–3619` | `Effect.as('success' as const)` remains valid; string-failure subexpression is separately expected invalid. |
| Parser-cache identity | `EF/packages/effect/src/internal/schema/compilerRegistry.ts:25–40,170–192` | Source provenance for the cache message and schema hoisting cases, not a demand to lint the entire library internal as app code. |
| Atom versus registry return contracts | `EF/packages/effect/src/reactivity/Atom.ts:2428–2513`; `AtomRegistry.ts:70–87` | Five Atom methods yield Effects; corresponding registry instance methods are synchronous controls. |
| Option null/undefined distinction | `EF/packages/effect/src/Option.ts:760–808` | Preserve the distinction between nullish absence and Some(null); verify the rule's suggested transformations keep it. |

The alignment plan also cites excerpts not fully supplied here, including its nested-reason `catchReason` API reference. While building, extract those from the specified pinned source and retain their actual provenance. Do not relabel the supplied services example as an unseen error-handling example just to match a historical line number.

**G2: repeatable app measurements.** Add `scripts/checks/effect-app-audit.ts` accepting explicit t3code/executor checkout paths, expected revisions, output path, and measurement mode. No implicit clone, patch, install, or source edit in either app. Require the dependencies and TypeScript projects needed for the typed pass; fail with a useful reason when missing. Baseline revisions are t3code `53456bc01` and executor `480b390ee`, with the recorded Effect versions rc.115 and beta.59 respectively. Do not force these apps onto rc.117 just because the synthetic integration consumer uses that version.

Run an AST-only pass with the existing baseline engine and built plugin for comparable custom-rule counts; run a supported patched-engine pass for delegated and composed behavior. The typed engine is the isolated harness consumer's patched oxlint (never the apps' own toolchains, which patch a different tsgo version), invoked with cwd at the app root and `--config` pointing at a temp file outside the app tree. Type-aware linting picks each file's project the way tsserver does (nearest listing `tsconfig.json`, its references, then ancestors), and on the pinned CLI `--tsconfig` changes only import resolution, so coverage is checked per file against the project the engine picks. Before any count is trusted, a canary must pass: structured output shows tsgolint loaded the expected project with a file count matching the selected-file count, and at least one `effecttsgo/*` diagnostic is reported. A failed canary marks that app's typed evidence unusable, which ships JSON `off` under §3.2. Record each app's Effect version against tsgo 0.45.0's development range (`effect ^4.0.0-beta.107`); executor's beta.59 sits below it. The typed pass includes a measurement-only `prefer-schema-over-json: warn` override. Use the same source inclusion/exclusion policy as the recorded run. Record actual selected file count and project coverage, ignored files, revision/dirty status, dependency versions, engine versions, config hash, source/test counts per rule, and rule/file/span identities for the two delegation evaluations. Unknown names, missing projects, zero selected files, truncated output, or a tool crash are failures, not zero diagnostics. Do not allow app-local configuration discovery to silently change the selected rule set; verify the explicit-config behavior against the pinned CLI when writing the runner.

Use structured diagnostic output and a large-output-safe execution path, such as file-backed stdout/stderr, rather than counting text in the current helper's default process buffer. A successful lint measurement may have lint exit code 1; the audit script returns success only after parsing the expected diagnostic result and ruling out config/startup/type-aware initialization failures. Keep raw evidence outside package artifacts and commit a compact summary plus the reviewed after-count table in the execution record. Fingerprint the built plugin and normalized effective policy, not only the repository commit: documentation/report commits must not create a self-referential final-commit requirement. After choosing the final JSON severity, rebuild and repeat the shipped-config pass; retain the candidate-rule pass separately from actual shipped after counts. Do not fabricate after counts in this plan.

Compare `missed-pipeable-opportunity` with the exact custom nesting spans, including shallow one-transform cases and valid runners/resources, not just aggregate totals. Record coverage gaps and the effect of the shipped `pipeableMinArgCount: 2`; alternate thresholds are measurement-only. Keep the custom rule this release. Apply the JSON decision procedure in §3.2 before finalizing generated settings. This app gate is required execution/release evidence for this alignment, not a routine CI job that assumes MP's external checkouts exist on every runner.

**G3: pinned policy and rules-page drift.** G3 has two halves. G3a is offline and runs in `pnpm check`: the metadata/schema/category union, projections, the supported matrix, and `rules-page:check`. G3b is the patched-engine policy comparison inside the oxlint-route smoke and runs only in `pnpm check:effect-integration` (§3.12). G3a adds a policy check that validates the 113-rule metadata/schema/category union and every shipped ID, severity, off entry, and cross-package projection. It detects renamed rules and category moves, along with missing rules, new rules, and a changed mapping, even when the total count stays 113. Assert key options, plugin loading, type-aware mode, the category-bleed off list, and matching generated test scopes.

G3b compares the Effect and Effect+React compositions at a normal path, a test path, and an illustrative explicit boundary path. Print-config output labels native and tsgo expansion separately from explicit custom settings, because the engine does not enumerate custom JS-plugin rules. Prove actual file matching through fixture lint; print-config is display-only for scopes. The old string-substring “test pattern” helper is insufficient for arbitrary boundary or directory scopes; use an explicit representative-scope selection, not a general-purpose pretend glob interpreter.

Reuse `materializeEffectiveRules` and native key normalization after making the execution cwd explicit; do not normalize `effecttsgo/` into this package's namespace or exempt all unknown plugin prefixes. Resolve exact tsgo names against the pinned schema/live supported catalog. The offline collector never tries to load the tsgo fragment on root oxlint 1.58.

**G4: replacement floors and ownership integrity.** Assert the eleven listed replacement edges, actual global severities, and the explicit strict-provide test exception. Assert every active suppression owner exists, is implemented, and covers the suppressed shape. Add positive “old wrapper” regressions and negative “parent is exempt” regressions. Reject retired helper use and stale dropped-rule names in active ownership metadata/replay branch IDs. Keep negative tests for the gate itself; each of a nonexistent owner, a dropped owner, and a lowered replacement severity makes it fail. Expose `validateOwnershipRegistry(registry, manifest)` and `assertReplacementFloors(manifest, fragment)` as pure, internally exported functions so negative tests call them with altered copies. Do not scan historical prose and vendored source as though they were live owners.

**G5: message completeness.** Assert every preset-enabled custom rule, and preferably the exact runtime set, has an explicit nonempty message containing why/fix guidance and a recorded reference or house-policy reason. Test that a nonexistent rule name fails lookup. The fallback is removed, and the new explicit-message query bypasses it, so the test cannot pass by generating its own expected message. Review wording accuracy separately from keyword presence.

**G6: packed consumer and route contract.** Extend packed-consumer verification with the default patched-oxlint route and the independent patched-tsc route, while retaining the current non-Effect runtime/type/package smoke. Install **both produced tarballs** in the oxlint integration consumer so a source-tree import cannot mask an omitted JSON export. G6 runs through `pnpm check:effect-integration` and `release:prepare`, never `pnpm check` (see §3.1). Assertions are described next.

### 3.9 Isolated integration runner and failure model

Add `scripts/lib/effect-consumer-harness.ts` around the existing temporary-consumer and command helpers. Inputs are the two tarball paths, exact integration versions, and selected route. It creates a temporary directory outside the monorepo and writes a consumer `pnpm-workspace.yaml` that copies the root's `minimumReleaseAge`, `minimumReleaseAgeIgnoreMissingTime`, `minimumReleaseAgeStrict`, `trustPolicy`, and `strictDepBuilds` (`pnpm-workspace.yaml:20-33`), plus a private `storeDir` and `packageImportMethod: copy`; a temp directory outside the workspace otherwise inherits none of them. Every integration pin, including the unsupported-target control, must be older than the seven-day release-age window at run time; a younger pin is a reported setup failure, and pin bumps respect the window so `release:prepare` on `main` is not blocked. MP decision (2026-09-26): the first `@effect/tsgo` release that contains the `extends` fix (Effect-TS/tsgo#768) may enter before the window closes, through exact-version `minimumReleaseAgeExclude` entries for `@effect/tsgo` and its platform binary packages in both the root workspace and the copied consumer settings. The window stays in force for every other package. It installs with scripts disabled, and explicitly patches only its own binaries. Use a private temporary pnpm store and copy-based package imports for patch targets, avoiding accidental hardlink/store mutation shared with the root. Never patch an external app's installed dependencies. Do not reuse one directory between tsc and oxlint routes.

The runner owns temporary configs, fixtures, log files, and patch state. Stages are create → install → unpatched control → patch → verify → cleanup. A thrown assertion or subprocess error fails the command and retains a bounded diagnostic summary; cleanup runs in `finally`. Interruptions must not mark evidence complete. `script-runtime.ts` wraps `spawnSync` with no timeout, and tsgolint starts a child server that a SIGINT to the Bun parent does not reach; audit and harness subprocesses pass `timeout` and `killSignal`, run oxlint in its own process group so cancellation kills the tree, and record a timeout as incomplete. A killed process may leave a disposable temp directory, but never a modified checkout or published artifact. Repeated runs start clean. Also test running the selected patch twice in one successful consumer.

Extend the engine helper with a fully qualified/full-config execution path. Retain `runOxlintOnSource` for custom-only replays and make it delegate to the common executor; its package-prefix transformation remains specific to its old input. The new path takes an explicit engine, cwd, full config, and source paths and **never** prefixes `effecttsgo/*`, native rules, or an already qualified custom ID. Assertions inspect diagnostic identity/severity and expected exit status, not just any nonzero failure.

Required G6 matrix:

| Consumer/control | Required proof |
| --- | --- |
| Existing unpatched non-Effect consumer | Root plugin imports, base/general composition, existing native and custom diagnostics, and package declarations still work without tsgo or an Effect runtime. Replace `no-effect-as` smoke sentinels with surviving rules and assert dropped runtime keys are absent. |
| Unpatched Effect consumer | Full exported `effectPreset` fails with the expected unknown `effecttsgo` plugin condition. A normal general/base config in that environment still works. |
| Default route, patched oxlint/vite-plus | `effect-tsgo patch --no-typescript --oxlint` succeeds; real `vp lint` and direct consumer-local oxlint report the same selected delegated diagnostic. An error-level diagnostic exits 1 **without** `--max-warnings 0`; a warning-only fixture exits successfully without that flag and fails with it. |
| Mixed plugin run | A surviving custom diagnostic and a delegated diagnostic appear together from the installed tarball composition. No source import or implicit editor session is involved. |
| fn option sensitivity | TypeScript 7 route: the same wrapper corpus is compared with default `effectFn` and the shipped three-value setting, inherited through a consumer tsconfig extending the installed overlay. Assert exact rule-ID/count differences for the recorded wrapper forms, using typed fixtures. Oxlint route: under a consumer tsconfig extending the installed overlay, assert that `effect-fn-opportunity` alone reports each of the three wrapper forms, with no custom-rule diagnostic. Keep an inline-options control with no `extends` that shows all three through `effect-fn-opportunity`, independent of how the engine inherits options. |
| Severity source probe | Deliberately conflicting temporary tsconfig and oxlint severities establish actual precedence. The shipped oxlint overlay contains no second severity map. `diagnostics: false` still allows oxlint diagnostics. |
| Scope behavior | `strict-effect-provide` reports on a Layer in production and is off in all documented test patterns; Context provision remains valid. Boundary-disabled rules turn off only in the chosen fixture path, with in-Effect siblings still active. Later consumer overrides win. |
| TypeScript 7 fallback | Patch TypeScript 7.0.2 only; the installed `effect-tsc.json` supplies inherited options and severities; a selected delegated error fails typecheck. Verify warning exit behavior, test override behavior, and absence of a second oxlint reporting route. |
| Cross-package environment preservation | Extending server/browser then the selected Effect overlay preserves Bun/DOM/JSX settings. On the tsc route, a consumer plugins array with no Effect entry still keeps the overlay's Effect settings (tsgo's merge hook); the control asserts that. |
| Unsupported target | With the supplied mismatch target oxlint 1.85.0, tsgo 0.45.0 patching rejects the target. An attempted Effect lint must not silently pass. Keep this as an explicit compatibility fixture, never as the production/tested pair. |
| Program coverage | On the oxlint route, a file outside the consumer tsconfig `include` yields custom diagnostics and still yields `effecttsgo/*` diagnostics, as does a run with no `tsconfig.json` at all. Assert that observed behavior so a change is noticed. |
| Repeatability | Re-running the patch is safe, reinstalling requires reapplying it, and a second clean smoke cannot depend on the first one's patch state. |

Use narrowly focused configurations for severity and scope probes so unrelated errors do not falsely prove the tested rule fails. Use separate full-composition controls for actual export wiring and category interactions. The typed positive control must demonstrate that the engine processed a real TypeScript project; a file silently outside project coverage is not a pass.

Extend `tool-versions.ts` with `EffectIntegrationVersions` and a reader that combines the default catalog pin, integration JSON, and existing canonical pins. Parse quoted scoped package keys correctly using the existing YAML dependency rather than extending the bare-name regex blindly. Add exact-version and supported-matrix tests, allowing the explicitly pinned Effect prerelease. Root version/workflow validation remains intact. Temporary installs must not disable trust/release-age safeguards without a separately reviewed reason; an unavailable or disallowed pinned version is a reported setup failure.

Add `renovate.json` grouping `@effect/tsgo`, `vite-plus`, `oxlint`, and `oxlint-tsgolint`, including the integration JSON pins through a supported custom manager. Grouping is a review aid, not proof of compatibility: disable automerge for that group and require the generated-policy/matrix and packed-engine gates. Validate the Renovate configuration against its actual supported schema. Renovate has never opened a PR on `mplibunao/backpressure`, so the GitHub app is not active; WI-02 activates it. MP decision: an engineer agent installs and authorizes the app for this repository with the surf-cli skill (`/Users/mp/.claude/skills/surf/SKILL.md`). If that fails, it uses the Claude Chrome extension. If that also fails, it writes a handoff prompt for the Codex desktop agent to finish with its Chrome extension or computer use. The `renovate` skill (`/Users/mp/.claude/skills/renovate/SKILL.md`) owns the activation steps. Activation is done when Renovate's onboarding or first grouped PR appears on the repository. The new or moved `strict` preset in the ahead-of-tag checkout does not enter this policy automatically.

### 3.10 Governance, house style, and deferred work

Write ADR-007, `docs/decisions/007-tsgo-delegation-and-overlap.md`, using the existing template. It supersedes only ADR-001's delegation/overlap clauses and ADR-004's language-service-specific wording. Preserve gen-first, v4-primary, Data-versus-Schema, and graded-severity decisions. State that AST checks may overlap tsgo when stricter or useful without a TypeScript project; the default Effect preset requires the patched oxlint route; the tsc route is an alternative; one selected route has one severity owner; packages ship settings, not a patching runtime. Include the reason for explicit pinned policy and the non-Effect compatibility boundary.

Update the decision index and append dated supersession notes to ADR-001/004 rather than rewriting their historical context. Update current-state rule-pack, preset, intake, rules-reference, and package documentation after the corresponding behavior lands. Amend PA-3 and the taxonomy/gating descriptions together with the five-hook rule change; replace the obsolete six-rule React inventory with the three survivors. Leave the historical source audit explicitly historical instead of pretending it originally audited the new catalog.

Add `docs/references/effect-house-style.md`, linked from `CLAUDE.md` and the setup documentation. The package README must carry the essential consumer instructions itself; an unpublished repository document cannot be the only way a package consumer learns required setup. House style must state:

1. Translate reference value barrel imports to Effect namespace subpaths; explicit Effect/Layer annotations and aliases are welcome. Use gen for logic and fn/fnUntraced for reusable generator functions; ordinary functions returning a non-gen Effect remain allowed.
2. Keep typed structured error channels. Use Data-tagged internal errors or Schema-tagged wire errors as appropriate; do not fail with literal/template strings. Prefer catchTag/catchTags, Match.tag, and catchReason over manual tag branching. Preserve/decode unknown causes rather than guessing by `.message` or coercion.
3. Reserve die/orDie for justified unrecoverable situations with documented disables. Keep run APIs at composition roots/tests; do not run an Effect from inside Effect logic. Root Layer provision needs the explicit strict-provide exemption; test provision is exempt, and Context provision is not the same problem.
4. Use atoms for shared/server state, component-local useState for local UI state, and the chosen ScopedAtom pattern instead of the five banned hooks. Yield the v4 Atom operations; registry-instance operations remain synchronous.
5. Avoid nested Effect control-flow pipes and inside-out transforming towers. Schedule, Layer, and Schema wiring pipes, runner/resource arguments, forked generators, ordinary Effect.as, Effect.never, and legitimate Effect.sync are not blanket banned.
6. Prefer Option for optional Effect results while retaining nullable boundary helpers. Explain the fromUndefinedOr/Some(null) distinction. Hoist stable schema structure; inline decoding of a hoisted schema is fine.
7. Model statuses/outcomes with Schema literals or tagged domain types instead of ad-hoc control-flow strings; this does not ban arbitrary string constants or successful string values. Rebuild `Schema.Class` values with the class construction API, not object spread; ordinary record spread stays allowed.
8. Use the full Effect config, the required patch step, one diagnostic route, and explicit scoped boundary relaxation. Do not disable all diagnostics or reintroduce removed custom-rule settings to make a gate pass.

These are instructions; some clauses have no complete AST enforcement. Do not add a new generic purity rule, a `forkDetach` ban, project-specific key conventions, a strict preset, or v3 compatibility machinery.

Close BP-TD-010 when `no-effect-as` is removed: move `docs/records/tech-debt/open/bp-td-010.md` to `docs/records/tech-debt/done/bp-td-010.md`; preserve ID, creation time, source, and visibility; change status and its status tag, update the timestamp, and append resolution/evidence explaining that the rule was deleted rather than its named-import gap fixed. Do not edit generated introspection mirrors.

Create durable follow-ups for (a) researched treatment of `Effect.forkDetach`, (b) the measured `missed-pipeable-opportunity` coverage comparison and possible future custom-rule retirement, and (c) the next pinned-tsgo bump/category/rule triage. Allocate IDs through introspection when available. If the CLI remains unavailable, inspect all current record IDs and the canonical schema, choose the next unused numbers deterministically, and write records directly without guessing an existing ID. The packet does not establish those next IDs. Until validated, retain the alignment plan's owning deferred section and record validation status in the ledger. The v4 cleanup, written messages, reference suite, JSON evaluation, and package smokes are current work, not new deferrals.

### 3.11 Interface and lifecycle register

| Interface | Before → after | Callers and constraints |
| --- | --- | --- |
| `RuleManifestEntry` | Add optional non-empty readonly `replacedBy`; remove `effectVersionSensitivity`; migrate delegated vocabulary and collection/gating variants. | Manifest helpers, inventory's local mirror interface, generated rows, public type exports, package type smoke, policy tests, docs. No compatibility aliases. |
| `lspOwnedChecks` | Removed; new `tsgoOwnedChecks` returns qualified delegated IDs. | Root exports, inventory/packed export assertions, documentation. v3-only `missing-effect-service-dependency` remains an explicit off row because it exists in the supplied 0.45 style list; nonexistent `importFromBarrel` is not invented. |
| `effectPreset` | Custom `PresetConfig` → full `EffectPresetConfig` composed with `effectTsgoConfig`. | Root/preset exports, preset tests, consumer examples, inventory collection explanation, full-config smoke. Other presets retain their shape. |
| `composeLintConfigs` | Same signature and merge algorithm. | All existing callers remain; new full Effect composition uses it. Native declarations are bridged only at the patched-fragment boundary. |
| `effectBoundaryRules` | New root export, readonly rules object. | Consumer tail overrides, generated boundary examples, schema and real-engine scope tests. No files/globs owned by the object. |
| `ruleMessage(name)` | Same string-return signature; missing entries now throw rather than synthesize guidance. | All visitors and tests; remove dropped-name callers. Internal explicit-presence query supports G5. |
| `resolveVariable` | New internal synchronous binding lookup returning a Variable or null. | Import reference check and caught-input matcher; missing/ambiguous binding means no speculative match. |
| `materializeEffectiveRules` | Retain existing arguments/defaults; add explicit execution context for cwd/temp fixture placement. | The offline collector keeps the defaults; the G3b comparison uses the consumer context. Propagate cwd through the subprocess helper. |
| `generateEffectiveConfigArtifact`, `serializeArtifact`, `EffectiveConfigArtifact` | Removed with the saved artifact. | The collector replaces them; `buildOxlintRuleCatalog`, `materializeEffectiveRules`, `isConfiguredRuleKnown`, and `configuredRuleEntries` stay because the inventory gate and collector use them. |
| `collectRules()` and `renderRulesMarkdown()` (new, `scripts/lib/rules-collector.ts`) | Return the rule list of §3.12 and its markdown page. | Pure over their inputs apart from the root oxlint subprocess; consumed by `gen:rules-page`, `rules-page:check`, and the viewer server. |
| oxlint rule-item reader (new, `scripts/lib/effective-config.ts`) and exported `flattenTestOverridesIntoGlobal` | Parse `--rules --format=json` once into item records; expose the test-file view. | `buildOxlintRuleCatalog` derives its set from the items and keeps its signature. |
| `runOxlintOnSource` | Existing custom-only options retained; shares executor with new full-config runner. | Old replay keeps automatic package-prefix behavior. Integration and app audit use already-qualified settings and explicit engines. |
| Version readers | Existing `CanonicalVersions` semantics retained; new `EffectIntegrationVersions` composes canonical and integration-only pins. | Policy validation, both integration routes, matrix docs generation/checks, Renovate checks. |
| Package JSON configs | Add `./effect.json` and `./effect-tsc.json` exports. | Exact package/tarball allowlists and packed consumer extends tests; original base/server/browser settings are unchanged. |

The only persistent changes are source/config/documentation files and generated evidence artifacts. No application database or running service needs migration. Rules have per-file synchronous state; generators transform immutable snapshots; integration/app runs own disposable process/filesystem state. Duplicate generator invocations must produce identical content. Concurrent verification runs use distinct directories; concurrent writes to committed generated artifacts are prohibited by the normal single-writer workflow.


### 3.12 Rule list, generated rules page, and local viewer

MP decision: drop both saved effective-config JSON files and replace them with one rule list that people can read. Nobody reads the 1,826-line `docs/references/effective-config.json`, and it never listed this package's own rules, because `oxlint --print-config` does not print JS-plugin rules (`docs/references/effective-config.md:8`). The planned `effective-config-effect.json` and its offline fingerprint check are dropped with it. Today no single place says which rules a preset turns on and what each one does.

The design has two steps. Step 1, the collector, builds one plain list. Step 2 is a set of renderers over that list. This change ships two, the generated `docs/references/rules.md` and a local web viewer, and other views can be added later.

**Collector home.** `collectRules()` and the markdown renderer live in root `scripts/lib/rules-collector.ts`, next to the `effective-config.ts` helpers they reuse. Every tsconfig in the repo is `composite` (`tsconfig.base.json:4`), and a composite project cannot import a file outside its `include` (TS6307). The scripts project already lists the manifest and message sources for exactly this reason (`tsconfig.scripts.json:8-12`), and it resolves `oxlintBin`, `buildOxlintStandards`, and `repoRoot` (`scripts/packages/oxlint-standards/package.ts`). The collector reads composed configs from the built package through a runtime `import()` with shape guards, the pattern `generate-effective-config.ts` uses today, so `pnpm typecheck` stays build-free. `scripts/checks/generate-rules-page.ts` imports the collector directly. The viewer package holds only the Bun server entry and the page, and there is still one collector.

**Collector sources.** `collectRules()` returns one entry per rule that is on in at least one shipped preset or config, from three sources:

- **Package rules** come from `ruleManifest` (`rule-manifest.ts:94-110`): `name`, `severity`, `collections`, and `note`, plus the explicit message from `rule-messages.ts` once WI-05 lands. The page and viewer describe a rule with its `note`; the fix text comes from the message. Dropped rows are excluded.
- **tsgo rules** come from the generated policy (`src/generated/tsgo-policy.ts`), which gives the shipped severity and test-scope overrides. The collector reads the policy and the metadata snapshot as source files, adding both to `tsconfig.scripts.json`'s `include` the way the manifest is listed. The snapshot keeps each rule's upstream `description`, `fixable` flag, and `preview` example (`sourceText` plus diagnostic text); all 113 rules carry them at the 0.45.0 tag. Each tsgo entry links to its upstream `docs/rules/<kebab>.md` page at the pinned tag. Their test-file severities come from the policy, never from print-config.
- **Built-in oxlint rules** come from the root engine. Add an exported item reader to `scripts/lib/effective-config.ts` that parses `oxlint --rules --format=json` once and returns the item records. On oxlint 1.58 that output has 705 items carrying `category`, `fix`, `type_aware`, and `docs_url`. `buildOxlintRuleCatalog` (`:71-84`) keeps its signature and derives its set from those items. `materializeEffectiveRules` (`:145-161`) gives the configured result for a composition. Export `flattenTestOverridesIntoGlobal` (`:203-220`) for the test-file view; its substring matcher (`:183-184`) covers `vitestConfig`'s `**/*.test.ts` override, which is the only override the built-in rows need. Built-in rules have no upstream description, so they show their `docs_url` instead.

**Severity spellings.** Print-config reports `deny`, `warn`, and `allow`; the committed artifact contains exactly those three and no `off`. The collector and the G3b comparison normalize `deny` → `error`, `warn` → `warn`, and `allow` → `off`, and a rule counts as on only when its normalized severity is not `off`.

**Which compositions go through print-config.** A preset alone sets only `jsPlugins` and `rules` (`src/presets/shared.ts:11-14`), so printing it returns oxlint's 108 default rules and would credit them to the preset. Root oxlint 1.58 also refuses any config that names `effecttsgo` ("Unknown plugin"). Built-in rows come only from the two compositions today's artifact captures: `baseConfig`, which sets every category explicitly (`src/configs/base.ts:13-20`), and `baseConfig + vitestConfig + nodeRuntimeConfig`. Presets never go through print-config. Their package rows come from the manifest, their tsgo rows from the policy, and their native carve-outs (`no-shadow`, `require-yield`, `no-nested-ternary`) from `configuredRuleEntries` (`effective-config.ts:263-282`). The collector never spawns the patched engine, which keeps it offline and fast enough for `pnpm check`.

Each entry records the rule name, its source (`package`, `tsgo`, or `oxlint`), and each preset or config that turns it on, with the severity for normal files and for test files. It also records a description when one exists, and the docs link.

**What the patched engine actually applies (G3b).** The oxlint-route smoke (G6) prints the patched engine's final config for the Effect and Effect+React compositions, at a normal path and a test path, normalizes the spellings as above, and compares the result with the generated policy. A rule the policy sets `off` that the engine reports on, or any severity mismatch, fails the smoke. The fix is to change the policy, not to regenerate a file. This catches the one risk the collector cannot see offline: oxlint categories turning rules back on.

**Generated rules page.** `pnpm gen:rules-page` renders the list into `docs/references/rules.md` as a fully generated page. It opens with a short fixed header naming the generator and the regenerate command, with no work-item labels (`scripts/check-durable-work-item-refs.sh` rejects them under `docs`). One table per source follows, with rule, presets, severity (normal and tests), what it catches, and docs link. `pnpm rules-page:check` regenerates in memory and fails when the committed page differs. It runs in `pnpm check` with `SKIP_BUILD=true`, like `inventory:rules`, and replaces the staleness gate at `check-rule-inventory.ts:297-319`. An accidental change to which built-in rules are on still fails `pnpm check`, now on a page people can read. The hand-written parts of today's `rules.md` that are still true (preset descriptions, the Effect v4 target) move into the package README; the §3.5 setup replaces the old language-service setup. The page carries third-party text (tsgo descriptions) that this repo cannot rewrite. `.vale.ini` gets a per-file section `[docs/references/rules.md]` with an empty `BasedOnStyles` (verified to yield no alerts with Vale 3.14.1), and `docs/references/prose-gate.md` records that generated pages are exempt. The manifest notes it renders are TypeScript strings, not prose files, and are reviewed in code. `vite.config.ts:11` already format-ignores `**/*.md`, so the page needs no format-ignore entry.

**Local viewer.** MP decision: a local-only viewer, shipping with this change, in a new private workspace package `packages/rules-viewer`. It uses plain Bun HTML with no React or other UI library. Root script `pnpm rules:view` runs `buildOxlintStandards()` and then `bun packages/rules-viewer/src/server.ts`, a Bun server whose routes serve `index.html` (Bun bundles its TypeScript) and the collector's list as `/rules.json` from memory, so nothing is saved to disk. The page shows the same rows as `rules.md` with a search box and filters for source, preset, and severity, plus a normal-versus-test severity column. tsgo rows show their description and example code.

The viewer's `package.json` has `"private": true`, no `version` field, and no `build`, `pack:dry-run`, or `pack:dry-run:no-build` scripts, so the recursive `pnpm -r --if-present` steps (`package.json:8,11,25`) skip it. Its workspace links (`@mplibunao/tsconfig`) and `bun-types` are `devDependencies`. Changesets versions private packages by default (`privatePackages: { version: true }`) and bumps a dependent listed under `dependencies`. Without a `version` field, `shouldSkipPackage` excludes it outright, and `changeset publish` and `pnpm -r publish` skip private packages; `.changeset/config.json` stays unchanged. `releasePackages` (`scripts/lib/release-contract.ts:29-44`) names only the two published packages. ADR-003's "v0 does not expand beyond those packages" is superseded for private, unpublished tool packages; ADR-007 records it.

The viewer ships two composite tsconfigs, both with `tsBuildInfoFile` under `.tsbuildinfo/` and distinct `include`s, and both added to the root `tsconfig.json` `references` (today only `./packages/oxlint-standards` and `./tsconfig.scripts.json`, `tsconfig.json:3`). `tsconfig.json` extends `@mplibunao/tsconfig/server.json` for `src/server.ts` and lists the collector and its transitive `scripts/lib` imports in `include`, following the `tsconfig.scripts.json` precedent. `tsconfig.browser.json` extends `browser.json` for the page script. `server.json` sets `types: ["bun-types"]` (`packages/tsconfig/server.json:6`), so `bun-types` joins the catalog (`catalogMode: strict`, `pnpm-workspace.yaml:17`) at a version older than the seven-day release-age window.

Collector and renderer unit tests run under vitest on Node and never import the server entry, since `Bun.serve` and the `.html` import do not exist there. The server smoke is `scripts/packages/rules-viewer/smoke.ts`, run by `pnpm smoke:rules-viewer` inside `pnpm check`: it spawns `bun packages/rules-viewer/src/server.ts` on an ephemeral port and polls `/rules.json` and `/` until both respond. The process is stopped in `finally`.

## 4. File-by-file impact

The following is the planned touched-file set. “New” means create it; it does not assert the file already exists. Unselected existing helper/test bodies must be inspected before edits; use symbol references from the supplied code to find their actual consumers rather than inventing paths.

### Governance and evidence

| File | Change and reason | Order/dependency |
| --- | --- | --- |
| `docs/exec-plans/completed/effect-rules-v4-implementation-2026-09-25.md` | Replace the scaffold's unresolved questions with this design and maintain execution status. | First; preserve unrelated untracked files. |
| `docs/exec-plans/completed/effect-rules-v4-implementation-progress-ledger.md` (new) | Work-item status, commands, evidence paths, revision/commit, and blocker classification. | First; update at each item. |
| `docs/decisions/007-tsgo-delegation-and-overlap.md` (new) | Record delegation, overlap, required patch, severity ownership, and compatibility boundary. | Before behavioral cutover. |
| `docs/decisions/001-effect-preset-posture.md` | Dated partial-supersession note; retain unrelated decisions. | With ADR-007. |
| `docs/decisions/004-rule-curation-and-severity-posture.md` | Update delegation ownership via supersession note, retaining graded curation. | With ADR-007. |
| `docs/decisions/index.md` | Add ADR-007; update the current summary of delegated ownership. | With ADR-007. |
| `docs/design-docs/preset-architecture.md` | PA-3, current taxonomy, three surviving Effect React rules, v4 Atom terminology, full Effect config contract. | Hook amendment atomic with hook behavior; final inventory after drops. |
| `docs/design-docs/rule-pack-architecture.md` | Current sources/counts, required executable delegation, separate custom/delegated validation. | After runtime/catalog cutover; derive counts. |
| `docs/design-docs/rule-intake.md` | Executable tsgo delegation, overlap and replacement-floor recording, pinned rule intake. | With new manifest semantics. |
| `docs/references/rules.md` | Becomes a fully generated page (§3.12); still-true hand-written content moves to the package README. | Generated after exports/settings are final. |
| `docs/references/effective-config.md` | Delete. | With the artifact removal. |
| `docs/references/effective-config.json` | Delete. | With the artifact removal. |
| `docs/references/prose-gate.md`, `.vale.ini` | Exempt the generated `rules.md`, which carries third-party text, with a per-file `.vale.ini` section `[docs/references/rules.md]` and an empty `BasedOnStyles`. | With the generator. |
| `docs/decisions/003-monorepo-scope-and-naming.md` | Dated supersession note: private, unpublished tool packages are allowed. | WI-01, with ADR-007. |
| `docs/references/effect-house-style.md` (new) | Required house deviations and exact consumer workflow. | Before completion; linked by router/readmes. |
| `docs/exec-plans/completed/effect-rules-v4-alignment-2026-09-25.md` | Append build/after-run evidence links and deferred-record IDs; update status when justified. Do not rewrite settled choices or historical observations. | Final evidence phase. |
| `docs/records/tech-debt/open/bp-td-010.md` → `done/bp-td-010.md` | Close resolved rule-removal follow-up with evidence. | After actual removal. |
| `docs/records/tech-debt/open/bp-td-<allocated>.md` (three new records) | Fork-detach research, custom/tsgo pipe coverage follow-up, next pin triage; numeric IDs allocated from actual inventory. | Final evidence; record health validation may remain blocked. |
| `docs/reports/effect-v4-app-audit-2026-09-25.md` (new) | Compact before/after tables, selected-file coverage, reviewed JSON decision, pipe-opportunity comparison, raw evidence references. | After G2 execution; no invented counts. |
| `CLAUDE.md` | Link ADR-007, this plan and its ledger, required consumer setup, and house style. Tell agents to run `pnpm check:effect-integration` once before committing a work item that touched the tsgo fragment, boundary rules, Effect preset, tsconfig overlays, tsgo policy, or supported-matrix pins. Point readers to the generated `docs/references/rules.md` (never hand-edited) and `pnpm rules:view`. | Final docs; edit this file, not symlink. |
| `README.md` | Replace stale counts/delegation and list both new tsconfig overlays. | After generated inventory. |
| `NOTICE.md`, `packages/oxlint-standards/NOTICE.md`, `packages/tsconfig/NOTICE.md` | Mirror any required retained-metadata attribution update. | With retained upstream metadata; do not alter license terms. |

### Catalog and runtime

| File | Change and reason | Order/dependency |
| --- | --- | --- |
| `packages/oxlint-standards/src/rule-manifest.ts` | Replacement edges, 27 drops, new string rule, narrower severities/rationales/gating, generated delegated rows, renamed types/check list, removal of sensitivity field, collection accounting; point the comment at `:417` to the generated rules page. | Catalog/drop contracts atomic with removal; delegation activation atomic with new config. |
| `src/rule-manifest-selection.ts` | Keep forwarding queries consistent with selection changes; update stale runtime-loader comments only where inaccurate. | With manifest query updates. |
| `src/rule-catalog.ts` | Delete 27 rule bodies; add string-error visitor; build all ten contracts; retire stale ownership and v3 branches; use focused helpers. | With corresponding RuleTester/replay changes. |
| `src/rule-catalog.test.ts` | Delete dropped suites, reclassify ownership cases, add full valid/invalid/scope/alias matrices. | Same behavioral commits. |
| `src/rule-messages.ts` | Explicit messages for survivors/new rule, unknown-name failure, explicit-presence query, remove retired entries. | Before G5 acceptance; messages updated with each changed rule. |
| `src/plugin.ts` | Remove obsolete no-effect-as assembly comment; continue exposing catalog only. | With removal. |
| `src/index.ts` | New config/boundary/EffectPresetConfig/tsgo identity exports; remove LSP export. | Atomic with implementations and package contract tests. |
| `src/presets/effect.ts` | Full composition through existing composer, preserving both native suppressions. | After rules and delegated fragment. |
| `src/presets/effect-react.ts` | No independent rule list; verify manifest now derives exactly three rules. | Manifest change; touch only if type/export wiring requires it. |
| `src/presets/shared.ts` | Keep AST-only helper; ensure only custom/built-in rows are prefixed and support the separate full Effect type contract. | With manifest/config activation. |
| `src/presets/index.ts` | Export revised Effect type without changing general/boundaries contracts. | With Effect preset. |
| `src/presets/presets.test.ts` | Replace deleted React expectations, assert complete full Effect payload and actual namespace ownership, preserve internal-tag duplicate-intent tests. | With preset changes. |
| `src/utils/imports.ts` | Reuse/expose binding lookup; retain runtime/type-only/shadowing checks. | Before provenance/callee tests. |
| `src/utils/ast.ts` | Add only needed transparent-expression/static-property helpers, respecting computed keys. Do not change traversal semantics globally to solve a single rule. | Before dependent matcher updates. |
| `src/utils/effect-identifiers.ts` | Remove dead as-only constants if unused; v4 stack/module/member facts and decoder/encoder list. | With rule removal/retargeting. |
| `src/utils/effect-ownership.ts` | Remove retired wrapper ownership; keep useful syntax helpers; add checked registry and shared exact owner eligibility. | Atomic with all survivor call-site changes. |
| `src/utils/effect-context.ts` (new) | Nearest function and gen/fn argument ownership. | Before return-null/Atom/nesting changes. |
| `src/utils/effect-composition.ts` (new) | Bound pipe parsing, verified data-first transforming membership/arity and shared nesting eligibility. | Before ladder changes. |
| `src/utils/caught-values.ts` (new) | Catch-origin binding table and limited local guard proofs, no variable-name heuristics. | Before unknown-message change. |
| `src/utils/side-effects.ts` | Inspect existing classifier; retarget affected Atom references and correct as value-slot usage in caller, with specific eager/pure controls. | With surviving side-effect-wrapper cleanup. |
| `src/rules/effect/no-effect-as-internal.ts` | Delete dropped standalone rule module. | With runtime removal, smoke replacement, and ticket closure. |
| Sole-purpose no-effect-as wrappers/tests discovered by references under `src/rules/effect/` | Remove only files exclusively supporting the deleted rule; keep shared utilities. Exact filenames beyond the selected internal file require inspection. | Same drop group. |
| `src/effect-policy.test.ts` (new) | G3/G4/G5 metadata, floor, namespace, owner, and message assertions, including negative gate controls. | After canonical policy and cutover. |
| `src/reference-corpus.test.ts` (new) | G1 with explicit per-rule exceptions and provenance. | After corpus data and rule changes. |
| `test-fixtures/effect-v4/corpus.ts` and `test-fixtures/effect-v4/snippets/*` (new) | Typed case metadata plus minimal retained/adapted reference snippets and source provenance. | With G1; do not overwrite vendored linteffect fixtures. |

Here and below, `src/...` in catalog/config rows denotes `packages/oxlint-standards/src/...`.

### Configuration, generation, packaging, and verification scripts

| File | Change and reason | Order/dependency |
| --- | --- | --- |
| `src/configs/effect-tsgo.ts` (new) | Delegated fragment and single native-type boundary adapter. | After generated manifest rows. |
| `src/configs/effect-boundaries.ts` (new) | Exact `effectBoundaryRules` object. | After canonical disabled-ID sets. |
| `src/configs/index.ts` | Export new fragments. | With root/preset exports. |
| `src/configs/effect.test.ts` (new) | Exact plugin/options/rules/override and composition-shape checks without invoking root engine on tsgo. | After the fragment exists. |
| `src/configs/drift-guards.test.ts` | Preserve root baseline engine tests; assert no new Effect plugin/options leak into ordinary compositions. Supported-engine behavior belongs to isolated G6, not this root binary. | After config composition changes. |
| `src/generated/tsgo-policy.ts` (generated, new) | Canonical projected delegated rows/IDs/scopes, no runtime upstream dependency. Generated-data-specific line-ceiling justification only if needed. | Generator output; never hand-edit. |
| `scripts/references/tsgo/0.45.0/metadata.json` (new) | Retained tagged identity/category/provenance data. | Before generator validation. |
| `scripts/config/tsgo-policy.ts` (new) | Single authored grading/options/boundary policy. | Before generation; JSON-rule finalization after app audit. |
| `scripts/config/effect-toolchain.json` (new) | Integration-only exact versions. | Before harness; not subject to workspace override leakage. |
| `scripts/lib/effect-policy.ts` (new) | Pure validation, grading, name projection, and serialization helpers used by generation and tests. No installation at module import. | Before generator/check commands. |
| `scripts/checks/generate-effect-policy.ts` (new) | Read inputs, validate installed pinned package, write/check all projections. | After policy helpers. |
| `scripts/checks/check-rule-inventory.ts` | Dropped-fixture handling, exact runtime/replay sets, new delegated vocabulary, field mirror, collection mapping, quiet-critical exception, exact namespace recognition. Remove old hard-coded LSP assertion. | Atomic with manifest/runtime changes. |
| `scripts/checks/fixture-replay.ts` | Remove all dropped suites and extra duplicate-intent runner functions; add changed branch matrices, actual new-rule severity, v4 controls, message changes. | Atomic with visitor changes. |
| `scripts/lib/effective-config.ts` | Add explicit execution cwd/fixture placement to the reusable print-config path; retain canonical native-name normalization; remove the artifact types and generator. | Before the collector and G3b. |
| `scripts/checks/generate-effective-config.ts`, `scripts/lib/effective-config.test.ts` artifact cases | Delete the generator and the artifact-specific tests; keep tests for retained helpers. | With the artifact removal. |
| `scripts/checks/generate-rules-page.ts` (new) | Write mode for `gen:rules-page` and `--check` mode for `rules-page:check`. | After the collector. |
| `scripts/lib/effect-consumer-harness.ts` (new) | Isolated install/patch/route lifecycle, explicit input versions/tarballs, cleanup and logs. Reuse existing package/install helpers. | Before G6. |
| `scripts/lib/packed-consumer-harness.ts` | Extend temp-consumer setup only as needed for isolated store/copy settings and route packages; preserve ignore-scripts behavior. | With harness; existing users must stay valid. |
| `scripts/packages/oxlint-standards/real-engine.ts` | Shared executor and new full-config/qualified-ID path; existing custom-prefix wrapper retained. Structured/count assertions use actual diagnostic IDs. | Before integration and app audit. |
| `scripts/packages/oxlint-standards/smoke-packed-consumer.ts` | Replace no-effect-as/LSP sentinels; assert revised runtime/type exports and dropped-key absence; retain unpatched non-Effect coverage. | With drops/API change. |
| `scripts/packages/oxlint-standards/smoke-effect-packed-consumer.ts` (new) | Mandatory default-route G6 plus compatibility/scoping probes; consume both tarballs. | After package export changes. |
| `scripts/packages/tsconfig/smoke-effect-packed-consumer.ts` (new) | Independent patched TypeScript 7 route; consume tsconfig tarball, compare common options and exit behavior. | After JSON outputs and exports. |
| `scripts/packages/oxlint-standards/artifact-assertions.ts` | Update expected public exports/declarations if enumerated; prove no upstream runtime dependency or source/internal specifier leak. Preserve exact tarball boundary. | With API changes; full body is a scaffold seam, not supplied code. |
| `scripts/packages/oxlint-standards/check-package-allowlist.ts` | Invoke revised artifact assertions; no broader file allowlist absent an actual new packaged file. | With artifact contract. |
| `scripts/packages/tsconfig/artifact-assertions.ts` | Add effect overlays and package README to both exact file sets and export map; optional-peer metadata check. | Atomic with tsconfig package manifest. |
| `scripts/packages/tsconfig/check-package-allowlist.ts` | Preserve gate entrypoint; use revised exact assertions. | Same package group. |
| `scripts/packages/tsconfig/smoke-packed-consumer.ts` | Retain base/server/browser contracts on 6.0.2; add nonpatching overlay-resolution/environment controls where shared with G6. | With tsconfig exports. |
| `scripts/checks/effect-app-audit.ts` (new) | Read-only repeatable app measurement and conditional JSON/pipe coverage evidence. | After built plugin and supported runner. |
| `scripts/lib/tool-versions.ts` | New integration version reader/type using existing canonical values; scoped YAML keys parsed safely. | Before harness/policy checks. |
| `scripts/lib/version-pins.ts`, `scripts/checks/check-version-pins.ts` | Extend checks to exact integration policy/matrix without changing workflow Node/pnpm/Bun semantics. Add `effect-integration.yml` to the hard-coded `workflowPaths` list (`version-pins.ts:16-17`) so its setup pins are checked. | After integration pin reader. |
| `scripts/lib/release-contract.ts`, `scripts/checks/check-release-workflow.ts` | Add `effect-policy:check` to the `check` contract and two entries to `releasePreparationCommands` after the existing smokes: `pnpm effect-policy:check` and `SKIP_BUILD=true pnpm check:effect-integration`. `release:prepare` does not run `pnpm check`, so the offline check must appear there too. `check:effect-integration` honors `SKIP_BUILD` the way the existing smokes do. | With root script wiring; inspect full bodies first. |
| `scripts/checks/check-changesets-contract.ts` | Extend tests only where new package changeset/optional-peer expectations affect an exact contract; preserve independent versions. | With changeset/package changes. |
| `packages/oxlint-standards/package.json` | Optional exact tsgo peer and metadata; keep oxlint peer, one ESM root entry and existing files boundary. | With runtime exports and smoke. |
| `packages/oxlint-standards/README.md` | Full Effect shape, required route/matrix, no copied-rules-only recipe, boundary usage, migration/removal map, current counts, house style. A consumer self-check: a short canary file and the exact `effecttsgo/effect-fn-opportunity` diagnostic expected on the piped-span form, because a missing tsconfig overlay silently drops the rule to one of five wrapper shapes and oxlint cannot detect it. Every linted Effect file must be included by a tsconfig that extends the overlay (monorepo consumers extend it per package); files outside the program get custom AST diagnostics only. | Final configuration known. |
| `packages/tsconfig/effect.json`, `packages/tsconfig/effect-tsc.json` (generated, new) | Route-specific options-only overlays with shared policy. | Generator output; export atomically. |
| `packages/tsconfig/README.md` (new) | Base/server/browser composition, mutually exclusive routes, plugin-array merge warning, required patch/versions and fallback scope. | With packed README allowlist. |
| `packages/tsconfig/package.json` | Two JSON exports/files, README, optional tsgo peer metadata. Original base/server/browser files unchanged. | With assertions and smokes. |
| `packages/rules-viewer/{package.json,tsconfig.json,tsconfig.browser.json,index.html,src/server.ts,src/page.ts,README.md}` (new) | Private package: Bun server entry and the page only; the collector lives in `scripts/lib/rules-collector.ts`. `package.json` and tsconfig contract per §3.12. | After WI-06 exports. |
| `scripts/lib/rules-collector.ts`, `scripts/lib/rules-collector.test.ts` (new) | Collector and markdown renderer. Tests cover source merging, excluded dropped rows, the `deny`/`warn`/`allow` normalization with `off` rows excluded (fed a hand-written print-config map), a control that a preset-only composition contributes no built-in rows, and a golden markdown render. | After the item reader. |
| `scripts/packages/rules-viewer/smoke.ts` (new) | Spawns the Bun server on an ephemeral port, polls `/rules.json` and `/`, and stops it in `finally`. | With the viewer. |
| `tsconfig.json`, `tsconfig.scripts.json` | Add both viewer tsconfigs to root `references`; add the generated tsgo policy and metadata snapshot to the scripts `include`. | With the viewer and collector. |
| `vite.config.ts` | Drop the `effective-config.json` format-ignore entry; `**/*.md` is already ignored (`:11`). | With the artifact removal. |
| `.github/workflows/effect-integration.yml` (new) | Pull-request and manual trigger, ref-grouped `cancel-in-progress`, same mise/pnpm/Node setup steps as `ci.yml`, then `pnpm check:effect-integration`. | With root script wiring. |
| `package.json` | Exact catalog tsgo dev dependency; policy generation/check, rules-page generation/check, `rules:view`, and route-smoke commands; remove `gen:effective-config`; wire the offline policy check and `rules-page:check` into `pnpm check`; add `check:effect-integration` (both route smokes) and run it from `release:prepare` only. Preserve root prepare and introspection/prose gates. | Infrastructure first, gate wiring after scripts exist. |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Add canonical tsgo dev pin and its locked dependency graph. Add `bun-types` to the catalog for the viewer's server tsconfig. Keep root tool pins and oxlint-tsgolint override. Do not blanket-bypass dependency trust/age policy. | Infrastructure; lockfile regenerated by pnpm. |
| `renovate.json` (new) | Group patch-coupled packages and integration JSON pins; no automerge without compatibility evidence. | With version/matrix tests. |
| `.changeset/oxlint-standards-rule-consolidation.md` | Retain prior consolidation notes; append full 0.2.0 breaking migration and removed rule/API/setup requirements. | Final behavior, before completion. |
| `.changeset/tsconfig-effect-integration.md` (new) | Independent minor bump for the additive Effect overlays and setup documentation. | With tsconfig public additions. |

Files deliberately not changed by this work include `.introspection/config.toml`, the sibling introspection checkout, `mise.toml`, `.changeset/config.json`, ADR-006's publishing policy, `docs/reviews/effect-rules-v4-alignment-review-2026-09-25.md`, vendored linteffect source fixtures, and the original base/server/browser JSON content. The existing `package.ts` modules and `script-runtime.ts` command/resource helpers are reused without an API change unless inspection reveals a concrete required contract gap; do not refactor them preemptively. CI/release YAML need no new publishing design: the existing scripts remain the front door. When their exact command assertions require new gate names, update the assertion owner rather than bypassing it.

## 5. Risks and migration

### Consumer breaking changes

The 0.2.0 changeset must explicitly enumerate the 27 newly removed runtime rule IDs and removed LSP metadata export/variants. Configurations that still name deleted rules must remove those settings, even when set to off if the engine validates the name. The plugin does not supply compatibility stubs.

`effectPreset` now contains required plugin/options/override state. Consumers must compose the full object rather than copy only its rules into an override. Existing Effect consumers must install a supported tsgo/oxlint pair, select the correct tsconfig overlay, and run the required patch. An unsupported or unpatched install fails loudly by design. Non-Effect consumers retain the existing peer range and do not acquire an Effect setup obligation merely by importing the package.

The tsconfig additions are independently versioned and do not reset existing environment options. Do not link/fix both package versions just because they participate in one feature. Update package versions/changelogs through Changesets' normal version operation, not by editing the current 0.1.0 manifests to a guessed release number.

### Semantic and evidence risks

False-positive reduction is not measured by preserving old total counts. New guards deliberately stop flagging reference-compatible code, while replacement diagnostics may cover more real cases. Validate named spans/behaviors and record scope changes. Source-fixture history must not be mistaken for a requirement to retain an abandoned policy.

Origin-aware unknown-value checks and syntactic schema/combinator checks remain AST approximations. They must preserve shadowing and function boundaries and document unsupported computed or runtime-built forms. Do not use a namespace import as evidence of an arbitrary receiver's type. Resource exclusions apply to the full custom composition, not just one renamed matcher.

Pin drift can break binary patching or schema enumeration, and it can change declaration compatibility or diagnostic formatting. Exact matrix tests and generated-policy staleness are release gates. Grouped Renovate updates do not make an unsupported pair safe. Source metadata not shipped in npm must stay retained and attributable.

The app audit cannot be faithfully reproduced without the stated revisions, installed dependencies, and project graph. Different snapshots require a separately labeled new baseline; do not compare their totals as an after-only effect of this patch. Missing optional local checkouts do not prevent ordinary CI tests, but they prevent claiming this alignment's required app-evaluation evidence complete.

### Rollback and blockers

Rollback is a package/config/toolchain rollback together: restore the prior package versions and consumer configs, then reinstall the corresponding unpatched toolchain or use the upstream unpatch command with the same integration flags. Do not keep new Effect plugin names with an old unpatched binary. No stored application data needs migration.

The introspection sibling failure remains explicitly external. It blocks a clean final `pnpm check`; its unpublished file dependency also blocks clean remote installation. Do not widen this rule project into an introspection repair or release-workflow redesign. After that separately owned issue is resolved, rerun the full check and normal clean-checkout release preparation before declaring release readiness.

Note, 2026-09-27: the introspection exit plan (`docs/exec-plans/active/introspection-exit-2026-09-27.md`) replaces the blocker and the no-widening instruction above. Introspection is removed from backpressure entirely, and the clean-checkout verification this section required is recorded in the ledger's WI-10 note.

## 6. Implementation order

Sizes describe review and build scope, not elapsed-time estimates. Keep a ledger row for each item with status, revision, commands, outputs/evidence paths, and commit. WI-03 through WI-07 form one **atomic landing group**: intermediate commits may compile and support focused tests, but no subset that removes checks before their replacements/config/gates is merged or published. Within that group, each visitor change lands with its unit/replay/manifest expectations, and public exports land with both packages' allowlists and consumer tests.

### WI-01: Record ownership and initialize the execution ledger

**Goal:** Write ADR-007 and make the target contracts discoverable before behavioral edits.

**Done when:** The partial supersession and index are accurate; the ledger records the intake baseline and external blocker; the plan is tracked deliberately without sweeping unrelated prompt exports into the commit. `pnpm prose` has been attempted separately and its actual result recorded. Current-state docs distinguish intended changes from behavior not yet implemented.

**Key files:** ADR-007, ADR-001/003/004/index, this plan and its ledger, `CLAUDE.md` (ADR-007 and ledger links only; the `check:effect-integration` instruction lands in WI-07 with the command).

**Dependencies:** None. **Size:** Small.

### WI-02: Establish pinned inputs and the isolated toolchain foundation

**Goal:** Add the exact tsgo development pin and capture tagged metadata. Build pure policy validation/generation and prove the supported isolated patch setup without changing root prepare or public preset behavior.

**Done when:** Metadata has verified tag provenance and a 113-name/category bijection; generation is deterministic and `--check` catches a changed projection; the supported temporary oxlint route and independent TypeScript 7 setup run on their own binaries. Root pins/prepare remain unchanged. The conflicting-severity and diagnostics-disabled probes have recorded results. No public package imports tsgo at runtime.

**Key files:** Workspace/lockfile/root dev dependency, integration pin JSON, retained metadata, policy input/helpers/generator, version readers, isolated harness, Renovate config and GitHub app activation (§3.9).

**Dependencies:** WI-01. **Size:** Large.

### WI-03: Remove obsolete runtime policies and repair ownership contracts

**Goal:** Apply the full drop register without deleting source-history rows or leaving suppression holes.

**Done when:** All 27 runtime entries and their executable tests/replays are removed; manifest dispositions and replacement edges are correct; source-fixture checks distinguish active from dropped; extra duplicate-intent runner functions are migrated; survivor guards no longer defer to dropped owners. The old no-effect-as/LSP smoke sentinels are replaced at the appropriate API transition. Catalog and focused replay tests pass for this intermediate state.

**Key files:** Manifest/selection, catalog, ownership/composition helpers, RuleTester tests, inventory, replay, standalone no-effect-as files, ordinary packed smoke.

**Dependencies:** WI-02's generated identity/policy data. **Size:** Large. **Atomicity:** Part of the WI-03 to WI-07 landing group; dropping a direct replacement alone is not publishable.

### WI-04: Implement narrowed composition and error contracts

**Goal:** Implement comparison-only tags, catch-provenance messages, qualifying Effect pipe nesting, data-first transforming nesting, and the new string-error rule.

**Done when:** The concrete positive/negative cases in §3.6 pass, including alias/shadow controls, parent-exempt child violations, typed catchTag handlers, literal/template/as-const string errors, non-Effect pipes, and active-owner exact-count checks. Every behavior change includes its manifest note, message, and replay branch matrix; no name heuristic replaces a binding proof.

**Key files:** Catalog, `utils/{imports,ast,caught-values,effect-context,effect-composition,effect-ownership}.ts`, catalog tests, manifest/messages, replay.

**Dependencies:** WI-03. **Size:** Large.

### WI-05: Retarget v4 APIs and finish the remaining narrowings and messages

**Goal:** Implement schema-cache, nullable-result, five-hook, Option, Atom, and die/orDie contracts; finish the directly affected v3 cleanup and all kept-rule messages.

**Done when:** Every remaining §3.6 matrix passes; Atom/registry and Option truth-table controls pass; as value-slot/pure controls pass; no active touched matcher depends on the retired v3 identities; PA-3 and hook behavior change together. Missing message lookup fails and every active custom rule has written why/fix/reference guidance. BP-TD-010's actual resolution is recorded after removal.

**Key files:** Catalog/helpers/tests/messages/manifest/replay, identifiers/side-effects helper, preset architecture, BP-TD-010 move.

**Dependencies:** WI-04. **Size:** Large.

### WI-06: Activate the full Effect config and both package surfaces

**Goal:** Ship the generated delegated policy and full `effectPreset`, plus the exact boundary relaxation and route-specific tsconfig overlays.

**Done when:** The public Effect preset includes plugin, type-aware option, complete explicit settings, native carve-outs, and test override; old LSP metadata names are removed; all eleven replacement floors and the owner registry are proved against the actual shipped fragment by unit tests in `src/effect-policy.test.ts`, which need no integration run. Both tarballs contain the intended exports only, old base/server/browser controls still work, and initial packed route smokes pass with inherited options and no runtime upstream dependency. Missing patch and unsupported target controls fail for the intended reasons.

**Key files:** Generated policy/manifest, `src/effect-policy.test.ts` floor/owner assertions, effect/config/preset/root exports and types, both package manifests, tsconfig JSON/README, artifact assertions, all packed smokes.

**Dependencies:** WI-02 through WI-05. **Size:** Large. **Atomicity:** Public exports, tsconfig files, optional-peer metadata, and all allowlists/type assertions land together.

### WI-07: Install all six durable gates

**Goal:** Make regressions fail the actual command paths agents and releases use.

**Done when:** G1/G3a/G4/G5 run in normal tests/checks; G3b and G6 run through `pnpm check:effect-integration` and `release:prepare`, and the offline policy/projection check runs in `pnpm check`; `effect-integration.yml` runs the integration command on pull requests; G2's repeatable script is available with typed coverage/error handling. The reference exception registry is explicit, the G3b comparison fails on a rule the policy sets `off` that the patched engine reports on, and negative controls prove that missing plugins, rules, messages, owners, and severity floors cannot pass silently.

**Key files:** Corpus data/test, policy/config tests, inventory/replay, `generate-effect-policy.ts`, app audit, integration harness/smokes, root scripts, release-contract/workflow checks.

**Dependencies:** WI-06 and WI-11 (WI-11 removes the old staleness gate and adds `rules-page:check` before WI-07 wires the gates). **Size:** Large. **Atomicity:** Completes the WI-03 to WI-07 landing group.

### WI-11: Rule list with its generated page and local viewer

**Goal:** Replace both saved effective-config JSON files with the §3.12 collector, the generated `rules.md`, and the private `packages/rules-viewer` package.

**Done when:** `collectRules()` returns package, tsgo, and built-in oxlint rows for every shipped preset and config, with normal and test severities, and excludes dropped rules. `gen:rules-page` writes `docs/references/rules.md`, and `rules-page:check` runs in `pnpm check` and fails on a stale page. `effective-config.json`, `effective-config.md`, `generate-effective-config.ts`, the inventory staleness gate, and the format-ignore entry are gone, and no doc links to them. `pnpm rules:view` serves the page locally with search and source, preset, and severity filters; the collector tests and `smoke:rules-viewer` pass, `pnpm typecheck` covers both viewer tsconfigs, and the viewer README and generated page carry no work-item labels. The page passes a visual check in a real browser, driven with the surf-cli skill (`/Users/mp/.claude/skills/surf/SKILL.md`; fall back to the Claude Chrome extension only if surf fails). With `pnpm rules:view` running, the agent opens the page and takes screenshots at desktop width and at a phone-sized viewport (`surf emulate`). It also takes screenshots after typing a search term and after applying each filter. The agent then looks at every screenshot and confirms that rows from all three sources render with readable text and that each filter changes the rows. It also checks that a tsgo example code block displays correctly. A screenshot hash or a passing smoke never replaces that review. Screenshots stay in the session scratchpad, not the repo; the ledger records what was checked and what was fixed. MP's own look at the page is recorded as a ledger entry; it does not gate WI-09. `pnpm -r publish --dry-run --no-git-checks` does not list the viewer.

**Key files:** `packages/rules-viewer/*`, `scripts/checks/generate-rules-page.ts`, `scripts/lib/{rules-collector,effective-config}.ts`, `scripts/packages/rules-viewer/smoke.ts`, root and viewer tsconfigs, `check-rule-inventory.ts`, the `drift-guards.test.ts:391` comment, `docs/references/{rules.md,effective-config.md,effective-config.json,prose-gate.md}`, `.vale.ini`, `vite.config.ts`, `package.json`, package README.

**Dependencies:** WI-06 (final exports and generated tsgo policy). WI-07, WI-08, WI-09, and WI-10 depend on it; WI-08 regenerates the page after it sets the JSON rule. **Size:** Medium.

### WI-08: Measure the two apps and finalize conditional delegation

**Goal:** Produce repeatable after-change evidence and resolve the JSON-rule enablement under the predetermined criterion.

**Done when:** Both recorded app snapshots and selected-file coverage are verified; custom and typed passes produce complete parseable counts; all JSON hits have been reviewed; the policy is set to warn or off with the recorded reason and regenerated projections; `gen:effect-policy`, `gen:rules-page`, and `check:effect-integration` re-run green at the final policy. Pipe-opportunity span comparison is recorded without prematurely deleting the custom rule. The after-count table is real, versioned evidence, not estimates.

**Key files:** App audit script and report; alignment evidence append; grading input and generated projections; regenerated rules page; ledger.

**Dependencies:** WI-07, WI-11, and available referenced app checkouts/dependencies. **Size:** Medium. Missing external evidence blocks this item, not the independent unit tests.

Done (2026-09-27): MP accepted G2 with the recorded coverage; see the ledger's WI-08 note.

### WI-09: Complete consumer guidance, records, and changesets

**Goal:** Finish the required house style and accurate current-state docs, plus deferred records and release migration instructions.

**Done when:** Setup examples use full config composition and the correct route; exact supported versions and all removed rule/API names are documented; catalog counts are derived from the final manifest rather than old prose, and the generated `rules.md` is current; essential house style is available to package consumers; BP-TD-010 is closed; three follow-ups have durable records or remain explicitly owned pending schema validation. Both package-facing changes have appropriate independent changesets, with the lint package retaining its pending minor 0.2.0 path and explicit breaking warning.

**Key files:** Both readmes/root README, rules/intake/architecture docs, house-style/router, records, notice mirrors, both changesets.

**Dependencies:** WI-08 and WI-11. **Size:** Medium.

### WI-10: Run acceptance and classify the remaining blocker accurately

**Goal:** Verify the finished work through the four methods below and the existing repository gates.

**Done when:** Every in-scope code, package, route, policy, prose, and app-evidence check has an actual recorded result at the final revision. No new failure is attributed to introspection without evidence. Attempt the unmodified `pnpm check` and record its exact stopping point. Release readiness is declared only after the separately owned sibling/install blocker is fixed and a clean full check plus normal release preparation passes. Until then, keep the plan active with a precise “in-scope verification complete / full acceptance blocked” status, not a fabricated green result.

**Key files:** Ledger, plan/alignment status and evidence links. **Dependencies:** WI-09. **Size:** Small.

Done (2026-09-27): step 3 of the introspection exit plan supplies the standalone verification. The first two fresh clones with no introspection sibling surfaced the two fresh-install defects fixed in the removal commit; the third passed `pnpm install --frozen-lockfile`, the complete `pnpm check`, `pnpm check:effect-integration`, and `git diff --exit-code`; see the ledger's WI-10 note.

### Four task-specific verification methods

**V1: semantic AST matrices and reference corpus (G1, G4, G5).** Run focused RuleTester tests, full custom tests, and the corpus. Proves each changed rule catches its named smell and allows the cited valid reference behavior. It also proves bindings/function boundaries are respected and approved deviations retained; that suppressed shapes have an active owner; and that messages give a concrete fix. Gate-negative tests fail when fed a dropped owner or a nonexistent owner, and also when fed a lowered replacement or a missing message. A count of passing tests alone proves none of those contracts.

**V2: compiled plugin replay and rules-page check (G3, G4).** Run real-oxlint fixture replay, native drift guards, and `rules-page:check` through `pnpm check` (G3a), and the patched-engine policy comparison through `pnpm check:effect-integration` (G3b). Proves built visitors agree with source tests, dropped rules are gone, exact diagnostic intent is preserved, categories do not revive explicit offs, full config composition carries all fields, and representative scope displays agree with real file-lint controls. Do not use print-config alone to prove override behavior or JS-plugin enumeration.

**V3: clean packed consumers on both routes (G3, G6).** Run the ordinary unpatched smoke and the two integration smokes with final tarballs. Proves package exports/declarations/JSON allowlists, preserved non-Effect compatibility, required patch failure, real error exit status, fn option inheritance, single severity ownership, test/boundary behavior, and the independent TypeScript 7 fallback. Run `--check` policy generation first and retain explicit unsupported-version controls.

**V4: pinned application replay and reviewed hit comparison (G2).** Run the repeatable audit on the two stated snapshots. Proves the practical false-positive reductions, the JSON decision's evidence, and the actual remaining overlap/gaps between custom call nesting and tsgo's pipe opportunity. Record source/test counts and matched spans with versions/config fingerprints; do not treat a missing typed project or a parser failure as zero hits.

### Final command and evidence checklist

Keep the existing commands for build, lint, version pins, typecheck, tests, durable references, release-workflow/Changesets contracts, inventory, fixture replay, ordinary packed smokes, package allowlists, introspection, and prose. Remove `gen:effective-config`. Add named commands `gen:effect-policy`, `effect-policy:check`, `gen:rules-page`, `rules-page:check`, `rules:view`, `smoke:rules-viewer`, `smoke:effect-oxlint-packed-consumer`, `smoke:effect-tsc-packed-consumer`, and `audit:effect-apps` for the new entrypoints.

Wire the read-only `effect-policy:check` before build, and `rules-page:check` and `smoke:rules-viewer` after build, in `pnpm check`; all three are offline and fast. Add `check:effect-integration`, which runs `smoke:effect-oxlint-packed-consumer` (including G3b) and `smoke:effect-tsc-packed-consumer` after a build (skipped under `SKIP_BUILD=true`). `release:prepare` runs `pnpm effect-policy:check` and `SKIP_BUILD=true pnpm check:effect-integration` before publishing, because it does not invoke `pnpm check`. Never add it to `pnpm check`. `.github/workflows/effect-integration.yml` runs it on pull requests and manual dispatch. Reuse already-built packages where the existing `SKIP_BUILD` contract permits. Do not make G2 implicitly clone apps during a release job: commit its reviewed report and require its final revision/config fingerprint as this change's execution evidence.

Record command, cwd/route, version set, exit status, final commit, and artifact path for each result. Run `pnpm prose` independently even if the aggregate check stops at introspection. Do not mark the active plan completed or claim release readiness while the normal complete check or clean-checkout install is still blocked.

### Implementation validations whose source is not fully included here

These are factual validations with fixed decision boundaries, not unanswered design questions: obtain the actual pinned metadata/schema field structure and camelCase mapping; enumerate real v4 transforming overloads/decoder members and current internal tags; inspect the existing side-effects classifier; inspect exact artifact/release-contract test bodies; read the pinned executor boundary globs before quoting them; allocate unused deferred-record IDs from the live inventory. Validate each at the work item that consumes it. An unexpected contradiction fails that item's acceptance and is recorded with evidence; it never authorizes silently widening a rule or weakening a severity. It also never authorizes deleting a gate or importing additions from an ahead-of-tag checkout.

## References and provenance conventions

- Decision owner: `docs/exec-plans/completed/effect-rules-v4-alignment-2026-09-25.md`, especially its four binding sections.
- Original scaffold: the supplied `effect-rules-v4-implementation-2026-09-25.md` background/seam findings.
- Absorbed review: `docs/reviews/effect-rules-v4-alignment-review-2026-09-25.md`, F1 to F14.
- Build-plan critique: `docs/reviews/effect-rules-v4-implementation-review-2026-09-25.md`, F1 to F20 and Q1 to Q4, applied here. It records why this plan departs from the original planning answer (§3.12 came later, from MP), including the G3a/G3b split and the single offline policy-check entrypoint. It also covers the `release:prepare` entries, the G2 typed engine and canary, and the harness pnpm settings.
- Rule-list critique: `docs/reviews/effect-rules-v4-rules-list-review-2026-09-25.md`, F1 to F16, applied to §3.12 and WI-11. It records why the collector lives in `scripts/lib`, the print-config severity normalization, the composition-only built-in rows, and the viewer's package and tsconfig contract.
- Governance: ADR-001/004/006, preset architecture PA-1 through PA-5, rule intake, and prose-gate policy.
- `EF/` denotes the supplied Effect repository, identified as Effect 4.0.0-rc.117; `ES/` denotes the supplied effect-solutions repository, identified as targeting beta.59. The corpus table cites their supplied source line ranges.
- `TSGO/` denotes the **tagged** `@effect/tsgo@0.45.0` source and published package data, not the current ahead-of-tag checkout. The supplied `README.md:39–48`, option excerpts `:270–330`, oxlint setup guide, package manifest, three category JSON files, and retained tagged style export establish the intended matrix and config shape.
- Version compatibility, app counts, and prior test results in the intake documents are supplied historical evidence. This plan adds no claim that a build, patch, app audit, test, or publish was executed in producing the plan.

## Appendix A: seam references (file:line)

The detailed seam map behind section 2, captured by read-only explore agents on 2026-09-25 before planning.

### A.Decision source

The alignment plan's `## Decided` list, `## tsgo severity list and boundary scoping`, `## Deferred follow-ups`, and `## Next steps` are settled input. The design review (`docs/reviews/effect-rules-v4-alignment-review-2026-09-25.md`, findings F1 to F14) is already absorbed into that plan.

### A.Rule-change seams

- Manifest (`packages/oxlint-standards/src/rule-manifest.ts:60-118`, `RuleManifestEntry`) is the source of truth. Presets derive their rule maps from it through `presetRulesForDomain` (`src/presets/shared.ts:18-30`; `effect.ts:1-7` adds the `no-shadow` and `require-yield` carve-outs).
- The drop precedent is `no-if-statement` (`rule-manifest.ts:1223-1237`): `disposition: 'dropped'`, `collections: []`, not-applicable build, test, and parity status, and a reason. The inventory hard-codes the three known source drops (`scripts/checks/check-rule-inventory.ts:24-26,518-521`).
- The runtime catalog maps names to rules (`src/rule-catalog.ts:1913-1915,3713-3718`), and `src/plugin.ts:1-24` exposes it. Inventory requires every implemented custom manifest entry to exist in the runtime map (`check-rule-inventory.ts:633-640`) and to have a real-oxlint replay suite (`:644-651`).
- Messages resolve through `ruleMessage` (`src/rule-messages.ts:1-2,71-81`), using an explicit entry or a generated fallback. RuleTester cases in `src/rule-catalog.test.ts:9-10,22-56` expect `ruleMessage(name)`.
- Source fixtures: `test-fixtures/linteffect/{rules,configs,tests/fixtures}` feed RuleTester (`rule-catalog.test.ts:26-33`) and replay (`scripts/checks/fixture-replay.ts:62,94-104,153-165`). Inventory cross-checks upstream preset membership against `sourcePresets` (`check-rule-inventory.ts:248-260,505-513`) and requires replay coverage for each source fixture file (`:470-502,657-690`).
- Independent allowlists: `styleAtErrorExceptions` (`rule-manifest.ts:29-54`) must exactly match collection-backed style rules at error (`check-rule-inventory.ts:583-604`). Language-service delegation rows come from `lspDelegatedChecks` (`rule-manifest.ts:168-186`) and `lspOwnedChecks` (`:2747-2749`), which inventory asserts (`check-rule-inventory.ts:679-695`, including the hard-coded `lsp/missingEffectServiceDependency` at `:693`).
- Ownership guards: `isInAnyWrapperOwnedExpression` (`src/utils/effect-ownership.ts:163-169`) and the single-callee owners (`rule-catalog.ts:751-763`) defer to rules the alignment plan drops.

### A.Config-fragment seams

- `src/configs/` fragments are explicit rule maps: `base.ts:12-19,187-191` spreads `generalPreset.rules` and composes the unicorn and jsdoc fragments; `vitest.ts:3-16,52-70` uses a test-file override; `node-runtime.ts:3-14`. They are exported through `configs/index.ts:1-6` and the package root (`src/index.ts:20-42`).
- `composeLintConfigs` (`configs/compose.ts:109-145`) unions `plugins` (`:117`); merges `options` by key with later wins (`:115`); concatenates `overrides` (`:116`); merges `rules` with later wins (`:118`); and ignores `extends` (`:14`).
- `manifestCollectionsForConfiguredFragment` (`rule-manifest.ts:25-27`) says which collections explain each fragment, and inventory checks fragment rules against them (`check-rule-inventory.ts:589-628`).
- The effective-config artifact (removed by §3.12): `scripts/lib/effective-config.ts:111-161` runs oxlint `--print-config`. `scripts/checks/generate-effective-config.ts:17-64` composes base, Vitest, and Node-runtime into `docs/references/effective-config.json`, and inventory fails when it is stale (`check-rule-inventory.ts:297-319`). `src/configs/drift-guards.test.ts:11-34,80-86,303-325,365-406` runs the live engine on fixtures.

### A.tsgo fragment shape (`@effect/tsgo@0.46.1`)

- A tsgo preset object has exactly three keys: `options: { typeAware: true }`, `plugins: ["effecttsgo"]`, and `rules` with `effecttsgo/<kebab-name>` severities (`oxlint-presets/*.json`; the JS entry re-exports them, `_packages/tsgo/tsdown.config.ts:23-55`). `composeLintConfigs` preserves all three.
- The rule catalog source of truth is `_packages/tsgo/src/metadata.json`. At 0.46.1 it has 116 rules, each with a camelCase `name` and a `group` (21 correctness, 20 antipattern, 22 effectNative, 53 style). Oxlint names are kebab-case.
- Non-severity options (`effectFn`, `namespaceImportPackages`) are read from tsconfig `compilerOptions.plugins` on the `@effect/language-service` entry (`_patches/typescript-go/013-tsoptions-parsinghelpers.patch:34-36`, `options_parser.go:200-229`). On the oxlint route tsgolint reads them from the `tsconfig.json` nearest the linted file and, from 0.46.1, from the files it extends; `--tsconfig` does not select the file. 0.45.0 applied upstream defaults whenever that file used `extends` (BP-TD-014).
- Supported versions for 0.46.1: oxlint 1.82 to 1.85, oxlint-tsgolint `7.0.2001` to `7.0.2003`, TypeScript 7.0.2 (tsc route). vite-plus 0.3.2, 0.3.3, and the 1.0.0-rc releases bundle matching pairs. On a mismatch, the patch exits 1 and oxlint reports `Unknown plugin: 'effecttsgo'` (alignment plan, Delegation route verification).

### A.Packaging and release seams

- `@mplibunao/oxlint-standards` exports only the package root (`packages/oxlint-standards/package.json:15-22,30-42`; peer `oxlint: ^1.58.0`) and builds one ESM entry with tsdown (`tsdown.config.ts:3-13`). The packed file set is pinned (`scripts/packages/oxlint-standards/artifact-assertions.ts:25-46,217-252`; `check-package-allowlist.ts:13-27`). The packed-consumer smoke checks runtime and type exports and runs real oxlint (`smoke-packed-consumer.ts:26-138,178-263`; `real-engine.ts:60-145`).
- `@mplibunao/tsconfig` exports `base.json`, `server.json`, and `browser.json` (`packages/tsconfig/package.json:14-21`), enforced by `scripts/packages/tsconfig/artifact-assertions.ts:13-54`, and smoke-tested in a temporary consumer (`scripts/packages/tsconfig/smoke-packed-consumer.ts:24-127`).
- The packed-consumer harness (`scripts/lib/packed-consumer-harness.ts:14-56`) installs with `--ignore-scripts`, so a smoke that needs `effect-tsgo patch` must run it explicitly.
- Changesets: the pending `.changeset/oxlint-standards-rule-consolidation.md:1-9` is a minor bump for oxlint-standards only. ADR-006 (`docs/decisions/006-changesets-versioning-and-publish-boundary.md:14-28`), `docs/references/release-readiness.md:7-62`, `scripts/lib/release-contract.ts:34-56`, and `scripts/checks/check-release-workflow.ts:313-339` define the release gates. Packages version independently (`check-changesets-contract.ts:72-99`).
- Pins: exact catalog entries with `catalogMode: strict` (`pnpm-workspace.yaml:5-16`). Current pins: `oxlint` 1.58.0, `typescript` 6.0.2, `vite-plus` 0.1.15, `oxlint-tsgolint` 0.18.1. `scripts/lib/tool-versions.ts:16-99` and `version-pins.ts:220-261` validate a fixed set of tool pins. The repo has no Renovate config and no checked-in consumer example project.

### A.Governance and plan conventions

- Active plans live in `docs/exec-plans/active/`; there is no `docs/plans/` (`CLAUDE.md:10,30-31`). Prior plans use numbered work items with a paired ledger that records each item's verification and commit (`lint-standards-consolidation-2026-06-15.md:293-388`, `lint-standards-consolidation-progress-ledger.md:1-97`).
- ADR format: `# ADR NNN: Title`, `Status`, `Date`, `Context`, `Decision`, `Consequences` (`docs/decisions/template.md:1-19`), indexed in `docs/decisions/index.md:1-13`.
- Rule intake order: grade severity; pick the stack preset; decide native, port, or delegate; check package scope; then record in the manifest with tests and attribution (`docs/design-docs/rule-intake.md:12-24`).
- Prose gate: `pnpm prose`, repo Vale with `--no-global` (`docs/references/prose-gate.md:6-29`).
- Closing BP-TD-010 by hand: move `docs/records/tech-debt/open/bp-td-010.md` to `tech-debt/done/` with `status: done` plus a resolution and evidence references (`../introspection/src/record-types/tech-debt.ts:14-60`).

### A.Environment constraints

- `pnpm check` is red locally at `introspection check`: the sibling `../introspection` build rejects the `[records.list]` config block. Every other gate passes (790 tests), and the prose gate stays unverified until introspection is fixed.
- This branch sits on the unpushed `adopt/introspection-v1` and `reshape/introspection-v1` branches. CI would fail at install because of `file:../introspection`.
