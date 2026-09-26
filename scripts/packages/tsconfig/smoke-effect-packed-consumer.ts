#!/usr/bin/env bun
// Fallback route: the packed tsconfig tarball in an isolated consumer whose TypeScript 7.0.2 is
// patched by @effect/tsgo. The consumer's tsconfig is the README example, copied verbatim.
import {
  type BoundedResult,
  type EffectConsumer,
  boundedSummary,
  ensureBoundedSuccess,
  ensureCompleted,
  layerProvideSource,
  withEffectConsumer,
} from '../../lib/effect-consumer-harness.ts';
import { packWorkspacePackage } from '../../lib/packed-consumer-harness.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  createTempDir,
  fail,
  isObjectRecord,
  printLine,
  removeTempDir,
} from '../../lib/script-runtime.ts';
import { canonicalVersions, effectIntegrationVersions } from '../../lib/tool-versions.ts';
import { assertTsconfigPackedArtifact } from './artifact-assertions.ts';
import { tsconfigPackageDir } from './package.ts';
import { readmeTscOverrideEntry, readmeTscOverrideSnippet } from './readme-snippets.ts';

const versions = effectIntegrationVersions();
const effectCompilerOptions = { plugins: [readmeTscOverrideEntry()] };

const clockSource = 'export const now = Date.now()\n';
const cleanSource = 'export const answer: number = 42\n';
const wrapperBody = `  Effect.gen(function* () {
    const value = yield* Effect.succeed(n)
    return value + 1
  })`;
// effect-fn-opportunity reports a wrapper only when an enabled effectFn fix variant applies to it.
// Upstream's default, ['span'], covers only the Effect.withSpan form; the overlay's inferred and
// suggested spans cover the other two.
const wrapperSources = {
  'wrappers/declaration.ts': `import * as Effect from 'effect/Effect'\n\nexport function addOne(n: number) {\n  return${wrapperBody.slice(1)}\n}\n`,
  'wrappers/parameter.ts': `import * as Effect from 'effect/Effect'\n\nexport const addOne = (n: number) =>\n${wrapperBody}\n`,
  'wrappers/spanned.ts': `import * as Effect from 'effect/Effect'\n\nexport const addOne = (n: number) =>\n${wrapperBody}.pipe(Effect.withSpan('addOne'))\n`,
};
const testScopedFiles = [
  'provide.test.ts',
  'provide-spec.ts',
  '__tests__/provide.ts',
  'test/provide.ts',
  'tests/provide.ts',
];

interface TscDiagnostic {
  readonly code: string;
  readonly file: string;
  readonly severity: string;
}

// `src/program.ts(9,24): error TS377032: ... effect(strictEffectProvide)`.
const tscDiagnosticPattern =
  /^(?<file>\S+?)\(\d+,\d+\): (?<severity>error|warning|message) TS\d+: .*effect\((?<code>\w+)\)$/u;

const effectDiagnostics = (result: BoundedResult): readonly TscDiagnostic[] =>
  `${result.stdout}\n${result.stderr}`.split('\n').flatMap((line) => {
    const groups = tscDiagnosticPattern.exec(line.trim())?.groups;
    return groups === globalThis.undefined
      ? []
      : [
          {
            code: groups['code'] ?? '',
            file: groups['file'] ?? '',
            severity: groups['severity'] ?? '',
          },
        ];
  });

const codesIn = (diagnostics: readonly TscDiagnostic[], file: string): readonly string[] =>
  diagnostics.filter((diagnostic) => diagnostic.file === file).map((diagnostic) => diagnostic.code);

const expectCodes = (
  diagnostics: readonly TscDiagnostic[],
  file: string,
  expected: readonly string[],
  label: string,
): void => {
  const actual = codesIn(diagnostics, file).toSorted();
  if (actual.join() !== [...expected].toSorted().join()) {
    fail(`${label}: ${file} reported [${actual.join(', ')}], expected [${expected.join(', ')}].`);
  }
};

const tsc = async (consumer: EffectConsumer, project: string): Promise<BoundedResult> =>
  ensureCompleted(await consumer.exec('pnpm', ['exec', 'tsc', '-p', project]), `tsc -p ${project}`);

const writeProject = (
  consumer: EffectConsumer,
  dir: string,
  tsconfig: unknown,
  files: Readonly<Record<string, string>>,
): string => {
  consumer.writeJson(`${dir}/tsconfig.json`, tsconfig);
  for (const [file, text] of Object.entries(files)) {
    consumer.writeFile(`${dir}/src/${file}`, text);
  }
  return `${dir}/tsconfig.json`;
};

const readmeProjectFiles = {
  'clock.ts': clockSource,
  'program.ts': layerProvideSource,
  'server.ts': 'export const bunVersion: string = Bun.version\n',
  ...wrapperSources,
  ...Object.fromEntries(testScopedFiles.map((file) => [file, layerProvideSource])),
};

const assertUnpatchedIsSilent = async (consumer: EffectConsumer): Promise<void> => {
  const version = ensureBoundedSuccess(
    await consumer.exec('pnpm', ['exec', 'tsc', '--version']),
    'unpatched tsc --version',
  );
  if (version.stdout.includes('effect-tsgo')) {
    fail(`Unpatched TypeScript already reports a patched version: ${version.stdout.trim()}`);
  }
  const project = writeProject(consumer, 'unpatched', readmeTscOverrideSnippet(), {
    'program.ts': layerProvideSource,
  });
  const result = await tsc(consumer, project);
  // An unpatched tsc ignores the plugin entirely, which is why the README tells consumers to
  // check `tsc --version` after patching.
  if (result.status !== 0 || effectDiagnostics(result).length > 0) {
    fail(`Unpatched tsc should typecheck without Effect diagnostics.\n${boundedSummary(result)}`);
  }
};

const patchTwice = async (consumer: EffectConsumer): Promise<void> => {
  ensureBoundedSuccess(await consumer.patch(), 'effect-tsgo patch');
  ensureBoundedSuccess(await consumer.patch(), 'repeated effect-tsgo patch');
  const version = ensureBoundedSuccess(
    await consumer.exec('pnpm', ['exec', 'tsc', '--version']),
    'patched tsc --version',
  );
  if (!version.stdout.includes(`+effect-tsgo.${versions.effectTsgo}`)) {
    fail(
      `Patched tsc --version did not name effect-tsgo ${versions.effectTsgo}: ${version.stdout.trim()}`,
    );
  }
};

const assertReadmeSeverities = (diagnostics: readonly TscDiagnostic[], label: string): void => {
  const severities = new Map(
    diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.severity]),
  );
  if (
    severities.get('strictEffectProvide') !== 'error' ||
    severities.get('globalDate') !== 'warning'
  ) {
    fail(`${label} lost the overlay severities: ${JSON.stringify([...severities])}`);
  }
};

const assertReadmeScopes = (diagnostics: readonly TscDiagnostic[], label: string): void => {
  expectCodes(diagnostics, 'readme/src/program.ts', ['strictEffectProvide'], label);
  expectCodes(diagnostics, 'readme/src/clock.ts', ['globalDate'], label);
  for (const file of testScopedFiles) {
    expectCodes(diagnostics, `readme/src/${file}`, [], label);
  }
  // Inherited effectFn: all three wrapper forms report, not only the upstream-default spanned one.
  for (const file of Object.keys(wrapperSources)) {
    expectCodes(diagnostics, `readme/src/${file}`, ['effectFnOpportunity'], label);
  }
  expectCodes(diagnostics, 'readme/src/server.ts', [], label);
};

const assertReadmeProject = async (consumer: EffectConsumer): Promise<void> => {
  const project = writeProject(consumer, 'readme', readmeTscOverrideSnippet(), readmeProjectFiles);
  const result = await tsc(consumer, project);
  if (result.status === 0) {
    fail(`The README project must fail typecheck on its Effect error.\n${boundedSummary(result)}`);
  }
  const label = 'README tsc project';
  assertReadmeScopes(effectDiagnostics(result), label);
  assertReadmeSeverities(effectDiagnostics(result), label);
  if (result.stdout.includes('error TS2') || result.stdout.includes('error TS1')) {
    fail(
      `${label} reported TypeScript errors, so the environment was not preserved.\n${boundedSummary(result)}`,
    );
  }
};

const assertExitBehavior = async (consumer: EffectConsumer): Promise<void> => {
  const warningOnly = await tsc(
    consumer,
    writeProject(consumer, 'warning-only', readmeTscOverrideSnippet(), { 'clock.ts': clockSource }),
  );
  // Every compiler diagnostic in any category, with or without a file location, Effect or not, so
  // an ordinary TypeScript error cannot supply the nonzero exit the Effect warning alone must cause.
  const compilerDiagnostics = `${warningOnly.stdout}\n${warningOnly.stderr}`
    .split('\n')
    .filter((line) => /\b(?:error|warning|message|suggestion) TS\d+:/u.test(line));
  const [onlyDiagnostic] = effectDiagnostics(warningOnly);
  if (
    warningOnly.status === 0 ||
    compilerDiagnostics.length !== 1 ||
    onlyDiagnostic?.file !== 'warning-only/src/clock.ts' ||
    onlyDiagnostic.code !== 'globalDate' ||
    onlyDiagnostic.severity !== 'warning'
  ) {
    fail(
      `A warning-only project must fail typecheck on exactly its globalDate warning.\n${boundedSummary(warningOnly)}`,
    );
  }
  const browser = await tsc(
    consumer,
    writeProject(
      consumer,
      'browser',
      {
        extends: ['@mplibunao/tsconfig/browser.json', '@mplibunao/tsconfig/effect-tsc.json'],
        compilerOptions: effectCompilerOptions,
        include: ['src'],
      },
      { 'clean.ts': cleanSource, 'dom.ts': "export const main = document.createElement('main')\n" },
    ),
  );
  ensureBoundedSuccess(browser, 'clean browser project extending effect-tsc.json');
};

const readmeEntryRecord = (): Record<string, unknown> => {
  const entry = readmeTscOverrideEntry();
  return isObjectRecord(entry) ? entry : fail('The tsconfig README has no Effect override entry.');
};

const shownOptions = async (
  consumer: EffectConsumer,
  project: string,
): Promise<Record<string, unknown>> => {
  const shown = ensureBoundedSuccess(
    await consumer.exec('pnpm', ['exec', 'tsc', '--showConfig', '-p', project]),
    `tsc --showConfig -p ${project}`,
  );
  const parsed: unknown = JSON.parse(shown.stdout);
  const options = isObjectRecord(parsed) ? parsed['compilerOptions'] : globalThis.undefined;
  return isObjectRecord(options) ? options : fail(`${project} showed no compilerOptions.`);
};

// The overlay is options-only, so extending an environment config first and the overlay last keeps
// that environment's lib, JSX, and types settings.
const assertEnvironmentPreserved = async (consumer: EffectConsumer): Promise<void> => {
  const server = await shownOptions(consumer, 'readme/tsconfig.json');
  const browser = await shownOptions(consumer, 'browser/tsconfig.json');
  const lib = (options: Record<string, unknown>): string =>
    Array.isArray(options['lib']) ? options['lib'].join(',').toLowerCase() : '';
  if (JSON.stringify(server['types']) !== JSON.stringify(['bun-types'])) {
    fail(`The server composition lost its Bun types: ${JSON.stringify(server['types'])}`);
  }
  if (browser['jsx'] !== 'react-jsx' || !lib(browser).includes('dom')) {
    fail(
      `The browser composition lost its JSX or DOM settings: jsx ${String(browser['jsx'])}, lib ${lib(browser)}`,
    );
  }
};

// The tsc route is a typecheck, not a second linter: this consumer installs no oxlint at all.
const assertNoOxlintRoute = (consumer: EffectConsumer): void => {
  if (existsSync(join(consumer.dir, 'node_modules', '.bin', 'oxlint'))) {
    fail('The tsc-route consumer must not install an oxlint reporting route.');
  }
};

// effectFn decides which wrapper shapes effect-fn-opportunity reports. A consumer entry restoring
// the upstream default, ['span'], leaves only the Effect.withSpan wrapper; the overlay's three
// variants, inherited through `extends`, report all three (asserted on the README project).
const assertEffectFnSensitivity = async (consumer: EffectConsumer): Promise<void> => {
  const defaults = effectDiagnostics(
    await tsc(
      consumer,
      writeProject(
        consumer,
        'fn-default',
        {
          extends: ['@mplibunao/tsconfig/base.json', '@mplibunao/tsconfig/effect-tsc.json'],
          compilerOptions: {
            plugins: [{ ...readmeEntryRecord(), effectFn: ['span'] }],
          },
          include: ['src'],
        },
        wrapperSources,
      ),
    ),
  );
  expectCodes(defaults, 'fn-default/src/wrappers/declaration.ts', [], 'default effectFn');
  expectCodes(defaults, 'fn-default/src/wrappers/parameter.ts', [], 'default effectFn');
  expectCodes(
    defaults,
    'fn-default/src/wrappers/spanned.ts',
    ['effectFnOpportunity'],
    'default effectFn',
  );
};

// Without the consumer entry, the overlay's severities apply but test files still report,
// because tsgo resolves an extended config's override globs from that config's own folder.
const assertOverlayScopeControls = async (consumer: EffectConsumer): Promise<void> => {
  const overlayOnly = effectDiagnostics(
    await tsc(
      consumer,
      writeProject(
        consumer,
        'overlay-only',
        {
          extends: ['@mplibunao/tsconfig/base.json', '@mplibunao/tsconfig/effect-tsc.json'],
          include: ['src'],
        },
        { 'program.ts': layerProvideSource, 'provide.test.ts': layerProvideSource },
      ),
    ),
  );
  expectCodes(
    overlayOnly,
    'overlay-only/src/provide.test.ts',
    ['strictEffectProvide'],
    'overlay-only control',
  );

  const otherPlugins = effectDiagnostics(
    await tsc(
      consumer,
      writeProject(
        consumer,
        'other-plugins',
        {
          extends: ['@mplibunao/tsconfig/base.json', '@mplibunao/tsconfig/effect-tsc.json'],
          compilerOptions: { plugins: [{ name: 'unrelated-typescript-plugin' }] },
          include: ['src'],
        },
        { 'program.ts': layerProvideSource },
      ),
    ),
  );
  // tsgo's merge hook carries the overlay's Effect entry across `extends`, so a consumer plugins
  // array that names only another plugin keeps the overlay's Effect settings.
  expectCodes(
    otherPlugins,
    'other-plugins/src/program.ts',
    ['strictEffectProvide'],
    'plugin array without an Effect entry',
  );

  consumer.writeJson('monorepo/tsconfig.effect.json', {
    extends: ['@mplibunao/tsconfig/base.json', '@mplibunao/tsconfig/effect-tsc.json'],
    compilerOptions: effectCompilerOptions,
  });
  const nested = effectDiagnostics(
    await tsc(
      consumer,
      writeProject(
        consumer,
        'monorepo/packages/app',
        { extends: '../../tsconfig.effect.json', include: ['src'] },
        { 'program.ts': layerProvideSource, 'program.test.ts': layerProvideSource },
      ),
    ),
  );
  expectCodes(
    nested,
    'monorepo/packages/app/src/program.ts',
    ['strictEffectProvide'],
    'shared monorepo entry',
  );
  expectCodes(nested, 'monorepo/packages/app/src/program.test.ts', [], 'shared monorepo entry');
};

const packDestination = createTempDir('backpressure-tsconfig-effect-pack-');
try {
  const packed = packWorkspacePackage(tsconfigPackageDir, packDestination, 'tsconfig npm pack');
  assertTsconfigPackedArtifact(packed.files);
  await withEffectConsumer(
    {
      label: 'tsc-route consumer',
      route: 'tsc',
      // server.json names bun-types, and the README example extends server.json.
      tarballs: [packed.tarballPath, `bun-types@${canonicalVersions().bun}`],
      versions,
    },
    async (consumer) => {
      await assertUnpatchedIsSilent(consumer);
      await patchTwice(consumer);
      await assertReadmeProject(consumer);
      await assertExitBehavior(consumer);
      await assertEnvironmentPreserved(consumer);
      await assertEffectFnSensitivity(consumer);
      await assertOverlayScopeControls(consumer);
      assertNoOxlintRoute(consumer);
    },
  );
  printLine('tsc-route Effect packed consumer smoke passed');
} finally {
  removeTempDir(packDestination);
}
