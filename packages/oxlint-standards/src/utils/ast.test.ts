/* eslint-disable vitest/prefer-to-be-falsy, vitest/prefer-to-be-truthy --
   vitest/prefer-strict-boolean-matchers takes precedence for boolean-typed return values. */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion --
   Mock helpers intentionally provide only the properties exercised by the code under test. */
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

  it('returns false when range is absent — exercises the range-in-value guard', () => {
    // Kills ConditionalExpression 33:22 — 'range' in value → true removes the range check
    expect(isNodeLike({ type: 'Program' })).toBe(false);
  });

  it('returns false when type is not a string — exercises the typeof type guard', () => {
    // Kills ConditionalExpression 33:22 — typeof value['type'] === 'string' → true
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

  it('returns false when type is not "Identifier" — exercises the type equality guard', () => {
    // Kills ConditionalExpression 36:22 — value['type'] === 'Identifier' → true
    expect(isIdentifierName({ type: 'Literal', name: 'foo', range: RANGE })).toBe(false);
  });

  it('returns false when name is not a string — exercises the typeof name guard', () => {
    // Kills ConditionalExpression 36:56 — typeof value['name'] === 'string' → true
    expect(isIdentifierName({ type: 'Identifier', name: RANGE, range: RANGE })).toBe(false);
  });
});

// ── getStringLiteralValue ─────────────────────────────────────────────────────

describe('getStringLiteralValue()', () => {
  it('returns the string value for a string literal node', () => {
    expect(getStringLiteralValue({ value: 'hello' })).toBe('hello');
  });

  it('returns null for null — exercises the isRecord guard', () => {
    // Kills ConditionalExpression 39:7 — !isRecord(value) → false removes the null check
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

  it('returns null when type is not "MemberExpression" — exercises the type guard', () => {
    // Kills ConditionalExpression 48:22 — value['type'] === 'MemberExpression' → true
    const notMember = {
      type: 'CallExpression',
      computed: false,
      object: ident('x'),
      property: ident('y'),
      range: RANGE,
    };
    expect(getStaticMemberExpression(notMember)).toBeNull();
  });

  it('returns null for a computed member expression — exercises the computed guard', () => {
    // Kills ConditionalExpression 48:62 — value['computed'] === false → true
    expect(getStaticMemberExpression(memberExpr(ident('x'), ident('y'), true))).toBeNull();
  });

  it('returns null when the object is not an Identifier — exercises the left side of ||', () => {
    // Kills ConditionalExpression 55:7 (whole condition → false) and LogicalOperator 55:7 (|| → &&)
    const literal = { type: 'Literal', value: 'x', range: RANGE };
    expect(getStaticMemberExpression(memberExpr(literal, ident('y')))).toBeNull();
  });

  it('returns null when the property is not an Identifier — exercises the right side of ||', () => {
    // Kills LogicalOperator 55:7 (|| → &&): only the right side fails so && would not fire
    const literal = { type: 'Literal', value: 'y', range: RANGE };
    expect(getStaticMemberExpression(memberExpr(ident('x'), literal))).toBeNull();
  });
});

// ── getStaticMemberCall ───────────────────────────────────────────────────────

describe('getStaticMemberCall()', () => {
  it('returns null for null — exercises the null guard', () => {
    // Kills ConditionalExpression/LogicalOperator at 68:7 and ConditionalExpression at 68:35:
    // || → && makes the null check miss null (typeof null === 'object'), causing a throw.
    expect(getStaticMemberCall(null)).toBeNull();
  });

  it('returns null for a string — exercises the typeof guard', () => {
    // Kills the ConditionalExpression 68:7 mutations that remove the typeof check
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
  it('returns null for null — exercises the null guard', () => {
    // Kills ConditionalExpression/LogicalOperator at 76:7 and ConditionalExpression at 76:35:
    // || → && causes null to pass through to getOwnPropertyDescriptor, which throws.
    expect(getNodeField(null, 'type')).toBeNull();
  });

  it('returns null for a string — exercises the typeof guard', () => {
    // Kills ConditionalExpression 76:7 mutations that weaken the typeof check
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

  it('returns true when a grandparent matches — exercises the while-loop walk', () => {
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
    const visited: Array<NodeLike> = [];
    walkDescendants(root, (node) => visited.push(node));
    expect(visited).toContain(child);
  });

  it('skips non-NodeLike items in arrays — exercises the isNodeLike(item) guard', () => {
    // Kills ConditionalExpression 117:13 — isNodeLike(item) → true would visit the string
    const nodeChild = mkNode('Identifier');
    const root = mkNode('Program', { body: ['skip-me', nodeChild] });
    const visited: Array<NodeLike> = [];
    walkDescendants(root, (node) => visited.push(node));
    expect(visited).toStrictEqual([nodeChild]);
  });

  it('visits nested NodeLike children recursively via object properties', () => {
    const grandchild = mkNode('Identifier');
    const child = mkNode('ExpressionStatement', { expression: grandchild });
    const root = mkNode('Program', { body: [child] });
    const visited: Array<NodeLike> = [];
    walkDescendants(root, (node) => visited.push(node));
    expect(visited).toContain(child);
    expect(visited).toContain(grandchild);
  });

  it('returns immediately for a non-NodeLike input', () => {
    const visited: Array<NodeLike> = [];
    walkDescendants(null, (node) => visited.push(node));
    expect(visited).toHaveLength(0);
  });

  it('skips the loc key — exercises the ignoredTraversalKeys guard', () => {
    // Kills StringLiteral 27:49 — 'loc' → '': without the loc entry, locChild would be visited
    const locChild = mkNode('Identifier');
    const root = mkNode('Program', { loc: locChild });
    const visited: Array<NodeLike> = [];
    walkDescendants(root, (node) => visited.push(node));
    expect(visited).not.toContain(locChild);
    expect(visited).toHaveLength(0);
  });

  it('skips the parent key — parent back-links are not traversed', () => {
    const parentNode = mkNode('Program');
    const child = mkNode('ExpressionStatement', { parent: parentNode });
    const visited: Array<NodeLike> = [];
    walkDescendants(child, (node) => visited.push(node));
    expect(visited).not.toContain(parentNode);
  });
});
