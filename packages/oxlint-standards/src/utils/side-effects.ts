import type { Context } from '@oxlint/plugins';

import {
  getNodeField,
  getStaticMemberCall,
  isIdentifierName,
  type NodeLike,
  visitSelfAndDescendantsWhere,
} from './ast.js';
import { runsWhenReached } from './effect-context.js';
import { boundAtomEffectMember, isNamespaceImportReference } from './imports.js';

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
    boundAtomEffectMember(context, node, atomNames) === 'set' ||
    (call.propertyName.startsWith('log') &&
      isNamespaceImportReference(context, call.object, effectNames))
  );
};

// A side-effect call that runs when `node` is evaluated. A call inside a function value runs only
// when that function is called, so it is not part of the evaluation.
export const containsSideEffectCall = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
  atomNames: ReadonlySet<string>,
): boolean => {
  let found = false;
  visitSelfAndDescendantsWhere(node, runsWhenReached, (candidate) => {
    found = found || isSideEffectCall(context, candidate, effectNames, atomNames);
  });
  return found;
};
