import type { ESTree, Ranged } from '@oxlint/plugins';

export type NodeLike = ESTree.Node &
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

export const getStringLiteralValue = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  const literalValue = value['value'];
  return typeof literalValue === 'string' ? literalValue : null;
};

const isStaticMemberExpression = (value: unknown): value is StaticMemberExpressionLike =>
  isRecord(value) && value['type'] === 'MemberExpression' && value['computed'] === false;

export const getStaticMemberExpression = (value: unknown): StaticMemberCall | null => {
  if (!isStaticMemberExpression(value)) {
    return null;
  }

  if (!isIdentifierName(value.object) || !isIdentifierName(value.property)) {
    return null;
  }

  return {
    member: value,
    object: value.object,
    objectName: value.object.name,
    propertyName: value.property.name,
  };
};

export const getStaticMemberCall = (node: unknown): StaticMemberCall | null => {
  if (typeof node !== 'object' || node === null) {
    return null;
  }

  return getStaticMemberExpression(Object.getOwnPropertyDescriptor(node, 'callee')?.value);
};

export const getNodeField = (node: unknown, key: string): unknown => {
  if (typeof node !== 'object' || node === null) {
    return null;
  }

  return Object.getOwnPropertyDescriptor(node, key)?.value;
};

export const getCallExpressionArguments = (node: NodeLike): readonly unknown[] => {
  const maybeArguments = getNodeField(node, 'arguments');
  return Array.isArray(maybeArguments) ? maybeArguments : [];
};

// Wrappers that change only the static type or grouping, never the runtime value.
const transparentExpressionTypes = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

export const peelTransparentExpression = (node: unknown): unknown => {
  let current = node;
  while (isNodeLike(current) && transparentExpressionTypes.has(current.type)) {
    current = getNodeField(current, 'expression');
  }
  return current;
};

export const isStringLiteral = (node: unknown): boolean =>
  isNodeLike(node) && node.type === 'Literal' && typeof getNodeField(node, 'value') === 'string';

// A statically known member key: `value.name` or `value['name']`. A computed identifier such as
// `value[name]` reads a runtime key, so it has no static name.
export const staticMemberPropertyName = (node: unknown): string | null => {
  if (!isNodeLike(node) || node.type !== 'MemberExpression') {
    return null;
  }

  const property = getNodeField(node, 'property');
  if (getNodeField(node, 'computed') === true) {
    return isStringLiteral(property) ? getStringLiteralValue(property) : null;
  }
  return isIdentifierName(property) ? property.name : null;
};

export const hasAncestor = (
  node: NodeLike,
  predicate: (ancestor: NodeLike) => boolean,
): boolean => {
  let current = getNodeField(node, 'parent');

  while (isNodeLike(current)) {
    if (predicate(current)) {
      return true;
    }

    current = getNodeField(current, 'parent');
  }

  return false;
};

// Handles one field value during AST traversal: visits and recurses into array items or single nodes.
// Takes `recurse` as a parameter (rather than referencing walkDescendants directly) so that
// the two helpers stay ordered without triggering no-use-before-define on a shared const binding.
const walkNodeFieldValue = (
  value: unknown,
  visit: (node: NodeLike) => void,
  recurse: (node: unknown, visit: (node: NodeLike) => void) => void,
): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isNodeLike(item)) {
        visit(item);
      }
      recurse(item, visit);
    }
    return;
  }
  if (isNodeLike(value)) {
    visit(value);
    recurse(value, visit);
  }
};

export const walkDescendants = (node: unknown, visit: (node: NodeLike) => void): void => {
  if (!isNodeLike(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (!ignoredTraversalKeys.has(key)) {
      walkNodeFieldValue(value, visit, walkDescendants);
    }
  }
};

export const visitSelfAndDescendants = (node: unknown, visit: (node: NodeLike) => void): void => {
  if (!isNodeLike(node)) {
    return;
  }

  visit(node);
  walkDescendants(node, visit);
};
