import * as Effect from 'effect/Effect'
import * as Atom from 'effect/reactivity/Atom'
import type * as AtomRegistry from 'effect/reactivity/AtomRegistry'

declare const count: Atom.Writable<number, number>
declare const registry: AtomRegistry.AtomRegistry

export const program = Effect.gen(function* () {
  const current = yield* Atom.get(count)
  yield* Atom.set(count, current + 1)
  yield* Atom.update(count, (n) => n + 1)
  const previous = yield* Atom.modify(count, (n) => [n, n + 1])
  yield* Atom.refresh(count)
  return previous
})

export const syncWrite = Effect.sync(() => {
  registry.set(count, 1)
  registry.update(count, (n) => n + 1)
  registry.refresh(count)
  return registry.get(count)
})
