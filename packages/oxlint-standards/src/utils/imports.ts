import type { Context, ESTree, Scope, Variable } from '@oxlint/plugins';

import { getStringLiteralValue, isIdentifierName, type IdentifierLike } from './ast.js';
import {
  effectNamespaceModuleSpecifiers,
  isEffectStackModuleSource,
} from './effect-identifiers.js';

const isRuntimeImportDeclaration = (declaration: ESTree.ImportDeclaration): boolean => {
  if (declaration.importKind === 'type') {
    return false;
  }

  return (
    declaration.specifiers.length === 0 ||
    declaration.specifiers.some(
      (specifier) => specifier.type !== 'ImportSpecifier' || specifier.importKind !== 'type',
    )
  );
};

const addNamespaceSpecifiers = (
  namespaceNames: Set<string>,
  declaration: ESTree.ImportDeclaration,
  source: string,
  barrelFilterName: string | null = null,
): void => {
  if (!isRuntimeImportDeclaration(declaration)) {
    return;
  }

  for (const specifier of declaration.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier' && isIdentifierName(specifier.local)) {
      // For the 'effect' barrel, only include a namespace alias when it matches barrelFilterName.
      // Prevents Option/Match/etc. barrel aliases from being added to Effect namespace sets.
      const isEffectBarrel = source === 'effect';
      const matchesRequestedAlias = specifier.local.name === barrelFilterName;
      if (!isEffectBarrel || barrelFilterName === null || matchesRequestedAlias) {
        namespaceNames.add(specifier.local.name);
      }
    }
  }
};

const findVariable = (scope: Scope | null, name: string): Variable | null => {
  let currentScope = scope;

  while (currentScope !== null) {
    const variable = currentScope.set.get(name);

    if (typeof variable !== 'undefined') {
      return variable;
    }

    currentScope = currentScope.upper;
  }

  return null;
};

const hasImportBindingDefinition = (variable: Variable): boolean =>
  variable.defs.some((definition) => definition.type === 'ImportBinding');

export const getImportSource = (declaration: { readonly source: unknown }): string | null =>
  getStringLiteralValue(declaration.source);

export const importSpecifierName = (specifier: ESTree.ImportSpecifier): string | null => {
  const { imported } = specifier;
  if (isIdentifierName(imported)) {
    return imported.name;
  }

  return getStringLiteralValue(imported);
};

// Processes one import specifier and adds the matching local name to the set.
// For namespace imports from the 'effect' barrel, only the alias that matches importedName
// is accepted, keeping Option/Match/etc. aliases out of Effect name sets.
const collectSpecifierName = (
  names: Set<string>,
  specifier: ESTree.ImportDeclaration['specifiers'][number],
  source: string,
  importedName: string | null,
): void => {
  if (specifier.type === 'ImportNamespaceSpecifier' && isIdentifierName(specifier.local)) {
    const isEffectBarrel = source === 'effect';
    if (!isEffectBarrel || importedName === null || specifier.local.name === importedName) {
      names.add(specifier.local.name);
    }
  }
  if (
    specifier.type === 'ImportSpecifier' &&
    specifier.importKind !== 'type' &&
    importedName !== null &&
    isIdentifierName(specifier.local) &&
    importSpecifierName(specifier) === importedName
  ) {
    names.add(specifier.local.name);
  }
};

export const collectImportNames = (
  program: ESTree.Program,
  moduleSpecifiers: readonly string[],
  importedName: string | null = null,
): Set<string> => {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration' && statement.importKind !== 'type') {
      const source = getImportSource(statement);
      if (source !== null && moduleSpecifiers.includes(source)) {
        for (const specifier of statement.specifiers) {
          collectSpecifierName(names, specifier, source, importedName);
        }
      }
    }
  }
  return names;
};

export const collectNamespaceImports = (
  program: ESTree.Program,
  moduleSpecifiers: readonly string[],
  barrelFilterName: string | null = null,
): Set<string> => {
  const namespaceNames = new Set<string>();

  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      const source = getImportSource(statement);

      if (
        source !== null &&
        moduleSpecifiers.includes(source) &&
        isRuntimeImportDeclaration(statement)
      ) {
        addNamespaceSpecifiers(namespaceNames, statement, source, barrelFilterName);
      }
    }
  }

  return namespaceNames;
};

export const collectEffectNamespaceImports = (program: ESTree.Program): Set<string> =>
  // Only include barrel 'effect' namespace imports whose local alias is 'Effect'.
  // This prevents Option/Match/etc. barrel aliases being added to the Effect namespace set.
  collectNamespaceImports(program, effectNamespaceModuleSpecifiers, 'Effect');

export const hasImportFrom = (
  program: ESTree.Program,
  moduleSpecifiers: readonly string[],
): boolean =>
  program.body.some((statement) => {
    if (statement.type !== 'ImportDeclaration') {
      return false;
    }

    const source = getImportSource(statement);
    return (
      source !== null && moduleSpecifiers.includes(source) && isRuntimeImportDeclaration(statement)
    );
  });

export const hasEffectTypeOrRuntimeImport = (program: ESTree.Program): boolean =>
  // Matches any import from the effect stack, including type-only imports.
  // Used by type-modeling rules that must fire even with `import type`.
  program.body.some((statement) => {
    if (statement.type !== 'ImportDeclaration') {
      return false;
    }
    const source = getImportSource(statement);
    return source !== null && isEffectStackModuleSource(source);
  });

export const hasEffectStackImport = (program: ESTree.Program): boolean =>
  program.body.some((statement) => {
    if (statement.type !== 'ImportDeclaration') {
      return false;
    }

    const source = getImportSource(statement);
    return (
      source !== null && isEffectStackModuleSource(source) && isRuntimeImportDeclaration(statement)
    );
  });

export const isNamespaceImportReference = (
  context: Context,
  identifier: IdentifierLike,
  namespaceNames: ReadonlySet<string>,
): boolean => {
  if (!namespaceNames.has(identifier.name)) {
    return false;
  }

  const variable = findVariable(context.sourceCode.getScope(identifier), identifier.name);

  return variable !== null && hasImportBindingDefinition(variable);
};

export const isEffectNamespaceImportReference = (
  context: Context,
  identifier: IdentifierLike,
  namespaceNames: ReadonlySet<string>,
): boolean => isNamespaceImportReference(context, identifier, namespaceNames);
