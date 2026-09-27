import type { Context, ESTree } from '@oxlint/plugins';
import { describe, expect, it, vi } from 'vitest';

import type { IdentifierLike } from './ast.js';
import {
  collectImportNames,
  collectNamedImportNames,
  collectNamespaceImports,
  getImportSource,
  hasEffectStackImport,
  hasImportFrom,
  importSpecifierName,
  isNamespaceImportReference,
  isUnshadowedGlobal,
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

const prog = (...statements: ESTree.ImportDeclaration[]): ESTree.Program =>
  ({
    type: 'Program',
    body: statements,
    sourceType: 'module',
    range: RANGE,
  }) as unknown as ESTree.Program;

// Builds a program with arbitrary statement types — needed for non-import statement tests
const mixedProg = (body: unknown[]): ESTree.Program =>
  ({ type: 'Program', body, sourceType: 'module', range: RANGE }) as unknown as ESTree.Program;

const importCtx = (...names: string[]): Context => {
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

// ── hasEffectStackImport ──────────────────────────────────────────────────────

describe('hasEffectStackImport()', () => {
  it('returns true for a runtime import from the effect stack', () => {
    expect(hasEffectStackImport(prog(importDecl('effect', [nsSpecifier('Effect')])))).toBe(true);
  });

  it('returns false for a type-only import — runtime check excludes it', () => {
    // IsRuntimeImportDeclaration rejects `import type`, so a type-only import alone does not activate rules.
    expect(hasEffectStackImport(prog(importDecl('effect', [nsSpecifier('Effect')], 'type')))).toBe(
      false,
    );
  });

  it('returns false for a non-effect import', () => {
    expect(hasEffectStackImport(prog(importDecl('rxjs', [nsSpecifier('Rx')])))).toBe(false);
  });

  it.each(['@effect/atom-react', '@effect/atom-solid', '@effect/atom-vue'])(
    'returns true for a runtime import of the Atom binding %s',
    (source) => {
      expect(hasEffectStackImport(prog(importDecl(source, [nsSpecifier('AtomBinding')])))).toBe(
        true,
      );
    },
  );

  it('returns false for a type-only Atom binding import or another @effect package', () => {
    expect(
      hasEffectStackImport(prog(importDecl('@effect/atom-react', [nsSpecifier('A')], 'type'))),
    ).toBe(false);
    expect(hasEffectStackImport(prog(importDecl('@effect/vitest', [nsSpecifier('V')])))).toBe(
      false,
    );
  });

  it('returns false for the v3 @effect-atom/atom-react package', () => {
    expect(
      hasEffectStackImport(prog(importDecl('@effect-atom/atom-react', [nsSpecifier('A')]))),
    ).toBe(false);
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

// ── collectNamedImportNames ───────────────────────────────────────────────────

describe('collectNamedImportNames()', () => {
  it('collects named value imports and their aliases from the listed modules', () => {
    const program = prog(
      importDecl('effect/Function', [namedSpecifier('pipe', 'flow')]),
      importDecl('effect', [namedSpecifier('pipe')]),
    );
    expect(collectNamedImportNames(program, ['effect/Function', 'effect'], 'pipe')).toStrictEqual(
      new Set(['flow', 'pipe']),
    );
  });

  it('excludes namespace imports, which bind a module rather than the function', () => {
    const program = prog(importDecl('effect/Function', [nsSpecifier('pipe')]));
    expect(collectNamedImportNames(program, ['effect/Function'], 'pipe')).toStrictEqual(new Set());
  });

  it('excludes type-only specifiers, type-only declarations, and other modules', () => {
    const program = prog(
      importDecl('effect/Function', [namedSpecifier('pipe', 'typePipe', 'type')]),
      importDecl('effect/Function', [namedSpecifier('pipe', 'declPipe')], 'type'),
      importDecl('other', [namedSpecifier('pipe', 'otherPipe')]),
    );
    expect(collectNamedImportNames(program, ['effect/Function'], 'pipe')).toStrictEqual(new Set());
  });
});

// ── isUnshadowedGlobal ────────────────────────────────────────────────────────

describe('isUnshadowedGlobal()', () => {
  it('is true when no declaration resolves the name', () => {
    expect(isUnshadowedGlobal(bareCtx, ident('String'))).toBe(true);
  });

  it('is true for an implicit global variable without definitions', () => {
    expect(isUnshadowedGlobal(ctxWithDefs([]), ident('Effect'))).toBe(true);
  });

  it('is false when a local declaration shadows the global', () => {
    expect(isUnshadowedGlobal(ctxWithDefs([{ type: 'Variable' }]), ident('Effect'))).toBe(false);
  });
});
