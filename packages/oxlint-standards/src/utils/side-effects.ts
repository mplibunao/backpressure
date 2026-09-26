import type { Context } from '@oxlint/plugins';

import {
  getNodeField,
  getStaticMemberCall,
  isIdentifierName,
  type NodeLike,
  visitSelfAndDescendants,
} from './ast.js';
import { isNamespaceImportReference } from './imports.js';

export const isSideEffectCall = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
  atomNames: ReadonlySet<string>,
): boolean => {
  if (node.type !== 'CallExpression') {
    return false;
  }

  const callee = getNodeField(node, 'callee');
  if (isIdentifierName(callee) && (callee.name === 'setState' || callee.name === 'invalidate')) {
    return true;
  }

  const call = getStaticMemberCall(node);
  if (call === null) {
    return false;
  }

  return (
    call.objectName === 'console' ||
    (call.propertyName === 'set' && isNamespaceImportReference(context, call.object, atomNames)) ||
    (call.propertyName.startsWith('log') &&
      isNamespaceImportReference(context, call.object, effectNames))
  );
};

export const containsSideEffectCall = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
  atomNames: ReadonlySet<string>,
): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (candidate) => {
    found = found || isSideEffectCall(context, candidate, effectNames, atomNames);
  });
  return found;
};
