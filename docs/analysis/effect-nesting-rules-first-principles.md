# Effect nesting rules from first principles

Decision document for two questions: what `no-pipe-ladder` blocks, and whether a separate rule against swallowed errors exists. Both rules are AST-only oxlint JS-plugin rules gated on a bound `Effect` namespace import; `@effect/tsgo` 0.45.0 runs beside them. API facts cite `/Users/mp/references/effect-ts/effect/packages/effect/src/Effect.ts` (`effect/`) and its `LLMS.md`. Hit counts come from a throwaway TypeScript-compiler-API scan that applies the criteria below verbatim, run over t3code at `53456bc01`, executor, effect-solutions, and the `effect` repo's `packages/effect/test` and `ai-docs`. Counts calibrate the rules; they never decide a criterion.

## Decisions in one paragraph

`no-pipe-ladder` becomes a closure-nesting rule: it reports an inline `Effect.flatMap`, `Effect.andThen`, or `Effect.tap` callback that sits inside another Effect step callback, at `error`, and stops reporting one-step handler bodies, `Effect.all` items, and pipelines nested in argument position. A new rule `no-discarded-failure` ships at `error`: it reports a `catch`, `catchCause`, `catchDefect`, `catchEager`, `mapError`, `match*` `onFailure`, or `try`/`tryPromise` `catch` handler that never reads its error, unless the same pipeline recorded the failure first with `tapError`, `tapCause`, or `tapDefect`. Named discards (`orElseSucceed`, `ignore`, `ignoreCause`, `option`, `result`, `exit`) and tag-scoped handlers (`catchTag`, `catchTags`, `catchReason`, `catchReasons`, `catchIf`, `catchFilter`) stay allowed. Confidence: high for the ladder rule, moderate for the discard rule; section 6 carries the strongest arguments against each.

## 1. Principles

These were written before reading any repo code. Each names a way Effect control flow or error flow becomes hard to read, change, or debug, with the closest Promise or plain TypeScript analogy.

**P1. Every closure is a scope the reader carries.** A callback introduces names that stay live for its whole body. Two nested callbacks mean two live scopes, and a value used in the inner one may come from either. Callback hell is this cost compounded: `getUser().then(user => getPosts(user.id).then(posts => render(user, posts)))` makes the reader hold `user` across the inner closure. `async`/`await` and `Effect.gen` turn the same program into three lines in one scope.

**P2. Sequencing should be expressed by order, not by structure.** In a generator, step N+1 is the line after step N. In a nested callback, step N+1 is *inside* step N, so "what runs after what" is encoded in indentation. A flat pipeline `a.pipe(Effect.flatMap(b), Effect.flatMap(c))` still reads in order; it only breaks down when a later step needs an earlier step's value and the author nests to get it in scope, which is P1 again. The shape to watch for is an effect step *inside* a step callback, not a pipeline with many steps.

**P3. Error handling is positional, and nesting hides its coverage.** A `catch` covers what precedes it in its own pipeline and nothing else. When that pipeline sits inside another callback, the reader has to work out which effects are inside the covered region and which are outside. Nested `try`/`catch` has the same problem: which `try` does this `catch` belong to, and what did it wrap. Flat pipelines and generators make coverage a matter of reading downward.

**P4. A change in one place should not silently change behaviour elsewhere.** Blanket recovery (`catch` over every error, `catchCause` over every cause) is a contract with the callee that the caller absorbs whatever the callee fails with. When a maintainer later adds a new failure to the callee, the blanket absorbs it with no compile error and no log. Tag-scoped recovery (`catchTag("NotFound", ...)`) fails to type-check instead, which is the change surfacing where it should. This is a behaviour fact, not taste: `Effect.catch` recovers "any error" and `Effect.catchCause` recovers "recoverable failures, defects, and interruptions" (`effect/Effect.ts:3216-3260`).

**P5. A failure that is never read is a bug that cannot be debugged.** Debugging works backwards from evidence such as a log line or a `cause` on the outer error. A handler that discards its input leaves none. In plain TypeScript this is `catch {}`, or `catch (e) { throw new AppError("failed") }` with `e` gone. The Effect spellings are `Effect.catch(() => fallback)`, `Effect.mapError(() => new AppError())`, and `Effect.tryPromise({ try, catch: () => new AppError() })`. Effect itself acknowledges this hazard by giving `Effect.ignore` a `log` option (`effect/Effect.ts:4251-4267`).

**P6. Structural positions are not sequencing.** Items of `Effect.all([...])`, arms of `Effect.raceFirst`, the resource argument of `Effect.scoped`, and the release callback of `Effect.acquireRelease` hold independent effects. Turning `Effect.all([a, b])` into `yield* a; yield* b` changes concurrency (a behaviour fact). A rule that pushes these into generators gives wrong advice.

**P7. A rule that fires on correct code teaches agents to disable it.** Lint runs with `--max-warnings 0`, so every report blocks. The target population is agent-written code; the failure mode being fought is agents drifting to `try`/`catch` and defensive catch-alls. A rule belongs in the pack when it fires on that drift and stays quiet on code the principles above call fine.

## 2. Criteria

Each criterion is derived from the principles and states whether the AST decides it exactly or approximates it.

**C1. Step callback.** An inline, non-generator arrow or function expression passed directly to a bound `Effect.*` call whose member takes a callback that produces the next effect or handles a failure: `flatMap`, `andThen`, `tap`, `tapError`, `tapCause`, `tapDefect`, `catch`, `catchCause`, `catchDefect`, `catchEager`, `catchIf`, `catchFilter`, `catchCauseIf`, `catchCauseFilter`, `catchTag`, `catchReason`, `forEach`, `acquireRelease`, `acquireUseRelease`, plus the property values of the handler object passed to `catchTags`, `catchReasons`, `matchEffect`, and `matchCauseEffect`. AST-exact. Derived from P1: these are the closures that carry scope.

**C2. Effect continuation closure.** A bound `Effect.flatMap`, `Effect.andThen`, or `Effect.tap` call that takes an inline function argument, in pipe-step form (`Effect.flatMap((x) => ...)`) or data-first form (`Effect.flatMap(self, (x) => ...)`). AST-exact. Derived from P1 and P2: this is a closure inside which another effect runs, so both scope and sequencing nest. `Effect.map` with an inline function is deliberately excluded because a `map` transforms a value without running an effect, so P2 and P3 do not apply; `Effect.andThen(effect)` and `Effect.flatMap(namedFn)` without an inline function add a step but no closure, which is sequencing by order (P2, allowed).

**C3. Ladder.** A step callback (C1) whose body contains an effect continuation closure (C2), searching the body without entering generator functions, function declarations, class bodies, or another step callback. AST-exact. Generator bodies reset to one linear scope (P1, P2); another step callback is judged on its own so a three-deep pyramid reports each offending level once.

**C4. Blind handler.** An inline function whose parameter list is empty, or whose parameters are all plain identifiers that the body never references. A destructured or rest parameter counts as read. Approximated: reference detection is by identifier name inside the handler body and does not model shadowing; a same-named inner binding would count as a read. Derived from P5.

**C5. Blind recovery.** A blind handler (C4) passed to bound `Effect.catch`, `catchCause`, `catchDefect`, `catchEager`, or `mapError`, or as the `onFailure` property of `Effect.match`, `matchEffect`, `matchCause`, `matchCauseEffect`, `matchEager`, or `mapBoth`, or as the `catch` property of `Effect.try` / `Effect.tryPromise`. Derived from P4 and P5. Excluded on purpose:

- Tag-scoped or predicate-scoped members (`catchTag`, `catchTags`, `catchReason`, `catchReasons`, `catchIf`, `catchFilter`, `catchCauseIf`, `catchCauseFilter`): the tag or predicate already states what is absorbed (P4 satisfied), and an unused parameter there is normal.
- Named discards (`orElseSucceed`, `ignore`, `ignoreCause`, `option`, `result`, `exit`, `eventually`, `retry`): the member name states the discard, and `option`/`result`/`exit` move the failure into a value the caller must inspect. The type says `never` for `orElseSucceed` and `ignore`, so the P4 hazard remains, but the name is the reader's evidence and `@effect/tsgo` already rewrites constant handlers to these names.

**C6. Recorded first.** A blind recovery is allowed when an earlier step in the same `.pipe(...)` argument list, or the data-first source argument, is a bound `Effect.tapError`, `tapCause`, or `tapDefect` call. AST-exact for those two placements; a tap in an enclosing pipeline or behind an alias is not seen (approximation, accepted). Derived from P5: the failure was observed before it was dropped.

**C7. Structural positions are not owners.** Array items of `Effect.all`, arguments of `race*`, `scoped`, `ensuring`, `fork*`, and `run*`, and pipelines nested in a step's argument position (`Effect.zip(other.pipe(...))`) never form a ladder edge. AST-exact. Derived from P6.

## 3. Decision: `no-pipe-ladder`

**Reports** each ladder (C3) once, at the inner continuation call. Severity `error`; rationale class `agent-failure-mode`, per ADR-004's grading, because nested callbacks are the direct Effect translation of the `.then` pyramids and nested `try`/`catch` that agent output drifts toward. Every site the criterion flagged in the stress test reads better as a generator, and the fix is mechanical.

**Message** (362 characters):

```
Rule: no-pipe-ladder. Why: an inline Effect.flatMap, andThen, or tap callback nested inside another Effect callback sequences steps by indentation, like nested .then or try/catch, so a reader tracks every closure to see what runs when. Fix: yield* each step in one Effect.gen or Effect.fn; one-step handler bodies and Effect.all items are fine. Ref: house style.
```

### Shapes blocked

1. Continuation inside a `flatMap` / `andThen` / `tap` callback, any spelling.
   - Blocked: `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save({ user, posts })))))`; the same with data-first `Effect.flatMap(getUser, (user) => Effect.flatMap(fetchPosts(user.id), (posts) => ...))`; the same with standalone `pipe(getUser, Effect.flatMap((user) => pipe(fetchPosts(user.id), Effect.tap((posts) => log(posts)))))`.
   - Allowed: `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id)), Effect.tap((posts) => log(posts)))` (flat chain, P2), and `Effect.gen(function* () { const user = yield* getUser; const posts = yield* fetchPosts(user.id); yield* save({ user, posts }) })`.
2. Continuation inside a handler callback (`catch*`, `tapError`, `matchEffect` handlers, `catchTags` map values).
   - Blocked: `Effect.catchTag("StorageError", (err) => resolveCapture.pipe(Effect.flatMap((c) => c.captureException(err)), Effect.flatMap((traceId) => Effect.fail(new InternalError({ traceId })))))` (executor `packages/core/api/src/observability.ts:107`).
   - Allowed: `Effect.catch((cause) => Effect.logWarning("failed", { cause }).pipe(Effect.as({ threadCount: 0, projectCount: 0 })))` (t3code `apps/server/src/serverRuntimeStartup.ts:161`): one step with an adornment, no inner closure.
3. Continuation inside a `forEach` body or a resource callback.
   - Blocked: `Effect.forEach(items, (item) => fetchPosts(item).pipe(Effect.flatMap((posts) => save({ item, posts }))))`. Fix: `Effect.forEach(items, Effect.fnUntraced(function* (item) { const posts = yield* fetchPosts(item); yield* save({ item, posts }) }))`.
   - Allowed: `Effect.forEach(rows, (row) => describe(row).pipe(Effect.map((methods) => toIntegration(row, methods))))` (executor `packages/core/sdk/src/executor.ts:3215`): `map` is a value transform (C2). Also allowed: `Effect.acquireRelease(Effect.void, () => stopAll().pipe(Effect.andThen(Queue.shutdown(q)), Effect.andThen(close), Effect.ignore))` (t3code `apps/server/src/provider/Layers/CodexAdapter.ts:2713`): a flat sequence inside one closure.
4. Ladder inside a generator that could have held it.
   - Blocked: `Effect.gen(function* () { return yield* getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.tap(() => log("done"))))) })`.
   - Allowed: `Effect.gen(function* () { const posts = yield* fetchPosts(id).pipe(Effect.timeout("1 second"), Effect.mapError((cause) => new NotFound(cause))); return posts })`: adornments on one `yield*` step.
5. Ladder reached through a non-Effect callback.
   - Blocked: `Effect.flatMap((user) => Effect.all(items.map((item) => fetchPosts(item).pipe(Effect.flatMap((posts) => save({ user, posts }))))))`: the array callback adds a scope, it does not reset one.
   - Allowed: `Effect.flatMap((user) => Effect.gen(function* () { ... }))`: a generator body is a fresh linear frame, and a callback that returns one is a single step.

### Shapes no longer reported

- A one-step or adornment-only pipeline inside a callback: `work.pipe(Effect.flatMap((x) => other.pipe(Effect.map(f), Effect.catch(g))))`. The current contract's first invalid case becomes valid; under P1 and P2 it is one step with two adornments.
- A pipeline in argument position: `work.pipe(Effect.zip(other.pipe(Effect.map(f))))`, `Effect.all([q.pipe(Effect.mapError(wrap))])`, `Effect.retry(work, Schedule.exponential("1 second").pipe(...))`. C7.
- Standalone nested pipes with no callback: `pipe(pipe(work, Effect.map(f)), Effect.catch(g))`. Its problem is redundant wrapping, not nesting; the member-call form belongs to `effecttsgo/unnecessary-pipe-chain` (warn), and the standalone form is an accepted gap listed in section 5.
- Handler-map values with adornment-only bodies: `Effect.catchTags({ Failure: () => fallback.pipe(Effect.map(f)) })`.

The `isQualifyingEffectPipeline` notion (every pipe step a bound Effect call) is no longer needed; nesting is defined by callbacks, so Layer, Schema, and Schedule pipes need no exemption. The three-deep case `first.pipe(Effect.flatMap(() => second.pipe(Effect.flatMap(() => third.pipe(Effect.map(f))))))` reports once (the outer callback holds an inline `flatMap`; the middle callback holds only a `map`), where the current test expects two.

**tsgo overlap.** `nested-effect-gen-yield` (error) reports `yield* Effect.gen(...)` inside a generator; `effect-fn-opportunity` (error) reports functions that return a generator; `unnecessary-pipe-chain` (warn) reports `.pipe(a).pipe(b)`; `missed-pipeable-opportunity` (warn) reports nested plain calls. None reports a callback inside a callback, so there is no duplication.

**Measured on the reference repos.**

- t3code: 469 ladders. The current rule reports 413 there; 82% of those are one-step pipelines outside the new criterion.
- t3code, name crossing: 366 of the 469 ladders reference an outer-callback name inside the inner continuation (P1).
- executor: 18.
- `effect/packages/effect/test`: 4.
- effect-solutions: 1.
- `effect/ai-docs`: 0.

## 4. Decision: `no-discarded-failure`

**Build it.** `@effect/tsgo` polices the *spelling* of a discard (`catch-to-ignore` and `catch-to-or-else-succeed` at warn rewrite constant handlers to `Effect.ignore` and `Effect.orElseSucceed`; `catch-all-to-map-error` rewrites a catch-and-refail to `mapError`) but never asks whether the failure was read or recorded. The owner's concern, agents that catch everything and continue, lives in that gap.

**Reports** each blind recovery (C5) not recorded first (C6), once, at the combinator call. Severity `error`; rationale class `agent-failure-mode`. Name: `no-discarded-failure`.

**Message** (361 characters):

```
Rule: no-discarded-failure. Why: a catch, catchCause, mapError, match, or try handler that never reads its error hides which failures it absorbs and drops the cause, so new failure types vanish. Fix: name tags with Effect.catchTag/catchTags, pass the error as cause, or record it first with tapError, tapCause, or Effect.ignore({ log: true }). Ref: house style.
```

### Shapes blocked

1. Blind catch-all with a non-constant fallback (tsgo is silent here).
   - Blocked: `Effect.catch(() => relayInternalErrorResponse("internal_error"))` (t3code `infra/relay/src/http/Api.ts:659`): a 500 with no log of why.
   - Allowed: `Effect.catch((cause) => Effect.logError("request failed", { cause }).pipe(Effect.as(response)))`.
2. Blind catch-all with a constant fallback (also `catch-to-or-else-succeed` / `catch-to-ignore` at warn).
   - Blocked: `fs.stat(cacheFile).pipe(Effect.catch(() => Effect.succeed(undefined)))` (executor `packages/core/integrations-registry/src/registry.ts:135`).
   - Allowed: `fs.stat(cacheFile).pipe(Effect.orElseSucceed(() => undefined))`, which is also tsgo's fix, so one edit clears both diagnostics. `Effect.catch((_) => Effect.succeed(3000))` from `LLMS.md:212` is the same case.
3. Blind cause-level recovery. This is the strongest shape: it hides defects (thrown bugs) and interruption.
   - Blocked: `Effect.catchCause(() => Effect.succeed([]))` (executor `packages/core/sdk/src/executor.ts:3147`); `Effect.catchCause(() => cleanupFailedKey(item.key))` (t3code `packages/shared/src/KeyedCoalescingWorker.ts:104`).
   - Allowed: `Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : Ref.update(state, markUnavailable).pipe(Effect.andThen(publishHealth)))` (t3code `apps/server/src/resourceTelemetry/NativeTelemetryClient.ts:758`).
4. Blind `mapError`.
   - Blocked: `Effect.mapError(() => new ConnectionBlockedError({ reason: "configuration", detail: "Could not create the websocket authorization proof." }))` (t3code `packages/client-runtime/src/authorization/service.ts:204`).
   - Allowed: `Effect.mapError((cause) => new ConnectionBlockedError({ reason: "configuration", cause }))`.
5. Blind `try` / `tryPromise` handler.
   - Blocked: `Effect.tryPromise({ try: () => readFile(file, "utf8"), catch: () => null })` (effect-solutions `packages/cli/src/update-notifier.ts:40`): the failure value becomes `null`.
   - Allowed: `Effect.tryPromise({ try: () => fetch(url), catch: (cause) => new FetchError({ cause }) })`, the form `effect/ai-docs/src/01_effect/01_basics/10_creating-effects.ts:46-56` teaches.
6. Blind `match*` `onFailure`.
   - Blocked: `Effect.match({ onFailure: () => undefined, onSuccess: (value) => value })` (t3code `scripts/mock-update-server.ts:67`).
   - Allowed: `work.pipe(Effect.tapError((error) => Effect.logDebug("probe failed", error)), Effect.match({ onFailure: () => undefined, onSuccess: (value) => value }))`.
7. Recorded-first and named discards, both allowed: `work.pipe(Effect.tapError(log), Effect.catch(() => fallback))`; `Effect.catch(Effect.tapError(work, log), () => fallback)`; `fileSystem.exists(p).pipe(Effect.orElseSucceed(() => false))` (t3code `apps/desktop/src/wsl/DesktopWslEnvironment.ts:1167`); `Effect.ignore`; `Effect.catchTag("NotFound", () => Effect.succeed(0))`; `Effect.catch(({ message }) => log(message))`.

**tsgo overlap check** (`scripts/references/tsgo/0.45.0/metadata.json`, severities in `packages/oxlint-standards/src/generated/tsgo-policy.ts`):

| tsgo rule | Shipped | Overlap with `no-discarded-failure` | Allowed under ADR-007 because |
|---|---|---|---|
| `catch-to-ignore` | warn | both fire on `catch(() => Effect.void)` | stricter: tsgo accepts bare `Effect.ignore`; this rule's message asks for `{ log: true }` and fires without a TypeScript project |
| `catch-to-or-else-succeed` | warn | both fire on `catch(() => Effect.succeed(x))` | same; the shared fix `orElseSucceed` clears both |
| `catch-all-to-map-error` | warn | both fire on `catch(() => Effect.fail(new X()))` | tsgo's rewrite `mapError(() => new X())` is still blind; this rule keeps firing until the cause is carried |
| `unknown-in-effect-catch` | error | none: it checks the handler's return type | n/a |
| `catch-unfailable-effect` | warn | none: it checks the source's error type | n/a |
| `catch-die-to-or-die` | off | none | n/a |

No tsgo rule checks whether a handler reads its parameter, so the rule's core is not a duplicate.

**Measured on the reference repos.** t3code: 623 (378 are constant-handler `catch` calls tsgo already reports; the remaining 245 are `mapError` 74, non-constant `catch` 47, `try` 40, `tryPromise` 16, blind `catchCause` 55, `match*` 12, `catchDefect` 1). executor: 186 (constant `catch` 66, blind `catchCause` 37, `tryPromise` 36, `mapError` 26, `try` 12, other `catch` 9). effect-solutions: 10. `effect/packages/effect/test`: 23. `effect/ai-docs`: 2.

## 5. Stress test

Verdict column is from the principles alone; L and D are what the two rules report. Own snippets are in the first block (S1-S16, D1-D14, written across pipe, data-first, standalone `pipe`, generator, `forEach`, `Effect.all`, handler-map, and interop spellings, some deliberately sloppy). Repo rows cite file:line.

| # | Snippet | Source | Principle verdict | L | D | Match |
|---|---|---|---|---|---|---|
| S1 | `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.map((posts) => ({ user, posts })))))` | own | mild: value pairing, no effect in the inner closure; generator is nicer | no | no | accepted limitation A |
| S2 | `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save({ user, posts })))))` | own | ladder (P1, P2) | yes | no | yes |
| S3 | `Effect.flatMap(getUser, (user) => Effect.flatMap(fetchPosts(user.id), (posts) => save({ user, posts })))` | own | ladder, data-first spelling | yes | no | yes |
| S4 | `pipe(getUser, Effect.flatMap((user) => pipe(fetchPosts(user.id), Effect.tap((posts) => log(posts)))))` | own | ladder, standalone `pipe` spelling | yes | no | yes |
| S5 | `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id)), Effect.tap((posts) => log(posts)), Effect.map((posts) => posts.length))` | own | fine: flat chain (P2) | no | no | yes |
| S6 | `Effect.gen(function* () { const posts = yield* fetchPosts(id).pipe(Effect.timeout("1 second"), Effect.mapError((cause) => new NotFound(cause))); return posts })` | own | fine: adorned `yield*` | no | no | yes |
| S7 | `Effect.gen(function* () { return yield* getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.tap(() => log("done"))))) })` | own | ladder inside an unused generator | yes | no | yes |
| S8 | `work.pipe(Effect.catch((error) => log(error).pipe(Effect.as(0))))` | own | fine: one-step handler, error read | no | no | yes |
| S9 | `work.pipe(Effect.catchTag("NotFound", (error) => log(error).pipe(Effect.andThen(Effect.succeed(0)))))` | own | fine: flat two-step handler, no inner closure | no | no | yes |
| S10 | `Effect.forEach(items, (item) => fetchPosts(item).pipe(Effect.map((posts) => posts.length)))` | own | fine: loop body with a value transform | no | no | yes |
| S11 | `Effect.forEach(items, (item) => fetchPosts(item).pipe(Effect.flatMap((posts) => save({ item, posts }))))` | own | ladder in a loop body | yes | no | yes |
| S12 | `Effect.all([work.pipe(Effect.map(String)), work.pipe(Effect.mapError((cause) => new NotFound(cause)))], { concurrency: "unbounded" })` | own | fine: structural (P6) | no | no | yes |
| S13 | `getUser.pipe(Effect.flatMap((user) => Effect.gen(function* () { const posts = yield* fetchPosts(user.id); yield* save(posts); return posts })))` | own | fine: one closure, linear body | no | no | yes |
| S14 | `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap((posts) => save(posts).pipe(Effect.andThen(log(user)))))))` | own | ladder, three deep | yes (1 report; the middle body has no inline continuation) | no | yes |
| S15 | `getUser.pipe(Effect.flatMap((user) => fetchPosts(user.id).pipe(Effect.flatMap(save))))` | own | mild: sequencing by structure with no extra scope; a sibling step fixes it | no | no | accepted limitation B |
| S16 | `getUser.pipe(Effect.flatMap((user) => Effect.all(items.map((item) => fetchPosts(item).pipe(Effect.flatMap((posts) => save({ user, posts })))))))` | own | ladder through an array callback | yes | no | yes |
| D1 | `work.pipe(Effect.catch(() => log("failed")))` | own | discard: logs the fact, not the failure (P5) | no | yes | yes |
| D2 | `work.pipe(Effect.catch(() => Effect.succeed(0)))` | own | discard (P4, P5); tsgo also warns | no | yes | yes |
| D3 | `work.pipe(Effect.orElseSucceed(() => 0))` | own | named discard: allowed, P4 hazard remains visible by name | no | no | accepted limitation C |
| D4 | `work.pipe(Effect.catch((error) => log(error).pipe(Effect.as(0))))` | own | fine | no | no | yes |
| D5 | `work.pipe(Effect.catchTag("NotFound", () => Effect.succeed(0)))` | own | fine: scope named | no | no | yes |
| D6 | `work.pipe(Effect.tapError((error) => log(error)), Effect.catch(() => Effect.succeed(0)))` | own | fine: recorded first | no | no | yes |
| D7 | `work.pipe(Effect.catchCause(() => Effect.void))` | own | discard, hides defects and interruption | no | yes | yes |
| D8 | `work.pipe(Effect.mapError(() => new NotFound()))` | own | discard: cause dropped | no | yes | yes |
| D9 | `work.pipe(Effect.mapError((cause) => new NotFound(cause)))` | own | fine | no | no | yes |
| D10 | `Effect.tryPromise({ try: () => fetch("x"), catch: () => new NotFound() })` | own | discard: thrown value dropped | no | yes | yes |
| D11 | `work.pipe(Effect.match({ onFailure: () => null, onSuccess: (n) => n }))` | own | discard | no | yes | yes |
| D12 | `work.pipe(Effect.catch((_) => Effect.succeed(0)))` | own | discard; `_` names nothing | no | yes | yes |
| D13 | `work.pipe(Effect.catch(({ message }) => log(message)))` | own | reads the failure | no | no | yes |
| D14 | `Effect.catch(Effect.tapError(work, (e) => log(e)), () => Effect.succeed(0))` | own | fine: recorded first, data-first | no | no | yes |
| R1 | `getCounts().pipe(Effect.catch((cause) => Effect.logWarning("...", { cause }).pipe(Effect.as({ threadCount: 0, projectCount: 0 }))))` | t3code `apps/server/src/serverRuntimeStartup.ts:161` | fine: one-step handler, cause logged | no | no | yes |
| R2 | `Effect.catchCause((cause) => Effect.logError("...").pipe(Effect.annotateLogs({ sessionId, cause })))` | t3code `apps/server/src/auth/SessionStore.ts:589` | fine for both rules; whether `catchCause` should be `catch` here is a design choice outside AST reach | no | no | yes |
| R3 | `Effect.all([collect(child.stdout), collect(child.stderr), child.exitCode.pipe(Effect.map(Number))], { concurrency: "unbounded" })` | t3code `scripts/sync-reference-repos.ts:240` | fine: structural, must stay concurrent | no | no | yes |
| R4 | `Effect.all([listProjectRows().pipe(Effect.mapError(toPersistenceError("...", "..."))), ...])` | t3code `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts:2791` | fine: structural | no | no | yes |
| R5 | `providerSource.refresh.pipe(Effect.flatMap((nextProvider) => correlate(providerSource, nextProvider).pipe(Effect.flatMap(syncProvider))))` inside `Effect.fn` | t3code `apps/server/src/provider/Layers/ProviderRegistry.ts:556` | mild: same as S15; the unused generator is `unnecessary-effect-gen`'s (warn) territory | no | no | accepted limitation B |
| R6 | `child.exitCode.pipe(Effect.flatMap((exitCode) => Ref.get(closedRef).pipe(Effect.flatMap((closed) => { ... exitCode ... }))))` | t3code `apps/server/src/provider/Layers/CodexSessionRuntime.ts:2404` | ladder; `exitCode` crosses | yes | no | yes |
| R7 | `Effect.flatMap(Clock.currentTimeMillis, (now) => { ...; return revalidate(recorded).pipe(Effect.as(snapshot.value)) })` | t3code `apps/server/src/pullRequest/PullRequestService.ts:2542` | fine: one closure, adornment | no | no | yes |
| R8 | `getRefreshInterval.pipe(Effect.flatMap((refreshInterval) => Effect.raceFirst(...).pipe(Effect.flatMap((intervalElapsed) => ... refreshInterval ...))))` | t3code `apps/server/src/provider/makeManagedServerProvider.ts:252` | ladder; the current rule pinned the harmless `raceFirst` arms instead | yes, at the pyramid | no | yes |
| R9 | `Effect.catch(() => refreshFileSize(fs, path).pipe(Effect.flatMap((size) => Ref.set(currentSize, size))))` | t3code `apps/desktop/src/app/DesktopObservability.ts:291` | ladder and discard | yes | yes | yes |
| R10 | `Effect.acquireRelease(Effect.void, () => stopAll().pipe(Effect.andThen(Queue.shutdown(q)), Effect.andThen(close), Effect.ignore))` | t3code `apps/server/src/provider/Layers/CodexAdapter.ts:2713` | fine: flat finalizer sequence, named discard | no | no | yes |
| R11 | `Effect.flatMap((previous) => previous === stage ? Effect.void : Ref.set(lastStage, stage).pipe(Effect.andThen(reportProgress(stage))))` | t3code `apps/server/src/desktopUpdate/DesktopAppUpdate.ts:92` | mild: a two-step branch with no inner closure | no | no | accepted limitation B |
| R12 | `Effect.mapError(() => new ConnectionBlockedError({ reason: "configuration", detail: "..." }))` | t3code `packages/client-runtime/src/authorization/service.ts:204` | discard: the crypto failure is lost | no | yes | yes |
| R13 | `decode(raw).pipe(Effect.map(normalize), Effect.orElseSucceed(() => defaultSettings))` | t3code `apps/desktop/src/settings/DesktopAppSettings.ts:409` | named discard; a corrupt settings file resets silently, which is the P4/P5 residue of allowing named discards | no | no | accepted limitation C |
| R14 | `Effect.try({ try: () => decodeURIComponent(rawPath), catch: () => null })` | t3code `scripts/mock-update-server.ts:63` | discard: failure value is `null` | no | yes | yes |
| R15 | `Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : Ref.update(state, ...).pipe(Effect.andThen(publishHealth), ...))` | t3code `apps/server/src/resourceTelemetry/NativeTelemetryClient.ts:758` | fine: cause inspected, flat sequence | no | no | yes |
| R16 | `fs.stat(cacheFile).pipe(Effect.catch(() => Effect.succeed(undefined)))` | executor `packages/core/integrations-registry/src/registry.ts:135` | discard; a cache miss, so `orElseSucceed` is the honest spelling | no | yes | yes |
| R17 | `Effect.catchCause(() => Effect.succeed([]))` | executor `packages/core/sdk/src/executor.ts:3147` | discard that hides defects | no | yes | yes |
| R18 | `Effect.catchTag("StorageError", (err) => resolveCapture.pipe(Effect.flatMap((c) => c.captureException(Cause.fail(err))), Effect.flatMap((traceId) => Effect.fail(new InternalError({ traceId })))))` | executor `packages/core/api/src/observability.ts:107` | ladder; `err` crosses | yes | no | yes |
| R19 | `Effect.forEach(rows, (row) => describeAuthMethodsForRow(row).pipe(Effect.map((authMethods) => rowToIntegration(row, authMethods))))` | executor `packages/core/sdk/src/executor.ts:3215` | fine: value transform in a loop body | no | no | yes |
| R20 | `Effect.try({ try: () => new URL(value), catch: () => new HostedOutboundRequestBlocked({ url: value, reason: "URL is invalid" }) })` | executor `packages/core/sdk/src/hosted-http-client.ts:144` | acceptable: the thrown `TypeError` carries nothing the new error lacks | no | yes | accepted limitation D |
| R21 | `Effect.tryPromise({ try: () => readFile(file, "utf8"), catch: () => null })` | effect-solutions `packages/cli/src/update-notifier.ts:40` | discard | no | yes | yes |
| R22 | `Effect.catch(() => Effect.sync(() => process.exit(1)))` | effect-solutions `packages/cli/src/cli.ts:197` | discard: exits without saying why | no | yes | yes |
| R23 | `Effect.acquireRelease(launch.pipe(...), (browser) => Effect.promise(() => browser.close()).pipe(Effect.tap(() => Console.log("Browser closed"))))` | effect-solutions `packages/website/scripts/generate-og/browser.ts:11` | marginal ladder: an effect closure inside the release closure | yes | no | yes, at the margin |
| R24 | `Effect.forEach(values, (value) => encode(value).pipe(Effect.flatMap((bytes) => Effect.yieldNow.pipe(Effect.as(bytes)))), { concurrency: "unbounded" })` | effect `packages/effect/test/encoding/SchemaBinary.test.ts:312` | ladder; `Effect.tap(() => Effect.yieldNow)` or a generator fixes it | yes | no | yes |
| R25 | `Effect.tryPromise({ try: () => webRequest.formData(), catch: () => undefined })` | effect `packages/effect/test/http/HttpServerRequest.test.ts:18` | discard | no | yes | yes |
| R26 | `Effect.fromNullishOr(header).pipe(Effect.mapError(() => new MissingWorkspaceId()))` | effect `ai-docs/src/01_effect/01_basics/10_creating-effects.ts:61` | acceptable: `NoSuchElementError` carries nothing | no | yes | accepted limitation D |
| R27 | `loadPort("invalid").pipe(Effect.catchTag("ReservedPortError", (_) => Effect.succeed(3000)), Effect.catch((_) => Effect.succeed(3000)))` | effect `ai-docs/src/01_effect/04_errors/01_error-handling.ts:29` | the final `catch` is a blanket; tsgo already rewrites it to `orElseSucceed` | no | yes | yes |

### Accepted limitations

- **A. Value `map` inside a step callback** (S1, R19, 333 sites in t3code). The inner closure runs no effect, so P2 and P3 do not apply and P1 costs one small scope. Flagging it would report every `forEach(item => fetch(item).pipe(Effect.map(...)))`, which is P7's failure mode. The generator form is still preferred; the `Effect.gen`-first policy that tsgo's `effect-fn-opportunity` enforces pulls in that direction without this rule.
- **B. Opaque or value-argument continuation inside a step callback** (S15, R5, R11). `flatMap(save)` and `andThen(effect)` add a step but no scope; the flat sibling-step form is the fix, and the rule's "use a generator" message would be the wrong instruction. A rule with two different fixes has a muddy message, so these stay unreported.
- **C. Named discards** (D3, R13, and the 612 bare `Effect.ignore` and 325 `orElseSucceed` sites in t3code). The P4 hazard (a new failure type is absorbed silently) survives when the member name announces the discard. Reporting them turns `fileSystem.exists(p).pipe(Effect.orElseSucceed(() => false))` into an error (the P7 cost) and pushes `{ log: true }` onto hundreds of expected-failure sites. The message still names `Effect.ignore({ log: true })` so agents reach for it.
- **D. Blind `mapError` / `try` handlers over content-free sources** (R20, R26). The AST cannot see that the source error carries nothing. Passing `cause` anyway is harmless, and an inline disable with a reason is the documented route for the rare case where a caller must not receive the cause.
- **E. Standalone `pipe(pipe(a, f), g)`** with no callback is not a ladder; tsgo's `unnecessary-pipe-chain` covers only the member form. Rare in v4 code, where `.pipe` dominates.
- **F. Shadowing inside a blind-handler check** (C4) and taps behind an alias or in an enclosing pipeline (C6) are not modelled. Both errors are on the permissive side.

## 6. Strongest counterarguments and residual risks

**Against the ladder decision.** Dropping one-step pipelines from `no-pipe-ladder` removes the rule's pressure on `flatMap((x) => other.pipe(Effect.map(f), Effect.catch(g)))`, and a pipe-first codebase can keep writing every sequence as a `flatMap` chain with adornments and never hear from this rule. That is true, and it is deliberate: a flat chain is sequencing by order (P2), tsgo's `effect-fn-opportunity` and `effect-do-notation` already carry the gen-first policy at error, and a rule that reported the 337 one-step sites in t3code would be reporting Effect's own documented handler shape (`LLMS.md:37`). The residual risk is limitation A: agents that write `forEach(item => a(item).pipe(Effect.map(r => ({ item, r }))))` everywhere produce a style that is legal but heavier than a generator. If that pattern shows up in agent output at volume, the next step is to count `map` with an inline function as a continuation when its body references a name from the outer callback (the harness measured that predicate; it is AST-decidable) rather than to reinstate pipeline-based nesting.

**Against the discard decision.** The reference repos are human-reviewed and carry 623, 186, and 10 sites the rule would report; 378 of t3code's are constant handlers tsgo already reports, but 245 are not, and some (`new URL` parsing, `fromNullishOr`) discard nothing of value. The precedent is `prefer-schema-over-json`, which this pack turned off after 313 executor hits with two improvements. The difference is the improvement rate: of the 27 repo rows above the rule reports 11, and 9 of those lose a cause, a log line, or a defect (R9, R12, R14, R16, R17, R21, R22, R25, R27); the two content-free cases (R20, R26) cost one `cause` field or one disable comment. The residual risk is ritual compliance: an agent that answers every report with `Effect.tapError(Effect.logDebug)` produces logs instead of decisions. That outcome is still better than silence, because P5 is satisfied at runtime, and the message lists `catchTag` first so the cheaper fix is not the first one an agent sees. If ritual taps show up, the follow-up is to require the tap to reference its error (C4 applied to the tap), which is the same AST check.

**Shared risk.** Both rules define "reads its error" and "inline continuation" syntactically. A helper such as `const fallback = () => Effect.succeed(0)` passed by name is invisible to both, as is a continuation behind a user wrapper. That is the AST boundary ADR-007 accepts; the rules fire on the shapes agents write inline, which is where the drift happens.
