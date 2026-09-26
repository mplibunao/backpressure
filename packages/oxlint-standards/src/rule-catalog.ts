/* oxlint-disable max-lines -- The catalog keeps validated rule visitors colocated with their shared AST helpers. */
// oxlint-disable-next-line @mplibunao/oxlint-standards/no-ts-nocheck -- string literal, not a real @ts-nocheck directive
import { existsSync } from 'node:fs';

import type { Context, ESTree, Rule } from '@oxlint/plugins';

import {
  getCallExpressionArguments,
  getNodeField,
  getStaticMemberCall,
  getStringLiteralValue,
  hasAncestor,
  hasSpreadArgument,
  isIdentifierName,
  isNodeLike,
  isStringLiteral,
  type NodeLike,
  peelTransparentExpression,
  visitSelfAndDescendants,
} from './utils/ast.js';
import {
  caughtValueViolations,
  effectTryCatchParameter,
  isMessageDestructuringAssignment,
  isMessageMemberRead,
  objectPatternHasMessage,
} from './utils/caught-values.js';
import {
  collectEffectCompositionFacts,
  firstLadderContinuation,
  isDataFirstTransformingNesting,
  isEffectLadder,
  isEffectStepCallback,
  isFlatMapLadderShape,
  type EffectCompositionFacts,
} from './utils/effect-composition.js';
import {
  functionReturnNode,
  isEffectGeneratorBody,
  isFunctionLike,
  isInlineFunction,
  nearestEnclosingFunction,
  visitSynchronousBody,
} from './utils/effect-context.js';
import { schemaCodecFactoryMembers } from './utils/effect-identifiers.js';
import {
  blanketRecoveryHandler,
  isBlindHandler,
  isRecordedFirst,
} from './utils/effect-recovery.js';
import {
  collectOwnershipFacts,
  containsAnyBoundNamespaceCall,
  isEffectDataTagComparison,
  isOwnedElsewhere,
  isTagEqualityComparison,
  type OwnershipFacts,
} from './utils/effect-ownership.js';
import { ruleMessage } from './rule-messages.js';
import {
  boundAtomEffectMember,
  boundNamespaceCallMember,
  collectImportNames,
  collectReactivityModuleNames,
  getImportSource,
  hasEffectStackImport,
  isNamespaceImportReference,
  isUnshadowedGlobal,
} from './utils/imports.js';
import { containsSideEffectCall } from './utils/side-effects.js';

interface CatalogRuleDefinition {
  readonly name: string;
  readonly rule: Rule;
}

const schemaCodecFactoryMemberSet = new Set(schemaCodecFactoryMembers);
const primitiveTypes = new Set(['TSStringKeyword', 'TSNumberKeyword', 'TSBooleanKeyword']);
const lastPathPartOffset = -1;
const firstItemIndex = 0;
const secondItemIndex = 1;
const singleItemCount = 1;
const pairItemCount = 2;
const escapeHatches = new Set(['die', 'orDie']);
const reactHookBans = new Set([
  'useEffect',
  'useReducer',
  'useContext',
  'useCallback',
  'useSyncExternalStore',
]);
// `Effect.as` is dual(2): the value is the only argument data-last and the second data-first,
// where the first argument is the source Effect.
const effectAsValueIndexByArity = new Map([
  [singleItemCount, firstItemIndex],
  [pairItemCount, secondItemIndex],
]);
const nullishOperators = new Set(['!==', '!=', '===', '==']);
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
): boolean => boundNamespaceCallMember(context, node, namespaceNames) === propertyName;

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
): boolean => boundNamespaceCallMember(context, node, namespaceNames) !== null;

const memberPropertyName = (memberExpression: unknown): string | null => {
  if (!isNodeLike(memberExpression) || memberExpression.type !== 'MemberExpression') {
    return null;
  }

  const property = getNodeField(memberExpression, 'property');
  return isIdentifierName(property) ? property.name : getStringLiteralValue(property);
};

const pipeStepArguments = (node: NodeLike): readonly unknown[] => {
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

const firstArgument = (node: NodeLike): unknown => getCallExpressionArguments(node)[0] ?? null;

const isStaticCall = (node: NodeLike, objectName: string, propertyName: string): boolean => {
  const call = getStaticMemberCall(node);
  return call !== null && call.objectName === objectName && call.propertyName === propertyName;
};

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
    const returned = functionReturnNode(firstArg);
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
  const member = boundNamespaceCallMember(context, node, namespaceNames);
  return member !== null && propertyNames.has(member);
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

const isNullLiteral = (node: unknown): boolean =>
  isLiteralValue(peelTransparentExpression(node), null);

// The fallback of `value ?? fallback`, or null for any other expression.
const nullishCoalesceFallback = (node: unknown): unknown => {
  const expression = peelTransparentExpression(node);
  return isNodeLike(expression) &&
    expression.type === 'LogicalExpression' &&
    getNodeField(expression, 'operator') === '??'
    ? peelTransparentExpression(getNodeField(expression, 'right'))
    : null;
};

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

// `Effect.as` evaluates its value argument when the Effect is built. A side-effect call there runs
// once, early, and an Effect passed as the value never runs.
const hasEagerEffectAsValue = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
  atomNames: ReadonlySet<string>,
): boolean => {
  const args = getCallExpressionArguments(node);
  // A spread hides the real argument count, so the overload and its value slot are unknown.
  const valueIndex = hasSpreadArgument(args)
    ? globalThis.undefined
    : effectAsValueIndexByArity.get(args.length);
  return (
    valueIndex !== globalThis.undefined &&
    isBoundMemberCall(context, node, effectNames, 'as') &&
    containsSideEffectCall(context, args[valueIndex], effectNames, atomNames)
  );
};

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

const objectFunctionValues = (node: unknown): readonly unknown[] => {
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
  readonly matchNames: ReadonlySet<string>;
  readonly optionNames: ReadonlySet<string>;
}

const containsObjectBranchExpression = (
  context: Context,
  node: unknown,
  branchContext: ObjectPropertyBranchContext,
): boolean => {
  const { matchNames, optionNames } = branchContext;
  if (!isNodeLike(node)) {
    return false;
  }

  if (isAnyBoundMemberCall(context, node, optionNames, new Set(['match']))) {
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

const isObjectTypeAlias = (node: NodeLike): boolean => {
  const typeAnnotation = getNodeField(node, 'typeAnnotation');
  return isNodeLike(typeAnnotation) && typeAnnotation.type === 'TSTypeLiteral';
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

const propertyName = (node: unknown): string | null =>
  isIdentifierName(node) ? node.name : getStringLiteralValue(node);

// Branching on a tag: an equality with a static `_tag` read on either side, or a literal
// `'_tag' in value` presence test. A plain read such as logging the tag is not a branch.
const isManualTagCheck = (node: NodeLike): boolean => {
  const left = peelTransparentExpression(getNodeField(node, 'left'));
  return (
    isTagEqualityComparison(node) ||
    (getNodeField(node, 'operator') === 'in' &&
      isStringLiteral(left) &&
      getStringLiteralValue(left) === '_tag')
  );
};

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

// Linear scan of an object's properties; returns the first matching value, or null on no match.
const findObjectProperty = (properties: unknown[], name: string): unknown => {
  for (const property of properties) {
    if (
      isNodeLike(property) &&
      property.type === 'Property' &&
      propertyName(getNodeField(property, 'key')) === name
    ) {
      return getNodeField(property, 'value');
    }
  }
  return null;
};

const objectPropertyValue = (node: unknown, name: string): unknown => {
  if (!isNodeLike(node) || node.type !== 'ObjectExpression') {
    return null;
  }
  const properties = getNodeField(node, 'properties');
  if (!Array.isArray(properties)) {
    return null;
  }
  return findObjectProperty(properties, name);
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

const taggedErrorName = (node: unknown): string | null => {
  if (!isNodeLike(node) || node.type !== 'NewExpression') {
    return null;
  }
  const callee = getNodeField(node, 'callee');
  return isIdentifierName(callee) && callee.name !== 'Error' && callee.name.endsWith('Error')
    ? callee.name
    : null;
};

// Port executor reference: also accept AssignmentPattern (default values) and
// RestElement (...rest) as forwardable parameter names alongside plain identifiers.
const collectParamName = (names: Set<string>, param: NodeLike): void => {
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
};

const parameterNames = (node: NodeLike): Set<string> => {
  const params = getNodeField(node, 'params');
  if (!Array.isArray(params)) {
    return new Set();
  }
  const names = new Set<string>();
  for (const param of params) {
    if (isNodeLike(param)) {
      collectParamName(names, param);
    }
  }
  return names;
};

// Returns null when the node type is complex enough to require the ObjectExpression spread check.
const isSimpleForwardedArg = (node: NodeLike, params: ReadonlySet<string>): boolean | null => {
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
  return null;
};

const isForwardedArgument = (node: unknown, params: ReadonlySet<string>): boolean => {
  if (!isNodeLike(node)) {
    return false;
  }
  const shortCircuit = isSimpleForwardedArg(node, params);
  if (shortCircuit !== null) {
    return shortCircuit;
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

// Returns the single identifier parameter name, or null if the function signature doesn't match.
const singleIdentifierParamName = (node: NodeLike): string | null => {
  const params = getNodeField(node, 'params');
  if (!Array.isArray(params) || params.length !== 1) {
    return null;
  }
  const param = params[0];
  return isIdentifierName(param) ? param.name : null;
};

// Checks that the binary expression is a nullish comparison against the named parameter.
const isNullishBinaryExpression = (predicateExpression: NodeLike, paramName: string): boolean => {
  const operator = getNodeField(predicateExpression, 'operator');
  const left = getNodeField(predicateExpression, 'left');
  const right = getNodeField(predicateExpression, 'right');
  return (
    typeof operator === 'string' &&
    nullishOperators.has(operator) &&
    ((isIdentifierName(left) && left.name === paramName && isNullishLiteral(right)) ||
      (isIdentifierName(right) && right.name === paramName && isNullishLiteral(left)))
  );
};

// A named function (a declaration, or an arrow or function expression initializing a `const`)
// whose body is only `Effect.gen(...)`, returned directly or as its single statement.
const isNamedEffectGenWrapper = (
  context: Context,
  node: NodeLike,
  effectNames: ReadonlySet<string>,
): boolean => {
  const parent = getNodeField(node, 'parent');
  const isNamed =
    node.type === 'FunctionDeclaration'
      ? isIdentifierName(getNodeField(node, 'id'))
      : isNodeLike(parent) &&
        parent.type === 'VariableDeclarator' &&
        getNodeField(parent, 'init') === node &&
        isIdentifierName(getNodeField(parent, 'id'));
  return (
    isNamed && boundNamespaceCallMember(context, functionReturnNode(node), effectNames) === 'gen'
  );
};

const isNullishPredicate = (node: NodeLike): boolean => {
  if (!isFunctionLike(node)) {
    return false;
  }
  const paramName = singleIdentifierParamName(node);
  if (paramName === null) {
    return false;
  }
  const body = getNodeField(node, 'body');
  const predicateExpression =
    isNodeLike(body) && body.type === 'BlockStatement' ? functionReturnNode(node) : body;
  if (!isNodeLike(predicateExpression) || predicateExpression.type !== 'BinaryExpression') {
    return false;
  }
  return isNullishBinaryExpression(predicateExpression, paramName);
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

const workspacePackageRoot = (absolutePath: string): string | null => {
  const parts = absolutePath.split('/');
  // Walk upward from the input path itself (handles directory imports and grouped workspaces).
  // Stop at the nearest ancestor that has package.json and sits under a workspace marker.
  const { length: partsLen } = parts;
  for (let end = partsLen; end > 0; end -= 1) {
    const candidate = parts.slice(0, end).join('/');
    if (
      existsSync(`${candidate}/package.json`) &&
      parts.slice(0, end - 1).some((part) => workspaceRootMarkers.has(part))
    ) {
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
    } else {
      fileParts.push(part);
    }
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

// Handles both the direct Promise.reject() form and any reject-parameter aliases
// bound inside the Promise constructor's executor function.
const checkPromiseReject = (context: Context, node: NodeLike): void => {
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
};

const catalogRules: Record<string, Rule> = {
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
      return {
        Program(node: ESTree.Program) {
          atomNames = collectReactivityModuleNames(node, 'Atom');
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          const callback = firstArgument(node);
          if (
            !isBoundMemberCall(context, node, effectNames, 'sync') ||
            !isInlineFunction(callback)
          ) {
            return;
          }
          visitSynchronousBody(callback, (descendant) => {
            const member = boundAtomEffectMember(context, descendant, atomNames);
            if (member !== null) {
              context.report({
                message: message('no-atom-registry-effect-sync', { method: `Atom.${member}` }),
                node: descendant,
              });
            }
          });
        },
      };
    },
    meta: {
      docs: {
        description: message('no-atom-registry-effect-sync', {
          method: 'Atom.get, set, update, modify, or refresh',
        }),
        recommended: 'error',
      },
      type: 'problem',
    },
  },
  'no-branch-in-object': {
    create(context) {
      let matchNames = new Set<string>();
      let optionNames = new Set<string>();
      let program: ESTree.Program | null = null;
      return {
        Program(node: ESTree.Program) {
          program = node;
          matchNames = namesFor(node, 'effect/Match', 'Match');
          optionNames = namesFor(node, 'effect/Option', 'Option');
        },
        Property(node: NodeLike) {
          if (
            simpleProgramGate(context, program) &&
            hasObjectPropertyBranch(node, { context, matchNames, optionNames })
          ) {
            context.report({ message: message('no-branch-in-object'), node });
          }
        },
        CallExpression(node: NodeLike) {
          if (
            simpleProgramGate(context, program) &&
            isObjectReturningIifeWithBranchArgument(context, node, {
              context,
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
            boundAtomEffectMember(context, descendant, atomNames) === 'set' ||
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
          atomNames = collectReactivityModuleNames(node, 'Atom');
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
          fiberNames = namesFor(node, 'effect/Fiber', 'Fiber');
          refNames = namesFor(node, 'effect/Ref', 'Ref');
          reactivityNames = collectReactivityModuleNames(node, 'Reactivity');
          subscriptionRefNames = namesFor(node, 'effect/SubscriptionRef', 'SubscriptionRef');
        },
        CallExpression(node: NodeLike) {
          if (!isBoundMemberCall(context, node, effectNames, 'all')) {
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
  'no-effect-bind': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (isBoundMemberCall(context, node, effectNames, 'bind')) {
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
      let facts: OwnershipFacts | null = null;
      return {
        Program(node: ESTree.Program) {
          facts = collectOwnershipFacts(context, node);
        },
        CallExpression(node: NodeLike) {
          if (
            facts !== null &&
            isDataFirstTransformingNesting(facts, node) &&
            !isOwnedElsewhere('no-effect-call-in-effect-arg', facts, node)
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
  'no-effect-ladder': {
    create(context) {
      let facts: EffectCompositionFacts | null = null;
      return {
        Program(node: ESTree.Program) {
          facts = collectEffectCompositionFacts(context, node);
        },
        CallExpression(node: NodeLike) {
          if (facts !== null && isEffectLadder(facts, node)) {
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
  'no-flatmap-ladder': {
    create(context) {
      let facts: OwnershipFacts | null = null;
      return {
        Program(node: ESTree.Program) {
          facts = collectOwnershipFacts(context, node);
        },
        CallExpression(node: NodeLike) {
          if (
            facts !== null &&
            isFlatMapLadderShape(facts, node) &&
            !isOwnedElsewhere('no-flatmap-ladder', facts, node)
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
          atomNames = collectReactivityModuleNames(node, 'Atom');
          effectNames = collectImportNames(node, ['effect/Effect', 'effect'], 'Effect');
        },
        CallExpression(node: NodeLike) {
          if (hasEagerEffectAsValue(context, node, effectNames, atomNames)) {
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
  'no-fromnullable-nullish-coalesce': {
    create(context) {
      let optionNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          optionNames = namesFor(node, 'effect/Option', 'Option');
        },
        CallExpression(node: NodeLike) {
          const args = getCallExpressionArguments(node);
          const fallback = nullishCoalesceFallback(args[firstItemIndex]);
          // Each constructor pairs with one fallback: `?? null` adds nothing to fromNullishOr, and
          // `?? undefined` makes fromUndefinedOr treat null as absent, which fromNullishOr states
          // directly. The two pairs are not interchangeable.
          const redundantFallback =
            (isBoundMemberCall(context, node, optionNames, 'fromNullishOr') &&
              isNullLiteral(fallback)) ||
            (isBoundMemberCall(context, node, optionNames, 'fromUndefinedOr') &&
              isIdentifierName(fallback) &&
              fallback.name === 'undefined' &&
              isUnshadowedGlobal(context, fallback));
          if (args.length === singleItemCount && redundantFallback) {
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
      let facts: EffectCompositionFacts | null = null;
      // Each step callback is one ladder at most, reported at its first inner continuation.
      const checkStepCallback = (node: NodeLike): void => {
        const continuation =
          facts !== null && isEffectStepCallback(facts, node)
            ? firstLadderContinuation(facts, node)
            : null;
        if (continuation !== null) {
          context.report({ message: message('no-pipe-ladder'), node: continuation });
        }
      };
      return {
        Program(node: ESTree.Program) {
          facts = collectEffectCompositionFacts(context, node);
        },
        ArrowFunctionExpression: checkStepCallback,
        FunctionExpression: checkStepCallback,
      };
    },
    meta: {
      docs: { description: message('no-pipe-ladder'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-react-state': {
    create(context) {
      return {
        CallExpression(node: NodeLike) {
          const callee = getNodeField(node, 'callee');
          const name = isIdentifierName(callee) ? callee.name : memberPropertyName(callee);
          if (name !== null && reactHookBans.has(name)) {
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
  'no-return-null': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        ReturnStatement(node: NodeLike) {
          const owner = nearestEnclosingFunction(node);
          if (
            isNullLiteral(getNodeField(node, 'argument')) &&
            owner !== null &&
            isEffectGeneratorBody(context, owner, effectNames)
          ) {
            context.report({ message: message('no-return-null'), node });
          }
        },
        CallExpression(node: NodeLike) {
          const args = getCallExpressionArguments(node);
          if (
            args.length === singleItemCount &&
            isNullLiteral(args[firstItemIndex]) &&
            isBoundMemberCall(context, node, effectNames, 'succeed')
          ) {
            context.report({ message: message('no-return-null'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-return-null'), recommended: 'warn' },
      type: 'suggestion',
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
  'no-inline-schema-compile': {
    create(context) {
      let schemaNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          schemaNames = collectImportNames(node, ['effect/Schema', 'effect'], 'Schema');
        },
        CallExpression(node: NodeLike) {
          const call = getStaticMemberCall(node);
          const [schema] = getCallExpressionArguments(node);
          // The schema-construction call is the evidence. A hoisted identifier, member reference,
          // or schema parameter reuses one schema, and the parser cache is keyed by its AST.
          if (
            call !== null &&
            schemaCodecFactoryMemberSet.has(call.propertyName) &&
            isNamespaceImportReference(context, call.object, schemaNames) &&
            hasAncestor(node, isFunctionLike) &&
            isAnyBoundNamespaceMemberCall(context, peelTransparentExpression(schema), schemaNames)
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
      docs: { description: message('no-inline-schema-compile'), recommended: 'warn' },
      type: 'suggestion',
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
      const candidates: NodeLike[] = [];
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
          checkPromiseReject(context, node);
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
      let facts: OwnershipFacts | null = null;
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
          facts = collectOwnershipFacts(context, node);
        },
        BinaryExpression(node: NodeLike) {
          if (
            hasEffectImport &&
            facts !== null &&
            isManualTagCheck(node) &&
            !isOwnedElsewhere('no-manual-tag-check', facts, node)
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
      let facts: OwnershipFacts | null = null;
      return {
        Program(node: ESTree.Program) {
          facts = collectOwnershipFacts(context, node);
        },
        BinaryExpression(node: NodeLike) {
          if (facts !== null && isEffectDataTagComparison(node, facts.effectDataTags)) {
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
      let effectNames = new Set<string>();
      const candidates = {
        caughtParameters: [] as NodeLike[],
        messageDestructures: [] as NodeLike[],
        messageReads: [] as NodeLike[],
        stringCalls: [] as NodeLike[],
      };
      const collectParameter = (parameter: unknown): void => {
        if (isNodeLike(parameter)) {
          candidates.caughtParameters.push(parameter);
        }
      };
      return {
        Program(node: ESTree.Program) {
          hasEffectImport = hasEffectStackImport(node);
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CatchClause(node: NodeLike) {
          collectParameter(getNodeField(node, 'param'));
        },
        CallExpression(node: NodeLike) {
          collectParameter(effectTryCatchParameter(context, node, effectNames));
          candidates.stringCalls.push(node);
        },
        MemberExpression(node: NodeLike) {
          if (isMessageMemberRead(node)) {
            candidates.messageReads.push(node);
          }
        },
        VariableDeclarator(node: NodeLike) {
          if (objectPatternHasMessage(getNodeField(node, 'id'))) {
            candidates.messageDestructures.push(node);
          }
        },
        AssignmentExpression(node: NodeLike) {
          if (isMessageDestructuringAssignment(node)) {
            candidates.messageDestructures.push(node);
          }
        },
        'Program:exit'() {
          const violations = hasEffectImport ? caughtValueViolations(context, candidates) : [];
          for (const node of violations) {
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
  'no-string-error-channel': {
    create(context) {
      let effectNames = new Set<string>();
      return {
        Program(node: ESTree.Program) {
          effectNames = namesFor(node, 'effect/Effect', 'Effect');
        },
        CallExpression(node: NodeLike) {
          const args = getCallExpressionArguments(node);
          // Type assertions and parentheses do not change the failure value, so
          // `Effect.fail('timeout' as const)` is still a string failure.
          const failure = peelTransparentExpression(args[firstItemIndex]);
          if (
            args.length === singleItemCount &&
            isBoundMemberCall(context, node, effectNames, 'fail') &&
            isNodeLike(failure) &&
            (isStringLiteral(failure) || failure.type === 'TemplateLiteral')
          ) {
            context.report({ message: message('no-string-error-channel'), node: failure });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-string-error-channel'), recommended: 'error' },
      type: 'problem',
    },
  },
  'no-discarded-failure': {
    create(context) {
      let facts: EffectCompositionFacts | null = null;
      return {
        Program(node: ESTree.Program) {
          facts = collectEffectCompositionFacts(context, node);
        },
        CallExpression(node: NodeLike) {
          const handler = facts === null ? null : blanketRecoveryHandler(facts, node);
          if (
            facts !== null &&
            handler !== null &&
            isBlindHandler(handler) &&
            !isRecordedFirst(facts, node)
          ) {
            context.report({ message: message('no-discarded-failure'), node });
          }
        },
      };
    },
    meta: {
      docs: { description: message('no-discarded-failure'), recommended: 'error' },
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
  // Overlaps effecttsgo/effect-fn-opportunity on purpose: under a consumer tsconfig that uses
  // `extends`, the patched oxlint route runs that rule on upstream-default options, which skip
  // these wrappers. This AST check reports them without a TypeScript project.
  'prefer-effect-fn': {
    create(context) {
      let effectNames = new Set<string>();
      const checkFunction = (node: NodeLike): void => {
        if (isNamedEffectGenWrapper(context, node, effectNames)) {
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
})) satisfies readonly CatalogRuleDefinition[];

export { catalogRules };
