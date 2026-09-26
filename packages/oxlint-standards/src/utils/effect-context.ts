import { getCallExpressionArguments, getNodeField, isNodeLike, type NodeLike } from './ast.js';

const singleItemCount = 1;

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
