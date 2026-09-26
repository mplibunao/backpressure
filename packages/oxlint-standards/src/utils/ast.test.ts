import { describe, expect, it, vi } from 'vitest';

import {
  type NodeLike,
  getCallExpressionArguments,
  getNodeField,
  getStaticMemberCall,
  getStaticMemberExpression,
  getStringLiteralValue,
  hasAncestor,
  isIdentifierName,
  isNodeLike,
  isStringLiteral,
  peelTransparentExpression,
  staticMemberPropertyName,
  visitSelfAndDescendants,
  walkDescendants,
} from './ast.js';

vi.setConfig({ testTimeout: 1000 });

const RANGE: [number, number] = [0, 1];

// Builds a minimal NodeLike with only the fields exercised by the test
const mkNode = (type: string, extra: Record<string, unknown> = {}): NodeLike =>
  ({ type, range: RANGE, ...extra }) as unknown as NodeLike;

// Minimal Identifier shape used as object/property in member expressions
const ident = (name: string) => ({ type: 'Identifier', name, range: RANGE });

// Builds a MemberExpression; computed=false by default (static member access)
const memberExpr = (obj: unknown, prop: unknown, computed = false) => ({
  type: 'MemberExpression',
  object: obj,
  property: prop,
  computed,
  range: RANGE,
});

// ── isNodeLike ────────────────────────────────────────────────────────────────

describe('isNodeLike()', () => {
  it('returns true for an object with a string type and range', () => {
    expect(isNodeLike({ type: 'Program', range: RANGE })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isNodeLike(null)).toBe(false);
  });

  it('returns false when range is absent', () => {
    expect(isNodeLike({ type: 'Program' })).toBe(false);
  });

  it('returns false when type is not a string', () => {
    expect(isNodeLike({ type: RANGE, range: RANGE })).toBe(false);
  });
});

// ── isIdentifierName ──────────────────────────────────────────────────────────

describe('isIdentifierName()', () => {
  it('returns true for a valid Identifier node', () => {
    expect(isIdentifierName({ type: 'Identifier', name: 'foo', range: RANGE })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isIdentifierName(null)).toBe(false);
  });

  it('returns false when type is not "Identifier"', () => {
    expect(isIdentifierName({ type: 'Literal', name: 'foo', range: RANGE })).toBe(false);
  });

  it('returns false when name is not a string', () => {
    expect(isIdentifierName({ type: 'Identifier', name: RANGE, range: RANGE })).toBe(false);
  });
});

// ── getStringLiteralValue ─────────────────────────────────────────────────────

describe('getStringLiteralValue()', () => {
  it('returns the string value for a string literal node', () => {
    expect(getStringLiteralValue({ value: 'hello' })).toBe('hello');
  });

  it('returns null for null', () => {
    expect(getStringLiteralValue(null)).toBeNull();
  });

  it('returns null when the value field is absent', () => {
    expect(getStringLiteralValue({})).toBeNull();
  });
});

// ── getStaticMemberExpression ─────────────────────────────────────────────────

describe('getStaticMemberExpression()', () => {
  it('returns a StaticMemberCall for a valid static member expression', () => {
    const result = getStaticMemberExpression(memberExpr(ident('Effect'), ident('log')));
    expect(result?.objectName).toBe('Effect');
    expect(result?.propertyName).toBe('log');
  });

  it('returns null for null input', () => {
    expect(getStaticMemberExpression(null)).toBeNull();
  });

  it('returns null when type is not "MemberExpression"', () => {
    const notMember = {
      type: 'CallExpression',
      computed: false,
      object: ident('x'),
      property: ident('y'),
      range: RANGE,
    };
    expect(getStaticMemberExpression(notMember)).toBeNull();
  });

  it('returns null for a computed member expression', () => {
    expect(getStaticMemberExpression(memberExpr(ident('x'), ident('y'), true))).toBeNull();
  });

  it('returns null when the object is not an Identifier', () => {
    const literal = { type: 'Literal', value: 'x', range: RANGE };
    expect(getStaticMemberExpression(memberExpr(literal, ident('y')))).toBeNull();
  });

  it('returns null when the property is not an Identifier', () => {
    const literal = { type: 'Literal', value: 'y', range: RANGE };
    expect(getStaticMemberExpression(memberExpr(ident('x'), literal))).toBeNull();
  });
});

// ── getStaticMemberCall ───────────────────────────────────────────────────────

describe('getStaticMemberCall()', () => {
  it('returns null for null', () => {
    // Null must be rejected before property access because typeof null is 'object'.
    expect(getStaticMemberCall(null)).toBeNull();
  });

  it('returns null for a string', () => {
    expect(getStaticMemberCall('hello')).toBeNull();
  });

  it('returns a StaticMemberCall when the node has a static member callee', () => {
    const callNode = {
      type: 'CallExpression',
      callee: memberExpr(ident('Effect'), ident('log')),
      range: RANGE,
    };
    const result = getStaticMemberCall(callNode);
    expect(result?.objectName).toBe('Effect');
    expect(result?.propertyName).toBe('log');
  });

  it('returns null when the callee is not a static member expression', () => {
    const callNode = { type: 'CallExpression', callee: ident('fn'), range: RANGE };
    expect(getStaticMemberCall(callNode)).toBeNull();
  });
});

// ── getNodeField ──────────────────────────────────────────────────────────────

describe('getNodeField()', () => {
  it('returns null for null', () => {
    // Null must be rejected before descriptor lookup because typeof null is 'object'.
    expect(getNodeField(null, 'type')).toBeNull();
  });

  it('returns null for a string', () => {
    expect(getNodeField('hello', 'type')).toBeNull();
  });

  it('returns the field value when it exists on the node', () => {
    expect(getNodeField({ type: 'Program', range: RANGE }, 'type')).toBe('Program');
  });

  it('returns undefined for an absent key', () => {
    expect(getNodeField({ range: RANGE }, 'type')).toBeUndefined();
  });
});

// ── getCallExpressionArguments ────────────────────────────────────────────────

describe('getCallExpressionArguments()', () => {
  it('returns the arguments array when present', () => {
    const args = [mkNode('Identifier'), mkNode('Literal')];
    expect(getCallExpressionArguments(mkNode('CallExpression', { arguments: args }))).toHaveLength(
      args.length,
    );
  });

  it('returns an empty array when the arguments field is absent', () => {
    expect(getCallExpressionArguments(mkNode('CallExpression'))).toStrictEqual([]);
  });

  it('returns an empty array when arguments is not an array', () => {
    expect(getCallExpressionArguments(mkNode('CallExpression', { arguments: null }))).toStrictEqual(
      [],
    );
  });
});

// ── hasAncestor ───────────────────────────────────────────────────────────────

describe('hasAncestor()', () => {
  it('returns true when a direct parent matches the predicate', () => {
    const parent = mkNode('Program');
    const child = mkNode('ExpressionStatement', { parent });
    expect(hasAncestor(child, (ancestor) => ancestor.type === 'Program')).toBe(true);
  });

  it('returns true when a grandparent matches', () => {
    const grandparent = mkNode('Program');
    const parent = mkNode('BlockStatement', { parent: grandparent });
    const child = mkNode('ExpressionStatement', { parent });
    expect(hasAncestor(child, (ancestor) => ancestor.type === 'Program')).toBe(true);
  });

  it('returns false when no ancestor matches the predicate', () => {
    const parent = mkNode('BlockStatement');
    const child = mkNode('ExpressionStatement', { parent });
    expect(hasAncestor(child, (ancestor) => ancestor.type === 'Program')).toBe(false);
  });

  it('returns false when the node has no parent', () => {
    expect(hasAncestor(mkNode('Program'), () => true)).toBe(false);
  });
});

// ── walkDescendants ───────────────────────────────────────────────────────────

describe('walkDescendants()', () => {
  it('visits direct NodeLike children in array properties', () => {
    const child = mkNode('Identifier');
    const root = mkNode('Program', { body: [child] });
    const visited: NodeLike[] = [];
    walkDescendants(root, (node) => visited.push(node));
    expect(visited).toContain(child);
  });

  it('skips non-NodeLike items in arrays', () => {
    const nodeChild = mkNode('Identifier');
    const root = mkNode('Program', { body: ['skip-me', nodeChild] });
    const visited: NodeLike[] = [];
    walkDescendants(root, (node) => visited.push(node));
    expect(visited).toStrictEqual([nodeChild]);
  });

  it('visits nested NodeLike children recursively via object properties', () => {
    const grandchild = mkNode('Identifier');
    const child = mkNode('ExpressionStatement', { expression: grandchild });
    const root = mkNode('Program', { body: [child] });
    const visited: NodeLike[] = [];
    walkDescendants(root, (node) => visited.push(node));
    expect(visited).toContain(child);
    expect(visited).toContain(grandchild);
  });

  it('returns immediately for a non-NodeLike input', () => {
    const visited: NodeLike[] = [];
    walkDescendants(null, (node) => visited.push(node));
    expect(visited).toHaveLength(0);
  });

  it('skips the loc key', () => {
    const locChild = mkNode('Identifier');
    const root = mkNode('Program', { loc: locChild });
    const visited: NodeLike[] = [];
    walkDescendants(root, (node) => visited.push(node));
    expect(visited).not.toContain(locChild);
    expect(visited).toHaveLength(0);
  });

  it('skips the parent key — parent back-links are not traversed', () => {
    const parentNode = mkNode('Program');
    const child = mkNode('ExpressionStatement', { parent: parentNode });
    const visited: NodeLike[] = [];
    walkDescendants(child, (node) => visited.push(node));
    expect(visited).not.toContain(parentNode);
  });
});

describe('visitSelfAndDescendants()', () => {
  it('visits the node itself before its descendants', () => {
    const grandchild = mkNode('Identifier');
    const child = mkNode('ExpressionStatement', { expression: grandchild });
    const root = mkNode('Program', { body: [child] });
    const visited: NodeLike[] = [];
    visitSelfAndDescendants(root, (node) => visited.push(node));
    expect(visited).toStrictEqual([root, child, grandchild]);
  });

  it('visits nothing for a non-NodeLike input', () => {
    const visited: NodeLike[] = [];
    visitSelfAndDescendants(null, (node) => visited.push(node));
    expect(visited).toHaveLength(0);
  });
});

// ── peelTransparentExpression ─────────────────────────────────────────────────

describe('peelTransparentExpression()', () => {
  it('peels nested type assertions, satisfies, non-null, and parentheses', () => {
    const inner = mkNode('Literal', { value: 'timeout' });
    const wrapped = mkNode('TSAsExpression', {
      expression: mkNode('ParenthesizedExpression', {
        expression: mkNode('TSSatisfiesExpression', {
          expression: mkNode('TSNonNullExpression', {
            expression: mkNode('TSTypeAssertion', { expression: inner }),
          }),
        }),
      }),
    });
    expect(peelTransparentExpression(wrapped)).toBe(inner);
  });

  it('leaves a runtime-changing wrapper in place', () => {
    const chain = mkNode('ChainExpression', { expression: mkNode('Identifier', { name: 'x' }) });
    expect(peelTransparentExpression(chain)).toBe(chain);
  });
});

// ── isStringLiteral ───────────────────────────────────────────────────────────

describe('isStringLiteral()', () => {
  it('accepts a string literal and rejects other literals', () => {
    expect(isStringLiteral(mkNode('Literal', { value: 'text' }))).toBe(true);
    expect(isStringLiteral(mkNode('Literal', { value: 1 }))).toBe(false);
    expect(isStringLiteral(mkNode('TemplateLiteral', {}))).toBe(false);
  });
});

// ── staticMemberPropertyName ──────────────────────────────────────────────────

describe('staticMemberPropertyName()', () => {
  it('returns the name of a non-computed identifier property', () => {
    expect(
      staticMemberPropertyName(mkNode('MemberExpression', memberExpr(ident('e'), ident('_tag')))),
    ).toBe('_tag');
  });

  it('returns the value of a computed string-literal property', () => {
    const property = mkNode('Literal', { value: '_tag' });
    expect(
      staticMemberPropertyName(mkNode('MemberExpression', memberExpr(ident('e'), property, true))),
    ).toBe('_tag');
  });

  it('returns null for a computed identifier key, which is read at runtime', () => {
    expect(
      staticMemberPropertyName(
        mkNode('MemberExpression', memberExpr(ident('e'), ident('_tag'), true)),
      ),
    ).toBeNull();
  });

  it('returns null for a non-member node', () => {
    expect(staticMemberPropertyName(ident('_tag'))).toBeNull();
  });
});
