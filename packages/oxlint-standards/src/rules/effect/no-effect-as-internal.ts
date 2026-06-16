import type { Context, ESTree, Rule } from '@oxlint/plugins';

import { getCallExpressionArguments, getStaticMemberCall } from '#oxlint-standards/utils/ast.js';
import { effectValueMappingMembers } from '#oxlint-standards/utils/effect-identifiers.js';
import { isInAnyWrapperOwnedExpression } from '#oxlint-standards/utils/effect-ownership.js';
import {
  collectEffectNamespaceImports,
  collectImportNames,
  isEffectNamespaceImportReference,
} from '#oxlint-standards/utils/imports.js';
import { reportByMessageId } from '#oxlint-standards/utils/reports.js';
import { containsSideEffectCall } from '#oxlint-standards/utils/side-effects.js';
import { noEffectAsMessage } from './no-effect-as-message.js';

const effectValueMappingMemberSet: ReadonlySet<string> = new Set(effectValueMappingMembers);

// Returns true when the call is a matching Effect.<valueMappingMember>() that is not already
// inside a wrapper-owned expression. The null-check on memberCall is the early-exit guard.
const isTargetedEffectAsCall = (
  context: Context,
  node: ESTree.CallExpression,
  effectNames: ReadonlySet<string>,
): boolean => {
  const memberCall = getStaticMemberCall(node);
  if (memberCall === null) {
    return false;
  }
  return (
    isEffectNamespaceImportReference(context, memberCall.object, effectNames) &&
    effectValueMappingMemberSet.has(memberCall.propertyName) &&
    !isInAnyWrapperOwnedExpression(context, node, effectNames)
  );
};

// Full violation check: guards pass, then the first argument must not produce a side effect.
const checkAndReportEffectAs = (
  context: Context,
  node: ESTree.CallExpression,
  effectNames: ReadonlySet<string>,
  atomNames: ReadonlySet<string>,
): void => {
  if (!isTargetedEffectAsCall(context, node, effectNames)) {
    return;
  }
  const [firstArgument] = getCallExpressionArguments(node);
  if (containsSideEffectCall(context, firstArgument, effectNames, atomNames)) {
    return;
  }
  reportByMessageId(context, node, 'avoidEffectAs');
};

export const noEffectAsRuleImplementation = {
  create(context: Context) {
    let atomNames = new Set<string>();
    let effectNamespaceNames = new Set<string>();

    return {
      Program(node: ESTree.Program) {
        atomNames = collectImportNames(node, ['@effect-atom/atom-react'], 'Atom');
        effectNamespaceNames = collectEffectNamespaceImports(node);
      },
      CallExpression(node: ESTree.CallExpression) {
        checkAndReportEffectAs(context, node, effectNamespaceNames, atomNames);
      },
    };
  },
  meta: {
    docs: {
      description:
        'Disallow Effect.as because it hides value mapping behind placeholder sequencing.',
      recommended: 'error',
    },
    messages: {
      avoidEffectAs: noEffectAsMessage,
    },
    type: 'suggestion',
  },
} satisfies Rule;
