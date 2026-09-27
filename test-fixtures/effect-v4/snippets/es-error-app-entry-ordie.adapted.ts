import * as Effect from "effect/Effect"
// hide-start
declare const loadConfig: Effect.Effect<{ port: number }, Error>
// hide-end

// At app entry: if config fails, nothing can proceed
const main = Effect.gen(function* () {
  // oxlint-disable-next-line @mplibunao/oxlint-standards/no-effect-escape-hatch -- app entry: without config nothing can run, so a defect is the honest outcome.
  const config = yield* loadConfig.pipe(Effect.orDie)
  yield* Effect.log(`Starting on port ${config.port}`)
})
