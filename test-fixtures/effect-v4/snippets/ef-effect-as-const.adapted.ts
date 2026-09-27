import { assert, describe, it, vi } from "@effect/vitest"
import { assertExitFailure } from "@effect/vitest/utils"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Effectable from "effect/Effectable"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import type * as Filter from "effect/Filter"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import type * as LogLevel from "effect/LogLevel"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as References from "effect/References"
import * as Result from "effect/Result"
import * as Schedule from "effect/Schedule"
import * as Scheduler from "effect/Scheduler"
import * as Scope from "effect/Scope"
import * as TxRef from "effect/TxRef"
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
