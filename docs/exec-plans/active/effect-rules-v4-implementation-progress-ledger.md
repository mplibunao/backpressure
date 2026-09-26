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
| WI-01 | Record ownership and initialize the execution ledger | S | DONE (local, not pushed) | `15fce6c` |
| WI-02 | Establish pinned inputs and the isolated toolchain foundation | L | DONE (local, not pushed); Renovate app activation waits on MP | `c863fa5` |
| WI-03 | Remove obsolete runtime policies and repair ownership contracts | L | DONE (uncommitted) | |
| WI-04 | Narrow composition and error contracts | L | PENDING | |
| WI-05 | Retarget v4 APIs and finish the remaining narrowings and messages | L | PENDING | |
| WI-06 | Activate the full Effect config and both package surfaces | L | PENDING | |
| WI-11 | Rule list with its generated page and local viewer | M | PENDING | |
| WI-07 | Install all six durable gates | L | PENDING | |
| WI-08 | Measure the two apps and finalize conditional delegation | M | PENDING | |
| WI-09 | Complete consumer guidance, records, and changesets | M | PENDING | |
| WI-10 | Run acceptance and classify the remaining blocker accurately | S | PENDING | |

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
