import type { Context, ESTree } from '@oxlint/plugins';

import {
  getNodeField,
  getStaticMemberCall,
  getStringLiteralValue,
  isNodeLike,
  type NodeLike,
  peelTransparentExpression,
  staticMemberPropertyName,
  visitSelfAndDescendants,
} from './ast.js';
import {
  collectEffectCompositionFacts,
  isDataFirstTransformingNesting,
  isEffectLadder,
  isSourceOfEnclosingDataFirstNesting,
  type EffectCompositionFacts,
} from './effect-composition.js';
import { getImportSource, importSpecifierName, isNamespaceImportReference } from './imports.js';

export const containsAnyBoundNamespaceCall = (
  context: Context,
  node: unknown,
  namespaceNames: ReadonlySet<string>,
): boolean => {
  let found = false;
  const visit = (candidate: NodeLike): void => {
    const call = getStaticMemberCall(candidate);
    found =
      found || (call !== null && isNamespaceImportReference(context, call.object, namespaceNames));
  };

  visitSelfAndDescendants(node, visit);
  return found;
};

// The `_tag` values of v4 Effect data types that each module also exposes through public
// predicates and matchers. A v4 `Cause` has no tag of its own; its reasons are tagged.
const effectDataModuleTags = new Map([
  ['Cause', new Set(['Fail', 'Die', 'Interrupt'])],
  ['Exit', new Set(['Success', 'Failure'])],
  ['Option', new Set(['Some', 'None'])],
  ['Result', new Set(['Success', 'Failure'])],
]);

const importedEffectDataTags = (declaration: ESTree.ImportDeclaration): readonly string[] => {
  const source = getImportSource(declaration);
  if (source === null || declaration.importKind === 'type') {
    return [];
  }

  if (source.startsWith('effect/')) {
    return [...(effectDataModuleTags.get(source.slice('effect/'.length)) ?? [])];
  }

  if (source !== 'effect') {
    return [];
  }

  return declaration.specifiers.flatMap((specifier) =>
    specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type'
      ? [...(effectDataModuleTags.get(importSpecifierName(specifier) ?? '') ?? [])]
      : [],
  );
};

export const collectEffectDataTags = (program: ESTree.Program): Set<string> =>
  new Set(
    program.body.flatMap((statement) =>
      statement.type === 'ImportDeclaration' ? importedEffectDataTags(statement) : [],
    ),
  );

const equalityOperators = new Set(['===', '!==', '==', '!=']);

export const isStaticTagAccess = (node: unknown): boolean => {
  const access = peelTransparentExpression(node);
  // `value?._tag` wraps the member read in a ChainExpression.
  const member =
    isNodeLike(access) && access.type === 'ChainExpression'
      ? getNodeField(access, 'expression')
      : access;
  return staticMemberPropertyName(member) === '_tag';
};

export const isTagEqualityComparison = (node: NodeLike): boolean =>
  node.type === 'BinaryExpression' &&
  equalityOperators.has(String(getNodeField(node, 'operator'))) &&
  (isStaticTagAccess(getNodeField(node, 'left')) || isStaticTagAccess(getNodeField(node, 'right')));

// no-effect-internal-tags: a `_tag` equality against a tag of an imported Effect data module.
export const isEffectDataTagComparison = (
  node: NodeLike,
  effectDataTags: ReadonlySet<string>,
): boolean => {
  if (!isTagEqualityComparison(node)) {
    return false;
  }

  const left = getNodeField(node, 'left');
  const right = getNodeField(node, 'right');
  const tagAgainst = (access: unknown, literal: unknown): boolean => {
    const tag = getStringLiteralValue(peelTransparentExpression(literal));
    return isStaticTagAccess(access) && tag !== null && effectDataTags.has(tag);
  };
  return tagAgainst(left, right) || tagAgainst(right, left);
};

export interface OwnershipFacts extends EffectCompositionFacts {
  readonly effectDataTags: ReadonlySet<string>;
}

export const collectOwnershipFacts = (
  context: Context,
  program: ESTree.Program,
): OwnershipFacts => ({
  ...collectEffectCompositionFacts(context, program),
  effectDataTags: collectEffectDataTags(program),
});

export interface OwnershipEdge {
  // The rule that stays silent on the shape.
  readonly reporter: string;
  // Rules that report the shape instead. The reporter itself is listed when an enclosing node
  // carries the same diagnostic, so the inner node is the same problem.
  readonly owners: readonly [string, ...string[]];
  readonly shape: string;
  // The owners' own reporting predicate: sharing it keeps suppression and reporting identical.
  readonly ownsShape: (facts: OwnershipFacts, node: NodeLike) => boolean;
}

// Every suppression in the catalog goes through this registry. An owner must be an active rule
// whose predicate holds for the exact shape, never a parent call that merely looks related.
export const ownershipRegistry: readonly OwnershipEdge[] = [
  {
    reporter: 'no-effect-call-in-effect-arg',
    owners: ['no-effect-ladder'],
    shape: 'const or returned data-first transformation with a deep first-argument chain',
    ownsShape: isEffectLadder,
  },
  {
    reporter: 'no-effect-call-in-effect-arg',
    owners: ['no-effect-call-in-effect-arg', 'no-effect-ladder'],
    shape: 'source of an enclosing data-first transformation',
    ownsShape: isSourceOfEnclosingDataFirstNesting,
  },
  {
    reporter: 'no-flatmap-ladder',
    owners: ['no-effect-call-in-effect-arg', 'no-effect-ladder'],
    shape: 'data-first transformation whose source is an Effect call',
    ownsShape: isDataFirstTransformingNesting,
  },
  {
    reporter: 'no-manual-tag-check',
    owners: ['no-effect-internal-tags'],
    shape: '_tag comparison against an imported Effect data-module tag',
    ownsShape: (facts, node) => isEffectDataTagComparison(node, facts.effectDataTags),
  },
];

export const isOwnedElsewhere = (
  reporter: string,
  facts: OwnershipFacts,
  node: NodeLike,
  registry: readonly OwnershipEdge[] = ownershipRegistry,
): boolean => registry.some((edge) => edge.reporter === reporter && edge.ownsShape(facts, node));

type OwnershipSeverity = 'off' | 'info' | 'warning' | 'error';

// The manifest fields the validator reads; manifest rows satisfy it structurally.
export interface OwnershipManifestRow {
  readonly collections: readonly string[];
  readonly disposition: string;
  readonly implementationStatus: string;
  readonly name: string;
  readonly severity: OwnershipSeverity;
}

const severityRank: Record<OwnershipSeverity, number> = {
  off: 0,
  info: 1,
  warning: 2,
  error: 3,
};

// Only this package's own rules share the catalog predicates; a built-in or delegated rule cannot
// report a suppressed catalog shape.
const customDispositions = new Set(['ported', 'reimplemented']);

const isActiveCustomRule = (
  entry: OwnershipManifestRow | undefined,
): entry is OwnershipManifestRow =>
  entry !== globalThis.undefined &&
  customDispositions.has(entry.disposition) &&
  entry.implementationStatus === 'implemented' &&
  entry.collections.length > 0;

// Pure: returns every broken edge instead of throwing, so tests can feed altered copies. An owner
// must be active, enabled in every collection that enables the reporter, and at least as severe;
// otherwise a quieter or absent owner would hide a real diagnostic.
export const validateOwnershipRegistry = (
  registry: readonly OwnershipEdge[],
  manifest: readonly OwnershipManifestRow[],
): readonly string[] => {
  const byName = new Map(manifest.map((entry) => [entry.name, entry]));
  return registry.flatMap((edge) => {
    const reporter = byName.get(edge.reporter);
    if (!isActiveCustomRule(reporter)) {
      return [`${edge.reporter} (${edge.shape}): reporter is not an active custom rule`];
    }

    return edge.owners.flatMap((ownerName) => {
      const owner = byName.get(ownerName);
      const label = `${edge.reporter} -> ${ownerName} (${edge.shape})`;
      if (!isActiveCustomRule(owner)) {
        return [`${label}: owner is not an active custom rule`];
      }
      const missingCollections = reporter.collections.filter(
        (collection) => !owner.collections.includes(collection),
      );
      return [
        ...(severityRank[owner.severity] < severityRank[reporter.severity]
          ? [`${label}: ${owner.severity} owner cannot suppress an ${reporter.severity} reporter`]
          : []),
        ...(missingCollections.length > 0
          ? [`${label}: owner is not enabled in ${missingCollections.join(', ')}`]
          : []),
      ];
    });
  });
};
