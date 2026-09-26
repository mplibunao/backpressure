import * as Option from 'effect/Option'

declare const maybe: string | null | undefined
declare const onlyUndefined: string | undefined

export const nullishAbsence = Option.fromNullishOr(maybe)
export const nullStaysPresent = Option.fromUndefinedOr(maybe)
export const undefinedOnly = Option.fromUndefinedOr(onlyUndefined)
