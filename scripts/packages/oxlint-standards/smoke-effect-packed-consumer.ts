#!/usr/bin/env bun
// Default route: both packed tarballs in an isolated consumer with the supported patched oxlint
// pair. The consumer composes the installed full effectPreset and extends the installed overlay,
// so a source-tree import cannot mask a missing export or JSON file.
import { join } from 'node:path';

import {
  type EffectConsumer,
  type EffectRoute,
  boundedSummary,
  ensureBoundedSuccess,
  ensureCompleted,
  layerProvideSource,
  withEffectConsumer,
  wrapperSourcesIn,
} from '../../lib/effect-consumer-harness.ts';
import { packWorkspacePackage } from '../../lib/packed-consumer-harness.ts';
import {
  createTempDir,
  fail,
  isObjectRecord,
  printLine,
  readJsonRecord,
  removeTempDir,
} from '../../lib/script-runtime.ts';
import { effectIntegrationVersions } from '../../lib/tool-versions.ts';
import { assertTsconfigPackedArtifact } from '../tsconfig/artifact-assertions.ts';
import { tsconfigPackageDir } from '../tsconfig/package.ts';
import { assertOxlintDistArtifact, assertOxlintPackedArtifact } from './artifact-assertions.ts';
import {
  type LintDiagnostic,
  assertUnknownPlugin,
  boundaryGlob,
  codesIn,
  customCode,
  expectPresence,
  lint,
  lintDiagnostics,
  severityOf,
  tsgoCode,
} from './effect-consumer-lint.ts';
import { assertRouteProbes, assertVitePlusParity } from './effect-route-probes.ts';
import { buildOxlintStandards, oxlintPackageDir, oxlintPackageName } from './package.ts';

const versions = effectIntegrationVersions();
const escapeSource = `${layerProvideSource}
export const fatal = Effect.orDie(program)
`;
const clockSource = 'export const now = Date.now()\n';
// Providing a service value, not a Layer, is not what strict-effect-provide targets.
const contextProvideSource = `import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

class Config extends Context.Service<Config, { readonly port: number }>()('Config') {}

export const program = Effect.void.pipe(Effect.provideService(Config, Config.of({ port: 1 })))
`;
const inEffectClockSource = `import * as Effect from 'effect/Effect'

export const now = Date.now()

export const read = Effect.gen(function* () {
  const at = Date.now()
  return yield* Effect.succeed(at)
})
`;
const wrapperSources = wrapperSourcesIn('src/wrappers');
const testScopedFiles = [
  'src/provide.test.ts',
  'src/provide-spec.ts',
  'src/__tests__/provide.ts',
  'src/test/provide.ts',
  'src/tests/provide.ts',
];
// A consumer override listed after the preset raises one rule on one path.
const lateGlob = 'src/late/**';

// The consumer writes its own config from the installed package, exactly as a vite or
// .oxlintrc consumer would: the full preset plus a tail override relaxing one boundary path.
const writeConsumerConfig = async (consumer: EffectConsumer): Promise<void> => {
  const script = `
    import { writeFileSync } from 'node:fs';
    import { composeLintConfigs, effectBoundaryRules, effectPreset } from ${JSON.stringify(oxlintPackageName)};

    const config = composeLintConfigs(effectPreset, {
      overrides: [
        { files: [${JSON.stringify(boundaryGlob)}], rules: { ...effectBoundaryRules } },
        { files: [${JSON.stringify(lateGlob)}], rules: { 'effecttsgo/global-date': 'error' } },
      ],
    });
    writeFileSync('.oxlintrc.json', JSON.stringify(config, null, 2) + '\\n');
  `;
  ensureBoundedSuccess(
    await consumer.exec('node', ['--input-type=module', '--eval', script]),
    'write the consumer oxlint config',
  );
};

const writeFixtures = (consumer: EffectConsumer): void => {
  consumer.writeJson('tsconfig.json', {
    extends: ['@mplibunao/tsconfig/base.json', '@mplibunao/tsconfig/effect.json'],
    include: ['src'],
  });
  consumer.writeFile('src/program.ts', escapeSource);
  consumer.writeFile('src/clock.ts', clockSource);
  consumer.writeFile('src/late/clock.ts', clockSource);
  consumer.writeFile('src/context-provide.ts', contextProvideSource);
  consumer.writeFile('src/boundary/clock.ts', inEffectClockSource);
  for (const file of testScopedFiles) {
    consumer.writeFile(file, layerProvideSource);
  }
  for (const [file, text] of Object.entries(wrapperSources)) {
    consumer.writeFile(file, text);
  }
};

// A custom and a delegated diagnostic from one run prove the installed composition wires both.
const assertShippedSeverities = (diagnostics: readonly LintDiagnostic[], label: string): void => {
  for (const [file, code, severity] of [
    ['src/program.ts', tsgoCode('strict-effect-provide'), 'error'],
    ['src/program.ts', customCode('no-effect-escape-hatch'), 'error'],
    ['src/clock.ts', tsgoCode('global-date'), 'warning'],
    ['src/late/clock.ts', tsgoCode('global-date'), 'error'],
    ['src/boundary/clock.ts', tsgoCode('global-date-in-effect'), 'error'],
  ] as const) {
    if (severityOf(diagnostics, file, code) !== severity) {
      fail(
        `${label}: ${file} ${code} is ${severityOf(diagnostics, file, code)}, expected ${severity}.`,
      );
    }
  }
};

const assertShippedBehavior = async (consumer: EffectConsumer): Promise<void> => {
  const result = await lint(consumer, ['--format', 'json', 'src']);
  const label = 'full effectPreset on the patched engine';
  if (result.status !== 1) {
    fail(`${label} must exit 1 on its error diagnostics.\n${boundedSummary(result)}`);
  }
  const diagnostics = lintDiagnostics(result, label);
  assertShippedSeverities(diagnostics, label);
  for (const file of testScopedFiles) {
    expectPresence(
      diagnostics,
      file,
      { [tsgoCode('strict-effect-provide')]: false },
      `${label} test scope`,
    );
  }
  expectPresence(
    diagnostics,
    'src/boundary/clock.ts',
    { [tsgoCode('global-date')]: false },
    `${label} boundary relaxation`,
  );
  expectPresence(
    diagnostics,
    'src/context-provide.ts',
    { [tsgoCode('strict-effect-provide')]: false },
    `${label} Context provision`,
  );
};

const assertWarningExit = async (consumer: EffectConsumer): Promise<void> => {
  const plain = await lint(consumer, ['src/clock.ts']);
  if (plain.status !== 0) {
    fail(`A warning-only file must pass without --max-warnings.\n${boundedSummary(plain)}`);
  }
  const strict = await lint(consumer, ['--max-warnings', '0', 'src/clock.ts']);
  if (strict.status === 0) {
    fail(`A warning-only file must fail with --max-warnings 0.\n${boundedSummary(strict)}`);
  }
};

const missingTsgoWrapperFiles = async (
  consumer: EffectConsumer,
  dir: string,
): Promise<readonly string[]> => {
  const result = await lint(consumer, ['--format', 'json', dir]);
  const diagnostics = lintDiagnostics(result, `wrapper forms in ${dir}`);
  return Object.keys(wrapperSources)
    .map((file) => file.replace('src/wrappers/', `${dir}/`))
    .filter((file) => !codesIn(diagnostics, file).includes(tsgoCode('effect-fn-opportunity')));
};

// tsgolint reads the Effect options from the tsconfig.json nearest each file, not from
// --tsconfig. The control inlines the installed overlay's plugin entry in a tsconfig.json with no
// `extends`, so it proves the engine, Effect types, and effectFn detection independently of how
// the shipped setup inherits those options.
const writeInlineOptionsControl = (consumer: EffectConsumer): void => {
  const installed = (file: string): Record<string, unknown> =>
    readJsonRecord(join(consumer.dir, 'node_modules', '@mplibunao', 'tsconfig', file), file);
  const base = installed('base.json')['compilerOptions'];
  const overlay = installed('effect.json')['compilerOptions'];
  const plugins = isObjectRecord(overlay)
    ? overlay['plugins']
    : fail('effect.json has no plugins.');
  consumer.writeJson('inline-control/tsconfig.json', {
    compilerOptions: { ...(isObjectRecord(base) ? base : {}), plugins },
    include: ['.'],
  });
  for (const [file, text] of Object.entries(wrapperSources)) {
    consumer.writeFile(file.replace('src/wrappers/', 'inline-control/'), text);
  }
};

// Under the shipped setup (a tsconfig.json extending the base config and effect.json), the patched
// engine reads the overlay's effectFn through `extends`, so effect-fn-opportunity reports every
// wrapper shape. prefer-effect-fn stays active beside it on the two plain wrappers; ADR-007 allows
// that overlap, and BP-TD-014 owns whether to drop the custom rule.
const shippedWrapperCodes: Readonly<Record<string, readonly string[]>> = {
  'src/wrappers/declaration.ts': [
    customCode('prefer-effect-fn'),
    tsgoCode('effect-fn-opportunity'),
  ],
  'src/wrappers/parameter.ts': [customCode('prefer-effect-fn'), tsgoCode('effect-fn-opportunity')],
  'src/wrappers/spanned.ts': [tsgoCode('effect-fn-opportunity')],
};
const wrapperRuleCodes = new Set([
  customCode('prefer-effect-fn'),
  tsgoCode('effect-fn-opportunity'),
]);

const assertShippedWrapperSplit = async (consumer: EffectConsumer): Promise<void> => {
  const result = await lint(consumer, ['--format', 'json', 'src/wrappers']);
  const diagnostics = lintDiagnostics(result, 'wrapper forms under the shipped setup');
  for (const [file, expected] of Object.entries(shippedWrapperCodes)) {
    const actual = codesIn(diagnostics, file).filter((code) => wrapperRuleCodes.has(code));
    if (actual.length === 0) {
      fail(
        `${file} reported neither prefer-effect-fn nor effect-fn-opportunity under the shipped setup.`,
      );
    }
    if (actual.toSorted().join() !== [...expected].toSorted().join()) {
      fail(
        `${file} reported [${actual.join(', ')}], expected [${expected.join(', ')}]. A missing effect-fn-opportunity means the patched oxlint engine no longer reads the overlay's effectFn through \`extends\`; a missing prefer-effect-fn means the custom rule stopped reporting a plain wrapper.`,
      );
    }
    printLine(`shipped setup, ${file}: ${actual.toSorted().join(', ')}`);
  }
};

const assertWrapperCoverage = async (consumer: EffectConsumer): Promise<void> => {
  writeInlineOptionsControl(consumer);
  const controlMissing = await missingTsgoWrapperFiles(consumer, 'inline-control');
  if (controlMissing.length > 0) {
    fail(
      `The inline-options control did not report effect-fn-opportunity on ${controlMissing.join(', ')}.`,
    );
  }
  await assertShippedWrapperSplit(consumer);
};

const withRouteConsumer = <T>(
  route: EffectRoute,
  tarballs: readonly string[],
  body: (consumer: EffectConsumer) => Promise<T>,
): Promise<T> =>
  withEffectConsumer(
    { label: `${route} consumer`, route, tarballs, versions },
    async (consumer) => {
      writeFixtures(consumer);
      await writeConsumerConfig(consumer);
      return body(consumer);
    },
  );

const assertUnsupportedTarget = async (tarballs: readonly string[]): Promise<void> =>
  withRouteConsumer('unsupported-oxlint', tarballs, async (consumer) => {
    const patch = ensureCompleted(await consumer.patch(), 'unsupported-target patch');
    if (patch.status === 0 || !`${patch.stdout}\n${patch.stderr}`.includes('Unsupported')) {
      fail(
        `Patching oxlint ${versions.unsupportedOxlint} must be rejected.\n${boundedSummary(patch)}`,
      );
    }
    assertUnknownPlugin(
      await lint(consumer, ['src/clock.ts']),
      `oxlint ${versions.unsupportedOxlint}`,
    );
  });

const assertDefaultRoute = async (tarballs: readonly string[]): Promise<void> =>
  withRouteConsumer('oxlint', tarballs, async (consumer) => {
    assertUnknownPlugin(await lint(consumer, ['src/clock.ts']), 'unpatched supported oxlint');
    ensureBoundedSuccess(await consumer.patch(), 'effect-tsgo patch --no-typescript --oxlint');
    ensureBoundedSuccess(await consumer.patch(), 'repeated effect-tsgo patch');
    await assertShippedBehavior(consumer);
    await assertVitePlusParity(consumer, ['src/program.ts', 'src/clock.ts']);
    await assertWarningExit(consumer);
    await assertWrapperCoverage(consumer);
    await assertRouteProbes(consumer);
  });

const packDestination = createTempDir('backpressure-effect-oxlint-pack-');
try {
  buildOxlintStandards();
  assertOxlintDistArtifact();
  const lintPack = packWorkspacePackage(oxlintPackageDir, packDestination, 'oxlint npm pack');
  assertOxlintPackedArtifact(lintPack.files);
  const tsconfigPack = packWorkspacePackage(
    tsconfigPackageDir,
    packDestination,
    'tsconfig npm pack',
  );
  assertTsconfigPackedArtifact(tsconfigPack.files);
  const tarballs = [lintPack.tarballPath, tsconfigPack.tarballPath];
  await assertUnsupportedTarget(tarballs);
  await assertDefaultRoute(tarballs);
  printLine('oxlint-route Effect packed consumer smoke passed');
} finally {
  removeTempDir(packDestination);
}
