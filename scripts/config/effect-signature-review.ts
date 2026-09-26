// Reviewed decisions behind the generated Effect signature table. The capture fails when a
// declaration disagrees with a decision here, so an Effect bump that changes an overload layout
// surfaces as a review item instead of a silent table change.

import type { EffectSignatureReview } from '../lib/effect-signatures.ts';

// Each index names the argument the member's runtime `dual` predicate tests with `isEffect`, which
// is also the only position typed as an Effect in the Effect overloads alone.
const effectFirst = [
  'annotateLogs',
  'annotateSpans',
  'catchFilter',
  'catchIf',
  'catchReason',
  'catchReasons',
  'catchTag',
  'catchTags',
  'filterMapOrFail',
  'filterOrFail',
  'forkIn',
  'linkSpans',
  'provide',
  'replicateEffect',
  'track',
  'trackDefects',
  'trackDuration',
  'trackErrors',
  'trackSuccesses',
  'withExecutionPlan',
  'withParentSpan',
  'withSpan',
  'withSpanScoped',
] as const;

// `zip`, `zipWith`, and the races take an Effect in both forms; the data-first form is the one
// whose second argument is also an Effect.
const effectSecond = ['race', 'raceFirst', 'zip', 'zipWith'] as const;

// Members whose conditional return type is an Effect exactly when the first argument is one.
const conditionalOnFirst = [
  'forever',
  'forkChild',
  'forkDetach',
  'forkScoped',
  'ignore',
  'ignoreCause',
  'withErrorReporting',
] as const;

// These `dual` predicates test iterability or a function argument instead of `isEffect`, and no
// argument is an Effect in either form, so no argument proves the Effect overload.
// `fromOption` returns an Effect for an `Option` and a function for a lazy fallback.
const undiscriminated = [
  'filter',
  'filterMapEffect',
  'forEach',
  'fromOption',
  'partition',
  'validate',
] as const;

export const effectSignatureReview: EffectSignatureReview = {
  effectArgumentIndexes: new Map<string, number | null>([
    ...effectFirst.map((member) => [member, 0] as const),
    ...conditionalOnFirst.map((member) => [member, 0] as const),
    ...effectSecond.map((member) => [member, 1] as const),
    ...undiscriminated.map((member) => [member, null] as const),
  ]),
  effectTypeNames: new Set(['All.Return', 'Effect', 'Repeat.Return', 'Retry.Return']),
};
