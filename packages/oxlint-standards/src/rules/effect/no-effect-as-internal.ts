import type { Context, ESTree, Rule } from '@oxlint/plugins';

import { getCallExpressionArguments, getStaticMemberCall } from '../../utils/ast.js';
import { effectValueMappingMembers } from '../../utils/effect-identifiers.js';
import { isInAnyWrapperOwnedExpression } from '../../utils/effect-ownership.js';
import {
  collectEffectNamespaceImports,
  collectImportNames,
  isEffectNamespaceImportReference,
} from '../../utils/imports.js';
import { reportByMessageId } from '../../utils/reports.js';
import { containsSideEffectCall } from '../../utils/side-effects.js';
import { noEffectAsMessage } from './no-effect-as-message.js';

const effectValueMappingMemberSet: ReadonlySet<string> = new Set(effectValueMappingMembers);

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
        const memberCall = getStaticMemberCall(node);

        if (memberCall === null) {
          return;
        }

        if (!isEffectNamespaceImportReference(context, memberCall.object, effectNamespaceNames)) {
          return;
        }

        if (!effectValueMappingMemberSet.has(memberCall.propertyName)) {
          return;
        }

        if (isInAnyWrapperOwnedExpression(context, node, effectNamespaceNames)) {
          return;
        }

        const [firstArgument] = getCallExpressionArguments(node);
        if (containsSideEffectCall(context, firstArgument, effectNamespaceNames, atomNames)) {
          return;
        }

        reportByMessageId(context, node, 'avoidEffectAs');
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
