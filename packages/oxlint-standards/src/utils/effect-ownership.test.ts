/* eslint-disable vitest/prefer-to-be-falsy, vitest/prefer-to-be-truthy --
   vitest/prefer-strict-boolean-matchers takes precedence for boolean-typed return values. */
import type { Context } from '@oxlint/plugins';
import { describe, expect, it, vi } from 'vitest';

import type { NodeLike } from './ast.js';
import {
  containsAnyBoundNamespaceCall,
  functionReturnNode,
  isConstPipeWrapperAliasSelf,
  isEffectWrapperPipeExpression,
  isFunctionLike,
  isInsideConstPipeWrapperAlias,
  isReturnedFromNamedWrapperDeclaration,
} from './effect-ownership.js';

vi.setConfig({ testTimeout: 1000 });

// Range presence (not its value) satisfies the `'range' in value` check in isNodeLike
const RANGE: [number, number] = [0, 1];

// ── Mock helpers ──────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion --
   Mock helpers intentionally provide only the properties exercised by the code under test. */

const id = (name: string): NodeLike =>
  ({ type: 'Identifier', name, range: RANGE }) as unknown as NodeLike;

// A NodeLike member call: `obj.prop(...args)`
const memberCall = (obj: string, prop: string, args: Array<unknown> = []): NodeLike =>
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

// A NodeLike call: `name(...args)`
const identCall = (name: string, args: Array<unknown> = []): NodeLike =>
  ({
    type: 'CallExpression',
    callee: id(name),
    arguments: args,
    range: RANGE,
  }) as unknown as NodeLike;

const blockStmt = (...stmts: Array<unknown>): NodeLike =>
  ({ type: 'BlockStatement', body: stmts, range: RANGE }) as unknown as NodeLike;

const returnStmt = (argument: unknown): NodeLike =>
  ({ type: 'ReturnStatement', argument, range: RANGE }) as unknown as NodeLike;

// Context where the given names are resolved as namespace import bindings
const importCtx = (...names: Array<string>): Context => {
  const vars = new Map(names.map((varName) => [varName, { defs: [{ type: 'ImportBinding' }] }]));
  return {
    sourceCode: { getScope: () => ({ set: vars, upper: null }) },
  } as unknown as Context;
};

// Context where no variables are import bindings
const bareCtx: Context = {
  sourceCode: { getScope: () => ({ set: new Map(), upper: null }) },
} as unknown as Context;

/* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

const effects = new Set(['Effect']);

// ── isFunctionLike ────────────────────────────────────────────────────────────

describe('isFunctionLike()', () => {
  it.each(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression'])(
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

// ── isEffectWrapperPipeExpression ─────────────────────────────────────────────

describe('isEffectWrapperPipeExpression()', () => {
  it('returns false for a non-NodeLike value', () => {
    expect(isEffectWrapperPipeExpression(bareCtx, null, effects)).toBe(false);
  });

  it('returns false for a NodeLike that is not a CallExpression', () => {
    // NodeLike values still need the CallExpression guard before pipe-specific checks run.
    expect(isEffectWrapperPipeExpression(bareCtx, id('x'), effects)).toBe(false);
  });

  it('returns false for a call with an identifier callee that is not "pipe"', () => {
    // Use a bound Effect import so this fixture isolates the non-pipe callee contract.
    expect(
      isEffectWrapperPipeExpression(
        importCtx('Effect'),
        identCall('map', [memberCall('Effect', 'succeed')]),
        effects,
      ),
    ).toBe(false);
  });

  it('returns false for a NodeLike with non-CallExpression type that carries a pipe-like callee', () => {
    // A pipe-like callee on a non-call node must still be rejected.
    const fakeNode = {
      type: 'PipeStatement',
      callee: id('pipe'),
      arguments: [memberCall('Effect', 'succeed')],
      range: RANGE,
    };
    expect(isEffectWrapperPipeExpression(importCtx('Effect'), fakeNode, effects)).toBe(false);
  });

  it('returns false for pipe() called with no arguments', () => {
    expect(isEffectWrapperPipeExpression(bareCtx, identCall('pipe'), effects)).toBe(false);
  });

  it('returns true for pipe(Effect.method()) when Effect is a bound namespace import', () => {
    expect(
      isEffectWrapperPipeExpression(
        importCtx('Effect'),
        identCall('pipe', [memberCall('Effect', 'succeed')]),
        effects,
      ),
    ).toBe(true);
  });

  it('returns false for pipe(Effect.method()) when Effect is not a bound import', () => {
    expect(
      isEffectWrapperPipeExpression(
        bareCtx,
        identCall('pipe', [memberCall('Effect', 'succeed')]),
        effects,
      ),
    ).toBe(false);
  });

  it('returns true when firstArg wraps a bound namespace call but is not itself a member call', () => {
    // A wrapper call can still source-cover Effect work through its descendants.
    // Descendant scanning finds Effect.succeed inside the wrapper call.
    const firstArg = identCall('fn', [memberCall('Effect', 'succeed')]);
    expect(
      isEffectWrapperPipeExpression(importCtx('Effect'), identCall('pipe', [firstArg]), effects),
    ).toBe(true);
  });
});

// ── isReturnedFromNamedWrapperDeclaration ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- building parent chains
const mut = (node: unknown): Record<string, unknown> => node as Record<string, unknown>;

// Builds arrow-to-declarator-to-declaration chains with parent links pre-wired.
// Callers still set mut(node)['parent'] = arrow for the specific node under test.
const arrowChain = (body: unknown, kind = 'const', decId: unknown = id('run')) => {
  const arrow = { type: 'ArrowFunctionExpression', body, params: [], range: RANGE };
  const declarator = { type: 'VariableDeclarator', id: decId, init: arrow, range: RANGE };
  const declaration = {
    type: 'VariableDeclaration',
    kind,
    declarations: [declarator],
    range: RANGE,
  };
  mut(declarator)['parent'] = declaration;
  mut(arrow)['parent'] = declarator;
  return { arrow, declarator, declaration };
};

// ObjectPattern node — for declarator tests whose id is a destructuring pattern, not Identifier
const objPattern: unknown = { type: 'ObjectPattern', range: RANGE };

describe('isReturnedFromNamedWrapperDeclaration() — true cases', () => {
  it('returns true for the expression body of a named const arrow wrapper', () => {
    const expr = memberCall('Effect', 'succeed');
    const { arrow } = arrowChain(expr);
    mut(expr)['parent'] = arrow;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(true);
  });

  it('returns true for a node returned from a named FunctionDeclaration', () => {
    // Function declarations should be recognized as named wrapper declarations.
    const returnVal = memberCall('Effect', 'succeed');
    const stmt = { type: 'ReturnStatement', argument: returnVal, range: RANGE };
    const body = { type: 'BlockStatement', body: [stmt], range: RANGE };
    const decl = { type: 'FunctionDeclaration', id: id('run'), body, params: [], range: RANGE };
    mut(stmt)['parent'] = decl;
    mut(returnVal)['parent'] = stmt;
    expect(isReturnedFromNamedWrapperDeclaration(returnVal)).toBe(true);
  });
});

describe('isReturnedFromNamedWrapperDeclaration() — false cases', () => {
  it('returns false for a node with no ancestor chain', () => {
    expect(isReturnedFromNamedWrapperDeclaration(id('x'))).toBe(false);
  });

  it('returns false for a node whose function return does not match (init body is a different node)', () => {
    const expr = memberCall('Effect', 'succeed');
    const { arrow } = arrowChain(memberCall('Effect', 'map'));
    mut(expr)['parent'] = arrow;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(false);
  });

  it('returns false for a let (non-const) declaration wrapper', () => {
    const expr = memberCall('Effect', 'succeed');
    const { arrow } = arrowChain(expr, 'let');
    mut(expr)['parent'] = arrow;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(false);
  });

  it('returns false for a block-bodied arrow (not expression-bodied)', () => {
    // Block-bodied arrows are not wrapper aliases, even when they return Effect work.
    const expr = memberCall('Effect', 'succeed');
    const body = blockStmt(returnStmt(expr));
    const { arrow } = arrowChain(body);
    mut(body)['parent'] = arrow;
    mut(expr)['parent'] = body;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(false);
  });

  it('returns false for a VariableDeclarator without a named id', () => {
    // Declared id is a pattern (ObjectPattern), not an Identifier
    const expr = memberCall('Effect', 'succeed');
    const { arrow } = arrowChain(expr, 'const', objPattern);
    mut(expr)['parent'] = arrow;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(false);
  });
});

// ── isConstPipeWrapperAliasSelf ───────────────────────────────────────────────

describe('isConstPipeWrapperAliasSelf()', () => {
  it('returns true when node IS a pipe(Effect…) expression assigned directly to a const', () => {
    const pipeNode = identCall('pipe', [memberCall('Effect', 'succeed')]);
    const declarator = { type: 'VariableDeclarator', id: id('run'), init: pipeNode, range: RANGE };
    const declaration = {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [declarator],
      range: RANGE,
    };
    mut(declarator)['parent'] = declaration;
    mut(pipeNode)['parent'] = declarator;
    expect(isConstPipeWrapperAliasSelf(importCtx('Effect'), pipeNode, effects)).toBe(true);
  });

  it('returns false when the parent node is not a VariableDeclarator', () => {
    const pipeNode = identCall('pipe', [memberCall('Effect', 'succeed')]);
    mut(pipeNode)['parent'] = { type: 'ExpressionStatement', range: RANGE };
    expect(isConstPipeWrapperAliasSelf(importCtx('Effect'), pipeNode, effects)).toBe(false);
  });

  it('returns false when the node is not the init of its parent declarator', () => {
    const pipeNode = identCall('pipe', [memberCall('Effect', 'succeed')]);
    const otherInit = identCall('other');
    const declarator = { type: 'VariableDeclarator', id: id('run'), init: otherInit, range: RANGE };
    const declaration = {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [declarator],
      range: RANGE,
    };
    mut(declarator)['parent'] = declaration;
    mut(pipeNode)['parent'] = declarator;
    expect(isConstPipeWrapperAliasSelf(importCtx('Effect'), pipeNode, effects)).toBe(false);
  });

  it('returns false for a let (non-const) variable declaration', () => {
    const pipeNode = identCall('pipe', [memberCall('Effect', 'succeed')]);
    const declarator = { type: 'VariableDeclarator', id: id('run'), init: pipeNode, range: RANGE };
    const declaration = {
      type: 'VariableDeclaration',
      kind: 'let',
      declarations: [declarator],
      range: RANGE,
    };
    mut(declarator)['parent'] = declaration;
    mut(pipeNode)['parent'] = declarator;
    expect(isConstPipeWrapperAliasSelf(importCtx('Effect'), pipeNode, effects)).toBe(false);
  });
});

// ── isInsideConstPipeWrapperAlias ─────────────────────────────────────────────

describe('isInsideConstPipeWrapperAlias()', () => {
  it('returns true for a node inside a const pipe alias expression', () => {
    const innerCall = memberCall('Effect', 'succeed');
    const pipeNode = identCall('pipe', [innerCall]);
    const declarator = { type: 'VariableDeclarator', id: id('run'), init: pipeNode, range: RANGE };
    const declaration = {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [declarator],
      range: RANGE,
    };
    mut(declarator)['parent'] = declaration;
    mut(pipeNode)['parent'] = declarator;
    mut(innerCall)['parent'] = pipeNode;
    expect(isInsideConstPipeWrapperAlias(importCtx('Effect'), innerCall, effects)).toBe(true);
  });

  it('returns false when the ancestor pipe is not the init of its parent declarator', () => {
    const innerCall = memberCall('Effect', 'succeed');
    const pipeNode = identCall('pipe', [innerCall]);
    const otherInit = identCall('other');
    const declarator = { type: 'VariableDeclarator', id: id('run'), init: otherInit, range: RANGE };
    const declaration = {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [declarator],
      range: RANGE,
    };
    mut(declarator)['parent'] = declaration;
    mut(pipeNode)['parent'] = declarator;
    mut(innerCall)['parent'] = pipeNode;
    expect(isInsideConstPipeWrapperAlias(importCtx('Effect'), innerCall, effects)).toBe(false);
  });

  it('returns false when the ancestor pipe parent is not a VariableDeclarator', () => {
    const innerCall = memberCall('Effect', 'succeed');
    const pipeNode = identCall('pipe', [innerCall]);
    mut(pipeNode)['parent'] = { type: 'ExpressionStatement', range: RANGE };
    mut(innerCall)['parent'] = pipeNode;
    expect(isInsideConstPipeWrapperAlias(importCtx('Effect'), innerCall, effects)).toBe(false);
  });

  it('returns false for a node inside a pipe alias assigned with let (not const)', () => {
    const innerCall = memberCall('Effect', 'succeed');
    const pipeNode = identCall('pipe', [innerCall]);
    const declarator = { type: 'VariableDeclarator', id: id('run'), init: pipeNode, range: RANGE };
    const declaration = {
      type: 'VariableDeclaration',
      kind: 'let',
      declarations: [declarator],
      range: RANGE,
    };
    mut(declarator)['parent'] = declaration;
    mut(pipeNode)['parent'] = declarator;
    mut(innerCall)['parent'] = pipeNode;
    expect(isInsideConstPipeWrapperAlias(importCtx('Effect'), innerCall, effects)).toBe(false);
  });

  it('returns false when the ancestor has no grandparent (null declaration)', () => {
    // Missing declaration links must keep the alias check false.
    const innerCall = memberCall('Effect', 'succeed');
    const pipeNode = identCall('pipe', [innerCall]);
    // The declarator intentionally has no parent, so the declaration lookup stops.
    const declarator = { type: 'VariableDeclarator', id: id('run'), init: pipeNode, range: RANGE };
    mut(pipeNode)['parent'] = declarator;
    mut(innerCall)['parent'] = pipeNode;
    expect(isInsideConstPipeWrapperAlias(importCtx('Effect'), innerCall, effects)).toBe(false);
  });
});
