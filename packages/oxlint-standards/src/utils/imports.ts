import type { Context, ESTree, Scope, Variable } from '@oxlint/plugins';

import { isIdentifierName, type IdentifierLike } from './ast.js';
import { effectNamespaceModuleSpecifiers } from './effect-identifiers.js';

const getImportSource = (declaration: ESTree.ImportDeclaration): string | null => {
  const { value } = declaration.source;

  return typeof value === 'string' ? value : null;
};

const addNamespaceSpecifiers = (
  namespaceNames: Set<string>,
  declaration: ESTree.ImportDeclaration,
): void => {
  for (const specifier of declaration.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier' && isIdentifierName(specifier.local)) {
      namespaceNames.add(specifier.local.name);
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

export const collectNamespaceImports = (
  program: ESTree.Program,
  moduleSpecifiers: ReadonlyArray<string>,
): Set<string> => {
  const namespaceNames = new Set<string>();

  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      const source = getImportSource(statement);

      if (source !== null && moduleSpecifiers.includes(source)) {
        addNamespaceSpecifiers(namespaceNames, statement);
      }
    }
  }

  return namespaceNames;
};

export const collectEffectNamespaceImports = (program: ESTree.Program): Set<string> =>
  collectNamespaceImports(program, effectNamespaceModuleSpecifiers);

export const isEffectNamespaceImportReference = (
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
