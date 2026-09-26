import type { Context, ESTree, Scope, Variable } from '@oxlint/plugins';

import {
  getStaticMemberCall,
  getStringLiteralValue,
  isIdentifierName,
  isNodeLike,
  type IdentifierLike,
} from './ast.js';
import { isEffectStackModuleSource } from './effect-identifiers.js';

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

    if (variable !== globalThis.undefined) {
      return variable;
    }

    currentScope = currentScope.upper;
  }

  return null;
};

// Resolves an identifier through the lexical scope chain, so a local declaration shadows an import
// or global of the same name.
export const resolveVariable = (context: Context, identifier: IdentifierLike): Variable | null =>
  findVariable(context.sourceCode.getScope(identifier), identifier.name);

// Globals such as `String` and `Error` have no declaration in the file; any definition means a
// local binding shadows the global.
export const isUnshadowedGlobal = (context: Context, identifier: IdentifierLike): boolean => {
  const variable = resolveVariable(context, identifier);
  return variable === null || variable.defs.length === 0;
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

// Local names of value `import { importedName } from ...` specifiers only. A namespace import of the
// same module binds a module object, not the function itself.
export const collectNamedImportNames = (
  program: ESTree.Program,
  moduleSpecifiers: readonly string[],
  importedName: string,
): Set<string> => {
  const names = new Set<string>();
  for (const statement of program.body) {
    const source = statement.type === 'ImportDeclaration' ? getImportSource(statement) : null;
    if (
      statement.type === 'ImportDeclaration' &&
      statement.importKind !== 'type' &&
      source !== null &&
      moduleSpecifiers.includes(source)
    ) {
      for (const specifier of statement.specifiers) {
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.importKind !== 'type' &&
          isIdentifierName(specifier.local) &&
          importSpecifierName(specifier) === importedName
        ) {
          names.add(specifier.local.name);
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

// The member name of a call such as `Effect.map(...)` whose object is an import binding named in
// `namespaceNames`; `null` for any other node.
export const boundNamespaceCallMember = (
  context: Context,
  node: unknown,
  namespaceNames: ReadonlySet<string>,
): string | null => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return null;
  }

  const call = getStaticMemberCall(node);
  return call !== null && isNamespaceImportReference(context, call.object, namespaceNames)
    ? call.propertyName
    : null;
};
