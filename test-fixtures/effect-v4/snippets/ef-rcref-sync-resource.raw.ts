import { assert, describe, it } from "@effect/vitest"
import * as Clock from "effect/Clock"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as RcRef from "effect/RcRef"
import * as Ref from "effect/Ref"
import * as Scheduler from "effect/Scheduler"
import * as Scope from "effect/Scope"
import { TestClock } from "effect/testing"

  it.effect("releasing an invalidated borrower preserves the replacement resource", () =>
    Effect.gen(function*() {
      let acquired = 0
      const released: Array<number> = []
      const owner = yield* Scope.make()
      const scopeA = yield* Scope.make()
      const scopeB = yield* Scope.make()
      const scopeC = yield* Scope.make()
      const ref = yield* RcRef.make({
        acquire: Effect.acquireRelease(
          Effect.sync(() => ++acquired),
          (id) => Effect.sync(() => released.push(id))
        )
      }).pipe(Scope.provide(owner))

      const first = yield* RcRef.get(ref).pipe(Scope.provide(scopeA))
      yield* RcRef.invalidate(ref)
      const replacement = yield* RcRef.get(ref).pipe(Scope.provide(scopeB))
      yield* Scope.close(scopeA, Exit.void)
      const next = yield* RcRef.get(ref).pipe(Scope.provide(scopeC))
      yield* Scope.close(owner, Exit.void)
      const releasedAtOwnerClose = [...released]
      yield* Scope.close(scopeB, Exit.void)
      yield* Scope.close(scopeC, Exit.void)

      assert.deepStrictEqual(
        { first, replacement, next, releasedAtOwnerClose, released },
        { first: 1, replacement: 2, next: 2, releasedAtOwnerClose: [1, 2], released: [1, 2] }
      )
    }))
