/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */

/*
 * Static/equivalent-data files: identity-only behavior (plugin metadata, message
 * strings, manifest shape) that mutation testing classifies as equivalent survivors.
 * Excluded from the default behavioral publish-gate score. See STRYKER_SWEEP below.
 *
 * no-effect-as-message.ts is a single message-string constant; same reason as
 * rule-messages.ts — tests reference the same source constant, so string mutations
 * are invisible. Historical evidence lives in docs/references/mutation-sweep-v0-2026-05-31.md.
 */
const DEFAULT_BEHAVIORAL_EXCLUSIONS = [
  '!packages/oxlint-standards/src/rule-manifest.ts',
  '!packages/oxlint-standards/src/rule-messages.ts',
  '!packages/oxlint-standards/src/plugin.ts',
  '!packages/oxlint-standards/src/rules/effect/no-effect-as-message.ts',
];

/*
 * Always excluded: re-exports, test files, manifest selection (generated shape),
 * and build-time utilities. These are excluded in all modes including STRYKER_SWEEP.
 * utils/reports.ts is build-time-only support, not rule behavior. See
 * docs/references/mutation-testing.md for exclusion policy; the dated sweep report
 * keeps historical per-file evidence.
 */
const UNIVERSAL_MUTATION_EXCLUSIONS = [
  '!packages/oxlint-standards/src/**/*.test.ts',
  '!packages/oxlint-standards/src/**/index.ts',
  '!packages/oxlint-standards/src/rule-manifest-selection.ts',
  '!packages/oxlint-standards/src/utils/reports.ts',
];

/*
 * Mutate target resolution (precedence order):
 *   STRYKER_MUTATE=<path>  → single-file worker loop (set by mutation-worker skill)
 *   STRYKER_SWEEP=1        → full source sweep including static/equivalent files
 *   (default)              → behavioral gate only (pure-function rule logic + helpers)
 *
 * The default is the publish-gate score. STRYKER_SWEEP is for investigation only.
 */
const SOURCE_MUTATION_GLOB = 'packages/oxlint-standards/src/**/*.ts';

const resolveMutate = () => {
  if ('STRYKER_MUTATE' in process.env && process.env.STRYKER_MUTATE !== '') {
    return [process.env.STRYKER_MUTATE];
  }
  if (process.env.STRYKER_SWEEP === '1') {
    return [SOURCE_MUTATION_GLOB, ...UNIVERSAL_MUTATION_EXCLUSIONS];
  }
  return [
    SOURCE_MUTATION_GLOB,
    ...UNIVERSAL_MUTATION_EXCLUSIONS,
    ...DEFAULT_BEHAVIORAL_EXCLUSIONS,
  ];
};

const mutate = resolveMutate();

const config = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate,

  coverageAnalysis: 'perTest',
  checkers: [],
  concurrency: 2,

  thresholds: {
    high: 80,
    low: 70,
    /*
     * Null means Stryker never fails on score. The orchestrator skill decides
     * when to stop. Mutation testing is a quality gate run by agents, not CI.
     */
    break: null,
  },

  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/report.json',
  },
};

export default config;
