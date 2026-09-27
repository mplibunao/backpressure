import { describe, it } from "@effect/vitest"
import { strictEqual } from "@effect/vitest/utils"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Schedule from "effect/Schedule"
import { TestClock } from "effect/testing"

    it.effect("timeoutOrElse fails slow effects", () =>
      Effect.gen(function* () {
        const slow = Effect.sleep("1 second").pipe(
          Effect.as("done"),
          Effect.timeoutOrElse({
            duration: "10 millis",
            orElse: () => Effect.fail("timeout" as const),
          }),
        )

        const fiber = yield* slow.pipe(Effect.result, Effect.forkChild)
        yield* TestClock.adjust("20 millis")
        const result = yield* Fiber.join(fiber)

        strictEqual(result._tag, "Failure")
      }),
    )
