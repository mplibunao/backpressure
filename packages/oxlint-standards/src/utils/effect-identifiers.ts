export const effectNamespaceModuleSpecifiers = ['effect', 'effect/Effect'] as const;

export const effectValueMappingMembers = ['as'] as const;

export const isEffectStackModuleSource = (source: string): boolean =>
  source === '@effect-atom/atom-react' || source === 'effect' || source.startsWith('effect/');

export const schemaCompilerMembers = [
  'is',
  'asserts',
  'decodeEffect',
  'decodeExit',
  'decodeOption',
  'decodePromise',
  'decodeSync',
  'decodeUnknownEffect',
  'decodeUnknownExit',
  'decodeUnknownOption',
  'decodeUnknownPromise',
  'decodeUnknownSync',
  'encodeEffect',
  'encodeExit',
  'encodeOption',
  'encodePromise',
  'encodeSync',
  'encodeUnknownEffect',
  'encodeUnknownExit',
  'encodeUnknownOption',
  'encodeUnknownPromise',
  'encodeUnknownSync',
] as const;

export type EffectNamespaceModuleSpecifier = (typeof effectNamespaceModuleSpecifiers)[number];
