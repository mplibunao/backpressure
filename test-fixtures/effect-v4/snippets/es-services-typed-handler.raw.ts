import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { Effect, Layer, Schema } from "effect"
import * as Context from "effect/Context"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
}) {}

class UserNotFoundError extends Schema.TaggedErrorClass<UserNotFoundError>()(
  "UserNotFoundError",
  {
    id: UserId,
  }
) {}

class GenericUsersError extends Schema.TaggedErrorClass<GenericUsersError>()(
  "GenericUsersError",
  {
    id: UserId,
    error: Schema.Defect,
  }
) {}

const UsersError = Schema.Union([UserNotFoundError, GenericUsersError])
type UsersError = typeof UsersError.Type

class Analytics extends Context.Service<
  Analytics,
  {
    readonly track: (event: string, data: Record<string, unknown>) => Effect.Effect<void>
  }
>()("@app/Analytics") {}

class Users extends Context.Service<
  Users,
  {
    readonly findById: (id: UserId) => Effect.Effect<User, UsersError | Schema.SchemaError>
    readonly all: () => Effect.Effect<readonly User[], HttpClientError.HttpClientError | Schema.SchemaError>
  }
>()("@app/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      // 1. yield* services you depend on
      const http = yield* HttpClient.HttpClient
      const analytics = yield* Analytics

      // 2. define the service methods with Effect.fn for call-site tracing
      const findById = Effect.fn("Users.findById")(
        (id: UserId): Effect.Effect<User, UsersError | Schema.SchemaError> =>
        Effect.gen(function* () {
          yield* analytics.track("user.find", { id })
          const response = yield* http.get(`https://api.example.com/users/${id}`)
          return yield* HttpClientResponse.schemaBodyJson(User)(response)
        }).pipe(
          Effect.catch((error): Effect.Effect<never, UsersError | Schema.SchemaError> => {
            if (HttpClientError.isHttpClientError(error)) {
              if (error.reason._tag === "StatusCodeError" && error.reason.response.status === 404) {
                return Effect.fail(new UserNotFoundError({ id }))
              }
              return Effect.fail(new GenericUsersError({ id, error }))
            }
            return Effect.fail(error)
          }),
        ),
      )

      // Use Effect.fn even for nullary methods (thunks) to enable tracing
      const all = Effect.fn("Users.all")(function* () {
        const response = yield* http.get("https://api.example.com/users")
        return yield* HttpClientResponse.schemaBodyJson(Schema.Array(User))(response)
      })

      // 3. return the service
      return { findById, all }
    })
  )
}
