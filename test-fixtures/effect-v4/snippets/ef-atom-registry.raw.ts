export const get = <A>(self: Atom<A>): Effect.Effect<A, never, AtomRegistry> =>
  AtomRegistry.use((r) => Effect.succeed(r.get(self)))

/**
 * Reads a writable atom, computes a return value and next write value, writes the
 * next value, and returns the computed result.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const modify: {
  <R, W, A>(
    f: (_: R) => [returnValue: A, nextValue: W]
  ): (self: Writable<R, W>) => Effect.Effect<A, never, AtomRegistry>
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): Effect.Effect<A, never, AtomRegistry>
} = dual(
  2,
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): Effect.Effect<A, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.modify(self, f))
)

/**
 * Writes a value to a writable atom through the `AtomRegistry` service.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const set: {
  <W>(value: W): <R>(self: Writable<R, W>) => Effect.Effect<void, never, AtomRegistry>
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, AtomRegistry>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.set(self, value))
)

/**
 * Updates a writable atom by reading its current value from the registry and
 * writing the value returned by the update function.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const update: {
  <R, W>(f: (_: R) => W): (self: Writable<R, W>) => Effect.Effect<void, never, AtomRegistry>
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, AtomRegistry>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.update(self, f))
)

/**
 * Reads an `AsyncResult` atom as an effect through the `AtomRegistry` service.
 *
 * **Details**
 *
 * The effect waits while the result is `Initial`, and also while it is waiting
 * when `suspendOnWaiting` is enabled. Successes succeed with the value and
 * failures fail with the result cause.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const getResult = <A, E>(
  self: Atom<AsyncResult.AsyncResult<A, E>>,
  options?: { readonly suspendOnWaiting?: boolean | undefined }
): Effect.Effect<A, E, AtomRegistry> => AtomRegistry.use(Registry.getResult(self, options))

/**
 * Runs a refresh request for an atom through the `AtomRegistry` service.
 *
 * **When to use**
 *
 * Use to invalidate and recompute an atom from an Effect that has access to the
 * active registry.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const refresh = <A>(self: Atom<A>): Effect.Effect<void, never, AtomRegistry> =>

export interface AtomRegistry {
  readonly [TypeId]: TypeId
  readonly scheduler: Scheduler
  readonly schedulerAsync: Scheduler
  readonly getNodes: () => ReadonlyMap<Atom.Atom<any> | string, Node<any>>
  readonly get: <A>(atom: Atom.Atom<A>) => A
  readonly mount: <A>(atom: Atom.Atom<A>) => () => void
  readonly refresh: <A>(atom: Atom.Atom<A>) => void
  readonly set: <R, W>(atom: Atom.Writable<R, W>, value: W) => void
  readonly setSerializable: (key: string, encoded: unknown) => void
  readonly modify: <R, W, A>(atom: Atom.Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]) => A
  readonly update: <R, W>(atom: Atom.Writable<R, W>, f: (_: R) => W) => void
  readonly subscribe: <A>(atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }) => () => void
  readonly reset: () => void
  readonly dispose: () => void
  onNodeAdded?: ((node: Node<any>) => void) | undefined
  onNodeRemoved?: ((node: Node<any>) => void) | undefined
}
