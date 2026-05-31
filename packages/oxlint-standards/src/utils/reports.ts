import type { Context, Ranged } from '@oxlint/plugins';

export const reportByMessageId = (context: Context, node: Ranged, messageId: string): void => {
  context.report({
    messageId,
    node,
  });
};

export const reportMessage = (context: Context, node: Ranged, message: string): void => {
  context.report({
    message,
    node,
  });
};
