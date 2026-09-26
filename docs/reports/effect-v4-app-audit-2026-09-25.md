# Effect v4 app audit: t3code and executor

This report is the after-change evidence for the Effect v4 rule rework. It repeats the recorded 2026-09-25 app run on the same two snapshots and adds the delegated `@effect/tsgo` rules. It also records the reviewed decision on `effecttsgo/prefer-schema-over-json`. The criteria live in [the plan](../exec-plans/active/effect-rules-v4-implementation-2026-09-25.md) (§3.2 and G2); the before-counts come from [the alignment record](../exec-plans/active/effect-rules-v4-alignment-2026-09-25.md#app-evidence-t3code-and-executor).

Outcome:

- Custom-rule diagnostics fell from 34,030 to 6,414 in t3code and from 13,667 to 3,588 in executor, under the same selection policy. Executor selects the same 1,940 files; t3code selects 3,841, one file fewer than the recorded 3,842 (see below).
- `prefer-schema-over-json` ships `off`. Executor reports 313 hits against a limit of 98, and review found 2 of 321 distinct sites that a Schema rewrite would improve.
- tsgo's `missed-pipeable-opportunity` does not cover the custom pipe rules: 6 of 482 custom spans intersect a tsgo span. The custom rules stay.

Limitation: executor's typed evidence is partial. TypeScript 7 rejects the configs of five executor projects (the root `tsconfig.json`, `apps/cloud`, `apps/local`, `apps/desktop`, and `packages/app`), and the linter skips their files, so the typed passes cover 1,355 of executor's 1,922 script files. Executor's Effect `4.0.0-beta.59` is also below tsgo 0.45.0's supported range (`^4.0.0-beta.107`). No decision here depends on the missing files: the JSON rule ships `off` either way, and missing evidence could never enable it.

## Snapshots and file coverage

| | t3code | executor |
| --- | --- | --- |
| Revision | `53456bc0129f` | `480b390eedd1` |
| Effect | `4.0.0-rc.115` (in tsgo 0.45.0's `^4.0.0-beta.107` range) | `4.0.0-beta.59` (below that range) |
| Working tree | clean clone, frozen `pnpm@11.10.0` install without scripts | clean clone, frozen `bun@1.3.11` install without scripts |
| Files, AST pass | 3,841 (recorded run: 3,842) | 1,940 (recorded run: 1,940) |
| Files, typed passes | 3,802 in 15 TypeScript projects | 1,355 in 41 TypeScript projects |

Selection follows the recorded run: its directory scope (t3code `apps packages scripts infra oxlint-plugin-t3code`; executor `apps packages e2e examples testkit tests scripts`) and its exclusions (`node_modules`, `dist`, `.repos`, `vendor`, `*.gen.ts`, `.generated`, `*.d.ts`, `.astro`). Executor reproduces the recorded count exactly. t3code selects one file fewer than the recorded 3,842; no reading of the recorded policy over the tracked files at this revision gives 3,842.

The typed passes also drop files that have no TypeScript program, because the typed engine would lint them without the app's compiler options:

- `.astro`, `.vue`, and `.svelte` components: 11 in t3code, 18 in executor.
- Plain JavaScript files that no project lists, because no project sets `allowJs`: 28 in t3code, mostly under `apps/desktop/scripts` and `apps/desktop/gnome-extension`.
- Executor's rejected projects. The typed engine rejects five executor tsconfigs, the root, `apps/cloud`, `apps/local`, `apps/desktop`, and `packages/app`. TypeScript 7 flags their option combinations (`TS5069`: `declarationMap` without `declaration`; `TS5096`: `allowImportingTsExtensions` without `noEmit`). The engine reports a `typescript(tsconfig-error)` error and skips the whole program: files in those projects get no tsgo diagnostic at all. With the files that no project lists, that removes 567 executor files, and the executor typed counts cover 1,355 of its 1,922 lintable script files.

## Engines and fingerprints

| Pass | Engine | Config sha256 | Plugin sha256 |
| --- | --- | --- | --- |
| AST (custom rules) | oxlint 1.58.0, 38 Effect and Effect React rules | `3b312a11db5fd3d4` | `bd1c6f3d4206652f` |
| Candidate (shipped composition plus `prefer-schema-over-json: warn`) | patched oxlint `1.82.0`, oxlint-tsgolint `7.0.2001`, `@effect/tsgo` `0.45.0` | `149ac914807949d9` | `86707e64d3f7792e` |
| Shipped (final policy) | same as candidate | `a5a80dde7d671b98` | `bd1c6f3d4206652f` |

The candidate plugin hash predates the final policy text; the rule set it enables is otherwise identical to the shipped pass, and shipped totals equal candidate totals minus exactly the JSON hits (t3code 18,656 − 10, executor 9,699 − 313). Every pass linted exactly the selected files, and each typed pass's audit-owned canary reported the type-resolved `effecttsgo(strict-effect-provide)` diagnostic.

How the typed engine reads an app, verified on the pinned engine:

- It picks each file's project the way tsserver does. It starts at the nearest `tsconfig.json` whose program lists the file and falls back to that project's references and to ancestor tsconfigs. `--tsconfig` changes only import resolution, so the audit does not pass it.
- The audit models the nearest-then-ancestor order but not references, so its coverage is exact only for apps without project references. Neither app has any: none of t3code's 16 or executor's 46 tracked `tsconfig`/`jsconfig` files outside `.repos` sets `references`. In executor, all 1,355 credited files are also in the rejected root program, which is a farther ancestor, and 470 are also pulled into a rejected app program through imports. None has a rejected project nearer than its credited one. The engine agrees: those 470 files get type-dependent tsgo diagnostics at 41%, against 34% for the other 885, while a rejected project's files get none.
- Each file resolves `effect` from its own directory. Every import specifier of `effect` or `effect/*` in the AST selection resolves, with Bun's resolver and with the nearest `node_modules/effect`, to the same package: t3code 1,610 importing files and 7,343 file and specifier pairs, all `4.0.0-rc.115`; executor 927 files and 1,363 pairs, all `4.0.0-beta.59`.
- Each app's own `@effect/language-service` options apply, except severities, which the oxlint config owns. The apps set no `effectFn` value, so tsgo's default `["span"]` applies, not the overlay's three variants. `pipeableMinArgCount` defaults to 2, the overlay's value.
- Inline `@effect-diagnostics` directives are honored. None of the 254 t3code and 34 executor `preferSchemaOverJson:off` directives in the selection has a hit on its next lines.

## Custom rules before and after

AST pass, all selected files. Each cell is source / test, bucketed with the recorded run's test convention (`.test.`, `.spec.`, `.bench.`, and `__tests__/`, `test/`, `tests/`, `e2e/`, `testkit/`, `fixtures/` folders). Row totals reproduce the recorded 34,030 and 13,667. Rules with no hits in either run are omitted.

| Rule | Status | t3code before | t3code after | executor before | executor after |
| --- | --- | --- | --- | --- | --- |
| `no-return-in-callback` | dropped | 6947 / 1850 | 0 / 0 | 1704 / 781 | 0 / 0 |
| `no-return-in-arrow` | dropped | 3755 / 2305 | 0 / 0 | 968 / 791 | 0 / 0 |
| `no-react-state` | kept | 3040 / 12 | 1931 / 5 | 572 / 22 | 229 / 9 |
| `no-manual-effect-channels` | dropped | 2321 / 213 | 0 / 0 | 1050 / 211 | 0 / 0 |
| `no-manual-tag-check` | kept | 1351 / 1250 | 680 / 296 | 3 / 15 | 1 / 5 |
| `no-barrel-import` | kept | 3 / 3 | 3 / 3 | 799 / 841 | 799 / 841 |
| `no-model-overlay-cast` | kept | 175 / 407 | 180 / 407 | 113 / 408 | 113 / 408 |
| `no-naked-object-state-update` | dropped | 289 / 458 | 0 / 0 | 182 / 803 | 0 / 0 |
| `no-string-sentinel-const` | dropped | 421 / 657 | 0 / 0 | 211 / 406 | 0 / 0 |
| `no-return-null` | kept | 770 / 24 | 196 / 34 | 342 / 39 | 162 / 47 |
| `prefer-effect-fn` | kept | 224 / 100 | 224 / 100 | 250 / 136 | 250 / 136 |
| `no-call-tower` | dropped | 156 / 505 | 0 / 0 | 69 / 607 | 0 / 0 |
| `no-effect-call-in-effect-arg` | kept | 105 / 494 | 7 / 10 | 43 / 573 | 8 / 1 |
| `no-try-catch` | kept | 404 / 22 | 422 / 22 | 89 / 51 | 89 / 51 |
| `no-pipe-ladder` | kept | 318 / 253 | 382 / 31 | 17 / 93 | 40 / 6 |
| `no-unknown-error-message` | kept | 421 / 454 | 9 / 1 | 104 / 34 | 18 / 9 |
| `no-effect-succeed-variable` | dropped | 365 / 451 | 0 / 0 | 63 / 126 | 0 / 0 |
| `no-nested-effect-gen` | dropped → tsgo nested-effect-gen-yield | 156 / 576 | 0 / 0 | 21 / 225 | 0 / 0 |
| `no-json-parse` | kept | 57 / 125 | 57 / 125 | 23 / 84 | 23 / 84 |
| `no-instanceof-error` | kept | 220 / 5 | 259 / 5 | 37 / 2 | 37 / 2 |
| `no-switch-statement` | kept | 262 / 4 | 268 / 4 | 4 / 0 | 4 / 0 |
| `no-effect-wrapper-alias` | dropped | 123 / 88 | 0 / 0 | 90 / 189 | 0 / 0 |
| `no-inline-runtime-provide` | dropped → tsgo strict-effect-provide | 42 / 374 | 0 / 0 | 9 / 40 | 0 / 0 |
| `no-promise-catch` | kept | 123 / 7 | 132 / 7 | 6 / 65 | 6 / 65 |
| `no-effect-internal-tags` | kept | 59 / 99 | 58 / 99 | 0 / 0 | 0 / 0 |
| `no-effect-as` | dropped | 137 / 135 | 0 / 0 | 3 / 6 | 0 / 0 |
| `no-promise-reject` | kept | 29 / 49 | 29 / 49 | 8 / 48 | 8 / 48 |
| `no-iife-wrapper` | kept | 78 / 5 | 91 / 5 | 16 / 8 | 16 / 8 |
| `no-effect-escape-hatch` | kept | 76 / 0 | 103 / 0 | 18 / 0 | 24 / 3 |
| `warn-effect-sync-wrapper` | dropped | 53 / 106 | 0 / 0 | 10 / 35 | 0 / 0 |
| `no-effect-never` | dropped | 22 / 134 | 0 / 0 | 0 / 6 | 0 / 0 |
| `no-string-sentinel-return` | dropped | 49 / 77 | 0 / 0 | 7 / 18 | 0 / 0 |
| `no-effect-type-alias` | dropped | 28 / 4 | 0 / 0 | 94 / 20 | 0 / 0 |
| `prefer-schema-inferred-types` | kept | 45 / 0 | 45 / 0 | 0 / 0 | 0 / 0 |
| `no-inline-schema-compile` | kept | 1 / 23 | 19 / 12 | 8 / 9 | 3 / 1 |
| `prefer-effect-predicate` | kept | 26 / 3 | 27 / 3 | 0 / 0 | 0 / 0 |
| `no-instanceof-tagged-error` | kept | 19 / 2 | 19 / 2 | 0 / 1 | 0 / 1 |
| `no-string-error-channel` | kept | new rule | 0 / 12 | new rule | 2 / 28 |
| `no-match-effect-branch` | kept | 20 / 0 | 20 / 0 | 1 / 0 | 1 / 0 |
| `no-branch-in-object` | kept | 13 / 0 | 13 / 0 | 2 / 0 | 2 / 0 |
| `effect-no-multiple-provide` | dropped → tsgo multiple-effect-provide | 1 / 21 | 0 / 0 | 0 / 7 | 0 / 0 |
| `prefer-yield-tagged-error` | dropped → tsgo unnecessary-fail-yieldable-error | 23 / 1 | 0 / 0 | 0 / 0 | 0 / 0 |
| `no-nested-effect-call` | dropped | 0 / 0 | 0 / 0 | 5 / 13 | 0 / 0 |
| `no-effect-sync-console` | dropped → tsgo global-console-in-effect | 0 / 0 | 0 / 0 | 11 / 0 | 0 / 0 |
| `no-redundant-error-factory` | kept | 4 / 0 | 4 / 0 | 0 / 0 | 0 / 0 |
| `no-fromnullable-nullish-coalesce` | kept | 0 / 0 | 2 / 1 | 0 / 0 | 0 / 0 |
| `no-effect-side-effect-wrapper` | kept | 0 / 0 | 0 / 0 | 2 / 0 | 0 / 0 |
| `no-effect-all-step-sequencing` | kept | 1 / 0 | 1 / 0 | 0 / 0 | 0 / 0 |
| `no-atom-registry-effect-sync` | kept | 2 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Reading the table:

- Dropped rules report nothing, which removes most of the volume: `no-return-in-callback`, `no-return-in-arrow`, `no-manual-effect-channels`, `no-string-sentinel-const`, and `no-naked-object-state-update` alone were 26,323 of the 47,697 recorded diagnostics.
- `no-react-state` fell from 3,052 to 1,936 in t3code and from 594 to 238 in executor, and `no-return-null` from 794 to 230 and 381 to 209, after their narrowings.
- `no-pipe-ladder` rose in t3code source code, from 318 to 382, while its test hits fell from 253 to 31. The narrowing first brought t3code to 272 source hits. Its review fixes then counted pipelines nested inside a non-chain receiver, such as `Effect.all([x.pipe(...)]).pipe(...)` (348), and pipelines inside `Effect.catchTags` handler callbacks (382). Both are nesting under the rule's contract, and this run still gives 382. 337 of its 413 t3code hits (82%) and 31 of 43 in executor are one-step pipelines such as `.pipe(Effect.as(null))`, mostly inside `Effect.flatMap` (155) and `Effect.catch` (70) callbacks.
- `no-string-error-channel` is new. `no-manual-tag-check` now reports only hand-written `_tag` comparisons.

## Typed pass at the shipped composition

| | t3code | executor |
| --- | --- | --- |
| Diagnostics | 18,646 | 9,386 |
| Custom rules | 6,414 | 2,848 |
| tsgo rules | 12,187 | 6,538 |
| Native oxlint rules | 45 | 0 |
| Errors / warnings | 6,434 / 12,212 | 3,965 / 5,421 |

Under `--max-warnings 0` every one of these fails the lint gate; the split sets triage order. 61 tsgo rules report in at least one app. The 25 largest, as source / test:

| tsgo rule | Severity | t3code | executor |
| --- | --- | --- | --- |
| `async-function` | warn | 1120 / 2999 | 668 / 1856 |
| `new-schema-class` | warn | 2452 / 597 | 242 / 9 |
| `missing-pipeable-signature` | warn | 1461 / 2 | 408 / 8 |
| `missed-pipeable-opportunity` | warn | 713 / 98 | 12 / 1 |
| `any-unknown-in-error-context` | error | 20 / 11 | 129 / 532 |
| `global-date` | warn | 253 / 58 | 133 / 117 |
| `node-builtin-import` | warn | 45 / 28 | 160 / 293 |
| `schema-number` | warn | 401 / 26 | 75 / 23 |
| `process-env` | warn | 109 / 21 | 188 / 157 |
| `new-promise` | warn | 97 / 230 | 62 / 73 |
| `schema-sync` | warn | 82 / 173 | 19 / 23 |
| `global-console` | warn | 132 / 0 | 148 / 6 |
| `prefer-succeed-some-or-none` | warn | 26 / 202 | 11 / 2 |
| `global-console-in-effect` | error | 0 / 0 | 197 / 9 |
| `global-date-in-effect` | error | 6 / 0 | 70 / 123 |
| `global-timers` | warn | 91 / 8 | 50 / 32 |
| `process-env-in-effect` | error | 20 / 89 | 15 / 17 |
| `global-fetch-in-effect` | warn | 0 / 0 | 26 / 114 |
| `lazy-effect` | warn | 77 / 8 | 34 / 0 |
| `global-fetch` | warn | 22 / 4 | 43 / 46 |
| `unnecessary-arrow-block` | warn | 77 / 9 | 20 / 4 |
| `strict-effect-provide` | error | 74 / 0 | 35 / 0 |
| `catch-to-or-else-succeed` | warn | 12 / 0 | 50 / 9 |
| `prefer-schema-type-property` | warn | 68 / 0 | 1 / 0 |
| `global-error-in-effect-failure` | error | 0 / 0 | 66 / 1 |
| 36 more rules | | 266 | 221 |

## JSON rule decision

§3.2 sets two conditions for `warn`: at most 69 hits in t3code and 98 in executor, and a review of every hit showing that a Schema rewrite would improve that code. Missing or unusable evidence cannot justify enabling it.

| | t3code | executor |
| --- | --- | --- |
| Hits (source / test, audit convention) | 10 (5 / 5) | 313 (63 / 250) |
| Distinct sites | 8 (the engine reports two sites twice) | 313 |
| Volume limit | 69, passes | 98, fails |
| Sites a Schema rewrite improves | 1 | 1 |

Decision: **off**. Both conditions fail. Executor's volume is over the limit on only 70% of its files, and the uncovered files can only add hits. Review fails in both apps: the hits are almost all intentional serialization, the noise §3.2 names.

Both apps already run this rule through their own tsgo setup, which corroborates the review. t3code sets it to `error` and suppresses it inline at 254 sites, 246 of them in tests, with reasons such as `CLI JSON output is decoded as a presentation DTO` and `fixed launcher-owned document`. Executor turns it off in 8 package tsconfigs and suppresses it inline at 34 sites. The engine ignores tsconfig severities, so hits in those 8 packages are counted above; it honors the inline directives, so the 288 suppressed sites are not.

The two sites that would improve:

- `t3code apps/mobile/src/connection/migration.ts:94`: it parses to `unknown` and then decodes with a schema, so `Schema.fromJsonString(...)` makes it one decode with one error.
- `executor apps/cli/src/tooling.ts:135`: it parses CLI arguments and then checks `isRecord`, which a record schema over `Schema.fromJsonString` replaces.

t3code, every site:

| Site | Verdict |
| --- | --- |
| `apps/mobile/src/connection/migration.ts:94` | Yes, as above. |
| `apps/mobile/src/persistence/mobile-storage.ts:143` (reported twice) | No. A generic storage writer serializes an `unknown` value; no schema exists at that layer. |
| `apps/mobile/src/persistence/mobile-preferences.ts:249` (reported twice) | No. The same generic encoder. |
| `apps/mobile/src/connection/migration.test.ts:13`, `:59` | No. It builds legacy input documents. |
| `apps/mobile/src/connection/storage.test.ts:54`, `:70` | No. It seeds storage fixtures. |
| `apps/mobile/src/connection/environment-cache-store.test.ts:132` | No. It seeds a cached-document fixture. |

Executor, every site, grouped. Source / test here uses the recorded-run convention, which counts `e2e/` as test:

| Group | Hits (source / test) | Verdict | Sites (file, lines) |
| --- | --- | --- | --- |
| wire/protocol body or payload (HTTP, MCP, NDJSON, worker) | 76 (6 / 70) | No. The value is already typed; a Schema encode restates what the types say. | `apps/host-selfhost/src/mcp/auth.ts` 148; `e2e/cloud/connection-modal-oauth-abandon.test.ts` 52; `e2e/cloud/connection-owner-isolation.test.ts` 80; `e2e/cloud/connections-list-scope.test.ts` 78; `e2e/cloud/dcr-root-domain-isolation.test.ts` 80; `e2e/cloud/mcp-browser-approval-org-scope.test.ts` 94; `e2e/cloud/mcp-browser-resume-page.test.ts` 145; `e2e/cloud/mcp-destroyed-session-envelope.test.ts` 335; `e2e/cloud/mcp-protocol.test.ts` 389; `e2e/cloud/mcp-workos-blip-session-survival.test.ts` 271; `e2e/cloud/member-invite-seat-limit.test.ts` 118; `e2e/cloud/oauth-callback-org-scope.test.ts` 127; `e2e/cloud/oauth-connections.test.ts` 121; `e2e/cloud/org-last-visited.test.ts` 41; `e2e/cloud/org-multitab-cookie.test.ts` 122; `e2e/cloud/org-slug-foreign.test.ts` 40; `e2e/cloud/spec-update-convergence.test.ts` 123; `e2e/cloud/storage-error-report-shape.test.ts` 136; `e2e/cloud/support/session.ts` 81; `e2e/scenarios/artifact-hyphenated-path.test.ts` 47; `e2e/scenarios/connect-handoff-session.test.ts` 82; `e2e/scenarios/connection-setup-ux.test.ts` 70; `e2e/scenarios/mcp-execute.test.ts` 135; `e2e/scenarios/resume-after-sandbox-deadline.test.ts` 128, 144; `e2e/scenarios/toolkits-mcp.test.ts` 182; `e2e/selfhost/mcp-browser-approval-live-role.test.ts` 95, 110, 140; `e2e/selfhost/mcp-browser-approval-ownership.test.ts` 81; `e2e/selfhost/mcp-connect-card-url.test.ts` 56; `e2e/selfhost/mcp-oauth-consent.test.ts` 57; `e2e/selfhost/oauth-optional-scopes.test.ts` 60; `e2e/selfhost/oauth-popup-callback-org-state.test.ts` 65; `e2e/src/emulator-instance.ts` 27; `e2e/src/integration-creation-permissions.ts` 22; `e2e/src/surfaces/api.ts` 50; `e2e/src/surfaces/autumn.ts` 220, 252, 272, 299, 329; `e2e/src/surfaces/mcp.ts` 385, 479; `e2e/src/workspace-write-permissions.ts` 66; `e2e/targets/cloud.ts` 90; `examples/all-plugins/src/main.ts` 317; `packages/core/api/src/scoped-targets.test.ts` 100, 119, 194; `packages/core/sdk/src/sqlite-config-blob-migration.test.ts` 45, 132; `packages/core/test-servers/src/worker.test.ts` 206; `packages/hosts/mcp/src/tool-server.ts` 1363, 1448; `packages/kernel/runtime-deno-subprocess/src/index.ts` 170; `packages/plugins/mcp/src/api/handlers.test.ts` 83, 112, 143; `packages/plugins/openapi/src/providers/google/presets.test.ts` 344; `packages/plugins/openapi/src/sdk/plugin.test.ts` 1055, 1137; `packages/plugins/openapi/src/sdk/preview-oauth2.test.ts` 68, 121, 148, 171, 189; `packages/plugins/openapi/src/sdk/spec-blob.test.ts` 322; `packages/plugins/openapi/src/sdk/streaming-response.test.ts` 146, 147, 148, 175, 176, 209, 300; `packages/react/src/routes/resume.$executionId.tsx` 108 |
| assertion over serialized text (toContain / not.toContain / rendered cause) | 52 (0 / 52) | No. The test searches the serialized text on purpose. | `e2e/cloud/account-api.test.ts` 67; `e2e/cloud/admin-users.test.ts` 207, 210, 287; `e2e/cloud/auth-tool-failures.test.ts` 94; `e2e/cloud/connection-owner-isolation.test.ts` 217; `e2e/cloud/connections-credentials.test.ts` 130, 137, 146; `e2e/cloud/mcp-priming-reconnect.test.ts` 214; `e2e/cloud/mcp-sse-replay.test.ts` 278, 353, 383; `e2e/cloud/oauth-connections.test.ts` 96; `e2e/cloud/tenant-isolation.test.ts` 107; `e2e/scenarios/mcp-passthrough.test.ts` 339; `e2e/scenarios/no-auth-connection.test.ts` 215; `e2e/scenarios/oauth-refresh-scope-fallback.test.ts` 248; `e2e/scenarios/tool-call-contract.test.ts` 229; `e2e/selfhost/mcp-session-resource-cleanup.test.ts` 65; `packages/core/sdk/src/oauth-ema-rollout.test.ts` 436; `packages/core/sdk/src/oauth-flow.test.ts` 1922, 1949; `packages/core/sdk/src/oauth-helpers.test.ts` 421, 793, 905, 935, 972, 988, 1013, 1066, 1110, 1138, 1169, 1199, 1230, 1272, 1295, 1327, 1393, 1829; `packages/core/sdk/src/oauth-list-clients.test.ts` 107; `packages/core/sdk/src/oauth-register-dynamic.test.ts` 142; `packages/core/sdk/src/oauth-session-cleanup.test.ts` 258; `packages/core/sdk/src/platform-view.test.ts` 682, 745, 839; `packages/plugins/onepassword/src/sdk/plugin.test.ts` 166, 167; `packages/plugins/openapi/src/sdk/non-json-body.test.ts` 436, 577; `packages/plugins/openapi/src/sdk/upstream-failures.test.ts` 595 |
| message text: JSON.stringify quotes a value in an error, assertion, or log message | 49 (11 / 38) | No. It quotes a value inside a message. | `e2e/cloud/connections-list-scope.test.ts` 130; `e2e/scenarios/artifacts.test.ts` 237; `e2e/scenarios/connect-handoff-session.test.ts` 86, 130, 137, 187; `e2e/scenarios/connect-handoff.test.ts` 116, 196, 200, 253; `e2e/scenarios/google-disabled-api.test.ts` 240, 266; `e2e/scenarios/google-health-checks.test.ts` 279, 379; `e2e/scenarios/no-auth-connection.test.ts` 172, 181, 192, 203, 212; `e2e/scenarios/oauth-client-handoff.test.ts` 385, 441, 453; `e2e/scenarios/oauth-refresh-on-401.test.ts` 278; `e2e/scenarios/oauth-refresh-scope-fallback.test.ts` 245; `e2e/scenarios/openapi-ndjson-output.test.ts` 190, 206; `e2e/scenarios/tool-call-contract.test.ts` 210, 227, 341, 617; `e2e/selfhost/execute-emit-envelope.test.ts` 68, 80, 84, 91; `e2e/selfhost/oauth-org-connection-cross-principal.test.ts` 237, 254; `e2e/selfhost/oauth-resource-indicator-clear.test.ts` 186; `packages/core/sdk/src/oauth-scope-union.test.ts` 853; `packages/plugins/encrypted-secrets/src/repartition-migration.ts` 83; `packages/plugins/openapi/src/sdk/spec-overrides.ts` 116, 121, 136, 140, 147, 169, 174, 193, 231 |
| parse of tool/CLI/HTTP output cast to a type (tests, e2e harness) | 45 (0 / 45) | Marginal, counted as no. A decode would check the shape, but a wrong shape already fails the test. | `e2e/cloud/cli-device-login.test.ts` 149, 224; `e2e/cloud/connections-list-scope.test.ts` 41; `e2e/cloud/credential-write-durability.test.ts` 387, 574, 657; `e2e/cloud/mcp-browser-resume-page.test.ts` 152; `e2e/cloud/oauth-connections.test.ts` 202; `e2e/scenarios/connect-handoff-session.test.ts` 74; `e2e/scenarios/connect-handoff.test.ts` 102; `e2e/scenarios/mcp-catalog-sync.test.ts` 226, 315; `e2e/scenarios/microsoft-emulator.test.ts` 183; `e2e/scenarios/namespace-enumeration.test.ts` 125; `e2e/scenarios/no-auth-connection.test.ts` 153; `e2e/scenarios/oauth-client-handoff.test.ts` 64, 151, 241; `e2e/scenarios/oauth-refresh-on-401.test.ts` 257; `e2e/scenarios/oauth-refresh-rejected.test.ts` 240; `e2e/scenarios/oauth-refresh-scope-fallback.test.ts` 238; `e2e/scenarios/oauth-scope-insufficient.test.ts` 268; `e2e/scenarios/oauth-setup-failure-cause.test.ts` 66; `e2e/scenarios/openapi-ndjson-output.test.ts` 158; `e2e/scenarios/openapi-unknown-args.test.ts` 133; `e2e/scenarios/openapi-update-spec.test.ts` 125; `e2e/scenarios/shape-memory.test.ts` 128, 148; `e2e/scenarios/tool-call-contract.test.ts` 207, 224, 614; `e2e/scenarios/tool-descriptions.test.ts` 449; `e2e/scenarios/toolkits-mcp.test.ts` 101, 526; `e2e/scripts/cli.ts` 452; `e2e/selfhost/cli-device-login.test.ts` 120; `e2e/selfhost/mcp-enterprise-managed-auth.test.ts` 306; `e2e/selfhost/mcp-session-idle-eviction.test.ts` 151; `packages/kernel/runtime-dynamic-worker/src/integration.test.ts` 350; `packages/plugins/mcp/src/sdk/appserver-connector.test.ts` 212, 363; `packages/plugins/openapi/src/sdk/plugin.test.ts` 1054, 1136 |
| test fixture text (input documents, rows, storage values) | 27 (0 / 27) | No. It builds test input. | `apps/cli/src/server-profile.test.ts` 194; `e2e/scenarios/mcp-execute.test.ts` 65, 140; `e2e/scenarios/run-panel-auto-approve.test.ts` 111; `e2e/scenarios/tool-descriptions.test.ts` 465; `e2e/src/clients/chat-theater.ts` 86; `e2e/src/scenario.ts` 162, 177; `packages/core/api/src/admin/admin-users.test.ts` 131, 144; `packages/core/sdk/src/platform-view.test.ts` 115, 122, 153; `packages/plugins/mcp/src/sdk/appserver-connector.test.ts` 63; `packages/plugins/mcp/src/sdk/probe-shape.test.ts` 444; `packages/plugins/onepassword/src/sdk/plugin.test.ts` 260, 287; `packages/plugins/openapi/src/sdk/extract.test.ts` 14, 56, 102, 146, 185; `packages/plugins/openapi/src/sdk/parse.test.ts` 18; `packages/plugins/openapi/src/sdk/preview-streaming.test.ts` 172; `packages/plugins/openapi/src/sdk/spec-blob.test.ts` 203; `packages/plugins/openapi/src/sdk/streaming-response.test.ts` 159, 189 |
| stored JSON column or file write (migration, config, secrets, CLI state) | 22 (12 / 10) | No. It writes generic JSON or an already-typed value; a schema belongs on the reading side. | `apps/cli/src/daemon-state.ts` 130, 265, 323; `apps/host-cloudflare/src/db/data-migrations.test.ts` 201, 216, 217; `packages/core/config/src/write.ts` 133; `packages/core/sdk/src/sqlite-config-blob-migration.ts` 99; `packages/plugins/encrypted-secrets/src/repartition-migration.test.ts` 36; `packages/plugins/file-secrets/src/index.ts` 152; `packages/plugins/openapi/src/sdk/output-schema-migration.test.ts` 74, 75, 76, 84, 97; `packages/plugins/openapi/src/sdk/output-schema-migration.ts` 104; `packages/plugins/openapi/src/sdk/plugin.ts` 938, 1060; `packages/plugins/provider-service-split/src/sqlite.test.ts` 230; `packages/plugins/provider-service-split/src/sqlite.ts` 329, 330, 425 |
| code generation: JSON.stringify quotes a literal into generated source | 17 (0 / 17) | No. It quotes a literal into generated code. | `e2e/cloud/mcp-priming-reconnect.test.ts` 183; `e2e/cloud/mcp-session-cap-eviction.test.ts` 304; `e2e/cloud/mcp-session-idle-runtime-disposal.test.ts` 196, 242; `e2e/scenarios/auth-methods.test.ts` 378; `e2e/scenarios/mcp-execute.test.ts` 61; `e2e/scenarios/namespace-enumeration.test.ts` 96, 98, 104; `e2e/scenarios/tool-call-contract.test.ts` 277, 278, 292, 293; `e2e/scenarios/toolkits-mcp.test.ts` 751; `e2e/selfhost/oauth-optional-scopes.test.ts` 154; `e2e/selfhost/vercel-oauth-lifecycle.test.ts` 125; `packages/plugins/mcp/src/sdk/appserver-connector.test.ts` 324 |
| structured log line | 11 (6 / 5) | No. It is a structured log line. | `e2e/cloud/repro-listener-supersede.test.ts` 113, 117; `e2e/selfhost/mcp-oauth-tool-refresh-reauth.test.ts` 232, 283, 354; `packages/hosts/cloudflare/src/mcp/agent-session-durable-object.ts` 1083, 1140, 1201, 1227, 1252, 2195 |
| cache key, row id, or fingerprint | 10 (7 / 3) | No. It builds a key or fingerprint. | `apps/host-cloudflare/src/db/data-migrations.ts` 212; `packages/core/sdk/src/shape-memory.ts` 54, 67; `packages/core/sdk/src/sqlite-config-blob-migration.test.ts` 73; `packages/core/sdk/src/sqlite-config-blob-migration.ts` 97; `packages/plugins/graphql/src/sdk/plugin.ts` 954; `packages/plugins/onepassword/src/sdk/plugin.ts` 446; `packages/plugins/openapi/src/providers/google/openapi-ownership-migration.test.ts` 241; `packages/plugins/provider-service-split/src/sqlite.test.ts` 338; `packages/plugins/provider-service-split/src/sqlite.ts` 311 |
| CLI console output | 3 (3 / 0) | No. It prints CLI output. | `apps/cli/src/main.ts` 1045, 1048, 1066 |
| parse-then-check (improves) | 1 (1 / 0) | Yes. `Schema.fromJsonString` with a record schema replaces the parse plus the `isRecord` check. | `apps/cli/src/tooling.ts` 135 |

## Pipe-opportunity comparison

Span identities from the shipped pass. A custom span counts as covered when its character range intersects a `missed-pipeable-opportunity` span in the same file.

| | t3code | executor |
| --- | --- | --- |
| `missed-pipeable-opportunity` spans | 811 | 13 |
| ... whose outer call is a `Schema` constructor | 620 | 6 |
| `no-pipe-ladder` spans intersecting a tsgo span | 6 of 413 | 0 of 43 |
| `no-effect-call-in-effect-arg` spans intersecting a tsgo span | 0 of 17 | 0 of 9 |
| `no-effect-ladder`, `no-flatmap-ladder` spans | 0 | 0 |

The two checks target different code. tsgo reports data-first nesting that could be piped, mostly nested Schema constructors such as `Schema.optional(Schema.NullOr(Schema.String))`. The custom rules report Effect pipelines nested inside other pipelines or transforming callbacks, and data-first Effect calls nested in Effect arguments. tsgo does not cover the custom rules, so they stay.

## Effect.fn overlap

`prefer-effect-fn` reports 324 wrappers in t3code and 339 in the executor typed selection; `effecttsgo/effect-fn-opportunity` reports 2 and 1, with no shared line. The apps leave `effectFn` at tsgo's default `["span"]`, which reports only `Effect.withSpan` wrappers, and tsgo 0.45.0 drops Effect options inherited through `extends` (Effect-TS/tsgo#766). Under both, the custom rule remains the only check that reports plain `Effect.gen` wrappers in these apps.

## Reproducing

Clone each app at its revision outside the source checkout and install with its own lockfile, frozen, without lifecycle scripts. Then run from the backpressure root, once per app for the typed modes, because exclusions apply to every named app:

```sh
bun scripts/checks/effect-app-audit.ts --mode ast --output <dir> \
    --app t3code=<t3code clone>@53456bc01 --app executor=<executor clone>@480b390ee \
    --exclude '**/vendor/**' --exclude '**/*.gen.ts' --exclude '**/.generated/**' \
    --exclude '**/.astro/**' --exclude '**/.repos/**' --exclude '.github/**' \
    --exclude 'native/**' --exclude 'vite.config.ts' --exclude 'vitest.config.ts' \
    --exclude 'knip.config.ts' --exclude 'autumn.config.ts'
```

The typed modes take `--mode candidate` or `--mode shipped`, one `--app`, the same exclusions, and `--exclude '**/*.{astro,vue,svelte}'`. The first typed run refuses and lists the files no accepted project covers; pass each of them as an exact `--exclude` path to get the usable run recorded here.
