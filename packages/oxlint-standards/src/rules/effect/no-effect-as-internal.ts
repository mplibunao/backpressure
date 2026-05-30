import type { ESTree, Rule } from '@oxlint/plugins';

import { getStaticMemberCall } from '../../utils/ast.js';
import { effectValueMappingMembers } from '../../utils/effect-identifiers.js';
import {
  collectEffectNamespaceImports,
  isEffectNamespaceImportReference,
} from '../../utils/imports.js';
import { reportByMessageId } from '../../utils/reports.js';
import { noEffectAsMessage } from './no-effect-as-message.js';

const effectValueMappingMemberSet: ReadonlySet<string> = new Set(effectValueMappingMembers);

export const noEffectAsRuleImplementation = {
  create(context) {
    let effectNamespaceNames = new Set<string>();

    return {
      Program(node: ESTree.Program) {
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
