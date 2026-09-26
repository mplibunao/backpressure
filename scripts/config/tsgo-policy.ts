// The single authored grading policy for the delegated @effect/tsgo rules. Generation projects it
// into the lint package's rule rows and both tsconfig overlays; nothing else restates a severity.
// Grading follows ADR-004 (severity by the kind of problem) and ADR-007 (delegation to tsgo).
// Upstream category is provenance; rationaleClass is the governing local classification.

import type { TsgoPolicy } from '../lib/effect-policy.ts';

// Mirrors the escape-hatch test-file convention (`[.-](test|spec)` plus test directories).
// Brace-free globs are used because tsgo's tsconfig override matcher does not expand braces.
const testFileSuffixes = ['.test', '.spec', '-test', '-spec'];
const scriptExtensions = ['cjs', 'cts', 'js', 'jsx', 'mjs', 'mts', 'ts', 'tsx'];
const testDirectories = ['__tests__', 'test', 'tests'];

const refactoringHint = {
  category: 'antipattern',
  rationaleClass: 'style',
  reason: 'Refactoring hint rather than a hidden failure path; quieter under ADR-004.',
  severity: 'warn',
} as const;

const genFirstError = {
  category: 'style',
  rationaleClass: 'agent-failure-mode',
  severity: 'error',
} as const;

const inEffectGlobal = {
  category: 'effect-native',
  rationaleClass: 'correctness',
  reason:
    'An ambient global inside Effect code bypasses the Effect service, which breaks determinism and testing.',
  severity: 'error',
} as const;

const styleOff = { category: 'style', rationaleClass: 'style', severity: 'off' } as const;

export const tsgoPolicy = {
  pinnedVersion: '0.46.1',
  // A tsgo bump that adds, removes, or re-categorizes rules fails generation until re-triaged.
  expectedCategoryCounts: { antipattern: 20, correctness: 21, 'effect-native': 22, style: 53 },
  categoryDefaults: {
    antipattern: {
      rationaleClass: 'correctness',
      reason: 'Hides a failure path or breaks a scope.',
      severity: 'error',
    },
    correctness: {
      rationaleClass: 'correctness',
      reason: 'Wrong, unsafe, or structurally invalid Effect code.',
      severity: 'error',
    },
    'effect-native': {
      rationaleClass: 'style',
      reason: 'Prefer the Effect-native module; quieter outside Effect code under ADR-004.',
      severity: 'warn',
    },
    style: {
      rationaleClass: 'style',
      reason: 'Style or simplification hint; quieter under ADR-004.',
      severity: 'warn',
    },
  },
  exceptions: {
    'duplicate-package': {
      category: 'correctness',
      rationaleClass: 'correctness',
      reason:
        'Install-state problem rather than a code defect, so it stays at warn under a narrowly scoped quiet-critical exception.',
      severity: 'warn',
    },
    'return-effect-in-gen': refactoringHint,
    'catch-unfailable-effect': refactoringHint,
    'effect-fn-iife': refactoringHint,
    'effect-gen-uses-adapter': refactoringHint,
    'lazy-effect': refactoringHint,
    'prefer-unsafe-constructor': refactoringHint,
    'schema-sync-in-effect': refactoringHint,
    'effect-fn-opportunity': {
      ...genFirstError,
      reason:
        'Gen-first policy: reusable generator functions use Effect.fn; ships at error beside the overlapping custom prefer-effect-fn.',
    },
    'nested-effect-gen-yield': {
      ...genFirstError,
      reason:
        'Nested Effect.gen is typical agent output; replaces the custom no-nested-effect-gen at its error floor.',
    },
    'effect-do-notation': {
      ...genFirstError,
      reason:
        'Gen-first policy over do-notation; replaces the custom no-effect-do at its error floor.',
    },
    'unnecessary-fail-yieldable-error': {
      ...genFirstError,
      reason:
        'Yield tagged errors directly; replaces the custom prefer-yield-tagged-error at its error floor.',
    },
    'catch-die-to-or-die': {
      ...styleOff,
      reason: 'Its fix rewrites to Effect.orDie, which no-effect-escape-hatch bans.',
    },
    'strict-boolean-expressions': {
      ...styleOff,
      reason: 'Stack-neutral; the general preset owns it through the native oxlint rule.',
    },
    'missing-effect-service-dependency': {
      ...styleOff,
      reason: 'Effect v3 only; kept explicit so category activation cannot revive it.',
    },
    'deterministic-keys': {
      ...styleOff,
      reason: 'Needs project-specific key conventions that this package does not ship.',
    },
    'global-date-in-effect': inEffectGlobal,
    'global-random-in-effect': inEffectGlobal,
    'crypto-random-uuid-in-effect': inEffectGlobal,
    'global-console-in-effect': inEffectGlobal,
    'global-timers-in-effect': inEffectGlobal,
    'process-env-in-effect': inEffectGlobal,
    'instance-of-schema': {
      category: 'effect-native',
      rationaleClass: 'correctness',
      reason: 'instanceof checks on Schema values bypass decoding and give wrong answers.',
      severity: 'error',
    },
  },
  conditional: {
    // Ships off until the app audit shows the hits are few and each one improves the code.
    'prefer-schema-over-json': {
      category: 'effect-native',
      measurementSeverity: 'warn',
      rationaleClass: 'style',
      reason:
        'Measured on t3code and executor (docs/reports/effect-v4-app-audit-2026-09-25.md): executor reports 313 hits against a limit of 98, and only 2 of 321 reviewed sites improve with Schema; the rest serialize on purpose (request bodies, logs, cache keys, CLI output, test fixtures).',
      severity: 'off',
    },
  },
  commonPluginOptions: {
    barrelImportPackages: [],
    effectFn: ['span', 'inferred-span', 'suggested-span'],
    namespaceImportPackages: ['effect'],
    pipeableMinArgCount: 2,
  },
  oxlintRouteDiagnostics: false,
  testFilePatterns: [
    ...testFileSuffixes.flatMap((suffix) =>
      scriptExtensions.map((extension) => `**/*${suffix}.${extension}`),
    ),
    ...testDirectories.map((directory) => `**/${directory}/**/*`),
  ],
  testFileOverrides: { 'strict-effect-provide': 'off' },
  // Outside-Effect siblings that a consumer relaxes at explicit boundary paths; no *-in-effect rule.
  boundaryRules: [
    'async-function',
    'new-promise',
    'node-builtin-import',
    'global-console',
    'global-date',
    'global-fetch',
    'global-random',
    'global-timers',
    'crypto-random-uuid',
    'process-env',
  ],
} as const satisfies TsgoPolicy;
