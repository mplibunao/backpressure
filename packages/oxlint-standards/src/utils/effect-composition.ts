import type { Context, ESTree } from '@oxlint/plugins';

import {
  getCallExpressionArguments,
  getNodeField,
  getStaticMemberCall,
  isIdentifierName,
  isNodeLike,
  type NodeLike,
  peelTransparentExpression,
  staticMemberPropertyName,
  visitSelfAndDescendants,
} from './ast.js';
import {
  directCallOfInlineFunction,
  isFunctionBoundary,
  isInlineFunction,
} from './effect-context.js';
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
  // Local names bound to `pipe` itself, and to namespaces that expose it as `.pipe`.
  readonly functionNamespaceNames: ReadonlySet<string>;
  readonly pipeNames: ReadonlySet<string>;
}

export const collectEffectCompositionFacts = (
  context: Context,
  program: ESTree.Program,
): EffectCompositionFacts => ({
  context,
  effectNames: collectImportNames(program, ['effect/Effect', 'effect'], 'Effect'),
  functionNamespaceNames: collectImportNames(program, ['effect/Function', 'effect'], 'Function'),
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
const hasSpreadArgument = (args: readonly unknown[]): boolean =>
  args.some((argument) => isNodeLike(argument) && argument.type === 'SpreadElement');

export const boundEffectCallMember = (
  facts: EffectCompositionFacts,
  node: unknown,
): string | null => boundNamespaceCallMember(facts.context, node, facts.effectNames);

export const isBoundEffectCall = (facts: EffectCompositionFacts, node: unknown): boolean =>
  boundEffectCallMember(facts, node) !== null;

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

// A standalone pipe's steps follow its source argument; a member pipe's steps are all of its
// arguments, and its source is the receiver.
const boundPipeSteps = (
  facts: EffectCompositionFacts,
  node: unknown,
): readonly unknown[] | null => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return null;
  }

  const args = getCallExpressionArguments(node);
  const callee = getNodeField(node, 'callee');
  const namespaceCall = getStaticMemberCall(node);
  if (
    (isIdentifierName(callee) &&
      isNamespaceImportReference(facts.context, callee, facts.pipeNames)) ||
    (namespaceCall !== null &&
      namespaceCall.propertyName === 'pipe' &&
      isNamespaceImportReference(facts.context, namespaceCall.object, facts.functionNamespaceNames))
  ) {
    return args.slice(singleItemCount);
  }

  return staticMemberPropertyName(callee) === 'pipe' ? args : null;
};

// Every step must be a direct bound Effect call; opaque identifiers, bare members, and other
// modules' combinators (Schedule, Layer, Schema) do not make a pipeline Effect control flow.
export const isQualifyingEffectPipeline = (
  facts: EffectCompositionFacts,
  node: unknown,
): boolean => {
  const steps = boundPipeSteps(facts, node);
  return (
    steps !== null && steps.length > 0 && steps.every((step) => isBoundEffectCall(facts, step))
  );
};

// no-pipe-ladder: a qualifying pipeline embedded in another qualifying pipeline's source or step,
// or inside an inline callback of an Effect transforming combinator. Discovery stops at any other
// function boundary, so a generator passed to Effect.gen or a resource callback is its own scope.
// The call continues `segment`'s receiver chain when its callee is `.pipe` on that exact segment,
// looking through type assertions and parentheses only.
const continuesReceiverChain = (call: NodeLike, segment: NodeLike): boolean => {
  const callee = getNodeField(call, 'callee');
  return (
    staticMemberPropertyName(callee) === 'pipe' &&
    peelTransparentExpression(getNodeField(callee, 'object')) === segment
  );
};

// Where a handler-map member takes its object of per-tag callbacks, as `[argument index, argument
// counts of the overload that puts the map there]`, read from the pinned `Effect.d.ts`:
// `catchTags(cases, orElse?)` | `catchTags(self, cases, orElse?)` and
// `catchReasons(errorTag, cases, orElse?)` | `catchReasons(self, errorTag, cases, orElse?)`.
// At each listed index the other overload takes an Effect, a tag string, or a function, so an object
// literal there is the map.
/* oxlint-disable no-magic-numbers -- the layouts are overload argument positions and counts. */
const handlerMapLayouts: ReadonlyMap<
  string,
  ReadonlyArray<readonly [index: number, counts: readonly number[]]>
> = new Map([
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

// The object literal holding an inline function as a plain or method property value. Getters and
// setters produce the value instead of being it.
const objectHoldingInlineFunction = (node: NodeLike): NodeLike | null => {
  const property = getNodeField(node, 'parent');
  const object = getNodeField(property, 'parent');
  return isInlineFunction(node) &&
    isNodeLike(property) &&
    property.type === 'Property' &&
    getNodeField(property, 'value') === node &&
    getNodeField(property, 'kind') === 'init' &&
    isNodeLike(object) &&
    object.type === 'ObjectExpression'
    ? object
    : null;
};

// The bound `Effect.catchTags` / `Effect.catchReasons` call whose handler map holds this inline
// callback. Any other object, including one passed elsewhere to these members, is not followed.
const handlerMapCallOfInlineFunction = (
  facts: EffectCompositionFacts,
  node: NodeLike,
): NodeLike | null => {
  const object = objectHoldingInlineFunction(node);
  const argument = object === null ? null : climbTransparentWrappers(object);
  const call = getNodeField(argument, 'parent');
  const member = boundEffectCallMember(facts, call);
  const layouts = member === null ? globalThis.undefined : handlerMapLayouts.get(member);
  const args = isNodeLike(call) ? getCallExpressionArguments(call) : [];
  const index = args.indexOf(argument);
  const isHandlerMap =
    !hasSpreadArgument(args) &&
    (layouts ?? []).some(
      ([mapIndex, counts]) => mapIndex === index && counts.includes(args.length),
    );
  return isHandlerMap && isNodeLike(call) ? call : null;
};

interface NestingWalk {
  // The outermost call of the pipeline's own direct `.pipe().pipe()` chain seen so far.
  readonly segment: NodeLike;
  readonly edge: boolean | null;
}

// Decides the nesting edge at one ancestor, or leaves `edge` null to keep walking outward. Only a
// direct receiver-chain segment is chaining; a pipeline inside any other receiver expression, such
// as a conditional, is nested in that pipeline's source.
const nestingEdgeAt = (
  facts: EffectCompositionFacts,
  ancestor: NodeLike,
  segment: NodeLike,
): NestingWalk => {
  if (isFunctionBoundary(ancestor)) {
    const call =
      directCallOfInlineFunction(ancestor) ?? handlerMapCallOfInlineFunction(facts, ancestor);
    return { edge: call !== null && isTransformingCombinatorCall(facts, call), segment };
  }
  if (ancestor.type === 'CallExpression' && continuesReceiverChain(ancestor, segment)) {
    // The chain's outermost qualifying segment reports the edge once.
    return isQualifyingEffectPipeline(facts, ancestor)
      ? { edge: false, segment }
      : { edge: null, segment: ancestor };
  }
  return { edge: isQualifyingEffectPipeline(facts, ancestor) ? true : null, segment };
};

export const isNestedEffectPipeline = (facts: EffectCompositionFacts, node: NodeLike): boolean => {
  let walk: NestingWalk = { edge: null, segment: node };
  let ancestor = isQualifyingEffectPipeline(facts, node) ? getNodeField(node, 'parent') : null;
  while (walk.edge === null && isNodeLike(ancestor)) {
    walk = nestingEdgeAt(facts, ancestor, walk.segment);
    ancestor = getNodeField(ancestor, 'parent');
  }
  return walk.edge === true;
};
