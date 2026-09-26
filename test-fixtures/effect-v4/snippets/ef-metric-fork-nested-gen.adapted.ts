import * as OtelMetrics from "@effect/opentelemetry/OtelMetrics"
import * as Resource from "@effect/opentelemetry/Resource"
import { assert, describe, it, vi } from "@effect/vitest"
import * as Duration from "effect/Duration"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Ref from "effect/Ref"
import * as String from "effect/String"
import * as Effect from "effect/Effect"
import { HttpClient, type HttpClientError, HttpClientResponse } from "effect/http"
import { OtlpExporter, OtlpMetrics, OtlpSerialization } from "effect/observability"
import { TestClock } from "effect/testing"

  it.effect("should record fiber runtime metrics once for yielded fibers", () => {
    let starts = 0
    let ends = 0
    const service: Metric.FiberRuntimeMetricsService = {
      recordFiberStart: () => {
        starts++
      },
      recordFiberEnd: () => {
        ends++
      }
    }

    return Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(Effect.gen(function*() {
        yield* Effect.yieldNow
        yield* Effect.yieldNow
      }))

      yield* Fiber.join(fiber)

      assert.strictEqual(starts, 1)
      assert.strictEqual(ends, 1)
    }).pipe(Effect.provideService(Metric.FiberRuntimeMetrics, service))
  })
