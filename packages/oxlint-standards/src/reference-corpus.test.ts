// Reference-corpus contract: minimal excerpts of the Effect v4 reference material, each run through
// every enabled custom Effect and effect-react rule. A rule must report nothing on a variant unless
// that variant names the rule as a deliberate house deviation with an exact count and the decision
// that owns it. An unexpected hit fails; it is never added to the deviation list to make a run pass.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it, vi } from 'vitest';

import type { Rule } from '@oxlint/plugins';

import { effectReactPreset } from './presets/effect-react.js';
import { effectPreset } from './presets/effect.js';
import { catalogRules } from './rule-catalog.js';
import { ruleMessage } from './rule-messages.js';

vi.setConfig({ testTimeout: 5000 });
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' }, sourceType: 'module' },
});

const corpusRoot = join(process.cwd(), 'test-fixtures', 'effect-v4');
const packagePrefix = '@mplibunao/oxlint-standards/';
const variantKinds = ['adapted', 'derived-control', 'misuse', 'provenance-only', 'raw'] as const;
type VariantKind = (typeof variantKinds)[number];

interface Deviation {
  readonly count: number;
  readonly decision: string;
}

interface CorpusVariant {
  readonly deviations?: Readonly<Record<string, Deviation>>;
  // `oxlint` marks a variant whose adaptation is an inline disable. RuleTester renames the rule under
  // test, so only the real-engine corpus replay in `fixture:replay` can honor the directive.
  readonly engine?: 'oxlint';
  readonly file: string;
  readonly harnessChanges: string;
  readonly kind: VariantKind;
  readonly lintFilename?: string;
  readonly reason?: string;
  readonly sha256?: string;
}

interface CorpusCase {
  readonly excerpts: ReadonlyArray<{
    readonly lines: ReadonlyArray<readonly [number, number]>;
    readonly path: string;
  }>;
  readonly id: string;
  readonly intendedValid: readonly string[];
  readonly source: string;
  readonly title: string;
  readonly variants: readonly CorpusVariant[];
}

interface Corpus {
  readonly cases: readonly CorpusCase[];
  readonly schemaVersion: 1;
  readonly sources: Readonly<
    Record<
      string,
      { readonly repository: string; readonly revision: string; readonly version: string }
    >
  >;
}

// Every provenance-register row in the build plan with the variant roles it must keep: the raw
// excerpt, an adapted copy where the raw source needs an import-only or house-style adaptation, and
// derived controls plus misuse variants where the source is library provenance. A case that loses a
// role, or all of its variants, fails here instead of silently shrinking coverage.
const registerCaseRoles: Readonly<Record<string, readonly VariantKind[]>> = {
  'ef-atom-registry': ['derived-control', 'misuse', 'provenance-only'],
  'ef-cause-map-string-fail': ['adapted', 'raw'],
  'ef-compiler-registry': ['provenance-only'],
  'ef-effect-as-const': ['adapted', 'raw'],
  'ef-metric-fork-nested-gen': ['adapted', 'raw'],
  'ef-option-nullish': ['derived-control', 'misuse', 'provenance-only'],
  'ef-rcref-sync-resource': ['raw'],
  'ef-reason-errors': ['adapted', 'raw'],
  'es-basics-as-timeout': ['adapted', 'raw'],
  'es-basics-nested-fn': ['adapted', 'raw'],
  'es-basics-schedule-pipe': ['adapted', 'raw'],
  'es-cli-nested-helpers': ['adapted', 'raw'],
  'es-data-modeling-json': ['adapted', 'raw'],
  'es-error-app-entry-ordie': ['adapted', 'raw'],
  'es-error-catchtag': ['adapted', 'raw'],
  'es-error-catchtags': ['adapted', 'raw'],
  'es-services-typed-handler': ['adapted', 'raw'],
  'llms-fn-untraced': ['adapted', 'raw'],
  'llms-gen-error-return': ['adapted', 'raw'],
  'llms-service-interface': ['adapted', 'raw'],
};

// The JSON is authored alongside the retained snippets; the metadata tests below validate every field
// this cast relies on before any rule runs.
const corpus = JSON.parse(readFileSync(join(corpusRoot, 'corpus.json'), 'utf8')) as Corpus;

const enabledCorpusRules = [effectPreset.rules, effectReactPreset.rules].flatMap((rules) =>
  Object.entries(rules)
    .filter(([name, severity]) => name.startsWith(packagePrefix) && severity !== 'off')
    .map(([name]) => name.slice(packagePrefix.length)),
);

const requireRule = (name: string): Rule =>
  catalogRules[name] ?? expect.fail(`Corpus rule ${name} is not in the runtime catalog.`);

const snippetText = (variant: CorpusVariant): string =>
  readFileSync(join(corpusRoot, variant.file), 'utf8');

const lintedVariants = corpus.cases.flatMap((corpusCase) =>
  corpusCase.variants
    .filter((variant) => variant.kind !== 'provenance-only')
    .map((variant) => ({ corpusCase, variant })),
);
const ruleTesterVariants = lintedVariants.filter(({ variant }) => variant.engine !== 'oxlint');

const variantLabel = (caseId: string, variant: CorpusVariant): string =>
  `${caseId}/${variant.kind}`;

const roleProblems = (cases: readonly CorpusCase[]): readonly string[] => [
  ...Object.keys(registerCaseRoles)
    .filter((id) => !cases.some((corpusCase) => corpusCase.id === id))
    .map((id) => `${id} is missing`),
  ...cases.flatMap(({ id, variants }) => {
    const expected = registerCaseRoles[id];
    const actual = variants.map((variant) => variant.kind).toSorted();
    if (expected === globalThis.undefined) {
      return [`${id} is not a provenance-register case`];
    }
    const barrelOnlyRaw = variants.some(
      (variant) =>
        variant.kind === 'raw' && variant.deviations?.['no-barrel-import'] !== globalThis.undefined,
    );
    return [
      ...(actual.join() === [...expected].toSorted().join()
        ? []
        : [`${id} has variants [${actual.join(', ')}], expected [${expected.join(', ')}]`]),
      ...(barrelOnlyRaw && !actual.includes('adapted')
        ? [`${id} deviates on barrel imports but has no adapted copy`]
        : []),
    ];
  }),
];

const sourceProblems = (): readonly string[] => [
  ...Object.entries(corpus.sources).flatMap(([key, source]) =>
    source.repository.startsWith('https://github.com/') &&
    /^[0-9a-f]{40}$/u.test(source.revision) &&
    source.version !== ''
      ? []
      : [`source ${key} needs a GitHub repository, a full revision, and a version`],
  ),
  ...corpus.cases.flatMap(({ excerpts, id, intendedValid, source }) => [
    ...(source in corpus.sources ? [] : [`${id} names unknown source ${source}`]),
    ...(excerpts.length > 0 && intendedValid.length > 0
      ? []
      : [`${id} needs an excerpt and an intended valid behavior`]),
    ...excerpts
      .filter(({ lines }) => !lines.every(([start, end]) => start > 0 && end >= start))
      .map(({ path }) => `${id} has an invalid line range for ${path}`),
  ]),
];

const digestOf = (variant: CorpusVariant): string =>
  createHash('sha256').update(snippetText(variant)).digest('hex');

const variantProblems = (id: string, variant: CorpusVariant): readonly string[] => {
  const label = variantLabel(id, variant);
  const retained = variant.kind === 'provenance-only' || variant.kind === 'raw';
  return [
    ...(variantKinds.includes(variant.kind) ? [] : [`${label} has an unknown kind`]),
    ...(existsSync(join(corpusRoot, variant.file)) ? [] : [`${label} file is missing`]),
    ...(variant.harnessChanges === '' ? [`${label} does not state its harness changes`] : []),
    ...(retained && variant.sha256 === globalThis.undefined ? [`${label} has no checksum`] : []),
    ...(variant.sha256 === globalThis.undefined || digestOf(variant) === variant.sha256
      ? []
      : [`${label} was edited after capture`]),
  ];
};

type LintedVariant = (typeof lintedVariants)[number];

const deviationProblems = (variants: readonly LintedVariant[]): readonly string[] =>
  variants.flatMap(({ corpusCase, variant }) => {
    const label = variantLabel(corpusCase.id, variant);
    const filename = /\.tsx?$/u.test(variant.lintFilename ?? '') ? [] : [`${label} lint filename`];
    return [
      ...filename,
      ...Object.entries(variant.deviations ?? {}).flatMap(([rule, deviation]) =>
        enabledCorpusRules.includes(rule) &&
        Number.isInteger(deviation.count) &&
        deviation.count > 0 &&
        deviation.decision !== ''
          ? []
          : [`${label} deviation ${rule} needs an enabled rule, a positive count, and a decision`],
      ),
    ];
  });

describe('reference corpus metadata', () => {
  it('keeps every provenance-register case with its required variant roles', () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(roleProblems(corpus.cases)).toStrictEqual([]);
  });

  it('fails when a case keeps its id but loses its variants or its adapted copy', () => {
    const emptied = corpus.cases.map((corpusCase) =>
      corpusCase.id === 'llms-gen-error-return' ? { ...corpusCase, variants: [] } : corpusCase,
    );
    expect(roleProblems(emptied)).toStrictEqual([
      'llms-gen-error-return has variants [], expected [adapted, raw]',
    ]);
    const unadapted = corpus.cases.map((corpusCase) =>
      corpusCase.id === 'llms-fn-untraced'
        ? {
            ...corpusCase,
            variants: corpusCase.variants.filter((variant) => variant.kind === 'raw'),
          }
        : corpusCase,
    );
    expect(roleProblems(unadapted)).toStrictEqual([
      'llms-fn-untraced has variants [raw], expected [adapted, raw]',
      'llms-fn-untraced deviates on barrel imports but has no adapted copy',
    ]);
  });

  it('records a pinned source revision, excerpt ranges, and intended behaviors for every case', () => {
    expect(sourceProblems()).toStrictEqual([]);
  });

  it('describes every variant and keeps retained excerpts byte-identical', () => {
    expect(
      corpus.cases.flatMap(({ id, variants }) =>
        variants.flatMap((variant) => variantProblems(id, variant)),
      ),
    ).toStrictEqual([]);
  });

  it('names only enabled rules, with exact counts and an owning decision, in each deviation', () => {
    expect(deviationProblems(lintedVariants)).toStrictEqual([]);
  });

  it('fails the metadata checks on an unknown rule, a zero count, or an edited excerpt', () => {
    const [sample] = lintedVariants;
    if (sample === globalThis.undefined) {
      throw new Error('The corpus has no linted variant.');
    }
    const withDeviation = (rule: string, count: number): LintedVariant => ({
      ...sample,
      variant: { ...sample.variant, deviations: { [rule]: { count, decision: 'test decision' } } },
    });
    const label = variantLabel(sample.corpusCase.id, sample.variant);
    expect(deviationProblems([withDeviation('no-effect-as', 1)])).toStrictEqual([
      `${label} deviation no-effect-as needs an enabled rule, a positive count, and a decision`,
    ]);
    expect(deviationProblems([withDeviation('no-barrel-import', 0)])).toStrictEqual([
      `${label} deviation no-barrel-import needs an enabled rule, a positive count, and a decision`,
    ]);
    expect(
      variantProblems(sample.corpusCase.id, { ...sample.variant, sha256: '0'.repeat(64) }),
    ).toContain(`${label} was edited after capture`);
  });

  it('routes to the real engine only the variants that rely on an inline disable', () => {
    const realEngineOnly = lintedVariants.filter(({ variant }) => variant.engine === 'oxlint');
    expect(realEngineOnly.length).toBeGreaterThan(0);
    expect(
      realEngineOnly
        .filter(
          ({ variant }) =>
            !/oxlint-disable-next-line @mplibunao\/oxlint-standards\/[\w-]+ -- \S/u.test(
              snippetText(variant),
            ),
        )
        .map(({ corpusCase, variant }) => variantLabel(corpusCase.id, variant)),
    ).toStrictEqual([]);
  });

  it('gives provenance-only excerpts a reason and never a deviation', () => {
    const provenanceOnly = corpus.cases.flatMap(({ variants }) =>
      variants.filter((variant) => variant.kind === 'provenance-only'),
    );
    expect(provenanceOnly.length).toBeGreaterThan(0);
    expect(
      provenanceOnly.filter(
        (variant) =>
          !/\S/u.test(variant.reason ?? '') || variant.deviations !== globalThis.undefined,
      ),
    ).toStrictEqual([]);
  });

  it('keeps the null and undefined distinction in the Option rule message', () => {
    const message = ruleMessage('no-fromnullable-nullish-coalesce');
    expect(message).toContain('Option.fromNullishOr(value)');
    expect(message).toContain('fromUndefinedOr treat null as absent');
    expect(message).toContain('only if null is impossible or a real value');
  });
});

// One RuleTester run per rule: variants without a deviation for the rule are valid (zero reports);
// the rest must report exactly the recorded count.
describe('reference corpus against every enabled Effect rule', () => {
  for (const ruleName of enabledCorpusRules) {
    const cases = ruleTesterVariants.map(({ corpusCase, variant }) => ({
      code: snippetText(variant),
      count: variant.deviations?.[ruleName]?.count ?? 0,
      filename: variant.lintFilename ?? 'src/subject.ts',
      name: variantLabel(corpusCase.id, variant),
    }));
    ruleTester.run(ruleName, requireRule(ruleName), {
      invalid: cases
        .filter(({ count }) => count > 0)
        .map(({ code, count, filename, name }) => ({ code, errors: count, filename, name })),
      valid: cases
        .filter(({ count }) => count === 0)
        .map(({ code, filename, name }) => ({ code, filename, name })),
    });
  }
});
