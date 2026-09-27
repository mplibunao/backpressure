import { describe, it } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Schedule from "effect/Schedule"
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
