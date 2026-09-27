import { Effect } from "effect"
// hide-start
declare const loadConfig: Effect.Effect<{ port: number }, Error>
// hide-end

// At app entry: if config fails, nothing can proceed
const main = Effect.gen(function* () {
  const config = yield* loadConfig.pipe(Effect.orDie)
  yield* Effect.log(`Starting on port ${config.port}`)
})
