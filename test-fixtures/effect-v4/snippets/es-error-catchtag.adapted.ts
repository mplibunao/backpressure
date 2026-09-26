import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

class HttpError extends Schema.TaggedErrorClass<HttpError>()(
  "HttpError",
  {
    statusCode: Schema.Number,
    message: Schema.String,
  }
) {}

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
  }
) {}

const program: Effect.Effect<string, HttpError | ValidationError> =
  Effect.fail(new HttpError({
    statusCode: 500,
    message: "Internal server error",
  }))

const recovered: Effect.Effect<string, ValidationError> = program.pipe(
  Effect.catchTag("HttpError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`HTTP ${error.statusCode}: ${error.message}`)
      return "Recovered from HttpError"
    })
  )
)
