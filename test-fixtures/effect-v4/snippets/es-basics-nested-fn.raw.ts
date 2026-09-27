import { describe, it } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import { Effect, Fiber, Schedule } from "effect"
import { TestClock } from "effect/testing"

    it.effect("preserves effect semantics", () =>
      Effect.gen(function* () {
        const fetchAndDouble = Effect.fn("fetchAndDouble")(function* (value: number) {
          const data = yield* Effect.succeed(value)
          return data * 2
        })

        const result = yield* fetchAndDouble(21)
        strictEqual(result, 42)
      }),
    )
