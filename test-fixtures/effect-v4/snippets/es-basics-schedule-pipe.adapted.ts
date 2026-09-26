import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
// hide-start
declare const fetchData: Effect.Effect<string>
// hide-end

const program = fetchData.pipe(
  Effect.timeout("5 seconds"),
  Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.both(Schedule.recurs(3)))),
  Effect.tap((data) => Effect.logInfo(`Fetched: ${data}`)),
  Effect.withSpan("fetchData")
)
