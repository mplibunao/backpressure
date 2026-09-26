import { describe, expect, it, vi } from 'vitest';

import {
  type KnownRules,
  canaryProblems,
  countsByRule,
  diagnosticProblems,
  nativeDiagnosticCodes,
  effectVersionInTsgoRange,
  isTestPath,
  parseAuditArgs,
  parseLintReport,
  selectAuditFiles,
  spanIdentities,
  typedCanaryCode,
  uncoveredFiles,
} from './effect-app-audit.ts';

vi.setConfig({ testTimeout: 1000 });

const baseArgs = [
  '--mode',
  'candidate',
  '--output',
  '/tmp/audit',
  '--app',
  't3code=/src/t3code@53456bc01',
];

const report = (diagnostics: ReadonlyArray<Record<string, unknown>>, numberOfFiles = 2): string =>
  JSON.stringify({ diagnostics, number_of_files: numberOfFiles, number_of_rules: 40 });

const diagnostic = (code: string, filename: string, line = 3): Record<string, unknown> => ({
  code,
  filename,
  labels: [{ span: { column: 7, line, offset: 10, length: 4 } }],
  severity: 'warning',
});

describe('parseAuditArgs()', () => {
  it('reads explicit apps, revisions, tsconfigs, and exclusions', () => {
    expect(
      parseAuditArgs([
        ...baseArgs,
        '--app',
        'executor=/src/executor@480b390ee',
        '--tsconfig',
        'executor=tsconfig.base.json',
        '--exclude',
        'vendor/',
        '--timeout-minutes',
        '45',
      ]),
    ).toStrictEqual({
      allowDirty: false,
      apps: [
        { name: 't3code', path: '/src/t3code', revision: '53456bc01', tsconfig: 'tsconfig.json' },
        {
          name: 'executor',
          path: '/src/executor',
          revision: '480b390ee',
          tsconfig: 'tsconfig.base.json',
        },
      ],
      excludes: ['node_modules/', 'dist/', 'vendor/'],
      mode: 'candidate',
      output: '/tmp/audit',
      timeoutMinutes: 45,
    });
  });

  it('rejects incomplete or ambiguous input with a usable reason', () => {
    expect(() => parseAuditArgs(['--mode', 'ast', '--output', '/tmp/a'])).toThrow(
      'Name each app once',
    );
    expect(() => parseAuditArgs([...baseArgs, '--app', 't3code=/other@53456bc01'])).toThrow(
      'Name each app once',
    );
    expect(() =>
      parseAuditArgs(['--mode', 'ast', '--output', '/tmp/a', '--app', 't3code=/src']),
    ).toThrow('--app must be <name>=<path>@<revision>');
    expect(() =>
      parseAuditArgs(baseArgs.filter((arg) => arg !== '--output' && arg !== '/tmp/audit')),
    ).toThrow('--output is required');
    expect(() => parseAuditArgs([...baseArgs, '--mode', 'everything'])).toThrow(
      '--mode must be one of',
    );
    expect(() => parseAuditArgs([...baseArgs, '--tsconfig', 'other=tsconfig.json'])).toThrow(
      'names no --app',
    );
    expect(() => parseAuditArgs([...baseArgs, '--timeout-minutes', '0'])).toThrow(
      'positive integer',
    );
    expect(() => parseAuditArgs([...baseArgs, '--clone'])).toThrow('Unknown argument --clone');
    expect(() => parseAuditArgs([...baseArgs, '--exclude'])).toThrow('--exclude needs a value');
  });
});

describe('selectAuditFiles()', () => {
  it('keeps lintable tracked sources and records what the policy ignored', () => {
    expect(
      selectAuditFiles(
        [
          'apps/web/src/main.tsx',
          'apps/web/src/env.d.ts',
          'packages/core/dist/index.js',
          'packages/core/node_modules/x/index.ts',
          'packages/core/vendor/lib.ts',
          'packages/core/src/index.mts',
          'README.md',
        ],
        ['node_modules/', 'dist/', 'vendor/'],
      ),
    ).toStrictEqual({
      ignored: [
        'apps/web/src/env.d.ts',
        'packages/core/dist/index.js',
        'packages/core/node_modules/x/index.ts',
        'packages/core/vendor/lib.ts',
      ],
      selected: ['apps/web/src/main.tsx', 'packages/core/src/index.mts'],
    });
  });

  it('classifies test files by the policy convention', () => {
    expect(['a.test.ts', 'a-spec.tsx', 'src/__tests__/a.ts', 'tests/a.ts'].every(isTestPath)).toBe(
      true,
    );
    expect(['src/testing.ts', 'src/contest.ts', 'src/attest/a.ts'].some(isTestPath)).toBe(false);
  });
});

describe('parseLintReport()', () => {
  it('reads diagnostics with their first span', () => {
    expect(
      parseLintReport(report([diagnostic('effecttsgo(global-date)', 'src/a.ts')])),
    ).toStrictEqual({
      diagnostics: [
        {
          code: 'effecttsgo(global-date)',
          column: 7,
          filename: 'src/a.ts',
          line: 3,
          message: '',
          severity: 'warning',
        },
      ],
      numberOfFiles: 2,
      numberOfRules: 40,
    });
  });

  it('fails on truncated output or a startup error instead of reporting zero diagnostics', () => {
    const full = report([diagnostic('effecttsgo(global-date)', 'src/a.ts')]);
    expect(() => parseLintReport(full.slice(0, full.length / 2))).toThrow(
      'did not print complete JSON',
    );
    expect(() =>
      parseLintReport("Failed to parse configuration file: Unknown plugin: 'effecttsgo'"),
    ).toThrow('did not print complete JSON');
    expect(() => parseLintReport(JSON.stringify({ diagnostics: [], number_of_rules: 1 }))).toThrow(
      'numeric number_of_files',
    );
  });
});

describe('aggregation', () => {
  const diagnostics = parseLintReport(
    report([
      diagnostic('effecttsgo(missed-pipeable-opportunity)', 'src/a.ts', 9),
      diagnostic('effecttsgo(missed-pipeable-opportunity)', 'src/a.test.ts', 2),
      diagnostic('effecttsgo(global-date)', 'src/b.ts'),
    ]),
  ).diagnostics;

  it('splits counts into source and test files per rule', () => {
    expect(countsByRule(diagnostics)).toStrictEqual({
      'effecttsgo(global-date)': { source: 1, test: 0 },
      'effecttsgo(missed-pipeable-opportunity)': { source: 1, test: 1 },
    });
  });

  it('records rule, file, and span identities only for the evaluated rules', () => {
    expect(spanIdentities(diagnostics, ['effecttsgo(missed-pipeable-opportunity)'])).toStrictEqual([
      'effecttsgo(missed-pipeable-opportunity) src/a.test.ts:2:7',
      'effecttsgo(missed-pipeable-opportunity) src/a.ts:9:7',
    ]);
  });
});

describe('diagnosticProblems()', () => {
  const known: KnownRules = {
    custom: new Set(['no-try-catch']),
    customPlugin: '@mplibunao/oxlint-standards',
    nativeCodes: nativeDiagnosticCodes([
      { scope: 'eslint', value: 'no-debugger' },
      { scope: 'jsx_a11y', value: 'alt-text' },
    ]),
    tsgo: new Set(['global-date', 'strict-effect-provide']),
  };
  const parsed = (diagnostics: ReadonlyArray<Record<string, unknown>>) =>
    parseLintReport(report(diagnostics)).diagnostics;

  it('accepts enabled custom, pinned tsgo, and native engine codes', () => {
    expect(
      diagnosticProblems(
        parsed([
          diagnostic('@mplibunao/oxlint-standards(no-try-catch)', 'src/a.ts'),
          diagnostic('effecttsgo(global-date)', 'src/a.ts'),
          diagnostic('eslint(no-debugger)', 'src/a.ts'),
          diagnostic('eslint-plugin-jsx-a11y(alt-text)', 'src/a.tsx'),
        ]),
        known,
      ),
    ).toStrictEqual([]);
  });

  it('checks a native plugin and rule together', () => {
    expect(
      diagnosticProblems(
        parsed([
          diagnostic('bogus(no-debugger)', 'src/a.ts'),
          diagnostic('eslint-plugin-jsx-a11y(no-debugger)', 'src/b.ts'),
          diagnostic('no-debugger', 'src/c.ts'),
        ]),
        known,
      ),
    ).toStrictEqual([
      'unknown diagnostic code bogus(no-debugger) in src/a.ts',
      'unknown diagnostic code eslint-plugin-jsx-a11y(no-debugger) in src/b.ts',
      'unknown diagnostic code no-debugger in src/c.ts',
    ]);
  });

  it('stops on a rule scope it cannot map', () => {
    expect(() =>
      nativeDiagnosticCodes([{ scope: 'react_hooks', value: 'rules-of-hooks' }]),
    ).toThrow('oxlint reports rule scope react_hooks');
  });

  it('rejects a code outside the known catalogs', () => {
    expect(
      diagnosticProblems(
        parsed([
          diagnostic('effecttsgo(no-such-rule)', 'src/a.ts'),
          diagnostic('@mplibunao/oxlint-standards(no-effect-as)', 'src/b.ts'),
        ]),
        known,
      ),
    ).toStrictEqual([
      'unknown diagnostic code effecttsgo(no-such-rule) in src/a.ts',
      'unknown diagnostic code @mplibunao/oxlint-standards(no-effect-as) in src/b.ts',
    ]);
  });

  it('treats a codeless engine error as a failure even beside valid delegated diagnostics', () => {
    expect(
      diagnosticProblems(
        parsed([
          diagnostic('effecttsgo(global-date)', 'src/a.ts'),
          { filename: 'src/bad.ts', message: 'Unexpected token', severity: 'error' },
        ]),
        known,
      ),
    ).toStrictEqual(['engine error in src/bad.ts: Unexpected token']);
  });
});

describe('uncoveredFiles()', () => {
  it('lists the selected files the TypeScript project does not include', () => {
    const listed = [
      '/lib/lib.es2022.d.ts',
      '/real/app/src/a.ts',
      '/real/app/src/nested/b.tsx',
      '',
    ].join('\n');
    expect(
      uncoveredFiles(listed, '/real/app', ['src/a.ts', 'src/nested/b.tsx', 'scripts/c.ts']),
    ).toStrictEqual(['scripts/c.ts']);
    expect(uncoveredFiles('/lib/lib.es2022.d.ts\n', '/real/app', ['src/a.ts'])).toStrictEqual([
      'src/a.ts',
    ]);
  });
});

describe('canaryProblems()', () => {
  const canaryFile = '/tmp/audit/canary/effect-canary.ts';
  const typed = parseLintReport(
    report(
      [diagnostic('effecttsgo(global-date)', 'src/a.ts'), diagnostic(typedCanaryCode, canaryFile)],
      3,
    ),
  );
  const untyped = parseLintReport(
    report([diagnostic('@mplibunao/oxlint-standards(no-try-catch)', 'src/a.ts')]),
  );

  it('accepts a pass that linted every selected file and the type-resolved canary', () => {
    expect(canaryProblems(typed, 2, canaryFile)).toStrictEqual([]);
    expect(canaryProblems(untyped, 2, globalThis.undefined)).toStrictEqual([]);
  });

  it('marks the evidence unusable on a file-count mismatch or zero files', () => {
    expect(canaryProblems(typed, 3, canaryFile)).toStrictEqual([
      'the engine linted 3 files, but 4 were expected',
    ]);
    expect(canaryProblems(parseLintReport(report([], 0)), 0, globalThis.undefined)).toStrictEqual([
      'no files were selected',
    ]);
  });

  it('refuses a typed pass whose canary reports only type-free rules', () => {
    const typesUnresolved = parseLintReport(
      report(
        [
          diagnostic('effecttsgo(global-date)', 'src/a.ts'),
          diagnostic('effecttsgo(global-date)', canaryFile),
        ],
        3,
      ),
    );
    expect(canaryProblems(typesUnresolved, 2, canaryFile)).toStrictEqual([
      `the typed canary did not report ${typedCanaryCode}, so Effect types did not resolve and the typed pass is not evidence`,
    ]);
  });
});

describe('effectVersionInTsgoRange()', () => {
  it('places each app against the pinned tsgo development range', () => {
    expect(effectVersionInTsgoRange('4.0.0-beta.59')).toBe(false);
    expect(effectVersionInTsgoRange('4.0.0-beta.107')).toBe(true);
    expect(effectVersionInTsgoRange('4.0.0-rc.115')).toBe(true);
    expect(effectVersionInTsgoRange('4.1.0')).toBe(true);
    expect(effectVersionInTsgoRange('3.19.0')).toBe(false);
  });
});
