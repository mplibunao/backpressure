import type { Context } from '@oxlint/plugins';

import {
  getCallExpressionArguments,
  getNodeField,
  getStaticMemberCall,
  hasAncestor,
  isIdentifierName,
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

export const isReturnedFromNamedWrapperDeclaration = (node: NodeLike): boolean =>
  hasAncestor(node, (ancestor) => {
    if (ancestor.type === 'FunctionDeclaration') {
      return (
        isIdentifierName(getNodeField(ancestor, 'id')) && functionReturnNode(ancestor) === node
      );
    }

    if (ancestor.type !== 'VariableDeclarator' || !isIdentifierName(getNodeField(ancestor, 'id'))) {
      return false;
    }

    const declaration = getNodeField(ancestor, 'parent');
    const init = getNodeField(ancestor, 'init');
    // Source parity: named wrapper aliases only cover const expression-bodied arrow wrappers.
    const initArrowBody =
      isNodeLike(init) && init.type === 'ArrowFunctionExpression'
        ? getNodeField(init, 'body')
        : null;
    const isExpressionBodiedArrowInit =
      isNodeLike(initArrowBody) && initArrowBody.type !== 'BlockStatement';
    return (
      isNodeLike(declaration) &&
      declaration.type === 'VariableDeclaration' &&
      getNodeField(declaration, 'kind') === 'const' &&
      isExpressionBodiedArrowInit &&
      functionReturnNode(init) === node
    );
  });

export const isEffectWrapperPipeExpression = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): boolean => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return false;
  }
  const callee = getNodeField(node, 'callee');
  if (!isIdentifierName(callee) || callee.name !== 'pipe') {
    return false;
  }
  const [firstArg] = getCallExpressionArguments(node);
  if (!isNodeLike(firstArg)) {
    return false;
  }
  const call = firstArg.type === 'CallExpression' ? getStaticMemberCall(firstArg) : null;
  return (
    (call !== null && isNamespaceImportReference(context, call.object, effectNames)) ||
    containsAnyBoundNamespaceCall(context, firstArg, effectNames)
  );
};

export const isInsideWrapperOwnedExpression = (node: NodeLike): boolean =>
  isReturnedFromNamedWrapperDeclaration(node) ||
  hasAncestor(node, isReturnedFromNamedWrapperDeclaration);

export const isInsideConstPipeWrapperAlias = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean =>
  hasAncestor(node, (ancestor) => {
    const ancestorParent = getNodeField(ancestor, 'parent');
    if (!isNodeLike(ancestorParent) || ancestorParent.type !== 'VariableDeclarator') {
      return false;
    }
    if (getNodeField(ancestorParent, 'init') !== ancestor) {
      return false;
    }
    const declaration = getNodeField(ancestorParent, 'parent');
    return (
      isNodeLike(declaration) &&
      declaration.type === 'VariableDeclaration' &&
      getNodeField(declaration, 'kind') === 'const' &&
      isEffectWrapperPipeExpression(context, ancestor, effectNames)
    );
  });

export const isConstPipeWrapperAliasSelf = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  const parent = getNodeField(node, 'parent');
  if (!isNodeLike(parent) || parent.type !== 'VariableDeclarator') {
    return false;
  }
  if (getNodeField(parent, 'init') !== node) {
    return false;
  }
  const declaration = getNodeField(parent, 'parent');
  return (
    isNodeLike(declaration) &&
    declaration.type === 'VariableDeclaration' &&
    getNodeField(declaration, 'kind') === 'const' &&
    isEffectWrapperPipeExpression(context, node, effectNames)
  );
};

export const isInAnyWrapperOwnedExpression = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean =>
  isInsideWrapperOwnedExpression(node) ||
  isConstPipeWrapperAliasSelf(context, node, effectNames) ||
  isInsideConstPipeWrapperAlias(context, node, effectNames);
