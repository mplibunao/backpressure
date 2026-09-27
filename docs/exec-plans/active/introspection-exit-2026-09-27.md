# Introspection exit and backpressure release: Plan

Status: planned; no step has started. Decision date: 2026-09-27. Owner: MP.

## Goal

Retire the abandoned `introspection` CLI from every repo that uses it, back up the listed local-only work across four repos, and release `@mplibunao/oxlint-standards` and `@mplibunao/tsconfig` from backpressure so consumer repos can install them from npm.

## Decided (MP, 2026-09-27; apply as-is)

1. **backpressure** (`/Users/mp/Projects/personal/backpressure`): remove introspection entirely:
   - the devDependency `file:../introspection`;
   - the `introspection:check` script and its step in `pnpm check`;
   - the check-chain contract entry;
   - the `.introspection` scan scope in `scripts/check-durable-work-item-refs.sh`;
   - the `.introspection/` directory;
   - the `CLAUDE.md` router lines.

   `docs/records/` stays as hand-managed markdown. Then open a PR from `lint/oxlint-standards-consolidation` to `main` and release through changesets. MP handles the Version Packages PR's close and reopen by hand.
2. **taste-distillery** (`/Users/mp/Projects/personal/taste-distillery`, a governed canon repo; follow its router `CLAUDE.md` and GNO-first discovery):
   - Land the 15 non-introspection commits of local `reshape/introspection-v1` onto `main` in order, dropping `e5d64a3`.
   - Rebuild `docs/llm-wiki-reshape-plan` on top.
   - State in `TD-DEBT-015` that the wiki tool is a new CLI, and record the deferral until a new GCP org exists via Terraform.
   - Push the wiki branch as a backup, with no PR.
3. **claude-toolkit** (`/Users/mp/Projects/personal/ai/claude-toolkit`, remote `mplibunao/claude-tooling`, private): push `feature/github-ops-app-lifecycle` and `feature/github-ops-credential-backup` as backups. The credential-backup branch stops at `6964aa8c`, without the two unrelated local-config commits `87ac8c82` and `0fc68439`. The GitHub App work stays parked until the future Terraform org work.
4. **introspection** (`/Users/mp/Projects/personal/introspection`, remote `mplibunao/introspection`, public): abandoned.
   - Push `reshape/introspection-v1` and `reshape/introspection-substrate-effect`, and preserve all six stashes on the remote.
   - Then archive the GitHub repo.
   - Leave npm `@mplibunao/introspection@0.0.1` alone, with no deprecation. Release PR #2 (0.1.0) is not merged.

RepoPrompt constraint: work in the window that already owns each workspace. If a needed workspace isn't open, pause that lane and ask MP; never switch or reuse another window.

## Summary

The removal is a targeted cutover, not a tooling replacement:
- **backpressure** loses its introspection dependency, checks, config and agent instructions. Its tech-debt records stay as hand-maintained markdown with a short operating guide.
- **taste-distillery** lands its 15 canon commits through a checked PR with a merge commit, then rebuilds the six-commit wiki stack on top and pushes it as a backup.
- **claude-toolkit** and **introspection** get exact-commit backup refs, pushed without touching any checkout.
- **The release** goes through the existing changesets workflow unchanged.
- **The introspection archive** comes last. It waits until backpressure's removal is on `main` and every backup ref has been read back from the remote.

"Remove introspection" means removing live execution dependencies and instructions. It does not mean rewriting git history or erasing accurate historical references.

## Current state

### backpressure: dependency and validation flow

- **The branch:** `lint/oxlint-standards-consolidation` is pushed, in sync with origin, 71 commits ahead of `origin/main`, with no PR. It contains the unpushed local branches `adopt/introspection-v1` and `reshape/introspection-v1` (7 commits), which introduced the introspection wiring; `origin/main` has none. Step 2 proves those two branches are ancestors of the pushed tip, so they need no separate backup.
- **Why CI would fail:** the root devDependency leads to a lockfile directory resolution at `../introspection`. A standalone CI checkout has no such sibling, so the frozen install fails before any check runs. `.github/workflows/ci.yml:17-39`, `effect-integration.yml:19-41` and `release.yml:21-45` each run `pnpm install --frozen-lockfile`. CI has never run on this branch.
- **Why the local check fails:** `.introspection/config.toml` uses a `[records.list]` block (commit `de2f523`). The installed `file:` copy is a prebuilt `dist/` from main-era introspection that expects `[prime]`, so `introspection check` exits 1 with `config.schema_violation` and `pnpm check` stops before prose.
- **Why removing the script alone isn't enough:** `pnpm check` calls `pnpm check-release-workflow`. That calls `assertEffectGateScripts(scripts)` (`scripts/checks/check-release-workflow.ts:385`), which requires every entry of `requiredCheckCommands` (`scripts/lib/effect-integration-contract.ts:20,42,48`). `pnpm introspection:check` is one of those entries (`:37`), so it must go from the contract too.
- **Live wiring, with locations:**

  | File | What |
  | --- | --- |
  | `package.json:12` | `pnpm introspection:check` inside `check` |
  | `package.json:16` | the `introspection:check` script |
  | `package.json:52` | `"@mplibunao/introspection": "file:../introspection"` |
  | `pnpm-lock.yaml:66-68, 579-582, 2966` | importer, package and snapshot entries |
  | `scripts/lib/effect-integration-contract.ts:37` | required-command entry |
  | `scripts/lib/effect-integration-contract.test.ts:44-49` | `it.each(requiredCheckCommands)` mutation cases (they import the list and don't name introspection) |
  | `scripts/check-durable-work-item-refs.sh:8` | `.introspection` in the scan scope (it checks work-item labels, not record schema) |
  | `.introspection/` | `config.toml`, `vocabulary.toml`, plus ignored `generated/` and lock files (`.gitignore:5-6`) |
  | `CLAUDE.md:20, 29, 35` | "run `introspection prime` / `introspection check`" and the tooling bullet |

- **The records:**
  - All 16 files under `docs/records/tech-debt/{done,open,rejected,superseded}/` carry `type: introspection-record` at line 9. They also have `schema_version`, `id`, `repo_key`, `record_type`, `number`, `status`, `category`, `visibility`, timestamps, `tags` and `source`.
  - Nothing else validates or generates them; `.introspection/generated/` is derived output, not the owner.
  - The bodies mention introspection in prose: open `bp-td-007:30`, `008:36`, `009:30`, `011:32`; done `bp-td-010:42`; rejected `bp-td-001:38`, `004:38`; superseded `bp-td-002:41`, `003:41`, `006:41`.
- **Historical prose:**
  - `docs/design-docs/rule-intake.md:25` and `docs/references/mutation-testing.md:126`;
  - the Effect v4 alignment plan, build plan and progress ledger;
  - the lint-standards consolidation plans and ledgers;
  - two reviews.

### backpressure: release flow

The release architecture (ADR-006, `release.yml`, `release-contract.ts`, `check-changesets-release-state.ts`) stays as is:

1. The feature PR runs `Check` (`ci.yml`, on PRs and pushes to `main`) and `Effect integration` (`effect-integration.yml`, on PRs and manual dispatch).
2. Merging pushes `main`. `release.yml:47-57` runs `changesets/action@v1`, which opens or updates "Version Packages" while changesets are pending.
3. That PR consumes the changesets and bumps versions, changelogs and the lockfile.
4. Merging it runs `pnpm release`. Its `release:prepare` checks artifacts, release state, policy and both isolated Effect routes before `changeset publish`, which publishes through npm trusted publishing (OIDC).

Other facts that shape the release:
- **Don't run `pnpm release:prepare` on the feature branch.** `assertNoPendingChangesets()` rejects the two pending changesets by design, so release preparation only makes sense on the Version Packages revision.
- **Pending changesets:** `.changeset/oxlint-standards-rule-consolidation.md` and `tsconfig-effect-integration.md`, both minor bumps. Both packages are at `0.1.0`, the only version on npm, so `0.2.0` is expected. Read the actual versions from the Version Packages PR.
- **No classic branch protection:** `gh api .../branches/main/protection` returns 404 with the message `Branch not protected`. Rulesets are a separate API and weren't checked; step 1 checks them. Either way, the plan treats passing named checks as a hard gate before every merge.
- **Where `GITHUB_TOKEN` stands:** a PR opened by `GITHUB_TOKEN` doesn't trigger workflows the normal way. Current GitHub docs also describe approval-required runs for such events. The procedure inspects the actual PR instead: checks on the intended head are the evidence, whatever the trigger mechanics.
- **Effect-plan acceptance item G2:** MP closed it as accepted on 2026-09-27 (see Decisions). Executor typed coverage is 1,355 of 1,922 files, because executor's own tsconfigs are invalid (TS5096/TS5069, also under TS 6.0.2). Removing introspection doesn't change that.
- **Consumers with a release-age window:** both packages declare `@effect/tsgo` `0.46.1` as an exact optional peer. A consumer with a seven-day `minimumReleaseAge` needs exact-version `minimumReleaseAgeExclude` entries until each package's timestamp passes the window (tsgo 0.46.1 was published 2026-09-26T13:14Z). The README "Supported versions" section documents this. The newly published backpressure packages fall under the same window in such consumers.

### taste-distillery

- **Branches:**
  - `main` equals `origin/main` at `ea8d1d8`, with no introspection references.
  - `reshape/introspection-v1` is 16 commits ahead and unpushed.
  - `docs/llm-wiki-reshape-plan` (checked out, at `b073b62`, clean) is 6 single-parent commits above `6a1953e` (`51bc420`..`b073b62`) and also unpushed. Its tracked `.obsidian/` holds the shared vault config, and it ignores `workspace.json`.
  - Five old local branches are all merged. The repo has no stashes and one worktree.
- **`e5d64a3`** sits between `3ac2c06` and `9a1231b`. It only adds `exec-plans/drafts/introspection-migration/tech-debt-import-manifest.json`, and no later commit touches or links that path. `51bc420` edits `exec-plans/drafts/index.md` without linking it.
- **Remaining introspection references:**
  - `investigations/published-package-build-tooling-2026-06-16.md:19`, a historical comparison that stays;
  - on the wiki branch only, `exec-plans/tech-debt-tracker.md:115`, inside `TD-DEBT-015`.
- **`TD-DEBT-015`** ("LLM-wiki management CLI") says to confirm whether the CLI is new or builds on the existing introspection governed-markdown-records substrate. It ends with "Promote this when the reshape's Phase 3 cutover has landed and manual node creation or promotion becomes repetitive." Tracker entries are prose. Neither the tracker nor the draft `exec-plans/drafts/2026-06-26-llm-wiki-reshape.md` records the GCP-org/Terraform deferral.
- **Governance:**
  - Accepted canon `TD-CARD-037` sets the branch-protection baseline. It requires a PR and named CI checks and blocks force-push and deletion. Approvals are set to zero, with an admin bypass. It allows a gap for a private repo on the Free plan. The repo is private, and the protection and ruleset APIs return 403 with `Upgrade to GitHub Pro`, so live enforcement is unknown.
  - `.github/workflows/ci.yml` runs on pushes and PRs to `main`, as job `Gate (just ci)`. `just ci` runs `fmt`, `docs`, `prose`, `test` and `vet`.
  - A fresh worktree needs `mise trust` for its own `mise.toml`, for that worktree only.
  - `main`'s history uses merge commits, such as PR #5 at `ea8d1d8`.

### claude-toolkit

- **Neither branch exists on origin.** Both branch from `f60a3c7e`.
- **`feature/github-ops-app-lifecycle`:** 22 commits from 2026-06-25 to 06-26, tip `6e7c5268`. It includes `dad0d716`, `docs(global): require my sign-off before filing deferrals as tech debt`.
- **`feature/github-ops-credential-backup`:** the same 22 commits plus `6964aa8c` (the U10 ledger entry), `87ac8c82` "fuck claude" (`.codex/config.toml`, `settings.json`) and `0fc68439` "rp-oracle-export-cli fix" (`GLOBAL_AGENTS.md`, `GLOBAL_CLAUDE.md`, `memory/common/rp-cli.md`). Those last two exist on no other ref.
- **The checkout:** on `feature/executor-mcp-gateway`, with uncommitted changes that must not be touched.
- **Workflows:** `origin/main` has no `.github/workflows`. Step 1 confirms the outgoing refs have none either.
- **Introspection references on `origin/main`:** only history, plus `.codex/config.toml:187` (a project registration). Nothing tells an agent to run the CLI.
- **`stash@{3}` "instrospection-bootstrap-stash"** holds meeting-record and orchestration work, not introspection. It is outside this plan.

### introspection

- **GitHub state:** public, default branch `main`, not archived. Open PRs are #2 (`Version Packages`) and #4 (`chore: Configure Renovate`). No releases or tags. An active ruleset on `main` requires a PR and `Check`, and blocks non-fast-forward pushes and deletion. CI and Release run only for PRs and pushes to `main`, so pushing other refs triggers nothing and publishes nothing.
- **Local branches:** checked out on `reshape/introspection-substrate-effect` (38 commits on no origin ref, no upstream). `reshape/introspection-v1` has 33 commits on no origin ref.
- **Stashes:** none has an untracked-files parent, and none is reachable from a branch. They differ in size, so each is preserved.

  | Stash label | Commit | Date | Files | Lines |
  | --- | --- | --- | --- | --- |
  | `substrate-june-29` | `4fba989` | 06-29 | 57 | +3,696 / −1,974 |
  | `substrate-june-25` | `d99e4f1` | 06-25 | 56 | +3,481 / −1,974 |
  | `substrate-june-21` | `09e8a2e` | 06-21 | 56 | +3,481 / −1,974 |
  | `substrate-june-20` | `58a5dd6` | 06-20 | 59 | +3,914 / −1,974 |
  | `substrate-effect-june-19` | `807e865` | 06-19 | 56 | +3,481 / −1,974 |
  | `introspection-release-stash` | `1ccee7f` | 06-16 | 54 | +3,347 / −1,974 |

- **The only local consumer is backpressure.**

### Backup coverage

| Work | Preserved by this plan | Not covered |
| --- | --- | --- |
| backpressure `adopt/` and `reshape/introspection-v1` | They're ancestors of the pushed consolidation tip (proved in step 2) | Untracked `prompt-exports/` |
| taste canon and wiki | 15 plus 6 replayed patches, with order and authorship verified, pushed. The original tips are kept under local backup refs. | The original commit IDs off-machine; the dropped manifest (intentional) |
| toolkit lifecycle | The exact tip | Other branches and the dirty checkout |
| toolkit credential-backup | `6964aa8c` and its ancestors | `87ac8c82`, `0fc68439` (superseded; stay local-only) |
| introspection branches | Both exact tips | Nothing |
| introspection stashes | Six exact stash commits with their index and base parents | The local stash-list ordering, which is recorded in the journal instead |

## Design

### Targeted cutover

Don't repair introspection, migrate the records into a new tool, add a schema validator, change changesets or the release workflow, bump toolchain pins, or build the wiki CLI. No public API, lint rule, Effect policy or package export changes. Removing a root-only development dependency needs no changeset.

What gets reused:
- the existing check-chain contract and its tests;
- the prose and durable-reference gates;
- the release guards;
- taste-distillery's tracker and draft plan;
- this plan, which doubles as the cross-repo execution journal.

### backpressure removal, one commit

1. Remove `@mplibunao/introspection` from root `devDependencies`, remove `scripts["introspection:check"]`, and remove only `&& pnpm introspection:check` from `scripts.check`. Keep every other step in order.
2. Remove `'pnpm introspection:check'` from `requiredCheckCommands`. `assertEffectGateScripts()` and `assertEffectIntegrationWorkflowContract()` keep their signatures.
3. Add one regression test to `scripts/lib/effect-integration-contract.test.ts`, reusing `readRepoFile()`. It asserts that no root dependency uses a `file:`, `link:` or `portal:` specifier pointing outside the repository, and that `pnpm-lock.yaml` has no `resolution: {directory: ...}` outside the workspace. Resolve each path against the repo root. `workspace:*` packages lock as `link:packages/...` (`pnpm-lock.yaml:70-71`) and are allowed. That is the property that broke CI. It covers any future sibling dependency, not just this one, and it avoids a test that names a removed tool. Keep the existing `it.each(requiredCheckCommands)` cases, the policy-before-build check and the network-integration exclusion.
4. Remove `.introspection` from the scan arguments in `scripts/check-durable-work-item-refs.sh`. Keep `docs/records/` and every other scope, and keep the error propagation.
5. Delete `.introspection/`, after listing its contents; stop if it holds unexpected authored files. Remove only the `.introspection/.locks/` and `.introspection/generated/` lines from `.gitignore`.
6. Regenerate `pnpm-lock.yaml` with the pinned pnpm (`pnpm install --lockfile-only`); don't hand-edit it. Review the lockfile diff for unrelated churn.
7. In `CLAUDE.md`, replace the two deferred-work instructions with a pointer to `docs/records/README.md`, and remove the introspection tooling bullet and the "`pnpm check` runs `introspection check`" clause. Don't edit the `AGENTS.md` symlink.
8. Add `docs/records/README.md` as the operating guide for manual records (see the next section).
9. Documentation, following the "Current state versus history" section below: `docs/design-docs/rule-intake.md` and the Effect v4 plans and ledger.

### Manual record format

**Decision: remove `type: introspection-record` from all 16 records.** Keeping the field would claim a machine schema that no tool reads anymore. Everything else stays: IDs, filenames, `record_type`, `status`, `category`, `visibility`, `created_at`, `resolved_at`, `tags`, `source` and every body. Set `updated_at` to the edit time. `schema_version: 1` stays as legacy metadata.

`docs/records/README.md` states:
- The markdown under `tech-debt/<status>/` is the source of truth, and nothing generates or validates it.
- Read `open/` before planning, and update the affected records before finishing.
- IDs are never reused. Check every status directory before choosing the next number; gaps are not free numbers.
- A status change moves the file, and updates `status`, the status tag, the resolution and the evidence together.
- `visibility: local-only` is descriptive metadata, not access control.
- New deferrals still need MP's approval.

Don't add a second tracker or a generated index.

### Current state versus history

| Surface | Treatment |
| --- | --- |
| Router and current procedures (`CLAUDE.md`, `docs/records/README.md`, `rule-intake.md`) | Describe manual records directly. In `rule-intake.md:25`, list `no-js-extension-imports` and `no-opaque-instance-fields` as known candidates without migration narration. |
| Current plan and ledger summaries (Effect v4 alignment plan, build plan, progress ledger) | Add a dated note that this plan replaces the introspection blocker and the instruction to keep introspection. Remove introspection from the current blocker list only after step 3 passes, and record G2 as accepted. |
| Historical results, migration provenance, and rejected or superseded records | Leave unchanged, including failed checks and accurate introspection mentions. Never rewrite an old "check chain without introspection" result as a past `pnpm check` pass. |

### taste-distillery reconstruction

- **Separate worktrees:** do all replay work in separate worktrees, and anchor the original canon and wiki tips under local refs `backup/introspection-exit-2026-09-27/*` first.
- **Canon replay:** cherry-pick onto `ea8d1d8`, in this order:
  1. `e6b3d21`
  2. `3ac2c06`
  3. `9a1231b`
  4. `d6b0ba8`
  5. `276c86b`
  6. `0437b7b`
  7. `e7585f3`
  8. `42cecdc`
  9. `560675e`
  10. `bdc52f3`
  11. `e5ef81f`
  12. `c1988da`
  13. `38b2658`
  14. `2417151`
  15. `6a1953e`

  Omit only `e5d64a3`. Author name, email and date must be preserved; new commit IDs and committer data are expected. The source-to-replay mapping goes in the execution journal, not in commit messages, so no `-x` is needed.
- **Landing:** through a PR, merged with a merge commit so all 15 commits stay individually in `main`'s history. This follows TD-CARD-037 and `main`'s merge-commit convention. No squash.
- **Wiki replay:** replay the six wiki commits in order onto the landed `main`, then add one documentation commit.
- **`TD-DEBT-015`:** keep its title and scope. Its prose must state that:
  - the wiki tool will be a new CLI;
  - building it waits until a new GCP organization exists, created through Terraform;
  - the reshape's Phase 3 cutover is still a prerequisite;
  - promotion needs both prerequisites.
- **The wiki draft:** read the whole draft first. In its status or prerequisites area, add the same deferral as a link to `TD-DEBT-015`; the tracker stays the single owner. The draft stays in `drafts/`, with no wiki PR.

### Backup mechanism

- **Explicit mappings only:** push explicit full-OID-to-ref mappings. Never use `--all`, `--mirror`, wildcards or tag pushes.
- **Before each push:** check the destination. If it's absent, it's eligible. If it's present at the intended OID, it's already done. If it's present at any other OID, stop and reconcile; never overwrite it.
- **Batching:** prefer `--atomic` batches. After any interrupted or ambiguous push, read every remote ref back before retrying.
- **The dirty toolkit checkout:** because the push source is an OID, that checkout never needs switching.

introspection's remote backup refs, pushed alongside its two original branch names:

| Stash label | Commit | Remote branch |
| --- | --- | --- |
| `substrate-june-29` | `4fba989` | `backup/introspection-exit-2026-09-27/stash-substrate-june-29-4fba989` |
| `substrate-june-25` | `d99e4f1` | `backup/introspection-exit-2026-09-27/stash-substrate-june-25-d99e4f1` |
| `substrate-june-21` | `09e8a2e` | `backup/introspection-exit-2026-09-27/stash-substrate-june-21-09e8a2e` |
| `substrate-june-20` | `58a5dd6` | `backup/introspection-exit-2026-09-27/stash-substrate-june-20-58a5dd6` |
| `substrate-effect-june-19` | `807e865` | `backup/introspection-exit-2026-09-27/stash-substrate-effect-june-19-807e865` |
| `introspection-release-stash` | `1ccee7f` | `backup/introspection-exit-2026-09-27/stash-introspection-release-stash-1ccee7f` |

Resolve full OIDs first; `stash@{n}` is only an inventory label. Pushing a stash commit carries its base and index parents. The check is a fresh clone from the remote that resolves each ref to its intended OID and confirms that each stash's `^1` and `^2` commits and trees exist (`git cat-file -e`). Don't apply a stash in the source checkout.

### Decisions MP must make

| Decision | Recommendation | Blocks |
| --- | --- | --- |
| The two excluded toolkit commits (`87ac8c82`, `0fc68439`) | **Resolved: stay local-only, no backup ref.** Both are superseded. `87ac8c82` set Codex `model_reasoning_effort = "high"`, `service_tier = "fast"` and `MAX_THINKING_TOKENS` `63999`; `origin/main` has since chosen `low`, `default` and `128000`. `0fc68439` moved the `rp-cli` "pass `-t <tab_id>`" rule from `memory/common/rp-cli.md` into the global files; that rule is still in `memory/common/rp-cli.md` on `origin/main`. | Nothing |
| The Effect plan's executor coverage item (G2) | **Resolved (MP, 2026-09-27): close G2 as accepted and release.** The executor typed coverage of 1,355 of 1,922 files is caused by executor's own invalid tsconfigs (TS5096/TS5069, also under TS 6.0.2), not by these packages. | Nothing |
| Introspection PRs #2 and #4 before archiving | Close both unmerged and keep their branches | The archive (step 12) |
| The untracked local state | **Resolved (MP, 2026-09-27):** introspection's untracked `.claude/` was deleted by MP. The dirty toolkit checkout (`feature/executor-mcp-gateway`: two modified docs, two new files) is MP's ongoing work and stays untouched; no stash is needed, because every push uses an explicit OID. taste-distillery's working tree is now on the wiki branch and clean. Its `.obsidian/` config is the committed shared version, and the per-machine `workspace.json` is ignored. | Nothing |
| Missing or unverifiable protection | Keep the PR and the named passing checks regardless. If protection is supported but missing, repair it later through the toolkit `github-ops` workflow, with approval. | Merges where the gap remains |

Record these decisions in this plan's journal; don't create tech-debt records for them.

### Dependency graph

```text
1 Preflight
└─ 2 Anchor source state, record backup exceptions
   ├─ 3 backpressure removal + standalone verification
   │  └─ 9 backpressure PR + checks + merge
   │     ├─ 10 Version Packages review + checks + release:prepare
   │     │  └─ 11 Publish + registry verification
   │     └──────────────────────────────┐
   ├─ 4 toolkit branch backups           │
   ├─ 5 introspection branch/stash backups ─┴─ 12 PR disposition + archive
   └─ 6 taste canon replay + local gate
      └─ 7 taste canon PR + runner gate + merge
         └─ 8 wiki restack + TD-DEBT-015 + backup push

4 + 8 + 11 + 12 + accepted exceptions ─ 13 Reconcile and close
```

- **The archive's hard prerequisites** are steps 5 and 9. Publishing isn't technically required for the archive, but the numbered order finishes it first.
- **One writer per repository and ref.** Independent lanes may run in parallel. Never overlap installs, cherry-pick sequences or commits in the same worktree.
- **Before every outward action,** re-read the source and destination state. A changed head voids its earlier approval and verification.

### Execution journal

Append one row per action. Keep raw inventories that could hold secrets out of this file.

| Step | Repo | Source OID | Destination / ref | Command and working directory | Exit | UTC time | Evidence / PR / run | MP approval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## File-by-file impact

### backpressure

| File | Change |
| --- | --- |
| `package.json` | Remove the devDependency, the `introspection:check` script and its step in `check`; nothing else. |
| `pnpm-lock.yaml` | Regenerate; no sibling-directory entries remain. Same commit as the manifest change. |
| `scripts/lib/effect-integration-contract.ts` | Remove one `requiredCheckCommands` entry. |
| `scripts/lib/effect-integration-contract.test.ts` | Add the no-outside-repo-dependency test; keep the existing cases. |
| `scripts/check-durable-work-item-refs.sh` | Remove `.introspection` from the scan scope. |
| `.introspection/**` | Delete, after listing its contents. |
| `.gitignore` | Remove the two `.introspection/` lines. |
| `CLAUDE.md` | Point to the manual records; remove the introspection instructions and tooling bullet. |
| `docs/records/README.md` | New manual-records guide. |
| `docs/records/tech-debt/**` (16 files, listed below) | Drop `type: introspection-record` and bump `updated_at`; bodies unchanged. |
| `docs/design-docs/rule-intake.md` | Rewrite "Known candidates" as current-state prose. |
| Effect v4 alignment plan, build plan, progress ledger | Add a dated replacement note and record G2 as accepted by MP on 2026-09-27 with its evidence. Leave history untouched. The only unfinished Effect items are WI-08 (G2 coverage) and WI-10 (final acceptance, blocked by introspection and G2). Mark WI-08 done under MP's acceptance. Mark WI-10 done with step 3's standalone evidence, the frozen install plus the complete `pnpm check` and both integration routes. Then move the three documents to `docs/exec-plans/completed/` in the same PR and update inbound links. |
| This plan | Runbook, approvals, mappings, exceptions, journal. |

The 16 records:
- open: `bp-td-007`, `008`, `009`, `011`, `012`, `013`, `015`, `016`;
- done: `bp-td-010`, `014`, `017`;
- rejected: `bp-td-001`, `004`;
- superseded: `bp-td-002`, `003`, `006`.

No changes to the workflows, ADR-006, the release checkers, `pnpm-workspace.yaml`, package READMEs, package source or pins. The Version Packages PR, not the removal commit, updates package versions, changelogs and the lockfile, and consumes the changesets.

### taste-distillery

| File or group | Change |
| --- | --- |
| Paths touched by the 15 canon commits | Replayed unchanged. List the paths from the commit objects before replaying and keep the list. |
| `exec-plans/drafts/introspection-migration/tech-debt-import-manifest.json` | Absent from the rebuilt history. |
| Paths touched by the 6 wiki commits | Replayed unchanged. Their full path list is recorded at execution time. |
| `exec-plans/tech-debt-tracker.md` (wiki branch) | `TD-DEBT-015` rewording. |
| `exec-plans/drafts/2026-06-26-llm-wiki-reshape.md` (wiki branch) | A status and prerequisite line linking `TD-DEBT-015`. |

No changes to the router, cards, CI, mise pins, the historical tsdown investigation or `.obsidian/`.

### claude-toolkit and introspection

No file edits; only refs, PR states and the archive. Don't touch toolkit's Codex registration, global instructions, the executor-gateway checkout or unrelated stashes.

## Risks

- **Public exposure:** introspection is public. Review the outgoing branches and stash snapshots (working tree and index) for secrets or private content before approving the push. If something turns up, stop; don't silently rewrite objects.
- **History still mentions introspection:** old commits and the backed-up branches still contain it. The cutover is proven on the consolidation head and on `main`, not by zero historical matches.
- **Rolling back the metadata:** a rollback restores the whole removal commit, not just the CLI. After the archive, prefer a forward fix that keeps the standalone install working.
- **Rolling back the replay:** keep the original refs, and abort a failed cherry-pick only in its task worktree. Never force-push `main`, squash the canon, or resolve a conflict by taking one side wholesale.
- **Rolling back the release:** publishing is irreversible here. Never unpublish, overwrite a version or move a published tag. If a job fails after some artifacts exist, reconcile package by package before any retry.
- **Stale evidence:** any change to what was checked voids the related checks and approvals. That covers the PR head and source branch, and also the registry state and release candidate. Missing or skipped checks aren't passes.

## Implementation order

Path aliases: `BP` = backpressure, `TD` = taste-distillery, `TK` = claude-toolkit, `IN` = introspection (full paths above). Commands use POSIX-shell variables. Bind them first; in fish, use `set VAR value`.

### Step 1: Preflight and live state

**Preconditions:** MP has authorized execution, and each repo's workspace is available in its existing window.

**Procedure:**
1. Read each repo's router. For taste-distillery, run GNO discovery before any content search:
   - `gno search "TD-CARD-037" --collection taste-distillery`
   - `gno get gno://taste-distillery/cards/ci-and-release/branch-protection-baseline.md`
   - `gno get gno://taste-distillery/docs/source-of-truth-boundaries.md`

   Confirm the retrieved markdown matches the revision in use.
2. In each repo, capture:
   - `git status --short --branch --untracked-files=all`
   - `git worktree list --porcelain`
   - `git remote -v`
   - `git for-each-ref --format='%(refname) %(objectname)' refs/heads refs/remotes`
   - `git stash list --format='%gd%x09%H%x09%gs'`
   - `git fetch --no-tags origin`
3. Look at ignored state under `.introspection`, `.obsidian` and `.claude` only.
4. Confirm remote identities and visibility. Check the workflow triggers on the actual outgoing refs, not only on `origin/main`.
5. For backpressure and taste-distillery, run all three protection calls, and record errors separately from empty results:
   - `gh api repos/$REPO/branches/main/protection`
   - `gh api --paginate repos/$REPO/rules/branches/main`
   - `gh api --paginate repos/$REPO/rulesets`
6. Record the npm baseline: `npm view <pkg> versions --json` for both backpressure packages and `@mplibunao/introspection`.

**Success:** source OIDs, worktree state, triggers, protection visibility, the npm baseline and uncovered local work are all in the journal.

**On failure:** pause only the affected lane. That covers an inaccessible root, unexpected refs, a secret, an active git sequencer, or changed state. Never reset, stash, clean or switch unrelated work.

**Go-ahead:** discovery only.

### Step 2: Anchor source state and settle backup exceptions

**Preconditions:** step 1 is done.

**Procedure:**
1. Resolve every short ID to a full OID.
2. Create local, non-overwriting refs `backup/introspection-exit-2026-09-27/*` for taste-distillery's original canon tip (`6a1953e`) and wiki tip.
3. Record the wiki range with `git -C "$TD" rev-list --reverse --topo-order "$TD_CANON_SOURCE..$TD_WIKI_SOURCE"`. It must be exactly six commits, all with one parent; a merge commit needs a revised replay spec.
4. Prove `adopt/introspection-v1` and `reshape/introspection-v1` are ancestors of backpressure's pushed consolidation tip (`git merge-base --is-ancestor`).
5. Record each introspection stash's full OID, message, order, parents and tree. Don't drop or pop any of them.
6. Present the backup-coverage table to MP, and record what gets backed up, what stays local-only, and what needs extra approved storage.

**Success:** every reconstruction has an unchanged source ref, and the stash identities no longer depend on `stash@{n}`.

**On failure:** a name collision at another OID stops the step. A new name needs a recorded adjustment.

**Go-ahead:** extra backup refs for excluded material need their own approval.

### Step 3: Remove introspection and verify backpressure locally

**Preconditions:** the source is captured, and no other writer is using the worktree. Use the existing checkout only if its tracked changes all belong to this task; otherwise use a clean worktree at the captured tip.

**Procedure:**
1. Apply the removal commit contents above. List `.introspection/` before deleting it.
2. Run, all expected to exit 0:
   - `pnpm install --lockfile-only`
   - `pnpm exec vitest run scripts/lib/effect-integration-contract.test.ts`
   - `pnpm check-release-workflow`
   - `pnpm changesets:check`
   - `pnpm durable:refs`
   - `pnpm prose`
3. Classify the search results:
   - `git grep -n -i introspection -- package.json pnpm-lock.yaml scripts .github CLAUDE.md .gitignore` must print nothing.
   - `git grep -n -i introspection -- docs packages` may only print historical prose.
   - `git ls-files -- .introspection` must be empty.
4. Stage only the listed paths, review the staged diff, and commit.
5. Verify standalone:
   - `git clone --no-local "$BP" "$VERIFY/backpressure"` into a fresh parent directory that has no `introspection` sibling.
   - `git -C "$VERIFY/backpressure" checkout --detach "$BP_HEAD"`.
   - `mise trust` for that clone, then `mise install` (Bun, Node, Vale) and `corepack enable`, so pnpm comes from `packageManager`. CI gets the same pnpm 11.4.0 from `pnpm/action-setup` (`ci.yml:26-30`). `pnpm check` fetches Vale styles over the network (`scripts/vale-ensure-styles.sh`), as CI does.
   - Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm check:effect-integration` and `git diff --exit-code`.

   The clone must use its own `node_modules`. Record the commit, tool versions, exit codes and logs.

**Success:**
- The frozen standalone install passes, and the complete, unmodified `pnpm check` passes, including prose.
- Both integration routes pass.
- The 16 records keep their IDs and resolutions.
- The new regression test fails if a `file:../` dependency is re-added. Check this with a temporary edit, then revert it.

**On failure:** fix the real cause. Never restore the sibling dependency, drop another gate or shorten the chain. A pending-changeset release-state failure here is expected, not a regression.

**Go-ahead:** local commit and verification only. The push is step 9.

### Step 4: Back up the toolkit branches

**Preconditions:**
- The exact tips are captured and the outgoing content has been reviewed.
- The lifecycle branch has the recorded 22 commits from `f60a3c7e`.
- `6964aa8c` is on credential-backup, and neither excluded commit is its ancestor.

**Procedure:** push, with `$TK_CREDENTIAL_APPROVED` resolving to `6964aa8c`:

```sh
git -C "$TK" push --no-follow-tags --recurse-submodules=no --atomic origin \
  "$TK_LIFECYCLE:refs/heads/feature/github-ops-app-lifecycle" \
  "$TK_CREDENTIAL_APPROVED:refs/heads/feature/github-ops-credential-backup"
```

Read each ref back with `git ls-remote`. Don't set an upstream on the local credential-backup branch, whose tip still has the excluded commits.

**Success:** the remote OIDs equal the intended OIDs. The executor-gateway checkout and its dirty files are untouched, and no PR is opened.

**On failure:** after an ambiguous result, read the remote refs before retrying. Never overwrite a conflicting destination.

**Go-ahead:** MP approves the exact mappings.

### Step 5: Back up introspection branches and stashes

**Preconditions:**
- The workspace is available and the live state has been rechecked.
- The repo isn't archived.
- The outgoing objects passed the exposure review.

**Procedure:**
1. In one atomic batch, push the captured tips of `reshape/introspection-v1` and `reshape/introspection-substrate-effect` to the same names, and each full stash OID to its backup ref. Never push `main`, tags or `refs/stash`.
2. Read all eight refs back with `git ls-remote`.
3. Make a fresh clone from the remote. In it, confirm each ref resolves to its intended OID, and that each stash commit has exactly two parents (`git rev-list --parents -n1`), meaning base and index with no untracked-files parent. A successful clone already proves every reachable object exists.

**Success:** eight exact matches from a remote clone. The source stashes are unchanged.

**On failure:** keep the source refs and block the archive. If `--atomic` is unsupported, push the approved mappings one at a time and record any partial success.

**Go-ahead:** MP approves the eight mappings and their public visibility. This does not authorize the archive.

### Step 6: Rebuild the taste canon and run its gate

**Preconditions:**
- GNO discovery is done.
- The source refs are anchored and the graph is verified.

**Procedure:**
1. Create worktree and branch `land/canon-without-introspection-2026-09-27` at `ea8d1d8`.
2. Cherry-pick the 15 commits in the listed order.
3. Before any repair commit, compare against the source:
   - `git range-diff "$TD_BASE..$TD_CANON_SOURCE" "$TD_BASE..$TD_REBUILT"`
   - `git diff --name-status "$TD_CANON_SOURCE" "$TD_REBUILT"` must show only the manifest deletion.
   - `git diff --exit-code "$TD_CANON_SOURCE" "$TD_REBUILT" -- . ':(exclude)exec-plans/drafts/introspection-migration/tech-debt-import-manifest.json'`
4. Compare each commit's author name, email, date and order. Require exactly 15 replays and one omission.
5. If `origin/main` has moved, keep this comparison, merge the reviewed new `main` into the landing branch without rewriting the 15 commits, then re-validate.
6. Run `mise trust` for this worktree, then `just ci`. Any gate repair goes in a separate, named commit; never weaken schemas, prose rules or policy.

**Success:** the comparisons are recorded with the manifest absent, and `just ci` passes on the PR candidate.

**On failure:** run `git cherry-pick --abort` in the task worktree only. Leave the original branches and `.obsidian/` alone.

**Go-ahead:** no remote writes.

### Step 7: Land the taste canon through a PR

**Preconditions:**
- Step 6 passes and the protection situation is recorded.
- The heads match the reviewed state.

**Procedure:**
1. With approval, push the landing branch and verify its remote OID.
2. With approval, open the PR to `main`.
3. Run `gh pr checks "$TD_PR" --watch --fail-fast` and `gh pr view "$TD_PR" --json headRefOid,baseRefName,mergeable,statusCheckRollup`. Require `Gate (just ci)` to exist and pass by name. `--required` alone isn't enough, because no checks may be configured as required.
4. With approval, run `gh pr merge "$TD_PR" --merge --match-head-commit "$TD_PR_HEAD"`. Keep the branch, and never squash or use the admin bypass.
5. Fetch, confirm the 15 replayed commits are ancestors of `main` and the manifest is absent, and check the `main` push run.

**Success:** the checked canon is on remote `main`, commit by commit.

**On failure:** any change to the head or base blocks the merge until it's re-verified, and so does a failed or missing check. A 403 never justifies a direct push to `main`. Fix a landed defect through a new checked PR.

**Go-ahead:** separate approvals for the push, the PR and the merge. Record any accepted protection gap before the merge.

### Step 8: Restack and back up the wiki branch

**Preconditions:** the canon has landed and been verified, and the original wiki tip is anchored.

**Procedure:**
1. Create a clean worktree at the landed `main`, and cherry-pick the six wiki commits in order.
2. Compare the old and new ranges and authors; the patches must be equivalent. Confirm the manifest is still absent.
3. Read `TD-DEBT-015` and the whole wiki draft. Make the documentation change as a separate commit, then run `just ci`.
4. Advance the local branch with a compare-and-swap. It is checked out in the main worktree, so first confirm that worktree is clean and its `HEAD` equals `$TD_WIKI_SOURCE`; otherwise stop. With approval, run:
   - `git -C "$TD" switch --detach`
   - `git -C "$TD" update-ref refs/heads/docs/llm-wiki-reshape-plan "$TD_WIKI_NEW" "$TD_WIKI_SOURCE"`
   - `git -C "$TD" switch docs/llm-wiki-reshape-plan`

   If the branch changed in the meantime, `update-ref` refuses and the step stops.
5. With approval, push the new OID to `refs/heads/docs/llm-wiki-reshape-plan` and verify it. No PR.

**Success:** the remote wiki branch holds the six changes on the landed canon, then the new-CLI and dual-prerequisite commit.

**On failure:** abort only the task worktree's sequence. Never force-update an unexpected remote wiki branch.

**Go-ahead:** backup-push approval only. Merging the wiki, building its tool and infrastructure work are all out of scope.

### Step 9: Open, verify and merge the backpressure PR

**Preconditions:** step 3 passes, G2's acceptance is recorded in the Effect ledger, and protection and heads have been rechecked.

**Procedure:**
1. With approval, push the verified OID to `lint/oxlint-standards-consolidation` without force, and verify it.
2. With approval, open the PR to `main`. Its body covers:
   - the broader consolidation and breaking Effect upgrade;
   - the introspection cutover;
   - the standalone-install and full-check evidence;
   - both integration routes;
   - MP's acceptance of the executor coverage item (G2) and its evidence.
3. Require `Check` and `Effect integration` to pass on the latest head, by name and with run links.
4. Confirm both pending changesets are present with the intended bumps. MP's merge approval acknowledges that merging starts the release workflow's versioning.
5. Merge with a merge commit and the head pinned: `gh pr merge "$BP_PR" --merge --match-head-commit "$BP_PR_HEAD"`. `main` uses merge commits (PRs #1, #3, #4), and step 6's "`main` has the removal commit" check depends on it. Never squash or use the admin bypass.
6. Fetch `main`, and confirm it has the removal commit, no sibling dependency and no `.introspection/`. Check the `main` `Check` run.

**Success:** the removal is on `main`, which satisfies the archive's consumer dependency.

**On failure:** no bypass for a failed or missing job. If `main` moved incompatibly, reconcile and retest without force-pushing. A failure after the merge blocks the release and the archive until it's diagnosed.

**Go-ahead:** separate approvals for the push, the PR and the merge. This merge authorizes the versioning automation, not publishing.

### Step 10: Verify the Version Packages PR

**Preconditions:** step 9 is merged, and the release workflow has taken its versioning path.

**Procedure:**
1. Find the PR changesets opened, and verify its base, head, author, run and full diff. Check for:
   - the actual versions;
   - both changelogs;
   - both changesets consumed;
   - a consistent lockfile;
   - no unexpected product, credential or workflow changes.
2. MP closes and reopens it, and approves any approval-required run for the reviewed head. Don't add a PAT or App token, and don't rewrite the release automation.
3. Require `Check` and `Effect integration` on the current head. A bot update voids earlier evidence.
4. In a fresh standalone checkout of that exact head, run `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm release:prepare`, which should pass now that the changesets are consumed. Don't run `pnpm release` locally.
5. Verify each package's npm trusted-publisher binding. It must name owner `mplibunao` and repository `backpressure`, with workflow `release.yml` and no environment. Confirm npm meets the existing `11.5.1` minimum.

**Success:** the candidate versions and head are recorded. Local preparation and both runner jobs pass, and the bindings match.

**On failure:** leave the PR unmerged. Never remove release-state checks or add registry tokens. A binding fix needs approval.

**Go-ahead:** MP controls the close and reopen and any run approvals. Publishing waits for step 11.

### Step 11: Publish and verify

**Preconditions:** step 10 passes on the unchanged candidate, and no competing release or `main` update is in flight.

**Go-ahead first:** MP approves merging this exact head, knowing that npm publishing, tags and GitHub releases start immediately. ADR-006 has no later manual gate.

**Procedure:**
1. Merge with the head pinned, and record the release run and its conclusion. Never publish from the workstation.
2. For each actual version, run `npm view "@mplibunao/<pkg>@$VERSION" version dist.integrity dist.tarball dist.attestations gitHead --json` and `npm view @mplibunao/<pkg> dist-tags --json`.
3. Check the matching tags and GitHub releases, resolving annotated tags to commits. Check that provenance points to this repo, workflow and release commit.
4. Compare each registry tarball with what `release:prepare` exercised. `npm pack --dry-run "@mplibunao/<pkg>@$VERSION"` must list exactly the files in the packed-artifact allowlist (`pnpm -r --if-present pack:dry-run:no-build` on the release commit).
5. Install the registry versions into two fresh scratch consumers outside any workspace. The two have incompatible pins.
   - **Plain consumer:** `pnpm add -D --save-exact "@mplibunao/oxlint-standards@$LINT_VERSION" "@mplibunao/tsconfig@$TSCONFIG_VERSION" "oxlint@1.58.0"`. The plugin loads without the Effect patch. All six tsconfig exports resolve (`packages/tsconfig/package.json:22-29`), including `effect.json` and `effect-tsc.json`.
   - **Default Effect route:** the README "Supported versions" pins (`packages/oxlint-standards/README.md:103-107`): `vite-plus@0.3.2`, `oxlint@1.82.0`, `oxlint-tsgolint@7.0.2001`, `@effect/tsgo@0.46.1` and `effect@4.0.0-rc.115`, plus the release-age exclusions if the consumer sets a window. The README verification file reports `effecttsgo(strict-effect-provide)` and `effecttsgo(effect-fn-opportunity)` (`README.md:193`).

   The patched-TypeScript route ran in `release:prepare` against the packed tarballs of the same release commit (`package.json:38`). Step 4 ties those tarballs to the registry ones. Don't touch real consumer repos.
6. For consumers with a release-age window, keep their policy and add exact-version exclusions only with approval. That includes the new backpressure versions. Check each package's publish timestamp instead of assuming a cutoff time.

**Success:** both versions exist, the dist-tags, tags, releases and provenance match, and the registry installs work.

**On failure:** classify any partial publish per package and artifact. A green rerun doesn't repair missing tags or GitHub releases, because `changeset publish` skips versions that are already published and so creates no tags for them. A tag-only or release-only repair needs its own approval and must point at the published commit and changelog. A retry of the canonical workflow needs approval after checking what exists. Never republish a version or move a tag.

### Step 12: Close introspection's PRs and archive

**Preconditions:**
- Steps 5 and 9 are done, and all eight backup refs still match.
- MP has decided on the uncovered local state and approved closing the PRs.

**Procedure:**
1. Recheck the open PRs, running workflows, repo state and npm metadata.
2. With approval, close both PRs without deleting their branches: `gh pr close 2 --repo mplibunao/introspection` and `gh pr close 4 --repo mplibunao/introspection`. Verify each is closed with `mergedAt` null.
3. Re-read the eight backup refs, and confirm npm still has no `0.1.0` and no deprecation on `0.0.1`.
4. With the final approval, run `gh repo archive mplibunao/introspection`, then `gh api repos/mplibunao/introspection --jq '{archived,private,default_branch}'`. Require `archived: true`, unchanged visibility and default branch, and the refs preserved.

**Success:** the repo is archived, the backups remain, PR #2 was never merged, and npm is unchanged.

**On failure:** before the archive, stop and repair the missing evidence. After an ambiguous archive response, read the state before retrying. Unarchive only with approval for a needed repair.

**Go-ahead:** closing the PRs and archiving are separate approvals.

### Step 13: Reconcile and close

**Preconditions:** every lane is done, or has an exception MP accepted.

**Procedure:** complete the journal and check each claim against its evidence:

| Claim | Evidence |
| --- | --- |
| Introspection removed from backpressure tooling | Path review, classified searches, standalone frozen install, full `pnpm check`, landed `main` revision |
| backpressure release delivered | Versions, release run, registry metadata, tags, releases and provenance, registry-consumer results |
| taste canon preserved and landed | The 15-commit mapping, author and order checks, the manifest-only tree difference, local and runner gates, `main` ancestry |
| Wiki work preserved | The six-commit mapping, the dual-prerequisite wording, the passing gate, the remote wiki OID, no wiki PR |
| toolkit backups bounded | The lifecycle OID and the `6964aa8c` remote OID; the decision on the excluded commits |
| introspection recoverable and archived | Eight remote OID matches from a remote clone, the PR states, the archived state, npm unchanged |
| Unrelated work preserved | Before-and-after worktree state and the list of what isn't backed up |

Call the rebuilt taste commits verified replays, not exact backups; the originals stay under local refs.

After the final edits, run `pnpm prose` and `pnpm durable:refs`. Then move this plan to `docs/exec-plans/completed/`, update the inbound links, and land the closeout through an approved documentation PR. Merging it pushes `main`, so check the changesets state first.

**On failure:** leave the plan active at the exact incomplete step. Never delete backup refs, source stashes, source branches, worktrees with uncommitted work, or local app-state directories as part of closing.

**Go-ahead:** the closeout push, PR and merge follow the same approvals as earlier.

## References

- Effect v4 progress ledger: `docs/exec-plans/active/effect-rules-v4-implementation-progress-ledger.md`.
- Changesets and publishing: `docs/decisions/006-changesets-versioning-and-publish-boundary.md`.
- Prose gate: `docs/references/prose-gate.md`.
- taste-distillery router: `/Users/mp/Projects/personal/taste-distillery/CLAUDE.md`; canon `TD-CARD-037` (`cards/ci-and-release/branch-protection-baseline.md`).
