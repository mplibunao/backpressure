export const effectNamespaceModuleSpecifiers = ['effect', 'effect/Effect'] as const;

export const effectValueMappingMembers = ['as'] as const;

export type EffectNamespaceModuleSpecifier = (typeof effectNamespaceModuleSpecifiers)[number];
