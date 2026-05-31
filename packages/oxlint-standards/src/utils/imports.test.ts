/* eslint-disable vitest/prefer-to-be-falsy, vitest/prefer-to-be-truthy --
   vitest/prefer-strict-boolean-matchers takes precedence for boolean-typed return values. */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion --
   Mock helpers intentionally provide only the properties exercised by the code under test. */
import type { Context, ESTree } from '@oxlint/plugins';
import { describe, expect, it, vi } from 'vitest';

import type { IdentifierLike } from './ast.js';
import {
  collectEffectNamespaceImports,
  collectImportNames,
  collectNamespaceImports,
  getImportSource,
  hasEffectStackImport,
  hasEffectTypeOrRuntimeImport,
  hasImportFrom,
  importSpecifierName,
  isEffectNamespaceImportReference,
  isNamespaceImportReference,
} from './imports.js';

vi.setConfig({ testTimeout: 1000 });

const RANGE: [number, number] = [0, 1];

const literal = (value: string) => ({ type: 'Literal', value, raw: `'${value}'`, range: RANGE });
const ident = (name: string): IdentifierLike =>
  ({ type: 'Identifier', name, range: RANGE }) as unknown as IdentifierLike;

const nsSpecifier = (local: string): ESTree.ImportNamespaceSpecifier =>
  ({
    type: 'ImportNamespaceSpecifier',
    local: ident(local),
    range: RANGE,
  }) as unknown as ESTree.ImportNamespaceSpecifier;

const namedSpecifier = (
  importedName: string,
  localName = importedName,
  importKind: 'value' | 'type' = 'value',
): ESTree.ImportSpecifier =>
  ({
    type: 'ImportSpecifier',
    imported: ident(importedName),
    local: ident(localName),
    importKind,
    range: RANGE,
  }) as unknown as ESTree.ImportSpecifier;

const namedStringSpecifier = (importedName: string, localName: string): ESTree.ImportSpecifier =>
  ({
    type: 'ImportSpecifier',
    imported: literal(importedName),
    local: ident(localName),
    importKind: 'value',
    range: RANGE,
  }) as unknown as ESTree.ImportSpecifier;

const importDecl = (
  source: string,
  specifiers: Array<
    ESTree.ImportNamespaceSpecifier | ESTree.ImportSpecifier | ESTree.ImportDefaultSpecifier
  > = [],
  importKind: 'value' | 'type' = 'value',
): ESTree.ImportDeclaration =>
  ({
    type: 'ImportDeclaration',
    source: literal(source),
    specifiers,
    importKind,
    range: RANGE,
  }) as unknown as ESTree.ImportDeclaration;

const prog = (...statements: Array<ESTree.ImportDeclaration>): ESTree.Program =>
  ({
    type: 'Program',
    body: statements,
    sourceType: 'module',
    range: RANGE,
  }) as unknown as ESTree.Program;

// Builds a program with arbitrary statement types — needed for non-import statement tests
const mixedProg = (body: Array<unknown>): ESTree.Program =>
  ({ type: 'Program', body, sourceType: 'module', range: RANGE }) as unknown as ESTree.Program;

const importCtx = (...names: Array<string>): Context => {
  const vars = new Map(names.map((varName) => [varName, { defs: [{ type: 'ImportBinding' }] }]));
  return { sourceCode: { getScope: () => ({ set: vars, upper: null }) } } as unknown as Context;
};

const bareCtx: Context = {
  sourceCode: { getScope: () => ({ set: new Map(), upper: null }) },
} as unknown as Context;

// Creates a context where the identifier 'Effect' has a specific set of defs in scope
const ctxWithDefs = (defs: Array<{ type: string }>): Context =>
  ({
    sourceCode: { getScope: () => ({ set: new Map([['Effect', { defs }]]), upper: null }) },
  }) as unknown as Context;

// Context where Effect lives in the parent scope rather than the immediate scope
const parentScopeCtx: Context = {
  sourceCode: {
    getScope: () => ({
      set: new Map(),
      upper: { set: new Map([['Effect', { defs: [{ type: 'ImportBinding' }] }]]), upper: null },
    }),
  },
} as unknown as Context;

/* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

// ── getImportSource ───────────────────────────────────────────────────────────

describe('getImportSource()', () => {
  it('returns the string value when source is a string literal', () => {
    expect(getImportSource({ source: literal('effect') })).toBe('effect');
  });

  it('returns null when source value is not a string', () => {
    expect(getImportSource({ source: { type: 'Literal', value: 42 } })).toBeNull();
  });
});

// ── importSpecifierName ───────────────────────────────────────────────────────

describe('importSpecifierName()', () => {
  it('returns name when imported is an Identifier', () => {
    expect(importSpecifierName(namedSpecifier('pipe'))).toBe('pipe');
  });

  it('returns string value when imported is a string literal', () => {
    expect(importSpecifierName(namedStringSpecifier('default', 'myDefault'))).toBe('default');
  });
});

// ── collectImportNames — namespace specifiers ─────────────────────────────────

describe('collectImportNames() — namespace specifiers', () => {
  it('collects namespace specifier local name for matching module', () => {
    expect(
      collectImportNames(prog(importDecl('effect', [nsSpecifier('Effect')])), ['effect']),
    ).toStrictEqual(new Set(['Effect']));
  });

  it('skips top-level type-only import declarations', () => {
    // Top-level importKind 'type' triggers the outer continue guard
    expect(
      collectImportNames(prog(importDecl('effect', [nsSpecifier('Effect')], 'type')), ['effect']),
    ).toStrictEqual(new Set());
  });

  it('skips non-matching module specifiers', () => {
    expect(
      collectImportNames(prog(importDecl('rxjs', [nsSpecifier('Rx')])), ['effect']),
    ).toStrictEqual(new Set());
  });

  it('for effect barrel with null importedName: includes all namespace aliases', () => {
    // A null imported-name filter means every namespace alias from the source is accepted.
    expect(
      collectImportNames(prog(importDecl('effect', [nsSpecifier('Option')])), ['effect'], null),
    ).toStrictEqual(new Set(['Option']));
  });

  it('for effect barrel: excludes namespace alias that does not match importedName', () => {
    // Alias 'Option' from the 'effect' barrel should NOT be collected when importedName is 'Effect'
    expect(
      collectImportNames(prog(importDecl('effect', [nsSpecifier('Option')])), ['effect'], 'Effect'),
    ).toStrictEqual(new Set());
  });

  it('for effect barrel: includes namespace alias that matches importedName', () => {
    expect(
      collectImportNames(prog(importDecl('effect', [nsSpecifier('Effect')])), ['effect'], 'Effect'),
    ).toStrictEqual(new Set(['Effect']));
  });

  it('for non-barrel (effect/Effect): includes namespace alias regardless of importedName', () => {
    // Non-barrel source: isEffectBarrel is false, so the alias filter does not apply
    expect(
      collectImportNames(
        prog(importDecl('effect/Effect', [nsSpecifier('E')])),
        ['effect/Effect'],
        'Effect',
      ),
    ).toStrictEqual(new Set(['E']));
  });
});

// ── collectImportNames — named specifiers ─────────────────────────────────────

describe('collectImportNames() — named specifiers', () => {
  it('collects named specifier local name when importedName matches', () => {
    expect(
      collectImportNames(
        prog(importDecl('effect', [namedSpecifier('pipe', 'myPipe')])),
        ['effect'],
        'pipe',
      ),
    ).toStrictEqual(new Set(['myPipe']));
  });

  it('excludes named specifier when importedName does not match', () => {
    expect(
      collectImportNames(prog(importDecl('effect', [namedSpecifier('map')])), ['effect'], 'pipe'),
    ).toStrictEqual(new Set());
  });

  it('excludes type-only named specifiers even when importedName matches', () => {
    // Type-only specifiers must not activate runtime import detection.
    expect(
      collectImportNames(
        prog(importDecl('effect', [namedSpecifier('Effect', 'Effect', 'type')])),
        ['effect'],
        'Effect',
      ),
    ).toStrictEqual(new Set());
  });

  it('returns empty set when no specifiers match', () => {
    expect(
      collectImportNames(prog(importDecl('effect', [namedSpecifier('pipe')])), ['effect'], null),
    ).toStrictEqual(new Set());
  });
});

// ── collectNamespaceImports ───────────────────────────────────────────────────

describe('collectNamespaceImports()', () => {
  it('collects namespace import local name for matching module', () => {
    const decl = prog(importDecl('effect/Effect', [nsSpecifier('Effect')]));
    expect(collectNamespaceImports(decl, ['effect/Effect'])).toStrictEqual(new Set(['Effect']));
  });

  it('skips type-only import declarations (isRuntimeImportDeclaration gate)', () => {
    const decl = prog(importDecl('effect/Effect', [nsSpecifier('Effect')], 'type'));
    expect(collectNamespaceImports(decl, ['effect/Effect'])).toStrictEqual(new Set());
  });

  it('skips imports where all specifiers are type-only named specifiers', () => {
    // Only type-only ImportSpecifier nodes present — isRuntimeImportDeclaration returns false
    expect(
      collectNamespaceImports(
        prog(importDecl('effect', [namedSpecifier('Effect', 'Effect', 'type')])),
        ['effect'],
      ),
    ).toStrictEqual(new Set());
  });

  it('skips non-matching module specifiers', () => {
    expect(
      collectNamespaceImports(prog(importDecl('rxjs', [nsSpecifier('Rx')])), ['effect']),
    ).toStrictEqual(new Set());
  });

  it('with barrelFilterName: excludes barrel alias that does not match filter', () => {
    // Barrel alias 'Option' with filter 'Effect' — alias does not match, so excluded
    expect(
      collectNamespaceImports(
        prog(importDecl('effect', [nsSpecifier('Option')])),
        ['effect'],
        'Effect',
      ),
    ).toStrictEqual(new Set());
  });

  it('with barrelFilterName: includes barrel alias that matches filter', () => {
    expect(
      collectNamespaceImports(
        prog(importDecl('effect', [nsSpecifier('Effect')])),
        ['effect'],
        'Effect',
      ),
    ).toStrictEqual(new Set(['Effect']));
  });

  it('with barrelFilterName: includes non-barrel alias regardless of filter', () => {
    // Non-barrel source 'effect/Effect': the filter condition is skipped entirely
    expect(
      collectNamespaceImports(
        prog(importDecl('effect/Effect', [nsSpecifier('E')])),
        ['effect/Effect'],
        'Effect',
      ),
    ).toStrictEqual(new Set(['E']));
  });

  it('collects from multiple declarations', () => {
    expect(
      collectNamespaceImports(
        prog(
          importDecl('effect', [nsSpecifier('Effect')]),
          importDecl('effect/Effect', [nsSpecifier('E')]),
        ),
        ['effect', 'effect/Effect'],
      ),
    ).toStrictEqual(new Set(['Effect', 'E']));
  });
});

// ── collectEffectNamespaceImports ─────────────────────────────────────────────

describe('collectEffectNamespaceImports()', () => {
  it('collects Effect-aliased namespace import from effect barrel', () => {
    expect(
      collectEffectNamespaceImports(prog(importDecl('effect', [nsSpecifier('Effect')]))),
    ).toStrictEqual(new Set(['Effect']));
  });

  it('excludes Option-aliased namespace import from effect barrel', () => {
    // Filter 'Effect' is set — alias 'Option' does not match, so excluded
    expect(
      collectEffectNamespaceImports(prog(importDecl('effect', [nsSpecifier('Option')]))),
    ).toStrictEqual(new Set());
  });

  it('collects any alias from effect/Effect submodule (filter does not apply to non-barrel)', () => {
    expect(
      collectEffectNamespaceImports(prog(importDecl('effect/Effect', [nsSpecifier('E')]))),
    ).toStrictEqual(new Set(['E']));
  });
});

// ── isRuntimeImportDeclaration boundary (some vs every) ──────────────────────

// Private function exercised through collectNamespaceImports and hasImportFrom.
describe('isRuntimeImportDeclaration boundary (some vs every)', () => {
  it('returns true when at least one specifier is a runtime value import', () => {
    // One runtime specifier is enough for the declaration to count as a runtime import.
    const decl = prog(
      importDecl('effect', [namedSpecifier('TypeA', 'TypeA', 'type'), namedSpecifier('Val')]),
    );
    expect(hasImportFrom(decl, ['effect'])).toBe(true);
  });
});

// ── hasImportFrom ─────────────────────────────────────────────────────────────

describe('hasImportFrom()', () => {
  it('returns true when a runtime import from a matching specifier exists', () => {
    expect(hasImportFrom(prog(importDecl('effect', [nsSpecifier('Effect')])), ['effect'])).toBe(
      true,
    );
  });

  it('returns true for a side-effect-only import (no specifiers)', () => {
    // Specifiers length is 0 — isRuntimeImportDeclaration returns true
    expect(hasImportFrom(prog(importDecl('effect', [])), ['effect'])).toBe(true);
  });

  it('returns false when only a type-only declaration import exists', () => {
    const decl = prog(importDecl('effect', [nsSpecifier('Effect')], 'type'));
    expect(hasImportFrom(decl, ['effect'])).toBe(false);
  });

  it('returns false when all specifiers are type-only named specifiers', () => {
    // No namespace/default specifiers; all ImportSpecifier type-only — isRuntimeImportDeclaration returns false
    const decl = prog(importDecl('effect', [namedSpecifier('Effect', 'Effect', 'type')]));
    expect(hasImportFrom(decl, ['effect'])).toBe(false);
  });

  it('returns false when no imports match the specifiers', () => {
    expect(hasImportFrom(prog(importDecl('rxjs', [nsSpecifier('Rx')])), ['effect'])).toBe(false);
  });

  it('returns false for an empty program', () => {
    expect(hasImportFrom(prog(), ['effect'])).toBe(false);
  });

  it('returns false for a program containing only non-import statements', () => {
    expect(
      hasImportFrom(mixedProg([{ type: 'ExpressionStatement', range: RANGE }]), ['effect']),
    ).toBe(false);
  });
});

// ── hasEffectTypeOrRuntimeImport ──────────────────────────────────────────────

describe('hasEffectTypeOrRuntimeImport()', () => {
  it('returns true for a runtime import from effect', () => {
    expect(hasEffectTypeOrRuntimeImport(prog(importDecl('effect', [nsSpecifier('Effect')])))).toBe(
      true,
    );
  });

  it('returns true for a type-only import from the effect stack', () => {
    // Type imports are included — the key distinction from hasEffectStackImport
    expect(
      hasEffectTypeOrRuntimeImport(prog(importDecl('effect', [nsSpecifier('Effect')], 'type'))),
    ).toBe(true);
  });

  it('returns true for an effect submodule import', () => {
    expect(
      hasEffectTypeOrRuntimeImport(prog(importDecl('effect/Effect', [nsSpecifier('Effect')]))),
    ).toBe(true);
  });

  it('returns false for a non-effect import', () => {
    expect(hasEffectTypeOrRuntimeImport(prog(importDecl('rxjs', [nsSpecifier('Rx')])))).toBe(false);
  });

  it('returns false for a program containing only non-import statements', () => {
    expect(
      hasEffectTypeOrRuntimeImport(mixedProg([{ type: 'ExpressionStatement', range: RANGE }])),
    ).toBe(false);
  });
});

// ── hasEffectStackImport ──────────────────────────────────────────────────────

describe('hasEffectStackImport()', () => {
  it('returns true for a runtime import from the effect stack', () => {
    expect(hasEffectStackImport(prog(importDecl('effect', [nsSpecifier('Effect')])))).toBe(true);
  });

  it('returns false for a type-only import — runtime check excludes it', () => {
    // Same input returns true for hasEffectTypeOrRuntimeImport — isRuntimeImportDeclaration
    // Is the differentiating condition here
    expect(hasEffectStackImport(prog(importDecl('effect', [nsSpecifier('Effect')], 'type')))).toBe(
      false,
    );
  });

  it('returns false for a non-effect import', () => {
    expect(hasEffectStackImport(prog(importDecl('rxjs', [nsSpecifier('Rx')])))).toBe(false);
  });
});

// ── isNamespaceImportReference ────────────────────────────────────────────────

describe('isNamespaceImportReference()', () => {
  it('returns true when name is in namespaceNames and resolves to an import binding', () => {
    expect(
      isNamespaceImportReference(importCtx('Effect'), ident('Effect'), new Set(['Effect'])),
    ).toBe(true);
  });

  it('returns false when name is not in namespaceNames', () => {
    expect(isNamespaceImportReference(importCtx('Foo'), ident('Foo'), new Set(['Effect']))).toBe(
      false,
    );
  });

  it('returns false when variable is not found in scope chain', () => {
    expect(isNamespaceImportReference(bareCtx, ident('Effect'), new Set(['Effect']))).toBe(false);
  });

  it('returns false when variable exists but has no ImportBinding definition', () => {
    expect(
      isNamespaceImportReference(
        ctxWithDefs([{ type: 'Variable' }]),
        ident('Effect'),
        new Set(['Effect']),
      ),
    ).toBe(false);
  });

  it('returns true when the variable has at least one ImportBinding def among mixed definitions', () => {
    expect(
      isNamespaceImportReference(
        ctxWithDefs([{ type: 'ImportBinding' }, { type: 'Variable' }]),
        ident('Effect'),
        new Set(['Effect']),
      ),
    ).toBe(true);
  });

  it('resolves variable from an upper (parent) scope', () => {
    // Namespace references must resolve through parent scopes, not just the immediate scope.
    expect(isNamespaceImportReference(parentScopeCtx, ident('Effect'), new Set(['Effect']))).toBe(
      true,
    );
  });
});

// ── isEffectNamespaceImportReference ─────────────────────────────────────────

describe('isEffectNamespaceImportReference()', () => {
  it('returns true for a bound import reference', () => {
    expect(
      isEffectNamespaceImportReference(importCtx('Effect'), ident('Effect'), new Set(['Effect'])),
    ).toBe(true);
  });

  it('returns false when name is not in the namespace set', () => {
    expect(
      isEffectNamespaceImportReference(importCtx('Foo'), ident('Foo'), new Set(['Effect'])),
    ).toBe(false);
  });
});
