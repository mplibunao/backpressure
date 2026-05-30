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
    // Kills L18 ConditionalExpression→true: with that mutation, non-NodeLike input returns true
    // Also kills L18 LogicalOperator→||: || would let the type check run on non-NodeLike
    expect(isFunctionLike({ type: 'ArrowFunctionExpression' })).toBe(false);
  });

  it('returns false for a NodeLike with a non-function type', () => {
    // Kills L19 ConditionalExpression→true: mutation makes any NodeLike return true
    expect(isFunctionLike(id('x'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isFunctionLike(null)).toBe(false);
  });
});

// ── functionReturnNode ────────────────────────────────────────────────────────

describe('functionReturnNode()', () => {
  it('returns null for a non-function node', () => {
    // Kills L24 BlockStatement→{} (removes return null) and ConditionalExpression→false (skips guard)
    expect(functionReturnNode(id('x'))).toBeNull();
  });

  it('returns the expression body for an expression-bodied arrow', () => {
    const expr = memberCall('Effect', 'succeed');
    expect(
      functionReturnNode({ type: 'ArrowFunctionExpression', body: expr, params: [], range: RANGE }),
    ).toBe(expr);
  });

  it('returns null for a BlockStatement body with two statements', () => {
    // Kills L34 LogicalOperator→&&: with &&, a 2-stmt block passes the length check
    // Also kills L34:7 ConditionalExpression→false and L34:37→false and BlockStatement→{}
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
    // Kills L39 ConditionalExpression→true and LogicalOperator→||:
    // Mutations make the ternary pick the truthy branch, returning getNodeField(stmt, 'argument')
    // (ExpressionStatement has no argument) — undefined, not null, is caught by toBeNull()
    // Also kills L39:35 ConditionalExpression→true for the same reason
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
    // Kills L56 ConditionalExpression→true: mutation sets found=true on the first visit
    // So even an unbound call would return true without the check
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
    // Kills L98 ConditionalExpression→false (skips early return) and BlockStatement→{}
    expect(isEffectWrapperPipeExpression(bareCtx, null, effects)).toBe(false);
  });

  it('returns false for a NodeLike that is not a CallExpression', () => {
    // Kills L98 LogicalOperator→&& and L98:28 ConditionalExpression→false:
    // An Identifier is NodeLike, so && would require the type check; → false skips it
    expect(isEffectWrapperPipeExpression(bareCtx, id('x'), effects)).toBe(false);
  });

  it('returns false for a call with an identifier callee that is not "pipe"', () => {
    // Kills L102 LogicalOperator→&& and ConditionalExpression→false:
    // Must use importCtx — with bareCtx the function returns false even after skipping the guard
    // (isNamespaceImportReference returns false), so the mutation would be undetectable.
    expect(
      isEffectWrapperPipeExpression(
        importCtx('Effect'),
        identCall('map', [memberCall('Effect', 'succeed')]),
        effects,
      ),
    ).toBe(false);
  });

  it('returns false for a NodeLike with non-CallExpression type that carries a pipe-like callee', () => {
    // Kills L98 ConditionalExpression→false x2 and BlockStatement→{}:
    // Unlike id('x'), this fake node has callee=id('pipe') and matching arguments.
    // Skipping the L98 type guard (mutation) lets subsequent checks pass and return true instead of false.
    const fakeNode = {
      type: 'PipeStatement',
      callee: id('pipe'),
      arguments: [memberCall('Effect', 'succeed')],
      range: RANGE,
    };
    expect(isEffectWrapperPipeExpression(importCtx('Effect'), fakeNode, effects)).toBe(false);
  });

  it('returns false for pipe() called with no arguments', () => {
    // Exercises NoCoverage at L106: firstArg is undefined (not NodeLike) → return false
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
    // The firstArg callee is identifier 'fn', so getStaticMemberCall(firstArg) → null (call is null).
    // The || containsAnyBoundNamespaceCall branch finds Effect.succeed inside.
    // Kills L111 ConditionalExpression→false: that mutation removes the fallback branch entirely.
    const firstArg = identCall('fn', [memberCall('Effect', 'succeed')]);
    expect(
      isEffectWrapperPipeExpression(importCtx('Effect'), identCall('pipe', [firstArg]), effects),
    ).toBe(true);
  });
});

// ── isReturnedFromNamedWrapperDeclaration ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- building parent chains
const mut = (node: unknown): Record<string, unknown> => node as Record<string, unknown>;

// Builds arrow → declarator → declaration chain with parent links pre-wired.
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
    // Exercises VariableDeclarator path through L71, L79, L83, L85–L89 all in the true branch.
    const expr = memberCall('Effect', 'succeed');
    const { arrow } = arrowChain(expr);
    mut(expr)['parent'] = arrow;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(true);
  });

  it('returns true for a node returned from a named FunctionDeclaration', () => {
    // Exercises the FunctionDeclaration ancestor path (L66–L69).
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
    // Kills L89 EqualityOperator→!==: mutation flips the identity check, returning true when it shouldn't
    const expr = memberCall('Effect', 'succeed');
    const { arrow } = arrowChain(memberCall('Effect', 'map'));
    mut(expr)['parent'] = arrow;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(false);
  });

  it('returns false for a let (non-const) declaration wrapper', () => {
    // Kills L85:7 / L86:7 ConditionalExpression→true: kind check is load-bearing
    const expr = memberCall('Effect', 'succeed');
    const { arrow } = arrowChain(expr, 'let');
    mut(expr)['parent'] = arrow;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(false);
  });

  it('returns false for a block-bodied arrow (not expression-bodied)', () => {
    // Kills L79:27 ConditionalExpression→true and L83 ConditionalExpression→true:
    // Mutations treat block bodies as expression bodies, passing the isExpressionBodiedArrowInit check
    const expr = memberCall('Effect', 'succeed');
    const body = blockStmt(returnStmt(expr));
    const { arrow } = arrowChain(body);
    mut(body)['parent'] = arrow;
    mut(expr)['parent'] = body;
    expect(isReturnedFromNamedWrapperDeclaration(expr)).toBe(false);
  });

  it('returns false for a VariableDeclarator without a named id', () => {
    // Kills L71 LogicalOperator→&&: with &&, a missing id passes the OR condition
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
    // Kills L148 ConditionalExpression→false, LogicalOperator→&&, and L148:30 ConditionalExpression→false
    const pipeNode = identCall('pipe', [memberCall('Effect', 'succeed')]);
    mut(pipeNode)['parent'] = { type: 'ExpressionStatement', range: RANGE };
    expect(isConstPipeWrapperAliasSelf(importCtx('Effect'), pipeNode, effects)).toBe(false);
  });

  it('returns false when the node is not the init of its parent declarator', () => {
    // Exercises NoCoverage at L151: getNodeField(parent, 'init') !== node path
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
    // Kills L158 ConditionalExpression→true: kind === 'const' is the distinguishing check
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
    // Exercises NoCoverage at L130: getNodeField(ancestorParent, 'init') !== ancestor path
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
    // Kills L127 ConditionalExpression→false, L127:40 ConditionalExpression→false, BlockStatement→{}
    const innerCall = memberCall('Effect', 'succeed');
    const pipeNode = identCall('pipe', [innerCall]);
    mut(pipeNode)['parent'] = { type: 'ExpressionStatement', range: RANGE };
    mut(innerCall)['parent'] = pipeNode;
    expect(isInsideConstPipeWrapperAlias(importCtx('Effect'), innerCall, effects)).toBe(false);
  });

  it('returns false for a node inside a pipe alias assigned with let (not const)', () => {
    // Kills L137 ConditionalExpression→true: kind === 'const' is load-bearing
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
    // Kills L135 ConditionalExpression→true: isNodeLike(null) = false, so the return should be false;
    // Mutation replaces the whole condition with true and returns true instead
    const innerCall = memberCall('Effect', 'succeed');
    const pipeNode = identCall('pipe', [innerCall]);
    // Declarator has no parent set → getNodeField(declarator, 'parent') = undefined → not NodeLike
    const declarator = { type: 'VariableDeclarator', id: id('run'), init: pipeNode, range: RANGE };
    mut(pipeNode)['parent'] = declarator;
    mut(innerCall)['parent'] = pipeNode;
    expect(isInsideConstPipeWrapperAlias(importCtx('Effect'), innerCall, effects)).toBe(false);
  });
});
