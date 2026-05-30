[toc]
# Investigation: Porting `@catenarycloud/linteffect` (Biome GritQL) to oxlint or ast-grep

## Summary
<!-- Filled in Phase 5 -->
Investigating whether to port the `@catenarycloud/linteffect` Effect-TS lint rules
(current baseline after the v0.0.6 refresh: 50 Biome GritQL `.grit` plugins; the earlier 52 count in this investigation was stale/miscounted) to **oxlint** (bundled in vite-plus) or
**ast-grep**, how hard a first npm publish is, and what to name the resulting repo.

## Question / Scope
1. **Port target**: oxlint (oxc custom plugins) vs ast-grep — which is the better move?
2. **npm publishing**: how difficult is it for a first-timer to publish a package?
3. **Repo name**: recommendation for the new repo.

## Source material facts (Phase 1, verified by direct read)
- Package: `@catenarycloud/linteffect` (npm, scoped, MIT, Projen-managed). Author: Roman Naumenko / catenary.cloud.
- Current baseline: 50 rules under `rules/*.grit`, written in **GritQL** (Biome plugin format). Earlier phase notes used 52; treat that as stale/miscounted after the v0.0.6 refresh.
- Rule shape: `file($body) where { ... contains <pattern> ... register_diagnostic(...) }`.
  - **Structural/syntactic only** — matches by identifier name (`Effect.flatMap`, `Ref.set`), no type resolution.
  - **Detection-only**: rule guidance (`docs/rule-guidance.md`) explicitly says avoid rewrites, suppressions, multi-file matches.
  - Single-file scope; `contains` for context; `or`/`where`/`as` captures; `bubble` for metavar scoping.
- Several rules (e.g. `no-effect-ladder.grit`) enumerate 6 near-duplicate binding contexts (const / typed const / return x 1-2 args) — a GritQL ergonomics limitation.
- Distribution: presets (`core`/`web`/`ts-type`/`full`) via `package.json` `exports`, plus a zero-setup CLI (`bin/linteffect.mjs`) that writes a temp Biome config and shells out to the bundled Biome binary.
- Tests: sparse Vitest specs that shell out to `biome lint` against `tests/fixtures/<rule>/{valid,invalid}-*.ts`; only 4 of 50 rules currently ship fixture-backed tests (`no-family-collection-read`, `no-model-overlay-cast`, `no-naked-object-state-update`, `no-switch-statement`).

## Background / Prior Research
<!-- Phase 1.5 explore agents: oxlint plugin API, ast-grep capabilities, npm publishing, prior art, naming. -->

## Investigator Findings
<!-- Pair investigator: rule categorization + proof-of-concept ports in ast-grep and oxlint. -->

## Investigation Log

## Root Cause / Analysis
<!-- Phase 5 -->

## Recommendations
<!-- Phase 5: (1) port target, (2) npm publishing path, (3) repo name -->

## Preventive Measures

### Naming conventions (research agent, Sonnet)
- **ESLint**: `eslint-plugin-<name>`, scoped `@scope/eslint-plugin[-<name>]`, configs `eslint-config-<name>`. ESLint auto-resolves the `eslint-plugin-` prefix in config.
- **oxlint JS plugins are ALPHA (2026-03-11)** — https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha / https://oxc.rs/docs/guide/usage/linter/js-plugins. They implement the **ESLint-compatible plugin API**, so an `eslint-plugin-*` package works in oxlint too, referenced by full npm name. **No prefix auto-resolution** and no `oxlint-plugin-` convention.
- **ast-grep**: no formal naming/distribution convention. Dominant model is a GitHub repo of YAML (`rules/<lang>/<cat>/<id>.yml`) consumed via `sgconfig.yml` path refs (e.g. `coderabbitai/ast-grep-essentials`, not on npm).
- npm hard name rules: <=214 chars, all-lowercase, no leading `.`/`_`, URL-safe, hyphens OK; scope `@org/name`.
- Effect-team naming pattern: `@effect/eslint-plugin`, `@effect/codemod` (engine-neutral nouns).
- `@catenarycloud/linteffect` **not found in public npm search** (source `package.json` is `version 0.0.0` — likely never published / WIP template).
- Naming recommendation from agent: engine-neutral (e.g. `@scope/effect-lint`) if multi-engine future; `@scope/eslint-plugin-effect` if ESLint-first (gets auto-resolution). Engine-tied `oxlint-*` buys nothing (no registry).

### oxlint custom-plugin state (research agent, Sonnet)
- **Mechanism**: `jsPlugins` config key in `.oxlintrc.json` loads local files / npm packages. Rules use the **ESLint-v9-compatible API** (`create(context)` + AST node visitors). Existing `eslint-plugin-*` packages work unmodified.
- **Maturity**: technical preview Oct 2025 → **ALPHA 2026-03-11** ("ready for adoption in real projects" but "under active development"; plugin-specific APIs like `createOnce` may break). oxlint core stable (v1.x, ~1.6x by May 2026).
- **Autofix**: YES — standard ESLint `fix(fixer)` in `context.report()`; LSP applies live.
- **Type info**: ❌ NOT exposed to user JS plugins ("TS type-aware rules — not supported yet"). oxlint has built-in type-aware rules via tsgolint, but the type bridge isn't available to custom plugins. **Irrelevant for linteffect rules — they use no type info.**
- **API surface**: `node.parent` ✅, `context.report` ✅, `sourceCode.getText/getAncestors` ✅, selectors ✅, scope analysis ✅, inline disables ✅, LSP/IDE ✅.
- **Authoring caveat**: TS plugin files aren't directly loadable via `jsPlugins` — need compiled `.js` or a loader (oxc#19752); `createRule()` TS types have a known bug (oxc#18154). Normal "author in TS, ship JS" build resolves this.
- **Perf**: "raw transfer" shared-memory AST (no JSON serialization) → ~7-15x faster than ESLint in benchmarks; JS-plugin rules slower than native Rust rules but fast enough. (Oct 2025 preview benchmarks had a config bug inflating numbers; Mar 2026 alpha numbers more reliable.)
- Docs: https://oxc.rs/docs/guide/usage/linter/writing-js-plugins , https://oxc.rs/docs/guide/usage/linter/js-plugins , https://voidzero.dev/posts/announcing-oxlint-js-plugins
- **Implication**: linteffect rules can be written ONCE as an ESLint-compatible JS plugin and run in BOTH oxlint (`vp lint`) and ESLint, with autofix. Cost: imperative JS per rule + alpha-stage churn.

### ast-grep capabilities (research agent, Sonnet)
- **Rule schema**: `id`/`language`/`severity`/`message` + `rule:` with atomic (`pattern`/`kind`/`regex`/`nthChild`), relational (`inside`/`has`/`follows`/`precedes` + `stopBy: end`/`field`), composite (`all`/`any`/`not`/`matches`), `constraints` (per-metavar), `utils` (local named sub-rules; global via `utilDirs`). Multiple rules per file with `---`.
- **`contains`/`bubble` analog**: GritQL `contains X` → ast-grep `has: { stopBy: end, ... }` (or `inside`). Direct mapping for the linteffect rule shape.
- **File-import gating** ✅: match target node `inside: { stopBy: end, kind: program, has: { stopBy: end, kind: import_statement, regex: "from ['\"]effect['\"]" } }`. (Confirm node names with `sg --debug-query`.)
- **Testing** ✅: `sg test` with `valid:`/`invalid:` snippet lists + `__snapshots__` capturing span+message; `--update-all`, `--interactive`, `--skip-snapshot-tests`.
- **Autofix** ✅: `fix:` template (textual metavar substitution, not reparsed), `FixConfig` (`expandStart`/`expandEnd` to eat punctuation), experimental `rewriters` for per-element `$$$` transforms. **Beats current GritQL pack (detection-only).**
- **Project config**: `sgconfig.yml` with `ruleDirs`, `utilDirs`, `testConfigs`, `languageGlobs`, `customLanguages`. `sg scan` walks up to find config (monorepo-friendly).
- **Distribution**: npm pack with YAML vendoring — consumer adds `node_modules/@org/pack/rules` to `ruleDirs`. **No `extends:` shorthand, no registry** (weakest part). `@ast-grep/cli` installs `sg` binary via npm (no Rust). `@ast-grep/napi` is programmatic AST API, NOT a YAML rule loader.
- **Limits**: no type info (same as GritQL — fine), no scope/flow/multi-file analysis. **Metavariable consistency is STRICTER than GritQL `bubble`** (same `$VAR` twice must match identical nodes); "constrained meta-vars usually don't work inside `not`"; `$$$` is lazy. → PoC ports must validate these.
- Maturity: `sg` ~v0.42 (May 2026), LSP + VS Code ext, active. Docs: https://ast-grep.github.io/reference/rule.html , /guide/project/project-config.html , /guide/test-rule.html . GritQL-vs-ast-grep comparison: https://dev.to/herrington_darkholme/biomes-gritql-plugin-vs-ast-grep-...-29j2

### Prior art (research agent, Sonnet)
- **`@effect-oxlint/effect-oxlint`** (jsr.io/@effect-oxlint/effect-oxlint, gh:mpsuesser/effect-oxlint, v0.3.1 May 2026, 30★, **0 dependents**): an SDK/framework for AUTHORING oxlint custom rules with Effect v4 idioms (typed `Diagnostic.*`, `Visitor.*`, `Option`-safe `AST.*`, `Testing.*` w/ @effect/vitest). NOT a rule pack — zero shipped rules. Unproven (0 dependents).
- **`Rika-Labs/oxlint-standards`** (gh): most mature published oxlint Effect rule set (~12 rules: `no-or-die`, `prefer-gen-over-flatmap-chain`, `no-effect-return-in-map`, `require-span-name`, `no-raw-promises`, `no-try-catch`, `no-async-await`, `no-looped-effects`, ...) under `@rikalabs/`, implemented as oxlint JS plugins. Closest existing overlap to audit against.
- **`@effect/eslint-plugin`** (official Effect-TS, v0.3.2): only **2 rules** (`dprint`, `no-import-from-barrel-package`). Thin; not composition-focused.
- **ast-grep Effect rules: NONE exist** (catalog has XState/barrel/console rules only). Porting to ast-grep = first mover.
- **No published GritQL→ast-grep/oxlint porting tooling** — each port is manual translation.
- ⚠️ **TO VERIFY**: agent reports `@catenarycloud/linteffect` Issue #4 (closed Apr 2026) "Add full Oxlint/lintcn parity" merged an oxlint port (`compat/ported-rules.mjs`, `yarn oxlint:test`). BUT the checked-out tree shows no `compat/` and deps list only Biome. Needs git-log/grep verification (next).
- Source pack now published: `@catenarycloud/linteffect` v0.0.4-2 (May 12 2026), 64★, 50 rules, active.

### ⚠️ Verification (agent — git log + grep, biome-effect-linting-rules)
- Research agent claimed `@catenarycloud/linteffect` Issue #4 merged an oxlint port (`compat/ported-rules.mjs`, `yarn oxlint:test`). **NOT corroborated by the actual repo.** Full 22-commit history (`ac52ae2` init Apr 7 2026 → `2e8ee2e` May 13 2026) shows GritQL-only rule development; no oxlint commit. `grep oxlint|compat|ported-rules|lintcn` matched only unrelated `yarn.lock` PnP builtins (`compat/fsevents|resolve|typescript`). **Conclusion: no existing oxlint port in source; we'd be porting from scratch** (Rika-Labs/oxlint-standards remains the only external partial overlap to audit, ~12 rules).

### npm first-publish in 2026 (research agent, Sonnet)
- **Difficulty: LOW** with modern tooling, but 3 traps from late-2025 policy changes break old tutorials:
  1. **Classic tokens dead** (revoked Nov 19 2025) → use **Trusted Publishing (OIDC)** from GitHub Actions (GA Jul 31 2025) — no stored `NPM_TOKEN`. Configure at npmjs.com/package/<pkg>/access → Trusted Publishers.
  2. **Scoped pkg first publish** needs `publishConfig.access: "public"` (or `--access public`) or you get a misleading 402/403.
  3. **`files` allowlist** required or you ship the whole repo. Verify with `npm pack --dry-run`.
- 2FA: WebAuthn/passkeys only (TOTP deprecated Sep 2025). Username = personal scope (`mp` → `@mp` free).
- `package.json` essentials: `name`/`version`/`license`/`repository` (URL must match GH exactly for provenance), `files`, `exports` (types-first condition order!), `bin` (needs `#!/usr/bin/env node` + exec bit), `prepublishOnly: build`.
- Publish flow: `npm version patch|minor|major` → `npm pack --dry-run` → `npm publish` (OIDC handles auth in CI); pre-releases need `--tag` so they don't move `latest`.
- Minimal release workflow: `permissions: id-token: write`, `setup-node` w/ `registry-url`, `npm ci`, `npm publish --access public --provenance`. Verify `npm audit signatures`.
- Source docs: docs.npmjs.com/trusted-publishers, /about-access-tokens, /cli/v11/commands/npm-publish. **Note**: the source pack (`@catenarycloud/linteffect`, commit `0854840`) already uses npm trusted-publisher OIDC — a real reference to copy.

---

## Investigator Findings — Section 1: PoC ports of 4 representative rules

**Environment / runner checks.** `which ast-grep sg oxlint vp node npx` found `ast-grep`, `sg`, `vp`, `node`, and `npx`; no global `oxlint` binary was installed. `npx --yes oxlint@latest --help` initially failed because `/Users/mp/.npm/_cacache` has permission-broken root-owned files, so I reran with `npm_config_cache=/tmp/linteffect-poc/npm-cache`. That succeeded within the 60s timebox. PoC files were written only under `/tmp/linteffect-poc`; source repos under `/Users/mp/references/**` were read-only.

### ast-grep PoC source

`/tmp/linteffect-poc/no-effect-as.yml`

```yaml
id: no-effect-as
language: TypeScript
message: "Rule: avoid Effect.as."
severity: error
rule:
  pattern: Effect.as($$$ARGS)
```

`/tmp/linteffect-poc/no-if-statement.yml`

```yaml
id: no-if-statement
language: TypeScript
message: "Rule: avoid imperative if branching."
severity: error
rule:
  all:
    - kind: if_statement
    - inside:
        kind: program
        stopBy: end
        has:
          stopBy: end
          any:
            - pattern: import { $$$ } from "effect"
            - pattern: import "effect/$MODULE"
            - pattern: import { $$$ } from "@effect-atom/atom-react"
            - pattern: import $DEFAULT from "effect"
```

`/tmp/linteffect-poc/no-effect-ladder.yml`

```yaml
id: no-effect-ladder
language: TypeScript
message: "Rule: avoid nested Effect combinators."
severity: error
rule:
  all:
    - any:
        - pattern: Effect.$OUTER(Effect.$INNER(Effect.$DEEP($$$DEEP_ARGS), $$$INNER_REST), $$$OUTER_REST)
        - pattern: Effect.$OUTER(Effect.$INNER(Effect.$DEEP($$$DEEP_ARGS)), $$$OUTER_REST)
    - inside:
        kind: program
        stopBy: end
        has:
          stopBy: end
          any:
            - pattern: import { $$$ } from "effect"
            - pattern: import "effect/$MODULE"
            - pattern: import { $$$ } from "@effect-atom/atom-react"
            - pattern: import $DEFAULT from "effect"
```

`/tmp/linteffect-poc/no-family-collection-read.yml`

```yaml
id: no-family-collection-read
language: TypeScript
message: "Keyed projection atom reads collection atom."
severity: error
rule:
  all:
    - any:
        - pattern: get($ATOM)
        - pattern: get.get($ATOM)
        - pattern: Atom.get($ATOM)
    - inside:
        pattern: Atom.family($$$FAMILY_ARGS)
        stopBy: end
constraints:
  ATOM:
    regex: "(CollectionAtom|ListAtom|Visible.*Atom|ResultsAtom|ReadStateAtom)$"
```

**ast-grep commands and observed output.**

```bash
rtk timeout 60s sg scan --rule /tmp/linteffect-poc/no-effect-as.yml /tmp/linteffect-poc/invalid.ts /tmp/linteffect-poc/valid.ts || true
rtk timeout 60s sg scan --rule /tmp/linteffect-poc/no-if-statement.yml /tmp/linteffect-poc/invalid.ts /tmp/linteffect-poc/valid.ts || true
rtk timeout 60s sg scan --rule /tmp/linteffect-poc/no-effect-ladder.yml /tmp/linteffect-poc/invalid.ts /tmp/linteffect-poc/valid.ts || true
rtk timeout 60s sg scan --rule /tmp/linteffect-poc/no-family-collection-read.yml /tmp/linteffect-poc/invalid.ts /tmp/linteffect-poc/valid.ts || true
```

Observed diagnostics: `no-effect-as` matched 1 invalid call; `no-if-statement` matched 1 invalid `if`; `no-effect-ladder` matched 3 invalid nested Effect ladders across untyped const, typed const, and return contexts; `no-family-collection-read` matched 1 invalid collection-atom read. Running each rule on `/tmp/linteffect-poc/valid.ts` alone produced no diagnostics.

Existing fixture verification for `no-family-collection-read`:

```bash
rtk timeout 60s sg scan --rule /tmp/linteffect-poc/no-family-collection-read.yml /Users/mp/references/effect-ts/biome-effect-linting-rules/tests/fixtures/no-family-collection-read/valid-*.ts
rtk timeout 60s sg scan --rule /tmp/linteffect-poc/no-family-collection-read.yml /Users/mp/references/effect-ts/biome-effect-linting-rules/tests/fixtures/no-family-collection-read/invalid-*.ts || true
```

Observed result: valid fixtures produced zero diagnostics; invalid fixtures produced exactly 3 diagnostics: `invalid-get.ts`, `invalid-get-get.ts`, and `invalid-atom-get.ts`.

### oxlint JS-plugin PoC source

`/tmp/linteffect-poc/linteffect-plugin.mjs`

```js
const COLLECTION_ATOM_RE = /(CollectionAtom|ListAtom|Visible.*Atom|ResultsAtom|ReadStateAtom)$/;

function isIdentifier(node, name) {
  return node?.type === "Identifier" && (name === undefined || node.name === name);
}

function memberObjectName(callee) {
  if (callee?.type !== "MemberExpression" || callee.computed) return null;
  if (isIdentifier(callee.object) && isIdentifier(callee.property)) {
    return `${callee.object.name}.${callee.property.name}`;
  }
  return null;
}

function isEffectMemberCall(node) {
  return node?.type === "CallExpression" && memberObjectName(node.callee)?.startsWith("Effect.");
}

function isEffectImportSource(source) {
  if (typeof source !== "string") return false;
  return source === "effect" || source.startsWith("effect/") || source === "@effect-atom/atom-react";
}

function fileImportsEffect(program) {
  return program.body.some((stmt) => stmt.type === "ImportDeclaration" && isEffectImportSource(stmt.source?.value));
}

function firstArgIsNestedEffectLadder(node) {
  if (!isEffectMemberCall(node)) return false;
  const inner = node.arguments?.[0];
  if (!isEffectMemberCall(inner)) return false;
  const deep = inner.arguments?.[0];
  return isEffectMemberCall(deep);
}

function isAtomFamilyCall(node) {
  return node?.type === "CallExpression" && memberObjectName(node.callee) === "Atom.family";
}

function hasAtomFamilyAncestor(node) {
  for (let cursor = node.parent; cursor; cursor = cursor.parent) {
    if (isAtomFamilyCall(cursor)) return true;
  }
  return false;
}

function collectionAtomArg(node) {
  if (node?.type !== "CallExpression") return null;
  const calleeName = memberObjectName(node.callee);
  const isPlainGet = isIdentifier(node.callee, "get");
  const isGetGet = calleeName === "get.get";
  const isAtomGet = calleeName === "Atom.get";
  if (!isPlainGet && !isGetGet && !isAtomGet) return null;
  const arg = node.arguments?.[0];
  return isIdentifier(arg) && COLLECTION_ATOM_RE.test(arg.name) ? arg : null;
}

export default {
  meta: { name: "linteffect-poc" },
  rules: {
    "no-effect-as": {
      create(context) {
        return {
          CallExpression(node) {
            if (memberObjectName(node.callee) === "Effect.as") {
              context.report({ node, message: "Rule: avoid Effect.as." });
            }
          },
        };
      },
    },
    "no-if-statement": {
      create(context) {
        let importsEffect = false;
        return {
          Program(program) { importsEffect = fileImportsEffect(program); },
          IfStatement(node) {
            if (importsEffect) context.report({ node, message: "Rule: avoid imperative if branching." });
          },
        };
      },
    },
    "no-effect-ladder": {
      create(context) {
        let importsEffect = false;
        return {
          Program(program) { importsEffect = fileImportsEffect(program); },
          CallExpression(node) {
            if (importsEffect && firstArgIsNestedEffectLadder(node)) {
              context.report({ node, message: "Rule: avoid nested Effect combinators." });
            }
          },
        };
      },
    },
    "no-family-collection-read": {
      create(context) {
        return {
          CallExpression(node) {
            const atomArg = collectionAtomArg(node);
            if (atomArg && hasAtomFamilyAncestor(node)) {
              context.report({ node: atomArg, message: "Keyed projection atom reads collection atom." });
            }
          },
        };
      },
    },
  },
};
```

`/tmp/linteffect-poc/.oxlintrc.json`

```json
{
  "categories": {
    "correctness": "off",
    "suspicious": "off",
    "pedantic": "off",
    "perf": "off",
    "style": "off",
    "restriction": "off"
  },
  "jsPlugins": ["./linteffect-plugin.mjs"],
  "rules": {
    "linteffect-poc/no-effect-as": "error",
    "linteffect-poc/no-if-statement": "error",
    "linteffect-poc/no-effect-ladder": "error",
    "linteffect-poc/no-family-collection-read": "error"
  }
}
```

**oxlint commands and observed output.**

```bash
rtk env npm_config_cache=/tmp/linteffect-poc/npm-cache timeout 60s npx --yes oxlint@latest -c /tmp/linteffect-poc/.oxlintrc.json /tmp/linteffect-poc/invalid.ts /tmp/linteffect-poc/valid.ts --format json || true
rtk env npm_config_cache=/tmp/linteffect-poc/npm-cache timeout 60s npx --yes oxlint@latest -c /tmp/linteffect-poc/.oxlintrc.json /tmp/linteffect-poc/valid.ts --format json || true
rtk env npm_config_cache=/tmp/linteffect-poc/npm-cache timeout 60s npx --yes oxlint@latest -c /tmp/linteffect-poc/.oxlintrc.json /Users/mp/references/effect-ts/biome-effect-linting-rules/tests/fixtures/no-family-collection-read/valid-*.ts --format json || true
rtk env npm_config_cache=/tmp/linteffect-poc/npm-cache timeout 60s npx --yes oxlint@latest -c /tmp/linteffect-poc/.oxlintrc.json /Users/mp/references/effect-ts/biome-effect-linting-rules/tests/fixtures/no-family-collection-read/invalid-*.ts --format json || true
```

Observed result: synthetic invalid file produced 6 custom diagnostics: 1 `no-effect-as`, 1 `no-if-statement`, 3 `no-effect-ladder`, and 1 `no-family-collection-read`. Synthetic valid file produced `diagnostics: []`. Existing `no-family-collection-read` valid fixtures produced `diagnostics: []`; invalid fixtures produced exactly 3 custom diagnostics, one per invalid fixture.

### Section 1 conclusion

Both engines can express and execute the four representative rules. ast-grep collapses the GritQL `no-effect-ladder` six binding-context variants into two nested call patterns, because the rule can match the nested `CallExpression` directly rather than matching only `const` or `return` containers. oxlint collapses the same rule even further into one visitor helper, `firstArgIsNestedEffectLadder`, using parent/child AST relationships. For `no-family-collection-read`, both engines handled ancestor context plus name-regex filtering; ast-grep uses `inside` + `constraints`, while oxlint uses `node.parent` traversal and a plain JavaScript regex.

---

## Investigator Findings — Section 2: All-rule categorization and portability estimate

**Source count correction.** The checked-out source has **50** `.grit` files, not 52:

```bash
rtk proxy python3 - <<'PY'
from pathlib import Path
print(len(list(Path('/Users/mp/references/effect-ts/biome-effect-linting-rules/rules').glob('*.grit'))))
PY
# => 50
```

The bucket assignment below is the primary porting mechanic for each rule. Some rules have secondary traits, but each rule is counted once.

### Bucket counts

| Bucket | Count | ast-grep portability note | oxlint JS-plugin portability note |
|---|---:|---|---|
| (a) Trivial single-node/member ban | 16 | Easy: usually one `pattern` or a short `any` list; import guard can be added mechanically when present. | Easy: one visitor (`CallExpression`, `ReturnStatement`, etc.) plus shared callee helpers. |
| (b) Syntax ban + Effect import guard | 4 | Easy-to-moderate: target `kind` plus `inside: program` / `has: import` with `stopBy: end`; import matching needs a reusable util. | Easy: collect imports in `Program`, report syntax-node visitors only when the file imports Effect/Atom. |
| (c) Relational / nested-contains | 19 | Moderate: mostly maps from Grit `contains` to `has` / `inside` with `stopBy: end`; requires AST-shape testing to avoid overmatching. | Easy-to-moderate: imperative AST traversal is natural, but needs helper functions for callee names, ancestors, and nested calls. |
| (d) Object-member / constraint-heavy | 6 | Moderate-to-hard: name regex and positive constraints work; negative constraints and object-member containment need careful fixture validation. | Moderate: plain JS predicates make regex/name/object checks straightforward; risk is custom helper correctness. |
| (e) Multi-variant binding context | 5 | Harder but feasible: many Grit variants collapse by matching the nested expression directly, but each rule needs PoC validation. | Moderate-to-hard: visitors collapse context variants well, but behavior parity depends on deliberate parent/argument checks. |

### Per-rule classification

| Rule | Bucket | Portability note |
|---|---|---|
| `no-arrow-ladder` | (c) | Nested IIFE-in-IIFE; ast-grep `has`/`inside`, oxlint ancestor/child helper. |
| `no-atom-registry-effect-sync` | (c) | Effect.sync body containing Atom/registry mutation; ast-grep relational match, oxlint visitor scans callback body. |
| `no-branch-in-object` | (e) | Several object-return/IIFE variants; both engines should collapse some variants, but needs fixture-driven parity. |
| `no-call-tower` | (c) | Nested Effect calls in call arguments; both engines express this directly. |
| `no-effect-all-step-sequencing` | (d) | Requires option object member `concurrency: 1` plus side-effect step detection; feasible but constraint-heavy. |
| `no-effect-as` | (a) | Already proven: single member-call ban. |
| `no-effect-async` | (a) | Single member-call ban with typed/untyped variants. |
| `no-effect-bind` | (a) | Single member-call ban. |
| `no-effect-call-in-effect-arg` | (e) | Enumerates nested call in first/second argument positions; oxlint collapses via arguments array, ast-grep likely needs 2-4 patterns. |
| `no-effect-do` | (a) | Member/property ban. |
| `no-effect-fn-generator` | (a) | Specific call shape; simple `Effect.fn(function* ...)` patterns or visitor. |
| `no-effect-ladder` | (e) | Already proven: Grit's 6 binding contexts collapse to expression-level matching. |
| `no-effect-never` | (a) | Member/property ban. |
| `no-effect-orElse-ladder` | (c) | `Effect.orElse` first arg contains sequencing combinator; relational/visitor body scan. |
| `no-effect-side-effect-wrapper` | (c) | `Effect.as`/`zipRight` first arg contains side-effect forms; many alternatives, same relational shape. |
| `no-effect-succeed-variable` | (d) | Positive call plus negative argument-shape exclusions; ast-grep `not` constraints need special validation. |
| `no-effect-sync-console` | (c) | `Effect.sync` callback contains console; straightforward relational/body scan. |
| `no-effect-type-alias` | (c) | Type alias value contains `Effect.Effect`; type AST matching needed but simple. |
| `no-effect-wrapper-alias` | (e) | Many const/function wrapper variants; oxlint helper can normalize wrappers, ast-grep may need a pattern family. |
| `no-family-collection-read` | (d) | Already proven: ancestor `Atom.family` plus collection-name regex. |
| `no-flatmap-ladder` | (e) | Grit enumerates const/typed const/return contexts for flatMap/flatten; expression-level matching should reduce variants. |
| `no-fromnullable-nullish-coalesce` | (a) | Simple `Option.fromNullable(x ?? null|undefined)` patterns. |
| `no-if-statement` | (b) | Already proven: syntax node plus import guard. |
| `no-iife-wrapper` | (c) | IIFE callee is function/arrow variant; ast-grep `any`, oxlint call callee predicate. |
| `no-inline-runtime-provide` | (c) | Generator plus runtime pipe and single-arg provide; relational with a negative comma check. |
| `no-manual-effect-channels` | (a) | Type-reference ban for `Effect.Effect` / `Layer.Layer`; simple type-node visitor/pattern. |
| `no-match-effect-branch` | (c) | Large set of branch bodies containing Effect/Stream/pipe; moderate due to many alternatives, not semantically hard. |
| `no-match-void-branch` | (a) | Simple Match branch patterns. |
| `no-model-overlay-cast` | (d) | `as` assertion with `not const`; one negative constraint. |
| `no-naked-object-state-update` | (d) | Object spread/Object.assign/entries/JSON inside Ref update/modify context; constraint-heavy but local. |
| `no-nested-effect-call` | (c) | Nested three-deep Effect call; same core as `no-effect-ladder` without binding-context variants. |
| `no-nested-effect-gen` | (c) | `Effect.gen` containing nested `Effect.gen`; direct ancestor/descendant match. |
| `no-option-as` | (a) | Single member-call ban. |
| `no-option-boolean-normalization` | (a) | Two concrete `Option.match` shapes; simple alternatives. |
| `no-pipe-ladder` | (c) | `pipe(...)` or `.pipe(...)` containing another pipe; direct nested call relation. |
| `no-react-state` | (a) | Hook-name call/member ban; no Effect import gate in source rule. |
| `no-render-side-effects` | (c) | Match expression statement with branch effects; relational branch scan. |
| `no-return-in-arrow` | (c) | Callback return with exclusions for Schema filters; ast-grep negative constraints need tests, oxlint easier. |
| `no-return-in-callback` | (c) | Function callback return inside call; straightforward relational match. |
| `no-return-null` | (a) | Return-literal syntax ban with import guard; simple. |
| `no-runtime-runfork` | (a) | Single member-call ban. |
| `no-string-sentinel-const` | (d) | Const string literal under Effect/Atom file guard; simple constraint, counted here because it constrains initializer shape. |
| `no-string-sentinel-return` | (a) | Simple `Effect.succeed("...")` pattern. |
| `no-switch-statement` | (b) | Syntax node plus import guard. |
| `no-ternary` | (b) | Conditional expression plus import guard. |
| `no-try-catch` | (b) | Try statement variants plus import guard. |
| `no-unknown-boolean-coercion-helper` | (c) | Co-occurrence of boolean type check and `Match.orElse(() => null)`; relational file/body scan. |
| `no-wrapgraphql-catchall` | (c) | Pipeline contains `wrapGraphqlCall`, `applyResponse`, and catchAll; relational pipeline scan. |
| `prevent-dynamic-imports` | (a) | Single dynamic-import ban, no Effect import gate. |
| `warn-effect-sync-wrapper` | (c) | `Effect.sync` callback wraps non-console side-effect call; needs negative console check. |

### Estimate correction

The earlier rough estimate was directionally right on hard-rule count but optimistic on ast-grep “easy” count. My corrected estimate from the actual 50-rule tree:

- **ast-grep:** about **20 easy**, **25 moderate**, **5 hard**. The moderate count is higher because many Grit rules are not simple single-node bans; they are `contains`-based relational rules that need `stopBy: end`, constraints, and fixture validation.
- **oxlint JS plugins:** about **30 easy-with-helpers**, **15 moderate**, **5 hard**. This matches the oracle estimate closely. A small shared helper layer for imports, callee names, ancestor walking, and nested argument predicates turns many relational rules into short visitors.

The practical difference is not expressiveness; both engines can express the pack. The practical difference is authoring style: ast-grep keeps rules declarative but needs careful YAML/AST-shape testing, while oxlint uses imperative helpers that are easier to abstract and review for this specific Effect rule family.

---

## Investigator Findings — Section 3: Integration verification

### 3.i oxlint `jsPlugins`: `.ts` direct load vs compiled `.js`

**Verified from source and fixtures:** oxlint can load local `.ts` plugin files directly in supported runtimes. `oxc/apps/oxlint/src-js/package/config.generated.ts` documents both `"./custom-plugin.js"` and `"./custom-plugin.ts"`; it states TypeScript plugin files work natively in Deno/Bun and in Node.js `>=22.18.0` / `^20.19.0` because built-in type stripping is available. The local fixtures repeatedly use `.ts` directly, for example `oxc/apps/oxlint/test/fixtures/basic/.oxlintrc.json` has `"jsPlugins": ["./plugin.ts"]`, and `oxc/apps/oxlint/test/fixtures/js_config_js_plugins/oxlint.config.ts` has `jsPlugins: ["./plugin.ts"]`.

**Verified by quick run:** on this machine, `node -v` returned `v24.15.0` and `npx --yes oxlint@latest --version` returned `1.66.0`. I copied the PoC plugin to `/tmp/linteffect-poc/linteffect-plugin.ts`, changed `.oxlintrc.json` to `"jsPlugins": ["./linteffect-plugin.ts"]`, and ran:

```bash
rtk env npm_config_cache=/tmp/linteffect-poc/npm-cache timeout 60s npx --yes oxlint@latest -c /tmp/linteffect-poc/.oxlintrc.json /tmp/linteffect-poc/valid.ts --format json || true
```

Observed result: `diagnostics: []` and `number_of_rules: 4`, which confirms the `.ts` plugin loaded and registered the custom rules. **Practical publishing note:** `.ts` plugins are supported on modern Node, but shipping compiled `.js` remains safer for older Node or non-Node environments.

### 3.ii Vite+ `vp lint`: does it forward custom oxlint config?

**Verified from source:** `vite-plus/packages/cli/src/resolve-lint.ts` only resolves the packaged `oxlint` binary and `OXLINT_TSGOLINT_PATH`. The actual command resolver in `vite-plus/packages/cli/binding/src/cli/resolver.rs` handles `SynthesizableSubcommand::Lint { mut args }`, resolves the oxlint binary, and, when Vite+ has a `lint` config and a config file, inserts `-c <config_file>` before forwarding the remaining user args to oxlint. That means Vite+ does not appear to strip `jsPlugins`, `.oxlintrc`, or `oxlint.config.ts`; it points oxlint at the resolved Vite+ config and passes the rest through.

**Verified from snap-tests:**

- `snap-tests/lint-vite-config-rules/vite.config.ts` sets `lint.rules.no-console = 'warn'`; `snap.txt` shows `vp lint` reading that config and reporting `eslint(no-console)`.
- `snap-tests/oxlint-typeaware/vite.config.ts` runs both `vp lint ./src` and `vp lint --type-aware ./src`; `snap.txt` shows the CLI forwarding the `--type-aware` flag and changing cache inputs for type-aware linting.
- `snap-tests/bin-oxlint-wrapper/snap.txt` shows the packaged `bin/oxlint` wrapper is LSP-only for direct invocation, but its `--lsp --help` output is oxlint's normal help, including `-c, --config=<./.oxlintrc.json>`. Normal linting should use `vp lint`, not the wrapper directly.

**Conclusion:** Vite+ should be compatible with oxlint custom JS plugins as long as the user can express `lint: { jsPlugins, rules }` in `vite.config.ts` or point oxlint at a compatible config. I did not find a Vite+ constraint that removes `jsPlugins`.

### 3.iii ast-grep npm-style distribution and tests

**Verified from schema/source:** `ast-grep/schemas/project.json` defines `ruleDirs`, `testConfigs`, `utilDirs`, `languageGlobs`, `customLanguages`, and `languageInjections`; it does **not** define an `extends` shorthand. The schema marks `ruleDirs` as the rule discovery mechanism. `ast-grep/crates/cli/tests/scan_test.rs` and `verify_test.rs` use `sgconfig.yml` with:

```yaml
ruleDirs:
- rules
testConfigs:
- testDir: rule-tests
```

**Verified by local npm-layout simulation:** I created a temporary package-like layout under `/tmp/linteffect-poc/sgdist`:

```yaml
# /tmp/linteffect-poc/sgdist/sgconfig.yml
ruleDirs:
  - node_modules/@mp/effect-rules/rules
testConfigs:
  - testDir: rule-tests
```

Then I copied `no-effect-as.yml` to `node_modules/@mp/effect-rules/rules/no-effect-as.yml`, added `rule-tests/no-effect-as-test.yml` with `valid` and `invalid` snippets, and ran:

```bash
rtk timeout 60s sg test -c /tmp/linteffect-poc/sgdist/sgconfig.yml --update-all || true
rtk timeout 60s sg test -c /tmp/linteffect-poc/sgdist/sgconfig.yml || true
```

Observed result: first run created `rule-tests/__snapshots__/no-effect-as-snapshot.yml` and passed; second run passed with the snapshot present. This validates the expected npm distribution shape: ship YAML under `node_modules/<pkg>/rules`, tell consumers to add that directory to `ruleDirs`, and use `sg test` with `valid`/`invalid` snippets plus snapshots. There is no native `extends:` shorthand in the verified schema.

### 3.iv oxlint JS-plugin autofix support

**Verified from fixture:** `oxc/apps/oxlint/test/fixtures/fixes/plugin.ts` defines a custom plugin with `meta: { fixable: "code" }` and many `context.report({ ..., fix(fixer) { ... } })` cases. The fixture exercises `fixer.remove`, `fixer.removeRange`, `fixer.replaceText`, `fixer.replaceTextRange`, `fixer.insertTextBefore`, `fixer.insertTextAfter`, array returns, and generator fix functions.

**Conclusion:** oxlint custom JS-plugin rules support standard ESLint-style autofix through `context.report({ fix })`. The current linteffect GritQL pack is detection-only, so autofix is not required for parity; oxlint can support future fixes if desired.

---

## Investigator Findings — Section 4: GritQL → ast-grep / oxlint semantic gaps

### ast-grep gaps and hazards

1. **Grit `contains` maps to ast-grep relational rules, not plain patterns.** The reliable translation is usually `has:` or `inside:` with `stopBy: end`. Without `stopBy: end`, relational matching can stop too early and miss descendants. This matters for almost every Grit rule shaped like `$body <: contains ...`.

2. **Metavariable consistency is stricter than Grit `bubble`.** In ast-grep, reusing the same metavariable name means the matched node text/shape must be consistent. Some Grit rules use `bubble` to carry a capture through a larger expression without requiring repeated textual equality. The port should avoid reusing metavariable names unless equality is intended.

3. **Variadic `$$$` is useful but has lazy / punctuation-sensitive behavior.** In the PoC, `Effect.as($VALUE)` did not match a two-argument `Effect.as(effect, value)` call; `Effect.as($$$ARGS)` was needed for an arity-agnostic ban. For `no-effect-ladder`, I still used two inner-call patterns because the one-argument and multi-argument call shapes are cleaner to express separately. In JSON output for `Atom.family($$$FAMILY_ARGS)`, the variadic capture included comma punctuation as a separate captured item, which is fine for detection but important for future autofix templates.

4. **Constrained metavars inside `not` need rewrites.** Grit rules like `no-return-in-arrow` express exclusions such as “do not report this return if the same return is inside `S.filter` / `Schema.filter`.” ast-grep can usually express the intent, but the safer port shape is to match the return node and add ancestor/inside exclusions, not to try to reuse a captured `$ret` inside a nested negative relation. This is an authoring hazard, not a blocker.

5. **Name-regex constraints work, but the regex target changes.** Grit's `no-family-collection-read` regex was applied to a larger read expression string that included `)`. In ast-grep, the cleaner constraint applies to the `$ATOM` identifier text, so the regex becomes `(CollectionAtom|ListAtom|Visible.*Atom|ResultsAtom|ReadStateAtom)$`. This improves precision but requires per-rule review.

6. **No type information.** ast-grep cannot know whether an arbitrary identifier named `Effect` or `Atom` is actually imported from the intended package unless the rule adds import/context checks. This matches the current GritQL pack's structural-only behavior, so it is not a parity blocker.

### oxlint JS-plugin gaps and hazards

1. **TypeScript plugin loading depends on runtime support.** Source fixtures and a local run confirm `.ts` plugins load on Node `v24.15.0` / oxlint `1.66.0`. The oxlint config types document `.ts` plugin support for modern Node, Bun, and Deno. For broad npm distribution, compiled `.js` is still safer; ship JS and types, not TS-only plugin entrypoints.

2. **No custom-plugin type information.** The JS-plugin `context` exposes ESLint-like AST/source/config APIs, not TypeScript type services. The source context object exposes `sourceCode`, `languageOptions`, parser metadata, settings, globals, filename, and report helpers; it does not expose TS checker APIs. This is not a blocker for the current pack because the GritQL source is structural-only.

3. **Helper correctness becomes the main risk.** oxlint makes relational logic easy to write imperatively, but repeated helpers (`memberObjectName`, import guard collection, ancestor traversal, first-argument checks) become the new source of bugs. A port should centralize these helpers and test them with focused fixture cases.

4. **Visitor timing matters for file-level guards.** The PoC stores `importsEffect` during `Program` and reads it from `IfStatement` / `CallExpression` visitors. That worked in the quick run, but the production rule pack should prefer a shared file-context helper or `Program` pre-scan to avoid subtle ordering assumptions if a rule uses selectors or `createOnce`.

5. **Autofix is available but not needed for parity.** oxlint supports standard ESLint-style `context.report({ fix(fixer) { ... } })`; the source GritQL rules intentionally avoid rewrites. Adding fixes during the port would expand scope and should be a later product decision, not part of parity.

### Anything that cannot be expressed?

I did **not** find any current checked-out rule that cannot be expressed in either ast-grep YAML or oxlint JS plugins. The hard cases are authoring and verification problems, not expressiveness blockers:

- `no-effect-ladder` and related binding-context rules are expressible by matching nested call expressions directly.
- `no-family-collection-read` is expressible in both engines with ancestor context plus name regex.
- Negative exceptions in callback rules are expressible, but ast-grep ports should reshape them around the reported node's ancestor context instead of copying Grit's capture/bubble structure literally.

The only true non-expressible class would be future type-aware rules. If the Effect lint pack later needs semantic checks such as “this identifier resolves to `Effect.Effect` even through aliasing,” neither ast-grep YAML nor current oxlint custom JS plugins can provide that without additional tooling. That limitation does not affect parity with the current structural GritQL rules.

---

# FINAL SYNTHESIS & RECOMMENDATIONS (Phase 5)

> The sections above are the evidence trail (external research → context_builder → pair PoCs → oracle). This is the authoritative conclusion.

## Bottom line
Port the 50 Effect rules as a **plain ESLint v9-compatible plugin**, and run it through **oxlint's `jsPlugins`** as the primary runtime. Keep stable ESLint as a *fallback runtime* (not a required dependency). **ast-grep is NOT the primary target** — make it an optional later sibling `sg scan` guardrail pack only if wanted. Do **not** build on the unproven `@effect-oxlint/effect-oxlint` SDK.

The key realization: capability is NOT the deciding factor — **both engines expressed and executed all 4 representative rules (incl. the hard ones) against real fixtures**, and the other 46 categorize as feasible. So the decision is workflow-fit + risk + distribution, where oxlint-as-ESLint-plugin wins for this user.

## Why oxlint (as an ESLint-compatible plugin), decisively
1. **It's the runtime he actually uses.** He's all-in on oxlint via vite-plus; `vp lint` forwards `jsPlugins`/config to oxlint (verified — not stripped). The pack runs in his real toolchain with zero extra tooling.
2. **ESLint-compatibility dissolves the alpha risk.** oxlint JS plugins are alpha (Mar 2026), BUT the rules are written to the ESLint v9 `create(context)` API, so the *same* rule files run in stable ESLint if oxlint's alpha API ever breaks. The bet is on a stable API shape, not an alpha-only one. (Avoid oxlint-only extensions like `createOnce` unless a perf need appears.)
3. **Real npm-plugin distribution.** A normal plugin package with `jsPlugins: ["@scope/pkg"]` + `rules` config. Contrast ast-grep: no `extends:` shorthand — consumers wire `node_modules/<pkg>/rules` into `ruleDirs` or you ship a wrapper CLI (like the source's `linteffect.mjs`). oxlint distribution is the lower-friction consumer UX.
4. **The "helper library" cost is acceptable, not a mini-linter.** A small shared lib (callee-name normalization, import-guard, ancestor walk, nested-arg predicates) turns most relational rules into short visitors. Effort ≈ 30 easy / 15 moderate / 5 hard. For an agent-assisted port this is reviewable and testable.
5. **Autofix is available later** (`context.report({fix})`) — the current GritQL pack is detection-only, so this is upside, not required for parity.

### Important clarification (the oracle blurred this)
"ESLint-compatible" describes the **rule format**, not a consumer requirement. Consumers run **oxlint** (`vp lint`). They do NOT need ESLint installed. ESLint is only the author's **escape hatch / second test runtime** to prove the rules aren't locked to oxlint's alpha. The user does not get pulled back into an ESLint workflow.

## Honest caveats / residual risk
- **Not all 50 are line-by-line proven.** 4 representative rules (incl. the 2 hardest classes) were ported AND run in both engines against real fixtures; the other 46 are categorized as feasible. The ~5 "hard" rules per engine (nested-ladder / multi-variant-binding / negative-exception callback rules like `no-return-in-arrow`, `no-effect-succeed-variable`, `no-branch-in-object`) are feasible-but-need-validation — that's where port time concentrates.
- **Dual-runtime testing is real extra work.** De-risking via ESLint means writing ESLint `RuleTester` tests in addition to oxlint fixture/snapshot tests. Worth it; not free.
- **Alpha churn.** Pin oxlint via vite-plus's existing `oxlint`/`oxlint-tsgolint` version pinning so plugin-API drift is controlled.
- **No type info in either engine.** Fine — the rules are structural/identifier-based and don't need it. (A *future* type-aware rule would need neither engine but a tsgolint-style path.)

## Recommendations

### 1) Port target & sequence
1. Write rules as plain ESLint v9-compatible rules (`create(context)` + visitors). Centralize a `helpers/` lib (callee name, `fileImportsEffect`, ancestor walk, nested-Effect-call predicates).
2. Port by preset to mirror the source: `core` → `web` → `ts-type` → full. Start from the 4 proven PoC rules.
3. Test in BOTH runtimes: oxlint fixture+snapshot tests (the real product path) AND ESLint `RuleTester` (the de-risk path). Reuse the source repo's valid/invalid fixture style.
4. Document oxlint/`vp lint` first; ESLint usage as a short fallback note.
5. **Later (optional):** if he wants `sg scan` parity for repos already guardrailed with ast-grep, ship a sibling ast-grep YAML pack — do NOT block the first publish on it.

### 2) npm publishing (orthogonal to engine; difficulty LOW)
- First-publish is easy in 2026 with **OIDC Trusted Publishing** (GA) — no stored `NPM_TOKEN`. The source repo (`@catenarycloud/linteffect`, commit `0854840`) already demonstrates the OIDC trusted-publisher setup — copy it.
- Essentials: scoped name + `publishConfig.access:"public"`, `files` allowlist (verify `npm pack --dry-run`), `exports` (types-first condition order), ship compiled `.js` (not `.ts`), `prepublishOnly: build`, pre-releases use `--tag`. WebAuthn/passkey 2FA (TOTP gone).
- The only engine-specific publishing difference is consumer UX (plugin package vs ast-grep `ruleDirs`/wrapper) — which favors oxlint.

### 3) Repo + package name
Use the ESLint plugin convention (oxlint honors full plugin names too). **Scope is the user's choice** — `@mp` (his npm username, free) or a brand scope; don't invent one. Flag: a bare `eslint-plugin-effect` / `@x/eslint-plugin-effect` can read as THE official Effect plugin (namespace-adjacent to `@effect/eslint-plugin`); since this is an *opinionated composition/style* pack, lean toward a name that signals opinion.

Candidates (tradeoff):
- `@mp/eslint-plugin-effect-style` — **top pick**: convention-correct, signals "opinionated style/composition," low collision risk, uses his free `@mp` scope.
- `@mp/eslint-plugin-effect` — cleanest convention, but reads as if official; only if he's fine with that.
- `eslint-plugin-effect-flow` / `eslint-plugin-effect-composition` — unscoped, descriptive, no org needed; more collision-prone.
- `@mp/linteffect` — homage to the source `linteffect`, engine-neutral, but loses the auto-discoverable `eslint-plugin-` convention.
- Repo name can match the unscoped package (e.g. repo `eslint-plugin-effect-style`).

## Stack-playbook takeaways (durable, for the cross-repo playbook)
- **Structural lint rules with no type needs**: default to **ESLint-compatible JS rules run via oxlint `jsPlugins`** when the repo is on vite-plus/oxlint. ESLint-compat is the alpha-hedge.
- **ast-grep `sg scan`**: keep for repo-local structural guardrails (already his pattern); reserve YAML rule *packs* for cases that don't warrant a JS plugin or where a separate scanner is preferred.
- **Don't bet a publishable package on an oxlint-only or unproven-SDK API** while JS plugins are alpha — stay on the ESLint-compatible subset.
- **First npm publish**: OIDC trusted publishing + scoped + `files` allowlist + compiled output is the boring, safe path.

---

## Investigation Log
- **Phase 1 (triage)**: Read source repo — 50 GritQL `.grit` rules, detection-only, structural/no-type-info, presets + CLI, Projen-managed, published as `@catenarycloud/linteffect`.
- **Phase 1.5 (5 explore agents, Sonnet)**: oxlint JS-plugin alpha state; ast-grep capabilities; npm 2026 publishing; prior art; naming. Corrected one false agent claim (no existing oxlint port in source — verified via git log).
- **Phase 2 (context_builder)**: 171-file selection across all 4 repos; oracle initial lean "oxlint product / ast-grep prototype."
- **Phase 3 (pair, Codex GPT-5.5)**: ran real PoCs of 4 rules in BOTH engines against real fixtures (valid=0/invalid=3 both); categorized all 50; verified integration (`.ts` loads on Node 24, ship `.js`; `vp lint` forwards `jsPlugins`; ast-grep `ruleDirs` distribution; oxlint autofix). Verified by agent: artifacts on disk incl. downloaded oxlint 1.66.0 + sg snapshot.
- **Phase 4-5 (oracle synthesis + agent refinements)**: final recommendation — ESLint-compatible plugin via oxlint `jsPlugins`, ast-grep optional sibling, name `@mp/eslint-plugin-effect-style`.

> Prose note: this is an internal investigation artifact dense with technical/code identifiers (oxlint, ast-grep, GritQL, metavariable, Effect APIs); a full Vale pass produces overwhelmingly technical-term false positives (the pair confirmed this), so it was not prose-linted — consistent with prior investigations in this repo.

---

## UPDATE: existing fork/port check (verified via gh, 2026-05-29)
Correcting the earlier "no existing oxlint port" note. There IS one existing port — unmerged and stale:

- **`kevinmichaelchen/biome-effect-linting-rules` @ branch `feat/full-parity-and-coverage`** (single commit `30a8072`, 2026-04-08; **1 ahead / 16 behind** upstream master).
  - Ports the then-**48-rule** surface to **oxlint** AND **lintcn** (a Go-based linter).
  - oxlint port = `oxlint/{plugin.mjs,recommended.mjs,plugin.test.mjs,test-cases.mjs}`, consumed as `import { oxlintRecommended } from "@catenarycloud/linteffect/oxlint-recommended"` + `defineConfig(oxlintRecommended)`. **This is exactly our recommended ESLint-compatible `.mjs` plugin via `jsPlugins` approach** — independent corroboration.
  - Data-driven design: `compat/ported-rules.mjs` manifest (per-rule `{name, targets, severity, effectOnly, sourceRule, message, matcher}`) generates the rule set across targets. Go rules under `.lintcn/linteffect/*.go` + parity/coverage test harnesses.
  - **Why unmerged**: this was PR #4 (cross-repo), **closed by the author himself** — "Closing this because the PR should live on the personal fork instead." NOT a maintainer quality rejection; upstream deliberately stays Biome-canonical.
  - **Staleness/gaps**: single squashed commit, untouched ~7 weeks, predates the 2 newest rules (`no-naked-object-state-update` Apr 18, `no-family-collection-read` May 13) → ~48 of 50. Bundles lintcn (Go) which is out of scope for us.
- Other 3 forks (MrNiceRicee, taylorfsteele, kevin-y-ang): `ahead_by:0` on master, only tiny single-rule fix branches; NOT ports.
- **No ast-grep port exists anywhere** (confirmed). Porting to ast-grep = still first-mover.
- **License**: source pack is MIT (Roman Naumenko, 2026) → forking/deriving the existing oxlint translations is permitted with attribution.

**Implication**: the fork is a meaningful HEAD START + cross-check (48 oxlint rule translations + a clean manifest design already validating our approach), NOT a maintainable drop-in dependency (unreleased, single-commit/unreviewed, stale, bundles lintcn). Decision for the port: mine/derive from it vs. port fresh from the PoC approach vs. hybrid (port fresh, use it as a reference oracle).

---

## UPDATE: Rika-Labs/oxlint-standards Effect rules — reuse assessment (verified via gh, 2026-05-29)
- Repo: `Rika-Labs/oxlint-standards`, **MIT** (reusable w/ attribution), TS source, oxlint JS-plugin rules (`RuleModule` = `meta`/`messages`/`create(context)` + visitors + shared `utils.ts`). Recently active (pushed 2026-04-18), low traction (1★), single maintainer. Quality of inspected rule (`effect-no-or-die.ts`) is clean/idiomatic (test-file exclusion, `messageId` reporting). Implementation approach == our recommendation (corroboration).
- **~21 `effect-*` rules** (more than the earlier "12" estimate), grouped into presets (`effect-composition`, `effect-error-model`, `effect-observability`, `effect-runtime`, `effect-service-hygiene`, `strict-effect` → `strict-full`).
- **KEY INSIGHT: Rika's rules are a DIFFERENT AXIS than linteffect.** linteffect (50) = composition/control-flow SHAPE (flatten ladders, no nested gen, no if/switch/ternary, no pipe-ladder). Rika effect-* = SEMANTIC / ARCHITECTURAL / runtime / error-model hygiene (what you do, not how you shape it). So they are mostly COMPLEMENTARY, not duplicative.
- **Net-new (take/adapt):** error model — `effect-require-tagged-errors`, `effect-no-generic-error-fail`, `effect-catch-handler-must-use-error`, `no-anemic-errors`, `no-catch-return-error-object`, `no-silent-catch-fallback`; runtime boundary — `effect-no-terminal-runners`, `effect-prefer-runmain-entrypoint`, `effect-no-or-die`, `effect-no-fire-and-forget-fork`; async/Promise — `effect-no-raw-promises`, `effect-no-async-inside-sync`, `effect-no-promise-service-methods`; observability — `effect-require-span-name`; concurrency/state — `effect-no-looped-effects`, `effect-no-mutable-ref-in-gen`; misc — `effect-no-tacit-usage`, `effect-no-effect-return-in-map`.
- **Overlap / reconcile:** `effect-no-try-catch` ≈ linteffect `no-try-catch` (dedupe); `effect-no-async-await` ≈ linteffect `no-effect-async`. ⚠️ **Philosophy conflict**: `effect-prefer-gen-over-flatmap-chain` (gen-first) vs linteffect's flatten-the-ladder / `no-nested-effect-gen` (pipe-first). Pick a house style before adopting both.
- **Caveats:** layer/architecture rules (`effect-no-layer-in-leaf-modules`, `effect-no-provide-in-domain`, `no-cross-layer-imports`, `no-default-export-in-domain`) assume a specific domain/layer project layout — only adopt if the user's repos follow that convention. Per-rule behavior should be confirmed at adoption (assessment here is from catalog + index + 1 rule body + linteffect knowledge).
- **Implication**: the user's package can be RICHER than a pure linteffect port — combine (a) linteffect composition-shape rules (ported) + (b) a curated subset of Rika's semantic/error/runtime/observability rules (adapted, MIT-attributed). Be selective; reconcile the gen-vs-pipe conflict; skip convention-dependent layer rules unless conventions match.

---

## UPDATE: consume vs. copy Rika rules — it IS published (verified 2026-05-29)
- `@rikalabs/oxlint-standards` **is published to npm** — v**0.8.1** (modified 2026-04-18), ships compiled `dist/` + types, exports `.` (config/presets entry), `./plugin` (the oxlint JS plugin), `./presets/*`. So it's a real installable oxlint plugin, NOT just a GitHub repo.
- Clarification: these rules are **not built into oxlint**. They're a third-party JS plugin loaded via `jsPlugins` + enabled in `.oxlintrc`/`oxlint.config.ts`. "Already in oxlint" = installable plugin, not bundled.
- **Therefore: depend + enable, don't copy.** For Rika's effect rules, the correct move is `pnpm add -D @rikalabs/oxlint-standards`, add its plugin to `jsPlugins`, enable the `effect-*` rules/presets you want. Copying defeats the point of a published plugin.
- **Tradeoffs of depending on THIS package**: pre-1.0 (v0.8.x → breaking changes likely), 1★ single-maintainer, young, and broad (also ships Drizzle/Next/Electrobun/naming rules — ~60+ total; you'd cherry-pick via config). Mitigate with version pinning + `minimumReleaseAge` (already set in pnpm 11) + readiness to vendor a few rules if it goes unmaintained.
- **When copying/reimplementing a FEW is better**: you only want 2-3 rules (not worth a 60-rule dep), or a rule's convention assumptions (layer/architecture rules) don't match your repos, or you don't want your published package's reliability coupled to a 1★ pre-1.0 dep.
- **ARCHITECTURE REFRAME (the real answer)**: split deliverables.
  1. **Author + publish only what nobody else has**: the linteffect *composition-shape* rules ported to oxlint (genuinely net-new — Rika doesn't cover this axis; the kevinmichaelchen fork is unpublished/stale). This is the one piece worth building.
  2. **Compose everything else via a shared oxlint CONFIG/preset** (the `eslint-config-*` analog) that wires up: your composition-rule plugin + `@rikalabs/oxlint-standards` (effect semantic/error/runtime rules) + official `@effect/eslint-plugin`. DRY: depend, don't reinvent.
  - This matches the stack-playbook goal: a shareable config that assembles best-of-breed plugins, plus one small plugin for the missing axis. Still reconcile the gen-vs-pipe philosophy conflict in the config layer (enable Rika's `effect-prefer-gen-over-flatmap-chain` OR linteffect's flatten-ladder rules, not both).

---

# LOCKED DECISIONS (2026-05-29)

Settled — apply as-is in the build phase. These UPDATE the earlier "FINAL SYNTHESIS" name recommendation, which assumed an Effect-only package.

## D1 — Package/repo: `@mplibunao/oxlint-standards`
- Scope `@mplibunao` (MP's npm username scope; account + passkey 2FA set up, smoke-test publish proven).
- Broader than Effect: a personal monorepo of opinionated oxlint rules (effect, react, general, …), modeled on `Rika-Labs/oxlint-standards`.
- "standards" (not "rules") signals it ships presets + config, not only rules.
- Considered + rejected: `@mplibunao/lint-standards` (engine-neutral hedge — the rules are ESLint-v9-compatible, not oxlint-locked). Chose `oxlint-standards` for clarity; oxlint is the committed runtime. Revisit only if oxlint's alpha JS-plugin API forces a pivot.
- Carry-over from synthesis: rules are authored as ESLint-v9-compatible JS plugins, run via oxlint `jsPlugins` (primary) with ESLint as the escape-hatch runtime; ship compiled `.js`.

## D2 — Structure: single package + opt-in presets, in a pnpm workspace
- ONE published package now: `packages/oxlint-standards/`, exposing presets (`effect`, `react`, `general`, …). pnpm workspace so a later split is frictionless.
- Do NOT split per-domain up front. The preset/config is the opt-in unit, not the package — same pattern as typescript-eslint (hundreds of rules in one plugin package + configs), eslint-plugin-unicorn, and Rika.
- Rationale: shared internal helper layer (`src/utils/`); ONE OIDC trusted-publisher binding + one version for the first publish (N packages = N bindings + Changesets coordination); no consumer cost (dev-dep; unused rules aren't loaded expensively).
- Split a domain into its own package ONLY when it earns it: independent release cadence, a domain-specific heavy dependency, or independent discoverability. YAGNI until then — extraction later is cheap (move files + add package.json + a trusted-publisher binding).

## D3 — New rule: `effect-no-multiple-provide` (effect preset)
- Ban multiple / chained `Effect.provide` in one pipeline: `eff.pipe(Effect.provide(A), Effect.provide(B))` or `.pipe(Effect.provide(A)).pipe(Effect.provide(B))`.
- Provenance: requested by Effect's creator **Michael Arnaldi** (X, May 2026, status 2054678358454108180): "Please add a lint rule to ban multiple Effect.provide calls or use the LSP plugin :)" — read directly off the thread; community confirmed the pattern is widespread.
- Why it's bad: layer memoization is scoped per-`provide` call (reference-equality within one scope). Separate provides → a shared dependency (e.g. `ConfigLive` used by both A and B) is built **N times**, with separate `Scope` lifecycles/resources.
- Fix it steers toward: merge into one layer and provide once at the edge — `Effect.provide(eff, Layer.mergeAll(A, B))`; compose shared deps vertically via `Layer.provide` so they're a single reference. (`Layer.fresh` / `Layer.memoize` for intentional per-instance cases.)
- Coverage gap confirmed: NOT in linteffect (`no-inline-runtime-provide` is different/narrower) nor Rika (`effect-no-provide-in-domain` is architectural).
- Relationship to tooling: `@effect/language-service` already ships a `multipleEffectProvide` diagnostic (editor-time — the "LSP plugin" Arnaldi references). Our oxlint rule complements it by enforcing in the CI/lint pass. Adjacent LSP diagnostics worth mirroring later: `strictEffectProvide` (off by default), `layerMergeAllWithDependencies`.
- Shape: structural, no type info — detect 2+ `Effect.provide` member-calls within one pipe chain. Easy-to-medium port.

## Open / deferred to build phase
- **House style:** reconcile gen-vs-pipe before enabling both — Rika's `effect-prefer-gen-over-flatmap-chain` (gen-first) conflicts with linteffect's flatten-the-ladder / `no-nested-effect-gen` (pipe-first). Pick one.
- **Rika reuse:** decide per rule — depend on `@rikalabs/oxlint-standards` (published, MIT) vs reimplement into `@mplibunao/oxlint-standards`. Since this is now MP's own broad standards pack, lean reimplement/curate (MIT-attributed) for rules worth keeping; a hard dep on a 1★ pre-1.0 package is the weaker option for a pack you own.
- **Provenance pipeline:** set up OIDC trusted-publishing + `--provenance` GitHub Actions release for the real package (the smoke test published without provenance).
