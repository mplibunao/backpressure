import type { Context } from '@oxlint/plugins';
import { describe, expect, it, vi } from 'vitest';

import type { NodeLike } from './ast.js';
import { containsSideEffectCall, isSideEffectCall } from './side-effects.js';

vi.setConfig({ testTimeout: 1000 });

// ── Mock helpers ──────────────────────────────────────────────────────────────

// Range presence (not its value) satisfies the `'range' in value` check in isNodeLike
const RANGE: [number, number] = [0, 1];

const id = (name: string): NodeLike =>
  ({ type: 'Identifier', name, range: RANGE }) as unknown as NodeLike;

const memberCall = (obj: string, prop: string, args: readonly NodeLike[] = []): NodeLike =>
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

const identifierCall = (name: string): NodeLike =>
  ({
    type: 'CallExpression',
    callee: id(name),
    arguments: [],
    range: RANGE,
  }) as unknown as NodeLike;

// Context where the given names are resolved as namespace import bindings
const importCtx = (...names: string[]): Context => {
  const vars = new Map(names.map((varName) => [varName, { defs: [{ type: 'ImportBinding' }] }]));
  return {
    sourceCode: { getScope: () => ({ set: vars, upper: null }) },
  } as unknown as Context;
};

// Context where no variables are import bindings — isNamespaceImportReference always returns false
const bareCtx: Context = {
  sourceCode: { getScope: () => ({ set: new Map(), upper: null }) },
} as unknown as Context;

const effects = new Set(['Effect']);
const atoms = new Set(['Atom']);

// ── isSideEffectCall — true cases ─────────────────────────────────────────────

describe('side-effect call detection — true cases', () => {
  it('setState() identifies as a side effect', () => {
    expect(isSideEffectCall(bareCtx, identifierCall('setState'), effects, atoms)).toBe(true);
  });

  it('invalidate() identifies as a side effect', () => {
    expect(isSideEffectCall(bareCtx, identifierCall('invalidate'), effects, atoms)).toBe(true);
  });

  it('console.log() identifies as a side effect', () => {
    expect(isSideEffectCall(bareCtx, memberCall('console', 'log'), effects, atoms)).toBe(true);
  });

  it('console.warn() identifies as a side effect', () => {
    expect(isSideEffectCall(bareCtx, memberCall('console', 'warn'), effects, atoms)).toBe(true);
  });

  it('calling Atom.set(atom, value) identifies as a side effect when Atom is a namespace import', () => {
    const call = memberCall('Atom', 'set', [id('atom'), id('value')]);
    expect(isSideEffectCall(importCtx('Atom'), call, effects, atoms)).toBe(true);
  });

  it('calling Effect.log() identifies as a side effect when Effect is a namespace import', () => {
    expect(isSideEffectCall(importCtx('Effect'), memberCall('Effect', 'log'), effects, atoms)).toBe(
      true,
    );
  });

  it('calling Effect.logError() is a side effect — startsWith("log") covers all variants', () => {
    expect(
      isSideEffectCall(importCtx('Effect'), memberCall('Effect', 'logError'), effects, atoms),
    ).toBe(true);
  });
});

// ── isSideEffectCall — false cases ────────────────────────────────────────────

describe('side-effect call detection — false cases', () => {
  it('an Identifier node is not a side effect — type guard rejects non-CallExpressions', () => {
    expect(isSideEffectCall(bareCtx, id('setState'), effects, atoms)).toBe(false);
  });

  it('unknown identifier call is not a side effect', () => {
    // Only the known direct calls and static member calls count as side effects.
    expect(isSideEffectCall(bareCtx, identifierCall('dispatch'), effects, atoms)).toBe(false);
  });

  it('other.log() is not a side effect — objectName must be exactly "console"', () => {
    expect(isSideEffectCall(bareCtx, memberCall('other', 'log'), effects, atoms)).toBe(false);
  });

  it('calling Atom.set() without an import reference is not a side effect', () => {
    // Atom.set only counts when Atom resolves to an actual namespace import.
    const call = memberCall('Atom', 'set', [id('atom'), id('value')]);
    expect(isSideEffectCall(bareCtx, call, effects, atoms)).toBe(false);
  });

  it('the curried Atom.set(value) returns a function, so it is not a side effect', () => {
    const call = memberCall('Atom', 'set', [id('value')]);
    expect(isSideEffectCall(importCtx('Atom'), call, effects, atoms)).toBe(false);
  });

  it('calling Atom.get() is not a side effect — property must equal "set"', () => {
    // Namespace ownership alone is not enough; only Atom.set is treated as a side effect.
    expect(isSideEffectCall(importCtx('Atom'), memberCall('Atom', 'get'), effects, atoms)).toBe(
      false,
    );
  });

  it('calling Effect.debug() is not a side effect — method must start with "log"', () => {
    // Namespace ownership alone is not enough for Effect calls.
    // The Effect method must specifically be a log-style method.
    expect(
      isSideEffectCall(importCtx('Effect'), memberCall('Effect', 'debug'), effects, atoms),
    ).toBe(false);
  });

  it('calling Effect.log() without an import reference is not a side effect', () => {
    expect(isSideEffectCall(bareCtx, memberCall('Effect', 'log'), effects, atoms)).toBe(false);
  });
});

// ── containsSideEffectCall ────────────────────────────────────────────────────

describe('side-effect containment', () => {
  it('returns false for null input', () => {
    expect(containsSideEffectCall(bareCtx, null, effects, atoms)).toBe(false);
  });

  it('returns false when the node has no side-effect descendants', () => {
    const node = { type: 'ExpressionStatement', expression: id('x'), range: RANGE };
    expect(containsSideEffectCall(bareCtx, node, effects, atoms)).toBe(false);
  });

  it('returns true when the node itself is a side effect call', () => {
    // The root node itself must be checked before walking only its children.
    expect(containsSideEffectCall(bareCtx, identifierCall('setState'), effects, atoms)).toBe(true);
  });

  it('returns true when a descendant is a side effect call', () => {
    const node = {
      type: 'ExpressionStatement',
      expression: identifierCall('invalidate'),
      range: RANGE,
    };
    expect(containsSideEffectCall(bareCtx, node, effects, atoms)).toBe(true);
  });

  it('skips a function value, whose body runs only when it is called', () => {
    const arrow = {
      type: 'ArrowFunctionExpression',
      body: identifierCall('setState'),
      params: [],
      range: RANGE,
    };
    const call = { type: 'CallExpression', callee: id('later'), arguments: [arrow], range: RANGE };
    Object.assign(arrow, { parent: call });
    expect(containsSideEffectCall(bareCtx, arrow, effects, atoms)).toBe(false);
    expect(containsSideEffectCall(bareCtx, call, effects, atoms)).toBe(false);
  });

  it('skips an invoked generator body, whose code runs only when its iterator advances', () => {
    const body = memberCall('console', 'log');
    const generator = {
      type: 'FunctionExpression',
      generator: true,
      body,
      params: [],
      range: RANGE,
    };
    const call = { type: 'CallExpression', callee: generator, arguments: [], range: RANGE };
    Object.assign(generator, { parent: call });
    Object.assign(body, { parent: generator });
    expect(containsSideEffectCall(bareCtx, call, effects, atoms)).toBe(false);
  });

  it('enters the parameter defaults of an invoked generator, which run at the call', () => {
    const fallback = memberCall('console', 'log');
    const param = { type: 'AssignmentPattern', left: id('v'), right: fallback, range: RANGE };
    const body = { type: 'BlockStatement', body: [], range: RANGE };
    const generator = {
      type: 'FunctionExpression',
      generator: true,
      body,
      params: [param],
      range: RANGE,
    };
    const call = { type: 'CallExpression', callee: generator, arguments: [], range: RANGE };
    Object.assign(generator, { parent: call });
    Object.assign(body, { parent: generator });
    Object.assign(param, { parent: generator });
    expect(containsSideEffectCall(bareCtx, call, effects, atoms)).toBe(true);
  });

  it('enters a function invoked on the spot', () => {
    const arrow = {
      type: 'ArrowFunctionExpression',
      body: memberCall('console', 'log'),
      params: [],
      range: RANGE,
    };
    const iife = { type: 'CallExpression', callee: arrow, arguments: [], range: RANGE };
    Object.assign(arrow, { parent: iife });
    expect(containsSideEffectCall(bareCtx, iife, effects, atoms)).toBe(true);
  });

  it('preserves found=true after a subsequent non-side-effect descendant', () => {
    const node = {
      type: 'BlockStatement',
      body: [identifierCall('setState'), id('x')],
      range: RANGE,
    };
    expect(containsSideEffectCall(bareCtx, node, effects, atoms)).toBe(true);
  });
});
