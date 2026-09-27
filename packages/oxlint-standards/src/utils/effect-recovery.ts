import {
  getCallExpressionArguments,
  getNodeField,
  isIdentifierName,
  isNodeLike,
  type NodeLike,
  peelTransparentExpression,
  visitSelfAndDescendantsWhere,
} from './ast.js';
import {
  boundCallbackObjectCall,
  boundEffectCallMember,
  callbackObjectProperty,
  type EffectCompositionFacts,
  isNonGeneratorInlineFunction,
  pipeArgumentList,
} from './effect-composition.js';

// Recovery members that take the handler as a function argument and absorb every failure of their
// kind. Tag- and predicate-scoped members state what they absorb, and named discards (`ignore`,
// `orElseSucceed`, `option`, ...) state the discard, so neither belongs here.
const blindHandlerArgumentMembers: ReadonlySet<string> = new Set([
  'catch',
  'catchCause',
  'catchDefect',
  'catchEager',
  'mapError',
]);

// Members whose options object holds the failure handler under a fixed key.
const failureHandlerKeyByMember: ReadonlyMap<string, string> = new Map([
  ['mapBoth', 'onFailure'],
  ['match', 'onFailure'],
  ['matchCause', 'onFailure'],
  ['matchCauseEffect', 'onFailure'],
  ['matchEager', 'onFailure'],
  ['matchEffect', 'onFailure'],
  ['try', 'catch'],
  ['tryPromise', 'catch'],
]);

const failureTapMembers: ReadonlySet<string> = new Set(['tapCause', 'tapDefect', 'tapError']);

// The inline failure handler of a bound recovery call, or null when the call is not one of the
// blanket recovery members or its handler is passed by name.
export const blanketRecoveryHandler = (
  facts: EffectCompositionFacts,
  call: NodeLike,
): NodeLike | null => {
  const member = boundEffectCallMember(facts, call);
  if (member === null) {
    return null;
  }
  // Type assertions and parentheses do not change the runtime value, so a cast is no escape.
  const args = getCallExpressionArguments(call).map(peelTransparentExpression);
  if (blindHandlerArgumentMembers.has(member)) {
    return args.find(isNonGeneratorInlineFunction) ?? null;
  }
  const key = failureHandlerKeyByMember.get(member);
  const options =
    key === globalThis.undefined
      ? null
      : args.find((argument) => boundCallbackObjectCall(facts, argument)?.call === call);
  return key === globalThis.undefined || options === globalThis.undefined
    ? null
    : callbackObjectProperty(options, key);
};

// A TypeScript `this` parameter declares the receiver type; it is not a runtime argument.
const thisParameterName = 'this';

// A plain identifier parameter, with or without a default. A destructured or rest parameter reads
// the failure to take it apart, so it has no plain name.
const plainParameterName = (parameter: unknown): string | null => {
  const target =
    isNodeLike(parameter) && parameter.type === 'AssignmentPattern'
      ? getNodeField(parameter, 'left')
      : parameter;
  return isIdentifierName(target) ? target.name : null;
};

// A non-computed member property or object key spells a name without reading the binding.
const isReferencePosition = (identifier: NodeLike): boolean => {
  const parent = getNodeField(identifier, 'parent');
  if (!isNodeLike(parent) || getNodeField(parent, 'computed') === true) {
    return true;
  }
  if (parent.type === 'MemberExpression') {
    return getNodeField(parent, 'property') !== identifier;
  }
  if (parent.type === 'Property') {
    return getNodeField(parent, 'key') !== identifier || getNodeField(parent, 'shorthand') === true;
  }
  return true;
};

// TypeScript nodes that hold runtime code: expression wrappers and value-producing declarations.
// Every other `TS*` node is type syntax, where a name such as `{ cause?: string }` reads nothing.
const runtimeTypeScriptNodes: ReadonlySet<string> = new Set([
  'TSAsExpression',
  'TSEnumBody',
  'TSEnumDeclaration',
  'TSEnumMember',
  'TSExportAssignment',
  'TSInstantiationExpression',
  'TSModuleBlock',
  'TSModuleDeclaration',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

const isTypeSyntax = (node: NodeLike): boolean =>
  node.type.startsWith('TS') && !runtimeTypeScriptNodes.has(node.type);

// A handler that takes no parameter, or whose plain parameters are never referenced by name in its
// body's runtime code. Name matching does not model shadowing: a same-named inner binding counts
// as a read, which errs toward allowing the handler.
export const isBlindHandler = (handler: NodeLike): boolean => {
  const parameters = getNodeField(handler, 'params');
  const names = (Array.isArray(parameters) ? parameters : []).map(plainParameterName);
  if (names.includes(null)) {
    return false;
  }
  const unread = new Set(names.filter((name) => name !== thisParameterName));
  let read = false;
  visitSelfAndDescendantsWhere(
    getNodeField(handler, 'body'),
    (node) => !read && !isTypeSyntax(node),
    (node) => {
      read = isIdentifierName(node) && unread.has(node.name) && isReferencePosition(node);
    },
  );
  return !read;
};

const isFailureTap = (facts: EffectCompositionFacts, node: unknown): boolean => {
  const member = boundEffectCallMember(facts, node);
  return member !== null && failureTapMembers.has(member);
};

// The failure was observed before it was dropped: the data-first source is a failure tap, or an
// earlier argument of the enclosing pipe call is one. Taps in an enclosing pipeline or behind an
// alias are not followed.
export const isRecordedFirst = (facts: EffectCompositionFacts, call: NodeLike): boolean => {
  const [source] = getCallExpressionArguments(call);
  if (isFailureTap(facts, source)) {
    return true;
  }
  const pipeArguments = pipeArgumentList(facts, getNodeField(call, 'parent')) ?? [];
  const position = pipeArguments.indexOf(call);
  return pipeArguments.slice(0, Math.max(position, 0)).some((step) => isFailureTap(facts, step));
};
