import ts from 'typescript';

import { fail } from './script-runtime.ts';

// One row per `Effect` member callable into an Effect; the lint package's rules consume the rows
// through the generated module, which documents the columns.
export type EffectSignatureRow = readonly [
  member: string,
  effectCounts: 'any' | readonly number[],
  ambiguousCounts: readonly number[],
  effectArgumentIndex: number | null,
];

// The judgment part of the table. The capture derives everything else from declarations, and a
// derived discriminator is accepted only when it equals the reviewed one.
export interface EffectSignatureReview {
  // Member name -> the argument whose being an Effect selects an Effect overload at an ambiguous
  // count, confirmed against the member's runtime `dual` predicate; `null` records that no such
  // argument exists.
  readonly effectArgumentIndexes: ReadonlyMap<string, number | null>;
  // Type references that denote an Effect in return and parameter positions.
  readonly effectTypeNames: ReadonlySet<string>;
}

type Signature = ts.SignatureDeclarationBase;

interface Reader {
  readonly file: ts.SourceFile;
  readonly review: EffectSignatureReview;
}

interface CapturedMember {
  // Only a member with an ambiguous count has a discriminator for the review to confirm.
  readonly ambiguous: boolean;
  readonly row: EffectSignatureRow;
}

// A rest parameter admits any count; counts above this bound are treated as not fitting, which
// only matters for members that mix a rest overload with a non-Effect overload.
const restArgumentCountLimit = 8;

const signaturesOf = (type: ts.TypeNode | undefined): readonly Signature[] => {
  if (type === globalThis.undefined) {
    return [];
  }
  if (ts.isParenthesizedTypeNode(type)) {
    return signaturesOf(type.type);
  }
  if (ts.isIntersectionTypeNode(type)) {
    return type.types.flatMap(signaturesOf);
  }
  if (ts.isTypeLiteralNode(type)) {
    return type.members.filter(ts.isCallSignatureDeclaration);
  }
  return ts.isFunctionTypeNode(type) ? [type] : [];
};

// Declaration files carry an annotation; source files may instead type a member through the
// explicit type arguments of its `dual<DataLast, DataFirst>(...)` initializer.
const declaredSignatures = (declaration: ts.VariableDeclaration): readonly Signature[] => {
  const initializer = declaration.initializer;
  const typeArguments =
    initializer !== globalThis.undefined && ts.isCallExpression(initializer)
      ? initializer.typeArguments
      : [];
  return declaration.type === globalThis.undefined
    ? (typeArguments ?? []).flatMap(signaturesOf)
    : signaturesOf(declaration.type);
};

const isEffectType = (reader: Reader, type: ts.TypeNode | undefined): boolean =>
  type !== globalThis.undefined &&
  ts.isTypeReferenceNode(type) &&
  reader.review.effectTypeNames.has(type.typeName.getText(reader.file));

const sortedUnique = (values: readonly number[]): readonly number[] =>
  [...new Set(values)].toSorted((left, right) => left - right);

const countRange = (minimum: number, maximum: number): readonly number[] =>
  Array.from({ length: maximum - minimum + 1 }, (_, offset) => minimum + offset);

const isOptionalTupleElement = (element: ts.TypeNode): boolean =>
  ts.isOptionalTypeNode(element) ||
  (ts.isNamedTupleMember(element) && element.questionToken !== globalThis.undefined);

const isRestTupleElement = (element: ts.TypeNode): boolean =>
  ts.isRestTypeNode(element) ||
  (ts.isNamedTupleMember(element) && element.dotDotDotToken !== globalThis.undefined);

// Lengths a rest parameter admits when its type, or the constraint of the type parameter it names,
// is a tuple or a union of tuples such as `[] | [onNone: LazyArg<E>]`; `null` when unbounded.
const restLengths = (
  signature: Signature,
  type: ts.TypeNode | undefined,
): readonly number[] | null => {
  if (
    type !== globalThis.undefined &&
    ts.isTypeReferenceNode(type) &&
    ts.isIdentifier(type.typeName)
  ) {
    const name = type.typeName.text;
    const typeParameter = signature.typeParameters?.find(
      (parameter) => parameter.name.text === name,
    );
    return typeParameter === globalThis.undefined
      ? null
      : restLengths(signature, typeParameter.constraint);
  }
  const members = type !== globalThis.undefined && ts.isUnionTypeNode(type) ? type.types : [type];
  const tuples = members.filter(
    (member) => member !== globalThis.undefined && ts.isTupleTypeNode(member),
  );
  if (
    tuples.length !== members.length ||
    tuples.some((tuple) => tuple.elements.some(isRestTupleElement))
  ) {
    return null;
  }
  return tuples.flatMap((tuple) =>
    countRange(
      tuple.elements.filter((element) => !isOptionalTupleElement(element)).length,
      tuple.elements.length,
    ),
  );
};

const restArgumentCounts = (
  signature: Signature,
  rest: ts.ParameterDeclaration,
  fixedCount: number,
  required: number,
): readonly number[] => {
  const lengths = restLengths(signature, rest.type);
  if (lengths === null) {
    return countRange(required, restArgumentCountLimit);
  }
  // An empty rest tuple lets trailing optional parameters go unpassed as well.
  const shortened = lengths.includes(0) ? countRange(required, fixedCount) : [];
  return sortedUnique([...shortened, ...lengths.map((length) => fixedCount + length)]);
};

const argumentCounts = (signature: Signature): readonly number[] => {
  const fixed = signature.parameters.filter(
    (parameter) => parameter.dotDotDotToken === globalThis.undefined,
  );
  const required = fixed.filter(
    (parameter) =>
      parameter.questionToken === globalThis.undefined &&
      parameter.initializer === globalThis.undefined,
  ).length;
  const rest = signature.parameters.find(
    (parameter) => parameter.dotDotDotToken !== globalThis.undefined,
  );
  return rest === globalThis.undefined
    ? countRange(required, fixed.length)
    : restArgumentCounts(signature, rest, fixed.length, required);
};

// A conditional return picks the Effect branch from the argument types, so every count is
// ambiguous. `[Arg] extends [Effect<...>] ? Effect<...> : <data-last>` is an Effect exactly when
// the first argument is one (index 0); any other test, such as `fromOption` testing for an
// `Option`, leaves no Effect-typed discriminator.
const conditionalMember = (
  reader: Reader,
  member: string,
  signature: Signature,
  type: ts.ConditionalTypeNode,
): CapturedMember => {
  if (!isEffectType(reader, type.trueType)) {
    return fail(`Effect.${member} has a conditional return whose true branch is not an Effect.`);
  }
  const derivedIndex = type.extendsType.getText(reader.file).startsWith('[Effect<') ? 0 : null;
  const counts = argumentCounts(signature).filter((count) => count > 0);
  return { ambiguous: true, row: [member, counts, counts, derivedIndex] };
};

// The first position typed as an Effect in every Effect overload and in no other overload.
const discriminatorIndex = (
  reader: Reader,
  effectSignatures: readonly Signature[],
  otherSignatures: readonly Signature[],
): number | null => {
  const isEffectAt = (index: number) => (signature: Signature) =>
    isEffectType(reader, signature.parameters[index]?.type);
  const width = Math.max(...effectSignatures.map((signature) => signature.parameters.length));
  const index = Array.from({ length: width }, (_, position) => position).find(
    (position) =>
      effectSignatures.every(isEffectAt(position)) && !otherSignatures.some(isEffectAt(position)),
  );
  return index ?? null;
};

// A member with both Effect and non-Effect overloads: some counts may fit both.
const mixedMember = (
  reader: Reader,
  member: string,
  effectSignatures: readonly Signature[],
  otherSignatures: readonly Signature[],
): CapturedMember => {
  const effectCounts = sortedUnique(effectSignatures.flatMap(argumentCounts));
  const otherCounts = new Set(otherSignatures.flatMap(argumentCounts));
  const ambiguousCounts = effectCounts.filter((count) => otherCounts.has(count));
  const ambiguous = ambiguousCounts.length > 0;
  const derivedIndex = ambiguous
    ? discriminatorIndex(reader, effectSignatures, otherSignatures)
    : null;
  return { ambiguous, row: [member, effectCounts, ambiguousCounts, derivedIndex] };
};

const overloadedMember = (
  reader: Reader,
  member: string,
  signatures: readonly Signature[],
): CapturedMember | null => {
  const effectSignatures = signatures.filter((signature) => isEffectType(reader, signature.type));
  const otherSignatures = signatures.filter((signature) => !isEffectType(reader, signature.type));
  if (effectSignatures.length === 0) {
    return null;
  }
  return otherSignatures.length === 0
    ? { ambiguous: false, row: [member, 'any', [], null] }
    : mixedMember(reader, member, effectSignatures, otherSignatures);
};

const capturedMember = (
  reader: Reader,
  member: string,
  signatures: readonly Signature[],
): CapturedMember | null => {
  const conditionals = signatures.flatMap((signature) =>
    signature.type !== globalThis.undefined && ts.isConditionalTypeNode(signature.type)
      ? [[signature, signature.type] as const]
      : [],
  );
  const [conditional] = conditionals;
  if (conditional === globalThis.undefined) {
    return overloadedMember(reader, member, signatures);
  }
  if (signatures.length > 1) {
    return fail(`Effect.${member} mixes a conditional return with other overloads.`);
  }
  return conditionalMember(reader, member, ...conditional);
};

const hasExportModifier = (statement: ts.VariableStatement): boolean =>
  statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

// Local name -> exported name for `export { local as exported }`, which is how reserved words
// such as `catch` are exported.
const exportAliases = (file: ts.SourceFile): ReadonlyMap<string, string> =>
  new Map(
    file.statements
      .filter(ts.isExportDeclaration)
      .filter((statement) => statement.moduleSpecifier === globalThis.undefined)
      .flatMap((statement) =>
        statement.exportClause !== globalThis.undefined && ts.isNamedExports(statement.exportClause)
          ? statement.exportClause.elements
          : [],
      )
      .map((element) => [(element.propertyName ?? element.name).getText(file), element.name.text]),
  );

const exportedDeclarations = (
  file: ts.SourceFile,
): ReadonlyArray<readonly [string, ts.VariableDeclaration]> => {
  const aliases = exportAliases(file);
  return file.statements.filter(ts.isVariableStatement).flatMap((statement) =>
    statement.declarationList.declarations.flatMap((declaration) => {
      const localName = ts.isIdentifier(declaration.name)
        ? declaration.name.text
        : globalThis.undefined;
      const exported = hasExportModifier(statement) ? localName : aliases.get(localName ?? '');
      return exported === globalThis.undefined ? [] : [[exported, declaration] as const];
    }),
  );
};

const reviewProblems = (
  review: EffectSignatureReview,
  members: readonly CapturedMember[],
): readonly string[] => {
  const ambiguous = members.filter((member) => member.ambiguous);
  const ambiguousNames = new Set(ambiguous.map((member) => member.row[0]));
  const mismatches = ambiguous.flatMap(({ row: [member, , , derivedIndex] }) => {
    const reviewed = review.effectArgumentIndexes.get(member);
    if (reviewed === globalThis.undefined) {
      return [`Effect.${member} has ambiguous counts and no reviewed discriminator.`];
    }
    return reviewed === derivedIndex
      ? []
      : [`Effect.${member} derives discriminator ${derivedIndex} but review says ${reviewed}.`];
  });
  const stale = [...review.effectArgumentIndexes.keys()]
    .filter((member) => !ambiguousNames.has(member))
    .map((member) => `Effect.${member} is reviewed but has no ambiguous count in this source.`);
  return [...mismatches, ...stale];
};

// Reads the `Effect` module's declarations and fails unless every ambiguous member's derived
// discriminator matches the review and every reviewed member is still ambiguous.
export const captureEffectSignatures = (
  fileName: string,
  text: string,
  review: EffectSignatureReview,
): readonly EffectSignatureRow[] => {
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const reader: Reader = { file, review };
  const members = exportedDeclarations(file).flatMap(([member, declaration]) => {
    const captured = capturedMember(reader, member, declaredSignatures(declaration));
    return captured === null ? [] : [captured];
  });
  const problems = reviewProblems(review, members);
  if (problems.length > 0) {
    fail(`Effect signature review failed:\n${problems.join('\n')}`);
  }
  return members
    .map((member) => member.row)
    .toSorted(([left], [right]) => Number(left > right) - Number(left < right));
};

const renderCounts = (counts: 'any' | readonly number[]): string =>
  counts === 'any' ? `'any'` : `[${counts.join(', ')}]`;

const renderRow = ([member, effectCounts, ambiguousCounts, index]: EffectSignatureRow): string =>
  `  ['${member}', ${renderCounts(effectCounts)}, ${renderCounts(ambiguousCounts)}, ${String(index)}],`;

export const renderEffectSignatureModule = (
  version: string,
  rows: readonly EffectSignatureRow[],
): string =>
  [
    '// Generated by `bun scripts/checks/effect-signatures.ts --capture <effect package dir>` from the',
    '// package `dist/Effect.d.ts`, with discriminators confirmed by',
    '// scripts/config/effect-signature-review.ts. Do not edit by hand.',
    '//',
    '// How a call to one `Effect` member produces an Effect:',
    '// - argument counts that fit an Effect-returning overload (`any` when every overload returns one);',
    '// - the subset that also fits a non-Effect overload, such as a dual member data-last form;',
    '// - for those ambiguous counts, the argument whose being an Effect selects the Effect overload.',
    '//   `null` means no verified discriminator, so an ambiguous count proves nothing.',
    '// Runners, `fn`, and predicates return no Effect, so they are absent.',
    `export const effectSignatureSourceVersion = '${version}';`,
    '',
    'export type EffectReturnSignature = readonly [',
    '  member: string,',
    "  effectCounts: 'any' | readonly number[],",
    '  ambiguousCounts: readonly number[],',
    '  effectArgumentIndex: number | null,',
    '];',
    '',
    "/* oxlint-disable no-magic-numbers -- the table's numbers are overload argument counts, not tunable constants. */",
    'export const effectReturnSignatures: readonly EffectReturnSignature[] = [',
    ...rows.map(renderRow),
    '];',
    '/* oxlint-enable no-magic-numbers */',
    '',
  ].join('\n');

const versionPattern = /^export const effectSignatureSourceVersion = '(?<version>[^']+)';$/mu;

export const recordedSignatureVersion = (moduleText: string): string =>
  versionPattern.exec(moduleText)?.groups?.['version'] ??
  fail('The generated Effect signature module does not record its source version.');
