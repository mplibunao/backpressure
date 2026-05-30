/* eslint-disable vitest/prefer-to-be-falsy, vitest/prefer-to-be-truthy --
   vitest/prefer-strict-boolean-matchers takes precedence for boolean-typed return values. */
import type { Context } from '@oxlint/plugins';
import { describe, expect, it, vi } from 'vitest';

import type { NodeLike } from './ast.js';
import { containsSideEffectCall, isSideEffectCall } from './side-effects.js';

vi.setConfig({ testTimeout: 1000 });

// ── Mock helpers ──────────────────────────────────────────────────────────────

// Range presence (not its value) satisfies the `'range' in value` check in isNodeLike
const RANGE: [number, number] = [0, 1];

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion --
   Mock helpers intentionally provide only the properties exercised by the code under test. */

const id = (name: string): NodeLike =>
  ({ type: 'Identifier', name, range: RANGE }) as unknown as NodeLike;

const memberCall = (obj: string, prop: string): NodeLike =>
  ({
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      computed: false,
      object: id(obj),
      property: id(prop),
      range: RANGE,
    },
    arguments: [],
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
const importCtx = (...names: Array<string>): Context => {
  const vars = new Map(names.map((varName) => [varName, { defs: [{ type: 'ImportBinding' }] }]));
  return {
    sourceCode: { getScope: () => ({ set: vars, upper: null }) },
  } as unknown as Context;
};

// Context where no variables are import bindings — isNamespaceImportReference always returns false
const bareCtx: Context = {
  sourceCode: { getScope: () => ({ set: new Map(), upper: null }) },
} as unknown as Context;

/* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

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

  it('calling Atom.set() identifies as a side effect when Atom is a namespace import', () => {
    expect(isSideEffectCall(importCtx('Atom'), memberCall('Atom', 'set'), effects, atoms)).toBe(
      true,
    );
  });

  it('calling Effect.log() identifies as a side effect when Effect is a namespace import', () => {
    expect(isSideEffectCall(importCtx('Effect'), memberCall('Effect', 'log'), effects, atoms)).toBe(
      true,
    );
  });

  it('calling Effect.logError() is a side effect — startsWith("log") covers all variants', () => {
    // Kills the StringLiteral→"" survivor: startsWith("") is always true, breaking specificity
    expect(
      isSideEffectCall(importCtx('Effect'), memberCall('Effect', 'logError'), effects, atoms),
    ).toBe(true);
  });
});

// ── isSideEffectCall — false cases ────────────────────────────────────────────

describe('side-effect call detection — false cases', () => {
  it('an Identifier node is not a side effect — type guard rejects non-CallExpressions', () => {
    // Kills ConditionalExpression→false and BlockStatement→{} survivors on the type guard
    expect(isSideEffectCall(bareCtx, id('setState'), effects, atoms)).toBe(false);
  });

  it('unknown identifier call is not a side effect — exercises the null StaticMemberCall path', () => {
    // An identifier callee that is not setState/invalidate falls through to getStaticMemberCall.
    // Null result exercises the `if (call === null) { return false }` branch.
    expect(isSideEffectCall(bareCtx, identifierCall('dispatch'), effects, atoms)).toBe(false);
  });

  it('other.log() is not a side effect — objectName must be exactly "console"', () => {
    expect(isSideEffectCall(bareCtx, memberCall('other', 'log'), effects, atoms)).toBe(false);
  });

  it('calling Atom.set() without an import reference is not a side effect', () => {
    // The isNamespaceImportReference && is load-bearing; bareCtx has no import bindings
    expect(isSideEffectCall(bareCtx, memberCall('Atom', 'set'), effects, atoms)).toBe(false);
  });

  it('calling Atom.get() is not a side effect — property must equal "set"', () => {
    // Kills ConditionalExpression→true on `propertyName === "set"`: with that mutation the
    // && collapses to only the namespace check, which is true here, so the result would flip.
    expect(isSideEffectCall(importCtx('Atom'), memberCall('Atom', 'get'), effects, atoms)).toBe(
      false,
    );
  });

  it('calling Effect.debug() is not a side effect — method must start with "log"', () => {
    // Kills LogicalOperator→|| and StringLiteral→"" survivors:
    // With ||, the namespace check is true here and flips the result.
    // With startsWith(""), "debug" starts with "", also flipping the result.
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
    // Kills BooleanLiteral→true (found stays true, walkDescendants is a no-op → returns true).
    // And ConditionalExpression→true on isNodeLike (isSideEffectCall(ctx, null) throws).
    expect(containsSideEffectCall(bareCtx, null, effects, atoms)).toBe(false);
  });

  it('returns false when the node has no side-effect descendants', () => {
    const node = { type: 'ExpressionStatement', expression: id('x'), range: RANGE };
    expect(containsSideEffectCall(bareCtx, node, effects, atoms)).toBe(false);
  });

  it('returns true when the node itself is a side effect call', () => {
    // Kills removal of the isNodeLike block: walkDescendants would only see the callee
    // Identifier (not a CallExpression) and return false.
    expect(containsSideEffectCall(bareCtx, identifierCall('setState'), effects, atoms)).toBe(true);
  });

  it('returns true when a descendant is a side effect call', () => {
    // Kills removal of the walkDescendants call
    const node = {
      type: 'ExpressionStatement',
      expression: identifierCall('invalidate'),
      range: RANGE,
    };
    expect(containsSideEffectCall(bareCtx, node, effects, atoms)).toBe(true);
  });

  it('preserves found=true after a subsequent non-side-effect descendant', () => {
    // Kills `found = found || X` → `found = X`: walkDescendants visits the callee Identifier
    // After the setState call; that visit returns false and would reset found without the ||.
    const node = {
      type: 'BlockStatement',
      body: [identifierCall('setState'), id('x')],
      range: RANGE,
    };
    expect(containsSideEffectCall(bareCtx, node, effects, atoms)).toBe(true);
  });
});
