import type { Context, ESTree } from '@oxlint/plugins';

import {
  getCallExpressionArguments,
  getNodeField,
  getStringLiteralValue,
  hasSpreadArgument,
  isIdentifierName,
  isNodeLike,
  isStringLiteral,
  type NodeLike,
  peelTransparentExpression,
  staticMemberPropertyName,
  visitSelfAndDescendants,
  visitSelfAndDescendantsWhere,
} from './ast.js';
import { isInlineFunction } from './effect-context.js';
import {
  effectReturnSignatures,
  type EffectReturnSignature,
} from '#oxlint-standards/generated/effect-signatures.js';
import {
  boundNamespaceCallMember,
  collectImportNames,
  collectNamedImportNames,
  isNamespaceImportReference,
} from './imports.js';

const firstItemIndex = 0;
const singleItemCount = 1;

export interface EffectCompositionFacts {
  readonly context: Context;
  readonly effectNames: ReadonlySet<string>;
  // Local names bound to `pipe` itself; `Function.pipe(...)` is recognized as a member `.pipe`.
  readonly pipeNames: ReadonlySet<string>;
}

export const collectEffectCompositionFacts = (
  context: Context,
  program: ESTree.Program,
): EffectCompositionFacts => ({
  context,
  effectNames: collectImportNames(program, ['effect/Effect', 'effect'], 'Effect'),
  pipeNames: collectNamedImportNames(program, ['effect/Function', 'effect'], 'pipe'),
});

const signatureByMember = new Map(
  effectReturnSignatures.map((signature) => [signature[0], signature] as const),
);

// Combinators whose data-first form transforms a source Effect. Runners, forks, and resource helpers
// are deliberately absent: passing an Effect to them is idiomatic.
export const transformingCombinatorMembers: ReadonlySet<string> = new Set([
  'andThen',
  'catch',
  'catchCause',
  'catchCauseFilter',
  'catchCauseIf',
  'catchDefect',
  'catchEager',
  'catchFilter',
  'catchIf',
  'catchNoSuchElement',
  'catchReason',
  'catchReasons',
  'catchTag',
  'catchTags',
  'flatMap',
  'flatten',
  'map',
  'tap',
  'zip',
  'zipWith',
]);

// A spread hides the argument count that selects an overload.
export const boundEffectCallMember = (
  facts: EffectCompositionFacts,
  node: unknown,
): string | null => boundNamespaceCallMember(facts.context, node, facts.effectNames);

interface ResolvedCall {
  readonly args: readonly unknown[];
  readonly signature: EffectReturnSignature;
}

const callSignature = (facts: EffectCompositionFacts, node: unknown): ResolvedCall | null => {
  const member = boundEffectCallMember(facts, node);
  const signature = member === null ? null : (signatureByMember.get(member) ?? null);
  return signature === null || !isNodeLike(node)
    ? null
    : { args: getCallExpressionArguments(node), signature };
};

// Source eligibility: the call fits an Effect-returning overload, so it may be the Effect a
// data-first transformation consumes. Only runners and other members that never return an Effect,
// or a data-last call such as `Effect.map(f)`, are ruled out.
const fitsEffectOverload = ({ args, signature: [, effectCounts] }: ResolvedCall): boolean =>
  effectCounts === 'any' || (!hasSpreadArgument(args) && effectCounts.includes(args.length));

export const isEffectSourceCall = (facts: EffectCompositionFacts, node: unknown): boolean => {
  const call = callSignature(facts, node);
  return call !== null && fitsEffectOverload(call);
};

// Overload-discriminator proof: the call certainly produces an Effect. An argument count shared with
// a non-Effect overload needs the member's verified discriminator argument to be provably an Effect.
export const isEffectValuedCall = (facts: EffectCompositionFacts, node: unknown): boolean => {
  const call = callSignature(facts, node);
  if (call === null || !fitsEffectOverload(call)) {
    return false;
  }
  const [, effectCounts, ambiguousCounts, effectArgumentIndex] = call.signature;
  if (effectCounts === 'any' || !ambiguousCounts.includes(call.args.length)) {
    return true;
  }
  return effectArgumentIndex !== null && isEffectValuedCall(facts, call.args[effectArgumentIndex]);
};

export const isTransformingCombinatorCall = (
  facts: EffectCompositionFacts,
  node: unknown,
): boolean => {
  const member = boundEffectCallMember(facts, node);
  return member !== null && transformingCombinatorMembers.has(member);
};

// A bound transforming combinator in its data-first layout, which is exactly when it returns an
// Effect, whose source (first argument) is a direct call that may produce an Effect. Only the
// source position counts: a data-last call whose first argument is an Effect continuation, or an
// Effect inside a callback, is not inside-out composition.
export const isDataFirstTransformingNesting = (
  facts: EffectCompositionFacts,
  node: unknown,
): boolean =>
  isNodeLike(node) &&
  isTransformingCombinatorCall(facts, node) &&
  isEffectValuedCall(facts, node) &&
  isEffectSourceCall(facts, getCallExpressionArguments(node)[firstItemIndex]);

// The enclosing call reports this nesting chain when this call is the source of its data-first
// transformation, so the inner link is the same problem, not a second one.
export const isSourceOfEnclosingDataFirstNesting = (
  facts: EffectCompositionFacts,
  node: NodeLike,
): boolean => {
  const parent = getNodeField(node, 'parent');
  return (
    isNodeLike(parent) &&
    getCallExpressionArguments(parent)[firstItemIndex] === node &&
    isDataFirstTransformingNesting(facts, parent)
  );
};

const isConstInitializerOrReturnArgument = (node: NodeLike): boolean => {
  const parent = getNodeField(node, 'parent');
  if (!isNodeLike(parent)) {
    return false;
  }

  if (parent.type === 'ReturnStatement') {
    return getNodeField(parent, 'argument') === node;
  }

  if (parent.type !== 'VariableDeclarator' || getNodeField(parent, 'init') !== node) {
    return false;
  }

  const declaration = getNodeField(parent, 'parent');
  return (
    isNodeLike(declaration) &&
    declaration.type === 'VariableDeclaration' &&
    getNodeField(declaration, 'kind') === 'const'
  );
};

// Follows only first arguments, the source chain of data-first calls; a deep call in a later
// argument is not a ladder.
const firstArgumentEffectCallDepth = (facts: EffectCompositionFacts, node: unknown): number =>
  isNodeLike(node) && isEffectSourceCall(facts, node)
    ? singleItemCount +
      firstArgumentEffectCallDepth(facts, getCallExpressionArguments(node)[firstItemIndex])
    : 0;

// no-effect-ladder: a const or returned data-first transformation whose source chain nests at
// least two Effect calls through first arguments.
export const isEffectLadder = (facts: EffectCompositionFacts, node: NodeLike): boolean =>
  isConstInitializerOrReturnArgument(node) &&
  isDataFirstTransformingNesting(facts, node) &&
  firstArgumentEffectCallDepth(facts, getCallExpressionArguments(node)[firstItemIndex]) >
    singleItemCount;

const containsBoundEffectMemberCall = (
  facts: EffectCompositionFacts,
  node: unknown,
  memberName: string,
): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (candidate) => {
    found = found || boundEffectCallMember(facts, candidate) === memberName;
  });
  return found;
};

// no-flatmap-ladder: a const or returned flatMap with nested flatMap work in any argument, or
// flatten over map.
export const isFlatMapLadderShape = (facts: EffectCompositionFacts, node: NodeLike): boolean => {
  if (!isConstInitializerOrReturnArgument(node)) {
    return false;
  }

  const member = boundEffectCallMember(facts, node);
  const args = getCallExpressionArguments(node);
  return (
    (member === 'flatMap' &&
      args.some((argument) => containsBoundEffectMemberCall(facts, argument, 'flatMap'))) ||
    (member === 'flatten' && containsBoundEffectMemberCall(facts, args[firstItemIndex], 'map'))
  );
};

// The whole argument list of a pipe call: a member `.pipe(...)` on any receiver, including
// `Function.pipe(...)`, or a bound standalone `pipe(source, ...steps)`, whose first argument is
// the source.
export const pipeArgumentList = (
  facts: EffectCompositionFacts,
  node: unknown,
): readonly unknown[] | null => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return null;
  }

  const callee = getNodeField(node, 'callee');
  const isBoundStandalonePipe =
    isIdentifierName(callee) && isNamespaceImportReference(facts.context, callee, facts.pipeNames);
  return isBoundStandalonePipe || staticMemberPropertyName(callee) === 'pipe'
    ? getCallExpressionArguments(node)
    : null;
};

// Where a member takes an object of callbacks, as `[argument index, argument counts of the overload
// that puts the object there]`, read from the pinned `Effect.d.ts`:
// `catchTags(cases, orElse?)` | `catchTags(self, cases, orElse?)`,
// `catchReasons(errorTag, cases, orElse?)` | `catchReasons(self, errorTag, cases, orElse?)`,
// `match*(options)` | `match*(self, options)` and the same for `mapBoth`, and `try(options)` /
// `tryPromise(options)`. At each listed index the other overload takes an Effect, a tag string, or a
// function, so an object literal there is the callback object.
/* oxlint-disable no-magic-numbers -- the layouts are overload argument positions and counts. */
type CallbackObjectLayout = ReadonlyArray<readonly [index: number, counts: readonly number[]]>;
const optionsOrSelfThenOptions: CallbackObjectLayout = [
  [0, [1]],
  [1, [2]],
];
const callbackObjectLayouts: ReadonlyMap<string, CallbackObjectLayout> = new Map<
  string,
  CallbackObjectLayout
>([
  [
    'catchTags',
    [
      [0, [1, 2]],
      [1, [2, 3]],
    ],
  ],
  [
    'catchReasons',
    [
      [1, [2, 3]],
      [2, [3, 4]],
    ],
  ],
  ['mapBoth', optionsOrSelfThenOptions],
  ['match', optionsOrSelfThenOptions],
  ['matchCause', optionsOrSelfThenOptions],
  ['matchCauseEffect', optionsOrSelfThenOptions],
  ['matchEager', optionsOrSelfThenOptions],
  ['matchEffect', optionsOrSelfThenOptions],
  ['try', [[0, [1]]]],
  ['tryPromise', [[0, [1]]]],
]);
/* oxlint-enable no-magic-numbers */

const climbTransparentWrappers = (node: NodeLike): NodeLike => {
  let current = node;
  let parent = getNodeField(current, 'parent');
  while (isNodeLike(parent) && peelTransparentExpression(parent) === node) {
    current = parent;
    parent = getNodeField(current, 'parent');
  }
  return current;
};

interface BoundCallbackObject {
  readonly call: NodeLike;
  readonly member: string;
}

// The bound Effect call that takes this object literal at a verified callback-object position.
// Any other object, including one passed elsewhere to these members, is not followed.
export const boundCallbackObjectCall = (
  facts: EffectCompositionFacts,
  object: unknown,
): BoundCallbackObject | null => {
  if (!isNodeLike(object) || object.type !== 'ObjectExpression') {
    return null;
  }
  const argument = climbTransparentWrappers(object);
  const call = getNodeField(argument, 'parent');
  const member = boundEffectCallMember(facts, call);
  const layouts = member === null ? globalThis.undefined : callbackObjectLayouts.get(member);
  const args = isNodeLike(call) ? getCallExpressionArguments(call) : [];
  const index = args.indexOf(argument);
  const isCallbackObject =
    !hasSpreadArgument(args) &&
    (layouts ?? []).some(
      ([objectIndex, counts]) => objectIndex === index && counts.includes(args.length),
    );
  return isCallbackObject && member !== null && isNodeLike(call) ? { call, member } : null;
};

const isGeneratorFunction = (node: NodeLike): boolean => getNodeField(node, 'generator') === true;

export const isNonGeneratorInlineFunction = (node: unknown): node is NodeLike =>
  isInlineFunction(node) && !isGeneratorFunction(node);

// An inline, non-generator function, looking through type assertions and parentheses, which do
// not change the runtime value.
const inlineFunctionValue = (node: unknown): NodeLike | null => {
  const value = peelTransparentExpression(node);
  return isNonGeneratorInlineFunction(value) ? value : null;
};

// The plain or method property whose value is this node, looking through transparent wrappers.
// Getters and setters produce the value instead of being it.
const propertyHoldingValue = (node: NodeLike): NodeLike | null => {
  const holder = climbTransparentWrappers(node);
  const property = getNodeField(holder, 'parent');
  return isNodeLike(property) &&
    property.type === 'Property' &&
    getNodeField(property, 'value') === holder &&
    getNodeField(property, 'kind') === 'init'
    ? property
    : null;
};

// A property's statically known key; a computed identifier key is a runtime value.
const staticPropertyKey = (property: unknown): string | null => {
  const key = getNodeField(property, 'key');
  if (getNodeField(property, 'computed') === true) {
    return isStringLiteral(key) ? getStringLiteralValue(key) : null;
  }
  return isIdentifierName(key) ? key.name : getStringLiteralValue(key);
};

// The inline function that is the effective value of the named property of a callback object.
// The last definition wins, so the search runs right to left; a later spread or runtime-computed
// key may redefine the property, which leaves the value unknown.
export const callbackObjectProperty = (object: unknown, key: string): NodeLike | null => {
  const properties = isNodeLike(object) ? getNodeField(object, 'properties') : null;
  for (const property of Array.isArray(properties) ? properties.toReversed() : []) {
    const propertyKey = isNodeLike(property) ? staticPropertyKey(property) : null;
    if (propertyKey === null || propertyKey === key) {
      return propertyKey === key && getNodeField(property, 'kind') === 'init'
        ? inlineFunctionValue(getNodeField(property, 'value'))
        : null;
    }
  }
  return null;
};

// Members whose inline callback produces the next effect or handles a failure, so the callback is
// a scope a reader carries. Structural members (`all`, `race*`, `scoped`, `ensuring`, `fork*`,
// `run*`) take independent effects, not continuations, and are absent on purpose.
const stepCallbackMembers: ReadonlySet<string> = new Set([
  'acquireRelease',
  'acquireUseRelease',
  'andThen',
  'catch',
  'catchCause',
  'catchCauseFilter',
  'catchCauseIf',
  'catchDefect',
  'catchEager',
  'catchFilter',
  'catchIf',
  'catchReason',
  'catchTag',
  'flatMap',
  'forEach',
  'tap',
  'tapCause',
  'tapDefect',
  'tapError',
]);

// Members whose callback object holds step callbacks as its property values.
const stepCallbackObjectMembers: ReadonlySet<string> = new Set([
  'catchReasons',
  'catchTags',
  'matchCauseEffect',
  'matchEffect',
]);

// An inline, non-generator function passed directly to a bound step member, or held as a property
// value of a step member's verified callback object under any key, including a computed tag.
// Type assertions and parentheses around the function do not change which call receives it.
export const isEffectStepCallback = (facts: EffectCompositionFacts, node: unknown): boolean => {
  if (!isNonGeneratorInlineFunction(node)) {
    return false;
  }
  const holder = climbTransparentWrappers(node);
  const call = getNodeField(holder, 'parent');
  if (isNodeLike(call) && getCallExpressionArguments(call).includes(holder)) {
    const member = boundEffectCallMember(facts, call);
    return member !== null && stepCallbackMembers.has(member);
  }
  const property = propertyHoldingValue(node);
  const owner =
    property === null ? null : boundCallbackObjectCall(facts, getNodeField(property, 'parent'));
  return owner !== null && stepCallbackObjectMembers.has(owner.member);
};

// `map` transforms a value without running an effect, and a named or value argument adds a step
// but no closure, so only these members with an inline function continue inside a closure.
const continuationMembers: ReadonlySet<string> = new Set(['andThen', 'flatMap', 'tap']);

const isEffectContinuationClosure = (
  facts: EffectCompositionFacts,
  node: unknown,
): node is NodeLike => {
  const member = boundEffectCallMember(facts, node);
  return (
    member !== null &&
    continuationMembers.has(member) &&
    isNodeLike(node) &&
    getCallExpressionArguments(node).some((argument) => inlineFunctionValue(argument) !== null)
  );
};

// A generator body is a fresh linear scope, a declaration or class body is not evaluated in place,
// and another step callback is judged on its own, so a pyramid reports each offending level once.
const isLadderSearchBoundary = (facts: EffectCompositionFacts, node: NodeLike): boolean =>
  node.type === 'FunctionDeclaration' ||
  node.type === 'ClassDeclaration' ||
  node.type === 'ClassExpression' ||
  (node.type === 'FunctionExpression' && isGeneratorFunction(node)) ||
  isEffectStepCallback(facts, node);

// no-pipe-ladder: the first continuation closure in a step callback's body, or null. Non-Effect
// callbacks such as an array `map` are searched through: they add a scope rather than reset one.
export const firstLadderContinuation = (
  facts: EffectCompositionFacts,
  callback: NodeLike,
): NodeLike | null => {
  let found: NodeLike | null = null;
  visitSelfAndDescendantsWhere(
    getNodeField(callback, 'body'),
    (node) => found === null && !isLadderSearchBoundary(facts, node),
    (node) => {
      if (found === null && isEffectContinuationClosure(facts, node)) {
        found = node;
      }
    },
  );
  return found;
};

// A call one of whose inline callbacks is a step callback holding a closure ladder: no-pipe-ladder
// reports that nesting at the inner continuation.
export const holdsClosureLadder = (facts: EffectCompositionFacts, node: NodeLike): boolean =>
  getCallExpressionArguments(node).some((argument) => {
    const callback = inlineFunctionValue(argument);
    return (
      callback !== null &&
      isEffectStepCallback(facts, callback) &&
      firstLadderContinuation(facts, callback) !== null
    );
  });
