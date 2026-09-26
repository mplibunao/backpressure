import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Context } from '@oxlint/plugins';
import { describe, expect, it, vi } from 'vitest';

import type { NodeLike } from './ast.js';
import {
  containsAnyBoundNamespaceCall,
  functionReturnNode,
  isFunctionLike,
} from './effect-ownership.js';

vi.setConfig({ testTimeout: 1000 });

// Range presence (not its value) satisfies the `'range' in value` check in isNodeLike
const RANGE: [number, number] = [0, 1];

// ── Mock helpers ──────────────────────────────────────────────────────────────

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

// Context where the given names are resolved as namespace import bindings
const importCtx = (...names: string[]): Context => {
  const vars = new Map(names.map((varName) => [varName, { defs: [{ type: 'ImportBinding' }] }]));
  return {
    sourceCode: { getScope: () => ({ set: vars, upper: null }) },
  } as unknown as Context;
};

// Context where no variables are import bindings
const bareCtx: Context = {
  sourceCode: { getScope: () => ({ set: new Map(), upper: null }) },
} as unknown as Context;

const effects = new Set(['Effect']);

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

// ── containsAnyBoundNamespaceCall ─────────────────────────────────────────────

describe('containsAnyBoundNamespaceCall()', () => {
  it('returns false for a non-NodeLike input', () => {
    expect(containsAnyBoundNamespaceCall(bareCtx, null, effects)).toBe(false);
  });

  it('returns false when node is a member call on an unbound name', () => {
    // Unbound names must never count as owned namespace calls.
    expect(containsAnyBoundNamespaceCall(bareCtx, memberCall('Effect', 'succeed'), effects)).toBe(
      false,
    );
  });

  it('returns true when node itself is a member call on a bound namespace import', () => {
    expect(
      containsAnyBoundNamespaceCall(importCtx('Effect'), memberCall('Effect', 'succeed'), effects),
    ).toBe(true);
  });

  it('returns true when a descendant is a member call on a bound namespace import', () => {
    const node = {
      type: 'ExpressionStatement',
      expression: memberCall('Effect', 'succeed'),
      range: RANGE,
    };
    expect(containsAnyBoundNamespaceCall(importCtx('Effect'), node, effects)).toBe(true);
  });
});

// ── Retired wrapper ownership ─────────────────────────────────────────────────

// These helpers suppressed diagnostics on behalf of wrapper rules that no longer exist. A guard
// that reintroduces one of them would hide real violations behind an owner that never reports.
const retiredWrapperOwnershipHelpers = [
  'isConstPipeWrapperAliasSelf',
  'isEffectWrapperPipeExpression',
  'isInAnyWrapperOwnedExpression',
  'isInsideConstPipeWrapperAlias',
  'isInsideWrapperOwnedExpression',
  'isReturnedFromNamedWrapperDeclaration',
];
const packageSourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const thisTestFile = fileURLToPath(import.meta.url);

describe('retired wrapper ownership helpers', () => {
  it('are neither defined nor referenced by package source', () => {
    const offenders = readdirSync(packageSourceRoot, { recursive: true, encoding: 'utf8' })
      .filter((relativePath) => relativePath.endsWith('.ts'))
      .map((relativePath) => join(packageSourceRoot, relativePath))
      .filter((filePath) => filePath !== thisTestFile)
      .flatMap((filePath) => {
        const text = readFileSync(filePath, 'utf8');
        return retiredWrapperOwnershipHelpers
          .filter((helperName) => new RegExp(`\\b${helperName}\\b`).test(text))
          .map((helperName) => `${filePath}: ${helperName}`);
      });

    expect(offenders).toStrictEqual([]);
  });
});
