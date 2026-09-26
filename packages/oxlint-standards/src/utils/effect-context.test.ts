import { describe, expect, it, vi } from 'vitest';

import type { NodeLike } from './ast.js';
import {
  directCallOfInlineFunction,
  functionReturnNode,
  isFunctionLike,
} from './effect-context.js';

vi.setConfig({ testTimeout: 1000 });

// Range presence (not its value) satisfies the `'range' in value` check in isNodeLike
const RANGE: [number, number] = [0, 1];

const id = (name: string): NodeLike =>
  ({ type: 'Identifier', name, range: RANGE }) as unknown as NodeLike;

// A NodeLike member call: `obj.prop(...args)`
const memberCall = (obj: string, prop: string, args: unknown[] = []): NodeLike =>
  ({
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      computed: false,
      object: id(obj),
      property: id(prop),
      range: RANGE,
    },
    arguments: args,
    range: RANGE,
  }) as unknown as NodeLike;

const blockStmt = (...stmts: unknown[]): NodeLike =>
  ({ type: 'BlockStatement', body: stmts, range: RANGE }) as unknown as NodeLike;

const returnStmt = (argument: unknown): NodeLike =>
  ({ type: 'ReturnStatement', argument, range: RANGE }) as unknown as NodeLike;

// ── isFunctionLike ────────────────────────────────────────────────────────────

describe('isFunctionLike()', () => {
  it.for(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression'])(
    'returns true for %s',
    (type) => {
      expect(isFunctionLike({ type, range: RANGE })).toBe(true);
    },
  );

  it('returns false for a non-NodeLike value (no range property)', () => {
    expect(isFunctionLike({ type: 'ArrowFunctionExpression' })).toBe(false);
  });

  it('returns false for a NodeLike with a non-function type', () => {
    expect(isFunctionLike(id('x'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isFunctionLike(null)).toBe(false);
  });
});

// ── functionReturnNode ────────────────────────────────────────────────────────

describe('functionReturnNode()', () => {
  it('returns null for a non-function node', () => {
    expect(functionReturnNode(id('x'))).toBeNull();
  });

  it('returns the expression body for an expression-bodied arrow', () => {
    const expr = memberCall('Effect', 'succeed');
    expect(
      functionReturnNode({ type: 'ArrowFunctionExpression', body: expr, params: [], range: RANGE }),
    ).toBe(expr);
  });

  it('returns null for a BlockStatement body with two statements', () => {
    const body = blockStmt(returnStmt(id('x')), id('y'));
    expect(
      functionReturnNode({ type: 'ArrowFunctionExpression', body, params: [], range: RANGE }),
    ).toBeNull();
  });

  it('returns null for a BlockStatement body with zero statements', () => {
    const body = blockStmt();
    expect(
      functionReturnNode({ type: 'ArrowFunctionExpression', body, params: [], range: RANGE }),
    ).toBeNull();
  });

  it('returns null for a BlockStatement body with a single non-return statement', () => {
    // A non-return statement has no return value, so the helper must normalize the result to null.
    const body = blockStmt({ type: 'ExpressionStatement', expression: id('x'), range: RANGE });
    expect(
      functionReturnNode({ type: 'ArrowFunctionExpression', body, params: [], range: RANGE }),
    ).toBeNull();
  });

  it('returns the return argument for a block body with a single return statement', () => {
    const expr = memberCall('Effect', 'succeed');
    const body = blockStmt(returnStmt(expr));
    expect(
      functionReturnNode({
        type: 'FunctionDeclaration',
        id: id('run'),
        body,
        params: [],
        range: RANGE,
      }),
    ).toBe(expr);
  });
});

// ── directCallOfInlineFunction ──────────────────────────────────────────────

describe('directCallOfInlineFunction()', () => {
  const withParent = <T extends object>(node: T, parent: unknown): T =>
    Object.assign(node, { parent }) as T;

  it('returns the call that receives an inline function as an argument', () => {
    const callback = { type: 'ArrowFunctionExpression', params: [], range: RANGE };
    const call = memberCall('Effect', 'flatMap', [callback]);
    withParent(callback, call);
    expect(directCallOfInlineFunction(callback)).toBe(call);
  });

  it('returns null when the inline function is the callee rather than an argument', () => {
    const callee = { type: 'ArrowFunctionExpression', params: [], range: RANGE };
    const call = { type: 'CallExpression', callee, arguments: [], range: RANGE };
    withParent(callee, call);
    expect(directCallOfInlineFunction(callee)).toBeNull();
  });

  it('returns null for a function declaration', () => {
    const declaration = { type: 'FunctionDeclaration', id: id('run'), params: [], range: RANGE };
    withParent(declaration, memberCall('Effect', 'flatMap', [declaration]));
    expect(directCallOfInlineFunction(declaration)).toBeNull();
  });

  it('returns null for an inline function assigned before use', () => {
    const callback = { type: 'ArrowFunctionExpression', params: [], range: RANGE };
    withParent(callback, { type: 'VariableDeclarator', init: callback, range: RANGE });
    expect(directCallOfInlineFunction(callback)).toBeNull();
  });
});
