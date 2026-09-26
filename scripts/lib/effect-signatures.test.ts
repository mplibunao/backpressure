import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { effectSignatureReview } from '../config/effect-signature-review.ts';
import {
  captureEffectSignatures,
  recordedSignatureVersion,
  renderEffectSignatureModule,
  type EffectSignatureReview,
} from './effect-signatures.ts';
import { repoRoot } from './script-runtime.ts';
import { effectIntegrationVersions } from './tool-versions.ts';

// Declaration shapes copied from the published `dist/Effect.d.ts` layouts, trimmed to what the
// capture reads.
const declarations = `
export declare const succeed: <A>(value: A) => Effect<A>;
export declare const all: <const Arg>(arg: Arg) => All.Return<Arg>;
export declare const map: {
  <A, B>(f: (a: A) => B): <E, R>(self: Effect<A, E, R>) => Effect<B, E, R>;
  <A, E, R, B>(self: Effect<A, E, R>, f: (a: A) => B): Effect<B, E, R>;
};
export declare const provide: (<L>(layer: L, options?: Options) => <A>(self: Effect<A>) => Effect<A>) &
  (<A, L>(self: Effect<A>, layer: L, options?: Options) => Effect<A>);
export declare const zip: {
  <A2>(that: Effect<A2>, options?: Options): <A>(self: Effect<A>) => Effect<[A, A2]>;
  <A, A2>(self: Effect<A>, that: Effect<A2>, options?: Options): Effect<[A, A2]>;
};
export declare const forkChild: <Arg extends Effect<any> | Options | undefined = Options>(
  effectOrOptions?: Arg,
  options?: Options,
) => [Arg] extends [Effect<infer A>] ? Effect<Fiber<A>> : <A>(self: Effect<A>) => Effect<Fiber<A>>;
export declare const fromOption: <Arg, Rest extends [] | [onNone: LazyArg<unknown> | undefined] = []>(
  arg: Arg,
  ...rest: Rest
) => [Arg] extends [Option<infer A>] ? Effect<A> : <A>(option: Option<A>) => Effect<A>;
export declare const runPromise: <A>(effect: Effect<A>) => Promise<A>;
export declare const never: Effect<never>;
declare const catch_: {
  <E, B>(f: (e: E) => Effect<B>): <A>(self: Effect<A, E>) => Effect<A | B>;
  <A, E, B>(self: Effect<A, E>, f: (e: E) => Effect<B>): Effect<A | B>;
};
export { catch_ as catch };
`;

const review = (
  indexes: ReadonlyArray<readonly [string, number | null]>,
): EffectSignatureReview => ({
  effectArgumentIndexes: new Map(indexes),
  effectTypeNames: effectSignatureReview.effectTypeNames,
});

const reviewed = review([
  ['forkChild', 0],
  ['fromOption', null],
  ['provide', 0],
  ['zip', 1],
]);

const capture = (text: string, decisions: EffectSignatureReview) =>
  captureEffectSignatures('Effect.d.ts', text, decisions);

describe('Effect signature capture', () => {
  it('derives counts, ambiguity, and reviewed discriminators from each declaration layout', () => {
    expect(capture(declarations, reviewed)).toEqual([
      ['all', 'any', [], null],
      ['catch', [2], [], null],
      ['forkChild', [1, 2], [1, 2], 0],
      ['fromOption', [1, 2], [1, 2], null],
      ['map', [2], [], null],
      ['provide', [2, 3], [2], 0],
      ['succeed', 'any', [], null],
      ['zip', [2, 3], [2], 1],
    ]);
  });

  it('fails when an ambiguous member has no reviewed discriminator', () => {
    expect(() =>
      capture(
        declarations,
        review([
          ['forkChild', 0],
          ['fromOption', null],
          ['provide', 0],
        ]),
      ),
    ).toThrow('Effect.zip has ambiguous counts and no reviewed discriminator.');
  });

  it('fails when a derived discriminator disagrees with the review', () => {
    expect(() =>
      capture(
        declarations,
        review([...reviewed.effectArgumentIndexes].map(([member]) => [member, 0])),
      ),
    ).toThrow('Effect.zip derives discriminator 1 but review says 0.');
  });

  it('fails when a reviewed member is no longer ambiguous', () => {
    expect(() =>
      capture(declarations, review([...reviewed.effectArgumentIndexes, ['map', 0]])),
    ).toThrow('Effect.map is reviewed but has no ambiguous count in this source.');
  });

  it('fails on a conditional return it cannot classify', () => {
    const unclassified =
      'export declare const odd: <A>(a: A) => A extends string ? number : Effect<A>;';
    expect(() => capture(unclassified, review([]))).toThrow(
      'Effect.odd has a conditional return whose true branch is not an Effect.',
    );
  });

  it('records the source version in the rendered module', () => {
    const module = renderEffectSignatureModule('9.9.9-rc.1', [['succeed', 'any', [], null]]);
    expect(recordedSignatureVersion(module)).toBe('9.9.9-rc.1');
    expect(module).toContain("  ['succeed', 'any', [], null],");
    expect(() => recordedSignatureVersion('export const other = 1;')).toThrow(
      'does not record its source version',
    );
  });

  it('keeps the committed table on the pinned Effect version', () => {
    const table = readFileSync(
      join(repoRoot, 'packages', 'oxlint-standards', 'src', 'generated', 'effect-signatures.ts'),
      'utf8',
    );
    expect(recordedSignatureVersion(table)).toBe(effectIntegrationVersions().effect);
  });
});
