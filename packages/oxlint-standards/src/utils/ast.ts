import type { ESTree, Ranged } from '@oxlint/plugins';

type NodeLike = ESTree.Node &
  Ranged & {
    readonly type: string;
  };

export type IdentifierLike = NodeLike & {
  readonly type: 'Identifier';
  readonly name: string;
};

type StaticMemberExpressionLike = NodeLike & {
  readonly type: 'MemberExpression';
  readonly computed: false;
  readonly object: unknown;
  readonly property: unknown;
};

export interface StaticMemberCall {
  readonly member: Ranged;
  readonly object: IdentifierLike;
  readonly objectName: string;
  readonly propertyName: string;
}

const ignoredTraversalKeys = new Set(['parent', 'loc', 'range']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isNodeLike = (value: unknown): value is NodeLike =>
  isRecord(value) && typeof value['type'] === 'string' && 'range' in value;

export const isIdentifierName = (value: unknown): value is IdentifierLike =>
  isRecord(value) && value['type'] === 'Identifier' && typeof value['name'] === 'string';

const isStaticMemberExpression = (value: unknown): value is StaticMemberExpressionLike =>
  isRecord(value) && value['type'] === 'MemberExpression' && value['computed'] === false;

export const getStaticMemberCall = (node: ESTree.CallExpression): StaticMemberCall | null => {
  const { callee } = node;

  if (!isStaticMemberExpression(callee)) {
    return null;
  }

  if (!isIdentifierName(callee.object) || !isIdentifierName(callee.property)) {
    return null;
  }

  return {
    member: callee,
    object: callee.object,
    objectName: callee.object.name,
    propertyName: callee.property.name,
  };
};

export const walkDescendants = (node: unknown, visit: (node: NodeLike) => void): void => {
  if (!isNodeLike(node)) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (ignoredTraversalKeys.has(key)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walkDescendants(item, visit);
      }
      continue;
    }

    if (isNodeLike(value)) {
      visit(value);
      walkDescendants(value, visit);
    }
  }
};
