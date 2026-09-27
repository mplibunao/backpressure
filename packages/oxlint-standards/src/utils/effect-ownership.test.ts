import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Context } from '@oxlint/plugins';
import { describe, expect, it, vi } from 'vitest';

import type { NodeLike } from './ast.js';
import { containsAnyBoundNamespaceCall } from './effect-ownership.js';

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

// ── Retired ownership helpers ─────────────────────────────────────────────────

// These helpers suppressed diagnostics on behalf of an owner that no longer reports the shape:
// dropped wrapper rules, any parent Effect call, or a variable-name guess. A guard that
// reintroduces one of them would hide real violations outside the ownership registry.
const retiredWrapperOwnershipHelpers = [
  'isConstPipeWrapperAliasSelf',
  'isDirectArgumentOfBoundEffectCall',
  'isEffectWrapperPipeExpression',
  'isErrorLikeName',
  'isInAnyWrapperOwnedExpression',
  'isInsideConstPipeWrapperAlias',
  'isInsideWrapperOwnedExpression',
  'isOwnedByFlatMapLadderEnabled',
  'isOwnedByGeneralEffectLadderRule',
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
