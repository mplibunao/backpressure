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
| WI-03 | Remove obsolete runtime policies and repair ownership contracts | L | DONE (local, not pushed) | `ec4f4f8` |
| WI-04 | Narrow composition and error contracts | L | DONE (uncommitted) | |
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
