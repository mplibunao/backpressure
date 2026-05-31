/* oxlint-disable max-lines -- The catalog keeps validated rule visitors colocated with their shared AST helpers. */
import { existsSync } from 'node:fs';

import type { Context, ESTree, Rule } from '@oxlint/plugins';

import {
  getCallExpressionArguments,
  getNodeField,
  getStaticMemberCall,
  getStringLiteralValue,
  hasAncestor,
  isIdentifierName,
  isNodeLike,
  walkDescendants,
  type NodeLike,
} from './utils/ast.js';
import { schemaCompilerMembers } from './utils/effect-identifiers.js';
import {
  containsAnyBoundNamespaceCall,
  functionReturnNode,
  isEffectWrapperPipeExpression,
  isFunctionLike,
  isInAnyWrapperOwnedExpression,
  isReturnedFromNamedWrapperDeclaration,
} from './utils/effect-ownership.js';
import { ruleMessage } from './rule-messages.js';
import {
  collectImportNames,
  getImportSource,
  hasEffectStackImport,
  hasEffectTypeOrRuntimeImport,
  importSpecifierName,
  isNamespaceImportReference,
} from './utils/imports.js';
import { containsSideEffectCall } from './utils/side-effects.js';
import { noEffectAsRuleImplementation } from './rules/effect/no-effect-as-internal.js';

interface CatalogRuleDefinition {
  readonly name: string;
  readonly rule: Rule;
}

const schemaCompilerMemberSet = new Set<string>(schemaCompilerMembers);
const primitiveTypes = new Set(['TSStringKeyword', 'TSNumberKeyword', 'TSBooleanKeyword']);
const lastPathPartOffset = -1;
const firstItemIndex = 0;
const secondItemIndex = 1;
const singleItemCount = 1;
const objectAssignPatchArgumentCount = 3;
const escapeHatches = new Set(['die', 'dieMessage', 'orDie', 'orDieWith']);
const nullishOperators = new Set(['!==', '!=', '===', '==']);
const collectionAtomPattern = /(Collection|List|Visible.*|Results|ReadState)Atom\b/;
const workspaceRootMarkers = new Set(['apps', 'examples', 'packages']);
const anyOrUnknownCastTypes = new Set(['TSAnyKeyword', 'TSUnknownKeyword']);

const message = ruleMessage;

const nodeText = (context: Context, node: NodeLike): string =>
  context.sourceCode.text.slice(node.range[0], node.range[1]);

const isCallExpression = (node: unknown): node is NodeLike =>
  isNodeLike(node) && node.type === 'CallExpression';

const isBoundMemberCall = (
  context: Context,
  node: NodeLike,
  namespaceNames: ReadonlySet<string>,
  propertyName: string,
): boolean => {
  if (node.type !== 'CallExpression') {
    return false;
  }

  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    call.propertyName === propertyName &&
    isNamespaceImportReference(context, call.object, namespaceNames)
  );
};

const isBoundMemberExpression = (
  context: Context,
  node: NodeLike,
  namespaceNames: ReadonlySet<string>,
  propertyNames: ReadonlySet<string>,
): boolean => {
  if (node.type !== 'MemberExpression') {
    return false;
  }

  const member = getStaticMemberCall({ callee: node });
  return (
    member !== null &&
    propertyNames.has(member.propertyName) &&
    isNamespaceImportReference(context, member.object, namespaceNames)
  );
};

const isAnyBoundNamespaceMemberCall = (
  context: Context,
  node: unknown,
  namespaceNames: ReadonlySet<string>,
): boolean => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return false;
  }

  const call = getStaticMemberCall(node);
  return call !== null && isNamespaceImportReference(context, call.object, namespaceNames);
};

const memberPropertyName = (memberExpression: unknown): string | null => {
  if (!isNodeLike(memberExpression) || memberExpression.type !== 'MemberExpression') {
    return null;
  }

  const property = getNodeField(memberExpression, 'property');
  return isIdentifierName(property) ? property.name : getStringLiteralValue(property);
};

const pipeStepArguments = (node: NodeLike): ReadonlyArray<unknown> => {
  if (node.type !== 'CallExpression') {
    return [];
  }

  const args = getCallExpressionArguments(node);
  const callee = getNodeField(node, 'callee');

  if (isIdentifierName(callee) && callee.name === 'pipe') {
    return args.slice(1);
  }

  return memberPropertyName(callee) === 'pipe' ? args : [];
};

const boundProvidePipeStepArguments = (
  context: Context,
  node: NodeLike,
  pipeNames: ReadonlySet<string>,
): ReadonlyArray<unknown> => {
  if (node.type !== 'CallExpression') {
    return [];
  }

  const args = getCallExpressionArguments(node);
  const callee = getNodeField(node, 'callee');

  if (isIdentifierName(callee) && isNamespaceImportReference(context, callee, pipeNames)) {
    return args.slice(1);
  }

  return memberPropertyName(callee) === 'pipe' ? args : [];
};

// Returns true when this call is the .object of a parent .pipe() member call.
// Inner segments are double-counted by the recursion; only the outermost must report.
const isInnerChainedPipeCall = (node: NodeLike): boolean => {
  const parentMember = getNodeField(node, 'parent');
  if (!isNodeLike(parentMember) || parentMember.type !== 'MemberExpression') {
    return false;
  }
  if (
    memberPropertyName(parentMember) !== 'pipe' ||
    getNodeField(parentMember, 'object') !== node
  ) {
    return false;
  }
  const grandParent = getNodeField(parentMember, 'parent');
  return (
    isNodeLike(grandParent) &&
    grandParent.type === 'CallExpression' &&
    getNodeField(grandParent, 'callee') === parentMember
  );
};

// Returns true when this call is the first source argument of an outer bound pipe call.
// Outermost standalone pipe accumulates the full count; inner segments must not report.
const isInnerStandalonePipeCall = (
  context: Context,
  node: NodeLike,
  pipeNames: ReadonlySet<string>,
): boolean => {
  const callee = getNodeField(node, 'callee');
  if (!isIdentifierName(callee) || !isNamespaceImportReference(context, callee, pipeNames)) {
    return false;
  }
  const parent = getNodeField(node, 'parent');
  if (!isNodeLike(parent) || parent.type !== 'CallExpression') {
    return false;
  }
  const parentCallee = getNodeField(parent, 'callee');
  if (
    !isIdentifierName(parentCallee) ||
    !isNamespaceImportReference(context, parentCallee, pipeNames)
  ) {
    return false;
  }
  return getCallExpressionArguments(parent as NodeLike)[0] === node;
};

const countProvidePipeSteps = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
  pipeNames: ReadonlySet<string>,
): number => {
  let count = boundProvidePipeStepArguments(context, node, pipeNames).filter(
    (step) => isNodeLike(step) && isBoundMemberCall(context, step, effectNames, 'provide'),
  ).length;
  const callee = getNodeField(node, 'callee');
  const chainedTarget =
    isNodeLike(callee) && callee.type === 'MemberExpression'
      ? getNodeField(callee, 'object')
      : null;

  if (isCallExpression(chainedTarget)) {
    count += countProvidePipeSteps(context, chainedTarget, effectNames, pipeNames);
  }

  // For standalone pipe(source, A, B): recurse into source when it is itself a pipe call.
  if (isIdentifierName(callee) && isNamespaceImportReference(context, callee, pipeNames)) {
    const [firstArg] = getCallExpressionArguments(node);
    if (isCallExpression(firstArg)) {
      count += countProvidePipeSteps(context, firstArg, effectNames, pipeNames);
    }
  }

  return count;
};

const firstArgument = (node: NodeLike): unknown => getCallExpressionArguments(node)[0] ?? null;

const firstArgumentIdentifierName = (node: NodeLike): string | null => {
  const argument = firstArgument(node);
  return isIdentifierName(argument) ? argument.name : null;
};

const matchesCollectionAtomName = (name: string | null): boolean =>
  name !== null && collectionAtomPattern.test(name);

const visitSelfAndDescendants = (node: unknown, visit: (node: NodeLike) => void): void => {
  if (!isNodeLike(node)) {
    return;
  }

  visit(node);
  walkDescendants(node, visit);
};

const isAtomCollectionRead = (
  context: Context,
  node: NodeLike,
  atomNames: ReadonlySet<string>,
): boolean => {
  if (node.type !== 'CallExpression') {
    return false;
  }

  const callee = getNodeField(node, 'callee');
  if (isIdentifierName(callee) && callee.name === 'get') {
    return matchesCollectionAtomName(firstArgumentIdentifierName(node));
  }

  const call = getStaticMemberCall(node);
  if (call === null || !matchesCollectionAtomName(firstArgumentIdentifierName(node))) {
    return false;
  }

  return (
    (call.objectName === 'get' && call.propertyName === 'get') ||
    (call.propertyName === 'get' && isNamespaceImportReference(context, call.object, atomNames))
  );
};

const containsObjectSpread = (node: unknown): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (descendant) => {
    found = found || descendant.type === 'SpreadElement';
  });
  return found;
};

const returnsSpreadObject = (node: unknown): boolean => {
  if (!isFunctionLike(node)) {
    return false;
  }

  const body = getNodeField(node, 'body');
  if (isNodeLike(body) && body.type === 'ObjectExpression') {
    return containsObjectSpread(body);
  }

  let found = false;
  visitSelfAndDescendants(body, (descendant) => {
    if (descendant.type !== 'ReturnStatement') {
      return;
    }
    found = found || containsObjectSpread(getNodeField(descendant, 'argument'));
  });
  return found;
};

const isStaticCall = (node: NodeLike, objectName: string, propertyName: string): boolean => {
  const call = getStaticMemberCall(node);
  return call !== null && call.objectName === objectName && call.propertyName === propertyName;
};

const containsStaticCall = (node: unknown, objectName: string, propertyName: string): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (descendant) => {
    found = found || isStaticCall(descendant, objectName, propertyName);
  });
  return found;
};

const isEmptyObjectExpression = (node: unknown): boolean => {
  if (!isNodeLike(node) || node.type !== 'ObjectExpression') {
    return false;
  }

  const properties = getNodeField(node, 'properties');
  return Array.isArray(properties) && properties.length === 0;
};

const isObjectEntriesFromEntriesCall = (node: NodeLike): boolean =>
  isStaticCall(node, 'Object', 'fromEntries') &&
  containsStaticCall(firstArgument(node), 'Object', 'entries');

const isEmptyTargetObjectAssignCall = (node: NodeLike): boolean =>
  isStaticCall(node, 'Object', 'assign') &&
  isEmptyObjectExpression(firstArgument(node)) &&
  getCallExpressionArguments(node).length >= objectAssignPatchArgumentCount;

const isRefTransitionCall = (
  context: Context,
  node: NodeLike,
  refNames: ReadonlySet<string>,
): boolean => {
  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    (call.propertyName === 'update' || call.propertyName === 'modify') &&
    isNamespaceImportReference(context, call.object, refNames)
  );
};

const isSchemaFilterCall = (node: NodeLike): boolean => {
  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    call.propertyName === 'filter' &&
    (call.objectName === 'S' || call.objectName === 'Schema')
  );
};

const hasSchemaFilterAncestor = (node: NodeLike): boolean =>
  hasAncestor(
    node,
    (ancestor) => ancestor.type === 'CallExpression' && isSchemaFilterCall(ancestor),
  );

const arrowFunctionAncestor = (node: NodeLike): NodeLike | null => {
  let current = getNodeField(node, 'parent');
  while (isNodeLike(current)) {
    if (current.type === 'ArrowFunctionExpression') {
      return current;
    }
    current = getNodeField(current, 'parent');
  }
  return null;
};

const functionExpressionAncestor = (node: NodeLike): NodeLike | null => {
  let current = getNodeField(node, 'parent');
  while (isNodeLike(current)) {
    if (current.type === 'FunctionExpression') {
      return current;
    }
    current = getNodeField(current, 'parent');
  }
  return null;
};

const isInsideCallArguments = (node: NodeLike): boolean =>
  hasAncestor(node, (ancestor) => {
    if (ancestor.type !== 'CallExpression') {
      return false;
    }
    return getCallExpressionArguments(ancestor).some((argument) => argument === node);
  });

const isEffectLogCall = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): boolean => {
  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    call.propertyName.startsWith('log') &&
    isNamespaceImportReference(context, call.object, effectNames)
  );
};

const isConsoleCall = (node: NodeLike): boolean => {
  const call = getStaticMemberCall(node);
  return call !== null && call.objectName === 'console';
};

const containsConsoleCall = (node: unknown): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (descendant) => {
    found = found || isConsoleCall(descendant);
  });
  return found;
};

const exactFunctionReturnExpression = (node: unknown): unknown => {
  if (!isFunctionLike(node)) {
    return null;
  }

  const body = getNodeField(node, 'body');
  if (!isNodeLike(body) || body.type !== 'BlockStatement') {
    return body;
  }

  const statements = getNodeField(body, 'body');
  if (!Array.isArray(statements) || statements.length !== singleItemCount) {
    return null;
  }

  const [statement] = statements;
  return isNodeLike(statement) && statement.type === 'ReturnStatement'
    ? getNodeField(statement, 'argument')
    : null;
};

const hasMatchOrElseNull = (
  context: Context,
  program: ESTree.Program,
  matchNames: ReadonlySet<string>,
): boolean => {
  let found = false;
  visitSelfAndDescendants(program, (node) => {
    if (node.type !== 'CallExpression') {
      return;
    }
    const call = getStaticMemberCall(node);
    const [firstArg] = getCallExpressionArguments(node);
    const returned = exactFunctionReturnExpression(firstArg);
    found =
      found ||
      (call !== null &&
        call.propertyName === 'orElse' &&
        isNamespaceImportReference(context, call.object, matchNames) &&
        isNodeLike(returned) &&
        returned.type === 'Literal' &&
        getNodeField(returned, 'value') === null);
  });
  return found;
};

const isStaticSchemaReference = (
  context: Context,
  node: unknown,
  schemaNames: ReadonlySet<string>,
): boolean => {
  if (!isNodeLike(node)) {
    return false;
  }

  if (node.type === 'Identifier') {
    const first = node.name.at(0) ?? null;
    return first !== null && first.toUpperCase() === first;
  }

  if (node.type === 'MemberExpression') {
    return true;
  }

  const call = getStaticMemberCall(node);
  if (call === null || !isNamespaceImportReference(context, call.object, schemaNames)) {
    return false;
  }

  return call.propertyName === 'fromJsonString'
    ? isStaticSchemaReference(context, firstArgument(node), schemaNames)
    : true;
};

const isImmediatelyInvoked = (node: NodeLike): boolean => {
  const parent = getNodeField(node, 'parent');
  return isCallExpression(parent) && getNodeField(parent, 'callee') === node;
};

const isPrimitiveType = (node: unknown): boolean =>
  isNodeLike(node) && primitiveTypes.has(node.type);

const isIdentifierOrMember = (node: unknown): boolean =>
  isNodeLike(node) &&
  (node.type === 'Identifier' ||
    node.type === 'MemberExpression' ||
    node.type === 'ChainExpression');

const isNullishLiteral = (node: unknown): boolean =>
  (isNodeLike(node) && node.type === 'Literal' && getNodeField(node, 'value') === null) ||
  (isIdentifierName(node) && node.name === 'undefined');

const hasDoubleCastReason = (commentText: string): boolean =>
  /lint-allow-double-cast:[^\S\r\n]*\S[^\r\n]*/.test(commentText);

const hasSameLineDoubleCastAllowComment = (linePrefix: string): boolean => {
  const lineCommentStart = linePrefix.lastIndexOf('//');
  if (lineCommentStart >= 0 && hasDoubleCastReason(linePrefix.slice(lineCommentStart))) {
    return true;
  }

  const blockComment = /\/\*[\s\S]*?\*\/\s*$/.exec(linePrefix);
  return blockComment !== null && hasDoubleCastReason(blockComment[0]);
};

const hasPreviousLineDoubleCastAllowComment = (source: string, lineStart: number): boolean => {
  const previousLineEnd = lineStart - 1;
  if (previousLineEnd <= 0) {
    return false;
  }

  const previousLineStart = source.lastIndexOf('\n', previousLineEnd - 1) + 1;
  const previousLine = source.slice(previousLineStart, previousLineEnd).trim();
  return (
    (previousLine.startsWith('//') ||
      (previousLine.startsWith('/*') && previousLine.endsWith('*/'))) &&
    hasDoubleCastReason(previousLine)
  );
};

const hasAllowDoubleCastComment = (context: Context, node: NodeLike): boolean => {
  // Executor parity: accept only previous-line or same-line-prefix comments with a non-empty
  // Reason. Do not scan node text — arbitrary string literals could spoof the pattern.
  const source = context.sourceCode.text;
  const lineStart = source.lastIndexOf('\n', node.range[0] - 1) + 1;
  const linePrefix = source.slice(lineStart, node.range[0]);
  return (
    hasSameLineDoubleCastAllowComment(linePrefix) ||
    hasPreviousLineDoubleCastAllowComment(source, lineStart)
  );
};

const isTestFileName = (filename: string): boolean =>
  /(^|\/)(__tests__|tests?)\//.test(filename) || /[.-](test|spec)\.[cm]?[jt]sx?$/.test(filename);

const isConfigOrToolingFile = (filename: string): boolean =>
  /(^|\/)(scripts|tools|tooling)\//.test(filename) ||
  /(^|\/)\.config\//.test(filename) ||
  /(^|\/)[\w.-]+\.config\.[cm]?[jt]sx?$/.test(filename);

const namesFor = (program: ESTree.Program, source: string, importedName: string): Set<string> =>
  collectImportNames(program, [source, 'effect'], importedName);

const isAnyBoundMemberCall = (
  context: Context,
  node: unknown,
  namespaceNames: ReadonlySet<string>,
  propertyNames: ReadonlySet<string>,
): boolean => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return false;
  }

  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    propertyNames.has(call.propertyName) &&
    isNamespaceImportReference(context, call.object, namespaceNames)
  );
};

const containsBoundMemberCall = (
  context: Context,
  node: unknown,
  namespaceNames: ReadonlySet<string>,
  propertyNames: ReadonlySet<string>,
): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (descendant) => {
    found = found || isAnyBoundMemberCall(context, descendant, namespaceNames, propertyNames);
  });
  return found;
};

const callArgumentAt = (node: NodeLike, index: number): unknown =>
  getCallExpressionArguments(node)[index] ?? null;

const isLiteralValue = (node: unknown, expected: unknown): boolean =>
  isNodeLike(node) && node.type === 'Literal' && getNodeField(node, 'value') === expected;

const isStringLiteralNode = (node: unknown): boolean =>
  isNodeLike(node) && node.type === 'Literal' && typeof getNodeField(node, 'value') === 'string';

const isNullishCoalesceToNullish = (node: unknown): boolean =>
  isNodeLike(node) &&
  node.type === 'LogicalExpression' &&
  getNodeField(node, 'operator') === '??' &&
  isNullishLiteral(getNodeField(node, 'right'));

const isCallToIdentifier = (node: unknown, name: string): boolean => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return false;
  }

  const callee = getNodeField(node, 'callee');
  return isIdentifierName(callee) && callee.name === name;
};

const isInlineFunction = (node: unknown): boolean =>
  isFunctionLike(node) && node.type !== 'FunctionDeclaration';

const isInlineIifeCall = (node: NodeLike): boolean =>
  node.type === 'CallExpression' && isInlineFunction(getNodeField(node, 'callee'));

const promiseRejectParameterName = (node: NodeLike): string | null => {
  if (!isFunctionLike(node)) {
    return null;
  }

  const params = getNodeField(node, 'params');
  if (!Array.isArray(params)) {
    return null;
  }

  const rejectParam = params[secondItemIndex];
  return isIdentifierName(rejectParam) ? rejectParam.name : null;
};

const enclosingPromiseExecutor = (node: NodeLike): NodeLike | null => {
  let current = getNodeField(node, 'parent');
  while (isNodeLike(current)) {
    if (isFunctionLike(current)) {
      const parent = getNodeField(current, 'parent');
      const callee = getNodeField(parent, 'callee');
      const args = isNodeLike(parent) ? getCallExpressionArguments(parent) : [];
      if (
        isNodeLike(parent) &&
        parent.type === 'NewExpression' &&
        isIdentifierName(callee) &&
        callee.name === 'Promise' &&
        args[firstItemIndex] === current
      ) {
        return current;
      }
    }
    current = getNodeField(current, 'parent');
  }
  return null;
};

const promiseRejectAliases = (executor: NodeLike, rejectName: string): Set<string> => {
  const aliases = new Set([rejectName]);
  let changed = true;
  while (changed) {
    changed = false;
    visitSelfAndDescendants(executor, (descendant) => {
      if (descendant.type !== 'VariableDeclarator') {
        return;
      }
      const id = getNodeField(descendant, 'id');
      const init = getNodeField(descendant, 'init');
      if (
        isIdentifierName(id) &&
        isIdentifierName(init) &&
        aliases.has(init.name) &&
        !aliases.has(id.name)
      ) {
        aliases.add(id.name);
        changed = true;
      }
    });
  }
  return aliases;
};

const containsInlineIife = (node: unknown): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (descendant) => {
    found = found || isInlineIifeCall(descendant);
  });
  return found;
};

const directBoundEffectCallDepth = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): number => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return 0;
  }

  if (!isAnyBoundNamespaceMemberCall(context, node, effectNames)) {
    return 0;
  }

  const childDepth = getCallExpressionArguments(node).reduce<number>(
    (depth, argument) =>
      Math.max(depth, directBoundEffectCallDepth(context, argument, effectNames)),
    0,
  );
  return singleItemCount + childDepth;
};

const hasNestedBoundEffectCall = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean =>
  getCallExpressionArguments(node).some(
    (argument) => directBoundEffectCallDepth(context, argument, effectNames) > 0,
  );

const isOwnedBySideEffectWrapperRule = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
  atomNames: ReadonlySet<string>,
): boolean => {
  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    (call.propertyName === 'as' || call.propertyName === 'zipRight') &&
    isNamespaceImportReference(context, call.object, effectNames) &&
    containsSideEffectCall(context, firstArgument(node), effectNames, atomNames)
  );
};

const isDirectArgumentOfBoundEffectCall = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  const parent = getNodeField(node, 'parent');
  return isNodeLike(parent) && isAnyBoundNamespaceMemberCall(context, parent, effectNames);
};

const effectSingleCalleeRuleOwners = new Set(['as', 'async', 'bind']);

const isOwnedBySpecificSingleCalleeRule = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    effectSingleCalleeRuleOwners.has(call.propertyName) &&
    isNamespaceImportReference(context, call.object, effectNames)
  );
};

const isVariableInitializerOrReturnArgument = (node: NodeLike): boolean => {
  const parent = getNodeField(node, 'parent');
  if (!isNodeLike(parent)) {
    return false;
  }

  return (
    (parent.type === 'VariableDeclarator' && getNodeField(parent, 'init') === node) ||
    (parent.type === 'ReturnStatement' && getNodeField(parent, 'argument') === node)
  );
};

const isConstVariableInitializerOrReturnArgument = (node: NodeLike): boolean => {
  const parent = getNodeField(node, 'parent');
  if (!isNodeLike(parent)) {
    return false;
  }

  if (parent.type === 'ReturnStatement') {
    return getNodeField(parent, 'argument') === node;
  }

  if (parent.type !== 'VariableDeclarator' || getNodeField(parent, 'init') !== node) {
    return false;
  }

  const declaration = getNodeField(parent, 'parent');
  return (
    isNodeLike(declaration) &&
    declaration.type === 'VariableDeclaration' &&
    getNodeField(declaration, 'kind') === 'const'
  );
};

// Follows only the first argument at each Effect-call level (source parity for ladder rules).
// This avoids falsely owning cases where only a non-first argument has deep Effect nesting.
const directFirstArgEffectCallDepth = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): number => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return 0;
  }
  if (!isAnyBoundNamespaceMemberCall(context, node, effectNames)) {
    return 0;
  }
  return singleItemCount + directFirstArgEffectCallDepth(context, firstArgument(node), effectNames);
};

// Source parity: no-effect-ladder inspects only the first Effect argument ($first).
// Checking all args would falsely own second-arg-only deep nesting.
const hasDeepFirstBoundEffectCall = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean =>
  directFirstArgEffectCallDepth(context, firstArgument(node), effectNames) > singleItemCount;

const containsPipeCall = (node: unknown): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (descendant) => {
    if (descendant.type !== 'CallExpression') {
      return;
    }
    const callee = getNodeField(descendant, 'callee');
    // Source parity: only standalone pipe(...) identifier counts as sequencing.
    // Member .pipe(...) is NOT listed as a source sequencing form.
    found = found || (isIdentifierName(callee) && callee.name === 'pipe');
  });
  return found;
};

// Detects nested pipe in arguments: both standalone pipe(...) and member .pipe(...).
// Used by no-pipe-ladder, which covers both forms per source.
const containsAnyPipeCall = (node: unknown): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (descendant) => {
    if (descendant.type !== 'CallExpression') {
      return;
    }
    const callee = getNodeField(descendant, 'callee');
    found =
      found ||
      (isIdentifierName(callee) && callee.name === 'pipe') ||
      memberPropertyName(callee) === 'pipe';
  });
  return found;
};

const pipeSourceExpression = (node: unknown): unknown => {
  if (!isCallExpression(node)) {
    return null;
  }

  const callee = getNodeField(node, 'callee');
  if (isIdentifierName(callee) && callee.name === 'pipe') {
    return firstArgument(node);
  }

  return memberPropertyName(callee) === 'pipe' ? getNodeField(callee, 'object') : null;
};

interface PipeExpressionParts {
  readonly steps: ReadonlyArray<unknown>;
  readonly target: unknown;
}

const pipeExpressionParts = (node: unknown): PipeExpressionParts | null => {
  if (!isCallExpression(node)) {
    return null;
  }

  const args = getCallExpressionArguments(node);
  const callee = getNodeField(node, 'callee');
  if (isIdentifierName(callee) && callee.name === 'pipe') {
    return { steps: args.slice(1), target: firstArgument(node) };
  }

  if (memberPropertyName(callee) !== 'pipe') {
    return null;
  }

  return { steps: args, target: isNodeLike(callee) ? getNodeField(callee, 'object') : null };
};

const isEffectFlatMapApplyResponseStep = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): boolean =>
  isNodeLike(node) &&
  isBoundMemberCall(context, node, effectNames, 'flatMap') &&
  isIdentifierName(firstArgument(node)) &&
  firstArgumentIdentifierName(node) === 'applyResponse';

const pipeContainsGraphqlSourceStep = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): boolean => {
  if (
    isCallToIdentifier(node, 'wrapGraphqlCall') ||
    isEffectFlatMapApplyResponseStep(context, node, effectNames)
  ) {
    return true;
  }

  const parts = pipeExpressionParts(node);
  return (
    parts !== null &&
    (pipeContainsGraphqlSourceStep(context, parts.target, effectNames) ||
      parts.steps.some((step) => pipeContainsGraphqlSourceStep(context, step, effectNames)))
  );
};

const isWrapGraphqlCatchAllPipeline = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  const parent = getNodeField(node, 'parent');
  const parts = pipeExpressionParts(parent);
  return (
    parts !== null &&
    parts.steps.includes(node) &&
    (pipeContainsGraphqlSourceStep(context, parts.target, effectNames) ||
      parts.steps.some(
        (step) => step !== node && pipeContainsGraphqlSourceStep(context, step, effectNames),
      ))
  );
};

const isInlineRuntimeProvideYield = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  if (node.type !== 'YieldExpression' || getNodeField(node, 'delegate') !== true) {
    return false;
  }

  const argument = getNodeField(node, 'argument');
  if (
    !isVariableInitializerOrReturnArgument(node) ||
    !isCallExpression(argument) ||
    !hasAncestor(
      node,
      (ancestor) => isFunctionLike(ancestor) && getNodeField(ancestor, 'generator') === true,
    )
  ) {
    return false;
  }

  const callee = getNodeField(argument, 'callee');
  return (
    memberPropertyName(callee) === 'pipe' &&
    pipeStepArguments(argument).some(
      (step) =>
        isNodeLike(step) &&
        isBoundMemberCall(context, step, effectNames, 'provide') &&
        getCallExpressionArguments(step).length === singleItemCount,
    )
  );
};

const isEffectWrapperExpression = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): boolean =>
  isAnyBoundNamespaceMemberCall(context, node, effectNames) ||
  isEffectWrapperPipeExpression(context, node, effectNames);

const effectBranchSequencingMembers = new Set(['flatMap', 'map', 'andThen', 'tap', 'zipRight']);

const containsEffectBranchSequencing = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
  streamNames: ReadonlySet<string>,
): boolean =>
  containsBoundMemberCall(context, node, effectNames, effectBranchSequencingMembers) ||
  containsAnyBoundNamespaceCall(context, node, streamNames) ||
  containsPipeCall(node);

const returnsOrContainsEffectWork = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
  streamNames: ReadonlySet<string>,
): boolean =>
  containsAnyBoundNamespaceCall(context, node, effectNames) &&
  containsEffectBranchSequencing(context, node, effectNames, streamNames);

// Mirrors no-flatmap-ladder exactly: const/return position, not wrapper-owned.
// Covers both flatMap(flatMap(...)) and flatten(map(...)) shapes.
const isOwnedByFlatMapLadderEnabled = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  if (
    !isConstVariableInitializerOrReturnArgument(node) ||
    isReturnedFromNamedWrapperDeclaration(node)
  ) {
    return false;
  }
  return (
    (isBoundMemberCall(context, node, effectNames, 'flatMap') &&
      getCallExpressionArguments(node).some((arg) =>
        containsBoundMemberCall(context, arg, effectNames, new Set(['flatMap'])),
      )) ||
    (isBoundMemberCall(context, node, effectNames, 'flatten') &&
      containsBoundMemberCall(context, firstArgument(node), effectNames, new Set(['map'])))
  );
};

const isOwnedBySpecificEffectLadderRule = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean =>
  isOwnedByFlatMapLadderEnabled(context, node, effectNames) ||
  (isBoundMemberCall(context, node, effectNames, 'orElse') &&
    containsBoundMemberCall(
      context,
      firstArgument(node),
      effectNames,
      new Set(['flatMap', 'zipRight', 'as', 'tap']),
    ));

// Ladder rules are const/return-only — this gate prevents double-reporting.
// Applies when depth > 1 in a const/return context, which those rules already own.
const isOwnedByGeneralEffectLadderRule = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean =>
  isConstVariableInitializerOrReturnArgument(node) &&
  hasDeepFirstBoundEffectCall(context, node, effectNames) &&
  !isOwnedByFlatMapLadderEnabled(context, node, effectNames);

const isEffectVoidExpression = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): boolean => {
  if (!isNodeLike(node)) {
    return false;
  }

  if (node.type === 'UnaryExpression' && getNodeField(node, 'operator') === 'void') {
    return isEffectVoidExpression(context, getNodeField(node, 'argument'), effectNames);
  }

  return isBoundMemberExpression(context, node, effectNames, new Set(['void']));
};

const isEffectTagBranchCall = (
  context: Context,
  node: NodeLike,
  matchNames: ReadonlySet<string>,
  effectNames: ReadonlySet<string>,
): boolean => {
  const call = getStaticMemberCall(node);
  if (
    call === null ||
    !isNamespaceImportReference(context, call.object, matchNames) ||
    (call.propertyName !== 'when' && call.propertyName !== 'orElse')
  ) {
    return false;
  }

  const callback =
    call.propertyName === 'when'
      ? callArgumentAt(node, secondItemIndex)
      : callArgumentAt(node, firstItemIndex);
  const hasSourceBranchSelector =
    call.propertyName === 'orElse' ||
    isLiteralValue(callArgumentAt(node, firstItemIndex), true) ||
    isLiteralValue(callArgumentAt(node, firstItemIndex), false);
  return (
    hasSourceBranchSelector &&
    isEffectVoidExpression(context, functionReturnNode(callback), effectNames)
  );
};

interface EffectMatchBranchContext {
  readonly context: Context;
  readonly effectNames: ReadonlySet<string>;
  readonly matchNames: ReadonlySet<string>;
  readonly streamNames: ReadonlySet<string>;
}

const functionEffectWorkNode = (node: unknown): unknown => {
  if (!isFunctionLike(node)) {
    return null;
  }

  const body = getNodeField(node, 'body');
  return isNodeLike(body) ? body : functionReturnNode(node);
};

const isEffectMatchBranch = (node: NodeLike, branchContext: EffectMatchBranchContext): boolean => {
  const { context, effectNames, matchNames, streamNames } = branchContext;
  const call = getStaticMemberCall(node);
  if (
    call === null ||
    !isNamespaceImportReference(context, call.object, matchNames) ||
    (call.propertyName !== 'when' && call.propertyName !== 'orElse')
  ) {
    return false;
  }

  const callback =
    call.propertyName === 'when'
      ? callArgumentAt(node, secondItemIndex)
      : callArgumentAt(node, firstItemIndex);
  return returnsOrContainsEffectWork(
    context,
    functionEffectWorkNode(callback),
    effectNames,
    streamNames,
  );
};

const objectFunctionValues = (node: unknown): ReadonlyArray<unknown> => {
  if (!isNodeLike(node) || node.type !== 'ObjectExpression') {
    return [];
  }
  const properties = getNodeField(node, 'properties');
  return Array.isArray(properties)
    ? properties.map((property) => getNodeField(property, 'value'))
    : [];
};

const optionMatchHasEffectBranch = (
  node: NodeLike,
  branchContext: EffectMatchBranchContext & { readonly optionNames: ReadonlySet<string> },
): boolean => {
  const { context, effectNames, optionNames, streamNames } = branchContext;
  if (!isBoundMemberCall(context, node, optionNames, 'match')) {
    return false;
  }

  return getCallExpressionArguments(node).some(
    (argument) =>
      (isFunctionLike(argument) &&
        returnsOrContainsEffectWork(
          context,
          functionEffectWorkNode(argument),
          effectNames,
          streamNames,
        )) ||
      objectFunctionValues(argument).some(
        (value) =>
          isFunctionLike(value) &&
          returnsOrContainsEffectWork(
            context,
            functionEffectWorkNode(value),
            effectNames,
            streamNames,
          ),
      ),
  );
};

const matchValuePipeHasEffectBranch = (
  node: NodeLike,
  branchContext: EffectMatchBranchContext,
): boolean => {
  const { context, matchNames } = branchContext;
  const callee = getNodeField(node, 'callee');
  if (memberPropertyName(callee) !== 'pipe') {
    return false;
  }

  const target = isNodeLike(callee) ? getNodeField(callee, 'object') : null;
  return (
    isNodeLike(target) &&
    isBoundMemberCall(context, target, matchNames, 'value') &&
    pipeStepArguments(node).some(
      (step) => isNodeLike(step) && isEffectMatchBranch(step, branchContext),
    )
  );
};

const isMatchBranchCall = (
  context: Context,
  node: NodeLike,
  matchNames: ReadonlySet<string>,
): boolean => {
  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    isNamespaceImportReference(context, call.object, matchNames) &&
    (call.propertyName === 'when' || call.propertyName === 'orElse')
  );
};

const matchValuePipeHasRenderBranch = (
  context: Context,
  node: NodeLike,
  matchNames: ReadonlySet<string>,
): boolean => {
  const callee = getNodeField(node, 'callee');
  if (memberPropertyName(callee) !== 'pipe') {
    return false;
  }

  const target = isNodeLike(callee) ? getNodeField(callee, 'object') : null;
  return (
    isNodeLike(target) &&
    isBoundMemberCall(context, target, matchNames, 'value') &&
    pipeStepArguments(node).some(
      (step) => isNodeLike(step) && isMatchBranchCall(context, step, matchNames),
    )
  );
};

interface ObjectPropertyBranchContext {
  readonly context: Context;
  readonly eitherNames: ReadonlySet<string>;
  readonly matchNames: ReadonlySet<string>;
  readonly optionNames: ReadonlySet<string>;
}

const containsObjectBranchExpression = (
  context: Context,
  node: unknown,
  branchContext: ObjectPropertyBranchContext,
): boolean => {
  const { eitherNames, matchNames, optionNames } = branchContext;
  if (!isNodeLike(node)) {
    return false;
  }

  if (isAnyBoundMemberCall(context, node, optionNames, new Set(['match']))) {
    return true;
  }
  if (isAnyBoundMemberCall(context, node, eitherNames, new Set(['match']))) {
    return true;
  }

  const callee = getNodeField(node, 'callee');
  const target =
    isNodeLike(callee) && memberPropertyName(callee) === 'pipe'
      ? getNodeField(callee, 'object')
      : null;
  return isNodeLike(target) && isBoundMemberCall(context, target, matchNames, 'value');
};

const functionReturnsObjectExpression = (node: unknown): boolean => {
  const returned = functionReturnNode(node);
  return isNodeLike(returned) && returned.type === 'ObjectExpression';
};

const callHasObjectBranchArgument = (
  context: Context,
  node: NodeLike,
  branchContext: ObjectPropertyBranchContext,
): boolean =>
  // Source uses a contains check on IIFE args: branches wrapped inside helper calls
  // (e.g. decorate(Option.match(...))) are still source-covered and must be reported.
  getCallExpressionArguments(node).some((argument) => {
    let found = false;
    visitSelfAndDescendants(argument, (descendant) => {
      found = found || containsObjectBranchExpression(context, descendant, branchContext);
    });
    return found;
  });

const hasObjectPropertyBranch = (
  node: NodeLike,
  branchContext: ObjectPropertyBranchContext,
): boolean => {
  const { context } = branchContext;
  const value = getNodeField(node, 'value');
  return isNodeLike(value) && containsObjectBranchExpression(context, value, branchContext);
};

const isArrowLadderIife = (node: NodeLike): boolean =>
  isInlineIifeCall(node) && containsInlineIife(getNodeField(node, 'callee'));

const isInsideArrowLadderIife = (node: NodeLike): boolean =>
  isArrowLadderIife(node) || hasAncestor(node, isArrowLadderIife);

const isObjectReturningIifeWithBranchArgument = (
  context: Context,
  node: NodeLike,
  branchContext: ObjectPropertyBranchContext,
): boolean => {
  const callee = getNodeField(node, 'callee');
  return (
    isFunctionLike(callee) &&
    functionReturnsObjectExpression(callee) &&
    callHasObjectBranchArgument(context, node, branchContext)
  );
};

const isConstVariableDeclarator = (node: NodeLike): boolean => {
  const parent = getNodeField(node, 'parent');
  return (
    isNodeLike(parent) &&
    parent.type === 'VariableDeclaration' &&
    getNodeField(parent, 'kind') === 'const'
  );
};

const isRefinedStringConst = (node: NodeLike): boolean =>
  node.type === 'VariableDeclarator' &&
  isConstVariableDeclarator(node) &&
  isStringLiteralNode(getNodeField(node, 'init'));

const isObjectTypeAlias = (node: NodeLike): boolean => {
  const typeAnnotation = getNodeField(node, 'typeAnnotation');
  return isNodeLike(typeAnnotation) && typeAnnotation.type === 'TSTypeLiteral';
};

const typeReferenceName = (node: unknown): string | null => {
  if (!isNodeLike(node) || node.type !== 'TSTypeReference') {
    return null;
  }

  const typeName = getNodeField(node, 'typeName');
  if (isIdentifierName(typeName)) {
    return typeName.name;
  }

  if (isNodeLike(typeName) && typeName.type === 'TSQualifiedName') {
    const left = getNodeField(typeName, 'left');
    const right = getNodeField(typeName, 'right');
    if (isIdentifierName(left) && isIdentifierName(right)) {
      return `${left.name}.${right.name}`;
    }
  }

  return null;
};

const hasTypeParameters = (node: unknown): boolean => {
  if (!isNodeLike(node)) {
    return false;
  }
  const params = getNodeField(node, 'typeParameters') ?? getNodeField(node, 'typeArguments');
  const list = isNodeLike(params) ? getNodeField(params, 'params') : null;
  return Array.isArray(list) && list.length > 0;
};

const schemaBaseName = (name: string): string | null => {
  const base = name.replace(/(Schema|Model|Struct)$/, '');
  return base.length > 0 && base !== name ? base : null;
};

const unwrapPipeSource = (node: unknown): unknown => {
  const source = pipeSourceExpression(node);
  return source === null ? node : unwrapPipeSource(source);
};

const isKnownSchemaModelCall = (
  context: Context,
  node: unknown,
  schemaNames: ReadonlySet<string>,
): boolean =>
  // Executor reference matches any Schema.<member>(...) call, not just the fixed
  // Struct/TaggedStruct allowlist; new constructors are also valid schema roots.
  isAnyBoundNamespaceMemberCall(context, unwrapPipeSource(node), schemaNames);

const isErrorLikeName = (name: string | null): boolean =>
  name !== null && new Set(['cause', 'e', 'err', 'error', 'reason', 'unknownError']).has(name);

const expressionName = (node: unknown): string | null => {
  if (isIdentifierName(node)) {
    return node.name;
  }
  return null;
};

const propertyName = (node: unknown): string | null =>
  isIdentifierName(node) ? node.name : getStringLiteralValue(node);

const isTagProperty = (node: unknown): boolean => propertyName(node) === '_tag';

const isTagAccess = (node: unknown): boolean =>
  isNodeLike(node) &&
  node.type === 'MemberExpression' &&
  isTagProperty(getNodeField(node, 'property'));

const isTypeofExpression = (node: unknown): boolean =>
  isNodeLike(node) &&
  node.type === 'UnaryExpression' &&
  getNodeField(node, 'operator') === 'typeof';

const isTypeofBooleanEquality = (node: NodeLike): boolean => {
  const operator = getNodeField(node, 'operator');
  const left = getNodeField(node, 'left');
  const right = getNodeField(node, 'right');
  return (
    operator === '===' &&
    ((isTypeofExpression(left) && getStringLiteralValue(right) === 'boolean') ||
      (isTypeofExpression(right) && getStringLiteralValue(left) === 'boolean'))
  );
};

const objectPropertyValue = (node: unknown, name: string): unknown => {
  if (!isNodeLike(node) || node.type !== 'ObjectExpression') {
    return null;
  }

  const properties = getNodeField(node, 'properties');
  if (!Array.isArray(properties)) {
    return null;
  }

  for (const property of properties) {
    if (!isNodeLike(property) || property.type !== 'Property') {
      continue;
    }

    if (propertyName(getNodeField(property, 'key')) === name) {
      return getNodeField(property, 'value');
    }
  }

  return null;
};

const isIdentifierLiteralTrueComparison = (node: unknown, identifierName: string): boolean => {
  if (
    !isNodeLike(node) ||
    node.type !== 'BinaryExpression' ||
    getNodeField(node, 'operator') !== '==='
  ) {
    return false;
  }

  const left = getNodeField(node, 'left');
  const right = getNodeField(node, 'right');
  return (
    (isIdentifierName(left) && left.name === identifierName && isLiteralValue(right, true)) ||
    (isIdentifierName(right) && right.name === identifierName && isLiteralValue(left, true))
  );
};

const isOptionBooleanNormalizationMatch = (node: NodeLike): boolean => {
  const options = getCallExpressionArguments(node).find(
    (argument) => isNodeLike(argument) && argument.type === 'ObjectExpression',
  );
  const onSome = objectPropertyValue(options, 'onSome');
  const onNone = objectPropertyValue(options, 'onNone');
  const params = isFunctionLike(onSome) ? getNodeField(onSome, 'params') : null;
  const [param] = Array.isArray(params) ? params : [];

  return (
    isIdentifierName(param) &&
    Array.isArray(params) &&
    params.length === singleItemCount &&
    isIdentifierLiteralTrueComparison(functionReturnNode(onSome), param.name) &&
    isFunctionLike(onNone) &&
    isLiteralValue(functionReturnNode(onNone), false)
  );
};

const effectDataModuleTags = new Map([
  [
    'Cause',
    new Set(['Fail', 'Die', 'Interrupt', 'Sequential', 'Parallel', 'Then', 'Both', 'Empty']),
  ],
  ['Either', new Set(['Left', 'Right'])],
  ['Exit', new Set(['Success', 'Failure'])],
  ['Option', new Set(['Some', 'None'])],
  ['Result', new Set(['Success', 'Failure', 'Left', 'Right'])],
]);

const importEffectDataTags = (node: ESTree.ImportDeclaration): Set<string> => {
  const tags = new Set<string>();
  const source = getImportSource(node);
  if (source === null || node.importKind === 'type') {
    return tags;
  }

  const moduleName = source.startsWith('effect/') ? source.slice('effect/'.length) : null;
  const moduleTags = moduleName === null ? null : (effectDataModuleTags.get(moduleName) ?? null);
  if (moduleTags !== null) {
    for (const tag of moduleTags) {
      tags.add(tag);
    }
    return tags;
  }

  if (source !== 'effect') {
    return tags;
  }

  for (const specifier of node.specifiers) {
    if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') {
      continue;
    }
    const importedTags = effectDataModuleTags.get(importSpecifierName(specifier) ?? '') ?? null;
    if (importedTags !== null) {
      for (const tag of importedTags) {
        tags.add(tag);
      }
    }
  }

  return tags;
};

const effectDataTagComparison = (node: NodeLike, importedTags: ReadonlySet<string>): boolean => {
  if (node.type !== 'BinaryExpression') {
    return false;
  }

  const operator = String(getNodeField(node, 'operator'));
  if (!['===', '!==', '==', '!='].includes(operator)) {
    return false;
  }

  const left = getNodeField(node, 'left');
  const right = getNodeField(node, 'right');
  const leftTag = getStringLiteralValue(left);
  const rightTag = getStringLiteralValue(right);
  return (
    (isTagAccess(left) && rightTag !== null && importedTags.has(rightTag)) ||
    (isTagAccess(right) && leftTag !== null && importedTags.has(leftTag))
  );
};

const tagAccessBelongsToEffectDataTagComparison = (
  node: NodeLike,
  importedTags: ReadonlySet<string>,
): boolean => {
  const parent = getNodeField(node, 'parent');
  return isNodeLike(parent) && effectDataTagComparison(parent, importedTags);
};

const objectPatternHasMessageProperty = (node: unknown): boolean => {
  if (!isNodeLike(node) || node.type !== 'ObjectPattern') {
    return false;
  }

  const properties = getNodeField(node, 'properties');
  return (
    Array.isArray(properties) &&
    properties.some(
      (property) =>
        isNodeLike(property) && propertyName(getNodeField(property, 'key')) === 'message',
    )
  );
};

const taggedErrorName = (node: unknown): string | null => {
  if (!isNodeLike(node) || node.type !== 'NewExpression') {
    return null;
  }
  const callee = getNodeField(node, 'callee');
  return isIdentifierName(callee) && callee.name !== 'Error' && callee.name.endsWith('Error')
    ? callee.name
    : null;
};

const parameterNames = (node: NodeLike): Set<string> => {
  const params = getNodeField(node, 'params');
  if (!Array.isArray(params)) {
    return new Set();
  }
  // Port executor reference: also accept AssignmentPattern (default values) and
  // RestElement (...rest) as forwardable parameter names alongside plain identifiers.
  const names = new Set<string>();
  for (const param of params) {
    if (!isNodeLike(param)) {
      continue;
    }
    if (isIdentifierName(param)) {
      names.add(param.name);
    } else if (param.type === 'AssignmentPattern') {
      const left = getNodeField(param, 'left');
      if (isIdentifierName(left)) {
        names.add(left.name);
      }
    } else if (param.type === 'RestElement') {
      const argument = getNodeField(param, 'argument');
      if (isIdentifierName(argument)) {
        names.add(argument.name);
      }
    }
  }
  return names;
};

const isForwardedArgument = (node: unknown, params: ReadonlySet<string>): boolean => {
  if (!isNodeLike(node)) {
    return false;
  }

  if (node.type === 'Literal') {
    return true;
  }

  if (isIdentifierName(node)) {
    return params.has(node.name);
  }

  if (node.type === 'MemberExpression') {
    const object = getNodeField(node, 'object');
    return isIdentifierName(object) && params.has(object.name);
  }

  if (node.type !== 'ObjectExpression') {
    return false;
  }

  const properties = getNodeField(node, 'properties');
  return (
    Array.isArray(properties) &&
    properties.every((property) => {
      if (!isNodeLike(property) || property.type === 'SpreadElement') {
        return false;
      }
      return isForwardedArgument(getNodeField(property, 'value'), params);
    })
  );
};

const isEffectGenCall = (
  context: Context,
  node: unknown,
  effectNames: ReadonlySet<string>,
): boolean => {
  if (!isNodeLike(node) || node.type !== 'CallExpression') {
    return false;
  }

  const call = getStaticMemberCall(node);
  return (
    call !== null &&
    call.propertyName === 'gen' &&
    isNamespaceImportReference(context, call.object, effectNames)
  );
};

const returnedExpression = (node: unknown): unknown => {
  if (!isNodeLike(node) || node.type !== 'BlockStatement') {
    return null;
  }

  const body = getNodeField(node, 'body');
  if (!Array.isArray(body) || body.length !== 1) {
    return null;
  }

  const [statement] = body;
  if (!isNodeLike(statement) || statement.type !== 'ReturnStatement') {
    return null;
  }

  return getNodeField(statement, 'argument');
};

const effectGenWrapperBody = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  const body = getNodeField(node, 'body');
  return (
    isEffectGenCall(context, body, effectNames) ||
    isEffectGenCall(context, returnedExpression(body), effectNames)
  );
};

const isAllowedEffectSucceedArgument = (node: unknown): boolean =>
  isNodeLike(node) &&
  ['ObjectExpression', 'ArrayExpression', 'CallExpression', 'ConditionalExpression'].includes(
    node.type,
  );

const isNamedWrapperDeclaration = (node: NodeLike): boolean => {
  if (node.type === 'FunctionDeclaration') {
    return isIdentifierName(getNodeField(node, 'id'));
  }

  const parent = getNodeField(node, 'parent');
  if (!isNodeLike(parent) || parent.type !== 'VariableDeclarator') {
    return false;
  }

  return getNodeField(parent, 'init') === node && isIdentifierName(getNodeField(parent, 'id'));
};

const isNullishPredicate = (node: NodeLike): boolean => {
  if (!isFunctionLike(node)) {
    return false;
  }

  const params = getNodeField(node, 'params');
  if (!Array.isArray(params) || params.length !== 1 || !isIdentifierName(params[0])) {
    return false;
  }

  const body = getNodeField(node, 'body');
  const predicateExpression =
    isNodeLike(body) && body.type === 'BlockStatement' ? functionReturnNode(node) : body;
  if (!isNodeLike(predicateExpression) || predicateExpression.type !== 'BinaryExpression') {
    return false;
  }

  const operator = getNodeField(predicateExpression, 'operator');
  const left = getNodeField(predicateExpression, 'left');
  const right = getNodeField(predicateExpression, 'right');
  const paramName = params[0].name;

  return (
    typeof operator === 'string' &&
    nullishOperators.has(operator) &&
    ((isIdentifierName(left) && left.name === paramName && isNullishLiteral(right)) ||
      (isIdentifierName(right) && right.name === paramName && isNullishLiteral(left)))
  );
};

const createNoBarrelImportRule = (): Rule => ({
  create(context) {
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.importKind === 'type' || getImportSource(node) !== 'effect') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            context.report({ message: message('no-barrel-import'), node: specifier });
          }

          if (specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type') {
            context.report({ message: message('no-barrel-import'), node: specifier });
          }
        }
      },
    };
  },
  meta: {
    docs: { description: message('no-barrel-import'), recommended: 'error' },
    type: 'suggestion',
  },
});

const simpleProgramGate = (context: Context, program: ESTree.Program | null): boolean =>
  program !== null && hasEffectStackImport(program);

// Type-modeling rules should also fire when Effect/Layer are imported as type-only.
const typeModelingProgramGate = (context: Context, program: ESTree.Program | null): boolean =>
  program !== null && hasEffectTypeOrRuntimeImport(program);

const workspacePackageRoot = (absolutePath: string): string | null => {
  const parts = absolutePath.split('/');
  // Walk upward from the input path itself (handles directory imports and grouped workspaces).
  // Stop at the nearest ancestor that has package.json and sits under a workspace marker.
  const { length: partsLen } = parts;
  for (let end = partsLen; end > 0; end -= 1) {
    const candidate = parts.slice(0, end).join('/');
    if (!existsSync(`${candidate}/package.json`)) {
      continue;
    }
    if (parts.slice(0, end - 1).some((part) => workspaceRootMarkers.has(part))) {
      return candidate;
    }
  }
  return null;
};

const resolvePackageRelativeImport = (filename: string, source: string): string => {
  const sourceParts = source.split('/').filter((part) => part.length > 0 && part !== '.');
  const fileParts = filename.split('/').slice(0, lastPathPartOffset);
  for (const part of sourceParts) {
    if (part === '..') {
      fileParts.pop();
      continue;
    }
    fileParts.push(part);
  }
  return fileParts.join('/');
};

const createNoCrossPackageRelativeImportsRule = (): Rule => ({
  create(context) {
    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = getImportSource(node);
        if (source === null || !source.startsWith('.')) {
          return;
        }
        const fromPackage = workspacePackageRoot(context.filename);
        const toPackage = workspacePackageRoot(
          resolvePackageRelativeImport(context.filename, source),
        );
        if (fromPackage !== null && toPackage !== null && fromPackage !== toPackage) {
          context.report({
            message: message('no-cross-package-relative-imports'),
            node: node.source,
          });
        }
      },
    };
  },
  meta: {
    docs: { description: message('no-cross-package-relative-imports'), recommended: 'error' },
    type: 'problem',
  },
});

// Extracted from no-effect-all-step-sequencing create; has no closure deps.
const hasConcurrencyOne = (node: unknown): boolean => {
  let found = false;
  visitSelfAndDescendants(node, (descendant) => {
    if (descendant.type !== 'Property') {
      return;
    }
    found =
      found ||
      (propertyName(getNodeField(descendant, 'key')) === 'concurrency' &&
        isLiteralValue(getNodeField(descendant, 'value'), singleItemCount));
  });
  return found;
};

const catalogRules: Record<string, Rule> = {
  'effect-no-multiple-provide': {
    create(context) {
      let effectNames = new Set<string>();
      let pipeNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = collectImportNames(node, ['effect/Effect', 'effect'], 'Effect');
          pipeNames = collectImportNames(node, ['effect/Function', 'effect'], 'pipe');
        },
        CallExpression(node: ESTree.CallExpression) {
          // Skip inner pipe segments: the outermost call in a .pipe().pipe() chain
          // Accumulates the full count via recursion and is the only reporter.
          if (isInnerChainedPipeCall(node as NodeLike)) {
            return;
          }
          if (isInnerStandalonePipeCall(context, node as NodeLike, pipeNames)) {
            return;
          }
          // Skip when no-effect-wrapper-alias owns this const pipe alias.
          if (isInAnyWrapperOwnedExpression(context, node as NodeLike, effectNames)) {
            return;
          }
          const provideCount = countProvidePipeSteps(
            context,
            node as NodeLike,
            effectNames,
            pipeNames,
          );
          if (provideCount > 1) {
            context.report({ message: message('effect-no-multiple-provide'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('effect-no-multiple-provide'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-barrel-import': createNoBarrelImportRule(),
  'no-arrow-ladder': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        CallExpression(node: NodeLike) {
          if (
            simpleProgramGate(context, program) &&
            isInlineIifeCall(node) &&
            containsInlineIife(getNodeField(node, 'callee'))
          ) {
            context.report({ message: message('no-arrow-ladder'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-arrow-ladder'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-atom-registry-effect-sync': {
    create(context) {
      let atomNames = new Set<string>();
      let effectNames = new Set<string>();
      const atomMethods = new Set(['get', 'set', 'update', 'modify', 'refresh']);
      return {
        Program(node: ESTree.Program) {
          atomNames = namesFor(node, '@effect-atom/atom-react', 'Atom');
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (!isBoundMemberCall(context, node, effectNames, 'sync')) {
            return;
          }
          const fn = firstArgument(node);
          let found: NodeLike | null = null;
          visitSelfAndDescendants(fn, (descendant) => {
            const call = getStaticMemberCall(descendant);
            if (
              found === null &&
              call !== null &&
              atomMethods.has(call.propertyName) &&
              (call.objectName === 'atomRegistry' ||
                isNamespaceImportReference(context, call.object, atomNames))
            ) {
              found = descendant;
            }
          });
          if (found !== null) {
            context.report({ message: message('no-atom-registry-effect-sync'), node: found });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-atom-registry-effect-sync'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-branch-in-object': {
    create(context) {
      let eitherNames = new Set<string>();
      let matchNames = new Set<string>();
      let optionNames = new Set<string>();
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
          eitherNames = namesFor(node, 'effect/Either', 'Either');
          matchNames = namesFor(node, 'effect/Match', 'Match');
          optionNames = namesFor(node, 'effect/Option', 'Option');
        },
        Property(node: NodeLike) {
          if (
            simpleProgramGate(context, program) &&
            hasObjectPropertyBranch(node, { context, eitherNames, matchNames, optionNames })
          ) {
            context.report({ message: message('no-branch-in-object'), node });
          }
        },
        CallExpression(node: NodeLike) {
          if (
            simpleProgramGate(context, program) &&
            isObjectReturningIifeWithBranchArgument(context, node, {
              context,
              eitherNames,
              matchNames,
              optionNames,
            })
          ) {
            context.report({ message: message('no-branch-in-object'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-branch-in-object'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-call-tower': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            isAnyBoundNamespaceMemberCall(context, node, effectNames) &&
            !isReturnedFromNamedWrapperDeclaration(node) &&
            hasNestedBoundEffectCall(context, node, effectNames)
          ) {
            context.report({ message: message('no-call-tower'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-call-tower'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-all-step-sequencing': {
    create(context) {
      let atomNames = new Set<string>();
      let effectNames = new Set<string>();
      let fiberNames = new Set<string>();
      let refNames = new Set<string>();
      let reactivityNames = new Set<string>();
      let subscriptionRefNames = new Set<string>();
      const hasSequentialStep = (node: unknown): boolean => {
        let found = false;
        visitSelfAndDescendants(node, (descendant) => {
          found =
            found ||
            isAnyBoundMemberCall(context, descendant, refNames, new Set(['set'])) ||
            isAnyBoundMemberCall(context, descendant, atomNames, new Set(['set'])) ||
            isAnyBoundMemberCall(context, descendant, subscriptionRefNames, new Set(['set'])) ||
            isAnyBoundMemberCall(context, descendant, reactivityNames, new Set(['invalidate'])) ||
            isAnyBoundMemberCall(context, descendant, fiberNames, new Set(['interrupt'])) ||
            isEffectLogCall(context, descendant, effectNames);
        });
        return found;
      };
      const hasDirectPipedAsVoid = (node: NodeLike): boolean => {
        const parent = getNodeField(node, 'parent');
        const parentCall =
          isNodeLike(parent) && parent.type === 'MemberExpression'
            ? getNodeField(parent, 'parent')
            : null;
        return (
          isCallExpression(parentCall) &&
          pipeStepArguments(parentCall).some(
            (step) =>
              isNodeLike(step) &&
              isBoundMemberExpression(context, step, effectNames, new Set(['asVoid'])),
          )
        );
      };
      return {
        Program(node: ESTree.Program) {
          atomNames = namesFor(node, '@effect-atom/atom-react', 'Atom');
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
          fiberNames = namesFor(node, 'effect/Fiber', 'Fiber');
          refNames = namesFor(node, 'effect/Ref', 'Ref');
          reactivityNames = namesFor(node, 'effect/Reactivity', 'Reactivity');
          subscriptionRefNames = namesFor(node, 'effect/SubscriptionRef', 'SubscriptionRef');
        },
        CallExpression(node: NodeLike) {
          if (
            !isBoundMemberCall(context, node, effectNames, 'all') ||
            isInAnyWrapperOwnedExpression(context, node, effectNames)
          ) {
            return;
          }
          const steps = callArgumentAt(node, firstItemIndex);
          const options = callArgumentAt(node, secondItemIndex);
          if (
            hasSequentialStep(steps) &&
            (hasConcurrencyOne(options) || hasDirectPipedAsVoid(node))
          ) {
            context.report({ message: message('no-effect-all-step-sequencing'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-all-step-sequencing'), recommended: 'error' },
      type: 'problem',
    },
  },
  // Delegated to the standalone implementation file; included here so rule assembly is catalog-first.
  'no-effect-as': noEffectAsRuleImplementation,
  'no-effect-async': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            isBoundMemberCall(context, node, effectNames, 'async')
          ) {
            context.report({ message: message('no-effect-async'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-async'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-bind': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            isBoundMemberCall(context, node, effectNames, 'bind')
          ) {
            context.report({ message: message('no-effect-bind'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-bind'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-call-in-effect-arg': {
    create(context) {
      let atomNames = new Set<string>();
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          atomNames = collectImportNames(node, ['@effect-atom/atom-react'], 'Atom');
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            isAnyBoundNamespaceMemberCall(context, node, effectNames) &&
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            hasNestedBoundEffectCall(context, node, effectNames) &&
            !isOwnedBySpecificEffectLadderRule(context, node, effectNames) &&
            !isOwnedByGeneralEffectLadderRule(context, node, effectNames) &&
            !isOwnedBySpecificSingleCalleeRule(context, node, effectNames) &&
            !isOwnedBySideEffectWrapperRule(context, node, effectNames, atomNames) &&
            !isDirectArgumentOfBoundEffectCall(context, node, effectNames)
          ) {
            context.report({ message: message('no-effect-call-in-effect-arg'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-call-in-effect-arg'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-do': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        MemberExpression(node: NodeLike) {
          if (isBoundMemberExpression(context, node, effectNames, new Set(['Do']))) {
            context.report({ message: message('no-effect-do'), node });
          }
        },
      };
    },
    meta: { docs: { description: message('no-effect-do'), recommended: 'error' }, type: 'problem' },
  },
  'no-effect-ladder': {
    create(context) {
      let atomNames = new Set<string>();
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          atomNames = collectImportNames(node, ['@effect-atom/atom-react'], 'Atom');
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            isConstVariableInitializerOrReturnArgument(node) &&
            !isReturnedFromNamedWrapperDeclaration(node) &&
            isAnyBoundNamespaceMemberCall(context, node, effectNames) &&
            hasDeepFirstBoundEffectCall(context, node, effectNames) &&
            !isOwnedBySpecificSingleCalleeRule(context, node, effectNames) &&
            !isOwnedBySpecificEffectLadderRule(context, node, effectNames) &&
            !isOwnedBySideEffectWrapperRule(context, node, effectNames, atomNames) &&
            !isOwnedByFlatMapLadderEnabled(context, node, effectNames)
          ) {
            context.report({ message: message('no-effect-ladder'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-ladder'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-never': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        MemberExpression(node: NodeLike) {
          if (isBoundMemberExpression(context, node, effectNames, new Set(['never']))) {
            context.report({ message: message('no-effect-never'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-never'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-orElse-ladder': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            isBoundMemberCall(context, node, effectNames, 'orElse') &&
            containsBoundMemberCall(
              context,
              firstArgument(node),
              effectNames,
              new Set(['flatMap', 'zipRight', 'as', 'tap']),
            )
          ) {
            context.report({ message: message('no-effect-orElse-ladder'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-orElse-ladder'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-succeed-variable': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          const arg = firstArgument(node);
          if (
            isBoundMemberCall(context, node, effectNames, 'succeed') &&
            arg !== null &&
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            !isStringLiteralNode(arg) &&
            !isAllowedEffectSucceedArgument(arg)
          ) {
            context.report({ message: message('no-effect-succeed-variable'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-succeed-variable'), recommended: 'warn' },
      type: 'suggestion',
    },
  },
  'no-effect-sync-console': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            isBoundMemberCall(context, node, effectNames, 'sync') &&
            containsConsoleCall(firstArgument(node))
          ) {
            context.report({ message: message('no-effect-sync-console'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-sync-console'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-type-alias': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        TSTypeReference(node: NodeLike) {
          if (
            typeModelingProgramGate(context, program) &&
            hasAncestor(node, (ancestor) => ancestor.type === 'TSTypeAliasDeclaration') &&
            typeReferenceName(node) === 'Effect.Effect'
          ) {
            context.report({ message: message('no-effect-type-alias'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-type-alias'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-wrapper-alias': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        VariableDeclarator(node: NodeLike) {
          const declaration = getNodeField(node, 'parent');
          if (
            !isNodeLike(declaration) ||
            declaration.type !== 'VariableDeclaration' ||
            getNodeField(declaration, 'kind') !== 'const'
          ) {
            return;
          }
          const init = getNodeField(node, 'init');
          const arrowBody =
            isNodeLike(init) && init.type === 'ArrowFunctionExpression'
              ? getNodeField(init, 'body')
              : null;
          const isExpressionBodiedArrow =
            isNodeLike(arrowBody) && arrowBody.type !== 'BlockStatement';
          const candidate = isExpressionBodiedArrow ? arrowBody : init; // Direct Effect.gen returns are owned by prefer-effect-fn, not no-effect-wrapper-alias.
          const isAlias = isExpressionBodiedArrow
            ? isEffectWrapperExpression(context, candidate, effectNames) &&
              !isEffectGenCall(context, candidate, effectNames)
            : isEffectWrapperPipeExpression(context, candidate, effectNames);
          if (isAlias) {
            context.report({ message: message('no-effect-wrapper-alias'), node });
          }
        },
        FunctionDeclaration(node: NodeLike) {
          const returned = functionReturnNode(node);
          if (
            isEffectWrapperExpression(context, returned, effectNames) &&
            !isEffectGenCall(context, returned, effectNames)
          ) {
            context.report({ message: message('no-effect-wrapper-alias'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-wrapper-alias'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-flatmap-ladder': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            !isConstVariableInitializerOrReturnArgument(node) ||
            isReturnedFromNamedWrapperDeclaration(node)
          ) {
            return;
          }
          if (
            (isBoundMemberCall(context, node, effectNames, 'flatMap') &&
              getCallExpressionArguments(node).some((arg) =>
                containsBoundMemberCall(context, arg, effectNames, new Set(['flatMap'])),
              )) ||
            (isBoundMemberCall(context, node, effectNames, 'flatten') &&
              containsBoundMemberCall(context, firstArgument(node), effectNames, new Set(['map'])))
          ) {
            context.report({ message: message('no-flatmap-ladder'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-flatmap-ladder'), recommended: 'warn' },
      type: 'suggestion',
    },
  },
  'no-double-cast': {
    create(context) {
      return {
        TSAsExpression(node: NodeLike) {
          const expression = getNodeField(node, 'expression');
          const throughType = isNodeLike(expression)
            ? getNodeField(expression, 'typeAnnotation')
            : null;
          if (
            !isConfigOrToolingFile(context.filename) &&
            isNodeLike(expression) &&
            expression.type === 'TSAsExpression' &&
            !hasAllowDoubleCastComment(context, node) &&
            isNodeLike(throughType) &&
            anyOrUnknownCastTypes.has(throughType.type)
          ) {
            context.report({ message: message('no-double-cast'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-double-cast'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-escape-hatch': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = collectImportNames(node, ['effect/Effect', 'effect'], 'Effect');
        },
        MemberExpression(node: NodeLike) {
          if (
            !isTestFileName(context.filename) &&
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            isBoundMemberExpression(context, node, effectNames, escapeHatches)
          ) {
            context.report({ message: message('no-effect-escape-hatch'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-escape-hatch'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-side-effect-wrapper': {
    create(context) {
      let atomNames = new Set<string>();
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          atomNames = collectImportNames(node, ['@effect-atom/atom-react'], 'Atom');
          effectNames = collectImportNames(node, ['effect/Effect', 'effect'], 'Effect');
        },
        CallExpression(node: NodeLike) {
          const call = getStaticMemberCall(node);
          if (
            call !== null &&
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            (call.propertyName === 'as' || call.propertyName === 'zipRight') &&
            isNamespaceImportReference(context, call.object, effectNames) &&
            containsSideEffectCall(context, firstArgument(node), effectNames, atomNames)
          ) {
            context.report({ message: message('no-effect-side-effect-wrapper'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-side-effect-wrapper'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-family-collection-read': {
    create(context) {
      let atomNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          atomNames = collectImportNames(node, ['@effect-atom/atom-react'], 'Atom');
        },
        CallExpression(node: NodeLike) {
          const call = getStaticMemberCall(node);
          if (
            call === null ||
            call.propertyName !== 'family' ||
            !isNamespaceImportReference(context, call.object, atomNames)
          ) {
            return;
          }

          let reported = false;
          walkDescendants(node, (descendant) => {
            if (!reported && isAtomCollectionRead(context, descendant, atomNames)) {
              reported = true;
              context.report({ message: message('no-family-collection-read'), node: descendant });
            }
          });
        },
      };
    },
    meta: {
      docs: { description: message('no-family-collection-read'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-fromnullable-nullish-coalesce': {
    create(context) {
      let optionNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          optionNames = namesFor(node, 'effect/Option', 'Option');
        },
        CallExpression(node: NodeLike) {
          if (
            isBoundMemberCall(context, node, optionNames, 'fromNullable') &&
            isNullishCoalesceToNullish(firstArgument(node))
          ) {
            context.report({ message: message('no-fromnullable-nullish-coalesce'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-fromnullable-nullish-coalesce'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-iife-wrapper': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        CallExpression(node: NodeLike) {
          if (
            simpleProgramGate(context, program) &&
            isInlineIifeCall(node) &&
            !isInsideArrowLadderIife(node)
          ) {
            context.report({ message: message('no-iife-wrapper'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-iife-wrapper'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-inline-runtime-provide': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        YieldExpression(node: NodeLike) {
          if (isInlineRuntimeProvideYield(context, node, effectNames)) {
            context.report({ message: message('no-inline-runtime-provide'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-inline-runtime-provide'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-manual-effect-channels': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        TSTypeReference(node: NodeLike) {
          const name = typeReferenceName(node);
          const isTypeAlias = hasAncestor(
            node,
            (ancestor) => ancestor.type === 'TSTypeAliasDeclaration',
          );
          if (
            typeModelingProgramGate(context, program) &&
            !(isTypeAlias && name === 'Effect.Effect') &&
            (name === 'Effect.Effect' || name === 'Layer.Layer') &&
            hasTypeParameters(node)
          ) {
            context.report({ message: message('no-manual-effect-channels'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-manual-effect-channels'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-match-effect-branch': {
    create(context) {
      let effectNames = new Set<string>();
      let matchNames = new Set<string>();
      let optionNames = new Set<string>();
      let program: ESTree.Program | null = null;
      let streamNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          program = node;
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
          matchNames = namesFor(node, 'effect/Match', 'Match');
          optionNames = namesFor(node, 'effect/Option', 'Option');
          streamNames = namesFor(node, 'effect/Stream', 'Stream');
        },
        CallExpression(node: NodeLike) {
          const branchContext = { context, effectNames, matchNames, streamNames };
          if (
            simpleProgramGate(context, program) &&
            (matchValuePipeHasEffectBranch(node, branchContext) ||
              optionMatchHasEffectBranch(node, { ...branchContext, optionNames }))
          ) {
            context.report({ message: message('no-match-effect-branch'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-match-effect-branch'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-match-void-branch': {
    create(context) {
      let effectNames = new Set<string>();
      let matchNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
          matchNames = namesFor(node, 'effect/Match', 'Match');
        },
        CallExpression(node: NodeLike) {
          if (isEffectTagBranchCall(context, node, matchNames, effectNames)) {
            context.report({ message: message('no-match-void-branch'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-match-void-branch'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-nested-effect-call': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            isAnyBoundNamespaceMemberCall(context, node, effectNames) &&
            !isReturnedFromNamedWrapperDeclaration(node) &&
            hasDeepFirstBoundEffectCall(context, node, effectNames)
          ) {
            context.report({ message: message('no-nested-effect-call'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-nested-effect-call'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-nested-effect-gen': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            isInAnyWrapperOwnedExpression(context, node, effectNames) ||
            !isBoundMemberCall(context, node, effectNames, 'gen')
          ) {
            return;
          }
          let found = false;
          walkDescendants(node, (descendant) => {
            found =
              found ||
              (descendant !== node && isBoundMemberCall(context, descendant, effectNames, 'gen'));
          });
          if (found) {
            context.report({ message: message('no-nested-effect-gen'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-nested-effect-gen'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-option-as': {
    create(context) {
      let optionNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          optionNames = namesFor(node, 'effect/Option', 'Option');
        },
        CallExpression(node: NodeLike) {
          if (isBoundMemberCall(context, node, optionNames, 'as')) {
            context.report({ message: message('no-option-as'), node });
          }
        },
      };
    },
    meta: { docs: { description: message('no-option-as'), recommended: 'error' }, type: 'problem' },
  },
  'no-option-boolean-normalization': {
    create(context) {
      let optionNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          optionNames = namesFor(node, 'effect/Option', 'Option');
        },
        CallExpression(node: NodeLike) {
          if (
            isBoundMemberCall(context, node, optionNames, 'match') &&
            isOptionBooleanNormalizationMatch(node)
          ) {
            context.report({ message: message('no-option-boolean-normalization'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-option-boolean-normalization'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-pipe-ladder': {
    create(context) {
      let effectNames = new Set<string>();
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          const parts = pipeExpressionParts(node);
          if (!simpleProgramGate(context, program) || parts === null) {
            return;
          }
          if (isInAnyWrapperOwnedExpression(context, node, effectNames)) {
            return;
          }
          const callee = getNodeField(node, 'callee');
          const candidates =
            isIdentifierName(callee) && callee.name === 'pipe'
              ? [parts.target, ...parts.steps]
              : parts.steps;
          const nested = candidates.some((argument) => containsAnyPipeCall(argument));
          if (nested) {
            context.report({ message: message('no-pipe-ladder'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-pipe-ladder'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-react-state': {
    create(context) {
      const hookNames = new Set([
        'useState',
        'useReducer',
        'useContext',
        'useCallback',
        'useEffect',
        'useSyncExternalStore',
      ]);
      return {
        CallExpression(node: NodeLike) {
          const callee = getNodeField(node, 'callee');
          const name = isIdentifierName(callee) ? callee.name : memberPropertyName(callee);
          if (name !== null && hookNames.has(name)) {
            context.report({ message: message('no-react-state'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-react-state'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-render-side-effects': {
    create(context) {
      let matchNames = new Set<string>();
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
          matchNames = namesFor(node, 'effect/Match', 'Match');
        },
        ExpressionStatement(node: NodeLike) {
          const expression = getNodeField(node, 'expression');
          if (
            simpleProgramGate(context, program) &&
            isCallExpression(expression) &&
            matchValuePipeHasRenderBranch(context, expression, matchNames)
          ) {
            context.report({ message: message('no-render-side-effects'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-render-side-effects'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-return-in-callback': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        ReturnStatement(node: NodeLike) {
          const fn = functionExpressionAncestor(node);
          if (simpleProgramGate(context, program) && isNodeLike(fn) && isInsideCallArguments(fn)) {
            context.report({ message: message('no-return-in-callback'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-return-in-callback'), recommended: 'warn' },
      type: 'suggestion',
    },
  },
  'no-return-null': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        ReturnStatement(node: NodeLike) {
          if (
            simpleProgramGate(context, program) &&
            isLiteralValue(getNodeField(node, 'argument'), null)
          ) {
            context.report({ message: message('no-return-null'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-return-null'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-runtime-runfork': {
    create(context) {
      let runtimeNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          runtimeNames = namesFor(node, 'effect/Runtime', 'Runtime');
        },
        CallExpression(node: NodeLike) {
          if (isBoundMemberCall(context, node, runtimeNames, 'runFork')) {
            context.report({ message: message('no-runtime-runfork'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-runtime-runfork'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-string-sentinel-const': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        VariableDeclarator(node: NodeLike) {
          if (simpleProgramGate(context, program) && isRefinedStringConst(node)) {
            context.report({ message: message('no-string-sentinel-const'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-string-sentinel-const'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-string-sentinel-return': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            isBoundMemberCall(context, node, effectNames, 'succeed') &&
            isStringLiteralNode(firstArgument(node))
          ) {
            context.report({ message: message('no-string-sentinel-return'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-string-sentinel-return'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-try-catch': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        TryStatement(node: NodeLike) {
          if (simpleProgramGate(context, program) && isNodeLike(getNodeField(node, 'handler'))) {
            context.report({ message: message('no-try-catch'), node });
          }
        },
      };
    },
    meta: { docs: { description: message('no-try-catch'), recommended: 'error' }, type: 'problem' },
  },
  'no-wrapgraphql-catchall': {
    create(context) {
      let effectNames = new Set<string>();
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (
            simpleProgramGate(context, program) &&
            isBoundMemberCall(context, node, effectNames, 'catchAll') &&
            isWrapGraphqlCatchAllPipeline(context, node, effectNames)
          ) {
            context.report({ message: message('no-wrapgraphql-catchall'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-wrapgraphql-catchall'), recommended: 'error' },
      type: 'problem',
    },
  },
  'warn-effect-sync-wrapper': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          const fn = firstArgument(node);
          const fnBody = isNodeLike(fn) ? getNodeField(fn, 'body') : null;
          const isExpressionBodied = isNodeLike(fnBody) && fnBody.type !== 'BlockStatement';
          const returned = functionReturnNode(fn);
          if (
            !isInAnyWrapperOwnedExpression(context, node, effectNames) &&
            isBoundMemberCall(context, node, effectNames, 'sync') &&
            isExpressionBodied &&
            isNodeLike(returned) &&
            returned.type === 'CallExpression' &&
            !isConsoleCall(returned)
          ) {
            context.report({ message: message('warn-effect-sync-wrapper'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('warn-effect-sync-wrapper'), recommended: 'warn' },
      type: 'suggestion',
    },
  },
  'no-inline-schema-compile': {
    create(context) {
      let schemaNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          schemaNames = collectImportNames(node, ['effect/Schema', 'effect'], 'Schema');
        },
        CallExpression(node: NodeLike) {
          const call = getStaticMemberCall(node);
          const [firstArg] = getCallExpressionArguments(node);
          if (
            call !== null &&
            schemaCompilerMemberSet.has(call.propertyName) &&
            isNamespaceImportReference(context, call.object, schemaNames) &&
            hasAncestor(node, isFunctionLike) &&
            isImmediatelyInvoked(node) &&
            isStaticSchemaReference(context, firstArg, schemaNames)
          ) {
            context.report({
              message: message('no-inline-schema-compile'),
              node: call.member,
            });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-inline-schema-compile'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-model-overlay-cast': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        TSAsExpression(node: NodeLike) {
          const typeAnnotation = getNodeField(node, 'typeAnnotation');
          const parent = getNodeField(node, 'parent');
          const grandparent = isNodeLike(parent) ? getNodeField(parent, 'parent') : null;
          if (
            simpleProgramGate(context, program) &&
            isNodeLike(parent) &&
            parent.type === 'VariableDeclarator' &&
            getNodeField(parent, 'init') === node &&
            isNodeLike(grandparent) &&
            grandparent.type === 'VariableDeclaration' &&
            getNodeField(grandparent, 'kind') === 'const' &&
            nodeText(context, isNodeLike(typeAnnotation) ? typeAnnotation : node) !== 'const'
          ) {
            context.report({ message: message('no-model-overlay-cast'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-model-overlay-cast'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-naked-object-state-update': {
    create(context) {
      let program: ESTree.Program | null = null;
      let refNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          program = node;
          refNames = collectImportNames(node, ['effect/Ref', 'effect'], 'Ref');
        },
        CallExpression(node: NodeLike) {
          if (!simpleProgramGate(context, program)) {
            return;
          }

          if (isStaticCall(node, 'JSON', 'stringify')) {
            context.report({ message: message('no-naked-object-state-update'), node });
            return;
          }

          if (isRefTransitionCall(context, node, refNames)) {
            const [, updater] = getCallExpressionArguments(node);
            if (returnsSpreadObject(updater)) {
              context.report({ message: message('no-naked-object-state-update'), node });
            }
          }

          const isObjectRebuild =
            isObjectEntriesFromEntriesCall(node) || isEmptyTargetObjectAssignCall(node);
          if (
            isObjectRebuild &&
            hasAncestor(node, (ancestor) => isRefTransitionCall(context, ancestor, refNames))
          ) {
            context.report({ message: message('no-naked-object-state-update'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-naked-object-state-update'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-redundant-primitive-cast': {
    create(context) {
      const check = (node: NodeLike): void => {
        if (
          !isConfigOrToolingFile(context.filename) &&
          isPrimitiveType(getNodeField(node, 'typeAnnotation')) &&
          isIdentifierOrMember(getNodeField(node, 'expression'))
        ) {
          context.report({ message: message('no-redundant-primitive-cast'), node });
        }
      };
      return { TSAsExpression: check, TSTypeAssertion: check };
    },
    meta: {
      docs: { description: message('no-redundant-primitive-cast'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-return-in-arrow': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        ReturnStatement(node: NodeLike) {
          if (!simpleProgramGate(context, program) || hasSchemaFilterAncestor(node)) {
            return;
          }

          const arrow = arrowFunctionAncestor(node);
          if (arrow !== null && isInsideCallArguments(arrow)) {
            context.report({ message: message('no-return-in-arrow'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-return-in-arrow'), recommended: 'warn' },
      type: 'suggestion',
    },
  },
  'no-switch-statement': {
    create(context) {
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
        },
        SwitchStatement(node: NodeLike) {
          if (simpleProgramGate(context, program)) {
            context.report({ message: message('no-switch-statement'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-switch-statement'), recommended: 'error' },
      type: 'suggestion',
    },
  },
  'no-ts-nocheck': {
    create(context) {
      return {
        Program(node: ESTree.Program) {
          if (context.sourceCode.text.includes('@ts-nocheck')) {
            context.report({ message: message('no-ts-nocheck'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-ts-nocheck'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-unknown-boolean-coercion-helper': {
    create(context) {
      let hasEffectImport = false;
      let hasNullOrElse = false;
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
          const matchNames = collectImportNames(node, ['effect/Match', 'effect'], 'Match');
          hasNullOrElse = hasMatchOrElseNull(context, node, matchNames);
        },
        BinaryExpression(node: NodeLike) {
          if (!hasEffectImport || !hasNullOrElse) {
            return;
          }
          if (isTypeofBooleanEquality(node)) {
            context.report({ message: message('no-unknown-boolean-coercion-helper'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-unknown-boolean-coercion-helper'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-json-parse': {
    create(context) {
      let hasEffectImport = false;
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
        },
        CallExpression(node: NodeLike) {
          if (hasEffectImport && isStaticCall(node, 'JSON', 'parse')) {
            context.report({ message: message('no-json-parse'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-json-parse'), recommended: 'error' },
      type: 'problem',
    },
  },
  'prefer-schema-inferred-types': {
    create(context) {
      let schemaNames = new Set<string>();
      const schemaBases = new Set<string>();
      const candidates: Array<NodeLike> = [];
      const candidateNames = new Map<NodeLike, string>();
      return {
        Program(node: ESTree.Program) {
          schemaNames = namesFor(node, 'effect/Schema', 'Schema');
        },
        VariableDeclarator(node: NodeLike) {
          const id = getNodeField(node, 'id');
          if (
            isIdentifierName(id) &&
            isKnownSchemaModelCall(context, getNodeField(node, 'init'), schemaNames)
          ) {
            const base = schemaBaseName(id.name);
            if (base !== null) {
              schemaBases.add(base);
            }
          }
        },
        TSInterfaceDeclaration(node: NodeLike) {
          const id = getNodeField(node, 'id');
          if (isIdentifierName(id)) {
            candidates.push(node);
            candidateNames.set(node, id.name);
          }
        },
        TSTypeAliasDeclaration(node: NodeLike) {
          const id = getNodeField(node, 'id');
          if (isIdentifierName(id) && isObjectTypeAlias(node)) {
            candidates.push(node);
            candidateNames.set(node, id.name);
          }
        },
        'Program:exit'() {
          for (const candidate of candidates) {
            const name = candidateNames.get(candidate) ?? null;
            if (name !== null && schemaBases.has(name)) {
              context.report({ message: message('prefer-schema-inferred-types'), node: candidate });
            }
          }
        },
      };
    },
    meta: {
      docs: { description: message('prefer-schema-inferred-types'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-promise-catch': {
    create(context) {
      let effectNames = new Set<string>();
      let hasEffectImport = false;
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
          effectNames = collectImportNames(node, ['effect/Effect', 'effect'], 'Effect');
        },
        CallExpression(node: NodeLike) {
          const callee = getNodeField(node, 'callee');
          if (hasEffectImport && memberPropertyName(callee) === 'catch') {
            const object = isNodeLike(callee) ? getNodeField(callee, 'object') : null;
            if (
              !isIdentifierName(object) ||
              !isNamespaceImportReference(context, object, effectNames)
            ) {
              context.report({ message: message('no-promise-catch'), node });
            }
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-promise-catch'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-promise-reject': {
    create(context) {
      let hasEffectImport = false;
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
        },
        CallExpression(node: NodeLike) {
          if (!hasEffectImport) {
            return;
          }
          const callee = getNodeField(node, 'callee');
          if (isStaticCall(node, 'Promise', 'reject')) {
            context.report({ message: message('no-promise-reject'), node });
            return;
          }

          if (!isIdentifierName(callee)) {
            return;
          }

          const executor = enclosingPromiseExecutor(node);
          const rejectName = isNodeLike(executor) ? promiseRejectParameterName(executor) : null;
          if (
            executor !== null &&
            rejectName !== null &&
            promiseRejectAliases(executor, rejectName).has(callee.name)
          ) {
            context.report({ message: message('no-promise-reject'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-promise-reject'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-instanceof-error': {
    create(context) {
      let hasEffectImport = false;
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
        },
        BinaryExpression(node: NodeLike) {
          const right = getNodeField(node, 'right');
          if (
            hasEffectImport &&
            getNodeField(node, 'operator') === 'instanceof' &&
            isIdentifierName(right) &&
            right.name === 'Error'
          ) {
            context.report({ message: message('no-instanceof-error'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-instanceof-error'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-instanceof-tagged-error': {
    create(context) {
      let hasEffectImport = false;
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
        },
        BinaryExpression(node: NodeLike) {
          const right = getNodeField(node, 'right');
          if (
            hasEffectImport &&
            getNodeField(node, 'operator') === 'instanceof' &&
            isIdentifierName(right) &&
            right.name !== 'Error' &&
            right.name.endsWith('Error')
          ) {
            context.report({ message: message('no-instanceof-tagged-error'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-instanceof-tagged-error'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-manual-tag-check': {
    create(context) {
      let hasEffectImport = false;
      const importedTags = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
        },
        ImportDeclaration(node: ESTree.ImportDeclaration) {
          for (const tag of importEffectDataTags(node)) {
            importedTags.add(tag);
          }
        },
        BinaryExpression(node: NodeLike) {
          const operator = getNodeField(node, 'operator');
          if (
            hasEffectImport &&
            !effectDataTagComparison(node, importedTags) &&
            ((operator === 'in' && isTagProperty(getNodeField(node, 'left'))) ||
              (typeof operator === 'string' &&
                ['===', '!==', '==', '!='].includes(operator) &&
                (isTagAccess(getNodeField(node, 'left')) ||
                  isTagAccess(getNodeField(node, 'right')))))
          ) {
            context.report({ message: message('no-manual-tag-check'), node });
          }
        },
        MemberExpression(node: NodeLike) {
          if (
            hasEffectImport &&
            isTagProperty(getNodeField(node, 'property')) &&
            !tagAccessBelongsToEffectDataTagComparison(node, importedTags)
          ) {
            context.report({ message: message('no-manual-tag-check'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-manual-tag-check'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-effect-internal-tags': {
    create(context) {
      const importedTags = new Set<string>();
      return {
        ImportDeclaration(node: ESTree.ImportDeclaration) {
          for (const tag of importEffectDataTags(node)) {
            importedTags.add(tag);
          }
        },
        BinaryExpression(node: NodeLike) {
          if (effectDataTagComparison(node, importedTags)) {
            context.report({ message: message('no-effect-internal-tags'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-effect-internal-tags'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-unknown-error-message': {
    create(context) {
      let hasEffectImport = false;
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
        },
        CallExpression(node: NodeLike) {
          if (
            hasEffectImport &&
            isCallToIdentifier(node, 'String') &&
            getCallExpressionArguments(node).some((argument) =>
              isErrorLikeName(expressionName(argument)),
            )
          ) {
            context.report({ message: message('no-unknown-error-message'), node });
          }
        },
        MemberExpression(node: NodeLike) {
          if (
            hasEffectImport &&
            propertyName(getNodeField(node, 'property')) === 'message' &&
            isErrorLikeName(expressionName(getNodeField(node, 'object')))
          ) {
            context.report({ message: message('no-unknown-error-message'), node });
          }
        },
        VariableDeclarator(node: NodeLike) {
          const id = getNodeField(node, 'id');
          const init = getNodeField(node, 'init');
          if (
            hasEffectImport &&
            objectPatternHasMessageProperty(id) &&
            isErrorLikeName(expressionName(init))
          ) {
            context.report({ message: message('no-unknown-error-message'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-unknown-error-message'), recommended: 'error' },
      type: 'problem',
    },
  },
  'prefer-yield-tagged-error': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        YieldExpression(node: NodeLike) {
          const argument = getNodeField(node, 'argument');
          if (
            getNodeField(node, 'delegate') === true &&
            isNodeLike(argument) &&
            isBoundMemberCall(context, argument, effectNames, 'fail') &&
            taggedErrorName(firstArgument(argument)) !== null
          ) {
            context.report({ message: message('prefer-yield-tagged-error'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('prefer-yield-tagged-error'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-redundant-error-factory': {
    create(context) {
      let hasEffectImport = false;
      const helperName = (node: NodeLike): string | null => {
        // VariableDeclarator initializers (FunctionExpression, ArrowFunctionExpression):
        // Use the declarator variable name; inner function id (if any) is irrelevant.
        const parent = getNodeField(node, 'parent');
        if (
          isNodeLike(parent) &&
          parent.type === 'VariableDeclarator' &&
          getNodeField(parent, 'init') === node
        ) {
          const parentId = getNodeField(parent, 'id');
          return isIdentifierName(parentId) ? parentId.name : null;
        }
        // FunctionDeclaration: use its own declared id.
        const id = getNodeField(node, 'id');
        return isIdentifierName(id) ? id.name : null;
      };
      const isDeclaredHelper = (node: NodeLike): boolean => {
        if (node.type === 'FunctionDeclaration') {
          return true;
        }

        const parent = getNodeField(node, 'parent');
        return (
          isNodeLike(parent) &&
          parent.type === 'VariableDeclarator' &&
          getNodeField(parent, 'init') === node
        );
      };
      const check = (node: NodeLike): void => {
        if (!isDeclaredHelper(node)) {
          return;
        }

        const name = helperName(node);
        const returned = functionReturnNode(node);
        const params = parameterNames(node);
        const constructorArgs = isNodeLike(returned) ? getCallExpressionArguments(returned) : [];
        const forwardsOnly =
          constructorArgs.length === 0 ||
          (constructorArgs.length === singleItemCount &&
            isForwardedArgument(constructorArgs[firstItemIndex], params));
        if (
          hasEffectImport &&
          name !== null &&
          name.endsWith('Error') &&
          taggedErrorName(returned) !== null &&
          forwardsOnly
        ) {
          context.report({ message: message('no-redundant-error-factory'), node });
        }
      };
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
        },
        FunctionDeclaration: check,
        FunctionExpression: check,
        ArrowFunctionExpression: check,
      };
    },
    meta: {
      docs: { description: message('no-redundant-error-factory'), recommended: 'error' },
      type: 'problem',
    },
  },
  'prefer-effect-predicate': {
    create(context) {
      let hasEffectImport = false;
      const isVariablePredicateHelper = (node: NodeLike): boolean => {
        const parent = getNodeField(node, 'parent');
        return (
          isNodeLike(parent) &&
          parent.type === 'VariableDeclarator' &&
          getNodeField(parent, 'init') === node
        );
      };
      const isInlineFilterPredicate = (node: NodeLike): boolean => {
        const parent = getNodeField(node, 'parent');
        const callee = getNodeField(parent, 'callee');
        return (
          isCallExpression(parent) &&
          getCallExpressionArguments(parent)[firstItemIndex] === node &&
          memberPropertyName(callee) === 'filter'
        );
      };
      const checkPredicate = (node: NodeLike): void => {
        const isExecutorPredicateScope =
          node.type === 'FunctionDeclaration' ||
          isVariablePredicateHelper(node) ||
          isInlineFilterPredicate(node);
        if (hasEffectImport && isExecutorPredicateScope && isNullishPredicate(node)) {
          context.report({ message: message('prefer-effect-predicate'), node });
        }
      };
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
        },
        ArrowFunctionExpression: checkPredicate,
        FunctionDeclaration: checkPredicate,
        FunctionExpression: checkPredicate,
      };
    },
    meta: {
      docs: { description: message('prefer-effect-predicate'), recommended: 'error' },
      type: 'suggestion',
    },
  },
  'prefer-effect-fn': {
    create(context) {
      let effectNames = new Set<string>();
      const checkFunction = (node: NodeLike): void => {
        if (isNamedWrapperDeclaration(node) && effectGenWrapperBody(context, node, effectNames)) {
          context.report({ message: message('prefer-effect-fn'), node });
        }
      };
      return {
        Program(node: ESTree.Program) {
          effectNames = collectImportNames(node, ['effect/Effect', 'effect'], 'Effect');
        },
        ArrowFunctionExpression: checkFunction,
        FunctionDeclaration: checkFunction,
        FunctionExpression: checkFunction,
      };
    },
    meta: {
      docs: { description: message('prefer-effect-fn'), recommended: 'error' },
      type: 'suggestion',
    },
  },
  'prevent-dynamic-imports': {
    create(context) {
      return {
        ImportExpression(node: NodeLike) {
          context.report({ message: message('prevent-dynamic-imports'), node });
        },
      };
    },
    meta: {
      docs: { description: message('prevent-dynamic-imports'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-cross-package-relative-imports': createNoCrossPackageRelativeImportsRule(),
};

export const catalogRuleDefinitions = Object.entries(catalogRules).map(([name, rule]) => ({
  name,
  rule,
})) satisfies ReadonlyArray<CatalogRuleDefinition>;

export { catalogRules };
