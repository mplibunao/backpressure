import { assert, describe, it, vi } from "@effect/vitest"
import { assertExitFailure } from "@effect/vitest/utils"
import {
  Cause,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Effectable,
  Exit,
  Fiber,
  type Filter,
  Latch,
  Layer,
  Logger,
  type LogLevel,
  Option,
  Ref,
  References,
  Result,
  Schedule,
  Scheduler,
  Scope,
  TxRef
} from "effect"
import { constFalse, constTrue, pipe } from "effect/Function"
import { TestClock } from "effect/testing"
import { assertCauseFail } from "./utils/assert.ts"

    it.effect("returns the first success and does not run later effects", () =>
      Effect.gen(function*() {
        const executed: Array<string> = []
        const result = yield* Effect.firstSuccessOf([
          Effect.sync(() => executed.push("first")).pipe(
            Effect.flatMap(() => Effect.fail("e1" as const))
          ),
          Effect.sync(() => executed.push("second")).pipe(
            Effect.as("success" as const)
          ),
          Effect.sync(() => executed.push("third")).pipe(
            Effect.as("unreachable" as const)
          )
        ])

        assert.strictEqual(result, "success")
        assert.deepStrictEqual(executed, ["first", "second"])
      }))
