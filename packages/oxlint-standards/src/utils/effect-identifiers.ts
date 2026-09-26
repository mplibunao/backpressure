export const effectNamespaceModuleSpecifiers = ['effect', 'effect/Effect'] as const;

// The v4 Atom UI bindings published from the Effect repository, each built on `effect`.
const effectAtomBindingPackages = new Set([
  '@effect/atom-react',
  '@effect/atom-solid',
  '@effect/atom-vue',
]);

export const isEffectStackModuleSource = (source: string): boolean =>
  effectAtomBindingPackages.has(source) || source === 'effect' || source.startsWith('effect/');

// Every v4 `Schema` decoder and encoder factory: `decode`/`encode`, optionally `Unknown`, then one of
// six result shapes, each taking the schema as its first argument. Transformation constructors such
// as `decodeTo` and predicates such as `is` do not build a parser from a schema argument.
export const schemaCodecFactoryMembers = ['decode', 'encode'].flatMap((direction) =>
  ['', 'Unknown'].flatMap((input) =>
    ['Effect', 'Exit', 'Option', 'Promise', 'Result', 'Sync'].map(
      (result) => `${direction}${input}${result}`,
    ),
  ),
);

// The pinned 4.0.0-rc.115 publishes Atom and Reactivity under `effect/unstable/reactivity`; later
// v4 releases move the same modules to `effect/reactivity`. Each barrel re-exports every module
// as a namespace, and `<barrel>/<Module>` is the namespace subpath.
export const reactivityBarrelSpecifiers = ['effect/reactivity', 'effect/unstable/reactivity'];

export type ReactivityModuleName = 'Atom' | 'Reactivity';

// v4 Atom functions that return an Effect, by the argument count that selects that overload. The
// dual `set`, `update`, and `modify` return a function when called with one argument.
const atomSelfOnly = 1;
const atomSelfAndValue = 2;
export const atomEffectArgumentCounts: ReadonlyMap<string, number> = new Map([
  ['get', atomSelfOnly],
  ['refresh', atomSelfOnly],
  ['set', atomSelfAndValue],
  ['update', atomSelfAndValue],
  ['modify', atomSelfAndValue],
]);

export type EffectNamespaceModuleSpecifier = (typeof effectNamespaceModuleSpecifiers)[number];
