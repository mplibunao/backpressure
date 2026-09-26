export const fromNullishOr = <A>(
  a: A
): Option<NonNullable<A>> => (a == null ? none() : some(a as NonNullable<A>))

/**
 * Converts a possibly `undefined` value into an `Option`, leaving `null`
 * as a valid `Some`.
 *
 * **When to use**
 *
 * Use when you want to treat only `undefined` as absent while preserving `null`
 * as a meaningful value.
 *
 * **Details**
 *
 * - `undefined` → `None`
 * - Any other value (including `null`) → `Some`
 *
 * **Example** (Converting possibly undefined values to an Option)
 *
 * ```ts import.meta.vitest
 * import { Option } from "effect"
 *
 * Option.fromUndefinedOr(undefined) // => Option.none()
 * Option.fromUndefinedOr(null) // => Option.some(null)
 * Option.fromUndefinedOr(42) // => Option.some(42)
 * ```
 *
 * @see {@link fromNullishOr} to treat both `null` and `undefined` as absent
 * @see {@link fromNullOr} to only treat `null` as absent
 *
 * @category converting
 * @since 4.0.0
 */
export const fromUndefinedOr = <A>(
  a: A
): Option<Exclude<A, undefined>> => (a === undefined ? none() : some(a as Exclude<A, undefined>))

/**
 * Converts a possibly `null` value into an `Option`, leaving `undefined`
 * as a valid `Some`.
 *
 * **When to use**
 *
 * Use when you want to treat only `null` as absent while preserving
 * `undefined` as a meaningful value.
 *
 * **Details**
 *
 * - `null` → `None`
 * - Any other value (including `undefined`) → `Some`
 *
 * **Example** (Converting possibly null values to an Option)
 *
 * ```ts import.meta.vitest
 * import { Option } from "effect"
 *
 * Option.fromNullOr(null) // => Option.none()
 * Option.fromNullOr(undefined) // => Option.some(undefined)
 * Option.fromNullOr(42) // => Option.some(42)
 * ```
 *
 * @see {@link fromNullishOr} to treat both `null` and `undefined` as absent
 * @see {@link fromUndefinedOr} to only treat `undefined` as absent
 *
 * @category converting
 * @since 4.0.0
 */
