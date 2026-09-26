import * as Effect from 'effect/Effect'
import * as Atom from 'effect/reactivity/Atom'

declare const count: Atom.Writable<number, number>

export const lostWrite = Effect.sync(() => Atom.set(count, 1))
