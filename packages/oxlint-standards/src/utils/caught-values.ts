import type { Context, Definition, Variable } from '@oxlint/plugins';

import {
  getCallExpressionArguments,
  getNodeField,
  getStaticMemberCall,
  getStringLiteralValue,
  isIdentifierName,
  isNodeLike,
  peelTransparentExpression,
  staticMemberPropertyName,
  type NodeLike,
} from './ast.js';
import { isFunctionBoundary, isFunctionLike, isInlineFunction } from './effect-context.js';
import { isNamespaceImportReference, isUnshadowedGlobal, resolveVariable } from './imports.js';

const firstItemIndex = 0;
const singleDefinitionCount = 1;
const nextItemOffset = 1;
const tryMembers = new Set(['try', 'tryPromise']);
const primitiveTypeofResults = new Set([
  'bigint',
  'boolean',
  'number',
  'string',
  'symbol',
  'undefined',
]);

const propertyKeyName = (property: NodeLike): string | null => {
  const key = getNodeField(property, 'key');
  if (getNodeField(property, 'computed') === true) {
    return getStringLiteralValue(key);
  }
  return isIdentifierName(key) ? key.name : getStringLiteralValue(key);
};

export const objectPatternHasMessage = (node: unknown): boolean => {
  if (!isNodeLike(node) || node.type !== 'ObjectPattern') {
    return false;
  }

  const properties = getNodeField(node, 'properties');
  return (
    Array.isArray(properties) &&
    properties.some(
      (property) =>
        isNodeLike(property) &&
        property.type === 'Property' &&
        propertyKeyName(property) === 'message',
    )
  );
};

// A handler declared as a function, or as a const initialized with an inline function.
const functionFromDefinition = (definition: Definition): NodeLike | null => {
  if (definition.type === 'FunctionName') {
    return isFunctionLike(definition.node) ? definition.node : null;
  }
  const init = getNodeField(definition.node, 'init');
  return definition.type === 'Variable' &&
    getNodeField(definition.parent, 'kind') === 'const' &&
    isInlineFunction(init)
    ? init
    : null;
};

// Only the binding's own first declaration may initialize it. A redeclaring `var` initializer, such
// as `var problem = replacement` inside the handler, replaces the value like any other write.
const hasReassignment = (variable: Variable): boolean => {
  const original = variable.defs[firstItemIndex]?.name;
  return variable.references.some(
    (reference) =>
      reference.isWrite() && !(reference.init === true && reference.identifier === original),
  );
};

// Resolves the handler an `Effect.try` / `tryPromise` options object names directly, or through a
// same-file function declaration or const function initializer that is never reassigned. A
// reassigned binding may run a different body, and mutable, computed, spread, and cross-file wiring
// is not followed.
const resolveHandlerFunction = (context: Context, value: unknown): NodeLike | null => {
  if (isInlineFunction(value)) {
    return value;
  }
  const variable = isIdentifierName(value) ? resolveVariable(context, value) : null;
  const definitions = variable === null || hasReassignment(variable) ? [] : variable.defs;
  const [definition] = definitions;
  return definitions.length === singleDefinitionCount && definition !== globalThis.undefined
    ? functionFromDefinition(definition)
    : null;
};

// A later spread or computed key may replace `catch` at runtime, so only a `catch` property that
// nothing after it can override names the handler. Among duplicate `catch` keys the last wins.
const isOverridable = (property: unknown): boolean =>
  isNodeLike(property) &&
  (property.type === 'SpreadElement' ||
    (getNodeField(property, 'computed') === true && propertyKeyName(property) === null));

const isCatchProperty = (property: unknown): property is NodeLike =>
  isNodeLike(property) && property.type === 'Property' && propertyKeyName(property) === 'catch';

// The last `catch` definition wins. When it is a `get` or `set` accessor the wiring is unknown, so
// no handler is tracked; an earlier accessor is replaced by a later plain property.
const effectiveCatchProperty = (properties: readonly unknown[]): unknown => {
  const index = properties.findLastIndex(isCatchProperty);
  return index >= 0 &&
    getNodeField(properties[index], 'kind') === 'init' &&
    !properties.slice(index + nextItemOffset).some(isOverridable)
    ? properties[index]
    : null;
};

// The first parameter of the `catch` handler in the options object passed directly to a bound
// `Effect.try` or `Effect.tryPromise`. A `catch` property anywhere else is not a caught input.
export const effectTryCatchParameter = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): unknown => {
  const call = getStaticMemberCall(node);
  const [options] = getCallExpressionArguments(node);
  if (
    call === null ||
    !tryMembers.has(call.propertyName) ||
    !isNamespaceImportReference(context, call.object, effectNames) ||
    !isNodeLike(options) ||
    options.type !== 'ObjectExpression'
  ) {
    return null;
  }

  const properties = getNodeField(options, 'properties');
  const catchProperty = Array.isArray(properties) ? effectiveCatchProperty(properties) : null;
  const handler = resolveHandlerFunction(context, getNodeField(catchProperty, 'value'));
  const params = getNodeField(handler, 'params');
  const parameter = Array.isArray(params) ? (params[firstItemIndex] ?? null) : null;
  // A default such as `(problem = fallback)` still binds the caught value on its left side.
  return isNodeLike(parameter) && parameter.type === 'AssignmentPattern'
    ? getNodeField(parameter, 'left')
    : parameter;
};

const caughtBinding = (context: Context, parameter: unknown): Variable | null =>
  isIdentifierName(parameter) ? resolveVariable(context, parameter) : null;

// The tracked binding a read targets, looking through type assertions: a cast does not make an
// unknown value safe.
const trackedBindingOf = (
  context: Context,
  expression: unknown,
  tracked: ReadonlySet<Variable>,
): Variable | null => {
  const target = peelTransparentExpression(expression);
  const variable = isIdentifierName(target) ? resolveVariable(context, target) : null;
  return variable !== null && tracked.has(variable) ? variable : null;
};

interface GuardFacts {
  readonly errorInstance: boolean;
  readonly hasMessage: boolean;
  readonly nonNull: boolean;
  readonly objectType: boolean;
  readonly primitive: boolean;
}

const noFacts: GuardFacts = {
  errorInstance: false,
  hasMessage: false,
  nonNull: false,
  objectType: false,
  primitive: false,
};

const mergeFacts = (left: GuardFacts, right: GuardFacts): GuardFacts => ({
  errorInstance: left.errorInstance || right.errorInstance,
  hasMessage: left.hasMessage || right.hasMessage,
  nonNull: left.nonNull || right.nonNull,
  objectType: left.objectType || right.objectType,
  primitive: left.primitive || right.primitive,
});

const refersTo = (context: Context, node: unknown, variable: Variable): boolean => {
  const target = peelTransparentExpression(node);
  return isIdentifierName(target) && resolveVariable(context, target) === variable;
};

const typeofResultFor = (
  context: Context,
  typeofSide: unknown,
  literalSide: unknown,
  variable: Variable,
): string | null =>
  isNodeLike(typeofSide) &&
  typeofSide.type === 'UnaryExpression' &&
  getNodeField(typeofSide, 'operator') === 'typeof' &&
  refersTo(context, getNodeField(typeofSide, 'argument'), variable)
    ? getStringLiteralValue(literalSide)
    : null;

// `undefined` counts only as the global value; a parameter or local named `undefined` can hold
// anything.
const isNullishLiteral = (context: Context, node: unknown): boolean =>
  (isNodeLike(node) && node.type === 'Literal' && getNodeField(node, 'value') === null) ||
  (isIdentifierName(node) && node.name === 'undefined' && isUnshadowedGlobal(context, node));

// What one equality comparison proves. Only positive equality proves a primitive or an object
// type; only inequality to null or undefined proves non-null.
const comparisonFacts = (context: Context, node: NodeLike, variable: Variable): GuardFacts => {
  const operator = String(getNodeField(node, 'operator'));
  const left = getNodeField(node, 'left');
  const right = getNodeField(node, 'right');
  const typeofResult =
    typeofResultFor(context, left, right, variable) ??
    typeofResultFor(context, right, left, variable);
  const comparesToNullish =
    (refersTo(context, left, variable) && isNullishLiteral(context, right)) ||
    (refersTo(context, right, variable) && isNullishLiteral(context, left));
  const isEquality = operator === '===' || operator === '==';
  return {
    ...noFacts,
    nonNull: (operator === '!==' || operator === '!=') && comparesToNullish,
    objectType: isEquality && typeofResult === 'object',
    primitive:
      isEquality &&
      (comparesToNullish || (typeofResult !== null && primitiveTypeofResults.has(typeofResult))),
  };
};

const binaryGuardFacts = (context: Context, node: NodeLike, variable: Variable): GuardFacts => {
  const operator = getNodeField(node, 'operator');
  const left = getNodeField(node, 'left');
  const right = getNodeField(node, 'right');
  if (operator === 'instanceof') {
    return {
      ...noFacts,
      errorInstance:
        refersTo(context, left, variable) &&
        isIdentifierName(right) &&
        right.name === 'Error' &&
        isUnshadowedGlobal(context, right),
    };
  }
  if (operator === 'in') {
    return {
      ...noFacts,
      hasMessage: getStringLiteralValue(left) === 'message' && refersTo(context, right, variable),
    };
  }
  return comparisonFacts(context, node, variable);
};

// Facts a guard expression proves about the binding: each conjunct of an `&&` chain contributes.
const guardFacts = (context: Context, test: unknown, variable: Variable): GuardFacts => {
  const node = peelTransparentExpression(test);
  if (!isNodeLike(node)) {
    return noFacts;
  }
  if (node.type === 'LogicalExpression' && getNodeField(node, 'operator') === '&&') {
    return mergeFacts(
      guardFacts(context, getNodeField(node, 'left'), variable),
      guardFacts(context, getNodeField(node, 'right'), variable),
    );
  }
  return node.type === 'BinaryExpression' ? binaryGuardFacts(context, node, variable) : noFacts;
};

// The test that guards `child` inside `ancestor`: an `if` or conditional consequent, or the right
// side of `&&`.
const guardTestFor = (ancestor: NodeLike, child: NodeLike): unknown => {
  if (ancestor.type === 'IfStatement' || ancestor.type === 'ConditionalExpression') {
    return getNodeField(ancestor, 'consequent') === child ? getNodeField(ancestor, 'test') : null;
  }
  return ancestor.type === 'LogicalExpression' &&
    getNodeField(ancestor, 'operator') === '&&' &&
    getNodeField(ancestor, 'right') === child
    ? getNodeField(ancestor, 'left')
    : null;
};

// Facts proved about the binding at `node` by enclosing guards. Discovery stops at the nearest
// function boundary, so a callback never inherits a guard it may run outside of, and any
// reassignment voids every proof.
const provenGuardFacts = (context: Context, node: NodeLike, variable: Variable): GuardFacts => {
  let facts = noFacts;
  let child: NodeLike = node;
  let ancestor = hasReassignment(variable) ? null : getNodeField(node, 'parent');
  while (isNodeLike(ancestor) && !isFunctionBoundary(ancestor)) {
    facts = mergeFacts(facts, guardFacts(context, guardTestFor(ancestor, child), variable));
    child = ancestor;
    ancestor = getNodeField(ancestor, 'parent');
  }
  return facts;
};

const isMessageReadProven = (context: Context, node: NodeLike, variable: Variable): boolean => {
  const facts = provenGuardFacts(context, node, variable);
  return facts.errorInstance || (facts.objectType && facts.nonNull && facts.hasMessage);
};

const isStringConversionProven = (context: Context, node: NodeLike, variable: Variable): boolean =>
  provenGuardFacts(context, node, variable).primitive;

// The node `child` fills when it is a write target slot of `parent`: a transparent wrapper's
// operand, a destructuring property value, array element, rest argument, or the left side of a
// default. A computed key or a default value is evaluated, so it is not a target slot.
const isTargetSlot = (parent: NodeLike, child: NodeLike): boolean => {
  if (peelTransparentExpression(parent) !== parent) {
    return getNodeField(parent, 'expression') === child;
  }
  const slot: Readonly<Record<string, unknown>> = {
    ArrayPattern: getNodeField(parent, 'elements'),
    AssignmentPattern: getNodeField(parent, 'left'),
    ObjectPattern: getNodeField(parent, 'properties'),
    Property: getNodeField(parent, 'value'),
    RestElement: getNodeField(parent, 'argument'),
  };
  const target = slot[parent.type];
  return target === child || (Array.isArray(target) && target.includes(child));
};

// `delete problem?.message` wraps the member in a chain expression; only `delete` looks through it.
const isDeleteOperand = (child: NodeLike, parent: NodeLike): boolean => {
  const isChain = parent.type === 'ChainExpression' && getNodeField(parent, 'expression') === child;
  const operand = isChain ? parent : child;
  const operator = isChain ? getNodeField(parent, 'parent') : parent;
  return (
    isNodeLike(operator) &&
    operator.type === 'UnaryExpression' &&
    getNodeField(operator, 'operator') === 'delete' &&
    getNodeField(operator, 'argument') === operand
  );
};

// Whether the member is only written: the target of a plain `=` or a `for…of`/`for…in` head,
// directly or inside a destructuring pattern, or a `delete` operand. Compound and logical
// assignments read the value first.
const isWriteOnlyTarget = (node: NodeLike): boolean => {
  let child = node;
  let parent = getNodeField(node, 'parent');
  while (isNodeLike(parent) && isTargetSlot(parent, child)) {
    child = parent;
    parent = getNodeField(parent, 'parent');
  }
  if (!isNodeLike(parent)) {
    return false;
  }
  const isAssignmentTarget =
    (parent.type === 'AssignmentExpression' && getNodeField(parent, 'operator') === '=') ||
    parent.type === 'ForOfStatement' ||
    parent.type === 'ForInStatement';
  return (
    (isAssignmentTarget && getNodeField(parent, 'left') === child) || isDeleteOperand(child, parent)
  );
};

export const isMessageMemberRead = (node: NodeLike): boolean =>
  staticMemberPropertyName(node) === 'message' && !isWriteOnlyTarget(node);

// `({ message } = problem)` destructures like a declaration, so it gets the same check.
export const isMessageDestructuringAssignment = (node: NodeLike): boolean =>
  node.type === 'AssignmentExpression' &&
  getNodeField(node, 'operator') === '=' &&
  objectPatternHasMessage(getNodeField(node, 'left'));

const isGlobalStringCall = (context: Context, node: NodeLike): boolean => {
  const callee = getNodeField(node, 'callee');
  return (
    node.type === 'CallExpression' &&
    isIdentifierName(callee) &&
    callee.name === 'String' &&
    isUnshadowedGlobal(context, callee)
  );
};

const destructuredSource = (node: NodeLike): unknown =>
  getNodeField(node, node.type === 'AssignmentExpression' ? 'right' : 'init');

// Candidates a rule collects while visiting; bindings are resolved once the whole file is seen,
// because a hoisted handler may be declared after the reads it owns.
export interface CaughtValueCandidates {
  readonly caughtParameters: readonly NodeLike[];
  readonly messageDestructures: readonly NodeLike[];
  readonly messageReads: readonly NodeLike[];
  readonly stringCalls: readonly NodeLike[];
}

export const caughtValueViolations = (
  context: Context,
  candidates: CaughtValueCandidates,
): readonly NodeLike[] => {
  // One handler can serve several Effect.try calls; its parameter is still one binding.
  const caughtParameters = [...new Set(candidates.caughtParameters)];
  const tracked = new Set<Variable>();
  for (const parameter of caughtParameters) {
    const binding = caughtBinding(context, parameter);
    if (binding !== null) {
      tracked.add(binding);
    }
  }
  const unproven = (
    node: NodeLike,
    expression: unknown,
    isProven: (context: Context, node: NodeLike, variable: Variable) => boolean,
  ): boolean => {
    const binding = trackedBindingOf(context, expression, tracked);
    return binding !== null && !isProven(context, node, binding);
  };
  return [
    ...caughtParameters.filter((parameter) => objectPatternHasMessage(parameter)),
    ...candidates.messageReads.filter((read) =>
      unproven(read, getNodeField(read, 'object'), isMessageReadProven),
    ),
    ...candidates.messageDestructures.filter((destructure) =>
      unproven(destructure, destructuredSource(destructure), isMessageReadProven),
    ),
    ...candidates.stringCalls.filter(
      (call) =>
        isGlobalStringCall(context, call) &&
        unproven(call, getCallExpressionArguments(call)[firstItemIndex], isStringConversionProven),
    ),
  ];
};
