# Review: Effect rules v4 build plan, rule list and local viewer

Reviewed: `docs/exec-plans/active/effect-rules-v4-implementation-2026-09-25.md` (822 lines), limited to §3.12 and work item 11, plus every edit that removes the saved effective-config JSON files. Those edits cover the G3a/G3b split, the §3.11 interface rows, the §4 file-table rows, work items 7 and 8, V2, and the final command checklist. Spot-checks ran against the repo at branch `lint/oxlint-standards-consolidation`, the installed `oxlint@1.58.0`, `typescript@6.0.2`, `@changesets/cli@2.31.0` (with `@changesets/config@3.1.4`, `@changesets/assemble-release-plan@6.0.10`), Vale 3.14.1, and the `@effect/tsgo` checkout at `/Users/mp/references/effect-ts/tsgo`, read at the git tag `@effect/tsgo@0.45.0`.

Shorthand: `PLAN:L` = a line in the plan; `EC` = `scripts/lib/effective-config.ts`; `INV` = `scripts/checks/check-rule-inventory.ts`; `RM` = `packages/oxlint-standards/src/rule-manifest.ts`.

## Scope and givens

Applied as decided and not reopened: the four deleted artifacts (`docs/references/effective-config.json`, `docs/references/effective-config.md`, `scripts/checks/generate-effective-config.ts`, the `INV:297-319` staleness gate) and the dropped `effective-config-effect.json` with its fingerprint check; one collector rendering both the fully generated `docs/references/rules.md` (checked for staleness in `pnpm check`) and the local-only viewer; the viewer as a private, never-published `packages/rules-viewer` built on plain Bun HTML without React, run by `pnpm rules:view`, with ADR-003's two-package limit superseded for private tool packages; `pnpm check:effect-integration` outside `pnpm check`, in pull-request CI and `release:prepare`, with the patched-engine policy comparison inside the oxlint-route smoke.

## Verdict

The design is sound and the deletion is carried through the plan text consistently; no passage still requires the deleted files or the fingerprint. What blocks an engineer is the collector's home: §3.12 places it inside the viewer package while §3.11 keeps its helpers in root `scripts/lib`, and the repo's `composite` TypeScript projects reject that import direction. Four claims about the code are wrong in ways that change the collector's design (Changesets versioning of a private dependent, the severity spellings `--print-config` emits, what a preset-only config prints, and oxlint 1.58's refusal to print a config that names `effecttsgo`). The rest are unstated seams with mechanical fixes.

Counts: High 1 · Medium 7 · Low 8.

## 1. Claims about the code

### Checked, correct

- `RM:94-110` is `RuleManifestEntry` with `name`, `severity`, `collections`, and `note` (`PLAN:L471`).
- `EC:71-84` is `buildOxlintRuleCatalog`; `EC:145-161` is `materializeEffectiveRules`; `EC:203-220` is `flattenTestOverridesIntoGlobal` (`PLAN:L473`). See F3 and F4 for what those functions expose.
- `INV:297-319` is the staleness gate (`PLAN:L479` cites `:297-320`; the block ends at `:319`).
- `vite.config.ts:21-24` is the `effective-config.json` format-ignore entry (`PLAN:L479`, `L590`).
- `scripts/lib/release-contract.ts:29-44` is `releasePackages`, naming the two published packages (`PLAN:L483`).
- `oxlint --rules --format=json` on 1.58.0 returns 705 items whose keys are `category`, `default`, `docs_url`, `fix`, `scope`, `type_aware`, `value` (`PLAN:L473`).
- At tag `@effect/tsgo@0.45.0`, `_packages/tsgo/src/metadata.json` has `rules[]` with 113 entries; all 113 carry `description`, `fixable`, and `preview` (`preview.sourceText` plus `preview.diagnostics[].text`), and `docs/rules/` holds 113 kebab-named pages (`PLAN:L472`).
- `docs/references/effective-config.json` is 1,826 lines, and `docs/references/effective-config.md:8` records that `--print-config` does not enumerate JS-plugin rules (`PLAN:L465`).

### F1 (Medium): "Changesets skips private packages" is wrong for versioning; only publishing skips them

- Plan: `PLAN:L483` ("Changesets skips private packages … so the viewer never enters the release path"); `PLAN:L598` lists `.changeset/config.json` as deliberately unchanged.
- Evidence: `@changesets/config@3.1.4` defaults `privatePackages` to `{ version: true, tag: false }` (`dist/changesets-config.cjs.js:240-249`). `@changesets/should-skip-package` skips a package only when it is ignored, or private with `allowPrivatePackages` false, or has no `version`. `@changesets/assemble-release-plan@6.0.10` `getDependencyVersionRanges` rewrites `workspace:*` to the dependency's current exact version, so any bump of `@mplibunao/oxlint-standards` leaves the range; `determineDependents` then gives the dependent a `patch` release when the dependency is under `dependencies`, and `none` when it is only under `devDependencies` (`dist/changesets-assemble-release-plan.cjs.js:196-284, 291-330`). `changeset publish` and `pnpm -r publish` do skip private packages, so the second half of the sentence holds.
- Consequence: a viewer that lists `@mplibunao/oxlint-standards` under `dependencies` gets a version bump and a generated `packages/rules-viewer/CHANGELOG.md` in every Version Packages PR.
- Fix: state in §3.12 and the `packages/rules-viewer` row (`PLAN:L589`) that the viewer's workspace links (`@mplibunao/oxlint-standards`, `@mplibunao/tsconfig`) are `devDependencies`, and that the viewer has no `version` field, so `shouldSkipPackage` excludes it outright. Keep `.changeset/config.json` unchanged; `check-changesets-contract.ts:88-101` does not inspect `privatePackages`, so setting `privatePackages.version: false` is also available if a version field turns out to be required.

### F2 (Medium): `materializeEffectiveRules` does not return "the rules each composition turns on"; it returns every reported rule with `allow`/`deny`/`warn` spellings

- Plan: `PLAN:L473` ("`materializeEffectiveRules` (`:145-161`) gives the rules each composition turns on"); `PLAN:L469` ("one entry per rule that any shipped preset or config turns on").
- Evidence: `EC:145-161` returns the raw `rules` map from `--print-config` with only the `typescript/` alias normalized (`EC:134-141`). The committed artifact shows the spellings the engine emits: the distinct values across `full.global` are `allow`, `deny`, and `warn`; `base.global` has 372 rules and zero spelled `off` because disabled rules read `allow` (`"no-undef": "allow"` among them).
- Consequence: without a mapping, the page lists disabled rules as enabled and shows `deny` where the manifest and policy say `error`; the G3b comparison against the generated policy (`PLAN:L477`) has the same mismatch on the patched engine.
- Fix: add to §3.12 a normalization `deny → error`, `warn → warn`, `allow → off`, applied by the collector and by the G3b comparison, and exclude `off` rows from the turned-on set. Add a fixture test for the mapping (see F16).

### F3 (Low): `buildOxlintRuleCatalog` discards the fields the collector needs

- Plan: `PLAN:L473` (built-in rows use `category`, `fix`, `type_aware`, `docs_url`); `PLAN:L454` (`buildOxlintRuleCatalog` "stays because the inventory gate and collector use them").
- Evidence: `EC:71-84` returns `ReadonlySet<string>`; `addCatalogItem` (`EC:48-66`) reads only `scope` and `value`.
- Fix: add an exported item-level reader in `EC` (parse once, return the item records) and derive the existing set from it; the collector reads `docs_url` from the items.

### F4 (Low): `flattenTestOverridesIntoGlobal` is module-private

- Plan: `PLAN:L473` names it as a collector input.
- Evidence: `EC:203` declares `const flattenTestOverridesIntoGlobal` without `export`; its `isTestFilePattern` (`EC:183-184`) matches only the substrings `.test.ts` and `.spec.ts`, which covers `vitestConfig`'s `**/*.test.ts` override (`src/configs/vitest.ts:61`) but not the hyphen and directory forms §3.4 generates for the Effect test scope. The Effect test scope only affects tsgo rows, whose test severities come from the generated policy, so the limit is harmless today.
- Fix: export it, and state in §3.12 that the print-config test view covers `vitestConfig` only while tsgo test scopes come from the policy.

## 2. Contradictions and leftovers

### F5 (High): the collector's home contradicts §3.11, and the viewer cannot import root `scripts/lib` under the repo's `composite` projects

- Plan: `PLAN:L481` ("The collector and the markdown renderer live in this package and are exported for the root `gen:rules-page` script through a workspace dependency"); `PLAN:L455` (`collectRules()` "new, `packages/rules-viewer`"); `PLAN:L454` (`buildOxlintRuleCatalog`, `materializeEffectiveRules`, `isConfiguredRuleKnown`, and `configuredRuleEntries` "stay because the inventory gate and collector use them" in `scripts/lib/effective-config.ts`); `PLAN:L565` keeps `EC` in root `scripts/lib`.
- Evidence: every inherited tsconfig is `composite: true` (`tsconfig.base.json:4`). A composite project that imports a file outside its `include` fails with TS6307 ("Projects must list all files or use an 'include' pattern"), and with TS6059 as well when `rootDir` is set; reproduced with the repo's `tsc` 6.0.2 on a two-directory fixture. The repo already works around exactly this: `tsconfig.scripts.json:8-12` lists `packages/oxlint-standards/src/rule-manifest.ts` and `rule-messages.ts` by hand so root scripts can import them. The other collector inputs cross the same boundary: `ruleMessage` is not exported from the package root (`packages/oxlint-standards/src/index.ts:1-42`), `src/generated/tsgo-policy.ts` is not named as a root export anywhere in §3.2 or §3.3, the metadata snapshot lives at root `scripts/references/tsgo/<version>/metadata.json` (`PLAN:L72`), and the oxlint binary path is `scripts/packages/oxlint-standards/package.ts:9` (`node_modules/.bin/oxlint` under `repoRoot`). Lint does not block any of this (see "Checked, no finding"); typecheck does.
- Fix: put `collectRules()` and the markdown renderer in root `scripts/lib/rules-collector.ts`, next to the helpers they reuse. That project already includes the manifest and message sources (`tsconfig.scripts.json:8-12`) and resolves `oxlintBin`, `buildOxlintStandards`, and `repoRoot` without extra wiring. `scripts/checks/generate-rules-page.ts` imports it directly. The viewer package holds only the Bun server entry and the page; its server imports the collector by relative path and its tsconfig lists that file (and its transitive `scripts/lib` imports) in `include`, matching the `tsconfig.scripts.json` precedent. Rewrite `PLAN:L455`, `L481`, `L589`, and the work item 11 done-when to that shape; the DECIDED "one collector" still holds. The alternative, moving `EC`'s helpers into the viewer and making `INV` depend on `@mplibunao/rules-viewer`, inverts the layering (a `pnpm check` gate depending on a private tool package) and is not recommended. Either way, `rules-page:check` in `pnpm check` runs with `SKIP_BUILD=true` like `inventory:rules` (`package.json:11`).

### F6 (Low): leftover names and comments from the removed artifact

- `PLAN:L376`: G3's heading still reads "pinned policy and effective-config drift".
- `PLAN:L742`: V2's title still reads "effective-config expansion".
- `PLAN:L568`: the harness row's order column says "Before G6 and G3 live artifact"; G3b no longer produces an artifact.
- `PLAN:L60`: "`pnpm check` keeps only the cheap, offline parts: the read-only policy staleness check (`effect-policy:check`) and the in-repo config-shape tests" omits `rules-page:check`, which `PLAN:L752` wires into `pnpm check`.
- Code comments that work item 11's "no doc links to them" (`PLAN:L704`) does not reach: `RM:417` ("work item 6 owns the generated effective-config view") and `src/configs/drift-guards.test.ts:391` (names `flattenTestOverridesIntoGlobal in scripts/lib/effective-config.ts`, which stays true only if F5's placement keeps the helper there).
- Fix: rename G3 to "pinned policy and rules-page drift" and V2 to "compiled plugin replay and rules-page check"; change the harness row to "Before G6"; add `rules-page:check` to `L60`; add `RM:417` to the manifest row (`PLAN:L520`) and the drift-guards comment to work item 11's key files.

### F7 (Low): the `vp fmt` conditional is already resolved

- Plan: `PLAN:L479` ("If `vp fmt` formats markdown, the generator emits formatter-stable output or the page joins the existing format-ignore list"); `PLAN:L590` ("add `rules.md` only if the formatter rewrites it").
- Evidence: `vite.config.ts:11` lists `**/*.md` in `toolIgnorePatterns`, which both `fmt` and `lint` consume (`:29`, `:38-40`).
- Fix: delete both conditionals and reduce the `vite.config.ts` row to dropping the `effective-config.json` entry.

## 3. Seams §3.12 leaves unspecified

### F8 (Medium): nothing typechecks `packages/rules-viewer`, and its inputs need three decisions

- Plan: `PLAN:L483` ("Its TypeScript uses `@mplibunao/tsconfig`'s browser config for the page and the server config for the Bun entry"); `PLAN:L589`.
- Evidence: `pnpm typecheck` is `tsc -b --noEmit` on `tsconfig.json`, whose references are only `./packages/oxlint-standards` and `./tsconfig.scripts.json` (`tsconfig.json:3`); a new package is invisible until referenced. `@mplibunao/tsconfig/base.json` sets neither `composite` nor a `tsBuildInfoFile` (`packages/tsconfig/base.json:1-27`), both required for a referenced project; `packages/oxlint-standards/tsconfig.json:3-9` shows the shape. `server.json` sets `types: ["bun-types"]` (`packages/tsconfig/server.json:6`); `bun-types` is absent from `node_modules/.pnpm` and from the catalog, and `catalogMode: strict` (`pnpm-workspace.yaml:17`) requires a catalog entry (`bun-types@1.3.11` was published 2026-03-18, clear of the seven-day `minimumReleaseAge`). A static `import … from '@mplibunao/oxlint-standards'` resolves through `exports` to `dist/index.d.ts` (`packages/oxlint-standards/package.json:18-23`); today no typechecked file imports the built package, so `pnpm typecheck` needs no prior build, and this change would make it need one.
- Fix: state in §3.12 that the viewer ships two composite tsconfigs (`tsconfig.json` extending `@mplibunao/tsconfig/server.json` for `src/server.ts`; `tsconfig.browser.json` extending `browser.json` for the page script) with `composite: true`, `tsBuildInfoFile` under `.tsbuildinfo/`, and distinct `include`s; both are added to the root `references`; `bun-types` joins the catalog and the viewer's `devDependencies`; and either the viewer maps `@mplibunao/oxlint-standards` to `../oxlint-standards/src/index.ts` through `paths` plus a project reference (typecheck stays build-free) or the plan records that `pnpm typecheck` now requires `pnpm build` first, which `pnpm check` already orders (`package.json:11`).

### F9 (Medium): a preset-only config prints oxlint's default rule set, so "each preset that turns it on" over-attributes

- Plan: `PLAN:L469`, `L475` (rows record "each preset or config that turns it on").
- Evidence: the four presets are `{ jsPlugins, rules }` with no `categories` (`src/presets/shared.ts:11-14`, `:35-38`), and `--print-config` on a config that sets only `rules` returns 108 rules from oxlint's defaults (`no-debugger: warn`, and so on) on 1.58.0. The existing artifact avoids this by capturing only `baseConfig` alone and `baseConfig + vitestConfig + nodeRuntimeConfig` (`EC:222-240`; `docs/references/effective-config.md:5-6`), where `baseConfig` sets every category explicitly (`src/configs/base.ts:13-20`).
- Fix: define built-in rows per documented composition, not per fragment: `baseConfig`, `baseConfig + vitestConfig + nodeRuntimeConfig`, and the root-style composition the README recommends; attribute each preset's native carve-outs (`no-shadow`, `require-yield`, `no-nested-ternary`) from `configuredRuleEntries` (`EC:263-282`), never from print-config. Name the composition list in §3.12 and in work item 11's done-when.

### F10 (Medium): root oxlint cannot print any config that names `effecttsgo`, and there is no AST-only Effect fragment to print

- Plan: `PLAN:L475` ("it computes built-in and package rows from each composition without the tsgo fragment, which root oxlint cannot load").
- Evidence: on 1.58.0, `--print-config` exits 1 with "Unknown plugin: 'effecttsgo'" for `plugins: ["effecttsgo"]` and with "Plugin 'effecttsgo' not found" for a bare `effecttsgo/*` rule key without the plugin. After work item 6 the exported `effectPreset` is the composed object (`PLAN:L157`), and no pre-composition custom fragment is exported.
- Fix: F9's shape resolves this: presets never go through print-config, so the Effect preset's package rows come from the manifest and its native carve-outs from `configuredRuleEntries`. If any composition containing `effectPreset` must still be printed, §3.12 must say what the collector strips before materializing: the `effecttsgo` plugin entry, `options.typeAware`, every `effecttsgo/` key in `rules`, and every `effecttsgo/` key in `overrides[].rules`.

### F11 (Medium): the server smoke cannot run in-process under vitest

- Plan: `PLAN:L589` ("a smoke starts the server and checks that both `/rules.json` and `/` respond"); `PLAN:L704` ("its unit tests and server smoke pass").
- Evidence: `pnpm test` is `vitest run` (`package.json:36`) on Node (`vitest/4.1.2 … node-v24.21.0`); `Bun.serve` and the `.html` import do not exist there, and vitest's `include: ['packages/**/*.test.ts', …]` (`vite.config.ts:71`) will pick up every viewer test automatically.
- Fix: state that collector and renderer unit tests run under vitest and must not import the server entry. The smoke spawns `bun packages/rules-viewer/src/server.ts` on an ephemeral port from a vitest test (or from a `scripts/packages/rules-viewer/smoke.ts` invoked by `pnpm check`). It polls `/rules.json` and `/`, then stops the process in `finally`.

### F12 (Low): the Vale exemption mechanism is unnamed

- Plan: `PLAN:L479` ("`.vale.ini` excludes `docs/references/rules.md`"); `PLAN:L505`.
- Evidence: `.vale.ini` has no exclude directive (`.vale.ini:1-17`). Two mechanisms verified with Vale 3.14.1: a per-file section `[docs/references/rules.md]` with an empty `BasedOnStyles` yields no alerts at `--minAlertLevel=suggestion`, and `--glob='!docs/references/rules.md'` in `scripts/prose-files.sh` checks zero files for that path. The pre-commit hook runs the same script for staged markdown (`vite.config.ts:66`), so either mechanism covers commits too.
- Fix: name the per-file section form in §3.12 and the `L505` row, since it keeps `.vale.ini` enforcement-only and `prose-files.sh` unchanged.

### F13 (Low): the viewer's `package.json` contract is unstated

- Plan: `PLAN:L589`, `L704`.
- Evidence: `pnpm build` and the `pack:dry-run` steps of `pnpm check` are `pnpm -r --if-present …` (`package.json:8, 11, 25`), so they touch the viewer only if it defines those scripts. `scripts/check-durable-work-item-refs.sh:8-10` scans `packages` and `docs` for `WI-NN` labels, so the viewer README and the generated page must not carry them.
- Fix: state that the viewer defines no `build`, `pack:dry-run`, or `pack:dry-run:no-build` scripts, that `rules:view` is a root script running `bun packages/rules-viewer/src/server.ts` after `buildOxlintStandards()`, and that the generated page's fixed header names the command without work-item labels.

## 4. Work-item dependencies and verification

### F14 (Medium): work item 8 and work item 7 depend on work item 11 without saying so

- Plan: `PLAN:L714` (work item 8 done-when requires `gen:rules-page`) versus `L718` (dependencies: "work item 7 and available referenced app checkouts"); `PLAN:L376` (G3a includes `rules-page:check`) versus `L694` (work item 7 done-when: "G1/G3a/G4/G5 run in normal tests/checks") and `L708` (work item 11 "runs alongside work item 7 and work item 8"); `L696` and `L706` both list `check-rule-inventory.ts` and root scripts, and work item 7's "both generators" (`L696`) no longer names which two.
- Fix: add work item 11 to work item 8's dependencies; order work item 11 before work item 7's gate wiring (work item 11 removes the `INV:297-319` gate and adds `rules-page:check`; work item 7 then wires `effect-policy:check`), or state that work item 7 closes only after work item 11's check exists; replace "both generators" with `generate-effect-policy.ts` and `generate-rules-page.ts`.

### F15 (Low): a human acceptance step sits inside work item 11's done-when

- Plan: `PLAN:L704` ("MP opens the page in a browser and confirms it is usable"); work item 9 and work item 10 depend on work item 11 (`L708`, `L728`).
- Fix: keep the automated done-when as the gate for work item 9; record MP's acceptance as a ledger entry that can land after work item 9 starts.

### F16 (Low): missing verification for the collector's two translation steps

- Plan: `PLAN:L589` (unit tests cover "source merging, excluded dropped rows, and a golden markdown render").
- Evidence: nothing asserts the `deny/allow/warn` mapping (F2) or that built-in attribution excludes oxlint's defaults (F9); a golden render passes as long as it is regenerated from the same wrong output.
- Fix: add a fixture test that feeds a hand-written print-config map through the collector and asserts `error/off/warn` plus the exclusion of `off`; add a control that a preset-only composition contributes no built-in rows.

## Checked, no finding

- Lint: `vp lint` has no include list and only `toolIgnorePatterns` (`vite.config.ts:10-25`), so `packages/rules-viewer/**/*.ts` is linted automatically. `no-cross-package-relative-imports` belongs to `boundariesPreset` only (`RM:1781-1795`), which the root config does not compose (`vite.config.ts:34-37`); even where active, `workspacePackageRoot` (`src/rule-catalog.ts:1795-1806`) returns null for root `scripts/` because no `packages` marker sits above the root `package.json`. `import/no-relative-parent-imports` is off outside `packages/oxlint-standards/src/**` (`vite.config.ts:41-56`). Rules the viewer code will meet: `no-console`, `import/no-default-export`, and `max-statements` at 10, all `deny` in the committed artifact.
- Prose: `scripts/prose-files.sh:6-11` checks `packages/*/README.md` and `docs`, so the viewer README is covered automatically and the generated page needs the F12 exemption.
- Release assumptions: `check-changesets-release-state.ts:83-86` and `check-changesets-contract.ts:37-39, 65-73` iterate `releasePackages` only; `version-pins.ts:15-18, 249-258` checks workflow and engine pins only; `stryker.config.mjs:42` mutates `packages/oxlint-standards/src/**` only; `pnpm -r publish --dry-run --no-git-checks` and `changeset publish` skip private packages.
- Tests: vitest's include covers the viewer's `*.test.ts` files with no config change (F11 governs what those tests may import).
- Plan text: no remaining passage requires `effective-config.json`, `effective-config-effect.json`, or a fingerprint check; G2's "config fingerprint" (`PLAN:L372`, `L752`) is app-audit evidence, unrelated to the dropped file.
