import type { Context } from '@oxlint/plugins';

import {
  getNodeField,
  getStaticMemberCall,
  isNodeLike,
  walkDescendants,
  type NodeLike,
} from './ast.js';
import { isNamespaceImportReference } from './imports.js';

const singleItemCount = 1;

export const isFunctionLike = (node: unknown): node is NodeLike =>
  isNodeLike(node) &&
  (node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression');

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

export const containsAnyBoundNamespaceCall = (
  context: Context,
  node: unknown,
  namespaceNames: ReadonlySet<string>,
): boolean => {
  let found = false;
  const visit = (candidate: NodeLike): void => {
    const call = getStaticMemberCall(candidate);
    found =
      found || (call !== null && isNamespaceImportReference(context, call.object, namespaceNames));
  };

  if (isNodeLike(node)) {
    visit(node);
  }
  walkDescendants(node, visit);
  return found;
};
