# Review: Effect rules v4 build plan

Reviewed: `docs/exec-plans/completed/effect-rules-v4-implementation-2026-09-25.md` (the plan, 783 lines) against its baseline, the original ChatGPT planning answer (730 lines, read in full; a transient export removed after the fidelity check), the decision record `docs/exec-plans/completed/effect-rules-v4-alignment-2026-09-25.md` (`## Decided`, `## tsgo severity list and boundary scoping`, `## Deferred follow-ups`, `## Next steps`, and the evidence sections the plan cites), and `docs/reviews/effect-rules-v4-alignment-review-2026-09-25.md`. Spot-checks ran against the repo at branch `lint/oxlint-standards-consolidation`, the installed `oxlint@1.58.0` declarations, and the `@effect/tsgo` checkout (`/Users/mp/references/effect-ts/tsgo`, 12 commits past the 0.45.0 tag; only version-stable facts were used).

Shorthand: `PLAN:L` = a line in the plan; `BASE` = the baseline; `AR:L` = the alignment record; `RM` = `packages/oxlint-standards/src/rule-manifest.ts`; `RC` = `packages/oxlint-standards/src/rule-catalog.ts`; `TSGO` = the tsgo checkout.

## Scope and givens

The following are applied as decided and not reopened: every per-rule decision in `AR:## Decided`; `pnpm check:effect-integration` as a separate command that also runs inside `release:prepare` and never inside `pnpm check`, covering both route smokes and the isolated Effect effective-config staleness check, while `pnpm check` keeps only the offline policy staleness check; the root stays on TypeScript 6.0.2; the JSON-parse rule's 1/10 threshold is a guardrail and the hit review decides; `--max-warnings 0` is unchanged.

Diff of plan against baseline: the plan carries the baseline verbatim except for the decided integration-command wiring (`PLAN:L58-60`, `L86`, `L388`, `L486`, `L557`, `L573`, `L666`, `L714`) and the added Appendix A. Findings below are numbered F1 to F20; questions are Q1 to Q4.

## Verdict

Implementable after the High and Medium fixes. The rule contracts (§3.6 and §3.7) and the gate design (§3.8) are complete and consistent with every Decided item; grading arithmetic (44/65/4 and 44/64/5) and the eleven replacement edges recompute correctly. What needs repair sits at the seams the decision moved. One baseline gate was dropped from the publishing script. The G2 typed pass has no defined engine. Two contradictions remain from the pre-decision text, and five lifecycle or failure behaviors are covered by neither document.

Counts: High 1 · Medium 9 · Low 10.

## 1. Baseline content the plan dropped or weakened

### F1 (Medium): the offline policy staleness check no longer runs in `release:prepare`

- Plan: `PLAN:L714` and the `package.json` row (`L573`).
- Evidence: `BASE` final checklist: "Add policy staleness and both supported-route smokes to `release:prepare` before publishing." The plan keeps `effect-policy:check` only in `pnpm check` and puts only `check:effect-integration` into `release:prepare`. `release:prepare` does not invoke `pnpm check` (`package.json:27`; `scripts/lib/release-contract.ts:46-53`), and the release job runs `pnpm install --frozen-lockfile` then `pnpm release` (`.github/workflows/release.yml:45-49`). A stale generated projection on `main` at publish time is caught by nothing in the publishing path.
- Fix: add `effect-policy:check` to `releasePreparationCommands` (`release-contract.ts:46-53`) directly, or make it the first step of `check:effect-integration`. Either keeps `pnpm check` as decided; the check is offline.

The rest of the baseline is present unchanged; no other omission or generalization was found.

## 2. Under-specified seams, contradictions, references, and work-item dependencies

### F2 (High): the G2 typed pass names no engine, and type resolution against the apps' Effect versions is unverified

- Plan: `PLAN:L368-370` ("run a supported patched-engine pass"; "No implicit clone, patch, install, or source edit in either app"; "Never patch an external app's installed dependencies").
- Evidence: the apps' own toolchains are patched by their `prepare` scripts (`AR:L209`) at whatever tsgo version they pin, so using them measures a different rule set than 0.45.0. The only other candidate is the isolated consumer's patched oxlint 1.82.0, which then needs: `oxlint-tsgolint` resolvable from the harness install; a config file written outside the app tree (a temp config inside the app is a source edit), which changes how `jsPlugins` paths and `overrides.files` globs resolve; and type resolution of the app's installed `effect` (`4.0.0-rc.115` for t3code, `4.0.0-beta.59` for executor, `AR:L288-290`). tsgo 0.45.0's own development target is `effect ^4.0.0-beta.107` (`TSGO/_packages/tsgo/package.json:61-66`), so executor's beta.59 types may not carry the shapes the rules match. A silent mismatch produces zero delegated hits, which the JSON procedure (`PLAN:L86`) would count as under the threshold.
- Fix: state the engine as the harness consumer's patched oxlint, invoked with cwd at the app root, `--config <temp file outside the app>`, and `--tsconfig <the app's tsconfig>`. Add a mandatory canary before counting: the run must show tsgolint loaded the expected project (file count from structured output) and must report at least one hit from a delegated rule the app is known to trigger (`AR:L297-310` names `Effect.callback` 34/21 and `Effect.catch` 246/120 uses, so `outdated-api` is a safe canary on v3-named code only where present; otherwise `floating-effect`). A failed canary marks that app's typed evidence unusable, which by the plan's own rule (`L86`) means JSON ships `off`; record the per-app Effect version against tsgo's supported range in the report.

### F3 (Medium): leftover wording still places the route smokes in the `check` contract, and the exact release-contract string is undecided

- Plan: `PLAN:L557` ("Require the added policy and both route smoke gates in pre-publish/check contracts wherever the existing command allowlists enumerate them").
- Evidence: `scripts/checks/check-release-workflow.ts:330-340` requires `release:prepare` to equal `expectedReleasePrepareScript` exactly, which is `releasePreparationCommands.join(' && ')` (`release-contract.ts:46-56`); the per-package `smokeCommand` entries (`:29-44`) are enumerated one per package. Whether `release:prepare` gains one entry (`SKIP_BUILD=true pnpm check:effect-integration`) or three (the two smokes and the artifact check) changes both the contract array and the `SKIP_BUILD` semantics, since `check:effect-integration` is specified as running "after a build" (`L714`) but `release:prepare` has already built.
- Fix: rewrite `L557` so it requires the gates in the `release:prepare` contract only and adds `effect-policy:check` to the `check` contract. Decide the entry shape: one command, `SKIP_BUILD=true pnpm check:effect-integration`, added to `releasePreparationCommands` after the existing smokes, with `check:effect-integration` honoring `SKIP_BUILD` the same way the existing smokes do.

### F4 (Medium): work item 7 puts G3 in normal tests and checks, but G3 contains the isolated artifact check

- Plan: `PLAN:L666` ("G1/G3/G4/G5 run in normal tests/checks; G6 and the isolated effective-config check run through `pnpm check:effect-integration`"), `L376-380` (G3 spans both the offline policy union check and `effective-config-effect.json`), `L707` (V2).
- Evidence: the baseline artifact's staleness is enforced inside `inventory:rules` (`scripts/checks/check-rule-inventory.ts:297-320` per Appendix A), which `pnpm check` runs. If the new artifact is wired the same way, the network run lands back in `pnpm check`.
- Fix: split G3 into G3a (offline: metadata/schema/category union, projections, matrix; `pnpm check`) and G3b (isolated `effective-config-effect.json`; `check:effect-integration`). Update `L666` and V2 to match, and state in the `check-rule-inventory.ts` row (`L540`) that inventory must not read `effective-config-effect.json`.

### F5 (Medium): the camelCase↔kebab pairing source is unnamed, and the category normalization is implicit

- Plan: `PLAN:L72` (metadata rows carry `diagnosticName` and `ruleName`), `L78` ("Never derive camelCase by a generic kebab conversion: names such as `cryptoRandomUUID` require the actual upstream mapping").
- Evidence: `TSGO/_packages/tsgo/src/metadata.json` keys severities by camelCase (`presets[].diagnosticSeverity`, `:24-40`) and uses group ids `correctness`, `antipattern`, `effectNative`, `style` (`:2-22`); the oxlint presets key by `effecttsgo/<kebab>` (`TSGO/oxlint-presets/recommended.json:8-12`). No single upstream file carries both spellings per rule; the tagged README's rule table pairs `docs/rules/<kebab>.md` with `<code>camelName</code>` (`TSGO/README.md:100` shows `strict-effect-provide.md` ↔ `strictEffectProvide`).
- Fix: name the pairing source in §3.2 (the tagged README rule table or `docs/rules/*.md` filenames, cross-checked against `oxlint-schema.json`), require the capture step to assert three equal 113-element sets (metadata camel names, preset kebab names, paired rows), and state the `effectNative` → `effect-native` normalization as part of the snapshot schema.

### F6 (Medium): the harness's package-manager settings are unspecified, and the release-age window is a publish-time hazard

- Plan: `PLAN:L390` ("writes its own package-manager settings"), `L414` ("Temporary installs must not disable trust/release-age safeguards without a separately reviewed reason").
- Evidence: the root sets `minimumReleaseAge: 10080` with `minimumReleaseAgeStrict: true`, `trustPolicy: no-downgrade`, `strictDepBuilds: true`, and `dangerouslyAllowAllBuilds: false` (`pnpm-workspace.yaml:20-22,32-33`). A temp directory outside the workspace inherits none of them; they are absent rather than disabled, so `L414` as written asserts nothing. The existing harness writes only `package.json` (`scripts/lib/packed-consumer-harness.ts:15-22`). With the settings copied, every pin in `effect-toolchain.json`, including the unsupported-target control `vite-plus 1.0.0-rc.0` (`L409`), must be at least seven days old at run time; the run inside `release:prepare` happens on `main` on GitHub Actions (`release.yml`), so a pin bump within that window blocks publishing.
- Fix: the harness writes a consumer `pnpm-workspace.yaml` copying `minimumReleaseAge*`, `trustPolicy`, `strictDepBuilds`, `dangerouslyAllowAllBuilds`, plus `storeDir` (private) and `packageImportMethod: copy` (the plan's store-isolation requirement, `L390`). State the consequence in §3.9: a pin younger than the window is a reported setup failure, and pin bumps must respect it.

### F7 (Low): work item 1 edits `CLAUDE.md` with an instruction naming a command that does not exist until work item 7

- Plan: `PLAN:L608` (work item 1 key files include `CLAUDE.md`) versus `L486` (the `CLAUDE.md` row is ordered "Final docs" and adds the `pnpm check:effect-integration` instruction).
- Fix: work item 1 adds only the ADR-007 and ledger links; the command instruction lands with the root-script wiring in work item 7.

### F8 (Low): work item 6 requires proof that work item 7 installs

- Plan: `PLAN:L656` ("all eleven replacement floors are now proved against the actual shipped fragment") versus the `src/effect-policy.test.ts` row (`L521`, "After canonical policy and cutover") and work item 7 key files (`L668`).
- Fix: move the floor and owner-registry assertions into work item 6; they are unit tests over the fragment and manifest and need no integration run. work item 7 keeps the G3b and G6 wiring.

### F9 (Low): work item 8's policy flip requires a network regeneration the item does not name

- Plan: `PLAN:L676-680` (key files list "affected effective artifact").
- Evidence: setting `prefer-schema-over-json` to `warn` changes `src/generated/tsgo-policy.ts`, `effect-tsc.json`, `docs/references/effective-config-effect.json`, and the counts work item 9 derives; the artifact regenerates only through the isolated consumer.
- Fix: add to work item 8's done-when: "`gen:effect-policy`, `gen:effect-effective-config`, and `check:effect-integration` re-run green at the final policy."

### F10 (Low): the fate of the thirteen existing `lsp/*` rows is unstated

- Plan: `PLAN:L112-116` (rename vocabulary; "Include configured-off diagnostics in the delegated inventory"), `L448` (`importFromBarrel` "is not invented").
- Evidence: `RM:2722-2735` creates thirteen `lsp/<camel>` rows through `lspDelegatedChecks`, including `importFromBarrel`, which has no tsgo counterpart. §3.3 forbids deleting source rows, but these rows have no source-fixture history. `check-rule-inventory.ts:693-695` asserts one of them by name.
- Fix: state that the thirteen `lsp/*` rows are removed and replaced wholesale by the 113 generated `tsgo` rows (`missing-effect-service-dependency` returns as a generated `off` row; `importFromBarrel` disappears), and that the `:693-695` assertion becomes a check that the generated delegated row count equals the pinned metadata count.

### Appendix A references (checked, no finding)

Verified against the working tree: `RM:24-27`, `:29-54`, `:60-118`, `:166-185`, `:1222-1237`, `:2746-2748` (Appendix says `2747-2749`; off by one); `check-rule-inventory.ts:26`, `:635-651`, `:693-695`; `src/utils/effect-ownership.ts:163-169`; `RC:751-763`; `src/configs/compose.ts:109-145` with `options`/`overrides`/`plugins`/`rules` at `:115-118`; `src/rule-messages.ts:71-81`; `pnpm-workspace.yaml:4-17,24`; `CLAUDE.md:10,30-31`; `docs/reports/` exists. `@effect/tsgo@0.45.0` ships `oxlint-presets/`, `oxlint-schema.json`, and `schema.json` but not `src/metadata.json`, and exports only `./package.json`, `./lib/getExePath`, and `./oxlint-presets*` (`TSGO/_packages/tsgo/package.json:28-49`), which matches `PLAN:L76`. The tsc route's per-file `overrides[].include` with `diagnosticSeverity` exists (`TSGO/README.md:320-328`), and `options.typeAware: true` in config suffices without a CLI flag (`TSGO/docs/README.md:41`; `recommended.json:2-7`).

## 3. Details the code disproves, the task does not require, or a simpler design replaces

### F11 (Medium): two offline policy-check entrypoints where one suffices

- Plan: `PLAN:L78` (`generate-effect-policy.ts` with write and `--check` modes) and `L537` (`check-effect-policy.ts`: "Read-only policy/schema/projection/matrix/required-gate checks").
- Justification: both read the same inputs and the installed pinned package; "matrix" belongs to the `check-version-pins.ts` extension the plan already schedules (`L555`), and "required-gate" assertions on root scripts are owned by `check-release-workflow.ts` (`:330-340`). A second script adds a command name and an ambiguity about which one `effect-policy:check` maps to.
- Fix: `effect-policy:check` = `bun scripts/checks/generate-effect-policy.ts --check`; drop `check-effect-policy.ts` from the file table; route matrix checks through `versions:check`.

### F12 (Low): the described test-filename convention is narrower than the code

- Plan: `PLAN:L163` (".test / .spec with JS/TS, JSX/TSX, c/m variants, and files under test, tests, or __tests__").
- Evidence: `RC:556-557` `isTestFileName` matches `[.-](test|spec)\.[cm]?[jt]sx?$`, so `foo-test.ts` and `foo-spec.tsx` are exempt today.
- Fix: include the hyphen form in the shared policy pattern list (oxlint `files` globs `**/*-test.*`, `**/*-spec.*`; tsc `include` equivalents), or state that the escape-hatch convention is deliberately narrowed and add the regression case.

### F13 (Low): the type adapter is needed only for the plugin literal

- Plan: `PLAN:L161` ("may not include the patched `effecttsgo` plugin literal ... boolean type-aware option").
- Evidence: oxlint 1.58's `plugins` is a closed union without `effecttsgo` (`node_modules/oxlint/dist/index.d.ts:37-38`), while `options.typeAware?: boolean` is already declared (`:366`) and `composeLintConfigs` already merges `options` (`compose.ts:115`).
- Fix: state that the adapter bridges only `plugins`; `typeAware` and `overrides` are natively typed. This narrows the assertion surface the drift guard must tolerate.

### F14 (Low): `ignoreEffectSuggestionsInTscExitCode` has no effect on the shipped projection

- Plan: `PLAN:L178` ("Explicitly set the three `ignoreEffect*InTscExitCode` options false ...").
- Evidence: the projection emits only `error`, `warning`, and `off`; the suggestions flag governs a level never produced (`TSGO/README.md:269-273`).
- Fix: set the warnings and errors flags false and leave the suggestions flag at its upstream default, or set it false and say it is inert; do not claim it changes exit behavior for the shipped levels.

## 4. Requirements neither document covers

### F15 (Medium): the integration command has no automated execution before the publish job

- Plan: `PLAN:L58` ("make integration verification mandatory"; the router instruction is the only trigger outside release).
- Evidence: `ci.yml:42` runs `pnpm check` only; the first CI execution of the harness is `pnpm release` on `main` (`release.yml:48-49`). A harness or pin regression is discovered when it blocks a publish, on a runner where nobody is watching.
- Fix: add a workflow that runs `pnpm check:effect-integration` on `workflow_dispatch` and a weekly `schedule`. It does not run on pull requests or inside `pnpm check`, so it stays within the decided command boundary. work item 10 records one green run on the final revision.

### F16 (Medium): a consumer that omits the tsconfig overlay degrades silently

- Plan: `PLAN:L176-178` (plugin arrays replace; consumers must keep the entry), G6 "fn option sensitivity" row (`L405`).
- Evidence: G6 proves the setting matters, not that a consumer has it. Without the overlay, `effectFn` falls back to the upstream default and `effect-fn-opportunity`, the `error`-floor replacement for `prefer-effect-fn`, catches one of the five wrapper shapes (`AR:L26`). The floor test proves the shipped fragment, not the consumer's effective configuration, and oxlint cannot detect a missing tsconfig plugin option.
- Fix: the package README carries a consumer self-check: a short canary file and the exact `effecttsgo/effect-fn-opportunity` diagnostic expected on the piped-span form; the tsconfig README states the plugin-array replacement rule next to it. Record in ADR-007 that this is documentation-enforced.

### F17 (Medium): files outside the consumer's TypeScript program get no delegated diagnostics

- Plan: `PLAN:L412` covers this only for the harness's positive control ("a file silently outside project coverage is not a pass").
- Evidence: type-aware rules run only on files the tsconfig program includes; a consumer's `oxlint .` still lints the file with custom AST rules, so the output looks healthy.
- Fix: the README and house style state that every linted Effect file must be included by a tsconfig that extends the overlay (monorepo consumers extend it per package), and G6's scope row adds a control: a file outside `include` yields custom diagnostics and no `effecttsgo/*` diagnostics, recorded as expected behavior.

### F18 (Low): no subprocess timeout or process-tree termination for long type-aware runs

- Plan: `PLAN:L392` (cleanup in `finally`; interruptions must not mark evidence complete).
- Evidence: `scripts/lib/script-runtime.ts:1,62` wraps `spawnSync` with no timeout; tsgolint starts a child server, and a SIGINT to the Bun parent does not reach grandchildren. The executor pass covers 1,940 files (`AR:L290`).
- Fix: pass `timeout` and `killSignal` on audit and harness subprocess calls, run oxlint in its own process group so cancellation kills the tree, and have the ledger record any timeout as incomplete.

### F19 (Low): snapshot directory lifecycle across tsgo bumps is undefined

- Plan: `PLAN:L72` (`scripts/references/tsgo/0.45.0/metadata.json`), `L438` (next-pin triage follow-up).
- Fix: one snapshot per pinned version; the generator derives the version from the root catalog and fails when `scripts/references/tsgo/<version>/metadata.json` is absent; the bump commit deletes the previous snapshot (history stays in git).

### F20 (Low): G4's negative controls require pure validators the plan does not name

- Plan: `PLAN:L384` ("a nonexistent owner, a dropped owner, and a lowered replacement severity must fail"), `L521`.
- Evidence: the registry lives in `utils/effect-ownership.ts` and the assertions in `src/effect-policy.test.ts`; a check that reads the real manifest cannot be fed a mutated copy.
- Fix: state that `validateOwnershipRegistry(registry, manifest)` and `assertReplacementFloors(manifest, fragment)` are pure, internally exported functions; negative tests call them with altered copies.

## 5. Questions whose answers change the design or order

- Q1 (affects F4, work item 7): should `effect-policy:check` also compare the committed `effective-config-effect.json`'s stored config fingerprint (`PLAN:L378`) against the current in-repo `effectPreset` composition? It is offline and would make a policy edit without a rerun fail `pnpm check`; it also decides what the "config fingerprint" is computed from.
- Q2 (affects work item 2 scope): is Renovate installed on this GitHub repository? If not, `renovate.json` (`PLAN:L416`) is inert and work item 2 should either include activation or defer the file to a recorded follow-up.
- Q3 (affects work item 2, §3.5): what is the pre-decided fallback if the `diagnostics: false` probe (`PLAN:L176`) shows it suppresses oxlint-route output? The only viable option is omitting the key and accepting duplicate editor diagnostics; naming it now avoids a stall, since `L178` currently calls a failed probe an integration blocker.
- Q4 (affects F15, work item 7): is a scheduled CI execution of `check:effect-integration` wanted, or is the router instruction plus the release gate the intended full coverage?
