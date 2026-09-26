import type { Context, Definition } from '@oxlint/plugins';

import {
  getCallExpressionArguments,
  getNodeField,
  isIdentifierName,
  isNodeLike,
  isStringLiteral,
  type NodeLike,
  peelTransparentExpression,
  visitSelfAndDescendantsWhere,
} from './ast.js';
import { boundNamespaceCallMember, resolveVariable } from './imports.js';

const singleItemCount = 1;
const genWithOptionsArgumentCount = 2;
// `Effect.gen(body)` takes the body first; `Effect.gen(options, body)` takes it second.
const genBodyIndexByArity = new Map([
  [singleItemCount, 0],
  [genWithOptionsArgumentCount, 1],
]);

export const isFunctionLike = (node: unknown): node is NodeLike =>
  isNodeLike(node) &&
  (node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression');

// Non-narrowing form for ancestor walks, where the walk continues on nodes that are not functions.
export const isFunctionBoundary = (node: NodeLike): boolean => isFunctionLike(node);

export const isInlineFunction = (node: unknown): node is NodeLike =>
  isFunctionLike(node) && node.type !== 'FunctionDeclaration';

export const functionReturnNode = (node: unknown): unknown => {
  if (!isFunctionLike(node)) {
    return null;
  }

  const body = getNodeField(node, 'body');
  if (!isNodeLike(body) || body.type !== 'BlockStatement') {
    return body;
  }

  const statements = getNodeField(body, 'body');
  if (!Array.isArray(statements) || statements.length !== singleItemCount) {
    return null;
  }

  const [statement] = statements;
  return isNodeLike(statement) && statement.type === 'ReturnStatement'
    ? getNodeField(statement, 'argument')
    : null;
};

export const nearestEnclosingFunction = (node: NodeLike): NodeLike | null => {
  let current = getNodeField(node, 'parent');
  while (isNodeLike(current)) {
    if (isFunctionLike(current)) {
      return current;
    }
    current = getNodeField(current, 'parent');
  }
  return null;
};

const isStringExpression = (node: unknown): boolean => {
  const value = peelTransparentExpression(node);
  return isStringLiteral(value) || (isNodeLike(value) && value.type === 'TemplateLiteral');
};

const isStringConstDefinition = (definition: Definition): boolean =>
  definition.type === 'Variable' &&
  getNodeField(definition.parent, 'kind') === 'const' &&
  isStringExpression(getNodeField(definition.node, 'init'));

// A string literal, an untagged template, or a `const` bound to one. Any other argument, such as a
// parameter, an import, or a function, leaves the `Effect.fn` overload unknown.
const isProvableSpanName = (context: Context, node: unknown): boolean => {
  if (isStringExpression(node)) {
    return true;
  }
  const value = peelTransparentExpression(node);
  const variable = isIdentifierName(value) ? resolveVariable(context, value) : null;
  return (
    variable !== null && variable.defs.length > 0 && variable.defs.every(isStringConstDefinition)
  );
};

// The named form: `Effect.fn(name, options?)` returns the function that takes the body. Only a
// provable span name selects it; with an unknown first argument the call may be a traced function
// receiving an ordinary argument.
const isNamedEffectFnFactory = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): boolean =>
  isNodeLike(node) &&
  boundNamespaceCallMember(context, node, effectNames) === 'fn' &&
  isProvableSpanName(context, getCallExpressionArguments(node)[0]);

// A generator whose body Effect runs as the program: the last argument of `Effect.gen(body)` or
// `Effect.gen(options, body)`, or the first argument of `Effect.fn(body, ...pipeables)` and
// `Effect.fn(name, options?)(body, ...pipeables)`. `fnUntraced` and user wrappers are not included.
export const isEffectGeneratorBody = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  const call = getNodeField(node, 'parent');
  if (
    node.type !== 'FunctionExpression' ||
    getNodeField(node, 'generator') !== true ||
    !isNodeLike(call) ||
    call.type !== 'CallExpression'
  ) {
    return false;
  }

  const args = getCallExpressionArguments(call);
  const member = boundNamespaceCallMember(context, call, effectNames);
  if (member === 'gen') {
    const bodyIndex = genBodyIndexByArity.get(args.length);
    return bodyIndex !== globalThis.undefined && args[bodyIndex] === node;
  }

  return (
    args[0] === node &&
    (member === 'fn' || isNamedEffectFnFactory(context, getNodeField(call, 'callee'), effectNames))
  );
};

// Calling a generator function only creates an iterator; its body runs when the iterator is
// advanced, if ever.
const isGeneratorFunction = (node: NodeLike): boolean => getNodeField(node, 'generator') === true;

const isInvokedOnTheSpot = (node: NodeLike): boolean => {
  const parent = getNodeField(node, 'parent');
  return (
    isNodeLike(parent) &&
    parent.type === 'CallExpression' &&
    getNodeField(parent, 'callee') === node
  );
};

// An instance field initializer runs when the class is instantiated. Its computed key, static
// fields, and static blocks run when the class is defined.
const isInstanceFieldValue = (node: NodeLike): boolean => {
  const field = getNodeField(node, 'parent');
  return (
    isNodeLike(field) &&
    (field.type === 'PropertyDefinition' || field.type === 'AccessorProperty') &&
    getNodeField(field, 'static') !== true &&
    getNodeField(field, 'value') === node
  );
};

// A generator's body runs only when its iterator advances; its parameter defaults run at the call.
const isGeneratorBody = (node: NodeLike): boolean => {
  const fn = getNodeField(node, 'parent');
  return isFunctionLike(fn) && isGeneratorFunction(fn) && getNodeField(fn, 'body') === node;
};

// False for code that does not run when evaluation reaches it. A nested function runs nothing
// unless it is invoked on the spot; an invoked function evaluates its parameter defaults, and its
// body too unless it is a generator. Instance field initializers wait for instantiation.
export const runsWhenReached = (node: NodeLike): boolean =>
  isFunctionLike(node)
    ? isInvokedOnTheSpot(node)
    : !isGeneratorBody(node) && !isInstanceFieldValue(node);

// Visits the code that runs synchronously when `fn` is called: its parameter defaults, its body
// unless it is a generator, and whatever of that code `runsWhenReached` accepts.
export const visitSynchronousBody = (fn: unknown, visit: (node: NodeLike) => void): void => {
  visitSelfAndDescendantsWhere(fn, (node) => node === fn || runsWhenReached(node), visit);
};

// The call that receives an inline function directly as one of its arguments. A function that is
// assigned, returned, or wrapped first has no such call: its execution context is unknown here.
export const directCallOfInlineFunction = (node: unknown): NodeLike | null => {
  if (!isInlineFunction(node)) {
    return null;
  }

  const parent = getNodeField(node, 'parent');
  return isNodeLike(parent) &&
    parent.type === 'CallExpression' &&
    getCallExpressionArguments(parent).includes(node)
    ? parent
    : null;
};
