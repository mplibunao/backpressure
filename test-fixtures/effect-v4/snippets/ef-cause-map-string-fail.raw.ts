import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import { pipe } from "effect/Function"
import * as Hash from "effect/Hash"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import assert from "node:assert/strict"
import { describe, it } from "vitest"

    const userCode = (): never => {
      throw new Error("boom")
    }
    const assertCleanStack = (effect: Effect.Effect<unknown, unknown>): void => {
      const exit = Effect.runSyncExit(effect)
      assert.ok(Exit.isFailure(exit))
      const rendered = Cause.pretty(exit.cause)
      assert.match(rendered, /\buserCode \(/)
      assert.doesNotMatch(rendered, /\/src\/internal\/|~effect\/Utils\/internal/)
    }

    it("does not render internal frames from match and matchCause handlers", () => {
      for (const source of [Effect.succeed(1), Effect.fail("error")]) {
        assertCleanStack(Effect.match(source, { onSuccess: userCode, onFailure: userCode }))
        assertCleanStack(Effect.matchCause(source, { onSuccess: userCode, onFailure: userCode }))
      }
    })

    it("does not render internal frames from map", () => {
      assertCleanStack(Effect.map(Effect.succeed(1), userCode))
    })
