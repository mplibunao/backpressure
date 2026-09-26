import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import assert from "node:assert/strict"
import { describe, it } from "vitest"

class RenderError extends Data.TaggedError("RenderError")<{}> {}

describe("Cause", () => {
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
      for (const source of [Effect.succeed(1), Effect.fail(new RenderError())]) {
        assertCleanStack(Effect.match(source, { onSuccess: userCode, onFailure: userCode }))
        assertCleanStack(Effect.matchCause(source, { onSuccess: userCode, onFailure: userCode }))
      }
    })

    it("does not render internal frames from map", () => {
      assertCleanStack(Effect.succeed(1).pipe(Effect.map(userCode)))
    })
})
