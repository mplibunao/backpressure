# Bun Runtime Migration for backpressure: Plan

## Goal

Align backpressure with MP's standard JavaScript stack (Bun as the script
runtime, pnpm for installs, Vitest for tests) by moving repo-authored
TypeScript scripts off Node's native type-stripping execution onto Bun. Keep
pnpm, Vitest, `tsc`, changesets, and Stryker working exactly as they do today.
A secondary goal is to record an explicit canon default in taste-distillery so
future repos do not drift back to Node-on-TypeScript again.

Dropping the `yaml` dependency is an explicit **non-goal** (see Background:
Bun's built-in YAML is weaker on duplicate-key detection than the dedicated
library, and a contract test depends on that strictness).

## Background

Curated findings from the Phase 2 probes (in-workspace blast radius, external
Bun facts, and taste-distillery + backpressure canon). File references use
`file:line`.

### Current runtime posture

- Repo-authored scripts run as `node scripts/.../*.ts`, relying on Node's
  native TypeScript type-stripping. Every runnable gate script carries a
  `#!/usr/bin/env node` shebang: `scripts/checks/check-release-workflow.ts:1`,
  `check-changesets-contract.ts:1`, `check-npm-publish-client.ts:1`,
  `check-version-pins.ts:1`, `fixture-replay.ts:1`, `check-rule-inventory.ts:1`,
  `check-changesets-release-state.ts:1`.
- No `tsx` / `ts-node` / `vite-node` runner is wired; Node executes the `.ts`
  files directly (`package.json` scripts; `package.json:38-48` dev deps).
- Versions are pinned in `mise.toml:2` (`node = "24.15.0"`) and
  `package.json:50-52` (`engines.node >=22.18.0`, `packageManager pnpm@11.4.0`).
- Shared script helpers import Node built-ins and `spawnSync`:
  `scripts/lib/script-runtime.ts:1-5`, `:60-78`.

### `yaml` dependency blast radius (narrow)

- Exactly **one** repo-authored consumer: `scripts/checks/check-release-workflow.ts:5`
  imports `parseDocument` from `yaml`.
- API surface used: `parseDocument(workflow, { uniqueKeys: true })`
  (`:73`), `document.errors` plus each error's `.message` (`:74-75`),
  `document.toJS()` (`:79`).
- A contract test asserts duplicate-key rejection:
  `scripts/checks/check-release-workflow.test.ts:413-417` expects the parse to
fail with `release workflow YAML must parse without duplicate keys`.
- `yaml` is declared/pinned at `package.json:48` and `pnpm-workspace.yaml:15`
  but imported nowhere else.

### Node-assuming tooling surface (stays as-is)

These are invoked as package binaries through pnpm scripts, so they keep
launching under their own Node shebangs unless explicitly forced with
`bun run --bun`. The migration does not need to move them onto Bun:

- Vitest: `package.json` `test` script; `vite.config.ts:75-78` test include.
- vite-plus (`vp`): `vite.config.ts:1`; lint/fmt/staged/test config at
  `vite.config.ts:14-80`; `.vite-hooks/pre-commit:1`, `.vite-hooks/commit-msg:1`.
  MP confirms `vp` runs under Bun in other repos.
- Stryker mutation testing: `stryker.config.mjs:59-62` (`packageManager: pnpm`,
  `testRunner: vitest`). Not part of the `check` gate; separate `test:mutation`.
- `tsc -b`: `package.json` `typecheck`. Bun does not typecheck, so `tsc` stays.
- changesets: `release` / `version-packages` scripts; `.changeset/config.json`;
  `.github/workflows/release.yml:48-51` (`changesets/action@v1`).
- pnpm / Corepack: `pnpm-workspace.yaml`; CI `pnpm install --frozen-lockfile`.

### CI / release install model (decides how Bun reaches the runner)

- Both workflows already run `jdx/mise-action@v3` with `install: true`
  (`ci.yml:20-24`, `release.yml:25-29`). It installs and activates every tool
  pinned in `mise.toml` (today `node` and `vale`) on the job PATH for all later
Adding `bun` to `mise.toml` installs Bun in CI and release
  with **no `setup-bun` step needed**.
- `actions/setup-node@v6` stays for its pnpm cache integration (`cache: pnpm`)
  and, in release, the npm registry auth used by provenance publishing
  (`registry-url`, `NPM_CONFIG_PROVENANCE`; `release.yml:37-57`). Bun needs
  neither, so it gets no analogous action.
- pnpm keeps owning installs and the workspace graph. Do not run
  `bun install` in a pnpm workspace, or Bun migrates `pnpm-lock.yaml` into its
  own lockfile.

### External Bun facts (verified where it mattered)

- `Bun.YAML.parse(text)` is a global (no import). **Duplicate keys silently
  last-win with no error** (probed on Bun 1.3.11: `a: 1\na: 2` parses to
  `{"a":2}`; a duplicated nested `push:` keeps only the last). Malformed YAML
  throws `SyntaxError`. No `document.errors`-style array exists.
  Conclusion: `Bun.YAML` cannot replace `parseDocument(..., {uniqueKeys:true})`
for rejecting duplicate keys.
- Bun targets Node compatibility (~95% of Node-API; tracks Node v23 APIs), runs
  TypeScript natively, and supports `node:` imports and `child_process`.
- Stryker GitHub issues #4439 and #5424 are feature requests to add a Bun
  **test runner** (bun test) to Stryker, not bugs about running Stryker under
  the Bun runtime. They do not apply: backpressure drives Stryker with the
  supported `@stryker-mutator/vitest-runner`.

### Canon (taste-distillery + backpressure ADRs)

- No settled canon picks Node vs Bun vs Deno as the runtime; choosing one today
  would be inference, not a recorded decision.
- TD-CARD-005 pnpm 11 workspace baseline:
  `taste-distillery/cards/package-management/pnpm-11-workspace-baseline.md:27`
  (pnpm 11 for Node package-manager surfaces).
- TD-CARD-010 Vitest default runner:
  `taste-distillery/cards/testing/vitest-default-runner.md:27,39` (Vitest is the
  default; Bun-native test is a deliberate opt-out only).
- TD-CARD-007 vite-plus check front door:
  `taste-distillery/cards/tooling/vite-plus-check-front-door.md` (route local,
  CI, and agent checks through one named command).
- ADR-002 stack and harness: `backpressure/docs/decisions/002-stack-and-harness.md:12`.
- ADR-005 repo script language (TypeScript by default):
  `backpressure/docs/decisions/005-repo-script-language.md:12`.
- Dependency-vs-library canon (supports keeping `yaml`): ADR-004
  `backpressure/docs/decisions/004-rule-curation-and-severity-posture.md:16,20,26`
  (delegate already-covered work to maintained tools instead of reimplementing
  it); ADR-001 `001-effect-preset-posture.md:12,16`.
- TD-CARD-004 Go stdlib glue:
  `taste-distillery/cards/tooling/go-stdlib-glue-for-local-tools.md:29,33`
  (low-dependency stdlib preference, scoped to Go repo-local glue before a
  TypeScript workspace exists).

### MP context

MP already runs Bun runtime + pnpm installs + Vitest across most personal
projects. backpressure is the outlier that adopted Node's TypeScript support,
which MP now wants to undo. This migration reduces divergence from MP's
de-facto standard rather than introducing a new stack.

## Approach

A targeted, runtime-only hard cutover. Do not refactor script internals, do not
replace `yaml`, do not run `bun install`, and do not force package binaries
(Vitest, Stryker, `tsc`, changesets) through Bun. The selected context confirms
the script helpers already use Bun-compatible `node:` APIs, so the change is a
launch-runtime swap, not an architecture change.

Concrete changes:

1. Pin Bun as a first-class runtime (`mise.toml` + `engines.bun`). The existing
   `mise-action` step installs it in both CI and release, so no `setup-bun`
   action is added.
2. Teach `version-pins.ts` the Bun pin so `mise.toml` and `engines.bun` cannot drift.
3. Switch repo-authored `node scripts/.../*.ts` invocations to `bun`, flip the
   runnable shebangs to `#!/usr/bin/env bun`, and update the executable contracts
   that hard-code those command strings. The package-script flip and the contract
   update are one atomic change (see Item 3).
4. Keep `yaml` and its duplicate-key test untouched.
5. Update the repo's docs/ADRs to record Bun as the authored-script runtime.
6. After the migration is green, run the mutation-orchestrator skill over the
   migration-touched logic to confirm mutation testing survives the runtime
   change and to harden the new pin-validation tests.
7. Capture the canon in taste-distillery as an additive, runtime-only card plus
   baseline, reconciled with the pnpm, Vitest, front-door, and Go-glue cards.

Bun pin value is resolved in Decisions: pin the exact Bun installed when the work
lands, once `pnpm check` is green (baseline `1.3.11`).

## Work Items

Ordering note: Bun is pinned first (Item 1) so the runner has it before any
script requires it. The package-script flip and the contract update (Item 3)
**must land in one commit**: `check-changesets-contract.ts` asserts the exact
`changesets:check` command string, so any split leaves the gate red in both
orders. Each item lists task-specific verification because `pnpm check` is the
repo's front door.

### Item 1: Pin Bun as a first-class runtime
- **Goal:** Bun is available and version-controlled before any script requires it,
  and reaches CI/release through the existing mise-action step.
- **Done when:** `mise.toml` has an exact `bun` pin; `package.json.engines.bun`
  matches it; `packageManager` stays `pnpm@11.4.0`; no `setup-bun` step is added;
  no Bun lockfile or install artifact is introduced.
- **Key files:** `mise.toml`, `package.json`.
- **Dependencies:** none.
- **Size:** Small.
- **Verification:** `mise install`; `bun --version` matches the pin; confirm no
  `bun.lock`/`bun.lockb` appears and `pnpm install --frozen-lockfile` still uses
  `pnpm-lock.yaml`. (CI proof comes in Item 6 when the gate runs `bun` scripts on
  a runner whose only Bun source is mise-action.)

### Item 2: Extend version-pin checks for Bun
- **Goal:** make Bun pin drift mechanically visible without inventing a
  workflow-step check that does not exist.
- **Done when:** `version-pins.ts` reads `bun` from `mise.toml` as canonical and
  asserts `package.json.engines.bun` equals it. No setup-bun workflow assertion is
  added (there is no such step; mise-action is the install path). Node and pnpm
  checks are unchanged.
- **Key files:** `scripts/lib/version-pins.ts`, `scripts/checks/check-version-pins.ts`,
  `scripts/checks/check-version-pins.test.ts` if a pin-parser test pattern exists.
- **Dependencies:** Item 1.
- **Size:** Small to medium.
- **Verification:** `pnpm versions:check`. As a negative check, skew
  `engines.bun` from the mise pin, confirm the checker reports the mismatch, then restore the pin.

### Item 3: Switch authored scripts to Bun and update contracts (ATOMIC)
- **Goal:** flip every repo-authored TypeScript entrypoint to `bun` and keep the
  executable contracts that hard-code those strings aligned, in one commit.
- **Done when:** all of the following land together:
  - The package.json scripts that directly run a `.ts` file use `bun`. The full
    set is **9 standalone keys**: `changesets:check`, `fixture:replay`,
    `inventory:rules`, `oxlint:package:allowlist`, `check-release-workflow`,
    `smoke:oxlint-packed-consumer`, `versions:check`, `tsconfig:package:allowlist`,
    `smoke:tsconfig-packed-consumer`; **plus the 2 `node` calls embedded in the
    `release:prepare` chain**: `check-npm-publish-client.ts` and
    `check-changesets-release-state.ts`. (The `pnpm`-prefixed calls inside
    `release:prepare` are flipped at their own keys, not inside the chain.)
  - Package binaries stay unchanged: `test` (`vitest run`), `typecheck`
    (`tsc -b`), `test:mutation` (`stryker run`), `changeset`, `version-packages`,
    `lint`/`fmt`/`staged`/other `vp` commands, recursive pnpm commands.
  - `check-changesets-contract.ts` expected script strings use `bun`.
  - `release-contract.ts` release-preparation command constants use `bun`.
  - Any exact expected command string in `check-release-workflow.test.ts` (and
    any changesets-contract test) is updated to match.
- **Key files:** `package.json`, `scripts/checks/check-changesets-contract.ts`,
  `scripts/lib/release-contract.ts`, `scripts/checks/check-release-workflow.test.ts`.
- **Dependencies:** Item 1. Do not split into separate commits.
- **Size:** Medium.
- **Verification:** before/after command-surface checklist (every direct
  `node scripts/**/*.ts` flipped; no package binary wrapped in `bun run --bun`);
  run `pnpm versions:check`, `pnpm changesets:check`, `pnpm check-release-workflow`,
  and the release-workflow contract test (the duplicate-key case must still pass).

### Item 4: Flip runnable shebangs to Bun
- **Goal:** make direct executable invocation match the runtime.
- **Done when:** every runnable gate script's `#!/usr/bin/env node` becomes
  `#!/usr/bin/env bun`; library-only files get no shebang.
- **Key files:** runnable `scripts/checks/*.ts` and `scripts/packages/*/*.ts`.
- **Dependencies:** Item 1.
- **Size:** Small.
- **Verification:** search proves no `#!/usr/bin/env node` remains in
  `scripts/**/*.ts` and all runnable entrypoints carry the Bun shebang.

### Item 5: Update backpressure docs and ADRs
- **Goal:** record the new runtime so future agents do not re-infer Node-on-TS.
- **Done when:** the active plan records the resolved choices; `CLAUDE.md` tooling
  posture names Bun as the authored-script runtime (and notes mise installs it);
  ADR-005 (owner of repo-script language) is updated, with a one-line consequence
  note in ADR-002 only if the stack summary needs it.
- **Key files:** this plan, `CLAUDE.md`, `docs/decisions/005-repo-script-language.md`,
  optionally `docs/decisions/002-stack-and-harness.md`,
  `docs/references/release-readiness.md` if release gate text needs updating.
- **Dependencies:** Items 1-4.
- **Size:** Medium.
- **Verification:** `pnpm prose`; confirm no doc still says authored TS runs under Node.

### Item 6: Full backpressure validation
- **Goal:** prove behavior is unchanged except for the authored-script runtime,
  including that mise-action alone puts `bun` on PATH for the gate and release.
- **Done when:** all required local gates pass and the CI/release Bun source is proven.
- **Key files:** none (no edits).
- **Dependencies:** Items 1-5.
- **Size:** Medium to large (smokes and pack dry-runs do real packaging).
- **Verification:** run `pnpm versions:check`, `pnpm changesets:check`,
  `pnpm check-release-workflow`, the release-workflow contract test (incl. the
  duplicate-key case proving `yaml` strictness survives),
  `pnpm oxlint:package:allowlist`, `pnpm tsconfig:package:allowlist`,
  `pnpm smoke:oxlint-packed-consumer`, `pnpm smoke:tsconfig-packed-consumer`,
  `pnpm release:prepare`, `pnpm check`, and `git diff --check`. On CI, confirm the
  `pnpm check` job succeeds with no `setup-bun` step (mise-action is the only Bun
  source), and confirm `bun` is on PATH for the `changesets/action` step in release
  (the `pnpm release` path runs authored Bun scripts).

### Item 7: Verify mutation testing and harden the new pin logic
- **Goal:** confirm the Stryker plus vitest-runner toolchain still produces a
  score after the runtime change, and strengthen tests for the only code the
  migration makes behaviorally new.
- **Done when:**
  - Health check: a single-file run
    (`STRYKER_MUTATE=<one small package file> pnpm test:mutation`) reports a
    score under the migrated setup, proving the runtime change did not break
    mutation. Stryker stays Node-invoked, so this should pass.
  - The mutation-orchestrator skill runs over the scope below with workers
    strengthening tests for non-equivalent survivors, baseline and final
    `pnpm check` green, and a combined report saved under
    `docs/reports/mutation/` with a dated, scoped name.
- **Scope (priority order):**
  1. `scripts/lib/version-pins.ts` is the primary target. It is the one file
     that gains new behavioral logic (the Bun pin read and `engines.bun`
     cross-check from Items 1 and 2), so it carries the highest risk of weak or
     missing assertions.
  2. A small `packages/oxlint-standards/src` helper as the toolchain health
     check (already inside the skill's edit surface, so no skill change).
- **Out of scope:** the `node` to `bun` string edits in
  `check-changesets-contract.ts` and `release-contract.ts`, plus the shebang
  flips, are constant changes whose mutants are equivalent or trivial under the
  mutation policy. A mutation pass on them adds no value.
- **Scope widening (decided):** `version-pins.ts` lives in `scripts/`, so this
  item widens the v0 mutation scope from package rule logic to gate-script
  logic. As part of the work, extend the allowed worker edit surface in
  `docs/references/mutation-testing.md` to include
  `scripts/checks/check-version-pins.test.ts` so the worker can strengthen its
  tests. Keep the widening minimal: add only the version-pins test file, not a
  blanket `scripts/**` rule, so the surface stays intentional.
- **Orchestrator inputs:** `scope` is the files above. The orchestrator asks for
  the worker `agent` tier at run time; leave that choice to whoever runs this item. `target_score` 80 and `max_iterations` 3 are the defaults.
- **Key files:** `.claude/skills/mutation-orchestrator/SKILL.md`,
  `.claude/skills/mutation-worker/SKILL.md`, `scripts/lib/version-pins.ts`,
  `scripts/checks/check-version-pins.test.ts` (may be new),
  `docs/references/mutation-testing.md`, `stryker.config.mjs` (read-only),
  `docs/reports/mutation/`.
- **Dependencies:** Item 6. The orchestrator aborts on a dirty tree and needs a
  green baseline, so the migration must be complete and validated first.
- **Size:** Small to medium (`version-pins.ts` is about 160 lines, a 5 to 15
  minute run, plus any new test authoring).
- **Verification:** the combined report shows `version-pins.ts` at or above the
  target score, or documents only equivalent and trivial survivors; `pnpm check`
  is green before and after; `git status --short` is clean except for
  allowed-surface test edits.

### Item 8: Capture taste-distillery Bun canon
- **Goal:** make "Bun runtime + pnpm + Vitest" an accepted default so future TS
  repos do not drift back to Node-native TS execution.
- **Done when:** a new accepted, runtime-only card plus baseline state that Bun is
  the default runtime for authored TS scripts in a TS workspace, while pnpm still
  owns installs/workspace, Vitest stays the default runner, `tsc` stays the
  typecheck gate, and `bun test` stays a deliberate leaf-tool opt-out. The card
  reconciles with TD-CARD-004 explicitly: Go stdlib glue stays the default before a
  TS workspace exists, and the Bun card applies only once the repo already has a TS
  workspace or shares TS types/packages/domain logic, so a tiny repo-local script
  is not pushed into a TypeScript+Bun workspace.
- **Key files:** new `cards/tooling/bun-runtime-for-typescript-scripts.md`
  (next id after the current index, candidate `TD-CARD-035`), new
  `baselines/tooling/bun-runtime-pnpm-vitest.md`, `cards/index.md`,
  `baselines/index.md`; possibly the pnpm and testing baselines for composition notes.
- **Dependencies:** can proceed once the backpressure runtime design is settled;
  does not need to wait for Items 6 and 7.
- **Size:** Medium.
- **Verification:** `just docs` (and `just docs-fix` if tags need generating),
  `just prose`, `just check`; source-of-truth review confirming the Bun card owns
  runtime only and does not restate TD-CARD-005 (pnpm), TD-CARD-010 (Vitest),
  TD-CARD-007 (front door), or TD-CARD-004 (Go glue).

## Risks

- **Release breakage:** the release job must have `bun` on PATH because
  `pnpm release` runs Bun-backed scripts. Mitigation: mise-action installs the
  pinned Bun in the release job (Item 1); Item 6 verifies `bun` is available for
  the `changesets/action` step and that `pnpm release:prepare` succeeds.
- **Silent YAML regression:** Bun YAML must not replace `yaml`. Mitigation: keep
  the dependency and the duplicate-key test; verified in Items 3 and 6.
- **Pin drift:** CI/release diverging from local Bun, or `engines.bun` drifting
  from the mise pin. Mitigation: Item 2.
- **Package-manager drift:** stray Bun install artifacts. Mitigation: never run
  `bun install`; verify no Bun lockfile appears (Item 1).
- **Canon duplication:** the new card restating pnpm/Vitest policy. Mitigation:
  keep it runtime-only and link the existing cards (Item 8).
- **Mutation under the migrated runtime:** Stryker stays Node-invoked, so the
  runtime change should not affect it; the Item 7 health check confirms
  `pnpm test:mutation` still produces a score.

## Decisions (resolved at mid-flow)

1. **Canon in this slice.** Item 8 (taste-distillery card + baseline) lands with
   the backpressure migration, reconciled so the new Bun card owns runtime only
   and does not restate the pnpm, Vitest, front-door, or Go-glue cards.
2. **Vitest stays Node-launched.** `test: vitest run` is unchanged. This is safe
   because authored scripts deliberately avoid Bun-only globals (we keep the
   `yaml` library, not `Bun.YAML`), so the test code is runtime-agnostic. Bun's
    native `bun test` runner is explicitly out of scope
   TD-CARD-010, which keeps Vitest the default).
Pin the exact Bun version installed when the work lands, once
   `pnpm check` passes on it (baseline `1.3.11`, the probed version), enforced
   across `mise.toml` and `engines.bun` by `version-pins.ts`.

## References

- Stryker bun-test-runner requests (not applicable): https://github.com/stryker-mutator/stryker-js/issues/4439, https://github.com/stryker-mutator/stryker-js/issues/5424
- Bun runtime / Node compat: https://bun.com/docs/runtime , https://bun.sh/docs/runtime/nodejs-compat
- Bun TypeScript (use `tsc` for typecheck): https://bun.sh/docs/ecosystem/typescript
- mise-action (installs pinned tools in CI): https://github.com/jdx/mise-action
- Canon and ADR file references inline in Background above.
