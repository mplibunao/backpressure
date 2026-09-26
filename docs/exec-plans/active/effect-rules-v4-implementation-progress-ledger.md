# Effect rules v4: exec-plan progress ledger

Progress ledger for the orchestrate-loop execution of plan
[`effect-rules-v4-implementation-2026-09-25.md`](./effect-rules-v4-implementation-2026-09-25.md)
and the decision record
[`effect-rules-v4-alignment-2026-09-25.md`](./effect-rules-v4-alignment-2026-09-25.md).
Each tracked unit gets one row. Per-item detail sections are appended as items land.

## Intake baseline

Recorded on 2026-09-25 against `lint/oxlint-standards-consolidation` at `42c77c6`.

- `pnpm test`: 790 passed (20 files).
- `pnpm check`: stops at `introspection check`. A direct `pnpm introspection:check` exited 1 with `config.schema_violation: config TOML failed JSON Schema validation`. The sibling `../introspection` build rejects `[records.list]`. Do not remove that block.
- `pnpm prose`: Vale reported no alerts across 53 files.

## Status

Commit SHAs are in the backpressure repo. The orchestrator commits; agents do not. Sizes are from the plan (S/M/L).

| ID | Item | Size | Status | Commits |
| --- | --- | --- | --- | --- |
| WI-01 | Record ownership and initialize the execution ledger | S | DONE (pushed) | `15fce6c` |
| WI-02 | Establish pinned inputs and the isolated toolchain foundation | L | DONE (pushed); Renovate app active (onboarding PR #5) | `c863fa5` |
| WI-03 | Remove obsolete runtime policies and repair ownership contracts | L | DONE (pushed) | `ec4f4f8` |
| WI-04 | Narrow composition and error contracts | L | DONE (pushed) | `9c12bcc` |
| WI-05 | Retarget v4 APIs and finish the remaining narrowings and messages | L | DONE (pushed) | `eaff7e4` |
| WI-06 | Activate the full Effect config and both package surfaces | L | DONE (pushed); MP confirmed the prefer-effect-fn restore | `f2524d8` |
| WI-12 | Extend prefer-effect-fn to tsgo shape parity | S | PARKED by MP decision; work stashed, not committed | |
| WI-13 | Bump @effect/tsgo to the first release containing the extends fix | M | DONE (pushed) | `c2f6a4d` |
| WI-14 | Rebuild no-pipe-ladder as closure nesting and add no-discarded-failure | M | DONE (pushed) | `63e5a65` |
| WI-11 | Rule list with its generated page and local viewer | M | DONE (pushed) | `b848cb5` |
| WI-07 | Install all six durable gates | L | DONE (pushed) | `671fcb9` |
| WI-08 | Measure the two apps and finalize conditional delegation | M | JSON decision and measurements DONE (pushed); full typed coverage BLOCKED: executor typed coverage is partial (1,355 of 1,922 files) because five executor tsconfigs are invalid under TypeScript 6 and 7 alike, so MP did not accept it | `dfff7d9` |
| WI-09 | Complete consumer guidance, records, and changesets | M | DONE (pushed) | `be8b5fa` |
| WI-10 | Run acceptance and classify the remaining blocker accurately | S | in-scope verification complete / full acceptance blocked (pushed): external introspection `config.schema_violation`; executor typed coverage 1,355 of 1,922 files (open MP question) | `c927ae0` |

## Per-item detail

### WI-01: Record ownership and initialize the execution ledger (DONE)

- **Build:** governance only. No package or runtime behavior changed.
- **ADR-007:** recorded as [ADR-007](../../decisions/007-tsgo-delegation-and-overlap.md).
- **Supersession notes:** dated 2026-09-25 notes appended to ADR-001, ADR-003, and ADR-004. Historical text was not rewritten.
- **Index:** `docs/decisions/index.md` lists ADR-007 and updates the current delegated-ownership summaries.
- **Router:** `CLAUDE.md` links ADR-007 and this ledger only. The `check:effect-integration` instruction is deferred.
- **Current-state docs:** `docs/design-docs/rule-pack-architecture.md`, `docs/design-docs/preset-architecture.md`, `docs/design-docs/rule-intake.md`, and `docs/references/rules.md` now mark the ADR-007 successor as intended and not yet implemented. Shipping behavior in those files is unchanged.
- **Review gate:** not run here; the orchestrator owns review.
- **Refactor gate:** not applicable; no code changed.
- **Checks:** see [Intake baseline](#intake-baseline). Those are the runs for this item.
- **Commits:** none. The orchestrator commits. Unrelated untracked plan, review, and `prompt-exports/` files were left untouched.
- **Issues:** the introspection schema blocker remains. It does not block independent prose or tests.
- **Action items for MP:** none.

### WI-02: Establish pinned inputs and the isolated toolchain foundation (DONE)

- **Build:** exact `@effect/tsgo` 0.45.0 root dev pin through the catalog (`pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`). Root `prepare` (`vp config`), the root tool pins, and the `oxlint-tsgolint` override are unchanged.
- **Pinned metadata:** `scripts/references/tsgo/0.45.0/metadata.json` plus the tagged `LICENSE`. It was captured from tag `@effect/tsgo@0.45.0`, which resolves to commit `54bbc1e7f0ffe7bb555642312168a88741667c6f`, by `bun scripts/checks/generate-effect-policy.ts --capture /Users/mp/references/effect-ts/tsgo`. The capture reads git objects at the tag, never the working tree. It records sha256 hashes of the four source files; an independent `git show … | shasum -a 256` matched all four. Each row keeps `description`, `fixable`, `preview`, `codes`, `defaultSeverity`, and `supportedEffect`. The snapshot also retains the supported-target table from the tagged README.
- **Name bijection:** metadata camelCase names, README pairings, `oxlint-schema.json` rule keys, and `docs/rules/*.md` files are four equal 113-element sets. Only `cryptoRandomUUID` and `cryptoRandomUUIDInEffect` break generic case conversion, and both come from the README pairing. Category counts are 21 correctness, 20 antipattern, 50 style, and 22 effect-native.
- **Installed-package cross-check:** the installed 0.45.0 package's four category preset JSON files, `oxlint-schema.json`, and `schema.json` are byte-identical to the tag. The generator re-checks category membership, the oxlint schema rule set, and the tsconfig diagnostic-severity key set on every write and `--check` run.
- **Policy and generation:** `scripts/config/tsgo-policy.ts` is the authored policy. `scripts/lib/tsgo-snapshot.ts` covers capture, parsing, and validation. `scripts/lib/tsgo-snapshot-files.ts` replaces the snapshot on disk. `scripts/lib/effect-policy.ts` covers grading, the published-package cross-check, projections, and serialization. `scripts/checks/generate-effect-policy.ts` has write, `--check`, and `--capture` modes. Root scripts `gen:effect-policy` and `effect-policy:check` exist but are not wired into `pnpm check` or `release:prepare`. Outputs are `packages/oxlint-standards/src/generated/tsgo-policy.ts`, `packages/tsconfig/effect.json`, and `packages/tsconfig/effect-tsc.json`. Nothing imports the generated module. Neither tarball changed: the tsconfig package still packs 7 files, and the lint `dist` has no tsgo reference.
- **Grading:** 44 rules ship at `error` and 64 at `warn`, with 5 set to `off`. `prefer-schema-over-json` is `off` pending the app evaluation. An independent Python re-derivation from the plan's grading table matched all 113 rows in both the lint rows and `effect-tsc.json`.
- **Determinism:** re-capture and re-generation are byte-identical. Output goes through `vp fmt --stdin-filepath`, so the staged-file hook cannot rewrite it.
- **Negative controls for `effect-policy:check`:** each of the following exits 1, and the restored tree exits 0.
  - A hand-edited lint module.
  - A hand-edited `effect-tsc.json`.
  - A deleted `effect.json`.
  - A policy severity change without regenerating (both projections are reported stale).
  - A boundary-list typo ("names rules absent from the pinned snapshot: global-dates").
  - An exception recorded under the wrong category.
- **Supported matrix:** `versions:check` now also asserts that the integration oxlint, oxlint-tsgolint, and TypeScript pins are in the pinned tsgo's supported set, and that the unsupported control is not. `vite-plus`'s bundled oxlint and oxlint-tsgolint are asserted at harness install time.
- **Isolated harness:** `scripts/lib/effect-consumer-harness.ts`. Each consumer gets a temp root outside the repo with a private `storeDir` and `packageImportMethod: copy`. It copies the root's five release-age and trust settings, fails if one is missing, and rejects any root YAML parse error before copying. A review fix added that last check: without it, a duplicated `minimumReleaseAge: 0` silently won. A regression test covers it and fails without the check. The harness also strips inherited `npm_config_*` and `pnpm_config_*` variables. Installs run with `--ignore-scripts`. Commands run in their own process group with a timeout. A timeout or interrupt is reported as incomplete. Cleanup runs in `finally`.
- **Route setup (run 2026-09-25):**
  - The oxlint route installs `vite-plus@0.3.2`, `oxlint@1.82.0`, `oxlint-tsgolint@7.0.2001`, tsgo, Effect, and `typescript@6.0.2`. `effect-tsgo patch --no-typescript --oxlint` patched only the consumer's copied oxlint binding, oxlint `.d.ts`, and tsgolint binary. A second patch was a no-op ("hash matches the replacement").
  - The tsc route installs TypeScript 7.0.2. `effect-tsgo patch` patched only its TypeScript binary (`Version 7.0.2+effect-tsgo.0.45.0`). A second patch was a no-op.
  - The unsupported control (oxlint 1.83.0) failed to patch with `UnsupportedTargetPackageVersionError`.
  - A release-age control installing `effect@4.0.0-rc.117` failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`.
- **Probe results (oxlint route, `effecttsgo/global-date-in-effect` on the upstream preview snippet):**
  - Unpatched: exit 1, `Unknown plugin: 'effecttsgo'`.
  - Patched, with the generated `effect.json` (`diagnostics: false`) and the oxlint rule at `error`: exit 1 with the diagnostic, from both `oxlint` and `vp lint`. Setting `diagnostics: true` gave the same result.
  - **Conflicting severity:** the oxlint setting decided every case, and the tsconfig `diagnosticSeverity` was ignored. Oxlint `error` with tsconfig `off` gave exit 1 with the diagnostic. Oxlint `off` with tsconfig `error` gave exit 0 and no diagnostic. Oxlint `warn` with tsconfig `error` reported a warning with exit 0. Oxlint `error` with tsconfig `warning` gave exit 1. Both `off` gave nothing. A tsconfig `error` with no oxlint rule reported nothing.
  - **`diagnostics: false`:** it does not suppress oxlint-route output, so `effect.json` keeps it.
  - Warning-only: exit 0 without `--max-warnings 0` and exit 1 with it, for both `oxlint` and `vp lint`.
  - This matches the tagged source: `etsoxlintrunner/runner.go` forces `Diagnostics = true` and replaces the severity map per rule.
- **Probe results (tsc route, TypeScript 7.0.2):**
  - Unpatched: exit 0 with no Effect diagnostics.
  - Patched: the generated overlay's severities apply through `extends`.
  - A warning-only file (`globalDate`) fails typecheck (exit 1), and a clean file passes.
- **Blocker for WI-06 (tsc test-file override):** the override generated into `effect-tsc.json` does not take effect when the overlay is extended. tsgo 0.45.0 rebases an extended config's override `include` onto that config's own directory (`internal/effectconfigraw/hooks.go`, `rewriteSpecs`). It does not substitute `${configDir}`, and it does not expand braces. Test files under an extended overlay still reported `strictEffectProvide`. The same patterns in the root tsconfig did work (`**/*.test.ts`, `**/__tests__/**/*`). A verified alternative: the consumer adds its own `{ "name": "@effect/language-service", "overrides": [...] }` plugin entry over the extended overlay. tsgo merges that entry, so the overlay severities still apply, test files are exempt, and production files still report. The generator keeps the plan's plain patterns in `effect-tsc.json` for now. WI-06 must choose the shipped mechanism before the export lands.
- **Renovate:** `renovate.json` groups `@effect/tsgo`, `vite-plus`, `oxlint`, and `oxlint-tsgolint`, plus every `scripts/config/effect-toolchain.json` integration pin. The group disables automerge. A 7-day `minimumReleaseAge` applies with `internalChecksFilter: strict`. `renovate-config-validator --strict` passed as both repository and global config. A local `--platform=local` extract dry-run on a committed copy found exactly the five integration pins through the JSONata custom manager, without the control, and found `@effect/tsgo` through the pnpm catalog.
- **Renovate app activation:** Renovate is already installed on the `mplibunao` account (installation `27958297`). Adding this repository needs the installation settings page, and GitHub stopped at a sudo "Confirm access" prompt (passkey, GitHub Mobile, or password). Per the renovate skill, the agent stopped there. Activation is not done: there is no onboarding PR yet.
- **Judgment calls:**
  - **Effect pin:** `4.0.0-rc.115` instead of `rc.117`. `rc.117` (published 2026-09-21) is inside the seven-day window until 2026-09-28, and the plan makes a younger pin a setup failure. `rc.116` clears the window at 2026-09-25T20:02Z. Renovate proposes the bump once it is eligible.
  - **Unsupported control:** oxlint `1.83.0` instead of `1.85.0`, for the same reason (`1.85.0` was published 2026-09-21). `1.83.0` is also outside tsgo's supported `1.81.0`/`1.82.0` and fails to patch as intended. It lives in `effect-toolchain.json` under `controls`, which Renovate does not manage.
  - **Supported matrix source:** the matrix comes from the tagged README table retained in the snapshot, so it is not authored a second time.
  - **Helper split:** `scripts/lib/tsgo-snapshot.ts` holds the snapshot helpers apart from `scripts/lib/effect-policy.ts`. That keeps both files under the 500-line lint ceiling.
  - **Test-file patterns:** one brace-free list serves both engines. It has 32 suffix patterns and 3 directory patterns.
  - **Rationale classes:** antipattern errors, correctness rows, and in-Effect globals are `correctness`. The four style-category errors are `agent-failure-mode`. All warn and off rows are `style`, except `duplicate-package`, which stays `correctness` at `warn` pending the scoped quiet-critical exception.
- **Checks (each run separately at the uncommitted WI-02 tree):**
  - `durable:refs`: exit 0.
  - `effect-policy:check`: exit 0.
  - `build`: exit 0.
  - `vp lint --max-warnings 0`: exit 0, with 0 warnings and 0 errors.
  - `versions:check`: exit 0.
  - `typecheck`: exit 0.
  - `test`: exit 0, with 816 passing tests in 23 files. There were 790 at intake.
  - `check-release-workflow`: exit 0.
  - `changesets:check`: exit 0.
  - `SKIP_BUILD=true inventory:rules`: exit 0.
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 87 suites and 512 cases.
  - `SKIP_BUILD=true smoke:oxlint-packed-consumer`: exit 0.
  - `smoke:tsconfig-packed-consumer`: exit 0.
  - `pack:dry-run:no-build`: exit 0.
  - `prose`: exit 0.
  - `introspection:check`: exit 1 with the same `config.schema_violation` as the intake baseline.
  - The harness's process-group test was mutation-checked: killing only the child pid makes it fail.
- **Review gate:** the agent's own oracle review could not run because RepoPrompt `manage_selection` calls were cancelled. The orchestrator's review found three defects, all fixed:
  - **Snapshot pruning order:** `--capture` used to delete every other entry under `scripts/references/tsgo/` before it wrote the replacement. `scripts/lib/tsgo-snapshot-files.ts` now renders the replacement and re-parses it. It must equal the captured snapshot. It then writes both files through a rename and prunes last. Pruning removes only a directory whose name matches the version inside a valid `metadata.json` and which holds nothing but `metadata.json` and `LICENSE`. Tests show a sentinel file and an unrelated folder survive. They also show that invalid, misnamed, or extra-content directories survive, and that a failing or content-changing formatter leaves the old snapshot untouched. Two mutations fail these tests: pruning before rendering, and pruning every non-current entry. A real re-capture reproduced the committed snapshot byte-for-byte.
  - **Torn snapshot:** the two files are renamed one at a time, so an interrupted capture could leave new metadata beside a missing or stale `LICENSE`. Generation and `--check` read only the metadata, so they would still pass. `readRetainedTsgoSnapshot` now requires both files. It checks the version against the directory name and compares the `LICENSE` sha256 with `source.files['LICENSE']`. The generator and `versions:check` both load the snapshot through it. `replaceTsgoSnapshot` also refuses to write `LICENSE` text that does not match the recorded hash. The failure-injection tests occupy the `LICENSE` temp path, so the second replacement fails after the metadata rename. The resulting snapshot is rejected whether `LICENSE` is missing or stale, and the old version directory is not pruned. A complete replacement passes as the positive control.
  - **Extra-content fixture:** the old fixture changed `package.version` but kept the `0.44.0` tag, so its metadata was already invalid and the contents guard did nothing. The fixture now updates both fields and asserts that the metadata parses before adding `extra.txt`. The directory survives.
  - **Mutation checks for these fixes:** each of the three new guards (hash comparison, `LICENSE` existence, contents) was removed one at a time; each removal failed exactly its target test.
  - **Checks after these fixes:** `tsgo-snapshot-files.test.ts` passes 9 tests. `test` exits 0 with 828 passing tests in 24 files. `effect-policy:check`, `typecheck`, and `versions:check` exit 0. `/bin/sh -c "pnpm run lint"` exits 0 with 0 warnings and 0 errors. A real re-capture still reproduces both retained files byte-for-byte.
  - **Signal termination:** `runBounded` now records the termination `signal` in `BoundedResult`. `ensureCompleted` treats any command that a signal killed as incomplete, not only a timeout or an interrupt. A test runs `sh -c 'kill -TERM $$'`, and `ensureCompleted` rejects the result as incomplete, citing `SIGTERM`.
  - **Duplicate metadata rows:** capture used to collapse repeated upstream rows through a set comparison and a Map-based sort. It now asserts unique rule names and diagnostic names before sorting, and it sorts without deduplicating. Tests cover an identical duplicate and a conflicting duplicate; both are rejected. Restoring the old behavior fails the test.
  - **Checks after the fixes:** the three touched test files pass 25 tests. `typecheck` exits 0. `lint` exits 0 with 0 warnings and 0 errors. `test` exits 0 with 822 passing tests in 24 files, and 823 after the duplicate-key fix. `effect-policy:check` exits 0. The RTK shell wrapper rewrites a bare `pnpm lint` into an `eslint` call, so the lint script ran through `/bin/sh -c "pnpm run lint"`.
- **Refactor gate:** three behavior-preserving refactors, each verified before the next.
  - `tool-versions.ts` now reads the catalog through one private strict parser. It uses `uniqueKeys`, rejects parse errors before conversion, and reads scalars as written. Both the canonical and scoped lookups go through it. New tests cover bare and quoted keys, reordered sections, duplicate keys, and a missing entry.
  - `scripts/lib/stable-json.ts` now holds `stableJson`, `sortKeysDeep`, and `literal`. Snapshot I/O and `versions:check` no longer import `effect-policy.ts`, and `effect-policy.ts` has no re-export.
  - The generator builds the installed-preset record keyed by category. Hiding an installed preset still fails the write run before any output changes.
  - After each step, `effect-policy:check` passed and a re-capture plus regeneration reproduced every generated file and both snapshot files against the pre-refactor hashes.
  - Final checks: `test` exits 0 with 834 passing tests in 25 files. `typecheck`, `versions:check`, and `effect-policy:check` exit 0. Lint exits 0 with 0 warnings and 0 errors.
- **Commits:** none. The orchestrator commits.
- **Action items for MP:** add `mplibunao/backpressure` to the existing Renovate installation. Open `https://github.com/settings/installations/27958297`, complete GitHub's sudo confirmation, pick the repository under **Only select repositories**, and save. Activation is done when Renovate's onboarding PR appears.

### WI-03: Remove obsolete runtime policies and repair ownership contracts (DONE)

- **Build:** all 27 register rules are dropped by disposition. No manifest row was deleted: the manifest still has 219 rows and all 50 linteffect source identities. Each dropped row now has `disposition: dropped`, `implementationStatus: not-implemented`, `testStatus` and `parityStatus` set to `not-applicable`, `collections: []`, `testSource: none`, and a reason taken from the decided record. Origin, domain, `sourcePresets`, historical severity, gating, and source ownership are unchanged.
- **Replacement edges:** `RuleManifestEntry.replacedBy` is an optional non-empty tuple of generated `TsgoRuleId` values, imported type-only from `src/generated/tsgo-policy.ts`. Exactly the plan's eleven rows carry edges, and all eleven targets are graded `error` in the generated policy.
- **Runtime removal:** removed the 27 rule bodies from `rule-catalog.ts`, along with 62 helpers that only those rules used. The standalone `no-effect-as` module, its message module, its RuleTester file, and `utils/reports.ts` are deleted; only `no-effect-as` used `utils/reports.ts`. Messages for the five dropped rules that had one are gone, and the `effectValueMappingMembers` constant is removed. The `plugin.ts` comment about `no-effect-as` assembly is removed. Vendored linteffect fixtures are untouched.
- **Ownership repair:**
  - `isInAnyWrapperOwnedExpression` and the five helpers behind it are deleted and removed from all six survivors: `no-effect-all-step-sequencing`, `no-effect-bind`, `no-effect-call-in-effect-arg`, `no-effect-escape-hatch`, `no-effect-side-effect-wrapper`, and `no-pipe-ladder`.
  - The named-wrapper exemption is removed from `no-effect-ladder`, `no-flatmap-ladder`, and the flatMap-ladder owner check.
  - Single-callee ownership now covers only `bind`, through the same predicate that `no-effect-bind` reports.
  - The `orElse` ladder-owner branch is gone.
  - `no-effect-side-effect-wrapper` and `no-flatmap-ladder` now report through the same predicate that other rules use to defer to them.
  - A static test in `utils/effect-ownership.test.ts` fails if package source defines or references any retired wrapper helper.
- **Reclassified cases:** each wrapper-owned valid case whose owner was dropped now reports through a surviving rule in the RuleTester, per-rule replay, and preset duplicate-intent layers. New replay branches cover a named wrapper or pipe alias for all seven survivors that lost a guard. Cases that belonged only to deleted rules are removed. This includes the multiple-provide and type-alias duplicate-intent runner functions and their invocations. A new preset replay checks that nine decided-allowed shapes lint clean under the AST Effect preset. Examples: `const run = () => Effect.succeed(value)`, `Effect.as(program, value)`, `Effect.never`, and early returns in handlers.
- **Inventory:** `explicitDrops` now lists all 27 linteffect-origin drops and must equal the dropped linteffect rows exactly. A separate decided drop register lists all 30 drops with their exact `replacedBy` edges. It is checked in both directions against the manifest, and every edge target is checked against the pinned `tsgoRuleIds`. Dropped-row field shapes are checked. `replacedBy` on an active row fails. Runtime rule names and replay suite names must each equal the active custom rows exactly, so a dropped name in either fails. Source-fixture checks skip dropped rows, whose fixtures stay as history. A fixture directory with no manifest row fails.
- **Smoke sentinels:** the `no-effect-as` sentinels in `smoke-packed-consumer.ts` (runtime message, type contract, and real-oxlint diagnostic) and in `artifact-assertions.ts` now use `no-effect-escape-hatch`. A new packed step asserts that no dropped rule appears in the plugin, `effectPreset`, or `effectReactPreset`. It takes the dropped list from the source manifest. The LSP sentinel stays until its API transition in WI-06.
- **Counts (manifest query at `HEAD` versus the WI-03 tree):**

  | Measure | Before | After |
  | --- | --- | --- |
  | Manifest rows | 219 | 219 |
  | Runtime and active custom rules | 68 | 41 |
  | Dropped rows | 3 | 30 |
  | Rows with `replacedBy` | 0 | 11 |
  | `effectPreset` rows | 55 | 33 |
  | `effectReactPreset` rows | 6 | 3 |
  | LSP rows | 13 | 13 |
  | Unit tests (files) | 834 (25) | 627 (24) |
  | Replay suites and cases | 87 and 512 | 50 and 315 |

- **Judgment calls:**
  - **LSP rows stay:** the thirteen `lsp/*` rows, `lspOwnedChecks`, the inventory assertion on `lsp/missingEffectServiceDependency`, and the smoke's LSP sentinel stay until WI-06. The WI-06 done-when removes old LSP metadata, and the plan ties delegated-row activation to the new config.
  - **`effectVersionSensitivity` stays:** its removal is a public metadata cutover, so it lands with the WI-06 exports. New dropped rows keep their existing values.
  - **Owner registry and parent-reports check move to WI-04:** WI-04's done-when owns parent-exempt child violations and active-owner exact counts, and its narrowed predicates are what the registry must share. `isDirectArgumentOfBoundEffectCall` still defers to the parent call under the same active rule, not to a dropped owner. The warning-level `no-flatmap-ladder` still suppresses the two error owners. The §3.7 precedence change lands with WI-04's new error contracts.
  - **Pre-narrowing verdicts:** `Effect.as(Effect.succeed(1), value)` and `Effect.orElse(Effect.flatMap(program, f), fallback)` now report through `no-effect-call-in-effect-arg` or `no-effect-ladder`. No active rule owned them after the drops. WI-04's transforming-combinator contract will make both valid, because `as` does not transform and `orElse` is a v3 name.
  - **Early floor test:** `rule-manifest.test.ts` checks every edge against the generated policy severity, and the test fails when an edge points at a `warn` rule. G4 against the shipped fragment remains WI-06.
  - **Imports helpers kept:** `collectEffectNamespaceImports` and `isEffectNamespaceImportReference` in `utils/imports.ts` now have no production caller. They stay for the WI-04 `imports.ts` work.
- **Files touched outside the WI-03 key-file list:**
  - `tsconfig.scripts.json` includes `src/generated/tsgo-policy.ts`. Scripts type-check `rule-manifest.ts`, which now imports `TsgoRuleId`. The plan's §4 already lists this include.
  - `scripts/packages/oxlint-standards/artifact-assertions.ts` held the dist-artifact half of the `no-effect-as` sentinel, and the ordinary packed smoke runs it.
- **Stale references for a later item (not changed here):**
  - `stryker.config.mjs` still excludes the deleted `no-effect-as-message.ts` and `utils/reports.ts`. No work item owns the Stryker config.
  - `packages/oxlint-standards/README.md:86` still shows `no-effect-as` in an example.
  - `docs/references/lint-glossary.md:20` and `docs/references/mutation-testing.md:88` describe `src/rules/effect/`, which no longer exists. WI-09 owns consumer docs.
- **Negative controls:** each mutation failed with its intended message and was restored byte-for-byte.
  - Removing the `prefer-effect-fn` edge failed `inventory:rules`.
  - A replay suite for dropped `no-effect-never` failed it.
  - A runtime entry for dropped `no-effect-never` failed it.
  - An unregistered drop of `no-json-parse` failed it. A linteffect-origin flip of `no-effect-bind` failed the source-drop allowlist first.
  - A const-alias exemption added back to `no-pipe-ladder` failed `fixture:replay` at its preset ownership case.
  - An edge pointed at the `warn` rule `effecttsgo/lazy-effect` failed `rule-manifest.test.ts`.
  - A retired helper name in `utils/ast.ts` failed `effect-ownership.test.ts`.
  - Adding the active `no-effect-bind` to the smoke's dropped list failed `smoke:oxlint-packed-consumer`.
- **Checks (each run separately at the uncommitted WI-03 tree):**
  - `durable:refs`: exit 0.
  - `effect-policy:check`: exit 0.
  - `build`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0, with 0 warnings and 0 errors.
  - `versions:check`: exit 0.
  - `typecheck`: exit 0.
  - `test`: exit 0, with 627 passing tests in 24 files.
  - `check-release-workflow`: exit 0.
  - `changesets:check`: exit 0.
  - `SKIP_BUILD=true inventory:rules`: exit 0 (50 source rules represented, 23 linteffect rules implemented, 27 dropped).
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 50 suites and 315 cases.
  - `SKIP_BUILD=true smoke:oxlint-packed-consumer`: exit 0.
  - `smoke:tsconfig-packed-consumer`: exit 0.
  - `pack:dry-run:no-build`: exit 0.
  - `prose`: exit 0 after one wording fix in this section.
  - `introspection:check`: exit 1 with the same `config.schema_violation` as the intake baseline.
- **Process note:** a cleanup step briefly staged four deletions with `git rm --cached`. They were unstaged at once, and `git diff --cached` is empty. Nothing else was staged.
- **Refactor gate:** three behavior-preserving refactors after the orchestrator's review passed with no findings.
  - `hasMatchOrElseNull` calls `functionReturnNode`, and the byte-identical `exactFunctionReturnExpression` is deleted.
  - `hasEffectTypeOrRuntimeImport` and its `imports.test.ts` block are removed; a repo-wide search found no other reference.
  - The tuple-generated `no-flatmap-ladder` replay suite is folded into the detailed suite. Its two cases and generated controls duplicated existing ones, and its two branch IDs now tag the matching detailed cases.
  - After the refactors: `test` exits 0 with 622 passing tests in 24 files, and `typecheck`, `/bin/sh -c "pnpm run lint"`, and `build` exit 0. `SKIP_BUILD=true fixture:replay` exits 0 with 49 suites and 311 cases, and `SKIP_BUILD=true inventory:rules` exits 0.
- **Second refactor cycle:** two behavior-preserving refactors.
  - Each active rule now has exactly one replay suite. The eight rules with a duplicate suite were merged into their detailed suite; each `*.invalid-reference` and `*.valid-reference` ID now tags the byte-identical detailed case. For `no-manual-tag-check` and `no-promise-catch`, that case is the generated non-Effect control, which carries the ID through a new `nonEffectControlBranchIds` suite option. The typed-parameter `no-redundant-error-factory` cases and all six `prefer-effect-predicate` branch cases moved over as distinct cases. An explicit `no-redundant-error-factory` valid case that repeated its generated control is removed. `inventory:rules` now indexes suites directly and fails on a duplicate suite name; adding a second `no-pipe-ladder` suite reproduced that failure. Unique case contracts (source, filename, expected diagnostics, line, and branch IDs per case) and required branch IDs are identical for all 41 rules before and after. Replay dropped from 49 suites and 311 cases to 41 and 282.
  - A private `droppedRule` builder in `rule-manifest.ts` supplies the six fixed dropped fields through `sourceRule`, and all 30 dropped rows use it. Severity, provenance, domain, gating, reason, and `replacedBy` stay explicit at each call site. `JSON.stringify(ruleManifest)` is byte-identical before and after. The inventory's independent register and field validation are unchanged.
  - The tuple-only `no-instanceof-error`, `no-instanceof-tagged-error`, and `no-json-parse` suites repeated their generated non-Effect control as an explicit valid case. Each is now an explicit suite whose generated control carries its `*.valid-reference` ID through `nonEffectControlBranchIds`, and the repeated case is gone. Unique case contracts and required branch IDs are still identical for all 41 rules, and no replay case runs twice. `SKIP_BUILD=true fixture:replay` exits 0 with 41 suites and 279 cases. `SKIP_BUILD=true inventory:rules` exits 0, and `test` exits 0 with 622 passing tests in 24 files.
  - After the refactors: `test` exits 0 with 622 passing tests in 24 files. `typecheck`, `/bin/sh -c "pnpm run lint"` (0 warnings, 0 errors), and `build` exit 0. `SKIP_BUILD=true fixture:replay` exits 0 with 41 suites and 282 cases, and `SKIP_BUILD=true inventory:rules` exits 0.
- **Review gate:** not run here; the orchestrator owns review.
- **Commits:** none. The orchestrator commits.
- **Action items for MP:** none.

### WI-04: Implement narrowed composition and error contracts (DONE)

- **Build:** four rules now follow their §3.6 contracts, and the catalog gains the new `no-string-error-channel`. All catalog suppression now runs through one ownership registry. The runtime has 42 active custom rules, 41 of them from WI-03. The new rule is an `effect` preset row at `error`, rationale `agent-failure-mode`, gating `effect-callee`, disposition `reimplemented`.
- **New helpers:**
  - `utils/effect-context.ts` holds the function-boundary helpers. `isFunctionLike` and `functionReturnNode` moved here from `effect-ownership.ts`, which avoids an import cycle between the registry and the composition predicates.
  - `utils/effect-composition.ts` holds the transforming-combinator set, its data-first layouts, bound-pipe parsing, and the shared reporter predicates.
  - `utils/caught-values.ts` holds the caught-input binding table and the guard proofs.
  - `ast.ts` gains `peelTransparentExpression`, `isStringLiteral`, and `staticMemberPropertyName`. `imports.ts` gains `resolveVariable`, `isUnshadowedGlobal`, and `collectNamedImportNames`.
- **Transforming set, checked against the pinned source:** the set has 20 members from effect `4.0.0-rc.117` `Effect.ts`: `andThen`, `catch`, `catchCause`, `catchCauseFilter`, `catchCauseIf`, `catchDefect`, `catchEager`, `catchFilter`, `catchIf`, `catchNoSuchElement`, `catchReason`, `catchReasons`, `catchTag`, `catchTags`, `flatMap`, `flatten`, `map`, `tap`, `zip`, and `zipWith`. Each layout follows its `dual` discriminator in `internal/effect.ts`:
  - Fixed argument count for the `dual(2)`, `dual(3)`, and single-argument members.
  - `isEffect(args[0])` for `catchTag`, `catchTags`, `catchReason`, `catchReasons`, `catchIf`, and `catchFilter`.
  - `isEffect(args[1])` for `zip` and `zipWith`.
  - A separate script re-derived every overload's data-last and data-first arity from the source. Every data-first maximum equals the data-last maximum plus one, and the table matches all 20 members.
- **Ownership registry (`utils/effect-ownership.ts`):**
  - The registry has four edges. `no-effect-call-in-effect-arg` defers to `no-effect-ladder` when the ladder predicate holds. It also defers to an enclosing data-first call that has it as its source; this check, that the parent reports the same problem, replaces `isDirectArgumentOfBoundEffectCall`. `no-flatmap-ladder` (warn) defers to both error owners. `no-manual-tag-check` defers to `no-effect-internal-tags`.
  - Every edge shares its owner's reporting predicate.
  - `validateOwnershipRegistry(registry, manifest)` is pure and returns every broken edge. An edge breaks when an owner or reporter is not an active custom row, when a warning owner covers an error reporter, or when an owner is missing from a collection that enables its reporter.
  - Negative tests feed it a nonexistent owner, a dropped owner, a warn owner, a lowered shipped owner, a missing collection, and an inactive reporter.
  - A RuleTester block requires one example per reporter/owner pair. On each example the owner reports and the reporter stays silent.
  - The retired-helper static test now also rejects `isDirectArgumentOfBoundEffectCall`, `isOwnedByFlatMapLadderEnabled`, `isOwnedByGeneralEffectLadderRule`, and `isErrorLikeName`.
- **Contract cases covered.** Each list below is in both RuleTester and the per-rule replay matrix.
  - `no-manual-tag-check`:
    - Equality with the tag on either side, and `'_tag' in value`.
    - A nested reason tag, a computed string key, and an optional chain.
    - Plain reads (log, template) are valid, and so are `catchTag` and `Match.tag`.
    - `key in value`, an identifier named `_tag`, and `value[key]` / `value[_tag]` are valid.
    - A non-Effect file and a type-only import do not activate the rule.
    - The Option `Some` tag belongs to `no-effect-internal-tags`, one diagnostic in the preset replay.
  - `no-unknown-error-message`:
    - Invalid inputs: catch-clause reads, `String()`, and destructuring; a destructured catch parameter; `Effect.try` and `tryPromise` handlers as arrow, function, and object-method syntax; a const handler and a hoisted declared handler; a captured closure; a cast.
    - Proof failures: a guard crossing a function boundary; reassignment voiding a guard; the alternate branch; `String()` after an `Error` guard; a shadowed `Error`.
    - Valid: a typed `catchTag` handler; a local named `error`; a shadowing inner parameter; a decoded binding; an `instanceof Error` guard in an `if`; the same guard in a conditional; the same guard before `&&`; the object-with-message guard; a primitive guard before `String()`; a shadowed `String`; an unrelated `catch` property; a shadowed `Effect`; a mutable handler that is not followed.
  - `no-pipe-ladder`:
    - Invalid: a pipeline in a data-last or data-first transforming callback; in a bound-pipe source; in a step expression.
    - Pipe bindings: barrel, alias, `effect/Function` namespace, and barrel `Function`.
    - Edges: a chained inner segment reports once, and each deeper pipeline is a distinct edge.
    - Valid: Schedule inside `retry`; Layer and Schema pipes; generator tails, including a generator inside a transforming callback.
    - Valid: a top-level named program; chained `.pipe().pipe()`; opaque and bare-member steps; unbound and shadowed `pipe`; a resource callback; an unrelated function declaration.
  - `no-effect-call-in-effect-arg`:
    - Invalid: data-first `map`, `flatMap`, `flatten`, `catch`, `tap`, `andThen`, `catchTag`, `catchTags`, `zip`, and three-argument `zip`.
    - Placements: const, named return, and pipe alias.
    - Inside an exempt parent: `runPromise`, `forkChild`, and `scoped`, plus a const `repeat` and `as`.
    - Barrel and namespace aliases.
    - Valid: data-last Effect continuations, the runner/fork/resource list, `provide`, `as`, v3 `orElse`, `bind`, `zipRight`, and an ambiguous `zip(effect, identifier)`.
    - Valid: a ladder-owned const; a shadowing parameter; a type-only import; a lookalike object.
  - `no-string-error-channel`:
    - Invalid: a literal failure; `as const`, `satisfies`, and parentheses; plain and interpolated templates; wrapper, callback, and pipe-alias placements; a test file; a barrel alias.
    - Valid: tagged errors; identifiers and constants; a success string; tagged templates; a spread argument; a second argument; a shadowed `Effect`; a lookalike object; a type-only import.
  - Ladder precedence:
    - `no-effect-ladder` now requires a data-first transforming outer call.
    - It reports the deep `flatMap(flatMap(succeed))` and `flatten(map(succeed))` const shapes at error.
    - `no-flatmap-ladder` keeps only callback shapes, and it defers to both error owners.
- **Decided-valid shapes restored:** `Effect.as(Effect.succeed(1), value)` and `Effect.orElse(Effect.flatMap(program, f), fallback)` lint clean under the AST Effect preset. The same holds for runners; forks; resource helpers; `provide(scoped(...))`; tag logging; a typed `catchTag` message; `Effect.fail(error)`; chained pipes. The preset allowed-shapes replay covers all of them.
- **Preset ownership replay:** the cases are regrouped by precedence. New cases cover:
  - a transformation inside an exempt runner or a const `repeat`;
  - a nested chain reporting once;
  - a flatMap callback shape;
  - a pipe inside a transforming callback;
  - a string failure.
  - Every pipe-alias case now imports a bound `pipe`.
- **Judgment calls:**
  - **Ambiguous `zip`:** `Effect.zip(Effect.succeed(1), other)` with an identifier second argument is not reported. The runtime picks the overload by whether `other` is an Effect, which the AST cannot prove, and `other` might be an options object.
  - **Conditional guard position:** a conditional-expression consequent counts as a guard position beside `if` and `&&`. It has the same branch semantics as an `if` consequent, and without it the common `e instanceof Error ? e.message : ...` fix would be rejected.
  - **Destructured catch parameter:** `catch ({ message })` reports at the pattern, like a destructured handler parameter, because it extracts from the same unknown boundary.
  - **Shared tag predicate:** `isStaticTagAccess` is shared with `no-effect-internal-tags` so the reporter and the suppression use one predicate. With the shared predicate, `no-effect-internal-tags` no longer reports a computed-identifier key such as `option[_tag] === 'Some'`, and it now sees optional chains and type wrappers. The Either and Cause tag entries moved unchanged into `effect-ownership.ts`, where WI-05 removes them.
  - **New rule metadata:** `no-string-error-channel` uses `sourceOwnership: 'recon'`, because it came from the alignment app run, and `testSource: 'scenario-only'`. `effectVersionSensitivity: 'structural'` stays until the WI-06 cutover removes the field. The plan lists test files among invalid placements, so the rule has no test-file exemption.
  - **Bound `pipe` only:** a standalone pipe counts only with a bound `pipe`. The supported bindings are a named `pipe` import from `effect/Function` or `effect`; an `effect/Function` namespace; the barrel `Function`. A one-step pipeline qualifies because the contract requires at least one step. The earlier suites used an unbound `pipe`; they now import it.
  - **Rewritten ladder fixtures:** historical ladder fixtures that used the v3 `Effect.catchAll` or a `repeat` outer call were rewritten with v4 `Effect.catch` under a transforming outer call. The `repeat` form stays as a parent-exempt case.
  - **Collection coverage:** the registry validator also requires an owner to be enabled in every collection that enables its reporter. Without that check a consumer of only the reporter's preset would lose the diagnostic.
  - **Structural validator input:** `validateOwnershipRegistry` takes a structural row type instead of importing the manifest, because `utils/` may not import a parent directory. Its tests live in `rule-manifest.test.ts`.
  - **Message length budget:** each message stays under about 370 columns including the `x @mplibunao/oxlint-standards(<rule>): ` header. oxlint's non-terminal reporter wraps near 400 columns, and replay asserts the message as one substring. WI-05 writes the remaining messages and must keep the same budget, or switch the replay assertion to structured output.
- **Negative controls:** each mutation below was reverted afterward, and a byte comparison confirmed the restore.
  - Parent suppression through any bound Effect call failed 5 RuleTester cases. Through the built bundle it failed the replay's exempt-runner ownership case.
  - A `warn` owner edge failed the shipped-registry validation and the example-coverage test.
  - A name-based `error` heuristic failed 3 valid cases.
  - Dropping the transparent-wrapper peel failed the `as const` and `satisfies` cases.
  - Counting any call as a pipeline step failed the Layer case.
  - Letting a guard cross a function boundary failed the captured-closure case.
  - Making `no-flatmap-ladder` stop deferring to the error owners failed 6 cases.
  - Removing the shared-handler dedupe failed its new regression case.
- **App observation:** the built plugin ran through oxlint 1.58.0 on t3code `53456bc01` and executor `480b390ee`, using the recorded exclusions (vendored `.repos`, `dist`, generated files, and `.d.ts`). The table shows source / test hits. This is a review sample, not the G2 audit, which WI-08 owns.

  | Rule | t3code | executor |
  | --- | --- | --- |
  | `no-manual-tag-check` | 645 / 296 | 6 / 0 |
  | `no-pipe-ladder` | 272 / 19 | 36 / 6 |
  | `no-effect-call-in-effect-arg` | 7 / 10 | 8 / 1 |
  | `no-unknown-error-message` | 9 / 1 | 20 / 7 |
  | `no-string-error-channel` | 0 / 12 | 15 / 15 |
  | `no-effect-ladder`, `no-flatmap-ladder` | 0 | 0 |

  - Before narrowing, the recorded run had 2,601 t3code and 18 executor `no-manual-tag-check` hits.
  - Sampled hits match their contracts. They include data-first `Effect.map(Effect.service(...), f)`, `catch: (cause) => new X({ message: String(cause) })`, and `Effect.fail("boom")`. They also include pipelines inside `Effect.catch` callbacks. Several of those are one-step fallbacks such as `.pipe(Effect.as(null))`, which the "at least one step" contract includes.
- **For later items:**
  - **WI-06:** `assertReplacementFloors(manifest, fragment)` still needs the shipped `effectTsgoConfig` fragment. The early floor test in `rule-manifest.test.ts` still covers the edges against the generated policy.
  - **WI-07:** the G1 corpus must record the two house deviations. One is `no-string-error-channel` on `Effect.fail('timeout' as const)` (`ES/tests/03-basics.test.ts:198-207`, `EF/packages/effect/test/Cause.test.ts:650-658`). The other is the `no-manual-tag-check` comparison at `ES/…/04-services-and-layers.md:115`.
  - **WI-08:** measure the one-step fallback share of the t3code `no-pipe-ladder` hits, and compare this rule's data-first spans with `missed-pipeable-opportunity`.
  - **Unused helpers, deleted:** `collectEffectNamespaceImports` and `isEffectNamespaceImportReference` had no production caller anywhere in the repository. The refactor gate deleted them and their five dedicated tests. The generic `collectNamespaceImports` and `isNamespaceImportReference` helpers remain, and so does `effectNamespaceModuleSpecifiers` in `effect-identifiers.ts`. Afterwards `test` passed with 832 tests in 26 files, and `typecheck` and lint (0 warnings, 0 errors) exited 0.
- **Files touched outside the WI-04 key-file list:** test files for the listed helpers only: `utils/effect-context.test.ts` (new), `utils/ast.test.ts`, `utils/imports.test.ts`, `utils/effect-ownership.test.ts`, and `rule-manifest.test.ts`.
- **Checks (each run separately at the uncommitted WI-04 tree):**
  - `durable:refs`: exit 0.
  - `effect-policy:check`: exit 0.
  - `build`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0, with 0 warnings and 0 errors.
  - `versions:check`: exit 0.
  - `typecheck`: exit 0.
  - `test`: exit 0, with 765 passing tests in 25 files.
  - `check-release-workflow`: exit 0.
  - `changesets:check`: exit 0.
  - `SKIP_BUILD=true inventory:rules`: exit 0.
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 42 suites and 335 cases.
  - `SKIP_BUILD=true smoke:oxlint-packed-consumer`: exit 0.
  - `smoke:tsconfig-packed-consumer`: exit 0.
  - `pack:dry-run:no-build`: exit 0.
  - `introspection:check`: exit 1 with the same `config.schema_violation` as the intake baseline.
  - `prose`: exit 0, after wording fixes in this section.
  - Every pnpm command also prints `node_modules are out of sync with your lockfile`. WI-04 did not touch `package.json` or the lockfile.
- **Review gate:** RepoPrompt selection and Oracle calls were cancelled in the first pass. The orchestrator's review then found six correctness gaps, fixed below.
- **Review fixes:** each fix has RuleTester cases and a required replay branch.
  - **Conditional receivers (`nestingEdgeAt`):** only a direct receiver-chain segment is exempt as chaining. The chain may pass through a non-qualifying `.pipe` segment or a type assertion. A pipeline anywhere else in a receiver, such as `(cond ? other.pipe(Effect.map(f)) : fallback).pipe(Effect.catch(recover))`, is nested in that pipeline's source. Branches: `invalid.conditional-receiver-nesting` and `valid.direct-receiver-chains`.
  - **Effect-valued proof:** a bound call no longer proves an Effect by itself. `isEffectValuedCall` accepts a member whose every declared overload returns `Effect`, or a transforming combinator in its data-first layout. The member list has 72 entries: 71 read from the rc.117 `Effect.ts` signatures with the TypeScript compiler API, plus `all`, whose `All.Return` alias resolves to an `Effect`. Runners, `fn`, predicates, and data-last results are unknown. Branches: `valid.non-effect-valued-arguments` (runner and data-last arguments and sources), `invalid.effect-valued-transformation-argument`, and `invalid.effect-all-source`.
  - **Shadowed `undefined`:** a nullish guard counts `undefined` only as the unshadowed global. Branches: `invalid.shadowed-undefined-guard` and `valid.global-undefined-guard`.
  - **Handler wiring:** a handler binding with any later write is not followed. Among duplicate `catch` keys the last one counts, and a later spread or computed key makes the handler unknown. Branches: `invalid.effective-catch-property` and `valid.reassigned-or-overridden-handler`.
  - **Assignment destructuring:** `({ message: detail } = problem)` gets the same binding and guard checks as a declaration. Branches: `invalid.assignment-destructure` and `valid.guarded-assignment-destructure`.
  - **Compound assignment:** only a plain `=` target is write-only; `+=` and `??=` read the message first. Branches: `invalid.compound-assignment-read` and `valid.plain-message-assignment`.
- **Review-fix judgment calls:**
  - **Source proof:** the Effect-valued proof applies to the rule's source argument and to ladder depth, as well as to the `dual` discriminator, so `Effect.map(Effect.runSync(work), f)` is not reported.
  - **Adding `all` by hand:** without it, three real t3code sources of the form `Effect.map(Effect.all([...]), f)` stopped reporting.
  - **Disjunction guards:** `problem === undefined || problem === null` is still not a proof, because the contract recognizes only `&&` chains.
- **Review-fix negative controls:** each fix was reverted alone, and each reversion failed its new cases before the byte-for-byte restore.
  - Treating any receiver expression as chaining failed the conditional case.
  - Letting any bound call prove an Effect failed 4 valid cases.
  - Accepting a shadowed `undefined` failed 1 case.
  - Following a reassigned handler failed 1 case.
  - Ignoring later overrides failed 2 cases.
  - Ignoring assignment destructuring failed 1 case.
  - Treating compound assignment as write-only failed 2 cases.
- **App observation after the review fixes:** the same oxlint probe gave these source / test hits.
  - t3code `no-pipe-ladder` rose from 272 / 19 to 348 / 31, and executor from 36 / 6 to 39 / 6.
  - All 88 new t3code hits are qualifying pipelines inside a non-chain receiver expression. Examples: `Effect.all([x.pipe(Effect.mapError(...))]).pipe(Effect.map(...))`, `sql.withTransaction(a.pipe(...)).pipe(...)`, `Effect.scoped(gen.pipe(...)).pipe(...)`, and conditional receivers. They follow the "embedded in a source expression" contract; WI-08 should measure their share.
  - `no-effect-call-in-effect-arg` stays at 7 / 10 in t3code and 8 / 1 in executor. The other rules are unchanged.
- **Checks after the review fixes (each run separately):**
  - `test`: exit 0, with 787 passing tests in 25 files.
  - `build`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0, with 0 warnings and 0 errors.
  - `typecheck`: exit 0.
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 42 suites and 348 cases.
  - `SKIP_BUILD=true inventory:rules`: exit 0.
- **Second review:** the reviewer confirmed that the new `Effect.all` and `Effect.scoped` pipe hits are required, because a pipeline inside an outer qualifying pipeline's source is nesting. The runner and resource exemption belongs only to `no-effect-call-in-effect-arg`. Four more fixes follow, each with RuleTester cases and a required replay branch.
  - **Source eligibility and Effect proof:** these are now two separate checks, and both read one signature table. This replaces the 72-member always-Effect list from the first review.
    - The table is `effectReturnSignatures` in `utils/effect-identifiers.ts`, which §4 names as the home for v4 member facts.
    - It has 185 rows derived from the rc.117 `Effect.ts` overloads with the TypeScript compiler API. Each row records the argument counts that fit an Effect-returning overload, the counts that also fit a non-Effect overload, and the argument that decides those shared counts.
    - The deciding argument is the first position typed as an Effect in every Effect overload and in no other. For every member where the runtime `dual` predicate could be read, the derived position matches it: position 1 for `zip`, `zipWith`, `race`, and `raceFirst`, and position 0 for the `catch*` family, `provide`, `withSpan`, `forkIn`, `annotateLogs`, `track*`, and others.
    - Members whose predicate tests something else get no position, so their shared counts prove nothing. That covers `partition`, `validate`, `filterMapEffect`, `forEach`, and `filter`.
    - The seven conditional-type members that test whether their first argument is an Effect get position 0. They are `forkChild`, `forkScoped`, `forkDetach`, `forever`, `ignore`, `ignoreCause`, and `withErrorReporting`.
    - `isEffectSourceCall` (source eligibility and ladder depth) accepts any call whose count fits an Effect-returning overload. `isEffectValuedCall` (the discriminator proof) accepts a shared count only when the deciding argument is itself provably an Effect.
    - Runners fit no Effect overload, so they stay the only unknowns. A data-last call such as `Effect.map(f)` fits only the function-returning overload.
    - A transforming combinator is data-first exactly when it is provably Effect-valued, so the hand-written layout functions are gone. The table rows reproduce the hand-verified counts for all 20 transforming members.
    - Branches: `invalid.dual-member-sources` covers `Effect.as(work, 1)`, `Effect.provide(work, layer)`, and `Effect.forkChild(work)` as sources. `invalid.dual-member-proof` covers `zip` with a proven `provide` argument. `valid.data-last-dual-sources` covers data-last calls. The runner and options controls stay.
  - **Spread arguments:** a call with a spread argument has an unknown count, so only a member that returns an Effect for every count can prove anything. Branch: `valid.spread-arguments`, covering `Effect.andThen(Effect.succeed(1), ...([] as const))` and a spread `zip`.
  - **`delete` operand:** a direct `delete problem.message` does not read the value. Branch: `valid.delete-message-operand`.
  - **Built-in owners:** an owner must have the `ported` or `reimplemented` disposition, not merely be undropped. A negative test marks the tag owner `built-in` and expects the one owner problem.
- **Second-review judgment calls:**
  - **Scoped lint disable:** `no-magic-numbers` is disabled around the signature table only, because its numbers are overload argument counts.
  - **Table location:** the table lives in `effect-identifiers.ts`, which is outside the WI-04 key-file list. §4 assigns v4 member facts to that file.
- **Second-review negative controls:** each fix was reverted alone, and each reversion failed its new cases before the byte-for-byte restore.
  - Requiring the strict proof for sources failed 2 cases, `provide` and `forkChild`.
  - Treating any bound call as a source failed 2 runner cases.
  - Counting spread calls failed the empty-spread case.
  - Reading a `delete` operand failed its control.
  - Accepting a non-dropped `built-in` owner failed the new registry test.
- **App observation after the second review:** hit counts are unchanged in both apps. t3code `no-effect-call-in-effect-arg` stays at 7 / 10 and `no-pipe-ladder` at 348 / 31; executor stays at 8 / 1 and 39 / 6.
- **Checks after the second review (each run separately):**
  - `test`: exit 0, with 797 passing tests in 25 files.
  - `build`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0, with 0 warnings and 0 errors.
  - `typecheck`: exit 0.
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 42 suites and 353 cases.
  - `SKIP_BUILD=true inventory:rules`: exit 0.
- **Third review:** four behavior fixes and a maintenance item. Each behavior fix has RuleTester cases and a required replay branch.
  - **Redeclaring `var` (`caught-values.ts` `hasReassignment`):** only a write whose identifier is the binding's first definition counts as its initialization. `var problem = replacement` inside a guarded branch now voids the guard. That holds for a `catch` parameter, where the initializer writes the catch binding, and for an `Effect.try` handler parameter. Branches: `invalid.redeclaring-var-voids-guard` and `valid.unrelated-var-and-defaulted-guard`.
  - **Handler-map callbacks (`effect-composition.ts` `nestingEdgeAt`):** discovery now follows an inline callback that is a property value of the handler-map object literal in a bound `Effect.catchTags` or `Effect.catchReasons` call. Method syntax counts too. The walk may pass through a transparent wrapper such as `satisfies`. The map position depends on the argument count: `catchTags` takes it at argument 0 in a call with 1 or 2 arguments, and at argument 1 with 2 or 3; `catchReasons` takes it at argument 1 with 2 or 3 arguments, and at argument 2 with 3 or 4. In each case the other layout never takes an object literal at that position, so an object literal there can only be the map. Branches: `invalid.catch-tags-handler-map`, `invalid.catch-reasons-handler-map`, and `valid.unverified-object-callbacks`. The valid branch covers these controls: an unrelated object; a nested object; a getter; the options argument; an `Effect.match` options object; a shadowed `Effect`.
  - **Defaulted handler parameters (`effectTryCatchParameter`):** an `AssignmentPattern` parameter resolves to its left side. `(problem = fallback) => problem.message` tracks the binding, and `({ message } = { message: 'fallback' }) => message` reports the pattern. A guard still proves a defaulted binding. Branch: `invalid.defaulted-handler-parameter`.
  - **Destructuring write targets (`isMessageMemberRead`):** a member is write-only when it fills a target position up to a plain `=` or a `for…of` / `for…in` head. Those positions are a transparent wrapper, an object-pattern property value, an array-pattern element, a rest argument, and the left side of a default. A computed key or a default value is evaluated, so it still reads, and compound assignments still read. Branches: `valid.pattern-write-targets` and `invalid.evaluated-pattern-parts-read`.
  - **Signature table maintenance:** the table is now generated.
    - `scripts/checks/effect-signatures.ts` reads the package's published `dist/Effect.d.ts` through `scripts/lib/effect-signatures.ts` and writes `packages/oxlint-standards/src/generated/effect-signatures.ts`. The module records `effectSignatureSourceVersion`.
    - The reviewed decisions live in `scripts/config/effect-signature-review.ts`: the Effect type names and the discriminator of every ambiguous member. The capture fails when a derived discriminator differs from the review, when an ambiguous member has no review entry, when a reviewed member is no longer ambiguous, or when a conditional return does not have an Effect true branch.
    - Both modes refuse a package whose version differs from `integration.effect`. `--check` also fails when the recorded version differs from the pin, or when the rendered table differs from the committed one.
    - Commands for an Effect bump, run from the repository root after changing `integration.effect`. The tarball goes to a temporary directory outside the repository; review the table diff after the capture:

      ```sh
      tmp="$(mktemp -d)"
      (cd "$tmp" && npm pack effect@<integration.effect> && tar -xzf effect-*.tgz)
      bun scripts/checks/effect-signatures.ts --capture "$tmp/package"
      bun scripts/checks/effect-signatures.ts --check "$tmp/package"
      ```

    - `pnpm check` does not run either mode, because both need the external package. `pnpm test` does assert offline that the committed table records the pinned version.
- **rc.115 regeneration against the rc.117 table:** no signature or discriminator differs between the versions. Read with the same method, rc.115 `src/Effect.ts` and the rc.117 checkout's `src/Effect.ts` produce identical rows. The generated table differs from the rc.117 table in two rows, both capture-method corrections that also apply to rc.117:
  - `tx`, which returns an Effect for every call, was missing because its source declaration is an unannotated arrow function. The declaration file types it.
  - `fromOption` was missing because the prototype skipped conditional return types other than the Effect-first form. It returns an Effect for an `Option` and a function for a lazy fallback, so the review records no discriminator. Its counts come from the `[] | [onNone]` rest tuple, 1 or 2.
  - rc.115 declares `withLogger`, `annotateLogs`, and `withLogSpan` through `dual<…>` type arguments rather than an annotation. The declaration file prints them as intersections, which the capture reads, and their rows match rc.117.
  - Reading the declaration file and rc.115 `src/Effect.ts` agrees on every row except `tx`.
  - Rule impact: `Effect.map(Effect.tx(work), f)` and `Effect.map(Effect.fromOption(maybe), f)` now report. `fromOption` cannot prove the `zip` data-first overload. Branches: `invalid.captured-unannotated-and-conditional-sources` and `valid.undiscriminated-conditional-argument`.
- **Third-review judgment calls:**
  - **Declaration-file input:** the capture reads `dist/Effect.d.ts`, because every export there carries its type, and an installed package may not ship `src/`.
  - **Handler-map layout in rule code:** the four map positions are hand-kept in `effect-composition.ts` from the rc.115 declarations; the capture does not generate them. `catchReason` needs no entry, because its handler is a direct argument.
  - **Helper placement:** the handler-map check lives in `effect-composition.ts`, not `effect-context.ts`, because it needs Effect binding facts.
  - **Delete through wrappers:** `delete (problem.message)` counts as a `delete` operand, like the direct form.
  - **Table location:** the table moved from `utils/effect-identifiers.ts` to `src/generated/effect-signatures.ts`, next to the generated tsgo policy, and is imported through the `#oxlint-standards` alias.
  - **Offline version assertion:** `scripts/lib/effect-signatures.test.ts` checks that the committed table records `integration.effect`. It needs no package, so a pin bump without a regeneration fails `pnpm test`.
- **Third-review negative controls:** each mutation was reverted afterward, and a byte comparison confirmed the restore.
  - Exempting every initializing write failed the 2 redeclaration cases.
  - Dropping handler-map discovery failed the 6 handler-map cases.
  - Dropping the default-parameter unwrap failed the 2 defaulted cases.
  - Disabling the pattern climb failed 7 write-target cases. The direct `for…of` head needs no climb.
  - Removing the `tx` and `fromOption` rows failed their 2 source cases.
  - `--check` failed on a hand-edited row, on a recorded rc.117 version, and on a package reporting rc.117.
- **App observation after the third review:** t3code `no-pipe-ladder` rose from 348 / 31 to 382 / 31, and executor from 39 / 6 to 40 / 6. All 35 new hits are pipelines inside `Effect.catchTags` handler callbacks, and no earlier hit disappeared. The other rules are unchanged in both apps.
- **Checks after the third review (each run separately):**
  - `test`: exit 0, with 835 passing tests in 26 files.
  - `build`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0, with 0 warnings and 0 errors.
  - `typecheck`: exit 0.
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 42 suites and 363 cases.
  - `SKIP_BUILD=true inventory:rules`: exit 0.
  - `bun scripts/checks/effect-signatures.ts --check` against the rc.115 package: exit 0.
- **Fourth review:** two fixes in `caught-values.ts`, each with RuleTester cases and a required replay branch.
  - **Accessor `catch` properties (`effectiveCatchProperty`):** the last `catch` definition wins. When it is a `get` or `set` accessor the wiring is unknown, so no handler is tracked. When it is a plain `kind: 'init'` property it is the handler, even after an earlier accessor. Branches: `valid.accessor-catch-property`, with a getter and a setter after a plain handler, and `invalid.plain-catch-after-accessor`, with a getter and a setter before one.
  - **Optional-chain `delete` (`isWriteOnlyTarget`):** the `delete` check looks through one enclosing `ChainExpression`, so `delete problem?.message` is write-only. `use(problem?.message)` still reports. Branches: `valid.optional-chain-delete` and `invalid.optional-chain-message-read`.
- **Fourth-review judgment call, resolved:** the first pass left the handler untracked whenever any `catch` accessor was present. A follow-up review corrected it to follow the effective last definition, matching runtime object-literal semantics.
- **Fourth-review negative controls:** each mutation was reverted afterward, and a byte comparison confirmed the restore.
  - Ignoring accessor kinds failed 3 of the 4 accessor controls. A getter after a plain handler already had no parameter to track.
  - After the correction, `test` passes with 841 tests and `fixture:replay` with 42 suites and 367 cases.
  - Dropping the chain lookup failed the optional-chain `delete` control.
- **App observation after the fourth review:** hit counts are unchanged in both apps.
- **Checks after the fourth review (each run separately):**
  - `test`: exit 0, with 841 passing tests in 26 files.
  - `build`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0, with 0 warnings and 0 errors.
  - `typecheck`: exit 0.
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 42 suites and 366 cases.
  - `SKIP_BUILD=true inventory:rules`: exit 0.
- **Refactor (behavior-preserving):**
  - `visitSelfAndDescendants` moved from `rule-catalog.ts` to `utils/ast.ts`. `containsBoundEffectMemberCall`, `containsAnyBoundNamespaceCall`, and `containsSideEffectCall` now use it, each keeping its own predicate and traversal order.
  - Nine ordinary RuleTester entries that repeated an `ownershipEdgeExamples` case exactly were removed. The registry loop and its coverage assertion are unchanged.
  - `no-pipe-ladder` no longer calls `simpleProgramGate`: every qualifying step already needs a runtime Effect binding, and type-only imports are excluded when names are collected. New RuleTester controls and the replay branch `valid.no-runtime-effect-binding` cover the no-import, type-only namespace, and type-only specifier cases.
  - The t3code and executor diagnostics are identical before and after, by rule, file, and offset. Checks: `test` 837 passing in 26 files; `build`; lint with 0 warnings and 0 errors; `typecheck`; `fixture:replay` with 42 suites and 368 cases; `inventory:rules`. All exit 0.
- **Second refactor (behavior-preserving):**
  - `boundNamespaceCallMember(context, node, namespaceNames)` in `utils/imports.ts` now performs the bound namespace call lookup for `isBoundMemberCall`, `isAnyBoundMemberCall`, `isAnyBoundNamespaceMemberCall`, and `boundEffectCallMember`. `containsAnyBoundNamespaceCall` keeps its own matching.
  - `isEffectSourceCall` and `isEffectValuedCall` share the private `fitsEffectOverload` predicate, so the proof resolves the signature once. Source eligibility and the Effect proof stay separate.
  - The t3code and executor diagnostics are identical before and after, by rule, file, message, and span. Checks: `test` 837 passing in 26 files; `build`; lint with 0 warnings and 0 errors; `typecheck`; `fixture:replay` with 42 suites and 368 cases; `inventory:rules`. All exit 0.
- **Commits:** none. The orchestrator commits.
- **Action items for MP:** none.

### WI-05: Retarget v4 APIs and finish the remaining narrowings and messages (DONE)

- **Build:** the six remaining §3.6 contracts and the named v3 cleanup are implemented. All 42 active custom rules now have written messages. Each behavior change has RuleTester cases, a required replay branch, and a manifest note.
- **v4 names, checked against the pinned 4.0.0-rc.115 package and the rc.117 checkout:**
  - Schema has 24 decoder and encoder factories: `decode` or `encode`, optionally `Unknown`, then `Effect`, `Exit`, `Option`, `Promise`, `Result`, or `Sync`. The old list lacked the four `Result` members and wrongly held `is` and `asserts`.
  - Option has `fromNullishOr`, `fromUndefinedOr`, and `getOrNull`. Effect has only `die` and `orDie`, plus `succeedNone`.
  - `Effect.gen` takes `(body)` or `(options, body)`. `Effect.fn` takes `(body, ...pipeables)` or `(name, options?)(body, ...pipeables)`.
  - The Atom functions `get` and `refresh` take one argument and return an Effect. `set`, `update`, and `modify` are `dual(2)`: two arguments return an Effect, and one returns a function. Registry instance methods are synchronous.
  - A v4 Cause is untagged. Its reasons carry `Fail`, `Die`, or `Interrupt`, with public `isFailReason`, `isDieReason`, and `isInterruptReason`. Result and Exit are tagged `Success` or `Failure`. rc.115 has no `effect/Either` module.
  - Atom and Reactivity live under `effect/unstable/reactivity` in rc.115 and under `effect/reactivity` in rc.117.
- **Rule contracts:**
  - `no-inline-schema-compile` (now `warn`, `style`): a v4 factory inside a function whose schema argument is a direct bound `Schema.*(...)` call, peeling type wrappers. Returned and assigned decoders report. Hoisted, member, parameter, module-scope, and opaque `makeSchema()` schemas are valid, and so are `is`, `asserts`, `decodeTo`, and a schema first assigned to a local.
  - `no-return-null` (now `warn`, `style`, gating `effect-callee`): `return null` whose nearest function is an `Effect.gen` or `Effect.fn` generator, plus a bound `Effect.succeed(null)`. Valid: React components, `T | null` helpers, nested ordinary helpers, `Option.none()`, `succeedNone`, arbitrary generators, `fnUntraced`, and a local lookalike. A generator passed to a traced function or placed in the options slot is valid too.
  - `no-react-state`: bans the five hooks, as bare or member calls. `useState`, `React.useState`, and atom-react hooks are valid.
  - `no-fromnullable-nullish-coalesce`: exactly `fromNullishOr(value ?? null)` and `fromUndefinedOr(value ?? undefined)` with the global `undefined`. Namespace aliases and the barrel import both match, including inside parentheses. The crossed pairs, other fallbacks, `||`, a shadowed `undefined`, a lookalike, and v3 `fromNullable` are valid. No autofix.
  - `no-atom-registry-effect-sync`: each Effect-returning Atom call that runs synchronously in an inline `Effect.sync` callback, including an invoked ordinary inline function and the callback's parameter defaults, with one report per call. Nested generators and declared functions are skipped. Registry and `atomRegistry` calls, data-last `Atom.set(value)`, shadowed and local objects, the v3 atom-react package, and type-only imports are valid.
  - `no-effect-escape-hatch`: `die` and `orDie` only, as calls or member references (`program.pipe(Effect.orDie)`), with const, function, and pipe-alias wrappers. `dieMessage`, `orDieWith`, typed recovery, lookalikes, test files, and a justified inline disable (replay, real engine) are valid.
- **v3 cleanup:**
  - `no-branch-in-object` loses its Either branch.
  - `no-effect-internal-tags` maps Cause to its three reason tags, and Result and Exit to `Success`/`Failure`. Either, the five v3 Cause combinator tags, and Result `Left`/`Right` are now valid controls.
  - `no-effect-all-step-sequencing` and `no-effect-side-effect-wrapper` resolve Atom and Reactivity through `collectReactivityModuleNames`.
  - `zipRight` is gone from `no-effect-side-effect-wrapper`.
- **`Effect.as` value slot:** the rule reads argument 0 of a one-argument call and argument 1 of a two-argument call; other counts are ignored. The data-first source is not checked. Controls: console, `setState`, `Effect.logInfo`, and v4 `Atom.set` values in both arities, plus an invoked inline function, named wrappers, and pipe aliases. Pure controls: identifiers, object literals, `Option.some(1)`, an unclassified `makeValue()`, source-slot side effects, a function value, v3 `zipRight`, and the v3 Atom.
- **Classifier fix (`utils/side-effects.ts`):** `containsSideEffectCall` no longer enters a function unless it is invoked on the spot, because a function value's body does not run when the Effect is built. The reviewed eager-call list is unchanged. Two unit tests cover a function value and an invoked function.
- **Messages:** `ruleMessage` throws for a rule with no written message and for an unfilled `{{placeholder}}`; the generated fallback is gone. `hasExplicitRuleMessage` is internal, not a package-root export. Each of the 42 messages reads `Rule: <name>. Why: … Fix: … Ref: …`, citing linteffect, executor, an Effect module, an ADR, a PA decision, or house style. The Atom message names the reported method. `rule-messages.test.ts` checks:
  - every catalog rule has a message, and no dropped rule does;
  - the Why/Fix/Ref shape;
  - `maxDiagnosticLineLength` (370) for each rendered `x @mplibunao/oxlint-standards(<rule>): <message>` line;
  - the unknown-rule and missing-placeholder errors.
  The longest line is 368 columns.
- **New helpers:**
  - `utils/effect-identifiers.ts`: `schemaCodecFactoryMembers` and `reactivityBarrelSpecifiers`.
  - `utils/imports.ts`: `collectReactivityModuleNames`.
  - `utils/effect-context.ts`: `nearestEnclosingFunction`, `isEffectGeneratorBody`, `runsWhenReached`, and `visitSynchronousBody`.
  - `utils/ast.ts`: `visitSelfAndDescendantsWhere`.
- **Replay:**
  - The four tuple suites (Atom, Option, hooks, return null) are now explicit branch matrices.
  - A case can carry `messageData`, so replay asserts the exact rendered method.
  - Preset ownership cases that used `zipRight` or a side effect in the `Effect.as` source slot were rewritten to the value slot. Seven decided-allowed shapes were added.
  - The allowed-shapes replay now fails on any plugin diagnostic, because a `warn` report leaves the exit code at 0.
- **Governance:**
  - PA-3 and the taxonomy row in `preset-architecture.md` changed in the same edit as the hook behavior. The row now lists the three surviving `effect-react` rules.
  - BP-TD-010 was moved by hand to `docs/records/tech-debt/done/bp-td-010.md`. Its status and status tag are now `done`, and it gains a new `updated_at` plus a resolution citing `ec4f4f8` and the decided entry. ID, creation time, source, and visibility are unchanged.
  - The record validates against the canonical introspection schemas with ajv. A bad-status copy fails, as a control.
- **Judgment calls:**
  - **Both reactivity paths:** the pinned rc.115 has only `effect/unstable/reactivity`, and both apps import it (199 barrel imports and 13 `Atom` subpath imports). Binding only `effect/reactivity/Atom`, as §3.6 names it, would never fire on the pinned version, so both v4 paths count. Each path is a v4 identity; v3 `@effect-atom/atom-react` does not count.
  - **Atom arity:** only the Effect-returning argument count reports. A spread call is unknown, and data-last `set`, `update`, and `modify` return a function, so the "returns an Effect" message would be false there.
  - **Cause tags kept:** `Fail`, `Die`, and `Interrupt` are verified v4 reason tags with public predicates, not a flat v3 mapping.
  - **Rationale class:** `no-inline-schema-compile` and `no-return-null` are `style` at `warn`. ADR-004 puts preferences at the quieter level, and a `correctness` row at `warn` fails the manifest grading test.
  - **Named `Effect.fn`:** `Effect.fn(x)(body)` counts as the named factory only when `x` is provably a span name. A span name is a string literal or untagged template, directly or through a `const`. Any other `x` leaves the overload unknown and does not report. That covers a provable function, a parameter, an import, and a reassignable variable.
  - **Schema pipe chains:** only a direct bound `Schema.*(...)` call is evidence. `Schema.Struct({}).pipe(...)` passed inline is not matched.
  - **Directive wording:** the `no-ts-nocheck` message avoids the literal directive, so the repository's own rule does not report `rule-messages.ts`.
- **Negative controls:** each mutation was reverted afterward, and checksums of all 14 changed files confirmed the restore.
  - Putting `useState` back in the ban failed 3 cases.
  - Ignoring Atom arity failed 1.
  - Letting the synchronous walker enter every function failed 4.
  - Checking the `Effect.as` source slot failed 8.
  - Accepting any `Effect.gen` argument position failed 1, after a position case was added: the first attempt failed 0.
  - Treating any generator as an owner failed 4.
  - Letting `fromNullishOr` accept `?? undefined` failed 1. The first mutation for the crossed pair was a no-op, because the `undefined` name check still held.
  - Accepting a shadowed `undefined` failed 1.
  - Reporting any schema argument failed 6.
  - Restoring the Either and `Left`/`Right` tags failed 2.
  - Restoring the generated message fallback failed the message test.
  - Restoring `dieMessage` and `orDieWith` failed 2.
  - Through the built bundle and real oxlint, a constant Atom method name failed the replay's refresh case, and an ungated `return null` failed the allowed-shapes React component.
- **App observation:** the built plugin ran through oxlint 1.58.0 on t3code `53456bc01` and executor `480b390ee`, excluding `.repos`, `dist`, `node_modules`, `.d.ts`, and generated files. Counts are source / test hits, as a review sample for WI-08.

  | Rule | t3code | executor |
  | --- | --- | --- |
  | `no-react-state` | 1931 / 5 | 238 / 0 |
  | `no-return-null` | 196 / 34 | 162 / 47 |
  | `no-effect-escape-hatch` | 103 / 0 | 27 / 0 |
  | `no-effect-internal-tags` | 58 / 99 | 0 |
  | `no-inline-schema-compile` | 19 / 12 | 3 / 1 |
  | `no-fromnullable-nullish-coalesce` | 2 / 1 | 0 |
  | `no-effect-all-step-sequencing` | 1 / 0 | 0 |
  | `no-atom-registry-effect-sync`, `no-effect-side-effect-wrapper` | 0 | 0 |

  - `no-react-state` reports only the five hooks. The t3code split is 1,192 `useCallback`, 688 `useEffect`, 27 `useContext`, 24 `useSyncExternalStore`, and 5 `useReducer`, with no `useState`.
  - The decided record's false positives no longer report: `PreviewAutomationHosts.tsx:278` (React `return null`) and executor `main.ts:2428` (nullable helper). Its live case `DesktopWindow.test.ts:350` reports.
  - Every sampled `no-return-null` hit is an `Effect.gen` or `Effect.fn` generator or an `Effect.succeed(null)`. In t3code, 105 of the 230 hits are `Effect.succeed(null)`, and 19 of those are `Schema.withDecodingDefault(Effect.succeed(null))` defaults for `NullOr` fields, which the contract reports.
- **For later items:**
  - **WI-08:** measure the `Schema.withDecodingDefault(Effect.succeed(null))` share of `no-return-null`, and the `useCallback` share of `no-react-state`.
  - **WI-11:** `docs/references/rules.md` still describes the old behavior until it is generated.
  - **WI-09:** the rest of `preset-architecture.md`, including its status line and the `@effect-atom` gate wording in the historical audit.
- **Effect-stack gate (resolved by the orchestrator: decided record is v4-primary; v3 is out of scope):** `isEffectStackModuleSource` recognizes exactly the v4 Atom bindings published from the Effect repository: `@effect/atom-react`, `@effect/atom-solid`, and `@effect/atom-vue` (rc.117 `packages/atom/*/package.json`, each a peer of `effect`). The v3 `@effect-atom/atom-react` entry is removed, because §3.7 forbids keeping an obsolete matcher only to preserve old tests.
  - **Retained fixture:** the vendored `no-switch-statement/invalid-switch-atom-react.ts` imports only the v3 package, so it no longer marks an Effect file. The file stays vendored as history. `check-rule-inventory.ts` records its changed expectation in `retiredSourceFixtureExpectations`, a register keyed by rule and fixture, with the v3-out-of-scope reason. For a registered fixture the inventory requires a valid replay case and rejects an invalid one. It also rejects a register entry that does not name an invalid fixture of an active rule. The replay and RuleTester suites now list the fixture as valid.
  - **Register controls:** `inventory:rules` failed with its intended message for an unknown register key and for a removed register entry. Replaying the retired case as invalid failed it too.
  - RuleTester: `hasEffectStackImport` holds for each of the three v4 bindings. It is false for a type-only `@effect/atom-react` import, for `@effect/vitest`, and for the v3 package. `no-switch-statement` reports in files importing only one of the three v4 bindings, and `no-json-parse` reports with `@effect/atom-react` alone.
  - Replay: the `no-switch-statement` and `no-json-parse` suites each gain a `@effect/atom-react`-only invalid case, with a type-only valid control beside the first. A preset run adds the component-level proof: the full AST Effect preset reports exactly one `no-json-parse` and one `no-switch-statement` in a `.tsx` component that imports only `@effect/atom-react`.
  - Negative controls: removing `@effect/atom-react` from the gate failed 3 unit tests and the preset replay (`unexpectedly passed`). Putting the v3 package back failed the retained fixture's valid case and the v3 unit test. Each restored file matched its checksum.
  - The composed-preset replays now use `@effect/atom-react` as their React-file import.
- **Review fixes:** four correctness fixes, each with RuleTester cases and a required replay branch.
  - **Generator bodies are deferred (`effect-context.ts`):** calling a generator function only creates an iterator. `runsWhenReached` no longer enters an invoked generator, and `visitSynchronousBody` visits nothing when the callback itself is a generator. `Effect.as(Effect.succeed(1), (function* () { console.log('later') })())` and its data-last form are now valid. A generator callback such as `Effect.sync(function* () { Atom.set(count, 1) })` is valid, as is a generator invoked inside the callback. An ordinary invoked function still reports in both rules. Branches: `no-effect-side-effect-wrapper` `valid.invoked-generator-deferred`, and `no-atom-registry-effect-sync` `valid.generator-bodies-deferred`.
  - **Curried `Atom.set` (`side-effects.ts`):** the classifier counts `Atom.set` only with the Effect-returning argument count. The count rule is now the shared `boundAtomEffectMember` in `utils/imports.ts`, over `atomEffectArgumentCounts` in `effect-identifiers.ts`, and `no-atom-registry-effect-sync` uses the same helper. `Effect.as(Effect.succeed(1), Atom.set(1))` and `program.pipe(Effect.as(Atom.set(1)))` are valid. The classifier still walks the arguments, so `Atom.set(console.log('x'))` reports in both arities. Branches: `valid.curried-atom-set` and `invalid.curried-atom-set-eager-argument`.
  - **`Effect.fn` with an identifier (`effect-context.ts`):** see the named `Effect.fn` judgment call. `Effect.fn(body)(function* () { return null })` is valid when `body` is a `const` generator or a function declaration. A string-constant span name still reports; the second review made a parameter valid (see below). Branches: `valid.traced-function-bindings` and `invalid.span-name-bindings`.
  - **v3 gate entry removed:** see the Effect-stack gate entry above.
  - **Negative controls:** each mutation was reverted afterward, and checksums of all 16 changed TypeScript files confirmed the restore.
    - Entering invoked generators failed 4 cases.
    - Visiting a generator callback failed 1.
    - Counting a curried `Atom.set` failed 3.
    - Treating a function binding as a span name failed 2.
    - Restoring the v3 gate entry failed 2.
- **Second review fixes:** four more contract fixes, each with RuleTester cases and a required replay branch.
  - **Spread in `Effect.as` (`rule-catalog.ts` `hasEagerEffectAsValue`):** a spread argument hides the real argument count, so the rule picks no overload and checks no value slot. `Effect.as(...([Effect.logInfo('source'), 42] as const))` and `program.pipe(Effect.as(...[console.log('x')]))` are valid, beside the non-spread eager-value invalid controls. Branch: `valid.spread-arguments`.
  - **Parameter defaults run at the call (`effect-context.ts`):** an invoked function evaluates its parameter defaults even when its generator body waits, and `Effect.sync` calls its direct callback. `runsWhenReached` now enters an invoked function of either kind and skips only a generator's body. `visitSynchronousBody` walks the callback's parameters and, unless it is a generator, its body. Defaults of a function that is never called stay unvisited.
    - `Effect.as(Effect.succeed(1), (function* (v = console.log('now')) {})())` reports.
    - `Effect.sync((v = Atom.set(count, 1)) => v)` and `Effect.sync(function* (v = Atom.set(count, 2)) {})` each report.
    - Branches: `invalid.invoked-parameter-defaults`, `valid.uncalled-parameter-defaults`, and `invalid.callback-parameter-defaults`. Two unit tests in `side-effects.test.ts` cover an invoked generator's deferred body and its defaults.
  - **Class instance fields are deferred:** an instance field initializer (`PropertyDefinition` or `AccessorProperty` value without `static`) runs only on instantiation, so it is not visited. Computed keys, static fields, and static blocks run at class definition and stay visited.
    - `Effect.as(Effect.succeed(1), class { value = console.log('later') })` and `Effect.sync(() => class { value = Atom.set(count, 1) })` are valid.
    - The static-field, static-block, and computed-key forms report, as does `class { static value = Atom.set(count, 1) }` returned from the sync callback.
    - Branches: `invalid.class-definition-time`, `valid.class-instance-fields`, `invalid.static-field-atom-call`, and `valid.deferred-class-and-default-code`.
  - **Unresolved `Effect.fn` argument (`isProvableSpanName`):** see the named `Effect.fn` judgment call. `isProvableFunction` is gone; the factory test now asks for a provable span name.
    - A parameter, an import, and a `let` are valid, as are a `const` generator and a function declaration.
    - A string constant, a plain template, and a `const` bound to an interpolated template still report.
    - Branches: `valid.unknown-fn-argument`, plus the revised `invalid.span-name-bindings` (string constant and template).
  - **Negative controls:** each mutation was reverted afterward, and checksums of all changed TypeScript files confirmed the restore.
    - Ignoring spreads failed 2 cases.
    - Skipping an invoked generator's defaults failed 2.
    - Visiting instance fields failed 2, and deferring static fields too failed 2.
    - Skipping the sync callback's defaults failed 2.
    - Reverting to "any non-function is a span name" failed 5.
- **Third review:** no must-fix issues remained. One consistency fix and one declined note.
  - **Curried `Atom.set` in `no-effect-all-step-sequencing`:** `hasSequentialStep` now counts `Atom.set` only through the shared `boundAtomEffectMember(...) === 'set'` check, so the one-argument curried form is not a state-changing step. `Effect.all([Effect.succeed(Atom.set(1))], { concurrency: 1 })` is valid in RuleTester and in replay (branch `valid.curried-atom-set-step`). The two-argument invalid controls are unchanged.
  - **Declined: skip parameter defaults when an argument is supplied.** A default runs only when its argument is `undefined`, so `(function* (v = console.log('now')) {})(value)` evaluates no default. MP judged tracking that over-precise: the rule reports a default whenever the function is invoked, and the case of passing an argument to an invoked inline function with an eager default is rare. Behavior is unchanged.
- **Refactor (behavior-preserving):** `utils/ast.ts` gains a private `childNodes` helper that both `walkDescendants` and `visitSelfAndDescendantsWhere` use, replacing `walkNodeFieldValue`. Each walker keeps its own root, predicate, and recursion, and the execution rules stay in `effect-context.ts`. `hasSpreadArgument` moved from `effect-composition.ts` to `utils/ast.ts` and now serves `hasEagerEffectAsValue` and `boundAtomEffectMember`; the overload tables and the `effectCounts === 'any'` short-circuit are unchanged. With all 42 active custom rules at `error`, the sorted t3code (7,077) and executor (3,445) diagnostics are identical before and after, by rule, file, position, and message. Every check in the list below passes: `test` has 980 tests in 27 files, and `fixture:replay` has 42 suites and 435 cases.
- **Files touched outside the WI-05 key-file list:** `utils/ast.ts` and `utils/imports.ts` and their tests (`imports.test.ts` for the stack gate), `utils/effect-context.ts`, `utils/effect-ownership.ts`, and the new `rule-messages.test.ts`. All are helpers or tests for the listed rules. `scripts/checks/check-rule-inventory.ts` gains the retired-fixture register, as directed for the v3 gate removal.
- **Checks (each run separately at the uncommitted WI-05 tree):**
  - `durable:refs`, `effect-policy:check`, `build`, `versions:check`, `typecheck`, `check-release-workflow`, `changesets:check`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0, with 0 warnings and 0 errors. `vp fmt --check`: clean.
  - `test`: exit 0, with 980 passing tests in 27 files.
  - `SKIP_BUILD=true inventory:rules`: exit 0 (50 source rules represented, 23 linteffect rules implemented, 27 dropped).
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 42 suites and 435 cases.
  - `SKIP_BUILD=true smoke:oxlint-packed-consumer`, `smoke:tsconfig-packed-consumer`, `pack:dry-run:no-build`: exit 0.
  - `prose`: exit 0 after wording fixes in this section.
  - `introspection:check`: exit 1 with the same `config.schema_violation` as the intake baseline.
- **Commits:** none. The orchestrator commits.

### WI-06: Activate the full Effect config and both package surfaces (DONE)

- **Build:**
  - **Manifest:** the 13 `lsp/*` rows are replaced by one generated row per pinned rule, 113 in all, built from `tsgoPolicyRows`. Each row has domain `tsgo`, disposition `tsgo-delegated`, source ownership `@effect/tsgo`, gating `type-aware`, and collection `effectTsgoConfig`. Each is `delegated`/`not-applicable`/`delegated`, and its note is the policy reason plus the upstream category. `missing-effect-service-dependency` returns as an `off` row. `importFromBarrel` is gone. `lspOwnedChecks` is replaced by `tsgoOwnedChecks`, which lists the fully qualified IDs, with no alias. `effectVersionSensitivity` is removed from the interface, every helper, and all 84 occurrences. `manifestCollectionsForConfiguredFragment('effectPreset')` now returns `effectPreset` and `effectTsgoConfig`.
  - **Delegated fragment (`configs/effect-tsgo.ts`):** `effectTsgoConfig` sets `plugins: ['effecttsgo']`, `options.typeAware: true`, and all 113 severities read from the manifest rows. It also carries one test-file override that turns `strict-effect-provide` off. The one type bridge is the `isPatchedEngineConfig` type predicate. It checks the plugin literal, a type-aware-only options object, the exact 113-rule set with valid severities, and every override's shape. It then narrows to `EffectTsgoConfig`, which is `OxlintConfig` joined with the narrow fragment type. The code uses no `any` and no module augmentation, and nothing is widened globally.
  - **`effectPreset`:** the export is now the full config. `composeLintConfigs` composes the custom rules, `no-shadow` and `require-yield` off, and `effectTsgoConfig`. It is typed as the new `EffectPresetConfig`: `OxlintConfig` with required `jsPlugins`, `plugins`, `options`, `rules`, and `overrides`. `effectReactPreset`, `generalPreset`, and `boundariesPreset` keep `PresetConfig`. `presetRulesForDomain` now returns severities only, and it throws if a delegated row ever reaches a preset.
  - **`effectBoundaryRules` (`configs/effect-boundaries.ts`):** a frozen rules object with 18 `off` entries. The 8 package rules are prefixed. The 10 delegated IDs come from the generated `tsgoBoundaryRuleIds`. It holds no `*-in-effect` rule, no `strict-effect-provide`, and no `no-console`.
  - **Root exports:** added `effectTsgoConfig`, `effectBoundaryRules`, `tsgoOwnedChecks`, `EffectPresetConfig`, `EffectTsgoConfig`, and `TsgoRuleId`. Removed `lspOwnedChecks`.
  - **Gates (`src/effect-policy.ts`, internal):** `assertReplacementFloors(manifest, fragment)` checks each dropped row's `replacedBy` edges against the fragment's global severity. It normalizes tuple, numeric, and `deny`/`allow` spellings. An override may lower a replacement target only through the documented exception: `strict-effect-provide` off, on exactly the generated test-file patterns. That exception must also be present. The function returns the checked edges and throws with every broken one. `validateShippedOwnership(registry, manifest, fragment)` extends the WI-04 registry check to the shipped fragment. Every reporter and owner must be enabled in the fragment, and no owner may ship quieter than its reporter.
  - **Packages:** both packages declare an optional `@effect/tsgo` 0.45.0 peer. The oxlint peer stays `^1.58.0`. The tsconfig package now ships and exports `effect.json` and `effect-tsc.json`, and ships a new `README.md`. `pnpm-lock.yaml` records the two new peer specifiers, and `pnpm install --frozen-lockfile --offline` exits 0.
- **Decision: the tsc-route test-file override lives in the consumer's tsconfig.**
  - **What ships:** `effect-tsc.json` has no `overrides`. The generator's new `tscTestOverrideEntry` projection builds the consumer entry: `{ "name": "@effect/language-service", "overrides": [...] }`, with the policy's 35 test patterns turning `strictEffectProvide` off. The tsconfig README documents it. A unit test holds the README snippet equal to the projection. The tsc smoke writes that README snippet verbatim as its consumer tsconfig.
  - **Why:** tsgo 0.45.0 rebases an extended config's override globs onto that config's own folder (`internal/effectconfigraw/hooks.go`, `rewriteSpecs`). Only rooted paths and `${configDir}` are left alone, and the matcher does not substitute `${configDir}`. Globs shipped inside the installed overlay can only ever match files under `node_modules/@mplibunao/tsconfig/`.
  - **Probe evidence:** run on TypeScript `7.0.2+effect-tsgo.0.45.0` in an isolated consumer built by the WI-02 harness from a packed tarball. Each probe used one production file with a `Layer` provide, the same provide in five test-scoped files, and a top-level `Date.now()`.
    - Overlay-only: all six provide files reported `strictEffectProvide` at error. This reconfirms the WI-02 blocker.
    - Consumer entry carrying only the override: only the production file reported. `globalDate` stayed a warning, so the overlay severities still applied.
    - Monorepo: `packages/app/tsconfig.json` extends a root `tsconfig.effect.json` that holds the entry. Only the production file reported.
    - Rooted `/**/…` patterns inside the overlay: worked in an ordinary folder. They were rejected because in a project under `tests/app/` the production `prod.ts` silently lost `strictEffectProvide`, since `/**/tests/**/*` matches folders above the project root. Upward `../` globs were rejected without a run: pnpm resolves the overlay's real path inside `node_modules/.pnpm/…`, so their depth depends on the install layout.
    - A consumer `plugins` array with only an unrelated plugin still kept the overlay's Effect settings.
- **Finding: the patched oxlint route applies upstream-default Effect options whenever the tsconfig it discovers uses `extends`.** The orchestrator reproduced it independently: an inline plugin entry reports all three shapes, while no plugin entry, `extends` with the entry in the base, and `extends` with the entry in the leaf each report only `addThree`.
  - **Mechanism:** `effect-fn-opportunity` reports a wrapper only when an enabled `effectFn` fix variant applies to it: `firstAvailableFixName` returns `""`, and the rule skips the match (`internal/rules/effect_fn_opportunity.go`). Upstream's default `['span']` covers only the `Effect.withSpan` form. The README's "controls which quickfix variants are offered" wording understates this.
  - **Discovery:** tsgolint reads the Effect options from the `tsconfig.json` nearest each linted file and ignores `--tsconfig` for them.
  - **Evidence:** the orchestrator's probe project (`effect` rc.117, TypeScript 7.0.2, vite-plus 0.3.2) was copied and run with its own patched oxlint on the three wrapper shapes, enabling only `effecttsgo/effect-fn-opportunity`.
    - Unchanged copy with `--tsconfig src/fnopt/tsconfig.default.json`: all three report. The adjacent `src/fnopt/tsconfig.json`, which holds all three `effectFn` variants, was the config actually used.
    - With that file moved away: only the `Effect.withSpan` form reports, whether `--tsconfig` names the default config or the `effectFn` config.
    - A `tsconfig.json` with no `extends`: no plugin entry reports only the `Effect.withSpan` form. `effectFn: ["no-span"]` reports all three, and so do the three shipped variants.
    - Adding any `extends` reverts to the default. Extending a plain base with the plugin entry in the leaf, extending a plugin-only file, extending the shipped `effect.json`, and extending an array ending in `effect.json` each report only the `Effect.withSpan` form.
  - **Not versions or types:** a 2×2 of TypeScript 6.0.2 or 7.0.2 with `effect` rc.115 or rc.117 gave only the `Effect.withSpan` form each time, using a root `tsconfig.json` with no plugin entry. In the harness consumer, `tsc` reported `Type 'Effect<string, never, never>' is not assignable to type 'number'`, so Effect types resolve. The orchestrator's oxlint binary and the matrix binary gave identical results on each project.
  - **Likely cause (tagged source):** the patched `tsc` binary imports `etscheckerhooks`, which registers the merge hook that carries Effect options across `extends` (`internal/effectconfigraw/hooks.go`). `_patches/tsgolint/001-effect-rules.patch` does not import it, and the generated rules read `ctx.Program.Options().Effect` (`_tools/repoctl/src/codegen.ts`).
  - **Impact:** the documented setup extends `effect.json`, so on the default route plain `(...) => Effect.gen(...)` wrappers do not report `effect-fn-opportunity`. Those are the shapes the dropped `prefer-effect-fn` caught. The floor gate passes, because the gap is in which shapes the rule sees, not in its severity. On this route severity is not a tsconfig observable: WI-02 showed oxlint owns every severity. `effectFn` is the overlay setting the route actually depends on.
- **For WI-07, outside-program files (re-checked; still holds, independent of the cause):** in a plain consumer whose root `tsconfig.json` has `include: ["src"]`, `oxlint -c date.oxlintrc.json --format json outside.ts src/inside.ts` reported `outside.ts effecttsgo(global-date) warning` beside `src/inside.ts`. The result was the same with `--tsconfig tsconfig.json`. With no `tsconfig.json` at all, both files still reported. The plan's G6 "Program coverage" row expects no `effecttsgo` diagnostics there. The tsconfig README makes no claim about files outside the program.
- **For WI-07, plugin-array premise contradicted by evidence (re-checked on the tsc route, where the merge hook exists; still holds):** §3.5 says consumers adding other plugins must retain the complete Effect entry. On the patched `tsc` 7.0.2, a tsconfig extending `base.json` and `effect-tsc.json` with `plugins: [{ "name": "unrelated-typescript-plugin" }]` still reported `error TS377032` (`strictEffectProvide`) on a `Layer` provide. Without the overlay it reported nothing, since the upstream default is off. The tsc smoke asserts this. The WI-07 G6 "plugin-array replacement control" row rests on the contradicted premise.
- **Decision: restore `prefer-effect-fn` as an active overlapping rule (orchestrator call; MP confirmed it on 2026-09-26).** The drop assumed `effecttsgo/effect-fn-opportunity` covers the same wrappers on the default route. Under the shipped setup it does not. ADR-007 allows an AST overlap that fires without a TypeScript project.
  - **Alternative, accept the gap:** keep the rule dropped, and plain wrappers go unreported on the default route until upstream keeps the options through `extends`.
  - **Alternative, hold the landing group:** keep WI-03 to WI-07 unmerged until upstream ships that fix.
  - **Rule:** restored from `ec4f4f8^` onto current helpers. `isNamedEffectGenWrapper` requires a named function, either a declaration or a function initializing a variable, whose return node is a bound `Effect.gen` call. It uses `functionReturnNode` and `boundNamespaceCallMember`, so aliases, shadowing, type-only imports, and local look-alikes behave like the other catalog rules. `utils/reports.ts` stays deleted. The message is `Rule/Why/Fix/Ref` pointing at `Effect.fn` and `Effect.fnUntraced`, both exported by v4 `Effect.ts`, and it cites ADR-001's named-wrapper guidance.
  - **Manifest:** the row is active again as `reimplemented` at its pre-drop `error` severity. It is in `effectPreset` and has no `replacedBy`. Its note records the overlap; `effect-fn-opportunity` stays on at its generated `error`.
  - **Contracts:** the decided drop register loses the row, leaving 29 drops, with 27 of linteffect origin as before. The floor set has ten edges, and the floor tests now use `no-effect-do` for the lowered and unknown-target cases.
  - **Ownership registry:** unchanged. The old ownership split was with the dropped `no-effect-wrapper-alias`, and no active rule suppresses these wrappers or defers to `prefer-effect-fn`.
  - **Duplicates, by evidence:** the rule does not report the `.pipe(Effect.withSpan(...))` wrapper. That is a RuleTester valid case and a replay branch, and the oxlint smoke shows it: under the shipped setup each wrapper gets exactly one diagnostic. Where tsgo does receive the options (a `tsconfig.json` with no `extends`), the two plain wrappers get both diagnostics. That overlap is allowed and has no special-casing.
  - **Smoke:** `smoke-effect-packed-consumer.ts` keeps the inline-options control, where `effect-fn-opportunity` reports all three shapes. Under the shipped setup it then asserts the exact per-file split: `prefer-effect-fn` alone on the declaration and parameter wrappers, and `effect-fn-opportunity` alone on the `Effect.withSpan` wrapper. Any other split fails with the `extends` explanation and a pointer to BP-TD-014, so the day upstream fixes it the smoke says to drop the rule again.
  - **Deferral:** `docs/records/tech-debt/open/bp-td-014.md`, "Drop prefer-effect-fn again when tsgo's oxlint route keeps Effect options through extends", with the evidence and the three-shape reproduction. `introspection record create` stops on the same `config.schema_violation` as `introspection check`. The ID was allocated per plan §3.10: the highest existing record is BP-TD-013, and nothing references BP-TD-014.
  - **Plan and record edits:**
    - The build plan's drop table loses the row, and the count reads 26. A paragraph after the table records the overlap and the decision.
    - Every eleven-edge statement reads ten (§3.3, G4, WI-06).
    - The G6 fn-option row now covers the tsc route and states the oxlint split.
    - The appendix line on option reading is limited to a discovered `tsconfig.json` with no `extends`.
    - The alignment record's `prefer-effect-fn` bullet gains a dated note. Current-state docs already list `prefer-effect-fn` as a live rule.
- **Judgment calls:**
  - **Peer spelling:** exact `0.45.0` instead of `catalog:`. The smokes pack with `npm pack`, which would leave `catalog:` in the tarball. The artifact assertions require the peer to equal the catalog pin, so the version still has one source.
  - **Gate home:** `src/effect-policy.ts` holds `assertReplacementFloors` and `validateShippedOwnership`. They are internal and absent from the package root, and `dist` tree-shakes them. The file pairs with the planned `src/effect-policy.test.ts`.
  - **Fragment-shape tests:** they live in `src/configs/effect.test.ts`, the planned file. The drift-guard assertion that ordinary compositions gain no `effecttsgo` plugin, option, or rule lives there too, and `drift-guards.test.ts` is unchanged. Collection accounting for the full preset is a unit test there. The inventory's per-config loop still covers only the base, vitest, and node fragments.
  - **Quiet-critical exception:** the inventory holds exactly `effecttsgo/duplicate-package`. It fails both on any other quiet correctness row and on a listed exception that no longer matches a row.
  - **Pinned-count check:** the inventory reads the retained snapshot through `readRetainedTsgoSnapshot`. It requires the delegated row count and names to equal the pinned rules.
  - **Route smoke commands:** the two new smokes run as `bun scripts/packages/oxlint-standards/smoke-effect-packed-consumer.ts` and `bun scripts/packages/tsconfig/smoke-effect-packed-consumer.ts`. Root script names and `check:effect-integration` land in WI-07 with the gate wiring.
  - **tsconfig README scope:** the README documents composition and both routes. It also gives the tested matrix, the patch step, the consumer override entry, and how plugin entries merge. The lint package README (WI-09) still describes the old AST-only `effectPreset`, the language-service setup, and a preset-scoping recipe that drops the plugin and `typeAware`.
- **Files touched outside the WI-06 key-file list:**
  - `rule-catalog.ts`, `rule-catalog.test.ts`, `rule-messages.ts`, and `scripts/checks/fixture-replay.ts`: the restored rule, its tests, message, and replay suite.
  - The build plan, the alignment record, and `docs/records/tech-debt/open/bp-td-014.md`: the decision and its deferral.
  - `scripts/lib/effect-policy.ts` and its test: the generator projection change the tsc decision needs.
  - `scripts/checks/check-rule-inventory.ts`: the LSP assertion and vocabulary this item removes.
  - `scripts/lib/package-artifact-assertions.ts`: the shared optional-peer assertion.
  - `scripts/packages/tsconfig/readme-snippets.ts`: README snippet reader shared by the test and the smoke.
  - `pnpm-lock.yaml`: the two new peer specifiers.
- **Stale reference for WI-11 (not changed here):** the `nativeRule` doc comment in `rule-manifest.ts` still says a work item owns the generated effective-config view. The §4 manifest row points it at the rules page.
- **Negative controls:** each mutation failed its target and was restored by checksum.
  - Dropping the global floor check failed the lowered-severity test. Dropping the override check failed the undocumented-override test. Dropping the exception check failed the widened-scope test.
  - Dropping the shipped-fragment half of `validateShippedOwnership` failed the no-manifest-row owner test.
  - Dropping the adapter's completeness check failed the "rejects a missing rule" test. Composing `effectPreset` without `effectTsgoConfig` failed at import with the "lost its options" error.
  - An empty quiet-critical list failed `inventory:rules` on `duplicate-package`, and a stale extra entry failed its exact-match check.
  - Removing `**/*.test.ts` from the README snippet failed the README drift test.
  - The fragment's own negative tests reject a missing or unknown rule, a misspelled severity, another plugin, an extra option, `typeAware: false`, an override without files, and an override outside the `effecttsgo` namespace. The floor tests reject a lowered, missing, or unknown replacement, an undocumented override, a widened exception, and a missing exception. The owner tests reject a nonexistent, dropped, quieted, or disabled owner.
  - Restore mutations: matching `fn` instead of `gen` failed the RuleTester invalid cases. Dropping the named-function check failed the valid cases. Limiting the rule to function declarations failed replay with "recon scenario: redundant Effect.gen wrapper function unexpectedly passed".
  - Simulating the upstream fix, with a root tsconfig that sets the options inline without `extends`, failed the oxlint smoke. It reported `src/wrappers/declaration.ts reported [@mplibunao/oxlint-standards(prefer-effect-fn), effecttsgo(effect-fn-opportunity)]` with the BP-TD-014 pointer.
- **Checks (each run separately at the uncommitted WI-06 tree):**
  - `durable:refs`, `effect-policy:check`, `build`, `versions:check`, `typecheck`, `check-release-workflow`, `changesets:check`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0, with 0 warnings and 0 errors. `vp fmt --check`: clean.
  - `test`: exit 0, with 1038 passing tests in 29 files.
  - `SKIP_BUILD=true inventory:rules`: exit 0, printing `parity {"source-fixture-replay":2,"semantic-scenario-replay":41,"delegated":113,"not-applicable":164}`.
  - `SKIP_BUILD=true fixture:replay`: exit 0, with 43 suites and 444 cases.
  - `SKIP_BUILD=true smoke:oxlint-packed-consumer`: exit 0. It now also checks the new exports and types, the absence of LSP rows, the absence of `@effect/tsgo` in the type consumer, and the unpatched full-preset control on oxlint 1.58, which fails with `Unknown plugin: 'effecttsgo'`.
  - `smoke:tsconfig-packed-consumer`, `oxlint:package:allowlist`, `tsconfig:package:allowlist`, and `pack:dry-run:no-build`: exit 0. The tsconfig package packs 10 files.
  - `bun scripts/packages/tsconfig/smoke-effect-packed-consumer.ts`: exit 0. It covers these cases:
    - Unpatched `tsc`: silent, with a plain version string.
    - The patch twice, then the `+effect-tsgo.0.45.0` version.
    - The README project reports the production error and all three wrapper forms. Test scopes stay exempt, and the overlay severities and Bun types survive.
    - A warning-only project fails; a clean browser project passes.
    - Controls for overlay-only, other plugins, and the shared monorepo config.
  - `bun scripts/packages/oxlint-standards/smoke-effect-packed-consumer.ts`: exit 0. The inline-options control reported all three forms, and the shipped setup reported the exact split above. The earlier steps also passed:
    - Both tarballs installed.
    - Unsupported oxlint 1.83.0: the patch is rejected and linting fails on the unknown plugin.
    - Unpatched supported oxlint: fails on the unknown plugin.
    - The patch twice.
    - Exit 1, with `strict-effect-provide` and custom `no-effect-escape-hatch` both at error in one run.
    - `global-date` at warning, and five test scopes exempt.
    - The boundary path drops `global-date` but keeps `global-date-in-effect` at error.
    - A warning-only file exits 0, and 1 with `--max-warnings 0`.
  - `prose`: exit 0 after two README wording fixes.
  - `introspection:check`: exit 1 with the same `config.schema_violation` as the intake baseline.
- **Review iteration 1 (orchestrator): five findings, all fixed.** Each fix has a negative control, restored by checksum.
  - **Typed canary proved nothing typed.** File counts plus any `effecttsgo` diagnostic can pass without types, because `global-date` reports even on a file whose `effect` import does not resolve.
    - **Probe (patched oxlint 1.82.0):** `strict-effect-provide` reported in the program, on an outside-program file with `effect` installed, and on a canary linked to the installed `effect`. It stayed silent on an unresolved import and on an unlinked canary.
    - **Fix:** the typed canary is now that type-resolved diagnostic on an audit-owned file (see G2). A new smoke probe pins the premise on the supported engine: the canary source reports with `effect` resolved and stays silent with it unresolved.
    - **Negative control:** the scratch app's installed `effect` is a type-less stub. A typed audit of it exited 1 and reported that the typed canary did not report `effecttsgo(strict-effect-provide)`, so the typed pass is not evidence. Ignoring the canary failed the unit test.
  - **Unknown codes were accepted.** Every diagnostic code must now belong to the custom rules the run enables, the pinned tsgo catalog, or the running engine's native catalog. `OxlintRuleItem` gained its bare `value` for that. A codeless diagnostic, which is how oxlint prints a parse error, fails the run as an engine error.
    - **Negative tests:** `effecttsgo(no-such-rule)` and a dropped custom code are rejected. A valid `effecttsgo(global-date)` beside a codeless `Unexpected token` fails. Making the check accept everything failed those tests.
  - **The AST route had no interrupt handling.** `withInterruptScope` now holds the harness's interrupt handling; `withEffectConsumer` and the AST route both use it. The scope clears its marker on exit.
    - **Test:** a child writes its grandchild's pid to a file; the test waits for the file, emits `SIGINT`, and requires the result to be incomplete ("interrupted"), the group gone, and exit code 130. Removing the handler install failed it by timeout.
  - **An empty case kept its ID.** The corpus test now requires each case's exact variant roles. A raw variant with a barrel-import deviation also needs an adapted copy. In-test negatives cover an emptied case and a case that lost its adapted copy. Setting `variants: []` in `corpus.json` failed the gate.
  - **The `diagnostics: false` probe went through `extends`, which the engine ignores.** A new control inlines the installed plugin entry, with `diagnostics: false`, in a tsconfig without `extends`. It requires `strict-effect-provide` at error and exit 1. With a clean file substituted, the smoke failed: "effecttsgo(strict-effect-provide) was absent and oxlint exited 0".
  - **Found while fixing:** run from the app root, the patched oxlint looked for `tsgolint` in the app and stopped because it could not find the `tsgolint` executable. The audit treated that as a startup failure. `runBounded` now takes an options object with an extra environment, and the typed audit sets `OXLINT_TSGOLINT_PATH`.
  - **Found while fixing:** the file-count canary caught a selection bug. The patched engine resolves config `ignorePatterns` against the temp config's folder, so it linted excluded files (5 where 3 were expected). Exclusions now go through `--ignore-pattern`, which resolves against the app root, and the counts match.
  - **Re-run after the fixes:** the check chain without `introspection check` exited 0. It ran 2468 tests in 34 files, and lint and prose reported nothing. `pnpm check:effect-integration` exited 0.
- **Review iteration 2 (orchestrator): three findings, all fixed.** Each fix has a negative control, restored by checksum.
  - **The typed audit never proved app-project coverage.** oxlint lints every selected file whatever the tsconfig includes, and the separate canary still passed.
    - **Probe:** `--listFilesOnly` works on the pinned TypeScript 7.0.2 and on the audit consumer's 6.0.2. Both list only the included file of a project with an `exclude`. The audit uses the consumer's 6.0.2, because the audit consumer is the oxlint route and has no TypeScript 7.
    - **Fix:** a non-zero `tsc` exit stops the run with TypeScript's output. A selected file missing from the list marks the evidence unusable and names the file.
    - **Scratch app:** it links a harness consumer's real `effect` rc.115. With a tsconfig that includes `src`, the typed audit exited 0. With `exclude: ["src"]`, it exited 1 on TypeScript's own TS18003 (no inputs found). With `exclude: ["src/generated"]`, it exited 1: "tsconfig.excludes-generated.json does not include 1 selected files … (first: src/generated/extra.ts)". With the coverage check disabled, that last case exited 0.
    - **For the app measurement item:** a solution-style tsconfig with only `references` lists no files, so the audit refuses it. Name each app's leaf project with `--tsconfig`. Selected `.js` files need `allowJs` in that project or an `--exclude`.
  - **Any plugin prefix passed native validation.** Native codes are now exact pairs, built from `oxlint --rules` as the scope's diagnostic prefix plus the rule: `eslint(no-debugger)`, `eslint-plugin-jsx-a11y(alt-text)`. `OxlintRuleItem` gained its `scope`.
    - **Evidence for the prefix table:** the prefixes come from the oxlint binary's strings, and a lint probe confirmed them. Core rules report as `eslint(<rule>)`; no unprefixed codes appeared. Root 1.58 has 15 scopes; the patched 1.82 adds only `effecttsgo`.
    - **Fail loud:** a scope missing from the table stops the audit and names it.
    - **Negative tests:** `bogus(no-debugger)`, `eslint-plugin-jsx-a11y(no-debugger)`, and a bare `no-debugger` are rejected. A lookup by rule name alone failed the test.
  - **A check script reduced to two steps passed the contract.** `requiredCheckCommands` lists all 18 current steps by name. Each has a removal test that fails with that step named, and a two-step reduction fails too. Disabling the presence check failed all 18 removal tests.
  - **Re-run after the fixes:** the check chain without `introspection check` exited 0. It ran 2491 tests, and lint and prose reported nothing. `pnpm check:effect-integration` exited 0.
- **Review gate:** the agent's own oracle review did not run. RepoPrompt `manage_selection` mutations and `ask_oracle` were cancelled, as in WI-02. The orchestrator owns review.
- **Commits:** none. The orchestrator commits.
- **Action item for MP:** confirm or reverse the orchestrator's restore of `prefer-effect-fn`. The alternatives are recorded under the decision above.

### WI-11: Rule list with its generated page and local viewer (DONE)

- **Build:**
  - **Collector (`scripts/lib/rules-collector.ts`):** `buildRuleList(inputs)` is pure over its inputs. `collectRules()` does the I/O: it imports the built package with shape guards, reads the retained tsgo snapshot, and runs root oxlint. Package rows come from `ruleManifest` (ported or reimplemented, implemented, in at least one collection), tsgo rows from `tsgoPolicyRows` plus the snapshot, and built-in rows from `oxlint --print-config` on `baseConfig` and on `baseConfig + vitestConfig + nodeRuntimeConfig` only. Presets add built-in rows only through the rules they set explicitly. Print-config `deny`/`warn`/`allow` normalize to `error`/`warn`/`off`, and a rule is listed only when some target has it on for normal or test files. Dropped rows and the five tsgo rules set off everywhere are excluded.
  - **Wire types (`scripts/lib/rule-list.ts`):** an import-free module holding the list shape. The viewer's page script imports it too.
  - **Renderer (`scripts/lib/rules-markdown.ts`) and generator (`scripts/checks/generate-rules-page.ts`):** `pnpm gen:rules-page` writes `docs/references/rules.md`; `pnpm rules-page:check` renders in memory and fails when the committed page differs. The page has a fixed header with the regenerate command and the tsgo attribution, then one table per source.
  - **Viewer (`packages/rules-viewer`):** `"private": true`, no `version`, no scripts. `src/server.ts` builds the package through `buildOxlintStandards()`, so `SKIP_BUILD` applies. It collects the list once at startup. Its two routes are `/`, where Bun bundles `index.html` with `src/page.ts`, and `/rules.json`, served from memory. It listens on `127.0.0.1` at port 4178 unless `RULES_VIEWER_PORT` says otherwise. The page is plain DOM with `textContent` only. It has a search box, filters for source, preset or config, and severity, a normal/tests severity grid per target, and a collapsed tsgo example with the reported spans highlighted. `bun-types` 1.3.11 (published 2026-03-18, matching the Bun pin) joins the catalog. Both viewer tsconfigs are in the root `references`.
  - **Smoke (`scripts/packages/rules-viewer/smoke.ts`):** the server starts on port 0 and prints its URL. The smoke then requires `/rules.json` to hold rows from all three sources, and requires `/` and its bundled script to respond. The server is killed in `finally`.
  - **Removed:** `docs/references/effective-config.json`, `docs/references/effective-config.md`, `scripts/checks/generate-effective-config.ts`, the artifact types and generator in `scripts/lib/effective-config.ts`, the inventory staleness gate, the `gen:effective-config` script, and the `vite.config.ts` format-ignore entry. `effective-config.ts` gained `readOxlintRuleItems` (705 items on 1.58.0) and exports `flattenTestOverridesIntoGlobal`; `buildOxlintRuleCatalog` keeps its signature and derives its set from the items.
  - **Wiring:** `pnpm check` runs `SKIP_BUILD=true pnpm rules-page:check` and `SKIP_BUILD=true pnpm smoke:rules-viewer` after `inventory:rules`. `pnpm rules:view` is `bun packages/rules-viewer/src/server.ts`.
  - **Docs:** `.vale.ini` has an empty `BasedOnStyles` section for `docs/references/rules.md`, and `prose-gate.md` records the exemption. The package README links the rules page and `pnpm rules:view`, and it takes the still-true parts of the old page: the fuller Effect v4 target, the `generalPreset` rule list, and the executor/t3code/effect-smol and Rika attribution lines. ADR-007 no longer calls the viewer planned. The `nativeRule` comment in `rule-manifest.ts` points at the rules page.
- **Page contents at this tree:** 43 package rows, 108 tsgo rows, and 253 built-in rows. The built-in names and every normal and test severity match the deleted artifact at `HEAD` exactly (an independent script over `git show HEAD:docs/references/effective-config.json`).
- **Judgment calls:**
  - **Renderer file:** `renderRulesMarkdown` lives in `rules-markdown.ts` beside the collector, not inside `rules-collector.ts`, to stay under the 500-line lint ceiling.
  - **Snapshot input:** the collector reads the snapshot through `readRetainedTsgoSnapshot`, which validates the schema and the license hash, instead of adding `metadata.json` to the scripts tsconfig `include`.
  - **Targets:** the four presets, `effectTsgoConfig`, `baseConfig`, and the base, Vitest, and Node runtime composition. `vitestConfig`, `nodeRuntimeConfig`, `unicornConfig`, and `jsdocConfig` appear through the two compositions; printing any of them alone would credit oxlint's default rules to it.
  - **Package test severity:** the manifest gives the normal severity; the test severity comes from the target config's test-file override. That is how `no-double-cast` shows `error / off` in `baseConfig`.
  - **Stale-build guard:** the collector fails when a built preset or config sets a package or tsgo rule differently from the manifest and policy, for normal files or for test files. Under `SKIP_BUILD=true`, a stale `dist` fails `rules-page:check` with the differing settings named; test-file differences carry a `tests` label.
  - **Explicit offs:** when a rule is on elsewhere, a target's explicit `off` still appears as an activation. `no-shadow` in `effectPreset` is the example.
  - **Built-in descriptions:** a built-in row shows its manifest note when the manifest has a native row for it, and otherwise its oxlint category.
  - **Message access:** `rule-messages.ts` gained an internal `ruleMessageTemplate` so the collector reads the unfilled Fix and Ref text; `ruleMessage` now calls it. The package root does not export it.
  - **Deferred to its consumer:** the explicit cwd for `materializeEffectiveRules` belongs to the G3b comparison. The collector uses the defaults, so it is not added here.
  - **Viewer tsconfigs:** both set `lib` to ES2023 (the scripts use `toSorted`, which `server.json`'s ES2022 lacks) and `rootDir` to the repo root. The server project lists the collector's transitive `scripts/lib` imports, including `stable-json.ts`.
  - **Unchanged:** the `drift-guards.test.ts` comment still names a function that exists in `scripts/lib/effective-config.ts`, so it stays as is. The router pointer to the rules page and the README's stale counts and language-service section stay with the consumer-docs item, per §4.
- **Visual check (surf):** the global `surf` link points at a missing `native/cli.cjs`, so the built CLI in the surf-cli checkout ran directly against the extension socket in an isolated window. Screenshots are in the session scratchpad `wi11-shots/`, and every one was viewed.
  - **Desktop at 1440 wide:** rows from all three sources are readable. Typing `provide` with real key events leaves 4 tsgo rows, and `strict-effect-provide` shows `error / off`.
  - **Source filter:** `oxlint` 253, `tsgo` 108, `package` 43, each with only that source's badge.
  - **Preset and severity filters:** `effectReactPreset` leaves its 3 rules. `effectPreset` leaves 145 (35 package, 108 tsgo, and the `no-shadow` and `require-yield` carve-outs). `effectPreset` with `off` leaves exactly `strict-effect-provide`, `no-shadow`, and `require-yield`. `warn` alone leaves 68 (3 package, 64 tsgo, and the one built-in warning).
  - **tsgo example:** the `layer-merge-all-with-dependencies` block shows the source with `A.Default` highlighted and the diagnostic text below it.
  - **Phone (iPhone 14, 390 wide):** rows stack as cards. Search `date` with source `tsgo` leaves 3 rows, the `global-date` example shows `Date.now()` highlighted, and the full composition with `warn` leaves `unicorn/prefer-set-has`. Under touch emulation, surf's key events did not reach the input, so the phone search used surf's JS input method; real typing was verified on desktop.
  - **Fixed after review, then re-shot:**
    - Opening an example widened the description column and broke `effectTsgoConfig` mid-word. The table now uses a fixed layout, target names wrap at word boundaries, and the code block scrolls.
    - Choosing a source through surf's `select` did not change the rows, because that path fires only `change`. The page now re-renders on `change` as well as `input`.
    - On the phone, the search box and the preset select ran past the right edge, because the long composition option set the select's minimum width. Zero-minimum grid tracks and full-width controls fixed it; measured page width equals the 390-pixel viewport.
    - The preset placeholder is now `All presets`, since the longer label truncated on the phone.
  - **Final wide-window shot:** at 2260 pixels the content sits centered at its 1280-pixel maximum. Nothing regressed.
- **Negative controls (each restored by checksum):**
  - Hand-editing one severity in the committed `rules.md` failed `rules-page:check` with the stale message.
  - Changing the `no-arrow-ladder` manifest severity without rebuilding failed `SKIP_BUILD=true pnpm rules-page:check`, naming `built ...no-arrow-ladder=error, source ...no-arrow-ladder=warn`.
  - In the unit tests, dropping the `<` escape failed the golden render. Dropping the on-somewhere filter failed the source-merge test. Dropping the built-config cross-check failed the stale-preset test. Letting dropped rows through made collection fail on the fixture's missing message. Mapping `deny` to `warn` failed the normalization tests.
  - Two unit tests cover the test-file half of the guard: a built `effectTsgoConfig` with no test-file override, and one whose override sets the rule to `warn` instead of the policy's `off`. Each throws and names `effecttsgo/a-rule`. Removing the test-file comparison failed both and nothing else.
- **Checks (each run separately at the uncommitted tree):**
  - `durable:refs`, `build`, `typecheck`, `versions:check`, `check-release-workflow`, `changesets:check`: exit 0.
  - `/bin/sh -c "pnpm run lint"`: exit 0 with 0 warnings and 0 errors after fixing eight findings in the new code. `vp fmt --check`: exit 0.
  - `test`: exit 0, 1052 tests in 30 files (1054 after the review fix).
  - `SKIP_BUILD=true inventory:rules`: exit 0. `SKIP_BUILD=true fixture:replay`: exit 0, 43 suites and 444 cases.
  - `SKIP_BUILD=true gen:rules-page` then `SKIP_BUILD=true rules-page:check`: exit 0 and exit 0.
  - `SKIP_BUILD=true smoke:rules-viewer`: exit 0, 404 rules served.
  - `SKIP_BUILD=true smoke:oxlint-packed-consumer` and `smoke:tsconfig-packed-consumer`: exit 0. `pnpm -r --if-present pack:dry-run:no-build`: exit 0 (10 and 9 allowed files).
  - `pnpm -r publish --dry-run --no-git-checks`: exit 0. Its only output is the no-new-packages notice, because npm already has both published packages at their current versions. On the viewer: `pnpm --filter rules-viewer publish --dry-run --no-git-checks` publishes nothing, `--report-summary` lists no packages, and `pnpm changeset status` would bump only `@mplibunao/oxlint-standards`.
  - `prose`: exit 0 after one viewer README rewording.
  - `pnpm check`: exit 1 at `introspection check` with the same `config.schema_violation`. Every earlier step passed, including the two new ones.
- **Review gate (orchestrator, iteration 1):** one finding, fixed. The built-config guard compared only normal-file severities, so a build with a missing or changed tsgo test-file override passed while the page printed the policy's test severity. It now compares both scopes.
- **Refactor gate (cycle 1):** one accepted suggestion. `targetScopes` returns the typed record directly, calling `configuredScopes` once per target, instead of filling a partial record and rebuilding it through seven unreachable missing-entry checks. Behavior is unchanged.
- **Checks after the review fix and refactor:** `typecheck`, `test` (1054 tests), `SKIP_BUILD=true pnpm rules-page:check`, `SKIP_BUILD=true pnpm smoke:rules-viewer`, lint, and `vp fmt --check`: exit 0 each.
- **Commits:** none. The orchestrator commits.
- **For later items:**
  - Many package manifest notes describe provenance rather than what the rule catches; `no-arrow-ladder`'s note reads "Scenario-covered structural port with RuleTester coverage and preset assignment." The page and viewer show the note in the column headed `What it catches`, so the consumer-docs item may want to rewrite those notes.
  - Bun serves the bundled page script at `/../../chunk-*.js`, because the page imports from `scripts/lib`. Browsers normalize the path and the smoke fetches it, so it works as is.
- **Action item for MP:** none required. MP's own look at the page (`pnpm rules:view`) gets recorded here when it happens; it does not gate later items.

### WI-07: Install all six durable gates (DONE)

- **Build:**
  - **Gate wiring:** `pnpm check` runs `pnpm effect-policy:check` before `pnpm build`. `check:effect-integration` runs `smoke:effect-oxlint-packed-consumer` then `smoke:effect-tsc-packed-consumer`; the oxlint smoke builds unless `SKIP_BUILD=true`. `release:prepare` ends with `pnpm effect-policy:check` and `SKIP_BUILD=true pnpm check:effect-integration`. `audit:effect-apps` runs the G2 script. `.github/workflows/effect-integration.yml` runs the integration command on `pull_request` and `workflow_dispatch`, with a `github.workflow`/`github.ref` concurrency group, `cancel-in-progress: true`, read-only permissions, and the `ci.yml` setup steps. `versions:check` now covers that workflow.
  - **Gate contract (`scripts/lib/effect-integration-contract.ts`):** `check-release-workflow` also asserts that `check` keeps every current step by name, runs the policy check before the build and never runs `check:effect-integration`, that `check:effect-integration` runs exactly the two route smokes, and the workflow's triggers, concurrency, permissions, install step, and final command.
  - **Router:** one `CLAUDE.md` working rule says to run `pnpm check:effect-integration` once before committing a work item that touched the tsgo fragment, boundary rules, Effect preset, tsconfig Effect overlays, tsgo policy or snapshot, or a supported-matrix pin.
  - **G1 (`test-fixtures/effect-v4/`, `src/reference-corpus.test.ts`):** the corpus holds 20 cases and 40 variants. Each provenance-register row has a case, and `ef-reason-errors` adds the `catchReason` reference.
    - **Metadata:** `corpus.json` records each case's source, its pinned revision (effect `3788b63`, 4.0.0-rc.117; effect-solutions `09f82e6`, effect 4.0.0-beta.59), excerpt line ranges, and intended valid behaviors. It also records each variant's lint filename, harness changes, and deviations. Every deviation names an enabled rule, an exact count, and its owning decision.
    - **Snippets:** raw snippets are verbatim line ranges generated from the pinned checkouts, and a sha256 in `corpus.json` pins them. Adapted copies change only the value barrel imports. The Cause excerpt also gets a house-style positive control.
    - **Library excerpts:** retained library source is provenance only and is not linted as app code. The Atom and Option excerpts also back derived controls, plus misuse variants that must report.
    - **Engines:** the vitest gate runs all 38 enabled Effect and effect-react rules on every linted variant through RuleTester. `fixture:replay` replays the same variants on the real engine with the built plugin (37 variants) and requires exact per-rule counts. The app-entry `orDie` copy relies on a justified inline disable, which RuleTester cannot honor because it renames the rule, so that variant is marked `engine: oxlint` and checked only there.
    - **Hits:** discovery found no unexpected hit. The recorded deviations are the value barrel imports, the line-115 `_tag` comparison, three string failures, the data-first `map(succeed(...))` nesting, the raw app-entry `orDie`, and the CLI's plain `save` wrapper (`prefer-effect-fn`).
  - **G3a:** unchanged checks (`effect-policy:check`, `rules-page:check`, config-shape and policy tests), now all in `pnpm check`.
  - **G3b (`scripts/packages/oxlint-standards/engine-policy.ts`, `effect-route-probes.ts`):** the oxlint smoke prints the patched engine's config for the Effect and Effect+React compositions at a normal, a test, and a boundary path. It normalizes `deny`/`warn`/`allow` and compares every `effecttsgo/*` rule with the generated policy. An absent rule counts as off. An unknown printed rule, a rule the policy sets off that the engine reports on, or any severity difference fails.
    - **Print-config evidence (patched oxlint 1.82.0):** it lists all 113 tsgo rules, 58 native rules, and no custom JS-plugin rules. It does not apply file overrides at the printed path; it lists them separately.
    - **Scopes:** the test and boundary views fold their one override into the global rules first, and fixture lint proves the real file matching.
    - **Boundary path:** §3.8 names it and §3.12 does not. It expects the policy with the ten delegated boundary rules off.
    - **`materializeEffectiveRules`:** it gained an optional `{ cwd, timeoutMs }` context. The temp config goes inside that directory so JS plugins resolve from the consumer, and the subprocess gets a timeout and `SIGKILL`. The subject path may name folders. Offline callers are unchanged.
  - **G4 and G5:** the WI-04 to WI-06 unit gates (`effect-policy.test.ts`, `rule-manifest.test.ts`, `rule-messages.test.ts`) already run in `pnpm test`; the negative controls below re-prove them.
  - **G6, oxlint route, new rows:**
    - `vp lint` and direct oxlint print identical diagnostic sets.
    - Severity ownership: the installed `effect.json` has `diagnostics: false` and no severity map. Three conflicting tsconfig/oxlint probes each follow the oxlint setting (`error`/`off` gives error, `off`/`error` gives nothing, `warn`/`error` gives a warning).
    - `Effect.provideService` does not report `strict-effect-provide`.
    - A later consumer override raises `global-date` to error on its path.
    - Program coverage: a file outside the tsconfig `include` gets custom and `effecttsgo` diagnostics, and a run with no `tsconfig.json` still reports `global-date`.
    - Reinstall: deleting `node_modules` and reinstalling offline from the private store restores the unpatched binary, and patching again works. `pnpm install --force` did not restore it, so the smoke does not rely on it.
  - **G6, tsc route, new rows:**
    - A consumer entry restoring `effectFn: ['span']` reports only the `Effect.withSpan` wrapper, beside the README project's three.
    - `tsc --showConfig` shows the server composition keeping `bun-types`, and the browser composition keeping `react-jsx` and DOM.
    - The consumer has no oxlint binary.
    - The plugins-array control now carries the merge-hook explanation.
  - **G2 (`scripts/checks/effect-app-audit.ts`, `scripts/lib/effect-app-audit.ts`):** `--mode ast|candidate|shipped`, `--app <name>=<path>@<revision>` (repeatable), `--tsconfig <name>=<path>`, `--exclude <prefix>`, `--output`, `--allow-dirty`, and `--timeout-minutes`.
    - **Refusals:** the script stops on a wrong revision or a dirty tree. It also stops when `node_modules/effect` is missing, or when a typed mode has no tsconfig.
    - **Engines:** the AST mode uses root oxlint 1.58 and the built plugin with every implemented custom rule (43). The typed modes install the harness consumer, patch it, and run its oxlint from the app root, with a config outside the app, `--disable-nested-config`, and `--tsconfig`. `OXLINT_TSGOLINT_PATH` points that run at the consumer's patched `tsgolint`. The candidate mode adds `prefer-schema-over-json: warn`.
    - **Canary:** the engine's `number_of_files` must equal the selected count, with at least one rule enabled. A typed pass also lints an audit-owned canary file outside the app, whose `effect` import links to the app's installed package. That file must report `effecttsgo(strict-effect-provide)`, which fires only when Effect types resolve. Before linting, the audit consumer's TypeScript runs `tsc --listFilesOnly -p <app tsconfig>`, and every selected file must appear in that list.
    - **Output:** raw engine output goes to `<output>/raw/`. The summary records the revision and dirty state, the Effect version against tsgo's `^4.0.0-beta.107` range, and the engine version. It also holds the config and plugin sha256, per-rule source/test counts, and span identities for the delegation evaluations.
    - **Nested configs:** on oxlint 1.58, an explicit `--config` already ignores a nested app config (probed).
- **Plan edits:** §3.5 now states that tsgo merges the Effect plugin entry across `extends` on the tsc route. The G6 rows for cross-package environment preservation and program coverage now state the observed behavior.
- **Harness flake (root cause fixed):** under load, the process-group timeout test failed in 7 of 20 runs. Its liveness probe, `process.kill(pid, 0)`, succeeds on a killed process that launchd has not reaped yet. A probe run with CPU load saw that in 5 of 60 runs, and `ps` found each process gone moments later, so the harness kill was correct. The test now reads `ps -o stat=` and counts a zombie as dead. After the fix: 10 of 10 isolated runs and 10 of 10 runs beside a concurrent full suite passed, and every concurrent full suite passed 1074 tests. Killing only the child pid still fails the test.
- **Judgment calls:**
  - **Corpus metadata:** `corpus.json`, not the planned `corpus.ts`. `test-fixtures/**` is outside every tsconfig and lint scope, and the package's composite tsconfig cannot import it. The test validates every field.
  - **Line ranges:** the plan's cited ranges have drifted in the pinned checkouts, and `corpus.json` records the actual ranges.
  - **Imports:** test-file excerpts start with their file's own import lines, so runtime-import gates see real bindings, and they lint under their original test paths.
  - **Corpus scope:** the corpus runs only Effect and effect-react rules. General and boundaries rules keep their existing suites, and no new controls were added there.
  - **Audit exclusions:** vendored and generated exclusions come from the caller, because the recorded run named none. A dirty tree fails unless `--allow-dirty` is passed.
  - **Audit output:** engine output streams into memory through the harness runner, which has no buffer cap. The audit then writes it to raw files.
- **Negative controls (each restored by checksum):**
  - Missing plugin: `effectPreset` with `plugins: []` failed `configs/effect.test.ts`.
  - Missing rule: dropping `global-date` from the fragment failed at import ("effectTsgoConfig must set every pinned @effect/tsgo rule"). Removing `globalDate` from `effect-tsc.json` failed `effect-policy:check`.
  - Missing message: removing the `no-option-as` message failed `rule-messages.test.ts` ("No written message for rule no-option-as").
  - Missing owner: naming the dropped `no-effect-orElse-ladder` as an owner failed `rule-manifest.test.ts` and `effect-policy.test.ts`.
  - Lowered floor: grading `effect-do-notation` `warn` and regenerating failed `effect-policy.test.ts` ("shipped warn is below the error floor").
  - Unexpected corpus hit: removing the tag-check deviation failed the vitest corpus gate and `fixture:replay`.
  - Engine revival: composing `effecttsgo/deterministic-keys: warn` failed the oxlint smoke at G3b ("engine applies warn, policy sets off") at all three paths.
  - Check contract: adding `check:effect-integration` to `check` failed `check-release-workflow`.
- **Checks (each run separately at the uncommitted tree):**
  - `pnpm check`: exit 1 at `introspection check` with the same `config.schema_violation`. Every earlier step passed, including `effect-policy:check`, 2462 tests in 34 files, lint with 0 warnings and 0 errors, and `fixture:replay` (43 suites, 444 cases, 37 corpus variants).
  - `pnpm check:effect-integration`: exit 0.
  - `pnpm prose`: exit 0, with no alerts in 55 files. `pnpm durable:refs`: exit 0. `pnpm introspection:check`: exit 1.
  - actionlint 1.7.12 on the three workflows: exit 0.
- **Typed audit runs:** only against the synthetic scratch app, to prove refusal (see review iteration 1). The first typed run on a real app is the app measurement item.
- **For the app measurement item:** pass each app's vendored and generated folders with `--exclude`. A canary failure marks that app's typed evidence unusable.
- **Review gate:** the agent's own oracle review did not run. The RepoPrompt `manage_selection` call was cancelled, as in WI-02 and WI-06. The orchestrator owns review.
- **Review iteration 3 (orchestrator):** passed. The orchestrator declined its two findings: app-side `paths` mapping `effect` to a type-less stub, and cancelling the synchronous print-config call.
- **Refactor cycle 1:** one accepted change. The Layer-provide source existed three times, as `provideSource` in both route smokes and as the audit's `typedCanarySource`. It is now `layerProvideSource` in `scripts/lib/effect-consumer-harness.ts`, which the two smokes, the audit runner, and `effect-route-probes.ts` import. `effect-app-audit.ts` keeps `typedCanaryCode`.
  - **Byte identity:** before the move, all three copies compared equal. Afterwards, the shared constant equals the committed `provideSource` at `HEAD` (sha256 prefix `04ebb451f2247c8c`).
  - **Checks:** `typecheck`, `/bin/sh -c "pnpm run lint"` (0 warnings, 0 errors), and `vp fmt --check` each exited 0. The four touched test files passed 68 tests. `pnpm check:effect-integration` exited 0.
- **Commits:** none. The orchestrator commits.
- **Action items for MP:** none.

### WI-08: Measure the two apps and finalize conditional delegation (JSON decision DONE; full typed coverage BLOCKED)

- **MP decision (2026-09-26):** accept partial coverage only if an old version causes it. TypeScript 6.0.2 rejects the same five configs (`TS5096` in `apps/cloud`, `apps/local`, `apps/desktop`, `packages/app`; `TS5069` at the root), so the gap comes from executor's own config, not a version gap, and this part stays blocked.
- **Blocked part:** the Done when's complete typed coverage is not met, so this part stays blocked until MP amends the G2/WI-08 contract or a later executor snapshot lints cleanly under TypeScript 7. The JSON decision, the custom-rule counts, and the comparisons are complete.
- **Limitation:** executor's typed coverage is partial, 1,355 of 1,922 script files. TypeScript 7 rejects the configs of five executor projects (the root `tsconfig.json`, `apps/cloud`, `apps/local`, `apps/desktop`, and `packages/app`), and the linter skips their files. Executor's Effect `4.0.0-beta.59` is also below tsgo 0.45.0's supported range (`^4.0.0-beta.107`). No decision depends on the missing files: the JSON rule ships `off` either way, and missing evidence could never enable it.
- **Report:** [`docs/reports/effect-v4-app-audit-2026-09-25.md`](../../reports/effect-v4-app-audit-2026-09-25.md) holds the before/after tables, coverage, fingerprints, the JSON review of every hit, and the pipe and `Effect.fn` comparisons. The alignment record gained an "After-change run" subsection under its app evidence.
- **App copies (deleted 2026-09-26 with MP's OK):** `git clone --local` of each source checkout into the session scratchpad (`apps/t3code`, `apps/executor`), detached at `53456bc0129f` and `480b390eedd1`. Installs were frozen with lifecycle scripts off: `corepack pnpm@11.10.0 install --frozen-lockfile --ignore-scripts` (exit 0) and `bun install --frozen-lockfile --ignore-scripts` (exit 0). Both clones stayed clean in `git status`. The copies use 5.7 GB and 3.8 GB; free disk went from 52 GB to 41 GB, including package-manager caches. The source checkouts were only read. Executor's untracked set changed during the session (it showed `docs/investigations/` instead of `docs/.agents/`); none of it is tracked, so the snapshot is unaffected.
- **Why every pass ran on the copies:** neither source checkout has `node_modules`, and the audit reads each app's installed Effect even in AST mode.
- **Selection:** the recorded run's scope and exclusions, passed as globs. Executor selects 1,940 files, matching the recorded count. t3code selects 3,841, one fewer than the recorded 3,842, and no reading of the recorded policy over the tracked files gives 3,842. The typed passes also exclude `.astro`/`.vue`/`.svelte` components and every file no engine-accepted project lists: 3,802 t3code files and 1,355 executor files remain.
- **Audit defects found on the real apps, fixed:**
  - **Project coverage:** the audit took one `--tsconfig` per app and required every selected file in that project, which no monorepo satisfies. A pinned-engine probe (patched oxlint 1.82.0) showed that type-aware linting ignores `--tsconfig` and picks each file's project the way tsserver does: nearest listing `tsconfig.json`, then its references, then ancestors. `--tsconfig` is gone (hard cutover), the engine gets no `--tsconfig`, and coverage is now checked per file against that lookup (`projectCoverage`). References are not followed, which can only under-report coverage.
  - **Rejected projects:** the engine rejects five executor tsconfigs under TypeScript 7 option validation (`TS5069`, `TS5096`), reports `typescript(tsconfig-error)` at `error`, and skips the program. Attributing diagnostics to owning projects showed exactly 0 tsgo diagnostics in each rejected project and some in every accepted one. The audit now records rejected projects, excludes their diagnostics from rule counts, and counts their files as uncovered. `tsc --listFilesOnly` exits 1 on those configs yet lists the full program, so a listing counts regardless of exit status and the error is recorded.
  - **Effect version:** pnpm does not hoist `effect` to the t3code root. The audit resolves it per selected file from the nearest `node_modules/effect`, records files that resolve none, refuses a mixed-version app, and links the typed canary to that package.
  - **Selection:** `--exclude` takes globs (`path.matchesGlob`) instead of prefixes, because the recorded policy has `*.gen.ts` and root-only files. The engine now receives the explicit selected file list instead of `.` plus mirrored ignore patterns. The extension set gained `.vue`, `.svelte`, and `.astro`, which oxlint lints by default.
  - **`git ls-files` buffer:** t3code's tracked paths (1.6 MB) overflowed the default spawn buffer; the audit's git calls get a 256 MiB buffer.
  - **AST rule set:** the AST config also enabled the 5 general and boundaries rules, which the recorded run never ran; it now enables only the Effect and Effect React domains (38 rules).
  - The I/O-bound project listing, coverage, and Effect resolution moved to `scripts/lib/effect-app-projects.ts` to keep the runner under the 500-line limit. After the move, the AST and both shipped passes were re-run and matched the earlier summaries exactly; the only difference was a temporary consumer path inside one recorded listing error.
- **Engine facts verified on the pinned engine:**
  - The app's own `@effect/language-service` options apply to typed rules, and oxlint owns severity. The apps set no `effectFn`, so the default `["span"]` applies. The default `pipeableMinArgCount` is 2, the same as the overlay's.
  - The engine honors inline `@effect-diagnostics` directives: none of the 254 t3code and 34 executor `preferSchemaOverJson:off` sites in the selection reports.
- **Counts:** custom diagnostics fell from 34,030 to 6,414 (t3code) and 13,667 to 3,588 (executor). Shipped typed totals are 18,646 and 9,386. The shipped totals equal candidate totals minus exactly the JSON hits.
- **JSON decision:** `off`. Candidate hits are 10 in t3code (limit 69) and 313 in executor (limit 98), counted on 70% of executor's files. Review of all 321 distinct sites found 2 that a Schema rewrite improves (`t3code apps/mobile/src/connection/migration.ts:94`, `executor apps/cli/src/tooling.ts:135`); the rest serialize on purpose. `scripts/config/tsgo-policy.ts` records the reason. `pnpm gen:effect-policy` rewrote the generated policy row. `pnpm gen:rules-page` wrote an unchanged page, because the page omits tsgo rules the policy sets off everywhere. `no-json-parse` stays `error`.
- **Pipe-opportunity comparison:** 6 of 482 custom pipe-rule spans intersect a `missed-pipeable-opportunity` span. 620 of t3code's 811 tsgo spans are nested Schema constructors. The custom rules stay.
- **`Effect.fn`:** `prefer-effect-fn` reports 324 (t3code) and 339 (executor typed selection); `effect-fn-opportunity` reports 2 and 1, with no shared line, under the apps' `effectFn` default and Effect-TS/tsgo#766.
- **One-step pipelines:** 337 of 413 t3code `no-pipe-ladder` hits (82%) and 31 of 43 executor hits are one-step pipelines, mostly in `Effect.flatMap` and `Effect.catch` callbacks. The t3code source count is still 382, which the WI-04 review fixes explain (272, then 348, then 382).
- **Judgment calls:**
  - **Typed coverage is partial for executor.** Its typed evidence covers 1,355 of 1,922 files. That cannot flip the JSON decision, because uncovered files can only add hits.
  - **Exact-path exclusions for uncovered files.** The first typed run of each app refused and listed the uncovered files; the usable run passes each as an exact `--exclude`. The audit itself never drops files on its own judgment.
  - **Recorded-run test convention in the before/after table.** The recorded run counted `e2e/`, `testkit/`, `fixtures/`, and `.bench.` as test, which the audit's policy convention does not, so the table re-buckets the after-run raw output the recorded way. Totals do not depend on the convention.
  - **Plan edit:** the G2 paragraph now states the per-file project lookup instead of `--tsconfig` at the app's tsconfig.
- **Evidence location (outside the repo):** the session scratchpad holds `wi08-audit/` (AST), `wi08-typed/<app>/` (candidate and shipped, with `raw/`), the refused first typed runs (`wi08-typed/executor-probe/`), `wi08-<app>-uncovered.txt`, the JSON hit lists, and the analysis scripts.
- **Review iteration 1 (orchestrator):**
  - **Project references:** no reference-following added, because neither app uses references (0 of 16 t3code and 0 of 46 executor tracked `tsconfig`/`jsconfig` files outside `.repos`). In executor, all 1,355 credited files are also in the rejected root program (a farther ancestor), and 470 are pulled into rejected app programs through imports. 0 have a rejected project nearer than the credited one, and 0 are reached through references. Those 470 files get type-dependent tsgo diagnostics at 41%, against 34% for the other 885, so the engine did not assign them to a rejected project. The `projectCoverage` and `listAppProjects` comments now state that references are not modelled and that the result is exact only for apps without them; the report records the limitation and the counts.
  - **Effect resolution:** every `effect` or `effect/*` import in the AST selection resolves from its own file's directory with both Bun's resolver and the nearest `node_modules/effect`, to the same package. That is 1,610 t3code files (7,343 file and specifier pairs, all rc.115) and 927 executor files (1,363 pairs, all beta.59), with 0 failures. No guard was added.
  - **Report:** the outcome line now qualifies "same files" with t3code's 3,841 against the recorded 3,842, and the report carries the limitation statement above.
- **Checks (final tree):**
  - `pnpm check` without `introspection:check`: exit 0. It covered 2497 tests in 34 files, lint with 0 warnings and 0 errors, and `fixture:replay` (43 suites, 444 cases, 37 corpus variants).
  - `pnpm check:effect-integration`: exit 0.
  - `pnpm prose`: exit 0.
  - `vp fmt --check`: exit 0.
- **For later items:**
  - **WI-09:** the pipe-coverage follow-up record can cite 6 of 482 spans. Consumer guidance may need two engine facts: a project whose tsconfig TypeScript 7 rejects gets no tsgo diagnostics, and the consumer sees that as a `typescript(tsconfig-error)` error; and the tsgo checks use the consumer's own `effectFn` unless the overlay is in the tsconfig chain.
  - **WI-13:** re-run the audit after the tsgo bump to show whether `effect-fn-opportunity` then reports the plain wrappers `prefer-effect-fn` reports here.
- **Commits:** none. The orchestrator commits.
- **Action items for MP:** none required. The one-step `no-pipe-ladder` share is information; narrowing the rule would be a new decision.

### WI-09: Complete consumer guidance, records, and changesets (DONE)

- **Manifest notes:** all 43 active package rules in `rule-manifest.ts` now carry one plain sentence about what the rule catches, written from each visitor and its RuleTester cases. Provenance wording such as `Scenario-covered structural port` is gone. Three notes keep a rationale the page reader needs. They cover the `prefer-effect-fn` overlap with `effect-fn-opportunity` under `extends`, the `no-manual-tag-check` deviation from effect-solutions, and why `no-fromnullable-nullish-coalesce` has no autofix. The `no-ts-nocheck` note avoids the literal directive, because that rule matches the text anywhere in a file. `pnpm gen:rules-page` rewrote the 43 package rows and nothing else.
- **Package README (`packages/oxlint-standards/README.md`):** the language-service section, the rules-only Effect override recipe, and the stale counts are replaced. It now covers the full `effectPreset` shape, both routes, the supported matrix, how the patched engine finds TypeScript settings, a self-check canary, `effectBoundaryRules` with executor's globs read from `.oxlintrc.jsonc` at `480b390ee`, the essential house style, and an upgrade section. The upgrade section lists all 26 removed rules with their replacements, the removed and renamed metadata, and the new exports. Counts come from a manifest query: 43 custom rules (23 ported, 20 reimplemented), 113 tsgo rows (44 error, 64 warn, 5 off), 29 dropped rows with 10 `replacedBy` edges, and 135 built-in settings.
- **Published 0.1.0 check:** `npm pack @mplibunao/oxlint-standards@0.1.0` shows 68 plugin rules, including all 26 removed ones, and the export `lspOwnedChecks`. The removal lists name only those rules, which consumers actually had; the three older drops never shipped.
- **tsconfig README:** its version section now names the supported pair beside the tested one. It also names the unsupported `vite-plus` releases with their `Unknown plugin` failure, and it explains the `typescript(tsconfig-error)` behavior.
- **House style:** new `docs/references/effect-house-style.md` carries the eight §3.10 instructions. The package README carries a one-line version of each, so package consumers get them without the repository.
- **Router and governance:** `CLAUDE.md` points to the generated rules page, `pnpm rules:view`, and the house style, and calls ADR-007 accepted and implemented. ADR-007, the decision index, and the ADR-001 and ADR-004 supersession notes no longer say the cutover is pending.
- **Current-state docs:** `rule-pack-architecture.md` (sources, counts, delegation, replacement floor, separate custom and delegated validation), `rule-intake.md` (tsgo grading, overlap, `replacedBy`, pinned-rule intake), and `preset-architecture.md` (status, the `effect` taxonomy row, stack wording, and the 2026-05-30 audit marked historical with the v4 Atom gate). Stale lines fixed in `lint-glossary.md`, `mutation-testing.md`, and `release-readiness.md`. `translation-contract.md` is marked as the historical Item 6 contract. Root `README.md` has current counts, both overlays, and the viewer.
- **Notice mirrors:** root `NOTICE.md` gains a section for the retained `@effect/tsgo` metadata that the snapshot and the rules page reproduce. Neither package NOTICE changed: the generated package files carry only rule names and option keys, no upstream text.
- **Records:** BP-TD-015 (`Effect.forkDetach` research), BP-TD-016 (tsgo pipe coverage, citing 6 of 482 spans), and BP-TD-017 (next tsgo pin triage). `introspection check` still fails with the external `config.schema_violation`, so IDs were allocated by hand. The highest record was BP-TD-014, and no file, generated mirror, or git history names 015 to 017. The three new records, BP-TD-014, and BP-TD-010 validate against `../introspection/schemas/tech-debt-record.schema.json` with ajv and have the required headings; a copy with `status: bogus` fails. The alignment plan's deferred list now names the three IDs. No record for narrowing `no-pipe-ladder`, which is an open question for MP, not an accepted deferral.
- **Changesets:** the lint changeset keeps its minor bump and prior notes, and gains a breaking section. It covers the required setup and the new optional peer, lists all 26 removed rule IDs and the removed and renamed API, and names the new exports and the rule changes. New `.changeset/tsconfig-effect-integration.md` is an independent minor for the two overlays and the optional peer. `pnpm changeset status` bumps both packages at minor and does not list the viewer.
- **Setup run on the real engine:** a temporary script in the session scratchpad packed both packages and installed the supported pair (vite-plus 0.3.2, oxlint 1.82.0) in an isolated harness consumer. It wrote the README's `vite.config.ts` and canary verbatim, patched, and ran `vp lint`. Inline `vite.config.ts` composition of `baseConfig`, `vitestConfig`, `nodeRuntimeConfig`, `effectPreset`, `effectReactPreset`, and the boundary override loaded. The boundary file under `apps/cli/src` reported no `no-json-parse`, and the canary reported `effecttsgo(strict-effect-provide)` and `effecttsgo(effect-fn-opportunity)`, both at error, beside two base-config errors.
  - **Found by that run:** with `server.json` in the chain and no `bun-types` installed, the engine reports `typescript(tsconfig-error)` ("Invalid tsconfig") and no `effecttsgo` diagnostic at all. Installing `bun-types@1.3.11` or switching to `base.json` restored both canary errors. Both READMEs now say to install `bun-types` with `server.json` and name this cause.
- **Judgment calls:**
  - **Matrix wording:** the READMEs state the full supported set for 0.45.0 (oxlint 1.81.0 or 1.82.0, vite-plus 0.3.1 or 0.3.2) and name the tested pair (0.3.2 with 1.82.0), because §3.5 asks for the tested matrix.
  - **Canary shape:** §4 asks for a canary that catches a missing tsconfig overlay through `effect-fn-opportunity`. Under Effect-TS/tsgo#766 the overlay does not change oxlint-route output, so no canary can detect it today. The canary instead proves the patch and type resolution: `strict-effect-provide` fires only when Effect types resolve (WI-06 review), and the piped-span wrapper is the form `effect-fn-opportunity` reports under the shipped setup.
  - **Program coverage:** §4 says files outside the TypeScript program get custom diagnostics only. WI-06 and WI-07 showed they still get `effecttsgo` diagnostics when `effect` resolves, so the README describes project lookup and the tsconfig-error case instead.
  - **Architecture claim:** `rule-pack-architecture.md` said inline vite-plus plugin resolution was unproven. The repository's own `vite.config.ts` loads the plugin through `baseConfig`, and the setup run above loaded the full Effect composition inline, so the doc now names both config forms.
  - **Built-in notes left alone:** built-in rows such as `no-nested-ternary` keep their existing notes; the item covered package rules.
- **Not run:** `pnpm check:effect-integration`. This item changed no file on the router's trigger list; the manifest change is note text only, which the fragment does not read.
- **Checks (final tree, each run separately):**
  - The `check` chain without `introspection:check`: exit 0. It covered 2497 tests in 34 files, lint with 0 warnings and 0 errors, `rules-page:check`, the viewer smoke (404 rules), `fixture:replay` (43 suites, 444 cases, 37 corpus variants), both packed smokes, and prose (no alerts in 60 files).
  - `pnpm changesets:check`: exit 0. `pnpm prose`: exit 0. `pnpm durable:refs`: exit 0.
  - `pnpm introspection:check`: exit 1 with the same `config.schema_violation` as the intake baseline.
  - Vale on the two changesets and root `NOTICE.md`, which the prose gate does not cover: the one remaining error is in the verbatim MIT license text, which stays unchanged.
- **Review iteration 1 (orchestrator): three doc defects, all fixed.**
  - **Removed-rules table:** it said every removed rule without a tsgo replacement flagged shapes that are now allowed. Each dropped manifest note was re-read. `no-call-tower` now names `no-effect-call-in-effect-arg` and `no-nested-effect-call` names `no-effect-ladder`, the custom owners their notes assign. `no-effect-as` and `no-naked-object-state-update` get their own rows, because `no-effect-side-effect-wrapper` and `no-json-parse` still cover part of what they flagged. The ten tsgo rows match the drop register's `replacedBy` edges, and only the remaining twelve rules say their shapes are allowed.
  - **House-style summary:** the README's eight one-line points dropped instructions lint cannot fully enforce. The README now carries every instruction from `effect-house-style.md` in short form, grouped by the same eight headings. That includes Data versus Schema errors, keeping unknown causes, the provision exemptions, yielding Atom operations beside synchronous registry methods, the `fromUndefinedOr` distinction, hoisting schemas, and rebuilding `Schema.Class` values. The README no longer depends on the repository doc.
  - **tsgo count:** the root README said the Effect preset turns on 113 checks. The generated policy has 113 rows with 108 not `off`, so it now says the preset configures 113 and enables 108. The lint changeset had the same wording and now says the same.
- **Checks after the fixes (each run separately):** the `check` chain without `introspection:check` exited 0, with 2497 tests in 34 files and lint at 0 warnings and 0 errors. `pnpm prose` and `pnpm durable:refs` exited 0.
- **Review iteration 2 and refactor cycle 1:** the `no-arrow-ladder` note now describes an immediately invoked inline function whose body or parameters contain another one, as the visitor checks (page regenerated; `rules-page:check`, `test`, and `prose` exited 0). The refactor keeps the complete house style only in the package README, reduces `effect-house-style.md` to a pointer, replaces the stale artifact inventories in `release-readiness.md` with links to the package manifests and artifact-assertion scripts, and points the glossary's config-loading note at the README. Cycle 2 trims the root README's package blurbs to links and fixes the preset-shape overview in the package README. Afterwards `pnpm prose`, `pnpm durable:refs`, and the `check` chain without `introspection:check` (2497 tests) exited 0.
- **Commits:** none. The orchestrator commits.
- **Action items for MP:** none.

### WI-10: Final acceptance (in-scope verification complete / full acceptance blocked)

- **Revision and route:** `be8b5fa` on `lint/oxlint-standards-consolidation`, from `/Users/mp/Projects/personal/backpressure`. The plan remains active. No change was staged, committed, or pushed.
- **Evidence directory:** `/private/tmp/claude-501/-Users-mp-Projects-personal-backpressure/cb9f46b7-f8e9-4290-8e97-f30127e28448/scratchpad/wi10/`. Log names below are relative to this directory; `version-route.log` records the revision, cwd, and tool pins. Route R means the root checkout with pnpm 11.4.0, Bun 1.3.11, Node 24.21.0, oxlint 1.58.0, TypeScript 6.0.2, vite-plus 0.1.15, and `@effect/tsgo` 0.45.0. Route I starts at the root but installs isolated packed consumers with Effect 4.0.0-rc.115, oxlint 1.82.0, oxlint-tsgolint `7.0.2001`, and vite-plus 0.3.2; its oxlint-route consumer uses TypeScript `6.0.2` and its patched-tsc consumer uses TypeScript `7.0.2`. Exit statuses below are the process results, not inferred from a test count.

| Command | Cwd/route | Exit | Log |
| --- | --- | ---: | --- |
| `pnpm check` (unmodified) | Root/R | 1 | `pnpm-check.log` |
| `pnpm durable:refs` | Root/R | 0 | `durable-refs.log` |
| `pnpm effect-policy:check` | Root/R | 0 | `effect-policy-check.log` |
| `pnpm build` | Root/R | 0 | `build.log` |
| `/bin/sh -c "pnpm run lint"` | Root/R | 0 | `lint.log` |
| `pnpm versions:check` | Root/R | 0 | `versions-check.log` |
| `pnpm typecheck` | Root/R | 0 | `typecheck.log` |
| `pnpm test` | Root/R | 0 | `test.log` |
| `pnpm check-release-workflow` | Root/R | 0 | `check-release-workflow.log` |
| `pnpm changesets:check` | Root/R | 0 | `changesets-check.log` |
| `SKIP_BUILD=true pnpm inventory:rules` | Root/R | 0 | `inventory-rules.log` |
| `pnpm rules-page:check` | Root/R | 0 | `rules-page-check-direct.log` |
| `pnpm smoke:rules-viewer` | Root/R | 0 | `smoke-rules-viewer-direct.log` |
| `SKIP_BUILD=true pnpm fixture:replay` | Root/R | 0 | `fixture-replay.log` |
| `SKIP_BUILD=true pnpm smoke:oxlint-packed-consumer` | Root/R | 0 | `smoke-oxlint-packed-consumer.log` |
| `pnpm smoke:tsconfig-packed-consumer` | Root/R | 0 | `smoke-tsconfig-packed-consumer.log` |
| `pnpm -r --if-present pack:dry-run:no-build` | Root/R | 0 | `pack-dry-run-no-build.log` |
| `pnpm introspection:check` | Root/R | 1 | `introspection-check.log` |
| `pnpm prose` (independent) | Root/R | 0 | `prose.log` |
| `pnpm check:effect-integration` | Root/I | 0 | `effect-integration.log` |
| `RULES_VIEWER_PORT=0 pnpm rules:view` (start, HTTP requests, stop) | Root/R | 0 | `rules-view-session.log`, `rules-view-server.log` |
| `command git diff --stat dfff7d9..be8b5fa -- packages/oxlint-standards/src scripts` (with source and policy comparisons) | Root/R | 0 | `v4-behavior.log` |

- **Aggregate stopping point:** `pnpm check` passed every command through both package allowlists, then exited 1 at `introspection check` before running prose. Its exact error is `config.schema_violation: config TOML failed JSON Schema validation`, matching the intake baseline at `42c77c6`. The independent check reproduced it. `introspection-cause.log` shows the repo's `[records.list]`, the installed CLI bundle's `records` schema with only `root` and `additionalProperties: false`, and the sibling source schema that accepts `list`. This is the same external stale-build blocker, not a new failure in the rule work. `pnpm prose` passed independently with no alerts in 60 files. The command logs also report 2,497 passing tests in 34 files, 43 fixture suites with 444 cases and 37 corpus variants, 404 viewer rules, and both packed integration routes passing. The short viewer run returned HTTP 200 for the page and 404-rule JSON, then stopped; a subsequent connection was refused.
- **V1-V3: passed.** The command table above records the results and logs for the [plan's verification methods](./effect-rules-v4-implementation-2026-09-25.md#four-task-specific-verification-methods).
- **V4 (prior app evidence applies to this revision):** `command git diff --stat dfff7d9..be8b5fa -- packages/oxlint-standards/src scripts` shows only 43 replacements of `note` text in `rule-manifest.ts`. A zero-context diff check found every changed source line is a `note` field. The rule catalog, Effect preset, manifest selection, rule messages, tsgo config and generated policy, policy source, and supported matrix have identical Git object IDs at both revisions (`v4-behavior.log`). Rule behavior is unchanged, so the reviewed [WI-08 app audit](../../reports/effect-v4-app-audit-2026-09-25.md) supplies V4 at `be8b5fa`; no app rerun was needed. Its AST passes covered 3,841 t3code and 1,940 executor files. Its typed executor coverage remains partial at 1,355 of 1,922 files.
- **After the evidence write:** `pnpm prose` passed with no alerts in 60 files (`prose-after-docs.log`); `pnpm durable:refs` and `vp fmt --check` passed (`durable-refs-after-docs.log`, `fmt-after-docs.log`), and `command git diff --check` exited 0. `pnpm introspection:check` still exited 1 with the same schema error (`introspection-check-after-docs.log`).
- **Open items:** full acceptance remains blocked by the external introspection schema failure and executor's incomplete typed coverage, which needs an MP decision on the G2 contract or a later cleanly lintable snapshot. WI-12 remains parked in the untouched stash. WI-13 waits for an `@effect/tsgo` release containing #768. Renovate app activation waits on MP. Nothing was pushed.

### WI-12: Extend prefer-effect-fn to tsgo shape parity (PARKED)

- **Goal:** report the two wrapper shapes that `effecttsgo/effect-fn-opportunity` reports with the overlay's `effectFn` settings and the restored rule misses: an arrow as a named object property, and `Effect.gen(...).pipe(...)` with operators other than a final `Effect.withSpan(...)`.
- **State:** the first pass matched tsgo on the 14-shape probe corpus, and the full check chain passed after a typecheck fix. The orchestrator had recorded VERIFY iteration 1 as passed before reading the gate output; iteration 2 records that correction and the typecheck failure. REVIEW iteration 1 found four valid defects: async and generator outer functions reported, object getters reported, parameter references resolved by name, and no recognition of imported `pipe(...)`. The agent was cancelled mid-fix.
- **MP decision (2026-09-26):** park it. Upstream merged the `extends` fix (Effect-TS/tsgo#768, closing Effect-TS/tsgo#766), so tsgo covers these shapes once the pin moves. The work sits in the git stash entry whose message starts with `prefer-effect-fn parity extension (parked`. Nothing from it is committed.

### WI-13: Bump @effect/tsgo to the first release containing the extends fix (DONE, uncommitted)

- **Release:** `@effect/tsgo` 0.46.1, published 2026-09-26T13:14Z. Tag `@effect/tsgo@0.46.1` resolves to `f1a7cad0292d9d315e7f87694f127f605711d55e`, and `command git merge-base --is-ancestor 7611be0 @effect/tsgo@0.46.1` succeeds, so it contains Effect-TS/tsgo#768. Its tagged `_packages/tsgo/upstream.json` and README list TypeScript 7.0.2 (plus `7.1.0-dev.20260924.1`), oxlint-tsgolint `7.0.2001` to `7.0.2003`, and oxlint 1.82.0 to 1.85.0. oxlint 1.81.0, and with it `vite-plus` 0.3.1, is no longer supported.
- **Effect support:** the tagged package still develops against `effect` `^4.0.0-beta.107`, unchanged from 0.45.0, and every new rule lists v4 in `supportedEffect`. The `4.0.0-rc.115` pin stays inside that range.
- **Build:**
  - The catalog, the root dev dependency, and both packages' optional peers pin exactly `0.46.1`. `pnpm-lock.yaml` changes only `@effect/tsgo` and its seven platform packages.
  - The root `pnpm-workspace.yaml` adds `minimumReleaseAgeExclude` with exactly eight entries: `@effect/tsgo@0.46.1` and `@effect/tsgo-{darwin-arm64,darwin-x64,linux-arm,linux-arm64,linux-x64,win32-arm64,win32-x64}@0.46.1`. `minimumReleaseAge: 10080` and the other safeguards are unchanged.
  - `scripts/lib/effect-consumer-harness.ts` copies `minimumReleaseAgeExclude` into each isolated consumer when the root declares it. A new test covers the copy; emptying the copied-key list fails exactly that test, and the file was restored by checksum.
  - `scripts/config/effect-toolchain.json` carries no tsgo version (the catalog owns it), so only its unsupported-oxlint control moved, from 1.83.0 (now supported) to 1.81.0 (dropped by 0.46.1; published 2026-09-01). The other integration pins stay: `vite-plus` 0.3.2, oxlint 1.82.0, oxlint-tsgolint `7.0.2001`, TypeScript 7.0.2 for the tsc route, and `effect` 4.0.0-rc.115.
- **Release-age controls:** a scratch script wrote the harness's own copied workspace settings into three throwaway consumers. The copy holds `minimumReleaseAge: 10080`, the other four safeguards, and only the eight exclusions. `@effect/tsgo@0.46.1` installed (exit 0). `@effect/tsgo@0.46.0` (published 2026-09-25) failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, naming its platform packages, so the exclusions are exact-version only. `vite-plus@1.0.0-rc.1` failed the same way on its young dependencies. `pnpm install` at the root exited 0.
- **Snapshot:** `bun scripts/checks/generate-effect-policy.ts --capture /Users/mp/references/effect-ts/tsgo` captured 116 rules from the tag and pruned the 0.45.0 directory. An independent `command git show f1a7cad…:<path> | shasum -a 256` matched all four recorded hashes (`LICENSE`, `README.md`, `_packages/tsgo/src/metadata.json`, `oxlint-schema.json`). The installed-package cross-check in `pnpm gen:effect-policy` passed. The reference checkout stayed clean.
- **Rule diff 0.45.0 to 0.46.1:** the release adds three rules. Every existing rule keeps its name, category, and default severity. The only other metadata change is `instanceOfSchema`'s preview example. Category counts are now 21 correctness, 20 antipattern, 53 style, and 22 effect-native, so `expectedCategoryCounts.style` moved from 50 to 53 with the pinned version.
- **Grades** (each takes the style category default, so the policy needs no named exception):

  | Rule | Grade | Reason |
  | --- | --- | --- |
  | `effecttsgo/catch-if-tag-to-catch-tag` | warn (style) | A simplification hint for a `catchIf` whose predicate is a direct `_tag` equality; `no-manual-tag-check` already fails the same predicate at error. |
  | `effecttsgo/catch-refail-to-tap-error` | warn (style) | The handler already keeps the original failure, so `tapError` is a clearer spelling, not a hidden failure path. |
  | `effecttsgo/flat-map-ignored-param-to-and-then` | warn (style) | `Effect.andThen` versus `Effect.flatMap(() => existing)` is a readability hint with identical behavior. |

  Of the 116 rules, 44 now ship at error and 67 at warn, and 5 stay off. Upstream's new `strict` preset is not adopted; the policy still lists every rule explicitly.
- **Overlap with the AST rules (ADR-007):** the built plugin (root oxlint 1.58.0, the 36 custom `effectPreset` rules) and a patched 0.46.1 harness consumer (the same custom rules plus the three new tsgo rules) ran over each new rule's upstream preview and nearby variants.

  | Snippet | Custom rules | New tsgo rules |
  | --- | --- | --- |
  | `catchIf((error) => error._tag === 'NotFound', …)` (upstream preview) | `no-manual-tag-check` (error, on the predicate) | `catch-if-tag-to-catch-tag` (warn, on the call) |
  | `catch((error) => rollback.pipe(Effect.andThen(Effect.fail(error))))` (upstream preview) | none | `catch-refail-to-tap-error` |
  | The same re-fail written in `Effect.gen` | none | none |
  | `catch((error) => rollback.pipe(Effect.flatMap(() => Effect.fail(error))))` | `no-pipe-ladder` (on the nested flatMap) | `catch-refail-to-tap-error` (on the catch) |
  | `catch(() => rollback.pipe(Effect.andThen(Effect.fail(new Timeout()))))` | `no-discarded-failure` | none |
  | `first.pipe(Effect.flatMap(() => second))` and `Effect.flatMap(first, () => second)` | none | `flat-map-ignored-param-to-and-then` |
  | `flatMap((n) => second.pipe(Effect.flatMap(() => Effect.succeed(n))))` | `no-pipe-ladder` | none |

  No rule pair reports the same defect. The only overlap is `no-manual-tag-check` beside `catch-if-tag-to-catch-tag`, which ADR-007 allows: the AST rule is stricter, since it fails every hand-written `_tag` comparison at error, and it fires without a TypeScript project. `no-discarded-failure` and `catch-refail-to-tap-error` split cleanly, because a handler that re-fails its error reads it. Where `no-pipe-ladder` and a tsgo rule both report one statement, they name different problems with different fixes. Neither rule changed.
- **Extends fix evidence:**
  - Before the bump, the unchanged oxlint-route smoke at 0.45.0 exited 0, which asserts the old split.
  - After the pin moved, and before the smoke changed (`command git diff --quiet` on it succeeded), `pnpm smoke:effect-oxlint-packed-consumer` exited 1 by design. Every earlier step passed, including the 1.81.0 unsupported control: `error: src/wrappers/declaration.ts reported [@mplibunao/oxlint-standards(prefer-effect-fn), effecttsgo(effect-fn-opportunity)], expected [@mplibunao/oxlint-standards(prefer-effect-fn)]. … drop prefer-effect-fn again (BP-TD-014).`
  - The smoke now asserts that under the shipped setup both plain wrappers report `prefer-effect-fn` and `effect-fn-opportunity`, and the `Effect.withSpan` wrapper reports `effect-fn-opportunity`. It prints that split and still requires the inline no-extends control to report `effect-fn-opportunity` on all three.
  - A scratch probe ran patched oxlint 1.82.0 with the same packed tarballs, enabling only the two wrapper rules, once per tsgo version. The first list uses a tsconfig that extends `base.json` and `effect.json`; the second inlines the overlay's plugin entry without `extends`.

    | Wrapper | 0.45.0, extends | 0.46.1, extends | Inline control, both versions |
    | --- | --- | --- | --- |
    | `declaration.ts` (function declaration) | `prefer-effect-fn` 3:8 | `effect-fn-opportunity` 3:17, `prefer-effect-fn` 3:8 | `effect-fn-opportunity` 3:17, `prefer-effect-fn` 3:8 |
    | `parameter.ts` (plain arrow) | `prefer-effect-fn` 3:23 | `effect-fn-opportunity` 3:14, `prefer-effect-fn` 3:23 | `effect-fn-opportunity` 3:14, `prefer-effect-fn` 3:23 |
    | `spanned.ts` (`Effect.withSpan` arrow) | `effect-fn-opportunity` 3:14 | `effect-fn-opportunity` 3:14 | `effect-fn-opportunity` 3:14 |

  - The tsc route passed unchanged: `tsc --version` ends in `+effect-tsgo.0.46.1`, all three wrappers report `effectFnOpportunity` through `extends`, and the `effectFn: ['span']` control leaves only the spanned wrapper.
  - `prefer-effect-fn` is unchanged. It stays active at `error` with no `replacedBy` edge.
- **Docs:** both package READMEs give the 0.46.1 matrix: `vite-plus` 0.3.2 or 0.3.3, tested with 0.3.2; the `1.0.0-rc` releases (oxlint 1.85.0 with oxlint-tsgolint `7.0.2002` or `7.0.2003`) supported but not tested here, because they are younger than the release-age window; 0.3.1 unsupported. They also state that the oxlint route reads the Effect options through `extends`, and give the 116-rule counts. Both changesets, `NOTICE.md`, the rule-pack architecture count, the audit's effect-range comment, the regenerated `docs/references/rules.md`, and the build plan's §3.3 overlap paragraph, G6 fn-option row, and Appendix A tsgo facts now say 0.46.1. The `prefer-effect-fn` manifest note, its catalog comment, the `effect-fn-opportunity` policy reason, and the inline `diagnostics: false` probe comment now give the current reasons: the custom rule overlaps on purpose and fires without a TypeScript project, and the probe is an independent control. The app audit report gained a 0.46.1 addendum. The plan's WI-02-era build instructions keep 0.45.0 as the version that step built.
- **Records:** BP-TD-017 moved to `done/` with a resolution. BP-TD-014 stays open: it records that the fix shipped in 0.46.1, with the per-wrapper evidence, and that removing `prefer-effect-fn` waits for MP. Both were edited by hand because `introspection` still stops on `config.schema_violation`.
- **Judgment calls:**
  - **Optional exclusion copy:** the harness copies `minimumReleaseAgeExclude` only when present, unlike the five required safeguards. A missing list only makes the window stricter, and the root can drop the entries once 0.46.1 ages past the window without breaking the smokes.
  - **Grades at the category default:** none of the three rules hides a failure path or breaks a scope, and the policy's only style errors are the four gen-first rules.
  - **Plan history:** the plan's build instructions record what WI-02 built, so they keep 0.45.0; only statements of current behavior and current support changed.
- **App audit on 0.46.1:** the typed `shipped` pass of `scripts/checks/effect-app-audit.ts` re-ran on both WI-08 snapshots, with the same exclusions and the same per-file exact excludes for files no accepted project covers. The apps ran on fresh `git clone --local` copies in the session scratchpad, detached at `53456bc0129f` and `480b390eedd1`. The installs were `corepack pnpm@11.10.0 install --frozen-lockfile --ignore-scripts` and `bun install --frozen-lockfile --ignore-scripts`, both exit 0, and both copies and both source checkouts stayed clean. Both audit runs exited 0 with no canary problems. They linted the same files as WI-08: t3code 3,802 selected in unchanged projects; executor 1,355, where the only coverage difference is the temporary consumer path inside one recorded listing error. 206 rules were enabled, against 202 before: the three new tsgo rules plus `no-discarded-failure`. The run reported rules that exist only in 0.46.1, so it used the 0.46.1 engine.

  | Rule | t3code (source / test) | executor |
  | --- | --- | --- |
  | `catch-if-tag-to-catch-tag` | 0 | 0 |
  | `catch-refail-to-tap-error` | 1 / 0 | 0 |
  | `flat-map-ignored-param-to-and-then` | 2 / 0 | 0 |

  - **Every hit is a true positive with a one-line fix:**
    - t3code `apps/server/src/provider/acp/AcpSessionRuntime.ts:693`, `Effect.flatMap(() => getStartedState)`, where `getStartedState` is an existing Effect, becomes `Effect.andThen(getStartedState)`.
    - t3code `apps/server/src/telemetry/AnalyticsService.ts:197`, `Effect.sleep(1000).pipe(Effect.flatMap(() => flush))`, becomes `Effect.andThen(flush)`.
    - t3code `apps/server/src/telemetry/AnalyticsService.ts:174`, `Effect.catch((error) => Ref.update(bufferRef, …).pipe(Effect.flatMap(() => Effect.fail(error))))`, restores a buffer and re-fails the same error, which is `Effect.tapError`'s job. `no-pipe-ladder` also reports the nested flatMap at line 176; one `tapError` rewrite clears both.
  - **Recommendation: keep all three at `warn`.** Under `--max-warnings 0` they add three blocking warnings to t3code and none to executor, each a real simplification.
  - **Other counts:** no other tsgo rule count changed in either app. The only other differences are custom rules from the WI-14 rework: `no-pipe-ladder` fell from 382 / 31 to 77 / 0 (t3code) and from 37 / 6 to 12 / 4 (executor), and `no-discarded-failure` reports 146 / 5 and 145 / 15. Totals moved from 18,646 to 18,464 (t3code) and from 9,386 to 9,519 (executor), and those rule differences account for the totals exactly.
  - **Wrapper overlap on the apps:** unchanged, because the audit applies each app's own plugin options and neither app sets `effectFn`, so tsgo's default `["span"]` applies with or without the `extends` fix. `effect-fn-opportunity` and `prefer-effect-fn` counts are identical to WI-08.
- **Checks:**
  - `pnpm install` (root): exit 0. `pnpm effect-policy:check`: exit 0. `pnpm versions:check`: exit 0.
  - The check chain without `introspection check` (the `check` script with ` && pnpm introspection:check` removed, run through `/bin/sh -c`): exit 0 on the final tree. It ran 2,674 tests in 34 files, 44 replay suites with 470 cases and 37 corpus variants, and 408 viewer rules. The inventory reports `delegated: 116`, lint reported 0 warnings and 0 errors, and the packages pack 10 (tsconfig) and 9 (lint) allowed files. Two earlier runs stopped: one at lint on `max-statements` in the harness change, fixed by extracting `copiedSettings`; one at prose, where Vale read bare `7.0.2002` and `7.0.2003` as dates, fixed by code-formatting them.
  - `pnpm check:effect-integration`: exit 0 on both routes; the only later change to its scripts was a whitespace-only `vp fmt` pass. The oxlint route printed the shipped split above, the 1.81.0 control failed to patch, and the tsc route passed on `+effect-tsgo.0.46.1`.
  - `pnpm prose` and `pnpm durable:refs`: exit 0, with no Vale alerts in 61 files; `vp fmt --check` and `command git diff --check` also passed.
  - `introspection:check` was left out by instruction; WI-10 records its external schema failure.
  - **After the review fixes** (current-state text and the app audit): `pnpm gen:effect-policy` and `pnpm gen:rules-page` regenerated the reason and note text. The check chain without `introspection check` exited 0 with the same counts as above. `pnpm prose` (no alerts in 61 files), `pnpm durable:refs`, `vp fmt --check`, and `command git diff --check` exited 0. One earlier chain run stopped at prose on a bare `7.0.2001` in the report addendum, fixed by code-formatting it. `check:effect-integration` was not re-run, because the fixes change only descriptive text that neither smoke reads.
- **Orchestrator review:** iteration 1 found two items. The `prefer-effect-fn` note, comment, and probe text still described the fixed `extends` bug. The app audit had not measured the three new rules. Both were fixed above. Iteration 2 found no blocking issue and one wording fix: BP-TD-017's done-when no longer says `effect-toolchain.json` pins tsgo, since the catalog owns that version.
- **Refactor cycle 1:** the three wrapper fixtures moved to `wrapperSourcesIn(dir)` in `scripts/lib/effect-consumer-harness.ts`, so both route smokes lint the same wrapper sources, and the oxlint smoke's `wrapperCoverage` became `missingTsgoWrapperFiles`, which names what it returns. The check chain without `introspection check` and `pnpm check:effect-integration` both exited 0 afterward.
- **Commits:** recorded in the status table.
- **Action item for MP:** decide whether to drop `prefer-effect-fn` now that `effect-fn-opportunity` reports every wrapper shape under the shipped setup (evidence above). Keeping it leaves two error diagnostics on each plain wrapper on the oxlint route; its one standalone advantage is that it fires without a TypeScript project. Dropping it means restoring the `replacedBy` edge to `effecttsgo/effect-fn-opportunity` and its replacement floor (BP-TD-014 "Done when").

### WI-14: Rebuild no-pipe-ladder as closure nesting and add no-discarded-failure (DONE, uncommitted)

- **Goal and authority:** apply the two decisions in the [Effect nesting-rules analysis](../../analysis/effect-nesting-rules-first-principles.md). `no-pipe-ladder` now reports an inline `Effect.flatMap`, `andThen`, or `tap` callback nested inside an Effect step callback, once per outer callback, at the inner continuation. The new `no-discarded-failure` (error, `agent-failure-mode`) reports a blanket recovery handler that never reads its error unless a failure tap recorded it first. The analysis's criteria C1 to C7 and its messages are the contract, and its stress table supplies the cases; §3.6 of the plan restates the contract.
- **Code:** `utils/effect-composition.ts` replaces the pipeline-nesting walk and its `isQualifyingEffectPipeline` notion with step-callback, continuation, and ladder-search predicates, and generalizes the verified handler-map layouts into callback-object layouts that also cover `matchEffect`, `matchCauseEffect`, the `match*` and `mapBoth` options, and `try`/`tryPromise`. The new `utils/effect-recovery.ts` holds the blind-handler, blanket-recovery, and recorded-first checks. `rule-catalog.ts` visits step callbacks for the ladder rule and recovery calls for the discard rule. Both rules gate on the existing bound-namespace resolution, so aliases, shadowing, and type-only imports behave as in the other callee-gated rules.
- **Metadata and registries:** the `no-discarded-failure` manifest row follows `no-string-error-channel`: `sourceOwnership: 'recon'`, `disposition: 'reimplemented'`, `parityStatus: 'semantic-scenario-replay'`, `testSource: 'scenario-only'`, and `gating: 'effect-callee'`, because it fires only on bound `Effect.*` recovery calls. `no-pipe-ladder` is now `disposition: 'reimplemented'` with `testSource: 'scenario-only'`, since its behavior no longer resembles the upstream rule; `sourceOwnership: 'linteffect'` and its `sourcePresets` still record where the idea came from. One ownership-registry edge makes `no-flatmap-ladder` defer to `no-pipe-ladder` when the flatMap's step callback holds a closure ladder, using the same predicates `no-pipe-ladder` reports with; opaque continuations such as `() => Effect.flatMap(other, f)` still report through `no-flatmap-ladder`. The two new rules need no edge between them, because the analysis expects both to report a ladder whose outer callback is a blind `catch` (row R9). The drop register and the inventory expectations need no change; the inventory counts dispositions nowhere and reports 42 semantic-replay rows. The catalog counts in the package README and `rule-pack-architecture.md` now come from the manifest. It lists 44 custom rules, split evenly between ported and reimplemented, and `effectPreset` holds 36 of them.
- **Tests:** RuleTester runs every S and D snippet of the stress table against both rules, with the table's L and D columns as the expectations; S8 and D4 are the same snippet, so one case covers both. Repo rows whose shape no snippet covers are cases in the rule they exercise; R4 shares S12's shape. Further cases pin the report on the inner continuation's line and column and check that a nested handler callback is judged on its own. The replay suites cover 26 ladder branches and 23 discard branches.
- **Messages:** both analysis messages exceed the rendered-line budget, which measures `x @mplibunao/oxlint-standards(<rule>): <message>` against 370 columns. They rendered at 409 and 414 columns. The shortened `no-pipe-ladder` message is 322 characters and renders at 369. In it, `so a reader tracks every closure to see what runs when` became `hiding what runs when`, and `nested inside` became `inside`. The shortened `no-discarded-failure` message is 315 characters and renders at 368. In it, `hides which failures it absorbs and drops the cause, so new failure types vanish` became `drops the cause and absorbs new failure types`, and `tapCause` left the fix list, since `tapError` covers the common case.
- **Judgment calls:**
  - **Recorded first in a standalone pipe.** C6 names the `.pipe(...)` argument list. The rule also accepts the argument list of a bound standalone `pipe(...)`, because P5 asks whether the failure was observed before it was dropped, and a standalone pipe orders its steps the same way. The real site behind row R22, effect-solutions `packages/cli/src/cli.ts:197`, logs the error with `Effect.tapError` one step before the `Effect.catch`, so it no longer reports. The R22 snippet as the table writes it, without the tap, still reports.
  - **Structural positions.** C7 is read to mean that structural members never own a ladder, not that they stop the search. C3 lists its boundaries exhaustively, and row S16 reports a continuation reached through `Effect.all` and an array callback.
  - **What counts as a read.** A non-computed member-property name (`state.cause`) and a non-shorthand object key (`{ error: true }`) spell a name without reading the parameter, so they do not count. A shorthand `{ error }` or a computed `obj[key]` does. Names inside TypeScript type syntax, such as `{ cause?: string }` or `typeof error`, read nothing at runtime; the runtime expression inside `as`, `satisfies`, or `!` still counts. A TypeScript `this` parameter is not a runtime parameter, and a plain parameter with a default is still a plain identifier.
  - **Callback-object positions.** Handler objects are recognized only at the verified overload position of each member, as the existing `catchTags` layout already did, rather than as any object argument. Generator functions are never step callbacks or handlers; non-generator object methods are.
  - **Wrappers, keys, and redefinitions.** Type assertions and parentheses around a callback or handler do not hide it, matching how `no-string-error-channel` treats `as const`. A handler-map value counts under any key, including a computed tag. For a failure handler, the last definition of the `onFailure` or `catch` property wins, and a later spread or runtime-computed key leaves the handler unknown, so the call does not report.
  - **Rule counts in the plan.** The plan's file-change row that says to build all ten contracts describes the narrowing build step, not a current rule count, so it stays. No other rule count in the plan is stated as a current fact.
- **Cross-check against the independent harness:** the harness at `/private/tmp/claude-501/-Users-mp-Projects-personal-backpressure/cb9f46b7-f8e9-4290-8e97-f30127e28448/scratchpad/effect-rules-harness/scan.ts` ran unmodified over the five roots and reproduced the analysis's counts. The built plugin ran through the root oxlint 1.58.0, with only the two rules enabled, over exactly the harness's file list: every `.ts` and `.tsx` file that is not `.d.ts`, skipping `node_modules`, `dist`, `.git`, and `build` entries, passed in chunks with `--no-ignore`. Sites were compared by file and line, using a copy of the harness that prints the inner continuation line and absolute paths.

  | Root (files) | Ladders, plugin / harness | Discards, plugin / harness |
  | --- | ---: | ---: |
  | t3code `53456bc01` (18,133) | 487 / 469 | 623 / 623 |
  | executor (1,903) | 18 / 18 | 186 / 186 |
  | effect-solutions (95) | 1 / 1 | 9 / 10 |
  | `effect/packages/effect/test` (365) | 5 / 4 | 23 / 23 |
  | `effect/ai-docs` (50) | 0 / 0 | 2 / 2 |

  - **Ladder differences, 19 sites, plugin right:** each is an expression-bodied step callback whose body is itself a data-first continuation, the S3 shape the analysis expects to report. Examples: t3code `apps/server/src/orchestration/Layers/CheckpointReactor.ts:927`, `apps/server/src/terminal/Manager.ts:2785`, `apps/server/src/git/GitManager.ts:2836`, and effect `packages/effect/test/Effect.test.ts:1218`. The harness starts its search at the body's children and never tests the body node itself. With that one line changed in a copy of the harness, the ladder results match site for site in all five roots.
  - **Discard difference, 1 site:** effect-solutions `packages/cli/src/cli.ts:197`, the standalone-pipe judgment above. The harness checks only member `.pipe` lists.
- **Review:** the Oracle's review of the diff against the analysis found three defects, each now fixed with cases. A type assertion around a callback or handler escaped both rules. A computed tag key hid a `catchTags` ladder, and the rule took an earlier, overwritten `catch` or `onFailure` property as the handler. The cross-check counts above are unchanged by the fixes.
- **Review iteration 1 (orchestrator):** four fixes landed. The read scan now skips type syntax, so `Effect.mapError((cause) => ({}) as { cause?: string })` reports. `no-flatmap-ladder` defers to `no-pipe-ladder` through the new registry edge, with combined-preset replay cases for a const initializer and a returned data-first ladder, and the opaque-continuation case now also asserts that `no-pipe-ladder` stays silent. The README and architecture counts match the manifest, and `no-pipe-ladder` is recorded as reimplemented. A reviewer finding about `as`- or `satisfies`-wrapped tap steps in the recorded-first check was declined as a shape nobody writes. After the fixes, the plugin cross-check on t3code (487 ladders, 623 discards) and executor (18 ladders, 186 discards) is unchanged site for site; no handler in either repo read its parameter only in type syntax.
- **Mutation checks:** each mutation ran alone against `rule-catalog.test.ts` on the final code and was restored from a copy, with a matching SHA-256 afterward. Removing the step-callback search boundary failed 1 test, and removing the generator boundary failed 1. Accepting any argument as a continuation failed 10. Counting a failure tap anywhere in the pipe as recorded first failed 1. Ignoring body references failed 13, and counting key and member-property spellings as reads failed 2. Not looking through type assertions failed 2, and taking the first matching handler property instead of the last failed 4. Counting names inside type syntax as reads failed 2, and dropping the `no-flatmap-ladder` ownership edge failed 3.
- **Commands (after review iteration 1):** the `check` chain without `introspection:check` passed every step through `pack:dry-run:no-build`. It ran 2,677 tests in 34 files, 44 replay suites with 470 cases and 37 corpus variants, and 405 viewer rules; the inventory reports 42 semantic-replay rows. Its closing `pnpm prose` step failed once on the wording of this section. After the wording fix, a rerun of the whole chain exited 0, `pnpm prose` passed with no alerts in 61 files, and `pnpm durable:refs` exited 0. The chain's lint step reported 0 warnings and 0 errors, `vp fmt --check` passed, and `pnpm check:effect-integration` exited 0 on the oxlint and tsc routes. `introspection:check` was left out by instruction; WI-10 records its external schema failure.
- **Refactor cycle 1:** deleted `directCallOfInlineFunction` from `utils/effect-context.ts` and its four tests, since the step-callback check no longer calls it and nothing else did; `isInlineFunction` stays. Afterward `pnpm typecheck`, lint, `vp fmt --check`, `pnpm test` (2,673 tests), `pnpm build`, and `SKIP_BUILD=true pnpm fixture:replay` (44 suites, 470 cases) all exited 0.
- **Refactor cycle 2:** `pipeArgumentList` in `utils/effect-composition.ts` dropped its `Function.pipe` namespace branch, which the static `.pipe` member check already covers, along with the now-unused `functionNamespaceNames` fact and `getStaticMemberCall` import. Afterward `pnpm typecheck`, lint, `vp fmt --check`, `pnpm test` (2,673 tests), `pnpm build`, and `SKIP_BUILD=true pnpm fixture:replay` (44 suites, 470 cases) exited 0, and the plugin cross-check gave the same sites: t3code 487 ladders and 623 discards, executor 18 and 186.
- **Commits:** none. The orchestrator commits.
- **Action items for MP:** none.
