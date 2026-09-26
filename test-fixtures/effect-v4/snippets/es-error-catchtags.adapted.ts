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

const recovered: Effect.Effect<string, never> = program.pipe(
  Effect.catchTags({
    HttpError: () => Effect.succeed("Recovered from HttpError"),
    ValidationError: () => Effect.succeed("Recovered from ValidationError")
  })
)
