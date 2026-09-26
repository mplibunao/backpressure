import * as Option from 'effect/Option'

declare const maybe: string | null | undefined

export const redundant = Option.fromNullishOr(maybe ?? null)
export const nullSwallowed = Option.fromUndefinedOr(maybe ?? undefined)
